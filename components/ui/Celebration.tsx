'use client';

import { useEffect, useMemo } from 'react';
import { prefersReducedMotion } from '@/lib/haptics';

/**
 * La fiesta de cuando se completa el día.
 *
 * Hasta ahora, rellenar la última casilla no pasaba nada: el contador ponía
 * «día completo 🎉» en letra pequeña y ya. Es el momento que más hay que
 * premiar —sobre todo a los peques, que registran a las nueve de la noche
 * con sueño—, así que salta confeti de los colores del perfil y una tarjeta
 * con su frase. Se va sola a los tres segundos, o con un toque.
 */
export interface CelebrationProps {
  icon: string;
  title: string;
  subtitle?: string;
  onDone: () => void;
}

const COLORS = ['var(--accent)', '#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#f97316'];

export function Celebration({ icon, title, subtitle, onDone }: CelebrationProps) {
  const reduced = typeof window !== 'undefined' && prefersReducedMotion();

  // Las piezas se sortean una vez: cada una con su vuelo, su giro y su tamaño.
  const pieces = useMemo(
    () =>
      reduced
        ? []
        : Array.from({ length: 56 }, (_, i) => {
            const angle = (Math.PI * 2 * i) / 56 + Math.random() * 0.4;
            const reach = 140 + Math.random() * 220;
            return {
              dx: `${Math.round(Math.cos(angle) * reach)}px`,
              // Más hacia abajo que hacia arriba: el confeti cae.
              dy: `${Math.round(Math.sin(angle) * reach * 0.8 + 160 + Math.random() * 120)}px`,
              rot: `${Math.round(Math.random() * 720 - 360)}deg`,
              color: COLORS[i % COLORS.length],
              w: 6 + Math.round(Math.random() * 6),
              h: 8 + Math.round(Math.random() * 8),
              delay: Math.round(Math.random() * 180),
              round: i % 4 === 0,
            };
          }),
    [reduced],
  );

  useEffect(() => {
    const timer = window.setTimeout(onDone, 3200);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onDone();
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/25 px-6 animate-aparece"
      onClick={onDone}
      role="status"
      aria-live="assertive"
    >
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[42%] h-0 w-0">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="absolute block animate-estalla"
            style={
              {
                width: p.w,
                height: p.round ? p.w : p.h,
                background: p.color,
                borderRadius: p.round ? '9999px' : '2px',
                animationDelay: `${p.delay}ms`,
                '--dx': p.dx,
                '--dy': p.dy,
                '--rot': p.rot,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="card relative max-w-xs animate-salta px-6 py-5 text-center shadow-2xl">
        <p className="text-5xl leading-none" aria-hidden>
          {icon}
        </p>
        <p className="mt-3 text-xl font-black leading-tight t-1">{title}</p>
        {subtitle && <p className="mt-1.5 text-sm t-2">{subtitle}</p>}
        <p className="mt-3 text-[11px] font-semibold t-3">Toca para seguir</p>
      </div>
    </div>
  );
}
