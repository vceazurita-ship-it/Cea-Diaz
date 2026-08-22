import { getCategories } from '@/lib/habits';
import type {
  Achievement,
  CategoryScore,
  DateKey,
  DayEntry,
  DayScore,
  HabitCategory,
  Metric,
  MetricValue,
  PeriodSummary,
  ProfileId,
} from '@/types';

/* ---------------------------------------------------------------------------
 * Cumplimiento por métrica
 * ------------------------------------------------------------------------- */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Convierte el valor bruto de una métrica en cumplimiento 0..1.
 * Devuelve `null` cuando no hay dato registrado, para poder distinguir
 * "no cumplido" de "sin registrar".
 */
export function metricRatio(metric: Metric, value: MetricValue | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;

  switch (metric.type) {
    case 'toggle':
      return value === true ? 1 : 0;

    case 'counter':
    case 'duration': {
      const n = Number(value);
      if (Number.isNaN(n)) return null;
      if (metric.target <= 0) return n > 0 ? 1 : 0;
      return clamp01(n / metric.target);
    }

    case 'scale': {
      const n = Number(value);
      if (Number.isNaN(n)) return null;
      const span = metric.max - metric.min;
      return span <= 0 ? 1 : clamp01((n - metric.min) / span);
    }

    case 'choice': {
      const option = metric.options.find((o) => o.value === value);
      return option ? clamp01(option.score) : null;
    }

    default:
      return null;
  }
}

/** Peso de la métrica; `weight: 0` la excluye del cálculo (p. ej. interruptores de contexto). */
function weightOf(metric: Metric): number {
  return metric.weight ?? 1;
}

/** Texto legible del valor registrado, para resúmenes y tooltips. */
export function formatMetricValue(metric: Metric, value: MetricValue | undefined): string {
  if (value === undefined || value === null || value === '') return '—';

  switch (metric.type) {
    case 'toggle':
      return value === true ? 'Sí' : 'No';
    case 'counter':
    case 'duration':
      return `${value} ${metric.unit}`;
    case 'scale': {
      const idx = Number(value) - metric.min;
      return metric.levels[idx] ?? String(value);
    }
    case 'choice':
      return metric.options.find((o) => o.value === value)?.label ?? String(value);
    default:
      return String(value);
  }
}

/* ---------------------------------------------------------------------------
 * Cumplimiento por categoría y por día
 * ------------------------------------------------------------------------- */

export function computeCategoryScore(
  category: HabitCategory,
  values: Record<string, MetricValue> = {},
): CategoryScore {
  let weighted = 0;
  let totalWeight = 0;
  let filled = 0;
  let scorable = 0;

  for (const metric of category.metrics) {
    const weight = weightOf(metric);
    if (weight <= 0) continue;
    scorable += 1;
    totalWeight += weight;

    const ratio = metricRatio(metric, values[metric.id]);
    if (ratio !== null) {
      filled += 1;
      weighted += ratio * weight;
    }
  }

  return {
    categoryId: category.id,
    label: category.label,
    icon: category.icon,
    ratio: totalWeight > 0 ? weighted / totalWeight : 0,
    filled,
    total: scorable,
  };
}

export function starsFor(ratio: number): number {
  if (ratio >= 0.95) return 5;
  if (ratio >= 0.8) return 4;
  if (ratio >= 0.6) return 3;
  if (ratio >= 0.4) return 2;
  if (ratio > 0) return 1;
  return 0;
}

export function computeDayScore(
  profileId: ProfileId,
  date: DateKey,
  entry: DayEntry | undefined,
): DayScore {
  const categories = getCategories(profileId).map((category) =>
    computeCategoryScore(category, entry?.values ?? {}),
  );

  const filled = categories.reduce((sum, c) => sum + c.filled, 0);
  const total = categories.reduce((sum, c) => sum + c.total, 0);
  const ratio = total > 0 ? categories.reduce((sum, c) => sum + c.ratio * c.total, 0) / total : 0;

  return {
    date,
    ratio,
    stars: starsFor(ratio),
    empty: filled === 0,
    categories,
  };
}

