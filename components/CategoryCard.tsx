'use client';

import { useId, useMemo, useState } from 'react';
import { MetricControl } from '@/components/controls/MetricControl';
import { PlanHint } from '@/components/controls/PlanHint';
import type { ControlVariant } from '@/components/controls/types';
import { PriorityChip } from '@/components/experts/CriteriaSheet';
import { SportsPanel } from '@/components/SportsPanel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { NoteField } from '@/components/ui/NoteField';
import { expertNames, guidanceFor } from '@/lib/experts';
import type { PlannedMetric } from '@/lib/planToday';
import { computeCategoryScore, percent } from '@/lib/scoring';
import type {
  HabitCategory,
  HabitGuidance,
  Metric,
  MetricHint,
  MetricValue,
  ProfileId,
  ProfileSkin,
} from '@/types';

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
  /**
   * Apuntes por métrica —la marca que hay que batir hoy—, calculados con el
   * historial. La tarjeta sólo los pinta: quien sabe de días es quien la usa.
   */
  hints?: Record<string, MetricHint>;
  /**
   * Lo que la semana tipo apartaba hoy, por hábito. Es lo que convierte una
   * casilla vacía en una casilla que sabe lo que se esperaba de ella.
   */
  planned?: Record<string, PlannedMetric>;
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
  hints,
  planned,
}: CategoryCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [showWhy, setShowWhy] = useState(false);
  const score = computeCategoryScore(category, values);
  const kid = variant === 'kid';
  /** El campo y el cuento: las dos secciones que hablan su propio idioma. */
  const pitch = skin === 'pitch';
  const royal = skin === 'royal';
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

  /**
   * De lo que la semana apartaba hoy para esta categoría, cuánto está ya
   * registrado. Es la cifra que ata la tarjeta a la agenda de un vistazo, sin
   * tener que abrirla ni ir a la pestaña de la semana.
   */
  const fromWeek = useMemo(() => {
    if (!planned) return null;
    const ids = category.metrics.filter((metric) => planned[metric.id]).map((m) => m.id);
    if (ids.length === 0) return null;
    return { total: ids.length, done: ids.filter((id) => values[id] !== undefined).length };
  }, [category.metrics, planned, values]);

  return (
    <section className={`relative ${kid ? 'card-kid overflow-hidden' : 'card overflow-hidden'}`}>
      {/* El hilo de oro rosa que cose la sección de María: aquí también, que
          es donde pasa la mitad del tiempo. */}
      {royal && <span aria-hidden className="gilt absolute inset-x-0 top-0 h-[2px]" />}

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
              pitch
                ? 'font-display text-lg uppercase tracking-wide'
                : royal
                  ? 'royal-title text-lg'
                  : kid
                    ? 'font-display text-lg uppercase tracking-wide'
                    : 'text-base'
            }`}
          >
            {category.label}
          </span>
          {/* Plegada, la tarjeta dice cuánto falta; desplegada, de qué va. */}
          <span className="block truncate text-xs t-3">
            {open
              ? category.description
              : complete
                ? pitch
                  ? '⚽ Jugada entera'
                  : royal
                    ? '👑 Completa'
                    : '✓ Completa'
                : pending === 1
                    ? 'Queda 1 por registrar'
                    : `Quedan ${pending} por registrar`}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-3">
          {/* Lo que la semana apartaba aquí para hoy. Se dice en la propia
              cabecera porque es lo que decide si esta tarjeta urge o no. */}
          {fromWeek && (
            <span
              className={`hidden rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-flex
                ${fromWeek.done === fromWeek.total ? 'bg-accent-soft t-1' : 'surf-2 t-2'}`}
              title={`La semana apartaba ${fromWeek.total} de estos hábitos para hoy`}
            >
              🗓️ {fromWeek.done}/{fromWeek.total}
            </span>
          )}

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
                hints={hints}
                planned={planned}
              />
            ) : (
              category.metrics.map((metric) => (
                <div key={metric.id}>
                  <MetricControl
                    metric={metric}
                    value={values[metric.id]}
                    onChange={(value) => onChange(metric.id, value)}
                    variant={variant}
                  />
                  {/* Y debajo, lo que la semana decía de esta casilla. */}
                  <PlanHint
                    metric={metric}
                    planned={planned?.[metric.id]}
                    value={values[metric.id]}
                    onFill={(value) => onChange(metric.id, value)}
                    kid={kid}
                  />
                </div>
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

          {/* Lo que los botones no saben decir: se escribe aquí. */}
          {onNoteChange && (
            <div className="border-t px-4 pb-4 pt-3 hairline">
              <NoteField
                compact
                rows={2}
                label={`📝 Nota de ${category.label.toLowerCase()}`}
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
