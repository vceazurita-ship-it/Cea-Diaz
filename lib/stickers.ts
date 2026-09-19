/* =========================================================================
 *  Pegatinas para chapas.
 *
 *  Folios de pegatinas redondas a la medida de una chapa, para imprimir en
 *  papel adhesivo, recortar y pegar. Se dibujan aquí mismo en un lienzo y se
 *  descargan como PDF de A4 (lib/pdf.ts), que es lo único que sale a su
 *  tamaño exacto al imprimir.
 *
 *  Todas las fotos son de verdad y libres: jugadores y leyendas de Wikimedia
 *  Commons, planetas de la NASA, y los dinosaurios son fósiles montados y
 *  reconstrucciones a tamaño real de museos y parques. Las de las películas
 *  de Jurassic World son de Universal y no se pueden subir a un repositorio
 *  público. Autor y licencia de cada una, en public/photos/pegatinas/CREDITOS.md.
 * ========================================================================= */

export type StickerGroup = 'madrid' | 'lamine' | 'leyendas' | 'dinos' | 'planetas';

export interface Sticker {
  id: string;
  /** Lo que va escrito en la banda, corto: en 25 mm no caben apellidos compuestos. */
  label: string;
  photo: string;
  group: StickerGroup;
  /** Altura del punto que manda en el recorte, de 0 (arriba) a 1 (abajo). */
  focusY?: number;
  /** Horizontal, igual. */
  focusX?: number;
  /** Cuánto se acerca sobre el recorte que ya llena el círculo. */
  zoom?: number;
  /** Encajar entera en vez de llenar: los planetas son redondos ya. */
  contain?: boolean;
}

interface GroupStyle {
  rim: string;
  band: string;
  text: string;
  /** Fondo detrás de la foto, que sólo se ve en las que se encajan. */
  ground: string;
}

export const GROUP_STYLE: Record<StickerGroup, GroupStyle> = {
  madrid: { rim: '#d4af37', band: '#ffffff', text: '#1f2a5a', ground: '#ffffff' },
  lamine: { rim: '#a50044', band: '#004d98', text: '#ffd23f', ground: '#004d98' },
  leyendas: { rim: '#d4af37', band: '#141414', text: '#f3d27a', ground: '#141414' },
  dinos: { rim: '#4d7c0f', band: '#1a2e05', text: '#facc15', ground: '#1a2e05' },
  planetas: { rim: '#3b5bdb', band: '#0b1026', text: '#e7ecff', ground: '#000000' },
};

const P = '/photos/cromos/';
const PEG = '/photos/pegatinas/';

