/* =========================================================================
 *  Hábitos en Familia — Esquema de datos
 *  Modelo dirigido por configuración: cada perfil declara sus propias
 *  categorías y métricas, de modo que la UI es genérica y los datos
 *  personalizados por miembro.
 * ========================================================================= */

/* ------------------------------- Perfiles ------------------------------- */

export type ProfileId = 'leo' | 'hugo' | 'maria' | 'victor' | 'familia' | 'pareja';

/** Determina el "tono" de la interfaz: gamificada, elegante o compartida. */
export type ProfileKind = 'kid' | 'adult' | 'group';

/**
 * Piel visual del panel. Cada una define su propia paleta de tokens CSS
 * (fondo, superficies, texto) en `app/globals.css`.
 *  - `night`     selector y módulos compartidos: oscuro, neutro.
 *  - `pitch`     Leo y Hugo: verde césped, marcador de estadio, tipografía de dorsal.
 *  - `editorial` María y Víctor: claro premium, serif, mucho aire.
 */
export type ProfileSkin = 'night' | 'pitch' | 'editorial';

/**
 * Modo de la app, elegido en Ajustes y válido para todos los perfiles.
 * `auto` sigue lo que tenga configurado el móvil; los otros dos mandan.
 */
export type ThemePreference = 'auto' | 'light' | 'dark';
/** Modo ya resuelto: es lo que acaba pintándose. */
export type ThemeMode = 'light' | 'dark';

export interface Profile {
  id: ProfileId;
  name: string;
  /** Ausente en módulos de grupo. */
  age?: number;
  /** Ocupación o descripción del rol dentro de la familia. */
  role: string;
  tagline: string;
  kind: ProfileKind;
  /** Emoji usado como avatar (sin dependencias de imágenes externas). */
  avatar: string;
  /** Clases Tailwind del degradado principal del perfil. */
  gradient: string;
  /** Color de acento sólido (para barras, chips y bordes). */
  accent: string;
  /**
   * Color de la sección entera: de él salen el fondo, las superficies, los
   * bordes y el texto, tanto de día como de noche. Es lo que hace que la
   * parte de Leo sea verde y la de Hugo roja sin tocar ni un componente.
   */
  tint: string;
  /** Miembros incluidos en los módulos compartidos. */
  members?: ProfileId[];
  /** Los módulos privados exigen PIN antes de mostrar datos. */
  isPrivate?: boolean;
  /** Piel visual del panel del perfil. Por defecto `night`. */
  skin?: ProfileSkin;
  /** Variante oscura del acento, la que se usa en modo día sobre papel claro. */
  accentDeep?: string;
  /** Retrato cuadrado del perfil (ruta bajo /public). */
  photo?: string;
  /** Imagen de cabecera del panel. */
  hero?: string;
  /** Banda apaisada usada en la tarjeta del selector. */
  cover?: string;
  /** Encuadre de `hero` cuando se usa como banda (valor de `object-position`). */
  heroPosition?: string;
  /** Imagen secundaria: cromo de los peques, foto de pareja... */
  card?: string;
  /** Dorsal mostrado en la piel de fútbol. */
  squad?: string;
  /** Demarcación mostrada en la piel de fútbol. */
  position?: string;
  /**
   * Sintonía que suena al entrar en el perfil (ruta bajo /public). Opcional:
   * sin archivo, se entra en silencio y no pasa nada.
   */
  anthem?: string;
  /** Cómo se llama esa música, para poder decirlo mientras suena. */
  anthemLabel?: string;
}

/* ------------------------------- Métricas ------------------------------- */

export type MetricType = 'toggle' | 'counter' | 'duration' | 'scale' | 'choice';

/**
 * Papel de la métrica en la mejora, usado por el generador de retos. Ambos
 * valores marcan métricas en las que **cuanto más, mejor**, y por tanto
 * admiten reto de récord por encima de su objetivo:
 *  - `aprendizaje` volumen que se acumula (lectura, escritura, análisis…).
 *  - `esfuerzo`    cuánto se da de sí (escalas de esfuerzo, minutos de
 *                  entreno o de tiempo dedicado).
 * No afecta al cumplimiento: sólo al tipo de reto que puede inspirar.
 */
export type MetricFocus = 'aprendizaje' | 'esfuerzo';

/**
 * Sentido del objetivo de una métrica con cifra.
 *  - `atLeast` (por defecto) la meta es un suelo: cuanto más, mejor hasta ella.
 *  - `atMost`  la meta es un techo: cumplir es quedarse por debajo.
 *
 * Hacía falta porque media docena de hábitos que los expertos consideran
 * innegociables son límites, no metas: pantallas, cafeína tarde, ultraprocesados.
 * Sin esto había que enunciarlos al revés («sin pantallas: sí/no») y se perdía
 * el cuánto, que es justo lo que hay que vigilar.
 */
export type MetricDirection = 'atLeast' | 'atMost';

/**
 * Cuánto pesa el hábito en la literatura, y por tanto cuánto insiste la app:
 *  - `clave`      consenso amplio y efecto grande (sueño, fuerza, ultraprocesados).
 *  - `importante` bien respaldado, pero de segundo orden.
 *  - `apoyo`      ayuda y suma, sin ser determinante.
 */
export type HabitPriority = 'clave' | 'importante' | 'apoyo';

interface MetricBase {
  id: string;
  label: string;
  icon: string;
  help?: string;
  /** Peso relativo dentro de la categoría al calcular el cumplimiento. */
  weight?: number;
  /** Agrupador opcional (p. ej. la actividad deportiva a la que pertenece). */
  group?: string;
  /** Papel en la mejora; lo lee `lib/challenges.ts`. */
  focus?: MetricFocus;
}

/** Sí / No. Cumplido = true. */
export interface ToggleMetric extends MetricBase {
  type: 'toggle';
}

