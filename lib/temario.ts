import type { DateKey, Visual } from '@/types';

/* =========================================================================
 *  El temario del primer trimestre, para los retos del cole.
 *
 *  Sale de los libros del curso 26-27, con el corte de trimestre que marca
 *  cada índice:
 *
 *   - **Matemáticas 4**: Santillana, *Construyendo Mundos* 4 (verificado en
 *     la lista del curso). Se supone el corte de 4 unidades por trimestre.
 *   - **Matemáticas 3**: Anaya, *Operación Mundo* 3: U1-4 hasta el «Repaso
 *     trimestre 1».
 *   - **Lengua 3 y 4**: Anaya, *Operación Mundo*: U1-4.
 *   - **Natural y Social Science 3 y 4**: Anaya, *Global Thinkers* (la serie
 *     en inglés de Anaya): U1-2 hasta el «Term review».
 *   - **English**: *Oxford Discover* 3 y 4, dos unidades por «Big Question»;
 *     en el primer trimestre caen las tres primeras preguntas (U1-6).
 *
 *  Lo de Anaya es lo que se supone que usan donde no hay lista publicada:
 *  los índices son los de las muestras oficiales, pero que el cole use estos
 *  libros y no otros está por confirmar (mirar la portada del libro).
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
  'me-lo-co-TÓN', 'a-de-MÁS', 'ja-ba-LÍ', 'co-li-BRÍ', 'ca-ra-COL', 'a-je-DREZ', 'te-le-vi-SIÓN', 'CRÁ-ter', 'TÚ-nel', 'LÍ-der', 'HÁ-bil', 'au-to-MÓ-vil', 'NÉC-tar',
  'cien-TÍ-fi-ca', 'fan-TÁS-ti-co', 're-LÁM-pa-go', 'se-MÁ-fo-ro', 'es-TÓ-ma-go', 'MÚ-si-ca', 'PÁ-ja-ro', 'LÁM-pa-ra', 'MÉ-di-co', 'CÁ-ma-ra', 'SÁ-ba-do', 'NÚ-me-ro', 'PLÁ-ta-no', 'te-LÉ-fo-no', 'MÁ-gi-co', 'BRÚ-ju-la', 'pi-RÁ-mi-de',
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

const nombreAdjetivo = (fijo?: 'nombre' | 'adjetivo' | 'verbo') => (rand: Rand): Pregunta => {
  const [art, nombre, adj, verbo] = uno(rand, FRASES);
  const frase = `${art[0].toUpperCase()}${art.slice(1)} ${nombre} ${adj} ${verbo}.`;
  const pide = fijo ?? uno(rand, ['nombre', 'adjetivo', 'verbo'] as const);
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

/* ---- Lengua · Operación Mundo (Anaya) ---- */

const LETRA_ORACION: Pregunta[] = [
  p('🔤', '¿Cuántas letras tiene «balón»?', '5', ['4', '6', '2'], 'b - a - l - ó - n: cinco letras.', { tipo: 'letras', palabras: ['balón'] }),
  p('🔤', '¿Cuántas letras tiene «portero»?', '7', ['6', '8', '3'], 'p - o - r - t - e - r - o: siete letras.', { tipo: 'letras', palabras: ['portero'] }),
  p('💬', '¿Cuál es una ORACIÓN?', 'Benji para el balón.', ['para el balón', 'Benji balón', 'el portero'], 'Una oración tiene sentido completo y un verbo. Empieza con mayúscula y acaba en punto.'),
  p('💬', '¿Cuál es una ORACIÓN?', 'Mi hermano juega al fútbol.', ['mi hermano', 'al fútbol juega mi', 'jugar fútbol'], 'Tiene sentido completo y un verbo (juega).'),
  p('🧩', 'Las letras forman sílabas, y las sílabas forman…', 'Palabras', ['Letras', 'Números', 'Puntos'], 'Letra → sílaba → palabra → oración.'),
  p('🔤', '¿Cuántas palabras tiene «El gato duerme mucho»?', '4', ['3', '5', '6'], 'El / gato / duerme / mucho: cuatro palabras.'),
  p('📖', '¿Cuántas letras tiene el abecedario español?', '27', ['26', '25', '30'], 'Son 27, contando la ñ.'),
  p('🔤', '¿Cuál de estas letras es una VOCAL?', 'e', ['m', 't', 'r'], 'Las vocales son a, e, i, o, u; las demás son consonantes.'),
];

const SIGLAS: Pregunta[] = [
  p('🪪', '¿Qué es una sigla?', 'Una palabra hecha con las primeras letras de otras', ['Una palabra muy larga', 'Un tipo de punto', 'Un nombre de persona'], 'DNI = Documento Nacional de Identidad: cada letra es el principio de una palabra.'),
  p('🪪', '¿Qué significa DNI?', 'Documento Nacional de Identidad', ['Día Nacional Infantil', 'Dibujo Nuevo Inventado', 'Dirección Norte Izquierda'], 'D-N-I: Documento Nacional de Identidad.'),
  p('🇪🇺', '¿Qué significa UE?', 'Unión Europea', ['Universidad Española', 'Uno y Español', 'Unidad Escolar'], 'La Unión Europea: España es uno de sus países.'),
  p('🌍', '¿Qué significa ONU?', 'Organización de las Naciones Unidas', ['Oficina de Niños Unidos', 'Orden de los Números Usados', 'Olimpiada Nacional Universal'], 'La ONU reúne a casi todos los países del mundo.'),
  p('🔠', 'Las siglas se escriben…', 'En mayúsculas', ['En minúsculas', 'Con tilde', 'Al revés'], 'DNI, ONU, UE: en mayúsculas y sin puntos.'),
];

const POLISEMICAS: [string, string, string][] = [
  ['banco', 'sentarse en el parque', 'guardar el dinero'],
  ['hoja', 'un árbol', 'un cuaderno'],
  ['ratón', 'un animal', 'el ordenador'],
  ['sierra', 'cortar madera', 'muchas montañas juntas'],
  ['planta', 'un vegetal', 'un piso de un edificio'],
  ['cola', 'un perro', 'una fila para esperar'],
];

const polisemica = (rand: Rand): Pregunta => {
  const [w, a, b] = uno(rand, POLISEMICAS);
  return {
    icon: '🔀',
    prompt: `¿Qué palabra sirve para «${a}» y también para «${b}»?`,
    ok: w,
    no: barajar(POLISEMICAS.filter(([x]) => x !== w), rand).slice(0, 3).map(([x]) => x),
    why: `«${w}» es polisémica: una palabra con varios significados. Se sabe cuál es por la frase.`,
  };
};

const COMA_DOSPUNTOS: Pregunta[] = [
  p('✍️', '¿Cuál tiene bien las comas?', 'Compré peras, manzanas y uvas.', ['Compré, peras manzanas, y uvas.', 'Compré peras manzanas, y, uvas.', 'Compré peras manzanas y uvas,'], 'La coma separa las cosas de una lista; delante de «y» no se pone.'),
  p('✍️', 'En una carta, después de «Querida abuela» va…', 'Dos puntos (:)', ['Coma', 'Punto y coma', 'Nada'], 'Después del saludo de una carta van dos puntos.'),
  p('✍️', '«Tengo tres mascotas___ un perro, un gato y un pez.» ¿Qué va en el hueco?', 'Dos puntos (:)', ['Coma', 'Punto', 'Interrogación'], 'Antes de enumerar, dos puntos.'),
  p('✍️', '«Leo, ven aquí.» ¿Para qué sirve esa coma?', 'Para separar el nombre de a quien se habla', ['Para acabar la frase', 'Para hacer una pregunta', 'Para nada'], 'Cuando se llama a alguien por su nombre, se separa con coma.'),
];

const SIGNOS: Pregunta[] = [
  p('❓', '¿Cuál está bien escrita?', '¿Vienes al partido?', ['Vienes al partido?', '¿Vienes al partido¿', '?Vienes al partido?'], 'En español la pregunta se abre (¿) y se cierra (?).'),
  p('❗', '¿Cuál está bien escrita?', '¡Qué golazo!', ['Qué golazo!', '¡Qué golazo¡', '!Qué golazo!'], 'La exclamación se abre (¡) y se cierra (!).'),
  p('❗', '«¡Qué golazo!» es una oración…', 'Exclamativa', ['Interrogativa', 'Enunciativa', 'Sin sentido'], 'Expresa emoción: exclamativa, entre ¡!'),
  p('❓', '«¿Dónde está Benji?» es una oración…', 'Interrogativa', ['Exclamativa', 'Enunciativa', 'Sin sentido'], 'Pregunta algo: interrogativa, entre ¿?'),
];

const DIM_AUM: [string, string, string][] = [
  ['casa', 'casita', 'casona'], ['perro', 'perrito', 'perrazo'], ['coche', 'cochecito', 'cochazo'], ['libro', 'librito', 'librote'],
  ['gato', 'gatito', 'gatazo'], ['balón', 'baloncito', 'balonazo'], ['mesa', 'mesita', 'mesota'], ['zapato', 'zapatito', 'zapatón'],
];

