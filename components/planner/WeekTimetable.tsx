'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  DAY_NAMES,
  DAY_SHORT,
  PLAN_KINDS,
  blocksOfDay,
  durationLabel,
  laneLayout,
  minutesOf,
  plannedMinutes,
  rangeOf,
  timeOf,
  weekSpan,
} from '@/lib/planner';
import { statusIcon } from '@/lib/planCheck';
import type { PlanBlock, PlanKind, PlanStatus, WeekPlan } from '@/types';

/* =========================================================================
 *  La semana tipo entera, de una vez.
 *
 *  Las tarjetas de día valen para ir apartando ratos; esto vale para mirar
 *  lo apartado y ver si la semana se sostiene: siete columnas de lunes a
 *  domingo sobre la misma regla de horas, así que los huecos, los solapes y
 *  las tardes cargadas se ven sin leer nada.
 *
 *  No tiene fechas a propósito. Lo que se define aquí es la semana que se
 *  repite; el día concreto lo pone el registro, no la agenda.
 *
 *  Tres cosas que parecen adorno y no lo son: el **alto de la hora** se
 *  cambia —una semana de setenta ratos no se lee con el mismo zoom que una
 *  de diez—, la cabecera de cada día **es un botón** que abre lo que se
 *  puede hacer con ese día, y en la columna de hoy hay una **línea de la
 *  hora**, que es lo que convierte la semana tipo en «esto es lo que toca
 *  ahora».
 * ========================================================================= */

/** Altos de hora entre los que se elige. Con menos, media hora no se lee. */
export const HOUR_HEIGHTS = { compacta: 34, normal: 52, amplia: 78 } as const;

export type TimetableZoom = keyof typeof HOUR_HEIGHTS;

/** Alto de la fila de rótulos, para que la regla de horas cuadre con ella. */
const HEAD = 40;

/** A cuánto se redondea la hora cuando se pica en un hueco. */
const SNAP = 30;

interface WeekTimetableProps {
  plan: WeekPlan;
  /** Desenlace de cada rato, si se está contrastando con una semana real. */
  statusById?: Map<string, PlanStatus>;
  /** Día de la semana de hoy, sólo para señalar la columna. */
  today?: number;
  onSelect: (block: PlanBlock) => void;
  /** Picar en un hueco apunta ahí un rato nuevo. */
  onAdd: (day: number, start: string) => void;
  /** Picar en la cabecera de un día abre lo que se puede hacer con él. */
  onDay?: (day: number) => void;
  /** Rótulos en versalitas para los perfiles con piel de campo. */
  heading?: string;
  zoom?: TimetableZoom;
  /** Tipo resaltado: el resto se apaga sin desaparecer. */
  focus?: PlanKind | null;
}

