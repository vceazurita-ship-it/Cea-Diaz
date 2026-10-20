import { asignaturaDeCurso, type ClassroomCurso, type ClassroomSnapshot, type ClassroomTarea } from '@/lib/classroomModel';
import { addDays, parseDateKey, toDateKey } from '@/lib/dates';
import { RETO_META } from '@/lib/retoCole';
import type { DateKey } from '@/types';

/* =========================================================================
 *  Classroom pegado a mano.
 *
 *  Cuando el colegio no deja conectar la app, queda el camino de siempre:
 *  abrir «Tareas pendientes» en Classroom con la cuenta del niño, seleccionar
 *  todo, copiar y pegarlo en la app. Aquí se lee ese texto —el de la página
 *  en español o en inglés, o una lista escrita a mano, una tarea por línea—
 *  y sale la misma foto (`ClassroomSnapshot`) que da la conexión con Google,
 *  así que la tarjeta y las propuestas de la semana no notan la diferencia.
 *
 *  La página de Classroom pone cada tarea en dos o tres renglones: el
 *  título, la clase y, si la tiene, la fecha de entrega. Entre medias van
 *  los rótulos de la página («Asignadas», «Esta semana», «Sin fecha de
 *  entrega»…), que se saltan o sirven para saber si lo que viene ya venció.
 *
 *  Puro y sin red: lo usan el navegador, para enseñar qué ha entendido antes
 *  de guardar, y el servidor, que vuelve a leerlo para no fiarse de nadie.
 * ========================================================================= */

export interface TareaPegada {
  titulo: string;
  /** El nombre de la clase tal cual venía, si venía. */
  curso?: string;
  entrega?: DateKey;
  /** `HH:MM`. */
  hora?: string;
  /** Venía en la parte de «Anteriormente», o ya venció. */
  atrasada: boolean;
}

/** Tope de texto que se acepta: la página entera de tareas cabe de sobra. */
export const PEGADO_MAX_CARACTERES = 100_000;
/** Tope de tareas que se guardan de una vez. */
export const PEGADO_MAX_TAREAS = 200;

/** Dónde se copia: la lista de tareas pendientes de todas las clases. */
export const PEGADO_ORIGEN_URL = 'https://classroom.google.com/a/not-turned-in/all';

type Seccion = 'futuro' | 'pasado' | 'sin-fecha';

/* ---------------------------------------------------------------------------
 * Texto plano, con las mismas posiciones que el original
 * ------------------------------------------------------------------------- */

/**
 * Minúsculas y sin tildes, letra a letra, para que cada posición siga
 * apuntando a la misma letra del original y se pueda recortar éste.
 */
function plano(text: string): string {
  let out = '';
  for (const c of text) {
    const base = c.normalize('NFD')[0]?.toLowerCase() ?? c;
    out += base.length === c.length ? base : c;
  }
  return out;
}

const limpio = (text: string) => text.replace(/\s+/g, ' ').trim();

/* ---------------------------------------------------------------------------
 * Rótulos de la página
 * ------------------------------------------------------------------------- */

const SECCIONES: Array<[RegExp, Seccion]> = [
  [/^(sin fecha( de entrega| limite)?|no due date)$/, 'sin-fecha'],
  [
    /^(anteriormente|antes|semana (anterior|pasada)|la semana (anterior|pasada)|atrasad[ao]s?|fuera de plazo|earlier|last week)$/,
    'pasado',
  ],
  [
    /^(esta semana|(la )?proxima semana|(la )?semana que viene|mas adelante|mas tarde|this week|next week|later)$/,
    'futuro',
  ],
];

