'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  COMPANIONS,
  DAY_NAMES,
  DAY_SHORT,
  PLAN_KINDS,
  blockPalette,
  blocksOfDay,
  durationLabel,
  gradientOf,
  isMirror,
  laneLayout,
  minutesOf,
  plannedMinutes,
  rangeOf,
  timeOf,
  weekSpan,
} from '@/lib/planner';
import type { PlanOrnament } from '@/lib/planner';
import { SILENT, statusIcon } from '@/lib/planCheck';
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
 *   · un rato **se arrastra** a otro día y a otra hora, **se estira** por
 *     abajo para que dure más y **por arriba** para empezar antes. Con
 *     ochenta ratos apartados, abrir un formulario para correr media hora una
 *     cena era el cuello de botella de toda la sección;
 *   · **se copia sin abrirlo**: arrastrándolo con Alt sale una copia donde se
 *     suelte, y el botón de la esquina lo repite detrás de sí mismo;
 *   · **se quita sin abrirlo**, con la papelera de la esquina o con la tecla
 *     de borrar, y siempre con «deshacer» detrás;
 *   · con el teclado se hace todo lo mismo: **Alt + flechas** mueve el rato
 *     que tenga el foco, que es como se afina sin ratón y como se llega desde
 *     un lector de pantalla;
 *   · lo que **se pisa** se reparte el ancho sin taparse y va marcado —filete
 *     rojo, ⚠ y la cuenta en la cabecera del día—, en vez de repartírselo en
 *     silencio; y cada pastilla enseña lo que le cabe según lo ancha que haya
 *     salido, que es lo que hace legible la hora más liada de la semana;
 *   · se elige **cuántos días** se miran, porque siete columnas en un móvil
 *     no son una semana, son un acordeón;
 *   · el **alto de la hora** se cambia, la cabecera de cada día **es un
 *     botón**, y en la columna de hoy hay una **línea de la hora** que
 *     convierte la semana tipo en «esto es lo que toca ahora».
 *
 *  Y se pinta distinta según de quién sea la semana: campo de fútbol y
 *  rótulos de dorsal para los peques, papel y filete dorado para María, regla
 *  de acero para Víctor. Es el mismo horario con la misma mecánica; lo que
 *  cambia es de quién parece.
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

/* ---------------------------------------------------------------------------
 * De quién parece la semana
 *
 * Tres maneras de pintar la misma cuadrícula. No es adorno gratuito: a un
 * peque de ocho años la semana le entra por el campo, y esa misma rejilla, en
 * papel con filete dorado, María la lee como su agenda. La mecánica —picar,
 * arrastrar, estirar, copiar, quitar— es idéntica en las tres.
 *
 *  · `solid` la pastilla es el color del tipo, con el texto en blanco. Es la
 *    de siempre y la que mejor funciona en una pantalla infantil.
 *  · `wash`  la pastilla es papel con un velo del color y un listón lateral.
 *    Se lee con el texto del propio modo, día y noche, y es lo que convierte
 *    la cuadrícula en algo de adulto sin perder el código de color.
 * ------------------------------------------------------------------------- */

interface Look {
  /** Relleno de la pastilla: color entero o papel con velo. */
  fill: 'solid' | 'wash';
  /** Forma de la columna del día. */
  column: string;
  /** Forma de la pastilla. */
  chip: string;
  /** Rótulo del título dentro de la pastilla. */
  title: string;
  /** Césped de fondo en la columna. */
  turf: boolean;
  /** Filete decorativo sobre la columna, si lo lleva. */
  rail: string | null;
  /** Rótulo de la cabecera de cada día. */
  head: string;
}

