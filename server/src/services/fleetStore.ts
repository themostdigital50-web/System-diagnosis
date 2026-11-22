import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import type { DeviceCommand, DeviceRecord, DeviceReport, DeviceStatus, DeviceSummary } from '../types';

interface FleetFile {
  version: 1;
  devices: Record<string, DeviceRecord>;
}

const FILE_NAME = 'fleet.json';
const MAX_SAMPLES = 600;
const MAX_COMMANDS = 24;

let data: FleetFile = { version: 1, devices: {} };
let writable = true;
let writeQueue: Promise<void> = Promise.resolve();

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Disk failures are reported instead of silently dropping device reports. */
export function storageOk(): boolean {
  return writable;
}

export async function initFleetStore(): Promise<void> {
  const file = path.join(config.dataDir, FILE_NAME);
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as FleetFile;
    if (parsed?.version === 1 && parsed.devices && typeof parsed.devices === 'object') {
      data = { version: 1, devices: parsed.devices };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[SystemScope] Could not read the fleet store:', error instanceof Error ? error.message : error);
    }
  }

  // Probe the actual directory rather than trusting its mode bits: containers
  // and Render disks can mount a volume with a different owner.
  try {
    const probe = path.join(config.dataDir, `.write-test-${process.pid}`);
    await fs.writeFile(probe, 'ok', { mode: 0o600 });
    await fs.unlink(probe);
  } catch (error) {
    writable = false;
    console.warn('[SystemScope] Fleet storage is read-only; device reports will not survive a restart.', error instanceof Error ? error.message : error);
  }
}

function persist(): Promise<void> {
  if (!writable) return Promise.resolve();
  const file = path.join(config.dataDir, FILE_NAME);
  const tmp = `${file}.${process.pid}.tmp`;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    try {
      await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
      await fs.rename(tmp, file);
    } catch (error) {
      writable = false;
      console.warn('[SystemScope] Fleet store write failed:', error instanceof Error ? error.message : error);
    }
  });
  return writeQueue;
}

function statusFor(record: DeviceRecord, now = Date.now()): DeviceStatus {
  if (!record.lastSeenAt) return 'offline';
  const age = now - new Date(record.lastSeenAt).getTime();
  if (!Number.isFinite(age) || age < 0) return 'offline';
  return age <= config.deviceStaleMs ? 'online' : 'stale';
}

function summarize(record: DeviceRecord, now: number): DeviceSummary {
  const system = record.report?.system;
  return {
    id: record.id,
    label: record.label,
    platform: record.report?.platform ?? null,
    osName: system && system.os.name.status === 'ok' ? (system.os.name.value as string) : null,
    hostname: system?.os.hostname ?? null,
    cpuModel: system && system.cpu.model.status === 'ok' ? (system.cpu.model.value as string) : null,
    createdAt: record.createdAt,
    lastSeenAt: record.lastSeenAt,
    status: statusFor(record, now),
  };
}

export function listDevices(): DeviceSummary[] {
  const now = Date.now();
  return Object.values(data.devices)
    .sort((a, b) => (b.lastSeenAt ?? b.createdAt).localeCompare(a.lastSeenAt ?? a.createdAt))
    .map((record) => summarize(record, now));
}

export function getDevice(id: string): DeviceRecord | undefined {
  return data.devices[id];
}

export function getDeviceSummary(id: string): DeviceSummary | undefined {
  const record = data.devices[id];
  return record ? summarize(record, Date.now()) : undefined;
}

export function findDeviceByToken(token: string): DeviceRecord | undefined {
  const hash = hashToken(token);
  return Object.values(data.devices).find((record) => record.tokenHash === hash);
}

export async function createDevice(label: string): Promise<{ device: DeviceRecord; token: string }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const record: DeviceRecord = {
    id: crypto.randomUUID(),
    label,
    tokenHash: hashToken(token),
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
    report: null,
    commands: [],
  };
  data.devices[record.id] = record;
  await persist();
  return { device: record, token };
}

export async function renameDevice(id: string, label: string): Promise<DeviceRecord | undefined> {
  const record = data.devices[id];
  if (!record) return undefined;
  record.label = label;
  await persist();
  return record;
}

export async function deleteDevice(id: string): Promise<boolean> {
  if (!data.devices[id]) return false;
  delete data.devices[id];
  await persist();
  return true;
}

export async function saveReport(id: string, report: DeviceReport): Promise<DeviceRecord | undefined> {
  const record = data.devices[id];
  if (!record) return undefined;
  record.report = {
    ...report,
    metrics: { ...report.metrics, history: report.metrics.history.slice(-MAX_SAMPLES) },
  };
  record.lastSeenAt = new Date().toISOString();
  await persist();
  return record;
}

export async function queueCommand(
  id: string,
  tool: string,
  params: Record<string, unknown>,
): Promise<DeviceCommand | undefined> {
  const record = data.devices[id];
  if (!record) return undefined;
  const now = Date.now();
  const command: DeviceCommand = {
    id: crypto.randomUUID(),
    tool,
    params,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + config.deviceCommandTtlMs).toISOString(),
  };
  record.commands.push(command);
  record.commands = record.commands.slice(-MAX_COMMANDS);
  await persist();
  return command;
}

export function getCommand(id: string, commandId: string): DeviceCommand | undefined {
  const command = data.devices[id]?.commands.find((item) => item.id === commandId);
  if (!command) return undefined;
  // Expiry is time-based, so an offline agent must not leave a command
  // appearing "pending" forever to the viewer polling for a result.
  if (
    (command.status === 'pending' || command.status === 'running') &&
    new Date(command.expiresAt).getTime() < Date.now()
  ) {
    return { ...command, status: 'expired' };
  }
  return command;
}

export async function takePendingCommands(id: string): Promise<DeviceCommand[]> {
  const record = data.devices[id];
  if (!record) return [];
  const now = Date.now();
  const taken: DeviceCommand[] = [];
  for (const command of record.commands) {
    if (command.status !== 'pending') continue;
    if (new Date(command.expiresAt).getTime() < now) {
      command.status = 'expired';
      continue;
    }
    command.status = 'running';
    taken.push(command);
  }
  if (taken.length > 0 || record.commands.some((command) => command.status === 'expired')) await persist();
  return taken;
}

export async function completeCommand(
  id: string,
  commandId: string,
  outcome: { result?: unknown; error?: string },
): Promise<DeviceCommand | undefined> {
  // Use the stored record directly: getCommand() may return an expired copy.
  const command = data.devices[id]?.commands.find((item) => item.id === commandId);
  if (!command) return undefined;
  command.status = outcome.error ? 'error' : 'done';
  command.completedAt = new Date().toISOString();
  if (outcome.error) command.error = outcome.error.slice(0, 2000);
  else command.result = outcome.result ?? null;
  await persist();
  return command;
}
