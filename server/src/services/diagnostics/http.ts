import type { HttpResult } from '../../types';

export async function checkHttp(url: string, timeoutMs: number): Promise<HttpResult> {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      headers: { 'User-Agent': 'SystemScope/1.0 (local diagnostic)' },
    });

    // Consume and discard the body so the socket is released, but never expose it.
    await response.arrayBuffer().catch(() => undefined);
    const durationMs = Math.round(performance.now() - started);
    const headers: Record<string, string> = {};
    for (const key of ['content-type', 'content-length', 'server', 'date', 'location']) {
      const value = response.headers.get(key);
      if (value) headers[key] = value;
    }

    return {
      url,
      finalUrl: response.url || url,
      status: response.status,
      statusText: response.statusText || null,
      durationMs,
      redirected: response.url !== url,
      headers,
      error: null,
    };
  } catch (error) {
    return {
      url,
      finalUrl: url,
      status: null,
      statusText: null,
      durationMs: Math.round(performance.now() - started),
      redirected: false,
      headers: {},
      error: error instanceof Error ? error.message : 'Unknown HTTP error',
    };
  }
}
