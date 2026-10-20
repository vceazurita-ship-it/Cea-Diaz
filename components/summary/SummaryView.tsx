'use client';

import { useMemo } from 'react';
import { oneOf, useRemembered } from '@/hooks/useRemembered';
import { AchievementsPanel } from '@/components/summary/AchievementsPanel';
import { MonthHeatmap } from '@/components/summary/MonthHeatmap';
import { ParteSemana } from '@/components/summary/ParteSemana';
import { PlanAdherence } from '@/components/summary/PlanAdherence';
import { SectionHead } from '@/components/summary/SectionHead';
import { WeekChart } from '@/components/summary/WeekChart';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Stars } from '@/components/ui/Stars';
import {
  addDays,
  addMonths,
  capitalize,
  formatMonth,
  formatShort,
  isFuture,
  isToday,
  monthKeys,
  startOfWeek,
  todayKey,
  WEEKDAY_LABELS,
  weekdayIndex,
  weekKeys,
} from '@/lib/dates';
import { DAY_SHORT } from '@/lib/planner';
import { computeAchievements, percent, summarizePeriod } from '@/lib/scoring';
import type { DateKey, DayEntry, DayScore, Profile, ProfileSkin, SummaryRange } from '@/types';

const SUMMARY_RANGES: readonly SummaryRange[] = ['week', 'month'];

interface SummaryViewProps {
  profile: Profile;
  date: DateKey;
  entries: Record<string, DayEntry>;
  skin: ProfileSkin;
  onSelectDay: (date: DateKey) => void;
  /**
   * Mueve el día visible sin salir de aquí. Es lo que permite repasar la
   * semana pasada o el mes anterior: antes había que volver al registro y
   * retroceder día a día hasta caer en el periodo que se quería mirar.
   */
  onDateChange: (date: DateKey) => void;
  /**
   * Lleva a la agenda. El análisis dice qué se está cayendo; arreglarlo es
   * mover un rato de sitio, y eso se hace allí.
   */
  onOpenPlan?: () => void;
  /**
   * Lleva a la casilla de un hábito en el registro de hoy. Lo usa el parte
   * de la semana para su foco; sin él, el botón abre el día sin más.
   */
  onFocusMetric?: (metricId: string) => void;
}

/* =========================================================================
 *  Los resúmenes, con el mismo criterio que la portada.
 *
 *  Arriba, en una sola tarjeta, todo lo que se quiere saber de un vistazo:
 *  el anillo de la media, una frase que la juzga, si se va mejor o peor que
 *  el periodo anterior, cuatro cifras (días, racha, estrellas y el mejor
 *  día) y la gráfica de los días. Antes eso eran tres tarjetas y cuatro
 *  fichas sueltas, con la racha y las estrellas dichas dos veces.
 *
 *  Sin registros, un único aviso con la acción que toca —apuntar hoy, o
 *  volver al periodo en curso— en lugar de una gráfica sin barras y una
 *  caja enorme pidiendo que se registre algo.
 * ========================================================================= */

/**
 * Una diferencia con signo y sin unidad, para debajo de una cifra: «+2»,
 * «−1», «=». El menos es el tipográfico (U+2212), que mide lo mismo que el
 * más y no se confunde con un guion.
 */
function signedShort(delta: number): string {
  if (delta === 0) return '=';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
}

/** Verde si se sube, rojo si se baja, apagado si se queda igual. */
function toneOf(delta: number): string {
  return delta === 0 ? 't-3' : delta > 0 ? 't-accent' : 't-danger';
}

/** Una frase que juzga la media, para que el anillo no sea un número suelto. */
function verdict(average: number): string {
  if (average >= 0.85) return 'Va de lujo';
  if (average >= 0.65) return 'Buen ritmo';
  if (average >= 0.4) return 'A medio gas';
  return 'Cuesta arrancar';
}

