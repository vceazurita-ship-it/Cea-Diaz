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
  /** Miembros incluidos en los módulos compartidos. */
  members?: ProfileId[];
  /** Los módulos privados exigen PIN antes de mostrar datos. */
  isPrivate?: boolean;
  /** Piel visual del panel del perfil. Por defecto `night`. */
  skin?: ProfileSkin;
  /** Variante oscura del acento, usada sobre los fondos claros de `editorial`. */
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
}

/* ------------------------------- Métricas ------------------------------- */

export type MetricType = 'toggle' | 'counter' | 'duration' | 'scale' | 'choice';

interface MetricBase {
  id: string;
  label: string;
  icon: string;
  help?: string;
  /** Peso relativo dentro de la categoría al calcular el cumplimiento. */
  weight?: number;
  /** Agrupador opcional (p. ej. la actividad deportiva a la que pertenece). */
  group?: string;
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

export interface DayEntry {
  date: DateKey;
  profileId: ProfileId;
  values: Record<string, MetricValue>;
  note?: string;
  /** Marca temporal de la última edición (ISO). */
  updatedAt: string;
}

/** Clave del registro: `${profileId}:${date}`. */
export type EntryKey = string;

export interface HabitDatabase {
  version: number;
  entries: Record<EntryKey, DayEntry>;
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

/* ------------------------------ Navegación ------------------------------ */

export type SummaryRange = 'week' | 'month';
export type DashboardTab = 'today' | 'summary';