/** Lo que es de la página y no de ninguna tarea. */
const RUIDO = new RegExp(
  '^(' +
    [
      'asignad[ao]s?',
      'pendientes?',
      'sin entregar',
      'hecho',
      'ocultar( todo| tema| todas las secciones)?',
      'mostrar',
      'mas opciones',
      'ir al contenido principal',
      'ayuda y comentarios',
      'compatibilidad con lectores de pantalla habilitada',
      'unirse a clase',
      'anadir clase',
      // Las pestañas de arriba: «Falta» es una pestaña, no la parte de lo vencido.
      'falta',
      'faltan',
      'no entregad[ao]s?',
      'missing',
      'tareas? pendientes?',
      'entregad[ao]s?',
      'completad[ao]s?',
      'para revisar',
      'revisad[ao]s?',
      'todas las clases',
      'todos los cursos',
      'ver (todo|todas|mas|menos|trabajo|tarea|detalles)',
      '(google )?classroom',
      'mis tareas',
      'trabajo de clase',
      'tablon',
      'novedades',
      'personas',
      'calificaciones',
      'calendario',
      'inicio',
      'clases( archivadas)?',
      'ajustes',
      'menu( principal)?',
      'tareas?',
      'preguntas?',
      'materiales?',
      'entregar',
      'marcar como (completada|hecha)',
      'anadir comentario( de (la )?clase)?',
      'comentarios? de (la )?clase',
      'comentarios? privados?',
      'tu trabajo',
      'abrir',
      'assigned',
      'done',
      'to-?do',
      'all classes',
      'view (all|more|less|work|assignment)',
      'stream',
      'classwork',
      'people',
      'grades',
      'home',
      'calendar',
      'settings',
      'turn in',
      'mark as done',
      'class comments',
      'your work',
      'assignment',
      'question',
      'material',
    ].join('|') +
    ')$',
);

/** Renglones que llevan fecha pero no son de entrega: cuándo se colgó o se editó. */
const NO_ES_ENTREGA =
  /^(publicad[ao]|editad[ao]|cread[ao]|asignad[ao]|posted|edited|created|assigned|fecha de (publicacion|creacion)|ultima modificacion)\b/;

/**
 * Los nombres de los iconos de Google (`assignment`, `keyboard_arrow_up`,
 * `more_vert`…), que al copiar la página salen como texto.
 */
const ICONO = /^[a-z]+(_[a-z]+)+$|^(assignment|comment|edit|add|close|check|done|book|topic|quiz|description|attachment|link)$/;

/** Se cuenta como rótulo con o sin el número de tareas detrás: «Esta semana 3». */
function seccionDe(p: string): Seccion | null {
  const sinCuenta = p.replace(/[\s(]*\d+\)?$/, '').replace(/[.:]$/, '').trim();
  for (const [patron, seccion] of SECCIONES) if (patron.test(sinCuenta)) return seccion;
  return null;
}

function esRuido(p: string): boolean {
  const t = p.replace(/[.:]$/, '').trim();
  if (!t) return true;
  if (/^\d+$/.test(t)) return true; // cuentas sueltas
  if (/^\d+ (puntos?|points?)$/.test(t)) return true;
  if (/^(\/\s*)?\d+$/.test(t)) return true;
  if (NO_ES_ENTREGA.test(t) || ICONO.test(t)) return true;
  return RUIDO.test(t);
}

/* ---------------------------------------------------------------------------
 * Fechas
 * ------------------------------------------------------------------------- */

const MESES: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

/** Día de la semana como lo da `Date.getDay()`: domingo 0. */
const DIAS: Array<[RegExp, number]> = [
  [/^(lunes|lun|monday|mon)$/, 1],
  [/^(martes|mar|tuesday|tue|tues)$/, 2],
  [/^(miercoles|mie|mier|wednesday|wed)$/, 3],
  [/^(jueves|jue|thursday|thu|thur|thurs)$/, 4],
  [/^(viernes|vie|friday|fri)$/, 5],
  [/^(sabado|sab|saturday|sat)$/, 6],
  [/^(domingo|dom|sunday|sun)$/, 0],
];

/** Los meses, enteros o abreviados: «dictado» no es «dic» de diciembre. */
const MES_RE =
  '(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|setiembre|sept|sep|set|octubre|oct|noviembre|nov|diciembre|dic|january|jan|february|march|april|apr|june|july|august|aug|september|october|november|december|dec)\\.?';
const DIA_RE =
  '(lunes|lun|martes|mar|miercoles|mier|mie|jueves|jue|viernes|vie|sabado|sab|domingo|dom|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)\\.?';

interface Trozo {
  desde: number;
  hasta: number;
}

interface FechaLeida {
  entrega?: DateKey;
  hora?: string;
  /** Lo que queda del renglón sin la fecha ni las palabras de entrega. */
  resto: string;
  /** Traía una palabra de entrega («vence», «para el», «due»…). */
  deEntrega: boolean;
  /**
   * La fecha sale de un día de la semana o de «mañana» en mitad del renglón:
   * palabras que también caben en un título («El mar y los ríos»), así que
   * así sólo valen con una palabra de entrega al lado.
   */
  debil: boolean;
}

