import type { Response } from 'express';
import type { ApiSuccess } from '../types';

export function sendData<T>(res: Response, data: T, status = 200, collectedAt = new Date().toISOString()): void {
  const body: ApiSuccess<T> = { ok: true, data, meta: { collectedAt } };
  res.status(status).json(body);
}
