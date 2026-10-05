'use client';

import { usualLabel, type HabitStat } from '@/lib/habitual';
import type { Metric, MetricValue } from '@/types';

/* =========================================================================
 *  «Lo de siempre», debajo de la casilla en blanco.
 *
 *  La hermana de `PlanHint`: aquélla dice lo que la semana apartaba, ésta lo
 *  que se suele contestar. Se pone de un toque y se corrige igual que
 *  cualquier otra respuesta. Sólo aparece mientras la casilla está vacía: con
 *  algo ya puesto no tiene nada que aportar.
 * ========================================================================= */

interface UsualHintProps {
  metric: Metric;
  stat: HabitStat | undefined;
  value: MetricValue | undefined;
  onFill: (value: MetricValue) => void;
  kid: boolean;
}

export function UsualHint({ metric, stat, value, onFill, kid }: UsualHintProps) {
  if (value !== undefined || stat?.usual === undefined) return null;
  const usual = stat.usual;

  return (
    <div className={`flex items-center gap-2 ${kid ? 'mt-1.5 px-1' : 'pb-2 pt-0.5'}`}>
      <button
        type="button"
        onClick={() => onFill(usual)}
        className={`usual-chip inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1
          font-semibold transition-colors ${kid ? 'text-xs' : 'text-[11px]'}`}
        title={
          stat.median
            ? 'Tu cifra normal de las últimas semanas'
            : `Lo que contestas ${Math.round(stat.usualShare * 100)} de cada 100 veces`
        }
      >
        <span aria-hidden>↺</span>
        <span className="t-3 font-medium">{stat.median ? 'Lo normal:' : 'Lo de siempre:'}</span>
        <span className="t-1">{usualLabel(metric, usual)}</span>
      </button>
    </div>
  );
}
