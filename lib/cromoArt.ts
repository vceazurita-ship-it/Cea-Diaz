import { hashSeed } from '@/lib/challenges';
import type { CromoBeard, CromoEyes, CromoHair, CromoLook, CromoReward } from '@/types';

/* =========================================================================
 *  Retrato del cromo — de dónde salen la camiseta y la cara.
 *
 *  Los cromos de verdad llevan foto. Aquí no podemos: son ciento y pico
 *  jugadores, buena parte son chavales de la cantera sin foto pública y
 *  ninguna de esas fotos es nuestra. Así que el cromo se **dibuja**: la
 *  camiseta con los colores reales de su equipo y una cara distinta para
 *  cada uno, deducida del identificador. Mismo cromo, mismo retrato, siempre.
 *
 *  Si algún día hay foto de verdad, se deja en `public/photos/cromos/` y se
 *  apunta con el campo `photo` del cromo: manda la foto y este dibujo se
 *  aparta. Por eso los dos catálogos de abajo son editables como cualquier
 *  otro: añadir un equipo es añadir una fila.
 * ========================================================================= */

/* ---------------------------------------------------------------------------
 * Equipaciones
 * ------------------------------------------------------------------------- */

/** Cómo va pintada la camiseta. */
export type KitPattern =
  /** De un color. */
  | 'liso'
  /** Rayas verticales, como el Atleti o el Athletic. */
  | 'rayas'
  /** Mitad y mitad, como el azulgrana clásico. */
  | 'mitades'
  /** Banda cruzada al pecho. */
  | 'banda'
  /** Cuerpo de un color y mangas de otro, como el Arsenal. */
  | 'mangas';

export interface Kit {
  /** Color del cuerpo de la camiseta. */
  shirt: string;
  /** El segundo color: rayas, mitad, banda o mangas. */
  trim: string;
  pattern: KitPattern;
  /** Color del cuello y del dorsal, el que se lee sobre la camiseta. */
  ink: string;
}

/**
 * Equipación de cada club y selección que aparece en los mazos. La clave es
 * el `team` del cromo tal cual está escrito, así que si se añade un jugador
 * de un equipo nuevo hay que dar de alta aquí su camiseta —o se quedará con
 * la genérica de abajo, que no rompe nada pero tampoco dice nada.
 */
