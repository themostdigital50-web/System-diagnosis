import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, LockKeyhole, Save, SlidersHorizontal } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { useClientSettings, type ClientSettings } from '../context/SettingsContext';
import { Button, Card, ErrorState, Input, SectionTitle, Select, Skeleton } from '../components/ui';
import type { ServerSettings } from '../types';

export function Settings() {
  const { settings, update, reset } = useClientSettings();
  const inDevice = useLocation().pathname.startsWith('/device/');
  const server = useApi<ServerSettings>('/settings');
  const [form, setForm] = useState<ServerSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (server.data) setForm({ ...server.data });
  }, [server.data]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    setSaveError(null);
    try {
      const updated = await api.put<ServerSettings>('/settings', form);
      setForm(updated);
      setMessage('Agent settings saved.');
      await server.refetch();
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const setClient = <K extends keyof ClientSettings>(key: K, value: ClientSettings[K]) => {
    update({ [key]: value } as Partial<ClientSettings>);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Interface preferences" subtitle="Stored only in this browser" actions={<SlidersHorizontal size={15} className="text-muted" />}>
        <SectionTitle>Updates and charts</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Preference label="Refresh interval">
            <Select value={settings.pollIntervalMs} onChange={(event) => setClient('pollIntervalMs', Number(event.target.value))}>
              <option value={1000}>1 second</option>
              <option value={2000}>2 seconds</option>
              <option value={5000}>5 seconds</option>
              <option value={10000}>10 seconds</option>
            </Select>
          </Preference>
          <Preference label="Chart window">
            <Select value={settings.chartWindowMs} onChange={(event) => setClient('chartWindowMs', Number(event.target.value))}>
              <option value={60_000}>1 minute</option>
              <option value={300_000}>5 minutes</option>
              <option value={900_000}>15 minutes</option>
            </Select>
          </Preference>
          <Preference label="Byte units">
            <Select value={settings.byteUnit} onChange={(event) => setClient('byteUnit', event.target.value as ClientSettings['byteUnit'])}>
              <option value="binary">Binary (KiB, MiB)</option>
              <option value="decimal">Decimal (KB, MB)</option>
            </Select>
          </Preference>
          <Preference label="Accent">
            <Select value={settings.accent} onChange={(event) => setClient('accent', event.target.value as ClientSettings['accent'])}>
              <option value="teal">Teal</option>
              <option value="blue">Blue</option>
              <option value="amber">Amber</option>
            </Select>
          </Preference>
        </div>

        <SectionTitle hint="Diagnostics">Output</SectionTitle>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={settings.showRaw}
            onChange={(event) => setClient('showRaw', event.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Show raw command output in diagnostics
        </label>

        <div className="mt-6 border-t border-border pt-4">
          <Button variant="ghost" onClick={reset}>Reset interface preferences</Button>
        </div>
      </Card>

      {inDevice && (
        <Card title="Device agent settings" subtitle="Configured on the computer itself">
          <p className="text-xs leading-relaxed text-muted">
            This computer&apos;s agent owns its sampling and diagnostic defaults. To change them, edit the agent config
            or reinstall the agent on that machine. The controls here apply only to the server&apos;s local dashboard.
          </p>
        </Card>
      )}
      {!inDevice && <Card title="Local agent" subtitle="Applied to the Node.js backend immediately" actions={<Save size={15} className="text-muted" />}>
        {server.error && <ErrorState error={server.error} onRetry={() => void server.refetch()} />}
        {server.loading && !server.data ? <Skeleton rows={8} /> : form ? (
          <div>
            <SectionTitle>Monitoring</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Preference label="Sampling interval">
                <Select value={form.metricsIntervalMs} onChange={(event) => setForm({ ...form, metricsIntervalMs: Number(event.target.value) })}>
                  <option value={1000}>1 second</option>
                  <option value={2000}>2 seconds</option>
                  <option value={5000}>5 seconds</option>
                  <option value={10000}>10 seconds</option>
                  <option value={30000}>30 seconds</option>
                </Select>
              </Preference>
              <Preference label="History window">
                <Select value={form.historyWindowMs} onChange={(event) => setForm({ ...form, historyWindowMs: Number(event.target.value) })}>
                  <option value={60_000}>1 minute</option>
                  <option value={300_000}>5 minutes</option>
                  <option value={900_000}>15 minutes</option>
                </Select>
              </Preference>
            </div>

            <SectionTitle>Diagnostics defaults</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Preference label="Ping count"><Input type="number" min={1} max={20} value={form.pingCount} onChange={(event) => setForm({ ...form, pingCount: Number(event.target.value) })} /></Preference>
              <Preference label="Ping timeout (ms)"><Input type="number" min={100} max={15000} step={100} value={form.pingTimeoutMs} onChange={(event) => setForm({ ...form, pingTimeoutMs: Number(event.target.value) })} /></Preference>
              <Preference label="Max traceroute hops"><Input type="number" min={1} max={30} value={form.tracerouteMaxHops} onChange={(event) => setForm({ ...form, tracerouteMaxHops: Number(event.target.value) })} /></Preference>
              <Preference label="HTTP timeout (ms)"><Input type="number" min={1000} max={30000} step={500} value={form.httpTimeoutMs} onChange={(event) => setForm({ ...form, httpTimeoutMs: Number(event.target.value) })} /></Preference>
            </div>

            <SectionTitle>External lookups</SectionTitle>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.publicIpEnabled}
                onChange={(event) => setForm({ ...form, publicIpEnabled: event.target.checked })}
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              />
              <span>
                Enable public IP lookup
                <span className="mt-1 block text-[11px] leading-relaxed text-muted">
                  When enabled, the agent requests your public IP from api.ipify.org. Disabling it stops the external call
                  and shows the IP as unavailable.
                </span>
              </span>
            </label>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button variant="primary" loading={saving} onClick={() => void save()}>
                <Save size={14} /> Save agent settings
              </Button>
              {message && <span className="inline-flex items-center gap-1.5 text-xs text-good"><CheckCircle2 size={14} /> {message}</span>}
              {saveError && <span className="text-xs text-bad">{saveError}</span>}
            </div>
          </div>
        ) : null}
      </Card>}

      <Card title="Privacy and limits" subtitle="How this application handles data" className="xl:col-span-2" actions={<LockKeyhole size={15} className="text-muted" />}>
        <div className="grid gap-4 text-xs leading-relaxed text-muted sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="mb-1 font-medium text-text">Access</div>Local mode binds to 127.0.0.1. Public deployments bind to all interfaces and gate device data behind the viewer password and per-device tokens.</div>
          <div><div className="mb-1 font-medium text-text">Stored reports</div>Enrolled computers send their data here; the latest report per device is written to the configured data directory with a capped metric history.</div>
          <div><div className="mb-1 font-medium text-text">External calls</div>Only two: public IP lookup (api.ipify.org) and user-started speed tests (speed.cloudflare.com).</div>
          <div><div className="mb-1 font-medium text-text">Bounded operations</div>Diagnostics validate every input, run without a shell, time out, and are limited to two concurrent runs. Speed tests are single-instance.</div>
        </div>
      </Card>
    </div>
  );
}

function Preference({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
