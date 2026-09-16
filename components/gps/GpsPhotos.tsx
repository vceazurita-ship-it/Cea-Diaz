'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { formatShort, todayKey } from '@/lib/dates';
import {
  GPS_FIELDS,
  KIND_META,
  TRACKER,
  claimId,
  fieldOf,
  hasNumbers,
  readScreen,
} from '@/lib/gps';
import type { GpsFieldId } from '@/lib/gps';
import { readImage, releaseOcr } from '@/lib/gpsOcr';
import type { GpsKind, GpsSession, ProfileId } from '@/types';

/* =========================================================================
 *  Adjuntar capturas de pantalla del rastreador.
 *
 *  La misma sesión que antes había que teclear, ahora fotografiada. Se
 *  adjuntan las que sean —las cinco de la semana pasada, las doce del mes
 *  que se quedó sin apuntar—, el navegador las lee una a una y cada foto se
 *  convierte en una ficha con su día, su tipo y sus cifras.
 *
 *  Lo importante es lo que pasa **después** de leerlas: la ficha se enseña
 *  antes de guardar nada y todo en ella se puede tocar. Reconocer texto de
 *  una imagen falla —a veces lee 243 donde pone 24,3— y una aplicación que
 *  se traga eso en silencio estropea justo las medias que se querían mirar.
 *  Aquí lo que no cabe en una sesión de verdad se aparta y se dice, y lo
 *  demás queda a la vista, en casillas, para corregirlo de un toque.
 *
 *  La fecha merece párrafo aparte, porque es la razón de ser de esta
 *  pantalla: se busca en la propia captura —la aplicación la escribe en la
 *  cabecera de cada sesión— y cuando aparece, la ficha se va a su día,
 *  aunque sea de hace tres semanas. Cuando no aparece, se pone la de hoy y
 *  se avisa de que se ha puesto, que no es lo mismo.
 * ========================================================================= */

interface GpsPhotosProps {
  profileId: ProfileId;
  name: string;
  onSave: (sessions: GpsSession[]) => void;
}

/** Una foto adjuntada y lo que se ha sacado de ella. */
interface Shot {
  key: string;
  fileName: string;
  /** URL temporal para la miniatura; se suelta al quitar la foto. */
  preview: string;
  state: 'leyendo' | 'lista' | 'error';
  /** Lo que ha reconocido el navegador, para poder mirarlo. */
  text: string;
  error?: string;
  date: string;
  kind: GpsKind;
  note: string;
  /** Las cifras, como texto: son casillas y se corrigen escribiendo. */
  numbers: Partial<Record<GpsFieldId, string>>;
  /** `false` si la fecha no venía en la captura y se ha puesto la de hoy. */
  dated: boolean;
  /** Cifras leídas que no caben en una sesión de verdad. */
  dropped: { id: GpsFieldId; value: number }[];
}

let counter = 0;