/* ---------------------------------------------------------------------------
 * Resúmenes de periodo
 * ------------------------------------------------------------------------- */

/** Un día cuenta para la racha cuando alcanza el 60 % de cumplimiento. */
export const STREAK_THRESHOLD = 0.6;

export function summarizePeriod(
  profileId: ProfileId,
  dates: DateKey[],
  entries: Record<string, DayEntry>,
): PeriodSummary {
  const days = dates.map((date) =>
    computeDayScore(profileId, date, entries[`${profileId}:${date}`]),
  );

  const tracked = days.filter((d) => !d.empty);
  const average = tracked.length
    ? tracked.reduce((sum, d) => sum + d.ratio, 0) / tracked.length
    : 0;

  // Rachas: se recorren los días en orden cronológico.
  let bestStreak = 0;
  let running = 0;
  for (const day of days) {
    if (!day.empty && day.ratio >= STREAK_THRESHOLD) {
      running += 1;
      bestStreak = Math.max(bestStreak, running);
    } else {
      running = 0;
    }
  }

  // Racha actual: se cuenta hacia atrás desde el último día no futuro con datos.
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i];
    if (day.empty && streak === 0) continue; // aún no se ha registrado hoy
    if (!day.empty && day.ratio >= STREAK_THRESHOLD) streak += 1;
    else break;
  }

  // Agregado por categoría sobre los días con registro.
  const categoryIds = getCategories(profileId);
  const perCategory: CategoryScore[] = categoryIds.map((category) => {
    const scores = tracked
      .map((d) => d.categories.find((c) => c.categoryId === category.id))
      .filter((c): c is CategoryScore => Boolean(c));

    const ratio = scores.length ? scores.reduce((s, c) => s + c.ratio, 0) / scores.length : 0;
    return {
      categoryId: category.id,
      label: category.label,
      icon: category.icon,
      ratio,
      filled: scores.reduce((s, c) => s + c.filled, 0),
      total: scores.reduce((s, c) => s + c.total, 0),
    };
  });

  return {
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    days,
    average,
    trackedDays: tracked.length,
    totalStars: days.reduce((sum, d) => sum + d.stars, 0),
    streak,
    bestStreak,
    perCategory,
  };
}

/* ---------------------------------------------------------------------------
 * Logros
 * ------------------------------------------------------------------------- */

export function computeAchievements(summary: PeriodSummary): Achievement[] {
  const perfectDays = summary.days.filter((d) => d.stars === 5).length;

  const defs: Array<Omit<Achievement, 'unlocked' | 'progress'> & {
    value: number;
    goal: number;
  }> = [
    {
      id: 'streak3',
      label: 'Racha de 3',
      description: '3 días seguidos cumpliendo',
      icon: '🔥',
      value: summary.bestStreak,
      goal: 3,
    },
    {
      id: 'streak7',
      label: 'Semana perfecta',
      description: '7 días seguidos cumpliendo',
      icon: '🏆',
      value: summary.bestStreak,
      goal: 7,
    },
    {
      id: 'stars20',
      label: 'Cazaestrellas',
      description: '20 estrellas acumuladas',
      icon: '⭐',
      value: summary.totalStars,
      goal: 20,
    },
    {
      id: 'perfect3',
      label: 'Triplete brillante',
      description: '3 días de 5 estrellas',
      icon: '💎',
      value: perfectDays,
      goal: 3,
    },
    {
      id: 'consistency',
      label: 'Constancia',
      description: '10 días registrados',
      icon: '📆',
      value: summary.trackedDays,
      goal: 10,
    },
  ];

  return defs.map(({ value, goal, ...rest }) => ({
    ...rest,
    unlocked: value >= goal,
    progress: clamp01(value / goal),
  }));
}

export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}
