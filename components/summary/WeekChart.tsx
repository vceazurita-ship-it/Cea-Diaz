'use client';

import { percent } from '@/lib/scoring';
import { WEEKDAY_LABELS, weekdayIndex } from '@/lib/dates';
import type { DayScore } from '@/types';

interface WeekChartProps {
  days: DayScore[];
  accent: string;
  onSelectDay?: (date: string) => void;
}

export function WeekChart({ days, accent, onSelectDay }: WeekChartProps) {
  return (
    <div className="flex h-44 items-end gap-2">
      {days.map((day) => {
        const height = Math.max(4, Math.round(day.ratio * 100));
        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onSelectDay?.(day.date)}
            title={`${day.date} · ${percent(day.ratio)}`}
            className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          >
            <span className="text-[10px] font-semibold tabular-nums t-3 opacity-0 transition-opacity group-hover:opacity-100">
              {percent(day.ratio)}
            </span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-lg transition-all duration-500 group-hover:brightness-125"
                style={{
                  height: `${height}%`,
                  backgroundColor: day.empty ? 'var(--surface-2)' : accent,
                  opacity: day.empty ? 1 : Math.max(0.45, day.ratio),
                }}
              />
            </div>
            <span className="text-[10px] font-bold uppercase t-3">
              {WEEKDAY_LABELS[weekdayIndex(day.date)]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
