import { NextResponse } from 'next/server';
import { footbarConfigured } from '@/lib/footbar';
import { syncEverything } from '@/lib/footbarSync';
import { adminConfigured } from '@/lib/supabaseAdmin';

/* =========================================================================
 *  /api/footbar/cron — la revisión de cada día a las 21:00 de Madrid.
 *
 *  La programa Vercel (`vercel.json`), que sólo sabe de hora UTC y no de
 *  horario de verano. Por eso hay **dos** programaciones —19:00 y 20:00 UTC—
 *  y aquí se deja pasar sólo la que cae a las 21 en Madrid: en verano la
 *  primera, en invierno la segunda. Así la revisión es a las nueve de la
 *  noche todo el año sin tocar nada en marzo ni en octubre.
 *
 *  Si el servidor tiene `CRON_SECRET`, Vercel lo manda y aquí se exige: nadie
 *  más puede lanzar la revisión desde fuera.
 * ========================================================================= */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** La hora en Madrid ahora mismo. */
function madridHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(
      new Date(),
    ),
  );
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  if (!footbarConfigured || !adminConfigured) {
    return NextResponse.json({ skipped: 'Footbar no está configurado en el servidor.' });
  }

  // Forzarla fuera de hora sólo vale con el secreto puesto: si no, cualquiera
  // podría gastar las consultas de la semana llamando a esta dirección.
  const force = Boolean(secret) && new URL(request.url).searchParams.get('ahora') === '1';
  if (!force && madridHour() !== 21) {
    return NextResponse.json({ skipped: 'No son las 21:00 en Madrid: esta vuelta es la del otro horario.' });
  }

  const results = await syncEverything();
  return NextResponse.json({ at: new Date().toISOString(), results });
}
