'use client';

import {
  PENALTY_SHOTS,
  SHOT_TYPES,
  zoneOf,
  type PenaltyAim,
  type PenaltyOutcome,
  type PenaltyShot,
  type PenaltyZoneId,
  type SaveOutcome,
} from '@/lib/penalties';
import { Vineta, tiradorDe, type PoseBenjiId, type TiradorId } from '@/components/games/PenaltyArt';
import type { ShotKind } from '@/types';

/* =========================================================================
 *  Lo que comparten las dos mitades de la tanda.
 *
 *  Desde que el penalti es **un duelo** hay dos escenas —la de tirar y la de
 *  parar— y las dos pasan en el mismo campo, con la misma portería medida en
 *  los mismos tanto por ciento y con el mismo marcador arriba. Todo eso vive
 *  aquí para que las dos pantallas no se vayan separando cada vez que se
 *  toca una: si la boca de la portería se mueve un punto, se mueve en las
 *  dos a la vez.
 * ========================================================================= */

/** La tinta de la serie, y el azul noche de la tele. */
export const TINTA = '#241a14';
export const NOCHE = '#0b1220';

/** Dónde está el punto de penalti dentro de la escena, en tanto por ciento. */
export const PUNTO = { x: 40, y: 87.6 };

/**
 * Dónde vive la boca de la portería dentro de la escena, en tanto por ciento.
 * Casa con el `MOUTH` del lienzo de `Estadio` (52, 51, 296, 105 en 400×300):
 * todo lo que pasa dentro se mide en tanto por ciento de esta caja, que es
 * el mismo sistema con el que piensan las reglas de `lib/penalties.ts`.
 */
export const BOCA = { left: 13, top: 17, width: 74, height: 35 };

/** Un punto de la portería, llevado a coordenadas de la escena. */
export function enEscena(point: PenaltyAim): { x: number; y: number } {
  return {
    x: BOCA.left + (point.x / 100) * BOCA.width,
    y: BOCA.top + (point.y / 100) * BOCA.height,
  };
}

/** Y al revés: un punto de la escena llevado a la portería. */
export function enPorteria(x: number, y: number): PenaltyAim {
  return {
    x: Math.max(3, Math.min(97, ((x - BOCA.left) / BOCA.width) * 100)),
    y: Math.max(3, Math.min(97, ((y - BOCA.top) / BOCA.height) * 100)),
  };
}

/** El portero de pie: centrado en la boca y con los pies en la línea. */
export const PORTERO_ANCHO = 25;
export const PORTERO_DE_PIE = { x: 50, y: 36.4 };

/** Cómo se coloca un portero al tirarse a un punto: dónde, qué pose y girado. */
export function estirada(target: PenaltyAim): {
  x: number;
  y: number;
  pose: PoseBenjiId;
  transform: string;
  /** -1 para volar a la izquierda: el dibujo va hacia la derecha y se espeja. */
  flip: 1 | -1;
} {
  const centro = Math.abs(target.x - 50) < 18;
  const arriba = target.y < 50;

  if (centro) {
    return arriba
      ? { ...PORTERO_DE_PIE, y: PORTERO_DE_PIE.y - 1.5, pose: 'salto', transform: 'translate(-50%, -50%)', flip: 1 }
      : { ...PORTERO_DE_PIE, pose: 'agachado', transform: 'translate(-50%, -50%)', flip: 1 };
  }

  // A medio camino entre donde estaba y la esquina: es donde queda el
  // cuerpo de un portero que estira los brazos hasta ella.
  const at = enEscena({ x: 50 + (target.x - 50) * 0.56, y: 68 + (target.y - 68) * 0.62 });
  const flip: 1 | -1 = target.x < 50 ? -1 : 1;
  const tilt = (arriba ? -16 : 14) * flip;

  // El espejo va aparte, en el dibujo, y no en este `transform`: la caja se
  // mueve con transición, y un `scaleX` que pasa de 1 a -1 a medio camino
  // vale cero, así que el portero se quedaba en una raya durante el vuelo.
  return {
    x: at.x,
    y: at.y + (arriba ? 3 : 0),
    pose: 'estirada',
    transform: `translate(-50%, -50%) rotate(${tilt}deg)`,
    flip,
  };
}

