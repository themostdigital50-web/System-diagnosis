import { useState, type ReactNode } from 'react';
import { Activity, Globe2, Network, Play, Route, Server, ShieldCheck, SquareTerminal } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { formatDuration } from '../lib/format';
import { useClientSettings } from '../context/SettingsContext';
import { Badge, Button, Card, DataRow, EmptyState, Input, RawOutput, Select, SectionTitle } from '../components/ui';
import type { DnsResult, HttpResult, PingResult, PortResult, TracerouteResult } from '../types';

type Tool = 'ping' | 'latency' | 'dns' | 'traceroute' | 'http' | 'port';

const TOOLS: Array<{ key: Tool; label: string; icon: typeof Activity; hint: string }> = [
  { key: 'ping', label: 'Ping', icon: Activity, hint: 'ICMP echo replies and packet loss' },
  { key: 'latency', label: 'Latency', icon: SquareTerminal, hint: 'Repeated probes over time' },
  { key: 'dns', label: 'DNS lookup', icon: Globe2, hint: 'Resolve a name with the OS resolver' },
  { key: 'traceroute', label: 'Traceroute', icon: Route, hint: 'Path to a remote host' },
  { key: 'http', label: 'HTTP test', icon: Server, hint: 'Status, redirects and response time' },
  { key: 'port', label: 'Port check', icon: Network, hint: 'TCP connect availability' },
];

