import { config } from '../config';
import { upstreamError } from '../lib/errors';
import type { SpeedResult } from '../types';

const DOWNLOAD_URL = 'https://speed.cloudflare.com/__down';
const UPLOAD_URL = 'https://speed.cloudflare.com/__up';

function mbps(bytes: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.round((bytes * 8 * 1000) / durationMs) / 1000;
}

/** Shared by the local route and the device agent so both use the same provider. */
export async function runSpeedTest(direction: 'download' | 'upload', bytes: number): Promise<SpeedResult> {
  if (bytes > config.speedTestMaxBytes) {
    throw upstreamError(`Requested size exceeds the configured limit of ${config.speedTestMaxBytes} bytes`);
  }
  const started = performance.now();

  if (direction === 'download') {
    const response = await fetch(`${DOWNLOAD_URL}?bytes=${bytes}`, {
      signal: AbortSignal.timeout(config.speedTestTimeoutMs),
      headers: { 'User-Agent': 'SystemScope/1.0 (device diagnostic)' },
    });
    if (!response.ok || !response.body) {
      throw upstreamError(`Speed test provider returned HTTP ${response.status}`);
    }
    let transferred = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      transferred += value.byteLength;
    }
    const durationMs = Math.round(performance.now() - started);
    return {
      direction: 'download',
      provider: 'Cloudflare',
      requestedBytes: bytes,
      transferredBytes: transferred,
      durationMs,
      megabitsPerSecond: mbps(transferred, durationMs),
      endpoint: DOWNLOAD_URL,
    };
  }

  const chunk = Buffer.alloc(64 * 1024, 0x53);
  const chunks: Buffer[] = [];
  let remaining = bytes;
  while (remaining > 0) {
    const size = Math.min(remaining, chunk.length);
    chunks.push(chunk.subarray(0, size));
    remaining -= size;
  }
  const payload = Buffer.concat(chunks, bytes);
  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'User-Agent': 'SystemScope/1.0 (device diagnostic)' },
    body: payload,
    signal: AbortSignal.timeout(config.speedTestTimeoutMs),
  });
  if (!response.ok) throw upstreamError(`Speed test provider returned HTTP ${response.status}`);
  await response.arrayBuffer().catch(() => undefined);

  const durationMs = Math.round(performance.now() - started);
  return {
    direction: 'upload',
    provider: 'Cloudflare',
    requestedBytes: bytes,
    transferredBytes: bytes,
    durationMs,
    megabitsPerSecond: mbps(bytes, durationMs),
    endpoint: UPLOAD_URL,
  };
}