/** El año que deja el día más cerca de hoy: «3 ene» en diciembre es del año que viene. */
function conAnio(dia: number, mes: number, hoy: DateKey, anio?: number): DateKey | undefined {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return undefined;
  const base = Number(hoy.slice(0, 4));
  const candidatos = anio !== undefined ? [anio < 100 ? 2000 + anio : anio] : [base - 1, base, base + 1];
  const hoyMs = parseDateKey(hoy).getTime();
  let mejor: DateKey | undefined;
  let distancia = Infinity;
  for (const y of candidatos) {
    const fecha = new Date(y, mes - 1, dia);
    if (fecha.getMonth() !== mes - 1) continue; // 31 de abril y compañía
    const d = Math.abs(fecha.getTime() - hoyMs);
    if (d < distancia) {
      distancia = d;
      mejor = toDateKey(fecha);
    }
  }
  return mejor;
}

/** El próximo `dia` de la semana desde hoy (o el último, si ya pasó). */
function porDiaDeSemana(dia: number, hoy: DateKey, pasado: boolean): DateKey {
  const actual = parseDateKey(hoy).getDay();
  const delante = (dia - actual + 7) % 7;
  return pasado ? addDays(hoy, delante === 0 ? 0 : delante - 7) : addDays(hoy, delante);
}

const PALABRAS_ENTREGA =
  /\b(fecha (de entrega|limite)|entrega(r)?|vence|vencio|vencimiento|para el( dia)?|hasta el|due( date| on)?)\b/g;

/**
 * Busca la fecha y la hora de entrega en un renglón. Devuelve `null` si no
 * hay ninguna; si la hay, lo que sobra del renglón, ya en el texto original.
 */
function leerFecha(original: string, hoy: DateKey, seccion: Seccion | null): FechaLeida | null {
  const p = plano(original);
  const quitar: Trozo[] = [];
  let entrega: DateKey | undefined;
  let hora: string | undefined;
  let debil = false;
  /** Detrás sólo queda, como mucho, la hora: «… para mañana», «… jueves, 23:59». */
  const alFinal = (m: RegExpExecArray) =>
    p
      .slice(m.index + m[0].length)
      .replace(/\d{1,2}:\d{2}\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/g, '')
      .replace(/[\s.,;:!)\]]+/g, '') === '';

  const tomar = (re: RegExp, alEncontrar: (m: RegExpExecArray) => boolean) => {
    const m = re.exec(p);
    if (m && alEncontrar(m)) quitar.push({ desde: m.index, hasta: m.index + m[0].length });
  };

  // La hora: «23:59», «11:59 PM».
  tomar(/\b(\d{1,2}):(\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)?(?=\W|$)/, (m) => {
    let h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return false;
    if (m[3]?.startsWith('p') && h < 12) h += 12;
    if (m[3]?.startsWith('a') && h === 12) h = 0;
    hora = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    return true;
  });

  // «21/10», «21/10/2026».
  tomar(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
    entrega = conAnio(Number(m[1]), Number(m[2]), hoy, m[3] ? Number(m[3]) : undefined);
    return entrega !== undefined;
  });

  // «21 oct.», «21 de octubre de 2026».
  if (!entrega) {
    tomar(new RegExp(`\\b(\\d{1,2})(?:\\s+de)?\\s+${MES_RE}(?:,?\\s+(?:de\\s+)?(\\d{4}))?(?=\\W|$)`), (m) => {
      entrega = conAnio(Number(m[1]), MESES[m[2].slice(0, 3)] ?? 0, hoy, m[3] ? Number(m[3]) : undefined);
      return entrega !== undefined;
    });
  }

  // «Oct 21», «October 21, 2026».
  if (!entrega) {
    tomar(new RegExp(`\\b${MES_RE}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?(?=\\W|$)`), (m) => {
      entrega = conAnio(Number(m[2]), MESES[m[1].slice(0, 3)] ?? 0, hoy, m[3] ? Number(m[3]) : undefined);
      return entrega !== undefined;
    });
  }

  // «hoy», «mañana», «ayer».
  if (!entrega) {
    tomar(/\b(hoy|today|manana|tomorrow|ayer|yesterday)\b/, (m) => {
      const w = m[1];
      entrega = addDays(hoy, w === 'hoy' || w === 'today' ? 0 : w === 'ayer' || w === 'yesterday' ? -1 : 1);
      debil = !alFinal(m);
      return true;
    });
  }

  // «el jueves», «vie.». Si la fecha ya estaba («jueves, 22 oct»), el día
  // de la semana sólo se quita del renglón.
  if (entrega) {
    tomar(new RegExp(`\\b${DIA_RE}(?=\\W|$)`), () => true);
  } else {
    tomar(new RegExp(`\\b${DIA_RE}(?=\\W|$)`), (m) => {
      const dia = DIAS.find(([re]) => re.test(m[1]))?.[1];
      if (dia === undefined) return false;
      entrega = porDiaDeSemana(dia, hoy, seccion === 'pasado');
      // «mar», «sun», «dom»… abreviados son también palabras: al final de un
      // título («Excursión al mar») no bastan.
      debil = m[1].length <= 4 || !alFinal(m);
      return true;
    });
  }

  if (!entrega && !hora) return null;

  // Lo que queda, en el texto original.
  quitar.sort((a, b) => a.desde - b.desde);
  let resto = '';
  let restoPlano = '';
  let i = 0;
  for (const t of quitar) {
    resto += original.slice(i, t.desde) + ' ';
    restoPlano += p.slice(i, t.desde) + ' ';
    i = Math.max(i, t.hasta);
  }
  resto += original.slice(i);
  restoPlano += p.slice(i);

  const deEntrega = new RegExp(PALABRAS_ENTREGA.source).test(restoPlano);
  // Fuera las palabras de entrega y la puntuación que las unía al título.
  const palabras = [...restoPlano.matchAll(PALABRAS_ENTREGA)].map((m) => ({ desde: m.index!, hasta: m.index! + m[0].length }));
  let sinPalabras = '';
  let j = 0;
  for (const t of palabras) {
    sinPalabras += resto.slice(j, t.desde) + ' ';
    j = t.hasta;
  }
  sinPalabras += resto.slice(j);

  return {
    entrega,
    hora,
    resto: limpio(sinPalabras.replace(/\b(el|la|a las|at|on|del?)\s*$/i, '').replace(/^[\s,:;·•—–\-()]+|[\s,:;·•—–\-()]+$/g, '')),
    deEntrega,
    debil,
  };
}

