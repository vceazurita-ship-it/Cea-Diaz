'use client';

import { useEffect, useState } from 'react';

import { defaultLineup, lineupOf, subscribeLineups } from '@/lib/lineup';
import type { Lineup, ProfileId } from '@/types';

/**
 * El equipo que este perfil ha montado con sus cromos.
 *
 * Se arranca vacío y se corrige tras montar, como el modo día/noche: en el
 * servidor no hay `localStorage`, y adivinar aquí desajustaría la
 * hidratación. Luego se sigue escuchando, porque la alineación puede llegar
 * de otro aparato mientras la pantalla está abierta.
 */
export function useLineup(profileId: ProfileId): Lineup {
  const [lineup, setLineup] = useState<Lineup>(defaultLineup);

  useEffect(() => {
    setLineup(lineupOf(profileId));
    return subscribeLineups(() => setLineup(lineupOf(profileId)));
  }, [profileId]);

  return lineup;
}
