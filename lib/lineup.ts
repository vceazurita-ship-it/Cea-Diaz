import type { CromoLine, Formation, Lineup, ProfileId } from '@/types';

/* =========================================================================
 *  Campograma: el equipo que cada uno monta con sus cromos.
 *
 *  El álbum no se guarda —se deduce del historial de retos—, pero esto sí:
 *  dónde ha decidido colocar cada cromo es una elección suya y no hay manera
 *  de recalcularla. Así que vive como los ajustes de la casa: una clave de
 *  `localStorage`, fechada, que la nube reconcilia con la regla de siempre
 *  —gana la última escritura— para que el equipo se vea igual en el móvil,
 *  en la tableta y en el ordenador.
 *
 *  Las formaciones son catálogo editable, como los hábitos o los cromos:
 *  añadir un 4-1-4-1 es añadir un objeto a `FORMATIONS`. Las coordenadas van
 *  en tanto por ciento del campo, nunca en píxeles, para que el dibujo valga
 *  en cualquier pantalla.
 * ========================================================================= */

export const LINEUP_KEY = 'habitos-familia:alineaciones';

/**
 * Marca de la alineación que nadie ha tocado. Cualquier cambio real es más
 * reciente, así que un aparato recién estrenado adopta el equipo de la nube
 * en vez de imponer su campo vacío.
 */
const NEVER = '1970-01-01T00:00:00.000Z';

/** Cuántos suplentes caben. Más que esto y la plantilla deja de leerse. */
export const MAX_BENCH = 12;

/* ---------------------------------------------------------------------------
 * Formaciones
 * ------------------------------------------------------------------------- */

/** Nombre largo de cada línea, para los rótulos y las etiquetas de lectura. */
export const LINE_LABEL: Record<CromoLine, string> = {
  por: 'Portería',
  def: 'Defensa',
  med: 'Centro del campo',
  del: 'Ataque',
};

/** Emoji de cada línea: sirve de pista en la lista de cromos disponibles. */
export const LINE_ICON: Record<CromoLine, string> = {
  por: '🧤',
  def: '🛡️',
  med: '🧭',
  del: '🎯',
};

export const FORMATIONS: Formation[] = [
  {
    id: '4-3-3',
    name: '4-3-3',
    detail: 'Tres arriba y las bandas bien abiertas. La de atacar.',
    slots: [
      { id: 'por', line: 'por', label: 'POR', x: 50, y: 6 },
      { id: 'li', line: 'def', label: 'LI', x: 13, y: 26 },
      { id: 'dfc-i', line: 'def', label: 'DFC', x: 37, y: 21 },
      { id: 'dfc-d', line: 'def', label: 'DFC', x: 63, y: 21 },
      { id: 'ld', line: 'def', label: 'LD', x: 87, y: 26 },
      { id: 'mc', line: 'med', label: 'MC', x: 50, y: 43 },
      { id: 'mc-i', line: 'med', label: 'MI', x: 27, y: 51 },
      { id: 'mc-d', line: 'med', label: 'MD', x: 73, y: 51 },
      { id: 'ei', line: 'del', label: 'EI', x: 16, y: 77 },
      { id: 'dc', line: 'del', label: 'DC', x: 50, y: 86 },
      { id: 'ed', line: 'del', label: 'ED', x: 84, y: 77 },
    ],
  },
  {
    id: '4-4-2',
    name: '4-4-2',
    detail: 'Dos puntas y cuatro en línea. La de toda la vida.',
    slots: [
      { id: 'por', line: 'por', label: 'POR', x: 50, y: 6 },
      { id: 'li', line: 'def', label: 'LI', x: 13, y: 26 },
      { id: 'dfc-i', line: 'def', label: 'DFC', x: 37, y: 21 },
      { id: 'dfc-d', line: 'def', label: 'DFC', x: 63, y: 21 },
      { id: 'ld', line: 'def', label: 'LD', x: 87, y: 26 },
      { id: 'mi', line: 'med', label: 'MI', x: 13, y: 53 },
      { id: 'mc-i', line: 'med', label: 'MC', x: 38, y: 47 },
      { id: 'mc-d', line: 'med', label: 'MC', x: 62, y: 47 },
      { id: 'md', line: 'med', label: 'MD', x: 87, y: 53 },
      { id: 'dc-i', line: 'del', label: 'DC', x: 36, y: 83 },
      { id: 'dc-d', line: 'del', label: 'DC', x: 64, y: 83 },
    ],
  },
  {
    id: '4-2-3-1',
    name: '4-2-3-1',
    detail: 'Dos que tapan, tres que crean y un nueve. La de controlar.',
    slots: [
      { id: 'por', line: 'por', label: 'POR', x: 50, y: 6 },
      { id: 'li', line: 'def', label: 'LI', x: 13, y: 26 },
      { id: 'dfc-i', line: 'def', label: 'DFC', x: 37, y: 21 },
      { id: 'dfc-d', line: 'def', label: 'DFC', x: 63, y: 21 },
      { id: 'ld', line: 'def', label: 'LD', x: 87, y: 26 },
      { id: 'mc-i', line: 'med', label: 'MC', x: 36, y: 39 },
      { id: 'mc-d', line: 'med', label: 'MC', x: 64, y: 39 },
      { id: 'ei', line: 'med', label: 'EI', x: 15, y: 64 },
      { id: 'mp', line: 'med', label: 'MP', x: 50, y: 65 },
      { id: 'ed', line: 'med', label: 'ED', x: 85, y: 64 },
      { id: 'dc', line: 'del', label: 'DC', x: 50, y: 88 },
    ],
  },
  {
    id: '3-5-2',
    name: '3-5-2',
    detail: 'Tres atrás, carrileros arriba y dos puntas. La valiente.',
    slots: [
      { id: 'por', line: 'por', label: 'POR', x: 50, y: 6 },
      { id: 'dfc-i', line: 'def', label: 'DFC', x: 26, y: 22 },
      { id: 'dfc', line: 'def', label: 'DFC', x: 50, y: 18 },
      { id: 'dfc-d', line: 'def', label: 'DFC', x: 74, y: 22 },
      { id: 'ci', line: 'med', label: 'CI', x: 10, y: 52 },
      { id: 'mc-i', line: 'med', label: 'MC', x: 32, y: 46 },
      { id: 'mc', line: 'med', label: 'MC', x: 50, y: 39 },
      { id: 'mc-d', line: 'med', label: 'MC', x: 68, y: 46 },
      { id: 'cd', line: 'med', label: 'CD', x: 90, y: 52 },
      { id: 'dc-i', line: 'del', label: 'DC', x: 36, y: 84 },
      { id: 'dc-d', line: 'del', label: 'DC', x: 64, y: 84 },
    ],
  },
];

