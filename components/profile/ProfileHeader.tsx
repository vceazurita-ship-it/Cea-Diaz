'use client';

import { Photo } from '@/components/ui/Photo';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Stars } from '@/components/ui/Stars';
import { capitalize, formatLong, formatShort, friendlyDateLabel } from '@/lib/dates';
import type { DateKey, DayScore, Profile, ProfileSkin } from '@/types';

/**
 * Lo que cabe dentro de un anillo pequeño: «hoy», «ayer» o la fecha corta.
 * Lo que no puede es decir «hoy» mirando un día de la semana pasada.
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
  /** De lo que la semana apartaba hoy, cuánto está ya registrado. */
  plan?: { done: number; total: number };
}

/* -------------------------------------------------------------------------
 *  Las cabeceras del día.
 *
 *  Antes cada una era una portada de revista de media pantalla, con la fecha
 *  que el navegador de días repetía justo debajo y una fila de cifras
 *  («registros», «racha», el porcentaje) que el anillo ya contaba. Ahora,
 *  como en la portada de la casa: quién es, el anillo del día con lo
 *  apuntado dentro y las pastillas justas, y las casillas a la vista sin
 *  bajar. La fecha la dice el navegador, que es donde se cambia.
 * ------------------------------------------------------------------------- */

/** Cuántas casillas puntúan hoy, para el «x/y» del anillo. */
function totalOf(dayScore: DayScore): number {
  return dayScore.categories.reduce((sum, category) => sum + category.total, 0);
}

/** El anillo del día: el porcentaje y, debajo, lo apuntado de lo que hay. */
function DayRing({ dayScore, filled, size = 64, display = '' }: { dayScore: DayScore; filled: number; size?: number; display?: string }) {
  const total = totalOf(dayScore);
  const pct = Math.round(dayScore.ratio * 100);
  return (
    <span className="shrink-0" aria-live="polite">
      <ProgressRing ratio={dayScore.ratio} size={size} stroke={size >= 64 ? 6 : 5}>
        <span className={`text-lg font-black leading-none tabular-nums t-1 ${display}`} aria-hidden>
          {pct}
          <span className="text-[10px]">%</span>
        </span>
        <span className="mt-0.5 text-[9px] font-bold tabular-nums t-3" aria-hidden>
          {filled}/{total}
        </span>
      </ProgressRing>
      <span className="sr-only">{`${pct} % del día, ${filled} de ${total} registradas`}</span>
    </span>
  );
}

