import { addDays, formatShort, parseDateKey, weekdayIndex } from '@/lib/dates';
import { cuandoEs, type Examen } from '@/lib/examenes';
import { guidanceOf } from '@/lib/experts';
import { digestOf, fieldOf, type GpsFieldId } from '@/lib/gps';
import { diasSinApuntar } from '@/lib/huecos';
import {
  ESTADO_META,
  loQueMasConviene,
  notaEnTexto,
  preparacionExamenes,
  type Estado,
  type PreparacionExamen,
} from '@/lib/notaCole';
import { planAlerts, reviewWeek } from '@/lib/planCheck';
import { DAY_NAMES, PLAN_KINDS } from '@/lib/planner';
import { RETO_META } from '@/lib/retoCole';
import { isCeiling, metricRatio, summarizePeriod } from '@/lib/scoring';
import { entryKey } from '@/lib/storage';
import { daysWithTitle, loadByDay, nextDays, type TaskDraft } from '@/lib/tasks';
import type { DateKey, DayEntry, GpsSession, Metric, Profile, ProfileId, Task, WeekPlan } from '@/types';

/* =========================================================================
 *  El planificador: la semana que viene, propuesta y no impuesta.
 *
 *  Mira lo que la app ya sabe de cada perfil —los exámenes y lo preparado
 *  que va cada uno, la agenda contra lo registrado, la carga del GPS— y de
 *  ahí saca unas pocas propuestas concretas. Ninguna se aplica sola: un
 *  adulto las acepta una a una (o todas, confirmando dos veces) desde la
 *  tarjeta de propuestas.
 *
 *  Tres reglas para que se pueda fiar uno de lo que dice:
 *
 *   1. **Nada inventado.** Cada propuesta lleva su motivo, y el motivo es
 *      siempre un dato calculado aquí: una nota, un recuento, una fecha.
 *   2. **Por lo bajo.** Se planifica un 15 % por debajo de lo que cabría:
 *      una semana que se cumple vale más que una perfecta en el papel.
 *   3. **Sin repetir.** Lo que ya está apuntado ese día con el mismo título
 *      no se vuelve a proponer, y cada propuesta tiene un identificador
 *      estable para que lo descartado siga descartado.
 *
 *  Es código determinista y sin red: las mismas entradas dan siempre las
 *  mismas propuestas, en el mismo orden.
 * ========================================================================= */

export type TipoPropuesta = 'estudio' | 'entreno' | 'descanso' | 'familia' | 'habito' | 'agenda';

export interface Propuesta {
  /** Estable: hash de perfil, tipo, fecha y título. */
  id: string;
  profileId: ProfileId;
  tipo: TipoPropuesta;
  titulo: string;
  /** Una línea con el dato que la justifica. */
  motivo: string;
  accion: { kind: 'tarea'; draft: TaskDraft } | { kind: 'aviso' };
}

export interface PlanificadorInput {
  profile: Profile;
  hoy: DateKey;
  entries: Record<string, DayEntry>;
  /** Las tareas del perfil, hechas o no. */
  tasks: Task[];
  /** Su semana tipo, sin reflejos: lo prestado se juzga en su agenda. */
  plan: WeekPlan;
  /** Sesiones del rastreador (sólo cuentan en los peques). */
  gps?: GpsSession[];
}

/** Días que mira hacia delante: la semana que viene, desde mañana. */
const SEMANA = 7;
/** Hasta dónde se miran los exámenes. */
const HORIZONTE_EXAMENES = 14;
/** Se usa este tanto de lo que cabría, y no más. */
const HOLGURA = 0.85;
/** Tope de sesiones de estudio en un día, por niño. */
const MAX_SESIONES_DIA = 2;
/** Días apuntados de la última semana por debajo de los cuales no se opina. */
const MIN_DIAS_APUNTADOS = 4;

/* ---------------------------------------------------------------------------
 * Utilidades
 * ------------------------------------------------------------------------- */

