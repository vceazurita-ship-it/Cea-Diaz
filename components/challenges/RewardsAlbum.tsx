'use client';

import { formatShort } from '@/lib/dates';
import { albumCopyOf, rarityLabel } from '@/lib/rewards';
import type { CromoReward, FraseReward, ProfileId, RewardKind, UnlockedReward } from '@/types';

/* -------------------------------------------------------------------------
 * Estilo por rareza: el mismo lenguaje visual para cromos y frases.
 * ----------------------------------------------------------------------- */

const RARITY_STYLE: Record<string, string> = {
  liga: 'from-sky-400/25 to-indigo-500/20 border-sky-300/30',
  estrella: 'from-fuchsia-400/25 to-rose-500/20 border-fuchsia-300/30',
  leyenda: 'from-amber-300/35 to-orange-500/25 border-amber-300/45',
  chispa: 'from-rose-300/25 to-orange-300/20 border-rose-300/35',
  fuerza: 'from-fuchsia-400/25 to-violet-500/20 border-fuchsia-300/35',
  oro: 'from-amber-300/35 to-rose-400/25 border-amber-300/45',
};

const THEME_LABEL: Record<FraseReward['theme'], string> = {
  familia: '🏡 Familia',
  ella: '🌿 Para ti',
  aula: '💻 Aula',
  paternidad: '👨‍👦 Paternidad',
  oficio: '⚽ Oficio',
  pareja: '💞 Pareja',
};

/* -------------------------------------------------------------------------
 * Cromo
 * ----------------------------------------------------------------------- */

function CromoCard({ cromo, label, footer }: { cromo: CromoReward; label: string; footer: string }) {
  return (
    <li
      className={`flex flex-col gap-1 rounded-2xl border bg-gradient-to-br p-3 text-center
        ${RARITY_STYLE[cromo.rarity]}`}
    >
      <span className="text-[9px] font-black uppercase tracking-[0.12em] t-3">{label}</span>

      <span className="text-3xl leading-none" aria-hidden>
        {cromo.emblem}
      </span>

      <p className="font-display text-sm font-black leading-tight t-1">{cromo.name}</p>
      <p className="text-[11px] font-semibold t-2">{cromo.team}</p>
      <p className="text-[10px] uppercase tracking-wide t-3">{cromo.position}</p>

      <p className="mt-1 border-t pt-1.5 text-[10px] leading-snug t-2 hairline">{cromo.dato}</p>
      <p className="text-[10px] font-semibold italic leading-snug t-1">«{cromo.lema}»</p>

      <p className="mt-auto pt-1.5 text-[9px] t-3">{footer}</p>
    </li>
  );
}

/* -------------------------------------------------------------------------
 * Frase
 * ----------------------------------------------------------------------- */

function FraseCard({ frase, label, footer }: { frase: FraseReward; label: string; footer: string }) {
  return (
    <li
      className={`flex flex-col gap-2 rounded-2xl border bg-gradient-to-br p-4
        ${RARITY_STYLE[frase.rarity]}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.12em] t-3">{label}</span>
        <span className="text-[10px] font-semibold t-3">{THEME_LABEL[frase.theme]}</span>
      </div>

      <p className="font-display text-[15px] font-semibold leading-snug t-1">«{frase.text}»</p>
      {frase.author && <p className="text-[11px] font-semibold t-2">— {frase.author}</p>}

      <p className="mt-auto text-[10px] t-3">{footer}</p>
    </li>
  );
}

/* -------------------------------------------------------------------------
 * Álbum
 * ----------------------------------------------------------------------- */

interface RewardsAlbumProps {
  profileId: ProfileId;
  rewards: UnlockedReward[];
  kind: RewardKind;
  kid: boolean;
  headingClass: string;
}

export function RewardsAlbum({
  profileId,
  rewards,
  kind,
  kid,
  headingClass,
}: RewardsAlbumProps) {
  const cromos = kind === 'cromo';
  const copy = albumCopyOf(profileId);
  if (!copy) return null;

  return (
    <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={`${headingClass} mb-0`}>{copy.title}</h3>
        <span className="text-xs font-bold tabular-nums t-accent">
          {rewards.length} {rewards.length === 1 ? copy.one : copy.many}
        </span>
      </div>

      {rewards.length === 0 ? (
        <p className="py-6 text-center text-sm t-3">{copy.empty}</p>
      ) : (
        <ul className={`grid gap-3 ${cromos ? 'grid-cols-2 sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {rewards.map((unlocked, index) => {
            const footer = `${formatShort(unlocked.week)} · ${unlocked.challengeTitle}`;
            const label = rarityLabel(profileId, unlocked.reward.rarity);

            return unlocked.reward.kind === 'cromo' ? (
              <CromoCard
                key={`${unlocked.week}:${unlocked.reward.id}:${index}`}
                cromo={unlocked.reward}
                label={label}
                footer={footer}
              />
            ) : (
              <FraseCard
                key={`${unlocked.week}:${unlocked.reward.id}:${index}`}
                frase={unlocked.reward}
                label={label}
                footer={footer}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
