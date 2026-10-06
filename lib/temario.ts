import type { DateKey, Visual } from '@/types';

/* =========================================================================
 *  El temario del primer trimestre, para los retos del cole.
 *
 *  Sale de los libros del curso 26-27 y, donde no hay libro, del currículo
 *  de la Comunidad de Madrid (Decreto 61/2022):
 *
 *   - **Matemáticas**: Santillana, *Construyendo Mundos* 3 y 4. El índice de
 *     3º marca el fin del primer trimestre tras la unidad 4; en 4º se supone
 *     el mismo corte (12 unidades, 4 por trimestre).
 *   - **English**: *Oxford Discover* 3 y 4, dos unidades por «Big Question»;
 *     en el primer trimestre caen las tres primeras preguntas (U1-6).
 *   - **Lengua**: no hay libro de texto, sólo lecturas y cuadernillos de
 *     ortografía; los bloques siguen el orden habitual del ciclo.
 *   - **Natural y Social Science**: no tienen libro en la lista; los bloques
 *     son los del currículo, en el orden en que suelen darse.
 *
 *  Lo supuesto es fácil de corregir: cada tema dice desde qué día se da, y
 *  basta con mover esa fecha o el contenido cuando se sepa lo que llevan de
 *  verdad en clase. En el código no hay ninguna nota de nadie: sólo temario.
 *
 *  Cada tema sabe fabricar preguntas. Las de números salen de generadores
 *  —infinitas, con los números del día— y las de ciencias de un banco
 *  fijo; un reto son cinco, todas del tema que toca esa semana.
 * ========================================================================= */

export type Asignatura = 'mates' | 'lengua' | 'science' | 'english' | 'social';
export type Curso = 3 | 4;

export type Rand = () => number;

/** Una pregunta antes de barajar: la buena y las malas. */
export interface Pregunta {
  icon: string;
  prompt: string;
  ok: string;
  no: string[];
  why: string;
  /** El material con el que se ve (ver `components/games/Material.tsx`). */
  visual?: Visual;
}

export interface Tema {
  id: string;
  asignatura: Asignatura;
  curso: Curso;
  /** Desde qué día se da en clase. Manda hasta que empieza el siguiente. */
  desde: DateKey;
  titulo: string;
  /** De dónde sale: el libro y la unidad, o el currículo. */
  fuente: string;
  /** Lo que entra, en pocas palabras, para enseñarlo antes del reto. */
  puntos: string[];
  /** Fabricantes de preguntas: se reparten las cinco entre ellos. */
  hacer: ((rand: Rand) => Pregunta)[];
}

/* ---------------------------------------------------------------------------
 * Utilidades
 * ------------------------------------------------------------------------- */

