import { z } from 'zod';

/**
 * Device agents are authenticated, but their payloads are still validated and
 * bounded before being written to the shared store.
 */

const field = z.object({
  value: z.unknown(),
  status: z.enum(['ok', 'unavailable', 'error']),
  source: z.enum(['os', 'derived', 'external', 'probe', 'browser']),
  reason: z.string().max(1000).optional(),
  note: z.string().max(1000).optional(),
});

const osInfo = z.object({
  name: field,
  version: field,
  build: field,
  kernel: z.string().max(500),
  hostname: z.string().max(255),
  platform: z.string().max(50),
  uptimeSeconds: z.number().min(0),
  bootTime: z.string().max(50),
});

const cpuInfo = z.object({
  model: field,
  physicalCores: field,
  logicalCores: z.number().min(0),
  threads: z.number().min(0),
  maxSpeedMHz: field,
  architecture: z.string().max(50),
});

const memoryInfo = z.object({
  totalBytes: z.number().min(0),
  freeBytes: z.number().min(0),
  usedBytes: z.number().min(0),
  usedPercent: z.number().min(0).max(100),
  note: z.string().max(1000),
});

const interfaceInfo = z.object({
  name: z.string().max(200),
  mac: z.string().max(100),
  ipv4: z.array(z.string().max(100)).max(50),
  ipv6: z.array(z.string().max(100)).max(50),
  internal: z.boolean(),
  cidr: z.string().max(100),
});

const networkInfo = z.object({
  interfaces: z.array(interfaceInfo).max(100),
  activeInterface: field,
  connectionType: field,
  macAddress: field,
  localIpv4: field,
  localIpv6: field,
  gateway: field,
  gatewayIpv6: field,
  dnsServers: field,
  publicIp: field,
  internet: field,
  collectedAt: z.string().max(50),
});

const sample = z.object({
  timestamp: z.number(),
  cpuPercent: z.number().nullable(),
  memoryPercent: z.number().nullable(),
  memoryUsedBytes: z.number().nullable(),
  diskPercent: z.number().nullable(),
  rxBytesPerSec: z.number().nullable(),
  txBytesPerSec: z.number().nullable(),
  uptimeSeconds: z.number(),
});

export const deviceReportSchema = z.object({
  agentVersion: z.string().max(50),
  platform: z.enum(['win32', 'linux']),
  system: z.object({
    os: osInfo,
    cpu: cpuInfo,
    memory: memoryInfo,
    storage: field,
    gpu: field,
    collectedAt: z.string().max(50),
  }),
  network: networkInfo,
  metrics: z.object({
    sample: sample.nullable(),
    history: z.array(sample).max(600),
    intervalMs: z.number().min(100),
    collectedAt: z.string().max(50),
  }),
});
