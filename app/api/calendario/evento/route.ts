import { NextResponse } from 'next/server';
import { z } from 'zod';
import { activeLink } from '@/lib/calendarLinks';
import {
  GoogleError,
  deleteEvent,
  googleConfigured,
  saveEvent,
  taskToEvent,
} from '@/lib/googleCalendar';
import { PROFILES_BY_ID } from '@/lib/profiles';
import { clientIp, isRateLimited } from '@/lib/rateLimit';
import { calendarSignature } from '@/lib/tasks';
import { adminConfigured, userFromRequest } from '@/lib/supabaseAdmin';
import type { ProfileId, Task, TaskCalendarLink } from '@/types';

/* =========================================================================
 *  /api/calendario/evento — el recado, puesto en el calendario.
 *
 *  Recibe la tarea entera y devuelve el vínculo con el evento creado, que es
 *  lo que la app guarda para poder actualizarlo o retirarlo después. La
 *  zona horaria la manda el móvil: una cita a las 17:00 es a las 17:00 en
 *  casa, no donde le toque correr a la función.
 * ========================================================================= */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TaskSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  title: z.string().min(1).max(300),
  detail: z.string().max(2000).optional(),
  kind: z.enum(['cita', 'colegio', 'compra', 'casa', 'salud', 'trabajo', 'ocio', 'otro']),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration: z.number().int().min(5).max(24 * 60).optional(),
  remindBefore: z.number().int().min(0).max(40320).optional(),
  repeat: z.enum(['none', 'daily', 'weekly', 'monthly']),
  done: z.boolean(),
  calendar: z
    .object({
      eventId: z.string(),
      calendarId: z.string(),
      htmlLink: z.string().optional(),
      signature: z.string(),
      syncedAt: z.string(),
    })
    .optional(),
});

const BodySchema = z.object({
  accion: z.enum(['guardar', 'borrar']),
  task: TaskSchema,
  /** Zona horaria del móvil, tal y como la dice el navegador. */
  timeZone: z.string().min(1).max(64).default('Europe/Madrid'),
});

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (isRateLimited(clientIp(request), { bucket: 'calendario', max: 120 })) {
    return bad('Demasiadas peticiones desde este dispositivo. Espera unos minutos.', 429);
  }

  if (!googleConfigured || !adminConfigured) {
    return bad('El calendario no está configurado en el servidor.', 503);
  }

  const owner = await userFromRequest(request);
  if (!owner) return bad('Hay que entrar en la cuenta de casa.', 401);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad('La tarea que se ha mandado no es válida.', 400);

  const { accion, timeZone } = parsed.data;
  const task = parsed.data.task as Task;

  if (!(task.profileId in PROFILES_BY_ID)) return bad('Perfil desconocido.', 400);

  try {
    const link = await activeLink(owner, task.profileId as ProfileId);

    if (accion === 'borrar') {
      if (task.calendar) {
        await deleteEvent(link.accessToken, task.calendar.calendarId, task.calendar.eventId);
      }
      return NextResponse.json({ ok: true });
    }

    // Un recordatorio necesita un cuándo: sin fecha no hay evento que crear.
    if (!task.due) return bad('Ponle una fecha antes de mandarla al calendario.', 400);

    const profile = PROFILES_BY_ID[task.profileId as ProfileId];
    const body = taskToEvent(task, profile.name, timeZone);

    // Si el evento vivía en otro calendario, se retira de allí antes: mover
    // entre calendarios no es una actualización, son dos operaciones.
    const stale = task.calendar && task.calendar.calendarId !== link.calendarId;
    if (stale && task.calendar) {
      await deleteEvent(link.accessToken, task.calendar.calendarId, task.calendar.eventId);
    }

    const saved = await saveEvent(
      link.accessToken,
      link.calendarId,
      stale ? undefined : task.calendar?.eventId,
      body,
    );

    const calendar: TaskCalendarLink = {
      eventId: saved.id,
      calendarId: link.calendarId,
      htmlLink: saved.htmlLink,
      signature: calendarSignature(task),
      syncedAt: new Date().toISOString(),
    };

    return NextResponse.json({ calendar, calendarName: link.calendarName });
  } catch (error) {
    if (error instanceof GoogleError) return bad(error.message, error.status);
    return bad('No se ha podido escribir en Google Calendar.', 502);
  }
}
