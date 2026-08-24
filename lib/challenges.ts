import { addDays, formatShort, parseDateKey, weekKeys } from '@/lib/dates';
import { guidanceFor } from '@/lib/experts';
import {
  VICTOR_SPLIT,
  companionMetricId,
  findMetric,
  getCategories,
  markMetricId,
} from '@/lib/habits';
import type { SplitMark, SplitSession } from '@/lib/habits';
import { computeCategoryScore, computeDayScore, isCeiling, metricRatio } from '@/lib/scoring';
import type {
  Challenge,
  ChallengeProgress,
  ChallengeRule,
  ChallengeTier,
  ChallengeWeek,
  DateKey,
  DayEntry,
  HabitCategory,
  HabitPriority,
  Metric,
  MetricHint,
  MetricValue,
  Profile,
  ProfileId,
  ScoredChallenge,
} from '@/types';

/* =========================================================================
 *  Retos — objetivos semanales deducidos del historial de cada perfil.
 *
 *  Un reto no se inventa: sale de los últimos 28 días de quien lo recibe.
 *  Por eso «máximo esfuerzo» significa algo distinto para cada miembro de la
 *  casa: el listón se calcula sobre su propia marca, nunca sobre una tabla
 *  general. Leo compite contra Leo; María, contra María.
 *
 *  Tres retos por semana, uno por nivel:
 *    · base    — asegurar el suelo: registrar, estrenar, completar.
 *    · reto    — atacar el punto flojo o acumular aprendizaje.
 *    · maximo  — batir el récord propio o dar el máximo esfuerzo.
 *
 *  Se generan con los datos anteriores al lunes, así que el listón no se
 *  mueve mientras la semana corre, y se evalúan sobre esos siete días.
 *
 *  A esos tres se suman los retos fijos de quien tenga una rutina cerrada
 *  —el reparto semanal de Víctor—, que no se deducen de nada: están decididos
 *  de antemano y se rellenan el día que se marca la sesión.
 * ========================================================================= */

/** Ventana de historial que sirve de base para calibrar los retos. */
export const BASELINE_DAYS = 28;

export const TIER_ORDER: ChallengeTier[] = ['base', 'reto', 'maximo'];

export const TIER_LABEL: Record<ChallengeTier, string> = {
  base: 'Cimiento',
  reto: 'Reto',
  maximo: 'Máximo esfuerzo',
};

const TIER_XP: Record<ChallengeTier, number> = { base: 10, reto: 25, maximo: 40 };

/* ---------------------------------------------------------------------------
 * Utilidades numéricas y de texto
 * ------------------------------------------------------------------------- */

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Valor bruto de la métrica como número comparable. */
function numericValue(metric: Metric, value: MetricValue | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;

  switch (metric.type) {
    case 'toggle':
      return value === true ? 1 : 0;
    case 'counter':
    case 'duration':
    case 'scale': {
      const n = Number(value);
      return Number.isNaN(n) ? null : n;
    }
    case 'choice':
      return metric.options.find((o) => o.value === value)?.score ?? null;
    default:
      return null;
  }
}

function stepOf(metric: Metric): number {
  return metric.type === 'counter' || metric.type === 'duration' ? metric.step || 1 : 1;
}

/** Redondea al múltiplo del paso de la métrica, sin arrastrar coma flotante. */
function toStep(
  value: number,
  step: number,
  mode: 'round' | 'ceil' | 'floor' = 'round',
): number {
  const fn = mode === 'ceil' ? Math.ceil : mode === 'floor' ? Math.floor : Math.round;
  return Number((fn(value / step) * step).toFixed(2));
}

/** Número en castellano: sin decimales cuando es entero, con coma cuando no. */
function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

function unitOf(metric: Metric): string {
  return metric.type === 'counter' || metric.type === 'duration' ? metric.unit : '';
}

/** «35 min», «6 vasos», «4» según el tipo de métrica. */
function amount(metric: Metric, value: number): string {
  return `${fmt(value)} ${unitOf(metric)}`.trim();
}

function days(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}

function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

const pct = (ratio: number) => `${Math.round(ratio * 100)} %`;

/**
 * Semilla estable por perfil y semana: dos personas distintas no reciben la
 * misma rotación de retos, y la misma persona ve siempre los mismos mientras
 * dura la semana.
 */
export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/* ---------------------------------------------------------------------------
 * Retrato del historial reciente
 * ------------------------------------------------------------------------- */

interface MetricStat {
  metric: Metric;
  category: HabitCategory;
  /** Etiqueta legible; en el desglose deportivo incluye la actividad. */
  label: string;
  /** Días con algún valor registrado. */
  samples: number;
  /** Días en los que se hizo algo (valor > 0): frecuencia real. */
  activeDays: number;
  /** Media de cumplimiento sobre los días registrados. */
  avgRatio: number;
  /** Mejor valor registrado en la ventana. */
  best: number;
  /** Mejor suma en una semana de la ventana. */
  bestWeekTotal: number;
}

interface DayStats {
  /** Media de cumplimiento de los días con registro. */
  avgRatio: number;
  trackedDays: number;
  total: number;
}

function labelOf(category: HabitCategory, metric: Metric): string {
  const group = metric.group ? category.groups?.find((g) => g.id === metric.group) : undefined;
  return group ? `${group.label} · ${metric.label}` : metric.label;
}