/** Contador discreto con objetivo (vasos de agua, raciones, ejercicios...). */
export interface CounterMetric extends MetricBase {
  type: 'counter';
  target: number;
  max: number;
  step: number;
  unit: string;
  /** Emoji repetido para la representación visual infantil. */
  pip?: string;
  /** Suelo (por defecto) o techo. */
  direction?: MetricDirection;
}

/** Cantidad continua con objetivo: minutos, horas de sueño... */
export interface DurationMetric extends MetricBase {
  type: 'duration';
  target: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** Suelo (por defecto) o techo. */
  direction?: MetricDirection;
}

/** Escala subjetiva 1..5 (esfuerzo, energía, ánimo). */
export interface ScaleMetric extends MetricBase {
  type: 'scale';
  min: number;
  max: number;
  /** Etiqueta por nivel, de menor a mayor. */
  levels: string[];
  /** Emoji por nivel, de menor a mayor. */
  emojis?: string[];
}

export interface ChoiceOption {
  value: string;
  label: string;
  icon: string;
  /** Aportación al cumplimiento, de 0 a 1. */
  score: number;
}

/** Selección única entre opciones puntuadas. */
export interface ChoiceMetric extends MetricBase {
  type: 'choice';
  options: ChoiceOption[];
}

export type Metric =
  | ToggleMetric
  | CounterMetric
  | DurationMetric
  | ScaleMetric
  | ChoiceMetric;

export type MetricValue = boolean | number | string;

/* ------------------------------ Categorías ------------------------------ */

/** Cómo renderiza la categoría sus métricas. */
export type CategoryLayout = 'list' | 'sports';

export interface MetricGroup {
  id: string;
  label: string;
  icon: string;
  /** Clases Tailwind del degradado de la tarjeta de actividad. */
  gradient: string;
  /**
   * Qué dice la tarjeta marcada y sin marcar. Sin esto habla de asistencia a
   * un entrenamiento, que es de donde viene el diseño; el reparto de gimnasio
   * usa el mismo bloque para decir otra cosa.
   */
  on?: string;
  off?: string;
}

/**
 * Apunte que acompaña a una casilla en el registro del día: lo que hay que
 * batir hoy, o que ya se ha batido. Lo calcula quien conoce el historial, no
 * el control, que sólo sabe pintar el valor de un día.
 */
export interface MetricHint {
  text: string;
  /** `true` cuando lo apuntado hoy ya es un récord. */
  record: boolean;
}

export interface HabitCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  /** Clases Tailwind del degradado de cabecera de la categoría. */
  gradient: string;
  metrics: Metric[];
  layout?: CategoryLayout;
  /**
   * Sólo para layout 'sports': una tarjeta por grupo. Las usan los deportes de
   * los peques y el reparto de gimnasio de Víctor, que se registran igual: se
   * marca la casilla y sólo entonces aparece el detalle.
   */
  groups?: MetricGroup[];
}

/* ------------------------------- Registros ------------------------------ */

/** Fecha en formato ISO local `YYYY-MM-DD`. */
export type DateKey = string;

/**
 * Clave de una nota suelta del día. Son los identificadores de categoría
 * (`nutricion`, `deporte`, `sueno`…) más dos reservadas: `retos`, para lo
 * que se apunta desde el panel de retos, y `juego`, donde queda anotada la
 * partida del día de los peques. El catálogo de categorías no usa esos
 * nombres, así que no hay colisión posible.
 */
export type NoteKey = string;

export interface DayEntry {
  date: DateKey;
  profileId: ProfileId;
  values: Record<string, MetricValue>;
  note?: string;
  /**
   * Notas por categoría y del panel de retos: lo que no cabe en un botón
   * («me dolía el tobillo», «entrenó sólo media hora»). Se dictan o se
   * escriben, y son contexto: no cuentan para el cumplimiento.
   */
  notes?: Record<NoteKey, string>;
  /** Marca temporal de la última edición (ISO). */
  updatedAt: string;
}

/** Clave del registro: `${profileId}:${date}`. */
export type EntryKey = string;

export interface HabitDatabase {
  version: number;
  entries: Record<EntryKey, DayEntry>;
  /** Recados y citas de cada uno, por identificador propio. */
  tasks: Record<string, Task>;
  /**
   * Borrados pendientes de propagar a la nube, como `tabla:id` → momento del
   * borrado. Sin esto, lo borrado en un móvil volvería en la siguiente
   * sincronización, porque en la nube seguiría existiendo.
   */
  tombstones: Record<string, string>;
}

/* -------------------------------- Cálculo ------------------------------- */

export interface CategoryScore {
  categoryId: string;
  label: string;
  icon: string;
  /** Cumplimiento 0..1. */
  ratio: number;
  /** Métricas con algún valor registrado. */
  filled: number;
  total: number;
}

export interface DayScore {
  date: DateKey;
  ratio: number;
  stars: number;
  /** Ningún dato registrado ese día. */
  empty: boolean;
  categories: CategoryScore[];
}

export interface PeriodSummary {
  from: DateKey;
  to: DateKey;
  days: DayScore[];
  /** Media de cumplimiento sobre los días con registro. */
  average: number;
  /** Días con al menos un registro. */
  trackedDays: number;
  totalStars: number;
  /** Racha actual de días con cumplimiento ≥ 60 %. */
  streak: number;
  /** Mejor racha del periodo. */
  bestStreak: number;
  perCategory: CategoryScore[];
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
  icon: string;
  unlocked: boolean;
  /** Progreso 0..1 hacia el desbloqueo. */
  progress: number;
}

/* --------------------------------- Retos -------------------------------- */

/**
 * Nivel de exigencia del reto:
 *  - `base`    asegurar el suelo (registrar, estrenar, completar).
 *  - `reto`    atacar el punto flojo o acumular aprendizaje.
 *  - `maximo`  batir la marca propia o dar el máximo esfuerzo.
 */
