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

/** Una canción de más de 8 MB no cabe en un móvil con dignidad. */
export const MAX_ANTHEM_BYTES = 8 * 1024 * 1024;

export interface SlotMeta {
  /** Nombre del archivo original, para poder rotularlo en el editor. */
  name: string;
  type: string;
  size: number;
  savedAt: string;
}

export interface StoredSlot extends SlotMeta {
  blob: Blob;
}

/* ---------------------------------------------------------------- almacén */

const DB_NAME = 'habitos-familia-aspecto';
const DB_VERSION = 1;
const STORE = 'ranuras';

function key(profileId: ProfileId, slot: Slot): string {
  return `${profileId}:${slot}`;
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
  profileId: ProfileId,
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
  await withStore<void>('readwrite', (store) => store.put(stored, key(profileId, slot)));
  return stored;
}

/** Guarda la sintonía del perfil tal cual: reconvertir audio en el móvil no compensa. */
export async function saveAnthem(profileId: ProfileId, file: File): Promise<StoredSlot> {
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
  await withStore<void>('readwrite', (store) => store.put(stored, key(profileId, 'anthem')));
  return stored;
}

/** Quita la personalización de una ranura: el perfil vuelve a lo de fábrica. */
export async function clearSlot(profileId: ProfileId, slot: Slot): Promise<void> {
  try {
    await withStore<void>('readwrite', (store) => store.delete(key(profileId, slot)));
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