function collectMetricStats(
  profileId: ProfileId,
  dates: DateKey[],
  entries: Record<string, DayEntry>,
): MetricStat[] {
  const stats: MetricStat[] = [];

  for (const category of getCategories(profileId)) {
    for (const metric of category.metrics) {
      // Las métricas de contexto (weight 0) no son retables.
      if ((metric.weight ?? 1) <= 0) continue;

      let samples = 0;
      let activeDays = 0;
      let ratioSum = 0;
      let best = 0;
      const weekTotals = new Map<number, number>();

      dates.forEach((date, index) => {
        const value = entries[`${profileId}:${date}`]?.values[metric.id];
        const raw = numericValue(metric, value);
        if (raw === null) return;

        samples += 1;
        ratioSum += metricRatio(metric, value) ?? 0;
        if (raw > 0) activeDays += 1;
        if (raw > best) best = raw;

        const week = Math.floor(index / 7);
        weekTotals.set(week, (weekTotals.get(week) ?? 0) + raw);
      });

      stats.push({
        metric,
        category,
        label: labelOf(category, metric),
        samples,
        activeDays,
        avgRatio: samples ? ratioSum / samples : 0,
        best,
        bestWeekTotal: weekTotals.size ? Math.max(...weekTotals.values()) : 0,
      });
    }
  }

  return stats;
}

function collectDayStats(
  profileId: ProfileId,
  dates: DateKey[],
  entries: Record<string, DayEntry>,
): DayStats {
  const scores = dates.map((date) =>
    computeDayScore(profileId, date, entries[`${profileId}:${date}`]),
  );
  const tracked = scores.filter((d) => !d.empty);

  return {
    avgRatio: tracked.length ? tracked.reduce((sum, d) => sum + d.ratio, 0) / tracked.length : 0,
    trackedDays: tracked.length,
    total: dates.length,
  };
}

/* ---------------------------------------------------------------------------
 * Evaluación de un reto sobre un periodo
 * ------------------------------------------------------------------------- */

function makeProgress(current: number, target: number, label: string): ChallengeProgress {
  const ratio = target > 0 ? clamp(current / target, 0, 1) : 0;
  return { current, target, ratio, done: current + 1e-9 >= target, label };
}

export function evaluateRule(
  profileId: ProfileId,
  rule: ChallengeRule,
  dates: DateKey[],
  entries: Record<string, DayEntry>,
): ChallengeProgress {
  const valueOn = (date: DateKey, metric: Metric) =>
    numericValue(metric, entries[`${profileId}:${date}`]?.values[metric.id]);

  switch (rule.type) {
    case 'metricBest':
    case 'metricTotal': {
      const metric = findMetric(profileId, rule.metricId);
      let current = 0;
      if (metric) {
        for (const date of dates) {
          const n = valueOn(date, metric);
          if (n === null) continue;
          current = rule.type === 'metricBest' ? Math.max(current, n) : current + n;
        }
      }
      const label = metric
        ? `${amount(metric, current)} / ${amount(metric, rule.target)}`
        : `${fmt(current)} / ${fmt(rule.target)}`;
      return makeProgress(current, rule.target, label);
    }

    case 'metricLow': {
      const metric = findMetric(profileId, rule.metricId);
      // El cero es la casilla sin tocar, no un tiempo imbatible: mientras no
      // haya un intento, `current` se queda en cero y el marcador lo dice.
      let current = 0;
      if (metric) {
        for (const date of dates) {
          const n = valueOn(date, metric);
          if (n === null || n <= 0) continue;
          current = current === 0 ? n : Math.min(current, n);
        }
      }
      const done = current > 0 && current <= rule.target + 1e-9;
      const mark = metric && current > 0 ? amount(metric, current) : '—';
      const goal = metric ? amount(metric, rule.target) : fmt(rule.target);
      return {
        current,
        target: rule.target,
        // Al revés que en las demás: se avanza acercándose por arriba, así que
        // la barra mide cuánto queda por debajo, no cuánto se lleva sumado.
        ratio: done ? 1 : current > 0 ? clamp(rule.target / current, 0, 1) : 0,
        done,
        label: `${mark} / ${goal}`,
      };
    }

    case 'metricDays': {
      const metric = findMetric(profileId, rule.metricId);
      let current = 0;
      if (metric) {
        // En las métricas de techo el día cuenta cuando se queda por debajo;
        // el umbral se lee al revés sin necesidad de otra regla.
        const ceiling = isCeiling(metric);
        for (const date of dates) {
          const n = valueOn(date, metric);
          if (n === null) continue;
          if (ceiling ? n <= rule.threshold + 1e-9 : n + 1e-9 >= rule.threshold) current += 1;
        }
      }
      return makeProgress(current, rule.days, `${current} / ${days(rule.days)}`);
    }

    case 'dayRatioDays': {
      let current = 0;
      for (const date of dates) {
        const score = computeDayScore(profileId, date, entries[`${profileId}:${date}`]);
        if (!score.empty && score.ratio >= rule.threshold) current += 1;
      }
      return makeProgress(current, rule.days, `${current} / ${days(rule.days)}`);
    }

    case 'dayRatioStreak': {
      let best = 0;
      let running = 0;
      for (const date of dates) {
        const score = computeDayScore(profileId, date, entries[`${profileId}:${date}`]);
        if (!score.empty && score.ratio >= rule.threshold) {
          running += 1;
          best = Math.max(best, running);
        } else {
          running = 0;
        }
      }
      return makeProgress(best, rule.days, `${best} / ${days(rule.days)} seguidos`);
    }

    case 'categoryDays': {
      const category = getCategories(profileId).find((c) => c.id === rule.categoryId);
      let current = 0;
      if (category) {
        for (const date of dates) {
          const values = entries[`${profileId}:${date}`]?.values;
          if (!values) continue;
          const score = computeCategoryScore(category, values);
          if (score.filled > 0 && score.ratio >= rule.threshold) current += 1;
        }
      }
      return makeProgress(current, rule.days, `${current} / ${days(rule.days)}`);
    }

    default:
      return makeProgress(0, 1, '—');
  }
}

/* ---------------------------------------------------------------------------
 * Generación de candidatos
 * ------------------------------------------------------------------------- */

