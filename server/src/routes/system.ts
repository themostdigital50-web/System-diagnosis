import { Router } from 'express';
import { asyncRoute } from '../lib/errors';
import { cached } from '../lib/cache';
import { sendData } from '../lib/http';
import { getSystemInfo } from '../services/systemInfo';

const router = Router();
const getCachedSystemInfo = cached(5000, getSystemInfo);

router.get(
  '/info',
  asyncRoute(async (_req, res) => {
    const result = await getCachedSystemInfo();
    sendData(res, result.value, 200, result.collectedAt);
  }),
);

export default router;
