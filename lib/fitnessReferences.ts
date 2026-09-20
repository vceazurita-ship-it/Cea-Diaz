import { derive, type FitnessTest } from '@/lib/fitness';
import { normalCdf } from '@/lib/gpsReferences';

/* =========================================================================
 *  Con qué se comparan las pruebas físicas.
 *
 *  Aquí sólo hay **cifras publicadas**, con su cita: las tablas de
 *  crecimiento de la OMS, percentiles de esprint de estudios con decenas de
 *  miles de niños y las pocas referencias que existen de salto vertical a
 *  estas edades. Las cifras de Leo y de Hugo no están en el código —el
 *  repositorio es público—: el informe las calcula en el aparato.
 *
 *  Cuatro cautelas que el informe repite donde toca:
 *
 *   · **Una medición no es una tendencia.** Cualquier prueba tiene su error:
 *     repetir el mismo esprint el mismo día ya da un 1–2 % de diferencia, y
 *     un salto, un 4–6 %. Por debajo de eso no ha pasado nada.
 *   · **Los aparatos no son intercambiables.** El 1080 Sprint no mide como
 *     unas fotocélulas ni como el rastreador de la pierna; una plataforma de
 *     fuerza no mide como una alfombra de contactos. Se compara con quien
 *     midió parecido, y se dice cuándo no.
 *   · **A estas edades se mide para cuidar y enseñar, no para seleccionar.**
 *     Es literalmente el consenso del COI, y va en la cabecera del informe.
 *   · **La maduración lo tuerce todo.** Dos niños de la misma edad pueden
 *     llevarse dos años de desarrollo. Antes de comparar a un niño con una
 *     tabla hay que mirar por dónde va su propio reloj.
 * ========================================================================= */

/* ---------------------------------------------------------------------------
 * Las fuentes
 * ------------------------------------------------------------------------- */

export interface FitSource {
  id: string;
  cite: string;
  url?: string;
}

export const FIT_SOURCES: FitSource[] = [
  {
    id: 'oms',
    cite:
      'de Onis M, et al. Development of a WHO growth reference for school-aged children and adolescents. Bull World Health Organ 2007;85:660–7. Tablas LMS de talla-para-la-edad e IMC-para-la-edad, niños de 5 a 19 años.',
    url: 'https://www.who.int/tools/growth-reference-data-for-5to19-years',
  },
  {
    id: 'catley',
    cite:
      'Catley MJ, Tomkinson GR. Normative health-related fitness values for children: analysis of 85.347 test results on 9–17-year-old Australians. Br J Sports Med 2013;47:98–108. Percentiles de 50 m lisos a partir de 101.045 marcas.',
    url: 'https://doi.org/10.1136/bjsports-2011-090218',
  },
  {
    id: 'idefics',
    cite:
      'De Miguel-Etayo P, et al. Physical fitness reference standards in European children: the IDEFICS study. Int J Obes 2014;38:S57–66. 10.302 niños de 6–10 años de ocho países, España incluida.',
    url: 'https://doi.org/10.1038/ijo.2014.136',
  },
  {
    id: 'frontiers',
    cite:
      'Meyers RW, et al. The kinematic and kinetic development of sprinting and countermovement jump performance in boys. Front Bioeng Biotechnol 2020;8:547075. Sólo 18 niños (sub-9 y sub-12), plataformas de fuerza a 1.000 Hz.',
    url: 'https://doi.org/10.3389/fbioe.2020.547075',
  },
  {
    id: 'mirwald',
    cite:
      'Mirwald RL, et al. An assessment of maturity from anthropometric measurements. Med Sci Sports Exerc 2002;34:689–94. Es la fórmula que usa el informe de RX2.',
    url: 'https://doi.org/10.1249/00005768-200204000-00020',
  },
  {
    id: 'moore',
    cite:
      'Moore SA, et al. Enhancing a somatic maturity prediction model. Med Sci Sports Exerc 2015;47:1755–64. Ecuaciones más simples y con menos sesgo que las de 2002.',
    url: 'https://doi.org/10.1249/MSS.0000000000000588',
  },
  {
    id: 'khamis',
    cite:
      'Khamis HJ, Roche AF. Predicting adult stature without using skeletal age: the Khamis-Roche method. Pediatrics 1994;94:504–7. Necesita la talla de los dos padres.',
  },
  {
    id: 'banding',
    cite:
      'Cumming SP, et al. Bio-banding in sport: applications to competition, talent identification and strength and conditioning of youth athletes. Strength Cond J 2017;39(2):34–47 · Malina RM, et al. Br J Sports Med 2015;49:852–9.',
  },
  {
    id: 'ioc',
    cite: 'Bergeron MF, et al. International Olympic Committee consensus statement on youth athletic development. Br J Sports Med 2015;49:843–51.',
    url: 'https://doi.org/10.1136/bjsports-2015-094962',
  },
  {
    id: 'ypd',
    cite: 'Lloyd RS, Oliver JL. The Youth Physical Development Model: a new approach to long-term athletic development. Strength Cond J 2012;34(3):61–72.',
  },
  {
    id: 'ltad',
    cite:
      'Lloyd RS, et al. National Strength and Conditioning Association position statement on long-term athletic development. J Strength Cond Res 2016;30(6):1491–509.',
    url: 'https://doi.org/10.1519/JSC.0000000000001387',
  },
  {
    id: 'artero',
    cite:
      'Artero EG, et al. Reliability of field-based fitness tests in youth. Int J Sports Med 2011;32:159–69. De aquí sale el margen por debajo del cual un cambio no significa nada.',
    url: 'https://doi.org/10.1055/s-0030-1268488',
  },
  {
    id: 'especializacion',
    cite: 'Jayanthi N, et al. Sports specialization in young athletes: evidence-based recommendations. Sports Health 2013;5:251–7.',
  },
  {
    id: 'malina',
    cite: 'Malina RM, Bouchard C, Bar-Or O. Growth, Maturation, and Physical Activity. 2.ª ed. Champaign: Human Kinetics, 2004.',
  },
  {
    id: 'genes',
    cite:
      'Webborn N, Williams A, McNamee M, et al. Direct-to-consumer genetic testing for predicting sports performance and talent identification: consensus statement. Br J Sports Med 2015;49:1486–91. Firmado por veintidós investigadores del área.',
    url: 'https://doi.org/10.1136/bjsports-2015-095343',
  },
  {
    id: 'suplementos',
    cite:
      'American Academy of Pediatrics, Council on Sports Medicine and Fitness. Use of performance-enhancing substances. Pediatrics 2016;138(1):e20161300 · Bergeron MF, et al. Br J Sports Med 2015;49:843–51.',
    url: 'https://doi.org/10.1542/peds.2016-1300',
  },
];

