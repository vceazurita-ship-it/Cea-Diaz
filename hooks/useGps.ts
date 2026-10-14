'use client';

import { useEffect, useState } from 'react';

import { sessionsOf, subscribeGps } from '@/lib/gps';
import type { GpsSession, ProfileId } from '@/types';

/**
 * Las sesiones del rastreador de un perfil, de la más reciente a la más
 * antigua.
 *
 * Vale `null` hasta que se ha leído de verdad tras montar, como la agenda y
 * el campograma: en el servidor no hay `localStorage` y adivinar aquí
 * desajustaría la hidratación. Con `null` quien la usa pinta un esqueleto y
 * no un «todavía no hay nada» que dura un parpadeo y asusta. Luego se sigue
 * escuchando, porque una sesión pegada en el portátil tiene que aparecer en
 * el móvil sin recargar nada.
 */
export function useGpsSessions(profileId: ProfileId): GpsSession[] | null {
  const [sessions, setSessions] = useState<{ of: ProfileId; list: GpsSession[] } | null>(null);

  useEffect(() => {
    const read = () => setSessions({ of: profileId, list: sessionsOf(profileId) });
    read();
    return subscribeGps(read);
  }, [profileId]);

  // Al cambiar de niño, lo leído era del otro: hasta releer, nada.
  return sessions && sessions.of === profileId ? sessions.list : null;
}
