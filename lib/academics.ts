import { entryKey } from '@/lib/storage';
import type { DateKey, DayEntry, ProfileId } from '@/types';

/* =========================================================================
 *  El boletín del colegio, seguido como se sigue todo lo demás.
 *
 *  Un boletín enseña un trimestre y se guarda en un cajón. Puestos uno
 *  detrás de otro contestan lo que de verdad se quiere saber: **en qué va a
 *  más, en qué va a menos, y qué lleva dos años igual**. Eso no se ve en un
 *  papel suelto, y es justo lo que se puede hacer aquí.
 *
 *  Como en el resto de la aplicación, **en el código no hay ninguna nota de
 *  nadie**: sólo la escala, los nombres de las asignaturas y las reglas con
 *  las que se lee una serie. Las notas de Leo y de Hugo se quedan en su
 *  cuenta, y el PDF del boletín no sale del aparato.
 *
 *  Y una cosa que este módulo no hace: puntuar a un niño. Una nota de un
 *  trimestre de tercero de primaria no mide lo listo que es nadie; mide qué
 *  tal le fue ese trimestre en esa asignatura con ese profesor. Lo que se
 *  busca aquí son **patrones que duran**, que son los únicos que dicen algo.
 * ========================================================================= */

/* ---------------------------------------------------------------------------
 * La escala
 * ------------------------------------------------------------------------- */

export type Grade = 'IN' | 'SU' | 'BI' | 'NT' | 'SB';

export const GRADES: Grade[] = ['IN', 'SU', 'BI', 'NT', 'SB'];

export const GRADE_NAME: Record<Grade, string> = {
  IN: 'Insuficiente',
  SU: 'Suficiente',
  BI: 'Bien',
  NT: 'Notable',
  SB: 'Sobresaliente',
};

/** Puntos para poder hacer medias y ver tendencias. No es una nota sobre 10. */
export const GRADE_POINTS: Record<Grade, number> = { IN: 1, SU: 2, BI: 3, NT: 4, SB: 5 };

export const GRADE_COLOR: Record<Grade, string> = {
  IN: '#ef4444',
  SU: '#f97316',
  BI: '#eab308',
  NT: '#22c55e',
  SB: '#0ea5e9',
};

/** De la palabra entera a la sigla: los boletines usan las dos. */
export function gradeOf(text: string): Grade | null {
  const clean = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
  if (/^SOBRESALIENTE/.test(clean) || clean === 'SB') return 'SB';
  if (/^NOTABLE/.test(clean) || clean === 'NT') return 'NT';
  if (/^BIEN/.test(clean) || clean === 'BI') return 'BI';
  if (/^SUFICIENTE/.test(clean) || clean === 'SU') return 'SU';
  if (/^INSUFICIENTE/.test(clean) || clean === 'IN') return 'IN';
  return null;
}

/* ---------------------------------------------------------------------------
 * Las asignaturas
 *
 * Los boletines del colegio vienen en inglés y en castellano mezclados, que
 * es lo que pasa en un centro bilingüe. Aquí se les pone el nombre con el
 * que se habla de ellas en casa, y se agrupan para poder decir «en letras» o
 * «en números» sin tener que ir asignatura por asignatura.
 * ------------------------------------------------------------------------- */

export type Area = 'lengua' | 'idiomas' | 'numeros' | 'mundo' | 'arte' | 'cuerpo' | 'otras';

export const AREA_NAME: Record<Area, string> = {
  lengua: 'Lengua',
  idiomas: 'Idiomas',
  numeros: 'Matemáticas',
  mundo: 'Ciencias',
  arte: 'Arte y música',
  cuerpo: 'Educación física',
  otras: 'Otras',
};

interface SubjectMeta {
  /** Como sale en el boletín, sin acentos ni mayúsculas. */
  match: RegExp;
  label: string;
  area: Area;
}

