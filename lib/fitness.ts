import { entryKey } from '@/lib/storage';
import type { DateKey, DayEntry, ProfileId } from '@/types';

/* =========================================================================
 *  Las pruebas físicas periódicas.
 *
 *  Cada cierto tiempo les miden en RX2: talla, peso, longitud de piernas,
 *  un salto en plataforma de fuerza (CMJ, Hawkin Dynamics) y un esprint con
 *  1080 Sprint. Eso, repetido cada pocos meses desde 2024, es lo único que
 *  cuenta de verdad cómo van creciendo y cómo va cambiando su manera de
 *  correr y de saltar. El GPS dice lo que hacen en los partidos; esto dice
 *  de qué están hechos.
 *
 *  **Aquí no hay ninguna cifra de nadie.** Sólo el molde: qué campos tiene
 *  una prueba, cómo se guarda y qué se deduce de ella. Los números de Leo y
 *  de Hugo viven donde vive el resto de lo suyo —en el aparato y en su
 *  cuenta de Supabase—, porque este repositorio es público. Los informes en
 *  PDF tampoco entran: se leen en el navegador y se tiran.
 *
 *  Una prueba puede venir incompleta y no pasa nada: lo que falta se queda
 *  vacío y el informe lo dice. Un cero inventado estropearía justo la
 *  comparación que se busca.
 * ========================================================================= */

/** De dónde sale la medición, para no mezclar aparatos al comparar. */
export type FitnessSource = 'rx2' | 'casa' | 'club' | 'otro';

export const SOURCE_LABEL: Record<FitnessSource, string> = {
  rx2: 'RX2',
  casa: 'En casa',
  club: 'En el club',
  otro: 'Otro',
};

/**
 * Una prueba física en una fecha.
 *
 * Los nombres van en castellano salvo los de la plataforma de fuerza, que
 * se dejan como los escribe el aparato —`jumpHeight`, `peakBrakingForce`—
 * para que quien mire el informe de Hawkin encuentre lo mismo escrito
 * igual.
 */
export interface FitnessTest {
  id: string;
  profileId: ProfileId;
  date: DateKey;
  source: FitnessSource;

  /* -- Estructura -- */
  /** Talla, en centímetros. */
  height?: number;
  /** Peso, en kilos. */
  weight?: number;
  /** Longitud de piernas, en centímetros. */
  legLength?: number;
  /** Talla sentado, en centímetros, si la dan. */
  sittingHeight?: number;
  /** La edad que tenía ese día, en años decimales. Suele venir en el informe. */
  age?: number;
  /** La edad biológica estimada que dé el informe, en años. */
  bioAge?: number;
  /** La edad de pico de velocidad de crecimiento que estime el informe. */
  phvAge?: number;

  /* -- Salto vertical (CMJ en plataforma de fuerza) -- */
  /** Altura del salto, en metros. */
  jumpHeight?: number;
  /** Pico de fuerza de frenada, en newtons. */
  peakBraking?: number;
  /** Pico de fuerza de impulso, en newtons. */
  peakPropulsive?: number;
  /** Lo que tarda desde que empieza a bajar hasta que despega, en segundos. */
  takeOff?: number;

  /* -- Esprint -- */
  /** Tiempo en 20 metros, en segundos. */
  sprint20?: number;
  /** Velocidad máxima alcanzada, en km/h. */
  topSpeed?: number;

  /** Lo que hubiera que recordar de ese día. */
  note?: string;
  updatedAt: string;
}

/** Los campos numéricos, con su nombre, su unidad y hacia dónde es mejor. */
export type FitnessFieldId =
  | 'height'
  | 'weight'
  | 'legLength'
  | 'sittingHeight'
  | 'bioAge'
  | 'phvAge'
  | 'jumpHeight'
  | 'peakBraking'
  | 'peakPropulsive'
  | 'takeOff'
  | 'sprint20'
  | 'topSpeed';

export interface FitnessField {
  id: FitnessFieldId;
  label: string;
  short: string;
  unit: string;
  /** El grupo con el que se enseña. */
  group: 'estructura' | 'salto' | 'sprint';
  /** `+` mejor cuanto más alto, `-` mejor cuanto más bajo, `0` ni una cosa ni otra. */
  better: '+' | '-' | '0';
  /** Cuántos decimales tiene sentido enseñar. */
  decimals: number;
  /** Qué es, en una línea, para quien no lo haya visto nunca. */
  blurb: string;
}

