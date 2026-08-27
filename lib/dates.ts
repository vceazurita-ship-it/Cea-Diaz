import type { DateKey } from '@/types';

/* Utilidades de fecha en horario local, sin dependencias externas. */

export function toDateKey(date: Date): DateKey {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): DateKey {
  return toDateKey(new Date());
}

export function addDays(key: DateKey, amount: number): DateKey {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function isFuture(key: DateKey): boolean {
  return key > todayKey();
}

export function isToday(key: DateKey): boolean {
  return key === todayKey();
}

/** Lunes de la semana a la que pertenece `key`. */
export function startOfWeek(key: DateKey): DateKey {
  const date = parseDateKey(key);
  const day = (date.getDay() + 6) % 7; // 0 = lunes
  date.setDate(date.getDate() - day);
  return toDateKey(date);
}

/** Los 7 días (lunes → domingo) de la semana de `key`. */
export function weekKeys(key: DateKey): DateKey[] {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Todos los días del mes al que pertenece `key`. */
export function monthKeys(key: DateKey): DateKey[] {
  const date = parseDateKey(key);
  const year = date.getFullYear();
  const month = date.getMonth();
  const total = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: total }, (_, i) => toDateKey(new Date(year, month, i + 1)));
}

/** Posición (0 = lunes … 6 = domingo) del día dentro de la semana. */
export function weekdayIndex(key: DateKey): number {
  return (parseDateKey(key).getDay() + 6) % 7;
}

export const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const longFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const shortFormatter = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
});

const monthFormatter = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric',
});

export function formatLong(key: DateKey): string {
  return longFormatter.format(parseDateKey(key));
}

export function formatShort(key: DateKey): string {
  return shortFormatter.format(parseDateKey(key));
}

export function formatMonth(key: DateKey): string {
  return monthFormatter.format(parseDateKey(key));
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Etiqueta amable para la cabecera de la vista diaria. */
export function friendlyDateLabel(key: DateKey): string {
  if (isToday(key)) return 'Hoy';
  if (key === addDays(todayKey(), -1)) return 'Ayer';
  if (key === addDays(todayKey(), 1)) return 'Mañana';
  return capitalize(formatLong(key));
}

/** Primer día del mes desplazado `amount` meses respecto al de `key`. */
export function addMonths(key: DateKey, amount: number): DateKey {
  const date = parseDateKey(key);
  return toDateKey(new Date(date.getFullYear(), date.getMonth() + amount, 1));
}
