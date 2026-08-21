'use client';

import { addDays, friendlyDateLabel, isToday, todayKey, weekKeys, WEEKDAY_LABELS } from '@/lib/dates';
import type { DateKey } from '@/types';

interface DateNavigatorProps {
  date: DateKey;
  onChange: (date: DateKey) => void;
  accent: string;
  /** Cumplimiento por día de la semana visible, para pintar los puntos. */
  weekRatios?: Record<DateKey, number>;
}

export function DateNavigator({ date, onChange, accent, weekRatios = {} }: DateNavigatorProps) {
  const today = todayKey();
  const days = weekKeys(date);

  return (
    <div className="card p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onChange(addDays(date, -1))}
          className="btn-ghost px-2.5 py-1.5"
          aria-label="Día anterior"
        >
          ←
        </button>

        <div className="text-center">
          <p className="text-base font-bold leading-tight">{friendlyDateLabel(date)}</p>
          <p className="text-xs t-3">{date}</p>
        </div>

        <div className="flex gap-1">
          {!isToday(date) && (
            <button type="button" onClick={() => onChange(today)} className="btn-ghost px-2.5 py-1.5">
              Hoy
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(addDays(date, 1))}
            disabled={date >= today}
            className="btn-ghost px-2.5 py-1.5 disabled:opacity-30"
            aria-label="Día siguiente"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const selected = day === date;
          const future = day > today;
          const ratio = weekRatios[day] ?? 0;

          return (
            <button
              key={day}
              type="button"
              disabled={future}
              onClick={() => onChange(day)}
              aria-current={selected ? 'date' : undefined}
              className={`flex flex-col items-center gap-1 rounded-xl py-1.5 transition-colors
                ${selected ? 'surf-3' : 'hover-soft'}
                ${future ? 'opacity-25' : ''}`}
            >
              <span className="text-[10px] font-bold uppercase t-3">
                {WEEKDAY_LABELS[i]}
              </span>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  day === today ? 'text-white' : 't-2'
                }`}
              >
                {Number(day.slice(-2))}
              </span>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: ratio > 0 ? accent : 'var(--track)',
                  opacity: ratio > 0 ? Math.max(0.35, ratio) : 1,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
