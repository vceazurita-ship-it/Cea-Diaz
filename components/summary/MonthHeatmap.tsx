'use client';

import { formatShort, isFuture, WEEKDAY_LABELS, weekdayIndex } from '@/lib/dates';
import { percent } from '@/lib/scoring';
import type { DayScore } from '@/types';

interface MonthHeatmapProps {
  days: DayScore[];
  onSelectDay?: (date: string) => void;
}

/**
 * Relleno de una casilla según lo registrado ese día.
 *
 * Antes se bajaba la opacidad de un fondo de acento, y eso se llevaba por
 * delante el número: en los días flojos quedaba casi invisible, y en modo día
 * el blanco sobre un velo pálido no se leía en absoluto. Ahora se mezcla un
 * color opaco, y la mezcla se queda **entre el 16 % y el 40 %** de acento: es
 * rampa de sobra para comparar unos días con otros, y a la vez el techo que
 * mantiene el número por encima de 4,5:1 en los seis perfiles y en los dos
 * modos. Llenar la casilla del todo no dejaba contraste para nada encima.
 */
function fillFor(ratio: number): string {
  const strength = Math.round((0.16 + Math.max(0, Math.min(1, ratio)) * 0.24) * 100);
  return `color-mix(in srgb, var(--accent) ${strength}%, var(--bg-2))`;
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

        {days.map((day) => {
          // Igual que en la tira de la semana: los días que aún no han
          // llegado se ven, para que el mes esté completo, pero no se abren.
          const future = isFuture(day.date);
          const state = future
            ? 'todavía no ha llegado'
            : day.empty
              ? 'sin registro'
              : percent(day.ratio);

          return (
            <button
              key={day.date}
              type="button"
              disabled={future}
              onClick={() => onSelectDay?.(day.date)}
              title={`${formatShort(day.date)} · ${state}`}
              aria-label={`${formatShort(day.date)}, ${state}`}
              className={`flex aspect-square items-center justify-center rounded-lg text-[11px]
                         font-semibold tabular-nums transition-transform
                         ${future ? 'cursor-not-allowed opacity-40' : 'hover:scale-110'}
                         ${day.empty ? 'surf-2 t-3' : 't-1'}`}
              style={day.empty ? undefined : { backgroundColor: fillFor(day.ratio) }}
            >
              {Number(day.date.slice(-2))}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] t-3">
        <span>Menos</span>
        {[0, 0.25, 0.5, 0.75, 1].map((level) => (
          <span
            key={level}
            className="h-3 w-3 rounded"
            style={{ backgroundColor: fillFor(level) }}
          />
        ))}
        <span>Más</span>
      </div>
    </div>
  );
}
