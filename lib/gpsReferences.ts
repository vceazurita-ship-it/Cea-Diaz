import type { GpsSession } from '@/types';

/* =========================================================================
 *  Con qué se compara el GPS de los peques.
 *
 *  Aquí sólo hay **cifras publicadas**: medias, desviaciones y percentiles
 *  de estudios con niños de su edad —población general, club y élite—, con
 *  su cita. Las cifras de Leo y Hugo no están en el código (el repositorio
 *  es público): el informe las calcula en el aparato, con las sesiones que
 *  cada uno tiene guardadas, y cambia solo cada vez que entra una sesión.
 *
 *  Tres cautelas que el informe repite donde toca:
 *
 *   · El rastreador (Footbar, en la pierna) no mide igual que los GPS, las
 *     fotocélulas o las cámaras de los estudios. Su única validación es del
 *     fabricante, con adultos: la punta sale un 3,3 % baja y con un error
 *     típico de 0,22 m/s (~0,8 km/h). La potencia de tiro no está validada.
 *   · Los percentiles son estimaciones: se sitúa al niño en la media y la
 *     desviación de cada estudio suponiendo una distribución normal, y se
 *     da un rango —de su sesión típica a sus mejores sesiones—, nunca una
 *     cifra.
 *   · Los estudios de partido dejan fuera a los porteros.
 * ========================================================================= */

export type Tier = 'general' | 'club' | 'elite';

export const TIER_LABEL: Record<Tier, string> = {
  general: 'Población general',
  club: 'Club',
  elite: 'Élite',
};

/** Las fuentes, numeradas como se citan en el informe. */
export interface Source {
  id: string;
  cite: string;
  url?: string;
}

export const SOURCES: Source[] = [
  {
    id: 'idefics',
    cite:
      'De Miguel-Etayo P, et al. Physical fitness reference standards in European children: the IDEFICS study. Int J Obes 2014;38:S57–66. 10.302 niños de 6–10 años de 8 países, España incluida.',
    url: 'https://doi.org/10.1038/ijo.2014.136',
  },
  {
    id: 'murcia',
    cite:
      'Inglés-Bolumar et al. Análisis cinemático en fútbol 8 benjamín (WIMU PRO, 10 Hz). Kronos 2018;17(1). Primera Benjamín de Murcia, 9,8 años.',
  },
  {
    id: 'sensors',
    cite: 'Hernández-Martín A, et al. U10 amateur, 7 contra 7, GPS 15 Hz. Sensors 2020;20:6968.',
    url: 'https://doi.org/10.3390/s20236968',
  },
  {
    id: 'usatf',
    cite:
      'Brown GA, Shaw BS, Shaw I. Sex-based differences in track running distances in the 8 and under and 9–10-year-old age groups. Eur J Sport Sci 2024. Finalistas nacionales juveniles de EE. UU.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11235854/',
  },
  {
    id: 'kick',
    cite:
      'Palucci Vieira LH, et al. Kicking performance in young U9 to U20 soccer players. Res Q Exerc Sport 2018;89(2). Cámaras 3D a 300 Hz, penalti a diana; sub-9 en su tabla 1 (el resumen lo llama sub-11 por error).',
    url: 'https://doi.org/10.1080/02701367.2018.1439569',
  },
  {
    id: 'goto',
    cite:
      'Goto H, Morris JG, Nevill ME. Match analysis of U9 and U10 English Premier League Academy soccer players using GPS. J Strength Cond Res 2015;29(4):954–63.',
    url: 'https://doi.org/10.1519/JSC.0b013e3182a0d751',
  },
  {
    id: 'footbar',
    cite:
      'Footbar R&D Team. Validación del Footbar Meteor frente a un sistema de posicionamiento local. SportRxiv 2026 (preprint del fabricante, sin revisión, 8 jugadores sub-23).',
    url: 'https://doi.org/10.51224/SportRxiv.804',
  },
  { id: 'ioc', cite: 'Bergeron MF, et al. IOC consensus statement on youth athletic development. Br J Sports Med 2015;49:843–51.' },
  { id: 'ypd', cite: 'Lloyd RS, Oliver JL. The Youth Physical Development Model. Strength Cond J 2012;34(3):61–72.' },
  {
    id: 'madurez',
    cite: 'Cumming SP, et al. Bio-banding in sport. Strength Cond J 2017;39(2):34–47 · Malina RM, et al. Br J Sports Med 2015;49:852–9.',
  },
  {
    id: 'edad',
    cite:
      'Helsen WF, et al. The relative age effect in youth soccer across Europe. J Sports Sci 2005;23:629–36 · Gutiérrez Díaz del Campo D, et al. J Sports Sci Med 2010;9:190–8.',
  },
  { id: 'especializacion', cite: 'Jayanthi N, et al. Sports specialization in young athletes. Sports Health 2013;5:251–7.' },
];

