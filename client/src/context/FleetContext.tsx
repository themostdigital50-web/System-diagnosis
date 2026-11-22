import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setAuthToken } from '../lib/api';
import type { FleetConfig } from '../types';

const TOKEN_KEY = 'systemscope.viewer-token';

interface FleetContextValue {
  config: FleetConfig | null;
  token: string;
  setToken: (token: string) => void;
  ready: boolean;
}

const FleetContext = createContext<FleetContextValue | null>(null);

export function FleetProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<FleetConfig | null>(null);
  const [token, setTokenState] = useState(() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/fleet/config')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { ok?: boolean; data?: FleetConfig } | null) => {
        if (active && payload?.ok && payload.data) setConfig(payload.data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setToken = (value: string) => {
    // Synchronous: child components' fetch effects run before parent effects.
    setAuthToken(value);
    setTokenState(value);
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Private browsing can block sessionStorage; auth still works for this tab.
    }
  };

  const value = useMemo<FleetContextValue>(
    () => ({ config, token, setToken, ready }),
    [config, token, ready],
  );

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>;
}

export function useFleet(): FleetContextValue {
  const context = useContext(FleetContext);
  if (!context) throw new Error('useFleet must be used inside FleetProvider');
  return context;
}
