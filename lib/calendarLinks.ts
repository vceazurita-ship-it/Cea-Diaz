import { GoogleError, accessTokenFrom, seal, unseal } from '@/lib/googleCalendar';
import { admin } from '@/lib/supabaseAdmin';
import type { CalendarLink, ProfileId } from '@/types';

/* =========================================================================
 *  Los permisos de Google Calendar, uno por perfil.
 *
 *  Cada miembro de la casa enlaza la cuenta que quiera —la suya, o la de un
 *  padre si aún no tiene— y elige en qué calendario caen sus recados. Esta
 *  capa guarda ese enlace y saca el token de acceso cuando hace falta.
 *
 *  El `refresh_token` se guarda cifrado y no sale nunca de aquí: lo que ve
 *  el navegador es el correo, el calendario elegido y la fecha del enlace.
 * ========================================================================= */

const TABLE = 'calendar_links';

interface LinkRow {
  id: string;
  owner: string;
  profile_id: string;
  email: string;
  calendar_id: string;
  calendar_name: string;
  /** El `refresh_token`, cifrado con la clave del servidor. */
  refresh_token: string;
  /** Google ha dejado de aceptarlo; hay que volver a conectar. */
  broken: boolean;
  checked_at: string | null;
  connected_at: string;
  updated_at: string;
}

/** Lo que se le puede enseñar al navegador: todo menos el token. */
function publicView(row: LinkRow): CalendarLink {
  return {
    profileId: row.profile_id as ProfileId,
    email: row.email,
    calendarId: row.calendar_id,
    calendarName: row.calendar_name,
    connectedAt: row.connected_at,
    needsReconnect: row.broken === true,
    checkedAt: row.checked_at ?? undefined,
  };
}

const rowId = (owner: string, profileId: string) => `${owner}:${profileId}`;

/** Los enlaces de la casa, sin credenciales. */
export async function listLinks(owner: string): Promise<CalendarLink[]> {
  const service = admin();
  if (!service) return [];

  const { data, error } = await service.from(TABLE).select('*').eq('owner', owner);
  if (error) throw new Error(error.message);

  return ((data ?? []) as LinkRow[]).map(publicView);
}

async function findRow(owner: string, profileId: string): Promise<LinkRow | null> {
  const service = admin();
  if (!service) return null;

  const { data, error } = await service
    .from(TABLE)
    .select('*')
    .eq('id', rowId(owner, profileId))
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as LinkRow | null) ?? null;
}

export async function getLink(owner: string, profileId: string): Promise<CalendarLink | null> {
  const row = await findRow(owner, profileId);
  return row ? publicView(row) : null;
}

/**
 * Guarda el permiso recién concedido. El calendario arranca en `primary` —el
 * principal de la cuenta— porque es lo que casi siempre se quiere; cambiarlo
 * es un desplegable en la propia sección de tareas.
 */
export async function saveLink(params: {
  owner: string;
  profileId: string;
  email: string;
  refreshToken: string;
}): Promise<void> {
  const service = admin();
  if (!service) throw new Error('El servidor no tiene configurada la clave de servicio.');

  const existing = await findRow(params.owner, params.profileId);
  const now = new Date().toISOString();

  const { error } = await service.from(TABLE).upsert({
    id: rowId(params.owner, params.profileId),
    owner: params.owner,
    profile_id: params.profileId,
    email: params.email,
    // Reconectar la misma cuenta no debe mover el calendario ya elegido.
    calendar_id: existing?.calendar_id ?? 'primary',
    calendar_name: existing?.calendar_name ?? 'Calendario principal',
    refresh_token: seal(params.refreshToken),
    // Reconectar es justamente lo que arregla un permiso roto.
    broken: false,
    checked_at: now,
    connected_at: existing?.connected_at ?? now,
    updated_at: now,
  });

  if (error) throw new Error(error.message);
}

/**
 * Anota si el permiso sigue vivo. Se llama en cada operación real contra
 * Google, que es el único momento en que se sabe de verdad: preguntarlo por
 * si acaso costaría una llamada por perfil cada vez que se abre la sección.
 */
async function noteHealth(owner: string, profileId: string, broken: boolean): Promise<void> {
  const service = admin();
  if (!service) return;

  await service
    .from(TABLE)
    .update({ broken, checked_at: new Date().toISOString() })
    .eq('id', rowId(owner, profileId));
}

/** Cambia el calendario donde caen los recados de ese perfil. */
export async function chooseCalendar(
  owner: string,
  profileId: string,
  calendarId: string,
  calendarName: string,
): Promise<void> {
  const service = admin();
  if (!service) throw new Error('El servidor no tiene configurada la clave de servicio.');

  const { error } = await service
    .from(TABLE)
    .update({
      calendar_id: calendarId,
      calendar_name: calendarName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowId(owner, profileId));

  if (error) throw new Error(error.message);
}

/** Suelta el enlace y, de paso, retira el permiso en la cuenta de Google. */
export async function dropLink(owner: string, profileId: string): Promise<string | null> {
  const service = admin();
  if (!service) return null;

  const row = await findRow(owner, profileId);
  const { error } = await service.from(TABLE).delete().eq('id', rowId(owner, profileId));
  if (error) throw new Error(error.message);

  return row ? unseal(row.refresh_token) : null;
}

export interface ActiveLink {
  accessToken: string;
  calendarId: string;
  calendarName: string;
  email: string;
}

/**
 * El enlace listo para usar: token de acceso fresco y calendario de destino.
 * Falla con un mensaje presentable cuando no hay cuenta enlazada o cuando el
 * permiso ha caducado, que son las dos cosas que le pueden pasar a una casa.
 */
export async function activeLink(owner: string, profileId: string): Promise<ActiveLink> {
  const row = await findRow(owner, profileId);
  if (!row) {
    throw new GoogleError('Este perfil no tiene ninguna cuenta de Google conectada.', 409);
  }

  const refreshToken = unseal(row.refresh_token);
  if (!refreshToken) {
    await noteHealth(owner, profileId, true);
    throw new GoogleError(
      'El permiso guardado ya no se puede leer. Vuelve a conectar la cuenta.',
      401,
    );
  }

  let accessToken: string;
  try {
    accessToken = await accessTokenFrom(refreshToken);
  } catch (error) {
    // Un 401 aquí es el permiso muerto: alguien lo retiró desde su cuenta de
    // Google, cambió la contraseña, o el proyecto sigue sin publicar y ha
    // caducado a los siete días. Se deja anotado para que la app lo diga en
    // vez de fingir que sigue conectada.
    if (error instanceof GoogleError && error.status === 401) {
      await noteHealth(owner, profileId, true);
    }
    throw error;
  }

  // Ha respondido: el permiso está vivo y queda fechado, para poder decir
  // desde cuándo consta que funciona.
  await noteHealth(owner, profileId, false);

  return {
    accessToken,
    calendarId: row.calendar_id,
    calendarName: row.calendar_name,
    email: row.email,
  };
}
