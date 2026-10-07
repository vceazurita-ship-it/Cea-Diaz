import { hashSeed } from '@/lib/challenges';
import { addDays, parseDateKey } from '@/lib/dates';
import { entryKey } from '@/lib/storage';
import { planDelDia, type PlanDelDia } from '@/lib/examenes';
import { TEMARIO, barajar, makeRand, temaDe, temasHasta, type Asignatura, type Curso, type Pregunta, type Tema } from '@/lib/temario';
import type { DateKey, DayEntry, GameQuestion, ProfileId, ShotKind } from '@/types';

/* =========================================================================
 *  El reto del cole: una asignatura al día y un tiro especial de premio.
 *
 *  Lunes Mates, martes Lengua, miércoles Science, jueves English y viernes
 *  Social Science; el sábado y el domingo, un repaso de todo lo de la
 *  semana. Cinco preguntas del tema que se está dando en clase
 *  (`lib/temario.ts`), y con cuatro bien se gana para ese día el tiro de la
 *  asignatura: el Multiplicador, la Tormenta de Letras, la Doble Hélice, el
 *  Thunder Shot, el Meteorito o, el finde, el Meridiano de Greenwich.
 *
 *  Como el juego del día, se juega una vez y lo contestado se queda: una
 *  línea en las notas del día y nada más. Cuantos más retos de una
 *  asignatura se ganan en el trimestre, más nivel tiene su tiro —y menos le
 *  llega Benji—.
 * ========================================================================= */

export const COLE_NOTE_KEY = 'cole';
export const COLE_QUESTIONS = 5;
export const COLE_PASS = 4;

/** El curso de cada uno. Cambia en septiembre: aquí y en ningún sitio más. */
export const CURSO_DE: Partial<Record<ProfileId, Curso>> = { leo: 3, hugo: 4 };

export type RetoId = Asignatura | 'repaso';

export const RETO_META: Record<RetoId, { nombre: string; icon: string; tiro: ShotKind; color: string }> = {
  mates: { nombre: 'Matemáticas', icon: '📐', tiro: 'multiplicador', color: '#22d3ee' },
  lengua: { nombre: 'Lengua', icon: '📖', tiro: 'letras', color: '#facc15' },
  science: { nombre: 'Natural Science', icon: '🔬', tiro: 'adn', color: '#4ade80' },
  english: { nombre: 'English', icon: '🇬🇧', tiro: 'thunder', color: '#818cf8' },
  social: { nombre: 'Social Science', icon: '🌍', tiro: 'meteorito', color: '#fb7185' },
  repaso: { nombre: 'Repaso de la semana', icon: '⭐', tiro: 'meridiano', color: '#fbbf24' },
};

const SEMANA: RetoId[] = ['repaso', 'mates', 'lengua', 'science', 'english', 'social', 'repaso'];

/**
 * La asignatura del día. Con exámenes a la vista manda el plan de
 * `lib/examenes.ts`; si no, la rotación de la semana.
 */
export function retoDelDia(date: DateKey, profileId?: ProfileId): RetoId {
  const plan = profileId ? planDelDia(profileId, date) : null;
  return plan ? plan.reto : SEMANA[parseDateKey(date).getDay()];
}

export function cursoDe(profileId: ProfileId): Curso | null {
  return CURSO_DE[profileId] ?? null;
}

export interface RetoCole {
  reto: RetoId;
  date: DateKey;
  curso: Curso;
  /** Los temas de los que salen las preguntas (uno, o varios en el repaso). */
  temas: Tema[];
  /** Si el reto prepara exámenes: qué, y en qué modo. */
  plan: PlanDelDia | null;
  questions: GameQuestion[];
}

/** Iconos que no enseñan nada a tamaño grande. */
const SIN_LAMINA = new Set(['📝', '🤔', '✏️', '🖊️', '🔠', '🏷️', '⚖️', '✍️', '➕', '➖', '✖️', '🧩', '🔁', '0️⃣', '🧮', '🎯', '🔄', '🧷', '📦', '🥇', '🔤', '🔎', '🤝', '🔢', '🇬🇧', '🏛️']);

function aQuestion(id: string, q: Pregunta, seed: number): GameQuestion {
  const rand = makeRand(seed);
  const malos = [...new Set(q.no.filter((x) => x !== q.ok))].slice(0, 3);
  const options = barajar([q.ok, ...malos], rand).map((text, i) => ({ id: 'abcd'[i], text }));
  return {
    id,
    prompt: q.prompt,
    options,
    answer: options.find((o) => o.text === q.ok)!.id,
    explain: q.why,
    icon: q.icon,
    // Sin material propio, una lámina con su dibujo, si el dibujo dice algo:
    // los iconos de «escribe» o «piensa» sólo ensuciarían el tapete.
    visual: q.visual ?? (SIN_LAMINA.has(q.icon) ? undefined : { tipo: 'lamina', emoji: q.icon, control: true }),
  };
}

/**
 * Las cinco preguntas de hoy. Deterministas: el mismo día y el mismo niño
 * dan las mismas, en el mismo orden, se recargue lo que se recargue.
 */
