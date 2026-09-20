'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  Balon,
  Chutador,
  Estadio,
  Impacto,
  Portero,
  SERIE_ORDER,
  Vineta,
  tiradorDe,
  type TiradorId,
} from '@/components/games/PenaltyArt';
import {
  BOCA,
  Cartel,
  Marcador,
  NOCHE,
  Noche,
  PORTERO_ANCHO,
  PORTERO_DE_PIE,
  PUNTO,
  enEscena,
  estirada,
  trayecto,
  volar,
  type Ronda,
} from '@/components/games/penaltyScene';
import {
  PALOMITA_COSTE,
  PENALTY_ZONES,
  energyLeft,
  rivalKick,
  resolveSave,
  tellAt,
  zoneOf,
  type DuelState,
  type PenaltyAim,
  type PenaltyZoneId,
  type RivalKick,
  type SaveOutcome,
  type SaveShot,
  type SaveTiming,
} from '@/lib/penalties';
import { manga } from '@/components/games/mangaFont';
import { ROPA_FAMILIA, type Casero } from '@/lib/cromoArt';
import { playCue } from '@/lib/sound';
import type { DateKey, PenaltyResult, ProfileId } from '@/types';

/* =========================================================================
 *  La otra mitad de la tanda: **parar**.
 *
 *  Hasta ahora el crío sólo tiraba, y una tanda de sólo tirar no es una
 *  tanda: es una serie de tiros. Aquí se le da la vuelta a la escena —el
 *  rival en el punto, él bajo los palos— y se juega con la misma lección
 *  leída del revés.
 *
 *  Y la lección es **el momento**. El rival coge carrerilla y a mitad de
 *  camino *enseña el pie*: ahí, y sólo ahí, se sabe el palo. Tirarse antes
 *  no es adelantarse, es regalárselo —te ve caer y la pone al otro lado—; y
 *  tirarse después del golpeo es llegar con la punta de los dedos. La franja
 *  verde de la barra marca esos dos límites, así que no hay que adivinar
 *  nada: hay que aguantar, que es lo difícil.
 *
 *  Las seis zonas son botones grandes y no una mira que se arrastra, porque
 *  esto se juega **contra el reloj**: en segundo y medio nadie coloca un
 *  punto con el dedo, pero cualquiera da a media portería.
 * ========================================================================= */

interface PenaltySaveProps {
  profileId: ProfileId;
  /** Quién para: el crío, con su cara y su color. */
  kid: Casero;
  name: string;
  date: DateKey;
  /** El que tira por su equipo, sólo para el marcador. */
  shooter: TiradorId;
  shooterName: string;
  duel: DuelState;
  /** La tanda tal cual va, para la energía. */
  result: PenaltyResult | null;
  /** Qué tanda del día es: entra en la semilla, como en los tiros. */
  tanda: number;
  history: Ronda[];
  firstShown: number;
  /** Anota la parada en cuanto se sabe cómo acabó, y si gastó palomita. */
  onSaved: (outcome: SaveOutcome, palomita: boolean) => void;
  /** Y sigue la tanda cuando el crío lo pide. */
  onNext: () => void;
}

/**
 * En qué momento de la parada se está.
 *
 *  · `aviso`  — el cartel de «ahora paras tú» y el botón de empezar.
 *  · `carrera`— el rival viene y la barra corre: hay que tirarse.
 *  · `vuelo`  — el balón va de camino.
 *  · `visto`  — ya se sabe, y se explica por qué.
 */
type Paso = 'aviso' | 'carrera' | 'vuelo' | 'visto';

/** Lo que tarda el balón en llegar desde que le pegan. */
const VUELO_MS = 680;

/** Margen después del golpeo en el que tirarse todavía cuenta como a tiempo. */
const A_TIEMPO_MS = 180;

/** Y hasta cuándo se puede uno tirar, aunque ya sea tarde. */
const LIMITE_MS = 520;

