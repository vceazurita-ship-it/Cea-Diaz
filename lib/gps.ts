import { addDays, formatShort, todayKey } from '@/lib/dates';
import type { DateKey, GpsBook, GpsKind, GpsSession, Profile, ProfileId } from '@/types';

/* =========================================================================
 *  El GPS de los entrenamientos de Leo y Hugo.
 *
 *  Los dos entrenan con un rastreador Footbar. Después de cada sesión, su
 *  aplicación enseña unas cifras —lo corrido, los esprines, la punta de
 *  velocidad, los balones tocados— y ahí se quedan: la cuenta gratuita no
 *  exporta nada, no tiene API y sólo deja mirar sesión por sesión en el
 *  móvil. Para saber si el crío corre más que hace tres meses hay que ir
 *  abriendo pantallas y acordarse de memoria, que es como no saberlo.
 *
 *  Así que las cifras entran aquí **a mano, de un pegote**: una línea por
 *  sesión, con los números en el orden que sea y en castellano o en inglés.
 *  El formato de casa es éste, y es el que se pega tal cual:
 *
 *      2026-09-09 entreno 90min 5,2km 12 sprints 24,3km/h 480 toques
 *
 *  A partir de ahí ya son datos de la casa: se guardan, viajan al resto de
 *  aparatos como todo lo demás y —esto es lo que no da Footbar— se comparan
 *  entre sí. Qué sesión fue la mejor, si la distancia sube o lleva un mes
 *  plana, cuánto más se corre en partido que en entreno.
 *
 *  Dos reglas para no mentir:
 *
 *   1. Lo que no venga en la sesión se queda vacío. Un cero inventado se
 *      cuela en las medias y estropea justo la comparación que se buscaba.
 *   2. Nada se registra solo en los hábitos. Que el GPS diga que hubo
 *      noventa minutos de fútbol es un hecho, pero pasarlo al día es una
 *      decisión, y se ofrece con un botón como todo lo demás en esta app.
 * ========================================================================= */

export const GPS_KEY = 'habitos-familia:gps';

/** Marca de la libreta que nadie ha tocado. */
const NEVER = '1970-01-01T00:00:00.000Z';

/** Tope de sesiones por perfil. Tres años de entrenos caben de sobra. */
export const MAX_SESSIONS = 400;

/** El rastreador que usan en casa; se nombra donde hay que explicar de dónde sale esto. */
export const TRACKER = 'Footbar';

/** Sólo los peques llevan rastreador: la sección no existe en los demás paneles. */
export function gpsEnabledFor(profile: Profile): boolean {
  return profile.kind === 'kid';
}

/* ---------------------------------------------------------------------------
 * Qué mide el aparato
 * ------------------------------------------------------------------------- */

/** Las cifras de una sesión que son números; el resto es fecha, tipo y nota. */
export type GpsFieldId =
  | 'minutes'
  | 'distance'
  | 'intense'
  | 'sprints'
  | 'topSpeed'
  | 'touches'
  | 'passes'
  | 'shots'
  | 'score';

export interface GpsField {
  id: GpsFieldId;
  label: string;
  /** Cómo se dice donde no cabe el nombre entero. */
  short: string;
  icon: string;
  unit: string;
  /** Decimales con los que se enseña. */
  decimals: number;
  /**
   * `true` si tiene sentido dividirlo entre el tiempo jugado. Correr cinco
   * kilómetros en una hora y en dos horas no es lo mismo, y sin esto una
   * sesión larga y floja parecería la mejor de todas.
   */
  perHour?: boolean;
  /**
   * `false` en lo que no es una marca que batir. Jugar más minutos no es
   * mejor que jugar menos, así que el tiempo no compite por el récord.
   */
  record?: boolean;
  /** Cómo se nombra al pegar la sesión, además de su unidad. */
  keys: string[];
  /** Unidades que pueden ir pegadas al número. */
  units?: string[];
  /**
   * Entre qué dos valores puede estar esta cifra en una sesión de verdad.
   *
   * No sirve para corregir a nadie que escriba a mano —lo que se teclea se
   * guarda— sino para leer capturas de pantalla: ahí los números salen de
   * reconocer formas, y un «24,3 km/h» leído como «243 km/h» no es una marca
   * excepcional, es un error. Lo que cae fuera de la horquilla no se guarda y
   * se dice cuál era, que es lo contrario de tragárselo en silencio.
   */
  sane: [number, number];
}

/**
 * El orden es el de lectura: primero cuánto duró, luego cuánto se corrió,
 * después a qué intensidad y por último lo que se hizo con el balón.
 *
 * Es catálogo editable, como los hábitos: el día que la aplicación enseñe
 * una cifra más, se añade aquí un objeto y aparece sola en todas partes —en
 * el pegote, en la ficha de la sesión, en los récords y en la evolución—.
 */
