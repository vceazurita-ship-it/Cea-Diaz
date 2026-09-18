import { Cabeza, TINTA } from '@/components/ui/CromoFace';
import { ROPA_FAMILIA, caraDe, faceOf, type Casero, type Face } from '@/lib/cromoArt';

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
 *  roja con la visera tapándole media ceja, guantes por delante y las piernas
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
  glove,
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
  /** La punta es un guante de portero: grande y con los dedos abiertos. */
  glove?: boolean;
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
      ) : glove ? (
        // El guante: la palma y cuatro dedos en abanico, en la dirección del
        // brazo. Es lo único de Benji que se ve volar, así que va grande.
        <g transform={`translate(${foot[0]} ${foot[1]}) rotate(${angle - 90})`}>
          <path
            d="M-7 -2 L-8.4 9 Q-8.6 12.4 -6 12.2 L-4.2 7.8 L-3.4 14 Q-1.8 16.4 0 14 L0.4 8.4 L2.4 14 Q4.4 15.6 5.4 13 L4.6 7.6 L7.4 11.4 Q9.6 12 9.2 9.4 L7 -2 Q0 -6.4 -7 -2 Z"
            fill={end}
            stroke={TINTA}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M-6.6 -1.6 Q0 -5 6.6 -1.6" fill="none" stroke="#dc2626" strokeWidth="2.6" />
        </g>
      ) : (
        <circle cx={foot[0]} cy={foot[1]} r={w * 0.58} fill={end} stroke={TINTA} strokeWidth="1.4" />
      )}
    </g>
  );
}

/* -------------------------------------------------------------------------
 * El que tira
 * ----------------------------------------------------------------------- */

/** Las articulaciones de una pose del que tira. Mira siempre hacia la portería. */
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
 * Las poses del que tira.
 *
 *  · `espera`  — de pie junto al balón, mirando la portería. Es la pose en
 *    la que se está apuntando, así que tiene que estar quieta y no distraer.
 *  · `carrera` — la carrerilla: cuerpo echado adelante, brazos contrapeados.
 *    Es la de la barra de fuerza, y su movimiento es el que dice «ya viene».
 *  · `golpeo`  — el latigazo: pierna estirada del todo, tronco echado atrás
 *    y brazos abiertos. Es la que se queda congelada medio segundo con el
 *    estallido detrás, que es la marca de la casa del anime de los ochenta.
 *  · `celebra` — los dos brazos arriba. Es la del final de una buena tanda.
 */
const POSES: Record<'espera' | 'carrera' | 'golpeo' | 'celebra', Pose> = {
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
  celebra: {
    head: [60, 40],
    shoulder: [60, 68],
    hip: [60, 124],
    nearArm: [[74, 70], [92, 48], [100, 20]],
    nearLeg: [[65, 124], [74, 162], [80, 200]],
    farArm: [[46, 70], [28, 48], [20, 20]],
    farLeg: [[54, 124], [46, 162], [40, 200]],
    tilt: 0,
  },
};

