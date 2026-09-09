'use client';

import { useEffect, useState } from 'react';

import { sessionsOf, subscribeGps } from '@/lib/gps';
import type { GpsSession, ProfileId } from '@/types';

/** Siempre la misma lista vacía: así el primer pintado no cambia de identidad. */
const NONE: GpsSession[] = [];

/**
 * Las sesiones del rastreador de un perfil, de la más reciente a la más
 * antigua.
 *
 * Se arranca vacía y se corrige tras montar, como la agenda y el campograma:
 * en el servidor no hay `localStorage` y adivinar aquí desajustaría la
 * hidratación. Luego se sigue escuchando, porque una sesión pegada en el
 * portátil tiene que aparecer en el móvil sin recargar nada.
 */
export function useGpsSessions(profileId: ProfileId): GpsSession[] {
  const [sessions, setSessions] = useState<GpsSession[]>(NONE);

  useEffect(() => {
    const read = () => setSessions(sessionsOf(profileId));
    read();
    return subscribeGps(read);
  }, [profileId]);

  return sessions;
}
