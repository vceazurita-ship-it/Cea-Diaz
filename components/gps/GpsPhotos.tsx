'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { formatShort, todayKey } from '@/lib/dates';
import { GPS_FIELDS, KIND_META, TRACKER, claimId, fieldOf, hasNumbers, readScreen } from '@/lib/gps';
import type { GpsFieldId } from '@/lib/gps';
import { readImage, releaseOcr } from '@/lib/gpsOcr';
import type { GpsKind, GpsSession, ProfileId } from '@/types';

/* =========================================================================
 *  Adjuntar capturas de pantalla del rastreador.
 *
 *  La misma sesión que antes había que teclear, ahora fotografiada. Se
 *  adjuntan las que sean —las cinco de la semana pasada, las doce del mes
 *  que se quedó sin apuntar—, el navegador las lee una a una y de ahí salen
 *  las fichas que se van a guardar.
 *
 *  **Una sesión no es una foto.** La aplicación del rastreador reparte los
 *  números de un mismo entrenamiento por varias pantallas —lo corrido en
 *  una, el balón en otra, el mapa en otra—, así que lo normal es fotografiar
 *  dos o tres cosas del mismo día. Por eso las capturas que traen el mismo
 *  día y el mismo tipo **se juntan solas en una sola ficha**, completándose
 *  entre ellas: lo que no venía en la primera lo pone la segunda. Y cuando
 *  el juntado no acierta, se deshace de un toque —✂️ para separar una foto,
 *  🔗 para unir dos fichas—, porque el que estuvo allí sabe mejor que nadie
 *  cuántos entrenamientos hubo.
 *
 *  Sólo se juntan solas las que **traen fecha en la captura**. Las que no la
 *  traen se quedan cada una por su lado: juntar por «hoy» cinco fotos sin
 *  fecha sería inventarse que son la misma sesión, que es justo lo que esta
 *  pantalla no hace.
 *
 *  Lo demás es la misma regla de siempre: la ficha se enseña antes de
 *  guardar nada y todo en ella se puede tocar. Reconocer texto de una imagen
 *  falla —a veces lee 243 donde pone 24,3— y una aplicación que se traga eso
 *  en silencio estropea justo las medias que se querían mirar.
 * ========================================================================= */

interface GpsPhotosProps {
  profileId: ProfileId;
  name: string;
  onSave: (sessions: GpsSession[]) => void;
}

/** Una foto adjuntada y lo que se ha sacado de ella. */
interface Photo {
  key: string;
  fileName: string;
  /** URL temporal para la miniatura; se suelta al quitar la foto. */
  preview: string;
  state: 'leyendo' | 'lista' | 'error';
  /** Lo que ha reconocido el navegador, para poder mirarlo. */
  text: string;
  error?: string;
  /** Las cifras leídas en esta foto, tal cual. */
  numbers: Partial<Record<GpsFieldId, string>>;
  date: string;
  kind: GpsKind;
  /** `true` si la fecha venía en la captura. */
  dated: boolean;
  /** Cifras leídas que no caben en una sesión de verdad. */
  dropped: { id: GpsFieldId; value: number }[];
}

/** Una sesión en construcción: una o varias fotos del mismo entrenamiento. */
interface Draft {
  key: string;
  photos: Photo[];
  date: string;
  kind: GpsKind;
  note: string;
  numbers: Partial<Record<GpsFieldId, string>>;
  dated: boolean;
  dropped: { id: GpsFieldId; value: number }[];
  /** Cifras en las que dos fotos no dicen lo mismo. */
  conflicts: Partial<Record<GpsFieldId, string[]>>;
  /** `true` si se ha separado a mano y no debe volver a juntarse sola. */
  alone: boolean;
}

let counter = 0;

const nextKey = (prefix: string) => `${prefix}-${(counter += 1)}`;

/* ---------------------------------------------------------------------------
 * Juntar lo que dicen varias fotos
 * ------------------------------------------------------------------------- */

/**
 * Compone una ficha a partir de sus fotos.
 *
 * Manda la primera que traiga cada cosa, y lo que otra diga distinto **no se
 * pisa: se apunta como discrepancia** y se enseña. Dos capturas de la misma
 * sesión no deberían contradecirse, así que cuando ocurre casi siempre es que
 * no eran la misma sesión —o que una se leyó mal—, y las dos cosas hay que
 * decirlas en vez de quedarse con una a escondidas.
 */
