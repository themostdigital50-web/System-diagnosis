import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { asyncRoute, upstreamError } from '../lib/errors';
import { sendData } from '../lib/http';
import { acquireSlot } from '../lib/limiter';
import { bytesSchema, parseOrThrow, strictObject } from '../lib/validate';
import type { SpeedResult } from '../types';

const router = Router();
const DOWNLOAD_URL = 'https://speed.cloudflare.com/__down';
const UPLOAD_URL = 'https://speed.cloudflare.com/__up';

const bodySchema = strictObject({
  bytes: bytesSchema.default(5 * 1024 * 1024),
});

function mbps(bytes: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.round((bytes * 8 * 1000) / durationMs) / 1000;
}

router.post(
  '/download',
  asyncRoute(async (req, res) => {
    const { bytes } = parseOrThrow(bodySchema, req.body);
    if (bytes > config.speedTestMaxBytes) {
      throw upstreamError(`Requested size exceeds the configured limit of ${config.speedTestMaxBytes} bytes`);
    }
    const release = acquireSlot('speedtest', 1);
    const started = performance.now();
    let transferred = 0;

    try {
      const response = await fetch(`${DOWNLOAD_URL}?bytes=${bytes}`, {
        signal: AbortSignal.timeout(config.speedTestTimeoutMs),
        headers: { 'User-Agent': 'SystemScope/1.0 (local diagnostic)' },
      });
      if (!response.ok || !response.body) {
        throw upstreamError(`Speed test provider returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        transferred += value.byteLength;
      }

      const durationMs = Math.round(performance.now() - started);
      const result: SpeedResult = {
        direction: 'download',
        provider: 'Cloudflare',
        requestedBytes: bytes,
        transferredBytes: transferred,
        durationMs,
        megabitsPerSecond: mbps(transferred, durationMs),
        endpoint: DOWNLOAD_URL,
      };
      sendData(res, result);
    } finally {
      release();
    }
  }),
);

router.post(
  '/upload',
  asyncRoute(async (req, res) => {
    const { bytes } = parseOrThrow(bodySchema, req.body);
    if (bytes > config.speedTestMaxBytes) {
      throw upstreamError(`Requested size exceeds the configured limit of ${config.speedTestMaxBytes} bytes`);
    }
    const release = acquireSlot('speedtest', 1);
    const started = performance.now();

    try {
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
        headers: { 'Content-Type': 'application/octet-stream', 'User-Agent': 'SystemScope/1.0 (local diagnostic)' },
        body: payload,
        signal: AbortSignal.timeout(config.speedTestTimeoutMs),
      });
      if (!response.ok) {
        throw upstreamError(`Speed test provider returned HTTP ${response.status}`);
      }
      await response.arrayBuffer().catch(() => undefined);

      const durationMs = Math.round(performance.now() - started);
      const result: SpeedResult = {
        direction: 'upload',
        provider: 'Cloudflare',
        requestedBytes: bytes,
        transferredBytes: bytes,
        durationMs,
        megabitsPerSecond: mbps(bytes, durationMs),
        endpoint: UPLOAD_URL,
      };
      sendData(res, result);
    } finally {
      release();
    }
  }),
);

export default router;
