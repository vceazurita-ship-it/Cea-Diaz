'use client';

import { useMemo } from 'react';

import { ProgressRing } from '@/components/ui/ProgressRing';
import { useWeekPlan } from '@/hooks/useWeekPlan';
import { adherence } from '@/lib/planLink';
import {
  DAY_NAMES,
  DAY_SHORT,
  PLAN_KINDS,
  durationLabel,
  gradientOf,
  kindPalette,
  themeOf,
} from '@/lib/planner';
import type { DateKey, DayEntry, Profile, ProfileSkin, SummaryRange } from '@/types';

/* =========================================================================
 *  Lo planificado contra lo vivido, dentro del análisis.
 *
 *  El resto de los resúmenes contesta «¿cuánto he cumplido?». Esto contesta
 *  otra cosa, y es la que de verdad cambia decisiones: **«lo que había
 *  planificado, ¿pasó?»**. Son dos preguntas distintas y a veces se
 *  contradicen —una semana puede ir al ochenta por ciento de cumplimiento y
 *  llevar el entreno del martes cuatro semanas sin ocurrir—, y esa
 *  contradicción es exactamente la que hay que ver.
 *
 *  De ahí las tres lecturas: cuánto de lo previsto se cumplió, **en qué días
 *  se cae** —que es donde se arregla, moviendo el rato a otro día— y **qué
 *  ratos concretos** se están incumpliendo semana tras semana.
 *
 *  Y en el mes, además, se ve lo que en una sola semana no se ve: si el
 *  jueves falla siempre, el problema no es el jueves pasado, es el plan.
 * ========================================================================= */

interface PlanAdherenceProps {
  profile: Profile;
  /** Los días del periodo que se está mirando: una semana o un mes. */
  dates: DateKey[];
  entries: Record<string, DayEntry>;
  range: SummaryRange;
  skin: ProfileSkin;
  kid: boolean;
  headingClass: string;
  /** Lleva a la agenda, que es donde esto se arregla. */
  onOpenPlan?: () => void;
}