/** Las pastillas de la racha y de lo previsto, comunes a todas las pieles. */
function StatChips({ streak, plan }: { streak: number; plan?: { done: number; total: number } }) {
  if (streak <= 0 && !(plan && plan.total > 0)) return null;
  return (
    <>
      {streak > 0 && (
        <span className="chip-soft" title="Días seguidos por encima del 60 %">
          🔥 {streak} {streak === 1 ? 'día' : 'días'}
        </span>
      )}
      {plan && plan.total > 0 && (
        <span className="chip-soft tabular-nums" title="De lo que la semana apartaba para hoy, lo ya registrado">
          🗓️ {plan.done}/{plan.total}
        </span>
      )}
    </>
  );
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
function PitchHeader({ profile, date, dayScore, streak, filled, plan }: ProfileHeaderProps) {
  const pct = Math.round(dayScore.ratio * 100);
  const total = totalOf(dayScore);

  return (
    <header className="relative mb-3 overflow-hidden rounded-3xl border-2 hairline-strong">
      <div className="grid grid-cols-[minmax(0,108px)_minmax(0,1fr)] sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)]">
        {/* Foto de acción */}
        <div className="relative min-h-[156px] sm:min-h-[210px]">
          {profile.hero && (
            <Photo
              src={profile.hero}
              alt={`${profile.name} jugando al fútbol`}
              fill
              sizes="(min-width: 640px) 190px, 108px"
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
        <div className="turf relative flex flex-col justify-between gap-2 p-3 sm:p-5">
          {/* Dorsal fantasma. El color sale del texto de la piel, no de un
              blanco fijo: sobre papel, un blanco al 6 % no se vería. */}
          <span
            aria-hidden
            className="font-display pointer-events-none absolute -right-2 -top-5 select-none
                       text-[7rem] leading-none t-1 opacity-[0.07] sm:text-[10rem]"
          >
            {profile.squad}
          </span>

          <div className="relative">
            <h1 className="font-display -skew-x-6 text-[34px] uppercase leading-none tracking-tight t-1 sm:text-5xl">
              {profile.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="chip-accent font-display px-2.5 text-[11px] tracking-widest">
                {profile.position} · {profile.squad}
              </span>
              <span className="chip-soft hidden min-[380px]:inline-flex">{profile.age} años</span>
              <StatChips streak={streak} plan={plan} />
            </div>
          </div>

          {/* Panel de marcador: la cifra, las estrellas y cuánto va apuntado. */}
          <div className="relative flex items-end justify-between gap-2 border-t chalk pt-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] t-3">{scoreboardLabel(date)}</p>
              <p className="font-display text-[40px] leading-none tabular-nums t-accent sm:text-6xl" aria-live="polite">
                {pct}
                <span className="text-xl sm:text-3xl">%</span>
              </p>
            </div>

            <div className="flex flex-col items-end gap-0.5">
              <Stars value={dayScore.stars} size="sm" animate />
              <p className="text-[11px] font-semibold tabular-nums t-2">
                {dayScore.empty ? 'Sin registrar' : `${filled}/${total} apuntadas`}
              </p>
            </div>
          </div>

          <p className="relative text-[13px] font-bold leading-tight t-accent">{chant(dayScore.ratio, dayScore.empty)}</p>
        </div>
      </div>

      {/* Cromo pegado como una pegatina sobre la esquina de la foto. En el
          móvil se queda pequeño en vez de desaparecer: es lo que más les
          gusta ver a los dos, y la foto tiene esquina de sobra. */}
      {profile.card && (
        <div className="pointer-events-none absolute bottom-2 left-2 w-10 rotate-[-8deg] overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/40 sm:w-[84px]">
          <Photo src={profile.card} alt={`Cromo de ${profile.name}`} width={92} height={138} className="h-auto w-full" />
        </div>
      )}
    </header>
  );
}

/* -------------------------------------------------------------- editorial */

/**
 * Cabecera de Víctor: composición de revista sobre papel claro, en una
 * banda. Retrato con filete desplazado, nombre en serif con el cargo
 * encima, y el anillo del día a la derecha.
 */
function EditorialHeader({ profile, dayScore, streak, filled, plan }: ProfileHeaderProps) {
  return (
    <header className="card relative mb-3 p-3 sm:mb-4 sm:p-6">
      <div className="flex items-center gap-3 sm:gap-6">
        {/* Retrato con filete desplazado */}
        <div className="relative shrink-0 self-start">
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 h-full w-full rounded-xl border-2 border-accent sm:-bottom-2 sm:-right-2 sm:rounded-2xl"
          />
          <div className="relative h-14 w-14 overflow-hidden rounded-xl sm:h-28 sm:w-28 sm:rounded-2xl">
            {profile.hero ? (
              <Photo src={profile.hero} alt={`Retrato de ${profile.name}`} fill sizes="(min-width: 640px) 112px, 56px" className="object-cover" priority />
            ) : (
              <Avatar profile={profile} size={112} shape="squircle" />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.2em] t-3">{profile.role}</p>
          <h1 className="font-display truncate text-[28px] leading-[1.05] tracking-tight t-1 sm:text-5xl">{profile.name}</h1>
          <p className="mt-1 hidden text-sm t-3 sm:block">{profile.tagline}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 empty:hidden">
            <StatChips streak={streak} plan={plan} />
          </div>
        </div>

        <DayRing dayScore={dayScore} filled={filled} />
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
function RoyalHeader({ profile, dayScore, streak, filled, plan }: ProfileHeaderProps) {
  return (
    <header className="card relative mb-3 overflow-hidden p-3 sm:mb-4 sm:p-6">
      {/* Polvo de destellos, muy tenue: se nota sin llamar la atención. */}
      <span aria-hidden className="stardust pointer-events-none absolute inset-0 opacity-[0.18]" />
      {/* Y el hilo de oro rosa, arriba del todo. */}
      <span aria-hidden className="gilt absolute inset-x-0 top-0 h-[3px]" />

      <div className="relative flex items-center gap-3 sm:gap-6">
        {/* Retrato en arco: la ventana de la torre, con su marco de oro rosa.
            El marco sale del tinte de María aclarado, no de un color fijo:
            si un día cambia su color, cambia el marco con él. */}
        <div className="relative shrink-0 self-start">
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 h-full w-full rounded-b-xl rounded-t-full border-2 sm:-bottom-2 sm:-right-2 sm:rounded-b-2xl"
            style={{ borderColor: 'color-mix(in srgb, var(--tint) 60%, #fff)' }}
          />
          <div className="relative h-16 w-14 overflow-hidden rounded-b-xl rounded-t-full sm:h-32 sm:w-28 sm:rounded-b-2xl">
            {profile.hero ? (
              <Photo src={profile.hero} alt={`Retrato de ${profile.name}`} fill sizes="(min-width: 640px) 112px, 56px" className="object-cover" priority />
            ) : (
              <Avatar profile={profile} size={112} shape="squircle" />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.2em] t-3">
            <span aria-hidden>✨</span> Érase una vez
          </p>
          <h1 className="royal-title truncate text-[26px] leading-[1.05] t-1 sm:text-5xl">
            <span aria-hidden className="mr-1.5 align-middle text-xl sm:text-3xl">
              👑
            </span>
            {profile.name}
          </h1>
          <p className="mt-0.5 line-clamp-2 text-[12px] font-semibold leading-snug t-accent">{spell(dayScore.ratio, dayScore.empty)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatChips streak={streak} plan={plan} />
            {/* Las estrellas del día, que aquí son el broche del vestido. */}
            <Stars value={dayScore.stars} size="sm" animate />
          </div>
        </div>

        <DayRing dayScore={dayScore} filled={filled} display="royal-title" />
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
function GroupHeader({ profile, date, dayScore, streak, filled, plan }: ProfileHeaderProps) {
  return (
    <header className="card relative mb-3 overflow-hidden sm:mb-4">
      <div className="flex min-h-[124px] sm:min-h-[176px]">
        {profile.hero && (
          <div className="relative w-[32%] max-w-[240px] shrink-0 self-stretch">
            <Photo
              src={profile.hero}
              alt={profile.name}
              fill
              sizes="(min-width: 640px) 240px, 32vw"
              className="object-cover"
              style={{ objectPosition: profile.heroPosition ?? 'center 40%' }}
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[var(--bg)]/85" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-3 p-3 sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.2em] t-3">
              Compartido · {ringDateLabel(date)}
            </p>
            <h1 className="truncate text-xl font-black leading-tight t-1 sm:text-2xl">{profile.name.replace('Hábitos en ', '')}</h1>
            <p className="mt-0.5 line-clamp-1 text-xs t-2">{profile.role}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {profile.isPrivate && (
                <span className="chip" style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)' }}>
                  🔒 Privado
                </span>
              )}
              <StatChips streak={streak} plan={plan} />
            </div>
          </div>

          <DayRing dayScore={dayScore} filled={filled} size={60} />
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
