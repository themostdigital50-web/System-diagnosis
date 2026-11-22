import { Router } from 'express';
import { config } from '../config';
import { asyncRoute } from '../lib/errors';
import { sendData } from '../lib/http';
import { getMetrics } from '../services/metrics';

const router = Router();

function windowFromQuery(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return config.historyWindowMs;
  return Math.min(Math.max(raw, 1000), 86_400_000);
}

router.get(
  '/snapshot',
  asyncRoute(async (req, res) => {
    const window = windowFromQuery(req.query.window);
    sendData(res, getMetrics(window));
  }),
);

router.get(
  '/history',
  asyncRoute(async (req, res) => {
    const window = windowFromQuery(req.query.window);
    sendData(res, { history: getMetrics(window).history, windowMs: window });
  }),
);

export default router;
