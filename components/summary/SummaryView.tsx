'use client';

import { kickerFont } from '@/lib/profiles';
import { useMemo, useState } from 'react';
import { AchievementsPanel } from '@/components/summary/AchievementsPanel';
import { MonthHeatmap } from '@/components/summary/MonthHeatmap';
import { PlanAdherence } from '@/components/summary/PlanAdherence';
import { WeekChart } from '@/components/summary/WeekChart';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Stars } from '@/components/ui/Stars';
import {
  addDays,
  addMonths,
  capitalize,
  formatMonth,
  formatShort,
  monthKeys,
  startOfWeek,
  todayKey,
  weekKeys,
} from '@/lib/dates';
import { computeAchievements, percent, summarizePeriod } from '@/lib/scoring';
import type { DateKey, DayEntry, Profile, ProfileSkin, SummaryRange } from '@/types';

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
}

/**
 * Una diferencia con signo, dicha como se dice: «+6 pts», «−2 días», «Igual».
 * El menos es el tipográfico (U+2212), que mide lo mismo que el más y no se
 * confunde con un guion.
 */
function signed(delta: number, unit: string, singular = unit): string {
  if (delta === 0) return 'Igual';
  const n = Math.abs(delta);
  return `${delta > 0 ? '+' : '−'}${n} ${n === 1 ? singular : unit}`;
}

/**
 * Comparación con el periodo anterior. Las cifras absolutas —media, racha,
 * estrellas— ya las dice la tarjeta del anillo; repetirlas aquí era leer lo
 * mismo dos veces. Lo que no decía nadie es si se va mejor o peor que la
 * semana o el mes de antes, y para eso sirven estas fichas.
 */