export function WeekTimetable({
  plan,
  statusById,
  today,
  onSelect,
  onAdd,
  onDay,
  heading = '',
  zoom = 'normal',
  focus = null,
}: WeekTimetableProps) {
  const HOUR = HOUR_HEIGHTS[zoom];
  const span = useMemo(() => weekSpan(plan.blocks), [plan.blocks]);
  const days = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].map((day) => laneLayout(blocksOfDay(plan, day))),
    [plan],
  );

  const height = ((span.to - span.from) / 60) * HOUR;
  const hours = useMemo(() => {
    const list: number[] = [];
    for (let minute = span.from; minute <= span.to; minute += 60) list.push(minute);
    return list;
  }, [span]);

  /**
   * La hora de ahora, para la línea de la columna de hoy. Se arranca en nulo
   * y se corrige tras montar: en el servidor no hay reloj del navegador y
   * pintarla antes desajustaría la hidratación.
   */
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const date = new Date();
      setNow(date.getHours() * 60 + date.getMinutes());
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /** Dónde cae un minuto dentro de la columna. */
  const topOf = (minute: number) => ((minute - span.from) / 60) * HOUR;

  /** Picar en un hueco: la hora sale de la altura del clic, redondeada. */
  const addAt = (day: number) => (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const { top } = event.currentTarget.getBoundingClientRect();
    const minute = span.from + ((event.clientY - top) / HOUR) * 60;
    const snapped = Math.round(minute / SNAP) * SNAP;
    onAdd(day, timeOf(Math.min(Math.max(snapped, span.from), 23 * 60 + 30)));
  };

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-[680px] gap-1">
        {/* Regla de horas */}
        <div className="w-9 shrink-0">
          <div style={{ height: HEAD }} />
          <div className="relative" style={{ height }}>
            {hours.map((minute) => (
              <span
                key={minute}
                className="absolute right-1 text-[10px] font-semibold tabular-nums t-3"
                style={{ top: topOf(minute) - 6 }}
              >
                {timeOf(minute)}
              </span>
            ))}
          </div>
        </div>

        {/* Los siete días, todos a la vez */}
        {days.map(({ lanes, placed }, day) => {
          const load = plannedMinutes(placed.map((item) => item.block));

          return (
            <div key={day} className="min-w-0 flex-1">
              <div style={{ height: HEAD }} className="flex flex-col items-center justify-center">
                {onDay ? (
                  <button
                    type="button"
                    onClick={() => onDay(day)}
                    title={`Qué hacer con el ${DAY_NAMES[day].toLowerCase()}`}
                    className={`flex w-full flex-col items-center rounded-lg px-1 py-0.5 leading-tight hover-soft
                      ${day === today ? 't-accent' : 't-3'}`}
                  >
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wide ${heading}`}
                    >
                      <span className="sm:hidden">{DAY_SHORT[day]}</span>
                      <span className="hidden sm:inline">{DAY_NAMES[day]}</span>
                      {day === today && <span className="ml-1 text-[9px] normal-case">hoy</span>}
                    </span>
                    <span className="text-[9px] tabular-nums opacity-70">
                      {placed.length > 0 ? `${placed.length} · ${durationLabel(load)}` : '—'}
                    </span>
                  </button>
                ) : (
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide ${heading}
                      ${day === today ? 't-accent' : 't-3'}`}
                  >
                    <span className="sm:hidden">{DAY_SHORT[day]}</span>
                    <span className="hidden sm:inline">{DAY_NAMES[day]}</span>
                  </span>
                )}
              </div>

              <div
                role="presentation"
                onClick={addAt(day)}
                title={`Picar para apartar un rato el ${DAY_NAMES[day].toLowerCase()}`}
                className={`relative cursor-copy overflow-hidden rounded-xl border
                  ${day === today ? 'border-accent' : 'hairline'} surf-1`}
                style={{ height }}
              >
                {/* Las líneas de las horas, decorativas y sordas al ratón */}
                {hours.slice(1).map((minute) => (
                  <span
                    key={minute}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-t hairline opacity-60"
                    style={{ top: topOf(minute) }}
                  />
                ))}

                {/* La hora de ahora, sólo en la columna de hoy */}
                {day === today && now !== null && now >= span.from && now <= span.to && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-[color:var(--danger)] opacity-80"
                    style={{ top: topOf(now) }}
                  >
                    <span className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-[color:var(--danger)]" />
                  </span>
                )}

                {placed.map(({ block, lane }) => {
                  const start = minutesOf(block.start);
                  const end = Math.min(24 * 60, start + block.duration);
                  const status = statusById?.get(block.id);
                  const kindMeta = PLAN_KINDS[block.kind];
                  const tall = end - start >= 45;
                  const dimmed = focus !== null && block.kind !== focus;

                  return (
                    <button
                      key={block.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(block);
                      }}
                      title={`${rangeOf(block)} · ${block.title} · ${durationLabel(block.duration)}`}
                      className={`absolute overflow-hidden rounded-lg bg-gradient-to-br px-1.5 py-1 text-left
                                  text-white shadow-sm transition hover:brightness-110
                                  focus-visible:ring-2 ${kindMeta.gradient}
                                  ${dimmed ? 'opacity-25' : ''}`}
                      style={{
                        top: topOf(start) + 1,
                        height: Math.max(16, ((end - start) / 60) * HOUR - 2),
                        left: `${(lane / lanes) * 100}%`,
                        width: `${(1 / lanes) * 100}%`,
                      }}
                    >
                      <span className="flex items-baseline gap-1">
                        <span className="truncate text-[11px] font-bold leading-tight">
                          <span aria-hidden>{block.icon}</span> {block.title || 'Sin nombre'}
                        </span>
                        {status && status !== 'sinMetrica' && status !== 'futuro' && (
                          <span className="ml-auto shrink-0 text-[10px]" aria-hidden>
                            {statusIcon(status)}
                          </span>
                        )}
                      </span>

                      {tall && (
                        <span className="mt-0.5 block truncate text-[10px] tabular-nums opacity-80">
                          {block.start} · {durationLabel(block.duration)}
                        </span>
                      )}
                    </button>
                  );
                })}

                {placed.length === 0 && (
                  <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[10px] t-3">
                    libre
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
