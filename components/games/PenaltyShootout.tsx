'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  Balon,
  Benji,
  Chutador,
  Estadio,
  Impacto,
  RedHinchada,
  Vineta,
  type PoseBenjiId,
} from '@/components/games/PenaltyArt';
import {
  PENALTY_SHOTS,
  SUPER_FROM,
  SUPER_NAME,
  keeperTell,
  keeperZone,
  penaltyVerdict,
  powerBand,
  resolveShot,
  superReady,
  zoneOf,
} from '@/lib/penalties';
import type { PenaltyAim, PenaltyOutcome, PenaltyShot, PenaltySide, PenaltyZoneId } from '@/lib/penalties';
import { hashSeed } from '@/lib/challenges';
import { ROPA_FAMILIA, type Casero } from '@/lib/cromoArt';
import { playCue } from '@/lib/sound';
import type { DateKey, PenaltyResult, ProfileId } from '@/types';

/* =========================================================================
 *  Tirar los cinco penaltis contra Benji.
 *
 *  Un penalti son tres gestos y los tres pasan **dentro de la escena**:
 *  tocar la portería para **colocar** la mira, **mantener pulsado** para
 *  cargar la fuerza —la barra está en el propio campo, al lado del que
 *  tira— y **soltar** para chutar. El botón de chutar dice en cada momento
 *  lo que toca: «más fuerza», «¡suelta ahora!» o «¡te pasas!», con su color.
 *  A los ocho años nadie lee una leyenda debajo de una barra; un botón que
 *  se pone verde cuando hay que soltar, sí.
 *
 *  La pieza que lo convierte en habilidad y no en sorteo es **el aviso del
 *  portero**: antes de cada tiro Benji se carga hacia el lado por el que va
 *  a volar, se le ven las flechas a los pies y lo dice el narrador. Leerlo y
 *  tirar al otro lado es la lección entera del penalti, la misma que se grita
 *  desde la banda, y es lo que hace que la segunda tanda salga mejor.
 *
 *  Y con dos goles se carga **el tiro especial**, uno por tanda. No es un
 *  botón de ganar: el portero ya casi no llega, pero hay que pegarle fuerte
 *  y clavado —la franja buena se estrecha y se sube—, así que guardárselo
 *  para el penalti que decide es una decisión de verdad.
 *
 *  El dibujo es el de Oliver y Benji: el cara a cara del principio con las
 *  dos caras partidas en diagonal, el marcador de la tele, el primer plano
 *  mientras se coge fuerza, el corte con el nombre del tiro a gritos, el
 *  balón con su estela, la red que se hincha, la pantalla que tiembla y el
 *  rótulo que entra de golpe. Nada es decoración suelta: cada cosa aparece
 *  en el momento en el que el juego necesita decir algo.
 *
 *  Y una regla que no es de adorno: **el tiro se anota al dispararse**,
 *  igual que las preguntas. Cerrar la aplicación con un penalti fallado a
 *  medias no devuelve el penalti; volver más tarde sigue la tanda por donde
 *  iba.
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
 *  · `intro`   — el cara a cara y cómo se juega. Sólo antes del primero.
 *  · `apuntar` — moviendo la mira.
 *  · `fuerza`  — con el dedo puesto: la barra corre.
 *  · `corte`   — el nombre del tiro especial a pantalla entera.
 *  · `vuelo`   — el balón va de camino y Benji se tira.
 *  · `visto`   — ya ha acabado, y se explica por qué.
 */
type Step = 'intro' | 'apuntar' | 'fuerza' | 'corte' | 'vuelo' | 'visto';

/** Cuánto tarda el balón en llegar. */
const VUELO_MS = 720;

/** Lo que dura el corte del tiro especial. */
const CORTE_MS = 950;

/** Lo que tarda Benji en reaccionar: se tira cuando el balón ya ha salido. */
const REFLEJO_MS = 110;

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

const TITULAR: Record<PenaltyOutcome, string> = {
  gol: '¡GOOOOL!',
  parada: '¡PARADÓN DE BENJI!',
  fuera: '¡FUERA!',
  poste: '¡AL PALO!',
};

const MARCA: Record<PenaltyOutcome, string> = {
  gol: '✓',
  parada: '✕',
  fuera: '✕',
  poste: '✕',
};

