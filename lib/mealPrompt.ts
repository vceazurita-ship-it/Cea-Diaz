import { getCategories } from '@/lib/habits';
import { getProfile } from '@/lib/profiles';
import { formatMetricValue } from '@/lib/scoring';
import type { MealMoment, MetricValue, Profile, ProfileId } from '@/types';

/* =========================================================================
 *  Contexto del análisis de una foto de comida.
 *
 *  El plato no se juzga en abstracto: se juzga contra el objetivo de quien
 *  come. Un plato de pasta es otra cosa para Leo, que entrena cinco días por
 *  semana, que para un adulto sedentario. Aquí se arma ese contexto a partir
 *  del catálogo de hábitos, para no repetir los objetivos en dos sitios.
 * ========================================================================= */

/**
 * De dónde salen los objetivos de alimentación. En los peques la categoría
 * entera va de comer; en los adultos, «Salud y Bienestar» mezcla sueño y
 * deporte, así que de ahí sólo se toman las métricas de comida y bebida.
 */
const FOOD_CATEGORIES = ['nutricion'];
const FOOD_METRICS = ['agua', 'comidas', 'fruta_verdura'];

function isFoodMetric(categoryId: string, metricId: string): boolean {
  return FOOD_CATEGORIES.includes(categoryId) || FOOD_METRICS.includes(metricId);
}

/** ¿Tiene este perfil objetivos de comida que juzgar? Los módulos de grupo, no. */
export function hasFoodGoals(profileId: ProfileId): boolean {
  return getCategories(profileId).some((category) =>
    category.metrics.some((metric) => isFoodMetric(category.id, metric.id)),
  );
}

export const MEAL_MOMENTS: MealMoment[] = ['desayuno', 'comida', 'merienda', 'cena'];

export function isMealMoment(value: unknown): value is MealMoment {
  return typeof value === 'string' && MEAL_MOMENTS.includes(value as MealMoment);
}

/** Retrato en una línea de la persona que come. */
function whoIs(profile: Profile): string {
  const age = profile.age ? `${profile.age} años` : 'grupo familiar';
  return `${profile.name} — ${age}, ${profile.role}. ${profile.tagline}.`;
}

/**
 * Objetivos diarios declarados en el catálogo de hábitos: raciones de fruta,
 * vasos de agua, comidas equilibradas… Es lo que convierte «un plato sano»
 * en «un plato sano *para esta persona*».
 */
function dailyTargets(profileId: ProfileId): string[] {
  const targets: string[] = [];

  for (const category of getCategories(profileId)) {
    for (const metric of category.metrics) {
      if (!isFoodMetric(category.id, metric.id)) continue;

      if (metric.type === 'counter' || metric.type === 'duration') {
        targets.push(`${metric.label}: objetivo ${metric.target} ${metric.unit} al día`);
      } else if (metric.type === 'toggle') {
        targets.push(`${metric.label}: sí / no`);
      }
    }
  }

  return targets;
}

/** Lo ya registrado hoy, para no recomendar algo que ya está hecho. */
function todaySoFar(profileId: ProfileId, values: Record<string, MetricValue>): string[] {
  const done: string[] = [];

  for (const category of getCategories(profileId)) {
    for (const metric of category.metrics) {
      if (!isFoodMetric(category.id, metric.id)) continue;

      const value = values[metric.id];
      if (value === undefined || value === null || value === '') continue;
      done.push(`${metric.label}: ${formatMetricValue(metric, value)}`);
    }
  }

  return done;
}

/**
 * Instrucciones del sistema. Dos reglas mandan sobre todo lo demás:
 * con niños no se habla nunca de peso, calorías ni dietas, y el consejo
 * siempre es concreto y en positivo. Esto es una ayuda doméstica para comer
 * mejor, no una consulta médica.
 */