/** FNV-1a de 32 bits, en base 36: corto, estable y sin dependencias. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function propuestaId(profileId: ProfileId, tipo: TipoPropuesta, fecha: DateKey | '', titulo: string): string {
  return `${profileId}-${tipo}-${hash(`${profileId}|${tipo}|${fecha}|${titulo}`)}`;
}

function tarea(
  profileId: ProfileId,
  tipo: TipoPropuesta,
  titulo: string,
  motivo: string,
  draft: TaskDraft,
): Propuesta {
  return { id: propuestaId(profileId, tipo, draft.due ?? '', titulo), profileId, tipo, titulo, motivo, accion: { kind: 'tarea', draft } };
}

function aviso(profileId: ProfileId, tipo: TipoPropuesta, fecha: DateKey | '', titulo: string, motivo: string): Propuesta {
  return { id: propuestaId(profileId, tipo, fecha, titulo), profileId, tipo, titulo, motivo, accion: { kind: 'aviso' } };
}

/** «mié 22», para nombrar un día sin ocupar media línea. */
function diaCorto(day: DateKey): string {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' }).format(parseDateKey(day));
}

const pct = (ratio: number) => `${Math.round(ratio * 100)} %`;

/** «7,5», como se escribe aquí. */
const cifra = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });

/** El día de la tarea propuesta, o vacío si es un aviso o no tiene fecha. */
export function fechaDe(p: Propuesta): DateKey | '' {
  return p.accion.kind === 'tarea' ? (p.accion.draft.due ?? '') : '';
}

/** Los días de la semana tipo con deporte: entreno o partido. */
function diasDeDeporte(plan: WeekPlan): Map<number, string> {
  const out = new Map<number, string>();
  for (const block of plan.blocks) {
    if (block.kind !== 'deporte') continue;
    const prev = out.get(block.day);
    // Si ese día hay partido, manda el partido: es lo que más carga.
    if (!prev || /partido/i.test(block.title)) out.set(block.day, block.title);
  }
  return out;
}

/** Ya existe una tarea con ese título ese día. */
function yaApuntada(tasks: Task[], titulo: string, day: DateKey): boolean {
  return daysWithTitle(tasks, titulo).has(day);
}

/* ---------------------------------------------------------------------------
 * Los peques: estudio antes de los exámenes, y descanso si el GPS lo pide
 * ------------------------------------------------------------------------- */

/**
 * Cuántas sesiones pide un examen según lo preparado que va. Pocas a
 * propósito: los peques ya hacen cada día los seis retos del cole, y con
 * tres por examen una semana de cuatro exámenes salían once sesiones.
 */
const SESIONES: Record<Estado, number> = { 'sin-practicar': 2, flojo: 2, regular: 1, casi: 1, listo: 1 };
/** Y de cuántos minutos: más cortas cuanto mejor va. */
const MINUTOS: Record<Estado, number> = { 'sin-practicar': 30, flojo: 30, regular: 25, casi: 20, listo: 20 };
/** De peor a mejor: en este orden se reparten las sesiones de más. */
const GRAVEDAD: Estado[] = ['sin-practicar', 'flojo', 'regular', 'casi', 'listo'];

function tituloEstudio(examen: Examen, estado: Estado): string {
  const nombre = RETO_META[examen.asignatura].nombre;
  return estado === 'listo' ? `Repaso de ${nombre} (${MINUTOS.listo}')` : `Estudiar ${nombre} (${MINUTOS[estado]}')`;
}

function motivoEstudio(p: PreparacionExamen): string {
  const nombre = RETO_META[p.examen.asignatura].nombre;
  const cuando = `Examen de ${nombre} el ${cuandoEs(p.examen.fecha)}`;
  if (p.estado === 'sin-practicar') return `${cuando}: sin practicar, ningún reto de lo que entra.`;
  const nota = p.nota === null ? '' : ` (nota ${notaEnTexto(p.nota)} con ${p.n} ${p.n === 1 ? 'pregunta' : 'preguntas'})`;
  return `${cuando}: va «${ESTADO_META[p.estado].label.toLowerCase()}»${nota}.`;
}