/** Lo que dicen los expertos, en una línea cada uno. */
export const EXPERTS: { who: string; text: string; source: string }[] = [
  {
    who: 'Consenso del COI (Bergeron et al., 2015)',
    text: 'El objetivo es formar deportistas jóvenes «sanos, resistentes y capaces», con oportunidades para todos los niveles. A esta edad se mide para cuidar y enseñar, no para seleccionar.',
    source: 'ioc',
  },
  {
    who: 'Desarrollo físico juvenil (Lloyd y Oliver, 2012)',
    text: '«Casi todos, si no todos, los componentes de la condición física se pueden entrenar durante toda la infancia». La prioridad son las habilidades motrices y la técnica de carrera.',
    source: 'ypd',
  },
  {
    who: 'Maduración (Cumming, 2017; Malina, 2015)',
    text: 'Niños de la misma edad pueden madurar a ritmos muy distintos, sobre todo entre los 11 y los 14 años. Una ventaja de hoy puede igualarse con el estirón.',
    source: 'madurez',
  },
  {
    who: 'Edad relativa (Helsen, 2005; Gutiérrez Díaz del Campo, 2010)',
    text: 'En las canteras de LaLiga había 1.204 nacidos en el primer trimestre frente a 311 del último. Los mayores del año parecen más «talentosos» sin serlo necesariamente.',
    source: 'edad',
  },
  {
    who: 'Especialización temprana (Jayanthi et al., 2013)',
    text: 'No hay pruebas de que especializarse antes de la pubertad sea necesario, y sí de más lesiones, estrés y abandono. Alternar puestos y deportes suma.',
    source: 'especializacion',
  },
];

/* ---------------------------------------------------------------------------
 * Estadística mínima
 * ------------------------------------------------------------------------- */

/** Función de distribución normal (aproximación de Abramowitz y Stegun). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

export function quantile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}

const clampPct = (p: number) => Math.max(1, Math.min(99, Math.round(p)));

/**
 * Tiempo en una distancia a partir de la velocidad máxima, con el modelo
 * de aceleración exponencial: t ≈ d / v + τ. La τ de un niño no se conoce,
 * así que se usa un rango (0,9–1,3 s) y el resultado se da también en rango.
 */
function timeFrom(vmaxKmh: number, metres: number, tau: number): number {
  return metres / (vmaxKmh / 3.6) + tau;
}

/* ---------------------------------------------------------------------------
 * Las comparaciones
 * ------------------------------------------------------------------------- */

/** Percentiles de tiempo en 40 m (niños de peso normal): P1 es el más rápido. */
const IDEFICS_40M: { ages: [number, number]; label: string; pts: [number, number][] }[] = [
  {
    ages: [8, 8.5],
    label: '8,0–8,5 años',
    pts: [[1, 6.9], [3, 7.2], [10, 7.5], [25, 8.0], [50, 8.6], [75, 9.3], [90, 10.0], [97, 10.8], [99, 11.4]],
  },
  {
    ages: [8.5, 99],
    label: '8,5–9,0 años (las tablas acaban a los 9)',
    pts: [[1, 6.7], [3, 7.0], [10, 7.4], [25, 7.8], [50, 8.4], [75, 9.1], [90, 9.8], [97, 10.5], [99, 11.2]],
  },
];

/** «Más rápido que el X % de los niños» para un tiempo de 40 m. */
function idefics(time: number, age: number): number {
  const table = IDEFICS_40M.find((row) => age >= row.ages[0] && age < row.ages[1]) ?? IDEFICS_40M[1];
  const pts = table.pts;
  let timePct: number;
  if (time <= pts[0][1]) timePct = pts[0][0];
  else if (time >= pts[pts.length - 1][1]) timePct = pts[pts.length - 1][0];
  else {
    const k = pts.findIndex(([, t]) => t >= time);
    const [p0, t0] = pts[k - 1];
    const [p1, t1] = pts[k];
    timePct = p0 + ((time - t0) / (t1 - t0)) * (p1 - p0);
  }
  return 100 - timePct;
}

export interface Comparison {
  id: string;
  metric: 'topSpeed' | 'shotPower';
  tier: Tier;
  title: string;
  detail: string;
  source: string;
  /** Si el valor a comparar es de partido (y entonces se usan sólo sus partidos). */
  matchOnly?: boolean;
  /** Aviso que acompaña al resultado. */
  caveat?: string;
  /** Percentil («mejor que el X %») de un valor, en km/h. Devuelve un rango. */
  percentile: (value: number, age: number) => [number, number];
  /** Para qué edades tiene sentido. */
  ages: [number, number];
}

const normal = (mean: number, sd: number) => (value: number): [number, number] => {
  const p = clampPct(normalCdf((value - mean) / sd) * 100);
  return [p, p];
};