export const FIT_SOURCE_BY_ID = new Map(FIT_SOURCES.map((source) => [source.id, source]));

/** Lo que dicen los expertos sobre lo que se está midiendo aquí. */
export const FIT_EXPERTS: { who: string; text: string; source: string }[] = [
  {
    who: 'Consenso del COI (Bergeron et al., 2015)',
    text: 'Medir a un niño sirve para cuidarle y para enseñarle, no para decidir si vale. A estas edades ninguna prueba predice en qué acabará: predice cómo está hoy.',
    source: 'ioc',
  },
  {
    who: 'Desarrollo físico juvenil (Lloyd y Oliver, 2012)',
    text: '«Casi todos, si no todos, los componentes de la condición física se pueden entrenar durante toda la infancia». Antes de la pubertad se gana sobre todo por coordinación y técnica, no por músculo.',
    source: 'ypd',
  },
  {
    who: 'Posición de la NSCA (Lloyd et al., 2016)',
    text: 'El desarrollo a largo plazo se construye con variedad de estímulos y calidad de movimiento. La fuerza bien enseñada es segura desde la infancia y es lo que protege de lesiones más adelante.',
    source: 'ltad',
  },
  {
    who: 'Maduración (Cumming, 2017; Malina, 2015)',
    text: 'Niños de la misma edad pueden llevarse dos años de desarrollo. Una ventaja de hoy puede igualarse con el estirón, y una desventaja de hoy puede desaparecer sola.',
    source: 'banding',
  },
  {
    who: 'Fiabilidad de las pruebas (Artero et al., 2011)',
    text: 'Repetir la misma prueba el mismo día ya da diferencias. Hasta que un cambio no supera ese margen, no es una mejora ni un bajón: es ruido.',
    source: 'artero',
  },
  {
    who: 'Especialización temprana (Jayanthi et al., 2013)',
    text: 'No hay pruebas de que especializarse antes de la pubertad haga falta, y sí de más lesiones y más abandono. Varios deportes suman.',
    source: 'especializacion',
  },
  {
    who: 'Consenso sobre tests genéticos (Webborn et al., 2015)',
    text: 'Veintidós investigadores del área lo dejaron por escrito: los tests genéticos que se venden al público «no tienen ningún papel» ni en detectar talento ni en diseñar el entrenamiento de nadie, y en niños desaconsejan usarlos.',
    source: 'genes',
  },
];