export type ChallengeTier = 'base' | 'reto' | 'maximo';

/**
 * Condición de superación, declarativa para poder recalcularla en cualquier
 * momento a partir de los registros: un reto no guarda estado propio.
 */
export type ChallengeRule =
  /** Mejor valor del periodo ≥ objetivo (récord personal). */
  | { type: 'metricBest'; metricId: string; target: number }
  /**
   * Menor valor apuntado del periodo ≤ objetivo: el récord de las marcas de
   * tiempo, donde mejorar es bajar. Los días sin apuntar nada no cuentan, para
   * que una casilla en blanco no valga como el mejor tiempo posible.
   */
  | { type: 'metricLow'; metricId: string; target: number }
  /** Suma del periodo ≥ objetivo (volumen semanal). */
  | { type: 'metricTotal'; metricId: string; target: number }
  /** Al menos `days` días con la métrica en `threshold` o más. */
  | { type: 'metricDays'; metricId: string; threshold: number; days: number }
  /** Al menos `days` días con cumplimiento diario ≥ `threshold`. */
  | { type: 'dayRatioDays'; threshold: number; days: number }
  /** `days` días consecutivos con cumplimiento ≥ `threshold`. */
  | { type: 'dayRatioStreak'; threshold: number; days: number }
  /** Al menos `days` días con la categoría por encima de `threshold`. */
  | { type: 'categoryDays'; categoryId: string; threshold: number; days: number };

export interface Challenge {
  id: string;
  /** Titular del reto. */
  title: string;
  /** Qué hay que hacer exactamente. */
  detail: string;
  /** Por qué se propone justo éste. */
  why: string;
  icon: string;
  tier: ChallengeTier;
  /** Puntos que aporta al superarlo. */
  xp: number;
  rule: ChallengeRule;
}

export interface ChallengeProgress {
  current: number;
  target: number;
  /** Avance 0..1. */
  ratio: number;
  done: boolean;
  /** Marcador legible («3 / 5 días», «35 min / 40 min»). */
  label: string;
}

export interface ScoredChallenge extends Challenge {
  progress: ChallengeProgress;
}

export interface ChallengeWeek {
  from: DateKey;
  to: DateKey;
  challenges: ScoredChallenge[];
  /** Retos superados. */
  done: number;
  /** Puntos conseguidos y puntos en juego. */
  xp: number;
  xpMax: number;
}

/* ----------------------------- Recompensas ------------------------------ */

/**
 * Cada reto superado entrega un regalo, distinto según a quién le toque:
 * los peques coleccionan cromos, María colecciona frases.
 */
export type RewardKind = 'cromo' | 'frase';

/**
 * Rareza del cromo, ligada al nivel del reto que lo entrega. Las cuatro
 * primeras son las del mazo de fútbol de los peques —cantera, las dos ligas
 * grandes de ahora y la historia—; las tres siguientes, las del mazo de la
 * casa que se lleva María.
 */
export type CromoRarity =
  | 'castilla'
  | 'liga'
  | 'premier'
  | 'leyenda'
  /** Las cuatro del mazo de música de María: su álbum, como el de fútbol de ellos. */
  | 'radio'
  | 'noventa'
  | 'dosmil'
  | 'leyenda_pop'
  | 'casa'
  | 'equipo'
  | 'leyenda_casa'
  /** Las técnicas de Leo y Hugo: sólo caen al cerrar la semana entera. */
  | 'tecnica';

/** Rareza de la frase, ligada al nivel del reto que la entrega. */
export type FraseRarity = 'chispa' | 'fuerza' | 'oro';

/**
 * Línea del campo en la que juega el cromo. Es lo que permite colocarlo en el
 * campograma: un portero no cabe en la ranura de un extremo. Los cromos que
 * no son jugadores —las técnicas, los de la casa— no la llevan, y por eso
 * quedan fuera del campo sin necesidad de ninguna otra marca.
 */
export type CromoLine = 'por' | 'def' | 'med' | 'del';

/** Corte de pelo del retrato. El rapado también es un corte. */
export type CromoHair =
  | 'corto'
  | 'rizado'
  | 'afro'
  | 'largo'
  | 'rapado'
  | 'cresta'
  | 'moño'
  | 'trenzas'
  /** Tupé peinado hacia arriba: el de Hugo y el de media Premier. */
  | 'tupé';

export type CromoBeard = 'no' | 'corta' | 'cerrada';

/**
 * Color de ojos. En un retrato de anime los ojos ocupan media cara, así que
 * aquí sí se nota: los mismos rasgos con los ojos verdes son otro cromo.
 */
export type CromoEyes = 'marrón' | 'miel' | 'verde' | 'azul' | 'gris' | 'negro';

/**
 * Cómo es el jugador, cuando se sabe. Los cromos de la cantera no lo llevan:
 * a esos se les sortea la cara y nadie nota la diferencia. Pero a Vinícius o
 * a Haaland los peques los reconocen de vista, así que a los conocidos se les
 * apunta aquí el aspecto y el dibujo deja de sortear.
 *
 * Lo que no se diga se sigue sorteando, así que se puede fijar sólo el pelo y
 * dejar el resto al azar.
 */
export interface CromoLook {
  /** Tono de piel: 1 el más claro, 6 el más oscuro. */
  skin?: 1 | 2 | 3 | 4 | 5 | 6;
  hairColor?: 'negro' | 'castaño' | 'castaño claro' | 'rubio' | 'pelirrojo' | 'cano';
  hair?: CromoHair;
  beard?: CromoBeard;
  eyes?: CromoEyes;
}

