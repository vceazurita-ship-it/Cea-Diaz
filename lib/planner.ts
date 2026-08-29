import { findMetric, getCategories } from '@/lib/habits';
import { PROFILES } from '@/lib/profiles';
import type {
  Companion,
  Metric,
  PlanBlock,
  PlanKind,
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

/** Tope de ratos por perfil. Más que esto y la semana deja de leerse. */
export const MAX_BLOCKS = 120;

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
  /** Clases Tailwind del degradado de la pastilla del rato. */
  gradient: string;
  /** `true` en lo que ocupa tiempo activo; lo lee el aviso de sobrecarga. */
  busy: boolean;
}

export const PLAN_KINDS: Record<PlanKind, KindMeta> = {
  cole: { label: 'Cole', icon: '🎒', gradient: 'from-sky-400 to-blue-600', busy: true },
  deporte: { label: 'Deporte', icon: '⚽', gradient: 'from-emerald-400 to-green-600', busy: true },
  estudio: { label: 'Estudio', icon: '📚', gradient: 'from-cyan-400 to-sky-600', busy: true },
  comida: { label: 'Comida', icon: '🍽️', gradient: 'from-amber-400 to-orange-600', busy: false },
  sueno: { label: 'Sueño', icon: '🌙', gradient: 'from-indigo-400 to-violet-700', busy: false },
  ocio: { label: 'Ocio', icon: '🎮', gradient: 'from-fuchsia-400 to-purple-600', busy: false },
  trabajo: { label: 'Trabajo', icon: '💼', gradient: 'from-slate-400 to-slate-700', busy: true },
  casa: { label: 'Casa', icon: '🧹', gradient: 'from-lime-400 to-emerald-600', busy: true },
  juntos: { label: 'En familia', icon: '🏡', gradient: 'from-orange-400 to-rose-500', busy: false },
  pareja: { label: 'En pareja', icon: '💞', gradient: 'from-rose-400 to-pink-600', busy: false },
  cuidado: { label: 'Cuidado', icon: '🫶', gradient: 'from-teal-400 to-cyan-600', busy: false },
  otro: { label: 'Otro', icon: '📌', gradient: 'from-zinc-400 to-zinc-600', busy: true },
};

export const PLAN_KIND_LIST = Object.keys(PLAN_KINDS) as PlanKind[];

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
  master: { label: 'Máster', icon: '🎓' },
  desarrollo: { label: 'Desarrollo personal', icon: '✨' },
  deporte: { label: 'Deporte', icon: '🏃' },
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
  { title: 'Cole', icon: '🎒', kind: 'cole', start: '09:00', duration: 300, companion: 'cole' },
  {
    title: 'Entreno de fútbol',
    icon: '⚽',
    kind: 'deporte',
    start: '17:30',
    duration: 90,
    metricId: 'sport.futbol.asistencia',
    companion: 'papa',
  },
  {
    title: 'Partido',
    icon: '🏆',
    kind: 'deporte',
    start: '11:00',
    duration: 90,
    metricId: 'sport.futbol.asistencia',
    companion: 'papa',
  },
  {
    title: 'Natación',
    icon: '🏊',
    kind: 'deporte',
    start: '18:00',
    duration: 60,
    metricId: 'sport.natacion.asistencia',
    companion: 'mama',
  },
  {
    title: 'Arte marcial',
    icon: '🥋',
    kind: 'deporte',
    start: '18:00',
    duration: 60,
    metricId: 'sport.marcial.asistencia',
    companion: 'mama',
  },
  {
    title: 'Gimnasio',
    icon: '🤸',
    kind: 'deporte',
    start: '18:00',
    duration: 60,
    metricId: 'sport.gimnasio.asistencia',
    companion: 'papa',
  },
  {
    title: 'Atletismo',
    icon: '🏃',
    kind: 'deporte',
    start: '18:00',
    duration: 60,
    metricId: 'sport.atletismo.asistencia',
    companion: 'papa',
  },
  {
    title: 'Parque o bici',
    icon: '🛴',
    kind: 'deporte',
    start: '17:00',
    duration: 60,
    metricId: 'actividad_diaria',
    amount: 60,
    companion: 'abuelos',
  },
  {
    title: 'Deberes',
    icon: '✍️',
    kind: 'estudio',
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
    start: '21:00',
    duration: 20,
    metricId: 'lectura',
    amount: 20,
    companion: 'papa',
  },
  {
    title: 'Merienda',
    icon: '🥪',
    kind: 'comida',
    start: '17:00',
    duration: 20,
    companion: 'abuelos',
  },
  {
    title: 'Cena',
    icon: '🍽️',
    kind: 'comida',
    start: '20:30',
    duration: 40,
    metricId: 'plato_sano',
    companion: 'ambos',
  },
  {
    title: 'Pantallas',
    icon: '📱',
    kind: 'ocio',
    start: '19:00',
    duration: 60,
    metricId: 'pantallas_ocio',
    amount: 60,
    companion: 'solos',
  },
  { title: 'Juego libre', icon: '🧩', kind: 'ocio', start: '19:00', duration: 45, companion: 'solos' },
  {
    title: 'A la cama',
    icon: '🌙',
    kind: 'sueno',
    start: '21:30',
    duration: 30,
    metricId: 'hora_cama',
    companion: 'ambos',
  },
];

