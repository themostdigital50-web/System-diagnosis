/** Shared server-side response shapes. Every uncertain value is wrapped in Field. */

export type FieldSource = 'os' | 'derived' | 'external' | 'probe' | 'browser';

export type FieldStatus = 'ok' | 'unavailable' | 'error';

export interface Field<T> {
  value: T | null;
  status: FieldStatus;
  source: FieldSource;
  reason?: string;
  note?: string;
}

export function ok<T>(value: T, source: FieldSource = 'os', note?: string): Field<T> {
  return { value, status: 'ok', source, ...(note ? { note } : {}) };
}

export function unavailable<T>(reason: string, source: FieldSource = 'os'): Field<T> {
  return { value: null, status: 'unavailable', source, reason };
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta: { collectedAt: string };
}

export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface OsInfo {
  name: Field<string>;
  version: Field<string>;
  build: Field<string>;
  kernel: string;
  hostname: string;
  platform: string;
  uptimeSeconds: number;
  bootTime: string;
}

export interface CpuInfo {
  model: Field<string>;
  physicalCores: Field<number>;
  logicalCores: number;
  threads: number;
  maxSpeedMHz: Field<number>;
  architecture: string;
}

export interface MemoryInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  note: string;
}

export interface StorageDevice {
  name: string;
  mount: string;
  filesystem: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
}

export interface GpuDevice {
  name: string;
  driverVersion: Field<string>;
  memoryBytes: Field<number>;
}

export interface SystemInfo {
  os: OsInfo;
  cpu: CpuInfo;
  memory: MemoryInfo;
  storage: Field<StorageDevice[]>;
  gpu: Field<GpuDevice[]>;
  collectedAt: string;
}

export interface NetworkInterfaceInfo {
  name: string;
  mac: string;
  ipv4: string[];
  ipv6: string[];
  internal: boolean;
  cidr: string;
}

export interface NetworkInfo {
  interfaces: NetworkInterfaceInfo[];
  activeInterface: Field<string>;
  connectionType: Field<string>;
  macAddress: Field<string>;
  localIpv4: Field<string>;
  localIpv6: Field<string[]>;
  gateway: Field<string>;
  gatewayIpv6: Field<string>;
  dnsServers: Field<string[]>;
  publicIp: Field<string>;
  internet: Field<'online' | 'offline'>;
  collectedAt: string;
}

export interface MetricSample {
  timestamp: number;
  cpuPercent: number | null;
  memoryPercent: number | null;
  memoryUsedBytes: number | null;
  diskPercent: number | null;
  rxBytesPerSec: number | null;
  txBytesPerSec: number | null;
  uptimeSeconds: number;
}

export interface MetricsResponse {
  sample: MetricSample | null;
  history: MetricSample[];
  intervalMs: number;
  samplerRunning: boolean;
  collectedAt: string;
}

export interface PingResult {
  host: string;
  packetsSent: number;
  packetsReceived: number;
  packetLossPercent: number;
  minLatencyMs: number | null;
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
  replies: Array<{ seq: number; address: string; latencyMs: number; ttl: number | null }>;
  raw: string;
}

export interface DnsRecord {
  type: string;
  value: string;
  ttl: number | null;
}

export interface DnsResult {
  host: string;
  type: string;
  records: DnsRecord[];
  raw: string;
}

export interface TraceHop {
  hop: number;
  address: string | null;
  probes: number[];
  timedOut: boolean;
}

export interface TracerouteResult {
  host: string;
  hops: TraceHop[];
  completed: boolean;
  raw: string;
}

export interface HttpResult {
  url: string;
  finalUrl: string;
  status: number | null;
  statusText: string | null;
  durationMs: number;
  redirected: boolean;
  headers: Record<string, string>;
  error: string | null;
}

export interface PortResult {
  host: string;
  port: number;
  state: 'open' | 'closed' | 'timeout' | 'error';
  connectMs: number | null;
  error: string | null;
}

export interface SpeedResult {
  direction: 'download' | 'upload';
  provider: string;
  requestedBytes: number;
  transferredBytes: number;
  durationMs: number;
  megabitsPerSecond: number;
  endpoint: string;
}

export interface ServerSettings {
  metricsIntervalMs: number;
  historyWindowMs: number;
  publicIpEnabled: boolean;
  pingCount: number;
  pingTimeoutMs: number;
  tracerouteMaxHops: number;
  httpTimeoutMs: number;
}

/** Fleet mode: a device agent reports its own OS data to the dashboard. */

export type DevicePlatform = 'win32' | 'linux';

export interface DeviceReport {
  agentVersion: string;
  platform: DevicePlatform;
  system: SystemInfo;
  network: NetworkInfo;
  metrics: {
    sample: MetricSample | null;
    history: MetricSample[];
    intervalMs: number;
    collectedAt: string;
  };
}

export interface DeviceCommand {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'error' | 'expired';
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

export interface DeviceRecord {
  id: string;
  label: string;
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string | null;
  report: DeviceReport | null;
  commands: DeviceCommand[];
}

export type DeviceStatus = 'online' | 'stale' | 'offline';

export interface DeviceSummary {
  id: string;
  label: string;
  platform: DevicePlatform | null;
  osName: string | null;
  hostname: string | null;
  cpuModel: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  status: DeviceStatus;
}

export interface FleetConfig {
  fleetEnabled: boolean;
  authRequired: boolean;
  enrollmentRequired: boolean;
  staleMs: number;
  storageOk: boolean;
  supportedPlatforms: DevicePlatform[];
}
