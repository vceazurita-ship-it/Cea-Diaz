import { hashSeed } from '@/lib/challenges';
import { entryKey } from '@/lib/storage';
import type { DateKey, DayEntry, PenaltyResult, ProfileId, ShotKind } from '@/types';

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
 *  Y no es una tanda de tirar y ya: es **un duelo**. Se tira uno y se para
 *  otro, ronda a ronda, como en cualquier juego de penaltis de móvil y como
 *  en cualquier final de verdad. Media tanda es ponerse los guantes, y eso
 *  cambia el juego entero: ya no se cuentan goles, se gana o se pierde.
 *  Si se llega empatado a las cinco, **muerte súbita**; y si uno saca una
 *  ventaja que ya no se puede remontar, la tanda se acaba ahí, como en el
 *  fútbol.
 *
 *  Está montado como el penalti de un videojuego de fútbol, y no como un
 *  sorteo con botones, porque la gracia está en las cosas que hay que hacer
 *  bien y que son las del penalti de verdad:
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
 *   4. **Clavar la puntería.** Puesta la fuerza, una segunda barra corta y
 *      rápida cruza una diana: pararla en el centro manda el balón justo
 *      adonde se apuntó, y pararla a un lado lo abre a ese lado. Es el
 *      efecto, y es lo que hace que dos tiros al mismo sitio no sean el
 *      mismo tiro. La precisión de la carta del que tira estrecha el
 *      abanico, que es para lo que sirve elegir jugador.
 *
 *   5. **Y parar.** Cuando toca bajo palos, el rival hace su carrerilla y
 *      **enseña el pie** a mitad de camino: ahí está el momento de tirarse.
 *      Antes de eso, el rival te ve venir y cambia de palo; después del
 *      golpeo, ya no se llega. Es la misma lección del otro lado.
 *
 *  El portero de cada tiro sale de una semilla hecha con el perfil, el día y
 *  el número de tiro, igual que las preguntas del juego. Y por la misma
 *  razón: cerrar la aplicación y volver a abrirla no cambia adónde se tira
 *  ni regala un penalti más. Cada tiro se anota en cuanto se ejecuta, así
 *  que un penalti fallado es un penalti fallado.
 * ========================================================================= */

/** Clave con la que la tanda se anota en las notas del día. */
export const PENALTY_NOTE_KEY = 'penaltis';

/** Rondas de la tanda: en cada una se tira uno y se para otro. */
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

/* ---------------------------------------------------------------------------
 * Los tiros especiales
 *
 * En Oliver y Benji cada uno tiene su tiro con nombre propio, y gritarlo es
 * media gracia. Aquí hay seis, y **ninguno es un botón de ganar**: cada uno
 * cambia el trato de una manera distinta —uno no se va por arriba, otro se
 * cierra por dentro del palo, otro baila y ni el que tira sabe dónde acaba—
 * y casi todos piden medir la fuerza más fino que el normal. Elegir cuál y
 * cuándo es la decisión de la tanda.
 *
 * Se pagan con **energía**: se empieza con dos y cada gol da una más, como
 * las «agallas» del videojuego de la serie. Cada especial sale una sola vez
 * por tanda, así que no se puede repetir el mismo cinco veces. Lo gastado se
 * guarda con la tanda, y así cerrar la app entre dos penaltis no devuelve la
 * energía.
 * ------------------------------------------------------------------------- */

export type { ShotKind };

export interface ShotType {
  id: ShotKind;
  /** Cómo se llama. */
  name: string;
  /** Su artículo: «el» Tiro del Tigre, «la» Parábola de Messi. */
  article: 'el' | 'la';
  /** Cómo cabe en la ficha del selector. */
  short: string;
  /** Cómo se grita en el corte. */
  shout: string;
  icon: string;
  /** El color de su corte, su estela y su botón. */
  color: string;
  /** Energía que cuesta. */
  cost: number;
  /** La franja buena de la barra. */
  band: [number, number];
  /** Lo que tarda la barra en ir de punta a punta: más rápida, más difícil. */
  sweep: number;
  /** Lo que alcanza Benji contra este tiro bien medido. */
  reach: number;
  /** Lo que tarda el balón en llegar. */
  flight: number;
  /** Lo que hace, en una línea, para elegirlo sabiendo. */
  blurb: string;
  /** Y cómo acaba cuando entra. */
  goal: string;
}

