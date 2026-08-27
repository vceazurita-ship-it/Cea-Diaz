'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import {
  clearSlot,
  loadAllSlots,
  markSynced,
  putRemoteSlot,
  saveAnthem,
  savePhotoSlot,
  slotKey,
  APP_OWNER,
  type AppearanceOwner,
  type PhotoSlot,
  type Slot,
  type SlotMeta,
} from '@/lib/appearance';
import {
  deleteAppearance,
  deleteAppearanceRows,
  downloadAppearance,
  pullAppearance,
  pullReplica,
  pushAppearance,
  type AppearanceRow,
} from '@/lib/cloud';
import { rememberReplica, replicaAction, type ReplicaMark } from '@/lib/replica';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

/* =========================================================================
 *  Capa de aspecto por encima de los perfiles de fábrica.
 *
 *  Los Blob de IndexedDB se publican como URL de objeto, que sólo valen
 *  mientras dura la pestaña: se crean al hidratar y se revocan al sustituir
 *  o al desmontar, para no dejar memoria colgada.
 * ========================================================================= */

interface SlotState {
  url: string;
  meta: SlotMeta;
}

/** Una ranura tal y como sale de IndexedDB. */
interface LocalSlot {
  blob: Blob;
  meta: SlotMeta;
}

interface AppearanceValue {
  /** `false` hasta que se lee IndexedDB; hasta entonces manda lo de fábrica. */
  ready: boolean;
  /** Personalizaciones por clave `${owner}:${slot}`. */
  slots: Record<string, SlotState>;
  /** Perfil con sus fotos y sintonía sustituidas donde las haya. */
  dress: (profile: Profile) => Profile;
  /**
   * Portada de la pantalla de inicio: la que haya puesto la casa o, si no
   * han puesto ninguna, la foto de familia que viene de fábrica.
   */
  appCover: string;
  /** `true` si la portada de arriba es una elegida a mano. */
  appCoverCustom: boolean;
  setPhoto: (owner: AppearanceOwner, slot: PhotoSlot, file: File) => Promise<void>;
  setAnthem: (owner: AppearanceOwner, file: File) => Promise<void>;
  reset: (owner: AppearanceOwner, slot: Slot) => Promise<void>;
  /** Reconcilia con la nube. No hace nada sin sesión. */
  sync: () => Promise<void>;
  /**
   * Manda a la nube todas las ranuras de este móvil, refechadas, para que
   * ganen en el resto. Devuelve cuántas han subido, cuántas se han quedado y
   * —si alguna se quedó— por qué.
   */
  pushAll: () => Promise<{ sent: number; failed: number; error?: string }>;
  /**
   * La mitad de fotos y sintonías de la réplica: como `pushAll`, pero además
   * quita de la nube lo que aquí ya no está. Devuelve también cuántas se han
   * quitado, que es lo que distingue una copia de una subida.
   */
  replicateAll: () => Promise<{ sent: number; failed: number; removed: number; error?: string }>;

  syncing: boolean;
  /** Lo que dijo la nube la última vez que el aspecto no llegó entero. */
  error: string | null;
  /** Cuándo se reconcilió por última vez, para poder contarlo. */
  lastSync: string | null;
}

/** La portada que trae la app de fábrica, mientras nadie ponga otra. */
export const DEFAULT_APP_COVER = '/photos/portada.jpg';

/**
 * Cada cuánto se repasa el aspecto con la pestaña a la vista. Más espaciado
 * que el de los hábitos: una foto se cambia una vez al mes, y bajarla cuesta
 * bastante más que bajar una fila. El aviso en tiempo real cubre las prisas.
 */
const POLL_MS = 120_000;

/** Espera mínima entre repasos oportunistas (volver a la ventana, red). */
const THROTTLE_MS = 30_000;

/** Margen tras un aviso de la nube, para no bajar dos veces la misma foto. */
const REALTIME_DEBOUNCE_MS = 1_500;

const AppearanceContext = createContext<AppearanceValue | null>(null);

