import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useFleet } from '../../context/FleetContext';
import { detectDesktopPlatform, type DesktopPlatform } from '../../lib/deviceCheck';
import { Login } from '../../pages/Login';
import { Unsupported } from '../../pages/Unsupported';

/**
 * Browser detection here is UX only. Access control is the viewer token, and
 * device identity is the per-device token; neither trusts the user agent.
 */
export function FleetGate({ children }: { children: ReactNode }) {
  const { config, token, ready } = useFleet();
  const location = useLocation();
  const [platform, setPlatform] = useState<DesktopPlatform | null>(null);

  useEffect(() => {
    let active = true;
    void detectDesktopPlatform()
      .then((value) => {
        if (active) setPlatform(value);
      })
      .catch(() => {
        if (active) setPlatform('unsupported');
      });
    return () => {
      active = false;
    };
  }, []);

  if (!ready || platform === null) {
    return <div className="grid min-h-screen place-items-center bg-base font-mono text-xs text-muted">Checking this computer…</div>;
  }
  if (platform === 'unsupported') return <Unsupported />;
  if (config?.authRequired && !token) return <Login />;
  // Never expose local/system views that would show the server's container as
  // if it were the viewer's computer.
  if (
    config?.fleetEnabled &&
    location.pathname !== '/devices' &&
    !location.pathname.startsWith('/device/')
  ) {
    return <Navigate to="/devices" replace />;
  }
  return <>{children}</>;
}