export const STICKERS: Sticker[] = [
  // --- Real Madrid de ahora: las mismas fotos de los cromos.
  { id: 'mbappe', label: 'MBAPPÉ', photo: `${P}mbappe.jpg`, group: 'madrid' },
  { id: 'vinicius', label: 'VINI JR.', photo: `${P}vinicius.jpg`, group: 'madrid' },
  { id: 'bellingham', label: 'BELLINGHAM', photo: `${P}bellingham.jpg`, group: 'madrid' },
  { id: 'valverde', label: 'VALVERDE', photo: `${P}valverde.jpg`, group: 'madrid' },
  { id: 'courtois', label: 'COURTOIS', photo: `${P}courtois.jpg`, group: 'madrid' },
  { id: 'arda-guler', label: 'ARDA GÜLER', photo: `${P}arda-guler.jpg`, group: 'madrid' },
  { id: 'rodrygo', label: 'RODRYGO', photo: `${P}rodrygo.jpg`, group: 'madrid' },
  { id: 'tchouameni', label: 'TCHOUAMÉNI', photo: `${P}tchouameni.jpg`, group: 'madrid' },
  { id: 'huijsen', label: 'HUIJSEN', photo: `${P}huijsen.jpg`, group: 'madrid' },
  { id: 'trent', label: 'TRENT', photo: `${P}trent.jpg`, group: 'madrid' },
  { id: 'konate', label: 'KONATÉ', photo: `${P}konate.jpg`, group: 'madrid' },
  { id: 'yan-diomande', label: 'DIOMANDÉ', photo: `${P}yan-diomande.jpg`, group: 'madrid' },

  // --- Lamine Yamal, cinco fotos distintas.
  { id: 'lamine-1', label: 'LAMINE', photo: `${PEG}lamine/lamine-1.jpg`, group: 'lamine' },
  { id: 'lamine-2', label: 'LAMINE', photo: `${PEG}lamine/lamine-2.jpg`, group: 'lamine' },
  { id: 'lamine-3', label: 'LAMINE', photo: `${PEG}lamine/lamine-3.jpg`, group: 'lamine' },
  { id: 'lamine-4', label: 'LAMINE', photo: `${PEG}lamine/lamine-4.jpg`, group: 'lamine' },
  { id: 'lamine-5', label: 'LAMINE', photo: `${PEG}lamine/lamine-5.jpg`, group: 'lamine' },

  // --- Leyendas: las fotos de sus cromos, que son de ellos jugando.
  { id: 'di-stefano', label: 'DI STÉFANO', photo: `${P}di-stefano.jpg`, group: 'leyendas' },
  { id: 'puskas', label: 'PUSKÁS', photo: `${P}puskas.jpg`, group: 'leyendas' },
  { id: 'gento', label: 'GENTO', photo: `${P}gento.jpg`, group: 'leyendas' },
  { id: 'raul', label: 'RAÚL', photo: `${P}raul.jpg`, group: 'leyendas' },
  { id: 'casillas', label: 'CASILLAS', photo: `${P}casillas.jpg`, group: 'leyendas' },
  { id: 'sergio-ramos', label: 'SERGIO RAMOS', photo: `${P}sergio-ramos.jpg`, group: 'leyendas' },
  { id: 'zidane', label: 'ZIDANE', photo: `${P}zidane.jpg`, group: 'leyendas' },
  { id: 'ronaldo', label: 'RONALDO', photo: `${P}ronaldo.jpg`, group: 'leyendas' },
  { id: 'cristiano', label: 'CRISTIANO', photo: `${P}cristiano.jpg`, group: 'leyendas' },
  { id: 'modric', label: 'MODRIĆ', photo: `${P}modric.jpg`, group: 'leyendas' },
  { id: 'butragueno', label: 'BUTRAGUEÑO', photo: `${P}butragueno.jpg`, group: 'leyendas' },
  { id: 'kaka', label: 'KAKÁ', photo: `${P}kaka.jpg`, group: 'leyendas' },
  { id: 'pele', label: 'PELÉ', photo: `${P}pele.jpg`, group: 'leyendas' },
  { id: 'maradona', label: 'MARADONA', photo: `${P}maradona.jpg`, group: 'leyendas' },
  { id: 'messi', label: 'MESSI', photo: `${P}messi.jpg`, group: 'leyendas' },
  { id: 'cruyff', label: 'CRUYFF', photo: `${P}cruyff.jpg`, group: 'leyendas' },
  { id: 'beckenbauer', label: 'BECKENBAUER', photo: `${P}beckenbauer.jpg`, group: 'leyendas' },
  { id: 'maldini', label: 'MALDINI', photo: `${P}maldini.jpg`, group: 'leyendas' },
  { id: 'ronaldinho', label: 'RONALDINHO', photo: `${P}ronaldinho.jpg`, group: 'leyendas' },
  { id: 'iniesta', label: 'INIESTA', photo: `${P}iniesta.jpg`, group: 'leyendas' },
  { id: 'xavi', label: 'XAVI', photo: `${P}xavi.jpg`, group: 'leyendas' },
  { id: 'buffon', label: 'BUFFON', photo: `${P}buffon.jpg`, group: 'leyendas' },
  { id: 'yashin', label: 'YASHIN', photo: `${P}yashin.jpg`, group: 'leyendas' },
  { id: 'van-basten', label: 'VAN BASTEN', photo: `${P}van-basten.jpg`, group: 'leyendas' },
  { id: 'henry', label: 'HENRY', photo: `${P}henry.jpg`, group: 'leyendas' },
  { id: 'platini', label: 'PLATINI', photo: `${P}platini.jpg`, group: 'leyendas' },
  { id: 'garrincha', label: 'GARRINCHA', photo: `${P}garrincha.jpg`, group: 'leyendas' },
  { id: 'eusebio', label: 'EUSÉBIO', photo: `${P}eusebio.jpg`, group: 'leyendas' },
  { id: 'bobby-charlton', label: 'B. CHARLTON', photo: `${P}bobby-charlton.jpg`, group: 'leyendas' },
  { id: 'baggio', label: 'BAGGIO', photo: `${P}baggio.jpg`, group: 'leyendas' },

  // --- Dinosaurios de las películas, en fósil o a tamaño real.
  { id: 'tyrannosaurus', label: 'T. REX', photo: `${PEG}dinos/tyrannosaurus.jpg`, group: 'dinos' },
  { id: 'velociraptor', label: 'VELOCIRAPTOR', photo: `${PEG}dinos/velociraptor.jpg`, group: 'dinos' },
  { id: 'triceratops', label: 'TRICERATOPS', photo: `${PEG}dinos/triceratops.jpg`, group: 'dinos' },
  { id: 'brachiosaurus', label: 'BRAQUIOSAURIO', photo: `${PEG}dinos/brachiosaurus.jpg`, group: 'dinos' },
  { id: 'stegosaurus', label: 'ESTEGOSAURIO', photo: `${PEG}dinos/stegosaurus.jpg`, group: 'dinos' },
  { id: 'spinosaurus', label: 'ESPINOSAURIO', photo: `${PEG}dinos/spinosaurus.jpg`, group: 'dinos' },
  { id: 'mosasaurus', label: 'MOSASAURIO', photo: `${PEG}dinos/mosasaurus.jpg`, group: 'dinos' },
  { id: 'pteranodon', label: 'PTERANODON', photo: `${PEG}dinos/pteranodon.jpg`, group: 'dinos' },
  { id: 'ankylosaurus', label: 'ANQUILOSAURIO', photo: `${PEG}dinos/ankylosaurus.jpg`, group: 'dinos' },
  { id: 'parasaurolophus', label: 'PARASAUROLOPHUS', photo: `${PEG}dinos/parasaurolophus.jpg`, group: 'dinos' },
  { id: 'dilophosaurus', label: 'DILOFOSAURIO', photo: `${PEG}dinos/dilophosaurus.jpg`, group: 'dinos' },
  { id: 'carnotaurus', label: 'CARNOTAURO', photo: `${PEG}dinos/carnotaurus.jpg`, group: 'dinos' },
  { id: 'giganotosaurus', label: 'GIGANOTOSAURIO', photo: `${PEG}dinos/giganotosaurus.jpg`, group: 'dinos' },
  { id: 'allosaurus', label: 'ALOSAURIO', photo: `${PEG}dinos/allosaurus.jpg`, group: 'dinos' },

  // --- El sistema solar, de la NASA.
  { id: 'sol', label: 'SOL', photo: `${PEG}planetas/sol.jpg`, group: 'planetas', contain: true },
  { id: 'mercurio', label: 'MERCURIO', photo: `${PEG}planetas/mercurio.jpg`, group: 'planetas', contain: true },
  { id: 'venus', label: 'VENUS', photo: `${PEG}planetas/venus.jpg`, group: 'planetas', contain: true },
  { id: 'tierra', label: 'TIERRA', photo: `${PEG}planetas/tierra.jpg`, group: 'planetas', contain: true },
  { id: 'luna', label: 'LUNA', photo: `${PEG}planetas/luna.jpg`, group: 'planetas', contain: true },
  { id: 'marte', label: 'MARTE', photo: `${PEG}planetas/marte.jpg`, group: 'planetas', contain: true },
  { id: 'jupiter', label: 'JÚPITER', photo: `${PEG}planetas/jupiter.jpg`, group: 'planetas', contain: true },
  { id: 'saturno', label: 'SATURNO', photo: `${PEG}planetas/saturno.jpg`, group: 'planetas', contain: true },
  { id: 'urano', label: 'URANO', photo: `${PEG}planetas/urano.jpg`, group: 'planetas', contain: true },
  { id: 'neptuno', label: 'NEPTUNO', photo: `${PEG}planetas/neptuno.jpg`, group: 'planetas', contain: true },
  { id: 'pluton', label: 'PLUTÓN', photo: `${PEG}planetas/pluton.jpg`, group: 'planetas', contain: true },
];

