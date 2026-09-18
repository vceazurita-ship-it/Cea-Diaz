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
 *  Tres cosas que hacen que lea bastante mejor de lo que suele decirse:
 *
 *   1. **Se prepara la imagen antes.** Tesseract está pensado para papel
 *      escaneado: letra oscura sobre fondo claro y grande. Una captura de
 *      una aplicación de móvil es lo contrario —letra clara sobre fondo
 *      oscuro y pequeña—, así que se agranda, se pasa a grises, se invierte
 *      si el fondo es oscuro y **se separa la letra del fondo comparando
 *      cada punto con su propio vecindario**, no con el brillo medio de la
 *      captura entera. Esto último es lo que arregla las pantallas del
 *      rastreador: su tarjeta de cifras es un degradado con un resplandor en
 *      una esquina, y un único umbral para toda la imagen dejaba media
 *      tarjeta lavada y la otra media empastada.
 *
 *   2. **Se le dice qué está mirando.** Que es un bloque de texto con
 *      renglones (y no una página de periódico con columnas que reordenar),
 *      que los espacios entre palabras importan —la pantalla va en dos
 *      columnas y esos espacios son lo que las separa— y a cuántos puntos
 *      por pulgada está, para que no lo tenga que adivinar.
 *
 *   3. **Se carga una sola vez.** El motor y el idioma pesan un par de megas
 *      y se quedan en la caché del navegador; la segunda foto y las veinte
 *      siguientes van sin descargar nada.
 *
 *  El módulo de Tesseract se pide con `import()` y sólo cuando alguien
 *  adjunta una foto: quien no use esta pantalla no se descarga nada.
 * ========================================================================= */

import type { PSM, Worker } from 'tesseract.js';

/**
 * Idioma del reconocimiento. Sólo castellano y no «castellano + inglés»
 * porque cada idioma es otra descarga, los números —que es lo que importa—
 * se leen igual con cualquiera, y los rótulos que trae la aplicación en
 * inglés los reconoce igual el lector de cifras: `lib/gps.ts` entiende
 * «distance» y «accelerations» tan bien como «distancia» y «aceleraciones».
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

/**
 * Lo que se le dice al motor antes de mirar una captura.
 *
 *  · `6` es «un bloque de texto uniforme, en renglones». El modo de fábrica
 *    —el automático— se pone a buscar columnas y bloques, y con la tarjeta de
 *    cifras del rastreador a veces devolvía los renglones desordenados, que
 *    es lo único que el lector de `lib/gps.ts` no puede arreglar: si el orden
 *    de los renglones se rompe, los rótulos y sus números dejan de casar.
 *  · los espacios entre palabras se conservan porque la pantalla va en dos
 *    columnas y el hueco del medio es lo que las separa.
 *  · y los puntos por pulgada se declaran para que no los estime: una captura
 *    de móvil no trae esa información y estimarla mal le hace tratar la letra
 *    como si fuera más pequeña de lo que es.
 */
const PARAMS = {
  // El '6' es el constante SINGLE_BLOCK. Va como literal con su tipo y no
  // importando `PSM`: importar algo de tesseract de verdad se traería el
  // motor entero al paquete, y la gracia es que sólo se descargue al
  // adjuntar una foto.
  tessedit_pageseg_mode: '6' as PSM,
  preserve_interword_spaces: '1',
  user_defined_dpi: '300',
};

