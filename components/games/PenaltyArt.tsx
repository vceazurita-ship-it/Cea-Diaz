import { Cabeza, TINTA } from '@/components/ui/CromoFace';
import {
  Antebrazo,
  Bota,
  BrazoAlto,
  Calzona,
  Cuello,
  Mano,
  Muslo,
  Pantorrilla,
  Pieza,
  Tronco,
  largo,
} from '@/components/games/PenaltyBody';
import { ROPA_FAMILIA, caraDe, faceOf, type Casero, type Face } from '@/lib/cromoArt';
import type { ShotKind } from '@/types';

/* =========================================================================
 *  El dibujo de la tanda — Oliver y Benji, el de las tardes de merienda.
 *
 *  El que tira **es el crío**: la misma cara que lleva su cromo y que sale
 *  en las escenas de casa, con el color de su perfil. Leo moreno de ojos
 *  claros, Hugo rubio de tupé. Que el muñeco sea uno mismo es media gracia
 *  del juego, y no cuesta nada: las piezas ya estaban dibujadas en
 *  `CromoFace` para los cromos, así que aquí sólo hay que ponerles piernas.
 *
 *  Y bajo los palos está **Benji**, que es a quien hay que ganarle: gorra
 *  negra con la visera tapándole media ceja, guantes por delante y las piernas
 *  abiertas en la línea. No es un portero cualquiera con otra cara: es el
 *  rival de la serie, y que el crío le tire a él es lo que convierte cinco
 *  penaltis en un capítulo.
 *
 *  Todo se monta con **articulaciones**, no con siluetas: cada pose es una
 *  lista de puntos —cadera, rodilla, pie, hombro, codo, mano— y los miembros
 *  se pintan como trazos gruesos con la línea de tinta por debajo. Cambiar
 *  una pose es mover un punto, que es lo que permite que Benji espere, se
 *  estire a una escuadra, salte o se tire abajo sin dibujar cuatro Benjis.
 *
 *  Y el estadio sale de los fotogramas de la serie: cielo plano con nubes de
 *  algodón, la grada entera llena de puntos de colores, las torres de luz,
 *  la valla de publicidad, el césped a franjas que se ensanchan hacia uno —la
 *  perspectiva exagerada del anime— y una portería con fondo, red y sombra,
 *  que es lo que hace que un gol se vea entrar.
 * ========================================================================= */

/** Un punto del muñeco. */
type P = [number, number];

/**
 * El mismo color, un tono más oscuro.
 *
 * Hace falta para **la manga**. El brazo cae por delante del pecho, así que
 * pintado del color exacto de la camiseta desaparecía dentro de ella y el
 * muñeco parecía manco: sólo se le veían las manos flotando a los lados. Un
 * tono por debajo y el brazo se lee, que además es como se sombrea una
 * equipación en el anime: la manga siempre va un paso más oscura que el
 * pecho.
 */
function sombra(hex: string, f = 0.74): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;

  const oscuro = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.round(v * f))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

  return '#' + oscuro;
}

/** Color de los pantalones: oscuro, para que la camiseta sea lo que canta. */
const CALZONA = '#1f2937';

/** Las medias por defecto, para quien no traiga las suyas. */
const MEDIAS = '#f4f4f2';

