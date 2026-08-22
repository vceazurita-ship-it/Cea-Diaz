/* =========================================================================
 *  Fotos de comida: reducción en el móvil y miniaturas en IndexedDB.
 *
 *  La foto original no se sube nunca entera: se reduce en el propio móvil
 *  antes de enviarla (menos datos, menos coste y menos espera). De la
 *  miniatura se guarda una copia local en IndexedDB, porque `localStorage`
 *  —donde vive el resto de la base— se llenaría en dos semanas.
 * ========================================================================= */

/** Lado mayor de la imagen que se manda a analizar. */
const ANALYSIS_SIZE = 1024;
/** Lado mayor de la miniatura que se guarda en el dispositivo. */
const THUMB_SIZE = 320;

export interface PreparedPhoto {
  /** JPEG en base64 (sin el prefijo `data:`) listo para la API. */
  analysis: string;
  /** Miniatura como data URL, lista para `<img src>` y para guardar. */
  thumb: string;
}

/** Dibuja la imagen reducida y la devuelve como data URL. */
function toDataUrl(source: ImageBitmap, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));

  const context = canvas.getContext('2d');
  if (!context) throw new Error('El navegador no permite procesar la imagen.');

  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Quita el prefijo `data:image/jpeg;base64,` que la API no quiere. */
export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** Reduce la foto elegida a las dos versiones que necesita la app. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file);
  try {
    return {
      analysis: stripDataUrl(toDataUrl(bitmap, ANALYSIS_SIZE, 0.82)),
      thumb: toDataUrl(bitmap, THUMB_SIZE, 0.7),
    };
  } finally {
    bitmap.close();
  }
}

/* ---------------------------------------------------------------------------
 * Almacén de miniaturas
 * ------------------------------------------------------------------------- */

const DB_NAME = 'habitos-familia-fotos';
const DB_VERSION = 1;
const STORE = 'miniaturas';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no guarda fotos.'));
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

/** Ejecuta una operación sobre el almacén y cierra la conexión al terminar. */
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

export async function savePhoto(id: string, thumb: string): Promise<void> {
  await withStore<void>('readwrite', (store) => store.put(thumb, id));
}

/** Devuelve la miniatura o `null` si ya no está (otro dispositivo, datos borrados). */
export async function loadPhoto(id: string): Promise<string | null> {
  try {
    return (await withStore<string | undefined>('readonly', (store) => store.get(id))) ?? null;
  } catch {
    return null;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  try {
    await withStore<void>('readwrite', (store) => store.delete(id));
  } catch {
    // Si no se puede borrar, no vale la pena molestar: ocupa 25 KB.
  }
}

/**
 * Borra las miniaturas que ya no pertenecen a ninguna comida. Se llama al
 * arrancar: es el momento en que nada está pendiente de deshacerse, así que
 * lo que sobra, sobra de verdad (borrados, importaciones, reinicios).
 */
export async function prunePhotos(validIds: string[]): Promise<number> {
  try {
    const keep = new Set(validIds);
    const stored = await withStore<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
    const orphans = stored.filter((key) => !keep.has(String(key)));

    for (const key of orphans) await deletePhoto(String(key));
    return orphans.length;
  } catch {
    return 0;
  }
}
