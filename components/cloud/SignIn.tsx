'use client';

import { useState } from 'react';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
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

/**
 * Lo que contesta Supabase viene en inglés y en idioma de programador
 * («Invalid login credentials»). Aquí se traduce a lo que le pasa a quien
 * está delante; lo que no se reconoce se deja tal cual, que algo dice.
 */
const ERRORES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'El correo o la contraseña no coinciden.'],
  [/email not confirmed/i, 'Falta confirmar el correo: abre el enlace que os llegó y vuelve aquí.'],
  [/already registered|already exists/i, 'Ese correo ya tiene cuenta. Entra con él en vez de crearla.'],
  [/password should be at least|password.*(short|characters)/i, 'La contraseña tiene que tener al menos 6 caracteres.'],
  [/invalid format|unable to validate email|invalid email/i, 'Ese correo no parece bien escrito.'],
  [/rate limit|too many|only request this after/i, 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.'],
  [/signups? not allowed|signup is disabled/i, 'En esta casa no se pueden crear cuentas nuevas. Entra con la que ya hay.'],
  [/failed to fetch|network|load failed/i, 'No hay conexión con la nube. Mira la cobertura y vuelve a probar.'],
];

function enCastellano(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message : '';
  if (!message) return fallback;
  return ERRORES.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

export function SignIn({ store }: SignInProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      setError(enCastellano(cause, 'No se ha podido enviar el correo.'));
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
      setError(enCastellano(cause, 'No se ha podido entrar.'));
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
            {/* Con el teclado del móvil, una contraseña a ciegas se equivoca
                mucho: se puede ver antes de enviarla. */}
            <div className="relative">
              <input
                id="clave"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete={creating ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field w-full pr-12"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl t-3 hover:t-1"
              >
                <span aria-hidden>{showPassword ? '🙈' : '👁️'}</span>
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs t-danger">
              ⚠️ {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-xs t-accent">
              ✅ {notice}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 text-sm">
            {busy ? '⏳ Un momento…' : creating ? 'Crear la cuenta de casa' : 'Entrar'}
          </button>
        </form>

        {/* Enlaces con alto de dedo: con `text-xs` a secas se quedaban en
            dieciséis píxeles y había que acertar con la uña. */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setCreating((value) => !value);
              setError(null);
              setNotice(null);
            }}
            className="min-h-[44px] t-accent font-semibold underline-offset-2 hover:underline"
          >
            {creating ? 'Ya tengo cuenta' : 'Crear la cuenta la primera vez'}
          </button>

          {/* Quedarse sin nube no se deshace desde aquí —esta pantalla ya no
              vuelve a salir—, así que se pregunta antes. */}
          <ConfirmButton
            question="¿Sin cuenta de casa? No se verá en otros móviles."
            confirmLabel="Sí, sólo aquí"
            confirmClassName="btn-primary px-3 py-1.5 text-xs"
            onConfirm={() => store.setLocalOnly(true)}
            className="min-h-[44px] t-3 underline-offset-2 hover:underline"
          >
            Trabajar sólo en este móvil
          </ConfirmButton>
        </div>

        {/* Sólo al entrar: quien está creando la cuenta no tiene nada que
            recuperar todavía. */}
        {!creating && (
          <button
            type="button"
            onClick={() => void recover()}
            disabled={busy}
            className="mt-1 min-h-[44px] text-sm t-3 underline-offset-2 hover:underline disabled:opacity-50"
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