export function makeRand(seed: number): Rand {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function entre(rand: Rand, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function uno<T>(rand: Rand, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

export function barajar<T>(items: readonly T[], rand: Rand): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Con punto de millar, como en el libro: 4.736. */
function num(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Tres respuestas malas distintas de la buena y entre sí, cerca de ella. */
function cercanos(rand: Rand, bueno: number, pasos: number[]): number[] {
  const out = new Set<number>();
  for (const p of barajar(pasos, rand)) {
    const v = bueno + p;
    if (v >= 0 && v !== bueno) out.add(v);
    if (out.size === 3) break;
  }
  let extra = 1;
  while (out.size < 3) {
    if (bueno + extra !== bueno) out.add(bueno + extra);
    extra += 1;
  }
  return [...out];
}

function numerica(icon: string, prompt: string, bueno: number, malos: number[], why: string, visual?: Visual): Pregunta {
  return { icon, prompt, ok: num(bueno), no: malos.map(num), why, visual };
}

/** Del banco: una pregunta fija, elegida al azar. */
function delBanco(banco: Pregunta[]): (rand: Rand) => Pregunta {
  return (rand) => uno(rand, banco);
}

function p(icon: string, prompt: string, ok: string, no: string[], why: string, visual?: Visual): Pregunta {
  return { icon, prompt, ok, no, why, visual };
}

/* ---------------------------------------------------------------------------
 * Números en letra, para leer y escribir números
 * ------------------------------------------------------------------------- */

const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function hasta999(n: number): string {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    if (r < 30) partes.push(UNIDADES[r]);
    else partes.push(DECENAS[Math.floor(r / 10)] + (r % 10 ? ` y ${UNIDADES[r % 10]}` : ''));
  }
  return partes.join(' ');
}

export function enLetra(n: number): string {
  if (n === 0) return 'cero';
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (miles === 1) partes.push('mil');
  else if (miles > 1) partes.push(`${hasta999(miles).replace(/uno$/, 'un').replace(/veintiuno$/, 'veintiún')} mil`);
  if (resto) partes.push(hasta999(resto));
  return partes.join(' ');
}

const ROMANOS: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function romano(n: number): string {
  let out = '';
  let r = n;
  for (const [v, s] of ROMANOS) {
    while (r >= v) {
      out += s;
      r -= v;
    }
  }
  return out;
}

const ORDINALES = ['', 'primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo', 'undécimo', 'duodécimo', 'decimotercero', 'decimocuarto', 'decimoquinto', 'decimosexto', 'decimoséptimo', 'decimoctavo', 'decimonoveno', 'vigésimo'];

/* ---------------------------------------------------------------------------
 * MATEMÁTICAS
 * ------------------------------------------------------------------------- */

const valorCifra = (max: number) => (rand: Rand): Pregunta => {
  const n = entre(rand, max / 10, max - 1);
  const s = String(n);
  // Una cifra que no sea la de las unidades ni un cero.
  const sitios = s.split('').map((c, i) => i).filter((i) => i < s.length - 1 && s[i] !== '0');
  const i = uno(rand, sitios);
  const cifra = Number(s[i]);
  const lugar = s.length - 1 - i;
  const valor = cifra * 10 ** lugar;
  const nombres = ['unidades', 'decenas', 'centenas', 'unidades de millar', 'decenas de millar'];
  const malos = [cifra, cifra * 10 ** (lugar + 1), lugar > 1 ? cifra * 10 ** (lugar - 1) : valor + 1];
  return numerica(
    '🔢',
    `En el número ${num(n)}, ¿cuánto vale la cifra ${cifra} de las ${nombres[lugar]}?`,
    valor,
    malos,
    `Está en las ${nombres[lugar]}: vale ${cifra} × ${num(10 ** lugar)} = ${num(valor)}.`,
    { tipo: 'perlas', n },
  );
};

const leerNumero = (min: number, max: number) => (rand: Rand): Pregunta => {
  const n = entre(rand, min, max);
  const cambia = (k: number) => Math.max(min, n + k);
  const malos = [cambia(100), cambia(-10), Number(String(n).split('').reverse().join('')) || n + 1000]
    .filter((v, i, a) => v !== n && a.indexOf(v) === i);
  while (malos.length < 3) malos.push(n + 1 + malos.length);
  return {
    icon: '✍️',
    prompt: `¿Cómo se escribe con cifras «${enLetra(n)}»?`,
    ok: num(n),
    no: malos.slice(0, 3).map(num),
    why: `${enLetra(n)[0].toUpperCase()}${enLetra(n).slice(1)} = ${num(n)}.`,
    visual: { tipo: 'perlas', n },
  };
};

const mayor = (min: number, max: number) => (rand: Rand): Pregunta => {
  const base = entre(rand, min, max);
  const d = String(base).split('');
  const otros = new Set<number>([base]);
  let intentos = 0;
  while (otros.size < 4 && intentos < 50) {
    intentos += 1;
    const v = Number(barajar(d, rand).join(''));
    if (v >= min) otros.add(v);
  }
  while (otros.size < 4) otros.add(base - otros.size * 11);
  const lista = [...otros];
  const grande = Math.max(...lista);
  return {
    icon: '⚖️',
    prompt: '¿Cuál es el número MAYOR?',
    ok: num(grande),
    no: lista.filter((v) => v !== grande).map(num),
    why: 'Se comparan las cifras de izquierda a derecha: gana el que tiene la cifra más grande en el primer sitio donde son distintos.',
  };
};

const ordinal = (rand: Rand): Pregunta => {
  const n = entre(rand, 5, 20);
  const malos = barajar([n - 1, n + 1, n + 2, n - 2].filter((v) => v >= 1 && v <= 20), rand).slice(0, 3);
  return {
    icon: '🥇',
    prompt: `En una carrera llegas en el puesto ${n}. ¿Cómo se dice?`,
    ok: ORDINALES[n],
    no: malos.map((v) => ORDINALES[v]),
    why: `El puesto ${n} es el ${ORDINALES[n]} (${n}.º).`,
  };
};

const aproximar = (a: 10 | 100, min: number, max: number) => (rand: Rand): Pregunta => {
  let n = entre(rand, min, max);
  if (n % a === a / 2) n += 1;
  const bueno = Math.round(n / a) * a;
  const malos = [bueno + a, bueno - a, Math.floor(n / a) * a === bueno ? Math.ceil(n / a) * a : Math.floor(n / a) * a]
    .filter((v, i, arr) => v !== bueno && v >= 0 && arr.indexOf(v) === i);
  while (malos.length < 3) malos.push(bueno + a * (malos.length + 2));
  return numerica(
    '🎯',
    `Aproxima ${num(n)} a las ${a === 10 ? 'decenas' : 'centenas'}.`,
    bueno,
    malos.slice(0, 3),
    `Se mira la cifra de ${a === 10 ? 'las unidades' : 'las decenas'}: si es 5 o más, se sube; si no, se baja. ${num(n)} → ${num(bueno)}.`,
  );
};

const sumaLlevando = (cifras: number) => (rand: Rand): Pregunta => {
  const max = 10 ** cifras / 2;
  const a = entre(rand, max / 5, max);
  const b = entre(rand, max / 5, max);
  const s = a + b;
  return numerica('➕', `${num(a)} + ${num(b)} = ?`, s, cercanos(rand, s, [10, -10, 100, -100, 1, -1, 1000]), `Se suma columna a columna desde las unidades, llevando cuando pasa de 9: ${num(s)}.`, { tipo: 'columnas', a, b, op: '+', resultado: s });
};

const restaLlevando = (cifras: number) => (rand: Rand): Pregunta => {
  const a = entre(rand, 10 ** (cifras - 1) * 2, 10 ** cifras - 1);
  const b = entre(rand, 10 ** (cifras - 1), a - 1);
  const r = a - b;
  return numerica('➖', `${num(a)} − ${num(b)} = ?`, r, cercanos(rand, r, [10, -10, 100, -100, 1, -1, 1000]), `Comprobación: ${num(r)} + ${num(b)} = ${num(a)}.`, { tipo: 'columnas', a, b, op: '−', resultado: r });
};

const restaHueco = (rand: Rand): Pregunta => {
  const a = entre(rand, 2000, 9000);
  const r = entre(rand, 300, a - 500);
  const b = a - r;
  return numerica('🧩', `${num(a)} − ▢ = ${num(r)}. ¿Qué número falta?`, b, cercanos(rand, b, [10, -10, 100, -100, 1000]), `El que falta es ${num(a)} − ${num(r)} = ${num(b)}.`);
};

const problemaDos = (rand: Rand): Pregunta => {
  const tenia = entre(rand, 120, 480);
  const gana = entre(rand, 30, 150);
  const gasta = entre(rand, 20, 100);
  const r = tenia + gana - gasta;
  const contexto = uno(rand, [
    ['cromos', 'Le regalan', 'regala a su hermano', '🃏'],
    ['puntos en el videojuego', 'Gana', 'pierde', '🎮'],
    ['canicas', 'Le dan', 'pierde en el recreo', '🔮'],
  ]);
  return numerica(
    '📝',
    `Oliver tiene ${tenia} ${contexto[0]}. ${contexto[1]} ${gana} y luego ${contexto[2]} ${gasta}. ¿Cuántos tiene ahora?`,
    r,
    [tenia + gana + gasta, tenia - gana + gasta, r + 10],
    `Dos operaciones: ${tenia} + ${gana} = ${tenia + gana}, y ${tenia + gana} − ${gasta} = ${r}.`,
    { tipo: 'lamina', emoji: contexto[3], rotulo: `${tenia}  ➕ ${gana}  ➖ ${gasta}` },
  );
};

const estimarSuma = (rand: Rand): Pregunta => {
  const a = entre(rand, 210, 880);
  const b = entre(rand, 210, 880);
  const bueno = Math.round(a / 100) * 100 + Math.round(b / 100) * 100;
  return numerica('🤔', `Sin hacer la cuenta exacta: ¿cuánto da más o menos ${a} + ${b}?`, bueno, [bueno + 300, bueno - 300, bueno + 1000], `Se redondea cada uno a las centenas y se suman: ${Math.round(a / 100) * 100} + ${Math.round(b / 100) * 100} = ${bueno}.`);
};

const tabla = (rand: Rand): Pregunta => {
  const a = entre(rand, 3, 9);
  const b = entre(rand, 3, 9);
  return numerica('✖️', `${a} × ${b} = ?`, a * b, cercanos(rand, a * b, [a, -a, b, -b, 1, -1]), `La tabla del ${a}: ${a} × ${b} = ${a * b}.`, { tipo: 'matriz', filas: a, columnas: b });
};

const dobleTriple = (rand: Rand): Pregunta => {
  const n = entre(rand, 12, 45);
  const triple = rand() < 0.5;
  const r = n * (triple ? 3 : 2);
  return numerica('🔁', `¿Cuál es el ${triple ? 'triple' : 'doble'} de ${n}?`, r, [n * (triple ? 2 : 3), r + 10, n + (triple ? 3 : 2)], `${triple ? 'Triple' : 'Doble'} es multiplicar por ${triple ? 3 : 2}: ${n} × ${triple ? 3 : 2} = ${r}.`, { tipo: 'columnas', a: n, b: triple ? 3 : 2, op: '×', resultado: r });
};

const porUnaCifra = (max: number) => (rand: Rand): Pregunta => {
  const a = entre(rand, 12, max);
  const b = entre(rand, 3, 9);
  return numerica('✖️', `${num(a)} × ${b} = ?`, a * b, cercanos(rand, a * b, [10, -10, b, -b, 100]), `Se multiplica cada cifra por ${b} empezando por las unidades y llevando: ${num(a * b)}.`, { tipo: 'columnas', a, b, op: '×', resultado: a * b });
};

const porDosCifras = (rand: Rand): Pregunta => {
  const a = entre(rand, 21, 99);
  const b = entre(rand, 11, 39);
  return numerica('✖️', `${a} × ${b} = ?`, a * b, cercanos(rand, a * b, [10, -10, a, -a, 100]), `${a} × ${b % 10} = ${a * (b % 10)} y ${a} × ${b - (b % 10)} = ${a * (b - (b % 10))}; sumados, ${a * b}.`, { tipo: 'columnas', a, b, op: '×', resultado: a * b });
};

const porCeros = (rand: Rand): Pregunta => {
  const a = entre(rand, 12, 85);
  const ceros = uno(rand, [10, 100, 20, 300]);
  const r = a * ceros;
  return numerica('0️⃣', `${a} × ${ceros} = ?`, r, [r * 10, r / 10, r + ceros], `Se multiplica sin los ceros y luego se añaden: ${a} × ${ceros / 10 ** (String(ceros).length - 1)} y ${String(ceros).length - 1} cero(s) → ${num(r)}.`, { tipo: 'columnas', a, b: ceros, op: '×', resultado: r });
};

const problemaMulti = (rand: Rand): Pregunta => {
  const cajas = entre(rand, 4, 9);
  const cada = entre(rand, 12, 48);
  const cosa = uno(rand, [['cajas', 'balones'], ['equipos', 'jugadores'], ['álbumes', 'cromos'], ['autobuses', 'niños']]);
  return numerica('📦', `Hay ${cajas} ${cosa[0]} con ${cada} ${cosa[1]} cada uno. ¿Cuántos ${cosa[1]} hay en total?`, cajas * cada, [cajas + cada, cajas * cada + cada, cajas * cada - cajas], `Cosas iguales repetidas: se multiplica. ${cajas} × ${cada} = ${cajas * cada}.`, cada <= 24 ? { tipo: 'matriz', filas: cajas, columnas: cada } : { tipo: 'columnas', a: cada, b: cajas, op: '×', resultado: cajas * cada });
};

const romanos = (rand: Rand): Pregunta => {
  const leer = rand() < 0.5;
  const n = rand() < 0.3 ? entre(rand, 1990, 2030) : entre(rand, 4, 99);
  const malos = cercanos(rand, n, [1, -1, 10, -10, 5, -5]);
  if (leer) {
    return numerica('🏛️', `¿Qué número es ${romano(n)}?`, n, malos, `${romano(n)} = ${n}. Si una letra menor va delante de una mayor, se resta (IV = 4, IX = 9, XL = 40, XC = 90).`);
  }
  return { icon: '🏛️', prompt: `¿Cómo se escribe ${n} en números romanos?`, ok: romano(n), no: malos.map(romano), why: `${n} = ${romano(n)}. I=1, V=5, X=10, L=50, C=100, D=500, M=1000.` };
};

const propiedades = (rand: Rand): Pregunta => {
  const a = entre(rand, 12, 60);
  const b = entre(rand, 12, 60);
  const c = entre(rand, 12, 60);
  return uno(rand, [
    p('🔄', `${a} + ${b} = ${b} + ${a}. ¿Qué propiedad es?`, 'Conmutativa', ['Asociativa', 'Distributiva', 'Elemento neutro'], 'Conmutativa: el orden de los sumandos no cambia el resultado.'),
    p('🧷', `(${a} + ${b}) + ${c} = ${a} + (${b} + ${c}). ¿Qué propiedad es?`, 'Asociativa', ['Conmutativa', 'Distributiva', 'Elemento neutro'], 'Asociativa: da igual cómo agrupes los sumandos.'),
    p('🔄', `${a} × 4 = 4 × ${a}. ¿Qué propiedad de la multiplicación es?`, 'Conmutativa', ['Asociativa', 'Distributiva', 'Elemento neutro'], 'El orden de los factores no cambia el producto.'),
    p('🧮', `${a} × (3 + 2) = ${a} × 3 + ${a} × 2. ¿Qué propiedad es?`, 'Distributiva', ['Conmutativa', 'Asociativa', 'Elemento neutro'], 'Distributiva: multiplicar por una suma es sumar los productos.'),
  ]);
};

const combinadas = (rand: Rand): Pregunta => {
  const a = entre(rand, 300, 900);
  const b = entre(rand, 100, 500);
  const c = entre(rand, 50, 300);
  const r = a + b - c;
  return numerica('🧮', `${a} + ${b} − ${c} = ?`, r, cercanos(rand, r, [10, -10, 100, -100, 2 * c]), `De izquierda a derecha: ${a} + ${b} = ${a + b}; ${a + b} − ${c} = ${r}.`, { tipo: 'columnas', a, b, op: '+', resultado: a + b });
};

const estimarProducto = (rand: Rand): Pregunta => {
  const a = entre(rand, 21, 89);
  const b = entre(rand, 3, 9);
  const bueno = Math.round(a / 10) * 10 * b;
  return numerica('🤔', `Más o menos, ¿cuánto da ${a} × ${b}?`, bueno, [bueno * 10, bueno / 2, bueno + 100], `Se redondea ${a} a ${Math.round(a / 10) * 10} y se multiplica: ${Math.round(a / 10) * 10} × ${b} = ${bueno}.`);
};

const perimetro = (rand: Rand): Pregunta => {
  const tipo = uno(rand, ['rect', 'cuad', 'tri']);
  if (tipo === 'cuad') {
    const l = entre(rand, 3, 15);
    return numerica('⬛', `Un cuadrado tiene lados de ${l} cm. ¿Cuál es su perímetro?`, 4 * l, [l * l, 2 * l, 3 * l], `Perímetro = suma de los lados: 4 × ${l} = ${4 * l} cm.`, { tipo: 'rect', a: l, b: l, ver: 'perimetro' });
  }
  if (tipo === 'tri') {
    const l = entre(rand, 4, 15);
    return numerica('🔺', `Un triángulo equilátero tiene lados de ${l} cm. ¿Su perímetro?`, 3 * l, [2 * l, 4 * l, l + 3], `Equilátero: los tres lados iguales. 3 × ${l} = ${3 * l} cm.`, { tipo: 'poligono', lados: 3, medida: l });
  }
  const a = entre(rand, 4, 15);
  const b = entre(rand, 2, a - 1);
  return numerica('▭', `Un rectángulo mide ${a} cm de largo y ${b} cm de ancho. ¿Su perímetro?`, 2 * (a + b), [a + b, a * b, 2 * a + b], `${a} + ${b} + ${a} + ${b} = ${2 * (a + b)} cm.`, { tipo: 'rect', a, b, ver: 'perimetro' });
};

const area = (rand: Rand): Pregunta => {
  const a = entre(rand, 3, 9);
  const b = entre(rand, 2, 8);
  return numerica('🟩', `Un rectángulo hecho con cuadraditos tiene ${a} filas de ${b} cuadraditos. ¿Cuántos cuadraditos mide su área?`, a * b, [a + b, 2 * (a + b), a * b + a], `Área = filas × cuadraditos por fila = ${a} × ${b} = ${a * b}.`, { tipo: 'rect', a: b, b: a, ver: 'area' });
};

const poligono = (rand: Rand): Pregunta => {
  const lista: [number, string][] = [[3, 'triángulo'], [4, 'cuadrilátero'], [5, 'pentágono'], [6, 'hexágono'], [7, 'heptágono'], [8, 'octógono']];
  const [n, nombre] = uno(rand, lista);
  return { icon: '🔷', prompt: `¿Cómo se llama un polígono de ${n} lados?`, ok: nombre, no: barajar(lista.filter(([m]) => m !== n), rand).slice(0, 3).map(([, s]) => s), why: `${n} lados = ${nombre}. Cuenta los vértices: hay tantos como lados.`, visual: { tipo: 'poligono', lados: n } };
};

const anguloGrados = (rand: Rand): Pregunta => {
  const g = uno(rand, [30, 45, 60, 75, 89, 90, 100, 120, 135, 150, 170]);
  const tipo = g < 90 ? 'Agudo' : g === 90 ? 'Recto' : 'Obtuso';
  return { icon: '📐', prompt: `Un ángulo de ${g}° es…`, ok: tipo, no: ['Agudo', 'Recto', 'Obtuso', 'Llano'].filter((t) => t !== tipo), why: 'Agudo: menos de 90°. Recto: 90° justos (como una esquina). Obtuso: más de 90°.', visual: { tipo: 'angulo', grados: g } };
};

const RECTAS: Pregunta[] = [
  p('🛤️', 'Dos rectas que nunca se cortan, como las vías del tren, son…', 'Paralelas', ['Secantes', 'Perpendiculares', 'Curvas'], 'Paralelas: siempre a la misma distancia, nunca se tocan.', { tipo: 'rectas', clase: 'paralelas' }),
  p('✝️', 'Dos rectas que se cortan formando cuatro ángulos rectos son…', 'Perpendiculares', ['Paralelas', 'Curvas', 'Semirrectas'], 'Perpendiculares: se cortan en ángulo recto, como una cruz.', { tipo: 'rectas', clase: 'perpendiculares' }),
  p('✂️', 'Dos rectas que se cortan en un punto son…', 'Secantes', ['Paralelas', 'Iguales', 'Curvas'], 'Secantes: se cortan. Si además forman ángulos rectos, son perpendiculares.', { tipo: 'rectas', clase: 'secantes' }),
  p('➡️', 'Una línea que tiene principio pero no tiene fin es una…', 'Semirrecta', ['Recta', 'Segmento', 'Curva'], 'Semirrecta: un origen y sigue para siempre por un lado.', { tipo: 'rectas', clase: 'semirrecta' }),
  p('📏', 'Un trozo de recta con dos extremos es un…', 'Segmento', ['Semirrecta', 'Ángulo', 'Vértice'], 'Segmento: empieza y acaba; se puede medir con la regla.', { tipo: 'rectas', clase: 'segmento' }),
  p('🕒', 'Las agujas del reloj a las 3 en punto forman un ángulo…', 'Recto', ['Agudo', 'Obtuso', 'Llano'], 'A las 3 en punto forman 90°: un ángulo recto.', { tipo: 'rectas', clase: 'reloj' }),
  p('🦋', 'Si doblas una mariposa por la mitad y las dos partes coinciden, la línea del doblez es un…', 'Eje de simetría', ['Segmento', 'Ángulo', 'Perímetro'], 'El eje de simetría divide la figura en dos mitades iguales, como un espejo.', { tipo: 'rectas', clase: 'simetria' }),
  p('📐', 'El punto donde se juntan los dos lados de un ángulo se llama…', 'Vértice', ['Lado', 'Eje', 'Arco'], 'El vértice es la punta del ángulo.', { tipo: 'rectas', clase: 'vertice' }),
];

const TRIANGULOS: Pregunta[] = [
  p('🔺', 'Un triángulo con los tres lados iguales es…', 'Equilátero', ['Isósceles', 'Escaleno', 'Rectángulo'], 'Equilátero: tres lados iguales.', { tipo: 'poligono', lados: 3, clase: 'equilatero' }),
  p('🔺', 'Un triángulo con dos lados iguales y uno distinto es…', 'Isósceles', ['Equilátero', 'Escaleno', 'Obtusángulo'], 'Isósceles: dos lados iguales.', { tipo: 'poligono', lados: 3, clase: 'isosceles' }),
  p('🔺', 'Un triángulo con los tres lados distintos es…', 'Escaleno', ['Isósceles', 'Equilátero', 'Regular'], 'Escaleno: ningún lado igual.', { tipo: 'poligono', lados: 3, clase: 'escaleno' }),
  p('📐', 'Un triángulo con un ángulo recto se llama…', 'Rectángulo', ['Acutángulo', 'Obtusángulo', 'Equilátero'], 'Triángulo rectángulo: tiene un ángulo de 90°.', { tipo: 'poligono', lados: 3, clase: 'rectangulo' }),
  p('▱', 'Un cuadrilátero con los lados opuestos paralelos es un…', 'Paralelogramo', ['Trapecio', 'Trapezoide', 'Pentágono'], 'Paralelogramo: dos pares de lados paralelos (cuadrado, rectángulo, rombo, romboide).'),
  p('🔷', 'Un polígono regular tiene…', 'Todos los lados y ángulos iguales', ['Sólo dos lados iguales', 'Un ángulo recto', 'Lados curvos'], 'Regular = lados iguales y ángulos iguales.', { tipo: 'poligono', lados: 6 }),
];

/* ---------------------------------------------------------------------------
 * LENGUA
 * ------------------------------------------------------------------------- */

/** Palabras con sus sílabas; la tónica, en mayúsculas. */
const PALABRAS = [
  'ca-MIÓN', 're-LOJ', 'pa-PEL', 'can-CIÓN', 'so-FÁ', 'ra-TÓN', 'ma-RRÓN', 'ca-FÉ', 'jar-DÍN', 'a-ZUL', 'bal-CÓN', 'tam-BOR',
  'ÁR-bol', 'LÁ-piz', 'ME-sa', 'VEN-ta-na', 'FÚT-bol', 'CÉS-ped', 'a-ZÚ-car', 'ma-ri-PO-sa', 'pe-LO-ta', 'por-TE-ro', 'ÁN-gel', 'CÁR-cel',
  'MÚ-si-ca', 'PÁ-ja-ro', 'LÁM-pa-ra', 'MÉ-di-co', 'CÁ-ma-ra', 'SÁ-ba-do', 'NÚ-me-ro', 'PLÁ-ta-no', 'te-LÉ-fo-no', 'MÁ-gi-co', 'BRÚ-ju-la', 'pi-RÁ-mi-de',
];

interface Palabra {
  palabra: string;
  silabas: string[];
  tonica: number;
  tipo: 'aguda' | 'llana' | 'esdrújula';
}

function leerPalabra(s: string): Palabra {
  const partes = s.split('-');
  const tonica = partes.findIndex((x) => x !== x.toLowerCase());
  const silabas = partes.map((x) => x.toLowerCase());
  const desdeElFinal = silabas.length - 1 - tonica;
  return { palabra: silabas.join(''), silabas, tonica, tipo: desdeElFinal === 0 ? 'aguda' : desdeElFinal === 1 ? 'llana' : 'esdrújula' };
}

const LISTA = PALABRAS.map(leerPalabra);

const contarSilabas = (rand: Rand): Pregunta => {
  const w = uno(rand, LISTA.filter((x) => x.silabas.length >= 2));
  const n = w.silabas.length;
  return { icon: '👏', prompt: `¿Cuántas sílabas tiene «${w.palabra}»?`, ok: String(n), no: [n - 1, n + 1, n + 2].filter((v) => v > 0).map(String), why: `Se dan palmadas: ${w.silabas.join(' - ')}. Son ${n}.`, visual: { tipo: 'silabas', silabas: w.silabas, tonica: w.tonica, juntas: true } };
};

const silabaTonica = (rand: Rand): Pregunta => {
  const w = uno(rand, LISTA.filter((x) => x.silabas.length >= 3));
  return { icon: '🔊', prompt: `¿Cuál es la sílaba tónica de «${w.palabra}»?`, ok: w.silabas[w.tonica], no: w.silabas.filter((_, i) => i !== w.tonica).slice(0, 3), why: `La que suena más fuerte: ${w.silabas.map((s, i) => (i === w.tonica ? s.toUpperCase() : s)).join('-')}. Truco: dila como si llamaras a alguien desde lejos.`, visual: { tipo: 'silabas', silabas: w.silabas, tonica: w.tonica } };
};

const agudaLlana = (rand: Rand): Pregunta => {
  const w = uno(rand, LISTA);
  const nombres = { aguda: 'Aguda', llana: 'Llana', 'esdrújula': 'Esdrújula' } as const;
  return {
    icon: '🎵',
    prompt: `«${w.palabra}» es una palabra…`,
    ok: nombres[w.tipo],
    no: [...Object.values(nombres).filter((n) => n !== nombres[w.tipo]), 'Monosílaba'],
    why: `${w.silabas.map((s, i) => (i === w.tonica ? s.toUpperCase() : s)).join('-')}: la tónica es la ${w.tipo === 'aguda' ? 'última' : w.tipo === 'llana' ? 'penúltima' : 'antepenúltima'} sílaba → ${w.tipo}.`,
    visual: { tipo: 'silabas', silabas: w.silabas, tonica: w.tonica },
  };
};

const SIN_TILDE: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };
const CON_TILDE: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };

/** La misma palabra con la tilde mal: quitada si la lleva, puesta si no. */
function malaTilde(w: Palabra): string {
  if (/[áéíóú]/.test(w.palabra)) return w.palabra.replace(/[áéíóú]/g, (v) => SIN_TILDE[v]);
  const s = w.silabas[w.tonica];
  const m = /[aeo](?!.*[aeo])/.exec(s) ?? /[aeiou](?!.*[aeiou])/.exec(s);
  if (!m) return w.palabra + 'ó';
  const nueva = s.slice(0, m.index) + CON_TILDE[m[0]] + s.slice(m.index + 1);
  return w.silabas.map((x, i) => (i === w.tonica ? nueva : x)).join('');
}

const tilde = (rand: Rand): Pregunta => {
  const ws = barajar(LISTA, rand).slice(0, 4);
  const buena = ws[0];
  return {
    icon: '✏️',
    prompt: '¿Cuál está BIEN escrita?',
    ok: buena.palabra,
    no: ws.slice(1).map(malaTilde),
    why: `Agudas: tilde si acaban en vocal, n o s. Llanas: tilde si NO acaban en vocal, n o s. Esdrújulas: siempre. «${buena.palabra}» es ${buena.tipo}.`,
  };
};

const DICCIONARIO = ['árbol', 'balón', 'cometa', 'dragón', 'escuela', 'fresa', 'gato', 'helado', 'isla', 'jirafa', 'koala', 'león', 'mono', 'nube', 'ñu', 'oso', 'portero', 'queso', 'ratón', 'sol', 'tigre', 'uva', 'vaca', 'zapato', 'casa', 'cama', 'campo', 'carta', 'pelota', 'perro', 'pez', 'piña', 'mesa', 'mano', 'mar', 'moto'];

const ordenAlfabetico = (rand: Rand): Pregunta => {
  // A veces cuatro palabras que empiezan igual, que es lo difícil.
  const mismaLetra = rand() < 0.5;
  let grupo: string[];
  if (mismaLetra) {
    const letra = uno(rand, ['c', 'p', 'm']);
    grupo = barajar(DICCIONARIO.filter((w) => w.startsWith(letra)), rand).slice(0, 4);
  } else {
    grupo = barajar(DICCIONARIO, rand).slice(0, 4);
  }
  const orden = [...grupo].sort((a, b) => a.localeCompare(b, 'es'));
  return {
    icon: '📖',
    prompt: '¿Qué palabra va PRIMERO en el diccionario?',
    ok: orden[0],
    no: orden.slice(1),
    why: `En orden alfabético: ${orden.join(', ')}.${mismaLetra ? ' Si empiezan igual, se mira la segunda letra, y luego la tercera.' : ''}`,
    visual: { tipo: 'letras', palabras: grupo, orden: true },
  };
};

const FRASES: [string, string, string, string][] = [
  ['el', 'perro', 'marrón', 'ladra'], ['la', 'niña', 'alegre', 'canta'], ['el', 'portero', 'valiente', 'para'],
  ['la', 'pelota', 'roja', 'bota'], ['el', 'gato', 'negro', 'duerme'], ['los', 'pájaros', 'pequeños', 'vuelan'],
  ['las', 'flores', 'amarillas', 'crecen'], ['el', 'tigre', 'rápido', 'corre'], ['la', 'profesora', 'simpática', 'explica'],
];

const nombreAdjetivo = (rand: Rand): Pregunta => {
  const [art, nombre, adj, verbo] = uno(rand, FRASES);
  const frase = `${art[0].toUpperCase()}${art.slice(1)} ${nombre} ${adj} ${verbo}.`;
  const pide = uno(rand, ['nombre', 'adjetivo', 'verbo'] as const);
  const ok = pide === 'nombre' ? nombre : pide === 'adjetivo' ? adj : verbo;
  const explica = {
    nombre: `«${nombre}» es el nombre (sustantivo): nombra a un ser o cosa.`,
    adjetivo: `«${adj}» es el adjetivo: dice cómo es «${nombre}».`,
    verbo: `«${verbo}» es el verbo: dice lo que hace.`,
  };
  return { icon: '🔎', prompt: `«${frase}» ¿Cuál es el ${pide === 'nombre' ? 'NOMBRE' : pide === 'adjetivo' ? 'ADJETIVO' : 'VERBO'}?`, ok, no: [art, nombre, adj, verbo].filter((x) => x !== ok), why: explica[pide], visual: { tipo: 'gramatica', palabras: [{ p: art, clase: 'articulo' }, { p: nombre, clase: 'nombre' }, { p: adj, clase: 'adjetivo' }, { p: verbo, clase: 'verbo' }] } };
};

const CONCORDANCIA: [string, string, string][] = [
  ['las', 'casas', 'blanc'], ['los', 'coches', 'roj'], ['la', 'camiseta', 'nuev'], ['el', 'balón', 'viej'],
  ['las', 'botas', 'negr'], ['los', 'niños', 'content'], ['la', 'portería', 'pequeñ'], ['el', 'campo', 'precios'],
];

const concordancia = (rand: Rand): Pregunta => {
  const [art, nombre, raiz] = uno(rand, CONCORDANCIA);
  const fem = art.startsWith('la');
  const plural = art.endsWith('s');
  const ok = raiz + (fem ? 'a' : 'o') + (plural ? 's' : '');
  const todas = ['o', 'a', 'os', 'as'].map((f) => raiz + f);
  return { icon: '🤝', prompt: `Completa: «${art} ${nombre} ___»`, ok, no: todas.filter((x) => x !== ok), why: `Nombre y adjetivo concuerdan en género y número: ${art} ${nombre} → ${fem ? 'femenino' : 'masculino'} ${plural ? 'plural' : 'singular'} → «${ok}».`, visual: { tipo: 'gramatica', palabras: [{ p: art, clase: 'articulo' }, { p: nombre, clase: 'nombre' }, { p: '___', clase: 'adjetivo' }] } };
};

const generoNumero = (rand: Rand): Pregunta => {
  const lista: [string, string, string][] = [['leones', 'Masculino plural', '🦁'], ['jirafa', 'Femenino singular', '🦒'], ['porterías', 'Femenino plural', '🥅'], ['balón', 'Masculino singular', '⚽'], ['ratones', 'Masculino plural', '🐭'], ['estrellas', 'Femenino plural', '⭐'], ['lápiz', 'Masculino singular', '✏️'], ['nariz', 'Femenino singular', '👃']];
  const [w, ok, dibujo] = uno(rand, lista);
  const visual: Visual = { tipo: 'lamina', emoji: /plural/.test(ok) ? dibujo.repeat(3) : dibujo };
  return { visual, icon: '🔤', prompt: `«${w}» es…`, ok, no: ['Masculino singular', 'Femenino singular', 'Masculino plural', 'Femenino plural'].filter((x) => x !== ok), why: `Se prueba con el artículo: «${/plural/.test(ok) ? (/Masc/.test(ok) ? 'los' : 'las') : /Masc/.test(ok) ? 'el' : 'la'} ${w}».` };
};

const COMUN_PROPIO: Pregunta[] = [
  p('🏷️', '¿Cuál es un nombre PROPIO?', 'Madrid', ['ciudad', 'río', 'perro'], 'Los nombres propios nombran a uno en concreto y van con mayúscula.'),
  p('🏷️', '¿Cuál es un nombre PROPIO?', 'Oliver', ['niño', 'futbolista', 'equipo'], 'Oliver es el nombre de uno en concreto: propio, con mayúscula.'),
  p('🏷️', '¿Cuál es un nombre COMÚN?', 'montaña', ['Teide', 'España', 'Leo'], 'Común: nombra cualquiera de su clase, con minúscula.'),
  p('🏷️', '¿Cuál es un nombre COMÚN?', 'balón', ['Benji', 'Alcobendas', 'Tajo'], '«balón» vale para cualquier balón: es común.'),
];

/** Huecos de ortografía: la palabra, el trozo bueno y los otros. */
const HUECOS: [string, string, string[]][] = [
  ['pingüino', 'gü', ['gu', 'g']], ['cigüeña', 'gü', ['gu', 'g']], ['guitarra', 'gu', ['gü', 'g']], ['guerra', 'gu', ['gü', 'g']],
  ['hoguera', 'gu', ['gü', 'g']], ['paraguas', 'gu', ['gü', 'g']], ['vergüenza', 'gü', ['gu', 'g']],
  ['queso', 'qu', ['c', 'k']], ['mosquito', 'qu', ['c', 'k']], ['paquete', 'qu', ['c', 'k']], ['cometa', 'c', ['qu', 'k']], ['cuento', 'c', ['qu', 'k']],
  ['perro', 'rr', ['r']], ['torre', 'rr', ['r']], ['carretera', 'rr', ['r']], ['ratón', 'r', ['rr']], ['Enrique', 'r', ['rr']], ['alrededor', 'r', ['rr']], ['pera', 'r', ['rr']],
  ['campo', 'm', ['n']], ['tiempo', 'm', ['n']], ['hombro', 'm', ['n']], ['sombra', 'm', ['n']], ['bombero', 'm', ['n']], ['trompeta', 'm', ['n']], ['cambio', 'm', ['n']],
];

const DIBUJO_PALABRA: Record<string, string> = {
  pingüino: '🐧', cigüeña: '🪶', guitarra: '🎸', guerra: '⚔️', hoguera: '🔥', paraguas: '☂️', vergüenza: '😳',
  queso: '🧀', mosquito: '🦟', paquete: '📦', cometa: '🪁', cuento: '📖',
  perro: '🐶', torre: '🗼', carretera: '🛣️', ratón: '🐭', Enrique: '👦', alrededor: '🔄', pera: '🍐',
  campo: '🌾', tiempo: '⏰', hombro: '💪', sombra: '🌳', bombero: '🚒', trompeta: '🎺', cambio: '🔁',
};

const hueco = (rand: Rand): Pregunta => {
  const [w, ok, otros] = uno(rand, HUECOS);
  const i = w.indexOf(ok);
  const conHueco = w.slice(0, i) + '__' + w.slice(i + ok.length);
  const reglas: Record<string, string> = {
    'gü': 'Con diéresis (gü) la u suena: pin-GÜI-no.',
    gu: 'Delante de e, i se escribe gu para que suene «g» suave y la u no suene.',
    qu: 'El sonido «k» delante de e, i se escribe qu.',
    c: 'El sonido «k» delante de a, o, u se escribe c.',
    rr: 'Entre vocales, el sonido fuerte se escribe rr.',
    r: 'Al principio de palabra y después de n, l o s, el sonido fuerte se escribe con una r.',
    m: 'Antes de p y b siempre se escribe m.',
  };
  const malos = otros.map((o) => o).concat(ok === 'm' ? ['ñ'] : ok === 'r' || ok === 'rr' ? ['l'] : []);
  const visual: Visual = { tipo: 'hueco', antes: w.slice(0, i), hueco: ok, despues: w.slice(i + ok.length), dibujo: DIBUJO_PALABRA[w] };
  return { icon: '🖊️', prompt: `¿Qué va en el hueco? «${conHueco}»`, ok, no: malos.slice(0, 3), why: `${w}. ${reglas[ok] ?? ''}`, visual };
};

const MAYUSCULAS: Pregunta[] = [
  p('🔠', '¿Cuál está bien escrita?', 'Leo vive en Madrid.', ['leo vive en Madrid.', 'Leo vive en madrid.', 'leo Vive en madrid.'], 'Mayúscula al empezar y en los nombres propios (Leo, Madrid).'),
  p('🔠', '¿Cuál está bien escrita?', 'Hoy juega el Real Madrid.', ['hoy juega el real madrid.', 'Hoy Juega El Real Madrid.', 'hoy juega el Real Madrid.'], 'Al principio de la frase y en el nombre del equipo.'),
  p('🔠', '¿Después de un punto se escribe…?', 'Mayúscula', ['Minúscula', 'Coma', 'Nada'], 'Después de punto, siempre mayúscula.'),
];

/* ---------------------------------------------------------------------------
 * NATURAL SCIENCE (en inglés, como en clase)
 * ------------------------------------------------------------------------- */

const VIDA: Pregunta[] = [
  p('🦠', 'What is the smallest part of a living thing?', 'A cell', ['An organ', 'A bone', 'A tissue'], 'All living things are made of cells (células).'),
  p('🫀', 'A group of similar cells working together is a…', 'Tissue', ['Organ', 'System', 'Skeleton'], 'Cells → tissues (tejidos) → organs → systems.'),
  p('🫁', 'The heart, the lungs and the stomach are…', 'Organs', ['Cells', 'Tissues', 'Bones only'], 'Organs (órganos) are made of different tissues.'),
  p('🌱', 'What are the three life functions?', 'Nutrition, interaction, reproduction', ['Eating, sleeping, playing', 'Running, jumping, swimming', 'Breathing, seeing, reading'], 'Las tres funciones vitales: nutrición, relación y reproducción.'),
  p('🐣', 'Which life function is about having babies?', 'Reproduction', ['Nutrition', 'Interaction', 'Digestion'], 'Reproduction = reproducción.'),
  p('👀', 'Seeing a ball and running to kick it is the life function of…', 'Interaction', ['Nutrition', 'Reproduction', 'Respiration'], 'Interaction (relación): we notice things and react.'),
  p('🍎', 'Getting energy from food is the life function of…', 'Nutrition', ['Interaction', 'Reproduction', 'Vision'], 'Nutrition (nutrición) gives us energy and materials to grow.'),
  p('🔬', 'We use this to see cells:', 'A microscope', ['A telescope', 'A ruler', 'Glasses'], 'Cells are tiny: we need a microscope.'),
  p('🧪', 'The first step of the scientific method is to…', 'Ask a question', ['Write the conclusion', 'Draw the result', 'Go home'], 'Question → hypothesis → experiment → results → conclusion.'),
  p('🪨', 'Which one is NOT a living thing?', 'A rock', ['A tree', 'A mushroom', 'A worm'], 'A rock does not eat, grow or reproduce.'),
];

const NUTRICION: Pregunta[] = [
  p('🍽️', 'Food goes from the mouth to the stomach through the…', 'Oesophagus', ['Lungs', 'Heart', 'Kidneys'], 'Mouth → oesophagus (esófago) → stomach → intestines.'),
  p('🥖', 'Where are nutrients absorbed into the blood?', 'Small intestine', ['Mouth', 'Lungs', 'Bladder'], 'The small intestine (intestino delgado) passes nutrients to the blood.'),
  p('🫁', 'Which organs take in oxygen?', 'The lungs', ['The stomach', 'The kidneys', 'The liver'], 'Respiratory system: nose → trachea → bronchi → lungs.'),
  p('💨', 'When we breathe out, we expel…', 'Carbon dioxide', ['Oxygen', 'Water only', 'Food'], 'We breathe in oxygen and breathe out carbon dioxide (CO₂).'),
  p('❤️', 'Which organ pumps the blood around the body?', 'The heart', ['The lungs', 'The brain', 'The stomach'], 'The heart (corazón) is a muscle that pumps blood.'),
  p('🩸', 'Blood vessels that carry blood AWAY from the heart are…', 'Arteries', ['Veins', 'Nerves', 'Muscles'], 'Arteries (arterias) go out of the heart; veins (venas) come back.'),
  p('🫘', 'Which organs clean the blood and make urine?', 'The kidneys', ['The lungs', 'The heart', 'The intestines'], 'Excretory system: kidneys (riñones) → bladder (vejiga).'),
  p('🦷', 'Digestion starts in the…', 'Mouth', ['Stomach', 'Large intestine', 'Liver'], 'In the mouth we chew and saliva starts the digestion.'),
  p('🏃', 'Which four systems work in nutrition?', 'Digestive, respiratory, circulatory, excretory', ['Nervous, skeletal, muscular, senses', 'Only digestive', 'Eyes, ears, nose, skin'], 'Nutrition = digestivo + respiratorio + circulatorio + excretor.'),
  p('🌬️', 'The air goes into the lungs through the…', 'Trachea', ['Oesophagus', 'Artery', 'Bladder'], 'Trachea (tráquea) is the tube for air.'),
];

const RELACION: Pregunta[] = [
  p('👂', 'Which sense organ helps us keep our balance?', 'The ear', ['The nose', 'The tongue', 'The skin'], 'Inside the ear there is a part that controls balance (equilibrio).'),
  p('👅', 'We taste food with our…', 'Tongue', ['Nose', 'Eyes', 'Skin'], 'Taste (gusto) → tongue (lengua).'),
  p('🖐️', 'The largest sense organ is the…', 'Skin', ['Eye', 'Ear', 'Tongue'], 'The skin (piel) covers all the body: touch.'),
  p('🧠', 'Which organ controls the whole body?', 'The brain', ['The heart', 'The stomach', 'The lungs'], 'The brain (cerebro) is the boss of the nervous system.'),
  p('⚡', 'Messages travel between the brain and the body through…', 'Nerves', ['Bones', 'Veins', 'Muscles'], 'Nerves (nervios) carry the messages.'),
  p('🦴', 'Bones together form the…', 'Skeleton', ['Muscles', 'Brain', 'Skin'], 'The skeleton (esqueleto) supports and protects us.'),
  p('🦵', 'Where two bones meet there is a…', 'Joint', ['Muscle', 'Nerve', 'Tendon'], 'Joints (articulaciones) like the knee let us bend.'),
  p('💪', 'What moves the bones when they contract?', 'Muscles', ['Nerves', 'Joints', 'Skin'], 'Muscles pull the bones; that is how we kick a ball.'),
  p('💀', 'Which bone protects the brain?', 'The skull', ['The ribs', 'The femur', 'The spine'], 'The skull (cráneo) protects the brain; the ribs protect the heart and lungs.'),
  p('😴', 'Which is a healthy habit?', 'Sleeping 9-10 hours', ['Eating sweets every day', 'Never washing your hands', 'Watching screens all night'], 'Good sleep, good food, exercise and hygiene.'),
  p('🥦', 'A balanced diet has…', 'Lots of fruit and vegetables', ['Only meat', 'Only pasta', 'Lots of sweets'], 'Fruit and vegetables every day; sweets only sometimes.'),
];

/* ---------------------------------------------------------------------------
 * SOCIAL SCIENCE (en inglés)
 * ------------------------------------------------------------------------- */

const UNIVERSO: Pregunta[] = [
  p('☀️', 'The Sun is a…', 'Star', ['Planet', 'Moon', 'Comet'], 'The Sun is the star at the centre of our Solar System.'),
  p('🪐', 'How many planets are there in the Solar System?', '8', ['9', '7', '10'], 'Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.', { tipo: 'planetas' }),
  p('🔴', 'Which planet is called the Red Planet?', 'Mars', ['Venus', 'Jupiter', 'Saturn'], 'Mars (Marte) looks red.', { tipo: 'planetas' }),
  p('🟠', 'The biggest planet is…', 'Jupiter', ['Saturn', 'Earth', 'Neptune'], 'Jupiter is the giant of the Solar System.', { tipo: 'planetas' }),
  p('🌍', 'The Earth spinning on its axis is called…', 'Rotation', ['Revolution', 'Orbit', 'Eclipse'], 'Rotation takes 24 hours and makes day and night.'),
  p('🗓️', 'The Earth goes around the Sun in about…', '365 days', ['24 hours', '30 days', '7 days'], 'Revolution (traslación) takes one year and makes the seasons.'),
  p('🌙', 'The Moon is a ___ of the Earth.', 'Satellite', ['Star', 'Planet', 'Comet'], 'The Moon orbits the Earth: it is its natural satellite.'),
  p('🌌', 'Our galaxy is called…', 'The Milky Way', ['Andromeda', 'The Sun', 'Orion'], 'La Vía Láctea.'),
  p('☄️', 'A rock from space that falls on the Earth is a…', 'Meteorite', ['Planet', 'Star', 'Galaxy'], 'Meteorite (meteorito).'),
  p('🌗', 'The day and night happen because of…', "The Earth's rotation", ['The Moon', 'The seasons', 'The clouds'], 'When our side faces the Sun it is day.'),
  p('🧅', 'The layer of gases around the Earth is the…', 'Atmosphere', ['Hydrosphere', 'Core', 'Crust'], 'Atmosphere: air. Hydrosphere: water. Geosphere: rocks.'),
];

const MAPAS: Pregunta[] = [
  p('🧭', 'The four cardinal points are…', 'North, south, east, west', ['Up, down, left, right', 'Front, back, left, right', 'Sun, moon, star, sky'], 'Norte, sur, este, oeste.', { tipo: 'rosa' }),
  p('🌅', 'The Sun rises in the…', 'East', ['West', 'North', 'South'], 'The Sun rises in the east and sets in the west.', { tipo: 'rosa' }),
  p('🧭', 'A compass needle always points…', 'North', ['South', 'East', 'West'], 'The needle points to the north.', { tipo: 'rosa' }),
  p('🌐', 'A round model of the Earth is a…', 'Globe', ['Map', 'Plan', 'Compass'], 'Globo terráqueo.'),
  p('🗺️', 'The imaginary line that divides the Earth into North and South is the…', 'Equator', ['Greenwich Meridian', 'Tropic', 'Axis'], 'El Ecuador divide los hemisferios norte y sur.'),
  p('🟡', 'The Greenwich Meridian divides the Earth into…', 'East and West', ['North and South', 'Day and night', 'Land and sea'], 'El meridiano 0° (Greenwich, Londres) separa este y oeste.'),
  p('🔑', 'The box that explains the symbols of a map is the…', 'Key (legend)', ['Scale', 'Title', 'Compass'], 'La leyenda explica los símbolos.'),
  p('📏', 'What tells us how much smaller the map is than reality?', 'The scale', ['The key', 'The title', 'The colour'], 'La escala.'),
  p('🏠', 'A drawing of a small place, like your classroom, seen from above is a…', 'Plan', ['Globe', 'Atlas', 'Photo'], 'Plano: un sitio pequeño visto desde arriba.'),
  p('📚', 'A book of maps is an…', 'Atlas', ['Globe', 'Dictionary', 'Encyclopedia'], 'Atlas = libro de mapas.'),
];

const TIEMPO: Pregunta[] = [
  p('🌡️', 'We measure temperature with a…', 'Thermometer', ['Rain gauge', 'Weather vane', 'Barometer'], 'Termómetro.'),
  p('🌧️', 'We measure rain with a…', 'Rain gauge', ['Thermometer', 'Anemometer', 'Compass'], 'Pluviómetro.'),
  p('🌬️', 'A weather vane tells us…', 'The wind direction', ['The temperature', 'The rain', 'The time'], 'La veleta indica de dónde viene el viento.'),
  p('🌀', 'An anemometer measures…', 'Wind speed', ['Rain', 'Temperature', 'Humidity'], 'Anemómetro: velocidad del viento.'),
  p('☁️', 'Weather vs climate: climate is…', 'The usual weather of a place over many years', ['The weather today', 'Only the rain', 'The temperature at night'], 'Tiempo = hoy. Clima = lo habitual durante muchos años.'),
  p('💧', 'Water vapour rising and turning into clouds is called…', 'Condensation', ['Evaporation', 'Precipitation', 'Infiltration'], 'Evaporation → condensation → precipitation: el ciclo del agua.'),
  p('🌞', 'When water heats up and turns into vapour it is…', 'Evaporation', ['Condensation', 'Freezing', 'Precipitation'], 'Evaporación.'),
  p('🏔️', 'Snow, hail and rain are types of…', 'Precipitation', ['Evaporation', 'Wind', 'Clouds'], 'Precipitaciones.'),
];

const RELIEVE: Pregunta[] = [
  p('🏔️', 'The highest mountain in Spain is…', 'Teide', ['Mulhacén', 'Aneto', 'Everest'], 'El Teide (Tenerife), 3.715 m. En la península, el Mulhacén.'),
  p('🌊', 'The longest river in Spain is…', 'Tajo', ['Ebro', 'Duero', 'Guadalquivir'], 'El Tajo pasa por Madrid (Aranjuez), Toledo y Lisboa.'),
  p('🏞️', 'The big high flat land in the centre of Spain is the…', 'Meseta', ['Valley', 'Coast', 'Island'], 'La Meseta Central.'),
  p('⛰️', 'The mountain range north of Madrid is…', 'Sistema Central', ['Pirineos', 'Sierra Nevada', 'Cordillera Cantábrica'], 'El Sistema Central (Guadarrama, Gredos).'),
  p('🏝️', 'The Balearic Islands are in the…', 'Mediterranean Sea', ['Atlantic Ocean', 'Cantabrian Sea', 'Pacific Ocean'], 'Baleares: Mediterráneo. Canarias: Atlántico.'),
  p('🌊', 'Which river flows into the Mediterranean Sea?', 'Ebro', ['Tajo', 'Duero', 'Miño'], 'El Ebro desemboca en el Mediterráneo (delta del Ebro).'),
  p('🏞️', 'A piece of land surrounded by water is an…', 'Island', ['Peninsula', 'Cape', 'Gulf'], 'Isla. Una península está rodeada de agua menos por un lado.'),
  p('🗻', 'The mountains between Spain and France are the…', 'Pyrenees', ['Alps', 'Andes', 'Sistema Ibérico'], 'Los Pirineos.'),
  p('↘️', 'Where a river ends, in the sea, is called the…', 'Mouth', ['Source', 'Bed', 'Bank'], 'Mouth = desembocadura. Source = nacimiento.'),
];

/* ---------------------------------------------------------------------------
 * ENGLISH (Oxford Discover)
 * ------------------------------------------------------------------------- */

type Vocab = [string, string][];

/**
 * La imagen de cada palabra: las tarjetas de tres partes de Montessori
 * (imagen, palabra, significado). Ver la imagen antes que la traducción hace
 * que la palabra se ate a la cosa y no a otra palabra.
 */
const DIBUJO: Record<string, string> = {
  festival: '🎪', wedding: '💒', fair: '🎡', race: '🏁', team: '👥', winner: '🏆', score: '🔢', player: '⛹️',
  kick: '🦵', skip: '🪢', bounce: '🏀', lake: '🏞️', cliff: '🧗', stream: '💧',
  packing: '🧳', moving: '🚚', neighbors: '🏘️', 'ice skating': '⛸️', sledding: '🛷', country: '🌄', suburb: '🏡',
  'shopping mall': '🛍️', hospital: '🏥', factory: '🏭', 'rural area': '🐄', 'urban area': '🏙️',
  ladybug: '🐞', cricket: '🦗', beetle: '🪲', butterfly: '🦋', rhyme: '🎶', verb: '🏃', noun: '🍎', adjective: '🎨', syllable: '👏',
  moon: '🌙', asteroid: '🪨', comet: '☄️', meteorite: '🌠', 'solar system': '☀️', galaxy: '🌌', universe: '✨',
  spacecraft: '🚀', telescope: '🔭', astronomer: '👩‍🔬', gravity: '🍏', orbit: '🪐', surface: '🌑', crater: '🕳️',
  army: '🪖', soldier: '💂', emperor: '👑', armor: '🛡️', treasure: '💎', archaeologist: '⛏️', tomb: '⚱️', clay: '🏺',
  skull: '💀', excavate: '⛏️', layers: '🍰', paleontologist: '🦖',
  'sugar cane': '🎋', wheat: '🌾', cinnamon: '🪵', vanilla: '🍦', ingredients: '🥚', plantation: '🌱', spoil: '🤢',
  export: '🚢', local: '📍', "farmer's market": '🧺', agriculture: '🚜',
};

const vocabulario = (lista: Vocab) => (rand: Rand): Pregunta => {
  const elegidas = barajar(lista, rand).slice(0, 4);
  const [en, es] = elegidas[0];
  const visual: Visual | undefined = DIBUJO[en] ? { tipo: 'lamina', emoji: DIBUJO[en] } : undefined;
  if (rand() < 0.5) {
    return { icon: '🇬🇧', prompt: `What does «${en}» mean?`, ok: es, no: elegidas.slice(1).map(([, s]) => s), why: `${en} = ${es}. Say it aloud three times!`, visual };
  }
  return { icon: '🇬🇧', prompt: `How do you say «${es}» in English?`, ok: en, no: elegidas.slice(1).map(([e]) => e), why: `${es} = ${en}. Say it aloud three times!`, visual };
};

const FUN_V: Vocab = [['festival', 'fiesta, festival'], ['wedding', 'boda'], ['fair', 'feria'], ['race', 'carrera'], ['team', 'equipo'], ['winner', 'ganador'], ['score', 'marcador, puntuación'], ['player', 'jugador'], ['kick', 'dar una patada'], ['skip', 'saltar a la comba'], ['bounce', 'botar'], ['lake', 'lago'], ['cliff', 'acantilado'], ['stream', 'arroyo']];
const FUN_G: Pregunta[] = [
  p('📝', 'The film was very ___. I was ___.', 'boring / bored', ['bored / boring', 'boring / boring', 'bored / bored'], '-ing: how something is. -ed: how you feel.'),
  p('📝', 'I love ___ football.', 'playing', ['play', 'played', 'plays'], 'After love/like/enjoy we use the -ing form (gerund).'),
  p('📝', 'The match was ___! We all shouted.', 'exciting', ['excited', 'excite', 'excites'], 'The match is exciting; we are excited.'),
];
const MOVE_V: Vocab = [['packing', 'hacer las maletas'], ['moving', 'mudarse'], ['neighbors', 'vecinos'], ['ice skating', 'patinaje sobre hielo'], ['sledding', 'ir en trineo'], ['country', 'país / campo'], ['suburb', 'barrio de las afueras'], ['shopping mall', 'centro comercial'], ['hospital', 'hospital'], ['factory', 'fábrica'], ['rural area', 'zona rural'], ['urban area', 'zona urbana']];
const MOVE_G: Pregunta[] = [
  p('📝', 'When I was five, I ___ swim.', "couldn't", ["can't", "don't", "wasn't"], 'Could / couldn\'t = can in the past.'),
  p('📝', 'If it rains, we ___ at home.', 'stay', ['stayed', 'staying', 'will stayed'], 'Real conditional: If + present, present.'),
  p('📝', 'The opposite of «happy» with a prefix is…', 'unhappy', ['dishappy', 'nothappy', 'inhappy'], 'un- means "not": unhappy, unkind.'),
  p('📝', 'We moved to the city ___ my dad got a new job.', 'because', ['but', 'or', 'so'], 'because = porque.'),
];
const POEM_V: Vocab = [['ladybug', 'mariquita'], ['cricket', 'grillo'], ['beetle', 'escarabajo'], ['butterfly', 'mariposa'], ['rhyme', 'rima'], ['verb', 'verbo'], ['noun', 'sustantivo'], ['adjective', 'adjetivo'], ['syllable', 'sílaba']];
const POEM_G: Pregunta[] = [
  p('📝', 'I ___ reading when the phone rang.', 'was', ['were', 'am', 'did'], 'Past continuous: was/were + -ing.'),
  p('📝', 'They ___ playing football at 5 o\'clock.', 'were', ['was', 'are', 'did'], 'They → were.'),
  p('📝', 'Which word rhymes with «cat»?', 'hat', ['dog', 'cup', 'sun'], 'cat - hat: same ending sound.'),
  p('📝', 'In «a big red ball», «big» and «red» are…', 'adjectives', ['nouns', 'verbs', 'syllables'], 'Adjectives describe nouns.'),
];

const SPACE_V: Vocab = [['moon', 'luna'], ['asteroid', 'asteroide'], ['comet', 'cometa'], ['meteorite', 'meteorito'], ['solar system', 'sistema solar'], ['galaxy', 'galaxia'], ['universe', 'universo'], ['spacecraft', 'nave espacial'], ['telescope', 'telescopio'], ['astronomer', 'astrónomo'], ['gravity', 'gravedad'], ['orbit', 'órbita'], ['surface', 'superficie'], ['crater', 'cráter']];
const SPACE_G: Pregunta[] = [
  p('📝', 'In the future, people ___ live on Mars.', 'will', ['are', 'did', 'was'], 'Predictions: will + verb.'),
  p('📝', 'If you look through a telescope, you ___ see the craters.', 'will', ['would', 'did', 'were'], 'Future real conditional: If + present, will + verb.'),
  p('📝', 'Would you like to go to the Moon ___ to Mars?', 'or', ['and', 'but', 'so'], 'Choice questions use «or».'),
];
const PAST_V: Vocab = [['army', 'ejército'], ['soldier', 'soldado'], ['emperor', 'emperador'], ['armor', 'armadura'], ['treasure', 'tesoro'], ['archaeologist', 'arqueólogo'], ['tomb', 'tumba'], ['clay', 'arcilla'], ['skull', 'cráneo'], ['excavate', 'excavar'], ['layers', 'capas'], ['paleontologist', 'paleontólogo']];
const PAST_G: Pregunta[] = [
  p('📝', 'I want ___ an archaeologist.', 'to be', ['being', 'be', 'been'], 'want + to + verb (infinitive).'),
  p('📝', 'She enjoys ___ old coins.', 'collecting', ['to collect', 'collect', 'collected'], 'enjoy + -ing (gerund).'),
  p('📝', 'Which one is uncountable?', 'sand', ['bone', 'coin', 'skull'], 'You can\'t count sand: «some sand», not «three sands».'),
];
const FOOD_V: Vocab = [['sugar cane', 'caña de azúcar'], ['wheat', 'trigo'], ['cinnamon', 'canela'], ['vanilla', 'vainilla'], ['ingredients', 'ingredientes'], ['plantation', 'plantación'], ['spoil', 'estropearse'], ['export', 'exportar'], ['local', 'local, de aquí'], ['farmer\'s market', 'mercado de agricultores'], ['agriculture', 'agricultura']];
const FOOD_G: Pregunta[] = [
  p('📝', 'Tomorrow we ___ visiting the farm. (a plan)', 'are', ['were', 'did', 'has'], 'Present continuous for future plans: We are visiting…'),
  p('📝', '«___ you like some cake?» — «Yes, please!»', 'Would', ['Do', 'Will', 'Are'], 'Polite offers: Would you like…?'),
  p('📝', 'The milk is ___ the fridge.', 'in', ['on', 'at', 'under'], 'Prepositions of place: in, on, under, next to, between.'),
];

/* ---------------------------------------------------------------------------
 * El calendario: qué tema toca cada semana
 * ------------------------------------------------------------------------- */

const CM3 = 'Matemáticas 3 · Construyendo Mundos (Santillana)';
const CM4 = 'Matemáticas 4 · Construyendo Mundos (Santillana)';
const OD3 = 'Oxford Discover 3';
const OD4 = 'Oxford Discover 4';
const CURR = 'Currículo de la Comunidad de Madrid, 2.º ciclo';

export const TEMARIO: Tema[] = [
  /* ------------------------------------------------ Mates 3º */
  { id: 'm3-1', asignatura: 'mates', curso: 3, desde: '2026-09-07', titulo: 'U1 · Números de cuatro cifras', fuente: CM3, puntos: ['Leer y escribir hasta 9.999', 'UM, C, D y U', 'Comparar y ordenar', 'Ordinales'], hacer: [leerNumero(1000, 9999), valorCifra(10000), mayor(1000, 9999), ordinal] },
  { id: 'm3-2', asignatura: 'mates', curso: 3, desde: '2026-10-01', titulo: 'U2 · Sumas y restas', fuente: CM3, puntos: ['Sumas y restas llevando', 'Aproximar a las centenas', 'Estimar', 'Problemas de dos operaciones'], hacer: [sumaLlevando(4), restaLlevando(4), aproximar(100, 120, 9800), estimarSuma, problemaDos, restaHueco] },
  { id: 'm3-3', asignatura: 'mates', curso: 3, desde: '2026-10-26', titulo: 'U3 · Rectas y ángulos', fuente: CM3, puntos: ['Paralelas, secantes y perpendiculares', 'Semirrecta y segmento', 'Ángulos recto, agudo y obtuso', 'Simetría'], hacer: [delBanco(RECTAS), delBanco(RECTAS), anguloGrados] },
  { id: 'm3-4', asignatura: 'mates', curso: 3, desde: '2026-11-19', titulo: 'U4 · La multiplicación', fuente: CM3, puntos: ['Suma repetida', 'Tablas', 'Doble y triple', 'Multiplicar por una cifra', 'Problemas'], hacer: [tabla, dobleTriple, porUnaCifra(99), problemaMulti] },

  /* ------------------------------------------------ Mates 4º */
  { id: 'm4-1', asignatura: 'mates', curso: 4, desde: '2026-09-07', titulo: 'U1 · Números de cinco cifras', fuente: CM4, puntos: ['Leer y descomponer hasta 99.999', 'Aproximar a decenas y centenas', 'Ordinales', 'Números romanos'], hacer: [leerNumero(10000, 99999), valorCifra(100000), aproximar(10, 1000, 99999), aproximar(100, 1000, 99999), romanos] },
  { id: 'm4-2', asignatura: 'mates', curso: 4, desde: '2026-10-01', titulo: 'U2 · Sumas y restas', fuente: CM4, puntos: ['Propiedad conmutativa y asociativa', 'Operaciones combinadas', 'Estimaciones', 'Problemas'], hacer: [sumaLlevando(5), restaLlevando(5), propiedades, combinadas, estimarSuma, problemaDos] },
  { id: 'm4-3', asignatura: 'mates', curso: 4, desde: '2026-10-26', titulo: 'U3 · La multiplicación', fuente: CM4, puntos: ['Por una y dos cifras', 'Factores acabados en ceros', 'Propiedades', 'Estimar productos'], hacer: [porUnaCifra(9999), porDosCifras, porCeros, estimarProducto, propiedades, problemaMulti] },
  { id: 'm4-4', asignatura: 'mates', curso: 4, desde: '2026-11-19', titulo: 'U4 · Ángulos y polígonos', fuente: CM4, puntos: ['Medir ángulos', 'Polígonos regulares', 'Perímetro', 'Área con cuadraditos', 'Triángulos y cuadriláteros'], hacer: [anguloGrados, poligono, perimetro, area, delBanco(TRIANGULOS)] },

  /* ------------------------------------------------ Lengua (3º y 4º) */
  ...([3, 4] as Curso[]).flatMap((curso): Tema[] => [
    { id: `l${curso}-1`, asignatura: 'lengua', curso, desde: '2026-09-07', titulo: 'El diccionario y las sílabas', fuente: CURR, puntos: ['Orden alfabético', 'Buscar en el diccionario', 'Contar sílabas'], hacer: [ordenAlfabetico, ordenAlfabetico, contarSilabas] },
    { id: `l${curso}-2`, asignatura: 'lengua', curso, desde: '2026-10-05', titulo: curso === 3 ? 'Sílaba tónica: agudas, llanas y esdrújulas' : 'Agudas, llanas, esdrújulas y la tilde', fuente: CURR, puntos: curso === 3 ? ['Sílaba tónica y átona', 'Agudas, llanas y esdrújulas'] : ['Sílaba tónica', 'Agudas, llanas y esdrújulas', 'Reglas de la tilde'], hacer: curso === 3 ? [silabaTonica, agudaLlana, agudaLlana] : [silabaTonica, agudaLlana, tilde, tilde] },
    { id: `l${curso}-3`, asignatura: 'lengua', curso, desde: '2026-11-02', titulo: 'El nombre y el adjetivo', fuente: CURR, puntos: ['Nombres comunes y propios', 'Género y número', 'El adjetivo', 'Concordancia'], hacer: [nombreAdjetivo, concordancia, generoNumero, delBanco(COMUN_PROPIO)] },
    { id: `l${curso}-4`, asignatura: 'lengua', curso, desde: '2026-11-30', titulo: 'Ortografía', fuente: 'Cuadernillo de Ortografía (Anaya)', puntos: ['c / qu', 'g / gu / gü', 'r / rr', 'm antes de p y b', 'Mayúsculas'], hacer: [hueco, hueco, hueco, delBanco(MAYUSCULAS)] },
  ]),

  /* ------------------------------------------------ Natural Science */
  ...([3, 4] as Curso[]).flatMap((curso): Tema[] => [
    { id: `n${curso}-1`, asignatura: 'science', curso, desde: '2026-09-07', titulo: 'Living things & the human body', fuente: CURR, puntos: ['Cells, tissues, organs, systems', 'Life functions', 'Scientific method'], hacer: [delBanco(VIDA)] },
    { id: `n${curso}-2`, asignatura: 'science', curso, desde: '2026-10-19', titulo: 'Nutrition', fuente: CURR, puntos: ['Digestive system', 'Respiratory system', 'Circulatory system', 'Excretory system'], hacer: [delBanco(NUTRICION)] },
    { id: `n${curso}-3`, asignatura: 'science', curso, desde: '2026-11-23', titulo: 'Interaction & healthy habits', fuente: CURR, puntos: ['The senses', 'Skeleton & muscles', 'Nervous system', 'Healthy habits'], hacer: [delBanco(RELACION)] },
  ]),

  /* ------------------------------------------------ Social Science */
  ...([3, 4] as Curso[]).flatMap((curso): Tema[] => [
    { id: `s${curso}-1`, asignatura: 'social', curso, desde: '2026-09-07', titulo: 'The Universe & the Earth', fuente: CURR, puntos: ['The Solar System', 'Rotation and revolution', 'The Moon', 'Layers of the Earth'], hacer: [delBanco(UNIVERSO)] },
    { id: `s${curso}-2`, asignatura: 'social', curso, desde: '2026-10-19', titulo: 'Maps & orientation', fuente: CURR, puntos: ['Cardinal points', 'Globe, maps and plans', 'Equator and Greenwich Meridian', 'Key and scale'], hacer: [delBanco(MAPAS)] },
    curso === 3
      ? { id: 's3-3', asignatura: 'social', curso, desde: '2026-11-23', titulo: 'Weather & climate', fuente: CURR, puntos: ['Weather instruments', 'Weather vs climate', 'The water cycle'], hacer: [delBanco(TIEMPO)] }
      : { id: 's4-3', asignatura: 'social', curso, desde: '2026-11-23', titulo: 'Landscapes of Spain', fuente: CURR, puntos: ['Mountains and the Meseta', 'Rivers and seas', 'Islands'], hacer: [delBanco(RELIEVE)] },
  ]),

  /* ------------------------------------------------ English */
  { id: 'e3-1', asignatura: 'english', curso: 3, desde: '2026-09-07', titulo: 'U1-2 · How do people have fun?', fuente: OD3, puntos: ['Festivals, games and sports', '-ed / -ing adjectives', 'Gerunds'], hacer: [vocabulario(FUN_V), vocabulario(FUN_V), delBanco(FUN_G)] },
  { id: 'e3-2', asignatura: 'english', curso: 3, desde: '2026-10-19', titulo: 'U3-4 · Why do people move to new places?', fuente: OD3, puntos: ['Moving, city and country', 'can / could', 'If… / because', 'Prefix un-'], hacer: [vocabulario(MOVE_V), vocabulario(MOVE_V), delBanco(MOVE_G)] },
  { id: 'e3-3', asignatura: 'english', curso: 3, desde: '2026-11-23', titulo: 'U5-6 · Why do people write poems?', fuente: OD3, puntos: ['Insects', 'Rhymes, nouns, verbs, adjectives', 'Past continuous'], hacer: [vocabulario(POEM_V), vocabulario(POEM_V), delBanco(POEM_G)] },
  { id: 'e4-1', asignatura: 'english', curso: 4, desde: '2026-09-07', titulo: 'U1-2 · Where are we in the universe?', fuente: OD4, puntos: ['Space vocabulary', 'will for predictions', 'Future real conditional'], hacer: [vocabulario(SPACE_V), vocabulario(SPACE_V), delBanco(SPACE_G)] },
  { id: 'e4-2', asignatura: 'english', curso: 4, desde: '2026-10-19', titulo: 'U3-4 · How do we know what happened long ago?', fuente: OD4, puntos: ['Archaeology and fossils', 'Verb + infinitive / gerund', 'Countable / uncountable'], hacer: [vocabulario(PAST_V), vocabulario(PAST_V), delBanco(PAST_G)] },
  { id: 'e4-3', asignatura: 'english', curso: 4, desde: '2026-11-23', titulo: 'U5-6 · Where does our food come from?', fuente: OD4, puntos: ['Food and farming', 'Present continuous for plans', 'Would you like…?', 'Prepositions of place'], hacer: [vocabulario(FOOD_V), vocabulario(FOOD_V), delBanco(FOOD_G)] },
];

/**
 * La presentación de cada tema: la idea en una frase y con qué material se
 * ve, como cuando la guía presenta un material antes de dejarlo en la
 * estantería. Se enseña antes del reto.
 */
export const IDEA: Record<string, { texto: string; visual?: Visual }> = {
  'm3-1': { texto: 'Cada cifra vale según dónde está: la de la izquierda del todo son millares, como cubos de mil perlas.', visual: { tipo: 'perlas', n: 2345 } },
  'm3-2': { texto: 'Se suma y se resta por columnas, de las unidades hacia la izquierda. Si una columna pasa de 9, diez unidades se cambian por una decena.', visual: { tipo: 'columnas', a: 1468, b: 2357, op: '+', resultado: 3825 } },
  'm3-3': { texto: 'Un ángulo recto es una esquina, como la de un folio. Más cerrado es agudo; más abierto, obtuso.', visual: { tipo: 'angulo', grados: 90 } },
  'm3-4': { texto: 'Multiplicar es sumar el mismo número muchas veces: 4 filas de 6 cuentas son 4 × 6 = 24.', visual: { tipo: 'matriz', filas: 4, columnas: 6 } },
  'm4-1': { texto: 'Con cinco cifras aparecen las decenas de millar: diez cubos de mil. Y los romanos escribían con letras: I, V, X, L, C, D, M.', visual: { tipo: 'perlas', n: 23405 } },
  'm4-2': { texto: 'Da igual el orden de los sumandos (conmutativa) y cómo los agrupes (asociativa): el resultado no cambia.', visual: { tipo: 'columnas', a: 12458, b: 31377, op: '+', resultado: 43835 } },
  'm4-3': { texto: 'Para multiplicar por 20, 300 o 4.000: multiplica sin los ceros y añádelos al final.', visual: { tipo: 'columnas', a: 34, b: 200, op: '×', resultado: 6800 } },
  'm4-4': { texto: 'Perímetro: el borde, sumando lados. Área: lo de dentro, contando cuadraditos.', visual: { tipo: 'rect', a: 5, b: 3, ver: 'area' } },
  'l3-1': { texto: 'El diccionario va en orden alfabético. Si dos palabras empiezan igual, manda la segunda letra.', visual: { tipo: 'letras', palabras: ['casa', 'cama', 'campo'], orden: true } },
  'l4-1': { texto: 'El diccionario va en orden alfabético. Si dos palabras empiezan igual, manda la segunda letra.', visual: { tipo: 'letras', palabras: ['casa', 'cama', 'campo'], orden: true } },
  'l3-2': { texto: 'Cada palabra tiene una sílaba que suena más fuerte: la tónica. Si es la última, aguda; la penúltima, llana; la antepenúltima, esdrújula.', visual: { tipo: 'silabas', silabas: ['ma', 'ri', 'po', 'sa'], tonica: 2 } },
  'l4-2': { texto: 'Agudas con tilde si acaban en vocal, n o s (camión). Llanas con tilde si NO (lápiz). Esdrújulas, siempre (música).', visual: { tipo: 'silabas', silabas: ['mú', 'si', 'ca'], tonica: 0 } },
  'l3-3': { texto: 'El nombre dice quién (▲ negro), el adjetivo cómo es (▲ azul) y el verbo qué hace (● rojo).', visual: { tipo: 'gramatica', palabras: [{ p: 'el', clase: 'articulo' }, { p: 'tigre', clase: 'nombre' }, { p: 'rápido', clase: 'adjetivo' }, { p: 'corre', clase: 'verbo' }] } },
  'l4-3': { texto: 'El nombre dice quién (▲ negro), el adjetivo cómo es (▲ azul) y el verbo qué hace (● rojo). Nombre y adjetivo van siempre a juego.', visual: { tipo: 'gramatica', palabras: [{ p: 'las', clase: 'articulo' }, { p: 'botas', clase: 'nombre' }, { p: 'negras', clase: 'adjetivo' }, { p: 'brillan', clase: 'verbo' }] } },
  'l3-4': { texto: 'Antes de p y b, siempre m. Entre vocales, el sonido fuerte es rr. Con diéresis (gü) la u suena.', visual: { tipo: 'letras', palabras: ['campo', 'perro', 'pingüino'] } },
  'l4-4': { texto: 'Antes de p y b, siempre m. Entre vocales, el sonido fuerte es rr. Con diéresis (gü) la u suena.', visual: { tipo: 'letras', palabras: ['campo', 'perro', 'pingüino'] } },
  'n3-1': { texto: 'Cells make tissues, tissues make organs, organs make systems. Every living thing does three things: nutrition, interaction, reproduction.', visual: { tipo: 'lamina', emoji: '🦠', rotulo: 'cell → tissue → organ → system' } },
  'n4-1': { texto: 'Cells make tissues, tissues make organs, organs make systems. Every living thing does three things: nutrition, interaction, reproduction.', visual: { tipo: 'lamina', emoji: '🦠', rotulo: 'cell → tissue → organ → system' } },
  'n3-2': { texto: 'Four systems work together to feed you: digestive, respiratory, circulatory and excretory.', visual: { tipo: 'lamina', emoji: '🫁', rotulo: 'food + air → blood → whole body' } },
  'n4-2': { texto: 'Four systems work together to feed you: digestive, respiratory, circulatory and excretory.', visual: { tipo: 'lamina', emoji: '🫁', rotulo: 'food + air → blood → whole body' } },
  'n3-3': { texto: 'Senses notice, nerves carry the message, the brain decides, muscles move the bones.', visual: { tipo: 'lamina', emoji: '🧠', rotulo: 'senses → nerves → brain → muscles' } },
  'n4-3': { texto: 'Senses notice, nerves carry the message, the brain decides, muscles move the bones.', visual: { tipo: 'lamina', emoji: '🧠', rotulo: 'senses → nerves → brain → muscles' } },
  's3-1': { texto: 'The Earth spins (rotation: day and night) and travels around the Sun (revolution: one year).', visual: { tipo: 'planetas' } },
  's4-1': { texto: 'The Earth spins (rotation: day and night) and travels around the Sun (revolution: one year).', visual: { tipo: 'planetas' } },
  's3-2': { texto: 'North, south, east, west. The Sun rises in the east. The Equator splits north and south; the Greenwich Meridian, east and west.', visual: { tipo: 'rosa' } },
  's4-2': { texto: 'North, south, east, west. The Sun rises in the east. The Equator splits north and south; the Greenwich Meridian, east and west.', visual: { tipo: 'rosa' } },
  's3-3': { texto: 'Weather is today; climate is what usually happens over many years.', visual: { tipo: 'lamina', emoji: '🌦️', rotulo: 'thermometer · rain gauge · weather vane' } },
  's4-3': { texto: 'Spain has a big high plain in the middle (the Meseta), mountains around it and rivers that run to the sea.', visual: { tipo: 'lamina', emoji: '🏔️', rotulo: 'Meseta · Sistema Central · Tajo · Ebro' } },
  'e3-1': { texto: 'An -ing adjective says how a thing is (boring); an -ed adjective says how you feel (bored).', visual: { tipo: 'lamina', emoji: '🎡', rotulo: 'It was exciting! I was excited!' } },
  'e3-2': { texto: '«Could» is «can» in the past: When I was five, I could swim.', visual: { tipo: 'lamina', emoji: '🚚', rotulo: 'city · suburb · country' } },
  'e3-3': { texto: 'Past continuous: I was reading when the phone rang.', visual: { tipo: 'lamina', emoji: '🦋', rotulo: 'noun · verb · adjective · rhyme' } },
  'e4-1': { texto: 'Predictions with «will»: One day people will live on Mars.', visual: { tipo: 'planetas' } },
  'e4-2': { texto: 'want + to (I want to dig) · enjoy + -ing (I enjoy digging).', visual: { tipo: 'lamina', emoji: '🦖', rotulo: 'archaeologist · fossil · layers' } },
  'e4-3': { texto: 'Plans with present continuous: We are visiting the farm tomorrow.', visual: { tipo: 'lamina', emoji: '🌾', rotulo: 'wheat · farmer\'s market · export' } },
};

/** El tema que se está dando ese día: el último que ya ha empezado. */
export function temaDe(asignatura: Asignatura, curso: Curso, date: DateKey): Tema {
  const lista = TEMARIO.filter((t) => t.asignatura === asignatura && t.curso === curso).sort((a, b) => a.desde.localeCompare(b.desde));
  return [...lista].reverse().find((t) => t.desde <= date) ?? lista[0];
}

/** Todos los temas ya empezados de una asignatura, para el repaso del finde. */
export function temasHasta(asignatura: Asignatura, curso: Curso, date: DateKey): Tema[] {
  const lista = TEMARIO.filter((t) => t.asignatura === asignatura && t.curso === curso && t.desde <= date);
  return lista.length ? lista : [temaDe(asignatura, curso, date)];
}
