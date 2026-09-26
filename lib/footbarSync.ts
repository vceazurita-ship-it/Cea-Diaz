import {
  FootbarError,
  mergeInto,
  recentSessions,
  refreshTokens,
  seal,
  sessionDetail,
  toGps,
  unseal,
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

/** Sesiones nuevas que se piden como mucho en una revisión: el plan gratuito va contado. */
const MAX_NEW_PER_RUN = 12;

interface LinkRow {
  id: string;
  owner: string;
  profile_id: string;
  email: string;
  refresh_token: string;
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
  return ((data ?? []) as LinkRow[]).map(view);
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
  const { error } = await service()
    .from(TABLE)
    .upsert({
      id: rowId(owner, profileId),
      owner,
      profile_id: `${KIND}:${profileId}`,
      email: String(tokens.userId),
      calendar_id: KIND,
      calendar_name: 'Footbar',
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

async function syncRow(
  row: LinkRow,
  only?: { sessionId: number; destroy?: boolean },
): Promise<SyncOutcome> {
  const profileId = profileOf(row);
  const outcome: SyncOutcome = { profileId, added: 0, updated: 0 };
  if (!(profileId in PROFILES_BY_ID)) return { ...outcome, error: 'Perfil desconocido.' };

  try {
    const access = await accessFor(row);
    const book = await readBook(row.owner, profileId);
    let { sessions } = book;
    let removed = { ...book.removed };
    let changed = false;
    let halted: unknown;
    const now = new Date().toISOString();

    // Una sesión borrada en Footbar se borra aquí también, con su marca
    // para que no vuelva en la próxima mezcla de ningún móvil.
    if (only?.destroy) {
      const gone = sessions.find((item) => item.footbarId === only.sessionId);
      if (gone) {
        sessions = sessions.filter((item) => item !== gone);
        removed[gone.id] = now;
        changed = true;
      }
    } else {
      let ids: number[];
      if (only) {
        ids = [only.sessionId];
      } else {
        const have = new Set(sessions.map((item) => item.footbarId).filter((id) => id !== undefined));
        ids = (await recentSessions(access))
          .map((item) => item.id)
          .filter((id) => !have.has(id) && !removed[`footbar-${id}`])
          .slice(0, MAX_NEW_PER_RUN);
      }

      for (const id of ids) {
        let detail;
        try {
          detail = await sessionDetail(access, id);
        } catch (problem) {
          // Si Footbar corta a mitad (el cupo), lo que ya ha llegado se
          // guarda: cada detalle ha costado una consulta y no se repite.
          halted = problem;
          break;
        }
        const incoming = toGps(detail, profileId, now);
        if (!incoming) continue;
        const existed = sessions.some((item) => item.footbarId === id);
        const merged = mergeInto(sessions, removed, incoming);
        if (!merged.changed) continue;
        sessions = merged.sessions;
        removed = merged.removed;
        changed = true;
        if (existed) outcome.updated += 1;
        else outcome.added += 1;
      }
    }

    if (changed) {
      sessions.sort((a, b) => a.date.localeCompare(b.date));
      await writeBook(row.owner, profileId, sessions, removed);
    }
    if (halted) throw halted;
    await patchRow(row, { checked_at: now, broken: false });
    return outcome;
  } catch (problem) {
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
  for (const row of rows) {
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