export const GPS_FIELDS: GpsField[] = [
  {
    id: 'minutes',
    label: 'Tiempo jugado',
    short: 'Tiempo',
    icon: '⏱️',
    unit: 'min',
    decimals: 0,
    record: false,
    keys: ['minutos', 'minutes', 'tiempo', 'duración', 'duracion', 'playing time', 'min'],
    units: ['min', "'"],
    sane: [1, 300],
  },
  {
    id: 'distance',
    label: 'Distancia recorrida',
    short: 'Distancia',
    icon: '🛣️',
    unit: 'km',
    decimals: 2,
    perHour: true,
    keys: ['distancia', 'distance', 'recorrido', 'dist'],
    // Los metros cuentan como distancia y no como intensidad: quien escribe
    // «5000 m» en una línea de entrenamiento está diciendo lo que corrió. Lo
    // de alta intensidad se dice por su nombre, que además es como lo escribe
    // esta misma app al copiar una sesión.
    units: ['km', 'kms', 'm', 'metros'],
    sane: [0.1, 30],
  },
  {
    id: 'intense',
    label: 'A alta intensidad',
    short: 'Intensidad',
    icon: '🔥',
    unit: 'm',
    decimals: 0,
    perHour: true,
    keys: [
      'alta intensidad',
      'intensidad',
      'intensos',
      'high intensity',
      'sprint distance',
      'hid',
    ],
    sane: [1, 9000],
  },
  {
    id: 'sprints',
    label: 'Esprines',
    short: 'Esprines',
    icon: '💨',
    unit: '',
    decimals: 0,
    perHour: true,
    keys: ['esprines', 'esprints', 'sprints', 'sprint', 'aceleraciones'],
    sane: [0, 300],
  },
  {
    id: 'topSpeed',
    label: 'Velocidad punta',
    short: 'Punta',
    icon: '⚡',
    unit: 'km/h',
    decimals: 1,
    keys: [
      'velocidad máxima',
      'velocidad maxima',
      'velocidad punta',
      'top speed',
      'max speed',
      'vmax',
      'vel max',
      'punta',
    ],
    units: ['km/h', 'kmh'],
    sane: [3, 45],
  },
  {
    id: 'touches',
    label: 'Balones tocados',
    short: 'Toques',
    icon: '⚽',
    unit: '',
    decimals: 0,
    perHour: true,
    keys: ['toques', 'balones', 'balones tocados', 'touches', 'ball touches', 'kicks', 'contactos'],
    sane: [0, 4000],
  },
  {
    id: 'passes',
    label: 'Pases',
    short: 'Pases',
    icon: '🎯',
    unit: '',
    decimals: 0,
    keys: ['pases', 'passes'],
    sane: [0, 1500],
  },
  {
    id: 'shots',
    label: 'Tiros',
    short: 'Tiros',
    icon: '🥅',
    unit: '',
    decimals: 0,
    keys: ['tiros', 'disparos', 'shots'],
    sane: [0, 300],
  },
  {
    id: 'score',
    label: 'Puntuación de la sesión',
    short: 'Puntuación',
    icon: '⭐',
    unit: '',
    decimals: 0,
    keys: ['puntuación', 'puntuacion', 'score', 'rating', 'nota footbar'],
    sane: [0, 100],
  },
];

export const GPS_FIELD_LIST = GPS_FIELDS.map((field) => field.id);

const FIELD_BY_ID = new Map(GPS_FIELDS.map((field) => [field.id, field]));

export function fieldOf(id: GpsFieldId): GpsField {
  return FIELD_BY_ID.get(id)!;
}

export const KIND_META: Record<GpsKind, { label: string; icon: string }> = {
  entreno: { label: 'Entreno', icon: '🏃' },
  partido: { label: 'Partido', icon: '🏆' },
};

