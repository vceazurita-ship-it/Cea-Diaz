'use client';

import { useMemo, useState } from 'react';

import { DayChips } from '@/components/planner/DayChips';
import {
  DAY_NAMES,
  PLAN_KINDS,
  blocksOfDay,
  durationLabel,
  minutesOf,
  plannedMinutes,
  rangeOf,
  timeOf,
} from '@/lib/planner';
import type { CopyMode } from '@/lib/planner';
import type { PlanBlock, WeekPlan } from '@/types';

/* =========================================================================
 *  Copiar, mover, repetir.
 *
 *  Es la pantalla que hace que una semana se rellene en dos minutos en vez de
 *  en veinte. Da igual que lo que se mueva sea un rato suelto o un día entero:
 *  la pregunta es siempre la misma —qué se hace y a qué días— y por eso los
 *  dos casos comparten formulario.
 *
 *  Con un rato: repetirlo **otra vez el mismo día** —dos clases seguidas, dos
 *  bloques de análisis—, llevarlo **a otros días** o **moverlo**.
 *  Con un día entero: **copiarlo** en los que se le parezcan, **moverlo** a
 *  otro o **intercambiarlo**, que es lo que pasa cuando el entreno del martes
 *  se cambia por el del jueves.
 *
 *  Aquí no se toca nada: esto devuelve la orden y la ejecuta la agenda, que
 *  es quien sabe avisar y deshacer.
 * ========================================================================= */

/** Lo que se está copiando: un rato suelto o el día entero. */
export type CopyTarget = { kind: 'block'; block: PlanBlock } | { kind: 'day'; day: number };

/** La orden que sale de aquí, ya resuelta y lista para ejecutarse. */
export type CopyRequest =
  | { kind: 'block'; action: 'copiar'; block: PlanBlock; days: number[] }
  | { kind: 'block'; action: 'mover'; block: PlanBlock; day: number }
  | { kind: 'block'; action: 'duplicar'; block: PlanBlock; start: string }
  | { kind: 'day'; action: 'copiar'; from: number; days: number[]; mode: CopyMode }
  | { kind: 'day'; action: 'mover'; from: number; to: number; mode: CopyMode }
  | { kind: 'day'; action: 'intercambiar'; from: number; to: number };

type Action = 'copiar' | 'mover' | 'duplicar' | 'intercambiar';

interface PlanCopySheetProps {
  plan: WeekPlan;
  target: CopyTarget;
  today?: number;
  /** Cómo llama este perfil a un rato de su agenda. */
  blockWord: string;
  blockWords: string;
  onApply: (request: CopyRequest) => void;
  onCancel: () => void;
}

