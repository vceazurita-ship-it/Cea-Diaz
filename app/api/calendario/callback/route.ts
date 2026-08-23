import { NextResponse } from 'next/server';
import { saveLink } from '@/lib/calendarLinks';
import {
  GoogleError,
  appOrigin,
  exchangeCode,
  googleConfigured,
  readState,
  redirectUri,
} from '@/lib/googleCalendar';
import { PROFILES_BY_ID } from '@/lib/profiles';
import { adminConfigured } from '@/lib/supabaseAdmin';

/* =========================================================================
 *  /api/calendario/callback — la vuelta desde Google.
 *
 *  Google manda aquí al navegador después del consentimiento. Se canjea el
 *  código por el permiso duradero, se guarda y se devuelve a la app con el
 *  resultado en la barra de direcciones, que es lo que lee la sección de
 *  tareas para decir «listo» o «no ha podido ser».
 *
 *  Es una navegación, no una llamada de la app: aquí no hay cabecera de
 *  sesión. Quién autorizó qué viaja firmado dentro del `state`.
 * ========================================================================= */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Vuelta a la app con el desenlace a cuestas. */
function backHome(request: Request, params: Record<string, string>) {
  const url = new URL('/', appOrigin(request));
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;

  // Quien cancela en la pantalla de Google vuelve por aquí con un error.
  const denied = query.get('error');
  if (denied) {
    return backHome(request, {
      calendario: 'error',
      motivo: denied === 'access_denied' ? 'Se ha cancelado la conexión.' : denied,
    });
  }

  if (!googleConfigured || !adminConfigured) {
    return backHome(request, { calendario: 'error', motivo: 'El servidor no está configurado.' });
  }

  const code = query.get('code');
  const state = query.get('state');
  if (!code || !state) {
    return backHome(request, { calendario: 'error', motivo: 'La respuesta de Google venía incompleta.' });
  }

  const claim = readState(state);
  if (!claim || !(claim.profileId in PROFILES_BY_ID)) {
    return backHome(request, {
      calendario: 'error',
      motivo: 'La solicitud ha caducado. Vuelve a intentarlo.',
    });
  }

  try {
    const tokens = await exchangeCode(code, redirectUri(request));

    await saveLink({
      owner: claim.owner,
      profileId: claim.profileId,
      email: tokens.email,
      refreshToken: tokens.refreshToken,
    });

    return backHome(request, { calendario: 'ok', perfil: claim.profileId });
  } catch (error) {
    return backHome(request, {
      calendario: 'error',
      perfil: claim.profileId,
      motivo:
        error instanceof GoogleError
          ? error.message
          : 'No se ha podido guardar el permiso de Google.',
    });
  }
}
