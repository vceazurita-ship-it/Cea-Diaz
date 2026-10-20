import { isStale, type ClassroomLinkView, type ClassroomProfile } from '@/lib/classroomModel';
import { supabase } from '@/lib/supabase';

/* =========================================================================
 *  Google Classroom, visto desde el navegador.
 *
 *  Ni un token de Google por aquí: se le pide al servidor «dame las clases de
 *  Leo» o «vuelve a bajarlas», con la sesión de casa como credencial, igual
 *  que hace el calendario (`lib/calendar.ts`).
 *
 *  Guarda en memoria la última respuesta de cada niño: el panel de Classroom
 *  y la tarjeta de propuestas la piden los dos al abrir Rendimiento, y no
 *  hace falta preguntar dos veces.
 * ========================================================================= */

export interface ClassroomStatus {
  configured: boolean;
  reason?: string;
  link: ClassroomLinkView | null;
}

/** Dónde deja `app/page.tsx` el desenlace de la vuelta desde Google. */
export const CLASSROOM_RETURN_KEY = 'habitos-familia:classroom-vuelta';

/** Un error del servidor con su código, para distinguir «el colegio no deja». */
export class ClassroomError extends Error {
  constructor(
    message: string,
    readonly codigo?: string,
  ) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string> | null> {
  const client = supabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await authHeader();
  if (!auth) throw new ClassroomError('Hay que entrar en la cuenta de casa para ver Classroom.');

  const response = await fetch(path, {
    ...init,
    headers: { ...auth, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string; codigo?: string }) | null;

  if (!response.ok) {
    throw new ClassroomError(payload?.error ?? 'No se ha podido hablar con Classroom.', payload?.codigo);
  }
  if (!payload) throw new ClassroomError('El servidor no ha devuelto nada.');
  return payload;
}

const cache = new Map<ClassroomProfile, ClassroomStatus>();
const enCurso = new Map<ClassroomProfile, Promise<ClassroomStatus>>();
const oyentes = new Set<(profileId: ClassroomProfile, status: ClassroomStatus) => void>();

function guardar(profileId: ClassroomProfile, status: ClassroomStatus) {
  cache.set(profileId, status);
  for (const oyente of oyentes) oyente(profileId, status);
}

/**
 * Avisa cuando cambia lo sabido de un niño —una bajada nueva, una
 * desconexión—, para que las propuestas de la semana se enteren de lo que
 * acaba de traer el panel de Classroom. Devuelve cómo dejar de escuchar.
 */
export function onClassroomChange(
  oyente: (profileId: ClassroomProfile, status: ClassroomStatus) => void,
): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Lo último que se sabe sin preguntar, si se sabe algo. */
export function classroomCached(profileId: ClassroomProfile): ClassroomStatus | undefined {
  return cache.get(profileId);
}

/**
 * El estado de Classroom de un niño. No lanza: sin nube, sin sesión o sin
 * configurar, la respuesta es «no hay Classroom» y quien pregunta sigue.
 */
export async function classroomStatus(profileId: ClassroomProfile, fresco = false): Promise<ClassroomStatus> {
  if (!fresco) {
    const hit = cache.get(profileId);
    if (hit) return hit;
    const pending = enCurso.get(profileId);
    if (pending) return pending;
  }

  const promesa = request<{ configured: boolean; reason?: string; links: ClassroomLinkView[] }>(
    `/api/classroom?perfil=${profileId}`,
  )
    .then((data) => {
      const status: ClassroomStatus = {
        configured: data.configured,
        reason: data.reason,
        link: data.links.find((l) => l.profileId === profileId) ?? null,
      };
      guardar(profileId, status);
      return status;
    })
    .catch((): ClassroomStatus => ({ configured: false, link: null }))
    .finally(() => enCurso.delete(profileId));

  enCurso.set(profileId, promesa);
  return promesa;
}

const action = <T>(body: Record<string, unknown>) =>
  request<T>('/api/classroom', { method: 'POST', body: JSON.stringify(body) });

export async function classroomConnectUrl(profileId: ClassroomProfile): Promise<string> {
  const { url } = await action<{ url: string }>({ accion: 'conectar', profileId });
  return url;
}

export async function classroomDisconnect(profileId: ClassroomProfile): Promise<void> {
  await action<{ ok: boolean }>({ accion: 'desconectar', profileId });
  const prev = cache.get(profileId);
  guardar(profileId, { configured: prev?.configured ?? true, link: null });
}

/** Vuelve a bajar las clases y deja la foto nueva en la memoria. */
export async function classroomSync(profileId: ClassroomProfile): Promise<ClassroomLinkView> {
  const { link } = await action<{ link: ClassroomLinkView }>({ accion: 'sincronizar', profileId });
  guardar(profileId, { configured: true, link });
  return link;
}

/** Hay que volver a bajar: conectado, sin bloqueo del colegio y con la foto vieja. */
export function needsSync(link: ClassroomLinkView | null): boolean {
  if (!link || link.codigo === 'colegio' || link.codigo === 'permiso') return false;
  return isStale(link.syncedAt);
}