const dimAum = (rand: Rand): Pregunta => {
  const [base, dim, aum] = uno(rand, DIM_AUM);
  if (rand() < 0.5) {
    return { icon: '🔍', prompt: `¿Cuál es el DIMINUTIVO de «${base}»?`, ok: dim, no: [aum, base, `${base}s`], why: `Diminutivo = más pequeño, con -ito, -ita, -ico: ${dim}.` };
  }
  const w = rand() < 0.5 ? dim : aum;
  const ok = w === dim ? 'Diminutivo' : 'Aumentativo';
  return { icon: '🔍', prompt: `«${w}» es un…`, ok, no: ['Diminutivo', 'Aumentativo', 'Palabra compuesta'].filter((x) => x !== ok), why: `${w} viene de ${base}: ${ok === 'Diminutivo' ? 'más pequeño (-ito, -ita)' : 'más grande (-azo, -ón, -ote)'}.` };
};

const COMPUESTAS: [string, string][] = [
  ['sacapuntas', 'saca + puntas'], ['paraguas', 'para + aguas'], ['abrelatas', 'abre + latas'], ['girasol', 'gira + sol'],
  ['cumpleaños', 'cumple + años'], ['rompecabezas', 'rompe + cabezas'], ['sacacorchos', 'saca + corchos'], ['limpiabotas', 'limpia + botas'],
  ['cascanueces', 'casca + nueces'], ['guardacostas', 'guarda + costas'], ['telaraña', 'tela + araña'], ['videojuego', 'video + juego'], ['balompié', 'balón + pie'], ['mediodía', 'medio + día'], ['pasatiempo', 'pasa + tiempo'], ['cortaúñas', 'corta + uñas'],
];
const SIMPLES = ['pelota', 'panadero', 'mesita', 'florero', 'ventana', 'zapatería', 'portero', 'librito'];

const compuesta = (rand: Rand): Pregunta => {
  const [w, partes] = uno(rand, COMPUESTAS);
  return { icon: '🧩', prompt: '¿Cuál es una palabra COMPUESTA?', ok: w, no: barajar(SIMPLES, rand).slice(0, 3), why: `${w} = ${partes}: dos palabras juntas forman una nueva.` };
};

const DERIVADAS: [string, string, string[]][] = [
  ['flor', 'florero', ['flaco', 'flan', 'flota']], ['pan', 'panadería', ['pantalón', 'pantera', 'panda']], ['libro', 'librería', ['libre', 'litro', 'liebre']],
  ['mar', 'marinero', ['marco', 'martes', 'mármol']], ['papel', 'papelera', ['papilla', 'papaya', 'papá']], ['pelo', 'peluquería', ['pelota', 'película', 'pelear']],
  ['jardín', 'jardinero', ['jarra', 'jarabe', 'jamón']], ['zapato', 'zapatería', ['zanahoria', 'zarza', 'zafiro']], ['leche', 'lechero', ['lechuga', 'letra', 'lento']],
  ['fruta', 'frutería', ['frente', 'fresa', 'frío']],
];

const derivada = (rand: Rand): Pregunta => {
  const [base, d, otras] = uno(rand, DERIVADAS);
  return { icon: '🌱', prompt: `¿Qué palabra DERIVA de «${base}»?`, ok: d, no: otras, why: `${d} nace de ${base} añadiéndole un trozo. Las demás se parecen, pero no tienen que ver con «${base}».` };
};

const FAMILIAS: [string, string[], string][] = [
  ['mar', ['marinero', 'marino', 'submarino'], 'martillo'], ['pan', ['panadero', 'panecillo', 'empanada'], 'pantalla'],
  ['flor', ['florero', 'floristería', 'florecer'], 'flotar'], ['libro', ['librería', 'librero', 'librito'], 'libre'],
  ['zapato', ['zapatero', 'zapatilla', 'zapatería'], 'zarpa'], ['tierra', ['terreno', 'terrestre', 'enterrar'], 'tienda'],
  ['casa', ['casita', 'caserío', 'casero'], 'cascada'],
];

const familia = (rand: Rand): Pregunta => {
  const [base, fam, intruso] = uno(rand, FAMILIAS);
  return { icon: '👨‍👩‍👧', prompt: `¿Cuál NO es de la familia de «${base}»?`, ok: intruso, no: fam, why: `«${intruso}» se parece, pero no viene de «${base}». La familia: ${fam.join(', ')}.` };
};

const SINONIMOS: [string, string][] = [
  ['contento', 'alegre'], ['rápido', 'veloz'], ['bonito', 'precioso'], ['empezar', 'comenzar'], ['miedo', 'temor'],
  ['cara', 'rostro'], ['enfadado', 'enojado'], ['listo', 'inteligente'], ['grande', 'enorme'], ['hablar', 'charlar'],
];

const sinonimo = (rand: Rand): Pregunta => {
  const [a, b] = uno(rand, SINONIMOS);
  return { icon: '🤝', prompt: `¿Cuál es un SINÓNIMO de «${a}»?`, ok: b, no: barajar(SINONIMOS.filter(([x]) => x !== a), rand).slice(0, 3).map(([, y]) => y), why: `Sinónimos: palabras que significan casi lo mismo. ${a} = ${b}.` };
};

const CLASES_NOMBRE: Pregunta[] = [
  p('🐑', '«rebaño» es un nombre…', 'Colectivo', ['Individual', 'Propio', 'Abstracto'], 'Colectivo: en singular nombra a muchos (muchas ovejas).'),
  p('🐝', '«enjambre» es un nombre…', 'Colectivo', ['Individual', 'Propio', 'Abstracto'], 'Un enjambre son muchas abejas.'),
  p('😊', '«alegría» es un nombre…', 'Abstracto', ['Concreto', 'Colectivo', 'Propio'], 'No se puede ver ni tocar: abstracto.'),
  p('🤝', '«amistad» es un nombre…', 'Abstracto', ['Concreto', 'Colectivo', 'Propio'], 'Se siente, pero no se toca: abstracto.'),
  p('🪑', '«mesa» es un nombre…', 'Concreto', ['Abstracto', 'Colectivo', 'Propio'], 'Se ve y se toca: concreto.'),
  p('🏔️', '«Teide» es un nombre…', 'Propio', ['Común', 'Colectivo', 'Abstracto'], 'Nombra una montaña en concreto: propio, con mayúscula.'),
  p('🌳', '¿Cuál es el colectivo de «árbol»?', 'bosque', ['hoja', 'rama', 'arbusto'], 'Muchos árboles juntos: un bosque.'),
  p('⚽', '¿Cuál es el colectivo de «jugador»?', 'equipo', ['balón', 'árbitro', 'portería'], 'Muchos jugadores: un equipo.'),
];

const DIPTONGOS: [string[], 'Diptongo' | 'Hiato' | 'Ni diptongo ni hiato'][] = [
  [['cie', 'lo'], 'Diptongo'], [['puer', 'ta'], 'Diptongo'], [['ai', 're'], 'Diptongo'], [['hie', 'lo'], 'Diptongo'], [['cau', 'sa'], 'Diptongo'],
  [['nie', 've'], 'Diptongo'], [['a', 'gua'], 'Diptongo'], [['ciu', 'dad'], 'Diptongo'], [['pei', 'ne'], 'Diptongo'],
  [['le', 'ón'], 'Hiato'], [['po', 'e', 'ta'], 'Hiato'], [['dí', 'a'], 'Hiato'], [['rí', 'o'], 'Hiato'], [['ma', 'íz'], 'Hiato'], [['pa', 'ís'], 'Hiato'], [['bú', 'ho'], 'Hiato'],
  [['me', 'sa'], 'Ni diptongo ni hiato'], [['li', 'bro'], 'Ni diptongo ni hiato'], [['pe', 'rro'], 'Ni diptongo ni hiato'],
];

const diptongoHiato = (rand: Rand): Pregunta => {
  const [silabas, ok] = uno(rand, DIPTONGOS);
  const w = silabas.join('');
  const por = ok === 'Diptongo' ? 'las dos vocales van juntas en la misma sílaba' : ok === 'Hiato' ? 'las dos vocales van en sílabas distintas' : 'no tiene dos vocales seguidas';
  return {
    icon: '🔡',
    prompt: `«${w}» tiene…`,
    ok,
    no: ['Diptongo', 'Hiato', 'Ni diptongo ni hiato'].filter((x) => x !== ok),
    why: `${silabas.join(' - ')}: ${por}.`,
    visual: { tipo: 'silabas', silabas, tonica: -1, juntas: true },
  };
};

const DETERMINANTES: [string, 'Artículo' | 'Demostrativo', 'ms' | 'fs' | 'mp' | 'fp'][] = [
  ['el', 'Artículo', 'ms'], ['la', 'Artículo', 'fs'], ['los', 'Artículo', 'mp'], ['las', 'Artículo', 'fp'], ['un', 'Artículo', 'ms'], ['una', 'Artículo', 'fs'],
  ['este', 'Demostrativo', 'ms'], ['esta', 'Demostrativo', 'fs'], ['ese', 'Demostrativo', 'ms'], ['esa', 'Demostrativo', 'fs'],
  ['aquel', 'Demostrativo', 'ms'], ['aquella', 'Demostrativo', 'fs'], ['estos', 'Demostrativo', 'mp'], ['esas', 'Demostrativo', 'fp'],
];
const NOMBRE_DE: Record<string, [string, string]> = { ms: ['balón', 'nuevo'], fs: ['portería', 'nueva'], mp: ['guantes', 'nuevos'], fp: ['botas', 'nuevas'] };

