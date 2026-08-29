import { isFuture, todayKey, weekdayIndex } from '@/lib/dates';
import { findMetric, getCategories } from '@/lib/habits';
import { checkBlock } from '@/lib/planCheck';
import {
  DAY_NAMES,
  blocksOfDay,
  durationLabel,
  kindShare,
  plannedForMetric,
  plannedMinutes,
} from '@/lib/planner';
import type { KindShare } from '@/lib/planner';
import { entryKey } from '@/lib/storage';
import type {
  Challenge,
  ChallengeRule,
  DateKey,
  DayEntry,
  Metric,
  PlanBlock,
  Profile,
  ProfileId,
  WeekPlan,
} from '@/types';

/* =========================================================================
 *  Lo que une la agenda con las otras dos mitades de la app.
 *
 *  La semana tipo ya se contrastaba con el registro —eso es `planCheck`—,
 *  pero se quedaba encerrada en su pestaña. Y las dos preguntas que de
 *  verdad se hacen delante de ella se hacen desde fuera:
 *
 *   · desde los **retos**: «esto que me piden esta semana, ¿lo tengo
 *     apartado en algún sitio o lo estoy dejando a la fuerza de voluntad?».
 *     Un reto sin hueco en la agenda es una intención; uno con tres ratos
 *     reservados el martes, el jueves y el sábado es un plan.
 *   · desde el **análisis**: «lo que planifiqué, ¿pasó?». La media de
 *     cumplimiento dice cuánto se registró; esto dice cuánto de lo que
 *     estaba previsto llegó a ocurrir, que no es lo mismo y a veces es lo
 *     contrario.
 *
 *  Las dos salen del mismo sitio para que las dos cuenten lo mismo, y viven
 *  aquí y no en cada pantalla para que nadie las recalcule a su manera.
 * ========================================================================= */

/* ---------------------------------------------------------------------------
 * Retos ↔ agenda
 * ------------------------------------------------------------------------- */

/** Qué hábitos toca un reto. Los de día entero no tocan ninguno en concreto. */
export function metricsOfRule(profileId: ProfileId, rule: ChallengeRule): string[] {
  switch (rule.type) {
    case 'metricBest':
    case 'metricLow':
    case 'metricTotal':
    case 'metricDays':
      return [rule.metricId];
    case 'categoryDays': {
      const category = getCategories(profileId).find((item) => item.id === rule.categoryId);
      return category ? category.metrics.map((metric) => metric.id) : [];
    }
    default:
      return [];
  }
}

/**
 * Cómo de respaldado está un reto por la semana tipo.
 *
 *  · `reservado` — hay ratos apartados para eso.
 *  · `sinHueco`  — el reto pide algo que la agenda no aparta en ningún sitio.
 *  · `dia`       — se juega el día entero (registrar, media diaria), así que
 *                  no hay un rato concreto que lo cubra y no se le reprocha.
 */
export type PlanCover = 'reservado' | 'sinHueco' | 'dia';

export interface ChallengeLink {
  challengeId: string;
  cover: PlanCover;
  /** Los ratos de la semana tipo que trabajan para este reto. */
  blocks: PlanBlock[];
  minutes: number;
  /** Días distintos en los que caen. */
  days: number[];
  /** Lo que esos ratos declaran aportar, si lo declaran. */
  amount: number;
  /** El hábito principal del reto, para poder apartarle un rato de un toque. */
  metric?: Metric;
  /** Una línea que lo cuenta en la tarjeta del reto. */
  text: string;
}

/** El puente de un reto con la agenda de quien lo tiene. */
export function challengeLink(
  profileId: ProfileId,
  plan: WeekPlan,
  challenge: Challenge,
): ChallengeLink {
  const ids = metricsOfRule(profileId, challenge.rule);

  if (ids.length === 0) {
    return {
      challengeId: challenge.id,
      cover: 'dia',
      blocks: [],
      minutes: 0,
      days: [],
      amount: 0,
      text: 'Se juega en el día entero, no en un rato suelto: no necesita hueco propio.',
    };
  }

  // Se suman todos los hábitos que toca el reto, sin repetir ratos: una
  // categoría entera puede traer el mismo bloque por dos caminos.
  const seen = new Set<string>();
  const blocks: PlanBlock[] = [];
  let amount = 0;

  for (const id of ids) {
    for (const block of plannedForMetric(plan, id).blocks) {
      if (seen.has(block.id)) continue;
      seen.add(block.id);
      blocks.push(block);
      amount += block.amount ?? 0;
    }
  }

  const metric = findMetric(profileId, ids[0]);

  if (blocks.length === 0) {
    return {
      challengeId: challenge.id,
      cover: 'sinHueco',
      blocks: [],
      minutes: 0,
      days: [],
      amount: 0,
      metric,
      text: metric
        ? `La semana no aparta ningún rato para «${metric.label}».`
        : 'La semana no aparta ningún rato para esto.',
    };
  }

  const days = Array.from(new Set(blocks.map((block) => block.day))).sort((a, b) => a - b);
  const minutes = plannedMinutes(blocks);

  return {
    challengeId: challenge.id,
    cover: 'reservado',
    blocks,
    minutes,
    days,
    amount,
    metric,
    text: `${blocks.length} ${blocks.length === 1 ? 'rato apartado' : 'ratos apartados'} · ${durationLabel(
      minutes,
    )} · ${listDays(days)}.`,
  };
}

