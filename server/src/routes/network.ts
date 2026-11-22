import { Router } from 'express';
import { asyncRoute } from '../lib/errors';
import { sendData } from '../lib/http';
import { getNetworkInfo } from '../services/networkInfo';

const router = Router();

router.get(
  '/info',
  asyncRoute(async (_req, res) => {
    sendData(res, await getNetworkInfo());
  }),
);

export default router;
