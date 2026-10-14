import { addDays } from '@/lib/dates';
import { entryKey } from '@/lib/storage';
import type { DateKey, DayEntry, ProfileId } from '@/types';

/**
 * Días que se quedaron sin apuntar.
 *
 * El registro se hace de noche, deprisa y de memoria, y lo que se salta un día
 * ya no se recupera: a la semana nadie se acuerda de si hubo fruta el martes.
 * Por eso se avisa pronto —ayer, anteayer— y sólo a quien registra de
 * verdad: a un perfil que lleva semanas parado no se le reprocha cada día
 * suelto, se le dice desde cuándo está parado, que es lo que sirve.
 */

/** Cuántos días atrás se buscan huecos. Más allá ya no se recuerda bien. */
export const VENTANA_HUECOS = 6;
/** Sin registros en estos días, el perfil se da por parado y no se le piden huecos. */
const ACTIVO_DIAS = 14;

function apuntado(entry: DayEntry | undefined): boolean {
  return !!entry && Object.keys(entry.values ?? {}).length > 0;
}

/** El último día con algo apuntado, hoy incluido; `null` si nunca hubo nada. */
export function ultimoRegistro(
  entries: Record<string, DayEntry>,
  profileId: ProfileId,
  today: DateKey,
): DateKey | null {
  let last: DateKey | null = null;
  const prefix = `${profileId}:`;
  for (const [key, entry] of Object.entries(entries)) {
    if (!key.startsWith(prefix) || !apuntado(entry)) continue;
    const day = key.slice(prefix.length);
    if (day <= today && (!last || day > last)) last = day;
  }
  return last;
}

/**
 * Los días recientes sin nada apuntado, del más cercano al más lejano. Vacío
 * si el perfil no está en uso, y nunca anteriores a su primer registro de
 * la ventana: quien empezó el jueves no tiene hueco el lunes.
 */
export function diasSinApuntar(
  entries: Record<string, DayEntry>,
  profileId: ProfileId,
  today: DateKey,
): DateKey[] {
  const last = ultimoRegistro(entries, profileId, today);
  if (!last || last < addDays(today, -ACTIVO_DIAS)) return [];

  const desde = addDays(today, -ACTIVO_DIAS);
  let first: DateKey | null = null;
  for (let day = desde; day < today; day = addDays(day, 1)) {
    if (apuntado(entries[entryKey(profileId, day)])) {
      first = day;
      break;
    }
  }
  if (!first) return [];

  const out: DateKey[] = [];
  for (let back = 1; back <= VENTANA_HUECOS; back += 1) {
    const day = addDays(today, -back);
    if (day < first) break;
    if (!apuntado(entries[entryKey(profileId, day)])) out.push(day);
  }
  return out;
}

/** Días enteros entre dos fechas. */
export function diasEntre(from: DateKey, to: DateKey): number {
  return Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 864e5);
}
