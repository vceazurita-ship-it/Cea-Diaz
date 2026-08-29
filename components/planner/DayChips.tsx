'use client';

import { DAY_NAMES, DAY_SHORT } from '@/lib/planner';

/* =========================================================================
 *  Los siete días, para elegirlos a toques.
 *
 *  Aparece en los dos sitios donde hay que decir «a qué días»: al apartar un
 *  rato —que casi nunca es de un día solo: el cole son cinco, la cena son
 *  siete— y al copiar. Es la misma fila en los dos, a propósito: quien
 *  aprende a marcar días aquí ya sabe hacerlo allí.
 *
 *  Debajo van los atajos, que son los que de verdad ahorran el trabajo: una
 *  semana se rellena de lunes a viernes o de sábado a domingo mucho más a
 *  menudo que día por día.
 * ========================================================================= */

const WEEKDAYS = [0, 1, 2, 3, 4];
const WEEKEND = [5, 6];
const ALL = [0, 1, 2, 3, 4, 5, 6];

interface DayChipsProps {
  /** Días marcados. Con `multiple` en `false`, se usa el primero. */
  value: number[];
  onChange: (days: number[]) => void;
  /** Por defecto se marcan varios; en «mover» sólo cabe uno. */
  multiple?: boolean;
  /** Días que no se pueden marcar: el de origen al copiar. */
  disabled?: number[];
  /** Se señala, no se bloquea. */
  today?: number;
  /** Ratos que ya tiene cada día, para ver dónde se está soltando el peso. */
  counts?: number[];
  /** Los atajos sólo tienen sentido marcando varios. */
  shortcuts?: boolean;
  label?: string;
}

export function DayChips({
  value,
  onChange,
  multiple = true,
  disabled = [],
  today,
  counts,
  shortcuts = true,
  label = 'Días',
}: DayChipsProps) {
  const blocked = new Set(disabled);
  const marked = new Set(value);

  const toggle = (day: number) => {
    if (blocked.has(day)) return;
    if (!multiple) {
      onChange([day]);
      return;
    }
    onChange(marked.has(day) ? value.filter((item) => item !== day) : [...value, day].sort());
  };

  const pick = (days: number[]) => () => onChange(days.filter((day) => !blocked.has(day)));

  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide t-3">{label}</p>

      <div className="flex flex-wrap gap-1.5">
        {ALL.map((day) => {
          const off = blocked.has(day);
          const on = marked.has(day) && !off;
          const load = counts?.[day] ?? 0;

          return (
            <button
              key={day}
              type="button"
              onClick={() => toggle(day)}
              disabled={off}
              aria-pressed={on}
              aria-label={DAY_NAMES[day]}
              title={
                off
                  ? `${DAY_NAMES[day]}: es de donde sale`
                  : `${DAY_NAMES[day]}${load > 0 ? ` · ${load} apartados` : ' · sin nada'}`
              }
              className={`btn min-h-0 flex-col gap-0 border px-3 py-1.5 text-xs font-bold
                ${off ? 'cursor-not-allowed opacity-30 hairline' : ''}
                ${
                  on
                    ? 'bg-accent t-on-accent border-accent'
                    : !off
                      ? `hairline surf-1 t-2 hover-soft ${day === today ? 'border-accent' : ''}`
                      : ''
                }`}
            >
              <span>{DAY_SHORT[day]}</span>
              {counts && (
                <span className={`text-[9px] font-semibold tabular-nums ${on ? '' : 't-3'}`}>
                  {load > 0 ? load : '—'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {multiple && shortcuts && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { label: 'Toda la semana', days: ALL },
            { label: 'De lunes a viernes', days: WEEKDAYS },
            { label: 'Fin de semana', days: WEEKEND },
          ].map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              onClick={pick(shortcut.days)}
              className="btn-ghost min-h-0 px-2.5 py-1 text-[11px]"
            >
              {shortcut.label}
            </button>
          ))}

          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="btn-ghost min-h-0 px-2.5 py-1 text-[11px]"
            >
              Ninguno
            </button>
          )}
        </div>
      )}
    </div>
  );
}