function propuestasNino(input: PlanificadorInput): Propuesta[] {
  const { profile, hoy, entries, tasks, plan } = input;
  const out: Propuesta[] = [];
  const deporte = diasDeDeporte(plan);
  const carga = loadByDay(tasks);
  const ventana = nextDays(hoy, HORIZONTE_EXAMENES - 1);

  /* ------------------------------------------------- cuánto cabe cada día */

  // Dos sesiones como mucho, una menos si ese día ya hay dos recados o más
  // pendientes, y otra menos si toca entreno o partido.
  const cabe = new Map<DateKey, number>();
  for (const day of ventana) {
    let n = MAX_SESIONES_DIA;
    if ((carga.get(day)?.pending ?? 0) >= 2) n -= 1;
    if (deporte.has(weekdayIndex(day))) n -= 1;
    cabe.set(day, Math.max(0, n));
  }

  const prep = preparacionExamenes(entries, profile.id, hoy).filter(
    (p) => p.dias >= 2 && p.dias <= HORIZONTE_EXAMENES,
  );
  const conviene = loQueMasConviene(prep);

  // Lo que ya está apuntado con el mismo título cuenta como sesión hecha.
  const puestas = new Map<string, DateKey[]>();
  for (const p of prep) {
    const titulo = tituloEstudio(p.examen, p.estado);
    const dias = ventana.filter((d) => d < p.examen.fecha && yaApuntada(tasks, titulo, d));
    puestas.set(p.examen.fecha + p.examen.asignatura, dias);
  }

  // El presupuesto: lo que cabría en los días con algún examen por delante,
  // menos el 15 %.
  const ultimo = prep.length ? addDays(prep[prep.length - 1].examen.fecha, -1) : hoy;
  const capacidad = ventana.filter((d) => d <= ultimo).reduce((s, d) => s + (cabe.get(d) ?? 0), 0);
  let presupuesto = Math.floor(capacidad * HOLGURA);

  /** Días posibles para una sesión de este examen, por orden de preferencia. */
  const candidatos = (p: PreparacionExamen): DateKey[] => {
    const vispera = addDays(p.examen.fecha, -1);
    if (p.estado === 'listo') return [vispera];
    // De la antevíspera hacia atrás, y la víspera la última: así nunca cae
    // todo el último día.
    const antes = ventana.filter((d) => d < vispera).reverse();
    return [...antes, vispera].filter((d) => d > hoy);
  };

  const elegidos = new Map<string, DateKey[]>();
  const colocar = (p: PreparacionExamen): boolean => {
    const clave = p.examen.fecha + p.examen.asignatura;
    const ya = [...(puestas.get(clave) ?? []), ...(elegidos.get(clave) ?? [])];
    // Una sesión por examen y día: como la víspera es el último candidato,
    // allí cae como mucho una, y sólo cuando antes ya no cabe nada.
    for (const day of candidatos(p)) {
      if (ya.includes(day) || (cabe.get(day) ?? 0) <= 0) continue;
      cabe.set(day, (cabe.get(day) ?? 0) - 1);
      elegidos.set(clave, [...(elegidos.get(clave) ?? []), day]);
      return true;
    }
    return false;
  };

  const faltan = (p: PreparacionExamen) => {
    const clave = p.examen.fecha + p.examen.asignatura;
    return SESIONES[p.estado] - (puestas.get(clave)?.length ?? 0) - (elegidos.get(clave)?.length ?? 0);
  };

  // Primera vuelta: una sesión para cada examen, del más cercano al más
  // lejano. Segunda: las de más, empezando por lo que peor va.
  for (const p of prep) {
    if (presupuesto <= 0) break;
    if (faltan(p) > 0 && colocar(p)) presupuesto -= 1;
  }
  const porGravedad = [...prep].sort(
    (a, b) => GRAVEDAD.indexOf(a.estado) - GRAVEDAD.indexOf(b.estado) || a.examen.fecha.localeCompare(b.examen.fecha),
  );
  let avanza = true;
  while (presupuesto > 0 && avanza) {
    avanza = false;
    for (const p of porGravedad) {
      if (presupuesto <= 0) break;
      if (faltan(p) > 0 && colocar(p)) {
        presupuesto -= 1;
        avanza = true;
      }
    }
  }

  for (const p of prep) {
    const dias = elegidos.get(p.examen.fecha + p.examen.asignatura) ?? [];
    const titulo = tituloEstudio(p.examen, p.estado);
    const temas = conviene.filter((t) => t.tema.asignatura === p.examen.asignatura && p.temas.some((x) => x.tema.id === t.tema.id));
    const detail = temas.length
      ? `Empezar por: ${temas.slice(0, 3).map((t) => t.tema.titulo).join(', ')}.`
      : 'Repaso de todo lo que entra.';
    for (const day of [...dias].sort()) {
      out.push(
        tarea(profile.id, 'estudio', titulo, motivoEstudio(p), {
          title: titulo,
          detail,
          kind: 'colegio',
          due: day,
          repeat: 'none',
        }),
      );
    }
  }
  out.sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)));

  /* ------------------------------------------------- el GPS pide descanso */

  const descanso = descansoPorGps(input, out);
  if (descanso) out.push(descanso);

  return out;
}

