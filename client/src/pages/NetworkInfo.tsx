import { useState } from 'react';
import { Activity, Download, Globe2, Upload } from 'lucide-react';
import { errorMessage, getApiBase, runTool } from '../lib/api';
import { formatBytesWithUnit, formatDuration, formatMbps } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { useClientSettings } from '../context/SettingsContext';
import { Badge, Button, Card, DataRow, EmptyState, ErrorState, FieldValue, Select, Skeleton, SourceTag } from '../components/ui';
import type { NetworkInfo as NetworkInfoData, SpeedResult } from '../types';

interface ExtendedNavigator extends Navigator {
  connection?: { effectiveType?: string; downlink?: number; rtt?: number };
}

const SIZES = [
  { label: '1 MB', value: 1024 * 1024 },
  { label: '5 MB', value: 5 * 1024 * 1024 },
  { label: '10 MB', value: 10 * 1024 * 1024 },
  { label: '25 MB', value: 25 * 1024 * 1024 },
];

export function NetworkInfo() {
  const { settings } = useClientSettings();
  const { data, error, loading, refetch } = useApi<NetworkInfoData>('/network/info', 30_000);
  const [testBytes, setTestBytes] = useState(5 * 1024 * 1024);
  const [busy, setBusy] = useState<'download' | 'upload' | null>(null);
  const [results, setResults] = useState<Partial<Record<'download' | 'upload', SpeedResult>>>({});
  const [speedError, setSpeedError] = useState<string | null>(null);
  const nav = navigator as ExtendedNavigator;

  const runSpeed = async (direction: 'download' | 'upload') => {
    setBusy(direction);
    setSpeedError(null);
    try {
      const result = await runTool<SpeedResult>('speedtest', { direction, bytes: testBytes });
      setResults((current) => ({ ...current, [direction]: result }));
    } catch (err) {
      setSpeedError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const unit = settings.byteUnit;

  return (
    <div className="space-y-4">
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Connectivity" subtitle="External reachability check" actions={<SourceTag source="probe" />}>
          {loading && !data ? <Skeleton rows={4} /> : data ? (
            <div>
              <DataRow label="Internet">
                {data.internet.value ? (
                  <Badge tone={data.internet.value === 'online' ? 'good' : 'bad'}>{data.internet.value}</Badge>
                ) : (
                  <FieldValue field={data.internet} />
                )}
              </DataRow>
              <DataRow label="Public IPv4"><FieldValue field={data.publicIp} /></DataRow>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                Public IP is retrieved from an external HTTPS service (ipify). It is enabled by default and can be
                disabled in Settings. A failed lookup never produces a placeholder address.
              </p>
            </div>
          ) : null}
        </Card>

        <Card title="Addresses" subtitle="Local configuration from the OS" actions={<SourceTag source="os" />}>
          {loading && !data ? <Skeleton rows={6} /> : data ? (
            <div>
              <DataRow label="Local IPv4"><FieldValue field={data.localIpv4} /></DataRow>
              <DataRow label="Local IPv6"><FieldValue field={data.localIpv6} format={(values) => values.join(', ')} /></DataRow>
              <DataRow label="MAC address"><FieldValue field={data.macAddress} /></DataRow>
              <DataRow label="Default gateway"><FieldValue field={data.gateway} /></DataRow>
              <DataRow label="IPv6 gateway"><FieldValue field={data.gatewayIpv6} /></DataRow>
              <DataRow label="DNS servers"><FieldValue field={data.dnsServers} format={(values) => values.join(', ')} /></DataRow>
            </div>
          ) : null}
        </Card>

        <Card title="Interface" subtitle="Active network adapter" actions={<SourceTag source="os" />}>
          {loading && !data ? <Skeleton rows={4} /> : data ? (
            <div>
              <DataRow label="Name"><FieldValue field={data.activeInterface} /></DataRow>
              <DataRow label="Connection type"><FieldValue field={data.connectionType} /></DataRow>
              <DataRow label="Interfaces detected">{data.interfaces.length}</DataRow>
              <DataRow label="Browser online state"><Badge tone={nav.onLine ? 'good' : 'bad'}>{nav.onLine ? 'online' : 'offline'}</Badge></DataRow>
              <DataRow label="Browser effective type">{nav.connection?.effectiveType ?? 'Unavailable'}</DataRow>
            </div>
          ) : null}
        </Card>
      </div>

      <Card title="Network interfaces" subtitle="As enumerated by the operating system" actions={<Globe2 size={15} className="text-muted" />}>
        {loading && !data ? <Skeleton rows={4} /> : data ? (
          <div className="overflow-x-auto">
            <table className="mobile-cards w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Interface</th>
                  <th className="py-2 pr-4 font-medium">MAC</th>
                  <th className="py-2 pr-4 font-medium">IPv4</th>
                  <th className="py-2 pr-4 font-medium">IPv6</th>
                  <th className="py-2 pr-4 font-medium">Internal</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {data.interfaces.map((iface) => (
                  <tr key={iface.name} className="border-b border-border/60 last:border-0">
                    <td data-label="Interface" className="py-2.5 pr-4 font-sans text-sm">{iface.name}{iface.name === data.activeInterface.value && <span className="ml-2"><Badge tone="accent">active</Badge></span>}</td>
                    <td data-label="MAC" className="py-2.5 pr-4 text-muted">{iface.mac || '—'}</td>
                    <td data-label="IPv4" className="py-2.5 pr-4">{iface.ipv4.join(', ') || '—'}</td>
                    <td data-label="IPv6" className="py-2.5 pr-4 text-muted">{iface.ipv6.join(', ') || '—'}</td>
                    <td data-label="Internal" className="py-2.5 pr-4">{iface.internal ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Card
        title="Speed test"
        subtitle={getApiBase() ? 'Runs on this computer via its agent, via Cloudflare' : 'External throughput measurement via Cloudflare'}
        actions={<Activity size={15} className="text-muted" />}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Select value={testBytes} onChange={(event) => setTestBytes(Number(event.target.value))}>
            {SIZES.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
          </Select>
          <Button variant="primary" loading={busy === 'download'} onClick={() => void runSpeed('download')}>
            <Download size={14} /> Download
          </Button>
          <Button loading={busy === 'upload'} onClick={() => void runSpeed('upload')}>
            <Upload size={14} /> Upload
          </Button>
        </div>

        {speedError && <p className="mt-4 text-xs text-bad">{speedError}</p>}

        {Object.keys(results).length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="mobile-cards w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Direction</th>
                  <th className="py-2 pr-4 text-right font-medium">Throughput</th>
                  <th className="py-2 pr-4 text-right font-medium">Transferred</th>
                  <th className="py-2 pr-4 text-right font-medium">Duration</th>
                  <th className="py-2 font-medium">Provider</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {(['download', 'upload'] as const).filter((key) => results[key]).map((key) => {
                  const result = results[key] as SpeedResult;
                  return (
                    <tr key={key} className="border-b border-border/60 last:border-0">
                      <td data-label="Direction" className="py-2.5 pr-4 capitalize">{result.direction}</td>
                      <td data-label="Throughput" className="py-2.5 pr-4 text-right text-accent">{formatMbps(result.megabitsPerSecond)} Mbps</td>
                      <td data-label="Transferred" className="py-2.5 pr-4 text-right">{formatBytesWithUnit(result.transferredBytes, unit)}</td>
                      <td data-label="Duration" className="py-2.5 pr-4 text-right">{formatDuration(result.durationMs)}</td>
                      <td data-label="Provider" className="py-2.5">{result.provider}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState>No speed test has been run yet.</EmptyState>}

        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          Tests run only when you start them. Data is exchanged with an external provider, so results reflect the
          internet path — not loopback or local-network throughput. A concurrent test is rejected rather than queued.
        </p>
      </Card>
    </div>
  );
}