export type PoseChutador = keyof typeof POSES;

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
  pose: PoseChutador;
  className?: string;
}) {
  const face = caraDe(who);
  const kit = ROPA_FAMILIA[who];
  const body = POSES[pose];

  return (
    <svg viewBox="0 0 120 210" className={className} aria-hidden overflow="visible">
      {/* Lo de detrás: el brazo y la pierna del lado de allá, apagados para
          que se lean como lo que están, más lejos. */}
      <g opacity="0.8">
        <Miembro points={body.farLeg} upper={face.skin} lower={MEDIAS} w={13} end={TINTA} boot />
        <Miembro points={body.farArm} upper={sombra(kit)} lower={face.skin} w={9.5} end={face.skin} />
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
      {/* La sombra plana de un costado, de borde duro: la del anime. */}
      <path
        d={`M${body.shoulder[0] + 8} ${body.shoulder[1] - 2}
            L${body.shoulder[0] + 18} ${body.shoulder[1]}
            L${body.hip[0] + 15} ${body.hip[1] - 8}
            L${body.hip[0] + 6} ${body.hip[1] - 8} Z`}
        fill="#000"
        opacity="0.16"
      />

      {/* El cuello. Dos trazos y una camiseta deja de ser un jersey: en la
          serie todas las equipaciones llevan su vivo, y a este tamaño es lo
          que dice por dónde se asoma la cabeza. */}
      <path
        d={`M${body.shoulder[0] - 7} ${body.shoulder[1] - 2.5}
            Q${body.shoulder[0]} ${body.shoulder[1] + 5} ${body.shoulder[0] + 7} ${body.shoulder[1] - 3.5}`}
        fill="none"
        stroke={TINTA}
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.75"
      />

      {/* El dorsal, que es lo que convierte una camiseta en una camiseta. */}
      <text
        x={body.shoulder[0]}
        y={body.shoulder[1] + 34}
        textAnchor="middle"
        fontSize="22"
        fontWeight="900"
        fill="#fff"
        stroke={TINTA}
        strokeWidth="0.8"
        opacity="0.95"
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
      <Miembro points={body.nearArm} upper={sombra(kit)} lower={face.skin} w={10} end={face.skin} />
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

/** La gorra roja: lo primero que se ve de él, y lo que dice quién es. */
export const GORRA = '#d62828';

/** La camiseta de portero: gris pizarra con el vivo rojo de la gorra. */
const JERSEY_BENJI = '#4b5a6b';

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
      {/* Piernas. */}
      <Miembro points={body.legA} upper={face.skin} lower={MEDIAS} w={11} end={TINTA} boot />
      <Miembro points={body.legB} upper={face.skin} lower={MEDIAS} w={11} end={TINTA} boot />

      {/* Calzona. */}
      <polygon
        points={losa(shortsTop, shortsBottom, 14, 15.5)}
        fill="#111827"
        stroke={TINTA}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* Tronco, con el vivo rojo del cuello y la sombra de un costado. */}
      <polygon
        points={losa(body.hip, body.shoulder, 13.5, 17)}
        fill={JERSEY_BENJI}
        stroke={TINTA}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* El vivo rojo de los hombros, que es el de la gorra. */}
      <polygon points={losa(body.shoulder, [body.shoulder[0] - up[0] * 5, body.shoulder[1] - up[1] * 5], 17, 16.4)} fill={GORRA} stroke={TINTA} strokeWidth="1.2" />
      <text
        x={chest[0]}
        y={chest[1] + 6}
        textAnchor="middle"
        fontSize="17"
        fontWeight="900"
        fill="#fff"
        stroke={TINTA}
        strokeWidth="0.7"
        transform={`rotate(${headTurn} ${chest[0]} ${chest[1]})`}
      >
        1
      </text>

      {/* Brazos, por delante del pecho: son lo que para. */}
      <Miembro points={body.armA} upper={sombra(JERSEY_BENJI, 0.8)} lower={sombra(JERSEY_BENJI, 0.8)} w={9} end="#fde047" glove />
      <Miembro points={body.armB} upper={sombra(JERSEY_BENJI, 0.8)} lower={sombra(JERSEY_BENJI, 0.8)} w={9} end="#fde047" glove />

      {/* La cabeza, con su gorra. */}
      <g transform={`translate(${body.head[0]} ${body.head[1]}) rotate(${headTurn}) scale(0.62)`}>
        <path d="M-9 20 Q0 26 9 20 L9 30 Q0 34 -9 30 Z" fill="#dc2626" stroke={TINTA} strokeWidth="1.4" />
        <Cabeza face={face} />
        <Gorra />
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
  /** Uno de los peques, o Benji. */
  who: Casero | 'benji';
  className?: string;
  rayas?: boolean;
  /** Llenar la caja aunque no sea cuadrada, recortando lo que sobre. */
  fill?: boolean;
}) {
  const benji = who === 'benji';
  const face = benji ? CARA_BENJI : caraDe(who);
  const fondo = benji ? '#1f2a37' : ROPA_FAMILIA[who];
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
        <g transform="translate(50 62) scale(1.5)">
          <Cabeza face={face} />
          {benji && <Gorra />}
        </g>
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
function Nube({ x, y, s }: { x: number; y: number; s: number }) {
  const bolas: [number, number, number][] = [
    [0, 0, 11],
    [13, -8, 15],
    [30, -4, 12],
    [42, 2, 8],
    [-10, 4, 7],
  ];

  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {bolas.map(([cx, cy, r]) => (
        <circle key={`s${cx}`} cx={cx} cy={cy + 3} r={r} fill="#cfe6f7" />
      ))}
      {bolas.map(([cx, cy, r]) => (
        <circle key={`b${cx}`} cx={cx} cy={cy} r={r} fill="#fff" />
      ))}
      <rect x="-14" y="4" width="62" height="8" rx="4" fill="#cfe6f7" />
    </g>
  );
}

