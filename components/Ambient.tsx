'use client';

import type { ProfileSkin } from '@/types';

/**
 * Decoración de fondo, fija y no interactiva. Cada piel tiene la suya: halos
 * de color en la nocturna, franjas de césped y línea de medio campo en la de
 * fútbol, y manchas muy tenues en la editorial.
 *
 * Todo se pinta con el tinte del perfil y con los tokens del modo, así que la
 * misma decoración vale de día y de noche: de noche los halos brillan sobre
 * el fondo oscuro y de día quedan como una acuarela sobre el papel.
 */
export function Ambient({ skin }: { skin: ProfileSkin }) {
  if (skin === 'pitch') {
    return (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        {/* Halo del color del perfil cayendo desde la grada */}
        <div className="bg-tint-halo absolute -top-1/3 left-1/2 h-[80vh] w-[130vw] -translate-x-1/2 rounded-[50%] opacity-25 blur-[110px]" />
        <div className="turf absolute inset-0 opacity-90" />
        {/* Círculo central y línea de medio campo */}
        <div className="absolute left-1/2 top-1/2 h-[62vmin] w-[62vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 chalk opacity-25" />
        <div className="absolute left-0 right-0 top-1/2 h-px chalk border-t opacity-25" />
      </div>
    );
  }

  if (skin === 'editorial') {
    return (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="bg-tint-halo absolute -right-40 top-10 h-[38rem] w-[38rem] rounded-full opacity-[0.18] blur-[110px]" />
        <div className="absolute -left-32 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[var(--surface-2)] opacity-70 blur-[90px]" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="bg-tint-halo absolute -left-32 top-0 h-96 w-96 rounded-full opacity-30 blur-[120px]" />
      <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-accent opacity-[0.14] blur-[120px]" />
      <div className="bg-tint-halo absolute bottom-0 left-1/3 h-96 w-96 rounded-full opacity-[0.16] blur-[120px]" />
    </div>
  );
}
