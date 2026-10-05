import { getMetrics } from '@/lib/habits';
import { addDays } from '@/lib/dates';
import { formatMetricValue } from '@/lib/scoring';
import type { DateKey, DayEntry, Metric, MetricValue, ProfileId } from '@/types';

/* =========================================================================
 *  Lo de siempre: lo que el historial ya sabe de cada pregunta del día.
 *
 *  Al mirar lo rellenado salían dos cosas muy claras. Una, que media lista se
 *  contesta igual casi todos los días —el desayuno, la proteína, la reunión
 *  con el cuerpo técnico, diez vasos de agua, nueve horas y media de sueño—,
 *  y aun así había que ir casilla por casilla a decir lo mismo que ayer. Y
 *  dos, que otra parte de la lista casi nunca se contesta, y estaba ahí cada
 *  día empujando hacia abajo lo que sí importa.
 *
 *  Aquí se aprende eso, perfil a perfil, de las últimas semanas registradas:
 *  cuánto se contesta cada pregunta y qué se contesta. Con ello el registro
 *  ofrece «lo de siempre» de un toque, rellena de una vez lo que nunca cambia
 *  y pliega lo que casi nunca se usa.
 *
 *  Nada se apunta solo. Igual que con la semana: lo habitual no es un hecho,
 *  y dar por bebidos diez vasos porque suelen serlo ensuciaría el historial
 *  del que sale todo lo demás. Quita el trabajo de repetir, no el de decidir.
 * ========================================================================= */

/** Cuántos días hacia atrás se miran: lo bastante para ver la costumbre y no
 *  tanto como para arrastrar la de hace un trimestre. */
const WINDOW_DAYS = 42;
/** Con menos días registrados que éstos no hay costumbre que aprender. */
const MIN_DAYS = 5;
/** Lo que tiene que repetirse una respuesta para llamarla «la de siempre». */
const USUAL_SHARE = 0.5;
const USUAL_MIN = 3;
/** Y para rellenarla de golpe, sin mirar casilla por casilla. */
const SURE_SHARE = 0.8;
/** ...y la pregunta tiene que contestarse la mayoría de los días, no sólo
 *  cuando toca (un repaso de examen se contesta cuando hay examen). */
const SURE_ANSWERED = 0.6;
/** Por debajo de esto, la pregunta se contesta tan poco que se pliega. */
const RARE_SHARE = 0.25;

export interface HabitStat {
  /** Días en que se contestó. */
  answered: number;
  /** Qué parte de los días registrados se contestó (0..1). */
  share: number;
  /** La respuesta habitual, si la hay. */
  usual?: MetricValue;
  /** Si es la mediana de cifras que varían, y no una respuesta repetida. */
  median: boolean;
  /** Qué parte de las respuestas fue la más repetida (0..1). */
  usualShare: number;
  /** Tan repetida y tan contestada que se puede poner de golpe. */
  sure: boolean;
  /** Casi nunca se contesta: va plegada. */
  rare: boolean;
}

export interface Habitual {
  /** Días con algo registrado dentro de la ventana. */
  days: number;
  /** Si hay historial suficiente para fiarse de lo aprendido. */
  learned: boolean;
  stats: Record<string, HabitStat>;
}

const EMPTY: Habitual = { days: 0, learned: false, stats: {} };

