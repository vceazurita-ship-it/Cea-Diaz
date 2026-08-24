import { hashSeed } from '@/lib/challenges';
import { parseDateKey } from '@/lib/dates';
import { entryKey } from '@/lib/storage';
import type {
  ChallengeTier,
  DateKey,
  DayEntry,
  GameId,
  GameQuestion,
  GameResult,
  GameRound,
  Profile,
  ProfileId,
} from '@/types';

/* =========================================================================
 *  El juego del día — Leo y Hugo
 *
 *  Dos juegos, uno al día y alternándose: un día toca el **duelo de lógica**
 *  (cinco problemas de cabeza, con números y con trampas de las buenas) y al
 *  siguiente la **pizarra táctica** (cinco jugadas para decidir qué haría un
 *  jugador listo). Nunca los dos el mismo día: una partida, cinco preguntas,
 *  y hasta mañana.
 *
 *  El premio es un cromo de verdad, del mismo álbum que reparten los retos:
 *  con 3 ó 4 aciertos cae uno de cantera, con pleno uno de los grandes, y al
 *  tercer pleno seguido, una leyenda. Con menos de 3, ninguno: mañana hay
 *  otra oportunidad. Ese reparto vive en `lib/rewards.ts`, que es quien tiene
 *  los mazos; aquí sólo se dice qué nivel de premio merece cada partida.
 *
 *  Como los retos, las recompensas y el bonus del día, esto **casi no
 *  guarda nada**: en las notas del día queda una línea —qué juego, cuántos
 *  aciertos, cuántas contestadas— y todo lo demás se recalcula. Las preguntas
 *  salen de una semilla hecha con el perfil y la fecha, así que el mismo día
 *  da siempre la misma partida: cerrar la app y volver a abrirla no cambia
 *  las preguntas ni regala una segunda oportunidad.
 *
 *  La partida se puede retomar —queda apuntado por dónde iba— pero no
 *  repetir: pregunta contestada, contestada se queda.
 * ========================================================================= */

/** Clave con la que la partida del día se anota en las notas del día. */
export const GAME_NOTE_KEY = 'juego';

/** Preguntas de cada partida. */
export const GAME_QUESTIONS = 5;

/** Aciertos mínimos para llevarse cromo. */
export const GAME_PASS = 3;

/** Plenos seguidos que hacen falta para que caiga un cromo de leyenda. */
export const PERFECT_FOR_LEGEND = 3;

/* ---------------------------------------------------------------------------
 * Utilidades deterministas
 *
 * Las mismas de siempre en esta casa: un generador con semilla, de modo que
 * la misma semilla dé exactamente la misma partida en el móvil de Leo, en el
 * de Hugo y en el portátil.
 * ------------------------------------------------------------------------- */

type Rand = () => number;

