import type { ApiResponse, DeviceCommandState } from '../types';

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

/**
 * The device scope is derived from the current URL on every request. That
 * keeps local and per-computer data separated without mutable global state,
 * including when navigating directly between two computers.
 */
export function getApiBase(): string {
  const match = window.location.pathname.match(/^\/device\/([^/]+)/);
  return match ? `/devices/${encodeURIComponent(decodeURIComponent(match[1]))}` : '';
}

// Initialised before any component effect runs so the first authenticated
// request after a page load is never sent without the stored viewer token.
let authToken = '';
try {
  authToken = sessionStorage.getItem('systemscope.viewer-token') ?? '';
} catch {
  // Private browsing may block sessionStorage; login still works for this tab.
}

export function setAuthToken(token: string): void {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(init?.headers ?? {}),
      },
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
    throw new ApiError(
      detailText || failure?.message || `Request failed (HTTP ${response.status})`,
      failure?.code ?? 'REQUEST_FAILED',
      failure?.details,
    );
  }

  return payload.data;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(`${getApiBase()}${path}`, { signal }),
  post: <T>(path: string, body: unknown) =>
    request<T>(`${getApiBase()}${path}`, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(`${getApiBase()}${path}`, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(`${getApiBase()}${path}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(`${getApiBase()}${path}`, { method: 'DELETE' }),
};

const COMMAND_TIMEOUT_MS = 180_000;

/**
 * Runs a diagnostic in the right place: directly on the local agent, or as a
 * queued command that the selected computer's agent picks up and executes.
 */
export async function runTool<T>(tool: string, params: Record<string, unknown>): Promise<T> {
  const base = getApiBase();
  if (!base) return api.post<T>(`/diagnostics/${tool}`, params);

  const created = await request<{ commandId: string }>(`${base}/commands`, {
    method: 'POST',
    body: JSON.stringify({ tool, params }),
  });
  const deadline = Date.now() + COMMAND_TIMEOUT_MS;

  for (;;) {
    const command = await request<DeviceCommandState>(`${base}/commands/${created.commandId}`);
    if (command.status === 'done') return command.result as T;
    if (command.status === 'error') {
      throw new ApiError(command.error ?? 'The diagnostic failed on the device', 'COMMAND_FAILED');
    }
    if (command.status === 'expired') {
      throw new ApiError('The device did not pick up this command before it expired.', 'COMMAND_EXPIRED');
    }
    if (Date.now() >= deadline) {
      throw new ApiError('Timed out waiting for the device to finish this diagnostic.', 'COMMAND_TIMEOUT');
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}
