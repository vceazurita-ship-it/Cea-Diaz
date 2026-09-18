'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Chutador, Impacto, Portero, Primerplano } from '@/components/games/PenaltyArt';
import {
  PENALTY_SHOTS,
  PENALTY_ZONES,
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
import type { PenaltyAim, PenaltyOutcome, PenaltyShot, PenaltyZoneId } from '@/lib/penalties';
import { hashSeed } from '@/lib/challenges';
import type { Casero } from '@/lib/cromoArt';
import { playCue } from '@/lib/sound';
import type { DateKey, PenaltyResult, ProfileId } from '@/types';

/* =========================================================================
 *  Tirar los cinco penaltis.
 *
 *  Un penalti son tres gestos y los tres se ven en la pantalla: **colocar**
 *  la mira donde uno quiera de la portería, **mantener pulsado** para cargar
 *  la fuerza y **soltar** para chutar. Ni el resultado se sabe antes de
 *  soltar ni el portero espera quieto: se coloca, y ahí está el juego.
 *
 *  La pieza que lo convierte en habilidad y no en sorteo es **el aviso del
 *  portero**: antes de cada tiro se carga hacia el lado por el que va a
 *  volar, y se dice con todas las letras. Leerlo y tirar al otro lado es la
 *  lección entera del penalti, la misma que se grita desde la banda, y es lo
 *  que hace que la segunda tanda salga mejor que la primera.
 *
 *  Y con dos goles se carga **el tiro especial**, uno por tanda. No es un
 *  botón de ganar: el portero ya casi no llega, pero hay que pegarle fuerte
 *  y clavado —la franja buena se estrecha y se sube—, así que guardárselo
 *  para el penalti que decide es una decisión de verdad, y reventarlo por
 *  pasarse de fuerza también.
 *
 *  El dibujo es el del anime de fútbol de las tardes de merienda: cielo
 *  plano, grada llena, el primer plano de la cara mientras se coge fuerza,
 *  las rayas de velocidad y el rótulo que entra de golpe al acabar. Nada de
 *  eso es decoración suelta: cada cosa aparece en el momento en el que el
 *  juego necesita decir algo.
 *
 *  El que tira es el crío: la misma cara de su cromo, su color y su dorsal
 *  (`PenaltyArt`). Y una regla que no es de adorno: **el tiro se anota al
 *  dispararse**, igual que las preguntas. Cerrar la aplicación con un penalti
 *  fallado a medias no devuelve el penalti; volver más tarde sigue la tanda
 *  por donde iba.
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

/** En qué momento del penalti se está. */
type Step = 'apuntar' | 'fuerza' | 'visto';

/** Cuánto tarda el balón en llegar, y cuánto se queda el resultado en pantalla. */
const VUELO_MS = 620;

/** Dónde está el punto de penalti dentro de la escena, en tanto por ciento. */
const PUNTO = { x: 50, y: 88 };

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

  const [step, setStep] = useState<Step>(done ? 'visto' : 'apuntar');
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
  const [fired, setFired] = useState<{ keeper: PenaltyZoneId; shot: PenaltyShot } | null>(null);

  /** Por dónde va el balón: en el punto, subiendo, o ya donde acabó. */
  const [flight, setFlight] = useState<0 | 1 | 2>(0);

  /** El portero de este penalti: decidido de antemano, y con su aviso. */
  const keeper = keeperZone(profileId, date, taken);
  const tell = keeperTell(keeper);

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
    setFired({ keeper, shot: outcome });
    setStep('visto');
    setFlight(1);
    playCue('tiro');

    window.setTimeout(() => setFlight(2), 140);
    window.setTimeout(
      () => playCue(outcome.outcome === 'gol' ? 'gol' : outcome.outcome === 'parada' ? 'parada' : 'fuera'),
      VUELO_MS,
    );

    onShot({
      scored: scored + (outcome.outcome === 'gol' ? 1 : 0),
      taken: taken + 1,
      total: PENALTY_SHOTS,
      at: new Date().toISOString(),
      // El especial se gasta al tirarlo, salga como salga. Se guarda con la
      // tanda para que cerrar la app entre dos penaltis no regale otro.
      supered: (result?.supered ?? false) || special,
    });
  }, [aim, date, keeper, onShot, profileId, result, scored, special, step, taken]);

  const next = () => {
    setAim({ x: 50, y: 50 });
    setFired(null);
    setFlight(0);
    setPower(0);
    setSpecial(false);
    setStep('apuntar');
  };

  /* ---------------------------------------------------------------- pintura */

  if (done && !fired) return <Final scored={scored} name={name} onClose={onClose} />;

  const [low, high] = powerBand(special);
  const shooting = taken + (fired ? 0 : 1);

  return (
    <div className="space-y-3">
      {/* Por dónde va la tanda: los cinco huecos, siempre a la vista. */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wide t-3">
          Penalti {Math.min(shooting, PENALTY_SHOTS)} de {PENALTY_SHOTS}
        </span>
        <Marcador taken={taken} scored={scored} last={fired?.shot.outcome ?? null} />
      </div>

      <Escena
        who={profileId as Casero}
        aim={aim}
        onAim={setAim}
        step={step}
        tell={tell}
        fired={fired}
        flight={flight}
        special={special}
      />

      {/* Apuntar y coger fuerza comparten **el mismo bloque y el mismo botón**,
          y no son dos pantallas que se sustituyen. Es deliberado: quien
          mantiene el dedo en un botón que desaparece y es reemplazado por otro
          se queda con el tiro a medias, porque al soltar ya no hay debajo lo
          que había al pulsar. Un solo botón que cambia de rótulo, y la barra
          siempre en su sitio aunque todavía no corra, quitan de en medio los
          dos saltos. */}
      {step !== 'visto' && (
        <div className="space-y-3">
          <p className="rounded-xl border p-3 text-center text-sm font-bold leading-snug
                        border-accent bg-accent-faint t-1">
            {tell === 'centro' ? (
              <>
                👀 Se queda en el centro.{' '}
                <span className="font-semibold t-2">Tira pegado a un palo.</span>
              </>
            ) : (
              <>
                👀 Se está cargando hacia tu {tell}.{' '}
                <span className="font-semibold t-2">Tira al otro lado.</span>
              </>
            )}
          </p>

          {/* El especial: se arma antes de coger fuerza, y se dice lo que
              cambia. Sólo aparece cuando está cargado, que es con dos goles,
              y desaparece en cuanto se gasta. */}
          {armed && (
            <button
              type="button"
              disabled={step !== 'apuntar'}
              onClick={() => setSpecial((value) => !value)}
              aria-pressed={special}
              className={`btn w-full justify-center border-2 text-sm font-black uppercase
                tracking-wide transition-transform disabled:opacity-60
                ${
                  special
                    ? 'border-amber-300 bg-gradient-to-r from-amber-400/40 to-rose-500/40 t-1'
                    : 'hairline surf-1 t-2 hover-soft'
                }`}
            >
              {special ? `🔥 ${SUPER_NAME} ARMADO` : `🔥 Usar el ${SUPER_NAME.toLowerCase()}`}
            </button>
          )}

          {armed && (
            <p className="text-center text-[11px] leading-snug t-3">
              {special
                ? 'El portero casi no llega… pero la franja buena es más estrecha y más arriba. Píllala.'
                : `Lo tienes cargado por llevar ${SUPER_FROM} goles. Uno por tanda: elige tú cuándo.`}
            </p>
          )}

          {/* Puntería rápida: seis sitios de un toque. Es además el camino
              del teclado, porque la mira libre se mueve con el dedo. */}
          <div className="grid grid-cols-3 gap-1.5">
            {PENALTY_ZONES.map((zone) => (
              <button
                key={zone.id}
                type="button"
                disabled={step !== 'apuntar'}
                onClick={() => setAim({ x: zone.x, y: zone.y })}
                aria-label={`Apuntar ${zone.label}`}
                className={`btn min-h-[3rem] justify-center border text-xl font-black transition-colors
                  disabled:opacity-60
                  ${
                    Math.abs(aim.x - zone.x) < 6 && Math.abs(aim.y - zone.y) < 6
                      ? 'border-accent bg-accent-faint t-1'
                      : 'hairline surf-1 t-2 hover-soft'
                  }`}
              >
                {zone.arrow}
              </button>
            ))}
          </div>

          <div
            className={`relative h-10 overflow-hidden rounded-xl border hairline surf-1
                        ${step === 'apuntar' ? 'opacity-45' : ''}`}
            role="progressbar"
            aria-label="Fuerza del tiro"
            aria-valuenow={power}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {/* La franja buena, siempre a la vista: esto no es adivinar. Con
                el especial armado se estrecha, se sube y se pone de su color,
                que es la única manera de que se vea que el trato ha cambiado. */}
            <div
              className={special ? 'absolute inset-y-0 bg-amber-300/40' : 'absolute inset-y-0 bg-emerald-400/30'}
              style={{ left: `${low}%`, width: `${high - low}%` }}
              aria-hidden
            />
            <div
              className="absolute inset-y-0 left-0 bg-accent/30"
              style={{ width: `${power}%` }}
              aria-hidden
            />
            <div
              className="absolute inset-y-0 w-1.5 rounded-full bg-accent"
              style={{ left: `calc(${power}% - 3px)` }}
              aria-hidden
            />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-black t-1">
              {step === 'apuntar' ? 'fuerza' : power < low ? 'flojo' : power > high ? '¡pasado!' : 'buena'}
            </span>
          </div>

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
            onKeyDown={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                charge();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === ' ' || event.key === 'Enter') fire();
            }}
            className="btn-primary w-full touch-none text-base"
          >
            {step === 'apuntar'
              ? special
                ? `🔥 Mantén pulsado: ${SUPER_NAME}`
                : '⚽ Mantén pulsado para coger fuerza'
              : '🔥 Suelta para chutar'}
          </button>

          <p className="text-center text-[11px] leading-snug t-3">
            {step === 'apuntar'
              ? 'Toca la portería para mover la mira adonde quieras, o usa los seis botones.'
              : 'Suelta dentro de la franja de color. Pasarte sube y abre el balón; quedarte corto le da tiempo al portero.'}
          </p>
        </div>
      )}

      {step === 'visto' && fired && (
        <div className="animate-floatUp space-y-3">
          {/* El titular se pinta dentro de la escena, en su banda torcida.
              Aquí sólo queda lo que se aprende, que es lo que hay que leer
              con calma. */}
          <p className="sr-only" aria-live="polite">
            {TITULAR[fired.shot.outcome]}
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

const TITULAR: Record<PenaltyOutcome, string> = {
  gol: '🥅 ¡GOOOL!',
  parada: '🧤 ¡La ha parado!',
  fuera: '🚀 ¡Fuera!',
  poste: '🪵 ¡Al palo!',
};

const MARCA: Record<PenaltyOutcome, string> = {
  gol: '⚽',
  parada: '🧤',
  fuera: '🚀',
  poste: '🪵',
};

/* ---------------------------------------------------------------------------
 * El marcador de la tanda
 * ------------------------------------------------------------------------- */

function Marcador({
  taken,
  scored,
  last,
}: {
  taken: number;
  scored: number;
  last: PenaltyOutcome | null;
}) {
  return (
    <span className="ml-auto flex items-center gap-2">
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: PENALTY_SHOTS }, (_, i) => (
          <span
            key={i}
            className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px]
              ${
                i < taken
                  ? 'border-accent bg-accent-faint'
                  : i === taken
                    ? 'border-accent border-dashed'
                    : 'hairline surf-2 opacity-50'
              }`}
          >
            {i === taken - 1 && last ? MARCA[last] : i < taken ? '•' : ''}
          </span>
        ))}
      </span>
      <span className="text-sm font-black tabular-nums t-1">
        {scored} {scored === 1 ? 'gol' : 'goles'}
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * La escena
 *
 * Cielo de atardecer, grada, campo, portería y los dos muñecos. Todo lo que
 * pasa dentro de la portería va en tanto por ciento de la boca, que es el
 * mismo sistema con el que piensan las reglas en `lib/penalties.ts`: así lo
 * que se ve y lo que se calcula son lo mismo, sin conversiones por el medio.
 * ------------------------------------------------------------------------- */

/**
 * Dónde vive la boca de la portería dentro de la escena, en tanto por ciento.
 *
 * No ocupa el cuadro entero a propósito: por encima tiene que verse la grada
 * y por los lados el resto del estadio, que es lo que hace que esto parezca
 * un partido y no una portería recortada. Todo lo que pasa dentro se mide en
 * tanto por ciento de esta caja, así que mover estos cuatro números recoloca
 * la escena entera sin tocar ninguna regla.
 */
const BOCA = { left: 13, top: 17, width: 74, height: 35 };

/** Un punto de la portería, llevado a coordenadas de la escena. */
function enEscena(point: PenaltyAim): { x: number; y: number } {
  return {
    x: BOCA.left + (point.x / 100) * BOCA.width,
    y: BOCA.top + (point.y / 100) * BOCA.height,
  };
}

function Escena({
  who,
  aim,
  onAim,
  step,
  tell,
  fired,
  flight,
  special,
}: {
  who: Casero;
  aim: PenaltyAim;
  onAim: (aim: PenaltyAim) => void;
  step: Step;
  tell: 'izquierda' | 'centro' | 'derecha';
  fired: { keeper: PenaltyZoneId; shot: PenaltyShot } | null;
  flight: 0 | 1 | 2;
  /** `true` si este tiro va con el especial: cambia el fondo y la estela. */
  special: boolean;
}) {
  const mouth = useRef<HTMLDivElement>(null);
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

  const mira = enEscena(aim);
  const ball =
    flight === 0
      ? { ...PUNTO, scale: 1 }
      : flight === 1
        ? { x: (PUNTO.x + mira.x) / 2, y: (PUNTO.y + mira.y) / 2 - 7, scale: 0.72 }
        : { ...enEscena(fired?.shot.landing ?? aim), scale: 0.45 };

  // El portero: quieto y cargado hacia su lado mientras se apunta, y volando
  // adonde le tocaba en cuanto sale el balón.
  //
  // Al volar **no se le pone encima de la esquina**: se le lleva a medio
  // camino entre donde estaba y la esquina, que es donde queda el cuerpo de
  // un portero que estira el brazo. Poniéndole el ombligo en la escuadra, la
  // cabeza se le salía por encima del larguero.
  const flying = fired !== null;
  const target = flying ? zoneOf(fired.keeper) : null;
  const dive = target
    ? enEscena({ x: 50 + (target.x - 50) * 0.55, y: 68 + (target.y - 68) * 0.55 })
    : null;
  const lean = tell === 'izquierda' ? -7 : tell === 'derecha' ? 7 : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-950/40">
      <div className="relative aspect-[4/3]">
        {/* Cielo de mediodía, plano como una celda de animación: azul arriba
            y aclarando hacia el horizonte, sin degradados finos. */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#2b8fe0] via-[#63b9f2] to-[#bfe6ff]" />

        {/* Nubes: tres manchas blancas y duras, que es como las pinta el
            anime de campo. Van con borde de tinta porque sin él se pierden
            contra el cielo claro del horizonte. */}
        {/* Van medidas sobre el cuadro entero y no sobre una banda de cielo:
            metidas en una franja del 9 %, el alto en tanto por ciento se
            quedaba en dos píxeles y salían tres rayas blancas. */}
        {[
          { left: 4, top: 1.5, w: 17 },
          { left: 40, top: 0.5, w: 21 },
          { left: 76, top: 2.5, w: 15 },
        ].map((cloud) => (
          <span
            key={cloud.left}
            aria-hidden
            className="absolute rounded-full bg-white/95"
            style={{
              left: `${cloud.left}%`,
              top: `${cloud.top}%`,
              width: `${cloud.w}%`,
              height: '5%',
            }}
          />
        ))}

        {/* La grada: dos alturas de gente y la valla de publicidad. El
            gentío son puntos —dos tamaños, dos tonos— porque dibujar cabezas
            a este tamaño sólo da suciedad, y el ruido de puntos es
            exactamente lo que se ve en un estadio de dibujos. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-[9%] h-[17%] bg-[#1e3a5f]
                     bg-[radial-gradient(circle,rgba(255,255,255,0.5)_1.2px,transparent_1.2px),radial-gradient(circle,rgba(255,196,120,0.55)_1px,transparent_1px)]
                     bg-[length:7px_7px,11px_11px]"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-[26%] h-[8%] bg-[#16293f]
                     bg-[radial-gradient(circle,rgba(255,255,255,0.45)_1px,transparent_1px)]
                     bg-[length:6px_6px]"
        />
        {/* Valla de publicidad: la banda clara que separa la grada del campo
            y le da al cuadro la línea horizontal que le faltaba. */}
        <div aria-hidden className="absolute inset-x-0 top-[34%] h-[5%] bg-[#f4f4f2] border-y-2 border-[#241a14]" />

        {/* Césped, con sus franjas de siega. */}
        <div
          className="absolute inset-x-0 bottom-0 top-[39%] bg-emerald-600
                     bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.07)_0_7%,transparent_7%_14%)]"
        />
        {/* Y la línea del área, por delante de la portería, que es la que
            asienta el dibujo en el suelo. Detrás de la portería no va
            ninguna: allí no hay campo, hay grada. */}
        <div aria-hidden className="absolute left-[6%] right-[6%] top-[64%] h-[2px] bg-white/70" />

        {/* Los rayos del anime, detrás de todo, cuando se carga la fuerza.
            Giran despacio, y con el especial armado son de fuego. */}
        {step === 'fuerza' && (
          <div
            aria-hidden
            className={`absolute -inset-1/4 animate-girar ${
              special
                ? 'opacity-55 bg-[repeating-conic-gradient(from_0deg_at_50%_50%,rgba(255,196,80,0.85)_0deg_4deg,transparent_4deg_13deg)]'
                : 'opacity-30 bg-[repeating-conic-gradient(from_0deg_at_50%_50%,rgba(255,255,255,0.6)_0deg_5deg,transparent_5deg_16deg)]'
            }`}
          />
        )}

        {/* La boca de la portería: red, marco y superficie de puntería. */}
        <div
          ref={mouth}
          role="group"
          aria-label={`Portería. La mira está en ${Math.round(aim.x)} por ciento de izquierda a derecha y ${Math.round(aim.y)} por ciento de arriba abajo.`}
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
          className={`absolute rounded-sm border-[6px] border-white bg-slate-900/85
                      bg-[linear-gradient(90deg,rgba(255,255,255,0.28)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.28)_1px,transparent_1px)]
                      bg-[length:7%_11%] ${step === 'apuntar' ? 'cursor-crosshair touch-none' : ''}`}
          style={{
            left: `${BOCA.left}%`,
            top: `${BOCA.top}%`,
            width: `${BOCA.width}%`,
            height: `${BOCA.height}%`,
          }}
        />

        {/* El portero. Cuando espera, los pies en la línea de gol, cargado
            hacia su lado y moviéndose —un portero quieto no da ninguna
            tensión—; cuando vuela, girado y estirado hacia su esquina.
            El vaivén se apaga al disparar: el vuelo manda su propio
            `transform` y los dos a la vez se peleaban. */}
        <div
          className={`pointer-events-none absolute transition-all duration-500 ease-out
            ${flying ? '' : 'animate-vaiven'}`}
          style={{
            left: `${dive ? dive.x : BOCA.left + BOCA.width / 2 + lean}%`,
            top: `${dive ? dive.y : BOCA.top + BOCA.height * 0.68}%`,
            width: '28%',
            transform: flying
              ? `translate(-50%, -50%) rotate(${
                  target ? (target.x < 50 ? -58 : target.x > 50 ? 58 : 0) : 0
                }deg) scale(1.08)`
              : undefined,
          }}
        >
          <Portero className="h-full w-full" />
        </div>

        {/* La mira. Va con doble aro —tinta fuera, blanco dentro— porque tiene
            que leerse igual sobre la red oscura que sobre la camiseta del
            portero, que es justo donde uno querría ponerla y no verla. */}
        {step !== 'visto' && (
          <div
            aria-hidden
            className="pointer-events-none absolute transition-all duration-150"
            style={{ left: `${mira.x}%`, top: `${mira.y}%`, transform: 'translate(-50%, -50%)' }}
          >
            <span className="relative flex h-11 w-11 items-center justify-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              <span className="absolute inset-0 animate-ping rounded-full border-2 border-amber-300/80" />
              <span className="absolute inset-0 rounded-full border-[3px] border-[#241a14]" />
              <span className="absolute inset-[3px] rounded-full border-[3px] border-amber-300" />
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-amber-300" />
              <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-amber-300" />
              <span className="relative h-2 w-2 rounded-full bg-white" />
            </span>
          </div>
        )}

        {/* El balón. Con el especial va envuelto en fuego, que es la manera
            que tiene este dibujo de decir «éste no lo para». */}
        <div
          aria-hidden
          className="pointer-events-none absolute text-2xl transition-all ease-out"
          style={{
            left: `${ball.x}%`,
            top: `${ball.y}%`,
            transform: `translate(-50%, -50%) scale(${ball.scale})`,
            transitionDuration: `${VUELO_MS / 2}ms`,
          }}
        >
          {special && flight > 0 && (
            <span className="absolute -inset-4 -z-10 rounded-full bg-amber-400/70 blur-md" />
          )}
          ⚽
        </div>

        {/* El que tira, en primer plano y a su tamaño de protagonista: grande
            y pegado al borde, como en el anime, que es lo que da la sensación
            de estar detrás de él. */}
        <div
          className="pointer-events-none absolute bottom-[-2%] left-[0%] h-[62%] drop-shadow-[0_4px_6px_rgba(0,0,0,0.35)]"
          style={{ aspectRatio: '120 / 210' }}
        >
          <Chutador
            who={who}
            pose={step === 'apuntar' ? 'espera' : step === 'fuerza' ? 'carrera' : 'golpeo'}
            className="h-full w-full"
          />
        </div>

        {/* Y el estallido del golpeo, medio segundo. */}
        {flight === 1 && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-[26%] top-[80%] h-[26%] w-[26%]
                       animate-pop -translate-x-1/2 -translate-y-1/2"
          >
            <Impacto className="h-full w-full" />
          </div>
        )}

        {/* El primer plano de la cara mientras se coge fuerza. Va arriba a la
            derecha, que es la esquina que no ocupan ni la portería ni el que
            tira, y se va en cuanto sale el balón. */}
        {step === 'fuerza' && (
          <div className="pointer-events-none absolute right-[3%] top-[3%] h-[26%] w-[20%] animate-pop">
            <Primerplano who={who} className="h-full w-full" />
          </div>
        )}

        {/* El rótulo del final, en su banda torcida y con las rayas de
            impacto detrás. Entra de golpe, se pasa de tamaño y se asienta:
            es el gesto del anime, y es también lo que hace que se lea el
            resultado sin buscarlo. */}
        {fired && flight === 2 && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-25
                         bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.9)_0_2px,transparent_2px_9px)]"
            />
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 top-[70%] animate-golpe border-y-[3px]
                          border-[#241a14] py-1 text-center font-display text-2xl font-black italic
                          tracking-tight text-white drop-shadow-[0_2px_0_rgba(36,26,20,1)]
                          sm:text-2xl
                          ${
                            fired.shot.outcome === 'gol'
                              ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400'
                              : 'bg-gradient-to-r from-slate-700 via-slate-900 to-slate-700'
                          }`}
            >
              {TITULAR[fired.shot.outcome]}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Cómo quedó la tanda
 * ------------------------------------------------------------------------- */

function Final({
  scored,
  name,
  onClose,
}: {
  scored: number;
  name: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      <p className="animate-pop text-5xl" aria-hidden>
        {scored === PENALTY_SHOTS ? '🏆' : scored > 0 ? '🥅' : '🧤'}
      </p>

      <p className="font-display text-2xl font-black tabular-nums t-1">
        {scored} de {PENALTY_SHOTS}
      </p>

      <p className="text-sm t-2">
        {name}: {penaltyVerdict(scored, PENALTY_SHOTS)}
      </p>

      <p className="text-[11px] leading-snug t-3">
        Una tanda al día, y no más. Mañana hay otras cinco preguntas y otro día que hacer.
      </p>

      <button type="button" onClick={onClose} className="btn-primary w-full">
        Cerrar
      </button>
    </div>
  );
}
