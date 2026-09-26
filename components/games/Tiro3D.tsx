'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  CabezaAnime,
  CARA_BENJI,
  FondoTiro,
  GORRA,
  NucaAnime,
  Vineta,
  tiradorDe,
  type TiradorId,
} from '@/components/games/PenaltyArt';
import { Estadio3D, type Jugada } from '@/components/games/penalty3d/Estadio3D';
import { manga } from '@/components/games/mangaFont';
import { hashSeed } from '@/lib/challenges';
import { ROPA_FAMILIA, type Casero } from '@/lib/cromoArt';
import {
  ABANICO,
  PENALTY_SHOTS,
  SHOT_ORDER,
  SHOT_TYPES,
  dianasDe,
  energyLeft,
  keeperStretch,
  keeperTell,
  keeperZone,
  overshootPreview,
  powerBand,
  resolveShot,
  scoreShot,
  shotAvailability,
  spotsOf,
  zonaDe,
  zoneOf,
  type PenaltyAim,
  type PenaltyOutcome,
  type PenaltyShot,
  type ShotScore,
} from '@/lib/penalties';
import { playCue } from '@/lib/sound';
import type { DateKey, PenaltyResult, ProfileId, ShotKind } from '@/types';

/* =========================================================================
 *  Un penalti, en el estadio en 3D.
 *
 *  **Cómo se tira.** Dos gestos, y los dos sobre la escena:
 *
 *   1. **Apuntar**: tocar o arrastrar sobre la portería. La mira va donde
 *      está el dedo.
 *   2. **Tirar del balón hacia atrás, como de un tirachinas, y soltar.**
 *      Cuanto más se estira, más fuerte; el medidor de la esquina dice si se
 *      está en la franja verde. Y mientras se estira, **la mira tiembla**
 *      —más cuanta más fuerza, menos cuanto mejor es la carta del que tira—:
 *      soltar cuando pasa por el centro manda el balón justo adonde se
 *      apuntó. Ése es el pulso, lo que antes era la segunda barra.
 *
 *  Con teclado: flechas para la mira, la barra espaciadora mantenida para
 *  estirar y soltarla para chutar.
 *
 *  Las reglas son las de siempre —el aviso de Benji, su memoria, las
 *  dianas, los puntos, los especiales—, todas en `lib/penalties.ts`: aquí
 *  sólo cambia cómo se ve y cómo se toca. La escena la cuenta
 *  `penalty3d/Estadio3D`, y encima va el marcador, como en un videojuego.
 *
 *  Y la regla que no es de adorno: **el tiro se anota al dispararse**, antes
 *  de que el balón llegue. Cerrar la app a medio vuelo no lo devuelve.
 * ========================================================================= */

type Step = 'apuntar' | 'fuerza' | 'corte' | 'vuelo' | 'visto';

const CORTE_MS = 1000;
const REFLEJO_MS = 110;
const CAMARA_LENTA = 1 / 2.6;

const TITULAR: Record<PenaltyOutcome, string> = {
  gol: '¡GOOOOL!',
  parada: '¡PARADÓN!',
  fuera: '¡FUERA!',
  poste: '¡AL PALO!',
};

export interface Tiro3DProps {
  profileId: ProfileId;
  name: string;
  date: DateKey;
  result: PenaltyResult | null;
  shooter: TiradorId;
  shooterName: string;
  history: PenaltyOutcome[];
  firstShown: number;
  points: number;
  record: number;
  golden: boolean;
  /** Lo que se abre el balón con este tirador: su precisión, en tanto por uno. */
  spread: number;
  onShot: (result: PenaltyResult, outcome: PenaltyOutcome, score: ShotScore, golden: boolean) => void;
  onNext: () => void;
}

interface Fired {
  shot: PenaltyShot;
  kind: ShotKind;
  score: ShotScore;
  plan: Jugada;
}

