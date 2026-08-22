'use client';

import { Photo } from '@/components/ui/Photo';
import { useAppearance } from '@/hooks/useAppearance';
import { useTheme } from '@/hooks/useTheme';
import {
  GROUP_PROFILES,
  INDIVIDUAL_PROFILES,
  PROFILES,
  accentFor,
  paletteStyle,
} from '@/lib/profiles';
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
  /** Abre los ajustes, donde vive el cambio de portada. */
  onEditCover: () => void;
}

function ProfileCard({
  profile: base,
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
  const { dress } = useAppearance();
  const { mode } = useTheme();
  const profile = dress(base);
  const kid = profile.kind === 'kid';
  const pct = Math.round((glance?.today ?? 0) * 100);

  return (
    <button
      type="button"
      onClick={() => onSelect(profile.id)}
      // El acento y el tinte viajan como variables para que el anillo de
      // foco, la barra, el distintivo y el filete de la tarjeta se tiñan con
      // el color del perfil: el selector adelanta de qué color es cada
      // sección antes de entrar. El acento se pide para el modo actual,
      // porque el mismo verde claro que luce de noche se pierde sobre papel.
      style={paletteStyle(accentFor(profile, mode), profile.tint)}
      aria-label={`Abrir el perfil de ${profile.name}${
        hydrated && glance
          ? glance.tracked
            ? `, ${pct} % registrado hoy`
            : ', sin registrar hoy'
          : ''
      }`}
      className={`group relative flex w-full flex-col overflow-hidden text-left transition-transform
        duration-200 hover:-translate-y-1 ${kid ? 'card-kid' : 'card'}`}
    >
      {/* Foto de cabecera de la tarjeta */}
      <div className="relative h-32 w-full overflow-hidden sm:h-36">
        {profile.cover ? (
          <Photo
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

        {/* Distintivo de estado: se lee antes que cualquier número. */}
        {hydrated && glance && (
          <span
            className={`absolute right-3 top-3 chip text-[10px] backdrop-blur-sm
              ${glance.tracked ? 'bg-accent t-on-accent' : 'bg-black/45 text-white/85'}`}
          >
            {glance.tracked ? `${pct} % hoy` : 'Sin registrar'}
          </span>
        )}

        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent opacity-70" />
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
              <span className="chip-accent font-display px-2 text-[10px] tracking-widest">
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
                title="Protegido con PIN"
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

        <div className="mt-4 flex min-h-[24px] items-center justify-between gap-3">
          {hydrated && glance ? (
            <>
              <div className="flex items-center gap-2">
                {kid ? (
                  <Stars value={glance.stars} size="sm" />
                ) : (
                  <span className="text-sm font-semibold t-accent">
                    {glance.tracked ? percent(glance.today) : 'Sin registrar'}
                  </span>
                )}
                {glance.streak > 0 && (
                  <span className="chip-soft" title="Días seguidos por encima del 60 %">
                    🔥 {glance.streak} {glance.streak === 1 ? 'día' : 'días'}
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold t-3 transition-colors group-hover:t-1">
                Abrir →
              </span>
            </>
          ) : (
            <div className="skeleton h-5 w-32 rounded-full" />
          )}
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full track">
          {hydrated && glance && (
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      </div>
    </button>
  );
}

export function ProfileSelector({
  onSelect,
  glances,
  hydrated,
  onEditCover,
}: ProfileSelectorProps) {
  const tracked = PROFILES.filter((p) => glances[p.id]?.tracked).length;
  const { appCover, appCoverCustom } = useAppearance();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      {/* Portada */}
      <header className="card relative mb-10 overflow-hidden">
        {/* La foto no lleva texto encima: el titular va debajo, de modo que
            ningún velo tape las caras sea cual sea el tamaño de pantalla. */}
        <div className="relative h-52 w-full sm:h-72">
          <Photo
            src={appCover}
            alt="Portada de la casa"
            fill
            sizes="(min-width: 1024px) 1024px, 100vw"
            className="object-cover"
            // El encuadre de fábrica está pensado para esa foto concreta;
            // una elegida en casa se centra, que es lo que funciona siempre.
            style={{ objectPosition: appCoverCustom ? 'center' : 'center 88%' }}
            priority
          />
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[var(--bg)] to-transparent" />

          <button
            type="button"
            onClick={onEditCover}
            className="chip absolute right-3 top-3 min-h-[2.25rem] backdrop-blur-sm surf-2 t-1 hover-soft"
            title="Cambiar la portada de la app"
          >
            🖼️ <span className="hidden sm:inline">Cambiar portada</span>
          </button>
        </div>

        <div className="relative px-5 pb-7 pt-4 text-center sm:pb-9">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] t-3">
            Seguimiento de hábitos
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl t-1">
            Hábitos en Familia
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm t-2">
            Elige tu perfil para registrar el día, o entra en los módulos compartidos.
          </p>

          {/* Estado del día de un vistazo, antes de entrar en ningún perfil. */}
          <p className="mt-4 text-xs t-3" aria-live="polite">
            {!hydrated
              ? ' '
              : tracked === 0
                ? 'Hoy no ha registrado nadie todavía.'
                : tracked === PROFILES.length
                  ? '¡Todos los perfiles tienen registro hoy! 🎉'
                  : `Hoy han registrado ${tracked} de ${PROFILES.length} perfiles.`}
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
