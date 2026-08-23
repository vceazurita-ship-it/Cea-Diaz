'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { loadSettings, subscribeSettings, updateSettings } from '@/lib/settings';
import type { ThemeMode, ThemePreference } from '@/types';

/* =========================================================================
 *  Modo día / noche.
 *
 *  Una sola elección para toda la app, guardada en este móvil. Por defecto
 *  es `auto`: la app arranca como esté el teléfono, que es lo que la gente
 *  espera y lo que evita deslumbrar a las once de la noche. En cuanto se
 *  toca el interruptor, manda la elección y se recuerda.
 *
 *  La elección viaja a la nube con el resto de ajustes de la casa
 *  (`lib/settings.ts`): se pone una vez y vale en todos los aparatos. Quien
 *  quiera que cada uno vaya a su aire tiene `auto`, que sigue a cada móvil.
 * ========================================================================= */

/** Lo que quiere el móvil ahora mismo. */
function systemMode(): ThemeMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export interface ThemeValue {
  /** Lo elegido: `auto`, `light` o `dark`. */
  preference: ThemePreference;
  /** Lo que se pinta de verdad, con `auto` ya resuelto. */
  mode: ThemeMode;
  setPreference: (preference: ThemePreference) => void;
  /** Alterna día ↔ noche de un toque, fijando la elección. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme necesita <ThemeProvider>.');
  return value;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Se arranca en `auto` + noche y se corrige tras montar: en el servidor no
  // hay `localStorage` ni `matchMedia`, y adivinar aquí desajustaría la
  // hidratación. El parpadeo lo evita el guion de `app/layout.tsx`, que ya
  // ha pintado el modo correcto antes de que React llegue.
  const [preference, setPreferenceState] = useState<ThemePreference>('auto');
  const [system, setSystem] = useState<ThemeMode>('dark');

  useEffect(() => {
    setPreferenceState(loadSettings().theme);
    setSystem(systemMode());

    // Y se sigue escuchando: el modo puede llegar de otro aparato en mitad
    // de la tarde, y la app debe cambiar sola.
    return subscribeSettings(() => setPreferenceState(loadSettings().theme));
  }, []);

  // Si el móvil cambia de modo (al anochecer, por ejemplo) y aquí está
  // puesto `auto`, la app lo acompaña sin que nadie toque nada.
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(query.matches ? 'dark' : 'light');

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const mode: ThemeMode = preference === 'auto' ? system : preference;

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    updateSettings({ theme: next });
  }, []);

  const toggle = useCallback(() => {
    setPreference(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setPreference]);

  const value = useMemo<ThemeValue>(
    () => ({ preference, mode, setPreference, toggle }),
    [preference, mode, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
