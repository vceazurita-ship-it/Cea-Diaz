'use client';

import {
  REPEAT_LABELS,
  awaitingCalendar,
  calendarOutdated,
  canGoToCalendar,
  kindInfo,
  overdueLabel,
  reminderLabel,
  whenLabel,
} from '@/lib/tasks';
import type { Task } from '@/types';

/* =========================================================================
 *  Una tarea de la lista.
 *
 *  La casilla manda: lo primero y más grande es tacharla. El resto —cuándo,
 *  de qué tipo, si está en el calendario— son etiquetas pequeñas debajo, y
 *  las acciones sólo aparecen donde tienen sentido: no se manda al
 *  calendario algo que no tiene fecha ni algo que ya está hecho.
 * ========================================================================= */

interface TaskItemProps {
  task: Task;
  kid: boolean;
  /** El perfil tiene una cuenta de Google enlazada. */
  linked: boolean;
  /** Hay una operación de calendario en curso para esta tarea. */
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPush: () => void;
  onUnlink: () => void;
}

export function TaskItem({
  task,
  kid,
  linked,
  busy,
  onToggle,
  onEdit,
  onDelete,
  onPush,
  onUnlink,
}: TaskItemProps) {
  const kind = kindInfo(task.kind);
  const late = overdueLabel(task);
  const outdated = calendarOutdated(task);
  const reminder = reminderLabel(task.remindBefore, Boolean(task.time));

  return (
    <li
      className={`rounded-2xl border p-3 transition-colors hairline
        ${task.done ? 'surf-2 opacity-60' : late ? 'border-accent bg-accent-faint' : 'surf-1'}`}
    >
      <div className="flex items-start gap-3">
        {/* Tachar: objetivo táctil grande, que es lo que más se toca */}
        <button
          type="button"
          onClick={onToggle}
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.done ? `Desmarcar ${task.title}` : `Marcar ${task.title} como hecha`}
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2
            text-base transition-colors
            ${task.done ? 'bg-accent border-accent t-on-accent' : 'hairline-strong surf-2 hover-soft'}`}
        >
          {task.done ? '✓' : ''}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={`font-bold leading-snug t-1 ${task.done ? 'line-through' : ''}
              ${kid ? 'text-base' : 'text-sm'}`}
          >
            <span aria-hidden>{kind.icon}</span> {task.title}
          </p>

          {task.detail && <p className="mt-0.5 text-xs leading-relaxed t-3">{task.detail}</p>}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] t-3">
            <span className={late ? 'font-bold t-danger' : 'font-semibold t-2'}>
              🕒 {whenLabel(task)}
              {late && ` · se pasó ${late}`}
            </span>

            {task.repeat !== 'none' && <span>🔁 {REPEAT_LABELS[task.repeat].toLowerCase()}</span>}

            {reminder && task.calendar && <span>🔔 {reminder}</span>}

            {task.calendar ? (
              // Google no siempre devuelve el enlace; sin él se dice igual que
              // está puesto, pero sin fingir que se puede abrir.
              task.calendar.htmlLink ? (
                <a
                  href={task.calendar.htmlLink}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline decoration-dotted underline-offset-2 t-accent"
                >
                  {outdated ? '📆 En Google (desactualizado)' : '📆 En Google Calendar'}
                </a>
              ) : (
                <span className="font-semibold t-accent">
                  {outdated ? '📆 En Google (desactualizado)' : '📆 En Google Calendar'}
                </span>
              )
            ) : awaitingCalendar(task) ? (
              <span className="font-semibold t-2">⏳ Se mandará al calendario</span>
            ) : (
              reminder && <span>🔔 {reminder} (sin mandar)</span>
            )}
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-12">
        {linked && canGoToCalendar(task) && (!task.calendar || outdated) && (
          <button
            type="button"
            onClick={onPush}
            disabled={busy}
            className="btn-ghost px-2.5 py-1.5 text-[11px]"
          >
            {busy ? '⏳ Mandando…' : outdated ? '🔄 Actualizar en Google' : '📆 Al calendario'}
          </button>
        )}

        {linked && task.calendar && (
          <button
            type="button"
            onClick={onUnlink}
            disabled={busy}
            className="btn-ghost px-2.5 py-1.5 text-[11px]"
          >
            {busy ? '⏳…' : '🚫 Quitar del calendario'}
          </button>
        )}

        <button type="button" onClick={onEdit} className="btn-ghost px-2.5 py-1.5 text-[11px]">
          ✏️ Editar
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="btn-ghost t-danger ml-auto px-2.5 py-1.5 text-[11px]"
        >
          🗑️ Borrar
        </button>
      </div>
    </li>
  );
}
