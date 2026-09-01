import { findMetric, getCategories } from '@/lib/habits';
import { PROFILES } from '@/lib/profiles';
import type {
  Companion,
  Metric,
  PlanBlock,
  PlanKind,
  PlanMirror,
  ProfileId,
  WeekPlan,
} from '@/types';

/* =========================================================================
 *  Agenda semanal: la semana tipo de cada uno.
 *
 *  Es la otra mitad de la app. Los hábitos cuentan lo que **pasó**; esto
 *  aparta el rato en el que debería pasar: el entreno del martes, la lectura
 *  antes de dormir, la clase de las once, la cena de los cuatro. Una rutina,
 *  no una cita —de las citas ya se encarga la sección de tareas, que tiene
 *  fecha y se tacha—, así que un bloque vive en un día de la semana y vuelve
 *  todas las semanas hasta que se cambie.
 *
 *  Lo que le da sentido es el enganche: cada rato puede declarar de qué
 *  hábito es (`metricId`) y cuánto pretende aportar (`amount`). Con eso,
 *  `lib/planCheck.ts` compara el plan con lo registrado y puede decir si la
 *  semana se está cumpliendo, dónde falta y dónde sobra.
 *
 *  Se guarda como los campogramas y los ajustes: una clave de
 *  `localStorage`, fechada, que la nube reconcilia con la regla de siempre
 *  —gana la última escritura—, de modo que la agenda se ve igual en el móvil
 *  de María y en el de Víctor.
 * ========================================================================= */

export const PLAN_KEY = 'habitos-familia:agenda';

/**
 * Marca de la agenda que nadie ha tocado. Cualquier cambio real es más
 * reciente, así que un aparato recién estrenado adopta la de la nube en vez
 * de imponer su semana en blanco.
 */
const NEVER = '1970-01-01T00:00:00.000Z';

/**
 * Tope de ratos por perfil. Más que esto y la semana deja de leerse.
 *
 * Ciento veinte se quedaban cortos desde que la semana se rellena copiando:
 * la de Víctor ya ronda los noventa ratos y copiar un lunes completo en los
 * cuatro días siguientes sumaba cincuenta de golpe. Doscientos son
 * veintiocho al día, que sigue siendo una semana legible y ya no se choca
 * con el tope por rellenar rápido.
 */
export const MAX_BLOCKS = 200;

/* ---------------------------------------------------------------------------
 * Catálogo
 * ------------------------------------------------------------------------- */

export const DAY_NAMES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

export const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface KindMeta {
  label: string;
  icon: string;
  /**
   * La gama del área, en grados de tono: por dónde empieza el degradado y por
   * dónde acaba. De aquí sale el color de cada rato, y de aquí sale también
   * el margen dentro del que un tema puede desviarse sin salirse del área.
   */
  hue: number;
  hueTo: number;
  /** Cuánto color lleva. El trabajo es gris a propósito; el ocio, no. */
  sat: number;
  /** `true` en lo que ocupa tiempo activo; lo lee el aviso de sobrecarga. */
  busy: boolean;
}

/**
 * Las doce áreas. El tono es el que tenían los degradados de Tailwind con los
 * que se pintaron hasta ahora, para que la semana no cambie de color de un día
 * para otro: cole azul, deporte verde, comida ámbar, trabajo acero…
 */
export const PLAN_KINDS: Record<PlanKind, KindMeta> = {
  cole: { label: 'Cole', icon: '🎒', hue: 199, hueTo: 221, sat: 84, busy: true },
  deporte: { label: 'Deporte', icon: '⚽', hue: 158, hueTo: 142, sat: 70, busy: true },
  estudio: { label: 'Estudio', icon: '📚', hue: 187, hueTo: 201, sat: 80, busy: true },
  comida: { label: 'Comida', icon: '🍽️', hue: 43, hueTo: 25, sat: 90, busy: false },
  sueno: { label: 'Sueño', icon: '🌙', hue: 239, hueTo: 264, sat: 66, busy: false },
  ocio: { label: 'Ocio', icon: '🎮', hue: 292, hueTo: 273, sat: 78, busy: false },
  trabajo: { label: 'Trabajo', icon: '💼', hue: 215, hueTo: 217, sat: 18, busy: true },
  casa: { label: 'Casa', icon: '🧹', hue: 82, hueTo: 152, sat: 66, busy: true },
  juntos: { label: 'En familia', icon: '🏡', hue: 27, hueTo: 350, sat: 86, busy: false },
  pareja: { label: 'En pareja', icon: '💞', hue: 351, hueTo: 333, sat: 82, busy: false },
  cuidado: { label: 'Cuidado', icon: '🫶', hue: 172, hueTo: 192, sat: 68, busy: false },
  otro: { label: 'Otro', icon: '📌', hue: 240, hueTo: 240, sat: 5, busy: true },
};

export const PLAN_KIND_LIST = Object.keys(PLAN_KINDS) as PlanKind[];

/* ---------------------------------------------------------------------------
 * El color de un rato
 *
 * El área manda —cole azul, deporte verde—, pero dentro de un área no todo es
 * lo mismo: en la semana de Víctor «análisis del rival», «reunión de staff» y
 * «gimnasio del cuerpo técnico» eran los tres el mismo gris, y en la de los
 * peques el cole y la extraescolar del cole eran el mismo azul. Doce colores
 * para ochenta ratos es un código que ya no distingue nada.
 *
 * Así que el tono lo pone el área y el **tema** —el nombre del rato— lo
 * desvía un poco: unos grados de tono, algo de saturación y algo de claridad,
 * siempre dentro de la gama. Dos ratos del mismo tipo se siguen leyendo como
 * hermanos; dos ratos distintos ya no se confunden. Y como el desvío sale del
 * nombre, el mismo rato es del mismo color el lunes y el jueves, y en la
 * cuadrícula, en la lista del día y en la leyenda.
 * ------------------------------------------------------------------------- */

/** Número estable a partir del nombre. El mismo texto, el mismo color. */
function topicSeed(text: string): number {
  const clean = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  let hash = 2166136261;
  for (let i = 0; i < clean.length; i += 1) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
}

/** Los dos extremos del degradado de un rato, en color resuelto. */
export interface BlockPalette {
  /** Arranque del degradado, el tono claro. */
  from: string;
  /** Final del degradado, el tono hondo. */
  to: string;
  /** Un color sólo, para puntos y filetes. */
  solid: string;
}

const clampHue = (value: number) => ((value % 360) + 360) % 360;

/**
 * Gama del área sin desviar. Es la de la leyenda y la de las barras de
 * reparto, donde lo que se nombra es el área entera y no un rato.
 */
export function kindPalette(kind: PlanKind): BlockPalette {
  const meta = PLAN_KINDS[kind] ?? PLAN_KINDS.otro;
  return {
    from: `hsl(${meta.hue} ${meta.sat}% 58%)`,
    to: `hsl(${clampHue(meta.hueTo)} ${meta.sat}% 42%)`,
    solid: `hsl(${meta.hue} ${meta.sat}% 50%)`,
  };
}

/**
 * Gama del área, desviada por el tema. `title` es el tema: lo que hace que la
 * natación y el cole, los dos azules, no sean el mismo azul.
 */
export function topicPalette(kind: PlanKind, title: string): BlockPalette {
  const meta = PLAN_KINDS[kind] ?? PLAN_KINDS.otro;
  const clean = title.trim();
  if (!clean) return kindPalette(kind);

  const seed = topicSeed(clean);
  /** Tres tiradas independientes del mismo número: tono, claridad y color. */
  const roll = (bits: number) => ((seed >> bits) % 1009) / 1008;

  /**
   * Cuánto se puede desviar.
   *
   * En un área con color —el verde del deporte— con dieciséis grados de tono
   * ya se distinguen dos ratos sin que ninguno deje de ser verde. En un área
   * casi gris —el acero del trabajo, con un 18 % de saturación— desviar el
   * tono no se ve: ahí lo que separa un tema de otro es **cuánto** color
   * lleva, así que el gris se abre en una familia de aceros, del casi neutro
   * al azulado, y con más recorrido de tono porque a esas saturaciones sigue
   * leyéndose como el mismo material.
   */
  const pale = meta.sat < 30;
  const shift = (roll(0) - 0.5) * 2 * (pale ? 26 : 16);
  const light = (roll(7) - 0.5) * 2 * (pale ? 7 : 6);
  const sat = pale
    ? Math.min(40, meta.sat + roll(15) * 20)
    : Math.max(6, Math.min(94, meta.sat + (roll(15) - 0.5) * 2 * 10));

  return {
    from: `hsl(${clampHue(meta.hue + shift)} ${sat}% ${58 + light}%)`,
    to: `hsl(${clampHue(meta.hueTo + shift)} ${sat}% ${42 + light}%)`,
    solid: `hsl(${clampHue(meta.hue + shift)} ${sat}% ${50 + light}%)`,
  };
}

/** El color de un rato concreto: su área, matizada por su nombre. */
export function blockPalette(block: PlanBlock): BlockPalette {
  return topicPalette(block.kind, block.title);
}

/** El degradado listo para un `style`, en la dirección que se pida. */
export function gradientOf(palette: BlockPalette, angle = '145deg'): string {
  return `linear-gradient(${angle}, ${palette.from}, ${palette.to})`;
}

interface CompanionMeta {
  label: string;
  /** Cómo se dice en una pastilla estrecha. */
  short: string;
  icon: string;
}

/**
 * Con quién están los peques. `cole` cubre el colegio, el club y cualquier
 * sitio donde quedan a cargo de otros: lo que importa aquí es que en ese rato
 * no hace falta que esté nadie de casa.
 */
export const COMPANIONS: Record<Companion, CompanionMeta> = {
  mama: { label: 'Con mamá', short: 'Mamá', icon: '👩' },
  papa: { label: 'Con papá', short: 'Papá', icon: '👨' },
  ambos: { label: 'Con mamá y papá', short: 'Los dos', icon: '👨‍👩‍👦' },
  abuelos: { label: 'Con los abuelos', short: 'Abuelos', icon: '👵' },
  solos: { label: 'Solos', short: 'Solos', icon: '🧒' },
  cole: { label: 'En el cole o el club', short: 'Cole/Club', icon: '🏫' },
  otro: { label: 'Con otra persona', short: 'Otros', icon: '🙋' },
};

export const COMPANION_LIST = Object.keys(COMPANIONS) as Companion[];

/* ---------------------------------------------------------------------------
 * Aspecto de cada agenda
 *
 * La sección se llama distinta y se adorna distinta según de quién sea. No es
 * capricho: a un peque de ocho años la semana le entra por el campo y por
 * Oliver y Benji, y a esa misma cuadrícula, con filete dorado y serif, María
 * la lee como su agenda. Los colores no están aquí —los pone el tinte del
 * perfil—: sólo el rótulo, el adorno y lo que se dice.
 * ------------------------------------------------------------------------- */

/** Adorno de la cabecera: campo de fútbol, filete dorado, acero, calidez. */
export type PlanOrnament = 'pitch' | 'gold' | 'steel' | 'warm' | 'rose';

export interface PlannerTheme {
  title: string;
  icon: string;
  /** Una línea bajo el título. */
  kicker: string;
  /** Cómo se llama un rato en su idioma: «jugada», «bloque», «momento». */
  blockWord: string;
  /** Y en plural. */
  blockWords: string;
  ornament: PlanOrnament;
  /** Se enseña una, la que toque por el día. */
  quotes: string[];
}

export const PLANNER_THEMES: Record<ProfileId, PlannerTheme> = {
  leo: {
    title: 'Alineación de la semana',
    icon: '🏟️',
    kicker: 'Tu once semanal: dónde estás, qué toca y quién está contigo',
    blockWord: 'jugada',
    blockWords: 'jugadas',
    ornament: 'pitch',
    quotes: [
      '«El balón es tu amigo.» — Oliver Atom',
      '¡Hala Madrid! Los domingos se ganan entre semana.',
      '«Si te caes, te levantas y sigues corriendo.» — Benji Price',
      'El que entrena el martes gana el domingo.',
      'Un buen delantero también empieza por dormir bien.',
      'Nada es imposible si le pones corazón.',
      'Semana bien planteada, medio partido ganado.',
    ],
  },
  hugo: {
    title: 'Alineación de la semana',
    icon: '🏟️',
    kicker: 'Tu once semanal: dónde estás, qué toca y quién está contigo',
    blockWord: 'jugada',
    blockWords: 'jugadas',
    ornament: 'pitch',
    quotes: [
      '«El balón es tu amigo.» — Oliver Atom',
      '¡Hala Madrid! Los domingos se ganan entre semana.',
      '«Nunca dejes de intentarlo.» — Benji Price',
      'Récord propio: sólo compites contigo.',
      'Constancia de lunes a domingo, como en el Bernabéu.',
      'El que llega antes al entreno ya va ganando.',
      'Cada semana, un peldaño más.',
    ],
  },
  maria: {
    title: 'Mi semana',
    icon: '🕊️',
    kicker: 'Aula, cuidado y tiempo propio, cada cosa en su hueco',
    blockWord: 'momento',
    blockWords: 'momentos',
    ornament: 'gold',
    quotes: [
      'Lo que se reserva en la agenda, se vive.',
      'Un hueco para ti también sostiene la casa.',
      'Clases, pausas y lectura: en ese orden se cuida la voz.',
      'La semana no se improvisa: se compone.',
    ],
  },
  victor: {
    title: 'Plan semanal',
    icon: '📐',
    kicker: 'Carga, descanso y trabajo, repartidos con criterio',
    blockWord: 'bloque',
    blockWords: 'bloques',
    ornament: 'steel',
    quotes: [
      'La semana se planifica; el día sólo se ejecuta.',
      'El descanso es parte del plan, no lo que sobra.',
      'Lo que no está en el reparto, no ocurre.',
      'Carga alta pide sueño alto.',
    ],
  },
  familia: {
    title: 'Semana en familia',
    icon: '🗓️',
    kicker: 'Quién hace qué, y con quién están los peques',
    blockWord: 'plan',
    blockWords: 'planes',
    ornament: 'warm',
    quotes: [
      'La logística de la semana, en una sola pantalla.',
      'Comidas juntos y rutina de acostarse: eso es lo que sostiene.',
      'Lo que está apartado en la semana deja de ser una discusión.',
    ],
  },
  pareja: {
    title: 'Nuestra semana',
    icon: '🕯️',
    kicker: 'El rato de los dos, apartado antes de que se llene',
    blockWord: 'momento',
    blockWords: 'momentos',
    ornament: 'rose',
    quotes: [
      'El tiempo de los dos se aparta antes, no se busca después.',
      'Diez minutos de check-in valen más que una noche suelta al mes.',
      'Lo que no se reserva, se lo come la semana.',
    ],
  },
};

