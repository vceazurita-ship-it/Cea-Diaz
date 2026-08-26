import type { Face, Kit } from '@/lib/cromoArt';

/* =========================================================================
 *  Las piezas del dibujo — anime de campo, del de las tardes de merienda.
 *
 *  Todo lo de aquí se dibuja **con el centro de la cabeza en el origen**, no
 *  en la esquina del lienzo. Así una figura se coloca donde haga falta con un
 *  `translate` y se hace grande o pequeña con un `scale`, que es lo que
 *  permite que el mismo Hugo salga solo en su cromo y de tercero por la
 *  izquierda en la mesa de la cena.
 *
 *  Medidas de la cabeza: de -27 (coronilla) a +27 (barbilla) y ±21 de ancho.
 *  Los hombros llegan hasta +70. Un retrato de cromo entra justo en un lienzo
 *  de 100×120 poniendo el origen en (50, 50).
 *
 *  El estilo es el de Oliver y Benji y no el de un carné: ojos enormes con
 *  brillo, ceja gruesa, pelo de puntas y línea negra alrededor de todo. A
 *  tamaño de campograma —36 píxeles— lo único que sobrevive de una cara son
 *  los ojos, así que son justo lo que más se ha agrandado.
 * ========================================================================= */

/** La línea con la que se perfila todo. Ni negra del todo: es tinta, no boli. */
export const TINTA = '#241a14';

/* -------------------------------------------------------------------------
 * Ojos y cara
 * ----------------------------------------------------------------------- */

/**
 * Un ojo. El `lado` vale 1 para el izquierdo y -1 para el derecho, que es el
 * mismo dibujo del revés: así los dos miran hacia fuera con la misma
 * inclinación, que es lo que le da la expresión.
 */
function Ojo({ x, lado, color }: { x: number; lado: 1 | -1; color: string }) {
  return (
    <g transform={`translate(${x} 3.5) scale(${lado} 1)`}>
      {/* Blanco del ojo, inclinado hacia fuera. */}
      <ellipse
        rx="5.4"
        ry="6.2"
        transform="rotate(-9)"
        fill="#fdfcfa"
        stroke={TINTA}
        strokeWidth="0.9"
      />
      {/* Iris, con el borde oscuro que lo separa del blanco, y pupila. */}
      <circle cx="0.2" cy="0.9" r="3.7" fill={color} stroke="#000" strokeWidth="0.5" opacity="0.95" />
      <circle cx="0.2" cy="0.9" r="1.55" fill="#191110" />
      {/* Los dos brillos: el grande arriba y la mota de abajo. Sin ellos la
          mirada se apaga y la cara se queda de maniquí. */}
      <circle cx="-1.7" cy="-2.1" r="1.5" fill="#ffffff" />
      <circle cx="2" cy="2.4" r="0.75" fill="#ffffff" opacity="0.8" />
      {/* Párpado de arriba, bien grueso. */}
      <path
        d="M-5.4 -2 Q0 -8.4 5.4 -1.2"
        fill="none"
        stroke={TINTA}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </g>
  );
}

/** Ceja: una barra gruesa y angulada, del color del pelo pero más oscura. */
function Ceja({ lado }: { lado: 1 | -1 }) {
  return (
    <path
      d="M-15.5 -8 Q-9.5 -12.4 -3.6 -8.6"
      transform={`scale(${lado} 1)`}
      fill="none"
      stroke={TINTA}
      strokeWidth="2.5"
      strokeLinecap="round"
      opacity="0.9"
    />
  );
}

/** Nariz y boca. Mínimas a propósito: en el anime la cara la hacen los ojos. */
function Gesto() {
  return (
    <g fill="none" stroke={TINTA} strokeLinecap="round">
      <path d="M-2 13 Q0 15.2 2.4 12.6" strokeWidth="1.4" opacity="0.5" />
      <path d="M-4.6 19.2 Q0 22.6 4.6 19.2" strokeWidth="1.7" opacity="0.85" />
    </g>
  );
}

/** La barba, si la lleva. */
function Barba({ face }: { face: Face }) {
  if (face.beard === 'no') return null;

  // De tres días: sólo la mandíbula y el bigote. Cuando la barba corta subía
  // hasta los pómulos no se leía como barba, se leía como un cromo manchado.
  return face.beard === 'corta' ? (
    <g fill={face.hair} opacity="0.32">
      <path d="M-13.5 11 C-13 21 -7 27 0 27.3 C7 27 13 21 13.5 11 C11 21 6 23.5 0 23.5 C-6 23.5 -11 21 -13.5 11 Z" />
      <path d="M-5.5 16.4 Q0 14.6 5.5 16.4 Q0 18.8 -5.5 16.4 Z" />
    </g>
  ) : (
    <g fill={face.hair}>
      <path d="M-15.5 4 Q-16 24 0 27.5 Q16 24 15.5 4 Q0 19 -15.5 4 Z" opacity="0.85" />
      <path d="M-6.2 15.4 Q0 13.2 6.2 15.4 Q0 18.4 -6.2 15.4 Z" opacity="0.85" />
    </g>
  );
}

