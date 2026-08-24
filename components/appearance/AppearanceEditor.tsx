'use client';

import { useRef, useState } from 'react';

import { useAppearance } from '@/hooks/useAppearance';
import { photoMaxSide, slotKey, type PhotoSlot, type Slot } from '@/lib/appearance';
import { playAnthem, stopAnthem } from '@/lib/sound';
import { Modal } from '@/components/ui/Modal';
import { PhotoCropper } from '@/components/ui/PhotoCropper';
import { useToast } from '@/components/ui/Toast';
import type { Profile, ProfileKind } from '@/types';

interface AppearanceEditorProps {
  profile: Profile;
  onClose: () => void;
}

interface PhotoField {
  slot: PhotoSlot;
  label: string;
  hint: string;
  /**
   * Ancho ÷ alto del hueco en el que se pinta. Manda en dos sitios: en la
   * vista previa de aquí y en el marco con el que se elige el recorte, que
   * es lo que hace que lo elegido y lo que se ve luego coincidan.
   */
  ratio: number;
  round?: boolean;
}

/**
 * Qué es cada ranura, en cristiano y con la forma en que se pinta.
 *
 * La foto grande no se pinta igual en los tres tipos de perfil —columna
 * vertical en la cabecera de los peques y en la de los módulos compartidos,
 * cuadrada en la de los mayores—, así que su marco depende de quién sea.
 */
function photoFields(kind: ProfileKind): PhotoField[] {
  const fields: PhotoField[] = [
    {
      slot: 'photo',
      label: 'Retrato',
      hint: 'El redondel de la barra de perfiles y del selector.',
      ratio: 1,
      round: true,
    },
    {
      slot: 'hero',
      label: 'Foto grande',
      hint: 'La imagen a sangre de la cabecera del perfil.',
      ratio: kind === 'adult' ? 1 : 3 / 4,
    },
    {
      slot: 'cover',
      // No se llama «portada» para no confundirla con la de la app, que es la
      // foto grande de la pantalla de inicio y se cambia desde Ajustes.
      label: 'Banda de la tarjeta',
      hint: 'El fondo de la tarjeta de este perfil en el selector.',
      ratio: 3,
    },
  ];

  if (kind === 'kid') {
    fields.push({
      slot: 'card',
      label: 'Cromo',
      hint: 'Sólo para los peques: la figurita de la colección.',
      ratio: 3 / 4,
    });
  }

  return fields;
}