export function themeOf(profileId: ProfileId): PlannerTheme {
  return PLANNER_THEMES[profileId] ?? PLANNER_THEMES.familia;
}

/* ---------------------------------------------------------------------------
 * Ratos de uso corriente
 *
 * Lo que se apunta noventa de cada cien veces, ya atado a su hábito. Sin esto
 * el enganche entre agenda y registro sería teórico: nadie va a buscar a mano
 * el identificador de una métrica para atárselo a un bloque.
 * ------------------------------------------------------------------------- */

/**
 * Las áreas en las que se reparten los ratos de un toque.
 *
 * El `kind` dice de qué va el rato para pintarlo en la cuadrícula —trabajo,
 * deporte, comida—; esto dice de qué **tema** es, que no es lo mismo: el
 * análisis del rival y la reunión de staff son los dos «trabajo», y aun así
 * quien monta la semana los busca en sitios distintos. Con doce ratos daba
 * igual y bastaba una fila; con cincuenta hay que poder ir al tema y elegir
 * dentro. Es opcional: quien no lo declare sigue teniendo su fila de siempre.
 */
export const PRESET_GROUPS = {
  profesional: { label: 'Profesional', icon: '📋' },
  aula: { label: 'Aula y alumnos', icon: '👩‍🏫' },
  cole: { label: 'Cole y deberes', icon: '🎒' },
  master: { label: 'Máster', icon: '🎓' },
  desarrollo: { label: 'Desarrollo personal', icon: '✨' },
  deporte: { label: 'Deporte', icon: '🏃' },
  rutinas: { label: 'Comidas y rutinas', icon: '🍽️' },
  ocio: { label: 'Juego y ocio', icon: '🎮' },
  familia: { label: 'Familia', icon: '🏡' },
  casa: { label: 'Casa y tareas', icon: '🧹' },
  economia: { label: 'Economía', icon: '💶' },
  descanso: { label: 'Descanso y salud', icon: '🌙' },
} as const;

export type PresetGroupId = keyof typeof PRESET_GROUPS;

export const PRESET_GROUP_LIST = Object.keys(PRESET_GROUPS) as PresetGroupId[];

export interface PlanPreset {
  title: string;
  icon: string;
  kind: PlanKind;
  /** Tema en el que se busca este rato. Sin él va en la lista corrida. */
  group?: PresetGroupId;
  /** Hora habitual; sólo es la propuesta de partida. */
  start: string;
  duration: number;
  metricId?: string;
  amount?: number;
  companion?: Companion;
}

const kidPresets: PlanPreset[] = [
  /* --- Cole y deberes ------------------------------------------------------ */
  {
    title: 'Camino al cole',
    icon: '🚶',
    kind: 'cole',
    group: 'cole',
    start: '08:30',
    duration: 20,
    metricId: 'luz_manana',
    companion: 'mama',
  },
  {
    title: 'Cole',
    icon: '🎒',
    kind: 'cole',
    group: 'cole',
    start: '09:00',
    duration: 300,
    companion: 'cole',
  },
  {
    title: 'Deberes',
    icon: '✍️',
    kind: 'estudio',
    group: 'cole',
    start: '17:00',
    duration: 30,
    metricId: 'escritura',
    amount: 2,
    companion: 'mama',
  },
  {
    title: 'Repaso de examen',
    icon: '📝',
    kind: 'estudio',
    group: 'cole',
    start: '18:30',
    duration: 30,
    metricId: 'repaso_examen',
    amount: 30,
    companion: 'mama',
  },
  {
    title: 'Lectura',
    icon: '📖',
    kind: 'estudio',
    group: 'cole',
    start: '21:00',
    duration: 20,
    metricId: 'lectura',
    amount: 20,
    companion: 'papa',
  },

  /* --- Deporte -------------------------------------------------------------- */
  {
    title: 'Entreno de fútbol',
    icon: '⚽',
    kind: 'deporte',
    group: 'deporte',
    start: '17:30',
    duration: 90,
    metricId: 'sport.futbol.asistencia',
    companion: 'papa',
  },
  {
    title: 'Partido',
    icon: '🏆',
    kind: 'deporte',
    group: 'deporte',
    start: '11:00',
    duration: 90,
    metricId: 'sport.futbol.asistencia',
    companion: 'papa',
  },
  {
    title: 'Natación',
    icon: '🏊',
    kind: 'deporte',
    group: 'deporte',
    start: '18:00',
    duration: 60,
    metricId: 'sport.natacion.asistencia',
    companion: 'mama',
  },
  {
    title: 'Arte marcial',
    icon: '🥋',
    kind: 'deporte',
    group: 'deporte',
    start: '18:00',
    duration: 60,
    metricId: 'sport.marcial.asistencia',
    companion: 'mama',
  },
  {
    title: 'Gimnasio',
    icon: '🤸',
    kind: 'deporte',
    group: 'deporte',
    start: '18:00',
    duration: 60,
    metricId: 'sport.gimnasio.asistencia',
    companion: 'papa',
  },
  {
    title: 'Atletismo',
    icon: '🏃',
    kind: 'deporte',
    group: 'deporte',
    start: '18:00',
    duration: 60,
    metricId: 'sport.atletismo.asistencia',
    companion: 'papa',
  },
  {
    title: 'Parque o bici',
    icon: '🛴',
    kind: 'deporte',
    group: 'deporte',
    start: '17:00',
    duration: 60,
    metricId: 'actividad_diaria',
    amount: 60,
    companion: 'abuelos',
  },

  /* --- Comidas y rutinas ----------------------------------------------------- */
  {
    title: 'Desayuno',
    icon: '🥣',
    kind: 'comida',
    group: 'rutinas',
    start: '07:45',
    duration: 20,
    metricId: 'desayuno',
    companion: 'mama',
  },
  {
    title: 'Merienda',
    icon: '🥪',
    kind: 'comida',
    group: 'rutinas',
    start: '17:00',
    duration: 20,
    // Sin cantidad a propósito: la merienda aporta fruta, pero las cinco
    // raciones del día no salen de ella, y declarar «1» dejaría el plan
    // marcado como corto todos los días.
    metricId: 'fruta_verdura',
    companion: 'abuelos',
  },
  {
    title: 'Cena',
    icon: '🍽️',
    kind: 'comida',
    group: 'rutinas',
    start: '20:30',
    duration: 40,
    metricId: 'plato_sano',
    companion: 'ambos',
  },
  {
    title: 'Ducha y pijama',
    icon: '🚿',
    kind: 'casa',
    group: 'rutinas',
    start: '20:00',
    duration: 20,
    companion: 'ambos',
  },

  /* --- Juego y ocio ----------------------------------------------------------- */
  {
    title: 'Pantallas',
    icon: '📱',
    kind: 'ocio',
    group: 'ocio',
    start: '19:00',
    duration: 60,
    metricId: 'pantallas_ocio',
    amount: 60,
    companion: 'solos',
  },
  {
    title: 'Juego libre',
    icon: '🧩',
    kind: 'ocio',
    group: 'ocio',
    start: '19:00',
    duration: 45,
    metricId: 'actividad_diaria',
    amount: 45,
    companion: 'solos',
  },

  /* --- Descanso ----------------------------------------------------------------- */
  {
    title: 'Sin pantallas antes de dormir',
    icon: '📵',
    kind: 'sueno',
    group: 'descanso',
    start: '21:00',
    duration: 60,
    metricId: 'sin_pantallas_noche',
    companion: 'ambos',
  },
  {
    title: 'A la cama',
    icon: '🌙',
    kind: 'sueno',
    group: 'descanso',
    start: '21:30',
    duration: 30,
    metricId: 'hora_cama',
    companion: 'ambos',
  },
  {
    title: 'A dormir',
    icon: '🛏️',
    kind: 'sueno',
    group: 'descanso',
    start: '22:00',
    duration: 600,
    metricId: 'horas_sueno',
    amount: 10,
    companion: 'ambos',
  },
];

const mariaPresets: PlanPreset[] = [
  /* --- Aula y alumnos ------------------------------------------------------ */
  {
    title: 'Clase online',
    icon: '💻',
    kind: 'trabajo',
    group: 'aula',
    start: '10:00',
    duration: 60,
    metricId: 'clases_impartidas',
    amount: 1,
  },
  {
    title: 'Preparar clases',
    icon: '📝',
    kind: 'trabajo',
    group: 'aula',
    start: '09:00',
    duration: 45,
    metricId: 'prep_clases',
    amount: 45,
  },
  {
    title: 'Corrección de tareas',
    icon: '✅',
    kind: 'trabajo',
    group: 'aula',
    start: '16:00',
    duration: 45,
    metricId: 'correccion',
  },
  {
    title: 'Feedback a alumnos',
    icon: '💬',
    kind: 'trabajo',
    group: 'aula',
    start: '16:45',
    duration: 30,
    metricId: 'feedback_alumnos',
  },
  {
    title: 'Material didáctico',
    icon: '🧩',
    kind: 'trabajo',
    group: 'aula',
    start: '12:00',
    duration: 45,
    metricId: 'material',
  },
  {
    title: 'Redes y captación',
    icon: '📣',
    kind: 'trabajo',
    group: 'aula',
    start: '13:00',
    duration: 30,
    metricId: 'captacion',
  },
  {
    title: 'Pausa de voz',
    icon: '🗣️',
    kind: 'cuidado',
    group: 'aula',
    start: '12:00',
    duration: 15,
    metricId: 'cuidado_voz',
  },
  {
    title: 'Cierre de jornada',
    icon: '🔕',
    kind: 'trabajo',
    group: 'aula',
    start: '18:00',
    duration: 15,
    metricId: 'cierre_jornada',
  },

  /* --- Deporte y cuidado ---------------------------------------------------- */
  {
    title: 'Pilates o paseo',
    icon: '🚴',
    kind: 'cuidado',
    group: 'deporte',
    start: '08:00',
    duration: 45,
    metricId: 'movimiento',
    amount: 45,
  },
  {
    title: 'Fuerza',
    icon: '💪',
    kind: 'cuidado',
    group: 'deporte',
    start: '08:00',
    duration: 40,
    metricId: 'fuerza',
  },
  {
    title: 'Paseo largo',
    icon: '👟',
    kind: 'cuidado',
    group: 'deporte',
    start: '19:00',
    duration: 40,
    metricId: 'pasos',
  },
  {
    title: 'Pausa consciente',
    icon: '🧘',
    kind: 'cuidado',
    group: 'deporte',
    start: '15:30',
    duration: 15,
    metricId: 'pausa_consciente',
  },

  /* --- Desarrollo personal --------------------------------------------------- */
  {
    title: 'Lectura',
    icon: '📖',
    kind: 'ocio',
    group: 'desarrollo',
    start: '22:00',
    duration: 30,
    metricId: 'lectura',
    amount: 30,
  },
  {
    title: 'Escritura',
    icon: '✍️',
    kind: 'estudio',
    group: 'desarrollo',
    start: '07:30',
    duration: 20,
    metricId: 'escritura',
    amount: 20,
  },
  {
    title: 'Diario',
    icon: '📔',
    kind: 'cuidado',
    group: 'desarrollo',
    start: '22:30',
    duration: 10,
    metricId: 'diario',
  },

  /* --- Comidas y familia ------------------------------------------------------ */
  {
    title: 'Desayuno',
    icon: '🥣',
    kind: 'comida',
    group: 'rutinas',
    start: '08:00',
    duration: 20,
    metricId: 'comidas',
    amount: 1,
  },
  {
    title: 'Comida en familia',
    icon: '🍽️',
    kind: 'comida',
    group: 'rutinas',
    start: '14:00',
    duration: 60,
    metricId: 'comidas',
    amount: 1,
  },
  {
    title: 'Cena en familia',
    icon: '🌆',
    kind: 'comida',
    group: 'rutinas',
    start: '21:00',
    duration: 45,
    metricId: 'plato_sano',
  },

  /* --- Descanso ---------------------------------------------------------------- */
  {
    title: 'Rutina de sueño',
    icon: '🌙',
    kind: 'sueno',
    group: 'descanso',
    start: '23:00',
    duration: 30,
    metricId: 'sin_pantallas_noche',
  },
  {
    title: 'A dormir',
    icon: '🛏️',
    kind: 'sueno',
    group: 'descanso',
    start: '23:30',
    duration: 450,
    metricId: 'horas_sueno',
    amount: 7.5,
  },
];

