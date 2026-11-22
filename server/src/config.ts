import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

const port = intFromEnv('PORT', 3001, 1024, 65535);

export const config = {
  // Loopback by default. Docker Compose overrides this with HOST=0.0.0.0.
  host: process.env.HOST?.trim() || '127.0.0.1',
  port,
  clientOrigins: [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ],
  metricsIntervalMs: intFromEnv('METRICS_INTERVAL_MS', 2000, 1000, 60000),
  historyWindowMs: 5 * 60 * 1000,
  maxSamples: 600,
  publicIpEnabled: (process.env.PUBLIC_IP_ENABLED ?? 'true').toLowerCase() !== 'false',
  publicIpUrl: process.env.PUBLIC_IP_URL ?? 'https://api.ipify.org?format=json',
  publicIpTimeoutMs: 5000,
  publicIpCacheMs: 60_000,
  speedTestMaxBytes: intFromEnv('SPEEDTEST_MAX_BYTES', 25 * 1024 * 1024, 1024 * 1024, 100 * 1024 * 1024),
  speedTestTimeoutMs: 30_000,
  // Fleet mode. Viewer/admin tokens are optional so the local dashboard keeps working.
  dataDir: process.env.DATA_DIR?.trim() || path.resolve(process.cwd(), 'data'),
  viewerToken: process.env.VIEWER_TOKEN?.trim() || '',
  enrollmentToken: process.env.AGENT_ENROLLMENT_TOKEN?.trim() || '',
  deviceStaleMs: intFromEnv('DEVICE_STALE_MS', 90_000, 15_000, 3_600_000),
  deviceCommandTtlMs: intFromEnv('DEVICE_COMMAND_TTL_MS', 60_000, 10_000, 600_000),
  pingCount: 4,
  pingTimeoutMs: 2000,
  tracerouteMaxHops: 20,
  httpTimeoutMs: 8000,
  processTimeoutMs: 12_000,
  maxOutputBytes: 512 * 1024,
  clientDist: path.resolve(process.cwd(), '..', 'client', 'dist'),
};

export type Config = typeof config;
