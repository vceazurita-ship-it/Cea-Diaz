'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
 *  Lo que la hace una agenda de verdad y no un dibujo:
 *
 *   · un rato **se arrastra** a otro día y a otra hora, y **se estira** por
 *     abajo para que dure más. Con ochenta ratos apartados, abrir un
 *     formulario para correr media hora una cena era el cuello de botella de
 *     toda la sección;
 *   · con el teclado se hace lo mismo: **Alt + flechas** mueve el rato que
 *     tenga el foco, que es como se afina sin ratón y como se llega desde un
 *     lector de pantalla;
 *   · se elige **cuántos días** se miran, porque siete columnas en un móvil
 *     no son una semana, son un acordeón;
 *   · el **alto de la hora** se cambia, la cabecera de cada día **es un
 *     botón**, y en la columna de hoy hay una **línea de la hora** que
 *     convierte la semana tipo en «esto es lo que toca ahora».
 * ========================================================================= */

/** Altos de hora entre los que se elige. Con menos, media hora no se lee. */
export const HOUR_HEIGHTS = { compacta: 34, normal: 52, amplia: 78 } as const;

export type TimetableZoom = keyof typeof HOUR_HEIGHTS;

/** Alto de la fila de rótulos, para que la regla de horas cuadre con ella. */
const HEAD = 44;

/** A cuánto se redondea la hora cuando se pica en un hueco. */
const SNAP = 30;

/** Y a cuánto al arrastrar, que es donde se afina. */
const DRAG_SNAP = 15;

/** Lo mínimo que puede durar un rato estirándolo. */
const MIN_DURATION = 10;

interface WeekTimetableProps {
  plan: WeekPlan;
  /** Desenlace de cada rato, si se está contrastando con una semana real. */
  statusById?: Map<string, PlanStatus>;
  /** Día de la semana de hoy, sólo para señalar la columna. */
  today?: number;
  /** Qué días se pintan, en orden. Por defecto, los siete. */
  days?: number[];
  onSelect: (block: PlanBlock) => void;
  /** Picar en un hueco apunta ahí un rato nuevo. */
  onAdd: (day: number, start: string) => void;
  /** Picar en la cabecera de un día abre lo que se puede hacer con él. */
  onDay?: (day: number) => void;
  /** Arrastrar un rato a otro día o a otra hora. Sin esto no se arrastra. */
  onMove?: (block: PlanBlock, day: number, start: string) => void;
  /** Estirarlo por abajo para que dure más o menos. */
  onResize?: (block: PlanBlock, duration: number) => void;
  /** Rótulos en versalitas para los perfiles con piel de campo. */
  heading?: string;
  zoom?: TimetableZoom;
  /** Tipo resaltado: el resto se apaga sin desaparecer. */
  focus?: PlanKind | null;
  /** Texto buscado: lo que no lo lleve se apaga igual que lo no resaltado. */
  query?: string;
}

/**
 * Lo que se está arrastrando ahora mismo, y adónde ha llegado.
 *
 * El cuarto de hora se redondea sobre el **desplazamiento** y no sobre la
 * hora que sale. Es lo que hace que soltar sin haber movido deje el rato
 * exactamente como estaba: redondeando la hora final, agarrar la reunión de
 * las 13:20 y no moverla la dejaba en las 13:15, y llevar una cena de un día
 * a otro le cambiaba la hora de propina.
 */
interface Drag {
  id: string;
  block: PlanBlock;
  mode: 'move' | 'resize';
  /** Minuto del día en el que estaba el puntero al agarrar. */
  origin: number;
  /** Dónde estaba el rato antes de empezar. */
  baseStart: number;
  baseDuration: number;
  /** Dónde está ahora mismo. */
  day: number;
  start: number;
  duration: number;
  /** `false` mientras no se haya movido nada: entonces sigue siendo un clic. */
  moved: boolean;
}