const victorPresets: PlanPreset[] = [
  /* --- Profesional: el oficio de cuerpo técnico, tema a tema ------------- */
  {
    title: 'Preparación de la sesión',
    icon: '📐',
    kind: 'trabajo',
    group: 'profesional',
    start: '09:00',
    duration: 60,
    metricId: 'prep_sesion',
    amount: 60,
  },
  {
    title: 'Entrenamiento del equipo',
    icon: '🏟️',
    kind: 'trabajo',
    group: 'profesional',
    start: '10:30',
    duration: 120,
  },
  {
    title: 'Partido',
    icon: '🏆',
    kind: 'trabajo',
    group: 'profesional',
    start: '12:00',
    duration: 120,
  },
  {
    title: 'Análisis táctico · partido',
    icon: '🎬',
    kind: 'trabajo',
    group: 'profesional',
    start: '16:00',
    duration: 90,
    metricId: 'analisis_tactico',
    amount: 90,
  },
  {
    title: 'Análisis individual',
    icon: '👤',
    kind: 'trabajo',
    group: 'profesional',
    start: '16:00',
    duration: 45,
    metricId: 'analisis_tactico',
    amount: 45,
  },
  {
    title: 'Análisis rival · colectivo',
    icon: '🔍',
    kind: 'trabajo',
    group: 'profesional',
    start: '16:00',
    duration: 60,
    metricId: 'scouting',
  },
  {
    title: 'Análisis rival · individual',
    icon: '🕵️',
    kind: 'trabajo',
    group: 'profesional',
    start: '17:15',
    duration: 45,
    metricId: 'scouting',
  },
  {
    title: 'Análisis ABP propio',
    icon: '🎯',
    kind: 'trabajo',
    group: 'profesional',
    start: '16:00',
    duration: 45,
    metricId: 'analisis_tactico',
    amount: 45,
  },
  {
    title: 'Análisis ABP rival',
    icon: '🚩',
    kind: 'trabajo',
    group: 'profesional',
    start: '17:00',
    duration: 45,
    metricId: 'scouting',
  },
  {
    title: 'Análisis de la cultura de equipo',
    icon: '🧭',
    kind: 'trabajo',
    group: 'profesional',
    start: '16:00',
    duration: 45,
    metricId: 'cultura_equipo',
    amount: 45,
  },
  {
    title: 'Desarrollo de la cultura de equipo',
    icon: '🌱',
    kind: 'trabajo',
    group: 'profesional',
    start: '17:00',
    duration: 45,
    metricId: 'cultura_equipo',
    amount: 45,
  },
  {
    title: 'Microciclo · cultura de equipo',
    icon: '🗓️',
    kind: 'trabajo',
    group: 'profesional',
    start: '18:00',
    duration: 60,
    metricId: 'microciclo',
    amount: 60,
  },
  {
    title: 'Microciclo · ABP',
    icon: '📋',
    kind: 'trabajo',
    group: 'profesional',
    start: '18:00',
    duration: 60,
    metricId: 'microciclo',
    amount: 60,
  },
  {
    title: 'Reuniones individuales',
    icon: '🗣️',
    kind: 'trabajo',
    group: 'profesional',
    start: '12:45',
    duration: 30,
    metricId: 'charlas_jugadores',
    amount: 1,
  },
  {
    title: 'Reunión de staff',
    icon: '🤝',
    kind: 'trabajo',
    group: 'profesional',
    start: '09:00',
    duration: 45,
    metricId: 'reunion_cuerpo',
  },
  {
    title: 'Aprendizajes del micro',
    icon: '💡',
    kind: 'trabajo',
    group: 'profesional',
    start: '17:45',
    duration: 30,
    metricId: 'microciclo',
    amount: 30,
  },
  {
    title: 'Control de cargas',
    icon: '📈',
    kind: 'trabajo',
    group: 'profesional',
    start: '13:00',
    duration: 30,
    metricId: 'control_cargas',
  },
  {
    title: 'Feedback post-sesión',
    icon: '📝',
    kind: 'trabajo',
    group: 'profesional',
    start: '13:00',
    duration: 20,
    metricId: 'feedback_sesion',
  },
  {
    title: 'Desconexión al llegar',
    icon: '🔕',
    kind: 'casa',
    group: 'profesional',
    start: '20:00',
    duration: 30,
    metricId: 'desconexion',
  },

  /* --- Máster ------------------------------------------------------------- */
  {
    title: 'Clase del máster',
    icon: '🎓',
    kind: 'estudio',
    group: 'master',
    start: '19:00',
    duration: 120,
    metricId: 'master',
    amount: 120,
  },
  {
    title: 'Estudio del máster',
    icon: '📚',
    kind: 'estudio',
    group: 'master',
    start: '19:15',
    duration: 60,
    metricId: 'master',
    amount: 60,
  },
  {
    title: 'Trabajos y entregas',
    icon: '🖊️',
    kind: 'estudio',
    group: 'master',
    start: '18:00',
    duration: 90,
    metricId: 'master',
    amount: 90,
  },

  /* --- Desarrollo personal ------------------------------------------------ */
  {
    title: 'Lectura',
    icon: '📖',
    kind: 'ocio',
    group: 'desarrollo',
    start: '22:30',
    duration: 30,
    metricId: 'lectura',
    amount: 30,
  },
  {
    title: 'Escritura',
    icon: '✍️',
    kind: 'estudio',
    group: 'desarrollo',
    start: '07:30',
    duration: 20,
    metricId: 'escritura',
    amount: 20,
  },
  {
    title: 'Diario de reflexión',
    icon: '📔',
    kind: 'ocio',
    group: 'desarrollo',
    start: '22:30',
    duration: 10,
    metricId: 'diario',
  },
  {
    title: 'Formación y podcast',
    icon: '🎧',
    kind: 'estudio',
    group: 'desarrollo',
    start: '08:00',
    duration: 45,
    metricId: 'formacion',
    amount: 45,
  },
  {
    title: 'Pausa consciente',
    icon: '🧘',
    kind: 'cuidado',
    group: 'desarrollo',
    start: '15:30',
    duration: 10,
    metricId: 'pausa_consciente',
  },

  /* --- Deporte propio ------------------------------------------------------ */
  {
    title: 'Gimnasio',
    icon: '🏋️',
    kind: 'deporte',
    group: 'deporte',
    start: '07:00',
    duration: 60,
    metricId: 'entreno_propio',
    amount: 60,
  },
  {
    title: 'Correr',
    icon: '🏃',
    kind: 'deporte',
    group: 'deporte',
    start: '07:00',
    duration: 45,
    metricId: 'entreno_propio',
    amount: 45,
  },
  {
    title: 'Montaña',
    icon: '⛰️',
    kind: 'deporte',
    group: 'deporte',
    start: '09:00',
    duration: 240,
    metricId: 'entreno_propio',
    amount: 150,
  },
  {
    title: 'Fútbol',
    icon: '⚽',
    kind: 'deporte',
    group: 'deporte',
    start: '21:00',
    duration: 90,
    metricId: 'entreno_propio',
    amount: 90,
  },
  {
    title: 'Otro deporte',
    icon: '🚴',
    kind: 'deporte',
    group: 'deporte',
    start: '18:00',
    duration: 60,
    metricId: 'entreno_propio',
    amount: 60,
  },
  {
    title: 'Reto de la semana',
    icon: '🎯',
    kind: 'deporte',
    group: 'deporte',
    start: '18:00',
    duration: 30,
    metricId: 'entreno_propio',
    amount: 30,
  },
  {
    title: 'Movilidad y prevención',
    icon: '🤸',
    kind: 'cuidado',
    group: 'deporte',
    start: '07:00',
    duration: 20,
    metricId: 'movilidad',
  },
  {
    title: 'Paseo',
    icon: '👟',
    kind: 'cuidado',
    group: 'deporte',
    start: '14:00',
    duration: 30,
    metricId: 'pasos',
    amount: 3000,
  },

  /* --- Familia -------------------------------------------------------------- */
  {
    title: 'Desayuno',
    icon: '🥣',
    kind: 'comida',
    group: 'familia',
    start: '08:00',
    duration: 20,
    metricId: 'comidas',
    amount: 1,
  },
  {
    title: 'Comida en familia',
    icon: '🍲',
    kind: 'comida',
    group: 'familia',
    start: '14:30',
    duration: 60,
    metricId: 'comidas',
    amount: 1,
  },
  {
    title: 'Cena en familia',
    icon: '🍽️',
    kind: 'comida',
    group: 'familia',
    start: '21:00',
    duration: 45,
    metricId: 'plato_sano',
  },
  {
    title: 'Ocio en familia',
    icon: '🎲',
    kind: 'juntos',
    group: 'familia',
    start: '17:00',
    duration: 90,
    metricId: 'tiempo_hijos',
    amount: 90,
  },
  {
    title: 'Experiencias con los hijos',
    icon: '🧒',
    kind: 'juntos',
    group: 'familia',
    start: '17:00',
    duration: 120,
    metricId: 'tiempo_hijos',
    amount: 120,
  },
  {
    title: 'Tiempo con María',
    icon: '💞',
    kind: 'pareja',
    group: 'familia',
    start: '22:00',
    duration: 30,
    metricId: 'tiempo_pareja',
    amount: 30,
  },
  {
    title: 'Con los padres',
    icon: '👵',
    kind: 'juntos',
    group: 'familia',
    start: '12:00',
    duration: 90,
    metricId: 'gente_querida',
  },
  {
    title: 'Con los amigos',
    icon: '🍻',
    kind: 'ocio',
    group: 'familia',
    start: '21:00',
    duration: 120,
    metricId: 'gente_querida',
  },

  /* --- Casa y tareas -------------------------------------------------------- */
  {
    title: 'Responsabilidades de casa',
    icon: '🧹',
    kind: 'casa',
    group: 'casa',
    start: '12:30',
    duration: 60,
    metricId: 'tareas_casa',
  },
  {
    title: 'Tareas y recados',
    icon: '✅',
    kind: 'casa',
    group: 'casa',
    start: '18:00',
    duration: 45,
    metricId: 'gestiones',
  },
  {
    title: 'Compra',
    icon: '🛒',
    kind: 'casa',
    group: 'casa',
    start: '11:00',
    duration: 60,
    metricId: 'gestiones',
  },
  {
    title: 'Papeleo y gestiones',
    icon: '🗂️',
    kind: 'casa',
    group: 'casa',
    start: '17:00',
    duration: 45,
    metricId: 'gestiones',
  },
  {
    title: 'Organizar la semana',
    icon: '📆',
    kind: 'casa',
    group: 'casa',
    start: '19:00',
    duration: 30,
    metricId: 'organizar_semana',
  },

  /* --- Economía -------------------------------------------------------------- */
  {
    title: 'Apuntar los gastos',
    icon: '🧾',
    kind: 'casa',
    group: 'economia',
    start: '21:45',
    duration: 5,
    metricId: 'gastos_apuntados',
  },
  {
    title: 'Cuentas del mes',
    icon: '💶',
    kind: 'casa',
    group: 'economia',
    start: '17:00',
    duration: 45,
    metricId: 'cuentas',
    amount: 45,
  },
  {
    title: 'Facturas y pagos',
    icon: '📄',
    kind: 'casa',
    group: 'economia',
    start: '17:00',
    duration: 30,
    metricId: 'cuentas',
    amount: 30,
  },
  {
    title: 'Inversiones y ahorro',
    icon: '📊',
    kind: 'casa',
    group: 'economia',
    start: '18:00',
    duration: 30,
    metricId: 'cuentas',
    amount: 30,
  },

  /* --- Descanso y salud ------------------------------------------------------ */
  {
    title: 'Siesta corta',
    icon: '🌤️',
    kind: 'sueno',
    group: 'descanso',
    start: '15:00',
    duration: 20,
    metricId: 'descanso',
    amount: 20,
  },
  {
    title: 'A dormir',
    icon: '🌙',
    kind: 'sueno',
    group: 'descanso',
    start: '23:30',
    duration: 450,
    metricId: 'horas_sueno',
    amount: 7.5,
  },
  {
    title: 'Sin pantallas la última hora',
    icon: '📵',
    kind: 'sueno',
    group: 'descanso',
    start: '22:30',
    duration: 60,
    metricId: 'sin_pantallas_noche',
  },
  {
    title: 'Luz natural al levantarse',
    icon: '🌅',
    kind: 'cuidado',
    group: 'descanso',
    start: '08:00',
    duration: 10,
    metricId: 'luz_manana',
  },
];

const familiaPresets: PlanPreset[] = [
  {
    title: 'Desayuno juntos',
    icon: '🥣',
    kind: 'comida',
    start: '08:00',
    duration: 30,
    metricId: 'comidas_familia',
    amount: 1,
  },
  {
    title: 'Comida en familia',
    icon: '🍽️',
    kind: 'comida',
    start: '14:30',
    duration: 60,
    metricId: 'comidas_familia',
    amount: 1,
  },
  {
    title: 'Cena en familia',
    icon: '🌆',
    kind: 'comida',
    start: '21:00',
    duration: 45,
    metricId: 'comidas_familia',
    amount: 1,
  },
  {
    title: 'Rutina de acostarse',
    icon: '🌜',
    kind: 'sueno',
    start: '21:30',
    duration: 45,
    metricId: 'rutina_sueno',
  },
  {
    title: 'Juego juntos',
    icon: '🎲',
    kind: 'juntos',
    start: '18:00',
    duration: 45,
    metricId: 'tiempo_juego',
    amount: 45,
  },
  {
    title: 'Salida al aire libre',
    icon: '🌳',
    kind: 'juntos',
    start: '11:00',
    duration: 120,
    metricId: 'aire_libre',
  },
  {
    title: 'Peli o lectura en familia',
    icon: '📚',
    kind: 'juntos',
    start: '19:30',
    duration: 60,
    metricId: 'lectura_conjunta',
  },
  {
    title: 'Tareas del hogar',
    icon: '🧹',
    kind: 'casa',
    start: '10:00',
    duration: 60,
    metricId: 'tareas_hogar',
  },
  {
    title: 'Consejo de familia',
    icon: '🗣️',
    kind: 'juntos',
    start: '19:00',
    duration: 30,
    metricId: 'consejo_familia',
  },
  {
    title: 'Rutina de fin de semana',
    icon: '🌞',
    kind: 'juntos',
    start: '10:00',
    duration: 90,
    metricId: 'rutina_finde',
  },
];

