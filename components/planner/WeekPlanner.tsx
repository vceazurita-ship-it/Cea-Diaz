'use client';

import { useMemo, useState } from 'react';

import { BlockEditor } from '@/components/planner/BlockEditor';
import { PlanAlerts } from '@/components/planner/PlanAlerts';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { HabitStore } from '@/hooks/useHabitStore';
import { useWeekPlan } from '@/hooks/useWeekPlan';
import { formatShort, isToday, weekKeys } from '@/lib/dates';
import { companionShare, reviewWeek, statusIcon, statusLabel, statusShort } from '@/lib/planCheck';
import {
  COMPANIONS,
  DAY_NAMES,
  DAY_SHORT,
  PLAN_KINDS,
  blocksOfDay,
  clearDayPlan,
  copyDayPlan,
  durationLabel,
  emptyBlock,
  planOf,
  rangeOf,
  removePlanBlock,
  sampleWeek,
  savePlanBlock,
  themeOf,
  updatePlan,
} from '@/lib/planner';
import type { DateKey, PlanBlock, PlanStatus, Profile, ProfileSkin } from '@/types';

/* =========================================================================
 *  Agenda semanal del perfil.
 *
 *  La semana tipo, de lunes a domingo, editable a toques. Cada rato puede
 *  ir atado a un hábito del registro, y de ahí sale lo que distingue esta
 *  pantalla de una lista cualquiera: al lado de cada cosa planificada se
 *  dice si se cumplió, si se quedó corta o si se pasó del máximo, y arriba
 *  se resumen las carencias y los excesos de la semana entera.
 *
 *  Lo que cambia de un perfil a otro es el rótulo y el adorno —el campo y
 *  Oliver y Benji para los peques, el filete dorado para María, el acero
 *  para Víctor—, nunca la mecánica: es la misma cuadrícula para los seis.
 * ========================================================================= */

/** Cómo se pinta el desenlace de un rato en su pastilla. */
const STATUS_STYLE: Record<PlanStatus, string> = {
  cumplido: 'bg-accent t-on-accent',
  flojo: 'bg-amber-400/30 t-1',
  excedido: 't-danger',
  sinRegistrar: 'surf-3 t-2',
  futuro: 'surf-2 t-3',
  sinMetrica: 'surf-2 t-3',
};

interface WeekPlannerProps {
  profile: Profile;
  /** Día visible en el panel; de él sale la semana que se contrasta. */
  date: DateKey;
  store: HabitStore;
  skin: ProfileSkin;
}

