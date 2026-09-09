'use client';

import { useMemo, useState } from 'react';

import {
  GPS_FIELDS,
  KIND_META,
  PASTE_EXAMPLE,
  TRACKER,
  formatValue,
  hasNumbers,
  parsePaste,
  valueOf,
} from '@/lib/gps';
import { formatShort, todayKey } from '@/lib/dates';
import type { GpsKind, GpsSession, ProfileId } from '@/types';

/* =========================================================================
 *  Meter una sesión.
 *
 *  Dos caminos para lo mismo, porque hay dos situaciones distintas:
 *
 *   · **Pegar**. Es el camino corto y el que se usa casi siempre: una línea
 *     por sesión, en el orden que sea, y se pueden pegar cinco de golpe. Es
 *     lo que permite que alguien mire la aplicación del rastreador, escriba
 *     los números en una línea y los tenga aquí dentro para siempre.
 *
 *   · **A mano**. Casillas de toda la vida, para el móvil y para el día en
 *     que no apetece acordarse de ningún formato.
 *
 *  Lo pegado se enseña **antes** de guardarlo. Un pegote que se traga en
 *  silencio y adivina mal es peor que uno que no funciona: aquí se ve qué ha
 *  entendido, sesión a sesión, y sólo entonces se guarda.
 * ========================================================================= */

interface GpsEntryProps {
  profileId: ProfileId;
  name: string;
  kid: boolean;
  onSave: (sessions: GpsSession[]) => void;
}

