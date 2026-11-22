import { Router } from 'express';
import { config } from '../config';
import { asyncRoute } from '../lib/errors';
import { sendData } from '../lib/http';
import { parseOrThrow } from '../lib/validate';
import { setMetricsInterval } from '../services/metrics';
import { clearPublicIpCache } from '../services/publicIp';
import { getSettings, settingsSchema } from '../services/settings';

const router = Router();

router.get(
  '/',
  asyncRoute(async (_req, res) => {
    sendData(res, getSettings());
  }),
);

router.put(
  '/',
  asyncRoute(async (req, res) => {
    const input = parseOrThrow(settingsSchema, req.body);

    if (input.metricsIntervalMs !== undefined) {
      config.metricsIntervalMs = input.metricsIntervalMs;
      setMetricsInterval(input.metricsIntervalMs);
    }
    if (input.historyWindowMs !== undefined) config.historyWindowMs = input.historyWindowMs;
    if (input.publicIpEnabled !== undefined) {
      config.publicIpEnabled = input.publicIpEnabled;
      clearPublicIpCache();
    }
    if (input.pingCount !== undefined) config.pingCount = input.pingCount;
    if (input.pingTimeoutMs !== undefined) config.pingTimeoutMs = input.pingTimeoutMs;
    if (input.tracerouteMaxHops !== undefined) config.tracerouteMaxHops = input.tracerouteMaxHops;
    if (input.httpTimeoutMs !== undefined) config.httpTimeoutMs = input.httpTimeoutMs;

    sendData(res, getSettings());
  }),
);

export default router;
