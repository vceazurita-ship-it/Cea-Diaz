'use client';

import { useId, useMemo, useState } from 'react';
import { MetricControl } from '@/components/controls/MetricControl';
import type { ControlVariant } from '@/components/controls/types';
import { PriorityChip } from '@/components/experts/CriteriaSheet';
import { SportsPanel } from '@/components/SportsPanel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { VoiceField } from '@/components/ui/VoiceField';
import { expertNames, guidanceFor } from '@/lib/experts';
import { computeCategoryScore, percent } from '@/lib/scoring';
import type { HabitCategory, HabitGuidance, Metric, MetricValue, ProfileId, ProfileSkin } from '@/types';

interface CategoryCardProps {
  category: HabitCategory;
  /** Necesario para resolver el criterio experto de cada métrica. */
  profileId: ProfileId;
  values: Record<string, MetricValue>;
  onChange: (metricId: string, value: MetricValue | undefined) => void;
  variant: ControlVariant;
  skin?: ProfileSkin;
  defaultOpen?: boolean;
  /** Nota libre de esta categoría en el día que se está viendo. */
  note?: string;
  /** Sin este manejador la tarjeta no ofrece nota: es opcional a propósito. */
  onNoteChange?: (text: string) => void;
}

export function CategoryCard({
  category,
  profileId,
  values,
  onChange,
  variant,
  skin = 'night',
  defaultOpen = true,
  note = '',
  onNoteChange,
}: CategoryCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [showWhy, setShowWhy] = useState(false);
  const score = computeCategoryScore(category, values);
  const kid = variant === 'kid';
  const panelId = useId();
  const whyId = useId();

  // El criterio de los hábitos de esta categoría, uno por ficha: las cinco
  // actividades deportivas comparten la suya y no se repite cinco veces.
  const criteria = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ metric: Metric; guidance: HabitGuidance }> = [];

    for (const metric of category.metrics) {
      const guidance = guidanceFor(profileId, metric.id);
      if (!guidance || seen.has(guidance.metricId)) continue;
      seen.add(guidance.metricId);
      out.push({ metric, guidance });
    }

    return out;
  }, [category, profileId]);

  const pending = score.total - score.filled;
  const complete = score.total > 0 && pending === 0;

  return (
    <section className={kid ? 'card-kid overflow-hidden' : 'card overflow-hidden'}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover-soft"
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br
            ${category.gradient} ${kid ? 'h-14 w-14 text-3xl' : 'h-11 w-11 text-2xl'} shadow`}
          aria-hidden
        >
          {category.icon}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-bold t-1 ${
              kid ? 'font-display text-lg uppercase tracking-wide' : 'text-base'
            }`}
          >
            {category.label}
          </span>
          {/* Plegada, la tarjeta dice cuánto falta; desplegada, de qué va. */}
          <span className="block truncate text-xs t-3">
            {open
              ? category.description
              : complete
                ? '✓ Completa'
                : pending === 1
                    ? 'Queda 1 por registrar'
                    : `Quedan ${pending} por registrar`}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-3">
          {/* Plegada, la tarjeta tiene que delatar que ahí dentro hay algo escrito. */}
          {note.trim() && (
            <span className="text-sm" title="Tiene una nota" aria-label="Tiene una nota">
              📝
            </span>
          )}

          <span className="text-right">
            <span className="block text-sm font-bold tabular-nums t-accent">
              {percent(score.ratio)}
            </span>
            <span className="block text-[11px] t-3">
              {score.filled}/{score.total}
            </span>
          </span>
          <span
            className={`t-3 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            ▾
          </span>
        </span>
      </button>

      <div className="px-4">
        <ProgressBar
          ratio={score.ratio}
          chunky={kid}
          ariaLabel={`Cumplimiento de ${category.label}`}
        />
      </div>

      {open && (
        <div id={panelId} className="animate-floatUp">
          <div className={`p-4 ${kid ? 'space-y-3' : 'divide-y divide-[var(--border)]'}`}>
            {category.layout === 'sports' ? (
              <SportsPanel
                category={category}
                values={values}
                onChange={onChange}
                variant={variant}
                skin={skin}
              />
            ) : (
              category.metrics.map((metric) => (
                <MetricControl
                  key={metric.id}
                  metric={metric}
                  value={values[metric.id]}
                  onChange={(value) => onChange(metric.id, value)}
                  variant={variant}
                />
              ))
            )}
          </div>

          {/* El porqué de estos objetivos, plegado: se consulta cuando se
              discute una cifra, no todos los días. */}
          {criteria.length > 0 && (
            <div className="border-t px-4 py-3 hairline">
              <button
                type="button"
                onClick={() => setShowWhy((v) => !v)}
                aria-expanded={showWhy}
                aria-controls={whyId}
                className="btn-ghost px-2.5 py-1.5 text-xs"
              >
                📚 {kid ? '¿Por qué es importante?' : 'Por qué importan estos objetivos'}
                <span className={`ml-1 inline-block transition-transform ${showWhy ? 'rotate-180' : ''}`} aria-hidden>
                  ▾
                </span>
              </button>

              {showWhy && (
                <ul id={whyId} className="mt-2 animate-floatUp space-y-2">
                  {criteria.map(({ metric, guidance }) => (
                    <li key={guidance.metricId} className="rounded-xl p-2 surf-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span aria-hidden>{metric.icon}</span>
                        <span className="text-xs font-semibold t-1">{metric.label}</span>
                        <PriorityChip priority={guidance.priority} />
                      </div>
                      <p className="mt-1 text-xs leading-snug t-2">{guidance.claim}</p>
                      <p className="mt-0.5 text-[11px] t-3">{guidance.detail}</p>
                      <p className="mt-1 text-[11px] font-semibold t-3">
                        {expertNames(guidance)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Lo que los botones no saben decir: se escribe o se dicta. */}
          {onNoteChange && (
            <div className="border-t px-4 pb-4 pt-3 hairline">
              <VoiceField
                compact
                rows={2}
                label={`📝 Nota de ${category.label.toLowerCase()}`}
                dictateLabel="🎙️ Dictar"
                value={note}
                onChange={onNoteChange}
                placeholder={
                  kid
                    ? '¿Algo que contar de hoy?'
                    : 'Detalles, incidencias o lo que no encaja en ninguna casilla…'
                }
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
