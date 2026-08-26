import type { ReactNode } from 'react';

import { Cabeza, Figura, Rayos, TINTA } from '@/components/ui/CromoFace';
import { caraDe, ROPA_FAMILIA, type Casero } from '@/lib/cromoArt';
import type { CromoReward } from '@/types';

/* =========================================================================
 *  Las escenas de casa.
 *
 *  Los cromos de casa —los que coleccionan María y Víctor— no son de nadie
 *  del fútbol: son la mesa de la cena, el taxi de los entrenos, el paseo de
 *  después de cenar. Hasta ahora salían con un emoji, que dice poco. Aquí
 *  cada uno tiene su ilustración, dibujada con las mismas piezas que los
 *  cromos de los peques y con **los cuatro de casa** dentro, sacados de las
 *  fotos de los perfiles: Leo moreno de ojos claros, Hugo rubio de tupé,
 *  María de melena larga y Víctor con la barba.
 *
 *  Cada uno va con el color de su perfil —Leo verde, Hugo rojo, María rosa,
 *  Víctor azul—, de modo que en la mesa de la cena se sabe quién es quién sin
 *  leer nada.
 *
 *  Todo es SVG en línea sobre el mismo lienzo de 100×120 que los retratos, y
 *  añadir una escena es añadir una fila a `ESCENAS`.
 * ========================================================================= */

/** Las cuatro caras, resueltas una sola vez. */
const CARAS = {
  leo: caraDe('leo'),
  hugo: caraDe('hugo'),
  maria: caraDe('maria'),
  victor: caraDe('victor'),
};

/** Uno de casa, puesto donde se le diga y del color de su perfil. */
function P({
  who,
  x,
  y,
  s,
  flip,
}: {
  who: Casero;
  x: number;
  y: number;
  s: number;
  flip?: boolean;
}) {
  return <Figura face={CARAS[who]} color={ROPA_FAMILIA[who]} x={x} y={y} s={s} flip={flip} />;
}

/** Sólo la cabeza: para cuando el cuerpo queda tapado por una mesa o un sofá. */
function C({ who, x, y, s }: { who: Casero; x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Cabeza face={CARAS[who]} />
    </g>
  );
}

/** Los cuatro colocados como en la foto: los padres detrás, los peques delante. */
function Cuarteto({ dy = 0 }: { dy?: number }) {
  return (
    <>
      <P who="victor" x={31} y={42 + dy} s={0.44} />
      <P who="maria" x={71} y={44 + dy} s={0.44} />
      <P who="leo" x={26} y={70 + dy} s={0.48} />
      <P who="hugo" x={64} y={72 + dy} s={0.48} />
    </>
  );
}

