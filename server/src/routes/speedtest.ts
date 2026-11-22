import { Router } from 'express';
import { asyncRoute } from '../lib/errors';
import { sendData } from '../lib/http';
import { acquireSlot } from '../lib/limiter';
import { bytesSchema, parseOrThrow, strictObject } from '../lib/validate';
import { runSpeedTest } from '../services/speedtest';

const router = Router();

const bodySchema = strictObject({
  bytes: bytesSchema.default(5 * 1024 * 1024),
});

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  const release = acquireSlot('speedtest', 1);
  try {
    return await fn();
  } finally {
    release();
  }
}

router.post(
  '/download',
  asyncRoute(async (req, res) => {
    const { bytes } = parseOrThrow(bodySchema, req.body);
    sendData(res, await withSlot(() => runSpeedTest('download', bytes)));
  }),
);

router.post(
  '/upload',
  asyncRoute(async (req, res) => {
    const { bytes } = parseOrThrow(bodySchema, req.body);
    sendData(res, await withSlot(() => runSpeedTest('upload', bytes)));
  }),
);

export default router;