export const KITS: Record<string, Kit> = {
  // --- LaLiga
  'Real Madrid': { shirt: '#f7f7f5', trim: '#dcdcd8', pattern: 'liso', ink: '#12225c' },
  'Real Madrid Castilla': { shirt: '#f7f7f5', trim: '#6d3bd4', pattern: 'mangas', ink: '#4c1d95' },
  'FC Barcelona': { shirt: '#0d2a63', trim: '#9d0f3d', pattern: 'mitades', ink: '#f5c542' },
  'Atlético de Madrid': { shirt: '#d61c1c', trim: '#f4f4f2', pattern: 'rayas', ink: '#0e1a4a' },
  'Athletic Club': { shirt: '#d61c1c', trim: '#f4f4f2', pattern: 'rayas', ink: '#1a1a1a' },
  'Real Sociedad': { shirt: '#1f5fc4', trim: '#f4f4f2', pattern: 'rayas', ink: '#f4f4f2' },
  'Real Betis': { shirt: '#0f9b52', trim: '#f4f4f2', pattern: 'rayas', ink: '#0d5c33' },
  Villarreal: { shirt: '#f2d024', trim: '#1a4fa0', pattern: 'liso', ink: '#12326b' },
  'Celta de Vigo': { shirt: '#8ec6f0', trim: '#f4f4f2', pattern: 'liso', ink: '#12326b' },

  // --- Premier
  Liverpool: { shirt: '#c8102e', trim: '#f0d878', pattern: 'liso', ink: '#f7f7f5' },
  'Manchester City': { shirt: '#6cabdd', trim: '#f4f4f2', pattern: 'liso', ink: '#0b2a52' },
  Arsenal: { shirt: '#d81920', trim: '#f4f4f2', pattern: 'mangas', ink: '#f7f7f5' },
  Chelsea: { shirt: '#1c47b0', trim: '#f4f4f2', pattern: 'liso', ink: '#f7f7f5' },
  'Manchester United': { shirt: '#d40b1a', trim: '#1a1a1a', pattern: 'liso', ink: '#f7f7f5' },
  Tottenham: { shirt: '#f7f7f5', trim: '#132257', pattern: 'liso', ink: '#132257' },
  Newcastle: { shirt: '#1a1a1a', trim: '#f4f4f2', pattern: 'rayas', ink: '#f4f4f2' },
  'Aston Villa': { shirt: '#7a1338', trim: '#8ec6f0', pattern: 'banda', ink: '#8ec6f0' },
  'Nottingham Forest': { shirt: '#d61c1c', trim: '#f4f4f2', pattern: 'liso', ink: '#f7f7f5' },
  'Crystal Palace': { shirt: '#1b3ea8', trim: '#d61c1c', pattern: 'rayas', ink: '#f4f4f2' },
  Brighton: { shirt: '#0057b8', trim: '#f4f4f2', pattern: 'rayas', ink: '#f4f4f2' },

  // --- Selecciones y clubes de las leyendas
  España: { shirt: '#b8122b', trim: '#f2c53d', pattern: 'liso', ink: '#f2c53d' },
  Argentina: { shirt: '#7fc3e8', trim: '#f4f4f2', pattern: 'rayas', ink: '#0b2a52' },
  Brasil: { shirt: '#f7d417', trim: '#0f8f4a', pattern: 'liso', ink: '#0f5ea8' },
  'Países Bajos': { shirt: '#f26f21', trim: '#f4f4f2', pattern: 'liso', ink: '#f7f7f5' },
  Alemania: { shirt: '#f4f4f2', trim: '#1a1a1a', pattern: 'liso', ink: '#1a1a1a' },
  Italia: { shirt: '#1b4fa8', trim: '#f4f4f2', pattern: 'liso', ink: '#f7f7f5' },
  Francia: { shirt: '#1e3a8a', trim: '#f4f4f2', pattern: 'liso', ink: '#f7f7f5' },
  Portugal: { shirt: '#a8112b', trim: '#0f7a3d', pattern: 'liso', ink: '#f2c53d' },
  Inglaterra: { shirt: '#f7f7f5', trim: '#1b4fa8', pattern: 'liso', ink: '#1b4fa8' },
  Hungría: { shirt: '#b8122b', trim: '#f4f4f2', pattern: 'liso', ink: '#f4f4f2' },
  'Unión Soviética': { shirt: '#1a1a1a', trim: '#f2c53d', pattern: 'liso', ink: '#f2c53d' },
  Milan: { shirt: '#1a1a1a', trim: '#c8102e', pattern: 'rayas', ink: '#f4f4f2' },
  Juventus: { shirt: '#f4f4f2', trim: '#1a1a1a', pattern: 'rayas', ink: '#1a1a1a' },
  Ajax: { shirt: '#f4f4f2', trim: '#c8102e', pattern: 'banda', ink: '#c8102e' },
};

/**
 * Los que no visten de ningún equipo —las cantantes de María— se visten por
 * mazo: cada nivel tiene su ropa, y así el cromo se reconoce de lejos igual
 * que se reconoce una camiseta a rayas.
 */
