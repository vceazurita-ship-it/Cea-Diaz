import {
  addDays,
  capitalize,
  formatShort,
  isToday,
  parseDateKey,
  startOfWeek,
  todayKey,
} from '@/lib/dates';
import type { DateKey, ProfileId, Task, TaskBucket, TaskKind, TaskRepeat } from '@/types';

/* =========================================================================
 *  Recados, citas y encargos de cada uno.
 *
 *  A diferencia de los hábitos —que son la misma casilla repetida cada día—
 *  una tarea es un hecho suelto con fecha propia: la revisión del dentista,
 *  la reunión del colegio, comprar leche. Por eso no vive dentro del
 *  registro diario sino en su propia colección, indexada por identificador.
 *
 *  Lo que la app calcula aquí es sólo *cuándo urge*: el orden y los montones
 *  en que se agrupa la lista. Todo lo demás lo escribe quien la crea.
 * ========================================================================= */

/* ------------------------------- Catálogo -------------------------------- */

export interface TaskKindInfo {
  id: TaskKind;
  label: string;
  icon: string;
  /** Color del evento en Google Calendar (identificador de su paleta). */
  colorId: string;
}

export const TASK_KINDS: TaskKindInfo[] = [
  { id: 'cita', label: 'Cita', icon: '📅', colorId: '9' },
  { id: 'colegio', label: 'Colegio', icon: '🎒', colorId: '5' },
  { id: 'compra', label: 'Compra', icon: '🛒', colorId: '2' },
  { id: 'casa', label: 'Casa', icon: '🏠', colorId: '10' },
  { id: 'salud', label: 'Salud', icon: '🩺', colorId: '11' },
  { id: 'trabajo', label: 'Trabajo', icon: '💼', colorId: '8' },
  { id: 'ocio', label: 'Ocio', icon: '🎈', colorId: '6' },
  { id: 'otro', label: 'Otro', icon: '📌', colorId: '1' },
];

const KINDS_BY_ID = new Map(TASK_KINDS.map((kind) => [kind.id, kind]));

export function kindInfo(kind: TaskKind): TaskKindInfo {
  return KINDS_BY_ID.get(kind) ?? TASK_KINDS[TASK_KINDS.length - 1];
}

export const REPEAT_LABELS: Record<TaskRepeat, string> = {
  none: 'No se repite',
  daily: 'Cada día',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
};

/**
 * Antelación del aviso, en minutos antes del comienzo del evento. Google los
 * cuenta así siempre, y en las tareas de todo el día el comienzo es la
 * medianoche de ese día: por eso «la víspera a las 18:00» son 360 minutos y
 * no hay forma de pedir un aviso *dentro* del propio día. De ahí que la
 * lista sea distinta según haya hora o no.
 */
export interface ReminderChoice {
  minutes: number;
  label: string;
}

export const TIMED_REMINDERS: ReminderChoice[] = [
  { minutes: 0, label: 'A la hora' },
  { minutes: 10, label: '10 min antes' },
  { minutes: 30, label: '30 min antes' },
  { minutes: 60, label: '1 hora antes' },
  { minutes: 24 * 60, label: '1 día antes' },
];

export const ALL_DAY_REMINDERS: ReminderChoice[] = [
  { minutes: 6 * 60, label: 'La víspera, por la tarde' },
  { minutes: 15 * 60, label: 'La víspera, por la mañana' },
  { minutes: 30 * 60, label: 'Dos días antes' },
];

export function remindersFor(hasTime: boolean): ReminderChoice[] {
  return hasTime ? TIMED_REMINDERS : ALL_DAY_REMINDERS;
}

/** Media hora antes de una cita con hora; la víspera si ocupa el día entero. */
export const DEFAULT_REMINDER = 30;
export const DEFAULT_ALL_DAY_REMINDER = 6 * 60;

/** Duración que se asume cuando hay hora pero nadie ha dicho cuánto dura. */
export const DEFAULT_DURATION = 60;

/* -------------------------------- Altas ---------------------------------- */

/** Lo que hace falta para crear una tarea; el resto lo pone la app. */
export interface TaskDraft {
  title: string;
  detail?: string;
  kind: TaskKind;
  due?: DateKey;
  time?: string;
  duration?: number;
  remindBefore?: number;
  repeat: TaskRepeat;
}

