import {
  cortadoHasta,
  FootbarError,
  mergeInto,
  recentSessions,
  refreshTokens,
  seal,
  sessionDetail,
  sessionPage,
  toGps,
  unseal,
  type Cuenta,
  type FootbarTokens,
} from '@/lib/footbar';
import { PROFILES_BY_ID } from '@/lib/profiles';
import { admin } from '@/lib/supabaseAdmin';
import type { GpsSession, ProfileId } from '@/types';

/* =========================================================================
 *  Footbar ↔ la libreta del GPS, en el servidor.
 *
 *  **Dónde se guarda el permiso.** En `calendar_links`, la misma tabla que
 *  los permisos de Google Calendar, y no en una nueva: es la que ya está
 *  blindada —RLS sin ninguna política, sólo la toca la clave de servicio— y
 *  así conectar Footbar no obliga a tocar la base. Sus filas se distinguen
 *  por `calendar_id = 'footbar'` y por un `profile_id` con prefijo
 *  (`footbar:leo`), y `lib/calendarLinks.ts` las aparta al listar calendarios.
 *  En `email` va el número de usuario de Footbar, que es por lo que llegan
 *  sus avisos; en `refresh_token`, el permiso cifrado, y en `checked_at`, la
 *  última revisión.
 *
 *  **Dónde caen las sesiones.** En la tabla `gps`, en la fila de ese peque:
 *  la misma que escriben los móviles. Se mezclan sesión a sesión con
 *  `mergeInto` y se sube la fecha de la libreta, que es lo que hace que los
 *  móviles las bajen en su siguiente sincronización.
 * ========================================================================= */

const TABLE = 'calendar_links';
const KIND = 'footbar';

interface LinkRow {
  id: string;
  owner: string;
  profile_id: string;
  email: string;
  refresh_token: string;
  /** En las filas de Footbar, el estado del cupo y del historial en JSON: ver `leerEstado`. */
  calendar_name: string;
  broken: boolean;
  checked_at: string | null;
  connected_at: string;
}

/** Lo que se le enseña al navegador de un enlace: nada de permisos. */
export interface FootbarLinkView {
  profileId: ProfileId;
  connectedAt: string;
  lastSync?: string;
  needsReconnect: boolean;
  /** Cómo va el historial: las que ya están en casa de las que dice Footbar que tiene. */
  historial?: { tengo: number; total?: number; completo: boolean };
}

const rowId = (owner: string, profileId: string) => `${owner}:${KIND}:${profileId}`;
const profileOf = (row: LinkRow) => row.profile_id.replace(`${KIND}:`, '') as ProfileId;

function view(row: LinkRow): FootbarLinkView {
  return {
    profileId: profileOf(row),
    connectedAt: row.connected_at,
    lastSync: row.checked_at ?? undefined,
    needsReconnect: row.broken === true,
  };
}

function service() {
  const client = admin();
  if (!client) throw new FootbarError('Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.');
  return client;
}

export async function listFootbarLinks(owner: string): Promise<FootbarLinkView[]> {
  const { data, error } = await service().from(TABLE).select('*').eq('owner', owner).eq('calendar_id', KIND);
  if (error) throw new Error(error.message);
  return Promise.all(
    ((data ?? []) as LinkRow[]).map(async (row) => {
      const estado = leerEstado(row);
      const { sessions } = await readBook(owner, profileOf(row)).catch(() => ({ sessions: [] as GpsSession[] }));
      const tengo = sessions.filter((item) => item.footbarId !== undefined).length + estado.vacias.length;
      return { ...view(row), historial: { tengo, total: estado.total, completo: estado.completo } };
    }),
  );
}

async function allRows(): Promise<LinkRow[]> {
  const { data, error } = await service().from(TABLE).select('*').eq('calendar_id', KIND);
  if (error) throw new Error(error.message);
  return (data ?? []) as LinkRow[];
}

async function findRow(owner: string, profileId: string): Promise<LinkRow | null> {
  const { data, error } = await service().from(TABLE).select('*').eq('id', rowId(owner, profileId)).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LinkRow | null) ?? null;
}