/** El timbre del narrador justo al chutar. */
function grito(name: string, special: boolean): string {
  return special ? `¡${name} saca el ${SUPER_NAME.toLowerCase()}!` : `¡${name} chuta…!`;
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

  const [step, setStep] = useState<Step>(done ? 'visto' : taken === 0 ? 'intro' : 'apuntar');
  const [aim, setAim] = useState<PenaltyAim>({ x: 50, y: 50 });
  const [power, setPower] = useState(0);

  /**
   * Si este tiro va a ser el especial. Se arma antes de coger fuerza y se
   * queda armado hasta que sale el balón: cambiar de idea con el dedo ya
   * puesto sería tirar dos penaltis distintos con el mismo gesto.
   */
  const [special, setSpecial] = useState(false);
  const armed = superReady(result);

  /**
   * El penalti ya tirado: adónde voló el portero y en qué acabó.
   *
   * Se guarda entero al disparar, y no se recalcula al pintar, porque en
   * cuanto el tiro queda anotado el contador sube y el portero que tocaría
   * ya es el del penalti siguiente. Recalculándolo, el guante aparecía en un
   * sitio y la explicación contaba otro.
   */
  const [fired, setFired] = useState<{ keeper: PenaltyZoneId; shot: PenaltyShot; special: boolean } | null>(null);

  /** Si Benji ya ha arrancado a tirarse: medio instante después del golpeo. */
  const [diving, setDiving] = useState(false);

  /**
   * Cómo acabó cada tiro de los que se han tirado **con esta pantalla
   * abierta**. Lo guardado en el día sólo dice cuántos entraron, no cuáles;
   * los de antes de cerrar la app salen en el marcador como tirados, sin más.
   */
  const [history, setHistory] = useState<PenaltyOutcome[]>([]);
  const [firstShown] = useState(taken);

  /** El portero de este penalti: decidido de antemano, y con su aviso. */
  const keeper = keeperZone(profileId, date, taken);
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
    // El especial va más rápido: la franja es más estrecha y encima pasa
    // antes, que es lo que hace que tirarlo cueste algo.
    const sweep = special ? 950 : 1250;

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
  }, [step, special]);

  /* ------------------------------------------------------------- el disparo */

  const charge = useCallback(() => {
    if (step !== 'apuntar') return;
    charged.current = 0;
    setStep('fuerza');
  }, [step]);

  const fire = useCallback(() => {
    if (step !== 'fuerza') return;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);

    // La semilla del tiro decide hacia qué lado se abre un balón reventado.
    // Va con el perfil, el día y el número de tiro para que el mismo penalti
    // dé siempre lo mismo, como las preguntas.
    const seed = hashSeed(`${profileId}:desvio:${date}:${taken}`);
    const outcome = resolveShot(aim, charged.current, keeper, seed, special);

    setPower(charged.current);
    setFired({ keeper, shot: outcome, special });
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
    }, kick + VUELO_MS);

    onShot({
      scored: scored + (outcome.outcome === 'gol' ? 1 : 0),
      taken: taken + 1,
      total: PENALTY_SHOTS,
      at: new Date().toISOString(),
      // El especial se gasta al tirarlo, salga como salga. Se guarda con la
      // tanda para que cerrar la app entre dos penaltis no regale otro.
      supered: (result?.supered ?? false) || special,
    });
    // `later` sólo empuja a una lista: no cambia entre pintadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aim, date, keeper, onShot, profileId, result, scored, special, step, taken]);

  const next = () => {
    setAim({ x: 50, y: 50 });
    setFired(null);
    setDiving(false);
    setPower(0);
    setSpecial(false);
    setStep('apuntar');
  };

  /** Mover la mira con las flechas: el camino del teclado. */
  const onKeys = (event: React.KeyboardEvent) => {
    if (step !== 'apuntar') return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-8, 0],
      ArrowRight: [8, 0],
      ArrowUp: [0, -12],
      ArrowDown: [0, 12],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setAim((current) => ({
      x: Math.max(3, Math.min(97, current.x + move[0])),
      y: Math.max(3, Math.min(97, current.y + move[1])),
    }));
  };

  /* ---------------------------------------------------------------- pintura */

  if (done && !fired) return <Final who={who} scored={scored} name={name} onClose={onClose} />;

  if (step === 'intro') return <CaraACara who={who} name={name} onStart={() => setStep('apuntar')} />;

  const [low, high] = powerBand(fired?.special ?? special);
  const shooting = Math.min(taken + (fired ? 0 : 1), PENALTY_SHOTS);
  const aiming = step === 'apuntar' || step === 'fuerza';
  const zone = power < low ? 'flojo' : power > high ? 'pasado' : 'buena';
  const pending = step === 'corte' || step === 'vuelo';

  return (
    <div className="mx-auto max-w-xl space-y-2.5" onKeyDown={onKeys}>
      {/* Mientras el balón va de camino, el marcador sigue como estaba: el
          tiro ya está anotado, pero enseñarlo antes de que llegue a la
          portería chivaría el final. */}
      <Marcador
        who={who}
        name={name}
        taken={pending ? taken - 1 : taken}
        scored={pending && fired?.shot.outcome === 'gol' ? scored - 1 : scored}
        shooting={shooting}
        history={pending ? history.slice(0, -1) : history}
        firstShown={firstShown}
      />

      {/* La escena y el narrador van pegados, como la tele y su rótulo. */}
      <div className="overflow-hidden rounded-2xl border-2 border-[#241a14] bg-[#241a14] shadow-lg">
        <Escena
          who={who}
          name={name}
          aim={aim}
          onAim={setAim}
          step={step}
          tell={tell}
          fired={fired}
          diving={diving}
          special={fired?.special ?? special}
          power={power}
          band={[low, high]}
        />

        <p
          className="flex min-h-[3.25rem] items-center gap-2 px-3 py-2 text-[13px] font-bold leading-snug text-white"
          aria-live="polite"
        >
          <span aria-hidden className="text-lg">
            🎙️
          </span>
          <span className="min-w-0 flex-1">
            {step === 'visto' && fired ? (
              <>
                <span className="sr-only">{TITULAR[fired.shot.outcome]} </span>
                {fired.shot.why}
              </>
            ) : step === 'corte' || step === 'vuelo' ? (
              <span className="italic">{grito(name, fired?.special ?? false)}</span>
            ) : tell === 'centro' ? (
              <>
                Benji se queda <span className="text-amber-300">en el centro</span>.{' '}
                <span className="font-semibold text-white/75">Pégalo a un palo.</span>
              </>
            ) : (
              <>
                Benji se carga hacia <span className="text-amber-300">tu {tell}</span>.{' '}
                <span className="font-semibold text-white/75">¡Tira al otro lado!</span>
              </>
            )}
          </span>
        </p>
      </div>

      {aiming && (
        <div className="space-y-2">
          {/* El especial: se arma antes de coger fuerza, y se dice lo que
              cambia. Sólo aparece cuando está cargado, que es con dos goles,
              y desaparece en cuanto se gasta. */}
          {armed && (
            <button
              type="button"
              disabled={step !== 'apuntar'}
              onClick={() => setSpecial((value) => !value)}
              aria-pressed={special}
              className={`btn w-full flex-col items-start gap-0 border-2 px-3 py-2 text-left text-sm font-black
                disabled:opacity-100
                ${
                  special
                    ? 'border-amber-300 bg-gradient-to-r from-amber-400 to-rose-500 text-[#241a14]'
                    : 'border-amber-300/60 bg-amber-300/10 t-1 hover:bg-amber-300/20'
                }`}
            >
              <span>
                ⚡ {special ? `${SUPER_NAME} ARMADO` : `Usar el ${SUPER_NAME.toLowerCase()}`}
              </span>
              <span className="text-[11px] font-semibold leading-tight opacity-80">
                {special ? 'Benji casi no llega · franja estrecha' : `cargado con ${SUPER_FROM} goles · uno por tanda`}
              </span>
            </button>
          )}

          {/* Apuntar y coger fuerza comparten **el mismo botón**, y no son dos
              pantallas que se sustituyen: quien mantiene el dedo en un botón
              que desaparece se queda con el tiro a medias, porque al soltar ya
              no hay debajo lo que había al pulsar. Un solo botón que cambia de
              rótulo y de color quita el salto, y además dice cuándo soltar. */}
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
            onKeyDown={(event) => {
              if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
                event.preventDefault();
                charge();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === ' ' || event.key === 'Enter') fire();
            }}
            className={`flex min-h-[3.75rem] w-full touch-none select-none items-center justify-center gap-2
              rounded-2xl border-2 border-[#241a14] px-4 text-lg font-black uppercase tracking-wide
              shadow-[0_4px_0_#241a14] transition-colors active:translate-y-[3px] active:shadow-[0_1px_0_#241a14]
              [-webkit-touch-callout:none] [-webkit-user-select:none]
              ${
                step === 'apuntar'
                  ? special
                    ? 'bg-gradient-to-r from-amber-400 to-rose-500 text-[#241a14]'
                    : 'bg-white text-[#241a14]'
                  : zone === 'buena'
                    ? special
                      ? 'animate-latido bg-amber-300 text-[#241a14]'
                      : 'animate-latido bg-emerald-400 text-[#241a14]'
                    : zone === 'pasado'
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-600 text-white'
              }`}
          >
            {step === 'apuntar'
              ? special
                ? '⚡ Mantén pulsado'
                : '⚽ Mantén pulsado'
              : zone === 'buena'
                ? '¡Suelta ahora!'
                : zone === 'pasado'
                  ? '¡Te pasas!'
                  : 'Más fuerza…'}
          </button>

          <p className="text-center text-[11px] leading-snug t-3">
            {step === 'apuntar'
              ? 'Toca la portería para apuntar. Luego mantén el botón y suéltalo en la franja verde.'
              : 'Quedarte corto le da tiempo a Benji; pasarte sube y abre el balón.'}
          </p>
        </div>
      )}

      {(step === 'corte' || step === 'vuelo') && (
        <div
          aria-hidden
          className="flex min-h-[3.75rem] w-full items-center justify-center rounded-2xl border-2 border-dashed
                     hairline text-sm font-bold t-3"
        >
          …
        </div>
      )}

      {step === 'visto' && fired && (
        <button
          type="button"
          onClick={done ? () => setFired(null) : next}
          autoFocus
          className="flex min-h-[3.75rem] w-full animate-floatUp items-center justify-center gap-2 rounded-2xl border-2
                     border-[#241a14] bg-white px-4 text-lg font-black uppercase tracking-wide text-[#241a14]
                     shadow-[0_4px_0_#241a14] active:translate-y-[3px] active:shadow-[0_1px_0_#241a14]"
        >
          {done ? '🏁 Ver cómo ha quedado' : `Penalti ${taken + 1} ▶`}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * El marcador de la tele
 *
 * El que tira a la izquierda, con sus goles; Benji a la derecha, con los que
 * ha salvado —paradas, palos y fuera, que para el marcador es lo mismo—; y
 * en medio los cinco huecos. Plantearlo como un partido contra alguien, y no
 * como «goles de cinco», es lo que hace que una tanda se viva como una final.
 * ------------------------------------------------------------------------- */

function Marcador({
  who,
  name,
  taken,
  scored,
  shooting,
  history,
  firstShown,
}: {
  who: Casero;
  name: string;
  taken: number;
  scored: number;
  shooting: number;
  history: PenaltyOutcome[];
  /** Cuántos había tirados al abrir: de ésos no se sabe cómo acabaron. */
  firstShown: number;
}) {
  const saved = taken - scored;

  return (
    <div
      className="flex items-center gap-2 rounded-2xl border-2 border-[#241a14] bg-[#101826] p-1.5 text-white"
      aria-label={`${name} ${scored}, Benji ${saved}. Penalti ${shooting} de ${PENALTY_SHOTS}.`}
    >
      <Vineta who={who} rayas={false} className="h-9 w-9 shrink-0 rounded-lg border-2 border-white/80" />
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-black uppercase leading-none tracking-wider text-white/70">
          {name}
        </span>
        <span className="block font-display text-2xl font-black leading-none tabular-nums">{scored}</span>
      </span>

      <span className="mx-auto flex flex-col items-center gap-1">
        <span className="text-[9px] font-black uppercase leading-none tracking-[0.14em] text-amber-300">
          Penalti {shooting} de {PENALTY_SHOTS}
        </span>
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: PENALTY_SHOTS }, (_, i) => {
            const outcome = i >= firstShown ? history[i - firstShown] : undefined;
            const current = i === taken;
            return (
              <span
                key={i}
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] leading-none
                  ${
                    outcome === 'gol'
                      ? 'border-emerald-300 bg-emerald-500/30'
                      : outcome
                        ? 'border-rose-300 bg-rose-500/25'
                        : i < taken
                          ? 'border-white/50 bg-white/15'
                          : current
                            ? 'border-dashed border-amber-300'
                            : 'border-white/20'
                  }`}
              >
                {outcome ? MARCA[outcome] : i < taken ? '•' : ''}
              </span>
            );
          })}
        </span>
      </span>

      <span className="min-w-0 text-right">
        <span className="block text-[10px] font-black uppercase leading-none tracking-wider text-white/70">Benji</span>
        <span className="block font-display text-2xl font-black leading-none tabular-nums">{saved}</span>
      </span>
      <Vineta who="benji" rayas={false} className="h-9 w-9 shrink-0 rounded-lg border-2 border-white/80" />
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
  // cuerpo de un portero que estira los brazos hasta ella. Poniéndole el
  // ombligo en la escuadra, la cabeza se le salía por encima del larguero.
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
 * Por dónde va el balón, en cuatro puntos: el punto de penalti, lo alto del
 * vuelo, adonde llega y —si no es gol— adonde rebota.
 */
function trayecto(shot: PenaltyShot): { x: number; y: number; s: number }[] {
  const to = enEscena(shot.landing);
  const clamped = { x: Math.max(-6, Math.min(106, to.x)), y: Math.max(-6, to.y) };
  const apex = { x: (PUNTO.x + clamped.x) / 2, y: Math.min(PUNTO.y, clamped.y) + (PUNTO.y - clamped.y) * 0.35 - 8 };
  const out = clamped.x < 50 ? -1 : 1;

  const path = [
    { ...PUNTO, s: 1 },
    { ...apex, s: 0.72 },
    { ...clamped, s: 0.42 },
  ];

  if (shot.outcome === 'parada') path.push({ x: clamped.x + out * 12, y: 64, s: 0.55 });
  if (shot.outcome === 'poste') path.push({ x: clamped.x + out * 14, y: clamped.y + 22, s: 0.5 });
  if (shot.outcome === 'gol') path.push({ x: clamped.x, y: clamped.y + 2, s: 0.36 });

  return path;
}

function Escena({
  who,
  name,
  aim,
  onAim,
  step,
  tell,
  fired,
  diving,
  special,
  power,
  band,
}: {
  who: Casero;
  name: string;
  aim: PenaltyAim;
  onAim: (aim: PenaltyAim) => void;
  step: Step;
  tell: PenaltySide;
  fired: { keeper: PenaltyZoneId; shot: PenaltyShot; special: boolean } | null;
  diving: boolean;
  special: boolean;
  power: number;
  band: [number, number];
}) {
  const mouth = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  /** Mueve la mira al punto que se está tocando, sin salirse de la portería. */
  const point = (event: React.PointerEvent) => {
    const box = mouth.current?.getBoundingClientRect();
    if (!box) return;

    onAim({
      x: Math.max(3, Math.min(97, ((event.clientX - box.left) / box.width) * 100)),
      y: Math.max(3, Math.min(97, ((event.clientY - box.top) / box.height) * 100)),
    });
  };

  const aiming = step === 'apuntar' || step === 'fuerza';
  const flying = step === 'vuelo';
  const seen = step === 'visto';
  const path = fired ? trayecto(fired.shot) : null;
  const rest = path && (flying || seen) ? path[path.length - 1] : { ...PUNTO, s: 1 };

  // El vuelo del balón: se anima con la API del navegador en cuanto
  // arranca, y la posición de reposo que pinta React ya es la final, así que
  // al acabar la animación el balón se queda donde tiene que quedarse.
  useLayoutEffect(() => {
    if (!flying || !path || !ballRef.current) return undefined;
    const last = path.length - 1;
    const arrive = path.length > 3 ? 0.78 : 1;

    const animation = ballRef.current.animate(
      path.map((p, i) => ({
        left: `${p.x}%`,
        top: `${p.y}%`,
        transform: `translate(-50%, -50%) scale(${p.s}) rotate(${i * 330}deg)`,
        offset: i === 0 ? 0 : i === 1 ? arrive * 0.45 : i === 2 ? arrive : 1,
        easing: i === 2 && last > 2 ? 'ease-out' : 'linear',
      })),
      { duration: VUELO_MS, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)', fill: 'backwards' },
    );

    return () => animation.cancel();
    // La trayectoria sólo cambia con el tiro, y el tiro sólo con `fired`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flying, fired]);

  const mira = enEscena(aim);

  // Benji: quieto y cargado hacia su lado mientras se apunta, y volando
  // adonde le tocaba en cuanto sale el balón.
  const lean = tell === 'izquierda' ? -6 : tell === 'derecha' ? 6 : 0;
  const dive = fired && diving ? estirada(fired.keeper) : null;
  const benji = dive ?? {
    x: BENJI_DE_PIE.x + lean,
    y: BENJI_DE_PIE.y,
    pose: 'espera' as PoseBenjiId,
    transform: 'translate(-50%, -50%)',
    flip: 1,
  };

  const outcome = seen && fired ? fired.shot.outcome : null;
  const landing = fired ? trayecto(fired.shot)[2] : null;

  return (
    <div className={`relative aspect-[4/3] select-none overflow-hidden ${outcome === 'gol' ? 'animate-temblor' : ''}`}>
      <Estadio className="absolute inset-0 h-full w-full" name={name} color={ROPA_FAMILIA[who]} />

      {/* Los rayos del anime, detrás de todo, cuando se carga la fuerza.
          Giran despacio, y con el especial armado son de fuego. */}
      {step === 'fuerza' && (
        <div
          aria-hidden
          className={`pointer-events-none absolute -inset-1/4 animate-girar mix-blend-screen ${
            special
              ? 'opacity-60 bg-[repeating-conic-gradient(from_0deg_at_50%_50%,rgba(255,196,80,0.8)_0deg_4deg,transparent_4deg_13deg)]'
              : 'opacity-25 bg-[repeating-conic-gradient(from_0deg_at_50%_50%,rgba(255,255,255,0.7)_0deg_5deg,transparent_5deg_16deg)]'
          }`}
        />
      )}

      {/* La boca de la portería: la superficie de puntería. */}
      <div
        ref={mouth}
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
        className={`absolute z-10 rounded-sm outline-none focus-visible:ring-4 focus-visible:ring-amber-300/70
                    ${step === 'apuntar' ? 'cursor-crosshair touch-none' : ''}`}
        style={{
          left: `${BOCA.left}%`,
          top: `${BOCA.top}%`,
          width: `${BOCA.width}%`,
          height: `${BOCA.height}%`,
        }}
      />

      {/* Benji. Cuando espera, en la línea, cargado hacia su lado y
          balanceándose —un portero quieto no da ninguna tensión—; cuando
          vuela, con su pose de estirada. El vaivén se apaga al volar: el
          vuelo manda su propio `transform` y los dos a la vez se peleaban. */}
      <div
        className={`pointer-events-none absolute transition-all ease-out ${dive ? 'duration-300' : 'duration-500'} ${
          aiming ? 'animate-vaiven' : ''
        }`}
        style={{
          left: `${benji.x}%`,
          top: `${benji.y}%`,
          width: `${BENJI_ANCHO}%`,
          aspectRatio: '160 / 150',
          transform: aiming ? undefined : benji.transform,
        }}
      >
        <div className="h-full w-full" style={{ transform: `scaleX(${benji.flip})` }}>
          <Benji pose={benji.pose} className="h-full w-full drop-shadow-[0_3px_0_rgba(0,0,0,0.25)]" />
        </div>
      </div>

      {/* El aviso: flechas a los pies de Benji hacia el lado al que se carga.
          Es lo mismo que dice el narrador, pero dentro del campo, que es
          donde se está mirando. */}
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

      {/* La mira. Va con doble aro —tinta fuera, amarillo dentro— porque
          tiene que leerse igual sobre la red oscura que sobre la camiseta de
          Benji, que es justo donde uno querría ponerla y no verla. */}
      {aiming && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 transition-all duration-150"
          style={{ left: `${mira.x}%`, top: `${mira.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          <span className="relative flex h-11 w-11 items-center justify-center">
            {step === 'apuntar' && (
              <span className="absolute -inset-1 animate-ping rounded-full border-2 border-amber-300/80" />
            )}
            <span className="absolute inset-0 rounded-full border-[3px] border-[#241a14]" />
            <span className="absolute inset-[3px] rounded-full border-[3px] border-amber-300" />
            <span className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 bg-amber-300" />
            <span className="absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 bg-amber-300" />
            <span className="relative h-2 w-2 rounded-full border border-[#241a14] bg-white" />
          </span>
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

      {/* El balón, con su estela mientras vuela: la del anime, una cola
          blanca que dice a qué velocidad va. Con el especial, de fuego. */}
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
        {flying && (
          <span
            className={`absolute -inset-[35%] -z-10 rounded-full blur-[3px] ${
              special ? 'bg-amber-400/90' : 'bg-white/70'
            }`}
          />
        )}
        <Balon className="h-auto w-full drop-shadow-[0_2px_0_rgba(0,0,0,0.3)]" />
      </div>

      {/* El que tira, en primer plano y a su tamaño de protagonista: grande
          y pegado al borde, como en el anime, que es lo que da la sensación
          de estar detrás de él. */}
      <div
        className="pointer-events-none absolute bottom-[-2%] left-[16%] h-[56%] drop-shadow-[0_4px_4px_rgba(0,0,0,0.3)]"
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
        />
      </div>

      {/* Y el estallido del golpeo, un instante. */}
      {flying && (
        <div
          aria-hidden
          className="pointer-events-none absolute h-[30%] w-[22%] -translate-x-1/2 -translate-y-1/2 animate-chispazo"
          style={{ left: `${PUNTO.x}%`, top: `${PUNTO.y}%` }}
        >
          <Impacto className="h-full w-full" color={special ? '#fcd34d' : '#fff8d6'} />
        </div>
      )}

      {/* La barra de fuerza, de pie junto al campo: la franja buena marcada
          siempre —esto no es adivinar— y el relleno subiendo al pulsar. */}
      {aiming && (
        <div
          aria-hidden
          className={`pointer-events-none absolute bottom-[5%] right-[3%] top-[56%] w-[6%] overflow-hidden rounded-md
                      border-2 border-[#241a14] bg-[#101826]/85 transition-opacity
                      ${step === 'apuntar' ? 'opacity-70' : 'opacity-100'}`}
        >
          <div
            className={`absolute inset-x-0 ${special ? 'bg-amber-300/60' : 'bg-emerald-400/55'}`}
            style={{ bottom: `${band[0]}%`, height: `${band[1] - band[0]}%` }}
          />
          <div
            className={`absolute inset-x-0 bottom-0 ${
              power > band[1] ? 'bg-rose-500' : power >= band[0] ? 'bg-white' : 'bg-white/60'
            }`}
            style={{ height: `${power}%` }}
          />
          <div className="absolute inset-x-0 h-[3px] bg-amber-300" style={{ bottom: `calc(${power}% - 1px)` }} />
        </div>
      )}
      <span className="sr-only" role="progressbar" aria-label="Fuerza del tiro" aria-valuenow={power} aria-valuemin={0} aria-valuemax={100} />

      {/* El primer plano de la cara mientras se coge fuerza: la viñeta que
          corta la acción en la serie antes de cada tiro. Va abajo a la
          derecha, que es la esquina que no ocupan ni la portería, ni Benji,
          ni el que tira. */}
      {step === 'fuerza' && (
        <div className="pointer-events-none absolute bottom-[6%] right-[11%] w-[23%] -rotate-3 animate-pop">
          <Vineta who={who} className="aspect-square w-full border-[3px] border-[#241a14] shadow-[3px_3px_0_#241a14]" />
        </div>
      )}

      {/* El corte del tiro especial: la pantalla entera se va al fuego, la
          cara del que tira entra de lado y el nombre del tiro, a gritos. */}
      {step === 'corte' && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden bg-[#b91c1c]">
          <div className="absolute -inset-1/2 animate-girar bg-[repeating-conic-gradient(from_0deg_at_50%_50%,rgba(253,224,71,0.9)_0deg_5deg,transparent_5deg_14deg)]" />
          <div className="absolute inset-y-[8%] left-[6%] w-[46%] animate-entra">
            <Vineta who={who} className="h-full w-full border-4 border-[#241a14] shadow-[5px_5px_0_#241a14]" />
          </div>
          <p
            className="absolute inset-x-[4%] bottom-[8%] animate-golpe text-right font-display text-[clamp(22px,7vw,40px)]
                       font-black italic leading-none text-white [paint-order:stroke] [-webkit-text-stroke:6px_#241a14]"
          >
            ¡{SUPER_NAME}!
          </p>
        </div>
      )}

      {/* El resultado: un fogonazo, las rayas de impacto y el rótulo en su
          banda torcida. Entra de golpe, se pasa de tamaño y se asienta: es el
          gesto del anime, y hace que se lea el resultado sin buscarlo. */}
      {outcome && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 animate-fogonazo bg-white" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-25
                       bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.9)_0_2px,transparent_2px_9px)]"
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-[-4%] top-[60%] z-30 animate-golpe border-y-4 border-[#241a14]
                        py-1.5 text-center font-display text-[clamp(26px,8.5vw,46px)] font-black italic leading-none
                        tracking-tight text-white [paint-order:stroke] [-webkit-text-stroke:6px_#241a14]
                        ${
                          outcome === 'gol'
                            ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400'
                            : outcome === 'parada'
                              ? 'bg-gradient-to-r from-slate-600 via-[#101826] to-slate-600'
                              : 'bg-gradient-to-r from-sky-700 via-slate-800 to-sky-700'
                        }`}
          >
            {TITULAR[outcome]}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * El cara a cara
 *
 * Antes del primer penalti, la presentación de la serie: las dos caras
 * partidas en diagonal, el «VS» en medio y, debajo, cómo se juega en tres
 * gestos. Sale una vez por tanda —al empezarla— y no entre penalti y
 * penalti, que ahí lo que se quiere es tirar.
 * ------------------------------------------------------------------------- */

function CaraACara({ who, name, onStart }: { who: Casero; name: string; onStart: () => void }) {
  return (
    <div className="space-y-4">
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border-2 border-[#241a14] bg-[#241a14]">
        <div className="absolute inset-0 animate-entra [clip-path:polygon(0_0,62%_0,38%_100%,0_100%)]">
          <div className="absolute inset-y-0 left-0 w-[62%]">
            <Vineta who={who} fill className="h-full w-full" />
          </div>
        </div>
        <div className="absolute inset-0 animate-entra-dcha [clip-path:polygon(62%_0,100%_0,100%_100%,38%_100%)]">
          <div className="absolute inset-y-0 right-0 w-[62%]">
            <Vineta who="benji" fill className="h-full w-full" />
          </div>
        </div>
        {/* La raya del medio, de tinta, y el VS encima. */}
        <div className="absolute inset-0 [clip-path:polygon(61%_0,63%_0,39%_100%,37%_100%)] bg-[#241a14]" />
        <p
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-golpe font-display text-5xl font-black
                     italic text-amber-300 [paint-order:stroke] [-webkit-text-stroke:7px_#241a14]"
          aria-hidden
        >
          VS
        </p>
        <p className="absolute bottom-2 left-3 font-display text-2xl font-black uppercase italic text-white [paint-order:stroke] [-webkit-text-stroke:5px_#241a14]">
          {name}
        </p>
        <p className="absolute bottom-2 right-3 font-display text-2xl font-black uppercase italic text-white [paint-order:stroke] [-webkit-text-stroke:5px_#241a14]">
          Benji
        </p>
      </div>

      <div className="text-center">
        <p className="font-display text-xl font-black leading-tight t-1">Cinco penaltis contra Benji</p>
        <p className="mt-1 text-[13px] leading-snug t-2">El mejor portero de la serie. ¿Cuántos le metes?</p>
      </div>

      <ol className="grid grid-cols-3 gap-2 text-center">
        {[
          ['👆', 'Apunta', 'toca la portería'],
          ['✊', 'Mantén', 'el botón para cargar'],
          ['🖐️', 'Suelta', 'cuando se ponga verde'],
        ].map(([icon, title, text], i) => (
          <li key={title} className="rounded-xl border hairline surf-1 px-1.5 py-2">
            <span className="block text-2xl" aria-hidden>
              {icon}
            </span>
            <span className="mt-1 block text-xs font-black t-1">
              {i + 1}. {title}
            </span>
            <span className="block text-[11px] leading-tight t-3">{text}</span>
          </li>
        ))}
      </ol>

      <p className="rounded-xl border border-amber-300/60 bg-amber-300/10 p-3 text-[13px] font-semibold leading-snug t-1">
        👀 <span className="font-black">El truco:</span> antes de tirarse, Benji se carga hacia un lado. Míralo… y
        tira al otro. Con {SUPER_FROM} goles se carga el ⚡ {SUPER_NAME.toLowerCase()}.
      </p>

      <button
        type="button"
        onClick={onStart}
        autoFocus
        className="flex min-h-[3.75rem] w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#241a14]
                   bg-white px-4 text-lg font-black uppercase tracking-wide text-[#241a14] shadow-[0_4px_0_#241a14]
                   active:translate-y-[3px] active:shadow-[0_1px_0_#241a14]"
      >
        ⚽ ¡A por él!
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Cómo quedó la tanda
 * ------------------------------------------------------------------------- */

function Final({
  who,
  scored,
  name,
  onClose,
}: {
  who: Casero;
  scored: number;
  name: string;
  onClose: () => void;
}) {
  const good = scored >= Math.ceil(PENALTY_SHOTS / 2);
  const saved = PENALTY_SHOTS - scored;

  return (
    <div className="space-y-4 text-center">
      <div
        className="relative mx-auto aspect-[4/3] overflow-hidden rounded-2xl border-2 border-[#241a14]"
        style={{ backgroundColor: good ? ROPA_FAMILIA[who] : '#1f2a37' }}
      >
        <div
          aria-hidden
          className="absolute -inset-1/2 animate-girar opacity-40
                     bg-[repeating-conic-gradient(from_0deg_at_50%_50%,rgba(255,255,255,0.8)_0deg_5deg,transparent_5deg_15deg)]"
        />
        <div className="absolute bottom-[-4%] left-[4%] h-[92%] animate-pop" style={{ aspectRatio: '120 / 210' }}>
          <Chutador who={who} pose={good ? 'celebra' : 'espera'} className="h-full w-full" />
        </div>
        <div className="absolute right-[4%] top-1/2 -translate-y-1/2 text-right">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white [paint-order:stroke] [-webkit-text-stroke:3px_#241a14]">
            {name} — Benji
          </p>
          <p
            className="animate-golpe font-display text-[clamp(52px,17vw,88px)] font-black italic leading-none tabular-nums
                       text-amber-300 [paint-order:stroke] [-webkit-text-stroke:8px_#241a14]"
          >
            {scored}–{saved}
          </p>
          <p className="mt-2 flex justify-end gap-1" aria-hidden>
            {Array.from({ length: PENALTY_SHOTS }, (_, i) =>
              i < scored ? (
                <Balon key={i} className="h-6 w-6" />
              ) : (
                <span
                  key={i}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#241a14] bg-rose-500
                             text-xs font-black text-white"
                >
                  ✕
                </span>
              ),
            )}
          </p>
        </div>
      </div>

      <div>
        <p className="font-display text-xl font-black t-1">
          {scored === PENALTY_SHOTS ? '🏆 ' : ''}
          {scored} de {PENALTY_SHOTS} dentro
        </p>
        <p className="mt-1 text-sm t-2">{penaltyVerdict(scored, PENALTY_SHOTS)}</p>
      </div>

      <p className="text-[11px] leading-snug t-3">
        Una tanda al día, y no más. Mañana hay otras cinco preguntas, otro día que hacer y Benji esperando.
      </p>

      <button
        type="button"
        onClick={onClose}
        autoFocus
        className="flex min-h-[3.25rem] w-full items-center justify-center rounded-2xl border-2 border-[#241a14]
                   bg-white px-4 text-base font-black uppercase tracking-wide text-[#241a14] shadow-[0_4px_0_#241a14]
                   active:translate-y-[3px] active:shadow-[0_1px_0_#241a14]"
      >
        Cerrar
      </button>
    </div>
  );
}
