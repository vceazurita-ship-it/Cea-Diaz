'use client';

import { useState } from 'react';
import type { HabitStore } from '@/hooks/useHabitStore';
import { loadPin, savePin } from '@/lib/storage';

interface SettingsPanelProps {
  store: HabitStore;
  onClose: () => void;
}

export function SettingsPanel({ store, onClose }: SettingsPanelProps) {
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const entryCount = Object.keys(store.entries).length;

  const changePin = () => {
    if (pin.length < 4) {
      setMessage('El PIN debe tener al menos 4 dígitos.');
      return;
    }
    savePin(pin);
    setPin('');
    setMessage('PIN actualizado.');
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
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Ajustes"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-floatUp rounded-3xl border hairline bg-[var(--bg-2)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">⚙️ Ajustes</h2>
          <button type="button" onClick={onClose} className="btn-ghost px-2.5 py-1.5" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <section className="rounded-2xl border hairline surf-1 p-3">
            <h3 className="mb-1 font-bold">Datos</h3>
            <p className="mb-3 text-xs t-3">
              {entryCount} {entryCount === 1 ? 'día registrado' : 'días registrados'} en este
              navegador.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={store.loadDemoData} className="btn-ghost">
                🎲 Cargar datos de ejemplo
              </button>
              <button type="button" onClick={exportData} className="btn-ghost">
                ⬇️ Exportar JSON
              </button>
            </div>
          </section>

          <section className="rounded-2xl border hairline surf-1 p-3">
            <h3 className="mb-1 font-bold">PIN del módulo de pareja</h3>
            <p className="mb-3 text-xs t-3">
              Barrera de privacidad doméstica: los datos se guardan sin cifrar en este navegador.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
                  setMessage(null);
                }}
                placeholder="Nuevo PIN"
                className="field flex-1"
              />
              <button type="button" onClick={changePin} className="btn-ghost">
                Guardar
              </button>
            </div>
            <p className="mt-2 text-xs t-3">
              PIN actual: <span className="font-mono">{loadPin()}</span>
            </p>
          </section>

          <section
            className="rounded-2xl border p-3"
            style={{ borderColor: 'var(--danger)', background: 'var(--danger-bg)' }}
          >
            <h3 className="t-danger mb-1 font-bold">Zona peligrosa</h3>
            <p className="mb-3 text-xs t-3">
              Borra todos los registros de todos los perfiles. No se puede deshacer.
            </p>
            {confirmReset ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    store.resetAll();
                    setConfirmReset(false);
                    setMessage('Todos los datos han sido borrados.');
                  }}
                  className="btn bg-rose-600 text-white hover:bg-rose-700"
                >
                  Sí, borrar todo
                </button>
                <button type="button" onClick={() => setConfirmReset(false)} className="btn-ghost">
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="btn-ghost t-danger"
              >
                🗑️ Borrar todos los datos
              </button>
            )}
          </section>

          {message && <p className="text-center text-xs font-semibold t-2">{message}</p>}
        </div>
      </div>
    </div>
  );
}
