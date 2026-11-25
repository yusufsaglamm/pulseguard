import { useState } from 'react';
import type { DayStat90 } from '../api/client';
import { formatDayLabel } from '../lib/format';

const BAR_COLORS: Record<DayStat90['status'], string> = {
  up: 'bg-[var(--color-secondary)] hover:brightness-110',
  degraded: 'bg-[var(--color-warning)] hover:brightness-110',
  down: 'bg-[var(--color-destructive)] hover:brightness-110',
  no_data: 'bg-[var(--color-no-data)] opacity-60 hover:opacity-90',
};

const DAY_STATUS_TEXT: Record<DayStat90['status'], string> = {
  up: 'Sorunsuz',
  degraded: 'Kısmi Kesinti',
  down: 'Kesinti',
  no_data: 'Veri yok',
};

export function UptimeBar90({ days }: { days: DayStat90[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeDay = activeIndex !== null ? days[activeIndex] : null;

  return (
    <div className="relative">
      <div
        className="grid h-8 w-full gap-[1px] sm:gap-[2.5px]"
        style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}
        role="group"
        aria-label="Son 90 günlük çalışma durumu"
        onMouseLeave={() => setActiveIndex(null)}
      >
        {days.map((day, idx) => {
          const summary =
            day.uptimePct !== null
              ? `${formatDayLabel(day.day)}: %${day.uptimePct} erişilebilirlik`
              : `${formatDayLabel(day.day)}: Veri yok`;

          return (
            <button
              key={day.day}
              type="button"
              tabIndex={0}
              aria-label={summary}
              onMouseEnter={() => setActiveIndex(idx)}
              onFocus={() => setActiveIndex(idx)}
              onBlur={() => setActiveIndex((prev) => (prev === idx ? null : prev))}
              className={`h-full w-full min-w-0 rounded-[2px] transition-opacity duration-150 ${BAR_COLORS[day.status]}`}
            />
          );
        })}
      </div>

      {activeDay && activeIndex !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-40 top-full mt-1.5 w-60 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-xl text-xs"
          style={{
            left: `${Math.min(Math.max((activeIndex / Math.max(days.length - 1, 1)) * 100, 16), 84)}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-medium text-[var(--color-foreground)]">
              {formatDayLabel(activeDay.day)}
            </span>
            <span className="font-mono-tabular text-[var(--color-muted-foreground)]">
              {DAY_STATUS_TEXT[activeDay.status]}
            </span>
          </div>
          {activeDay.totalChecks > 0 ? (
            <div className="grid grid-cols-2 gap-y-1 text-[var(--color-muted-foreground)]">
              <span>Erişilebilirlik:</span>
              <span className="font-mono-tabular text-right text-[var(--color-foreground)]">
                %{activeDay.uptimePct}
              </span>
              <span>Ort. Yanıt:</span>
              <span className="font-mono-tabular text-right text-[var(--color-foreground)]">
                {activeDay.avgLatencyMs} ms
              </span>
              <span>Kontrol / Kesinti:</span>
              <span className="font-mono-tabular text-right text-[var(--color-foreground)]">
                {activeDay.totalChecks} / {activeDay.downtimeIncidents}
              </span>
            </div>
          ) : (
            <p className="text-[var(--color-muted-foreground)]">
              Bu gün için kayıtlı kontrol verisi yok.
            </p>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--color-muted-foreground)]">
        <span>90 gün önce</span>
        <span>Bugün</span>
      </div>
    </div>
  );
}