/**
 * Carga alta reciente: cuatro sesiones o más en siete días, o lo corrido en
 * la última semana bastante por encima de lo de antes. Entonces se propone
 * un día sin deporte ni estudio, el más libre de la semana que viene.
 */
function descansoPorGps(input: PlanificadorInput, estudio: Propuesta[]): Propuesta | null {
  const { profile, hoy, gps, plan, tasks } = input;
  if (!gps || gps.length === 0) return null;

  const desde = addDays(hoy, -6);
  const recientes = gps.filter((s) => s.date >= desde && s.date <= hoy);
  if (recientes.length === 0) return null;

  const digest = digestOf(recientes, gps.filter((s) => s.date >= addDays(hoy, -42) && s.date <= hoy));
  const subida = digest?.versus.find(
    (v) => (['minutes', 'distance', 'intense'] as GpsFieldId[]).includes(v.id) && v.change >= 0.2,
  );

  let motivo: string | null = null;
  if (recientes.length >= 4) {
    motivo = `${recientes.length} sesiones de GPS en los últimos 7 días`;
    if (subida) motivo += ` y ${fieldOf(subida.id).label.toLowerCase()} un ${pct(subida.change)} por encima de lo de antes`;
  } else if (subida && recientes.length >= 2) {
    motivo = `${fieldOf(subida.id).label} de la última semana, un ${pct(subida.change)} por encima de las ${digest!.versusCount} sesiones anteriores`;
  }
  if (!motivo) return null;

  // El día más libre: sin deporte en la agenda, sin estudio propuesto y con
  // menos recados.
  const deporte = diasDeDeporte(plan);
  const carga = loadByDay(tasks);
  const conEstudio = new Set(estudio.map(fechaDe));
  const libres = nextDays(hoy, SEMANA)
    .filter((d) => !deporte.has(weekdayIndex(d)))
    .sort(
      (a, b) =>
        Number(conEstudio.has(a)) - Number(conEstudio.has(b)) ||
        (carga.get(a)?.pending ?? 0) - (carga.get(b)?.pending ?? 0) ||
        a.localeCompare(b),
    );
  const dia = libres[0];
  if (!dia) return aviso(profile.id, 'descanso', '', 'Un día de descanso esta semana', `${motivo}.`);
  return aviso(profile.id, 'descanso', dia, `Día de descanso: ${diaCorto(dia)}`, `${motivo}.`);
}

/* ---------------------------------------------------------------------------
 * Adultos y perfiles compartidos
 * ------------------------------------------------------------------------- */

