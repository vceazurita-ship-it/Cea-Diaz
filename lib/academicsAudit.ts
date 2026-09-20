import {
  AREA_NAME,
  GRADE_NAME,
  GRADE_POINTS,
  average,
  averageAt,
  gradeFor,
  termCount,
  type Area,
  type Grade,
  type ReportCard,
  type SubjectRow,
} from '@/lib/academics';
import type { FitnessTest } from '@/lib/fitness';

/* =========================================================================
 *  Leer un boletín como se lee un entrenamiento.
 *
 *  Lo que aquí se busca no son las notas —ésas ya están en el papel— sino
 *  **los patrones que duran**: la asignatura que lleva cuatro evaluaciones
 *  igual, la que sube, la que baja, y la distancia entre lo que se le da
 *  bien y lo que le cuesta. Un trimestre suelto no significa casi nada; una
 *  línea plana de cuatro trimestres, sí.
 *
 *  Y hay un cruce que en esta aplicación se puede hacer y en el colegio no:
 *  **el del cuerpo con la cabeza**. La relación entre actividad física y
 *  rendimiento escolar está bien estudiada y va en el sentido bueno, así que
 *  las dos mitades de esta sección se miran juntas.
 *
 *  Ninguna conclusión de aquí sustituye a hablar con el tutor. Lo que hace
 *  es llegar a esa conversación con la serie delante en vez de con la
 *  impresión del último trimestre.
 * ========================================================================= */

export interface AcSource {
  id: string;
  cite: string;
  url?: string;
}

export const AC_SOURCES: AcSource[] = [
  {
    id: 'acsm',
    cite:
      'Donnelly JE, et al. Physical activity, fitness, cognitive function, and academic achievement in children: a systematic review. Med Sci Sports Exerc 2016;48(6):1197–222. Posicionamiento del American College of Sports Medicine.',
    url: 'https://doi.org/10.1249/MSS.0000000000000901',
  },
  {
    id: 'meta',
    cite:
      'Álvarez-Bueno C, et al. Academic achievement and physical activity: a meta-analysis. Pediatrics 2017;140(6):e20171498. 26 estudios; el efecto más claro está en matemáticas.',
    url: 'https://doi.org/10.1542/peds.2017-1498',
  },
  {
    id: 'hattie',
    cite: 'Hattie J. Visible Learning. Routledge, 2009. Síntesis de más de 800 metaanálisis sobre qué mueve de verdad el aprendizaje.',
  },
  {
    id: 'dweck',
    cite:
      'Mueller CM, Dweck CS. Praise for intelligence can undermine children’s motivation and performance. J Pers Soc Psychol 1998;75:33–52.',
    url: 'https://doi.org/10.1037/0022-3514.75.1.33',
  },
  {
    id: 'lectura',
    cite:
      'National Reading Panel. Teaching Children to Read. NICHD, 2000 · Castles A, Rastle K, Nation K. Ending the reading wars. Psychol Sci Public Interest 2018;19(1):5–51.',
    url: 'https://doi.org/10.1177/1529100618772271',
  },
  {
    id: 'escritura',
    cite:
      'Graham S, et al. A meta-analysis of writing instruction for students in the elementary grades. J Educ Psychol 2012;104(4):879–96.',
    url: 'https://doi.org/10.1037/a0029185',
  },
];

export const AC_SOURCE_BY_ID = new Map(AC_SOURCES.map((source) => [source.id, source]));

export const AC_EXPERTS: { who: string; text: string; source: string }[] = [
  {
    who: 'Hattie (2009)',
    text: 'Lo que más mueve el aprendizaje es la calidad de la información de vuelta: decirle qué ha hecho bien y qué paso viene ahora. Una nota, por sí sola, es de las formas más pobres de decírselo.',
    source: 'hattie',
  },
  {
    who: 'Mueller y Dweck (1998)',
    text: 'Elogiar el esfuerzo y la estrategia («has probado otra manera») sostiene el rendimiento; elogiar la capacidad («qué listo eres») lo hunde en cuanto llega algo difícil.',
    source: 'dweck',
  },
  {
    who: 'Posición del ACSM (Donnelly et al., 2016)',
    text: 'La actividad física mejora la atención y la memoria de trabajo de los niños, y no quita tiempo de aprender: los estudios que cambian horas de clase por horas de movimiento no empeoran las notas.',
    source: 'acsm',
  },
  {
    who: 'Castles, Rastle y Nation (2018)',
    text: 'Leer y escribir bien se enseña, no se espera. Lo que funciona a estas edades es trabajo explícito y frecuente, en ratos cortos y sostenidos.',
    source: 'lectura',
  },
];

