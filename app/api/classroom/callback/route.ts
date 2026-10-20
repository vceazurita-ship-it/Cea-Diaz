import { NextResponse } from 'next/server';
import { classroomRedirectUri, esBloqueoDelColegio } from '@/lib/classroom';
import { saveClassroomLink, syncClassroom } from '@/lib/classroomLinks';
import { MENSAJE_COLEGIO, isClassroomProfile } from '@/lib/classroomModel';
import { GoogleError, appOrigin, exchangeCode, googleConfigured, readState } from '@/lib/googleCalendar';
import { adminConfigured } from '@/lib/supabaseAdmin';

/* =========================================================================
 *  /api/classroom/callback — la vuelta desde Google.
 *
 *  Igual que la del calendario: se canjea el código por el permiso duradero,
 *  se guarda y se vuelve a la app con el desenlace en la barra. Aquí, además,
 *  se bajan las clases en el momento: si el colegio no deja pasar a la app,
 *  es ahora cuando hay que decirlo, no la próxima vez que alguien mire.
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
      classroom: 'error',
      motivo: esBloqueoDelColegio(denied)
        ? MENSAJE_COLEGIO
        : denied === 'access_denied'
          ? 'Se ha cancelado la conexión.'
          : denied,
    });
  }

  if (!googleConfigured || !adminConfigured) {
    return backHome(request, { classroom: 'error', motivo: 'El servidor no está configurado.' });
  }

  const code = query.get('code');
  const state = query.get('state');
  if (!code || !state) {
    return backHome(request, { classroom: 'error', motivo: 'La respuesta de Google venía incompleta.' });
  }

  const claim = readState(state);
  if (!claim || !isClassroomProfile(claim.profileId)) {
    return backHome(request, { classroom: 'error', motivo: 'La solicitud ha caducado. Vuelve a intentarlo.' });
  }

  try {
    const tokens = await exchangeCode(code, classroomRedirectUri(request));
    await saveClassroomLink({
      owner: claim.owner,
      profileId: claim.profileId,
      email: tokens.email,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    return backHome(request, {
      classroom: 'error',
      perfil: claim.profileId,
      motivo: error instanceof GoogleError ? error.message : 'No se ha podido guardar el permiso de Google.',
    });
  }

  // El permiso ya está guardado; la primera bajada puede fallar sin
  // perderlo, y el fallo queda anotado para que la sección lo cuente.
  try {
    await syncClassroom(claim.owner, claim.profileId);
    return backHome(request, { classroom: 'ok', perfil: claim.profileId });
  } catch (error) {
    return backHome(request, {
      classroom: 'error',
      perfil: claim.profileId,
      motivo: error instanceof GoogleError ? error.message : 'Conectado, pero no se han podido bajar las clases.',
    });
  }
}
