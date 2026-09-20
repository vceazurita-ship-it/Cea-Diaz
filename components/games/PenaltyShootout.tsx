'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  Balon,
  Benji,
  Chutador,
  Estadio,
  FondoTiro,
  Impacto,
  RedHinchada,
  SERIE_ORDER,
  esDeLaSerie,
  Vineta,
  tiradorDe,
  type PoseBenjiId,
  type TiradorId,
} from '@/components/games/PenaltyArt';
import {
  ENERGY_START,
  PENALTY_SHOTS,
  SHOT_ORDER,
  SHOT_TYPES,
  energyLeft,
  keeperTell,
  keeperZone,
  overshootPreview,
  penaltyVerdict,
  powerBand,
  resolveShot,
  shotAvailability,
  zoneOf,
} from '@/lib/penalties';
import type { PenaltyAim, PenaltyOutcome, PenaltyShot, PenaltySide, PenaltyZoneId } from '@/lib/penalties';
import { manga } from '@/components/games/mangaFont';
import { hashSeed } from '@/lib/challenges';
import { ROPA_FAMILIA, type Casero } from '@/lib/cromoArt';
import { playCue } from '@/lib/sound';
import type { DateKey, PenaltyResult, ProfileId, ShotKind } from '@/types';

/* =========================================================================
 *  Tirar los cinco penaltis contra Benji.
 *
 *  Un penalti son tres gestos y los tres pasan **dentro de la escena**:
 *  tocar o arrastrar sobre la portería para **colocar** la mira, **mantener
 *  pulsado** para cargar la fuerza y **soltar** para chutar. En el ordenador,
 *  las flechas mueven la mira y la barra espaciadora es el botón: se mantiene
 *  y se suelta. El botón de chutar dice en cada momento lo que toca —«más
 *  fuerza», «¡suelta ahora!» o «¡te pasas!»— con su color.
 *
 *  Se presenta como un partido en la tele: el marcador en la esquina con la
 *  tanda de los dos —los goles del que tira y las paradas de Benji—, el
 *  estadio de noche con los focos, la barra de potencia con su franja buena,
 *  la mira que se agranda y sube cuando uno se pasa de fuerza —con los mismos
 *  números con los que luego se resuelve el tiro—, el rótulo del resultado y
 *  la repetición a cámara lenta. El dibujo sigue siendo el de Oliver y Benji.
 *
 *  La pieza que lo convierte en habilidad y no en sorteo es **el aviso del
 *  portero**: antes de cada tiro Benji se carga hacia el lado por el que va
 *  a volar, se le ven las flechas a los pies y lo dice el narrador. Leerlo y
 *  tirar al otro lado es la lección entera del penalti.
 *
 *  Y están **los tiros de la serie** para elegir, cada uno con sus reglas en
 *  `lib/penalties.ts`, su coste en energía y su corte a pantalla entera.
 *
 *  Una regla que no es de adorno: **el tiro se anota al dispararse**. Cerrar
 *  la aplicación con un penalti a medias no lo devuelve; volver más tarde
 *  sigue la tanda por donde iba.
 * ========================================================================= */

interface PenaltyShootoutProps {
  profileId: ProfileId;
  name: string;
  date: DateKey;
  /** Lo tirado hasta ahora; `null` si la tanda está por empezar. */
  result: PenaltyResult | null;
  /** Anota el tiro en cuanto se ejecuta. */
  onShot: (result: PenaltyResult) => void;
  onClose: () => void;
}

/**
 * En qué momento del penalti se está.
 *
 *  · `intro`   — la elección del que tira y cómo se juega. Sólo antes del primero.
 *  · `apuntar` — moviendo la mira.
 *  · `fuerza`  — con el dedo puesto: la barra corre.
 *  · `corte`   — el nombre del tiro especial a pantalla entera.
 *  · `vuelo`   — el balón va de camino y Benji se tira.
 *  · `visto`   — ya ha acabado, y se explica por qué.
 */
type Step = 'intro' | 'apuntar' | 'fuerza' | 'corte' | 'vuelo' | 'visto';

/** Lo que dura el corte del tiro especial. */
const CORTE_MS = 950;

/** Lo que tarda Benji en reaccionar: se tira cuando el balón ya ha salido. */
const REFLEJO_MS = 110;

/** Cuánto más despacio va la repetición. */
const CAMARA_LENTA = 2.6;

/** Dónde está el punto de penalti dentro de la escena, en tanto por ciento. */
const PUNTO = { x: 40, y: 87.6 };

/**
 * Dónde vive la boca de la portería dentro de la escena, en tanto por ciento.
 * Casa con el `MOUTH` del lienzo de `Estadio` (52, 51, 296, 105 en 400×300):
 * todo lo que pasa dentro se mide en tanto por ciento de esta caja, que es
 * el mismo sistema con el que piensan las reglas de `lib/penalties.ts`.
 */
const BOCA = { left: 13, top: 17, width: 74, height: 35 };

/** Un punto de la portería, llevado a coordenadas de la escena. */
function enEscena(point: PenaltyAim): { x: number; y: number } {
  return {
    x: BOCA.left + (point.x / 100) * BOCA.width,
    y: BOCA.top + (point.y / 100) * BOCA.height,
  };
}

/** Benji de pie: centrado en la boca y con los pies en la línea. */
const BENJI_ANCHO = 25;
const BENJI_DE_PIE = { x: 50, y: 36.4 };

/** La tinta de la serie, y el azul noche de la tele. */
const TINTA = '#241a14';
const NOCHE = '#0b1220';

const TITULAR: Record<PenaltyOutcome, string> = {
  gol: '¡GOOOOL!',
  parada: '¡PARADÓN!',
  fuera: '¡FUERA!',
  poste: '¡AL PALO!',
};

/** La segunda línea del rótulo, la que diría el grafista de la tele. */
function subtitulo(outcome: PenaltyOutcome, shooter: string, kind: ShotKind): string {
  const tiro = kind === 'normal' ? '' : ` · ${SHOT_TYPES[kind].name}`;
  if (outcome === 'gol') return `Gol de ${shooter}${tiro}`;
  if (outcome === 'parada') return `Benji lo saca${tiro}`;
  if (outcome === 'poste') return `Repele la madera${tiro}`;
  return `Se marcha fuera${tiro}`;
}

/** El timbre del narrador justo al chutar. */
function grito(name: string, kind: ShotKind, plural = false): string {
  const [chuta, saca] = plural ? ['chutan', 'sacan'] : ['chuta', 'saca'];
  return kind === 'normal'
    ? `¡${name} ${chuta}…!`
    : `¡${name} ${saca} ${SHOT_TYPES[kind].article} ${SHOT_TYPES[kind].name}!`;
}

/** Tres letras para el marcador, sin tildes: LEO, HUG, OLI, BEN. */
function siglas(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase();
}

/** El color de equipo del que tira, legible sobre el azul noche. */
function colorDe(who: TiradorId): string {
  const kit = tiradorDe(who).kit;
  // Una camiseta blanca no se ve como franja: se usa su vivo.
  return kit === '#f8fafc' ? (tiradorDe(who).trim ?? '#1d4ed8') : kit;
}

/* ---------------------------------------------------------------------------
 * Las fichas
 *
 * Cada uno con su media, su puesto y tres cifras de tiro, como las cartas de
 * los videojuegos de fútbol. Son de adorno —no cambian el tiro—, pero es lo
 * que hace que elegir al Tigre o a Oliver se viva como elegir de verdad. Los
 * de casa llevan la carta especial, la de las leyendas.
 * ------------------------------------------------------------------------- */

interface Ficha {
  media: number;
  pos: string;
  tir: number;
  pot: number;
  pre: number;
}

