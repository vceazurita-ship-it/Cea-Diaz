import * as THREE from 'three';

/* =========================================================================
 *  Las texturas del estadio en 3D, pintadas a mano en un lienzo.
 *
 *  No se descarga ninguna imagen: el césped con sus franjas de cortacésped,
 *  la grada con su público, las vallas de publicidad, el balón y la red se
 *  dibujan aquí al montar la escena. Así el juego pesa lo mismo que antes y
 *  funciona sin red, y el repositorio —que es público— no lleva fotos.
 * ========================================================================= */

function lienzo(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')!];
}

function textura(canvas: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

/** Un azar con semilla: la grada sale igual cada vez, y no parpadea al repintar. */
export function azar(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------------------------------------------------------------------------
 * El césped
 *
 * Medidas reales: el lienzo cubre 64 × 44 metros —del fondo de la portería
 * hasta pasado el punto de penalti, y de banda a banda del área con
 * margen—. Las líneas van a su sitio de verdad: área grande de 16,5 m, área
 * pequeña de 5,5 m, punto a 11 m y el arco a 9,15 m del punto.
 * ------------------------------------------------------------------------- */

export const CESPED = { ancho: 64, fondo: 44, detras: 8 };

export function texturaCesped(): THREE.CanvasTexture {
  const px = 28; // píxeles por metro
  const W = CESPED.ancho * px;
  const H = CESPED.fondo * px;
  const [canvas, g] = lienzo(W, H);

  // La z del mundo va de -detras (detrás de la portería) a fondo-detras.
  const X = (x: number) => (x + CESPED.ancho / 2) * px;
  const Z = (z: number) => (z + CESPED.detras) * px;

  // Franjas de cortacésped, paralelas a la línea de gol, de 2,75 m.
  for (let i = 0; i * 2.75 < CESPED.fondo; i += 1) {
    g.fillStyle = i % 2 === 0 ? '#2f8f3f' : '#28803a';
    g.fillRect(0, i * 2.75 * px, W, 2.75 * px + 1);
  }
  // Grano: miles de briznas con dos verdes, para que de cerca no sea plástico.
  const r = azar(7);
  for (let i = 0; i < 26000; i += 1) {
    g.fillStyle = r() < 0.5 ? 'rgba(18,70,28,0.18)' : 'rgba(120,200,110,0.10)';
    g.fillRect(r() * W, r() * H, 2, 3 + r() * 3);
  }
  // La zona del punto y de la boca de gol, más gastada.
  const gastado = (x: number, z: number, rad: number, a: number) => {
    const grad = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), rad * px);
    grad.addColorStop(0, `rgba(120,98,60,${a})`);
    grad.addColorStop(1, 'rgba(120,98,60,0)');
    g.fillStyle = grad;
    g.fillRect(X(x) - rad * px, Z(z) - rad * px, rad * 2 * px, rad * 2 * px);
  };
  gastado(0, 11, 1.4, 0.35);
  gastado(0, 1.2, 2.2, 0.28);
  gastado(0, 0.2, 1.4, 0.3);

  g.strokeStyle = 'rgba(250,250,245,0.92)';
  g.lineWidth = 0.12 * px;
  g.lineCap = 'butt';
  const linea = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([x, z], i) => (i === 0 ? g.moveTo(X(x), Z(z)) : g.lineTo(X(x), Z(z))));
    g.stroke();
  };
  linea([[-CESPED.ancho / 2, 0], [CESPED.ancho / 2, 0]]); // línea de gol
  linea([[-20.16, 0], [-20.16, 16.5], [20.16, 16.5], [20.16, 0]]); // área grande
  linea([[-9.16, 0], [-9.16, 5.5], [9.16, 5.5], [9.16, 0]]); // área pequeña
  // El arco del área: la parte del círculo de 9,15 m que queda fuera.
  const a = Math.acos(5.5 / 9.15);
  g.beginPath();
  g.arc(X(0), Z(11), 9.15 * px, Math.PI / 2 - a, Math.PI / 2 + a);
  g.stroke();
  // El punto.
  g.fillStyle = '#fbfbf6';
  g.beginPath();
  g.arc(X(0), Z(11), 0.16 * px, 0, Math.PI * 2);
  g.fill();

  return textura(canvas);
}

/* ---------------------------------------------------------------------------
 * La grada: filas de cabezas y camisetas, con los colores de casa de sobra.
 * ------------------------------------------------------------------------- */

export function texturaPublico(colores: string[], seed = 3): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const [canvas, g] = lienzo(W, H);
  g.fillStyle = '#1a2233';
  g.fillRect(0, 0, W, H);
  const r = azar(seed);
  const filas = 8;
  const alto = H / filas;
  const paleta = [...colores, ...colores, '#e5e7eb', '#1f2937', '#dc2626', '#2563eb', '#f59e0b', '#16a34a', '#a855f7'];
  const pieles = ['#f1c9a5', '#e0ac85', '#c68a62', '#8d5a3b', '#f6d7bb'];
  for (let f = 0; f < filas; f += 1) {
    // El escalón de hormigón.
    g.fillStyle = f % 2 ? '#273248' : '#222c40';
    g.fillRect(0, f * alto + alto * 0.78, W, alto * 0.22);
    const paso = 13;
    for (let x = (f % 2) * 6; x < W; x += paso + r() * 3) {
      if (r() < 0.06) continue; // algún asiento vacío
      const y = f * alto + alto * 0.22 + r() * 3;
      g.fillStyle = paleta[Math.floor(r() * paleta.length)];
      g.beginPath();
      g.roundRect(x, y + 8, 11, alto * 0.62, 3);
      g.fill();
      g.fillStyle = pieles[Math.floor(r() * pieles.length)];
      g.beginPath();
      g.arc(x + 5.5, y + 5, 4.6, 0, Math.PI * 2);
      g.fill();
      if (r() < 0.18) {
        // Brazos arriba, o una bufanda.
        g.fillStyle = paleta[Math.floor(r() * paleta.length)];
        g.fillRect(x - 2, y + 9, 15, 3);
      }
    }
  }
  return textura(canvas, [3, 1]);
}

