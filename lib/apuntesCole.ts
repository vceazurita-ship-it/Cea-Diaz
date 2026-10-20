import { asignaturaDeCurso } from '@/lib/classroomModel';
import type { Asignatura, Tema } from '@/lib/temario';

/* =========================================================================
 *  Qué apuntes del cole van con qué examen.
 *
 *  Los apuntes son los PDF y las fotos de fichas que se suben a la nube de
 *  la cuenta (`lib/coleArchivos.ts`). Aquí, sin red ni nube, se decide
 *  cuáles sirven para preparar unos temas: los de la misma asignatura y,
 *  si el nombre del PDF dice unidades («4º UNITS 3-4», «UNIDAD_2»), sólo
 *  los de las unidades que entran. Así los agentes pueden decir «con el PDF
 *  tal» sin inventar nada: el nombre es el que puso la profesora.
 * ========================================================================= */

export interface ArchivoCole {
  /** La clase de Classroom de la que salió («Matemáticas 3ºB»). */
  clase: string;
  /** El nombre con que lo colgó la profesora. */
  titulo: string;
  /** El objeto dentro del cubo. */
  ruta: string;
  tipo: string;
  peso: number;
}

export function esImagen(a: ArchivoCole): boolean {
  return a.tipo.startsWith('image/');
}

/**
 * Las unidades que nombra un texto: «U3-4» → 3, 4; «UNITS 1 - 2» → 1, 2;
 * «UNIT1», «UNIDAD_2» → 1, 2. El curso del principio («3º», «4th grade»)
 * no cuenta, porque no va detrás de «unit» ni de «U».
 */
export function unidadesDe(texto: string): number[] {
  const out = new Set<number>();
  const re = /(?:^|[^a-z])(?:units?|unidad(?:es)?|u)[\s_.-]*(\d{1,2})(?:\s*(?:-|–|y|and)\s*(\d{1,2}))?(?!\d)/gi;
  for (const m of texto.matchAll(re)) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b) && n - Math.min(a, b) < 6; n += 1) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

export interface ApuntesDeExamen {
  /** Los PDF que tocan, el más concreto primero. */
  pdfs: ArchivoCole[];
  /** Fotos de fichas de esa asignatura. */
  fichas: number;
}

/** Los apuntes de una asignatura que valen para estos temas. */
export function apuntesPara(
  archivos: readonly ArchivoCole[] | null | undefined,
  asignatura: Asignatura,
  temas: readonly Pick<Tema, 'titulo'>[],
): ApuntesDeExamen {
  const deLaAsignatura = (archivos ?? []).filter((a) => asignaturaDeCurso(a.clase) === asignatura);
  const entran = new Set(temas.flatMap((t) => unidadesDe(t.titulo)));

  const pdfs = deLaAsignatura
    .filter((a) => !esImagen(a))
    .map((a) => {
      const suyas = unidadesDe(a.titulo);
      // Sin unidades en el nombre, vale para todo; con unidades, sólo si coincide alguna.
      const casa = suyas.length === 0 ? 0 : suyas.some((n) => entran.has(n)) ? 1 : -1;
      return { a, casa };
    })
    .filter((x) => entran.size === 0 || x.casa >= 0)
    .sort((x, y) => y.casa - x.casa || x.a.titulo.localeCompare(y.a.titulo, 'es'))
    .map((x) => x.a);

  return { pdfs, fichas: deLaAsignatura.filter(esImagen).length };
}

/** «4º UNITS 3-4» sin la extensión, para nombrarlo en una frase. */
export function nombreApunte(a: ArchivoCole): string {
  return a.titulo.replace(/(\.docx)?\.(pdf|jpe?g|png|webp|heic|docx|pptx)$/i, '').replace(/\s+/g, ' ').trim();
}

/** «con «4º UNITS 3-4» y 8 fichas», o vacío si no hay nada de esa asignatura. */
export function conApuntes(ap: ApuntesDeExamen, maxPdfs = 1): string {
  const partes: string[] = [];
  if (ap.pdfs.length) partes.push(ap.pdfs.slice(0, maxPdfs).map((a) => `«${nombreApunte(a)}»`).join(' y '));
  if (ap.fichas) partes.push(`${ap.fichas} ${ap.fichas === 1 ? 'ficha' : 'fichas'} de clase`);
  return partes.length ? `con ${partes.join(' y las ')}` : '';
}
