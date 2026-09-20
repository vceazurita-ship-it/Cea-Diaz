import { emptyTest, hasData, testId, type FitnessTest } from '@/lib/fitness';
import { abrirCandado, descifrar, type Candado } from '@/lib/pdfCrypt';
import type { DateKey, ProfileId } from '@/types';

/* =========================================================================
 *  Leer los informes de RX2 sin que salgan del aparato.
 *
 *  Los informes vienen en PDF y traen las cifras en tablas. Copiarlas a mano
 *  cada tres meses, para dos niños y ocho métricas, es justo la clase de
 *  tarea que se deja de hacer al segundo intento; así que el PDF se abre
 *  **aquí**, en el navegador, se le sacan los números y se tiran.
 *
 *  El archivo no se sube a ningún sitio, no entra en el repositorio y no se
 *  guarda: lo único que se queda son las cifras, en la cuenta de la familia,
 *  donde ya están las sesiones del rastreador. Y antes de guardarlas se
 *  enseñan para que quien las mete confirme que son ésas: un lector de PDF
 *  se equivoca, y una cifra mal leída envenena el informe entero.
 *
 *  No hace falta librería. Un PDF es una lista de objetos y unos flujos
 *  comprimidos con zlib —que el navegador sabe descomprimir desde siempre
 *  con `DecompressionStream`—, y el texto son los operadores `Tj` y `TJ` con
 *  su tabla de códigos. Los informes cifrados no se abren: para ésos está la
 *  caja de pegar y el formulario.
 * ========================================================================= */

/* ---------------------------------------------------------------------------
 * Sacar el texto de un PDF
 * ------------------------------------------------------------------------- */

const latin = (bytes: Uint8Array): string => {
  let out = '';
  // A trozos: una cadena de tres millones de caracteres de golpe revienta
  // la pila en algunos navegadores.
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return out;
};

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // El siguiente formato, y si tampoco, se deja el flujo por leer.
    }
  }
  return null;
}

/** La tabla de códigos de una fuente, sacada de su `ToUnicode`. */
function toUnicode(text: string): Map<number, string> {
  const table = new Map<number, string>();
  const chars = (hex: string) => {
    let out = '';
    for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    return out;
  };

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      table.set(parseInt(pair[1], 16), chars(pair[2]));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const row of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const from = parseInt(row[1], 16);
      const to = parseInt(row[2], 16);
      const base = parseInt(row[3], 16);
      for (let code = from; code <= to && code - from < 1024; code++) {
        table.set(code, String.fromCharCode(base + (code - from)));
      }
    }
  }
  return table;
}

/** El PDF pide contraseña y no se ha dado, o la que se dio no vale. */
export class PdfProtegido extends Error {
  constructor(public readonly malaClave = false) {
    super(malaClave ? 'La contraseña no abre este PDF.' : 'El PDF está protegido con contraseña.');
  }
}

/**
 * El texto de un PDF, línea a línea y en el orden en que está escrito, que
 * para una tabla es el orden de las celdas.
 *
 * Con contraseña abre también los protegidos. Tres detalles que costaron
 * encontrar y que aquí están resueltos:
 *
 *  · El final del diccionario de un objeto **no** es el primer `>>`: los de
 *    fuente llevan otro diccionario dentro, y cortar ahí pierde el objeto.
 *  · La longitud del flujo puede venir como referencia a otro objeto, así
 *    que hay que saber caer en buscar el `endstream`.
 *  · En un PDF cifrado los bytes del flujo son ruido, y un `endobj` puede
 *    aparecer por casualidad dentro: los objetos se recorren con posiciones
 *    absolutas y saltando el flujo entero de una vez.
 */
