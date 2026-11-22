import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface ClientSettings {
  pollIntervalMs: number;
  chartWindowMs: number;
  byteUnit: 'binary' | 'decimal';
  showRaw: boolean;
  accent: 'teal' | 'blue' | 'amber';
}

const defaults: ClientSettings = {
  pollIntervalMs: 2000,
  chartWindowMs: 300_000,
  byteUnit: 'binary',
  showRaw: true,
  accent: 'teal',
};

const ACCENTS: Record<ClientSettings['accent'], string> = {
  teal: '#4fd1c5',
  blue: '#60a5fa',
  amber: '#fbbf24',
};

const STORAGE_KEY = 'systemscope.client-settings.v1';

interface SettingsContextValue {
  settings: ClientSettings;
  update: (patch: Partial<ClientSettings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadSettings(): ClientSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ClientSettings>;
    return {
      pollIntervalMs: [1000, 2000, 5000, 10000].includes(parsed.pollIntervalMs ?? 0)
        ? (parsed.pollIntervalMs as number)
        : defaults.pollIntervalMs,
      chartWindowMs: [60_000, 300_000, 900_000].includes(parsed.chartWindowMs ?? 0)
        ? (parsed.chartWindowMs as number)
        : defaults.chartWindowMs,
      byteUnit: parsed.byteUnit === 'decimal' ? 'decimal' : 'binary',
      showRaw: typeof parsed.showRaw === 'boolean' ? parsed.showRaw : defaults.showRaw,
      accent: parsed.accent && parsed.accent in ACCENTS ? parsed.accent : defaults.accent,
    };
  } catch {
    return defaults;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ClientSettings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    document.documentElement.style.setProperty('--color-accent', ACCENTS[settings.accent]);
  }, [settings]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      update: (patch) => setSettings((current) => ({ ...current, ...patch })),
      reset: () => setSettings(defaults),
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useClientSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useClientSettings must be used inside SettingsProvider');
  return context;
}
