import { hashSeed } from '@/lib/challenges';
import { entryKey } from '@/lib/storage';
import { sesionVigente, type SesionTecnificacion } from '@/lib/tecnificacion';
import { barajar, makeRand } from '@/lib/temario';
import type { DateKey, DayEntry, GameQuestion, ProfileId } from '@/types';

/* =========================================================================
 *  El reto de fútbol del día: cinco preguntas de la última tecnificación.
 *
 *  Todos los días, como el del cole. Con cuatro bien, la tanda de penaltis
 *  de ese día empieza con un rayo de energía más (⚡): lo que se entiende de
 *  la sesión se nota en el campo, y aquí también. Se juega una vez y lo
 *  contestado se queda, en una línea de las notas del día.
 * ========================================================================= */

export const FUTBOL_NOTE_KEY = 'futbol';
export const FUTBOL_QUESTIONS = 5;
export const FUTBOL_PASS = 4;
/** Lo que da el reto superado en la tanda de ese día. */
export const FUTBOL_ENERGIA = 1;

export interface RetoFutbol {
  sesion: SesionTecnificacion;
  questions: GameQuestion[];
}

export function buildRetoFutbol(profileId: ProfileId, date: DateKey, vuelta = 0): RetoFutbol | null {
  const sesion = sesionVigente(date);
  if (!sesion) return null;
  const seed = hashSeed(`${profileId}:futbol:${date}${vuelta ? `:practica${vuelta}` : ''}`);
  const rand = makeRand(seed);
  const elegidas = barajar(sesion.preguntas, rand).slice(0, FUTBOL_QUESTIONS);
  const questions = elegidas.map((q, i): GameQuestion => {
    const r = makeRand(seed + i * 104729);
    const options = barajar([q.ok, ...q.no.filter((x) => x !== q.ok).slice(0, 3)], r).map((text, k) => ({ id: 'abcd'[k], text }));
    return {
      id: `futbol-${date}-${i}`,
      prompt: q.prompt,
      options,
      answer: options.find((o) => o.text === q.ok)!.id,
      explain: q.why,
      icon: q.icon,
      visual: q.visual,
    };
  });
  return { sesion, questions };
}

/* ---------------------------------------------------------------------------
 * Lo que se guarda: `sesión|aciertos|contestadas|total|momento`
 * ------------------------------------------------------------------------- */

export interface FutbolResult {
  sesion: string;
  correct: number;
  answered: number;
  total: number;
  at: string;
}

export function encodeFutbolResult(r: FutbolResult): string {
  return [r.sesion, r.correct, r.answered, r.total, r.at].join('|');
}

export function parseFutbolResult(text: string | undefined | null): FutbolResult | null {
  if (!text) return null;
  const [sesion, correct, answered, total, at] = text.split('|');
  const n = [correct, answered, total].map(Number);
  if (!sesion || n.some((v) => !Number.isFinite(v)) || n[2] <= 0) return null;
  return { sesion, correct: n[0], answered: n[1], total: n[2], at: at ?? '' };
}

export function futbolResultFor(entries: Record<string, DayEntry>, profileId: ProfileId, date: DateKey): FutbolResult | null {
  const r = parseFutbolResult(entries[entryKey(profileId, date)]?.notes?.[FUTBOL_NOTE_KEY]);
  // Si ese día tocaba otra sesión, lo anotado es de preguntas que ya no están.
  return r && r.sesion === sesionVigente(date)?.id ? r : null;
}

export function futbolSuperado(r: FutbolResult | null): boolean {
  return Boolean(r && r.answered >= r.total && r.correct >= FUTBOL_PASS);
}

/** La energía de más que lleva la tanda de ese día. */
export function energiaDelFutbol(entries: Record<string, DayEntry>, profileId: ProfileId, date: DateKey): number {
  return futbolSuperado(futbolResultFor(entries, profileId, date)) ? FUTBOL_ENERGIA : 0;
}
