import { NextResponse } from 'next/server';
import { ColegioBloqueaError, classroomConsentUrl, classroomRedirectUri } from '@/lib/classroom';
import {
  dropClassroomLink,
  getClassroomLink,
  listClassroomLinks,
  syncClassroom,
} from '@/lib/classroomLinks';
import { isClassroomProfile } from '@/lib/classroomModel';
import { GoogleError, googleConfigured, revoke, signState } from '@/lib/googleCalendar';
import { clientIp, isRateLimited } from '@/lib/rateLimit';
import { adminConfigured, userFromRequest } from '@/lib/supabaseAdmin';

/* =========================================================================
 *  /api/classroom — las clases de Leo y de Hugo, sólo para leer.
 *
 *  GET   dice qué niño tiene Classroom conectado y entrega la última foto
 *        de sus clases (`?perfil=leo` para uno solo).
 *  POST  conecta, desconecta o vuelve a bajar las clases (`sincronizar`).
 *
 *  No hay cron: la sección baja de nuevo al abrirse si la foto tiene más de
 *  seis horas, y con el botón «Actualizar». Como en el calendario, todo pasa
 *  por la sesión de Supabase.
 * ========================================================================= */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Bajar diez clases con sus tareas, avisos y materiales son unas cuantas
// decenas de consultas a Google: mejor con margen.
export const maxDuration = 60;

function bad(message: string, status: number, codigo?: string) {
  return NextResponse.json({ error: message, ...(codigo ? { codigo } : {}) }, { status });
}

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
  // Sin configurar no es un error: la sección lo dice con discreción.
  if (setup) return NextResponse.json({ configured: false, reason: setup, links: [] });

  const owner = await userFromRequest(request);
  if (!owner) return noSession();

  const perfil = new URL(request.url).searchParams.get('perfil');

  try {
    if (perfil) {
      if (!isClassroomProfile(perfil)) return bad('Perfil sin Classroom.', 400);
      const link = await getClassroomLink(owner, perfil);
      return NextResponse.json({ configured: true, links: link ? [link] : [] });
    }
    return NextResponse.json({ configured: true, links: await listClassroomLinks(owner) });
  } catch {
    // Lo más probable: la tabla aún no existe porque falta lanzar
    // `supabase/classroom.sql`. Se dice como «sin configurar».
    return NextResponse.json({
      configured: false,
      reason: 'Falta crear la tabla de Classroom en Supabase (supabase/classroom.sql).',
      links: [],
    });
  }
}

interface Body {
  accion?: string;
  profileId?: string;
}

export async function POST(request: Request) {
  if (isRateLimited(clientIp(request), { bucket: 'classroom', max: 60 })) {
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
  if (!isClassroomProfile(profileId)) return bad('Classroom sólo está para Leo y Hugo.', 400);

  try {
    switch (accion) {
      case 'conectar': {
        // Navegación del navegador, sin cabecera de sesión: quién pide qué
        // viaja firmado en `state`, con la misma firma que el calendario.
        const state = signState({ owner, profileId, at: Date.now() });
        return NextResponse.json({ url: classroomConsentUrl(classroomRedirectUri(request), state) });
      }

      case 'sincronizar': {
        return NextResponse.json({ link: await syncClassroom(owner, profileId) });
      }

      case 'desconectar': {
        const refreshToken = await dropClassroomLink(owner, profileId);
        if (refreshToken) await revoke(refreshToken);
        return NextResponse.json({ ok: true });
      }

      default:
        return bad('Acción desconocida.', 400);
    }
  } catch (error) {
    if (error instanceof ColegioBloqueaError) return bad(error.message, 403, 'colegio');
    if (error instanceof GoogleError) {
      return bad(error.message, error.status, error.status === 401 ? 'permiso' : undefined);
    }
    return bad('No se ha podido hablar con Google Classroom.', 502);
  }
}