const SUBJECTS: SubjectMeta[] = [
  { match: /^social sciences$/, label: 'Sociales', area: 'mundo' },
  { match: /^natural sciences$/, label: 'Naturales', area: 'mundo' },
  { match: /^music$/, label: 'Música', area: 'arte' },
  { match: /^arts and crafts$/, label: 'Plástica', area: 'arte' },
  { match: /^physical education$/, label: 'Educación física', area: 'cuerpo' },
  { match: /^lenguaje oral$/, label: 'Lenguaje oral', area: 'lengua' },
  { match: /^lenguaje escrito$/, label: 'Lenguaje escrito', area: 'lengua' },
  { match: /^iniciac.{0,3}n gramatical$/, label: 'Gramática', area: 'lengua' },
  { match: /^english$/, label: 'Inglés', area: 'idiomas' },
  { match: /^c.{0,3}lculo mental$/, label: 'Cálculo mental', area: 'numeros' },
  { match: /^conceptos matem.{0,3}ticos$/, label: 'Conceptos matemáticos', area: 'numeros' },
  { match: /^religi.{0,3}n|^valores/, label: 'Religión o valores', area: 'otras' },
];

/** Cabeceras que el boletín repite y que no son asignaturas. */
const HEADINGS = /^(art education|lengua castellana y literatura|foreign language|matem.{0,3}ticas)$/;

/** Reconoce una asignatura por su rótulo. */
export function subjectOf(line: string): SubjectMeta | null {
  const clean = line
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  if (!clean || HEADINGS.test(clean)) return null;
  return SUBJECTS.find((subject) => subject.match.test(clean)) ?? null;
}

/* ---------------------------------------------------------------------------
 * Un boletín
 * ------------------------------------------------------------------------- */

export interface SubjectRow {
  /** El nombre con el que se enseña. */
  label: string;
  area: Area;
  /** Las notas de cada evaluación, en orden. */
  terms: Grade[];
  /** La nota final, si el boletín la da aparte. */
  final?: Grade;
}

export interface ReportCard {
  profileId: ProfileId;
  /** El día en que se guarda, que es el que lo ordena. */
  date: DateKey;
  /** El curso tal como lo escribe el colegio: «25-26». */
  course: string;
  rows: SubjectRow[];
  note?: string;
}

/** La nota que cuenta de una asignatura: la final, o la última evaluación. */
export function gradeFor(row: SubjectRow): Grade | undefined {
  return row.final ?? row.terms[row.terms.length - 1];
}

/** La media en puntos de un boletín, sólo para ver si sube o baja. */
export function average(rows: SubjectRow[]): number | null {
  const puntos = rows.map(gradeFor).filter((grade): grade is Grade => Boolean(grade)).map((g) => GRADE_POINTS[g]);
  return puntos.length ? puntos.reduce((a, b) => a + b, 0) / puntos.length : null;
}

/** Y la media de una evaluación concreta, para ver la curva del curso. */
export function averageAt(rows: SubjectRow[], term: number): number | null {
  const puntos = rows.map((row) => row.terms[term]).filter((g): g is Grade => Boolean(g)).map((g) => GRADE_POINTS[g]);
  return puntos.length ? puntos.reduce((a, b) => a + b, 0) / puntos.length : null;
}

/** Cuántas evaluaciones trae el boletín. */
export function termCount(rows: SubjectRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.terms.length), 0);
}

/* ---------------------------------------------------------------------------
 * Leer el boletín
 *
 * El PDF escupe las celdas en orden: el nombre de la asignatura, a veces la
 * nota final en palabra, y luego las siglas de cada evaluación. Después lo
 * repite todo otra vez —el boletín lleva la tabla dos veces, una por cara—,
 * así que se guarda la primera vez que aparece cada asignatura y se ignora
 * la segunda.
 * ------------------------------------------------------------------------- */

export interface ParsedReport {
  course?: string;
  rows: SubjectRow[];
  /** Si el boletín trae un nombre, cuál. */
  who?: string;
  warnings: string[];
}

