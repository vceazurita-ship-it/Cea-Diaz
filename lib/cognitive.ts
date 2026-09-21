import { entryKey } from '@/lib/storage';
import type { DateKey, DayEntry, ProfileId } from '@/types';

/* =========================================================================
 *  El perfil cognitivo, el de la escala de Wechsler.
 *
 *  Una valoración neuropsicológica acaba en un informe de siete páginas del
 *  que, año y medio después, no se recuerda nada salvo el número grande. Y
 *  el número grande es justo el que menos dice: lo que de verdad sirve para
 *  acompañar a un niño es **la forma del perfil** —en qué índice va alto, en
 *  cuál bajo y cuánta distancia hay entre ellos—, porque eso explica cosas
 *  que se ven todos los días en los deberes.
 *
 *  Por eso se guardan aquí los cinco índices y se cruzan con el boletín: una
 *  velocidad de procesamiento baja y un «lenguaje escrito» que no arranca no
 *  son dos problemas, son el mismo visto desde dos sitios.
 *
 *  Como en todo lo demás de esta sección, en el código no hay ninguna cifra
 *  de nadie: sólo la escala, lo que significa cada índice y cómo se lee un
 *  informe. Los números viven en la cuenta de la familia.
 * ========================================================================= */

export type IndexId = 'icv' | 'ive' | 'irf' | 'imt' | 'ivp' | 'cit';

export interface CogIndex {
  id: IndexId;
  label: string;
  short: string;
  /** Qué mide, dicho para quien no ha visto un informe en su vida. */
  blurb: string;
  /** Y qué se nota en el día a día cuando va bajo. */
  cuandoBajo: string;
}

export const COG_INDICES: CogIndex[] = [
  {
    id: 'icv',
    label: 'Comprensión verbal',
    short: 'ICV',
    blurb: 'Entender y usar el lenguaje: explicar en qué se parecen dos cosas, definir palabras, saber cosas del mundo.',
    cuandoBajo: 'Le cuesta explicarse y seguir explicaciones largas.',
  },
  {
    id: 'ive',
    label: 'Razonamiento visoespacial',
    short: 'IVE',
    blurb: 'Ver cómo encajan las cosas en el espacio: construir con cubos, resolver un puzle mentalmente.',
    cuandoBajo: 'Se le atraganta la geometría y orientarse en un plano.',
  },
  {
    id: 'irf',
    label: 'Razonamiento fluido',
    short: 'IRF',
    blurb: 'Encontrar la regla que sigue una serie y aplicarla a algo nuevo, sin que nadie se la haya enseñado antes.',
    cuandoBajo: 'Necesita más ejemplos antes de coger una regla nueva.',
  },
  {
    id: 'imt',
    label: 'Memoria de trabajo',
    short: 'IMT',
    blurb: 'Sostener información en la cabeza mientras se hace algo con ella: seguir instrucciones de tres pasos, calcular de memoria.',
    cuandoBajo: 'Se le caen los enunciados largos y las instrucciones encadenadas.',
  },
  {
    id: 'ivp',
    label: 'Velocidad de procesamiento',
    short: 'IVP',
    blurb: 'Lo rápido que hace tareas sencillas y muy repetidas: copiar símbolos, buscar uno igual entre muchos.',
    cuandoBajo: 'Sabe hacerlo y lo hace bien, pero tarda; en clase eso se ve como «no termina» o como una letra peor.',
  },
  {
    id: 'cit',
    label: 'Cociente intelectual total',
    short: 'CIT',
    blurb: 'El resumen de los cinco. Es una foto de un día, no un destino, y a esta edad se mueve.',
    cuandoBajo: '',
  },
];

export const COG_BY_ID = new Map(COG_INDICES.map((index) => [index.id, index]));

/** Una puntuación de índice con su percentil. */
export interface CogScore {
  score: number;
  pct?: number;
}

export interface CogProfile {
  profileId: ProfileId;
  date: DateKey;
  /** La edad de baremo que trae el informe: «6:4». */
  age?: string;
  scores: Partial<Record<IndexId, CogScore>>;
  note?: string;
}

/**
 * Cómo se llama una puntuación de índice. La escala tiene media 100 y
 * desviación 15, así que de 90 a 109 es la franja donde cae la mitad de la
 * población.
 */
export function bandOf(score: number): { label: string; tone: 'alto' | 'medio' | 'bajo' } {
  if (score >= 130) return { label: 'muy alto', tone: 'alto' };
  if (score >= 120) return { label: 'alto', tone: 'alto' };
  if (score >= 110) return { label: 'medio-alto', tone: 'alto' };
  if (score >= 90) return { label: 'medio', tone: 'medio' };
  if (score >= 80) return { label: 'medio-bajo', tone: 'bajo' };
  if (score >= 70) return { label: 'bajo', tone: 'bajo' };
  return { label: 'muy bajo', tone: 'bajo' };
}

/** El índice más alto y el más bajo, sin contar el total. */
export function extremos(profile: CogProfile): { alto?: IndexId; bajo?: IndexId; rango: number } {
  const pares = (Object.entries(profile.scores) as [IndexId, CogScore][]).filter(([id]) => id !== 'cit');
  if (pares.length < 2) return { rango: 0 };
  const orden = [...pares].sort((a, b) => a[1].score - b[1].score);
  return { bajo: orden[0][0], alto: orden[orden.length - 1][0], rango: orden[orden.length - 1][1].score - orden[0][1].score };
}

/* ---------------------------------------------------------------------------
 * Leer el informe
 *
 * De las siete páginas sólo se saca la tabla, que es lo único comparable. Y
 * se saca por los códigos entre paréntesis —(ICV), (IVE)…— y no por el
 * nombre, porque el informe repite «Memoria de trabajo» dos veces: una para
 * la suma de escalares y otra para el índice.
 * ------------------------------------------------------------------------- */

