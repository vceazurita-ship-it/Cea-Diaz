import { isFuture, todayKey } from '@/lib/dates';
import { guidanceOf } from '@/lib/experts';
import { findMetric } from '@/lib/habits';
import {
  COMPANIONS,
  DAY_NAMES,
  busyMinutes,
  durationLabel,
  minutesOf,
  overlap,
} from '@/lib/planner';
import { formatMetricValue, isCeiling, metricRatio } from '@/lib/scoring';
import { entryKey } from '@/lib/storage';
import type {
  DateKey,
  DayEntry,
  Metric,
  PlanAlert,
  PlanBlock,
  PlanBlockCheck,
  PlanReview,
  PlanStatus,
  Profile,
  WeekPlan,
} from '@/types';

/* =========================================================================
 *  Coherencia entre la agenda y el registro.
 *
 *  Una agenda que nadie contrasta es una lista de buenas intenciones. Aquí
 *  se cruza lo apartado en la semana con lo que de verdad quedó apuntado en
 *  los hábitos, y de ese cruce salen dos cosas:
 *
 *   · el **desenlace de cada rato** —cumplido, flojo, excedido, sin
 *     registrar—, que se pinta en la propia casilla de la semana;
 *   · los **avisos de la semana**: qué falta (carencias), qué sobra
 *     (excesos) y qué conviene mirar.
 *
 *  Dos reglas de fondo, para no mentir ni dar la lata:
 *
 *   1. Un día futuro nunca se juzga. Que el jueves que viene no esté
 *      registrado no es un fallo, es que aún no ha pasado.
 *   2. Un rato sin hábito atado no se juzga tampoco. La merienda no tiene
 *      casilla en el registro y no por eso está mal planificada.
 * ========================================================================= */

/** Por debajo de esto, lo registrado se considera flojo frente a lo previsto. */
export const KEPT_THRESHOLD = 0.6;

/* ---------------------------------------------------------------------------
 * Un rato contra su día
 * ------------------------------------------------------------------------- */

const STATUS_META: Record<PlanStatus, { icon: string; label: string; short: string }> = {
  sinMetrica: { icon: '·', label: 'Sin hábito atado', short: '—' },
  futuro: { icon: '○', label: 'Por venir', short: 'Por venir' },
  sinRegistrar: { icon: '?', label: 'Sin registrar', short: 'Sin apuntar' },
  cumplido: { icon: '✓', label: 'Cumplido', short: 'Cumplido' },
  flojo: { icon: '↓', label: 'Por debajo de lo previsto', short: 'Corto' },
  excedido: { icon: '↑', label: 'Por encima del techo', short: 'Pasado' },
};

export function statusIcon(status: PlanStatus): string {
  return STATUS_META[status].icon;
}

export function statusLabel(status: PlanStatus): string {
  return STATUS_META[status].label;
}

/** Lo mismo en una palabra, para las casillas estrechas de la semana. */
export function statusShort(status: PlanStatus): string {
  return STATUS_META[status].short;
}

/**
 * Qué ha pasado con un rato en un día concreto. Se mira siempre contra la
 * métrica atada, no contra el bloque: el plan dice «media hora de lectura el
 * lunes», pero quien sabe si eso se cumplió es la casilla de lectura.
 */