export const DEFAULT_FORMATION = FORMATIONS[0].id;

/** La formación pedida, o la de fábrica si la guardada ya no existe. */
export function formationOf(id: string): Formation {
  return FORMATIONS.find((formation) => formation.id === id) ?? FORMATIONS[0];
}

/* ---------------------------------------------------------------------------
 * Lectura y escritura
 * ------------------------------------------------------------------------- */

export function defaultLineup(): Lineup {
  return {
    teamName: '',
    formation: DEFAULT_FORMATION,
    eleven: {},
    bench: [],
    updatedAt: NEVER,
  };
}

let cache: Record<string, Lineup> | null = null;
const listeners = new Set<() => void>();

/** Deja pasar sólo lo que tiene forma de alineación; lo demás vuelve a cero. */
function normalize(value: unknown): Lineup {
  const base = defaultLineup();
  if (!value || typeof value !== 'object') return base;

  const raw = value as Partial<Lineup>;
  const eleven: Record<string, string> = {};

  if (raw.eleven && typeof raw.eleven === 'object') {
    for (const [slot, cromo] of Object.entries(raw.eleven)) {
      if (typeof cromo === 'string' && cromo) eleven[slot] = cromo;
    }
  }

  const bench = Array.isArray(raw.bench)
    ? raw.bench.filter((id): id is string => typeof id === 'string' && !!id).slice(0, MAX_BENCH)
    : [];

  return {
    teamName: typeof raw.teamName === 'string' ? raw.teamName.slice(0, 40) : base.teamName,
    formation: typeof raw.formation === 'string' ? raw.formation : base.formation,
    eleven,
    bench,
    captain: typeof raw.captain === 'string' && raw.captain ? raw.captain : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
  };
}

export function loadLineups(): Record<string, Lineup> {
  if (cache) return cache;
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(LINEUP_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, Lineup> = {};

    for (const [profileId, value] of Object.entries(parsed ?? {})) {
      out[profileId] = normalize(value);
    }

    cache = out;
  } catch {
    // Datos corruptos: mejor empezar con el campo vacío que romper el panel.
    cache = {};
  }

  return cache;
}

/** El equipo de ese perfil, o uno vacío si todavía no ha montado ninguno. */
export function lineupOf(profileId: ProfileId): Lineup {
  return loadLineups()[profileId] ?? defaultLineup();
}

function commit(next: Record<string, Lineup>): void {
  cache = next;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LINEUP_KEY, JSON.stringify(next));
    } catch {
      // Cuota llena o modo privado: vale para esta sesión. Un equipo que no
      // se recuerda molesta, pero no es un registro perdido.
    }
  }

  for (const listener of listeners) listener();
}

/**
 * Cambia el equipo de un perfil en este aparato y lo fecha: eso es lo que lo
 * hace viajar al resto.
 */