export const SHOT_TYPES: Record<ShotKind, ShotType> = {
  normal: {
    id: 'normal',
    name: 'Tiro normal',
    short: 'Normal',
    article: 'el',
    shout: '',
    icon: '⚽',
    color: '#f4f4f2',
    cost: 0,
    band: POWER_GOOD,
    sweep: 1250,
    reach: 34,
    flight: 720,
    blurb: 'Colocado y con la fuerza justa. Lee a Benji y al otro lado.',
    goal: '',
  },
  halcon: {
    id: 'halcon',
    name: 'Tiro del Halcón',
    short: 'Halcón',
    article: 'el',
    shout: '¡TIRO DEL HALCÓN!',
    icon: '🦅',
    color: '#38bdf8',
    cost: 1,
    band: [48, 90],
    sweep: 1150,
    reach: 28,
    flight: 820,
    blurb: 'Sube y cae en picado: aunque te pases de fuerza, no se va por arriba.',
    goal: 'ha caído en picado justo donde no llegaba',
  },
  efecto: {
    id: 'efecto',
    name: 'Efecto Roberto Carlos',
    short: 'Efecto RC',
    article: 'el',
    shout: '¡EFECTO ROBERTO CARLOS!',
    icon: '🌀',
    color: '#a78bfa',
    cost: 1,
    band: [45, 88],
    sweep: 1150,
    reach: 30,
    flight: 820,
    blurb: 'Sale por fuera y se cierra: apunta al palo sin miedo a la madera.',
    goal: 'se ha abierto por fuera y se ha cerrado por dentro del palo',
  },
  parabola: {
    id: 'parabola',
    name: 'Parábola de Messi',
    short: 'Parábola',
    article: 'la',
    shout: '¡LA PARÁBOLA DE MESSI!',
    icon: '🌈',
    color: '#f472b6',
    cost: 1,
    band: [16, 46],
    sweep: 1150,
    reach: 34,
    flight: 1000,
    blurb: 'Picadita suave: si Benji se tira a un lado, por el centro entra sola. Suelta pronto.',
    goal: 'le ha pasado por encima, suave, mientras él volaba',
  },
  fuego: {
    id: 'fuego',
    name: 'Tiro de Fuego',
    short: 'Fuego',
    article: 'el',
    shout: '¡TIRO DE FUEGO!',
    icon: '🔥',
    color: '#fb923c',
    cost: 2,
    band: [62, 90],
    sweep: 1050,
    reach: 20,
    flight: 520,
    blurb: 'Va ardiendo y Benji apenas lo ve, pero si te pasas se dispara.',
    goal: 'ha entrado ardiendo y la red todavía echa humo',
  },
  canon: {
    id: 'canon',
    name: 'Cañón de CR7',
    short: 'Cañón CR7',
    article: 'el',
    shout: '¡EL CAÑÓN DE CR7!',
    icon: '💣',
    color: '#fbbf24',
    cost: 2,
    band: [55, 92],
    sweep: 1050,
    reach: 16,
    flight: 700,
    blurb: 'Sin girar y bailando: Benji no lo lee… y tú tampoco sabes dónde acaba.',
    goal: 'ha bailado en el aire y le ha pasado por el lado',
  },
  catapulta: {
    id: 'catapulta',
    name: 'Catapulta Infernal',
    short: 'Catapulta',
    article: 'la',
    shout: '¡CATAPULTA INFERNAL!',
    icon: '🚀',
    color: '#818cf8',
    cost: 2,
    band: [55, 90],
    sweep: 1050,
    reach: 12,
    flight: 950,
    blurb: 'La de los gemelos Derrick: sales volando y rematas desde el cielo. Arriba Benji no llega; abajo, sí.',
    goal: 'ha caído del cielo por encima de sus guantes',
  },
  tigre: {
    id: 'tigre',
    name: 'Tiro del Tigre',
    short: 'Tigre',
    article: 'el',
    shout: '¡TIRO DEL TIGRE!',
    icon: '🐯',
    color: '#f97316',
    cost: 3,
    band: [72, 93],
    sweep: 900,
    reach: 12,
    flight: 480,
    blurb: 'La potencia pura de Mark Lenders: casi imparable, pero la franja es estrecha y arriba.',
    goal: 'ni lo ha visto pasar',
  },
};