/** El cumplimiento medio de una métrica en unos días, y cuántos tienen dato. */
function mediaMetrica(metric: Metric, profileId: ProfileId, days: DateKey[], entries: Record<string, DayEntry>) {
  const ratios = days
    .map((d) => metricRatio(metric, entries[entryKey(profileId, d)]?.values?.[metric.id]))
    .filter((r): r is number => r !== null);
  return { n: ratios.length, media: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0 };
}

/** Lo pequeño y concreto que se propone para una métrica que baja. */
function tituloHabito(metric: Metric, day: DateKey): string {
  const cuando = diaCorto(day);
  if (metric.type === 'counter' || metric.type === 'duration') {
    return isCeiling(metric)
      ? `${metric.label}: quedarse en ${cifra(metric.target)} ${metric.unit} o menos el ${cuando}`
      : `${metric.label}: llegar a ${cifra(metric.target)} ${metric.unit} el ${cuando}`;
  }
  return `${metric.label}: cumplirlo el ${cuando}`;
}

function propuestasAdulto(input: PlanificadorInput): Propuesta[] {
  const { profile, hoy, entries, tasks, plan } = input;
  const out: Propuesta[] = [];
  const semana = nextDays(hoy, SEMANA);
  const ultima = nextDays(addDays(hoy, -8), 7); // de hace 7 días a ayer
  const previa = nextDays(addDays(hoy, -15), 7);
  const carga = loadByDay(tasks);

  /* ------------------------------------------------- ¿hay datos de verdad? */

  const resumen = summarizePeriod(profile.id, ultima, entries);
  if (resumen.trackedDays < MIN_DIAS_APUNTADOS) {
    const huecos = diasSinApuntar(entries, profile.id, hoy).length;
    const domingo = semana.find((d) => weekdayIndex(d) === 6) ?? semana[semana.length - 1];
    const titulo = 'Apuntar 3 días esta semana';
    if (yaApuntada(tasks, titulo, domingo)) return [];
    const motivo =
      resumen.trackedDays === 0
        ? 'Ningún día apuntado en la última semana: sin registro no hay nada que planificar.'
        : `Sólo ${resumen.trackedDays} de 7 días apuntados la última semana${huecos ? ` (${huecos} huecos recientes)` : ''}: con menos de ${MIN_DIAS_APUNTADOS} no se puede opinar.`;
    return [
      tarea(profile.id, 'habito', titulo, motivo, {
        title: titulo,
        detail: 'Basta con lo principal de cada día, por la noche.',
        kind: 'otro',
        due: domingo,
        repeat: 'none',
      }),
    ];
  }

  /** El día más despejado de la semana que viene (sin repetir los ya usados). */
  const usados = new Set<DateKey>();
  const diaLibre = (preferidos?: number[]): DateKey => {
    const pool = preferidos ? semana.filter((d) => preferidos.includes(weekdayIndex(d))) : semana;
    const lista = (pool.length ? pool : semana)
      .slice()
      .sort((a, b) => Number(usados.has(a)) - Number(usados.has(b)) || (carga.get(a)?.pending ?? 0) - (carga.get(b)?.pending ?? 0) || a.localeCompare(b));
    usados.add(lista[0]);
    return lista[0];
  };

  /* ------------------------------------- ratos de la agenda que nunca salen */

  // Las tres semanas anteriores y la actual hasta hoy: el mismo rato vuelve
  // cada semana con el mismo identificador, así que se pueden sumar.
  const juzgados = new Map<string, { n: number; cumplidos: number; title: string; day: number }>();
  for (let k = 0; k <= 3; k += 1) {
    const lunes = addDays(hoy, -7 * k - weekdayIndex(hoy));
    const dates = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
    for (const check of reviewWeek(profile, plan, dates, entries).checks) {
      if (check.date > hoy) continue;
      if (!['cumplido', 'flojo', 'sinRegistrar', 'excedido'].includes(check.status)) continue;
      const prev = juzgados.get(check.block.id) ?? { n: 0, cumplidos: 0, title: check.block.title, day: check.block.day };
      prev.n += 1;
      if (check.status === 'cumplido') prev.cumplidos += 1;
      juzgados.set(check.block.id, prev);
    }
  }
  const nunca = Array.from(juzgados.values())
    .filter((j) => j.n >= 2 && j.cumplidos === 0)
    .sort((a, b) => b.n - a.n || a.day - b.day)
    .slice(0, 2);
  for (const j of nunca) {
    out.push(
      aviso(
        profile.id,
        'agenda',
        '',
        `Reducir o mover «${j.title}» del ${DAY_NAMES[j.day].toLowerCase()}`,
        `No se ha cumplido ninguna de las ${j.n} veces que tocaba en las últimas semanas.`,
      ),
    );
  }

  // Lo que la propia agenda de la semana que viene ya dice que no cabe.
  const proxLunes = addDays(hoy, 7 - weekdayIndex(hoy));
  const proxSemana = Array.from({ length: 7 }, (_, i) => addDays(proxLunes, i));
  const exceso = planAlerts(profile, plan, proxSemana, []).find((a) => a.tone === 'exceso');
  if (exceso) out.push(aviso(profile.id, 'agenda', '', exceso.title, exceso.detail));

  /* ------------------------------------------ hábitos clave que van a menos */

  const bajan = guidanceOf(profile.id)
    .filter((g) => g.guidance.priority === 'clave' && (g.metric.weight ?? 1) > 0)
    .map((g) => {
      const ahora = mediaMetrica(g.metric, profile.id, ultima, entries);
      const antes = mediaMetrica(g.metric, profile.id, previa, entries);
      return { metric: g.metric, ahora, antes, caida: antes.media - ahora.media };
    })
    .filter((x) => x.ahora.n >= 3 && x.antes.n >= 3 && x.caida >= 0.15)
    .sort((a, b) => b.caida - a.caida)
    .slice(0, 2);
  for (const x of bajan) {
    const day = diaLibre();
    const titulo = tituloHabito(x.metric, day);
    if (yaApuntada(tasks, titulo, day)) continue;
    out.push(
      tarea(
        profile.id,
        'habito',
        titulo,
        `«${x.metric.label}» bajó del ${pct(x.antes.media)} al ${pct(x.ahora.media)} de cumplimiento la última semana.`,
        { title: titulo, kind: 'otro', due: day, repeat: 'none' },
      ),
    );
  }

  /* ------------------------------------------------ tiempo juntos (grupos) */

  if (profile.id === 'familia' || profile.id === 'pareja') {
    const enAgenda = plan.blocks.some((b) => b.kind === 'juntos' || b.kind === 'pareja' || b.kind === 'ocio');
    const enTareas = tasks.some((t) => !t.done && t.due && semana.includes(t.due) && t.kind === 'ocio');
    if (!enAgenda && !enTareas) {
      const familia = profile.id === 'familia';
      const day = diaLibre(familia ? [5, 6] : [4, 5]);
      const titulo = familia ? 'Plan en familia: una tarde juntos' : 'Rato en pareja, sin pantallas';
      if (!yaApuntada(tasks, titulo, day)) {
        const kind = familia ? PLAN_KINDS.juntos.label : PLAN_KINDS.pareja.label;
        out.push(
          tarea(
            profile.id,
            'familia',
            titulo,
            `Ningún rato «${kind}» ni de ocio en la agenda, y ningún plan de ocio apuntado del ${formatShort(semana[0])} al ${formatShort(semana[semana.length - 1])}.`,
            { title: titulo, kind: 'ocio', due: day, repeat: 'none' },
          ),
        );
      }
    }
  }

  return out;
}

/* ---------------------------------------------------------------------------
 * La entrada
 * ------------------------------------------------------------------------- */

/** Las propuestas de la semana que viene para un perfil. Función pura. */
export function proponerSemana(input: PlanificadorInput): Propuesta[] {
  const propuestas = input.profile.kind === 'kid' ? propuestasNino(input) : propuestasAdulto(input);
  // Un mismo identificador dos veces sólo puede ser la misma propuesta.
  const vistos = new Set<string>();
  return propuestas.filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)));
}
