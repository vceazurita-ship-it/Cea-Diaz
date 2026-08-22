'use client';

import { useMemo, useState } from 'react';
import { AchievementsPanel } from '@/components/summary/AchievementsPanel';
import { MonthHeatmap } from '@/components/summary/MonthHeatmap';
import { WeekChart } from '@/components/summary/WeekChart';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Stars } from '@/components/ui/Stars';
import { capitalize, formatMonth, formatShort, monthKeys, weekKeys } from '@/lib/dates';
import { computeAchievements, percent, summarizePeriod } from '@/lib/scoring';
import type { DateKey, DayEntry, Profile, ProfileSkin, SummaryRange } from '@/types';

interface SummaryViewProps {
  profile: Profile;
  date: DateKey;
  entries: Record<string, DayEntry>;
  skin: ProfileSkin;
  onSelectDay: (date: DateKey) => void;
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide t-3">{label}</p>
      <p className="mt-0.5 text-2xl font-black tabular-nums t-accent">{value}</p>
      {hint && <p className="text-[11px] t-3">{hint}</p>}
    </div>
  );
}

export function SummaryView({ profile, date, entries, skin, onSelectDay }: SummaryViewProps) {
  const [range, setRange] = useState<SummaryRange>('week');
  const kid = profile.kind === 'kid';
  // En la piel de fútbol los rótulos van con la tipografía de marcador.
  const headingClass = `mb-3 text-sm font-bold uppercase tracking-wide t-2${
    skin === 'pitch' ? ' font-display tracking-[0.14em]' : ''
  }`;

  const dates = useMemo(
    () => (range === 'week' ? weekKeys(date) : monthKeys(date)),
    [range, date],
  );

  const summary = useMemo(
    () => summarizePeriod(profile.id, dates, entries),
    [profile.id, dates, entries],
  );

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

  return (
    <div className="space-y-4">
      {/* Conmutador de periodo */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold t-2">{periodLabel}</p>
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

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Media" value={percent(summary.average)} hint="días con registro" />
        <StatTile
          label="Constancia"
          value={`${summary.trackedDays}/${summary.days.length}`}
          hint="días registrados"
        />
        <StatTile label="Racha" value={`${summary.streak}`} hint="días seguidos" />
        <StatTile label="Estrellas" value={`${summary.totalStars}`} hint="en el periodo" />
      </div>

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
        <p className="mt-2 text-center text-[11px] t-3">
          Toca cualquier día para abrir su registro.
        </p>
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

      {/* Logros */}
      <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
        <h3 className={headingClass}>Logros del mes</h3>
        <AchievementsPanel achievements={achievements} playful={kid} />
      </div>
    </div>
  );
}
