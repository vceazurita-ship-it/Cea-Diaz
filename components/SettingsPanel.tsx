'use client';

import { useEffect, useRef, useState } from 'react';
import { Photo } from '@/components/ui/Photo';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAppearance } from '@/hooks/useAppearance';
import type { EntryMap, HabitStore, TaskMap } from '@/hooks/useHabitStore';
import { useTheme } from '@/hooks/useTheme';
import { APP_OWNER } from '@/lib/appearance';
import { setSoundEnabled, soundEnabled } from '@/lib/sound';
import {
  DEFAULT_PIN,
  setPin as storePin,
  subscribeSettings,
  usesDefaultPin,
} from '@/lib/settings';
import type { DayEntry, Task, ThemePreference } from '@/types';

interface SettingsPanelProps {
  store: HabitStore;
  onClose: () => void;
}

/** Registros pendientes de confirmar tras elegir un archivo. */
interface StagedImport {
  entries: EntryMap;
  tasks: TaskMap;
  count: number;
  fileName: string;
}

/**
 * Los recados, con su fecha y su estado. El vínculo con Google Calendar no
 * viaja: el evento pertenece a una cuenta concreta y restaurar la copia en
 * otra casa dejaría tareas apuntando a citas de un calendario ajeno.
 */
function parseTasks(raw: unknown): TaskMap {
  const source = (raw as { tasks?: unknown })?.tasks;
  if (!source || typeof source !== 'object') return {};

  const tasks: TaskMap = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const item = value as Partial<Task>;
    if (!item || typeof item !== 'object') continue;
    if (typeof item.title !== 'string' || typeof item.profileId !== 'string') continue;

    const now = new Date().toISOString();

    tasks[key] = {
      id: typeof item.id === 'string' ? item.id : key,
      profileId: item.profileId as Task['profileId'],
      title: item.title,
      detail: typeof item.detail === 'string' ? item.detail : undefined,
      kind: typeof item.kind === 'string' ? (item.kind as Task['kind']) : 'otro',
      due: typeof item.due === 'string' ? item.due : undefined,
      time: typeof item.time === 'string' ? item.time : undefined,
      duration: typeof item.duration === 'number' ? item.duration : undefined,
      remindBefore: typeof item.remindBefore === 'number' ? item.remindBefore : undefined,
      repeat: typeof item.repeat === 'string' ? (item.repeat as Task['repeat']) : 'none',
      done: item.done === true,
      doneAt: typeof item.doneAt === 'string' ? item.doneAt : undefined,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    };
  }

  return tasks;
}

/**
 * Las notas por categoría de un registro. Se filtran una a una: el archivo
 * lo puede haber tocado cualquiera y aquí sólo entran pares de texto.
 */
function parseNotes(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const notes: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) notes[key] = value;
  }

  return Object.keys(notes).length > 0 ? notes : undefined;
}

/** Comprueba que lo leído del archivo tiene forma de registro antes de aceptarlo. */
function parseEntries(raw: unknown): EntryMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = (raw as { entries?: unknown }).entries;
  if (!source || typeof source !== 'object') return null;

  const entries: EntryMap = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const entry = value as Partial<DayEntry>;
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.date !== 'string' || typeof entry.profileId !== 'string') continue;
    if (!entry.values || typeof entry.values !== 'object') continue;

    entries[key] = {
      date: entry.date,
      profileId: entry.profileId,
      values: entry.values as DayEntry['values'],
      note: typeof entry.note === 'string' ? entry.note : undefined,
      notes: parseNotes(entry.notes),
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
    };
  }

  return Object.keys(entries).length > 0 ? entries : null;
}

