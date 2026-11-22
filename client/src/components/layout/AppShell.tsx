import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  Cpu,
  LayoutDashboard,
  Network,
  RefreshCw,
  Settings,
  TerminalSquare,
} from 'lucide-react';
import { useApi, REFRESH_EVENT } from '../../hooks/useApi';
import { Button } from '../ui';

interface Health {
  status: string;
  service: string;
  platform: string;
  uptimeSeconds: number;
}

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/system', label: 'System', icon: Cpu },
  { to: '/network', label: 'Network', icon: Network },
  { to: '/diagnostics', label: 'Diagnostics', icon: TerminalSquare },
  { to: '/performance', label: 'Performance', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  const location = useLocation();
  const health = useApi<Health>('/health', 15_000);
  const current = NAV.find((item) => item.to === location.pathname) ?? NAV[0];
  const online = health.data?.status === 'ok';

  return (
    <div className="flex h-full min-h-screen bg-base">
      <aside className="flex w-14 shrink-0 flex-col border-r border-border bg-surface lg:w-60">
        <div className="flex h-14 items-center gap-3 border-b border-border px-3 lg:px-5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded border border-accent/40 bg-accent/10 font-mono text-xs font-bold text-accent">
            SS
          </div>
          <div className="hidden min-w-0 lg:block">
            <div className="truncate text-sm font-semibold tracking-tight">SystemScope</div>
            <div className="truncate text-[10px] uppercase tracking-[0.16em] text-muted">Local intelligence</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'
                }`
              }
            >
              <Icon size={17} className="shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="hidden border-t border-border px-5 py-4 text-[11px] text-muted lg:block">
          Data stays on this machine.
          <br />
          External calls are opt-out in Settings.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 lg:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{current.label}</h1>
            <p className="hidden text-[11px] text-muted sm:block">
              {current.to === '/' ? 'Live snapshot from the local agent' : `SystemScope / ${current.label}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-muted sm:flex">
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-good' : 'bg-bad'}`} />
              {online ? 'Local agent online' : 'Agent unreachable'}
            </div>
            <Button variant="ghost" onClick={() => window.dispatchEvent(new Event(REFRESH_EVENT))} title="Refresh all data">
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
          <div className="mx-auto max-w-[1400px]">
            <Suspense fallback={<div className="p-6 font-mono text-xs text-muted">Loading view…</div>}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
