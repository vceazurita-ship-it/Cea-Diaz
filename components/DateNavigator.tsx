'use client';

import {
  addDays,
  capitalize,
  formatMonth,
  friendlyDateLabel,
  isToday,
  todayKey,
  weekKeys,
  WEEKDAY_LABELS,
} from '@/lib/dates';
import type { DateKey } from '@/types';

interface DateNavigatorProps {
  date: DateKey;
  onChange: (date: DateKey) => void;
  /** Cumplimiento por día de la semana visible, para pintar la tira. */
  weekRatios?: Record<DateKey, number>;
}

export function DateNavigator({ date, onChange, weekRatios = {} }: DateNavigatorProps) {
  const today = todayKey();
  const days = weekKeys(date);

  return (
    <nav className="card p-3" aria-label="Navegación por días">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onChange(addDays(date, -1))}
          className="btn-ghost h-10 w-10 shrink-0 p-0 text-lg"
          aria-label="Día anterior"
        >
          ←
        </button>

        <div className="min-w-0 text-center">
          <p className="truncate text-base font-bold leading-tight t-1">
            {friendlyDateLabel(date)}
          </p>
          <p className="truncate text-xs t-3">{capitalize(formatMonth(date))}</p>
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onChange(today)}
            disabled={isToday(date)}
            className="btn-ghost h-10 px-3"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => onChange(addDays(date, 1))}
            disabled={date >= today}
            className="btn-ghost h-10 w-10 p-0 text-lg"
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
          const isCurrentDay = day === today;

          return (
            <button
              key={day}
              type="button"
              disabled={future}
              onClick={() => onChange(day)}
              aria-current={selected ? 'date' : undefined}
              aria-label={`${WEEKDAY_LABELS[i]} ${Number(day.slice(-2))}${
                ratio > 0 ? `, ${Math.round(ratio * 100)} %` : ', sin registro'
              }`}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 transition-colors
                disabled:cursor-not-allowed
                ${selected ? 'surf-3' : 'hover-soft'}
                ${future ? 'opacity-25' : ''}`}
            >
              <span className="text-[10px] font-bold uppercase t-3">{WEEKDAY_LABELS[i]}</span>

              {/* El día de hoy se marca con un disco de acento; el seleccionado,
                  con el fondo de la casilla. Así ambos se distinguen a la vez. */}
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm
                  font-semibold tabular-nums
                  ${isCurrentDay ? 'bg-accent t-on-accent' : selected ? 't-1' : 't-2'}`}
              >
                {Number(day.slice(-2))}
              </span>

              {/* Cumplimiento del día: barra corta en lugar de punto, para que
                  se lea de un vistazo cuánto se llenó, no sólo si hay algo. */}
              <span className="h-1 w-5 overflow-hidden rounded-full track">
                <span
                  className="block h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.round(Math.min(1, ratio) * 100)}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