export function GpsPhotos({ profileId, name, onSave }: GpsPhotosProps) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Las URL temporales de las miniaturas y el motor de lectura se sueltan al
  // salir: son lo único de esta pantalla que sobrevive a su componente.
  const live = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of live.current) URL.revokeObjectURL(url);
      void releaseOcr();
    },
    [],
  );

  const patch = useCallback((key: string, change: Partial<Shot>) => {
    setShots((current) =>
      current.map((shot) => (shot.key === key ? { ...shot, ...change } : shot)),
    );
  }, []);

  /** Adjunta las fotos y las va leyendo de una en una. */
  const attach = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const today = todayKey();
      const incoming: Shot[] = Array.from(files).map((file) => {
        const preview = URL.createObjectURL(file);
        live.current.push(preview);

        return {
          key: `foto-${(counter += 1)}`,
          fileName: file.name,
          preview,
          state: 'leyendo',
          text: '',
          date: today,
          kind: 'entreno',
          note: '',
          numbers: {},
          dated: false,
          dropped: [],
        };
      });

      setShots((current) => [...current, ...incoming]);
      setBusy((count) => count + incoming.length);

      // De una en una: el motor es uno solo, y en el móvil lanzarle cinco
      // imágenes a la vez lo único que consigue es que tarden todas.
      const list = Array.from(files);
      for (let i = 0; i < list.length; i += 1) {
        const shot = incoming[i];

        try {
          const text = await readImage(list[i]);
          const read = readScreen(profileId, text, today);

          const numbers: Partial<Record<GpsFieldId, string>> = {};
          for (const field of GPS_FIELDS) {
            const value = read.session[field.id];
            if (typeof value === 'number') {
              numbers[field.id] = `${Number(value.toFixed(field.decimals))}`;
            }
          }

          patch(shot.key, {
            state: 'lista',
            text: text.trim(),
            date: read.session.date,
            kind: read.session.kind,
            dated: read.dated,
            dropped: read.dropped,
            numbers,
          });
        } catch (error) {
          patch(shot.key, {
            state: 'error',
            error:
              error instanceof Error && error.message
                ? error.message
                : 'No se ha podido leer la imagen.',
          });
        } finally {
          setBusy((count) => Math.max(0, count - 1));
        }
      }
    },
    [patch, profileId],
  );

  const remove = (key: string) => {
    setShots((current) => {
      const gone = current.find((shot) => shot.key === key);
      if (gone) {
        URL.revokeObjectURL(gone.preview);
        live.current = live.current.filter((url) => url !== gone.preview);
      }
      return current.filter((shot) => shot.key !== key);
    });
  };

  /** Las fichas que tienen al menos una cifra: son las que se pueden guardar. */
  const ready = shots.filter((shot) => shot.state === 'lista' && countOf(shot) > 0);

  const save = () => {
    const used = new Set<string>();
    const now = new Date().toISOString();

    const sessions = ready.map((shot) => {
      const session: GpsSession = {
        id: '',
        profileId,
        date: shot.date,
        kind: shot.kind,
        note: shot.note.trim() || undefined,
        updatedAt: now,
      };

      for (const field of GPS_FIELDS) {
        const raw = (shot.numbers[field.id] ?? '').replace(',', '.').trim();
        if (!raw) continue;
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 0) session[field.id] = value;
      }

      session.id = claimId(profileId, session.date, session.kind, used);
      return session;
    });

    const keepers = sessions.filter(hasNumbers);
    if (keepers.length === 0) return;

    onSave(keepers);

    for (const url of live.current) URL.revokeObjectURL(url);
    live.current = [];
    setShots([]);
    if (input.current) input.current.value = '';
  };

  // No se pregunta de antemano si este navegador sabe leer imágenes: en el
  // servidor la respuesta sería otra que en el móvil y la página se montaría
  // torcida. Si no sabe, lo dirá la propia foto al intentar leerla, y las
  // casillas siguen ahí para escribir las cifras a mano.
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">Capturas de las sesiones de {name}</span>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => void attach(event.target.files)}
          className="field w-full p-2.5 text-xs file:mr-3 file:rounded-lg file:border-0
                     file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-bold
                     file:t-on-accent"
        />
      </label>

      <p className="text-[11px] leading-relaxed t-3">
        Las capturas de {TRACKER}, las que sean y de los días que sean —también de sesiones que
        ya pasaron—. Se leen <strong>en este mismo aparato</strong>: ninguna foto sale de aquí.
        La primera tarda un poco más, porque se descarga el lector; las siguientes ya no. Antes
        de guardar nada se enseña lo que se ha entendido de cada una, y todo se puede corregir.
      </p>

      {busy > 0 && (
        <p className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold
                      hairline surf-1 t-2">
          <span className="animate-pulse" aria-hidden>
            🔎
          </span>
          Leyendo {busy === 1 ? 'la foto' : `${busy} fotos`}…
        </p>
      )}

      {shots.map((shot) => (
        <ShotCard
          key={shot.key}
          shot={shot}
          onChange={(change) => patch(shot.key, change)}
          onRemove={() => remove(shot.key)}
        />
      ))}

      {shots.length > 0 && (
        <button
          type="button"
          onClick={save}
          disabled={ready.length === 0 || busy > 0}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
        >
          {ready.length > 1
            ? `Guardar las ${ready.length} sesiones`
            : 'Guardar la sesión'}
        </button>
      )}
    </div>
  );
}

