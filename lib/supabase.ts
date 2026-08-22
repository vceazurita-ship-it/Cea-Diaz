import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* =========================================================================
 *  Cliente de Supabase.
 *
 *  La nube es opcional: si no hay variables configuradas, `cloudConfigured`
 *  es `false` y la app se comporta exactamente como antes, guardando sólo
 *  en el navegador. Así el proyecto sigue arrancando sin cuenta ninguna.
 *
 *  Ojo: `NEXT_PUBLIC_*` se incrusta en el paquete durante la compilación,
 *  de modo que hay que definirlas en Vercel **antes** de desplegar.
 * ========================================================================= */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const cloudConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** Cliente único; `null` cuando la nube no está configurada. */
export function supabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;

  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        // La sesión se guarda en el navegador: se entra una vez por móvil.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}
