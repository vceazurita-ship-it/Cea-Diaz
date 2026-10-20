import { ColegioBloqueaError, bajarClassroom } from '@/lib/classroom';
import {
  MENSAJE_COLEGIO,
  isClassroomProfile,
  type ClassroomLinkView,
  type ClassroomSnapshot,
} from '@/lib/classroomModel';
import { GoogleError, accessTokenFrom, seal, unseal } from '@/lib/googleCalendar';
import { admin } from '@/lib/supabaseAdmin';

/* =========================================================================
 *  Los permisos de Google Classroom, uno por niño.
 *
 *  Como los del calendario (`lib/calendarLinks.ts`), pero en su propia tabla,
 *  `classroom_links`: la cuenta enlazada aquí es la del colegio, no la de
 *  casa, y junto al permiso se guarda la última foto de las clases para no
 *  preguntar a Google cada vez que alguien abre la sección.
 *
 *  El `refresh_token` va cifrado y no sale nunca de aquí. Lo que ve el
 *  navegador es el correo, las fechas, el último fallo y la foto.
 * ========================================================================= */

const TABLE = 'classroom_links';

interface LinkRow {
  id: string;
  owner: string;
  profile_id: string;
  email: string;
  /** El `refresh_token`, cifrado con la clave del servidor; vacío si la lista se pegó a mano. */
  refresh_token: string;
  snapshot: ClassroomSnapshot | null;
  /** El último fallo al bajar las clases; vacío si la última fue bien. */
  sync_error: string | null;
  synced_at: string | null;
  connected_at: string;
  updated_at: string;
}

function publicView(row: LinkRow): ClassroomLinkView {
  const error = row.sync_error ?? undefined;
  return {
    profileId: row.profile_id as ClassroomLinkView['profileId'],
    email: row.email,
    connectedAt: row.connected_at,
    syncedAt: row.synced_at ?? undefined,
    error,
    codigo: error === MENSAJE_COLEGIO ? 'colegio' : error?.startsWith('El permiso') ? 'permiso' : undefined,
    snapshot: row.snapshot ?? null,
    manual: row.refresh_token === '' || undefined,
  };
}

const rowId = (owner: string, profileId: string) => `${owner}:${profileId}`;

export async function listClassroomLinks(owner: string): Promise<ClassroomLinkView[]> {
  const service = admin();
  if (!service) return [];

  const { data, error } = await service.from(TABLE).select('*').eq('owner', owner);
  if (error) throw new Error(error.message);

  return ((data ?? []) as LinkRow[]).filter((row) => isClassroomProfile(row.profile_id)).map(publicView);
}

async function findRow(owner: string, profileId: string): Promise<LinkRow | null> {
  const service = admin();
  if (!service) return null;

  const { data, error } = await service.from(TABLE).select('*').eq('id', rowId(owner, profileId)).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LinkRow | null) ?? null;
}

export async function getClassroomLink(owner: string, profileId: string): Promise<ClassroomLinkView | null> {
  const row = await findRow(owner, profileId);
  return row ? publicView(row) : null;
}

/**
 * Guarda el permiso recién concedido. Si se reconecta la misma cuenta, la
 * foto anterior se conserva hasta que llegue la nueva; si es otra cuenta,
 * se tira: no son las clases de quien acaba de entrar.
 */
export async function saveClassroomLink(params: {
  owner: string;
  profileId: string;
  email: string;
  refreshToken: string;
}): Promise<void> {
  const service = admin();
  if (!service) throw new Error('El servidor no tiene configurada la clave de servicio.');

  const existing = await findRow(params.owner, params.profileId);
  const same = existing?.email === params.email;
  const now = new Date().toISOString();

  const { error } = await service.from(TABLE).upsert({
    id: rowId(params.owner, params.profileId),
    owner: params.owner,
    profile_id: params.profileId,
    email: params.email,
    refresh_token: seal(params.refreshToken),
    snapshot: same ? existing?.snapshot ?? null : null,
    sync_error: null,
    synced_at: same ? existing?.synced_at ?? null : null,
    connected_at: same ? existing?.connected_at ?? now : now,
    updated_at: now,
  });

  if (error) throw new Error(error.message);
}

