'use client';

import { headingFont, kickerFont } from '@/lib/profiles';
import { useId, useMemo, useState } from 'react';

import { ProgressRing } from '@/components/ui/ProgressRing';
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
 *  Con dieciséis retos eran dieciséis tarjetas y tres pantallas de móvil
 *  antes de llegar a la semana. Ahora es una tarjeta con un anillo —cuántos
 *  tienen su rato— y una fila por reto; los que no lo tienen, primero, y
 *  sólo los tres primeros hasta que se pide verlos todos.
 *
 *  Los retos de día entero —registrar, la media diaria— no salen aquí: no
 *  hay un rato que los cubra y señalarlos sería ruido.
 * ========================================================================= */

/** Cuántos retos se ven con la tarjeta plegada. */
const FOLDED = 3;

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
  const heading = headingFont(skin);
  const kicker = kickerFont(skin);
  const [open, setOpen] = useState(false);
  const listId = useId();

  const links = useMemo(
    () =>
      challenges
        .map((challenge) => ({ challenge, link: challengeLink(profileId, plan, challenge) }))
        .filter((item) => item.link.cover !== 'dia')
        // Lo que pide un botón, delante; lo que ya está resuelto, detrás.
        .sort(
          (a, b) =>
            Number(a.link.cover === 'reservado') - Number(b.link.cover === 'reservado'),
        ),
    [challenges, plan, profileId],
  );

  if (links.length === 0) return null;

  const covered = links.filter((item) => item.link.cover === 'reservado').length;
  const missing = links.length - covered;
  const visible = open ? links : links.slice(0, FOLDED);

  return (
    <section className="card p-3 sm:p-4" aria-label="Los retos de la semana en la agenda">
      <header className="mb-1 flex items-center gap-3 px-1">
        <span aria-hidden>
          <ProgressRing ratio={covered / links.length} size={44} stroke={5}>
            <span className="text-[10px] font-black tabular-nums t-1">
              {covered}/{links.length}
            </span>
          </ProgressRing>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`text-[11px] font-black uppercase tracking-[0.22em] t-3${kicker}`}>
            🎯 Los retos, en la semana
          </h3>
          <p className={`mt-0.5 font-display text-base font-black leading-tight t-1 ${heading}`}>
            {missing === 0
              ? 'Todos tienen su rato'
              : `${missing} ${missing === 1 ? 'reto sin hueco' : 'retos sin hueco'}`}
            <span className="sr-only">
              {' '}
              · {covered} de {links.length} con hueco apartado
            </span>
          </p>
        </div>
      </header>

      <ul id={listId} className="divide-y divide-[var(--border)]">
        {visible.map(({ challenge, link }) => {
          const has = link.cover === 'reservado';

          return (
            <li key={challenge.id} className="flex items-center gap-3 px-1 py-2.5">
              <span
                aria-hidden
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg
                  ${has ? 'surf-2' : 'bg-accent-soft'}`}
              >
                {challenge.icon}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-[13px] font-bold t-1">{challenge.title}</span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider t-3">
                    {TIER_LABEL[challenge.tier]}
                  </span>
                </p>
                {has ? (
                  /* Los días en los que cae, para verlo sin leer */
                  <span className="mt-1 flex gap-0.5">
                    <span className="sr-only">{link.text}</span>
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <span
                        key={day}
                        aria-hidden
                        className={`grid h-4 w-4 place-items-center rounded text-[9px] font-bold
                          ${link.days.includes(day) ? 'bg-accent t-on-accent' : 'surf-2 t-3 opacity-50'}`}
                      >
                        {DAY_SHORT[day][0]}
                      </span>
                    ))}
                  </span>
                ) : (
                  <p className={`mt-0.5 text-[11px] leading-snug t-3 ${open ? '' : 'line-clamp-1'}`}>
                    {link.text}
                  </p>
                )}
              </div>

              {has ? (
                <button
                  type="button"
                  onClick={() => onShow(link.blocks[0])}
                  className="btn-ghost tap-area min-h-0 shrink-0 px-2.5 py-1 text-[11px]"
                  title={`Ver ${durationLabel(link.minutes)} apartados`}
                  aria-label={`Ver en la semana «${challenge.title}»`}
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
                    className="btn-primary tap-area min-h-0 shrink-0 px-2.5 py-1 text-[11px]"
                    aria-label={`Apartarle un rato a «${challenge.title}»`}
                  >
                    ＋ Rato
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>

      {links.length > FOLDED && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={listId}
          className="btn-ghost mt-1 w-full px-3 py-1.5 text-xs"
        >
          {open ? 'Ver menos' : `Ver los ${links.length} retos`}
        </button>
      )}

      {open && (
        <p className="mt-2.5 px-1 text-[11px] leading-relaxed t-3">
          Un reto con su rato apartado se cumple solo; uno sin hueco depende de que alguien se
          acuerde. Lo que se aparte aquí se comprueba después contra lo registrado, como todo lo
          demás de la semana.
        </p>
      )}
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
