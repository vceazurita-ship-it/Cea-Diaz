'use client';

import { useMemo, useState } from 'react';
import { MonthGrid } from '@/components/tasks/MonthGrid';
import { Modal } from '@/components/ui/Modal';
import {
  WEEKDAY_LABELS,
  addDays,
  capitalize,
  formatLong,
  formatShort,
  todayKey,
  weekdayIndex,
} from '@/lib/dates';
import {
  REPEAT_LABELS,
  daysWithTitle,
  kindInfo,
  loadByDay,
  nextDays,
  weekdayRun,
} from '@/lib/tasks';
import type { DateKey, Task } from '@/types';

/* =========================================================================
 *  Copiar un recado —o el día entero— a otros días.
 *
 *  Es lo que se hace en casa con el calendario de la pared: apuntar «piscina»
 *  en todos los martes del trimestre de una sentada, en vez de once veces.
 *
 *  Hay dos formas de decir a dónde, y las dos acaban en el mismo sitio: los
 *  días marcados en la rejilla. Los atajos y el patrón *añaden* a lo elegido
 *  —nunca lo sustituyen— y luego se quita a mano lo que no toque, porque las
 *  series de la vida real casi siempre tienen una excepción: el martes de la
 *  excursión no hay piscina.
 *
 *  Lo que sale de aquí son recados sueltos, no una serie: cada uno se tacha,
 *  se cambia de hora o se borra sin tocar a los demás.
 * ========================================================================= */

interface SpreadTasksProps {
  /** Lo que se copia: una tarea, o todas las de un día. */
  tasks: Task[];
  /** Todas las del perfil: para pintar la carga de cada día y avisar de repes. */
  all: Task[];
  /** Hay cuenta de Google enlazada en este perfil. */
  linked: boolean;
  onClose: () => void;
  onConfirm: (days: DateKey[], toCalendar: boolean) => void;
}

/** Cuántas semanas alcanza el patrón. Un trimestre escolar son doce. */
const WEEK_CHOICES = [1, 2, 4, 8, 12];