const parejaPresets: PlanPreset[] = [
  {
    title: 'Check-in del día',
    icon: '💬',
    kind: 'pareja',
    start: '22:30',
    duration: 10,
    metricId: 'check_in',
  },
  {
    title: 'Rato sin pantallas',
    icon: '⏳',
    kind: 'pareja',
    start: '22:00',
    duration: 30,
    metricId: 'tiempo_pareja',
    amount: 30,
  },
  {
    title: 'Cita a solas',
    icon: '🍷',
    kind: 'pareja',
    start: '21:00',
    duration: 120,
    metricId: 'cita',
  },
  {
    title: 'Paseo juntos',
    icon: '🌆',
    kind: 'pareja',
    start: '19:00',
    duration: 45,
    metricId: 'paseo',
  },
  {
    title: 'Planificar la semana',
    icon: '📆',
    kind: 'pareja',
    start: '20:00',
    duration: 30,
    metricId: 'planificacion',
  },
  {
    title: 'Gesto de agradecimiento',
    icon: '🙏',
    kind: 'pareja',
    start: '23:00',
    duration: 5,
    metricId: 'gratitud',
  },
];

export const PLAN_PRESETS: Record<ProfileId, PlanPreset[]> = {
  leo: kidPresets,
  hugo: kidPresets,
  maria: mariaPresets,
  victor: victorPresets,
  familia: familiaPresets,
  pareja: parejaPresets,
};

export function presetsOf(profileId: ProfileId): PlanPreset[] {
  return PLAN_PRESETS[profileId] ?? [];
}

export interface PresetGroup {
  id: PresetGroupId;
  label: string;
  icon: string;
  presets: PlanPreset[];
}

/**
 * Los ratos de un toque repartidos por tema, en el orden del catálogo y sin
 * temas vacíos. Devuelve la lista vacía cuando el perfil no los declara: eso
 * es lo que le dice a la pantalla que los enseñe corridos, como siempre.
 */
export function presetGroupsOf(profileId: ProfileId): PresetGroup[] {
  const presets = presetsOf(profileId);
  if (!presets.some((preset) => preset.group)) return [];

  return PRESET_GROUP_LIST.map((id) => ({
    id,
    ...PRESET_GROUPS[id],
    presets: presets.filter((preset) => preset.group === id),
  })).filter((group) => group.presets.length > 0);
}

/* ---------------------------------------------------------------------------
 * Horas y solapes
 * ------------------------------------------------------------------------- */

/** Minutos desde medianoche de un `HH:MM`. Lo que no lo sea vale 0. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h)) return 0;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

export function timeOf(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = `${Math.floor(total / 60)}`.padStart(2, '0');
  const m = `${total % 60}`.padStart(2, '0');
  return `${h}:${m}`;
}

/** «17:30 – 19:00». Lo que cruza la medianoche se dobla al día siguiente. */
export function rangeOf(block: PlanBlock): string {
  return `${block.start} – ${timeOf(minutesOf(block.start) + block.duration)}`;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** ¿Se pisan dos ratos del mismo día? */
export function overlap(a: PlanBlock, b: PlanBlock): boolean {
  if (a.day !== b.day) return false;
  const startA = minutesOf(a.start);
  const startB = minutesOf(b.start);
  return startA < startB + b.duration && startB < startA + a.duration;
}

/**
 * ¿Cabe uno entero dentro del otro?
 *
 * Es la forma normal de que dos ratos verdaderos ocupen la misma hora: la
 * natación de los peques es en el propio colegio, así que la hora de natación
 * vive dentro de las cinco de cole. No hay nada que corregir ahí, y por eso
 * ni lleva filete rojo ni sale en los avisos: se pinta encima, como en
 * cualquier calendario.
 */
export function nested(a: PlanBlock, b: PlanBlock): boolean {
  if (a.day !== b.day) return false;
  const fromA = minutesOf(a.start);
  const fromB = minutesOf(b.start);
  const toA = fromA + a.duration;
  const toB = fromB + b.duration;
  /**
   * Uno tiene que ser **más largo** que el otro. Dos ratos con la misma hora
   * y la misma duración se envuelven mutuamente si sólo se miran los
   * extremos, y ésos son justo el peor choque que hay: la clase de las cinco
   * y la natación de las cinco no son «una dentro de la otra», son una encima
   * de la otra, y eso hay que decirlo.
   */
  if (fromA <= fromB && toB <= toA && toA - fromA > toB - fromB) return true;
  return fromB <= fromA && toA <= toB && toB - fromB > toA - fromA;
}

/**
 * ¿Pueden pasar los dos a la vez?
 *
 * Uno dentro del otro, o cualquiera de los dos marcado como simultáneo en su
 * editor —que es lo que cubre los solapes a medias: la reunión que empieza
 * diez minutos antes de que acabe la clase—. Y un rato reflejado de otra
 * agenda tampoco «se pisa» con lo propio en el sentido de que haya que
 * arreglarlo: se ve, se sabe, y quien decide es quien mira.
 */
export function simultaneous(a: PlanBlock, b: PlanBlock): boolean {
  if (a.overlapOk || b.overlapOk) return true;
  return nested(a, b);
}

/** ¿Chocan de verdad? Se pisan **y** no pueden pasar los dos. */
export function clashing(a: PlanBlock, b: PlanBlock): boolean {
  return overlap(a, b) && !simultaneous(a, b);
}

export function sortBlocks(blocks: PlanBlock[]): PlanBlock[] {
  return [...blocks].sort((a, b) =>
    a.day !== b.day ? a.day - b.day : minutesOf(a.start) - minutesOf(b.start),
  );
}

export function blocksOfDay(plan: WeekPlan, day: number): PlanBlock[] {
  return sortBlocks(plan.blocks.filter((block) => block.day === day));
}

/** Minutos que ese día ocupa lo que de verdad ocupa (ni sueño ni comidas). */
export function busyMinutes(blocks: PlanBlock[]): number {
  return blocks.reduce(
    (total, block) => total + (PLAN_KINDS[block.kind]?.busy ? block.duration : 0),
    0,
  );
}

/** Días de la semana con algo apartado. Mide cuánto hay definido ya. */
export function daysFilled(plan: WeekPlan): number {
  return new Set(plan.blocks.map((block) => block.day)).size;
}

/**
 * Franja del día que hay que pintar para que la semana tipo se vea entera:
 * de la hora a la que empieza lo más temprano a la hora a la que acaba lo más
 * tardío, redondeada a horas justas. Lo que cruza la medianoche se corta ahí,
 * que es hasta donde llega la cuadrícula. Sin nada apartado se devuelve la
 * franja de mañana a noche, que es donde acaba cayendo casi todo.
 */
export function weekSpan(blocks: PlanBlock[]): { from: number; to: number } {
  if (blocks.length === 0) return { from: 8 * 60, to: 22 * 60 };

  let from = 24 * 60;
  let to = 0;

  for (const block of blocks) {
    const start = minutesOf(block.start);
    from = Math.min(from, start);
    to = Math.max(to, Math.min(24 * 60, start + block.duration));
  }

  from = Math.floor(from / 60) * 60;
  to = Math.ceil(to / 60) * 60;

  // Una semana de un solo rato no se lee en una franja de una hora.
  if (to - from < 4 * 60) to = Math.min(24 * 60, from + 4 * 60);
  return { from, to };
}

/** Fin del rato en minutos desde medianoche, cortado en la medianoche. */
export function endOf(block: PlanBlock): number {
  return Math.min(24 * 60, minutesOf(block.start) + Math.max(5, block.duration));
}

/** Un rato ya colocado en la cuadrícula: dónde cae y cuánto se ensancha. */
export interface PlacedBlock {
  block: PlanBlock;
  /** Dónde empieza a lo ancho de la columna, de 0 a 1. */
  left: number;
  /** Cuánto ocupa a lo ancho de la columna, de 0 a 1. */
  width: number;
  /**
   * Cuántos ratos lo envuelven: 0 el que va al fondo, 1 el que se pinta
   * dentro de él, 2 el que va dentro de ése. Es lo que hace que la natación
   * salga **encima** de la mancha del cole en vez de partir la columna en dos.
   */
  depth: number;
  /**
   * Con cuántos ratos choca de verdad. No es lo mismo que solaparse: lo que
   * cabe entero dentro de otro —o lo que está marcado como simultáneo— ocupa
   * la misma hora a propósito y no es un fallo del plan. Esto es lo que
   * decide si el rato lleva la marca roja.
   */
  clashes: number;
}

/**
 * Reparte en carriles los ratos de un día para que dos cosas a la misma hora
 * se pinten una al lado de la otra y no una encima de la otra.
 *
 * Lo hace **por racimos**, y ahí está la diferencia. Contar los carriles de
 * todo el día era lo que estropeaba una semana llena: en el miércoles de
 * Víctor bastaba que dos reuniones se pisaran a mediodía para que las otras
 * trece cosas del día se pintaran a media anchura, con medio día en blanco al
 * lado. Un racimo es lo que se solapa en cadena; en cuanto queda un hueco
 * limpio se cierra y el siguiente vuelve a empezar por la anchura entera.
 *
 * Y dentro del racimo cada rato **se ensancha** hasta topar: si sólo dos
 * cosas se pisan de tres carriles, ocupan lo que les corresponde y no un
 * tercio cada una.
 *
 * Lo que **cabe entero dentro** de otro no entra en ese reparto: se pinta
 * encima, metido hacia dentro, como en cualquier calendario. La natación es
 * en el propio colegio, así que la hora de natación va sobre la mancha de las
 * cinco de cole y no le roba media columna —ni la marca en rojo, porque las
 * dos cosas pasan de verdad—.
 */
export function laneLayout(blocks: PlanBlock[]): {
  lanes: number;
  placed: PlacedBlock[];
} {
  interface Item {
    block: PlanBlock;
    from: number;
    to: number;
  }

  const items: Item[] = sortBlocks(blocks).map((block) => {
    const from = minutesOf(block.start);
    return { block, from, to: from + Math.max(5, block.duration) };
  });

  /**
   * Quién mete a quién. De cada rato se busca el contenedor **más ajustado**:
   * la natación va dentro del cole y no dentro de «todo el día», si los dos
   * la envuelven. La contención es estricta en duración, así que no puede
   * haber ciclos ni dos ratos idénticos metiéndose el uno en el otro.
   */
  const parentOf = new Map<Item, Item | null>();
  for (const item of items) {
    let parent: Item | null = null;
    for (const other of items) {
      if (other === item) continue;
      const envelops =
        other.from <= item.from && item.to <= other.to && other.to - other.from > item.to - item.from;
      if (!envelops) continue;
      if (!parent || other.to - other.from < parent.to - parent.from) parent = other;
    }
    parentOf.set(item, parent);
  }

  const childrenOf = new Map<Item | null, Item[]>();
  for (const item of items) {
    const parent = parentOf.get(item) ?? null;
    const brood = childrenOf.get(parent) ?? [];
    brood.push(item);
    childrenOf.set(parent, brood);
  }

  /** Con cuántos choca cada uno. Lo simultáneo a propósito no cuenta. */
  const clashesOf = new Map<PlanBlock, number>();
  for (const item of items) {
    clashesOf.set(
      item.block,
      items.filter((other) => other !== item && clashing(item.block, other.block)).length,
    );
  }

  const placed: PlacedBlock[] = [];
  let widest = 1;

  /**
   * Coloca un grupo de hermanos dentro del trozo de columna que les toca, y
   * mete a sus hijos en un trozo aún más estrecho del suyo.
   */
  const place = (group: Item[], depth: number, area: { left: number; width: number }) => {
    /** El racimo que se está formando: lo que sigue abierto a esta hora. */
    let cluster: Array<{ item: Item; lane: number }> = [];
    /** Hasta qué minuto llega lo más tardío del racimo. */
    let clusterEnd = -1;

    const flush = () => {
      if (cluster.length === 0) return;

      const lanes = cluster.reduce((max, entry) => Math.max(max, entry.lane + 1), 1);
      if (depth === 0) widest = Math.max(widest, lanes);

      for (const entry of cluster) {
        let span = 1;
        while (
          entry.lane + span < lanes &&
          !cluster.some(
            (other) =>
              other.lane === entry.lane + span &&
              other.item.from < entry.item.to &&
              entry.item.from < other.item.to,
          )
        ) {
          span += 1;
        }

        const left = area.left + (entry.lane / lanes) * area.width;
        const width = (span / lanes) * area.width;

        placed.push({
          block: entry.item.block,
          left,
          width,
          depth,
          clashes: clashesOf.get(entry.item.block) ?? 0,
        });

        /**
         * Y lo que va dentro de él, en su mismo trozo de columna. El sangrado
         * que lo hace parecer «dentro» no se pone aquí sino al pintarlo, en
         * píxeles: quitarle a un hijo una cuarta parte del ancho se lee bien
         * en una pantalla grande y fatal en un móvil, donde la columna del
         * martes mide ochenta píxeles y la natación se quedaba en sesenta —el
         * ancho justo al que la pastilla deja de poder enseñar su nombre—.
         */
        const brood = childrenOf.get(entry.item);
        if (brood && brood.length > 0) place(brood, depth + 1, { left, width });
      }

      cluster = [];
      clusterEnd = -1;
    };

    for (const item of group) {
      // Lo que empieza cuando ya no queda nada abierto abre racimo nuevo.
      if (item.from >= clusterEnd) flush();

      let lane = 0;
      while (cluster.some((entry) => entry.lane === lane && entry.item.to > item.from)) lane += 1;

      cluster.push({ item, lane });
      clusterEnd = Math.max(clusterEnd, item.to);
    }

    flush();
  };

  place(childrenOf.get(null) ?? [], 0, { left: 0, width: 1 });

  return { lanes: widest, placed };
}

/* ---------------------------------------------------------------------------
 * Lo que la semana dice de sí misma
 *
 * Tres lecturas que no salen de mirar la cuadrícula y que hacen falta en tres
 * sitios distintos: el reparto por tipo (en el análisis), lo que se aparta
 * para un hábito concreto (en los retos) y el hueco libre más largo del día
 * (en los avisos). Viven aquí y no en cada pantalla para que las tres cuenten
 * lo mismo.
 * ------------------------------------------------------------------------- */

export interface KindShare {
  kind: PlanKind;
  minutes: number;
  blocks: number;
}

/** Reparto de lo apartado por tipo de rato, de más minutos a menos. */
export function kindShare(blocks: PlanBlock[]): KindShare[] {
  const totals = new Map<PlanKind, KindShare>();

  for (const block of blocks) {
    const entry = totals.get(block.kind) ?? { kind: block.kind, minutes: 0, blocks: 0 };
    entry.minutes += block.duration;
    entry.blocks += 1;
    totals.set(block.kind, entry);
  }

  return Array.from(totals.values()).sort((a, b) => b.minutes - a.minutes);
}

export interface MetricPlan {
  /** Ratos de la semana atados a ese hábito. */
  blocks: PlanBlock[];
  /** Minutos que suman. */
  minutes: number;
  /** Lo que declaran aportar, si lo declaran. */
  amount: number;
  /** Días distintos en los que cae, ordenados. */
  days: number[];
}

const NO_METRIC_PLAN: MetricPlan = { blocks: [], minutes: 0, amount: 0, days: [] };

/**
 * Qué aparta la semana tipo para un hábito. Es lo que permite decirle a un
 * reto si tiene hueco reservado o si se está pidiendo a base de fuerza de
 * voluntad. Las cinco actividades deportivas cuentan como una: un reto de
 * deporte lo cubre el entreno de fútbol o el de natación, da igual cuál.
 */
export function plannedForMetric(plan: WeekPlan, metricId: string): MetricPlan {
  if (!metricId) return NO_METRIC_PLAN;

  const sport = metricId.startsWith('sport.');
  const blocks = plan.blocks.filter((block) => {
    if (!block.metricId) return false;
    if (block.metricId === metricId) return true;
    return sport && block.metricId.startsWith('sport.');
  });

  if (blocks.length === 0) return NO_METRIC_PLAN;

  return {
    blocks: sortBlocks(blocks),
    minutes: blocks.reduce((total, block) => total + block.duration, 0),
    amount: blocks.reduce((total, block) => total + (block.amount ?? 0), 0),
    days: Array.from(new Set(blocks.map((block) => block.day))).sort((a, b) => a - b),
  };
}

/**
 * El hueco libre más largo de un día, dentro de la franja de vigilia.
 * Devuelve dónde empieza y cuánto dura, que es lo que hace falta para
 * proponer un rato que de verdad quepa.
 */
export function longestGap(
  blocks: PlanBlock[],
  from = 7 * 60,
  to = 23 * 60,
): { start: number; minutes: number } {
  const busy = sortBlocks(blocks)
    .map((block) => [minutesOf(block.start), endOf(block)] as const)
    .filter(([, end]) => end > from)
    .sort((a, b) => a[0] - b[0]);

  let cursor = from;
  let best = { start: from, minutes: 0 };

  for (const [start, end] of busy) {
    if (start > cursor) {
      const gap = Math.min(start, to) - cursor;
      if (gap > best.minutes) best = { start: cursor, minutes: gap };
    }
    cursor = Math.max(cursor, end);
    if (cursor >= to) break;
  }

  if (to - cursor > best.minutes) best = { start: cursor, minutes: Math.max(0, to - cursor) };
  return best;
}

/**
 * A qué hora apartar algo nuevo en un día concreto: en el hueco libre más
 * largo que tenga, y si no cabe en ninguno, a la hora de siempre.
 *
 * Es lo que convierte «apartarle un rato» en un botón que se pulsa sin
 * mirar. Proponer las seis de la tarde por defecto lo dejaba encima del
 * entreno la mitad de las veces, y entonces lo primero que había que hacer
 * con el rato recién apartado era moverlo.
 */
export function bestSlot(plan: WeekPlan, day: number, duration = 45): string {
  const gap = longestGap(blocksOfDay(plan, day));
  if (gap.minutes < duration) return '18:00';

  // Pegado al principio del hueco, con un respiro de cinco minutos cuando lo
  // hay: dos cosas seguidas se leen mejor que dos cosas pegadas.
  const air = gap.minutes - duration >= 10 ? 5 : 0;
  return timeOf(gap.start + air);
}

/* ---------------------------------------------------------------------------
 * Altas
 * ------------------------------------------------------------------------- */

/** Identificador propio. `crypto` está en todos los navegadores que soporta la app. */
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `plan-${Math.random().toString(36).slice(2)}`;
}

