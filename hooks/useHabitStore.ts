'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimePostgresChangesPayload, Session } from '@supabase/supabase-js';

import {
  deleteRows,
  dirtyRows,
  mergeById,
  pullAll,
  pullLineups,
  pullPlans,
  pullSettings,
  pushEntries,
  pushLineup,
  pushPlan,
  pushSettings,
  pushTasks,
  tombstonesByTable,
  versionIndex,
  type CloudTable,
} from '@/lib/cloud';
import { GAME_NOTE_KEY } from '@/lib/games';
import {
  applyRemoteLineups,
  loadLineups,
  subscribeLineups,
} from '@/lib/lineup';
import { applyRemotePlans, loadPlans, subscribePlans } from '@/lib/planner';
import { buildSeedDatabase } from '@/lib/seed';
import {
  applyRemoteSettings,
  loadSettings,
  migrateLegacyPin,
  subscribeSettings,
} from '@/lib/settings';
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
  DayEntry,
  HabitDatabase,
  MetricValue,
  NoteKey,
  ProfileId,
  Task,
} from '@/types';

/** Estado del guardado, para poder acusarlo en la interfaz. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type EntryMap = Record<string, DayEntry>;
export type TaskMap = Record<string, Task>;

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
  /** Nota suelta del día: una por categoría, más la del panel de retos. */
  getEntryNote: (profileId: ProfileId, date: DateKey, key: NoteKey) => string;
  setEntryNote: (profileId: ProfileId, date: DateKey, key: NoteKey, text: string) => void;
  clearDay: (profileId: ProfileId, date: DateKey) => void;
  /** Copia los registros de un día en otro. Devuelve cuántos ha copiado. */
  copyDay: (profileId: ProfileId, from: DateKey, to: DateKey) => number;
  /* ------------------------------- tareas ------------------------------- */
  /** Recados y citas, por identificador. */
  tasks: TaskMap;
  /** Las de un perfil, sin ordenar: de eso se encarga `lib/tasks.ts`. */
  getTasks: (profileId: ProfileId) => Task[];
  /** Alta o modificación: la fila entra tal cual, con su `updatedAt`. */
  saveTask: (task: Task) => void;
  removeTask: (id: string) => void;
  loadDemoData: () => void;
  resetAll: () => void;
  /** Sustituye o fusiona lo que venga de un archivo exportado. */
  importEntries: (
    data: { entries: EntryMap; tasks?: TaskMap },
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
  tasks: TaskMap;
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

/**
 * Cada cuánto se comprueba, con la pestaña a la vista, si otro aparato ha
 * escrito algo. Hace falta porque un portátil con la app abierta no recibe
 * ningún aviso del navegador al cambiar de ventana: sin este repaso se
 * quedaría enseñando lo que bajó al arrancar.
 */
const SYNC_POLL_MS = 45_000;

/** Margen tras un aviso en tiempo real, para no bajar una vez por tecla. */
const REALTIME_DEBOUNCE_MS = 1_500;

/** Espera antes de subir un ajuste: apagar y encender el sonido son dos toques. */
const SETTINGS_PUSH_MS = 600;

/**
 * Espera antes de subir un campograma. Más generosa que la de los ajustes:
 * montar un once son once toques seguidos, y no hay por qué mandar once
 * escrituras a la nube por un solo equipo.
 */
const LINEUP_PUSH_MS = 1_500;

/** Lo poco que hace falta de una fila avisada por el canal de tiempo real. */
interface CloudRow {
  id: string;
  updated_at: string;
}

/**
 * El modo, las sintonías y el PIN. No pasan por `db` —no son registros, sino
 * cómo se ve y cómo se abre la app—, así que se reconcilian aparte y con la
 * misma regla: gana la última elección, la haya hecho el aparato que sea.
 */
async function reconcileSettings(owner: string): Promise<void> {
  const local = loadSettings();
  const remote = await pullSettings();

  if (remote && Date.parse(remote.updatedAt) > Date.parse(local.updatedAt)) {
    applyRemoteSettings(remote);
    return;
  }

  if (!remote || Date.parse(local.updatedAt) > Date.parse(remote.updatedAt)) {
    await pushSettings(local, owner);
  }
}

/**
 * Los campogramas. Tampoco pasan por `db`: son una decisión de cada uno, no
 * un registro del día. Se comparan perfil a perfil y gana la última
 * alineación guardada, como en todo lo demás.
 */
async function reconcileLineups(owner: string): Promise<void> {
  const remote = await pullLineups();
  applyRemoteLineups(remote);

  // Y de vuelta lo que allí no está o está más viejo.
  for (const [profileId, local] of Object.entries(loadLineups())) {
    const theirs = remote[profileId];
    if (theirs && Date.parse(theirs.updatedAt) >= Date.parse(local.updatedAt)) continue;
    await pushLineup(profileId, local, owner);
  }
}

/**
 * Las agendas semanales. Mismo trato que los campogramas: la rutina que cada
 * uno ha decidido no es un registro del día, así que viaja aparte y gana la
 * última guardada. Es lo que permite que la semana se monte entre dos móviles.
 */
async function reconcilePlans(owner: string): Promise<void> {
  const remote = await pullPlans();
  applyRemotePlans(remote);

  for (const [profileId, local] of Object.entries(loadPlans())) {
    const theirs = remote[profileId];
    if (theirs && Date.parse(theirs.updatedAt) >= Date.parse(local.updatedAt)) continue;
    await pushPlan(profileId, local, owner);
  }
}

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
    // De paso se retira el PIN en claro que dejaran versiones anteriores.
    void migrateLegacyPin();
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
    tasks: {},
  });

  const lastSyncAt = useRef(0);
  /** Sincronización en curso: el repaso, el aviso y la vuelta pueden coincidir. */
  const syncing = useRef(false);

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
    if (!uid || syncing.current) return;
    syncing.current = true;

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
        tasks: mergeById('tasks', current.tasks, remote.tasks, current.tombstones),
        tombstones: {},
      };

      // 3. Y de vuelta lo que allí no está o está más viejo.
      const remoteIndex = {
        entries: versionIndex(remote.entries),
        tasks: versionIndex(remote.tasks),
      };

      await pushEntries(dirtyRows(merged.entries, remoteIndex.entries), uid);
      await pushTasks(dirtyRows(merged.tasks, remoteIndex.tasks), uid);
      // Los ajustes no deben tumbar la sincronización de los registros: si
      // la tabla todavía no está —esquema sin actualizar—, se dice al final y
      // se sigue como si nada.
      let settingsError: string | null = null;
      try {
        await reconcileSettings(uid);
      } catch (error) {
        settingsError =
          error instanceof Error
            ? `Los ajustes de la casa no han viajado: ${error.message}`
            : 'Los ajustes de la casa no han viajado.';
      }

      // Los campogramas, igual: si la tabla todavía no está, el equipo se
      // queda en este aparato y se avisa, pero los registros ya han viajado.
      try {
        await reconcileLineups(uid);
      } catch (error) {
        // Si los ajustes ya han fallado, se cuenta ése: dos avisos seguidos
        // sobre lo mismo —la tabla que falta— no informan más que uno.
        if (!settingsError) {
          settingsError =
            error instanceof Error
              ? `Los equipos del campograma no han viajado: ${error.message}`
              : 'Los equipos del campograma no han viajado.';
        }
      }

      // Y las agendas semanales, con el mismo criterio: que falte su tabla no
      // puede impedir que los registros del día lleguen a la nube.
      try {
        await reconcilePlans(uid);
      } catch (error) {
        if (!settingsError) {
          settingsError =
            error instanceof Error
              ? `Las agendas semanales no han viajado: ${error.message}`
              : 'Las agendas semanales no han viajado.';
        }
      }

      synced.current = {
        entries: versionIndex(merged.entries),
        tasks: versionIndex(merged.tasks),
      };

      // La mezcla se rehace contra el estado de este instante, no contra la
      // foto de hace unos segundos: si alguien ha escrito mientras bajaba,
      // lo suyo es más reciente y debe ganar.
      setDb((prev) => ({
        ...prev,
        entries: mergeById('entries', prev.entries, remote.entries, prev.tombstones),
        tasks: mergeById('tasks', prev.tasks, remote.tasks, prev.tombstones),
        tombstones: forget(prev.tombstones, propagated),
      }));

      if (settingsError) setCloudError(settingsError);
      setLastSync(new Date().toISOString());
      setCloudStatus('synced');
      lastSyncAt.current = Date.now();
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'No se ha podido sincronizar.');
      setCloudStatus('error');
    } finally {
      syncing.current = false;
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
      tasks: dirtyRows(current.tasks, synced.current.tasks),
    };

    if (!pendingGraves && !Object.values(changed).some((rows) => rows.length > 0)) return;

    try {
      for (const table of Object.keys(graves) as CloudTable[]) {
        await deleteRows(table, graves[table]);
      }

      await pushEntries(changed.entries, uid);
      await pushTasks(changed.tasks, uid);

      for (const row of changed.entries) {
        synced.current.entries[entryKey(row.profileId, row.date)] = row.updatedAt;
      }
      for (const row of changed.tasks) synced.current.tasks[row.id] = row.updatedAt;

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

  // Repaso periódico mientras la app está a la vista. `visibilitychange` sólo
  // salta al minimizar o al cambiar de pestaña, no al pasar del móvil al
  // portátil, así que sin esto lo escrito en uno no aparecía en el otro hasta
  // recargar la página.
  useEffect(() => {
    if (!session) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void syncNow();
    }, SYNC_POLL_MS);

    return () => window.clearInterval(timer);
  }, [session, syncNow]);

  // Volver a la ventana o recuperar la cobertura: se mira sin esperar al repaso.
  useEffect(() => {
    if (!session) return;

    const onWake = () => {
      if (Date.now() - lastSyncAt.current < SYNC_THROTTLE_MS) return;
      void syncNow();
    };

    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => {
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [session, syncNow]);

  // Aviso en el momento: cuando otro aparato escribe, Postgres lo anuncia por
  // el canal de tiempo real y aquí se baja en un par de segundos. Si el canal
  // no está disponible no pasa nada: el repaso de arriba sigue cubriendo.
  useEffect(() => {
    const client = supabase();
    if (!client || !session) return;

    let timer = 0;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void syncNow(), REALTIME_DEBOUNCE_MS);
    };

    const onChange = (payload: RealtimePostgresChangesPayload<CloudRow>) => {
      const row = payload.new as Partial<CloudRow> | null;
      const known = row?.id ? synced.current[payload.table as CloudTable]?.[row.id] : undefined;

      // El eco de lo que este mismo navegador acaba de subir se descarta. Se
      // compara como fecha y no como texto porque el mismo instante no se
      // escribe igual aquí (`Z`) que en Postgres (`+00:00`).
      if (known && row?.updated_at && Date.parse(known) === Date.parse(row.updated_at)) return;

      soon();
    };

    const channel = client
      .channel('casa')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [session, syncNow]);

  // Los ajustes no pasan por `db`, así que no los arrastra la subida
  // incremental: se suben en cuanto cambian. Si no, tocar el interruptor de
  // la noche no llegaría al resto hasta el repaso.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;

    let timer = 0;
    const unsubscribe = subscribeSettings(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Un ajuste que no sube no rompe nada: el repaso lo recoge luego.
        void pushSettings(loadSettings(), uid).catch(() => undefined);
      }, SETTINGS_PUSH_MS);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [session]);

  // Y lo mismo con los campogramas: mover un cromo de sitio en la tableta
  // tiene que verse en el móvil sin esperar al repaso.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;

    let timer = 0;
    const unsubscribe = subscribeLineups(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        for (const [profileId, lineup] of Object.entries(loadLineups())) {
          void pushLineup(profileId, lineup, uid).catch(() => undefined);
        }
      }, LINEUP_PUSH_MS);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [session]);

  // Las agendas, igual: si uno mueve el entreno del jueves, el otro tiene que
  // verlo movido sin esperar al repaso de los tres cuartos de hora.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;

    let timer = 0;
    const unsubscribe = subscribePlans(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        for (const [profileId, plan] of Object.entries(loadPlans())) {
          void pushPlan(profileId, plan, uid).catch(() => undefined);
        }
      }, LINEUP_PUSH_MS);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [session]);

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
    synced.current = { entries: {}, tasks: {} };
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
          notes: current?.notes,
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
        notes: current?.notes,
        updatedAt: new Date().toISOString(),
      };
      return { ...prev, entries: { ...prev.entries, [key]: next } };
    });
  }, []);

  const getEntryNote = useCallback(
    (profileId: ProfileId, date: DateKey, noteKey: NoteKey) =>
      db.entries[entryKey(profileId, date)]?.notes?.[noteKey] ?? '',
    [db],
  );

  const setEntryNote = useCallback(
    (profileId: ProfileId, date: DateKey, noteKey: NoteKey, text: string) => {
      setDb((prev) => {
        const key = entryKey(profileId, date);
        const current = prev.entries[key];
        const notes = { ...(current?.notes ?? {}) };

        // Una nota vaciada se quita del todo: así el registro no arrastra
        // claves con cadenas en blanco de días en que se borró lo escrito.
        if (text.trim()) notes[noteKey] = text;
        else delete notes[noteKey];

        const next: DayEntry = {
          date,
          profileId,
          values: current?.values ?? {},
          note: current?.note,
          notes: Object.keys(notes).length > 0 ? notes : undefined,
          updatedAt: new Date().toISOString(),
        };

        return { ...prev, entries: { ...prev.entries, [key]: next } };
      });
    },
    [],
  );

  /**
   * Borra el día entero. Con una excepción: la partida del juego del día se
   * queda. Es lo único del registro que no se puede volver a hacer, y borrar
   * el día sería la manera fácil de jugar dos veces; en ese caso, en vez de
   * quitar la fila, se deja con la partida y nada más.
   */
  const clearDay = useCallback((profileId: ProfileId, date: DateKey) => {
    setDb((prev) => {
      const key = entryKey(profileId, date);
      const entries = { ...prev.entries };
      const played = prev.entries[key]?.notes?.[GAME_NOTE_KEY];

      if (played) {
        entries[key] = {
          date,
          profileId,
          values: {},
          notes: { [GAME_NOTE_KEY]: played },
          updatedAt: new Date().toISOString(),
        };
        return { ...prev, entries };
      }

      delete entries[key];
      return { ...prev, entries, tombstones: grave(prev.tombstones, 'entries', key) };
    });
  }, []);

  /**
   * Copia los valores de un día en otro. No arrastra las notas —ni la del
   * día ni las de cada categoría—: son propias de la jornada y repetirlas
   * induciría a error. Devuelve el número de métricas copiadas para poder
   * acusarlo en el aviso.
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
          notes: target?.notes,
          updatedAt: new Date().toISOString(),
        };

        return { ...prev, entries: { ...prev.entries, [targetKey]: next } };
      });

      return copied;
    },
    [db],
  );

  /* -------------------------------------------------------- tareas */

  const getTasks = useCallback(
    (profileId: ProfileId) =>
      Object.values(db.tasks).filter((task) => task.profileId === profileId),
    [db],
  );

  const saveTask = useCallback((task: Task) => {
    setDb((prev) => ({ ...prev, tasks: { ...prev.tasks, [task.id]: task } }));
  }, []);

  const removeTask = useCallback((id: string) => {
    setDb((prev) => {
      const tasks = { ...prev.tasks };
      delete tasks[id];
      return { ...prev, tasks, tombstones: grave(prev.tombstones, 'tasks', id) };
    });
  }, []);

  const loadDemoData = useCallback(() => {
    // Los datos de ejemplo no traen recados: las citas del dentista son de
    // cada casa, no de un ejemplo.
    setDb((prev) => ({
      ...buildSeedDatabase(),
      tasks: prev.tasks,
    }));
  }, []);

  const resetAll = useCallback(() => {
    clearDatabase();
    setDb((prev) => {
      let tombstones = prev.tombstones;
      for (const id of Object.keys(prev.entries)) tombstones = grave(tombstones, 'entries', id);
      for (const id of Object.keys(prev.tasks)) tombstones = grave(tombstones, 'tasks', id);
      return { ...emptyDatabase(), tombstones };
    });
  }, []);

  const importEntries = useCallback(
    (
      data: { entries: EntryMap; tasks?: TaskMap },
      mode: 'merge' | 'replace',
    ) => {
      const tasks = data.tasks ?? {};
      setDb((prev) => ({
        ...prev,
        entries: mode === 'replace' ? data.entries : { ...prev.entries, ...data.entries },
        tasks: mode === 'replace' ? tasks : { ...prev.tasks, ...tasks },
      }));
    },
    [],
  );

  const snapshot = useCallback(
    () => ({ entries: db.entries, tasks: db.tasks }),
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
      revive('tasks', Object.keys(state.tasks));

      return {
        ...prev,
        entries: state.entries,
        tasks: state.tasks,
        tombstones,
      };
    });
  }, []);

  return useMemo(
    () => ({
      hydrated,
      entries: db.entries,
      tasks: db.tasks,
      status,
      getEntry,
      getValue,
      setValue,
      setNote,
      getEntryNote,
      setEntryNote,
      clearDay,
      copyDay,
      getTasks,
      saveTask,
      removeTask,
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
      status,
      getEntry,
      getValue,
      setValue,
      setNote,
      getEntryNote,
      setEntryNote,
      clearDay,
      copyDay,
      db.tasks,
      getTasks,
      saveTask,
      removeTask,
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
