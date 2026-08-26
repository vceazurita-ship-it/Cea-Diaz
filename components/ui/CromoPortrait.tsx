'use client';

import { Cabeza, Camiseta, Rayos, TINTA } from '@/components/ui/CromoFace';
import { EscenaCasa, tieneEscena } from '@/components/ui/EscenaCasa';
import { useAppearance } from '@/hooks/useAppearance';
import { faceOf, kitOf, tieneRetrato } from '@/lib/cromoArt';
import { getProfile } from '@/lib/profiles';
import type { CromoReward } from '@/types';

/* =========================================================================
 *  La imagen del cromo.
 *
 *  Cinco caminos, en este orden:
 *
 *  1. Si el cromo de casa tiene ilustración propia —la mesa de la cena, el
 *     taxi de los entrenos, los cuatro al completo—, se dibuja esa escena.
 *     Ver `EscenaCasa`. Manda sobre la foto a propósito: el álbum de casa es
 *     un álbum ilustrado, y una foto en medio de trece dibujos desentona.
 *  2. Si el cromo es de alguien de la casa (`profile`), su foto: la que
 *     tenga puesta ese perfil ahora mismo, no la de fábrica.
 *  3. Si el cromo trae `photo`, esa ruta. Es el hueco para las fotos de
 *     verdad que algún día vivan en `public/photos/cromos/`.
 *  4. Si es una persona —un jugador, una cantante—, se dibuja: la ropa de su
 *     equipo o de su mazo, el dorsal si lo tiene y su cara.
 *  5. Si no es nadie —una técnica, la colada—, el emoji.
 *
 *  El dibujo es SVG en línea: ni una petición de red, se ve igual sin
 *  cobertura y escala sin pixelarse desde los 36px del campograma hasta la
 *  ficha grande del álbum.
 *
 *  El estilo es el de Oliver y Benji, que es lo que suena de himno en las
 *  secciones de Leo y de Hugo: ojos grandes con brillo, ceja marcada, pelo de
 *  puntas y el estallido de rayos detrás. Las piezas están en `CromoFace`,
 *  y quién es de qué color y de qué pelo, en `lib/cromoArt.ts`.
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
 * Retrato
 * ----------------------------------------------------------------------- */

/**
 * El dibujo completo. El `id` del cromo hace doble papel: decide la cara y da
 * nombre único a los recortes del SVG, que si no chocarían entre sí al haber
 * treinta retratos en la misma página.
 *
 * `detalle` lo apagan los tamaños pequeños: a 36 píxeles los rayos del fondo
 * no se leen como rayos, se leen como suciedad.
 */
function Dibujo({ cromo, detalle }: { cromo: CromoReward; detalle: boolean }) {
  const kit = kitOf(cromo);
  const face = faceOf(cromo.id, cromo.look);
  const uid = cromo.id.replace(/[^a-z0-9-]/gi, '');

  return (
    <svg viewBox="0 0 100 120" className="h-full w-full" role="presentation" aria-hidden>
      <defs>
        <linearGradient id={`fondo-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={kit.shirt} stopOpacity="0.45" />
          <stop offset="100%" stopColor={kit.trim} stopOpacity="0.2" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="100" height="120" fill={`url(#fondo-${uid})`} />
      {detalle && <Rayos color={kit.trim} />}

      {/* De los hombros al pelo, con el centro de la cabeza en (50, 50). */}
      <g transform="translate(50 50)">
        <Camiseta kit={kit} uid={uid} />
        <Cabeza face={face} />
      </g>

      {/* El dorsal, si se sabe. Es lo que remata el aire de cromo. */}
      {cromo.number !== undefined && (
        <text
          x="50"
          y="116"
          textAnchor="middle"
          fontSize="18"
          fontWeight="900"
          fill={kit.ink}
          stroke={TINTA}
          strokeWidth="0.6"
          opacity="0.95"
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

  if (tieneEscena(cromo)) {
    return (
      <span className={`${marco} block bg-black/20 ${className}`}>
        <EscenaCasa cromo={cromo} />
      </span>
    );
  }

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
      <Dibujo cromo={cromo} detalle={size !== 'xs'} />
    </span>
  );
}