function compose(photos: Photo[]): Pick<Draft, 'date' | 'kind' | 'dated' | 'numbers' | 'dropped' | 'conflicts'> {
  const numbers: Partial<Record<GpsFieldId, string>> = {};
  const conflicts: Partial<Record<GpsFieldId, string[]>> = {};

  for (const field of GPS_FIELDS) {
    const seen: string[] = [];

    for (const photo of photos) {
      const value = (photo.numbers[field.id] ?? '').trim();
      if (value && !seen.includes(value)) seen.push(value);
    }

    if (seen.length > 0) numbers[field.id] = seen[0];
    if (seen.length > 1) conflicts[field.id] = seen;
  }

  const dated = photos.find((photo) => photo.dated);

  return {
    date: dated?.date ?? photos[0]?.date ?? todayKey(),
    // Basta con que una captura diga «partido» para que lo sea: nadie
    // fotografía un partido y un entrenamiento creyendo que son lo mismo.
    kind: photos.some((photo) => photo.kind === 'partido') ? 'partido' : 'entreno',
    dated: Boolean(dated),
    numbers,
    dropped: photos.flatMap((photo) => photo.dropped),
    conflicts,
  };
}

/** Una ficha nueva con esas fotos dentro. */
function draftOf(photos: Photo[], alone = false, note = '', key = nextKey('ficha')): Draft {
  return { key, photos, note, alone, ...compose(photos) };
}

