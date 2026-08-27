'use client';

import { useMemo } from 'react';
import {
  WEEKDAY_LABELS,
  addMonths,
  capitalize,
  formatMonth,
  formatLong,
  monthKeys,
  todayKey,
  weekdayIndex,
} from '@/lib/dates';
import type { DayLoad } from '@/lib/tasks';
import type { DateKey } from '@/types';

/* =========================================================================
 *  El mes, en una rejilla.
 *
 *  Lo usan dos pantallas distintas y por eso no sabe nada de tareas: recibe
 *  qué días tienen carga, cuáles están elegidos y cuáles no se pueden tocar,
 *  y avisa cuando se pica uno. Quien lo monta decide si eso significa «mira
 *  este día» o «también aquí».
 *
 *  La semana empieza en lunes, como en el resto de la app y como en el
 *  calendario de la cocina.
 * ========================================================================= */

interface MonthGridProps {
  /** Cualquier día del mes que se pinta. */
  month: DateKey;
  onMonthChange: (month: DateKey) => void;
  onPick: (day: DateKey) => void;
  /** Días marcados. En la vista de copia son los elegidos. */
  selected?: Set<DateKey>;
  /** Día resaltado con un aro; en la vista de calendario, el que se está viendo. */
  focus?: DateKey;
  /** Cuántas tareas tiene cada día, para el punto de debajo del número. */
  load?: Map<DateKey, DayLoad>;
  /** Días que ya tienen esta misma tarea: se avisan, pero se pueden elegir. */
  taken?: Set<DateKey>;
  /** Nada anterior a este día se puede picar. */
  min?: DateKey;
  /** Se lee en el título de la rejilla. */
  label: string;
}

export function MonthGrid({
  month,
  onMonthChange,
  onPick,
  selected,
  focus,
  load,
  taken,
  min,
  label,
}: MonthGridProps) {
  const today = todayKey();
  const days = useMemo(() => monthKeys(month), [month]);
  /** Huecos antes del día 1 para que cada día caiga en su columna. */
  const offset = days.length > 0 ? weekdayIndex(days[0]) : 0;

  return (
    <div className="rounded-2xl border p-3 hairline surf-1">
      {/* Mes y navegación */}
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label="Mes anterior"
          className="btn-ghost h-9 w-9 shrink-0 p-0 text-sm"
        >
          ‹
        </button>

        <p className="flex-1 text-center text-sm font-bold t-1">{capitalize(formatMonth(month))}</p>

        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label="Mes siguiente"
          className="btn-ghost h-9 w-9 shrink-0 p-0 text-sm"
        >
          ›
        </button>
      </div>

      {/* Cabecera de días */}
      <div className="grid grid-cols-7 gap-1" aria-hidden>
        {WEEKDAY_LABELS.map((day, index) => (
          <span
            key={`${day}-${index}`}
            className="pb-1 text-center text-[10px] font-bold uppercase tracking-wide t-3"
          >
            {day}
          </span>
        ))}
      </div>

      {/* Los días */}
      {/* Botones sueltos, no una rejilla ARIA: cada día es algo que se pica
          —marcarlo, o mirarlo— y así es como se anuncia. */}
      <div className="grid grid-cols-7 gap-1" role="group" aria-label={label}>
        {Array.from({ length: offset }, (_, index) => (
          <span key={`hueco-${index}`} aria-hidden />
        ))}

        {days.map((day) => {
          const busy = load?.get(day);
          const isSelected = selected?.has(day) ?? false;
          const isFocus = focus === day;
          const isToday = day === today;
          const blocked = Boolean(min && day < min);
          const already = taken?.has(day) ?? false;

          return (
            <button
              key={day}
              type="button"
              disabled={blocked}
              onClick={() => onPick(day)}
              aria-pressed={selected ? isSelected : undefined}
              aria-current={isFocus ? 'date' : undefined}
              aria-label={`${capitalize(formatLong(day))}${
                busy ? `, ${busy.total} ${busy.total === 1 ? 'tarea' : 'tareas'}` : ''
              }${already ? ', ya la tiene' : ''}`}
              className={`relative flex aspect-square min-h-[2.25rem] flex-col items-center
                justify-center rounded-xl border text-xs font-semibold tabular-nums transition-colors
                ${blocked ? 'cursor-not-allowed border-transparent t-3 opacity-35' : 'hover-soft'}
                ${
                  isSelected
                    ? 'bg-accent border-accent t-on-accent'
                    : isFocus
                      ? 'bg-accent-soft border-accent t-1'
                      : `hairline ${isToday ? 'surf-2 t-1' : 'surf-1 t-2'}`
                }`}
            >
              <span className={isToday && !isSelected ? 'underline underline-offset-2' : ''}>
                {Number(day.slice(-2))}
              </span>

              {/* Lo que ya hay ese día: un punto por tarea, hasta tres. */}
              {busy && !isSelected && (
                <span className="mt-0.5 flex gap-[2px]" aria-hidden>
                  {Array.from({ length: Math.min(busy.total, 3) }, (_, index) => (
                    <span
                      key={index}
                      className={`block h-1 w-1 rounded-full ${
                        index < busy.pending ? 'bg-accent' : 'surf-3'
                      }`}
                    />
                  ))}
                </span>
              )}

              {/* Ya tiene esta misma tarea: copiar otra vez la duplicaría. */}
              {already && (
                <span
                  aria-hidden
                  className="absolute right-0.5 top-0.5 text-[9px] leading-none"
                  title="Ya la tiene"
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