/** La cifra de una sesión, o `undefined` si esa sesión no la traía. */
export function valueOf(session: GpsSession, id: GpsFieldId): number | undefined {
  const value = session[id];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** La cifra ya escrita, con su unidad. */
export function formatValue(id: GpsFieldId, value: number): string {
  const field = fieldOf(id);
  const number = value.toLocaleString('es-ES', {
    minimumFractionDigits: field.decimals,
    maximumFractionDigits: field.decimals,
  });
  return field.unit ? `${number} ${field.unit}` : number;
}

/** ¿Trae esta sesión alguna cifra, o es una ficha vacía? */
export function hasNumbers(session: GpsSession): boolean {
  return GPS_FIELD_LIST.some((id) => valueOf(session, id) !== undefined);
}

/* ---------------------------------------------------------------------------
 * Leer una sesión pegada
 *
 * La cuenta gratuita de Footbar no exporta nada, así que el camino corto es
 * escribir los números en una línea. Se lee con manga ancha a propósito: el
 * orden da igual, la coma y el punto valen las dos, y lo que no se reconozca
 * se ignora en vez de tumbar la línea entera. Lo que importa es que pegar
 * cinco sesiones seguidas funcione a la primera.
 * ------------------------------------------------------------------------- */

/** El ejemplo que se enseña en la caja de pegar y en la ayuda. */
export const PASTE_EXAMPLE =
  '2026-09-09 entreno 90min 5,2km 12 sprints 24,3km/h 480 toques';

/**
 * Palabra suelta → cifra a la que nombra. Las de dos palabras se guardan tal
 * cual y se buscan uniendo dos fichas, que es todo lo que hace falta: no hay
 * ninguna de tres.
 */
const KEY_OF = new Map<string, GpsFieldId>();
const UNIT_OF = new Map<string, GpsFieldId>();

for (const field of GPS_FIELDS) {
  for (const key of field.keys) KEY_OF.set(plain(key), field.id);
  for (const unit of field.units ?? []) UNIT_OF.set(plain(unit), field.id);
}

/** Sin mayúsculas ni acentos: «Máxima» y «maxima» son la misma palabra. */
function plain(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Una ficha de la línea: o un número, o una palabra. */
type Token = { number: number } | { word: string };

/** Parte la línea en números y palabras, en el orden en que están escritos. */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const pattern = /(\d+(?:[.,]\d+)?)|([a-záéíóúñ/']+)/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1] !== undefined) out.push({ number: Number(match[1].replace(',', '.')) });
    else out.push({ word: plain(match[2]) });
  }

  return out;
}

/** La palabra —o las dos palabras— que hay en esa posición, si las hay. */
function wordsAt(tokens: Token[], index: number, back: boolean): string[] {
  const one = tokens[index];
  if (!one || !('word' in one)) return [];

  const two = tokens[back ? index - 1 : index + 1];
  if (!two || !('word' in two)) return [one.word];

  return back ? [one.word, `${two.word} ${one.word}`] : [one.word, `${one.word} ${two.word}`];
}

/** La cifra que nombran esas palabras, o `undefined` si no nombran ninguna. */
function fieldOfWords(words: string[], table: Map<string, GpsFieldId>): GpsFieldId | undefined {
  // De más larga a más corta: «alta intensidad» antes que «intensidad».
  for (const word of [...words].sort((a, b) => b.length - a.length)) {
    const found = table.get(word);
    if (found) return found;
  }
  return undefined;
}

/**
 * Reparte los números de una línea entre las cifras que nombran sus vecinos.
 *
 * Es una pasada de izquierda a derecha, número a número, y cada número mira
 * a los lados en este orden:
 *
 *  1. **la unidad pegada detrás** —«5,2 km», «90 min»—, que no admite duda;
 *  2. **el nombre de delante** —«esprines 14», «vmax 27»—;
 *  3. **el nombre de detrás** —«12 sprints», «480 toques»—.
 *
 * Y un nombre sólo se usa una vez. Ésa es la regla que desenreda las líneas
 * que se escriben de verdad: en «8 tiros 60 pases», el 60 no se queda con
 * «tiros» —que ya tiene el 8— sino con «pases»; y en «esprines 9 vmax 27»,
 * el 9 es de los esprines aunque tenga «vmax» a la derecha, porque «esprines»
 * lo está reclamando desde la izquierda y todavía está libre.
 *
 * Mirar cada cifra por su cuenta con una expresión regular no valía: cada una
 * se llevaba el número que tuviera más cerca sin preguntar de quién era, y
 * dos cifras seguidas salían cambiadas sin que nada lo delatara.
 */
function readNumbers(text: string): Partial<Record<GpsFieldId, Reading>> {
  const tokens = tokenize(text);
  const out: Partial<Record<GpsFieldId, Reading>> = {};

  const claim = (id: GpsFieldId | undefined, value: number, unit?: string): boolean => {
    if (!id || out[id] !== undefined) return false;
    out[id] = { value, unit };
    return true;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!('number' in token)) continue;

    const ahead = wordsAt(tokens, i + 1, false);
    const behind = wordsAt(tokens, i - 1, true);

    const unit = fieldOfWords(ahead, UNIT_OF);
    if (claim(unit, token.number, ahead[0])) continue;
    if (claim(fieldOfWords(behind, KEY_OF), token.number)) continue;
    claim(fieldOfWords(ahead, KEY_OF), token.number);
  }

  return out;
}

/** Un número leído, con la unidad que llevaba pegada si llevaba alguna. */
interface Reading {
  value: number;
  unit?: string;
}

/**
 * Los meses escritos con letras, por sus tres primeras.
 *
 * Hacen falta para las capturas de pantalla: nadie escribe «2026-09-09» a
 * mano, pero la aplicación del rastreador pone «9 sept 2026» en la cabecera
 * de cada sesión, y ésa es la fecha buena —la del entrenamiento— frente a la
 * de hoy, que es la del día en que a uno le da por ponerse a apuntar.
 *
 * Van el castellano y el inglés porque la aplicación cambia de idioma con el
 * móvil, y una captura del móvil de casa puede venir en cualquiera de los dos.
 */
const MONTHS = new Map<string, number>([
  ['ene', 1],
  ['jan', 1],
  ['feb', 2],
  ['mar', 3],
  ['abr', 4],
  ['apr', 4],
  ['may', 5],
  ['jun', 6],
  ['jul', 7],
  ['ago', 8],
  ['aug', 8],
  ['sep', 9],
  ['set', 9],
  ['oct', 10],
  ['nov', 11],
  ['dic', 12],
  ['dec', 12],
]);

/** `2026-09-09` a partir de sus tres números, sin pasar por `Date`. */
function written(year: number, month: number, day: number): DateKey {
  return `${year}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
}

/**
 * La primera fecha con el mes en letra que haya en el texto, recorriendo
 * todas las candidatas que encuentre el patrón. `dayFirst` dice cuál de los
 * dos primeros grupos es el día.
 *
 * El año, si no viene, es el de hoy —salvo que eso cayera en el futuro, en
 * cuyo caso es el del año pasado—, igual que con las fechas de barras.
 */
function firstNamedDate(
  text: string,
  pattern: RegExp,
  dayFirst: boolean,
  today: DateKey,
): { date: DateKey; matched: string } | null {
  for (const found of text.matchAll(pattern)) {
    const day = Number(dayFirst ? found[1] : found[2]);
    const month = MONTHS.get(plain(dayFirst ? found[2] : found[1]).slice(0, 3));

    if (month === undefined || day < 1 || day > 31) continue;

    const year = found[3] ? Number(found[3]) : Number(today.slice(0, 4));
    const key = written(year, month, day);

    return {
      date: !found[3] && key > today ? written(year - 1, month, day) : key,
      matched: found[0],
    };
  }

  return null;
}

/**
 * La fecha de la línea y el trozo de texto del que ha salido.
 *
 * Lo segundo importa tanto como lo primero: el «9/9» hay que quitarlo de la
 * línea antes de repartir los números, o el nueve del día acabaría contado
 * como esprines.
 */
function dateIn(text: string, today: DateKey): { date: DateKey; matched: string } | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, matched: iso[0] };

  // «9 sept 2026», «9 de septiembre», «sept 9, 2026»: así fecha sus sesiones
  // la aplicación del rastreador, y es lo único que permite que una captura
  // de hace tres semanas se guarde en su día y no en el de hoy.
  //
  // Se miran **todas** las parejas de número y palabra de la línea, no la
  // primera: en «12 sprints … 9 sept» la primera pareja es «12 sprints», que
  // no nombra ningún mes, y quedarse ahí sería perder la fecha de verdad.
  const named =
    firstNamedDate(text, /\b(\d{1,2})\s*(?:de\s+)?([a-zñáéíóú]{3,10})\.?\s*(?:de\s+)?(\d{4})?\b/gi, true, today) ??
    firstNamedDate(text, /\b([a-zñáéíóú]{3,10})\.?\s+(\d{1,2})\b[,\s]*(\d{4})?/gi, false, today);

  if (named) return named;

  // 9/9, 09-09, 9/9/2026: el año, si no viene, es el del día de hoy… salvo
  // que eso cayera en el futuro, en cuyo caso es del año pasado. Pegar en
  // enero la sesión del 28 de diciembre es lo normal, no la excepción.
  const slash = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;

    const raw = slash[3];
    const year = raw ? (raw.length === 2 ? 2000 + Number(raw) : Number(raw)) : Number(today.slice(0, 4));

    const key = written(year, month, day);
    return {
      date: !raw && key > today ? written(year - 1, month, day) : key,
      matched: slash[0],
    };
  }

  const word = text.match(/\b(hoy|ayer|anteayer)\b/i);
  if (word) {
    const back = { hoy: 0, ayer: -1, anteayer: -2 }[word[1].toLowerCase() as 'hoy'] ?? 0;
    return { date: addDays(today, back), matched: word[0] };
  }

  return null;
}

/** Lo que se ha leído de un pegote, y lo que no se ha podido leer. */
export interface PasteResult {
  sessions: GpsSession[];
  /** Líneas que no traían ni una cifra: se dicen, no se tragan en silencio. */
  ignored: string[];
}

/**
 * Convierte un pegote en sesiones. Una línea por sesión; las vacías y las
 * que empiezan por `#` se saltan, para poder pegar un bloque con títulos.
 *
 * El identificador sale del perfil, el día y el tipo: pegar dos veces la
 * misma sesión —porque se corrigió una cifra— la actualiza en vez de
 * duplicarla, que es justo lo que uno espera. Dos sesiones del mismo tipo el
 * mismo día se distinguen con un sufijo.
 */
export function parsePaste(
  profileId: ProfileId,
  text: string,
  today: DateKey = todayKey(),
): PasteResult {
  const sessions: GpsSession[] = [];
  const ignored: string[] = [];
  const used = new Set<string>();
  const now = new Date().toISOString();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    // La nota va al final, detrás de «nota:» o de una barra: así puede
    // llevar números sin que se confundan con cifras del aparato.
    const cut = line.match(/(?:nota\s*:|\|)\s*(.+)$/i);
    const note = cut?.[1].trim();
    const body = cut ? line.slice(0, cut.index) : line;

    const kind: GpsKind = /\b(partido|match|game|competición|competicion)\b/i.test(body)
      ? 'partido'
      : 'entreno';

    const found = dateIn(body, today);
    const date = found?.date ?? today;

    const session: GpsSession = {
      id: '',
      profileId,
      date,
      kind,
      note: note || undefined,
      updatedAt: now,
    };

    // La fecha sale de la línea antes de repartir nada: si no, el nueve de
    // «9/9» se quedaría con la primera cifra que tuviera al lado.
    const numbers = readNumbers(found ? body.replace(found.matched, ' ') : body);

    for (const field of GPS_FIELDS) {
      const read = numbers[field.id];
      if (read === undefined) continue;

      // Metros o kilómetros, lo mismo da: se guarda siempre en kilómetros.
      // Si venía dicho en metros se divide, y si no venía dicho pero la cifra
      // es de cuatro dígitos, también —nadie corre cinco mil kilómetros en un
      // entrenamiento—. Así no hay que acordarse de en qué unidad lo daba la
      // aplicación ese día.
      const metres =
        field.id === 'distance' &&
        (read.unit === 'm' || read.unit === 'metros' || (!read.unit && read.value > 100));

      session[field.id] = metres ? read.value / 1000 : read.value;
    }

    if (!hasNumbers(session)) {
      ignored.push(line);
      continue;
    }

    session.id = claimId(profileId, date, kind, used);
    sessions.push(session);
  }

  return { sessions, ignored };
}

/**
 * El identificador de una sesión: perfil, día y tipo.
 *
 * Que sea el mismo para el mismo día y tipo es lo que hace que volver a meter
 * una sesión —porque se corrigió una cifra, o porque se pegó y además se
 * fotografió— la actualice en vez de duplicarla. `used` recoge las que ya se
 * han repartido en esta misma tanda, para que dos entrenos del mismo día no
 * se pisen entre ellos.
 */
export function claimId(
  profileId: ProfileId,
  date: DateKey,
  kind: GpsKind,
  used: Set<string>,
): string {
  let id = `${profileId}:${date}:${kind}`;
  let suffix = 1;
  while (used.has(id)) id = `${profileId}:${date}:${kind}:${(suffix += 1)}`;
  used.add(id);
  return id;
}

/* ---------------------------------------------------------------------------
 * Leer una captura de pantalla
 *
 * Es el mismo problema de antes y una situación distinta. Escribir la línea
 * obliga a mirar la pantalla del móvil y teclear seis números sin equivocarse,
 * y eso se hace la primera semana; a la tercera, las sesiones se quedan sin
 * apuntar. La captura, en cambio, ya está hecha: sale sola al mirar la sesión
 * en la aplicación del rastreador.
 *
 * El texto de la captura lo reconoce el navegador (`lib/gpsOcr.ts`) y llega
 * aquí tal cual, con sus saltos de línea y sus erratas. La diferencia con un
 * pegote es una y grande: **una captura es una sesión**, no una por línea. Lo
 * que en la pantalla está en dos renglones —«Distancia» arriba y «5,20 km»
 * debajo— es una sola cifra, así que la captura entera se aplana y se reparte
 * de una vez, con las mismas reglas de vecindad de siempre.
 *
 * Y una precaución que el pegote no necesita: lo que se lee de una imagen
 * puede salir mal leído, así que cada cifra se contrasta con la horquilla de
 * lo posible y lo que no cabe se aparta —diciéndolo—, en vez de guardarse.
 * ------------------------------------------------------------------------- */

/** Lo que ha salido de una captura, con lo que se ha tenido que descartar. */
export interface ScreenRead {
  session: GpsSession;
  /** `true` si la fecha venía en la propia captura y no es la de hoy por defecto. */
  dated: boolean;
  /** Cifras leídas pero imposibles; se enseñan para que se corrijan a mano. */
  dropped: { id: GpsFieldId; value: number }[];
}

/** ¿Cabe esta cifra en una sesión de verdad? */
export function plausible(id: GpsFieldId, value: number): boolean {
  const [low, high] = fieldOf(id).sane;
  return Number.isFinite(value) && value >= low && value <= high;
}

/**
 * Lo que la pantalla enseña y no es del rastreador: la hora del móvil, la
 * batería, el «3 de 5» de un carrusel. Se quitan antes de repartir números
 * porque son justo del tamaño de una cifra de verdad.
 */
function withoutChrome(text: string): string {
  return text
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\d+\s*%/g, ' ')
    .replace(/\b\d+\s*\/\s*\d+\b/g, ' ');
}

