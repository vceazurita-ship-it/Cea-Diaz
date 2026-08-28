'use client';

import { useEffect, useState } from 'react';
import { todayKey } from '@/lib/dates';
import type { DateKey } from '@/types';

/**
 * El día de hoy, y que siga siéndolo.
 *
 * `todayKey()` se resuelve al pintar, así que una app abierta y quieta —la
 * tableta de la cocina, el portátil que nadie cierra— se queda con el día en
 * que se abrió. Pasada la medianoche eso no es un detalle: «Hoy» sigue
 * señalando a ayer, lo que se registre entra en el día equivocado, la racha
 * no avanza y el juego del día no se renueva.
 *
 * Aquí se despierta a la app justo al cambiar el día. Y como suspender el
 * portátil congela los temporizadores, se vuelve a mirar el reloj de verdad
 * cada vez que la pestaña se pone delante: lo que manda es la fecha, nunca
 * lo que hubiera programado.
 */
export function useToday(): DateKey {
  const [today, setToday] = useState<DateKey>(todayKey);

  useEffect(() => {
    let timer = 0;

    const schedule = () => {
      const now = new Date();
      // Dos segundos pasada la medianoche: cruzarla con holgura evita que un
      // reloj que se adelanta un pelo devuelva todavía el día anterior.
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setToday(todayKey());
        schedule();
      }, next.getTime() - now.getTime());
    };

    // Al volver a mirar la pestaña se comprueba la fecha real y se reprograma:
    // si el aparato ha estado suspendido, el temporizador de arriba no ha
    // corrido y podría haber quedado apuntando a una medianoche ya pasada.
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      setToday(todayKey());
      schedule();
    };

    schedule();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  return today;
}
