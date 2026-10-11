import type { Examen } from '@/lib/examenes';
import { entryKey } from '@/lib/storage';
import { TEMARIO, type Asignatura, type Curso, type Tema } from '@/lib/temario';
import type { DateKey, DayEntry, ProfileId } from '@/types';

/* =========================================================================
 *  Qué temas han visto ya en clase, dicho desde casa.
 *
 *  El temario lleva una fecha estimada de cuándo se da cada tema, pero el
 *  cole va a su ritmo: a veces se adelanta, a veces un tema se queda en el
 *  tintero. Aquí se corrige a mano, por asignatura: un tema marcado como
 *  «visto» entra en los retos aunque su fecha no haya llegado, y uno
 *  marcado como «aún no» se queda fuera aunque haya pasado —también de los
 *  exámenes—. Lo que no se marca sigue la fecha del temario.
 *
 *  Se guarda como una nota más del niño (clave `temas`, en el primer día del
 *  trimestre), que es el camino que ya sincroniza: lo que se marque en el
 *  móvil de uno le aparece al crío en su tableta.
 * ========================================================================= */

export const TEMAS_NOTE_KEY = 'temas';

/** El día del que cuelga la nota: el primero del trimestre. */
export const TEMAS_NOTE_DATE: DateKey = '2026-09-07';

export type Marca = 'si' | 'no';

/** Tema → marca. Lo que no está sigue la fecha del temario. */
export type AjusteTemas = Record<string, Marca>;

export function parseAjuste(text: string | undefined | null): AjusteTemas {
  const out: AjusteTemas = {};
  for (const trozo of (text ?? '').split(',')) {
    const [id, marca] = trozo.trim().split(':');
    if (id && (marca === 'si' || marca === 'no') && TEMARIO.some((t) => t.id === id)) out[id] = marca;
  }
  return out;
}

export function encodeAjuste(ajuste: AjusteTemas): string {
  return Object.entries(ajuste)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, marca]) => `${id}:${marca}`)
    .join(',');
}

export function ajusteDe(entries: Record<string, DayEntry>, profileId: ProfileId): AjusteTemas {
  return parseAjuste(entries[entryKey(profileId, TEMAS_NOTE_DATE)]?.notes?.[TEMAS_NOTE_KEY]);
}

/** Si un tema cuenta como visto ese día: manda la marca; si no hay, la fecha. */
export function estaVisto(tema: Tema, date: DateKey, ajuste: AjusteTemas): boolean {
  const marca = ajuste[tema.id];
  if (marca === 'si') return true;
  if (marca === 'no') return false;
  return tema.desde <= date;
}

/** Los temas de una asignatura y curso, en el orden del temario. */
export function temasDe(asignatura: Asignatura, curso: Curso): Tema[] {
  return TEMARIO.filter((t) => t.asignatura === asignatura && t.curso === curso).sort((a, b) => a.desde.localeCompare(b.desde));
}

/** Los temas ya vistos de una asignatura. Nunca vacío: sin ninguno, el primero. */
export function temasVistos(asignatura: Asignatura, curso: Curso, date: DateKey, ajuste: AjusteTemas): Tema[] {
  const todos = temasDe(asignatura, curso);
  const vistos = todos.filter((t) => estaVisto(t, date, ajuste));
  return vistos.length ? vistos : todos.slice(0, 1);
}

/** El tema que se está dando: el último de los vistos. */
export function temaActual(asignatura: Asignatura, curso: Curso, date: DateKey, ajuste: AjusteTemas): Tema {
  const vistos = temasVistos(asignatura, curso, date, ajuste);
  return vistos[vistos.length - 1];
}

/**
 * Lo que entra en un examen, quitando lo marcado como «aún no». Si no
 * queda nada, el tema que se está dando: un examen siempre pregunta algo.
 */
export function temasDelExamen(examen: Examen, curso: Curso, date: DateKey, ajuste: AjusteTemas): Tema[] {
  const temas = examen.temas.map((id) => TEMARIO.find((t) => t.id === id)).filter((t): t is Tema => Boolean(t) && ajuste[t!.id] !== 'no');
  return temas.length ? temas : [temaActual(examen.asignatura, curso, date, ajuste)];
}