/* ---------------------------------------------------------------------------
 * Las vallas de publicidad: LED, con los nombres de la serie y de casa.
 * ------------------------------------------------------------------------- */

export function texturaVallas(lemas: { texto: string; fondo: string; tinta: string }[]): THREE.CanvasTexture {
  const panel = 512;
  const W = panel * lemas.length;
  const H = 96;
  const [canvas, g] = lienzo(W, H);
  lemas.forEach((lema, i) => {
    const x0 = i * panel;
    g.fillStyle = lema.fondo;
    g.fillRect(x0, 0, panel, H);
    // Un brillo de pantalla y la rejilla de LED.
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x0, 0, panel, H);
    g.fillStyle = lema.tinta;
    g.font = 'italic 900 58px system-ui, "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(lema.texto, x0 + panel / 2, H / 2 + 3, panel - 40);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x0 + panel - 4, 0, 4, H);
  });
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  const tex = textura(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/* ---------------------------------------------------------------------------
 * El balón: blanco con los pentágonos negros del de toda la vida.
 * ------------------------------------------------------------------------- */

export function texturaBalon(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [canvas, g] = lienzo(W, H);
  g.fillStyle = '#f7f7f4';
  g.fillRect(0, 0, W, H);
  const pentagono = (cx: number, cy: number, rx: number, ry: number) => {
    g.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  };
  g.fillStyle = '#16161a';
  // Una fila en el ecuador y dos más estiradas hacia los polos (la
  // proyección equirrectangular las ensancha allí, que es lo que toca).
  for (let i = 0; i < 5; i += 1) {
    pentagono(i * (W / 5) + W / 10, H / 2, 26, 26);
    pentagono(i * (W / 5), H * 0.2, 44, 22);
    pentagono(i * (W / 5) + W / 10, H * 0.8, 44, 22);
  }
  pentagono(W / 2, 6, 300, 10);
  pentagono(W / 2, H - 6, 300, 10);
  // Las costuras.
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 10; i += 1) {
    g.beginPath();
    g.moveTo((i * W) / 10, 0);
    g.lineTo((i * W) / 10 + 25, H);
    g.stroke();
  }
  return textura(canvas);
}

/* ---------------------------------------------------------------------------
 * La red: una malla de rombos blancos sobre transparente.
 * ------------------------------------------------------------------------- */

export function texturaRed(repeat: [number, number]): THREE.CanvasTexture {
  const S = 64;
  const [canvas, g] = lienzo(S, S);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, S / 2);
  g.lineTo(S / 2, 0);
  g.lineTo(S, S / 2);
  g.lineTo(S / 2, S);
  g.closePath();
  g.stroke();
  const tex = textura(canvas, repeat);
  return tex;
}

/* ---------------------------------------------------------------------------
 * El dorsal: nombre y número a la espalda, como en la tele.
 * ------------------------------------------------------------------------- */

export function texturaDorsal(opts: { kit: string; tinta: string; nombre: string; numero: string }): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const [canvas, g] = lienzo(W, H);
  g.fillStyle = opts.kit;
  g.fillRect(0, 0, W, H);
  g.fillStyle = opts.tinta;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 34px system-ui, "Segoe UI", Arial, sans-serif';
  g.fillText(opts.nombre.toUpperCase(), W / 2, 50, W - 30);
  g.font = '900 130px system-ui, "Segoe UI", Arial, sans-serif';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.strokeText(opts.numero, W / 2, 150);
  g.fillText(opts.numero, W / 2, 150);
  return textura(canvas);
}

/* ---------------------------------------------------------------------------
 * El brillo de los focos, y las chispas y estelas.
 * ------------------------------------------------------------------------- */

export function texturaBrillo(color = '255,255,255'): THREE.CanvasTexture {
  const S = 128;
  const [canvas, g] = lienzo(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, `rgba(${color},1)`);
  grad.addColorStop(0.25, `rgba(${color},0.55)`);
  grad.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return textura(canvas);
}

/** El cielo de noche: degradado con un halo de los focos en el horizonte. */
export function texturaCielo(): THREE.CanvasTexture {
  const [canvas, g] = lienzo(16, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#050914');
  grad.addColorStop(0.45, '#0b1630');
  grad.addColorStop(0.62, '#1d2d55');
  grad.addColorStop(0.72, '#33406b');
  grad.addColorStop(1, '#0b1220');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 512);
  return textura(canvas);
}

/**
 * Una imagen SVG hecha textura. Las cabezas de la serie ya existen en SVG
 * —las de `PenaltyArt`, las que Víctor ha dado por buenas—, y en vez de
 * modelarlas otra vez se pintan tal cual en un lienzo y se pegan en la
 * escena. Así Oliver es el mismo Oliver en el cromo, en la ficha y en 3D.
 */
export function texturaSvg(svg: string, w = 256, h = 300): Promise<THREE.CanvasTexture> {
  return new Promise((resolve) => {
    const [canvas, g] = lienzo(w, h);
    const tex = textura(canvas);
    const img = new Image();
    img.onload = () => {
      g.clearRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = () => resolve(tex);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
