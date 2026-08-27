'use client';

import { useEffect, useState } from 'react';

import { emptyPlan, planOf, subscribePlans } from '@/lib/planner';
import type { ProfileId, WeekPlan } from '@/types';

/**
 * La semana tipo de un perfil.
 *
 * Se arranca vacía y se corrige tras montar, como el modo día/noche y como el
 * campograma: en el servidor no hay `localStorage` y adivinar aquí
 * desajustaría la hidratación. Luego se sigue escuchando, porque la agenda
 * puede llegar de otro móvil mientras la pantalla está abierta —que es
 * justamente lo que se espera cuando dos personas organizan la misma semana.
 */
export function useWeekPlan(profileId: ProfileId): WeekPlan {
  const [plan, setPlan] = useState<WeekPlan>(emptyPlan);

  useEffect(() => {
    setPlan(planOf(profileId));
    return subscribePlans(() => setPlan(planOf(profileId)));
  }, [profileId]);

  return plan;
}
