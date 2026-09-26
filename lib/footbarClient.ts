import { supabase } from '@/lib/supabase';
import type { ProfileId } from '@/types';

/* =========================================================================
 *  Footbar, visto desde el navegador.
 *
 *  Aquí no hay ni un permiso de Footbar: la app le pide al servidor
 *  «conecta a este peque», «revisa ahora», y todo lo demás pasa en
 *  `app/api/footbar`, que es donde viven las claves. Si el servidor no está
 *  configurado, `status()` lo dice y el GPS sigue funcionando a mano.
 * ========================================================================= */

export interface FootbarLink {
  profileId: ProfileId;
  connectedAt: string;
  lastSync?: string;
  needsReconnect: boolean;
}

export interface FootbarStatus {
  configured: boolean;
  reason?: string;
  links: FootbarLink[];
}

export interface FootbarSyncResult {
  profileId: ProfileId;
  added: number;
  updated: number;
  error?: string;
  needsReconnect?: boolean;
  throttled?: boolean;
}

/** Dónde deja la vuelta de Footbar su desenlace para que lo cuente la pantalla. */
export const FOOTBAR_RETURN_KEY = 'habitos-familia:footbar-vuelta';

async function request<T>(init?: RequestInit): Promise<T> {
  const client = supabase();
  const token = client ? (await client.auth.getSession()).data.session?.access_token : undefined;
  if (!token) throw new Error('Hay que entrar en la cuenta de casa para conectar Footbar.');

  const response = await fetch('/api/footbar', {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error ?? 'No se ha podido hablar con Footbar.');
  if (!payload) throw new Error('El servidor no ha devuelto nada.');
  return payload;
}

const action = <T>(body: Record<string, unknown>) =>
  request<T>({ method: 'POST', body: JSON.stringify(body) });

/** No lanza: sin nube, sin sesión o sin configurar, la respuesta es «no disponible». */
export async function footbarStatus(): Promise<FootbarStatus> {
  try {
    return await request<FootbarStatus>();
  } catch (problem) {
    return {
      configured: false,
      reason: problem instanceof Error ? problem.message : undefined,
      links: [],
    };
  }
}

/** La pantalla de permiso de Footbar para ese peque. */
export async function footbarConnectUrl(profileId: ProfileId): Promise<string> {
  return (await action<{ url: string }>({ accion: 'conectar', profileId })).url;
}

/** Revisa ya, sin esperar a las 21:00. Sin perfil, todos los conectados. */
export async function footbarUpdate(profileId?: ProfileId): Promise<FootbarSyncResult[]> {
  return (await action<{ results: FootbarSyncResult[] }>({ accion: 'actualizar', profileId })).results;
}

export async function footbarDisconnect(profileId: ProfileId): Promise<void> {
  await action({ accion: 'desconectar', profileId });
}
