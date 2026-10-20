import { addDays, todayKey } from '@/lib/dates';
import type { Asignatura } from '@/lib/temario';
import type { DateKey } from '@/types';

/* =========================================================================
 *  Google Classroom, ya bajado: lo que se guarda y cómo se lee.
 *
 *  El servidor (`lib/classroom.ts`) baja de Google las clases de Leo y de
 *  Hugo y las deja en una «foto» —el snapshot— que se guarda tal cual en
 *  `classroom_links`. Aquí están los tipos de esa foto y las cuentas que se
 *  hacen con ella: qué hay que entregar y cuándo, qué avisos son recientes y
 *  a qué asignatura de la app corresponde cada clase.
 *
 *  Todo puro y sin red: lo usan tanto el panel de Classroom como el
 *  planificador, y las mismas entradas dan siempre lo mismo.
 * ========================================================================= */

/** En qué punto está la entrega del niño, dicho a la manera de la app. */
export type EstadoEntrega =
  /** Sin entregar (o sin empezar). */
  | 'pendiente'
  /** Entregada y esperando a que la corrijan. */
  | 'entregada'
  /** La profesora la ha devuelto, corregida o no. */
  | 'devuelta'
  /** La entregó y la retiró: vuelve a estar pendiente. */
  | 'retirada';

export interface ClassroomMaterial {
  titulo: string;
  enlace?: string;
  tipo: 'drive' | 'youtube' | 'enlace' | 'formulario';
}

export interface ClassroomTema {
  id: string;
  nombre: string;
}

export interface ClassroomCurso {
  id: string;
  nombre: string;
  seccion?: string;
  enlace?: string;
  temas: ClassroomTema[];
}

export interface ClassroomTarea {
  id: string;
  cursoId: string;
  titulo: string;
  /** Recortada: es para saber de qué va, no para leerla entera aquí. */
  descripcion?: string;
  /** Día de entrega en hora de casa. Sin él, la tarea no tiene fecha. */
  entrega?: DateKey;
  /** Hora de entrega en hora de casa, `HH:MM`. */
  hora?: string;
  temaId?: string;
  enlace?: string;
  materiales: ClassroomMaterial[];
  estado: EstadoEntrega;
  /** La nota puesta, si la hay y ya se ve. */
  nota?: number;
  notaMax?: number;
  /** Google la marca como entregada tarde (o fuera de plazo sin entregar). */
  tarde: boolean;
  /** Cuándo se publicó, ISO. */
  creada?: string;
}

export interface ClassroomAviso {
  id: string;
  cursoId: string;
  texto: string;
  /** ISO. */
  fecha: string;
  enlace?: string;
  materiales: ClassroomMaterial[];
}

export interface ClassroomMaterialCurso {
  id: string;
  cursoId: string;
  titulo: string;
  descripcion?: string;
  temaId?: string;
  enlace?: string;
  materiales: ClassroomMaterial[];
  /** ISO. */
  fecha?: string;
}

/** La foto completa de las clases de un niño. */
export interface ClassroomSnapshot {
  version: 1;
  /** Cuándo se bajó, ISO. */
  generado: string;
  cursos: ClassroomCurso[];
  tareas: ClassroomTarea[];
  avisos: ClassroomAviso[];
  materiales: ClassroomMaterialCurso[];
  /** Lo que no se ha podido bajar de alguna clase, ya redactado. */
  incompleto?: string[];
}

/** El estado de la conexión de un niño, tal y como lo sirve `/api/classroom`. */
export interface ClassroomLinkView {
  profileId: 'leo' | 'hugo';
  email: string;
  connectedAt: string;
  syncedAt?: string;
  /** El último fallo al bajar, si lo hubo. */
  error?: string;
  /** `colegio` cuando el centro no deja usar apps externas. */
  codigo?: 'colegio' | 'permiso';
  snapshot: ClassroomSnapshot | null;
}

/** Perfiles que pueden tener Classroom: los dos peques, y nadie más. */
export const CLASSROOM_PROFILES = ['leo', 'hugo'] as const;
export type ClassroomProfile = (typeof CLASSROOM_PROFILES)[number];

export function isClassroomProfile(id: unknown): id is ClassroomProfile {
  return typeof id === 'string' && (CLASSROOM_PROFILES as readonly string[]).includes(id);
}

/** Pasadas estas horas, abrir la sección vuelve a bajar las clases. */
export const CLASSROOM_STALE_HOURS = 6;

/** El texto que se enseña cuando el centro no deja entrar a la app. */
export const MENSAJE_COLEGIO =
  'El colegio no permite apps externas en esta cuenta: hay que pedirle que autorice la app.';

export function isStale(syncedAt: string | undefined, now = Date.now()): boolean {
  if (!syncedAt) return true;
  const at = Date.parse(syncedAt);
  return Number.isNaN(at) || now - at > CLASSROOM_STALE_HOURS * 3_600_000;
}

/* ---------------------------------------------------------------------------
 * De clase de Classroom a asignatura de la app
 * ------------------------------------------------------------------------- */