/**
 * Un rato de los de siempre, listo para colocar.
 *
 * Con el perfil delante se decide además quién manda sobre la cantidad. Casi
 * todos los ratos de siempre declaran exactamente los minutos que duran —la
 * lectura de veinte minutos aporta veinte— y ésos se dejan al reloj, que es
 * lo que hace que estirarlos suba también lo previsto. Los pocos en los que
 * no coincide a propósito —el partido del finde ocupa cuatro horas y son dos
 * y media de deporte— llegan con la cantidad clavada, porque ahí la cifra es
 * un criterio y no una cuenta.
 */
export function blockFromPreset(preset: PlanPreset, day: number, profileId?: ProfileId): PlanBlock {
  const metric =
    profileId && preset.metricId ? findMetric(profileId, preset.metricId) : undefined;

  const pinned =
    preset.amount !== undefined &&
    metric !== undefined &&
    amountScale(metric) !== null &&
    amountForDuration(metric, preset.duration) !== preset.amount;

  return {
    id: newId(),
    day,
    start: preset.start,
    duration: preset.duration,
    title: preset.title,
    icon: preset.icon,
    kind: preset.kind,
    metricId: preset.metricId,
    amount: preset.amount,
    amountLock: pinned ? true : undefined,
    companion: preset.companion,
  };
}

export function emptyBlock(day: number, start = '17:00'): PlanBlock {
  return {
    id: newId(),
    day,
    start,
    duration: 60,
    title: '',
    icon: '📌',
    kind: 'otro',
  };
}

/**
 * Un rato ya preparado para un hábito concreto, listo para abrir el editor
 * encima. Es lo que hace que desde un reto sin hueco se pueda apartar el
 * hueco de un toque en vez de volver a la agenda a buscarlo a mano.
 *
 * Si hay un rato de siempre atado a ese hábito, se usa ése entero —nombre,
 * emoji, hora y cantidad incluidos—, que es lo que ya sabemos que encaja. Si
 * no lo hay, se monta uno con el nombre del propio hábito.
 */
export function blockForMetric(
  profileId: ProfileId,
  metric: Metric,
  day: number,
  start?: string,
): PlanBlock {
  const preset = presetsOf(profileId).find((item) => item.metricId === metric.id);

  if (preset) {
    const block = blockFromPreset(preset, day, profileId);
    return start ? { ...block, start } : block;
  }

  const amount =
    metric.type === 'counter' || metric.type === 'duration' ? metric.target : undefined;

  return {
    id: newId(),
    day,
    start: start ?? '18:00',
    duration: metric.type === 'duration' ? Math.max(15, Math.min(180, metric.target)) : 45,
    title: metric.label,
    icon: metric.icon || '🔗',
    kind: 'otro',
    metricId: metric.id,
    amount,
  };
}

/**
 * Métricas del perfil que tiene sentido atar a un rato, agrupadas por
 * categoría. Se dejan fuera las de contexto (`weight: 0`), que no son hábitos
 * sino interruptores —«época de exámenes»—, y las marcas de récord, que se
 * apuntan al terminar y no se planifican.
 */
export interface MetricChoice {
  categoryLabel: string;
  categoryIcon: string;
  metrics: Metric[];
}

export function linkableMetrics(profileId: ProfileId): MetricChoice[] {
  return getCategories(profileId)
    .map((category) => ({
      categoryLabel: category.label,
      categoryIcon: category.icon,
      metrics: category.metrics.filter(
        (metric) => (metric.weight ?? 1) > 0 && !metric.id.startsWith('reto.'),
      ),
    }))
    .filter((group) => group.metrics.length > 0);
}

/** La métrica atada a un rato, si sigue existiendo en el catálogo. */
export function metricOf(profileId: ProfileId, block: PlanBlock): Metric | undefined {
  return block.metricId ? findMetric(profileId, block.metricId) : undefined;
}

/** Unidad en la que se mide lo que aporta el rato («min», «vasos»…). */
export function amountUnit(metric: Metric | undefined): string | null {
  if (!metric) return null;
  if (metric.type === 'counter' || metric.type === 'duration') return metric.unit;
  return null;
}

/* ---------------------------------------------------------------------------
 * La cantidad que se lleva sola
 *
 * Casi todo lo que se ata a un rato se mide en tiempo: minutos de lectura, de
 * estudio, de movimiento, horas de sueño. En esos casos la cantidad prevista y
 * lo que dura el bloque son la misma cifra dicha dos veces, y mantenerlas a
 * mano era el fallo silencioso de toda la sección: se estiraba la lectura de
 * veinte a cuarenta minutos arrastrando el borde, la agenda decía cuarenta y
 * el hábito seguía comprobándose contra veinte. Nadie lo notaba hasta que la
 * semana daba por cumplido lo que no lo estaba.
 *
 * Así que la cantidad la lleva el reloj. Cambiar la duración —arrastrando,
 * estirando, con el teclado o escribiéndola en el editor— cambia lo previsto,
 * y quien quiera separarlas lo dice escribiendo la cifra a mano: eso deja
 * puesto `amountLock` y el reloj no vuelve a tocarla.
 *
 * Sólo vale para hábitos medidos en tiempo. Los vasos de agua, los toques de
 * balón o las flexiones no salen de lo que dure el rato, así que ahí no se
 * toca nada.
 * ------------------------------------------------------------------------- */

/**
 * En qué se convierte un minuto de reloj para esa métrica, o `null` si la
 * métrica no se mide en tiempo y por tanto no puede seguir a la duración.
 */
export function amountScale(metric: Metric | undefined): number | null {
  if (!metric || metric.type !== 'duration') return null;
  const unit = metric.unit.trim().toLowerCase();
  if (unit === 'min' || unit === 'mín' || unit === 'minutos') return 1;
  if (unit === 'h' || unit === 'horas') return 1 / 60;
  // Segundos, repeticiones y demás: no salen del reloj de la agenda.
  return null;
}

/** ¿Le lleva el reloj la cantidad a este rato? */
export function amountFollowsClock(metric: Metric | undefined, block: PlanBlock): boolean {
  return !block.amountLock && amountScale(metric) !== null;
}

/**
 * La cantidad que le corresponde a una duración, redondeada al paso de la
 * métrica: media hora de sueño es 0,5 h y no 0,4999.
 */
export function amountForDuration(metric: Metric, duration: number): number {
  const scale = amountScale(metric) ?? 1;
  const step = 'step' in metric && metric.step > 0 ? metric.step : 1;
  const raw = duration * scale;
  const snapped = Math.round(raw / step) * step;
  // El paso puede ser 0,25: sin esto salen colas de coma flotante.
  return Math.round(snapped * 1000) / 1000;
}

/**
 * El mismo rato con la cantidad puesta al día. Es lo que se llama en cada
 * alta y en cada cambio, para que no haya forma de guardar un bloque cuya
 * duración y cuya cantidad prevista digan cosas distintas.
 */
export function withClockAmount(profileId: ProfileId, block: PlanBlock): PlanBlock {
  if (!block.metricId || block.amountLock) return block;

  const metric = findMetric(profileId, block.metricId);
  if (!metric || amountScale(metric) === null) return block;

  const amount = amountForDuration(metric, block.duration);
  return amount === block.amount ? block : { ...block, amount };
}

/**
 * Cuánto cambiaría lo previsto al dejar el rato en esa duración, para poder
 * decirlo en el aviso: «40 min, y la lectura del martes pasa a 40 min».
 * Devuelve `null` cuando la cantidad no la lleva el reloj.
 */
export function clockAmountChange(
  profileId: ProfileId,
  block: PlanBlock,
  duration: number,
): { amount: number; unit: string; label: string } | null {
  if (!block.metricId || block.amountLock) return null;

  const metric = findMetric(profileId, block.metricId);
  // La comprobación del tipo va aparte de la escala porque es la que deja al
  // compilador saber que esta métrica tiene unidad.
  if (!metric || metric.type !== 'duration' || amountScale(metric) === null) return null;

  const amount = amountForDuration(metric, duration);
  if (amount === block.amount) return null;

  return { amount, unit: metric.unit, label: `${amount} ${metric.unit}` };
}

/* ---------------------------------------------------------------------------
 * Semana de ejemplo
 *
 * Una agenda vacía no enseña nada, y montar veinte ratos a mano antes de ver
 * para qué sirven es pedir demasiado. Esto deja una semana verosímil de un
 * toque, ya atada a los hábitos, para editarla encima.
 * ------------------------------------------------------------------------- */

/** `[día, título del preset, hora]`; la hora sobreescribe la del preset. */
type SeedRow = [number, string, string?];

