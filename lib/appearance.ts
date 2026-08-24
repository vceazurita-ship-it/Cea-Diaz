/* =========================================================================
 *  Aspecto editable de cada perfil.
 *
 *  Las fotos y la sintonía vienen de fábrica en `public/`, pero cualquiera
 *  puede sustituirlas desde la propia app sin tocar el código ni volver a
 *  desplegar. Lo que se sube vive en IndexedDB como Blob:
 *
 *    · `localStorage` (donde vive la base de hábitos) se llenaría con una
 *      sola canción, y encima dejaría de guardarse lo importante;
 *    · guardar el Blob y no un data URL evita el 33 % que engorda base64
 *      y permite servirlo con `URL.createObjectURL`.
 *
 *  Nada de esto sale del dispositivo: es una capa por encima del perfil de
 *  fábrica, así que borrarla siempre devuelve la app a su estado original.
 * ========================================================================= */

import type { ProfileId } from '@/types';

/**
 * De quién es la ranura. Casi siempre de un perfil, pero la portada de la
 * pantalla de inicio no es de nadie en concreto: es de la app, y por eso
 * existe este dueño de más. En la nube es un `profile_id` más —la columna
 * no tiene clave ajena—, así que se sincroniza sin ningún caso especial.
 */
export const APP_OWNER = 'app';
export type AppearanceOwner = ProfileId | typeof APP_OWNER;

/** Ranuras que se pueden sustituir. */
export type PhotoSlot = 'photo' | 'hero' | 'cover' | 'card';
export type Slot = PhotoSlot | 'anthem';

export const PHOTO_SLOTS: PhotoSlot[] = ['photo', 'hero', 'cover', 'card'];

/** Lado mayor al que se reduce cada tipo de foto antes de guardarla. */
const MAX_SIDE: Record<PhotoSlot, number> = {
  photo: 480, // retrato: se pinta como mucho a 160 px
  hero: 1400, // foto a sangre de la cabecera
  cover: 1400,
  card: 900, // cromo
};

/** A cuánto se reduce cada ranura. Lo usa también el recorte previo. */
export function photoMaxSide(slot: PhotoSlot): number {
  return MAX_SIDE[slot];
}

/** Una canción de más de 8 MB no cabe en un móvil con dignidad. */
export const MAX_ANTHEM_BYTES = 8 * 1024 * 1024;

export interface SlotMeta {
  /** Nombre del archivo original, para poder rotularlo en el editor. */
  name: string;
  type: string;
  size: number;
  /** Versión: en la sincronización gana la marca más reciente. */
  savedAt: string;
  /**
   * Ruta dentro del cubo `aspecto`, si esta ranura ya ha viajado a la nube.
   * Su presencia es lo que distingue «subido y luego borrado en otro móvil»
   * (hay que quitarlo aquí) de «recién elegido aquí» (hay que subirlo).
   */
  remotePath?: string;
}

export interface StoredSlot extends SlotMeta {
  blob: Blob;
}

/* ---------------------------------------------------------------- almacén */

const DB_NAME = 'habitos-familia-aspecto';
const DB_VERSION = 1;
const STORE = 'ranuras';