/**
 * Lo que hay que saber si en casa hay un informe genético deportivo.
 *
 * No es una opinión de esta aplicación: es el consenso publicado. Se enseña
 * porque los informes que venden esos estudios vienen con pautas de
 * entrenamiento y de suplementación calcadas de las de un adulto —cargas por
 * encima del 85 % de una repetición máxima, protocolos de carga de creatina
 * de veinte o treinta gramos al día, aminoácidos ramificados— y a un niño de
 * ocho o nueve años eso no se le aplica.
 */
export const GENETICA = {
  title: 'Si tenéis el informe genético en casa',
  text:
    'El consenso del British Journal of Sports Medicine, firmado por veintidós investigadores del campo, dice que los tests genéticos deportivos que se venden al público **no sirven** para detectar talento ni para individualizar el entrenamiento, y que en menores desaconsejan su uso. Ninguna de sus barras predice lo que un niño va a poder hacer: lo que sí lo predice, y sólo un poco, es lo que hace cada semana.',
  warn:
    'Y un aviso concreto: esos informes traen pautas pensadas para adultos —cargas por encima del 85 % de una repetición máxima, cargas de creatina de veinte o treinta gramos al día, aminoácidos ramificados, cafeína—. La Academia Americana de Pediatría y el consenso del COI coinciden en que los suplementos de rendimiento no se recomiendan en niños. Antes de darle nada a un crío de ocho años, el pediatra.',
  sources: ['genes', 'suplementos'],
};

/* ---------------------------------------------------------------------------
 * Estadística
 * ------------------------------------------------------------------------- */

const clampPct = (p: number) => Math.max(1, Math.min(99, Math.round(p)));

/** De puntuación z a percentil. */
export function pctFromZ(z: number): number {
  return clampPct(normalCdf(z) * 100);
}

/* ---------------------------------------------------------------------------
 * Crecimiento: las tablas de la OMS
 *
 * El método LMS de Cole: cada mes tiene su asimetría (L), su mediana (M) y
 * su coeficiente de variación (S), y con eso una medida se convierte en una
 * puntuación z exacta. Las tablas van del mes 72 al 143 —de los 6 a los 11
 * años— que es de sobra para lo que hace falta aquí.
 * ------------------------------------------------------------------------- */

/** Primer mes de las tablas. */
const LMS_FROM = 72;

/** Talla para la edad, niños. La L de la talla es 1 en todo el tramo. */
const HEIGHT_LMS: [number, number][] = [
  [115.9509, 0.04249], [116.4432, 0.04257], [116.9325, 0.04264], [117.4196, 0.04272], [117.9046, 0.04280], [118.3880, 0.04287],
  [118.8700, 0.04295], [119.3508, 0.04303], [119.8303, 0.04311], [120.3085, 0.04318], [120.7853, 0.04326], [121.2604, 0.04334],
  [121.7338, 0.04342], [122.2053, 0.04350], [122.6750, 0.04358], [123.1429, 0.04366], [123.6092, 0.04374], [124.0736, 0.04382],
  [124.5361, 0.04390], [124.9964, 0.04398], [125.4545, 0.04406], [125.9104, 0.04414], [126.3640, 0.04422], [126.8156, 0.04430],
  [127.2651, 0.04438], [127.7129, 0.04446], [128.1590, 0.04454], [128.6034, 0.04462], [129.0466, 0.04470], [129.4887, 0.04478],
  [129.9300, 0.04487], [130.3705, 0.04495], [130.8103, 0.04503], [131.2495, 0.04511], [131.6884, 0.04519], [132.1269, 0.04527],
  [132.5652, 0.04535], [133.0031, 0.04543], [133.4404, 0.04551], [133.8770, 0.04559], [134.3130, 0.04566], [134.7483, 0.04574],
  [135.1829, 0.04582], [135.6168, 0.04589], [136.0501, 0.04597], [136.4829, 0.04604], [136.9153, 0.04612], [137.3474, 0.04619],
  [137.7795, 0.04626], [138.2119, 0.04633], [138.6452, 0.04640], [139.0797, 0.04647], [139.5158, 0.04654], [139.9540, 0.04661],
  [140.3948, 0.04667], [140.8387, 0.04674], [141.2859, 0.04680], [141.7368, 0.04686], [142.1916, 0.04692], [142.6501, 0.04698],
  [143.1126, 0.04703], [143.5795, 0.04709], [144.0511, 0.04714], [144.5276, 0.04719], [145.0093, 0.04723], [145.4964, 0.04728],
  [145.9891, 0.04732], [146.4878, 0.04736], [146.9927, 0.04740], [147.5041, 0.04744], [148.0224, 0.04747], [148.5478, 0.04750],
];