/** Lo mismo, dicho con una de las seis zonas. */
export function estiradaEn(id: PenaltyZoneId) {
  const zone = zoneOf(id);
  return estirada({ x: zone.side === 'centro' ? 50 : zone.x, y: zone.y });
}

/**
 * Por dónde va el balón: una lista de puntos, del punto de penalti adonde
 * llega y —si no es gol— adonde rebota. Cada tiro tiene su camino: el Halcón
 * sube y cae en picado, el efecto se abre por fuera y se cierra, el cañón
 * hace eses, la parábola se va al cielo y el Tigre y el Fuego van en línea
 * recta. `arrive` es el punto en el que llega a la portería.
 */
export function trayecto(
  shot: { outcome: PenaltyOutcome | SaveOutcome; landing: PenaltyAim },
  kind: ShotKind,
): { points: { x: number; y: number; s: number }[]; arrive: number } {
  const to = enEscena(shot.landing);
  const end = { x: Math.max(-6, Math.min(106, to.x)), y: Math.max(-6, to.y) };
  const mid = { x: (PUNTO.x + end.x) / 2, y: Math.min(PUNTO.y, end.y) + (PUNTO.y - end.y) * 0.35 - 8 };
  const out = end.x < 50 ? -1 : 1;

  let points: { x: number; y: number; s: number }[];
  switch (kind) {
    case 'halcon':
      points = [
        { ...PUNTO, s: 1 },
        { x: mid.x, y: Math.max(-4, end.y - 22), s: 0.7 },
        { x: end.x - out * 2, y: Math.max(-6, end.y - 16), s: 0.52 },
        { ...end, s: 0.42 },
      ];
      break;
    case 'efecto':
      points = [
        { ...PUNTO, s: 1 },
        { x: mid.x + out * 16, y: mid.y + 4, s: 0.72 },
        { x: end.x + out * 14, y: end.y + 6, s: 0.52 },
        { ...end, s: 0.42 },
      ];
      break;
    case 'canon':
      points = [
        { ...PUNTO, s: 1 },
        { x: PUNTO.x + (end.x - PUNTO.x) * 0.3 + 5, y: PUNTO.y + (end.y - PUNTO.y) * 0.3, s: 0.8 },
        { x: PUNTO.x + (end.x - PUNTO.x) * 0.55 - 5, y: PUNTO.y + (end.y - PUNTO.y) * 0.55, s: 0.64 },
        { x: PUNTO.x + (end.x - PUNTO.x) * 0.8 + 4, y: PUNTO.y + (end.y - PUNTO.y) * 0.8, s: 0.5 },
        { ...end, s: 0.42 },
      ];
      break;
    case 'catapulta':
      // Primero al cielo, fuera del cuadro, y luego en picado a la portería.
      points = [
        { ...PUNTO, s: 1 },
        { x: PUNTO.x - 4, y: -14, s: 0.8 },
        { x: end.x, y: Math.max(-10, end.y - 30), s: 0.55 },
        { ...end, s: 0.42 },
      ];
      break;
    case 'parabola':
      points = [
        { ...PUNTO, s: 1 },
        { x: mid.x, y: 2, s: 0.6 },
        { ...end, s: 0.42 },
      ];
      break;
    case 'tigre':
    case 'fuego':
      points = [
        { ...PUNTO, s: 1 },
        { ...end, s: 0.44 },
      ];
      break;
    default:
      points = [
        { ...PUNTO, s: 1 },
        { ...mid, s: 0.72 },
        { ...end, s: 0.42 },
      ];
  }

  const arrive = points.length - 1;
  const parada = shot.outcome === 'parada';
  if (parada) points.push({ x: end.x + out * 12, y: 64, s: 0.55 });
  if (shot.outcome === 'poste') points.push({ x: end.x + out * 14, y: end.y + 22, s: 0.5 });
  if (shot.outcome === 'gol' || shot.outcome === 'encajado') points.push({ x: end.x, y: end.y + 2, s: 0.36 });

  return { points, arrive };
}

