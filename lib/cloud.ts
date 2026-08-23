import { supabase } from '@/lib/supabase';
import type {
  DayEntry,
  HabitDatabase,
  MetricValue,
  ProfileId,
  Task,
  TaskCalendarLink,
  TaskKind,
  TaskRepeat,
} from '@/types';

/* =========================================================================
 *  Sincronización con Supabase.
 *
 *  El navegador manda: la app escribe primero en local y sigue funcionando
 *  sin cobertura. Esta capa se limita a subir lo que ha cambiado y a bajar
 *  lo que hayan escrito los demás móviles.
 *
 *  Conflictos: gana la escritura más reciente (`updatedAt`). Para una casa,
 *  donde dos personas casi nunca editan el mismo día del mismo perfil a la
 *  vez, es la regla más simple que no pierde datos de forma sorprendente.
 *
 *  Borrados: se anotan como lápidas locales y se propagan en la siguiente
 *  sincronización; hasta entonces, la fila borrada no se vuelve a bajar.
 * ========================================================================= */

/** Tablas que se sincronizan; el prefijo también nombra las lápidas. */
export type CloudTable = 'entries' | 'tasks';

/* ---------------------------------------------------------------------------
 * Filas tal y como viven en Postgres
 * ------------------------------------------------------------------------- */

interface EntryRow {
  id: string;
  owner: string;
  profile_id: string;
  day: string;
  metrics: Record<string, MetricValue>;
  note: string | null;
  /** Notas por categoría y del panel de retos. */
  notes: Record<string, string> | null;
  updated_at: string;
}

interface TaskRow {
  id: string;
  owner: string;
  profile_id: string;
  title: string;
  detail: string | null;
  kind: string;
  /** Día en que toca; `null` en las tareas sin fecha. */
  due_day: string | null;
  /** Hora `HH:MM`; `null` si es de todo el día. */
  due_time: string | null;
  duration: number | null;
  remind_before: number | null;
  repeat_rule: string;
  done: boolean;
  done_at: string | null;
  /** El evento espejo en Google Calendar, si la tarea ya viajó. */
  calendar: TaskCalendarLink | null;
  /** Debía viajar y no llegó; se reintenta al abrir la sección. */
  calendar_pending: boolean;
  created_at: string;
  updated_at: string;
}

/* ---------------------------------------------------------------------------
 * Traducción entre el modelo local y las filas
 * ------------------------------------------------------------------------- */

const toEntryRow = (entry: DayEntry, owner: string): EntryRow => ({
  id: `${entry.profileId}:${entry.date}`,
  owner,
  profile_id: entry.profileId,
  day: entry.date,
  metrics: entry.values,
  note: entry.note ?? null,
  notes: entry.notes ?? {},
  updated_at: entry.updatedAt,
});

const fromEntryRow = (row: EntryRow): DayEntry => {
  const notes = row.notes ?? {};
  return {
    date: row.day,
    profileId: row.profile_id as ProfileId,
    values: row.metrics ?? {},
    note: row.note ?? undefined,
    // Sin notas se deja el campo fuera, como cuando el registro nace aquí.
    notes: Object.keys(notes).length > 0 ? notes : undefined,
    updatedAt: row.updated_at,
  };
};

const toTaskRow = (task: Task, owner: string): TaskRow => ({
  id: task.id,
  owner,
  profile_id: task.profileId,
  title: task.title,
  detail: task.detail ?? null,
  kind: task.kind,
  due_day: task.due ?? null,
  due_time: task.time ?? null,
  duration: task.duration ?? null,
  remind_before: task.remindBefore ?? null,
  repeat_rule: task.repeat,
  done: task.done,
  done_at: task.doneAt ?? null,
  calendar: task.calendar ?? null,
  calendar_pending: task.calendarPending ?? false,
  created_at: task.createdAt,
  updated_at: task.updatedAt,
});

