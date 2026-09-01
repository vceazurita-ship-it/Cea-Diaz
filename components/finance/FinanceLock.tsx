'use client';

import { useEffect, useState } from 'react';

import {
  hasFinanceKey,
  setFinanceKey,
  subscribeSettings,
  verifyFinanceKey,
} from '@/lib/settings';

/* =========================================================================
 *  La puerta de la sección de economía.
 *
 *  Va aparte del PIN de la casa a propósito. El PIN abre el módulo de pareja
 *  y lo saben los dos; esto abre las cuentas de uno solo, así que tiene su
 *  propia clave y su propia huella.
 *
 *  De lo tecleado no se guarda nada: se guarda su huella (PBKDF2-SHA256 con
 *  sal), igual que el PIN. Eso impide leerla del navegador o de la nube, pero
 *  no convierte una clave corta en una contraseña: sigue siendo una barrera
 *  doméstica. Y no está escrita en el código —el repositorio de esta app es
 *  público—, así que la primera vez hay que ponerla aquí.
 *
 *  La huella viaja con el resto de los ajustes, así que la clave es la
 *  misma en el móvil y en el ordenador: se pone una vez y vale para los dos.
 *  Lo que viaja es el resumen, no la clave; con él no se entra.
 * ========================================================================= */

interface FinanceLockProps {
  name: string;
  onUnlock: () => void;
}

export function FinanceLock({ name, onUnlock }: FinanceLockProps) {
  /** `null` mientras no se ha mirado: en el servidor no hay ajustes. */
  const [ready, setReady] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * Se mira tras montar —en el servidor no hay ajustes— y se sigue
   * escuchando. Lo segundo importa: en un aparato recién estrenado la huella
   * puede llegar de la nube un segundo después de abrir esta pantalla, y sin
   * escucharla se ofrecería crear una clave nueva encima de la que ya hay,
   * cambiándosela de paso a todos los demás aparatos.
   */
  useEffect(() => {
    setReady(hasFinanceKey());
    return subscribeSettings(() => setReady(hasFinanceKey()));
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (key.trim().length < 4) {
      setError('Ponle al menos cuatro caracteres.');
      return;
    }
    if (key !== repeat) {
      setError('Las dos no coinciden.');
      return;
    }

    setBusy(true);
    try {
      await setFinanceKey(key);
      onUnlock();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'No se ha podido guardar.');
    } finally {
      setBusy(false);
    }
  };

  const open = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const ok = await verifyFinanceKey(key);
    setBusy(false);

    if (ok) {
      onUnlock();
      return;
    }

    setError('No es ésa.');
    setKey('');
  };

  if (ready === null) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm t-3">Abriendo…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="card p-6 text-center">
        <p className="text-4xl" aria-hidden>
          🔐
        </p>
        <h2 className="mt-2 text-lg font-bold t-1">Economía de {name}</h2>

        {ready ? (
          <>
            <p className="mt-1 text-sm t-3">Esta sección va con su propia clave.</p>
            <form onSubmit={open} className="mt-5 space-y-3">
              <label className="block text-left">
                <span className="sr-only">Clave</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={key}
                  onChange={(event) => {
                    setKey(event.target.value);
                    setError('');
                  }}
                  autoFocus
                  className="field w-full text-center tracking-widest"
                  placeholder="••••••••"
                />
              </label>

              {error && (
                <p className="text-sm font-semibold t-danger" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || key.length === 0}
                className="btn-primary w-full py-2.5"
              >
                {busy ? 'Comprobando…' : 'Entrar'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm leading-relaxed t-3">
              Todavía no hay clave. Ponla ahora y se guardará como huella: ni aquí, ni en la
              nube, ni en el código queda escrita lo que teclees. Vale para todos tus aparatos.
            </p>
            <form onSubmit={create} className="mt-5 space-y-3">
              <label className="block text-left">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">
                  Clave nueva
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={key}
                  onChange={(event) => {
                    setKey(event.target.value);
                    setError('');
                  }}
                  autoFocus
                  className="field w-full"
                />
              </label>

              <label className="block text-left">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">
                  Otra vez
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(event) => {
                    setRepeat(event.target.value);
                    setError('');
                  }}
                  className="field w-full"
                />
              </label>

              {error && (
                <p className="text-sm font-semibold t-danger" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
                {busy ? 'Guardando…' : 'Guardar la clave y entrar'}
              </button>
            </form>
          </>
        )}

        <p className="mt-4 text-[11px] leading-relaxed t-3">
          Es una barrera de andar por casa, no una caja fuerte: lo que se apunte aquí vive sin
          cifrar en el navegador y en la cuenta de la casa. Lo que impide es que alguien que coja
          el móvil desbloqueado se ponga a leer.
        </p>
      </div>
    </div>
  );
}
