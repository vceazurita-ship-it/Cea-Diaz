'use client';

import { useEffect, useMemo, useState } from 'react';
import { CategoryCard } from '@/components/CategoryCard';
import { CHALLENGE_NOTE_KEY, ChallengesPanel } from '@/components/challenges/ChallengesPanel';
import { DateNavigator } from '@/components/DateNavigator';
import { AttentionCard } from '@/components/experts/AttentionCard';
import { LearningBonusCard } from '@/components/learning/LearningBonusCard';
import { FinanceLock } from '@/components/finance/FinanceLock';
import { FinancePanel } from '@/components/finance/FinancePanel';
import { DayNoteCard } from '@/components/notes/DayNoteCard';
import { TodayPlanCard } from '@/components/planner/TodayPlanCard';
import { WeekPlanner } from '@/components/planner/WeekPlanner';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { SummaryView } from '@/components/summary/SummaryView';
import { TasksPanel, type CalendarNotice } from '@/components/tasks/TasksPanel';
import { useToast } from '@/components/ui/Toast';
import type { HabitStore } from '@/hooks/useHabitStore';
import { buildChallengeWeek, markHints } from '@/lib/challenges';
import { addDays, friendlyDateLabel, isToday, todayKey, weekKeys, weekdayIndex } from '@/lib/dates';
import {
  GAME_META,
  GAME_NOTE_KEY,
  encodeGameResult,
  gameEnabledFor,
  gameForDate,
  gameResultFor,
  isGameDone,
} from '@/lib/games';
import { getCategories } from '@/lib/habits';
import { learningFor } from '@/lib/learning';
import { bestSlot, blockForMetric, planOf } from '@/lib/planner';
import { skinOf } from '@/lib/profiles';
import { computeDayScore, summarizePeriod } from '@/lib/scoring';
import { dueCount } from '@/lib/tasks';
import type { DashboardTab, DateKey, Metric, PlanBlock, Profile } from '@/types';

interface DashboardProps {
  profile: Profile;
  date: DateKey;
  onDateChange: (date: DateKey) => void;
  store: HabitStore;
  /** Pestaña de partida; se usa al volver de conectar Google Calendar. */
  initialTab?: DashboardTab;
  /** Desenlace de esa conexión, para acusarlo donde se pidió. */
  calendarNotice?: CalendarNotice | null;
  onCalendarNoticeSeen?: () => void;
}

/**
 * El día más despejado de la semana tipo, con el de hoy como desempate: es
 * donde tiene sentido proponer un rato nuevo cuando algo se pide y no está.
 */
function freeDay(profileId: Profile['id'], today: number): number {
  const load = [0, 0, 0, 0, 0, 0, 0];
  for (const block of planOf(profileId).blocks) load[block.day] += block.duration;

  let best = today;
  for (let day = 0; day < 7; day += 1) {
    if (load[day] < load[best]) best = day;
  }
  return best;
}