/** En el orden en que se enseñan: el normal y luego de más barato a más caro. */
export const SHOT_ORDER: ShotKind[] = ['normal', 'halcon', 'efecto', 'parabola', 'fuego', 'canon', 'catapulta', 'tigre'];

/** Energía con la que se empieza la tanda. */
export const ENERGY_START = 2;

/** La franja buena de este tiro. */
export function powerBand(kind: ShotKind = 'normal'): [number, number] {
  return SHOT_TYPES[kind].band;
}

/**
 * La energía que queda: la de salida, más un punto por gol, menos lo gastado
 * —en tiros especiales cuando se tira, y en palomitas cuando se para—.
 *
 * Es **una sola bolsa** para las dos mitades a propósito: gastarse el rayo en
 * el Tiro del Tigre significa no tenerlo para la parada de la ronda siguiente,
 * y ahí está la decisión. Si cada mitad tuviera la suya, no habría ninguna.
 */
export function energyLeft(result: PenaltyResult | null): number {
  const spent = (result?.specials ?? []).reduce((sum, kind) => sum + (SHOT_TYPES[kind]?.cost ?? 0), 0);
  return ENERGY_START + (result?.scored ?? 0) - spent - (result?.gloves ?? 0) * PALOMITA_COSTE;
}

/** Si se puede tirar ése ahora, y si no, por qué. */
export function shotAvailability(
  kind: ShotKind,
  result: PenaltyResult | null,
): { ok: boolean; reason?: 'usado' | 'energia' } {
  if (kind === 'normal') return { ok: true };
  if (result?.specials?.includes(kind)) return { ok: false, reason: 'usado' };
  if (energyLeft(result) < SHOT_TYPES[kind].cost) return { ok: false, reason: 'energia' };
  return { ok: true };
}

/* ---------------------------------------------------------------------------
 * El portero
 * ------------------------------------------------------------------------- */

/**
 * Adónde vuela el portero en ese penalti. Se decide con la semilla del
 * perfil, el día y el número de tiro: siempre el mismo, se recargue lo que se
 * recargue, y distinto para Leo y para Hugo el mismo día.
 */