/** Índice de masa corporal para la edad, niños: L, M y S. */
const BMI_LMS: [number, number, number][] = [
  [-0.9921, 15.3062, 0.08682], [-1.0144, 15.3169, 0.08711], [-1.0365, 15.3285, 0.08741], [-1.0584, 15.3408, 0.08771],
  [-1.0801, 15.3540, 0.08802], [-1.1017, 15.3679, 0.08833], [-1.1230, 15.3825, 0.08865], [-1.1441, 15.3978, 0.08898],
  [-1.1649, 15.4137, 0.08931], [-1.1856, 15.4302, 0.08964], [-1.2060, 15.4473, 0.08998], [-1.2261, 15.4650, 0.09033],
  [-1.2460, 15.4832, 0.09068], [-1.2656, 15.5019, 0.09103], [-1.2849, 15.5210, 0.09139], [-1.3040, 15.5407, 0.09176],
  [-1.3228, 15.5608, 0.09213], [-1.3414, 15.5814, 0.09251], [-1.3596, 15.6023, 0.09289], [-1.3776, 15.6237, 0.09327],
  [-1.3953, 15.6455, 0.09366], [-1.4126, 15.6677, 0.09406], [-1.4297, 15.6903, 0.09445], [-1.4464, 15.7133, 0.09486],
  [-1.4629, 15.7368, 0.09526], [-1.4790, 15.7606, 0.09567], [-1.4947, 15.7848, 0.09609], [-1.5101, 15.8094, 0.09651],
  [-1.5252, 15.8344, 0.09693], [-1.5399, 15.8597, 0.09735], [-1.5542, 15.8855, 0.09778], [-1.5681, 15.9116, 0.09821],
  [-1.5817, 15.9381, 0.09864], [-1.5948, 15.9651, 0.09907], [-1.6076, 15.9925, 0.09951], [-1.6199, 16.0205, 0.09994],
  [-1.6318, 16.0490, 0.10038], [-1.6433, 16.0781, 0.10082], [-1.6544, 16.1078, 0.10126], [-1.6651, 16.1381, 0.10170],
  [-1.6753, 16.1692, 0.10214], [-1.6851, 16.2009, 0.10259], [-1.6944, 16.2333, 0.10303], [-1.7032, 16.2665, 0.10347],
  [-1.7116, 16.3004, 0.10391], [-1.7196, 16.3351, 0.10435], [-1.7271, 16.3704, 0.10478], [-1.7341, 16.4065, 0.10522],
  [-1.7407, 16.4433, 0.10566], [-1.7468, 16.4807, 0.10609], [-1.7525, 16.5189, 0.10652], [-1.7578, 16.5578, 0.10695],
  [-1.7626, 16.5974, 0.10738], [-1.7670, 16.6376, 0.10780], [-1.7710, 16.6786, 0.10823], [-1.7745, 16.7203, 0.10865],
  [-1.7777, 16.7628, 0.10906], [-1.7804, 16.8059, 0.10948], [-1.7828, 16.8497, 0.10989], [-1.7847, 16.8941, 0.11030],
  [-1.7862, 16.9392, 0.11070], [-1.7873, 16.9850, 0.11110], [-1.7881, 17.0314, 0.11150], [-1.7884, 17.0784, 0.11189],
  [-1.7884, 17.1262, 0.11228], [-1.7880, 17.1746, 0.11266], [-1.7873, 17.2236, 0.11304], [-1.7861, 17.2734, 0.11342],
  [-1.7846, 17.3240, 0.11379], [-1.7828, 17.3752, 0.11415], [-1.7806, 17.4272, 0.11451], [-1.7780, 17.4799, 0.11487],
];

