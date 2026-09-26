'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import {
  Chutador,
  SERIE_ORDER,
  esDeLaSerie,
  Vineta,
  tiradorDe,
  type TiradorId,
} from '@/components/games/PenaltyArt';
import {
  ENERGY_START,
  PENALTY_SHOTS,
  SHOT_TYPES,
  earnsGolden,
  medalla,
  penaltyVerdict,
  recordKey,
} from '@/lib/penalties';
import type { PenaltyOutcome, ShotScore } from '@/lib/penalties';
import { NOCHE, colorDe } from '@/components/games/penaltyScene';
import { manga } from '@/components/games/mangaFont';
import { type Casero } from '@/lib/cromoArt';
import type { DateKey, PenaltyResult, ProfileId } from '@/types';

/**
 * El penalti en 3D. Se carga aparte y sólo al abrir la tanda: el motor de 3D
 * pesa, y el resto de la app no tiene por qué cargarlo.
 */
const Tiro3D = dynamic(() => import('@/components/games/Tiro3D').then((m) => m.Tiro3D), {
  ssr: false,
  loading: () => (
    <div
      className="grid w-full place-items-center rounded-2xl bg-[#0b1220] text-sm font-black uppercase tracking-widest text-white/70"
      style={{ aspectRatio: '10 / 13', maxHeight: '78vh' }}
    >
      Saltando al campo…
    </div>
  ),
});

/* =========================================================================
 *  Tirar los cinco penaltis contra Benji.
 *
 *  Aquí se lleva la tanda: la presentación con el cara a cara y la elección
 *  del que tira, la cuenta de cada tiro, los puntos, el récord del aparato,
 *  el tiro de oro y el resumen. **Cada penalti se juega en `Tiro3D`**, en
 *  un estadio en 3D con la cámara detrás del que tira: se toca la portería
 *  para apuntar, se estira el balón hacia atrás como un tirachinas y se
 *  suelta, con la mira temblando más cuanta más fuerza.
 *
 *  Lo que hace que sean cinco penaltis distintos y no el mismo cinco veces
 *  —todo en `lib/penalties.ts`—:
 *
 *   · **El aviso del portero.** Benji se carga hacia el lado por el que va a
 *     volar. Leerlo y tirar al otro lado es la lección entera del penalti.
 *
 *   · **La memoria de Benji.** Recuerda los rincones por los que ya le han
 *     marcado y se va a vigilarlos.
 *
 *   · **Las dianas.** Dos aros en cada tiro que dan puntos si el balón cae
 *     dentro. A veces están justo donde él va a volar: el gol seguro o los
 *     puntos.
 *
 *   · **Los puntos y el récord.** Un gol suma; suma más lejos de sus guantes,
 *     en la diana, soltando con la mira en el centro y con un tiro de la
 *     serie.
 *
 *   · **El tiro de oro.** Los cinco dentro dan un sexto penalti contra Benji
 *     a tope, que vale el doble y no cuenta para la tanda.
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

const TITULAR: Record<PenaltyOutcome, string> = {
  gol: '¡GOOOOL!',
  parada: '¡PARADÓN!',
  fuera: '¡FUERA!',
  poste: '¡AL PALO!',
};

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

/**
 * La tanda entera: quién tira, qué penalti toca y qué pantalla se ve.
 *
 * Aquí no se juega nada —jugar es cosa de `TurnoTiro`—; aquí se lleva la
 * cuenta: el tirador elegido, cómo fue cada tiro, los puntos, el récord del
 * aparato y el tiro de oro. La pantalla no pasa de penalti sola al anotarse
 * un tiro: pasa cuando el crío pulsa seguir, para que le dé tiempo a ver cómo
 * acabó.
 */