export function checkBlock(
  profile: Profile,
  block: PlanBlock,
  date: DateKey,
  entry: DayEntry | undefined,
): PlanBlockCheck {
  const metric = block.metricId ? findMetric(profile.id, block.metricId) : undefined;

  if (!metric) {
    return {
      block,
      date,
      status: 'sinMetrica',
      ratio: null,
      reading: '—',
      text: block.metricId
        ? 'El hábito que tenía atado ya no existe en el registro.'
        : 'Sin hábito atado: no se comprueba.',
    };
  }

  const value = entry?.values[metric.id];
  const ratio = metricRatio(metric, value);
  const reading = formatMetricValue(metric, value);

  if (ratio === null) {
    return isFuture(date) || date === todayKey()
      ? {
          block,
          date,
          metric,
          status: 'futuro',
          ratio: null,
          reading,
          text: `Cuando pase, se comprueba con «${metric.label}».`,
        }
      : {
          block,
          date,
          metric,
          status: 'sinRegistrar',
          ratio: null,
          reading,
          text: `Estaba planificado y «${metric.label}» quedó sin registrar.`,
        };
  }

  // Techo: lo que importa no es llegar, es no pasarse. Y el plan lo dice
  // antes —«una hora de pantallas»—, así que se compara con lo apuntado.
  if (isCeiling(metric) && (metric.type === 'counter' || metric.type === 'duration')) {
    const registered = Number(value);
    const over = registered > metric.target;
    return {
      block,
      date,
      metric,
      status: over ? 'excedido' : 'cumplido',
      ratio,
      reading,
      text: over
        ? `${reading} frente al máximo de ${metric.target} ${metric.unit}.`
        : `${reading}, dentro del máximo (${metric.target} ${metric.unit}).`,
    };
  }

  // Suelo: si el rato declaraba cuánto pretendía aportar, se compara con eso;
  // si no, con el objetivo del propio hábito.
  if (
    block.amount !== undefined &&
    (metric.type === 'counter' || metric.type === 'duration')
  ) {
    const goal = Math.min(block.amount, metric.target);
    const registered = Number(value);
    const met = registered >= goal;
    return {
      block,
      date,
      metric,
      status: met ? 'cumplido' : 'flojo',
      ratio,
      reading,
      text: met
        ? `${reading}: cubre lo previsto (${goal} ${metric.unit}).`
        : `${reading} de los ${goal} ${metric.unit} previstos.`,
    };
  }

  const met = ratio >= KEPT_THRESHOLD;
  return {
    block,
    date,
    metric,
    status: met ? 'cumplido' : 'flojo',
    ratio,
    reading,
    text: met ? `${metric.label}: ${reading}.` : `${metric.label} se quedó en ${reading}.`,
  };
}

/* ---------------------------------------------------------------------------
 * La semana entera
 * ------------------------------------------------------------------------- */