/** Una cabeza de la serie, pasada a texto SVG para hacerla textura. */
function svgDe(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

const CAJA = '-34 -52 68 90';

/** Cómo va el temblor de la mira: amplitud en puntos de portería. */
function temblor(power: number, spread: number): number {
  const p = power / 100;
  return (1.5 + 11 * Math.pow(p, 1.4)) * spread;
}

export function Tiro3D({
  profileId,
  name,
  date,
  result: resultNow,
  shooter,
  shooterName,
  history,
  firstShown,
  points,
  record,
  golden,
  spread,
  onShot,
  onNext,
}: Tiro3DProps) {
  /**
   * La tanda tal como estaba al empezar **este** penalti. El tiro se anota en
   * cuanto sale, y con él cambia la tanda que llega de fuera; pero mientras
   * el balón vuela y se ve el resultado, las dianas, el aviso y el número
   * tienen que seguir siendo los de este penalti y no los del siguiente.
   */
  const [result] = useState(resultNow);
  const [recordAntes] = useState(record);
  const taken = result?.taken ?? 0;
  const scored = result?.scored ?? 0;
  const round = result?.round ?? 0;
  const kid = profileId as Casero;
  const shooting = golden ? PENALTY_SHOTS + 1 : Math.min(taken + 1, PENALTY_SHOTS);
  const stretch = keeperStretch(shooting, golden);
  const spots = spotsOf(result);
  const dianas = useMemo(() => dianasDe(profileId, date, taken, round), [profileId, date, taken, round]);
  const keeper = keeperZone(profileId, date, golden ? PENALTY_SHOTS : taken, round, spots);
  const tell = keeperTell(keeper);
  const vigila = spots.includes(keeper);
  const player = tiradorDe(shooter);

  const [step, setStep] = useState<Step>('apuntar');
  const [aim, setAim] = useState<PenaltyAim>({ x: 50, y: 50 });
  const [power, setPower] = useState(0);
  const [wobble, setWobble] = useState({ x: 0, y: 0 });
  const [kind, setKind] = useState<ShotKind>('normal');
  const [tray, setTray] = useState(false);
  const [fired, setFired] = useState<Fired | null>(null);
  const [landed, setLanded] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [cartel, setCartel] = useState(true);
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);
  const [ball, setBall] = useState<{ x: number; y: number } | null>(null);

  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Estadio3D | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setCartel(false), 1400);
    return () => window.clearTimeout(t);
  }, []);

  /* ------------------------------------------------------------ el estadio */

  useEffect(() => {
    if (!host.current) return undefined;
    const face = player.face;
    const kit = player.kit;
    const escena = new Estadio3D(host.current, {
      nuca: svgDe(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={CAJA}>
          <NucaAnime face={face} pelo={player.pelo} cinta={player.headband} />
        </svg>,
      ),
      cara: svgDe(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={CAJA}>
          <CabezaAnime face={face} pelo={player.pelo} cinta={player.headband} />
        </svg>,
      ),
      benjiCara: svgDe(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={CAJA}>
          <CabezaAnime face={CARA_BENJI} pelo="rapado" gorra />
        </svg>,
      ),
      benjiNuca: svgDe(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={CAJA}>
          <NucaAnime face={{ ...CARA_BENJI, hair: GORRA }} pelo="peinado" />
        </svg>,
      ),
      tirador: {
        kit,
        shorts: player.shorts,
        socks: player.socks ?? '#f4f4f2',
        band: player.band,
        skin: face.skin,
        number: player.number,
        dorsal: player.dorsal,
        nombre: player.short ?? shooterName,
        bare: player.bare,
      },
      gemelo: player.twin,
      grada: [ROPA_FAMILIA[kid] ?? kit, kit],
      vallas: [
        { texto: 'CEA-DÍAZ', fondo: '#0f172a', tinta: '#facc15' },
        { texto: 'NANKATSU', fondo: '#f8fafc', tinta: '#1d4ed8' },
        { texto: `¡VAMOS ${name.toUpperCase()}!`, fondo: ROPA_FAMILIA[kid] ?? '#16a34a', tinta: '#ffffff' },
        { texto: 'TOHO', fondo: '#1e2a78', tinta: '#ffffff' },
        { texto: 'FLYNET', fondo: '#dc2626', tinta: '#ffffff' },
        { texto: 'CAMPEONES', fondo: '#facc15', tinta: '#0f172a' },
      ],
    });
    stage.current = escena;
    setReady(true);
    return () => {
      escena.dispose();
      stage.current = null;
    };
    // El estadio se monta una vez por penalti: el tirador no cambia a medias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    stage.current?.setDianas(dianas);
  }, [dianas, ready]);

  useEffect(() => {
    stage.current?.setTell(tell);
  }, [tell, ready]);

  // Dónde está el balón en la pantalla: para el tirachinas.
  useEffect(() => {
    if (!ready) return undefined;
    const t = window.setTimeout(() => setBall(stage.current?.balonEnPantalla() ?? null), 60);
    const onResize = () => setBall(stage.current?.balonEnPantalla() ?? null);
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, [ready]);

  /* ------------------------------------------------------ el temblor */

  const t0 = useRef(0);
  const live = useRef({ power: 0, wobble: { x: 0, y: 0 } });
  const [low, high] = powerBand(kind);
  const zona = power < low ? 'flojo' : power > high ? 'pasado' : 'buena';

  useEffect(() => {
    if (step !== 'fuerza') return undefined;
    let frame = 0;
    // Los especiales tiemblan más deprisa: su franja cuesta más.
    const periodo = SHOT_TYPES[kind].sweep * 0.95;
    const tick = (now: number) => {
      const t = (now - t0.current) / periodo;
      const amp = temblor(live.current.power, spread);
      const w = {
        x: amp * Math.sin(t * Math.PI * 2),
        y: amp * 0.55 * Math.sin(t * Math.PI * 2 * 1.63 + 1.1),
      };
      live.current.wobble = w;
      setWobble(w);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step, kind, spread]);

  // La mira en la escena: donde se apunta, más el temblor, con su cerco.
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    if (step === 'apuntar') {
      s.setMira(aim, { kind });
      s.setCarga(0, null);
    } else if (step === 'fuerza') {
      s.setMira(
        { x: aim.x + wobble.x, y: aim.y + wobble.y },
        { cerco: overshootPreview(kind, power), zona, kind },
      );
      s.setCarga(power / 100, kind === 'normal' ? null : SHOT_TYPES[kind].color);
    } else {
      s.setMira(null);
      s.setCarga(0, null);
    }
  }, [aim, wobble, power, step, kind, zona, ready]);

  /* ------------------------------------------------------------ el disparo */

  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const shotDone = useRef(false);

  const fire = useCallback(() => {
    if (shotDone.current) return;
    shotDone.current = true;
    const pow = live.current.power;
    const w = live.current.wobble;
    // El pulso, de -1 a 1: el temblor de lado, en la escala del abanico.
    const accuracy = Math.max(-1, Math.min(1, w.x / (ABANICO * spread)));
    const apuntado = { x: aim.x, y: Math.max(1, Math.min(99, aim.y + w.y)) };
    const seed = hashSeed(`${profileId}:desvio:${date}:${taken}${golden ? ':oro' : ''}${round ? `:r${round}` : ''}`);
    const shot = resolveShot(apuntado, pow, keeper, seed, kind, accuracy, spread, stretch);
    const score = scoreShot({ shot, keeper, accuracy, kind, dianas, golden });
    const special = kind !== 'normal';
    const plan: Jugada = {
      landing: shot.landing,
      outcome: shot.outcome,
      keeper: zoneOf(keeper),
      kind,
      flight: SHOT_TYPES[kind].flight + 180,
      reflejo: REFLEJO_MS,
      color: special ? SHOT_TYPES[kind].color : undefined,
      curva: accuracy,
      diana: score.hit,
    };
    setFired({ shot, kind, score, plan });
    setFinger(null);
    setTray(false);

    const lanzar = () => {
      setStep('vuelo');
      void stage.current
        ?.jugar(plan, {
          alGolpeo: () => playCue('tiro'),
          alLlegar: () => {
            setLanded(true);
            playCue(shot.outcome === 'gol' ? 'gol' : shot.outcome === 'fuera' ? 'fuera' : 'parada');
            try {
              navigator.vibrate?.(shot.outcome === 'gol' ? [40, 50, 90] : 70);
            } catch {
              // Hay navegadores que tienen la función y la prohíben.
            }
          },
        })
        .then(() => setStep('visto'));
    };
    if (special) {
      setStep('corte');
      timers.current.push(window.setTimeout(lanzar, CORTE_MS));
    } else {
      lanzar();
    }

    onShot(
      {
        scored: scored + (shot.outcome === 'gol' ? 1 : 0),
        taken: taken + 1,
        total: PENALTY_SHOTS,
        at: new Date().toISOString(),
        specials: special ? [...(result?.specials ?? []), kind] : (result?.specials ?? []),
        round,
        spots: (result?.spots ?? '') + (shot.outcome === 'gol' ? zonaDe(shot.landing) : ''),
        points: (result?.points ?? 0) + score.total,
      },
      shot.outcome,
      score,
      golden,
    );
  }, [aim, date, dianas, golden, keeper, kind, onShot, profileId, result, round, scored, spread, stretch, taken]);

  const replay = () => {
    if (!fired || replaying) return;
    setReplaying(true);
    void stage.current?.jugar(fired.plan, { speed: CAMARA_LENTA, camara: 'repeticion' }).then(() => setReplaying(false));
  };

  /* ------------------------------------------------------- los gestos */

  /**
   * Un dedo sobre la escena. Si empieza cerca del balón —o en la franja de
   * abajo, que con un dedo gordo el balón es pequeño—, es el tirachinas; si
   * no, es apuntar.
   */
  const gesture = useRef<{ mode: 'apuntar' | 'estirar'; x0: number; y0: number } | null>(null);

  const local = (event: React.PointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top, h: r.height };
  };

  const apuntarA = (x: number, y: number) => {
    const at = stage.current?.pantallaAPorteria(x, y);
    if (!at) return;
    setAim({ x: Math.max(3, Math.min(97, at.x)), y: Math.max(4, Math.min(96, at.y)) });
  };

  const onDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (step !== 'apuntar' || !stage.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setTray(false);
    const p = local(event);
    const b = stage.current.balonEnPantalla();
    setBall(b);
    const cerca = Math.hypot(p.x - b.x, p.y - b.y) < Math.max(70, p.h * 0.13) || p.y > p.h * 0.8;
    if (cerca) {
      gesture.current = { mode: 'estirar', x0: b.x, y0: b.y };
      live.current.power = 0;
      setPower(0);
      t0.current = performance.now();
      setFinger({ x: p.x, y: p.y });
      setStep('fuerza');
    } else {
      gesture.current = { mode: 'apuntar', x0: p.x, y0: p.y };
      apuntarA(p.x, p.y);
    }
  };

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = local(event);
    if (g.mode === 'apuntar') {
      apuntarA(p.x, p.y);
      return;
    }
    // Estirar: sólo cuenta lo que se tira hacia atrás (hacia abajo).
    const dy = Math.max(0, p.y - g.y0);
    const dx = p.x - g.x0;
    const largo = Math.hypot(dx * 0.35, dy);
    const pow = Math.max(0, Math.min(100, (largo / (p.h * 0.3)) * 100));
    live.current.power = pow;
    setPower(Math.round(pow));
    setFinger({ x: p.x, y: p.y });
  };

  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.mode !== 'estirar') return;
    // Un toque sin estirar no chuta: vuelve a apuntar.
    if (live.current.power < 8) {
      setFinger(null);
      setStep('apuntar');
      return;
    }
    fire();
  };

  // Teclado: flechas para la mira; la barra espaciadora mantenida estira.
  const keys = useRef({ step, fire });
  keys.current = { step, fire };
  useEffect(() => {
    let frame = 0;
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select')) return;
      const { step: now } = keys.current;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-6, 0],
        ArrowRight: [6, 0],
        ArrowUp: [0, -9],
        ArrowDown: [0, 9],
      };
      const move = moves[event.key];
      if (move && now === 'apuntar') {
        event.preventDefault();
        setAim((a) => ({ x: Math.max(3, Math.min(97, a.x + move[0])), y: Math.max(4, Math.min(96, a.y + move[1])) }));
        return;
      }
      if ((event.key === ' ' || event.key === 'Enter') && now === 'apuntar' && !event.repeat) {
        event.preventDefault();
        live.current.power = 0;
        t0.current = performance.now();
        setStep('fuerza');
        const empieza = performance.now();
        const sube = (at: number) => {
          // Sube y baja sola mientras se mantiene, como la barra de antes.
          const fase = ((at - empieza) % 2400) / 1200;
          const pow = (fase <= 1 ? fase : 2 - fase) * 100;
          live.current.power = pow;
          setPower(Math.round(pow));
          frame = requestAnimationFrame(sube);
        };
        frame = requestAnimationFrame(sube);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (keys.current.step !== 'fuerza') return;
      event.preventDefault();
      cancelAnimationFrame(frame);
      if (live.current.power < 8) {
        setStep('apuntar');
        return;
      }
      keys.current.fire();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /* ------------------------------------------------------------ pintura */

  // Hasta que el balón llega, el marcador sigue como estaba: el tiro ya está
  // anotado, pero enseñarlo antes chivaría el final.
  const antes = Boolean(fired) && !landed;
  const marcador = {
    scored: landed ? (resultNow?.scored ?? scored) : scored,
    taken: landed ? (resultNow?.taken ?? taken) : taken,
    points: antes ? points - (fired?.score.total ?? 0) : points,
    history: antes && !golden ? history.slice(0, -1) : history,
  };
  const type = SHOT_TYPES[fired?.kind ?? kind];
  const outcome = landed ? fired?.shot.outcome : undefined;
  const pulso = Math.abs(wobble.x) / (ABANICO * spread);
  const clavada = step === 'fuerza' && pulso <= 0.14;

  // Un toque en la mano al entrar en la franja verde y cada vez que la mira
  // pasa por el centro: se juega sin tener que mirar el medidor.
  const enVerde = step === 'fuerza' && zona === 'buena';
  const tocado = useRef({ enVerde: false, clavada: false });
  useEffect(() => {
    const sube = (enVerde && !tocado.current.enVerde) || (clavada && !tocado.current.clavada);
    tocado.current = { enVerde, clavada };
    if (!sube) return;
    try {
      navigator.vibrate?.(clavada ? 8 : 15);
    } catch {
      // Hay navegadores que tienen la función y la prohíben.
    }
  }, [enVerde, clavada]);

  const tellText =
    tell === 'centro' ? (
      <>
        Benji se queda <b className="text-amber-300">en el centro</b>
      </>
    ) : (
      <>
        Benji se carga a <b className="text-amber-300">tu {tell}</b>
      </>
    );

  return (
    <div className={`${manga.variable} mx-auto w-full max-w-2xl space-y-3`}>
      <div
        className="relative w-full select-none overflow-hidden rounded-2xl bg-[#0b1220] shadow-[0_14px_40px_-12px_rgba(0,0,0,0.7)] ring-1 ring-black/50
                   [-webkit-touch-callout:none] [-webkit-user-select:none]"
        style={{ aspectRatio: '10 / 13', maxHeight: '78vh' }}
      >
        <div
          ref={host}
          className="absolute inset-0 touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="El campo: toca la portería para apuntar y tira del balón hacia atrás para chutar"
          role="application"
        />

        {/* ---------------------------------------------- el marcador (HUD) */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 transition-opacity sm:p-3 ${replaying ? 'opacity-0' : ''}`}
        >
          <div className="min-w-0">
            <p className="font-manga text-[11px] leading-none tracking-[0.2em] text-white/85 [-webkit-text-stroke:3px_#0b1220] [paint-order:stroke]">
              {golden ? 'TIRO DE ORO' : 'PENALTI'}
            </p>
            <p className="font-manga text-[40px] leading-[0.9] text-white [-webkit-text-stroke:6px_#0b1220] [paint-order:stroke] sm:text-[48px]">
              {golden ? '★' : shooting}
              {!golden && <span className="text-[22px] text-white/80 sm:text-[26px]">/{PENALTY_SHOTS}</span>}
            </p>
            <div className="mt-1 flex gap-1">
              {Array.from({ length: PENALTY_SHOTS }, (_, i) => {
                const idx = i - firstShown;
                const o = idx >= 0 ? marcador.history[idx] : i < marcador.taken ? 'tirado' : undefined;
                const now = i === marcador.taken && !golden;
                return (
                  <span
                    key={i}
                    className={`grid h-5 w-5 place-items-center rounded-full border-2 text-[10px] font-black shadow
                      ${o === 'gol' ? 'border-emerald-200 bg-emerald-500 text-white' : o === 'tirado' ? 'border-slate-300 bg-slate-400 text-white' : o ? 'border-rose-200 bg-rose-500 text-white' : now ? 'animate-pulse border-amber-300 bg-black/40' : 'border-white/50 bg-black/35'}`}
                  >
                    {o === 'gol' ? '✓' : o && o !== 'tirado' ? '✕' : ''}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="rounded-xl bg-[#0b1220]/80 px-2.5 py-1 text-right shadow-lg ring-1 ring-white/15 backdrop-blur">
              <p className="font-manga text-[26px] leading-none text-amber-300 sm:text-[30px]">
                {marcador.points.toLocaleString('es-ES')}
                <span className="ml-1 text-[11px] text-white/70">PTS</span>
              </p>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/60">
                {(landed ? record : recordAntes) > 0
                  ? `Récord ${(landed ? record : recordAntes).toLocaleString('es-ES')}`
                  : 'Sin récord'}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-[#0b1220]/80 px-2 py-0.5 text-[11px] font-black text-white shadow ring-1 ring-white/15">
              <span className="text-emerald-300">{marcador.scored}</span>
              <span className="text-white/50">{marcador.scored === 1 ? 'gol' : 'goles'}</span>
            </div>
          </div>
        </div>

        {/* El aviso de Benji, en la cinta de arriba. */}
        {step === 'apuntar' || step === 'fuerza' ? (
          <div className="pointer-events-none absolute inset-x-0 top-[23%] flex justify-center px-3">
            <p className="max-w-[92%] animate-floatUp rounded-full bg-black/55 px-3 py-1 text-center text-[12px] font-bold leading-tight text-white shadow-lg ring-1 ring-white/10 backdrop-blur">
              {tellText}
              {vigila ? ' · y vigila donde ya le marcaste' : golden ? ' · a tope, vale doble' : tell === 'centro' ? ' · pégala a un palo' : ' · ¡al otro lado!'}
            </p>
          </div>
        ) : null}

        {/* El tirachinas: la goma del balón al dedo. */}
        {step === 'fuerza' && finger && ball && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <line
              x1={ball.x}
              y1={ball.y}
              x2={finger.x}
              y2={finger.y}
              stroke={zona === 'buena' ? '#4ade80' : zona === 'pasado' ? '#fb7185' : '#e2e8f0'}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray="2 10"
            />
            <circle cx={finger.x} cy={finger.y} r={22} fill="none" stroke="white" strokeOpacity={0.8} strokeWidth={3} />
            <circle cx={finger.x} cy={finger.y} r={8} fill="white" fillOpacity={0.9} />
          </svg>
        )}

        {/* La pista de cómo se juega: una mano fantasma que tira del balón, encima del balón. */}
        {step === 'apuntar' && !cartel && ball && (
          <div className="pointer-events-none absolute z-10" style={{ left: ball.x, top: ball.y }} aria-hidden>
            <style>{`
              @keyframes tirachinas-mano { 0%, 12% { transform: translate(-50%, -30%); opacity: 0 } 22% { opacity: 1 } 62% { transform: translate(-50%, 70px); opacity: 1 } 72%, 100% { transform: translate(-50%, 70px); opacity: 0 } }
              @keyframes tirachinas-goma { 0%, 18% { height: 0; opacity: 0 } 62% { height: 70px; opacity: 0.9 } 72%, 100% { height: 70px; opacity: 0 } }
            `}</style>
            <span
              className="absolute left-0 top-0 w-1.5 -translate-x-1/2 rounded-full bg-[repeating-linear-gradient(180deg,#4ade80_0_6px,transparent_6px_12px)]"
              style={{ animation: 'tirachinas-goma 2.2s ease-in-out infinite' }}
            />
            <span className="absolute left-0 top-0 text-[30px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" style={{ animation: 'tirachinas-mano 2.2s ease-in-out infinite' }}>
              👆
            </span>
          </div>
        )}
        {step === 'apuntar' && !cartel && (
          <div className="pointer-events-none absolute inset-x-[26%] bottom-[3%] z-10 flex justify-center">
            <div className="animate-floatUp rounded-2xl bg-white/90 px-2.5 py-1 text-center text-[10px] font-black leading-tight text-[#0b1220] shadow-lg">
              Estira el balón hacia atrás y suelta
            </div>
          </div>
        )}

        {/* ------------------------------------ abajo: el tiro y el medidor */}
        {(step === 'apuntar' || step === 'fuerza') && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-2.5 sm:p-3">
            <div className="pointer-events-auto relative">
              {tray && (
                <div className="absolute bottom-full left-0 mb-2 grid w-[min(86vw,330px)] animate-pop grid-cols-4 gap-1.5 rounded-2xl bg-[#0b1220]/92 p-2 shadow-2xl ring-1 ring-white/15 backdrop-blur">
                  {SHOT_ORDER.map((id) => {
                    const t = SHOT_TYPES[id];
                    const ok = shotAvailability(id, result);
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={!ok.ok}
                        onClick={() => {
                          setKind(id);
                          setTray(false);
                        }}
                        className={`flex flex-col items-center rounded-xl px-1 py-1.5 text-center text-[10px] font-black leading-tight text-white ring-2 transition
                          ${kind === id ? 'bg-white/20 ring-amber-300' : 'bg-white/5 ring-transparent'} disabled:opacity-35`}
                        style={{ boxShadow: kind === id ? `0 0 18px ${t.color}66` : undefined }}
                      >
                        <span className="text-xl leading-none">{t.icon}</span>
                        <span className="mt-0.5">{t.short}</span>
                        <span className="text-[9px] text-amber-300">{t.cost ? '⚡'.repeat(t.cost) : 'gratis'}</span>
                        {ok.reason === 'usado' && <span className="text-[8px] text-white/60">usado</span>}
                      </button>
                    );
                  })}
                  <p className="col-span-4 px-1 pt-1 text-[11px] leading-snug text-white/80">
                    <b style={{ color: SHOT_TYPES[kind].color === '#f4f4f2' ? '#fde68a' : SHOT_TYPES[kind].color }}>
                      {SHOT_TYPES[kind].name}:
                    </b>{' '}
                    {SHOT_TYPES[kind].blurb}
                  </p>
                </div>
              )}
              <button
                type="button"
                disabled={step !== 'apuntar'}
                onClick={() => setTray((v) => !v)}
                className="flex flex-col items-center"
                aria-label={`Tiro elegido: ${SHOT_TYPES[kind].name}. Cambiar`}
              >
                <span
                  className="grid h-16 w-16 place-items-center rounded-2xl border-[3px] border-white bg-gradient-to-b from-indigo-500 to-indigo-800 text-[34px] shadow-[0_4px_0_rgba(0,0,0,0.45),0_0_22px_rgba(99,102,241,0.55)]"
                  style={kind !== 'normal' ? { background: `radial-gradient(circle at 50% 35%, ${SHOT_TYPES[kind].color}, #1e1b4b)` } : undefined}
                >
                  {SHOT_TYPES[kind].icon}
                </span>
                <span className="mt-1 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                  {step === 'apuntar' ? 'Cambiar tiro' : SHOT_TYPES[kind].short}
                </span>
                <span className="mt-0.5 flex gap-0.5" aria-label={`Energía: ${energyLeft(result)}`}>
                  {Array.from({ length: Math.max(0, Math.min(8, energyLeft(result))) }, (_, i) => (
                    <span key={i} className="text-[12px] drop-shadow">⚡</span>
                  ))}
                </span>
              </button>
            </div>

            <Medidor power={power} band={[low, high]} active={step === 'fuerza'} clavada={clavada} />
          </div>
        )}

        {/* ----------------------------------------------- el corte especial */}
        {step === 'corte' && fired && fired.kind !== 'normal' && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden bg-[#241a14]">
            <FondoTiro kind={fired.kind} className="absolute inset-0 h-full w-full animate-pop" />
            <div className="absolute inset-y-[14%] left-[5%] w-[52%] animate-entra">
              <Vineta who={shooter} className="h-full w-full border-4 border-[#241a14] shadow-[5px_5px_0_#241a14]" />
            </div>
            <p className="absolute inset-x-[4%] bottom-[10%] animate-golpe text-right font-manga text-[clamp(30px,10vw,54px)] leading-[0.95] tracking-wide text-white [paint-order:stroke] [-webkit-text-stroke:7px_#241a14]">
              {SHOT_TYPES[fired.kind].shout}
            </p>
          </div>
        )}

        {/* El grito del narrador mientras vuela. */}
        {step === 'vuelo' && !landed && fired && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[6%] flex justify-center">
            <p className="animate-golpe font-manga text-[clamp(22px,7vw,34px)] italic text-white [-webkit-text-stroke:5px_#0b1220] [paint-order:stroke]">
              {fired.kind === 'normal' ? `¡${shooterName} chuta!` : `¡${SHOT_TYPES[fired.kind].short.toUpperCase()}!`}
            </p>
          </div>
        )}

        {/* El cartel de turno. */}
        {cartel && step === 'apuntar' && (
          <div className="pointer-events-none absolute inset-x-0 top-[40%] flex justify-center">
            <div className="animate-rotulo px-[8%] py-1.5 [clip-path:polygon(4%_0,100%_0,96%_100%,0_100%)]" style={{ background: golden ? 'linear-gradient(90deg,#f59e0b,#fde68a,#f59e0b)' : 'linear-gradient(90deg,#16a34a,#4ade80,#16a34a)' }}>
              <p className="font-manga text-[clamp(30px,10vw,52px)] leading-none text-white [-webkit-text-stroke:6px_#0b1220] [paint-order:stroke]">
                {golden ? '¡TIRO DE ORO!' : `PENALTI ${shooting}`}
              </p>
            </div>
          </div>
        )}

        {/* El resultado. */}
        {outcome && fired && !replaying && (
          <>
            {outcome === 'gol' && <div aria-hidden className="pointer-events-none absolute inset-0 animate-fogonazo bg-white" />}
            <div className="pointer-events-none absolute inset-x-0 top-[56%] z-20 flex flex-col items-center">
              <div
                className={`relative animate-rotulo overflow-hidden px-[8%] py-1 [clip-path:polygon(4%_0,100%_0,96%_100%,0_100%)]
                  ${outcome === 'gol' ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400' : outcome === 'parada' ? 'bg-gradient-to-r from-sky-600 via-[#0b1220] to-sky-600' : 'bg-gradient-to-r from-slate-600 via-slate-800 to-slate-600'}`}
              >
                <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-barrido bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                <p className="relative font-manga text-[clamp(40px,13vw,72px)] leading-none tracking-wide text-white [paint-order:stroke] [-webkit-text-stroke:7px_#241a14]">
                  {TITULAR[outcome]}
                </p>
              </div>
              {fired.score.total > 0 && (
                <div className="mt-2 flex flex-wrap justify-center gap-1 px-4 [animation-delay:250ms]">
                  <Chip on={fired.score.gol > 0} label={outcome === 'gol' ? 'Gol' : 'Palo'} value={fired.score.gol} />
                  <Chip on={fired.score.colocacion > 0} label="Colocado" value={fired.score.colocacion} />
                  <Chip on={fired.score.diana > 0} label={fired.score.hit?.dorada ? '★ Diana de oro' : 'Diana'} value={fired.score.diana} gold />
                  <Chip on={fired.score.punteria > 0} label="Pulso" value={fired.score.punteria} />
                  <Chip on={fired.score.especial > 0} label={type.short} value={fired.score.especial} />
                  {golden && <Chip on label="Oro ×2" value={fired.score.total / 2} gold />}
                </div>
              )}
            </div>
          </>
        )}

        {replaying && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
            <div className="absolute inset-x-0 top-0 h-[8%] bg-black" />
            <div className="absolute inset-x-0 bottom-0 h-[8%] bg-black" />
            <div className="absolute right-[3%] top-[10%] flex items-center gap-1.5 rounded bg-[#0b1220]/90 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
              Repetición
            </div>
          </div>
        )}
      </div>

      {/* El narrador: por qué ha pasado lo que ha pasado. */}
      {step === 'visto' && fired && (
        <div className="animate-floatUp space-y-2">
          <p className="rounded-2xl bg-[#0b1220] px-3.5 py-2.5 text-[13px] font-bold leading-snug text-white" aria-live="polite">
            <span className="mr-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]">Directo</span>
            {fired.shot.why}
          </p>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button
              type="button"
              onClick={replay}
              disabled={replaying}
              className="flex min-h-[3.5rem] items-center justify-center gap-1.5 rounded-2xl bg-[#0b1220] px-4 text-sm font-black uppercase tracking-wide text-white shadow-[0_5px_0_rgba(0,0,0,0.45)] active:translate-y-[3px] disabled:opacity-60"
              aria-label="Ver la repetición a cámara lenta"
            >
              <span aria-hidden className="text-lg">⟲</span>
              <span className="hidden sm:inline">Repetición</span>
            </button>
            <button
              type="button"
              onClick={onNext}
              autoFocus
              className="flex min-h-[3.5rem] items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-300 to-orange-500 px-4 text-lg font-black uppercase tracking-wide text-[#241a14] shadow-[0_5px_0_rgba(0,0,0,0.45)] active:translate-y-[3px]"
            >
              {golden || taken + 1 >= PENALTY_SHOTS ? '🏁 Ver el resumen' : `Penalti ${taken + 2} ▶`}
            </button>
          </div>
        </div>
      )}

      {(step === 'apuntar' || step === 'fuerza') && (
        <p className="px-2 text-center text-[11px] leading-snug t-3">
          <b>Apunta</b> tocando la portería · <b>tira del balón hacia atrás</b> y suelta en verde · suelta cuando la mira pase por el centro.
          <span className="hidden md:inline"> Con teclado: flechas y mantén Espacio.</span>
        </p>
      )}
    </div>
  );
}

