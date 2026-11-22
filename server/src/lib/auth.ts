import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { AppError } from './errors';
import { findDeviceByToken } from '../services/fleetStore';

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/** Compare hashes so a wrong token never reveals length or prefix information. */
function matches(token: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function requireViewer(req: Request, _res: Response, next: NextFunction): void {
  if (!config.viewerToken) {
    next();
    return;
  }
  const token = bearer(req);
  if (!token || !matches(token, config.viewerToken)) {
    next(new AppError(401, 'UNAUTHORIZED', 'Dashboard password is required'));
    return;
  }
  next();
}

export function requireEnrollment(req: Request, _res: Response, next: NextFunction): void {
  if (!config.enrollmentToken) {
    next();
    return;
  }
  const header = req.headers['x-enrollment-token'];
  const token = typeof header === 'string' ? header.trim() : bearer(req);
  if (!token || !matches(token, config.enrollmentToken)) {
    next(new AppError(401, 'UNAUTHORIZED', 'A valid enrollment token is required'));
    return;
  }
  next();
}

export function requireDevice(req: Request, res: Response, next: NextFunction): void {
  const token = bearer(req);
  const device = token ? findDeviceByToken(token) : undefined;
  if (!device) {
    next(new AppError(401, 'UNAUTHORIZED', 'A valid device token is required'));
    return;
  }
  res.locals.deviceId = device.id;
  next();
}

export function deviceIdFrom(res: Response): string {
  const id = res.locals.deviceId;
  if (typeof id !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Device identity is missing');
  return id;
}