interface Candidate {
  challenge: Challenge;
  /** A mayor prioridad, más pertinente es el reto ahora mismo. */
  priority: number;
  /** Métrica implicada, para no repetirla en dos retos de la misma semana. */
  metricId?: string;
}

function make(
  tier: ChallengeTier,
  id: string,
  icon: string,
  title: string,
  detail: string,
  why: string,
  rule: ChallengeRule,
): Challenge {
  return { id: `${tier}:${id}`, tier, xp: TIER_XP[tier], icon, title, detail, why, rule };
}

/** Umbral de «esto lo he hecho de verdad» para cada tipo de métrica. */
function successThreshold(metric: Metric): number {
  switch (metric.type) {
    case 'counter':
    case 'duration':
      return metric.target;
    case 'toggle':
      return 1;
    case 'scale':
      return Math.max(metric.min + 1, metric.max - 1);
    case 'choice':
      return 0.8;
    default:
      return 1;
  }
}

/** Cómo se lee ese umbral en la tarjeta del reto. */
function thresholdText(metric: Metric, threshold: number): string {
  switch (metric.type) {
    case 'counter':
    case 'duration':
      return isCeiling(metric)
        ? `no pasar de ${amount(metric, threshold)}`
        : `llegar a ${amount(metric, threshold)}`;
    case 'toggle':
      return 'marcarlo';
    case 'scale': {
      const level = metric.levels[Math.round(threshold) - metric.min] ?? `nivel ${fmt(threshold)}`;
      return `dejarlo en «${lower(level)}» o mejor`;
    }
    case 'choice':
      return 'terminar con buenas sensaciones';
    default:
      return 'cumplirlo';
  }
}

/** Cuánto pesa el criterio experto al ordenar los candidatos de la semana. */
const GUIDANCE_WEIGHT: Record<HabitPriority, number> = {
  clave: 1.35,
  importante: 1.15,
  apoyo: 1,
};

