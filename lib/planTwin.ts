import { findMetric } from '@/lib/habits';
import { blockLinks, planOf, updatePlan, withLinks } from '@/lib/planner';
import { PROFILES } from '@/lib/profiles';
import type { PlanBlock, ProfileId } from '@/types';

/* =========================================================================
 *  La semana del hermano.
 *
 *  Leo y Hugo hacen casi la misma semana. El mismo cole a la misma hora, la
 *  misma cena, el mismo campo casi todas las tardes; lo que cambia son dos
 *  cosas —la natación de uno, el kárate del otro— y poco más. Hasta ahora la
 *  app sabía copiar la semana entera de golpe, y ahí se acababa: a partir de
 *  la copia eran dos agendas sueltas. Se adelantaba la cena media hora en la
 *  de Leo y la de Hugo seguía a la de antes; a las dos semanas ya no se
 *  parecían, y volver a copiarla entera borraba lo propio de cada uno.
 *
 *  Lo que faltaba no era copiar mejor: era **preguntar**. Cada vez que se
 *  cambia un rato en la semana de uno de los dos, aquí se calcula qué le
 *  pasaría al otro y se ofrece hacerlo también. Decide quien está delante, y
 *  puede decir «siempre» o «nunca» para no tener que decidirlo otras cien
 *  veces.
 *
 *  El hilo que lo sostiene es `twin`: una marca que llevan los dos ratos —el
 *  de Leo y el de Hugo— para poder decir «éste y aquél son el mismo entreno».
 *  Sin ella habría que adivinar por el nombre, que es lo que se hace aquí
 *  sólo la primera vez, para adoptar lo que ya estaba montado a mano antes de
 *  que existiera nada de esto.
 * ========================================================================= */

/** Los pares de agendas hermanadas. Hoy sólo hay uno, y con eso basta. */
const TWINS: Partial<Record<ProfileId, ProfileId>> = {
  leo: 'hugo',
  hugo: 'leo',
};

/** El hermano de este perfil, si lo tiene. */
export function twinOf(profileId: ProfileId): ProfileId | null {
  return TWINS[profileId] ?? null;
}

/** Cómo se llama, para poder decirlo en alto. */
export function twinName(profileId: ProfileId): string {
  return PROFILES.find((item) => item.id === profileId)?.name ?? 'el hermano';
}

/* ---------------------------------------------------------------------------
 * Qué hacer cada vez: preguntar, hacerlo siempre, o no hacerlo
 * ------------------------------------------------------------------------- */

/**
 *  · `preguntar` — lo de siempre: se ofrece y decide quien está delante.
 *  · `siempre`   — se replica sin preguntar, y se dice en el aviso.
 *  · `nunca`     — no se ofrece; las dos semanas van por su cuenta.
 */
export type ReplicaMode = 'preguntar' | 'siempre' | 'nunca';

const MODE_KEY = 'habitos-familia:agenda-replica';
const MODES = new Set<ReplicaMode>(['preguntar', 'siempre', 'nunca']);

/** Qué se hace con los cambios de la semana de este perfil. */
export function replicaMode(profileId: ProfileId): ReplicaMode {
  if (typeof window === 'undefined') return 'preguntar';
  try {
    const raw = window.localStorage.getItem(`${MODE_KEY}:${profileId}`);
    return raw && MODES.has(raw as ReplicaMode) ? (raw as ReplicaMode) : 'preguntar';
  } catch {
    return 'preguntar';
  }
}