export interface CromoReward {
  kind: 'cromo';
  id: string;
  name: string;
  /** Club o selección. */
  team: string;
  position: string;
  /** Ausente en los cromos que no son jugadores. */
  line?: CromoLine;
  /** Dorsal con el que juega, si se sabe. Va impreso en el retrato. */
  number?: number;
  /**
   * Foto de verdad, si algún día la hay (`/photos/cromos/<id>.jpg`). Cuando
   * falta —que es lo normal— el cromo se dibuja: retrato ilustrado con los
   * colores de su equipo. Ver `lib/cromoArt.ts`.
   */
  photo?: string;
  /**
   * El cromo es de una persona aunque no juegue al fútbol —una cantante, uno
   * de la casa—, así que se le dibuja la cara. Los jugadores no necesitan
   * decirlo: se deduce de que tienen línea de campo.
   */
  persona?: boolean;
  /**
   * De quién de la casa es el cromo. Su imagen sale entonces de la foto de
   * ese perfil, de modo que si la cambiáis desde la app —ajustes de aspecto—
   * el cromo cambia con ella y no se queda con la de fábrica.
   */
  profile?: ProfileId;
  /** Cómo es de cara, si se sabe. Ver `CromoLook`. */
  look?: CromoLook;
  /** Emoji del cromo. Es la imagen de los que no son jugadores. */
  emblem: string;
  /** Por qué se le recuerda. */
  dato: string;
  /** La lección que el cromo deja para el que lo gana. */
  lema: string;
  rarity: CromoRarity;
}

/** De qué habla la frase; se muestra como etiqueta en la tarjeta. */
export type FraseTheme = 'familia' | 'ella' | 'aula' | 'paternidad' | 'oficio' | 'pareja';

export interface FraseReward {
  kind: 'frase';
  id: string;
  text: string;
  /** Ausente en las escritas para la casa. */
  author?: string;
  theme: FraseTheme;
  rarity: FraseRarity;
}

export type Reward = CromoReward | FraseReward;

export interface UnlockedReward {
  reward: Reward;
  /** Lunes de la semana en que se ganó. */
  week: DateKey;
  challengeId: string;
  challengeTitle: string;
}

/* ------------------------------ Juego del día ---------------------------- */

/**
 * Los dos juegos de los peques. Cada día toca uno y sólo uno, alternándose:
 * un día se piensa con números y al siguiente con el campo delante.
 */
export type GameId = 'logica' | 'tactica';

/** Una respuesta posible. Lo que se compara es el `id`, no el texto. */
export interface GameOption {
  id: string;
  text: string;
}

export interface GameQuestion {
  id: string;
  /** El enunciado, tal cual se lee. */
  prompt: string;
  options: GameOption[];
  /** `id` de la opción buena. */
  answer: string;
  /** Por qué esa es la buena; se enseña al contestar, se acierte o no. */
  explain: string;
  icon: string;
}

/** La partida de un día: las mismas preguntas siempre para ese día y perfil. */
export interface GameRound {
  game: GameId;
  date: DateKey;
  title: string;
  icon: string;
  /** De qué va la partida, en una línea. */
  tagline: string;
  questions: GameQuestion[];
}

/**
 * Lo que queda escrito de la partida del día. Es lo único que se guarda del
 * juego —una línea en las notas del día—: las preguntas y el premio se
 * recalculan a partir de aquí, como todo lo demás en la casa.
 *
 * `answered` permite retomar una partida que se cerró a medias sin poder
 * empezarla otra vez: se sigue por la pregunta en la que se dejó.
 */
export interface GameResult {
  game: GameId;
  /** Aciertos hasta ahora. */
  correct: number;
  /** Preguntas ya contestadas. */
  answered: number;
  total: number;
  /** Momento de la última respuesta (ISO). */
  at: string;
}

/* -------------------------------- Campograma ---------------------------- */

/**
 * Una ranura del campo: dónde se pinta y qué línea admite. Las coordenadas
 * van en tanto por ciento del campo, no en píxeles, para que el mismo dibujo
 * valga en el móvil y en la tableta.
 */
export interface FormationSlot {
  id: string;
  line: CromoLine;
  /** Rótulo corto del puesto: POR, LD, DFC, MC… */
  label: string;
  /** 0 es la banda izquierda, 100 la derecha. */
  x: number;
  /** 0 es la línea de gol propia, 100 la portería rival. */
  y: number;
}

export interface Formation {
  id: string;
  /** Como se dice en voz alta: «4-3-3». */
  name: string;
  detail: string;
  slots: FormationSlot[];
}

/**
 * El equipo que ha montado un perfil con sus cromos. Es lo único de la
 * colección que se guarda: los cromos ganados se deducen del historial, pero
 * dónde ha decidido colocarlos es una elección suya y se perdería.
 */
export interface Lineup {
  /** Nombre que le ha puesto a su equipo. */
  teamName: string;
  /** Identificador de la formación elegida. */
  formation: string;
  /** Cromo de cada ranura del once: `slotId -> cromoId`. */
  eleven: Record<string, string>;
  /** El resto de la plantilla, en el orden en que la ha ordenado. */
  bench: string[];
  /** Cromo con el brazalete, si ha elegido uno. */
  captain?: string;
  updatedAt: string;
}

/* -------------------------- Bonus de aprendizaje ------------------------ */

/**
 * Idioma en que se presenta el bonus. No es un detalle de formato: para los
 * peques y para Víctor el inglés es parte de lo que se practica.
 */
export type LearningLang = 'en' | 'es';

/** Una pieza del catálogo de aprendizaje. */
export interface LearningBonus {
  id: string;
  /** Categoría del perfil de la que nace; es lo que lo ata a su interés. */
  topic: string;
  lang: LearningLang;
  icon: string;
  title: string;
  /** Lo que se aprende hoy, en dos o tres frases. */
  body: string;
  /** Qué hacer con ello hoy mismo. */
  apply: string;
  /** Sólo en los de inglés: el puñado de palabras, traducidas. */
  gloss?: string;
}