/** Los enlaces de un usuario de Footbar: por ahí llegan sus avisos. */
export async function rowsForFootbarUser(userId: number): Promise<LinkRow[]> {
  const { data, error } = await service()
    .from(TABLE)
    .select('*')
    .eq('calendar_id', KIND)
    .eq('email', String(userId));
  if (error) throw new Error(error.message);
  return (data ?? []) as LinkRow[];
}

export async function saveFootbarLink(owner: string, profileId: ProfileId, tokens: FootbarTokens): Promise<void> {
  const now = new Date().toISOString();
  // Volver a conectar no borra lo gastado del cupo ni por dónde iba el historial.
  const antes = await findRow(owner, profileId);
  const { error } = await service()
    .from(TABLE)
    .upsert({
      id: rowId(owner, profileId),
      owner,
      profile_id: `${KIND}:${profileId}`,
      email: String(tokens.userId),
      calendar_id: KIND,
      calendar_name: antes?.calendar_name ?? 'Footbar',
      refresh_token: seal(JSON.stringify(tokens)),
      broken: false,
      connected_at: now,
      updated_at: now,
    });
  if (error) throw new Error(error.message);
}

export async function dropFootbarLink(owner: string, profileId: ProfileId): Promise<void> {
  const { error } = await service().from(TABLE).delete().eq('id', rowId(owner, profileId));
  if (error) throw new Error(error.message);
}

async function patchRow(row: LinkRow, patch: Partial<LinkRow>): Promise<void> {
  const { error } = await service()
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) throw new Error(error.message);
}

/**
 * Un permiso de acceso válido para ese enlace. Se reutiliza el guardado
 * mientras dure; sólo se renueva al caducar, y el nuevo par se guarda antes
 * de hacer nada más, porque el de refresco viejo ya no sirve.
 */
async function accessFor(row: LinkRow): Promise<string> {
  const raw = unseal(row.refresh_token);
  if (!raw) {
    await patchRow(row, { broken: true });
    throw new FootbarError('El permiso guardado no se puede leer: hay que volver a conectar.', 0, true);
  }

  const tokens = JSON.parse(raw) as FootbarTokens;
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.access;

  try {
    const fresh = await refreshTokens(tokens);
    await patchRow(row, { refresh_token: seal(JSON.stringify(fresh)), broken: false });
    return fresh.access;
  } catch (problem) {
    if (problem instanceof FootbarError && problem.revoked) await patchRow(row, { broken: true });
    throw problem;
  }
}

/* ---------------------------------------------------------------------------
 * La libreta del GPS en la nube
 * ------------------------------------------------------------------------- */

interface GpsRow {
  sessions: GpsSession[] | null;
  removed: Record<string, string> | null;
}

async function readBook(owner: string, profileId: ProfileId) {
  const { data, error } = await service()
    .from('gps')
    .select('sessions, removed')
    .eq('id', `${owner}:${profileId}`)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as GpsRow | null;
  return { sessions: row?.sessions ?? [], removed: row?.removed ?? {} };
}