export function mealSystemPrompt(profile: Profile): string {
  const kid = profile.kind === 'kid';

  return [
    'Eres un nutricionista familiar español, prudente y práctico, que ayuda a una familia',
    'a comer mejor mirando fotos de sus platos. Respondes siempre en español de España.',
    '',
    'CÓMO PUNTÚAS (nota de 0 a 10, con un decimal):',
    '- Juzgas el plato de la foto contra el objetivo diario de esa persona concreta.',
    '- Miras: verdura y fruta, proteína, hidrato (mejor integral), grasa de calidad,',
    '  presencia de fritos, ultraprocesados o azúcar añadido, y si la ración encaja',
    '  con su edad y su gasto físico.',
    '- 10 es un plato redondo para esa persona en ese momento del día; 5 es mejorable;',
    '  por debajo de 4, hay algo importante que corregir.',
    '- Si dudas de lo que hay en la foto, dilo en el resumen y sé prudente con la nota.',
    '',
    'CÓMO ACONSEJAS:',
    '- Entre uno y tres ajustes, concretos y accionables: qué reducir, qué aumentar,',
    '  qué cambiar por otra cosa o qué añadir. Nada de consejos genéricos.',
    '- Di siempre al menos un acierto: se corrige mejor desde lo que ya se hace bien.',
    '- Habla de cantidades a ojo («medio plato», «un puñado»), nunca en gramos ni calorías.',
    '',
    kid
      ? [
          'ESTA PERSONA ES UN NIÑO. Reglas innegociables:',
          '- No menciones nunca peso, calorías, dietas, «engordar», «adelgazar» ni culpa.',
          '- Ningún alimento es «malo» ni está «prohibido»: hay platos que suman más y otros menos.',
          '- Tono cercano y animoso, como un entrenador que quiere que crezca y rinda.',
          '- Prioriza añadir y cambiar antes que quitar; hablar de reducir sólo si es evidente.',
        ].join('\n')
      : [
          'ESTA PERSONA ES ADULTA: puedes ser directo y técnico, sin dramatizar.',
          '- Sigue sin hablar de calorías ni de peso: el objetivo es la calidad del plato.',
        ].join('\n'),
    '',
    'LÍMITES:',
    '- No diagnosticas, no tratas patologías y no propones dietas de pérdida de peso.',
    '- Si la foto no es comida, devuelve esComida = false y explica en el resumen qué ves.',
  ].join('\n');
}

/**
 * Mensaje con el plato y todo lo que hace falta para juzgarlo.
 *
 * @param context lo que se ha contado del plato al fotografiarlo, dictado o
 *                escrito. Es lo que la foto no puede enseñar: si va con
 *                aceite, si se lo terminó, qué bebió con ello.
 */
export function mealUserPrompt(
  profileId: ProfileId,
  moment: MealMoment,
  values: Record<string, MetricValue>,
  context = '',
): string {
  const profile = getProfile(profileId);
  const targets = dailyTargets(profileId);
  const done = todaySoFar(profileId, values);

  const said = context.trim();

  return [
    `QUIÉN COME: ${whoIs(profile)}`,
    `MOMENTO DEL DÍA: ${moment}.`,
    '',
    said
      ? [
          'LO QUE CUENTAN DEL PLATO (dictado en voz alta, puede traer erratas):',
          said,
          'Dalo por bueno: describe lo que la foto no puede enseñar. Si contradice',
          'a la foto, dilo en el resumen en vez de elegir en silencio.',
        ].join('\n')
      : '',
    '',
    targets.length ? `SUS OBJETIVOS DIARIOS:\n- ${targets.join('\n- ')}` : '',
    '',
    done.length
      ? `YA REGISTRADO HOY (tenlo en cuenta para no repetir consejo):\n- ${done.join('\n- ')}`
      : 'HOY NO HAY NADA REGISTRADO TODAVÍA.',
    '',
    'Analiza la foto del plato y responde con el esquema pedido.',
  ]
    .filter(Boolean)
    .join('\n');
}
