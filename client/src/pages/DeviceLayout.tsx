import { NavLink, Outlet } from 'react-router-dom';
import { ArrowLeft, Laptop } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { formatDateTime } from '../lib/format';
import { Badge, ErrorState, Skeleton } from '../components/ui';
import type { DeviceSummary } from '../types';

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'system', label: 'System' },
  { to: 'network', label: 'Network' },
  { to: 'diagnostics', label: 'Diagnostics' },
  { to: 'performance', label: 'Performance' },
  { to: 'settings', label: 'Settings' },
];

export function DeviceLayout() {
  const device = useApi<DeviceSummary>('/summary', 15_000);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded border border-accent/30 bg-accent/10 text-accent">
            <Laptop size={17} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold">{device.data?.label ?? 'Computer'}</h2>
              {device.data && (
                <Badge tone={device.data.status === 'online' ? 'good' : device.data.status === 'stale' ? 'warn' : 'bad'}>
                  {device.data.status}
                </Badge>
              )}
            </div>
            <div className="mt-1 truncate text-[11px] text-muted">
              {device.data?.osName ?? 'Awaiting first report'}
              {device.data?.hostname ? ` · ${device.data.hostname}` : ''}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Last report: {device.data?.lastSeenAt ? formatDateTime(device.data.lastSeenAt) : 'never'}
            </div>
          </div>
        </div>
        <NavLink to="/devices" className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-xs text-muted hover:text-text">
          <ArrowLeft size={14} /> All computers
        </NavLink>
      </div>

      {device.error && <ErrorState error={device.error} onRetry={() => void device.refetch()} />}
      {device.loading && !device.data && <Skeleton rows={3} />}

      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-px" aria-label="Device views">
        {TABS.map(({ to, label, end }) => (
          <NavLink
            key={label}
            to={to}
            end={end}
            className={({ isActive }) =>
              `shrink-0 rounded-t px-3 py-2 text-xs ${isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text'}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="rounded border border-accent/20 bg-accent/5 px-3 py-2 text-[11px] leading-relaxed text-muted">
        These values were collected by the agent on this computer, not by the server. Diagnostics run here too.
      </div>

      <Outlet />
    </div>
  );
}
