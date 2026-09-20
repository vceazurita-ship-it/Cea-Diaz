import { ACADEMIC_NOTE_KEY, encodeReport, parseReport, type ReportCard } from '@/lib/academics';
import { COGNITIVE_NOTE_KEY, encodeCog, parseWisc, type CogProfile } from '@/lib/cognitive';
import { FITNESS_NOTE_KEY, encodeTest, hasData, type FitnessTest } from '@/lib/fitness';
import { PdfProtegido, parseRx2, pdfLines } from '@/lib/rx2';
import { todayKey } from '@/lib/dates';
import type { DateKey, ProfileId } from '@/types';

/* =========================================================================
 *  Un archivo entra, y la aplicación averigua el resto.
 *
 *  La carpeta de casa tiene ocho archivos de cuatro clases distintas, para
 *  dos niños, con fechas que sólo están escritas dentro. Pedirle a alguien
 *  que abra ocho veces un formulario, elija el niño, elija el tipo y copie
 *  la fecha es pedirle que no lo haga.
 *
 *  Así que aquí se hace al revés: se suelta la carpeta entera y cada archivo
 *  dice de quién es, qué es y de cuándo. Lo que no se sepa se pregunta una
 *  vez —la contraseña— y lo que no se entienda se dice sin disimulo.
 *
 *  Nada se guarda sin enseñarlo antes. Y nada sale del aparato: los PDF se
 *  abren aquí y se tiran; sólo se guardan las cifras.
 * ========================================================================= */

export type Clase = 'fisico' | 'boletin' | 'cognitivo' | 'genetico' | 'desconocido';

export const CLASE_LABEL: Record<Clase, string> = {
  fisico: 'Pruebas físicas',
  boletin: 'Boletín del colegio',
  cognitivo: 'Valoración neuropsicológica',
  genetico: 'Estudio genético',
  desconocido: 'Sin reconocer',
};

export const CLASE_ICON: Record<Clase, string> = {
  fisico: '💪',
  boletin: '📚',
  cognitivo: '🧠',
  genetico: '🧬',
  desconocido: '❓',
};

/** Una línea lista para guardarse en las notas de un día. */
export interface Apunte {
  profileId: ProfileId;
  date: DateKey;
  key: string;
  line: string;
  /** Cómo se resume en la lista de confirmación. */
  resumen: string;
}

export interface Lectura {
  file: string;
  clase: Clase;
  /** De quién es, si el documento lo dice. */
  who?: ProfileId;
  apuntes: Apunte[];
  warnings: string[];
  /** El archivo pide contraseña. */
  pideClave?: boolean;
  /** Los bytes, guardados sólo para reintentar con la contraseña. */
  data?: ArrayBuffer;
}

/* ---------------------------------------------------------------------------
 * Fechas escritas con letra
 *
 * Los informes ponen «31 de julio de 2024», y al leerlos del PDF se pierden
 * casi todas las vocales: queda «31 d jli d 2024». Por eso los meses se
 * reconocen quitándoles también a ellos las vocales, que es lo único que
 * sobrevive igual en los dos lados.
 * ------------------------------------------------------------------------- */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const sinVocales = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[aeou]/g, '');

/** La fecha escrita con letra que traiga el texto, si la trae. */
export function fechaEnLetra(text: string): DateKey | undefined {
  const limpio = text.replace(/\s+/g, ' ');
  for (const m of limpio.matchAll(/(\d{1,2})\s+d\w{0,2}\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]{2,12})\s+d\w{0,2}\s+(\d{4})/g)) {
    const dia = Number(m[1]);
    const anio = Number(m[3]);
    if (dia < 1 || dia > 31 || anio < 2000 || anio > 2100) continue;
    const buscado = sinVocales(m[2]);
    const mes = MESES.findIndex((nombre) => sinVocales(nombre) === buscado);
    if (mes < 0) continue;
    return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}` as DateKey;
  }
  return undefined;
}

/**
 * El día con el que se guarda un boletín: el final del curso que dice.
 * «25-26» es el curso 2025-2026, y ese boletín se entrega en junio de 2026.
 */
export function finDeCurso(course: string | undefined): DateKey | undefined {
  const m = /(\d{2})\s*-\s*(\d{2})/.exec(course ?? '');
  if (!m) return undefined;
  return `20${m[2]}-06-20` as DateKey;
}

/* ---------------------------------------------------------------------------
 * Quién y qué
 * ------------------------------------------------------------------------- */

function quien(text: string, nombreArchivo: string): ProfileId | undefined {
  const todo = `${nombreArchivo} ${text}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  // Las iniciales de los informes: LCD es Leo Cea Díaz; HCD, Hugo.
  if (/\bleo\b|lcd/.test(todo)) return 'leo';
  if (/\bhugo\b|hcd/.test(todo)) return 'hugo';
  return undefined;
}