/** El vuelo que le corresponde a un tiro, para saber cuánto dura la jugada. */
export function vueloDe(kind: ShotKind): number {
  return SHOT_TYPES[kind].flight;
}

/** Tres letras para el marcador, sin tildes: LEO, HUG, OLI, BEN. */
export function siglas(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase();
}

/** El color de equipo de uno, legible sobre el azul noche. */
export function colorDe(who: TiradorId): string {
  const kit = tiradorDe(who).kit;
  // Una camiseta blanca no se ve como franja: se usa su vivo.
  return kit === '#f8fafc' ? (tiradorDe(who).trim ?? '#1d4ed8') : kit;
}

/**
 * Los destellos de los flashes en la grada: sitios fijos, que un reparto al
 * azar en cada pintada haría bailar la grada entera.
 */
const FLASHES = [
  [8, 8, 0], [17, 12, 1.3], [26, 7, 0.4], [34, 13, 2.1], [43, 9, 0.9], [52, 12, 1.7], [61, 8, 0.2],
  [69, 13, 1.1], [77, 9, 2.4], [86, 12, 0.6], [93, 8, 1.9], [12, 15, 2.8], [58, 15, 3.1], [81, 15, 0.3],
] as const;

/**
 * La noche del partido: los focos de las torres, los flashes de la grada, la
 * luz sobre el césped y el viñeteado de la cámara. Va por encima del estadio
 * y por debajo de los jugadores, y es igual se tire o se pare.
 */
