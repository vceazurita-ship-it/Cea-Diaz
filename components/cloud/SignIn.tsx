'use client';

import { useState } from 'react';
import type { HabitStore } from '@/hooks/useHabitStore';

/* =========================================================================
 *  Puerta de entrada a la nube.
 *
 *  Se ve una vez por móvil: después la sesión queda guardada y la app abre
 *  directamente en el selector de perfiles, como siempre. Quien no quiera
 *  nube puede seguir trabajando sólo en ese dispositivo.
 * ========================================================================= */

interface SignInProps {
  store: HabitStore;
}

export function SignIn({ store }: SignInProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Volver a entrar sin la contraseña. Es la única puerta de la casa, así que
   * tiene que haber una forma de abrirla desde el correo; el enlace devuelve
   * aquí con la sesión puesta y la app pide entonces una contraseña nueva.
   */
  const recover = async () => {
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError('Escribe primero el correo de la cuenta de casa.');
      return;
    }

    setBusy(true);
    try {
      await store.sendPasswordReset(email.trim());
      setNotice(
        `Enviado a ${email.trim()}. Abre el enlace desde este mismo aparato y la app te pedirá una contraseña nueva.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se ha podido enviar el correo.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      if (creating) {
        await store.signUp(email.trim(), password);
        setNotice(
          'Cuenta creada. Si Supabase pide confirmar el correo, ábrelo y vuelve a entrar aquí.',
        );
        setCreating(false);
      } else {
        await store.signIn(email.trim(), password);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se ha podido entrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="card p-6">
        <p className="text-4xl" aria-hidden>
          🏡
        </p>
        <h1 className="mt-2 text-xl font-black t-1">Hábitos en Familia</h1>
        <p className="mt-1 text-sm t-2">
          Entra con la cuenta de casa para que los registros se guarden y se vean en todos los
          móviles.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="correo" className="mb-1 block text-xs font-semibold uppercase t-3">
              Correo
            </label>
            <input
              id="correo"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field w-full"
              placeholder="familia@ejemplo.com"
            />
          </div>

          <div>
            <label htmlFor="clave" className="mb-1 block text-xs font-semibold uppercase t-3">
              Contraseña
            </label>
            <input
              id="clave"
              type="password"
              required
              minLength={6}
              autoComplete={creating ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field w-full"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-xs t-danger">⚠️ {error}</p>}
          {notice && <p className="text-xs t-accent">✅ {notice}</p>}

          <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 text-sm">
            {busy ? '⏳ Un momento…' : creating ? 'Crear la cuenta de casa' : 'Entrar'}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setCreating((value) => !value);
              setError(null);
              setNotice(null);
            }}
            className="t-accent font-semibold underline-offset-2 hover:underline"
          >
            {creating ? 'Ya tengo cuenta' : 'Crear la cuenta la primera vez'}
          </button>

          <button
            type="button"
            onClick={() => store.setLocalOnly(true)}
            className="t-3 underline-offset-2 hover:underline"
          >
            Trabajar sólo en este móvil
          </button>
        </div>

        {/* Sólo al entrar: quien está creando la cuenta no tiene nada que
            recuperar todavía. */}
        {!creating && (
          <button
            type="button"
            onClick={() => void recover()}
            disabled={busy}
            className="mt-3 text-xs t-3 underline-offset-2 hover:underline disabled:opacity-50"
          >
            No me acuerdo de la contraseña
          </button>
        )}
      </div>

      <p className="mt-4 px-2 text-center text-[11px] leading-relaxed t-3">
        Los datos de este móvil no se pierden al entrar: se suben a la cuenta y se mezclan con lo
        que ya hubiera.
      </p>
    </div>
  );
}