export function PlanCopySheet({
  plan,
  target,
  today,
  blockWord,
  blockWords,
  onApply,
  onCancel,
}: PlanCopySheetProps) {
  const single = target.kind === 'block';
  const from = single ? target.block.day : target.day;

  const source = useMemo(
    () => (single ? [target.block] : blocksOfDay(plan, from)),
    [plan, single, target, from],
  );

  /** Ratos que ya tiene cada día: se marca a ojo dónde se está cargando. */
  const counts = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].map((day) => plan.blocks.filter((b) => b.day === day).length),
    [plan],
  );

  const [action, setAction] = useState<Action>('copiar');
  const [days, setDays] = useState<number[]>([]);
  const [mode, setMode] = useState<CopyMode>('anadir');
  const [start, setStart] = useState(
    single ? timeOf(Math.min(minutesOf(target.block.start) + target.block.duration, 23 * 60 + 55)) : '17:00',
  );

  const actions: Array<{ id: Action; label: string; hint: string }> = single
    ? [
        { id: 'copiar', label: '⧉ Copiar a otros días', hint: 'Se queda donde está y sale igual en los días que marques.' },
        { id: 'duplicar', label: '➕ Otra vez este día', hint: 'La misma cosa repetida más tarde, sin volver a escribirla.' },
        { id: 'mover', label: '➔ Mover a otro día', hint: 'Cambia de día sin dejar copia detrás.' },
      ]
    : [
        { id: 'copiar', label: '⧉ Copiar el día', hint: 'Todo lo del día sale igual en los que marques.' },
        { id: 'mover', label: '➔ Mover el día', hint: 'El día entero cambia de sitio y el de origen se queda vacío.' },
        { id: 'intercambiar', label: '⇄ Intercambiar', hint: 'Los dos días se cambian el uno por el otro, con todo lo que llevan.' },
      ];

  const chosen = actions.find((item) => item.id === action) ?? actions[0];
  const multiple = action === 'copiar';
  const targetDays = days.filter((day) => day !== from);

  /** Cuántos ratos saldrían de esto, que es lo único que hay que anticipar. */
  const outcome = (() => {
    if (action === 'duplicar') return `1 ${blockWord} más el ${DAY_NAMES[from].toLowerCase()}`;
    if (targetDays.length === 0) return 'Marca a qué días';

    if (action === 'intercambiar') {
      const other = counts[targetDays[0]];
      return `${source.length} ↔ ${other} ${blockWords}`;
    }

    const total = source.length * (action === 'mover' ? 1 : targetDays.length);
    const replaced =
      mode === 'sustituir' && !single
        ? targetDays.reduce((sum, day) => sum + counts[day], 0)
        : 0;

    return replaced > 0
      ? `${total} ${total === 1 ? blockWord : blockWords} · se quitan ${replaced}`
      : `${total} ${total === 1 ? blockWord : blockWords}`;
  })();

  const ready =
    action === 'duplicar' ? true : action === 'copiar' ? targetDays.length > 0 : targetDays.length === 1;

  const apply = () => {
    if (!ready) return;

    if (single) {
      const block = (target as { kind: 'block'; block: PlanBlock }).block;
      if (action === 'duplicar') onApply({ kind: 'block', action: 'duplicar', block, start });
      else if (action === 'mover') onApply({ kind: 'block', action: 'mover', block, day: targetDays[0] });
      else onApply({ kind: 'block', action: 'copiar', block, days: targetDays });
      return;
    }

    if (action === 'intercambiar') onApply({ kind: 'day', action: 'intercambiar', from, to: targetDays[0] });
    else if (action === 'mover') onApply({ kind: 'day', action: 'mover', from, to: targetDays[0], mode });
    else onApply({ kind: 'day', action: 'copiar', from, days: targetDays, mode });
  };

  return (
    <div className="space-y-4 text-sm">
      {/* Qué se copia */}
      <section className="rounded-2xl border p-3 hairline surf-2">
        {single ? (
          <>
            <p className="font-bold leading-snug t-1">
              <span aria-hidden>{target.block.icon}</span> {target.block.title || 'Sin nombre'}
            </p>
            <p className="mt-1 text-xs tabular-nums t-3">
              {DAY_NAMES[from]} · {rangeOf(target.block)} · {durationLabel(target.block.duration)}
              {' · '}
              {PLAN_KINDS[target.block.kind].label}
            </p>
          </>
        ) : (
          <>
            <p className="font-bold leading-snug t-1">
              {source.length === 0
                ? `${DAY_NAMES[from]} está vacío`
                : `Los ${source.length} ${source.length === 1 ? blockWord : blockWords} del ${DAY_NAMES[from].toLowerCase()}`}
            </p>
            {source.length > 0 && (
              <p className="mt-1 text-xs tabular-nums t-3">
                De {source[0].start} a {timeOf(minutesOf(source[source.length - 1].start) + source[source.length - 1].duration)}
                {' · '}
                {durationLabel(plannedMinutes(source))} apartados
              </p>
            )}
          </>
        )}

        {!single && source.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {source.slice(0, 8).map((block) => (
              <li key={block.id} className="chip-soft text-[10px]">
                <span aria-hidden>{block.icon}</span>
                <span className="tabular-nums">{block.start}</span>
              </li>
            ))}
            {source.length > 8 && (
              <li className="chip-soft text-[10px]">y {source.length - 8} más</li>
            )}
          </ul>
        )}
      </section>

      {/* Qué se hace con ello */}
      <section>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide t-3">Qué hago</p>
        <div className="flex flex-wrap gap-1.5">
          {actions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setAction(item.id);
                if (item.id !== 'copiar' && days.length > 1) setDays(days.slice(0, 1));
              }}
              aria-pressed={action === item.id}
              className={`btn border px-2.5 py-1 text-xs font-semibold
                ${
                  action === item.id
                    ? 'bg-accent-soft border-accent t-1'
                    : 'hairline surf-1 t-2 hover-soft'
                }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed t-3">{chosen.hint}</p>
      </section>

      {/* A dónde */}
      {action === 'duplicar' ? (
        <section>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">
              A qué hora
            </span>
            <input
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value || start)}
              className="field w-36 tabular-nums"
            />
          </label>
          <p className="mt-1.5 text-[11px] t-3">
            Sale detrás del original salvo que la cambies.
          </p>
        </section>
      ) : (
        <DayChips
          value={days}
          onChange={setDays}
          multiple={multiple}
          disabled={[from]}
          today={today}
          counts={counts}
          label={multiple ? 'A qué días' : 'A qué día'}
        />
      )}

      {/* Qué se hace con lo que ya hubiera ahí */}
      {!single && action !== 'intercambiar' && (
        <section>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide t-3">
            Y lo que ya hay en esos días
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'anadir', label: 'Se queda y se suma' },
                { id: 'sustituir', label: 'Se sustituye' },
              ] as Array<{ id: CopyMode; label: string }>
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMode(option.id)}
                aria-pressed={mode === option.id}
                className={`btn border px-2.5 py-1 text-xs font-semibold
                  ${
                    mode === option.id
                      ? 'bg-accent-soft border-accent t-1'
                      : 'hairline surf-1 t-2 hover-soft'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Lo que va a pasar, antes de que pase */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-3 hairline">
        <span className="text-xs t-3">
          Resultado: <strong className="t-2">{outcome}</strong>
        </span>

        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button type="button" onClick={apply} disabled={!ready} className="btn-primary px-4">
            Hacerlo
          </button>
        </div>
      </div>
    </div>
  );
}
