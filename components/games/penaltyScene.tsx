'use client';

import {
  ALTO_SOBRE_ANCHO,
  PENALTY_SHOTS,
  SHOT_TYPES,
  zoneOf,
  type Diana,
  type PenaltyAim,
  type PenaltyOutcome,
  type PenaltyShot,
  type PenaltyZoneId,
} from '@/lib/penalties';
import { Vineta, tiradorDe, type PoseBenjiId, type TiradorId } from '@/components/games/PenaltyArt';
import type { ShotKind } from '@/types';

/* =========================================================================
 *  El campo de la tanda: la geometría y los rótulos.
 *
 *  Vive aparte de `PenaltyShootout` porque son dos cosas distintas: aquí está
 *  **dónde cae cada cosa dentro del cuadro** —la boca de la portería, el
 *  punto de penalti, adónde se tira Benji, por dónde va el balón— y allí está
 *  el juego. Separarlo deja el juego legible y permite tocar el encuadre sin
 *  entrar en las reglas.
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

/** Benji de pie: centrado en la boca y con los pies en la línea. */
export const BENJI_ANCHO = 25;
export const BENJI_DE_PIE = { x: 50, y: 36.4 };

/** Cómo se coloca Benji al tirarse a una zona: dónde, con qué pose y girado. */
export function estirada(id: PenaltyZoneId): {
  x: number;
  y: number;
  pose: PoseBenjiId;
  transform: string;
  /** -1 para volar a la izquierda: el dibujo va hacia la derecha y se espeja. */
  flip: 1 | -1;
} {
  const zone = zoneOf(id);

  if (zone.side === 'centro') {
    return zone.height === 'arriba'
      ? { ...BENJI_DE_PIE, y: BENJI_DE_PIE.y - 1.5, pose: 'salto', transform: 'translate(-50%, -50%)', flip: 1 }
      : { ...BENJI_DE_PIE, pose: 'agachado', transform: 'translate(-50%, -50%)', flip: 1 };
  }

  // A medio camino entre donde estaba y la esquina: es donde queda el
  // cuerpo de un portero que estira los brazos hasta ella.
  const at = enEscena({ x: 50 + (zone.x - 50) * 0.56, y: 68 + (zone.y - 68) * 0.62 });
  const flip: 1 | -1 = zone.side === 'izquierda' ? -1 : 1;
  const tilt = (zone.height === 'arriba' ? -16 : 14) * flip;

  // El espejo va aparte, en el dibujo, y no en este `transform`: la caja se
  // mueve con transición, y un `scaleX` que pasa de 1 a -1 a medio camino
  // vale cero, así que Benji se quedaba en una raya durante el vuelo.
  return {
    x: at.x,
    y: at.y + (zone.height === 'arriba' ? 3 : 0),
    pose: 'estirada',
    transform: `translate(-50%, -50%) rotate(${tilt}deg)`,
    flip,
  };
}

/**
 * Por dónde va el balón: una lista de puntos, del punto de penalti adonde
 * llega y —si no es gol— adonde rebota. Cada tiro tiene su camino: el Halcón
 * sube y cae en picado, el efecto se abre por fuera y se cierra, el cañón
 * hace eses, la parábola se va al cielo y el Tigre y el Fuego van en línea
 * recta. `arrive` es el punto en el que llega a la portería.
 */