const determinante = (rand: Rand): Pregunta => {
  const [det, ok, gn] = uno(rand, DETERMINANTES);
  const [nombre, adj] = NOMBRE_DE[gn];
  const verbo = gn.endsWith('p') ? 'son' : 'es';
  return {
    icon: '👉',
    prompt: `En «${det[0].toUpperCase()}${det.slice(1)} ${nombre} ${verbo} ${adj}», ¿qué es «${det}»?`,
    ok,
    no: ['Artículo', 'Demostrativo', 'Nombre', 'Adjetivo'].filter((x) => x !== ok),
    why: ok === 'Artículo' ? 'Artículos: el, la, los, las, un, una, unos, unas.' : 'Demostrativos: este (aquí), ese (ahí), aquel (allí). Señalan lo cerca o lejos que está.',
    visual: { tipo: 'gramatica', palabras: [{ p: det, clase: ok === 'Artículo' ? 'articulo' : 'otra' }, { p: nombre, clase: 'nombre' }, { p: verbo, clase: 'verbo' }, { p: adj, clase: 'adjetivo' }] },
  };
};

const RECURSOS: Pregunta[] = [
  p('🎭', '«Tus ojos son dos luceros» es…', 'Una metáfora', ['Una comparación', 'Una personificación', 'Una hipérbole'], 'Metáfora: dice que una cosa ES otra, sin «como».'),
  p('🎭', '«Corre rápido como un rayo» es…', 'Una comparación', ['Una metáfora', 'Una personificación', 'Una hipérbole'], 'Comparación: une dos cosas con «como».'),
  p('🎭', '«El sol sonreía en el cielo» es…', 'Una personificación', ['Una comparación', 'Una metáfora', 'Una hipérbole'], 'Personificación: algo que no es persona hace cosas de persona.'),
  p('🎭', '«Te lo he dicho un millón de veces» es…', 'Una hipérbole', ['Una comparación', 'Una metáfora', 'Una personificación'], 'Hipérbole: exagerar muchísimo.'),
  p('🎭', '«Las estrellas bailaban en la noche» es…', 'Una personificación', ['Una comparación', 'Una metáfora', 'Una hipérbole'], 'Las estrellas no bailan: se les da algo de persona.'),
  p('🎭', '«Tengo tanta hambre que me comería un elefante» es…', 'Una hipérbole', ['Una comparación', 'Una metáfora', 'Una personificación'], 'Es una exageración.'),
];

const PUNTUACION: Pregunta[] = [
  p('✍️', '¿Qué signo es más fuerte que la coma pero más suave que el punto?', 'Punto y coma (;)', ['Dos puntos', 'Punto final', 'Interrogación'], 'El punto y coma separa partes que están relacionadas.'),
  p('✍️', 'Al final de un texto se pone…', 'Punto final', ['Punto y seguido', 'Punto y aparte', 'Coma'], 'Punto final: se acabó.'),
  p('✍️', 'Para empezar un párrafo nuevo se pone…', 'Punto y aparte', ['Punto y seguido', 'Punto final', 'Coma'], 'Punto y aparte: se sigue en otra línea.'),
  p('✍️', '«Unos juegan al fútbol___ otros, al baloncesto.» ¿Qué va en el hueco?', 'Punto y coma (;)', ['Dos puntos', 'Interrogación', 'Nada'], 'Separa dos partes que se parecen.'),
  p('✍️', '¿Cuál tiene bien las comas?', 'Compré peras, manzanas y uvas.', ['Compré, peras manzanas, y uvas.', 'Compré peras manzanas, y, uvas.', 'Compré peras manzanas y uvas,'], 'La coma separa las cosas de una lista; delante de «y» no se pone.'),
];

const MAYUSCULAS: Pregunta[] = [
  p('🔠', '¿Cuál está bien escrita?', 'Leo vive en Madrid.', ['leo vive en Madrid.', 'Leo vive en madrid.', 'leo Vive en madrid.'], 'Mayúscula al empezar y en los nombres propios (Leo, Madrid).'),
  p('🔠', '¿Cuál está bien escrita?', 'Hoy juega el Real Madrid.', ['hoy juega el real madrid.', 'Hoy Juega El Real Madrid.', 'hoy juega el Real Madrid.'], 'Al principio de la frase y en el nombre del equipo.'),
  p('🔠', '¿Después de un punto se escribe…?', 'Mayúscula', ['Minúscula', 'Coma', 'Nada'], 'Después de punto, siempre mayúscula.'),
];

/* ---------------------------------------------------------------------------
 * NATURAL SCIENCE (en inglés, como en clase)
 * ------------------------------------------------------------------------- */

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

/* ---- Lengua 4 · lo de los resúmenes y las fichas de refuerzo de la profe ---- */

const COMUNICACION: Pregunta[] = [
  p('📣', 'La persona que transmite el mensaje es el…', 'Emisor', ['Receptor', 'Canal', 'Código'], 'Emisor: quien manda el mensaje.'),
  p('👂', 'La persona que recibe el mensaje es el…', 'Receptor', ['Emisor', 'Contexto', 'Mensaje'], 'Receptor: quien lo recibe.'),
  p('📡', 'El medio por el que viaja el mensaje (el aire, el papel…) es el…', 'Canal', ['Código', 'Emisor', 'Contexto'], 'Canal: por dónde va el mensaje.'),
  p('🔣', 'El sistema de signos y reglas que comparten emisor y receptor (el idioma, la escritura…) es el…', 'Código', ['Canal', 'Mensaje', 'Contexto'], 'Código: el «idioma» del mensaje. Si no lo conoces, no lo entiendes.'),
  p('🎬', 'La situación en la que se comunica (en el cine, en clase…) es el…', 'Contexto', ['Código', 'Canal', 'Receptor'], 'Contexto: dónde y cuándo pasa la comunicación.'),
  p('📻', '«Un padre oye por la radio que mañana nevará en Madrid.» ¿Quién es el receptor?', 'El padre', ['La radio', 'La nieve', 'Madrid'], 'Recibe el mensaje el padre; la radio es el canal.'),
  p('📻', '«Un padre oye por la radio que mañana nevará en Madrid.» ¿Cuál es el mensaje?', 'Que mañana nevará en Madrid', ['La radio', 'El padre', 'El locutor'], 'El mensaje es la información que se transmite.'),
  p('📻', 'Una radio suena en una habitación vacía. ¿Qué elemento falta?', 'El receptor', ['El emisor', 'El canal', 'El mensaje'], 'No hay nadie que lo reciba: falta el receptor.'),
  p('✉️', 'Recibes una carta en un idioma que no conoces. ¿Qué falla?', 'El código', ['El canal', 'El emisor', 'El contexto'], 'No compartís el código: no la puedes entender.'),
  p('🌊', 'Intentas hablar debajo del agua y no se te entiende. ¿Qué falla?', 'El canal', ['El código', 'El receptor', 'El mensaje'], 'El agua no deja viajar bien la voz: falla el canal.'),
  p('🤚', 'Un gesto con la mano es lenguaje…', 'No verbal', ['Verbal', 'Escrito', 'Oral'], 'No verbal: gestos, posturas, ruidos, el volumen de la voz.'),
  p('💬', 'Una conversación es lenguaje…', 'Verbal', ['No verbal', 'De signos', 'Corporal'], 'Verbal: con palabras, habladas (oral) o escritas.'),
  p('😂', 'Las risas y los silbidos son comunicación…', 'No verbal', ['Verbal', 'Escrita', 'Formal'], 'No llevan palabras: no verbal.'),
  p('📄', '¿Qué es un texto?', 'Una oración o varias que comunican algo', ['Una sola letra', 'Un dibujo', 'Una lista de números'], 'Texto: oraciones que juntas comunican algo.'),
  p('🧩', 'Que los párrafos estén bien ordenados y tengan sentido es la…', 'Coherencia', ['Cohesión', 'Acepción', 'Entrada'], 'Coherencia: el orden y el sentido del texto.'),
  p('🔗', 'Usar pronombres, sinónimos y conectores para unir las ideas es la…', 'Cohesión', ['Coherencia', 'Entrada', 'Sílaba'], 'Cohesión: que las partes estén bien unidas.'),
  p('🔗', '¿Cuál de estas palabras es un conector?', 'además', ['mesa', 'rápido', 'cantar'], 'Conectores: después, además, también, es decir, por ejemplo, pero…'),
];

const DICCIONARIO_TERMS: Pregunta[] = [
  p('📖', 'Cada palabra que explica el diccionario se llama…', 'Entrada', ['Acepción', 'Palabra guía', 'Sílaba'], 'La entrada es la palabra que se busca, en negrita.'),
  p('📖', 'Cada uno de los significados de una palabra es una…', 'Acepción', ['Entrada', 'Palabra guía', 'Familia'], 'Una palabra puede tener varias acepciones, numeradas.'),
  p('📖', 'Las palabras de arriba de cada página, que dicen la primera y la última que hay en ella, son…', 'Palabras guía', ['Entradas', 'Acepciones', 'Sinónimos'], 'Las palabras guía te dicen si lo que buscas está en esa página.'),
];