/* ------------------------------------------------------------------ hojas */

export interface StickerSheet {
  id: string;
  title: string;
  emoji: string;
  groups: StickerGroup[];
}

export const SHEETS: StickerSheet[] = [
  { id: 'madrid', title: 'Real Madrid y Lamine', emoji: '⚪', groups: ['madrid', 'lamine'] },
  { id: 'leyendas', title: 'Leyendas', emoji: '🏆', groups: ['leyendas'] },
  { id: 'dinos', title: 'Dinosaurios', emoji: '🦖', groups: ['dinos'] },
  { id: 'planetas', title: 'Planetas', emoji: '🪐', groups: ['planetas'] },
];

/** Diámetros de pegatina, en milímetros. */
export const SIZES = [
  { mm: 25, label: 'Chapa', hint: 'Dentro de una chapa de botellín' },
  { mm: 28, label: 'Chapa justa', hint: 'Llega hasta el borde de la chapa' },
  { mm: 32, label: 'Grande', hint: 'Tapa la chapa entera, con dientes' },
] as const;

/** Márgenes del folio y hueco entre pegatinas, en milímetros. */
const PAGE = { width: 210, height: 297, margin: 9, gap: 3, footer: 8 };

export interface SheetLayout {
  columns: number;
  rows: number;
  /** Esquina del primer hueco, para centrar la rejilla. */
  left: number;
  top: number;
  pitch: number;
}