/** El cielo, el techo o la pared: la banda de color de la que sale la escena. */
function Fondo({ uid, from, to }: { uid: string; from: string; to: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`cielo-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="100" height="120" fill={`url(#cielo-${uid})`} />
    </>
  );
}

/** El suelo: la banda de abajo sobre la que se apoya todo. */
function Suelo({ y, color }: { y: number; color: string }) {
  return <rect x="0" y={y} width="100" height={120 - y} fill={color} />;
}

/* -------------------------------------------------------------------------
 * Atrezzo suelto
 * ----------------------------------------------------------------------- */

function Balon({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="#f7f7f5" stroke={TINTA} strokeWidth="1.1" />
      <path
        d={`M0 ${-r * 0.55} l ${r * 0.52} ${r * 0.38} l ${-r * 0.2} ${r * 0.62} h ${-r * 0.64} l ${-r * 0.2} ${-r * 0.62} Z`}
        fill={TINTA}
      />
    </g>
  );
}

function Camisetita({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M-7 0 L-4 -3 H4 L7 0 L4.5 2.5 V11 H-4.5 V2.5 Z"
        fill={color}
        stroke={TINTA}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </g>
  );
}

function Corazon({ x, y, s, color = '#ef4a72' }: { x: number; y: number; s: number; color?: string }) {
  return (
    <path
      d="M0 4 C-6 -1 -5 -7 -1.6 -6 C-0.4 -5.6 0 -4.6 0 -4.6 C0 -4.6 0.4 -5.6 1.6 -6 C5 -7 6 -1 0 4 Z"
      transform={`translate(${x} ${y}) scale(${s})`}
      fill={color}
    />
  );
}

/* -------------------------------------------------------------------------
 * Las escenas, una por cromo
 * ----------------------------------------------------------------------- */

const ESCENAS: Record<string, (uid: string) => ReactNode> = {
  /* --- Nivel «casa»: la semana por dentro --------------------------------- */

  /** La mesa de la cena: los cuatro y una lámpara encima. */
  'mesa-ocho': (uid) => (
    <>
      <Fondo uid={uid} from="#3b2a1f" to="#6b4a30" />
      {/* Lámpara: el único foco de la escena. */}
      <path d="M50 0 V14" stroke={TINTA} strokeWidth="1.4" />
      <path d="M38 26 L50 13 L62 26 Z" fill="#f2c14e" stroke={TINTA} strokeWidth="1.1" />
      {/* Cono de luz, no un halo: sobre la pared marrón un óvalo se leía como
          una mancha de humedad. */}
      <path d="M40 26 L10 94 H90 L60 26 Z" fill="#ffe9a8" opacity="0.09" />

      {/* Enteros y no sólo la cabeza: si no, se quedan cuatro caras flotando
          en el hueco que va del cuello al mantel. */}
      <P who="victor" x={16} y={60} s={0.42} />
      <P who="maria" x={39} y={56} s={0.42} />
      <P who="leo" x={62} y={60} s={0.42} />
      <P who="hugo" x={85} y={57} s={0.42} />

      {/* La mesa, por delante de todos: es lo que los sienta. */}
      <path d="M0 94 H100 V120 H0 Z" fill="#8a5a34" />
      <rect x="0" y="94" width="100" height="4" fill="#a97246" />
      <g fill="#f5f2ea" stroke={TINTA} strokeWidth="0.7">
        <ellipse cx="20" cy="104" rx="9" ry="3.4" />
        <ellipse cx="43" cy="104" rx="9" ry="3.4" />
        <ellipse cx="65" cy="104" rx="9" ry="3.4" />
        <ellipse cx="86" cy="104" rx="9" ry="3.4" />
      </g>
    </>
  ),

  /** El cuento de la noche: María leyendo y los dos pegados a ella. */
  'cuento-noche': (uid) => (
    <>
      <Fondo uid={uid} from="#141c46" to="#2b1f52" />
      <circle cx="79" cy="20" r="10" fill="#f7e6a8" opacity="0.85" />
      <g fill="#fdf6d8" opacity="0.75">
        <circle cx="16" cy="16" r="1.4" />
        <circle cx="30" cy="9" r="1" />
        <circle cx="58" cy="12" r="1.2" />
        <circle cx="93" cy="42" r="1" />
      </g>

      <P who="maria" x={50} y={48} s={0.56} />
      <P who="leo" x={17} y={72} s={0.4} flip />
      <P who="hugo" x={83} y={72} s={0.4} />

      {/* El cuento abierto, en primer término. */}
      <path
        d="M18 100 Q50 92 82 100 L82 113 Q50 105 18 113 Z"
        fill="#f7f3e6"
        stroke={TINTA}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M50 96 V109" stroke={TINTA} strokeWidth="1" opacity="0.6" />
      <g stroke={TINTA} strokeWidth="0.7" opacity="0.3">
        <path d="M25 102 Q37 99 46 101" fill="none" />
        <path d="M54 101 Q64 99 76 102" fill="none" />
      </g>
    </>
  ),

  /** El taxi de los entrenos: Víctor al volante y los dos detrás. */
  'taxi-entrenos': (uid) => (
    <>
      <Fondo uid={uid} from="#8ec8f0" to="#cfe6f7" />
      <Suelo y={98} color="#4b5563" />
      <rect x="0" y="106" width="100" height="2.5" fill="#f4f4f2" opacity="0.8" />

      {/* Carrocería con el techo caído hacia los lados: con el techo recto y
          alto salía una furgoneta, no el coche de llevarlos a entrenar. */}
      <path
        d="M4 100 V86 Q5 79 13 77 L25 58 Q29 51 40 51 H62 Q73 51 77 58 L89 77 Q95 79 96 86 V100 Z"
        fill="#1f6feb"
        stroke={TINTA}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M27 76 L37 58 H63 L73 76 Z" fill="#cfe9fb" stroke={TINTA} strokeWidth="1" />

      <C who="victor" x={37} y={68} s={0.27} />
      <C who="leo" x={51} y={69} s={0.25} />
      <C who="hugo" x={64} y={69} s={0.25} />

      {/* Ruedas y faros. */}
      <g fill={TINTA}>
        <circle cx="24" cy="100" r="9" />
        <circle cx="76" cy="100" r="9" />
      </g>
      <g fill="#9ca3af">
        <circle cx="24" cy="100" r="3.8" />
        <circle cx="76" cy="100" r="3.8" />
      </g>
      <g fill="#ffe9a8" stroke={TINTA} strokeWidth="0.8">
        <ellipse cx="9" cy="88" rx="4.5" ry="3" />
        <ellipse cx="91" cy="88" rx="4.5" ry="3" />
      </g>
    </>
  ),

  /** La colada del domingo: el tendal de equipaciones y la cesta. */
  'colada-domingo': (uid) => (
    <>
      <Fondo uid={uid} from="#bfe6d6" to="#8fd3b6" />
      <path d="M0 22 Q50 32 100 22" fill="none" stroke={TINTA} strokeWidth="1" opacity="0.7" />
      <Camisetita x={18} y={27} color="#16a34a" />
      <Camisetita x={39} y={30} color="#dc2626" />
      <Camisetita x={61} y={30} color="#db2777" />
      <Camisetita x={82} y={27} color="#2563eb" />

      <P who="victor" x={50} y={62} s={0.62} />

      {/* La cesta, delante: se la ve cargándola. */}
      <path
        d="M24 96 L28 118 H72 L76 96 Z"
        fill="#c9925a"
        stroke={TINTA}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <g stroke={TINTA} strokeWidth="0.7" opacity="0.4">
        <path d="M26 104 H74" />
        <path d="M27 111 H73" />
      </g>
      <path d="M28 96 Q40 88 52 96 Q64 88 74 96 Z" fill="#f4f4f2" stroke={TINTA} strokeWidth="1" />
    </>
  ),

  /** El desayuno de las prisas: los dos, los tazones y el reloj. */
  'desayuno-prisa': (uid) => (
    <>
      <Fondo uid={uid} from="#fde8c8" to="#f7cf9a" />
      <circle cx="79" cy="24" r="12" fill="#fdfcfa" stroke={TINTA} strokeWidth="1.4" />
      <g stroke={TINTA} strokeWidth="1.5" strokeLinecap="round">
        <path d="M79 24 V16" />
        <path d="M79 24 L85 27" />
      </g>

      <P who="leo" x={31} y={58} s={0.5} />
      <P who="hugo" x={69} y={60} s={0.5} flip />

      <path d="M0 100 H100 V120 H0 Z" fill="#b5793f" />
      <rect x="0" y="100" width="100" height="3.5" fill="#d69a5c" />
      <g fill="#f5f2ea" stroke={TINTA} strokeWidth="1">
        <path d="M20 98 H42 L39 110 H23 Z" />
        <path d="M58 98 H80 L77 110 H61 Z" />
      </g>
    </>
  ),

  /** El paseo de después de cenar: los dos y la ciudad al anochecer. */
  'paseo-cena': (uid) => (
    <>
      <Fondo uid={uid} from="#f4a15c" to="#6b4a8f" />
      <circle cx="50" cy="56" r="17" fill="#ffd58a" opacity="0.55" />
      <g fill="#3a2b4d" opacity="0.85">
        <rect x="0" y="70" width="14" height="30" />
        <rect x="16" y="62" width="11" height="38" />
        <rect x="29" y="76" width="13" height="24" />
        <rect x="62" y="66" width="12" height="34" />
        <rect x="76" y="74" width="10" height="26" />
        <rect x="88" y="60" width="12" height="40" />
      </g>
      <g fill="#ffd58a" opacity="0.7">
        <rect x="18" y="66" width="2.5" height="3" />
        <rect x="23" y="72" width="2.5" height="3" />
        <rect x="90" y="65" width="2.5" height="3" />
        <rect x="95" y="72" width="2.5" height="3" />
      </g>

      <P who="maria" x={36} y={60} s={0.54} />
      <P who="victor" x={67} y={57} s={0.56} flip />

      <Suelo y={100} color="#2f2440" />
      <rect x="0" y="100" width="100" height="2" fill="#4b3a63" />
    </>
  ),

  /** El aula de las nueve: María, el portátil y los alumnos al otro lado. */
  'aula-maria': (uid) => (
    <>
      <Fondo uid={uid} from="#1e2a52" to="#33265e" />
      {/* Los alumnos, en sus ventanitas. */}
      <g stroke={TINTA} strokeWidth="1" fill="#22355f">
        <rect x="4" y="20" width="22" height="17" rx="3" />
        <rect x="74" y="20" width="22" height="17" rx="3" />
      </g>
      <g fill="#c9a27a">
        <circle cx="15" cy="27" r="4" />
        <circle cx="85" cy="27" r="4" />
        <path d="M8 37 q7 -6 14 0 Z" />
        <path d="M78 37 q7 -6 14 0 Z" />
      </g>

      <P who="maria" x={50} y={50} s={0.66} />

      {/* El portátil abierto, visto de espaldas. */}
      <path
        d="M22 92 H78 L88 118 H12 Z"
        fill="#c8cdd6"
        stroke={TINTA}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <rect x="34" y="100" width="32" height="9" rx="1.5" fill="#8f97a5" />
    </>
  ),

  /** El consejo del domingo: los cuatro y la semana escrita en la pizarra. */
  'consejo-domingo': (uid) => (
    <>
      <Fondo uid={uid} from="#dcefe4" to="#a9d6c0" />
      <rect
        x="56"
        y="8"
        width="40"
        height="30"
        rx="3"
        fill="#f7f5ee"
        stroke={TINTA}
        strokeWidth="1.3"
      />
      <g stroke="#1f6feb" strokeWidth="1.4" strokeLinecap="round" opacity="0.8">
        <path d="M61 16 H84" />
        <path d="M61 22 H90" />
        <path d="M61 28 H78" />
      </g>
      <Cuarteto dy={4} />
      <Suelo y={112} color="#6d9d86" />
    </>
  ),

  /* --- Nivel «plantilla»: uno por cabeza ---------------------------------- */

  /** Leo: cinco deportes y el balón. */
  'leo-casa': (uid) => (
    <>
      <Fondo uid={uid} from="#1c6b3f" to="#0f3c25" />
      <Rayos color="#7ee2a8" />
      <P who="leo" x={50} y={48} s={1} />
      <Balon x={82} y={102} r={11} />
    </>
  ),

  /** Hugo: el cronómetro con el que se mide contra sí mismo. */
  'hugo-casa': (uid) => (
    <>
      <Fondo uid={uid} from="#8c1f22" to="#43100f" />
      <Rayos color="#ffb3a7" />
      <P who="hugo" x={50} y={48} s={1} />
      <g transform="translate(82 100)">
        <circle r="11" fill="#f4f4f2" stroke={TINTA} strokeWidth="1.4" />
        <rect x="-3" y="-14" width="6" height="3.5" rx="1" fill={TINTA} />
        <path d="M0 0 V-7 M0 0 L6 3" stroke="#c1272d" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </>
  ),

  /** María: el libro que saca siempre el rato de leer. */
  'maria-casa': (uid) => (
    <>
      <Fondo uid={uid} from="#8f2a63" to="#3f1235" />
      <Rayos color="#f9a8d4" />
      <P who="maria" x={50} y={48} s={1} />
      <g transform="translate(80 100)">
        <path
          d="M-12 -8 Q0 -12 12 -8 V8 Q0 4 -12 8 Z"
          fill="#f7f3e6"
          stroke={TINTA}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M0 -10 V6" stroke={TINTA} strokeWidth="1" opacity="0.55" />
      </g>
    </>
  ),

  /** Víctor: la carpeta de analizar rivales toda la semana. */
  'victor-casa': (uid) => (
    <>
      <Fondo uid={uid} from="#1b3f7a" to="#0d1c3d" />
      <Rayos color="#93c5fd" />
      <P who="victor" x={50} y={48} s={1} />
      <g transform="translate(80 100)">
        <rect x="-10" y="-12" width="20" height="24" rx="2" fill="#c9925a" stroke={TINTA} strokeWidth="1.2" />
        <rect x="-7" y="-9" width="14" height="18" fill="#f7f3e6" />
        <rect x="-4" y="-15" width="8" height="4" rx="1.5" fill={TINTA} />
        <g stroke="#1f6feb" strokeWidth="1.1" strokeLinecap="round" opacity="0.8">
          <path d="M-5 -5 H4" />
          <path d="M-5 -1 H3" />
          <path d="M-5 3 H5" />
        </g>
      </g>
    </>
  ),

  /** Los hermanos: los dos y una sola pelota. */
  'hermanos-casa': (uid) => (
    <>
      <Fondo uid={uid} from="#2b7a4b" to="#8c1f22" />
      <Rayos color="#fde68a" />
      <P who="leo" x={32} y={54} s={0.72} />
      <P who="hugo" x={68} y={54} s={0.72} flip />
      <Balon x={50} y={110} r={10} />
    </>
  ),

  /** María y Víctor: los diez minutos que no van de nada más. */
  'pareja-casa': (uid) => (
    <>
      <Fondo uid={uid} from="#7a2f6b" to="#25204a" />
      <Rayos color="#f9a8d4" />
      <P who="maria" x={33} y={56} s={0.7} />
      <P who="victor" x={67} y={54} s={0.72} flip />
      <Corazon x={50} y={26} s={2.2} />
      <Corazon x={20} y={18} s={1.1} />
      <Corazon x={81} y={16} s={1.3} />
    </>
  ),

  /* --- Nivel «leyenda de casa» -------------------------------------------- */

  /** Los Cea Díaz al completo, bajo el tejado. */
  'plantilla-completa': (uid) => (
    <>
      <Fondo uid={uid} from="#f2c14e" to="#b5793f" />
      <Rayos color="#fff3c4" />
      {/* Tejado y paredes: sólo el triángulo se leía como una tienda de campaña. */}
      <path d="M14 32 H86 V64 H14 Z" fill="#e8c489" stroke={TINTA} strokeWidth="1.2" />
      <path d="M6 34 L50 6 L94 34 Z" fill="#a8341f" stroke={TINTA} strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="44" y="18" width="12" height="12" rx="1.5" fill="#ffe9a8" stroke={TINTA} strokeWidth="1" />
      <Cuarteto dy={6} />
      <Suelo y={114} color="#8a5a34" />
    </>
  ),

  /** La semana entera: siete días y ninguno caído. */
  'semana-entera': (uid) => (
    <>
      <Fondo uid={uid} from="#2f7a5c" to="#123b2c" />
      <Rayos color="#a7f3d0" />
      <Cuarteto dy={10} />
      <g>
        {[8, 21, 34, 47, 60, 73, 86].map((x) => (
          <g key={x} transform={`translate(${x + 3} 16)`}>
            <circle r="6" fill="#f2c14e" stroke={TINTA} strokeWidth="1" />
            <path
              d="M-2.6 0 L-0.8 2.4 L2.8 -2.4"
              fill="none"
              stroke={TINTA}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ))}
      </g>
    </>
  ),

  /** El finde que no se descuadró: sábado y domingo en pie. */
  'finde-cuadrado': (uid) => (
    <>
      <Fondo uid={uid} from="#ffd58a" to="#f4874b" />
      <circle cx="50" cy="20" r="14" fill="#fff3c4" stroke={TINTA} strokeWidth="1.2" />
      <g stroke="#fff3c4" strokeWidth="2" strokeLinecap="round" opacity="0.8">
        <path d="M50 2 V-2" />
        <path d="M28 20 H22" />
        <path d="M78 20 H72" />
      </g>
      <g fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="11" fill={TINTA}>
        <text x="18" y="24" textAnchor="middle">
          S
        </text>
        <text x="82" y="24" textAnchor="middle">
          D
        </text>
      </g>
      <Cuarteto dy={12} />
      <Suelo y={114} color="#c96a2e" />
    </>
  ),

  /** El partido visto en el sofá: los cuatro, una pantalla y ningún móvil. */
  'partido-sofa': (uid) => (
    <>
      <Fondo uid={uid} from="#232a45" to="#141726" />
      {/* La tele, con su campo dentro. */}
      <rect x="20" y="6" width="60" height="34" rx="3" fill="#0f2e1c" stroke={TINTA} strokeWidth="1.5" />
      <g stroke="#7ee2a8" strokeWidth="1" opacity="0.85" fill="none">
        <rect x="24" y="10" width="52" height="26" />
        <path d="M50 10 V36" />
        <circle cx="50" cy="23" r="5" />
      </g>
      <ellipse cx="50" cy="52" rx="42" ry="14" fill="#7ee2a8" opacity="0.12" />

      <P who="victor" x={18} y={66} s={0.4} />
      <P who="leo" x={40} y={68} s={0.4} />
      <P who="hugo" x={61} y={68} s={0.4} />
      <P who="maria" x={83} y={66} s={0.4} />

      {/* El sofá, por delante: es lo que los junta. */}
      <path
        d="M2 96 Q2 88 10 88 H90 Q98 88 98 96 V120 H2 Z"
        fill="#8b3a52"
        stroke={TINTA}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <g stroke={TINTA} strokeWidth="0.9" opacity="0.35">
        <path d="M26 90 V120" />
        <path d="M50 90 V120" />
        <path d="M74 90 V120" />
      </g>
    </>
  ),

  /** El verano de los cuatro: sin despertador y con el día por delante. */
  'verano-familia': (uid) => (
    <>
      <Fondo uid={uid} from="#8ed8f5" to="#dff2fb" />
      <circle cx="82" cy="18" r="11" fill="#ffd166" stroke={TINTA} strokeWidth="1.1" />
      <rect x="0" y="62" width="100" height="20" fill="#2f9bd1" />
      <g stroke="#eaf7ff" strokeWidth="1.2" fill="none" opacity="0.8">
        <path d="M4 68 q6 -3 12 0 t12 0" />
        <path d="M56 74 q6 -3 12 0 t12 0" />
      </g>
      <rect x="0" y="82" width="100" height="38" fill="#f2dcae" />
      <Cuarteto dy={4} />
      <Balon x={13} y={110} r={8} />
    </>
  ),
};

/* -------------------------------------------------------------------------
 * Uso
 * ----------------------------------------------------------------------- */

/** ¿Este cromo tiene ilustración propia? */
export function tieneEscena(cromo: CromoReward): boolean {
  return cromo.id in ESCENAS;
}

/** La ilustración del cromo, en el mismo lienzo que los retratos. */
export function EscenaCasa({ cromo }: { cromo: CromoReward }) {
  const escena = ESCENAS[cromo.id];
  if (!escena) return null;

  // El identificador da nombre único a los degradados: si dos escenas de la
  // misma página comparten el `id` del gradiente, la segunda pisa a la primera.
  const uid = cromo.id.replace(/[^a-z0-9-]/gi, '');

  return (
    <svg viewBox="0 0 100 120" className="h-full w-full" role="presentation" aria-hidden>
      {escena(uid)}
    </svg>
  );
}
