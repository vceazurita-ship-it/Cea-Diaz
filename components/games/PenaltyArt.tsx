import { Cabeza, TINTA } from '@/components/ui/CromoFace';
import { ROPA_FAMILIA, caraDe, type Casero } from '@/lib/cromoArt';

/* =========================================================================
 *  El dibujo de la tanda — anime de campo, el de las tardes de merienda.
 *
 *  El que tira **es el crío**: la misma cara que lleva su cromo y que sale
 *  en las escenas de casa, con el color de su perfil. Leo moreno de ojos
 *  claros, Hugo rubio de tupé. Que el muñeco sea uno mismo es media gracia
 *  del juego, y no cuesta nada: las piezas ya estaban dibujadas en
 *  `CromoFace` para los cromos, así que aquí sólo hay que ponerles piernas.
 *
 *  Y piernas es literalmente lo que falta. Un cromo es busto: cabeza y
 *  hombros. Para chutar hace falta el cuerpo entero, y se monta con
 *  **articulaciones**, no con siluetas: cada pose es una lista de puntos
 *  —cadera, rodilla, pie, hombro, codo, mano— y los miembros se pintan como
 *  trazos gruesos con la línea de tinta por debajo. Cambiar una pose es
 *  mover un punto, que es lo que permite tener tres —esperando, corriendo y
 *  golpeando— sin dibujar tres muñecos.
 * ========================================================================= */

/** Un punto del muñeco. */
type P = [number, number];