const FICHAS: Record<string, Ficha> = {
  oliver: { media: 95, pos: 'MC', tir: 93, pot: 90, pre: 94 },
  mark: { media: 94, pos: 'DC', tir: 95, pot: 99, pre: 84 },
  derrick: { media: 88, pos: 'DC', tir: 90, pot: 88, pre: 86 },
  tom: { media: 90, pos: 'MC', tir: 86, pot: 82, pre: 92 },
  julian: { media: 92, pos: 'MC', tir: 90, pot: 84, pre: 95 },
  philip: { media: 86, pos: 'MC', tir: 84, pot: 86, pre: 83 },
  bruce: { media: 81, pos: 'DFC', tir: 74, pot: 80, pre: 72 },
  ed: { media: 89, pos: 'POR', tir: 78, pot: 85, pre: 76 },
};

const FICHA_CASA: Ficha = { media: 97, pos: 'DC', tir: 96, pot: 92, pre: 97 };

function fichaDe(id: TiradorId): Ficha {
  return esDeLaSerie(id) ? FICHAS[id] : FICHA_CASA;
}

/** El disparo ya hecho: adónde voló Benji, qué tiro fue y en qué acabó. */
interface Fired {
  keeper: PenaltyZoneId;
  shot: PenaltyShot;
  kind: ShotKind;
}

