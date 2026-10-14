'use client';

import { useCallback, useEffect, useState } from 'react';

/* =========================================================================
 *  Lo que cada aparato recuerda de cómo se miraba algo: la pestaña elegida,
 *  el zoom de la agenda, el filtro del GPS.
 *
 *  Es comodidad de quien mira, no registro de la casa: se queda en este
 *  aparato y no viaja a la nube. Se lee después de montar para que el HTML
 *  del servidor y el primer pintado del navegador coincidan; y si el
 *  navegador no deja guardar —modo privado—, sigue funcionando sin recordar.
 * ========================================================================= */

const PREFIX = 'habitos-familia:ui:';

export function useRemembered<T extends string | boolean | number>(
  key: string,
  initial: T,
  valid?: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (valid ? valid(parsed) : typeof parsed === typeof initial) setValue(parsed as T);
    } catch {
      // Sin almacenamiento: vale lo de por defecto.
    }
    // `initial` y `valid` no cambian de una vuelta a otra a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const remember = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(next));
      } catch {
        // Cuota llena o modo privado: se recuerda sólo en esta sesión.
      }
    },
    [key],
  );

  return [value, remember] as const;
}

/** Un validador para los `useRemembered` que eligen entre unas pocas opciones. */
export function oneOf<T extends string>(options: readonly T[]) {
  return (value: unknown): value is T => typeof value === 'string' && options.includes(value as T);
}