/**
 * Convierte el texto reconocido de una captura en una sesión.
 *
 * Devuelve siempre una ficha, aunque salga sin una sola cifra: quien ha
 * adjuntado la foto tiene derecho a ver qué se ha entendido de ella y a
 * rellenar a mano lo que falte, que es mejor que un «no se ha podido leer».
 */
export function readScreen(
  profileId: ProfileId,
  text: string,
  today: DateKey = todayKey(),
): ScreenRead {
  const clean = withoutChrome(text);

  const kind: GpsKind = /\b(partido|match|game|competici[oó]n|amistoso)\b/i.test(clean)
    ? 'partido'
    : 'entreno';

  const found = dateIn(clean, today);
  const date = found?.date ?? today;

  const session: GpsSession = {
    id: '',
    profileId,
    date,
    kind,
    updatedAt: new Date().toISOString(),
  };

  // La captura entera, en una línea: el rótulo y su número viven en renglones
  // distintos, y separados no se reconocen.
  const flat = (found ? clean.replace(found.matched, ' ') : clean).replace(/\s+/g, ' ');
  const numbers = readNumbers(flat);
  const dropped: ScreenRead['dropped'] = [];

  for (const field of GPS_FIELDS) {
    const read = numbers[field.id];
    if (read === undefined) continue;

    const metres =
      field.id === 'distance' &&
      (read.unit === 'm' || read.unit === 'metros' || (!read.unit && read.value > 100));

    const value = metres ? read.value / 1000 : read.value;

    if (!plausible(field.id, value)) {
      dropped.push({ id: field.id, value });
      continue;
    }

    session[field.id] = value;
  }

  return { session, dated: found !== null, dropped };
}