export function layoutFor(diameter: number): SheetLayout {
  const pitch = diameter + PAGE.gap;
  const usableW = PAGE.width - PAGE.margin * 2;
  const usableH = PAGE.height - PAGE.margin * 2 - PAGE.footer;
  const columns = Math.floor((usableW + PAGE.gap) / pitch);
  const rows = Math.floor((usableH + PAGE.gap) / pitch);
  const gridW = columns * pitch - PAGE.gap;
  const gridH = rows * pitch - PAGE.gap;

  return {
    columns,
    rows,
    pitch,
    left: (PAGE.width - gridW) / 2,
    top: PAGE.margin + (usableH - gridH) / 2,
  };
}

/** Las pegatinas de una hoja, repetidas en orden hasta llenarla. */
export function stickersFor(sheet: StickerSheet, count: number): Sticker[] {
  const pool = STICKERS.filter((sticker) => sheet.groups.includes(sticker.group));
  if (pool.length === 0) return [];
  return Array.from({ length: count }, (_, index) => pool[index % pool.length]);
}

/* ---------------------------------------------------------------- dibujo */

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(src);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`No carga ${src}`));
      image.src = src;
    });
    imageCache.set(src, pending);
  }
  return pending;
}

const LABEL_FONT = '"Arial Black", "Helvetica Neue", Arial, sans-serif';

/**
 * Escribe `text` centrado en la parte de abajo de una circunferencia, letra a
 * letra y con la cabeza hacia el centro, de izquierda a derecha. Si no cabe en
 * el arco disponible, encoge la letra hasta que quepa.
 */
function drawArcLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  arcRadius: number,
  size: number,
  color: string,
) {
  const letters = [...text];
  const spacing = 0.06;
  const measure = (fontSize: number) => {
    ctx.font = `900 ${fontSize}px ${LABEL_FONT}`;
    return letters.map((letter) => ctx.measureText(letter).width + fontSize * spacing);
  };

  let fontSize = size;
  let widths = measure(fontSize);
  const room = Math.PI * 0.8 * arcRadius;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total > room) {
    fontSize *= room / total;
    widths = measure(fontSize);
  }

  const span = widths.reduce((sum, width) => sum + width, 0) / arcRadius;
  // En el lienzo el ángulo crece hacia abajo: π/2 es el punto más bajo, y la
  // lectura de izquierda a derecha va de ángulos mayores a menores.
  let angle = Math.PI / 2 + span / 2;

  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  letters.forEach((letter, index) => {
    const half = widths[index] / 2 / arcRadius;
    angle -= half;
    ctx.save();
    ctx.translate(cx + arcRadius * Math.cos(angle), cy + arcRadius * Math.sin(angle));
    ctx.rotate(angle - Math.PI / 2);
    ctx.fillText(letter, 0, 0);
    ctx.restore();
    angle -= half;
  });
  ctx.restore();
}