/** La fila de la tabla que le toca a una edad, con interpolación entre meses. */
function lmsAt<T extends number[]>(table: T[], ageYears: number): T | null {
  const months = ageYears * 12 - LMS_FROM;
  if (months < 0 || months > table.length - 1) return null;
  const lo = Math.floor(months);
  const hi = Math.min(table.length - 1, lo + 1);
  const t = months - lo;
  return table[lo].map((value, i) => value + (table[hi][i] - value) * t) as T;
}

/** La z de Cole: con L distinto de cero, la de la caja de Box-Cox. */
function coleZ(value: number, l: number, m: number, s: number): number {
  return Math.abs(l) < 1e-7 ? Math.log(value / m) / s : (Math.pow(value / m, l) - 1) / (l * s);
}

export interface Growth {
  z: number;
  percentile: number;
  /** La mediana de su edad, para poder decir «le faltan X cm». */
  median: number;
}

/** Dónde cae su talla en las tablas de la OMS. */
export function heightFor(height: number, age: number): Growth | null {
  const row = lmsAt(HEIGHT_LMS, age);
  if (!row) return null;
  const [m, s] = row;
  const z = coleZ(height, 1, m, s);
  return { z, percentile: pctFromZ(z), median: m };
}

/** Y su índice de masa corporal. */
export function bmiFor(bmi: number, age: number): Growth | null {
  const row = lmsAt(BMI_LMS, age);
  if (!row) return null;
  const [l, m, s] = row;
  const z = coleZ(bmi, l, m, s);
  return { z, percentile: pctFromZ(z), median: m };
}

/**
 * Cómo se llama un IMC según la OMS: delgadez por debajo de -2, normal
 * hasta +1, sobrepeso hasta +2 y obesidad por encima.
 */
export function bmiLabel(z: number): { label: string; tone: 'ok' | 'ojo' | 'alerta' } {
  if (z < -3) return { label: 'delgadez severa', tone: 'alerta' };
  if (z < -2) return { label: 'delgadez', tone: 'ojo' };
  if (z <= 1) return { label: 'peso normal', tone: 'ok' };
  if (z <= 2) return { label: 'sobrepeso', tone: 'ojo' };
  return { label: 'obesidad', tone: 'alerta' };
}

/**
 * Lo que se espera que crezca un niño al año a esta edad: entre 5 y 6 cm
 * antes del estirón, y por debajo de 4 conviene mirarlo con el pediatra.
 * Sale de la propia mediana de la OMS: de los 8 a los 9 años, 5,3 cm.
 */
export function expectedGrowth(age: number): number {
  const a = lmsAt(HEIGHT_LMS, age);
  const b = lmsAt(HEIGHT_LMS, age + 1);
  if (!a || !b) return 5.3;
  return b[0] - a[0];
}

/* ---------------------------------------------------------------------------
 * Esprint
 *
 * No hay percentiles publicados de «20 m con 1080 Sprint» para niños de 8 y
 * 9 años: no existe ese estudio. Lo que sí hay son tablas enormes de 50 m y
 * de 40 m lisos, así que lo que se hace es **convertir**: con su tiempo de
 * 20 m y su velocidad máxima se estima cuánto tardaría en la distancia del
 * estudio, y ese tiempo se sitúa en la tabla. La conversión no es exacta,
 * de modo que el resultado se da siempre en horquilla.
 * ------------------------------------------------------------------------- */

/**
 * Tiempo estimado en una distancia a partir de la velocidad máxima, con el
 * modelo de aceleración exponencial: t ≈ d/v + τ. La τ de un niño no se
 * conoce, así que se usa un rango (0,9–1,3 s) como en el informe del GPS.
 */
function timeFrom(vmaxKmh: number, metres: number, tau: number): number {
  return metres / (vmaxKmh / 3.6) + tau;
}

/** La τ que hace cuadrar su propio 20 m con su propia punta, si trae las dos. */
export function tauOf(test: FitnessTest): number | null {
  if (!test.sprint20 || !test.topSpeed) return null;
  const tau = test.sprint20 - 20 / (test.topSpeed / 3.6);
  return tau > 0.2 && tau < 2.5 ? tau : null;
}