/**
 * Identificador propio y estable. No se puede derivar del contenido —dos
 * «comprar leche» del mismo día son dos recados distintos— así que se
 * combina el perfil, el momento del alta y un sufijo aleatorio, igual que
 * hacen las comidas.
 */
export function newTaskId(profileId: ProfileId): string {
  return `${profileId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Normaliza el borrador: lo que no aplica se cae, para no guardar basura. */
function tidy(draft: TaskDraft) {
  const time = draft.due ? draft.time : undefined;
  return {
    title: draft.title.trim(),
    detail: draft.detail?.trim() || undefined,
    kind: draft.kind,
    due: draft.due,
    // Una hora sin día no significa nada, y una duración sin hora tampoco.
    time,
    duration: time ? draft.duration : undefined,
    remindBefore: draft.due ? draft.remindBefore : undefined,
    repeat: draft.repeat,
  };
}

export function createTask(profileId: ProfileId, draft: TaskDraft): Task {
  const now = new Date().toISOString();
  return { id: newTaskId(profileId), profileId, ...tidy(draft), done: false, createdAt: now, updatedAt: now };
}

/** Aplica un borrador editado sobre la tarea que ya existía. */
export function editTask(task: Task, draft: TaskDraft): Task {
  return { ...task, ...tidy(draft), updatedAt: new Date().toISOString() };
}

/* ------------------------------ Repetición ------------------------------- */

/**
 * El siguiente día en que toca. Los meses se recortan al último día real,
 * de modo que un «cada mes» nacido un 31 cae en el 28 de febrero y no se
 * desliza al 3 de marzo.
 */
export function nextOccurrence(due: DateKey, repeat: TaskRepeat): DateKey | undefined {
  if (repeat === 'none') return undefined;
  if (repeat === 'daily') return addDays(due, 1);
  if (repeat === 'weekly') return addDays(due, 7);

  const [year, month, day] = due.split('-').map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const lastDay = new Date(nextYear, nextMonth, 0).getDate();
  const safeDay = Math.min(day, lastDay);

  return `${nextYear}-${`${nextMonth}`.padStart(2, '0')}-${`${safeDay}`.padStart(2, '0')}`;
}

/**
 * Marca una tarea como hecha. Las que se repiten no se cierran: saltan a su
 * próxima fecha y vuelven a estar pendientes, que es lo que se espera de
 * «sacar la basura» o «pagar el gimnasio».
 *
 * En Google esa repetición ya viaja como una serie, así que el salto no
 * exige tocar nada allí: se conserva el vínculo y se le pone al día la firma
 * con la fecha nueva. Sin eso, cada vez que se tachara la tarea el evento
 * parecería desfasado sin estarlo.
 */
export function completeTask(task: Task, done: boolean): Task {
  const now = new Date().toISOString();

  if (done && task.repeat !== 'none' && task.due) {
    const rolled: Task = {
      ...task,
      due: nextOccurrence(task.due, task.repeat),
      done: false,
      doneAt: undefined,
      updatedAt: now,
    };

    if (!task.calendar) return rolled;
    return { ...rolled, calendar: { ...task.calendar, signature: calendarSignature(rolled) } };
  }

  return { ...task, done, doneAt: done ? now : undefined, updatedAt: now };
}

/* ------------------------------ Calendario ------------------------------- */

/**
 * Firma de lo que Google necesita saber. Si no ha cambiado, el evento ya
 * creado sigue siendo correcto y no hace falta volver a escribirlo.
 */
export function calendarSignature(task: Task): string {
  return [
    task.title,
    task.detail ?? '',
    task.due ?? '',
    task.time ?? '',
    task.duration ?? '',
    task.remindBefore ?? '',
    task.repeat,
    task.kind,
  ].join('|');
}

/** `true` si el evento de Google se quedó atrás respecto a la tarea. */
export function calendarOutdated(task: Task): boolean {
  return Boolean(task.calendar) && task.calendar!.signature !== calendarSignature(task);
}

/** Sin fecha no hay evento posible: un recordatorio necesita un cuándo. */
export function canGoToCalendar(task: Task): boolean {
  return Boolean(task.due) && !task.done;
}

/**
 * Se apuntó para ir al calendario y sigue sin llegar. Es lo que la app
 * reintenta sola al volver a abrirse, y lo que distingue «no ha podido ser
 * todavía» de «esto nunca se quiso mandar» o «se quitó a mano».
 */
export function awaitingCalendar(task: Task): boolean {
  return Boolean(task.calendarPending) && canGoToCalendar(task);
}

/* -------------------------------- Orden ---------------------------------- */

export const BUCKET_LABELS: Record<TaskBucket, string> = {
  vencidas: 'Se pasaron',
  hoy: 'Hoy',
  manana: 'Mañana',
  semana: 'Esta semana',
  despues: 'Más adelante',
  sinFecha: 'Sin fecha',
  hechas: 'Hechas',
};

export const BUCKET_ICONS: Record<TaskBucket, string> = {
  vencidas: '⚠️',
  hoy: '📍',
  manana: '➡️',
  semana: '🗓️',
  despues: '🕰️',
  sinFecha: '💭',
  hechas: '✅',
};

/** En qué montón cae la tarea, mirado desde `today`. */
export function bucketOf(task: Task, today: DateKey = todayKey()): TaskBucket {
  if (task.done) return 'hechas';
  if (!task.due) return 'sinFecha';
  if (task.due < today) return 'vencidas';
  if (task.due === today) return 'hoy';
  if (task.due === addDays(today, 1)) return 'manana';
  if (task.due <= addDays(today, 7)) return 'semana';
  return 'despues';
}

/** Orden en que se pintan los montones. */
export const BUCKET_ORDER: TaskBucket[] = [
  'vencidas',
  'hoy',
  'manana',
  'semana',
  'despues',
  'sinFecha',
  'hechas',
];

/**
 * Dentro de un montón: primero por día, luego por hora y, a igualdad, por
 * orden de alta. Las de todo el día van antes que las de hora fija, porque
 * son las que hay que tener presentes desde que uno se levanta.
 */
function compare(a: Task, b: Task): number {
  if ((a.due ?? '') !== (b.due ?? '')) {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due.localeCompare(b.due);
  }
  if ((a.time ?? '') !== (b.time ?? '')) return (a.time ?? '').localeCompare(b.time ?? '');
  return a.createdAt.localeCompare(b.createdAt);
}

export interface TaskGroup {
  bucket: TaskBucket;
  label: string;
  icon: string;
  tasks: Task[];
}

/** Las tareas de un perfil, repartidas en montones y ya ordenadas. */
export function groupTasks(tasks: Task[], today: DateKey = todayKey()): TaskGroup[] {
  const piles = new Map<TaskBucket, Task[]>();

  for (const task of tasks) {
    const bucket = bucketOf(task, today);
    const pile = piles.get(bucket);
    if (pile) pile.push(task);
    else piles.set(bucket, [task]);
  }

  return BUCKET_ORDER.flatMap((bucket) => {
    const pile = piles.get(bucket);
    if (!pile || pile.length === 0) return [];

    // Lo hecho se enseña al revés: lo último que se tachó, arriba.
    pile.sort(bucket === 'hechas' ? (a, b) => compare(b, a) : compare);

    return [{ bucket, label: BUCKET_LABELS[bucket], icon: BUCKET_ICONS[bucket], tasks: pile }];
  });
}

/** Pendientes que reclaman atención hoy: las vencidas y las de la jornada. */
export function dueCount(tasks: Task[], today: DateKey = todayKey()): number {
  return tasks.filter((task) => !task.done && task.due && task.due <= today).length;
}

/* ------------------------------ Etiquetas -------------------------------- */

/** Cuándo toca, dicho como lo diría una persona. */
export function whenLabel(task: Task): string {
  if (!task.due) return 'Sin fecha';

  const today = todayKey();
  const day =
    task.due === today
      ? 'Hoy'
      : task.due === addDays(today, 1)
        ? 'Mañana'
        : task.due === addDays(today, -1)
          ? 'Ayer'
          : capitalize(formatShort(task.due));

  return task.time ? `${day} · ${task.time}` : day;
}

/** Cuántos días de retraso lleva, para poder decirlo en las vencidas. */
export function overdueLabel(task: Task, today: DateKey = todayKey()): string | null {
  if (task.done || !task.due || task.due >= today) return null;

  const days = Math.round(
    (parseDateKey(today).getTime() - parseDateKey(task.due).getTime()) / (24 * 60 * 60 * 1000),
  );

  if (days <= 0) return null;
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days < 30) return `hace ${Math.floor(days / 7)} semanas`;
  return 'hace más de un mes';
}

/** La antelación del aviso, dicha en corto. */
export function reminderLabel(minutes: number | undefined, hasTime: boolean): string | null {
  if (minutes === undefined) return null;
  const choice = remindersFor(hasTime).find((option) => option.minutes === minutes);
  return choice?.label ?? `${minutes} min antes`;
}

/** Para resaltar la fila de lo que toca hoy. */
export const isDueToday = (task: Task): boolean => Boolean(task.due && isToday(task.due));

/* --------------------------- Copias en varios días ------------------------ */

/**
 * La misma tarea, otro día. Es una copia suelta: identificador propio, sin
 * el vínculo con Google —el evento creado pertenece al día de origen— y sin
 * tachar, aunque la original ya lo estuviera.
 *
 * La repetición no viaja. Quien reparte «piscina» por cinco martes quiere
 * cinco recados concretos; conservar el «cada semana» de la original
 * convertiría esos cinco en cinco series abiertas y llenaría el calendario
 * de eventos que nadie ha pedido.
 */
export function copyTaskTo(task: Task, due: DateKey): Task {
  const now = new Date().toISOString();

  return {
    ...task,
    id: newTaskId(task.profileId),
    due,
    repeat: 'none',
    done: false,
    doneAt: undefined,
    calendar: undefined,
    calendarPending: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Reparte una tarea por los días pedidos. Se descarta su propio día —copiar
 * algo encima de sí mismo deja dos filas idénticas— y los repetidos.
 */
export function spreadTask(task: Task, days: DateKey[]): Task[] {
  const seen = new Set<DateKey>(task.due ? [task.due] : []);
  const copies: Task[] = [];

  for (const day of days) {
    if (seen.has(day)) continue;
    seen.add(day);
    copies.push(copyTaskTo(task, day));
  }

  return copies;
}

/** Mismo texto, sin distinguir mayúsculas ni espacios de sobra. */
function sameTitle(a: string, b: string): boolean {
  const tidy = (text: string) => text.trim().toLocaleLowerCase('es-ES').replace(/\s+/g, ' ');
  return tidy(a) === tidy(b);
}

/**
 * Los días en que ya hay una tarea con ese título. Sirve para marcarlos en
 * el calendario de la copia: repartir «piscina» por todos los martes del
 * mes cuando tres ya la tienen apuntada es la forma más fácil de acabar con
 * duplicados que luego hay que borrar a mano.
 */
export function daysWithTitle(tasks: Task[], title: string): Set<DateKey> {
  const days = new Set<DateKey>();
  for (const task of tasks) {
    if (task.due && sameTitle(task.title, title)) days.add(task.due);
  }
  return days;
}

/** Los `count` días siguientes a `from`, sin incluirlo. */
export function nextDays(from: DateKey, count: number): DateKey[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDays(from, index + 1));
}

/**
 * Los días de la semana pedidos (0 = lunes … 6 = domingo) a lo largo de
 * `weeks` semanas, contando desde la semana de `from`. Lo anterior a `from`
 * se queda fuera: nadie reparte recados hacia atrás.
 */
export function weekdayRun(from: DateKey, weekdays: number[], weeks: number): DateKey[] {
  if (weekdays.length === 0 || weeks <= 0) return [];

  const monday = startOfWeek(from);
  const days: DateKey[] = [];

  for (let week = 0; week < weeks; week += 1) {
    for (const weekday of [...weekdays].sort((a, b) => a - b)) {
      const day = addDays(monday, week * 7 + weekday);
      if (day >= from) days.push(day);
    }
  }

  return days;
}

/** Cuántas tareas caen cada día, para pintarlo en el calendario. */
export interface DayLoad {
  total: number;
  pending: number;
}

export function loadByDay(tasks: Task[]): Map<DateKey, DayLoad> {
  const load = new Map<DateKey, DayLoad>();

  for (const task of tasks) {
    if (!task.due) continue;
    const day = load.get(task.due) ?? { total: 0, pending: 0 };
    day.total += 1;
    if (!task.done) day.pending += 1;
    load.set(task.due, day);
  }

  return load;
}
