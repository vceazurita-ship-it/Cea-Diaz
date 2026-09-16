'use client';

import { useEffect, useRef, useState } from 'react';

import {
  PENALTY_SHOTS,
  PENALTY_ZONES,
  POWER_GOOD,
  keeperZone,
  penaltyVerdict,
  resolveShot,
  zoneOf,
} from '@/lib/penalties';
import type { PenaltyOutcome, PenaltyShot, PenaltyZoneId } from '@/lib/penalties';
import type { DateKey, PenaltyResult, ProfileId } from '@/types';

/* =========================================================================
 *  Tirar los cinco penaltis.
 *
 *  Cada penalti son tres momentos y se ven los tres: se elige el sitio, se
 *  para la barra de fuerza y se mira lo que pasa. Ni el portero ni el
 *  resultado se saben antes de disparar —el portero se tapa hasta que sale
 *  el balón—, que es lo que hace que la elección valga algo.
 *
 *  Y una regla que no es de adorno: **el tiro se anota al dispararse**. Lo
 *  mismo que la partida de preguntas. Cerrar la aplicación con un penalti
 *  fallado a medias no devuelve el penalti; volver más tarde sigue la tanda
 *  por donde iba.
 * ========================================================================= */

interface PenaltyShootoutProps {
  profileId: ProfileId;
  date: DateKey;
  /** Lo tirado hasta ahora; `null` si la tanda está por empezar. */
  result: PenaltyResult | null;
  /** Anota el tiro en cuanto se ejecuta. */
  onShot: (result: PenaltyResult) => void;
  onClose: () => void;
}

/** En qué momento del penalti se está. */
type Step = 'apuntar' | 'fuerza' | 'visto';