/** Percentiles de 50 m lisos de niños australianos (Catley y Tomkinson). */
const CATLEY_50M: Record<number, [number, number][]> = {
  // [percentil, segundos]: el percentil es de forma física, así que el 95
  // es el más rápido.
  9: [[5, 10.6], [10, 10.2], [20, 9.8], [30, 9.5], [40, 9.3], [50, 9.1], [60, 9.0], [70, 8.8], [80, 8.6], [90, 8.3], [95, 8.1]],
  10: [[5, 10.5], [10, 10.1], [20, 9.7], [30, 9.4], [40, 9.2], [50, 9.0], [60, 8.8], [70, 8.7], [80, 8.5], [90, 8.2], [95, 8.0]],
};

/** Percentiles de 40 m del IDEFICS (aquí el percentil es del tiempo: P1 es el más rápido). */
const IDEFICS_40M: { upTo: number; label: string; pts: [number, number][] }[] = [
  {
    upTo: 8.5,
    label: '8,0–8,5 años',
    pts: [[1, 6.9], [3, 7.2], [10, 7.5], [25, 8.0], [50, 8.6], [75, 9.3], [90, 10.0], [97, 10.8], [99, 11.4]],
  },
  {
    upTo: 99,
    label: '8,5–9,0 años (las tablas del IDEFICS acaban a los 9)',
    pts: [[1, 6.7], [3, 7.0], [10, 7.4], [25, 7.8], [50, 8.4], [75, 9.1], [90, 9.8], [97, 10.5], [99, 11.2]],
  },
];

/** Interpola un percentil dentro de una tabla de puntos ordenada por tiempo. */
function interpolate(pts: [number, number][], time: number, fasterIsHigherPct: boolean): number {
  const sorted = [...pts].sort((a, b) => a[1] - b[1]);
  if (time <= sorted[0][1]) return sorted[0][0];
  if (time >= sorted[sorted.length - 1][1]) return sorted[sorted.length - 1][0];
  const k = sorted.findIndex(([, t]) => t >= time);
  const [p0, t0] = sorted[k - 1];
  const [p1, t1] = sorted[k];
  const p = p0 + ((time - t0) / (t1 - t0)) * (p1 - p0);
  return fasterIsHigherPct ? p : p;
}

export type FitMetric = 'sprint' | 'jump';

export interface FitPlacement {
  id: string;
  metric: FitMetric;
  title: string;
  detail: string;
  source: string;
  /** La horquilla de percentil, de peor a mejor. */
  range: [number, number];
  /** Aviso que acompaña al resultado. */
  caveat?: string;
}

/** Sitúa su esprint en las tablas grandes que hay para su edad. */
export function placeSprint(test: FitnessTest, age: number): FitPlacement[] {
  const out: FitPlacement[] = [];
  if (!test.topSpeed && !test.sprint20) return out;

  // Con su propia τ la conversión es suya y no una media; sin ella, horquilla.
  const own = tauOf(test);
  const taus: number[] = own ? [own, own] : [1.3, 0.9];

  if (test.topSpeed) {
    // Catley y Tomkinson: 50 m, niños de 9 y 10 años.
    const table = CATLEY_50M[age < 9.5 ? 9 : 10];
    if (table && age >= 8.5 && age <= 11) {
      const pcts = taus.map((tau) => interpolate(table, timeFrom(test.topSpeed!, 50, tau), true));
      out.push({
        id: 'catley50',
        metric: 'sprint',
        title: `Velocidad · 50 m lisos, niños de ${age < 9.5 ? 9 : 10} años`,
        detail:
          '101.045 marcas de escolares australianos. Su punta se convierte en un tiempo estimado de 50 m y ése se sitúa en la tabla.',
        source: 'catley',
        range: [Math.round(Math.min(...pcts)), Math.round(Math.max(...pcts))],
        caveat:
          'tabla australiana medida en pista: da marcas bastante más rápidas que las europeas, así que este percentil sale bajo a propósito',
      });
    }

    // IDEFICS: 40 m, niños europeos de 6 a 10. Aquí el percentil es de tiempo.
    if (age >= 6 && age <= 10) {
      const row = IDEFICS_40M.find((item) => age < item.upTo) ?? IDEFICS_40M[1];
      const pcts = taus.map((tau) => 100 - interpolate(row.pts, timeFrom(test.topSpeed!, 40, tau), false));
      out.push({
        id: 'idefics40',
        metric: 'sprint',
        title: `Velocidad · 40 m, niños europeos de ${row.label}`,
        detail: '10.302 niños de ocho países, España incluida. Misma conversión, ahora a 40 m.',
        source: 'idefics',
        range: [clampPct(Math.min(...pcts)), clampPct(Math.max(...pcts))],
      });
    }
  }

  return out;
}