function worker(): Promise<Worker> {
  if (!engine) {
    engine = import('tesseract.js')
      .then(({ createWorker }) => createWorker(LANG))
      .then(async (created) => {
        await created.setParameters(PARAMS);
        return created;
      })
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
  const ancho = canvas.width;
  const alto = canvas.height;
  const count = ancho * alto;

  // Primera pasada: a grises —en su propio array, que es la mitad de memoria
  // y se recorre cuatro veces más rápido que el lienzo— y de paso el brillo
  // medio, que es lo que dice si la captura estaba en modo oscuro.
  const grey = new Uint8Array(count);
  let sum = 0;

  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    const value = (299 * pixels[p] + 587 * pixels[p + 1] + 114 * pixels[p + 2]) / 1000;
    grey[i] = value;
    sum += value;
  }

  // Modo oscuro: se invierte para que la letra quede negra sobre blanco, que
  // es lo único que Tesseract sabe leer bien.
  if (sum / count < 128) {
    for (let i = 0; i < count; i += 1) grey[i] = 255 - grey[i];
  }

  // Segunda pasada: umbral local. Cada punto se compara con la media de su
  // vecindario, no con la de la imagen entera, y por eso funciona sobre un
  // fondo con degradado y con un resplandor en una esquina —que es
  // exactamente la tarjeta de cifras del rastreador—.
  //
  // La media del vecindario sale de una **imagen integral**: una tabla de
  // sumas acumuladas con la que la suma de cualquier rectángulo son cuatro
  // lecturas y tres restas, así que el coste no depende del tamaño de la
  // ventana. Sin ella, una ventana de cuarenta píxeles sobre una captura de
  // móvil agrandada eran mil millones de sumas y el móvil se quedaba colgado.
  const integral = new Float64Array((ancho + 1) * (alto + 1));

  for (let y = 0; y < alto; y += 1) {
    let row = 0;
    for (let x = 0; x < ancho; x += 1) {
      row += grey[y * ancho + x];
      integral[(y + 1) * (ancho + 1) + (x + 1)] =
        integral[y * (ancho + 1) + (x + 1)] + row;
    }
  }

  /** Radio del vecindario: del tamaño de un renglón, que es lo que agrupa. */
  const radius = Math.max(8, Math.round(Math.min(ancho, alto) / 40));

  /**
   * Cuánto más oscuro que su vecindario tiene que ser un punto para contar
   * como letra. Un 15 % es el valor de siempre para este método: más bajo
   * ensucia el fondo de puntos negros, más alto se come los trazos finos.
   */
  const MARGEN = 0.15;

  for (let y = 0; y < alto; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(alto - 1, y + radius);

    for (let x = 0; x < ancho; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(ancho - 1, x + radius);

      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const box =
        integral[(y1 + 1) * (ancho + 1) + (x1 + 1)] -
        integral[y0 * (ancho + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (ancho + 1) + x0] +
        integral[y0 * (ancho + 1) + x0];

      const value = grey[y * ancho + x] * area < box * (1 - MARGEN) ? 0 : 255;

      const p = (y * ancho + x) * 4;
      pixels[p] = value;
      pixels[p + 1] = value;
      pixels[p + 2] = value;
      pixels[p + 3] = 255;
    }
  }

  context.putImageData(picture, 0, 0);
  return canvas;
}

/* ---------------------------------------------------------------------------
 * Leer
 * ------------------------------------------------------------------------- */

/** Cuántos grupos de dígitos trae un texto. Es la medida de si se ha leído. */
function digits(text: string): number {
  return (text.match(/\d+/g) ?? []).length;
}

/**
 * El texto que se reconoce en una captura. Sale tal cual, con sus saltos de
 * línea y sus erratas: interpretarlo es cosa de `readScreen`, en `lib/gps.ts`.
 *
 * Y con **segunda pasada si la primera sale pobre**. El modo de renglones es
 * el bueno para la tarjeta de cifras del rastreador, pero no para todas las
 * pantallas de su aplicación: algunas reparten los números por el cuadro y ahí
 * el modo de texto disperso lee lo que el otro no ve. Así que si de la primera
 * salen menos de cuatro números —una sesión trae seis o siete— se prueba con
 * el otro modo y se queda el que más haya leído.
 *
 * Sólo cuando hace falta: la segunda pasada cuesta otro tanto de lo que costó
 * la primera, y en la captura normal no se llega a pedir.
 */
export async function readImage(file: Blob): Promise<string> {
  const prepared = await prepare(file);
  const engine = await worker();

  const first = (await engine.recognize(prepared)).data.text ?? '';
  if (digits(first) >= 4) return first;

  try {
    await engine.setParameters({ tessedit_pageseg_mode: '11' as PSM });
    const second = (await engine.recognize(prepared)).data.text ?? '';
    return digits(second) > digits(first) ? second : first;
  } catch {
    return first;
  } finally {
    // El motor se queda vivo entre fotos, así que hay que devolverlo a su
    // modo de siempre o la siguiente captura se leería con el de rescate.
    await engine.setParameters(PARAMS).catch(() => undefined);
  }
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
