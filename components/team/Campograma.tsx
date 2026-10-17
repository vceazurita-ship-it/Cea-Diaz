'use client';

import { useMemo, useState } from 'react';
import { CromoPortrait } from '@/components/ui/CromoPortrait';
import { Modal } from '@/components/ui/Modal';
import { ProgressRing } from '@/components/ui/ProgressRing';
import {
  FORMATIONS,
  LINE_ICON,
  LINE_LABEL,
  MAX_BENCH,
  addToBench,
  benchSlot,
  canPlayIn,
  formationOf,
  outOfPosition,
  placeInSlot,
  releaseCromo,
  switchFormation,
  updateLineup,
} from '@/lib/lineup';
import { RARITY_GRADIENT_STRONG, rarityLabel } from '@/lib/rewards';
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
 *  Un cromo sólo puede estar en un sitio, y puede ocupar una ranura de su
 *  línea o de la de al lado —un central juega de medio, un extremo de lateral,
 *  y se dice que está fuera de su puesto—; la portería, sólo los porteros.
 *  Esa regla vive en `lib/lineup.ts` y aquí sólo se pinta.
 * ========================================================================= */

/** Colores del cromo según su mazo: los del álbum, un punto más marcados. */
const chipStyle = (rarity: string) => RARITY_GRADIENT_STRONG[rarity] ?? 'hairline surf-2';

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
  /** Está jugando aquí, pero no es lo suyo. Se marca, no se impide. */
  const adapted = !!cromo && outOfPosition(cromo.line ?? null, slot.line);

  return (
    <button
      type="button"
      onClick={onPick}
      style={{ left: `${slot.x}%`, bottom: `${slot.y}%` }}
      aria-label={
        cromo
          ? `${slot.label}: ${cromo.name}${
              adapted ? `, fuera de su puesto, que es ${cromo.position}` : ''
            }. Tocar para cambiar.`
          : `${slot.label} libre. Tocar para poner un cromo.`
      }
      className="absolute flex w-[19%] min-w-[58px] -translate-x-1/2 translate-y-1/2 flex-col
                 items-center gap-0.5 text-center transition-transform hover:scale-105
                 focus-visible:scale-105"
    >
      {cromo ? (
        <span className="relative">
          <CromoPortrait
            cromo={cromo}
            size="sm"
            round
            className={`border-2 shadow-md ${
              adapted ? 'border-dashed border-amber-300/80' : chipStyle(cromo.rarity)
            }`}
          />
          {/* La chincheta de «aquí está apañándose»: su puesto de verdad. */}
          {adapted && (
            <span
              className="absolute -right-1.5 -top-1.5 rounded-full bg-amber-300 px-1 text-[11px]
                         font-black uppercase leading-[1.3] text-amber-950 shadow"
              title={`Fuera de su puesto: es ${cromo.position}`}
            >
              {cromo.position}
            </span>
          )}
        </span>
      ) : (
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full border-2
                     border-dashed chalk bg-black/25 text-lg leading-none shadow-md t-3
                     sm:h-12 sm:w-12 sm:text-xl"
          aria-hidden
        >
          +
        </span>
      )}

      <span className="rounded-full bg-black/45 px-1.5 text-[11px] font-black uppercase
                       leading-tight text-white/85">
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
      className={`flex min-h-10 w-full items-center gap-1.5 rounded-xl border bg-gradient-to-br px-2 py-1.5
        text-left transition-transform hover:scale-[1.03] ${chipStyle(cromo.rarity)}`}
    >
      <CromoPortrait cromo={cromo} size="xs" round />
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-bold leading-tight t-1">{cromo.name}</span>
        <span className="block truncate text-[11px] uppercase t-3">
          {cromo.position}
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------
 * Lista de candidatos para una ranura
 * ----------------------------------------------------------------------- */

interface PickListProps {
  cromos: CromoReward[];
  profileId: ProfileId;
  /** `true` en la lista de los que vienen de otra línea: se pinta distinta. */
  adapted?: boolean;
  onPick: (cromoId: string) => void;
}

function PickList({ cromos, profileId, adapted, onPick }: PickListProps) {
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {cromos.map((cromo) => (
        <li key={cromo.id}>
          <button
            type="button"
            onClick={() => onPick(cromo.id)}
            aria-label={
              adapted
                ? `${cromo.name}, ${cromo.position}, fuera de su puesto. Ponerlo aquí.`
                : `${cromo.name}, ${cromo.position}. Ponerlo aquí.`
            }
            className={`flex w-full min-h-11 items-center gap-2 rounded-xl border
              bg-gradient-to-br px-2.5 py-2 text-left ${
                adapted ? 'border-dashed hairline surf-1' : chipStyle(cromo.rarity)
              }`}
          >
            <CromoPortrait cromo={cromo} size="xs" round />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold t-1">{cromo.name}</span>
              <span className="block truncate text-[10px] t-2">
                {cromo.team} · {cromo.position}
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-black uppercase t-3">
              {adapted ? '🔁' : rarityLabel(profileId, cromo.rarity)}
            </span>
          </button>
        </li>
      ))}
    </ul>
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
      if (cromo && canPlayIn(cromo.line ?? null, slot.line)) out.set(slot.id, cromo);
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

  /**
   * Candidatos para la ranura abierta, en dos grupos: primero los de esa
   * línea y después los que pueden apañarse viniendo de la de al lado. Van
   * separados y no revueltos porque la lista tiene que seguir contestando
   * «¿quién juega aquí?» antes de «¿quién puede jugar aquí si hace falta?».
   */
  const candidates = useMemo(() => {
    if (!picking) return { own: [] as CromoReward[], adapted: [] as CromoReward[] };

    const current = onPitch.get(picking.id)?.id;
    const own: CromoReward[] = [];
    const adapted: CromoReward[] = [];

    for (const cromo of squad.values()) {
      if (cromo.id === current) continue;
      if (cromo.line === picking.line) own.push(cromo);
      else if (canPlayIn(cromo.line ?? null, picking.line)) adapted.push(cromo);
    }

    return { own, adapted };
  }, [picking, squad, onPitch]);

  const placed = onPitch.size;
  const total = formation.slots.length;

  return (
    <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
      {/* La cabecera: el nombre del equipo es el titular, y se escribe ahí
          mismo; al lado, el anillo con los que ya están en el campo. */}
      <div className="mb-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={`${headingClass} !mb-0 !text-[11px]`}>⚽ Tu equipo</h3>
          {squad.size > 0 && (
            <input
              className="mt-0.5 w-full rounded-lg border-0 border-b-2 border-dashed bg-transparent px-0 py-0.5 font-display text-2xl font-black leading-tight t-1 hairline placeholder:t-3 focus:border-[var(--accent)] focus:outline-none"
              value={lineup.teamName}
              maxLength={40}
              placeholder="Ponle nombre…"
              aria-label="Nombre de tu equipo"
              onChange={(event) => save({ teamName: event.target.value })}
            />
          )}
        </div>
        <ProgressRing ratio={total ? placed / total : 0} size={56} stroke={5}>
          <span className="text-center leading-none">
            <span className="block text-[13px] font-black tabular-nums t-1">
              {placed}/{total}
            </span>
            <span className="block text-[8px] font-bold uppercase tracking-wide t-3">en campo</span>
          </span>
        </ProgressRing>
      </div>

      {squad.size === 0 ? (
        <p className="py-6 text-center text-sm t-3">
          Todavía no hay cromos con los que montar el equipo. Supera un reto y cae el primero.
        </p>
      ) : (
        <div className="space-y-3">
          {/* El dibujo: las formaciones en pastillas, de un toque, y debajo
              lo que significa la elegida. */}
          <div>
            <div className="edge-mask-x -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="radiogroup" aria-label="Formación" data-noswipe>
              {FORMATIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={option.id === formation.id}
                  onClick={() => option.id !== formation.id && save(switchFormation(lineup, option.id, lineOf))}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-black tabular-nums transition ${
                    option.id === formation.id ? 'bg-accent t-on-accent shadow' : 'chip-soft'
                  }`}
                >
                  {option.name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] leading-snug t-3">{formation.detail}</p>
          </div>

          {/* El campo */}
          <div
            className="relative aspect-[5/6] w-full overflow-hidden rounded-2xl border
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
              <ul className="edge-mask-x -mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible" data-noswipe>
                {bench.map((cromo) => (
                  <li key={cromo.id} className="w-40 shrink-0 snap-start sm:w-auto">
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
              <ul className="edge-mask-x -mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible" data-noswipe>
                {spare.map((cromo) => (
                  <li key={cromo.id} className="w-40 shrink-0 snap-start sm:w-auto">
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

          <details className="group text-[11px] leading-relaxed t-3">
            <summary className="cursor-pointer list-none font-bold t-2">
              <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span> ¿Cómo se monta el equipo?
            </summary>
            <p className="mt-1">
            Cada cromo juega en su puesto o en uno de al lado —un central de medio, un extremo
            de lateral—, y ahí sale marcado con lo que es él en realidad. En la portería, sólo
            porteros. Toca una posición del campo para elegir quién la ocupa; toca un cromo del
            banquillo para devolverlo al álbum.
            </p>
          </details>
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

            {candidates.own.length === 0 && candidates.adapted.length === 0 ? (
              <p className="py-4 text-center text-sm t-3">
                Todavía no tienes ningún cromo para este puesto. Sigue superando retos.
              </p>
            ) : (
              <>
                {candidates.own.length > 0 && (
                  <PickList
                    cromos={candidates.own}
                    profileId={profileId}
                    onPick={(cromoId) => {
                      save(placeInSlot(lineup, picking.id, cromoId));
                      setPicking(null);
                    }}
                  />
                )}

                {candidates.adapted.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide t-2">
                      🔁 Fuera de su puesto
                    </p>
                    <p className="mb-1.5 text-[11px] leading-snug t-3">
                      No es su sitio, pero pueden jugar aquí: se quedan marcados en el campo
                      con el puesto que es suyo de verdad.
                    </p>
                    <PickList
                      cromos={candidates.adapted}
                      profileId={profileId}
                      adapted
                      onPick={(cromoId) => {
                        save(placeInSlot(lineup, picking.id, cromoId));
                        setPicking(null);
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