/**
 * Lee un archivo y devuelve lo que ha entendido, listo para confirmar.
 *
 * `sugerido` es el perfil en cuyo panel se está: se usa sólo cuando el
 * documento no dice de quién es.
 */
export async function leerInforme(
  file: File,
  sugerido: ProfileId,
  opts: { data?: ArrayBuffer; password?: string } = {},
): Promise<Lectura> {
  const base: Lectura = { file: file.name, clase: 'desconocido', apuntes: [], warnings: [] };

  let lines: string[];
  try {
    if (/\.pdf$/i.test(file.name)) {
      const buffer = opts.data ?? (await file.arrayBuffer());
      base.data = buffer;
      lines = await pdfLines(buffer, opts.password);
    } else if (/\.(txt|csv|md)$/i.test(file.name)) {
      lines = (await file.text()).split(/\r?\n/);
    } else {
      return { ...base, warnings: ['Sólo sé leer PDF y archivos de texto.'] };
    }
  } catch (error) {
    if (error instanceof PdfProtegido) {
      return {
        ...base,
        pideClave: true,
        warnings: [
          error.malaClave
            ? 'Esa contraseña no abre este PDF.'
            : 'Pide contraseña. Escríbela abajo y vuelve a intentarlo.',
        ],
      };
    }
    return { ...base, warnings: ['No he podido leer el archivo. Si es un escaneo, no tiene texto que leer.'] };
  }

  const texto = lines.join(' ');
  const who = quien(texto, file.name) ?? sugerido;
  base.who = who;

  /* ------------------------------------------------------------ físicas */
  const rx2 = parseRx2(lines, who);
  if (rx2.kind === 'fisico' && rx2.tests.length > 0) {
    const apuntes = rx2.tests.filter(hasData).map((test: FitnessTest) => ({
      profileId: who,
      date: test.date,
      key: FITNESS_NOTE_KEY,
      line: encodeTest({ ...test, profileId: who }),
      resumen: resumenTest(test),
    }));
    return { ...base, clase: 'fisico', apuntes, warnings: rx2.warnings };
  }
  if (rx2.kind === 'genetico') {
    return {
      ...base,
      clase: 'genetico',
      warnings: [
        'Es un estudio genético. No se guarda ninguna cifra: el consenso publicado dice que estos tests no sirven para orientar el entrenamiento de un niño, y eso ya está explicado en la pestaña de Físico.',
      ],
    };
  }

  /* ------------------------------------------------------------ boletín */
  const boletin = parseReport(lines);
  if (boletin.rows.length > 0) {
    const date = finDeCurso(boletin.course) ?? fechaEnLetra(texto) ?? todayKey();
    const report: ReportCard = { profileId: who, date, course: boletin.course ?? '', rows: boletin.rows };
    return {
      ...base,
      clase: 'boletin',
      apuntes: [
        {
          profileId: who,
          date,
          key: ACADEMIC_NOTE_KEY,
          line: encodeReport(report),
          resumen: `Curso ${report.course || '—'} · ${report.rows.length} asignaturas`,
        },
      ],
      warnings: boletin.warnings,
    };
  }

  /* --------------------------------------------------------- cognitivo */
  const wisc = parseWisc(lines);
  if (Object.keys(wisc.scores).length > 0) {
    // La primera fecha con cifras de un informe neuropsicológico suele ser
    // la de nacimiento; la de la valoración va escrita con letra.
    const date = fechaEnLetra(texto) ?? todayKey();
    const cog: CogProfile = { profileId: who, date, age: wisc.age, scores: wisc.scores };
    const indices = Object.entries(wisc.scores)
      .map(([id, value]) => `${id.toUpperCase()} ${value.score}`)
      .join(' · ');
    return {
      ...base,
      clase: 'cognitivo',
      apuntes: [
        {
          profileId: who,
          date,
          key: COGNITIVE_NOTE_KEY,
          line: encodeCog(cog),
          resumen: indices,
        },
      ],
      warnings: wisc.warnings,
    };
  }

  return {
    ...base,
    warnings: [...boletin.warnings, ...wisc.warnings].length
      ? [...boletin.warnings, ...wisc.warnings]
      : ['No he reconocido qué es este archivo.'],
  };
}

function resumenTest(test: FitnessTest): string {
  const trozos: string[] = [];
  if (test.height) trozos.push(`${test.height} cm`);
  if (test.weight) trozos.push(`${test.weight} kg`);
  if (test.jumpHeight) trozos.push(`salto ${test.jumpHeight} m`);
  if (test.sprint20) trozos.push(`20 m ${test.sprint20} s`);
  if (test.topSpeed) trozos.push(`${test.topSpeed} km/h`);
  return trozos.join(' · ') || 'sin cifras';
}
