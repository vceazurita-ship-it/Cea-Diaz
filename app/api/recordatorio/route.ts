import { NextResponse } from 'next/server';

/* =========================================================================
 *  El recordatorio de cada noche, como evento de calendario.
 *
 *  Los días que se quedan sin apuntar son casi siempre olvidos: a las 21 h
 *  hay baño, cena y cama, y el registro se queda para mañana. Una
 *  notificación de verdad pediría un servidor de avisos y, en el iPhone,
 *  tener la app instalada; un evento diario con alarma en el calendario del
 *  móvil hace lo mismo sin nada de eso: se abre este enlace, el móvil
 *  pregunta «¿añadir al calendario?» y desde esa noche suena solo.
 *
 *  La hora va en la dirección (`?h=21:00`). La hora es «flotante», sin zona:
 *  suena a las 21:00 de donde esté el móvil, también al cambiar la hora.
 * ========================================================================= */

export const dynamic = 'force-dynamic';

const APP = 'https://cea-diaz.vercel.app';

function dos(n: number): string {
  return String(n).padStart(2, '0');
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const m = /^(\d{1,2}):(\d{2})$/.exec(url.searchParams.get('h') ?? '21:00');
  const hora = m ? Math.min(23, Number(m[1])) : 21;
  const minuto = m ? Math.min(59, Number(m[2])) : 0;

  const hoy = new Date();
  const dia = `${hoy.getFullYear()}${dos(hoy.getMonth() + 1)}${dos(hoy.getDate())}`;
  const sello = `${hoy.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Habitos en Familia//Recordatorio//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:recordatorio-registro-${dos(hora)}${dos(minuto)}@habitos-familia`,
    `DTSTAMP:${sello}`,
    `DTSTART:${dia}T${dos(hora)}${dos(minuto)}00`,
    'DURATION:PT10M',
    'RRULE:FREQ=DAILY',
    'SUMMARY:📝 Apuntar el día en Hábitos',
    `DESCRIPTION:Dos minutos: el registro de hoy y los retos del cole. ${APP}`,
    `URL:${APP}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Apuntar el día en Hábitos',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="recordatorio-habitos.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