export const FITNESS_FIELDS: FitnessField[] = [
  {
    id: 'height',
    label: 'Altura',
    short: 'Altura',
    unit: 'cm',
    group: 'estructura',
    better: '0',
    decimals: 1,
    blurb: 'Lo que mide de pie. Ni bueno ni malo: es el reloj con el que se leen las demás.',
  },
  {
    id: 'weight',
    label: 'Peso',
    short: 'Peso',
    unit: 'kg',
    group: 'estructura',
    better: '0',
    decimals: 1,
    blurb: 'Lo que pesa. Sólo dice algo puesto al lado de la altura.',
  },
  {
    id: 'legLength',
    label: 'Longitud de piernas',
    short: 'Piernas',
    unit: 'cm',
    group: 'estructura',
    better: '0',
    decimals: 1,
    blurb: 'De la cadera al suelo. Entra en la fórmula de la edad biológica y avisa del estirón.',
  },
  {
    id: 'sittingHeight',
    label: 'Talla sentado',
    short: 'Sentado',
    unit: 'cm',
    group: 'estructura',
    better: '0',
    decimals: 1,
    blurb: 'Lo que mide sentado: el tronco. Con las piernas dice por dónde está creciendo.',
  },
  {
    id: 'bioAge',
    label: 'Edad biológica estimada',
    short: 'Edad bio.',
    unit: 'años',
    group: 'estructura',
    better: '0',
    decimals: 2,
    blurb: 'Por dónde va su cuerpo, que no tiene por qué ir con el carné.',
  },
  {
    id: 'phvAge',
    label: 'Edad del pico de crecimiento',
    short: 'PVC',
    unit: 'años',
    group: 'estructura',
    better: '0',
    decimals: 1,
    blurb: 'Cuándo se estima que le tocará el estirón grande.',
  },
  {
    id: 'jumpHeight',
    label: 'Altura de salto (CMJ)',
    short: 'Salto',
    unit: 'm',
    group: 'salto',
    better: '+',
    decimals: 2,
    blurb: 'Lo que se despega del suelo saltando con las dos piernas y sin carrerilla.',
  },
  {
    id: 'peakBraking',
    label: 'Pico de fuerza de frenada',
    short: 'Frenada',
    unit: 'N',
    group: 'salto',
    better: '+',
    decimals: 0,
    blurb: 'Lo fuerte que frena al bajar antes de saltar. Es la parte que aguanta.',
  },
  {
    id: 'peakPropulsive',
    label: 'Pico de fuerza de impulso',
    short: 'Impulso',
    unit: 'N',
    group: 'salto',
    better: '+',
    decimals: 0,
    blurb: 'Lo fuerte que empuja contra el suelo para subir.',
  },
  {
    id: 'takeOff',
    label: 'Tiempo hasta el despegue',
    short: 'Despegue',
    unit: 's',
    group: 'salto',
    better: '-',
    decimals: 2,
    blurb: 'Lo que tarda desde que empieza a bajar hasta que sale. Cuanto menos, más explosivo.',
  },
  {
    id: 'sprint20',
    label: 'Tiempo en 20 m',
    short: '20 m',
    unit: 's',
    group: 'sprint',
    better: '-',
    decimals: 2,
    blurb: 'Salida parada y veinte metros. Mide sobre todo la aceleración.',
  },
  {
    id: 'topSpeed',
    label: 'Velocidad máxima',
    short: 'V. máx.',
    unit: 'km/h',
    group: 'sprint',
    better: '+',
    decimals: 2,
    blurb: 'Lo más rápido que llegó a ir en ese esprint.',
  },
];

export const FIELD_BY_ID = new Map(FITNESS_FIELDS.map((field) => [field.id, field]));

export const GROUP_LABEL: Record<FitnessField['group'], string> = {
  estructura: 'Estructura',
  salto: 'Salto vertical',
  sprint: 'Esprint',
};

/** Con cuántos decimales se enseña un valor. */
export function formatValue(id: FitnessFieldId, value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const field = FIELD_BY_ID.get(id);
  return value.toFixed(field?.decimals ?? 1).replace('.', ',');
}

/* ---------------------------------------------------------------------------
 * Lo que se deduce de una prueba
 *
 * Ninguna de estas cuentas es una opinión: son definiciones. El índice de
 * masa corporal es peso entre altura al cuadrado y punto; la fuerza relativa
 * es fuerza entre peso. Se calculan aquí, una sola vez, para que el informe
 * y la auditoría no puedan discrepar entre ellos.
 * ------------------------------------------------------------------------- */

