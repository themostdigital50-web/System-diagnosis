import type { NextFunction, Request, Response } from 'express';
import type { ApiFailure } from '../types';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'INVALID_INPUT', message, details);

export const notFound = (message: string) => new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string) => new AppError(409, 'BUSY', message);

export const upstreamError = (message: string, details?: unknown) =>
  new AppError(502, 'UPSTREAM_ERROR', message, details);

export const internalError = (message: string, details?: unknown) =>
  new AppError(500, 'INTERNAL_ERROR', message, details);

export function asyncRoute(
  handler: (req: Request, res: Response) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    const body: ApiFailure = {
      ok: false,
      error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  const bodyParserError = err as { type?: string; statusCode?: number };
  if (bodyParserError?.type === 'entity.parse.failed') {
    const body: ApiFailure = {
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'Request body must be valid JSON' },
    };
    res.status(400).json(body);
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected server error';
  console.error('[SystemScope] Unhandled error:', err);
  const failure: ApiFailure = { ok: false, error: { code: 'INTERNAL_ERROR', message } };
  res.status(500).json(failure);
}