const POR_SILABAS: string[][] = [
  ['sed'], ['tres'], ['flor'], ['paz'], ['tren'], ['voz'], ['luz'],
  ['glo', 'bo'], ['pla', 'za'], ['bro', 'ma'], ['pul', 'so'], ['me', 'sa'], ['del', 'fín'],
  ['clí', 'ni', 'ca'], ['se', 'cre', 'to'], ['me', 'da', 'lla'], ['ji', 'ra', 'fa'], ['ce', 'bo', 'lla'], ['es', 'tu', 'che'],
  ['lo', 'ca', 'li', 'dad'], ['be', 'ren', 'je', 'nas'], ['en', 'tre', 'te', 'ner'], ['res', 'ba', 'la', 'di', 'zo'], ['can', 'di', 'da', 'tu', 'ra'],
];

const porSilabas = (rand: Rand): Pregunta => {
  const silabas = uno(rand, POR_SILABAS);
  const n = silabas.length;
  const ok = n === 1 ? 'Monosílaba' : n === 2 ? 'Bisílaba' : n === 3 ? 'Trisílaba' : 'Polisílaba';
  return {
    icon: '👏',
    prompt: `«${silabas.join('')}» es una palabra…`,
    ok,
    no: ['Monosílaba', 'Bisílaba', 'Trisílaba', 'Polisílaba'].filter((x) => x !== ok),
    why: `${silabas.join(' - ')}: ${n} sílaba${n === 1 ? '' : 's'}. Mono = 1, bi = 2, tri = 3, poli = más de 3.`,
    visual: { tipo: 'silabas', silabas, tonica: -1, juntas: true },
  };
};

const AFIJOS: Pregunta[] = [
  p('🧱', 'Los prefijos se ponen…', 'Delante del lexema', ['Detrás del lexema', 'En medio de la palabra', 'Al final de la oración'], 'Prefijo: delante (des-hacer). Sufijo: detrás (pan-adero).'),
  p('🧱', 'Los sufijos se ponen…', 'Detrás del lexema', ['Delante del lexema', 'Encima de la palabra', 'En otra palabra'], 'Sufijo: detrás (flor-ero).'),
  p('🚫', '¿Qué indica el prefijo «des-» en «deshacer»?', 'Lo contrario', ['Antes de', 'Otra vez', 'La mitad'], 'in-, im-, i-, des-: oposición (imposible, despreocupado).'),
  p('⏪', '¿Qué indica el prefijo «pre-» en «preescolar»?', 'Antes de', ['Otra vez', 'Lo contrario', 'La mitad'], 'Pre- = antes de.'),
  p('🔁', '¿Qué indica el prefijo «re-» en «releer»?', 'Otra vez', ['Antes de', 'Lo contrario', 'La mitad'], 'Re- = repetición.'),
  p('🌗', '¿Qué indica el prefijo «semi-» en «semifinal»?', 'La mitad', ['Otra vez', 'Lo contrario', 'Antes de'], 'Semi- = mitad.'),
  p('🧑‍🍳', 'El sufijo «-ero» en «panadero» indica…', 'Una profesión', ['Un lugar', 'Algo pequeño', 'Lo contrario'], '-ero, -era: profesión (panadero, panadera).'),
  p('🏪', 'El sufijo «-ería» en «panadería» indica…', 'Un lugar', ['Una profesión', 'Algo grande', 'Lo contrario'], '-ería: lugar (panadería, frutería).'),
  p('🧺', 'El sufijo «-able» en «lavable» quiere decir…', 'Que se puede', ['Que es pequeño', 'Que es un lugar', 'Lo contrario'], '-able: que se puede (lavable, bailable).'),
  p('⚠️', 'El sufijo «-oso» en «peligroso» quiere decir…', 'Que tiene mucho', ['Que es pequeño', 'Una profesión', 'Lo contrario'], '-oso, -osa: que tiene mucho (peligroso, sudoroso).'),
  p('🔤', '¿Cuál es el lexema de «panadero»?', 'pan', ['panad', 'ero', 'dero'], 'El lexema es la parte que no cambia: pan-adero, pan-adería, pan-ecillo.'),
  p('🔤', '¿Cuál es el lexema de «marinero»?', 'mar', ['marin', 'ero', 'nero'], 'mar-inero, mar-ino, mar-ea.'),
  p('🚫', '¿Cuál de estas palabras lleva prefijo?', 'imposible', ['posible', 'posibilidad', 'pasear'], 'im- + posible = imposible.'),
];

const PRIMITIVAS: [string, string, string[]][] = [
  ['sudoroso', 'sudor', ['suda', 'sudario', 'sur']], ['rosaleda', 'rosa', ['rosal', 'roseta', 'rozar']], ['peligroso', 'peligro', ['pelo', 'pelirrojo', 'pelea']],
  ['encadenado', 'cadena', ['encadenar', 'canela', 'nado']], ['martillazo', 'martillo', ['martes', 'mar', 'mantilla']], ['blancuzco', 'blanco', ['blando', 'banco', 'blusa']],
  ['secador', 'secar', ['seco', 'sector', 'cedro']], ['fijador', 'fijar', ['fijo', 'figura', 'dorar']], ['asturiano', 'Asturias', ['astro', 'Austria', 'asturiana']],
];

const primitiva = (rand: Rand): Pregunta => {
  const [w, ok, no] = uno(rand, PRIMITIVAS);
  return { icon: '🌱', prompt: `¿De qué palabra primitiva viene «${w}»?`, ok, no, why: `${w} se forma desde ${ok} añadiéndole un trozo.` };
};

const TEXTOS_UTILES: Pregunta[] = [
  p('📏', 'Las reglas que dicen cómo comportarse en un lugar (el comedor, la biblioteca) son…', 'Normas', ['Instrucciones', 'Formularios', 'Acepciones'], 'Normas: para convivir bien en un sitio.'),
  p('🧱', 'Los pasos ordenados para hacer bien una tarea (montar un lego) son…', 'Instrucciones', ['Normas', 'Formularios', 'Cuentos'], 'Instrucciones: pasos en orden.'),
  p('📝', 'Un documento con espacios para rellenar y pedir algo es un…', 'Formulario', ['Cuento', 'Poema', 'Diccionario'], 'Formulario: impreso o digital, con huecos para tus datos.'),
  p('✋', '¿Cuál es una buena norma de clase?', 'Levanto la mano para hablar', ['No presto nada nunca', 'Tiro papeles al suelo', 'Hablo cuando quiero'], 'Las normas ayudan a convivir: esperar el turno, escuchar, pedir perdón.'),
  p('📧', 'En un correo electrónico, ¿para qué sirve el «asunto»?', 'Para decir de qué trata el mensaje', ['Para poner la firma', 'Para adjuntar fotos', 'Para nada'], 'El asunto resume en pocas palabras de qué va el correo.'),
  p('📧', '¿Qué símbolo lleva siempre una dirección de correo electrónico?', '@', ['#', '%', '&'], 'nombre@servidor: la arroba separa el usuario del servidor.'),
];

const FEMENINOS: [string, string, string[]][] = [
  ['alcalde', 'alcaldesa', ['alcalda', 'alcaldina']], ['héroe', 'heroína', ['heroa', 'heroesa']], ['actor', 'actriz', ['actora', 'actoresa']],
  ['príncipe', 'princesa', ['príncipa', 'principina']], ['caballo', 'yegua', ['caballa', 'caballesa']], ['gallo', 'gallina', ['galla', 'gallesa']],
  ['emperador', 'emperatriz', ['emperadora', 'emperesa']], ['padrino', 'madrina', ['padrina', 'padresa']], ['tigre', 'tigresa', ['tigra', 'tigrina']],
];

const femenino = (rand: Rand): Pregunta => {
  const [m, f, no] = uno(rand, FEMENINOS);
  return { icon: '👑', prompt: `¿Cuál es el femenino de «${m}»?`, ok: f, no, why: `${m} → ${f}. Algunos nombres de personas y animales cambian de forma, no sólo de terminación.` };
};

const NUMERO_INV: Pregunta[] = [
  p('☂️', 'El plural de «paraguas» es…', 'paraguas', ['paraguases', 'paragua', 'paraguasos'], 'No cambia: el paraguas, los paraguas.'),
  p('📅', 'El plural de «lunes» es…', 'lunes', ['luneses', 'lune', 'lunesos'], 'El lunes, los lunes: no cambia.'),
  p('🏝️', 'El plural de «oasis» es…', 'oasis', ['oasises', 'oasi', 'oasos'], 'Como crisis o análisis: igual en singular y en plural.'),
  p('🌿', 'El plural de «césped» es…', 'céspedes', ['césped', 'céspeds', 'cespedes'], 'Céspedes: al añadir sílaba pasa a esdrújula y conserva la tilde.'),
];

const COLECTIVOS: [string, string][] = [
  ['aves', 'bandada'], ['cerdos', 'piara'], ['ovejas', 'rebaño'], ['abejas', 'enjambre'], ['perros', 'jauría'],
  ['pinos', 'pinar'], ['cubiertos', 'cubertería'], ['islas', 'archipiélago'], ['estrellas', 'constelación'], ['soldados', 'ejército'], ['árboles', 'bosque'],
];