export interface Derived {
  /** Índice de masa corporal, en kg/m². */
  bmi?: number;
  /** Lo que mide de piernas sobre lo que mide de alto, en tanto por ciento. */
  legRatio?: number;
  /** Fuerza de impulso por kilo, en newtons por kilo. */
  propulsivePerKg?: number;
  /** Y en veces su propio peso, que es como se lee en la literatura. */
  propulsiveBw?: number;
  /** Lo mismo con la frenada. */
  brakingPerKg?: number;
  brakingBw?: number;
  /**
   * Salto por tiempo de despegue, en metros por segundo: una versión del
   * índice de fuerza reactiva modificado (RSImod) que se puede calcular con
   * lo que trae el informe. Sube tanto saltando más como saltando antes.
   */
  rsiMod?: number;
  /** Velocidad media en los 20 m, en km/h. */
  meanSpeed20?: number;
  /** Cuánto de su velocidad máxima ha sacado en los 20 m, en tanto por ciento. */
  speedUse?: number;
  /** Los meses que le faltan al pico de crecimiento, si el informe lo estima. */
  monthsToPhv?: number;
  /** La diferencia entre su edad biológica y la del carné, en años. */
  bioGap?: number;
}

export function derive(test: FitnessTest): Derived {
  const out: Derived = {};

  if (test.height && test.weight) {
    const m = test.height / 100;
    out.bmi = test.weight / (m * m);
  }
  if (test.height && test.legLength) out.legRatio = (test.legLength / test.height) * 100;

  if (test.weight) {
    const newtons = test.weight * 9.81;
    if (test.peakPropulsive) {
      out.propulsivePerKg = test.peakPropulsive / test.weight;
      out.propulsiveBw = test.peakPropulsive / newtons;
    }
    if (test.peakBraking) {
      out.brakingPerKg = test.peakBraking / test.weight;
      out.brakingBw = test.peakBraking / newtons;
    }
  }

  if (test.jumpHeight && test.takeOff) out.rsiMod = test.jumpHeight / test.takeOff;

  if (test.sprint20) out.meanSpeed20 = (20 / test.sprint20) * 3.6;
  if (out.meanSpeed20 && test.topSpeed) out.speedUse = (out.meanSpeed20 / test.topSpeed) * 100;

  if (test.age && test.phvAge) out.monthsToPhv = (test.phvAge - test.age) * 12;
  if (test.age && test.bioAge) out.bioGap = test.bioAge - test.age;

  return out;
}

/* ---------------------------------------------------------------------------
 * La evolución entre dos pruebas
 * ------------------------------------------------------------------------- */

export interface Change {
  field: FitnessFieldId;
  from: number;
  to: number;
  /** La diferencia, en las unidades del campo. */
  delta: number;
  /** Y en tanto por ciento. */
  percent: number;
  /** Si ha ido a mejor, teniendo en cuenta hacia dónde es mejor ese campo. */
  better: boolean | null;
  /** Meses entre las dos pruebas. */
  months: number;
  /** Lo mismo, llevado a un año, para poder comparar tramos desiguales. */
  perYear: number;
}

/** Los meses entre dos fechas, con decimales. */
export function monthsBetween(from: DateKey, to: DateKey): number {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
}

export function compare(before: FitnessTest, after: FitnessTest, field: FitnessFieldId): Change | null {
  const from = before[field];
  const to = after[field];
  if (typeof from !== 'number' || typeof to !== 'number' || from === 0) return null;

  const meta = FIELD_BY_ID.get(field);
  const delta = to - from;
  const months = Math.max(0.1, monthsBetween(before.date, after.date));

  return {
    field,
    from,
    to,
    delta,
    percent: (delta / from) * 100,
    better: meta?.better === '+' ? delta > 0 : meta?.better === '-' ? delta < 0 : null,
    months,
    perYear: (delta / months) * 12,
  };
}

/* ---------------------------------------------------------------------------
 * Lo que se guarda
 *
 * Una prueba es **una línea en las notas de su día**, igual que la tanda de
 * penaltis o la partida del juego, y por la misma razón: cabe en lo que ya
 * viaja a la nube, así que no hace falta ni una tabla nueva ni un camino de
 * sincronización nuevo. Si un día hubo prueba, ese día lo dice.
 *
 * El formato es `campo=valor` separado por punto y coma, y no posicional: un
 * informe que mañana traiga una métrica más no rompe los de ayer.
 * ------------------------------------------------------------------------- */

