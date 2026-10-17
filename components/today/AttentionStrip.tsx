'use client';

import { useMemo, useState } from 'react';
import { CriteriaSheet } from '@/components/experts/CriteriaSheet';
import { STATUS_LABEL, attentionItems } from '@/lib/experts';
import type { MetricValue, Profile } from '@/types';

interface AttentionStripProps {
  profile: Profile;
  values: Record<string, MetricValue>;
  kid: boolean;
  /** Lleva a la casilla de ese hábito, abajo, para apuntarlo ya. */
  onJump: (metricId: string) => void;
  /**
   * Callarse mientras sólo haya cosas sin apuntar. En el panel de los peques
   * la tarjeta abierta de abajo ya les dice qué falta; esto sólo asoma cuando
   * algo clave se ha quedado corto o se ha pasado.
   */
  onlyUrgent?: boolean;
}

/** Cuántas líneas se enseñan sin desplegar. */
const PREVIEW = 3;

/* =========================================================================
 *  Lo clave del día, en corto.
 *
 *  La tarjeta de «A qué atender hoy» contaba, de cada hábito clave, su frase
 *  de por qué, el objetivo y los nombres de quien lo sostiene: al abrir un
 *  día en blanco eran quinientos píxeles repitiendo las mismas casillas que
 *  venían debajo. Aquí cada hábito es una línea que lleva a su casilla, con
 *  la etiqueta de cómo va; el porqué y las referencias siguen a un toque,
 *  tras la ⓘ de cada línea y en «Criterio y referencias».
 *
 *  Primero lo que se ha quedado corto o se ha pasado, que eso sí urge; lo que
 *  sólo falta por apuntar va después, contado.
 * ========================================================================= */
export function AttentionStrip({ profile, values, kid, onJump, onlyUrgent = false }: AttentionStripProps) {
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);

  const items = useMemo(() => attentionItems(profile.id, values), [profile.id, values]);
  const urgent = items.filter((item) => item.status !== 'sinRegistrar');
  const visible = showAll ? items : items.slice(0, PREVIEW);

  if (items.length === 0) {
    return (
      <p className={`${kid ? 'card-kid' : 'card'} flex items-center gap-2 px-4 py-3 text-sm font-bold t-1`} role="status">
        <span aria-hidden>✅</span>
        {kid ? '¡Todo lo importante hecho!' : 'Todo lo clave del día está cubierto'}
      </p>
    );
  }

  if (onlyUrgent && urgent.length === 0) return null;

  return (
    <section className={`${kid ? 'card-kid' : 'card'} p-3 sm:p-4`} aria-labelledby="lo-clave">
      <header className="mb-1.5 flex items-center gap-2 px-1">
        <h3 id="lo-clave" className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] t-3">
          <span className={`h-1.5 w-1.5 rounded-full ${urgent.length ? 'animate-pulse bg-[var(--danger)]' : 'bg-[var(--accent)]'}`} aria-hidden />
          {kid ? 'A por esto hoy' : 'Lo clave de hoy'}
        </h3>
        <span className="ml-auto text-[11px] tabular-nums t-3">
          {urgent.length > 0 ? `${urgent.length} por debajo del criterio` : `${items.length} sin registrar`}
        </span>
      </header>

      <ul className="divide-y divide-[var(--border)]">
        {visible.map((item) => (
          <li key={item.metric.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onJump(item.metric.id)}
              className="flex min-h-[2.75rem] min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 text-left transition-colors hover-soft"
              title={`Ir a la casilla de ${item.metric.label.toLowerCase()}`}
            >
              <span className="shrink-0 text-lg" aria-hidden>
                {item.metric.icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold t-1">{item.metric.label}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  item.status === 'sinRegistrar' ? 'surf-2 t-3' : '[background:var(--danger-bg)] t-danger'
                }`}
              >
                {STATUS_LABEL[item.status]}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSheet(item.guidance.metricId)}
              className="btn-ghost h-9 w-9 shrink-0 p-0 text-sm"
              aria-label={`Por qué importa: ${item.metric.label}`}
              title="Ver el criterio y quién lo sostiene"
            >
              ⓘ
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {items.length > PREVIEW && (
          <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="btn-ghost px-3 py-1.5 text-xs">
            {showAll ? 'Ver sólo lo más urgente' : `Ver los ${items.length}`}
          </button>
        )}
        <button type="button" onClick={() => setSheet('')} className="btn-ghost px-3 py-1.5 text-xs">
          📚 Criterio y referencias
        </button>
      </div>

      {sheet !== null && <CriteriaSheet profile={profile} focusMetricId={sheet || undefined} onClose={() => setSheet(null)} />}
    </section>
  );
}