const KID_SEED: SeedRow[] = [
  // Lunes a viernes: la misma columna vertebral —desayuno, camino al cole,
  // cole, merienda— y luego lo de cada día. Las horas van pensadas para que
  // nada se pise: la semana de ejemplo no puede saltarse sus propios avisos.
  [0, 'Desayuno', '07:45'], [0, 'Camino al cole', '08:30'], [0, 'Cole', '09:00'],
  [0, 'Merienda', '17:00'], [0, 'Deberes', '17:30'], [0, 'Entreno de fútbol', '18:00'],
  [0, 'Ducha y pijama', '19:45'], [0, 'Cena', '20:15'], [0, 'Lectura', '21:00'],
  [0, 'A la cama', '21:30'],

  [1, 'Desayuno', '07:45'], [1, 'Camino al cole', '08:30'], [1, 'Cole', '09:00'],
  [1, 'Merienda', '17:00'], [1, 'Deberes', '17:30'], [1, 'Natación', '18:15'],
  [1, 'Ducha y pijama', '19:45'], [1, 'Cena', '20:15'], [1, 'Lectura', '21:00'],
  [1, 'A la cama', '21:30'],

  [2, 'Desayuno', '07:45'], [2, 'Camino al cole', '08:30'], [2, 'Cole', '09:00'],
  [2, 'Merienda', '17:00'], [2, 'Entreno de fútbol', '17:30'], [2, 'Ducha y pijama', '19:45'],
  [2, 'Cena', '20:15'], [2, 'Lectura', '21:00'], [2, 'A la cama', '21:30'],

  [3, 'Desayuno', '07:45'], [3, 'Camino al cole', '08:30'], [3, 'Cole', '09:00'],
  [3, 'Merienda', '17:00'], [3, 'Deberes', '17:30'], [3, 'Arte marcial', '18:15'],
  [3, 'Ducha y pijama', '19:45'], [3, 'Cena', '20:15'], [3, 'A la cama', '21:30'],

  [4, 'Desayuno', '07:45'], [4, 'Camino al cole', '08:30'], [4, 'Cole', '09:00'],
  [4, 'Merienda', '17:00'], [4, 'Pantallas', '17:30'], [4, 'Juego libre', '18:45'],
  [4, 'Ducha y pijama', '19:45'], [4, 'Cena', '20:15'], [4, 'A la cama', '22:00'],

  // Sábado: partido por la mañana y la tarde en la calle.
  [5, 'Desayuno', '09:30'], [5, 'Partido', '11:00'], [5, 'Parque o bici', '17:00'],
  [5, 'Merienda', '18:30'], [5, 'Pantallas', '19:00'], [5, 'Cena', '20:30'],
  [5, 'Lectura', '21:30'], [5, 'A la cama', '22:00'],

  // Domingo: aire libre, juego y los deberes que quedaban.
  [6, 'Desayuno', '09:30'], [6, 'Parque o bici', '11:00'], [6, 'Juego libre', '17:00'],
  [6, 'Merienda', '18:00'], [6, 'Deberes', '18:30'], [6, 'Cena', '20:15'],
  [6, 'Lectura', '21:00'], [6, 'A la cama', '21:30'],
];

const MARIA_SEED: SeedRow[] = [
  // El desayuno y la cena van los siete días: son las dos comidas que sostienen
  // la cuenta del día, y con ellas el plan deja de salir corto en «comidas».
  [0, 'Desayuno', '07:30'], [0, 'Pilates o paseo', '08:00'], [0, 'Preparar clases', '09:00'],
  [0, 'Clase online', '10:00'], [0, 'Clase online', '11:30'], [0, 'Clase online', '12:45'],
  [0, 'Comida en familia', '14:00'],
  [0, 'Corrección de tareas', '16:00'], [0, 'Cierre de jornada', '18:00'],
  [0, 'Cena en familia', '21:00'], [0, 'Lectura', '22:00'],

  [1, 'Escritura', '07:00'], [1, 'Desayuno', '07:30'], [1, 'Fuerza', '08:00'],
  [1, 'Clase online', '10:00'], [1, 'Clase online', '11:15'], [1, 'Pausa de voz', '12:30'],
  [1, 'Material didáctico', '13:00'], [1, 'Comida en familia', '14:00'],
  [1, 'Pausa consciente', '15:30'], [1, 'Clase online', '17:00'],
  [1, 'Cierre de jornada', '18:15'], [1, 'Cena en familia', '21:00'],
  [1, 'Rutina de sueño', '23:00'],

  [2, 'Desayuno', '07:30'], [2, 'Pilates o paseo', '08:00'], [2, 'Preparar clases', '09:00'],
  [2, 'Clase online', '10:00'], [2, 'Clase online', '11:30'], [2, 'Clase online', '12:45'],
  [2, 'Comida en familia', '14:00'],
  [2, 'Corrección de tareas', '16:00'], [2, 'Feedback a alumnos', '17:00'],
  [2, 'Cena en familia', '21:00'], [2, 'Lectura', '22:00'],

  [3, 'Escritura', '07:00'], [3, 'Desayuno', '07:30'], [3, 'Fuerza', '08:00'],
  [3, 'Clase online', '10:00'], [3, 'Clase online', '11:15'], [3, 'Redes y captación', '13:00'],
  [3, 'Comida en familia', '14:00'], [3, 'Pausa consciente', '15:30'],
  [3, 'Clase online', '17:00'], [3, 'Cierre de jornada', '18:15'],
  [3, 'Cena en familia', '21:00'], [3, 'Diario', '22:30'],

  [4, 'Desayuno', '07:30'], [4, 'Pilates o paseo', '08:00'], [4, 'Clase online', '10:00'],
  [4, 'Clase online', '11:30'], [4, 'Clase online', '12:45'],
  [4, 'Comida en familia', '14:00'], [4, 'Cierre de jornada', '15:00'],
  [4, 'Paseo largo', '19:00'], [4, 'Cena en familia', '21:00'], [4, 'Lectura', '22:00'],

  [5, 'Desayuno', '09:00'], [5, 'Pilates o paseo', '10:00'], [5, 'Comida en familia', '14:00'],
  [5, 'Lectura', '17:00'], [5, 'Cena en familia', '21:00'], [5, 'Rutina de sueño', '23:00'],

  [6, 'Desayuno', '09:00'], [6, 'Comida en familia', '14:00'], [6, 'Preparar clases', '18:00'],
  [6, 'Cena en familia', '21:00'], [6, 'Diario', '22:30'], [6, 'Rutina de sueño', '23:00'],
];

const VICTOR_SEED: SeedRow[] = [
  // Lunes: se recoge el partido —vídeo, individuales y aprendizajes del micro—.
  [0, 'Gimnasio', '07:00'], [0, 'Desayuno', '08:15'], [0, 'Reunión de staff', '09:00'],
  [0, 'Entrenamiento del equipo', '10:30'], [0, 'Control de cargas', '13:00'],
  [0, 'Comida en familia', '14:30'], [0, 'Análisis táctico · partido', '16:00'],
  [0, 'Aprendizajes del micro', '17:45'], [0, 'Desconexión al llegar', '20:00'],
  [0, 'Cena en familia', '21:00'], [0, 'Apuntar los gastos', '21:45'],
  [0, 'Lectura', '22:30'],
  // Martes: el rival, de lo colectivo a lo individual. Y clase del máster.
  [1, 'Correr', '07:00'], [1, 'Desayuno', '08:15'], [1, 'Preparación de la sesión', '09:00'],
  [1, 'Entrenamiento del equipo', '10:30'], [1, 'Feedback post-sesión', '13:00'],
  [1, 'Comida en familia', '14:30'], [1, 'Análisis rival · colectivo', '16:00'],
  [1, 'Análisis rival · individual', '17:15'], [1, 'Clase del máster', '19:00'],
  [1, 'Cena en familia', '21:15'], [1, 'Apuntar los gastos', '22:00'],
  // Miércoles: el día del balón parado, propio y del rival, y su microciclo.
  [2, 'Movilidad y prevención', '07:00'], [2, 'Escritura', '07:30'], [2, 'Desayuno', '08:15'],
  [2, 'Preparación de la sesión', '09:00'], [2, 'Entrenamiento del equipo', '10:30'],
  [2, 'Reuniones individuales', '12:45'], [2, 'Reuniones individuales', '13:20'],
  [2, 'Comida en familia', '14:30'],
  [2, 'Análisis ABP propio', '16:00'], [2, 'Análisis ABP rival', '17:00'],
  [2, 'Microciclo · ABP', '18:00'], [2, 'Desconexión al llegar', '20:00'],
  [2, 'Cena en familia', '21:00'], [2, 'Apuntar los gastos', '21:45'],
  [2, 'Lectura', '22:30'],
  // Jueves: la cultura de equipo, que también se prepara y se planifica.
  [3, 'Gimnasio', '07:00'], [3, 'Desayuno', '08:15'], [3, 'Preparación de la sesión', '09:00'],
  [3, 'Entrenamiento del equipo', '10:30'], [3, 'Control de cargas', '13:00'],
  [3, 'Comida en familia', '14:30'], [3, 'Análisis de la cultura de equipo', '16:00'],
  [3, 'Desarrollo de la cultura de equipo', '17:00'],
  [3, 'Microciclo · cultura de equipo', '18:00'], [3, 'Estudio del máster', '19:15'],
  [3, 'Cena en familia', '21:00'], [3, 'Apuntar los gastos', '21:45'],
  [3, 'Tiempo con María', '22:00'],
  // Viernes: individuales, cuentas y lo que quedó suelto de la semana.
  [4, 'Correr', '07:00'], [4, 'Desayuno', '08:15'], [4, 'Preparación de la sesión', '09:00'],
  [4, 'Entrenamiento del equipo', '10:30'], [4, 'Feedback post-sesión', '13:00'],
  [4, 'Comida en familia', '14:30'], [4, 'Análisis individual', '16:00'],
  [4, 'Cuentas del mes', '17:00'], [4, 'Tareas y recados', '18:00'],
  [4, 'Desconexión al llegar', '20:00'], [4, 'Cena en familia', '21:00'],
  [4, 'Apuntar los gastos', '21:45'], [4, 'Lectura', '22:30'],
  // Sábado: activación, casa y la tarde entera con los peques.
  [5, 'Desayuno', '08:15'], [5, 'Movilidad y prevención', '09:00'], [5, 'Entrenamiento del equipo', '10:00'],
  [5, 'Responsabilidades de casa', '12:30'], [5, 'Comida en familia', '14:30'],
  [5, 'Siesta corta', '15:30'], [5, 'Experiencias con los hijos', '17:00'],
  [5, 'Cena en familia', '21:00'], [5, 'Apuntar los gastos', '21:45'],
  [5, 'Lectura', '22:30'],
  // Domingo: partido, y después la semana que viene sobre la mesa.
  [6, 'Desayuno', '09:00'], [6, 'Partido', '12:00'], [6, 'Comida en familia', '14:30'],
  [6, 'Siesta corta', '16:00'], [6, 'Ocio en familia', '17:00'],
  [6, 'Organizar la semana', '19:00'], [6, 'Cena en familia', '21:00'],
  [6, 'Apuntar los gastos', '21:45'], [6, 'Diario de reflexión', '22:30'],
];

const FAMILIA_SEED: SeedRow[] = [
  // Dos comidas juntos al día, que es lo que pide la casilla, y la rutina de
  // acostarse justo detrás de la cena: pegadas, no pisándose.
  [0, 'Desayuno juntos', '07:45'], [0, 'Cena en familia'], [0, 'Rutina de acostarse', '21:45'],
  [1, 'Desayuno juntos', '07:45'], [1, 'Cena en familia'], [1, 'Juego juntos'],
  [1, 'Rutina de acostarse', '21:45'],
  [2, 'Desayuno juntos', '07:45'], [2, 'Cena en familia'], [2, 'Peli o lectura en familia'],
  [2, 'Rutina de acostarse', '21:45'],
  [3, 'Desayuno juntos', '07:45'], [3, 'Cena en familia'], [3, 'Juego juntos'],
  [3, 'Rutina de acostarse', '21:45'],
  [4, 'Desayuno juntos', '07:45'], [4, 'Cena en familia'],
  [4, 'Peli o lectura en familia'], [4, 'Rutina de acostarse', '22:00'],
  [5, 'Desayuno juntos', '09:30'], [5, 'Salida al aire libre'], [5, 'Comida en familia'],
  [5, 'Tareas del hogar', '17:00'], [5, 'Juego juntos'], [5, 'Cena en familia'],
  [6, 'Desayuno juntos', '09:30'], [6, 'Rutina de fin de semana'], [6, 'Comida en familia'],
  [6, 'Consejo de familia'], [6, 'Cena en familia'], [6, 'Rutina de acostarse', '21:45'],
];

const PAREJA_SEED: SeedRow[] = [
  [0, 'Check-in del día'],
  [1, 'Rato sin pantallas'], [1, 'Check-in del día'],
  [2, 'Check-in del día'], [2, 'Gesto de agradecimiento'],
  [3, 'Paseo juntos'], [3, 'Check-in del día'],
  [4, 'Cita a solas'],
  [5, 'Rato sin pantallas'], [5, 'Check-in del día'],
  [6, 'Planificar la semana'], [6, 'Check-in del día'],
];

const SEEDS: Record<ProfileId, SeedRow[]> = {
  leo: KID_SEED,
  hugo: KID_SEED,
  maria: MARIA_SEED,
  victor: VICTOR_SEED,
  familia: FAMILIA_SEED,
  pareja: PAREJA_SEED,
};

/** Semana de ejemplo del perfil, lista para guardar y editar encima. */
export function sampleWeek(profileId: ProfileId): PlanBlock[] {
  const presets = presetsOf(profileId);
  const blocks: PlanBlock[] = [];

  for (const [day, title, start] of SEEDS[profileId] ?? []) {
    const preset = presets.find((item) => item.title === title);
    if (!preset) continue;
    blocks.push({ ...blockFromPreset(preset, day, profileId), start: start ?? preset.start });
  }

  return sortBlocks(blocks);
}

/* ---------------------------------------------------------------------------
 * Lectura y escritura
 * ------------------------------------------------------------------------- */

export function emptyPlan(): WeekPlan {
  return { blocks: [], updatedAt: NEVER };
}

let cache: Record<string, WeekPlan> | null = null;
const listeners = new Set<() => void>();

const KIND_SET = new Set<string>(PLAN_KIND_LIST);
const COMPANION_SET = new Set<string>(COMPANION_LIST);