/** Lo que se aprende de las semanas anteriores a `date` (el propio día no cuenta). */
export function learnHabits(
  profileId: ProfileId,
  date: DateKey,
  entries: Record<string, DayEntry>,
): Habitual {
  const days: Array<Record<string, MetricValue>> = [];
  for (let back = 1; back <= WINDOW_DAYS; back += 1) {
    const entry = entries[`${profileId}:${addDays(date, -back)}`];
    if (entry && Object.keys(entry.values).length > 0) days.push(entry.values);
  }
  if (days.length < MIN_DAYS) return { ...EMPTY, days: days.length };

  const stats: Record<string, HabitStat> = {};
  for (const metric of getMetrics(profileId)) {
    const counts = new Map<string, { value: MetricValue; n: number }>();
    let answered = 0;

    for (const values of days) {
      const value = values[metric.id];
      if (value === undefined || value === null || value === '') continue;
      answered += 1;
      const key = `${typeof value}:${String(value)}`;
      const slot = counts.get(key);
      if (slot) slot.n += 1;
      else counts.set(key, { value, n: 1 });
    }

    let top: { value: MetricValue; n: number } | undefined;
    for (const slot of counts.values()) if (!top || slot.n > top.n) top = slot;

    const share = answered / days.length;
    const usualShare = top && answered > 0 ? top.n / answered : 0;
    let usual =
      top && top.n >= USUAL_MIN && usualShare >= USUAL_SHARE && suggestable(metric)
        ? top.value
        : undefined;

    // Las cifras que bailan un poco —7 h, 7¼, 7½— no tienen una respuesta que
    // se repita, pero sí una normal: la mediana, ajustada al paso del control.
    if (
      usual === undefined &&
      answered >= USUAL_MIN * 2 &&
      (metric.type === 'counter' || metric.type === 'duration') &&
      suggestable(metric)
    ) {
      const numbers = days
        .map((values) => values[metric.id])
        .filter((value): value is number => typeof value === 'number')
        .sort((a, b) => a - b);
      if (numbers.length >= USUAL_MIN * 2) {
        const median = numbers[Math.floor(numbers.length / 2)];
        usual = Number((Math.round(median / metric.step) * metric.step).toFixed(2));
      }
    }

    stats[metric.id] = {
      answered,
      share,
      usual,
      usualShare,
      median: usual !== undefined && usual !== top?.value,
      // Un «no» habitual se ofrece, pero no se pone de golpe: apuntar fallos
      // sin mirarlos es justo lo que no tiene que hacer un atajo.
      sure:
        usual !== undefined &&
        usual !== false &&
        usual === top?.value &&
        usualShare >= SURE_SHARE &&
        share >= SURE_ANSWERED &&
        // Lo que va por actividades —ir a natación, la sesión de pierna— depende
        // del horario de ese día, no de la costumbre: eso no se pone de golpe.
        metric.group === undefined,
      rare: share < RARE_SHARE,
    };
  }

  return { days: days.length, learned: true, stats };
}

/**
 * Lo que no se ofrece como «lo de siempre»: las marcas (peso cero), que son
 * un récord del día y no una costumbre, y los techos, que son lo que se
 * vigila —las pantallas de ayer no dicen nada de las de hoy—.
 */
function suggestable(metric: Metric): boolean {
  if ((metric.weight ?? 1) <= 0) return false;
  if ((metric.type === 'counter' || metric.type === 'duration') && metric.direction === 'atMost') {
    return false;
  }
  return true;
}

/** La respuesta de siempre dicha como se diría: «Sí», «10 vasos», «🙂 Alto». */
export function usualLabel(metric: Metric, value: MetricValue): string {
  if (metric.type === 'scale') {
    const emoji = metric.emojis?.[Number(value) - metric.min];
    return `${emoji ? `${emoji} ` : ''}${formatMetricValue(metric, value)}`;
  }
  if (metric.type === 'choice') {
    const option = metric.options.find((o) => o.value === value);
    return option ? `${option.icon} ${option.label}` : String(value);
  }
  if (typeof value === 'number') {
    return formatMetricValue(metric, value).replace(/(\d)\.(\d)/, '$1,$2');
  }
  return formatMetricValue(metric, value);
}

export interface UsualFill {
  metricId: string;
  value: MetricValue;
  label: string;
  icon: string;
}

/** Lo que se puede poner de golpe en las casillas aún vacías de estas métricas. */
export function usualFills(
  metrics: Metric[],
  habitual: Habitual,
  values: Record<string, MetricValue>,
): UsualFill[] {
  if (!habitual.learned) return [];
  const out: UsualFill[] = [];
  for (const metric of metrics) {
    if (values[metric.id] !== undefined) continue;
    const stat = habitual.stats[metric.id];
    if (!stat?.sure || stat.usual === undefined) continue;
    out.push({ metricId: metric.id, value: stat.usual, label: metric.label, icon: metric.icon });
  }
  return out;
}

/** Si la pregunta va plegada hoy: se usa poco y sigue en blanco. */
export function isFolded(
  metric: Metric,
  habitual: Habitual,
  values: Record<string, MetricValue>,
): boolean {
  if (!habitual.learned || values[metric.id] !== undefined) return false;
  return habitual.stats[metric.id]?.rare ?? false;
}
