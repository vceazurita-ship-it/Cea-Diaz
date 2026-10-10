import { hashSeed } from '@/lib/challenges';
import { addDays, parseDateKey } from '@/lib/dates';
import { entryKey } from '@/lib/storage';
import { planDelDia } from '@/lib/examenes';
import type { PlanDelDia } from '@/lib/examenes';
import { TEMARIO, barajar, makeRand, temaDe, temasHasta, type Asignatura, type Curso, type Pregunta, type Rand, type Tema } from '@/lib/temario';
import type { DateKey, DayEntry, GameQuestion, ProfileId, ShotKind } from '@/types';

/* =========================================================================
 *  Los retos del cole: todas las asignaturas, todos los días, y un tiro
 *  especial de premio por cada una.
 *
 *  Cada día se pueden jugar los seis: Mates, Lengua, Science, English,
 *  Social y el repaso de todo. Cinco preguntas del tema que se está dando
 *  en clase (`lib/temario.ts`) —o de lo que entra en el examen, si hay
 *  alguno a la vista— y con cuatro bien se gana para ese día el tiro de la
 *  asignatura: el Multiplicador, la Tormenta de Letras, la Doble Hélice, el
 *  Thunder Shot, el Meteorito o el Meridiano de Greenwich.
 *
 *  El calendario sigue diciendo cuál «toca» hoy (lunes Mates, martes
 *  Lengua…, o el examen que viene), pero sólo como recomendación: es el que
 *  sale primero. Los demás se pueden hacer igual, y cuantos más se hagan al
 *  día, más tiros hay en la tanda.
 *
 *  Las preguntas no son sólo de elegir: también de escribir la respuesta,
 *  de ordenar, de emparejar, de clasificar y de verdadero o falso. Cada
 *  reto mezcla varias maneras.
 *
 *  Como el juego del día, cada reto se juega una vez y lo contestado se
 *  queda: una línea en las notas del día con el resultado de cada uno.
 *  Cuantos más retos de una asignatura se ganan en el trimestre, más nivel
 *  tiene su tiro —y menos le llega Benji—.
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
  repaso: { nombre: 'Repaso de todo', icon: '⭐', tiro: 'meridiano', color: '#fbbf24' },
};

export const ASIGNATURAS: Asignatura[] = ['mates', 'lengua', 'science', 'english', 'social'];

/** Todos los retos que se pueden jugar cada día. */
export const RETOS: RetoId[] = [...ASIGNATURAS, 'repaso'];

const SEMANA: RetoId[] = ['repaso', 'mates', 'lengua', 'science', 'english', 'social', 'repaso'];

/**
 * El reto que toca hoy por calendario: la recomendación, el que sale
 * primero. Con exámenes a la vista manda el plan de `lib/examenes.ts`; si
 * no, la rotación de la semana.
 */
export function retoDelDia(date: DateKey, profileId?: ProfileId): RetoId {
  const plan = profileId ? planDelDia(profileId, date) : null;
  return plan ? plan.reto : SEMANA[parseDateKey(date).getDay()];
}

/**
 * Los retos de hoy, en el orden en que conviene hacerlos: el que toca,
 * luego los exámenes que vienen (en su orden) y después el resto, con el
 * repaso al final.
 */