function buildCandidates(profile: Profile, stats: MetricStat[], dayStats: DayStats): Candidate[] {
  const kid = profile.kind === 'kid';
  const group = profile.kind === 'group';
  const out: Candidate[] = [];

  for (const stat of stats) {
    const metric = stat.metric;
    const numeric = metric.type === 'counter' || metric.type === 'duration';
    /** Días por semana en los que esa métrica aparece de verdad. */
    const weekly = clamp(Math.round(stat.activeDays / (BASELINE_DAYS / 7)), 1, 7);

    /* --- MÁXIMO · récord personal -------------------------------------- */
    if (numeric && !isCeiling(metric) && stat.samples >= 3 && stat.best > 0) {
      // Sólo tiene sentido batir la marca donde más es mejor. En lo demás
      // (dormir, hidratarse, comer) el objetivo es el objetivo: pasarse no
      // es mejorar, así que el récord se detiene ahí. Y donde la meta es un
      // techo —pantallas— batir la marca sería exactamente lo contrario.
      const ceiling = metric.focus ? metric.max : metric.target;
      const step = stepOf(metric);
      const bump = Math.max(step, toStep(stat.best * 0.12, step, 'ceil'));
      const target = Math.min(ceiling, toStep(stat.best + bump, step, 'ceil'));

      if (target > stat.best) {
        out.push({
          metricId: metric.id,
          priority: 60 + stat.samples,
          challenge: make(
            'maximo',
            `record:${metric.id}`,
            '🚀',
            kid ? `Bate tu récord de ${lower(stat.label)}` : `Récord personal · ${stat.label}`,
            `Un solo día por encima de ${amount(metric, target)}. Tu mejor marca hasta hoy: ${amount(metric, stat.best)}.`,
            'Un récord se bate un día y sube el listón de todos los siguientes: es la forma más limpia de medir el máximo esfuerzo.',
            { type: 'metricBest', metricId: metric.id, target },
          ),
        });
      }
    }

    /* --- MÁXIMO · esfuerzo declarado al tope ---------------------------- */
    if (metric.type === 'scale' && metric.focus === 'esfuerzo' && stat.activeDays > 0) {
      const sessions = Math.min(weekly, 3);
      const top = metric.levels[metric.levels.length - 1] ?? 'el máximo';

      out.push({
        metricId: metric.id,
        priority: 55 + (1 - stat.avgRatio) * 30,
        challenge: make(
          'maximo',
          `esfuerzo:${metric.id}`,
          '🔥',
          `Máximo esfuerzo · ${stat.label.replace(` · ${metric.label}`, '')}`,
          `Termina en «${lower(top)}» ${days(sessions)} de esta semana.`,
          'Ir es la mitad; la otra mitad es cómo se va. El esfuerzo de hoy es la mejora que se ve dentro de un mes.',
          { type: 'metricDays', metricId: metric.id, threshold: metric.max, days: sessions },
        ),
      });
    }

    /* --- RETO · el punto flojo ------------------------------------------ */
    if (stat.samples >= 2 && stat.avgRatio < 0.7) {
      const threshold = successThreshold(metric);
      // Lo que sólo ocurre los días de actividad (cada deporte) no puede
      // pedirse cuatro veces por semana: el listón sale de su frecuencia real.
      const target = clamp(stat.avgRatio < 0.35 ? 3 : 4, 1, metric.group ? weekly : 7);
      // Las escalas y las elecciones cuentan cómo salió el día, no qué se
      // hizo: valen como reto, pero ceden ante lo que sí se decide hacer.
      const subjective = metric.type === 'scale' || metric.type === 'choice';

      out.push({
        metricId: metric.id,
        priority: (40 + (1 - stat.avgRatio) * 40) * (subjective ? 0.6 : 1),
        challenge: make(
          'reto',
          `flojo:${metric.id}`,
          '🎯',
          `${stat.label} · ${days(target)} esta semana`,
          `Consigue ${thresholdText(metric, threshold)} en ${days(target)} de la semana.`,
          `Es lo que menos sale (${pct(stat.avgRatio)} de media en las últimas 4 semanas), y por eso es donde más margen de mejora hay.`,
          { type: 'metricDays', metricId: metric.id, threshold, days: target },
        ),
      });
    }

    /* --- RETO · volumen de aprendizaje ---------------------------------- */
    if (numeric && metric.focus === 'aprendizaje') {
      const step = stepOf(metric);
      const floor = metric.target * (kid ? 4 : 5);
      const target = toStep(Math.max(floor, stat.bestWeekTotal * 1.1), step, 'ceil');

      out.push({
        metricId: metric.id,
        priority: 45 + stat.avgRatio * 10,
        challenge: make(
          'reto',
          `aprendizaje:${metric.id}`,
          '📚',
          `Semana de ${lower(stat.label)}`,
          `Suma ${amount(metric, target)} entre los siete días.${
            stat.bestWeekTotal > 0 ? ` Tu mejor semana: ${amount(metric, stat.bestWeekTotal)}.` : ''
          }`,
          'Aprender es acumular: no cuenta el día suelto, cuenta el total que queda al final de la semana.',
          { type: 'metricTotal', metricId: metric.id, target },
        ),
      });
    }

    /* --- BASE · estrenar lo que nunca se ha registrado ------------------- */
    if (stat.samples === 0) {
      // Estrenar una métrica de suelo es llegar a la mitad del objetivo; en una
      // de techo, quedarse por debajo de él: la mitad sería pedir el doble.
      const threshold =
        numeric && !isCeiling(metric)
          ? Math.max(stepOf(metric), toStep(metric.target / 2, stepOf(metric), 'ceil'))
          : successThreshold(metric);

      out.push({
        metricId: metric.id,
        priority: 20,
        challenge: make(
          'base',
          `estreno:${metric.id}`,
          '🌱',
          `Estrena ${lower(stat.label)}`,
          `Regístralo al menos un día: ${thresholdText(metric, threshold)}.`,
          'Nunca lo has anotado. Probar una vez es la única forma de saber si suma o sobra.',
          { type: 'metricDays', metricId: metric.id, threshold, days: 1 },
        ),
      });
    }
  }

  /* --- BASE · una categoría entera, la que está más a mano -------------- */
  const byCategory = new Map<string, MetricStat[]>();
  for (const stat of stats) {
    const list = byCategory.get(stat.category.id) ?? [];
    list.push(stat);
    byCategory.set(stat.category.id, list);
  }

  for (const [categoryId, list] of byCategory) {
    const tracked = list.filter((s) => s.samples > 0);
    const { category } = list[0];

    // El desglose deportivo queda fuera: nadie hace sus cinco actividades el
    // mismo día, así que «la categoría entera» no sería un reto, sería un muro.
    if (tracked.length < 2 || category.layout === 'sports') continue;

    const avg = tracked.reduce((sum, s) => sum + s.avgRatio, 0) / tracked.length;
    // El listón se pone un peldaño por encima de su nivel real, no en un 80 %
    // abstracto: para el nivel «cimiento» tiene que ser alcanzable.
    const threshold = clamp(toStep(avg + 0.05, 0.05, 'ceil'), 0.6, 0.85);

    out.push({
      priority: 25 + avg * 15,
      challenge: make(
        'base',
        `categoria:${categoryId}`,
        category.icon,
        `${category.label} al completo`,
        `Deja la categoría por encima del ${Math.round(threshold * 100)} % en ${days(3)}.`,
        `Ya la llevas al ${pct(avg)}: rematarla cuesta poco y sostiene todo lo demás.`,
        { type: 'categoryDays', categoryId, threshold, days: 3 },
      ),
    });
  }

  /* --- Comodines: siempre hay al menos un reto de cada nivel ------------ */
  const trackedRate = dayStats.total ? dayStats.trackedDays / dayStats.total : 0;
  const registro = clamp(Math.round(trackedRate * 7) + 1, 3, 7);

  out.push({
    priority: 10,
    challenge: make(
      'base',
      'registro',
      '📝',
      group ? `Anotad ${days(registro)}` : `Anota ${days(registro)}`,
      'Basta con dejar constancia del día, aunque haya salido regular.',
      'Lo que no se mide no se mejora: un día flojo registrado enseña más que un día bueno olvidado.',
      { type: 'dayRatioDays', threshold: 0, days: registro },
    ),
  });

  const bar = clamp(toStep(dayStats.avgRatio + 0.1, 0.05, 'ceil'), 0.6, 0.85);

  out.push({
    priority: 12,
    challenge: make(
      'reto',
      'consistencia',
      '📈',
      `${days(4)} por encima del ${Math.round(bar * 100)} %`,
      `Cuatro días de la semana con el cumplimiento diario por encima del ${Math.round(bar * 100)} %.`,
      dayStats.trackedDays > 0
        ? `Tu media reciente es del ${pct(dayStats.avgRatio)}. Subir el suelo vale más que un día heroico.`
        : 'Empezar con un suelo alto cuesta menos que rescatar la semana el domingo.',
      { type: 'dayRatioDays', threshold: bar, days: 4 },
    ),
  });

  out.push({
    priority: 8,
    challenge: make(
      'maximo',
      'racha',
      '⚡',
      `${days(3)} seguidos de sobresaliente`,
      'Tres días consecutivos por encima del 80 % de cumplimiento.',
      'Encadenar es lo difícil: el tercer día seguido es el que convierte un buen día en un hábito.',
      { type: 'dayRatioStreak', threshold: 0.8, days: 3 },
    ),
  });

  /* --- El criterio experto inclina la balanza --------------------------- */
  // Entre dos retos igual de pertinentes, la semana se la lleva el que ataca
  // un hábito clave. No los inventa ni los impone: sólo los pone por delante.
  for (const candidate of out) {
    if (!candidate.metricId) continue;
    const guidance = guidanceFor(profile.id, candidate.metricId);
    if (guidance) candidate.priority *= GUIDANCE_WEIGHT[guidance.priority];
  }

  return out;
}

