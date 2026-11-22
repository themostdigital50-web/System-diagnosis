import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  Cpu,
  Laptop,
  LayoutDashboard,
  Network,
  RefreshCw,
  Settings,
  TerminalSquare,
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { useApi, REFRESH_EVENT } from '../../hooks/useApi';
import { Button } from '../ui';

interface Health {
  status: string;
  service?: string;
  platform?: string | null;
  uptimeSeconds?: number;
  label?: string;
  lastSeenAt?: string | null;
}

const ALL_NAV = [
  { to: '/devices', label: 'Devices', icon: Laptop },
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/system', label: 'System', icon: Cpu },
  { to: '/network', label: 'Network', icon: Network },
  { to: '/diagnostics', label: 'Diagnostics', icon: TerminalSquare },
  { to: '/performance', label: 'Performance', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function navClass(isActive: boolean): string {
  return `flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors ${
    isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'
  }`;
}

export function AppShell() {
  const location = useLocation();
  const { config, token, setToken } = useFleet();
  const health = useApi<Health>('/health', 30_000);
  const inDevice = location.pathname.startsWith('/device/');
  // Local-agent views would show the server's container data in fleet mode.
  const nav = config?.fleetEnabled ? ALL_NAV.filter((item) => item.to === '/devices') : ALL_NAV;
  const current = inDevice
    ? { to: '/devices', label: 'Computer', icon: Laptop }
    : (nav.find((item) => item.to === location.pathname) ?? nav[0]);
  const online = health.data?.status === 'ok';

  return (
    <div className="flex min-h-screen bg-base">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center gap-3 border-b border-border px-5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded border border-accent/40 bg-accent/10 font-mono text-xs font-bold text-accent">
            SS
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">SystemScope</div>
            <div className="truncate text-[10px] uppercase tracking-[0.16em] text-muted">
              {config?.fleetEnabled ? 'Fleet monitoring' : 'Local intelligence'}
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} title={label} className={({ isActive }) => navClass(isActive)}>
              <Icon size={17} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border px-5 py-4 text-[11px] leading-relaxed text-muted">
          {config?.fleetEnabled
            ? 'Computers report their own data through a local agent. Phones and macOS are not supported.'
            : 'Data stays on this machine. External calls are opt-out in Settings.'}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 lg:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{current.label}</h1>
            <p className="hidden text-[11px] text-muted sm:block">
              {current.to === '/' ? 'Live snapshot from the local agent' : `SystemScope / ${current.label}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-muted sm:flex">
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-good' : 'bg-bad'}`} />
              {online
                ? (inDevice ? 'Computer online' : config?.fleetEnabled ? 'Dashboard online' : 'Local agent online')
                : (inDevice ? 'Computer offline' : config?.fleetEnabled ? 'Dashboard unreachable' : 'Agent unreachable')}
            </div>
            <Button
              variant="ghost"
              className="min-h-11 min-w-11 lg:min-h-0 lg:min-w-0"
              onClick={() => window.dispatchEvent(new Event(REFRESH_EVENT))}
              title="Refresh all data"
            >
              <RefreshCw size={16} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {config?.authRequired && token && (
              <Button
                variant="ghost"
                className="min-h-11 lg:min-h-0"
                onClick={() => setToken('')}
                title="Sign out of the dashboard"
              >
                Sign out
              </Button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 lg:px-6 lg:pb-5">
          <div className="mx-auto max-w-[1400px]">
            <Suspense fallback={<div className="p-6 font-mono text-xs text-muted">Loading view…</div>}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <nav
        className={`fixed inset-x-0 bottom-0 z-40 grid ${config?.fleetEnabled ? 'grid-cols-1' : 'grid-cols-7'} border-t border-border bg-surface/95 backdrop-blur lg:hidden`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Primary"
      >
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] ${
                isActive ? 'bg-accent/10 text-accent' : 'text-muted'
              }`
            }
          >
            <Icon size={18} />
            <span className="truncate px-0.5">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
