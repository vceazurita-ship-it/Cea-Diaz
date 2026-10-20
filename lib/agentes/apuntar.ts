import { addDays, parseDateKey } from '@/lib/dates';
import { getCategories } from '@/lib/habits';
import { isCeiling } from '@/lib/scoring';
import type { DateKey, HabitCategory, Metric, MetricValue, ProfileId } from '@/types';

/* =========================================================================
 *  El apuntador: de una frase a casillas del registro.
 *
 *  Los mayores dejaron de apuntar porque apuntar es abrir, bajar, buscar la
 *  tarjeta y tocar el deslizador. Decir «anoche dormí siete y media, dos
 *  vasos de agua y nada de pantallas» cuesta cinco segundos, y eso sí se
 *  hace. Esto lo traduce a propuestas que se confirman con un toque.
 *
 *  Tres reglas:
 *
 *   1. **Nada sale de fuera del catálogo.** Cada propuesta lleva el id de
 *      una métrica que existe de verdad en el perfil al que va, y un valor
 *      que esa métrica admite. Lo que no encaja no se adivina: va a
 *      `noEntendido`, tal cual se escribió, para que se vea.
 *   2. **La duda se dice.** Cada propuesta lleva su confianza: `alta` si la
 *      frase lo decía claro (cifra con unidad, casilla nombrada), `media` si
 *      hubo que suponer algo (la unidad, el día del sueño), `baja` si el
 *      valor es una conjetura. Las de confianza baja salen desmarcadas.
 *   3. **Todo en el aparato.** Ni una llamada a fuera: diccionario, reglas y
 *      el catálogo de `lib/habits.ts`. Es una función pura —la hora entra
 *      como parámetro— y se prueba con `scripts/probar-apuntar.mjs`.
 *
 *  Cómo se lee una frase:
 *   · Se trocea por comas, puntos, «y», «pero», «ni»… sin romper «7 y
 *     media», «10.000» ni «Leo y Hugo».
 *   · Cada trozo puede nombrar a quién va (Leo, Hugo, «los niños», «yo») y
 *     cuándo (hoy, ayer, anteayer, anoche, «el lunes»). Las dos cosas se
 *     arrastran a los trozos siguientes hasta que otro las cambia.
 *   · En el trozo se buscan menciones de casillas (diccionario de sinónimos
 *     más las palabras de las propias etiquetas), cifras con su unidad y
 *     negaciones, y cada cifra se casa con la mención más cercana que la
 *     admita.
 *   · Un trozo con cifra y sin casilla hereda la del anterior: «Leo, veinte
 *     minutos de lectura; Hugo, treinta».
 * ========================================================================= */

export type Confianza = 'alta' | 'media' | 'baja';

export interface Propuesta {
  profileId: ProfileId;
  date: DateKey;
  metricId: string;
  value: MetricValue;
  confianza: Confianza;
  /** El fragmento literal de la frase del que sale. */
  origen: string;
}

export interface ResultadoApuntar {
  propuestas: Propuesta[];
  /** Trozos de la frase, tal cual, que no se han sabido convertir en casillas. */
  noEntendido: string[];
}

export interface OpcionesApuntar {
  /** El perfil en cuyo panel se escribe: a él va lo que no nombra a nadie. */
  perfilActual: ProfileId;
  /** El día de hoy (`YYYY-MM-DD`), en hora de Madrid. */
  hoy: DateKey;
  /** El catálogo de cada perfil. Por defecto, el de `lib/habits.ts`. */
  catalogo?: (profileId: ProfileId) => HabitCategory[];
  /**
   * Hora en Madrid (0-23). Antes de las cinco, «hoy» es todavía el día
   * anterior: lo que se apunta a la una de la madrugada es de la víspera.
   * Si no llega, se toma la de ahora.
   */
  hora?: number;
}

/* ---------------------------------------------------------------------------
 * Hora de Madrid y día efectivo
 * ------------------------------------------------------------------------- */

/** Hasta esta hora, el día que se apunta es todavía el anterior. */
export const CORTE_MADRUGADA = 5;

/** La fecha y la hora de ahora en Madrid, se esté donde se esté. */
export function ahoraEnMadrid(ahora: Date = new Date()): { hoy: DateKey; hora: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return { hoy: `${parte('year')}-${parte('month')}-${parte('day')}`, hora: Number(parte('hour')) % 24 };
}

/** El día al que va «hoy»: el anterior si aún no son las cinco. */
export function diaEfectivo(hoy: DateKey, hora: number): DateKey {
  return hora < CORTE_MADRUGADA ? addDays(hoy, -1) : hoy;
}

/* ---------------------------------------------------------------------------
 * Quién puede apuntar a quién
 * ------------------------------------------------------------------------- */

/*
 * La app no sabe quién tiene el teléfono, sólo en qué panel se está. El único
 * candado es el PIN de la pareja (`isPrivate`), y la economía lleva su propia
 * clave. Así que la regla es la prudente: un mayor apunta lo suyo y lo de los
 * peques —que es lo que pasa por la noche—, un peque sólo lo suyo, y un
 * panel compartido sólo lo del panel. Nadie apunta por el otro adulto.
 */
const PEQUES: ProfileId[] = ['leo', 'hugo'];
const MAYORES: ProfileId[] = ['maria', 'victor'];

export function perfilesEditables(perfilActual: ProfileId): ProfileId[] {
  if (MAYORES.includes(perfilActual)) return [perfilActual, ...PEQUES];
  return [perfilActual];
}

/* ---------------------------------------------------------------------------
 * Texto plano
 * ------------------------------------------------------------------------- */

/**
 * Minúsculas y sin tildes, **carácter a carácter**: el texto plano mide lo
 * mismo que el original, y así cualquier posición en uno vale en el otro y
 * el `origen` sale literal, con sus tildes y sus mayúsculas.
 */
function plano(texto: string): string {
  let out = '';
  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto[i];
    if (ch === '’' || ch === '′' || ch === '´') {
      out += "'";
      continue;
    }
    const n = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    out += n.length === 0 ? ' ' : n[0];
  }
  return out;
}

