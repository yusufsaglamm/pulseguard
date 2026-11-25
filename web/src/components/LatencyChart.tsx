import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonitorMetricsResponse } from '../api/client';
import { formatShortTime } from '../lib/format';

interface LatencyChartProps {
  metrics: MonitorMetricsResponse | null;
  loading: boolean;
  range: '24h' | '7d' | '30d';
  onRangeChange: (next: '24h' | '7d' | '30d') => void;
}

const RANGES: Array<{ key: '24h' | '7d' | '30d'; label: string }> = [
  { key: '24h', label: '24 Saat' },
  { key: '7d', label: '7 Gün' },
  { key: '30d', label: '30 Gün' },
];

export function LatencyChart({
  metrics,
  loading,
  range,
  onRangeChange,
}: LatencyChartProps) {
  const chartData = (metrics?.points ?? []).map((p) => ({
    ...p,
    label: formatShortTime(p.checkedAt),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <span className="text-[var(--color-muted-foreground)] mr-1.5">Ortalama:</span>
            <span className="font-mono-tabular font-semibold text-[var(--color-foreground)]">
              {metrics?.summary.avgLatencyMs !== null &&
              metrics?.summary.avgLatencyMs !== undefined
                ? `${metrics.summary.avgLatencyMs} ms`
                : '—'}
            </span>
          </div>
          <div>
            <span className="text-[var(--color-muted-foreground)] mr-1.5">P95:</span>
            <span className="font-mono-tabular font-semibold text-[var(--color-foreground)]">
              {metrics?.summary.p95LatencyMs !== null &&
              metrics?.summary.p95LatencyMs !== undefined
                ? `${metrics.summary.p95LatencyMs} ms`
                : '—'}
            </span>
          </div>
          <div>
            <span className="text-[var(--color-muted-foreground)] mr-1.5">Min / Maks:</span>
            <span className="font-mono-tabular font-semibold text-[var(--color-foreground)]">
              {metrics?.summary.minLatencyMs !== null &&
              metrics?.summary.minLatencyMs !== undefined
                ? `${metrics.summary.minLatencyMs} / ${metrics.summary.maxLatencyMs} ms`
                : '—'}
            </span>
          </div>
          <div>
            <span className="text-[var(--color-muted-foreground)] mr-1.5">Uptime:</span>
            <span className="font-mono-tabular font-semibold text-[var(--color-secondary)]">
              {metrics?.summary.uptimePct !== null &&
              metrics?.summary.uptimePct !== undefined
                ? `%${metrics.summary.uptimePct}`
                : '—'}
            </span>
          </div>
        </div>

        <div
          className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-0.5"
          role="tablist"
          aria-label="Zaman aralığı"
        >
          {RANGES.map((item) => {
            const active = item.key === range;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onRangeChange(item.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm'
                    : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-60 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            Metrikler yükleniyor...
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            Seçili aralıkta henüz kontrol verisi bulunmuyor.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.45} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                unit=" ms"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-card)',
                  borderColor: 'var(--color-border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--color-foreground)',
                }}
                formatter={(value: number) => [`${value} ms`, 'Yanıt Süresi']}
              />
              <Area
                type="monotone"
                dataKey="latencyMs"
                stroke="#22C55E"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#latencyFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