function makeRand(seed: number): Rand {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Entero entre `min` y `max`, los dos incluidos. */
function between(rand: Rand, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function pick<T>(rand: Rand, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function shuffle<T>(items: readonly T[], rand: Rand): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Resto siempre positivo: hace falta para las fechas anteriores al día cero. */
function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/* ---------------------------------------------------------------------------
 * Qué juego toca hoy
 * ------------------------------------------------------------------------- */

/** Día cero de la rotación. Un lunes cualquiera; sólo sirve para contar. */
const EPOCH: DateKey = '2026-01-05';

/**
 * Días transcurridos desde el día cero. Se redondea porque los cambios de
 * hora dejan días de 23 y de 25 horas, y un día es un día.
 */
export function dayIndex(date: DateKey): number {
  const ms = parseDateKey(date).getTime() - parseDateKey(EPOCH).getTime();
  return Math.round(ms / 86_400_000);
}

/** Un día lógica, un día táctica. */
export function gameForDate(date: DateKey): GameId {
  return mod(dayIndex(date), 2) === 0 ? 'logica' : 'tactica';
}

/** Cuántas partidas de ese juego se han jugado ya, contando la de hoy. */
function roundIndex(date: DateKey): number {
  return Math.floor(dayIndex(date) / 2);
}

/** Sólo juegan los peques: el juego del día es cosa de Leo y de Hugo. */
export function gameEnabledFor(profile: Profile): boolean {
  return profile.kind === 'kid';
}

export const GAME_META: Record<GameId, { icon: string; title: string; tagline: string }> = {
  logica: {
    icon: '🧠',
    title: 'Duelo de lógica',
    tagline: 'Cinco problemas para resolver de cabeza.',
  },
  tactica: {
    icon: '⚽',
    title: 'Pizarra táctica',
    tagline: 'Cinco jugadas: decide como un jugador listo.',
  },
};

/* ---------------------------------------------------------------------------
 * Armado de una pregunta
 * ------------------------------------------------------------------------- */

/** Lo que devuelve cada generador antes de barajar las opciones. */
interface Draft {
  icon: string;
  prompt: string;
  /** La respuesta buena. */
  correct: string;
  /** Respuestas falsas candidatas; se cogen las tres primeras que valgan. */
  wrong: string[];
  explain: string;
}

const LETTERS = ['a', 'b', 'c', 'd'];

/**
 * Baraja las opciones y señala cuál es la buena. Las falsas repetidas —o
 * iguales a la buena, que pasa cuando los números salen justos— se descartan:
 * más vale una pregunta con tres opciones que una con dos respuestas iguales.
 */
function toQuestion(id: string, draft: Draft, rand: Rand): GameQuestion {
  const wrong: string[] = [];
  for (const candidate of draft.wrong) {
    if (candidate === draft.correct || wrong.includes(candidate)) continue;
    wrong.push(candidate);
    if (wrong.length === 3) break;
  }

  const options = shuffle([draft.correct, ...wrong], rand).map((text, index) => ({
    id: LETTERS[index],
    text,
  }));

  return {
    id,
    prompt: draft.prompt,
    options,
    answer: options.find((option) => option.text === draft.correct)?.id ?? options[0].id,
    explain: draft.explain,
    icon: draft.icon,
  };
}

/* ---------------------------------------------------------------------------
 * Duelo de lógica · los generadores
 *
 * Catálogo editable, como el de hábitos: añadir un tipo de problema es añadir
 * un objeto a esta lista. Cada uno inventa sus números con su propia semilla,
 * así que el mismo problema no repite cifras de una semana para otra.
 *
 * `hard` sube el listón para el mayor: los mismos problemas con números más
 * grandes o con un paso más. Nadie resuelve el del hermano por habérselo
 * visto hacer.
 * ------------------------------------------------------------------------- */

interface LogicContext {
  /** Nombre del que juega, para que los problemas hablen de él. */
  name: string;
  /** Su hermano, que sale en los problemas de tres. */
  brother: string;
  hard: boolean;
}

interface LogicGenerator {
  id: string;
  make: (rand: Rand, ctx: LogicContext) => Draft;
}

/** Nombres de relleno para los problemas de tres. */
const EXTRA_NAMES = ['Mateo', 'Iván', 'Nico', 'Bruno', 'Álvaro', 'Adrián'];

/** «17:05» a partir de los minutos del día. */
function clock(minutes: number): string {
  const total = mod(minutes, 24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${`${m}`.padStart(2, '0')}`;
}

const LOGIC: LogicGenerator[] = [
  /* --------------------------------------------------------- series */
  {
    id: 'serie',
    make: (rand, ctx) => {
      const step = ctx.hard ? between(rand, 4, 9) : between(rand, 2, 5);
      const start = between(rand, 2, 12);
      const terms = [0, 1, 2, 3].map((i) => start + step * i);
      const next = start + step * 4;

      return {
        icon: '🔢',
        prompt: `Sigue la serie: ${terms.join(', ')}, … ¿qué número viene ahora?`,
        correct: `${next}`,
        wrong: [`${next + 1}`, `${next - 1}`, `${next + step}`, `${next - step + 1}`],
        explain: `Cada número sube de ${step} en ${step}: ${terms[3]} + ${step} = ${next}.`,
      };
    },
  },
  {
    id: 'serie-doble',
    make: (rand, ctx) => {
      const a = between(rand, 2, 5);
      const b = a + between(rand, 1, ctx.hard ? 6 : 3);
      const start = between(rand, 1, 9);
      const terms = [start, start + a, start + a + b, start + a + b + a, start + a + b + a + b];
      const next = terms[4] + a;

      return {
        icon: '🪜',
        prompt:
          `Esta serie sube saltando de dos maneras distintas: ${terms.join(', ')}, … ` +
          '¿qué número viene ahora?',
        correct: `${next}`,
        wrong: [`${terms[4] + b}`, `${next + 1}`, `${next - 1}`, `${terms[4] + a + b}`],
        explain:
          `Los saltos van alternando +${a} y +${b}. Después de un salto de ${b} ` +
          `toca uno de ${a}: ${terms[4]} + ${a} = ${next}.`,
      };
    },
  },

  /* -------------------------------------------------------- reparto */
  {
    id: 'reparto',
    make: (rand, ctx) => {
      const each = between(rand, 4, ctx.hard ? 12 : 8);
      const groups = pick(rand, [3, 4, 5, 6]);
      const total = each * groups;

      return {
        icon: '🎫',
        prompt:
          `${ctx.name} tiene ${total} cromos repetidos y los reparte en partes iguales ` +
          `entre ${groups} amigos. ¿Cuántos le tocan a cada uno?`,
        correct: `${each}`,
        wrong: [`${each + 1}`, `${each - 1}`, `${groups}`, `${total - groups}`],
        explain: `${total} entre ${groups} son ${each}, porque ${each} × ${groups} = ${total}.`,
      };
    },
  },
  {
    id: 'balanza',
    make: (rand, ctx) => {
      const per = between(rand, 3, ctx.hard ? 8 : 5);
      const balls = pick(rand, [2, 3, 4]);
      const cones = per * balls;

      return {
        icon: '⚖️',
        prompt:
          `${balls} balones pesan lo mismo que ${cones} conos. ` +
          '¿Cuántos conos pesa UN balón?',
        correct: `${per}`,
        wrong: [`${cones - balls}`, `${per + 1}`, `${per - 1}`, `${cones}`],
        explain:
          `Si ${balls} balones son ${cones} conos, uno solo es ${cones} entre ${balls} = ${per}.`,
      };
    },
  },

  /* ------------------------------------------------------- marcador */
  {
    id: 'marcador',
    make: (rand) => {
      const homeHalf = between(rand, 0, 2);
      const awayHalf = between(rand, 0, 2);
      const homeMore = between(rand, 0, 3);
      const awayMore = between(rand, homeMore === 0 ? 1 : 0, 3);
      const second = homeMore + awayMore;

      return {
        icon: '🥅',
        prompt:
          `Al descanso el partido iba ${homeHalf}-${awayHalf} y acabó ` +
          `${homeHalf + homeMore}-${awayHalf + awayMore}. ¿Cuántos goles se marcaron en la ` +
          'segunda parte, contando los de los dos equipos?',
        correct: `${second}`,
        wrong: [
          `${second + homeHalf + awayHalf}`,
          `${second + 1}`,
          `${Math.max(0, second - 1)}`,
          `${homeMore}`,
        ],
        explain:
          `Los de casa metieron ${homeMore} y los de fuera ${awayMore}: ` +
          `${homeMore} + ${awayMore} = ${second} goles en la segunda parte.`,
      };
    },
  },

  /* ---------------------------------------------------------- reloj */
  {
    id: 'reloj',
    make: (rand, ctx) => {
      const startMin = pick(rand, [16, 17, 18]) * 60 + pick(rand, [0, 15, 30, 45]);
      const durMin = ctx.hard ? pick(rand, [60, 90, 105, 120]) : pick(rand, [60, 75, 90]);
      const end = startMin + durMin;
      const durLabel =
        durMin % 60 === 0 ? `${durMin / 60} h` : `${Math.floor(durMin / 60)} h ${durMin % 60} min`;

      return {
        icon: '⏰',
        prompt:
          `El entrenamiento empieza a las ${clock(startMin)} y dura ${durLabel}. ` +
          '¿A qué hora acaba?',
        correct: clock(end),
        wrong: [clock(end - 60), clock(end + 15), clock(end - 15), clock(end + 60)],
        explain:
          `De ${clock(startMin)} a ${clock(startMin + 60)} va la primera hora; ` +
          `sumando lo que queda se llega a las ${clock(end)}.`,
      };
    },
  },

  /* ------------------------------------------------------ deducción */
  {
    id: 'dorsales',
    make: (rand, ctx) => {
      const numbers = shuffle([4, 5, 6, 7, 8, 9, 10, 11], rand)
        .slice(0, 3)
        .sort((x, y) => x - y);
      const [low, mid, high] = numbers;
      const names = shuffle([ctx.name, ctx.brother, pick(rand, EXTRA_NAMES)], rand);
      const [first, second, third] = names;
      const dorsal: Record<string, number> = { [first]: low, [second]: mid, [third]: high };
      const target = pick(rand, names);
      const spare = pick(
        rand,
        [2, 3, 12, 13].filter((n) => !numbers.includes(n)),
      );

      return {
        icon: '🕵️',
        prompt:
          `${first}, ${second} y ${third} llevan los dorsales ${low}, ${mid} y ${high}. ` +
          `${second} no lleva ni el ${low} ni el ${high}, y ${third} lleva un número más alto ` +
          `que ${first}. ¿Qué dorsal lleva ${target}?`,
        correct: `${dorsal[target]}`,
        wrong: [`${low}`, `${mid}`, `${high}`, `${spare}`],
        explain:
          `A ${second} sólo le puede tocar el ${mid}. Quedan el ${low} y el ${high}, y como ` +
          `${third} lleva más que ${first}, ${first} se queda el ${low} y ${third} el ${high}.`,
      };
    },
  },

  /* ------------------------------------------------------- dos pasos */
  {
    id: 'cajas',
    make: (rand, ctx) => {
      const perBox = pick(rand, [4, 6, 8, 10]);
      const boxes = between(rand, 3, ctx.hard ? 8 : 5);
      const broken = between(rand, 2, 5);
      const left = perBox * boxes - broken;

      return {
        icon: '📦',
        prompt:
          `Cada caja trae ${perBox} balones. El club compra ${boxes} cajas y se pinchan ` +
          `${broken}. ¿Cuántos balones quedan en buen estado?`,
        correct: `${left}`,
        wrong: [`${perBox * boxes}`, `${left + broken * 2}`, `${left - 1}`, `${left + 1}`],
        explain:
          `${perBox} × ${boxes} = ${perBox * boxes} balones, menos los ${broken} pinchados: ` +
          `${left}.`,
      };
    },
  },
  {
    id: 'cuenta-atras',
    make: (rand, ctx) => {
      const start = pick(rand, ctx.hard ? [80, 100, 120] : [50, 60, 80]);
      const loss = between(rand, 6, 12);
      const times = between(rand, 3, 4);
      const left = start - loss * times;

      return {
        icon: '🎯',
        prompt:
          `${ctx.name} empieza un juego con ${start} puntos y falla ${times} veces. ` +
          `Cada fallo cuesta ${loss} puntos. ¿Con cuántos puntos se queda?`,
        correct: `${left}`,
        // Nada de respuestas negativas: a esta edad delatan al vuelo cuál no es.
        wrong: [start - loss, left + loss, left - loss, left + 1]
          .filter((n) => n >= 0)
          .map((n) => `${n}`),
        explain:
          `${times} fallos × ${loss} puntos = ${loss * times}. ` +
          `Y ${start} − ${loss * times} = ${left}.`,
      };
    },
  },

  /* ------------------------------------------------------ fracciones */
  {
    id: 'fraccion',
    make: (rand, ctx) => {
      const quarter = ctx.hard && rand() < 0.6;
      const total = quarter ? pick(rand, [12, 16, 20, 24]) : pick(rand, [10, 12, 14, 16, 18]);
      const withBib = quarter ? total / 4 : total / 2;
      const without = total - withBib;

      return {
        icon: '🦺',
        prompt:
          `En el entrenamiento hay ${total} jugadores y ${quarter ? 'un cuarto' : 'la mitad'} ` +
          'lleva peto. ¿Cuántos NO llevan peto?',
        correct: `${without}`,
        wrong: [`${withBib}`, `${without - 1}`, `${without + 1}`, `${total}`],
        explain:
          `${quarter ? 'Un cuarto' : 'La mitad'} de ${total} son ${withBib} con peto, ` +
          `así que sin peto quedan ${total} − ${withBib} = ${without}.`,
      };
    },
  },
  {
    id: 'multiplo',
    make: (rand, ctx) => {
      const teams = pick(rand, ctx.hard ? [4, 5, 6] : [3, 4, 5]);
      const good = teams * between(rand, 3, 6);
      const wrong = [good + 1, good - 1, good + 2, good - 2, good + 3].filter(
        (n) => n > 0 && n % teams !== 0,
      );

      return {
        icon: '👥',
        prompt:
          `Hay que repartir a los jugadores en ${teams} equipos iguales, sin que sobre nadie. ` +
          '¿Con cuántos jugadores se puede?',
        correct: `${good}`,
        wrong: wrong.map((n) => `${n}`),
        explain:
          `${good} entre ${teams} son ${good / teams} justos. Los demás dejan a alguien fuera.`,
      };
    },
  },

  /* -------------------------------------------------------- patrones */
  {
    id: 'palillos',
    make: (rand, ctx) => {
      const target = between(rand, ctx.hard ? 6 : 4, ctx.hard ? 10 : 7);
      const need = 2 * target + 1;

      return {
        icon: '🔺',
        prompt:
          'Con 3 palillos se hace 1 triángulo, con 5 se hacen 2 pegados y con 7 se hacen 3. ' +
          `¿Cuántos palillos hacen falta para ${target} triángulos en fila?`,
        correct: `${need}`,
        wrong: [`${3 * target}`, `${2 * target}`, `${need + 2}`, `${need - 2}`],
        explain:
          'El primer triángulo cuesta 3 y cada uno nuevo sólo añade 2: ' +
          `3 + ${target - 1} × 2 = ${need}.`,
      };
    },
  },
  {
    id: 'combinaciones',
    make: (rand, ctx) => {
      const shirts = between(rand, 2, ctx.hard ? 5 : 3);
      const shorts = between(rand, 2, ctx.hard ? 4 : 3);
      const total = shirts * shorts;

      return {
        icon: '👕',
        prompt:
          `En el armario de ${ctx.name} hay ${shirts} camisetas y ${shorts} pantalones ` +
          'distintos. ¿Cuántas equipaciones diferentes puede montar?',
        correct: `${total}`,
        wrong: [`${shirts + shorts}`, `${total + shirts}`, `${total - 1}`, `${total + 1}`],
        explain:
          `Con cada camiseta caben ${shorts} pantalones: ${shirts} × ${shorts} = ${total} ` +
          'equipaciones distintas.',
      };
    },
  },
  {
    id: 'edades',
    make: (rand, ctx) => {
      const now = between(rand, 7, 10);
      const diff = between(rand, 2, 5);
      const later = now + between(rand, 3, 7);

      return {
        icon: '🎂',
        prompt:
          `${ctx.name} tiene ${now} años y su primo tiene ${diff} más. ` +
          `¿Cuántos años tendrá el primo cuando ${ctx.name} cumpla ${later}?`,
        correct: `${later + diff}`,
        wrong: [`${later}`, `${now + diff}`, `${later + diff + 1}`, `${later - diff}`],
        explain:
          `La diferencia de edad no cambia nunca: siempre son ${diff} años. ` +
          `${later} + ${diff} = ${later + diff}.`,
      };
    },
  },
];

/* ---------------------------------------------------------------------------
 * Pizarra táctica · el catálogo
 *
 * Preguntas de decidir, no de memorizar: qué haría un jugador listo en esa
 * jugada. Las respuestas falsas no son tonterías, son los errores que de
 * verdad se cometen a esa edad —mirar sólo el balón, correr todos al bulto,
 * chutar siempre—, que es lo que hace que la buena enseñe algo.
 *
 * Catálogo editable: añadir una jugada es añadir un objeto a esta lista.
 * ------------------------------------------------------------------------- */

interface TacticSeed {
  id: string;
  icon: string;
  prompt: string;
  /** La buena. */
  correct: string;
  /** Las dos falsas. */
  wrong: [string, string];
  explain: string;
}

const TACTICS: TacticSeed[] = [
  {
    id: 'fuera-de-juego',
    icon: '🚩',
    prompt: 'Vas a recibir un pase largo. ¿Cuándo estás en fuera de juego?',
    correct:
      'Si en el momento en que mi compañero toca el balón estoy por delante del último defensa.',
    wrong: [
      'Si adelanto al último defensa después de que el balón ya haya salido.',
      'Siempre que entre en el área rival sin el balón.',
    ],
    explain:
      'El fuera de juego se mira en el instante del pase, no en el de la llegada. Por eso se ' +
      'espera medio segundo y se arranca justo cuando el compañero levanta la cabeza.',
  },
  {
    id: 'recibir-perfil',
    icon: '🧭',
    prompt: 'Te llega un pase y tienes espacio por delante. ¿Cómo te colocas para recibir?',
    correct: 'De lado, medio girado, para ver el balón y la portería contraria a la vez.',
    wrong: [
      'De frente al que me pasa, para no fallar el control.',
      'De espaldas a la portería contraria, protegiendo siempre el balón.',
    ],
    explain:
      'Recibir de perfil es ganar un segundo: al controlar ya estás mirando adelante y no tienes ' +
      'que girarte con el rival encima. Se llama orientar el control.',
  },
  {
    id: 'mirar-antes',
    icon: '👀',
    prompt: '¿Qué hacen los buenos centrocampistas justo ANTES de que les llegue el balón?',
    correct:
      'Mirar alrededor un par de veces para saber quién les aprieta y dónde hay un compañero libre.',
    wrong: [
      'Pedir el balón gritando y no apartar la vista de él.',
      'Decidir a dónde van a pasar cuando ya lo tienen controlado.',
    ],
    explain:
      'Mirar antes de recibir es lo que separa a un jugador rápido de uno lento: la decisión ya ' +
      'está tomada cuando llega el balón.',
  },
  {
    id: 'pared',
    icon: '🧱',
    prompt:
      'Conduces y un defensa se te planta delante, pero tienes un compañero al lado. ' +
      '¿Qué jugada le gana casi siempre?',
    correct: 'La pared: pasársela y salir corriendo por detrás del defensa para que me la devuelva.',
    wrong: [
      'Regatearle por fuera aunque venga otro rival a ayudarle.',
      'Pararme y esperar a que suba alguien más.',
    ],
    explain:
      'En la pared el balón va más rápido que cualquier defensa. Lo importante no es el pase: es ' +
      'arrancar en el mismo momento en que se da.',
  },
  {
    id: 'amplitud',
    icon: '↔️',
    prompt:
      'Tu equipo ataca y todos están amontonados en el centro. Tú eres el extremo. ¿Dónde te pones?',
    correct: 'Pegado a la banda, bien abierto, para estirar a los defensas y abrir hueco por dentro.',
    wrong: [
      'Cerca del balón, para ayudar al compañero que está rodeado.',
      'Dentro del área, esperando el rechace.',
    ],
    explain:
      'El campo mide lo que tú lo hagas medir. Un extremo abierto obliga al lateral a irse con él, ' +
      'y ese hueco lo aprovecha alguien por dentro.',
  },
  {
    id: 'apoyo-linea-pase',
    icon: '📐',
    prompt:
      'Un compañero tiene el balón y hay un rival justo delante de ti, en la línea que os une. ' +
      '¿Qué haces?',
    correct: 'Moverme unos metros a un lado hasta que el rival deje de taparme y me vea.',
    wrong: [
      'Quedarme quieto y gritar más fuerte para que me la pase.',
      'Correr hacia él para recibir de cerca.',
    ],
    explain:
      'Dar línea de pase es trabajo del que NO tiene el balón. Dos pasos al lado valen más que ' +
      'diez gritos.',
  },
  {
    id: 'presion-tras-perdida',
    icon: '⚡',
    prompt: 'Acabáis de perder el balón en ataque. ¿Qué es lo mejor en los tres segundos siguientes?',
    correct: 'Apretar enseguida al que lo ha robado, que todavía no ha levantado la cabeza.',
    wrong: [
      'Volver corriendo todos a nuestro campo y esperar allí.',
      'Quejarse al compañero que ha perdido el balón.',
    ],
    explain:
      'Justo después de robar, el rival está mal colocado y mirando al suelo. Esos tres segundos ' +
      'son el mejor momento para recuperar; si no se logra, entonces sí, repliegue.',
  },
  {
    id: 'temporizar',
    icon: '🛑',
    prompt:
      'Un delantero rival va solo hacia tu portería y eres el único defensa cerca, pero tus ' +
      'compañeros vienen detrás. ¿Qué haces?',
    correct: 'Frenarle sin tirarme al suelo, acompañándole hacia la banda hasta que llegue ayuda.',
    wrong: [
      'Entrarle fuerte cuanto antes para quitársela ya.',
      'Retroceder corriendo hasta la línea de gol sin acercarme.',
    ],
    explain:
      'Temporizar es ganar tiempo. Si te tiras y te regatea, el equipo se queda sin nadie; si ' +
      'aguantas de pie, en tres segundos sois dos contra uno.',
  },
  {
    id: 'cobertura',
    icon: '🛡️',
    prompt: 'Tu compañero de defensa sale a presionar al que lleva el balón. ¿Dónde te colocas tú?',
    correct: 'Un poco por detrás y hacia dentro, para taparle la espalda si le regatean.',
    wrong: [
      'A su lado, para presionar los dos a la vez.',
      'En mi sitio de siempre, marcando a mi delantero.',
    ],
    explain:
      'Eso es la cobertura: el que sale se puede equivocar, y por eso siempre hay otro por detrás. ' +
      'Sin ella, un solo regate deja al equipo partido.',
  },
  {
    id: 'basculacion',
    icon: '🔄',
    prompt: 'El balón está en la banda derecha del rival. ¿Qué hace el lateral izquierdo de tu equipo?',
    correct:
      'Cerrarse hacia el centro, sin quedarse pegado a su banda, para que no haya huecos entre los defensas.',
    wrong: [
      'Quedarse en su banda marcando al extremo que tiene enfrente.',
      'Subir al ataque, que por allí no está el balón.',
    ],
    explain:
      'La defensa se mueve junta, como si los cuatro fueran atados por una cuerda: el balón tira ' +
      'de todos hacia su lado. Eso es bascular.',
  },
  {
    id: 'cambio-orientacion',
    icon: '🎯',
    prompt:
      'Lleváis rato atacando por la derecha y allí hay cinco rivales. Recibes con espacio. ' +
      '¿Qué es lo mejor?',
    correct: 'Cambiar el juego con un pase largo a la izquierda, donde está el compañero solo.',
    wrong: [
      'Insistir por la derecha, que es donde están casi todos los nuestros.',
      'Chutar desde lejos a ver si entra.',
    ],
    explain:
      'Si todos se han ido a un lado, el gol está en el otro. Un cambio de orientación bien dado ' +
      'deja a un compañero completamente solo.',
  },
  {
    id: 'salida-portero',
    icon: '🧤',
    prompt:
      'Tu portero tiene el balón en los pies y el rival aprieta arriba. ¿Qué es lo más inteligente casi siempre?',
    correct: 'Que los defensas se abran y le den una opción de pase cerca y segura.',
    wrong: [
      'Que despeje muy largo y muy arriba, pase lo que pase.',
      'Que espere con el balón parado hasta que se aparte alguien.',
    ],
    explain:
      'Un pase corto y seguro supera la primera línea de presión y deja al equipo jugando; el ' +
      'balonazo, la mitad de las veces, es regalar el balón.',
  },
  {
    id: 'segundo-palo',
    icon: '🏹',
    prompt: 'Tu compañero va a centrar desde la banda derecha. ¿A qué zona conviene llegar?',
    correct: 'Al segundo palo, el más lejano, llegando desde atrás y en carrera.',
    wrong: [
      'Al punto de penalti, quieto, esperando a ver dónde cae.',
      'Cerca del que centra, por si necesita ayuda.',
    ],
    explain:
      'Al segundo palo llegan los centros que se pasan, y allí los defensas ven peor. Llegar ' +
      'corriendo siempre gana a llegar parado.',
  },
  {
    id: 'regatear-o-pasar',
    icon: '🤔',
    prompt:
      'Conduces por la banda, tienes un rival delante y un compañero solo en el centro. ¿Qué decides?',
    correct: 'Mirar primero: si el compañero está mejor colocado, pasar; el regate es para cuando no hay pase.',
    wrong: [
      'Regatear siempre, que para eso llevo yo el balón.',
      'Pasar siempre, que el regate es peligroso.',
    ],
    explain:
      'No hay una respuesta fija, hay una manera de decidir: primero se mira, luego se elige. El ' +
      'balón corre más que las piernas, pero a veces el regate es lo único que rompe.',
  },
  {
    id: 'linea-alta',
    icon: '📏',
    prompt: 'Vuestro portero despeja y el balón se va lejos, a campo contrario. ¿Qué hace la defensa?',
    correct: 'Subir todos juntos y deprisa para achicar espacio y dejar al rival lejos de la portería.',
    wrong: [
      'Quedarse atrás por si acaso vuelve el balón.',
      'Subir sólo los laterales y que los centrales esperen.',
    ],
    explain:
      'Achicar es dejar al equipo junto: si la defensa se queda, aparece un campo enorme entre ' +
      'ella y el mediocampo, y ahí es donde el rival hace daño.',
  },
  {
    id: 'contraataque',
    icon: '🏃',
    prompt: 'Robáis el balón y el rival está adelantado. Sois tres contra dos. ¿Qué hacéis?',
    correct: 'Salir muy rápido y bien abiertos, con un pase hacia adelante en cuanto se pueda.',
    wrong: [
      'Ir juntos por el centro, uno detrás de otro, sin arriesgar.',
      'Dar dos o tres pases atrás para que suba el equipo entero.',
    ],
    explain:
      'En un contraataque manda el reloj: cada segundo que pasa vuelve un rival. Correr abiertos ' +
      'obliga a los dos defensas a elegir a quién paran.',
  },
  {
    id: 'saque-banda-rapido',
    icon: '🙌',
    prompt: 'El balón sale por la banda, es vuestro saque y el rival está descolocado. ¿Qué conviene?',
    correct: 'Sacar rápido a un compañero desmarcado antes de que se coloquen.',
    wrong: [
      'Esperar a que llegue todo el mundo y sacar hacia adelante.',
      'Sacar lo más lejos posible, hacia el área.',
    ],
    explain:
      'La ventaja dura lo que tarda el rival en colocarse. Un saque rápido y al pie vale más que ' +
      'uno largo y disputado.',
  },
  {
    id: 'corner-defensivo',
    icon: '🚧',
    prompt: 'Defendéis un córner y te toca marcar a un rival. ¿Cómo te colocas?',
    correct: 'De lado, viendo al rival y el balón a la vez, y sin dejar de sentirle con el brazo.',
    wrong: [
      'Mirando sólo el balón, que es lo que hay que despejar.',
      'Detrás del rival, para saltar por encima de él cuando venga.',
    ],
    explain:
      'Si sólo miras el balón, el rival se va y aparece solo. Si sólo miras al rival, no ves el ' +
      'centro. Hay que ver las dos cosas: por eso se defiende de perfil.',
  },
  {
    id: 'barrera',
    icon: '🧍',
    prompt: 'Falta peligrosa a favor del rival cerca de vuestra área. ¿Para qué sirve la barrera?',
    correct: 'Para tapar un lado de la portería y que el portero sólo tenga que cubrir el otro.',
    wrong: [
      'Para tapar la portería entera y que no pueda chutar.',
      'Para molestar y quitarle la concentración al que lanza.',
    ],
    explain:
      'La barrera se coloca de acuerdo con el portero: ella cubre su palo y él se sitúa en el ' +
      'lado libre. Por eso nadie debe saltar antes de tiempo ni girarse.',
  },
  {
    id: 'pase-al-espacio',
    icon: '💨',
    prompt: 'Tu delantero arranca hacia la portería con el defensa al lado. ¿Cómo se la das?',
    correct: 'Al espacio, por delante de él, para que la coja en carrera.',
    wrong: [
      'A los pies, para que no se le escape.',
      'Muy fuerte y a la portería, por si se cuela sola.',
    ],
    explain:
      'Cuando un compañero corre a un hueco, el balón se pone donde va a estar, no donde está. Si ' +
      'se la das al pie, se para y el defensa le alcanza.',
  },
  {
    id: 'pase-al-pie',
    icon: '🎽',
    prompt:
      'Tu compañero recibe de espaldas, con un rival pegado y sin espacio para correr. ' +
      '¿Cómo se la pasas?',
    correct: 'Al pie, fuerte y raso, al pie más lejano del rival, para que pueda protegerla.',
    wrong: [
      'Al espacio, por delante, para que gire y corra.',
      'Alta y suave, para que la baje con el pecho.',
    ],
    explain:
      'El pase se elige según cómo esté el compañero: si tiene hueco, al espacio; si está tapado, ' +
      'al pie y al lado contrario del rival, que es lo que le deja protegerla.',
  },
  {
    id: 'pivote',
    icon: '⚓',
    prompt: '¿Cuál es el trabajo del mediocentro que juega por delante de la defensa?',
    correct: 'Colocarse entre el balón y su área, ofrecerse siempre y tapar los pases peligrosos.',
    wrong: [
      'Subir a rematar todos los centros, que es el que más corre.',
      'Marcar al delantero rival durante todo el partido.',
    ],
    explain:
      'Es el que cose al equipo: en ataque siempre está libre para recibir y en defensa tapa el ' +
      'camino del centro, que es por donde más rápido se llega a la portería.',
  },
  {
    id: 'lateral-sube',
    icon: '🔺',
    prompt:
      'Tu extremo se mete hacia dentro con el balón y la banda queda vacía. Eres el lateral. ¿Qué haces?',
    correct: 'Subir por fuera para dar amplitud y obligar al rival a decidir a quién sigue.',
    wrong: [
      'Quedarme atrás, que mi puesto es defender.',
      'Meterme yo también por dentro, cerca del balón.',
    ],
    explain:
      'Cuando uno se mete, otro sale: así siempre hay alguien en la banda. Dos jugadores en el ' +
      'mismo sitio se quitan el espacio el uno al otro.',
  },
  {
    id: 'no-amontonarse',
    icon: '🐝',
    prompt: 'En el patio todos corren detrás del balón. ¿Por qué es mala idea en un partido de verdad?',
    correct:
      'Porque el campo se queda vacío en todas partes menos donde está el balón, y un solo pase os deja sin nadie.',
    wrong: [
      'Porque cansa mucho y hay que reservar fuerzas para el final.',
      'Porque el árbitro puede pitar falta por ser demasiados.',
    ],
    explain:
      'Un equipo ocupa el campo: cerca del balón hay que ayudar, pero alguien tiene que estar ' +
      'donde el balón va a llegar después.',
  },
  {
    id: 'volver-a-posicion',
    icon: '↩️',
    prompt: 'Has subido a atacar, se pierde el balón y estás lejos de tu sitio. ¿Qué haces?',
    correct: 'Volver corriendo a mi posición por el camino más corto, aunque el balón no esté cerca.',
    wrong: [
      'Quedarme arriba esperando, por si lo recuperamos y me la pasan.',
      'Ir andando y colocarme cuando llegue el balón.',
    ],
    explain:
      'El equipo defiende con todos. El que se queda arriba no ataca: deja a diez defendiendo ' +
      'contra once.',
  },
  {
    id: 'primer-pase',
    icon: '🧠',
    prompt: 'Acabas de robar el balón en tu campo. ¿Qué es lo mejor casi siempre?',
    correct: 'Sacarlo del apuro con un pase seguro a un compañero libre, aunque sea hacia un lado.',
    wrong: [
      'Conducir hacia adelante yo solo entre los rivales.',
      'Despejar lo más fuerte que pueda para que se vaya bien lejos.',
    ],
    explain:
      'El primer pase después de robar decide el ataque. Uno bueno y sencillo pone al equipo a ' +
      'jugar; uno arriesgado en tu campo se convierte en gol del rival.',
  },
  {
    id: 'achique-portero',
    icon: '🥅',
    prompt: 'Un delantero se planta solo delante de tu portero. ¿Qué debe hacer el portero?',
    correct: 'Salir a su encuentro para taparle portería y aguantar de pie hasta el último momento.',
    wrong: [
      'Quedarse en la línea de gol para tener más tiempo de reacción.',
      'Tirarse al suelo cuanto antes, a los pies del delantero.',
    ],
    explain:
      'Cuanto más cerca está el portero, menos portería ve el delantero. Pero si se tira pronto le ' +
      'regatean: primero achicar, y tirarse sólo cuando el otro toca el balón.',
  },
  {
    id: 'comunicar',
    icon: '🗣️',
    prompt: 'Un compañero va a recibir de espaldas y no ve que no le aprieta nadie. ¿Qué haces?',
    correct: 'Avisarle en voz alta: «¡solo, tiempo!», para que se gire y juegue de cara.',
    wrong: [
      'Callarme para no despistarle en el control.',
      'Correr hacia él por si necesita apoyo.',
    ],
    explain:
      'Hablar es jugar. El que está de espaldas no ve nada y depende de lo que le digan: «solo», ' +
      '«tiempo», «hombre», «gírate».',
  },
  {
    id: 'cambio-ritmo',
    icon: '🚀',
    prompt: 'Conduces hacia un defensa que retrocede. ¿Cuándo conviene arrancar a toda velocidad?',
    correct: 'Después de ir un poco más lento, justo cuando el defensa se para o cruza los pies.',
    wrong: [
      'Desde el principio y sin bajar el ritmo en ningún momento.',
      'Cuando ya lo tengo encima y me está tocando el balón.',
    ],
    explain:
      'Lo que rompe no es la velocidad, es el cambio de velocidad. Lento-rápido descoloca a ' +
      'cualquier defensa; rápido todo el rato es fácil de seguir.',
  },
  {
    id: 'presion-de-espaldas',
    icon: '🔒',
    prompt: 'Un rival va a recibir de espaldas a tu portería, cerca de ti. ¿Qué haces?',
    correct: 'Apretarle en cuanto la toque, sin dejar que se gire y sin hacerle falta.',
    wrong: [
      'Dejarle espacio para verle venir y esperarle de frente.',
      'Entrar a barrer por detrás para quitársela ya.',
    ],
    explain:
      'Un rival de espaldas es un rival sin peligro: si le dejas girarse, te encara. Y por detrás ' +
      'nunca se barre: eso es falta y a veces tarjeta.',
  },
  {
    id: 'despejar-o-jugar',
    icon: '⚖️',
    prompt:
      'Estás dentro de tu área con el balón, dos rivales encima y ningún compañero libre. ¿Qué haces?',
    correct: 'Despejar fuerte a la banda o hacia arriba: en tu área, seguridad antes que lucimiento.',
    wrong: [
      'Regatear para salir jugando desde el área, que es más bonito.',
      'Pasársela al portero aunque tenga rivales cerca.',
    ],
    explain:
      'Salir jugando está muy bien, pero en tu propia área una pérdida es gol. Cuando no hay pase ' +
      'seguro, el balón fuera de la zona de peligro y a empezar otra vez.',
  },
  {
    id: 'superioridad',
    icon: '✌️',
    prompt: 'Vais dos contra un solo defensa y tú llevas el balón. ¿Qué haces?',
    correct: 'Ir hacia el defensa para obligarle a venir a mí y pasar justo cuando se decida.',
    wrong: [
      'Pasar enseguida a mi compañero, antes de que llegue el defensa.',
      'Ir lo más rápido posible y chutar yo desde lejos.',
    ],
    explain:
      'En un dos contra uno manda el que lleva el balón: hay que fijar al defensa. Si pasas antes ' +
      'de tiempo, el defensa cambia de hombre y la ventaja se acaba.',
  },
  {
    id: 'repliegue',
    icon: '🔙',
    prompt: 'El rival sale al contraataque y estáis descolocados. ¿Qué es lo primero?',
    correct: 'Correr hacia nuestra portería por el centro, tapando el camino más corto al gol.',
    wrong: [
      'Perseguir al que lleva el balón hasta alcanzarle.',
      'Levantar el brazo pidiendo fuera de juego.',
    ],
    explain:
      'Replegar es volver por dentro, no ir detrás del balón: primero se protege el camino a la ' +
      'portería y luego ya se sale a presionar.',
  },
  {
    id: 'vigilancia',
    icon: '👁️',
    prompt: 'Vuestro equipo ataca un córner a favor. ¿Qué hacen los dos o tres que se quedan atrás?',
    correct: 'Vigilar a los delanteros rivales y el borde del área por si sale un contraataque.',
    wrong: [
      'Subir también al área, que cuantos más rematen, mejor.',
      'Quedarse en el medio campo mirando el remate.',
    ],
    explain:
      'Los goles en contra más tontos llegan de un córner a favor. Por eso siempre hay ' +
      'vigilancias: gente colocada para el rechace y para la carrera del rival.',
  },
  {
    id: 'ocupar-espacios',
    icon: '🗺️',
    prompt: 'Tu equipo tiene el balón y estás en la misma zona que un compañero. ¿Qué haces?',
    correct: 'Buscar otro espacio libre, cerca pero distinto, para que no nos marque el mismo defensa.',
    wrong: [
      'Quedarme para ayudarle si le presionan dos rivales.',
      'Pedirle el balón para salir los dos de ahí.',
    ],
    explain:
      'Dos compañeros en el mismo sitio son medio jugador: un solo defensa los tapa a los dos. ' +
      'Repartirse el campo obliga al rival a estirarse.',
  },
  {
    id: 'primer-toque',
    icon: '🦶',
    prompt: 'Recibes un pase con un rival llegando por detrás. ¿A dónde diriges el primer toque?',
    correct: 'Hacia el espacio libre, lejos del rival, para salir jugando con el segundo toque.',
    wrong: [
      'Lo paro justo en el sitio y luego decido con calma.',
      'Se la devuelvo de primeras al que me la ha pasado.',
    ],
    explain:
      'El primer toque ya es una jugada. Si lo paras en seco, te comen; si lo empujas al hueco, ' +
      'sales del apuro y encima con ventaja.',
  },
  {
    id: 'atacar-el-espacio',
    icon: '🕳️',
    prompt:
      'Tu compañero levanta la cabeza con el balón controlado y delante hay campo libre. ¿Qué haces tú?',
    correct: 'Arrancar hacia el hueco para que pueda pasarme al espacio.',
    wrong: [
      'Acercarme a él para que me la dé al pie, que es más seguro.',
      'Esperar quieto en mi sitio a ver qué hace.',
    ],
    explain:
      'Cuando el compañero puede mirar, es el momento de correr. Si nadie ataca el espacio, el que ' +
      'tiene el balón sólo puede jugar hacia atrás.',
  },
  {
    id: 'presion-orientada',
    icon: '🧲',
    prompt: 'Presionas al rival que tiene el balón cerca de la banda. ¿Cómo te acercas a él?',
    correct:
      'Por dentro, de manera que sólo pueda salir hacia la banda, donde la línea ayuda a defender.',
    wrong: [
      'De frente y muy rápido, para que no tenga tiempo de nada.',
      'Por fuera, para que no se escape por la banda.',
    ],
    explain:
      'La línea de banda es un defensa más. Presionar orientando es cerrarle el camino bueno y ' +
      'dejarle sólo el malo.',
  },
  {
    id: 'sacar-en-corto',
    icon: '🎩',
    prompt: 'Saque de puerta y el rival espera atrás, sin presionar. ¿Qué es lo mejor?',
    correct: 'Sacar en corto y avanzar jugando: si nadie aprieta, es campo regalado.',
    wrong: [
      'Sacar largo igualmente, que es lo que se hace siempre.',
      'Esperar con el balón parado a que el rival suba a presionar.',
    ],
    explain:
      'Se juega según lo que hace el rival, no según la costumbre. Si te regalan veinte metros, se ' +
      'cogen.',
  },
  {
    id: 'gestionar-resultado',
    icon: '⏳',
    prompt: 'Ganáis 1-0 y quedan cinco minutos. ¿Qué hace un equipo listo?',
    correct: 'Cuidar el balón, jugar sencillo y no perderlo en zonas peligrosas.',
    wrong: [
      'Meterse todos atrás y despejar cada balón que llegue.',
      'Ir a por el segundo gol subiendo a todo el equipo.',
    ],
    explain:
      'El balón también defiende: mientras lo tienes tú, el rival no ataca. Encerrarse atrás es ' +
      'invitar al empate.',
  },
  {
    id: 'ayuda-al-lateral',
    icon: '🤝',
    prompt: 'El extremo rival encara a vuestro lateral y le está ganando la espalda. ¿Quién ayuda?',
    correct: 'El compañero más cercano, cerrando por dentro mientras el central cubre el centro.',
    wrong: [
      'Nadie: es su duelo y tiene que ganarlo él solo.',
      'Todo el equipo, corriendo hacia esa banda.',
    ],
    explain:
      'Defender es cosa de dos como mínimo: uno aprieta y otro cubre. Ni solo ni todos: el más ' +
      'cercano.',
  },
  {
    id: 'remate-cabeza',
    icon: '💇',
    prompt: 'Llega un centro alto al área. ¿Cómo se remata mejor de cabeza?',
    correct: 'Saltando hacia el balón y golpeándolo con la frente, dirigiéndolo hacia abajo.',
    wrong: [
      'Esperando quieto y poniendo la cabeza para que rebote.',
      'Con la coronilla y hacia arriba, para que pase por encima del portero.',
    ],
    explain:
      'Con la frente se ve el balón y se dirige; hacia abajo es el remate más difícil de parar, ' +
      'porque el portero tiene que agacharse y el bote le engaña.',
  },
];

/* ---------------------------------------------------------------------------
 * La partida del día
 * ------------------------------------------------------------------------- */

/** Cómo se llama el hermano, para que los problemas hablen de la casa. */
function brotherOf(profileId: ProfileId): string {
  return profileId === 'leo' ? 'Hugo' : 'Leo';
}

/**
 * Monta la partida que le toca hoy a este perfil. Determinista: misma fecha y
 * mismo perfil, mismas preguntas y en el mismo orden. Cambiar de móvil,
 * recargar o volver mañana a mirarla da exactamente lo mismo.
 */
export function buildGameRound(profile: Profile, date: DateKey): GameRound {
  const game = gameForDate(date);
  const meta = GAME_META[game];

  return {
    game,
    date,
    title: meta.title,
    icon: meta.icon,
    tagline: meta.tagline,
    questions: game === 'logica' ? logicQuestions(profile, date) : tacticQuestions(profile.id, date),
  };
}

/** Cinco problemas de tipos distintos, con los números de hoy. */
function logicQuestions(profile: Profile, date: DateKey): GameQuestion[] {
  const order = shuffle(LOGIC, makeRand(hashSeed(`${profile.id}:logica:${date}`)));
  const ctx: LogicContext = {
    name: profile.name,
    brother: brotherOf(profile.id),
    hard: (profile.age ?? 8) >= 9,
  };

  return order.slice(0, GAME_QUESTIONS).map((generator) => {
    const rand = makeRand(hashSeed(`${profile.id}:${date}:${generator.id}`));
    return toQuestion(generator.id, generator.make(rand, ctx), rand);
  });
}

/**
 * Cinco jugadas del catálogo, sin repetir ninguna hasta haberlo dado entero.
 * El mazo se baraja otra vez en cada vuelta, así que la segunda ronda no llega
 * en el mismo orden que la primera.
 */
function tacticQuestions(profileId: ProfileId, date: DateKey): GameQuestion[] {
  const perCycle = Math.max(1, Math.floor(TACTICS.length / GAME_QUESTIONS));
  const nth = roundIndex(date);
  const cycle = Math.floor(nth / perCycle);
  const slot = mod(nth, perCycle);

  const deck = shuffle(TACTICS, makeRand(hashSeed(`${profileId}:tactica:vuelta${cycle}`)));
  const chosen = deck.slice(slot * GAME_QUESTIONS, slot * GAME_QUESTIONS + GAME_QUESTIONS);

  return chosen.map((seed) =>
    toQuestion(
      seed.id,
      {
        icon: seed.icon,
        prompt: seed.prompt,
        correct: seed.correct,
        wrong: [...seed.wrong],
        explain: seed.explain,
      },
      makeRand(hashSeed(`${profileId}:${date}:${seed.id}`)),
    ),
  );
}

/* ---------------------------------------------------------------------------
 * Lo que se guarda
 *
 * Una línea de texto en las notas del día: `juego|aciertos|contestadas|total|
 * momento`. Cabe en lo que ya viaja a la nube, así que el juego no necesita
 * ninguna tabla nueva ni ningún cambio en el esquema.
 * ------------------------------------------------------------------------- */

export function encodeGameResult(result: GameResult): string {
  return [result.game, result.correct, result.answered, result.total, result.at].join('|');
}

export function parseGameResult(text: string | undefined | null): GameResult | null {
  if (!text) return null;

  const [game, correct, answered, total, at] = text.split('|');
  if (game !== 'logica' && game !== 'tactica') return null;

  const numbers = [correct, answered, total].map(Number);
  if (numbers.some((value) => !Number.isFinite(value)) || numbers[2] <= 0) return null;

  return {
    game,
    correct: Math.max(0, Math.min(numbers[0], numbers[2])),
    answered: Math.max(0, Math.min(numbers[1], numbers[2])),
    total: numbers[2],
    at: at ?? '',
  };
}

/** La partida anotada ese día, si la hubo. */
export function gameResultFor(
  entries: Record<string, DayEntry>,
  profileId: ProfileId,
  date: DateKey,
): GameResult | null {
  const result = parseGameResult(entries[entryKey(profileId, date)]?.notes?.[GAME_NOTE_KEY]);

  // Una partida anotada de un juego que ese día no tocaba sólo puede venir de
  // haber cambiado la rotación: se ignora, porque sus preguntas ya no existen.
  return result && result.game === gameForDate(date) ? result : null;
}

/** ¿Contestadas las cinco? */
export function isGameDone(result: GameResult): boolean {
  return result.answered >= result.total;
}

/** Pleno: las cinco de cinco. */
export function isGamePerfect(result: GameResult): boolean {
  return isGameDone(result) && result.correct === result.total;
}

/**
 * Qué premio merece la partida:
 *
 *  - menos de 3 aciertos  → nada, y mañana otra oportunidad;
 *  - 3 ó 4                → cromo de cantera;
 *  - pleno                → cromo de los grandes;
 *  - tercer pleno seguido → leyenda.
 *
 * `perfectRun` es la racha de plenos consecutivos contando éste, que es lo
 * que hace falta saber para el premio gordo.
 */
export function gameTier(result: GameResult, perfectRun: number): ChallengeTier | null {
  if (!isGameDone(result) || result.correct < GAME_PASS) return null;
  if (result.correct < result.total) return 'base';
  return perfectRun > 0 && perfectRun % PERFECT_FOR_LEGEND === 0 ? 'maximo' : 'reto';
}