export function buildRetoCole(profileId: ProfileId, curso: Curso, date: DateKey, vuelta = 0): RetoCole {
  const plan = planDelDia(profileId, date);
  const reto = retoDelDia(date, profileId);
  // La vuelta 0 es el reto que puntúa; las demás, la práctica libre.
  const seed = hashSeed(`${profileId}:cole:${date}${vuelta ? `:practica${vuelta}` : ''}`);
  const rand = makeRand(seed);

  // Los grupos de los que se va sacando por turnos: cada asignatura, sus
  // temas. Preparando exámenes, todos los temas que entran en cada uno; si
  // no, el tema de la semana. El repaso, una pregunta de cada asignatura.
  const temasDe = (a: Asignatura): Tema[] => {
    const examen = plan?.pendientes.find((e) => e.asignatura === a);
    const delExamen = examen ? TEMARIO.filter((t) => examen.temas.includes(t.id)) : [];
    return delExamen.length > 0 ? delExamen : [temaDe(a, curso, date)];
  };
  const grupos: Tema[][] =
    reto === 'repaso'
      ? (plan ? plan.pendientes.map((e) => e.asignatura) : (['mates', 'lengua', 'science', 'english', 'social'] as Asignatura[])).map(temasDe)
      : [temasDe(reto)];
  const temas = grupos.flat();

  const preguntas: Pregunta[] = [];
  const vistas = new Set<string>();
  for (let i = 0; preguntas.length < COLE_QUESTIONS && i < 60; i += 1) {
    const grupo = grupos[preguntas.length % grupos.length];
    const tema = grupo[Math.floor(rand() * grupo.length)];
    const hacer = tema.hacer[Math.floor(rand() * tema.hacer.length)];
    const q = hacer(rand);
    // Sin repetir enunciado en la misma partida.
    if (vistas.has(q.prompt)) continue;
    vistas.add(q.prompt);
    preguntas.push(q);
  }

  return {
    reto,
    date,
    curso,
    temas,
    plan,
    questions: preguntas.map((q, i) => aQuestion(`cole-${date}-${i}`, q, seed + i * 7919)),
  };
}

/* ---------------------------------------------------------------------------
 * Lo que se guarda: `reto|aciertos|contestadas|total|momento`
 * ------------------------------------------------------------------------- */

export interface RetoResult {
  reto: RetoId;
  correct: number;
  answered: number;
  total: number;
  at: string;
}

export function encodeRetoResult(r: RetoResult): string {
  return [r.reto, r.correct, r.answered, r.total, r.at].join('|');
}

export function parseRetoResult(text: string | undefined | null): RetoResult | null {
  if (!text) return null;
  const [reto, correct, answered, total, at] = text.split('|');
  if (!(reto in RETO_META)) return null;
  const n = [correct, answered, total].map(Number);
  if (n.some((v) => !Number.isFinite(v)) || n[2] <= 0) return null;
  return { reto: reto as RetoId, correct: n[0], answered: n[1], total: n[2], at: at ?? '' };
}

export function retoResultFor(entries: Record<string, DayEntry>, profileId: ProfileId, date: DateKey): RetoResult | null {
  const r = parseRetoResult(entries[entryKey(profileId, date)]?.notes?.[COLE_NOTE_KEY]);
  return r && r.reto === retoDelDia(date, profileId) ? r : null;
}

export function retoSuperado(r: RetoResult | null): boolean {
  return Boolean(r && r.answered >= r.total && r.correct >= COLE_PASS);
}

/** Los tiros del cole que se pueden tirar hoy: el de la asignatura, si se ganó. */
export function tirosDelCole(entries: Record<string, DayEntry>, profileId: ProfileId, date: DateKey): ShotKind[] {
  const r = retoResultFor(entries, profileId, date);
  return retoSuperado(r) ? [RETO_META[r!.reto].tiro] : [];
}

/** Desde cuándo se cuentan las victorias para el nivel: el trimestre. */
export const TRIMESTRE_DESDE: DateKey = '2026-09-07';

/**
 * Las veces que se ha ganado el reto de esa asignatura este trimestre,
 * hasta ese día incluido.
 */
export function victorias(entries: Record<string, DayEntry>, profileId: ProfileId, reto: RetoId, hasta: DateKey): number {
  let n = 0;
  for (let d = TRIMESTRE_DESDE; d <= hasta; d = addDays(d, 1)) {
    if (retoDelDia(d, profileId) !== reto) continue;
    if (retoSuperado(retoResultFor(entries, profileId, d))) n += 1;
  }
  return n;
}

/** Nivel del tiro: 1 al ganarlo, 2 a las tres victorias, 3 a las seis. */
export function nivelDe(ganados: number): 0 | 1 | 2 | 3 {
  return ganados >= 6 ? 3 : ganados >= 3 ? 2 : ganados >= 1 ? 1 : 0;
}

/** Lo que se le encoge el alcance a Benji por nivel, en puntos de portería. */
export const NIVEL_ALCANCE = 3;

export { temasHasta };
