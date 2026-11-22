import { Router } from 'express';
import { asyncRoute } from '../lib/errors';
import { sendData } from '../lib/http';
import { getSystemInfo } from '../services/systemInfo';

const router = Router();

router.get(
  '/info',
  asyncRoute(async (_req, res) => {
    sendData(res, await getSystemInfo());
  }),
);

export default router;