export function PenaltyShootout({
  profileId,
  name,
  date,
  result,
  onShot,
  onClose,
}: PenaltyShootoutProps) {
  const taken = result?.taken ?? 0;
  const scored = result?.scored ?? 0;
  const done = taken >= PENALTY_SHOTS;
  const who = profileId as Casero;

  /**
   * Quién tira: él mismo o uno de la serie. Se elige al empezar y se recuerda
   * en este aparato, que es una comodidad y no un dato: si se pierde, vuelve
   * a tirar él.
   */
  const [shooter, setShooterState] = useState<TiradorId>(who);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`penaltis:tirador:${profileId}`);
      if (saved && (esDeLaSerie(saved) || saved === who)) setShooterState(saved as TiradorId);
    } catch {
      // Sin almacenamiento, tira él.
    }
  }, [profileId, who]);
  const setShooter = (id: TiradorId) => {
    setShooterState(id);
    try {
      window.localStorage.setItem(`penaltis:tirador:${profileId}`, id);
    } catch {
      // Da igual: se elige otra vez.
    }
  };
  const shooterName = shooter === who ? name : (tiradorDe(shooter).name ?? name);

  const [step, setStep] = useState<Step>(done ? 'visto' : taken === 0 ? 'intro' : 'apuntar');
  const [aim, setAim] = useState<PenaltyAim>({ x: 50, y: 50 });
  const [power, setPower] = useState(0);

  /**
   * El tiro elegido. Se elige antes de coger fuerza y se queda hasta que sale
   * el balón: cambiar de idea con el dedo ya puesto sería tirar dos penaltis
   * distintos con el mismo gesto.
   */
  const [kind, setKind] = useState<ShotKind>('normal');
  const special = kind !== 'normal';

  /**
   * El penalti ya tirado: adónde voló el portero y en qué acabó. Se guarda
   * entero al disparar y no se recalcula al pintar: en cuanto el tiro queda
   * anotado el contador sube y el portero que tocaría ya es el del siguiente.
   */
  const [fired, setFired] = useState<Fired | null>(null);

  /** Si Benji ya ha arrancado a tirarse: medio instante después del golpeo. */
  const [diving, setDiving] = useState(false);

  /** Cada vez que sube, la escena repite el último penalti a cámara lenta. */
  const [replay, setReplay] = useState(0);

  /**
   * Cómo acabó cada tiro de los que se han tirado **con esta pantalla
   * abierta**. Lo guardado en el día sólo dice cuántos entraron, no cuáles;
   * los de antes de cerrar la app salen en el marcador como tirados, sin más.
   */
  const [history, setHistory] = useState<PenaltyOutcome[]>([]);
  const [firstShown] = useState(taken);

  /** El portero de este penalti: decidido de antemano, y con su aviso. */
  const round = result?.round ?? 0;
  const keeper = keeperZone(profileId, date, taken, round);
  const tell = keeperTell(keeper);

  /* ------------------------------------------------------- los relojes */

  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  /* ------------------------------------------------------ la barra de fuerza */

  // La barra va y viene sola mientras se mantiene pulsado. Se mueve con el
  // reloj del navegador y no con un temporizador de pasos para que corra
  // igual en un móvil viejo que en un portátil.
  const frame = useRef<number>();
  const charged = useRef(0);

  useEffect(() => {
    if (step !== 'fuerza') return undefined;

    const started = performance.now();
    // Los especiales van más rápidos: su franja pasa antes, que es lo que
    // hace que tirarlos cueste algo.
    const sweep = SHOT_TYPES[kind].sweep;

    const tick = (now: number) => {
      const phase = ((now - started) % (sweep * 2)) / sweep;
      const value = Math.round((phase <= 1 ? phase : 2 - phase) * 100);
      charged.current = value;
      setPower(value);
      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [step, kind]);

  /* ------------------------------------------------------------- el disparo */

  /** Evita que el mismo gesto dispare dos veces (el dedo y la tecla a la vez). */
  const shot = useRef(false);

  const charge = useCallback(() => {
    if (step !== 'apuntar') return;
    charged.current = 0;
    shot.current = false;
    setStep('fuerza');
  }, [step]);

  const fire = useCallback(() => {
    if (step !== 'fuerza' || shot.current) return;
    shot.current = true;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);

    // La semilla del tiro decide hacia qué lado se abre un balón reventado.
    // Va con el perfil, el día y el número de tiro para que el mismo penalti
    // dé siempre lo mismo, como las preguntas.
    const seed = hashSeed(`${profileId}:desvio:${date}:${taken}${round ? `:r${round}` : ''}`);
    const outcome = resolveShot(aim, charged.current, keeper, seed, kind);
    const flight = SHOT_TYPES[kind].flight;

    setPower(charged.current);
    setFired({ keeper, shot: outcome, kind });
    setHistory((list) => [...list, outcome.outcome]);

    // Con el especial, primero el corte con su nombre a gritos; el golpeo
    // llega al acabar. Sin él, el golpeo es inmediato: cinco cortes seguidos
    // se harían pesados y el penalti normal tiene que ser ágil.
    const kick = special ? CORTE_MS : 0;
    setStep(special ? 'corte' : 'vuelo');

    later(() => {
      setStep('vuelo');
      playCue('tiro');
    }, kick);
    later(() => setDiving(true), kick + REFLEJO_MS);
    later(() => {
      setStep('visto');
      playCue(outcome.outcome === 'gol' ? 'gol' : outcome.outcome === 'fuera' ? 'fuera' : 'parada');
      try {
        navigator.vibrate?.(outcome.outcome === 'gol' ? [40, 50, 90] : 70);
      } catch {
        // Hay navegadores que tienen la función y la prohíben: da igual.
      }
    }, kick + flight);

    onShot({
      scored: scored + (outcome.outcome === 'gol' ? 1 : 0),
      taken: taken + 1,
      total: PENALTY_SHOTS,
      at: new Date().toISOString(),
      // El especial se gasta al tirarlo, salga como salga. Se guarda con la
      // tanda para que cerrar la app entre dos penaltis no devuelva la
      // energía ni deje repetirlo.
      specials: special ? [...(result?.specials ?? []), kind] : (result?.specials ?? []),
      round,
    });
    // `later` sólo empuja a una lista: no cambia entre pintadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aim, date, keeper, kind, onShot, profileId, result, round, scored, special, step, taken]);

  const next = useCallback(() => {
    setAim({ x: 50, y: 50 });
    setFired(null);
    setDiving(false);
    setPower(0);
    setKind('normal');
    setReplay(0);
    setStep('apuntar');
  }, []);

  /* --------------------------------------------------------- el teclado */

  // Con teclado se juega como en la consola: flechas para la mira y la barra
  // espaciadora (o Intro) mantenida para la fuerza. Se escucha en la ventana
  // para que funcione sin tener que enfocar nada; los botones de elegir tiro
  // se dejan en paz, que su Intro es suyo.
  const live = useRef({ step, charge, fire });
  live.current = { step, charge, fire };

  useEffect(() => {
    const isOwn = (event: KeyboardEvent) =>
      event.target instanceof HTMLElement && Boolean(event.target.closest('[data-tiro], input, textarea, select'));

    const down = (event: KeyboardEvent) => {
      const { step: now } = live.current;
      if (now !== 'apuntar' && now !== 'fuerza') return;
      if (isOwn(event)) return;

      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-7, 0],
        ArrowRight: [7, 0],
        ArrowUp: [0, -10],
        ArrowDown: [0, 10],
      };
      const move = moves[event.key];
      if (move) {
        event.preventDefault();
        if (now !== 'apuntar') return;
        setAim((current) => ({
          x: Math.max(3, Math.min(97, current.x + move[0])),
          y: Math.max(3, Math.min(97, current.y + move[1])),
        }));
        return;
      }

      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!event.repeat) live.current.charge();
      }
    };

    const up = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (live.current.step !== 'fuerza' || isOwn(event)) return;
      event.preventDefault();
      live.current.fire();
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /* ---------------------------------------------------------------- pintura */

  if (done && !fired)
    return (
      <Final
        who={shooter}
        shooterName={shooterName}
        scored={scored}
        result={result}
        history={history}
        firstShown={firstShown}
        onClose={onClose}
      />
    );

  if (step === 'intro')
    return (
      <CaraACara who={who} shooter={shooter} onPick={setShooter} name={name} onStart={() => setStep('apuntar')} />
    );

  const shownKind = fired?.kind ?? kind;
  const [low, high] = powerBand(shownKind);
  const type = SHOT_TYPES[kind];
  const shooting = Math.min(taken + (fired ? 0 : 1), PENALTY_SHOTS);
  const aiming = step === 'apuntar' || step === 'fuerza';
  const zone = power < low ? 'flojo' : power > high ? 'pasado' : 'buena';
  const pending = step === 'corte' || step === 'vuelo';

  return (
    <div className={`${manga.variable} mx-auto w-full max-w-2xl space-y-3`}>
      {/* La retransmisión: el marcador, la escena y el narrador van en un
          mismo marco, como la imagen de la tele con sus rótulos. */}
      <div className="overflow-hidden rounded-2xl shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] ring-1 ring-black/40">
        {/* Mientras el balón va de camino, el marcador sigue como estaba: el
            tiro ya está anotado, pero enseñarlo antes de que llegue a la
            portería chivaría el final. */}
        <Marcador
          who={shooter}
          shooterName={shooterName}
          taken={pending ? taken - 1 : taken}
          scored={pending && fired?.shot.outcome === 'gol' ? scored - 1 : scored}
          shooting={shooting}
          history={pending ? history.slice(0, -1) : history}
          firstShown={firstShown}
        />

        <Escena
          who={shooter}
          kid={who}
          name={name}
          shooterName={shooterName}
          aim={aim}
          onAim={setAim}
          step={step}
          tell={tell}
          fired={fired}
          diving={diving}
          kind={shownKind}
          power={power}
          band={[low, high]}
          replay={replay}
          penalty={shooting}
        />

        {/* El narrador, en la cinta de abajo. */}
        <p
          className="flex min-h-[3.25rem] items-center gap-2.5 px-3 py-2 text-[13px] font-bold leading-snug text-white"
          style={{ backgroundColor: NOCHE }}
          aria-live="polite"
        >
          <span className="flex shrink-0 items-center gap-1 rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Directo
          </span>
          <span className="min-w-0 flex-1">
            {step === 'visto' && fired ? (
              <>
                <span className="sr-only">{TITULAR[fired.shot.outcome]} </span>
                {fired.shot.why}
              </>
            ) : step === 'corte' || step === 'vuelo' ? (
              <span className="italic">{grito(shooterName, fired?.kind ?? 'normal', Boolean(tiradorDe(shooter).twin))}</span>
            ) : tell === 'centro' ? (
              <>
                Benji se queda <span className="text-amber-300">en el centro</span>.{' '}
                <span className="font-semibold text-white/70">Pégalo a un palo.</span>
              </>
            ) : (
              <>
                Benji se carga hacia <span className="text-amber-300">tu {tell}</span>.{' '}
                <span className="font-semibold text-white/70">¡Tira al otro lado!</span>
              </>
            )}
          </span>
        </p>
      </div>

      {aiming && (
        <div className="space-y-2.5">
          {/* Los tiros: el normal y los de la serie, con lo que cuestan. Sólo
              se eligen mientras se apunta; con el dedo puesto, el que esté
              elegido es el que sale. */}
          <SelectorTiros result={result} kind={kind} onPick={setKind} locked={step !== 'apuntar'} />

          {/* Apuntar y coger fuerza comparten **el mismo botón**: quien
              mantiene el dedo en un botón que desaparece se queda con el tiro a
              medias. Un solo botón que cambia de rótulo y de color quita el
              salto, y además dice cuándo soltar. */}
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              // El dedo se queda atado a este botón: aunque se mueva o se
              // suelte fuera, el disparo vuelve aquí en vez de perderse.
              event.currentTarget.setPointerCapture(event.pointerId);
              charge();
            }}
            onPointerUp={fire}
            onPointerCancel={fire}
            onContextMenu={(event) => event.preventDefault()}
            className={`relative flex min-h-[4rem] w-full touch-none select-none items-center justify-center gap-2 overflow-hidden
              rounded-2xl px-4 text-lg font-black uppercase tracking-wide
              shadow-[0_5px_0_rgba(0,0,0,0.45)] transition-colors active:translate-y-[3px] active:shadow-[0_2px_0_rgba(0,0,0,0.45)]
              [-webkit-touch-callout:none] [-webkit-user-select:none]
              ${
                step === 'apuntar'
                  ? special
                    ? 'text-[#241a14]'
                    : 'bg-gradient-to-b from-lime-300 to-emerald-500 text-[#0b1f14]'
                  : zone === 'buena'
                    ? 'animate-latido bg-gradient-to-b from-emerald-300 to-emerald-500 text-[#0b1f14]'
                    : zone === 'pasado'
                      ? 'bg-gradient-to-b from-rose-400 to-rose-600 text-white'
                      : 'bg-gradient-to-b from-slate-500 to-slate-700 text-white'
              }`}
            style={step === 'apuntar' && special ? { backgroundColor: type.color } : undefined}
          >
            {/* El brillo que barre el botón mientras espera: se ve que es lo
                que hay que tocar sin tener que leerlo. */}
            {step === 'apuntar' && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-barrido
                           bg-gradient-to-r from-transparent via-white/45 to-transparent"
              />
            )}
            <span className="relative">
              {step === 'apuntar'
                ? `${type.icon} Mantén para chutar`
                : zone === 'buena'
                  ? '¡Suelta ahora!'
                  : zone === 'pasado'
                    ? '¡Te pasas!'
                    : 'Más fuerza…'}
            </span>
          </button>

          <p className="text-center text-[11px] leading-snug t-3">
            {step === 'apuntar' ? (
              <>
                <span className="md:hidden">Toca o arrastra sobre la portería para apuntar.</span>
                <span className="hidden md:inline">
                  Apunta con el ratón o con <Tecla>←</Tecla> <Tecla>→</Tecla> <Tecla>↑</Tecla> <Tecla>↓</Tecla>; mantén{' '}
                  <Tecla>Espacio</Tecla> y suéltalo en la franja verde.
                </span>
              </>
            ) : (
              'Quedarte corto le da tiempo a Benji; pasarte sube y abre el balón: mira cómo crece el cerco.'
            )}
          </p>
        </div>
      )}

      {(step === 'corte' || step === 'vuelo') && (
        <div
          aria-hidden
          className="flex min-h-[4rem] w-full items-center justify-center rounded-2xl border-2 border-dashed hairline text-sm font-bold t-3"
        >
          …
        </div>
      )}

      {step === 'visto' && fired && (
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
            onClick={done ? () => setFired(null) : next}
            autoFocus
            className="flex min-h-[4rem] items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-200
                       to-amber-400 px-4 text-lg font-black uppercase tracking-wide text-[#241a14]
                       shadow-[0_5px_0_rgba(0,0,0,0.45)] active:translate-y-[3px] active:shadow-[0_2px_0_rgba(0,0,0,0.45)]"
          >
            {done ? '🏁 Ver el resumen' : `Penalti ${taken + 1} ▶`}
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
 * El marcador de la tele
 *
 * El rótulo de la esquina: los dos escudos con sus siglas, el resultado en
 * medio y, debajo, la tanda de cada uno en círculos —verde lo que suma, rojo
 * lo que no—, como se sigue una tanda en la tele. Arriba, el que tira con sus
 * goles; abajo, Benji con sus paradas. Plantearlo como un partido contra
 * alguien es lo que hace que una tanda se viva como una final.
 * ------------------------------------------------------------------------- */

function Marcador({
  who,
  shooterName,
  taken,
  scored,
  shooting,
  history,
  firstShown,
}: {
  who: TiradorId;
  shooterName: string;
  taken: number;
  scored: number;
  shooting: number;
  history: PenaltyOutcome[];
  /** Cuántos había tirados al abrir: de ésos no se sabe cómo acabaron. */
  firstShown: number;
}) {
  const saved = taken - scored;
  const color = colorDe(who);

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
      aria-label={`${shooterName} ${scored}, Benji ${saved}. Penalti ${shooting} de ${PENALTY_SHOTS}.`}
    >
      <div className="flex items-stretch">
        {/* La mosca de la cadena: en directo y qué se juega. */}
        <div className="hidden flex-col justify-center gap-0.5 border-r border-white/10 px-3 sm:flex">
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.16em] text-rose-400">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
            En directo
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/70">Tanda de penaltis</span>
        </div>

        {/* Dos filas con las mismas tres columnas: arriba los equipos y el
            resultado; debajo, la tanda de cada uno bajo su escudo. En una sola
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

          {/* El resultado. */}
          <div className="flex items-stretch overflow-hidden rounded-md shadow-inner">
            <span className="min-w-[2.1rem] bg-white px-1.5 py-0.5 text-center text-2xl font-black tabular-nums leading-tight text-[#0b1220]">
              {scored}
            </span>
            <span className="min-w-[2.1rem] bg-white/85 px-1.5 py-0.5 text-center text-2xl font-black tabular-nums leading-tight text-[#0b1220]">
              {saved}
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
          <span className="whitespace-nowrap text-center text-[9px] font-black uppercase tracking-[0.14em] text-amber-300">
            Penalti {shooting}/{PENALTY_SHOTS}
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
 * La escena
 * ------------------------------------------------------------------------- */

/** Cómo se coloca Benji al tirarse a una zona: dónde, con qué pose y cómo girado. */
function estirada(id: PenaltyZoneId): {
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
  const flip = zone.side === 'izquierda' ? -1 : 1;
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
function trayecto(shot: PenaltyShot, kind: ShotKind): { points: { x: number; y: number; s: number }[]; arrive: number } {
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

/**
 * Los destellos de los flashes en la grada: sitios fijos, que un reparto al
 * azar en cada pintada haría bailar la grada entera.
 */
const FLASHES = [
  [8, 8, 0], [17, 12, 1.3], [26, 7, 0.4], [34, 13, 2.1], [43, 9, 0.9], [52, 12, 1.7], [61, 8, 0.2],
  [69, 13, 1.1], [77, 9, 2.4], [86, 12, 0.6], [93, 8, 1.9], [12, 15, 2.8], [58, 15, 3.1], [81, 15, 0.3],
] as const;

function Escena({
  who,
  kid,
  name,
  shooterName,
  aim,
  onAim,
  step,
  tell,
  fired,
  diving,
  kind,
  power,
  band,
  replay,
  penalty,
}: {
  /** El que tira. */
  who: TiradorId;
  /** Y el crío de la tanda, que es a quien anima la grada. */
  kid: Casero;
  name: string;
  shooterName: string;
  aim: PenaltyAim;
  onAim: (aim: PenaltyAim) => void;
  step: Step;
  tell: PenaltySide;
  fired: Fired | null;
  diving: boolean;
  /** El tiro elegido o, si ya ha salido, el que salió. */
  kind: ShotKind;
  power: number;
  band: [number, number];
  /** Sube cada vez que se pide la repetición. */
  replay: number;
  penalty: number;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const [replaying, setReplaying] = useState(false);
  const [replayDive, setReplayDive] = useState(false);

  /** Mueve la mira al punto que se está tocando, sin salirse de la portería. */
  const point = (event: React.PointerEvent) => {
    const box = scene.current?.getBoundingClientRect();
    if (!box) return;
    const sx = ((event.clientX - box.left) / box.width) * 100;
    const sy = ((event.clientY - box.top) / box.height) * 100;
    onAim({
      x: Math.max(3, Math.min(97, ((sx - BOCA.left) / BOCA.width) * 100)),
      y: Math.max(3, Math.min(97, ((sy - BOCA.top) / BOCA.height) * 100)),
    });
  };

  const aiming = step === 'apuntar' || step === 'fuerza';
  const flying = step === 'vuelo';
  const seen = step === 'visto';
  const inFlight = flying || replaying;
  const special = kind !== 'normal';
  const color = SHOT_TYPES[kind].color;
  const route = fired ? trayecto(fired.shot, fired.kind) : null;
  const path = route?.points ?? null;
  const rest = path && (flying || seen) ? path[path.length - 1] : { ...PUNTO, s: 1 };

  /** El vuelo del balón con la API del navegador; `slow` lo estira. */
  const flight = (slow: number): Animation | null => {
    if (!path || !route || !ballRef.current || !fired) return null;
    const last = path.length - 1;
    // Hasta la portería, repartido a partes iguales; si luego rebota o se
    // mete en la red, eso va en el último cuarto.
    const reach = last > route.arrive ? 0.78 : 1;
    return ballRef.current.animate(
      path.map((p, i) => ({
        left: `${p.x}%`,
        top: `${p.y}%`,
        transform: `translate(-50%, -50%) scale(${p.s}) rotate(${i * 330}deg)`,
        offset: i <= route.arrive ? (i / route.arrive) * reach : 1,
        easing: i === route.arrive && last > route.arrive ? 'ease-out' : 'linear',
      })),
      {
        duration: SHOT_TYPES[fired.kind].flight * slow,
        easing: fired.kind === 'parabola' ? 'ease-in-out' : 'cubic-bezier(0.3, 0.6, 0.4, 1)',
        fill: 'backwards',
      },
    );
  };

  // El vuelo de verdad, en cuanto arranca. La posición de reposo que pinta
  // React ya es la final, así que al acabar el balón se queda donde toca.
  useLayoutEffect(() => {
    if (!flying) return undefined;
    const animation = flight(1);
    return () => animation?.cancel();
    // La trayectoria sólo cambia con el tiro, y el tiro sólo con `fired`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flying, fired]);

  // La repetición: el mismo tiro, a cámara lenta, con Benji volviendo a su
  // sitio y tirándose otra vez. El rótulo se esconde mientras dura y vuelve a
  // entrar al acabar, como en la tele.
  useLayoutEffect(() => {
    if (!replay || !fired) return undefined;
    setReplaying(true);
    setReplayDive(false);
    const animation = flight(CAMARA_LENTA);
    const dive = window.setTimeout(() => setReplayDive(true), REFLEJO_MS * CAMARA_LENTA + 60);
    const end = window.setTimeout(() => setReplaying(false), SHOT_TYPES[fired.kind].flight * CAMARA_LENTA + 350);
    return () => {
      animation?.cancel();
      window.clearTimeout(dive);
      window.clearTimeout(end);
    };
    // Sólo cuando se pide otra repetición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  const mira = enEscena(aim);

  // Lo que se sabe del desvío mientras se carga: el cerco sube y se agranda
  // con los mismos números con los que después se resuelve el tiro.
  const [low, high] = band;
  const preview = overshootPreview(kind, power);
  const charging = step === 'fuerza';
  const zone = power < low ? 'flojo' : power > high ? 'pasado' : 'buena';
  const ghost = charging && preview.drift > 0 ? enEscena({ x: aim.x, y: aim.y - preview.drift * preview.up }) : null;
  const spread = ghost ? 7 + (preview.drift * preview.open * 2 * BOCA.width) / 100 : 0;
  const ring = zone === 'buena' ? '#34d399' : zone === 'pasado' ? '#fb7185' : charging ? '#fbbf24' : '#ffffff';

  // Benji: quieto y cargado hacia su lado mientras se apunta, y volando
  // adonde le tocaba en cuanto sale el balón.
  const lean = tell === 'izquierda' ? -6 : tell === 'derecha' ? 6 : 0;
  const tirado = replaying ? replayDive : diving;
  const dive = fired && tirado ? estirada(fired.keeper) : null;
  const benji = dive ?? {
    x: BENJI_DE_PIE.x + (fired ? 0 : lean),
    y: BENJI_DE_PIE.y,
    pose: 'espera' as PoseBenjiId,
    transform: 'translate(-50%, -50%)',
    flip: 1,
  };

  const outcome = seen && fired && !replaying ? fired.shot.outcome : null;
  const landing = route ? route.points[route.arrive] : null;

  return (
    <div
      ref={scene}
      className={`relative aspect-[4/3] select-none overflow-hidden bg-[#0b1220] ${outcome === 'gol' ? 'animate-temblor' : ''}`}
    >
      <Estadio className="absolute inset-0 h-full w-full" name={name} color={ROPA_FAMILIA[kid]} />

      {/* Partido de noche: el cielo apagado, los focos de las torres, los
          flashes de la grada, la luz sobre el césped y el viñeteado de la
          cámara. Todo por encima del estadio y por debajo de los jugadores. */}
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

      {/* Los rayos del anime, detrás de todo, cuando se carga la fuerza.
          Giran despacio, y con el especial armado son de su color. */}
      {step === 'fuerza' && (
        <div
          aria-hidden
          className={`pointer-events-none absolute -inset-1/4 animate-girar mix-blend-screen ${
            special ? 'opacity-50' : 'opacity-15'
          }`}
          style={{
            backgroundImage: `repeating-conic-gradient(from 0deg at 50% 50%, ${special ? color : 'rgba(255,255,255,0.7)'} 0deg 4deg, transparent 4deg 13deg)`,
          }}
        />
      )}

      {/* La superficie de puntería: toda la mitad de arriba, no sólo la
          boca. Con el dedo encima de la portería se tapa lo que se apunta,
          así que se puede apuntar tocando alrededor y la mira se queda dentro. */}
      <div
        role="group"
        tabIndex={step === 'apuntar' ? 0 : -1}
        aria-label={`Portería. La mira está en ${Math.round(aim.x)} por ciento de izquierda a derecha y ${Math.round(aim.y)} por ciento de arriba abajo. Muévela con las flechas.`}
        onPointerDown={(event) => {
          if (step !== 'apuntar') return;
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          point(event);
        }}
        onPointerMove={(event) => {
          if (step === 'apuntar' && dragging.current) point(event);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        className={`absolute inset-x-0 top-0 z-10 h-[64%] outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-amber-300/70
                    ${step === 'apuntar' ? 'cursor-crosshair touch-none' : ''}`}
      />

      {/* Benji. Cuando espera, en la línea, cargado hacia su lado y
          balanceándose; cuando vuela, con su pose de estirada. */}
      <div
        className={`pointer-events-none absolute transition-all ease-out ${
          replaying ? 'duration-700' : dive ? 'duration-300' : 'duration-500'
        } ${aiming ? 'animate-vaiven' : ''}`}
        style={{
          left: `${benji.x}%`,
          top: `${benji.y}%`,
          width: `${BENJI_ANCHO}%`,
          aspectRatio: '160 / 150',
          transform: aiming ? undefined : benji.transform,
        }}
      >
        <div className="h-full w-full" style={{ transform: `scaleX(${benji.flip})` }}>
          <Benji pose={benji.pose} className="h-full w-full [filter:drop-shadow(0_2px_0_rgba(0,0,0,0.35))_drop-shadow(0_0_3px_rgba(190,255,214,0.45))]" />
        </div>
      </div>

      {/* El aviso: flechas a los pies de Benji hacia el lado al que se carga. */}
      {aiming && tell !== 'centro' && (
        <div
          aria-hidden
          className="pointer-events-none absolute flex animate-pulse gap-0.5 font-black text-amber-300
                     drop-shadow-[0_1px_0_#241a14] [font-size:clamp(14px,4.2vw,22px)]"
          style={{
            left: `${BENJI_DE_PIE.x + lean * 2.6}%`,
            top: `${BOCA.top + BOCA.height - 7}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {tell === 'izquierda' ? '◀◀' : '▶▶'}
        </div>
      )}

      {/* El cerco del desvío: si se pasa de fuerza, adónde se sube el balón y
          cuánto se puede abrir, a un lado o a otro. */}
      {ghost && (
        <>
          <svg aria-hidden className="pointer-events-none absolute inset-0 z-20 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line
              x1={mira.x}
              y1={mira.y}
              x2={ghost.x}
              y2={ghost.y}
              stroke="#fb7185"
              strokeWidth="0.5"
              strokeDasharray="1.2 1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div
            aria-hidden
            className="pointer-events-none absolute z-20 rounded-[50%] border-2 border-dashed border-rose-400 bg-rose-500/15"
            style={{
              left: `${ghost.x}%`,
              top: `${ghost.y}%`,
              width: `${spread}%`,
              aspectRatio: '1.7 / 1',
              transform: 'translate(-50%, -50%)',
            }}
          />
        </>
      )}

      {/* La mira: aro con cuatro marcas, del color de la fuerza mientras se
          carga. Va con doble aro —tinta fuera, color dentro— para leerse igual
          sobre la red oscura que sobre la camiseta de Benji. */}
      {aiming && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 transition-[left,top] duration-150"
          style={{ left: `${mira.x}%`, top: `${mira.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          <span className="relative flex h-12 w-12 items-center justify-center">
            {step === 'apuntar' && (
              <span className="absolute -inset-1.5 animate-ping rounded-full border-2 border-white/70" />
            )}
            <span className="absolute inset-0 rounded-full border-[3px] border-[#0b1220]/80" />
            <span className="absolute inset-[3px] rounded-full border-[3px] transition-colors" style={{ borderColor: ring }} />
            {[0, 90, 180, 270].map((deg) => (
              <span
                key={deg}
                className="absolute left-1/2 top-1/2 h-[3px] w-3 -translate-y-1/2 rounded-full"
                style={{
                  backgroundColor: ring,
                  transform: `rotate(${deg}deg) translateX(1.35rem)`,
                  transformOrigin: '0 50%',
                }}
              />
            ))}
            <span className="relative h-2 w-2 rounded-full border border-[#0b1220] bg-white" />
          </span>
          {charging && (
            <span
              className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px]
                         font-black uppercase tracking-wider text-[#0b1220]"
              style={{ backgroundColor: ring }}
            >
              {zone === 'buena' ? 'Perfecta' : zone === 'pasado' ? 'Te pasas' : 'Floja'}
            </span>
          )}
        </div>
      )}

      {/* La red que se hincha donde ha entrado. */}
      {outcome === 'gol' && landing && (
        <div
          aria-hidden
          className="pointer-events-none absolute h-[26%] w-[20%] animate-onda"
          style={{ left: `${landing.x}%`, top: `${landing.y}%` }}
        >
          <RedHinchada className="h-full w-full" />
        </div>
      )}

      {/* El balón, con su estela mientras vuela. Con el especial, de su color. */}
      <div
        ref={ballRef}
        aria-hidden
        className="pointer-events-none absolute z-20 w-[7.5%]"
        style={{
          left: `${rest.x}%`,
          top: `${rest.y}%`,
          transform: `translate(-50%, -50%) scale(${rest.s})`,
        }}
      >
        {inFlight && (
          <span
            className={`absolute -z-10 rounded-full blur-[3px] ${special ? '-inset-[55%] opacity-95' : '-inset-[35%] opacity-70'}`}
            style={{ backgroundColor: special ? color : '#fff' }}
          />
        )}
        <Balon className="h-auto w-full drop-shadow-[0_2px_0_rgba(0,0,0,0.3)]" />
      </div>

      {/* Las sombras en el césped: sin ellas los dos parecen pegatinas
          puestas encima del campo en vez de estar de pie en él. */}
      <div aria-hidden className="pointer-events-none absolute bottom-[3.4%] left-[13%] h-[2.2%] w-[13%] rounded-[50%] bg-black/40 blur-[2px]" />
      <div
        aria-hidden
        className="pointer-events-none absolute h-[1.6%] w-[9%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-[2px]"
        style={{ left: `${benji.x}%`, top: `${BENJI_DE_PIE.y + 11.4}%` }}
      />

      {/* El que tira, a su tamaño en el campo. */}
      <div
        // A su tamaño en el campo: puesto junto al balón y sin tapar la
        // portería, que es lo que hay que mirar.
        className="pointer-events-none absolute bottom-[3%] left-[11%] h-[46%] [filter:drop-shadow(0_3px_3px_rgba(0,0,0,0.4))_drop-shadow(0_0_4px_rgba(190,255,214,0.4))]"
        style={{ aspectRatio: '120 / 210' }}
      >
        <Chutador
          who={who}
          pose={
            step === 'apuntar'
              ? 'espera'
              : step === 'fuerza' || step === 'corte'
                ? 'carrera'
                : outcome === 'gol'
                  ? 'celebra'
                  : 'golpeo'
          }
          className="h-full w-full"
          aura={special && (step === 'fuerza' || step === 'corte' || inFlight) ? color : undefined}
        />
      </div>

      {/* Y el estallido del golpeo, un instante. */}
      {inFlight && (
        <div
          aria-hidden
          className="pointer-events-none absolute h-[30%] w-[22%] -translate-x-1/2 -translate-y-1/2 animate-chispazo"
          style={{ left: `${PUNTO.x}%`, top: `${PUNTO.y}%` }}
        >
          <Impacto className="h-full w-full" color={special ? color : '#fff8d6'} />
        </div>
      )}

      {/* La barra de potencia, abajo a la derecha, como en la consola: la
          franja buena marcada siempre —esto no es adivinar— y el relleno
          subiendo mientras se mantiene. */}
      {aiming && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#0b1220]/95 via-[#0b1220]/70 to-transparent
                      px-[3%] pb-[2.5%] pt-[6%] transition-opacity ${charging ? 'opacity-100' : 'opacity-90'}`}
        >
          <div className="ml-auto w-[54%] min-w-[9rem]">
          <div className="mb-0.5 flex items-end justify-end gap-2 px-0.5 text-[clamp(8px,2.2vw,11px)] font-black uppercase tracking-[0.14em] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
            <span>Potencia</span>
            {charging && (
              <span style={{ color: ring }}>{zone === 'buena' ? '¡Ahora!' : zone === 'pasado' ? 'Demasiada' : `${power}`}</span>
            )}
          </div>
          <div className="relative h-[clamp(12px,3.4vw,18px)] -skew-x-12 overflow-hidden rounded-[3px] border-2 border-[#0b1220] bg-[#0b1220]/80 shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
            <div className="absolute inset-y-0 bg-emerald-400/45" style={{ left: `${band[0]}%`, width: `${band[1] - band[0]}%` }} />
            <div className="absolute inset-y-0 border-x-2 border-emerald-300" style={{ left: `${band[0]}%`, width: `${band[1] - band[0]}%` }} />
            {/* El degradado es de la barra entera y el relleno sólo lo destapa:
                así el rojo no aparece hasta que de verdad se pasa. */}
            <div
              className="absolute inset-0 bg-gradient-to-r from-amber-100 via-amber-400 to-rose-500"
              style={{ clipPath: `inset(0 ${100 - power}% 0 0)` }}
            />
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="absolute inset-y-0 w-px bg-[#0b1220]/50" style={{ left: `${(i + 1) * 10}%` }} />
            ))}
            <div className="absolute inset-y-[-2px] w-[3px] bg-white shadow-[0_0_6px_white]" style={{ left: `calc(${power}% - 1px)` }} />
          </div>
          </div>
        </div>
      )}
      <span className="sr-only" role="progressbar" aria-label="Fuerza del tiro" aria-valuenow={power} aria-valuemin={0} aria-valuemax={100} />

      {/* El primer plano de la cara mientras se coge fuerza: la viñeta que
          corta la acción en la serie antes de cada tiro. */}
      {step === 'fuerza' && (
        <div className="pointer-events-none absolute bottom-[17%] right-[6%] w-[21%] -rotate-3 animate-pop">
          <Vineta who={who} className="aspect-square w-full border-[3px] border-[#241a14] shadow-[3px_3px_0_#241a14]" />
        </div>
      )}

      {/* El corte del tiro especial: la pantalla entera se va a su fondo, la
          cara del que tira entra de lado y el nombre del tiro, a gritos. */}
      {step === 'corte' && kind !== 'normal' && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden bg-[#241a14]">
          <FondoTiro kind={kind} className="absolute inset-0 h-full w-full animate-pop" />
          <div className="absolute inset-y-[8%] left-[6%] w-[42%] animate-entra">
            <Vineta who={who} className="h-full w-full border-4 border-[#241a14] shadow-[5px_5px_0_#241a14]" />
          </div>
          <p
            className="absolute inset-x-[4%] bottom-[8%] animate-golpe text-right font-manga text-[clamp(26px,8.4vw,48px)]
                       leading-[0.95] tracking-wide text-white [paint-order:stroke] [-webkit-text-stroke:7px_#241a14]"
          >
            {SHOT_TYPES[kind].shout}
          </p>
        </div>
      )}

      {/* La repetición: bandas negras de cine y el rótulo de la cadena. */}
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

      {/* El resultado: un fogonazo y el rótulo de la tele entrando de lado,
          con su brillo; debajo, quién y con qué. */}
      {outcome && fired && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 animate-fogonazo bg-white" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[57%] z-30 flex flex-col items-center">
            <div
              className={`relative animate-rotulo overflow-hidden px-[8%] py-1 [clip-path:polygon(4%_0,100%_0,96%_100%,0_100%)]
                ${
                  outcome === 'gol'
                    ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400'
                    : outcome === 'parada'
                      ? 'bg-gradient-to-r from-sky-600 via-[#0b1220] to-sky-600'
                      : 'bg-gradient-to-r from-slate-600 via-slate-800 to-slate-600'
                }`}
            >
              <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-barrido bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              <p className="relative font-manga text-[clamp(34px,11vw,64px)] leading-none tracking-wide text-white [paint-order:stroke] [-webkit-text-stroke:6px_#241a14]">
                {TITULAR[outcome]}
              </p>
            </div>
            <p className="-mt-0.5 animate-floatUp bg-[#0b1220] px-3 py-1 text-[clamp(10px,2.8vw,13px)] font-black uppercase tracking-[0.14em] text-white [animation-delay:180ms]">
              {subtitulo(outcome, shooterName, fired.kind)} · {penalty}/{PENALTY_SHOTS}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * La carta
 *
 * La ficha de un jugador con su media, su puesto y tres cifras, recortada en
 * escudo y en dorado; los de casa, en la carta especial.
 * ------------------------------------------------------------------------- */

function Carta({
  id,
  label,
  picked,
  casa,
  onClick,
}: {
  id: TiradorId;
  label: string;
  picked: boolean;
  casa: boolean;
  onClick: () => void;
}) {
  const ficha = fichaDe(id);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={picked}
      aria-label={`${label}, media ${ficha.media}, ${ficha.pos}`}
      className={`relative w-[7.25rem] shrink-0 snap-center transition-transform duration-200 sm:w-[calc(20%-0.6rem)]
        ${picked ? 'z-10 -translate-y-1 scale-[1.04]' : 'opacity-80 hover:opacity-100'}`}
    >
      <span
        className={`relative block aspect-[3/4.2] overflow-hidden p-[3px]
          [clip-path:polygon(50%_0,100%_7%,100%_88%,50%_100%,0_88%,0_7%)]
          ${picked ? 'bg-white' : 'bg-black/30'}`}
      >
        <span
          className={`relative flex h-full flex-col items-center overflow-hidden px-1.5 pt-2.5
            [clip-path:polygon(50%_0,100%_7%,100%_88%,50%_100%,0_88%,0_7%)]
            ${
              casa
                ? 'bg-gradient-to-br from-fuchsia-500 via-violet-700 to-indigo-900 text-amber-200'
                : 'bg-gradient-to-br from-amber-100 via-amber-300 to-amber-600 text-[#3b2708]'
            }`}
        >
          {/* El brillo de la carta. */}
          <span aria-hidden className="pointer-events-none absolute -inset-1/2 rotate-12 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          <span className="absolute left-2 top-3 flex flex-col items-center leading-none">
            <span className="text-[22px] font-black tabular-nums">{ficha.media}</span>
            <span className="text-[10px] font-black tracking-wider">{ficha.pos}</span>
          </span>
          <span className="relative ml-auto mt-0.5 block w-[64%] overflow-hidden rounded-full ring-2 ring-black/20">
            <Vineta who={id} rayas={false} className="aspect-square w-full" />
          </span>
          <span className="relative mt-1 block w-full truncate text-center text-[12px] font-black uppercase leading-tight tracking-wide">
            {label}
          </span>
          <span className="relative mt-0.5 h-px w-4/5 bg-current opacity-30" />
          <span className="relative mt-1 grid w-full grid-cols-3 text-center text-[10px] font-black leading-tight">
            {(
              [
                ['TIR', ficha.tir],
                ['POT', ficha.pot],
                ['PRE', ficha.pre],
              ] as const
            ).map(([k, v]) => (
              <span key={k}>
                <span className="block tabular-nums">{v}</span>
                <span className="block text-[8px] opacity-70">{k}</span>
              </span>
            ))}
          </span>
        </span>
      </span>
      {picked && (
        <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400 text-xs font-black text-emerald-950 shadow">
          ✓
        </span>
      )}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * La presentación
 *
 * Antes del primer penalti: el cara a cara de la serie con las dos caras
 * partidas en diagonal, la elección del que tira en cartas y cómo se juega.
 * Sale una vez por tanda —al empezarla— y no entre penalti y penalti.
 * ------------------------------------------------------------------------- */

function CaraACara({
  who,
  shooter,
  onPick,
  name,
  onStart,
}: {
  who: Casero;
  shooter: TiradorId;
  onPick: (id: TiradorId) => void;
  name: string;
  onStart: () => void;
}) {
  const player = tiradorDe(shooter);
  const shooterName = shooter === who ? name : (player.name ?? name);
  const tagline = shooter === who ? 'Tú mismo, con tu dorsal' : player.tagline;
  const options: TiradorId[] = [who, ...SERIE_ORDER];
  const ficha = fichaDe(shooter);

  return (
    <div className={`${manga.variable} mx-auto w-full max-w-2xl space-y-3`}>
      {/* El cara a cara de la serie: las dos caras partidas en diagonal. */}
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-[#241a14] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] ring-1 ring-black/40">
        <div className="absolute inset-0 animate-entra [clip-path:polygon(0_0,62%_0,38%_100%,0_100%)]">
          <div className="absolute inset-y-0 left-0 w-[62%]">
            <Vineta key={shooter} who={shooter} fill className="h-full w-full" />
          </div>
        </div>
        <div className="absolute inset-0 animate-entra-dcha [clip-path:polygon(62%_0,100%_0,100%_100%,38%_100%)]">
          <div className="absolute inset-y-0 right-0 w-[62%]">
            <Vineta who="benji" fill className="h-full w-full" />
          </div>
        </div>
        <div className="absolute inset-0 bg-[#241a14] [clip-path:polygon(61%_0,63%_0,39%_100%,37%_100%)]" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 pb-4 pt-2 text-[9px] font-black uppercase tracking-[0.18em] text-white">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> En directo
          </span>
          <span>Final · tanda de penaltis</span>
        </div>
        <p
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-golpe font-manga text-6xl tracking-wide
                     text-amber-300 [paint-order:stroke] [-webkit-text-stroke:8px_#241a14]"
          aria-hidden
        >
          VS
        </p>
        <div className="absolute bottom-2 left-3 max-w-[48%]">
          <p className="font-manga text-[clamp(20px,6.5vw,32px)] leading-none tracking-wide text-white [paint-order:stroke] [-webkit-text-stroke:5px_#241a14]">
            {shooterName}
          </p>
          <p className="mt-0.5 truncate text-[10px] font-black uppercase tracking-wider text-white [paint-order:stroke] [-webkit-text-stroke:3px_#241a14]">
            {ficha.media} · {ficha.pos} · {tagline}
          </p>
        </div>
        <p className="absolute bottom-2 right-3 text-right font-manga text-[clamp(20px,6.5vw,32px)] leading-none tracking-wide text-white [paint-order:stroke] [-webkit-text-stroke:5px_#241a14]">
          Benji
        </p>
      </div>

      {/* Quién tira: las cartas, en fila que se desliza en el móvil y en
          rejilla en el ordenador. */}
      <div>
        <p className="mb-1.5 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.14em] t-3">
          <span>Elige quién tira</span>
          <span className="normal-case tracking-normal sm:hidden">desliza →</span>
        </p>
        <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2 pt-3 sm:mx-0 sm:flex-wrap sm:justify-center sm:gap-3 sm:overflow-visible sm:px-0">
          {options.map((id) => (
            <Carta
              key={id}
              id={id}
              label={id === who ? name : (tiradorDe(id).short ?? tiradorDe(id).name ?? id)}
              picked={id === shooter}
              casa={id === who}
              onClick={() => onPick(id)}
            />
          ))}
        </div>
      </div>

      {/* Cómo se juega, en tres pasos, y el truco. */}
      <div className="rounded-2xl p-3 text-white" style={{ backgroundColor: NOCHE }}>
        <ol className="grid grid-cols-3 gap-2 text-center text-[11px] font-black leading-tight">
          {[
            ['🎯', 'Apunta', 'toca la portería'],
            ['✊', 'Mantén', 'se carga la potencia'],
            ['🟩', 'Suelta', 'en la franja verde'],
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
          <span className="font-black text-amber-300">El truco:</span> Benji se carga hacia un lado antes de tirarse; tira
          al otro. Cada gol da <span className="font-black text-amber-300">⚡</span> para los tiros de la serie (empiezas
          con {ENERGY_START}).
        </p>
        <p className="mt-1.5 hidden text-[11px] text-white/60 md:block">
          En el ordenador: flechas para apuntar y la barra espaciadora mantenida para chutar.
        </p>
      </div>

      <button
        type="button"
        onClick={onStart}
        autoFocus
        className="flex min-h-[4rem] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-200
                   to-amber-400 px-4 font-manga text-3xl tracking-wide text-[#241a14] shadow-[0_5px_0_rgba(0,0,0,0.45)]
                   active:translate-y-[3px] active:shadow-[0_2px_0_rgba(0,0,0,0.45)]"
      >
        ¡Al punto de penalti!
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * El resumen de la tanda
 *
 * Como el de la tele al acabar: el resultado con los dos escudos, la tanda
 * tiro a tiro, tres cifras y la nota del que ha tirado.
 * ------------------------------------------------------------------------- */

function Final({
  who,
  shooterName,
  scored,
  result,
  history,
  firstShown,
  onClose,
}: {
  who: TiradorId;
  shooterName: string;
  scored: number;
  result: PenaltyResult | null;
  history: PenaltyOutcome[];
  firstShown: number;
  onClose: () => void;
}) {
  const good = scored >= Math.ceil(PENALTY_SHOTS / 2);
  const saved = PENALTY_SHOTS - scored;
  const specials = result?.specials ?? [];
  const nota = Math.min(10, 4.5 + scored * 1.1).toFixed(1).replace('.', ',');
  const color = colorDe(who);

  return (
    <div className={`${manga.variable} mx-auto w-full max-w-2xl space-y-3`}>
      <div className="overflow-hidden rounded-2xl text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] ring-1 ring-black/40" style={{ backgroundColor: NOCHE }}>
        <div className="flex items-center justify-between px-3 pt-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
          <span>Final de la tanda</span>
          {scored >= 4 && <span className="rounded bg-amber-300 px-1.5 py-0.5 text-[#241a14]">⭐ Jugador del partido</span>}
        </div>

        {/* El resultado, con el que tira celebrando o esperando detrás. */}
        <div className="relative mt-1 aspect-[16/7] overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 opacity-50"
            style={{ background: `radial-gradient(circle at 22% 60%, ${color} 0, transparent 55%), radial-gradient(circle at 80% 60%, #f59e0b 0, transparent 50%)` }}
          />
          <div aria-hidden className="absolute -inset-1/2 animate-girar opacity-20 bg-[repeating-conic-gradient(from_0deg_at_50%_50%,rgba(255,255,255,0.8)_0deg_5deg,transparent_5deg_15deg)]" />
          <div className="absolute bottom-[-16%] left-[2%] h-[112%] animate-pop" style={{ aspectRatio: '120 / 210' }}>
            <Chutador who={who} pose={good ? 'celebra' : 'espera'} className="h-full w-full" />
          </div>
          <div className="absolute inset-y-0 right-[4%] flex flex-col items-end justify-center">
            <p className="text-[11px] font-black uppercase tracking-[0.16em]">
              {siglas(shooterName)} <span className="text-white/50">vs</span> BEN
            </p>
            <p className="animate-golpe font-manga text-[clamp(56px,17vw,96px)] leading-none tracking-wide tabular-nums text-amber-300 [paint-order:stroke] [-webkit-text-stroke:7px_#241a14]">
              {scored}–{saved}
            </p>
          </div>
        </div>

        {/* La tanda, tiro a tiro. */}
        <div className="flex items-center justify-center gap-1.5 border-t border-white/10 px-3 py-2.5">
          {Array.from({ length: PENALTY_SHOTS }, (_, i) => {
            const known = i >= firstShown ? history[i - firstShown] : undefined;
            const goal = known ? known === 'gol' : undefined;
            return (
              <span
                key={i}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black
                  ${goal === true ? 'bg-emerald-400 text-emerald-950' : goal === false ? 'bg-rose-500' : 'bg-white/20'}`}
                title={known ? TITULAR[known] : undefined}
              >
                {goal === true ? '✓' : goal === false ? '✕' : i + 1}
              </span>
            );
          })}
        </div>

        <dl className="grid grid-cols-3 border-t border-white/10 text-center">
          {(
            [
              ['Goles', `${scored}/${PENALTY_SHOTS}`],
              ['Especiales', String(specials.length)],
              ['Nota', nota],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="border-r border-white/10 py-2.5 last:border-r-0">
              <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">{k}</dt>
              <dd className="text-xl font-black tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="text-center">
        <p className="font-display text-xl font-black t-1">
          {scored === PENALTY_SHOTS ? '🏆 ' : ''}
          {scored} de {PENALTY_SHOTS} dentro
        </p>
        <p className="mt-1 text-sm t-2">{penaltyVerdict(scored, PENALTY_SHOTS)}</p>
        {specials.length > 0 && (
          <p className="mt-1 text-[12px] t-3">
            Tiros de la serie: {specials.map((k) => `${SHOT_TYPES[k].icon} ${SHOT_TYPES[k].name}`).join(' · ')}
          </p>
        )}
      </div>

      <p className="text-center text-[11px] leading-snug t-3">
        Una tanda al día. Mañana hay otras cinco preguntas, otro día que hacer y Benji esperando.
      </p>

      <button
        type="button"
        onClick={onClose}
        autoFocus
        className="flex min-h-[3.5rem] w-full items-center justify-center rounded-2xl px-4 text-base font-black uppercase
                   tracking-wide text-white shadow-[0_5px_0_rgba(0,0,0,0.45)] active:translate-y-[3px]
                   active:shadow-[0_2px_0_rgba(0,0,0,0.45)]"
        style={{ backgroundColor: NOCHE }}
      >
        Cerrar
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * El selector de tiros
 *
 * Los ocho como el menú de técnicas de un videojuego: su icono, su nombre y
 * lo que cuestan en rayos, y debajo qué hace el elegido. Los que no se pueden
 * tirar se ven igual —para saber que existen y qué falta— pero apagados y con
 * el motivo: ya usado, o falta energía.
 * ------------------------------------------------------------------------- */

function SelectorTiros({
  result,
  kind,
  onPick,
  locked,
}: {
  result: PenaltyResult | null;
  kind: ShotKind;
  onPick: (kind: ShotKind) => void;
  locked: boolean;
}) {
  const energy = energyLeft(result);
  const picked = SHOT_TYPES[kind];

  return (
    <div className="rounded-2xl p-2 text-white" style={{ backgroundColor: NOCHE }}>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">Técnica de tiro</span>
        <span className="flex items-center gap-1.5 text-[11px] font-black" aria-label={`Energía: ${energy}`}>
          <span className="text-white/70">Energía</span>
          <span className="flex gap-0.5" aria-hidden>
            {Array.from({ length: Math.max(energy, 0) }, (_, i) => (
              <span key={i} className="h-3 w-2 -skew-x-12 rounded-sm bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.7)]" />
            ))}
          </span>
          <span className="tabular-nums text-amber-300">{Math.max(energy, 0)}</span>
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {SHOT_ORDER.map((id) => {
          const shot = SHOT_TYPES[id];
          const { ok, reason } = shotAvailability(id, result);
          const chosen = id === kind;

          return (
            <button
              key={id}
              type="button"
              data-tiro
              disabled={!ok || locked}
              onClick={() => onPick(id)}
              aria-pressed={chosen}
              aria-label={`${shot.name}${shot.cost ? `, cuesta ${shot.cost} de energía` : ''}${
                reason === 'usado' ? ', ya usado' : reason === 'energia' ? ', falta energía' : ''
              }`}
              className={`relative flex min-h-[4.1rem] min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl px-0.5
                pb-1 pt-1.5 text-center transition-transform
                ${chosen ? 'scale-[1.04] ring-2 ring-white' : 'ring-1 ring-white/10'}
                ${!ok ? 'opacity-35 grayscale' : ''}`}
              style={{
                background: chosen
                  ? `linear-gradient(180deg, ${shot.color}, ${shot.color}cc)`
                  : `linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))`,
              }}
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: shot.color }} />
              <span className="text-xl leading-none" aria-hidden>
                {shot.icon}
              </span>
              <span className={`w-full truncate text-[10px] font-black leading-[1.1] ${chosen ? 'text-[#241a14]' : 'text-white'}`}>
                {shot.short}
              </span>
              <span className={`text-[9px] font-black leading-none ${chosen ? 'text-[#241a14]' : 'text-amber-300'}`}>
                {reason === 'usado' ? 'usado' : shot.cost ? '⚡'.repeat(shot.cost) : 'gratis'}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 min-h-[2.2em] px-1 text-[11px] leading-snug text-white/80">
        <span className="font-black" style={{ color: kind === 'normal' ? '#fcd34d' : picked.color }}>
          {picked.icon} {picked.name}:
        </span>{' '}
        {picked.blurb}
      </p>
    </div>
  );
}