/* ---------------------------------------------------------------------------
 * Las tendencias
 * ------------------------------------------------------------------------- */

export type Trend = 'sube' | 'baja' | 'estable';

/** La pendiente de una serie de notas, por mínimos cuadrados sobre los puntos. */
export function trendOf(terms: Grade[]): { trend: Trend; slope: number } {
  if (terms.length < 3) return { trend: 'estable', slope: 0 };
  const y = terms.map((grade) => GRADE_POINTS[grade]);
  const n = y.length;
  const mx = (n - 1) / 2;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (y[i] - my);
    den += (i - mx) * (i - mx);
  }
  const slope = den === 0 ? 0 : num / den;
  return { trend: slope > 0.25 ? 'sube' : slope < -0.25 ? 'baja' : 'estable', slope };
}

export type Severity = 'bien' | 'dato' | 'ojo' | 'atencion';

export interface AcFinding {
  id: string;
  severity: Severity;
  title: string;
  text: string;
  evidence?: string[];
  todo?: string;
  source?: string;
}

const ORDER: Record<Severity, number> = { atencion: 0, ojo: 1, bien: 2, dato: 3 };
const one = (value: number) => value.toFixed(1).replace('.', ',');

/** Las asignaturas de un área. */
function ofArea(rows: SubjectRow[], area: Area): SubjectRow[] {
  return rows.filter((row) => row.area === area);
}

export interface AcAudit {
  report: ReportCard;
  findings: AcFinding[];
  /** La media por evaluación, para dibujar la curva del curso. */
  curve: (number | null)[];
  /** Cada asignatura con su tendencia. */
  trends: { row: SubjectRow; trend: Trend; slope: number }[];
  /** La media del boletín, en puntos de 1 a 5. */
  mean: number | null;
}

