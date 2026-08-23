import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* =========================================================================
 *  Cliente de Supabase con permisos de servidor.
 *
 *  Sólo lo usan las rutas de `app/api`. Salta las políticas de fila, así que
 *  la clave no puede acercarse al navegador: vive en `SUPABASE_SERVICE_ROLE_KEY`,
 *  sin el prefijo `NEXT_PUBLIC_` que incrusta las variables en el paquete.
 *
 *  Hace falta para una sola cosa: guardar los permisos de Google Calendar.
 *  Esa tabla no tiene ninguna política, de modo que la clave pública no la
 *  ve ni existiendo la sesión; y así los tokens no se pueden leer desde un
 *  móvil ni aunque alguien se ponga a llamar a la API a mano.
 * ========================================================================= */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const adminConfigured = Boolean(url && serviceKey);

let client: SupabaseClient | null = null;

export function admin(): SupabaseClient | null {
  if (!url || !serviceKey) return null;

  if (!client) {
    client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}

/**
 * Quién llama, según el `Authorization: Bearer` que manda el navegador con
 * su sesión de Supabase. Devuelve `null` si no hay sesión válida: es lo que
 * separa «esta casa» de cualquiera que dé con la URL de la ruta.
 */
export async function userFromRequest(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  const service = admin();
  if (!service) return null;

  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) return null;

  return data.user.id;
}