/* ---------------------------------------------------------------------------
 * Retos fijos: la rutina que no se sortea
 * ------------------------------------------------------------------------- */

/**
 * Hay retos que no tiene sentido deducir del historial, porque están decididos
 * de antemano. Se declaran aquí, fuera del generador, y acompañan cada lunes a
 * los tres que sí salen de los datos.
 *
 * Víctor reparte seis sesiones entre los siete días —pierna, pecho, dorsal,
 * flexiones, series de carrera y core—. Estos retos no piden cifras: se
 * rellenan solos el día que se marca la sesión, y son los que siguen juzgando
 * las semanas anteriores a que el reparto empezara a pedir marca.
 *
 * Leo y Hugo llevan dos escaleras, la del balón y la de gimnasio, que sí piden
 * una marca y suben un peldaño cada vez que se superan.
 */
const VICTOR_SESSIONS: Challenge[] = VICTOR_SPLIT.map(({ id, label, icon, why }) =>
  make(
    'base',
    `rutina:${id}`,
    icon,
    `${label} · una sesión esta semana`,
    'Basta con un día de los siete. Se marca en Movimiento y Fuerza y el reto se rellena solo.',
    why,
    { type: 'metricDays', metricId: `split.${id}`, threshold: 1, days: 1 },
  ),
);

/* ---------------------------------------------------------------------------
 * Marcas: el reparto deja de preguntar «¿la has hecho?» y pregunta «¿cuánto?»
 * ------------------------------------------------------------------------- */

/**
 * Lunes a partir del cual el reparto de Víctor pide marca además de sesión.
 *
 * Las semanas anteriores se siguen evaluando con la regla de entonces —basta
 * con haber entrenado—, porque en aquellos días no había dónde apuntar una
 * cifra: con la regla nueva, el medallero perdería medallas ya ganadas.
 */
const VICTOR_MARKS_SINCE: DateKey = '2026-08-24';

/**
 * Cuántas semanas atrás se busca la marca que hay que superar. Es un tope de
 * coste: cuatro meses sin tocar un ejercicio son de sobra para que el listón
 * de entonces ya no signifique nada.
 */
const MARK_WEEKS = 16;

/**
 * Mejor marca anotada antes de `before`, con el día en que se hizo.
 *
 * «Mejor» depende de la marca: en casi todas es la cifra más alta, pero en las
 * de tiempo —las 500 flexiones— es la más baja. El cero no es una marca floja
 * sino una casilla sin tocar, así que no compite.
 */
function bestMarkBefore(
  profileId: ProfileId,
  metric: Metric,
  before: DateKey,
  entries: Record<string, DayEntry>,
): { value: number; date: DateKey | null } {
  const down = isCeiling(metric);
  let value = 0;
  let date: DateKey | null = null;

  for (let back = MARK_WEEKS * 7; back >= 1; back -= 1) {
    const day = addDays(before, -back);
    const n = numericValue(metric, entries[`${profileId}:${day}`]?.values[metric.id]);
    if (n === null || n <= 0) continue;
    if (value === 0 || (down ? n < value : n > value)) {
      value = n;
      date = day;
    }
  }

  return { value, date };
}

/** «Pecho · peso máximo», o «Pierna» a secas cuando la sesión sólo mide una cosa. */
function markHeading(session: SplitSession, mark: SplitMark): string {
  return mark.short ? `${session.label} · ${mark.short}` : session.label;
}

/**
 * El reto de una marca: superar la anterior, no repetirla. El listón se congela
 * el lunes con lo que hubiera hasta el domingo, así que la semana entera se
 * corre contra la misma cifra aunque se entrene ese grupo dos veces.
 */
function markChallenge(
  profileId: ProfileId,
  session: SplitSession,
  mark: SplitMark,
  metric: Metric,
  start: DateKey,
  entries: Record<string, DayEntry>,
): Challenge {
  const id = mark.key ? `rutina:${session.id}.${mark.key}` : `rutina:${session.id}`;
  const heading = markHeading(session, mark);
  // En las marcas de tiempo mejorar es bajar: el listón, el titular y el verbo
  // se leen al revés, pero el reto es exactamente el mismo.
  const down = isCeiling(metric);
  const previous = bestMarkBefore(profileId, metric, start, entries);

  // La cifra que acompaña a la marca no decide nada, pero sin ella la marca no
  // se puede comparar con la del mes que viene, así que el reto la pide.
  const alongside = mark.companion
    ? ` Apunta al lado ${lower(mark.companion.label)}: sin eso, la cifra de dentro de un mes no se podrá comparar con ésta.`
    : '';

  // Sin nada anterior, el reto es estrenar la marca: cualquier cifra vale y
  // se convierte en el listón de la semana que viene.
  if (previous.value <= 0) {
    return make(
      'base',
      id,
      mark.icon,
      `${heading} · estrena la marca`,
      `${
        down ? 'Hazlo con el cronómetro delante' : 'Haz la sesión'
      } y apunta lo que salga en «${lower(mark.label)}». Esa primera cifra es la que habrá que ${
        down ? 'bajar' : 'superar'
      } a partir de ahora.${alongside}`,
      `${session.why} Aún no hay marca anotada: la de esta semana es la que pone el listón.`,
      // Un día con marca, no una cifra: el marcador dice «0 / 1 día» en vez
      // de un objetivo de una dominada que nadie se ha propuesto. En las
      // marcas de tiempo el umbral se lee al revés —cuenta el día que se queda
      // por debajo—, así que vale el tope del deslizador: cualquier tiempo
      // anotado lo cumple.
      {
        type: 'metricDays',
        metricId: metric.id,
        threshold: down ? mark.max : mark.step,
        days: 1,
      },
    );
  }

  const target = down
    ? Math.max(mark.step, toStep(previous.value - mark.step, mark.step, 'floor'))
    : toStep(previous.value + mark.step, mark.step, 'ceil');

  return make(
    'base',
    id,
    mark.icon,
    `${heading} · ${down ? 'baja de' : 'supera'} ${amount(metric, previous.value)}`,
    `${
      down
        ? `Baja a ${amount(metric, target)} o menos`
        : `Llega a ${amount(metric, target)}`
    } en «${lower(mark.label)}» cualquier día de la semana. Se apunta en Movimiento y Fuerza, al marcar la sesión.${alongside}`,
    `${session.why} Tu mejor marca son ${amount(metric, previous.value)}${
      previous.date ? ` del ${formatShort(previous.date)}` : ''
    }: el listón ${down ? 'baja' : 'sube'} de ${amount(metric, mark.step)} en cada vez que lo pasas, y se queda donde está la semana que no salga.`,
    down
      ? { type: 'metricLow', metricId: metric.id, target }
      : { type: 'metricBest', metricId: metric.id, target },
  );
}