const mariaPresets: PlanPreset[] = [
  {
    title: 'Clase online',
    icon: '💻',
    kind: 'trabajo',
    start: '10:00',
    duration: 60,
    metricId: 'clases_impartidas',
    amount: 1,
  },
  {
    title: 'Preparar clases',
    icon: '📝',
    kind: 'trabajo',
    start: '09:00',
    duration: 45,
    metricId: 'prep_clases',
    amount: 45,
  },
  {
    title: 'Corrección de tareas',
    icon: '✅',
    kind: 'trabajo',
    start: '16:00',
    duration: 45,
    metricId: 'correccion',
  },
  {
    title: 'Material didáctico',
    icon: '🧩',
    kind: 'trabajo',
    start: '12:00',
    duration: 45,
    metricId: 'material',
  },
  {
    title: 'Redes y captación',
    icon: '📣',
    kind: 'trabajo',
    start: '13:00',
    duration: 30,
    metricId: 'captacion',
  },
  {
    title: 'Cierre de jornada',
    icon: '🔕',
    kind: 'trabajo',
    start: '18:00',
    duration: 15,
    metricId: 'cierre_jornada',
  },
  {
    title: 'Pilates o paseo',
    icon: '🚴',
    kind: 'cuidado',
    start: '08:00',
    duration: 45,
    metricId: 'movimiento',
    amount: 45,
  },
  { title: 'Fuerza', icon: '💪', kind: 'cuidado', start: '08:00', duration: 40, metricId: 'fuerza' },
  {
    title: 'Pausa consciente',
    icon: '🧘',
    kind: 'cuidado',
    start: '15:30',
    duration: 15,
    metricId: 'pausa_consciente',
  },
  {
    title: 'Lectura',
    icon: '📖',
    kind: 'ocio',
    start: '22:00',
    duration: 30,
    metricId: 'lectura',
    amount: 30,
  },
  { title: 'Diario', icon: '📔', kind: 'cuidado', start: '22:30', duration: 10, metricId: 'diario' },
  {
    title: 'Comida en familia',
    icon: '🍽️',
    kind: 'comida',
    start: '14:00',
    duration: 60,
    metricId: 'plato_sano',
  },
  {
    title: 'Rutina de sueño',
    icon: '🌙',
    kind: 'sueno',
    start: '23:00',
    duration: 30,
    metricId: 'sin_pantallas_noche',
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
  },
  {
    title: 'Desarrollo de la cultura de equipo',
    icon: '🌱',
    kind: 'trabajo',
    group: 'profesional',
    start: '17:00',
    duration: 45,
  },
  {
    title: 'Microciclo · cultura de equipo',
    icon: '🗓️',
    kind: 'trabajo',
    group: 'profesional',
    start: '18:00',
    duration: 60,
  },
  {
    title: 'Microciclo · ABP',
    icon: '📋',
    kind: 'trabajo',
    group: 'profesional',
    start: '18:00',
    duration: 60,
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
  },
  {
    title: 'Experiencias con los hijos',
    icon: '🧒',
    kind: 'juntos',
    group: 'familia',
    start: '17:00',
    duration: 120,
  },
  {
    title: 'Tiempo con María',
    icon: '💞',
    kind: 'pareja',
    group: 'familia',
    start: '22:00',
    duration: 30,
  },
  {
    title: 'Con los padres',
    icon: '👵',
    kind: 'juntos',
    group: 'familia',
    start: '12:00',
    duration: 90,
  },
  {
    title: 'Con los amigos',
    icon: '🍻',
    kind: 'ocio',
    group: 'familia',
    start: '21:00',
    duration: 120,
  },

  /* --- Casa y tareas -------------------------------------------------------- */
  {
    title: 'Responsabilidades de casa',
    icon: '🧹',
    kind: 'casa',
    group: 'casa',
    start: '12:30',
    duration: 60,
  },
  {
    title: 'Tareas y recados',
    icon: '✅',
    kind: 'casa',
    group: 'casa',
    start: '18:00',
    duration: 45,
  },
  {
    title: 'Compra',
    icon: '🛒',
    kind: 'casa',
    group: 'casa',
    start: '11:00',
    duration: 60,
  },
  {
    title: 'Papeleo y gestiones',
    icon: '🗂️',
    kind: 'casa',
    group: 'casa',
    start: '17:00',
    duration: 45,
  },
  {
    title: 'Organizar la semana',
    icon: '📆',
    kind: 'casa',
    group: 'casa',
    start: '19:00',
    duration: 30,
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

/**
 * Reparte en carriles los ratos de un día para que dos cosas a la misma hora
 * se pinten una al lado de la otra y no una encima de la otra. Devuelve cada
 * rato con su carril y cuántos carriles hacen falta ese día.
 */
export function laneLayout(blocks: PlanBlock[]): {
  lanes: number;
  placed: Array<{ block: PlanBlock; lane: number }>;
} {
  /** Hasta qué minuto está pillado cada carril. */
  const busyUntil: number[] = [];

  const placed = sortBlocks(blocks).map((block) => {
    const start = minutesOf(block.start);
    let lane = busyUntil.findIndex((end) => end <= start);
    if (lane === -1) lane = busyUntil.length;
    busyUntil[lane] = start + block.duration;
    return { block, lane };
  });

  return { lanes: Math.max(1, busyUntil.length), placed };
}

/* ---------------------------------------------------------------------------
 * Altas
 * ------------------------------------------------------------------------- */

/** Identificador propio. `crypto` está en todos los navegadores que soporta la app. */
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `plan-${Math.random().toString(36).slice(2)}`;
}

export function blockFromPreset(preset: PlanPreset, day: number): PlanBlock {
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
 * Semana de ejemplo
 *
 * Una agenda vacía no enseña nada, y montar veinte ratos a mano antes de ver
 * para qué sirven es pedir demasiado. Esto deja una semana verosímil de un
 * toque, ya atada a los hábitos, para editarla encima.
 * ------------------------------------------------------------------------- */

/** `[día, título del preset, hora]`; la hora sobreescribe la del preset. */
type SeedRow = [number, string, string?];

const KID_SEED: SeedRow[] = [
  [0, 'Cole'], [0, 'Merienda'], [0, 'Deberes'], [0, 'Entreno de fútbol'], [0, 'Cena'],
  [0, 'Lectura'], [0, 'A la cama'],
  [1, 'Cole'], [1, 'Merienda'], [1, 'Deberes'], [1, 'Natación'], [1, 'Cena'], [1, 'A la cama'],
  [2, 'Cole'], [2, 'Merienda'], [2, 'Entreno de fútbol'], [2, 'Cena'], [2, 'Lectura'],
  [2, 'A la cama'],
  [3, 'Cole'], [3, 'Merienda'], [3, 'Deberes'], [3, 'Arte marcial'], [3, 'Cena'], [3, 'A la cama'],
  [4, 'Cole'], [4, 'Merienda'], [4, 'Pantallas'], [4, 'Cena'], [4, 'A la cama', '22:00'],
  [5, 'Partido'], [5, 'Parque o bici', '17:00'], [5, 'Pantallas'], [5, 'Cena'], [5, 'Lectura'],
  [5, 'A la cama', '22:00'],
  [6, 'Parque o bici', '11:00'], [6, 'Juego libre'], [6, 'Deberes', '18:00'], [6, 'Cena'],
  [6, 'Lectura'], [6, 'A la cama'],
];

const MARIA_SEED: SeedRow[] = [
  [0, 'Pilates o paseo'], [0, 'Preparar clases'], [0, 'Clase online'], [0, 'Clase online', '11:30'],
  [0, 'Comida en familia'], [0, 'Corrección de tareas'], [0, 'Cierre de jornada'], [0, 'Lectura'],
  [1, 'Fuerza'], [1, 'Clase online'], [1, 'Material didáctico'], [1, 'Comida en familia'],
  [1, 'Pausa consciente'], [1, 'Cierre de jornada'], [1, 'Rutina de sueño'],
  [2, 'Pilates o paseo'], [2, 'Preparar clases'], [2, 'Clase online'], [2, 'Clase online', '11:30'],
  [2, 'Comida en familia'], [2, 'Corrección de tareas'], [2, 'Lectura'],
  [3, 'Fuerza'], [3, 'Clase online'], [3, 'Redes y captación'], [3, 'Comida en familia'],
  [3, 'Pausa consciente'], [3, 'Cierre de jornada'], [3, 'Diario'],
  [4, 'Pilates o paseo'], [4, 'Clase online'], [4, 'Cierre de jornada', '15:00'],
  [4, 'Comida en familia'], [4, 'Lectura'],
  [5, 'Pilates o paseo', '10:00'], [5, 'Comida en familia'], [5, 'Lectura', '17:00'],
  [5, 'Rutina de sueño'],
  [6, 'Preparar clases', '18:00'], [6, 'Comida en familia'], [6, 'Diario'], [6, 'Rutina de sueño'],
];

const VICTOR_SEED: SeedRow[] = [
  // Lunes: se recoge el partido —vídeo, individuales y aprendizajes del micro—.
  [0, 'Gimnasio', '07:00'], [0, 'Reunión de staff', '09:00'],
  [0, 'Entrenamiento del equipo', '10:30'], [0, 'Control de cargas', '13:00'],
  [0, 'Comida en familia', '14:30'], [0, 'Análisis táctico · partido', '16:00'],
  [0, 'Aprendizajes del micro', '17:45'], [0, 'Desconexión al llegar', '20:00'],
  [0, 'Cena en familia', '21:00'], [0, 'Apuntar los gastos', '21:45'],
  [0, 'Lectura', '22:30'],
  // Martes: el rival, de lo colectivo a lo individual. Y clase del máster.
  [1, 'Correr', '07:00'], [1, 'Preparación de la sesión', '09:00'],
  [1, 'Entrenamiento del equipo', '10:30'], [1, 'Feedback post-sesión', '13:00'],
  [1, 'Comida en familia', '14:30'], [1, 'Análisis rival · colectivo', '16:00'],
  [1, 'Análisis rival · individual', '17:15'], [1, 'Clase del máster', '19:00'],
  [1, 'Cena en familia', '21:15'], [1, 'Apuntar los gastos', '22:00'],
  // Miércoles: el día del balón parado, propio y del rival, y su microciclo.
  [2, 'Movilidad y prevención', '07:00'], [2, 'Escritura', '07:30'],
  [2, 'Preparación de la sesión', '09:00'], [2, 'Entrenamiento del equipo', '10:30'],
  [2, 'Reuniones individuales', '12:45'], [2, 'Comida en familia', '14:30'],
  [2, 'Análisis ABP propio', '16:00'], [2, 'Análisis ABP rival', '17:00'],
  [2, 'Microciclo · ABP', '18:00'], [2, 'Desconexión al llegar', '20:00'],
  [2, 'Cena en familia', '21:00'], [2, 'Apuntar los gastos', '21:45'],
  [2, 'Lectura', '22:30'],
  // Jueves: la cultura de equipo, que también se prepara y se planifica.
  [3, 'Gimnasio', '07:00'], [3, 'Preparación de la sesión', '09:00'],
  [3, 'Entrenamiento del equipo', '10:30'], [3, 'Control de cargas', '13:00'],
  [3, 'Comida en familia', '14:30'], [3, 'Análisis de la cultura de equipo', '16:00'],
  [3, 'Desarrollo de la cultura de equipo', '17:00'],
  [3, 'Microciclo · cultura de equipo', '18:00'], [3, 'Estudio del máster', '19:15'],
  [3, 'Cena en familia', '21:00'], [3, 'Apuntar los gastos', '21:45'],
  [3, 'Tiempo con María', '22:00'],
  // Viernes: individuales, cuentas y lo que quedó suelto de la semana.
  [4, 'Correr', '07:00'], [4, 'Preparación de la sesión', '09:00'],
  [4, 'Entrenamiento del equipo', '10:30'], [4, 'Feedback post-sesión', '13:00'],
  [4, 'Comida en familia', '14:30'], [4, 'Análisis individual', '16:00'],
  [4, 'Cuentas del mes', '17:00'], [4, 'Tareas y recados', '18:00'],
  [4, 'Desconexión al llegar', '20:00'], [4, 'Cena en familia', '21:00'],
  [4, 'Apuntar los gastos', '21:45'], [4, 'Lectura', '22:30'],
  // Sábado: activación, casa y la tarde entera con los peques.
  [5, 'Movilidad y prevención', '09:00'], [5, 'Entrenamiento del equipo', '10:00'],
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
  [0, 'Cena en familia'], [0, 'Rutina de acostarse'],
  [1, 'Cena en familia'], [1, 'Juego juntos'], [1, 'Rutina de acostarse'],
  [2, 'Cena en familia'], [2, 'Peli o lectura en familia'], [2, 'Rutina de acostarse'],
  [3, 'Cena en familia'], [3, 'Juego juntos'], [3, 'Rutina de acostarse'],
  [4, 'Cena en familia'], [4, 'Peli o lectura en familia'], [4, 'Rutina de acostarse', '22:00'],
  [5, 'Desayuno juntos', '09:30'], [5, 'Salida al aire libre'], [5, 'Comida en familia'],
  [5, 'Tareas del hogar', '17:00'], [5, 'Juego juntos'], [5, 'Cena en familia'],
  [6, 'Desayuno juntos', '09:30'], [6, 'Rutina de fin de semana'], [6, 'Comida en familia'],
  [6, 'Consejo de familia'], [6, 'Cena en familia'], [6, 'Rutina de acostarse'],
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
    blocks.push({ ...blockFromPreset(preset, day), start: start ?? preset.start });
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
function normalizeBlock(value: unknown, index: number): PlanBlock | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PlanBlock>;

  const day = Number(raw.day);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;

  const start =
    typeof raw.start === 'string' && /^\d{1,2}:\d{2}$/.test(raw.start) ? raw.start : null;
  if (!start) return null;

  const duration = Number(raw.duration);
  const amount = Number(raw.amount);

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `plan-${index}`,
    day,
    start,
    duration: Number.isFinite(duration) ? Math.max(5, Math.min(720, duration)) : 60,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 60) : '',
    icon: typeof raw.icon === 'string' && raw.icon ? raw.icon.slice(0, 4) : '📌',
    kind: typeof raw.kind === 'string' && KIND_SET.has(raw.kind) ? (raw.kind as PlanKind) : 'otro',
    metricId: typeof raw.metricId === 'string' && raw.metricId ? raw.metricId : undefined,
    amount: raw.amount !== undefined && Number.isFinite(amount) ? amount : undefined,
    companion:
      typeof raw.companion === 'string' && COMPANION_SET.has(raw.companion)
        ? (raw.companion as Companion)
        : undefined,
    note: typeof raw.note === 'string' && raw.note ? raw.note.slice(0, 240) : undefined,
  };
}

