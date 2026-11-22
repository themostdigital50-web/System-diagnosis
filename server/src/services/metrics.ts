import os from 'node:os';
import fs from 'node:fs/promises';
import { config } from '../config';
import type { AdapterCounter } from './platform';
import { getAdapterCounters } from './platform';
import type { MetricSample } from '../types';

interface CpuSnapshot {
  idle: number;
  total: number;
}

let samples: MetricSample[] = [];
let timer: NodeJS.Timeout | null = null;
let sampling = false;
let previousCpu: CpuSnapshot | null = null;
let previousCounters: { at: number; counters: AdapterCounter[] } | null = null;
let intervalMs = config.metricsIntervalMs;

function cpuSnapshot(): CpuSnapshot {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

function cpuPercent(now: CpuSnapshot): number | null {
  if (!previousCpu) return null;
  const idleDelta = now.idle - previousCpu.idle;
  const totalDelta = now.total - previousCpu.total;
  if (totalDelta <= 0) return null;
  const usage = (1 - idleDelta / totalDelta) * 100;
  return Math.min(100, Math.max(0, Math.round(usage * 10) / 10));
}

async function diskPercent(): Promise<number | null> {
  try {
    const mount = os.platform() === 'win32' ? 'C:\\' : '/';
    const stats = await fs.statfs(mount);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    if (total <= 0) return null;
    return Math.round(((total - free) / total) * 1000) / 10;
  } catch {
    return null;
  }
}

function isPhysicalAdapter(name: string): boolean {
  return !/loopback|npcap|vethernet|virtual|docker|wsl|^lo$/i.test(name);
}

async function sampleOnce(): Promise<MetricSample> {
  const at = Date.now();
  const nowCpu = cpuSnapshot();
  const cpu = cpuPercent(nowCpu);
  previousCpu = nowCpu;

  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  const memoryUsedBytes = used;
  const memoryPercent = Math.round((used / total) * 1000) / 10;

  const disk = await diskPercent();
  const counterField = await getAdapterCounters();
  let rxBytesPerSec: number | null = null;
  let txBytesPerSec: number | null = null;

  if (counterField.status === 'ok' && counterField.value) {
    const physical = counterField.value.filter((counter) => isPhysicalAdapter(counter.name));
    const aggregate = (list: AdapterCounter[]) => ({
      rx: list.reduce((sum, counter) => sum + counter.rxBytes, 0),
      tx: list.reduce((sum, counter) => sum + counter.txBytes, 0),
    });
    const now = aggregate(physical);

    if (previousCounters) {
      const elapsedSeconds = (at - previousCounters.at) / 1000;
      const before = aggregate(previousCounters.counters.filter((counter) => physical.some((p) => p.name === counter.name)));
      if (elapsedSeconds > 0) {
        rxBytesPerSec = Math.max(0, Math.round((now.rx - before.rx) / elapsedSeconds));
        txBytesPerSec = Math.max(0, Math.round((now.tx - before.tx) / elapsedSeconds));
      }
    }
    previousCounters = { at, counters: physical };
  } else {
    previousCounters = null;
  }

  return {
    timestamp: at,
    cpuPercent: cpu,
    memoryPercent,
    memoryUsedBytes,
    diskPercent: disk,
    rxBytesPerSec,
    txBytesPerSec,
    uptimeSeconds: Math.floor(os.uptime()),
  };
}

async function tick(): Promise<void> {
  if (sampling) return;
  sampling = true;
  try {
    const sample = await sampleOnce();
    samples.push(sample);
    const cutoff = Date.now() - Math.max(config.historyWindowMs, 10 * 60 * 1000);
    while (samples.length > config.maxSamples || (samples[0] && samples[0].timestamp < cutoff)) {
      samples.shift();
    }
  } catch (error) {
    console.error('[SystemScope] Metrics sample failed:', error);
  } finally {
    sampling = false;
  }
}

export function startSampler(): void {
  if (timer) clearInterval(timer);
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
}

export function stopSampler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function setMetricsInterval(ms: number): void {
  intervalMs = ms;
  previousCpu = null;
  previousCounters = null;
  startSampler();
}

export function getMetrics(windowMs = config.historyWindowMs) {
  const cutoff = Date.now() - Math.min(Math.max(windowMs, 1000), 24 * 60 * 60 * 1000);
  return {
    sample: samples.at(-1) ?? null,
    history: samples.filter((sample) => sample.timestamp >= cutoff),
    intervalMs,
    samplerRunning: timer !== null,
  };
}
