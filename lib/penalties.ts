import { hashSeed } from '@/lib/challenges';
import { entryKey } from '@/lib/storage';
import type { DateKey, DayEntry, PenaltyResult, ProfileId } from '@/types';

/* =========================================================================
 *  La tanda de penaltis.
 *
 *  Es el premio del día bien hecho, y se gana con **dos cosas a la vez**:
 *  acertar al menos tres de las cinco preguntas del juego del día y llevar
 *  hecho más del 60 % del día. Las dos, no una: las preguntas se pueden
 *  acertar sentado en el sofá, y el día por su cuenta no tiene nada que ver
 *  con el fútbol. Juntas dicen lo que se quiere premiar —ha hecho lo suyo y
 *  además ha pensado—, y ésa es toda la relación entre las tres cosas. La
 *  tanda no da cromos ni puntos: da el derecho a tirar, que a los ocho años
 *  es exactamente el premio que uno quiere.
 *
 *  Antes hacía falta el pleno, y era demasiado. Cinco de cinco cae una vez
 *  por semana con suerte, así que el premio no existía en la práctica: el
 *  crío no llegaba a saber que estaba ahí.
 *
 *  Y aparte de ganarse, **se puede dar**: quien lleva la casa la abre a mano
 *  desde los ajustes (⚙️ → 🎮 Juegos) y entonces la tanda está y no hay que
 *  explicar por qué. Un cumpleaños, una tarde regular, o querer verle jugar.
 *
 *  Está montado como el penalti de un videojuego de fútbol, y no como un
 *  sorteo con botones, porque la gracia está en las tres cosas que hay que
 *  hacer bien y que son las tres del penalti de verdad:
 *
 *   1. **Leer al portero.** Antes de tirar, el portero **se coloca**: se
 *      carga hacia el lado por el que va a volar. No es una trampa ni un
 *      adorno, es la habilidad principal del juego —mirar dónde se pone y
 *      tirar al otro lado—, y es justo lo que se le dice a un crío desde la
 *      banda. El aviso da el lado, nunca la altura.
 *
 *   2. **Colocar el tiro.** La puntería es libre: la mira se mueve por toda
 *      la portería, no hay seis botones y ya. Cuanto más lejos del portero
 *      caiga el balón, mejor; pero pegarse al palo o al larguero se paga.
 *
 *   3. **Medir la fuerza.** Se mantiene pulsado y se suelta. Pasarse hace
 *      que el balón **se suba y se abra** —cuanto más pasado, más— y por eso
 *      un tiro a la escuadra reventado se va fuera y el mismo tiro medido
 *      entra. Quedarse corto le da tiempo al portero a llegar a casi media
 *      portería.
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
 * Quién puede tirar
 * ------------------------------------------------------------------------- */

/** Aciertos que hay que llevar en el juego del día. */
export const PENALTY_MIN_CORRECT = 3;

/**
 * Y cuánto del día hay que llevar hecho: **más** de esto, no esto mismo. Es
 * el mismo 60 % con el que un día cuenta para la racha, y no por casualidad:
 * lo que se premia es el día que cuenta.
 */
export const PENALTY_MIN_DAY = 0.6;

/** Si la tanda está abierta, y qué falta cuando no lo está. */
export interface PenaltyGate {
  open: boolean;
  /** `true` cuando está abierta porque la han abierto a mano, no ganada. */
  granted: boolean;
  /** Las dos condiciones, cada una con lo suyo hecho y su tope. */
  parts: { label: string; done: boolean; detail: string }[];
}

/**
 * La puerta de la tanda.
 *
 * Devuelve las dos condiciones por separado y no un sí o un no, porque lo
 * que hace falta es **decir qué falta**: «te faltan dos preguntas» es un
 * motivo para volver a intentarlo, y «todavía no» no es nada.
 *
 * El porcentaje del día se recibe hecho —lo calcula `computeDayScore`— para
 * que este módulo siga sin saber nada de hábitos ni de categorías.
 */
export function penaltyGate(opts: {
  correct: number;
  total: number;
  dayRatio: number;
  /** `true` si quien lleva la casa la ha abierto para este perfil. */
  granted: boolean;
}): PenaltyGate {
  const { correct, total, dayRatio, granted } = opts;

  const needed = Math.min(PENALTY_MIN_CORRECT, total);
  const quiz = correct >= needed;
  const day = dayRatio > PENALTY_MIN_DAY;

  return {
    open: granted || (quiz && day),
    granted: granted && !(quiz && day),
    parts: [
      {
        label: `Acertar ${needed} preguntas`,
        done: quiz,
        detail: `llevas ${correct} de ${total}`,
      },
      {
        label: `Pasar del ${Math.round(PENALTY_MIN_DAY * 100)} % del día`,
        done: day,
        detail: `vas por el ${Math.round(dayRatio * 100)} %`,
      },
    ],
  };
}