/** El bonus del día, ya elegido, con el porqué de la elección. */
export interface DailyLearning {
  bonus: LearningBonus;
  /** Categoría de la que salió. */
  topicLabel: string;
  topicIcon: string;
  /**
   * `true` cuando sale de donde más se está registrando; `false` cuando
   * todavía no hay datos suficientes y se ha elegido por orden.
   */
  fromInterest: boolean;
}

/* ------------------------------- Criterio ------------------------------- */

/**
 * Qué respaldo tiene lo que dice cada referencia. Se muestra en la ficha para
 * que se sepa qué es consenso y qué es la tesis de un divulgador concreto:
 *  - `consenso`    lo sostienen organismos y revisiones (OMS, AAP, metaanálisis).
 *  - `divulgacion` divulgadores que resumen bien la evidencia disponible.
 *  - `discutido`   parte de su marco no está respaldado; se cita lo que sí lo está.
 */
export type EvidenceLevel = 'consenso' | 'divulgacion' | 'discutido';

export interface Expert {
  id: string;
  name: string;
  /** En una línea: de qué habla y desde dónde. */
  role: string;
  /** Ámbito en el que se le cita aquí. */
  field: string;
  level: EvidenceLevel;
  /**
   * Sólo en los `discutido`: qué parte de su discurso no está respaldada, para
   * no repetirla sin más. Se enseña junto a su nombre.
   */
  caveat?: string;
}

/**
 * El criterio experto detrás de un hábito. Vive aparte del catálogo de
 * métricas —que es la interfaz— porque es otra cosa: el porqué, la cifra de
 * referencia y quién la sostiene.
 */
export interface HabitGuidance {
  /** Métrica a la que acompaña; la clave del registro. */
  metricId: string;
  priority: HabitPriority;
  /** El titular: qué hay que hacer y por qué, en una frase. */
  claim: string;
  /** El detalle: cifras, matices y cómo aplicarlo en casa. */
  detail: string;
  /** Referencias que lo sostienen, por identificador de `EXPERTS`. */
  experts: string[];
  /** Sólo para estos perfiles; ausente significa «para todos». */
  only?: ProfileId[];
}

/** Un hábito clave que hoy pide atención, ya resuelto contra lo registrado. */
export interface AttentionItem {
  guidance: HabitGuidance;
  metric: Metric;
  categoryId: string;
  categoryLabel: string;
  /** Cumplimiento de hoy, o `null` si aún no se ha registrado. */
  ratio: number | null;
  /** Qué le pasa: sin registrar, por debajo del suelo o por encima del techo. */
  status: 'sinRegistrar' | 'flojo' | 'excedido';
}

/* --------------------------------- Tareas -------------------------------- */

/**
 * De qué va el recado. No cambia el cálculo de nada: sirve para ponerle un
 * icono, agruparlo de un vistazo y decirle a Google Calendar de qué color
 * pintar el evento.
 */
export type TaskKind =
  | 'cita'
  | 'colegio'
  | 'compra'
  | 'casa'
  | 'salud'
  | 'trabajo'
  | 'ocio'
  | 'otro';

/** Cada cuánto vuelve la tarea. `none` es lo normal: se hace y se acabó. */
export type TaskRepeat = 'none' | 'daily' | 'weekly' | 'monthly';

/** El evento espejo en Google Calendar, cuando la tarea ya ha viajado. */
export interface TaskCalendarLink {
  /** Identificador del evento en Google. */
  eventId: string;
  /** Calendario en el que vive; puede no ser el principal de la cuenta. */
  calendarId: string;
  /** Enlace para abrirlo en Google Calendar. */
  htmlLink?: string;
  /**
   * Copia de lo que se mandó la última vez. Comparándola con la tarea actual
   * se sabe si el evento está desfasado sin preguntárselo a Google.
   */
  signature: string;
  syncedAt: string;
}

export interface Task {
  id: string;
  profileId: ProfileId;
  title: string;
  /** Detalle opcional: la dirección de la consulta, qué marca de leche… */
  detail?: string;
  kind: TaskKind;
  /** Día en que toca. Ausente en las tareas sin fecha («algún día»). */
  due?: DateKey;
  /** Hora `HH:MM` dentro de ese día; sin ella, es tarea de todo el día. */
  time?: string;
  /** Minutos que ocupa, sólo cuando hay hora. */
  duration?: number;
  /** Minutos de antelación del aviso; `null` explícito sería «sin aviso». */
  remindBefore?: number;
  repeat: TaskRepeat;
  done: boolean;
  /** Cuándo se marcó hecha (ISO). */
  doneAt?: string;
  calendar?: TaskCalendarLink;
  /**
   * La tarea debería estar en el calendario y todavía no lo está: se apuntó
   * sin cobertura, o el envío falló. La app lo reintenta sola en cuanto
   * vuelve a abrirse la sección, y por eso hace falta distinguirlo de una
   * tarea que nunca se quiso mandar o que se quitó a mano.
   */
  calendarPending?: boolean;
  createdAt: string;
  /** Última modificación; es lo que decide quién gana al sincronizar. */
  updatedAt: string;
}

/** Montón en el que cae una tarea al ordenarlas por urgencia. */
export type TaskBucket =
  | 'vencidas'
  | 'hoy'
  | 'manana'
  | 'semana'
  | 'despues'
  | 'sinFecha'
  | 'hechas';

/**
 * Lo que la app sabe de la cuenta de Google enlazada a un perfil. Nunca
 * incluye credenciales: los tokens viven en el servidor y no salen de allí.
 */