/** Las articulaciones de una pose. El muñeco mira siempre hacia la portería. */
interface Pose {
  /** Cuello: donde se apoya la cabeza. */
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
 * Las tres poses del que tira.
 *
 *  · `espera`  — de pie junto al balón, mirando la portería. Es la pose en
 *    la que se está apuntando, así que tiene que estar quieta y no distraer.
 *  · `carrera` — la carrerilla: cuerpo echado adelante, brazos contrapeados.
 *    Es la de la barra de fuerza, y su movimiento es el que dice «ya viene».
 *  · `golpeo`  — el latigazo: pierna estirada del todo, tronco echado atrás
 *    y brazos abiertos. Es la que se queda congelada medio segundo con el
 *    estallido detrás, que es la marca de la casa del anime de los ochenta.
 */
const POSES: Record<'espera' | 'carrera' | 'golpeo', Pose> = {
  espera: {
    head: [60, 40],
    shoulder: [60, 68],
    hip: [59, 124],
    nearArm: [[74, 72], [80, 98], [80, 122]],
    nearLeg: [[65, 124], [71, 162], [68, 200]],
    farArm: [[46, 72], [40, 98], [40, 122]],
    farLeg: [[53, 124], [48, 162], [50, 200]],
    tilt: 0,
  },
  carrera: {
    head: [70, 38],
    shoulder: [67, 68],
    hip: [56, 124],
    nearArm: [[80, 72], [96, 84], [100, 60]],
    nearLeg: [[62, 124], [88, 134], [104, 152]],
    farArm: [[54, 72], [36, 84], [22, 72]],
    farLeg: [[50, 124], [34, 154], [26, 182]],
    tilt: -8,
  },
  golpeo: {
    head: [52, 38],
    shoulder: [54, 68],
    hip: [58, 122],
    nearArm: [[67, 72], [86, 58], [98, 38]],
    nearLeg: [[65, 122], [94, 112], [117, 94]],
    farArm: [[41, 72], [24, 84], [10, 66]],
    farLeg: [[52, 124], [46, 162], [48, 200]],
    tilt: 8,
  },
};

/** Color de los pantalones: oscuro, para que la camiseta sea lo que canta. */
const CALZONA = '#1f2937';

/** Las medias, que es lo que separa una pierna de fútbol de una pierna. */
const MEDIAS = '#f4f4f2';

/** Un tramo suelto, con su línea de tinta por debajo. */
function Tramo({ from, to, color, w }: { from: P; to: P; color: string; w: number }) {
  const d = `M${from[0]} ${from[1]} L${to[0]} ${to[1]}`;

  return (
    <g>
      <path d={d} fill="none" stroke={TINTA} strokeWidth={w + 2.6} strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />
    </g>
  );
}

/**
 * Un miembro: dos tramos —muslo y pierna, o brazo y antebrazo— cada uno con
 * su color, la línea de tinta por debajo y la punta acabada.
 *
 * Que los dos tramos puedan ir de distinto color es lo que permite que la
 * pierna lleve medias y el brazo lleve manga, y eso es justo lo que separa un
 * muñeco de fútbol de un monigote de palotes.
 */
function Miembro({
  points,
  upper,
  lower,
  w,
  end,
  boot,
}: {
  points: [P, P, P];
  /** Color del primer tramo: el muslo, o la manga y el brazo. */
  upper: string;
  /** Color del segundo: la media, o el antebrazo. */
  lower: string;
  w: number;
  /** Color de la mano o de la bota. */
  end: string;
  /** La punta se alarga en el sentido de la marcha: es una bota, no un puño. */
  boot?: boolean;
}) {
  const [, knee, foot] = points;
  const angle = (Math.atan2(foot[1] - knee[1], foot[0] - knee[0]) * 180) / Math.PI;

  return (
    <g>
      <Tramo from={points[0]} to={knee} color={upper} w={w} />
      <Tramo from={knee} to={foot} color={lower} w={w * 0.88} />
      {boot ? (
        <ellipse
          cx={foot[0]}
          cy={foot[1]}
          rx={w * 0.95}
          ry={w * 0.55}
          fill={end}
          stroke={TINTA}
          strokeWidth="1.5"
          transform={`rotate(${angle + 90} ${foot[0]} ${foot[1]})`}
        />
      ) : (
        <circle cx={foot[0]} cy={foot[1]} r={w * 0.58} fill={end} stroke={TINTA} strokeWidth="1.4" />
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
}: {
  who: Casero;
  pose: keyof typeof POSES;
  className?: string;
}) {
  const face = caraDe(who);
  const kit = ROPA_FAMILIA[who];
  const body = POSES[pose];

  return (
    <svg viewBox="0 0 120 210" className={className} aria-hidden>
      {/* Lo de detrás: el brazo y la pierna del lado de allá, apagados para
          que se lean como lo que están, más lejos. */}
      <g opacity="0.8">
        <Miembro points={body.farLeg} upper={face.skin} lower={MEDIAS} w={13} end={TINTA} boot />
        <Miembro points={body.farArm} upper={kit} lower={face.skin} w={9.5} end={face.skin} />
      </g>

      {/* Calzona: cubre la cadera y el arranque de los muslos. */}
      <path
        d={`M${body.hip[0] - 16} ${body.hip[1] + 16} L${body.hip[0] - 15} ${body.hip[1] - 14}
            L${body.hip[0] + 15} ${body.hip[1] - 14} L${body.hip[0] + 16} ${body.hip[1] + 16} Z`}
        fill={CALZONA}
        stroke={TINTA}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* Tronco. Va de los hombros a la cadera, y empieza **por debajo del
          cuello**: la cabeza de `CromoFace` se dibuja con su cuello incluido,
          y solaparla con la camiseta era lo que hacía que el muñeco pareciera
          un monigote sentado. */}
      <path
        d={`M${body.shoulder[0] - 18} ${body.shoulder[1]}
            Q${body.shoulder[0]} ${body.shoulder[1] - 7} ${body.shoulder[0] + 18} ${body.shoulder[1]}
            L${body.hip[0] + 15} ${body.hip[1] - 8}
            L${body.hip[0] - 15} ${body.hip[1] - 8} Z`}
        fill={kit}
        stroke={TINTA}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* El dorsal, que es lo que convierte una camiseta en una camiseta. */}
      <text
        x={body.shoulder[0]}
        y={body.shoulder[1] + 34}
        textAnchor="middle"
        fontSize="22"
        fontWeight="900"
        fill="#fff"
        opacity="0.9"
        transform={`rotate(${body.tilt} ${body.shoulder[0]} ${body.shoulder[1]})`}
      >
        {who === 'leo' ? '10' : '7'}
      </text>

      {/* La cabeza, la misma de su cromo. Se dibuja con el centro en el
          origen, así que va trasladada y escalada a tamaño de cuerpo. */}
      <g transform={`translate(${body.head[0]} ${body.head[1]}) rotate(${body.tilt}) scale(0.7)`}>
        <Cabeza face={face} />
      </g>

      {/* Y lo de delante, encima de todo. */}
      <Miembro points={body.nearLeg} upper={face.skin} lower={MEDIAS} w={14} end={TINTA} boot />
      <Miembro points={body.nearArm} upper={kit} lower={face.skin} w={10} end={face.skin} />
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * El portero
 * ----------------------------------------------------------------------- */

/**
 * El portero, de frente y con los guantes por delante. Se dibuja siempre
 * igual y es la escena la que lo coloca y lo gira: volar a la escuadra
 * izquierda es el mismo muñeco girado y estirado hacia allá.
 *
 * Va de verde chillón a propósito —el color de portero de toda la vida— para
 * que no se confunda con el que tira, que lleva el color de su perfil.
 */
export function Portero({ className }: { className?: string }) {
  const face = caraDe('victor');

  return (
    <svg viewBox="0 0 140 130" className={className} aria-hidden>
      {/* Brazos abiertos, que es lo que ocupa portería. Los guantes,
          amarillos: en una portería oscura son lo único que se ve volar. */}
      <Miembro points={[[54, 56], [30, 42], [12, 30]]} upper="#15803d" lower={face.skin} w={9.5} end="#f5c542" />
      <Miembro points={[[86, 56], [110, 42], [128, 30]]} upper="#15803d" lower={face.skin} w={9.5} end="#f5c542" />

      {/* Piernas. */}
      <Miembro points={[[62, 96], [54, 112], [48, 126]]} upper="#0f172a" lower="#f4f4f2" w={10} end={TINTA} boot />
      <Miembro points={[[78, 96], [86, 112], [92, 126]]} upper="#0f172a" lower="#f4f4f2" w={10} end={TINTA} boot />

      {/* Cuerpo. */}
      <path
        d="M53 52 L87 52 L82 100 L58 100 Z"
        fill="#16a34a"
        stroke={TINTA}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <g transform="translate(70 34) scale(0.6)">
        <Cabeza face={face} />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * El primer plano
 * ----------------------------------------------------------------------- */

/**
 * La cara del que tira, de cerca y en su recuadro, mientras coge fuerza.
 *
 * Es el plano que hace el anime de fútbol cada vez que alguien va a chutar:
 * se corta la acción y se le ve la cara al que va a pegarle, con las rayas
 * de velocidad detrás. Aquí cumple además una función que no es de adorno —y
 * por eso se queda—: dice sin palabras que la barra de fuerza está corriendo
 * y que hay que soltar.
 */
export function Primerplano({ who, className }: { who: Casero; className?: string }) {
  const face = caraDe(who);

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <clipPath id={`marco-${who}`}>
          <rect x="3" y="3" width="94" height="94" rx="10" />
        </clipPath>
      </defs>

      <g clipPath={`url(#marco-${who})`}>
        <rect x="0" y="0" width="100" height="100" fill={ROPA_FAMILIA[who]} />

        {/* Rayas convergentes: el fondo del primer plano de toda la vida. */}
        <g opacity="0.55">
          {Array.from({ length: 24 }, (_, i) => (
            <path
              key={i}
              d="M-4 0 L0 -70 L4 0 Z"
              fill="#fff"
              transform={`translate(50 48) rotate(${i * 15})`}
            />
          ))}
        </g>

        {/* La cara, grande y baja: se busca el gesto, no el peinado. */}
        <g transform="translate(50 62) scale(1.5)">
          <Cabeza face={face} />
        </g>
      </g>

      <rect
        x="3"
        y="3"
        width="94"
        height="94"
        rx="10"
        fill="none"
        stroke={TINTA}
        strokeWidth="5"
      />
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
export function Impacto({ className }: { className?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" className={className} aria-hidden>
      <g fill="#fff8d6">
        {[0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240, 264, 288, 312, 336].map((angle) => (
          <path key={angle} d="M-5 0 L0 -50 L5 0 Z" transform={`rotate(${angle})`} />
        ))}
      </g>
      <circle r="13" fill="#fff" />
    </svg>
  );
}