export function auditReport(report: ReportCard, before: ReportCard | null, tests: FitnessTest[] = []): AcAudit {
  const rows = report.rows;
  const findings: AcFinding[] = [];
  const terms = termCount(rows);
  const curve = Array.from({ length: terms }, (_, i) => averageAt(rows, i));
  const trends = rows.map((row) => ({ row, ...trendOf(row.terms) }));
  const mean = average(rows);

  /* ------------------------------------------------------ lo que sostiene */
  const fuertes = rows.filter((row) => row.terms.length >= 3 && row.terms.every((grade) => grade === 'SB'));
  if (fuertes.length > 0) {
    findings.push({
      id: 'sostenidas',
      severity: 'bien',
      title: `${fuertes.length} asignatura${fuertes.length > 1 ? 's' : ''} con sobresaliente todo el curso`,
      text: `${fuertes.map((row) => row.label).join(', ')}. Cuatro evaluaciones seguidas al mismo nivel no es suerte de un trimestre: es una manera de trabajar que ya tiene. Merece que se le diga en esos términos —«has mantenido esto todo el año»— y no sólo con la nota.`,
      evidence: fuertes.map((row) => `${row.label}: ${row.terms.join(' ')}`),
      source: 'hattie',
    });
  }

  /* ---------------------------------------------- lo que lleva tiempo bajo */
  const flojas = rows.filter((row) => {
    const nota = gradeFor(row);
    return nota && GRADE_POINTS[nota] <= 3 && row.terms.length >= 3;
  });
  for (const row of flojas) {
    const plana = row.terms.every((grade) => grade === row.terms[0]);
    findings.push({
      id: `floja-${row.label}`,
      severity: plana ? 'ojo' : 'dato',
      title: `${row.label}: ${GRADE_NAME[gradeFor(row)!].toLowerCase()} ${plana ? 'todo el curso' : 'al cerrar'}`,
      text: plana
        ? `Las ${row.terms.length} evaluaciones dan lo mismo (${row.terms.join(', ')}). Una línea plana de un curso entero no es un mal trimestre: es algo que no se está moviendo, y lo que no se mueve solo no se va a mover solo el año que viene.`
        : `Cierra en ${GRADE_NAME[gradeFor(row)!].toLowerCase()} después de ${row.terms.join(', ')}.`,
      evidence: [`${row.label}: ${row.terms.join(' → ')}`],
      todo: plana
        ? 'Preguntarle al tutor qué falla exactamente —y pedir una cosa concreta que hacer en casa diez minutos al día, no «que repase»—.'
        : undefined,
      source: row.area === 'lengua' ? 'escritura' : 'hattie',
    });
  }

  /* ------------------------------------- el contraste dentro de la lengua */
  const lengua = ofArea(rows, 'lengua');
  if (lengua.length >= 2) {
    const puntos = lengua
      .map((row) => ({ row, p: gradeFor(row) ? GRADE_POINTS[gradeFor(row)!] : null }))
      .filter((item): item is { row: SubjectRow; p: number } => item.p !== null);
    if (puntos.length >= 2) {
      const mejor = puntos.reduce((a, b) => (b.p > a.p ? b : a));
      const peor = puntos.reduce((a, b) => (b.p < a.p ? b : a));
      const resto = rows.filter((row) => row.area !== 'lengua').map((row) => gradeFor(row)).filter(Boolean) as Grade[];
      const mediaResto = resto.length ? resto.reduce((a, b) => a + GRADE_POINTS[b], 0) / resto.length : 0;

      if (mejor.p - peor.p >= 2 || (mediaResto - peor.p >= 1.5 && peor.p <= 3)) {
        findings.push({
          id: 'lengua-desnivel',
          severity: 'ojo',
          title: `${peor.row.label} va muy por detrás del resto`,
          text: `Saca ${GRADE_NAME[gradeFor(peor.row)!].toLowerCase()} en ${peor.row.label} mientras en el resto del boletín se mueve alrededor del ${one(mediaResto)} sobre 5. Un desnivel así, sostenido y sólo en un sitio, es el patrón que conviene mirar con calma: cuando un niño entiende, calcula y habla bien pero se le atasca lo escrito, la explicación suele estar en el cómo —la mecánica de escribir— y no en el cuánto sabe. No es un diagnóstico; es el motivo para preguntar.`,
          evidence: [
            `${peor.row.label}: ${peor.row.terms.join(' → ')}`,
            `${mejor.row.label}: ${mejor.row.terms.join(' → ')}`,
            `media del resto: ${one(mediaResto)} / 5`,
          ],
          todo:
            'Enseñarle esta serie al tutor y, si hay informe neuropsicológico en casa, ponerlos uno al lado del otro: son las dos mitades de la misma pregunta.',
          source: 'escritura',
        });
      }
    }
  }

  /* --------------------------------------------------- las que se mueven */
  const suben = trends.filter((item) => item.trend === 'sube');
  const bajan = trends.filter((item) => item.trend === 'baja');

  if (suben.length > 0) {
    findings.push({
      id: 'suben',
      severity: 'bien',
      title: `Va a más en ${suben.map((item) => item.row.label).join(', ')}`,
      text: 'Lo interesante de una asignatura que sube no es la nota de hoy: es que lo que está haciendo funciona. Vale la pena preguntarle a él qué ha cambiado, porque lo que conteste probablemente sirva también para las otras.',
      evidence: suben.map((item) => `${item.row.label}: ${item.row.terms.join(' → ')}`),
      source: 'dweck',
    });
  }

  if (bajan.length > 0) {
    findings.push({
      id: 'bajan',
      severity: 'ojo',
      title: `Va a menos en ${bajan.map((item) => item.row.label).join(', ')}`,
      text: 'Tres o cuatro evaluaciones con pendiente hacia abajo ya no es ruido. Suele tener una causa sencilla —el temario se complica, cambia la manera de examinar, se despistó un trimestre— y se arregla antes cuanto antes se pregunte.',
      evidence: bajan.map((item) => `${item.row.label}: ${item.row.terms.join(' → ')}`),
      todo: 'Una pregunta concreta al tutor por cada una, no una general por todas.',
      source: 'hattie',
    });
  }

  /* --------------------------------------------------- la curva del curso */
  const validos = curve.filter((value): value is number => value !== null);
  if (validos.length >= 3) {
    const delta = validos[validos.length - 1] - validos[0];
    findings.push({
      id: 'curva',
      severity: delta >= 0 ? 'bien' : 'dato',
      title: delta > 0.2 ? 'El curso ha ido de menos a más' : delta < -0.2 ? 'El curso ha ido de más a menos' : 'Curso estable de principio a fin',
      text: `La media del boletín pasa de ${one(validos[0])} a ${one(validos[validos.length - 1])} sobre 5 entre la primera evaluación y la última.`,
      evidence: validos.map((value, i) => `${i + 1}.ª evaluación: ${one(value)}`),
      source: 'hattie',
    });
  }

  /* ---------------------------------------------- contra el curso pasado */
  if (before) {
    const antes = average(before.rows);
    if (antes !== null && mean !== null) {
      const delta = mean - antes;
      findings.push({
        id: 'contra-curso-anterior',
        severity: delta >= -0.1 ? 'bien' : 'ojo',
        title: `Contra el curso ${before.course}: ${delta >= 0 ? '+' : ''}${one(delta)} puntos`,
        text: `De ${one(antes)} a ${one(mean)} sobre 5. Al comparar cursos hay que acordarse de que el listón sube todos los años: mantener la nota ya es mejorar.`,
        evidence: [`${before.course}: ${one(antes)}`, `${report.course}: ${one(mean)}`],
        source: 'hattie',
      });
    }
  }

  /* --------------------------------------------- el cruce con lo físico */
  const efis = rows.find((row) => row.area === 'cuerpo');
  if (efis && tests.length > 0) {
    const nota = gradeFor(efis);
    findings.push({
      id: 'cuerpo-cabeza',
      severity: 'dato',
      title: 'Lo que hace con el cuerpo también cuenta aquí',
      text: `En Educación física va ${nota ? GRADE_NAME[nota].toLowerCase() : 'bien'}, y en esta misma sección están sus pruebas físicas. No es una casualidad bonita: la revisión del ACSM y el metaanálisis de Pediatrics coinciden en que la actividad física mejora la atención y la memoria de trabajo de los niños, con el efecto más claro precisamente en matemáticas. El deporte que hace no le quita tiempo de estudiar: le pone la cabeza a punto para estudiar.`,
      evidence: [`Educación física: ${efis.terms.join(' → ')}`, `${tests.length} pruebas físicas guardadas`],
      source: 'acsm',
    });
  }

  /* --------------------------------------------------------- lo que no es */
  findings.push({
    id: 'marco',
    severity: 'dato',
    title: 'Qué es esto y qué no',
    text: 'Esto no puntúa a nadie ni predice nada. Una nota de primaria mide qué tal fue ese trimestre en esa asignatura, y poco más. Lo único que aquí tiene valor de verdad son los patrones que se repiten curso tras curso, porque son los únicos que se pueden acompañar.',
    source: 'hattie',
  });

  // Si el desnivel de lengua ya señala una asignatura, sobra decir aparte
  // que esa misma lleva todo el curso baja: es el mismo hallazgo dos veces.
  const desnivel = findings.find((finding) => finding.id === 'lengua-desnivel');
  const limpias = desnivel
    ? findings.filter((finding) => !(finding.id.startsWith('floja-') && desnivel.title.startsWith(finding.id.slice(6))))
    : findings;

  limpias.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return { report, findings: limpias, curve, trends, mean };
}

/** El área con mejor y peor media, para el resumen de una línea. */
export function areasOf(rows: SubjectRow[]): { area: Area; label: string; mean: number }[] {
  const grupos = new Map<Area, number[]>();
  for (const row of rows) {
    const nota = gradeFor(row);
    if (!nota) continue;
    grupos.set(row.area, [...(grupos.get(row.area) ?? []), GRADE_POINTS[nota]]);
  }
  return [...grupos.entries()]
    .map(([area, puntos]) => ({
      area,
      label: AREA_NAME[area],
      mean: puntos.reduce((a, b) => a + b, 0) / puntos.length,
    }))
    .sort((a, b) => b.mean - a.mean);
}
