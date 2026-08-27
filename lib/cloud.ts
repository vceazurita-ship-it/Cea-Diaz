import { supabase } from '@/lib/supabase';
import type {
  DayEntry,
  HabitDatabase,
  HouseSettings,
  Lineup,
  MetricValue,
  PlanBlock,
  ProfileId,
  Task,
  TaskCalendarLink,
  TaskKind,
  TaskRepeat,
  WeekPlan,
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

/**
 * Pone una fecha de Postgres en la misma forma que usa el navegador.
 *
 * Hace falta porque el mismo instante no se escribe igual en los dos sitios:
 * `toISOString()` termina en `Z` y siempre con tres decimales, mientras que
 * PostgREST devuelve `+00:00` y recorta los ceros sobrantes. Comparadas como
 * texto, dos escrituras idénticas parecían distintas: cada repaso daba por
 * cambiada toda la base de este móvil y la volvía a subir entera —miles de
 * filas cada tres cuartos de hora— sin que nadie hubiera tocado nada.
 *
 * Con todo escrito igual, comparar cadenas vuelve a ser comparar instantes,
 * que es de lo que vive la regla de «gana la escritura más reciente».
 */
function isoOf(value: string): string {
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? value : new Date(instant).toISOString();
}

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
    updatedAt: isoOf(row.updated_at),
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
  createdAt: isoOf(row.created_at),
  updatedAt: isoOf(row.updated_at),
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

  return ((data ?? []) as AppearanceRow[]).map((row) => ({
    ...row,
    updated_at: isoOf(row.updated_at),
  }));
}

