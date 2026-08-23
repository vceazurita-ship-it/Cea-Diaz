'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarAccount } from '@/components/tasks/CalendarAccount';
import { TaskComposer } from '@/components/tasks/TaskComposer';
import { TaskItem } from '@/components/tasks/TaskItem';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { HabitStore } from '@/hooks/useHabitStore';
import * as calendar from '@/lib/calendar';
import {
  awaitingCalendar,
  canGoToCalendar,
  completeTask,
  createTask,
  dueCount,
  editTask,
  groupTasks,
  type TaskDraft,
} from '@/lib/tasks';
import type { CalendarLink, Profile, ProfileSkin, Task } from '@/types';

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
  const [available, setAvailable] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [links, setLinks] = useState<CalendarLink[]>([]);
  const [editing, setEditing] = useState<Task | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const notify = useToast();

  const refreshStatus = useCallback(async () => {
    const state = await calendar.status();
    setAvailable(state.configured);
    setReason(state.reason);
    setLinks(state.links);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const link = links.find((item) => item.profileId === profile.id);
  const linked = Boolean(link);

  const tasks = store.getTasks(profile.id);
  const pending = dueCount(tasks);

  const groups = useMemo(() => {
    const visible = showDone ? tasks : tasks.filter((task) => !task.done);
    return groupTasks(visible);
  }, [tasks, showDone]);

  const doneCount = tasks.filter((task) => task.done).length;

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

  /* ----------------------------------------------------------- altas */

  const add = async (draft: TaskDraft) => {
    const created = createTask(profile.id, draft);

    // Con cuenta enlazada, lo que tiene fecha va al calendario sin pedirlo
    // otra vez: es justamente para eso para lo que se conectó. Se marca como
    // pendiente *antes* de intentarlo, para que quede constancia aunque la
    // app se cierre a mitad de camino.
    const shouldSend = linked && canGoToCalendar(created);
    const task = shouldSend ? { ...created, calendarPending: true } : created;
    store.saveTask(task);

    if (!shouldSend) {
      notify({ message: 'Apuntado.', icon: '📝' });
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
    if (task.calendar && next.done && next.repeat === 'none') {
      await unlink(next);
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

  /* ---------------------------------------------------------- pintura */

  const heading = skin === 'pitch' ? 'font-display uppercase tracking-wide' : '';

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

      <div className="flex flex-wrap items-center gap-2">
        <h2 className={`text-lg font-bold t-1 ${heading}`}>
          📋 Tareas de {profile.name}
        </h2>
        <span className="text-xs tabular-nums t-3" aria-live="polite">
          {pending > 0
            ? `${pending} ${pending === 1 ? 'pendiente para hoy' : 'pendientes para hoy'}`
            : 'nada pendiente para hoy 🎉'}
        </span>

        {doneCount > 0 && (
          <button
            type="button"
            onClick={() => setShowDone((value) => !value)}
            aria-pressed={showDone}
            className={`btn ml-auto border px-3 py-1.5 text-xs font-semibold
              ${showDone ? 'bg-accent-soft border-accent t-1' : 'hairline surf-1 t-2 hover-soft'}`}
          >
            {showDone ? '👁️ Viendo las hechas' : `✅ Ver las hechas (${doneCount})`}
          </button>
        )}
      </div>

      <TaskComposer kid={kid} onSubmit={add} />

      {groups.length === 0 ? (
        <div className={`${kid ? 'card-kid' : 'card'} p-8 text-center`}>
          <p className="text-4xl" aria-hidden>
            🌤️
          </p>
          <p className="mt-2 font-bold t-1">No hay nada apuntado</p>
          <p className="mt-1 text-sm t-3">
            Las citas, los recados y lo que haya que recordar van aquí arriba.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.bucket} aria-label={group.label}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide t-3">
              <span aria-hidden>{group.icon}</span> {group.label}
              <span className="ml-1.5 tabular-nums font-normal">({group.tasks.length})</span>
            </p>

            <ul className="space-y-2">
              {group.tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  kid={kid}
                  linked={linked}
                  busy={busyIds.includes(task.id)}
                  onToggle={() => void toggle(task)}
                  onEdit={() => setEditing(task)}
                  onDelete={() => remove(task)}
                  onPush={() => void push(task)}
                  onUnlink={() => void unlink(task)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <CalendarAccount
        profile={profile}
        kid={kid}
        available={available}
        reason={reason}
        link={link}
        onChanged={() => void refreshStatus()}
      />

      {editing && (
        <Modal title="Editar la tarea" onClose={() => setEditing(null)} size="lg">
          <TaskComposer
            task={editing}
            kid={kid}
            onSubmit={(draft) => void applyEdit(draft)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
