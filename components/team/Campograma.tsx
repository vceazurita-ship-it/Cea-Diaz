'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import {
  FORMATIONS,
  LINE_ICON,
  LINE_LABEL,
  MAX_BENCH,
  addToBench,
  benchSlot,
  formationOf,
  placeInSlot,
  releaseCromo,
  switchFormation,
  updateLineup,
} from '@/lib/lineup';
import { rarityLabel } from '@/lib/rewards';
import type {
  CromoLine,
  CromoReward,
  FormationSlot,
  Lineup,
  ProfileId,
  UnlockedReward,
} from '@/types';

/* =========================================================================
 *  Campograma: montar el equipo con los cromos ganados.
 *
 *  Los cromos caen solos al superar retos; esto es lo que se hace con ellos.
 *  Se elige un dibujo, se pone a cada uno en su puesto y el resto espera en
 *  el banquillo. Nada de arrastrar: en un móvil arrastrar falla la mitad de
 *  las veces, así que se toca la ranura y se elige de una lista. Dos toques
 *  siempre funcionan.
 *
 *  Un cromo sólo puede estar en un sitio, y sólo puede ocupar una ranura de
 *  su línea: un portero no juega de extremo. Esa regla vive en `lib/lineup.ts`
 *  y aquí sólo se pinta.
 * ========================================================================= */

/** Colores del cromo según su mazo. Los mismos que en el álbum. */
const RARITY_CHIP: Record<string, string> = {
  castilla: 'from-violet-400/30 to-indigo-500/25 border-violet-300/40',
  liga: 'from-sky-400/30 to-indigo-500/25 border-sky-300/40',
  premier: 'from-fuchsia-400/30 to-rose-500/25 border-fuchsia-300/40',
  leyenda: 'from-amber-300/40 to-orange-500/30 border-amber-300/50',
};

const chipStyle = (rarity: string) => RARITY_CHIP[rarity] ?? 'hairline surf-2';

/* -------------------------------------------------------------------------
 * Ficha dentro del campo
 * ----------------------------------------------------------------------- */

interface SpotProps {
  slot: FormationSlot;
  cromo: CromoReward | null;
  captain: boolean;
  onPick: () => void;
}

function Spot({ slot, cromo, captain, onPick }: SpotProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{ left: `${slot.x}%`, bottom: `${slot.y}%` }}
      aria-label={
        cromo
          ? `${slot.label}: ${cromo.name}. Tocar para cambiar.`
          : `${slot.label} libre. Tocar para poner un cromo.`
      }
      className="absolute flex w-[19%] min-w-[58px] -translate-x-1/2 translate-y-1/2 flex-col
                 items-center gap-0.5 text-center transition-transform hover:scale-105
                 focus-visible:scale-105"
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full border-2
          text-lg leading-none shadow-md sm:h-12 sm:w-12 sm:text-xl
          ${
            cromo
              ? `bg-gradient-to-br ${chipStyle(cromo.rarity)}`
              : 'border-dashed chalk bg-black/25 t-3'
          }`}
        aria-hidden
      >
        {cromo ? cromo.emblem : '+'}
      </span>

      <span className="rounded-full bg-black/45 px-1.5 text-[9px] font-black uppercase
                       tracking-wider text-white/80">
        {slot.label}
      </span>

      {cromo && (
        <span className="max-w-full truncate text-[10px] font-bold leading-tight text-white
                         drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {captain && <span aria-label="capitán">🅒 </span>}
          {cromo.name.split(' ').slice(-1)[0]}
        </span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------
 * Ficha en una lista (banquillo y reserva)
 * ----------------------------------------------------------------------- */

function Tag({
  cromo,
  onClick,
  label,
}: {
  cromo: CromoReward;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex min-h-10 items-center gap-1.5 rounded-xl border bg-gradient-to-br px-2 py-1.5
        text-left transition-transform hover:scale-[1.03] ${chipStyle(cromo.rarity)}`}
    >
      <span className="text-base leading-none" aria-hidden>
        {cromo.emblem}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-bold leading-tight t-1">{cromo.name}</span>
        <span className="block truncate text-[9px] uppercase tracking-wide t-3">
          {cromo.position}
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------
 * Panel
 * ----------------------------------------------------------------------- */

