import type { DnsRecord, DnsResult } from '../../types';
import { runCommand } from '../../lib/exec';

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const IPV6 = /\b(?:[a-f0-9]{1,4}:){2,7}[a-f0-9]{1,4}\b/i;
const KEY_LINE = /^\s*(canonical name|mail exchanger|nameserver|text|address(?:es)?)\s*[=:]\s*(.+)$/i;

export async function lookupDns(host: string, type: string): Promise<DnsResult> {
  const result = await runCommand('nslookup', ['-type=' + type, host], 10_000);
  const raw = (result.stdout || result.stderr).slice(0, 12_000);
  const records: DnsRecord[] = [];
  const seen = new Set<string>();
  let sawAnswer = false;
  let lastKey = '';

  const add = (key: string, value: string) => {
    const clean = value.trim().replace(/;$/, '');
    if (!clean) return;
    const dedupeKey = `${key}:${clean}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    records.push({ type: key.toUpperCase(), value: clean, ttl: null });
  };

  for (const line of raw.split(/\r?\n/)) {
    if (/non-authoritative answer|answer:|answers:|^\s*name\s*:/i.test(line)) sawAnswer = true;
    const match = KEY_LINE.exec(line);
    if (match) {
      const key = match[1].toLowerCase();
      lastKey = key;
      if (!sawAnswer && key.startsWith('address')) continue;
      if (key === 'address' || key === 'addresses') {
        const candidates = match[2].match(new RegExp(`${IPV4.source}|${IPV6.source}`, 'gi')) ?? [];
        for (const candidate of candidates) add(type, candidate);
      } else {
        add(key, match[2]);
      }
      continue;
    }

    if (sawAnswer && lastKey.startsWith('address') && /^\s+\S/.test(line) && !/^\s*(server|address):/i.test(line)) {
      const candidates = line.match(new RegExp(`${IPV4.source}|${IPV6.source}`, 'gi')) ?? [];
      for (const candidate of candidates) add(type, candidate);
    }
  }

  return { host, type, records, raw };
}