/**
 * El reparto de Víctor, marca a marca: una sesión puede pedir más de una, y
 * cada una lleva su propio reto. Al banca se sube moviendo más peso o
 * aguantando más repeticiones, y con un solo reto la mitad del trabajo de la
 * semana no aparecería en ninguna parte.
 */
function victorRoutine({ profileId, start, entries }: RoutineContext): Challenge[] {
  if (start < VICTOR_MARKS_SINCE) return VICTOR_SESSIONS;

  return VICTOR_SPLIT.flatMap((session) =>
    session.marks.flatMap((mark): Challenge[] => {
      const metric = findMetric(profileId, markMetricId(session.id, mark));
      // La casilla sale de la misma tabla que la marca, así que esto no llega
      // a pasar; si pasara, la sesión se sigue pidiendo con la regla de antes
      // en vez de desaparecer de la semana.
      if (!metric) {
        return mark.key
          ? []
          : [VICTOR_SESSIONS.find((c) => c.id === `base:rutina:${session.id}`)!];
      }
      return [markChallenge(profileId, session, mark, metric, start, entries)];
    }),
  );
}

/**
 * Lo que hay que batir hoy en cada marca, para poder decirlo donde se apunta.
 *
 * A diferencia del reto —que congela el listón el lunes—, esto mira lo mejor
 * de todos los días anteriores a `date`: si el martes se hizo pierna y el
 * viernes vuelve a tocar, el viernes ya hay que pasar de lo del martes. Es lo
 * que convierte el reparto en una escalera de verdad.
 */
export function markHints(
  profileId: ProfileId,
  date: DateKey,
  entries: Record<string, DayEntry>,
): Record<string, MetricHint> {
  const out: Record<string, MetricHint> = {};
  if (profileId !== 'victor') return out;

  for (const session of VICTOR_SPLIT) {
    for (const mark of session.marks) {
      const metric = findMetric(profileId, markMetricId(session.id, mark));
      if (!metric) continue;

      const down = isCeiling(metric);
      const previous = bestMarkBefore(profileId, metric, date, entries);
      const today = numericValue(metric, entries[`${profileId}:${date}`]?.values[metric.id]);

      if (previous.value <= 0) {
        out[metric.id] =
          today && today > 0
            ? {
                text: `Primera marca anotada: ${amount(metric, today)}. Desde aquí, sólo hacia ${
                  down ? 'abajo' : 'arriba'
                }.`,
                record: true,
              }
            : { text: 'Aún no hay marca: la que apuntes hoy será el listón.', record: false };
        continue;
      }

      const better =
        today !== null &&
        today > 0 &&
        (down ? today < previous.value - 1e-9 : today > previous.value + 1e-9);

      if (better) {
        out[metric.id] = {
          text: `¡Récord! ${amount(metric, today!)}, ${amount(
            metric,
            Math.abs(today! - previous.value),
          )} ${down ? 'menos' : 'más'} que el ${formatShort(previous.date!)}.`,
          record: true,
        };
        continue;
      }

      out[metric.id] = {
        text: `Marca a batir: ${amount(metric, previous.value)} del ${formatShort(
          previous.date!,
        )}. Hoy hay que ${down ? 'bajar de ahí' : 'pasar de ahí'}.`,
        record: false,
      };
    }
  }

  return out;
}

/**
 * El historial de una marca: la mejor de todas y las últimas anotadas, para
 * poder ver de un vistazo si la cosa sube o lleva un mes plana. Sin esto, el
 * seguimiento se quedaría en la cifra de esta semana.
 */
export interface MarkTrack {
  id: string;
  /** Cómo se llama la sesión: Pierna, Pecho… */
  label: string;
  icon: string;
  /** Qué se mide exactamente: «Sentadilla · mejor serie». */
  markLabel: string;
  /** Mejor marca de la ventana, ya con unidad. */
  best: string;
  bestOn: DateKey | null;
  /** Las últimas anotadas, de la más reciente a la más antigua. */
  recent: Array<{ date: DateKey; text: string; record: boolean }>;
}

