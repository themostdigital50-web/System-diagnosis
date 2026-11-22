import type { Response } from 'express';
import type { ApiSuccess } from '../types';

export function sendData<T>(res: Response, data: T, status = 200): void {
  const body: ApiSuccess<T> = { ok: true, data, meta: { collectedAt: new Date().toISOString() } };
  res.status(status).json(body);
}