export function WeekTimetable({
  plan,
  statusById,
  today,
  days: visibleDays,
  onSelect,
  onAdd,
  onDay,
  onMove,
  onResize,
  heading = '',
  zoom = 'normal',
  focus = null,
  query = '',
}: WeekTimetableProps) {
  const HOUR = HOUR_HEIGHTS[zoom];
  const shownDays = useMemo(
    () => (visibleDays && visibleDays.length > 0 ? visibleDays : [0, 1, 2, 3, 4, 5, 6]),
    [visibleDays],
  );

  const span = useMemo(() => weekSpan(plan.blocks), [plan.blocks]);
  const layout = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].map((day) => laneLayout(blocksOfDay(plan, day))),
    [plan],
  );

  const height = ((span.to - span.from) / 60) * HOUR;
  const hours = useMemo(() => {
    const list: number[] = [];
    for (let minute = span.from; minute <= span.to; minute += 60) list.push(minute);
    return list;
  }, [span]);

  /** Con la hora alta se dibuja también la media, que es donde cae medio mundo. */
  const halves = useMemo(() => {
    if (HOUR < 52) return [];
    const list: number[] = [];
    for (let minute = span.from + 30; minute < span.to; minute += 60) list.push(minute);
    return list;
  }, [span, HOUR]);

  const needle = query.trim().toLowerCase();

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

  /**
   * En un aparato de dedo, arrastrar y desplazar la página son el mismo
   * gesto, así que hay que elegir: por defecto manda el desplazamiento y
   * arrastrar se enciende a mano. Con ratón no hay conflicto y va siempre.
   */
  const [coarse, setCoarse] = useState(false);
  const [handMode, setHandMode] = useState(false);

  useEffect(() => {
    setCoarse(window.matchMedia?.('(pointer: coarse)').matches ?? false);
  }, []);

  /* --------------------------------------------------------- arrastrar */

  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const columns = useRef<Array<HTMLDivElement | null>>([]);
  /** Geometría tomada al empezar: no se vuelve a medir en cada movimiento. */
  const geometry = useRef<Array<{ day: number; left: number; right: number; top: number }>>([]);

  const canDrag = Boolean(onMove) || Boolean(onResize);

  const measure = useCallback(() => {
    geometry.current = shownDays
      .map((day) => {
        const node = columns.current[day];
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { day, left: rect.left, right: rect.right, top: rect.top };
      })
      .filter((item): item is { day: number; left: number; right: number; top: number } =>
        Boolean(item),
      );
  }, [shownDays]);

  /** Dónde ha caído el puntero: qué día y qué minuto, ya redondeados. */
  const locate = (clientX: number, clientY: number) => {
    const cells = geometry.current;
    if (cells.length === 0) return null;

    let cell = cells.find((item) => clientX >= item.left && clientX <= item.right);
    if (!cell) cell = clientX < cells[0].left ? cells[0] : cells[cells.length - 1];

    const minute = span.from + ((clientY - cell.top) / HOUR) * 60;
    return { day: cell.day, minute };
  };

  const start =
    (block: PlanBlock, mode: 'move' | 'resize') => (event: React.PointerEvent<HTMLElement>) => {
      if (!canDrag || event.button !== 0) return;
      if (mode === 'move' && !onMove) return;
      if (mode === 'resize' && !onResize) return;
      // Con el dedo sólo se arrastra si se ha pedido: si no, manda el scroll.
      if (event.pointerType !== 'mouse' && !handMode) return;

      measure();
      const cell = locate(event.clientX, event.clientY);
      const at = minutesOf(block.start);

      const next: Drag = {
        id: block.id,
        block,
        mode,
        origin: cell ? cell.minute : at,
        baseStart: at,
        baseDuration: block.duration,
        day: block.day,
        start: at,
        duration: block.duration,
        moved: false,
      };

      dragRef.current = next;
      setDrag(next);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.stopPropagation();
    };

  const track = (event: React.PointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    if (!current) return;

    measure();
    const cell = locate(event.clientX, event.clientY);
    if (!cell) return;

    // Cuánto se ha movido el puntero desde que se agarró, en cuartos de hora.
    const delta = Math.round((cell.minute - current.origin) / DRAG_SNAP) * DRAG_SNAP;
    let next: Drag;

    // Todo se queda dentro de la franja pintada: un rato que se fuera por
    // arriba o por abajo se dibujaría cortado y el gesto dejaría de decir la
    // verdad. Para salir de ella está el editor, que llega a cualquier hora.
    if (current.mode === 'resize') {
      const duration = Math.max(
        MIN_DURATION,
        Math.min(span.to - current.baseStart, current.baseDuration + delta),
      );
      if (duration === current.duration && current.moved) return;
      next = { ...current, duration, moved: current.moved || duration !== current.baseDuration };
    } else {
      const startAt = Math.max(
        span.from,
        Math.min(span.to - current.baseDuration, current.baseStart + delta),
      );
      if (startAt === current.start && cell.day === current.day && current.moved) return;
      next = {
        ...current,
        day: cell.day,
        start: startAt,
        moved: current.moved || cell.day !== current.block.day || startAt !== current.baseStart,
      };
    }

    dragRef.current = next;
    setDrag(next);
  };

  const finish = (block: PlanBlock) => (event: React.PointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    dragRef.current = null;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDrag(null);
    if (!current || current.id !== block.id) return;

    // Nunca llegó a moverse: era un clic, y un clic abre el rato.
    if (!current.moved) {
      onSelect(block);
      return;
    }

    if (current.mode === 'resize') {
      if (current.duration !== block.duration) onResize?.(block, current.duration);
      return;
    }

    // Se movió y acabó volviendo a su sitio: entonces no ha pasado nada.
    if (current.day !== block.day || current.start !== minutesOf(block.start)) {
      onMove?.(block, current.day, timeOf(current.start));
    }
  };

  const abort = () => {
    dragRef.current = null;
    setDrag(null);
  };

  /**
   * Lo mismo con el teclado. Alt y las flechas: arriba y abajo corren el rato
   * un cuarto de hora, izquierda y derecha lo cambian de día. Con Mayúsculas,
   * arriba y abajo estiran y encogen en vez de mover.
   */
  const keys = (block: PlanBlock) => (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(block);
      return;
    }

    if (!event.altKey) return;
    const at = minutesOf(block.start);

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const delta = event.key === 'ArrowUp' ? -DRAG_SNAP : DRAG_SNAP;
      event.preventDefault();

      if (event.shiftKey) {
        onResize?.(block, Math.max(MIN_DURATION, Math.min(720, block.duration + delta)));
        return;
      }

      onMove?.(block, block.day, timeOf(Math.max(0, Math.min(24 * 60 - MIN_DURATION, at + delta))));
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      onMove?.(block, (block.day + delta + 7) % 7, block.start);
    }
  };

  /* ------------------------------------------------------------ pintura */

  /** Dónde cae un minuto dentro de la columna. */
  const topOf = (minute: number) => ((minute - span.from) / 60) * HOUR;

  /** Picar en un hueco: la hora sale de la altura del clic, redondeada. */
  const addAt = (day: number) => (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (dragRef.current) return;
    const { top } = event.currentTarget.getBoundingClientRect();
    const minute = span.from + ((event.clientY - top) / HOUR) * 60;
    const snapped = Math.round(minute / SNAP) * SNAP;
    onAdd(day, timeOf(Math.min(Math.max(snapped, 0), 23 * 60 + 30)));
  };

  /** Anchura mínima por columna: menos que esto y no se lee ni la hora. */
  const minColumn = shownDays.length > 4 ? 92 : shownDays.length > 2 ? 120 : 180;

  return (
    <div className="space-y-2">
      {/* Sólo aparece donde estorba el dedo: con ratón se arrastra siempre. */}
      {coarse && canDrag && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHandMode((value) => !value)}
            aria-pressed={handMode}
            className={`btn min-h-0 border px-2.5 py-1 text-[11px] font-semibold
              ${handMode ? 'bg-accent-soft border-accent t-1' : 'hairline surf-1 t-2 hover-soft'}`}
          >
            ✋ {handMode ? 'Arrastrando' : 'Arrastrar ratos'}
          </button>
          <p className="text-[10px] leading-tight t-3">
            {handMode
              ? 'Arrastra un rato a otro día o a otra hora. Vuelve a tocar para desplazar la pantalla.'
              : 'Enciéndelo para mover los ratos con el dedo.'}
          </p>
        </div>
      )}

      <div className="overflow-x-auto overscroll-x-contain pb-1">
        <div
          className="flex gap-1"
          style={{ minWidth: shownDays.length * minColumn + 40 }}
          onPointerUp={abort}
        >
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

          {/* Los días que toque, todos a la vez */}
          {shownDays.map((day) => {
            const { placed } = layout[day];
            const load = plannedMinutes(placed.map((item) => item.block));
            const hoy = day === today;
            const weekend = day >= 5;
            const landing = drag?.mode === 'move' && drag.moved && drag.day === day;

            return (
              <div key={day} className="min-w-0 flex-1">
                <div
                  style={{ height: HEAD }}
                  className="flex flex-col items-center justify-center"
                >
                  {onDay ? (
                    <button
                      type="button"
                      onClick={() => onDay(day)}
                      title={`Qué hacer con el ${DAY_NAMES[day].toLowerCase()}`}
                      className={`flex w-full flex-col items-center rounded-lg px-1 py-0.5 leading-tight hover-soft
                        ${hoy ? 't-accent' : weekend ? 't-2' : 't-3'}`}
                    >
                      <span className={`text-[11px] font-bold uppercase tracking-wide ${heading}`}>
                        <span className="sm:hidden">{DAY_SHORT[day]}</span>
                        <span className="hidden sm:inline">
                          {shownDays.length > 4 ? DAY_SHORT[day] : DAY_NAMES[day]}
                        </span>
                        {hoy && <span className="ml-1 text-[9px] normal-case">hoy</span>}
                      </span>
                      <span className="text-[9px] tabular-nums opacity-70">
                        {placed.length > 0 ? `${placed.length} · ${durationLabel(load)}` : '—'}
                      </span>
                    </button>
                  ) : (
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wide ${heading}
                        ${hoy ? 't-accent' : 't-3'}`}
                    >
                      <span className="sm:hidden">{DAY_SHORT[day]}</span>
                      <span className="hidden sm:inline">{DAY_NAMES[day]}</span>
                    </span>
                  )}
                </div>

                <div
                  ref={(node) => {
                    columns.current[day] = node;
                  }}
                  role="presentation"
                  onClick={addAt(day)}
                  title={`Picar para apartar un rato el ${DAY_NAMES[day].toLowerCase()}`}
                  className={`relative cursor-copy overflow-hidden rounded-xl border transition-colors
                    ${hoy ? 'border-accent' : 'hairline'}
                    ${landing ? 'bg-accent-faint' : weekend ? 'surf-2' : 'surf-1'}`}
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

                  {halves.map((minute) => (
                    <span
                      key={`h${minute}`}
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 border-t hairline opacity-25"
                      style={{ top: topOf(minute) }}
                    />
                  ))}

                  {/* La hora de ahora, sólo en la columna de hoy */}
                  {hoy && now !== null && now >= span.from && now <= span.to && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-[color:var(--danger)]"
                      style={{ top: topOf(now) }}
                    >
                      <span className="absolute -left-0.5 -top-[3px] h-1.5 w-1.5 rounded-full bg-[color:var(--danger)]" />
                    </span>
                  )}

                  {placed.map(({ block, lane, span: width, lanes }) => {
                    const dragging = drag?.id === block.id && drag.moved;
                    /**
                     * Mientras viaja a otro día se queda aquí, invisible. No
                     * se desmonta a propósito: es el elemento que tiene
                     * agarrado el puntero, y si desaparece a media faena el
                     * gesto no llega a soltarse nunca y el rato se queda
                     * pegado al ratón.
                     */
                    const travelling = dragging && drag.mode === 'move' && drag.day !== day;

                    // El rato que se arrastra se pinta donde ha llegado, no
                    // donde está guardado: sin eso el gesto no dice nada.
                    const from = dragging && !travelling ? drag.start : minutesOf(block.start);
                    const length =
                      dragging && drag.mode === 'resize' ? drag.duration : block.duration;
                    const to = Math.min(24 * 60, from + length);

                    const status = statusById?.get(block.id);
                    const kindMeta = PLAN_KINDS[block.kind];
                    const box = Math.max(15, ((to - from) / 60) * HOUR - 2);
                    const tall = box >= 34;
                    const roomy = box >= 52;
                    const off =
                      (focus !== null && block.kind !== focus) ||
                      (needle !== '' && !block.title.toLowerCase().includes(needle));

                    return (
                      <div
                        key={block.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${block.title || 'Sin nombre'}, ${DAY_NAMES[day]} ${rangeOf(block)}`}
                        onPointerDown={start(block, 'move')}
                        onPointerMove={track}
                        onPointerUp={finish(block)}
                        onPointerCancel={abort}
                        onKeyDown={keys(block)}
                        onClick={(event) => event.stopPropagation()}
                        title={`${rangeOf(block)} · ${block.title} · ${durationLabel(block.duration)}${
                          canDrag ? ' — arrástralo para moverlo' : ''
                        }`}
                        style={{
                          top: topOf(from) + 1,
                          height: box,
                          left: `${(lane / lanes) * 100}%`,
                          width: `calc(${(width / lanes) * 100}% - 2px)`,
                          touchAction: handMode ? 'none' : 'manipulation',
                          zIndex: dragging ? 30 : undefined,
                          visibility: travelling ? 'hidden' : undefined,
                        }}
                        className={`group absolute select-none overflow-hidden rounded-lg bg-gradient-to-br
                                    px-1.5 py-0.5 text-left text-white shadow-sm outline-none transition-[filter,opacity]
                                    hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white/80
                                    ${kindMeta.gradient}
                                    ${off ? 'opacity-20' : ''}
                                    ${dragging ? 'scale-[1.02] opacity-90 shadow-lg ring-2 ring-white/70' : ''}
                                    ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
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
                          <span className="mt-0.5 block truncate text-[10px] tabular-nums opacity-85">
                            {dragging ? timeOf(from) : block.start} · {durationLabel(length)}
                          </span>
                        )}

                        {roomy && block.metricId && (
                          <span
                            aria-hidden
                            className="absolute bottom-0.5 right-1 text-[9px] opacity-70"
                          >
                            🔗
                          </span>
                        )}

                        {/* El tirador de abajo: estirar para que dure más */}
                        {onResize && box >= 26 && (
                          <span
                            role="presentation"
                            onPointerDown={start(block, 'resize')}
                            onPointerMove={track}
                            onPointerUp={finish(block)}
                            onPointerCancel={abort}
                            style={{ touchAction: handMode ? 'none' : 'manipulation' }}
                            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0
                                       transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                          >
                            <span className="mx-auto mt-0.5 block h-0.5 w-6 rounded-full bg-white/80" />
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* La sombra de dónde va a caer lo que se arrastra */}
                  {drag?.mode === 'move' && drag.moved && drag.day === day && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute z-10 rounded-lg border-2 border-dashed border-accent"
                      style={{
                        top: topOf(drag.start) + 1,
                        height: Math.max(15, (drag.duration / 60) * HOUR - 2),
                        left: 0,
                        right: 0,
                      }}
                    >
                      <span className="absolute left-1 top-0.5 flex max-w-[calc(100%-0.5rem)] items-center gap-1
                                       rounded bg-accent px-1 text-[9px] font-bold t-on-accent">
                        <span className="tabular-nums">{timeOf(drag.start)}</span>
                        <span className="truncate">
                          {drag.block.icon} {drag.block.title || 'Sin nombre'}
                        </span>
                      </span>
                    </span>
                  )}

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
    </div>
  );
}
