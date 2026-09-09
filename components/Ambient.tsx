'use client';

import type { ProfileSkin } from '@/types';

/**
 * Decoración de fondo, fija y no interactiva. Cada piel tiene la suya: halos
 * de color en la nocturna, franjas de césped y línea de medio campo en la de
 * fútbol, manchas muy tenues en la editorial y polvo de destellos con la
 * silueta de un castillo en la de María.
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

  if (skin === 'royal') {
    return (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        {/* Polvo de destellos por todo el fondo, muy diluido. */}
        <div className="stardust absolute inset-0 opacity-[0.14] blur-[60px]" />
        {/* Y las torres, dibujadas con cuatro rectángulos y sus tejados: una
            silueta de castillo al fondo, sin imagen que cargar ni que
            envejezca. Se recorta a la mitad inferior para que no compita con
            el contenido. */}
        <div className="absolute inset-x-0 bottom-0 flex h-[26vh] items-end justify-center gap-3 opacity-[0.07]">
          {[
            { w: 'w-10', h: 'h-[45%]' },
            { w: 'w-14', h: 'h-[70%]' },
            { w: 'w-8', h: 'h-[55%]' },
            { w: 'w-16', h: 'h-[100%]' },
            { w: 'w-8', h: 'h-[52%]' },
            { w: 'w-12', h: 'h-[64%]' },
            { w: 'w-9', h: 'h-[42%]' },
          ].map((tower, index) => (
            <span key={index} className={`relative ${tower.w} ${tower.h} bg-[var(--text)]`}>
              {/* El tejado, recortado en triángulo. Con `clip-path` y no con
                  bordes: los porcentajes de `border-width` no existen, y con
                  medidas fijas cada torre necesitaría las suyas. */}
              <span
                className="absolute inset-x-0 -top-4 h-4 bg-[var(--text)]"
                style={{ clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }}
              />
            </span>
          ))}
        </div>
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
