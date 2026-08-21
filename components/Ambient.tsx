'use client';

import type { ProfileSkin } from '@/types';

/**
 * Decoración de fondo, fija y no interactiva. Cada piel tiene la suya:
 * halos de color en la nocturna, franjas de césped y línea de cal en la de
 * fútbol, y un degradado de papel muy tenue en la editorial.
 */
export function Ambient({ skin }: { skin: ProfileSkin }) {
  if (skin === 'pitch') {
    return (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(16,120,72,0.35),transparent)]" />
        <div className="turf absolute inset-0 opacity-90" />
        <div className="absolute inset-x-0 top-0 h-[45vh] bg-gradient-to-b from-emerald-400/10 to-transparent" />
        {/* Círculo central y línea de medio campo */}
        <div className="absolute left-1/2 top-1/2 h-[62vmin] w-[62vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/[0.05]" />
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/[0.05]" />
      </div>
    );
  }

  if (skin === 'editorial') {
    return (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_15%_0%,rgba(255,255,255,0.9),transparent)]" />
        <div className="absolute -right-40 top-10 h-[38rem] w-[38rem] rounded-full bg-[var(--surface-2)] opacity-70 blur-[90px]" />
        <div className="absolute -left-32 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[var(--surface-2)] opacity-60 blur-[90px]" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-fuchsia-600/15 blur-[120px]" />
      <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-emerald-600/10 blur-[120px]" />
    </div>
  );
}
