'use client';

import { useEffect, useState } from 'react';

import { emptyPlan, planOf, planWithMirrors, subscribePlans } from '@/lib/planner';
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

/**
 * Lo mismo, con los ratos de los peques que le tocan a este perfil metidos
 * dentro: lo que lleva «con mamá» en la semana de María, lo de «con papá» en
 * la de Víctor.
 *
 * Escucha lo mismo que la de arriba, así que marcar «con mamá» un entreno en
 * la agenda de Hugo lo hace aparecer en la de María sin recargar nada. En un
 * perfil que no recibe reflejos —los peques, los grupos— devuelve su semana
 * tal cual, así que puede usarse en cualquier sitio sin preguntar antes.
 */
export function useWeekPlanWithMirrors(profileId: ProfileId, on = true): WeekPlan {
  const [plan, setPlan] = useState<WeekPlan>(emptyPlan);

  useEffect(() => {
    const read = () => setPlan(planWithMirrors(profileId, on));
    read();
    return subscribePlans(read);
  }, [profileId, on]);

  return plan;
}