/**
 * La sesión escrita en el formato de casa, para poder copiarla o repasarla.
 *
 * Lo que sale de aquí tiene que poder volver a entrar por la caja de pegar
 * tal cual, así que la unidad sólo se pega al número donde no hay duda —km,
 * km/h, min— y el resto se dice por su nombre. Escribir «850m» habría sido
 * más corto y no habría vuelto a leerse nunca.
 */
export function sessionAsLine(session: GpsSession): string {
  const bits: string[] = [session.date, KIND_META[session.kind].label.toLowerCase()];

  for (const field of GPS_FIELDS) {
    const value = valueOf(session, field.id);
    if (value === undefined) continue;

    const number = `${Number(value.toFixed(field.decimals))}`.replace('.', ',');
    const unit = field.units?.[0];
    bits.push(unit ? `${number}${unit}` : `${number} ${field.short.toLowerCase()}`);
  }

  if (session.note) bits.push(`| ${session.note}`);
  return bits.join(' ');
}

/* ---------------------------------------------------------------------------
 * Lectura y escritura
 *
 * Como las agendas y las libretas: una fila por perfil, en el aparato y en la
 * nube. Con una diferencia importante —y es la que justifica el `removed`—:
 * aquí las sesiones se mezclan **una a una**. Pegar una sesión en el portátil
 * y otra en el móvil no puede hacer que gane sólo la última guardada, porque
 * lo que se perdería es un entrenamiento entero.
 * ------------------------------------------------------------------------- */

export function emptyBook(): GpsBook {
  return { sessions: [], removed: {}, updatedAt: NEVER };
}

let cache: Record<string, GpsBook> | null = null;
const listeners = new Set<() => void>();

function normalizeSession(value: unknown): GpsSession | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<GpsSession>;

  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return null;

  const session: GpsSession = {
    id: raw.id,
    profileId: raw.profileId as ProfileId,
    date: raw.date,
    kind: raw.kind === 'partido' ? 'partido' : 'entreno',
    note: typeof raw.note === 'string' && raw.note ? raw.note.slice(0, 200) : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : NEVER,
  };

  for (const field of GPS_FIELDS) {
    const value = Number(raw[field.id]);
    if (raw[field.id] !== undefined && Number.isFinite(value) && value >= 0) {
      session[field.id] = value;
    }
  }

  return session;
}

function normalize(value: unknown): GpsBook {
  const base = emptyBook();
  if (!value || typeof value !== 'object') return base;

  const raw = value as Partial<GpsBook>;

  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions
        .map(normalizeSession)
        .filter((session): session is GpsSession => session !== null)
        .slice(-MAX_SESSIONS)
    : [];

  const removed: Record<string, string> = {};
  if (raw.removed && typeof raw.removed === 'object') {
    for (const [id, stamp] of Object.entries(raw.removed)) {
      if (typeof stamp === 'string') removed[id] = stamp;
    }
  }

  return {
    sessions,
    removed,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
  };
}

export function loadGps(): Record<string, GpsBook> {
  if (cache) return cache;
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(GPS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, GpsBook> = {};

    for (const [profileId, value] of Object.entries(parsed ?? {})) {
      out[profileId] = normalize(value);
    }

    cache = out;
  } catch {
    cache = {};
  }

  return cache;
}

export function bookOf(profileId: string): GpsBook {
  return loadGps()[profileId] ?? emptyBook();
}

/** Las sesiones de un perfil, de la más reciente a la más antigua. */
export function sessionsOf(profileId: string): GpsSession[] {
  return [...bookOf(profileId).sessions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

function commit(next: Record<string, GpsBook>): void {
  cache = next;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(GPS_KEY, JSON.stringify(next));
    } catch {
      // Cuota llena o modo privado: vale para esta sesión y se dirá arriba.
    }
  }

  for (const listener of listeners) listener();
}

