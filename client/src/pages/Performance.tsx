import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Pause, Play } from 'lucide-react';
import { TimeSeriesChart } from '../components/charts/MetricChart';
import { Button, Card, ErrorState, Select, Skeleton, StatCard } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useClientSettings } from '../context/SettingsContext';
import { formatBytesWithUnit, formatPercent, formatRateWithUnit, formatUptime } from '../lib/format';
import type { MetricsResponse } from '../types';

const WINDOWS = [
  { label: 'Last 1 minute', value: 60_000 },
  { label: 'Last 5 minutes', value: 300_000 },
  { label: 'Last 15 minutes', value: 900_000 },
];

export function Performance() {
  const { settings } = useClientSettings();
  const [windowMs, setWindowMs] = useState(settings.chartWindowMs);
  const [paused, setPaused] = useState(false);
  const { data, error, loading, refetch } = useApi<MetricsResponse>(
    `/metrics/snapshot?window=${windowMs}`,
    paused ? 0 : settings.pollIntervalMs,
  );

  const sample = data?.sample ?? null;
  const history = data?.history ?? [];
  const unit = settings.byteUnit;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
          <span>Samples: <span className="font-mono text-text">{history.length}</span></span>
          <span>Interval: <span className="font-mono text-text">{data?.intervalMs ?? '—'} ms</span></span>
          <span>Sampler: <span className={data?.samplerRunning ? 'text-good' : 'text-bad'}>{data?.samplerRunning ? 'running' : 'stopped'}</span></span>
          <span>Uptime: <span className="font-mono text-text">{formatUptime(sample?.uptimeSeconds)}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={windowMs} onChange={(event) => setWindowMs(Number(event.target.value))}>
            {WINDOWS.map((window) => <option key={window.value} value={window.value}>{window.label}</option>)}
          </Select>
          <Button onClick={() => setPaused((value) => !value)}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </div>

      {error && <ErrorState error={error} onRetry={() => void refetch()} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="CPU" value={formatPercent(sample?.cpuPercent ?? null)} progress={sample?.cpuPercent ?? null} />
        <StatCard label="Memory" value={formatPercent(sample?.memoryPercent ?? null)} progress={sample?.memoryPercent ?? null} tone="warn" />
        <StatCard label="Disk" value={formatPercent(sample?.diskPercent ?? null)} progress={sample?.diskPercent ?? null} />
        <StatCard label="Download" value={<span className="inline-flex items-center gap-1"><ArrowDownRight size={15} />{formatRateWithUnit(sample?.rxBytesPerSec, unit)}</span>} />
        <StatCard label="Upload" value={<span className="inline-flex items-center gap-1"><ArrowUpRight size={15} />{formatRateWithUnit(sample?.txBytesPerSec, unit)}</span>} />
      </div>

      {loading && !data ? (
        <Card title="Live metrics"><Skeleton rows={8} /></Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="CPU and memory" subtitle="Utilisation percentage over the selected window">
            <TimeSeriesChart
              data={history}
              series={[
                { key: 'cpuPercent', label: 'CPU', color: '#4fd1c5' },
                { key: 'memoryPercent', label: 'Memory', color: '#fbbf24' },
              ]}
              domain={[0, 100]}
              valueFormatter={(value) => `${value.toFixed(0)}%`}
            />
            <Legend items={[{ label: 'CPU', color: '#4fd1c5' }, { label: 'Memory', color: '#fbbf24' }]} />
          </Card>

          <Card title="Storage" subtitle="Primary volume utilisation">
            <TimeSeriesChart
              data={history}
              series={[{ key: 'diskPercent', label: 'Disk', color: '#8593a5' }]}
              domain={[0, 100]}
              valueFormatter={(value) => `${value.toFixed(0)}%`}
            />
            <p className="mt-2 text-[11px] text-muted">Current: {formatBytesWithUnit(sample?.memoryUsedBytes, unit)} memory in use · {formatPercent(sample?.diskPercent ?? null)} disk used</p>
          </Card>

          <Card title="Network throughput" subtitle="Bytes per second from the operating-system interface counters" className="xl:col-span-2">
            <TimeSeriesChart
              data={history}
              height={280}
              series={[
                { key: 'rxBytesPerSec', label: 'Download', color: '#4fd1c5' },
                { key: 'txBytesPerSec', label: 'Upload', color: '#60a5fa' },
              ]}
              valueFormatter={(value) => formatBytesWithUnit(value, unit)}
            />
            <Legend items={[{ label: 'Download', color: '#4fd1c5' }, { label: 'Upload', color: '#60a5fa' }]} />
          </Card>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted">
        Charts plot real samples collected by the local agent. Null samples (for example, the first CPU reading or an
        unavailable network counter) are omitted from lines rather than rendered as zero. Adjust the sampling rate on
        the Settings page; expensive operations remain bounded and configurable.
      </p>
    </div>
  );
}

function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
