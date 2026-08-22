'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  clearSlot,
  loadAllSlots,
  saveAnthem,
  savePhotoSlot,
  slotKey,
  type PhotoSlot,
  type Slot,
  type SlotMeta,
} from '@/lib/appearance';
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

  // En ambos casos se publica el Blob que ha quedado guardado, no el archivo
  // original: así lo que se ve es exactamente lo que se ha almacenado.
  const setPhoto = useCallback(
    async (profileId: ProfileId, slot: PhotoSlot, file: File) => {
      const { blob, ...meta } = await savePhotoSlot(profileId, slot, file);
      publish(slotKey(profileId, slot), blob, meta);
    },
    [publish],
  );

  const setAnthemFile = useCallback(
    async (profileId: ProfileId, file: File) => {
      const { blob, ...meta } = await saveAnthem(profileId, file);
      publish(slotKey(profileId, 'anthem'), blob, meta);
    },
    [publish],
  );

  const reset = useCallback(
    async (profileId: ProfileId, slot: Slot) => {
      await clearSlot(profileId, slot);
      withdraw(slotKey(profileId, slot));
    },
    [withdraw],
  );

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
    () => ({ ready, slots, dress, setPhoto, setAnthem: setAnthemFile, reset }),
    [ready, slots, dress, setPhoto, setAnthemFile, reset],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