export function Noche() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* El estadio ya está pintado de noche, así que aquí sólo se asienta
          un poco el cielo: con el velo de antes se volvía todo gris. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,12,34,0.35)_0%,rgba(6,12,34,0.12)_14%,transparent_28%)]" />
      <div className="absolute inset-0 mix-blend-screen bg-[radial-gradient(circle_at_5%_4%,rgba(255,250,214,0.95)_0,rgba(255,240,180,0.35)_5%,transparent_20%),radial-gradient(circle_at_95%_4%,rgba(255,250,214,0.95)_0,rgba(255,240,180,0.35)_5%,transparent_20%)]" />
      <div className="absolute inset-0 opacity-40 mix-blend-screen bg-[linear-gradient(115deg,transparent_20%,rgba(255,250,220,0.18)_32%,transparent_44%),linear-gradient(245deg,transparent_20%,rgba(255,250,220,0.18)_32%,transparent_44%)]" />
      {FLASHES.map(([x, y, delay]) => (
        <span
          key={`${x}-${y}`}
          className="absolute h-[1.2%] w-[0.9%] animate-titila rounded-full bg-white blur-[1px]"
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay}s` }}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 h-[55%] mix-blend-soft-light bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.14)_0_8%,transparent_8%_16%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_55%,transparent_55%,rgba(0,0,0,0.42)_100%)]" />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * El marcador del duelo
 *
 * Ahora cuenta dos cosas y no una: arriba el que tira con sus goles, abajo
 * el equipo de Benji con los suyos, y en medio el resultado. Debajo de cada
 * escudo, su tanda en círculos —verde lo que suma para ése, rojo lo que no—,
 * que es como se sigue una tanda en la tele. Y una flecha en el que tiene la
 * bola, que es lo que hace entender de un vistazo de quién es el turno.
 * ------------------------------------------------------------------------- */

/** Cómo acabó una ronda: lo que tiró él y lo que le tiraron. */
export interface Ronda {
  tiro?: PenaltyOutcome;
  parada?: SaveOutcome;
}

export function Marcador({
  who,
  shooterName,
  scored,
  conceded,
  round,
  sudden,
  turn,
  history,
  firstShown,
  total = PENALTY_SHOTS,
}: {
  who: TiradorId;
  shooterName: string;
  scored: number;
  conceded: number;
  round: number;
  sudden: boolean;
  /** Qué toca: con la bola, o con los guantes. */
  turn: 'tiras' | 'paras';
  /** Ronda a ronda, lo que se sabe de esta sesión. */
  history: Ronda[];
  /** Cuántas rondas había jugadas al abrir: de ésas no se sabe el detalle. */
  firstShown: number;
  total?: number;
}) {
  const color = colorDe(who);
  const jugadas = Math.max(total, history.length + firstShown, round);
  // En una muerte súbita larga los círculos no caben: se enseñan los últimos
  // siete, que es de donde se está jugando la tanda.
  const desde = Math.max(0, jugadas - 7);
  const casillas = jugadas - desde;

  const fila = (side: 'tira' | 'para') => (
    <span className="flex gap-1" aria-hidden>
      {Array.from({ length: casillas }, (_, n) => {
        const i = desde + n;
        const known = i >= firstShown ? history[i - firstShown] : undefined;
        const value = side === 'tira' ? known?.tiro : known?.parada;
        // Para él, lo bueno es el gol; abajo, lo bueno es la parada.
        const good =
          value === undefined
            ? undefined
            : side === 'tira'
              ? value === 'gol'
              : value === 'parada' || value === 'fallado';
        const played = i < firstShown || value !== undefined;
        const current = i === round - 1 && ((side === 'tira') === (turn === 'tiras'));

        return (
          <span
            key={i}
            className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black leading-none sm:h-[1.15rem] sm:w-[1.15rem]
              ${
                good === true
                  ? 'bg-emerald-400 text-emerald-950'
                  : good === false
                    ? 'bg-rose-500 text-white'
                    : played
                      ? 'bg-white/45'
                      : current
                        ? 'animate-pulse ring-2 ring-amber-300 ring-inset'
                        : 'ring-1 ring-white/25 ring-inset'
              }`}
          >
            {good === true ? (side === 'tira' ? '✓' : '🧤') : good === false ? '✕' : ''}
          </span>
        );
      })}
    </span>
  );

  return (
    <div
      className="relative text-white"
      style={{ background: `linear-gradient(180deg, #16223a 0%, ${NOCHE} 100%)` }}
      aria-label={`${shooterName} ${scored}, Benji ${conceded}. Ronda ${round}${sudden ? ', muerte súbita' : ` de ${total}`}. Te toca ${turn === 'tiras' ? 'tirar' : 'parar'}.`}
    >
      <div className="flex items-stretch">
        {/* La mosca de la cadena: en directo y qué se juega. */}
        <div className="hidden flex-col justify-center gap-0.5 border-r border-white/10 px-3 sm:flex">
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.16em] text-rose-400">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
            En directo
          </span>
          <span className={`text-[10px] font-black uppercase tracking-[0.12em] ${sudden ? 'text-amber-300' : 'text-white/70'}`}>
            {sudden ? 'Muerte súbita' : 'Tanda de penaltis'}
          </span>
        </div>

        {/* Dos filas con las mismas tres columnas: arriba los equipos y el
            resultado; debajo, la tanda de cada uno bajo su escudo. En una sola
            fila los círculos no caben en un móvil. */}
        <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1 px-2 py-1.5">
          {/* Él. */}
          <div className="flex min-w-0 items-center justify-end gap-2">
            <p className="truncate text-[15px] font-black leading-none tracking-wide">{siglas(shooterName)}</p>
            <span
              className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-2 ${turn === 'tiras' ? 'ring-offset-1 ring-offset-[#16223a]' : ''}`}
              style={{ '--tw-ring-color': turn === 'tiras' ? '#fcd34d' : color } as React.CSSProperties}
            >
              <Vineta who={who} rayas={false} className="h-full w-full" />
              {turn === 'tiras' && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 bg-amber-300 text-center text-[8px] font-black leading-[1.35] text-[#241a14]">
                  ⚽
                </span>
              )}
            </span>
          </div>

          {/* El resultado. */}
          <div className="flex items-stretch overflow-hidden rounded-md shadow-inner">
            <span className="min-w-[2.1rem] bg-white px-1.5 py-0.5 text-center text-2xl font-black tabular-nums leading-tight text-[#0b1220]">
              {scored}
            </span>
            <span className="min-w-[2.1rem] bg-white/85 px-1.5 py-0.5 text-center text-2xl font-black tabular-nums leading-tight text-[#0b1220]">
              {conceded}
            </span>
          </div>

          {/* El equipo de Benji. */}
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-2 ${turn === 'paras' ? 'ring-amber-300 ring-offset-1 ring-offset-[#16223a]' : 'ring-amber-400'}`}
            >
              <Vineta who="benji" rayas={false} className="h-full w-full" />
              {turn === 'paras' && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 bg-amber-300 text-center text-[8px] font-black leading-[1.35] text-[#241a14]">
                  ⚽
                </span>
              )}
            </span>
            <p className="truncate text-[15px] font-black leading-none tracking-wide">BEN</p>
          </div>

          <div className="flex justify-end">{fila('tira')}</div>
          <span className={`whitespace-nowrap text-center text-[9px] font-black uppercase tracking-[0.14em] ${sudden ? 'animate-pulse text-rose-300' : 'text-amber-300'}`}>
            {sudden ? `Súbita ${round - total}` : `Ronda ${round}/${total}`}
          </span>
          <div className="flex">{fila('para')}</div>
        </div>
      </div>
      {/* El filo de color de los dos equipos. */}
      <div aria-hidden className="flex h-1">
        <span className="flex-1" style={{ backgroundColor: color }} />
        <span className="flex-1 bg-amber-400" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * El rótulo de turno
 *
 * Un cartel a pantalla entera, medio segundo, diciendo qué toca. Sin él, la
 * tanda cambia de manos sin avisar y uno se encuentra de portero sin saber
 * cuándo dejó de ser delantero.
 * ------------------------------------------------------------------------- */

