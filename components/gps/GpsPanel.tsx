'use client';

import { useMemo, useState } from 'react';

import { GpsEntry } from '@/components/gps/GpsEntry';
import { GpsTrend } from '@/components/gps/GpsTrend';
import { useToast } from '@/components/ui/Toast';
import { useGpsSessions } from '@/hooks/useGps';
import type { HabitStore } from '@/hooks/useHabitStore';
import { formatShort, friendlyDateLabel } from '@/lib/dates';
import {
  GPS_FIELDS,
  KIND_META,
  TRACKER,
  bookOf,
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
import { findMetric } from '@/lib/habits';
import { headingFont } from '@/lib/profiles';
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

  const shown = useMemo(
    () => (filter === 'todo' ? sessions : sessions.filter((item) => item.kind === filter)),
    [sessions, filter],
  );

  const stats = useMemo(() => statsOf(shown), [shown]);
  const notes = useMemo(() => notesOf(shown), [shown]);
  const last = shown[0];
  // Contra lo que se está mirando, no contra todo: filtrando por partidos, la
  // última se compara con los partidos anteriores, que es la comparación que
  // se ha pedido al filtrar.
  const marks = useMemo(() => (last ? marksOf(last, shown) : []), [last, shown]);

  /* --------------------------------------------------------- acciones */

  const add = (incoming: GpsSession[]) => {
    const before = bookOf(profile.id);
    const known = new Set(sessions.map((item) => item.id));
    const fresh = incoming.filter((item) => !known.has(item.id)).length;

    saveSessions(profile.id, incoming);

    notify({
      message:
        incoming.length === 1
          ? fresh === 1
            ? 'Sesión apuntada.'
            : 'Sesión corregida: ya había una de ese día.'
          : `${incoming.length} sesiones apuntadas${fresh < incoming.length ? ` (${incoming.length - fresh} corregidas)` : ''}.`,
      icon: '🛰️',
      action: { label: 'Deshacer', onClick: () => restoreBook(profile.id, before) },
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={`text-lg font-bold t-1 ${heading}`}>
          🛰️ {pitch ? `Los datos de ${profile.name}` : `GPS de ${profile.name}`}
        </h2>
        <span className="text-xs t-3">
          {sessions.length === 0
            ? `sin sesiones todavía · ${TRACKER}`
            : `${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'} · ${TRACKER}`}
        </span>

        {sessions.length > 0 && (
          <div className="ml-auto flex rounded-xl border p-0.5 hairline surf-1">
            {(['todo', 'entreno', 'partido'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                aria-pressed={filter === option}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors
                  ${filter === option ? 'bg-accent t-on-accent' : 't-3 hover-soft'}`}
              >
                {option === 'todo' ? 'Todo' : KIND_META[option].label + 's'}
              </button>
            ))}
          </div>
        )}
      </div>

      {sessions.length === 0 ? (
        <section className={`${kid ? 'card-kid' : 'card'} p-4`}>
          <h3 className="mb-2 text-sm font-bold t-1">Todavía no hay ninguna sesión</h3>
          <p className="text-sm leading-relaxed t-3">
            El rastreador de {profile.name} deja las cifras en la aplicación de {TRACKER} y allí se
            quedan: una sesión por pantalla, sin manera de compararlas ni de exportarlas con la
            cuenta gratuita. Apuntando aquí lo que enseña —lo que corrió, los esprines, la punta de
            velocidad— se puede empezar a ver lo que allí no se ve: si va a más, cuáles fueron sus
            mejores días y cuánto cambia un partido respecto a un entreno.
          </p>
          <p className="mt-2 text-sm leading-relaxed t-3">
            Con cuatro sesiones ya sale la primera tendencia.
          </p>
        </section>
      ) : (
        <>
          {last && <LastSession session={last} marks={marks} kid={kid} pitch={pitch} />}

          {stats.length > 0 && (
            <section className={`${kid ? 'card-kid' : 'card'} p-4`}>
              <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-sm font-bold t-1">🏅 Sus marcas</h3>
                <span className="text-[11px] t-3">
                  lo mejor de {shown.length} {shown.length === 1 ? 'sesión' : 'sesiones'}, con el
                  día en que lo hizo
                </span>
              </header>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {stats
                  .filter((stat) => fieldOf(stat.id).record !== false)
                  .map((stat) => (
                    <div key={stat.id} className="rounded-2xl border p-3 hairline surf-1">
                      <p className="truncate text-[11px] font-bold uppercase tracking-wide t-3">
                        {fieldOf(stat.id).icon} {fieldOf(stat.id).short}
                      </p>
                      <p className="text-lg font-black tabular-nums t-accent">
                        {formatValue(stat.id, stat.best)}
                      </p>
                      <p className="text-[11px] t-3">
                        {formatShort(stat.bestOn)} · media {formatValue(stat.id, stat.average)}
                      </p>
                      {stat.perHour !== undefined && (
                        <p className="text-[11px] t-3">
                          {formatValue(stat.id, stat.perHour)} por hora
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          )}

          <GpsTrend sessions={shown} kid={kid} />

          {notes.length > 0 && (
            <section className={`${kid ? 'card-kid' : 'card'} p-4`}>
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

          <section className={`${kid ? 'card-kid' : 'card'} p-4`}>
            <h3 className="mb-3 text-sm font-bold t-1">
              📜 Todas las sesiones ({shown.length})
            </h3>

            <ul className="space-y-2">
              {shown.map((session) => (
                <li key={session.id} className="rounded-2xl border p-3 hairline surf-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-bold t-1">
                      {KIND_META[session.kind].icon} {formatShort(session.date)}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide t-3">
                      {KIND_META[session.kind].label}
                    </span>

                    <span className="ml-auto flex gap-1">
                      <button
                        type="button"
                        onClick={() => toDay(session)}
                        className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
                        title="Marcar la asistencia y los minutos de movimiento de ese día"
                      >
                        ✅ Al registro
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyLine(session)}
                        className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
                        title="Copiarla en el formato de pegar"
                      >
                        📋
                      </button>
                      <button
                        type="button"
                        onClick={() => drop(session)}
                        className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
                        aria-label={`Borrar la sesión del ${formatShort(session.date)}`}
                      >
                        🗑️
                      </button>
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {GPS_FIELDS.map((field) => {
                      const value = valueOf(session, field.id);
                      if (value === undefined) return null;
                      return (
                        <span key={field.id} className="text-xs tabular-nums t-2">
                          <span aria-hidden>{field.icon}</span> {formatValue(field.id, value)}
                        </span>
                      );
                    })}
                  </div>

                  {session.note && (
                    <p className="mt-1 text-[11px] leading-relaxed t-3">{session.note}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <GpsEntry profileId={profile.id} name={profile.name} kid={kid} onSave={add} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * La última sesión, comparada con las suyas
 * ------------------------------------------------------------------------- */

function LastSession({
  session,
  marks,
  kid,
  pitch,
}: {
  session: GpsSession;
  marks: ReturnType<typeof marksOf>;
  kid: boolean;
  pitch: boolean;
}) {
  const records = marks.filter((mark) => mark.record).length;

  return (
    <section className={`${kid ? 'card-kid' : 'card'} p-4`}>
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold t-1">
          {KIND_META[session.kind].icon} La última: {friendlyDateLabel(session.date).toLowerCase()}
        </h3>
        <span className="text-[11px] t-3">
          {KIND_META[session.kind].label}
          {records > 0 &&
            ` · ${records} ${records === 1 ? 'récord' : 'récords'} ${pitch ? '¡a lo grande!' : ''}`}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {marks.map((mark) => {
          const field = fieldOf(mark.id);
          const up = mark.change !== null && mark.change > 0;

          return (
            <div
              key={mark.id}
              className={`rounded-2xl border p-3 ${
                mark.record ? 'border-accent bg-accent-faint' : 'hairline surf-1'
              }`}
            >
              <p className="truncate text-[11px] font-bold uppercase tracking-wide t-3">
                {field.icon} {field.short}
              </p>
              <p className="text-lg font-black tabular-nums t-1">
                {formatValue(mark.id, mark.value)}
              </p>

              {mark.record ? (
                <p className="text-[11px] font-bold t-accent">🏅 Récord</p>
              ) : mark.change === null ? (
                <p className="text-[11px] t-3">primera vez</p>
              ) : (
                <p className={`text-[11px] tabular-nums ${up ? 't-accent' : 't-3'}`}>
                  {up ? '▲' : '▼'} {Math.abs(Math.round(mark.change * 100))} % que su media
                </p>
              )}
            </div>
          );
        })}
      </div>

      {session.note && <p className="mt-2 text-xs leading-relaxed t-3">📝 {session.note}</p>}
    </section>
  );
}
