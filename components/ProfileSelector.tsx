'use client';

import Image from 'next/image';
import { GROUP_PROFILES, INDIVIDUAL_PROFILES } from '@/lib/profiles';
import { percent } from '@/lib/scoring';
import type { Profile, ProfileId } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { Stars } from '@/components/ui/Stars';

export interface ProfileGlance {
  /** Cumplimiento de hoy, 0..1. */
  today: number;
  stars: number;
  streak: number;
  tracked: boolean;
}

interface ProfileSelectorProps {
  onSelect: (id: ProfileId) => void;
  glances: Record<ProfileId, ProfileGlance>;
  hydrated: boolean;
}

function ProfileCard({
  profile,
  glance,
  hydrated,
  onSelect,
  priority,
}: {
  profile: Profile;
  glance: ProfileGlance | undefined;
  hydrated: boolean;
  onSelect: (id: ProfileId) => void;
  priority?: boolean;
}) {
  const kid = profile.kind === 'kid';

  return (
    <button
      type="button"
      onClick={() => onSelect(profile.id)}
      className={`group relative flex w-full flex-col overflow-hidden text-left transition-transform
        duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--ring)] ${kid ? 'card-kid' : 'card'}`}
    >
      {/* Foto de cabecera de la tarjeta */}
      <div className="relative h-32 w-full overflow-hidden sm:h-36">
        {profile.cover ? (
          <Image
            src={profile.cover}
            alt=""
            fill
            sizes="(min-width: 640px) 480px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            priority={priority}
          />
        ) : (
          <div className={`h-full w-full bg-gradient-to-br ${profile.gradient} opacity-70`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/25 to-transparent" />
        {/* Los peques llevan franjas de siega sobre la foto: la banda es su campo. */}
        {kid && <div className="turf absolute inset-0 opacity-80" />}
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 opacity-70"
          style={{ backgroundColor: profile.accent }}
        />
      </div>

      <div className="relative -mt-9 flex items-end gap-3 px-5">
        <Avatar profile={profile} size={kid ? 64 : 58} shape="circle" ring priority={priority} />
        <div className="min-w-0 flex-1 pb-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3
              className={`truncate font-bold t-1 ${
                kid ? 'text-2xl uppercase tracking-wide [font-family:var(--font-pitch)]' : 'text-xl'
              }`}
            >
              {profile.name.replace('Hábitos en ', '')}
            </h3>
            {profile.squad && (
              <span
                className="chip font-display px-2 text-[10px] tracking-widest"
                style={{ backgroundColor: profile.accent, color: 'var(--on-accent)' }}
              >
                {profile.position} · {profile.squad}
              </span>
            )}
            {profile.age !== undefined && !profile.squad && (
              <span className="chip-soft">{profile.age} años</span>
            )}
            {profile.isPrivate && (
              <span
                className="chip"
                style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}
              >
                🔒
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 pt-2">
        <p className="truncate text-sm t-2">{profile.role}</p>
        <p className="mt-0.5 truncate text-xs t-3">{profile.tagline}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          {hydrated && glance ? (
            <>
              <div className="flex items-center gap-2">
                {kid ? (
                  <Stars value={glance.stars} size="sm" />
                ) : (
                  <span className="text-sm font-semibold" style={{ color: profile.accent }}>
                    {glance.tracked ? percent(glance.today) : 'Sin registrar'}
                  </span>
                )}
                {glance.streak > 0 && (
                  <span className="chip-soft">
                    🔥 {glance.streak} {glance.streak === 1 ? 'día' : 'días'}
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold t-3 transition-colors group-hover:t-1">
                Abrir →
              </span>
            </>
          ) : (
            <div className="h-5 w-32 animate-pulse rounded-full surf-2" />
          )}
        </div>

        {hydrated && glance && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full track">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${Math.round(glance.today * 100)}%`, backgroundColor: profile.accent }}
            />
          </div>
        )}
      </div>
    </button>
  );
}

export function ProfileSelector({ onSelect, glances, hydrated }: ProfileSelectorProps) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      {/* Portada */}
      <header className="card relative mb-10 overflow-hidden">
        {/* La foto no lleva texto encima: el titular va debajo, de modo que
            ningún velo tape las caras sea cual sea el tamaño de pantalla. */}
        <div className="relative h-52 w-full sm:h-72">
          <Image
            src="/photos/portada.jpg"
            alt="Leo, Hugo, María y Víctor"
            fill
            sizes="(min-width: 1024px) 1024px, 100vw"
            className="object-cover"
            style={{ objectPosition: 'center 88%' }}
            priority
          />
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[var(--bg)] to-transparent" />
        </div>

        <div className="relative px-5 pb-7 pt-4 text-center sm:pb-9">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] t-3">
            Seguimiento de hábitos
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-sky-300 via-fuchsia-300 to-amber-300 bg-clip-text text-transparent">
              Hábitos en Familia
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm t-2">
            Elige tu perfil para registrar el día, o entra en los módulos compartidos.
          </p>
        </div>
      </header>

      <section className="mb-10">
        <h2 className="rule mb-3">Perfiles individuales</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {INDIVIDUAL_PROFILES.map((profile, index) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              glance={glances[profile.id]}
              hydrated={hydrated}
              onSelect={onSelect}
              priority={index < 2}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="rule mb-3">Módulos compartidos</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {GROUP_PROFILES.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              glance={glances[profile.id]}
              hydrated={hydrated}
              onSelect={onSelect}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
