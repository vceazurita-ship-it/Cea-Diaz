'use client';

import { useState } from 'react';

import { DAY_NAMES } from '@/lib/planner';
import type { PlanAlert, PlanAlertTone, ProfileSkin } from '@/types';

/* =========================================================================
 *  Los avisos de la semana.
 *
 *  Es la parte que justifica atar la agenda al registro: aquí se dice qué
 *  falta, qué sobra y qué conviene mirar. Se enseñan los tres primeros y el
 *  resto se despliega, porque una lista de doce avisos no la lee nadie —y
 *  una casa con doce avisos lo que necesita es empezar por uno.
 * ========================================================================= */

const TONE: Record<PlanAlertTone, { label: string; ring: string; text: string }> = {
  exceso: {
    label: 'Exceso',
    ring: 'border-[color:var(--danger)]',
    text: 't-danger',
  },
  carencia: {
    label: 'Carencia',
    ring: 'border-accent',
    text: 't-1',
  },
  aviso: {
    label: 'Ojo',
    ring: 'hairline',
    text: 't-1',
  },
  bien: {
    label: 'En orden',
    ring: 'border-accent',
    text: 't-1',
  },
};

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
  const heading = skin === 'pitch' ? 'font-display uppercase tracking-wide' : '';

  const visible = open ? alerts : alerts.slice(0, 3);
  const hidden = alerts.length - visible.length;

  return (
    <section aria-label="Avisos de la semana" className="space-y-2">
      <h3 className={`text-xs font-bold uppercase tracking-wide t-3 ${heading}`}>
        Coherencia con el registro
      </h3>

      <ul className="space-y-2">
        {visible.map((alert) => {
          const tone = TONE[alert.tone];
          return (
            <li
              key={alert.id}
              className={`flex items-start gap-3 rounded-2xl border p-3 surf-1 ${tone.ring}`}
            >
              <span aria-hidden className="mt-0.5 text-lg">
                {alert.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${tone.text}`}>
                  {alert.title}
                  {alert.day !== undefined && (
                    <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide t-3">
                      {DAY_NAMES[alert.day]}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed t-2">{alert.detail}</p>

                {alert.day !== undefined && onDay && (
                  <button
                    type="button"
                    onClick={() => onDay(alert.day!)}
                    className="btn-ghost mt-1.5 min-h-0 px-2 py-0.5 text-[11px]"
                  >
                    Ver el {DAY_NAMES[alert.day].toLowerCase()}
                  </button>
                )}
              </div>
              <span className="chip-soft shrink-0 text-[10px] uppercase">{tone.label}</span>
            </li>
          );
        })}
      </ul>

      {hidden > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost px-3 py-1.5 text-xs">
          Ver {hidden} {hidden === 1 ? 'aviso más' : 'avisos más'}
        </button>
      )}

      {open && alerts.length > 3 && (
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-3 py-1.5 text-xs">
          Ver menos
        </button>
      )}
    </section>
  );
}
