import os from 'node:os';
import type { PingResult } from '../../types';
import { runCommand } from '../../lib/exec';

export async function pingHost(host: string, count: number, timeoutMs: number): Promise<PingResult> {
  const platform = os.platform();
  const args =
    platform === 'win32'
      ? ['-n', String(count), '-w', String(timeoutMs), host]
      : platform === 'darwin'
        ? ['-c', String(count), '-t', String(Math.max(1, Math.ceil(timeoutMs / 1000))), host]
        : ['-c', String(count), '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), host];

  const result = await runCommand('ping', args, Math.max(3000, count * timeoutMs + 4000));
  const raw = (result.stdout || result.stderr).slice(0, 12_000);
  const replies: PingResult['replies'] = [];

  if (platform === 'win32') {
    for (const line of raw.split(/\r?\n/)) {
      const match = /Reply from\s+([^\s:]+)[^\r\n]*?time[<>=]\s*(\d+)\s*ms/i.exec(line);
      if (!match) continue;
      replies.push({
        seq: replies.length + 1,
        address: match[1],
        latencyMs: Number(match[2]),
        ttl: Number(/TTL=(\d+)/i.exec(line)?.[1] ?? 0) || null,
      });
    }
  } else {
    for (const line of raw.split(/\r?\n/)) {
      const match = /bytes from\s+([^\s:]+).*?icmp_seq=(\d+).*?time=([\d.]+)\s*ms/i.exec(line);
      if (!match) continue;
      replies.push({
        seq: Number(match[2]),
        address: match[1],
        latencyMs: Number(match[3]),
        ttl: Number(/ttl=(\d+)/i.exec(line)?.[1] ?? 0) || null,
      });
    }
  }

  const latencies = replies.map((reply) => reply.latencyMs);
  const winStats = /Minimum\s*=\s*(\d+)ms,\s*Maximum\s*=\s*(\d+)ms,\s*Average\s*=\s*(\d+)ms/i.exec(raw);
  const posixStats = /rtt min\/avg\/max\/[\w/]+\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i.exec(raw);

  let packetLoss: number | null = null;
  const winLoss = /\((\d+)%\s*loss\)/i.exec(raw);
  const posixLoss = /([\d.]+)%\s*packet loss/i.exec(raw);
  if (winLoss) packetLoss = Number(winLoss[1]);
  else if (posixLoss) packetLoss = Number(posixLoss[1]);

  const sentMatch = /Sent\s*=\s*(\d+)/i.exec(raw);
  const receivedMatch = /Received\s*=\s*(\d+)/i.exec(raw);
  const packetsSent = sentMatch ? Number(sentMatch[1]) : count;
  const packetsReceived = receivedMatch ? Number(receivedMatch[1]) : replies.length;
  if (packetLoss === null && packetsSent > 0) {
    packetLoss = Math.round(((packetsSent - packetsReceived) / packetsSent) * 1000) / 10;
  }

  return {
    host,
    packetsSent,
    packetsReceived,
    packetLossPercent: packetLoss ?? 100,
    minLatencyMs: winStats ? Number(winStats[1]) : posixStats ? Number(posixStats[1]) : latencies.length ? Math.min(...latencies) : null,
    avgLatencyMs: winStats ? Number(winStats[3]) : posixStats ? Number(posixStats[2]) : latencies.length ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 10) / 10 : null,
    maxLatencyMs: winStats ? Number(winStats[2]) : posixStats ? Number(posixStats[3]) : latencies.length ? Math.max(...latencies) : null,
    replies,
    raw,
  };
}