export const COMPARISONS: Comparison[] = [
  {
    id: 'idefics',
    metric: 'topSpeed',
    tier: 'general',
    title: 'Velocidad punta · niños de su edad',
    detail: 'IDEFICS, 10.302 niños europeos, sprint de 40 m. Su punta se convierte en un tiempo de 40 m estimado.',
    source: 'idefics',
    ages: [6, 10],
    percentile: (value, age) => {
      const slow = idefics(timeFrom(value, 40, 1.3), age);
      const fast = idefics(timeFrom(value, 40, 0.9), age);
      return [clampPct(slow), clampPct(fast)];
    },
  },
  {
    id: 'murcia',
    metric: 'topSpeed',
    tier: 'club',
    title: 'Punta en partido · benjamines de fútbol 8',
    detail: 'Primera Benjamín de Murcia, 9,8 años, GPS: 20,1 ± 3,1 km/h. Sólo jugadores de campo.',
    source: 'murcia',
    matchOnly: true,
    ages: [7, 11],
    percentile: normal(20.12, 3.07),
  },
  {
    id: 'sensors',
    metric: 'topSpeed',
    tier: 'club',
    title: 'Punta en partido · centrocampistas sub-10',
    detail: 'Club amateur, 7 contra 7, 10,2 años, GPS 15 Hz: 20,9 ± 1,8 km/h.',
    source: 'sensors',
    matchOnly: true,
    ages: [7, 11],
    percentile: normal(20.85, 1.8),
  },
  {
    id: 'usatf',
    metric: 'topSpeed',
    tier: 'elite',
    title: 'Velocidad · finalistas nacionales de atletismo',
    detail:
      '100 m en los campeonatos nacionales juveniles de EE. UU. (8 años o menos: 14,97 ± 0,97 s; 9–10 años: 13,78 ± 0,67 s). Su punta se convierte en un tiempo de 100 m estimado.',
    source: 'usatf',
    ages: [6, 11],
    percentile: (value, age) => {
      const [mean, sd] = age <= 8 ? [14.97, 0.97] : [13.78, 0.67];
      const slow = 100 * (1 - normalCdf((timeFrom(value, 100, 1.3) - mean) / sd));
      const fast = 100 * (1 - normalCdf((timeFrom(value, 100, 0.9) - mean) / sd));
      return [clampPct(slow), clampPct(fast)];
    },
  },
  {
    id: 'kick9',
    metric: 'shotPower',
    tier: 'club',
    title: 'Potencia de tiro · club sub-9',
    detail: 'Brasil, en formación desde los 6 años, cámaras 3D: 48,5 ± 8,3 km/h.',
    source: 'kick',
    caveat: 'la potencia de Footbar no está validada: no comparable todavía',
    ages: [7, 10],
    percentile: normal(48.54, 8.31),
  },
  {
    id: 'kick11',
    metric: 'shotPower',
    tier: 'club',
    title: 'Potencia de tiro · club sub-11',
    detail: 'Misma prueba, jugadores sub-11: 57,9 ± 10,9 km/h.',
    source: 'kick',
    caveat: 'la potencia de Footbar no está validada: no comparable todavía',
    ages: [8, 12],
    percentile: normal(57.87, 10.93),
  },
];

/* ---------------------------------------------------------------------------
 * El informe, calculado con las sesiones del peque
 * ------------------------------------------------------------------------- */

/** Las sesiones que cuentan: fuera las vacías o de un minuto (aparato olvidado encendido). */
export function usable(sessions: GpsSession[]): GpsSession[] {
  return sessions.filter((session) => (session.distance ?? 0) >= 0.5 || (session.topSpeed ?? 0) >= 8);
}

export interface Placed {
  comparison: Comparison;
  range: [number, number];
  /** Sesiones en las que se basa. */
  basis: number;
  /** El valor de la última sesión, situado en el mismo estudio. */
  latest?: [number, number];
}

/**
 * Sitúa al peque en cada estudio que le toca por edad: de su sesión típica
 * (mediana) a sus mejores sesiones (percentil 90).
 */
export function placeAgainstStudies(sessions: GpsSession[], age: number, latest?: GpsSession): Placed[] {
  const out: Placed[] = [];
  for (const comparison of COMPARISONS) {
    if (age < comparison.ages[0] || age > comparison.ages[1]) continue;
    const pool = comparison.matchOnly
      ? sessions.filter((session) => session.kind === 'partido')
      : sessions;
    const values = pool.map((session) => session[comparison.metric]).filter((v): v is number => (v ?? 0) > 0);
    if (values.length < 3) continue;

    const typical = comparison.percentile(quantile(values, 0.5), age);
    const best = comparison.percentile(quantile(values, 0.9), age);
    const lastValue = latest?.[comparison.metric];
    out.push({
      comparison,
      range: [Math.min(typical[0], best[0]), Math.max(typical[1], best[1])],
      basis: values.length,
      latest:
        lastValue && lastValue > 0 && (!comparison.matchOnly || latest?.kind === 'partido')
          ? comparison.percentile(lastValue, age)
          : undefined,
    });
  }
  return out;
}