/** Cuánto más despacio va la repetición. */
const CAMARA_LENTA = 2.6;

const TITULAR: Record<SaveOutcome, string> = {
  parada: '¡PARADÓN!',
  encajado: '¡GOL SUYO!',
  fallado: '¡FUERA!',
};

/** Cómo se dice el momento en que se tiró, para que se aprenda algo. */
const MOMENTO: Record<SaveTiming, { label: string; color: string }> = {
  pronto: { label: 'Te tiraste pronto', color: '#fb7185' },
  buena: { label: '¡Justo a tiempo!', color: '#34d399' },
  tarde: { label: 'Te tiraste tarde', color: '#fbbf24' },
  quieto: { label: 'Te quedaste quieto', color: '#94a3b8' },
};

export function PenaltySave({
  profileId,
  kid,
  name,
  date,
  shooter,
  shooterName,
  duel,
  result,
  tanda,
  history,
  firstShown,
  onSaved,
  onNext,
}: PenaltySaveProps) {
  const index = duel.round - 1;
  const [kick] = useState<RivalKick>(() => rivalKick(profileId, date, index, tanda));
  const rival = SERIE_ORDER[kick.rival % SERIE_ORDER.length];
  const rivalName = tiradorDe(rival).short ?? tiradorDe(rival).name ?? 'el rival';

  const [paso, setPaso] = useState<Paso>('aviso');

  /** La zona que está marcada, la que sale si se pulsa el botón de tirarse. */
  const [marked, setMarked] = useState<PenaltyZoneId>('bi');

  /** Adónde se ha tirado ya, y cuándo. */
  const [dive, setDive] = useState<{ zone: PenaltyZoneId; when: SaveTiming } | null>(null);

  /** Lo que va corriendo la carrerilla, en milisegundos. */
  const [clock, setClock] = useState(0);

  /** Cómo acabó. */
  const [shot, setShot] = useState<SaveShot | null>(null);
  const [replay, setReplay] = useState(0);

  /**
   * La palomita: el estirón de más, armado antes de la carrerilla. Se elige
   * como se elige un tiro especial —antes, sabiendo lo que cuesta— y se gasta
   * salga como salga, que es lo que la convierte en una decisión.
   */
  const energia = energyLeft(result);
  const [palomita, setPalomita] = useState(false);
  const puede = energia >= PALOMITA_COSTE;

  const started = useRef(0);
  const frame = useRef<number>();
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const aviso = tellAt(kick);
  const visible = clock >= aviso && paso === 'carrera';

  /* ------------------------------------------------------------ el reloj */

  useEffect(() => {
    if (paso !== 'carrera') return undefined;
    started.current = performance.now();

    const tick = (now: number) => {
      setClock(now - started.current);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [paso]);

  /* ---------------------------------------------------------- tirarse */

  /** El disparo ya está decidido: sólo se tira una vez. */
  const done = useRef(false);

  /** Cierra la jugada: resuelve, lo canta y lo anota. */
  const resolver = useCallback(
    (committed: { zone: PenaltyZoneId; when: SaveTiming } | null) => {
      const target: PenaltyAim | null = committed
        ? (() => {
            const zone = zoneOf(committed.zone);
            return { x: zone.x, y: zone.y };
          })()
        : null;
      const when: SaveTiming = committed?.when ?? 'quieto';
      const outcome = resolveSave(kick, target, when, palomita);

      setShot(outcome);
      setPaso('vuelo');
      playCue('tiro');

      later(() => {
        setPaso('visto');
        playCue(outcome.outcome === 'encajado' ? 'gol' : outcome.outcome === 'fallado' ? 'fuera' : 'parada');
        try {
          navigator.vibrate?.(outcome.outcome === 'parada' ? [40, 50, 90] : 70);
        } catch {
          // Hay navegadores que tienen la función y la prohíben: da igual.
        }
        // Se anota al resolverse, que es el primer momento en que se sabe:
        // una parada no existe hasta que el balón llega.
        onSaved(outcome.outcome, palomita);
      }, VUELO_MS);
    },
    // `later` sólo empuja a una lista: no cambia entre pintadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kick, onSaved, palomita],
  );

  /** El crío se tira a una zona. */
  const tirarse = useCallback(
    (zone: PenaltyZoneId) => {
      if (paso !== 'carrera' || done.current) return;
      const t = performance.now() - started.current;
      const when: SaveTiming = t < aviso ? 'pronto' : t <= kick.runUp + A_TIEMPO_MS ? 'buena' : 'tarde';
      const committed = { zone, when };
      setDive(committed);
      setMarked(zone);
      playCue('parada');

      // El golpeo llega cuando toca: tirarse antes no adelanta el penalti.
      const espera = Math.max(0, kick.runUp - t);
      done.current = true;
      later(() => resolver(committed), espera);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aviso, kick.runUp, paso, resolver],
  );

  // Si no se tira a tiempo, se queda plantado y el penalti sale igual.
  useEffect(() => {
    if (paso !== 'carrera') return undefined;
    const t = window.setTimeout(
      () => {
        if (done.current) return;
        done.current = true;
        resolver(null);
      },
      kick.runUp + LIMITE_MS,
    );
    return () => window.clearTimeout(t);
  }, [paso, kick.runUp, resolver]);

  /* --------------------------------------------------------- el teclado */

  const live = useRef({ paso, marked, tirarse });
  live.current = { paso, marked, tirarse };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (live.current.paso !== 'carrera') return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;

      const current = zoneOf(live.current.marked);
      const move = (side: typeof current.side, height: typeof current.height) => {
        const next = PENALTY_ZONES.find((z) => z.side === side && z.height === height);
        if (next) setMarked(next.id);
      };

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          move(current.side === 'derecha' ? 'centro' : 'izquierda', current.height);
          return;
        case 'ArrowRight':
          event.preventDefault();
          move(current.side === 'izquierda' ? 'centro' : 'derecha', current.height);
          return;
        case 'ArrowUp':
          event.preventDefault();
          move(current.side, 'arriba');
          return;
        case 'ArrowDown':
          event.preventDefault();
          move(current.side, 'abajo');
          return;
        case ' ':
        case 'Enter':
          event.preventDefault();
          if (!event.repeat) live.current.tirarse(live.current.marked);
          return;
        default:
          return;
      }
    };

    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  /* ---------------------------------------------------------------- pintura */

  const franja = {
    // La franja buena de la barra, en tanto por ciento del total.
    from: (aviso / (kick.runUp + LIMITE_MS)) * 100,
    to: ((kick.runUp + A_TIEMPO_MS) / (kick.runUp + LIMITE_MS)) * 100,
  };
  const avance = Math.min(100, (clock / (kick.runUp + LIMITE_MS)) * 100);

  return (
    <div className={`${manga.variable} mx-auto w-full max-w-2xl space-y-3`}>
      <div className="overflow-hidden rounded-2xl shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] ring-1 ring-black/40">
        <Marcador
          who={shooter}
          shooterName={shooterName}
          scored={duel.scored}
          conceded={duel.conceded + (paso === 'visto' && shot?.outcome === 'encajado' ? 1 : 0)}
          round={duel.round}
          sudden={duel.sudden}
          turn="paras"
          history={history}
          firstShown={firstShown}
        />

        <Escena
          kid={kid}
          name={name}
          rival={rival}
          kick={kick}
          paso={paso}
          marked={marked}
          dive={dive}
          shot={shot}
          visible={visible}
          replay={replay}
          onPick={tirarse}
          franja={franja}
          avance={avance}
          palomita={palomita}
        />

        {/* El narrador, en la cinta de abajo. */}
        <p
          className="flex min-h-[3.25rem] items-center gap-2.5 px-3 py-2 text-[13px] font-bold leading-snug text-white"
          style={{ backgroundColor: NOCHE }}
          aria-live="polite"
        >
          <span className="flex shrink-0 items-center gap-1 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-[#241a14]">
            <span aria-hidden>🧤</span>
            Paras
          </span>
          <span className="min-w-0 flex-1">
            {paso === 'visto' && shot ? (
              <>
                <span className="sr-only">{TITULAR[shot.outcome]} </span>
                {shot.why}
              </>
            ) : paso === 'vuelo' ? (
              <span className="italic">¡{rivalName} la golpea…!</span>
            ) : visible ? (
              kick.tell === 'centro' ? (
                <>
                  <span className="text-amber-300">¡Ya! Se planta y se la va a pegar por el centro.</span> Quédate.
                </>
              ) : (
                <>
                  <span className="text-amber-300">¡Ya! Enseña el pie a tu {kick.tell}</span> — ¡tírate ahí!
                </>
              )
            ) : paso === 'carrera' ? (
              <>
                {rivalName} coge carrerilla. <span className="font-semibold text-white/70">Aguanta: no te tires todavía.</span>
              </>
            ) : (
              <>
                Ahora te toca a ti bajo los palos.{' '}
                <span className="font-semibold text-white/70">Espera a que enseñe el pie y vuela a ese lado.</span>
              </>
            )}
          </span>
        </p>
      </div>

      {paso === 'aviso' && (
        <>
          <div className="rounded-2xl p-3 text-white" style={{ backgroundColor: NOCHE }}>
            <ol className="grid grid-cols-3 gap-2 text-center text-[11px] font-black leading-tight">
              {[
                ['⏳', 'Aguanta', 'mientras corre'],
                ['👟', 'Míralo', 'enseña el pie'],
                ['🧤', 'Vuela', 'a ese lado'],
              ].map(([icon, title, hint], i) => (
                <li key={title} className="rounded-xl bg-white/5 px-1 py-2">
                  <span aria-hidden className="block text-xl">
                    {icon}
                  </span>
                  <span className="mt-0.5 block text-[12px] uppercase tracking-wide">
                    {i + 1}. {title}
                  </span>
                  <span className="block text-[10px] font-semibold text-white/60">{hint}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2.5 text-[12px] leading-snug text-white/85">
              <span className="font-black text-amber-300">Ojo:</span> si te tiras antes de que enseñe el pie, te ve caer
              y la pone al otro lado. Y si te quedas quieto, sólo paras las del centro.
            </p>

            {/* La palomita: el especial del portero, con la misma energía que
                los tiros de la serie. Se ve siempre —para saber que está— y
                dice lo que cuesta y cuánta queda. */}
            <button
              type="button"
              disabled={!puede && !palomita}
              onClick={() => setPalomita((on) => !on)}
              aria-pressed={palomita}
              className={`mt-2.5 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors
                ${palomita ? 'bg-emerald-400 text-emerald-950' : puede ? 'bg-white/10 text-white' : 'bg-white/5 text-white/35'}`}
            >
              <span aria-hidden className="text-xl">
                🧤
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-black uppercase tracking-wide">
                  Palomita {palomita ? '· armada' : ''}
                </span>
                <span className={`block text-[10px] font-semibold ${palomita ? 'text-emerald-900' : 'text-white/60'}`}>
                  {puede || palomita
                    ? 'Un estirón imposible: llegas a lo que no se llega.'
                    : 'Te falta energía: se consigue metiendo goles.'}
                </span>
              </span>
              <span className={`shrink-0 text-[11px] font-black ${palomita ? 'text-emerald-900' : 'text-amber-300'}`}>
                {'⚡'.repeat(PALOMITA_COSTE)} <span className="tabular-nums">{Math.max(energia, 0)}</span>
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setPaso('carrera')}
            autoFocus
            className="flex min-h-[4rem] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-200
                       to-amber-400 px-4 font-manga text-3xl tracking-wide text-[#241a14] shadow-[0_5px_0_rgba(0,0,0,0.45)]
                       active:translate-y-[3px] active:shadow-[0_2px_0_rgba(0,0,0,0.45)]"
          >
            ¡Me pongo los guantes!
          </button>
        </>
      )}

      {paso === 'carrera' && (
        <>
          <button
            type="button"
            onClick={() => tirarse(marked)}
            disabled={Boolean(dive)}
            className={`relative flex min-h-[4rem] w-full touch-none select-none items-center justify-center gap-2 overflow-hidden
              rounded-2xl px-4 text-lg font-black uppercase tracking-wide shadow-[0_5px_0_rgba(0,0,0,0.45)]
              transition-colors active:translate-y-[3px] active:shadow-[0_2px_0_rgba(0,0,0,0.45)]
              ${
                dive
                  ? 'bg-gradient-to-b from-slate-500 to-slate-700 text-white'
                  : visible
                    ? 'animate-latido bg-gradient-to-b from-emerald-300 to-emerald-500 text-[#0b1f14]'
                    : 'bg-gradient-to-b from-slate-400 to-slate-600 text-white'
              }`}
          >
            <span className="relative">
              {dive ? `Volando ${zoneOf(dive.zone).label}…` : visible ? '🧤 ¡TÍRATE YA!' : 'Aguanta…'}
            </span>
          </button>
          <p className="text-center text-[11px] leading-snug t-3">
            <span className="md:hidden">Toca la mitad de la portería a la que quieres volar.</span>
            <span className="hidden md:inline">
              Elige zona con <Tecla>←</Tecla> <Tecla>→</Tecla> <Tecla>↑</Tecla> <Tecla>↓</Tecla> y vuela con{' '}
              <Tecla>Espacio</Tecla>.
            </span>
          </p>
        </>
      )}

      {paso === 'vuelo' && (
        <div
          aria-hidden
          className="flex min-h-[4rem] w-full items-center justify-center rounded-2xl border-2 border-dashed hairline text-sm font-bold t-3"
        >
          …
        </div>
      )}

      {paso === 'visto' && shot && (
        <div className="grid animate-floatUp grid-cols-[auto_1fr] gap-2">
          <button
            type="button"
            onClick={() => setReplay((n) => n + 1)}
            className="flex min-h-[4rem] items-center justify-center gap-1.5 rounded-2xl px-4 text-sm font-black uppercase
                       tracking-wide text-white shadow-[0_5px_0_rgba(0,0,0,0.45)] active:translate-y-[3px]
                       active:shadow-[0_2px_0_rgba(0,0,0,0.45)]"
            style={{ backgroundColor: NOCHE }}
            aria-label="Ver la repetición a cámara lenta"
          >
            <span aria-hidden className="text-lg">
              ⟲
            </span>
            <span className="hidden sm:inline">Repetición</span>
          </button>
          <button
            type="button"
            onClick={onNext}
            autoFocus
            className="flex min-h-[4rem] items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-200
                       to-amber-400 px-4 text-lg font-black uppercase tracking-wide text-[#241a14]
                       shadow-[0_5px_0_rgba(0,0,0,0.45)] active:translate-y-[3px] active:shadow-[0_2px_0_rgba(0,0,0,0.45)]"
          >
            Seguir ▶
          </button>
        </div>
      )}
    </div>
  );
}

function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-block min-w-[1.4em] rounded border border-current px-1 py-px text-center font-sans text-[10px] font-black not-italic leading-none opacity-90">
      {children}
    </kbd>
  );
}

/* ---------------------------------------------------------------------------
 * La escena de la parada
 * ------------------------------------------------------------------------- */

function Escena({
  kid,
  name,
  rival,
  kick,
  paso,
  marked,
  dive,
  shot,
  visible,
  replay,
  onPick,
  franja,
  avance,
  palomita,
}: {
  kid: Casero;
  name: string;
  rival: TiradorId;
  kick: RivalKick;
  paso: Paso;
  marked: PenaltyZoneId;
  dive: { zone: PenaltyZoneId; when: SaveTiming } | null;
  shot: SaveShot | null;
  /** Si ya ha enseñado el pie. */
  visible: boolean;
  replay: number;
  onPick: (zone: PenaltyZoneId) => void;
  franja: { from: number; to: number };
  avance: number;
  /** Si lleva palomita armada, que se le ve en el aura. */
  palomita: boolean;
}) {
  const ballRef = useRef<HTMLDivElement>(null);
  const [replaying, setReplaying] = useState(false);

  const flying = paso === 'vuelo';
  const seen = paso === 'visto';
  const route = shot ? trayecto(shot, 'normal') : null;
  const rest = route && (flying || seen) ? route.points[route.points.length - 1] : { ...PUNTO, s: 1 };

  // El vuelo de verdad, en cuanto arranca.
  useLayoutEffect(() => {
    if (!flying || !route || !ballRef.current) return undefined;
    const animation = volar(ballRef.current, route, VUELO_MS, 'cubic-bezier(0.3, 0.6, 0.4, 1)');
    return () => animation?.cancel();
    // La trayectoria sólo cambia con el tiro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flying, shot]);

  useLayoutEffect(() => {
    if (!replay || !route || !ballRef.current) return undefined;
    setReplaying(true);
    const animation = volar(ballRef.current, route, VUELO_MS, 'cubic-bezier(0.3, 0.6, 0.4, 1)', CAMARA_LENTA);
    const end = window.setTimeout(() => setReplaying(false), VUELO_MS * CAMARA_LENTA + 350);
    return () => {
      animation?.cancel();
      window.clearTimeout(end);
    };
    // Sólo cuando se pide otra repetición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  // El portero: en la línea mientras espera, y volando en cuanto se tira.
  const target = dive ? { x: zoneOf(dive.zone).x, y: zoneOf(dive.zone).y } : null;
  const pose = target ? estirada(target) : null;
  const portero = pose ?? {
    ...PORTERO_DE_PIE,
    pose: 'espera' as const,
    transform: 'translate(-50%, -50%)',
    flip: 1 as const,
  };

  const outcome = seen && shot && !replaying ? shot.outcome : null;
  const lean = kick.tell === 'izquierda' ? -1 : kick.tell === 'derecha' ? 1 : 0;

  return (
    <div
      className={`relative aspect-[4/3] select-none overflow-hidden bg-[#0b1220] ${outcome === 'encajado' ? 'animate-temblor' : ''}`}
    >
      <Estadio className="absolute inset-0 h-full w-full" name={name} color={ROPA_FAMILIA[kid]} />
      <Noche />

      {/* Las seis zonas: botones grandes sobre la portería. Se ven siempre,
          apagadas, para saber que están; y la marcada, encendida. */}
      {paso === 'carrera' && (
        <div className="absolute inset-0 z-20">
          {PENALTY_ZONES.map((zone) => {
            const at = enEscena({ x: zone.x, y: zone.y });
            const chosen = marked === zone.id;
            const flown = dive?.zone === zone.id;
            return (
              <button
                key={zone.id}
                type="button"
                disabled={Boolean(dive)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  onPick(zone.id);
                }}
                aria-label={`Tirarse ${zone.label}`}
                className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border-2 text-[clamp(14px,4vw,22px)]
                  font-black transition-colors
                  ${
                    flown
                      ? 'border-emerald-300 bg-emerald-400/35 text-white'
                      : chosen
                        ? 'border-amber-300 bg-amber-300/25 text-amber-100'
                        : 'border-white/40 bg-white/10 text-white/70'
                  }`}
                style={{
                  left: `${at.x}%`,
                  top: `${at.y}%`,
                  width: `${(BOCA.width / 3) * 0.98}%`,
                  height: `${(BOCA.height / 2) * 1.35}%`,
                }}
              >
                <span aria-hidden>{zone.arrow}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* El portero: el crío, con su cara y su color. */}
      <div
        className={`pointer-events-none absolute z-10 transition-all ease-out ${dive ? 'duration-300' : 'duration-500'} ${
          paso === 'carrera' && !dive ? 'animate-vaiven' : ''
        }`}
        style={{
          left: `${portero.x}%`,
          top: `${portero.y}%`,
          width: `${PORTERO_ANCHO}%`,
          aspectRatio: '160 / 150',
          transform: paso === 'carrera' && !dive ? undefined : portero.transform,
        }}
      >
        <div className="h-full w-full" style={{ transform: `scaleX(${portero.flip})` }}>
          <Portero
            who={kid}
            pose={portero.pose}
            className={`h-full w-full ${
              palomita
                ? '[filter:drop-shadow(0_2px_0_rgba(0,0,0,0.35))_drop-shadow(0_0_9px_rgba(52,211,153,0.95))_drop-shadow(0_0_18px_rgba(52,211,153,0.6))]'
                : '[filter:drop-shadow(0_2px_0_rgba(0,0,0,0.35))_drop-shadow(0_0_3px_rgba(255,240,190,0.5))]'
            }`}
          />
        </div>
      </div>

      {/* El aviso del rival: el pie abierto hacia su palo, con flechas. */}
      {visible && !dive && kick.tell !== 'centro' && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 flex animate-pulse gap-0.5 font-black text-amber-300
                     drop-shadow-[0_1px_0_#241a14] [font-size:clamp(16px,5vw,26px)]"
          style={{
            left: `${PUNTO.x + lean * 9}%`,
            top: `${PUNTO.y - 7}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {kick.tell === 'izquierda' ? '◀◀' : '▶▶'}
        </div>
      )}
      {visible && !dive && kick.tell === 'centro' && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 animate-pulse font-black text-amber-300 drop-shadow-[0_1px_0_#241a14]
                     [font-size:clamp(16px,5vw,26px)]"
          style={{ left: `${PUNTO.x}%`, top: `${PUNTO.y - 7}%`, transform: 'translate(-50%, -50%)' }}
        >
          ▲
        </div>
      )}

      {/* El balón. */}
      <div
        ref={ballRef}
        className="pointer-events-none absolute z-20 w-[7%]"
        style={{ left: `${rest.x}%`, top: `${rest.y}%`, transform: `translate(-50%, -50%) scale(${rest.s})` }}
      >
        <Balon className="h-auto w-full drop-shadow-[0_2px_0_rgba(0,0,0,0.3)]" />
      </div>

      {/* Las sombras: sin ellas los dos parecen pegatinas. */}
      <div aria-hidden className="pointer-events-none absolute bottom-[3.4%] left-[13%] h-[2.2%] w-[13%] rounded-[50%] bg-black/40 blur-[2px]" />
      <div
        aria-hidden
        className="pointer-events-none absolute h-[1.6%] w-[9%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-[2px]"
        style={{ left: `${portero.x}%`, top: `${PORTERO_DE_PIE.y + 11.4}%` }}
      />

      {/* El rival, en el punto de penalti. */}
      <div
        className="pointer-events-none absolute bottom-[3%] left-[11%] h-[46%] [filter:drop-shadow(0_3px_3px_rgba(0,0,0,0.4))]"
        style={{ aspectRatio: '120 / 210' }}
      >
        <Chutador
          who={rival}
          pose={paso === 'aviso' ? 'espera' : paso === 'carrera' ? 'carrera' : outcome === 'encajado' ? 'celebra' : 'golpeo'}
          className="h-full w-full"
        />
      </div>

      {/* El estallido del golpeo. */}
      {(flying || replaying) && (
        <div
          aria-hidden
          className="pointer-events-none absolute h-[30%] w-[22%] -translate-x-1/2 -translate-y-1/2 animate-chispazo"
          style={{ left: `${PUNTO.x}%`, top: `${PUNTO.y}%` }}
        >
          <Impacto className="h-full w-full" color="#fff8d6" />
        </div>
      )}

      {/* La barra de la carrerilla: la franja verde es el momento de volar. */}
      {paso === 'carrera' && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#0b1220]/95 via-[#0b1220]/70 to-transparent
                     px-[3%] pb-[2.5%] pt-[6%]"
        >
          <div className="ml-auto w-[62%] min-w-[10rem]">
            <div className="mb-0.5 flex items-end justify-between gap-2 px-0.5 text-[clamp(8px,2.2vw,11px)] font-black uppercase tracking-[0.14em] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
              <span>Carrerilla</span>
              <span className={visible ? 'text-emerald-300' : 'text-white/60'}>{visible ? '¡Vuela!' : 'Aguanta'}</span>
            </div>
            <div className="relative h-[clamp(12px,3.4vw,18px)] -skew-x-12 overflow-hidden rounded-[3px] border-2 border-[#0b1220] bg-[#0b1220]/80 shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
              <div
                className="absolute inset-y-0 bg-emerald-400/45"
                style={{ left: `${franja.from}%`, width: `${franja.to - franja.from}%` }}
              />
              <div
                className="absolute inset-y-0 border-x-2 border-emerald-300"
                style={{ left: `${franja.from}%`, width: `${franja.to - franja.from}%` }}
              />
              <div className="absolute inset-y-[-2px] w-[3px] bg-white shadow-[0_0_6px_white]" style={{ left: `calc(${avance}% - 1px)` }} />
            </div>
          </div>
        </div>
      )}

      {/* El primer plano del rival mientras viene: la viñeta de la serie. */}
      {paso === 'carrera' && (
        <div className="pointer-events-none absolute right-[3%] top-[3%] z-30 w-[19%] rotate-3 animate-pop">
          <Vineta who={rival} className="aspect-square w-full border-[3px] border-[#241a14] shadow-[3px_3px_0_#241a14]" />
        </div>
      )}

      {/* La repetición: bandas negras de cine. */}
      {replaying && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
          <div className="absolute inset-x-0 top-0 h-[7%] bg-black" />
          <div className="absolute inset-x-0 bottom-0 h-[7%] bg-black" />
          <div className="absolute right-[3%] top-[9%] flex animate-floatUp items-center gap-1.5 rounded bg-[#0b1220]/90 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
            Repetición
          </div>
        </div>
      )}

      {/* El cartel de turno, antes de empezar. */}
      {paso === 'aviso' && <Cartel titulo="¡AHORA PARAS!" pie="Te ponen los guantes" color="#f59e0b" />}

      {/* El resultado. */}
      {outcome && shot && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 animate-fogonazo bg-white" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[57%] z-30 flex flex-col items-center">
            <div
              className={`relative animate-rotulo overflow-hidden px-[8%] py-1 [clip-path:polygon(4%_0,100%_0,96%_100%,0_100%)]
                ${
                  outcome === 'parada'
                    ? 'bg-gradient-to-r from-emerald-400 via-emerald-700 to-emerald-400'
                    : outcome === 'encajado'
                      ? 'bg-gradient-to-r from-rose-500 via-[#0b1220] to-rose-500'
                      : 'bg-gradient-to-r from-slate-600 via-slate-800 to-slate-600'
                }`}
            >
              <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-barrido bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              <p className="relative font-manga text-[clamp(34px,11vw,64px)] leading-none tracking-wide text-white [paint-order:stroke] [-webkit-text-stroke:6px_#241a14]">
                {TITULAR[outcome]}
              </p>
            </div>
            <p
              className="-mt-0.5 animate-floatUp bg-[#0b1220] px-3 py-1 text-[clamp(10px,2.8vw,13px)] font-black uppercase tracking-[0.14em] [animation-delay:180ms]"
              style={{ color: MOMENTO[dive?.when ?? 'quieto'].color }}
            >
              {MOMENTO[dive?.when ?? 'quieto'].label}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