/**
 * Los códigos de índice, tal como salen del informe.
 *
 * El paréntesis de cierre **no se puede exigir**: al leer estos PDF algunos
 * glifos se pierden y «(ICV)» sale como «(ICV\». Exigiéndolo se guardaba el
 * CI total y nada más, que es justo la cifra que menos dice.
 */
const CODIGOS: [IndexId, RegExp][] = [
  ['icv', /[([]\s*icv\s*[)\]\\]?/g],
  ['ive', /[([]\s*ive\s*[)\]\\]?/g],
  ['irf', /[([]\s*irf\s*[)\]\\]?/g],
  ['imt', /[([]\s*imt\s*[)\]\\]?/g],
  ['ivp', /[([]\s*ivp\s*[)\]\\]?/g],
  ['cit', /ci\s*total/g],
];

function flat(lines: string[]): string {
  return lines
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏﻿]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export interface ParsedCog {
  scores: Partial<Record<IndexId, CogScore>>;
  age?: string;
  /** La fecha de la valoración, si la trae. */
  date?: DateKey;
  who?: 'leo' | 'hugo';
  warnings: string[];
}

export function parseWisc(lines: string[]): ParsedCog {
  const text = flat(lines);
  const warnings: string[] = [];
  const scores: Partial<Record<IndexId, CogScore>> = {};

  if (!/wisc|comprension verbal|ci total/.test(text)) {
    return { scores, warnings: ['No parece un informe de la escala de Wechsler.'] };
  }

  for (const [id, re] of CODIGOS) {
    // Cada código sale dos veces: en la tabla, seguido de su puntuación, y
    // en el texto que lo explica, seguido de prosa. Se miran todas las
    // veces y se coge la primera que traiga un número que pueda serlo.
    const buscar = new RegExp(re.source, 'g');
    let at: RegExpExecArray | null;
    while ((at = buscar.exec(text))) {
      const resto = text.slice(at.index + at[0].length, at.index + at[0].length + 60);
      const nums = [...resto.matchAll(/\d+/g)].map((m) => Number(m[0]));
      const score = nums.find((value) => value >= 40 && value <= 160);
      if (score === undefined) continue;
      const tras = resto.slice(resto.indexOf(String(score)) + String(score).length);
      const pct = Number((/pct\D{0,4}(\d{1,2})\b/.exec(tras) || [])[1]);
      scores[id] = { score, pct: Number.isFinite(pct) ? pct : undefined };
      break;
    }
  }

  const edad = /edad\s*\(?\s*baremos?\s*\)?\D{0,4}(\d{1,2})\s*:\s*(\d{1,2})/.exec(text);
  const fecha = /(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{4})/.exec(text);
  const who = /leo\s*(?:cea)?/.test(text) ? 'leo' : /hugo\s*(?:cea)?/.test(text) ? 'hugo' : undefined;

  if (Object.keys(scores).length === 0) {
    warnings.push('He reconocido el informe pero no he sabido leer su tabla de índices: métela a mano.');
  }

  return {
    scores,
    age: edad ? `${edad[1]}:${edad[2]}` : undefined,
    date: fecha
      ? (`${fecha[3]}-${String(Number(fecha[2])).padStart(2, '0')}-${String(Number(fecha[1])).padStart(2, '0')}` as DateKey)
      : undefined,
    who,
    warnings,
  };
}

/* ---------------------------------------------------------------------------
 * Lo que se guarda
 * ------------------------------------------------------------------------- */

export const COGNITIVE_NOTE_KEY = 'cognitivo';

export function encodeCog(profile: CogProfile): string {
  const partes: string[] = [];
  if (profile.age) partes.push(`e=${profile.age}`);
  for (const [id, value] of Object.entries(profile.scores) as [IndexId, CogScore][]) {
    partes.push(`${id}=${value.score}${value.pct !== undefined ? `/${value.pct}` : ''}`);
  }
  if (profile.note) partes.push(`n=${profile.note.replace(/[;=]/g, ' ')}`);
  return partes.join(';');
}

export function parseCog(text: string | undefined | null, profileId: ProfileId, date: DateKey): CogProfile | null {
  if (!text) return null;
  const scores: Partial<Record<IndexId, CogScore>> = {};
  let age: string | undefined;
  let note: string | undefined;

  for (const trozo of text.split(';')) {
    const at = trozo.indexOf('=');
    if (at < 0) continue;
    const clave = trozo.slice(0, at);
    const valor = trozo.slice(at + 1);

    if (clave === 'e') {
      age = valor;
      continue;
    }
    if (clave === 'n') {
      note = valor;
      continue;
    }
    if (!COG_BY_ID.has(clave as IndexId)) continue;
    const [score, pct] = valor.split('/').map(Number);
    if (Number.isFinite(score)) {
      scores[clave as IndexId] = { score, pct: Number.isFinite(pct) ? pct : undefined };
    }
  }

  return Object.keys(scores).length ? { profileId, date, age, scores, note } : null;
}

/** Los perfiles cognitivos de un peque, del más reciente al más antiguo. */
export function cogFor(entries: Record<string, DayEntry>, profileId: ProfileId): CogProfile[] {
  const out: CogProfile[] = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (!key.startsWith(`${profileId}:`)) continue;
    const profile = parseCog(entry.notes?.[COGNITIVE_NOTE_KEY], profileId, entry.date);
    if (profile) out.push(profile);
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function cogKey(profileId: ProfileId, date: DateKey): string {
  return entryKey(profileId, date);
}
