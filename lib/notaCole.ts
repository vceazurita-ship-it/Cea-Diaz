import { type Grade } from '@/lib/academics';
import { addDays, parseDateKey, todayKey } from '@/lib/dates';
import { CONVOCATORIAS, diasHasta, type Examen } from '@/lib/examenes';
import { ASIGNATURAS, TRIMESTRE_DESDE, resultadosDe } from '@/lib/retoCole';
import { TEMARIO, type Asignatura, type Tema } from '@/lib/temario';
import type { DateKey, DayEntry, ProfileId } from '@/types';

/* =========================================================================
 *  La nota de cada asignatura, sacada de los retos del cole.
 *
 *  Cada pregunta contestada en un reto deja un rastro: de qué tema era y si
 *  se acertó (`detalle` en `lib/retoCole.ts`). Juntando todas las del
 *  trimestre se puede decir, con números y no con sensaciones, cómo va cada
 *  asignatura y, sobre todo, cómo va preparado cada examen tema por tema:
 *  qué está dominado, qué cojea y qué ni se ha tocado.
 *
 *  Dos reglas para que la nota diga la verdad:
 *
 *   · **Lo reciente pesa más.** Un fallo de septiembre no cuenta igual que
 *     uno de ayer: cada pregunta pesa la mitad por cada dos semanas que
 *     pasan. Así la nota refleja lo que sabe hoy, no la media del curso.
 *   · **La certeza se dice.** Con cinco preguntas la nota es una pista; con
 *     treinta, un dato. Cada nota va con cuántas preguntas la sostienen, y
 *     un examen no se da por «listo» sin haber practicado lo bastante cada
 *     tema que entra.
 *
 *  La escala es la del boletín (insuficiente … sobresaliente) para que se
 *  pueda comparar con lo que luego trae del cole. Aquí no hay ninguna nota
 *  de nadie: sólo las reglas.
 * ========================================================================= */

/** Una pregunta contestada en un reto, con lo que hace falta para puntuar. */
export interface Evidencia {
  date: DateKey;
  asignatura: Asignatura;
  /** `null` en lo anotado antes de guardarse el detalle: sólo cuenta para la asignatura. */
  tema: string | null;
  hit: boolean;
}

const TEMA_POR_ID = new Map(TEMARIO.map((t) => [t.id, t]));

/**
 * Todas las preguntas contestadas en los retos del trimestre hasta ese día.
 * Lo anotado sin detalle (los retos de antes de guardarlo) entra por
 * asignatura, sin tema; el repaso sin detalle no se puede atribuir y se
 * deja fuera.
 */
