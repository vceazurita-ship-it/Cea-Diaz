'use client';

import { useMemo } from 'react';
import { RewardsAlbum } from '@/components/challenges/RewardsAlbum';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { buildChallengeWeek, challengeHistory, TIER_LABEL } from '@/lib/challenges';
import { formatShort } from '@/lib/dates';
import { collectRewards, rarityLabel, rewardKindOf, rewardLabelFor } from '@/lib/rewards';
import type {
  ChallengeWeek,
  DateKey,
  DayEntry,
  Profile,
  ProfileId,
  ProfileSkin,
  Reward,
  ScoredChallenge,
} from '@/types';

interface ChallengesPanelProps {
  profile: Profile;
  date: DateKey;
  entries: Record<string, DayEntry>;
  skin: ProfileSkin;
}

/* -------------------------------------------------------------------------
 * Tarjeta de un reto
 * ----------------------------------------------------------------------- */

interface ChallengeCardProps {
  profileId: ProfileId;
  challenge: ScoredChallenge;
  kid: boolean;
  /** Premio ya ganado con este reto, si lo hubiera. */
  reward?: Reward;
  /** Qué se llevará si lo consigue, anunciado por adelantado. */
  prize?: string | null;
}

function ChallengeCard({ profileId, challenge, kid, reward, prize }: ChallengeCardProps) {
  const { progress } = challenge;

  return (
    <li
      className={`${kid ? 'card-kid' : 'card'} p-4 transition-colors ${
        progress.done ? 'border-accent bg-accent-faint' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 text-3xl ${progress.done ? 'animate-pop' : 'opacity-80'}`}
          aria-hidden
        >
          {challenge.icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`chip text-[10px] uppercase tracking-wide ${
                challenge.tier === 'maximo' ? 'chip-accent' : 'chip-soft'
              }`}
            >
              {TIER_LABEL[challenge.tier]}
            </span>
            <span className="text-[10px] font-bold tabular-nums t-3">+{challenge.xp} puntos</span>
            {progress.done && (
              <span className="text-[11px] font-black t-accent">✓ Superado</span>
            )}
          </div>

          <p className={`mt-1.5 font-bold t-1 ${kid ? 'text-base' : 'text-sm'}`}>
            {challenge.title}
          </p>
          <p className="mt-0.5 text-xs t-2">{challenge.detail}</p>

          <div className="mt-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <ProgressBar
                ratio={progress.ratio}
                chunky={kid}
                ariaLabel={`${challenge.title}: ${progress.label}`}
              />
            </div>
            <span className="shrink-0 text-xs font-bold tabular-nums t-1">{progress.label}</span>
          </div>

          <p className="mt-2 text-[11px] leading-snug t-3">💡 {challenge.why}</p>

          {/* El premio: anunciado antes, entregado después. */}
          {reward ? (
            <p className="mt-2 rounded-xl border p-2 text-[11px] font-semibold leading-snug border-accent bg-accent-faint t-1">
              🎁{' '}
              {reward.kind === 'cromo'
                ? `${rarityLabel(profileId, reward.rarity)}: ${reward.name} · ${reward.team}`
                : `«${reward.text}»${reward.author ? ` — ${reward.author}` : ''}`}
            </p>
          ) : (
            prize && <p className="mt-2 text-[11px] font-semibold t-2">🎁 En juego: {prize}</p>
          )}
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------
 * Medallero de las semanas anteriores
 * ----------------------------------------------------------------------- */

function HistoryStrip({ weeks }: { weeks: ChallengeWeek[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {weeks.map((week) => (
        <li
          key={week.from}
          className="flex min-w-[104px] flex-1 flex-col gap-1 rounded-xl border p-2.5 hairline surf-1"
        >
          <span className="text-[10px] uppercase tracking-wide t-3">
            {formatShort(week.from)}
          </span>
          <span className="flex gap-1 text-sm" aria-hidden>
            {week.challenges.map((challenge) => (
              <span
                key={challenge.id}
                className={challenge.progress.done ? '' : 'opacity-25 grayscale'}
              >
                {challenge.progress.done ? '🏅' : '⚪'}
              </span>
            ))}
          </span>
          <span className="text-[11px] font-semibold tabular-nums t-2">
            {week.done}/{week.challenges.length} retos
          </span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------
 * Panel
 * ----------------------------------------------------------------------- */

/** Mensaje de cabecera: reconoce lo hecho y señala lo que queda. */
function headline(done: number, total: number, kid: boolean): string {
  if (total === 0) return 'Esta semana no hay retos que proponer todavía.';
  if (done === 0) {
    return kid
      ? '¡Aún están todos por conseguir! Empieza por el que veas más cerca.'
      : 'Semana recién empezada: los tres siguen en juego.';
  }
  if (done < total) {
    return kid
      ? `¡Muy bien! Ya llevas ${done}. Queda${total - done === 1 ? '' : 'n'} ${total - done}.`
      : `${done} superado${done === 1 ? '' : 's'}. Queda${total - done === 1 ? '' : 'n'} ${total - done} por cerrar.`;
  }
  return kid ? '¡Semana redonda! Los has conseguido todos. 🏆' : 'Los tres superados: semana redonda. 🏆';
}

export function ChallengesPanel({ profile, date, entries, skin }: ChallengesPanelProps) {
  const kid = profile.kind === 'kid';
  const headingClass = `mb-3 text-sm font-bold uppercase tracking-wide t-2${
    skin === 'pitch' ? ' font-display tracking-[0.14em]' : ''
  }`;

  const week = useMemo(() => buildChallengeWeek(profile, date, entries), [profile, date, entries]);
  const history = useMemo(
    () => challengeHistory(profile, date, entries, 4),
    [profile, date, entries],
  );

  // Premios: sólo los tienen quienes coleccionan algo (los peques y María).
  const rewardKind = rewardKindOf(profile.id);
  const rewards = useMemo(
    () => (rewardKind ? collectRewards(profile, entries, date) : []),
    [rewardKind, profile, entries, date],
  );

  /** Lo ganado esta misma semana, para enseñarlo junto a su reto. */
  const wonThisWeek = useMemo(
    () =>
      new Map(
        rewards
          .filter((unlocked) => unlocked.week === week.from)
          .map((unlocked) => [unlocked.challengeId, unlocked.reward]),
      ),
    [rewards, week.from],
  );

  const total = week.challenges.length;

  return (
    <div className="space-y-4">
      {/* Cabecera: cuántos van y cuántos puntos hay en juego */}
      <div className={`${kid ? 'card-kid' : 'card'} flex flex-wrap items-center gap-5 p-5`}>
        <ProgressRing ratio={total ? week.done / total : 0} size={kid ? 116 : 96}>
          <span className="text-2xl font-black tabular-nums t-1">
            {week.done}
            <span className="text-sm t-3">/{total}</span>
          </span>
          <span className="text-[10px] uppercase tracking-wide t-3">retos</span>
        </ProgressRing>

        <div className="min-w-[190px] flex-1 space-y-2">
          <h2 className={`font-bold t-1 ${skin === 'pitch' ? 'font-display uppercase' : ''}`}>
            Retos de la semana
          </h2>
          <p className="text-sm t-2">{headline(week.done, total, kid)}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="chip-soft">
              📆 {formatShort(week.from)} – {formatShort(week.to)}
            </span>
            <span className="chip-soft">
              ✨ {week.xp} / {week.xpMax} puntos
            </span>
          </div>
        </div>
      </div>

      {/* Los retos */}
      {total === 0 ? (
        <div className={`${kid ? 'card-kid' : 'card'} p-8 text-center`}>
          <p className="text-4xl" aria-hidden>
            🎯
          </p>
          <p className="mt-2 font-bold t-1">Todavía no hay retos</p>
          <p className="mt-1 text-sm t-3">
            Registra algún día para que se puedan calcular sobre tus propios datos.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {week.challenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              profileId={profile.id}
              challenge={challenge}
              kid={kid}
              reward={wonThisWeek.get(challenge.id)}
              prize={rewardLabelFor(profile.id, challenge.tier)}
            />
          ))}
        </ul>
      )}

      {/* Álbum de premios */}
      {rewardKind && (
        <RewardsAlbum
          profileId={profile.id}
          rewards={rewards}
          kind={rewardKind}
          kid={kid}
          headingClass={headingClass}
        />
      )}

      {/* Medallero */}
      <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
        <h3 className={headingClass}>Semanas anteriores</h3>
        <HistoryStrip weeks={history} />
      </div>

      <p className="pt-1 text-center text-[11px] leading-relaxed t-3">
        Los retos se calculan cada lunes con los últimos 28 días de este perfil: el listón
        sale siempre de tu propia marca, así que sólo compites contigo.
      </p>
    </div>
  );
}