interface CampogramaProps {
  profileId: ProfileId;
  /** Todo lo ganado; de aquí salen los cromos que se pueden alinear. */
  rewards: UnlockedReward[];
  kid: boolean;
  headingClass: string;
  /** Lo guardado para este perfil, ya sincronizado por quien nos llama. */
  lineup: Lineup;
}

export function Campograma({
  profileId,
  rewards,
  kid,
  headingClass,
  lineup,
}: CampogramaProps) {
  /** Ranura que se está rellenando, si hay un diálogo abierto. */
  const [picking, setPicking] = useState<FormationSlot | null>(null);

  /**
   * Los jugadores del álbum, sin repetidos y sin lo que no es un jugador: las
   * técnicas de la semana no llevan línea, y por eso no entran al campo.
   */
  const squad = useMemo(() => {
    const out = new Map<string, CromoReward>();

    for (const unlocked of rewards) {
      const { reward } = unlocked;
      if (reward.kind !== 'cromo' || !reward.line) continue;
      if (!out.has(reward.id)) out.set(reward.id, reward);
    }

    return out;
  }, [rewards]);

  const formation = formationOf(lineup.formation);

  /** Quién ocupa cada ranura, descartando cromos que ya no estén en el álbum. */
  const onPitch = useMemo(() => {
    const out = new Map<string, CromoReward>();

    for (const slot of formation.slots) {
      const cromo = squad.get(lineup.eleven[slot.id] ?? '');
      if (cromo && cromo.line === slot.line) out.set(slot.id, cromo);
    }

    return out;
  }, [formation, lineup.eleven, squad]);

  const bench = useMemo(
    () => lineup.bench.map((id) => squad.get(id)).filter((cromo): cromo is CromoReward => !!cromo),
    [lineup.bench, squad],
  );

  /** Lo que no está ni en el campo ni en el banquillo: la reserva del álbum. */
  const spare = useMemo(() => {
    const used = new Set([...onPitch.values()].map((cromo) => cromo.id));
    for (const cromo of bench) used.add(cromo.id);
    return [...squad.values()].filter((cromo) => !used.has(cromo.id));
  }, [squad, onPitch, bench]);

  const save = (patch: Partial<Omit<Lineup, 'updatedAt'>>) => {
    if (Object.keys(patch).length > 0) updateLineup(profileId, patch);
  };

  const lineOf = (cromoId: string): CromoLine | null => squad.get(cromoId)?.line ?? null;

  /** Candidatos para la ranura abierta: los de su línea que no juegan ya ahí. */
  const candidates = useMemo(() => {
    if (!picking) return [];
    const current = onPitch.get(picking.id)?.id;
    return [...squad.values()].filter(
      (cromo) => cromo.line === picking.line && cromo.id !== current,
    );
  }, [picking, squad, onPitch]);

  const placed = onPitch.size;
  const total = formation.slots.length;

  return (
    <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={`${headingClass} mb-0`}>⚽ Tu equipo</h3>
        <span className="text-xs font-bold tabular-nums t-accent">
          {placed}/{total} en el campo
        </span>
      </div>

      {squad.size === 0 ? (
        <p className="py-6 text-center text-sm t-3">
          Todavía no hay cromos con los que montar el equipo. Supera un reto y cae el primero.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Nombre del equipo y dibujo */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="field min-w-[150px] flex-1"
              value={lineup.teamName}
              maxLength={40}
              placeholder="Nombre de tu equipo"
              aria-label="Nombre de tu equipo"
              onChange={(event) => save({ teamName: event.target.value })}
            />
            <label className="sr-only" htmlFor={`formacion-${profileId}`}>
              Formación
            </label>
            <select
              id={`formacion-${profileId}`}
              className="field"
              value={formation.id}
              onChange={(event) =>
                save(switchFormation(lineup, event.target.value, lineOf))
              }
            >
              {FORMATIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] leading-snug t-3">{formation.detail}</p>

          {/* El campo */}
          <div
            className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border
                       hairline bg-emerald-950/90 sm:aspect-[4/5]"
          >
            <div className="turf absolute inset-0 opacity-80" aria-hidden />

            {/* Cal: área propia, medio campo, círculo y área rival. */}
            <div aria-hidden className="absolute inset-1.5 rounded-lg border chalk opacity-30" />
            <div aria-hidden className="absolute left-0 right-0 top-1/2 border-t chalk opacity-30" />
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 aspect-square w-[34%] -translate-x-1/2
                         -translate-y-1/2 rounded-full border chalk opacity-30"
            />
            <div
              aria-hidden
              className="absolute bottom-1.5 left-1/2 h-[13%] w-[46%] -translate-x-1/2 rounded-b-lg
                         border border-t-0 chalk opacity-30"
            />
            <div
              aria-hidden
              className="absolute left-1/2 top-1.5 h-[13%] w-[46%] -translate-x-1/2 rounded-t-lg
                         border border-b-0 chalk opacity-30"
            />

            {formation.slots.map((slot) => (
              <Spot
                key={slot.id}
                slot={slot}
                cromo={onPitch.get(slot.id) ?? null}
                captain={onPitch.get(slot.id)?.id === lineup.captain}
                onPick={() => setPicking(slot)}
              />
            ))}
          </div>

          {/* Banquillo */}
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide t-2">
              🪑 Banquillo{' '}
              <span className="tabular-nums t-3">
                {bench.length}/{MAX_BENCH}
              </span>
            </p>
            {bench.length === 0 ? (
              <p className="text-[11px] t-3">
                Vacío. Toca un cromo de la reserva para sentarlo aquí.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {bench.map((cromo) => (
                  <li key={cromo.id}>
                    <Tag
                      cromo={cromo}
                      label={`${cromo.name}, en el banquillo. Tocar para devolverlo al álbum.`}
                      onClick={() => save(releaseCromo(lineup, cromo.id))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Reserva: el resto del álbum */}
          {spare.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide t-2">
                🎁 Cromos sin sitio <span className="tabular-nums t-3">{spare.length}</span>
              </p>
              <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {spare.map((cromo) => (
                  <li key={cromo.id}>
                    <Tag
                      cromo={cromo}
                      label={`${cromo.name}. Tocar para sentarlo en el banquillo.`}
                      onClick={() => save(addToBench(lineup, cromo.id))}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] leading-relaxed t-3">
            Cada cromo sólo juega en su puesto: el portero, en la portería. Toca una posición del
            campo para elegir quién la ocupa; toca un cromo del banquillo para devolverlo al álbum.
          </p>
        </div>
      )}

      {/* Quién ocupa esta posición */}
      {picking && (
        <Modal
          title={`${LINE_ICON[picking.line]} ${picking.label} · ${LINE_LABEL[picking.line]}`}
          onClose={() => setPicking(null)}
        >
          <div className="space-y-3">
            {onPitch.has(picking.id) && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => {
                    save(benchSlot(lineup, picking.id));
                    setPicking(null);
                  }}
                >
                  🪑 Al banquillo
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => {
                    const cromoId = onPitch.get(picking.id)?.id;
                    save({ captain: lineup.captain === cromoId ? undefined : cromoId });
                    setPicking(null);
                  }}
                >
                  🅒 {lineup.captain === onPitch.get(picking.id)?.id
                    ? 'Quitar el brazalete'
                    : 'Hacerle capitán'}
                </button>
              </div>
            )}

            {candidates.length === 0 ? (
              <p className="py-4 text-center text-sm t-3">
                Todavía no tienes ningún cromo para este puesto. Sigue superando retos.
              </p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {candidates.map((cromo) => (
                  <li key={cromo.id}>
                    <button
                      type="button"
                      onClick={() => {
                        save(placeInSlot(lineup, picking.id, cromo.id));
                        setPicking(null);
                      }}
                      className={`flex w-full min-h-11 items-center gap-2 rounded-xl border
                        bg-gradient-to-br px-2.5 py-2 text-left ${chipStyle(cromo.rarity)}`}
                    >
                      <span className="text-xl leading-none" aria-hidden>
                        {cromo.emblem}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold t-1">{cromo.name}</span>
                        <span className="block truncate text-[10px] t-2">
                          {cromo.team} · {cromo.position}
                        </span>
                      </span>
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-wide t-3">
                        {rarityLabel(profileId, cromo.rarity)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