function normalize(value: unknown): WeekPlan {
  const base = emptyPlan();
  if (!value || typeof value !== 'object') return base;

  const raw = value as Partial<WeekPlan>;
  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks
        .map(normalizeBlock)
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
      out[profileId] = normalize(value);
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
    blocks: sortBlocks(blocks).slice(0, MAX_BLOCKS),
    updatedAt: new Date().toISOString(),
  };

  commit({ ...loadPlans(), [profileId]: next });
  return next;
}

/** Alta o modificación de un rato, por identificador. */
export function savePlanBlock(profileId: ProfileId, block: PlanBlock): WeekPlan {
  const current = planOf(profileId).blocks;
  const exists = current.some((item) => item.id === block.id);

  return updatePlan(
    profileId,
    exists ? current.map((item) => (item.id === block.id ? block : item)) : [...current, block],
  );
}

export function removePlanBlock(profileId: ProfileId, id: string): WeekPlan {
  return updatePlan(
    profileId,
    planOf(profileId).blocks.filter((block) => block.id !== id),
  );
}

/** Copia los ratos de un día en otro; es como se monta media semana. */
export function copyDayPlan(profileId: ProfileId, from: number, to: number): number {
  const plan = planOf(profileId);
  const source = plan.blocks.filter((block) => block.day === from);
  if (source.length === 0) return 0;

  const copies = source.map((block) => ({ ...block, id: newId(), day: to }));
  updatePlan(profileId, [...plan.blocks.filter((block) => block.day !== to), ...copies]);
  return copies.length;
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
    const theirs = normalize(plan);
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
  for (const [profileId, plan] of Object.entries(remote)) next[profileId] = normalize(plan);
  commit(next);
}

/** Avisa cuando cambia una agenda, venga de este aparato o de otro. */
export function subscribePlans(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
