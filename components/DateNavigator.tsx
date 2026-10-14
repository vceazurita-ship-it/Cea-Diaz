'use client';

import { useEffect, useRef, useState } from 'react';
import {
  addDays,
  capitalize,
  formatMonth,
  friendlyDateLabel,
  isToday,
  parseDateKey,
  todayKey,
  weekKeys,
  WEEKDAY_LABELS,
} from '@/lib/dates';
import { prefersReducedMotion } from '@/lib/haptics';
import type { DateKey } from '@/types';

const weekdayDay = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric' });

/**
 * El día en corto, para una pastilla o un aviso: «Hoy · martes 14», «Ayer ·
 * lunes 13» o, si no tiene nombre propio, «Jueves 9».
 */
export function dayPillLabel(key: DateKey): string {
  const named = weekdayDay.format(parseDateKey(key));
  const friendly = friendlyDateLabel(key);
  return ['Hoy', 'Ayer', 'Mañana'].includes(friendly) ? `${friendly} · ${named}` : capitalize(named);
}

interface DateNavigatorProps {
  date: DateKey;
  onChange: (date: DateKey) => void;
  /** Cumplimiento por día de la semana visible, para pintar la tira. */
  weekRatios?: Record<DateKey, number>;
}

export function DateNavigator({ date, onChange, weekRatios = {} }: DateNavigatorProps) {
  const today = todayKey();
  const days = weekKeys(date);
  const picker = useRef<HTMLInputElement>(null);

  /**
   * Abre el calendario del sistema. Hasta ahora ir a un día concreto era
   * pulsar «←» tantas veces como días hubiera de por medio; el calendario
   * nativo lo hace en un toque y además es el que ya sabe usar cada uno en
   * su teléfono. `showPicker` es lo moderno; donde no exista, enfocar y
   * pulsar el campo abre el mismo calendario.
   */
  const openPicker = () => {
    const input = picker.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        /* Algún navegador lo tiene y aun así lo rechaza: se cae al plan B. */
      }
    }
    input.focus();
    input.click();
  };

  /* -------------------------------------------- el día, a la vista siempre
   *
   * En un día largo de casillas, al bajar se perdía de vista qué día era, y
   * más de una vez se apuntó en el de ayer creyendo que era hoy. Cuando el
   * navegador sale por arriba, asoma bajo la barra una pastilla con el día y
   * sus flechas; al volver a verlo, se esconde.
   */
  const box = useRef<HTMLElement>(null);
  const [away, setAway] = useState(false);

  useEffect(() => {
    const node = box.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const top =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 0;
    const observer = new IntersectionObserver(
      ([seen]) => setAway(!seen.isIntersecting && seen.boundingClientRect.top < top),
      { rootMargin: `-${Math.round(top)}px 0px 0px 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const backToNavigator = () =>
    box.current?.scrollIntoView({
      block: 'start',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });

  return (
    <nav ref={box} className="card scroll-mt-24 p-3" aria-label="Navegación por días">
      {away && (
        // El centrado va en una capa y la animación en otra: las dos usan
        // `transform` y en el mismo elemento la entrada se comía el centrado.
        <div
          className="pointer-events-none fixed inset-x-0 z-20 flex justify-center px-4"
          style={{ top: 'calc(var(--topbar-h, 0px) + 0.5rem)' }}
        >
        <div
          role="group"
          aria-label="Día que se está viendo"
          className="pointer-events-auto flex animate-floatUp items-center gap-1 rounded-full border
            px-1 py-1 text-sm shadow-lg hairline surf-raised"
        >
          <button
            type="button"
            onClick={() => onChange(addDays(date, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-full hover-soft"
            aria-label="Día anterior"
          >
            ←
          </button>
          <button
            type="button"
            onClick={backToNavigator}
            className="rounded-full px-2 py-1 font-semibold t-1 hover-soft"
            title="Volver al calendario de la semana"
          >
            {dayPillLabel(date)}
          </button>
          <button
            type="button"
            onClick={() => onChange(addDays(date, 1))}
            disabled={date >= today}
            className="flex h-9 w-9 items-center justify-center rounded-full hover-soft disabled:opacity-30"
            aria-label="Día siguiente"
          >
            →
          </button>
        </div>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onChange(addDays(date, -1))}
          className="btn-ghost h-10 w-10 shrink-0 p-0 text-lg"
          aria-label="Día anterior"
        >
          ←
        </button>

        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={openPicker}
            className="btn-ghost w-full flex-col gap-0 border-transparent bg-transparent px-2 py-1"
            // El nombre empieza por lo que se lee en el botón: quien maneja el
            // móvil con la voz dice «Hoy» o «Ayer», y tiene que encontrarlo.
            aria-label={`${friendlyDateLabel(date)}, ${capitalize(formatMonth(date))}. Ir a otro día`}
          >
            <span className="block w-full truncate text-center text-base font-bold leading-tight t-1">
              {friendlyDateLabel(date)}
            </span>
            <span className="block w-full truncate text-center text-xs font-normal t-3">
              {capitalize(formatMonth(date))} <span aria-hidden>▾</span>
            </span>
          </button>
          {/* El campo de fecha de verdad, invisible pero presente: `display:
              none` impediría abrir su calendario. Lo que el usuario ve y toca
              es el botón de arriba. */}
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden
            value={date}
            max={today}
            onChange={(event) => {
              const next = event.target.value;
              if (next && next <= today) onChange(next);
            }}
            className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
          />
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
              className={`flex min-h-10 flex-col items-center gap-1 rounded-xl py-2 transition-colors
                disabled:cursor-not-allowed
                ${selected ? 'surf-3' : future ? '' : 'hover-soft'}
                ${future ? 'opacity-45' : ''}`}
            >
              <span className="text-[10px] font-bold uppercase t-3">{WEEKDAY_LABELS[i]}</span>

              {/* El día de hoy se marca con un disco de acento; el seleccionado,
                  con el fondo de la casilla. Así ambos se distinguen a la vez. */}
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm
                  font-semibold tabular-nums
                  ${isCurrentDay ? 'bg-accent t-on-accent' : selected ? 't-1' : 't-2'}`}
              >
                {Number(day.slice(-2))}
              </span>

              {/* Cumplimiento del día: barra corta en lugar de punto, para que
                  se lea de un vistazo cuánto se llenó, no sólo si hay algo. */}
              <span className="h-1.5 w-6 overflow-hidden rounded-full track">
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
