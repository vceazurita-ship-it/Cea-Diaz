'use client';

import { Photo } from '@/components/ui/Photo';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Stars } from '@/components/ui/Stars';
import { capitalize, formatLong, friendlyDateLabel } from '@/lib/dates';
import { percent } from '@/lib/scoring';
import type { DateKey, DayScore, Profile, ProfileSkin } from '@/types';

export interface ProfileHeaderProps {
  profile: Profile;
  skin: ProfileSkin;
  date: DateKey;
  dayScore: DayScore;
  /** Racha actual en días, para el marcador y la ficha editorial. */
  streak: number;
  /** Número de métricas con valor registrado hoy. */
  filled: number;
}

/** Frase de ánimo en función del cumplimiento, sólo para los perfiles infantiles. */
function chant(ratio: number, empty: boolean): string {
  if (empty) return 'Aún no has saltado al campo';
  if (ratio >= 0.95) return 'Partidazo. Balón de oro del día';
  if (ratio >= 0.8) return 'Muy buen partido, casi pleno';
  if (ratio >= 0.6) return 'Buen ritmo, sigue apretando';
  if (ratio >= 0.3) return 'Vas entrando en juego';
  return 'A calentar, que queda partido';
}

/* ------------------------------------------------------------------ pitch */

/**
 * Cabecera de Leo y Hugo: foto de acción a sangre, franjas de siega,
 * dorsal enorme y un marcador de estadio con el cumplimiento del día.
 */
