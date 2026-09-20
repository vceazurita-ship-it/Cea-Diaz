import { TINTA } from '@/components/ui/CromoFace';

/* =========================================================================
 *  Las piezas del cuerpo, dibujadas a mano.
 *
 *  Antes el cuerpo se generaba: cada miembro era una línea gorda entre dos
 *  puntos, y por eso los jugadores se leían como muñecos de tubos. Aquí cada
 *  pieza —muslo, pantorrilla, brazo, antebrazo, tronco, mano y bota— está
 *  **dibujada** en vertical, con su silueta, su sombra, su filo de luz y sus
 *  detalles (costuras, vuelto de la media, cordones), y se coloca en la pose
 *  girándola y estirándola entre sus dos puntos.
 *
 *  Así se conservan las poses de siempre —esperar, armar la pierna, el
 *  latigazo, celebrar, y las cuatro de Benji— pero lo que se ve es dibujo.
 * ========================================================================= */

export type P = [number, number];

/** Aclara u oscurece un color, para las sombras y los brillos de cada pieza. */
export function tono(hex: string, f: number): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;

  const mezcla = (v: number) => (f >= 1 ? v + (255 - v) * (f - 1) : v * f);

  return (
    '#' +
    [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((v) => Math.round(Math.max(0, Math.min(255, mezcla(v)))))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

const rumbo = (a: P, b: P) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const largo = (a: P, b: P) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Coloca una pieza dibujada en vertical —de (0,0) a (0,`base`)— entre dos
 * puntos: la gira hacia donde va y la estira hasta donde llega.
 */
function Pieza({
  from,
  to,
  base,
  flip = 1,
  children,
}: {
  from: P;
  to: P;
  /** Largo con el que está dibujada la pieza. */
  base: number;
  /** -1 para el lado contrario, que así no se repite el mismo dibujo. */
  flip?: 1 | -1;
  children: React.ReactNode;
}) {
  const k = largo(from, to) / base;

  return (
    <g transform={`translate(${from[0]} ${from[1]}) rotate(${rumbo(from, to) - 90}) scale(${flip} ${k})`}>
      {children}
    </g>
  );
}

/* ----------------------------------------------------------------- piernas */

/** El muslo: gordo arriba, marcado por dentro y afinando hacia la rodilla. */
export function Muslo({ piel }: { piel: string }) {
  return (
    <g strokeLinejoin="round">
      <path
        d="M-8.6 0 C-10.2 10 -9.4 22 -6.4 31 L6.2 31 C8.6 22 9 10 7.8 0 Z"
        fill={piel}
        stroke={TINTA}
        strokeWidth="1.6"
      />
      <path d="M2.4 1 C5 11 5.2 22 3.4 30.6 L6.2 31 C8.6 22 9 10 7.8 0 Z" fill="#000" opacity="0.16" />
      <path d="M-7.4 2 C-9 11 -8.6 21 -6.6 29" fill="none" stroke="#fff" strokeWidth="2" opacity="0.2" />
      {/* El pliegue de la ingle, que es lo que dice que ahí hay una pierna. */}
      <path d="M-4.6 1.6 C-2.6 5 -1.6 8 -1.4 11" fill="none" stroke={TINTA} strokeWidth="1" opacity="0.35" />
    </g>
  );
}

/**
 * La pantorrilla con la media puesta: el vuelto arriba, el gemelo marcado y
 * el tobillo fino.
 */
export function Pantorrilla({ media, vuelto }: { media: string; vuelto: string }) {
  return (
    <g strokeLinejoin="round">
      <path
        d="M-6.6 0 C-8.8 8 -8.4 18 -5.4 28 L4.6 28 C6.6 18 6.8 8 5.6 0 Z"
        fill={media}
        stroke={TINTA}
        strokeWidth="1.5"
      />
      <path d="M1.6 0.8 C4 9 4 19 2.6 27.6 L4.6 28 C6.6 18 6.8 8 5.6 0 Z" fill="#000" opacity="0.18" />
      <path d="M-5.6 2 C-7.6 9 -7.4 18 -5 26" fill="none" stroke="#fff" strokeWidth="1.8" opacity="0.22" />
      {/* El vuelto de la media. */}
      <path d="M-6.8 0 C-3 2.2 2 2.2 5.8 0 L5.2 5.4 C1.6 7.4 -3 7.4 -6.2 5.4 Z" fill={vuelto} stroke={TINTA} strokeWidth="1.2" />
    </g>
  );
}

/** La bota, con su suela, sus cordones y el brillo del empeine. */
export function Bota({ at, angle, flip = 1 }: { at: P; angle: number; flip?: 1 | -1 }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]}) rotate(${angle - 90}) scale(${flip} 1)`} strokeLinejoin="round">
      <path
        d="M-5.8 -4.2 C-7.6 1 -6.8 5.6 -3 8 L8.4 8.4 C12.4 7.4 12.8 4 10 1.6 L4.6 -4 Z"
        fill="#15161c"
        stroke={TINTA}
        strokeWidth="1.4"
      />
      <path d="M-3.4 8 L8.6 8.4 C11.6 7.8 12.4 6 11.2 4.6 L-4.6 4 Z" fill="#eef1f5" stroke={TINTA} strokeWidth="1.1" />
      <path d="M-2.4 0.6 L3.6 2.6 M-1.4 -1.8 L4.4 0.2" stroke="#f8fafc" strokeWidth="1.1" strokeLinecap="round" opacity="0.9" />
      <path d="M-5 -3.2 C-6.6 0.8 -6.2 4 -4 6" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.3" />
    </g>
  );
}

/* ------------------------------------------------------------------ brazos */

/** El brazo de arriba, con la manga corta de la camiseta y su vivo. */
export function BrazoAlto({
  piel,
  manga,
  vivo,
  desnudo,
}: {
  piel: string;
  manga: string;
  vivo: string;
  /** Arremangado hasta el hombro, como Hyuga. */
  desnudo?: boolean;
}) {
  return (
    <g strokeLinejoin="round">
      <path d="M-5.2 0 C-6.6 8 -6.2 16 -4.2 23 L4 23 C5.6 16 5.8 8 4.8 0 Z" fill={piel} stroke={TINTA} strokeWidth="1.5" />
      <path d="M1.4 1 C3.4 9 3.4 17 2.2 22.6 L4 23 C5.6 16 5.8 8 4.8 0 Z" fill="#000" opacity="0.17" />
      <path d="M-4.4 2 C-5.8 9 -5.6 16 -3.8 21" fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.2" />
      {!desnudo && (
        <>
          <path
            d="M-6.8 -1.6 C-8 5 -7.6 9.6 -6 12.4 C-1 14.6 3.6 14.6 7 12.4 C8 9.6 8 5 7 -1.6 Z"
            fill={manga}
            stroke={TINTA}
            strokeWidth="1.5"
          />
          <path d="M2.6 -1 C4 5 4 9.6 3.2 13.4 L6.4 12.6 C8 9.6 8 5 7 -1.6 Z" fill="#000" opacity="0.16" />
          <path d="M-6 12.4 C-1 14.6 3.6 14.6 7 12.4 L6.6 15.4 C3 17.4 -1.4 17.4 -5.6 15.4 Z" fill={vivo} stroke={TINTA} strokeWidth="1.1" />
        </>
      )}
    </g>
  );
}

/** El antebrazo, más fino y con el filo de luz por fuera. */
export function Antebrazo({ piel }: { piel: string }) {
  return (
    <g strokeLinejoin="round">
      <path d="M-4.4 0 C-5.6 7 -5.2 14 -3.6 20 L3.4 20 C4.8 14 5 7 4 0 Z" fill={piel} stroke={TINTA} strokeWidth="1.4" />
      <path d="M1.2 0.8 C2.8 8 2.8 14 1.8 19.6 L3.4 20 C4.8 14 5 7 4 0 Z" fill="#000" opacity="0.16" />
      <path d="M-3.8 2 C-4.8 8 -4.6 14 -3.2 18.4" fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.2" />
    </g>
  );
}

/** La mano cerrada, con el pulgar por delante. */
export function Mano({
  at,
  angle,
  piel,
  guante,
  tamano = 1,
}: {
  at: P;
  angle: number;
  piel: string;
  guante?: string;
  /** Los guantes de portero se pintan más grandes: son lo que para. */
  tamano?: number;
}) {
  const color = guante ?? piel;

  return (
    <g transform={`translate(${at[0]} ${at[1]}) rotate(${angle - 90}) scale(${tamano})`} strokeLinejoin="round">
      <path
        d={
          guante
            ? 'M-6 -4.6 C-8 0 -7.6 5 -4.4 7.6 C0 9.4 4 9 6.6 6.4 C8.4 2.4 8 -2 5.8 -4.6 Z'
            : 'M-4.6 -3.6 C-6.2 0 -5.8 4 -3.4 6 C0 7.4 3.2 7 5.2 4.8 C6.4 1.6 6 -1.6 4.4 -3.6 Z'
        }
        fill={color}
        stroke={TINTA}
        strokeWidth="1.4"
      />
      <path
        d={guante ? 'M5.4 -2 C8.6 0 8 4.4 5 6' : 'M4.2 -1.6 C6.6 0 6.2 3.4 3.8 4.6'}
        fill={color}
        stroke={TINTA}
        strokeWidth="1.2"
      />
      {guante ? (
        <path d="M-5 -3.4 C-1 -5.2 3 -5 5.2 -3.2" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <path d="M-3.4 1.2 C-0.6 2 2 1.8 4 1" fill="none" stroke={TINTA} strokeWidth="0.9" opacity="0.5" />
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ tronco */

/**
 * El tronco con la camiseta: hombros anchos, cintura estrecha, cuello de
 * pico, la sombra del costado y el bajo marcado.
 */
export function Tronco({
  camiseta,
  vivo,
  dorsal,
  numero,
  franjas,
}: {
  camiseta: string;
  vivo: string;
  dorsal: string;
  numero: string;
  /** Las rayas de los hombros de Benji. */
  franjas?: string;
}) {
  return (
    <g strokeLinejoin="round">
      <path
        d="M-17.5 -48 C-13 -52.5 13 -52.5 17.5 -48 L13.5 -3 C6 1.5 -6 1.5 -13.5 -3 Z"
        fill={camiseta}
        stroke={TINTA}
        strokeWidth="1.8"
      />
      {/* El costado en sombra y el filo de luz del otro lado. */}
      <path d="M7 -50.5 C13 -52 16 -50 17.5 -48 L13.5 -3 C11 -1.6 8 -0.6 5 0 Z" fill="#000" opacity="0.18" />
      <path d="M-15.5 -47 C-13.5 -49.5 -11 -50.5 -9 -51 L-11 -2 C-12.5 -2.4 -13 -2.6 -13.5 -3 Z" fill="#fff" opacity="0.15" />
      {/* El bajo de la camiseta. */}
      <path d="M-13.5 -3 C-6 1.5 6 1.5 13.5 -3" fill="none" stroke={TINTA} strokeWidth="1.4" opacity="0.5" />
      {franjas && (
        <path
          d="M-16.5 -44 C-10 -47 10 -47 16.5 -44 L15.8 -39.5 C9.5 -42.5 -9.5 -42.5 -15.8 -39.5 Z"
          fill={franjas}
          stroke={TINTA}
          strokeWidth="1"
        />
      )}
      {/* El cuello de pico. */}
      <path d="M-7 -49.5 L0 -40 L7 -49.5" fill="none" stroke={TINTA} strokeWidth="4.6" strokeLinejoin="round" />
      <path d="M-7 -49.5 L0 -40 L7 -49.5" fill="none" stroke={vivo} strokeWidth="2.6" strokeLinejoin="round" />
      <text
        x="0"
        y="-20"
        textAnchor="middle"
        fontSize="19"
        fontWeight="900"
        fill={numero}
        stroke={TINTA}
        strokeWidth="0.9"
      >
        {dorsal}
      </text>
    </g>
  );
}

/** La calzona: dos perneras con vuelo, su sombra y el ribete del bajo. */
export function Calzona({ tela, ribete }: { tela: string; ribete?: string }) {
  return (
    <g strokeLinejoin="round">
      <path
        d="M-13.5 -4 C-6 0.5 6 0.5 13.5 -4 L16 18 C10 22 4 21 1.6 16.5 L0 10 L-1.6 16.5 C-4 21 -10 22 -16 18 Z"
        fill={tela}
        stroke={TINTA}
        strokeWidth="1.8"
      />
      <path d="M6 -1 C10 -1.6 12 -2.6 13.5 -4 L16 18 C13 20 10 20.5 7.6 20 Z" fill="#000" opacity="0.2" />
      <path d="M-12 -2.6 C-11 -2.2 -10 -1.8 -9 -1.6 L-11.5 19 C-13 18.8 -14.5 18.4 -16 18 Z" fill="#fff" opacity="0.12" />
      {ribete && (
        <>
          <path d="M-16 18 C-10 22 -4 21 -1.6 16.5 L-2.4 13.6 C-5 17.6 -10.5 18.4 -15.4 15 Z" fill={ribete} opacity="0.9" />
          <path d="M16 18 C10 22 4 21 1.6 16.5 L2.4 13.6 C5 17.6 10.5 18.4 15.4 15 Z" fill={ribete} opacity="0.9" />
        </>
      )}
    </g>
  );
}

/** El cuello, con la sombra que echa la cabeza encima. */
export function Cuello({ piel }: { piel: string }) {
  return (
    <g strokeLinejoin="round">
      <path d="M-5.4 0 C-5.8 -5 -5.6 -8.5 -5 -11 L5 -11 C5.6 -8.5 5.8 -5 5.4 0 Z" fill={piel} stroke={TINTA} strokeWidth="1.4" />
      <path d="M-5.2 -6 C-2 -3.6 2 -3.6 5.2 -6 L5.4 0 L-5.4 0 Z" fill="#000" opacity="0.28" />
    </g>
  );
}

export { rumbo, largo, Pieza };
