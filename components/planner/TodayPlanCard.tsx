'use client';

import { useMemo } from 'react';

import { useWeekPlan } from '@/hooks/useWeekPlan';
import type { HabitStore } from '@/hooks/useHabitStore';
import { friendlyDateLabel, weekdayIndex } from '@/lib/dates';
import { checkBlock, statusIcon, statusLabel } from '@/lib/planCheck';
import { COMPANIONS, DAY_NAMES, blocksOfDay, durationLabel, themeOf } from '@/lib/planner';
import type { DateKey, PlanStatus, Profile } from '@/types';

/* =========================================================================
 *  Lo que la semana tenía previsto para hoy, en la pantalla de registro.
 *
 *  Existe para cerrar el círculo. La agenda dice «hoy a las cinco y media,
 *  entreno»; el registro tiene una casilla de asistencia. Puestos uno al
 *  lado del otro, marcar la casilla deja de ser un trámite: se ve lo que se
 *  había apartado y si se ha cumplido, se ha quedado corto o se ha pasado.
 *
 *  Cuando la agenda está vacía no se pinta nada: la pantalla de registro no
 *  es sitio para insistir en una sección que todavía no se usa.
 * ========================================================================= */

/** El mismo código de colores que en la cuadrícula de la semana. */
const STATUS_STYLE: Record<PlanStatus, string> = {
  cumplido: 'bg-accent t-on-accent',
  flojo: 'bg-amber-400/30 t-1',
  excedido: 't-danger',
  sinRegistrar: 'surf-3 t-2',
  futuro: 'surf-2 t-3',
  sinMetrica: 'surf-2 t-3',
};

interface TodayPlanCardProps {
  profile: Profile;
  date: DateKey;
  store: HabitStore;
  kid: boolean;
  /** Lleva a la sección de la semana, que es donde se edita. */
  onOpenPlan: () => void;
}

export function TodayPlanCard({ profile, date, store, kid, onOpenPlan }: TodayPlanCardProps) {
  const plan = useWeekPlan(profile.id);
  const theme = themeOf(profile.id);
  const day = weekdayIndex(date);

  const entry = store.getEntry(profile.id, date);

  const checks = useMemo(
    () => blocksOfDay(plan, day).map((block) => checkBlock(profile, block, date, entry)),
    [plan, day, profile, date, entry],
  );

  // Agenda sin estrenar: aquí no se dice nada.
  if (plan.blocks.length === 0) return null;

  const judged = checks.filter(
    (check) => check.status !== 'sinMetrica' && check.status !== 'futuro',
  );
  const kept = judged.filter((check) => check.status === 'cumplido').length;
  const over = judged.filter((check) => check.status === 'excedido').length;

  return (
    <section className={`${kid ? 'card-kid' : 'card'} p-4`} aria-label="Lo previsto para hoy">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-sm font-bold t-1">
          🗓️ {theme.title}: {friendlyDateLabel(date).toLowerCase()}
        </h2>
        <span className="text-xs t-3">
          {DAY_NAMES[day]} · {checks.length}{' '}
          {checks.length === 1 ? theme.blockWord : theme.blockWords}
        </span>
        <button type="button" onClick={onOpenPlan} className="btn-ghost ml-auto px-2.5 py-1 text-xs">
          Ver la semana
        </button>
      </header>

      {checks.length === 0 ? (
        <p className="text-sm t-3">
          Hoy no hay nada apartado en la semana. Lo que hagas se registra igual.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {checks.map((check) => (
              <li
                key={check.block.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-2 py-1.5 surf-1"
              >
                <span className="text-xs font-bold tabular-nums t-3">{check.block.start}</span>
                <span className="text-sm font-semibold t-1">
                  <span aria-hidden>{check.block.icon}</span> {check.block.title}
                </span>
                <span className="text-[11px] tabular-nums t-3">
                  {durationLabel(check.block.duration)}
                </span>

                {check.block.companion && (
                  <span className="rounded-full px-1.5 text-[10px] font-semibold surf-2 t-2">
                    <span aria-hidden>{COMPANIONS[check.block.companion].icon}</span>{' '}
                    {COMPANIONS[check.block.companion].short}
                  </span>
                )}

                {check.metric && (
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[check.status]}`}
                    title={check.text}
                  >
                    {statusIcon(check.status)} {statusLabel(check.status)}
                  </span>
                )}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs leading-relaxed t-3" aria-live="polite">
            {judged.length === 0
              ? 'Todavía no hay nada que comprobar: se irá marcando según registres el día.'
              : over > 0
                ? `${over} ${over === 1 ? 'se ha pasado' : 'se han pasado'} del máximo y ${kept} de ${judged.length} van cumplidos.`
                : `${kept} de ${judged.length} cumplidos según lo registrado hasta ahora.`}
          </p>
        </>
      )}
    </section>
  );
}
