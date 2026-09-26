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

async function request<T>(init?: RequestInit, reintentar = true): Promise<T> {
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

  const pedir = () =>
    inTime(
      fetch('/api/footbar', {
        ...init,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        },
      }),
      WAIT_MS,
      'El servidor de la app no contesta. Prueba otra vez en un momento.',
    );

  // `fetch` falla sin respuesta no sólo sin red: el móvil, al volver a la app
  // desde otra, tarda un instante en despertar la conexión y la primera
  // petición se pierde. Así que se reintenta dos veces antes de rendirse, y
  // sólo se habla de internet si el aparato dice de verdad que no lo tiene.
  let response: Response | undefined;
  let ultimo: unknown;
  // «Actualizar» no se repite: si la primera sí llegó, gastaría dos veces el cupo de Footbar.
  for (const espera of reintentar ? [0, 700, 1800] : [0]) {
    if (espera) await new Promise((resolve) => window.setTimeout(resolve, espera));
    try {
      response = await pedir();
      break;
    } catch (problem) {
      ultimo = problem;
      if (!(problem instanceof TypeError)) throw problem;
    }
  }
  if (!response) {
    if (navigator.onLine === false) throw new Error('El móvil dice que no tiene internet. Conéctate y prueba otra vez.');
    const detalle = ultimo instanceof Error && ultimo.message ? ` (${ultimo.message})` : '';
    throw new Error(`No se ha podido llegar al servidor de la app${detalle}. Prueba otra vez en un momento.`);
  }
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error ?? 'No se ha podido hablar con Footbar.');
  if (!payload) throw new Error('El servidor no ha devuelto nada.');
  return payload;
}

const action = <T>(body: Record<string, unknown>, reintentar = true) =>
  request<T>({ method: 'POST', body: JSON.stringify(body) }, reintentar);

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
  return (await action<{ results: FootbarSyncResult[] }>({ accion: 'actualizar', profileId }, false)).results;
}

export async function footbarDisconnect(profileId: ProfileId): Promise<void> {
  await action({ accion: 'desconectar', profileId });
}
