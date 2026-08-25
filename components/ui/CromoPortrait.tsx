'use client';

import { useAppearance } from '@/hooks/useAppearance';
import { tieneRetrato, faceOf, kitOf, type Beard, type HairStyle, type Kit } from '@/lib/cromoArt';
import { getProfile } from '@/lib/profiles';
import type { CromoReward } from '@/types';

/* =========================================================================
 *  La imagen del cromo.
 *
 *  Cuatro caminos, en este orden:
 *
 *  1. Si el cromo es de alguien de la casa (`profile`), su foto: la que
 *     tenga puesta ese perfil ahora mismo, no la de fábrica. Cambiar la foto
 *     desde los ajustes de aspecto cambia también el cromo.
 *  2. Si el cromo trae `photo`, esa ruta. Es el hueco para las fotos de
 *     verdad que algún día vivan en `public/photos/cromos/`.
 *  3. Si es una persona —un jugador, una cantante—, se dibuja: la ropa de su
 *     equipo o de su mazo, el dorsal si lo tiene y su cara.
 *  4. Si no es nadie —la mesa de la cena, una técnica—, el emoji.
 *
 *  El dibujo es SVG en línea: ni una petición de red, se ve igual sin
 *  cobertura y escala sin pixelarse desde los 44px del campograma hasta la
 *  ficha grande del álbum.
 * ========================================================================= */

/** Tamaños con los que se pide el retrato desde los distintos sitios. */
type Size = 'xs' | 'sm' | 'md' | 'lg';

const BOX: Record<Size, string> = {
  xs: 'h-9 w-9',
  sm: 'h-11 w-11 sm:h-12 sm:w-12',
  md: 'h-16 w-16',
  lg: 'h-24 w-20',
};

/** El emoji cae dentro del hueco, así que se escala con él. */
const EMOJI: Record<Size, string> = {
  xs: 'text-base',
  sm: 'text-lg sm:text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
};

/* -------------------------------------------------------------------------
 * Piezas del dibujo
 * ----------------------------------------------------------------------- */

/**
 * El pecho, con el dibujo de su equipación. Sale del cuello hacia abajo y se
 * corta con el marco redondo, que es lo que le da el aire de foto de carné.
 */
function Camiseta({ kit, id }: { kit: Kit; id: string }) {
  const cuerpo = <path d="M18 120 V88 Q50 72 82 88 V120 Z" fill={kit.shirt} />;

  return (
    <g>
      {cuerpo}

      {kit.pattern === 'rayas' && (
        <g clipPath={`url(#torso-${id})`}>
          {[24, 40, 56, 72].map((x) => (
            <rect key={x} x={x} y="70" width="8" height="50" fill={kit.trim} />
          ))}
        </g>
      )}

      {kit.pattern === 'mitades' && (
        <g clipPath={`url(#torso-${id})`}>
          <rect x="50" y="70" width="40" height="50" fill={kit.trim} />
        </g>
      )}

      {kit.pattern === 'banda' && (
        <g clipPath={`url(#torso-${id})`}>
          <path d="M12 120 L64 74 L80 74 L28 120 Z" fill={kit.trim} />
        </g>
      )}

      {kit.pattern === 'mangas' && (
        <g clipPath={`url(#torso-${id})`}>
          <rect x="12" y="70" width="14" height="50" fill={kit.trim} />
          <rect x="74" y="70" width="14" height="50" fill={kit.trim} />
        </g>
      )}

      {/* Cuello en pico, del color con el que se lee el dorsal. */}
      <path d="M41 84 L50 96 L59 84 Z" fill={kit.ink} opacity="0.85" />
    </g>
  );
}

/**
 * Casquete de pelo: sigue el alto de la cabeza por fuera y baja hasta el
 * nacimiento del pelo por dentro, justo por encima de las cejas. Es la base
 * de casi todos los cortes; los demás le añaden algo.
 */
const CASQUETE = 'M29 52 A21 24 0 0 1 71 52 Q65 43 50 42 Q35 43 29 52 Z';

/**
 * El pelo. Cada corte es una silueta distinta por encima de la cabeza; el
 * rapado deja el cráneo casi a la vista, que también es un corte.
 */
function Pelo({ style, color }: { style: HairStyle; color: string }) {
  switch (style) {
    case 'rapado':
      // Al cero: se adivina el nacimiento del pelo y poco más.
      return (
        <path
          d="M29 52 A21 24 0 0 1 71 52 Q66 39 50 38 Q34 39 29 52 Z"
          fill={color}
          opacity="0.45"
        />
      );

    case 'corto':
      return <path d={CASQUETE} fill={color} />;

    case 'trenzas':
      // Trenzas pegadas al cráneo, de la frente hacia atrás.
      return (
        <g fill={color}>
          <path d={CASQUETE} />
          <g fill="#000" opacity="0.28">
            {[36, 43, 50, 57, 64].map((x) => (
              <rect key={x} x={x - 0.7} y="30" width="1.4" height="16" rx="0.7" />
            ))}
          </g>
        </g>
      );

    case 'rizado':
      // Bucles: el borde de arriba va a bultos, para que no parezca un gorro.
      return (
        <g fill={color}>
          <path d={CASQUETE} />
          <circle cx="33" cy="42" r="6" />
          <circle cx="41" cy="33" r="7" />
          <circle cx="50" cy="30" r="7.5" />
          <circle cx="59" cy="33" r="7" />
          <circle cx="67" cy="42" r="6" />
        </g>
      );

    case 'afro':
      // Se apoya justo encima de las cejas: si baja más, tapa los ojos.
      return <ellipse cx="50" cy="33" rx="24" ry="16" fill={color} />;

    case 'largo':
      return (
        <g fill={color}>
          <path d={CASQUETE} />
          {/* Melena: cae por detrás de las orejas, sin taparle la cara. */}
          <path d="M29 50 Q27 64 30 72 L34 72 Q31 62 32 50 Z" />
          <path d="M71 50 Q73 64 70 72 L66 72 Q69 62 68 50 Z" />
        </g>
      );

    case 'cresta':
      return (
        <g fill={color}>
          <path
            d="M29 52 A21 24 0 0 1 71 52 Q66 40 50 39 Q34 40 29 52 Z"
            opacity="0.5"
          />
          <path d="M43 36 Q50 16 57 36 Q50 30 43 36 Z" />
        </g>
      );

    case 'moño':
      return (
        <g fill={color}>
          <path d={CASQUETE} />
          <circle cx="50" cy="26" r="7.5" />
        </g>
      );
  }
}

