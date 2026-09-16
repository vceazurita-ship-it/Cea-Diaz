/* =========================================================================
 *  Leer una captura de pantalla del rastreador, en el propio navegador.
 *
 *  La cuenta gratuita de Footbar no exporta nada: las cifras de cada sesión
 *  se miran en el móvil y ahí se acaban. Teclearlas a mano funciona —es lo
 *  que hace la caja de pegar— pero se sostiene una semana; a la tercera, las
 *  sesiones se quedan sin apuntar. La captura, en cambio, ya está hecha.
 *
 *  El reconocimiento se hace **aquí dentro**, con Tesseract compilado a
 *  WebAssembly. Ni una foto de los críos sale del aparato: no hay servidor
 *  que las reciba, no hay clave que configurar y no hay nada que pagar, que
 *  es la misma regla con la que funciona el resto de la casa cuando no hay
 *  Supabase ni Google. A cambio, lee peor que un servicio de pago —por eso
 *  todo lo que sale de aquí se enseña antes de guardarse y se puede corregir.
 *
 *  Dos cosas que hacen que lea bastante mejor de lo que suele decirse:
 *
 *   1. **Se prepara la imagen antes.** Tesseract está pensado para papel
 *      escaneado: letra oscura sobre fondo claro y grande. Una captura de
 *      una aplicación de móvil es lo contrario —letra clara sobre fondo
 *      oscuro y pequeña—, así que se agranda, se pasa a grises, se invierte
 *      si el fondo es oscuro y se estira el contraste. Sin esta pasada, los
 *      números salen a medias.
 *
 *   2. **Se carga una sola vez.** El motor y el idioma pesan un par de megas
 *      y se quedan en la caché del navegador; la segunda foto y las veinte
 *      siguientes van sin descargar nada.
 *
 *  El módulo de Tesseract se pide con `import()` y sólo cuando alguien
 *  adjunta una foto: quien no use esta pantalla no se descarga nada.
 * ========================================================================= */

import type { Worker } from 'tesseract.js';

/**
 * Idioma del reconocimiento. Sólo castellano y no «castellano + inglés»
 * porque cada idioma es otra descarga, los números —que es lo que importa—
 * se leen igual con cualquiera, y los rótulos que trae la aplicación en
 * inglés los reconoce igual el lector de cifras: `lib/gps.ts` entiende
 * «distance» y «sprints» tan bien como «distancia» y «esprines».
 */
const LANG = 'spa';

/** Lado mayor al que se lleva la imagen antes de leerla. */
const TARGET_SIDE = 1600;

/**
 * El motor, compartido por todas las fotos de la sesión. Se guarda la
 * promesa y no el trabajador para que dos fotos adjuntadas a la vez no
 * arranquen dos motores.
 */
let engine: Promise<Worker> | null = null;

function worker(): Promise<Worker> {
  if (!engine) {
    engine = import('tesseract.js')
      .then(({ createWorker }) => createWorker(LANG))
      .catch((error) => {
        // Si la descarga falla —sin cobertura la primera vez— se olvida, para
        // que el siguiente intento vuelva a probar en vez de fallar para
        // siempre con el mismo error guardado.
        engine = null;
        throw error;
      });
  }

  return engine;
}

/* ---------------------------------------------------------------------------
 * Preparar la imagen
 * ------------------------------------------------------------------------- */

/** La imagen del archivo, por el camino que admita el navegador. */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);

  // Safari viejo: el camino de toda la vida, con su URL temporal.
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('No se ha podido abrir la imagen.'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Deja la captura como le gusta a Tesseract: grande, en grises, con la letra
 * oscura sobre fondo claro y con el contraste estirado de negro a blanco.
 *
 * Lo de invertir no es cosmético. La aplicación del rastreador pinta en modo
 * oscuro, y un número blanco sobre negro le sale a Tesseract como una mancha:
 * invertido, es un número negro sobre blanco, que es lo que sabe leer.
 */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const image = await decode(file);
  const width = 'width' in image ? image.width : 0;
  const height = 'height' in image ? image.height : 0;

  if (!width || !height) throw new Error('La imagen no tiene tamaño.');

  // Se agranda hasta el triple como mucho: más allá no se lee mejor, sólo
  // más despacio, y en el móvil eso se nota.
  const scale = Math.min(3, Math.max(1, TARGET_SIDE / Math.max(width, height)));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Este navegador no deja tratar la imagen.');

  context.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ('close' in image) image.close();

  const picture = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = picture.data;

  // Primera pasada: a grises, y de paso el brillo medio y los extremos.
  let sum = 0;
  let low = 255;
  let high = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const grey = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    pixels[i] = grey;
    sum += grey;
    if (grey < low) low = grey;
    if (grey > high) high = grey;
  }

  const mean = sum / (pixels.length / 4);
  const dark = mean < 128;
  const span = Math.max(1, high - low);

  // Segunda pasada: contraste de extremo a extremo y, si hacía falta, del
  // revés. Se escribe en los tres canales a la vez porque el lienzo sigue
  // siendo de color aunque la imagen ya no lo sea.
  for (let i = 0; i < pixels.length; i += 4) {
    const stretched = ((pixels[i] - low) / span) * 255;
    const value = Math.round(dark ? 255 - stretched : stretched);
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }

  context.putImageData(picture, 0, 0);
  return canvas;
}

/* ---------------------------------------------------------------------------
 * Leer
 * ------------------------------------------------------------------------- */

/**
 * El texto que se reconoce en una captura. Sale tal cual, con sus saltos de
 * línea y sus erratas: interpretarlo es cosa de `readScreen`, en `lib/gps.ts`.
 */
export async function readImage(file: Blob): Promise<string> {
  const prepared = await prepare(file);
  const engine = await worker();
  const { data } = await engine.recognize(prepared);
  return data.text ?? '';
}

/**
 * Suelta el motor. Se llama al salir de la pantalla de fotos: mantenerlo
 * vivo cuesta memoria y un hilo, y volver a arrancarlo ya no descarga nada
 * porque el idioma se queda en la caché del navegador.
 */
export async function releaseOcr(): Promise<void> {
  const pending = engine;
  if (!pending) return;

  engine = null;
  try {
    const current = await pending;
    await current.terminate();
  } catch {
    // Si ni siquiera llegó a arrancar, no hay nada que soltar.
  }
}
