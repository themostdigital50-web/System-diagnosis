import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { requireViewer } from '../lib/auth';
import { deviceCommandSchema } from '../lib/diagnosticSchemas';
import { asyncRoute } from '../lib/errors';
import { sendData } from '../lib/http';
import { parseOrThrow, strictObject } from '../lib/validate';
import {
  createDevice,
  deleteDevice,
  getCommand,
  getDevice,
  getDeviceSummary,
  listDevices,
  queueCommand,
  renameDevice,
  storageOk,
} from '../services/fleetStore';

function idOf(req: Request): string {
  const value = req.params.id;
  const id = Array.isArray(value) ? value[0] : value;
  if (!id) throw new Error('Device id is required');
  return id;
}

function notFound(res: import('express').Response, message: string): void {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message } });
}

/** Public bootstrap info: whether login is needed and whether fleet data can persist. */
export const fleetConfigRouter = Router();

fleetConfigRouter.get('/config', (_req, res) => {
  sendData(res, {
    fleetEnabled: Boolean(config.viewerToken || config.enrollmentToken),
    authRequired: Boolean(config.viewerToken),
    enrollmentRequired: Boolean(config.enrollmentToken),
    staleMs: config.deviceStaleMs,
    storageOk: storageOk(),
    supportedPlatforms: ['win32', 'linux'],
  });
});

fleetConfigRouter.get('/verify', requireViewer, (_req, res) => {
  sendData(res, { authenticated: true });
});

/** All device data is behind the viewer token when one is configured. */
export const deviceRouter = Router();
deviceRouter.use(requireViewer);

deviceRouter.get('/', (_req, res) => {
  sendData(res, listDevices());
});

deviceRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const { label } = parseOrThrow(strictObject({ label: z.string().trim().min(1).max(80) }), req.body);
    const { device, token } = await createDevice(label);
    // Shown once. Only a SHA-256 hash is kept on the server.
    sendData(res, { id: device.id, label: device.label, token }, 201);
  }),
);

deviceRouter.get('/:id/summary', (req, res) => {
  const summary = getDeviceSummary(idOf(req));
  if (!summary) return notFound(res, 'Device not found');
  sendData(res, summary);
});

deviceRouter.get('/:id/health', (req, res) => {
  const summary = getDeviceSummary(idOf(req));
  if (!summary) return notFound(res, 'Device not found');
  sendData(res, {
    status: summary.status === 'online' ? 'ok' : summary.status,
    label: summary.label,
    platform: summary.platform,
    lastSeenAt: summary.lastSeenAt,
  });
});

deviceRouter.get('/:id/system/info', (req, res) => {
  const report = getDevice(idOf(req))?.report;
  if (!report) return notFound(res, 'This computer has not sent a report yet.');
  sendData(res, report.system, 200, report.system.collectedAt);
});

deviceRouter.get('/:id/network/info', (req, res) => {
  const report = getDevice(idOf(req))?.report;
  if (!report) return notFound(res, 'This computer has not sent a report yet.');
  sendData(res, report.network, 200, report.network.collectedAt);
});

deviceRouter.get('/:id/metrics/snapshot', (req, res) => {
  const record = getDevice(idOf(req));
  if (!record?.report) return notFound(res, 'This computer has not sent a report yet.');
  const raw = Number(req.query.window);
  const window = Number.isFinite(raw) && raw > 0 ? Math.min(Math.max(raw, 1000), 86_400_000) : config.historyWindowMs;
  const cutoff = Date.now() - window;
  const metrics = record.report.metrics;
  const lastSeen = record.lastSeenAt ? Date.now() - new Date(record.lastSeenAt).getTime() : Number.POSITIVE_INFINITY;
  sendData(
    res,
    {
      sample: metrics.sample,
      history: metrics.history.filter((sample) => sample.timestamp >= cutoff),
      intervalMs: metrics.intervalMs,
      samplerRunning: lastSeen <= config.deviceStaleMs,
    },
    200,
    metrics.collectedAt,
  );
});

deviceRouter.get('/:id/settings', (_req, res) => {
  // Agent settings live on the device; expose read-only defaults so shared
  // pages render without implying this dashboard controls the agent.
  sendData(res, {
    metricsIntervalMs: config.metricsIntervalMs,
    historyWindowMs: config.historyWindowMs,
    publicIpEnabled: config.publicIpEnabled,
    pingCount: config.pingCount,
    pingTimeoutMs: config.pingTimeoutMs,
    tracerouteMaxHops: config.tracerouteMaxHops,
    httpTimeoutMs: config.httpTimeoutMs,
  });
});

deviceRouter.post(
  '/:id/commands',
  asyncRoute(async (req, res) => {
    const id = idOf(req);
    if (!getDevice(id)) return notFound(res, 'Device not found');
    const input = parseOrThrow(deviceCommandSchema, req.body);
    const command = await queueCommand(id, input.tool, input.params as Record<string, unknown>);
    if (!command) throw new Error('Device record disappeared while queueing');
    sendData(res, { commandId: command.id, status: command.status }, 201);
  }),
);

deviceRouter.get('/:id/commands/:commandId', (req, res) => {
  const command = getCommand(idOf(req), req.params.commandId);
  if (!command) return notFound(res, 'Command not found');
  sendData(res, {
    id: command.id,
    tool: command.tool,
    status: command.status,
    result: command.result ?? null,
    error: command.error ?? null,
    createdAt: command.createdAt,
    expiresAt: command.expiresAt,
    completedAt: command.completedAt ?? null,
  });
});

deviceRouter.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    const record = await renameDevice(
      idOf(req),
      parseOrThrow(strictObject({ label: z.string().trim().min(1).max(80) }), req.body).label,
    );
    if (!record) return notFound(res, 'Device not found');
    sendData(res, getDeviceSummary(record.id));
  }),
);

deviceRouter.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    if (!(await deleteDevice(idOf(req)))) return notFound(res, 'Device not found');
    sendData(res, { deleted: true });
  }),
);
