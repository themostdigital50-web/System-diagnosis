import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CircleGauge, Clock3, Globe2, HardDrive, MemoryStick, Cpu } from 'lucide-react';
import { errorMessage, getApiBase, runTool } from '../lib/api';
import { formatBytesWithUnit, formatPercent, formatRateWithUnit, formatUptime } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { useClientSettings } from '../context/SettingsContext';
import { Sparkline } from '../components/charts/LightweightChart';
import { Badge, Button, Card, DataRow, ErrorState, FieldValue, Skeleton, StatCard } from '../components/ui';
import type { MetricsResponse, NetworkInfo, PingResult, SystemInfo } from '../types';

export function Overview() {
  const { settings } = useClientSettings();
  // Static-ish data is polled far less often than the live metric stream.
  const system = useApi<SystemInfo>('/system/info', Math.max(settings.pollIntervalMs, 10_000));
  const network = useApi<NetworkInfo>('/network/info', 30_000);
  const metrics = useApi<MetricsResponse>(`/metrics/snapshot?window=${settings.chartWindowMs}`, settings.pollIntervalMs);
  const [latency, setLatency] = useState<PingResult | null>(null);
  const [latencyBusy, setLatencyBusy] = useState(false);
  const [latencyError, setLatencyError] = useState<string | null>(null);

  const sample = metrics.data?.sample ?? null;
  const history = useMemo(() => metrics.data?.history ?? [], [metrics.data]);
  const unit = settings.byteUnit;

  const runLatency = async () => {
    setLatencyBusy(true);
    setLatencyError(null);
    try {
      const host = network.data?.gateway.value ?? '1.1.1.1';
      setLatency(await runTool<PingResult>('ping', { host, count: 3, timeoutMs: 1500 }));
    } catch (error) {
      setLatencyError(errorMessage(error));
    } finally {
      setLatencyBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {(system.error || network.error || metrics.error) && (
        <ErrorState error={system.error ?? network.error ?? metrics.error ?? ''} onRetry={() => {
          void system.refetch();
          void network.refetch();
          void metrics.refetch();
        }} />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard
          label="CPU usage"
          value={formatPercent(sample?.cpuPercent ?? null)}
          sub={system.data?.cpu.model.value ?? 'Model unavailable'}
          progress={sample?.cpuPercent ?? null}
        />
        <StatCard
          label="Memory"
          value={formatPercent(sample?.memoryPercent ?? null)}
          sub={system.data ? `${formatBytesWithUnit(system.data.memory.usedBytes, unit)} / ${formatBytesWithUnit(system.data.memory.totalBytes, unit)}` : '—'}
          progress={sample?.memoryPercent ?? null}
          tone="warn"
        />
        <StatCard
          label="Storage"
          value={formatPercent(sample?.diskPercent ?? null)}
          sub={system.data?.storage.value?.[0]?.name ?? '—'}
          progress={sample?.diskPercent ?? null}
          tone="accent"
        />
        <StatCard
          label="Network down"
          value={<span className="inline-flex items-center gap-1"><ArrowDownRight size={16} className="text-accent" />{formatRateWithUnit(sample?.rxBytesPerSec, unit)}</span>}
          sub="Aggregated OS counter"
        />
        <StatCard
          label="Network up"
          value={<span className="inline-flex items-center gap-1"><ArrowUpRight size={16} className="text-accent" />{formatRateWithUnit(sample?.txBytesPerSec, unit)}</span>}
          sub="Aggregated OS counter"
        />
        <StatCard
          label="System uptime"
          value={formatUptime(system.data?.os.uptimeSeconds)}
          sub={system.data ? `Since ${new Date(system.data.os.bootTime).toLocaleString()}` : '—'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Operating system" subtitle="Reported by the local agent" actions={<CircleGauge size={15} className="text-muted" />}>
          {system.loading && !system.data ? <Skeleton rows={5} /> : system.data ? (
            <div>
              <DataRow label="OS"><FieldValue field={system.data.os.name} /></DataRow>
              <DataRow label="Version"><FieldValue field={system.data.os.version} /></DataRow>
              <DataRow label="Hostname">{system.data.os.hostname}</DataRow>
              <DataRow label="CPU"><FieldValue field={system.data.cpu.model} /></DataRow>
              <DataRow label="Cores / threads">
                <FieldValue field={system.data.cpu.physicalCores} /> / {system.data.cpu.logicalCores}
              </DataRow>
              <DataRow label="Architecture">{system.data.cpu.architecture}</DataRow>
            </div>
          ) : null}
        </Card>

        <Card title="Network" subtitle="Active interface and connectivity" actions={<Globe2 size={15} className="text-muted" />}>
          {network.loading && !network.data ? <Skeleton rows={5} /> : network.data ? (
            <div>
              <DataRow label="Internet">
                {network.data.internet.value ? (
                  <Badge tone={network.data.internet.value === 'online' ? 'good' : 'bad'}>{network.data.internet.value}</Badge>
                ) : (
                  <FieldValue field={network.data.internet} />
                )}
              </DataRow>
              <DataRow label="Public IP"><FieldValue field={network.data.publicIp} /></DataRow>
              <DataRow label="Interface"><FieldValue field={network.data.activeInterface} /></DataRow>
              <DataRow label="Connection"><FieldValue field={network.data.connectionType} /></DataRow>
              <DataRow label="Local IPv4"><FieldValue field={network.data.localIpv4} /></DataRow>
              <DataRow label="Gateway"><FieldValue field={network.data.gateway} /></DataRow>
            </div>
          ) : null}
        </Card>

        <Card title="Latency" subtitle="Quick probe to the default gateway" actions={<Clock3 size={15} className="text-muted" />}>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" loading={latencyBusy} onClick={() => void runLatency()}>Measure latency</Button>
            {latency && <Badge tone={latency.packetLossPercent === 0 ? 'good' : 'warn'}>{latency.packetLossPercent}% loss</Badge>}
          </div>
          {latencyError && <p className="mt-3 text-xs text-bad">{latencyError}</p>}
          {latency && (
            <div className="mt-4 grid grid-cols-3 gap-3 font-mono text-sm">
              <div><div className="text-[11px] text-muted">Average</div>{latency.avgLatencyMs ?? '—'} ms</div>
              <div><div className="text-[11px] text-muted">Min</div>{latency.minLatencyMs ?? '—'} ms</div>
              <div><div className="text-[11px] text-muted">Max</div>{latency.maxLatencyMs ?? '—'} ms</div>
            </div>
          )}
          {!latency && !latencyBusy && <p className="mt-4 text-xs text-muted">No probe has been run yet. Results are not estimated.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="CPU trend" subtitle="Sampled processor utilisation">
          <Sparkline data={history} dataKey="cpuPercent" color="#4fd1c5" />
          <div className="mt-2 flex items-center gap-2 text-xs text-muted"><Cpu size={13} /> {metrics.data?.intervalMs ?? '—'} ms sampling interval</div>
        </Card>
        <Card title="Memory trend" subtitle="Operating-system memory estimate">
          <Sparkline data={history} dataKey="memoryPercent" color="#fbbf24" />
          <div className="mt-2 flex items-center gap-2 text-xs text-muted"><MemoryStick size={13} /> {formatBytesWithUnit(sample?.memoryUsedBytes, unit)} in use</div>
        </Card>
        <Card title="Disk usage" subtitle="Primary volume utilisation">
          <Sparkline data={history} dataKey="diskPercent" color="#8593a5" />
          <div className="mt-2 flex items-center gap-2 text-xs text-muted"><HardDrive size={13} /> {formatPercent(sample?.diskPercent ?? null)} used</div>
        </Card>
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        {getApiBase()
          ? 'All metrics were collected by the agent installed on this computer. Values the operating system does not expose are shown as unavailable rather than substituted.'
          : 'All metrics originate from the local Node.js agent running on this machine. Values that the operating system does not expose are shown as unavailable rather than substituted. External lookups (public IP) are documented on the Settings page.'}
      </p>
    </div>
  );
}
