'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { AdviceMap, EntryMap, HabitStore, MealMap } from '@/hooks/useHabitStore';
import { setSoundEnabled, soundEnabled } from '@/lib/sound';
import { loadPin, savePin } from '@/lib/storage';
import type { DayAdvice, DayEntry, MealAnalysis } from '@/types';

interface SettingsPanelProps {
  store: HabitStore;
  onClose: () => void;
}

/** Registros pendientes de confirmar tras elegir un archivo. */
interface StagedImport {
  entries: EntryMap;
  meals: MealMap;
  advice: AdviceMap;
  count: number;
  fileName: string;
}

/**
 * Las comidas analizadas viajan en la copia igual que los registros. Las
 * miniaturas no: viven en IndexedDB, en el dispositivo, así que al importar
 * en otro móvil se conservan la nota y los consejos, pero no la foto.
 */
function parseMeals(raw: unknown): MealMap {
  const source = (raw as { meals?: unknown })?.meals;
  if (!source || typeof source !== 'object') return {};

  const meals: MealMap = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const meal = value as Partial<MealAnalysis>;
    if (!meal || typeof meal !== 'object') continue;
    if (typeof meal.date !== 'string' || typeof meal.profileId !== 'string') continue;
    if (typeof meal.nota !== 'number' || typeof meal.moment !== 'string') continue;

    meals[key] = {
      esComida: true,
      nota: meal.nota,
      titulo: typeof meal.titulo === 'string' ? meal.titulo : 'Plato',
      resumen: typeof meal.resumen === 'string' ? meal.resumen : '',
      alimentos: Array.isArray(meal.alimentos) ? meal.alimentos : [],
      aciertos: Array.isArray(meal.aciertos) ? meal.aciertos : [],
      ajustes: Array.isArray(meal.ajustes) ? meal.ajustes : [],
      id: typeof meal.id === 'string' ? meal.id : key,
      profileId: meal.profileId as MealAnalysis['profileId'],
      date: meal.date,
      moment: meal.moment as MealAnalysis['moment'],
      photoId: typeof meal.photoId === 'string' ? meal.photoId : undefined,
      createdAt:
        typeof meal.createdAt === 'string' ? meal.createdAt : new Date().toISOString(),
      updatedAt:
        typeof meal.updatedAt === 'string'
          ? meal.updatedAt
          : typeof meal.createdAt === 'string'
            ? meal.createdAt
            : new Date().toISOString(),
    };
  }

  return meals;
}

/** Los consejos viajan igual: son texto y pesan poco. */
function parseAdvice(raw: unknown): AdviceMap {
  const source = (raw as { advice?: unknown })?.advice;
  if (!source || typeof source !== 'object') return {};

  const advice: AdviceMap = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const item = value as Partial<DayAdvice>;
    if (!item || typeof item !== 'object') continue;
    if (typeof item.date !== 'string' || typeof item.profileId !== 'string') continue;
    if (!Array.isArray(item.consejos)) continue;

    advice[key] = {
      id: typeof item.id === 'string' ? item.id : key,
      profileId: item.profileId as DayAdvice['profileId'],
      date: item.date,
      resumen: typeof item.resumen === 'string' ? item.resumen : '',
      consejos: item.consejos,
      reto: item.reto,
      retoCumplido: item.retoCumplido === true,
      observaciones: typeof item.observaciones === 'string' ? item.observaciones : '',
      createdAt:
        typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      updatedAt:
        typeof item.updatedAt === 'string'
          ? item.updatedAt
          : typeof item.createdAt === 'string'
            ? item.createdAt
            : new Date().toISOString(),
    };
  }

  return advice;
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
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
    };
  }

  return Object.keys(entries).length > 0 ? entries : null;
}

export function SettingsPanel({ store, onClose }: SettingsPanelProps) {
  const [pin, setPin] = useState('');
  const [pinVisible, setPinVisible] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [staged, setStaged] = useState<StagedImport | null>(null);
  /** Se lee tras montar: en el servidor no hay `localStorage` que consultar. */
  const [sound, setSound] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const notify = useToast();

  useEffect(() => setSound(soundEnabled()), []);

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

  const changePin = () => {
    if (pin.length < 4) {
      notify({ message: 'El PIN debe tener al menos 4 dígitos.', icon: '⚠️', tone: 'danger' });
      return;
    }
    savePin(pin);
    setPin('');
    notify({ message: 'PIN actualizado.', icon: '🔐' });
  };

  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { version: 4, entries: store.entries, meals: store.meals, advice: store.advice },
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
        meals: parseMeals(raw),
        advice: parseAdvice(raw),
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
      { entries: staged.entries, meals: staged.meals, advice: staged.advice },
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
    <Modal title="⚙️ Ajustes" onClose={onClose}>
      <div className="space-y-4 text-sm">
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
            Barrera de privacidad doméstica: los datos se guardan sin cifrar en este navegador.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              onKeyDown={(e) => e.key === 'Enter' && changePin()}
              placeholder="Nuevo PIN (4-8 dígitos)"
              aria-label="Nuevo PIN"
              className="field flex-1"
            />
            <button
              type="button"
              onClick={changePin}
              disabled={pin.length < 4}
              className="btn-primary px-3"
            >
              Guardar
            </button>
          </div>
          <p className="mt-2 flex items-center gap-2 text-xs t-3">
            PIN actual:{' '}
            <span className="font-mono font-bold t-2">
              {pinVisible ? loadPin() : '•'.repeat(loadPin().length)}
            </span>
            <button
              type="button"
              onClick={() => setPinVisible((v) => !v)}
              className="rounded-lg px-2 py-1 text-xs t-3 transition-colors hover:t-1"
              aria-label={pinVisible ? 'Ocultar el PIN' : 'Mostrar el PIN'}
            >
              {pinVisible ? '🙈' : '👁️'}
            </button>
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