function DeltaTile({
  label,
  delta,
  unit,
  singular,
}: {
  label: string;
  delta: number | null;
  unit: string;
  singular?: string;
}) {
  const tone = delta === null || delta === 0 ? 't-3' : delta > 0 ? 't-accent' : 't-danger';
  return (
    <div className="card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide t-3">{label}</p>
      <p className={`mt-0.5 text-2xl font-black tabular-nums ${tone}`}>
        {delta === null ? '—' : signed(delta, unit, singular)}
      </p>
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
}: SummaryViewProps) {
  const [range, setRange] = useState<SummaryRange>('week');
  const kid = profile.kind === 'kid';
  const today = todayKey();
  // Cada piel rotula lo suyo: marcador de estadio en el campo, serif de
  // cuento en el de María.
  const headingClass = `mb-3 text-sm font-bold uppercase tracking-wide t-2${kickerFont(skin)}`;

  const dates = useMemo(
    () => (range === 'week' ? weekKeys(date) : monthKeys(date)),
    [range, date],
  );

  const summary = useMemo(
    () => summarizePeriod(profile.id, dates, entries),
    [profile.id, dates, entries],
  );

  // El periodo de antes, para decir si se va mejor o peor. Si no tiene ni
  // un día registrado no hay con qué comparar y las fichas lo dicen así.
  const previous = useMemo(() => {
    const keys = range === 'week' ? weekKeys(addDays(date, -7)) : monthKeys(addMonths(date, -1));
    const prev = summarizePeriod(profile.id, keys, entries);
    return prev.trackedDays > 0 ? prev : null;
  }, [profile.id, range, date, entries]);

  // Los logros se calculan sobre el mes completo, sea cual sea la vista.
  const monthSummary = useMemo(
    () => summarizePeriod(profile.id, monthKeys(date), entries),
    [profile.id, date, entries],
  );

  const achievements = useMemo(() => computeAchievements(monthSummary), [monthSummary]);

  const periodLabel =
    range === 'week'
      ? `${formatShort(summary.from)} – ${formatShort(summary.to)}`
      : capitalize(formatMonth(date));

  const empty = summary.trackedDays === 0;
  const previousLabel = range === 'week' ? 'la semana anterior' : 'el mes anterior';

  /** Diferencia con el periodo anterior, o nada si no hay con qué comparar. */
  const delta = (pick: (s: typeof summary) => number): number | null =>
    previous ? Math.round(pick(summary) - pick(previous)) : null;

  /** ¿Cae ese día dentro del periodo que se está viviendo ahora mismo? */
  const isCurrentPeriod = (key: DateKey) =>
    range === 'week'
      ? startOfWeek(key) === startOfWeek(today)
      : key.slice(0, 7) === today.slice(0, 7);

  const atCurrent = isCurrentPeriod(date);

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

  return (
    <div className="space-y-4">
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
                className={`min-h-[2.25rem] rounded-lg px-4 text-xs font-bold transition-colors
                  ${active ? 'bg-accent t-on-accent' : 't-2 hover-soft hover:t-1'}`}
              >
                {option === 'week' ? 'Semana' : 'Mes'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cabecera de cumplimiento */}
      <div className={`${kid ? 'card-kid' : 'card'} flex flex-wrap items-center gap-5 p-5`}>
        <ProgressRing ratio={summary.average} size={kid ? 116 : 96}>
          <span className="text-2xl font-black tabular-nums t-1">
            {Math.round(summary.average * 100)}
            <span className="text-sm">%</span>
          </span>
          <span className="text-[10px] uppercase tracking-wide t-3">media</span>
        </ProgressRing>

        <div className="min-w-[180px] flex-1 space-y-2">
          {kid && <Stars value={Math.round(summary.average * 5)} size="lg" animate />}
          <p className="text-sm t-2">
            {empty
              ? 'Todavía no hay registros en este periodo.'
              : `${summary.trackedDays} ${
                  summary.trackedDays === 1 ? 'día registrado' : 'días registrados'
                } de ${summary.days.length}.`}
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="chip-soft">🔥 Racha actual: {summary.streak}</span>
            <span className="chip-soft">🏅 Mejor racha: {summary.bestStreak}</span>
            <span className="chip-soft">⭐ {summary.totalStars} estrellas</span>
          </div>
        </div>
      </div>

      {/* Contra el periodo anterior. Con el actual vacío no se enseña: todo
          saldría en negativo y no sería verdad, sólo que aún no se ha
          empezado. */}
      {!empty && (
        <section aria-label={`Comparación con ${previousLabel}`}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide t-3">
            {previous ? `Respecto a ${previousLabel}` : `Sin registros en ${previousLabel}`}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DeltaTile label="Media" delta={delta((s) => s.average * 100)} unit="pts" />
            <DeltaTile
              label="Días registrados"
              delta={delta((s) => s.trackedDays)}
              unit="días"
              singular="día"
            />
            <DeltaTile
              label="Mejor racha"
              delta={delta((s) => s.bestStreak)}
              unit="días"
              singular="día"
            />
            <DeltaTile label="Estrellas" delta={delta((s) => s.totalStars)} unit="⭐" />
          </div>
        </section>
      )}

      {/* Evolución */}
      <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
        <h3 className={headingClass}>
          {range === 'week' ? 'Evolución de la semana' : 'Mapa del mes'}
        </h3>
        {range === 'week' ? (
          <WeekChart days={summary.days} onSelectDay={onSelectDay} />
        ) : (
          <MonthHeatmap days={summary.days} onSelectDay={onSelectDay} />
        )}
        {/* Con el periodo vacío no hay registro que abrir: la pista sobra. */}
        {!empty && (
          <p className="mt-2 text-center text-[11px] t-3">
            Toca cualquier día para abrir su registro.
          </p>
        )}
      </div>

      {/* Desglose por categoría */}
      <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
        <h3 className={headingClass}>Cumplimiento por categoría</h3>
        {empty ? (
          <p className="py-6 text-center text-sm t-3">
            Registra algún día para ver el desglose por categoría.
          </p>
        ) : (
          <div className="space-y-3">
            {summary.perCategory.map((category) => (
              <div key={category.categoryId} className="flex items-center gap-3">
                <span className="w-7 shrink-0 text-center text-lg" aria-hidden>
                  {category.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm t-2">{category.label}</span>
                    <span className="shrink-0 text-xs font-bold tabular-nums t-1">
                      {percent(category.ratio)}
                    </span>
                  </div>
                  <ProgressBar
                    ratio={category.ratio}
                    chunky={kid}
                    ariaLabel={`${category.label}: ${percent(category.ratio)}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
        headingClass={headingClass}
        onOpenPlan={onOpenPlan}
      />

      {/* Logros */}
      <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
        <h3 className={headingClass}>Logros del mes</h3>
        <AchievementsPanel achievements={achievements} playful={kid} />
      </div>
    </div>
  );
}
