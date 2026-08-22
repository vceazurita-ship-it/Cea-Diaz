'use client';

import { Photo } from '@/components/ui/Photo';
import type { Profile } from '@/types';

interface AvatarProps {
  profile: Profile;
  /** Lado del avatar en píxeles. */
  size: number;
  /** `circle` para las pieles de fútbol y editorial, `squircle` para la nocturna. */
  shape?: 'circle' | 'squircle';
  /** Anillo de color con el acento del perfil. */
  ring?: boolean;
  className?: string;
  priority?: boolean;
}

/**
 * Retrato del perfil. Si no hay foto declarada cae al emoji sobre el
 * degradado, de modo que añadir o quitar imágenes nunca rompe la interfaz.
 */
export function Avatar({
  profile,
  size,
  shape = 'circle',
  ring = false,
  className = '',
  priority = false,
}: AvatarProps) {
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-[28%]';
  const ringStyle = ring
    ? { boxShadow: `0 0 0 2px var(--bg), 0 0 0 4px ${profile.accent}` }
    : undefined;

  if (!profile.photo) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center bg-gradient-to-br ${profile.gradient}
          ${radius} ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.5, ...ringStyle }}
        aria-hidden
      >
        {profile.avatar}
      </span>
    );
  }

  return (
    <span
      className={`relative block shrink-0 overflow-hidden ${radius} ${className}`}
      style={{ width: size, height: size, ...ringStyle }}
    >
      <Photo
        src={profile.photo}
        alt={`Foto de ${profile.name}`}
        fill
        sizes={`${size}px`}
        className="object-cover"
        priority={priority}
      />
    </span>
  );
}
