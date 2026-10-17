'use client';

import { kickerFont } from '@/lib/profiles';
import { useId, useState } from 'react';

import { DAY_NAMES } from '@/lib/planner';
import type { PlanAlert, PlanAlertTone, ProfileSkin } from '@/types';

/* =========================================================================
 *  Los avisos de la semana.
 *
 *  Es la parte que justifica atar la agenda al registro: aquí se dice qué
 *  falta, qué sobra y qué conviene mirar. Antes cada aviso era una tarjeta
 *  entera y tres de ellas ocupaban una pantalla de móvil antes de llegar a
 *  la semana. Ahora es una sola tarjeta, como el «Para hoy» de la portada:
 *  arriba la cuenta por tipo, debajo los dos más serios en una línea cada
 *  uno, y el resto detrás de «ver todos». Una casa con doce avisos lo que
 *  necesita es empezar por uno.
 * ========================================================================= */

const TONE: Record<PlanAlertTone, { label: string; plural: string; bar: string; text: string; rank: number }> = {
  exceso: {
    label: 'Exceso',
    plural: 'excesos',
    bar: 'bg-[var(--danger)]',
    text: 't-danger',
    rank: 0,
  },
  carencia: {
    label: 'Carencia',
    plural: 'carencias',
    bar: 'bg-accent',
    text: 't-1',
    rank: 1,
  },
  aviso: {
    label: 'Ojo',
    plural: 'para mirar',
    bar: 'bg-[var(--border)]',
    text: 't-1',
    rank: 2,
  },
  bien: {
    label: 'En orden',
    plural: 'en orden',
    bar: 'bg-accent',
    text: 't-1',
    rank: 3,
  },
};

/** Cuántos se ven con la tarjeta plegada. */
const FOLDED = 2;

interface PlanAlertsProps {
  alerts: PlanAlert[];
  skin: ProfileSkin;
  /**
   * Ir al día del que habla el aviso. Un aviso que dice «el miércoles va muy
   * cargado» y no lleva al miércoles obliga a buscarlo a mano, que es
   * justamente el paso en el que se abandona.
   */
  onDay?: (day: number) => void;
}

export function PlanAlerts({ alerts, skin, onDay }: PlanAlertsProps) {
  const [open, setOpen] = useState(false);
  const kicker = kickerFont(skin);
  const listId = useId();

  // Sin avisos no hay nada que decir: antes quedaba el rótulo solo.
  if (alerts.length === 0) return null;

  // Lo que sobra delante de lo que falta, y lo que está bien al final. A
  // igualdad, el orden en que los da la revisión.
  const sorted = alerts
    .map((alert, index) => ({ alert, index }))
    .sort((a, b) => TONE[a.alert.tone].rank - TONE[b.alert.tone].rank || a.index - b.index)
    .map((item) => item.alert);

  const visible = open ? sorted : sorted.slice(0, FOLDED);
  const hidden = sorted.length - visible.length;

  /** La cuenta por tipo, que es lo que se lee de un vistazo. */
  const counts = (Object.keys(TONE) as PlanAlertTone[])
    .map((tone) => ({ tone, count: alerts.filter((alert) => alert.tone === tone).length }))
    .filter((item) => item.count > 0);

  return (
    <section aria-label="Avisos de la semana" className="card p-3 sm:p-4">
      <header className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
        <h3
          className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] t-3${kicker}`}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              counts.some((item) => item.tone === 'exceso') ? 'bg-[var(--danger)]' : 'bg-accent'
            }`}
          />
          Coherencia con el registro
        </h3>
        <span className="ml-auto flex flex-wrap gap-1">
          {counts.map(({ tone, count }) => (
            <span
              key={tone}
              className={`chip-soft text-[11px] tabular-nums ${tone === 'exceso' ? 't-danger' : ''}`}
            >
              {count} {count === 1 ? TONE[tone].label.toLowerCase() : TONE[tone].plural}
            </span>
          ))}
        </span>
      </header>

      <ul id={listId} className="divide-y divide-[var(--border)]">
        {visible.map((alert) => {
          const tone = TONE[alert.tone];
          return (
            <li key={alert.id} className="flex items-start gap-3 px-1 py-2.5">
              {/* El canto del color del tipo: lo que se pasa, en rojo. */}
              <span aria-hidden className={`mt-1 h-8 w-1 shrink-0 rounded-full ${tone.bar}`} />
              <span aria-hidden className="mt-0.5 text-base leading-none">
                {alert.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-bold leading-snug ${tone.text}`}>
                  <span className="sr-only">{tone.label}: </span>
                  {alert.title}
                </p>
                <p className={`mt-0.5 text-xs leading-relaxed t-2 ${open ? '' : 'line-clamp-2'}`}>
                  {alert.detail}
                </p>
              </div>

              {alert.day !== undefined && onDay ? (
                <button
                  type="button"
                  onClick={() => onDay(alert.day!)}
                  className="chip-soft tap-area shrink-0 text-[11px] font-bold hover-soft"
                  aria-label={`Ver el ${DAY_NAMES[alert.day].toLowerCase()}`}
                >
                  {DAY_NAMES[alert.day].slice(0, 3)} ›
                </button>
              ) : alert.day !== undefined ? (
                <span className="chip-soft shrink-0 text-[11px]">{DAY_NAMES[alert.day].slice(0, 3)}</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {sorted.length > FOLDED && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={listId}
          className="btn-ghost mt-1 w-full px-3 py-1.5 text-xs"
        >
          {open ? 'Ver menos' : `Ver los ${sorted.length} avisos (${hidden} más)`}
        </button>
      )}
    </section>
  );
}