/** Deja pasar sólo lo que tiene forma de rato; lo demás se descarta. */
function normalizeBlock(value: unknown, index: number, profileId?: string): PlanBlock | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PlanBlock>;

  const day = Number(raw.day);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;

  const start =
    typeof raw.start === 'string' && /^\d{1,2}:\d{2}$/.test(raw.start) ? raw.start : null;
  if (!start) return null;

  const duration = Number(raw.duration);
  const amount = Number(raw.amount);

  const minutes = Number.isFinite(duration) ? Math.max(5, Math.min(720, duration)) : 60;
  const declared = raw.amount !== undefined && Number.isFinite(amount) ? amount : undefined;
  const metricId = typeof raw.metricId === 'string' && raw.metricId ? raw.metricId : undefined;

  /**
   * Las agendas guardadas antes de que la cantidad la llevara el reloj no
   * traen la marca de «esto lo he puesto yo», y las hay que dicen a propósito
   * algo distinto de lo que duran: el partido del finde ocupa cuatro horas y
   * son dos y media de deporte. Al leerlas se les clava la cifra, para que la
   * primera vez que se estire el bloque no se pierda ese criterio. Lo que ya
   * cuadraba con el reloj se queda al reloj, que es la mayoría.
   */
  const metric =
    profileId && metricId ? findMetric(profileId as ProfileId, metricId) : undefined;
  const drifted =
    declared !== undefined &&
    metric !== undefined &&
    amountScale(metric) !== null &&
    amountForDuration(metric, minutes) !== declared;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `plan-${index}`,
    day,
    start,
    duration: minutes,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 60) : '',
    icon: typeof raw.icon === 'string' && raw.icon ? raw.icon.slice(0, 4) : '📌',
    kind: typeof raw.kind === 'string' && KIND_SET.has(raw.kind) ? (raw.kind as PlanKind) : 'otro',
    metricId,
    amount: declared,
    amountLock: raw.amountLock === true || drifted ? true : undefined,
    companion:
      typeof raw.companion === 'string' && COMPANION_SET.has(raw.companion)
        ? (raw.companion as Companion)
        : undefined,
    overlapOk: raw.overlapOk === true ? true : undefined,
    note: typeof raw.note === 'string' && raw.note ? raw.note.slice(0, 240) : undefined,
    // `mirror` no se copia a propósito: un reflejo es de otra agenda y aquí
    // sólo se mira. Así no puede guardarse ni viajar a la nube por error.
  };
}

function normalize(value: unknown, profileId?: string): WeekPlan {
  const base = emptyPlan();
  if (!value || typeof value !== 'object') return base;

  const raw = value as Partial<WeekPlan>;
  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks
        .map((block, index) => normalizeBlock(block, index, profileId))
        .filter((block): block is PlanBlock => block !== null)
        .slice(0, MAX_BLOCKS)
    : [];

  return {
    blocks: sortBlocks(blocks),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
  };
}

export function loadPlans(): Record<string, WeekPlan> {
  if (cache) return cache;
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(PLAN_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, WeekPlan> = {};

    for (const [profileId, value] of Object.entries(parsed ?? {})) {
      out[profileId] = normalize(value, profileId);
    }

    cache = out;
  } catch {
    // Datos corruptos: mejor la semana en blanco que un panel roto.
    cache = {};
  }

  return cache;
}

export function planOf(profileId: ProfileId): WeekPlan {
  return loadPlans()[profileId] ?? emptyPlan();
}

/* ---------------------------------------------------------------------------
 * Reflejos: lo de los peques, en la agenda de quien los lleva
 *
 * La semana de Leo y la de Hugo ya dicen quién está con ellos en cada rato.
 * Esa información estaba encerrada en su agenda: para saber qué le caía
 * encima a María el jueves había que entrar en la de Leo, luego en la de Hugo,
 * y sumarlo de cabeza. Ahora sale donde hace falta: lo que lleva «con mamá»
 * —o «con los dos»— aparece en la semana de María, y lo de «con papá» en la de
 * Víctor, en su hora y con el color del peque.
 *
 * Son de sólo lectura a propósito. El rato sigue viviendo en la agenda del
 * peque: allí se cambia, allí se mueve y allí se quita, y así no hay dos
 * copias de la misma verdad que puedan separarse. Aquí se ven, se cuentan y
 * avisan de lo que se pisa con lo propio, que es justo lo que se necesitaba.
 * ------------------------------------------------------------------------- */

/** Qué acompañante de los peques trae el rato a cada adulto. */
const MIRROR_RULES: Partial<Record<ProfileId, Companion[]>> = {
  maria: ['mama', 'ambos'],
  victor: ['papa', 'ambos'],
};

/** ¿Este perfil recibe reflejos de los peques? */
export function takesMirrors(profileId: ProfileId): boolean {
  return MIRROR_RULES[profileId] !== undefined;
}

/** ¿Es un rato prestado de otra agenda? Entonces aquí no se toca. */
export function isMirror(block: PlanBlock): boolean {
  return block.mirror !== undefined;
}

/**
 * Los ratos de los peques que le tocan a este perfil, listos para pintarse
 * junto a los suyos.
 *
 * Se les quita la atadura al hábito a propósito: la lectura de Leo se
 * comprueba contra el registro de Leo, no contra el de María, y dejarla
 * puesta habría hecho que la semana de María dijera que le faltan hábitos que
 * no son suyos.
 */
export function mirrorBlocks(profileId: ProfileId): PlanBlock[] {
  const wanted = MIRROR_RULES[profileId];
  if (!wanted) return [];

  const plans = loadPlans();

  /**
   * Lo que hace que dos ratos sean **el mismo** rato: el día, la hora, lo que
   * dura, cómo se llama, de qué es y con quién. La natación de los hermanos
   * es una natación; si algo de eso no coincide —uno va con mamá y el otro
   * con los dos, o uno entra media hora antes— son dos planes distintos y
   * salen los dos, que es justo lo que hay que ver.
   */
  const sameness = (block: PlanBlock) =>
    [
      block.day,
      block.start,
      block.duration,
      block.title.trim().toLowerCase(),
      block.kind,
      block.icon,
      block.companion,
      block.note ?? '',
    ].join('|');

  const merged = new Map<string, PlanBlock>();

  for (const profile of PROFILES) {
    if (profile.kind !== 'kid') continue;
    const plan = plans[profile.id];
    if (!plan) continue;

    for (const block of plan.blocks) {
      if (!block.companion || !wanted.includes(block.companion)) continue;

      const kid = {
        profileId: profile.id,
        name: profile.name,
        avatar: profile.avatar,
        tint: profile.tint,
      };
      const key = sameness(block);
      const seen = merged.get(key);

      // El mismo rato de otro hermano: se le añade la cara y ya está.
      if (seen?.mirror) {
        if (seen.mirror.kids.some((item) => item.profileId === kid.profileId)) continue;
        const kids = [...seen.mirror.kids, kid];
        seen.mirror = {
          ...seen.mirror,
          kids,
          name: kids.map((item) => item.name).join(' y '),
          avatar: kids.map((item) => item.avatar).join(''),
        };
        continue;
      }

      merged.set(key, {
        ...block,
        id: `reflejo:${profile.id}:${block.id}`,
        metricId: undefined,
        amount: undefined,
        amountLock: undefined,
        mirror: {
          kids: [kid],
          name: kid.name,
          avatar: kid.avatar,
          tint: kid.tint,
          companion: block.companion,
        },
      });
    }
  }

  return sortBlocks(Array.from(merged.values()));
}

/**
 * El filete que marca un rato prestado: el color del peque, o los dos
 * colores partidos por la mitad cuando el rato es de los dos. Es lo que dice
 * de quién es sin gastar una línea de texto.
 */
export function mirrorRail(mirror: PlanMirror, angle = '180deg'): string {
  const stops = mirror.kids.map(
    (kid, index) =>
      `${kid.tint} ${((index / mirror.kids.length) * 100).toFixed(0)}% ${(((index + 1) / mirror.kids.length) * 100).toFixed(0)}%`,
  );
  return `linear-gradient(${angle}, ${stops.join(', ')})`;
}

/**
 * La semana de un perfil con los reflejos dentro. Es lo que se pinta; lo que
 * se guarda sigue siendo `planOf`.
 */
export function planWithMirrors(profileId: ProfileId, on = true): WeekPlan {
  const own = planOf(profileId);
  if (!on || !takesMirrors(profileId)) return own;

  const borrowed = mirrorBlocks(profileId);
  if (borrowed.length === 0) return own;

  return { ...own, blocks: sortBlocks([...own.blocks, ...borrowed]) };
}

/**
 * Minutos de la semana que este perfil pasa con los peques, por peque.
 *
 * Un rato compartido —la natación de los dos— cuenta para los dos: la
 * pregunta que contesta esta lista es «cuánto rato paso con cada uno», y esa
 * tarde se pasa con los dos a la vez. Por eso la suma de las filas puede ser
 * mayor que el rato apartado, y está bien que lo sea.
 */
export function mirrorShare(
  blocks: PlanBlock[],
): Array<{ profileId: ProfileId; name: string; avatar: string; tint: string; minutes: number; count: number }> {
  const totals = new Map<
    ProfileId,
    { profileId: ProfileId; name: string; avatar: string; tint: string; minutes: number; count: number }
  >();

  for (const block of blocks) {
    if (!block.mirror) continue;

    for (const kid of block.mirror.kids) {
      const row = totals.get(kid.profileId) ?? { ...kid, minutes: 0, count: 0 };
      row.minutes += block.duration;
      row.count += 1;
      totals.set(kid.profileId, row);
    }
  }

  return Array.from(totals.values()).sort((a, b) => b.minutes - a.minutes);
}

/**
 * Si se enseñan o no. Es una preferencia de cómo se mira, no un dato de la
 * casa, así que se queda en este aparato y no viaja a la nube: en el móvil de
 * María puede interesar verlos siempre y en el ordenador de Víctor no.
 */
const MIRROR_VIEW_KEY = 'habitos-familia:agenda-reflejos';

export function mirrorsShown(profileId: ProfileId): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(MIRROR_VIEW_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed?.[profileId] !== false;
  } catch {
    return true;
  }
}

export function showMirrors(profileId: ProfileId, on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(MIRROR_VIEW_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.localStorage.setItem(MIRROR_VIEW_KEY, JSON.stringify({ ...parsed, [profileId]: on }));
  } catch {
    // Modo privado o cuota llena: la preferencia vale para esta sesión.
  }
}

function commit(next: Record<string, WeekPlan>): void {
  cache = next;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PLAN_KEY, JSON.stringify(next));
    } catch {
      // Cuota llena o modo privado: vale para esta sesión. Una agenda que no
      // se recuerda molesta, pero no es un registro perdido.
    }
  }

  for (const listener of listeners) listener();
}

/**
 * Cambia la agenda de un perfil en este aparato y la fecha: eso es lo que la
 * hace viajar al resto.
 */
export function updatePlan(profileId: ProfileId, blocks: PlanBlock[]): WeekPlan {
  const next: WeekPlan = {
    // Los reflejos de otras agendas nunca se guardan aquí: son de quien los
    // tiene apartados, y aquí sólo se miraban.
    blocks: sortBlocks(blocks.filter((block) => !block.mirror)).slice(0, MAX_BLOCKS),
    updatedAt: new Date().toISOString(),
  };

  commit({ ...loadPlans(), [profileId]: next });
  return next;
}

/**
 * Alta o modificación de un rato, por identificador.
 *
 * Pasa por aquí todo lo que cambia un rato —el editor, el arrastre, el
 * estirón, las flechas del teclado—, así que es aquí donde la cantidad
 * prevista se pone al día con el reloj y no en cada sitio que lo llama.
 */
export function savePlanBlock(profileId: ProfileId, block: PlanBlock): WeekPlan {
  const current = planOf(profileId).blocks;
  const exists = current.some((item) => item.id === block.id);
  const synced = withClockAmount(profileId, block);

  return updatePlan(
    profileId,
    exists ? current.map((item) => (item.id === block.id ? synced : item)) : [...current, synced],
  );
}

export function removePlanBlock(profileId: ProfileId, id: string): WeekPlan {
  return updatePlan(
    profileId,
    planOf(profileId).blocks.filter((block) => block.id !== id),
  );
}

/** Varios ratos de golpe: es lo que hace apartar algo en cinco días a la vez. */
export function addPlanBlocks(profileId: ProfileId, blocks: PlanBlock[]): number {
  if (blocks.length === 0) return 0;

  const current = planOf(profileId).blocks;
  const room = Math.max(0, MAX_BLOCKS - current.length);
  const added = blocks.slice(0, room).map((block) => withClockAmount(profileId, block));

  if (added.length > 0) updatePlan(profileId, [...current, ...added]);
  return added.length;
}

export function clearDayPlan(profileId: ProfileId, day: number): number {
  const plan = planOf(profileId);
  const removed = plan.blocks.filter((block) => block.day === day).length;
  if (removed > 0) {
    updatePlan(
      profileId,
      plan.blocks.filter((block) => block.day !== day),
    );
  }
  return removed;
}

/* ---------------------------------------------------------------------------
 * Copiar, mover y repetir
 *
 * Una semana no se escribe: se repite. El martes se parece al jueves, la cena
 * es la misma cinco noches y el turno de mañana cae de lunes a viernes. Quien
 * monta su agenda a mano acaba tecleando veinte veces lo mismo, y a la tercera
 * lo deja a medias —que es exactamente lo que le pasa a una agenda a medio
 * rellenar: deja de servir para nada—.
 *
 * De ahí estas cuatro operaciones, que son las que de verdad se piden delante
 * de una semana en blanco: repetir un rato **otra vez el mismo día**, llevarlo
 * **a otros días**, copiar **un día entero** en los que se parezcan, y **mover
 * o intercambiar** días cuando la semana cambia de forma.
 *
 * Todas devuelven cuántos ratos han salido, cuántos se han quitado y cuántos
 * no han cabido, porque de eso vive el aviso que se enseña después —y el
 * «deshacer» que lo acompaña, que en la pantalla es devolver los ratos de
 * antes tal cual estaban.
 * ------------------------------------------------------------------------- */

/** Qué se hace con lo que ya hubiera en el día que recibe. */
export type CopyMode = 'anadir' | 'sustituir';

export interface CopyResult {
  /** Ratos creados. */
  copied: number;
  /** Ratos que había en el destino y se han quitado. */
  cleared: number;
  /** Los que no han cabido: la semana tiene tope. */
  dropped: number;
}

const NO_COPY: CopyResult = { copied: 0, cleared: 0, dropped: 0 };

/** Copia suelta de un rato: identificador propio y, si se dice, otro día. */
function copyOf(block: PlanBlock, day = block.day, start = block.start): PlanBlock {
  return { ...block, id: newId(), day, start };
}

/**
 * El mismo rato repartido en varios días, cada uno con identificador propio.
 * Es lo que se guarda al apartar el cole de lunes a viernes de una sentada: no
 * es una serie, son cinco ratos que a partir de ahí se tocan por separado.
 */
