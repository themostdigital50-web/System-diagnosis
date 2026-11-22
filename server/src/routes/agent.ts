import { Router } from 'express';
import { z } from 'zod';
import { deviceIdFrom, requireDevice, requireEnrollment } from '../lib/auth';
import { deviceReportSchema } from '../lib/deviceReportSchema';
import { asyncRoute } from '../lib/errors';
import { sendData } from '../lib/http';
import { parseOrThrow, strictObject } from '../lib/validate';
import {
  completeCommand,
  createDevice,
  getCommand,
  saveReport,
  takePendingCommands,
} from '../services/fleetStore';

const router = Router();

const enrollSchema = strictObject({
  label: z.string().trim().min(1).max(80),
});

const resultSchema = strictObject({
  commandId: z.string().uuid(),
  result: z.unknown().optional(),
  error: z.string().max(2000).optional(),
});

/** Admin/scripted enrollment. The dashboard can also enroll via POST /api/devices. */
router.post(
  '/enroll',
  requireEnrollment,
  asyncRoute(async (req, res) => {
    const { label } = parseOrThrow(enrollSchema, req.body);
    const { device, token } = await createDevice(label);
    // The token is only ever returned here, never stored in plaintext.
    sendData(res, { id: device.id, label: device.label, token }, 201);
  }),
);

router.post(
  '/report',
  requireDevice,
  asyncRoute(async (req, res) => {
    const input = parseOrThrow(strictObject({ report: deviceReportSchema }), req.body);
    const deviceId = deviceIdFrom(res);
    const record = await saveReport(deviceId, input.report as Parameters<typeof saveReport>[1]);
    if (!record) throw new Error('Device record disappeared during report');
    sendData(res, { accepted: true, id: deviceId, lastSeenAt: record.lastSeenAt });
  }),
);

/** Agents poll this on every heartbeat; pending commands become running atomically. */
router.get(
  '/commands',
  requireDevice,
  asyncRoute(async (_req, res) => {
    const commands = await takePendingCommands(deviceIdFrom(res));
    sendData(res, { commands });
  }),
);

router.post(
  '/command/result',
  requireDevice,
  asyncRoute(async (req, res) => {
    const input = parseOrThrow(resultSchema, req.body);
    const deviceId = deviceIdFrom(res);
    const command = getCommand(deviceId, input.commandId);
    if (!command) {
      sendData(res, { accepted: false, reason: 'Unknown command' });
      return;
    }
    if (command.status !== 'running') {
      sendData(res, { accepted: false, reason: `Command is ${command.status}` });
      return;
    }
    await completeCommand(deviceId, input.commandId, { result: input.result, error: input.error });
    sendData(res, { accepted: true });
  }),
);

export default router;
