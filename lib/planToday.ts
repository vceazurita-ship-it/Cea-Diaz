import { isFuture, todayKey, weekdayIndex } from '@/lib/dates';
import { findMetric } from '@/lib/habits';
import { isCeiling } from '@/lib/scoring';
import {
  amountFor,
  blockMetricIds,
  blocksOfDay,
  endOf,
  minutesOf,
  rangeOf,
} from '@/lib/planner';
import type { DateKey, Metric, MetricValue, PlanBlock, ProfileId, WeekPlan } from '@/types';

/* =========================================================================
 *  Lo que la semana había apartado para hoy, casilla por casilla.
 *
 *  El registro y la agenda llevaban vidas separadas. Arriba, una tarjeta
 *  decía «hoy a las nueve, lectura»; treinta centímetros más abajo, la
 *  casilla de lectura estaba vacía y no sabía nada de aquello: había que
 *  acordarse del número, buscarlo y teclearlo. Rellenar el día era copiar a
 *  mano lo que la app ya sabía.
 *
 *  Esto es el puente. Para un día concreto dice, por hábito, qué ratos lo
 *  alimentan, cuánto pretendían aportarle y a qué hora tocaba. Con eso, cada
 *  casilla puede enseñar lo previsto a su lado y rellenarse de un toque, y el
 *  panel entero puede ofrecer «pon lo que decía la semana» para lo que
 *  todavía está en blanco.
 *
 *  Dos reglas para no mentir:
 *
 *   1. Sólo se **propone**. Nada se registra solo: un plan no es un hecho, y
 *      dar por bebidos seis vasos porque estaban previstos sería falsear el
 *      historial con el que luego se decide.
 *   2. Lo que no ha pasado todavía se dice, pero se dice en gris: a las ocho
 *      de la mañana la cena está prevista, no incumplida.
 * ========================================================================= */

/** Lo que la semana aparta hoy para un hábito. */
export interface PlannedMetric {
  metricId: string;
  /** Los ratos de hoy que lo alimentan, en orden. */
  blocks: PlanBlock[];
  /** Lo que declaran aportarle entre todos, si lo declaran. */
  amount?: number;
  /** Cómo se dice la hora: «21:00 – 21:20», o «3 ratos» si son varios. */
  when: string;
  /** `true` cuando la hora del último ya ha pasado. */
  past: boolean;
}

/**
 * El plan de hoy visto desde las casillas del registro.
 *
 * La clave es el identificador del hábito, que es justo por donde pregunta
 * quien pinta una casilla. Un rato con tres hábitos aparece en las tres.
 */
export function plannedToday(
  plan: WeekPlan,
  date: DateKey,
  now: number | null = null,
): Record<string, PlannedMetric> {
  const day = weekdayIndex(date);
  const blocks = blocksOfDay(plan, day).filter((block) => !block.mirror);
  const out: Record<string, PlannedMetric> = {};

  for (const block of blocks) {
    for (const metricId of blockMetricIds(block)) {
      const entry = out[metricId] ?? {
        metricId,
        blocks: [],
        amount: undefined,
        when: '',
        past: false,
      };

      entry.blocks.push(block);

      const share = amountFor(block, metricId);
      if (share !== undefined) entry.amount = (entry.amount ?? 0) + share;

      out[metricId] = entry;
    }
  }

  const today = date === todayKey();

  for (const entry of Object.values(out)) {
    entry.when =
      entry.blocks.length === 1
        ? rangeOf(entry.blocks[0])
        : `${entry.blocks.length} ratos, desde las ${entry.blocks[0].start}`;

    // Un día pasado está entero detrás; uno futuro, entero delante. Sólo hoy
    // hay que mirar el reloj, y sólo si nos lo han dado.
    const last = Math.max(...entry.blocks.map(endOf));
    entry.past = today ? now !== null && last <= now : !isFuture(date);
  }

  return out;
}

/**
 * Lo que pondría en la casilla ese plan, o `undefined` si no hay forma de
 * saberlo.
 *
 * Un interruptor se marca. Una cantidad se pone **sólo si el rato declaraba
 * cuánto aportaba**: la merienda de veinte minutos tiene apartada su ración
 * de fruta, no las cinco del día, y rellenar con el objetivo entero por no
 * tener el dato es exactamente la clase de cifra inventada que después se
 * lee como si fuera verdad.
 *
 * Una escala o una elección tampoco se adivinan: cómo te sentiste en el
 * entreno no lo sabe la agenda.
 */
export function plannedValue(metric: Metric, planned: PlannedMetric): MetricValue | undefined {
  switch (metric.type) {
    case 'toggle':
      return true;
    case 'counter':
    case 'duration': {
      const wanted = planned.amount;
      if (wanted === undefined || !Number.isFinite(wanted) || wanted <= 0) return undefined;
      const floor = metric.type === 'duration' ? metric.min : 0;
      return Math.max(floor, Math.min(metric.max, wanted));
    }
    default:
      return undefined;
  }
}

/** Una casilla que la semana apartaba y que sigue en blanco. */
export interface PlanFill {
  metricId: string;
  label: string;
  icon: string;
  value: MetricValue;
}

/**
 * Todo lo que la semana apartaba hoy y nadie ha registrado todavía, listo
 * para ponerlo de una vez.
 *
 * Se deja fuera lo que ya tiene valor —aunque sea un cero escrito a
 * propósito— y los techos: tener previstas dos horas de pantallas no es
 * motivo para apuntar que se han visto. El máximo se cumple no llegando.
 */
export function planFills(
  profileId: ProfileId,
  planned: Record<string, PlannedMetric>,
  values: Record<string, MetricValue>,
): PlanFill[] {
  const out: PlanFill[] = [];

  for (const entry of Object.values(planned)) {
    if (values[entry.metricId] !== undefined) continue;

    const metric = findMetric(profileId, entry.metricId);
    if (!metric) continue;
    if (isCeiling(metric)) continue;

    const value = plannedValue(metric, entry);
    if (value === undefined) continue;

    out.push({ metricId: metric.id, label: metric.label, icon: metric.icon, value });
  }

  return out;
}

/** Cuántos de los hábitos previstos para hoy están ya registrados. */
export function planProgress(
  planned: Record<string, PlannedMetric>,
  values: Record<string, MetricValue>,
): { done: number; total: number } {
  const ids = Object.keys(planned);
  return {
    done: ids.filter((id) => values[id] !== undefined).length,
    total: ids.length,
  };
}

/** Minutos desde medianoche, o `null` fuera del navegador. */
export function clockNow(): number | null {
  if (typeof window === 'undefined') return null;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** Auxiliar de lectura: la hora de un rato en minutos. */
export function startOf(block: PlanBlock): number {
  return minutesOf(block.start);
}
