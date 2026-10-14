'use client';

import { Photo } from '@/components/ui/Photo';
import { useEffect, useRef, useState } from 'react';
import { error as haptic } from '@/lib/haptics';
import { DEFAULT_PIN, usesDefaultPin, verifyPin } from '@/lib/settings';
import { useTheme } from '@/hooks/useTheme';
import { accentFor, accentStyle } from '@/lib/profiles';
import type { Profile } from '@/types';

interface PinLockProps {
  profile: Profile;
  onUnlock: () => void;
  onCancel: () => void;
}

/**
 * Bloqueo ligero del módulo privado de pareja. Es una barrera de privacidad
 * doméstica (evita miradas curiosas), no un mecanismo de seguridad: los datos
 * viven en el navegador sin cifrar. El PIN sí se guarda como huella, así que
 * comprobarlo tarda un instante y por eso el botón se desactiva mientras.
 *
 * La foto se muestra desenfocada: identifica el módulo sin desvelar contenido.
 */
export function PinLock({ profile, onUnlock, onCancel }: PinLockProps) {
  const { mode } = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  // La pista del PIN por defecto sólo tiene sentido si nadie lo ha cambiado.
  const [isDefaultPin, setIsDefaultPin] = useState(false);

  useEffect(() => setIsDefaultPin(usesDefaultPin()), []);

  /** Para que la caja tiemble otra vez en cada fallo, no sólo en el primero. */
  const [shakes, setShakes] = useState(0);
  /** Lo último tecleado: una comprobación que llega tarde no vale para otro PIN. */
  const latest = useRef('');

  const fail = () => {
    setError(true);
    setPin('');
    latest.current = '';
    setShakes((n) => n + 1);
    haptic();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setChecking(true);
    const ok = await verifyPin(pin);
    setChecking(false);

    if (ok) {
      onUnlock();
      return;
    }

    fail();
  };

  /**
   * En cuanto lo tecleado es el PIN, se entra: no hace falta buscar el botón.
   * No se sabe cuánto mide el de la casa —sólo se guarda su huella—, así que
   * desde la cuarta cifra se prueba en silencio; un fallo aquí no se acusa,
   * porque puede que falten cifras. Con el de fábrica sí se sabe: cuatro, y
   * a la cuarta se da por enviado.
   */
  const type = (raw: string) => {
    const next = raw.replace(/\D/g, '');
    setPin(next);
    setError(false);
    latest.current = next;
    if (next.length < 4) return;

    void verifyPin(next).then((ok) => {
      if (latest.current !== next) return;
      if (ok) onUnlock();
      else if (isDefaultPin && next.length === DEFAULT_PIN.length) fail();
    });
  };

  return (
    <div
      style={accentStyle(accentFor(profile, mode))}
      className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col items-center justify-center px-4"
    >
      <div className="relative mb-5 h-24 w-24 overflow-hidden rounded-3xl shadow-xl">
        {profile.photo ? (
          <>
            <Photo
              src={profile.photo}
              alt=""
              fill
              sizes="96px"
              className="scale-110 object-cover blur-[6px]"
            />
            <div className="absolute inset-0 bg-black/35" />
          </>
        ) : (
          <div className={`h-full w-full bg-gradient-to-br ${profile.gradient}`} />
        )}
        <span className="absolute inset-0 flex items-center justify-center text-4xl" aria-hidden>
          🔒
        </span>
      </div>

      <h2 className="text-2xl font-bold t-1">{profile.name}</h2>
      <p className="mb-6 text-center text-sm t-3">
        Espacio privado de {profile.role}. Introduce el PIN para continuar.
      </p>

      <form onSubmit={(event) => void submit(event)} className="w-full space-y-3">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- es el único campo de la pantalla
          autoFocus
          maxLength={8}
          value={pin}
          onChange={(e) => type(e.target.value)}
          placeholder="••••"
          aria-label="PIN"
          aria-invalid={error}
          aria-describedby="pin-error"
          key={shakes}
          className={`field w-full px-4 py-3 text-center text-2xl tracking-[0.5em] ${shakes > 0 ? 'shake' : ''}`}
          style={error ? { borderColor: 'var(--danger)' } : undefined}
        />

        <p id="pin-error" role="alert" className="min-h-[1.25rem] text-center text-sm font-semibold t-danger">
          {error ? 'PIN incorrecto' : ''}
        </p>

        <button
          type="submit"
          disabled={pin.length < 4 || checking}
          className="btn-primary w-full py-3 text-base"
        >
          {checking ? 'Comprobando…' : 'Entrar'}
        </button>

        <button type="button" onClick={onCancel} className="btn-ghost w-full py-2.5">
          Volver a los perfiles
        </button>
      </form>

      {isDefaultPin && (
        // El PIN de fábrica no se escribe aquí: quien llega a esta pantalla es
        // justo quien no debería saberlo. Basta con recordar que hay que cambiarlo.
        <p className="mt-6 text-center text-[11px] t-3">
          PIN de fábrica sin cambiar — cámbialo en Ajustes.
        </p>
      )}
    </div>
  );
}
