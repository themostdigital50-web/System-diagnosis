import { z } from 'zod';
import { config } from '../config';
import { setMetricsInterval } from './metrics';
import { clearPublicIpCache } from './publicIp';
import type { ServerSettings } from '../types';

export const settingsSchema = z
  .object({
    metricsIntervalMs: z.number().int().min(1000).max(60000).optional(),
    historyWindowMs: z.number().int().min(30_000).max(86_400_000).optional(),
    publicIpEnabled: z.boolean().optional(),
    pingCount: z.number().int().min(1).max(20).optional(),
    pingTimeoutMs: z.number().int().min(100).max(15_000).optional(),
    tracerouteMaxHops: z.number().int().min(1).max(30).optional(),
    httpTimeoutMs: z.number().int().min(1000).max(30_000).optional(),
  })
  .strict();

export function getSettings(): ServerSettings {
  return {
    metricsIntervalMs: config.metricsIntervalMs,
    historyWindowMs: config.historyWindowMs,
    publicIpEnabled: config.publicIpEnabled,
    pingCount: config.pingCount,
    pingTimeoutMs: config.pingTimeoutMs,
    tracerouteMaxHops: config.tracerouteMaxHops,
    httpTimeoutMs: config.httpTimeoutMs,
  };
}
