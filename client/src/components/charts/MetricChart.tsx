import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatClock } from '../../lib/format';
import type { MetricSample } from '../../types';

const AXIS = { fill: '#8593a5', fontSize: 10 };
const GRID = '#222b38';

export interface SeriesDef {
  key: keyof MetricSample;
  label: string;
  color: string;
}

export function TimeSeriesChart({
  data,
  series,
  height = 250,
  domain,
  valueFormatter,
}: {
  data: MetricSample[];
  series: SeriesDef[];
  height?: number;
  domain?: [number | 'auto', number | 'auto'];
  valueFormatter?: (value: number) => string;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatClock}
            tick={AXIS}
            minTickGap={44}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={domain ?? [0, 'auto']}
            tick={AXIS}
            width={48}
            axisLine={false}
            tickLine={false}
            tickFormatter={valueFormatter ? (value: number) => valueFormatter(value) : undefined}
          />
          <Tooltip
            contentStyle={{ background: '#151c26', border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: '#8593a5' }}
            labelFormatter={(label) => formatClock(Number(label))}
            formatter={(value, name) => [
              valueFormatter ? valueFormatter(Number(value)) : Number(value).toFixed(1),
              String(name),
            ]}
          />
          {series.map((item) => (
            <Line
              key={String(item.key)}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({
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
  const gradientId = useId().replace(/:/g, '');

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="timestamp" tickFormatter={formatClock} hide />
          <YAxis domain={[0, 'auto']} hide />
          <Tooltip
            contentStyle={{ background: '#151c26', border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 }}
            labelFormatter={(label) => formatClock(Number(label))}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