export function keeperZone(profileId: ProfileId, date: DateKey, shot: number, round = 0): PenaltyZoneId {
  // La primera tanda del día conserva la semilla de siempre; las repetidas
  // llevan su número, y así Benji no se tira a los mismos sitios.
  const seed = hashSeed(`${profileId}:penaltis:${date}:${shot}${round ? `:r${round}` : ''}`);
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

/**
 * Lo que alcanza Benji en esa ronda. En las cinco de la tanda, lo de siempre;
 * en la muerte súbita se crece —ya le ha cogido el aire al que tira— y llega
 * un poco más lejos. Es toda la subida de dificultad que hay, y es honrada:
 * no hay fintas ni sorpresas, sólo un portero que cada vez para más.
 */
export function keeperStretch(round: number): number {
  return round <= PENALTY_SHOTS ? 0 : Math.min(8, (round - PENALTY_SHOTS) * 3);
}

/* ---------------------------------------------------------------------------
 * El duelo
 *
 * La tanda son dos cuentas a la vez —lo que uno mete y lo que le meten— y
 * un orden fijo: en cada ronda se tira primero y se para después. De ahí
 * sale todo lo demás: a quién le toca, en qué ronda va, si ya no hay remonte
 * posible y quién ha ganado.
 * ------------------------------------------------------------------------- */

export type DuelTurn = 'tiras' | 'paras';

export interface DuelState {
  /** Qué toca ahora. */
  turn: DuelTurn;
  /** La ronda en curso, desde 1. */
  round: number;
  /** Si se ha pasado de las cinco: cada ronda es a vida o muerte. */
  sudden: boolean;
  /** Si la tanda está acabada. */
  done: boolean;
  /** Y cómo: `null` mientras siga viva. */
  win: 'ganas' | 'pierdes' | null;
  /** Goles de cada uno. */
  scored: number;
  conceded: number;
  /**
   * Una tanda de antes del duelo, dejada a medias: sólo se tira, como
   * entonces. No se le cambian las reglas a una tanda ya empezada.
   */
  legacy: boolean;
}

/**
 * Cómo va el duelo.
 *
 * La regla del fútbol de «ya no le da» está aquí y no es un adorno: una
 * tanda que se decide en el cuarto penalti se acaba en el cuarto penalti,
 * y eso es exactamente lo que hace que el cuarto penalti importe.
 */
export function duelState(result: PenaltyResult | null): DuelState {
  const total = result?.total || PENALTY_SHOTS;
  const taken = Math.max(0, result?.taken ?? 0);
  const scored = Math.max(0, result?.scored ?? 0);
  const faced = Math.max(0, result?.faced ?? 0);
  const conceded = Math.max(0, result?.conceded ?? 0);

  // Las tandas viejas no traen `faced`. Las que ya iban por la mitad se
  // terminan con las reglas con las que empezaron.
  if (result && result.faced === undefined && taken > 0) {
    const done = taken >= total;
    return {
      turn: 'tiras',
      round: Math.min(taken + 1, total),
      sudden: false,
      done,
      win: done ? (scored * 2 >= total ? 'ganas' : 'pierdes') : null,
      scored,
      conceded: total - scored,
      legacy: true,
    };
  }

  // Se tira primero y se para después, así que mientras no se haya tirado
  // más que parado, toca tirar.
  const turn: DuelTurn = taken <= faced ? 'tiras' : 'paras';
  const round = Math.min(taken, faced) + 1;

  const regulation = taken <= total && faced <= total;
  const mine = Math.max(0, total - taken);
  const theirs = Math.max(0, total - faced);
  const decided = regulation
    ? scored > conceded + theirs || conceded > scored + mine
    : // En la muerte súbita no vale la ventaja a medias: hay que dejarle
      // responder, y se cierra sólo con la ronda entera.
      taken === faced && scored !== conceded;

  return {
    turn,
    round,
    sudden: round > total,
    done: decided,
    win: decided ? (scored > conceded ? 'ganas' : 'pierdes') : null,
    scored,
    conceded,
    legacy: false,
  };
}

/* ---------------------------------------------------------------------------
 * Cuando toca parar
 *
 * El otro lado de la tanda. El rival hace su carrerilla y **enseña el pie**
 * a mitad de camino: ése es el aviso, igual que el de Benji, y la lección
 * es la misma leída del revés. Tirarse antes de verlo no es adelantarse, es
 * regalarle el palo: el rival mira, te ve caer y la pone al otro lado.
 * ------------------------------------------------------------------------- */

/** Lo que alcanza uno tirándose en su momento. */
export const GUANTES = 40;

/**
 * Y lo que alcanza con **palomita**: el estirón de más que se paga con un
 * rayo de energía. Es lo que los tiros especiales son cuando toca tirar —una
 * decisión, no un botón de ganar—: se arma antes de la carrerilla, se gasta
 * salga como salga, y sigue habiendo que tirarse al lado bueno y a tiempo.
 */
export const GUANTES_PALOMITA = 56;

/** Lo que cuesta armarla. */
export const PALOMITA_COSTE = 1;

/** Lo que alcanza saliendo tarde, con el balón ya en el aire. */
export const GUANTES_TARDE = 19;

/** Y lo que tapa quedándose quieto en el centro, que algo tapa. */
export const GUANTES_QUIETO = 24;

/** Dónde se planta uno cuando no se tira a ningún lado. */
export const PLANTADO: PenaltyAim = { x: 50, y: 72 };

/** El penalti que tira el rival. */
export interface RivalKick {
  /** Cuál de los rivales tira: un número, que el dibujo reparte. */
  rival: number;
  /** La zona a la que va. */
  zone: PenaltyZoneId;
  /** Y el punto exacto, que no es el centro clavado de la zona. */
  aim: PenaltyAim;
  /** El lado que deja ver al colocar el pie. */
  tell: PenaltySide;
  /** Si se le va fuera a él solo. */
  wide: boolean;
  /** Lo que tarda su carrerilla, en milisegundos. */
  runUp: number;
  /** La semilla, para lo que haga falta decidir al resolver. */
  seed: number;
}

/**
 * El penalti que te tiran en esa ronda. Sale de la misma semilla que todo lo
 * demás —perfil, día, número y tanda—, así que cerrar la aplicación no
 * cambia adónde te la ponen.
 */
export function rivalKick(profileId: ProfileId, date: DateKey, index: number, round = 0): RivalKick {
  const seed = hashSeed(`${profileId}:rival:${date}:${index}${round ? `:r${round}` : ''}`);
  const zone = PENALTY_ZONES[seed % PENALTY_ZONES.length];

  // No tiran al centro clavado de la zona: la mueven un poco, que es lo que
  // impide aprenderse seis sitios y acabar con el juego.
  const jitter = (bits: number, span: number) => (((seed >> bits) % (span * 2 + 1)) - span);

  return {
    rival: (seed >> 5) % 8,
    zone: zone.id,
    aim: {
      x: Math.max(8, Math.min(92, zone.x + jitter(3, 9))),
      y: Math.max(10, Math.min(92, zone.y + jitter(9, 8))),
    },
    tell: zone.side,
    // Uno de cada ocho la manda a la grada él solito. Es el respiro de la
    // tanda, y el que hace que ponerse los guantes no dé miedo.
    wide: ((seed >> 14) % 8) === 0,
    runUp: 1500 + ((seed >> 17) % 8) * 90,
    seed,
  };
}

/** Cuándo te has tirado, medido contra su carrerilla. */
export type SaveTiming = 'pronto' | 'buena' | 'tarde' | 'quieto';

/** En qué momento de la carrerilla enseña el pie: a mitad de camino. */
export function tellAt(kick: RivalKick): number {
  return Math.round(kick.runUp * 0.5);
}

export type SaveOutcome = 'parada' | 'encajado' | 'fallado';

export interface SaveShot {
  outcome: SaveOutcome;
  /** Dónde acabó el balón. */
  landing: PenaltyAim;
  /** Adónde te tiraste tú. */
  dive: PenaltyAim;
  /** Y por qué acabó así. */
  why: string;
}

/**
 * Si la paras.
 *
 *  1. lo que se le va fuera a él no lo para nadie, pero tampoco es gol;
 *  2. tirándose a tiempo se alcanza casi media portería;
 *  3. tirándose pronto **él cambia de palo**, que es el castigo de verdad;
 *  4. tirándose tarde se llega a poco, y quedándose quieto sólo al centro.
 */
export function resolveSave(
  kick: RivalKick,
  dive: PenaltyAim | null,
  when: SaveTiming,
  palomita = false,
): SaveShot {
  const at = { ...kick.aim };
  const guantes = dive ?? PLANTADO;

  if (when === 'pronto' && dive) {
    // Te ha visto caer: se va al otro palo, y con margen.
    const away = dive.x < 50 ? 1 : -1;
    at.x = Math.max(9, Math.min(91, 50 + away * (26 + ((kick.seed >> 21) % 12))));
  }

  if (kick.wide) {
    return {
      outcome: 'fallado',
      landing: { x: at.x < 50 ? -4 : 104, y: Math.max(-4, at.y - 20) },
      dive: guantes,
      why: '¡La ha mandado fuera él solo! No todas las para el portero: algunas se fallan.',
    };
  }

  const base = when === 'tarde' ? GUANTES_TARDE : when === 'quieto' ? GUANTES_QUIETO : GUANTES;
  // La palomita sólo estira lo que ya es un vuelo: saliendo tarde o sin
  // moverse no hay estirón que valga, y ahí el rayo se pierde.
  const alcance = palomita && when !== 'quieto' ? Math.max(base, GUANTES_PALOMITA - (when === 'tarde' ? 24 : 0)) : base;
  const gap = reach(at, guantes);

  if (gap < alcance) {
    return {
      outcome: 'parada',
      landing: at,
      dive: guantes,
      why: palomita
        ? '¡PALOMITA! Un estirón imposible y la saca con la punta del guante.'
        : when === 'quieto'
          ? '¡Se te ha quedado en las manos! Te quedaste plantado y la tiró por el centro.'
          : when === 'tarde'
            ? '¡Parada con lo justo! Saliste tarde y aun así llegaste. No siempre saldrá.'
            : '¡PARADÓN! Esperaste a que enseñara el pie y volaste a su palo.',
    };
  }

  return {
    outcome: 'encajado',
    landing: at,
    dive: guantes,
    why:
      when === 'pronto'
        ? 'Te tiraste antes de tiempo, te vio caer y la puso al otro lado. Hay que esperar al pie.'
        : when === 'tarde'
          ? 'Saliste tarde: cuando te tiraste, el balón ya estaba dentro.'
          : when === 'quieto'
            ? 'Te quedaste quieto y la puso a un palo. Quieto sólo se paran las del centro.'
            : 'Voló al otro palo. Le leíste el pie al revés: a la próxima, al lado que enseña.',
  };
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
 * Lo que se sabe del desvío **antes** de soltar: cuánto se ha pasado, cuánto
 * se va a subir y cuánto se puede abrir. El lado hacia el que se abre no: ése
 * lo decide la semilla del tiro. Es lo que dibuja la mira mientras se carga
 * la fuerza —el cerco que sube y se agranda—, con los mismos números con los
 * que luego se resuelve el tiro.
 */
/**
 * Cuánto se abre el balón cuando la segunda barra —la de la puntería— se
 * para en una punta en vez de en la diana, medido en tanto por ciento de
 * portería. Es medio ancho de portería en el peor caso, que es mucho: el
 * castigo tiene que verse, o la barra no serviría para nada.
 */
export const ABANICO = 26;

export function overshootPreview(
  kind: ShotKind,
  power: number,
): { drift: number; up: number; open: number } {
  const drift = overshoot(power, SHOT_TYPES[kind].band);
  // Los dos que bajan del cielo —el Halcón y la Catapulta— no se suben.
  const fromAbove = kind === 'halcon' || kind === 'catapulta';
  const up = fromAbove ? -4 : kind === 'fuego' ? 68 : kind === 'parabola' ? 56 : 42;
  const open = fromAbove ? 14 : kind === 'fuego' ? 36 : 26;
  return { drift, up, open };
}

/**
 * Adónde va de verdad el balón.
 *
 * Con la fuerza justa, adonde se apuntó. Pasándose, **se sube y se abre**: es
 * el fallo clásico del penalti reventado, y hace que el mismo tiro a la
 * escuadra entre bien medido y se vaya a las nubes reventado. El lado hacia
 * el que se abre no es al azar: sale de la semilla del tiro, así que repetir
 * el mismo penalti da el mismo resultado.
 *
 * Y cada especial lo tuerce a su manera: el del Halcón no se sube —cae en
 * picado—, el de Fuego se dispara el doble, el efecto se cierra hacia dentro,
 * el cañón baila y la parábola se va por arriba si se le pega de más.
 */
function landingOf(
  aim: PenaltyAim,
  power: number,
  seed: number,
  kind: ShotKind,
  accuracy: number,
  spread: number,
): { at: PenaltyAim; drift: number } {
  const { drift, up, open } = overshootPreview(kind, power);
  // Hacia dónde se abre al reventarla: hacia el lado por el que se falló la
  // puntería, y sólo si no se falló hacia ninguno, la semilla.
  const away = Math.abs(accuracy) > 0.06 ? Math.sign(accuracy) : seed % 2 === 0 ? 1 : -1;

  const at = {
    // El efecto: lo que se desvía por no clavar la segunda barra.
    x: aim.x + accuracy * ABANICO * spread + drift * open * away,
    // Hacia arriba, que en esta portería es hacia el 0.
    y: aim.y - drift * up,
  };

  // El efecto: sale por fuera y se cierra siete puntos hacia dentro.
  if (kind === 'efecto') at.x += aim.x < 50 ? 7 : -7;

  // El cañón baila siempre, con fuerza buena o no: es lo que tiene un balón
  // que no gira. Cuánto y hacia dónde sale de la semilla, como todo.
  if (kind === 'canon') {
    at.x += ((seed >> 3) % 19) - 9;
    at.y += ((seed >> 8) % 21) - 10;
  }

  return { at, drift };
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
 * Los especiales no se saltan ninguna de las cuatro. Cambian cuánto alcanza
 * Benji, adónde va de verdad el balón y, en dos casos, una regla concreta:
 * el efecto no da en los palos de los lados —la curva los esquiva— y la
 * parábola por el centro entra sola si Benji se ha tirado a un lado, y se la
 * come si se ha quedado.
 */
export function resolveShot(
  aim: PenaltyAim,
  power: number,
  keeperId: PenaltyZoneId,
  seed = 0,
  kind: ShotKind = 'normal',
  /** La segunda barra: 0 clavada, ±1 parada en una punta. */
  accuracy = 0,
  /** Lo que abre el abanico este jugador: menos de 1, menos se le va. */
  spread = 1,
  /** Lo que se crece Benji en esta ronda. */
  stretch = 0,
): PenaltyShot {
  const keeper = zoneOf(keeperId);
  const type = SHOT_TYPES[kind];
  const [low] = type.band;
  const { at, drift } = landingOf(aim, power, seed, kind, accuracy, spread);
  const special = kind !== 'normal';
  const fallado = Math.abs(accuracy) > 0.35;

  if (at.x < 0 || at.x > 100 || at.y < 0) {
    return {
      outcome: 'fuera',
      landing: at,
      drift,
      why: fallado
        ? 'Se te ha ido fuera: fallaste la puntería y el balón se ha abierto hacia ese lado. Para la segunda barra en la diana.'
        : drift
        ? special
          ? `${type.article === 'la' ? 'La' : 'El'} ${type.name} se te ha ido fuera: te has pasado de fuerza. Suéltalo dentro de su franja.`
          : 'Demasiada fuerza: al reventarla se te ha subido y abierto, y se ha ido fuera. El penalti se coloca.'
        : kind === 'canon'
          ? 'El cañón ha bailado de más y se ha ido fuera. Es lo que tiene: ni tú sabes dónde acaba.'
          : 'Se ha ido fuera por muy poco. Apunta un poco más dentro: el palo no perdona.',
    };
  }

  const sidePost = kind !== 'efecto' && (at.x < MADERA || at.x > 100 - MADERA);
  if (sidePost || at.y < MADERA) {
    return {
      outcome: 'poste',
      landing: at,
      drift,
      why: '¡A la madera! Dos dedos más adentro y era gol. Buen sitio, mala suerte.',
    };
  }

  const soft = power < low;

  // La parábola por el centro: la decide dónde está Benji, no su alcance.
  if (kind === 'parabola' && !soft && Math.abs(at.x - 50) < 24) {
    if (keeper.side === 'centro') {
      return {
        outcome: 'parada',
        landing: at,
        drift,
        why: 'Benji se ha quedado en el centro y la picadita le ha caído en las manos. La parábola, cuando se tira a un lado.',
      };
    }
    return {
      outcome: 'gol',
      landing: at,
      drift,
      why: `¡${type.name}! Voló ${keeper.label} y la pelota ${type.goal}.`,
    };
  }

  // La Catapulta cae desde arriba: a lo alto Benji no llega, pero lo que
  // cae abajo lo tiene a mano.
  const covered =
    (soft ? ALCANCE_BLANDO : kind === 'catapulta' && at.y > 45 ? 32 : type.reach) + stretch;
  const gap = reach(at, keeper);

  if (gap < covered) {
    return {
      outcome: 'parada',
      landing: at,
      drift,
      why: soft
        ? `Tiro blando: con esa fuerza le da tiempo a llegar hasta ${keeper.label}. Aunque el sitio sea bueno, hay que pegarle.`
        : fallado
          ? `Fallaste la puntería y el balón se abrió justo adonde él volaba (${keeper.label}). Clava la segunda barra.`
          : special
          ? `Ni con ${type.article} ${type.name}: Benji voló ${keeper.label} y se lo has puesto en las manos. Al lado contrario.`
          : `Benji voló ${keeper.label} y lo has puesto a su alcance. La próxima, al otro lado.`,
    };
  }

  return {
    outcome: 'gol',
    landing: at,
    drift,
    why: special
      ? `¡${type.name}! Benji voló ${keeper.label} y el balón ${type.goal}.`
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
    // Los especiales gastados, separados por comas: `halcon,tigre`.
    (result.specials ?? []).join(','),
    // Qué tanda del día es. Antes sólo se escribía si no era la primera,
    // pero desde que detrás van las paradas tiene que ocupar siempre su
    // sitio, o las cuentas se leerían corridas.
    result.round ?? 0,
    // Y el otro lado del duelo: penaltis parados, goles encajados y las
    // palomitas gastadas.
    result.faced ?? 0,
    result.conceded ?? 0,
    result.gloves ?? 0,
  ].join('|');
}

export function parsePenaltyResult(text: string | undefined | null): PenaltyResult | null {
  if (!text) return null;

  const [scored, taken, total, at, specials, round, faced, conceded, gloves] = text.split('|');
  const numbers = [scored, taken, total].map(Number);
  if (numbers.some((value) => !Number.isFinite(value)) || numbers[2] <= 0) return null;

  // La muerte súbita pasa de las cinco, así que lo tirado ya no se recorta
  // contra el total; lo que se guarda es lo que se ha tirado de verdad, y el
  // tope es sólo una red por si la línea viene rota.
  const cap = 99;

  return {
    scored: Math.max(0, Math.min(numbers[0], cap)),
    taken: Math.max(0, Math.min(numbers[1], cap)),
    total: numbers[2],
    at: at ?? '',
    // Sin este campo la línea es de antes del duelo, y `undefined` es lo que
    // lo dice: esa tanda se termina como empezó, sólo tirando.
    faced: faced === undefined ? undefined : Math.max(0, Math.min(Number(faced) || 0, cap)),
    conceded: conceded === undefined ? undefined : Math.max(0, Math.min(Number(conceded) || 0, cap)),
    gloves: Math.max(0, Math.min(Number(gloves) || 0, cap)),
    // Las tandas de antes de los especiales no traen nada. Y las del único
    // especial que hubo, el relámpago, traen una «S»: era un tiro de pura
    // potencia, así que cuenta como el del Tigre ya gastado.
    specials: parseSpecials(specials),
    round: Math.max(0, Math.floor(Number(round) || 0)),
  };
}

function parseSpecials(text: string | undefined): ShotKind[] {
  if (!text) return [];
  if (text === 'S') return ['tigre'];
  return text.split(',').filter((kind): kind is ShotKind => kind in SHOT_TYPES && kind !== 'normal');
}

/** La tanda anotada ese día, si la hubo. */
export function penaltyResultFor(
  entries: Record<string, DayEntry>,
  profileId: ProfileId,
  date: DateKey,
): PenaltyResult | null {
  return parsePenaltyResult(entries[entryKey(profileId, date)]?.notes?.[PENALTY_NOTE_KEY]);
}

/**
 * La línea con la que se reinicia la tanda del día desde los ajustes: una
 * tanda nueva, sin tirar y con su energía entera, y con el número de tanda
 * uno más alto, que es lo que cambia adónde se tira Benji.
 */
export function restartedPenaltyNote(current: PenaltyResult | null): string {
  return encodePenaltyResult({
    scored: 0,
    taken: 0,
    total: PENALTY_SHOTS,
    at: new Date().toISOString(),
    specials: [],
    round: (current?.round ?? 0) + 1,
    faced: 0,
    conceded: 0,
    gloves: 0,
  });
}

/** ¿Tirados los cinco? */
export function isPenaltyDone(result: PenaltyResult): boolean {
  return duelState(result).done;
}

/**
 * Cómo se llama una tanda según cómo haya salido.
 *
 * Con las dos cuentas —lo metido y lo encajado— cuenta el duelo, que es lo
 * que de verdad se ha jugado. Con una sola, la tanda vieja de sólo tirar.
 */
export function penaltyVerdict(scored: number, total: number, conceded?: number): string {
  if (conceded !== undefined) {
    if (scored > conceded) {
      if (conceded === 0) {
        return scored >= total
          ? '¡Tanda perfecta y a cero! De las de contar en el cole.'
          : '¡Ganada sin encajar ni una! Eso es ponerse los guantes.';
      }
      if (scored - conceded === 1) return '¡Ganada por la mínima! Así se gana una final.';
      return '¡Ganada! Le has metido y le has parado.';
    }
    if (scored === conceded) return 'Tanda empatada: se ha quedado a medias.';
    if (conceded - scored === 1) return 'Perdida por un penalti. Duele, y por eso se vuelve mañana.';
    return 'Se le ha escapado la tanda. Mañana hay otra final.';
  }

  if (scored === total) return '¡Los cinco dentro! Tanda perfecta.';
  if (scored >= total - 1) return 'Gran tanda: así se gana una final.';
  if (scored >= Math.ceil(total / 2)) return 'Más dentro que fuera. Se puede pedir la bola otra vez.';
  if (scored > 0) return 'Se ha resistido el portero. Mañana hay otra tanda que ganar.';
  return 'Tanda para olvidar. Al menos las preguntas no te las quita nadie.';
}