/** La barba, si la lleva. Va por encima de la boca y por debajo de la nariz. */
function Barba({ beard, color }: { beard: Beard; color: string }) {
  if (beard === 'no') return null;

  return beard === 'corta' ? (
    <path d="M36 62 Q50 78 64 62 Q50 70 36 62 Z" fill={color} opacity="0.5" />
  ) : (
    <path d="M33 56 Q34 82 50 84 Q66 82 67 56 Q50 72 33 56 Z" fill={color} opacity="0.75" />
  );
}

/* -------------------------------------------------------------------------
 * Retrato
 * ----------------------------------------------------------------------- */

/**
 * El dibujo completo. El `id` del cromo hace doble papel: decide la cara y da
 * nombre único a los recortes del SVG, que si no chocarían entre sí al haber
 * treinta retratos en la misma página.
 */
function Dibujo({ cromo }: { cromo: CromoReward }) {
  const kit = kitOf(cromo);
  const face = faceOf(cromo.id, cromo.look);
  const clip = cromo.id.replace(/[^a-z0-9-]/gi, '');

  return (
    <svg viewBox="0 0 100 120" className="h-full w-full" role="presentation" aria-hidden>
      <defs>
        <clipPath id={`torso-${clip}`}>
          <path d="M18 120 V88 Q50 72 82 88 V120 Z" />
        </clipPath>
        <linearGradient id={`fondo-${clip}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={kit.shirt} stopOpacity="0.35" />
          <stop offset="100%" stopColor={kit.trim} stopOpacity="0.15" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="100" height="120" fill={`url(#fondo-${clip})`} />

      <Camiseta kit={kit} id={clip} />

      {/* Cuello. */}
      <rect x="43" y="70" width="14" height="18" rx="6" fill={face.skin} />

      {/* Orejas y cabeza. */}
      <circle cx="30" cy="54" r="5" fill={face.skin} />
      <circle cx="70" cy="54" r="5" fill={face.skin} />
      <ellipse cx="50" cy="52" rx="20" ry="23" fill={face.skin} />

      <Pelo style={face.style} color={face.hair} />

      {/* Cejas, ojos, nariz y boca: lo justo para que sea una cara. */}
      <g fill="#2b2320">
        <rect x="38" y="48" width="9" height="2" rx="1" opacity="0.7" />
        <rect x="53" y="48" width="9" height="2" rx="1" opacity="0.7" />
        <circle cx="42.5" cy="55" r="2.4" />
        <circle cx="57.5" cy="55" r="2.4" />
      </g>
      <path
        d="M50 57 L50 63"
        stroke="#2b2320"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.35"
        fill="none"
      />
      <path
        d="M45 68 Q50 72 55 68"
        stroke="#2b2320"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.6"
        fill="none"
      />

      <Barba beard={face.beard} color={face.hair} />

      {/* El dorsal, si se sabe. Es lo que remata el aire de cromo. */}
      {cromo.number !== undefined && (
        <text
          x="50"
          y="115"
          textAnchor="middle"
          fontSize="18"
          fontWeight="900"
          fill={kit.ink}
          opacity="0.9"
        >
          {cromo.number}
        </text>
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * Hueco de la imagen
 * ----------------------------------------------------------------------- */

interface CromoPortraitProps {
  cromo: CromoReward;
  size?: Size;
  /** Marco redondo para las fichas pequeñas del campograma. */
  round?: boolean;
  className?: string;
}

export function CromoPortrait({
  cromo,
  size = 'md',
  round = false,
  className = '',
}: CromoPortraitProps) {
  const { dress } = useAppearance();
  const marco = `${BOX[size]} shrink-0 overflow-hidden ${round ? 'rounded-full' : 'rounded-xl'}`;

  // La foto de los de casa se pide vestida: así vale la que hayan puesto
  // ellos y no la de fábrica. Los peques tienen además su cromo recortado.
  const suyo = cromo.profile ? dress(getProfile(cromo.profile)) : null;
  const foto = suyo ? suyo.card ?? suyo.photo : cromo.photo;

  if (foto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- son ficheros locales ya recortados
      <img
        src={foto}
        alt={cromo.name}
        className={`${marco} object-cover ${className}`}
        loading="lazy"
      />
    );
  }

  if (!tieneRetrato(cromo)) {
    return (
      <span
        className={`${marco} flex items-center justify-center bg-black/20 leading-none
          ${EMOJI[size]} ${className}`}
        aria-hidden
      >
        {cromo.emblem}
      </span>
    );
  }

  return (
    <span className={`${marco} block bg-black/20 ${className}`}>
      <Dibujo cromo={cromo} />
    </span>
  );
}
