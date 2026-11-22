import { memo, useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { formatClock } from '../../lib/format';
import type { MetricSample } from '../../types';

const GRID = '#222b38';
const AXIS = '#8593a5';

export interface SeriesDef {
  key: keyof MetricSample;
  label: string;
  color: string;
}

type Domain = [number | 'auto', number | 'auto'];

/** Measure the available width so the SVG can use a 1:1 viewBox (no stretched text). */
function useWidth(initial = 600) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.max(1, Math.round(element.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/** Largest-triangle-style stride sampling keeps peaks without drawing 900 points. */
function downsample(data: MetricSample[], max: number): MetricSample[] {
  if (data.length <= max) return data;
  const step = data.length / max;
  const result: MetricSample[] = [];
  for (let index = 0; index < max; index += 1) {
    result.push(data[Math.floor(index * step)]);
  }
  result[result.length - 1] = data[data.length - 1];
  return result;
}

function resolveDomain(domain: Domain | undefined, series: SeriesDef[], data: MetricSample[]): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const sample of data) {
    for (const item of series) {
      const value = sample[item.key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (min === max) max = min + 1;
  const lower = typeof domain?.[0] === 'number' ? domain[0] : min;
  const upper = typeof domain?.[1] === 'number' ? domain[1] : max;
  return upper > lower ? [lower, upper] : [lower, lower + 1];
}

function linePath(
  points: MetricSample[],
  key: keyof MetricSample,
  x: (timestamp: number) => number,
  y: (value: number) => number,
): string {
  let path = '';
  let open = false;
  for (const point of points) {
    const value = point[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      open = false;
      continue;
    }
    path += `${open ? 'L' : 'M'}${x(point.timestamp).toFixed(1)} ${y(value).toFixed(1)}`;
    open = true;
  }
  return path;
}

export const TimeSeriesChart = memo(function TimeSeriesChart({
  data,
  series,
  height = 250,
  domain,
  valueFormatter,
}: {
  data: MetricSample[];
  series: SeriesDef[];
  height?: number;
  domain?: Domain;
  valueFormatter?: (value: number) => string;
}) {
  const [wrapperRef, width] = useWidth();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const pad = { top: 12, right: 12, bottom: 26, left: width < 420 ? 38 : 46 };
  const plotWidth = Math.max(1, width - pad.left - pad.right);
  const plotHeight = Math.max(1, height - pad.top - pad.bottom);

  const points = useMemo(() => downsample(data, width < 480 ? 60 : 120), [data, width]);
  const [lower, upper] = useMemo(() => resolveDomain(domain, series, data), [domain, series, data]);

  const firstTime = points.length ? points[0].timestamp : 0;
  const lastTime = points.length ? points[points.length - 1].timestamp : 1;
  const timeSpan = Math.max(1, lastTime - firstTime);
  const x = (timestamp: number) => pad.left + ((timestamp - firstTime) / timeSpan) * plotWidth;
  const y = (value: number) => pad.top + (1 - (value - lower) / (upper - lower)) * plotHeight;

  const formatValue = valueFormatter ?? ((value: number) => value.toFixed(1));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => lower + (upper - lower) * ratio);
  const xTicks = points.length ? [0, 0.25, 0.5, 0.75, 1].map((ratio) => firstTime + timeSpan * ratio) : [];

  const hovered = hoverIndex === null ? null : points[hoverIndex] ?? null;
  const hoverX = hovered ? x(hovered.timestamp) : 0;

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!points.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const localX = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.min(1, Math.max(0, (localX - pad.left) / plotWidth));
    const targetTime = firstTime + ratio * timeSpan;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index += 1) {
      const distance = Math.abs(points[index].timestamp - targetTime);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    setHoverIndex(nearest);
  };

  return (
    <div ref={wrapperRef} className="relative w-full" style={{ height }}>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Time series chart"
        style={{ display: 'block', touchAction: 'pan-y' }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeDasharray="3 3" />
            <text x={pad.left - 6} y={y(tick) + 3} textAnchor="end" fill={AXIS} fontSize={10}>
              {formatValue(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={`x-${tick}`} x={x(tick)} y={height - 8} textAnchor="middle" fill={AXIS} fontSize={10}>
            {formatClock(tick)}
          </text>
        ))}
        {series.map((item) => (
          <path
            key={String(item.key)}
            d={linePath(points, item.key, x, y)}
            fill="none"
            stroke={item.color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {hovered && (
          <g>
            <line x1={hoverX} x2={hoverX} y1={pad.top} y2={height - pad.bottom} stroke={AXIS} strokeDasharray="2 3" />
            {series.map((item) => {
              const value = hovered[item.key];
              if (typeof value !== 'number' || !Number.isFinite(value)) return null;
              return <circle key={String(item.key)} cx={hoverX} cy={y(value)} r={3} fill={item.color} stroke="#090c11" strokeWidth={1} />;
            })}
          </g>
        )}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-28 rounded border border-border bg-surface-2 px-2 py-1.5 text-[11px] shadow-lg"
          style={{ left: Math.max(0, Math.min(hoverX - 56, Math.max(0, width - 140))) }}
        >
          <div className="mb-1 text-muted">{formatClock(hovered.timestamp)}</div>
          {series.map((item) => {
            const value = hovered[item.key];
            return (
              <div key={String(item.key)} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <span className="inline-block h-0.5 w-3" style={{ background: item.color }} />
                  {item.label}
                </span>
                <span className="font-mono text-text">{typeof value === 'number' ? formatValue(value) : '—'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export const Sparkline = memo(function Sparkline({
  data,
  dataKey,
  color,
  height = 60,
}: {
  data: MetricSample[];
  dataKey: keyof MetricSample;
  color: string;
  height?: number;
}) {
  const [wrapperRef, width] = useWidth(320);
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const points = useMemo(
    () => downsample(data.filter((sample) => typeof sample[dataKey] === 'number' && Number.isFinite(sample[dataKey])), 80),
    [data, dataKey],
  );

  const x = (timestamp: number) => {
    if (points.length < 2) return 2;
    return 2 + ((timestamp - points[0].timestamp) / Math.max(1, points[points.length - 1].timestamp - points[0].timestamp)) * (width - 4);
  };
  let maxValue = 0;
  for (const point of points) {
    const value = point[dataKey];
    if (typeof value === 'number' && value > maxValue) maxValue = value;
  }
  const ceiling = maxValue > 0 ? maxValue * 1.1 : 1;
  const y = (value: number) => height - 2 - (value / ceiling) * (height - 4);

  const path = linePath(points, dataKey, x, y);
  const area = points.length
    ? `${path}L${x(points[points.length - 1].timestamp).toFixed(1)} ${height}L${x(points[0].timestamp).toFixed(1)} ${height}Z`
    : '';
  const latest = points.length ? points[points.length - 1][dataKey] : null;

  return (
    <div ref={wrapperRef} className="w-full" style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Metric sparkline">
        {points.length > 0 && (
          <>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        <title>{typeof latest === 'number' ? `${itemLabel(dataKey)}: ${latest.toFixed(1)}` : 'No samples yet'}</title>
      </svg>
    </div>
  );
});

function itemLabel(key: keyof MetricSample): string {
  return key === 'cpuPercent' ? 'CPU' : key === 'memoryPercent' ? 'Memory' : 'Disk';
}