export function useAppearance(): AppearanceValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance necesita <AppearanceProvider>.');
  return value;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [slots, setSlots] = useState<Record<string, SlotState>>({});
  const [ready, setReady] = useState(false);

  // Las URL vivas, para revocarlas exactamente una vez.
  const urls = useRef<Set<string>>(new Set());

  const publish = useCallback((id: string, blob: Blob, meta: SlotMeta) => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);

    setSlots((previous) => {
      const stale = previous[id]?.url;
      if (stale) {
        URL.revokeObjectURL(stale);
        urls.current.delete(stale);
      }
      return { ...previous, [id]: { url, meta } };
    });
  }, []);

  const withdraw = useCallback((id: string) => {
    setSlots((previous) => {
      const stale = previous[id]?.url;
      if (!stale) return previous;

      URL.revokeObjectURL(stale);
      urls.current.delete(stale);

      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, []);

  // Carga inicial. Se hace en un efecto (no en el render) para que el
  // servidor y el primer pintado del cliente coincidan.
  useEffect(() => {
    let cancelled = false;

    void loadAllSlots().then((stored) => {
      if (cancelled) return;
      for (const [id, { blob, meta }] of Object.entries(stored)) publish(id, blob, meta);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [publish]);

  // Al cerrar la pestaña no queda nada que revocar, pero en desarrollo el
  // montaje doble de StrictMode sí dejaría URL huérfanas.
  useEffect(() => {
    const live = urls.current;
    return () => {
      for (const url of live) URL.revokeObjectURL(url);
      live.clear();
    };
  }, []);

  /** Actualiza los datos de una ranura sin tocar su URL ni el archivo. */
  const annotate = useCallback((id: string, patch: Partial<SlotMeta>) => {
    setSlots((previous) => {
      const current = previous[id];
      if (!current) return previous;
      return { ...previous, [id]: { ...current, meta: { ...current.meta, ...patch } } };
    });
  }, []);

  /** Lo que dijo la nube la última vez que algo del aspecto no llegó. */
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  /**
   * Sube la ranura en segundo plano. Nunca bloquea al usuario: lo elegido ya
   * está guardado en el móvil, y si la subida falla se reintenta sola en la
   * próxima reconciliación (la ranura se queda sin `remotePath`).
   *
   * El motivo del fallo sí se guarda: una foto que no viaja y no lo dice es
   * la manera más fácil de que una casa crea que está en todos los móviles.
   */
  const uploadLater = useCallback(
    (owner: AppearanceOwner, slot: Slot, blob: Blob, meta: SlotMeta) => {
      void pushAppearance(owner, slot, blob, meta)
        .then(async (path) => {
          if (!path) return;
          await markSynced(owner, slot, path);
          annotate(slotKey(owner, slot), { remotePath: path });
          setError(null);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'No ha subido a la nube.');
        });
    },
    [annotate],
  );

  // En ambos casos se publica el Blob que ha quedado guardado, no el archivo
  // original: así lo que se ve es exactamente lo que se ha almacenado.
  const setPhoto = useCallback(
    async (owner: AppearanceOwner, slot: PhotoSlot, file: File) => {
      const { blob, ...meta } = await savePhotoSlot(owner, slot, file);
      publish(slotKey(owner, slot), blob, meta);
      uploadLater(owner, slot, blob, meta);
    },
    [publish, uploadLater],
  );

  const setAnthemFile = useCallback(
    async (owner: AppearanceOwner, file: File) => {
      const { blob, ...meta } = await saveAnthem(owner, file);
      publish(slotKey(owner, 'anthem'), blob, meta);
      uploadLater(owner, 'anthem', blob, meta);
    },
    [publish, uploadLater],
  );

  const reset = useCallback(
    async (owner: AppearanceOwner, slot: Slot) => {
      // Se quita también de la nube: es lo que hace que el resto de móviles
      // vuelvan a lo de fábrica en su próxima sincronización.
      const stored = (await loadAllSlots())[slotKey(owner, slot)];
      const remotePath = stored?.meta.remotePath;

      await clearSlot(owner, slot);
      withdraw(slotKey(owner, slot));

      if (remotePath) {
        try {
          await deleteAppearance(slotKey(owner, slot), remotePath);
        } catch {
          // Sin red se queda en la nube; al volver, el móvil que aún lo tenga
          // lo restaurará. Es preferible a perderlo en todas partes.
        }
      }
    },
    [withdraw],
  );

  /* ------------------------------------------------------------ nube */

  const [syncing, setSyncing] = useState(false);
  /** Evita dos reconciliaciones a la vez (entrar y volver a la pestaña). */
  const running = useRef(false);
  /** Cuándo terminó la última, para no repetirla a cada foco de ventana. */
  const ranAt = useRef(0);

  /**
   * Reconcilia una sola ranura. Devolver el trabajo de cada una a su propia
   * función es lo que permite que un tropiezo —una canción que no sube, un
   * permiso mal puesto— no deje sin reconciliar a las demás.
   */
  const reconcileSlot = useCallback(
    async (
      id: string,
      row: AppearanceRow | undefined,
      mine: LocalSlot | undefined,
      /** Copiando la nube tal cual: no se compara, se obedece. */
      copying = false,
    ) => {
      const [owner, slot] = id.split(':') as [AppearanceOwner, Slot];

      // Réplica en marcha: manda lo que hay arriba. Lo de aquí que no esté
      // allí se quita —aunque no hubiera llegado a subir nunca— y lo que esté
      // allí se baja aunque aquí hubiera algo más reciente.
      if (copying) {
        if (!row) {
          if (mine) {
            await clearSlot(owner, slot);
            withdraw(id);
          }
          return;
        }

        // Ya es el mismo archivo: bajarlo otra vez sólo gastaría datos.
        if (mine && mine.meta.remotePath === row.path && mine.meta.savedAt === row.updated_at) {
          return;
        }
      }

      // Sólo aquí: o es nuevo de este móvil, o lo han quitado en otro.
      if (!row) {
        if (!mine) return;

        if (mine.meta.remotePath) {
          await clearSlot(owner, slot);
          withdraw(id);
          return;
        }

        const path = await pushAppearance(owner, slot, mine.blob, mine.meta);
        if (path) {
          await markSynced(owner, slot, path);
          annotate(id, { remotePath: path });
        }
        return;
      }

      // En ambos sitios: gana la marca más reciente. Se comparan como fechas
      // y no como texto por si alguna quedó guardada con el formato que
      // devolvía Postgres antes de que `lib/cloud.ts` las igualara.
      //
      // En una copia no se compara nada: lo de arriba ya ha ganado.
      if (mine && !copying) {
        const here = Date.parse(mine.meta.savedAt);
        const there = Date.parse(row.updated_at);

        if (here > there) {
          const path = await pushAppearance(owner, slot, mine.blob, mine.meta);
          if (path) {
            await markSynced(owner, slot, path);
            annotate(id, { remotePath: path });
          }
          return;
        }

        if (here === there) {
          // El mismo archivo en los dos lados: sólo falta anotar la ruta.
          if (!mine.meta.remotePath) {
            await markSynced(owner, slot, row.path);
            annotate(id, { remotePath: row.path });
          }
          return;
        }
      }

      // Sólo en la nube, o allí es más nuevo: se baja.
      const blob = await downloadAppearance(row.path);
      if (!blob) return;

      const meta: SlotMeta = {
        name: row.name,
        type: row.mime || blob.type,
        size: row.size || blob.size,
        savedAt: row.updated_at,
        remotePath: row.path,
      };

      await putRemoteSlot(owner, slot, blob, meta);
      publish(id, blob, meta);
    },
    [publish, withdraw, annotate],
  );

  const sync = useCallback(async () => {
    // Sin cuenta no hay nada que reconciliar, y preguntarlo aquí es lo que
    // permite llamar a `sync` sin comprobar antes en quién está la sesión.
    const client = supabase();
    if (!client || running.current) return;

    const { data } = await client.auth.getSession();
    if (!data.session) return;

    running.current = true;
    setSyncing(true);

    // Se apunta el primer tropiezo y se sigue con el resto: que una canción
    // de 8 MB no llegue no puede dejar sin foto a los demás perfiles.
    let failure: string | null = null;
    const note = (cause: unknown) => {
      if (!failure) failure = cause instanceof Error ? cause.message : 'No ha viajado.';
    };

    try {
      // ¿Ha dicho otro aparato «que todos queden igual que este»? Entonces
      // esto no es una reconciliación: es una copia, y lo de aquí que no esté
      // allí se va. La marca la escribe el aparato de origen al terminar su
      // réplica, así que si se ve, sus fotos ya están arriba.
      let mark: ReplicaMark | null = null;
      try {
        mark = await pullReplica();
      } catch {
        // Tabla sin crear: se reconcilia como siempre, mezclando.
      }

      const action = replicaAction(mark, 'aspecto');
      const copying = action === 'adoptar';

      // La primera marca que ve este aparato sólo se apunta: un móvil recién
      // estrenado no puede perder sus fotos por una réplica anterior a él.
      if (mark && action === 'anotar') rememberReplica('aspecto', mark.stamp);

      const [remote, local] = await Promise.all([pullAppearance(), loadAllSlots()]);
      const byId = new Map(remote.map((row) => [row.id, row]));
      const ids = new Set([...byId.keys(), ...Object.keys(local)]);

      for (const id of ids) {
        const mine = local[id];
        try {
          await reconcileSlot(id, byId.get(id), mine, copying);
        } catch (cause) {
          note(cause);
        }
      }

      // Sólo si ha bajado entera: si una canción se quedó por el camino, la
      // copia se vuelve a intentar en el próximo repaso.
      if (copying && mark && !failure) rememberReplica('aspecto', mark.stamp);

      setLastSync(new Date().toISOString());
    } catch (cause) {
      // La personalización es un adorno: si la nube falla, lo local sigue
      // intacto y se reintenta al volver a la pestaña. Pero se dice por qué.
      note(cause);
    } finally {
      setError(failure);
      ranAt.current = Date.now();
      running.current = false;
      setSyncing(false);
    }
  }, [reconcileSlot]);

  /**
   * La mitad de fotos y sintonías de «mandar lo de este móvil»: sube todas
   * las ranuras de aquí con fecha de ahora, de modo que el resto de aparatos
   * se las bajen aunque allí tuvieran otra cosa puesta.
   *
   * No toca lo que en la nube exista y aquí no: quitar una foto sigue siendo
   * cosa de «restaurar la original», que sí la borra de los dos sitios.
   */
  const pushAll = useCallback(async (): Promise<{
    sent: number;
    failed: number;
    error?: string;
  }> => {
    const local = await loadAllSlots();
    let sent = 0;
    let failed = 0;
    let failure: string | undefined;

    for (const [id, mine] of Object.entries(local)) {
      const [owner, slot] = id.split(':') as [AppearanceOwner, Slot];
      const meta: SlotMeta = { ...mine.meta, savedAt: new Date().toISOString() };

      try {
        const path = await pushAppearance(owner, slot, mine.blob, meta);

        if (!path) {
          // Sin cuenta: no es un fallo de la nube, es que aquí no hay sesión.
          failed += 1;
          failure = failure ?? 'No hay sesión en este móvil.';
          continue;
        }

        // La fecha nueva se guarda también aquí: si no, la próxima
        // reconciliación creería que la nube va por delante y se bajaría el
        // mismo archivo que acaba de subir.
        await putRemoteSlot(owner, slot, mine.blob, { ...meta, remotePath: path });
        annotate(id, { ...meta, remotePath: path });
        sent += 1;
      } catch (cause) {
        failed += 1;
        failure = failure ?? (cause instanceof Error ? cause.message : 'No ha subido.');
      }
    }

    setError(failure ?? null);
    return { sent, failed, error: failure };
  }, [annotate]);

  /**
   * La mitad de fotos y sintonías de «dejar todos igual que este». Primero
   * quita de la nube lo que aquí ya no está —una portada retirada, la
   * sintonía de un perfil que se quedó sin ella— y después sube todo lo de
   * aquí refechado, que es lo que `pushAll` ya sabe hacer.
   *
   * Ese primer paso es toda la diferencia: sin él, el móvil que adopte la
   * copia se bajaría de vuelta las fotos que aquí se habían quitado.
   */
  const replicateAll = useCallback(async () => {
    let removed = 0;
    let failure: string | undefined;

    try {
      const [local, remote] = await Promise.all([loadAllSlots(), pullAppearance()]);
      const extra = remote.filter((row) => !local[row.id]);

      if (extra.length > 0) {
        await deleteAppearanceRows(extra.map((row) => ({ id: row.id, path: row.path })));
        removed = extra.length;
      }
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : 'No se ha podido limpiar la nube.';
    }

    const uploaded = await pushAll();
    const error = failure ?? uploaded.error;

    setError(error ?? null);
    return { ...uploaded, removed, error };
  }, [pushAll]);

  /* ------------------------------------------------- cuándo se reconcilia
   *
   * El aspecto se entera de la cuenta por sí mismo en vez de esperar a que
   * los hábitos hayan sincronizado. Antes iba enganchado a la fecha de
   * aquella sincronización, y eso tenía dos costes: si la bajada de los
   * registros fallaba —una tabla sin crear, un momento sin cobertura—, las
   * fotos no bajaban nunca en un móvil recién estrenado; y como esa fecha se
   * actualiza también al guardar, teclear una nota releía IndexedDB entero,
   * canción incluida, cada pocos segundos.
   */

  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const client = supabase();
    if (!client) return;

    void client.auth.getSession().then(({ data }) => setSession(data.session));

    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Primera reconciliación: en cuanto hay cuenta y ya se sabe qué hay aquí.
  useEffect(() => {
    if (!ready || !session) return;
    void sync();
  }, [ready, session, sync]);

  // Repaso mientras la app está a la vista, y al volver a ella o recuperar la
  // cobertura. Sin esto, cambiar una foto en el móvil no se vería en el
  // portátil que lleva la tarde abierto.
  useEffect(() => {
    if (!session) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void sync();
    }, POLL_MS);

    const onWake = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - ranAt.current < THROTTLE_MS) return;
      void sync();
    };

    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [session, sync]);

  // Y el aviso en el momento: cuando otro aparato cambia una foto, Postgres
  // lo anuncia y aquí se baja en un par de segundos, sin recargar. Si el
  // canal no estuviera disponible, el repaso de arriba sigue cubriendo.
  useEffect(() => {
    const client = supabase();
    if (!client || !session) return;

    let timer = 0;
    const wake = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void sync(), REALTIME_DEBOUNCE_MS);
    };

    // También la marca de réplica: es lo último que escribe el aparato que
    // copia, y sin escucharla las fotos tardarían hasta dos minutos en
    // ponerse al día cuando todo lo demás ya habría cambiado.
    const channel = client
      .channel('aspecto')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appearance' }, wake)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replicas' }, wake)
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [session, sync]);

  /** Sustituye en el perfil sólo lo que se haya personalizado. */
  const dress = useCallback(
    (profile: Profile): Profile => {
      const photo = slots[slotKey(profile.id, 'photo')]?.url;
      const hero = slots[slotKey(profile.id, 'hero')]?.url;
      const cover = slots[slotKey(profile.id, 'cover')]?.url;
      const card = slots[slotKey(profile.id, 'card')]?.url;
      const anthem = slots[slotKey(profile.id, 'anthem')];

      if (!photo && !hero && !cover && !card && !anthem) return profile;

      return {
        ...profile,
        photo: photo ?? profile.photo,
        hero: hero ?? profile.hero,
        cover: cover ?? profile.cover,
        card: card ?? profile.card,
        anthem: anthem?.url ?? profile.anthem,
        // El rótulo del botón de silenciar debe decir lo que suena de verdad.
        anthemLabel: anthem ? stripExtension(anthem.meta.name) : profile.anthemLabel,
      };
    },
    [slots],
  );

  const chosenCover = slots[slotKey(APP_OWNER, 'cover')]?.url;

  const value = useMemo<AppearanceValue>(
    () => ({
      ready,
      slots,
      dress,
      appCover: chosenCover ?? DEFAULT_APP_COVER,
      appCoverCustom: Boolean(chosenCover),
      setPhoto,
      setAnthem: setAnthemFile,
      reset,
      sync,
      pushAll,
      replicateAll,
      syncing,
      error,
      lastSync,
    }),
    [
      ready,
      slots,
      dress,
      chosenCover,
      setPhoto,
      setAnthemFile,
      reset,
      sync,
      pushAll,
      replicateAll,
      syncing,
      error,
      lastSync,
    ],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
