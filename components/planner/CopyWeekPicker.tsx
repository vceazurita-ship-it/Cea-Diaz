'use client';

import { PROFILES } from '@/lib/profiles';
import type { WeekSource } from '@/lib/planner';
import type { Profile, ProfileId } from '@/types';

/* =========================================================================
 *  De quién copiar la semana.
 *
 *  Leo y Hugo hacen prácticamente la misma semana, y montarla dos veces a
 *  mano es trabajo tirado. Aquí se elige de quién traerla; lo que llega es
 *  una copia suelta —ratos nuevos, con su identificador— que a partir de
 *  ese momento se matiza aquí sin tocar la del otro.
 *
 *  Se dice antes de picar lo que va a pasar: reemplaza lo que hubiera y
 *  cuántos ratos llegarán sin su hábito atado, que entre un peque y un
 *  adulto son casi todos. Y como cualquier cambio de la agenda, se puede
 *  deshacer desde el aviso.
 * ========================================================================= */

interface CopyWeekPickerProps {
  /** El perfil que recibe la semana. */
  profile: Profile;
  sources: WeekSource[];
  /** Si ya tiene semana definida, copiar sustituye: hay que avisarlo. */
  hasWeek: boolean;
  onPick: (from: ProfileId) => void;
  onCancel: () => void;
}

export function CopyWeekPicker({
  profile,
  sources,
  hasWeek,
  onPick,
  onCancel,
}: CopyWeekPickerProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed t-2">
        Trae la semana entera de otro perfil a la de <strong className="t-1">{profile.name}</strong>{' '}
        y cámbiala desde aquí: horas, duraciones y con quién llegan tal cual, pero son ratos
        distintos, así que tocarlos aquí no toca los suyos.
      </p>

      {hasWeek && (
        <p className="rounded-xl border p-2.5 text-xs leading-relaxed hairline surf-2 t-2">
          ⚠️ La semana de {profile.name} tiene ya cosas apartadas y se sustituye por la que
          copies. Se puede deshacer desde el aviso.
        </p>
      )}

      <ul className="space-y-2">
        {sources.map((source) => {
          const from = PROFILES.find((item) => item.id === source.profileId);
          if (!from) return null;

          return (
            <li key={source.profileId}>
              <button
                type="button"
                onClick={() => onPick(source.profileId)}
                className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left
                           hairline surf-1 hover-soft"
              >
                <span
                  aria-hidden
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full
                              bg-gradient-to-br text-lg ${from.gradient}`}
                >
                  {from.avatar}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold t-1">{from.name}</span>
                  <span className="block text-xs tabular-nums t-3">
                    {source.blocks} {source.blocks === 1 ? 'rato' : 'ratos'} · {source.days} de 7
                    días
                  </span>
                  {source.unlinked > 0 && (
                    <span className="mt-0.5 block text-[11px] t-3">
                      🔗 {source.unlinked}{' '}
                      {source.unlinked === 1
                        ? 'llegará sin hábito atado'
                        : 'llegarán sin hábito atado'}
                      : {profile.name} no tiene esos hábitos.
                    </span>
                  )}
                </span>

                <span aria-hidden className="shrink-0 text-lg t-3">
                  ⧉
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <button type="button" onClick={onCancel} className="btn-ghost px-3 py-1.5 text-sm">
          Cancelar
        </button>
      </div>
    </div>
  );
}
