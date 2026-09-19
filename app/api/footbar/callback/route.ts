import { NextResponse } from 'next/server';
import { appOrigin } from '@/lib/googleCalendar';
import { FootbarError, exchangeCode, footbarConfigured, readState, redirectUri } from '@/lib/footbar';
import { saveFootbarLink, syncOwner } from '@/lib/footbarSync';
import { PROFILES_BY_ID } from '@/lib/profiles';
import { adminConfigured } from '@/lib/supabaseAdmin';

/* =========================================================================
 *  /api/footbar/callback — la vuelta desde la pantalla de permiso de Footbar.
 *
 *  Se canjea el código por el permiso, se guarda cifrado y se hace la
 *  primera revisión en el acto, para que al volver a la app ya estén sus
 *  últimas sesiones. Luego se devuelve a la app con el resultado en la barra,
 *  que es lo que lee la pantalla para decir «listo» o «no ha podido ser».
 *
 *  Es una navegación, no una llamada de la app: aquí no hay sesión de casa.
 *  De qué cuenta y de qué peque es el permiso viaja cifrado en el `state`.
 * ========================================================================= */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function backHome(request: Request, params: Record<string, string>) {
  const url = new URL('/', appOrigin(request));
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;

  const denied = query.get('error');
  if (denied) {
    return backHome(request, {
      footbar: 'error',
      motivo: denied === 'access_denied' ? 'Se ha cancelado la conexión.' : denied,
    });
  }

  if (!footbarConfigured || !adminConfigured) {
    return backHome(request, { footbar: 'error', motivo: 'El servidor no está configurado.' });
  }

  const code = query.get('code');
  const state = query.get('state');
  const claim = state ? readState(state) : null;
  if (!code || !claim || !(claim.profileId in PROFILES_BY_ID)) {
    return backHome(request, { footbar: 'error', motivo: 'La solicitud ha caducado. Vuelve a intentarlo.' });
  }

  try {
    const tokens = await exchangeCode(code, claim.verifier, redirectUri(request));
    await saveFootbarLink(claim.owner, claim.profileId, tokens);

    const [first] = await syncOwner(claim.owner, claim.profileId);
    return backHome(request, {
      footbar: 'ok',
      perfil: claim.profileId,
      nuevas: String(first?.added ?? 0),
    });
  } catch (problem) {
    return backHome(request, {
      footbar: 'error',
      perfil: claim.profileId,
      motivo: problem instanceof FootbarError ? problem.message : 'No se ha podido guardar el permiso de Footbar.',
    });
  }
}