async function noteError(owner: string, profileId: string, message: string): Promise<void> {
  const service = admin();
  if (!service) return;
  await service
    .from(TABLE)
    .update({ sync_error: message, updated_at: new Date().toISOString() })
    .eq('id', rowId(owner, profileId));
}

/** Suelta el enlace y devuelve el token, para revocarlo también en Google. */
export async function dropClassroomLink(owner: string, profileId: string): Promise<string | null> {
  const service = admin();
  if (!service) return null;

  const row = await findRow(owner, profileId);
  const { error } = await service.from(TABLE).delete().eq('id', rowId(owner, profileId));
  if (error) throw new Error(error.message);

  return row ? unseal(row.refresh_token) : null;
}

/**
 * Guarda la lista pegada a mano (`lib/classroomPegado.ts`) en el sitio de
 * la conexión, sin permiso de Google: el token queda vacío y eso es lo que
 * la marca como pegada. Si el niño ya tiene Classroom conectado de verdad,
 * no se toca: aquello se pone al día solo.
 */
export async function guardarPegado(
  owner: string,
  profileId: string,
  snapshot: ClassroomSnapshot,
): Promise<ClassroomLinkView> {
  const service = admin();
  if (!service) throw new Error('El servidor no tiene configurada la clave de servicio.');

  const existing = await findRow(owner, profileId);
  if (existing && existing.refresh_token !== '') {
    throw new GoogleError('Este perfil ya tiene Classroom conectado: se pone al día solo.', 409);
  }

  const now = new Date().toISOString();
  const row: LinkRow = {
    id: rowId(owner, profileId),
    owner,
    profile_id: profileId,
    email: '',
    refresh_token: '',
    snapshot,
    sync_error: null,
    synced_at: now,
    connected_at: existing?.connected_at ?? now,
    updated_at: now,
  };
  const { error } = await service.from(TABLE).upsert(row);
  if (error) throw new Error(error.message);
  return publicView(row);
}

/**
 * Baja de nuevo las clases del niño y guarda la foto. Si falla, el fallo
 * queda anotado —y la foto anterior, intacta— para que la sección lo diga
 * aunque se abra mañana desde otro móvil.
 */
export async function syncClassroom(owner: string, profileId: string): Promise<ClassroomLinkView> {
  const service = admin();
  if (!service) throw new Error('El servidor no tiene configurada la clave de servicio.');

  const row = await findRow(owner, profileId);
  if (!row) throw new GoogleError('Este perfil no tiene Classroom conectado.', 409);
  if (row.refresh_token === '') {
    throw new GoogleError('Esta lista se pegó a mano: se pone al día pegándola otra vez.', 409);
  }

  const refreshToken = unseal(row.refresh_token);
  if (!refreshToken) {
    const message = 'El permiso guardado ya no se puede leer. Vuelve a conectar Classroom.';
    await noteError(owner, profileId, message);
    throw new GoogleError(message, 401);
  }

  try {
    const accessToken = await accessTokenFrom(refreshToken);
    const snapshot = await bajarClassroom(accessToken);
    const now = new Date().toISOString();

    const { error } = await service
      .from(TABLE)
      .update({ snapshot, sync_error: null, synced_at: now, updated_at: now })
      .eq('id', rowId(owner, profileId));
    if (error) throw new Error(error.message);

    return publicView({ ...row, snapshot, sync_error: null, synced_at: now, updated_at: now });
  } catch (error) {
    if (error instanceof ColegioBloqueaError) {
      await noteError(owner, profileId, MENSAJE_COLEGIO);
    } else if (error instanceof GoogleError) {
      await noteError(
        owner,
        profileId,
        error.status === 401 ? 'El permiso ya no vale. Hay que volver a conectar Classroom.' : error.message,
      );
    }
    throw error;
  }
}
