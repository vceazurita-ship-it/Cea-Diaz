import { hashSeed } from '@/lib/challenges';
import { entryKey } from '@/lib/storage';
import type { DateKey, DayEntry, PenaltyResult, ProfileId } from '@/types';

/* =========================================================================
 *  La tanda de penaltis.
 *
 *  Es el premio del pleno. Las cinco preguntas del juego del día acertadas
 *  —las cinco, no cuatro— abren una tanda de cinco penaltis, y ésa es toda
 *  la relación entre las dos cosas: el juego se gana contestando y el
 *  penalti se tira. No da cromos ni puntos. Se gana el derecho a tirar, que
 *  a los ocho años es exactamente el premio que uno quiere.
 *
 *  Tirar bien un penalti es elegir dos cosas: **dónde** y **con cuánta
 *  fuerza**. Por eso el juego son esas dos, y no un sorteo con botones:
 *
 *   · **Dónde.** Seis sitios: arriba y abajo, por los dos palos y por el
 *     centro. El portero se tira a uno de los seis, decidido de antemano —no
 *     al ver el tiro—, así que acertar el sitio es acertar el hueco.
 *
 *   · **Con cuánta fuerza.** Una barra que sube y baja sola y hay que parar
 *     en su franja buena. Pasarse es mandarla fuera; quedarse corto es un
 *     tiro blando que el portero alcanza si se ha tirado a ese lado, aunque
 *     no haya acertado la altura. Es la lección entera del penalti en una
 *     regla: el sitio no salva un tiro flojo.
 *
 *  El portero de cada tiro sale de una semilla hecha con el perfil, el día y
 *  el número de tiro, igual que las preguntas del juego. Y por la misma
 *  razón: cerrar la aplicación y volver a abrirla no cambia adónde se tira
 *  ni regala un penalti más. Cada tiro se anota en cuanto se ejecuta, así
 *  que un penalti fallado es un penalti fallado.
 * ========================================================================= */

/** Clave con la que la tanda se anota en las notas del día. */
export const PENALTY_NOTE_KEY = 'penaltis';

/** Penaltis de una tanda. */
export const PENALTY_SHOTS = 5;

/* ---------------------------------------------------------------------------
 * La portería
 * ------------------------------------------------------------------------- */

export type PenaltyZoneId = 'ai' | 'ac' | 'ad' | 'bi' | 'bc' | 'bd';

export interface PenaltyZone {
  id: PenaltyZoneId;
  /** Cómo se dice en voz alta. */
  label: string;
  /** La flecha de la casilla. */
  arrow: string;
  /** Centro de la zona, en tanto por ciento de la portería. */
  x: number;
  y: number;
  /** Por qué palo cae, para saber si el portero se ha tirado a ese lado. */
  side: 'izquierda' | 'centro' | 'derecha';
  /** A qué altura, que es lo que decide si un tiro blando llega o no. */
  height: 'arriba' | 'abajo';
}

/**
 * Las seis zonas, en el orden en que se leen: la fila de arriba de izquierda
 * a derecha y luego la de abajo. Es catálogo editable como todo lo demás: una
 * portería de nueve casillas sería añadir tres objetos aquí.
 *
 * La izquierda y la derecha son las del que mira la portería —las del que
 * tira—, que es lo que se ve en la pantalla.
 */
export const PENALTY_ZONES: PenaltyZone[] = [
  { id: 'ai', label: 'a la escuadra izquierda', arrow: '↖', x: 20, y: 30, side: 'izquierda', height: 'arriba' },
  { id: 'ac', label: 'arriba por el centro', arrow: '↑', x: 50, y: 30, side: 'centro', height: 'arriba' },
  { id: 'ad', label: 'a la escuadra derecha', arrow: '↗', x: 80, y: 30, side: 'derecha', height: 'arriba' },
  { id: 'bi', label: 'abajo al palo izquierdo', arrow: '↙', x: 20, y: 68, side: 'izquierda', height: 'abajo' },
  { id: 'bc', label: 'abajo por el centro', arrow: '↓', x: 50, y: 68, side: 'centro', height: 'abajo' },
  { id: 'bd', label: 'abajo al palo derecho', arrow: '↘', x: 80, y: 68, side: 'derecha', height: 'abajo' },
];

const ZONE_BY_ID = new Map(PENALTY_ZONES.map((zone) => [zone.id, zone]));

export function zoneOf(id: PenaltyZoneId): PenaltyZone {
  return ZONE_BY_ID.get(id)!;
}

/* ---------------------------------------------------------------------------
 * La fuerza
 * ------------------------------------------------------------------------- */

/**
 * La franja buena de la barra de potencia, de 0 a 100.
 *
 * Es ancha a propósito —cuarenta y tres de cada cien— porque esto no es un
 * juego de reflejos: lo que tiene que decidir la tanda es dónde se tira, y la
 * barra está para que no se pueda tirar sin pensar en la fuerza. Pasarse es
 * lo único que se castiga sin remedio, que es justo lo que pasa en un campo.
 */