export interface CalendarLink {
  profileId: ProfileId;
  /** Cuenta de Google con la que se enlazó. */
  email: string;
  calendarId: string;
  calendarName: string;
  connectedAt: string;
  /**
   * Google ha dejado de aceptar el permiso: alguien lo retiró desde su
   * cuenta, cambió la contraseña o el proyecto sigue sin publicar y ha
   * caducado. Hay que volver a conectar, y la app tiene que decirlo en vez
   * de quedarse callada dando por hecho que sigue enlazada.
   */
  needsReconnect: boolean;
  /** Última vez que se comprobó que el permiso seguía vivo (ISO). */
  checkedAt?: string;
}

/** Un calendario de la cuenta, para poder elegir dónde caen los recordatorios. */
export interface CalendarOption {
  id: string;
  name: string;
  /** El principal de la cuenta. */
  primary: boolean;
  /** Sin permiso de escritura no se puede usar para crear eventos. */
  writable: boolean;
}

/* -------------------------------- Ajustes -------------------------------- */

/**
 * Huella del PIN. Nunca se guarda el número: se guarda de qué sal salió y
 * qué resultado dio, que es lo único que hace falta para comprobarlo.
 */
export interface PinDigest {
  /** Sal aleatoria, en hexadecimal. */
  salt: string;
  /** PBKDF2-SHA256 del PIN con esa sal, en hexadecimal. */
  hash: string;
  /** Vueltas usadas; se guarda para poder subirlas más adelante sin romper. */
  rounds: number;
}

/**
 * Lo que la casa elige una vez y vale en todas partes: el modo, si suenan
 * las sintonías y el PIN del módulo privado. Lleva fecha de edición porque
 * viaja a la nube y hay que saber qué elección es la última.
 */
export interface HouseSettings {
  theme: ThemePreference;
  sound: boolean;
  /** `null` mientras siga valiendo el PIN de fábrica. */
  pin: PinDigest | null;
  /**
   * Clave de la sección de economía de Víctor, aparte del PIN de la casa.
   *
   * Viaja como huella y sólo como huella, igual que el PIN: ni el número ni
   * nada que se le parezca se guarda en claro, ni aquí, ni en el navegador,
   * ni en el código —el repositorio es público—. `null` mientras no se haya
   * puesto ninguna, que es cuando la sección pide crearla.
   */
  finance: PinDigest | null;
  updatedAt: string;
}

/* ------------------------------ Navegación ------------------------------ */

export type SummaryRange = 'week' | 'month';
export type DashboardTab = 'today' | 'plan' | 'challenges' | 'tasks' | 'summary' | 'economia';

/* ------------------------------- Economía ------------------------------- */

/**
 * Las seis libretas de la sección de economía. Las dos primeras son el ritmo
 * del mes; las cuatro siguientes, la foto del patrimonio.
 */
export type LedgerId = 'ingresos' | 'gastos' | 'cuentas' | 'inversiones' | 'cobros' | 'pagos';

/**
 * A qué sirve un gasto, en la escala que ha decidido la casa.
 *
 * No es una categoría contable: es una prioridad. El orden importa y es el
 * que decidió Víctor —primero los peques y lo que les hace crecer, luego el
 * tiempo con María y las experiencias de los cuatro, y después la comodidad
 * de vivir—, porque es contra ese orden contra el que la app contrasta el
 * reparto real. Antes de todos ellos está `base`: lo que no se elige.
 */
export type SpendTier = 'base' | 'hijos' | 'pareja' | 'familia' | 'calidad' | 'otros';

/**
 * Una foto mensual de las cuentas.
 *
 * Sin esto la sección sólo sabe decir cómo van hoy, y «cómo van» sin «de
 * dónde vienen» no es información: la tasa de ahorro de un mes suelto no
 * dice nada y la de doce dice casi todo. Se guarda una por mes, se pisa
 * mientras el mes está en curso y se queda quieta cuando pasa.
 */
export interface FinanceSnapshot {
  /** «2026-09». */
  month: string;
  /** Lo que entraba al mes, según la libreta de ese momento. */
  income: number;
  /** Y lo que salía. */
  expense: number;
  /** El patrimonio de entonces. */
  worth: number;
  /** Y la parte de él que era dinero disponible. */
  liquid: number;
}

/**
 * Algo que la app tiene que decir de estas cuentas, ya contrastado contra las
 * cifras. Sin cifra no hay nota: un aviso sin número no es un aviso, es una
 * frase de libro.
 */
export interface FinanceNote {
  id: string;
  /**
   *  - `grave` está sangrando: hay que mirarlo hoy.
   *  - `aviso` se aparta de un criterio con respaldo.
   *  - `idea`  no está mal, pero se puede hacer mejor.
   *  - `bien`  está donde debe, y conviene saberlo.
   */
  tone: 'grave' | 'aviso' | 'idea' | 'bien';
  icon: string;
  /** El titular, con la cifra dentro. */
  title: string;
  /** El detalle: de dónde sale el número y qué hacer con él. */
  detail: string;
  /** Quién lo sostiene, por identificador de `FINANCE_EXPERTS`. */
  experts: string[];
  /** La cifra suelta, para enseñarla al lado del titular. */
  metric?: string;
}

/** Un apunte: una línea de cualquiera de las libretas. */
export interface FinanceItem {
  id: string;
  label: string;
  icon: string;
  /**
   * La cifra principal: lo que entra o sale al mes en ingresos y gastos, el
   * saldo en las demás. En los gastos es **la previsión**.
   */
  amount: number;
  /**
   * La segunda cifra, donde la libreta la usa: el gasto real frente a la
   * previsión, o el máximo frente al mínimo en un ingreso que no está
   * cerrado. Sin ella, manda la primera.
   */
  alt?: number;
  note?: string;
  /**
   * A qué prioridad de la casa sirve. Sólo se usa en los gastos: es lo que
   * permite contrastar en qué se va el dinero contra el orden que se ha
   * decidido, que es distinto de en qué categoría cae.
   */
  tier?: SpendTier;
}

