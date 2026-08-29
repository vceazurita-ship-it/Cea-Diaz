'use client';

import { useMemo } from 'react';

import { challengeLink } from '@/lib/planLink';
import { DAY_SHORT, bestSlot, blockForMetric, durationLabel } from '@/lib/planner';
import { TIER_LABEL } from '@/lib/challenges';
import type { PlanBlock, ProfileId, ProfileSkin, ScoredChallenge, WeekPlan } from '@/types';

/* =========================================================================
 *  Los retos de la semana, vistos desde la agenda.
 *
 *  Es la pregunta que faltaba. Los retos ya decían adónde hay que llegar y
 *  la agenda ya decía en qué se va la semana, pero cada uno en su pestaña,
 *  sin mirarse. Y la única pregunta que importa el lunes por la mañana es
 *  ésta: de lo que me piden esta semana, **¿qué tiene su rato apartado y qué
 *  se está pidiendo a base de acordarse?**
 *
 *  Un reto sin hueco no es un reproche: es un botón. Se le aparta el rato
 *  ahí mismo —con el nombre, la hora y la cantidad que le corresponden— y
 *  deja de depender de la memoria.
 *
 *  Los retos de día entero —registrar, la media diaria— no salen aquí: no
 *  hay un rato que los cubra y señalarlos sería ruido.
 * ========================================================================= */

interface PlanChallengesCardProps {
  profileId: ProfileId;
  plan: WeekPlan;
  challenges: ScoredChallenge[];
  skin: ProfileSkin;
  /** Apartar el rato que le falta a un reto: abre el editor ya relleno. */
  onReserve: (block: PlanBlock) => void;
  /** Enseñar en la cuadrícula el día donde ya está apartado. */
  onShow: (block: PlanBlock) => void;
}

export function PlanChallengesCard({
  profileId,
  plan,
  challenges,
  skin,
  onReserve,
  onShow,
}: PlanChallengesCardProps) {
  const heading = skin === 'pitch' ? 'font-display uppercase tracking-wide' : '';

  const links = useMemo(
    () =>
      challenges
        .map((challenge) => ({ challenge, link: challengeLink(profileId, plan, challenge) }))
        .filter((item) => item.link.cover !== 'dia'),
    [challenges, plan, profileId],
  );

  if (links.length === 0) return null;

  const covered = links.filter((item) => item.link.cover === 'reservado').length;

  return (
    <section className="card p-3 sm:p-4" aria-label="Los retos de la semana en la agenda">
      <header className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className={`text-xs font-bold uppercase tracking-wide t-3 ${heading}`}>
          🎯 Los retos, en la semana
        </h3>
        <span className="text-[11px] tabular-nums t-3">
          {covered} de {links.length} con hueco apartado
        </span>
      </header>

      <ul className="space-y-2">
        {links.map(({ challenge, link }) => {
          const has = link.cover === 'reservado';

          return (
            <li
              key={challenge.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border p-2.5
                ${has ? 'hairline surf-1' : 'border-accent bg-accent-faint'}`}
            >
              <span aria-hidden className="text-lg">
                {challenge.icon}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold t-1">
                  <span className="truncate">{challenge.title}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide t-3">
                    {TIER_LABEL[challenge.tier]}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] leading-snug t-2">
                  {has ? '🗓️ ' : '🕳️ '}
                  {link.text}
                </p>
              </div>

              {/* Los días en los que cae, para verlo sin leer */}
              {has && (
                <span className="flex shrink-0 gap-0.5" aria-hidden>
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                    <span
                      key={day}
                      className={`grid h-5 w-5 place-items-center rounded text-[9px] font-bold
                        ${
                          link.days.includes(day)
                            ? 'bg-accent t-on-accent'
                            : 'surf-2 t-3 opacity-50'
                        }`}
                    >
                      {DAY_SHORT[day][0]}
                    </span>
                  ))}
                </span>
              )}

              {has ? (
                <button
                  type="button"
                  onClick={() => onShow(link.blocks[0])}
                  className="btn-ghost min-h-0 shrink-0 px-2.5 py-1 text-[11px]"
                  title={`Ver ${durationLabel(link.minutes)} apartados`}
                >
                  Ver
                </button>
              ) : (
                link.metric && (
                  <button
                    type="button"
                    onClick={() => {
                      const day = freestDay(plan);
                      onReserve(blockForMetric(profileId, link.metric!, day, bestSlot(plan, day)));
                    }}
                    className="btn-primary min-h-0 shrink-0 px-2.5 py-1 text-[11px]"
                  >
                    Apartarle un rato
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2.5 text-[11px] leading-relaxed t-3">
        Un reto con su rato apartado se cumple solo; uno sin hueco depende de que alguien se
        acuerde. Lo que se aparte aquí se comprueba después contra lo registrado, como todo lo
        demás de la semana.
      </p>
    </section>
  );
}

/**
 * El día más despejado de la semana tipo, que es donde tiene sentido proponer
 * lo que falta. Empatan a favor del que va antes: se prefiere que la semana
 * empiece cargada y termine suelta y no al revés.
 */
function freestDay(plan: WeekPlan): number {
  const load = [0, 0, 0, 0, 0, 0, 0];
  for (const block of plan.blocks) load[block.day] += block.duration;

  let best = 0;
  for (let day = 1; day < 7; day += 1) {
    if (load[day] < load[best]) best = day;
  }
  return best;
}
