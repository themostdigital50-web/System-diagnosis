/**
 * SystemScope device agent.
 *
 * Runs on a Windows or Linux computer, reads that computer's real OS data with
 * the same collectors as the local server, and reports it to the dashboard.
 * No browser can do this — which is why the deployed dashboard alone always
 * showed the server's Linux container.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config';
import { parseOrThrow } from '../lib/validate';
import { pingInputSchema, dnsInputSchema, traceInputSchema, httpInputSchema, portInputSchema, speedInputSchema } from '../lib/diagnosticSchemas';
import { stopSampler, startSampler, getMetrics } from '../services/metrics';
import { getNetworkInfo } from '../services/networkInfo';
import { getSystemInfo } from '../services/systemInfo';
import { checkHttp } from '../services/diagnostics/http';
import { lookupDns } from '../services/diagnostics/dns';
import { pingHost } from '../services/diagnostics/ping';
import { checkPort } from '../services/diagnostics/port';
import { traceHost } from '../services/diagnostics/traceroute';
import { runSpeedTest } from '../services/speedtest';
import type { DeviceCommand, DeviceReport } from '../types';

const AGENT_VERSION = '1.0.0';

export interface AgentConfig {
  serverUrl: string;
  deviceId: string;
  deviceToken: string;
  label: string;
  intervalMs: number;
}

function configDir(): string {
  if (os.platform() === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'SystemScopeAgent');
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'systemscope-agent');
}

function configFile(): string {
  return path.join(configDir(), 'config.json');
}

async function readConfig(): Promise<AgentConfig> {
  const parsed = JSON.parse(await fs.readFile(configFile(), 'utf8')) as Partial<AgentConfig>;
  if (!parsed.serverUrl || !parsed.deviceId || !parsed.deviceToken) {
    throw new Error('Agent config is incomplete. Run the setup command again.');
  }
  return {
    serverUrl: parsed.serverUrl.replace(/\/+$/, ''),
    deviceId: parsed.deviceId,
    deviceToken: parsed.deviceToken,
    label: parsed.label ?? 'This computer',
    intervalMs: typeof parsed.intervalMs === 'number' ? parsed.intervalMs : 30_000,
  };
}

function endpoint(serverUrl: string, apiPath: string): string {
  return new URL(`/api${apiPath}`, serverUrl).toString();
}

interface ApiEnvelope<T> {
  ok?: boolean;
  data?: T;
  error?: { message?: string };
}

async function callApi<T>(
  cfg: AgentConfig,
  apiPath: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(endpoint(cfg.serverUrl, apiPath), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.deviceToken}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(40_000),
  });
  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error(`Server returned an invalid response (HTTP ${response.status})`);
  }
  if (!response.ok || !payload?.ok || payload.data === undefined) {
    throw new Error(payload?.error?.message ?? `Request failed (HTTP ${response.status})`);
  }
  return payload.data;
}

async function collectReport(): Promise<DeviceReport> {
  const [system, network] = await Promise.all([getSystemInfo(), getNetworkInfo()]);
  const metrics = getMetrics();
  return {
    agentVersion: AGENT_VERSION,
    platform: os.platform() === 'win32' ? 'win32' : 'linux',
    system,
    network,
    metrics: {
      sample: metrics.sample,
      history: metrics.history,
      intervalMs: metrics.intervalMs,
      collectedAt: new Date().toISOString(),
    },
  };
}

async function executeCommand(command: DeviceCommand): Promise<unknown> {
  const params = command.params as Record<string, unknown>;
  switch (command.tool) {
    case 'ping':
    case 'latency': {
      const input = parseOrThrow(pingInputSchema, params);
      return pingHost(input.host, input.count, input.timeoutMs);
    }
    case 'dns': {
      const input = parseOrThrow(dnsInputSchema, params);
      return lookupDns(input.host, input.type);
    }
    case 'traceroute': {
      const input = parseOrThrow(traceInputSchema, params);
      return traceHost(input.host, input.maxHops, input.timeoutMs);
    }
    case 'http': {
      const input = parseOrThrow(httpInputSchema, params);
      return checkHttp(input.url, input.timeoutMs);
    }
    case 'port': {
      const input = parseOrThrow(portInputSchema, params);
      return checkPort(input.host, input.port, input.timeoutMs);
    }
    case 'speedtest': {
      const input = parseOrThrow(speedInputSchema, params);
      return runSpeedTest(input.direction, input.bytes);
    }
    default:
      throw new Error(`Unsupported command: ${command.tool}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function heartbeat(cfg: AgentConfig): Promise<void> {
  const report = await collectReport();
  await callApi(cfg, '/agent/report', { method: 'POST', body: JSON.stringify({ report }) });

  const { commands } = await callApi<{ commands: DeviceCommand[] }>(cfg, '/agent/commands');
  for (const command of commands) {
    try {
      const result = await executeCommand(command);
      await callApi(cfg, '/agent/command/result', {
        method: 'POST',
        body: JSON.stringify({ commandId: command.id, result }),
      });
      console.log(`[SystemScope] Completed ${command.tool} for ${cfg.label}`);
    } catch (error) {
      await callApi(cfg, '/agent/command/result', {
        method: 'POST',
        body: JSON.stringify({ commandId: command.id, error: errorMessage(error).slice(0, 2000) }),
      }).catch(() => undefined);
      console.error(`[SystemScope] ${command.tool} failed:`, errorMessage(error));
    }
  }
}

async function setup(args: string[]): Promise<void> {
  const [serverUrl, deviceId, deviceToken, label, intervalRaw] = args;
  if (!serverUrl || !deviceId || !deviceToken) {
    throw new Error(
      'Usage: setup <serverUrl> <deviceId> <deviceToken> [label] [intervalMs]\n' +
        'Example: node agent.js setup https://my-app.onrender.com 7c6… 9xQ… "Office PC" 30000',
    );
  }
  let url: URL;
  try {
    url = new URL(serverUrl);
  } catch {
    throw new Error('serverUrl must be an absolute URL, for example https://my-app.onrender.com');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Use HTTPS for a remote dashboard. Plain HTTP is only allowed for localhost.');
  }
  const intervalMs = intervalRaw ? Number(intervalRaw) : 30_000;
  if (!Number.isFinite(intervalMs) || intervalMs < 5_000 || intervalMs > 3_600_000) {
    throw new Error('intervalMs must be between 5000 and 3600000');
  }
  const cfg: AgentConfig = {
    serverUrl: url.toString().replace(/\/+$/, ''),
    deviceId,
    deviceToken,
    label: label || os.hostname(),
    intervalMs,
  };
  await fs.mkdir(configDir(), { recursive: true });
  await fs.writeFile(configFile(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
  console.log(`[SystemScope] Saved agent config to ${configFile()}`);
  console.log(`[SystemScope] Device "${cfg.label}" reports every ${intervalMs} ms to ${cfg.serverUrl}`);
}

async function status(): Promise<void> {
  const cfg = await readConfig();
  console.log(JSON.stringify({
    configFile: configFile(),
    label: cfg.label,
    serverUrl: cfg.serverUrl,
    deviceId: cfg.deviceId,
    intervalMs: cfg.intervalMs,
    token: `${cfg.deviceToken.slice(0, 4)}…${cfg.deviceToken.slice(-4)}`,
    platform: os.platform(),
  }, null, 2));
}

async function run(once: boolean): Promise<void> {
  if (os.platform() !== 'win32' && os.platform() !== 'linux') {
    throw new Error('SystemScope supports Windows and Linux desktop computers only.');
  }
  const cfg = await readConfig();
  startSampler();
  // Let the sampler capture at least one delta before the first report.
  await sleep(2_500);

  let failures = 0;
  for (;;) {
    try {
      await heartbeat(cfg);
      failures = 0;
      console.log(`[SystemScope] Reported ${cfg.label} at ${new Date().toISOString()}`);
    } catch (error) {
      failures += 1;
      const delay = Math.min(cfg.intervalMs * 2 ** Math.min(failures, 4), 5 * 60_000);
      console.error(`[SystemScope] Report failed (${failures}): ${errorMessage(error)}. Retrying in ${Math.round(delay / 1000)}s.`);
      if (once) throw error;
      await sleep(delay);
      continue;
    }
    if (once) return;
    await sleep(cfg.intervalMs);
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'setup':
      await setup(args);
      return;
    case 'status':
      await status();
      return;
    case 'once':
      await run(true);
      return;
    case 'run':
    case undefined:
      await run(false);
      return;
    default:
      throw new Error(`Unknown command "${command}". Use setup, status, once, or run.`);
  }
}

function shutdown(): void {
  stopSampler();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((error) => {
  console.error(`[SystemScope] ${errorMessage(error)}`);
  stopSampler();
  process.exit(1);
});

// Keep config imported for its side effect: dotenv makes local development
// settings available to the shared collectors without extra agent flags.
void config;