/**
 * Las cuentas de un curso, del 1 de agosto al 31 de julio.
 *
 * Vive sólo en el aparato: no hay tabla en la nube para esto, a propósito.
 */
export interface FinanceBook {
  /** «2025-26». */
  season: string;
  /** Meses que se presupuestan. El curso entero son doce. */
  months: number;
  /**
   * Meses que de verdad se cobra.
   *
   * No es lo mismo que `months` y confundirlos es el error que más caro sale:
   * en un club se cobran diez meses y se vive doce, así que un mes tipo puede
   * salir cuadrado y el año entero no cuadrar. Cuando no está puesto vale lo
   * mismo que `months`, que es el caso de quien cobra todos los meses.
   */
  payMonths?: number;
  /** El pico de las vacaciones, que no cabe en el mes tipo. */
  holidays: number;
  ledgers: Record<LedgerId, FinanceItem[]>;
  /** Una foto por mes, de la más vieja a la más nueva. */
  history: FinanceSnapshot[];
  /** Con qué cifras se juzga la independencia financiera. */
  goals: FinanceGoals;
  updatedAt: string;
}

/**
 * Las dos cifras con las que se mide el objetivo. Se pueden cambiar porque
 * ninguna de las dos es una ley de la naturaleza, y quien las cambia debe
 * saber lo que está cambiando.
 */
export interface FinanceGoals {
  /**
   * Cuánto se puede sacar al año de lo acumulado sin que se acabe, en tanto
   * por ciento. El 4 % viene del trabajo de Bengen y del estudio Trinity
   * sobre carteras a treinta años; hay quien lo baja al 3,5 % para retiradas
   * más largas, que es exactamente el caso de retirarse pronto.
   */
  withdrawal: number;
  /**
   * Meses de gasto que se quieren tener en dinero disponible. Lo corriente
   * son tres a seis; con un sueldo que depende de un contrato de temporada,
   * doce es lo prudente.
   */
  cushion: number;
  /** Rendimiento real anual que se supone al proyectar, en tanto por ciento. */
  realReturn: number;
}

/**
 * Una cosa que hacer con estas cuentas, ya con la cifra puesta.
 *
 * Es el paso siguiente a `FinanceNote`. La nota **describe** —«el 96 % está
 * en una sola casa»—; la acción **manda**: qué mover, cuánto, y qué cambia si
 * se hace. La diferencia importa porque un diagnóstico sin siguiente paso se
 * lee, se asiente y no se toca nada.
 */
export interface PlanAction {
  id: string;
  /**
   *  - `sangra`   el dinero se está yendo hoy: es lo primero.
   *  - `frágil`   no sangra, pero deja a la casa sin margen si algo falla.
   *  - `ordenar`  está bien, pero mal colocado o sin fecha.
   *  - `mirar`    ni urge ni falla: conviene tenerlo delante.
   */
  urgency: 'sangra' | 'fragil' | 'ordenar' | 'mirar';
  icon: string;
  /** Qué hacer, con la cifra dentro. */
  title: string;
  /** Por qué, con el número del que sale. */
  why: string;
  /** Los pasos concretos. Cada uno con su cantidad cuando la tiene. */
  steps: string[];
  /** Qué cambia si se hace. Sin esto, una recomendación es una opinión. */
  effect?: string;
  /** La cifra suelta, para el canto de la tarjeta. */
  metric?: string;
  /** Quién lo sostiene, por identificador de `FINANCE_EXPERTS`. */
  experts: string[];
}

/* ---------------------------- Agenda semanal ----------------------------- */

/**
 * De qué va el rato apartado en la semana. No cambia ningún cálculo: le pone
 * icono y color, agrupa de un vistazo y decide qué avisos tienen sentido
 * (a nadie hay que decirle que ha planificado demasiado sueño).
 */
export type PlanKind =
  | 'cole'
  | 'deporte'
  | 'estudio'
  | 'comida'
  | 'sueno'
  | 'ocio'
  | 'trabajo'
  | 'casa'
  | 'juntos'
  | 'pareja'
  | 'cuidado'
  | 'otro';

/**
 * Quién está con los peques en ese rato. Es la pregunta que de verdad se hace
 * en casa al mirar la semana —«el jueves a las cinco, ¿quién los lleva?»— y
 * por eso vive dentro del bloque y no en una nota suelta.
 */
export type Companion = 'mama' | 'papa' | 'ambos' | 'abuelos' | 'solos' | 'cole' | 'otro';

/**
 * Un rato apartado en la semana. Es rutina, no cita: vive en un día de la
 * semana (lunes…domingo) y vuelve todas las semanas. Lo que ocurre una sola
 * vez son las tareas, que ya tienen su sección y su fecha.
 */
