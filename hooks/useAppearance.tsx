'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  clearSlot,
  loadAllSlots,
  markSynced,
  putRemoteSlot,
  saveAnthem,
  savePhotoSlot,
  slotKey,
  type PhotoSlot,
  type Slot,
  type SlotMeta,
} from '@/lib/appearance';
import {
  deleteAppearance,
  downloadAppearance,
  pullAppearance,
  pushAppearance,
} from '@/lib/cloud';
import type { Profile, ProfileId } from '@/types';

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

interface AppearanceValue {
  /** `false` hasta que se lee IndexedDB; hasta entonces manda lo de fábrica. */
  ready: boolean;
  /** Personalizaciones por clave `${profileId}:${slot}`. */
  slots: Record<string, SlotState>;
  /** Perfil con sus fotos y sintonía sustituidas donde las haya. */
  dress: (profile: Profile) => Profile;
  setPhoto: (profileId: ProfileId, slot: PhotoSlot, file: File) => Promise<void>;
  setAnthem: (profileId: ProfileId, file: File) => Promise<void>;
  reset: (profileId: ProfileId, slot: Slot) => Promise<void>;
  /** Reconcilia con la nube. No hace nada sin sesión. */
  sync: () => Promise<void>;
  syncing: boolean;
}

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

  /**
   * Sube la ranura en segundo plano. Nunca bloquea al usuario: lo elegido ya
   * está guardado en el móvil, y si la subida falla se reintenta sola en la
   * próxima reconciliación (la ranura se queda sin `remotePath`).
   */
  const uploadLater = useCallback(
    (profileId: ProfileId, slot: Slot, blob: Blob, meta: SlotMeta) => {
      void pushAppearance(profileId, slot, blob, meta)
        .then(async (path) => {
          if (!path) return;
          await markSynced(profileId, slot, path);
          annotate(slotKey(profileId, slot), { remotePath: path });
        })
        .catch(() => undefined);
    },
    [annotate],
  );

  // En ambos casos se publica el Blob que ha quedado guardado, no el archivo
  // original: así lo que se ve es exactamente lo que se ha almacenado.
  const setPhoto = useCallback(
    async (profileId: ProfileId, slot: PhotoSlot, file: File) => {
      const { blob, ...meta } = await savePhotoSlot(profileId, slot, file);
      publish(slotKey(profileId, slot), blob, meta);
      uploadLater(profileId, slot, blob, meta);
    },
    [publish, uploadLater],
  );

  const setAnthemFile = useCallback(
    async (profileId: ProfileId, file: File) => {
      const { blob, ...meta } = await saveAnthem(profileId, file);
      publish(slotKey(profileId, 'anthem'), blob, meta);
      uploadLater(profileId, 'anthem', blob, meta);
    },
    [publish, uploadLater],
  );

  const reset = useCallback(
    async (profileId: ProfileId, slot: Slot) => {
      // Se quita también de la nube: es lo que hace que el resto de móviles
      // vuelvan a lo de fábrica en su próxima sincronización.
      const stored = (await loadAllSlots())[slotKey(profileId, slot)];
      const remotePath = stored?.meta.remotePath;

      await clearSlot(profileId, slot);
      withdraw(slotKey(profileId, slot));

      if (remotePath) {
        try {
          await deleteAppearance(slotKey(profileId, slot), remotePath);
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

  const sync = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);

    try {
      const [remote, local] = await Promise.all([pullAppearance(), loadAllSlots()]);
      const byId = new Map(remote.map((row) => [row.id, row]));
      const ids = new Set([...byId.keys(), ...Object.keys(local)]);

      for (const id of ids) {
        const row = byId.get(id);
        const mine = local[id];
        const [profileId, slot] = id.split(':') as [ProfileId, Slot];

        // Sólo aquí: o es nuevo de este móvil, o lo han quitado en otro.
        if (!row) {
          if (!mine) continue;

          if (mine.meta.remotePath) {
            await clearSlot(profileId, slot);
            withdraw(id);
          } else {
            const path = await pushAppearance(profileId, slot, mine.blob, mine.meta);
            if (path) {
              await markSynced(profileId, slot, path);
              annotate(id, { remotePath: path });
            }
          }
          continue;
        }

        // En ambos sitios: gana la marca más reciente. Se comparan como fechas
        // y no como texto porque Postgres devuelve `+00:00` donde
        // `toISOString()` pone `Z`: el mismo instante no se escribe igual, y
        // comparando cadenas lo de aquí parecería siempre más nuevo.
        if (mine) {
          const here = Date.parse(mine.meta.savedAt);
          const there = Date.parse(row.updated_at);

          if (here > there) {
            const path = await pushAppearance(profileId, slot, mine.blob, mine.meta);
            if (path) {
              await markSynced(profileId, slot, path);
              annotate(id, { remotePath: path });
            }
            continue;
          }
          if (here === there) {
            // El mismo archivo en los dos lados: sólo falta anotar la ruta.
            if (!mine.meta.remotePath) {
              await markSynced(profileId, slot, row.path);
              annotate(id, { remotePath: row.path });
            }
            continue;
          }
        }

        // Sólo en la nube, o allí es más nuevo: se baja.
        const blob = await downloadAppearance(row.path);
        if (!blob) continue;

        const meta: SlotMeta = {
          name: row.name,
          type: row.mime || blob.type,
          size: row.size || blob.size,
          savedAt: row.updated_at,
          remotePath: row.path,
        };
        await putRemoteSlot(profileId, slot, blob, meta);
        publish(id, blob, meta);
      }
    } catch {
      // La personalización es un adorno: si la nube falla, lo local sigue
      // intacto y se reintenta al volver a la pestaña.
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, [publish, withdraw, annotate]);

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

  const value = useMemo<AppearanceValue>(
    () => ({ ready, slots, dress, setPhoto, setAnthem: setAnthemFile, reset, sync, syncing }),
    [ready, slots, dress, setPhoto, setAnthemFile, reset, sync, syncing],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
