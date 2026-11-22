import type { ApiResponse } from '../types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(
      `Cannot reach the local agent. ${error instanceof Error ? error.message : 'Unknown network error'}`,
      'CONNECTION_ERROR',
    );
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(`The agent returned an invalid response (HTTP ${response.status})`, 'BAD_RESPONSE');
  }

  if (!response.ok || !payload.ok) {
    const failure = payload.ok ? null : payload.error;
    const detailText = failure?.details?.map((detail) => `${detail.path}: ${detail.message}`).join('; ');
    throw new ApiError(detailText || failure?.message || `Request failed (HTTP ${response.status})`, failure?.code ?? 'REQUEST_FAILED', failure?.details);
  }

  return payload.data;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}