/** Y su salto, con lo poco que hay publicado a esta edad. */
export function placeJump(test: FitnessTest, age: number): FitPlacement[] {
  if (!test.jumpHeight || age > 11) return [];
  const z = (test.jumpHeight - 0.17) / 0.06;
  return [
    {
      id: 'frontiers-cmj',
      metric: 'jump',
      title: 'Salto vertical · niños sub-9 activos',
      detail: 'Salto con contramovimiento en plataforma de fuerza: 0,17 ± 0,06 m en sub-9 (0,24 ± 0,10 m en sub-12).',
      source: 'frontiers',
      range: [pctFromZ(z), pctFromZ(z)],
      caveat: 'sólo 18 niños en el estudio, y a esta edad la técnica de salto todavía se está formando',
    },
  ];
}

/* ---------------------------------------------------------------------------
 * Maduración
 *
 * La fórmula que usa RX2 es la de Mirwald (2002), que necesita talla sentado.
 * Cuando no la hay —y en sus informes no viene— se puede usar la de Moore
 * (2015), que sólo pide edad, talla y peso y además está mejor calibrada.
 * Aquí se calcula para poder contrastar lo que dice el informe.
 * ------------------------------------------------------------------------- */

export interface Maturity {
  /** Años que faltan (negativo) o que han pasado desde el pico de crecimiento. */
  offset: number;
  /** La edad a la que caería el pico. */
  phvAge: number;
  /** Cómo se ha calculado. */
  method: 'moore' | 'mirwald';
}

/**
 * Ecuación de Moore (2015) para niños, la que sólo necesita edad, talla y
 * peso: offset = −7,999994 + 0,0036124 × (edad × talla).
 */
export function maturityMoore(age: number, height: number): Maturity | null {
  if (!age || !height) return null;
  const offset = -7.999994 + 0.0036124 * (age * height);
  return { offset, phvAge: age - offset, method: 'moore' };
}

/** Cómo se llama una fase según lo que falte para el pico. */
export function bandOf(offset: number): { label: string; detail: string } {
  if (offset < -3) {
    return {
      label: 'Bastante antes del estirón',
      detail: 'Etapa de aprender a moverse: coordinación, técnica de carrera, saltar y caer bien, y jugar a muchas cosas.',
    };
  }
  if (offset < -1) {
    return {
      label: 'Acercándose al estirón',
      detail: 'Sigue mandando la técnica, y conviene ir dejando puesta la costumbre de la fuerza bien hecha.',
    };
  }
  if (offset <= 1) {
    return {
      label: 'En pleno estirón',
      detail: 'Temporada de crecer deprisa: la coordinación se resiente un tiempo y hay que vigilar la carga y los dolores de crecimiento.',
    };
  }
  return {
    label: 'Pasado el estirón',
    detail: 'Es cuando la fuerza y la potencia empiezan a responder de verdad al entrenamiento.',
  };
}

/* ---------------------------------------------------------------------------
 * Cuándo un cambio significa algo
 *
 * El error típico de cada prueba, en tanto por ciento. Por debajo de eso, dos
 * mediciones distintas del mismo niño el mismo día ya se diferencian, así que
 * no hay nada que celebrar ni que lamentar.
 * ------------------------------------------------------------------------- */

export const TYPICAL_ERROR: Partial<Record<string, number>> = {
  height: 0.5,
  weight: 1,
  legLength: 1.5,
  jumpHeight: 5,
  peakBraking: 8,
  peakPropulsive: 5,
  takeOff: 7,
  sprint20: 2,
  topSpeed: 2.5,
};

/** Si un cambio pasa del ruido de la propia prueba. */
export function meaningful(field: string, percent: number): boolean {
  const error = TYPICAL_ERROR[field];
  return error === undefined ? true : Math.abs(percent) > error;
}

/** Un resumen de la última prueba: todo lo que se sabe situar. */
export function placeAll(test: FitnessTest, age: number): FitPlacement[] {
  return [...placeSprint(test, age), ...placeJump(test, age)];
}

/** Lo que hace falta de una prueba para que el informe tenga algo que decir. */
export function isUsable(test: FitnessTest): boolean {
  const d = derive(test);
  return Boolean(test.height || test.jumpHeight || test.sprint20 || test.topSpeed || d.bmi);
}
