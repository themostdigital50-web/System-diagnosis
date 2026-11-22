import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Copy, Laptop, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import { useApi } from '../hooks/useApi';
import { api, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton } from '../components/ui';
import type { DeviceSummary } from '../types';

interface EnrolledDevice {
  id: string;
  label: string;
  token: string;
}

const STATUS_TONE = {
  online: 'good',
  stale: 'warn',
  offline: 'bad',
} as const;

export function Devices() {
  const navigate = useNavigate();
  const { config } = useFleet();
  const devices = useApi<DeviceSummary[]>('/devices', 15_000);
  const [label, setLabel] = useState('');
  const [enrolled, setEnrolled] = useState<EnrolledDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const enroll = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<EnrolledDevice>('/devices', { label: label.trim() });
      setEnrolled(created);
      setLabel('');
      await devices.refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (device: DeviceSummary) => {
    if (!window.confirm(`Remove "${device.label}"? Its saved reports and token will be deleted.`)) return;
    setError(null);
    try {
      await api.delete(`/devices/${device.id}`);
      await devices.refetch();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const command = enrolled
    ? `node server/dist/agent/index.js setup ${window.location.origin} ${enrolled.id} ${enrolled.token} "${enrolled.label}"`
    : '';

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard is unavailable. Select and copy the command manually.');
    }
  };

  return (
    <div className="space-y-4">
      {!config?.storageOk && (
        <div className="flex items-start gap-3 rounded-lg border border-warn/30 bg-warn/5 p-4 text-xs leading-relaxed text-warn">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            The server could not write to its data directory. Device reports will work for this session but will be
            lost on restart. Set <span className="font-mono">DATA_DIR</span> to a writable persistent volume.
          </span>
        </div>
      )}
      {error && <ErrorState error={error} onRetry={() => void devices.refetch()} />}

      <Card
        title="Enrolled computers"
        subtitle="Only Windows and Linux computers running the device agent can report"
        actions={<Button variant="ghost" onClick={() => void devices.refetch()}><RefreshCw size={14} /> <span className="hidden sm:inline">Refresh</span></Button>}
      >
        {devices.loading && !devices.data ? <Skeleton rows={5} /> : devices.data?.length ? (
          <div className="space-y-2">
            {devices.data.map((device) => (
              <div
                key={device.id}
                className="flex flex-col gap-3 rounded border border-border bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <button
                  className="flex min-w-0 items-start gap-3 text-left"
                  onClick={() => navigate(`/device/${device.id}`)}
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded border border-accent/30 bg-accent/10 text-accent">
                    <Laptop size={17} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{device.label}</span>
                      <Badge tone={STATUS_TONE[device.status]}>{device.status}</Badge>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted">
                      {device.osName ?? 'Waiting for first report'}
                      {device.hostname ? ` · ${device.hostname}` : ''}
                      {device.cpuModel ? ` · ${device.cpuModel}` : ''}
                    </div>
                    <div className="mt-1 text-[11px] text-muted">
                      Last seen: {device.lastSeenAt ? formatDateTime(device.lastSeenAt) : 'never'}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <Button onClick={() => navigate(`/device/${device.id}`)}>Open</Button>
                  <Button variant="ghost" onClick={() => void remove(device)} title="Remove device">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No computers have been enrolled yet. Add one below.</EmptyState>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Add a computer" subtitle="Creates a one-time device token">
          <form onSubmit={(event) => void enroll(event)} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted">Computer name</span>
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Office PC"
                maxLength={80}
                required
              />
            </label>
            <Button variant="primary" type="submit" loading={busy} disabled={!label.trim()}>
              <Plus size={14} /> Enroll computer
            </Button>
            <p className="text-[11px] leading-relaxed text-muted">
              Run the generated setup command on the computer itself. The agent reads that machine&apos;s real OS data
              and sends it here over HTTPS. Only the hash of its token is stored.
            </p>
          </form>

          {enrolled && (
            <div className="mt-5 space-y-3 rounded border border-accent/30 bg-accent/5 p-3">
              <div className="text-xs font-medium text-accent">Save this now — it will not be shown again</div>
              <div className="rounded bg-base p-3 font-mono text-[11px] leading-relaxed text-text">
                <div className="break-all">Device ID: {enrolled.id}</div>
                <div className="break-all">Token: {enrolled.token}</div>
              </div>
              <div className="rounded bg-base p-3 font-mono text-[11px] leading-relaxed text-text">
                <div className="mb-2 text-muted">Setup command (run in the project folder):</div>
                <div className="break-all">{command}</div>
              </div>
              <Button onClick={() => void copyCommand()}>
                <Copy size={14} /> {copied ? 'Copied' : 'Copy setup command'}
              </Button>
            </div>
          )}
        </Card>

        <Card title="How reporting works" subtitle="Accurate data comes from the computer, not the browser">
          <ol className="space-y-3 text-xs leading-relaxed text-muted">
            <li><span className="font-medium text-text">1. Enroll.</span> Give the computer a name here and copy its one-time setup command.</li>
            <li><span className="font-medium text-text">2. Install.</span> On that Windows or Linux PC, run the setup command, then start the agent at logon.</li>
            <li><span className="font-medium text-text">3. Report.</span> The agent reads the real OS, CPU, memory, storage, network, and metrics, then posts them over HTTPS.</li>
            <li><span className="font-medium text-text">4. Inspect.</span> Open a computer from the list to see its data and run diagnostics on that machine.</li>
          </ol>
          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            Diagnostics and speed tests are queued for the selected computer and executed by its agent. Nothing runs
            arbitrary commands: only the pinned ping, DNS, traceroute, HTTP, port, and speed tools are accepted.
          </p>
          {config?.enrollmentRequired && (
            <p className="mt-3 text-[11px] text-warn">
              Scripted enrollment also accepts the server&apos;s <span className="font-mono">AGENT_ENROLLMENT_TOKEN</span>.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