/** «martes», «martes y jueves», «lunes, miércoles y 2 días más». */
function listDays(days: number[]): string {
  const names = days.map((day) => DAY_NAMES[day].toLowerCase());
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  if (names.length <= 4) return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} y ${names.length - 2} días más`;
}

/* ---------------------------------------------------------------------------
 * Análisis ↔ agenda
 *
 * La misma cuenta que hace la pestaña de la semana, pero abierta a cualquier
 * periodo: la semana que se está mirando en los resúmenes, o el mes entero,
 * que es donde se ve si la agenda aguanta o si sólo aguantó siete días.
 * ------------------------------------------------------------------------- */

export interface AdherenceDay {
  date: DateKey;
  day: number;
  /** Ratos apartados ese día de la semana. */
  planned: number;
  /** De ellos, los que ya se pueden juzgar. */
  judged: number;
  kept: number;
  /** Aún no ha pasado: no se le reprocha nada. */
  future: boolean;
}

export interface Adherence {
  /** Ratos de la semana tipo. Cero significa agenda sin estrenar. */
  blocks: number;
  /** Ratos atados a un hábito: los únicos que se pueden comprobar. */
  linked: number;
  /** Comprobaciones hechas en el periodo (un rato por día que ha pasado). */
  judged: number;
  kept: number;
  weak: number;
  over: number;
  missing: number;
  /** `kept / judged`, o cero si no hay nada que juzgar. */
  ratio: number;
  days: AdherenceDay[];
  /** Los ratos que más se caen, agrupados por nombre. */
  weakest: Array<{ title: string; icon: string; missed: number; judged: number }>;
  /** Reparto de la semana tipo por tipo de rato. */
  kinds: KindShare[];
  /** Minutos apartados en la semana tipo. */
  minutes: number;
}

const EMPTY: Adherence = {
  blocks: 0,
  linked: 0,
  judged: 0,
  kept: 0,
  weak: 0,
  over: 0,
  missing: 0,
  ratio: 0,
  days: [],
  weakest: [],
  kinds: [],
  minutes: 0,
};

/**
 * Cuánto de lo planificado ocurrió, sobre los días que se le pasen.
 *
 * Vale igual para una semana que para un mes: la agenda no tiene fechas, así
 * que cada día del periodo se contrasta contra los ratos de **su** día de la
 * semana. Un lunes de mes se compara con el lunes tipo, y así cuatro veces.
 *
 * Lo que no ha pasado no se juzga —ni el futuro ni el día de hoy a medias—,
 * y lo que no está atado a un hábito tampoco: la merienda no tiene casilla y
 * no por eso está incumplida.
 */
export function adherence(
  profile: Profile,
  plan: WeekPlan,
  dates: DateKey[],
  entries: Record<string, DayEntry>,
): Adherence {
  if (plan.blocks.length === 0) return EMPTY;

  const today = todayKey();
  const days: AdherenceDay[] = [];
  const failures = new Map<string, { title: string; icon: string; missed: number; judged: number }>();

  let judged = 0;
  let kept = 0;
  let weak = 0;
  let over = 0;
  let missing = 0;

  for (const date of dates) {
    const day = weekdayIndex(date);
    const blocks = blocksOfDay(plan, day);
    const entry = entries[entryKey(profile.id, date)];
    const future = isFuture(date) || date === today;

    let dayJudged = 0;
    let dayKept = 0;

    for (const block of blocks) {
      const check = checkBlock(profile, block, date, entry);
      if (check.status === 'sinMetrica' || check.status === 'futuro') continue;

      dayJudged += 1;
      judged += 1;

      const key = `${block.icon}·${block.title}`;
      const entryFail = failures.get(key) ?? {
        title: block.title || 'Sin nombre',
        icon: block.icon,
        missed: 0,
        judged: 0,
      };
      entryFail.judged += 1;

      if (check.status === 'cumplido') {
        dayKept += 1;
        kept += 1;
      } else {
        entryFail.missed += 1;
        if (check.status === 'flojo') weak += 1;
        else if (check.status === 'excedido') over += 1;
        else missing += 1;
      }

      failures.set(key, entryFail);
    }

    days.push({ date, day, planned: blocks.length, judged: dayJudged, kept: dayKept, future });
  }

  const weakest = Array.from(failures.values())
    .filter((item) => item.missed > 0)
    .sort((a, b) => b.missed - a.missed || b.judged - a.judged)
    .slice(0, 4);

  return {
    blocks: plan.blocks.length,
    linked: plan.blocks.filter((block) => block.metricId).length,
    judged,
    kept,
    weak,
    over,
    missing,
    ratio: judged > 0 ? kept / judged : 0,
    days,
    weakest,
    kinds: kindShare(plan.blocks),
    minutes: plannedMinutes(plan.blocks),
  };
}
