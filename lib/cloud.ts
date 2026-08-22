import { supabase } from '@/lib/supabase';
import type {
  DayAdvice,
  DayEntry,
  HabitDatabase,
  MealAnalysis,
  MealFood,
  MealAdvice as MealTweak,
  MetricValue,
  NextChallenge,
  ProfileId,
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
export type CloudTable = 'entries' | 'meals' | 'advice';

export const PHOTO_BUCKET = 'comidas';

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
  updated_at: string;
}

interface MealRow {
  id: string;
  owner: string;
  profile_id: string;
  day: string;
  moment: string;
  score: number;
  title: string;
  summary: string;
  foods: MealFood[];
  wins: string[];
  tweaks: MealTweak[];
  photo_path: string | null;
  created_at: string;
  updated_at: string;
}

interface AdviceRow {
  id: string;
  owner: string;
  profile_id: string;
  day: string;
  summary: string;
  tips: string[];
  challenge: NextChallenge | null;
  challenge_done: boolean;
  observations: string;
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
  updated_at: entry.updatedAt,
});

const fromEntryRow = (row: EntryRow): DayEntry => ({
  date: row.day,
  profileId: row.profile_id as ProfileId,
  values: row.metrics ?? {},
  note: row.note ?? undefined,
  updatedAt: row.updated_at,
});

const toMealRow = (meal: MealAnalysis, owner: string): MealRow => ({
  id: meal.id,
  owner,
  profile_id: meal.profileId,
  day: meal.date,
  moment: meal.moment,
  score: meal.nota,
  title: meal.titulo,
  summary: meal.resumen,
  foods: meal.alimentos,
  wins: meal.aciertos,
  tweaks: meal.ajustes,
  photo_path: meal.photoPath ?? null,
  created_at: meal.createdAt,
  updated_at: meal.updatedAt,
});

const fromMealRow = (row: MealRow): MealAnalysis => ({
  esComida: true,
  id: row.id,
  profileId: row.profile_id as ProfileId,
  date: row.day,
  moment: row.moment as MealAnalysis['moment'],
  nota: Number(row.score),
  titulo: row.title,
  resumen: row.summary,
  alimentos: row.foods ?? [],
  aciertos: row.wins ?? [],
  ajustes: row.tweaks ?? [],
  // `photoId` es la clave local; se conserva la del identificador para poder
  // reutilizar la miniatura ya guardada en este mismo móvil.
  photoId: row.id,
  photoPath: row.photo_path ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toAdviceRow = (advice: DayAdvice, owner: string): AdviceRow => ({
  id: advice.id,
  owner,
  profile_id: advice.profileId,
  day: advice.date,
  summary: advice.resumen,
  tips: advice.consejos,
  challenge: advice.reto ?? null,
  challenge_done: advice.retoCumplido ?? false,
  observations: advice.observaciones,
  created_at: advice.createdAt,
  updated_at: advice.updatedAt,
});

const fromAdviceRow = (row: AdviceRow): DayAdvice => ({
  id: row.id,
  profileId: row.profile_id as ProfileId,
  date: row.day,
  resumen: row.summary,
  consejos: row.tips ?? [],
  reto: row.challenge ?? undefined,
  retoCumplido: row.challenge_done,
  observaciones: row.observations,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/* ---------------------------------------------------------------------------
 * Bajada
 * ------------------------------------------------------------------------- */

export interface CloudSnapshot {
  entries: Record<string, DayEntry>;
  meals: Record<string, MealAnalysis>;
  advice: Record<string, DayAdvice>;
}

/** Se trae todo: una familia genera miles de filas, no millones. */
export async function pullAll(): Promise<CloudSnapshot> {
  const client = supabase();
  if (!client) throw new Error('La nube no está configurada.');

  const [entries, meals, advice] = await Promise.all([
    client.from('entries').select('*'),
    client.from('meals').select('*'),
    client.from('advice').select('*'),
  ]);

  const error = entries.error ?? meals.error ?? advice.error;
  if (error) throw new Error(error.message);

  const snapshot: CloudSnapshot = { entries: {}, meals: {}, advice: {} };

  for (const row of (entries.data ?? []) as EntryRow[]) {
    snapshot.entries[row.id] = fromEntryRow(row);
  }
  for (const row of (meals.data ?? []) as MealRow[]) {
    snapshot.meals[row.id] = fromMealRow(row);
  }
  for (const row of (advice.data ?? []) as AdviceRow[]) {
    snapshot.advice[row.id] = fromAdviceRow(row);
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

export async function pushMeals(meals: MealAnalysis[], owner: string): Promise<void> {
  await upsertAll('meals', meals.map((meal) => toMealRow(meal, owner)));
}

export async function pushAdvice(advice: DayAdvice[], owner: string): Promise<void> {
  await upsertAll('advice', advice.map((item) => toAdviceRow(item, owner)));
}

/** Propaga los borrados anotados como lápidas. */
export async function deleteRows(table: CloudTable, ids: string[]): Promise<void> {
  const client = supabase();
  if (!client || ids.length === 0) return;

  const { error } = await client.from(table).delete().in('id', ids);
  if (error) throw new Error(error.message);
}

/* ---------------------------------------------------------------------------
 * Fotos de las comidas
 * ------------------------------------------------------------------------- */

/**
 * Sube la miniatura y devuelve su ruta dentro del cubo. Devuelve `null` si
 * no hay nube o no hay sesión: la comida se guarda igual, sólo que la foto
 * se queda en este móvil.
 */
export async function uploadPhoto(mealId: string, dataUrl: string): Promise<string | null> {
  const client = supabase();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  const owner = data.session?.user.id;
  if (!owner) return null;

  const blob = await (await fetch(dataUrl)).blob();
  const path = `${owner}/${mealId}.jpg`;

  const { error } = await client.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

  if (error) return null;
  return path;
}

/** Descarga una miniatura de la nube como data URL, para poder cachearla. */
export async function downloadPhoto(path: string): Promise<string | null> {
  const client = supabase();
  if (!client) return null;

  const { data, error } = await client.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) return null;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(data);
  });
}

export async function deletePhotoObject(path: string): Promise<void> {
  const client = supabase();
  if (!client) return;
  await client.storage.from(PHOTO_BUCKET).remove([path]);
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
  const grouped: Record<CloudTable, string[]> = { entries: [], meals: [], advice: [] };

  for (const key of Object.keys(tombstones)) {
    const separator = key.indexOf(':');
    const table = key.slice(0, separator) as CloudTable;
    if (table in grouped) grouped[table].push(key.slice(separator + 1));
  }

  return grouped;
}

/** Base vacía con la forma que espera el resto de la app. */
export function emptySnapshot(): Pick<HabitDatabase, 'entries' | 'meals' | 'advice'> {
  return { entries: {}, meals: {}, advice: {} };
}
