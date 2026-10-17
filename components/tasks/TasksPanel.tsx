'use client';

import { headingFont, kickerFont } from '@/lib/profiles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarAccount, type CalendarAvailability } from '@/components/tasks/CalendarAccount';
import { MonthGrid } from '@/components/tasks/MonthGrid';
import { SpreadTasks } from '@/components/tasks/SpreadTasks';
import { TaskComposer } from '@/components/tasks/TaskComposer';
import { TaskItem } from '@/components/tasks/TaskItem';
import { Modal } from '@/components/ui/Modal';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { useToast } from '@/components/ui/Toast';
import type { HabitStore } from '@/hooks/useHabitStore';
import { oneOf, useRemembered } from '@/hooks/useRemembered';
import * as calendar from '@/lib/calendar';
import { capitalize, friendlyDateLabel, toDateKey, todayKey } from '@/lib/dates';
import {
  awaitingCalendar,
  canGoToCalendar,
  completeTask,
  createTask,
  dueCount,
  editTask,
  groupTasks,
  loadByDay,
  spreadTask,
  type TaskDraft,
} from '@/lib/tasks';
import type { CalendarLink, DateKey, Profile, ProfileSkin, Task } from '@/types';

/* =========================================================================
 *  Tareas del perfil.
 *
 *  Es la agenda de cada uno: lo que hay que hacer y cuándo. Vive aparte de
 *  los hábitos a propósito —un hábito se repite cada día y se puntúa; un
 *  recado ocurre una vez y se tacha— y no entra en el cumplimiento ni en las
 *  estrellas: nadie debería sacar peor nota por no haber comprado leche.
 *
 *  Con una cuenta de Google enlazada, lo que tiene fecha viaja al calendario
 *  y avisa solo. Sin ella, la lista funciona igual y se ve en todos los
 *  móviles de casa.
 * ========================================================================= */

type TaskView = 'lista' | 'calendario';
const TASK_VIEWS: readonly TaskView[] = ['lista', 'calendario'];

/** Tope de reintentos por tanda: es una casa, no una bandeja de entrada. */
const RETRY_LIMIT = 25;

/** Lo que trae la vuelta de Google, para poder acusarla aquí. */
export interface CalendarNotice {
  ok: boolean;
  profileId?: string;
  reason?: string;
}

interface TasksPanelProps {
  profile: Profile;
  store: HabitStore;
  kid: boolean;
  skin: ProfileSkin;
  notice?: CalendarNotice | null;
  onNoticeSeen?: () => void;
}