/* -------------------------------------------------------------------------
 * Pelo
 *
 * Dos capas: lo que va por detrás de la cabeza —melenas, moños— y lo que va
 * por delante —el flequillo—. En medio se dibuja la cara, que es lo que hace
 * que el flequillo caiga sobre la frente y no sobre el fondo.
 * ----------------------------------------------------------------------- */

/**
 * Silueta de arriba con picos. Un casquete redondo se lee como un gorro de
 * baño; lo que hace que el pelo parezca pelo de anime es que la coronilla
 * también tenga puntas, no sólo el flequillo.
 */
const PICOS =
  'M-22 -2 C-23 -18 -18.5 -26 -12.5 -28 L-9.5 -35 L-4.5 -27.5 ' +
  'L0.5 -36 L5 -27.5 L11 -34 L13 -27.5 C19 -25 23 -17 22 -2';

/** Silueta lisa: la de las melenas y los moños, que van peinados. */
const CASQUETE = 'M-22 -2 C-22.5 -21 -12.5 -30 0 -30 C12.5 -30 22.5 -21 22 -2';

/** Mechones grandes sobre la frente. Van de -3 a -18: cuanto más profundo el
 *  diente, más se separan los mechones y menos parece un casco. */
const FLECOS = 'L19 -14 L13.5 -3 L8 -17 L1 -5 L-5.5 -18 L-11.5 -4 L-17 -15 Z';

/** Flequillo liso, para las melenas y los moños. */
const CORTINA = 'Q16 -13 4 -12.5 Q-10 -12 -22 -2 Z';

/** El mismo, pero con la frente despejada: el de las trenzas, que van hacia atrás. */
const CORTINA_ALTA = 'Q17 -18 4 -17.5 Q-10 -17 -22 -2 Z';

/** El brillo del pelo: la banda clara que en el anime cruza la coronilla. */
function BrilloPelo() {
  return (
    <path
      d="M-13 -22 Q0 -28.5 13 -22 Q0 -25 -13 -17.5 Z"
      fill="#ffffff"
      opacity="0.22"
    />
  );
}

function PeloDetras({ face }: { face: Face }) {
  switch (face.style) {
    case 'largo':
      // Melena: dos mechones que caen por detrás de las orejas hasta el pecho.
      return (
        <g fill={face.hair}>
          <path d="M-21 -8 Q-27 14 -23 42 L-11 42 Q-15 16 -13 -6 Z" />
          <path d="M21 -8 Q27 14 23 42 L11 42 Q15 16 13 -6 Z" />
        </g>
      );

    case 'moño':
      return <circle cx="0" cy="-33" r="9" fill={face.hair} stroke={TINTA} strokeWidth="0.9" />;

    default:
      return null;
  }
}

