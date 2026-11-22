import net from 'node:net';
import { config } from '../config';
import { ok, unavailable, type Field } from '../types';

interface LookupResult {
  publicIp: Field<string>;
  internet: Field<'online' | 'offline'>;
}

let cache: { ip: string; at: number } | null = null;
let inFlight: Promise<LookupResult> | null = null;

async function performLookup(): Promise<LookupResult> {
  if (!config.publicIpEnabled) {
    return {
      publicIp: unavailable('Public IP lookup is disabled in settings'),
      internet: unavailable('Internet status requires the public IP lookup to be enabled'),
    };
  }

  if (cache && Date.now() - cache.at < config.publicIpCacheMs) {
    return { publicIp: ok(cache.ip, 'external', 'Cached for 60 seconds'), internet: ok('online', 'probe') };
  }

  try {
    const response = await fetch(config.publicIpUrl, {
      signal: AbortSignal.timeout(config.publicIpTimeoutMs),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return {
        publicIp: unavailable(`Lookup service returned HTTP ${response.status}`),
        internet: ok('online', 'probe', 'Lookup service responded but did not return an IP'),
      };
    }

    const payload = (await response.json()) as { ip?: unknown };
    const ip = typeof payload.ip === 'string' ? payload.ip.trim() : null;
    if (!ip || !net.isIP(ip)) {
      return {
        publicIp: unavailable('Lookup service did not return a valid IP address'),
        internet: ok('online', 'probe'),
      };
    }

    cache = { ip, at: Date.now() };
    return { publicIp: ok(ip, 'external'), internet: ok('online', 'probe') };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return {
      publicIp: unavailable(`Lookup failed: ${message}`, 'external'),
      internet: ok('offline', 'probe', `External request failed: ${message}`),
    };
  }
}

export function lookupPublicIp(): Promise<LookupResult> {
  if (!inFlight) {
    inFlight = performLookup().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export function clearPublicIpCache(): void {
  cache = null;
}