export function evidenciaCole(entries: Record<string, DayEntry>, profileId: ProfileId, hasta: DateKey = todayKey()): Evidencia[] {
  const out: Evidencia[] = [];
  for (let d = TRIMESTRE_DESDE; d <= hasta; d = addDays(d, 1)) {
    const resultados = resultadosDe(entries, profileId, d);
    for (const r of Object.values(resultados)) {
      if (!r) continue;
      const detalle = r.detalle ?? [];
      let hits = 0;
      for (const a of detalle) {
        const tema = TEMA_POR_ID.get(a.tema);
        const asignatura = tema?.asignatura ?? (r.reto !== 'repaso' ? r.reto : null);
        if (!asignatura) continue;
        if (a.hit) hits += 1;
        out.push({ date: d, asignatura, tema: tema ? tema.id : null, hit: a.hit });
      }
      // Lo contestado que no tiene detalle: a bulto, sólo para la asignatura.
      if (r.reto === 'repaso') continue;
      const sinDetalle = Math.max(0, r.answered - detalle.length);
      const sinDetalleBien = Math.max(0, Math.min(sinDetalle, r.correct - hits));
      for (let i = 0; i < sinDetalle; i += 1) out.push({ date: d, asignatura: r.reto, tema: null, hit: i < sinDetalleBien });
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Puntuar
 * ------------------------------------------------------------------------- */

/** Cada dos semanas, una pregunta pesa la mitad. */
const VIDA_MEDIA_DIAS = 14;

function peso(date: DateKey, hoy: DateKey): number {
  const dias = Math.max(0, diasHasta(hoy, date));
  return Math.pow(0.5, dias / VIDA_MEDIA_DIAS);
}

/** La nota de 0 a 10 de un montón de preguntas, con lo reciente pesando más. */
export function notaDe(evidencia: Evidencia[], hoy: DateKey): number | null {
  if (evidencia.length === 0) return null;
  let suma = 0;
  let total = 0;
  for (const e of evidencia) {
    const w = peso(e.date, hoy);
    total += w;
    if (e.hit) suma += w;
  }
  return total > 0 ? (suma / total) * 10 : null;
}

/** La misma escala que el boletín, para poder compararlas. */
export function gradeDeNota(nota: number | null): Grade | null {
  if (nota === null) return null;
  if (nota < 5) return 'IN';
  if (nota < 6) return 'SU';
  if (nota < 7) return 'BI';
  if (nota < 9) return 'NT';
  return 'SB';
}

/** Cuánto fiarse de la nota: depende de cuántas preguntas la sostienen. */
export type Certeza = 'ninguna' | 'poca' | 'media' | 'alta';

export function certezaDe(n: number): Certeza {
  if (n === 0) return 'ninguna';
  if (n < 10) return 'poca';
  if (n < 25) return 'media';
  return 'alta';
}

export const CERTEZA_META: Record<Certeza, { label: string; blurb: string }> = {
  ninguna: { label: 'sin datos', blurb: 'Todavía no ha jugado ningún reto de esto.' },
  poca: { label: 'poca certeza', blurb: 'Con menos de 10 preguntas la nota es sólo una pista.' },
  media: { label: 'certeza media', blurb: 'Entre 10 y 25 preguntas: la nota ya orienta.' },
  alta: { label: 'certeza alta', blurb: 'Más de 25 preguntas: la nota es un dato fiable.' },
};

export type Tendencia = 'sube' | 'baja' | 'igual';

/**
 * La última semana contra la anterior, sin ponderar: si hay al menos cinco
 * preguntas en cada una y la diferencia pasa de un punto, sube o baja.
 */
export function tendenciaDe(evidencia: Evidencia[], hoy: DateKey): Tendencia | null {
  const corte = addDays(hoy, -7);
  const antes = addDays(hoy, -14);
  const reciente = evidencia.filter((e) => e.date > corte);
  const previa = evidencia.filter((e) => e.date > antes && e.date <= corte);
  if (reciente.length < 5 || previa.length < 5) return null;
  const media = (xs: Evidencia[]) => xs.filter((e) => e.hit).length / xs.length;
  const d = media(reciente) - media(previa);
  return d >= 0.1 ? 'sube' : d <= -0.1 ? 'baja' : 'igual';
}

export interface NotaTema {
  tema: Tema;
  n: number;
  aciertos: number;
  nota: number | null;
}

export interface NotaAsignatura {
  asignatura: Asignatura;
  /** Preguntas contestadas en el trimestre. */
  n: number;
  aciertos: number;
  /** De 0 a 10, con lo reciente pesando más. */
  nota: number | null;
  grade: Grade | null;
  certeza: Certeza;
  tendencia: Tendencia | null;
  /** El último día que jugó un reto de esto. */
  ultima: DateKey | null;
  /** Tema a tema, de los que tienen alguna pregunta. */
  temas: NotaTema[];
}

function notaTema(tema: Tema, evidencia: Evidencia[], hoy: DateKey): NotaTema {
  const propia = evidencia.filter((e) => e.tema === tema.id);
  return { tema, n: propia.length, aciertos: propia.filter((e) => e.hit).length, nota: notaDe(propia, hoy) };
}

/** La nota de cada asignatura, en el orden de siempre. */
export function notasPorAsignatura(entries: Record<string, DayEntry>, profileId: ProfileId, hoy: DateKey = todayKey()): NotaAsignatura[] {
  const todo = evidenciaCole(entries, profileId, hoy);
  return ASIGNATURAS.map((asignatura) => {
    const propia = todo.filter((e) => e.asignatura === asignatura);
    const temas = TEMARIO.filter((t) => t.asignatura === asignatura && propia.some((e) => e.tema === t.id)).map((t) => notaTema(t, propia, hoy));
    const nota = notaDe(propia, hoy);
    return {
      asignatura,
      n: propia.length,
      aciertos: propia.filter((e) => e.hit).length,
      nota,
      grade: gradeDeNota(nota),
      certeza: certezaDe(propia.length),
      tendencia: tendenciaDe(propia, hoy),
      ultima: propia.length ? propia.reduce((a, b) => (a.date > b.date ? a : b)).date : null,
      temas,
    };
  });
}

/* ---------------------------------------------------------------------------
 * Los exámenes: cómo va preparado cada uno, tema a tema
 * ------------------------------------------------------------------------- */

export type Estado = 'sin-practicar' | 'flojo' | 'regular' | 'casi' | 'listo';

/** De peor a mejor, para quedarse con lo peor de un examen. */
const ORDEN_ESTADO: Estado[] = ['sin-practicar', 'flojo', 'regular', 'casi', 'listo'];

export const ESTADO_META: Record<Estado, { label: string; icon: string; color: string; blurb: string }> = {
  'sin-practicar': { label: 'Sin practicar', icon: '⬜', color: '#94a3b8', blurb: 'No ha salido todavía en ningún reto.' },
  flojo: { label: 'Flojo', icon: '🔴', color: '#ef4444', blurb: 'Menos de 6 sobre 10: hay que repasarlo.' },
  regular: { label: 'Regular', icon: '🟠', color: '#f97316', blurb: 'Entre 6 y 8: lo va cogiendo, pero falla.' },
  casi: { label: 'Casi', icon: '🟡', color: '#eab308', blurb: 'Lo acierta, pero con pocas preguntas aún: que salga más.' },
  listo: { label: 'Listo', icon: '🟢', color: '#22c55e', blurb: '8 o más sobre 10 con bastantes preguntas: dominado.' },
};

/** Para que un tema cuente como listo hacen falta al menos estas preguntas. */
export const PREGUNTAS_PARA_LISTO = 8;

export function estadoDe(n: number, nota: number | null): Estado {
  if (n === 0 || nota === null) return 'sin-practicar';
  if (nota < 6) return 'flojo';
  if (nota < 8) return 'regular';
  if (n < PREGUNTAS_PARA_LISTO) return 'casi';
  return 'listo';
}

export interface PreparacionTema extends NotaTema {
  estado: Estado;
}

export interface PreparacionExamen {
  examen: Examen;
  /** Días que faltan desde hoy. */
  dias: number;
  temas: PreparacionTema[];
  /** Sobre todas las preguntas de lo que entra. */
  n: number;
  nota: number | null;
  grade: Grade | null;
  /** Lo peor de sus temas: un examen está tan preparado como su tema más flojo. */
  estado: Estado;
}

/**
 * Los exámenes que vienen (los de la convocatoria más cercana que aún tenga
 * alguno por delante) y cómo va preparado cada uno.
 */
export function preparacionExamenes(entries: Record<string, DayEntry>, profileId: ProfileId, hoy: DateKey = todayKey()): PreparacionExamen[] {
  const convocatoria = CONVOCATORIAS.find((c) => c.profileId === profileId && c.examenes.some((e) => e.fecha >= hoy));
  if (!convocatoria) return [];
  const todo = evidenciaCole(entries, profileId, hoy);
  return [...convocatoria.examenes]
    .filter((e) => e.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((examen) => {
      const temas: PreparacionTema[] = examen.temas
        .map((id) => TEMA_POR_ID.get(id))
        .filter((t): t is Tema => Boolean(t))
        .map((t) => {
          const nt = notaTema(t, todo, hoy);
          return { ...nt, estado: estadoDe(nt.n, nt.nota) };
        });
      const propia = todo.filter((e) => examen.temas.includes(e.tema ?? ''));
      const nota = notaDe(propia, hoy);
      const estado = temas.length ? temas.map((t) => t.estado).sort((a, b) => ORDEN_ESTADO.indexOf(a) - ORDEN_ESTADO.indexOf(b))[0] : 'sin-practicar';
      return { examen, dias: diasHasta(examen.fecha, hoy), temas, n: propia.length, nota, grade: gradeDeNota(nota), estado };
    });
}

/** Lo que más conviene repasar: los temas de los exámenes que peor van, en orden. */
export function loQueMasConviene(preparacion: PreparacionExamen[]): PreparacionTema[] {
  return preparacion
    .flatMap((p) => p.temas)
    .filter((t) => t.estado !== 'listo')
    .sort((a, b) => ORDEN_ESTADO.indexOf(a.estado) - ORDEN_ESTADO.indexOf(b.estado) || (a.nota ?? 0) - (b.nota ?? 0));
}

/** «7,8», o «—» sin nota. */
export function notaEnTexto(nota: number | null): string {
  return nota === null ? '—' : nota.toFixed(1).replace('.', ',');
}

/** El trimestre que se está puntuando, para decirlo. */
export function desdeCuando(): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(parseDateKey(TRIMESTRE_DESDE));
}