export function PenaltyShootout({
  profileId,
  date,
  result,
  onShot,
  onClose,
}: PenaltyShootoutProps) {
  const taken = result?.taken ?? 0;
  const scored = result?.scored ?? 0;
  const done = taken >= PENALTY_SHOTS;

  const [step, setStep] = useState<Step>(done ? 'visto' : 'apuntar');
  const [aim, setAim] = useState<PenaltyZoneId | null>(null);
  const [power, setPower] = useState(0);

  /**
   * El penalti ya tirado: adónde voló el portero y en qué acabó.
   *
   * Se guarda entero al disparar, y no se recalcula al pintar, porque en
   * cuanto el tiro queda anotado el contador sube y el portero que tocaría
   * ya es el del penalti siguiente. Recalculándolo, el guante aparecía en un
   * sitio y la explicación contaba otro.
   */
  const [fired, setFired] = useState<{ keeper: PenaltyZoneId; shot: PenaltyShot } | null>(null);

  /** El portero de este penalti: decidido de antemano, tapado hasta el tiro. */
  const keeper = keeperZone(profileId, date, taken);

  /* ------------------------------------------------------ la barra de fuerza */

  // La barra va y viene sola mientras se está apuntando a la fuerza. Se mueve
  // con el reloj del navegador y no con un temporizador de pasos para que
  // corra igual en un móvil viejo que en un portátil.
  const frame = useRef<number>();
  useEffect(() => {
    if (step !== 'fuerza') return undefined;

    const started = performance.now();
    const sweep = 1400;

    const tick = (now: number) => {
      const phase = ((now - started) % (sweep * 2)) / sweep;
      setPower(Math.round((phase <= 1 ? phase : 2 - phase) * 100));
      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [step]);

  /* ------------------------------------------------------------- el disparo */

  const fire = () => {
    if (!aim || step !== 'fuerza') return;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);

    const outcome = resolveShot(aim, power, keeper);
    setFired({ keeper, shot: outcome });
    setStep('visto');

    onShot({
      scored: scored + (outcome.outcome === 'gol' ? 1 : 0),
      taken: taken + 1,
      total: PENALTY_SHOTS,
      at: new Date().toISOString(),
    });
  };

  const next = () => {
    setAim(null);
    setFired(null);
    setPower(0);
    setStep('apuntar');
  };

  /* ---------------------------------------------------------------- pintura */

  if (done && !fired) return <Final scored={scored} onClose={onClose} />;

  const [low, high] = POWER_GOOD;

  return (
    <div className="space-y-4">
      {/* Por dónde va la tanda */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wide t-3">
          Penalti {Math.min(fired ? taken : taken + 1, PENALTY_SHOTS)} de {PENALTY_SHOTS}
        </span>
        <span className="ml-auto text-sm font-black tabular-nums t-1">
          {scored} {scored === 1 ? 'gol' : 'goles'}
        </span>
      </div>

      <Goal
        aim={aim}
        keeper={fired?.keeper ?? null}
        outcome={fired?.shot.outcome ?? null}
        pickable={step === 'apuntar'}
        onPick={(zone) => {
          setAim(zone);
          setStep('fuerza');
        }}
      />

      {step === 'apuntar' && (
        <p className="text-center text-sm font-semibold leading-snug t-2">
          Elige el sitio. El portero ya ha decidido adónde se tira, así que piénsalo: lo que
          buscas es el hueco, no el centro de la portería.
        </p>
      )}

      {step === 'fuerza' && (
        <div className="space-y-3">
          <p className="text-center text-sm font-semibold leading-snug t-2">
            Ahora la fuerza. Para la barra dentro de la franja: pasarte es mandarla fuera, y
            quedarte corto deja llegar al portero si se tira a tu lado.
          </p>

          <div className="relative h-8 overflow-hidden rounded-xl border hairline surf-1">
            {/* La franja buena, siempre a la vista: esto no es adivinar. */}
            <div
              className="absolute inset-y-0 bg-emerald-400/25"
              style={{ left: `${low}%`, width: `${high - low}%` }}
              aria-hidden
            />
            <div
              className="absolute inset-y-0 w-1.5 rounded-full bg-accent"
              style={{ left: `calc(${power}% - 3px)` }}
              aria-hidden
            />
          </div>

          <button type="button" onClick={fire} className="btn-primary w-full text-base">
            ⚽ ¡Dispara!
          </button>
        </div>
      )}

      {step === 'visto' && fired && (
        <div className="animate-floatUp space-y-3">
          <p
            className={`text-center text-lg font-black ${
              fired.shot.outcome === 'gol' ? 't-accent' : 't-1'
            }`}
            aria-live="polite"
          >
            {fired.shot.outcome === 'gol'
              ? '🥅 ¡GOL!'
              : fired.shot.outcome === 'parada'
                ? '🧤 ¡Parada!'
                : '🚀 ¡Fuera!'}
          </p>

          <p className="rounded-xl border p-3 text-[13px] leading-snug hairline surf-1 t-2">
            💡 {fired.shot.why}
          </p>

          {done ? (
            <button type="button" onClick={() => setFired(null)} className="btn-primary w-full">
              Ver la tanda
            </button>
          ) : (
            <button type="button" onClick={next} className="btn-primary w-full">
              Siguiente penalti
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * La portería
 * ------------------------------------------------------------------------- */

function Goal({
  aim,
  keeper,
  outcome,
  pickable,
  onPick,
}: {
  aim: PenaltyZoneId | null;
  keeper: PenaltyZoneId | null;
  outcome: PenaltyOutcome | null;
  pickable: boolean;
  onPick: (zone: PenaltyZoneId) => void;
}) {
  const target = aim ? zoneOf(aim) : null;
  const glove = keeper ? zoneOf(keeper) : null;

  // Un tiro que se va fuera sube por encima del larguero; el resto acaba
  // donde se apuntó. Es el único sitio donde el balón no va a su zona.
  const ballY = outcome === 'fuera' ? -12 : target?.y ?? 50;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-900/40 bg-emerald-800">
      <div className="relative aspect-[16/9]">
        {/* La red: dos rejillas cruzadas, que es todo lo que hace falta para
            que aquello se lea como una portería. */}
        <div
          aria-hidden
          className="absolute inset-x-[6%] inset-y-[8%] rounded-sm border-[5px] border-white
                     bg-emerald-950/30
                     bg-[linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px)]
                     bg-[length:7%_11%]"
        />

        {/* Las seis casillas */}
        {PENALTY_ZONES.map((zone) => {
          const picked = aim === zone.id;

          return (
            <button
              key={zone.id}
              type="button"
              disabled={!pickable}
              onClick={() => onPick(zone.id)}
              aria-label={`Tirar ${zone.label}`}
              aria-pressed={picked}
              className={`absolute flex items-center justify-center rounded-lg border-2
                          text-2xl font-black transition-colors
                          ${
                            picked
                              ? 'border-white bg-white/35 text-white'
                              : 'border-white/45 bg-white/5 text-white/70'
                          }
                          ${pickable ? 'hover:border-white hover:bg-white/25 hover:text-white' : ''}`}
              style={{
                left: `${zone.x - 13}%`,
                top: `${zone.y - 15}%`,
                width: '26%',
                height: '30%',
              }}
            >
              {zone.arrow}
            </button>
          );
        })}

        {/* El portero, sólo cuando ya ha volado */}
        {glove && (
          <span
            aria-hidden
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-4xl
                       transition-all duration-300"
            style={{ left: `${glove.x}%`, top: `${glove.y}%` }}
          >
            🧤
          </span>
        )}

        {/* Y el balón: en el punto hasta que se dispara */}
        <span
          aria-hidden
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-2xl
                     transition-all duration-500 ease-out"
          style={{
            left: `${outcome ? target?.x ?? 50 : 50}%`,
            top: `${outcome ? ballY : 93}%`,
          }}
        >
          ⚽
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Cómo quedó la tanda
 * ------------------------------------------------------------------------- */

function Final({ scored, onClose }: { scored: number; onClose: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <p className="animate-pop text-5xl" aria-hidden>
        {scored === PENALTY_SHOTS ? '🏆' : scored > 0 ? '🥅' : '🧤'}
      </p>

      <p className="font-display text-2xl font-black tabular-nums t-1">
        {scored} de {PENALTY_SHOTS}
      </p>

      <p className="text-sm t-2">{penaltyVerdict(scored, PENALTY_SHOTS)}</p>

      <p className="text-[11px] leading-snug t-3">
        Una tanda por pleno, y un pleno al día como mucho. Mañana hay otras cinco preguntas.
      </p>

      <button type="button" onClick={onClose} className="btn-primary w-full">
        Cerrar
      </button>
    </div>
  );
}