function write(profileId: string, book: GpsBook): GpsBook {
  const next: GpsBook = { ...book, updatedAt: new Date().toISOString() };
  commit({ ...loadGps(), [profileId]: next });
  return next;
}

/** Guarda una sesión —nueva o corregida— y la devuelve tal como ha quedado. */
export function saveSession(session: GpsSession): GpsSession {
  const book = bookOf(session.profileId);
  const stamped: GpsSession = { ...session, updatedAt: new Date().toISOString() };

  const rest = book.sessions.filter((item) => item.id !== stamped.id);
  const removed = { ...book.removed };
  // Volver a apuntar algo que se borró deshace su borrado; si no, la lápida
  // se lo llevaría por delante en la próxima bajada.
  delete removed[stamped.id];

  write(session.profileId, {
    ...book,
    sessions: [...rest, stamped].slice(-MAX_SESSIONS),
    removed,
  });

  return stamped;
}

/** Guarda varias de golpe: es lo que hace la caja de pegar. */
export function saveSessions(profileId: string, sessions: GpsSession[]): number {
  if (sessions.length === 0) return 0;

  const book = bookOf(profileId);
  const now = new Date().toISOString();
  const byId = new Map(book.sessions.map((item) => [item.id, item]));
  const removed = { ...book.removed };

  for (const session of sessions) {
    byId.set(session.id, { ...session, updatedAt: now });
    delete removed[session.id];
  }

  write(profileId, {
    ...book,
    sessions: Array.from(byId.values()).slice(-MAX_SESSIONS),
    removed,
  });

  return sessions.length;
}

export function removeSession(profileId: string, id: string): void {
  const book = bookOf(profileId);
  write(profileId, {
    ...book,
    sessions: book.sessions.filter((item) => item.id !== id),
    removed: { ...book.removed, [id]: new Date().toISOString() },
  });
}

/** Devuelve la libreta entera tal y como estaba: es el «deshacer». */
export function restoreBook(profileId: string, book: GpsBook): void {
  write(profileId, book);
}

/**
 * Lo que llega de otro aparato, mezclado sesión a sesión.
 *
 * No vale la regla de «gana la última libreta guardada» que usan la agenda y
 * la economía: aquí cada sesión es un hecho suelto, y si el móvil pegó la del
 * martes y el portátil la del jueves, tienen que quedar las dos. Se unen por
 * identificador —gana la versión más reciente de cada una— y los borrados
 * viajan aparte, que es lo único que impide que una sesión quitada vuelva.
 */
export function applyRemoteGps(remote: Record<string, GpsBook>): void {
  const local = loadGps();
  const next = { ...local };
  let changed = false;

  for (const [profileId, theirs] of Object.entries(remote)) {
    const mine = local[profileId] ?? emptyBook();
    const clean = normalize(theirs);

    const removed = { ...mine.removed };
    for (const [id, stamp] of Object.entries(clean.removed)) {
      if (!removed[id] || removed[id] < stamp) removed[id] = stamp;
    }

    const byId = new Map(mine.sessions.map((item) => [item.id, item]));
    for (const session of clean.sessions) {
      const here = byId.get(session.id);
      if (!here || here.updatedAt < session.updatedAt) byId.set(session.id, session);
    }

    // Y fuera lo borrado, salvo que se haya vuelto a apuntar después.
    const sessions = Array.from(byId.values()).filter((session) => {
      const grave = removed[session.id];
      return !grave || session.updatedAt > grave;
    });

    const sameCount = sessions.length === mine.sessions.length;
    const sameStamps =
      sameCount &&
      sessions.every((session) => {
        const here = mine.sessions.find((item) => item.id === session.id);
        return here && here.updatedAt === session.updatedAt;
      });

    if (sameStamps && Object.keys(removed).length === Object.keys(mine.removed).length) continue;

    next[profileId] = {
      sessions: sessions.slice(-MAX_SESSIONS),
      removed,
      // La fecha de la libreta es la de la sesión más nueva: es lo que hace
      // que la nube sepa que aquí hay algo que todavía no tiene.
      updatedAt: sessions.reduce(
        (latest, session) => (session.updatedAt > latest ? session.updatedAt : latest),
        clean.updatedAt > mine.updatedAt ? clean.updatedAt : mine.updatedAt,
      ),
    };
    changed = true;
  }

  if (changed) commit(next);
}

/**
 * Se queda exactamente con lo que venía de la nube. Es lo que hace la
 * réplica: no es una mezcla, es una copia, y lo que sólo estuviera aquí sobra.
 */
export function replaceGps(remote: Record<string, GpsBook>): void {
  const next: Record<string, GpsBook> = {};
  for (const [profileId, book] of Object.entries(remote)) next[profileId] = normalize(book);
  commit(next);
}