/** Una partida de los puntos. */
function Chip({ on, label, value, gold }: { on: boolean; label: string; value: number; gold?: boolean }) {
  if (!on) return null;
  return (
    <span
      className={`animate-pop rounded-full px-2 py-0.5 text-[11px] font-black shadow ring-1 ${gold ? 'bg-amber-300 text-[#241a14] ring-amber-100' : 'bg-[#0b1220]/85 text-white ring-white/20'}`}
    >
      {label} <span className={gold ? '' : 'text-amber-300'}>+{value}</span>
    </span>
  );
}

/**
 * El medidor de potencia, como el velocímetro de un juego de coches: un arco
 * con la franja verde marcada y la aguja de lo que se está estirando.
 */
function Medidor({ power, band, active, clavada }: { power: number; band: [number, number]; active: boolean; clavada: boolean }) {
  const R = 38;
  const inicio = 135;
  const barrido = 270;
  const arco = (a: number, b: number) => {
    const p = (deg: number) => {
      const r = ((inicio + (deg / 100) * barrido) * Math.PI) / 180;
      return [50 + R * Math.cos(r), 50 + R * Math.sin(r)];
    };
    const [x1, y1] = p(a);
    const [x2, y2] = p(b);
    const grande = ((b - a) / 100) * barrido > 180 ? 1 : 0;
    return `M${x1} ${y1} A${R} ${R} 0 ${grande} 1 ${x2} ${y2}`;
  };
  const zona = power < band[0] ? 'flojo' : power > band[1] ? 'pasado' : 'buena';
  const color = zona === 'buena' ? '#4ade80' : zona === 'pasado' ? '#fb7185' : '#e2e8f0';
  return (
    <div className={`relative h-[92px] w-[92px] transition-transform ${active ? 'scale-105' : 'opacity-85'}`} aria-label={`Potencia ${power}`}>
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_3px_6px_rgba(0,0,0,0.6)]">
        <circle cx="50" cy="50" r="47" fill="#0b1220" fillOpacity="0.72" />
        <path d={arco(0, 100)} stroke="#334155" strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d={arco(band[0], band[1])} stroke="#166534" strokeWidth="9" fill="none" />
        {power > 0 && <path d={arco(0, Math.max(1, power))} stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-manga text-[26px] leading-none text-white">{power}</span>
        <span className="text-[8px] font-black uppercase tracking-[0.14em] text-white/70">Potencia</span>
        {active && (
          <span className={`mt-0.5 rounded px-1 text-[8px] font-black uppercase ${clavada ? 'bg-sky-400 text-[#0b1220]' : 'bg-white/10 text-white/70'}`}>
            {clavada ? '¡Pulso!' : zona === 'pasado' ? 'Te pasas' : zona === 'flojo' ? 'Más' : '¡Suelta!'}
          </span>
        )}
      </div>
    </div>
  );
}
