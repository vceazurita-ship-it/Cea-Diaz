'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
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
 *  La casilla manda: lo primero y más grande es tacharla. El título se toca
 *  para editar, y el resto —cuándo, de qué tipo, si está en el calendario—
 *  son etiquetas pequeñas debajo. Todo lo demás vive detrás de un «⋯»: en
 *  una lista de veinte recados, cinco botones por fila eran más ruido que
 *  ayuda, y lo que de verdad se hace cada día es tachar y, de vez en cuando,
 *  corregir. Dentro del menú sólo aparece lo que tiene sentido: no se manda
 *  al calendario algo sin fecha ni algo que ya está hecho.
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
  /** Repartir este mismo recado por otros días. */
  onSpread: () => void;
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
  onSpread,
}: TaskItemProps) {
  const kind = kindInfo(task.kind);
  const late = overdueLabel(task);
  const outdated = calendarOutdated(task);
  const reminder = reminderLabel(task.remindBefore, Boolean(task.time));

  /* ------------------------------------------------------------- menú */

  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  // El menú se cierra solo al tocar fuera o con Escape, como cualquier
  // desplegable; al cerrarse con el teclado el foco vuelve al «⋯» para no
  // dejar a quien navega con tabulador perdido al principio de la página.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      toggle.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    popover.current?.querySelector<HTMLElement>('button')?.focus();

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  /** Cada opción cierra el menú antes de actuar: la acción ya se ha elegido. */
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  const item = 'btn w-full justify-start px-3 py-2 text-xs font-semibold t-1 hover-soft';

  return (
    <li
      className={`rounded-2xl border p-3 transition-colors hairline
        ${task.done ? 'surf-2 opacity-60' : late ? 'surf-1 border-l-4' : 'surf-1'}`}
      // Lo atrasado se delata por el canto, en el color de las cosas que
      // piden atención: el acento es del perfil y no significa «se pasó».
      style={late && !task.done ? { borderLeftColor: 'var(--danger)' } : undefined}
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
          {/* El título es el botón de editar: es lo que se toca cuando algo
              está mal escrito o ha cambiado de hora. */}
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar ${task.title}`}
            className={`block w-full min-w-0 break-words text-left font-bold leading-snug t-1
              ${task.done ? 'line-through' : ''} ${kid ? 'text-base' : 'text-sm'}`}
          >
            <span aria-hidden>{kind.icon}</span> {task.title}
          </button>

          {task.detail && (
            <p className="mt-0.5 break-words text-xs leading-relaxed t-3">{task.detail}</p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] t-3">
            <span className={late ? 'font-bold t-danger' : 'font-semibold t-2'}>
              🕒 {whenLabel(task)}
              {late && ` · se pasó ${late}`}
            </span>

            {task.repeat !== 'none' && <span>🔁 {REPEAT_LABELS[task.repeat].toLowerCase()}</span>}

            {reminder && task.calendar && <span>🔔 {reminder}</span>}

            {busy ? (
              <span className="font-semibold t-2" role="status">
                ⏳ Con el calendario…
              </span>
            ) : task.calendar ? (
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

        {/* Lo demás, detrás de un «⋯» */}
        <div ref={wrapper} className="relative shrink-0">
          <button
            ref={toggle}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={`Más acciones para ${task.title}`}
            className="btn-ghost h-10 w-10 p-0 text-lg leading-none"
          >
            ⋯
          </button>

          {open && (
            <div
              ref={popover}
              id={menuId}
              className="absolute right-0 top-full z-20 mt-1 w-56 rounded-2xl border p-1.5 hairline surf-raised"
              style={{ boxShadow: 'var(--shadow-pop)' }}
            >
              <ul className="space-y-0.5">
                {linked && canGoToCalendar(task) && (!task.calendar || outdated) && (
                  <li>
                    <button type="button" onClick={pick(onPush)} disabled={busy} className={item}>
                      {outdated ? '🔄 Actualizar en Google' : '📆 Al calendario'}
                    </button>
                  </li>
                )}

                {linked && task.calendar && (
                  <li>
                    <button type="button" onClick={pick(onUnlink)} disabled={busy} className={item}>
                      🚫 Quitar del calendario
                    </button>
                  </li>
                )}

                <li>
                  <button type="button" onClick={pick(onEdit)} className={item}>
                    ✏️ Editar
                  </button>
                </li>

                {/* Lo mismo, otros días. No tiene sentido en lo ya tachado: se
                    repartiría un recado que nadie va a hacer. */}
                {!task.done && (
                  <li>
                    <button type="button" onClick={pick(onSpread)} className={item}>
                      ⧉ Copiar a días
                    </button>
                  </li>
                )}

                <li>
                  <ConfirmButton
                    question="¿Borrar esta tarea?"
                    confirmLabel="Sí, borrar"
                    onConfirm={pick(onDelete)}
                    className={`${item} t-danger`}
                    confirmClassName="btn-danger px-3 py-1.5 text-xs"
                  >
                    🗑️ Borrar
                  </ConfirmButton>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