export function parseReport(lines: string[]): ParsedReport {
  const rows = new Map<string, SubjectRow>();
  const warnings: string[] = [];

  let current: SubjectRow | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const subject = subjectOf(line);
    if (subject) {
      // La segunda vez que sale una asignatura es la copia de la otra cara.
      current = rows.has(subject.label) ? null : { label: subject.label, area: subject.area, terms: [] };
      if (current) rows.set(subject.label, current);
      continue;
    }

    if (!current) continue;

    const grade = gradeOf(line);
    if (!grade) {
      // Cualquier otra cosa cierra la asignatura: una fecha, una firma…
      if (line.length > 3 && !/^[.\s]*$/.test(line)) current = null;
      continue;
    }

    // La palabra entera es la nota final; las siglas, las evaluaciones.
    if (/^[A-ZÁÉÍÓÚ]{4,}/.test(line.trim()) && !current.final) current.final = grade;
    else current.terms.push(grade);
  }

  const course = /curso\s*(\d{2}\s*-\s*\d{2})/i.exec(lines.join(' '))?.[1]?.replace(/\s/g, '');
  const who = /Don\.?\s+([A-ZÁÉÍÓÚÑ ]{6,})/.exec(lines.join('\n'))?.[1]?.trim();

  const salida = [...rows.values()].filter((row) => row.terms.length > 0 || row.final);
  if (salida.length === 0) warnings.push('No he reconocido ninguna asignatura: ¿es un boletín de este colegio?');

  return { course, rows: salida, who, warnings };
}

/* ---------------------------------------------------------------------------
 * Lo que se guarda
 *
 * Como las pruebas físicas: una línea en las notas de su día. El formato es
 * `asignatura:notas` separado por comas, con la final delante si la hay.
 * ------------------------------------------------------------------------- */

export const ACADEMIC_NOTE_KEY = 'boletin';

export function encodeReport(report: ReportCard): string {
  const partes = [`c=${report.course}`];
  for (const row of report.rows) {
    const notas = row.terms.join('');
    partes.push(`${row.label}=${row.final ?? ''}|${notas}`);
  }
  if (report.note) partes.push(`n=${report.note.replace(/[;=]/g, ' ')}`);
  return partes.join(';');
}

export function parseStoredReport(
  text: string | undefined | null,
  profileId: ProfileId,
  date: DateKey,
): ReportCard | null {
  if (!text) return null;
  const rows: SubjectRow[] = [];
  let course = '';
  let note: string | undefined;

  for (const trozo of text.split(';')) {
    const at = trozo.indexOf('=');
    if (at < 0) continue;
    const clave = trozo.slice(0, at);
    const valor = trozo.slice(at + 1);

    if (clave === 'c') {
      course = valor;
      continue;
    }
    if (clave === 'n') {
      note = valor;
      continue;
    }

    const [final, notas = ''] = valor.split('|');
    const meta = SUBJECTS.find((subject) => subject.label === clave);
    const terms: Grade[] = [];
    for (let i = 0; i + 1 < notas.length + 1; i += 2) {
      const grade = gradeOf(notas.slice(i, i + 2));
      if (grade) terms.push(grade);
    }
    rows.push({
      label: clave,
      area: meta?.area ?? 'otras',
      terms,
      final: gradeOf(final) ?? undefined,
    });
  }

  return rows.length ? { profileId, date, course, rows, note } : null;
}

/** Todos los boletines de un peque, del más reciente al más antiguo. */
export function reportsFor(entries: Record<string, DayEntry>, profileId: ProfileId): ReportCard[] {
  const out: ReportCard[] = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (!key.startsWith(`${profileId}:`)) continue;
    const report = parseStoredReport(entry.notes?.[ACADEMIC_NOTE_KEY], profileId, entry.date);
    if (report) out.push(report);
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function academicKey(profileId: ProfileId, date: DateKey): string {
  return entryKey(profileId, date);
}