const ATUENDOS: Partial<Record<CromoReward['rarity'], Kit>> = {
  radio: { shirt: '#e0518f', trim: '#f7d417', pattern: 'liso', ink: '#fdfdfd' },
  noventa: { shirt: '#6d3bd4', trim: '#f7d417', pattern: 'banda', ink: '#fdfdfd' },
  dosmil: { shirt: '#1c96b0', trim: '#f4f4f2', pattern: 'liso', ink: '#fdfdfd' },
  // Negro y oro, pero con la banda cruzada: el negro liso sobre el fondo
  // oscuro de la tarjeta no se veía y las leyendas salían flotando.
  leyenda_pop: { shirt: '#332f28', trim: '#d8ab3f', pattern: 'banda', ink: '#e6bf58' },
  equipo: { shirt: '#0f9b7a', trim: '#f4f4f2', pattern: 'liso', ink: '#fdfdfd' },
};

/** La que se usa cuando no hay ni equipo ni atuendo: gris de entrenamiento. */
const KIT_GENERICO: Kit = {
  shirt: '#5b6478',
  trim: '#8b93a6',
  pattern: 'liso',
  ink: '#f4f4f2',
};

/**
 * Con qué va vestido el cromo: primero su equipo, si lo tiene fichado; si no,
 * la ropa de su mazo; y si tampoco, el gris de entrenamiento.
 */
export function kitOf(cromo: CromoReward): Kit {
  return KITS[cromo.team] ?? ATUENDOS[cromo.rarity] ?? KIT_GENERICO;
}

/* ---------------------------------------------------------------------------
 * Cara
 *
 * No es un parecido: es una cara distinta y estable para cada cromo. Sale del
 * identificador, de modo que Mbappé sale siempre igual y nunca igual que
 * Haaland. Las paletas son amplias a propósito: la plantilla del Castilla y
 * la de la Premier no tienen todas la misma piel ni el mismo pelo.
 * ------------------------------------------------------------------------- */

/** Tonos de piel, del más claro al más oscuro. El orden es el de `CromoLook.skin`. */
const PIELES = ['#f2d0b4', '#e7b590', '#d19a6d', '#a9714a', '#7d4d2f', '#54301c'];

/** Colores de pelo, con el nombre con el que se piden desde el cromo. */
const PELOS: Record<NonNullable<CromoLook['hairColor']>, string> = {
  negro: '#1c1410',
  castaño: '#3a2718',
  'castaño claro': '#7a4a22',
  rubio: '#d8c08a',
  pelirrojo: '#b5561e',
  cano: '#b9b9b9',
};

/**
 * Los colores que salen en el sorteo. El cano queda fuera: sólo se pone a
 * mano, porque los mazos que se sortean son de canteranos de veinte años.
 */
const PELOS_AL_AZAR = [PELOS.negro, PELOS.castaño, PELOS['castaño claro'], PELOS.rubio, PELOS.pelirrojo];

/**
 * Colores de iris. Son los del anime, no los de un carné: un punto más vivos
 * de lo que serían en una foto, porque en el dibujo el iris es una mancha de
 * cuatro píxeles y si se apaga se pierde.
 */
const OJOS: Record<CromoEyes, string> = {
  marrón: '#6b3f22',
  miel: '#a9761f',
  verde: '#3f7d4b',
  azul: '#2f6ea8',
  gris: '#5d6b73',
  negro: '#2a1d16',
};

/** Los que salen en el sorteo cuando el cromo no dice de qué color los tiene. */
const OJOS_AL_AZAR: CromoEyes[] = ['marrón', 'marrón', 'marrón', 'miel', 'verde', 'azul'];

export type HairStyle = CromoHair;
export type Beard = CromoBeard;

const CORTES: HairStyle[] = [
  'corto',
  'rizado',
  'afro',
  'largo',
  'rapado',
  'cresta',
  'moño',
  'trenzas',
  'tupé',
];

export interface Face {
  skin: string;
  hair: string;
  style: HairStyle;
  beard: Beard;
  /** Color del iris. */
  eyes: string;
}

/**
 * El retrato del cromo. Lo que venga en `look` manda; lo que falte se sortea
 * a partir del identificador, con una tirada independiente por rasgo para que
 * dos cromos seguidos no salgan clavados.
 */