const colectivo = (rand: Rand): Pregunta => {
  const [ind, col] = uno(rand, COLECTIVOS);
  return {
    icon: '🐑',
    prompt: `¿Cómo se llama un grupo de ${ind}?`,
    ok: col,
    no: barajar(COLECTIVOS.filter(([x]) => x !== ind), rand).slice(0, 3).map(([, c]) => c),
    why: `${col}: un nombre colectivo, que en singular nombra a muchos (${ind}).`,
  };
};

/* ---- Matemáticas 3 · Operación Mundo (Anaya) ---- */

const tablaDe = (tablas: number[]) => (rand: Rand): Pregunta => {
  const a = uno(rand, tablas);
  const b = entre(rand, 2, 10);
  return numerica('✖️', `${a} × ${b} = ?`, a * b, cercanos(rand, a * b, [a, -a, b, -b, 1, -1]), `La tabla del ${a}: ${b} grupos de ${a} son ${a * b}.`, { tipo: 'matriz', filas: b, columnas: a });
};

const grupos = (tablas: number[]) => (rand: Rand): Pregunta => {
  const cada = uno(rand, tablas);
  const n = entre(rand, 3, 9);
  const cosa = uno(rand, [['equipos', 'jugadores', '👥'], ['cajas', 'balones', '⚽'], ['sobres', 'cromos', '🃏'], ['platos', 'galletas', '🍪']]);
  return numerica('📦', `Hay ${n} ${cosa[0]} con ${cada} ${cosa[1]} cada uno. ¿Cuántos ${cosa[1]} hay?`, n * cada, [n + cada, n * cada + cada, n * cada - 1], `Grupos iguales: se multiplica. ${n} × ${cada} = ${n * cada}.`, { tipo: 'matriz', filas: n, columnas: cada });
};

const porDiezCienMil = (rand: Rand): Pregunta => {
  const a = entre(rand, 3, 99);
  const k = uno(rand, [10, 100, 1000]);
  const r = a * k;
  return numerica('0️⃣', `${a} × ${num(k)} = ?`, r, [r * 10, k === 10 ? a : r / 10, r + k], `Multiplicar por ${num(k)} es añadir ${String(k).length - 1} cero${k === 10 ? '' : 's'} al final: ${num(r)}.`, { tipo: 'columnas', a, b: k, op: '×', resultado: r });
};

const patron = (rand: Rand): Pregunta => {
  const paso = uno(rand, [2, 3, 4, 5, 10, 25, 50, 100]);
  const sube = rand() < 0.7;
  const ini = sube ? entre(rand, 1, 60) : entre(rand, 6, 60) + paso * 6;
  const serie = Array.from({ length: 5 }, (_, i) => (sube ? ini + i * paso : ini - i * paso));
  const sig = sube ? ini + 5 * paso : ini - 5 * paso;
  return numerica('🔁', `¿Qué número sigue? ${serie.join(', ')}, …`, sig, cercanos(rand, sig, [paso, -paso, 1, -1, 10]), `Va ${sube ? 'sumando' : 'restando'} ${paso} cada vez: ${serie[4]} ${sube ? '+' : '−'} ${paso} = ${sig}.`);
};

const euros = (c: number) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')} €`;

const monedas = (rand: Rand): Pregunta => {
  const piezas: [number, string, number][] = [[500, '💶 billete de 5 €', entre(rand, 0, 2)], [200, '🪙 moneda de 2 €', entre(rand, 0, 3)], [100, '🪙 moneda de 1 €', entre(rand, 1, 3)], [50, '🟡 moneda de 50 cts', entre(rand, 0, 2)], [20, '🟡 moneda de 20 cts', entre(rand, 0, 2)]];
  const hay = piezas.filter(([, , n]) => n > 0);
  const total = hay.reduce((s, [v, , n]) => s + v * n, 0);
  const texto = hay.map(([, nombre, n]) => `${n} × ${nombre}`).join(' · ');
  return {
    icon: '💶',
    prompt: '¿Cuánto dinero hay en total?',
    ok: euros(total),
    no: [total + 50, total + 100, Math.max(20, total - 20)].map(euros),
    why: `Se suman primero los euros y luego los céntimos: ${euros(total)}. 100 céntimos = 1 €.`,
    visual: { tipo: 'lamina', emoji: '👛', rotulo: texto },
  };
};

const vuelta = (rand: Rand): Pregunta => {
  const precio = entre(rand, 2, 18) * 50 + 100;
  const pago = precio < 1000 ? 1000 : 2000;
  return {
    icon: '🛒',
    prompt: `Algo cuesta ${euros(precio)} y pagas con un billete de ${pago / 100} €. ¿Cuánto te devuelven?`,
    ok: euros(pago - precio),
    no: [pago - precio + 50, pago - precio + 100, Math.max(50, pago - precio - 50)].map(euros),
    why: `${pago / 100} € − ${euros(precio)} = ${euros(pago - precio)}. Comprueba: lo que cuesta + la vuelta = lo que pagas.`,
    visual: { tipo: 'lamina', emoji: '🛒', rotulo: `💶 ${pago / 100} € − 🏷️ ${euros(precio)}` },
  };
};

const propiedadesSuma = (rand: Rand): Pregunta => {
  const a = entre(rand, 12, 60);
  const b = entre(rand, 12, 60);
  const c = entre(rand, 12, 60);
  return uno(rand, [
    p('🔄', `${a} + ${b} = ${b} + ${a}. ¿Qué propiedad es?`, 'Conmutativa', ['Asociativa', 'Elemento neutro', 'Ninguna'], 'Conmutativa: el orden de los sumandos no cambia el resultado.'),
    p('🧷', `(${a} + ${b}) + ${c} = ${a} + (${b} + ${c}). ¿Qué propiedad es?`, 'Asociativa', ['Conmutativa', 'Elemento neutro', 'Ninguna'], 'Asociativa: da igual cómo agrupes los sumandos.'),
    p('0️⃣', `${a} + 0 = ${a}. ¿Qué es el 0 en la suma?`, 'El elemento neutro', ['La propiedad conmutativa', 'Un error', 'El resultado'], 'Sumar 0 no cambia nada: es el elemento neutro.'),
  ]);
};

/* ---- Natural Science · Global Thinkers (Anaya) ---- */

const METODO: Pregunta[] = [
  p('❓', 'What is the first step of the scientific method?', 'Ask a question', ['Write the conclusion', 'Draw the result', 'Go home'], 'Question → hypothesis → experiment → data → conclusion.'),
  p('💡', 'A hypothesis is…', 'A possible answer we want to test', ['The final result', 'A type of microscope', 'A drawing'], 'Hipótesis: lo que creemos que va a pasar, antes de comprobarlo.'),
  p('📊', 'The numbers and observations we collect in an experiment are…', 'Data', ['Hypotheses', 'Questions', 'Tools'], 'Data = datos.'),
  p('📚', 'Where can we find reliable scientific information?', 'Encyclopedias and trusted websites', ['Any comment on the internet', 'Rumours', 'Video game chats'], 'Información fiable: libros, enciclopedias y webs de confianza.'),
  p('🧩', 'Breaking a big problem into small steps is…', 'Computational thinking', ['Photosynthesis', 'Gravity', 'Digestion'], 'Pensamiento computacional: dividir el problema en pasos.'),
  p('📝', 'At the end of an experiment we write the…', 'Conclusion', ['Hypothesis', 'Question', 'Title'], 'La conclusión dice si la hipótesis era correcta.'),
  p('🧪', 'Scientists check if an idea is true by doing an…', 'Experiment', ['Excuse', 'Exam', 'Exercise'], 'Experiment = experimento.'),
  p('📏', 'Which one is an observation?', 'The plant grew 3 cm in a week', ['Plants are boring', 'I think plants are pretty', 'Maybe it will rain'], 'An observation is something we can see or measure.'),
  p('💻', 'Tools and machines that help us solve problems are…', 'Technology', ['Nature', 'Weather', 'Habits'], 'Technology = tecnología.'),
];

const SERES_VIVOS: Pregunta[] = [
  p('🌱', 'What are the three vital functions?', 'Nutrition, interaction, reproduction', ['Eating, sleeping, playing', 'Running, jumping, swimming', 'Breathing, seeing, reading'], 'Funciones vitales: nutrición, relación y reproducción.'),
  p('🦴', 'Animals with a backbone are…', 'Vertebrates', ['Invertebrates', 'Plants', 'Fungi'], 'Backbone = columna vertebral.'),
  p('🕷️', 'Which animal is an invertebrate?', 'Spider', ['Dog', 'Eagle', 'Frog'], 'Invertebrates have no backbone: insects, spiders, worms, snails…'),
  p('🦅', 'Animals with feathers and a beak are…', 'Birds', ['Mammals', 'Reptiles', 'Fish'], 'Birds = aves.'),
  p('🍼', 'Mammals feed their babies with…', 'Milk', ['Seeds', 'Insects', 'Leaves'], 'Mamíferos: maman leche.'),
  p('🐸', 'A frog lives in water and on land: it is an…', 'Amphibian', ['Reptile', 'Mammal', 'Bird'], 'Amphibian = anfibio.'),
  p('🦎', 'Snakes and lizards have scales: they are…', 'Reptiles', ['Amphibians', 'Birds', 'Mammals'], 'Reptiles: escamas y huevos con cáscara.'),
  p('🐜', 'How many legs do insects have?', '6', ['8', '4', '10'], 'Insects: 6 legs. Spiders: 8.'),
  p('🌿', 'Which part of a plant takes water from the soil?', 'The roots', ['The leaves', 'The flower', 'The stem'], 'Roots = raíces.'),
  p('🍃', 'Plants make their own food in the…', 'Leaves', ['Roots', 'Seeds', 'Flowers'], 'Las hojas usan la luz del sol para fabricar alimento.'),
  p('🌻', 'Many plants reproduce with flowers and…', 'Seeds', ['Eggs', 'Milk', 'Feathers'], 'La flor da el fruto, y el fruto guarda las semillas.'),
  p('🌳', 'A plant with one thick, woody trunk is a…', 'Tree', ['Shrub', 'Grass', 'Moss'], 'Tree: one thick trunk. Shrub: several thin woody stems. Grass: soft green stem.'),
];