export function AppearanceEditor({ profile, onClose }: AppearanceEditorProps) {
  const { slots, dress, setPhoto, setAnthem, reset, syncing } = useAppearance();
  const notify = useToast();

  /** Ranura en la que se está trabajando ahora, para deshabilitarla mientras. */
  const [busy, setBusy] = useState<Slot | null>(null);
  const [preview, setPreview] = useState(false);
  /** Foto recién elegida, a la espera de que se decida qué trozo se ve. */
  const [framing, setFraming] = useState<{ field: PhotoField; file: File } | null>(null);

  const dressed = dress(profile);
  const fields = photoFields(profile.kind);

  const custom = (slot: Slot) => slots[slotKey(profile.id, slot)];

  const run = async (slot: Slot, work: () => Promise<void>, done: string) => {
    setBusy(slot);
    try {
      await work();
      notify({ message: done, icon: '✅' });
    } catch (error) {
      notify({
        message: error instanceof Error ? error.message : 'No se ha podido guardar.',
        icon: '⚠️',
        tone: 'danger',
      });
    } finally {
      setBusy(null);
    }
  };

  /** Escucha la sintonía tal y como sonará al entrar en el perfil. */
  const audition = () => {
    if (preview) {
      stopAnthem();
      setPreview(false);
      return;
    }
    if (!dressed.anthem) return;

    // La prueba usa una clave propia para saltarse el enfriamiento de dos
    // minutos: aquí el usuario pide oírla expresamente.
    const started = playAnthem(`prueba:${profile.id}:${Date.now()}`, dressed.anthem, () =>
      setPreview(false),
    );
    if (started) setPreview(true);
    else
      notify({
        message: 'El sonido está apagado en Ajustes.',
        icon: '🔇',
      });
  };

  return (
    <Modal title={`Personalizar ${profile.name}`} onClose={onClose} size="lg">
      <p className="mb-4 text-sm t-2">
        Cambia las fotos y la música de este perfil sin tocar el código. Con la cuenta de casa
        iniciada llegan también al resto de móviles; si no, se quedan en este. Siempre puedes
        volver a lo original.
      </p>

      {syncing && (
        <p className="mb-4 text-xs t-3" aria-live="polite">
          ☁️ Sincronizando con el resto de dispositivos…
        </p>
      )}

      {/* En el móvil, una ranura debajo de otra; en el portátil caben dos por
          fila y se ve todo el aspecto del perfil sin desplazarse. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <PhotoField
            key={field.slot}
            label={field.label}
            hint={field.hint}
            ratio={field.ratio}
            round={field.round}
            src={
              field.slot === 'photo'
                ? dressed.photo
                : field.slot === 'hero'
                  ? dressed.hero
                  : field.slot === 'cover'
                    ? dressed.cover
                    : dressed.card
            }
            customName={custom(field.slot)?.meta.name}
            synced={Boolean(custom(field.slot)?.meta.remotePath)}
            busy={busy === field.slot}
            // Antes de guardar se pasa por el marco: la foto se recorta donde
            // diga quien la sube, no por donde caiga el centro.
            onPick={(file) => setFraming({ field, file })}
            onReset={() =>
              run(field.slot, () => reset(profile.id, field.slot), `${field.label} restaurado.`)
            }
          />
        ))}

        {/* ------------------------------------------------------ sintonía */}
        <section className="rounded-2xl border p-3 hairline surf-1 sm:col-span-2">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold t-1">Sintonía</h3>
            {custom('anthem') && (
              <span className="chip-soft">
                {custom('anthem')?.meta.remotePath ? '☁️ En la nube' : 'Personalizada'}
              </span>
            )}
          </div>
          <p className="mb-3 text-xs t-3">
            Suena unos segundos al entrar en el perfil. Máximo 8 MB.
          </p>

          <p className="mb-3 truncate text-sm t-2">
            {dressed.anthem ? (
              <>🎵 {dressed.anthemLabel ?? 'Sintonía'}</>
            ) : (
              <span className="t-3">Sin música: al entrar no sonará nada.</span>
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            <FilePicker
              accept="audio/*"
              disabled={busy === 'anthem'}
              label={custom('anthem') ? '🎵 Cambiar' : '🎵 Elegir canción'}
              onPick={(file) =>
                run('anthem', () => setAnthem(profile.id, file), 'Sintonía actualizada.')
              }
            />

            {dressed.anthem && (
              <button type="button" onClick={audition} className="btn-ghost px-3 py-1.5 text-xs">
                {preview ? '⏹️ Parar' : '▶️ Escuchar'}
              </button>
            )}

            {custom('anthem') && (
              <button
                type="button"
                disabled={busy === 'anthem'}
                onClick={() => {
                  stopAnthem();
                  setPreview(false);
                  void run('anthem', () => reset(profile.id, 'anthem'), 'Sintonía restaurada.');
                }}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                ↩️ Volver a la original
              </button>
            )}
          </div>
        </section>
      </div>

      <button type="button" onClick={onClose} className="btn-primary mt-5 w-full">
        Listo
      </button>

      {framing && (
        <PhotoCropper
          file={framing.file}
          ratio={framing.field.ratio}
          round={framing.field.round}
          maxSide={photoMaxSide(framing.field.slot)}
          title={`${framing.field.label} de ${profile.name}`}
          hint={`${framing.field.hint} Lo que quede dentro del marco es lo que se verá.`}
          onCancel={() => setFraming(null)}
          onConfirm={(cropped) => {
            const { field } = framing;
            setFraming(null);
            void run(
              field.slot,
              () => setPhoto(profile.id, field.slot, cropped),
              `${field.label} actualizado.`,
            );
          }}
        />
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ piezas */

interface PhotoFieldProps {
  label: string;
  hint: string;
  /** Ancho ÷ alto del hueco: la vista previa se recorta igual que la app. */
  ratio: number;
  round?: boolean;
  src?: string;
  customName?: string;
  /** La ranura ya ha llegado a la nube y la verán el resto de móviles. */
  synced?: boolean;
  busy: boolean;
  onPick: (file: File) => void;
  onReset: () => void;
}

function PhotoField({
  label,
  hint,
  ratio,
  round,
  src,
  customName,
  synced,
  busy,
  onPick,
  onReset,
}: PhotoFieldProps) {
  return (
    <section className="rounded-2xl border p-3 hairline surf-1">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold t-1">{label}</h3>
        {customName && (
          <span className="chip-soft">{synced ? '☁️ En la nube' : 'Personalizada'}</span>
        )}
      </div>
      <p className="mb-3 text-xs t-3">{hint}</p>

      <div className="flex items-center gap-3">
        {/* La vista previa se recorta igual que en la app: lo que se ve aquí
            es lo que va a salir ahí. */}
        <span
          className={`block w-20 shrink-0 overflow-hidden border hairline surf-2
            ${round ? 'rounded-full' : 'rounded-xl'}`}
          style={{ aspectRatio: String(ratio) }}
        >
          {src ? (
            // Es un blob local o un archivo de `public/`: `next/image` no
            // aporta nada aquí y no sabe optimizar object URLs.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xl t-3" aria-hidden>
              🖼️
            </span>
          )}
        </span>

        <div className="flex min-w-0 flex-wrap gap-2">
          <FilePicker
            accept="image/*"
            disabled={busy}
            label={customName ? '📷 Cambiar' : '📷 Elegir foto'}
            onPick={onPick}
          />
          {customName && (
            <button
              type="button"
              disabled={busy}
              onClick={onReset}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              ↩️ Original
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

interface FilePickerProps {
  accept: string;
  label: string;
  disabled: boolean;
  onPick: (file: File) => void;
}

/** Botón que abre el selector de archivos: el `<input type="file">` es feo. */
function FilePicker({ accept, label, disabled, onPick }: FilePickerProps) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="btn-ghost px-3 py-1.5 text-xs"
      >
        {disabled ? '⏳ Guardando…' : label}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Se vacía para poder volver a elegir el mismo archivo si hace falta.
          event.target.value = '';
          if (file) onPick(file);
        }}
      />
    </>
  );
}
