'use client';

import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { EntryMap, HabitStore } from '@/hooks/useHabitStore';
import { loadPin, savePin } from '@/lib/storage';
import type { DayEntry } from '@/types';

interface SettingsPanelProps {
  store: HabitStore;
  onClose: () => void;
}

/** Registros pendientes de confirmar tras elegir un archivo. */
interface StagedImport {
  entries: EntryMap;
  count: number;
  fileName: string;
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
  const fileInput = useRef<HTMLInputElement>(null);
  const notify = useToast();

  const entryCount = Object.keys(store.entries).length;

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
    const blob = new Blob([JSON.stringify({ version: 1, entries: store.entries }, null, 2)], {
      type: 'application/json',
    });
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
      const entries = parseEntries(JSON.parse(await file.text()));
      if (!entries) {
        notify({
          message: 'El archivo no contiene registros reconocibles.',
          icon: '⚠️',
          tone: 'danger',
        });
        return;
      }
      setStaged({ entries, count: Object.keys(entries).length, fileName: file.name });
    } catch {
      notify({ message: 'No se ha podido leer el archivo.', icon: '⚠️', tone: 'danger' });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const applyImport = (mode: 'merge' | 'replace') => {
    if (!staged) return;
    const before = store.snapshot();
    store.importEntries(staged.entries, mode);
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