const CELULAS: Pregunta[] = [
  p('🦠', 'The control centre of the cell is the…', 'Nucleus', ['Membrane', 'Cytoplasm', 'Leaf'], 'Nucleus = núcleo.'),
  p('🫧', 'The thin layer around the cell is the…', 'Membrane', ['Nucleus', 'Cytoplasm', 'Shell'], 'Membrane = membrana.'),
  p('💧', 'The jelly-like substance inside the cell is the…', 'Cytoplasm', ['Nucleus', 'Membrane', 'Blood'], 'Cytoplasm = citoplasma.'),
  p('🔬', 'A living thing made of only one cell is…', 'Unicellular', ['Multicellular', 'A vertebrate', 'A mineral'], 'Uni = uno: unicelular.'),
  p('🐕', 'Humans, dogs and trees are…', 'Multicellular', ['Unicellular', 'Minerals', 'Bacteria'], 'Multi = muchos: millones de células.'),
  p('🍄', 'Mushrooms belong to the kingdom of…', 'Fungi', ['Plants', 'Animals', 'Minerals'], 'Fungi = hongos: no son plantas.'),
  p('☀️', 'Plants make their own food. Their nutrition is…', 'Autotrophic', ['Heterotrophic', 'Carnivorous', 'Omnivorous'], 'Autótrofa: fabrican su alimento con la luz (fotosíntesis).'),
  p('🌬️', 'Plants release a gas that we need to breathe:', 'Oxygen', ['Carbon dioxide', 'Smoke', 'Helium'], 'En la fotosíntesis las plantas sueltan oxígeno.'),
  p('🌸', 'Reproduction with flowers and seeds is…', 'Sexual reproduction', ['Asexual reproduction', 'Digestion', 'Respiration'], 'Con flores y semillas: sexual. Con un trozo de la planta: asexual.'),
  p('🪴', 'A new plant growing from a piece of stem is…', 'Asexual reproduction', ['Sexual reproduction', 'Photosynthesis', 'Interaction'], 'Asexual: sale de un trozo de la planta, sin semillas.'),
  p('🌞', 'A plant turning towards the light is an example of…', 'Interaction', ['Nutrition', 'Reproduction', 'Excretion'], 'Interaction (relación): la planta nota la luz y responde.'),
];

const ANIMALES: Pregunta[] = [
  p('🐄', 'An animal that eats only plants is a…', 'Herbivore', ['Carnivore', 'Omnivore', 'Producer'], 'Herbívoro: sólo plantas.'),
  p('🦁', 'A lion eats other animals: it is a…', 'Carnivore', ['Herbivore', 'Omnivore', 'Producer'], 'Carnívoro: come otros animales.'),
  p('🐻', 'A bear eats fruit, fish and honey: it is an…', 'Omnivore', ['Herbivore', 'Carnivore', 'Producer'], 'Omnívoro: come de todo.'),
  p('🥚', 'Animals that hatch from eggs are…', 'Oviparous', ['Viviparous', 'Herbivores', 'Invertebrates'], 'Ovíparos: nacen de huevos.'),
  p('🐶', "Animals born from their mother's body are…", 'Viviparous', ['Oviparous', 'Carnivores', 'Insects'], 'Vivíparos: se desarrollan dentro de la madre.'),
  p('🐟', 'Fish breathe through their…', 'Gills', ['Lungs', 'Skin', 'Nose'], 'Gills = branquias.'),
  p('🍖', 'Animals take their food from other living things. Their nutrition is…', 'Heterotrophic', ['Autotrophic', 'Photosynthetic', 'Mineral'], 'Heterótrofa: no fabrican su alimento.'),
  p('💬', 'Which helps your emotional well-being?', 'Talking about how you feel', ['Keeping everything inside', 'Never playing', 'Sleeping 4 hours'], 'Bienestar emocional: hablar de lo que sientes.'),
  p('😴', 'How many hours should a child of 9 sleep?', '9 to 11 hours', ['4 hours', '6 hours', '15 hours'], 'Dormir bien es parte del bienestar físico.'),
];

/* ---- Social Science · Global Thinkers (Anaya) ---- */

const PAISAJES: Pregunta[] = [
  p('🏙️', 'A landscape changed by people, with roads and buildings, is…', 'Humanised', ['Natural', 'A desert', 'An ocean'], 'Paisaje humanizado: lo han cambiado las personas.'),
  p('🏞️', 'A landscape without human changes is…', 'Natural', ['Humanised', 'Urban', 'Industrial'], 'Natural: como lo hizo la naturaleza.'),
  p('🌾', 'A large flat area of land is a…', 'Plain', ['Mountain', 'Valley', 'Cliff'], 'Plain = llanura.'),
  p('⛰️', 'Low land between mountains, often with a river, is a…', 'Valley', ['Plain', 'Cape', 'Island'], 'Valley = valle.'),
  p('🪨', 'A rocky, high coast that falls straight into the sea is a…', 'Cliff', ['Beach', 'Gulf', 'Plain'], 'Cliff = acantilado.'),
  p('📍', 'Land that goes into the sea is a…', 'Cape', ['Gulf', 'Beach', 'Valley'], 'Cape = cabo. Gulf (golfo) es al revés: el mar entra en la tierra.'),
  p('🌊', 'Sea that goes into the land is a…', 'Gulf', ['Cape', 'Island', 'Plain'], 'Gulf = golfo.'),
  p('🧭', "Spain's northern coast is on the…", 'Cantabrian Sea', ['Mediterranean Sea', 'Red Sea', 'Indian Ocean'], 'Norte: mar Cantábrico. Este: Mediterráneo. Oeste y sur: Atlántico.'),
  p('🏖️', 'Which sea is on the east coast of Spain?', 'Mediterranean Sea', ['Cantabrian Sea', 'North Sea', 'Pacific Ocean'], 'El Mediterráneo baña Cataluña, Valencia, Murcia, Andalucía y Baleares.'),
  p('🗺️', 'Land surrounded by water except on one side is a…', 'Peninsula', ['Island', 'Gulf', 'Valley'], 'España y Portugal están en la península ibérica.'),
];

const TIERRA4: Pregunta[] = [
  p('🌐', 'The innermost layer of the Earth is the…', 'Core', ['Crust', 'Mantle', 'Atmosphere'], 'Crust (corteza) → mantle (manto) → core (núcleo).'),
  p('🏠', 'We live on the Earth\'s…', 'Crust', ['Core', 'Mantle', 'Moon'], 'La corteza es la capa de fuera.'),
  p('🌠', 'A shooting star is…', 'A meteor burning in the atmosphere', ['A star falling', 'A planet', 'A satellite'], 'Una estrella fugaz es una roca que arde al entrar en la atmósfera.'),
  p('🪐', 'Pluto is a…', 'Dwarf planet', ['Star', 'Moon', 'Comet'], 'Plutón es un planeta enano.'),
  p('❄️', 'In the Northern Hemisphere, December is in…', 'Winter', ['Summer', 'Spring', 'Autumn'], 'Hemisferio norte: invierno de diciembre a marzo.'),
  p('🌍', 'Why are there seasons?', 'The Earth is tilted as it goes around the Sun', ['The Moon moves', 'Clouds cover the Sun', 'The Earth spins every day'], 'La inclinación del eje + la traslación = estaciones.'),
];

