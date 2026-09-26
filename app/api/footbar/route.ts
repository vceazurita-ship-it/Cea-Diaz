import { NextResponse } from 'next/server';
import { consentUrl, footbarConfigured, packState, pkce, redirectUri } from '@/lib/footbar';
import { cupoFootbar, dropFootbarLink, listFootbarLinks, syncOwner } from '@/lib/footbarSync';
import { PROFILES_BY_ID } from '@/lib/profiles';
import { clientIp, isRateLimited } from '@/lib/rateLimit';
import { adminConfigured, userFromRequest } from '@/lib/supabaseAdmin';
import type { ProfileId } from '@/types';

/* =========================================================================
 *  /api/footbar — la conexión de cada peque con su cuenta de Footbar.
 *
 *  GET   dice si la integración está disponible y quién está conectado.
 *  POST  `conectar` devuelve la pantalla de permiso de Footbar;
 *        `actualizar` revisa ya, sin esperar a las 21:00 (uno o todos);
 *        `desconectar` borra el permiso guardado.
 *
 *  Todo pasa por la sesión de Supabase de la casa, como el calendario.
 * ========================================================================= */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function missingSetup(): string | null {
  if (!footbarConfigured) return 'Falta configurar FOOTBAR_CLIENT_ID y FOOTBAR_CLIENT_SECRET en el servidor.';
  if (!adminConfigured) return 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.';
  return null;
}

/**
 * Quién llama, con plazo: si Supabase no contesta, mejor decirlo a los ocho
 * segundos que dejar al móvil esperando hasta que Vercel corte la función.
 * Lo que tarda queda en el registro de Vercel, para saber dónde se atasca.
 */
async function ownerOf(request: Request, accion: string): Promise<string | null | 'lento'> {
  const t0 = Date.now();
  const lento = new Promise<'lento'>((resolve) => setTimeout(() => resolve('lento'), 8000));
  const owner = await Promise.race([userFromRequest(request), lento]);
  console.info(`[footbar] ${accion}: sesión en ${Date.now() - t0} ms${owner === 'lento' ? ' (sin respuesta de Supabase)' : ''}`);
  return owner;
}

const isKid = (id: unknown): id is ProfileId =>
  typeof id === 'string' && id in PROFILES_BY_ID && PROFILES_BY_ID[id as ProfileId].kind === 'kid';

export async function GET(request: Request) {
  const setup = missingSetup();
  if (setup) return NextResponse.json({ configured: false, reason: setup, links: [] });

  const owner = await ownerOf(request, 'estado');
  if (owner === 'lento') return bad('La cuenta de casa (Supabase) no responde ahora. Prueba en un momento.', 504);
  if (!owner) return bad('Hay que entrar en la cuenta de casa.', 401);

  try {
    const [links, cupo] = await Promise.all([listFootbarLinks(owner), cupoFootbar()]);
    return NextResponse.json({ configured: true, links, cupo });
  } catch {
    return bad('No se ha podido consultar la conexión con Footbar.', 502);
  }
}

export async function POST(request: Request) {
  if (isRateLimited(clientIp(request), { bucket: 'footbar', max: 30 })) {
    return bad('Demasiadas peticiones desde este dispositivo. Espera unos minutos.', 429);
  }

  const setup = missingSetup();
  if (setup) return bad(setup, 503);

  const owner = await ownerOf(request, 'acción');
  if (owner === 'lento') return bad('La cuenta de casa (Supabase) no responde ahora. Prueba en un momento.', 504);
  if (!owner) return bad('Hay que entrar en la cuenta de casa.', 401);

  const body = (await request.json().catch(() => ({}))) as { accion?: string; profileId?: string };

  try {
    switch (body.accion) {
      case 'conectar': {
        if (!isKid(body.profileId)) return bad('Ese perfil no lleva rastreador.', 400);
        const { verifier, challenge } = pkce();
        const state = packState({ owner, profileId: body.profileId, verifier, at: Date.now() });
        return NextResponse.json({ url: consentUrl(state, challenge, redirectUri(request)) });
      }

      case 'actualizar': {
        const one = body.profileId === undefined ? undefined : body.profileId;
        if (one !== undefined && !isKid(one)) return bad('Ese perfil no lleva rastreador.', 400);
        return NextResponse.json({ results: await syncOwner(owner, one) });
      }

      case 'desconectar': {
        if (!isKid(body.profileId)) return bad('Ese perfil no lleva rastreador.', 400);
        await dropFootbarLink(owner, body.profileId);
        return NextResponse.json({ ok: true });
      }

      default:
        return bad('No sé qué hacer con eso.', 400);
    }
  } catch (problem) {
    return bad(problem instanceof Error ? problem.message : 'Footbar no ha respondido.', 502);
  }
}