export interface PlanBlock {
  id: string;
  /** 0 = lunes … 6 = domingo. */
  day: number;
  /** Hora de inicio, `HH:MM`. */
  start: string;
  /** Minutos que ocupa. */
  duration: number;
  title: string;
  icon: string;
  kind: PlanKind;
  /**
   * Métrica del registro con la que se corresponde este rato. Es lo que ata
   * la agenda a los hábitos: sin ella el bloque es sólo un plan; con ella la
   * app puede decir si lo previsto se cumplió, se quedó corto o se pasó.
   */
  metricId?: string;
  /** Cuánto aporta a esa métrica (minutos, vasos, sesiones…). */
  amount?: number;
  /**
   * `true` cuando la cantidad se ha escrito a mano y manda sobre el reloj.
   *
   * Por defecto, un rato atado a un hábito que se mide en tiempo —minutos de
   * lectura, horas de sueño— lleva la cuenta solo: lo que dura el bloque es
   * lo que se pretende dedicarle, así que estirar la lectura de veinte a
   * cuarenta minutos sube también lo previsto. Es lo natural, y es lo que
   * evita que la agenda y el registro se separen sin que nadie se entere.
   *
   * Pero hay ratos en los que no coincide: en una hora de gimnasio se leen
   * quince minutos. Quien escribe la cantidad a mano en el editor deja esta
   * marca puesta, y a partir de ahí el reloj ya no la toca hasta que se pida
   * volver al automático.
   */
  amountLock?: boolean;
  /** Con quién está el peque en ese rato. */
  companion?: Companion;
  /**
   * `true` cuando este rato **puede** pasar a la vez que otro y eso no es un
   * fallo del plan.
   *
   * La natación de los peques es en el propio colegio: el rato de natación
   * cae dentro del de cole y los dos son verdad a la vez. Sin esta marca la
   * agenda los pintaba con filete rojo y avisaba de que «uno de los dos no va
   * a pasar», que es justo lo contrario de lo que ocurre. Lo que cabe entero
   * dentro de otro rato se da por simultáneo solo; esto es para los solapes a
   * medias —la reunión que empieza antes de que acabe la clase— que también
   * se quieren dar por buenos.
   */
  overlapOk?: boolean;
  note?: string;
  /**
   * Rato prestado de la agenda de otro perfil, sólo para mirarlo.
   *
   * Es lo que hace que en la semana de María salga la natación de Leo si la
   * lleva ella: el rato sigue viviendo en la agenda de Leo —allí se cambia y
   * allí se quita— y aquí es un reflejo de sólo lectura. **Nunca se guarda**:
   * al leer la agenda se descarta, así que no puede colarse en el almacén ni
   * viajar a la nube.
   */
  mirror?: PlanMirror;
}

/** Un peque de los que traen un rato reflejado a esta agenda. */
export interface PlanMirrorKid {
  profileId: ProfileId;
  name: string;
  /** Emoji del peque, para reconocerlo de un vistazo en la pastilla. */
  avatar: string;
  /** Color del peque: el filete con el que se distingue del resto. */
  tint: string;
}

/** De quién viene un rato reflejado, y por qué sale en esta agenda. */
export interface PlanMirror {
  /**
   * Los peques a los que les toca ese mismo rato. Casi siempre uno, pero la
   * natación de los hermanos es **una** natación: si en la semana de Leo y en
   * la de Hugo el rato es idéntico —mismo día, misma hora, lo que dura, cómo
   * se llama y con quién—, es el mismo plan y sale una sola vez, con los dos
   * dentro. Duplicarlo era contar dos veces una tarde que es una.
   */
  kids: PlanMirrorKid[];
  /** Cómo se dice de quién es: «Leo», «Leo y Hugo». */
  name: string;
  /** Su cara, o las dos caras si el rato es de los dos. */
  avatar: string;
  /** Color con el que se marca: el del peque, o el del primero si son varios. */
  tint: string;
  /** Qué acompañante del rato original lo trae hasta aquí. */
  companion: Companion;
}

/** La semana tipo de un perfil. Una por perfil, fechada para poder viajar. */
export interface WeekPlan {
  blocks: PlanBlock[];
  updatedAt: string;
}

/**
 * Qué ha pasado con un rato planificado, mirado contra lo registrado ese día:
 *  - `sinMetrica`   no está atado a ningún hábito: no hay nada que comprobar.
 *  - `futuro`       todavía no ha llegado el día.
 *  - `sinDia`       aquel día no se registró nada de nada, así que no hay
 *                   contra qué comparar. Distinto de `sinRegistrar`: allí el
 *                   día sí se rellenó y esta casilla concreta se quedó vacía,
 *                   que es un fallo de verdad; aquí sencillamente no se sabe,
 *                   y contarlo como fallo daba disparates —una semana tipo
 *                   recién puesta se estrenaba diciendo «68 fallidos» de unos
 *                   días en los que ni siquiera existía—.
 *  - `sinRegistrar` el día se registró y la casilla sigue vacía.
 *  - `cumplido`     lo registrado cubre lo previsto.
 *  - `flojo`        se registró, pero por debajo de lo previsto.
 *  - `excedido`     la métrica era un techo y se ha pasado.
 */
export type PlanStatus =
  | 'sinMetrica'
  | 'futuro'
  | 'sinDia'
  | 'sinRegistrar'
  | 'cumplido'
  | 'flojo'
  | 'excedido';

export interface PlanBlockCheck {
  block: PlanBlock;
  date: DateKey;
  /** Métrica atada, si la hay y sigue existiendo en el catálogo. */
  metric?: Metric;
  status: PlanStatus;
  /** Cumplimiento de esa métrica ese día, o `null` si no hay dato. */
  ratio: number | null;
  /** Lo registrado ese día, ya legible («35 min», «Sí»). */
  reading: string;
  /** Qué decir del bloque en una línea. */
  text: string;
}

/** Tono del aviso: falta algo, sobra algo, ojo con esto, o todo en orden. */
export type PlanAlertTone = 'carencia' | 'exceso' | 'aviso' | 'bien';

export interface PlanAlert {
  id: string;
  tone: PlanAlertTone;
  icon: string;
  title: string;
  detail: string;
  /** Día de la semana al que se refiere, cuando es de uno solo. */
  day?: number;
}

/** Lo que la agenda de una semana sabe decir de sí misma. */
export interface PlanReview {
  /** Desenlace de cada rato de la semana, día a día. */
  checks: PlanBlockCheck[];
  alerts: PlanAlert[];
  /** Ratos planificados en la semana. */
  blocks: number;
  /** De ésos, los que están atados a un hábito. */
  linked: number;
  /** Ratos ya vividos cuyo hábito quedó registrado a la altura. */
  kept: number;
  /** Ratos ya vividos que fallaron: sin registrar, flojos o excedidos. */
  missed: number;
}