const LOOKS: Record<PlanOrnament, Look> = {
  pitch: {
    fill: 'solid',
    column: 'rounded-2xl border-2 turf',
    chip: 'rounded-xl border-2 border-white/60 shadow-md',
    title: 'font-display uppercase tracking-wide',
    turf: true,
    rail: 'linear-gradient(90deg, rgba(255,255,255,0.85), #febe10 45%, #febe10 55%, rgba(255,255,255,0.85))',
    head: 'font-display uppercase tracking-wide',
  },
  gold: {
    fill: 'wash',
    column: 'rounded-2xl border',
    chip: 'rounded-2xl border shadow-sm',
    title: 'font-display',
    turf: false,
    rail: 'linear-gradient(90deg, transparent, #d4af37 30%, #f4e2a1 50%, #d4af37 70%, transparent)',
    head: 'font-display tracking-wide',
  },
  steel: {
    fill: 'wash',
    column: 'rounded-lg border',
    chip: 'rounded-md border',
    title: 'font-semibold uppercase tracking-[0.06em]',
    turf: false,
    rail: null,
    head: 'uppercase tracking-[0.22em]',
  },
  warm: {
    fill: 'solid',
    column: 'rounded-xl border',
    chip: 'rounded-lg',
    title: 'font-bold',
    turf: false,
    rail: null,
    head: '',
  },
  rose: {
    fill: 'wash',
    column: 'rounded-2xl border',
    chip: 'rounded-2xl border shadow-sm',
    title: 'font-display',
    turf: false,
    rail: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 70%, transparent) 50%, transparent)',
    head: '',
  },
};

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
  /** Estirarlo para que dure más o menos, por abajo o por arriba. */
  onResize?: (block: PlanBlock, duration: number, start?: string) => void;
  /** Una copia donde se diga: con Alt al arrastrar, o con el botón. */
  onDuplicate?: (block: PlanBlock, day: number, start: string) => void;
  /** Quitarlo sin abrirlo. */
  onDelete?: (block: PlanBlock) => void;
  /** Rótulos en versalitas para los perfiles con piel de campo. */
  heading?: string;
  zoom?: TimetableZoom;
  /** Cómo se pinta la cuadrícula: campo, papel dorado, acero… */
  ornament?: PlanOrnament;
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
  /** `head` estira por arriba: corre el principio y deja el final donde está. */
  mode: 'move' | 'resize' | 'head';
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
  /** Con Alt puesto, lo que se suelta es una copia y el original se queda. */
  copy: boolean;
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
  onDuplicate,
  onDelete,
  heading = '',
  zoom = 'normal',
  ornament = 'warm',
  focus = null,
  query = '',
}: WeekTimetableProps) {
  const HOUR = HOUR_HEIGHTS[zoom];
  const look = LOOKS[ornament] ?? LOOKS.warm;
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

  /**
   * El rato señalado. Con el dedo no hay «pasar por encima», así que los
   * botones de copiar y quitar salen al tocar, y se quedan hasta que se toca
   * otra cosa. Con ratón manda el `hover` de siempre y esto sólo acompaña.
   */
  const [marked, setMarked] = useState<string | null>(null);


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

  const abort = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
  }, []);

  /** Escape suelta lo que se esté arrastrando y lo deja como estaba. */
  useEffect(() => {
    if (!drag) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') abort();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [drag, abort]);

  const start =
    (block: PlanBlock, mode: Drag['mode']) => (event: React.PointerEvent<HTMLElement>) => {
      if (!canDrag || event.button !== 0) return;
      if (mode === 'move' && !onMove) return;
      if (mode !== 'move' && !onResize) return;
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
        copy: mode === 'move' && Boolean(onDuplicate) && (event.altKey || event.ctrlKey),
      };

      dragRef.current = next;
      setDrag(next);
      setMarked(block.id);
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
    // Alt se puede pulsar y soltar a media faena: la copia se decide al soltar.
    const copy =
      current.mode === 'move' && Boolean(onDuplicate) && (event.altKey || event.ctrlKey);
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
    } else if (current.mode === 'head') {
      // Por arriba se corre el principio y el final se queda clavado.
      const end = current.baseStart + current.baseDuration;
      const startAt = Math.max(span.from, Math.min(end - MIN_DURATION, current.baseStart + delta));
      if (startAt === current.start && current.moved) return;
      next = {
        ...current,
        start: startAt,
        duration: end - startAt,
        moved: current.moved || startAt !== current.baseStart,
      };
    } else {
      const startAt = Math.max(
        span.from,
        Math.min(span.to - current.baseDuration, current.baseStart + delta),
      );
      if (startAt === current.start && cell.day === current.day && current.copy === copy) return;
      next = {
        ...current,
        day: cell.day,
        start: startAt,
        copy,
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

    if (current.mode === 'head') {
      if (current.start !== minutesOf(block.start)) {
        onResize?.(block, current.duration, timeOf(current.start));
      }
      return;
    }

    // Con Alt se suelta una copia y el original se queda donde estaba.
    if (current.copy && onDuplicate) {
      onDuplicate(block, current.day, timeOf(current.start));
      return;
    }

    // Se movió y acabó volviendo a su sitio: entonces no ha pasado nada.
    if (current.day !== block.day || current.start !== minutesOf(block.start)) {
      onMove?.(block, current.day, timeOf(current.start));
    }
  };

  /**
   * Lo mismo con el teclado. Alt y las flechas: arriba y abajo corren el rato
   * un cuarto de hora, izquierda y derecha lo cambian de día. Con Mayúsculas,
   * arriba y abajo estiran y encogen en vez de mover. Y sin Alt, la tecla de
   * borrar lo quita y la D lo repite, que es lo que se pide de un calendario
   * cuando ya no se quiere abrir nada.
   */
  const keys = (block: PlanBlock) => (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(block);
      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && onDelete) {
      event.preventDefault();
      onDelete(block);
      return;
    }

    if ((event.key === 'd' || event.key === 'D') && (event.altKey || event.ctrlKey)) {
      event.preventDefault();
      onDuplicate?.(
        block,
        block.day,
        timeOf(Math.min(minutesOf(block.start) + block.duration, 23 * 60 + 55)),
      );
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

  /**
   * Y en un rato prestado, sólo abrir. Mover con las flechas lo que vive en
   * otra agenda sería cambiar la semana de un peque desde aquí sin decirlo.
   */
  const borrowedKeys = (block: PlanBlock) => (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(block);
  };

  /* ------------------------------------------------------------ pintura */

  /** Dónde cae un minuto dentro de la columna. */
  const topOf = (minute: number) => ((minute - span.from) / 60) * HOUR;

  /** Picar en un hueco: la hora sale de la altura del clic, redondeada. */
  const addAt = (day: number) => (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (dragRef.current) return;
    setMarked(null);
    const { top } = event.currentTarget.getBoundingClientRect();
    const minute = span.from + ((event.clientY - top) / HOUR) * 60;
    const snapped = Math.round(minute / SNAP) * SNAP;
    onAdd(day, timeOf(Math.min(Math.max(snapped, 0), 23 * 60 + 30)));
  };

  /** Anchura mínima por columna: menos que esto y no se lee ni la hora. */
  const minColumn = shownDays.length > 4 ? 92 : shownDays.length > 2 ? 120 : 180;

  const wash = look.fill === 'wash';

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
            /* Lo prestado no se cuenta como carga propia: en la cabecera de
               María «6 · 5 h» tiene que seguir siendo lo suyo, y lo de los
               peques va aparte, con su cara. */
            const own = placed.filter((item) => !isMirror(item.block));
            const borrowed = placed.length - own.length;
            const load = plannedMinutes(own.map((item) => item.block));
            const clashing = placed.filter((item) => item.clashes > 0).length;
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
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wide ${heading} ${look.head}`}
                      >
                        <span className="sm:hidden">{DAY_SHORT[day]}</span>
                        <span className="hidden sm:inline">
                          {shownDays.length > 4 ? DAY_SHORT[day] : DAY_NAMES[day]}
                        </span>
                        {hoy && <span className="ml-1 text-[9px] normal-case">hoy</span>}
                      </span>
                      <span className="flex items-center gap-1 text-[9px] tabular-nums opacity-70">
                        {own.length > 0 ? `${own.length} · ${durationLabel(load)}` : '—'}
                        {borrowed > 0 && (
                          <span
                            title={`${borrowed} ${borrowed === 1 ? 'rato' : 'ratos'} de los peques contigo`}
                            aria-label={`${borrowed} ${borrowed === 1 ? 'rato' : 'ratos'} de los peques contigo`}
                          >
                            👧{borrowed}
                          </span>
                        )}
                        {clashing > 0 && (
                          <span
                            className="t-danger"
                            title={`${clashing} ratos se pisan con otro`}
                            aria-label={`${clashing} ratos se pisan con otro`}
                          >
                            ⚠
                          </span>
                        )}
                      </span>
                    </button>
                  ) : (
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wide ${heading} ${look.head}
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
                  className={`relative cursor-copy overflow-hidden transition-colors ${look.column}
                    ${hoy ? 'border-accent' : look.turf ? 'chalk' : 'hairline'}
                    ${landing ? 'bg-accent-faint' : weekend ? 'surf-2' : 'surf-1'}`}
                  style={{ height }}
                >
                  {/* Filete de la casa: banda blanquiazul del campo, filete
                      dorado en el papel de María. Puro adorno. */}
                  {look.rail && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-0 h-1"
                      style={{ background: look.rail }}
                    />
                  )}

                  {/* El campo: línea de medio campo, círculo central y las dos
                      áreas. Puro decorado, y por eso va debajo de todo y sordo
                      al ratón: la columna sigue siendo una columna de horas,
                      pero para Leo y Hugo es media parte y la otra media. */}
                  {look.turf && (
                    <span aria-hidden className="pointer-events-none absolute inset-0">
                      <span
                        className="absolute inset-x-0 border-t chalk opacity-70"
                        style={{ top: height / 2 }}
                      />
                      <span
                        className="absolute left-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border chalk opacity-50"
                        style={{ top: height / 2 }}
                      />
                      <span className="absolute left-1/2 top-0 h-8 w-2/3 -translate-x-1/2 rounded-b-md border-x border-b chalk opacity-40" />
                      <span className="absolute bottom-0 left-1/2 h-8 w-2/3 -translate-x-1/2 rounded-t-md border-x border-t chalk opacity-40" />
                    </span>
                  )}

                  {/* Las líneas de las horas, decorativas y sordas al ratón */}
                  {hours.slice(1).map((minute) => (
                    <span
                      key={minute}
                      aria-hidden
                      className={`pointer-events-none absolute inset-x-0 border-t opacity-60
                        ${look.turf ? 'chalk' : 'hairline'}`}
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

                  {placed.map(({ block, left, width, depth, clashes }) => {
                    const dragging = drag?.id === block.id && drag.moved;
                    /**
                     * Los ratos prestados de la agenda de un peque. Se ven, se
                     * cuentan y avisan de lo que se pisa, pero no se tocan:
                     * son de su semana, y allí se cambian. Aquí un clic sólo
                     * cuenta de quién es.
                     */
                    const borrowed = isMirror(block);
                    /**
                     * Mientras viaja a otro día se queda aquí, invisible. No
                     * se desmonta a propósito: es el elemento que tiene
                     * agarrado el puntero, y si desaparece a media faena el
                     * gesto no llega a soltarse nunca y el rato se queda
                     * pegado al ratón. Copiando sí se queda a la vista: el
                     * original no se mueve de donde está.
                     */
                    const travelling =
                      dragging && drag.mode === 'move' && !drag.copy && drag.day !== day;

                    // El rato que se arrastra se pinta donde ha llegado, no
                    // donde está guardado: sin eso el gesto no dice nada. Al
                    // copiar, el original se queda quieto y lo que se mueve es
                    // sólo la sombra de destino.
                    const ghosting = dragging && !travelling && !(drag.mode === 'move' && drag.copy);
                    const from = ghosting ? drag.start : minutesOf(block.start);
                    const length = ghosting ? drag.duration : block.duration;
                    const to = Math.min(24 * 60, from + length);

                    const status = statusById?.get(block.id);
                    /**
                     * El color: la gama del área, matizada por el nombre. Dos
                     * ratos de trabajo se siguen leyendo como trabajo, pero el
                     * análisis del rival y la reunión de staff ya no son la
                     * misma mancha gris.
                     */
                    const palette = blockPalette(block);
                    const box = Math.max(15, ((to - from) / 60) * HOUR - 2);
                    const tall = box >= 34;
                    const roomy = box >= 52;
                    /**
                     * Un rato de veinte minutos son quince píxeles de alto, y
                     * ahí el relleno de arriba y abajo se come el renglón: la
                     * lectura de antes de dormir salía partida por la mitad.
                     * Cuando el sitio es ése, se quita el relleno y se baja un
                     * punto la letra, que es la diferencia entre leerse y no.
                     */
                    const squat = box < 24;
                    const off =
                      (focus !== null && block.kind !== focus) ||
                      (needle !== '' && !block.title.toLowerCase().includes(needle));

                    /**
                     * Lo que se pisa, uno al lado del otro y sin taparse.
                     *
                     * Se probó escalonándolos, que es lo que hacen media
                     * docena de calendarios: la pastilla de delante se monta
                     * un poco encima de la de detrás. Se lee peor, no mejor
                     * —tapa justo la esquina donde están la hora y los botones
                     * del rato de debajo, y deja de verse dónde acaba cada
                     * uno—. Así que cada uno en su carril, con un canal de tres
                     * píxeles entre medias para que se vean los dos bordes, y
                     * el aviso de que se pisan se da por otro lado: filete
                     * rojo, ⚠ en la hora y la cuenta en la cabecera del día.
                     *
                     * Lo que cabe entero dentro de otro es el caso aparte: no
                     * entra en el reparto, se pinta **encima** y metido hacia
                     * dentro. La natación es en el propio colegio, así que su
                     * hora va sobre la mancha del cole en vez de partir la
                     * columna en dos medias columnas que no son verdad.
                     */
                    const widthPct = width * 100;
                    const leftPct = left * 100;

                    /**
                     * Copiar y quitar piden un sitio donde picar, así que sólo
                     * salen en pastillas con sitio: el alto se mira aquí y el
                     * ancho lo mira `.rato-util` desde el CSS. Con ratón salen
                     * al pasar por encima; con el dedo no hay «pasar por
                     * encima», así que se enseñan mientras esté puesto el modo
                     * de arrastrar, que es el que dice «vengo a tocar la
                     * semana». En lo prestado no salen nunca: no es de aquí.
                     */
                    const showTools =
                      !borrowed &&
                      (Boolean(onDuplicate) || Boolean(onDelete)) &&
                      !dragging &&
                      box >= 24;
                    const toolsOn = marked === block.id || (coarse && handMode);

                    return (
                      <div
                        key={block.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${block.title || 'Sin nombre'}, ${DAY_NAMES[day]} ${rangeOf(block)}${
                          borrowed ? `, de ${block.mirror?.name}` : ''
                        }${clashes > 0 ? ', se pisa con otro rato' : ''}${
                          depth > 0 && clashes === 0 ? ', a la vez que otro rato' : ''
                        }`}
                        onPointerDown={borrowed ? undefined : start(block, 'move')}
                        onPointerMove={borrowed ? undefined : track}
                        onPointerUp={borrowed ? undefined : finish(block)}
                        onPointerCancel={borrowed ? undefined : abort}
                        onKeyDown={borrowed ? borrowedKeys(block) : keys(block)}
                        onFocus={() => setMarked(block.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          // Lo prestado no se arrastra, así que su clic no
                          // pasa por «soltar»: se atiende aquí.
                          if (borrowed) onSelect(block);
                        }}
                        title={`${rangeOf(block)} · ${block.title} · ${durationLabel(block.duration)}${
                          borrowed
                            ? ` — de ${block.mirror?.name} (${COMPANIONS[block.mirror!.companion].label.toLowerCase()}). Se cambia en su semana.`
                            : ''
                        }${clashes > 0 ? ' — se pisa con otro rato' : ''}${
                          depth > 0 && clashes === 0 ? ' — pasa dentro de otro rato' : ''
                        }${canDrag && !borrowed ? ' — arrástralo para moverlo, con Alt para copiarlo' : ''}`}
                        style={{
                          top: topOf(from) + 1,
                          height: box,
                          left: `${leftPct}%`,
                          width: `calc(${widthPct}% - 3px)`,
                          touchAction: handMode && !borrowed ? 'none' : 'manipulation',
                          /* Lo que va dentro de otro se pinta por encima de
                             él: si no, la mancha de las cinco horas de cole se
                             comería la hora de natación. */
                          zIndex: dragging ? 30 : Math.min(4 + depth * 6 + Math.round(left * 4), 20),
                          visibility: travelling ? 'hidden' : undefined,
                          /* El color del rato: la gama de su área, matizada
                             por su nombre. En papel entra como velo y como
                             listón —lo pintan los dos <span> de abajo—; en el
                             campo, entero. */
                          backgroundImage: wash ? undefined : gradientOf(palette),
                          /* En papel el velo es suave a propósito —el texto
                             manda—, así que el color del tema se apoya también
                             en el borde: con eso dos ratos del mismo tipo se
                             distinguen sin subir el volumen del relleno. */
                          borderColor:
                            wash && !borrowed && clashes === 0
                              ? `color-mix(in srgb, ${palette.solid} 45%, transparent)`
                              : undefined,
                          /* El filete rojo de lo que se pisa. Va en línea y
                             como sombra interior a propósito: así no le quita
                             el sitio ni al anillo del foco ni al borde de la
                             piel, que son dos cosas que también tienen que
                             verse en la misma pastilla. Lo prestado lleva el
                             suyo con el color del peque, que es lo que dice de
                             quién es sin gastar una línea de texto. */
                          boxShadow:
                            clashes > 0
                              ? 'inset 0 0 0 1.5px color-mix(in srgb, var(--danger) 65%, transparent), 0 2px 6px -2px rgba(0,0,0,0.35)'
                              : borrowed
                                ? `inset 0 0 0 1.5px ${block.mirror!.tint}, 0 2px 6px -2px rgba(0,0,0,0.35)`
                                : depth > 0
                                  ? '0 3px 10px -3px rgba(0,0,0,0.45)'
                                  : undefined,
                        }}
                        className={`rato group absolute select-none overflow-hidden text-left
                                    ${squat ? 'px-1.5 py-0' : 'px-1.5 py-0.5'}
                                    outline-none transition-[filter,opacity] focus-visible:ring-2
                                    focus-visible:ring-[color:var(--ring)] ${look.chip}
                                    ${
                                      wash
                                        ? 'surf-raised t-1 hairline-strong shadow-sm hover:brightness-[1.04]'
                                        : 'text-white shadow-sm hover:brightness-110'
                                    }
                                    ${off ? 'opacity-20' : ''}
                                    ${borrowed ? 'rato-prestado' : ''}
                                    ${dragging ? 'scale-[1.02] opacity-90 shadow-lg ring-2 ring-white/70' : ''}
                                    ${canDrag && !borrowed ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                      >
                        {/* En papel, el color del tipo entra como velo y como
                            listón: se sigue leyendo de qué va sin sacrificar el
                            texto del modo, que es lo que hace premium la vista
                            de los adultos. */}
                        {wash && (
                          <>
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-0 opacity-[0.28]"
                              style={{ backgroundImage: gradientOf(palette) }}
                            />
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-y-0 left-0 w-1"
                              style={{
                                backgroundImage: borrowed
                                  ? `linear-gradient(180deg, ${block.mirror!.tint}, ${block.mirror!.tint})`
                                  : gradientOf(palette, '180deg'),
                              }}
                            />
                            {/* Brillo de canto: es lo que hace que la pastilla
                                parezca una tarjeta y no una mancha de color. */}
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40"
                            />
                          </>
                        )}

                        {/* En el campo la pastilla es color entero, así que el
                            filete del peque hay que ponerlo aparte: es lo que
                            dice de quién es el rato cuando dos hermanos tienen
                            deporte a la misma hora y los dos salen verdes. */}
                        {!wash && borrowed && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 left-0 w-1.5"
                            style={{ backgroundColor: block.mirror!.tint }}
                          />
                        )}

                        {/* Balón de fondo en lo que es deporte. Sólo en el
                            campo: en la agenda de un adulto sería un dibujo. */}
                        {look.turf && block.kind === 'deporte' && roomy && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute -bottom-2 -right-1 text-2xl opacity-25"
                          >
                            ⚽
                          </span>
                        )}

                        {/* Sin sitio para una palabra en un renglón: el emoji
                            arriba y el nombre partido debajo. Cuál de los dos
                            se enseña lo deciden `.rato-corto` y `.rato-largo`
                            por lo ancha que haya salido la pastilla, no por lo
                            ancha que sea la pantalla: es la misma semana la que
                            reparte a lo ancho, y sólo ella sabe cuánto le queda
                            a cada rato. */}
                        <span
                          className={`rato-corto relative h-full flex-col items-center gap-0.5 overflow-hidden
                            ${tall ? 'justify-start pt-0.5' : 'justify-center'}`}
                        >
                          <span className="flex items-center gap-0.5">
                            {borrowed && (
                              <span aria-hidden className="text-[11px] leading-none">
                                {block.mirror!.avatar}
                              </span>
                            )}
                            <span aria-hidden className="text-sm leading-none">
                              {block.icon}
                            </span>
                            {clashes > 0 && (
                              <span aria-hidden className={`text-[9px] ${wash ? 't-danger' : ''}`}>
                                ⚠
                              </span>
                            )}
                          </span>
                          {/* Con alto de sobra cabe el nombre partido en dos o
                              tres líneas, que es mejor que un emoji solo en
                              medio de una tarjeta de dos horas. */}
                          {tall && (
                            <span
                              className={`rato-nombre w-full break-words text-center text-[9px] font-semibold leading-[1.15]
                                ${wash ? 't-2' : 'opacity-95'}`}
                            >
                              {block.title || 'Sin nombre'}
                            </span>
                          )}
                        </span>

                        <span className="rato-largo">
                          <span className="relative flex items-baseline gap-1">
                            <span
                              className={`truncate leading-tight ${look.title}
                                ${squat ? 'text-[10px]' : 'text-[11px]'}`}
                            >
                              {/* Lo prestado se anuncia con la cara del peque
                                  antes que con su nombre: es lo que se
                                  distingue de un vistazo en una columna
                                  llena. */}
                              {borrowed && <span aria-hidden>{block.mirror!.avatar} </span>}
                              <span aria-hidden>{block.icon}</span> {block.title || 'Sin nombre'}
                            </span>
                            {status && !SILENT.has(status) && (
                              <span className="ml-auto shrink-0 text-[10px]" aria-hidden>
                                {statusIcon(status)}
                              </span>
                            )}
                          </span>

                          {tall && (
                            <span
                              className={`relative mt-0.5 flex items-center gap-1 truncate text-[10px] tabular-nums
                                ${wash ? 't-3' : 'opacity-85'}`}
                            >
                              <span className="truncate">
                                {timeOf(from)}
                                {roomy && (
                                  <span className="rato-detalle"> – {timeOf(to)}</span>
                                )}
                                <span className="rato-detalle">
                                  {' '}
                                  · {durationLabel(length)}
                                </span>
                              </span>
                              {/* Con quién está el peque: en el campo es la
                                  mitad de la información del rato. */}
                              {block.companion && (
                                <span
                                  aria-hidden
                                  className="rato-detalle"
                                  title={COMPANIONS[block.companion].label}
                                >
                                  {COMPANIONS[block.companion].icon}
                                </span>
                              )}
                              {clashes > 0 && (
                                <span
                                  className={wash ? 't-danger' : ''}
                                  title="Se pisa con otro rato"
                                >
                                  ⚠
                                </span>
                              )}
                            </span>
                          )}

                          {roomy && block.metricId && (
                            <span
                              aria-hidden
                              className={`rato-detalle absolute bottom-0.5 right-1 text-[9px] ${wash ? 't-3' : 'opacity-70'}`}
                            >
                              🔗
                            </span>
                          )}
                        </span>

                        {/* Copiar y quitar sin abrir nada. Es lo que convierte
                            rellenar la semana en un rato en vez de en una
                            sesión de formularios. */}
                        {showTools && (
                          <span
                            className={`rato-util absolute right-0.5 top-0.5 z-10 flex gap-0.5 transition-opacity
                              group-hover:opacity-100 group-focus-within:opacity-100
                              ${toolsOn ? 'opacity-100' : 'opacity-0'}`}
                          >
                            {onDuplicate && (
                              <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDuplicate(
                                    block,
                                    block.day,
                                    timeOf(
                                      Math.min(
                                        minutesOf(block.start) + block.duration,
                                        23 * 60 + 55,
                                      ),
                                    ),
                                  );
                                }}
                                aria-label={`Repetir «${block.title || 'el rato'}»`}
                                title="Repetir detrás (o arrástralo con Alt)"
                                className={`grid h-4 w-4 place-items-center rounded text-[9px] leading-none
                                  ${wash ? 'surf-3 t-1' : 'bg-black/30 text-white'} hover:brightness-125`}
                              >
                                ⧉
                              </button>
                            )}
                            {onDelete && (
                              <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDelete(block);
                                }}
                                aria-label={`Quitar «${block.title || 'el rato'}»`}
                                title="Quitar de la semana (se puede deshacer)"
                                className={`grid h-4 w-4 place-items-center rounded text-[9px] leading-none
                                  ${wash ? 'surf-3 t-1' : 'bg-black/30 text-white'} hover:brightness-125`}
                              >
                                ✕
                              </button>
                            )}
                          </span>
                        )}

                        {/* El tirador de arriba: empezar antes sin tocar el final */}
                        {onResize && !borrowed && box >= 34 && (
                          <span
                            role="presentation"
                            onPointerDown={start(block, 'head')}
                            onPointerMove={track}
                            onPointerUp={finish(block)}
                            onPointerCancel={abort}
                            style={{ touchAction: handMode ? 'none' : 'manipulation' }}
                            className="absolute left-1/4 right-1/4 top-0 h-2 cursor-ns-resize opacity-0
                                       transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                          >
                            <span
                              className={`mx-auto mb-0.5 block h-0.5 w-6 rounded-full
                                ${wash ? 'bg-[color:var(--border-strong)]' : 'bg-white/80'}`}
                            />
                          </span>
                        )}

                        {/* El tirador de abajo: estirar para que dure más */}
                        {onResize && !borrowed && box >= 26 && (
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
                            <span
                              className={`mx-auto mt-0.5 block h-0.5 w-6 rounded-full
                                ${wash ? 'bg-[color:var(--border-strong)]' : 'bg-white/80'}`}
                            />
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
                        {drag.copy && <span aria-hidden>＋</span>}
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
