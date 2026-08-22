'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import {
  deleteRows,
  dirtyRows,
  mergeById,
  pullAll,
  pushAdvice,
  pushEntries,
  pushMeals,
  tombstonesByTable,
  versionIndex,
  type CloudTable,
} from '@/lib/cloud';
import { addDays } from '@/lib/dates';
import { buildSeedDatabase } from '@/lib/seed';
import { cloudConfigured, supabase } from '@/lib/supabase';
import {
  clearDatabase,
  emptyDatabase,
  entryKey,
  loadDatabase,
  saveDatabase,
} from '@/lib/storage';
import type {
  DateKey,
  DayAdvice,
  DayEntry,
  HabitDatabase,
  MealAnalysis,
  MetricValue,
  ProfileId,
} from '@/types';

/** Estado del guardado, para poder acusarlo en la interfaz. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type EntryMap = Record<string, DayEntry>;
export type MealMap = Record<string, MealAnalysis>;
export type AdviceMap = Record<string, DayAdvice>;

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
  /** Análisis de fotos de comida, por identificador. */
  meals: MealMap;
  /** Comidas de un perfil en un día, de la más antigua a la más reciente. */
  getMeals: (profileId: ProfileId, date: DateKey) => MealAnalysis[];
  addMeal: (meal: MealAnalysis) => void;
  removeMeal: (id: string) => void;
  /** Consejos del día, por clave `${profileId}:${date}`. */
  advice: AdviceMap;
  getAdvice: (profileId: ProfileId, date: DateKey) => DayAdvice | undefined;
  setAdvice: (advice: DayAdvice) => void;
  removeAdvice: (id: string) => void;
  /**
   * Reto de progresión aún sin cumplir, de los días anteriores a `date`.
   * Es lo que convierte «lo de hoy» en «un punto más la próxima vez».
   */
  pendingChallenge: (profileId: ProfileId, date: DateKey) => DayAdvice | undefined;
  markChallengeDone: (id: string, done: boolean) => void;
  loadDemoData: () => void;
  resetAll: () => void;
  /** Sustituye o fusiona lo que venga de un archivo exportado. */
  importEntries: (
    data: { entries: EntryMap; meals?: MealMap; advice?: AdviceMap },
    mode: 'merge' | 'replace',
  ) => void;
  /** Copia del estado actual, para poder ofrecer «Deshacer» tras una acción destructiva. */
  snapshot: () => StoreSnapshot;
  restore: (snapshot: StoreSnapshot) => void;
  /* -------------------------------- nube -------------------------------- */
  cloud: CloudState;
  /** `true` si en este móvil se ha decidido trabajar sin nube. */
  localOnly: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Fuerza una sincronización completa. */
  syncNow: () => Promise<void>;
  /** Deja de pedir la cuenta en este móvil (o vuelve a pedirla). */
  setLocalOnly: (value: boolean) => void;
}

/** Lo que hace falta para dejar la base como estaba. */
export interface StoreSnapshot {
  entries: EntryMap;
  meals: MealMap;
  advice: AdviceMap;
}

/* --------------------------------- Nube --------------------------------- */

/**
 *  - `off`         no hay Supabase configurado: sólo este navegador.
 *  - `signed-out`  hay nube, pero nadie ha entrado todavía.
 *  - `syncing`     bajando y subiendo.
 *  - `synced`      al día.
 *  - `error`       la última sincronización falló; lo local sigue intacto.
 */
export type CloudStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'error';

export interface CloudState {
  configured: boolean;
  status: CloudStatus;
  /** Cuenta con la que se ha entrado en este móvil. */
  email: string | null;
  lastSync: string | null;
  error: string | null;
}

/** Clave que recuerda que en este móvil se ha elegido trabajar sin nube. */
const LOCAL_ONLY_KEY = 'habitos-familia:solo-local';

/** Espera mínima entre sincronizaciones automáticas al volver a la app. */
const SYNC_THROTTLE_MS = 30_000;

/** Anota un borrado para que la nube lo repita en la próxima subida. */
function grave(
  tombstones: Record<string, string>,
  table: CloudTable,
  id: string,
): Record<string, string> {
  return { ...tombstones, [`${table}:${id}`]: new Date().toISOString() };
}