/**
 * Sube el archivo de una ranura y anota la fila. Devuelve la ruta dentro del
 * cubo, o `null` si todavía no hay cuenta: eso no es un fallo, es que la
 * personalización se queda en este móvil hasta que alguien entre.
 *
 * Lo que sí es un fallo —el cubo sin crear, un permiso mal puesto, la red
 * caída— sale como excepción con lo que haya dicho la nube. Antes se
 * devolvía `null` también en esos casos, y una casa cuyas fotos no viajaban
 * no tenía manera de enterarse de por qué.
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
  if (uploadError) throw new Error(uploadError.message);

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
  if (error) throw new Error(error.message);

  return path;
}

/** Baja el archivo de una ranura. Si la nube se queja, se dice por qué. */
export async function downloadAppearance(path: string): Promise<Blob | null> {
  const client = supabase();
  if (!client) return null;

  const { data, error } = await client.storage.from(APPEARANCE_BUCKET).download(path);
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Quita la personalización de la nube: fila y archivo. */
export async function deleteAppearance(id: string, path: string): Promise<void> {
  const client = supabase();
  if (!client) return;

  await client.storage.from(APPEARANCE_BUCKET).remove([path]);
  await client.from('appearance').delete().eq('id', id);
}

/* ---------------------------------------------------------------------------
 * Ajustes de la casa
 *
 * El modo, las sintonías y el PIN. Una sola fila por cuenta, así que aquí no
 * hay mezcla por identificador: se compara la fecha y gana la última
 * elección, la haya hecho quien la haya hecho.
 *
 * Del PIN viaja la huella, nunca el número. Quien mire la tabla ve una sal y
 * un resumen, que no sirven para entrar.
 * ------------------------------------------------------------------------- */

interface SettingsRow {
  owner: string;
  theme: string;
  sound: boolean;
  pin_salt: string | null;
  pin_hash: string | null;
  pin_rounds: number | null;
  updated_at: string;
}

function fromSettingsRow(row: SettingsRow): HouseSettings {
  return {
    theme: row.theme as HouseSettings['theme'],
    sound: row.sound,
    pin:
      row.pin_salt && row.pin_hash && row.pin_rounds
        ? { salt: row.pin_salt, hash: row.pin_hash, rounds: row.pin_rounds }
        : null,
    updatedAt: isoOf(row.updated_at),
  };
}

/** Los ajustes de la cuenta, o `null` si nadie ha guardado ninguno todavía. */
export async function pullSettings(): Promise<HouseSettings | null> {
  const client = supabase();
  if (!client) return null;

  const { data, error } = await client.from('settings').select('*').maybeSingle();
  if (error) throw new Error(error.message);

  return data ? fromSettingsRow(data as SettingsRow) : null;
}

export async function pushSettings(settings: HouseSettings, owner: string): Promise<void> {
  const client = supabase();
  if (!client) return;

  const { error } = await client.from('settings').upsert({
    owner,
    theme: settings.theme,
    sound: settings.sound,
    pin_salt: settings.pin?.salt ?? null,
    pin_hash: settings.pin?.hash ?? null,
    pin_rounds: settings.pin?.rounds ?? null,
    updated_at: settings.updatedAt,
  });

  if (error) throw new Error(error.message);
}

/* ---------------------------------------------------------------------------
 * Campogramas
 *
 * Una fila por perfil que haya montado equipo. Como los ajustes, no pasan por
 * `db` —no son registros del día— y se reconcilian por fecha: gana la última
 * alineación guardada, la haya hecho el móvil que sea.
 * ------------------------------------------------------------------------- */

interface LineupRow {
  id: string;
  owner: string;
  profile_id: string;
  team_name: string;
  formation: string;
  eleven: Record<string, string> | null;
  bench: string[] | null;
  captain: string | null;
  updated_at: string;
}

/** Los equipos de la cuenta, indexados por perfil. */
export async function pullLineups(): Promise<Record<string, Lineup>> {
  const client = supabase();
  if (!client) return {};

  const { data, error } = await client.from('lineups').select('*');
  if (error) throw new Error(error.message);

  const out: Record<string, Lineup> = {};

  for (const row of (data ?? []) as LineupRow[]) {
    out[row.profile_id] = {
      teamName: row.team_name ?? '',
      formation: row.formation,
      eleven: row.eleven ?? {},
      bench: row.bench ?? [],
      captain: row.captain ?? undefined,
      updatedAt: isoOf(row.updated_at),
    };
  }

  return out;
}

export async function pushLineup(
  profileId: string,
  lineup: Lineup,
  owner: string,
): Promise<void> {
  const client = supabase();
  if (!client) return;

  const { error } = await client.from('lineups').upsert({
    id: `${owner}:${profileId}`,
    owner,
    profile_id: profileId,
    team_name: lineup.teamName,
    formation: lineup.formation,
    eleven: lineup.eleven,
    bench: lineup.bench,
    captain: lineup.captain ?? null,
    updated_at: lineup.updatedAt,
  });

  if (error) throw new Error(error.message);
}

/* ---------------------------------------------------------------------------
 * Agendas semanales
 *
 * Una fila por perfil que tenga semana montada. Como los campogramas, no
 * pasan por `db` —no son registros del día, sino la rutina que se ha decidido—
 * y se reconcilian por fecha: gana la última agenda guardada. Es lo que hace
 * que María pueda mover el entreno del jueves desde su móvil y Víctor lo vea
 * movido en el suyo.
 * ------------------------------------------------------------------------- */

interface PlanRow {
  id: string;
  owner: string;
  profile_id: string;
  blocks: PlanBlock[] | null;
  updated_at: string;
}

/** Las agendas de la cuenta, indexadas por perfil. */
export async function pullPlans(): Promise<Record<string, WeekPlan>> {
  const client = supabase();
  if (!client) return {};

  const { data, error } = await client.from('agendas').select('*');
  if (error) throw new Error(error.message);

  const out: Record<string, WeekPlan> = {};

  for (const row of (data ?? []) as PlanRow[]) {
    out[row.profile_id] = {
      blocks: row.blocks ?? [],
      updatedAt: isoOf(row.updated_at),
    };
  }

  return out;
}

export async function pushPlan(
  profileId: string,
  plan: WeekPlan,
  owner: string,
): Promise<void> {
  const client = supabase();
  if (!client) return;

  const { error } = await client.from('agendas').upsert({
    id: `${owner}:${profileId}`,
    owner,
    profile_id: profileId,
    blocks: plan.blocks,
    updated_at: plan.updatedAt,
  });

  if (error) throw new Error(error.message);
}