/* ---------------------------------------------------------------------------
 * Clases
 * ------------------------------------------------------------------------- */

/** Parece el nombre de una clase: una asignatura, o «5º A», «4ºB Primaria»… */
function pareceCurso(linea: string, conocidos: Set<string>): boolean {
  const p = plano(linea);
  if (conocidos.has(p)) return true;
  if (p.length > 60) return false;
  if (asignaturaDeCurso(linea) !== null) return true;
  return /\b\d\s*[ºª°o]\s*[a-e]?\b|\b(primaria|secundaria|eso|curso|grupo|clase|grade|year)\b/.test(p);
}

/** «Mates: ficha 3» → la clase delante de los dos puntos, si lo parece. */
function cursoDelante(titulo: string, conocidos: Set<string>): { curso?: string; titulo: string } {
  const m = /^([^:]{2,40}):\s*(.+)$/.exec(titulo);
  if (m && pareceCurso(m[1], conocidos)) return { curso: limpio(m[1]), titulo: limpio(m[2]) };
  return { titulo };
}

/* ---------------------------------------------------------------------------
 * Lectura
 * ------------------------------------------------------------------------- */

/**
 * Las tareas que hay en el texto pegado. `hoy` es el día de casa: sirve para
 * leer «mañana» o «el jueves» y para poner año a «21 oct».
 */
