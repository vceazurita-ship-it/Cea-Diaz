'use client';

import { useMemo, useState } from 'react';

import { GpsEntry } from '@/components/gps/GpsEntry';
import { GpsReport } from '@/components/gps/GpsReport';
import { ComentarioSesion, GpsSeason } from '@/components/gps/GpsSeason';
import { GpsTrend } from '@/components/gps/GpsTrend';
import { useToast } from '@/components/ui/Toast';
import { useGpsSessions } from '@/hooks/useGps';
import type { HabitStore } from '@/hooks/useHabitStore';
import { formatShort, friendlyDateLabel, todayKey } from '@/lib/dates';
import {
  GPS_FIELDS,
  KIND_META,
  TRACKER,
  bookOf,
  digestOf,
  fieldOf,
  formatValue,
  marksOf,
  notesOf,
  removeSession,
  restoreBook,
  saveSessions,
  sessionAsLine,
  statsOf,
  valueOf,
} from '@/lib/gps';
import { comentarSesion, enPeriodo, periodosDe, type Comentario, type PeriodoId } from '@/lib/gpsSeason';
import { findMetric } from '@/lib/habits';
import { headingFont } from '@/lib/profiles';
import type { GpsDigest } from '@/lib/gps';
import type { GpsSession, Profile, ProfileSkin } from '@/types';

/* =========================================================================
 *  Las sesiones del rastreador, y lo que dicen juntas.
 *
 *  Footbar enseña una sesión cada vez y ahí se acaba: para saber si el crío
 *  corre más que en septiembre hay que ir abriendo pantallas en el móvil y
 *  fiarse de la memoria. Aquí las sesiones se quedan, se comparan entre sí y
 *  contestan las tres preguntas que uno se hace de verdad:
 *
 *   · **la de hoy, ¿qué tal fue?** —comparada con las suyas, no con las de
 *     nadie más—;
 *   · **¿de qué es capaz?**: sus marcas, con el día en que las hizo;
 *   · **¿va a más?**, que es la única que necesita meses de sesiones y la
 *     única que no puede contestar la aplicación del aparato.
 *
 *  Y una cosa que no hace: registrar nada por su cuenta. Que el GPS diga que
 *  hubo noventa minutos de fútbol es un hecho, pero pasarlo al día del
 *  registro es una decisión, y se ofrece con un botón, como todo lo demás.
 * ========================================================================= */

interface GpsPanelProps {
  profile: Profile;
  store: HabitStore;
  kid: boolean;
  skin: ProfileSkin;
}

