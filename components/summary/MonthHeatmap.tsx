'use client';

import { formatShort, WEEKDAY_LABELS, weekdayIndex } from '@/lib/dates';
import { percent } from '@/lib/scoring';
import type { DayScore } from '@/types';

interface MonthHeatmapProps {
  days: DayScore[];
  onSelectDay?: (date: string) => void;
}

export function MonthHeatmap({ days, onSelectDay }: MonthHeatmapProps) {
  if (days.length === 0) return null;

  // Relleno inicial para alinear el día 1 con su columna (lunes = 0).
  const offset = weekdayIndex(days[0].date);

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={`${label}-${i}`} className="text-center text-[10px] font-bold uppercase t-3">
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: offset }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}

        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            onClick={() => onSelectDay?.(day.date)}
            title={`${formatShort(day.date)} · ${day.empty ? 'sin registro' : percent(day.ratio)}`}
            aria-label={`${formatShort(day.date)}, ${
              day.empty ? 'sin registro' : percent(day.ratio)
            }`}
            className={`flex aspect-square items-center justify-center rounded-lg text-[11px]
                       font-semibold tabular-nums transition-transform hover:scale-110
                       ${day.empty ? 'surf-2 t-3' : 'bg-accent t-on-accent'}`}
            style={day.empty ? undefined : { opacity: Math.max(0.28, day.ratio) }}
          >
            {Number(day.date.slice(-2))}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] t-3">
        <span>Menos</span>
        {[0.15, 0.4, 0.65, 0.85, 1].map((level) => (
          <span key={level} className="h-3 w-3 rounded bg-accent" style={{ opacity: level }} />
        ))}
        <span>Más</span>
      </div>
    </div>
  );
}
