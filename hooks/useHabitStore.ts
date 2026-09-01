'use client';

import {
  applyRemoteBooks,
  loadBooks,
  saveBook,
  subscribeBooks,
} from '@/lib/finance';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimePostgresChangesPayload, Session } from '@supabase/supabase-js';

import {
  deleteFrom,
  deleteRows,
  dirtyRows,
  mergeById,
  pullAll,
  pullLineups,
  pullFinance,
  pullPlans,
  pullReplica,
  pullSettings,
  pushEntries,
  pushLineup,
  pushFinance,
  pushPlan,
  pushReplica,
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
  replaceLineups,
  subscribeLineups,
  updateLineup,
} from '@/lib/lineup';
import {
  applyRemotePlans,
  loadPlans,
  replacePlans,
  subscribePlans,
  updatePlan,
} from '@/lib/planner';
import {
  deviceId,
  deviceLabel,
  rememberReplica,
  replicaAction,
  type ReplicaMark,
} from '@/lib/replica';
import { buildSeedDatabase } from '@/lib/seed';
import {
  applyRemoteSettings,
  loadSettings,
  migrateLegacyPin,
  subscribeSettings,
  updateSettings,
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
  /** Cambia la contraseña de la cuenta de casa. Requiere sesión abierta. */
  changePassword: (password: string) => Promise<void>;
  /** Manda el correo con el enlace para volver a entrar sin la contraseña. */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Fuerza una sincronización completa. */
  syncNow: () => Promise<void>;
  /**
   * Manda a la nube todo lo de este aparato, refechado, para que gane en el
   * resto. Devuelve cómo le fue a cada pieza.
   */
  pushAll: () => Promise<CloudPart[]>;
  /**
   * Deja el resto de aparatos exactamente igual que este: sube lo de aquí y
   * quita de la nube lo que aquí ya no existe. Las fotos y las sintonías no
   * pasan por este archivo, así que se entregan como un paso más —el que se
   * pasa en `uploadAppearance`— para que la marca de réplica se escriba
   * cuando de verdad ha subido todo.
   */
  replicateAll: (uploadAppearance: () => Promise<CloudPart>) => Promise<CloudPart[]>;

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

/**
 * Cada cosa que viaja por su cuenta. Los registros y las tareas van en `db`;
 * los ajustes, los campogramas y las agendas tienen su propia tabla y su
 * propia reconciliación, así que pueden llegar unos sí y otros no —lo típico
 * es un esquema sin actualizar: la tabla que falta— y hay que poder decirlo
 * pieza a pieza en vez de dar la sincronización entera por buena.
 */
export interface CloudPart {
  id: 'entries' | 'tasks' | 'settings' | 'lineups' | 'plans' | 'finance' | 'photos' | 'replica';
  label: string;
  ok: boolean;
  /** Lo que dijo la nube cuando no llegó. */
  error?: string;
  /** Cuántas filas se han mandado, cuando se sabe. */
  sent?: number;
  /** Cuántas se han bajado, cuando lo que ha pasado es una copia. */
  received?: number;
  /** Cuántas se han quitado de la nube por no existir ya aquí. */
  removed?: number;
}

/** Lo que hay que contar tras adoptar la copia declarada por otro aparato. */
interface Adopted {
  device: string;
  entries: number;
  tasks: number;
}

export interface CloudState {
  configured: boolean;
  status: CloudStatus;
  /** Cuenta con la que se ha entrado en este móvil. */
  email: string | null;
  lastSync: string | null;
  error: string | null;
  /** Cómo le fue a cada pieza en la última sincronización. */
  parts: CloudPart[];
  /**
   * Se ha llegado desde el enlace de recuperación del correo. La sesión está
   * abierta, pero la contraseña sigue siendo la que no se recuerda: hasta que
   * se ponga otra, la app lo dice y lleva a donde se cambia.
   */
  recovering: boolean;
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
 * Tablas que avisan en el momento. Además de los registros y las tareas,
 * están las tres que viajan aparte: sin ellas, mover el entreno del jueves o
 * apagar las sintonías tardaba hasta tres cuartos de hora en verse en el
 * otro móvil, que es justo lo contrario de lo que espera quien lo hace.
 */
const LIVE_TABLES = [
  'entries',
  'tasks',
  'settings',
  'lineups',
  'agendas',
  'finance',
  'replicas',
] as const;

/**
 * Apunta lo que este mismo navegador acaba de subir, para reconocer su propio
 * eco cuando Postgres lo anuncie. Sin esto, subir un ajuste provocaría una
 * sincronización completa por cada toque del interruptor.
 */
type Remember = (table: string, id: string, updatedAt: string) => void;

/**
 * El modo, las sintonías y el PIN. No pasan por `db` —no son registros, sino
 * cómo se ve y cómo se abre la app—, así que se reconcilian aparte y con la
 * misma regla: gana la última elección, la haya hecho el aparato que sea.
 */
async function reconcileSettings(owner: string, remember: Remember): Promise<void> {
  const local = loadSettings();
  const remote = await pullSettings();

  if (remote && Date.parse(remote.updatedAt) > Date.parse(local.updatedAt)) {
    applyRemoteSettings(remote);
    return;
  }

  if (!remote || Date.parse(local.updatedAt) > Date.parse(remote.updatedAt)) {
    await pushSettings(local, owner);
    remember('settings', owner, local.updatedAt);
  }
}

/**
 * Los campogramas. Tampoco pasan por `db`: son una decisión de cada uno, no
 * un registro del día. Se comparan perfil a perfil y gana la última
 * alineación guardada, como en todo lo demás.
 */
async function reconcileLineups(owner: string, remember: Remember): Promise<void> {
  const remote = await pullLineups();
  applyRemoteLineups(remote);

  // Y de vuelta lo que allí no está o está más viejo.
  for (const [profileId, local] of Object.entries(loadLineups())) {
    const theirs = remote[profileId];
    if (theirs && Date.parse(theirs.updatedAt) >= Date.parse(local.updatedAt)) continue;
    await pushLineup(profileId, local, owner);
    remember('lineups', `${owner}:${profileId}`, local.updatedAt);
  }
}

/**
 * Las agendas semanales. Mismo trato que los campogramas: la rutina que cada
 * uno ha decidido no es un registro del día, así que viaja aparte y gana la
 * última guardada. Es lo que permite que la semana se monte entre dos móviles.
 */
async function reconcilePlans(owner: string, remember: Remember): Promise<void> {
  const remote = await pullPlans();
  applyRemotePlans(remote);

  for (const [profileId, local] of Object.entries(loadPlans())) {
    const theirs = remote[profileId];
    if (theirs && Date.parse(theirs.updatedAt) >= Date.parse(local.updatedAt)) continue;
    await pushPlan(profileId, local, owner);
    remember('agendas', `${owner}:${profileId}`, local.updatedAt);
  }
}

/**
 * Las libretas de economía. Mismo trato que las agendas: no son un registro
 * del día, se leen y se escriben enteras y gana la última guardada. Es lo que
 * permite apuntar un gasto en el móvil y encontrárselo en el portátil.
 */
async function reconcileFinance(owner: string, remember: Remember): Promise<void> {
  const remote = await pullFinance();
  applyRemoteBooks(remote);

  for (const [profileId, local] of Object.entries(loadBooks())) {
    const theirs = remote[profileId];
    if (theirs && Date.parse(theirs.updatedAt) >= Date.parse(local.updatedAt)) continue;
    await pushFinance(profileId, local, owner);
    remember('finance', `${owner}:${profileId}`, local.updatedAt);
  }
}

/**
 * Lo que no pasa por `db` y se reconcilia aparte. Va en una lista para poder
 * recorrerlo y contar pieza a pieza cómo le fue: que falte la tabla de las
 * agendas no puede impedir que lleguen los registros, pero tampoco puede
 * pasar por «al día».
 */
const PIECES: Array<{
  id: CloudPart['id'];
  label: string;
  reconcile: (owner: string, remember: Remember) => Promise<void>;
}> = [
  { id: 'settings', label: 'Ajustes de la casa', reconcile: reconcileSettings },
  { id: 'lineups', label: 'Campogramas', reconcile: reconcileLineups },
  { id: 'plans', label: 'Agendas semanales', reconcile: reconcilePlans },
  { id: 'finance', label: 'Economía', reconcile: reconcileFinance },
];

/** Cómo se cuenta lo que no ha llegado, sin repetir la lista de piezas. */
function failureNote(report: CloudPart[]): string | null {
  const failed = report.filter((part) => !part.ok);
  if (failed.length === 0) return null;

  return `No ha viajado todo: ${failed
    .map((part) => `${part.label.toLowerCase()}${part.error ? ` (${part.error})` : ''}`)
    .join('; ')}.`;
}

/** Anota un borrado para que la nube lo repita en la próxima subida. */
function grave(
  tombstones: Record<string, string>,
  table: CloudTable,
  id: string,
): Record<string, string> {
  return { ...tombstones, [`${table}:${id}`]: new Date().toISOString() };
}

/**
 * Rehace las lápidas después de sustituir la base de golpe: importar una
 * copia con «reemplazar todo», o poner los datos de ejemplo.
 *
 * Sin esto, «reemplazar todo» no reemplazaba nada en una casa con nube. Los
 * días que la copia no traía desaparecían de este móvil, pero nadie los daba
 * por borrados, así que seguían en la nube y la siguiente sincronización los
 * devolvía tal cual: la copia importada quedaba mezclada con lo que se
 * suponía que había sustituido.
 *
 * Y al revés: un día que se hubiera borrado aquí y que la copia sí trae
 * vuelve a existir, así que su lápida sobra —de lo contrario lo importado se
 * borraría solo en cuanto la lápida viajara—.
 */
function regrave(
  tombstones: Record<string, string>,
  before: { entries: EntryMap; tasks: TaskMap },
  after: { entries: EntryMap; tasks: TaskMap },
): Record<string, string> {
  const next = { ...tombstones };
  const stamp = new Date().toISOString();

  const settle = (table: CloudTable, was: Record<string, unknown>, is: Record<string, unknown>) => {
    for (const id of Object.keys(was)) if (!(id in is)) next[`${table}:${id}`] = stamp;
    for (const id of Object.keys(is)) delete next[`${table}:${id}`];
  };

  settle('entries', before.entries, after.entries);
  settle('tasks', before.tasks, after.tasks);

  return next;
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
  const [parts, setParts] = useState<CloudPart[]>([]);
  const [localOnly, setLocalOnlyState] = useState(false);
  const [recovering, setRecovering] = useState(false);

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

  /**
   * Última versión que ha subido este navegador de lo que no pasa por `db`,
   * por `${tabla}:${id}`. Es lo que deja distinguir «alguien ha cambiado el
   * modo en la tableta» de «acabo de subir yo el mismo modo».
   */
  const echoes = useRef<Record<string, string>>({});

  const remember = useCallback<Remember>((table, id, updatedAt) => {
    echoes.current[`${table}:${id}`] = updatedAt;
  }, []);

  useEffect(() => {
    setLocalOnlyState(window.localStorage.getItem(LOCAL_ONLY_KEY) === '1');
  }, []);

  // Sesión: se recupera la guardada y se escuchan los cambios.
  useEffect(() => {
    const client = supabase();
    if (!client) return;

    client.auth.getSession().then(({ data }) => setSession(data.session));

    const { data } = client.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Supabase avisa así de que la sesión viene del enlace del correo. No
      // basta con dejar entrar: quien llega por ahí es porque no se acuerda
      // de la contraseña, y sin cambiarla volverá a quedarse fuera mañana.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /* ------------------------------------------- subida y bajada */

  /**
   * Adopta la copia que otro aparato haya declarado, si la hay y es nueva.
   *
   * Esto no es la mezcla de siempre: se sustituye lo de aquí por lo que haya
   * arriba, y lo que sólo existiera en este móvil desaparece. Es exactamente
   * lo que se pidió al pulsar «dejar todos igual que este» en el otro, y por
   * eso allí se pregunta dos veces antes.
   *
   * Devuelve lo que hay que contar, o `null` si no había nada que adoptar.
   */
  const adoptReplica = useCallback(async (): Promise<Adopted | null> => {
    const mark = await pullReplica();
    const action = replicaAction(mark, 'datos');
    if (!mark || action === 'nada') return null;

    // Primera marca que ve este aparato: se apunta y no se toca nada. Un
    // móvil recién estrenado no puede perder lo que lleve registrado por una
    // réplica que se declaró antes de que existiera.
    if (action === 'anotar') {
      rememberReplica('datos', mark.stamp);
      return null;
    }

    const [remote, settings, lineups, plans] = await Promise.all([
      pullAll(),
      pullSettings(),
      pullLineups(),
      pullPlans(),
    ]);

    if (settings) applyRemoteSettings(settings);
    replaceLineups(lineups);
    replacePlans(plans);

    // Las lápidas se tiran: lo borrado aquí ya no tiene por qué borrarse
    // allí, porque lo de allí es justamente lo que ahora manda.
    setDb((prev) => ({ ...prev, entries: remote.entries, tasks: remote.tasks, tombstones: {} }));
    synced.current = {
      entries: versionIndex(remote.entries),
      tasks: versionIndex(remote.tasks),
    };

    // Sólo al final: si algo de lo de arriba hubiera fallado, la copia se
    // vuelve a intentar en el próximo repaso en vez de darse por hecha.
    rememberReplica('datos', mark.stamp);

    return {
      device: mark.device,
      entries: Object.keys(remote.entries).length,
      tasks: Object.keys(remote.tasks).length,
    };
  }, []);

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
      // 0. ¿Ha dicho alguien «que todos queden igual que este»? Entonces esto
      //    no es una mezcla, es una copia, y no hay nada más que hacer.
      let adopted: Adopted | null = null;
      try {
        adopted = await adoptReplica();
      } catch {
        // La tabla puede no existir todavía —esquema sin actualizar— o la
        // copia puede no haber bajado entera. En los dos casos se sigue con
        // la sincronización de siempre, que no le borra nada a nadie.
      }

      if (adopted) {
        setParts([
          { id: 'replica', label: `Copia de ${adopted.device}`, ok: true },
          { id: 'entries', label: 'Registros', ok: true, received: adopted.entries },
          { id: 'tasks', label: 'Tareas', ok: true, received: adopted.tasks },
        ]);
        setCloudError(null);
        setLastSync(new Date().toISOString());
        setCloudStatus('synced');
        lastSyncAt.current = Date.now();
        return;
      }

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

      const freshEntries = dirtyRows(merged.entries, remoteIndex.entries);
      const freshTasks = dirtyRows(merged.tasks, remoteIndex.tasks);

      await pushEntries(freshEntries, uid);
      await pushTasks(freshTasks, uid);

      // Y ahora lo que viaja aparte. Cada pieza se apunta por separado: si la
      // tabla todavía no está —esquema sin actualizar—, esa se queda en este
      // aparato y se dice cuál, pero los registros ya han llegado.
      const report: CloudPart[] = [
        { id: 'entries', label: 'Registros', ok: true, sent: freshEntries.length },
        { id: 'tasks', label: 'Tareas', ok: true, sent: freshTasks.length },
      ];

      for (const piece of PIECES) {
        try {
          await piece.reconcile(uid, remember);
          report.push({ id: piece.id, label: piece.label, ok: true });
        } catch (error) {
          report.push({
            id: piece.id,
            label: piece.label,
            ok: false,
            error: error instanceof Error ? error.message : 'No ha viajado.',
          });
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

      // Si algo se ha quedado por el camino, esto no está «al día»: decirlo
      // es la diferencia entre una casa que sabe que le falta la agenda y una
      // que cree que la tiene en todas partes.
      const note = failureNote(report);

      setParts(report);
      setCloudError(note);
      setLastSync(new Date().toISOString());
      setCloudStatus(note ? 'error' : 'synced');
      lastSyncAt.current = Date.now();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido sincronizar.';

      // Aquí ha fallado lo primero: sin bajada no hay nada que contar pieza a
      // pieza, así que lo que se dice es que no ha viajado ni lo básico.
      setParts([
        { id: 'entries', label: 'Registros', ok: false, error: message },
        { id: 'tasks', label: 'Tareas', ok: false, error: message },
      ]);
      setCloudError(message);
      setCloudStatus('error');
    } finally {
      syncing.current = false;
    }
  }, [session, remember, adoptReplica]);

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

  /**
   * «Manda lo de este móvil»: sube todo lo de aquí refechado, para que en el
   * resto de aparatos gane esta versión.
   *
   * Hace falta cuando una casa ha montado la app en un móvil —fotos, agendas,
   * equipos, días rellenos— y quiere que los demás se pongan al día de golpe.
   * La regla de siempre —gana la última escritura— sólo mueve lo que aquí es
   * más reciente; esto decide que aquí todo lo es.
   *
   * No borra nada de nadie: lo que exista en otro aparato y no aquí sigue
   * existiendo. Lo que esté en los dos sitios pasa a ser el de aquí.
   */
  const pushAll = useCallback(async (): Promise<CloudPart[]> => {
    const uid = session?.user.id;
    if (!uid) return [];

    setCloudStatus('syncing');
    setCloudError(null);

    const now = new Date().toISOString();
    const current = dbRef.current;
    const report: CloudPart[] = [];

    const entries = Object.fromEntries(
      Object.entries(current.entries).map(([id, entry]) => [id, { ...entry, updatedAt: now }]),
    ) as EntryMap;
    const tasks = Object.fromEntries(
      Object.entries(current.tasks).map(([id, task]) => [id, { ...task, updatedAt: now }]),
    ) as TaskMap;

    try {
      await pushEntries(Object.values(entries), uid);
      await pushTasks(Object.values(tasks), uid);

      // Lo refechado pasa a ser lo que hay aquí: si no, la fecha de la nube y
      // la de este móvil dirían cosas distintas del mismo día.
      setDb((prev) => ({ ...prev, entries, tasks }));
      synced.current = { entries: versionIndex(entries), tasks: versionIndex(tasks) };

      report.push({
        id: 'entries',
        label: 'Registros',
        ok: true,
        sent: Object.keys(entries).length,
      });
      report.push({ id: 'tasks', label: 'Tareas', ok: true, sent: Object.keys(tasks).length });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No ha viajado.';
      report.push({ id: 'entries', label: 'Registros', ok: false, error: message });
      report.push({ id: 'tasks', label: 'Tareas', ok: false, error: message });
    }

    // Los ajustes, los campogramas y las agendas se refechan con las mismas
    // funciones que usa la app al tocarlos, así que lo que sube es exactamente
    // lo que queda guardado aquí.
    try {
      const settings = updateSettings({});
      await pushSettings(settings, uid);
      remember('settings', uid, settings.updatedAt);
      report.push({ id: 'settings', label: 'Ajustes de la casa', ok: true });
    } catch (error) {
      report.push({
        id: 'settings',
        label: 'Ajustes de la casa',
        ok: false,
        error: error instanceof Error ? error.message : 'No ha viajado.',
      });
    }

    try {
      const ids = Object.keys(loadLineups()) as ProfileId[];
      for (const profileId of ids) {
        const lineup = updateLineup(profileId, {});
        await pushLineup(profileId, lineup, uid);
        remember('lineups', `${uid}:${profileId}`, lineup.updatedAt);
      }
      report.push({ id: 'lineups', label: 'Campogramas', ok: true, sent: ids.length });
    } catch (error) {
      report.push({
        id: 'lineups',
        label: 'Campogramas',
        ok: false,
        error: error instanceof Error ? error.message : 'No ha viajado.',
      });
    }

    try {
      const plans = Object.entries(loadPlans());
      for (const [profileId, plan] of plans) {
        const saved = updatePlan(profileId as ProfileId, plan.blocks);
        await pushPlan(profileId, saved, uid);
        remember('agendas', `${uid}:${profileId}`, saved.updatedAt);
      }
      report.push({ id: 'plans', label: 'Agendas semanales', ok: true, sent: plans.length });
    } catch (error) {
      report.push({
        id: 'plans',
        label: 'Agendas semanales',
        ok: false,
        error: error instanceof Error ? error.message : 'No ha viajado.',
      });
    }

    try {
      const books = Object.entries(loadBooks());
      for (const [profileId, book] of books) {
        const saved = saveBook(profileId, book);
        await pushFinance(profileId, saved, uid);
        remember('finance', `${uid}:${profileId}`, saved.updatedAt);
      }
      report.push({ id: 'finance', label: 'Economía', ok: true, sent: books.length });
    } catch (error) {
      report.push({
        id: 'finance',
        label: 'Economía',
        ok: false,
        error: error instanceof Error ? error.message : 'No ha viajado.',
      });
    }

    const note = failureNote(report);

    setParts(report);
    setCloudError(note);
    setLastSync(new Date().toISOString());
    setCloudStatus(note ? 'error' : 'synced');
    lastSyncAt.current = Date.now();

    return report;
  }, [session, remember]);

  /**
   * «Dejar todos los aparatos igual que este»: la réplica.
   *
   * Es el hermano destructivo del anterior. «Mandar lo de este móvil» sube lo
   * de aquí pero respeta lo que sólo exista allí; esto no: deja la nube como
   * una copia exacta de este aparato —quitando de ella lo que aquí ya no
   * está— y anota una marca para que el resto de móviles adopten esa copia
   * entera en vez de mezclarla.
   *
   * Sirve para lo que la mezcla no puede arreglar: un móvil con la casa
   * montada como debe estar y otros tres arrastrando pruebas, días sueltos y
   * fotos de cuando se estaba probando la app.
   *
   * La marca se escribe la última y sólo si todo lo demás ha subido. Media
   * copia declarada como copia entera dejaría a los demás borrando lo suyo
   * para adoptar algo que no está.
   */
  const replicateAll = useCallback(
    async (uploadAppearance: () => Promise<CloudPart>): Promise<CloudPart[]> => {
      const uid = session?.user.id;
      if (!uid) return [];

      setCloudStatus('syncing');
      setCloudError(null);

      const now = new Date().toISOString();
      const current = dbRef.current;
      const report: CloudPart[] = [];

      const entries = Object.fromEntries(
        Object.entries(current.entries).map(([id, entry]) => [id, { ...entry, updatedAt: now }]),
      ) as EntryMap;
      const tasks = Object.fromEntries(
        Object.entries(current.tasks).map(([id, task]) => [id, { ...task, updatedAt: now }]),
      ) as TaskMap;

      try {
        // Lo que hay arriba y aquí no, sobra: eso es lo que distingue la
        // réplica de una subida a secas.
        const remote = await pullAll();
        const goneEntries = Object.keys(remote.entries).filter((id) => !entries[id]);
        const goneTasks = Object.keys(remote.tasks).filter((id) => !tasks[id]);

        await deleteFrom('entries', goneEntries);
        await deleteFrom('tasks', goneTasks);

        await pushEntries(Object.values(entries), uid);
        await pushTasks(Object.values(tasks), uid);

        setDb((prev) => ({ ...prev, entries, tasks, tombstones: {} }));
        synced.current = { entries: versionIndex(entries), tasks: versionIndex(tasks) };

        report.push({
          id: 'entries',
          label: 'Registros',
          ok: true,
          sent: Object.keys(entries).length,
          removed: goneEntries.length,
        });
        report.push({
          id: 'tasks',
          label: 'Tareas',
          ok: true,
          sent: Object.keys(tasks).length,
          removed: goneTasks.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No ha viajado.';
        report.push({ id: 'entries', label: 'Registros', ok: false, error: message });
        report.push({ id: 'tasks', label: 'Tareas', ok: false, error: message });
      }

      // Los ajustes son una sola fila por cuenta: subir la de aquí ya la deja
      // como copia exacta, sin nada que quitar.
      try {
        const settings = updateSettings({});
        await pushSettings(settings, uid);
        remember('settings', uid, settings.updatedAt);
        report.push({ id: 'settings', label: 'Ajustes de la casa', ok: true });
      } catch (error) {
        report.push({
          id: 'settings',
          label: 'Ajustes de la casa',
          ok: false,
          error: error instanceof Error ? error.message : 'No ha viajado.',
        });
      }

      try {
        const mine = loadLineups();
        const there = await pullLineups();
        const gone = Object.keys(there)
          .filter((profileId) => !mine[profileId])
          .map((profileId) => `${uid}:${profileId}`);

        await deleteFrom('lineups', gone);

        const ids = Object.keys(mine) as ProfileId[];
        for (const profileId of ids) {
          const lineup = updateLineup(profileId, {});
          await pushLineup(profileId, lineup, uid);
          remember('lineups', `${uid}:${profileId}`, lineup.updatedAt);
        }

        report.push({
          id: 'lineups',
          label: 'Campogramas',
          ok: true,
          sent: ids.length,
          removed: gone.length,
        });
      } catch (error) {
        report.push({
          id: 'lineups',
          label: 'Campogramas',
          ok: false,
          error: error instanceof Error ? error.message : 'No ha viajado.',
        });
      }

      try {
        const mine = loadPlans();
        const there = await pullPlans();
        const gone = Object.keys(there)
          .filter((profileId) => !mine[profileId])
          .map((profileId) => `${uid}:${profileId}`);

        await deleteFrom('agendas', gone);

        const ids = Object.entries(mine);
        for (const [profileId, plan] of ids) {
          const saved = updatePlan(profileId as ProfileId, plan.blocks);
          await pushPlan(profileId, saved, uid);
          remember('agendas', `${uid}:${profileId}`, saved.updatedAt);
        }

        report.push({
          id: 'plans',
          label: 'Agendas semanales',
          ok: true,
          sent: ids.length,
          removed: gone.length,
        });
      } catch (error) {
        report.push({
          id: 'plans',
          label: 'Agendas semanales',
          ok: false,
          error: error instanceof Error ? error.message : 'No ha viajado.',
        });
      }

      try {
        const mine = loadBooks();
        const there = await pullFinance();
        const gone = Object.keys(there)
          .filter((profileId) => !mine[profileId])
          .map((profileId) => `${uid}:${profileId}`);

        await deleteFrom('finance', gone);

        const ids = Object.entries(mine);
        for (const [profileId, book] of ids) {
          const saved = saveBook(profileId, book);
          await pushFinance(profileId, saved, uid);
          remember('finance', `${uid}:${profileId}`, saved.updatedAt);
        }

        report.push({
          id: 'finance',
          label: 'Economía',
          ok: true,
          sent: ids.length,
          removed: gone.length,
        });
      } catch (error) {
        report.push({
          id: 'finance',
          label: 'Economía',
          ok: false,
          error: error instanceof Error ? error.message : 'No ha viajado.',
        });
      }

      // Las fotos y las sintonías las lleva `useAppearance`: viven en
      // IndexedDB y en un cubo, no en estas tablas. Entran aquí como una
      // pieza más para que la marca no se escriba antes de que hayan subido.
      try {
        report.push(await uploadAppearance());
      } catch (error) {
        report.push({
          id: 'photos',
          label: 'Fotos y sintonías',
          ok: false,
          error: error instanceof Error ? error.message : 'No ha viajado.',
        });
      }

      const broken = report.filter((part) => !part.ok);

      if (broken.length > 0) {
        report.push({
          id: 'replica',
          label: 'Aviso al resto de aparatos',
          ok: false,
          error: 'no se ha dado, porque no ha subido todo',
        });
      } else {
        try {
          const mark: ReplicaMark = {
            stamp: new Date().toISOString(),
            origin: deviceId(),
            device: deviceLabel(),
          };

          await pushReplica(mark, uid);

          // Este aparato ya es la copia: se apunta como aplicada para no
          // adoptarse a sí mismo aunque su identificador cambiara.
          rememberReplica('datos', mark.stamp);
          rememberReplica('aspecto', mark.stamp);

          report.push({ id: 'replica', label: 'Aviso al resto de aparatos', ok: true });
        } catch (error) {
          report.push({
            id: 'replica',
            label: 'Aviso al resto de aparatos',
            ok: false,
            error: error instanceof Error ? error.message : 'No ha viajado.',
          });
        }
      }

      const note = failureNote(report);

      setParts(report);
      setCloudError(note);
      setLastSync(new Date().toISOString());
      setCloudStatus(note ? 'error' : 'synced');
      lastSyncAt.current = Date.now();

      return report;
    },
    [session, remember],
  );

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
      const row = payload.new as Partial<CloudRow & { owner: string }> | null;
      const table = payload.table;

      // Los ajustes no tienen `id`: su clave es la cuenta.
      const id = row?.id ?? row?.owner;

      const known = id
        ? (synced.current[table as CloudTable]?.[id] ?? echoes.current[`${table}:${id}`])
        : undefined;

      // El eco de lo que este mismo navegador acaba de subir se descarta. Se
      // compara como fecha y no como texto porque el mismo instante no se
      // escribe igual aquí (`Z`) que en Postgres (`+00:00`).
      if (known && row?.updated_at && Date.parse(known) === Date.parse(row.updated_at)) return;

      soon();
    };

    const channel = LIVE_TABLES.reduce(
      (built, table) =>
        built.on('postgres_changes', { event: '*', schema: 'public', table }, onChange),
      client.channel('casa'),
    ).subscribe();

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
        const local = loadSettings();

        // Adoptar lo que venía de la nube también avisa a los oyentes, así
        // que sin esta comprobación cada bajada devolvería la misma fila a
        // la nube y las dos puntas se estarían dando la razón sin parar.
        if (echoes.current[`settings:${uid}`] === local.updatedAt) return;

        // Un ajuste que no sube no rompe nada: el repaso lo recoge luego.
        void pushSettings(local, uid)
          .then(() => remember('settings', uid, local.updatedAt))
          .catch(() => undefined);
      }, SETTINGS_PUSH_MS);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [session, remember]);

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
          const id = `${uid}:${profileId}`;
          if (echoes.current[`lineups:${id}`] === lineup.updatedAt) continue;

          void pushLineup(profileId, lineup, uid)
            .then(() => remember('lineups', id, lineup.updatedAt))
            .catch(() => undefined);
        }
      }, LINEUP_PUSH_MS);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [session, remember]);

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
          const id = `${uid}:${profileId}`;
          if (echoes.current[`agendas:${id}`] === plan.updatedAt) continue;

          void pushPlan(profileId, plan, uid)
            .then(() => remember('agendas', id, plan.updatedAt))
            .catch(() => undefined);
        }
      }, LINEUP_PUSH_MS);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [session, remember]);

  // Y la economía, igual: un gasto apuntado en el móvil tiene que estar en el
  // portátil sin esperar al repaso. Va detrás de la clave de la sección, pero
  // eso es la puerta de la pantalla; los datos viajan como los demás.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;

    let timer = 0;
    const unsubscribe = subscribeBooks(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        for (const [profileId, book] of Object.entries(loadBooks())) {
          const id = `${uid}:${profileId}`;
          if (echoes.current[`finance:${id}`] === book.updatedAt) continue;

          void pushFinance(profileId, book, uid)
            .then(() => remember('finance', id, book.updatedAt))
            .catch(() => undefined);
        }
      }, LINEUP_PUSH_MS);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [session, remember]);

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
    setRecovering(false);
  }, []);

  const changePassword = useCallback(async (password: string) => {
    const client = supabase();
    if (!client) throw new Error('La nube no está configurada.');

    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(error.message);

    // Ya hay contraseña nueva: se deja de avisar de que hay que ponerla.
    setRecovering(false);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const client = supabase();
    if (!client) throw new Error('La nube no está configurada.');

    // El enlace devuelve a esta misma app, sea el móvil, el portátil o
    // Vercel: la dirección se toma de donde se esté pidiendo.
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw new Error(error.message);
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
    synced.current = { entries: {}, tasks: {} };

    setDb((prev) => {
      const seed = buildSeedDatabase();
      const after = { entries: seed.entries, tasks: prev.tasks };

      return {
        ...prev,
        version: seed.version,
        ...after,
        // Los días que había aquí y el ejemplo no trae quedan marcados como
        // borrados: si no, la nube los devolvería mezclados con el ejemplo.
        tombstones: regrave(prev.tombstones, prev, after),
      };
    });
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

      // Lo importado tiene que volver a viajar entero: se olvida qué versión
      // se había subido de cada fila, porque las de la copia son otras.
      synced.current = { entries: {}, tasks: {} };

      setDb((prev) => {
        const after = {
          entries: mode === 'replace' ? data.entries : { ...prev.entries, ...data.entries },
          tasks: mode === 'replace' ? tasks : { ...prev.tasks, ...tasks },
        };

        return {
          ...prev,
          ...after,
          // Reemplazar tiene que reemplazar también en la nube; y lo que la
          // copia devuelve deja de estar borrado.
          tombstones: regrave(prev.tombstones, prev, after),
        };
      });
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
        parts,
        recovering,
      },
      localOnly,
      signIn,
      signUp,
      signOut,
      changePassword,
      sendPasswordReset,
      syncNow,
      pushAll,
      replicateAll,
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
      parts,
      recovering,
      localOnly,
      session,
      signIn,
      signUp,
      signOut,
      changePassword,
      sendPasswordReset,
      syncNow,
      pushAll,
      replicateAll,
      setLocalOnly,
    ],
  );
}