function PeloDelante({ face }: { face: Face }) {
  const color = face.hair;

  switch (face.style) {
    case 'rapado':
      // Al cero: se le adivina el cráneo y el nacimiento del pelo, nada más.
      return (
        <path
          d="M-19.5 -2 C-20 -17 -11 -25 0 -25 C11 -25 20 -17 19.5 -2
             L16 -8 L12 -3.5 L8 -9 L4 -3.5 L0 -9 L-4 -3.5 L-8 -9 L-12 -3.5 L-16 -8 Z"
          fill={color}
          opacity="0.8"
        />
      );

    case 'corto':
      return (
        <g fill={color}>
          <path d={`${PICOS} ${FLECOS}`} stroke={TINTA} strokeWidth="0.9" strokeLinejoin="round" />
          <BrilloPelo />
        </g>
      );

    case 'tupé':
      // El tupé levantado. Es el corte más de Oliver y Benji de todos y es,
      // justo, el que lleva Hugo en la foto del perfil. Va como una masa
      // peinada hacia arriba y no como tres pinchos sueltos, que de lejos se
      // leían como una corona.
      return (
        <g fill={color} stroke={TINTA} strokeWidth="0.9" strokeLinejoin="round">
          {/* Una masa alta peinada hacia arriba y hacia atrás, con una sola
              punta suelta. Con varias puntas seguidas y del mismo alto no se
              leía como un tupé: se leía como una corona. */}
          <path
            d="M-20 -3 C-21 -19 -16 -28 -7 -31
               C-1 -37.5 8 -38.5 13 -32 L15.5 -39 L17.5 -28
               C20 -22 20.5 -11 20 -3
               L16.5 -13 L12 -3.5 L7 -15 L1.5 -4.5 L-4 -15.5 L-10 -4 L-15.5 -13.5 Z"
          />
          <BrilloPelo />
        </g>
      );

    case 'rizado':
      // Bucles: el borde de arriba va a bultos, para que no parezca un gorro.
      return (
        <g fill={color}>
          <path d={`${CASQUETE} L17 -11 L12 -5 L6 -13 L0 -6 L-6 -13 L-12 -5 L-17 -11 Z`} />
          <circle cx="-16" cy="-16" r="6.5" />
          <circle cx="-9" cy="-24" r="7.5" />
          <circle cx="0" cy="-27" r="8" />
          <circle cx="9" cy="-24" r="7.5" />
          <circle cx="16" cy="-16" r="6.5" />
        </g>
      );

    case 'afro':
      return (
        <g fill={color}>
          <ellipse cx="0" cy="-16" rx="25" ry="18" />
          <circle cx="-20" cy="-6" r="7" />
          <circle cx="20" cy="-6" r="7" />
        </g>
      );

    case 'largo':
      return (
        <g fill={color}>
          <path d={`${CASQUETE} ${CORTINA}`} stroke={TINTA} strokeWidth="0.9" strokeLinejoin="round" />
          <BrilloPelo />
        </g>
      );

    case 'cresta':
      return (
        <g fill={color}>
          <path
            d="M-19 -2 C-19.5 -16 -11 -23 0 -23 C11 -23 19.5 -16 19 -2 L15 -7 L8 -4 L0 -8 L-8 -4 L-15 -7 Z"
            opacity="0.5"
          />
          <path d="M-8 -22 L-5 -38 L-1 -28 L2 -42 L6 -27 L9 -34 L10 -21 Z" />
        </g>
      );

    case 'moño':
      return (
        <g fill={color}>
          <path d={`${CASQUETE} ${CORTINA}`} stroke={TINTA} strokeWidth="0.9" strokeLinejoin="round" />
          <BrilloPelo />
        </g>
      );

    case 'trenzas':
      // Trenzas pegadas al cráneo, de la frente hacia atrás. Las rayas se
      // quedan dentro del casquete a propósito: si suben más, asoman por
      // encima del pelo y parecen antenas.
      return (
        <g fill={color}>
          <path
            d={`${CASQUETE} ${CORTINA_ALTA}`}
            stroke={TINTA}
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <g fill="#000" opacity="0.32">
            {[-11, -5.5, 0, 5.5, 11].map((x) => (
              <rect key={x} x={x - 0.7} y="-26" width="1.4" height="19" rx="0.7" />
            ))}
          </g>
        </g>
      );
  }
}

/* -------------------------------------------------------------------------
 * Cabeza completa
 * ----------------------------------------------------------------------- */

const CRANEO =
  'M0 -27 C11.5 -27 20.5 -20 21 -8 C21.4 1 19 9 15 15.5 ' +
  'C11 21.5 5.5 27.5 0 27.5 C-5.5 27.5 -11 21.5 -15 15.5 ' +
  'C-19 9 -21.4 1 -21 -8 C-20.5 -20 -11.5 -27 0 -27 Z';

/**
 * La cabeza: cuello, orejas, cráneo, pelo y cara. Se dibuja sola, sin ropa,
 * para poder montarla sobre una camiseta de equipo o sobre un pijama.
 */
export function Cabeza({ face }: { face: Face }) {
  return (
    <g>
      <PeloDetras face={face} />

      {/* Cuello, con la sombra que le echa la barbilla encima. */}
      <path d="M-6.8 16 H6.8 V36 H-6.8 Z" fill={face.skin} stroke={TINTA} strokeWidth="1" />
      <path d="M-6.8 16 H6.8 V22 H-6.8 Z" fill="#000" opacity="0.16" />

      {/* Orejas. */}
      <circle cx="-20" cy="4" r="4" fill={face.skin} stroke={TINTA} strokeWidth="0.9" />
      <circle cx="20" cy="4" r="4" fill={face.skin} stroke={TINTA} strokeWidth="0.9" />

      {/* Cráneo. */}
      <path d={CRANEO} fill={face.skin} stroke={TINTA} strokeWidth="1.1" />
      {/* Sombreado plano del borde de la izquierda, que es como se sombrea en
          el anime: una luna pegada al contorno. Ha de ir estrecha —cinco
          unidades— porque en cuanto se mete hacia el centro deja de leerse
          como una sombra y pasa a parecer que el cromo está sucio. */}
      <path
        d="M-4.5 -27 C-13.5 -27 -20.5 -20 -21 -8 C-21.4 1 -19 9 -15 15.5 C-11 21.5 -5.5 27.5 0 27.5
           C-4 24.5 -8 20 -10.6 14.8 C-14 8.6 -16.4 0.8 -16 -8 C-15.6 -16.6 -10.6 -22.6 -4.5 -22.6 Z"
        fill="#000"
        opacity="0.09"
      />

      <PeloDelante face={face} />

      <Ceja lado={1} />
      <Ceja lado={-1} />
      <Ojo x={-8.6} lado={1} color={face.eyes} />
      <Ojo x={8.6} lado={-1} color={face.eyes} />

      {/* Chapetas: la nota de color que hace que no parezca un maniquí. */}
      <ellipse cx="-12" cy="12" rx="3.8" ry="2.1" fill="#e0736a" opacity="0.2" />
      <ellipse cx="12" cy="12" rx="3.8" ry="2.1" fill="#e0736a" opacity="0.2" />

      <Gesto />
      <Barba face={face} />
    </g>
  );
}

