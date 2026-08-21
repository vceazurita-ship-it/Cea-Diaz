'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildSeedDatabase } from '@/lib/seed';
import {
  clearDatabase,
  emptyDatabase,
  entryKey,
  loadDatabase,
  saveDatabase,
} from '@/lib/storage';
import type { DateKey, DayEntry, HabitDatabase, MetricValue, ProfileId } from '@/types';

export interface HabitStore {
  /** `false` hasta que se leen los datos del navegador (evita desajustes de hidratación). */
  hydrated: boolean;
  entries: Record<string, DayEntry>;
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
  loadDemoData: () => void;
  resetAll: () => void;
}

export function useHabitStore(): HabitStore {
  const [db, setDb] = useState<HabitDatabase>(emptyDatabase);
  const [hydrated, setHydrated] = useState(false);

  // Lectura inicial: sólo en cliente.
  useEffect(() => {
    setDb(loadDatabase());
    setHydrated(true);
  }, []);

  // Escritura: cada cambio se persiste una vez hidratados.
  useEffect(() => {
    if (!hydrated) return;
    saveDatabase(db);
  }, [db, hydrated]);

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

  const loadDemoData = useCallback(() => {
    setDb(buildSeedDatabase());
  }, []);

  const resetAll = useCallback(() => {
    clearDatabase();
    setDb(emptyDatabase());
  }, []);

  return useMemo(
    () => ({
      hydrated,
      entries: db.entries,
      getEntry,
      getValue,
      setValue,
      setNote,
      clearDay,
      loadDemoData,
      resetAll,
    }),
    [hydrated, db.entries, getEntry, getValue, setValue, setNote, clearDay, loadDemoData, resetAll],
  );
}