/** Un punto entre dos, a una fracción del camino. */
function entre(a: P, b: P, t: number): P {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Hacia dónde apunta un tramo, en grados. */
function rumbo(a: P, b: P): number {
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
}

/* -------------------------------------------------------------------------
 * La cabeza de la serie
 *
 * Copiada de los fotogramas que pasó Víctor —el póster de «Campeones hacia el
 * Mundial», la foto de equipo de Japón y el choque de Oliver y Hyuga—, y
 * no la del cromo, que es más de retrato: aquí los **ojos son grandes y
 * redondos**, con el iris oscuro casi entero y dos brillos; las cejas, gruesas
 * y bajando hacia la nariz; la nariz, una sombra en ángulo; la boca, una raya,
 * o abierta de par en par cuando grita el tiro; y sobre todo **el pelo**, una
 * mata de mechones en punta que cae sobre la frente y abulta más que la
 * cabeza. Es lo que hace que un muñeco se lea como de Oliver y Benji a la
 * primera.
 *
 * Mismo sistema que la del cromo: centro en el origen, de -27 a +28.
 * ----------------------------------------------------------------------- */

export type PeloAnime = 'mata' | 'punta' | 'salvaje' | 'peinado' | 'rapado' | 'melena';

/** Cada peinado: la masa de detrás de la cabeza y los mechones de delante. */
const PELOS_ANIME: Record<PeloAnime, { back?: string; front: string }> = {
  // Oliver: la mata de mechones, con picos por arriba y por la frente.
  mata: {
    back:
      'M-24 8 C-28 -8 -27 -24 -16 -32 L-15 -40 L-8 -34 L-2 -43 L4 -35 L11 -41 L12 -32 ' +
      'C24 -27 29 -10 24 8 L20 0 L19 10 L15 -2 L-15 -2 L-19 10 L-20 0 Z',
    front:
      'M-20.5 -4 C-21 -18 -12 -28 0 -28 C12 -28 21 -18 20.5 -4 L17.5 -9 L16 1 L11.5 -10 L8 -1 ' +
      'L4.5 -12 L0.5 -2 L-3.5 -12 L-7.5 -1 L-11 -11 L-15 0 L-17.5 -9 Z',
  },
  // De punta hacia arriba: el tupé de Hugo pasado por la serie.
  punta: {
    back:
      'M-23 6 C-27 -10 -24 -26 -14 -32 L-18 -44 L-6 -36 L-2 -50 L6 -37 L16 -47 L14 -33 ' +
      'C24 -27 28 -10 23 6 Z',
    front:
      'M-20.5 -4 C-21 -16 -15 -24 -6 -27 L-10 -38 L0 -29 L4 -41 L9 -29 L18 -37 L15 -24 ' +
      'C19 -19 21 -12 20.5 -4 L16 -12 L12 -4 L8 -15 L2 -8 L-3 -16 L-8 -6 L-13 -14 L-17 -5 Z',
  },
  // Hyuga: salvaje, más largo por detrás, hasta el cuello.
  salvaje: {
    back:
      'M-25 20 C-31 0 -30 -22 -17 -33 L-19 -43 L-9 -36 L-3 -46 L3 -37 L12 -45 L13 -33 ' +
      'C27 -26 31 -4 25 20 L20 12 L21 24 L15 10 L-15 10 L-21 24 L-20 12 Z',
    front:
      'M-21 -3 C-21.5 -18 -12 -28.5 0 -28.5 C12 -28.5 21.5 -18 21 -3 L18 -6 L17.5 4 L13 -7 ' +
      'L10 2 L6 -11 L2 -1 L-2 -12 L-6 0 L-10 -10 L-13 2 L-17 -7 L-19 3 Z',
  },
  // Peinado de lado, más suave: Tom, Julian.
  peinado: {
    back: 'M-23 8 C-27 -10 -24 -27 -10 -32 C0 -35 12 -34 19 -28 C27 -20 28 -6 23 8 L19 0 L-19 0 Z',
    front:
      'M-20.5 -2 C-21 -18 -12 -28 2 -28 C14 -28 21 -19 20.5 -4 L16 -10 L13 -2 L9 -13 ' +
      'C4 -12 -6 -10 -12 -4 L-15 -10 L-17 0 Z',
  },
  // Melena lisa hasta los hombros: la de Ed Warner.
  melena: {
    back:
      'M-24 26 C-30 4 -29 -22 -14 -31 C-4 -36 8 -36 16 -31 C29 -22 30 4 24 26 L19 20 L18 30 ' +
      'L13 18 L-13 18 L-18 30 L-19 20 Z',
    front:
      'M-20.5 -2 C-21 -18 -12 -28 0 -28 C12 -28 21 -18 20.5 -2 L17 -6 L15 3 L11 -8 L7 1 ' +
      'L3 -9 L-1 1 L-5 -9 L-9 1 L-13 -8 L-16 2 Z',
  },
  // Al cero: Bruce.
  rapado: {
    front:
      'M-19 -4 C-19.5 -18 -11 -26.5 0 -26.5 C11 -26.5 19.5 -18 19 -4 L15 -9 L10 -6 L5 -10 ' +
      'L0 -7 L-5 -10 L-10 -6 L-15 -9 Z',
  },
};

const CARA_ANIME =
  'M0 -26 C11 -26 19.5 -19 19.5 -6 C19.5 5 17 13 12 20 C8 25.5 4 28 0 28 ' +
  'C-4 28 -8 25.5 -12 20 C-17 13 -19.5 5 -19.5 -6 C-19.5 -19 -11 -26 0 -26 Z';

/** El ojo grande de la serie: blanco, iris oscuro casi entero y dos brillos. */
function OjoAnime({ x, lado, color, id }: { x: number; lado: 1 | -1; color: string; id: string }) {
  const blanco = 'M-6 -1 Q-5 -5.2 0 -5.4 Q5 -5.2 6 -1.5 Q6 4.6 0 5.5 Q-6 4.8 -6 -1 Z';
  return (
    <g transform={`translate(${x} 4) scale(${lado} 1)`}>
      <defs>
        <clipPath id={id}>
          <path d={blanco} />
        </clipPath>
      </defs>
      <path d={blanco} fill="#fdfcfa" />
      <g clipPath={`url(#${id})`}>
        <ellipse cx="0.9" cy="0.6" rx="3.7" ry="4.6" fill={sombra(color, 0.7)} />
        <ellipse cx="0.9" cy="1.2" rx="2.9" ry="3.4" fill={color} />
        <ellipse cx="0.9" cy="0.8" rx="1.8" ry="2.5" fill="#111" />
        <circle cx="-0.6" cy="-1.5" r="1.5" fill="#fff" />
        <circle cx="2.3" cy="2.8" r="0.7" fill="#fff" opacity="0.85" />
        <path d="M-7 -6 H7 V-2.5 Q0 -1 -7 -3 Z" fill="#000" opacity="0.2" />
      </g>
      {/* Párpado de arriba, grueso y con el rabillo hacia fuera. */}
      <path
        d="M-8.4 1.2 L-7 -0.2 Q-6 -5.8 0 -6 Q5 -5.8 7 -2.4"
        fill="none"
        stroke={TINTA}
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M-4.6 4.4 Q0 6.6 4.8 4.4" fill="none" stroke={TINTA} strokeWidth="0.8" opacity="0.5" />
    </g>
  );
}

/**
 * La cabeza de la serie. `gorra` le pone la de Benji; `grito`, la boca
 * abierta del que grita el nombre del tiro.
 */
export function CabezaAnime({
  face,
  pelo,
  gorra,
  grito,
  cinta,
}: {
  face: Face;
  pelo: PeloAnime;
  gorra?: boolean;
  grito?: boolean;
  /** Color de la cinta del pelo, si la lleva. */
  cinta?: string;
}) {
  const hair = PELOS_ANIME[pelo];
  const uid = `${pelo}-${face.skin}-${face.eyes}-${gorra ? 'g' : ''}`.replace(/#/g, '');

  return (
    <g>
      {/* Lo de detrás: la masa del pelo, que abulta más que la cabeza. */}
      {hair.back && !gorra && (
        <path d={hair.back} fill={face.hair} stroke={TINTA} strokeWidth="1.3" strokeLinejoin="round" />
      )}

      {/* Cuello, ancho: son futbolistas. */}
      <path d="M-8 13 H8 V36 H-8 Z" fill={face.skin} stroke={TINTA} strokeWidth="1.1" />
      <path d="M-8 13 H8 V21 Q0 26 -8 21 Z" fill="#000" opacity="0.18" />

      {/* Orejas. */}
      {[-1, 1].map((s) => (
        <g key={s}>
          <ellipse cx={19.3 * s} cy="3" rx="3.2" ry="5" fill={face.skin} stroke={TINTA} strokeWidth="1.1" />
          <path d={`M${18.6 * s} 0.5 Q${20.4 * s} 3 ${18.8 * s} 5.6`} fill="none" stroke={TINTA} strokeWidth="0.7" opacity="0.6" />
        </g>
      ))}

      {/* La cara, con su sombra plana del lado izquierdo. */}
      <path d={CARA_ANIME} fill={face.skin} stroke={TINTA} strokeWidth="1.6" />
      <path
        d="M-6 -26 C-14 -24 -19.5 -17 -19.5 -6 C-19.5 5 -17 13 -12 20 C-8 25.5 -4 28 0 28 C-5 23 -9.6 17 -12.6 10 C-15 4 -15.6 -4 -14.6 -12 Z"
        fill="#000"
        opacity="0.13"
      />
      {/* La sombra que echa el pelo en la frente. */}
      <path d="M-17 -3 Q0 3 17 -3 L17 1 Q0 7 -17 1 Z" fill="#000" opacity="0.1" />

      {/* Cejas gruesas, bajando hacia la nariz: la cara de ir a por todas. */}
      {[1, -1].map((s) => (
        <path key={s} d="M-14.2 -8.2 L-3 -4.6 L-3.4 -2.4 L-14 -5.8 Z" transform={`scale(${s} 1)`} fill={TINTA} />
      ))}

      <OjoAnime x={-8.2} lado={1} color={face.eyes} id={`oa-${uid}-i`} />
      <OjoAnime x={8.2} lado={-1} color={face.eyes} id={`oa-${uid}-d`} />

      {/* Nariz: una sombra en ángulo. */}
      <path d="M1.2 8 L-1.6 12.8 L1.6 13" fill="none" stroke={TINTA} strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />

      {/* Boca: una raya, o abierta gritando. */}
      {grito ? (
        <g>
          <path d="M-5 16.4 Q0 15.4 5 16.4 Q4.6 23.8 0 24.2 Q-4.6 23.8 -5 16.4 Z" fill="#5b1414" stroke={TINTA} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M-4.4 16.7 Q0 16 4.4 16.7 L4.1 18.2 Q0 17.6 -4.1 18.2 Z" fill="#fff" />
          <ellipse cx="0" cy="22" rx="2.6" ry="1.3" fill="#e26d6d" />
        </g>
      ) : (
        <path d="M-3.8 18.6 Q0 17.8 3.8 18.6" fill="none" stroke={TINTA} strokeWidth="1.4" strokeLinecap="round" />
      )}

      {/* El pelo de delante, con su brillo. Con gorra sólo asoman los
          mechones de los lados. */}
      {gorra ? (
        <g fill={face.hair} stroke={TINTA} strokeWidth="1.1" strokeLinejoin="round">
          <path d="M-20.5 -10 L-23 4 L-19.5 -1 L-18.5 6 L-15.5 -7 Z" />
          <path d="M20.5 -10 L23 4 L19.5 -1 L18.5 6 L15.5 -7 Z" />
        </g>
      ) : (
        <g>
          <path d={hair.front} fill={face.hair} stroke={TINTA} strokeWidth="1.3" strokeLinejoin="round" />
          {pelo !== 'rapado' && (
            <g fill="none" stroke="#fff" strokeLinecap="round" opacity="0.32">
              <path d="M-11 -22 Q-4 -26 3 -24" strokeWidth="1.8" />
              <path d="M6 -24 Q10 -23 13 -20" strokeWidth="1.2" />
            </g>
          )}
        </g>
      )}

      {cinta && !gorra && (
        <g stroke={TINTA} strokeWidth="1.3" strokeLinejoin="round">
          <path d="M-21 -14 Q0 -21 21 -14 L21 -8 Q0 -15 -21 -8 Z" fill={cinta} />
          <path d="M-20 -12 L-30 -5 L-26 -1 L-19 -8 Z" fill={cinta} />
          <path d="M-20 -11 L-28 1 L-23 3 L-19 -7 Z" fill={cinta} />
        </g>
      )}

      {/* La gorra negra de Benji, la de las fotos: cúpula, visera de frente
          que le tapa las cejas y el escudito amarillo. */}
      {gorra && (
        <g>
          <path d="M-21.5 -9 C-22.5 -26 -11 -34 0 -34 C11 -34 22.5 -26 21.5 -9 Z" fill={GORRA} stroke={TINTA} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M6 -30 Q13 -27 15.5 -19" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.35" />
          <path d="M-3.4 -15 L0 -22 L3.4 -15 Z" fill={AMARILLO} />
          <path d="M-23.5 -10.5 Q0 -17 23.5 -10.5 Q12.5 -3.2 0 -3.6 Q-12.5 -3.2 -23.5 -10.5 Z" fill="#0b0b0d" stroke={TINTA} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M-18 -3 Q0 3 18 -3 L18 1 Q0 7 -18 1 Z" fill="#000" opacity="0.14" />
        </g>
      )}
    </g>
  );
}

/* -------------------------------------------------------------------------
 * Quién tira
 * ----------------------------------------------------------------------- */

/** El que tira: uno de casa o uno de la serie. */
export type TiradorId = Casero | SerieId;

/** Los de la serie que pueden tirar. */
export type SerieId = 'oliver' | 'mark' | 'tom' | 'julian' | 'philip' | 'bruce' | 'derrick' | 'ed';

/** En el orden en que salen en el cara a cara. */
export const SERIE_ORDER: SerieId[] = ['oliver', 'mark', 'derrick', 'tom', 'julian', 'philip', 'bruce', 'ed'];

export interface Tirador {
  /** Cómo se llama, para el narrador. Los de casa lo reciben de su perfil. */
  name?: string;
  /** Cómo se le llama en la ficha pequeña, donde no cabe el nombre entero. */
  short?: string;
  face: Face;
  kit: string;
  shorts: string;
  /** La franja de las medias. */
  band: string;
  /** El color del dorsal, que sobre una camiseta blanca no puede ser blanco. */
  number: string;
  dorsal: string;
  /** Arremangado. */
  bare?: boolean;
  /** Una línea para elegirlo. */
  tagline?: string;
  /** La cinta del pelo, del color que sea: la de Philip Callaghan. */
  headband?: string;
  /** Son dos: los gemelos Derrick tiran juntos, y el segundo lleva este dorsal. */
  twin?: string;
  /** El peinado de la serie. */
  pelo: PeloAnime;
  /** El color de las medias. */
  socks?: string;
  /** El vivo de las mangas. */
  trim?: string;
  /** El brazalete de capitán. */
  captain?: boolean;
  /** Guantes de portero, del color que sean: Ed Warner tira con ellos puestos. */
  gloves?: string;
}

/**
 * Los de la serie, dibujados con las mismas piezas que los peques para que
 * convivan en el mismo cuadro: Oliver con su 10 y la camiseta blanca, Mark
 * Lenders moreno, de negro y arremangado, y Tom con el azul de la selección.
 */
export const DE_LA_SERIE: Record<SerieId, Tirador> = {
  oliver: {
    name: 'Oliver',
    short: 'Oliver',
    face: faceOf('serie:oliver', { skin: 1, hairColor: 'negro', hair: 'corto', beard: 'no', eyes: 'marrón' }),
    kit: '#f8fafc',
    shorts: '#f8fafc',
    band: '#1d4ed8',
    number: '#1d4ed8',
    dorsal: '10',
    trim: '#1d4ed8',
    pelo: 'mata',
    captain: true,
    tagline: 'El capitán',
  },
  mark: {
    // En España fue Mark Lenders y en Latinoamérica Steve Hyuga: el mismo
    // Kojiro Hyuga del Tiro del Tigre. Se le llama por el nombre con el que
    // lo pidió Víctor, y el otro va debajo.
    name: 'Steve Hyuga',
    short: 'Hyuga',
    face: faceOf('serie:mark', { skin: 3, hairColor: 'negro', hair: 'rizado', beard: 'no', eyes: 'marrón' }),
    kit: '#1e2a78',
    shorts: '#f4f4f2',
    band: '#f4f4f2',
    socks: '#1e2a78',
    number: '#fff',
    dorsal: '10',
    bare: true,
    pelo: 'salvaje',
    tagline: 'Mark Lenders · el Tigre',
  },
  tom: {
    name: 'Tom',
    short: 'Tom',
    face: faceOf('serie:tom', { skin: 1, hairColor: 'castaño claro', hair: 'corto', beard: 'no', eyes: 'miel' }),
    kit: '#1d4ed8',
    shorts: '#f4f4f2',
    band: '#f4f4f2',
    socks: '#1d4ed8',
    number: '#fff',
    dorsal: '11',
    pelo: 'peinado',
    tagline: 'El artista',
  },
  derrick: {
    name: 'Los gemelos Derrick',
    short: 'Derrick',
    face: faceOf('serie:derrick', { skin: 2, hairColor: 'castaño', hair: 'corto', beard: 'no', eyes: 'marrón' }),
    kit: '#facc15',
    shorts: '#1f2937',
    band: '#1f2937',
    number: '#1f2937',
    dorsal: '7',
    twin: '8',
    pelo: 'mata',
    tagline: 'La catapulta infernal',
  },
  julian: {
    name: 'Julian Ross',
    short: 'Julian',
    face: faceOf('serie:julian', { skin: 1, hairColor: 'castaño claro', hair: 'tupé', beard: 'no', eyes: 'azul' }),
    kit: '#38bdf8',
    shorts: '#f4f4f2',
    band: '#0c4a6e',
    number: '#0c4a6e',
    dorsal: '14',
    pelo: 'peinado',
    tagline: 'El príncipe del campo',
  },
  philip: {
    name: 'Philip Callaghan',
    short: 'Philip',
    face: faceOf('serie:philip', { skin: 2, hairColor: 'negro', hair: 'corto', beard: 'no', eyes: 'marrón' }),
    kit: '#0f766e',
    shorts: '#f4f4f2',
    band: '#f4f4f2',
    number: '#fff',
    dorsal: '9',
    headband: '#f4f4f2',
    pelo: 'mata',
    tagline: 'El del norte, con su cinta',
  },
  bruce: {
    name: 'Bruce Harper',
    short: 'Bruce',
    face: faceOf('serie:bruce', { skin: 2, hairColor: 'negro', hair: 'rapado', beard: 'no', eyes: 'marrón' }),
    kit: '#f8fafc',
    shorts: '#1d4ed8',
    band: '#1d4ed8',
    number: '#1d4ed8',
    dorsal: '4',
    trim: '#1d4ed8',
    pelo: 'rapado',
    tagline: 'Para con la cara',
  },
  // Ken Wakashimazu, que aquí fue Ed Warner: el portero karateka del Toho,
  // melena hasta los hombros y cinta, que también sabe tirar. Sale con los
  // guantes puestos, que es lo que dice que es portero.
  ed: {
    name: 'Ed Warner',
    short: 'Ed',
    face: faceOf('serie:ed', { skin: 2, hairColor: 'negro', hair: 'largo', beard: 'no', eyes: 'marrón' }),
    kit: '#f97316',
    shorts: '#18181b',
    band: '#18181b',
    socks: '#f97316',
    number: '#18181b',
    dorsal: '1',
    trim: '#18181b',
    pelo: 'melena',
    headband: '#dc2626',
    gloves: '#f4f4f2',
    tagline: 'El portero karateka',
  },
};

/** Si ese identificador es de uno de la serie. */
export function esDeLaSerie(id: string): id is SerieId {
  return id in DE_LA_SERIE;
}

/** Cómo se dibuja a cada uno. */
export function tiradorDe(id: TiradorId): Tirador {
  if (esDeLaSerie(id)) return DE_LA_SERIE[id];
  return {
    face: caraDe(id),
    kit: ROPA_FAMILIA[id],
    shorts: CALZONA,
    band: ROPA_FAMILIA[id],
    // Medias del color del equipo con el vuelto blanco: unas medias blancas
    // se comen media pierna y dejan al jugador partido en dos.
    socks: sombra(ROPA_FAMILIA[id], 0.92),
    number: '#fff',
    dorsal: id === 'leo' ? '10' : id === 'hugo' ? '7' : '1',
    // Leo, moreno, con la mata de Oliver; Hugo, rubio, de punta.
    pelo: id === 'hugo' ? 'punta' : 'mata',
  };
}

/**
 * La cabeza de un tirador, en el sistema de la cabeza: la de su cromo más lo
 * que le distingue —la cinta de Callaghan—.
 */
function CabezaDe({ player, grito }: { player: Tirador; grito?: boolean }) {
  return <CabezaAnime face={player.face} pelo={player.pelo} cinta={player.headband} grito={grito} />;
}

/** Las articulaciones de una pose del que tira. Mira siempre hacia la portería. */
interface Pose {
  /** Centro de la cabeza. */
  head: P;
  shoulder: P;
  hip: P;
  /** Brazo y pierna del lado de acá, que se pintan por delante del cuerpo. */
  nearArm: [P, P, P];
  nearLeg: [P, P, P];
  /** Y los del lado de allá, que se pintan por detrás. */
  farArm: [P, P, P];
  farLeg: [P, P, P];
  /** Cuánto se inclina la cabeza. */
  tilt: number;
}

/**
 * Las poses del que tira, con las proporciones de la serie: cabeza pequeña,
 * tronco corto y **piernas larguísimas**, casi la mitad del cuerpo.
 *
 *  · `espera`  — de pie junto al balón, mirando la portería. Es la pose en
 *    la que se está apuntando, así que tiene que estar quieta y no distraer.
 *  · `carrera` — **la pierna armada**: el pie de apoyo junto al balón y la de
 *    golpeo echada atrás hasta arriba, con los brazos abiertos. Es el
 *    fotograma que la serie congela antes de cada tiro, y el que se ve
 *    mientras corre la barra de fuerza.
 *  · `golpeo`  — el latigazo: la pierna estirada del todo hacia delante y
 *    hacia arriba, el tronco echado atrás y la estela del barrido detrás.
 *  · `celebra` — los dos brazos arriba.
 */
const POSES: Record<'espera' | 'carrera' | 'golpeo' | 'celebra', Pose> = {
  espera: {
    head: [58, 34],
    shoulder: [58, 60],
    hip: [58, 108],
    // Los brazos, pegados al cuerpo y con el codo algo doblado: separados
    // como estaban, el muñeco parecía un espantapájaros.
    nearArm: [[72, 64], [79, 86], [76, 104]],
    nearLeg: [[64, 108], [69, 155], [70, 200]],
    farArm: [[44, 64], [37, 86], [40, 104]],
    farLeg: [[52, 108], [48, 155], [47, 200]],
    tilt: 0,
  },
  carrera: {
    head: [62, 34],
    shoulder: [60, 60],
    hip: [62, 108],
    nearArm: [[74, 64], [96, 56], [112, 40]],
    nearLeg: [[66, 108], [42, 140], [12, 124]],
    farArm: [[46, 64], [26, 74], [10, 60]],
    farLeg: [[58, 108], [74, 152], [82, 200]],
    tilt: -6,
  },
  golpeo: {
    head: [50, 36],
    shoulder: [52, 62],
    hip: [60, 110],
    nearArm: [[64, 66], [82, 50], [100, 38]],
    nearLeg: [[66, 110], [92, 96], [118, 74]],
    farArm: [[40, 66], [22, 62], [6, 46]],
    farLeg: [[56, 110], [56, 157], [54, 202]],
    tilt: 10,
  },
  celebra: {
    head: [58, 34],
    shoulder: [58, 60],
    hip: [58, 108],
    nearArm: [[72, 62], [88, 40], [96, 14]],
    nearLeg: [[64, 108], [73, 155], [80, 200]],
    farArm: [[44, 62], [28, 40], [20, 14]],
    farLeg: [[52, 108], [45, 155], [38, 200]],
    tilt: 0,
  },
};

export type PoseChutador = keyof typeof POSES;

/**
 * El cuerpo entero de un tirador en una pose. Va aparte del `Chutador` para
 * poder pintarlo dos veces: los gemelos Derrick salen juntos.
 */
function Cuerpo({ player, body, dorsal, grito }: { player: Tirador; body: Pose; dorsal: string; grito?: boolean }) {
  const { face, kit } = player;
  const piel = face.skin;
  const media = player.socks ?? MEDIAS;
  const spine = rumbo(body.hip, body.shoulder) + 90;
  const torso = largo(body.hip, body.shoulder) / 48;

  /** Un brazo entero: manga, antebrazo y mano, cada pieza en su sitio. */
  const brazo = (points: [P, P, P], flip: 1 | -1) => (
    <>
      <Pieza from={points[0]} to={points[1]} base={23} flip={flip}>
        <BrazoAlto piel={piel} manga={kit} vivo={player.trim ?? '#fff'} desnudo={player.bare} />
      </Pieza>
      <Pieza from={points[1]} to={points[2]} base={20} flip={flip}>
        <Antebrazo piel={piel} />
      </Pieza>
      <Mano at={points[2]} angle={rumbo(points[1], points[2])} piel={piel} guante={player.gloves} />
    </>
  );

  /** Y una pierna: muslo, media y bota. */
  const pierna = (points: [P, P, P], flip: 1 | -1) => (
    <>
      <Pieza from={points[0]} to={points[1]} base={31} flip={flip}>
        <Muslo piel={piel} />
      </Pieza>
      <Pieza from={points[1]} to={points[2]} base={28} flip={flip}>
        <Pantorrilla media={media} vuelto={player.band} />
      </Pieza>
      <Bota at={points[2]} angle={rumbo(points[1], points[2])} flip={flip} />
    </>
  );

  return (
    <g>
      {/* Lo de detrás, un punto apagado para que se lea más lejos. */}
      <g opacity="0.82">
        {brazo(body.farArm, -1)}
        {pierna(body.farLeg, -1)}
      </g>

      {/* La pierna de acá va por debajo de la calzona, como en un cuerpo. */}
      {pierna(body.nearLeg, 1)}

      <g transform={`translate(${body.hip[0]} ${body.hip[1]}) rotate(${spine}) scale(1 ${torso})`}>
        <Calzona tela={player.shorts} ribete={player.band} />
      </g>

      <g transform={`translate(${body.shoulder[0]} ${body.shoulder[1]}) rotate(${spine})`}>
        <Cuello piel={piel} />
      </g>

      <g transform={`translate(${body.hip[0]} ${body.hip[1]}) rotate(${spine}) scale(1 ${torso})`}>
        <Tronco camiseta={kit} vivo={player.trim ?? '#fff'} dorsal={dorsal} numero={player.number} />
      </g>

      {/* La cabeza, la misma de su cromo, pequeña: en la serie los
          jugadores miden seis cabezas y media. */}
      <g transform={`translate(${body.head[0]} ${body.head[1]}) rotate(${body.tilt}) scale(0.62)`}>
        <CabezaDe player={player} grito={grito} />
      </g>

      {/* Y el brazo de delante, encima de todo. */}
      {brazo(body.nearArm, 1)}
      {player.captain && (
        <g transform={`translate(${body.nearArm[0][0]} ${body.nearArm[0][1]}) rotate(${rumbo(body.nearArm[0], body.nearArm[1]) - 90})`}>
          <path d="M-6.4 13 C-1.6 15.4 3.2 15.4 6.6 13 L6.2 17.6 C2.8 19.8 -1.8 19.8 -6 17.6 Z" fill="#facc15" stroke={TINTA} strokeWidth="1.1" />
        </g>
      )}
    </g>
  );
}


/**
 * El que tira: uno de los dos peques, entero y a tamaño de protagonista.
 *
 * El lienzo es de 120×210 con los pies en la parte de abajo, así que se
 * coloca en la escena con un `translate` y se hace grande o pequeño con el
 * alto de la caja que lo contiene.
 */
export function Chutador({
  who,
  pose,
  className,
  aura,
}: {
  who: TiradorId;
  pose: PoseChutador;
  className?: string;
  /** El color del tiro especial: le rodea con su aura, como en la serie. */
  aura?: string;
}) {
  const player = tiradorDe(who);
  const body = POSES[pose];

  return (
    <svg viewBox="0 0 120 210" className={className} aria-hidden overflow="visible">
      {/* El aura del especial: la silueta entera ardiendo de su color. */}
      {aura && (
        <g opacity="0.55" style={{ filter: `blur(3px)` }}>
          <circle cx={body.shoulder[0]} cy={body.shoulder[1] + 20} r="46" fill={aura} />
          <circle cx={body.head[0]} cy={body.head[1]} r="26" fill={aura} />
        </g>
      )}

      {/* La estela del barrido de la pierna, en el latigazo: el arco blanco
          que en la serie dice a qué velocidad ha pasado. */}
      {pose === 'golpeo' && (
        <g fill="none" strokeLinecap="round">
          <path d="M14 128 Q38 200 118 74" stroke="#fff" strokeWidth="5" opacity="0.8" />
          <path d="M22 136 Q44 190 110 80" stroke={aura ?? '#fff'} strokeWidth="2.5" opacity="0.9" />
          <path d="M8 118 Q30 206 124 66" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
        </g>
      )}

      {/* Los gemelos tiran juntos, y el segundo va detrás, sincronizado: es la
          gracia de los Derrick. */}
      {player.twin && (
        <g transform="translate(-30 -8) scale(0.9)" opacity="0.92">
          <Cuerpo player={player} body={body} dorsal={player.twin} grito={pose === 'golpeo' || pose === 'celebra'} />
        </g>
      )}
      <Cuerpo player={player} body={body} dorsal={player.dorsal} grito={pose === 'golpeo' || pose === 'celebra'} />
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * Benji
 * ----------------------------------------------------------------------- */

/**
 * La cara de Benji. Pelo negro y corto por debajo de la gorra, ojos oscuros,
 * sin barba: un chaval de la edad de los peques, que es lo que era en la
 * serie cuando paraba en el Nankatsu.
 */
export const CARA_BENJI: Face = faceOf('benji', {
  skin: 1,
  hairColor: 'negro',
  hair: 'corto',
  beard: 'no',
  eyes: 'marrón',
});

/**
 * La gorra: negra, la de las fotos que pasó Víctor —la de «Campeones hacia
 * el Mundial»—. Es lo primero que se ve de él, y lo que dice quién es.
 */
export const GORRA = '#17171b';

/** El amarillo de sus rayas, su escudo y sus guantes. */
const AMARILLO = '#facc15';

/** La camiseta de portero: negra, con las rayas amarillas de los hombros. */
const JERSEY_BENJI = '#26272d';

/**
 * La gorra, dibujada en el sistema de la cabeza —el centro en el origen—.
 * Cúpula, visera de frente que le tapa el arranque de las cejas, botón
 * arriba y una costura: con eso ya es la gorra de Benji y no un casco.
 */
export function Gorra() {
  return (
    <g>
      <path
        d="M-22.5 -9 C-23 -25 -12.5 -33 0 -33 C12.5 -33 23 -25 22.5 -9 Z"
        fill={GORRA}
        stroke={TINTA}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Sombra plana de un lado. */}
      <path d="M-22.5 -9 C-23 -22 -16 -30 -8 -32 C-14 -26 -16 -18 -15.5 -9 Z" fill="#000" opacity="0.2" />
      {/* Costura del centro y botón. */}
      <path d="M0 -33 V-10" stroke={TINTA} strokeWidth="1" opacity="0.5" />
      <circle cx="0" cy="-33" r="2" fill={GORRA} stroke={TINTA} strokeWidth="1" />
      {/* Brillo. */}
      <path d="M6 -29 Q13 -26 15 -19" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
      {/* La visera, de frente: una media luna por debajo de la cúpula. */}
      <path
        d="M-24 -10.5 Q0 -17 24 -10.5 Q13 -3.6 0 -3.8 Q-13 -3.6 -24 -10.5 Z"
        fill={sombra(GORRA, 0.72)}
        stroke={TINTA}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Las articulaciones de una pose de Benji, de frente y mirando al que tira. */
interface PoseBenji {
  head: P;
  shoulder: P;
  hip: P;
  armA: [P, P, P];
  armB: [P, P, P];
  legA: [P, P, P];
  legB: [P, P, P];
  /** Giro extra de la cabeza sobre el del tronco. */
  tilt: number;
}

/**
 * Las poses de Benji, en un lienzo de 160×150 con los pies abajo.
 *
 *  · `espera`   — agachado en la línea, piernas abiertas y los guantes por
 *    delante: la estampa de Benji en la serie, que ocupa portería.
 *  · `estirada` — el vuelo a una esquina, con el cuerpo en horizontal y los
 *    dos guantes por delante de la cabeza. Se dibuja hacia la derecha y la
 *    escena la espeja para la izquierda y la inclina para arriba o abajo.
 *  · `salto`    — arriba por el centro: brazos estirados por encima.
 *  · `agachado` — abajo por el centro: se echa al suelo con las manos juntas.
 */
const POSES_BENJI: Record<'espera' | 'estirada' | 'salto' | 'agachado', PoseBenji> = {
  espera: {
    head: [80, 36],
    shoulder: [80, 60],
    hip: [80, 100],
    armA: [[66, 62], [46, 76], [36, 60]],
    armB: [[94, 62], [114, 76], [124, 60]],
    legA: [[72, 100], [56, 120], [60, 145]],
    legB: [[88, 100], [104, 120], [100, 145]],
    tilt: 0,
  },
  estirada: {
    head: [112, 60],
    shoulder: [96, 72],
    hip: [58, 86],
    armA: [[100, 66], [124, 52], [148, 42]],
    armB: [[94, 78], [120, 70], [148, 62]],
    legA: [[56, 80], [34, 82], [12, 76]],
    legB: [[60, 92], [38, 102], [16, 104]],
    tilt: 0,
  },
  salto: {
    head: [80, 40],
    shoulder: [80, 63],
    hip: [80, 102],
    armA: [[68, 64], [62, 38], [60, 12]],
    armB: [[92, 64], [98, 38], [100, 12]],
    legA: [[72, 102], [62, 122], [70, 142]],
    legB: [[88, 102], [98, 122], [90, 142]],
    tilt: 0,
  },
  agachado: {
    head: [80, 70],
    shoulder: [80, 92],
    hip: [80, 120],
    armA: [[68, 94], [58, 116], [70, 136]],
    armB: [[92, 94], [102, 116], [90, 136]],
    legA: [[72, 120], [44, 128], [48, 146]],
    legB: [[88, 120], [116, 128], [112, 146]],
    tilt: 0,
  },
};

export type PoseBenjiId = keyof typeof POSES_BENJI;

/** Los cuatro vértices de un tramo grueso entre dos puntos, sea cual sea su giro. */
function losa(a: P, b: P, wa: number, wb: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  return [
    [a[0] + nx * wa, a[1] + ny * wa],
    [b[0] + nx * wb, b[1] + ny * wb],
    [b[0] - nx * wb, b[1] - ny * wb],
    [a[0] - nx * wa, a[1] - ny * wa],
  ]
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
}

/**
 * Benji, entero. El tronco se construye **a lo largo de la columna** —de la
 * cadera al hombro— y no como un rectángulo de pie, que es lo que permite
 * tumbarlo en una estirada sin que la camiseta se quede vertical.
 */
export function Benji({ pose, className }: { pose: PoseBenjiId; className?: string }) {
  const face = CARA_BENJI;
  const body = POSES_BENJI[pose];

  // Hacia dónde va la columna, para girar la cabeza con ella.
  const spine = (Math.atan2(body.shoulder[1] - body.hip[1], body.shoulder[0] - body.hip[0]) * 180) / Math.PI;
  const headTurn = spine + 90 + body.tilt;

  // El dorsal va a media espalda... de frente, en el pecho.
  const chest: P = [
    body.hip[0] + (body.shoulder[0] - body.hip[0]) * 0.52,
    body.hip[1] + (body.shoulder[1] - body.hip[1]) * 0.52,
  ];

  // La calzona arranca un poco por encima de la cadera y baja un poco.
  const dx = body.shoulder[0] - body.hip[0];
  const dy = body.shoulder[1] - body.hip[1];
  const len = Math.hypot(dx, dy) || 1;
  const up: P = [dx / len, dy / len];
  const shortsTop: P = [body.hip[0] + up[0] * 7, body.hip[1] + up[1] * 7];
  const shortsBottom: P = [body.hip[0] - up[0] * 11, body.hip[1] - up[1] * 11];

  return (
    <svg viewBox="0 0 160 150" className={className} aria-hidden overflow="visible">
      {/* Piernas, con las piezas dibujadas: muslo, media y bota. */}
      {[body.legA, body.legB].map((leg, i) => (
        <g key={`p${i}`} opacity={i === 0 ? 0.86 : 1}>
          <Pieza from={leg[0]} to={leg[1]} base={31} flip={i === 0 ? -1 : 1}>
            <Muslo piel={face.skin} />
          </Pieza>
          <Pieza from={leg[1]} to={leg[2]} base={28} flip={i === 0 ? -1 : 1}>
            <Pantorrilla media={GORRA} vuelto={AMARILLO} />
          </Pieza>
          <Bota at={leg[2]} angle={rumbo(leg[1], leg[2])} flip={i === 0 ? -1 : 1} />
        </g>
      ))}

      {/* Calzona y camiseta de portero: negra, con las rayas de los hombros. */}
      <g transform={`translate(${body.hip[0]} ${body.hip[1]}) rotate(${headTurn}) scale(1 ${largo(body.hip, body.shoulder) / 48})`}>
        <Calzona tela="#111827" ribete={AMARILLO} />
        <Tronco camiseta={JERSEY_BENJI} vivo="#dc2626" dorsal="1" numero="#fff" franjas={AMARILLO} />
      </g>

      {/* Brazos, por delante del pecho: son lo que para. */}
      {[body.armA, body.armB].map((arm, i) => (
        <g key={`b${i}`} opacity={i === 0 ? 0.9 : 1}>
          <Pieza from={arm[0]} to={arm[1]} base={23} flip={i === 0 ? -1 : 1}>
            <BrazoAlto piel={face.skin} manga={JERSEY_BENJI} vivo={AMARILLO} />
          </Pieza>
          <Pieza from={arm[1]} to={arm[2]} base={20} flip={i === 0 ? -1 : 1}>
            <Antebrazo piel={face.skin} />
          </Pieza>
          <Mano at={arm[2]} angle={rumbo(arm[1], arm[2])} piel={face.skin} guante={AMARILLO} tamano={1.4} />
        </g>
      ))}

      {/* La cabeza, con su gorra. */}
      <g transform={`translate(${body.head[0]} ${body.head[1]}) rotate(${headTurn}) scale(0.62)`}>
        <path d="M-9 20 Q0 26 9 20 L9 30 Q0 34 -9 30 Z" fill={JERSEY_BENJI} stroke={TINTA} strokeWidth="1.4" />
        <CabezaAnime face={face} pelo="mata" gorra />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * Las caras en su recuadro
 * ----------------------------------------------------------------------- */

/**
 * Una cara de cerca, en su viñeta, con las rayas convergentes detrás.
 *
 * Es el plano que hace el anime cada vez que alguien va a chutar o a parar:
 * se corta la acción y se le ve la cara, con las rayas de velocidad detrás.
 * Aquí sale en tres sitios: mientras se coge fuerza, en el cara a cara del
 * principio y en el marcador.
 */
export function Vineta({
  who,
  className,
  rayas = true,
  fill = false,
}: {
  /** Uno de casa, uno de la serie, o Benji. */
  who: TiradorId | 'benji';
  className?: string;
  rayas?: boolean;
  /** Llenar la caja aunque no sea cuadrada, recortando lo que sobre. */
  fill?: boolean;
}) {
  const benji = who === 'benji';
  const player = benji ? null : tiradorDe(who);
  const face = player ? player.face : CARA_BENJI;
  const fondo = player ? (player.kit === '#f8fafc' ? '#60a5fa' : player.kit) : '#1f2a37';
  const id = `vineta-${who}`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio={fill ? 'xMidYMid slice' : undefined} className={className} aria-hidden>
      <defs>
        <clipPath id={id}>
          <rect x="-100" y="-100" width="300" height="300" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${id})`}>
        <rect x="-100" y="-100" width="300" height="300" fill={fondo} />

        {rayas && (
          <g opacity={benji ? 0.35 : 0.5}>
            {Array.from({ length: 24 }, (_, i) => (
              <path
                key={i}
                d="M-6 0 L0 -140 L6 0 Z"
                fill={benji ? '#f87171' : '#fff'}
                transform={`translate(50 50) rotate(${i * 15})`}
              />
            ))}
          </g>
        )}

        {/* La cara, grande y baja: se busca el gesto, no el peinado. */}
        {player?.twin ? (
          // Los gemelos, las dos caras juntas.
          <>
            <g transform="translate(29 64) scale(1.05)">
              <CabezaDe player={player} />
            </g>
            <g transform="translate(71 64) scale(1.05)">
              <CabezaDe player={player} />
            </g>
          </>
        ) : (
          <g transform="translate(50 62) scale(1.5)">
            {player ? <CabezaDe player={player} /> : <CabezaAnime face={face} pelo="mata" gorra />}
          </g>
        )}
      </g>
    </svg>
  );
}

/** Se conserva el nombre con el que la usaba la tanda. */
export function Primerplano({ who, className }: { who: Casero; className?: string }) {
  return <Vineta who={who} className={className} />;
}

/* -------------------------------------------------------------------------
 * El balón
 * ----------------------------------------------------------------------- */

/**
 * El balón de toda la vida, dibujado y no un emoji: el emoji sale distinto
 * en cada móvil, y en alguno ni siquiera es blanco y negro. Pentágono en el
 * centro, cuatro trozos asomando por el borde, tinta y un brillo.
 */
export function Balon({ className }: { className?: string }) {
  return (
    <svg viewBox="-12 -12 24 24" className={className} aria-hidden>
      <defs>
        <clipPath id="balon">
          <circle r="10.4" />
        </clipPath>
      </defs>
      <circle r="10.4" fill="#fdfdfb" />
      <g clipPath="url(#balon)" fill="#1c1917">
        <path d="M0 -4.2 L4 -1.3 L2.5 3.4 L-2.5 3.4 L-4 -1.3 Z" />
        <path d="M0 -14 L3 -11.6 L1.8 -8.6 L-1.8 -8.6 L-3 -11.6 Z" />
        <path d="M11.8 -4.6 L13 -1 L10.6 1.8 L8.2 -0.6 L9 -4 Z" />
        <path d="M-11.8 -4.6 L-13 -1 L-10.6 1.8 L-8.2 -0.6 L-9 -4 Z" />
        <path d="M6.6 8.2 L9.4 10.8 L6 13.4 L3.6 11 L4.4 8 Z" />
        <path d="M-6.6 8.2 L-9.4 10.8 L-6 13.4 L-3.6 11 L-4.4 8 Z" />
        <g stroke="#1c1917" strokeWidth="0.8" fill="none">
          <path d="M0 -4.2 V-8.6 M4 -1.3 L8.2 -0.6 M-4 -1.3 L-8.2 -0.6 M2.5 3.4 L4.4 8 M-2.5 3.4 L-4.4 8" />
        </g>
        {/* Sombra plana de abajo. */}
        <path d="M-10.4 2 Q0 12 10.4 2 V12 H-10.4 Z" fill="#000" opacity="0.14" />
      </g>
      <circle r="10.4" fill="none" stroke={TINTA} strokeWidth="1.5" />
      <path d="M-6 -6.6 Q-3 -9 1 -9" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * El estadio
 * ----------------------------------------------------------------------- */

/**
 * Una nube de las de la serie: algodón blanco con la tripa azulada y plana,
 * sin línea de tinta, que en el anime las nubes no la llevan.
 */
/**
 * Una torre de luz encendida: el mástil, el panel de focos y el halo. De
 * noche la torre no se ve: se ve la luz, así que lo que manda es el halo.
 */
function Torre({ x }: { x: number }) {
  return (
    <g>
      <path d={`M${x - 2.4} 74 L${x - 1.2} 18 L${x + 1.2} 18 L${x + 2.4} 74 Z`} fill="#2c3950" />
      <circle cx={x} cy="12" r="26" fill="url(#halo)" />
      <rect x={x - 13} y="3" width="26" height="15" rx="2" fill="#39465e" />
      {[0, 1, 2].map((col) =>
        [0, 1].map((row) => (
          <circle key={`${col}${row}`} cx={x - 7 + col * 7} cy={7.5 + row * 6} r="2.4" fill="#fffbe6" />
        )),
      )}
    </g>
  );
}

/**
 * Las luces de la grada: puntos de gente iluminada por los focos. Van en
 * filas escalonadas y con tres tonos, que es lo que hace que de lejos parezca
 * gente y no una trama de lunares.
 */
function Grada({ y, filas, alto }: { y: number; filas: number; alto: number }) {
  const tonos = ['#f7d9a8', '#ffe9c2', '#cfd8ea', '#f3c9a0', '#e8eefc'];
  const puntos: React.ReactNode[] = [];

  for (let fila = 0; fila < filas; fila++) {
    const fy = y + 2 + fila * (alto / filas);
    // Las filas de atrás van más apretadas y más apagadas: profundidad.
    const paso = 7 + fila * 0.5;
    for (let i = 0; i < Math.ceil(400 / paso); i++) {
      const cx = (i * paso + (fila % 2 ? paso / 2 : 0)) % 402;
      const semilla = (fila * 37 + i * 91) % 100;
      // Ni todos iguales ni todos encendidos: la grada se lee por la mezcla.
      if (semilla % 5 === 0) continue;
      puntos.push(
        <circle
          key={`${fila}-${i}`}
          cx={cx + (semilla % 3) - 1}
          cy={fy + ((semilla % 4) - 1.5) * 0.4}
          r={1.25 - fila * 0.06}
          fill={tonos[semilla % tonos.length]}
          opacity={0.16 + (semilla % 7) * 0.045}
        />,
      );
    }
  }

  return <g>{puntos}</g>;
}

/**
 * La boca de la portería dentro del lienzo de 400×300 de la escena.
 * Tiene que casar con la caja en tanto por ciento de `PenaltyShootout`:
 * 13 % / 17 % / 74 % / 35 %.
 */
const MOUTH = { x: 52, y: 51, w: 296, h: 105 };

/**
 * Todo lo que no se mueve: cielo, nubes, grada, torres, valla, césped,
 * líneas y la portería con su red. Es un único SVG en 400×300 que se estira
 * a la caja 4:3 de la escena, así que todo encaja al píxel sin sumar capas.
 */
export function Estadio({
  className,
  name,
  color,
}: {
  className?: string;
  /** Lo que canta la grada en la pancarta: el nombre del que tira. */
  name: string;
  /** Y el color de su pancarta y de las bufandas. */
  color: string;
}) {
  const { x, y, w, h } = MOUTH;
  const right = x + w;
  const line = y + h;

  // El fondo de la portería: más estrecho y más alto que la boca, que es
  // lo que le da profundidad sin necesitar perspectiva de verdad.
  const back = { l: x + 18, r: right - 18, t: y + 9, b: line - 18 };

  // Franjas de siega que se ensanchan hacia uno: la perspectiva del anime.
  // Las franjas de siega, contadas desde el centro hacia los lados: se
  // abren hacia uno, que es la perspectiva sin necesidad de calcularla.
  const franjas = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        {/* Noche: el cielo casi negro arriba y el resplandor del estadio
            abajo, que es lo que se ve de verdad desde dentro de un campo. */}
        <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05070f" />
          <stop offset="0.6" stopColor="#0c1730" />
          <stop offset="1" stopColor="#1b2c50" />
        </linearGradient>
        <radialGradient id="halo">
          <stop offset="0" stopColor="#fff6cc" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff6cc" stopOpacity="0" />
        </radialGradient>
        {/* El charco de luz de los focos sobre el césped. */}
        <radialGradient id="foco" cx="0.5" cy="0.42" r="0.62">
          <stop offset="0" stopColor="#b9ffd0" stopOpacity="0.34" />
          <stop offset="0.55" stopColor="#7cf0a6" stopOpacity="0.12" />
          <stop offset="1" stopColor="#031409" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="palo" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#f1f5f9" />
          <stop offset="1" stopColor="#9aa7b8" />
        </linearGradient>
        {/* La red: rombos finos, más apretados en los laterales. */}
        <pattern id="red" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 H10 M0 0 V10" stroke="#dbe7f5" strokeWidth="0.55" opacity="0.5" />
        </pattern>
        <pattern id="red-lado" width="6.5" height="6.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 H6.5 M0 0 V6.5" stroke="#cdddf0" strokeWidth="0.45" opacity="0.38" />
        </pattern>
      </defs>

      {/* Cielo de noche con sus estrellas. */}
      <rect width="400" height="126" fill="url(#cielo)" />
      {[
        [30, 12],
        [96, 7],
        [150, 18],
        [232, 9],
        [286, 16],
        [352, 10],
      ].map(([sx, sy]) => (
        <circle key={sx} cx={sx} cy={sy} r="0.8" fill="#fff" opacity="0.5" />
      ))}

      <Torre x={20} />
      <Torre x={380} />

      {/* La grada: el bloque oscuro con la gente iluminada, y la visera
          encima, que es lo que le pone techo al estadio. */}
      <path d="M0 40 Q200 26 400 40 V104 H0 Z" fill="#0d1526" />
      <path d="M0 40 Q200 26 400 40 V50 H0 Z" fill="#070c18" />
      <Grada y={50} filas={7} alto={52} />
      <rect x="0" y="76" width="400" height="1.6" fill="#070c18" opacity="0.7" />

      {/* Pancartas en la grada: la del que tira, y una de ánimo. */}
      <g stroke={TINTA} strokeWidth="0.8">
        <rect x="6" y="84" width="44" height="14" rx="1" fill={color} />
        <rect x="352" y="85" width="42" height="12" rx="1" fill="#fde047" />
      </g>
      <g fontFamily="var(--font-pitch)" fontWeight="900" textAnchor="middle">
        <text x="28" y="94.6" fontSize="8" fill="#fff" stroke={TINTA} strokeWidth="0.5">
          ¡{name.toUpperCase()}!
        </text>
        <text x="373" y="94" fontSize="6.6" fill={TINTA}>
          ¡ÁNIMO!
        </text>
      </g>

      {/* La valla de publicidad, encendida por dentro. */}
      <rect x="0" y="104" width="400" height="15" fill="#0a1120" />
      {[0, 100, 200, 300].map((vx, i) => (
        <g key={vx}>
          <rect x={vx + 1} y="105.5" width="98" height="12" rx="1" fill={i % 2 ? '#123a8a' : '#101a2c'} />
          <text
            x={vx + 50}
            y="114.4"
            fontSize="7.6"
            fontWeight="900"
            fontFamily="var(--font-pitch)"
            textAnchor="middle"
            fill={i % 2 ? '#dbeafe' : '#fca5a5'}
            fontStyle="italic"
          >
            {['NANKATSU', 'CEA·DÍAZ', 'FÚTBOL', 'CAMPEONES'][i]}
          </text>
        </g>
      ))}

      {/* El césped. Primero el verde de fondo, después las franjas de siega
          en perspectiva —se abren hacia uno— y encima el charco de luz. */}
      <rect x="0" y="119" width="400" height="181" fill="#17803d" />
      {franjas.map((k) => (
        <path
          key={k}
          d={`M${200 + k * 34} 119 L${200 + (k + 1) * 34} 119 L${200 + (k + 1) * 92} 300 L${200 + k * 92} 300 Z`}
          fill="#ffffff"
          opacity={k % 2 ? 0.05 : 0}
        />
      ))}
      <rect x="0" y="119" width="400" height="181" fill="url(#foco)" />
      <path d="M0 119 H400 V140 H0 Z" fill="#04140b" opacity="0.28" />

      {/* Las líneas, en perspectiva: la de gol, el área pequeña, el área
          grande, el punto de penalti y la media luna. */}
      <g fill="none" stroke="#eaf6ee" strokeLinecap="round" opacity="0.85">
        <path d={`M0 ${line} H400`} strokeWidth="1.8" />
        <path d={`M${x - 34} ${line} L${x - 66} 188 H${right + 66} L${right + 34} ${line}`} strokeWidth="2" />
        <path d="M-26 232 H426" strokeWidth="2.4" />
        <path d={`M${x - 100} ${line} L-26 232 M${right + 100} ${line} L426 232`} strokeWidth="2.4" />
        <path d="M104 232 A 62 26 0 0 0 216 232" strokeWidth="2.2" />
      </g>
      <ellipse cx="160" cy="263" rx="7" ry="2.6" fill="#eaf6ee" opacity="0.9" />

      {/* La portería. Primero lo de dentro —el suelo, el fondo y los
          laterales, con su red— y después los palos, por delante. */}
      <g>
        {/* Suelo de dentro de la portería, en sombra. */}
        <path d={`M${x} ${line} L${back.l} ${back.b} H${back.r} L${right} ${line} Z`} fill="#0f5c2c" />
        {/* El fondo, oscuro para que la mira y el balón se lean encima. */}
        <rect x={back.l} y={back.t} width={back.r - back.l} height={back.b - back.t} fill="#060d18" opacity="0.72" />
        <rect x={back.l} y={back.t} width={back.r - back.l} height={back.b - back.t} fill="url(#red)" />
        {/* Laterales y techo, con una red más apretada y más sombra. */}
        <path d={`M${x} ${y} L${back.l} ${back.t} V${back.b} L${x} ${line} Z`} fill="#050b14" opacity="0.72" />
        <path d={`M${x} ${y} L${back.l} ${back.t} V${back.b} L${x} ${line} Z`} fill="url(#red-lado)" />
        <path d={`M${right} ${y} L${back.r} ${back.t} V${back.b} L${right} ${line} Z`} fill="#050b14" opacity="0.72" />
        <path d={`M${right} ${y} L${back.r} ${back.t} V${back.b} L${right} ${line} Z`} fill="url(#red-lado)" />
        <path d={`M${x} ${y} L${back.l} ${back.t} H${back.r} L${right} ${y} Z`} fill="#050b14" opacity="0.6" />
        <path d={`M${x} ${y} L${back.l} ${back.t} H${back.r} L${right} ${y} Z`} fill="url(#red-lado)" />
        {/* Los tubos de atrás. */}
        <path
          d={`M${back.l} ${back.b} V${back.t} H${back.r} V${back.b}`}
          fill="none"
          stroke="#8fa3bb"
          strokeWidth="1.1"
          opacity="0.4"
        />
      </g>

      {/* La sombra de la portería en el césped. */}
      <path d={`M${x - 6} ${line + 1} H${right + 6} L${right + 22} ${line + 10} H${x - 22} Z`} fill="#031008" opacity="0.3" />

      {/* Palos y larguero: redondos, con el brillo del foco en un lado. */}
      <g stroke={TINTA} strokeWidth="1.2" strokeLinejoin="round">
        <rect x={x - 6} y={y - 6} width={right - x + 12} height="6.5" rx="3" fill="url(#palo)" />
        <rect x={x - 6} y={y - 6} width="6.5" height={line - y + 7} rx="3" fill="url(#palo)" />
        <rect x={right - 0.5} y={y - 6} width="6.5" height={line - y + 7} rx="3" fill="url(#palo)" />
      </g>
      <g opacity="0.55" fill="#ffffff">
        <rect x={x - 5} y={y - 5} width={right - x + 10} height="1.6" rx="0.8" />
        <rect x={x - 5} y={y - 5} width="1.6" height={line - y + 5} rx="0.8" />
        <rect x={right + 0.6} y={y - 5} width="1.6" height={line - y + 5} rx="0.8" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * El estallido
 * ----------------------------------------------------------------------- */

/**
 * El chispazo del golpeo: la estrella blanca que tapa medio cuadro durante
 * medio segundo. Es la marca de la casa del anime de los ochenta y es lo que
 * hace que un penalti de dibujos se sienta como un cañonazo.
 */
export function Impacto({ className, color = '#fff8d6' }: { className?: string; color?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" className={className} aria-hidden>
      <g fill={color}>
        {[0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240, 264, 288, 312, 336].map((angle, i) => (
          <path key={angle} d={`M-5 0 L0 ${i % 2 ? -36 : -50} L5 0 Z`} transform={`rotate(${angle})`} />
        ))}
      </g>
      <circle r="13" fill="#fff" />
    </svg>
  );
}

/**
 * La red que se hincha al entrar el balón: tres anillos que se abren desde
 * donde ha pegado. Es lo que en la serie dice «gol» antes que el rótulo.
 */
export function RedHinchada({ className }: { className?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" className={className} aria-hidden>
      {[16, 30, 44].map((r, i) => (
        <circle key={r} r={r} fill="none" stroke="#fff" strokeWidth={4 - i} opacity={0.9 - i * 0.25} />
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * El fondo de cada tiro especial
 * ----------------------------------------------------------------------- */

/** Rayos desde el centro, del color que se pida: el fondo de todo corte. */
function Rayos({ color, n = 28, opacity = 0.35 }: { color: string; n?: number; opacity?: number }) {
  return (
    <g opacity={opacity}>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d="M-9 0 L0 -330 L9 0 Z" fill={color} transform={`translate(200 150) rotate(${(i * 360) / n})`} />
      ))}
    </g>
  );
}

/**
 * Lo que hay detrás del que tira cuando grita su tiro. En la serie cada
 * tiro tiene su imagen —el halcón que se lanza, el tigre, las llamas— y es
 * esa imagen, más que el nombre, lo que se recuerda. Un lienzo de 400×300 que
 * se recorta para llenar el corte.
 */
export function FondoTiro({ kind, className }: { kind: Exclude<ShotKind, 'normal'>; className?: string }) {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      {kind === 'halcon' && (
        <g>
          <rect width="400" height="300" fill="#0369a1" />
          <Rayos color="#bae6fd" />
          {/* El halcón, en picado y con las alas abiertas. */}
          <g transform="translate(290 118) rotate(-18) scale(1.5)">
            <path
              d="M0 -6 C-18 -34 -52 -40 -86 -22 C-60 -22 -42 -12 -30 0 C-46 -2 -58 4 -66 12 C-40 6 -18 8 -6 14 Z"
              fill="#0c1a2b"
              stroke="#e0f2fe"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <path
              d="M0 -6 C18 -34 52 -40 86 -22 C60 -22 42 -12 30 0 C46 -2 58 4 66 12 C40 6 18 8 6 14 Z"
              fill="#0c1a2b"
              stroke="#e0f2fe"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <path d="M-7 10 L0 34 L7 10 Z" fill="#0c1a2b" stroke="#e0f2fe" strokeWidth="2" />
            <circle cx="0" cy="-8" r="8" fill="#0c1a2b" stroke="#e0f2fe" strokeWidth="2" />
            <path d="M-2 -4 L0 4 L3 -4 Z" fill="#fbbf24" />
            <circle cx="3" cy="-10" r="1.6" fill="#fde047" />
          </g>
        </g>
      )}

      {kind === 'tigre' && (
        <g>
          <rect width="400" height="300" fill="#ea580c" />
          <Rayos color="#fed7aa" opacity={0.3} />
          {/* Las rayas del tigre, entrando por los dos lados. */}
          <g fill="#1c1210">
            {[20, 80, 140, 200, 260].map((y, i) => (
              <g key={y}>
                <path d={`M-10 ${y} L${120 - i * 8} ${y + 14} L${60 - i * 6} ${y + 22} L${150 - i * 10} ${y + 30} L-10 ${y + 36} Z`} />
                <path d={`M410 ${y + 18} L${280 + i * 8} ${y + 30} L${340 + i * 6} ${y + 38} L${250 + i * 10} ${y + 46} L410 ${y + 54} Z`} />
              </g>
            ))}
          </g>
          {/* Y el zarpazo: tres arañazos blancos. */}
          <g stroke="#fff7ed" strokeWidth="9" strokeLinecap="round" opacity="0.95">
            <path d="M250 40 L330 250" />
            <path d="M280 30 L360 240" />
            <path d="M310 22 L390 230" />
          </g>
        </g>
      )}

      {kind === 'fuego' && (
        <g>
          <rect width="400" height="300" fill="#7f1d1d" />
          <Rayos color="#fca5a5" opacity={0.25} />
          {/* Las llamas, subiendo desde abajo en tres capas. */}
          {[
            { fill: '#dc2626', h: 250, n: 7 },
            { fill: '#f97316', h: 190, n: 8 },
            { fill: '#fde047', h: 120, n: 9 },
          ].map(({ fill, h, n }) => (
            <path
              key={fill}
              fill={fill}
              d={`M0 300 ${Array.from({ length: n }, (_, i) => {
                const w = 400 / n;
                const x = i * w;
                const top = 300 - h - (i % 2 ? 30 : 0);
                return `Q${x + w * 0.1} ${300 - h * 0.4} ${x + w * 0.5} ${top} Q${x + w * 0.9} ${300 - h * 0.4} ${x + w} ${300 - h * 0.2}`;
              }).join(' ')} L400 300 Z`}
            />
          ))}
        </g>
      )}

      {kind === 'efecto' && (
        <g>
          <rect width="400" height="300" fill="#4c1d95" />
          {/* La espiral del efecto, girando. */}
          <g className="origin-center animate-girar" style={{ transformBox: 'fill-box' }}>
            {[30, 60, 90, 120, 150, 180, 210].map((r, i) => (
              <circle
                key={r}
                cx="200"
                cy="150"
                r={r}
                fill="none"
                stroke={i % 2 ? '#c4b5fd' : '#f5f3ff'}
                strokeWidth="10"
                strokeDasharray={`${r * 2.2} ${r * 1.1}`}
                opacity="0.55"
              />
            ))}
          </g>
          {/* La curva del balón: sale por fuera y se cierra. */}
          <path d="M40 270 Q420 250 300 40" fill="none" stroke="#fff" strokeWidth="6" strokeDasharray="4 14" strokeLinecap="round" />
        </g>
      )}

      {kind === 'canon' && (
        <g>
          <rect width="400" height="300" fill="#0f172a" />
          <Rayos color="#fbbf24" opacity={0.3} n={36} />
          <text x="300" y="250" fontSize="260" fontWeight="900" fontStyle="italic" fill="#fbbf24" opacity="0.18" textAnchor="middle">
            7
          </text>
          {/* El estallido del cañonazo. */}
          <g transform="translate(290 130)">
            {Array.from({ length: 16 }, (_, i) => (
              <path key={i} d={`M-10 0 L0 ${i % 2 ? -70 : -110} L10 0 Z`} fill="#f59e0b" transform={`rotate(${i * 22.5})`} />
            ))}
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d={`M-8 0 L0 ${i % 2 ? -40 : -62} L8 0 Z`} fill="#fef3c7" transform={`rotate(${i * 30 + 10})`} />
            ))}
            <circle r="22" fill="#fff" />
          </g>
        </g>
      )}

      {kind === 'catapulta' && (
        <g>
          <rect width="400" height="300" fill="#1e1b4b" />
          <Rayos color="#c7d2fe" opacity={0.25} />
          {/* Estrellas: los Derrick te lanzan hasta ellas. */}
          {[
            [60, 40], [130, 70], [340, 50], [300, 110], [90, 150], [370, 180],
          ].map(([x, y]) => (
            <path key={`${x}`} d={`M${x} ${y - 9} L${x + 3} ${y - 3} L${x + 9} ${y} L${x + 3} ${y + 3} L${x} ${y + 9} L${x - 3} ${y + 3} L${x - 9} ${y} L${x - 3} ${y - 3} Z`} fill="#fde047" />
          ))}
          {/* La estela hacia arriba y el balón en lo alto. */}
          <g stroke="#e0e7ff" strokeLinecap="round" opacity="0.9">
            {[250, 270, 290, 310, 330].map((x, i) => (
              <path key={x} d={`M${x} 300 L${x + 6} ${60 + i * 8}`} strokeWidth={i === 2 ? 8 : 4} />
            ))}
          </g>
          <circle cx="296" cy="46" r="26" fill="#fff" stroke="#1e1b4b" strokeWidth="4" />
          <path d="M296 34 L307 42 L303 55 L289 55 L285 42 Z" fill="#1e1b4b" />
        </g>
      )}

      {kind === 'parabola' && (
        <g>
          <rect width="400" height="300" fill="#0e7490" />
          <Rayos color="#a5f3fc" opacity={0.25} />
          {/* El arcoíris de la vaselina. */}
          {['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'].map((color, i) => (
            <path
              key={color}
              d={`M${30 + i * 14} 300 A${170 - i * 14} ${230 - i * 14} 0 0 1 ${370 - i * 14} 300`}
              fill="none"
              stroke={color}
              strokeWidth="14"
              opacity="0.9"
            />
          ))}
          <path d="M60 280 Q200 -60 340 240" fill="none" stroke="#fff" strokeWidth="5" strokeDasharray="3 12" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