export function spreadBlock(block: PlanBlock, days: number[]): PlanBlock[] {
  const targets = days.filter((day) => day >= 0 && day <= 6);
  if (targets.length === 0) return [{ ...block }];

  return targets.map((day, index) =>
    index === 0 ? { ...block, day } : copyOf(block, day),
  );
}

/**
 * Mete ratos nuevos respetando el tope, quitando antes lo que hubiera en los
 * días indicados si se pide sustituir.
 */
function place(
  profileId: ProfileId,
  incoming: PlanBlock[],
  replaceDays: number[],
): CopyResult {
  if (incoming.length === 0) return NO_COPY;

  const current = planOf(profileId).blocks;
  const clear = new Set(replaceDays);
  const kept = clear.size > 0 ? current.filter((block) => !clear.has(block.day)) : current;

  const room = Math.max(0, MAX_BLOCKS - kept.length);
  const added = incoming.slice(0, room).map((block) => withClockAmount(profileId, block));
  if (added.length === 0 && kept.length === current.length) return NO_COPY;

  updatePlan(profileId, [...kept, ...added]);

  return {
    copied: added.length,
    cleared: current.length - kept.length,
    dropped: incoming.length - added.length,
  };
}

/** Los ratos de un día, copiados en otros. Es como se monta media semana. */
export function copyDayTo(
  profileId: ProfileId,
  from: number,
  days: number[],
  mode: CopyMode = 'anadir',
): CopyResult {
  const source = blocksOfDay(planOf(profileId), from);
  const targets = days.filter((day) => day !== from && day >= 0 && day <= 6);
  if (source.length === 0 || targets.length === 0) return NO_COPY;

  const incoming = targets.flatMap((day) => source.map((block) => copyOf(block, day)));
  return place(profileId, incoming, mode === 'sustituir' ? targets : []);
}

/** El día entero cambiado de sitio: llega a los destinos y se vacía el origen. */
export function moveDayTo(
  profileId: ProfileId,
  from: number,
  to: number,
  mode: CopyMode = 'anadir',
): CopyResult {
  if (from === to) return NO_COPY;

  const plan = planOf(profileId);
  const source = blocksOfDay(plan, from);
  if (source.length === 0) return NO_COPY;

  const rest =
    mode === 'sustituir'
      ? plan.blocks.filter((block) => block.day !== from && block.day !== to)
      : plan.blocks.filter((block) => block.day !== from);

  const moved = source.map((block) => ({ ...block, day: to }));
  const room = Math.max(0, MAX_BLOCKS - rest.length);
  const added = moved.slice(0, room);

  updatePlan(profileId, [...rest, ...added]);

  return {
    copied: added.length,
    cleared: plan.blocks.length - rest.length - source.length,
    dropped: moved.length - added.length,
  };
}

/** Dos días que se cambian el uno por el otro, con todo lo que llevan dentro. */
export function swapDays(profileId: ProfileId, a: number, b: number): number {
  if (a === b) return 0;

  const plan = planOf(profileId);
  const moved = plan.blocks.filter((block) => block.day === a || block.day === b);
  if (moved.length === 0) return 0;

  updatePlan(
    profileId,
    plan.blocks.map((block) =>
      block.day === a ? { ...block, day: b } : block.day === b ? { ...block, day: a } : block,
    ),
  );

  return moved.length;
}

/** Un rato repetido en otros días, a la misma hora. */
export function copyBlockTo(
  profileId: ProfileId,
  block: PlanBlock,
  days: number[],
  mode: CopyMode = 'anadir',
): CopyResult {
  const targets = days.filter((day) => day >= 0 && day <= 6 && day !== block.day);
  if (targets.length === 0) return NO_COPY;

  return place(
    profileId,
    targets.map((day) => copyOf(block, day)),
    mode === 'sustituir' ? targets : [],
  );
}

/**
 * Otra vez el mismo día. Sin hora, la copia se pone justo detrás del original
 * —que es lo que se quiere el noventa por ciento de las veces: dos clases
 * seguidas, dos bloques de análisis— y sin pasar de la medianoche.
 */
export function duplicateBlock(
  profileId: ProfileId,
  block: PlanBlock,
  start?: string,
): PlanBlock | null {
  const after = timeOf(Math.min(minutesOf(block.start) + block.duration, 23 * 60 + 55));
  const copy = copyOf(block, block.day, start ?? after);
  return addPlanBlocks(profileId, [copy]) > 0 ? copy : null;
}

/** El mismo rato, otro día —y, si se dice, otra hora—. */
export function moveBlockTo(
  profileId: ProfileId,
  block: PlanBlock,
  day: number,
  start?: string,
): void {
  savePlanBlock(profileId, { ...block, day, start: start ?? block.start });
}

/**
 * Corre un día entero en el reloj. Sirve para el sábado que empieza una hora
 * más tarde sin tener que tocar los diez ratos uno a uno. Lo que se saldría
 * del día se queda pegado al borde en vez de dar la vuelta.
 */
export function shiftDay(profileId: ProfileId, day: number, minutes: number): number {
  const plan = planOf(profileId);
  const source = plan.blocks.filter((block) => block.day === day);
  if (source.length === 0 || minutes === 0) return 0;

  updatePlan(
    profileId,
    plan.blocks.map((block) => {
      if (block.day !== day) return block;
      const moved = Math.max(0, Math.min(24 * 60 - 5, minutesOf(block.start) + minutes));
      return { ...block, start: timeOf(moved) };
    }),
  );

  return source.length;
}

/* ---------------------------------------------------------------------------
 * Volver a atar lo que se apartó suelto
 *
 * La semana de ejemplo se guarda con la atadura que tenían los ratos de
 * siempre **el día en que se puso**. Cuando después nace la casilla que
 * faltaba —el máster, las cuentas, el tiempo con los hijos—, la agenda ya
 * guardada se queda como estaba: con los ratos apartados y sin nada contra lo
 * que comprobarse.
 *
 * Esto lo arregla sin tocar nada más: busca cada rato suelto entre los de
 * siempre por su nombre y le pone el hábito y la cantidad que hoy le
 * corresponden. No inventa ataduras —si el nombre no está en el catálogo, el
 * rato se queda suelto— ni cambia las que ya había, salvo cuando apuntan a un
 * hábito que ya no existe.
 * ------------------------------------------------------------------------- */

/** Nombre comparable: sin mayúsculas, sin acentos y sin espacios de más. */
function titleKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize('NFD')
    // Los acentos, ya sueltos por la descomposición anterior.
    .replace(/[̀-ͯ]/g, '');
}

function presetIndex(profileId: ProfileId): Map<string, PlanPreset> {
  const index = new Map<string, PlanPreset>();
  for (const preset of presetsOf(profileId)) index.set(titleKey(preset.title), preset);
  return index;
}

export interface RelinkResult {
  /** Ratos que pasan a tener hábito atado. */
  linked: number;
  /** Ratos ya atados a los que se les completa la cantidad prevista. */
  filled: number;
  /** Los que se quedan sueltos: su nombre no está entre los de siempre. */
  loose: number;
}

const NO_RELINK: RelinkResult = { linked: 0, filled: 0, loose: 0 };

/** La agenda con las ataduras que hoy le tocan, y el parte de lo que cambia. */
function relink(profileId: ProfileId): { blocks: PlanBlock[]; result: RelinkResult } {
  const blocks = planOf(profileId).blocks;
  if (blocks.length === 0) return { blocks, result: NO_RELINK };

  const presets = presetIndex(profileId);
  const result: RelinkResult = { ...NO_RELINK };

  const next = blocks.map((block) => {
    // Una atadura viva se respeta; sólo se le completa la cantidad si el rato
    // de siempre la declara y aquí faltaba.
    const alive = block.metricId ? findMetric(profileId, block.metricId) : undefined;

    if (alive) {
      // Lo que se mide en tiempo lo lleva el reloj, así que aquí se aprovecha
      // para poner al día las agendas guardadas antes de que fuera así: un
      // rato de lectura de cuarenta minutos que seguía diciendo veinte.
      const ticked = withClockAmount(profileId, block);
      if (ticked !== block) {
        result.filled += 1;
        return ticked;
      }

      const preset = presets.get(titleKey(block.title));
      if (
        block.amount === undefined &&
        preset !== undefined &&
        preset.metricId === block.metricId &&
        preset.amount !== undefined
      ) {
        result.filled += 1;
        return { ...block, amount: preset.amount };
      }
      return block;
    }

    const preset = presets.get(titleKey(block.title));
    const metric = preset?.metricId ? findMetric(profileId, preset.metricId) : undefined;

    if (!preset || !metric) {
      // Si apuntaba a un hábito que ya no existe, se deja limpio: mejor suelto
      // que atado a algo que nadie puede registrar.
      result.loose += 1;
      return block.metricId ? { ...block, metricId: undefined, amount: undefined } : block;
    }

    result.linked += 1;
    const tied: PlanBlock = { ...block, metricId: preset.metricId, amount: preset.amount };
    return preset.amount !== undefined ? tied : withClockAmount(profileId, tied);
  });

  return { blocks: next, result };
}

/** Qué pasaría al atar la agenda, sin tocarla. Es lo que enseña el aviso. */
export function relinkPreview(profileId: ProfileId): RelinkResult {
  return relink(profileId).result;
}

/** Ata la agenda guardada a los hábitos de hoy. Devuelve lo que ha cambiado. */
export function relinkPlan(profileId: ProfileId): RelinkResult {
  const { blocks, result } = relink(profileId);
  if (result.linked > 0 || result.filled > 0) updatePlan(profileId, blocks);
  return result;
}

/** Minutos apartados ese día, sean del tipo que sean. */
export function plannedMinutes(blocks: PlanBlock[]): number {
  return blocks.reduce((total, block) => total + block.duration, 0);
}

/* ---------------------------------------------------------------------------
 * Copiar la semana de otro
 *
 * Leo y Hugo hacen casi la misma semana: el mismo cole, el mismo campo, la
 * misma hora de cenar, y luego cada uno lo suyo —la natación de uno, el
 * kárate del otro—. Montarla dos veces a mano es trabajo tirado, así que se
 * copia entera de un perfil a otro y se matiza encima, que es como se hace
 * de verdad.
 *
 * Lo que viaja es la semana tipo, no el registro: ratos, horas, duraciones y
 * con quién. El enganche al hábito viaja sólo si el que recibe tiene ese
 * hábito —entre los peques los tienen todos, entre un peque y un adulto casi
 * ninguno—, y lo que no encaja llega suelto en vez de llegar roto.
 * ------------------------------------------------------------------------- */

/** Una semana ajena que se puede traer, ya medida contra la de aquí. */
export interface WeekSource {
  profileId: ProfileId;
  /** Ratos que tiene apartados. */
  blocks: number;
  /** Días de los siete con algo. */
  days: number;
  /** De esos ratos, los que llegarían sin su hábito atado. */
  unlinked: number;
  updatedAt: string;
}

/**
 * Semanas de los demás que valdría la pena copiar en la de `profileId`: las
 * que tienen algo, en el orden de siempre de los perfiles. La propia no está,
 * claro.
 */
export function copyableWeeks(profileId: ProfileId): WeekSource[] {
  const plans = loadPlans();
  const sources: WeekSource[] = [];

  for (const profile of PROFILES) {
    if (profile.id === profileId) continue;

    const plan = plans[profile.id];
    if (!plan || plan.blocks.length === 0) continue;

    sources.push({
      profileId: profile.id,
      blocks: plan.blocks.length,
      days: daysFilled(plan),
      unlinked: plan.blocks.filter(
        (block) => block.metricId && !findMetric(profileId, block.metricId),
      ).length,
      updatedAt: plan.updatedAt,
    });
  }

  return sources;
}

export interface CopyWeekResult {
  /** Ratos que se han traído. */
  copied: number;
  /** De ellos, los que han llegado sin hábito atado. */
  unlinked: number;
}

/**
 * Trae la semana de `from` a la de `to`, reemplazando lo que hubiera. Los
 * ratos son nuevos —identificador propio— para que editar uno aquí no toque
 * el del otro: a partir de la copia son dos semanas distintas.
 */
export function copyWeekFrom(from: ProfileId, to: ProfileId): CopyWeekResult {
  const source = planOf(from).blocks;
  if (source.length === 0) return { copied: 0, unlinked: 0 };

  let unlinked = 0;

  const blocks = source.slice(0, MAX_BLOCKS).map((block) => {
    const keeps = !block.metricId || Boolean(findMetric(to, block.metricId));
    if (!keeps) unlinked += 1;

    return {
      ...block,
      id: newId(),
      metricId: keeps ? block.metricId : undefined,
      // Sin hábito al que aportar, la cantidad no significa nada.
      amount: keeps ? block.amount : undefined,
    };
  });

  updatePlan(to, blocks);
  return { copied: blocks.length, unlinked };
}

/** Adopta lo que venía de la nube. No se refecha: la decisión es de quien la tomó. */
export function applyRemotePlans(remote: Record<string, WeekPlan>): void {
  const merged = { ...loadPlans() };
  let changed = false;

  for (const [profileId, plan] of Object.entries(remote)) {
    const mine = merged[profileId];
    const theirs = normalize(plan, profileId);
    if (mine && Date.parse(mine.updatedAt) >= Date.parse(theirs.updatedAt)) continue;
    merged[profileId] = theirs;
    changed = true;
  }

  if (changed) commit(merged);
}

/**
 * Se queda exactamente con las agendas que venían de la nube: las que aquí
 * había de más desaparecen. Es lo que hace la réplica, y por eso no compara
 * fechas —no es una mezcla, es una copia— ni refecha nada.
 */
export function replacePlans(remote: Record<string, WeekPlan>): void {
  const next: Record<string, WeekPlan> = {};
  for (const [profileId, plan] of Object.entries(remote)) {
    next[profileId] = normalize(plan, profileId);
  }
  commit(next);
}

/** Avisa cuando cambia una agenda, venga de este aparato o de otro. */
export function subscribePlans(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
