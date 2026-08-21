'use client';

import Image from 'next/image';
import { useState } from 'react';
import { DEFAULT_PIN, loadPin } from '@/lib/storage';
import type { Profile } from '@/types';

interface PinLockProps {
  profile: Profile;
  onUnlock: () => void;
  onCancel: () => void;
}

/**
 * Bloqueo ligero del módulo privado de pareja. Es una barrera de privacidad
 * doméstica (evita miradas curiosas), no un mecanismo de seguridad: los datos
 * viven en el navegador sin cifrar.
 *
 * La foto se muestra desenfocada: identifica el módulo sin desvelar contenido.
 */
export function PinLock({ profile, onUnlock, onCancel }: PinLockProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pin === loadPin()) {
      onUnlock();
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col items-center justify-center px-4">
      <div className="relative mb-5 h-24 w-24 overflow-hidden rounded-3xl shadow-xl">
        {profile.photo ? (
          <>
            <Image
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
        <span className="absolute inset-0 flex items-center justify-center text-4xl">🔒</span>
      </div>

      <h2 className="text-2xl font-bold t-1">{profile.name}</h2>
      <p className="mb-6 text-center text-sm t-3">
        Espacio privado de {profile.role}. Introduce el PIN para continuar.
      </p>

      <form onSubmit={submit} className="w-full space-y-3">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ''));
            setError(false);
          }}
          placeholder="••••"
          aria-label="PIN"
          className="field w-full px-4 py-3 text-center text-2xl tracking-[0.5em]"
          style={error ? { borderColor: 'var(--danger)' } : undefined}
        />

        {error && <p className="t-danger text-center text-sm font-semibold">PIN incorrecto</p>}

        <button
          type="submit"
          disabled={pin.length < 4}
          className="btn w-full py-3 text-base font-bold disabled:opacity-40"
          style={{ backgroundColor: profile.accent, color: 'var(--on-accent)' }}
        >
          Entrar
        </button>

        <button type="button" onClick={onCancel} className="btn-ghost w-full py-2.5">
          Volver a los perfiles
        </button>
      </form>

      <p className="mt-6 text-center text-[11px] t-3">
        PIN por defecto: <span className="font-mono font-bold">{DEFAULT_PIN}</span>. Se puede cambiar
        en Ajustes.
      </p>
    </div>
  );
}