/** Suma de lo que el plan aporta a una métrica ese día. */
function plannedAmount(blocks: PlanBlock[], metricId: string): number {
  return blocks
    .filter((block) => block.metricId === metricId)
    .reduce((total, block) => total + (block.amount ?? 0), 0);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Repasa la semana: desenlace de cada rato y avisos de conjunto.
 *
 * `dates` son los siete días de la semana visible, de lunes a domingo, para
 * que el índice del array sea el mismo `day` que llevan los bloques.
 */
export function reviewWeek(
  profile: Profile,
  plan: WeekPlan,
  dates: DateKey[],
  entries: Record<string, DayEntry>,
): PlanReview {
  const checks: PlanBlockCheck[] = [];

  for (const block of plan.blocks) {
    const date = dates[block.day];
    if (!date) continue;
    checks.push(checkBlock(profile, block, date, entries[entryKey(profile.id, date)]));
  }

  const linked = checks.filter((check) => check.status !== 'sinMetrica');
  const kept = linked.filter((check) => check.status === 'cumplido').length;
  const missed = linked.filter(
    (check) => check.status === 'sinRegistrar' || check.status === 'flojo' || check.status === 'excedido',
  ).length;

  return {
    checks,
    alerts: planAlerts(profile, plan, dates, checks),
    blocks: plan.blocks.length,
    linked: linked.length,
    kept,
    missed,
  };
}

/* ---------------------------------------------------------------------------
 * Avisos
 *
 * El orden en que se devuelven es el orden en que se leen: primero lo que se
 * ha pasado de la raya, luego lo que falta, luego lo que conviene mirar. Y si
 * no hay nada de eso, una línea que lo diga, porque una semana bien montada
 * también merece respuesta.
 * ------------------------------------------------------------------------- */

/** Más de esto ocupado en un día y la tarde no cabe. */
const OVERLOAD_MINUTES = 10 * 60;

export function planAlerts(
  profile: Profile,
  plan: WeekPlan,
  dates: DateKey[],
  checks: PlanBlockCheck[],
): PlanAlert[] {
  const excesos: PlanAlert[] = [];
  const carencias: PlanAlert[] = [];
  const avisos: PlanAlert[] = [];

  const byDay = Array.from({ length: 7 }, (_, day) =>
    plan.blocks.filter((block) => block.day === day),
  );

  /* --------------------------------------------------- excesos del plan */

  // Techos superados **sobre el papel**: si el plan ya reserva más pantallas
  // de las que el propio hábito admite, no hace falta esperar al viernes.
  const ceilingSeen = new Set<string>();

  for (let day = 0; day < 7; day += 1) {
    for (const block of byDay[day]) {
      if (!block.metricId || block.amount === undefined) continue;
      const metric = findMetric(profile.id, block.metricId);
      if (!metric || !isCeiling(metric)) continue;
      if (metric.type !== 'counter' && metric.type !== 'duration') continue;

      const planned = plannedAmount(byDay[day], metric.id);
      if (planned <= metric.target) continue;

      const key = `${metric.id}:${day}`;
      if (ceilingSeen.has(key)) continue;
      ceilingSeen.add(key);

      excesos.push({
        id: `exceso-plan-${key}`,
        tone: 'exceso',
        icon: '⛔',
        day,
        title: `${DAY_NAMES[day]}: el plan se pasa del máximo`,
        detail: `Tienes apartados ${planned} ${metric.unit} de «${metric.label}» y el techo son ${metric.target}. Recorta el rato o cámbialo de sitio.`,
      });
    }
  }

  // Y los techos superados **en lo registrado**, que es el aviso que importa.
  const excedidos = checks.filter((check) => check.status === 'excedido');
  if (excedidos.length > 0) {
    const first = excedidos[0];
    excesos.push({
      id: 'exceso-registro',
      tone: 'exceso',
      icon: '📈',
      title: `${excedidos.length} ${plural(excedidos.length, 'rato se pasó', 'ratos se pasaron')} del máximo`,
      detail: `Empezando por «${first.block.title}» del ${DAY_NAMES[first.block.day].toLowerCase()}: ${first.text}`,
    });
  }

  // Sobrecarga: días con más horas ocupadas de las que caben.
  for (let day = 0; day < 7; day += 1) {
    const busy = busyMinutes(byDay[day]);
    if (busy <= OVERLOAD_MINUTES) continue;
    excesos.push({
      id: `exceso-carga-${day}`,
      tone: 'exceso',
      icon: '🥵',
      day,
      title: `${DAY_NAMES[day]} va muy cargado`,
      detail: `${durationLabel(busy)} de actividad entre cole, deporte, estudio y trabajo. Mira si algo puede irse a otro día.`,
    });
  }

  /* -------------------------------------------------------- carencias */

  // Hábitos clave sin un solo rato en toda la semana. Es la carencia de
  // verdad: no que un día flojee, sino que no esté previsto en ningún sitio.
  const planned = new Set(
    plan.blocks.map((block) => block.metricId).filter((id): id is string => Boolean(id)),
  );

  const missingKey = guidanceOf(profile.id)
    .filter((entry) => entry.guidance.priority === 'clave')
    .filter((entry) => (entry.metric.weight ?? 1) > 0)
    // Los techos no se planifican para cumplirlos: no tener apartado un rato
    // de pantallas no es una carencia, es lo deseable.
    .filter((entry) => !isCeiling(entry.metric))
    .filter((entry) => !plannedFor(entry.metric, planned));

  for (const entry of missingKey.slice(0, 3)) {
    carencias.push({
      id: `carencia-${entry.metric.id}`,
      tone: 'carencia',
      icon: '🕳️',
      title: `Sin hueco para «${entry.metric.label}»`,
      detail: `${entry.guidance.claim} No hay ningún ${themeWord(profile)} de la semana atado a este hábito.`,
    });
  }

  // Ratos que se quedan cortos frente al objetivo del propio hábito.
  //
  // Dos matices, los dos por lo mismo —que el aviso se lea en vez de ser
  // ruido—. Sólo se avisa por debajo del 60 %: reservar 45 de los 60 minutos
  // de lectura no es un plan mal montado, y una comida planificada de las tres
  // del día tampoco. Y se agrupa por hábito, porque «el plan se queda corto en
  // lectura» se dice una vez y no cinco, una por día.
  interface Shortfall {
    id: string;
    label: string;
    unit: string;
    target: number;
    days: number[];
    planned: number;
  }

  const shortfalls = new Map<string, Shortfall>();

  for (let day = 0; day < 7; day += 1) {
    const seen = new Set<string>();

    for (const block of byDay[day]) {
      if (!block.metricId || block.amount === undefined) continue;
      if (seen.has(block.metricId)) continue;

      const metric = findMetric(profile.id, block.metricId);
      if (!metric || isCeiling(metric)) continue;
      if (metric.type !== 'counter' && metric.type !== 'duration') continue;

      seen.add(metric.id);

      const total = plannedAmount(byDay[day], metric.id);
      if (total >= metric.target * KEPT_THRESHOLD) continue;

      const entry = shortfalls.get(metric.id) ?? {
        id: metric.id,
        label: metric.label,
        unit: metric.unit,
        target: metric.target,
        days: [],
        planned: total,
      };

      entry.days.push(day);
      entry.planned = Math.min(entry.planned, total);
      shortfalls.set(metric.id, entry);
    }
  }

  const worst = Array.from(shortfalls.values())
    .sort((a, b) => b.days.length - a.days.length)
    .slice(0, 2);

  for (const short of worst) {
    const days =
      short.days.length === 1
        ? DAY_NAMES[short.days[0]]
        : `${short.days.length} días de la semana`;

    carencias.push({
      id: `carencia-corto-${short.id}`,
      tone: 'carencia',
      icon: '📉',
      day: short.days.length === 1 ? short.days[0] : undefined,
      title: `El plan se queda corto en «${short.label}»`,
      detail: `En ${days.toLowerCase()} reservas ${short.planned} ${short.unit} y la meta del día son ${short.target}. Con lo planificado no da.`,
    });
  }

  // Lo previsto que no llegó a registrarse. Es el aviso que ata las dos
  // mitades de la app: si la agenda dice que hubo entreno y la casilla está
  // vacía, o no se fue o no se apuntó, y las dos cosas hay que saberlas.
  const unlogged = checks.filter((check) => check.status === 'sinRegistrar');
  if (unlogged.length > 0) {
    const first = unlogged[0];
    carencias.push({
      id: 'carencia-sin-registrar',
      tone: 'carencia',
      icon: '❔',
      title: `${unlogged.length} ${plural(unlogged.length, 'rato previsto sin registrar', 'ratos previstos sin registrar')}`,
      detail: `«${first.block.title}» del ${DAY_NAMES[first.block.day].toLowerCase()} y ${unlogged.length - 1 > 0 ? `otros ${unlogged.length - 1}` : 'nada más'}. Si pasó, apúntalo; si no pasó, cambia el plan.`,
    });
  }

  const weak = checks.filter((check) => check.status === 'flojo');
  if (weak.length >= 2) {
    carencias.push({
      id: 'carencia-flojos',
      tone: 'carencia',
      icon: '🪫',
      title: `${weak.length} ratos se quedaron por debajo`,
      detail: `El primero, «${weak[0].block.title}» del ${DAY_NAMES[weak[0].block.day].toLowerCase()}: ${weak[0].text}`,
    });
  }

  /* ----------------------------------------------------------- avisos */

  // Solapes: dos cosas a la misma hora es un plan que no se puede cumplir.
  for (let day = 0; day < 7; day += 1) {
    const blocks = [...byDay[day]].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    for (let i = 0; i < blocks.length - 1; i += 1) {
      if (!overlap(blocks[i], blocks[i + 1])) continue;
      avisos.push({
        id: `aviso-solape-${day}-${blocks[i].id}`,
        tone: 'aviso',
        icon: '⏱️',
        day,
        title: `${DAY_NAMES[day]}: dos cosas a la vez`,
        detail: `«${blocks[i].title}» y «${blocks[i + 1].title}» se pisan. Uno de los dos no va a pasar.`,
      });
      break; // uno por día basta para que se mire ese día
    }
  }

  // Los peques: ratos sin decir quién está con ellos. Es la pregunta que de
  // verdad se hace en casa al mirar la semana.
  if (profile.kind === 'kid') {
    const orphan = plan.blocks.filter((block) => !block.companion);
    if (orphan.length > 0) {
      const days = Array.from(new Set(orphan.map((block) => DAY_NAMES[block.day].toLowerCase())));
      carencias.push({
        id: 'carencia-companion',
        tone: 'carencia',
        icon: '🙋',
        title: `${orphan.length} ${plural(orphan.length, 'rato sin decir quién está', 'ratos sin decir quién está')}`,
        detail: `En ${days.slice(0, 3).join(', ')}. Abre la jugada y elige mamá, papá, los abuelos o solos.`,
      });
    }

    const alone = plan.blocks.filter((block) => block.companion === 'solos');
    if (alone.length > 0) {
      const minutes = alone.reduce((total, block) => total + block.duration, 0);
      avisos.push({
        id: 'aviso-solos',
        tone: 'aviso',
        icon: '🧒',
        title: `${durationLabel(minutes)} a la semana solos`,
        detail: `Repartidos en ${alone.length} ${plural(alone.length, 'rato', 'ratos')}. Está bien saberlo de un vistazo.`,
      });
    }
  }

  // Días en blanco. En fin de semana no es noticia; entre semana sí.
  const emptyWeekdays = [0, 1, 2, 3, 4].filter((day) => byDay[day].length === 0);
  if (emptyWeekdays.length > 0 && plan.blocks.length > 0) {
    avisos.push({
      id: 'aviso-dias-vacios',
      tone: 'aviso',
      icon: '📭',
      title: `${emptyWeekdays.length} ${plural(emptyWeekdays.length, 'día entre semana sin nada', 'días entre semana sin nada')}`,
      detail: `${emptyWeekdays.map((day) => DAY_NAMES[day]).join(', ')}. Con el ⧉ de un día que se le parezca lo copias entero encima.`,
    });
  }

  // Ratos sin hábito atado: no es un fallo, pero es lo que hace que la agenda
  // no pueda decir nada de ellos.
  const loose = plan.blocks.filter((block) => !block.metricId);
  if (loose.length >= 5) {
    avisos.push({
      id: 'aviso-sin-atar',
      tone: 'aviso',
      icon: '🔗',
      title: `${loose.length} ratos sin hábito atado`,
      detail:
        'Átalos a una casilla del registro y la semana podrá decirte si se están cumpliendo. ' +
        'Los que se llamen como un rato de siempre se atan solos con «🔗 Atar a los hábitos».',
    });
  }

  const alerts = [...excesos, ...carencias, ...avisos];

  if (alerts.length === 0) {
    const done = checks.filter((check) => check.status === 'cumplido').length;
    alerts.push({
      id: 'bien',
      tone: 'bien',
      icon: '✅',
      title: plan.blocks.length === 0 ? 'La semana está en blanco' : 'La semana cuadra',
      detail:
        plan.blocks.length === 0
          ? 'Añade el primer rato, o empieza con la semana de ejemplo y edítala encima.'
          : done > 0
            ? `${done} ${plural(done, 'rato cumplido', 'ratos cumplidos')} y ni carencias ni excesos a la vista.`
            : 'Nada que corregir de momento: ni solapes, ni techos rebasados, ni huecos.',
    });
  }

  return alerts;
}

/**
 * ¿Está ese hábito previsto en algún rato? Las cinco actividades deportivas
 * comparten criterio, así que un entreno de natación tapa la carencia de
 * «deporte» aunque el identificador no coincida.
 */
function plannedFor(metric: Metric, planned: Set<string>): boolean {
  if (planned.has(metric.id)) return true;
  if (!metric.id.startsWith('sport.')) return false;
  return Array.from(planned).some((id) => id.startsWith('sport.'));
}

/** Cómo llama ese perfil a un rato de su agenda, en singular. */
function themeWord(profile: Profile): string {
  return profile.kind === 'kid' ? 'rato' : 'bloque';
}

/** Con quién están los peques esa semana, en minutos por persona. */
export function companionShare(plan: WeekPlan): Array<{ companion: keyof typeof COMPANIONS; minutes: number }> {
  const totals = new Map<string, number>();

  for (const block of plan.blocks) {
    if (!block.companion) continue;
    totals.set(block.companion, (totals.get(block.companion) ?? 0) + block.duration);
  }

  return Array.from(totals.entries())
    .map(([companion, minutes]) => ({ companion: companion as keyof typeof COMPANIONS, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