export function Diagnostics() {
  const { settings } = useClientSettings();
  const [tool, setTool] = useState<Tool>('ping');
  const [host, setHost] = useState('1.1.1.1');
  const [url, setUrl] = useState('https://example.com');
  const [count, setCount] = useState(4);
  const [timeoutMs, setTimeoutMs] = useState(1500);
  const [dnsType, setDnsType] = useState('A');
  const [maxHops, setMaxHops] = useState(20);
  const [port, setPort] = useState(443);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      let body: Record<string, unknown>;
      if (tool === 'http') body = { url, timeoutMs: 8000 };
      else if (tool === 'port') body = { host, port, timeoutMs };
      else if (tool === 'dns') body = { host, type: dnsType };
      else if (tool === 'traceroute') body = { host, maxHops, timeoutMs };
      else body = { host, count, timeoutMs };

      setResult(await api.post(`/diagnostics/${tool}`, body));
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        setError(err.details.map((detail) => `${detail.path}: ${detail.message}`).join(' · '));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const active = TOOLS.find((item) => item.key === tool) ?? TOOLS[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <Card title="Tools" subtitle="Select a diagnostic">
        <div className="space-y-1">
          {TOOLS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTool(key); setResult(null); setError(null); }}
              className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition-colors ${
                tool === key ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-[11px] leading-relaxed text-muted">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-good" />
          Hosts and URLs are validated server-side. Native commands run without a shell and are killed after a timeout.
        </div>
      </Card>

      <div className="space-y-4">
        <Card title={active.label} subtitle={active.hint}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tool === 'http' ? (
              <Field label="URL">
                <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" />
              </Field>
            ) : (
              <Field label={tool === 'dns' ? 'Hostname' : 'Host or IP'}>
                <Input value={host} onChange={(event) => setHost(event.target.value)} placeholder="example.com" />
              </Field>
            )}

            {tool === 'dns' && (
              <Field label="Record type">
                <Select value={dnsType} onChange={(event) => setDnsType(event.target.value)}>
                  {['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA'].map((type) => <option key={type}>{type}</option>)}
                </Select>
              </Field>
            )}

            {tool === 'port' && (
              <Field label="Port">
                <Input type="number" min={1} max={65535} value={port} onChange={(event) => setPort(Number(event.target.value))} />
              </Field>
            )}

            {(tool === 'ping' || tool === 'latency') && (
              <Field label="Packets">
                <Input type="number" min={1} max={20} value={count} onChange={(event) => setCount(Number(event.target.value))} />
              </Field>
            )}

            {tool === 'traceroute' && (
              <Field label="Max hops">
                <Input type="number" min={1} max={30} value={maxHops} onChange={(event) => setMaxHops(Number(event.target.value))} />
              </Field>
            )}

            {tool !== 'http' && tool !== 'dns' && (
              <Field label="Timeout (ms)">
                <Input type="number" min={100} max={15000} step={100} value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))} />
              </Field>
            )}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <Button variant="primary" loading={busy} onClick={() => void run()}>
              <Play size={14} /> Run {active.label.toLowerCase()}
            </Button>
            <span className="text-[11px] text-muted">At most two diagnostics run at once.</span>
          </div>

          {error && <p className="mt-4 rounded border border-bad/30 bg-bad/5 p-3 text-xs text-bad">{error}</p>}
        </Card>

        <Card title="Result" subtitle="Structured output and original command output">
          {busy && <p className="text-xs text-muted">Running diagnostic…</p>}
          {!busy && !result && !error && <EmptyState>Run a diagnostic to see results here.</EmptyState>}
          {!busy && result !== null && renderResult(tool, result, settings.showRaw)}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function renderResult(tool: Tool, value: unknown, showRaw: boolean): ReactNode {
  if (tool === 'ping' || tool === 'latency') {
    const result = value as PingResult;
    return (
      <div>
        <SectionTitle hint={result.host}>ICMP probe</SectionTitle>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Sent" value={String(result.packetsSent)} />
          <MiniStat label="Received" value={String(result.packetsReceived)} />
          <MiniStat label="Packet loss" value={`${result.packetLossPercent}%`} />
          <MiniStat label="Average" value={result.avgLatencyMs === null ? '—' : `${result.avgLatencyMs} ms`} />
        </div>
        <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted">
          <span>Min: <span className="font-mono text-text">{result.minLatencyMs ?? '—'} ms</span></span>
          <span>Max: <span className="font-mono text-text">{result.maxLatencyMs ?? '—'} ms</span></span>
        </div>
        {result.replies.length > 0 ? (
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-border text-[11px] uppercase text-muted"><th className="py-2">#</th><th className="py-2">Address</th><th className="py-2">Latency</th><th className="py-2">TTL</th></tr></thead>
            <tbody className="font-mono">
              {result.replies.map((reply) => (
                <tr key={reply.seq} className="border-b border-border/60"><td className="py-1.5">{reply.seq}</td><td className="py-1.5">{reply.address}</td><td className="py-1.5">{reply.latencyMs} ms</td><td className="py-1.5">{reply.ttl ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-xs text-warn">No replies were received.</p>}
        {showRaw && <div className="mt-4"><RawOutput text={result.raw} /></div>}
      </div>
    );
  }

  if (tool === 'dns') {
    const result = value as DnsResult;
    return (
      <div>
        <SectionTitle hint={`${result.type} · ${result.host}`}>DNS records</SectionTitle>
        {result.records.length ? (
          <div className="space-y-1">
            {result.records.map((record, index) => (
              <div key={`${record.type}-${record.value}-${index}`} className="flex flex-wrap items-center gap-3 rounded border border-border bg-surface-2 px-3 py-2 text-xs">
                <Badge tone="accent">{record.type}</Badge>
                <span className="break-all font-mono">{record.value}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-warn">No records were parsed from the resolver output.</p>}
        {showRaw && <div className="mt-4"><RawOutput text={result.raw} /></div>}
      </div>
    );
  }

  if (tool === 'traceroute') {
    const result = value as TracerouteResult;
    return (
      <div>
        <SectionTitle hint={result.host}>Route</SectionTitle>
        <div className="mb-3"><Badge tone={result.completed ? 'good' : 'warn'}>{result.completed ? 'Trace completed' : 'Trace did not reach destination'}</Badge></div>
        <table className="w-full text-left text-xs">
          <thead><tr className="border-b border-border text-[11px] uppercase text-muted"><th className="py-2">Hop</th><th className="py-2">Address</th><th className="py-2">Probes</th><th className="py-2">Status</th></tr></thead>
          <tbody className="font-mono">
            {result.hops.map((hop) => (
              <tr key={hop.hop} className="border-b border-border/60">
                <td className="py-1.5">{hop.hop}</td>
                <td className="py-1.5">{hop.address ?? '*'}</td>
                <td className="py-1.5">{hop.probes.length ? hop.probes.map((probe) => `${probe} ms`).join(' / ') : '—'}</td>
                <td className="py-1.5">{hop.timedOut ? <Badge tone="warn">timeout</Badge> : <Badge tone="good">replied</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {showRaw && <div className="mt-4"><RawOutput text={result.raw} /></div>}
      </div>
    );
  }

  if (tool === 'http') {
    const result = value as HttpResult;
    return (
      <div>
        <SectionTitle hint={result.url}>HTTP response</SectionTitle>
        {result.error ? <p className="mb-3 text-xs text-bad">{result.error}</p> : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Badge tone={result.status !== null && result.status < 400 ? 'good' : 'bad'}>{result.status ?? 'No status'} {result.statusText ?? ''}</Badge>
              <span className="text-xs text-muted">{formatDuration(result.durationMs)}</span>
              {result.redirected && <Badge tone="neutral">redirected</Badge>}
            </div>
            <DataRow label="Final URL"><span className="break-all">{result.finalUrl}</span></DataRow>
            {Object.entries(result.headers).map(([key, headerValue]) => <DataRow key={key} label={key}>{headerValue}</DataRow>)}
          </>
        )}
      </div>
    );
  }

  const result = value as PortResult;
  const tone = result.state === 'open' ? 'good' : result.state === 'closed' ? 'bad' : 'warn';
  return (
    <div>
      <SectionTitle hint={`${result.host}:${result.port}`}>TCP connect</SectionTitle>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={tone}>{result.state}</Badge>
        <span className="text-xs text-muted">{result.connectMs !== null ? `Connected in ${result.connectMs} ms` : 'No connection established'}</span>
      </div>
      {result.error && <p className="mt-3 text-xs text-muted">{result.error}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-surface-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 font-mono text-base">{value}</div>
    </div>
  );
}
