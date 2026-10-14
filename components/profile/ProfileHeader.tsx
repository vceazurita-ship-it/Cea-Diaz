'use client';

import { Photo } from '@/components/ui/Photo';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Stars } from '@/components/ui/Stars';
import { capitalize, formatLong, formatShort, friendlyDateLabel } from '@/lib/dates';
import { percent } from '@/lib/scoring';
import type { DateKey, DayScore, Profile, ProfileSkin } from '@/types';

/**
 * Lo que cabe dentro de un anillo de 84 px: «hoy», «ayer» o la fecha corta.
 * El rótulo largo —«Jueves 9 de octubre»— ya lo dice la línea de arriba, y
 * dentro del anillo se saldría. Lo que no puede es decir «hoy» mirando un
 * día de la semana pasada, que es lo que hacía.
 */
function ringDateLabel(date: DateKey): string {
  const label = friendlyDateLabel(date);
  return label === 'Hoy' || label === 'Ayer' ? label.toLowerCase() : formatShort(date);
}

/** «Marcador de hoy» sólo cuando es hoy; mirando atrás, el del día que sea. */
function scoreboardLabel(date: DateKey): string {
  const label = friendlyDateLabel(date);
  if (label === 'Hoy' || label === 'Ayer') return `Marcador de ${label.toLowerCase()}`;
  return 'Marcador del día';
}

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
                {scoreboardLabel(date)}
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

      {/* Cromo pegado como una pegatina sobre la esquina de la foto. En el
          móvil se queda pequeño en vez de desaparecer: es lo que más les
          gusta ver a los dos, y la foto tiene esquina de sobra. */}
      {profile.card && (
        <div className="pointer-events-none absolute bottom-2 left-2 w-12 rotate-[-8deg] overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/40 sm:w-[92px]">
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
 * Cabecera de Víctor: composición de revista sobre papel claro.
 * Nombre en serif, filete fino, retrato a la derecha y una fila de datos
 * separada por hairlines en lugar de tarjetas.
 */
function EditorialHeader({ profile, date, dayScore, streak, filled }: ProfileHeaderProps) {
  // El porcentaje no va en la fila: ya lo dice el anillo de al lado, y
  // repetirlo era lo que hacía la cabecera más larga sin contar nada nuevo.
  const stats = [
    { label: 'Registros', value: `${filled}` },
    { label: 'Racha', value: `${streak} ${streak === 1 ? 'día' : 'días'}` },
  ];

  return (
    // En el móvil, retrato pequeño al lado del nombre y relleno corto: la
    // composición de revista entera se comía la primera pantalla y el
    // registro —que es a lo que se viene— quedaba por debajo del pliegue.
    <header className="card relative mb-5 p-4 sm:p-8">
      <div className="flex items-start gap-4 sm:gap-8">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] t-3">
            {friendlyDateLabel(date)} · {capitalize(formatLong(date))}
          </p>

          <h1 className="font-display mt-1 text-3xl leading-[0.95] tracking-tight t-1 sm:mt-2 sm:text-6xl">
            {profile.name}
          </h1>

          <span className="mt-3 block h-[3px] w-14 rounded-full bg-accent sm:mt-4" />

          <p className="mt-3 text-sm font-medium t-2 sm:mt-4">{profile.role}</p>
          <p className="mt-1 text-sm t-3">{profile.tagline}</p>
        </div>

        {/* Retrato con filete desplazado */}
        <div className="relative shrink-0 self-start">
          <span
            aria-hidden
            className="absolute -bottom-1.5 -right-1.5 h-full w-full rounded-xl border-2 border-accent sm:-bottom-3 sm:-right-3 sm:rounded-2xl"
          />
          <div className="relative h-16 w-16 overflow-hidden rounded-xl sm:h-40 sm:w-40 sm:rounded-2xl">
            {profile.hero ? (
              <Photo
                src={profile.hero}
                alt={`Retrato de ${profile.name}`}
                fill
                sizes="(min-width: 640px) 160px, 64px"
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
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4 border-t pt-4 hairline sm:mt-7 sm:gap-x-8 sm:gap-y-5 sm:pt-5">
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

/* ------------------------------------------------------------------ royal */

/** Cómo va el día de María, dicho como se cuenta un cuento. */
function spell(ratio: number, empty: boolean): string {
  if (empty) return 'El cuento de hoy está sin escribir';
  if (ratio >= 0.95) return 'Día de corona: has cuidado de todo y de ti';
  if (ratio >= 0.8) return 'Casi un día perfecto';
  if (ratio >= 0.6) return 'Buen día, y aún queda cuento por delante';
  if (ratio >= 0.3) return 'El día está a medias: elige lo siguiente';
  return 'Empieza por lo pequeño y lo demás vendrá';
}

/**
 * Cabecera de María: el mismo aire de revista, vestido de cuento.
 *
 * Es lo que pidió: su sección entera con estética de princesas. Aquí eso son
 * tres cosas y ninguna es un dibujo pegado encima —los dibujos envejecen mal
 * y se ven fuera de sitio en una app que también usa para trabajar—: el polvo
 * de destellos del fondo, el filete de oro rosa que cose la sección, y el
 * retrato en un arco de ventana de castillo. Los colores siguen saliendo de
 * su tinte, así que sigue siendo su panel y no el de otra.
 */
function RoyalHeader({ profile, date, dayScore, streak, filled }: ProfileHeaderProps) {
  // Sin el porcentaje: lo lleva el anillo, igual que en la de Víctor.
  const stats = [
    { label: 'Registros', value: `${filled}` },
    { label: 'Racha', value: `${streak} ${streak === 1 ? 'día' : 'días'}` },
  ];

  return (
    // Misma compactación que la editorial en el móvil: retrato pequeño al
    // lado del nombre, relleno corto. El cuento sigue entero de tableta en
    // adelante.
    <header className="card relative mb-5 overflow-hidden p-4 sm:p-8">
      {/* Polvo de destellos, muy tenue: se nota sin llamar la atención. */}
      <span aria-hidden className="stardust pointer-events-none absolute inset-0 opacity-[0.18]" />
      {/* Y el hilo de oro rosa, arriba del todo. */}
      <span aria-hidden className="gilt absolute inset-x-0 top-0 h-[3px]" />

      <div className="relative flex items-start gap-4 sm:gap-8">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] t-3">
            <span aria-hidden>✨</span> Érase una vez · {capitalize(formatLong(date))}
          </p>

          <h1 className="royal-title mt-1 text-3xl leading-[0.95] t-1 sm:mt-2 sm:text-6xl">
            <span aria-hidden className="mr-2 align-middle text-2xl sm:text-4xl">
              👑
            </span>
            {profile.name}
          </h1>

          <span aria-hidden className="gilt mt-3 block h-[3px] w-20 rounded-full sm:mt-4" />

          <p className="mt-3 text-sm font-medium t-2 sm:mt-4">{profile.role}</p>
          <p className="mt-1 text-sm t-3">{profile.tagline}</p>
          <p className="mt-3 text-sm font-semibold t-accent">
            {spell(dayScore.ratio, dayScore.empty)}
          </p>
        </div>

        {/* Retrato en arco: la ventana de la torre, con su marco de oro rosa.
            El marco sale del tinte de María aclarado, no de un color fijo:
            si un día cambia su color, cambia el marco con él. */}
        <div className="relative shrink-0 self-start">
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 h-full w-full rounded-b-xl rounded-t-full border-2 sm:-bottom-2 sm:-right-2 sm:rounded-b-2xl"
            style={{ borderColor: 'color-mix(in srgb, var(--tint) 60%, #fff)' }}
          />
          <div className="relative h-[4.5rem] w-16 overflow-hidden rounded-b-xl rounded-t-full sm:h-44 sm:w-40 sm:rounded-b-2xl">
            {profile.hero ? (
              <Photo
                src={profile.hero}
                alt={`Retrato de ${profile.name}`}
                fill
                sizes="(min-width: 640px) 160px, 64px"
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
      <div className="relative mt-4 flex flex-wrap items-center gap-x-6 gap-y-4 border-t pt-4 hairline sm:mt-7 sm:gap-x-8 sm:gap-y-5 sm:pt-5">
        <ProgressRing ratio={dayScore.ratio} size={72} stroke={5}>
          <span className="text-lg font-semibold tabular-nums t-1" aria-live="polite">
            {Math.round(dayScore.ratio * 100)}
            <span className="text-[10px]">%</span>
          </span>
        </ProgressRing>

        {stats.map((stat) => (
          <div key={stat.label} className="min-w-[92px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] t-3">{stat.label}</p>
            <p className="royal-title mt-1 text-2xl leading-none tabular-nums t-1">{stat.value}</p>
          </div>
        ))}

        {/* Las estrellas del día, que aquí son el broche del vestido. */}
        <div className="ml-auto">
          <Stars value={dayScore.stars} size="md" animate />
        </div>
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
            <span className="text-[10px] uppercase tracking-wide t-3">{ringDateLabel(date)}</span>
          </ProgressRing>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- compacta */

/**
 * La cabecera en una línea, para las pestañas que no son el día.
 *
 * La grande es la portada del perfil y se queda en su pestaña. En Semana,
 * Retos o Datos ocupaba la primera media pantalla del móvil repitiendo lo
 * mismo, y lo que se venía a ver empezaba por debajo del pliegue. Aquí cabe
 * quién es, qué día es y cómo va, en 64 px, con la letra de su piel.
 */
function CompactHeader({ profile, skin, date, dayScore, streak }: ProfileHeaderProps) {
  const pct = Math.round(dayScore.ratio * 100);
  const name = profile.name.replace('Hábitos en ', '');
  const pitch = skin === 'pitch';
  const royal = skin === 'royal';

  return (
    <header
      className={`relative mb-4 flex items-center gap-3 overflow-hidden p-2.5 pr-3 animate-floatUp
        ${pitch ? 'card-kid turf' : 'card'}`}
    >
      {royal && <span aria-hidden className="gilt absolute inset-x-0 top-0 h-[2px]" />}
      <Avatar profile={profile} size={44} shape={pitch || royal ? 'circle' : 'squircle'} ring />

      <div className="min-w-0 flex-1">
        <h1
          className={`truncate leading-none t-1 ${
            pitch
              ? 'font-display -skew-x-6 text-2xl uppercase tracking-tight'
              : royal
                ? 'royal-title text-xl'
                : skin === 'editorial'
                  ? 'font-display text-xl tracking-tight'
                  : 'text-lg font-black'
          }`}
        >
          {royal && <span aria-hidden className="mr-1 text-base">👑</span>}
          {name}
        </h1>
        <p className="mt-1 truncate text-[11px] font-semibold t-3">
          {friendlyDateLabel(date)} · {capitalize(formatLong(date))}
        </p>
      </div>

      {streak > 0 && (
        <span className="chip-soft hidden shrink-0 min-[360px]:inline-flex" title="Días seguidos por encima del 60 %">
          🔥 {streak}
        </span>
      )}

      <ProgressRing ratio={dayScore.ratio} size={46} stroke={4}>
        <span className="text-xs font-black tabular-nums t-1" aria-live="polite">
          {pct}
          <span className="text-[8px]">%</span>
        </span>
      </ProgressRing>
    </header>
  );
}

/* ------------------------------------------------------------- despachador */

export function ProfileHeader(props: ProfileHeaderProps & { compact?: boolean }) {
  if (props.compact) return <CompactHeader {...props} />;
  switch (props.skin) {
    case 'pitch':
      return <PitchHeader {...props} />;
    case 'editorial':
      return <EditorialHeader {...props} />;
    case 'royal':
      return <RoyalHeader {...props} />;
    default:
      return <GroupHeader {...props} />;
  }
}
