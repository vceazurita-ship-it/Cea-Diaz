'use client';

import { Photo } from '@/components/ui/Photo';
import { useAppearance } from '@/hooks/useAppearance';
import { useTheme } from '@/hooks/useTheme';
import { GROUP_PROFILES, INDIVIDUAL_PROFILES, PROFILES, accentFor, paletteStyle } from '@/lib/profiles';
import { capitalize, formatLong, todayKey } from '@/lib/dates';
import type { Profile, ProfileId } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { Stars } from '@/components/ui/Stars';

export interface ProfileGlance {
  /** Cumplimiento de hoy, 0..1. */
  today: number;
  stars: number;
  streak: number;
  tracked: boolean;
  /** Lo que le queda por hacer hoy: el juego, el cole, el examen, los recados. */
  pendientes: { icon: string; label: string; urgente?: boolean }[];
}

interface ProfileSelectorProps {
  onSelect: (id: ProfileId) => void;
  glances: Record<ProfileId, ProfileGlance>;
  hydrated: boolean;
  /** Abre los ajustes, donde vive el cambio de portada. */
  onEditCover: () => void;
}

/* =========================================================================
 *  La portada.
 *
 *  Tres cosas, por este orden, y todas a la vista en un móvil sin apenas
 *  bajar:
 *
 *   1. **La casa**: la foto, el día y un anillo con cuántos han apuntado.
 *   2. **Para hoy**: lo urgente de todos en una lista (días sin apuntar,
 *      el examen que viene, los recados). Cada línea abre ese perfil: es
 *      la manera más corta de llegar a lo que hay que hacer.
 *   3. **Los perfiles**, como cromos: la foto a sangre, el anillo del día y
 *      lo primero que le queda. Antes cada persona salía dos veces (en el
 *      parte y en su tarjeta grande) y la portada medía casi tres pantallas.
 * ========================================================================= */

/** El anillo del día: el porcentaje, o un ✓ cuando está completo. */
function Ring({ value, size = 40, stroke = 4, label, light = false }: { value: number; size?: number; stroke?: number; label?: string; light?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={light ? 'stroke-white/25' : 'stroke-[var(--track)]'} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className="stroke-[var(--accent)] transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className={`absolute text-[10px] font-black tabular-nums ${light ? 'text-white' : 't-1'}`}>{label ?? (v >= 1 ? '✓' : `${Math.round(v * 100)}`)}</span>
    </span>
  );
}

/**
 * Un perfil como cromo: foto a sangre, el velo oscuro abajo para que el
 * texto se lea igual de día que de noche, y lo que le queda hoy.
 */