export function TasksPanel({ profile, store, kid, skin, notice, onNoticeSeen }: TasksPanelProps) {
  // Hasta que `/api/calendario` contesta no se sabe si hay Google: ni se
  // pinta como que no lo hay ni se decide sobre lo que se apunte mientras.
  const [status, setStatus] = useState<CalendarAvailability>('loading');
  const [reason, setReason] = useState<string | undefined>();
  const [links, setLinks] = useState<CalendarLink[]>([]);
  const [editing, setEditing] = useState<Task | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  /**
   * Ver las hechas y lista o mes: se recuerda en este aparato y por perfil,
   * que quien lleva sus recados en el calendario no tenga que volver a él
   * cada vez que entra.
   */
  const [showDone, setShowDone] = useRemembered<boolean>(`tareas:${profile.id}:hechas`, false);
  const notify = useToast();

  /* --------------------------------------------------- lista o calendario */

  /** La lista de siempre, o el mes con lo que cae cada día. */
  const [view, setView] = useRemembered<TaskView>(
    `tareas:${profile.id}:vista`,
    'lista',
    oneOf(TASK_VIEWS),
  );
  const [month, setMonth] = useState<DateKey>(() => todayKey());
  const [focusDay, setFocusDay] = useState<DateKey>(() => todayKey());

  /** Lo que se está repartiendo por otros días. */
  const [spreading, setSpreading] = useState<Task[] | null>(null);

  const refreshStatus = useCallback(async () => {
    const state = await calendar.status();
    setStatus(state.configured ? 'ready' : 'off');
    setReason(state.reason);
    setLinks(state.links);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const link = links.find((item) => item.profileId === profile.id);
  const linked = Boolean(link);
  const unknown = status === 'loading';

  const tasks = store.getTasks(profile.id);
  const pending = dueCount(tasks);

  const groups = useMemo(() => {
    const visible = showDone ? tasks : tasks.filter((task) => !task.done);
    return groupTasks(visible);
  }, [tasks, showDone]);

  const doneCount = tasks.filter((task) => task.done).length;

  /** Cuánto queda en cada montón, sin las hechas: es la cuenta de arriba. */
  const counts = useMemo(() => groupTasks(tasks.filter((task) => !task.done)), [tasks]);

  /**
   * Lo de hoy, para el anillo: lo hecho hoy contra lo hecho más lo que aún
   * pide atención (lo de hoy y lo atrasado). Hecho hoy es lo que tocaba hoy
   * o lo que se tachó hoy, aunque fuera de otro día.
   */
  const today = todayKey();
  const doneToday = tasks.filter(
    (task) =>
      task.done &&
      (task.due === today || (task.doneAt !== undefined && toDateKey(new Date(task.doneAt)) === today)),
  ).length;
  const todayTotal = doneToday + pending;

  /** Picar en un montón de arriba lleva a él, en la lista. */
  const goTo = (bucket: string) => {
    if (view !== 'lista') setView('lista');
    window.setTimeout(() => {
      document
        .getElementById(`tareas-${profile.id}-${bucket}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  /** Cuánto hay cada día, para los puntos del calendario. */
  const load = useMemo(() => loadByDay(tasks), [tasks]);

  /** Lo del día que se está mirando en el calendario, ya ordenado. */
  const dayTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.due === focusDay && (showDone || !task.done))
        .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [tasks, focusDay, showDone],
  );

  /* ------------------------------------------------------- calendario */

  const mark = (id: string, busy: boolean) =>
    setBusyIds((prev) => (busy ? [...prev, id] : prev.filter((item) => item !== id)));

  /**
   * Manda la tarea a Google y guarda el vínculo. Devuelve `true` si ha ido
   * bien. Nunca lanza: que el calendario falle no puede impedir que el
   * recado quede apuntado, que es lo importante.
   *
   * Cuando falla, la tarea queda marcada como pendiente y se reintenta sola
   * la próxima vez que se abra la sección. Es lo que hace que apuntar algo
   * en el coche, sin cobertura, acabe igualmente en el calendario.
   */
  const push = useCallback(
    async (task: Task, quiet = false): Promise<boolean> => {
      mark(task.id, true);
      try {
        const { calendar: linkInfo, calendarName } = await calendar.pushTask(task);
        store.saveTask({
          ...task,
          calendar: linkInfo,
          calendarPending: undefined,
          updatedAt: new Date().toISOString(),
        });
        if (!quiet) notify({ message: `Puesto en «${calendarName}».`, icon: '📆' });
        return true;
      } catch (error) {
        store.saveTask({ ...task, calendarPending: true, updatedAt: new Date().toISOString() });
        if (!quiet) {
          notify({
            message: error instanceof Error ? error.message : 'No se ha podido usar el calendario.',
            icon: '⚠️',
            tone: 'danger',
          });
        }
        return false;
      } finally {
        mark(task.id, false);
      }
    },
    [notify, store],
  );

  const unlink = useCallback(
    async (task: Task) => {
      mark(task.id, true);
      try {
        await calendar.dropTask(task);
        // Quitarlo a mano también cancela el reintento: si vuelve solo al
        // calendario después de haberlo retirado, la app deja de obedecer.
        store.saveTask({
          ...task,
          calendar: undefined,
          calendarPending: undefined,
          updatedAt: new Date().toISOString(),
        });
        notify({ message: 'Quitado del calendario.', icon: '🚫' });
      } catch (error) {
        notify({
          message: error instanceof Error ? error.message : 'No se ha podido quitar.',
          icon: '⚠️',
          tone: 'danger',
        });
      } finally {
        mark(task.id, false);
      }
    },
    [notify, store],
  );

  /**
   * Lo que quedó sin mandar se reintenta al abrir la sección con la cuenta
   * enlazada: apuntar algo sin cobertura no puede significar perderlo. Se
   * hace una vez por perfil y en fila, y a la primera negativa se para,
   * porque si el permiso ha caducado fallarán todas igual.
   */
  const retriedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!linked || retriedFor.current === profile.id) return;

    const waiting = store.getTasks(profile.id).filter(awaitingCalendar).slice(0, RETRY_LIMIT);
    if (waiting.length === 0) return;

    retriedFor.current = profile.id;

    void (async () => {
      for (const task of waiting) {
        if (!(await push(task, true))) break;
      }
    })();
  }, [linked, profile.id, push, store]);

  /**
   * Lo apuntado mientras aún no se sabía si había cuenta. Si al final no la
   * hay, se le quita la marca de pendiente: un «se mandará al calendario»
   * en un perfil sin calendario sería una promesa que nadie va a cumplir.
   * Si la hay, el reintento de arriba se encarga, como de lo demás.
   */
  const blind = useRef<string[]>([]);

  useEffect(() => {
    if (unknown) return;
    const ids = blind.current;
    blind.current = [];
    if (linked || ids.length === 0) return;

    for (const task of store.getTasks(profile.id)) {
      if (ids.includes(task.id) && task.calendarPending) {
        store.saveTask({ ...task, calendarPending: undefined });
      }
    }
  }, [unknown, linked, profile.id, store]);

  /* ----------------------------------------------------------- altas */

  const add = async (draft: TaskDraft) => {
    const created = createTask(profile.id, draft);

    // Con cuenta enlazada, lo que tiene fecha va al calendario sin pedirlo
    // otra vez: es justamente para eso para lo que se conectó. Se marca como
    // pendiente *antes* de intentarlo, para que quede constancia aunque la
    // app se cierre a mitad de camino. Si todavía no se sabe si hay cuenta,
    // se marca igual y se deja para el reintento: lo contrario era perder
    // en silencio lo apuntado en el primer segundo tras abrir la sección.
    const shouldSend = (linked || unknown) && canGoToCalendar(created);
    const task = shouldSend ? { ...created, calendarPending: true } : created;
    store.saveTask(task);

    if (!shouldSend) {
      notify({ message: 'Apuntado.', icon: '📝' });
      return;
    }

    if (unknown) {
      blind.current.push(task.id);
      notify({ message: 'Apuntado. Irá al calendario en cuanto se pueda.', icon: '📝' });
      return;
    }

    const sent = await push(task, true);
    notify(
      sent
        ? { message: 'Apuntado y puesto en el calendario.', icon: '📆' }
        : { message: 'Apuntado. Irá al calendario en cuanto se pueda.', icon: '📝' },
    );
  };

  const applyEdit = async (draft: TaskDraft) => {
    if (!editing) return;
    const next = editTask(editing, draft);
    store.saveTask(next);
    setEditing(null);

    // Lo que ya estaba en Google se mantiene al día; si perdió la fecha, se
    // retira, porque un evento sin cuándo no existe. Aquí sí se acusa en voz
    // alta: quien acaba de cambiar una hora quiere saber que ha calado.
    if (!next.calendar) return;
    if (canGoToCalendar(next)) await push(next);
    else await unlink(next);
  };

  const toggle = async (task: Task) => {
    const next = completeTask(task, !task.done);
    store.saveTask(next);

    // Al tachar algo puntual, su evento se retira: ya no hay nada que
    // recordar. Las que se repiten conservan su serie y siguen avisando.
    //
    // Y como un toque de más en la casilla se llevaba la cita de Google sin
    // marcha atrás, el aviso trae «Deshacer»: la tarea vuelve como estaba y
    // su evento se vuelve a poner.
    if (task.calendar && next.done && next.repeat === 'none') {
      mark(task.id, true);
      let dropped = true;
      try {
        await calendar.dropTask(next);
      } catch {
        dropped = false;
      } finally {
        mark(task.id, false);
      }

      if (!dropped) {
        notify({ message: 'Hecha. No se ha podido quitar del calendario.', icon: '⚠️', tone: 'danger' });
        return;
      }

      store.saveTask({ ...next, calendar: undefined, calendarPending: undefined });
      notify({
        message: 'Hecha y quitada del calendario.',
        icon: '✅',
        action: {
          label: 'Deshacer',
          onClick: () => {
            const restored: Task = {
              ...task,
              calendar: undefined,
              calendarPending: true,
              updatedAt: new Date().toISOString(),
            };
            store.saveTask(restored);
            void push(restored, true);
          },
        },
      });
      return;
    }

    // Destachar algo puntual con fecha la devuelve al calendario: al tacharla
    // se quitó, y una tarea pendiente con cuenta enlazada tiene que avisar.
    if (!next.done && task.done && linked && !next.calendar && next.repeat === 'none' && canGoToCalendar(next)) {
      const pendingTask: Task = { ...next, calendarPending: true };
      store.saveTask(pendingTask);
      await push(pendingTask, true);
    }
  };

  const remove = (task: Task) => {
    const before = store.snapshot();
    store.removeTask(task.id);

    // La cita se retira de Google sin hacer esperar a nadie; deshacer la
    // vuelve a poner, porque un recado que reaparece sin su recordatorio
    // sería sólo media marcha atrás.
    if (task.calendar) void calendar.dropTask(task).catch(() => undefined);

    notify({
      message: 'Tarea borrada.',
      icon: '🗑️',
      tone: 'danger',
      action: {
        label: 'Deshacer',
        onClick: () => {
          store.restore(before);
          if (task.calendar) void push(task, true);
        },
      },
    });
  };

  /* -------------------------------------------------------- repartir */

  /**
   * Copia lo elegido a los días marcados. Las copias entran de golpe —lo que
   * importa es que queden apuntadas— y sólo después salen hacia Google, en
   * fila y sin ruido; a la primera negativa se para y el resto queda
   * pendiente, que es lo que la app reintenta sola al volver a abrirse.
   *
   * Deshacer las quita de aquí *y* de Google: si el aviso ofrece marcha
   * atrás, doce eventos huérfanos en el calendario de la casa no son marcha
   * atrás.
   */
  const spread = async (days: DateKey[], toCalendar: boolean) => {
    if (!spreading) return;

    const copies = spreading.flatMap((task) => spreadTask(task, days));
    if (copies.length === 0) {
      setSpreading(null);
      return;
    }

    const before = store.snapshot();
    const send = toCalendar && linked;

    for (const copy of copies) {
      store.saveTask(send && canGoToCalendar(copy) ? { ...copy, calendarPending: true } : copy);
    }
    setSpreading(null);

    /** Las que ya han llegado a Google: hay que poder retirarlas. */
    const inGoogle: Task[] = [];
    let undone = false;

    notify({
      message: `${copies.length} ${copies.length === 1 ? 'copia creada' : 'copias creadas'}${
        send ? '. Van al calendario…' : '.'
      }`,
      icon: '⧉',
      action: {
        label: 'Deshacer',
        onClick: () => {
          undone = true;
          store.restore(before);
          for (const task of inGoogle) void calendar.dropTask(task).catch(() => undefined);
        },
      },
    });

    if (!send) return;

    for (const copy of copies) {
      if (undone) break;
      if (!canGoToCalendar(copy)) continue;

      mark(copy.id, true);
      try {
        const { calendar: linkInfo } = await calendar.pushTask(copy);
        const posted: Task = {
          ...copy,
          calendar: linkInfo,
          calendarPending: undefined,
          updatedAt: new Date().toISOString(),
        };

        // Si mientras tanto se ha deshecho, el evento se retira en vez de
        // guardarse: una tarea que ya no existe no puede tener cita.
        if (undone) void calendar.dropTask(posted).catch(() => undefined);
        else {
          inGoogle.push(posted);
          store.saveTask(posted);
        }
      } catch {
        // Se queda pendiente y se reintenta solo. Si ha caducado el permiso
        // fallarán todas igual, así que no se insiste.
        break;
      } finally {
        mark(copy.id, false);
      }
    }
  };

  /* ---------------------------------------------------------- pintura */

  const renderTask = (task: Task, flat = false) => (
    <TaskItem
      key={task.id}
      flat={flat}
      task={task}
      kid={kid}
      linked={linked}
      busy={busyIds.includes(task.id)}
      onToggle={() => void toggle(task)}
      onEdit={() => setEditing(task)}
      onDelete={() => remove(task)}
      onPush={() => void push(task)}
      onUnlink={() => void unlink(task)}
      onSpread={() => setSpreading([task])}
    />
  );

  const heading = headingFont(skin);
  const kicker = kickerFont(skin);

  return (
    <div className="space-y-4">
      {/* La vuelta de Google, dicha una vez */}
      {notice && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm
            ${notice.ok ? 'border-accent bg-accent-faint t-1' : 'hairline surf-1 t-danger'}`}
        >
          <span aria-hidden>{notice.ok ? '✅' : '⚠️'}</span>
          <p className="flex-1 leading-relaxed">
            {notice.ok
              ? 'Cuenta de Google conectada. Las tareas con fecha ya pueden ir al calendario.'
              : (notice.reason ?? 'No se ha podido conectar la cuenta de Google.')}
          </p>
          {onNoticeSeen && (
            <button
              type="button"
              onClick={onNoticeSeen}
              aria-label="Cerrar el aviso"
              className="btn-ghost px-2 py-1 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* La cabecera, como la de la portada: qué hay hoy en grande, con su
          anillo, y debajo cuánto queda en cada montón. Cada montón es un
          atajo a su sitio de la lista. */}
      <section className={`${kid ? 'card-kid' : 'card'} p-4`} aria-label="Cómo van las tareas">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] font-black uppercase tracking-[0.22em] t-3${kicker}`}>
              Recados y citas
            </p>
            <h2 className={`font-display text-[22px] font-black leading-tight t-1 ${heading}`}>
              Tareas de {profile.name}
            </h2>
            <p className="mt-0.5 text-[13px] tabular-nums t-2" aria-live="polite">
              {pending > 0
                ? `${pending} ${pending === 1 ? 'pendiente para hoy' : 'pendientes para hoy'}`
                : todayTotal > 0
                  ? 'Todo lo de hoy, hecho 🎉'
                  : 'Nada pendiente para hoy 🎉'}
            </p>
          </div>

          {todayTotal > 0 ? (
            <span aria-hidden className="shrink-0">
              <ProgressRing ratio={doneToday / todayTotal} size={60} stroke={6}>
                <span className="text-[11px] font-black tabular-nums t-1">
                  {doneToday >= todayTotal ? '✓' : `${doneToday}/${todayTotal}`}
                </span>
              </ProgressRing>
            </span>
          ) : (
            <span
              aria-hidden
              className="grid h-[60px] w-[60px] shrink-0 place-items-center rounded-full bg-accent-soft text-2xl"
            >
              🌤️
            </span>
          )}
        </div>

        {/* Cuánto hay en cada montón: lo atrasado, en rojo. */}
        {counts.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tareas por montón">
            {counts.map((group) => (
              <li key={group.bucket}>
                <button
                  type="button"
                  onClick={() => goTo(group.bucket)}
                  className={`chip-soft tap-area text-[11px] font-bold tabular-nums hover-soft
                    ${group.bucket === 'vencidas' ? 't-danger' : ''}`}
                >
                  <span aria-hidden>{group.icon}</span> {group.tasks.length}{' '}
                  {group.label.toLowerCase()}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 hairline">
          {/* Lista o mes. La lista dice *qué urge*; el mes, *cómo viene la
              semana* y, sobre todo, permite repartir de un día a varios. */}
          <div
            className="flex flex-1 gap-1 rounded-full p-1 surf-2 sm:flex-none"
            role="group"
            aria-label="Cómo ver las tareas"
          >
            {(
              [
                { id: 'lista', label: 'Lista', icon: '📋' },
                { id: 'calendario', label: 'Calendario', icon: '🗓️' },
              ] as const
            ).map((option) => {
              const active = view === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setView(option.id)}
                  aria-pressed={active}
                  className={`tap-area min-h-9 flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors
                    ${active ? 'bg-accent t-on-accent' : 't-2 hover-soft'}`}
                >
                  <span aria-hidden>{option.icon}</span> {option.label}
                </button>
              );
            })}
          </div>

          {doneCount > 0 && (
            <button
              type="button"
              onClick={() => setShowDone(!showDone)}
              aria-pressed={showDone}
              className={`btn min-h-9 border px-3 py-1.5 text-xs font-semibold sm:ml-auto
                ${showDone ? 'bg-accent-soft border-accent t-1' : 'hairline surf-1 t-2 hover-soft'}`}
            >
              {showDone ? '👁️ Viendo las hechas' : `✅ Ver las hechas (${doneCount})`}
            </button>
          )}
        </div>
      </section>

      {/* En el calendario, lo nuevo nace en el día que se está mirando. La
          clave es sólo la vista: antes llevaba también el día, y picar en otro
          día del mes borraba la tarea a medio escribir. Ahora el formulario
          sigue al día él solo mientras no se haya escrito ni tocado la fecha. */}
      <TaskComposer
        key={view}
        kid={kid}
        defaultDue={view === 'calendario' ? focusDay : undefined}
        onSubmit={add}
      />

      {view === 'calendario' ? (
        <div className="space-y-3">
          <MonthGrid
            month={month}
            onMonthChange={setMonth}
            onPick={(day) => {
              setFocusDay(day);
              setMonth(day);
            }}
            focus={focusDay}
            load={load}
            label={`Tareas de ${profile.name} por día`}
          />

          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold t-1">{capitalize(friendlyDateLabel(focusDay))}</h3>
            <span className="text-xs tabular-nums t-3">
              {dayTasks.length === 0
                ? 'sin nada apuntado'
                : `${dayTasks.length} ${dayTasks.length === 1 ? 'tarea' : 'tareas'}`}
            </span>

            {/* De un día a los que hagan falta: la semana de campamento se
                monta una vez y se reparte por los cinco días. */}
            {dayTasks.some((task) => !task.done) && (
              <button
                type="button"
                onClick={() => setSpreading(dayTasks.filter((task) => !task.done))}
                className="btn-ghost ml-auto px-3 py-1.5 text-xs"
              >
                ⧉ Copiar el día
              </button>
            )}
          </div>

          {dayTasks.length === 0 ? (
            <div className={`${kid ? 'card-kid' : 'card'} p-6 text-center`}>
              <p className="text-3xl" aria-hidden>
                🗓️
              </p>
              <p className="mt-2 text-sm t-3">
                Nada este día. Lo que se apunte arriba con esta fecha aparecerá aquí.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">{dayTasks.map((task) => renderTask(task))}</ul>
          )}
        </div>
      ) : groups.length === 0 ? (
        /* Sin nada: no un hueco, sino lo que se puede apuntar aquí, y el
           cuadro de escribir a un toque. */
        <div className={`${kid ? 'card-kid' : 'card'} relative overflow-hidden p-5 text-center`}>
          <span
            aria-hidden
            className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-tint-halo blur-2xl"
          />
          <p className="relative text-4xl" aria-hidden>
            🌤️
          </p>
          <p className={`relative mt-2 font-display text-lg font-black t-1 ${heading}`}>
            {doneCount > 0 ? 'Todo tachado' : 'No hay nada apuntado'}
          </p>
          <p className="relative mx-auto mt-1 max-w-sm text-[13px] leading-snug t-2">
            Las citas, los recados y lo que haya que recordar. Se apuntan arriba, con su día, y
            {linked ? ' van solos a Google Calendar.' : ' se ven en todos los móviles de casa.'}
          </p>
          <ul className="relative mt-3 flex flex-wrap justify-center gap-1.5" aria-hidden>
            {['📅 Dentista', '🛒 Comprar leche', '🎒 Excursión del cole'].map((example) => (
              <li key={example} className="chip-soft text-[11px] t-3">
                {example}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              const field = document.querySelector<HTMLInputElement>('input[aria-label="Qué hay que hacer"]');
              field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              field?.focus({ preventScroll: true });
            }}
            className="btn-primary relative mt-4 px-4 py-2 text-sm"
          >
            ➕ Apuntar la primera
          </button>
        </div>
      ) : (
        groups.map((group) => (
          <section
            key={group.bucket}
            id={`tareas-${profile.id}-${group.bucket}`}
            aria-label={group.label}
            className="scroll-mt-24"
          >
            <h3
              className={`mb-2 flex items-center gap-2 px-1 text-[11px] font-black uppercase tracking-[0.22em]${kicker}
                ${group.bucket === 'vencidas' ? 't-danger' : 't-3'}`}
            >
              <span aria-hidden>{group.icon}</span> {group.label}
              <span className="tabular-nums font-bold opacity-70">{group.tasks.length}</span>
            </h3>

            {/* Un montón, una tarjeta: las filas separadas por una raya, como
                el «Para hoy» de la portada, en vez de una tarjeta por recado. */}
            <ul
              className={`${kid ? 'card-kid' : 'card'} divide-y divide-[var(--border)] p-0
                ${group.bucket === 'vencidas' ? 'border-danger' : ''}`}
            >
              {group.tasks.map((task) => renderTask(task, true))}
            </ul>
          </section>
        ))
      )}

      <CalendarAccount
        profile={profile}
        kid={kid}
        status={status}
        reason={reason}
        link={link}
        onChanged={() => void refreshStatus()}
      />

      {editing && (
        <Modal title="Editar la tarea" onClose={() => setEditing(null)} size="lg">
          <TaskComposer
            task={editing}
            kid={kid}
            bare
            onSubmit={(draft) => void applyEdit(draft)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {spreading && (
        <SpreadTasks
          tasks={spreading}
          all={tasks}
          linked={linked}
          onClose={() => setSpreading(null)}
          onConfirm={(days, toCalendar) => void spread(days, toCalendar)}
        />
      )}
    </div>
  );
}