export function setReplicaMode(profileId: ProfileId, mode: ReplicaMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${MODE_KEY}:${profileId}`, mode);
  } catch {
    // Sin almacenamiento se vuelve a preguntar la próxima vez, que es lo
    // seguro: nadie se queda con una réplica silenciosa que no pidió.
  }
}

/* ---------------------------------------------------------------------------
 * Emparejar los ratos de las dos agendas
 * ------------------------------------------------------------------------- */

function newTwinId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `t-${crypto.randomUUID()}`;
  }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Nombre comparable: sin mayúsculas, sin acentos y sin espacios de más. */
function titleKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * El rato del hermano que se corresponde con éste.
 *
 * Primero por la marca, que es la respuesta buena. Y si no la hay —la semana
 * de Hugo se montó a mano hace meses—, por el nombre y el día, que es como lo
 * emparejaría cualquiera mirando las dos pantallas. Ese segundo camino sólo
 * sirve para **adoptar**: en cuanto se replica una vez, los dos ratos quedan
 * marcados y el nombre deja de hacer falta.
 */
function findTwin(block: PlanBlock, blocks: PlanBlock[]): PlanBlock | undefined {
  if (block.twin) {
    const marked = blocks.find((item) => item.twin === block.twin);
    if (marked) return marked;
  }

  const key = titleKey(block.title);
  if (!key) return undefined;

  return blocks.find(
    (item) => !item.twin && item.day === block.day && titleKey(item.title) === key,
  );
}

/** El rato con sólo los hábitos que el hermano también tiene en su registro. */
function linksFor(profileId: ProfileId, block: PlanBlock): PlanBlock {
  const kept = blockLinks(block).filter((link) => Boolean(findMetric(profileId, link.metricId)));
  return withLinks(block, kept);
}

/**
 * El rato del hermano puesto igual que éste, conservando lo suyo: su
 * identificador, para no romper nada que lo esté apuntando, y lo que es sólo
 * suyo —con quién está, la nota—, que no tiene por qué coincidir: a uno lo
 * lleva mamá y al otro papá.
 */
function alignedTo(source: PlanBlock, target: PlanBlock, to: ProfileId): PlanBlock {
  const shaped = linksFor(to, source);

  return {
    ...shaped,
    id: target.id,
    twin: source.twin ?? target.twin,
    companion: target.companion ?? shaped.companion,
    note: target.note ?? shaped.note,
    mirror: undefined,
  };
}

/* ---------------------------------------------------------------------------
 * El cambio, y lo que costaría repetirlo enfrente
 * ------------------------------------------------------------------------- */

/** Un cambio de la agenda, en la forma en que se puede repetir en la otra. */
export interface PlanChange {
  /** Ratos que se han creado o cambiado. */
  upsert?: PlanBlock[];
  /** Ratos que se han quitado. */
  remove?: PlanBlock[];
  /** Cómo se dice en alto: «la cena del martes», «3 ratos». */
  what: string;
}

/** Qué le pasaría a la semana del hermano. Es lo que enseña la pregunta. */
export interface ReplicaPreview {
  /** Ratos que se crearían allí porque no tiene nada parecido. */
  added: number;
  /** Ratos suyos que se pondrían igual que éstos. */
  changed: number;
  /** Ratos suyos que se quitarían. */
  removed: number;
  /** Hábitos que aquí van atados y allí no existen. */
  unlinked: number;
  /** `true` cuando no habría nada que hacer. */
  empty: boolean;
}

export function previewReplica(
  from: ProfileId,
  to: ProfileId,
  change: PlanChange,
): ReplicaPreview {
  const theirs = planOf(to).blocks;
  let added = 0;
  let changed = 0;
  let removed = 0;
  let unlinked = 0;

  for (const block of change.upsert ?? []) {
    if (findTwin(block, theirs)) changed += 1;
    else added += 1;

    unlinked += blockLinks(block).filter((link) => !findMetric(to, link.metricId)).length;
  }

  for (const block of change.remove ?? []) {
    if (findTwin(block, theirs)) removed += 1;
  }

  return { added, changed, removed, unlinked, empty: added + changed + removed === 0 };
}

/** Lo que la réplica ha dejado hecho, para poder contarlo en el aviso. */
export interface ReplicaResult extends ReplicaPreview {
  /** La agenda del hermano tal y como estaba, por si hay que deshacer. */
  before: PlanBlock[];
}

/**
 * Repite el cambio en la semana del hermano.
 *
 * Deja marcados los dos ratos —el de aquí y el de allí— con el mismo
 * hermanamiento, que es lo que hace que el siguiente cambio ya no tenga que
 * adivinar nada por el nombre. Por eso toca también la agenda de origen, y
 * por eso escribe cada una una sola vez.
 */
export function replicate(from: ProfileId, to: ProfileId, change: PlanChange): ReplicaResult {
  const before = planOf(to).blocks;
  const preview = previewReplica(from, to, change);
  if (preview.empty) return { ...preview, before };

  let theirs = [...before];
  let mine = [...planOf(from).blocks];
  let stamped = false;

  for (const block of change.upsert ?? []) {
    // El hermanamiento se inventa aquí, la primera vez que un rato se
    // replica: antes de eso no hacía falta y no lo llevaba nadie.
    let source = block;
    if (!source.twin) {
      source = { ...source, twin: newTwinId() };
      mine = mine.map((item) => (item.id === source.id ? source : item));
      stamped = true;
    }

    const twin = findTwin(source, theirs);

    if (twin) {
      const next = alignedTo(source, twin, to);
      theirs = theirs.map((item) => (item.id === twin.id ? next : item));
    } else {
      theirs = [
        ...theirs,
        { ...linksFor(to, source), id: `${source.id}-${to}`, twin: source.twin, mirror: undefined },
      ];
    }
  }

  for (const block of change.remove ?? []) {
    const twin = findTwin(block, theirs);
    if (twin) theirs = theirs.filter((item) => item.id !== twin.id);
  }

  if (stamped) updatePlan(from, mine);
  updatePlan(to, theirs);

  return { ...preview, before };
}

/**
 * Hermana las dos semanas de arriba abajo: lo que se parece se empareja, lo
 * que falta se crea y lo que sólo tiene el otro se queda donde está. Es lo
 * que se ofrece cuando las dos agendas ya existían y nunca se habían hablado.
 */
export function syncWeeks(from: ProfileId, to: ProfileId): ReplicaResult {
  return replicate(from, to, { upsert: planOf(from).blocks, what: 'la semana entera' });
}

/** Cuántos ratos de esta semana están hermanados con los del otro. */
export function twinCount(profileId: ProfileId): number {
  const other = twinOf(profileId);
  if (!other) return 0;

  const theirs = new Set(
    planOf(other)
      .blocks.map((block) => block.twin)
      .filter((twin): twin is string => Boolean(twin)),
  );

  return planOf(profileId).blocks.filter((block) => block.twin && theirs.has(block.twin)).length;
}