export function faceOf(id: string, look?: CromoLook): Face {
  const barba = hashSeed(`${id}:barba`) % 10;
  const piel = look?.skin ?? (hashSeed(`${id}:piel`) % PIELES.length) + 1;

  return {
    skin: PIELES[piel - 1],
    hair: look?.hairColor
      ? PELOS[look.hairColor]
      : PELOS_AL_AZAR[hashSeed(`${id}:pelo`) % PELOS_AL_AZAR.length],
    style: look?.hair ?? CORTES[hashSeed(`${id}:corte`) % CORTES.length],
    // Algo más de la mitad sin barba: en la cantera casi nadie la lleva.
    beard: look?.beard ?? (barba < 6 ? 'no' : barba < 9 ? 'corta' : 'cerrada'),
    // Los ojos claros son cosa de las pieles claras: con piel oscura el
    // sorteo se queda en marrón, que es lo que se ve en un campo de verdad.
    eyes: OJOS[
      look?.eyes ?? (piel >= 4 ? 'marrón' : OJOS_AL_AZAR[hashSeed(`${id}:ojos`) % OJOS_AL_AZAR.length])
    ],
  };
}

/* ---------------------------------------------------------------------------
 * La familia
 *
 * Los cuatro de casa no se sortean: se les ha copiado la cara de las fotos de
 * los perfiles, rasgo a rasgo, para que el dibujo se parezca. De aquí beben
 * tanto su cromo como las escenas de casa —la mesa de la cena, el paseo—, de
 * modo que Hugo es el mismo Hugo en las catorce ilustraciones.
 * ------------------------------------------------------------------------- */

/** Quién de la casa se está dibujando. */
export type Casero = 'leo' | 'hugo' | 'maria' | 'victor';

export const LOOK_FAMILIA: Record<Casero, CromoLook> = {
  // Moreno, flequillo levantado y ojos claros: el de la foto del castillo.
  leo: { skin: 1, hairColor: 'castaño', hair: 'corto', beard: 'no', eyes: 'verde' },
  // Rubio oscuro con el tupé de punta, que ya es de por sí de Oliver y Benji.
  hugo: { skin: 1, hairColor: 'rubio', hair: 'tupé', beard: 'no', eyes: 'miel' },
  // Melena larga y oscura, ojos marrones.
  maria: { skin: 2, hairColor: 'castaño', hair: 'largo', beard: 'no', eyes: 'marrón' },
  // Pelo corto y rizado y barba cerrada.
  victor: { skin: 2, hairColor: 'castaño', hair: 'rizado', beard: 'cerrada', eyes: 'marrón' },
};

/** La cara de uno de la casa, ya resuelta. */
export function caraDe(quien: Casero): Face {
  return faceOf(`casa:${quien}`, LOOK_FAMILIA[quien]);
}

/**
 * Color de la ropa con la que sale cada uno en las escenas. Es el `tint` de
 * su perfil, para que en la mesa de la cena se sepa quién es quién por el
 * color, igual que en el resto de la aplicación.
 */
export const ROPA_FAMILIA: Record<Casero, string> = {
  leo: '#16a34a',
  hugo: '#dc2626',
  maria: '#db2777',
  victor: '#2563eb',
};

/* ---------------------------------------------------------------------------
 * Quién se dibuja y quién no
 * ------------------------------------------------------------------------- */

/**
 * Sólo se retrata a las personas: los jugadores —que se reconocen por su
 * línea de campo— y los que lo dicen con `persona`, que son las cantantes de
 * María y los de la casa. Los cromos que no son nadie —la mesa de la cena, el
 * Tiro del León— se quedan con su emoji, que ahí dice más que una cara
 * inventada.
 */
export function tieneRetrato(cromo: CromoReward): boolean {
  return Boolean(cromo.line || cromo.persona);
}