export function markTracks(
  profileId: ProfileId,
  date: DateKey,
  entries: Record<string, DayEntry>,
  count = 5,
): MarkTrack[] {
  if (profileId !== 'victor') return [];

  const tracks: MarkTrack[] = [];

  for (const session of VICTOR_SPLIT) {
    for (const mark of session.marks) {
      const metric = findMetric(profileId, markMetricId(session.id, mark));
      if (!metric) continue;

      const companion = mark.companion
        ? findMetric(profileId, companionMetricId(session.id, mark))
        : undefined;
      const down = isCeiling(metric);

      /** «90 kg × 5 repes»: la marca y, si la tiene, la cifra que la explica. */
      const textOn = (day: DateKey, value: number): string => {
        const beside = companion
          ? numericValue(companion, entries[`${profileId}:${day}`]?.values[companion.id])
          : null;
        return beside !== null && beside > 0
          ? `${amount(metric, value)} × ${amount(companion!, beside)}`
          : amount(metric, value);
      };

      // Se recorre hacia delante para saber cuáles fueron récord el día que se
      // hicieron: hacia atrás no se sabe qué había antes.
      let best = 0;
      let bestOn: DateKey | null = null;
      let bestText = '';
      const log: Array<{ date: DateKey; text: string; record: boolean }> = [];

      for (let back = MARK_WEEKS * 7; back >= 0; back -= 1) {
        const day = addDays(date, -back);
        const value = numericValue(metric, entries[`${profileId}:${day}`]?.values[metric.id]);
        if (value === null || value <= 0) continue;

        const text = textOn(day, value);
        const record = best === 0 || (down ? value < best - 1e-9 : value > best + 1e-9);
        if (record) {
          best = value;
          bestOn = day;
          bestText = text;
        }
        log.push({ date: day, text, record });
      }

      if (log.length === 0) continue;

      tracks.push({
        id: metric.id,
        label: session.label,
        icon: session.icon,
        markLabel: mark.label,
        best: bestText,
        bestOn,
        recent: log.slice(-count).reverse(),
      });
    }
  }

  return tracks;
}

/* ---------------------------------------------------------------------------
 * Escaleras: el reto que sube un peldaño cada vez que se supera
 * ------------------------------------------------------------------------- */

/**
 * Una escalera pide una marca concreta —quince toques, treinta segundos de
 * plancha— y sube sola en cuanto se consigue. Es la otra manera de ser
 * incremental: el récord personal persigue la mejor marca de los últimos 28
 * días y puede dispararse en un día suelto; la escalera va de uno en uno, sin
 * saltarse peldaños y sin bajar nunca, que es como se le pide más esfuerzo a
 * un niño de ocho años sin que se le haga imposible.
 */
interface Ladder {
  /** Sufijo del identificador del reto. */
  id: string;
  /** Casilla donde se apunta la marca del día. */
  metricId: string;
  icon: string;
  tier: ChallengeTier;
  /** Cómo se llama la escalera en la tarjeta. */
  name: string;
  /** Qué hay que hacer, con la cifra del peldaño ya dentro. */
  detail: (target: number) => string;
  /** Primer peldaño. */
  base: number;
  /** Cuánto sube cada vez que se supera. */
  step: number;
}

/**
 * Cuántas semanas atrás se mira para saber por qué peldaño va la escalera. Es
 * un tope de coste, no una amnistía: cuatro meses de historial dan de sobra
 * para llegar a lo más alto que estas escaleras pueden pedir.
 */
const LADDER_WEEKS = 16;

/** Mejor marca de esa semana; 0 si no se apuntó nada. */
function bestInWeek(
  profileId: ProfileId,
  metric: Metric,
  weekStart: DateKey,
  entries: Record<string, DayEntry>,
): number {
  let best = 0;
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    const raw = numericValue(metric, entries[`${profileId}:${date}`]?.values[metric.id]);
    if (raw !== null && raw > best) best = raw;
  }
  return best;
}

/**
 * Peldaño al que se llega el lunes: se sube uno por cada semana anterior en la
 * que se alcanzó el objetivo que tocaba entonces. Las semanas en blanco no
 * cuentan, pero tampoco restan: unas vacaciones no tiran la escalera abajo.
 */
function ladderLevel(
  profileId: ProfileId,
  ladder: Ladder,
  metric: Metric,
  start: DateKey,
  entries: Record<string, DayEntry>,
): number {
  let level = 0;
  for (let back = LADDER_WEEKS; back >= 1; back -= 1) {
    const target = ladder.base + level * ladder.step;
    if (bestInWeek(profileId, metric, addDays(start, -7 * back), entries) + 1e-9 >= target) {
      level += 1;
    }
  }
  return level;
}

function ladderChallenge(
  profileId: ProfileId,
  ladder: Ladder,
  start: DateKey,
  entries: Record<string, DayEntry>,
): Challenge | null {
  const metric = findMetric(profileId, ladder.metricId);
  if (!metric) return null;

  const level = ladderLevel(profileId, ladder, metric, start, entries);
  const target = ladder.base + level * ladder.step;

  return make(
    ladder.tier,
    `escalera:${ladder.id}`,
    ladder.icon,
    `${ladder.name} · peldaño ${level + 1}`,
    ladder.detail(target),
    level === 0
      ? 'Es el primer peldaño. Cada semana que lo superes sube un poco él solo, y las semanas que no salga te espera en el mismo sitio.'
      : `Empezaste en ${amount(metric, ladder.base)} y ya has subido ${level} ${
          level === 1 ? 'peldaño' : 'peldaños'
        }. La escalera sólo sube cuando la superas: nunca te pide de golpe algo que no hayas hecho antes.`,
    { type: 'metricBest', metricId: ladder.metricId, target },
  );
}

/** La del balón: la que no cambia nunca, porque es su deporte. */
const BALON: Ladder = {
  id: 'toques',
  metricId: 'reto.toques',
  icon: '🤹',
  tier: 'maximo',
  name: 'Escalera del balón',
  detail: (n) => `${n} toques seguidos sin que caiga el balón. Vale el mejor intento de cualquier día.`,
  base: 5,
  step: 3,
};

/**
 * La de gimnasio, que rota cada lunes. Rota porque a los ocho años uno se
 * cansa antes de la prueba que del esfuerzo, y porque cada una guarda su
 * propio peldaño: la que no toca esta semana sigue esperando donde se quedó.
 */
