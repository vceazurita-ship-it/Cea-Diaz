'use client';

import type { PlanChange, ReplicaPreview } from '@/lib/planTwin';
import type { Profile } from '@/types';

/* =========================================================================
 *  «¿Lo hago también en la semana de tu hermano?»
 *
 *  Es la pregunta que se hacía en voz alta en casa cada vez que se tocaba la
 *  agenda de uno de los dos, y que la app no hacía. Se hace al guardar —no
 *  antes, cuando todavía no se sabe qué va a quedar— y se contesta con lo que
 *  de verdad va a pasar delante: dos ratos nuevos allí, uno puesto igual,
 *  ninguno que se quite.
 *
 *  Y se puede dejar de preguntar en los dos sentidos. Quien monta las dos
 *  semanas iguales lo dice una vez y no lo vuelve a leer; quien las lleva
 *  separadas a propósito —porque uno nada y el otro hace kárate— también.
 *  Preguntar cien veces lo mismo no es cuidado, es ruido.
 * ========================================================================= */

interface ReplicaAskProps {
  /** De quién es la semana que se acaba de tocar. */
  profile: Profile;
  /** Y el hermano que recibiría el cambio. */
  twinName: string;
  change: PlanChange;
  preview: ReplicaPreview;
  onReplicate: () => void;
  /** Replicar y no volver a preguntar. */
  onAlways: () => void;
  onSkip: () => void;
  /** No replicar y no volver a preguntar. */
  onNever: () => void;
}

export function ReplicaAsk({
  profile,
  twinName,
  change,
  preview,
  onReplicate,
  onAlways,
  onSkip,
  onNever,
}: ReplicaAskProps) {
  const lines: string[] = [];
  if (preview.added > 0) {
    lines.push(
      preview.added === 1
        ? `Se aparta 1 rato nuevo en su semana.`
        : `Se apartan ${preview.added} ratos nuevos en su semana.`,
    );
  }
  if (preview.changed > 0) {
    lines.push(
      preview.changed === 1
        ? `1 rato suyo se pone igual que éste.`
        : `${preview.changed} ratos suyos se ponen igual que éstos.`,
    );
  }
  if (preview.removed > 0) {
    lines.push(
      preview.removed === 1
        ? `1 rato suyo se quita.`
        : `${preview.removed} ratos suyos se quitan.`,
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed t-2">
        Acabas de cambiar <strong className="t-1">{change.what}</strong> en la semana de{' '}
        <strong className="t-1">{profile.name}</strong>. ¿Lo dejo igual en la de{' '}
        <strong className="t-1">{twinName}</strong>?
      </p>

      <ul className="space-y-1 rounded-2xl border p-3 hairline surf-1">
        {lines.map((line) => (
          <li key={line} className="text-sm t-2">
            · {line}
          </li>
        ))}
        {preview.unlinked > 0 && (
          <li className="text-xs leading-relaxed t-3">
            🔗 {preview.unlinked}{' '}
            {preview.unlinked === 1
              ? 'hábito de este rato no existe en su registro y llegará sin atar'
              : 'hábitos de este rato no existen en su registro y llegarán sin atar'}
            .
          </li>
        )}
        <li className="text-xs leading-relaxed t-3">
          Lo suyo se respeta: con quién está y sus notas se quedan como estaban. Y se puede
          deshacer desde el aviso.
        </li>
      </ul>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onReplicate} className="btn-primary px-4">
          👯 Sí, en los dos
        </button>
        <button type="button" onClick={onSkip} className="btn-ghost px-3 text-sm">
          Sólo en {profile.name}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 hairline">
        <button type="button" onClick={onAlways} className="text-xs underline-offset-2 hover:underline t-3">
          Hacerlo siempre, sin preguntar
        </button>
        <button type="button" onClick={onNever} className="text-xs underline-offset-2 hover:underline t-3">
          No volver a preguntar
        </button>
      </div>
    </div>
  );
}