export function PlanAdherence({
  profile,
  dates,
  entries,
  range,
  skin,
  kid,
  headingClass,
  onOpenPlan,
}: PlanAdherenceProps) {
  const plan = useWeekPlan(profile.id);
  const theme = themeOf(profile.id);

  const data = useMemo(
    () => adherence(profile, plan, dates, entries),
    [profile, plan, dates, entries],
  );

  /** Cada día de la semana, sumando todas sus repeticiones del periodo. */
  const byWeekday = useMemo(() => {
    const rows = Array.from({ length: 7 }, (_, day) => ({
      day,
      judged: 0,
      kept: 0,
      planned: 0,
    }));

    for (const item of data.days) {
      const row = rows[item.day];
      row.judged += item.judged;
      row.kept += item.kept;
      row.planned = Math.max(row.planned, item.planned);
    }

    return rows;
  }, [data.days]);

  /* ------------------------------------------------- agenda sin estrenar */

  if (plan.blocks.length === 0) {
    return (
      <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
        <h3 className={headingClass}>Lo planificado, ¿pasó?</h3>
        <p className="text-sm leading-relaxed t-3">
          Todavía no hay semana tipo que contrastar. En cuanto apartes tus{' '}
          {theme.blockWords} —el entreno, la lectura, la cena— este apartado te dirá cuáles se
          cumplen de verdad y cuáles llevan semanas sin ocurrir.
        </p>
        {onOpenPlan && (
          <button type="button" onClick={onOpenPlan} className="btn-primary mt-3 px-3 py-1.5 text-xs">
            🗓️ Montar la semana
          </button>
        )}
      </div>
    );
  }

  const ratio = data.ratio;
  const worstDay = byWeekday
    .filter((row) => row.judged >= 2)
    .sort((a, b) => a.kept / a.judged - b.kept / b.judged)[0];

  return (
    <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className={`${headingClass} mb-0`}>Lo planificado, ¿pasó?</h3>
        <span className="text-[11px] t-3">
          {range === 'week' ? 'esta semana' : 'este mes'} · {data.blocks} {theme.blockWords},{' '}
          {data.linked} atados a un hábito
        </span>
        {onOpenPlan && (
          <button
            type="button"
            onClick={onOpenPlan}
            className="btn-ghost ml-auto min-h-0 px-2.5 py-1 text-xs"
          >
            Abrir la semana
          </button>
        )}
      </div>

      {data.judged === 0 ? (
        <p className="text-sm leading-relaxed t-3">
          {data.linked === 0
            ? 'Ningún rato de la semana está atado a un hábito, así que no hay nada que comprobar. Átalos desde la semana y esto empezará a decir algo.'
            : 'Todavía no ha pasado ningún día del periodo con algo previsto. Se irá midiendo según avance.'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-5">
            <ProgressRing ratio={ratio} size={kid ? 104 : 88}>
              <span className="text-xl font-black tabular-nums t-1">
                {Math.round(ratio * 100)}
                <span className="text-xs">%</span>
              </span>
              <span className="text-[10px] uppercase tracking-wide t-3">cumplido</span>
            </ProgressRing>

            <div className="min-w-[190px] flex-1 space-y-2">
              <p className="text-sm leading-relaxed t-2">
                De <strong className="tabular-nums t-1">{data.judged}</strong> ratos previstos que
                ya han pasado, <strong className="tabular-nums t-1">{data.kept}</strong> se
                cumplieron.
              </p>

              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="chip-soft">✓ {data.kept} cumplidos</span>
                {data.weak > 0 && <span className="chip-soft">↓ {data.weak} cortos</span>}
                {data.over > 0 && <span className="chip-soft">↑ {data.over} pasados</span>}
                {data.missing > 0 && (
                  <span className="chip-soft">? {data.missing} sin registrar</span>
                )}
              </div>

              {worstDay && worstDay.kept / worstDay.judged < 0.6 && (
                <p className="text-[11px] leading-relaxed t-3">
                  Donde más se cae es el{' '}
                  <strong className="t-2">{DAY_NAMES[worstDay.day].toLowerCase()}</strong>:{' '}
                  {worstDay.kept} de {worstDay.judged}. Si se repite, el problema no es el día,
                  es el plan de ese día.
                </p>
              )}
            </div>
          </div>

          {/* Dónde se cae, día por día */}
          <div className="mt-4 grid grid-cols-7 gap-1">
            {byWeekday.map((row) => {
              const share = row.judged > 0 ? row.kept / row.judged : null;

              return (
                <div key={row.day} className="flex flex-col items-center gap-1">
                  <div
                    className="flex h-16 w-full items-end overflow-hidden rounded-lg track"
                    title={
                      row.judged > 0
                        ? `${DAY_NAMES[row.day]}: ${row.kept} de ${row.judged}`
                        : `${DAY_NAMES[row.day]}: nada que comprobar`
                    }
                  >
                    {share !== null ? (
                      <div
                        className="w-full rounded-lg bg-accent transition-[height] duration-500"
                        style={{ height: `${Math.max(6, share * 100)}%` }}
                      />
                    ) : (
                      <div className="w-full" />
                    )}
                  </div>
                  <span className="text-[10px] font-bold uppercase t-3">{DAY_SHORT[row.day]}</span>
                  <span className="text-[9px] tabular-nums t-3">
                    {row.judged > 0 ? `${row.kept}/${row.judged}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Qué ratos se están incumpliendo, por nombre */}
          {data.weakest.length > 0 && (
            <div className="mt-4 border-t pt-3 hairline">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide t-3">
                Lo que más se cae
              </p>
              <ul className="space-y-1.5">
                {data.weakest.map((item) => (
                  <li
                    key={`${item.icon}${item.title}`}
                    className="flex items-center gap-2 text-xs t-2"
                  >
                    <span aria-hidden>{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="shrink-0 tabular-nums t-3">
                      falló {item.missed} de {item.judged}
                    </span>
                    <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full track">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(item.missed / item.judged) * 100}%`,
                          backgroundColor: 'var(--danger)',
                        }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* En qué se va la semana tipo. No depende del periodo: es el plan. */}
      {data.kinds.length > 1 && (
        <div className="mt-4 border-t pt-3 hairline">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide t-3">
            En qué se va la semana · {durationLabel(data.minutes)} apartados
          </p>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full track">
            {data.kinds.map((item) => (
              <span
                key={item.kind}
                title={`${PLAN_KINDS[item.kind].label}: ${durationLabel(item.minutes)}`}
                className="h-full"
                style={{
                  width: `${(item.minutes / Math.max(1, data.minutes)) * 100}%`,
                  backgroundImage: gradientOf(kindPalette(item.kind), '90deg'),
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {data.kinds.slice(0, 6).map((item) => (
              <span key={item.kind} className="inline-flex items-center gap-1 text-[11px] t-3">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundImage: gradientOf(kindPalette(item.kind)) }}
                />
                {PLAN_KINDS[item.kind].label}
                <span className="tabular-nums opacity-70">{durationLabel(item.minutes)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