/** Una torre de luz: el mástil y el panel de focos arriba. */
function Torre({ x }: { x: number }) {
  return (
    <g>
      <path d={`M${x - 2} 70 L${x - 1} 16 L${x + 1} 16 L${x + 2} 70 Z`} fill="#8b9bb0" stroke={TINTA} strokeWidth="0.8" />
      <rect x={x - 12} y="4" width="24" height="14" rx="1.5" fill="#dbe4ee" stroke={TINTA} strokeWidth="1.2" />
      {[0, 1, 2].map((col) =>
        [0, 1].map((row) => (
          <circle key={`${col}${row}`} cx={x - 7 + col * 7} cy={8 + row * 6} r="2.2" fill="#fff8c4" />
        )),
      )}
    </g>
  );
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
  const franjas = [121, 129, 139, 152, 169, 191, 220, 258, 300];

  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a86dc" />
          <stop offset="0.55" stopColor="#58b0ee" />
          <stop offset="1" stopColor="#bde3fb" />
        </linearGradient>
        {/* La gente: puntos de cabeza y de camiseta, en dos tramas. */}
        <pattern id="gente" width="9" height="8" patternUnits="userSpaceOnUse">
          <rect width="9" height="8" fill="#23446d" />
          <circle cx="2" cy="2.2" r="1.5" fill="#f1c9a5" />
          <circle cx="2" cy="5.6" r="1.8" fill="#e5e7eb" />
          <circle cx="6.6" cy="3.4" r="1.5" fill="#d9a77f" />
          <circle cx="6.6" cy="6.8" r="1.8" fill={color} />
        </pattern>
        <pattern id="gente2" width="8" height="7" patternUnits="userSpaceOnUse">
          <rect width="8" height="7" fill="#1a3456" />
          <circle cx="2" cy="2" r="1.3" fill="#e7bb95" />
          <circle cx="2" cy="5" r="1.6" fill="#f8fafc" />
          <circle cx="6" cy="3" r="1.3" fill="#c98f66" />
          <circle cx="6" cy="6" r="1.6" fill="#fbbf24" />
        </pattern>
        <pattern id="red" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 H9 M0 0 V9" stroke="#fff" strokeWidth="0.9" opacity="0.7" />
        </pattern>
        <pattern id="red-lado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 H6 M0 0 V6" stroke="#fff" strokeWidth="0.7" opacity="0.55" />
        </pattern>
      </defs>

      {/* Cielo y nubes. */}
      <rect width="400" height="130" fill="url(#cielo)" />
      <Nube x={34} y={20} s={0.9} />
      <Nube x={186} y={14} s={1.15} />
      <Nube x={320} y={24} s={0.8} />

      <Torre x={20} />
      <Torre x={380} />

      {/* La grada, en dos anillos, con la visera del anillo de arriba. */}
      <path d="M0 44 Q200 30 400 44 V80 H0 Z" fill="url(#gente)" />
      <path d="M0 44 Q200 30 400 44" fill="none" stroke="#0f1f33" strokeWidth="3" />
      <rect x="0" y="80" width="400" height="4" fill="#0f1f33" />
      <rect x="0" y="84" width="400" height="24" fill="url(#gente2)" />

      {/* Pancartas en la grada: la del que tira, y dos más de ambiente. */}
      <g stroke={TINTA} strokeWidth="1">
        <rect x="2" y="86" width="42" height="15" fill={color} />
        <rect x="358" y="87" width="40" height="13" fill="#fde047" />
      </g>
      <g fontFamily="var(--font-pitch)" fontWeight="900" textAnchor="middle" fill="#fff">
        <text x="23" y="97" fontSize="8" stroke={TINTA} strokeWidth="0.5">
          ¡{name.toUpperCase()}!
        </text>
        <text x="378" y="96.6" fontSize="6.6" fill={TINTA}>
          ¡ÁNIMO!
        </text>
      </g>

      {/* La valla de publicidad. */}
      <rect x="0" y="108" width="400" height="13" fill="#f4f4f2" stroke={TINTA} strokeWidth="1.6" />
      {[0, 100, 200, 300].map((vx, i) => (
        <g key={vx}>
          <rect x={vx} y="108" width="100" height="13" fill={i % 2 ? '#1d4ed8' : '#f4f4f2'} />
          <text
            x={vx + 50}
            y="117.8"
            fontSize="8"
            fontWeight="900"
            fontFamily="var(--font-pitch)"
            textAnchor="middle"
            fill={i % 2 ? '#fff' : '#d62828'}
            fontStyle="italic"
          >
            {['NANKATSU', 'CEA·DÍAZ', 'FÚTBOL', 'CAMPEONES'][i]}
          </text>
        </g>
      ))}
      <rect x="0" y="108" width="400" height="13" fill="none" stroke={TINTA} strokeWidth="1.6" />

      {/* El césped a franjas. */}
      {franjas.slice(0, -1).map((top, i) => (
        <rect key={top} x="0" y={top} width="400" height={franjas[i + 1] - top} fill={i % 2 ? '#2f9a47' : '#37a852'} />
      ))}

      {/* Las líneas: la de gol, la del área pequeña y el punto. */}
      <g fill="none" stroke="#fff" strokeLinecap="round" opacity="0.92">
        <path d={`M0 ${line} H400`} strokeWidth="2.4" />
        <path d="M-10 186 H410" strokeWidth="3" />
        <path d={`M${x - 36} ${line} L${x - 70} 186 M${right + 36} ${line} L${right + 70} 186`} strokeWidth="2.6" />
      </g>
      <ellipse cx="160" cy="263" rx="9" ry="3.4" fill="#fff" opacity="0.92" />

      {/* La portería. Primero lo de dentro —el suelo, el fondo y los
          laterales, con su red— y después los palos, por delante. */}
      <g>
        {/* Suelo de dentro de la portería, en sombra. */}
        <path d={`M${x} ${line} L${back.l} ${back.b} H${back.r} L${right} ${line} Z`} fill="#1f7a37" />
        {/* El fondo, con la red y un velo oscuro para que la mira y el
            balón se lean encima. */}
        <rect x={back.l} y={back.t} width={back.r - back.l} height={back.b - back.t} fill="#0c1c2e" opacity="0.66" />
        <rect x={back.l} y={back.t} width={back.r - back.l} height={back.b - back.t} fill="url(#red)" />
        {/* Laterales y techo, con una red más apretada y más sombra. */}
        <path d={`M${x} ${y} L${back.l} ${back.t} V${back.b} L${x} ${line} Z`} fill="#0b1b2c" opacity="0.55" />
        <path d={`M${x} ${y} L${back.l} ${back.t} V${back.b} L${x} ${line} Z`} fill="url(#red-lado)" />
        <path d={`M${right} ${y} L${back.r} ${back.t} V${back.b} L${right} ${line} Z`} fill="#0b1b2c" opacity="0.55" />
        <path d={`M${right} ${y} L${back.r} ${back.t} V${back.b} L${right} ${line} Z`} fill="url(#red-lado)" />
        <path d={`M${x} ${y} L${back.l} ${back.t} H${back.r} L${right} ${y} Z`} fill="#0b1b2c" opacity="0.45" />
        <path d={`M${x} ${y} L${back.l} ${back.t} H${back.r} L${right} ${y} Z`} fill="url(#red-lado)" />
        {/* Los tubos de atrás. */}
        <path
          d={`M${back.l} ${back.b} V${back.t} H${back.r} V${back.b}`}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="1.6"
          opacity="0.8"
        />
      </g>

      {/* La sombra de la portería en el césped, plana. */}
      <path d={`M${x - 6} ${line + 2} H${right + 6} L${right + 18} ${line + 8} H${x - 18} Z`} fill="#000" opacity="0.14" />

      {/* Palos y larguero, blancos con tinta y su sombra plana. */}
      <g stroke={TINTA} strokeWidth="1.6" strokeLinejoin="round">
        <path d={`M${x - 6} ${line + 1} V${y - 6} H${right + 6} V${line + 1} H${right} V${y} H${x} V${line + 1} Z`} fill="#fbfbf9" />
      </g>
      <path d={`M${x - 2} ${line} V${y - 2} H${right - 20}`} fill="none" stroke="#cbd5e1" strokeWidth="2" />
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