/** Quita sólo las lápidas ya propagadas; las nuevas siguen esperando su turno. */
function forget(
  tombstones: Record<string, string>,
  propagated: string[],
): Record<string, string> {
  if (propagated.length === 0) return tombstones;
  const rest = { ...tombstones };
  for (const key of propagated) delete rest[key];
  return rest;
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

  /* ----------------------------------------------------------- nube */

  const [session, setSession] = useState<Session | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(
    cloudConfigured ? 'signed-out' : 'off',
  );
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [localOnly, setLocalOnlyState] = useState(false);

  // Espejo del estado para poder sincronizar sin re-crear los callbacks en
  // cada tecla: `db` cambia constantemente, la sesión casi nunca.
  const dbRef = useRef(db);
  dbRef.current = db;

  /** Versión ya subida de cada fila: `id → updatedAt`, por tabla. */
  const synced = useRef<Record<CloudTable, Record<string, string>>>({
    entries: {},
    meals: {},
    advice: {},
  });

  const lastSyncAt = useRef(0);

  useEffect(() => {
    setLocalOnlyState(window.localStorage.getItem(LOCAL_ONLY_KEY) === '1');
  }, []);

  // Sesión: se recupera la guardada y se escuchan los cambios.
  useEffect(() => {
    const client = supabase();
    if (!client) return;

    client.auth.getSession().then(({ data }) => setSession(data.session));

    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  /* ------------------------------------------- subida y bajada */

  /**
   * Sincronización completa: propaga borrados, baja lo que hayan escrito los
   * demás móviles, mezcla por fecha de edición y sube lo que aquí es nuevo.
   */
  const syncNow = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) return;

    setCloudStatus('syncing');
    setCloudError(null);

    try {
      const current = dbRef.current;

      // 1. Lo borrado aquí deja de existir también allí.
      const propagated = Object.keys(current.tombstones);
      const graves = tombstonesByTable(current.tombstones);
      for (const table of Object.keys(graves) as CloudTable[]) {
        await deleteRows(table, graves[table]);
      }

      // 2. Lo de todos, mezclado con lo de aquí.
      const remote = await pullAll();
      const merged: HabitDatabase = {
        ...current,
        entries: mergeById('entries', current.entries, remote.entries, current.tombstones),
        meals: mergeById('meals', current.meals, remote.meals, current.tombstones),
        advice: mergeById('advice', current.advice, remote.advice, current.tombstones),
        tombstones: {},
      };

      // 3. Y de vuelta lo que allí no está o está más viejo.
      const remoteIndex = {
        entries: versionIndex(remote.entries),
        meals: versionIndex(remote.meals),
        advice: versionIndex(remote.advice),
      };

      await pushEntries(dirtyRows(merged.entries, remoteIndex.entries), uid);
      await pushMeals(dirtyRows(merged.meals, remoteIndex.meals), uid);
      await pushAdvice(dirtyRows(merged.advice, remoteIndex.advice), uid);

      synced.current = {
        entries: versionIndex(merged.entries),
        meals: versionIndex(merged.meals),
        advice: versionIndex(merged.advice),
      };

      // La mezcla se rehace contra el estado de este instante, no contra la
      // foto de hace unos segundos: si alguien ha escrito mientras bajaba,
      // lo suyo es más reciente y debe ganar.
      setDb((prev) => ({
        ...prev,
        entries: mergeById('entries', prev.entries, remote.entries, prev.tombstones),
        meals: mergeById('meals', prev.meals, remote.meals, prev.tombstones),
        advice: mergeById('advice', prev.advice, remote.advice, prev.tombstones),
        tombstones: forget(prev.tombstones, propagated),
      }));

      setLastSync(new Date().toISOString());
      setCloudStatus('synced');
      lastSyncAt.current = Date.now();
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'No se ha podido sincronizar.');
      setCloudStatus('error');
    }
  }, [session]);

  /** Empujón incremental: sólo lo tocado desde la última subida. */
  const pushLocalChanges = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) return;

    const current = dbRef.current;
    const propagated = Object.keys(current.tombstones);
    const graves = tombstonesByTable(current.tombstones);
    const pendingGraves = propagated.length > 0;

    const changed = {
      entries: dirtyRows(current.entries, synced.current.entries),
      meals: dirtyRows(current.meals, synced.current.meals),
      advice: dirtyRows(current.advice, synced.current.advice),
    };

    if (!pendingGraves && !Object.values(changed).some((rows) => rows.length > 0)) return;

    try {
      for (const table of Object.keys(graves) as CloudTable[]) {
        await deleteRows(table, graves[table]);
      }

      await pushEntries(changed.entries, uid);
      await pushMeals(changed.meals, uid);
      await pushAdvice(changed.advice, uid);

      for (const row of changed.entries) {
        synced.current.entries[entryKey(row.profileId, row.date)] = row.updatedAt;
      }
      for (const row of changed.meals) synced.current.meals[row.id] = row.updatedAt;
      for (const row of changed.advice) synced.current.advice[row.id] = row.updatedAt;

      if (pendingGraves) {
        setDb((prev) => ({ ...prev, tombstones: forget(prev.tombstones, propagated) }));
      }

      setLastSync(new Date().toISOString());
      setCloudStatus('synced');
    } catch (error) {
      // Se reintenta en la siguiente sincronización: lo local no se toca.
      setCloudError(error instanceof Error ? error.message : 'No se ha podido guardar en la nube.');
      setCloudStatus('error');
    }
  }, [session]);

  // Primera sincronización al entrar, y luego al volver a la app.
  useEffect(() => {
    if (!hydrated || !session) return;
    void syncNow();
  }, [hydrated, session, syncNow]);

  useEffect(() => {
    if (!session) return;

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSyncAt.current < SYNC_THROTTLE_MS) return;
      void syncNow();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [session, syncNow]);

  /* ------------------------------------------------ sesión */

  const signIn = useCallback(async (email: string, password: string) => {
    const client = supabase();
    if (!client) throw new Error('La nube no está configurada.');

    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const client = supabase();
    if (!client) throw new Error('La nube no está configurada.');

    const { error } = await client.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    const client = supabase();
    if (!client) return;

    await client.auth.signOut();
    // Se olvida lo sincronizado, no lo guardado: los datos siguen en el móvil.
    synced.current = { entries: {}, meals: {}, advice: {} };
    setCloudStatus('signed-out');
  }, []);

  const setLocalOnly = useCallback((value: boolean) => {
    if (value) window.localStorage.setItem(LOCAL_ONLY_KEY, '1');
    else window.localStorage.removeItem(LOCAL_ONLY_KEY);
    setLocalOnlyState(value);
  }, []);

  // Última versión pendiente de escribir, para poder volcarla si la pestaña
  // se cierra o se oculta antes de que venza el temporizador.
  const pending = useRef<HabitDatabase | null>(null);

  // Guardar puede fallar de verdad (cuota llena, modo privado). Se refleja en
  // `status` para que la interfaz pueda decirlo en vez de fingir que fue bien.
  const flush = useCallback(() => {
    if (!pending.current) return true;
    const saved = saveDatabase(pending.current);
    pending.current = null;
    setStatus(saved ? 'saved' : 'error');
    return saved;
  }, []);

  // Escritura diferida: cada cambio se persiste poco después del último.
  useEffect(() => {
    if (!hydrated) return;

    pending.current = db;
    setStatus('saving');

    const timer = window.setTimeout(() => {
      // Guardado en el móvil; la nube va detrás y nunca bloquea la escritura.
      if (flush()) void pushLocalChanges();
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [db, hydrated, flush, pushLocalChanges]);

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
      const key = entryKey(profileId, date);
      const entries = { ...prev.entries };
      delete entries[key];
      return { ...prev, entries, tombstones: grave(prev.tombstones, 'entries', key) };
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

  /* ------------------------------------------------------ comidas */

  const getMeals = useCallback(
    (profileId: ProfileId, date: DateKey) =>
      Object.values(db.meals)
        .filter((meal) => meal.profileId === profileId && meal.date === date)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [db],
  );

  const addMeal = useCallback((meal: MealAnalysis) => {
    setDb((prev) => ({ ...prev, meals: { ...prev.meals, [meal.id]: meal } }));
  }, []);

  const removeMeal = useCallback((id: string) => {
    setDb((prev) => {
      const meals = { ...prev.meals };
      delete meals[id];
      return { ...prev, meals, tombstones: grave(prev.tombstones, 'meals', id) };
    });
  }, []);

  /* ------------------------------------------------------ consejos */

  const getAdvice = useCallback(
    (profileId: ProfileId, date: DateKey) => db.advice[entryKey(profileId, date)],
    [db],
  );

  const setAdvice = useCallback((advice: DayAdvice) => {
    setDb((prev) => ({ ...prev, advice: { ...prev.advice, [advice.id]: advice } }));
  }, []);

  const removeAdvice = useCallback((id: string) => {
    setDb((prev) => {
      const advice = { ...prev.advice };
      delete advice[id];
      return { ...prev, advice, tombstones: grave(prev.tombstones, 'advice', id) };
    });
  }, []);

  /** El reto vivo más reciente: sólo se mira una quincena hacia atrás. */
  const pendingChallenge = useCallback(
    (profileId: ProfileId, date: DateKey) => {
      const floor = addDays(date, -15);

      return Object.values(db.advice)
        .filter(
          (advice) =>
            advice.profileId === profileId &&
            advice.reto !== undefined &&
            !advice.retoCumplido &&
            advice.date < date &&
            advice.date >= floor,
        )
        .sort((a, b) => b.date.localeCompare(a.date))[0];
    },
    [db],
  );

  const markChallengeDone = useCallback((id: string, done: boolean) => {
    setDb((prev) => {
      const advice = prev.advice[id];
      if (!advice) return prev;
      const next = { ...advice, retoCumplido: done, updatedAt: new Date().toISOString() };
      return { ...prev, advice: { ...prev.advice, [id]: next } };
    });
  }, []);

  const loadDemoData = useCallback(() => {
    // Los datos de ejemplo no traen comidas ni consejos: son de cada casa.
    setDb((prev) => ({ ...buildSeedDatabase(), meals: prev.meals, advice: prev.advice }));
  }, []);

  const resetAll = useCallback(() => {
    clearDatabase();
    setDb((prev) => {
      let tombstones = prev.tombstones;
      for (const id of Object.keys(prev.entries)) tombstones = grave(tombstones, 'entries', id);
      for (const id of Object.keys(prev.meals)) tombstones = grave(tombstones, 'meals', id);
      for (const id of Object.keys(prev.advice)) tombstones = grave(tombstones, 'advice', id);
      return { ...emptyDatabase(), tombstones };
    });
  }, []);

  const importEntries = useCallback(
    (data: { entries: EntryMap; meals?: MealMap; advice?: AdviceMap }, mode: 'merge' | 'replace') => {
      const meals = data.meals ?? {};
      const advice = data.advice ?? {};
      setDb((prev) => ({
        ...prev,
        entries: mode === 'replace' ? data.entries : { ...prev.entries, ...data.entries },
        meals: mode === 'replace' ? meals : { ...prev.meals, ...meals },
        advice: mode === 'replace' ? advice : { ...prev.advice, ...advice },
      }));
    },
    [],
  );

  const snapshot = useCallback(
    () => ({ entries: db.entries, meals: db.meals, advice: db.advice }),
    [db],
  );

  const restore = useCallback((state: StoreSnapshot) => {
    setDb((prev) => {
      // Deshacer un borrado también deshace su lápida, y se olvida su versión
      // subida para que la fila vuelva a viajar a la nube.
      const tombstones = { ...prev.tombstones };
      const revive = (table: CloudTable, ids: string[]) => {
        for (const id of ids) {
          delete tombstones[`${table}:${id}`];
          delete synced.current[table][id];
        }
      };

      revive('entries', Object.keys(state.entries));
      revive('meals', Object.keys(state.meals));
      revive('advice', Object.keys(state.advice));

      return {
        ...prev,
        entries: state.entries,
        meals: state.meals,
        advice: state.advice,
        tombstones,
      };
    });
  }, []);

  return useMemo(
    () => ({
      hydrated,
      entries: db.entries,
      meals: db.meals,
      advice: db.advice,
      status,
      getEntry,
      getValue,
      setValue,
      setNote,
      clearDay,
      copyDay,
      getMeals,
      addMeal,
      removeMeal,
      getAdvice,
      setAdvice,
      removeAdvice,
      pendingChallenge,
      markChallengeDone,
      loadDemoData,
      resetAll,
      importEntries,
      snapshot,
      restore,
      cloud: {
        configured: cloudConfigured,
        status: cloudStatus,
        email: session?.user.email ?? null,
        lastSync,
        error: cloudError,
      },
      localOnly,
      signIn,
      signUp,
      signOut,
      syncNow,
      setLocalOnly,
    }),
    [
      hydrated,
      db.entries,
      db.meals,
      db.advice,
      status,
      getEntry,
      getValue,
      setValue,
      setNote,
      clearDay,
      copyDay,
      getMeals,
      addMeal,
      removeMeal,
      getAdvice,
      setAdvice,
      removeAdvice,
      pendingChallenge,
      markChallengeDone,
      loadDemoData,
      resetAll,
      importEntries,
      snapshot,
      restore,
      cloudStatus,
      cloudError,
      lastSync,
      localOnly,
      session,
      signIn,
      signUp,
      signOut,
      syncNow,
      setLocalOnly,
    ],
  );
}
