import { addDays, parseDateKey } from '@/lib/dates';
import type { Asignatura } from '@/lib/temario';
import type { DateKey, ProfileId } from '@/types';

/* =========================================================================
 *  Los exámenes, y cómo se preparan con el reto del cole.
 *
 *  Cuando hay exámenes a la vista, el reto del cole deja la rotación de
 *  siempre (lunes Mates, martes Lengua…) y se pone a preparar:
 *
 *   · **Antes de la semana de exámenes**, cada día de diario toca una de las
 *     asignaturas que entran, por turnos y en el orden de los exámenes, con
 *     preguntas de todas sus unidades. El finde, un repaso mezclado.
 *   · **En la semana de exámenes** (desde la víspera del primero), cada día
 *     toca la asignatura del examen siguiente: el reto de la tarde es el
 *     repaso del examen de mañana. Así esa semana sólo queda repasar.
 *
 *  Las fechas salen del calendario que manda el cole; las unidades que
 *  entran, de lo que se ha dado hasta entonces (y de los resúmenes de la
 *  profe donde los hay). Si el cole dice otra cosa, se cambia aquí.
 * ========================================================================= */

export interface Examen {
  asignatura: Asignatura;
  fecha: DateKey;
  /** Los temas de `lib/temario.ts` que entran. */
  temas: string[];
}

export interface Convocatoria {
  profileId: ProfileId;
  /** Desde cuándo el reto del cole se pone a preparar estos exámenes. */
  preparaDesde: DateKey;
  examenes: Examen[];
}

export const CONVOCATORIAS: Convocatoria[] = [
  {
    // Calendario de exámenes de 4.º (octubre de 2026).
    profileId: 'hugo',
    preparaDesde: '2026-10-07',
    examenes: [
      { asignatura: 'english', fecha: '2026-10-22', temas: ['e4-1'] },
      { asignatura: 'lengua', fecha: '2026-10-23', temas: ['l4-1', 'l4-2'] },
      { asignatura: 'science', fecha: '2026-10-26', temas: ['n4-1'] },
      { asignatura: 'mates', fecha: '2026-10-27', temas: ['m4-1', 'm4-2'] },
      { asignatura: 'social', fecha: '2026-10-28', temas: ['s4-1'] },
    ],
  },
  {
    // Calendario de evaluaciones de 3.º: la 1.ª evaluación (octubre de 2026).
    profileId: 'leo',
    preparaDesde: '2026-10-10',
    examenes: [
      { asignatura: 'mates', fecha: '2026-10-22', temas: ['m3-1', 'm3-2'] },
      { asignatura: 'english', fecha: '2026-10-23', temas: ['e3-1'] },
      { asignatura: 'science', fecha: '2026-10-26', temas: ['n3-1'] },
      { asignatura: 'lengua', fecha: '2026-10-27', temas: ['l3-1', 'l3-2'] },
      { asignatura: 'social', fecha: '2026-10-28', temas: ['s3-1'] },
    ],
  },
  {
    // La 2.ª evaluación de 3.º (diciembre de 2026). Las fechas son las del
    // calendario del cole; lo que entra es lo que se supone que se dará
    // después de la 1.ª. Cambiarlo cuando lleguen los resúmenes.
    profileId: 'leo',
    preparaDesde: '2026-12-01',
    examenes: [
      { asignatura: 'lengua', fecha: '2026-12-15', temas: ['l3-3', 'l3-4'] },
      { asignatura: 'social', fecha: '2026-12-16', temas: ['s3-2'] },
      { asignatura: 'mates', fecha: '2026-12-17', temas: ['m3-3', 'm3-4'] },
      { asignatura: 'english', fecha: '2026-12-18', temas: ['e3-2'] },
      { asignatura: 'science', fecha: '2026-12-21', temas: ['n3-2'] },
    ],
  },
];

export type ModoPlan = 'prepara' | 'repasa';

export interface PlanDelDia {
  modo: ModoPlan;
  /** La asignatura de hoy, o `repaso` el finde de preparación. */
  reto: Asignatura | 'repaso';
  /** El examen que se prepara hoy (en el repaso del finde, ninguno). */
  examen?: Examen;
  /** Los exámenes que aún quedan, en orden. */
  pendientes: Examen[];
}

const porFecha = (a: Examen, b: Examen) => a.fecha.localeCompare(b.fecha);

/** Días de diario entre `desde` (incluido) y `hasta` (sin incluir). */
function diariosEntre(desde: DateKey, hasta: DateKey): number {
  let n = 0;
  for (let d = desde; d < hasta; d = addDays(d, 1)) {
    const dow = parseDateKey(d).getDay();
    if (dow !== 0 && dow !== 6) n += 1;
  }
  return n;
}

/** Qué se prepara ese día, o `null` si no hay exámenes a la vista. */
export function planDelDia(profileId: ProfileId, date: DateKey): PlanDelDia | null {
  for (const c of CONVOCATORIAS) {
    if (c.profileId !== profileId || date < c.preparaDesde) continue;
    const todos = [...c.examenes].sort(porFecha);
    // Lo que se hace por la tarde prepara lo de mañana: el examen de hoy ya pasó.
    const pendientes = todos.filter((e) => e.fecha > date);
    if (pendientes.length === 0) continue;

    if (date >= addDays(todos[0].fecha, -1)) {
      return { modo: 'repasa', reto: pendientes[0].asignatura, examen: pendientes[0], pendientes };
    }
    const dow = parseDateKey(date).getDay();
    if (dow === 0 || dow === 6) return { modo: 'prepara', reto: 'repaso', pendientes };
    const turno = pendientes[diariosEntre(c.preparaDesde, date) % pendientes.length];
    return { modo: 'prepara', reto: turno.asignatura, examen: turno, pendientes };
  }
  return null;
}

/** «el jueves 22», para decir cuándo es un examen. */
export function cuandoEs(fecha: DateKey): string {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric' }).format(parseDateKey(fecha));
}

/** Días que faltan para un examen, contando desde ese día. */
export function diasHasta(fecha: DateKey, desde: DateKey): number {
  return Math.round((parseDateKey(fecha).getTime() - parseDateKey(desde).getTime()) / 86_400_000);
}
