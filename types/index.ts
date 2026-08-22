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
}

/** Cantidad continua con objetivo: minutos, horas de sueño... */
export interface DurationMetric extends MetricBase {
  type: 'duration';
  target: number;
  min: number;
  max: number;
  step: number;
  unit: string;
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
  /** Sólo para layout 'sports': tarjetas por actividad. */
  groups?: MetricGroup[];
}

/* ------------------------------- Registros ------------------------------ */

/** Fecha en formato ISO local `YYYY-MM-DD`. */
export type DateKey = string;

/**
 * Clave de una nota suelta del día. Son los identificadores de categoría
 * (`nutricion`, `deporte`, `sueno`…) más `retos`, reservada para lo que se
 * apunta desde el panel de retos. El catálogo de categorías no usa ese
 * nombre, así que no hay colisión posible.
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
   * escriben y viajan al consejo del día junto con lo registrado.
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
  /** Análisis de fotos de comida, por identificador propio. */
  meals: Record<string, MealAnalysis>;
  /** Consejos del día, bajo la misma clave `${profileId}:${date}`. */
  advice: Record<EntryKey, DayAdvice>;
  /**
   * Borrados pendientes de propagar a la nube, como `tabla:id` → momento del
   * borrado. Sin esto, lo borrado en un móvil volvería en la siguiente
   * sincronización, porque en la nube seguiría existiendo.
   */
  tombstones: Record<string, string>;
}

/* ------------------------- Consejos y progresión ------------------------ */

/** Reto para la próxima sesión, un punto por encima de lo hecho hoy. */
export interface NextChallenge {
  /** Dónde toca: «gimnasio», «entrenamiento propio», «atletismo»… */
  ambito: string;
  titulo: string;
  detalle: string;
  /** Sobre qué se ha construido la progresión. */
  partiendoDe: string;
}

/** Lo que devuelve el análisis de las observaciones del día. */
export interface DayAdviceVerdict {
  /** Una línea que resume lo contado, para saber de qué salió el consejo. */
  resumen: string;
  /** Consejos para mañana o los próximos días. */
  consejos: string[];
  /** Sólo si el día incluye gimnasio o entrenamiento. */
  reto?: NextChallenge;
}

export interface DayAdvice extends DayAdviceVerdict {
  id: EntryKey;
  profileId: ProfileId;
  date: DateKey;
  /** Copia de las observaciones sobre las que se generó. */
  observaciones: string;
  /** Lo marca quien cumple el reto de la próxima sesión. */
  retoCumplido?: boolean;
  createdAt: string;
  /** Última modificación; es lo que decide quién gana al sincronizar. */
  updatedAt: string;
}

/* ------------------------------ Comidas --------------------------------- */

export type MealMoment = 'desayuno' | 'comida' | 'merienda' | 'cena';

/** Cómo encaja ese alimento en el objetivo de quien come. */
export type FoodBalance = 'bien' | 'justo' | 'sobra' | 'falta';

/** Qué habría que hacer distinto la próxima vez. */
export type MealAdviceKind = 'aumentar' | 'reducir' | 'cambiar' | 'anadir';

export interface MealFood {
  nombre: string;
  /** Ración estimada a ojo: «un puñado», «medio plato»… */
  racion: string;
  balance: FoodBalance;
}

export interface MealAdvice {
  tipo: MealAdviceKind;
  texto: string;
}

/** Lo que devuelve el análisis de la foto, ya validado. */
export interface MealVerdict {
  /** `false` cuando la foto no es un plato de comida. */
  esComida: boolean;
  /** Nota de 0 a 10 respecto al objetivo de esa persona. */
  nota: number;
  /** Nombre corto del plato. */
  titulo: string;
  resumen: string;
  alimentos: MealFood[];
  aciertos: string[];
  ajustes: MealAdvice[];
}

export interface MealAnalysis extends MealVerdict {
  id: string;
  profileId: ProfileId;
  date: DateKey;
  moment: MealMoment;
  /**
   * Lo que se contó del plato al hacer la foto («lleva aceite de oliva», «se
   * ha dejado la mitad»). Se manda al análisis y se conserva para saber sobre
   * qué se juzgó.
   */
  contexto?: string;
  /** Clave de la miniatura en IndexedDB; ausente si no se pudo guardar. */
  photoId?: string;
  /** Ruta del objeto en Supabase Storage, cuando la foto ya está en la nube. */
  photoPath?: string;
  createdAt: string;
  /** Última modificación; es lo que decide quién gana al sincronizar. */
  updatedAt: string;
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

/** Rareza del cromo, ligada al nivel del reto que lo entrega. */
export type CromoRarity = 'liga' | 'estrella' | 'leyenda';

/** Rareza de la frase, ligada al nivel del reto que la entrega. */
export type FraseRarity = 'chispa' | 'fuerza' | 'oro';

export interface CromoReward {
  kind: 'cromo';
  id: string;
  name: string;
  /** Club, selección o equipo del anime. */
  team: string;
  position: string;
  /** Emoji del cromo. */
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

/* ------------------------------ Navegación ------------------------------ */

export type SummaryRange = 'week' | 'month';
export type DashboardTab = 'today' | 'challenges' | 'summary';