export async function pdfLines(file: ArrayBuffer, password?: string): Promise<string[]> {
  const bytes = new Uint8Array(file);
  const raw = latin(bytes);

  let candado: Candado | null = null;
  if (/\/Encrypt\b/.test(raw)) {
    if (!password) throw new PdfProtegido();
    candado = abrirCandado(raw, password);
    if (!candado) throw new PdfProtegido(true);
  }

  /* ------------------------------------------------------- los objetos */
  const objects = new Map<number, { dict: string; texto: string }>();
  const dicts = new Map<number, string>();

  const cabeceras = /(\d+)\s+(\d+)\s+obj\b/g;
  let h: RegExpExecArray | null;
  while ((h = cabeceras.exec(raw))) {
    const num = Number(h[1]);
    const gen = Number(h[2]);
    const desdeDict = h.index + h[0].length;

    // El fin del diccionario, contando los «<<» y los «>>».
    let finDict = -1;
    let nivel = 0;
    for (let i = raw.indexOf('<<', desdeDict); i >= 0 && i < desdeDict + 6000; ) {
      const abre = raw.indexOf('<<', i);
      const cierra = raw.indexOf('>>', i);
      if (cierra < 0) break;
      if (abre >= 0 && abre < cierra) {
        nivel++;
        i = abre + 2;
      } else {
        nivel--;
        i = cierra + 2;
        if (nivel === 0) {
          finDict = cierra;
          break;
        }
      }
    }
    if (finDict < 0 || finDict - desdeDict > 6000) continue;

    const dict = raw.slice(desdeDict, finDict + 2);
    if (!dicts.has(num)) dicts.set(num, dict);

    const st = raw.indexOf('stream', finDict);
    if (st < 0 || st - finDict > 40) continue;
    let desde = st + 6;
    if (raw.charCodeAt(desde) === 13) desde++;
    if (raw.charCodeAt(desde) === 10) desde++;

    const dicho = Number((/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict) || [])[1]);
    const fin = raw.indexOf('endstream', desde);
    let len = Number.isFinite(dicho) && dicho > 0 ? dicho : NaN;
    if (fin > desde && (!Number.isFinite(len) || desde + len > fin || fin - (desde + len) > 4)) {
      let corte = fin;
      if (raw.charCodeAt(corte - 1) === 10) corte--;
      if (raw.charCodeAt(corte - 1) === 13) corte--;
      len = corte - desde;
    }
    if (!Number.isFinite(len) || len <= 0) continue;

    let datos = bytes.slice(desde, desde + len);
    if (candado) datos = await descifrar(candado, datos, num, gen);
    const plano = /\/FlateDecode/.test(dict) ? await inflate(datos) : datos;
    if (plano && plano.length > 0) objects.set(num, { dict, texto: latin(plano) });

    cabeceras.lastIndex = Math.max(cabeceras.lastIndex, desde + len);
  }

  // Los objetos que viajan comprimidos dentro de otro: ahí están casi todos
  // los diccionarios de los PDF modernos.
  for (const [, { dict, texto }] of [...objects]) {
    if (!/\/Type\s*\/ObjStm/.test(dict)) continue;
    const cuantos = Number((/\/N\s+(\d+)/.exec(dict) || [])[1]);
    const first = Number((/\/First\s+(\d+)/.exec(dict) || [])[1]);
    if (!Number.isFinite(cuantos) || !Number.isFinite(first)) continue;
    const cab = texto.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k < cuantos; k++) {
      const id = cab[k * 2];
      const off = cab[k * 2 + 1];
      const hasta = k + 1 < cuantos ? first + cab[k * 2 + 3] : texto.length;
      if (!dicts.has(id)) dicts.set(id, texto.slice(first + off, hasta));
    }
  }

  if (candado && objects.size === 0) throw new PdfProtegido(true);

  /* ------------------------------------------------------- las fuentes */
  const tables = new Map<number, Map<number, string>>();
  for (const [num, { texto }] of objects) {
    if (!/beginbfchar|beginbfrange/.test(texto)) continue;
    tables.set(num, toUnicode(texto));
  }

  const byName = new Map<string, Map<number, string>>();
  const wide = new Set<string>();
  for (const [, dict] of dicts) {
    for (const ref of dict.matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+\d+\s+R/g)) {
      const font = dicts.get(Number(ref[2]));
      if (!font) continue;
      const unicode = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(font);
      if (!unicode || !tables.has(Number(unicode[1]))) continue;
      byName.set(ref[1], tables.get(Number(unicode[1]))!);
      if (/Identity-H|\/Type0/.test(font)) wide.add(ref[1]);
    }
  }

  /* ---------------------------------------------------------- el texto */
  const lines: string[] = [];
  for (const [, { dict, texto }] of objects) {
    if (/\/ObjStm|\/Image/.test(dict)) continue;
    if (/beginbfchar|beginbfrange/.test(texto.slice(0, 400))) continue;
    if (!/(Tj|TJ)/.test(texto)) continue;

    let table: Map<number, string> | null = null;
    let isWide = false;
    let line = '';

    const paint = (chars: string): string => {
      let out = '';
      if (isWide) {
        for (let i = 0; i + 1 < chars.length; i += 2) {
          out += table?.get((chars.charCodeAt(i) << 8) | chars.charCodeAt(i + 1)) ?? '';
        }
      } else {
        for (let i = 0; i < chars.length; i++) {
          out += table ? (table.get(chars.charCodeAt(i)) ?? chars[i]) : chars[i];
        }
      }
      return out;
    };

    // Ojo con los corchetes: escritos con alternancia, el motor de
    // expresiones regulares entra en retroceso exponencial en cuanto el
    // cierre tarda en aparecer, y el navegador se queda colgado.
    const token = /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]*)>\s*Tj|\([^)]{0,4000}\)\s*Tj|\[[^\]]{0,6000}\]\s*TJ|T\*|Td|TD|ET/g;
    let piece: RegExpExecArray | null;

    while ((piece = token.exec(texto))) {
      const chunk = piece[0];
      if (chunk.endsWith('Tf')) {
        table = byName.get(piece[1]) ?? null;
        isWide = wide.has(piece[1]);
        continue;
      }
      if (chunk === 'T*' || chunk === 'ET' || chunk === 'Td' || chunk === 'TD') {
        if (line.trim()) lines.push(line.trim());
        line = '';
        continue;
      }
      for (const hex of chunk.matchAll(/<([0-9A-Fa-f\s]*)>/g)) {
        const clean = hex[1].replace(/\s/g, '');
        let chars = '';
        for (let i = 0; i + 2 <= clean.length; i += 2) chars += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
        line += paint(chars);
      }
      for (const literal of chunk.matchAll(/\([^)]{0,4000}\)/g)) {
        const body = literal[0]
          .slice(1, -1)
          .replace(/\\([nrtbf()\\])/g, (_, ch: string) => ({ n: '\n', r: '', t: ' ', b: '', f: '' })[ch] ?? ch);
        line += paint(body);
      }
      line += ' ';
    }
    if (line.trim()) lines.push(line.trim());
  }

  return lines;
}