/** Dibuja una pegatina con su centro en (cx, cy); todo en píxeles. */
function drawSticker(
  ctx: CanvasRenderingContext2D,
  sticker: Sticker,
  image: HTMLImageElement | null,
  cx: number,
  cy: number,
  radius: number,
  pxPerMm: number,
) {
  const style = GROUP_STYLE[sticker.group];
  const rim = Math.max(1, 0.9 * pxPerMm);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = style.ground;
  ctx.fill();
  ctx.clip();

  if (image) {
    const box = radius * 2;
    const ratio = image.naturalWidth / image.naturalHeight;
    if (sticker.contain) {
      // Encajada y algo subida, para que el arco del nombre no tape el astro.
      const size = box * 0.72;
      const w = ratio >= 1 ? size : size * ratio;
      const h = ratio >= 1 ? size / ratio : size;
      ctx.drawImage(image, cx - w / 2, cy - h / 2 - box * 0.07, w, h);
    } else {
      const zoom = sticker.zoom ?? 1;
      let w = ratio >= 1 ? box * ratio : box;
      let h = ratio >= 1 ? box : box / ratio;
      w *= zoom;
      h *= zoom;
      const fx = sticker.focusX ?? 0.5;
      const fy = sticker.focusY ?? 0.3;
      // El punto de foco cae en el centro del círculo, sin dejar huecos.
      const x = Math.min(cx - radius, Math.max(cx + radius - w, cx - w * fx));
      const y = Math.min(cy - radius, Math.max(cy + radius - h, cy - h * fy));
      ctx.drawImage(image, x, y, w, h);
    }
  }

  // El nombre va en un arco por el borde de abajo, como en las chapas de
  // toda la vida. Una banda recta cabría en la cuerda del círculo, que a esa
  // altura es mucho más corta que el arco: BRAQUIOSAURIO no se leería.
  const ringRadius = radius * 0.82;
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, Math.PI * 0.06, Math.PI * 0.94);
  ctx.lineWidth = radius * 0.34;
  ctx.strokeStyle = style.band;
  ctx.stroke();
  ctx.restore();

  drawArcLabel(ctx, sticker.label, cx, cy, ringRadius, radius * 0.22, style.text);

  // Aro de color por dentro del borde.
  ctx.beginPath();
  ctx.arc(cx, cy, radius - rim / 2, 0, Math.PI * 2);
  ctx.lineWidth = rim;
  ctx.strokeStyle = style.rim;
  ctx.stroke();

  // Guía de corte, fina y un pelo por fuera, para las tijeras.
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 0.5 * pxPerMm, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, 0.15 * pxPerMm);
  ctx.strokeStyle = '#b8b8b8';
  ctx.setLineDash([0.8 * pxPerMm, 0.8 * pxPerMm]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Pinta una hoja entera en el lienzo, a `pxPerMm` píxeles por milímetro
 * (11,81 son 300 ppp, lo que pide una impresora de casa para verse nítido).
 */
export async function drawSheet(
  canvas: HTMLCanvasElement,
  sheet: StickerSheet,
  diameter: number,
  pxPerMm: number,
): Promise<void> {
  const layout = layoutFor(diameter);
  const stickers = stickersFor(sheet, layout.columns * layout.rows);
  const images = await Promise.all(
    stickers.map((sticker) => loadImage(sticker.photo).catch(() => null)),
  );

  canvas.width = Math.round(PAGE.width * pxPerMm);
  canvas.height = Math.round(PAGE.height * pxPerMm);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador no deja dibujar.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';

  stickers.forEach((sticker, index) => {
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);
    const cx = (layout.left + column * layout.pitch + diameter / 2) * pxPerMm;
    const cy = (layout.top + row * layout.pitch + diameter / 2) * pxPerMm;
    drawSticker(ctx, sticker, images[index], cx, cy, (diameter / 2) * pxPerMm, pxPerMm);
  });

  // Pie: qué hoja es y una regla de 5 cm para comprobar la escala.
  const baseline = (PAGE.height - PAGE.margin + 1) * pxPerMm;
  ctx.fillStyle = '#6b6b6b';
  ctx.font = `${2.6 * pxPerMm}px Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(
    `${sheet.title} · chapas de ${diameter} mm · imprimir a tamaño real (100 %)`,
    PAGE.margin * pxPerMm,
    baseline,
  );

  const rulerRight = (PAGE.width - PAGE.margin) * pxPerMm;
  const rulerLeft = rulerRight - 50 * pxPerMm;
  ctx.strokeStyle = '#6b6b6b';
  ctx.lineWidth = Math.max(1, 0.25 * pxPerMm);
  ctx.beginPath();
  ctx.moveTo(rulerLeft, baseline - 1.2 * pxPerMm);
  ctx.lineTo(rulerLeft, baseline);
  ctx.lineTo(rulerRight, baseline);
  ctx.lineTo(rulerRight, baseline - 1.2 * pxPerMm);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `${2.2 * pxPerMm}px Arial, sans-serif`;
  ctx.fillText('esta raya mide 5 cm', (rulerLeft + rulerRight) / 2, baseline - 1.4 * pxPerMm);
}

/** 300 ppp en píxeles por milímetro. */
export const PRINT_PX_PER_MM = 300 / 25.4;