export function SettingsPanel({ store, onClose }: SettingsPanelProps) {
  const [pin, setPin] = useState('');
  /** `true` mientras siga valiendo el de fábrica; sólo entonces se puede decir. */
  const [defaultPin, setDefaultPin] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [staged, setStaged] = useState<StagedImport | null>(null);
  /** Se lee tras montar: en el servidor no hay `localStorage` que consultar. */
  const [sound, setSound] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const notify = useToast();

  // Se leen tras montar y se siguen escuchando: pueden cambiarlos desde
  // otro aparato mientras esta pantalla está abierta.
  useEffect(() => {
    const read = () => {
      setSound(soundEnabled());
      setDefaultPin(usesDefaultPin());
    };

    read();
    return subscribeSettings(read);
  }, []);

  /* ---------------------------------------------------- aspecto de la app */

  const { preference, mode, setPreference } = useTheme();
  const { appCover, appCoverCustom, setPhoto, reset: resetSlot } = useAppearance();
  const coverInput = useRef<HTMLInputElement>(null);
  const [coverBusy, setCoverBusy] = useState(false);

  const MODES: Array<{ value: ThemePreference; label: string; icon: string }> = [
    { value: 'auto', label: 'Automático', icon: '📱' },
    { value: 'light', label: 'Día', icon: '☀️' },
    { value: 'dark', label: 'Noche', icon: '🌙' },
  ];

  const changeCover = async (file: File | undefined) => {
    if (!file) return;
    setCoverBusy(true);
    try {
      await setPhoto(APP_OWNER, 'cover', file);
      notify({ message: 'Portada actualizada.', icon: '🖼️' });
    } catch (error) {
      notify({
        message: error instanceof Error ? error.message : 'No se ha podido guardar la portada.',
        icon: '⚠️',
        tone: 'danger',
      });
    } finally {
      setCoverBusy(false);
      if (coverInput.current) coverInput.current.value = '';
    }
  };

  const restoreCover = async () => {
    setCoverBusy(true);
    try {
      await resetSlot(APP_OWNER, 'cover');
      notify({ message: 'Portada original restaurada.', icon: '↩️' });
    } finally {
      setCoverBusy(false);
    }
  };

  const entryCount = Object.keys(store.entries).length;

  /** Estado de la nube en una línea. */
  const cloudSummary = (() => {
    const when = store.cloud.lastSync
      ? new Date(store.cloud.lastSync).toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

    switch (store.cloud.status) {
      case 'signed-out':
        return 'Sin sesión: lo que se registre aquí sólo está en este móvil.';
      case 'syncing':
        return 'Sincronizando…';
      case 'synced':
        return `${store.cloud.email} · al día${when ? ` desde las ${when}` : ''}.`;
      case 'error':
        return 'La última sincronización falló. Los datos siguen guardados en el móvil.';
      default:
        return 'Sólo este navegador.';
    }
  })();

  const changePin = async () => {
    if (pin.length < 4) {
      notify({ message: 'El PIN debe tener al menos 4 dígitos.', icon: '⚠️', tone: 'danger' });
      return;
    }

    try {
      await storePin(pin);
      setPin('');
      notify({ message: 'PIN actualizado en todos los aparatos.', icon: '🔐' });
    } catch (error) {
      notify({
        message: error instanceof Error ? error.message : 'No se ha podido guardar el PIN.',
        icon: '⚠️',
        tone: 'danger',
      });
    }
  };

  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          // v5 añadió las notas por categoría, v6 los recados y v7 retiró el
          // análisis de fotos de comida y el consejo del día. Los archivos de
          // versiones anteriores se siguen leyendo: lo que ya no existe
          // simplemente se ignora.
          {
            version: 7,
            entries: store.entries,
            tasks: store.tasks,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `habitos-familia-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify({ message: 'Copia de seguridad descargada.', icon: '⬇️' });
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const entries = parseEntries(raw);
      if (!entries) {
        notify({
          message: 'El archivo no contiene registros reconocibles.',
          icon: '⚠️',
          tone: 'danger',
        });
        return;
      }
      setStaged({
        entries,
        tasks: parseTasks(raw),
        count: Object.keys(entries).length,
        fileName: file.name,
      });
    } catch {
      notify({ message: 'No se ha podido leer el archivo.', icon: '⚠️', tone: 'danger' });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const applyImport = (mode: 'merge' | 'replace') => {
    if (!staged) return;
    const before = store.snapshot();
    store.importEntries(
      { entries: staged.entries, tasks: staged.tasks },
      mode,
    );
    setStaged(null);
    notify({
      message: `${staged.count} ${staged.count === 1 ? 'día importado' : 'días importados'}.`,
      icon: '⬆️',
      action: { label: 'Deshacer', onClick: () => store.restore(before) },
    });
  };

  const loadDemo = () => {
    const before = store.snapshot();
    store.loadDemoData();
    notify({
      message: 'Datos de ejemplo cargados.',
      icon: '🎲',
      action: { label: 'Deshacer', onClick: () => store.restore(before) },
    });
  };

  const wipe = () => {
    const before = store.snapshot();
    store.resetAll();
    setConfirmReset(false);
    notify({
      message: 'Se han borrado todos los registros.',
      icon: '🗑️',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: () => store.restore(before) },
    });
  };

  return (
    <Modal title="⚙️ Ajustes" onClose={onClose} size="lg">
      <div className="space-y-4 text-sm">
        {/* ---------------------------------------------- aspecto de la app */}
        <section className="rounded-2xl border hairline surf-1 p-3">
          <h3 className="mb-1 font-bold t-1">Aspecto de la app</h3>
          <p className="mb-3 text-xs t-3">
            El modo vale para todos los perfiles y se queda en este dispositivo: la tableta de
            la cocina y el móvil de la mesilla pueden ir cada uno a lo suyo.
          </p>

          <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Modo de la app">
            {MODES.map((option) => {
              const active = preference === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPreference(option.value)}
                  aria-pressed={active}
                  className={`btn px-3 py-1.5 text-xs font-semibold border
                    ${active ? 'bg-accent-soft border-accent t-1' : 'hairline surf-1 t-2 hover-soft'}`}
                >
                  <span aria-hidden>{option.icon}</span>
                  {option.label}
                  {option.value === 'auto' && active && (
                    <span className="t-3">· ahora {mode === 'dark' ? 'noche' : 'día'}</span>
                  )}
                </button>
              );
            })}
          </div>

          <h4 className="mb-1 text-xs font-bold uppercase tracking-wide t-2">Portada</h4>
          <p className="mb-3 text-xs t-3">
            La foto grande de la pantalla de inicio. Con la cuenta de casa iniciada llega
            también al resto de móviles.
          </p>

          <div className="flex items-center gap-3">
            <span className="block h-14 w-24 shrink-0 overflow-hidden rounded-xl border hairline surf-2">
              <Photo src={appCover} alt="" width={192} height={112} className="h-full w-full object-cover" />
            </span>

            <div className="flex min-w-0 flex-wrap gap-2">
              <input
                ref={coverInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => void changeCover(event.target.files?.[0])}
              />
              <button
                type="button"
                disabled={coverBusy}
                onClick={() => coverInput.current?.click()}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                {coverBusy ? '⏳ Guardando…' : appCoverCustom ? '🖼️ Cambiar' : '🖼️ Elegir foto'}
              </button>

              {appCoverCustom && (
                <button
                  type="button"
                  disabled={coverBusy}
                  onClick={() => void restoreCover()}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  ↩️ Original
                </button>
              )}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- nube */}
        {store.cloud.configured && (
          <section className="rounded-2xl border hairline surf-1 p-3">
            <h3 className="mb-1 font-bold t-1">Nube</h3>
            <p className="mb-3 text-xs t-3">{cloudSummary}</p>

            <div className="flex flex-wrap gap-2">
              {store.cloud.status === 'signed-out' ? (
                <button
                  type="button"
                  onClick={() => store.setLocalOnly(false)}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  🔑 Entrar con la cuenta de casa
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void store.syncNow()}
                    disabled={store.cloud.status === 'syncing'}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    🔄 Sincronizar ahora
                  </button>
                  <button
                    type="button"
                    onClick={() => void store.signOut()}
                    className="btn-ghost px-3 py-1.5 text-xs t-3"
                  >
                    Cerrar sesión
                  </button>
                </>
              )}
            </div>

            {store.cloud.error && (
              <p className="mt-2 text-[11px] t-danger">⚠️ {store.cloud.error}</p>
            )}
          </section>
        )}

        {/* Sin nube no hay aviso por ninguna parte: la app se comporta como
            siempre y parece que todo va bien, pero lo registrado en un
            aparato no llega a los demás. Más vale decirlo. */}
        {!store.cloud.configured && (
          <section className="rounded-2xl border hairline surf-1 p-3">
            <h3 className="mb-1 font-bold t-1">Nube</h3>
            <p className="text-xs t-3">
              Esta versión de la app no tiene la nube configurada: lo que se registre aquí se
              queda sólo en este aparato y no se ve en el resto. Hay que definir{' '}
              <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{' '}
              y volver a desplegar, porque esas dos se incrustan al compilar.
            </p>
          </section>
        )}

        {/* ------------------------------------------------------ sonido */}
        <section className="rounded-2xl border hairline surf-1 p-3">
          <h3 className="mb-1 font-bold t-1">Sonido</h3>
          <p className="mb-3 text-xs t-3">
            Cada perfil puede tener su sintonía al entrar. Suena veinte segundos y se
            desvanece; se corta con el botón que aparece abajo a la derecha.
          </p>

          <button
            type="button"
            onClick={() => {
              const next = !sound;
              setSound(next);
              setSoundEnabled(next);
            }}
            aria-pressed={sound}
            className={`btn px-3 py-1.5 text-xs font-semibold border
              ${sound ? 'bg-accent-soft border-accent t-1' : 'hairline surf-2 t-2 hover-soft'}`}
          >
            {sound ? '🔊 Sintonías activadas' : '🔇 Sintonías silenciadas'}
          </button>
        </section>

        {/* ------------------------------------------------------- datos */}
        <section className="rounded-2xl border hairline surf-1 p-3">
          <h3 className="mb-1 font-bold t-1">Datos</h3>
          <p className="mb-3 text-xs t-3">
            {entryCount} {entryCount === 1 ? 'día registrado' : 'días registrados'} en este
            navegador.
          </p>

          {staged ? (
            <div className="rounded-xl border p-3 hairline surf-2">
              <p className="text-xs t-2">
                <span className="font-semibold t-1">{staged.fileName}</span> contiene{' '}
                {staged.count} {staged.count === 1 ? 'día' : 'días'}. ¿Cómo quieres aplicarlo?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => applyImport('merge')} className="btn-primary px-3 py-1.5 text-xs">
                  Fusionar con lo actual
                </button>
                <button type="button" onClick={() => applyImport('replace')} className="btn-ghost px-3 py-1.5 text-xs">
                  Reemplazar todo
                </button>
                <button type="button" onClick={() => setStaged(null)} className="btn-ghost px-3 py-1.5 text-xs t-3">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={loadDemo} className="btn-ghost px-3 py-1.5 text-xs">
                🎲 Datos de ejemplo
              </button>
              <button type="button" onClick={exportData} className="btn-ghost px-3 py-1.5 text-xs">
                ⬇️ Exportar
              </button>
              {/* Una copia de seguridad que no se puede restaurar no es una copia. */}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                ⬆️ Importar
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>
          )}
        </section>

        {/* --------------------------------------------------------- pin */}
        <section className="rounded-2xl border hairline surf-1 p-3">
          <h3 className="mb-1 font-bold t-1">PIN del módulo de pareja</h3>
          <p className="mb-3 text-xs t-3">
            Barrera de privacidad doméstica: los registros se guardan sin cifrar en este
            navegador. El PIN no: se guarda su huella, aquí y en la nube, así que vale en
            todos los aparatos y no se puede leer en ninguno.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              onKeyDown={(e) => e.key === 'Enter' && void changePin()}
              placeholder="Nuevo PIN (4-8 dígitos)"
              aria-label="Nuevo PIN"
              className="field flex-1"
            />
            <button
              type="button"
              onClick={() => void changePin()}
              disabled={pin.length < 4}
              className="btn-primary px-3"
            >
              Guardar
            </button>
          </div>
          <p className="mt-2 text-xs t-3">
            {defaultPin ? (
              <>
                Ahora mismo vale el de fábrica:{' '}
                <span className="font-mono font-bold t-2">{DEFAULT_PIN}</span>.
              </>
            ) : (
              'Hay uno puesto. No se puede enseñar, porque no se guarda el número: si se olvida, se pone otro aquí.'
            )}
          </p>
        </section>

        {/* ---------------------------------------------- zona peligrosa */}
        <section
          className="rounded-2xl border p-3"
          style={{ borderColor: 'var(--danger)', background: 'var(--danger-bg)' }}
        >
          <h3 className="t-danger mb-1 font-bold">Zona peligrosa</h3>
          <p className="mb-3 text-xs t-2">
            Borra todos los registros de todos los perfiles. Podrás deshacerlo mientras el aviso
            siga en pantalla.
          </p>
          {confirmReset ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={wipe} className="btn-danger px-3 py-1.5 text-xs">
                Sí, borrar todo
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="btn-ghost t-danger px-3 py-1.5 text-xs"
            >
              🗑️ Borrar todos los datos
            </button>
          )}
        </section>
      </div>
    </Modal>
  );
}