const GIMNASIO: Ladder[] = [
  {
    id: 'flexiones',
    metricId: 'reto.flexiones',
    icon: '💪',
    tier: 'reto',
    name: 'Escalera de flexiones',
    detail: (n) => `${n} flexiones seguidas, sin apoyar las rodillas y sin parar a mitad.`,
    base: 5,
    step: 2,
  },
  {
    id: 'plancha',
    metricId: 'reto.plancha',
    icon: '🧘',
    tier: 'reto',
    name: 'Escalera de plancha',
    detail: (n) => `${n} segundos de plancha, con la cadera arriba y la barriga apretada.`,
    base: 20,
    step: 5,
  },
  {
    id: 'comba',
    metricId: 'reto.comba',
    icon: '🨢',
    tier: 'reto',
    name: 'Escalera de comba',
    detail: (n) => `${n} saltos a la comba seguidos, sin engancharse ni pararse.`,
    base: 20,
    step: 5,
  },
];

/** Semanas entre dos lunes, para hacer girar la rotación. */
function weeksBetween(from: DateKey, to: DateKey): number {
  const ms = parseDateKey(to).getTime() - parseDateKey(from).getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000));
}

/** Lunes desde el que se cuentan las semanas de la rotación. */
const ROTATION_EPOCH = '2026-01-05';

function kidLadders({ profileId, start, entries }: RoutineContext): Challenge[] {
  // La prueba de gimnasio gira una por semana, en orden y no por sorteo: con
  // una semilla salían cuatro semanas de flexiones de cada seis y la plancha no
  // aparecía. Los dos hermanos hacen la misma prueba la misma semana —cada uno
  // por su peldaño—, que es media competición gratis.
  const turn = weeksBetween(ROTATION_EPOCH, start);
  const gym = GIMNASIO[((turn % GIMNASIO.length) + GIMNASIO.length) % GIMNASIO.length];

  return [BALON, gym]
    .map((ladder) => ladderChallenge(profileId, ladder, start, entries))
    .filter((challenge): challenge is Challenge => challenge !== null);
}

/* ------------------------------------------------------------------------- */

/** Lo que hace falta para armar los retos fijos de un perfil. */
interface RoutineContext {
  profileId: ProfileId;
  /** Lunes de la semana que se está armando. */
  start: DateKey;
  entries: Record<string, DayEntry>;
}

const ROUTINE: Partial<Record<ProfileId, (ctx: RoutineContext) => Challenge[]>> = {
  victor: victorRoutine,
  leo: kidLadders,
  hugo: kidLadders,
};

function routineChallenges(ctx: RoutineContext): Challenge[] {
  return ROUTINE[ctx.profileId]?.(ctx) ?? [];
}

/* ---------------------------------------------------------------------------
 * Selección y armado de la semana
 * ------------------------------------------------------------------------- */

/**
 * Elige un reto por nivel. Dentro de cada nivel se ordena por pertinencia y
 * se rota entre los mejores candidatos con la semilla de la semana, para que
 * el reto cambie los lunes sin dejar de ser el que toca.
 */
function pickChallenges(candidates: Candidate[], seed: number): Challenge[] {
  const used = new Set<string>();
  const picked: Challenge[] = [];

  // Se resuelve primero el nivel más exigente: manda sobre qué métrica cae.
  for (const tier of ['maximo', 'reto', 'base'] as ChallengeTier[]) {
    const pool = candidates
      .filter((c) => c.challenge.tier === tier && (!c.metricId || !used.has(c.metricId)))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 4);

    if (pool.length === 0) continue;

    const choice = pool[seed % pool.length];
    if (choice.metricId) used.add(choice.metricId);
    picked.push(choice.challenge);
  }

  return picked.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
}

/** Los 28 días anteriores al lunes de la semana indicada. */
function baselineDates(weekStart: DateKey): DateKey[] {
  return Array.from({ length: BASELINE_DAYS }, (_, i) => addDays(weekStart, i - BASELINE_DAYS));
}

/**
 * Retos de la semana a la que pertenece `date`, ya evaluados sobre los
 * registros existentes.
 */
export function buildChallengeWeek(
  profile: Profile,
  date: DateKey,
  entries: Record<string, DayEntry>,
): ChallengeWeek {
  const dates = weekKeys(date);
  const start = dates[0];

  const baseline = baselineDates(start);
  const stats = collectMetricStats(profile.id, baseline, entries);
  const dayStats = collectDayStats(profile.id, baseline, entries);

  const candidates = buildCandidates(profile, stats, dayStats);

  // La rutina fija va primero: es lo que toca sí o sí. Detrás, los tres que se
  // calibran cada lunes sobre el historial.
  const chosen = [
    ...routineChallenges({ profileId: profile.id, start, entries }),
    ...pickChallenges(candidates, hashSeed(`${profile.id}:${start}`)),
  ];

  const challenges: ScoredChallenge[] = chosen.map((challenge) => ({
    ...challenge,
    progress: evaluateRule(profile.id, challenge.rule, dates, entries),
  }));

  return {
    from: start,
    to: dates[dates.length - 1],
    challenges,
    done: challenges.filter((c) => c.progress.done).length,
    xp: challenges.filter((c) => c.progress.done).reduce((sum, c) => sum + c.xp, 0),
    xpMax: challenges.reduce((sum, c) => sum + c.xp, 0),
  };
}

/**
 * Las `count` semanas anteriores a la de `date`, de la más antigua a la más
 * reciente: el medallero con el que se compara la semana en curso.
 */
export function challengeHistory(
  profile: Profile,
  date: DateKey,
  entries: Record<string, DayEntry>,
  count = 4,
): ChallengeWeek[] {
  const start = weekKeys(date)[0];
  return Array.from({ length: count }, (_, i) =>
    buildChallengeWeek(profile, addDays(start, -7 * (count - i)), entries),
  );
}