/* ---------------------------------------------------------------------------
 * Entender un informe de RX2
 *
 * El PDF parte las celdas en trozos —«24», «/08/2026»— así que lo primero es
 * volver a pegarlo todo y trabajar sobre una sola línea. A partir de ahí, lo
 * que se busca son parejas «etiqueta … número» y las filas de la tabla de
 * evolución, que traen una fecha por columna.
 * ------------------------------------------------------------------------- */

/** Todo junto, sin acentos y en minúsculas: así los rótulos se buscan una vez. */
function flat(lines: string[]): string {
  return lines
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Y fuera los caracteres de control, que es lo que estos PDF dejan donde
    // iba una tilde: «biológica» sale con un byte invisible en medio de la
    // palabra y cualquier búsqueda se parte justo ahí. Costó encontrarlo.
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏﻿]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Las fechas de un informe, en el orden en que salen.
 *
 * El PDF parte las celdas por donde le parece, así que un «16/04/26» puede
 * salir como «16/04/2» y «6» en dos trozos. Por eso el año no se busca con
 * una cuenta fija de cifras: se van leyendo las que haya —saltándose los
 * espacios— y se para en cuanto el año ya es válido, prefiriendo cuatro
 * cifras cuando empieza por 19 o por 20.
 */
export function datesIn(text: string): DateKey[] {
  const out: DateKey[] = [];

  for (const m of text.matchAll(/(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*/g)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;

    // Las cifras que siguen, sin los espacios de por medio.
    let digits = '';
    for (let i = m.index + m[0].length; i < text.length && digits.length < 4; i++) {
      const ch = text[i];
      if (ch >= '0' && ch <= '9') digits += ch;
      else if (ch === ' ' && digits.length > 0) continue;
      else break;
    }

    const largo = digits.length >= 4 && (digits.startsWith('19') || digits.startsWith('20')) ? 4 : 2;
    if (digits.length < largo) continue;
    const year = largo === 4 ? Number(digits.slice(0, 4)) : 2000 + Number(digits.slice(0, 2));
    if (year < 2015 || year > 2100) continue;

    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as DateKey;
    if (!out.includes(key)) out.push(key);
  }

  return out;
}

/**
 * El número que sigue a un rótulo, con un rango de cordura.
 *
 * El rango no es un adorno: los informes repiten los rótulos en los títulos
 * de sección —«ANTROPOMETRÍA Y EDAD BIOLÓGICA ESTIMADA» está encima de la
 * tabla que contiene «Edad biológica estimada 9,42»— y sin él se leería la
 * primera cifra que pasara por delante, que era la altura.
 */
function after(text: string, label: RegExp, range: [number, number]): number | undefined {
  const re = new RegExp(label.source, 'g');
  let at: RegExpExecArray | null;
  while ((at = re.exec(text))) {
    const rest = text.slice(at.index + at[0].length, at.index + at[0].length + 60);
    const num = /-?\d+(?:[.,]\d+)?/.exec(rest);
    if (!num) continue;
    const value = Number(num[0].replace(',', '.'));
    if (Number.isFinite(value) && value >= range[0] && value <= range[1]) return value;
  }
  return undefined;
}

/** Los números de un trozo de texto, en orden. */
function numbers(text: string, count: number): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/-\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g)) {
    const value = Number(m[0].replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(value)) out.push(value);
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Las filas que sabe reconocer, con el campo al que van. El orden importa
 * poco: lo que manda es dónde cae cada rótulo dentro de la tabla.
 */
const ROWS: { id: keyof FitnessTest; re: RegExp }[] = [
  { id: 'jumpHeight', re: /jump\s*height/g },
  { id: 'peakBraking', re: /peak\s*braking\s*force/g },
  { id: 'peakPropulsive', re: /peak\s*propulsive\s*force/g },
  { id: 'takeOff', re: /time\s*to\s*take\s*-?\s*off/g },
  { id: 'sprint20', re: /tiempo\s*a\s*20\s*m/g },
  { id: 'topSpeed', re: /velocidad\s*maxima/g },
  { id: 'height', re: /\baltura\b/g },
  { id: 'weight', re: /\bpeso\b/g },
  { id: 'legLength', re: /longitud\s*(?:de\s*)?piernas/g },
];

export interface Rx2Parse {
  /** De quién parece ser el informe, por el nombre que trae. */
  who?: 'leo' | 'hugo';
  /** Lo que se ha podido reconstruir, una prueba por fecha. */
  tests: FitnessTest[];
  /** Lo que se ha visto pero no se ha sabido colocar, para poder revisarlo. */
  warnings: string[];
  /** Qué clase de informe parece. */
  kind: 'fisico' | 'genetico' | 'desconocido';
}

/**
 * Saca de un informe de RX2 todas las pruebas que trae.
 *
 * Los informes se leen **por tablas**, no buscando números sueltos: cada
 * tabla empieza con la palabra «métrica» y una fecha por columna, y debajo
 * van sus filas. Emparejar cada número con su fecha es justo lo que no se
 * puede hacer a ojo, y lo que hace que valga la pena leerlo así.
 */
export function parseRx2(lines: string[], profileId: ProfileId): Rx2Parse {
  const entero = flat(lines);
  const warnings: string[] = [];

  // Los informes acaban con una página de servicios del centro llena de
  // números sueltos («bonos de 5 y de 10 sesiones») y de palabras que
  // coinciden con los rótulos de las tablas. Se corta antes de empezar.
  const cola = /servicios\s*rx2|estudios\s*biomecanicos|localizacion\s*paseo/.exec(entero);
  const text = cola ? entero.slice(0, cola.index) : entero;

  const who = /leo\s+cea/.test(entero) ? 'leo' : /hugo\s+cea/.test(entero) ? 'hugo' : undefined;
  if (who && who !== profileId) {
    warnings.push(`El informe parece de ${who === 'leo' ? 'Leo' : 'Hugo'}, y lo estás metiendo en otro perfil.`);
  }

  // Las señas de un informe de pruebas. Se miran antes que nada porque el
  // PDF acaba con una página de servicios que nombra los estudios genéticos,
  // y eso confundía al lector.
  const fisico = /jump\s*height|peak\s*propulsive|tiempo\s*a\s*20\s*m|antropometr/.test(text);
  if (!fisico) {
    const generico = /perfil\s*genetico|tu\s*perfil\s*deportivo|fibras\s*rapidas/.test(text);
    return { who, tests: [], warnings, kind: generico ? 'genetico' : 'desconocido' };
  }

  /* ------------------------------------------------------------ las tablas */

  const porFecha = new Map<DateKey, FitnessTest>();
  const take = (date: DateKey): FitnessTest => {
    const found = porFecha.get(date);
    if (found) return found;
    const fresh: FitnessTest = { ...emptyTest(profileId, date), id: testId(profileId, date, 'rx2') };
    porFecha.set(date, fresh);
    return fresh;
  };

  // Cada tabla arranca en «metrica». Lo de antes de la primera es la portada.
  const bloques = text.split(/metrica/g);
  const portada = bloques[0] ?? '';

  for (const bloque of bloques.slice(1)) {
    // Dónde empieza cada fila conocida dentro de la tabla.
    const marcas: { id: keyof FitnessTest; from: number; to: number }[] = [];
    for (const row of ROWS) {
      const re = new RegExp(row.re.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(bloque))) {
        marcas.push({ id: row.id, from: m.index, to: m.index + m[0].length });
      }
    }
    marcas.sort((a, b) => a.from - b.from);
    if (marcas.length === 0) continue;

    // La cabecera es lo que hay antes de la primera fila: ahí están las
    // fechas, una por columna.
    const fechas = datesIn(bloque.slice(0, marcas[0].from));
    if (fechas.length === 0) continue;

    for (let i = 0; i < marcas.length; i++) {
      const marca = marcas[i];
      const hasta = i + 1 < marcas.length ? marcas[i + 1].from : bloque.length;
      const valores = numbers(bloque.slice(marca.to, hasta), fechas.length);

      valores.forEach((value, column) => {
        const date = fechas[column];
        if (!date) return;
        const test = take(date);
        // La primera tabla que trae un campo manda: las de después son
        // resúmenes de la misma cifra.
        if (typeof test[marca.id] !== 'number') {
          (test as unknown as Record<string, unknown>)[marca.id] = value;
        }
      });
    }
  }

  // Una misma tanda de pruebas se reparte en varios días —el salto un día y
  // el esprint otro— y el informe lo cuenta como columnas distintas. Para
  // comparar hace falta que sea una sola medición, así que lo que cae dentro
  // del mismo mes se junta y se queda con la fecha más reciente.
  const sueltas = [...porFecha.values()].sort((a, b) => a.date.localeCompare(b.date)).filter(hasData);
  const tests: FitnessTest[] = [];
  for (const test of sueltas) {
    const previa = tests[tests.length - 1];
    if (previa && Math.abs(Date.parse(test.date) - Date.parse(previa.date)) < 31 * 24 * 3600 * 1000) {
      // La cifra más reciente manda; lo que sólo traía la anterior se queda.
      const junta: FitnessTest = { ...previa, ...Object.fromEntries(Object.entries(test).filter(([, v]) => v !== undefined)) };
      junta.date = test.date;
      junta.id = testId(profileId, test.date, 'rx2');
      tests[tests.length - 1] = junta;
      continue;
    }
    tests.push(test);
  }

  /* ----------------------------------------------------------- la portada */

  // Los datos del día del informe: van a la prueba más reciente, que es la
  // que se hizo ese día.
  const ultima = tests[tests.length - 1];
  if (ultima && portada) {
    const set = (id: keyof FitnessTest, value: number | undefined) => {
      if (value !== undefined && typeof ultima[id] !== 'number') (ultima as unknown as Record<string, unknown>)[id] = value;
    };
    set('height', after(portada, /altura/, [80, 200]));
    set('weight', after(portada, /peso/, [10, 120]));
    set('legLength', after(portada, /longitud\s*(?:de\s*)?piernas/, [40, 130]));
    set('sittingHeight', after(portada, /(?:talla|altura)\s*sentad/, [40, 120]));
    ultima.age = ultima.age ?? after(portada, /edad\s*cronol\w*/, [3, 21]);
    ultima.bioAge = ultima.bioAge ?? after(portada, /edad\s*biol\w*\s*estimada/, [3, 21]);
    ultima.phvAge = ultima.phvAge ?? after(portada, /pico\s*de\s*velocidad\s*de\s*crecimiento/, [8, 21]);
  }

  if (tests.length === 0) {
    warnings.push('He reconocido el informe pero no he sabido leer sus tablas: mete las cifras a mano.');
  }

  return { who, tests, warnings, kind: 'fisico' };
}