export function SpreadTasks({ tasks, all, linked, onClose, onConfirm }: SpreadTasksProps) {
  const today = todayKey();
  /** Desde dónde cuentan los atajos: el día de lo que se copia, o hoy. */
  const base = tasks[0]?.due ?? today;
  const single = tasks.length === 1 ? tasks[0] : null;

  const [selected, setSelected] = useState<Set<DateKey>>(new Set());
  const [month, setMonth] = useState<DateKey>(base);
  const [weekdays, setWeekdays] = useState<number[]>([weekdayIndex(base)]);
  const [weeks, setWeeks] = useState(4);
  const [toCalendar, setToCalendar] = useState(linked);
  /** Ya se ha picado «copiar»: evita que un doble toque cree las copias dos veces. */
  const [sending, setSending] = useState(false);

  const load = useMemo(() => loadByDay(all), [all]);

  /**
   * Días que ya tienen un recado con ese mismo texto. Sólo se puede decir de
   * una tarea suelta: copiando el día entero, cada una tendría los suyos.
   */
  const taken = useMemo(
    () => (single ? daysWithTitle(all, single.title) : undefined),
    [all, single],
  );

  const add = (days: DateKey[]) =>
    setSelected((current) => {
      const next = new Set(current);
      // Lo pasado no se marca: el atajo se cuenta desde el día de la tarea,
      // que bien puede ser uno de la semana pasada.
      for (const day of days) if (day >= today) next.add(day);
      return next;
    });

  const toggle = (day: DateKey) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  const toggleWeekday = (index: number) =>
    setWeekdays((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );

  const days = useMemo(() => [...selected].sort(), [selected]);

  /** Copias que saldrán: una tarea no se copia sobre su propio día. */
  const copies = useMemo(
    () => tasks.reduce((total, task) => total + days.filter((day) => day !== task.due).length, 0),
    [days, tasks],
  );

  /** Días elegidos que ya tienen ese mismo recado, para poder avisarlo. */
  const repeated = taken ? days.filter((day) => taken.has(day)).length : 0;

  const shortcuts: Array<{ id: string; label: string; days: () => DateKey[] }> = [
    { id: 'manana', label: 'Mañana', days: () => [addDays(today, 1)] },
    { id: 'semana', label: 'Próximos 7 días', days: () => nextDays(base, 7) },
    {
      id: 'mismo',
      label: `Cada ${WEEKDAY_LONG[weekdayIndex(base)]}`,
      days: () => weekdayRun(base, [weekdayIndex(base)], weeks),
    },
    { id: 'laborables', label: 'De lunes a viernes', days: () => weekdayRun(base, [0, 1, 2, 3, 4], weeks) },
    { id: 'finde', label: 'Fines de semana', days: () => weekdayRun(base, [5, 6], weeks) },
  ];

  const repeating = tasks.some((task) => task.repeat !== 'none');

  return (
    <Modal title="⧉ Copiar a varios días" onClose={onClose} size="lg">
      <div className="space-y-4 text-sm">
        {/* Qué se copia */}
        <section className="rounded-2xl border p-3 hairline surf-2">
          {single ? (
            <p className="font-bold leading-snug t-1">
              <span aria-hidden>{kindInfo(single.kind).icon}</span> {single.title}
            </p>
          ) : (
            <p className="font-bold leading-snug t-1">
              Las {tasks.length} tareas de {formatShort(base)}
            </p>
          )}

          <p className="mt-1 text-xs t-3">
            Sale de {capitalize(formatLong(base))}
            {single?.time ? ` · ${single.time}` : ''}. Las copias llevan la misma hora, el mismo
            aviso y el mismo detalle.
          </p>

          {repeating && (
            <p className="mt-1.5 text-[11px] leading-relaxed t-3">
              🔁 La original se repite ({REPEAT_LABELS[tasks[0].repeat].toLowerCase()}); las copias
              no. Cada día marcado es un recado suyo, que se tacha por su cuenta.
            </p>
          )}
        </section>

        {/* Atajos */}
        <section>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide t-3">Atajos</p>
          <div className="flex flex-wrap gap-1.5">
            {shortcuts.map((shortcut) => (
              <button
                key={shortcut.id}
                type="button"
                onClick={() => add(shortcut.days())}
                className="btn min-h-[2.25rem] border px-2.5 py-1.5 text-xs font-semibold
                           hairline surf-1 t-2 hover-soft"
              >
                ➕ {shortcut.label}
              </button>
            ))}
          </div>
        </section>

        {/* Patrón a medida */}
        <section className="rounded-2xl border p-3 hairline surf-1">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide t-3">
            O elige los días de la semana
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            {WEEKDAY_LABELS.map((letter, index) => {
              const active = weekdays.includes(index);
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => toggleWeekday(index)}
                  aria-pressed={active}
                  aria-label={WEEKDAY_LONG[index]}
                  className={`btn h-9 w-9 border p-0 text-xs font-bold
                    ${active ? 'bg-accent-soft border-accent t-1' : 'hairline surf-2 t-2 hover-soft'}`}
                >
                  {letter}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold t-2">
              Durante
              <select
                value={weeks}
                onChange={(event) => setWeeks(Number(event.target.value))}
                aria-label="Cuántas semanas"
                className="field min-h-[2.5rem] p-2"
              >
                {WEEK_CHOICES.map((option) => (
                  <option key={option} value={option}>
                    {option === 1 ? '1 semana' : `${option} semanas`}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              disabled={weekdays.length === 0}
              onClick={() => add(weekdayRun(base, weekdays, weeks))}
              className="btn-primary min-h-[2.5rem] px-3 py-1.5 text-xs"
            >
              ➕ Marcar esos días
            </button>
          </div>
        </section>

        {/* El calendario manda: lo marcado aquí es lo que se copia */}
        <section>
          <div className="mb-1.5 flex items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide t-3">Días marcados</p>
            {days.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="btn-ghost ml-auto px-2 py-1 text-[11px] t-3"
              >
                Quitar todos
              </button>
            )}
          </div>

          <MonthGrid
            month={month}
            onMonthChange={setMonth}
            onPick={toggle}
            selected={selected}
            load={load}
            taken={taken}
            min={today}
            label="Días a los que copiar"
          />

          <p className="mt-1.5 text-[11px] leading-relaxed t-3">
            Pica un día para marcarlo o quitarlo. Los puntos son lo que ya hay apuntado ese día;
            el ✓, que ese día ya tiene este mismo recado.
          </p>
        </section>

        {/* Al calendario, si hay cuenta */}
        {linked && (
          <label className="flex items-start gap-2.5 rounded-2xl border p-3 hairline surf-1">
            <input
              type="checkbox"
              checked={toCalendar}
              onChange={(event) => setToCalendar(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-current"
            />
            <span className="min-w-0 text-xs leading-relaxed t-2">
              <span className="block font-semibold t-1">Ponerlas también en Google Calendar</span>
              Se crea un evento por copia, con su aviso. Si son muchas, tardan un poco en salir
              todas.
            </span>
          </label>
        )}

        {/* Cuánto va a pasar, antes de que pase */}
        <div className="sticky bottom-0 -mx-1 rounded-2xl border p-3 hairline surf-raised">
          <p className="text-xs t-2" aria-live="polite">
            {copies === 0 ? (
              'Marca en el calendario los días a los que quieres copiarlo.'
            ) : (
              <>
                Se crearán <strong className="t-1">{copies}</strong>{' '}
                {copies === 1 ? 'tarea' : 'tareas'} en{' '}
                <strong className="t-1">{days.length}</strong> {days.length === 1 ? 'día' : 'días'}.
                {repeated > 0 && (
                  <span className="t-3">
                    {' '}
                    {repeated} de esos días ya tiene este recado y quedará repetido.
                  </span>
                )}
              </>
            )}
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={copies === 0 || sending}
              onClick={() => {
                setSending(true);
                onConfirm(days, toCalendar && linked);
              }}
              className="btn-primary px-3 py-2 text-xs"
            >
              {sending
                ? '⏳ Copiando…'
                : `⧉ Copiar a ${days.length} ${days.length === 1 ? 'día' : 'días'}`}
            </button>

            <button type="button" onClick={onClose} className="btn-ghost px-3 py-2 text-xs">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Los días, con su nombre entero: en los atajos y en los lectores de pantalla. */
const WEEKDAY_LONG = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
];