export function PenaltyShootout({ profileId, name, date, result, onShot, onClose }: PenaltyShootoutProps) {
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

  /** La presentación sale una vez, y sólo si la tanda está por empezar. */
  const [seen, setSeen] = useState(() => (result?.taken ?? 0) > 0);

  /**
   * Cuántos penaltis se han tirado **en esta pantalla**. Es una foto y no el
   * cálculo en vivo a propósito: en cuanto se anota un tiro la tanda ya dice
   * otra cosa, y la escena tiene que quedarse donde está hasta que el crío
   * pulse seguir.
   */
  const [turno, setTurno] = useState(0);
  const avanzar = useCallback(() => setTurno((n) => n + 1), []);

  /**
   * Cómo acabó cada tiro de los que se han tirado **con esta pantalla
   * abierta**. Lo guardado en el día sólo dice cuántos entraron, no cuáles;
   * los de antes de cerrar la app salen en el marcador como tirados, sin más.
   */
  const [history, setHistory] = useState<PenaltyOutcome[]>([]);
  const [firstShown] = useState(result?.taken ?? 0);

  /**
   * El récord de este aparato. Es una comodidad, no un dato del día: si se
   * pierde, se vuelve a batir. Por eso vive en el navegador y no en la nube.
   */
  const [record, setRecord] = useState(0);
  useEffect(() => {
    try {
      setRecord(Math.max(0, Number(window.localStorage.getItem(recordKey(profileId))) || 0));
    } catch {
      // Sin almacenamiento no hay récord, y no pasa nada.
    }
  }, [profileId]);

  const guardarRecord = useCallback(
    (points: number) => {
      setRecord((best) => {
        if (points <= best) return best;
        try {
          window.localStorage.setItem(recordKey(profileId), String(points));
        } catch {
          // Da igual: el número sigue en pantalla hasta que se cierre.
        }
        return points;
      });
    },
    [profileId],
  );

  /**
   * El tiro de oro: el sexto, el que se gana haciendo pleno. Vale el doble y
   * **no se guarda con la tanda** —la tanda son cinco y sigue siendo cinco—,
   * así que vive aquí y sólo puede sumar puntos, nunca quitarlos.
   */
  const [golden, setGolden] = useState(false);
  const [goldenDone, setGoldenDone] = useState(false);
  const [goldenPoints, setGoldenPoints] = useState(0);

  const points = (result?.points ?? 0) + goldenPoints;

  const registrarTiro = useCallback(
    (next: PenaltyResult, outcome: PenaltyOutcome, score: ShotScore, esDeOro: boolean) => {
      if (esDeOro) {
        setGoldenPoints(score.total);
        setGoldenDone(true);
        guardarRecord((latest.current?.points ?? 0) + score.total);
        return;
      }
      setHistory((list) => [...list, outcome]);
      guardarRecord(next.points ?? 0);
      onShot(next);
    },
    [guardarRecord, onShot],
  );

  /** Lo último que se sabe de la tanda, para el récord del tiro de oro. */
  const latest = useRef(result);
  latest.current = result;

  // Acabada, y además vista: el quinto se anota al chutar, pero el resumen
  // espera a que se pulse «Ver el resumen», o se comería el último tiro.
  const done = (result?.taken ?? 0) >= PENALTY_SHOTS && firstShown + turno >= PENALTY_SHOTS;

  if (!seen) {
    return <CaraACara who={who} shooter={shooter} onPick={setShooter} name={name} onStart={() => setSeen(true)} />;
  }

  if (done && !golden) {
    return (
      <Final
        who={shooter}
        shooterName={shooterName}
        result={result}
        points={points}
        record={record}
        history={history}
        firstShown={firstShown}
        golden={earnsGolden(result) && !goldenDone ? () => { setGolden(true); avanzar(); } : undefined}
        goldenPoints={goldenDone ? goldenPoints : null}
        onClose={onClose}
      />
    );
  }

  return (
    <Tiro3D
      key={`tiro-${turno}`}
      spread={Math.max(0.68, Math.min(1.2, 1 - (fichaDe(shooter).pre - 80) / 70))}
      profileId={profileId}
      name={name}
      date={date}
      result={result}
      shooter={shooter}
      shooterName={shooterName}
      history={history}
      firstShown={firstShown}
      points={points}
      record={record}
      golden={golden}
      onShot={registrarTiro}
      onNext={() => {
        if (golden) setGolden(false);
        avanzar();
      }}
    />
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
        <p className="absolute inset-x-0 top-7 text-center text-[10px] font-black uppercase tracking-[0.2em] text-amber-300 [paint-order:stroke] [-webkit-text-stroke:3px_#241a14]">
          {PENALTY_SHOTS} penaltis · y él se acuerda
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

      {/* Cómo se juega: los cuatro tiempos del tiro, y las dos cosas que hay
          que tener en la cabeza mientras se apunta. */}
      <div className="rounded-2xl p-3 text-white" style={{ backgroundColor: NOCHE }}>
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/70">Cada penalti</p>
        <ol className="grid grid-cols-4 gap-1.5 text-center text-[11px] font-black leading-tight">
          {[
            ['🎯', 'Apunta', 'toca la portería'],
            ['🏹', 'Estira', 'el balón hacia atrás'],
            ['🟩', 'En verde', 'mira el medidor'],
            ['💥', 'Suelta', 'con la mira centrada'],
          ].map(([icon, title, hint], i) => (
            <li key={title} className="rounded-xl bg-white/5 px-1 py-2">
              <span aria-hidden className="block text-lg">
                {icon}
              </span>
              <span className="mt-0.5 block text-[11px] uppercase tracking-wide">
                {i + 1}. {title}
              </span>
              <span className="block text-[9px] font-semibold text-white/60">{hint}</span>
            </li>
          ))}
        </ol>

        <ul className="mt-3 space-y-1.5 text-[12px] leading-snug text-white/85">
          <li>
            <span className="font-black text-amber-300">Léelo:</span> Benji se carga hacia un lado antes de tirarse.
            Tira al otro.
          </li>
          <li>
            <span className="font-black text-amber-300">No repitas:</span> se acuerda de los rincones por los que ya le
            has marcado y se va a vigilarlos. Cámbiale el sitio.
          </li>
          <li>
            <span className="font-black text-amber-300">✦ Las dianas:</span> dos por tiro, y dan puntos. La ★ dorada es
            más pequeña y vale el doble… y a veces está justo donde él vuela.
          </li>
          <li>
            <span className="font-black text-amber-300">★ Tiro de oro:</span> si metes los cinco, te llevas un sexto
            contra Benji a tope que vale doble.
          </li>
        </ul>

        <p className="mt-2.5 text-[12px] leading-snug text-white/85">
          Cada gol da <span className="font-black text-amber-300">⚡</span> para los tiros de la serie (empiezas con{' '}
          {ENERGY_START}).
        </p>
        <p className="mt-1.5 hidden text-[11px] text-white/60 md:block">
          En el ordenador: arrastra con el ratón, o flechas para apuntar y mantén la barra espaciadora para estirar.
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
 * Como el de la tele al acabar: el resultado con la medalla, la tanda tiro a
 * tiro, las cifras y la nota del que ha tirado. Y, si ha hecho pleno, el
 * botón del tiro de oro, que es el premio de verdad de meter los cinco.
 * ------------------------------------------------------------------------- */

function Final({
  who,
  shooterName,
  result,
  points,
  record,
  history,
  firstShown,
  golden,
  goldenPoints,
  onClose,
}: {
  who: TiradorId;
  shooterName: string;
  result: PenaltyResult | null;
  points: number;
  record: number;
  history: PenaltyOutcome[];
  firstShown: number;
  /** El botón del tiro de oro, si se lo ha ganado y no lo ha tirado. */
  golden?: () => void;
  /** Y lo que dio, si ya lo tiró. */
  goldenPoints: number | null;
  onClose: () => void;
}) {
  const scored = result?.scored ?? 0;
  const good = scored >= Math.ceil(PENALTY_SHOTS / 2);
  const saved = PENALTY_SHOTS - scored;
  const specials = result?.specials ?? [];
  const color = colorDe(who);
  const premio = medalla(points);
  const batido = points >= record && points > 0;

  return (
    <div className={`${manga.variable} mx-auto w-full max-w-2xl space-y-3`}>
      <div
        className="overflow-hidden rounded-2xl text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] ring-1 ring-black/40"
        style={{ backgroundColor: NOCHE }}
      >
        <div className="flex items-center justify-between px-3 pt-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
          <span>Final de la tanda</span>
          {batido && <span className="animate-latido rounded bg-amber-300 px-1.5 py-0.5 text-[#241a14]">🏅 Récord</span>}
        </div>

        {/* Los puntos, con el que tira celebrando o esperando detrás. */}
        <div className="relative mt-1 aspect-[16/7] overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 opacity-50"
            style={{
              background: `radial-gradient(circle at 22% 60%, ${color} 0, transparent 55%), radial-gradient(circle at 80% 60%, #f59e0b 0, transparent 50%)`,
            }}
          />
          <div aria-hidden className="absolute -inset-1/2 animate-girar opacity-20 bg-[repeating-conic-gradient(from_0deg_at_50%_50%,rgba(255,255,255,0.8)_0deg_5deg,transparent_5deg_15deg)]" />
          <div className="absolute bottom-[-16%] left-[2%] h-[112%] animate-pop" style={{ aspectRatio: '120 / 210' }}>
            <Chutador who={who} pose={good ? 'celebra' : 'espera'} className="h-full w-full" />
          </div>
          <div className="absolute inset-y-0 right-[4%] flex flex-col items-end justify-center">
            <p className="text-[11px] font-black uppercase tracking-[0.16em]">
              {premio.icon} {premio.label}
            </p>
            <p className="animate-golpe font-manga text-[clamp(46px,15vw,84px)] leading-none tracking-wide tabular-nums text-amber-300 [paint-order:stroke] [-webkit-text-stroke:7px_#241a14]">
              {points}
            </p>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/80">
              puntos · {scored} de {PENALTY_SHOTS} dentro
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
          {goldenPoints !== null && (
            <span className="flex h-7 items-center justify-center gap-1 rounded-full bg-amber-300 px-2 text-xs font-black text-[#241a14]">
              ★ +{goldenPoints}
            </span>
          )}
        </div>

        <dl className="grid grid-cols-4 border-t border-white/10 text-center">
          {(
            [
              ['Goles', `${scored}/${PENALTY_SHOTS}`],
              ['Paradas', String(saved)],
              ['Especiales', String(specials.length)],
              ['Récord', String(Math.max(record, points))],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="border-r border-white/10 py-2.5 last:border-r-0">
              <dt className="text-[9px] font-black uppercase tracking-[0.12em] text-white/60">{k}</dt>
              <dd className="text-lg font-black tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* El tiro de oro: sólo con los cinco dentro, y sólo una vez. */}
      {golden && (
        <button
          type="button"
          onClick={golden}
          autoFocus
          className="relative flex min-h-[4.5rem] w-full items-center justify-center gap-2 overflow-hidden rounded-2xl
                     bg-gradient-to-b from-amber-200 to-amber-500 px-4 font-manga text-3xl tracking-wide text-[#241a14]
                     shadow-[0_5px_0_rgba(0,0,0,0.45)] active:translate-y-[3px] active:shadow-[0_2px_0_rgba(0,0,0,0.45)]"
        >
          <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-barrido bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          <span className="relative">★ ¡Tiro de oro!</span>
        </button>
      )}

      <div className="text-center">
        <p className="font-display text-xl font-black t-1">
          {scored === PENALTY_SHOTS ? '🏆 ' : ''}
          {scored} de {PENALTY_SHOTS} dentro
        </p>
        <p className="mt-1 text-sm t-2">{penaltyVerdict(scored, PENALTY_SHOTS)}</p>
        {golden && (
          <p className="mt-1 text-[12px] font-bold text-amber-500">
            Los cinco dentro: te has ganado un sexto contra Benji a tope, y vale el doble.
          </p>
        )}
        {specials.length > 0 && (
          <p className="mt-1 text-[12px] t-3">
            Tiros de la serie: {specials.map((k) => `${SHOT_TYPES[k].icon} ${SHOT_TYPES[k].name}`).join(' · ')}
          </p>
        )}
      </div>

      <p className="text-center text-[11px] leading-snug t-3">
        Una tanda al día. Mañana hay otras cinco preguntas, otro día que hacer y Benji esperando —y acordándose—.
      </p>

      <button
        type="button"
        onClick={onClose}
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