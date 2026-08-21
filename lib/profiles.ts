import type { Profile, ProfileId, ProfileSkin } from '@/types';

export const PROFILES: Profile[] = [
  {
    id: 'leo',
    name: 'Leo',
    age: 8,
    role: 'Peque deportista',
    tagline: '5 deportes, mucha energía',
    kind: 'kid',
    avatar: '🦁',
    gradient: 'from-sky-400 to-indigo-500',
    accent: '#38bdf8',
    skin: 'pitch',
    photo: '/photos/av-leo.jpg',
    hero: '/photos/accion-leo.jpg',
    cover: '/photos/cover-leo.jpg',
    card: '/photos/cromo-leo.jpg',
    squad: '5',
    position: 'DEL',
  },
  {
    id: 'hugo',
    name: 'Hugo',
    age: 9,
    role: 'Peque deportista',
    tagline: 'Constancia y récords propios',
    kind: 'kid',
    avatar: '🐯',
    gradient: 'from-amber-400 to-orange-500',
    accent: '#fbbf24',
    skin: 'pitch',
    photo: '/photos/av-hugo.jpg',
    hero: '/photos/accion-hugo.jpg',
    cover: '/photos/cover-hugo.jpg',
    card: '/photos/cromo-hugo.jpg',
    squad: '9',
    position: 'DEL',
  },
  {
    id: 'maria',
    name: 'María',
    age: 39,
    role: 'Profesora de español online',
    tagline: 'Bienestar, lectura y aula digital',
    kind: 'adult',
    avatar: '📚',
    gradient: 'from-rose-400 to-fuchsia-500',
    accent: '#f472b6',
    accentDeep: '#be3a6e',
    skin: 'editorial',
    photo: '/photos/av-maria.jpg',
    hero: '/photos/hero-maria.jpg',
    cover: '/photos/cover-maria.jpg',
  },
  {
    id: 'victor',
    name: 'Víctor',
    age: 42,
    role: '2º entrenador · Real Madrid Castilla',
    tagline: 'Alto rendimiento dentro y fuera del campo',
    kind: 'adult',
    avatar: '⚽',
    gradient: 'from-emerald-400 to-teal-600',
    accent: '#34d399',
    accentDeep: '#0a7d5e',
    skin: 'editorial',
    photo: '/photos/av-victor.jpg',
    hero: '/photos/hero-victor.jpg',
    cover: '/photos/cover-victor.jpg',
  },
  {
    id: 'familia',
    name: 'Hábitos en Familia',
    role: 'Leo · Hugo · María · Víctor',
    tagline: 'Rutinas de fin de semana y tiempo juntos',
    kind: 'group',
    avatar: '🏡',
    gradient: 'from-yellow-400 via-orange-400 to-rose-500',
    accent: '#fb923c',
    skin: 'night',
    photo: '/photos/av-familia.jpg',
    hero: '/photos/hero-familia.jpg',
    cover: '/photos/cover-familia.jpg',
    heroPosition: 'center 30%',
    members: ['leo', 'hugo', 'maria', 'victor'],
  },
  {
    id: 'pareja',
    name: 'Hábitos en Pareja',
    role: 'María · Víctor',
    tagline: 'Espacio privado de rutinas a solas',
    kind: 'group',
    avatar: '💞',
    gradient: 'from-pink-500 to-rose-600',
    accent: '#f43f5e',
    skin: 'night',
    photo: '/photos/av-pareja.jpg',
    hero: '/photos/hero-pareja.jpg',
    cover: '/photos/cover-pareja.jpg',
    heroPosition: 'center 26%',
    members: ['maria', 'victor'],
    isPrivate: true,
  },
];

export const PROFILES_BY_ID: Record<ProfileId, Profile> = PROFILES.reduce(
  (acc, profile) => {
    acc[profile.id] = profile;
    return acc;
  },
  {} as Record<ProfileId, Profile>,
);

export function getProfile(id: ProfileId): Profile {
  return PROFILES_BY_ID[id];
}

/** Piel efectiva de un perfil (los que no la declaran usan la nocturna). */
export function skinOf(profile: Profile | null | undefined): ProfileSkin {
  return profile?.skin ?? 'night';
}

/**
 * Acento adecuado a la piel en la que se está pintando el perfil.
 * Sobre fondo claro hace falta la variante oscura para que el texto
 * teñido con el acento siga siendo legible.
 */
export function accentFor(profile: Profile, skin: ProfileSkin = skinOf(profile)): string {
  return skin === 'editorial' ? profile.accentDeep ?? profile.accent : profile.accent;
}

export const INDIVIDUAL_PROFILES = PROFILES.filter((p) => p.kind !== 'group');
export const GROUP_PROFILES = PROFILES.filter((p) => p.kind === 'group');

/**
 * Publica el acento como variable CSS para que las utilidades `.bg-accent`,
 * `.t-accent`… lo hereden. Se prefiere a escribir el color en cada `style`
 * porque así los controles pueden teñir también sus estados :hover y :focus.
 */
export function accentStyle(color: string): React.CSSProperties {
  return { '--accent': color } as React.CSSProperties;
}