export function trayecto(shot: PenaltyShot, kind: ShotKind): { points: { x: number; y: number; s: number }[]; arrive: number } {
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
  if (shot.outcome === 'parada') points.push({ x: end.x + out * 12, y: 64, s: 0.55 });
  if (shot.outcome === 'poste') points.push({ x: end.x + out * 14, y: end.y + 22, s: 0.5 });
  if (shot.outcome === 'gol') points.push({ x: end.x, y: end.y + 2, s: 0.36 });

  return { points, arrive };
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

/** Tres letras para el marcador, sin tildes: LEO, HUG, OLI, BEN. */
export function siglas(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase();
}

/** El color de equipo del que tira, legible sobre el azul noche. */
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
 * y por debajo de los jugadores.
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
 * Las dianas, pintadas
 *
 * Un aro por diana, del tamaño con el que de verdad se resuelven: una diana
 * que se ve más grande de lo que es sería una trampa, y una que se ve más
 * pequeña, un castigo. Por eso el alto sale del mismo número con el que las
 * reglas miden la portería.
 * ------------------------------------------------------------------------- */

export function Dianas({ dianas, hit }: { dianas: Diana[]; hit: Diana | null }) {
  return (
    <>
      {dianas.map((diana) => {
        const at = enEscena(diana);
        const tocada = hit === diana;
        const color = diana.dorada ? '#fbbf24' : '#f472b6';
        return (
          <div
            key={`${diana.x}-${diana.y}`}
            aria-hidden
            className={`pointer-events-none absolute z-[15] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed
                        ${tocada ? 'animate-pop' : 'animate-latido'}`}
            style={{
              left: `${at.x}%`,
              top: `${at.y}%`,
              width: `${(diana.r * 2 * BOCA.width) / 100}%`,
              height: `${((diana.r * 2) / ALTO_SOBRE_ANCHO / 100) * BOCA.height}%`,
              borderColor: color,
              backgroundColor: tocada ? color : `${color}26`,
              boxShadow: `0 0 10px ${color}99`,
            }}
          >
            <span
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[clamp(9px,2.4vw,13px)] font-black leading-none"
              style={{ color: tocada ? TINTA : color, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
            >
              {diana.dorada ? '★' : '✦'}
            </span>
          </div>
        );
      })}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * El marcador de la tele
 *
 * Los dos escudos, la tanda en círculos y —lo que manda ahora— **los puntos**
 * en el centro, con el récord debajo. El número grande es el que se quiere
 * subir, así que es el que ocupa el sitio del resultado.
 * ------------------------------------------------------------------------- */

export function Marcador({
  who,
  shooterName,
  scored,
  taken,
  shooting,
  history,
  firstShown,
  points,
  record,
  golden,
}: {
  who: TiradorId;
  shooterName: string;
  scored: number;
  taken: number;
  /** El penalti que se está tirando. */
  shooting: number;
  history: PenaltyOutcome[];
  /** Cuántos había tirados al abrir: de ésos no se sabe cómo acabaron. */
  firstShown: number;
  points: number;
  /** El mejor de este aparato, para saber cuánto falta. */
  record: number;
  golden: boolean;
}) {
  const saved = taken - scored;
  const color = colorDe(who);
  const batido = points > record && points > 0;

  /** Cómo quedó el tiro `i`, si se sabe: `true` gol, `false` no, `null` tirado sin saber. */
  const outcomeAt = (i: number): boolean | null | undefined => {
    if (i >= taken) return undefined;
    const known = i >= firstShown ? history[i - firstShown] : undefined;
    return known ? known === 'gol' : null;
  };

  const fila = (side: 'tira' | 'para') => (
    <span className="flex gap-1" aria-hidden>
      {Array.from({ length: PENALTY_SHOTS }, (_, i) => {
        const goal = outcomeAt(i);
        const current = i === taken;
        // Para Benji, lo bueno es lo que para: la misma tanda, al revés.
        const good = goal === undefined || goal === null ? goal : side === 'tira' ? goal : !goal;
        return (
          <span
            key={i}
            className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black leading-none sm:h-[1.15rem] sm:w-[1.15rem]
              ${
                good === true
                  ? 'bg-emerald-400 text-emerald-950'
                  : good === false
                    ? 'bg-rose-500 text-white'
                    : good === null
                      ? 'bg-white/45'
                      : current && side === 'tira'
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
      aria-label={`${shooterName} ${scored} goles, Benji ${saved} paradas, ${points} puntos. Penalti ${shooting} de ${PENALTY_SHOTS}.`}
    >
      <div className="flex items-stretch">
        {/* La mosca de la cadena: en directo y qué se juega. */}
        <div className="hidden flex-col justify-center gap-0.5 border-r border-white/10 px-3 sm:flex">
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.16em] text-rose-400">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
            En directo
          </span>
          <span className={`text-[10px] font-black uppercase tracking-[0.12em] ${golden ? 'text-amber-300' : 'text-white/70'}`}>
            {golden ? 'Tiro de oro' : 'Tanda de penaltis'}
          </span>
        </div>

        {/* Dos filas con las mismas tres columnas: arriba los equipos y los
            puntos; debajo, la tanda de cada uno bajo su escudo. En una sola
            fila los círculos no caben en un móvil. */}
        <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1 px-2 py-1.5">
          {/* El que tira. */}
          <div className="flex min-w-0 items-center justify-end gap-2">
            <p className="truncate text-[15px] font-black leading-none tracking-wide">{siglas(shooterName)}</p>
            <span
              className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-2"
              style={{ '--tw-ring-color': color } as React.CSSProperties}
            >
              <Vineta who={who} rayas={false} className="h-full w-full" />
            </span>
          </div>

          {/* Los puntos, que son el número que se quiere subir. */}
          <div className="flex flex-col items-center">
            <span
              className={`flex items-baseline gap-1 rounded-md px-2 py-0.5 tabular-nums shadow-inner
                ${batido ? 'animate-latido bg-amber-300 text-[#241a14]' : 'bg-white text-[#0b1220]'}`}
            >
              <span className="text-2xl font-black leading-tight">{points}</span>
              <span className="text-[9px] font-black uppercase tracking-[0.1em] opacity-70">pts</span>
            </span>
            <span className={`mt-px text-[9px] font-black uppercase tracking-[0.1em] ${batido ? 'text-amber-300' : 'text-white/50'}`}>
              {batido ? '¡récord!' : record > 0 ? `récord ${record}` : 'sin récord'}
            </span>
          </div>

          {/* Benji, con sus paradas. */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-2 ring-amber-400">
              <Vineta who="benji" rayas={false} className="h-full w-full" />
            </span>
            <p className="truncate text-[15px] font-black leading-none tracking-wide">BEN</p>
          </div>

          <div className="flex justify-end">{fila('tira')}</div>
          <span className={`whitespace-nowrap text-center text-[9px] font-black uppercase tracking-[0.14em] ${golden ? 'animate-pulse text-amber-300' : 'text-amber-300'}`}>
            {golden ? '★ Tiro de oro' : `Penalti ${shooting}/${PENALTY_SHOTS}`}
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
 * Un cartel a pantalla entera, medio segundo, diciendo qué penalti toca. No
 * recibe toques, así que se puede apuntar por debajo mientras entra.
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

/** Lo que dura el vuelo de un tiro, por si hace falta fuera de la escena. */
export function vueloDe(kind: ShotKind): number {
  return SHOT_TYPES[kind].flight;
}