export const POWER_GOOD: [number, number] = [45, 88];

/* ---------------------------------------------------------------------------
 * El portero
 * ------------------------------------------------------------------------- */

/**
 * Adónde se tira el portero en ese penalti. Se decide con la semilla del
 * perfil, el día y el número de tiro: siempre el mismo, se recargue lo que se
 * recargue, y distinto para Leo y para Hugo el mismo día.
 */
export function keeperZone(profileId: ProfileId, date: DateKey, shot: number): PenaltyZoneId {
  const seed = hashSeed(`${profileId}:penaltis:${date}:${shot}`);
  return PENALTY_ZONES[seed % PENALTY_ZONES.length].id;
}

/* ---------------------------------------------------------------------------
 * Qué pasa con el tiro
 * ------------------------------------------------------------------------- */

export type PenaltyOutcome = 'gol' | 'parada' | 'fuera';

export interface PenaltyShot {
  outcome: PenaltyOutcome;
  /** Por qué ha acabado así, para decirlo y que se aprenda algo. */
  why: string;
}

/**
 * Las cuatro reglas, en el orden en que mandan:
 *
 *  1. pasarse de fuerza es mandarla por encima del larguero, tires donde
 *     tires: el sitio no arregla un tiro descontrolado;
 *  2. si el portero está en tu zona, la para;
 *  3. un tiro blando lo alcanza si se ha tirado a tu mismo lado, aunque haya
 *     errado la altura, porque le da tiempo a estirarse;
 *  4. y si no, gol.
 */
export function resolveShot(
  zoneId: PenaltyZoneId,
  power: number,
  keeperId: PenaltyZoneId,
): PenaltyShot {
  const zone = zoneOf(zoneId);
  const keeper = zoneOf(keeperId);
  const [low, high] = POWER_GOOD;

  if (power > high) {
    return {
      outcome: 'fuera',
      why: 'Demasiada fuerza: se te ha ido por encima del larguero. El penalti se coloca, no se revienta.',
    };
  }

  if (keeperId === zoneId) {
    return {
      outcome: 'parada',
      why: `El portero se ha tirado justo ahí, ${zone.label}. Mala suerte: el sitio era bueno, estaba él.`,
    };
  }

  if (power < low && keeper.side === zone.side) {
    return {
      outcome: 'parada',
      why: `Tiro blando y al mismo lado al que se tiraba: le ha dado tiempo a estirarse y llegar ${zone.label}.`,
    };
  }

  if (power < low) {
    return {
      outcome: 'gol',
      why: `¡Gol! Flojito, pero el portero se fue ${keeper.label} y no llegaba ni queriendo.`,
    };
  }

  return {
    outcome: 'gol',
    why: `¡Gol! Tú ${zone.label} y él ${keeper.label}. Bien elegido y bien golpeado.`,
  };
}

/* ---------------------------------------------------------------------------
 * Lo que se guarda
 *
 * Igual que la partida del juego: una línea en las notas del día, con el mismo
 * formato —`goles|tirados|total|momento`— y por la misma razón. Cabe en lo que
 * ya viaja a la nube, así que la tanda no necesita ninguna tabla nueva.
 * ------------------------------------------------------------------------- */

export function encodePenaltyResult(result: PenaltyResult): string {
  return [result.scored, result.taken, result.total, result.at].join('|');
}

export function parsePenaltyResult(text: string | undefined | null): PenaltyResult | null {
  if (!text) return null;

  const [scored, taken, total, at] = text.split('|');
  const numbers = [scored, taken, total].map(Number);
  if (numbers.some((value) => !Number.isFinite(value)) || numbers[2] <= 0) return null;

  return {
    scored: Math.max(0, Math.min(numbers[0], numbers[2])),
    taken: Math.max(0, Math.min(numbers[1], numbers[2])),
    total: numbers[2],
    at: at ?? '',
  };
}

/** La tanda anotada ese día, si la hubo. */
export function penaltyResultFor(
  entries: Record<string, DayEntry>,
  profileId: ProfileId,
  date: DateKey,
): PenaltyResult | null {
  return parsePenaltyResult(entries[entryKey(profileId, date)]?.notes?.[PENALTY_NOTE_KEY]);
}

/** ¿Tirados los cinco? */
export function isPenaltyDone(result: PenaltyResult): boolean {
  return result.taken >= result.total;
}

/** Cómo se llama una tanda según cómo haya salido. */
export function penaltyVerdict(scored: number, total: number): string {
  if (scored === total) return '¡Los cinco dentro! Tanda perfecta.';
  if (scored >= total - 1) return 'Gran tanda: así se gana una final.';
  if (scored >= Math.ceil(total / 2)) return 'Más dentro que fuera. Se puede pedir la bola otra vez.';
  if (scored > 0) return 'Se ha resistido el portero. Mañana hay otro pleno que ganar.';
  return 'Tanda para olvidar. Al menos el pleno de las preguntas no te lo quita nadie.';
}