/** Cuántas cifras tiene puestas una ficha. */
function countOf(shot: Shot): number {
  return GPS_FIELDS.filter((field) => (shot.numbers[field.id] ?? '').trim() !== '').length;
}

/* ---------------------------------------------------------------------------
 * La ficha de una foto
 * ------------------------------------------------------------------------- */

function ShotCard({
  shot,
  onChange,
  onRemove,
}: {
  shot: Shot;
  onChange: (change: Partial<Shot>) => void;
  onRemove: () => void;
}) {
  const [raw, setRaw] = useState(false);
  const found = countOf(shot);

  return (
    <div className="space-y-3 rounded-2xl border p-3 hairline surf-2">
      <div className="flex gap-3">
        {/* La miniatura, para saber de qué sesión se está hablando. Sin
            `next/image` a propósito: es una URL temporal del propio aparato. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shot.preview}
          alt={`Captura ${shot.fileName}`}
          className="h-20 w-20 shrink-0 rounded-xl border object-cover hairline"
        />

        <div className="min-w-0 flex-1">
          {shot.state === 'leyendo' && (
            <p className="text-xs font-semibold t-2">🔎 Leyendo la captura…</p>
          )}

          {shot.state === 'error' && (
            <p className="text-xs font-semibold t-2">
              ⚠️ {shot.error} Se puede rellenar a mano igualmente.
            </p>
          )}

          {shot.state === 'lista' && (
            <>
              <p className="text-xs font-bold t-1">
                {found === 0
                  ? '🤷 No se ha reconocido ninguna cifra'
                  : `✓ ${found} ${found === 1 ? 'cifra leída' : 'cifras leídas'}`}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug t-3">
                {shot.dated
                  ? `Fecha de la propia captura: ${formatShort(shot.date)}.`
                  : 'La captura no traía fecha, así que se ha puesto la de hoy. Cámbiala si la sesión fue otro día.'}
              </p>
            </>
          )}

          {shot.dropped.length > 0 && (
            <p className="mt-1 text-[11px] leading-snug t-2">
              ⚠️ Fuera por imposible:{' '}
              {shot.dropped
                .map((item) => `${fieldOf(item.id).short.toLowerCase()} ${item.value}`)
                .join(', ')}
              . Mira la foto y escríbelo tú.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="btn-ghost h-fit min-h-0 px-2 py-1 text-[11px]"
          aria-label={`Quitar la captura ${shot.fileName}`}
        >
          🗑️
        </button>
      </div>

      {shot.state !== 'leyendo' && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold t-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">
                Día
              </span>
              <input
                type="date"
                value={shot.date}
                max={todayKey()}
                onChange={(event) => onChange({ date: event.target.value || todayKey() })}
                className={`field min-h-[2.75rem] p-2.5 ${
                  shot.dated ? '' : 'border-accent'
                }`}
              />
            </label>

            <div className="flex rounded-xl border p-0.5 hairline surf-1">
              {(['entreno', 'partido'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChange({ kind: option })}
                  aria-pressed={shot.kind === option}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors
                    ${shot.kind === option ? 'bg-accent t-on-accent' : 't-3 hover-soft'}`}
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
                  value={shot.numbers[field.id] ?? ''}
                  onChange={(event) =>
                    onChange({ numbers: { ...shot.numbers, [field.id]: event.target.value } })
                  }
                  placeholder="—"
                  className="field min-h-[2.75rem] w-full p-2.5 tabular-nums"
                />
              </label>
            ))}
          </div>

          <label className="block text-xs font-semibold t-2">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">
              Nota
            </span>
            <input
              value={shot.note}
              onChange={(event) => onChange({ note: event.target.value })}
              maxLength={200}
              placeholder="Jugó de lateral, campo pesado…"
              className="field min-h-[2.75rem] w-full p-2.5"
            />
          </label>

          {shot.text && (
            <div>
              <button
                type="button"
                onClick={() => setRaw((value) => !value)}
                className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
              >
                {raw ? 'Ocultar' : 'Ver'} lo que se ha leído en la foto
              </button>

              {raw && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border
                                p-2 font-mono text-[10px] leading-snug hairline surf-1 t-3">
                  {shot.text}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
