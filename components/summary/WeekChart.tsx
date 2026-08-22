'use client';

import { percent } from '@/lib/scoring';
import { formatShort, WEEKDAY_LABELS, weekdayIndex } from '@/lib/dates';
import type { DayScore } from '@/types';

interface WeekChartProps {
  days: DayScore[];
  onSelectDay?: (date: string) => void;
}

export function WeekChart({ days, onSelectDay }: WeekChartProps) {
  return (
    <div className="flex h-44 items-end gap-2">
      {days.map((day) => {
        const height = Math.max(4, Math.round(day.ratio * 100));
        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onSelectDay?.(day.date)}
            title={`${formatShort(day.date)} · ${day.empty ? 'sin registro' : percent(day.ratio)}`}
            aria-label={`${formatShort(day.date)}, ${
              day.empty ? 'sin registro' : percent(day.ratio)
            }`}
            className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          >
            {/* El valor va siempre visible: en un móvil no existe «posar el
                ratón encima», así que esconderlo tras un :hover lo dejaba
                inalcanzable justo en el aparato desde el que más se consulta.
                En pantalla grande se refuerza al recorrer las barras. */}
            <span className="h-3 text-[10px] font-semibold tabular-nums t-3 transition-colors group-hover:t-1 group-focus-visible:t-1">
              {day.empty ? '—' : percent(day.ratio)}
            </span>
            <div className="flex w-full flex-1 items-end">
              <div
                className={`w-full rounded-t-lg transition-all duration-500 group-hover:brightness-125
                  ${day.empty ? 'surf-2' : 'bg-accent'}`}
                style={{
                  height: `${height}%`,
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
