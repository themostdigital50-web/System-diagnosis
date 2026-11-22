import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { asyncRoute } from '../lib/errors';
import { sendData } from '../lib/http';
import { acquireSlot } from '../lib/limiter';
import { countSchema, dnsTypeSchema, hostSchema, httpUrlSchema, parseOrThrow, portSchema, strictObject, timeoutSchema } from '../lib/validate';
import { checkHttp } from '../services/diagnostics/http';
import { lookupDns } from '../services/diagnostics/dns';
import { pingHost } from '../services/diagnostics/ping';
import { checkPort } from '../services/diagnostics/port';
import { traceHost } from '../services/diagnostics/traceroute';

const router = Router();

const pingSchema = strictObject({
  host: hostSchema,
  count: countSchema.default(config.pingCount),
  timeoutMs: timeoutSchema.default(config.pingTimeoutMs),
});

const dnsSchema = strictObject({
  host: hostSchema,
  type: dnsTypeSchema.default('A'),
});

const traceSchema = strictObject({
  host: hostSchema,
  maxHops: z.number().int().min(1).max(30).default(config.tracerouteMaxHops),
  timeoutMs: timeoutSchema.default(config.pingTimeoutMs),
});

const httpSchema = strictObject({
  url: httpUrlSchema,
  timeoutMs: z.number().int().min(500).max(30_000).default(config.httpTimeoutMs),
});

const portSchemaFull = strictObject({
  host: hostSchema,
  port: portSchema,
  timeoutMs: timeoutSchema.default(2000),
});

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  const release = acquireSlot('diagnostics', 2);
  try {
    return await fn();
  } finally {
    release();
  }
}

router.post(
  '/ping',
  asyncRoute(async (req, res) => {
    const input = parseOrThrow(pingSchema, req.body);
    sendData(res, await withSlot(() => pingHost(input.host, input.count, input.timeoutMs)));
  }),
);

router.post(
  '/latency',
  asyncRoute(async (req, res) => {
    const input = parseOrThrow(pingSchema, req.body);
    sendData(res, await withSlot(() => pingHost(input.host, input.count, input.timeoutMs)));
  }),
);

router.post(
  '/dns',
  asyncRoute(async (req, res) => {
    const input = parseOrThrow(dnsSchema, req.body);
    sendData(res, await withSlot(() => lookupDns(input.host, input.type)));
  }),
);

router.post(
  '/traceroute',
  asyncRoute(async (req, res) => {
    const input = parseOrThrow(traceSchema, req.body);
    sendData(res, await withSlot(() => traceHost(input.host, input.maxHops, input.timeoutMs)));
  }),
);

router.post(
  '/http',
  asyncRoute(async (req, res) => {
    const input = parseOrThrow(httpSchema, req.body);
    sendData(res, await withSlot(() => checkHttp(input.url, input.timeoutMs)));
  }),
);

router.post(
  '/port',
  asyncRoute(async (req, res) => {
    const input = parseOrThrow(portSchemaFull, req.body);
    sendData(res, await withSlot(() => checkPort(input.host, input.port, input.timeoutMs)));
  }),
);

export default router;
