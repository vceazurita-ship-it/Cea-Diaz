'use client';

import { useMemo, useState } from 'react';

import { BlockEditor } from '@/components/planner/BlockEditor';
import { CopyWeekPicker } from '@/components/planner/CopyWeekPicker';
import { PlanAlerts } from '@/components/planner/PlanAlerts';
import { WeekTimetable } from '@/components/planner/WeekTimetable';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { HabitStore } from '@/hooks/useHabitStore';
import { useWeekPlan } from '@/hooks/useWeekPlan';
import { formatShort, weekKeys, weekdayIndex } from '@/lib/dates';
import { companionShare, reviewWeek, statusIcon, statusLabel, statusShort } from '@/lib/planCheck';
import {
  COMPANIONS,
  DAY_NAMES,
  DAY_SHORT,
  PLAN_KINDS,
  blocksOfDay,
  clearDayPlan,
  copyDayPlan,
  copyWeekFrom,
  copyableWeeks,
  daysFilled,
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
import type { WeekSource } from '@/lib/planner';
import { PROFILES } from '@/lib/profiles';
import type { DateKey, PlanBlock, PlanStatus, Profile, ProfileId, ProfileSkin } from '@/types';

/* =========================================================================
 *  Agenda semanal del perfil.
 *
 *  Esto no es un calendario: es la semana tipo. Se define una vez —de lunes
 *  a domingo, sin fechas— y vale para todas las semanas que vengan, hasta
 *  que se cambie. Por eso la pantalla enseña de primeras la semana entera,
 *  en un horario, y sólo cuando hay que tocarla se pasa a las tarjetas de
 *  día, que es donde se aparta, se copia y se vacía.
 *
 *  Las fechas vienen después: cada rato puede ir atado a un hábito del
 *  registro, y entonces al lado de lo planificado se dice si esta semana se
 *  cumplió, si se quedó corto o si se pasó del máximo. La semana tipo se
 *  queda igual; lo que cambia es lo que se le contrasta.
 *
 *  Lo que cambia de un perfil a otro es el rótulo y el adorno —el campo y
 *  Oliver y Benji para los peques, el filete dorado para María, el acero
 *  para Víctor—, nunca la mecánica: es la misma cuadrícula para los seis.
 * ========================================================================= */

/** Las dos maneras de mirar la misma semana. */
type PlanView = 'completa' | 'dias';

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
  /** Día visible en el panel; de él sale la semana real que se contrasta. */
  date: DateKey;
  store: HabitStore;
  skin: ProfileSkin;
}