/** Clave con la que una prueba se anota en las notas del día. */
export const FITNESS_NOTE_KEY = 'prueba';

export function encodeTest(test: FitnessTest): string {
  const partes: string[] = [`o=${test.source}`];
  for (const field of FITNESS_FIELDS) {
    const value = test[field.id];
    if (typeof value === 'number' && Number.isFinite(value)) partes.push(`${field.id}=${value}`);
  }
  if (test.age) partes.push(`age=${test.age}`);
  if (test.note) partes.push(`n=${test.note.replace(/[;=]/g, ' ')}`);
  return partes.join(';');
}

export function parseTest(text: string | undefined | null, profileId: ProfileId, date: DateKey): FitnessTest | null {
  if (!text) return null;
  const test: FitnessTest = { ...emptyTest(profileId, date) };

  for (const trozo of text.split(';')) {
    const [clave, ...resto] = trozo.split('=');
    const valor = resto.join('=');
    if (!clave || valor === undefined) continue;

    if (clave === 'o') {
      const fuente = valor as FitnessSource;
      if (fuente in SOURCE_LABEL) test.source = fuente;
      continue;
    }
    if (clave === 'n') {
      test.note = valor;
      continue;
    }
    if (clave === 'age') {
      const edad = Number(valor);
      if (Number.isFinite(edad)) test.age = edad;
      continue;
    }
    if (FIELD_BY_ID.has(clave as FitnessFieldId)) {
      const numero = Number(valor);
      if (Number.isFinite(numero)) test[clave as FitnessFieldId] = numero;
    }
  }

  test.id = testId(profileId, date, test.source);
  return hasData(test) ? test : null;
}

/** Todas las pruebas de un peque, leídas de sus días. */
export function testsFor(entries: Record<string, DayEntry>, profileId: ProfileId): FitnessTest[] {
  const out: FitnessTest[] = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (!key.startsWith(`${profileId}:`)) continue;
    const linea = entry.notes?.[FITNESS_NOTE_KEY];
    const test = parseTest(linea, profileId, entry.date);
    if (test) out.push(test);
  }
  return newestFirst(out);
}

/** La clave del día en que se guarda una prueba. */
export function keyOf(profileId: ProfileId, date: DateKey): string {
  return entryKey(profileId, date);
}

/** Tope de pruebas por perfil. Una cada tres meses durante diez años cabe. */
export const MAX_TESTS = 80;

/** Un identificador estable para una prueba: el mismo día y origen no entra dos veces. */
export function testId(profileId: ProfileId, date: DateKey, source: FitnessSource): string {
  return `${profileId}:${date}:${source}`;
}

/** Ordenadas de la más reciente a la más antigua. */
export function newestFirst(tests: FitnessTest[]): FitnessTest[] {
  return [...tests].sort((a, b) => b.date.localeCompare(a.date));
}

/** Y al revés, que es como se lee una evolución. */
export function oldestFirst(tests: FitnessTest[]): FitnessTest[] {
  return [...tests].sort((a, b) => a.date.localeCompare(b.date));
}

/** La última prueba que trae ese campo, que no siempre es la última prueba. */
export function lastWith(tests: FitnessTest[], field: FitnessFieldId): FitnessTest | null {
  for (const test of newestFirst(tests)) {
    if (typeof test[field] === 'number') return test;
  }
  return null;
}

/**
 * La edad que tenía en una prueba. Si el informe la trae, ésa; si no, se
 * deduce de la que sí trae alguna otra prueba, que son del mismo niño.
 */
export function ageAt(test: FitnessTest, all: FitnessTest[]): number | undefined {
  if (test.age) return test.age;
  const ref = all.find((other) => other.age);
  if (!ref?.age) return undefined;
  return ref.age + monthsBetween(ref.date, test.date) / 12;
}

/** Una prueba vacía, para el formulario. */
export function emptyTest(profileId: ProfileId, date: DateKey): FitnessTest {
  return { id: testId(profileId, date, 'rx2'), profileId, date, source: 'rx2', updatedAt: new Date().toISOString() };
}

/** Si una prueba trae algo que merezca la pena guardar. */
export function hasData(test: FitnessTest): boolean {
  return FITNESS_FIELDS.some((field) => typeof test[field.id] === 'number');
}
