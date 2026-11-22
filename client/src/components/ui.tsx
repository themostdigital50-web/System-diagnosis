import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import type { Field, FieldSource } from '../types';

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-border bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide text-text">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border pb-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{children}</h3>
      {hint && <span className="text-[11px] text-muted/70">{hint}</span>}
    </div>
  );
}

export function FieldValue<T>({
  field,
  format,
  suffix,
  className = '',
  mono = false,
}: {
  field?: Field<T>;
  format?: (value: T) => string;
  suffix?: string;
  className?: string;
  mono?: boolean;
}) {
  if (!field || field.value === null) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-warn">Unavailable</span>
        {field?.reason && <span className="max-w-xs text-[11px] leading-tight text-muted" title={field.reason}>{field.reason}</span>}
      </div>
    );
  }
  const text = format ? format(field.value) : String(field.value);
  return (
    <span className={`${mono ? 'font-mono' : ''} ${className}`} title={field.note}>
      {text}
      {suffix}
    </span>
  );
}

export function SourceTag({ source }: { source: FieldSource }) {
  const labels: Record<FieldSource, string> = {
    os: 'OS',
    browser: 'Browser',
    derived: 'Derived',
    external: 'External',
    probe: 'Probe',
  };
  return (
    <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
      {labels[source]}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const tones: Record<string, string> = {
    neutral: 'border-border bg-surface-2 text-muted',
    good: 'border-good/30 bg-good/10 text-good',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    bad: 'border-bad/30 bg-bad/10 text-bad',
    accent: 'border-accent/30 bg-accent/10 text-accent',
  };
  return <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function StatCard({
  label,
  value,
  sub,
  progress,
  tone = 'accent',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  progress?: number | null;
  tone?: 'accent' | 'good' | 'warn' | 'bad';
}) {
  const colors: Record<string, string> = {
    accent: 'bg-accent',
    good: 'bg-good',
    warn: 'bg-warn',
    bad: 'bg-bad',
  };
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-2 font-mono text-2xl leading-none text-text">{value}</div>
      {sub && <div className="mt-2 truncate text-xs text-muted">{sub}</div>}
      {progress !== undefined && progress !== null && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
    </div>
  );
}

export function DataRow({ label, children, mono = true }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2 last:border-0 sm:flex-row sm:items-start sm:gap-4">
      <div className="w-full shrink-0 text-xs text-muted sm:w-44">{label}</div>
      <div className={`min-w-0 flex-1 break-words text-sm ${mono ? 'font-mono' : ''}`}>{children}</div>
    </div>
  );
}

export function Button({
  children,
  variant = 'secondary',
  loading = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; loading?: boolean }) {
  const variants: Record<string, string> = {
    primary: 'border-accent/40 bg-accent/15 text-accent hover:bg-accent/25',
    secondary: 'border-border bg-surface-2 text-text hover:border-muted/50 hover:bg-surface',
    ghost: 'border-transparent bg-transparent text-muted hover:text-text hover:bg-surface-2',
  };
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded border border-border bg-base px-3 py-2 font-mono text-sm text-text outline-none placeholder:text-muted/50 focus:border-accent/60 ${props.className ?? ''}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded border border-border bg-base px-3 py-2 text-sm text-text outline-none focus:border-accent/60 ${props.className ?? ''}`}
    >
      {props.children}
    </select>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-bad/25 bg-bad/5 p-4">
      <div className="flex items-center gap-2 text-sm text-bad">
        <AlertTriangle size={16} />
        <span>{error}</span>
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="ghost">
          <RotateCw size={13} /> Retry
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${85 - index * 12}%` }} />
      ))}
    </div>
  );
}

export function RawOutput({ text, emptyText = 'No raw output captured.' }: { text?: string; emptyText?: string }) {
  if (!text) return <p className="text-xs text-muted">{emptyText}</p>;
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border bg-base p-3 font-mono text-[11px] leading-relaxed text-muted">
      {text}
    </pre>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-xs text-muted">{children}</p>;
}
