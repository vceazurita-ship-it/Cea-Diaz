'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildSeedDatabase } from '@/lib/seed';
import {
  clearDatabase,
  emptyDatabase,
  entryKey,
  loadDatabase,
  saveDatabase,
} from '@/lib/storage';
import type { DateKey, DayEntry, HabitDatabase, MetricValue, ProfileId } from '@/types';

/** Estado del guardado, para poder acusarlo en la interfaz. */
export type SaveStatus = 'idle' | 'saving' | 'saved';

export type EntryMap = Record<string, DayEntry>;

export interface HabitStore {
  /** `false` hasta que se leen los datos del navegador (evita desajustes de hidratación). */
  hydrated: boolean;
  entries: EntryMap;
  status: SaveStatus;
  getEntry: (profileId: ProfileId, date: DateKey) => DayEntry | undefined;
  getValue: (profileId: ProfileId, date: DateKey, metricId: string) => MetricValue | undefined;
  setValue: (
    profileId: ProfileId,
    date: DateKey,
    metricId: string,
    value: MetricValue | undefined,
  ) => void;
  setNote: (profileId: ProfileId, date: DateKey, note: string) => void;
  clearDay: (profileId: ProfileId, date: DateKey) => void;
  /** Copia los registros de un día en otro. Devuelve cuántos ha copiado. */
  copyDay: (profileId: ProfileId, from: DateKey, to: DateKey) => number;
  loadDemoData: () => void;
  resetAll: () => void;
  /** Sustituye o fusiona registros procedentes de un archivo exportado. */
  importEntries: (entries: EntryMap, mode: 'merge' | 'replace') => void;
  /** Copia del estado actual, para poder ofrecer «Deshacer» tras una acción destructiva. */
  snapshot: () => EntryMap;
  restore: (entries: EntryMap) => void;
}

/** Espera antes de escribir en localStorage: teclear una nota no debe serializar en cada tecla. */
const SAVE_DEBOUNCE_MS = 350;

export function useHabitStore(): HabitStore {
  const [db, setDb] = useState<HabitDatabase>(emptyDatabase);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');

  // Lectura inicial: sólo en cliente.
  useEffect(() => {
    setDb(loadDatabase());
    setHydrated(true);
  }, []);

  // Última versión pendiente de escribir, para poder volcarla si la pestaña
  // se cierra o se oculta antes de que venza el temporizador.
  const pending = useRef<HabitDatabase | null>(null);

  const flush = useCallback(() => {
    if (!pending.current) return;
    saveDatabase(pending.current);
    pending.current = null;
  }, []);

  // Escritura diferida: cada cambio se persiste poco después del último.
  useEffect(() => {
    if (!hydrated) return;

    pending.current = db;
    setStatus('saving');

    const timer = window.setTimeout(() => {
      flush();
      setStatus('saved');
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [db, hydrated, flush]);

  // Red de seguridad: al ocultar o cerrar la pestaña se vuelca lo pendiente.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  const getEntry = useCallback(
    (profileId: ProfileId, date: DateKey) => db.entries[entryKey(profileId, date)],
    [db],
  );

  const getValue = useCallback(
    (profileId: ProfileId, date: DateKey, metricId: string) =>
      db.entries[entryKey(profileId, date)]?.values[metricId],
    [db],
  );

  const setValue = useCallback(
    (
      profileId: ProfileId,
      date: DateKey,
      metricId: string,
      value: MetricValue | undefined,
    ) => {
      setDb((prev) => {
        const key = entryKey(profileId, date);
        const current = prev.entries[key];
        const values = { ...(current?.values ?? {}) };

        if (value === undefined) delete values[metricId];
        else values[metricId] = value;

        const next: DayEntry = {
          date,
          profileId,
          values,
          note: current?.note,
          updatedAt: new Date().toISOString(),
        };

        return { ...prev, entries: { ...prev.entries, [key]: next } };
      });
    },
    [],
  );

  const setNote = useCallback((profileId: ProfileId, date: DateKey, note: string) => {
    setDb((prev) => {
      const key = entryKey(profileId, date);
      const current = prev.entries[key];
      const next: DayEntry = {
        date,
        profileId,
        values: current?.values ?? {},
        note,
        updatedAt: new Date().toISOString(),
      };
      return { ...prev, entries: { ...prev.entries, [key]: next } };
    });
  }, []);

  const clearDay = useCallback((profileId: ProfileId, date: DateKey) => {
    setDb((prev) => {
      const entries = { ...prev.entries };
      delete entries[entryKey(profileId, date)];
      return { ...prev, entries };
    });
  }, []);

  /**
   * Copia los valores de un día en otro. No arrastra la nota: es propia del
   * día y repetirla induciría a error. Devuelve el número de métricas
   * copiadas para poder acusarlo en el aviso.
   */
  const copyDay = useCallback(
    (profileId: ProfileId, from: DateKey, to: DateKey) => {
      // El recuento se calcula sobre el estado actual y no dentro del
      // actualizador: React lo ejecuta en el render siguiente, así que allí
      // el valor todavía no estaría disponible para quien llama.
      const source = db.entries[entryKey(profileId, from)];
      const copied = source ? Object.keys(source.values).length : 0;
      if (copied === 0) return 0;

      setDb((prev) => {
        const origin = prev.entries[entryKey(profileId, from)];
        if (!origin) return prev;

        const targetKey = entryKey(profileId, to);
        const target = prev.entries[targetKey];

        const next: DayEntry = {
          date: to,
          profileId,
          // Lo ya registrado en el destino manda: copiar nunca pisa un dato.
          values: { ...origin.values, ...(target?.values ?? {}) },
          note: target?.note,
          updatedAt: new Date().toISOString(),
        };

        return { ...prev, entries: { ...prev.entries, [targetKey]: next } };
      });

      return copied;
    },
    [db],
  );

  const loadDemoData = useCallback(() => {
    setDb(buildSeedDatabase());
  }, []);

  const resetAll = useCallback(() => {
    clearDatabase();
    setDb(emptyDatabase());
  }, []);

  const importEntries = useCallback((entries: EntryMap, mode: 'merge' | 'replace') => {
    setDb((prev) => ({
      ...prev,
      entries: mode === 'replace' ? entries : { ...prev.entries, ...entries },
    }));
  }, []);

  const snapshot = useCallback(() => db.entries, [db]);

  const restore = useCallback((entries: EntryMap) => {
    setDb((prev) => ({ ...prev, entries }));
  }, []);

  return useMemo(
    () => ({
      hydrated,
      entries: db.entries,
      status,
      getEntry,
      getValue,
      setValue,
      setNote,
      clearDay,
      copyDay,
      loadDemoData,
      resetAll,
      importEntries,
      snapshot,
      restore,
    }),
    [
      hydrated,
      db.entries,
      status,
      getEntry,
      getValue,
      setValue,
      setNote,
      clearDay,
      copyDay,
      loadDemoData,
      resetAll,
      importEntries,
      snapshot,
      restore,
    ],
  );
}