const fromTaskRow = (row: TaskRow): Task => ({
  id: row.id,
  profileId: row.profile_id as ProfileId,
  title: row.title,
  detail: row.detail || undefined,
  kind: row.kind as TaskKind,
  due: row.due_day ?? undefined,
  // Postgres devuelve `time` como `HH:MM:SS`; a la app le basta con la hora.
  time: row.due_time ? row.due_time.slice(0, 5) : undefined,
  duration: row.duration ?? undefined,
  remindBefore: row.remind_before ?? undefined,
  repeat: row.repeat_rule as TaskRepeat,
  done: row.done,
  doneAt: row.done_at ?? undefined,
  calendar: row.calendar ?? undefined,
  calendarPending: row.calendar_pending === true ? true : undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/* ---------------------------------------------------------------------------
 * Bajada
 * ------------------------------------------------------------------------- */

export interface CloudSnapshot {
  entries: Record<string, DayEntry>;
  tasks: Record<string, Task>;
}

/** Se trae todo: una familia genera miles de filas, no millones. */
export async function pullAll(): Promise<CloudSnapshot> {
  const client = supabase();
  if (!client) throw new Error('La nube no está configurada.');

  const [entries, tasks] = await Promise.all([
    client.from('entries').select('*'),
    client.from('tasks').select('*'),
  ]);

  const error = entries.error ?? tasks.error;
  if (error) throw new Error(error.message);

  const snapshot: CloudSnapshot = { entries: {}, tasks: {} };

  for (const row of (entries.data ?? []) as EntryRow[]) {
    snapshot.entries[row.id] = fromEntryRow(row);
  }
  for (const row of (tasks.data ?? []) as TaskRow[]) {
    snapshot.tasks[row.id] = fromTaskRow(row);
  }

  return snapshot;
}

/* ---------------------------------------------------------------------------
 * Subida
 * ------------------------------------------------------------------------- */

/** Sube en tandas: `upsert` masivo con miles de filas puede pasarse de tamaño. */
async function upsertAll(table: CloudTable, rows: object[]): Promise<void> {
  const client = supabase();
  if (!client || rows.length === 0) return;

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await client.from(table).upsert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
  }
}

export async function pushEntries(entries: DayEntry[], owner: string): Promise<void> {
  await upsertAll('entries', entries.map((entry) => toEntryRow(entry, owner)));
}

export async function pushTasks(tasks: Task[], owner: string): Promise<void> {
  await upsertAll('tasks', tasks.map((task) => toTaskRow(task, owner)));
}

/** Propaga los borrados anotados como lápidas. */
export async function deleteRows(table: CloudTable, ids: string[]): Promise<void> {
  const client = supabase();
  if (!client || ids.length === 0) return;

  const { error } = await client.from(table).delete().in('id', ids);
  if (error) throw new Error(error.message);
}

/* ---------------------------------------------------------------------------
 * Mezcla
 * ------------------------------------------------------------------------- */

interface Versioned {
  updatedAt: string;
}

/**
 * Mezcla lo local con lo bajado: gana la versión más reciente y se descarta
 * lo que aquí ya se había borrado (mientras la lápida siga pendiente).
 */
export function mergeById<T extends Versioned>(
  table: CloudTable,
  local: Record<string, T>,
  remote: Record<string, T>,
  tombstones: Record<string, string>,
): Record<string, T> {
  const merged: Record<string, T> = { ...local };

  for (const [id, row] of Object.entries(remote)) {
    if (tombstones[`${table}:${id}`]) continue;

    const mine = merged[id];
    if (!mine || row.updatedAt > mine.updatedAt) merged[id] = row;
  }

  return merged;
}

/** Filas locales cuya versión no coincide con la última sincronizada. */
export function dirtyRows<T extends Versioned>(
  local: Record<string, T>,
  synced: Record<string, string>,
): T[] {
  return Object.entries(local)
    .filter(([id, row]) => synced[id] !== row.updatedAt)
    .map(([, row]) => row);
}

/** Índice `id → updatedAt` de lo que ya está en la nube. */
export function versionIndex<T extends Versioned>(rows: Record<string, T>): Record<string, string> {
  return Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, row.updatedAt]));
}

/** Reparte las lápidas por tabla. */
export function tombstonesByTable(tombstones: Record<string, string>): Record<CloudTable, string[]> {
  const grouped: Record<CloudTable, string[]> = { entries: [], tasks: [] };

  for (const key of Object.keys(tombstones)) {
    const separator = key.indexOf(':');
    const table = key.slice(0, separator) as CloudTable;
    if (table in grouped) grouped[table].push(key.slice(separator + 1));
  }

  return grouped;
}

/** Base vacía con la forma que espera el resto de la app. */
export function emptySnapshot(): Pick<HabitDatabase, 'entries' | 'tasks'> {
  return { entries: {}, tasks: {} };
}

/* ---------------------------------------------------------------------------
 * Aspecto de los perfiles
 *
 * Las fotos y la sintonía que sustituyen a las de fábrica. A diferencia de
 * los hábitos, aquí no hay lápidas: la fila existe mientras exista la
 * personalización, así que su ausencia ya significa «esto se ha quitado».
 * ------------------------------------------------------------------------- */

export const APPEARANCE_BUCKET = 'aspecto';

export interface AppearanceRow {
  id: string;
  owner: string;
  profile_id: string;
  slot: string;
  path: string;
  name: string;
  mime: string;
  size: number;
  updated_at: string;
}

/** Todo el aspecto personalizado de la cuenta. Vacío si no hay nube o sesión. */
export async function pullAppearance(): Promise<AppearanceRow[]> {
  const client = supabase();
  if (!client) return [];

  const { data, error } = await client.from('appearance').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as AppearanceRow[];
}

/**
 * Sube el archivo de una ranura y anota la fila. Devuelve la ruta dentro del
 * cubo, o `null` si no hay sesión: la personalización se queda en este móvil
 * y se volverá a intentar en la próxima sincronización.
 */
export async function pushAppearance(
  profileId: string,
  slot: string,
  blob: Blob,
  meta: { name: string; savedAt: string },
): Promise<string | null> {
  const client = supabase();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  const owner = data.session?.user.id;
  if (!owner) return null;

  const id = `${profileId}:${slot}`;
  // La extensión se saca del tipo real, no del nombre original: hay móviles
  // que entregan la foto sin extensión ninguna.
  const extension = blob.type.split('/')[1]?.split(';')[0] || 'bin';
  const path = `${owner}/${profileId}-${slot}.${extension}`;

  const { error: uploadError } = await client.storage
    .from(APPEARANCE_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: true });
  if (uploadError) return null;

  const { error } = await client.from('appearance').upsert({
    id,
    owner,
    profile_id: profileId,
    slot,
    path,
    name: meta.name,
    mime: blob.type,
    size: blob.size,
    updated_at: meta.savedAt,
  });
  if (error) return null;

  return path;
}

export async function downloadAppearance(path: string): Promise<Blob | null> {
  const client = supabase();
  if (!client) return null;

  const { data, error } = await client.storage.from(APPEARANCE_BUCKET).download(path);
  if (error || !data) return null;
  return data;
}

/** Quita la personalización de la nube: fila y archivo. */
export async function deleteAppearance(id: string, path: string): Promise<void> {
  const client = supabase();
  if (!client) return;

  await client.storage.from(APPEARANCE_BUCKET).remove([path]);
  await client.from('appearance').delete().eq('id', id);
}