export function Cartel({ titulo, pie, color }: { titulo: string; pie: string; color: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center">
      <div className="absolute inset-x-0 h-[38%] bg-[#0b1220]/85" />
      <div
        className="relative animate-rotulo overflow-hidden px-[7%] py-1 [clip-path:polygon(4%_0,100%_0,96%_100%,0_100%)]"
        style={{ background: `linear-gradient(90deg, ${color}, #0b1220 50%, ${color})` }}
      >
        <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-barrido bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        <p className="relative font-manga text-[clamp(30px,10vw,58px)] leading-none tracking-wide text-white [paint-order:stroke] [-webkit-text-stroke:6px_#241a14]">
          {titulo}
        </p>
      </div>
      <p className="relative mt-1 animate-floatUp bg-[#0b1220] px-3 py-1 text-[clamp(10px,2.8vw,13px)] font-black uppercase tracking-[0.14em] text-white [animation-delay:160ms]">
        {pie}
      </p>
    </div>
  );
}

/** El vuelo del balón, con la API del navegador. `slow` estira la repetición. */
export function volar(
  ball: HTMLElement,
  route: { points: { x: number; y: number; s: number }[]; arrive: number },
  duration: number,
  easing: string,
  slow = 1,
): Animation {
  const { points, arrive } = route;
  const last = points.length - 1;
  // Hasta la portería, repartido a partes iguales; si luego rebota o se
  // mete en la red, eso va en el último cuarto.
  const reach = last > arrive ? 0.78 : 1;

  return ball.animate(
    points.map((p, i) => ({
      left: `${p.x}%`,
      top: `${p.y}%`,
      transform: `translate(-50%, -50%) scale(${p.s}) rotate(${i * 330}deg)`,
      offset: i <= arrive ? (i / arrive) * reach : 1,
      easing: i === arrive && last > arrive ? 'ease-out' : 'linear',
    })),
    { duration: duration * slow, easing, fill: 'backwards' },
  );
}

/** El tipo que usan las dos escenas para contar un tiro ya resuelto. */
export type Disparo = { shot: PenaltyShot; kind: ShotKind };
