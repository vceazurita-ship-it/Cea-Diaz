import { NextResponse } from 'next/server';
import { footbarConfigured } from '@/lib/footbar';
import { markRevoked, syncFromWebhook } from '@/lib/footbarSync';
import { clientIp, isRateLimited } from '@/lib/rateLimit';
import { adminConfigured } from '@/lib/supabaseAdmin';

/* =========================================================================
 *  /api/footbar/webhook — los avisos de Footbar.
 *
 *  Footbar llama aquí cuando un peque conectado termina, corrige o borra una
 *  sesión, y cuando retira el permiso. Así la sesión aparece en la app al
 *  rato de acabar el entreno, sin esperar a la revisión de las 21:00.
 *
 *  Footbar no firma sus avisos, así que **no se cree nada de lo que traen**:
 *  el aviso sólo dice «mira la sesión 123 del usuario 45», y lo que entra en
 *  la libreta es lo que la API de Footbar devuelve con nuestro permiso. Un
 *  aviso inventado, como mucho, gasta una consulta.
 *
 *  Footbar quiere el 200 en menos de dos segundos y reintenta si no llega.
 *  Leer una sesión y guardarla cabe de sobra; si algún día no cupiera, el
 *  reintento es inofensivo —mezclar la misma sesión dos veces no la duplica—
 *  y la revisión de las 21:00 recoge lo que se haya quedado atrás.
 * ========================================================================= */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FootbarEvent {
  object_type?: 'session' | 'user';
  object_id?: number;
  aspect_type?: 'create' | 'update' | 'destroy';
  updates?: Record<string, unknown>;
  user_id?: number;
}

export async function POST(request: Request) {
  // Respuesta 200 aunque no se haga nada: a Footbar sólo le importa el acuse.
  const ok = NextResponse.json({ ok: true });
  if (!footbarConfigured || !adminConfigured) return ok;
  if (isRateLimited(clientIp(request), { bucket: 'footbar-webhook', max: 60 })) return ok;

  const event = (await request.json().catch(() => null)) as FootbarEvent | null;
  const userId = Number(event?.user_id);
  if (!event || !Number.isInteger(userId) || userId <= 0) return ok;

  try {
    if (event.object_type === 'user' && String(event.updates?.authorized) === 'false') {
      await markRevoked(userId);
    } else if (event.object_type === 'session') {
      const sessionId = Number(event.object_id);
      if (Number.isInteger(sessionId) && sessionId > 0) {
        await syncFromWebhook(userId, sessionId, event.aspect_type === 'destroy');
      }
    }
  } catch {
    // Lo que no entre ahora entra a las 21:00.
  }

  return ok;
}
