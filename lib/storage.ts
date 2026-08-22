import type { DateKey, HabitDatabase, ProfileId } from '@/types';

/**
 * Persistencia local (localStorage). La app es totalmente autónoma: no
 * necesita backend, lo que permite desplegarla en Vercel como sitio estático.
 * Para sincronizar entre dispositivos bastaría con sustituir estas dos
 * funciones por llamadas a una API.
 */

export const STORAGE_KEY = 'habitos-familia:v1';
export const PIN_STORAGE_KEY = 'habitos-familia:pin';
/**
 * v2 añadió `meals`, v3 `advice`, v4 las lápidas de la nube y v5 las notas
 * por categoría. Todas las subidas son aditivas: lo guardado con una versión
 * anterior se lee tal cual y los campos nuevos aparecen vacíos.
 */
export const DB_VERSION = 5;

export function emptyDatabase(): HabitDatabase {
  return { version: DB_VERSION, entries: {}, meals: {}, advice: {}, tombstones: {} };
}

export function entryKey(profileId: ProfileId, date: DateKey): string {
  return `${profileId}:${date}`;
}

export function loadDatabase(): HabitDatabase {
  if (typeof window === 'undefined') return emptyDatabase();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDatabase();

    const parsed = JSON.parse(raw) as Partial<HabitDatabase>;
    if (!parsed || typeof parsed !== 'object' || !parsed.entries) return emptyDatabase();

    return {
      version: parsed.version ?? DB_VERSION,
      entries: parsed.entries,
      meals: parsed.meals ?? {},
      advice: parsed.advice ?? {},
      tombstones: parsed.tombstones ?? {},
    };
  } catch {
    // Datos corruptos: se empieza de cero en lugar de romper la app.
    return emptyDatabase();
  }
}

/**
 * Escribe la base en el navegador. Devuelve `false` si no ha podido: cuota
 * llena, modo privado o almacenamiento bloqueado. Quien llama debe contarlo,
 * porque un guardado que falla en silencio es peor que uno que falla alto.
 */
export function saveDatabase(db: HabitDatabase): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

export function clearDatabase(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/* --------------------------- PIN del módulo privado ----------------------- */

export const DEFAULT_PIN = '2468';

export function loadPin(): string {
  if (typeof window === 'undefined') return DEFAULT_PIN;
  return window.localStorage.getItem(PIN_STORAGE_KEY) ?? DEFAULT_PIN;
}

export function savePin(pin: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PIN_STORAGE_KEY, pin);
}