export function Dashboard({
  profile,
  date,
  onDateChange,
  store,
  initialTab,
  calendarNotice,
  onCalendarNoticeSeen,
}: DashboardProps) {
  const [tab, setTab] = useState<DashboardTab>(initialTab ?? 'today');
  const [onlyPending, setOnlyPending] = useState(false);
  /**
   * Un rato montado en otra pestaña —desde un reto sin hueco— que espera a
   * que la agenda lo recoja y abra su editor. Se vacía en cuanto lo hace.
   */
  const [planSeed, setPlanSeed] = useState<PlanBlock | null>(null);
  /**
   * Si la sección de economía está abierta. Se olvida al salir del perfil: la
   * clave se pide una vez por visita, no una vez por navegador.
   */
  const [financeOpen, setFinanceOpen] = useState(false);
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

  // La marca que hay que batir hoy en cada sesión de gimnasio. Se dice donde se
  // apunta, no en la pestaña de retos: cuando ya está el peso puesto es tarde.
  const marks = useMemo(
    () => markHints(profile.id, date, store.entries),
    [profile.id, date, store.entries],
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
  // se escribe, para no secuestrar el cursor dentro de la nota, y mientras
  // haya un diálogo abierto: con la hoja de un reto o la de los criterios
  // delante, una flecha cambiaba el día de debajo sin que se viera, y al
  // cerrar aparecía otro día con otros datos sin que nadie lo hubiera pedido.
  // Con Alt o Mayús tampoco: ésos son los atajos de la agenda.
  useEffect(() => {
    if (tab !== 'today') return;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (target?.closest('[role="dialog"]') || document.querySelector('[role="dialog"]')) return;

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

  /**
   * Apartarle un rato en la semana a lo que pide un reto. Se monta aquí
   * —conociendo el perfil y el día— y se lleva a la agenda, que lo abre ya
   * relleno: desde el reto hasta el hueco en la semana no hay más que un
   * toque, que es lo que hace que se llegue a apartar de verdad.
   */
  const reserveForMetric = (metric: Metric) => {
    const plan = planOf(profile.id);
    const day = freeDay(profile.id, weekdayIndex(date));
    setPlanSeed(blockForMetric(profile.id, metric, day, bestSlot(plan, day)));
    setTab('plan');
  };

  /** Recados que urgen hoy; se acusan en la propia pestaña. */
  const tasksDue = dueCount(store.getTasks(profile.id));

  /**
   * El juego del día vive en la pestaña de retos, junto al álbum que llena.
   * Aquí sólo se anuncia: si está sin jugar, es lo primero que quiere saber
   * un peque al abrir la app.
   */
  const gamePlays = gameEnabledFor(profile) && isToday(date);
  const gameResult = gamePlays ? gameResultFor(store.entries, profile.id, date) : null;
  const gameDone = gameResult ? isGameDone(gameResult) : false;
  const gameMeta = GAME_META[gameForDate(date)];

  /** El bonus del día, sacado de donde este perfil pone el interés. */
  const learning = useMemo(
    () => learningFor(profile, store.entries, date),
    [profile, store.entries, date],
  );

  const tabs: Array<{ id: DashboardTab; label: string; icon: string }> =
    skin === 'pitch'
      ? [
          { id: 'today', label: 'Partido', icon: '⚽' },
          { id: 'plan', label: 'Semana', icon: '🗓️' },
          { id: 'challenges', label: 'Retos', icon: '🎯' },
          { id: 'tasks', label: 'Recados', icon: '📋' },
          { id: 'summary', label: 'Estadísticas', icon: '📊' },
        ]
      : [
          { id: 'today', label: 'Registro', icon: '📝' },
          { id: 'plan', label: 'Semana', icon: '🗓️' },
          { id: 'challenges', label: 'Retos', icon: '🎯' },
          { id: 'tasks', label: 'Tareas', icon: '📋' },
          { id: 'summary', label: 'Resúmenes', icon: '📊' },
          /**
           * La economía es de Víctor y sólo suya, así que la pestaña no
           * existe en los demás paneles: no hay nada que esconder ni que
           * explicar donde no toca. Detrás lleva su propia clave.
           */
          ...(profile.id === 'victor'
            ? [{ id: 'economia' as const, label: 'Economía', icon: '💶' }]
            : []),
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
              className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-1.5
                py-2.5 text-xs font-bold transition-colors sm:gap-2 sm:px-3 sm:text-sm
                ${active ? 'bg-accent t-on-accent' : 't-2 hover-soft hover:t-1'}
                ${skin === 'pitch' ? 'font-display uppercase tracking-wide' : ''}`}
            >
              <span aria-hidden>{option.icon}</span>
              <span className="truncate">{option.label}</span>

              {/* Lo que urge hoy se ve desde cualquier pestaña */}
              {option.id === 'tasks' && tasksDue > 0 && (
                <span
                  aria-label={`${tasksDue} pendientes`}
                  className={`shrink-0 rounded-full px-1.5 text-[10px] tabular-nums
                    ${active ? 'bg-white/25' : 'bg-accent-soft t-1'}`}
                >
                  {tasksDue}
                </span>
              )}
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

            {gamePlays && (
              <button
                type="button"
                onClick={() => setTab('challenges')}
                className={`btn px-3 py-1.5 text-xs font-semibold border
                  ${gameDone ? 'hairline surf-1 t-2 hover-soft' : 'bg-accent-soft border-accent t-1'}`}
                title={`${gameMeta.title}: se juega una vez al día y deja cromo`}
              >
                {gameMeta.icon}{' '}
                {gameDone
                  ? `Juego ${gameResult?.correct}/${gameResult?.total}`
                  : gameResult
                    ? 'Juego a medias'
                    : 'Juego del día'}
              </button>
            )}

            <span className="ml-auto text-xs tabular-nums t-3" aria-live="polite">
              {pending > 0
                ? `${filled}/${total} · ${pending === 1 ? 'queda 1' : `quedan ${pending}`}`
                : `${total}/${total} · día completo 🎉`}
            </span>
          </div>

          {/* Lo que la semana tenía apartado para hoy, ya contrastado con lo
              registrado: es lo que ata la agenda a estas casillas. */}
          <TodayPlanCard
            profile={profile}
            date={date}
            store={store}
            kid={kid}
            onOpenPlan={() => setTab('plan')}
          />

          {/* Antes de la lista de casillas, lo que de verdad hay que mirar hoy. */}
          <AttentionCard profile={profile} values={values} kid={kid} />

          {/* El regalo del día: una cosa útil, en el idioma que le toca. */}
          {learning && <LearningBonusCard learning={learning} kid={kid} />}

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
                hints={marks}
                note={notes[category.id] ?? ''}
                onNoteChange={(text) => writeNote(category.id, text)}
              />
            ))
          )}

          {/* Observaciones del día */}
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
      ) : tab === 'plan' ? (
        <div role="tabpanel" id="panel-plan" aria-labelledby="tab-plan">
          <WeekPlanner
            profile={profile}
            date={date}
            store={store}
            skin={skin}
            seed={planSeed}
            onSeedUsed={() => setPlanSeed(null)}
          />
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
            onGameResult={(result) =>
              store.setEntryNote(profile.id, date, GAME_NOTE_KEY, encodeGameResult(result))
            }
            onReserve={reserveForMetric}
          />
        </div>
      ) : tab === 'economia' ? (
        <div role="tabpanel" id="panel-economia" aria-labelledby="tab-economia">
          {financeOpen ? (
            <FinancePanel profile={profile} />
          ) : (
            <FinanceLock name={profile.name} onUnlock={() => setFinanceOpen(true)} />
          )}
        </div>
      ) : tab === 'tasks' ? (
        <div role="tabpanel" id="panel-tasks" aria-labelledby="tab-tasks">
          <TasksPanel
            profile={profile}
            store={store}
            kid={kid}
            skin={skin}
            notice={calendarNotice}
            onNoticeSeen={onCalendarNoticeSeen}
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
          // Cambiar de semana o de mes mueve el día visible sin sacar a nadie
          // de los resúmenes: sólo tocar un día concreto lleva al registro.
          onDateChange={onDateChange}
          onOpenPlan={() => setTab('plan')}
          />
        </div>
      )}
    </div>
  );
}