async function writeBook(
  owner: string,
  profileId: ProfileId,
  sessions: GpsSession[],
  removed: Record<string, string>,
): Promise<void> {
  const { error } = await service().from('gps').upsert({
    id: `${owner}:${profileId}`,
    owner,
    profile_id: profileId,
    sessions,
    removed,
    // La fecha de la libreta sube: es lo que hace que los móviles la bajen.
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/* ---------------------------------------------------------------------------
 * Revisar
 * ------------------------------------------------------------------------- */

export interface SyncOutcome {
  profileId: ProfileId;
  added: number;
  updated: number;
  error?: string;
  needsReconnect?: boolean;
  /** Footbar ha dicho que basta por esta semana. */
  throttled?: boolean;
}

/* ---------------------------------------------------------------------------
 * El cupo y el historial
 *
 * Footbar deja 100 consultas a la semana para toda la app. Para ponerse al
 * día con todo el historial sin quedarse sin consultas para lo nuevo:
 *
 *  · **Cada consulta se apunta**, con su momento, en el estado del enlace
 *    del peque que la gastó. Lo gastado en la semana es la suma de los dos.
 *  · **Primero lo nuevo**: la lista reciente y el detalle de lo que falte.
 *  · **Luego el historial**, página a página, con un marcador que sigue
 *    donde se quedó la vez anterior. Pero sólo mientras queden más de
 *    `RESERVA` consultas en la semana: ésas son para los entrenos nuevos.
 *  · **Si Footbar corta**, se apunta hasta cuándo y hasta entonces no se le
 *    pregunta nada: preguntar en balde no adelanta.
 *  · Una sesión que Footbar da sin datos se apunta para no pedirla otra vez.
 *
 * El estado va en `calendar_name` de la fila del enlace, en JSON: es una
 * columna de texto que las filas de Footbar no usaban para nada, y así no
 * hay que tocar la base.
 * ------------------------------------------------------------------------- */

const CUPO_SEMANA = 100;
/** Consultas que se dejan sin gastar por si la cuenta de Footbar y la nuestra no casan del todo. */
const MARGEN = 5;
/** Las que se guardan para los entrenos nuevos: el historial no las toca. */
const RESERVA = 30;
/** Consultas como mucho en una revisión de un peque: que la función acabe antes de que Vercel la corte. */
const MAX_POR_VUELTA = 24;
const SEMANA_MS = 7 * 24 * 3600 * 1000;

interface Estado {
  /** Momentos (ms) de las consultas gastadas por este enlace en los últimos siete días. */
  consultas: number[];
  /** Footbar ha cortado hasta aquí (ms). */
  cortadoHasta?: number;
  /** La página del historial por la que va el repaso, desde la 1. */
  pagina: number;
  /** El historial entero ya está en casa. */
  completo: boolean;
  /** Cuándo se acabó el último repaso entero (ms): se vuelve a repasar como mucho una vez a la semana. */
  repasadoEn?: number;
  /** Sesiones que Footbar da sin datos útiles: no se vuelven a pedir. */
  vacias: number[];
  /** Cuántas sesiones dice Footbar que tiene. */
  total?: number;
}

function leerEstado(row: LinkRow): Estado {
  const base: Estado = { consultas: [], pagina: 1, completo: false, vacias: [] };
  try {
    const data = JSON.parse(row.calendar_name || '{}') as Partial<Estado>;
    return {
      consultas: Array.isArray(data.consultas) ? data.consultas.filter((n) => typeof n === 'number') : [],
      cortadoHasta: typeof data.cortadoHasta === 'number' ? data.cortadoHasta : undefined,
      pagina: Math.max(1, Number(data.pagina) || 1),
      completo: data.completo === true,
      repasadoEn: typeof data.repasadoEn === 'number' ? data.repasadoEn : undefined,
      vacias: Array.isArray(data.vacias) ? data.vacias.filter((n) => typeof n === 'number') : [],
      total: typeof data.total === 'number' ? data.total : undefined,
    };
  } catch {
    // Las filas de antes llevan aquí «Footbar»: se empieza de cero.
    return base;
  }
}

/** Lo gastado de la semana en toda la app, y si Footbar tiene cortado. */
export async function cupoFootbar(): Promise<{ usadas: number; libres: number; cortadoHasta?: number }> {
  const ahora = Date.now();
  let usadas = 0;
  let cortadoHasta: number | undefined;
  for (const row of await allRows()) {
    const e = leerEstado(row);
    usadas += e.consultas.filter((t) => ahora - t < SEMANA_MS).length;
    if (e.cortadoHasta && e.cortadoHasta > ahora) cortadoHasta = Math.max(cortadoHasta ?? 0, e.cortadoHasta);
  }
  return { usadas, libres: Math.max(0, CUPO_SEMANA - MARGEN - usadas), cortadoHasta };
}

async function syncRow(
  row: LinkRow,
  only?: { sessionId: number; destroy?: boolean },
): Promise<SyncOutcome> {
  const profileId = profileOf(row);
  const outcome: SyncOutcome = { profileId, added: 0, updated: 0 };
  if (!(profileId in PROFILES_BY_ID)) return { ...outcome, error: 'Perfil desconocido.' };

  const estado = leerEstado(row);
  const cuenta: Cuenta = { momentos: [] };
  const guardarEstado = async (extra: Partial<LinkRow> = {}) => {
    const ahora = Date.now();
    estado.consultas = [...estado.consultas, ...cuenta.momentos].filter((t) => ahora - t < SEMANA_MS);
    cuenta.momentos = [];
    await patchRow(row, { ...extra, calendar_name: JSON.stringify(estado) });
  };

  try {
    const cupo = await cupoFootbar();
    if (cupo.cortadoHasta) {
      // Borrar una sesión no gasta: eso sí se hace aunque Footbar tenga cortado.
      if (!only?.destroy) return { ...outcome, error: cortadoHasta(cupo.cortadoHasta), throttled: true };
    }
    /** Si aún se puede gastar una consulta, dejando `reserva` sin tocar. */
    const puede = (reserva: number) =>
      cuenta.momentos.length < MAX_POR_VUELTA && cupo.libres - cuenta.momentos.length > reserva;

    const book = await readBook(row.owner, profileId);
    let { sessions } = book;
    let removed = { ...book.removed };
    let changed = false;
    let halted: unknown;
    const now = new Date().toISOString();
    const tengo = () =>
      new Set<number>([
        ...sessions.map((item) => item.footbarId).filter((id): id is number => id !== undefined),
        ...Object.keys(removed)
          .filter((key) => key.startsWith('footbar-'))
          .map((key) => Number(key.slice(8))),
        ...estado.vacias,
      ]);

    /** Trae el detalle de una sesión y lo mezcla en la libreta. `false` si Footbar ha dicho basta. */
    const traer = async (access: string, id: number): Promise<boolean> => {
      let detail;
      try {
        detail = await sessionDetail(access, id, cuenta);
      } catch (problem) {
        if (problem instanceof FootbarError && problem.status === 404) {
          estado.vacias.push(id);
          return true;
        }
        // Si Footbar corta a mitad (el cupo), lo que ya ha llegado se
        // guarda: cada detalle ha costado una consulta y no se repite.
        halted = problem;
        return false;
      }
      const incoming = toGps(detail, profileId, now);
      if (!incoming) {
        estado.vacias.push(id);
        return true;
      }
      const existed = sessions.some((item) => item.footbarId === id);
      const merged = mergeInto(sessions, removed, incoming);
      if (!merged.changed) return true;
      sessions = merged.sessions;
      removed = merged.removed;
      changed = true;
      if (existed) outcome.updated += 1;
      else outcome.added += 1;
      return true;
    };

    // Una sesión borrada en Footbar se borra aquí también, con su marca
    // para que no vuelva en la próxima mezcla de ningún móvil.
    if (only?.destroy) {
      const gone = sessions.find((item) => item.footbarId === only.sessionId);
      if (gone) {
        sessions = sessions.filter((item) => item !== gone);
        removed[gone.id] = now;
        changed = true;
      }
    } else if (puede(0)) {
      const access = await accessFor(row);
      if (only) {
        await traer(access, only.sessionId);
      } else {
        // 1. Lo nuevo, de lo más reciente hacia atrás: sólo lo de estas dos
        // semanas, que es lo que tira de la reserva. Lo anterior es historial.
        const have = tengo();
        const desde = Date.now() - 14 * 24 * 3600 * 1000;
        const nuevas = (await recentSessions(access, cuenta))
          .filter((item) => (Date.parse(item.start_date ?? '') || 0) >= desde)
          .map((item) => item.id)
          .filter((id) => !have.has(id));
        for (const id of nuevas) {
          if (!puede(0) || !(await traer(access, id))) break;
        }

        // 2. El historial, página a página, sin tocar la reserva de lo nuevo.
        if (!estado.completo || !estado.repasadoEn || Date.now() - estado.repasadoEn > SEMANA_MS) {
          if (estado.completo) {
            // Una vez a la semana se repasa entero, por si se escapó alguna.
            estado.completo = false;
            estado.pagina = 1;
          }
          while (!halted && !estado.completo && puede(RESERVA)) {
            const pagina = await sessionPage(access, estado.pagina, cuenta);
            if (pagina.total !== undefined) estado.total = pagina.total;
            const falta = tengo();
            let acabada = true;
            for (const { id } of pagina.sesiones) {
              if (falta.has(id)) continue;
              if (!puede(RESERVA) || !(await traer(access, id))) {
                acabada = false;
                break;
              }
            }
            if (!acabada) break;
            if (!pagina.hayMas) {
              estado.completo = true;
              estado.repasadoEn = Date.now();
              estado.pagina = 1;
            } else {
              estado.pagina += 1;
            }
          }
        }
      }
    } else {
      // Sin consultas libres esta semana: se espera a que se liberen.
      await guardarEstado();
      return { ...outcome, error: 'Esta semana ya se han gastado las consultas de Footbar. En unos días sigue sola.', throttled: true };
    }

    if (changed) {
      sessions.sort((a, b) => a.date.localeCompare(b.date));
      await writeBook(row.owner, profileId, sessions, removed);
    }
    if (halted instanceof FootbarError && halted.hasta) estado.cortadoHasta = halted.hasta;
    await guardarEstado(halted ? {} : { checked_at: now, broken: false });
    if (halted) throw halted;
    return outcome;
  } catch (problem) {
    if (problem instanceof FootbarError && problem.hasta) estado.cortadoHasta = problem.hasta;
    await guardarEstado().catch(() => undefined);
    return {
      ...outcome,
      error: problem instanceof Error ? problem.message : 'No se ha podido revisar Footbar.',
      needsReconnect: problem instanceof FootbarError && problem.revoked,
      throttled: problem instanceof FootbarError && problem.status === 429,
    };
  }
}

/** Revisa uno de casa, o todos los conectados de esa cuenta si no se dice cuál. */
export async function syncOwner(owner: string, profileId?: ProfileId): Promise<SyncOutcome[]> {
  if (profileId) {
    const row = await findRow(owner, profileId);
    return row ? [await syncRow(row)] : [];
  }
  return syncRows((await allRows()).filter((row) => row.owner === owner));
}

/**
 * Uno detrás de otro. Si Footbar corta con el primero, el segundo ni se
 * intenta: el cupo es de la app entera y con él tampoco entraría.
 */
async function syncRows(rows: LinkRow[]): Promise<SyncOutcome[]> {
  const out: SyncOutcome[] = [];
  let cut: SyncOutcome | undefined;
  // Se turnan: primero el que menos consultas ha gastado esta semana, para
  // que el historial de uno no espere a que acabe el del otro.
  const gastado = (row: LinkRow) => leerEstado(row).consultas.filter((t) => Date.now() - t < SEMANA_MS).length;
  const turno = [...rows].sort((a, b) => gastado(a) - gastado(b));
  for (const row of turno) {
    if (cut) {
      out.push({ profileId: profileOf(row), added: 0, updated: 0, error: cut.error, throttled: true });
      continue;
    }
    const outcome = await syncRow(row);
    if (outcome.throttled) cut = outcome;
    out.push(outcome);
  }
  return out;
}

/** La revisión de las 21:00: todos los enlaces de todas las cuentas. */
export async function syncEverything(): Promise<SyncOutcome[]> {
  return syncRows(await allRows());
}

/** Lo que dispara un aviso de Footbar: sólo esa sesión, o su borrado. */
export async function syncFromWebhook(
  userId: number,
  sessionId: number,
  destroy: boolean,
): Promise<SyncOutcome[]> {
  const out: SyncOutcome[] = [];
  for (const row of await rowsForFootbarUser(userId)) {
    out.push(await syncRow(row, { sessionId, destroy }));
  }
  return out;
}

/** Footbar avisa de que el peque ha quitado el permiso. */
export async function markRevoked(userId: number): Promise<void> {
  for (const row of await rowsForFootbarUser(userId)) await patchRow(row, { broken: true });
}