export function GpsPhotos({ profileId, name, onSave }: GpsPhotosProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(0);
  /** El día que se les pone a las capturas que no traen fecha. */
  const [fallback, setFallback] = useState(todayKey);
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

  /** Cambia una ficha, dejando las demás como estaban. */
  const patch = useCallback((key: string, change: Partial<Draft>) => {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)),
    );
  }, []);

  /**
   * Guarda lo leído de una foto y, si procede, junta su ficha con la del
   * mismo día y tipo. Se hace aquí y no al final para que la pantalla se vaya
   * ordenando a la vista mientras se leen las diez capturas.
   */
  const settle = useCallback((photoKey: string, read: Partial<Photo>) => {
    setDrafts((current) => {
      const updated = current.map((draft) =>
        draft.photos[0]?.key === photoKey && draft.photos.length === 1
          ? draftOf([{ ...draft.photos[0], ...read }], draft.alone, draft.note, draft.key)
          : draft,
      );

      const mine = updated.find((draft) => draft.photos[0]?.key === photoKey);
      if (!mine || mine.alone || !mine.dated) return updated;

      // El hermano: otra ficha del mismo día y tipo, con fecha de captura
      // también, y que no se haya separado a mano.
      const twin = updated.find(
        (draft) =>
          draft.key !== mine.key && !draft.alone && draft.dated && draft.date === mine.date && draft.kind === mine.kind,
      );
      if (!twin) return updated;

      const joined = draftOf([...twin.photos, ...mine.photos], false, twin.note, twin.key);
      return updated.filter((draft) => draft.key !== mine.key).map((draft) => (draft.key === twin.key ? joined : draft));
    });
  }, []);

  /** Adjunta las fotos y las va leyendo de una en una. */
  const attach = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const today = todayKey();
      const list = Array.from(files);

      const fresh: Photo[] = list.map((file) => {
        const preview = URL.createObjectURL(file);
        live.current.push(preview);

        return {
          key: nextKey('foto'),
          fileName: file.name,
          preview,
          state: 'leyendo',
          text: '',
          numbers: {},
          date: today,
          kind: 'entreno',
          dated: false,
          dropped: [],
        };
      });

      setDrafts((current) => [...current, ...fresh.map((photo) => draftOf([photo]))]);
      setBusy((count) => count + fresh.length);

      // De una en una: el motor es uno solo, y en el móvil lanzarle cinco
      // imágenes a la vez lo único que consigue es que tarden todas.
      for (let i = 0; i < list.length; i += 1) {
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

          settle(fresh[i].key, {
            state: 'lista',
            text: text.trim(),
            date: read.session.date,
            kind: read.session.kind,
            dated: read.dated,
            dropped: read.dropped,
            numbers,
          });
        } catch (error) {
          settle(fresh[i].key, {
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

      if (input.current) input.current.value = '';
    },
    [profileId, settle],
  );

  /* ------------------------------------------------------------- retoques */

  /** Saca una foto de su ficha y la deja sola: eran dos sesiones distintas. */
  const split = (draftKey: string, photoKey: string) => {
    setDrafts((current) =>
      current.flatMap((draft) => {
        if (draft.key !== draftKey) return [draft];

        const gone = draft.photos.find((photo) => photo.key === photoKey);
        const rest = draft.photos.filter((photo) => photo.key !== photoKey);
        if (!gone || rest.length === 0) return [draft];

        // Las dos se recomponen desde sus fotos: la que se queda no puede
        // conservar una cifra que venía de la que se ha ido.
        return [draftOf(rest, true, draft.note, draft.key), draftOf([gone], true)];
      }),
    );
  };

  /** Une una ficha con la de arriba: sí eran la misma sesión. */
  const joinUp = (index: number) => {
    setDrafts((current) => {
      if (index < 1) return current;
      const above = current[index - 1];
      const mine = current[index];

      const joined = draftOf([...above.photos, ...mine.photos], true, above.note || mine.note, above.key);
      return current.filter((draft) => draft.key !== mine.key).map((draft) => (draft.key === above.key ? joined : draft));
    });
  };

  const remove = (draftKey: string) => {
    setDrafts((current) => {
      const gone = current.find((draft) => draft.key === draftKey);
      for (const photo of gone?.photos ?? []) {
        URL.revokeObjectURL(photo.preview);
        live.current = live.current.filter((url) => url !== photo.preview);
      }
      return current.filter((draft) => draft.key !== draftKey);
    });
  };

  /** Le pone el día de arriba a todas las fichas que no lo traían. */
  const applyFallback = () => {
    setDrafts((current) =>
      current.map((draft) => (draft.dated ? draft : { ...draft, date: fallback })),
    );
  };

  /* -------------------------------------------------------------- guardar */

  const ready = drafts.filter((draft) => countOf(draft) > 0);
  const undated = drafts.filter((draft) => !draft.dated).length;

  const save = () => {
    const used = new Set<string>();
    const now = new Date().toISOString();

    const sessions = ready.map((draft) => {
      const session: GpsSession = {
        id: '',
        profileId,
        date: draft.date,
        kind: draft.kind,
        note: draft.note.trim() || undefined,
        updatedAt: now,
      };

      for (const field of GPS_FIELDS) {
        const raw = (draft.numbers[field.id] ?? '').replace(',', '.').trim();
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
    setDrafts([]);
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
        Las que traigan el mismo día y el mismo tipo <strong>se juntan solas en una ficha</strong>,
        porque lo normal es fotografiar dos o tres pantallas del mismo entrenamiento. Antes de
        guardar nada se enseña lo que se ha entendido, y todo se puede corregir.
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

      {/* El día de las que no lo traen. Es lo que permite volcar un puñado de
          capturas viejas sin fecha sin tener que corregirlas una a una. */}
      {undated > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border p-3 hairline surf-1">
          <label className="text-xs font-semibold t-2">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">
              Día de las que no traen fecha
            </span>
            <input
              type="date"
              value={fallback}
              max={todayKey()}
              onChange={(event) => setFallback(event.target.value || todayKey())}
              className="field min-h-[2.75rem] p-2.5"
            />
          </label>
          <button type="button" onClick={applyFallback} className="btn-ghost px-3 py-2 text-xs">
            Ponérselo a {undated === 1 ? 'la que falta' : `las ${undated} que faltan`}
          </button>
        </div>
      )}

      {drafts.map((draft, index) => (
        <DraftCard
          key={draft.key}
          draft={draft}
          index={index}
          total={drafts.length}
          onChange={(change) => patch(draft.key, change)}
          onSplit={(photoKey) => split(draft.key, photoKey)}
          onJoinUp={() => joinUp(index)}
          onRemove={() => remove(draft.key)}
        />
      ))}

      {drafts.length > 0 && (
        <button
          type="button"
          onClick={save}
          disabled={ready.length === 0 || busy > 0}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
        >
          {ready.length > 1 ? `Guardar las ${ready.length} sesiones` : 'Guardar la sesión'}
        </button>
      )}
    </div>
  );
}

/** Cuántas cifras tiene puestas una ficha. */
function countOf(draft: Draft): number {
  return GPS_FIELDS.filter((field) => (draft.numbers[field.id] ?? '').trim() !== '').length;
}

/* ---------------------------------------------------------------------------
 * La ficha de una sesión
 * ------------------------------------------------------------------------- */

function DraftCard({
  draft,
  index,
  total,
  onChange,
  onSplit,
  onJoinUp,
  onRemove,
}: {
  draft: Draft;
  index: number;
  total: number;
  onChange: (change: Partial<Draft>) => void;
  onSplit: (photoKey: string) => void;
  onJoinUp: () => void;
  onRemove: () => void;
}) {
  const [raw, setRaw] = useState(false);
  const found = countOf(draft);
  const reading = draft.photos.some((photo) => photo.state === 'leyendo');
  const failed = draft.photos.filter((photo) => photo.state === 'error');
  const conflicts = Object.entries(draft.conflicts) as [GpsFieldId, string[]][];

  return (
    <div className="space-y-3 rounded-2xl border p-3 hairline surf-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wide t-3">
          Sesión {index + 1} de {total}
        </span>
        <span className="text-[11px] t-3">
          {draft.photos.length === 1 ? '1 foto' : `${draft.photos.length} fotos juntas`}
        </span>

        <span className="ml-auto flex gap-1">
          {index > 0 && (
            <button
              type="button"
              onClick={onJoinUp}
              className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
              title="Unirla con la sesión de arriba: son el mismo entrenamiento"
            >
              🔗 Unir con la de arriba
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
            aria-label={`Quitar la sesión ${index + 1}`}
          >
            🗑️
          </button>
        </span>
      </div>

      {/* Las fotos que la componen. */}
      <div className="flex flex-wrap gap-2">
        {draft.photos.map((photo) => (
          <div key={photo.key} className="relative">
            {/* Sin `next/image` a propósito: es una URL temporal del aparato. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.preview}
              alt={`Captura ${photo.fileName}`}
              className={`h-20 w-20 rounded-xl border object-cover hairline ${
                photo.state === 'leyendo' ? 'animate-pulse opacity-60' : ''
              }`}
            />
            {draft.photos.length > 1 && (
              <button
                type="button"
                onClick={() => onSplit(photo.key)}
                title="Separarla: era otra sesión"
                aria-label={`Separar la captura ${photo.fileName} en otra sesión`}
                className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center
                           rounded-full border text-[11px] hairline surf-1"
              >
                ✂️
              </button>
            )}
          </div>
        ))}
      </div>

      <div>
        {reading ? (
          <p className="text-xs font-semibold t-2">🔎 Leyendo la captura…</p>
        ) : (
          <p className="text-xs font-bold t-1">
            {found === 0
              ? '🤷 No se ha reconocido ninguna cifra'
              : `✓ ${found} ${found === 1 ? 'cifra' : 'cifras'} en la ficha`}
          </p>
        )}

        <p className="mt-0.5 text-[11px] leading-snug t-3">
          {draft.dated
            ? `Fecha de la propia captura: ${formatShort(draft.date)}.`
            : 'Ninguna captura traía fecha, así que se ha puesto la de hoy. Cámbiala si la sesión fue otro día.'}
        </p>

        {failed.length > 0 && (
          <p className="mt-1 text-[11px] leading-snug t-2">
            ⚠️ {failed.length === 1 ? 'Una captura no se ha podido leer' : `${failed.length} capturas no se han podido leer`}
            : {failed[0].error} Se puede rellenar a mano igualmente.
          </p>
        )}

        {conflicts.length > 0 && (
          <p className="mt-1 text-[11px] leading-snug t-2">
            ⚠️ Dos fotos no dicen lo mismo de{' '}
            {conflicts
              .map(([id, values]) => `${fieldOf(id).short.toLowerCase()} (${values.join(' y ')})`)
              .join(', ')}
            . Está puesta la primera; si no eran la misma sesión, sepáralas con ✂️.
          </p>
        )}

        {draft.dropped.length > 0 && (
          <p className="mt-1 text-[11px] leading-snug t-2">
            ⚠️ Fuera por imposible:{' '}
            {draft.dropped
              .map((item) => `${fieldOf(item.id).short.toLowerCase()} ${item.value}`)
              .join(', ')}
            . Mira la foto y escríbelo tú.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold t-2">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">Día</span>
          <input
            type="date"
            value={draft.date}
            max={todayKey()}
            onChange={(event) => onChange({ date: event.target.value || todayKey() })}
            className={`field min-h-[2.75rem] p-2.5 ${draft.dated ? '' : 'border-accent'}`}
          />
        </label>

        <div className="flex rounded-xl border p-0.5 hairline surf-1">
          {(['entreno', 'partido'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange({ kind: option })}
              aria-pressed={draft.kind === option}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors
                ${draft.kind === option ? 'bg-accent t-on-accent' : 't-3 hover-soft'}`}
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
              value={draft.numbers[field.id] ?? ''}
              onChange={(event) =>
                onChange({ numbers: { ...draft.numbers, [field.id]: event.target.value } })
              }
              placeholder="—"
              className="field min-h-[2.75rem] w-full p-2.5 tabular-nums"
            />
          </label>
        ))}
      </div>

      <label className="block text-xs font-semibold t-2">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide t-3">Nota</span>
        <input
          value={draft.note}
          onChange={(event) => onChange({ note: event.target.value })}
          maxLength={200}
          placeholder="Jugó de lateral, campo pesado…"
          className="field min-h-[2.75rem] w-full p-2.5"
        />
      </label>

      {draft.photos.some((photo) => photo.text) && (
        <div>
          <button
            type="button"
            onClick={() => setRaw((value) => !value)}
            className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
          >
            {raw ? 'Ocultar' : 'Ver'} lo que se ha leído en{' '}
            {draft.photos.length === 1 ? 'la foto' : 'las fotos'}
          </button>

          {raw && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border
                            p-2 font-mono text-[10px] leading-snug hairline surf-1 t-3">
              {draft.photos.map((photo) => `— ${photo.fileName}\n${photo.text}`).join('\n\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
