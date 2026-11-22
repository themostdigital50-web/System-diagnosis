import os from 'node:os';
import net from 'node:net';
import type { TraceHop, TracerouteResult } from '../../types';
import { runCommand } from '../../lib/exec';

function extractAddress(text: string): string | null {
  const bracketed = /\(([\d.]+|[a-f0-9:]+)\)/i.exec(text)?.[1];
  if (bracketed) return bracketed;
  const tokens = text.trim().split(/\s+/);
  return tokens.find((token) => net.isIP(token.replace(/^\*/, '')) !== 0) ?? null;
}

export async function traceHost(host: string, maxHops: number, timeoutMs: number): Promise<TracerouteResult> {
  const platform = os.platform();
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const args =
    platform === 'win32'
      ? ['-d', '-h', String(maxHops), '-w', String(timeoutMs), host]
      : ['-n', '-m', String(maxHops), '-w', String(seconds), host];

  const result = await runCommand(platform === 'win32' ? 'tracert' : 'traceroute', args, maxHops * timeoutMs + 12_000);
  const raw = (result.stdout || result.stderr).slice(0, 16_000);
  const hops: TraceHop[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*(\d{1,2})\s+(.+)$/.exec(line);
    if (!match) continue;
    const hopNumber = Number(match[1]);
    if (!Number.isInteger(hopNumber) || hopNumber < 1) continue;
    const body = match[2];
    const times = [...body.matchAll(/([\d.]+|<1)\s*ms/gi)].map((entry) => Number(entry[1].replace('<', '')));
    const address = extractAddress(body);
    hops.push({
      hop: hopNumber,
      address,
      probes: times,
      timedOut: times.length === 0 || /\*/.test(body),
    });
  }

  const last = hops.at(-1);
  return { host, hops, completed: Boolean(last && last.address && !last.timedOut), raw };
}
