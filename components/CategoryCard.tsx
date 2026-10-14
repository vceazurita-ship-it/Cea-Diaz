'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MetricControl } from '@/components/controls/MetricControl';
import { PlanHint } from '@/components/controls/PlanHint';
import { UsualHint } from '@/components/controls/UsualHint';
import type { ControlVariant } from '@/components/controls/types';
import { PriorityChip } from '@/components/experts/CriteriaSheet';
import { SportsPanel } from '@/components/SportsPanel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { NoteField } from '@/components/ui/NoteField';
import { expertNames, guidanceFor } from '@/lib/experts';
import { prefersReducedMotion, success } from '@/lib/haptics';
import { isFolded, usualFills, type Habitual, type UsualFill } from '@/lib/habitual';
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
  /** Lo aprendido de lo ya rellenado: lo de siempre y lo que casi no se usa. */
  habitual?: Habitual;
  /** Poner de golpe lo de siempre; quien lo llama ofrece deshacerlo. */
  onFillUsual?: (fills: UsualFill[], where: string) => void;
  /**
   * Una casilla a la que hay que llevar la vista —se ha tocado su línea en
   * lo previsto de hoy—. Si es de esta tarjeta, se abre, se baja hasta ella y
   * se resalta un momento; después se avisa con `onFocused` para olvidarla.
   */
  focusMetric?: string | null;
  onFocused?: () => void;
  /**
   * Que se abra porque otra la ha dejado completa: en el panel de los peques
   * se va de una tarjeta a la siguiente sin tener que buscarla.
   */
  requestOpen?: boolean;
  /** Avisa cuando la tarjeta pasa de tener algo pendiente a estar completa. */
  onComplete?: () => void;
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
  habitual,
  onFillUsual,
  focusMetric,
  onFocused,
  requestOpen,
  onComplete,
}: CategoryCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [showWhy, setShowWhy] = useState(false);
  const [showRare, setShowRare] = useState(false);
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

  /* Lo que el historial sabe de esta tarjeta: qué se puede poner de golpe y
     qué preguntas se contestan tan poco que mejor plegadas. Si todo lo que
     queda en blanco es de lo poco usado, no se pliega nada: una tarjeta
     abierta y vacía no ayuda a nadie. */
  const fills = useMemo(
    () => (habitual ? usualFills(category.metrics, habitual, values) : []),
    [category.metrics, habitual, values],
  );
  const { shown, folded } = useMemo(() => {
    if (!habitual || category.layout === 'sports') return { shown: category.metrics, folded: [] };
    const rare = category.metrics.filter((metric) => isFolded(metric, habitual, values));
    if (rare.length === 0 || rare.length === category.metrics.length) {
      return { shown: category.metrics, folded: [] };
    }
    return { shown: category.metrics.filter((m) => !rare.includes(m)), folded: rare };
  }, [category.metrics, category.layout, habitual, values]);
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

  /* ------------------------------------------- llevar la vista a una casilla
   *
   * Se hace en dos tiempos: primero se abre lo que haga falta —la tarjeta y,
   * si la casilla es de las plegadas, las poco usadas— y, ya pintado, se baja
   * hasta ella. Hacerlo de una vez buscaba un elemento que aún no existía.
   */
  const sectionRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const ownsFocus = !!focusMetric && category.metrics.some((metric) => metric.id === focusMetric);
  const targetFolded = ownsFocus && folded.some((metric) => metric.id === focusMetric);

  useEffect(() => {
    if (!ownsFocus || !focusMetric) return;
    if (!open) {
      setOpen(true);
      return;
    }
    if (targetFolded && !showRare) {
      setShowRare(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const target =
        document.getElementById(`metric-${focusMetric}`) ?? panelRef.current ?? sectionRef.current;
      target?.scrollIntoView({
        block: 'center',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
      target?.querySelector<HTMLElement>('button, input, select, textarea')?.focus({ preventScroll: true });
      setHighlight(focusMetric);
      onFocused?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ownsFocus, focusMetric, open, targetFolded, showRare, onFocused]);

  // El resalte dura lo justo para que el ojo lo encuentre.
  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 1200);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  /* ------------------------------------------------ al completar la tarjeta
   *
   * Sólo cuenta lo que se ha tocado aquí dentro: si la tarjeta se completa
   * porque ha llegado la nube o se ha copiado el día anterior, celebrarlo y
   * plegarla bajo el dedo sería un susto, no un premio.
   */
  const touched = useRef(false);
  const wasComplete = useRef(complete);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (complete && !wasComplete.current && touched.current) {
      success();
      setPop(true);
      // A los peques se les pliega y se les abre la siguiente: un paso cada vez.
      if (kid) setOpen(false);
      onComplete?.();
    }
    wasComplete.current = complete;
    // Sólo importa el cambio de «a medias» a «completa».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  // La siguiente tarjeta de los peques, abierta y a la vista.
  useEffect(() => {
    if (!requestOpen) return;
    setOpen(true);
    const frame = window.requestAnimationFrame(() =>
      sectionRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [requestOpen]);

  const change = (metricId: string, value: MetricValue | undefined) => {
    touched.current = true;
    onChange(metricId, value);
  };

  function renderMetric(metric: Metric) {
    const plannedHere = planned?.[metric.id];
    return (
      <div
        key={metric.id}
        id={`metric-${metric.id}`}
        className={`scroll-mt-24 transition-shadow ${
          highlight === metric.id ? 'rounded-xl ring-2 ring-[var(--accent)]' : ''
        }`}
      >
        <MetricControl
          metric={metric}
          value={values[metric.id]}
          onChange={(value) => change(metric.id, value)}
          variant={variant}
        />
        {/* Y debajo, lo que la semana decía de esta casilla; si la semana no
            dice nada, lo que se suele contestar. */}
        {plannedHere && plannedHere.blocks.length > 0 ? (
          <PlanHint
            metric={metric}
            planned={plannedHere}
            value={values[metric.id]}
            onFill={(value) => change(metric.id, value)}
            kid={kid}
          />
        ) : (
          <UsualHint
            metric={metric}
            stat={habitual?.stats[metric.id]}
            value={values[metric.id]}
            onFill={(value) => change(metric.id, value)}
            kid={kid}
          />
        )}
      </div>
    );
  }

  return (
    <section
      ref={sectionRef}
      className={`relative scroll-mt-24 ${kid ? 'card-kid overflow-hidden' : 'card overflow-hidden'}`}
    >
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
            className={`line-clamp-2 block font-bold leading-tight t-1 [overflow-wrap:anywhere] ${
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
          <span className="mt-0.5 line-clamp-2 block text-xs t-3">
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
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold
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
            <span
              className={`block text-sm font-bold tabular-nums t-accent ${pop ? 'animate-pop' : ''}`}
              onAnimationEnd={() => setPop(false)}
            >
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
        <div id={panelId} ref={panelRef} className="animate-floatUp">
          {/* Todo lo que en esta tarjeta se contesta siempre igual, de un toque. */}
          {fills.length > 1 && onFillUsual && (
            <div className="flex items-center gap-2 px-4 pt-3">
              <button
                type="button"
                onClick={() => {
                  touched.current = true;
                  onFillUsual(fills, category.label);
                }}
                className="usual-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5
                  text-xs font-semibold t-1"
                title={fills.map((fill) => `${fill.icon} ${fill.label}`).join(' · ')}
              >
                <span aria-hidden>✨</span> Como siempre ({fills.length})
              </button>
              {/* En el móvil, la versión corta; esconderla del todo dejaba el
                  botón sin explicar justo donde más se usa. */}
              <span className="min-w-0 text-[11px] leading-tight t-3">
                <span className="sm:hidden">lo de casi todos los días</span>
                <span className="hidden sm:inline">lo que contestas igual casi todos los días</span>
              </span>
            </div>
          )}
          <div className={`p-4 ${kid ? 'space-y-3' : 'divide-y divide-[var(--border)]'}`}>
            {category.layout === 'sports' ? (
              <SportsPanel
                category={category}
                values={values}
                onChange={change}
                variant={variant}
                skin={skin}
                hints={hints}
                planned={planned}
              />
            ) : (
              <>
                {(showRare ? [...shown, ...folded] : shown).map(renderMetric)}
                {folded.length > 0 && (
                  <div className={kid ? '' : 'pt-2'}>
                    <button
                      type="button"
                      onClick={() => setShowRare((v) => !v)}
                      aria-expanded={showRare}
                      className="btn-ghost w-full justify-center px-3 py-1.5 text-xs t-3"
                    >
                      {showRare
                        ? '▴ Ocultar las que casi no usas'
                        : `＋ ${folded.length} ${folded.length === 1 ? 'pregunta' : 'preguntas'} que casi nunca contestas`}
                    </button>
                  </div>
                )}
              </>
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