export function leerPegado(texto: string, hoy: DateKey): TareaPegada[] {
  const lineas = texto
    .slice(0, PEGADO_MAX_CARACTERES)
    .split(/\r?\n/)
    .map((l) => limpio(l.replace(/^[\s•·*\-–—]+\s*/, '').replace(/^\d+[.)]\s+/, '')))
    .filter(Boolean);

  const tareas: TareaPegada[] = [];
  const conocidos = new Set<string>();
  let seccion: Seccion | null = null;
  let sueltas: string[] = [];

  const anotar = (titulo: string, curso: string | undefined, fecha?: FechaLeida) => {
    const delante = curso ? { curso, titulo } : cursoDelante(titulo, conocidos);
    if (!delante.titulo || delante.titulo.length < 2) return;
    if (delante.curso) conocidos.add(plano(delante.curso));
    const entrega = fecha?.entrega;
    tareas.push({
      titulo: delante.titulo.slice(0, 160),
      curso: delante.curso?.slice(0, 80),
      entrega,
      hora: entrega ? fecha?.hora : undefined,
      atrasada: seccion === 'pasado' || (entrega !== undefined && entrega < hoy),
    });
  };

  /**
   * Cierra un grupo de renglones sin fecha: van de dos en dos —título y
   * clase—, salvo cuando el de detrás no parece una clase. La fecha, si la
   * hay, es de la última tarea del grupo.
   */
  const cerrar = (fecha?: FechaLeida) => {
    const grupo = sueltas;
    sueltas = [];
    let i = 0;
    while (i < grupo.length) {
      const titulo = grupo[i];
      const siguiente = grupo[i + 1];
      const quedan = grupo.length - i;
      const conCurso = siguiente !== undefined && (pareceCurso(siguiente, conocidos) || quedan % 2 === 0);
      const ultima = i + (conCurso ? 2 : 1) >= grupo.length;
      anotar(titulo, conCurso ? siguiente : undefined, ultima ? fecha : undefined);
      i += conCurso ? 2 : 1;
    }
  };

  for (const linea of lineas) {
    const p = plano(linea);
    const nueva = seccionDe(p);
    if (nueva) {
      // «Sin fecha de entrega» puede ser rótulo o ir debajo de cada tarea:
      // en los dos casos cierra lo que había, sin fecha, y nada más.
      cerrar();
      if (nueva !== 'sin-fecha') seccion = nueva;
      continue;
    }
    if (esRuido(p) || linea.length > 200) continue;

    const leida = leerFecha(linea, hoy, seccion);
    const fecha = leida && leida.debil && leida.resto.length > 2 && !leida.deEntrega ? null : leida;
    if (fecha && fecha.resto.length <= 2) {
      // Un renglón que sólo es la fecha: es de lo que venía antes.
      if (sueltas.length > 0) cerrar(fecha);
      else {
        const anterior = tareas[tareas.length - 1];
        if (anterior && !anterior.entrega && fecha.entrega) {
          anterior.entrega = fecha.entrega;
          anterior.hora = fecha.hora;
          anterior.atrasada = anterior.atrasada || fecha.entrega < hoy;
        }
      }
      continue;
    }
    if (fecha?.entrega && (fecha.deEntrega || sueltas.length === 0)) {
      // Una tarea entera en un renglón: «Mates: ficha 3 para el jueves».
      cerrar();
      anotar(fecha.resto, undefined, fecha);
      continue;
    }
    sueltas.push(linea);
  }
  cerrar();

  // Sin repetidas: la misma tarea puede pegarse dos veces, de dos pestañas.
  const vistas = new Set<string>();
  return tareas
    .filter((t) => {
      const clave = `${plano(t.curso ?? '')}|${plano(t.titulo)}`;
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .slice(0, PEGADO_MAX_TAREAS);
}

/* ---------------------------------------------------------------------------
 * De lo leído a la foto de siempre
 * ------------------------------------------------------------------------- */

/** Un número corto y estable para los ids: el mismo texto da el mismo id. */
function huella(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * La foto que se guarda, igual que la que baja la conexión con Google. Las
 * tareas sin clase van a la asignatura que se adivine por el título, o a
 * «Otras».
 */
export function snapshotDePegado(tareas: TareaPegada[], generado: string, hoy: DateKey): ClassroomSnapshot {
  const cursos = new Map<string, ClassroomCurso>();
  const cursoId = (nombre: string) => {
    const clave = plano(nombre);
    const hecho = cursos.get(clave);
    if (hecho) return hecho.id;
    const id = `pegado-${huella(clave)}`;
    cursos.set(clave, { id, nombre, temas: [] });
    return id;
  };

  const lista: ClassroomTarea[] = tareas.map((t) => {
    const asignatura = asignaturaDeCurso(t.titulo);
    const curso = t.curso ?? (asignatura ? RETO_META[asignatura].nombre : 'Otras');
    const id = cursoId(curso);
    return {
      id: `pegado-${huella(`${id}|${plano(t.titulo)}`)}`,
      cursoId: id,
      titulo: t.titulo,
      entrega: t.entrega,
      hora: t.hora,
      materiales: [],
      estado: 'pendiente',
      tarde: t.atrasada || (t.entrega !== undefined && t.entrega < hoy),
    };
  });

  return {
    version: 1,
    generado,
    origen: 'pegado',
    cursos: [...cursos.values()],
    tareas: lista,
    avisos: [],
    materiales: [],
  };
}
