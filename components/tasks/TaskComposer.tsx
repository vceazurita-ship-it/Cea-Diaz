'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, capitalize, formatShort, todayKey } from '@/lib/dates';
import {
  DEFAULT_ALL_DAY_REMINDER,
  DEFAULT_DURATION,
  DEFAULT_REMINDER,
  REPEAT_LABELS,
  TASK_KINDS,
  remindersFor,
  type TaskDraft,
} from '@/lib/tasks';
import type { DateKey, Task, TaskKind, TaskRepeat } from '@/types';

/* =========================================================================
 *  Alta y edición de un recado.
 *
 *  La forma corta es una línea: qué hay que hacer y cuándo. Todo lo demás
 *  —hora, tipo, aviso, repetición, detalle— vive plegado, porque la mayoría
 *  de las veces «comprar leche, mañana» es la tarea entera.
 * ========================================================================= */

interface TaskComposerProps {
  /** Presente al editar; ausente al crear. */
  task?: Task;
  kid: boolean;
  onSubmit: (draft: TaskDraft) => void;
  onCancel?: () => void;
}

/** Los atajos de fecha de siempre, más «elegir día». */
type QuickDate = 'hoy' | 'manana' | 'semana' | 'otro' | 'sin';

function quickDateOf(due: DateKey | undefined): QuickDate {
  if (!due) return 'sin';
  const today = todayKey();
  if (due === today) return 'hoy';
  if (due === addDays(today, 1)) return 'manana';
  return 'otro';
}