function PitchHeader({ profile, date, dayScore, streak, filled }: ProfileHeaderProps) {
  const pct = Math.round(dayScore.ratio * 100);

  return (
    <header className="relative mb-4 overflow-hidden rounded-3xl border-2 hairline-strong">
      <div className="grid grid-cols-[minmax(0,132px)_minmax(0,1fr)] sm:grid-cols-[minmax(0,210px)_minmax(0,1fr)]">
        {/* Foto de acción */}
        <div className="relative min-h-[196px] sm:min-h-[248px]">
          {profile.hero && (
            <Photo
              src={profile.hero}
              alt={`${profile.name} jugando al fútbol`}
              fill
              sizes="(min-width: 640px) 210px, 132px"
              className="object-cover object-top"
              priority
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[var(--bg)]" />
          {/* Línea de cal separando la foto del marcador: clara de noche y
              oscura sobre papel, como el resto del campo. */}
          <div className="absolute inset-y-0 right-0 border-r chalk" />
        </div>

        {/* Marcador */}
        <div className="turf relative flex flex-col justify-between gap-3 p-4 sm:p-5">
          {/* Dorsal fantasma. El color sale del texto de la piel, no de un
              blanco fijo: sobre papel, un blanco al 6 % no se vería. */}
          <span
            aria-hidden
            className="font-display pointer-events-none absolute -right-2 -top-6 select-none
                       text-[8.5rem] leading-none t-1 opacity-[0.07] sm:text-[11rem]"
          >
            {profile.squad}
          </span>

          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] t-3">
              {capitalize(formatLong(date))}
            </p>
            <h1 className="font-display -skew-x-6 text-4xl uppercase leading-none tracking-tight t-1 sm:text-5xl">
              {profile.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="chip-accent font-display px-2.5 text-[11px] tracking-widest">
                {profile.position} · {profile.squad}
              </span>
              <span className="chip-soft">{profile.age} años</span>
              {streak > 0 && (
                <span className="chip-soft" title="Días seguidos por encima del 60 %">
                  🔥 {streak}
                </span>
              )}
            </div>
          </div>

          {/* Panel de marcador */}
          <div className="relative flex flex-wrap items-end justify-between gap-3 border-t chalk pt-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] t-3">
                Marcador de hoy
              </p>
              <p
                className="font-display text-5xl leading-none tabular-nums t-accent sm:text-6xl"
                aria-live="polite"
              >
                {pct}
                <span className="text-2xl sm:text-3xl">%</span>
              </p>
            </div>

            <div className="flex flex-col items-start gap-1 sm:items-end">
              <Stars value={dayScore.stars} size="md" animate />
              <p className="text-[11px] font-semibold t-2">
                {dayScore.empty ? 'Sin registrar' : `${filled} registros`}
              </p>
            </div>
          </div>

          <p className="relative text-sm font-bold t-accent">
            {chant(dayScore.ratio, dayScore.empty)}
          </p>
        </div>
      </div>

      {/* Cromo pegado como una pegatina sobre la esquina de la foto */}
      {profile.card && (
        <div className="pointer-events-none absolute bottom-2 left-2 hidden w-[74px] rotate-[-8deg] overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/40 sm:block sm:w-[92px]">
          <Photo
            src={profile.card}
            alt={`Cromo de ${profile.name}`}
            width={92}
            height={138}
            className="h-auto w-full"
          />
        </div>
      )}
    </header>
  );
}

/* -------------------------------------------------------------- editorial */

/**
 * Cabecera de María y Víctor: composición de revista sobre papel claro.
 * Nombre en serif, filete fino, retrato a la derecha y una fila de datos
 * separada por hairlines en lugar de tarjetas.
 */
function EditorialHeader({ profile, date, dayScore, streak, filled }: ProfileHeaderProps) {
  const stats = [
    { label: 'Cumplimiento', value: dayScore.empty ? '—' : percent(dayScore.ratio) },
    { label: 'Registros', value: `${filled}` },
    { label: 'Racha', value: `${streak} ${streak === 1 ? 'día' : 'días'}` },
  ];

  return (
    <header className="card relative mb-5 p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] t-3">
            {friendlyDateLabel(date)} · {capitalize(formatLong(date))}
          </p>

          <h1 className="font-display mt-2 text-5xl leading-[0.95] tracking-tight t-1 sm:text-6xl">
            {profile.name}
          </h1>

          <span className="mt-4 block h-[3px] w-14 rounded-full bg-accent" />

          <p className="mt-4 text-sm font-medium t-2">{profile.role}</p>
          <p className="mt-1 text-sm t-3">{profile.tagline}</p>
        </div>

        {/* Retrato con filete desplazado */}
        <div className="relative shrink-0 self-start">
          <span
            aria-hidden
            className="absolute -bottom-3 -right-3 h-full w-full rounded-2xl border-2 border-accent"
          />
          <div className="relative h-32 w-32 overflow-hidden rounded-2xl sm:h-40 sm:w-40">
            {profile.hero ? (
              <Photo
                src={profile.hero}
                alt={`Retrato de ${profile.name}`}
                fill
                sizes="(min-width: 640px) 160px, 128px"
                className="object-cover"
                priority
              />
            ) : (
              <Avatar profile={profile} size={160} shape="squircle" />
            )}
          </div>
        </div>
      </div>

      {/* Fila de datos */}
      <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-5 border-t pt-5 hairline">
        <ProgressRing ratio={dayScore.ratio} size={72} stroke={5}>
          <span className="text-lg font-semibold tabular-nums t-1" aria-live="polite">
            {Math.round(dayScore.ratio * 100)}
            <span className="text-[10px]">%</span>
          </span>
        </ProgressRing>

        {stats.map((stat) => (
          <div key={stat.label} className="min-w-[92px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] t-3">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold leading-none tabular-nums t-1">{stat.value}</p>
          </div>
        ))}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ night */

/**
 * Cabecera de los módulos compartidos: foto a sangre en una columna lateral
 * y los datos al lado. Se prefiere a una banda panorámica porque las fotos
 * de familia y de pareja son verticales y una banda ancha las ampliaría
 * hasta dejar las caras fuera de cuadro.
 */
function GroupHeader({ profile, date, dayScore, streak, filled }: ProfileHeaderProps) {
  return (
    <header className="card relative mb-4 overflow-hidden">
      <div className="flex min-h-[172px] sm:min-h-[200px]">
        {profile.hero && (
          <div className="relative w-[38%] max-w-[260px] shrink-0 self-stretch">
            <Photo
              src={profile.hero}
              alt={profile.name}
              fill
              sizes="(min-width: 640px) 260px, 40vw"
              className="object-cover"
              style={{ objectPosition: profile.heroPosition ?? 'center 40%' }}
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[var(--bg)]/85" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4 p-5">
          <div className="min-w-[150px] flex-1">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] t-3">
              Módulo compartido
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black t-1">{profile.name.replace('Hábitos en ', '')}</h1>
              {profile.isPrivate && (
                <span
                  className="chip"
                  style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}
                >
                  🔒 Privado
                </span>
              )}
              {streak > 0 && (
                <span className="chip-soft" title="Días seguidos por encima del 60 %">
                  🔥 {streak}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm t-2">{profile.role}</p>
            <p className="mt-0.5 text-xs t-3">
              {friendlyDateLabel(date)} ·{' '}
              {dayScore.empty ? 'sin registrar' : `${percent(dayScore.ratio)} · ${filled} registros`}
            </p>
          </div>

          <ProgressRing ratio={dayScore.ratio} size={84} stroke={8}>
            <span className="text-xl font-black tabular-nums t-1" aria-live="polite">
              {Math.round(dayScore.ratio * 100)}
              <span className="text-xs">%</span>
            </span>
            <span className="text-[10px] uppercase tracking-wide t-3">hoy</span>
          </ProgressRing>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------- despachador */

export function ProfileHeader(props: ProfileHeaderProps) {
  switch (props.skin) {
    case 'pitch':
      return <PitchHeader {...props} />;
    case 'editorial':
      return <EditorialHeader {...props} />;
    default:
      return <GroupHeader {...props} />;
  }
}
