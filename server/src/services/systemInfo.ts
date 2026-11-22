import os from 'node:os';
import fs from 'node:fs/promises';
import type { Field, StorageDevice, SystemInfo } from '../types';
import { ok, unavailable } from '../types';
import { getGpuDevices, getMountPoints, getOsVersionInfo, getPhysicalCores } from './platform';
import { createTtlCache } from '../lib/cache';

const staticFacts = createTtlCache(60_000);

function labelForMount(mount: string): string {
  if (/^[A-Z]:\\$/i.test(mount)) return `Drive ${mount.slice(0, 2)}`;
  return mount;
}

async function readStorage(): Promise<Field<StorageDevice[]>> {
  try {
    const mounts = await getMountPoints();
    const devices: StorageDevice[] = [];

    for (const mount of mounts) {
      try {
        const stats = await fs.statfs(mount);
        const totalBytes = stats.blocks * stats.bsize;
        const freeBytes = stats.bavail * stats.bsize;
        if (totalBytes <= 0) continue;
        const usedBytes = Math.max(0, totalBytes - freeBytes);
        devices.push({
          name: labelForMount(mount),
          mount,
          filesystem: 'not reported',
          totalBytes,
          freeBytes,
          usedBytes,
          usedPercent: Math.round((usedBytes / totalBytes) * 1000) / 10,
        });
      } catch {
        // A listed mount may have disappeared between discovery and stat.
      }
    }

    return devices.length > 0
      ? ok(devices, 'os', 'Free space uses blocks available to the current user (statfs bavail)')
      : unavailable('No readable storage devices were found');
  } catch (error) {
    return unavailable(`Storage query failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const cpus = os.cpus();
  const [osVersion, physicalCores, gpu, storage] = await Promise.all([
    staticFacts('osVersion', getOsVersionInfo),
    staticFacts('physicalCores', getPhysicalCores),
    staticFacts('gpu', getGpuDevices),
    readStorage(),
  ]);

  const firstCpu = cpus[0];
  const model = firstCpu?.model?.trim();
  const speed = firstCpu?.speed;
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);

  return {
    os: {
      name:
        osVersion.status === 'ok' && osVersion.value
          ? ok(osVersion.value.name)
          : unavailable('Friendly OS name could not be read from the operating system'),
      version: osVersion.status === 'ok' ? ok(osVersion.value!.version) : unavailable('OS version not reported by this platform'),
      build: osVersion.status === 'ok' ? ok(osVersion.value!.build) : unavailable('OS build number not reported by this platform'),
      kernel: os.release(),
      hostname: os.hostname(),
      platform: os.platform(),
      uptimeSeconds: Math.max(0, Math.floor(os.uptime())),
      bootTime: new Date(Date.now() - os.uptime() * 1000).toISOString(),
    },
    cpu: {
      model: model ? ok(model) : unavailable('CPU model not reported by this platform'),
      physicalCores,
      logicalCores: cpus.length,
      threads: cpus.length,
      maxSpeedMHz: typeof speed === 'number' && speed > 0 ? ok(speed) : unavailable('CPU speed not reported'),
      architecture: os.arch(),
    },
    memory: {
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent: Math.round((usedBytes / totalBytes) * 1000) / 10,
      note: 'Values are reported by the Node.js os module; free memory is an operating-system estimate.',
    },
    storage,
    gpu,
    collectedAt: new Date().toISOString(),
  };
}