/** Singular aproximado: «vasos» y «vaso», «raciones» y «racion», se tratan igual. */
function raiz(palabra: string): string {
  if (palabra.length > 5 && palabra.endsWith('ones')) return palabra.slice(0, -2);
  if (palabra.length > 3 && palabra.endsWith('s')) return palabra.slice(0, -1);
  return palabra;
}

interface Token {
  /** Texto plano. */
  t: string;
  /** Su raíz, para comparar con el vocabulario. */
  r: string;
  start: number;
  end: number;
}

const TOKEN = /[a-zñ]+|\d+(?:[.,:]\d+)*(?:[a-z]+\d*)?'?|['%]/g;

function tokenizar(p: string, desde: number, hasta: number): Token[] {
  const trozo = p.slice(desde, hasta);
  const out: Token[] = [];
  for (const m of Array.from(trozo.matchAll(TOKEN))) {
    const start = desde + (m.index ?? 0);
    out.push({ t: m[0], r: raiz(m[0]), start, end: start + m[0].length });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Troceo de la frase
 * ------------------------------------------------------------------------- */

const DECENAS = new Set(['veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']);
const UNIDADES_LETRA = new Set(['un', 'uno', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']);

interface Trozo {
  start: number;
  end: number;
  /** Viene detrás de un «ni»: la negación del anterior le alcanza. */
  negado: boolean;
}

/**
 * Corta por puntuación y por conjunciones. Una coma o un punto entre dos
 * cifras no corta («10.000», «7,5»); una «y» no corta en «7 y media»,
 * «treinta y cinco» ni «Leo y Hugo».
 */
function trocear(p: string): Trozo[] {
  const SEP = /[;:!?\n()\[\]«»"]+|[.,](?!\d)|(?<!\d)[.,]|\s+(?:y|e|pero|ademas|tambien|ni)\s+/g;
  const out: Trozo[] = [];
  let desde = 0;
  let negado = false;

  for (const m of Array.from(p.matchAll(SEP))) {
    const at = m.index ?? 0;
    const sep = m[0].trim();
    // Los dos puntos de una hora («7:30») no cortan.
    if (sep === ':' && /\d$/.test(p.slice(0, at)) && /^\d/.test(p.slice(at + 1))) continue;
    if (sep === 'y' || sep === 'e') {
      const antes = p.slice(0, at).match(/([a-zñ]+)\s*$/)?.[1] ?? '';
      const despues = p.slice(at + m[0].length).match(/^\s*([a-zñ]+)/)?.[1] ?? '';
      if (['media', 'medio', 'cuarto', 'pico'].includes(despues)) continue;
      if (DECENAS.has(antes) && UNIDADES_LETRA.has(despues)) continue;
      if ((antes === 'leo' && despues === 'hugo') || (antes === 'hugo' && despues === 'leo')) continue;
    }
    if (at > desde) out.push({ start: desde, end: at, negado });
    negado = sep === 'ni';
    desde = at + m[0].length;
  }
  if (desde < p.length) out.push({ start: desde, end: p.length, negado });
  return out.filter((t) => p.slice(t.start, t.end).trim() !== '');
}

/* ---------------------------------------------------------------------------
 * Vocabulario
 * ------------------------------------------------------------------------- */

/**
 * Sinónimos de andar por casa, sólo para casillas que existen. Cada línea:
 * cómo se dice → qué casillas pueden ser, por orden de preferencia. De esa
 * lista se queda la primera que exista en el perfil y admita el valor: «45
 * minutos de gimnasio» va al entrenamiento propio de Víctor, «he ido al
 * gimnasio» a su casilla de fuerza y, en un peque, a su tarjeta de gimnasio.
 * Un id que no exista en el perfil simplemente no cuenta.
 */
const SINONIMOS: Array<[string[], string[]]> = [
  [['dormir', 'dormido', 'dormi', 'dormimos', 'dormio', 'sueno', 'horas de sueno'], ['horas_sueno']],
  [['agua', 'vaso', 'vasos', 'vasito', 'vasitos', 'hidratacion'], ['agua']],
  [['fruta', 'frutas', 'pieza de fruta'], ['fruta_verdura']],
  [['verdura', 'verduras', 'ensalada'], ['fruta_verdura', 'plato_sano']],
  [['azucar', 'dulce', 'dulces', 'chuches', 'golosinas', 'bolleria', 'ultraprocesados', 'ultraprocesado', 'procesados', 'chocolate', 'galletas'], ['poco_dulce']],
  // «leo» no: es casi siempre Leo, y «he leído» o «leí» es como se cuenta lo hecho.
  [['leer', 'leido', 'lei', 'leyo', 'leyendo', 'lectura', 'libro'], ['lectura']],
  [['pantallas', 'pantalla', 'movil', 'tablet', 'tele', 'television', 'videojuegos', 'consola', 'play', 'ordenador', 'youtube'], ['pantallas_ocio', 'sin_pantallas_noche']],
  [['pasos'], ['pasos']],
  [['caminar', 'caminado', 'camine', 'andar', 'andado', 'ande', 'pasear', 'paseado', 'pasee', 'paseo'], ['pasos', 'movimiento', 'actividad_diaria']],
  [['entreno', 'entrenar', 'entrenado', 'entrene', 'entrenamiento', 'gimnasio', 'gym', 'pesas'], ['entreno_propio', 'movimiento', 'fuerza', 'sport.gimnasio.asistencia']],
  [['fuerza'], ['fuerza']],
  [['deporte', 'ejercicio', 'actividad fisica', 'movimiento', 'moverse'], ['movimiento', 'actividad_diaria', 'entreno_propio']],
  [['correr', 'corrido', 'corri', 'carrera', 'running', 'rodaje'], ['marca.rodaje', 'split.rodaje', 'sport.atletismo.asistencia', 'movimiento', 'actividad_diaria']],
  [['nadar', 'nadado', 'nade', 'natacion', 'piscina'], ['sport.natacion.asistencia']],
  [['futbol', 'entreno de futbol'], ['sport.futbol.asistencia']],
  [['karate', 'judo', 'taekwondo', 'arte marcial', 'artes marciales'], ['sport.marcial.asistencia']],
  [['atletismo'], ['sport.atletismo.asistencia']],
  [['meditar', 'meditado', 'medite', 'meditacion', 'respiracion', 'respirar', 'mindfulness', 'pausa consciente'], ['pausa_consciente']],
  [['estudiar', 'estudiado', 'estudie', 'estudio', 'repasar', 'repasado', 'repaso'], ['repaso_examen']],
  [['cafe', 'cafes', 'cafeina'], ['sin_cafeina_tarde']],
  [['alcohol', 'cerveza', 'cervezas', 'vino', 'copa', 'copas', 'cana', 'canas'], ['sin_alcohol']],
  [['desayuno', 'desayunado', 'desayune', 'desayunar'], ['desayuno']],
  [['proteina', 'proteinas'], ['proteina']],
  [['a la cama', 'acostado', 'acostarse', 'acostarme'], ['hora_cama']],
  [['luz natural', 'luz', 'sol'], ['luz_manana']],
  [['diario'], ['diario']],
  [['escribir', 'escrito', 'escribi', 'escritura'], ['escritura']],
  [['master'], ['master']],
  [['podcast', 'formacion', 'curso'], ['formacion']],
  [['siesta', 'descanso', 'descansado'], ['descanso']],
  [['estiramientos', 'estirar', 'estirado', 'movilidad'], ['movilidad']],
  [['peso', 'pesado', 'bascula'], ['peso']],
  [['grasa'], ['grasa']],
  [['pulso', 'pulsaciones'], ['fc_reposo']],
  [['hrv', 'variabilidad'], ['hrv']],
  [['musculo'], ['musculo']],
  [['clases', 'clase', 'dado clase'], ['clases_impartidas']],
  [['preparar clases', 'preparado clases', 'preparado las clases', 'preparacion de clases'], ['prep_clases']],
  [['con los ninos', 'con los peques', 'con leo y hugo', 'con mis hijos', 'con los chicos', 'hijos'], ['tiempo_hijos']],
  [['con maria', 'con mi mujer', 'con mi pareja'], ['tiempo_pareja']],
  [['tareas de casa', 'limpiar', 'limpiado', 'fregar', 'fregado'], ['tareas_casa']],
  [['compra', 'recados', 'papeleo', 'gestiones'], ['gestiones']],
  [['gastos apuntados', 'apuntado los gastos', 'apuntado gastos', 'apunte los gastos'], ['gastos_apuntados']],
  [['compras impulsivas', 'compra impulsiva', 'caprichos', 'capricho'], ['sin_gasto_impulsivo']],
  [['energia'], ['energia', 'energia_aula']],
  [['comidas'], ['comidas']],
  [['suplementos', 'vitaminas', 'creatina'], ['suplementos']],
  [['flexiones'], ['marca.flexiones', 'reto.flexiones', 'split.flexiones']],
  [['plancha'], ['marca.core', 'reto.plancha']],
  [['toques'], ['reto.toques']],
  [['sentadillas', 'sentadilla'], ['reto.sentadillas', 'marca.pierna']],
  [['dominadas'], ['marca.dorsal']],
  [['press de banca', 'banca'], ['marca.pecho']],
];

/** Palabras que no distinguen una casilla de otra aunque salgan en su etiqueta. */
const VACIAS = new Set(
  (
    'de del la las el los lo y e o a al en con sin por para cada mi tu su sus antes despues hora horas dia ' +
    'mejor serie series maximo seguidas seguidos nivel tiempo entrada parte casa propio manana ultima ' +
    'esa ese esta este que muy medio media gasto'
  ).split(' '),
);

/** Etiquetas que, solas, no dicen nada: van con su grupo o no van. */
function esGenerica(m: Metric): boolean {
  return /\.(con|esfuerzo|sensaciones)$/.test(m.id) || m.id.endsWith('.asistencia');
}

interface Entrada {
  /** Raíces de la frase, en orden. */
  frase: string[];
  /** Casillas candidatas que existen en el perfil, por preferencia. */
  ids: string[];
  /** 3: sinónimo o etiqueta entera de varias palabras; 2: etiqueta de una palabra; 1: palabra suelta. */
  fuerza: number;
}

interface Vocabulario {
  entradas: Entrada[];
  metricas: Map<string, Metric>;
}

function raices(texto: string): string[] {
  const p = plano(texto);
  return Array.from(p.matchAll(/[a-zñ]+|\d+/g)).map((m) => raiz(m[0]));
}

function montarVocabulario(categorias: HabitCategory[]): Vocabulario {
  const metricas = new Map<string, Metric>();
  for (const c of categorias) for (const m of c.metrics) metricas.set(m.id, m);
  const entradas: Entrada[] = [];

  for (const [frases, ids] of SINONIMOS) {
    const existentes = ids.filter((id) => metricas.has(id));
    if (existentes.length === 0) continue;
    for (const f of frases) entradas.push({ frase: raices(f), ids: existentes, fuerza: 3 });
  }

  // De las etiquetas: la etiqueta entera y, de sus palabras, las que sólo
  // salen en una casilla del perfil.
  const etiquetas: Array<{ id: string; palabras: string[] }> = [];
  for (const c of categorias) {
    for (const m of c.metrics) {
      if (m.id.endsWith('.asistencia') && m.group) {
        const grupo = c.groups?.find((g) => g.id === m.group);
        if (grupo) etiquetas.push({ id: m.id, palabras: raices(grupo.label) });
        continue;
      }
      if (esGenerica(m)) continue;
      etiquetas.push({ id: m.id, palabras: raices(m.label) });
    }
  }
  const cuenta = new Map<string, Set<string>>();
  for (const e of etiquetas) {
    const utiles = e.palabras.filter((w) => !VACIAS.has(w) && !/^\d/.test(w));
    if (utiles.length) entradas.push({ frase: utiles, ids: [e.id], fuerza: utiles.length > 1 ? 3 : 2 });
    for (const w of utiles) {
      if (!cuenta.has(w)) cuenta.set(w, new Set());
      cuenta.get(w)!.add(e.id);
    }
  }
  for (const [w, ids] of Array.from(cuenta)) {
    if (ids.size === 1 && w.length >= 5) entradas.push({ frase: [w], ids: Array.from(ids), fuerza: 1 });
  }

  return { entradas, metricas };
}

/* El catálogo no cambia en toda la vida de la pestaña: el vocabulario se
   monta una vez por perfil y por catálogo. */
const cacheVocabulario = new WeakMap<(id: ProfileId) => HabitCategory[], Map<ProfileId, Vocabulario>>();

function vocabularioDe(profileId: ProfileId, catalogo: (id: ProfileId) => HabitCategory[]): Vocabulario {
  let porPerfil = cacheVocabulario.get(catalogo);
  if (!porPerfil) {
    porPerfil = new Map();
    cacheVocabulario.set(catalogo, porPerfil);
  }
  let v = porPerfil.get(profileId);
  if (!v) {
    v = montarVocabulario(catalogo(profileId));
    porPerfil.set(profileId, v);
  }
  return v;
}

/* ---------------------------------------------------------------------------
 * Cifras y unidades
 * ------------------------------------------------------------------------- */

const LETRA: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21,
  veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
};

/** Cómo se dice cada unidad → la unidad tal como la escribe el catálogo. */
const UNIDADES: Record<string, string> = {
  h: 'h', hr: 'h', hrs: 'h', hora: 'h', horas: 'h',
  m: 'min', min: 'min', mins: 'min', minuto: 'min', minutos: 'min', "'": 'min',
  s: 's', seg: 's', segs: 's', segundo: 's', segundos: 's',
  vaso: 'vasos', vasos: 'vasos', vasito: 'vasos', vasitos: 'vasos',
  paso: 'pasos', pasos: 'pasos',
  racion: 'raciones', raciones: 'raciones', pieza: 'raciones', piezas: 'raciones',
  kg: 'kg', kilo: 'kg', kilos: 'kg',
  l: 'l', litro: 'l', litros: 'l',
  km: 'km', kilometro: 'km', kilometros: 'km',
  repes: 'repes', repeticiones: 'repes',
  '%': '%',
};

interface Cifra {
  valor: number;
  unidad: string | null;
  /** Índices de token [i, fin). */
  i: number;
  fin: number;
  /** Índice del token que sigue a la cifra, por si es la casilla misma («dos vasos»). */
  siguiente: number;
  /**
   * Un «un» o «una» sin unidad: puede ser artículo («como un bebé»). Sólo
   * vale como cifra pegado a su casilla («un vaso de agua»).
   */
  articulo?: boolean;
}

function numeroDeDigitos(t: string): { valor: number; unidad: string | null } | null {
  let m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return { valor: Number(m[1]) + Number(m[2]) / 60, unidad: 'h' };
  m = t.match(/^(\d+)h(\d{1,2})?$/);
  if (m) return { valor: Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0), unidad: 'h' };
  m = t.match(/^(\d{1,3}(?:\.\d{3})+)([a-z']*)$/);
  if (m) {
    const base = Number(m[1].replace(/\./g, ''));
    return m[2] ? sufijo(base, m[2]) : { valor: base, unidad: null };
  }
  m = t.match(/^(\d+(?:[.,]\d+)?)([a-z']*)$/);
  if (!m) return null;
  const base = Number(m[1].replace(',', '.'));
  return m[2] ? sufijo(base, m[2]) : { valor: base, unidad: null };
}

function sufijo(base: number, s: string): { valor: number; unidad: string | null } | null {
  if (s === 'k') return { valor: base * 1000, unidad: null };
  const unidad = UNIDADES[s];
  return unidad ? { valor: base, unidad } : null;
}

/**
 * Lee una cifra empezando en el token `i`: «8 h», «7h30», «7 y media»,
 * «45'», «una hora», «hora y media», «media hora», «10.000», «10k», «diez
 * mil», «treinta y cinco». Devuelve `null` si ahí no empieza ninguna.
 */
function leerCifra(tk: Token[], i: number, libre: (j: number) => boolean): Cifra | null {
  const t = (j: number) => (j < tk.length && libre(j) ? tk[j].t : '');
  let j = i;
  let valor = 0;
  let unidad: string | null = null;

  if (t(j) === 'media' && t(j + 1) === 'hora') return { valor: 0.5, unidad: 'h', i, fin: j + 2, siguiente: j + 2 };
  if (t(j) === 'medio' && t(j + 1) === 'litro') {
    const siguiente = t(j + 2) === 'de' ? j + 3 : j + 2;
    return { valor: 0.5, unidad: 'l', i, fin: j + 2, siguiente };
  }
  if (t(j) === 'cuarto' && t(j + 1) === 'de' && t(j + 2) === 'hora') return { valor: 15, unidad: 'min', i, fin: j + 3, siguiente: j + 3 };
  if ((t(j) === 'hora') && t(j + 1) === 'y' && t(j + 2) === 'media') return { valor: 1.5, unidad: 'h', i, fin: j + 3, siguiente: j + 3 };
  if (t(j) === 'un' && t(j + 1) === 'par' && t(j + 2) === 'de') {
    valor = 2;
    j += 3;
  } else if (/^\d/.test(t(j))) {
    const d = numeroDeDigitos(t(j));
    if (!d) return null;
    valor = d.valor;
    unidad = d.unidad;
    j += 1;
  } else if (t(j) in LETRA) {
    valor = LETRA[t(j)];
    j += 1;
    if (DECENAS.has(tk[j - 1].t) && t(j) === 'y' && UNIDADES_LETRA.has(t(j + 1))) {
      valor += LETRA[t(j + 1)];
      j += 2;
    } else if (valor === 100 && t(j) in LETRA && LETRA[t(j)] < 100) {
      valor += LETRA[t(j)];
      j += 1;
    }
  } else {
    return null;
  }

  if (t(j) === 'mil') {
    valor *= 1000;
    j += 1;
  }

  const FRACCIONES: Array<[string, string, number]> = [
    ['y', 'media', 0.5],
    ['y', 'medio', 0.5],
    ['y', 'cuarto', 0.25],
    ['menos', 'cuarto', -0.25],
  ];
  const fraccion = () => {
    const f = FRACCIONES.find(([a, b]) => t(j) === a && t(j + 1) === b);
    if (!f) return false;
    valor += f[2];
    j += 2;
    return true;
  };

  let conFraccion = fraccion();
  if (!unidad && t(j) in UNIDADES) {
    unidad = UNIDADES[t(j)];
    j += 1;
  } else if (!unidad && t(j) === "'") {
    unidad = 'min';
    j += 1;
  }
  if (!conFraccion) conFraccion = fraccion();
  // «7 h 30», «7 horas 30 minutos».
  if (unidad === 'h' && !conFraccion && /^\d{1,2}$/.test(t(j)) && Number(t(j)) < 60) {
    valor += Number(t(j)) / 60;
    j += 1;
    if (UNIDADES[t(j)] === 'min') j += 1;
  }

  // Tras la cifra, saltando un «de», puede venir la casilla misma.
  const siguiente = t(j) === 'de' ? j + 1 : j;
  const articulo = ['un', 'una', 'uno'].includes(tk[i].t) && j === i + 1 && !unidad;
  return { valor, unidad, i, fin: j, siguiente, articulo };
}

/** Pasa `valor` de la unidad dicha a la de la casilla, o `null` si no casan. */
function convertir(valor: number, de: string | null, a: string): number | null {
  if (de === null || de === a) return valor;
  if (de === 'h' && a === 'min') return valor * 60;
  if (de === 'min' && a === 'h') return valor / 60;
  if (de === 's' && a === 'min') return valor / 60;
  if (de === 'min' && a === 's') return valor * 60;
  // El vaso de la app es el de casa, de un cuarto de litro.
  if (de === 'l' && a === 'vasos') return Math.round(valor * 4);
  return null;
}

/* ---------------------------------------------------------------------------
 * Fechas y perfiles dentro del trozo
 * ------------------------------------------------------------------------- */

const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

/** El último `dia` (0 = lunes) ya pasado; si hoy es ese día, el de hace una semana. */
function ultimoDia(hoy: DateKey, dia: number): DateKey {
  const hoyIdx = (parseDateKey(hoy).getDay() + 6) % 7;
  const atras = (hoyIdx - dia + 7) % 7 || 7;
  return addDays(hoy, -atras);
}

function leerFecha(tk: Token[], i: number, hoy: DateKey): { date: DateKey; len: number } | null {
  const t = (j: number) => tk[j]?.t ?? '';
  if (t(i) === 'hoy') return { date: hoy, len: 1 };
  if (t(i) === 'esta' && ['manana', 'tarde', 'noche'].includes(t(i + 1))) return { date: hoy, len: 2 };
  if (t(i) === 'ayer' || t(i) === 'anoche') return { date: addDays(hoy, -1), len: 1 };
  if (t(i) === 'anteayer' || t(i) === 'antier') return { date: addDays(hoy, -2), len: 1 };
  if (t(i) === 'antes' && t(i + 1) === 'de' && t(i + 2) === 'ayer') return { date: addDays(hoy, -2), len: 3 };
  let j = i;
  if (t(j) === 'el' || t(j) === 'este') j += 1;
  const dia = DIAS_SEMANA.indexOf(t(j));
  if (dia >= 0) {
    j += 1;
    if (t(j) === 'pasado') j += 1;
    return { date: ultimoDia(hoy, dia), len: j - i };
  }
  return null;
}

/** «Los niños», «Leo», «yo»… → a quién va. `null` si en `i` no se nombra a nadie. */
function leerPerfil(
  tk: Token[],
  i: number,
  original: string,
  perfilActual: ProfileId,
): { ids: ProfileId[]; len: number } | null {
  const t = (j: number) => tk[j]?.t ?? '';
  // «Tiempo con Leo y Hugo», «con María»: es de quien escribe, no de ellos.
  if (t(i - 1) === 'con' || ((t(i - 1) === 'los' || t(i - 1) === 'mis') && t(i - 2) === 'con')) return null;
  if ((t(i) === 'leo' && t(i + 1) === 'y' && t(i + 2) === 'hugo') || (t(i) === 'hugo' && t(i + 1) === 'y' && t(i + 2) === 'leo')) {
    return { ids: ['leo', 'hugo'], len: 3 };
  }
  if (t(i) === 'los' && ['ninos', 'peques', 'chicos', 'crios'].includes(t(i + 1))) return { ids: ['leo', 'hugo'], len: 2 };
  if (['ninos', 'peques'].includes(t(i))) return { ids: ['leo', 'hugo'], len: 1 };
  if (t(i) === 'hugo') return { ids: ['hugo'], len: 1 };
  if (t(i) === 'maria') return { ids: ['maria'], len: 1 };
  if (t(i) === 'victor') return { ids: ['victor'], len: 1 };
  if (t(i) === 'yo') return { ids: [perfilActual], len: 1 };
  // «leo» es también «yo leo»: es el niño si va con mayúscula o abre el trozo.
  if (t(i) === 'leo') {
    const mayuscula = /[A-Z]/.test(original[tk[i].start] ?? '');
    if (mayuscula || i === 0) return { ids: ['leo'], len: 1 };
  }
  return null;
}

/**
 * Coletillas de hora que no son cantidades: «antes de dormir», «por la
 * tarde», «a las 22:00». Se consumen para que «dormir» no apunte sueño ni
 * «22» se tome por una cifra. El momento que dicen cambia la casilla: con
 * `noche`, las pantallas van a la de la última hora; sin `tarde`, un café
 * no rompe el «sin cafeína después de las 15:00».
 */
type Momento = 'noche' | 'tarde' | null;

function leerColetilla(tk: Token[], i: number): { len: number; momento: Momento } | null {
  const t = (j: number) => tk[j]?.t ?? '';
  if (t(i) === 'antes' && t(i + 1) === 'de' && ['dormir', 'acostarme', 'acostarse', 'acostarnos'].includes(t(i + 2))) return { len: 3, momento: 'noche' };
  if (t(i) === 'antes' && t(i + 1) === 'de' && t(i + 2) === 'la' && t(i + 3) === 'cama') return { len: 4, momento: 'noche' };
  if (t(i) === 'por' && t(i + 1) === 'la' && t(i + 2) === 'noche') return { len: 3, momento: 'noche' };
  if (t(i) === 'la' && t(i + 1) === 'ultima' && t(i + 2) === 'hora') return { len: 3, momento: 'noche' };
  if (t(i) === 'ultima' && t(i + 1) === 'hora') return { len: 2, momento: 'noche' };
  if (t(i) === 'por' && t(i + 1) === 'la' && t(i + 2) === 'tarde') return { len: 3, momento: 'tarde' };
  if (t(i) === 'por' && t(i + 1) === 'la' && t(i + 2) === 'manana') return { len: 3, momento: null };
  if (t(i) === 'despues' && t(i + 1) === 'de' && t(i + 2) === 'comer') return { len: 3, momento: 'tarde' };
  // «antes de las 10», «después de las 15:00», «a las 22»
  const conHora = (j: number) => (t(j) === 'las' || t(j) === 'la') && (/^\d/.test(t(j + 1)) || t(j + 1) in LETRA);
  if (t(i) === 'despues' && t(i + 1) === 'de' && conHora(i + 2)) return { len: 4, momento: 'tarde' };
  if (t(i) === 'antes' && t(i + 1) === 'de' && conHora(i + 2)) return { len: 4, momento: null };
  if (t(i) === 'a' && conHora(i + 1)) return { len: 3, momento: null };
  return null;
}

const NEGACIONES = new Set(['no', 'sin', 'nada', 'ni', 'ningun', 'ninguna', 'ninguno', 'tampoco', 'nunca']);

/** Palabras de relleno: un trozo hecho sólo de ellas no es «no entendido». */
const RELLENO = new Set(
  (
    'he ha han hemos habeis hecho hice hizo hicimos y e de del la el los las un una unos unas a al en con que muy bien ' +
    'mucho poco tambien ademas pero ido fui fue fuimos me se mi mis su sus por para total sido hoy si vale ok tenido ' +
    'tomado tome hecho estado era unas lo le les nos'
  ).split(' '),
);

/* ---------------------------------------------------------------------------
 * Del valor dicho al valor de la casilla
 * ------------------------------------------------------------------------- */

/** Casillas de sí o no que se cumplen absteniéndose: «Día sin alcohol», «Poco dulce…». */
function esAbstencion(m: Metric): boolean {
  return /^(sin |dia sin |poco )/.test(plano(m.label));
}

const RANGO_CONF: Record<Confianza, number> = { alta: 2, media: 1, baja: 0 };
function peor(a: Confianza, b: Confianza): Confianza {
  return RANGO_CONF[a] <= RANGO_CONF[b] ? a : b;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

interface Dicho {
  cifra: Cifra | null;
  /** La cifra va pegada a la casilla («dos vasos», «10.000 pasos»). */
  pegada: boolean;
  negado: boolean;
}

/**
 * El valor que toca en la casilla según lo dicho, o `null` si no casa. Con
 * `adivinar`, a una casilla de cifra sin cifra se le propone su meta, con
 * confianza baja: un toque si es eso, y desmarcada si no.
 */
function valorPara(m: Metric, d: Dicho, adivinar: boolean): { value: MetricValue; confianza: Confianza } | null {
  switch (m.type) {
    case 'toggle': {
      if (d.cifra) return null;
      const abst = esAbstencion(m);
      if (d.negado) return { value: abst, confianza: 'alta' };
      return { value: !abst, confianza: abst ? 'media' : 'alta' };
    }
    case 'counter':
    case 'duration': {
      if (d.cifra) {
        const v = convertir(d.cifra.valor, d.cifra.unidad, m.unit);
        if (v === null) return null;
        const valor = redondear(v);
        const lo = m.type === 'duration' ? m.min : 0;
        let confianza: Confianza = d.cifra.unidad || d.pegada ? 'alta' : 'media';
        if (valor < lo || valor > m.max) confianza = 'baja';
        return { value: valor, confianza };
      }
      // «Nada de pantallas» cumple el techo; «no he leído» es un cero en la meta.
      if (d.negado) {
        const lo = m.type === 'duration' ? m.min : 0;
        return { value: 0, confianza: isCeiling(m) || lo <= 0 ? 'alta' : 'baja' };
      }
      if (adivinar) return { value: m.target, confianza: 'baja' };
      return null;
    }
    case 'scale': {
      if (!d.cifra || d.cifra.unidad) return null;
      const n = d.cifra.valor;
      if (!Number.isInteger(n) || n < m.min || n > m.max) return null;
      return { value: n, confianza: 'media' };
    }
    default:
      return null;
  }
}

/* ---------------------------------------------------------------------------
 * Un trozo, para un perfil
 * ------------------------------------------------------------------------- */

interface Mencion {
  i: number;
  fin: number;
  ids: string[];
  fuerza: number;
}

interface Analisis {
  propuestas: Array<Omit<Propuesta, 'profileId' | 'date'> & { sueno: boolean }>;
  /** Menciones que no se han podido convertir, en texto literal. */
  sueltas: string[];
  /** Cifras sin casilla. */
  cifrasSueltas: Cifra[];
  /** Lo último mencionado, para el trozo siguiente. */
  ultima: Mencion | null;
  /** Hay algo que no es relleno y no se ha usado. */
  resto: boolean;
}

function buscarMenciones(tk: Token[], usado: boolean[], voc: Vocabulario): Mencion[] {
  const out: Mencion[] = [];
  for (let i = 0; i < tk.length; i += 1) {
    if (usado[i]) continue;
    let mejor: Mencion | null = null;
    for (const e of voc.entradas) {
      const n = e.frase.length;
      if (i + n > tk.length) continue;
      let casa = true;
      for (let k = 0; k < n; k += 1) {
        if (usado[i + k] || tk[i + k].r !== e.frase[k]) {
          casa = false;
          break;
        }
      }
      if (!casa) continue;
      if (!mejor || n > mejor.fin - mejor.i || (n === mejor.fin - mejor.i && e.fuerza > mejor.fuerza)) {
        mejor = { i, fin: i + n, ids: [...e.ids], fuerza: e.fuerza };
      } else if (n === mejor.fin - mejor.i && e.fuerza === mejor.fuerza) {
        for (const id of e.ids) if (!mejor.ids.includes(id)) mejor.ids.push(id);
      }
    }
    // Sin nada exacto, una palabra de etiqueta que empiece igual: «preparé» y
    // «preparación», «analizado» y «análisis». Cuenta como palabra suelta.
    if (!mejor && tk[i].t.length >= 6) {
      const cabeza = tk[i].t.slice(0, 6);
      const e = voc.entradas.find((x) => x.frase.length === 1 && x.fuerza <= 2 && x.frase[0].length >= 6 && x.frase[0].startsWith(cabeza));
      if (e) mejor = { i, fin: i + 1, ids: [...e.ids], fuerza: 1 };
    }
    if (mejor) {
      out.push(mejor);
      for (let k = mejor.i; k < mejor.fin; k += 1) usado[k] = true;
      i = mejor.fin - 1;
    }
  }
  // Dos menciones de la misma casilla en un trozo («horas de sueño, he dormido») son una.
  return out.filter((m, idx) => out.findIndex((o) => o.ids[0] === m.ids[0]) === idx);
}

function admiteCifra(voc: Vocabulario, ids: string[], c: Cifra): boolean {
  return ids.some((id) => {
    const m = voc.metricas.get(id);
    if (!m) return false;
    if (m.type === 'counter' || m.type === 'duration') return convertir(c.valor, c.unidad, m.unit) !== null;
    if (m.type === 'scale') return c.unidad === null;
    return false;
  });
}

function analizarTrozo(
  tk: Token[],
  usadoBase: boolean[],
  voc: Vocabulario,
  momento: { noche: boolean; tarde: boolean },
  negadoTrozo: boolean,
  heredada: Mencion | null,
  original: string,
): Analisis {
  const usado = [...usadoBase];
  const menciones = buscarMenciones(tk, usado, voc);
  if (momento.noche) {
    for (const m of menciones) {
      if (m.ids.includes('pantallas_ocio') && voc.metricas.has('sin_pantallas_noche')) {
        m.ids = ['sin_pantallas_noche', ...m.ids.filter((id) => id !== 'sin_pantallas_noche')];
      }
    }
  }

  // Cifras, en lo que queda libre. Una casilla puede hacer de unidad («dos
  // vasos», «diez mil pasos»): la cifra la lee, y la mención sigue siendo suya.
  const dentroDeMencion = (k: number) => menciones.some((m) => k >= m.i && k < m.fin);
  const libreParaCifra = (j: number) => !usadoBase[j];
  const cifras: Cifra[] = [];
  for (let i = 0; i < tk.length; i += 1) {
    if (usadoBase[i] || dentroDeMencion(i)) continue;
    const c = leerCifra(tk, i, libreParaCifra);
    if (!c) continue;
    cifras.push(c);
    for (let k = c.i; k < c.fin; k += 1) if (!dentroDeMencion(k)) usado[k] = true;
    i = c.fin - 1;
  }

  // Cada cifra, con la mención más cercana que la admita.
  const ligadas = new Map<Mencion, { cifra: Cifra; pegada: boolean }>();
  const pares: Array<{ m: Mencion; c: Cifra; dist: number; pegada: boolean }> = [];
  for (const c of cifras) {
    for (const m of menciones) {
      if (!admiteCifra(voc, m.ids, c)) continue;
      const pegada = c.siguiente === m.i || (c.fin > m.i && c.i < m.i);
      if (c.articulo && !pegada) continue;
      const dist = pegada ? -1 : c.i >= m.fin ? c.i - m.fin : m.i - c.fin;
      pares.push({ m, c, dist, pegada });
    }
  }
  pares.sort((a, b) => a.dist - b.dist);
  const cifrasUsadas = new Set<Cifra>();
  for (const p of pares) {
    if (ligadas.has(p.m) || cifrasUsadas.has(p.c)) continue;
    ligadas.set(p.m, { cifra: p.c, pegada: p.pegada });
    cifrasUsadas.add(p.c);
  }

  // Una cifra sin mención en un trozo sin menciones hereda la del trozo anterior.
  let ultima: Mencion | null = menciones.length ? menciones[menciones.length - 1] : null;
  const heredadas: Mencion[] = [];
  if (menciones.length === 0 && heredada) {
    const ids = heredada.ids.filter((id) => voc.metricas.has(id));
    const c = cifras.find((x) => !cifrasUsadas.has(x) && admiteCifra(voc, ids, x));
    if (ids.length && c) {
      const m: Mencion = { i: c.i, fin: c.fin, ids, fuerza: 0 };
      heredadas.push(m);
      ligadas.set(m, { cifra: c, pegada: false });
      cifrasUsadas.add(c);
      ultima = heredada;
    }
  }

  const propuestas: Analisis['propuestas'] = [];
  const sueltas: string[] = [];
  const todas = [...menciones, ...heredadas];
  for (let idx = 0; idx < todas.length; idx += 1) {
    const m = todas[idx];
    const ligada = ligadas.get(m);
    // La negación alcanza a la mención siguiente: desde la anterior hasta ella.
    const desde = idx > 0 && idx < menciones.length ? menciones[idx - 1].fin : 0;
    let negado = negadoTrozo;
    for (let k = desde; k < m.i; k += 1) if (NEGACIONES.has(tk[k].t)) negado = true;
    const dicho: Dicho = { cifra: ligada?.cifra ?? null, pegada: ligada?.pegada ?? false, negado };

    let elegido: { id: string; value: MetricValue; confianza: Confianza } | null = null;
    for (const adivinar of [false, true]) {
      for (const id of m.ids) {
        const metrica = voc.metricas.get(id);
        if (!metrica) continue;
        // El café de la mañana no rompe nada: sólo cuenta si se dice que fue por la tarde.
        if (id === 'sin_cafeina_tarde' && !dicho.negado && !momento.tarde) continue;
        const v = valorPara(metrica, dicho, adivinar);
        if (v) {
          elegido = { id, ...v };
          break;
        }
      }
      if (elegido) break;
    }

    // Lo literal: desde la negación o la cifra hasta el final de la mención.
    let a = m.i;
    let b = m.fin;
    if (ligada) {
      a = Math.min(a, ligada.cifra.i);
      b = Math.max(b, ligada.cifra.fin);
    }
    if (negado) for (let k = desde; k < a; k += 1) if (NEGACIONES.has(tk[k].t)) a = k;
    const origen = m.fuerza === 0 ? original.slice(tk[0].start, tk[tk.length - 1].end).trim() : original.slice(tk[a].start, tk[b - 1].end);

    if (!elegido) {
      sueltas.push(origen);
      continue;
    }
    let confianza = elegido.confianza;
    if (m.fuerza === 0) confianza = peor(confianza, 'media');
    if (m.fuerza === 1) confianza = peor(confianza, 'media');
    propuestas.push({ metricId: elegido.id, value: elegido.value, confianza, origen, sueno: elegido.id === 'horas_sueno' });
  }

  const cifrasSueltas = cifras.filter((c) => !cifrasUsadas.has(c));
  const resto = tk.some((tok, k) => !usado[k] && !RELLENO.has(tok.t) && !NEGACIONES.has(tok.t));
  return { propuestas, sueltas, cifrasSueltas, ultima, resto };
}

/* ---------------------------------------------------------------------------
 * La frase entera
 * ------------------------------------------------------------------------- */

/**
 * El sueño se apunta en el día en que empieza la noche: es como lo cruza la
 * agenda, donde el rato «A dormir» de las 22:00 del lunes se contrasta con
 * las horas de sueño del lunes. Así que «anoche dormí siete horas» va a
 * ayer, y «he dormido siete horas» sin más, también: la noche que se cuenta
 * por la mañana es la de ayer. Sólo un «hoy» explícito lo deja en hoy.
 */
const SUENO_DE_ANOCHE_EN_AYER = true;

export function interpretar(frase: string, opciones: OpcionesApuntar): ResultadoApuntar {
  const catalogo = opciones.catalogo ?? getCategories;
  const hora = opciones.hora ?? ahoraEnMadrid().hora;
  const hoy = diaEfectivo(opciones.hoy, hora);
  const editables = perfilesEditables(opciones.perfilActual);

  const p = plano(frase);
  const propuestas: Propuesta[] = [];
  const noEntendido: string[] = [];

  let perfiles: ProfileId[] = [opciones.perfilActual];
  let fecha: DateKey = hoy;
  let fechaDicha = false;
  let heredada: Mencion | null = null;

  // Trozos por puntuación y conjunción; dentro, también se corta donde se nombra a alguien.
  const piezas: Array<{ tk: Token[]; negado: boolean }> = [];
  for (const tr of trocear(p)) {
    const tk = tokenizar(p, tr.start, tr.end);
    let desde = 0;
    for (let i = 0; i < tk.length; i += 1) {
      const quien = leerPerfil(tk, i, frase, opciones.perfilActual);
      if (!quien) continue;
      if (i > desde) piezas.push({ tk: tk.slice(desde, i), negado: tr.negado && desde === 0 });
      desde = i;
      i += quien.len - 1;
    }
    if (desde < tk.length) piezas.push({ tk: tk.slice(desde), negado: tr.negado && desde === 0 });
  }

  for (const { tk, negado } of piezas) {
    if (tk.length === 0) continue;
    const literal = frase.slice(tk[0].start, tk[tk.length - 1].end).trim();
    const usado = tk.map(() => false);

    // Quién, cuándo y coletillas de hora.
    const momento = { noche: false, tarde: tk.some((x) => x.t === 'tarde') };
    for (let i = 0; i < tk.length; i += 1) {
      if (usado[i]) continue;
      const quien = leerPerfil(tk, i, frase, opciones.perfilActual);
      if (quien) {
        perfiles = quien.ids;
        for (let k = i; k < i + quien.len; k += 1) usado[k] = true;
        i += quien.len - 1;
        continue;
      }
      const cuando = leerFecha(tk, i, hoy);
      if (cuando) {
        fecha = cuando.date;
        fechaDicha = true;
        for (let k = i; k < i + cuando.len; k += 1) usado[k] = true;
        i += cuando.len - 1;
        continue;
      }
      const col = leerColetilla(tk, i);
      if (col) {
        if (col.momento === 'noche') momento.noche = true;
        if (col.momento === 'tarde') momento.tarde = true;
        for (let k = i; k < i + col.len; k += 1) usado[k] = true;
        i += col.len - 1;
      }
    }

    const permitidos = perfiles.filter((id) => editables.includes(id));
    if (permitidos.length < perfiles.length) {
      // Para alguien a quien no se puede apuntar desde aquí: se dice y no se toca.
      noEntendido.push(literal);
      continue;
    }

    let nuevaHeredada: Mencion | null = heredada;
    let algo = false;
    const sueltas = new Set<string>();
    let cifrasSueltas = false;
    let resto = false;
    for (const perfil of permitidos) {
      const voc = vocabularioDe(perfil, catalogo);
      const a = analizarTrozo(tk, usado, voc, momento, negado, heredada, frase);
      if (a.ultima) nuevaHeredada = a.ultima;
      for (const s of a.sueltas) sueltas.add(s);
      if (a.cifrasSueltas.length) cifrasSueltas = true;
      if (a.resto) resto = true;
      for (const pr of a.propuestas) {
        algo = true;
        let date = fecha;
        let confianza = pr.confianza;
        if (pr.sueno && SUENO_DE_ANOCHE_EN_AYER && !fechaDicha) {
          date = addDays(hoy, -1);
          confianza = peor(confianza, 'media');
        }
        // La última palabra manda: si la misma casilla sale dos veces, vale la segunda.
        const previa = propuestas.findIndex((x) => x.profileId === perfil && x.date === date && x.metricId === pr.metricId);
        if (previa >= 0) propuestas.splice(previa, 1);
        propuestas.push({ profileId: perfil, date, metricId: pr.metricId, value: pr.value, confianza, origen: pr.origen });
      }
    }
    heredada = nuevaHeredada;

    for (const s of Array.from(sueltas)) if (!noEntendido.includes(s)) noEntendido.push(s);
    if (!algo && sueltas.size === 0 && (resto || cifrasSueltas)) noEntendido.push(literal);
  }

  return { propuestas, noEntendido };
}
