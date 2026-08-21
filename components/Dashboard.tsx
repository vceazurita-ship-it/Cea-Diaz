'use client';

import { useMemo, useState } from 'react';
import { CategoryCard } from '@/components/CategoryCard';
import { DateNavigator } from '@/components/DateNavigator';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { SummaryView } from '@/components/summary/SummaryView';
import type { HabitStore } from '@/hooks/useHabitStore';
import { weekKeys } from '@/lib/dates';
import { getCategories } from '@/lib/habits';
import { accentFor, skinOf } from '@/lib/profiles';
import { computeDayScore, summarizePeriod } from '@/lib/scoring';
import type { DashboardTab, DateKey, Profile } from '@/types';

interface DashboardProps {
  profile: Profile;
  date: DateKey;
  onDateChange: (date: DateKey) => void;
  store: HabitStore;
}

export function Dashboard({ profile, date, onDateChange, store }: DashboardProps) {
  const [tab, setTab] = useState<DashboardTab>('today');
  const kid = profile.kind === 'kid';
  const skin = skinOf(profile);
  const accent = accentFor(profile, skin);

  const categories = getCategories(profile.id);
  const entry = store.getEntry(profile.id, date);
  const values = entry?.values ?? {};

  const dayScore = useMemo(
    () => computeDayScore(profile.id, date, entry),
    [profile.id, date, entry],
  );

  // Resumen de la semana visible: alimenta la tira del navegador y la racha.
  const week = useMemo(
    () => summarizePeriod(profile.id, weekKeys(date), store.entries),
    [profile.id, date, store.entries],
  );

  const weekRatios = useMemo(
    () =>
      week.days.reduce<Record<string, number>>((acc, day) => {
        acc[day.date] = day.empty ? 0 : day.ratio;
        return acc;
      }, {}),
    [week],
  );

  const filled = dayScore.categories.reduce((sum, category) => sum + category.filled, 0);

  const handleChange = (metricId: string, value: Parameters<HabitStore['setValue']>[3]) => {
    store.setValue(profile.id, date, metricId, value);
  };

  const tabs: Array<{ id: DashboardTab; label: string; icon: string }> =
    skin === 'pitch'
      ? [
          { id: 'today', label: 'Partido de hoy', icon: '⚽' },
          { id: 'summary', label: 'Estadísticas', icon: '📊' },
        ]
      : [
          { id: 'today', label: 'Registro del día', icon: '📝' },
          { id: 'summary', label: 'Resúmenes', icon: '📊' },
        ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4">
      <ProfileHeader
        profile={profile}
        skin={skin}
        accent={accent}
        date={date}
        dayScore={dayScore}
        streak={week.streak}
        filled={filled}
      />

      {/* Pestañas */}
      <div className="mb-4 flex rounded-2xl border p-1 hairline surf-1">
        {tabs.map((option) => {
          const active = tab === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTab(option.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5
                text-sm font-bold transition-colors ${active ? '' : 't-2 hover:t-1'}
                ${skin === 'pitch' ? 'font-display uppercase tracking-wide' : ''}`}
              style={active ? { backgroundColor: accent, color: 'var(--on-accent)' } : undefined}
            >
              <span>{option.icon}</span>
              {option.label}
            </button>
          );
        })}
      </div>

      {tab === 'today' ? (
        <div className="space-y-4">
          <DateNavigator
            date={date}
            onChange={onDateChange}
            accent={accent}
            weekRatios={weekRatios}
          />

          {categories.map((category, index) => (
            <CategoryCard
              key={category.id}
              category={category}
              values={values}
              onChange={handleChange}
              variant={kid ? 'kid' : 'adult'}
              accent={accent}
              skin={skin}
              defaultOpen={kid ? index === 0 : true}
            />
          ))}

          {/* Nota del día */}
          <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
            <label
              htmlFor="nota"
              className="mb-2 block text-sm font-bold uppercase tracking-wide t-2"
            >
              📔 Nota del día
            </label>
            <textarea
              id="nota"
              rows={3}
              value={entry?.note ?? ''}
              onChange={(e) => store.setNote(profile.id, date, e.target.value)}
              placeholder={
                kid ? '¿Qué ha sido lo mejor de hoy?' : 'Observaciones, incidencias, ideas...'
              }
              className="field w-full resize-none p-3"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs t-3">
                {entry
                  ? `Guardado automáticamente · ${filled} registros`
                  : 'Aún no hay registros para este día.'}
              </p>
              {entry && (
                <button
                  type="button"
                  onClick={() => store.clearDay(profile.id, date)}
                  className="btn-ghost t-danger px-2.5 py-1.5 text-xs"
                >
                  Borrar el día
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <SummaryView
          profile={profile}
          date={date}
          entries={store.entries}
          accent={accent}
          skin={skin}
          onSelectDay={(selected) => {
            onDateChange(selected);
            setTab('today');
          }}
        />
      )}
    </div>
  );
}