export function subscribeGps(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ---------------------------------------------------------------------------
 * El análisis
 *
 * Lo que Footbar no hace: mirar las sesiones **juntas**. Una cifra suelta no
 * dice nada —¿cinco kilómetros son muchos?—; comparada con las diez
 * anteriores del mismo crío, lo dice todo.
 * ------------------------------------------------------------------------- */

/** Cómo va una cifra en el conjunto de sesiones que se estén mirando. */
export interface FieldStat {
  id: GpsFieldId;
  /** Sesiones que traían esta cifra. */
  count: number;
  average: number;
  best: number;
  bestOn: DateKey;
  last: number;
  lastOn: DateKey;
  /** Media por hora, donde tiene sentido y hay tiempo apuntado. */
  perHour?: number;
}

/** Las cifras de un puñado de sesiones, campo a campo. */
export function statsOf(sessions: GpsSession[]): FieldStat[] {
  const out: FieldStat[] = [];

  // De la más antigua a la más reciente: «la última» tiene que ser la última.
  const order = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

  for (const field of GPS_FIELDS) {
    const rows = order
      .map((session) => ({ session, value: valueOf(session, field.id) }))
      .filter((row): row is { session: GpsSession; value: number } => row.value !== undefined);

    if (rows.length === 0) continue;

    const total = rows.reduce((sum, row) => sum + row.value, 0);
    const best = rows.reduce((top, row) => (row.value > top.value ? row : top));
    const last = rows[rows.length - 1];

    const timed = rows.filter((row) => (valueOf(row.session, 'minutes') ?? 0) > 0);
    const minutes = timed.reduce((sum, row) => sum + (valueOf(row.session, 'minutes') ?? 0), 0);

    out.push({
      id: field.id,
      count: rows.length,
      average: total / rows.length,
      best: best.value,
      bestOn: best.session.date,
      last: last.value,
      lastOn: last.session.date,
      perHour:
        field.perHour && minutes > 0
          ? (timed.reduce((sum, row) => sum + row.value, 0) / minutes) * 60
          : undefined,
    });
  }

  return out;
}

/** Cómo queda una sesión frente a las que vinieron antes, cifra a cifra. */
export interface SessionMark {
  id: GpsFieldId;
  value: number;
  /** Es la mejor de todas las anteriores. */
  record: boolean;
  /** Diferencia con la media anterior, en tanto por uno. `null` sin historia. */
  change: number | null;
}

export function marksOf(session: GpsSession, history: GpsSession[]): SessionMark[] {
  const before = history.filter(
    (item) => item.id !== session.id && item.date <= session.date,
  );

  const out: SessionMark[] = [];

  for (const field of GPS_FIELDS) {
    const value = valueOf(session, field.id);
    if (value === undefined) continue;

    const values = before
      .map((item) => valueOf(item, field.id))
      .filter((item): item is number => item !== undefined);

    const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

    out.push({
      id: field.id,
      value,
      record:
        field.record !== false && values.length > 0 && value > Math.max(...values),
      change: average && average > 0 ? value / average - 1 : null,
    });
  }

  return out;
}

/** Un dato honesto sobre el conjunto, de los que no se ven mirando de uno en uno. */
export interface GpsNote {
  id: string;
  icon: string;
  text: string;
  tone: 'bien' | 'aviso' | 'dato';
}

/** Mínimo de sesiones para decir algo de una tendencia sin hacer el ridículo. */
const ENOUGH = 4;

/**
 * Lo que se puede decir con lo que hay, y nada más.
 *
 * Cada frase lleva detrás una comprobación de cuántas sesiones la sostienen.
 * Con tres entrenos no se habla de tendencias: se dice cuántos van y ya está,
 * que es lo honesto y además lo que anima a seguir apuntando.
 */
export function notesOf(sessions: GpsSession[]): GpsNote[] {
  const out: GpsNote[] = [];
  if (sessions.length === 0) return out;

  const order = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

  if (order.length < ENOUGH) {
    out.push({
      id: 'pocas',
      icon: '🌱',
      tone: 'dato',
      text: `Van ${order.length} ${order.length === 1 ? 'sesión apuntada' : 'sesiones apuntadas'}. Con cuatro ya se puede hablar de si la cosa sube o baja.`,
    });
    return out;
  }

  for (const field of GPS_FIELDS) {
    // El tiempo jugado no es una tendencia de nadie: que los entrenos duren
    // noventa minutos es el horario del club, no algo que el crío mejore.
    if (field.record === false) continue;

    const rows = order
      .map((session) => ({ date: session.date, value: valueOf(session, field.id) }))
      .filter((row): row is { date: DateKey; value: number } => row.value !== undefined);

    if (rows.length < ENOUGH) continue;

    // La mitad reciente contra la mitad antigua: es la comparación que
    // aguanta una sesión mala suelta sin darle la vuelta a la frase.
    const half = Math.floor(rows.length / 2);
    const older = rows.slice(0, half);
    const newer = rows.slice(rows.length - half);
    const mean = (list: typeof rows) => list.reduce((sum, row) => sum + row.value, 0) / list.length;

    const from = mean(older);
    const to = mean(newer);
    if (from <= 0) continue;

    const change = to / from - 1;
    if (Math.abs(change) < 0.08) continue;

    out.push({
      id: `tendencia-${field.id}`,
      icon: field.icon,
      tone: change > 0 ? 'bien' : 'aviso',
      text:
        change > 0
          ? `${field.label} va a más: de ${formatValue(field.id, from)} de media a ${formatValue(field.id, to)} en las últimas ${newer.length}.`
          : `${field.label} va a menos: de ${formatValue(field.id, from)} de media a ${formatValue(field.id, to)} en las últimas ${newer.length}.`,
    });
  }

  // Partido contra entreno, que es la comparación que todo el mundo hace de
  // cabeza y siempre mal.
  const games = order.filter((session) => session.kind === 'partido');
  const training = order.filter((session) => session.kind === 'entreno');

  if (games.length >= 2 && training.length >= 2) {
    const perHour = (list: GpsSession[]) => {
      const timed = list.filter((session) => (valueOf(session, 'minutes') ?? 0) > 0);
      const minutes = timed.reduce((sum, session) => sum + (valueOf(session, 'minutes') ?? 0), 0);
      const distance = timed.reduce((sum, session) => sum + (valueOf(session, 'distance') ?? 0), 0);
      return minutes > 0 ? (distance / minutes) * 60 : null;
    };

    const inGame = perHour(games);
    const inTraining = perHour(training);

    if (inGame && inTraining && inTraining > 0) {
      const diff = inGame / inTraining - 1;
      out.push({
        id: 'partido-entreno',
        icon: '🏆',
        tone: 'dato',
        text:
          Math.abs(diff) < 0.05
            ? `En partido corre casi lo mismo que en entreno: ${formatValue('distance', inGame)} por hora, frente a ${formatValue('distance', inTraining)} por hora.`
            : `En partido corre un ${Math.round(Math.abs(diff) * 100)} % ${diff > 0 ? 'más' : 'menos'} que en entreno: ${formatValue('distance', inGame)} por hora, frente a ${formatValue('distance', inTraining)}.`,
      });
    }
  }

  // El récord reciente merece decirse, aunque no sea una tendencia.
  const stats = statsOf(order);
  const fresh = stats.filter(
    (stat) => stat.best === stat.last && stat.count >= ENOUGH && fieldOf(stat.id).record !== false,
  );

  for (const stat of fresh.slice(0, 2)) {
    out.push({
      id: `record-${stat.id}`,
      icon: '🏅',
      tone: 'bien',
      text: `La última sesión dejó récord de ${fieldOf(stat.id).label.toLowerCase()}: ${formatValue(stat.id, stat.best)} el ${formatShort(stat.bestOn)}.`,
    });
  }

  return out.slice(0, 5);
}

/* ---------------------------------------------------------------------------
 * El resumen de una tanda
 *
 * Meter seis capturas de golpe —las de un mes que se quedó sin apuntar— no
 * es lo mismo que meter la sesión de ayer: lo que uno quiere saber entonces
 * no es cómo fue una, sino qué ha pasado en ese mes. Esto es lo que contesta
 * esa pregunta, y sólo tiene sentido justo después de guardar la tanda.
 * ------------------------------------------------------------------------- */

/** Una cifra de la tanda frente a lo que ya había apuntado antes de ella. */
export interface DigestCompare {
  id: GpsFieldId;
  /** Media en las sesiones recién metidas. */
  now: number;
  /** Media en las que ya había, anteriores a la primera de la tanda. */
  before: number;
  /** Diferencia, en tanto por uno. */
  change: number;
}

export interface GpsDigest {
  count: number;
  from: DateKey;
  to: DateKey;
  /** Días distintos con sesión. */
  days: number;
  /** Minutos y kilómetros sumados, de lo que los traiga. */
  minutes: number;
  distance: number;
  /** Récords que ha dejado la tanda, mirando sólo lo anterior a cada sesión. */
  records: { id: GpsFieldId; value: number; on: DateKey }[];
  stats: FieldStat[];
  notes: GpsNote[];
  versus: DigestCompare[];
  /** Con cuántas sesiones anteriores se ha comparado. */
  versusCount: number;
}

/** Media de una cifra en un puñado de sesiones, o `null` si ninguna la trae. */
function meanOf(sessions: GpsSession[], id: GpsFieldId): number | null {
  const values = sessions
    .map((session) => valueOf(session, id))
    .filter((value): value is number => value !== undefined);

  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * Lo que dicen juntas las sesiones que se acaban de meter, y cómo quedan
 * frente a las que ya estaban.
 *
 * La comparación se hace contra lo **anterior** a la primera de la tanda, no
 * contra todo lo demás: metiendo hoy las sesiones de marzo, lo interesante es
 * cómo fue marzo frente a lo de antes de marzo, no frente a lo de después.
 *
 * Y se calla donde no hay con qué hablar: hacen falta al menos dos sesiones a
 * cada lado para comparar medias, y un 5 % de diferencia para que merezca la
 * pena decirlo.
 */
export function digestOf(batch: GpsSession[], all: GpsSession[]): GpsDigest | null {
  if (batch.length === 0) return null;

  const order = [...batch].sort((a, b) => a.date.localeCompare(b.date));
  const from = order[0].date;
  const to = order[order.length - 1].date;

  const ids = new Set(batch.map((session) => session.id));
  const before = all.filter((session) => !ids.has(session.id) && session.date < from);

  const versus: DigestCompare[] = [];

  if (before.length >= 2 && batch.length >= 2) {
    for (const field of GPS_FIELDS) {
      if (field.record === false) continue;

      const now = meanOf(order, field.id);
      const past = meanOf(before, field.id);
      if (now === null || past === null || past <= 0) continue;

      const change = now / past - 1;
      if (Math.abs(change) < 0.05) continue;

      versus.push({ id: field.id, now, before: past, change });
    }
  }

  // Los récords se miran sesión a sesión y contra todo lo que la precede,
  // que es la única manera de que una tanda de sesiones viejas no invente
  // récords por el simple hecho de haberse apuntado la última.
  //
  // De cada cifra se guarda sólo el último, que es el que sigue en pie: una
  // tanda en la que la distancia subió tres veces dejó un récord de distancia,
  // no tres, y enumerar los escalones intermedios sólo lo enturbia.
  const best = new Map<GpsFieldId, { id: GpsFieldId; value: number; on: DateKey }>();
  for (const session of order) {
    for (const mark of marksOf(session, all)) {
      if (mark.record) best.set(mark.id, { id: mark.id, value: mark.value, on: session.date });
    }
  }

  const records = GPS_FIELD_LIST.map((id) => best.get(id)).filter(
    (record): record is { id: GpsFieldId; value: number; on: DateKey } => record !== undefined,
  );

  return {
    count: batch.length,
    from,
    to,
    days: new Set(order.map((session) => session.date)).size,
    minutes: order.reduce((sum, session) => sum + (valueOf(session, 'minutes') ?? 0), 0),
    distance: order.reduce((sum, session) => sum + (valueOf(session, 'distance') ?? 0), 0),
    records,
    stats: statsOf(order),
    // Sin el «van tres sesiones apuntadas»: aquí se está mirando una tanda,
    // no la libreta entera, y contar las de la tanda ya lo hace la cabecera.
    notes: notesOf(order).filter((note) => note.id !== 'pocas'),
    versus,
    versusCount: before.length,
  };
}

/** Sesiones de un periodo, para poder mirar el mes o el curso entero. */
export function sessionsBetween(
  sessions: GpsSession[],
  from: DateKey,
  to: DateKey,
): GpsSession[] {
  return sessions.filter((session) => session.date >= from && session.date <= to);
}