export function updateLineup(
  profileId: ProfileId,
  patch: Partial<Omit<Lineup, 'updatedAt'>>,
): Lineup {
  const next: Lineup = {
    ...lineupOf(profileId),
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  commit({ ...loadLineups(), [profileId]: next });
  return next;
}

/** Adopta lo que venía de la nube. No se refecha: la elección es de quien la hizo. */
export function applyRemoteLineups(remote: Record<string, Lineup>): void {
  const merged = { ...loadLineups() };
  let changed = false;

  for (const [profileId, lineup] of Object.entries(remote)) {
    const mine = merged[profileId];
    const theirs = normalize(lineup);
    if (mine && Date.parse(mine.updatedAt) >= Date.parse(theirs.updatedAt)) continue;
    merged[profileId] = theirs;
    changed = true;
  }

  if (changed) commit(merged);
}

/** Avisa cuando cambia un equipo, venga de este aparato o de otro. */
export function subscribeLineups(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ---------------------------------------------------------------------------
 * Movimientos
 *
 * Funciones puras que devuelven el parche que hay que guardar. La regla que
 * las gobierna a todas: **un cromo sólo puede estar en un sitio**. Si entra
 * al once, sale del banquillo; si entra en una ranura ocupada, el que estaba
 * se va al banquillo en vez de desaparecer.
 * ------------------------------------------------------------------------- */

type Patch = Partial<Omit<Lineup, 'updatedAt'>>;

const withoutCromo = (bench: string[], cromoId: string) => bench.filter((id) => id !== cromoId);

/** Añade al banquillo si cabe y si no estaba ya. */
function pushBench(bench: string[], cromoId: string): string[] {
  if (bench.includes(cromoId)) return bench;
  return bench.length >= MAX_BENCH ? bench : [...bench, cromoId];
}

/** Coloca un cromo en una ranura del once. */
export function placeInSlot(lineup: Lineup, slotId: string, cromoId: string): Patch {
  const eleven: Record<string, string> = {};

  // El cromo puede venir de otra ranura: se vacía la de origen.
  for (const [slot, id] of Object.entries(lineup.eleven)) {
    if (id !== cromoId) eleven[slot] = id;
  }

  const displaced = lineup.eleven[slotId];
  eleven[slotId] = cromoId;

  let bench = withoutCromo(lineup.bench, cromoId);
  // El que ocupaba el sitio no se pierde: se sienta en el banquillo.
  if (displaced && displaced !== cromoId) bench = pushBench(bench, displaced);

  return { eleven, bench };
}

/** Saca del campo el cromo de una ranura y lo sienta en el banquillo. */
export function benchSlot(lineup: Lineup, slotId: string): Patch {
  const cromoId = lineup.eleven[slotId];
  if (!cromoId) return {};

  const eleven = { ...lineup.eleven };
  delete eleven[slotId];

  return { eleven, bench: pushBench(lineup.bench, cromoId) };
}

/** Mete un cromo en la plantilla sin darle sitio en el campo. */
export function addToBench(lineup: Lineup, cromoId: string): Patch {
  const eleven: Record<string, string> = {};
  for (const [slot, id] of Object.entries(lineup.eleven)) {
    if (id !== cromoId) eleven[slot] = id;
  }

  return { eleven, bench: pushBench(lineup.bench, cromoId) };
}

/** Lo devuelve al álbum: fuera del campo y fuera de la plantilla. */
export function releaseCromo(lineup: Lineup, cromoId: string): Patch {
  const eleven: Record<string, string> = {};
  for (const [slot, id] of Object.entries(lineup.eleven)) {
    if (id !== cromoId) eleven[slot] = id;
  }

  return {
    eleven,
    bench: withoutCromo(lineup.bench, cromoId),
    captain: lineup.captain === cromoId ? undefined : lineup.captain,
  };
}

/**
 * Cambia de formación conservando lo posible: cada cromo se queda si su nueva
 * ranura admite su línea, y si no baja al banquillo. Cambiar de dibujo no
 * debería costar volver a montar el equipo entero.
 */
export function switchFormation(
  lineup: Lineup,
  formationId: string,
  lineOf: (cromoId: string) => CromoLine | null,
): Patch {
  const before = formationOf(lineup.formation);
  const after = formationOf(formationId);

  const eleven: Record<string, string> = {};
  let bench = [...lineup.bench];

  // Primero los que caen en una ranura del mismo nombre; luego los demás, al
  // primer hueco libre de su línea.
  const pending: string[] = [];

  for (const slot of before.slots) {
    const cromoId = lineup.eleven[slot.id];
    if (!cromoId) continue;

    const same = after.slots.find((next) => next.id === slot.id);
    if (same && lineOf(cromoId) === same.line && !eleven[same.id]) {
      eleven[same.id] = cromoId;
    } else {
      pending.push(cromoId);
    }
  }

  for (const cromoId of pending) {
    const line = lineOf(cromoId);
    const free = after.slots.find((slot) => slot.line === line && !eleven[slot.id]);
    if (free) eleven[free.id] = cromoId;
    else bench = pushBench(bench, cromoId);
  }

  return { formation: after.id, eleven, bench };
}
