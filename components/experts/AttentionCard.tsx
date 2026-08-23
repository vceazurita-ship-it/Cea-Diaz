'use client';

import { useMemo, useState } from 'react';
import { CriteriaSheet, PriorityChip } from '@/components/experts/CriteriaSheet';
import { STATUS_LABEL, attentionItems, expertNames } from '@/lib/experts';
import { formatMetricValue, targetWord } from '@/lib/scoring';
import type { AttentionItem, MetricValue, Profile } from '@/types';

interface AttentionCardProps {
  profile: Profile;
  values: Record<string, MetricValue>;
  kid: boolean;
  /** Cuántos se enseñan sin desplegar. */
  preview?: number;
}

/** El objetivo de la métrica, dicho como lo entiende quien lo lee. */
function goalOf(item: AttentionItem): string | null {
  const { metric } = item;
  if (metric.type !== 'counter' && metric.type !== 'duration') return null;
  return `${targetWord(metric)} ${metric.target} ${metric.unit}`;
}

/**
 * Qué pide atención hoy, según el criterio de `lib/experts.ts`. No repite el
 * contador de pendientes de la barra de acciones: aquí sólo entran los hábitos
 * clave e importantes, y sólo cuando están flojos, pasados de techo o sin
 * registrar. Es lo que convierte una lista de casillas en una prioridad.
 */
export function AttentionCard({ profile, values, kid, preview = 3 }: AttentionCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);

  const items = useMemo(() => attentionItems(profile.id, values), [profile.id, values]);
  const urgent = items.filter((item) => item.status !== 'sinRegistrar');
  const visible = showAll ? items : items.slice(0, preview);

  if (items.length === 0) {
    return (
      <section className={`${kid ? 'card-kid' : 'card'} p-4`}>
        <p className="flex items-center gap-2 text-sm font-bold t-1">
          <span aria-hidden>✅</span>
          {kid ? '¡Todo lo importante hecho!' : 'Todo lo clave del día está cubierto'}
        </p>
        <p className="mt-1 text-xs t-3">
          Ningún hábito clave se ha quedado corto ni sin contar.
        </p>
      </section>
    );
  }

  return (
    <section className={`${kid ? 'card-kid' : 'card'} overflow-hidden`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 pb-2">
        <h2
          className={`flex items-center gap-2 font-bold t-1 ${
            kid ? 'font-display text-lg uppercase tracking-wide' : 'text-base'
          }`}
        >
          <span aria-hidden>🎯</span>
          {kid ? 'A por esto hoy' : 'A qué atender hoy'}
        </h2>
        <span className="ml-auto text-xs tabular-nums t-3">
          {urgent.length > 0
            ? `${urgent.length} por debajo del criterio`
            : `${items.length} sin registrar`}
        </span>
      </header>

      <ul className="divide-y divide-[var(--border)] px-4">
        {visible.map((item) => {
          const goal = goalOf(item);
          return (
            <li key={item.metric.id} className="py-3">
              <div className="flex items-start gap-3">
                <span className="text-lg" aria-hidden>
                  {item.metric.icon}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold t-1">{item.metric.label}</span>
                    <PriorityChip priority={item.guidance.priority} />
                    <span
                      className={`text-[11px] font-semibold ${
                        item.status === 'sinRegistrar' ? 't-3' : 't-danger'
                      }`}
                    >
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs leading-snug t-2">{item.guidance.claim}</p>

                  <p className="mt-1 text-[11px] t-3">
                    {item.ratio !== null && (
                      <>
                        Hoy: {formatMetricValue(item.metric, values[item.metric.id])}
                        {goal ? ` · ${goal}` : ''} ·{' '}
                      </>
                    )}
                    {item.ratio === null && goal ? <>{goal} · </> : null}
                    {expertNames(item.guidance)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSheet(item.guidance.metricId)}
                  className="btn-ghost h-9 w-9 shrink-0 p-0 text-sm"
                  aria-label={`Por qué importa: ${item.metric.label}`}
                  title="Ver el criterio y quién lo sostiene"
                >
                  ⓘ
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-3">
        {items.length > preview && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            {showAll ? 'Ver sólo lo más urgente' : `Ver los ${items.length}`}
          </button>
        )}
        <button
          type="button"
          onClick={() => setSheet('')}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          📚 Criterio y referencias
        </button>
      </div>

      {sheet !== null && (
        <CriteriaSheet
          profile={profile}
          focusMetricId={sheet || undefined}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}
