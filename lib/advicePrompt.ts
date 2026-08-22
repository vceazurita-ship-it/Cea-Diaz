import { getCategories } from '@/lib/habits';
import { formatMetricValue } from '@/lib/scoring';
import type { DateKey, Metric, MetricValue, NextChallenge, Profile, ProfileId } from '@/types';

/* =========================================================================
 *  Contexto del consejo del día.
 *
 *  Se cuenta en voz alta cómo ha ido la jornada y de ahí sale un consejo
 *  para mañana. Para que el consejo no sea un horóscopo, el análisis recibe
 *  tres cosas: lo que se ha contado, lo que se ha registrado y —cuando toca
 *  gimnasio o entrenamiento— cómo han ido las últimas sesiones, que es lo
 *  que permite subir el listón un punto y no dos.
 * ========================================================================= */

/** Día suelto del historial que manda el navegador. */
export interface HistoryDay {
  date: DateKey;
  values: Record<string, MetricValue>;
}

/** Métricas de sala y entrenamiento propio, las que admiten progresión. */
const GYM_GROUPS = ['gimnasio'];
const GYM_METRICS = ['entreno_propio', 'movilidad', 'movimiento'];

function isGymMetric(metric: Metric): boolean {
  return (
    (metric.group !== undefined && GYM_GROUPS.includes(metric.group)) ||
    GYM_METRICS.includes(metric.id)
  );
}

/** Cualquier entrenamiento: sirve para saber si hoy ha habido sesión. */
function isTrainingMetric(metric: Metric): boolean {
  return isGymMetric(metric) || metric.id.startsWith('sport.');
}

function hasValue(value: MetricValue | undefined): boolean {
  return value !== undefined && value !== null && value !== '' && value !== false;
}

/**
 * Etiqueta legible de cada métrica. En el desglose deportivo incluye la
 * actividad: «Esfuerzo» a secas no dice de qué sesión se está hablando.
 */
function labels(profileId: ProfileId): Map<string, string> {
  const map = new Map<string, string>();

  for (const category of getCategories(profileId)) {
    for (const metric of category.metrics) {
      const group = metric.group
        ? category.groups?.find((g) => g.id === metric.group)?.label
        : undefined;
      map.set(metric.id, group ? `${group} · ${metric.label}` : metric.label);
    }
  }

  return map;
}

/** Todo lo registrado hoy, categoría por categoría. */
function daySummary(profileId: ProfileId, values: Record<string, MetricValue>): string[] {
  const label = labels(profileId);
  const lines: string[] = [];

  for (const category of getCategories(profileId)) {
    const done = category.metrics
      .filter((metric) => hasValue(values[metric.id]))
      .map(
        (metric) =>
          `${label.get(metric.id)}: ${formatMetricValue(metric, values[metric.id])}`,
      );

    if (done.length) lines.push(`${category.label} → ${done.join('; ')}`);
  }

  return lines;
}

/** ¿Ha habido sala o entrenamiento propio hoy? De eso depende que haya reto. */
export function trainedToday(profileId: ProfileId, values: Record<string, MetricValue>): boolean {
  return getCategories(profileId)
    .flatMap((category) => category.metrics)
    .some((metric) => isGymMetric(metric) && hasValue(values[metric.id]));
}

/** Las últimas sesiones de sala, para poder progresar sobre lo real. */
function gymHistory(profileId: ProfileId, history: HistoryDay[]): string[] {
  const label = labels(profileId);
  const metrics = getCategories(profileId)
    .flatMap((category) => category.metrics)
    .filter(isTrainingMetric);

  const lines: string[] = [];

  for (const day of history) {
    const done = metrics
      .filter((metric) => hasValue(day.values[metric.id]))
      .map(
        (metric) =>
          `${label.get(metric.id)}: ${formatMetricValue(metric, day.values[metric.id])}`,
      );

    if (done.length) lines.push(`${day.date} → ${done.join('; ')}`);
  }

  return lines;
}