/** Sin tildes y en minúsculas, para comparar nombres escritos de mil maneras. */
function plano(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Por orden: «Social Science» lleva «science» dentro, así que lo social se
 * mira antes que lo natural. Lo que no encaja en ninguna se queda en `null`
 * —Música, Religión, Plástica…— y no se mezcla con los retos del cole.
 */
const PALABRAS: Array<[Asignatura, RegExp]> = [
  ['social', /\bsocial(es)?\b/],
  ['science', /\b(natural(es)?|science|ciencias?)\b/],
  ['english', /\b(english|ingles)\b/],
  ['mates', /\b(matematicas?|maths?|mates)\b/],
  ['lengua', /\b(lengua|spanish|castellano|literatura)\b/],
];

export function asignaturaDeCurso(nombre: string, seccion?: string): Asignatura | null {
  const texto = plano(`${nombre} ${seccion ?? ''}`);
  for (const [asignatura, patron] of PALABRAS) {
    if (patron.test(texto)) return asignatura;
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Lo que queda por entregar
 * ------------------------------------------------------------------------- */

export type CuandoVence = 'atrasada' | 'hoy' | 'manana' | 'semana' | 'despues' | 'sin-fecha';

export const CUANDO_META: Record<CuandoVence, { label: string; tone: 'danger' | 'warn' | 'info' | 'neutral' }> = {
  atrasada: { label: 'Atrasadas', tone: 'danger' },
  hoy: { label: 'Vencen hoy', tone: 'warn' },
  manana: { label: 'Vencen mañana', tone: 'warn' },
  semana: { label: 'Esta semana', tone: 'info' },
  despues: { label: 'Más adelante', tone: 'neutral' },
  'sin-fecha': { label: 'Sin fecha', tone: 'neutral' },
};

const ORDEN_CUANDO: CuandoVence[] = ['atrasada', 'hoy', 'manana', 'semana', 'despues', 'sin-fecha'];

/** Ya no le toca al niño hacer nada con ella. */
export function estaEntregada(tarea: ClassroomTarea): boolean {
  return tarea.estado === 'entregada' || tarea.estado === 'devuelta';
}

export function cuandoVence(entrega: DateKey | undefined, hoy: DateKey): CuandoVence {
  if (!entrega) return 'sin-fecha';
  if (entrega < hoy) return 'atrasada';
  if (entrega === hoy) return 'hoy';
  if (entrega === addDays(hoy, 1)) return 'manana';
  if (entrega <= addDays(hoy, 7)) return 'semana';
  return 'despues';
}

export interface GrupoPendientes {
  cuando: CuandoVence;
  tareas: ClassroomTarea[];
}

/**
 * Lo que falta por entregar, agrupado por cuándo vence y, dentro de cada
 * grupo, por fecha y hora. Lo atrasado va primero: es lo que corre más prisa.
 */
export function pendientesPorEntrega(snapshot: ClassroomSnapshot | null, hoy: DateKey = todayKey()): GrupoPendientes[] {
  if (!snapshot) return [];
  const grupos = new Map<CuandoVence, ClassroomTarea[]>();
  for (const tarea of snapshot.tareas) {
    if (estaEntregada(tarea)) continue;
    const cuando = cuandoVence(tarea.entrega, hoy);
    grupos.set(cuando, [...(grupos.get(cuando) ?? []), tarea]);
  }
  return ORDEN_CUANDO.filter((c) => grupos.has(c)).map((cuando) => ({
    cuando,
    tareas: grupos
      .get(cuando)!
      .slice()
      .sort(
        (a, b) =>
          (a.entrega ?? '').localeCompare(b.entrega ?? '') ||
          (a.hora ?? '99').localeCompare(b.hora ?? '99') ||
          a.titulo.localeCompare(b.titulo),
      ),
  }));
}

/** Los avisos de los últimos `dias` días, del más nuevo al más viejo. */
export function avisosRecientes(snapshot: ClassroomSnapshot | null, dias = 14, now = Date.now()): ClassroomAviso[] {
  if (!snapshot) return [];
  const desde = now - dias * 86_400_000;
  return snapshot.avisos
    .filter((a) => Date.parse(a.fecha) >= desde)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function cursoDe(snapshot: ClassroomSnapshot, cursoId: string): ClassroomCurso | undefined {
  return snapshot.cursos.find((c) => c.id === cursoId);
}

export function temaDe(snapshot: ClassroomSnapshot, cursoId: string, temaId: string | undefined): string | undefined {
  if (!temaId) return undefined;
  return cursoDe(snapshot, cursoId)?.temas.find((t) => t.id === temaId)?.nombre;
}

/* ---------------------------------------------------------------------------
 * El enganche con lo académico de la app
 * ------------------------------------------------------------------------- */

export interface ProximoClassroom {
  asignatura: Asignatura | null;
  cursoId: string;
  curso: string;
  /** El tema de Classroom en el que está colgada, si lo tiene. */
  tema?: string;
  titulo: string;
  fecha: DateKey;
  entregada: boolean;
  enlace?: string;
}

/**
 * Lo que viene con fecha en las clases del niño —tareas con entrega desde
 * hoy hasta `dias` días después—, con cada clase traducida a su asignatura
 * de la app cuando se deja (`null` si no encaja con ninguna). Ordenado por
 * fecha.
 */
export function temasDeClassroom(
  snapshot: ClassroomSnapshot | null,
  hoy: DateKey = todayKey(),
  dias = 14,
): ProximoClassroom[] {
  if (!snapshot) return [];
  const hasta = addDays(hoy, dias);
  const out: ProximoClassroom[] = [];
  for (const tarea of snapshot.tareas) {
    if (!tarea.entrega || tarea.entrega < hoy || tarea.entrega > hasta) continue;
    const curso = cursoDe(snapshot, tarea.cursoId);
    if (!curso) continue;
    out.push({
      asignatura: asignaturaDeCurso(curso.nombre, curso.seccion),
      cursoId: curso.id,
      curso: curso.nombre,
      tema: temaDe(snapshot, curso.id, tarea.temaId),
      titulo: tarea.titulo,
      fecha: tarea.entrega,
      entregada: estaEntregada(tarea),
      enlace: tarea.enlace,
    });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo));
}