export function retosDelDia(date: DateKey, profileId: ProfileId): RetoId[] {
  const orden: RetoId[] = [retoDelDia(date, profileId)];
  const plan = planDelDia(profileId, date);
  for (const e of plan?.pendientes ?? []) if (!orden.includes(e.asignatura)) orden.push(e.asignatura);
  for (const r of RETOS) if (!orden.includes(r)) orden.push(r);
  return orden;
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
const SIN_LAMINA = new Set(['📝', '🤔', '✏️', '🖊️', '🔠', '🏷️', '⚖️', '✍️', '➕', '➖', '✖️', '🧩', '🔁', '0️⃣', '🧮', '🎯', '🔄', '🧷', '📦', '🥇', '🔤', '🔎', '🤝', '🔢', '🇬🇧', '🏛️', '📶', '🐝', '🗓️', '👏', '🎵', '🌱', '🔍', '👑', '🐑', '🧭', '🏫', '🦠', '🔬', '✨', '🎢', '🪙', '☀️']);

function aQuestion(id: string, q: Pregunta, seed: number): GameQuestion {
  const rand = makeRand(seed);
  // Sin material propio, una lámina con su dibujo, si el dibujo dice algo:
  // los iconos de «escribe» o «piensa» sólo ensuciarían el tapete.
  const visual = q.visual ?? (SIN_LAMINA.has(q.icon) ? undefined : { tipo: 'lamina' as const, emoji: q.icon, control: true });
  if (q.juego) {
    // En los otros juegos la única opción es la respuesta buena escrita;
    // se contesta con su `id` al acertar y con otro al fallar.
    return { id, prompt: q.prompt, options: [{ id: 'a', text: q.ok }], answer: 'a', explain: q.why, icon: q.icon, visual, juego: q.juego };
  }
  const malos = [...new Set(q.no.filter((x) => x !== q.ok))].slice(0, 3);
  const options = barajar([q.ok, ...malos], rand).map((text, i) => ({ id: 'abcd'[i], text }));
  return {
    id,
    prompt: q.prompt,
    options,
    answer: options.find((o) => o.text === q.ok)!.id,
    explain: q.why,
    icon: q.icon,
    visual,
  };
}

/** Las asignaturas que van en inglés: sus rótulos también. */
const EN_INGLES = new Set<Asignatura>(['science', 'english', 'social']);

/**
 * La misma pregunta de test convertida en verdadero o falso: se afirma la
 * buena o una de las malas, y hay que decir cuál es. Si el enunciado tiene
 * huecos, se rellenan con la afirmación y queda una frase entera.
 */
function aVerdaderoFalso(q: Pregunta, rand: Rand, en: boolean): Pregunta {
  const malos = q.no.filter((x) => x !== q.ok);
  const verdadero = malos.length === 0 || rand() < 0.5;
  const dicho = verdadero ? q.ok : malos[Math.floor(rand() * malos.length)];
  let prompt = q.prompt;
  let afirmacion = dicho;
  if (prompt.includes('___')) {
    const partes = dicho.split(' / ');
    let k = 0;
    afirmacion = prompt.replace(/___/g, () => partes[Math.min(k++, partes.length - 1)]);
    prompt = en ? 'True or false?' : '¿Verdadero o falso?';
  }
  return {
    ...q,
    prompt,
    ok: verdadero ? (en ? 'True' : 'Verdadero') : en ? 'False' : 'Falso',
    no: [],
    why: verdadero ? q.why : `${en ? 'False: the right answer was' : 'Falso: la buena era'} «${q.ok}». ${q.why}`,
    juego: { tipo: 'vf', afirmacion, verdadero, en },
  };
}

/**
 * Las cinco preguntas de un reto. Deterministas: el mismo día, el mismo
 * niño y el mismo reto dan las mismas, en el mismo orden, se recargue lo
 * que se recargue.
 *
 * Se mezclan maneras de contestar: cada tema reparte sus fabricantes sin
 * repetir, y si aun así salen más de dos de test, las que sobran se pasan a
 * escribir la respuesta (si es un número) o a verdadero o falso.
 */
export function buildRetoCole(profileId: ProfileId, curso: Curso, date: DateKey, reto: RetoId = retoDelDia(date, profileId), vuelta = 0): RetoCole {
  const plan = planDelDia(profileId, date);
  // La vuelta 0 es el reto que puntúa; las demás, la práctica libre. El reto
  // que toca por calendario conserva la semilla de siempre.
  const deHoy = reto === retoDelDia(date, profileId);
  const seed = hashSeed(`${profileId}:cole:${date}${deHoy ? '' : `:${reto}`}${vuelta ? `:practica${vuelta}` : ''}`);
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
      ? (plan && plan.pendientes.length > 1 ? plan.pendientes.map((e) => e.asignatura) : ASIGNATURAS).map(temasDe)
      : [temasDe(reto)];
  const temas = grupos.flat();

  // Cada tema reparte sus fabricantes barajados y sin repetir hasta agotarlos.
  const colas = new Map<Tema, ((r: Rand) => Pregunta)[]>();
  const siguiente = (tema: Tema) => {
    let cola = colas.get(tema);
    if (!cola || cola.length === 0) {
      cola = barajar(tema.hacer, rand);
      colas.set(tema, cola);
    }
    return cola.shift()!;
  };

  const preguntas: { q: Pregunta; tema: Tema }[] = [];
  const vistas = new Set<string>();
  const porTipo = new Map<string, number>();
  for (let i = 0; preguntas.length < COLE_QUESTIONS && i < 80; i += 1) {
    const grupo = grupos[preguntas.length % grupos.length];
    const tema = grupo[Math.floor(rand() * grupo.length)];
    const q = siguiente(tema)(rand);
    // Sin repetir enunciado en la misma partida, ni más de dos del mismo juego.
    if (vistas.has(q.prompt)) continue;
    const tipo = q.juego?.tipo ?? 'test';
    if (tipo !== 'test' && (porTipo.get(tipo) ?? 0) >= 2 && i < 60) continue;
    vistas.add(q.prompt);
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
    preguntas.push({ q, tema });
  }

  // Variedad: de test, como mucho dos.
  let tests = 0;
  let vf = 0;
  const mezcladas = preguntas.map(({ q, tema }) => {
    if (q.juego) return q;
    tests += 1;
    if (tests <= 2) return q;
    if (/^[\d.]+$/.test(q.ok)) return { ...q, juego: { tipo: 'escribe' as const, teclado: 'numeros' as const } };
    if (vf < 2 && q.no.length > 0) {
      vf += 1;
      return aVerdaderoFalso(q, rand, EN_INGLES.has(tema.asignatura));
    }
    return q;
  });

  return {
    reto,
    date,
    curso,
    temas,
    plan,
    questions: mezcladas.map((q, i) => aQuestion(`cole-${date}-${reto}-${i}`, q, seed + i * 7919)),
  };
}

/* ---------------------------------------------------------------------------
 * Lo que se guarda: `reto|aciertos|contestadas|total|momento`, y si se han
 * jugado varios retos el mismo día, uno detrás de otro separados por `;`.
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

export type RetoResults = Partial<Record<RetoId, RetoResult>>;

/** Todos los retos anotados en una nota, por reto. */
export function parseRetoResults(text: string | undefined | null): RetoResults {
  const out: RetoResults = {};
  for (const trozo of (text ?? '').split(';')) {
    const r = parseRetoResult(trozo);
    if (r) out[r.reto] = r;
  }
  return out;
}

export function encodeRetoResults(results: RetoResults): string {
  return RETOS.map((reto) => results[reto])
    .filter((r): r is RetoResult => Boolean(r))
    .map(encodeRetoResult)
    .join(';');
}

export function resultadosDe(entries: Record<string, DayEntry>, profileId: ProfileId, date: DateKey): RetoResults {
  return parseRetoResults(entries[entryKey(profileId, date)]?.notes?.[COLE_NOTE_KEY]);
}

/** La nota del día con este resultado anotado, sin perder los demás retos. */
export function conResultado(entries: Record<string, DayEntry>, profileId: ProfileId, date: DateKey, r: RetoResult): string {
  return encodeRetoResults({ ...resultadosDe(entries, profileId, date), [r.reto]: r });
}

export function retoResultFor(entries: Record<string, DayEntry>, profileId: ProfileId, date: DateKey, reto: RetoId): RetoResult | null {
  return resultadosDe(entries, profileId, date)[reto] ?? null;
}

export function retoSuperado(r: RetoResult | null | undefined): boolean {
  return Boolean(r && r.answered >= r.total && r.correct >= COLE_PASS);
}

/** Los tiros del cole que se pueden tirar hoy: los de los retos ganados. */
export function tirosDelCole(entries: Record<string, DayEntry>, profileId: ProfileId, date: DateKey): ShotKind[] {
  const hoy = resultadosDe(entries, profileId, date);
  return RETOS.filter((reto) => retoSuperado(hoy[reto])).map((reto) => RETO_META[reto].tiro);
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
    if (retoSuperado(retoResultFor(entries, profileId, d, reto))) n += 1;
  }
  return n;
}

/** Nivel del tiro: 1 al ganarlo, 2 a las tres victorias, 3 a las seis. */
export function nivelDe(ganados: number): 0 | 1 | 2 | 3 {
  return ganados >= 6 ? 3 : ganados >= 3 ? 2 : ganados >= 1 ? 1 : 0;
}

/** El nivel de cada tiro del cole ese día, por tiro. */
export function nivelesDelCole(entries: Record<string, DayEntry>, profileId: ProfileId, date: DateKey): Partial<Record<ShotKind, number>> {
  const out: Partial<Record<ShotKind, number>> = {};
  for (const reto of RETOS) out[RETO_META[reto].tiro] = Math.max(1, nivelDe(victorias(entries, profileId, reto, date)));
  return out;
}

/** Lo que se le encoge el alcance a Benji por nivel, en puntos de portería. */
export const NIVEL_ALCANCE = 3;

export { temasHasta };
