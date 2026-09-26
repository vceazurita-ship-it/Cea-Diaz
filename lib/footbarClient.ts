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

/** Lo que se espera al servidor antes de decir que no contesta: la revisión puede tardar. */
const WAIT_MS = 45_000;

/** Una promesa con plazo: si no llega a tiempo, falla con ese mensaje en vez de quedarse colgada. */
function inTime<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (problem) => {
        window.clearTimeout(timer);
        reject(problem);
      },
    );
  });
}

async function request<T>(init?: RequestInit): Promise<T> {
  const client = supabase();
  // La sesión de Supabase a veces se queda esperando a renovarse: mejor un
  // aviso a los diez segundos que un botón que no hace nada.
  const session = client
    ? await inTime(
        client.auth.getSession(),
        10_000,
        'La cuenta de casa no responde. Cierra y vuelve a abrir la app, y prueba otra vez.',
      )
    : null;
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('Hay que entrar en la cuenta de casa para conectar Footbar.');

  const response = await inTime(
    fetch('/api/footbar', {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    }),
    WAIT_MS,
    'El servidor no contesta. Mira la conexión a internet y prueba otra vez.',
  ).catch((problem: unknown) => {
    // `fetch` sólo falla así sin red: se dice en cristiano.
    if (problem instanceof TypeError) throw new Error('Sin conexión con el servidor. Mira internet y prueba otra vez.');
    throw problem;
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
  const { url } = await action<{ url?: unknown }>({ accion: 'conectar', profileId });
  // Sin una dirección de verdad, asignarla a la barra no haría nada visible.
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) {
    throw new Error('El servidor no ha dado la página de permiso de Footbar.');
  }
  return url;
}

/** Revisa ya, sin esperar a las 21:00. Sin perfil, todos los conectados. */
export async function footbarUpdate(profileId?: ProfileId): Promise<FootbarSyncResult[]> {
  return (await action<{ results: FootbarSyncResult[] }>({ accion: 'actualizar', profileId })).results;
}

export async function footbarDisconnect(profileId: ProfileId): Promise<void> {
  await action({ accion: 'desconectar', profileId });
}
