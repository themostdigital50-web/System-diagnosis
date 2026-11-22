import { z } from 'zod';
import { config } from '../config';
import {
  bytesSchema,
  countSchema,
  dnsTypeSchema,
  hostSchema,
  httpUrlSchema,
  portSchema,
  strictObject,
  timeoutSchema,
} from './validate';

/** Shared by the local routes and the device command queue so both validate identically. */

export const pingInputSchema = strictObject({
  host: hostSchema,
  count: countSchema.default(config.pingCount),
  timeoutMs: timeoutSchema.default(config.pingTimeoutMs),
});

export const dnsInputSchema = strictObject({
  host: hostSchema,
  type: dnsTypeSchema.default('A'),
});

export const traceInputSchema = strictObject({
  host: hostSchema,
  maxHops: z.number().int().min(1).max(30).default(config.tracerouteMaxHops),
  timeoutMs: timeoutSchema.default(config.pingTimeoutMs),
});

export const httpInputSchema = strictObject({
  url: httpUrlSchema,
  timeoutMs: z.number().int().min(500).max(30_000).default(config.httpTimeoutMs),
});

export const portInputSchema = strictObject({
  host: hostSchema,
  port: portSchema,
  timeoutMs: timeoutSchema.default(2000),
});

export const speedInputSchema = strictObject({
  direction: z.enum(['download', 'upload']),
  bytes: bytesSchema.default(5 * 1024 * 1024),
});

export type CommandTool = 'ping' | 'latency' | 'dns' | 'traceroute' | 'http' | 'port' | 'speedtest';

/** Only these tools can ever be queued for a device. No arbitrary commands. */
export const deviceCommandSchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('ping'), params: pingInputSchema }),
  z.object({ tool: z.literal('latency'), params: pingInputSchema }),
  z.object({ tool: z.literal('dns'), params: dnsInputSchema }),
  z.object({ tool: z.literal('traceroute'), params: traceInputSchema }),
  z.object({ tool: z.literal('http'), params: httpInputSchema }),
  z.object({ tool: z.literal('port'), params: portInputSchema }),
  z.object({ tool: z.literal('speedtest'), params: speedInputSchema }),
]);