const CLIMA4: Pregunta[] = [
  p('📈', 'A graph with the temperature and rainfall of a place is a…', 'Climograph', ['Map', 'Compass', 'Thermometer'], 'Climograma: barras de lluvia y línea de temperatura.'),
  p('🧊', 'The further from the Equator, the climate is usually…', 'Colder', ['Hotter', 'The same', 'Rainier always'], 'La latitud es un factor del clima.'),
  p('🏔️', 'Higher places, like mountains, are usually…', 'Colder', ['Hotter', 'Drier always', 'The same'], 'La altitud: cuanto más alto, más frío.'),
  p('🌊', 'Places near the sea usually have…', 'Milder temperatures', ['Extreme temperatures', 'No rain', 'Snow all year'], 'El mar suaviza las temperaturas.'),
  p('🌡️', 'The three climate zones of the Earth are…', 'Hot, temperate and cold', ['Wet, dry and windy', 'North, south and east', 'Day, night and evening'], 'Zonas cálida, templada y fría.'),
  p('🏙️', 'Madrid has a… climate', 'Continental Mediterranean', ['Oceanic', 'Subtropical', 'Polar'], 'Inviernos fríos y veranos calurosos y secos.'),
  p('🌧️', 'Galicia and the Cantabrian coast have an… climate, with lots of rain', 'Oceanic', ['Mediterranean', 'Subtropical', 'Desert'], 'Clima oceánico: llueve mucho y las temperaturas son suaves.'),
  p('🌴', 'The Canary Islands have a… climate', 'Subtropical', ['Polar', 'Oceanic', 'Mountain'], 'Clima subtropical: templado todo el año.'),
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

const OM3 = 'Matemáticas 3 · Operación Mundo (Anaya)';
const LOM3 = 'Lengua 3 · Operación Mundo (Anaya)';
const LOM4 = 'Lengua 4 · Operación Mundo (Anaya)';
const GT = (n: string) => `${n} · Global Thinkers (Anaya)`;
const CM4 = 'Matemáticas 4 · Construyendo Mundos (Santillana)';
const OD3 = 'Oxford Discover 3';
const OD4 = 'Oxford Discover 4';

export const TEMARIO: Tema[] = [
  /* ------------------------------------------------ Mates 3º (Anaya: U1-4) */
  { id: 'm3-1', asignatura: 'mates', curso: 3, desde: '2026-09-07', titulo: 'U1 · Los números', fuente: OM3, puntos: ['Números de 3 y 4 cifras', 'Valor de posición', 'Comparar y la recta numérica', 'Aproximar', 'Ordinales'], hacer: [leerNumero(100, 9999), valorCifra(10000), mayor(1000, 9999), aproximar(10, 100, 9999), ordinal] },
  { id: 'm3-2', asignatura: 'mates', curso: 3, desde: '2026-10-01', titulo: 'U2 · La suma y la resta', fuente: OM3, puntos: ['Sumar y restar en vertical', 'Propiedades de la suma', 'Monedas y billetes', 'Problemas', 'Estimar'], hacer: [sumaLlevando(4), restaLlevando(4), propiedadesSuma, monedas, vuelta, estimarSuma, problemaDos] },
  { id: 'm3-3', asignatura: 'mates', curso: 3, desde: '2026-10-26', titulo: 'U3 · La multiplicación. Las tablas', fuente: OM3, puntos: ['Suma de sumandos iguales', 'Tablas del 2, 5, 10, 4 y 8', 'El doble', 'Grupos iguales'], hacer: [tablaDe([2, 5, 10, 4, 8]), tablaDe([2, 5, 10, 4, 8]), dobleTriple, grupos([2, 5, 10, 4, 8])] },
  { id: 'm3-4', asignatura: 'mates', curso: 3, desde: '2026-11-19', titulo: 'U4 · Las tablas. Practico la multiplicación', fuente: OM3, puntos: ['Tablas del 3, 6, 9 y 7', 'Por 10, 100 y 1.000', 'Multiplicar en vertical', 'Patrones'], hacer: [tablaDe([3, 6, 9, 7]), tablaDe([3, 6, 9, 7]), porDiezCienMil, porUnaCifra(99), patron, grupos([3, 6, 9, 7])] },

  /* ------------------------------------------------ Mates 4º */
  { id: 'm4-1', asignatura: 'mates', curso: 4, desde: '2026-09-07', titulo: 'U1 · Números de cinco cifras', fuente: CM4, puntos: ['Leer y descomponer hasta 99.999', 'Aproximar a decenas y centenas', 'Ordinales', 'Números romanos'], hacer: [leerNumero(10000, 99999), valorCifra(100000), aproximar(10, 1000, 99999), aproximar(100, 1000, 99999), romanos] },
  { id: 'm4-2', asignatura: 'mates', curso: 4, desde: '2026-10-01', titulo: 'U2 · Sumas y restas', fuente: CM4, puntos: ['Propiedad conmutativa y asociativa', 'Operaciones combinadas', 'Estimaciones', 'Problemas'], hacer: [sumaLlevando(5), restaLlevando(5), propiedades, combinadas, estimarSuma, problemaDos] },
  { id: 'm4-3', asignatura: 'mates', curso: 4, desde: '2026-10-26', titulo: 'U3 · La multiplicación', fuente: CM4, puntos: ['Por una y dos cifras', 'Factores acabados en ceros', 'Propiedades', 'Estimar productos'], hacer: [porUnaCifra(9999), porDosCifras, porCeros, estimarProducto, propiedades, problemaMulti] },
  { id: 'm4-4', asignatura: 'mates', curso: 4, desde: '2026-11-19', titulo: 'U4 · Ángulos y polígonos', fuente: CM4, puntos: ['Medir ángulos', 'Polígonos regulares', 'Perímetro', 'Área con cuadraditos', 'Triángulos y cuadriláteros'], hacer: [anguloGrados, poligono, perimetro, area, delBanco(TRIANGULOS)] },

  /* ------------------------------------------------ Lengua 3º (Anaya: U1-4) */
  { id: 'l3-1', asignatura: 'lengua', curso: 3, desde: '2026-09-07', titulo: 'U1 · Letra, sílaba, palabra y oración', fuente: LOM3, puntos: ['La letra, la sílaba, la palabra y la oración', 'Abecedario y diccionario', 'La sílaba tónica'], hacer: [delBanco(LETRA_ORACION), ordenAlfabetico, contarSilabas, silabaTonica] },
  { id: 'l3-2', asignatura: 'lengua', curso: 3, desde: '2026-10-05', titulo: 'U2 · Palabras derivadas', fuente: LOM3, puntos: ['Palabras derivadas', 'Las siglas', 'El punto y la mayúscula'], hacer: [derivada, derivada, delBanco(SIGLAS), delBanco(MAYUSCULAS)] },
  { id: 'l3-3', asignatura: 'lengua', curso: 3, desde: '2026-11-02', titulo: 'U3 · Diminutivos, aumentativos y compuestas', fuente: LOM3, puntos: ['Diminutivos y aumentativos', 'Palabras compuestas', 'Palabras polisémicas', 'La coma y los dos puntos'], hacer: [dimAum, compuesta, polisemica, delBanco(COMA_DOSPUNTOS)] },
  { id: 'l3-4', asignatura: 'lengua', curso: 3, desde: '2026-11-30', titulo: 'U4 · El nombre', fuente: LOM3, puntos: ['El nombre: común y propio', 'Género y número', 'Sinónimos', 'Signos de interrogación y exclamación'], hacer: [nombreAdjetivo('nombre'), generoNumero, delBanco(COMUN_PROPIO), sinonimo, delBanco(SIGNOS)] },

  /* ------------------------------------------------ Lengua 4º (Anaya: U1-4) */
  { id: 'l4-1', asignatura: 'lengua', curso: 4, desde: '2026-09-07', titulo: 'U1 · Comunicación y formación de palabras', fuente: `${LOM4} + resumen y ficha de la profe`, puntos: ['Elementos de la comunicación', 'Lenguaje verbal y no verbal', 'El texto: coherencia y cohesión', 'El diccionario: entrada, acepción, palabras guía', 'Mono, bi, tri y polisílabas', 'Prefijos y sufijos, derivadas y compuestas', 'Diminutivos y aumentativos', 'Agudas, llanas y esdrújulas'], hacer: [delBanco(COMUNICACION), delBanco(COMUNICACION), delBanco(DICCIONARIO_TERMS), porSilabas, derivada, primitiva, delBanco(AFIJOS), delBanco(AFIJOS), compuesta, dimAum, agudaLlana, silabaTonica] },
  { id: 'l4-2', asignatura: 'lengua', curso: 4, desde: '2026-10-05', titulo: 'U2 · Normas, el nombre y la tilde', fuente: `${LOM4} + resumen y ficha de la profe`, puntos: ['Normas, instrucciones, formulario y correo', 'Familia de palabras', 'El nombre: género y número', 'Propio y común, individual y colectivo', 'La tilde en agudas, llanas y esdrújulas'], hacer: [delBanco(TEXTOS_UTILES), familia, delBanco(CLASES_NOMBRE), colectivo, femenino, delBanco(NUMERO_INV), generoNumero, tilde, tilde] },
  { id: 'l4-3', asignatura: 'lengua', curso: 4, desde: '2026-11-02', titulo: 'U3 · El adjetivo', fuente: LOM4, puntos: ['El adjetivo', 'Concordancia', 'Sinónimos', 'Diptongos e hiatos'], hacer: [nombreAdjetivo('adjetivo'), concordancia, sinonimo, diptongoHiato, diptongoHiato] },
  { id: 'l4-4', asignatura: 'lengua', curso: 4, desde: '2026-11-30', titulo: 'U4 · Los determinantes', fuente: LOM4, puntos: ['Artículos y demostrativos', 'Recursos literarios', 'Punto, coma y punto y coma'], hacer: [determinante, determinante, delBanco(RECURSOS), delBanco(PUNTUACION)] },

  /* ------------------------------------------------ Natural Science (Anaya: U1-2) */
  { id: 'n3-1', asignatura: 'science', curso: 3, desde: '2026-09-07', titulo: 'U1 · Science', fuente: GT('Natural Science 3'), puntos: ['Scientific questions', 'Hypothesis and data', 'Scientific information', 'Technology and computational thinking'], hacer: [delBanco(METODO)] },
  { id: 'n3-2', asignatura: 'science', curso: 3, desde: '2026-10-26', titulo: 'U2 · Living organisms', fuente: GT('Natural Science 3'), puntos: ['Vital functions', 'Vertebrates and invertebrates', 'Plants and their reproduction', 'Types of plants'], hacer: [delBanco(SERES_VIVOS)] },
  { id: 'n4-1', asignatura: 'science', curso: 4, desde: '2026-09-07', titulo: 'U1 · Living organisms', fuente: GT('Natural Science 4'), puntos: ['Cells: membrane, cytoplasm, nucleus', 'Unicellular and multicellular', 'Classifying living things', 'Plants: nutrition, interaction, reproduction'], hacer: [delBanco(CELULAS)] },
  { id: 'n4-2', asignatura: 'science', curso: 4, desde: '2026-11-02', titulo: 'U2 · Animals and human beings', fuente: GT('Natural Science 4'), puntos: ['Types of animals', 'Vital functions in animals', 'Human beings', 'Physical and emotional well-being'], hacer: [delBanco(ANIMALES), delBanco(ANIMALES), delBanco(NUTRICION), delBanco(RELACION)] },

  /* ------------------------------------------------ Social Science (Anaya: U1-2) */
  { id: 's3-1', asignatura: 'social', curso: 3, desde: '2026-09-07', titulo: 'U1 · Maps and plans', fuente: GT('Social Science 3'), puntos: ['Plans and maps', 'Key, scale and symbols', 'Cardinal points', 'The globe: equator, meridians'], hacer: [delBanco(MAPAS)] },
  { id: 's3-2', asignatura: 'social', curso: 3, desde: '2026-10-26', titulo: 'U2 · Landscapes', fuente: GT('Social Science 3'), puntos: ['Natural and humanised', 'Inland landscapes of Spain', 'Coastal landscapes', "Spain's coastline"], hacer: [delBanco(PAISAJES), delBanco(PAISAJES), delBanco(RELIEVE)] },
  { id: 's4-1', asignatura: 'social', curso: 4, desde: '2026-09-07', titulo: 'U1 · The Earth', fuente: GT('Social Science 4'), puntos: ['The Universe and the Solar System', 'Layers of the Earth', 'The Moon', 'Rotation, revolution and seasons'], hacer: [delBanco(UNIVERSO), delBanco(UNIVERSO), delBanco(TIERRA4)] },
  { id: 's4-2', asignatura: 'social', curso: 4, desde: '2026-11-02', titulo: 'U2 · The atmosphere and climate', fuente: GT('Social Science 4'), puntos: ['The atmosphere', 'Weather and climate', 'Climographs', 'Climates of Spain'], hacer: [delBanco(CLIMA4), delBanco(CLIMA4), delBanco(TIEMPO)] },

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
  'm3-1': { texto: 'Cada cifra vale según dónde está: unidades, decenas, centenas y, a la izquierda del todo, millares, como cubos de mil perlas.', visual: { tipo: 'perlas', n: 2345 } },
  'm3-2': { texto: 'Se suma y se resta en vertical, de las unidades hacia la izquierda. Si una columna pasa de 9, diez unidades se cambian por una decena. Y 100 céntimos son 1 €.', visual: { tipo: 'columnas', a: 1468, b: 2357, op: '+', resultado: 3825 } },
  'm3-3': { texto: 'Multiplicar es sumar el mismo número muchas veces: 5 filas de 4 cuentas son 5 × 4 = 20. La tabla del 2 es el doble.', visual: { tipo: 'matriz', filas: 5, columnas: 4 } },
  'm3-4': { texto: 'La tabla del 6 es el doble de la del 3, y la del 9 es la del 3 tres veces. Multiplicar por 10, 100 o 1.000 es añadir ceros.', visual: { tipo: 'matriz', filas: 3, columnas: 6 } },
  'm4-1': { texto: 'Con cinco cifras aparecen las decenas de millar: diez cubos de mil. Y los romanos escribían con letras: I, V, X, L, C, D, M.', visual: { tipo: 'perlas', n: 23405 } },
  'm4-2': { texto: 'Da igual el orden de los sumandos (conmutativa) y cómo los agrupes (asociativa): el resultado no cambia.', visual: { tipo: 'columnas', a: 12458, b: 31377, op: '+', resultado: 43835 } },
  'm4-3': { texto: 'Para multiplicar por 20, 300 o 4.000: multiplica sin los ceros y añádelos al final.', visual: { tipo: 'columnas', a: 34, b: 200, op: '×', resultado: 6800 } },
  'm4-4': { texto: 'Perímetro: el borde, sumando lados. Área: lo de dentro, contando cuadraditos.', visual: { tipo: 'rect', a: 5, b: 3, ver: 'area' } },
  'l3-1': { texto: 'Las letras forman sílabas; las sílabas, palabras; las palabras, oraciones. Y en cada palabra hay una sílaba que suena más fuerte: la tónica.', visual: { tipo: 'silabas', silabas: ['ma', 'ri', 'po', 'sa'], tonica: 2 } },
  'l4-1': { texto: 'Primitiva: flor. Derivada: florero (añade un trozo). Compuesta: girasol (gira + sol). Y cada palabra es aguda, llana o esdrújula según su sílaba tónica.', visual: { tipo: 'silabas', silabas: ['mú', 'si', 'ca'], tonica: 0 } },
  'l3-2': { texto: 'Una palabra derivada nace de otra añadiéndole un trozo: flor → florero. Y después de punto, siempre mayúscula.', visual: { tipo: 'letras', palabras: ['flor', 'florero', 'florista'] } },
  'l4-2': { texto: 'Los nombres son comunes o propios, individuales (oveja) o colectivos (rebaño), concretos (mesa) o abstractos (alegría).', visual: { tipo: 'lamina', emoji: '🐑', rotulo: 'oveja → rebaño · mesa · alegría' } },
  'l3-3': { texto: 'Diminutivo: más pequeño (casita). Aumentativo: más grande (casona). Compuesta: dos palabras en una (saca + puntas).', visual: { tipo: 'letras', palabras: ['casita', 'casona', 'sacapuntas'] } },
  'l4-3': { texto: 'El adjetivo dice cómo es el nombre y va a juego con él. Diptongo: dos vocales en la misma sílaba (cie-lo). Hiato: separadas (rí-o).', visual: { tipo: 'gramatica', palabras: [{ p: 'las', clase: 'articulo' }, { p: 'botas', clase: 'nombre' }, { p: 'negras', clase: 'adjetivo' }, { p: 'brillan', clase: 'verbo' }] } },
  'l3-4': { texto: 'El nombre dice quién o qué (▲ negro). Las preguntas van entre ¿? y las exclamaciones entre ¡!', visual: { tipo: 'gramatica', palabras: [{ p: 'el', clase: 'articulo' }, { p: 'tigre', clase: 'nombre' }, { p: 'rápido', clase: 'adjetivo' }, { p: 'corre', clase: 'verbo' }] } },
  'l4-4': { texto: 'Los determinantes van delante del nombre: artículos (el, una) y demostrativos, que señalan lo cerca que está (este, ese, aquel).', visual: { tipo: 'lamina', emoji: '👉', rotulo: 'este (aquí) · ese (ahí) · aquel (allí)' } },
  'n3-1': { texto: 'Scientists ask a question, make a hypothesis, do an experiment, collect data and write a conclusion.', visual: { tipo: 'lamina', emoji: '🔬', rotulo: 'question → hypothesis → experiment → data → conclusion' } },
  'n4-1': { texto: 'All living things are made of cells: membrane, cytoplasm and nucleus. Plants make their own food with sunlight.', visual: { tipo: 'lamina', emoji: '🦠', rotulo: 'membrane · cytoplasm · nucleus' } },
  'n3-2': { texto: 'Living things feed, interact and reproduce. Vertebrates have a backbone; invertebrates do not. Plants make their food in their leaves.', visual: { tipo: 'lamina', emoji: '🐸', rotulo: 'mammals · birds · fish · reptiles · amphibians' } },
  'n4-2': { texto: 'Animals are herbivores, carnivores or omnivores, and oviparous or viviparous. Humans do the three vital functions too.', visual: { tipo: 'lamina', emoji: '🦁', rotulo: 'herbivore · carnivore · omnivore' } },
  's3-1': { texto: 'A plan shows a small place from above; a map, a big one. North, south, east, west: the Sun rises in the east.', visual: { tipo: 'rosa' } },
  's4-1': { texto: 'The Earth spins (rotation: day and night) and travels around the Sun (revolution: one year). Its tilt makes the seasons.', visual: { tipo: 'planetas' } },
  's3-2': { texto: 'Landscapes can be natural or humanised. Inland: mountains, valleys, plains. On the coast: beaches, cliffs, capes and gulfs.', visual: { tipo: 'lamina', emoji: '🏞️', rotulo: 'plain · valley · mountain · cliff · cape · gulf' } },
  's4-2': { texto: 'Weather is today; climate is what usually happens. Latitude, altitude and the sea change the climate.', visual: { tipo: 'lamina', emoji: '🌦️', rotulo: 'weather · climate · climograph' } },
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