export function WeekPlanner({ profile, date, store, skin }: WeekPlannerProps) {
  const plan = useWeekPlan(profile.id);
  const notify = useToast();
  const [editing, setEditing] = useState<{ block: PlanBlock; isNew: boolean } | null>(null);
  const [view, setView] = useState<PlanView>('completa');
  /** Semanas ajenas ofrecidas para copiar, o `null` con el diálogo cerrado. */
  const [copying, setCopying] = useState<WeekSource[] | null>(null);

  const kid = profile.kind === 'kid';
  const theme = themeOf(profile.id);
  const dates = useMemo(() => weekKeys(date), [date]);
  const today = weekdayIndex(date);

  const review = useMemo(
    () => reviewWeek(profile, plan, dates, store.entries),
    [profile, plan, dates, store.entries],
  );

  /** Desenlace por rato, para pintarlo en su casilla sin recalcular nada. */
  const checkById = useMemo(
    () => new Map(review.checks.map((check) => [check.block.id, check])),
    [review],
  );

  /** Lo mismo, reducido a la marca, que es lo que cabe en el horario. */
  const statusById = useMemo(
    () => new Map(review.checks.map((check) => [check.block.id, check.status])),
    [review],
  );

  const share = useMemo(() => (kid ? companionShare(plan) : []), [kid, plan]);
  const heading = skin === 'pitch' ? 'font-display uppercase tracking-wide' : '';

  /** La frase de la semana: la misma todo el día, distinta cada día. */
  const quote = theme.quotes[today % theme.quotes.length] ?? theme.quotes[0];

  /** Sin nada apartado no hay semana que enseñar: se empieza por los días. */
  const defined = plan.blocks.length > 0;
  const shown: PlanView = defined ? view : 'dias';

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
    setView('completa');
    notify({
      message: 'Semana de ejemplo puesta. Edítala a tu gusto.',
      icon: '✨',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
  };

  /**
   * De quién copiar. Se mira al picar y no al pintar: en el servidor no hay
   * agendas, y adivinar aquí cuáles existen desajustaría la hidratación.
   */
  const openCopy = () => {
    const sources = copyableWeeks(profile.id);

    if (sources.length === 0) {
      notify({ message: 'Nadie más tiene todavía una semana que copiar.', icon: '🤷' });
      return;
    }

    setCopying(sources);
  };

  /** La semana de otro, traída entera y lista para matizarla aquí. */
  const copyWeek = (from: ProfileId) => {
    const before = planOf(profile.id).blocks;
    const { copied, unlinked } = copyWeekFrom(from, profile.id);
    const name = PROFILES.find((item) => item.id === from)?.name ?? 'otro perfil';

    setCopying(null);
    setView('completa');

    notify({
      message:
        unlinked > 0
          ? `Semana de ${name} copiada: ${copied} ratos, ${unlinked} sin hábito atado. Cámbiala a tu gusto.`
          : `Semana de ${name} copiada: ${copied} ratos. Cámbiala a tu gusto.`,
      icon: '⧉',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
  };

  const clearWeek = () => {
    const before = planOf(profile.id).blocks;
    updatePlan(profile.id, []);
    notify({
      message: 'Semana vaciada.',
      icon: '🧹',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
  };

  /* ------------------------------------------------------------- pintura */

  const kept = review.kept;
  const missed = review.missed;
  const judged = kept + missed;
  const filled = daysFilled(plan);

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
      />

      {/* Lo que la semana tipo dice de sí misma */}
      <section className="card p-3 sm:p-4" aria-label="Resumen de la semana tipo">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-bold t-1">
            {review.blocks} {review.blocks === 1 ? theme.blockWord : theme.blockWords}
          </span>
          <span className="t-3">·</span>
          <span className="t-2 tabular-nums">{filled} de 7 días con algo apartado</span>
          <span className="t-3">·</span>
          <span className="t-2">
            🔗 {review.linked} {review.linked === 1 ? 'atado' : 'atados'} a un hábito
          </span>
        </div>

        {/* Y aquí, y sólo aquí, entran las fechas: la semana tipo contra la
            semana que se está viviendo. */}
        {judged > 0 && (
          <div className="mt-3 border-t pt-3 hairline">
            <p className="text-xs t-3">
              Contra la semana del{' '}
              <strong className="tabular-nums t-2">{formatShort(dates[0])}</strong> al{' '}
              <strong className="tabular-nums t-2">{formatShort(dates[6])}</strong>: ✓ {kept}{' '}
              cumplidos · ✕ {missed} fallidos.
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full track">
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

        {/* Con quién están los peques en la semana tipo */}
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

      {/* Cómo mirarla: entera o día a día */}
      {defined && (
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex gap-1 rounded-full p-1 surf-2"
            role="tablist"
            aria-label="Cómo ver la semana"
          >
            {(
              [
                { id: 'completa', label: '🗓️ La semana entera' },
                { id: 'dias', label: '✏️ Día a día' },
              ] as Array<{ id: PlanView; label: string }>
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={shown === option.id}
                onClick={() => setView(option.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition
                  ${shown === option.id ? 'bg-accent t-on-accent' : 't-2 hover-soft'}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="text-[11px] t-3">
            {shown === 'completa'
              ? 'Pica en un rato para cambiarlo, o en un hueco para apartar uno nuevo.'
              : 'Aquí se aparta, se copia un día en otro y se vacía.'}
          </p>
        </div>
      )}

      {/* La semana tipo, entera */}
      {shown === 'completa' && (
        <section className={`${kid ? 'card-kid' : 'card'} p-3`} aria-label="La semana tipo entera">
          <WeekTimetable
            plan={plan}
            statusById={judged > 0 ? statusById : undefined}
            today={today}
            heading={heading}
            onSelect={(block) => setEditing({ block, isNew: false })}
            onAdd={(day, start) => setEditing({ block: emptyBlock(day, start), isNew: true })}
          />
        </section>
      )}

      {/* Los siete días, para tocarlos */}
      {shown === 'dias' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[0, 1, 2, 3, 4, 5, 6].map((day) => {
            const blocks = blocksOfDay(plan, day);
            const hoy = day === today;
            const dayKept = blocks.filter(
              (block) => checkById.get(block.id)?.status === 'cumplido',
            ).length;
            const dayJudged = blocks.filter((block) => {
              const status = checkById.get(block.id)?.status;
              return status && status !== 'sinMetrica' && status !== 'futuro';
            }).length;

            return (
              <article
                key={day}
                className={`${kid ? 'card-kid' : 'card'} flex flex-col p-3
                  ${hoy ? 'border-accent' : ''}`}
                aria-label={DAY_NAMES[day]}
              >
                <header className="mb-2 flex items-baseline gap-2">
                  <h3 className={`text-sm font-bold t-1 ${heading}`}>
                    <span className="xl:hidden">{DAY_NAMES[day]}</span>
                    <span className="hidden xl:inline">{DAY_SHORT[day]}</span>
                  </h3>

                  {hoy && (
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
        </div>
      )}

      {/* Lo que se puede hacer con la semana entera */}
      <section className="card flex flex-wrap items-center gap-x-2 gap-y-2 p-3">
        <p className="text-xs font-bold uppercase tracking-wide t-3">La semana entera</p>

        <button type="button" onClick={useSample} className="btn-ghost px-3 py-1.5 text-xs">
          ✨ {defined ? 'Rehacer con la de ejemplo' : 'Empezar con una de ejemplo'}
        </button>

        <button type="button" onClick={openCopy} className="btn-ghost px-3 py-1.5 text-xs">
          ⧉ Copiar la semana de otro
        </button>

        {defined && (
          <button type="button" onClick={clearWeek} className="btn-ghost px-3 py-1.5 text-xs">
            🧹 Vaciar la semana
          </button>
        )}

        <p className="w-full text-[11px] leading-relaxed t-3 sm:w-auto sm:flex-1">
          No se rehace cada lunes: se define una vez y se repite hasta que se cambie. Lo que ocurre
          un solo día va en Tareas, que tiene fecha y se tacha.
        </p>
      </section>

      {/* Qué significa cada marca. Sólo cuando hay algo marcado: en una
          semana tipo recién definida no marca nada y sobra. */}
      {judged > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] t-3">
          <span className="font-bold uppercase tracking-wide">Marcas:</span>
          {(['cumplido', 'flojo', 'excedido', 'sinRegistrar', 'futuro'] as PlanStatus[]).map(
            (status) => (
              <span key={status} className="inline-flex items-center gap-1">
                <span
                  className={`rounded-full px-1.5 text-[10px] font-bold ${STATUS_STYLE[status]}`}
                >
                  {statusIcon(status)}
                </span>
                {statusLabel(status)}
              </span>
            ),
          )}
        </div>
      )}

      {copying && (
        <Modal title="Copiar la semana de otro" onClose={() => setCopying(null)}>
          <CopyWeekPicker
            profile={profile}
            sources={copying}
            hasWeek={defined}
            onPick={copyWeek}
            onCancel={() => setCopying(null)}
          />
        </Modal>
      )}

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
 *
 * No lleva fechas: lo que se rotula es la semana que se repite, no una.
 * ------------------------------------------------------------------------- */

interface HeaderProps {
  profile: Profile;
  title: string;
  icon: string;
  kicker: string;
  ornament: 'pitch' | 'gold' | 'steel' | 'warm' | 'rose';
  quote: string;
}

function PlannerHeader({ profile, title, icon, kicker, ornament, quote }: HeaderProps) {
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
            Semana tipo · de lunes a domingo
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

