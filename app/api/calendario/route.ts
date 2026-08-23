import { NextResponse } from 'next/server';
import {
  activeLink,
  chooseCalendar,
  dropLink,
  listLinks,
} from '@/lib/calendarLinks';
import {
  GoogleError,
  consentUrl,
  googleConfigured,
  listCalendars,
  redirectUri,
  revoke,
  signState,
} from '@/lib/googleCalendar';
import { PROFILES_BY_ID } from '@/lib/profiles';
import { clientIp, isRateLimited } from '@/lib/rateLimit';
import { adminConfigured, userFromRequest } from '@/lib/supabaseAdmin';

/* =========================================================================
 *  /api/calendario — la cuenta de Google de cada perfil.
 *
 *  GET   dice qué perfiles tienen calendario conectado.
 *  POST  conecta, desconecta, lista los calendarios de la cuenta o cambia
 *        en cuál caen los recados.
 *
 *  Todo pasa por la sesión de Supabase: sin ella no se responde nada, que es
 *  la misma regla que rige los datos de la casa.
 * ========================================================================= */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** El motivo por el que la integración no está disponible, ya redactado. */
function missingSetup(): string | null {
  if (!googleConfigured) {
    return 'Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el servidor.';
  }
  if (!adminConfigured) {
    return 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.';
  }
  return null;
}

const noSession = () => bad('Hay que entrar en la cuenta de casa.', 401);

export async function GET(request: Request) {
  const setup = missingSetup();
  // Sin configurar no es un error: la sección de tareas funciona igual, sólo
  // que sin mandar nada a ningún calendario. Se dice y ya está.
  if (setup) return NextResponse.json({ configured: false, reason: setup, links: [] });

  const owner = await userFromRequest(request);
  if (!owner) return noSession();

  try {
    return NextResponse.json({ configured: true, links: await listLinks(owner) });
  } catch {
    return bad('No se ha podido consultar el estado del calendario.', 502);
  }
}

interface Body {
  accion?: string;
  profileId?: string;
  calendarId?: string;
  calendarName?: string;
}

export async function POST(request: Request) {
  if (isRateLimited(clientIp(request), { bucket: 'calendario', max: 120 })) {
    return bad('Demasiadas peticiones desde este dispositivo. Espera unos minutos.', 429);
  }

  const setup = missingSetup();
  if (setup) return bad(setup, 503);

  const owner = await userFromRequest(request);
  if (!owner) return noSession();

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad('La petición no es un JSON válido.', 400);
  }

  const { accion, profileId } = body;
  if (!profileId || !(profileId in PROFILES_BY_ID)) return bad('Perfil desconocido.', 400);

  try {
    switch (accion) {
      case 'conectar': {
        // El consentimiento es una navegación del navegador, así que no puede
        // llevar cabecera de sesión: quién pide qué viaja firmado en `state`.
        const state = signState({ owner, profileId, at: Date.now() });
        return NextResponse.json({ url: consentUrl(redirectUri(request), state) });
      }

      case 'calendarios': {
        const link = await activeLink(owner, profileId);
        return NextResponse.json({ calendars: await listCalendars(link.accessToken) });
      }

      case 'comprobar': {
        // Pedir un token de acceso es la forma más barata de saber si el
        // permiso sigue vivo, y `activeLink` ya deja anotado el resultado.
        const link = await activeLink(owner, profileId);
        return NextResponse.json({ ok: true, email: link.email, calendarName: link.calendarName });
      }

      case 'elegir': {
        const { calendarId, calendarName } = body;
        if (!calendarId) return bad('Falta el calendario.', 400);
        await chooseCalendar(owner, profileId, calendarId, calendarName ?? calendarId);
        return NextResponse.json({ ok: true });
      }

      case 'desconectar': {
        const refreshToken = await dropLink(owner, profileId);
        // Se retira también en la cuenta de Google: quitar el enlace aquí y
        // dejar el permiso vivo allí sería quedarse a medias.
        if (refreshToken) await revoke(refreshToken);
        return NextResponse.json({ ok: true });
      }

      default:
        return bad('Acción desconocida.', 400);
    }
  } catch (error) {
    if (error instanceof GoogleError) return bad(error.message, error.status);
    return bad('No se ha podido hablar con Google Calendar.', 502);
  }
}