export function adviceSystemPrompt(profile: Profile): string {
  const kid = profile.kind === 'kid';

  return [
    'Eres el entrenador personal y consejero de hábitos de una familia española.',
    'Alguien te cuenta en voz alta cómo le ha ido el día y tú devuelves un consejo',
    'para mañana. Respondes siempre en español de España.',
    '',
    'CÓMO ACONSEJAS:',
    '- Entre uno y tres consejos, y sólo los que se deducen de lo contado y de lo',
    '  registrado hoy. Si algo no se ha mencionado, no te lo inventes.',
    '- Cada consejo es una acción concreta para mañana o para los próximos días:',
    '  qué hacer, cuánto y cuándo. Nada de «descansa mejor» ni «esfuérzate más».',
    '- Empieza por lo que más margen tiene, no por lo más fácil de decir.',
    '- Si el día ha ido bien, dilo y propón el siguiente escalón; no busques un fallo',
    '  donde no lo hay.',
    '',
    'RETO DE LA PRÓXIMA SESIÓN:',
    '- Si el día incluye gimnasio o entrenamiento propio, propón un reto para la',
    '  siguiente vez **un punto por encima de lo hecho hoy**: una serie más, dos',
    '  minutos más, algo de técnica, un descanso más corto. Concreto y medible.',
    '- Mira las sesiones anteriores para no repetir el listón ni pegar un salto',
    '  imposible. Di en «partiendoDe» sobre qué marca lo has construido.',
    '- Si no ha habido ni gimnasio ni entrenamiento, no propongas ningún reto.',
    '',
    kid
      ? [
          'ESTA PERSONA ES UN NIÑO. Reglas innegociables:',
          '- Nunca hables de peso, calorías, dietas ni culpa.',
          '- Tono de entrenador que anima: cercano, corto y en positivo.',
          '- Nada de cargas, pesos ni intensidades de adulto: técnica, juego,',
          '  repeticiones con su propio cuerpo y constancia.',
          '- Si cuenta que le ha dolido algo o que está cansado, el consejo es parar',
          '  y avisar en casa, no apretar.',
        ].join('\n')
      : [
          'ESTA PERSONA ES ADULTA: puedes ser directo y técnico.',
          '- Si cuenta molestias o dolor, prioriza recuperar y consultar antes que progresar.',
        ].join('\n'),
    '',
    'LÍMITES: no diagnosticas ni tratas lesiones, y no propones dietas.',
  ].join('\n');
}

export function adviceUserPrompt(
  profile: Profile,
  date: DateKey,
  observations: string,
  values: Record<string, MetricValue>,
  history: HistoryDay[],
  previous?: NextChallenge,
): string {
  const summary = daySummary(profile.id, values);
  const sessions = gymHistory(profile.id, history);

  return [
    `QUIÉN: ${profile.name}${profile.age ? `, ${profile.age} años` : ''} — ${profile.role}.`,
    `DÍA: ${date}.`,
    '',
    'LO QUE CUENTA DE SU DÍA (dictado en voz alta, puede traer erratas):',
    observations.trim() || '(no ha contado nada; usa sólo lo registrado)',
    '',
    summary.length ? `LO REGISTRADO HOY:\n- ${summary.join('\n- ')}` : 'HOY NO HAY NADA REGISTRADO.',
    '',
    sessions.length
      ? `SESIONES ANTERIORES (para calibrar la progresión):\n- ${sessions.join('\n- ')}`
      : '',
    previous
      ? [
          `RETO QUE YA TENÍA PENDIENTE: ${previous.titulo} — ${previous.detalle}`,
          'Si lo ha cumplido, sube desde ahí; si no, replantéalo en vez de repetirlo igual.',
        ].join('\n')
      : '',
    '',
    'Devuelve el consejo con el esquema pedido.',
  ]
    .filter(Boolean)
    .join('\n');
}
