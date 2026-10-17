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

/** El anillo fino de un día de la tira, con la cifra dentro. */
function DayRing({ ratio, children }: { ratio: number; children: React.ReactNode }) {
  const size = 34;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, ratio));
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="var(--track)" />
        {v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke="var(--accent)"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v)}
            className="transition-[stroke-dashoffset] duration-500"
          />
        )}
      </svg>
      {children}
    </span>
  );
}

interface DateNavigatorProps {
  date: DateKey;
  onChange: (date: DateKey) => void;
  /** Cumplimiento por día de la semana visible, para pintar la tira. */
  weekRatios?: Record<DateKey, number>;
  /** Lo hecho del día, para que la pastilla flotante diga también cuánto queda. */
  progress?: { done: number; total: number };
}

export function DateNavigator({ date, onChange, weekRatios = {}, progress }: DateNavigatorProps) {
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
    <nav ref={box} className="card scroll-mt-24 p-2 sm:p-3" aria-label="Navegación por días">
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
          {/* Cuánto queda, sin tener que volver arriba a mirarlo: un anillo
              pequeño que se llena según se baja rellenando casillas. */}
          {progress && progress.total > 0 && (
            <span
              className="flex items-center gap-1.5 border-l pl-2 pr-1 text-xs font-bold tabular-nums hairline t-2"
              aria-label={`${progress.done} de ${progress.total} registradas`}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="-rotate-90">
                <circle cx="9" cy="9" r="7" fill="none" strokeWidth="2.5" className="stroke-current opacity-15" />
                <circle
                  cx="9"
                  cy="9"
                  r="7"
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  stroke="var(--accent)"
                  strokeDasharray={`${(2 * Math.PI * 7 * progress.done) / progress.total} 99`}
                  className="transition-[stroke-dasharray] duration-500"
                />
              </svg>
              {progress.done === progress.total ? '✓' : `${progress.done}/${progress.total}`}
            </span>
          )}
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

      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <button
          type="button"
          onClick={() => onChange(addDays(date, -1))}
          className="btn-ghost h-9 w-9 shrink-0 p-0 text-base"
          aria-label="Día anterior"
        >
          ←
        </button>

        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={openPicker}
            className="btn-ghost w-full flex-col gap-0 border-transparent bg-transparent px-2 py-0.5"
            // El nombre empieza por lo que se lee en el botón: quien maneja el
            // móvil con la voz dice «Hoy» o «Ayer», y tiene que encontrarlo.
            aria-label={`${dayPillLabel(date)}, ${capitalize(formatMonth(date))}. Ir a otro día`}
          >
            {/* El día con su nombre y número: la cabecera ya no lo repite,
                así que aquí va entero y no sólo «Hoy». */}
            <span className="block w-full truncate text-center text-[15px] font-black leading-tight t-1">
              {dayPillLabel(date)}
            </span>
            <span className="block w-full truncate text-center text-[11px] font-normal t-3">
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
          {/* «Hoy» sólo cuando no se está en hoy: apagado ocupaba sitio
              para no hacer nada. */}
          {!isToday(date) && (
            <button
              type="button"
              onClick={() => onChange(today)}
              className="btn-ghost h-9 px-2.5 text-sm"
            >
              Hoy
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(addDays(date, 1))}
            disabled={date >= today}
            className="btn-ghost h-9 w-9 p-0 text-base"
            aria-label="Día siguiente"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
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
              className={`flex min-h-10 flex-col items-center gap-0.5 rounded-xl py-1 transition-colors
                disabled:cursor-not-allowed
                ${selected ? 'surf-3' : future ? '' : 'hover-soft'}
                ${future ? 'opacity-45' : ''}`}
            >
              <span className="text-[9px] font-bold uppercase t-3">{WEEKDAY_LABELS[i]}</span>

              {/* Cada día, su anillo: cuánto se llenó se lee de un vistazo en
                  la propia cifra, sin barra aparte debajo. El de hoy lleva
                  además el disco de acento; el seleccionado, el fondo de la
                  casilla. Así los dos se distinguen a la vez. */}
              <DayRing ratio={ratio}>
                <span
                  className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-[13px]
                    font-bold tabular-nums
                    ${isCurrentDay ? 'bg-accent t-on-accent' : selected ? 't-1' : 't-2'}`}
                >
                  {Number(day.slice(-2))}
                </span>
              </DayRing>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
