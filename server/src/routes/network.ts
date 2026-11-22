import { Router } from 'express';
import { asyncRoute } from '../lib/errors';
import { cached } from '../lib/cache';
import { sendData } from '../lib/http';
import { getNetworkInfo } from '../services/networkInfo';

const router = Router();
const getCachedNetworkInfo = cached(15_000, getNetworkInfo);

router.get(
  '/info',
  asyncRoute(async (_req, res) => {
    const result = await getCachedNetworkInfo();
    sendData(res, result.value, 200, result.collectedAt);
  }),
);

export default router;
