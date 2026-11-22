import { useState } from 'react';
import { Badge, Card, DataRow, EmptyState, ErrorState, FieldValue, SectionTitle, Skeleton, SourceTag } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useClientSettings } from '../context/SettingsContext';
import { formatBytesWithUnit, formatDateTime, formatNumber, formatUptime } from '../lib/format';
import type { SystemInfo as SystemInfoData } from '../types';

interface ExtendedNavigator extends Navigator {
  deviceMemory?: number;
  connection?: { effectiveType?: string; downlink?: number; rtt?: number };
}

export function SystemInfo() {
  const { settings } = useClientSettings();
  const { data, error, loading, refetch } = useApi<SystemInfoData>('/system/info', settings.pollIntervalMs);
  const [showBrowser, setShowBrowser] = useState(true);
  const unit = settings.byteUnit;
  const nav = navigator as ExtendedNavigator;

  return (
    <div className="space-y-4">
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Operating system" subtitle="Operating-system level data" actions={<SourceTag source="os" />}>
          {loading && !data ? <Skeleton rows={7} /> : data ? (
            <div>
              <DataRow label="Name"><FieldValue field={data.os.name} /></DataRow>
              <DataRow label="Version"><FieldValue field={data.os.version} /></DataRow>
              <DataRow label="Build"><FieldValue field={data.os.build} /></DataRow>
              <DataRow label="Kernel release">{data.os.kernel}</DataRow>
              <DataRow label="Hostname">{data.os.hostname}</DataRow>
              <DataRow label="Platform">{data.os.platform}</DataRow>
              <DataRow label="Uptime">{formatUptime(data.os.uptimeSeconds)}</DataRow>
              <DataRow label="Boot time">{formatDateTime(data.os.bootTime)}</DataRow>
            </div>
          ) : null}
        </Card>

        <Card title="Processor" subtitle="CPU identity and topology" actions={<SourceTag source="os" />}>
          {loading && !data ? <Skeleton rows={6} /> : data ? (
            <div>
              <DataRow label="Model"><FieldValue field={data.cpu.model} /></DataRow>
              <DataRow label="Architecture">{data.cpu.architecture}</DataRow>
              <DataRow label="Physical cores"><FieldValue field={data.cpu.physicalCores} /></DataRow>
              <DataRow label="Logical processors">{data.cpu.logicalCores}</DataRow>
              <DataRow label="Threads reported">{data.cpu.threads}</DataRow>
              <DataRow label="Max speed"><FieldValue field={data.cpu.maxSpeedMHz} suffix=" MHz" format={(value) => formatNumber(value)} /></DataRow>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Memory" subtitle="Reported by Node.js os module" actions={<SourceTag source="os" />}>
          {loading && !data ? <Skeleton rows={5} /> : data ? (
            <div>
              <DataRow label="Total">{formatBytesWithUnit(data.memory.totalBytes, unit)}</DataRow>
              <DataRow label="In use">{formatBytesWithUnit(data.memory.usedBytes, unit)}</DataRow>
              <DataRow label="Free (OS estimate)">{formatBytesWithUnit(data.memory.freeBytes, unit)}</DataRow>
              <DataRow label="Utilisation">{data.memory.usedPercent.toFixed(1)}%</DataRow>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-warn" style={{ width: `${data.memory.usedPercent}%` }} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">{data.memory.note}</p>
            </div>
          ) : null}
        </Card>

        <Card title="Graphics" subtitle="GPU adapters visible to the operating system" actions={<SourceTag source="os" />}>
          {loading && !data ? <Skeleton rows={4} /> : data ? (
            data.gpu.status !== 'ok' || !data.gpu.value ? (
              <p className="text-xs text-warn">Unavailable — {data.gpu.reason ?? 'No GPU information exposed'}</p>
            ) : (
              <div className="space-y-3">
                {data.gpu.value.map((gpu, index) => (
                  <div key={`${gpu.name}-${index}`} className="rounded border border-border bg-surface-2 p-3">
                    <div className="text-sm font-medium">{gpu.name}</div>
                    <div className="mt-2 space-y-1 text-xs text-muted">
                      <div>Driver: <FieldValue field={gpu.driverVersion} /></div>
                      <div>Adapter memory: <FieldValue field={gpu.memoryBytes} format={(value) => formatBytesWithUnit(value, unit)} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </Card>
      </div>

      <Card title="Storage devices" subtitle="Filesystem capacity from statfs" actions={<SourceTag source="os" />}>
        {loading && !data ? <Skeleton rows={4} /> : data ? (
          data.storage.status !== 'ok' || !data.storage.value ? (
            <p className="text-xs text-warn">Unavailable — {data.storage.reason ?? 'No storage devices reported'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-2 pr-4 font-medium">Device</th>
                    <th className="py-2 pr-4 font-medium">Filesystem</th>
                    <th className="py-2 pr-4 text-right font-medium">Total</th>
                    <th className="py-2 pr-4 text-right font-medium">Used</th>
                    <th className="py-2 pr-4 text-right font-medium">Free</th>
                    <th className="py-2 font-medium">Usage</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {data.storage.value.map((device) => (
                    <tr key={device.mount} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4 font-sans text-sm">{device.name}<div className="text-[11px] text-muted">{device.mount}</div></td>
                      <td className="py-3 pr-4 text-muted">{device.filesystem}</td>
                      <td className="py-3 pr-4 text-right">{formatBytesWithUnit(device.totalBytes, unit)}</td>
                      <td className="py-3 pr-4 text-right">{formatBytesWithUnit(device.usedBytes, unit)}</td>
                      <td className="py-3 pr-4 text-right text-good">{formatBytesWithUnit(device.freeBytes, unit)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-20 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full bg-accent" style={{ width: `${device.usedPercent}%` }} />
                          </div>
                          <span>{device.usedPercent.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-muted">{data.storage.note}</p>
            </div>
          )
        ) : null}
      </Card>

      <Card
        title="Browser-reported information"
        subtitle="Reported by the browser, not by the operating system — do not treat as authoritative"
        actions={<button className="text-xs text-accent hover:underline" onClick={() => setShowBrowser((value) => !value)}>{showBrowser ? 'Hide' : 'Show'}</button>}
      >
        {showBrowser && (
          <div>
            <SectionTitle hint="Browser API">Client-side observations</SectionTitle>
            <DataRow label="User agent"><span className="break-all">{nav.userAgent}</span></DataRow>
            <DataRow label="Platform">{nav.platform || 'Unavailable'}</DataRow>
            <DataRow label="Language">{nav.language || 'Unavailable'}</DataRow>
            <DataRow label="Hardware concurrency">{nav.hardwareConcurrency ?? 'Unavailable'}</DataRow>
            <DataRow label="Device memory">{nav.deviceMemory ? `${nav.deviceMemory} GB` : 'Unavailable'}</DataRow>
            <DataRow label="Screen">{`${screen.width} × ${screen.height}`}</DataRow>
            <DataRow label="Online (browser)"><Badge tone={nav.onLine ? 'good' : 'bad'}>{nav.onLine ? 'online' : 'offline'}</Badge></DataRow>
            <DataRow label="Connection type">{nav.connection?.effectiveType ?? 'Unavailable'}</DataRow>
            <p className="mt-3 text-[11px] text-muted">
              These values are included only to make the browser/OS distinction explicit. SystemScope never uses them
              as a substitute for operating-system data.
            </p>
          </div>
        )}
        {!showBrowser && <EmptyState>Browser-reported details hidden.</EmptyState>}
      </Card>
    </div>
  );
}