/* -------------------------------------------------------------------------
 * Torso
 * ----------------------------------------------------------------------- */

/** Silueta de los hombros. La misma para la camiseta y para la ropa de casa. */
export const HOMBROS = 'M-38 70 V48 Q-24 36 -11 33 L0 42 L11 33 Q24 36 38 48 V70 Z';

/** El pico del cuello de la camiseta. */
const CUELLO = 'M-11 33 L0 42 L11 33 L6.5 31 L0 38 L-6.5 31 Z';

/**
 * El pecho con la equipación de su equipo: el color, el dibujo —rayas,
 * mitades, banda, mangas— y el cuello en pico. El `uid` sólo sirve para que
 * el recorte no choque con el de los otros treinta cromos de la página.
 */
export function Camiseta({ kit, uid }: { kit: Kit; uid: string }) {
  return (
    <g>
      <clipPath id={`torso-${uid}`}>
        <path d={HOMBROS} />
      </clipPath>

      <path d={HOMBROS} fill={kit.shirt} stroke={TINTA} strokeWidth="1.2" strokeLinejoin="round" />

      <g clipPath={`url(#torso-${uid})`}>
        {kit.pattern === 'rayas' &&
          [-30, -18, -6, 6, 18, 30].map((x) => (
            <rect key={x} x={x} y="30" width="6" height="42" fill={kit.trim} />
          ))}

        {kit.pattern === 'mitades' && <rect x="0" y="30" width="42" height="42" fill={kit.trim} />}

        {kit.pattern === 'banda' && <path d="M-42 72 L14 30 L28 30 L-28 72 Z" fill={kit.trim} />}

        {kit.pattern === 'mangas' && (
          <g fill={kit.trim}>
            <rect x="-42" y="30" width="17" height="42" />
            <rect x="25" y="30" width="17" height="42" />
          </g>
        )}

        {/* Sombra del lado izquierdo: el mismo sol que sombrea la cara. */}
        <path d="M-42 72 V44 Q-26 34 -11 32 L-7 37 Q-24 42 -33 54 V72 Z" fill="#000" opacity="0.12" />
      </g>

      <path d={CUELLO} fill={kit.ink} opacity="0.9" />
    </g>
  );
}

/** Ropa de calle, para las escenas de casa: un color y el cuello redondo. */
export function Ropa({ color }: { color: string }) {
  return (
    <g>
      <path d={HOMBROS} fill={color} stroke={TINTA} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M-11 33 Q0 44 11 33 Q0 39 -11 33 Z" fill="#000" opacity="0.25" />
      <path d="M-42 72 V44 Q-26 34 -11 32 L-7 37 Q-24 42 -33 54 V72 Z" fill="#000" opacity="0.12" />
    </g>
  );
}

/* -------------------------------------------------------------------------
 * Fondos
 * ----------------------------------------------------------------------- */

/**
 * El estallido de rayos de detrás del jugador. Es la marca de la casa del
 * anime de los ochenta —el fondo que sale cuando alguien va a chutar— y es lo
 * que separa un cromo dibujado de un avatar.
 */
export function Rayos({ color, cx = 50, cy = 46 }: { color: string; cx?: number; cy?: number }) {
  return (
    <g opacity="0.13" fill={color}>
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => (
        <path key={angle} d="M-4 0 L0 -170 L4 0 Z" transform={`translate(${cx} ${cy}) rotate(${angle})`} />
      ))}
    </g>
  );
}

/** Una persona de casa entera —ropa y cabeza— puesta donde se le diga. */
export function Figura({
  face,
  color,
  x,
  y,
  s = 1,
  flip = false,
}: {
  face: Face;
  color: string;
  x: number;
  y: number;
  /** Escala. 1 es el tamaño de un cromo de retrato. */
  s?: number;
  /** Mira hacia el otro lado. */
  flip?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <Ropa color={color} />
      <Cabeza face={face} />
    </g>
  );
}