/** Una cifra de la tira del resumen, con su diferencia debajo si la hay. */
function Stat({
  label,
  value,
  sub,
  delta,
  deltaLabel,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: number | null;
  /** Cómo se lee la diferencia en voz alta: «2 días más que…». */
  deltaLabel?: string;
}) {
  return (
    <div className="min-w-0 px-1.5 text-center">
      <dt className="truncate text-[10px] font-bold uppercase tracking-wider t-3">{label}</dt>
      <dd className="mt-0.5 truncate text-[17px] font-black leading-tight tabular-nums t-1">
        {value}
      </dd>
      {(sub || (delta !== undefined && delta !== null)) && (
        <dd className="truncate text-[11px] tabular-nums t-3">
          {sub}
          {delta !== undefined && delta !== null && (
            <span className={`font-bold ${toneOf(delta)}`}>
              {sub ? ' ' : ''}
              <span aria-hidden>{signedShort(delta)}</span>
              {deltaLabel && (
                <span className="sr-only">
                  {` (${delta === 0 ? 'igual' : `${delta > 0 ? 'más' : 'menos'} ${Math.abs(delta)}`} ${deltaLabel})`}
                </span>
              )}
            </span>
          )}
        </dd>
      )}
    </div>
  );
}

export function SummaryView({
  profile,
  date,
  entries,
  skin,
  onSelectDay,
  onDateChange,
  onOpenPlan,
  onFocusMetric,
}: SummaryViewProps) {
  /** Semana o mes: se recuerda en este aparato y por perfil. */
  const [range, setRange] = useRemembered<SummaryRange>(
    `resumen:${profile.id}:periodo`,
    'week',
    oneOf(SUMMARY_RANGES),
  );
  const kid = profile.kind === 'kid';
  const card = kid ? 'card-kid' : 'card';
  const today = todayKey();

  const dates = useMemo(
    () => (range === 'week' ? weekKeys(date) : monthKeys(date)),
    [range, date],
  );

  const summary = useMemo(
    () => summarizePeriod(profile.id, dates, entries),
    [profile.id, dates, entries],
  );

  /** ¿Cae ese día dentro del periodo que se está viviendo ahora mismo? */
  const isCurrentPeriod = (key: DateKey) =>
    range === 'week'
      ? startOfWeek(key) === startOfWeek(today)
      : key.slice(0, 7) === today.slice(0, 7);

  const atCurrent = isCurrentPeriod(date);

  /**
   * Cuántos días lleva el periodo en curso, hoy incluido; `null` mirando uno
   * ya cerrado.
   */
  const elapsed = atCurrent
    ? range === 'week'
      ? weekKeys(today).indexOf(today) + 1
      : Number(today.slice(8, 10))
    : null;

  // El periodo de antes, para decir si se va mejor o peor. Si no tiene ni
  // un día registrado no hay con qué comparar y el resumen lo dice así.
  //
  // Con el periodo en curso se compara contra el mismo trozo del anterior:
  // un miércoles lleva tres días, y ponerlo contra la semana pasada entera
  // salía siempre en negativo —«−4 días registrados»— sin que fuera verdad.
  const previous = useMemo(() => {
    const keys = range === 'week' ? weekKeys(addDays(date, -7)) : monthKeys(addMonths(date, -1));
    const prev = summarizePeriod(
      profile.id,
      elapsed === null ? keys : keys.slice(0, elapsed),
      entries,
    );
    return prev.trackedDays > 0 ? prev : null;
  }, [profile.id, range, date, entries, elapsed]);

  // Los logros se calculan sobre el mes completo, sea cual sea la vista.
  const monthSummary = useMemo(
    () => summarizePeriod(profile.id, monthKeys(date), entries),
    [profile.id, date, entries],
  );

  const achievements = useMemo(() => computeAchievements(monthSummary), [monthSummary]);
  const unlocked = achievements.filter((a) => a.unlocked).length;

  /** El día que mejor salió del periodo; con empate, el más reciente. */
  const bestDay = useMemo(
    () =>
      summary.days.reduce<DayScore | null>(
        (best, day) => (!day.empty && (!best || day.ratio >= best.ratio) ? day : best),
        null,
      ),
    [summary.days],
  );

  const periodLabel =
    range === 'week'
      ? `${formatShort(summary.from)} – ${formatShort(summary.to)}`
      : capitalize(formatMonth(date));

  const empty = summary.trackedDays === 0;
  const previousLabel = range === 'week' ? 'la semana anterior' : 'el mes anterior';
  /** «la semana anterior» o, con el periodo a medias, «a estas alturas de…». */
  const comparedTo =
    elapsed === null
      ? previousLabel
      : `a estas alturas de ${range === 'week' ? 'la semana anterior' : 'el mes anterior'}`;
  /** El rótulo pequeño encima del titular. */
  const kicker = atCurrent ? (range === 'week' ? 'Esta semana' : 'Este mes') : periodLabel;

  /** Diferencia con el periodo anterior, o nada si no hay con qué comparar. */
  const delta = (pick: (s: typeof summary) => number): number | null =>
    previous ? Math.round(pick(summary) - pick(previous)) : null;

  const mediaDelta = delta((s) => s.average * 100);

  /**
   * Un periodo atrás o adelante. Al volver al periodo en curso se cae en hoy
   * y no en su lunes o en su día 1: es lo que espera quien pulsa «→» hasta
   * el final, y además deja el registro abierto por el día que toca.
   */
  const shift = (amount: number) => {
    if (amount > 0 && atCurrent) return;
    const next = range === 'week' ? addDays(date, 7 * amount) : addMonths(date, amount);
    onDateChange(isCurrentPeriod(next) ? today : next);
  };

  /**
   * Hasta dónde llega el parte: hoy en el periodo en curso, y el último día
   * del periodo mirado si se ha viajado atrás. Así el parte acompaña al
   * conmutador sin tener uno propio.
   */
  const parteHasta = atCurrent ? today : dates[dates.length - 1];

  return (
    <div className="space-y-4">
      {/* El parte de la semana: lo que sube, lo que cae y una sola cosa que
          hacer. Va arriba porque es lo que se viene a buscar aquí. */}
      <ParteSemana
        profile={profile}
        entries={entries}
        hasta={parteHasta}
        skin={skin}
        kid={kid}
        onApuntar={() => onSelectDay(today)}
        onFocusMetric={onFocusMetric}
        onOpenPlan={onOpenPlan}
      />

      {/* Conmutador de periodo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="btn-ghost h-10 w-10 shrink-0 p-0 text-lg"
            aria-label={range === 'week' ? 'Semana anterior' : 'Mes anterior'}
          >
            ←
          </button>
          <p className="min-w-0 truncate text-sm font-semibold t-2" aria-live="polite">
            {periodLabel}
          </p>
          <button
            type="button"
            onClick={() => shift(1)}
            disabled={atCurrent}
            className="btn-ghost h-10 w-10 shrink-0 p-0 text-lg"
            aria-label={range === 'week' ? 'Semana siguiente' : 'Mes siguiente'}
          >
            →
          </button>
          {/* Sólo aparece cuando se ha viajado: en el periodo de siempre
              sería un botón que no hace nada. */}
          {!atCurrent && (
            <button
              type="button"
              onClick={() => onDateChange(today)}
              className="btn-ghost h-10 shrink-0 px-3 text-xs"
            >
              {range === 'week' ? 'Esta semana' : 'Este mes'}
            </button>
          )}
        </div>

        <div className="flex rounded-xl border hairline surf-1 p-0.5" role="group" aria-label="Periodo">
          {(['week', 'month'] as SummaryRange[]).map((option) => {
            const active = range === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setRange(option)}
                aria-pressed={active}
                className={`tap-area min-h-[2.25rem] rounded-lg px-4 text-xs font-bold transition-colors
                  ${active ? 'bg-accent t-on-accent' : 't-2 hover-soft hover:t-1'}`}
              >
                {option === 'week' ? 'Semana' : 'Mes'}
              </button>
            );
          })}
        </div>
      </div>

      {empty ? (
        /* Sin registros: un solo aviso, y la acción que toca. */
        <section className={`${card} p-4`} aria-labelledby="resumen-titulo">
          <div className="flex items-center gap-4">
            <ProgressRing ratio={0} size={64} stroke={6}>
              <span className="text-xl" aria-hidden>
                {atCurrent ? '✏️' : '💤'}
              </span>
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] t-3">{kicker}</p>
              <h2 id="resumen-titulo" className="font-display text-lg font-black leading-tight t-1">
                {atCurrent ? 'Aún no hay nada apuntado' : 'Se quedó sin apuntar'}
              </h2>
              <p className="mt-1 text-[13px] leading-snug t-2">
                {atCurrent
                  ? 'En cuanto apuntes un día saldrán aquí la media, la racha y el mejor día.'
                  : 'Ningún día de este periodo tiene registro.'}
                {previous && (
                  <>
                    {' '}
                    {capitalize(comparedTo)} ibas al{' '}
                    <strong className="tabular-nums t-1">{percent(previous.average)}</strong>.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {atCurrent ? (
              <button type="button" onClick={() => onSelectDay(today)} className="btn-primary px-4 py-2 text-sm">
                ✏️ Apuntar hoy
              </button>
            ) : (
              <button type="button" onClick={() => onDateChange(today)} className="btn-primary px-4 py-2 text-sm">
                {range === 'week' ? 'Ir a esta semana' : 'Ir a este mes'}
              </button>
            )}
          </div>

          {/* ¿Se olvidó un día de la semana? Se abre desde aquí mismo, como
              se abría tocando la barra de la gráfica. */}
          {range === 'week' && (
            <div className="mt-3 border-t pt-3 hairline">
              <p className="mb-2 text-[11px] t-3">O abre otro día de la semana:</p>
              <div className="grid grid-cols-7 gap-1.5">
                {summary.days.map((day) => {
                  const future = isFuture(day.date);
                  const hoy = isToday(day.date);
                  return (
                    <button
                      key={day.date}
                      type="button"
                      disabled={future}
                      onClick={() => onSelectDay(day.date)}
                      aria-label={`${formatShort(day.date)}${hoy ? ', hoy' : ''}${future ? ', todavía no ha llegado' : ', sin registro'}`}
                      className={`tap-area h-9 rounded-lg border text-[11px] font-bold uppercase transition-colors
                        ${hoy ? 'border-accent t-accent' : 'hairline t-2'}
                        ${future ? 'cursor-not-allowed opacity-40' : 'surf-1 hover-soft'}`}
                    >
                      {WEEKDAY_LABELS[weekdayIndex(day.date)]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      ) : (
        /* El resumen de un vistazo: anillo, juicio, tendencia, cifras y días. */
        <section className={`${card} p-4`} aria-labelledby="resumen-titulo">
          <div className="flex items-center gap-4">
            <ProgressRing ratio={summary.average} size={kid ? 100 : 88} stroke={8}>
              <span className="text-[22px] font-black tabular-nums t-1">
                {Math.round(summary.average * 100)}
                <span className="text-xs">%</span>
              </span>
              <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider t-3">media</span>
            </ProgressRing>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] t-3">{kicker}</p>
              <h2 id="resumen-titulo" className="font-display text-xl font-black leading-tight t-1">
                {verdict(summary.average)}
              </h2>
              {/* La tendencia: lo único que no dice el anillo. */}
              <p className="mt-1 text-[12px] leading-snug t-2">
                {mediaDelta === null ? (
                  <>Sin registros {elapsed === null ? 'en' : 'a estas alturas de'} {previousLabel} para comparar.</>
                ) : mediaDelta === 0 ? (
                  <>
                    <strong className="t-1">Igual</strong> que {comparedTo}.
                  </>
                ) : (
                  <>
                    <strong className={toneOf(mediaDelta)}>
                      <span aria-hidden>{mediaDelta > 0 ? '▲' : '▼'} </span>
                      {Math.abs(mediaDelta)} {Math.abs(mediaDelta) === 1 ? 'punto' : 'puntos'}
                    </strong>{' '}
                    {mediaDelta > 0 ? 'más' : 'menos'} que {comparedTo}.
                  </>
                )}
              </p>
              {kid && (
                <div className="mt-1.5">
                  <Stars value={Math.round(summary.average * 5)} size="md" animate />
                </div>
              )}
            </div>
          </div>

          {/* Las cuatro cifras, cada una con su diferencia debajo. */}
          <dl className="mt-4 grid grid-cols-4 divide-x divide-[var(--border)] rounded-xl border py-2 hairline surf-1">
            <Stat
              label="Días"
              value={
                <>
                  {summary.trackedDays}
                  <span className="text-[11px] font-bold t-3">/{summary.days.length}</span>
                </>
              }
              delta={delta((s) => s.trackedDays)}
              deltaLabel={`días registrados respecto a ${comparedTo}`}
            />
            <Stat
              label="Racha"
              value={<>🔥{summary.streak}</>}
              sub={`mejor ${summary.bestStreak}`}
              delta={delta((s) => s.bestStreak)}
              deltaLabel={`en la mejor racha respecto a ${comparedTo}`}
            />
            <Stat
              label="Estrellas"
              value={<>⭐{summary.totalStars}</>}
              delta={delta((s) => s.totalStars)}
              deltaLabel={`estrellas respecto a ${comparedTo}`}
            />
            <Stat
              label="Mejor día"
              value={
                bestDay
                  ? range === 'week'
                    ? DAY_SHORT[weekdayIndex(bestDay.date)]
                    : Number(bestDay.date.slice(-2))
                  : '—'
              }
              sub={bestDay ? percent(bestDay.ratio) : undefined}
            />
          </dl>
          {previous && (
            <p className="mt-1.5 text-center text-[10px] t-3">
              Las cifras pequeñas, contra {comparedTo}.
            </p>
          )}

          <div className="mt-4">
            {range === 'week' ? (
              <WeekChart days={summary.days} onSelectDay={onSelectDay} />
            ) : (
              <MonthHeatmap days={summary.days} onSelectDay={onSelectDay} />
            )}
            <p className="mt-2 text-center text-[11px] t-3">Toca un día para abrir su registro.</p>
          </div>
        </section>
      )}

      {/* Por categoría, en anillos: cuatro de un vistazo en lugar de una
          barra larga por fila. Con el periodo vacío no hay nada que
          desglosar, y ya lo dice el aviso de arriba. */}
      {!empty && summary.perCategory.length > 0 && (
        <section className={`${card} p-4`} aria-labelledby="resumen-categorias">
          <SectionHead id="resumen-categorias" title="Por categoría" skin={skin} />
          <ul
            className={`grid gap-x-2 gap-y-3 ${
              summary.perCategory.length <= 4 ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-6'
            }`}
          >
            {summary.perCategory.map((category) => (
              <li key={category.categoryId} className="flex min-w-0 flex-col items-center gap-1.5">
                <ProgressRing ratio={category.ratio} size={kid ? 64 : 58} stroke={6}>
                  <span className="text-[13px] font-black tabular-nums t-1">
                    {Math.round(category.ratio * 100)}
                    <span className="text-[9px]">%</span>
                  </span>
                </ProgressRing>
                <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight t-2">
                  <span aria-hidden>{category.icon} </span>
                  {category.label}
                  <span className="sr-only">: {percent(category.ratio)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* La agenda contra lo vivido. Va justo detrás del desglose porque es
          la misma pregunta desde el otro lado: no «cuánto cumplí», sino «de
          lo que había apartado, cuánto llegó a pasar». */}
      <PlanAdherence
        profile={profile}
        dates={dates}
        entries={entries}
        range={range}
        skin={skin}
        kid={kid}
        isCurrent={atCurrent}
        periodLabel={periodLabel}
        onOpenPlan={onOpenPlan}
      />

      {/* Logros */}
      <section className={`${card} p-4`} aria-labelledby="resumen-logros">
        <SectionHead
          id="resumen-logros"
          title="Logros del mes"
          meta={`${unlocked}/${achievements.length}`}
          skin={skin}
        />
        <AchievementsPanel achievements={achievements} playful={kid} />
      </section>
    </div>
  );
}
