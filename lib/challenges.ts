import { addDays, weekKeys } from '@/lib/dates';
import { findMetric, getCategories } from '@/lib/habits';
import { computeCategoryScore, computeDayScore, metricRatio } from '@/lib/scoring';
import type {
  Challenge,
  ChallengeProgress,
  ChallengeRule,
  ChallengeTier,
  ChallengeWeek,
  DateKey,
  DayEntry,
  HabitCategory,
  Metric,
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
function toStep(value: number, step: number, mode: 'round' | 'ceil' = 'round'): number {
  const fn = mode === 'ceil' ? Math.ceil : Math.round;
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

    case 'metricDays': {
      const metric = findMetric(profileId, rule.metricId);
      let current = 0;
      if (metric) {
        for (const date of dates) {
          const n = valueOn(date, metric);
          if (n !== null && n + 1e-9 >= rule.threshold) current += 1;
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
      return `llegar a ${amount(metric, threshold)}`;
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
    if (numeric && stat.samples >= 3 && stat.best > 0) {
      // Sólo tiene sentido batir la marca donde más es mejor. En lo demás
      // (dormir, hidratarse, comer) el objetivo es el objetivo: pasarse no
      // es mejorar, así que el récord se detiene ahí.
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
      const threshold = numeric
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

  return out;
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
  const chosen = pickChallenges(candidates, hashSeed(`${profile.id}:${start}`));

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