/* ---------------------------------------------------------------------------
 * La portería
 *
 * Todo lo que ocurre dentro de la portería se mide en **tanto por ciento de
 * la boca**: 0 es el palo izquierdo y 100 el derecho, 0 el larguero y 100 la
 * línea de gol. Así el mismo número vale para la pantalla del móvil y para la
 * del portátil, y las reglas no dependen de cuántos píxeles mida nada.
 * ------------------------------------------------------------------------- */

/** Un punto de la portería: dónde apunta uno, dónde vuela el portero. */
export interface PenaltyAim {
  x: number;
  y: number;
}

export type PenaltyZoneId = 'ai' | 'ac' | 'ad' | 'bi' | 'bc' | 'bd';

export interface PenaltyZone {
  id: PenaltyZoneId;
  /** Cómo se dice en voz alta. */
  label: string;
  /** La flecha del botón de puntería rápida. */
  arrow: string;
  /** Centro de la zona. */
  x: number;
  y: number;
  /** Por qué palo cae. Es lo único que el portero deja ver antes de tirar. */
  side: PenaltySide;
  /** A qué altura. */
  height: 'arriba' | 'abajo';
}

export type PenaltySide = 'izquierda' | 'centro' | 'derecha';

/**
 * Las seis zonas. Ya no son las únicas posiciones posibles —la puntería es
 * libre— pero siguen haciendo dos trabajos: son los seis sitios a los que
 * puede volar el portero, y son los botones de puntería rápida, que es lo
 * que hace que esto se pueda jugar con el teclado y con un dedo gordo.
 *
 * La izquierda y la derecha son las del que mira la portería —las del que
 * tira—, que es lo que se ve en la pantalla.
 */
export const PENALTY_ZONES: PenaltyZone[] = [
  { id: 'ai', label: 'a la escuadra izquierda', arrow: '↖', x: 16, y: 26, side: 'izquierda', height: 'arriba' },
  { id: 'ac', label: 'arriba por el centro', arrow: '↑', x: 50, y: 22, side: 'centro', height: 'arriba' },
  { id: 'ad', label: 'a la escuadra derecha', arrow: '↗', x: 84, y: 26, side: 'derecha', height: 'arriba' },
  { id: 'bi', label: 'abajo al palo izquierdo', arrow: '↙', x: 16, y: 74, side: 'izquierda', height: 'abajo' },
  { id: 'bc', label: 'abajo por el centro', arrow: '↓', x: 50, y: 78, side: 'centro', height: 'abajo' },
  { id: 'bd', label: 'abajo al palo derecho', arrow: '↘', x: 84, y: 74, side: 'derecha', height: 'abajo' },
];

const ZONE_BY_ID = new Map(PENALTY_ZONES.map((zone) => [zone.id, zone]));

export function zoneOf(id: PenaltyZoneId): PenaltyZone {
  return ZONE_BY_ID.get(id)!;
}

/**
 * Una portería es tres veces más ancha que alta, pero aquí los dos lados van
 * de 0 a 100. Al medir distancias hay que deshacer esa mentira, o subir el
 * balón medio metro contaría lo mismo que cruzarlo dos metros.
 *
 * No es el 0,33 exacto de la geometría sino algo más: para un portero de
 * ocho años la altura cuesta un poco más de lo que dice la regla, y el juego
 * tiene que premiar el tiro alto, que es el que de verdad no se para.
 */
const ALTO_SOBRE_ANCHO = 0.45;

