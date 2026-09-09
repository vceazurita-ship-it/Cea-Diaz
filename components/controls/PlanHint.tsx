'use client';

import { plannedValue } from '@/lib/planToday';
import type { PlannedMetric } from '@/lib/planToday';
import { isCeiling } from '@/lib/scoring';
import type { Metric, MetricValue } from '@/types';

/* =========================================================================
 *  Lo que la semana decía de esta casilla, debajo de la casilla.
 *
 *  Es la costura que faltaba entre las dos mitades de la app. La agenda ya
 *  sabía que hoy hay veinte minutos de lectura a las nueve; la casilla de
 *  lectura no se enteraba, y rellenar el día consistía en acordarse del
 *  número y teclearlo. Aquí se dice —«la semana aparta 20 min, 21:00–21:20»—
 *  y se pone de un toque.
 *
 *  Nunca se registra solo. Un plan no es un hecho: dar por leídos veinte
 *  minutos porque estaban previstos ensuciaría el historial con el que
 *  después se decide qué cambiar. Lo que hace es quitar el trabajo de copiar,
 *  no el de decidir.
 *
 *  Y cuando ya hay algo registrado deja de ofrecer nada: se limita a decir si
 *  lo apuntado cubre lo que se había apartado, que es la única lectura que
 *  aporta algo a esas alturas.
 * ========================================================================= */

interface PlanHintProps {
  metric: Metric;
  /** Lo que la semana aparta hoy para este hábito, si aparta algo. */
  planned: PlannedMetric | undefined;
  value: MetricValue | undefined;
  onFill: (value: MetricValue) => void;
  kid: boolean;
}

export function PlanHint({ metric, planned, value, onFill, kid }: PlanHintProps) {
  if (!planned || planned.blocks.length === 0) return null;

  const suggestion = plannedValue(metric, planned);
  const registered = value !== undefined;
  const ceiling = isCeiling(metric);

  /** Lo previsto, dicho con su unidad: «20 min», «2 raciones». */
  const wanted =
    planned.amount !== undefined && (metric.type === 'counter' || metric.type === 'duration')
      ? `${planned.amount} ${metric.unit}`
      : null;

  /** Y cómo va lo registrado frente a eso. */
  const verdict = (() => {
    if (!registered) return null;
    if (planned.amount === undefined) return null;
    if (metric.type !== 'counter' && metric.type !== 'duration') return null;
    if (typeof value !== 'number') return null;

    if (ceiling) {
      return value > planned.amount
        ? { tone: 'mal', text: `${value} ${metric.unit} de los ${planned.amount} previstos` }
        : { tone: 'bien', text: 'dentro de lo previsto' };
    }

    if (value >= planned.amount) return { tone: 'bien', text: 'cubre lo previsto' };
    return {
      tone: 'corto',
      text: `${value} de los ${planned.amount} ${metric.unit} previstos`,
    };
  })();

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${
        kid ? 'mt-1.5 px-1' : 'pb-2 pt-0.5'
      }`}
    >
      {/* Lo que llama la atención es lo que ya tocaba y sigue en blanco: eso
          va resaltado. Lo que aún no ha llegado se dice en gris, porque a las
          ocho de la mañana la cena está prevista, no incumplida. */}
      <span
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold
          ${!registered && planned.past ? 'bg-accent-soft t-1' : 'surf-2 t-2'}`}
        title={planned.blocks.map((block) => block.title).join(' · ')}
      >
        <span aria-hidden>🗓️</span>
        {!registered && planned.past ? 'Ya tocaba · ' : ''}
        {wanted ? `la semana aparta ${wanted}` : 'la semana lo tenía apartado'}
      </span>

      <span className="text-[10px] tabular-nums t-3">{planned.when}</span>

      {/* Lo que se puede hacer con eso: ponerlo, si todavía no hay nada. */}
      {!registered && suggestion !== undefined && !ceiling && (
        <button
          type="button"
          onClick={() => onFill(suggestion)}
          className={`btn-ghost min-h-0 px-2 py-0.5 text-[11px] font-semibold ${kid ? 'text-xs' : ''}`}
        >
          ✓ {wanted ? `Poner ${wanted}` : 'Marcar como hecho'}
        </button>
      )}

      {verdict && (
        <span
          className={`text-[10px] font-semibold
            ${verdict.tone === 'bien' ? 't-accent' : verdict.tone === 'mal' ? 't-danger' : 't-3'}`}
        >
          {verdict.tone === 'bien' ? '✓' : '·'} {verdict.text}
        </span>
      )}
    </div>
  );
}