export function GpsEntry({ profileId, name, kid, onSave }: GpsEntryProps) {
  const [mode, setMode] = useState<'pegar' | 'mano'>('pegar');

  return (
    <section className={`${kid ? 'card-kid' : 'card'} p-4`}>
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold t-1">📥 Apuntar una sesión</h3>
        <span className="text-[11px] t-3">
          Los números de {TRACKER}, tal y como los enseña la aplicación
        </span>

        <div className="ml-auto flex rounded-xl border p-0.5 hairline surf-1">
          {(['pegar', 'mano'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors
                ${mode === option ? 'bg-accent t-on-accent' : 't-3 hover-soft'}`}
            >
              {option === 'pegar' ? 'Pegar' : 'A mano'}
            </button>
          ))}
        </div>
      </header>

      {mode === 'pegar' ? (
        <PasteBox profileId={profileId} name={name} onSave={onSave} />
      ) : (
        <ByHand profileId={profileId} onSave={onSave} />
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Pegar
 * ------------------------------------------------------------------------- */

function PasteBox({
  profileId,
  name,
  onSave,
}: {
  profileId: ProfileId;
  name: string;
  onSave: (sessions: GpsSession[]) => void;
}) {
  const [text, setText] = useState('');

  // Se relee en cada tecla: es lo que convierte la caja en algo que enseña
  // lo que va entendiendo en vez de un salto de fe al pulsar «guardar».
  const read = useMemo(() => parsePaste(profileId, text), [profileId, text]);

  const save = () => {
    if (read.sessions.length === 0) return;
    onSave(read.sessions);
    setText('');
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">Sesiones de {name}</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          spellCheck={false}
          placeholder={`${PASTE_EXAMPLE}\n2026-09-11 partido 60min 4,1km 9 sprints 26,8km/h`}
          className="field w-full resize-y p-3 font-mono text-xs leading-relaxed"
        />
      </label>

      <p className="text-[11px] leading-relaxed t-3">
        Una línea por sesión. El orden da igual y la coma vale como el punto:
        se reconoce <strong>la fecha</strong> (<code>2026-09-09</code>, <code>9/9</code>,{' '}
        <code>hoy</code>, <code>ayer</code>), si fue <strong>entreno o partido</strong> y cada
        cifra por su unidad o por su nombre —{' '}
        {GPS_FIELDS.map((field) => field.short.toLowerCase()).join(', ')}—. Detrás de{' '}
        <code>|</code> o de <code>nota:</code> va lo que quieras recordar. Lo que no se reconozca
        se queda fuera, no se inventa.
      </p>

      {read.sessions.length > 0 && (
        <div className="space-y-2 rounded-2xl border p-3 hairline surf-2">
          <p className="text-[11px] font-bold uppercase tracking-wide t-3">
            Esto es lo que se va a guardar
          </p>

          {read.sessions.map((session) => (
            <div key={session.id} className="text-xs leading-relaxed t-2">
              <span className="font-bold t-1">
                {KIND_META[session.kind].icon} {formatShort(session.date)} ·{' '}
                {KIND_META[session.kind].label}
              </span>{' '}
              {GPS_FIELDS.map((field) => {
                const value = valueOf(session, field.id);
                if (value === undefined) return null;
                return (
                  <span key={field.id} className="mr-2 whitespace-nowrap">
                    {field.icon} {formatValue(field.id, value)}
                  </span>
                );
              })}
              {session.note && <span className="t-3">— {session.note}</span>}
            </div>
          ))}
        </div>
      )}

      {read.ignored.length > 0 && (
        <p className="rounded-xl border px-3 py-2 text-[11px] leading-relaxed hairline surf-1 t-3">
          ⚠️ Sin cifras que reconocer, así que{' '}
          {read.ignored.length === 1 ? 'esa línea se queda fuera' : 'esas líneas se quedan fuera'}:{' '}
          {read.ignored.map((line) => `«${line}»`).join(', ')}.
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={read.sessions.length === 0}
        className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
      >
        {read.sessions.length > 1
          ? `Guardar las ${read.sessions.length} sesiones`
          : 'Guardar la sesión'}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * A mano
 * ------------------------------------------------------------------------- */

function ByHand({
  profileId,
  onSave,
}: {
  profileId: ProfileId;
  onSave: (sessions: GpsSession[]) => void;
}) {
  const [date, setDate] = useState(todayKey);
  const [kind, setKind] = useState<GpsKind>('entreno');
  const [note, setNote] = useState('');
  const [numbers, setNumbers] = useState<Record<string, string>>({});

  const set = (id: string, value: string) =>
    setNumbers((current) => ({ ...current, [id]: value }));

  const save = () => {
    const session: GpsSession = {
      id: `${profileId}:${date}:${kind}`,
      profileId,
      date,
      kind,
      note: note.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    for (const field of GPS_FIELDS) {
      const raw = (numbers[field.id] ?? '').replace(',', '.').trim();
      if (!raw) continue;
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0) session[field.id] = value;
    }

    // Una ficha sin una sola cifra no es una sesión: no se guarda nada.
    if (!hasNumbers(session)) return;

    onSave([session]);
    setNumbers({});
    setNote('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold t-2">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">Día</span>
          <input
            type="date"
            value={date}
            max={todayKey()}
            onChange={(event) => setDate(event.target.value || todayKey())}
            className="field min-h-[2.75rem] p-2.5"
          />
        </label>

        <div className="flex rounded-xl border p-0.5 hairline surf-1">
          {(['entreno', 'partido'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              aria-pressed={kind === option}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors
                ${kind === option ? 'bg-accent t-on-accent' : 't-3 hover-soft'}`}
            >
              {KIND_META[option].icon} {KIND_META[option].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {GPS_FIELDS.map((field) => (
          <label key={field.id} className="text-xs font-semibold t-2">
            <span className="mb-1 block truncate text-[11px] font-bold uppercase tracking-wide t-3">
              {field.icon} {field.short}
              {field.unit && <span className="normal-case"> ({field.unit})</span>}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={field.decimals > 0 ? 0.1 : 1}
              value={numbers[field.id] ?? ''}
              onChange={(event) => set(field.id, event.target.value)}
              placeholder="—"
              className="field min-h-[2.75rem] w-full p-2.5 tabular-nums"
            />
          </label>
        ))}
      </div>

      <label className="block text-xs font-semibold t-2">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">Nota</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
          placeholder="Jugó de lateral, campo pesado…"
          className="field min-h-[2.75rem] w-full p-2.5"
        />
      </label>

      <p className="text-[11px] leading-relaxed t-3">
        Lo que se deje en blanco se queda en blanco. Un cero inventado se colaría en las medias y
        estropearía justo la comparación que se busca.
      </p>

      <button type="button" onClick={save} className="btn-primary px-4 py-2 text-sm">
        Guardar la sesión
      </button>
    </div>
  );
}