/** Distancia entre dos puntos de la portería, ya corregida. */
function reach(from: PenaltyAim, to: PenaltyAim): number {
  const dx = from.x - to.x;
  const dy = (from.y - to.y) * ALTO_SOBRE_ANCHO;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Lo que alcanza el portero volando bien. */
const ALCANCE = 34;

/** Lo que alcanza si el balón va blando: le sobra tiempo. */
const ALCANCE_BLANDO = 50;

/** Y lo que alcanza contra el especial: un brazo, y con suerte. */
const ALCANCE_SUPER = 15;

/** Margen del palo y del larguero. Rozarlo es mala suerte, no mal tiro. */
const MADERA = 5;

/* ---------------------------------------------------------------------------
 * La fuerza
 * ------------------------------------------------------------------------- */

/**
 * La franja buena de la barra de potencia, de 0 a 100.
 *
 * Es ancha a propósito —cuarenta y tres de cada cien— porque esto no es un
 * juego de reflejos: lo que tiene que decidir la tanda es dónde se tira y si
 * se ha leído bien al portero. La barra está para que no se pueda tirar sin
 * pensar en la fuerza, no para que la tanda la gane el que tenga mejor pulso.
 */
export const POWER_GOOD: [number, number] = [45, 88];

/**
 * Y la franja del tiro especial: estrecha, arriba y a propósito.
 *
 * El especial no es un botón de ganar. Cambia el trato: el portero casi no
 * llega, pero hay que pegarle fuerte y clavado, y pasarse de ahí revienta el
 * balón como en cualquier otro tiro. Un especial mal medido se va a las
 * nubes, y eso es lo que hace que valga la pena guardárselo.
 */
export const POWER_SUPER: [number, number] = [70, 94];

/** Goles que hay que llevar en la tanda para que se cargue el especial. */
export const SUPER_FROM = 2;

/** Uno por tanda, y se dice con su nombre. */
export const SUPER_NAME = 'TIRO RELÁMPAGO';

/** La franja buena de este tiro. */
export function powerBand(special: boolean): [number, number] {
  return special ? POWER_SUPER : POWER_GOOD;
}

/**
 * ¿Se puede tirar el especial ahora mismo? Con dos goles se carga, y se
 * gasta al usarlo: uno por tanda.
 */
export function superReady(result: PenaltyResult | null): boolean {
  return (result?.scored ?? 0) >= SUPER_FROM && !result?.supered;
}

/* ---------------------------------------------------------------------------
 * El portero
 * ------------------------------------------------------------------------- */

/**
 * Adónde vuela el portero en ese penalti. Se decide con la semilla del
 * perfil, el día y el número de tiro: siempre el mismo, se recargue lo que se
 * recargue, y distinto para Leo y para Hugo el mismo día.
 */
export function keeperZone(profileId: ProfileId, date: DateKey, shot: number): PenaltyZoneId {
  const seed = hashSeed(`${profileId}:penaltis:${date}:${shot}`);
  return PENALTY_ZONES[seed % PENALTY_ZONES.length].id;
}

/**
 * Lo que el portero deja ver antes del tiro: **el lado, no la altura**.
 *
 * Es la pieza que convierte la tanda en un juego de habilidad en vez de en
 * un sorteo de uno entre seis. Con el lado sabido, el tiro al palo contrario
 * entra siempre que la fuerza sea la buena; y si uno no mira, tira a ciegas.
 */
export function keeperTell(id: PenaltyZoneId): PenaltySide {
  return zoneOf(id).side;
}

/* ---------------------------------------------------------------------------
 * Qué pasa con el tiro
 * ------------------------------------------------------------------------- */

export type PenaltyOutcome = 'gol' | 'parada' | 'fuera' | 'poste';

export interface PenaltyShot {
  outcome: PenaltyOutcome;
  /** Dónde ha acabado el balón de verdad, que no es siempre adonde se apuntó. */
  landing: PenaltyAim;
  /** Cuánto se ha desviado por pasarse de fuerza, de 0 a 1. */
  drift: number;
  /** Por qué ha acabado así, para decirlo y que se aprenda algo. */
  why: string;
}

/**
 * De cuánto se pasó, en tanto por uno sobre lo que se podía pasar. Cero si la
 * fuerza estaba dentro de la franja.
 */
function overshoot(power: number, band: [number, number]): number {
  const [, high] = band;
  return power <= high ? 0 : (power - high) / (100 - high);
}

/**
 * Adónde va de verdad el balón.
 *
 * Con la fuerza justa, adonde se apuntó. Pasándose, **se sube y se abre**: es
 * el fallo clásico del penalti reventado, y hace que el mismo tiro a la
 * escuadra entre bien medido y se vaya a las nubes reventado. El lado hacia
 * el que se abre no es al azar: sale de la semilla del tiro, así que repetir
 * el mismo penalti da el mismo resultado.
 */
function landingOf(
  aim: PenaltyAim,
  power: number,
  seed: number,
  band: [number, number],
): { at: PenaltyAim; drift: number } {
  const drift = overshoot(power, band);
  if (drift === 0) return { at: aim, drift: 0 };

  const away = seed % 2 === 0 ? 1 : -1;

  return {
    at: {
      x: aim.x + drift * 26 * away,
      // Hacia arriba, que en esta portería es hacia el 0.
      y: aim.y - drift * 42,
    },
    drift,
  };
}

/**
 * Las reglas, en el orden en que mandan:
 *
 *  1. lo que se va de la portería es fuera, tires donde tires y aunque el
 *     portero estuviera vendido;
 *  2. lo que da en la madera es palo, que no es gol pero tampoco es del
 *     portero;
 *  3. lo que le cae cerca lo para —y si el tiro va blando, «cerca» es media
 *     portería, porque le sobra tiempo—;
 *  4. y lo demás es gol.
 *
 * El especial no se salta ninguna de las cuatro: lo único que cambia es
 * cuánto alcanza el portero, que pasa a ser poco más que sus manos. Sigue
 * habiendo palo, sigue habiendo fuera y sigue habiendo que colocarlo.
 */
export function resolveShot(
  aim: PenaltyAim,
  power: number,
  keeperId: PenaltyZoneId,
  seed = 0,
  special = false,
): PenaltyShot {
  const keeper = zoneOf(keeperId);
  const band = powerBand(special);
  const [low] = band;
  const { at, drift } = landingOf(aim, power, seed, band);

  if (at.x < 0 || at.x > 100 || at.y < 0) {
    return {
      outcome: 'fuera',
      landing: at,
      drift,
      why: drift
        ? special
          ? `El ${SUPER_NAME.toLowerCase()} se te ha ido a las nubes. Fuerza casi al tope, pero dentro de la franja.`
          : 'Demasiada fuerza: al reventarla se te ha subido y abierto, y se ha ido fuera. El penalti se coloca.'
        : 'Se ha ido fuera por muy poco. Apunta un poco más dentro: el palo no perdona.',
    };
  }

  if (at.x < MADERA || at.x > 100 - MADERA || at.y < MADERA) {
    return {
      outcome: 'poste',
      landing: at,
      drift,
      why: '¡A la madera! Dos dedos más adentro y era gol. Buen sitio, mala suerte.',
    };
  }

  // Con el especial el balón va tan fuerte que sólo lo saca si lo tiene
  // encima: no es inatajable, es que hay que ponérselo en las manos.
  const covered = power < low ? ALCANCE_BLANDO : special ? ALCANCE_SUPER : ALCANCE;
  const gap = reach(at, keeper);

  if (gap < covered) {
    return {
      outcome: 'parada',
      landing: at,
      drift,
      why:
        power < low
          ? `Tiro blando: con esa fuerza le da tiempo a llegar hasta ${keeper.label}. Aunque el sitio sea bueno, hay que pegarle.`
          : special
            ? `Se lo has puesto en las manos: voló ${keeper.label} y ahí no hay tiro que valga. Con el especial, al lado contrario.`
            : `El portero voló ${keeper.label} y lo has puesto a su alcance. La próxima, al otro lado.`,
    };
  }

  return {
    outcome: 'gol',
    landing: at,
    drift,
    why: special
      ? `¡${SUPER_NAME}! Ha volado ${keeper.label} y ni lo ha visto pasar.`
      : gap > 55
        ? `¡Golazo! Él se fue ${keeper.label} y tú a la otra punta. Eso es leerle la intención.`
        : `¡Gol! Justo fuera de su alcance: voló ${keeper.label} y no llegaba.`,
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
  return [
    result.scored,
    result.taken,
    result.total,
    result.at,
    result.supered ? 'S' : '',
  ].join('|');
}

export function parsePenaltyResult(text: string | undefined | null): PenaltyResult | null {
  if (!text) return null;

  const [scored, taken, total, at, supered] = text.split('|');
  const numbers = [scored, taken, total].map(Number);
  if (numbers.some((value) => !Number.isFinite(value)) || numbers[2] <= 0) return null;

  return {
    scored: Math.max(0, Math.min(numbers[0], numbers[2])),
    taken: Math.max(0, Math.min(numbers[1], numbers[2])),
    total: numbers[2],
    at: at ?? '',
    // Las tandas guardadas antes de que existiera el especial no traen esta
    // marca, y entonces es que no se gastó.
    supered: supered === 'S',
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
  if (scored > 0) return 'Se ha resistido el portero. Mañana hay otra tanda que ganar.';
  return 'Tanda para olvidar. Al menos las preguntas no te las quita nadie.';
}
