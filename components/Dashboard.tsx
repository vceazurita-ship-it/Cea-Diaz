'use client';

import { useEffect, useMemo, useState } from 'react';
import { CategoryCard } from '@/components/CategoryCard';
import { CHALLENGE_NOTE_KEY, ChallengesPanel } from '@/components/challenges/ChallengesPanel';
import { DateNavigator } from '@/components/DateNavigator';
import { AttentionCard } from '@/components/experts/AttentionCard';
import { MealPhotoCard } from '@/components/meals/MealPhotoCard';
import { DayNoteCard, PendingChallengeCard } from '@/components/notes/DayNoteCard';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { SummaryView } from '@/components/summary/SummaryView';
import { useToast } from '@/components/ui/Toast';
import type { HabitStore } from '@/hooks/useHabitStore';
import { buildChallengeWeek } from '@/lib/challenges';
import { addDays, friendlyDateLabel, isToday, todayKey, weekKeys } from '@/lib/dates';
import { getCategories } from '@/lib/habits';
import { hasFoodGoals } from '@/lib/mealPrompt';
import { skinOf } from '@/lib/profiles';
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
  const [onlyPending, setOnlyPending] = useState(false);
  const notify = useToast();

  const kid = profile.kind === 'kid';
  const skin = skinOf(profile);

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

  // Retos de la semana visible: alimenta el acceso rápido de la barra de acciones.
  const challengeWeek = useMemo(
    () => buildChallengeWeek(profile, date, store.entries),
    [profile, date, store.entries],
  );

  const filled = dayScore.categories.reduce((sum, category) => sum + category.filled, 0);
  const total = dayScore.categories.reduce((sum, category) => sum + category.total, 0);
  const pending = total - filled;

  /** Cumplimiento por categoría, para saber cuáles quedan a medias. */
  const scoreById = useMemo(
    () => new Map(dayScore.categories.map((category) => [category.categoryId, category])),
    [dayScore],
  );

  const visibleCategories = onlyPending
    ? categories.filter((category) => {
        const score = scoreById.get(category.id);
        return !score || score.filled < score.total;
      })
    : categories;

  /** Reto de progresión que quedó pendiente de una sesión anterior. */
  const pendingAdvice = store.pendingChallenge(profile.id, date);

  const completeChallenge = () => {
    if (!pendingAdvice) return;
    store.markChallengeDone(pendingAdvice.id, true);
    notify({
      message: '¡Reto conseguido!',
      icon: '🏅',
      action: {
        label: 'Deshacer',
        onClick: () => store.markChallengeDone(pendingAdvice.id, false),
      },
    });
  };

  const handleChange = (metricId: string, value: Parameters<HabitStore['setValue']>[3]) => {
    store.setValue(profile.id, date, metricId, value);
  };

  /** Notas sueltas del día: una por categoría, más la del panel de retos. */
  const notes = entry?.notes ?? {};
  const writeNote = (key: string, text: string) => {
    store.setEntryNote(profile.id, date, key, text);
  };

  /* ------------------------------------------------ atajos de teclado */

  // Flechas para cambiar de día y «H» para volver a hoy. Se ignoran mientras
  // se escribe, para no secuestrar el cursor dentro de la nota.
  useEffect(() => {
    if (tab !== 'today') return;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select') || event.metaKey || event.ctrlKey) return;

      if (event.key === 'ArrowLeft') onDateChange(addDays(date, -1));
      else if (event.key === 'ArrowRight' && date < todayKey()) onDateChange(addDays(date, 1));
      else if (event.key.toLowerCase() === 'h') onDateChange(todayKey());
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, date, onDateChange]);

  /* ------------------------------------------------------- acciones */

  const copyYesterday = () => {
    const from = addDays(date, -1);
    const before = store.snapshot();
    const copied = store.copyDay(profile.id, from, date);

    notify(
      copied > 0
        ? {
            message: `${copied} ${copied === 1 ? 'registro copiado' : 'registros copiados'} del día anterior.`,
            icon: '📋',
            action: { label: 'Deshacer', onClick: () => store.restore(before) },
          }
        : { message: 'El día anterior no tiene registros que copiar.', icon: '🤷' },
    );
  };

  const tabs: Array<{ id: DashboardTab; label: string; icon: string }> =
    skin === 'pitch'
      ? [
          { id: 'today', label: 'Partido', icon: '⚽' },
          { id: 'challenges', label: 'Retos', icon: '🎯' },
          { id: 'summary', label: 'Estadísticas', icon: '📊' },
        ]
      : [
          { id: 'today', label: 'Registro', icon: '📝' },
          { id: 'challenges', label: 'Retos', icon: '🎯' },
          { id: 'summary', label: 'Resúmenes', icon: '📊' },
        ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4">
      <ProfileHeader
        profile={profile}
        skin={skin}
        date={date}
        dayScore={dayScore}
        streak={week.streak}
        filled={filled}
      />

      {/* Pestañas */}
      <div
        className="mb-4 flex rounded-2xl border p-1 hairline surf-1"
        role="tablist"
        aria-label="Secciones del perfil"
        onKeyDown={(event) => {
          const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          if (!delta) return;
          event.preventDefault();
          const index = tabs.findIndex((option) => option.id === tab);
          setTab(tabs[(index + delta + tabs.length) % tabs.length].id);
        }}
      >
        {tabs.map((option) => {
          const active = tab === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${option.id}`}
              id={`tab-${option.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(option.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5
                text-xs font-bold transition-colors sm:gap-2 sm:px-3 sm:text-sm
                ${active ? 'bg-accent t-on-accent' : 't-2 hover-soft hover:t-1'}
                ${skin === 'pitch' ? 'font-display uppercase tracking-wide' : ''}`}
            >
              <span aria-hidden>{option.icon}</span>
              {option.label}
            </button>
          );
        })}
      </div>

      {tab === 'today' ? (
        <div className="space-y-4" role="tabpanel" id="panel-today" aria-labelledby="tab-today">
          <DateNavigator
            date={date}
            onChange={onDateChange}
            weekRatios={weekRatios}
          />

          {/* Barra de acciones del día */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyYesterday}
              className="btn-ghost px-3 py-1.5 text-xs"
              title={`Traer lo registrado el ${friendlyDateLabel(addDays(date, -1)).toLowerCase()}`}
            >
              📋 Copiar del día anterior
            </button>

            <button
              type="button"
              onClick={() => setOnlyPending((v) => !v)}
              aria-pressed={onlyPending}
              className={`btn px-3 py-1.5 text-xs font-semibold border
                ${onlyPending ? 'bg-accent-soft border-accent t-1' : 'hairline surf-1 t-2 hover-soft'}`}
            >
              {onlyPending ? '👁️ Viendo pendientes' : '🔎 Sólo pendientes'}
            </button>

            <button
              type="button"
              onClick={() => setTab('challenges')}
              className="btn-ghost px-3 py-1.5 text-xs"
              title="Ver los retos de esta semana"
            >
              🎯 Retos {challengeWeek.done}/{challengeWeek.challenges.length}
            </button>

            <span className="ml-auto text-xs tabular-nums t-3" aria-live="polite">
              {pending > 0
                ? `${filled}/${total} · ${pending === 1 ? 'queda 1' : `quedan ${pending}`}`
                : `${total}/${total} · día completo 🎉`}
            </span>
          </div>

          {pendingAdvice && (
            <PendingChallengeCard
              advice={pendingAdvice}
              kid={kid}
              onDone={completeChallenge}
            />
          )}

          {/* Antes de la lista de casillas, lo que de verdad hay que mirar hoy. */}
          <AttentionCard profile={profile} values={values} kid={kid} />

          {visibleCategories.length === 0 ? (
            <div className={`${kid ? 'card-kid' : 'card'} p-8 text-center`}>
              <p className="text-4xl" aria-hidden>
                🎉
              </p>
              <p className="mt-2 font-bold t-1">No queda nada por registrar</p>
              <p className="mt-1 text-sm t-3">
                Has completado las {total} métricas de{' '}
                {friendlyDateLabel(date).toLowerCase()}.
              </p>
              <button
                type="button"
                onClick={() => setOnlyPending(false)}
                className="btn-ghost mt-4 px-3 py-1.5 text-xs"
              >
                Ver todas las categorías
              </button>
            </div>
          ) : (
            visibleCategories.map((category, index) => (
              <CategoryCard
                key={category.id}
                category={category}
                profileId={profile.id}
                values={values}
                onChange={handleChange}
                variant={kid ? 'kid' : 'adult'}
                skin={skin}
                defaultOpen={kid ? index === 0 : true}
                note={notes[category.id] ?? ''}
                onNoteChange={(text) => writeNote(category.id, text)}
              />
            ))
          )}

          {/* Fotos de comida: sólo donde hay objetivos de alimentación */}
          {hasFoodGoals(profile.id) && (
            <MealPhotoCard profile={profile} date={date} store={store} kid={kid} />
          )}

          {/* Observaciones del día, dictado y consejo */}
          <DayNoteCard profile={profile} date={date} store={store} kid={kid} filled={filled} />

          {/* Los atajos sólo se anuncian donde hay teclado: en el móvil eran
              cuatro líneas de letra pequeña que no llevaban a ninguna parte. */}
          <p className="hidden pt-1 text-center text-[11px] t-3 sm:block">
            Atajos: <kbd className="font-mono font-bold">←</kbd>{' '}
            <kbd className="font-mono font-bold">→</kbd> cambian de día ·{' '}
            <kbd className="font-mono font-bold">H</kbd> vuelve a hoy ·{' '}
            <kbd className="font-mono font-bold">Esc</kbd> vuelve a los perfiles
          </p>
        </div>
      ) : tab === 'challenges' ? (
        <div role="tabpanel" id="panel-challenges" aria-labelledby="tab-challenges">
          <ChallengesPanel
            profile={profile}
            date={date}
            entries={store.entries}
            skin={skin}
            note={notes[CHALLENGE_NOTE_KEY] ?? ''}
            onNoteChange={(text) => writeNote(CHALLENGE_NOTE_KEY, text)}
          />
        </div>
      ) : (
        <div role="tabpanel" id="panel-summary" aria-labelledby="tab-summary">
          <SummaryView
          profile={profile}
          date={date}
          entries={store.entries}
          skin={skin}
          onSelectDay={(selected) => {
            onDateChange(selected);
            setTab('today');
          }}
          />
        </div>
      )}
    </div>
  );
}