export function WeekPlanner({ profile, date, store, skin }: WeekPlannerProps) {
  const plan = useWeekPlan(profile.id);
  const notify = useToast();
  const [editing, setEditing] = useState<{ block: PlanBlock; isNew: boolean } | null>(null);

  const kid = profile.kind === 'kid';
  const theme = themeOf(profile.id);
  const dates = useMemo(() => weekKeys(date), [date]);

  const review = useMemo(
    () => reviewWeek(profile, plan, dates, store.entries),
    [profile, plan, dates, store.entries],
  );

  /** Desenlace por rato, para pintarlo en su casilla sin recalcular nada. */
  const checkById = useMemo(
    () => new Map(review.checks.map((check) => [check.block.id, check])),
    [review],
  );

  const share = useMemo(() => (kid ? companionShare(plan) : []), [kid, plan]);
  const heading = skin === 'pitch' ? 'font-display uppercase tracking-wide' : '';

  /** La frase de la semana: la misma todo el día, distinta cada día. */
  const quote = theme.quotes[dates.indexOf(date) % theme.quotes.length] ?? theme.quotes[0];

  /* ------------------------------------------------------------ acciones */

  /** Deshacer significa devolver la agenda tal y como estaba. */
  const undoTo = (blocks: PlanBlock[]) => () => {
    updatePlan(profile.id, blocks);
    notify({ message: 'Como estaba.', icon: '↩️' });
  };

  const save = (block: PlanBlock) => {
    savePlanBlock(profile.id, block);
    setEditing(null);
    notify({ message: editing?.isNew ? 'Apartado en la semana.' : 'Cambiado.', icon: '🗓️' });
  };

  const remove = (block: PlanBlock) => {
    const before = planOf(profile.id).blocks;
    removePlanBlock(profile.id, block.id);
    setEditing(null);
    notify({
      message: `«${block.title}» fuera de la semana.`,
      icon: '🗑️',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
  };

  const copyDay = (day: number) => {
    const from = (day + 6) % 7;
    const before = planOf(profile.id).blocks;
    const copied = copyDayPlan(profile.id, from, day);

    notify(
      copied > 0
        ? {
            message: `${copied} ${copied === 1 ? 'rato copiado' : 'ratos copiados'} del ${DAY_NAMES[from].toLowerCase()}.`,
            icon: '📋',
            action: { label: 'Deshacer', onClick: undoTo(before) },
          }
        : { message: `El ${DAY_NAMES[from].toLowerCase()} no tiene nada que copiar.`, icon: '🤷' },
    );
  };

  const clearDay = (day: number) => {
    const before = planOf(profile.id).blocks;
    const removed = clearDayPlan(profile.id, day);
    if (removed === 0) return;

    notify({
      message: `${DAY_NAMES[day]} vaciado.`,
      icon: '🧹',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
  };

  const useSample = () => {
    const before = planOf(profile.id).blocks;
    updatePlan(profile.id, sampleWeek(profile.id));
    notify({
      message: 'Semana de ejemplo puesta. Edítala a tu gusto.',
      icon: '✨',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
  };

  /* ------------------------------------------------------------- pintura */

  const kept = review.kept;
  const missed = review.missed;
  const judged = kept + missed;

  return (
    <div className="space-y-4">
      {/* Cabecera: cada casa, la suya */}
      <PlannerHeader
        profile={profile}
        title={theme.title}
        icon={theme.icon}
        kicker={theme.kicker}
        ornament={theme.ornament}
        quote={quote}
        from={dates[0]}
        to={dates[6]}
      />

      {/* Lo que la semana dice de sí misma */}
      <section className="card p-3 sm:p-4" aria-label="Resumen de la semana">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-bold t-1">
            {review.blocks} {review.blocks === 1 ? theme.blockWord : theme.blockWords}
          </span>
          <span className="t-3">·</span>
          <span className="t-2">
            🔗 {review.linked} {review.linked === 1 ? 'atado' : 'atados'} a un hábito
          </span>
          {judged > 0 && (
            <>
              <span className="t-3">·</span>
              <span className="t-2 tabular-nums">
                ✓ {kept} cumplidos · ✕ {missed} fallidos
              </span>
            </>
          )}
        </div>

        {judged > 0 && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full track">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${Math.round((kept / judged) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs t-3">
              De lo planificado que ya ha pasado, se ha cumplido el{' '}
              <strong className="tabular-nums t-2">{Math.round((kept / judged) * 100)} %</strong>.
            </p>
          </div>
        )}

        {/* Con quién han estado los peques esta semana */}
        {kid && share.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3 hairline">
            <span className="text-xs font-bold uppercase tracking-wide t-3">Con quién:</span>
            {share.map(({ companion, minutes }) => (
              <span key={companion} className="chip-soft">
                <span aria-hidden>{COMPANIONS[companion].icon}</span>
                {COMPANIONS[companion].short}
                <span className="tabular-nums opacity-70">{durationLabel(minutes)}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <PlanAlerts alerts={review.alerts} skin={skin} />

      {/* La semana */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {dates.map((dayDate, day) => {
          const blocks = blocksOfDay(plan, day);
          const today = isToday(dayDate);
          const dayKept = blocks.filter(
            (block) => checkById.get(block.id)?.status === 'cumplido',
          ).length;
          const dayJudged = blocks.filter((block) => {
            const status = checkById.get(block.id)?.status;
            return status && status !== 'sinMetrica' && status !== 'futuro';
          }).length;

          return (
            <article
              key={dayDate}
              className={`${kid ? 'card-kid' : 'card'} flex flex-col p-3
                ${today ? 'border-accent' : ''}`}
              aria-label={`${DAY_NAMES[day]} ${formatShort(dayDate)}`}
            >
              <header className="mb-2 flex items-baseline gap-2">
                <h3 className={`text-sm font-bold t-1 ${heading}`}>
                  {DAY_SHORT[day]}
                  <span className="ml-1.5 text-xs font-normal tabular-nums t-3">
                    {formatShort(dayDate)}
                  </span>
                </h3>

                {today && (
                  <span className="chip-accent px-2 py-0.5 text-[10px] uppercase">Hoy</span>
                )}

                {dayJudged > 0 && (
                  <span className="ml-auto text-[11px] tabular-nums t-3">
                    {dayKept}/{dayJudged} ✓
                  </span>
                )}
              </header>

              {blocks.length === 0 ? (
                <p className="py-2 text-xs t-3">Sin nada apartado.</p>
              ) : (
                <ul className="space-y-1.5">
                  {blocks.map((block) => {
                    const check = checkById.get(block.id);
                    const status = check?.status ?? 'sinMetrica';
                    const kindMeta = PLAN_KINDS[block.kind];

                    return (
                      <li key={block.id}>
                        <button
                          type="button"
                          onClick={() => setEditing({ block, isNew: false })}
                          className="flex w-full items-start gap-2 rounded-xl border p-2 text-left
                                     hairline surf-1 hover-soft"
                          title={`${rangeOf(block)}${check?.text ? ` · ${check.text}` : ''}`}
                        >
                          <span
                            aria-hidden
                            className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-b ${kindMeta.gradient}`}
                          />

                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-1.5">
                              <span className="text-[11px] font-bold tabular-nums t-3">
                                {block.start}
                              </span>
                              <span className="truncate text-xs font-semibold t-1">
                                <span aria-hidden>{block.icon}</span> {block.title}
                              </span>
                            </span>

                            <span className="mt-0.5 flex flex-wrap items-center gap-1">
                              <span className="text-[10px] tabular-nums t-3">
                                {durationLabel(block.duration)}
                              </span>

                              {block.companion && (
                                <span className="rounded-full px-1.5 text-[10px] font-semibold surf-2 t-2">
                                  <span aria-hidden>{COMPANIONS[block.companion].icon}</span>{' '}
                                  {COMPANIONS[block.companion].short}
                                </span>
                              )}

                              {block.metricId && status !== 'sinMetrica' && (
                                <span
                                  className={`rounded-full px-1.5 text-[10px] font-bold ${STATUS_STYLE[status]}`}
                                  title={check?.text}
                                >
                                  {statusIcon(status)} {statusShort(status)}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing({ block: emptyBlock(day), isNew: true })}
                  className="btn-ghost min-h-0 flex-1 px-2 py-1.5 text-xs"
                >
                  ＋ Añadir
                </button>
                <button
                  type="button"
                  onClick={() => copyDay(day)}
                  aria-label={`Copiar el ${DAY_NAMES[(day + 6) % 7].toLowerCase()} en el ${DAY_NAMES[day].toLowerCase()}`}
                  title={`Copiar el ${DAY_NAMES[(day + 6) % 7].toLowerCase()}`}
                  className="btn-ghost min-h-0 px-2 py-1.5 text-xs"
                >
                  ⧉
                </button>
                {blocks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearDay(day)}
                    aria-label={`Vaciar el ${DAY_NAMES[day].toLowerCase()}`}
                    title="Vaciar el día"
                    className="btn-ghost min-h-0 px-2 py-1.5 text-xs"
                  >
                    🧹
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {/* Séptima casilla de la rejilla: lo que se puede hacer con la semana */}
        <article className={`${kid ? 'card-kid' : 'card'} flex flex-col justify-center gap-2 p-3`}>
          <p className="text-xs font-bold uppercase tracking-wide t-3">La semana entera</p>

          <button type="button" onClick={useSample} className="btn-ghost px-3 py-1.5 text-xs">
            ✨ {plan.blocks.length === 0 ? 'Empezar con una de ejemplo' : 'Rehacer con la de ejemplo'}
          </button>

          {plan.blocks.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const before = planOf(profile.id).blocks;
                updatePlan(profile.id, []);
                notify({
                  message: 'Semana vaciada.',
                  icon: '🧹',
                  tone: 'danger',
                  action: { label: 'Deshacer', onClick: undoTo(before) },
                });
              }}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              🧹 Vaciar la semana
            </button>
          )}

          <p className="text-[11px] leading-relaxed t-3">
            La agenda se repite todas las semanas. Lo que ocurre una sola vez va en Tareas, que
            tiene fecha y se tacha.
          </p>
        </article>
      </div>

      {/* Qué significa cada marca */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] t-3">
        <span className="font-bold uppercase tracking-wide">Marcas:</span>
        {(['cumplido', 'flojo', 'excedido', 'sinRegistrar', 'futuro'] as PlanStatus[]).map(
          (status) => (
            <span key={status} className="inline-flex items-center gap-1">
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${STATUS_STYLE[status]}`}>
                {statusIcon(status)}
              </span>
              {statusLabel(status)}
            </span>
          ),
        )}
      </div>

      {editing && (
        <Modal
          title={editing.isNew ? 'Apartar un rato' : 'Editar el rato'}
          onClose={() => setEditing(null)}
          size="lg"
        >
          <BlockEditor
            profile={profile}
            block={editing.block}
            isNew={editing.isNew}
            onSave={save}
            onCancel={() => setEditing(null)}
            onDelete={editing.isNew ? undefined : () => remove(editing.block)}
          />
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Cabecera
 *
 * Lo único de la pantalla que cambia de verdad de un perfil a otro. El campo
 * y la banda blanca y dorada para los peques —que la semana les entre por
 * donde les entra el fútbol—, el filete dorado y la serif para María, la
 * regla de acero para Víctor y el degradado cálido para los módulos
 * compartidos. Los colores siguen saliendo del tinte del perfil: aquí sólo
 * se decide el adorno.
 * ------------------------------------------------------------------------- */

interface HeaderProps {
  profile: Profile;
  title: string;
  icon: string;
  kicker: string;
  ornament: 'pitch' | 'gold' | 'steel' | 'warm' | 'rose';
  quote: string;
  from: DateKey;
  to: DateKey;
}

function PlannerHeader({
  profile,
  title,
  icon,
  kicker,
  ornament,
  quote,
  from,
  to,
}: HeaderProps) {
  const pitch = ornament === 'pitch';

  return (
    <header
      className={`relative overflow-hidden rounded-3xl border p-4 sm:p-5
        ${pitch ? 'turf chalk border-2' : 'hairline'} surf-1`}
    >
      {/* Adornos: cada uno el suyo, todos decorativos */}
      {pitch && (
        <>
          {/* Banda blanca y dorada: el blanco del Madrid rematado en oro. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1.5"
            style={{
              background:
                'linear-gradient(90deg, rgba(255,255,255,0.9), #febe10 45%, #febe10 55%, rgba(255,255,255,0.9))',
            }}
          />
          {/* Círculo central del campo. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-10 h-40 w-40 rounded-full border-2 chalk opacity-40"
          />
        </>
      )}

      {ornament === 'gold' && (
        <span
          aria-hidden
          className="absolute inset-x-6 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, #d4af37 30%, #f4e2a1 50%, #d4af37 70%, transparent)',
          }}
        />
      )}

      {ornament === 'steel' && (
        <span aria-hidden className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-accent" />
      )}

      {(ornament === 'warm' || ornament === 'rose') && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-tint-halo blur-2xl"
        />
      )}

      <div className="relative flex items-start gap-3">
        {/* Dorsal: sólo en el campo, y con el aro dorado del escudo. */}
        {pitch && profile.squad && (
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 font-display text-lg
                       t-1 surf-2"
            style={{ borderColor: '#febe10' }}
          >
            {profile.squad}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p
            className={`text-[11px] font-semibold uppercase t-3
              ${ornament === 'steel' ? 'tracking-[0.3em]' : 'tracking-[0.18em]'}`}
          >
            Semana del {formatShort(from)} al {formatShort(to)}
          </p>

          <h2
            className={`mt-0.5 text-xl font-bold t-1 sm:text-2xl
              ${pitch ? 'font-display uppercase tracking-wide' : 'font-display'}`}
          >
            <span aria-hidden>{icon}</span> {title}
          </h2>

          <p className="mt-1 text-sm leading-relaxed t-2">{kicker}</p>

          <p
            className={`mt-2 text-xs t-3
              ${pitch ? 'font-display uppercase tracking-wide' : 'italic'}`}
          >
            {quote}
          </p>
        </div>

        {pitch && (
          <span className="chip-soft hidden shrink-0 text-[10px] uppercase sm:inline-flex">
            ⚪ Hala Madrid
          </span>
        )}
      </div>
    </header>
  );
}