function ProfileTile({
  profile: base,
  glance,
  hydrated,
  onSelect,
  wide = false,
  priority = false,
}: {
  profile: Profile;
  glance: ProfileGlance | undefined;
  hydrated: boolean;
  onSelect: (id: ProfileId) => void;
  wide?: boolean;
  priority?: boolean;
}) {
  const { dress } = useAppearance();
  const { mode } = useTheme();
  const profile = dress(base);
  const kid = profile.kind === 'kid';
  const ready = hydrated && glance;
  const pct = Math.round((glance?.today ?? 0) * 100);
  const pendientes = glance?.pendientes ?? [];
  const nombre = profile.name.replace('Hábitos en ', '');
  // La foto de acción es vertical y llena el cromo; la de cabecera es una
  // franja apaisada y en un cromo alto sólo dejaría ver una nariz.
  const foto = profile.hero ?? profile.cover;

  return (
    <button
      type="button"
      onClick={() => onSelect(profile.id)}
      // El acento y el tinte viajan como variables: el anillo, el filete y el
      // foco se tiñen del color del perfil antes de entrar en él.
      style={paletteStyle(accentFor(profile, mode), profile.tint)}
      aria-label={`Abrir el perfil de ${profile.name}${ready ? (glance.tracked ? `, ${pct} % registrado hoy` : ', sin registrar hoy') : ''}${
        ready && pendientes.length ? `. Pendiente: ${pendientes.map((p) => p.label).join(', ')}` : ''
      }`}
      className={`group relative isolate block w-full overflow-hidden rounded-[22px] text-left shadow-[var(--shadow-card)] ring-1 ring-black/10
        transition duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]
        ${wide ? 'aspect-[16/10] sm:aspect-[5/2]' : 'aspect-[4/5] sm:aspect-[3/4]'}`}
    >
      {foto ? (
        <Photo
          src={foto}
          alt=""
          fill
          sizes={wide ? '(min-width: 640px) 480px, 50vw' : '(min-width: 640px) 240px, 50vw'}
          className="-z-10 object-cover transition-transform duration-700 group-hover:scale-[1.05]"
          priority={priority}
        />
      ) : (
        <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${profile.gradient}`} />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
      {kid && <div className="turf absolute inset-x-0 bottom-0 -z-10 h-1/2 opacity-40" />}
      {/* El filete del color del perfil, abajo: la firma de cada uno. */}
      <span className="absolute inset-x-0 bottom-0 h-1 bg-[var(--accent)]" />

      {/* Arriba: el anillo del día y la racha o el candado. */}
      <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
        {ready ? (
          glance.tracked ? (
            <span className="rounded-full bg-black/45 p-0.5 backdrop-blur-sm">
              <Ring value={glance.today} size={36} light label={glance.today >= 1 ? '✓' : `${Math.round(glance.today * 100)}%`} />
            </span>
          ) : (
            <span className="rounded-full bg-black/50 px-2 py-1 text-[10px] font-bold text-white/90 backdrop-blur-sm">Sin apuntar</span>
          )
        ) : (
          <span className="skeleton h-9 w-9 rounded-full opacity-60" />
        )}
        <span className="flex gap-1">
          {ready && glance.streak > 0 && (
            <span className="rounded-full bg-black/50 px-2 py-1 text-[10px] font-black text-white backdrop-blur-sm" title="Días seguidos por encima del 60 %">
              🔥 {glance.streak}
            </span>
          )}
          {profile.isPrivate && (
            <span className="rounded-full bg-black/50 px-2 py-1 text-[10px] text-white backdrop-blur-sm" title="Protegido con PIN">
              🔒
            </span>
          )}
        </span>
      </div>

      {/* Abajo: quién es y lo que le queda. */}
      <div className="absolute inset-x-0 bottom-0 p-3 pb-3.5 text-white">
        <div className="flex items-center gap-2">
          <Avatar profile={profile} size={wide ? 36 : 30} shape="circle" ring priority={priority} />
          <div className="min-w-0 flex-1">
            <p
              className={`truncate leading-none drop-shadow ${
                kid ? 'text-[19px] sm:text-[22px] uppercase tracking-wide [font-family:var(--font-pitch)]' : 'font-display text-lg font-black'
              }`}
            >
              {nombre}
              {profile.squad && <span className="ml-1.5 hidden align-middle sm:inline text-[10px] font-black tracking-widest text-white/70">{profile.position} {profile.squad}</span>}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-white/75">{profile.kind === 'group' ? profile.role : profile.tagline}</p>
          </div>
        </div>
        {kid && ready && (
          <div className="mt-1.5">
            <Stars value={glance.stars} size="sm" />
          </div>
        )}
        {ready && pendientes.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1" aria-hidden>
            {pendientes.slice(0, wide ? 3 : 2).map((p) => (
              <li
                key={p.label}
                className={`max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm ${
                  p.urgente ? 'bg-[var(--accent)] text-black/85' : 'bg-white/15 text-white/90'
                }`}
              >
                {p.icon} {p.label}
              </li>
            ))}
            {pendientes.length > (wide ? 3 : 2) && (
              <li className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white/90">+{pendientes.length - (wide ? 3 : 2)}</li>
            )}
          </ul>
        )}
      </div>
    </button>
  );
}

/**
 * Lo urgente de todos, en una lista: lo que no se puede dejar para mañana.
 * Cada línea abre el perfil de esa persona.
 */
function ParaHoy({ glances, onSelect }: { glances: Record<ProfileId, ProfileGlance>; onSelect: (id: ProfileId) => void }) {
  const { dress } = useAppearance();
  const { mode } = useTheme();
  const filas = PROFILES.flatMap((base) => {
    const g = glances[base.id];
    const urgentes = g?.pendientes.filter((p) => p.urgente) ?? [];
    return urgentes.length ? [{ profile: dress(base), urgentes }] : [];
  });
  if (filas.length === 0) return null;

  return (
    <section className="card mb-6 p-3 sm:p-4" aria-labelledby="para-hoy">
      <h2 id="para-hoy" className="mb-2 flex items-center gap-2 px-1 text-[11px] font-black uppercase tracking-[0.22em] t-3">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--danger)]" aria-hidden />
        Para hoy
      </h2>
      <ul className="grid divide-y divide-[var(--border)] sm:grid-cols-2 sm:gap-x-4 sm:divide-y-0">
        {filas.map(({ profile, urgentes }) => (
          <li key={profile.id}>
            <button
              type="button"
              onClick={() => onSelect(profile.id)}
              style={paletteStyle(accentFor(profile, mode), profile.tint)}
              className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors hover-soft"
            >
              <Avatar profile={profile} size={34} shape="circle" ring />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-black t-1">{profile.name.replace('Hábitos en ', '')}</span>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {urgentes.map((p) => (
                    <span key={p.label} className="chip border border-accent bg-accent-soft text-[11px] t-1">
                      {p.icon} {p.label}
                    </span>
                  ))}
                </span>
              </span>
              <span className="text-lg t-3" aria-hidden>
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * El saludo de la portada según la hora. Por la noche, que es cuando se
 * registra casi todo, lo dice claro: toca apuntar el día.
 */
function greeting(hour: number): { hola: string; texto: string } {
  if (hour >= 20 || hour < 2) return { hola: 'Buenas noches 🌙', texto: 'Es la hora de apuntar el día: dos minutos por perfil.' };
  if (hour < 6) return { hola: 'Buenas noches', texto: 'Elige tu perfil para registrar el día.' };
  if (hour < 13) return { hola: 'Buenos días ☀️', texto: 'Elige tu perfil, o mira cómo quedó ayer.' };
  return { hola: 'Buenas tardes', texto: 'Elige tu perfil para registrar el día, o entra en los módulos compartidos.' };
}

export function ProfileSelector({ onSelect, glances, hydrated, onEditCover }: ProfileSelectorProps) {
  const tracked = PROFILES.filter((p) => glances[p.id]?.tracked).length;
  const { appCover, appCoverCustom } = useAppearance();
  const saludo = hydrated ? greeting(new Date().getHours()) : { hola: 'Hábitos en Familia', texto: 'Elige tu perfil para registrar el día.' };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-4 sm:pb-12 sm:pt-8">
      {/* La casa: la foto limpia, sin texto encima que tape caras; el
          titular y el anillo del día, debajo. */}
      <header className="card relative mb-6 overflow-hidden p-0">
        <div className="relative h-44 w-full sm:h-64">
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
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--surface)] to-transparent" />
          <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm">
            {capitalize(formatLong(todayKey()))}
          </span>
          <button
            type="button"
            onClick={onEditCover}
            className="absolute right-3 top-3 grid h-9 min-w-9 place-items-center rounded-full bg-black/45 px-2.5 text-[12px] font-bold text-white backdrop-blur-sm transition hover:bg-black/60"
            title="Cambiar la portada de la app"
          >
            <span>
              🖼️<span className="ml-1 hidden sm:inline">Cambiar portada</span>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-4 px-4 pb-4 pt-1 sm:px-6 sm:pb-6">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold t-3">{saludo.hola}</p>
            <h1 className="font-display text-[28px] font-black leading-[1.05] tracking-tight t-1 sm:text-5xl">Hábitos en Familia</h1>
            <p className="mt-1.5 text-[13px] leading-snug t-2 sm:text-sm">{saludo.texto}</p>
          </div>
          {/* El día de la casa: cuántos perfiles tienen algo apuntado. */}
          <div className="flex shrink-0 flex-col items-center gap-1" aria-live="polite">
            {hydrated ? (
              <>
                <Ring value={tracked / PROFILES.length} size={64} stroke={6} label={`${tracked}/${PROFILES.length}`} />
                <span className="text-[10px] font-bold uppercase tracking-wider t-3">{tracked === PROFILES.length ? '¡Todos! 🎉' : 'apuntados'}</span>
              </>
            ) : (
              <span className="skeleton h-16 w-16 rounded-full" />
            )}
          </div>
        </div>
      </header>

      {hydrated && <ParaHoy glances={glances} onSelect={onSelect} />}

      <section className="mb-7" aria-labelledby="perfiles">
        <h2 id="perfiles" className="rule mb-3">
          Perfiles
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {INDIVIDUAL_PROFILES.map((profile, i) => (
            <ProfileTile key={profile.id} profile={profile} glance={glances[profile.id]} hydrated={hydrated} onSelect={onSelect} priority={i < 2} />
          ))}
        </div>
      </section>

      <section aria-labelledby="compartidos">
        <h2 id="compartidos" className="rule mb-3">
          Compartidos
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {GROUP_PROFILES.map((profile) => (
            <ProfileTile key={profile.id} profile={profile} glance={glances[profile.id]} hydrated={hydrated} onSelect={onSelect} wide />
          ))}
        </div>
      </section>
    </div>
  );
}
