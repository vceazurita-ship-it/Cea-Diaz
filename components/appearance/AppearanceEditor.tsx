'use client';

import { useRef, useState } from 'react';

import { useAppearance } from '@/hooks/useAppearance';
import { slotKey, type PhotoSlot, type Slot } from '@/lib/appearance';
import { playAnthem, stopAnthem } from '@/lib/sound';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { Profile } from '@/types';

interface AppearanceEditorProps {
  profile: Profile;
  onClose: () => void;
}

/** Qué es cada ranura, en cristiano y con la forma en que se pinta. */
const PHOTO_FIELDS: Array<{
  slot: PhotoSlot;
  label: string;
  hint: string;
  /** Proporción de la vista previa, para que se vea recortada como en la app. */
  aspect: string;
  round?: boolean;
}> = [
  {
    slot: 'photo',
    label: 'Retrato',
    hint: 'El redondel de la barra de perfiles y del selector.',
    aspect: '1 / 1',
    round: true,
  },
  {
    slot: 'hero',
    label: 'Foto grande',
    hint: 'La imagen a sangre de la cabecera del perfil.',
    aspect: '4 / 3',
  },
  {
    slot: 'cover',
    label: 'Portada',
    hint: 'El fondo de la tarjeta en el selector de perfiles.',
    aspect: '16 / 9',
  },
  {
    slot: 'card',
    label: 'Cromo',
    hint: 'Sólo para los peques: la figurita de la colección.',
    aspect: '3 / 4',
  },
];

export function AppearanceEditor({ profile, onClose }: AppearanceEditorProps) {
  const { slots, dress, setPhoto, setAnthem, reset, syncing } = useAppearance();
  const notify = useToast();

  /** Ranura en la que se está trabajando ahora, para deshabilitarla mientras. */
  const [busy, setBusy] = useState<Slot | null>(null);
  const [preview, setPreview] = useState(false);

  const dressed = dress(profile);
  const isKid = profile.kind === 'kid';
  const fields = PHOTO_FIELDS.filter((field) => field.slot !== 'card' || isKid);

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
    <Modal title={`Personalizar ${profile.name}`} onClose={onClose}>
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

      <div className="space-y-4">
        {fields.map((field) => (
          <PhotoField
            key={field.slot}
            label={field.label}
            hint={field.hint}
            aspect={field.aspect}
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
            onPick={(file) =>
              run(field.slot, () => setPhoto(profile.id, field.slot, file), `${field.label} actualizado.`)
            }
            onReset={() =>
              run(field.slot, () => reset(profile.id, field.slot), `${field.label} restaurado.`)
            }
          />
        ))}

        {/* ------------------------------------------------------ sintonía */}
        <section className="rounded-2xl border p-3 hairline surf-1">
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
    </Modal>
  );
}

/* ------------------------------------------------------------------ piezas */

interface PhotoFieldProps {
  label: string;
  hint: string;
  aspect: string;
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
  aspect,
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
          style={{ aspectRatio: aspect }}
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