function key(owner: AppearanceOwner, slot: Slot): string {
  return `${owner}:${slot}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no guarda personalizaciones.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se ha podido abrir el almacén.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDatabase();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error ?? new Error('Operación rechazada.'));
    });
  } finally {
    db.close();
  }
}

/* --------------------------------------------------------- preparación */

/** Reduce la imagen a la medida de su ranura y la devuelve como JPEG. */
async function shrinkImage(file: File, slot: PhotoSlot): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  try {
    const maxSide = MAX_SIDE[slot];
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('El navegador no permite procesar la imagen.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob) throw new Error('No se ha podido convertir la imagen.');
    return blob;
  } finally {
    bitmap.close();
  }
}

/* ------------------------------------------------------------- operaciones */

/**
 * Guarda una foto en la ranura indicada, reducida al tamaño en que se pinta.
 * Devuelve los datos de lo guardado para poder rotularlo sin releer.
 */
export async function savePhotoSlot(
  owner: AppearanceOwner,
  slot: PhotoSlot,
  file: File,
): Promise<StoredSlot> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Ese archivo no es una imagen.');
  }

  const blob = await shrinkImage(file, slot);
  const meta: SlotMeta = {
    name: file.name,
    type: blob.type,
    size: blob.size,
    savedAt: new Date().toISOString(),
  };

  const stored: StoredSlot = { ...meta, blob };
  await withStore<void>('readwrite', (store) => store.put(stored, key(owner, slot)));
  return stored;
}

/** Guarda la sintonía del perfil tal cual: reconvertir audio en el móvil no compensa. */
export async function saveAnthem(owner: AppearanceOwner, file: File): Promise<StoredSlot> {
  if (!file.type.startsWith('audio/')) {
    throw new Error('Ese archivo no es un audio.');
  }
  if (file.size > MAX_ANTHEM_BYTES) {
    throw new Error(
      `La canción ocupa ${Math.round(file.size / 1024 / 1024)} MB; el máximo son ${
        MAX_ANTHEM_BYTES / 1024 / 1024
      } MB.`,
    );
  }

  const meta: SlotMeta = {
    name: file.name,
    type: file.type,
    size: file.size,
    savedAt: new Date().toISOString(),
  };

  const stored: StoredSlot = { ...meta, blob: file };
  await withStore<void>('readwrite', (store) => store.put(stored, key(owner, 'anthem')));
  return stored;
}

/** Quita la personalización de una ranura: el perfil vuelve a lo de fábrica. */
export async function clearSlot(owner: AppearanceOwner, slot: Slot): Promise<void> {
  try {
    await withStore<void>('readwrite', (store) => store.delete(key(owner, slot)));
  } catch {
    // Si no se puede borrar, lo de fábrica sigue estando debajo intacto.
  }
}

/** Todo lo personalizado, en un solo viaje al abrir la app. */
export async function loadAllSlots(): Promise<
  Record<string, { blob: Blob; meta: SlotMeta }>
> {
  try {
    const db = await openDatabase();

    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readonly');
        const store = transaction.objectStore(STORE);
        const keys = store.getAllKeys();
        const values = store.getAll();

        transaction.oncomplete = () => {
          const out: Record<string, { blob: Blob; meta: SlotMeta }> = {};
          (keys.result as IDBValidKey[]).forEach((id, index) => {
            const stored = (values.result as StoredSlot[])[index];
            if (!stored?.blob) return;
            const { blob, ...meta } = stored;
            out[String(id)] = { blob, meta };
          });
          resolve(out);
        };
        transaction.onerror = () => reject(transaction.error ?? new Error('Lectura rechazada.'));
      });
    } finally {
      db.close();
    }
  } catch {
    // Sin IndexedDB (modo privado, navegador antiguo) simplemente no hay
    // personalización: la app se pinta con las fotos de fábrica.
    return {};
  }
}

export { key as slotKey };

/* --------------------------------------------------------- sincronización */

/**
 * Guarda tal cual lo que viene de la nube, sin volver a reducirlo: ya se
 * redujo en el móvil que lo subió, y reprocesarlo degradaría la imagen una
 * vez por dispositivo.
 */
export async function putRemoteSlot(
  owner: AppearanceOwner,
  slot: Slot,
  blob: Blob,
  meta: SlotMeta,
): Promise<void> {
  const stored: StoredSlot = { ...meta, blob };
  await withStore<void>('readwrite', (store) => store.put(stored, key(owner, slot)));
}

/** Anota que una ranura ya está en la nube, sin tocar el archivo. */
export async function markSynced(
  owner: AppearanceOwner,
  slot: Slot,
  remotePath: string,
): Promise<void> {
  const id = key(owner, slot);
  const stored = await withStore<StoredSlot | undefined>('readonly', (store) => store.get(id));
  if (!stored) return;

  await withStore<void>('readwrite', (store) => store.put({ ...stored, remotePath }, id));
}