export function TaskComposer({ task, kid, onSubmit, onCancel }: TaskComposerProps) {
  const editing = Boolean(task);

  const [title, setTitle] = useState(task?.title ?? '');
  const [detail, setDetail] = useState(task?.detail ?? '');
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? 'otro');
  const [due, setDue] = useState<DateKey | undefined>(task?.due ?? todayKey());
  const [quick, setQuick] = useState<QuickDate>(quickDateOf(task?.due ?? todayKey()));
  const [time, setTime] = useState(task?.time ?? '');
  const [duration, setDuration] = useState(task?.duration ?? DEFAULT_DURATION);
  const [repeat, setRepeat] = useState<TaskRepeat>(task?.repeat ?? 'none');
  // Una tarea nueva nace con aviso: la gracia de apuntarla es que avise, y
  // quien no lo quiera lo quita. Al editar manda lo que tuviera guardado,
  // incluido el «sin aviso» de quien ya lo quitó una vez.
  const [remind, setRemind] = useState<number | undefined>(
    task ? task.remindBefore : DEFAULT_ALL_DAY_REMINDER,
  );
  const [open, setOpen] = useState(editing);

  const field = useRef<HTMLInputElement>(null);

  // Lo dictado se añade al final de lo que ya hubiera, como en las notas.
  const reminders = useMemo(() => remindersFor(Boolean(time)), [time]);

  // El aviso por defecto depende de si hay hora, así que al ponerla o
  // quitarla se reajusta en vez de dejar un valor que ya no significa nada.
  useEffect(() => {
    setRemind((current) => {
      if (current === undefined) return current;
      const valid = remindersFor(Boolean(time)).some((option) => option.minutes === current);
      return valid ? current : time ? DEFAULT_REMINDER : DEFAULT_ALL_DAY_REMINDER;
    });
  }, [time]);

  const pick = (choice: QuickDate) => {
    setQuick(choice);
    if (choice === 'hoy') setDue(todayKey());
    else if (choice === 'manana') setDue(addDays(todayKey(), 1));
    else if (choice === 'semana') setDue(addDays(todayKey(), 7));
    else if (choice === 'sin') setDue(undefined);
    else if (!due) setDue(todayKey());
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      field.current?.focus();
      return;
    }

    onSubmit({
      title,
      detail,
      kind,
      due,
      time: time || undefined,
      duration: time ? duration : undefined,
      remindBefore: due ? remind : undefined,
      repeat,
    });

    if (editing) return;

    // Tras crear, el formulario se queda listo para el siguiente recado: se
    // conserva el día elegido, porque quien apunta uno suele apuntar dos.
    setTitle('');
    setDetail('');
    setTime('');
    setRepeat('none');
    setOpen(false);
    field.current?.focus();
  };

  const quickOptions: Array<{ id: QuickDate; label: string }> = [
    { id: 'hoy', label: 'Hoy' },
    { id: 'manana', label: 'Mañana' },
    { id: 'semana', label: 'En 7 días' },
    { id: 'otro', label: due && quick === 'otro' ? capitalize(formatShort(due)) : 'Otro día' },
    { id: 'sin', label: 'Sin fecha' },
  ];

  return (
    <form onSubmit={submit} className={`${kid ? 'card-kid' : 'card'} p-4`}>
      {/* Qué hay que hacer */}
      <input
        ref={field}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={kid ? '¿Qué hay que hacer?' : 'Cita en el dentista, comprar leche…'}
        aria-label="Qué hay que hacer"
        maxLength={300}
        className="field min-h-[2.75rem] w-full p-3"
      />

      {/* Cuándo */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {quickOptions.map((option) => {
          const active = quick === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => pick(option.id)}
              aria-pressed={active}
              className={`btn min-h-[2.25rem] border px-3 py-1.5 text-xs font-semibold
                ${active ? 'bg-accent-soft border-accent t-1' : 'hairline surf-1 t-2 hover-soft'}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {quick === 'otro' && (
        <input
          type="date"
          value={due ?? ''}
          onChange={(event) => setDue(event.target.value || undefined)}
          aria-label="Día de la tarea"
          className="field mt-2 min-h-[2.75rem] w-full p-3"
        />
      )}

      {/* Lo demás, plegado */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="btn-ghost mt-3 px-2.5 py-1.5 text-xs"
      >
        {open ? '▾ Menos opciones' : '▸ Hora, tipo, aviso y repetición'}
      </button>

      {open && (
        <div className="mt-3 space-y-3 rounded-2xl border p-3 hairline surf-2">
          {/* Tipo */}
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide t-3">Tipo</p>
            <div className="flex flex-wrap gap-1.5">
              {TASK_KINDS.map((option) => {
                const active = kind === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setKind(option.id)}
                    aria-pressed={active}
                    className={`btn min-h-[2.25rem] border px-2.5 py-1.5 text-xs font-semibold
                      ${active ? 'bg-accent-soft border-accent t-1' : 'hairline surf-1 t-2 hover-soft'}`}
                  >
                    <span aria-hidden>{option.icon}</span> {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hora y duración: sólo tienen sentido con día */}
          {due && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold t-2">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">
                  Hora
                </span>
                <input
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className="field min-h-[2.75rem] p-2.5"
                />
              </label>

              {time && (
                <label className="text-xs font-semibold t-2">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">
                    Dura
                  </span>
                  <select
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value))}
                    className="field min-h-[2.75rem] p-2.5"
                  >
                    {[15, 30, 45, 60, 90, 120, 180].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {time && (
                <button
                  type="button"
                  onClick={() => setTime('')}
                  className="btn-ghost min-h-[2.75rem] px-2.5 py-1.5 text-xs"
                >
                  Todo el día
                </button>
              )}
            </div>
          )}

          {/* Aviso y repetición */}
          <div className="flex flex-wrap gap-3">
            {due && (
              <label className="text-xs font-semibold t-2">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">
                  Avisar
                </span>
                <select
                  value={remind ?? ''}
                  onChange={(event) =>
                    setRemind(event.target.value === '' ? undefined : Number(event.target.value))
                  }
                  className="field min-h-[2.75rem] p-2.5"
                >
                  <option value="">Sin aviso</option>
                  {reminders.map((option) => (
                    <option key={option.minutes} value={option.minutes}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="text-xs font-semibold t-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">
                Repetir
              </span>
              <select
                value={repeat}
                onChange={(event) => setRepeat(event.target.value as TaskRepeat)}
                className="field min-h-[2.75rem] p-2.5"
              >
                {(Object.keys(REPEAT_LABELS) as TaskRepeat[]).map((option) => (
                  <option key={option} value={option}>
                    {REPEAT_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Detalle */}
          <label className="block text-xs font-semibold t-2">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">
              Detalle
            </span>
            <textarea
              rows={2}
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              placeholder="La dirección, con quién, qué llevar…"
              maxLength={2000}
              className="field w-full resize-y p-3"
            />
          </label>

          {due && remind !== undefined && !time && (
            <p className="text-[11px] leading-relaxed t-3">
              En las tareas de todo el día, Google cuenta el aviso desde la medianoche, así que
              sólo se puede avisar la víspera o antes.
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!title.trim()}
          className="btn-primary px-3 py-2 text-xs"
        >
          {editing ? '💾 Guardar cambios' : '➕ Añadir tarea'}
        </button>

        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost px-3 py-2 text-xs">
            Cancelar
          </button>
        )}

        {!editing && repeat !== 'none' && (
          <span className="text-[11px] t-3">
            Al tacharla volverá a aparecer {REPEAT_LABELS[repeat].toLowerCase()}.
          </span>
        )}
      </div>
    </form>
  );
}