export function GpsPanel({ profile, store, kid, skin }: GpsPanelProps) {
  const sessions = useGpsSessions(profile.id);
  const notify = useToast();
  const heading = headingFont(skin);
  const pitch = skin === 'pitch';

  /** Qué se está mirando: todo, sólo entrenos o sólo partidos. */
  const [filter, setFilter] = useState<'todo' | 'entreno' | 'partido'>('todo');

  /**
   * Las sesiones que se acaban de meter, para poder decir qué dicen juntas.
   *
   * Se guardan los identificadores y no las sesiones: lo que se enseña tiene
   * que ser lo que ha quedado guardado —corregido y todo—, no lo que se
   * mandó guardar.
   */
  const [batch, setBatch] = useState<string[]>([]);

  /**
   * Qué temporada se mira. Por defecto la que está en marcha —de septiembre a
   * junio—, que es donde se ve la progresión; lo de antes queda cerrado,
   * como un archivo que se abre cuando se quiere.
   */
  const periodos = useMemo(() => periodosDe(todayKey()), []);
  const [periodoId, setPeriodoId] = useState<PeriodoId>('temporada');
  const periodo = periodos[periodoId];
  const delPeriodo = useMemo(() => enPeriodo(sessions, periodo), [sessions, periodo]);
  const cuantas = useMemo(
    () => ({ temporada: enPeriodo(sessions, periodos.temporada).length, anterior: enPeriodo(sessions, periodos.anterior).length }),
    [sessions, periodos],
  );

  const shown = useMemo(
    () => (filter === 'todo' ? delPeriodo : delPeriodo.filter((item) => item.kind === filter)),
    [delPeriodo, filter],
  );

  /** El comentario de cada sesión, frente a su temporada. */
  const comentarios = useMemo(() => {
    const out = new Map<string, Comentario>();
    const ambito = periodoId === 'temporada' ? 'temporada' : 'historia';
    for (const session of delPeriodo) out.set(session.id, comentarSesion(session, delPeriodo, ambito));
    return out;
  }, [delPeriodo, periodoId]);

  /** La sesión abierta en la lista, para ver todas sus cifras. */
  const [abierta, setAbierta] = useState<string | null>(null);

  const stats = useMemo(() => statsOf(shown), [shown]);
  const notes = useMemo(() => notesOf(shown), [shown]);
  const last = shown[0];
  // Contra lo que se está mirando, no contra todo: filtrando por partidos, la
  // última se compara con los partidos anteriores, que es la comparación que
  // se ha pedido al filtrar.
  const marks = useMemo(() => (last ? marksOf(last, shown) : []), [last, shown]);

  /**
   * El resumen de la última tanda. Se calcula sobre todas las sesiones y no
   * sobre las filtradas: lo que se acaba de meter se compara con todo lo que
   * había, que es lo que hace de esto una interpretación y no un recuento.
   */
  const digest = useMemo(() => {
    const ids = new Set(batch);
    const mine = sessions.filter((session) => ids.has(session.id));
    return mine.length > 0 ? digestOf(mine, sessions) : null;
  }, [batch, sessions]);

  /* --------------------------------------------------------- acciones */

  const add = (incoming: GpsSession[]) => {
    const before = bookOf(profile.id);
    const known = new Set(sessions.map((item) => item.id));
    const fresh = incoming.filter((item) => !known.has(item.id)).length;

    saveSessions(profile.id, incoming);
    setBatch(incoming.map((item) => item.id));

    notify({
      message:
        incoming.length === 1
          ? fresh === 1
            ? 'Sesión apuntada.'
            : 'Sesión corregida: ya había una de ese día.'
          : `${incoming.length} sesiones apuntadas${fresh < incoming.length ? ` (${incoming.length - fresh} corregidas)` : ''}.`,
      icon: '🛰️',
      action: {
        label: 'Deshacer',
        onClick: () => {
          restoreBook(profile.id, before);
          setBatch([]);
        },
      },
    });
  };

  const drop = (session: GpsSession) => {
    const before = bookOf(profile.id);
    removeSession(profile.id, session.id);

    notify({
      message: `Sesión del ${formatShort(session.date)} borrada.`,
      icon: '🗑️',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: () => restoreBook(profile.id, before) },
    });
  };

  /**
   * Pasa la sesión al registro de su día: que fue al fútbol y los minutos de
   * movimiento. Nada más, y nada solo: el esfuerzo y las sensaciones los pone
   * quien entrenó, que es el único que los sabe.
   */
  const toDay = (session: GpsSession) => {
    const before = store.snapshot();
    const minutes = valueOf(session, 'minutes');
    const puestos: string[] = [];

    const attendance = findMetric(profile.id, 'sport.futbol.asistencia');
    if (attendance) {
      store.setValue(profile.id, session.date, attendance.id, true);
      puestos.push('la asistencia');
    }

    const movement = findMetric(profile.id, 'actividad_diaria');
    if (movement && minutes !== undefined && movement.type === 'duration') {
      const value = Math.max(movement.min, Math.min(movement.max, Math.round(minutes)));
      store.setValue(profile.id, session.date, movement.id, value);
      puestos.push(`${value} min de movimiento`);
    }

    if (puestos.length === 0) {
      notify({ message: 'Ese día no hay casillas donde pasarlo.', icon: '🤷' });
      return;
    }

    notify({
      message: `En el ${friendlyDateLabel(session.date).toLowerCase()}: ${puestos.join(' y ')}. Corrige lo que no fuera así.`,
      icon: '✅',
      action: { label: 'Deshacer', onClick: () => store.restore(before) },
    });
  };

  const copyLine = async (session: GpsSession) => {
    try {
      await navigator.clipboard.writeText(sessionAsLine(session));
      notify({ message: 'Copiada en el formato de pegar.', icon: '📋' });
    } catch {
      notify({ message: 'Este navegador no deja copiar solo.', icon: '⚠️', tone: 'danger' });
    }
  };

  /* ---------------------------------------------------------- pintura */

  const card = `${kid ? 'card-kid' : 'card'} p-4`;

  // La lista va por meses, de lo más reciente a lo más antiguo: en un móvil,
  // ochenta sesiones seguidas son una pared; con su mes delante se encuentran.
  const porMes: [string, GpsSession[]][] = [];
  for (const session of shown) {
    const key = session.date.slice(0, 7);
    const grupo = porMes.find(([k]) => k === key);
    if (grupo) grupo[1].push(session);
    else porMes.push([key, [session]]);
  }
  const masVieja = shown[shown.length - 1];

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className={`min-w-0 text-lg font-bold t-1 ${heading}`}>
            🛰️ {pitch ? `Los datos de ${profile.name}` : `GPS de ${profile.name}`}
          </h2>
          <span className="shrink-0 text-[11px] t-3">
            {sessions.length === 0 ? `sin sesiones · ${TRACKER}` : `${sessions.length} en total · ${TRACKER}`}
          </span>
        </div>

        {sessions.length > 0 && (
          <>
            {/* La temporada en marcha o el archivo de lo anterior. */}
            <div role="tablist" aria-label="Qué temporada mirar" className="grid grid-cols-2 gap-1 rounded-2xl border p-1 hairline surf-1">
              {(['temporada', 'anterior'] as const).map((id) => {
                const activo = periodoId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activo}
                    onClick={() => {
                      setPeriodoId(id);
                      setAbierta(null);
                    }}
                    className={`min-w-0 rounded-xl px-2.5 py-2 text-left transition-colors ${activo ? 'bg-accent t-on-accent shadow' : 't-2 hover-soft'}`}
                  >
                    <span className="block truncate text-[12px] font-black leading-tight">
                      {id === 'temporada' ? `🏆 ${periodos.temporada.label}` : `🗄️ ${periodos.anterior.label}`}
                    </span>
                    <span className={`block truncate text-[10px] leading-tight ${activo ? 'opacity-90' : 't-3'}`}>
                      {id === 'temporada' ? 'progresión' : 'cerrado'} · {cuantas[id]} {cuantas[id] === 1 ? 'sesión' : 'sesiones'}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-1.5">
              {(['todo', 'entreno', 'partido'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  aria-pressed={filter === option}
                  className={`flex-1 rounded-full border py-1.5 text-[11px] font-bold transition-colors ${
                    filter === option ? 'border-accent bg-accent-soft t-1' : 'hairline surf-1 t-3 hover-soft'
                  }`}
                >
                  {option === 'todo' ? 'Todo' : `${KIND_META[option].icon} ${KIND_META[option].label}s`}
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      {digest && <ImportDigest digest={digest} kid={kid} onClose={() => setBatch([])} />}

      {sessions.length === 0 ? (
        <section className={card}>
          <h3 className="mb-2 text-sm font-bold t-1">Todavía no hay ninguna sesión</h3>
          <p className="text-sm leading-relaxed t-3">
            El rastreador de {profile.name} deja las cifras en la aplicación de {TRACKER} y allí se
            quedan: una sesión por pantalla, sin manera de compararlas. Aquí se ve lo que allí no:
            si va a más a lo largo de la temporada, cuáles fueron sus mejores días y qué tal fue
            cada sesión frente a las suyas.
          </p>
          <p className="mt-2 text-sm leading-relaxed t-3">Con cuatro sesiones ya sale la primera tendencia.</p>
        </section>
      ) : shown.length === 0 ? (
        <section className={card}>
          <h3 className="mb-1 text-sm font-bold t-1">
            {periodoId === 'temporada' ? `🌱 La ${periodo.label.toLowerCase()} está por estrenar` : 'No hay sesiones de antes'}
          </h3>
          <p className="text-sm leading-relaxed t-3">
            {periodoId === 'temporada'
              ? `Todavía no hay ${filter === 'todo' ? 'sesiones' : KIND_META[filter].label.toLowerCase() + 's'} desde el 1 de septiembre. En cuanto entre la primera, aquí empieza su progresión.`
              : 'Todo lo que hay es de esta temporada.'}
          </p>
          {periodoId === 'temporada' && cuantas.anterior > 0 && (
            <button type="button" onClick={() => setPeriodoId('anterior')} className="btn-ghost mt-3 px-3 py-1.5 text-xs">
              🗄️ Ver lo de antes ({cuantas.anterior})
            </button>
          )}
        </section>
      ) : (
        <>
          {periodoId === 'temporada' ? (
            <GpsSeason periodo={periodo} sessions={shown} kid={kid} />
          ) : (
            <section className={`${card} border-dashed`}>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] t-3">Archivo · cerrado</p>
              <h3 className="text-base font-black t-1">🗄️ {periodo.label}</h3>
              <p className="mt-1 text-xs leading-snug t-3">
                {shown.length} {shown.length === 1 ? 'sesión' : 'sesiones'}
                {masVieja ? `, del ${formatShort(masVieja.date)} al ${formatShort(shown[0].date)}` : ''}. Se queda como
                estaba, para consultarlo: lo nuevo cuenta en la {periodos.temporada.label.toLowerCase()}.
              </p>
            </section>
          )}

          {last && <LastSession session={last} marks={marks} comentario={comentarios.get(last.id)} kid={kid} pitch={pitch} />}

          {stats.length > 0 && (
            <details key={periodoId} className={`${card} group`} open={periodoId === 'anterior'}>
              <summary className="flex cursor-pointer list-none items-center gap-2">
                <h3 className="text-sm font-bold t-1">🏅 Sus marcas {periodoId === 'temporada' ? 'de la temporada' : ''}</h3>
                <span className="ml-auto text-[11px] font-bold t-accent group-open:hidden">Ver</span>
                <span className="ml-auto hidden text-[11px] font-bold t-3 group-open:inline">Ocultar</span>
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {stats
                  .filter((stat) => fieldOf(stat.id).record !== false)
                  .map((stat) => (
                    <div key={stat.id} className="min-w-0 rounded-2xl border p-3 hairline surf-1">
                      <p className="truncate text-[10px] font-bold uppercase tracking-wide t-3">
                        {fieldOf(stat.id).icon} {fieldOf(stat.id).short}
                      </p>
                      <p className="truncate text-lg font-black tabular-nums t-accent">{formatValue(stat.id, stat.best)}</p>
                      <p className="truncate text-[11px] t-3">
                        {formatShort(stat.bestOn)} · media {formatValue(stat.id, stat.average)}
                      </p>
                    </div>
                  ))}
              </div>
            </details>
          )}

          <GpsTrend sessions={shown} kid={kid} />

          {/* El informe va con todas las del periodo, no con el filtro: separa
              él los puestos, y la comparación con los estudios necesita todo. */}
          <GpsReport
            profile={profile}
            sessions={delPeriodo}
            kid={kid}
            titulo={periodo.label}
            cerrado={periodoId === 'anterior'}
          />

          {notes.length > 0 && (
            <section className={card}>
              <h3 className="mb-2 text-sm font-bold t-1">🔎 Lo que se ve mirándolas juntas</h3>
              <ul className="space-y-2">
                {notes.map((note) => (
                  <li key={note.id} className="flex gap-2 text-sm leading-relaxed">
                    <span aria-hidden className="shrink-0">
                      {note.icon}
                    </span>
                    <span className={note.tone === 'aviso' ? 't-2' : 't-1'}>{note.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={card}>
            <h3 className="text-sm font-bold t-1">📜 Las sesiones ({shown.length})</h3>
            <p className="mb-1 text-[11px] t-3">Cada una con su comentario frente a su temporada. Tócala para ver todas sus cifras.</p>
            {porMes.map(([key, list]) => (
              <div key={key}>
                <p className="mb-1.5 mt-3 text-[11px] font-black uppercase tracking-wide t-3">
                  {new Date(`${key}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })} · {list.length}
                </p>
                <ul className="space-y-1.5">
                  {list.map((session) => (
                    <SesionFila
                      key={session.id}
                      session={session}
                      comentario={comentarios.get(session.id)}
                      abierta={abierta === session.id}
                      onToggle={() => setAbierta((id) => (id === session.id ? null : session.id))}
                      onToDay={() => toDay(session)}
                      onCopy={() => void copyLine(session)}
                      onDrop={() => drop(session)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}

      <GpsEntry profileId={profile.id} name={profile.name} kid={kid} onSave={add} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Una sesión de la lista: cerrada, la fecha, dos cifras y su comentario;
 * abierta, todas sus cifras y lo que se puede hacer con ella.
 * ------------------------------------------------------------------------- */

const TONO_TEXTO: Record<Comentario['tono'], string> = {
  record: 'text-amber-500 font-bold',
  sube: 'text-emerald-500 font-semibold',
  normal: 't-2',
  baja: 't-3',
  inicio: 'text-sky-500',
};

function SesionFila({
  session,
  comentario,
  abierta,
  onToggle,
  onToDay,
  onCopy,
  onDrop,
}: {
  session: GpsSession;
  comentario?: Comentario;
  abierta: boolean;
  onToggle: () => void;
  onToDay: () => void;
  onCopy: () => void;
  onDrop: () => void;
}) {
  const distancia = valueOf(session, 'distance');
  const punta = valueOf(session, 'topSpeed');
  const dia = new Date(`${session.date}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <li className={`overflow-hidden rounded-2xl border ${comentario?.tono === 'record' ? 'border-amber-400/50' : 'hairline'} surf-1`}>
      <button type="button" onClick={onToggle} aria-expanded={abierta} className="block w-full px-3 py-2.5 text-left">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl surf-2 text-lg">
            {KIND_META[session.kind].icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold capitalize leading-tight t-1">{dia}</p>
            <p className="truncate text-[11px] t-3">
              {KIND_META[session.kind].label}
              {session.goalkeeper ? ' · portero' : ''}
              {valueOf(session, 'minutes') !== undefined ? ` · ${formatValue('minutes', valueOf(session, 'minutes')!)}` : ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {distancia !== undefined && <p className="text-[13px] font-black tabular-nums leading-tight t-1">{formatValue('distance', distancia)}</p>}
            {punta !== undefined && <p className="text-[11px] tabular-nums t-3">⚡ {formatValue('topSpeed', punta)}</p>}
          </div>
          <span aria-hidden className={`shrink-0 text-xs t-3 transition-transform ${abierta ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </div>
        {comentario && <p className={`mt-1.5 text-[12px] leading-snug ${TONO_TEXTO[comentario.tono]}`}>{comentario.titular}</p>}
      </button>

      {abierta && (
        <div className="space-y-2.5 border-t px-3 pb-3 pt-2.5 hairline">
          {comentario && comentario.detalles.length > 0 && (
            <ul className="space-y-1">
              {comentario.detalles.map((d) => (
                <li key={d} className="text-[12px] leading-snug t-2">
                  {d}
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-3 gap-1.5">
            {GPS_FIELDS.map((field) => {
              const value = valueOf(session, field.id);
              if (value === undefined) return null;
              return (
                <div key={field.id} className="min-w-0 rounded-xl px-2 py-1.5 surf-2">
                  <p className="truncate text-[9px] font-bold uppercase tracking-wide t-3">
                    {field.icon} {field.short}
                  </p>
                  <p className="truncate text-[13px] font-black tabular-nums t-1">{formatValue(field.id, value)}</p>
                </div>
              );
            })}
          </div>

          {session.note && <p className="text-[11px] leading-relaxed t-3">📝 {session.note}</p>}

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onToDay}
              className="btn-ghost min-h-0 flex-1 px-2 py-1.5 text-[11px]"
              title="Marcar la asistencia y los minutos de movimiento de ese día"
            >
              ✅ Al registro
            </button>
            <button type="button" onClick={onCopy} className="btn-ghost min-h-0 px-3 py-1.5 text-[11px]" title="Copiarla en el formato de pegar">
              📋 Copiar
            </button>
            <button
              type="button"
              onClick={onDrop}
              className="btn-ghost min-h-0 px-3 py-1.5 text-[11px]"
              aria-label={`Borrar la sesión del ${formatShort(session.date)}`}
            >
              🗑️
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------------------
 * Lo que dice la tanda que se acaba de meter
 *
 * Apuntar la sesión de ayer y volcar el mes de marzo entero son dos cosas
 * distintas, y la segunda merece una respuesta distinta. Cuando entran varias
 * sesiones de golpe —que es lo que pasa adjuntando capturas— la pregunta ya
 * no es «¿qué tal fue ésta?» sino «¿qué ha pasado en todo esto?», y eso es lo
 * que contesta esta tarjeta: cuánto se ha corrido en total, qué récords han
 * caído, y cómo queda ese trozo frente a lo que ya había apuntado antes.
 * ------------------------------------------------------------------------- */

function ImportDigest({
  digest,
  kid,
  onClose,
}: {
  digest: GpsDigest;
  kid: boolean;
  onClose: () => void;
}) {
  const span =
    digest.from === digest.to
      ? formatShort(digest.from)
      : `del ${formatShort(digest.from)} al ${formatShort(digest.to)}`;

  return (
    <section className={`${kid ? 'card-kid' : 'card'} border-accent bg-accent-faint p-4`}>
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold t-1">
          📊 {digest.count === 1 ? 'La sesión recién apuntada' : `Las ${digest.count} recién apuntadas`}
        </h3>
        <span className="text-[11px] t-3">{span}</span>

        <button
          type="button"
          onClick={onClose}
          className="btn-ghost ml-auto min-h-0 px-2 py-1 text-[11px]"
        >
          Ocultar
        </button>
      </header>

      {/* Lo que suma la tanda: los dos números que se piensan de cabeza. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Sesiones" value={`${digest.count}`} hint={`en ${digest.days} ${digest.days === 1 ? 'día' : 'días'}`} />
        {digest.minutes > 0 && (
          <Tile
            label="⏱️ Tiempo"
            value={formatValue('minutes', digest.minutes)}
            hint="sumando todas"
          />
        )}
        {digest.distance > 0 && (
          <Tile
            label="🛣️ Distancia"
            value={formatValue('distance', digest.distance)}
            hint="sumando todas"
          />
        )}
        {digest.records.length > 0 && (
          <Tile
            label="🏅 Récords"
            value={`${digest.records.length}`}
            hint={digest.records.length === 1 ? 'marca nueva' : 'marcas nuevas'}
          />
        )}
      </div>

      {/* Las marcas de la tanda, cifra a cifra. */}
      {digest.stats.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {digest.stats
            .filter((stat) => fieldOf(stat.id).record !== false)
            .map((stat) => (
              <span key={stat.id} className="text-[11px] tabular-nums t-2">
                <span aria-hidden>{fieldOf(stat.id).icon}</span>{' '}
                <span className="font-bold t-1">{formatValue(stat.id, stat.best)}</span> la mejor ·{' '}
                {formatValue(stat.id, stat.average)} de media
              </span>
            ))}
        </div>
      )}

      {/* La comparación con lo de antes: la única que no puede hacer Footbar. */}
      {digest.versus.length > 0 && (
        <div className="mt-3 rounded-2xl border p-3 hairline surf-1">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide t-3">
            Frente a las {digest.versusCount} sesiones anteriores
          </p>
          <ul className="space-y-1">
            {digest.versus.map((item) => (
              <li key={item.id} className="text-xs leading-relaxed t-2">
                <span aria-hidden>{fieldOf(item.id).icon}</span>{' '}
                <span className="font-semibold t-1">{fieldOf(item.id).label}</span>{' '}
                {item.change > 0 ? '▲' : '▼'}{' '}
                <span className="font-bold tabular-nums">
                  {Math.abs(Math.round(item.change * 100))} %
                </span>
                : de {formatValue(item.id, item.before)} a {formatValue(item.id, item.now)} de media.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Los récords, con el día en que cayeron. */}
      {digest.records.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed t-2">
          🏅 Marcas nuevas:{' '}
          {digest.records
            .map(
              (record) =>
                `${fieldOf(record.id).label.toLowerCase()} ${formatValue(record.id, record.value)} el ${formatShort(record.on)}`,
            )
            .join('; ')}
          .
        </p>
      )}

      {/* Y lo que se puede decir de la tanda por sí sola. */}
      {digest.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {digest.notes.map((note) => (
            <li key={note.id} className="flex gap-2 text-xs leading-relaxed">
              <span aria-hidden className="shrink-0">
                {note.icon}
              </span>
              <span className={note.tone === 'aviso' ? 't-2' : 't-1'}>{note.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Un número grande con su rótulo: los de arriba del resumen. */
function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border p-3 hairline surf-1">
      <p className="truncate text-[11px] font-bold uppercase tracking-wide t-3">{label}</p>
      <p className="text-lg font-black tabular-nums t-accent">{value}</p>
      <p className="text-[11px] t-3">{hint}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * La última sesión, comparada con las suyas
 * ------------------------------------------------------------------------- */

function LastSession({
  session,
  marks,
  comentario,
  kid,
  pitch,
}: {
  session: GpsSession;
  marks: ReturnType<typeof marksOf>;
  comentario?: Comentario;
  kid: boolean;
  pitch: boolean;
}) {
  const records = marks.filter((mark) => mark.record).length;

  return (
    <section className={`${kid ? 'card-kid' : 'card'} space-y-3 p-4`}>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 text-sm font-bold t-1">
          {KIND_META[session.kind].icon} La última: {friendlyDateLabel(session.date).toLowerCase()}
        </h3>
        <span className="shrink-0 text-[11px] t-3">
          {KIND_META[session.kind].label}
          {records > 0 && ` · 🏅 ${records}${pitch ? ' ¡a lo grande!' : ''}`}
        </span>
      </header>

      {comentario && <ComentarioSesion comentario={comentario} />}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {marks.map((mark) => {
          const field = fieldOf(mark.id);
          const up = mark.change !== null && mark.change > 0;
          const pct = mark.change === null ? null : Math.round(mark.change * 100);

          return (
            <div
              key={mark.id}
              className={`min-w-0 rounded-2xl border px-3 py-2.5 ${mark.record ? 'border-accent bg-accent-faint' : 'hairline surf-1'}`}
            >
              <p className="truncate text-[10px] font-bold uppercase tracking-wide t-3">
                {field.icon} {field.short}
              </p>
              <p className="truncate text-lg font-black tabular-nums leading-tight t-1">{formatValue(mark.id, mark.value)}</p>
              {mark.record ? (
                <p className="text-[11px] font-bold t-accent">🏅 Récord</p>
              ) : pct === null ? (
                <p className="text-[11px] t-3">primera vez</p>
              ) : Math.abs(pct) < 3 ? (
                <p className="text-[11px] t-3">= en su media</p>
              ) : (
                <p className={`text-[11px] tabular-nums ${up ? 'text-emerald-500' : 't-3'}`}>
                  {up ? '▲' : '▼'} {Math.abs(pct)} % que su media
                </p>
              )}
            </div>
          );
        })}
      </div>

      {session.note && <p className="text-xs leading-relaxed t-3">📝 {session.note}</p>}
    </section>
  );
}
