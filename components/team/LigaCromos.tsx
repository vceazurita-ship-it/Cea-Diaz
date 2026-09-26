'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { CromoPortrait } from '@/components/ui/CromoPortrait';
import { Modal } from '@/components/ui/Modal';
import {
  EMPUJE_TECNICA,
  PUNTOS_CAMPEON,
  RIVALES,
  apuntarJornada,
  guardarLiga,
  jugadasDe,
  leerLiga,
  nuevaLiga,
  onceDe,
  resolver,
  rivalDe,
  semillaPartido,
  tecnicasDe,
  type Desenlace,
  type Jugada,
  type Jugador,
  type Liga,
  type Once,
  type Opcion,
  type Rival,
} from '@/lib/ligaCromos';
import { manga } from '@/components/games/mangaFont';
import { playCue } from '@/lib/sound';
import type { CromoReward, DateKey, Lineup, ProfileId, UnlockedReward } from '@/types';

/* =========================================================================
 *  La Liga de los Cromos, en pantalla.
 *
 *  La tarjeta enseña el once tal y como lo ha montado en el campograma, con
 *  sus líneas de química encendidas, su media y el rival que toca; el
 *  partido se juega en un diálogo, jugada a jugada. Las reglas están en
 *  `lib/ligaCromos.ts`.
 * ========================================================================= */

interface LigaCromosProps {
  profileId: ProfileId;
  name: string;
  date: DateKey;
  rewards: UnlockedReward[];
  lineup: Lineup;
  kid: boolean;
  headingClass: string;
}

/** Los cromos del álbum, sin repetidos. */
function plantillaDe(rewards: UnlockedReward[]): Map<string, CromoReward> {
  const out = new Map<string, CromoReward>();
  for (const { reward } of rewards) {
    if (reward.kind === 'cromo' && !out.has(reward.id)) out.set(reward.id, reward);
  }
  return out;
}

export function LigaCromos({ profileId, name, date, rewards, lineup, kid, headingClass }: LigaCromosProps) {
  const plantilla = useMemo(() => plantillaDe(rewards), [rewards]);
  const once = useMemo(() => onceDe(lineup, plantilla), [lineup, plantilla]);
  const tecnicas = useMemo(() => tecnicasDe([...plantilla.values()]), [plantilla]);

  const [liga, setLiga] = useState<Liga>(nuevaLiga());
  useEffect(() => setLiga(leerLiga(profileId)), [profileId]);

  const [jugando, setJugando] = useState<{ oficial: boolean; rival: Rival; semilla: string; jornada: number } | null>(null);
  const [amistosos, setAmistosos] = useState(0);

  const rival = rivalDe(liga.jornada, liga.temporada);
  const oficialHoy = liga.ultima !== date;
  const equipo = lineup.teamName?.trim() || `${name} F.C.`;

  const empezar = (oficial: boolean) => {
    setJugando({ oficial, rival, semilla: semillaPartido(profileId, date, oficial, amistosos), jornada: liga.jornada + 1 });
    if (!oficial) setAmistosos((n) => n + 1);
  };

  return (
    <div className={`${manga.variable} ${kid ? 'card-kid' : 'card'} overflow-hidden p-0`}>
      {/* La cabecera, como la de una retransmisión. */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#132046] to-[#0b1220] px-4 pb-3 pt-4 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-400/20 blur-2xl" />
        <div className="relative flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Temporada {liga.temporada}</p>
            <h3 className={`${headingClass} !mb-0 !text-white`}>🏆 La Liga de los Cromos</h3>
            <p className="mt-0.5 text-[12px] text-white/70">Tu once del campograma contra los equipos de la serie.</p>
          </div>
          {liga.titulos > 0 && (
            <span className="shrink-0 rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-black text-[#241a14]">
              {'🏆'.repeat(Math.min(5, liga.titulos))} {liga.titulos > 5 ? `×${liga.titulos}` : ''}
            </span>
          )}
        </div>

        {/* La escalera de la liga: ocho rivales, de menos a más. */}
        <ol className="relative mt-3 flex gap-1" aria-label="Jornadas">
          {RIVALES.map((r, i) => {
            const res = i < liga.jornada ? liga.resultados[liga.resultados.length - liga.jornada + i] : undefined;
            const estado = !res ? (i === liga.jornada ? 'ahora' : 'luego') : res.gf > res.gc ? 'gana' : res.gf === res.gc ? 'empata' : 'pierde';
            return (
              <li
                key={r.id}
                title={`${r.nombre}${res ? ` · ${res.gf}-${res.gc}` : ''}`}
                className={`flex min-w-0 flex-1 flex-col items-center rounded-lg py-1 text-center ring-1
                  ${estado === 'ahora' ? 'bg-amber-300/20 ring-amber-300' : estado === 'gana' ? 'bg-emerald-500/25 ring-emerald-400/60' : estado === 'empata' ? 'bg-slate-400/20 ring-slate-300/40' : estado === 'pierde' ? 'bg-rose-500/20 ring-rose-400/50' : 'bg-white/5 ring-white/10'}`}
              >
                <span className="text-base leading-none">{r.escudo}</span>
                <span className="mt-0.5 text-[9px] font-black leading-none">{res ? `${res.gf}-${res.gc}` : i + 1}</span>
              </li>
            );
          })}
        </ol>
        <p className="relative mt-1.5 text-[11px] font-bold text-white/80">
          {liga.puntos} puntos · para ser campeón hacen falta {PUNTOS_CAMPEON} en las ocho jornadas
        </p>
      </div>

      <div className="space-y-3 p-4">
        {!once.completo ? (
          <div className="rounded-2xl border-2 border-dashed hairline p-4 text-center">
            <p className="text-3xl">🧩</p>
            <p className="mt-1 font-black">Te {once.faltan === 1 ? 'falta 1 jugador' : `faltan ${once.faltan} jugadores`} en el once</p>
            <p className="mt-0.5 text-sm t-2">Completa el campograma de arriba y tu equipo podrá jugar la liga.</p>
          </div>
        ) : (
          <>
            <MiniCampo once={once} />

            <div className="grid grid-cols-4 gap-1.5 text-center">
              <Dato titulo="Media" valor={once.media} grande />
              <Dato titulo="Química" valor={`${once.quimica}/${once.quimicaMax}`} />
              <Dato titulo="Ataque" valor={once.atq} />
              <Dato titulo="Defensa" valor={once.def} />
            </div>
            <p className="text-[12px] leading-snug t-2">
              <b>Química:</b> dos vecinos del mismo club se entienden y suben su media. Junta a los del mismo equipo en el
              campograma y mira cómo se encienden las líneas verdes.
              {lineup.captain ? ' El capitán 🅒 tira de su línea.' : ' Ponle el brazalete a uno: el capitán tira de su línea.'}
            </p>

            {/* El rival que toca. */}
            <div className="flex items-center gap-3 rounded-2xl p-3 ring-1 ring-black/10" style={{ background: `${rival.color}18` }}>
              <span
                className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl shadow"
                style={{ background: rival.color, color: rival.tinta }}
              >
                {rival.escudo}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] t-3">
                  Jornada {Math.min(liga.jornada + 1, RIVALES.length)} de {RIVALES.length}
                </p>
                <p className="truncate text-lg font-black leading-tight">
                  {equipo} <span className="t-3">vs</span> {rival.nombre}
                </p>
                <p className="truncate text-[12px] t-2">{rival.lema}</p>
              </div>
            </div>
            <Comparar once={once} rival={rival} />

            <button
              type="button"
              onClick={() => empezar(oficialHoy)}
              className="flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-300 to-orange-500
                         px-4 text-lg font-black uppercase tracking-wide text-[#241a14] shadow-[0_5px_0_rgba(0,0,0,0.35)] active:translate-y-[3px]"
            >
              ⚽ {oficialHoy ? `¡Jugar la jornada ${liga.jornada + 1}!` : `Amistoso contra el ${rival.nombre}`}
            </button>
            {!oficialHoy && (
              <p className="text-center text-[11px] t-3">
                La jornada de hoy ya está jugada. Los amistosos no cuentan para la liga: sirven para probar alineaciones.
              </p>
            )}
            {tecnicas.length > 0 && (
              <p className="text-center text-[11px] t-2">
                Tus técnicas ({tecnicas.map((t) => t.emblem).join(' ')}) se pueden usar una vez por partido: +
                {Math.round(EMPUJE_TECNICA * 100)}% a la jugada.
              </p>
            )}
          </>
        )}
      </div>

      {jugando && (
        <Modal title={jugando.oficial ? `Jornada ${jugando.jornada}` : 'Amistoso'} size="lg" onClose={() => setJugando(null)}>
          <Partido
            once={once}
            rival={jugando.rival}
            semilla={jugando.semilla}
            equipo={equipo}
            tecnicas={tecnicas}
            oficial={jugando.oficial}
            onFin={(gf, gc) => {
              if (!jugando.oficial) return null;
              const { liga: nueva, fin } = apuntarJornada(liga, { rival: jugando.rival.id, gf, gc, fecha: date });
              setLiga(nueva);
              guardarLiga(profileId, nueva);
              return fin ?? null;
            }}
            onClose={() => setJugando(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function Dato({ titulo, valor, grande }: { titulo: string; valor: number | string; grande?: boolean }) {
  return (
    <div className="rounded-xl surf-2 px-1 py-1.5">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] t-3">{titulo}</p>
      <p className={`font-black leading-tight ${grande ? 'text-2xl text-amber-500' : 'text-lg'}`}>{valor}</p>
    </div>
  );
}

/** Las tres líneas del once contra las del rival, en barras. */
function Comparar({ once, rival }: { once: Once; rival: Rival }) {
  const filas: [string, number, number][] = [
    ['Ataque', once.atq, rival.atq],
    ['Medio', once.med, rival.med],
    ['Defensa', once.def, rival.def],
  ];
  return (
    <div className="space-y-1">
      {filas.map(([k, a, b]) => (
        <div key={k} className="grid grid-cols-[2rem_1fr_4rem_1fr_2rem] items-center gap-1.5 text-[11px] font-black">
          <span className={`text-right ${a >= b ? 'text-emerald-600' : 't-2'}`}>{a}</span>
          <span className="h-2 overflow-hidden rounded-full surf-2">
            <span className="float-right block h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(8, (a - 50) * 2)}%` }} />
          </span>
          <span className="text-center text-[9px] uppercase tracking-wide t-3">{k}</span>
          <span className="h-2 overflow-hidden rounded-full surf-2">
            <span className="block h-full rounded-full bg-rose-500" style={{ width: `${Math.max(8, (b - 50) * 2)}%` }} />
          </span>
          <span className={b > a ? 'text-rose-600' : 't-2'}>{b}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * El campo pequeño: el once con sus líneas de química
 * ----------------------------------------------------------------------- */

function Campo({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl ring-1 ring-black/20 ${className}`}
      style={{
        background:
          'repeating-linear-gradient(180deg,#2f8f3f 0 10%,#28803a 10% 20%)',
      }}
    >
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.5" vectorEffect="non-scaling-stroke">
          <rect x="2" y="1.5" width="96" height="97" />
          <line x1="2" y1="50" x2="98" y2="50" />
          <circle cx="50" cy="50" r="9" />
          <rect x="25" y="1.5" width="50" height="14" />
          <rect x="38" y="1.5" width="24" height="5" />
          <rect x="25" y="84.5" width="50" height="14" />
          <rect x="38" y="93.5" width="24" height="5" />
        </g>
      </svg>
      {children}
    </div>
  );
}

function MiniCampo({ once }: { once: Once }) {
  const pos = new Map(once.jugadores.map((j) => [j.slot.id, j.slot]));
  const con = new Set(once.enlaces.map(([a, b]) => `${a}|${b}`));
  return (
    <Campo className="aspect-[4/5]">
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {once.vecinos.map(([a, b]) => {
          const pa = pos.get(a);
          const pb = pos.get(b);
          if (!pa || !pb) return null;
          const on = con.has(`${a}|${b}`);
          return (
            <line
              key={`${a}|${b}`}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={on ? '#4ade80' : 'rgba(255,255,255,0.25)'}
              strokeWidth={on ? 3 : 1.2}
              strokeDasharray={on ? undefined : '2 3'}
              vectorEffect="non-scaling-stroke"
              className={on ? 'drop-shadow-[0_0_4px_#4ade80]' : ''}
            />
          );
        })}
      </svg>
      {once.jugadores.map((j) => (
        <Ficha key={j.slot.id} j={j} />
      ))}
    </Campo>
  );
}

function Ficha({ j, brilla, apagada }: { j: Jugador; brilla?: boolean; apagada?: boolean }) {
  return (
    <div
      className={`absolute flex w-[18%] -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-all duration-300 ${apagada ? 'opacity-45' : ''} ${brilla ? 'z-10 scale-125' : ''}`}
      style={{ left: `${j.slot.x}%`, top: `${j.slot.y}%` }}
    >
      <div className={`relative rounded-full ring-2 ${brilla ? 'ring-amber-300 shadow-[0_0_16px_#fbbf24]' : j.fuera ? 'ring-amber-500' : 'ring-white/80'}`}>
        <CromoPortrait cromo={j.cromo} size="xs" round />
        <span className="absolute -bottom-1 -right-2 rounded-md bg-[#0b1220] px-1 text-[9px] font-black leading-tight text-amber-300 ring-1 ring-white/30">
          {j.media}
        </span>
        {j.capitan && (
          <span className="absolute -left-1.5 -top-1 grid h-4 w-4 place-items-center rounded-full bg-amber-300 text-[8px] font-black text-[#241a14]">
            C
          </span>
        )}
      </div>
      <span className="mt-0.5 max-w-full truncate rounded bg-black/55 px-1 text-[9px] font-bold leading-tight text-white">
        {corto(j.cromo.name)}
      </span>
      {j.quimica > 0 && (
        <span className="text-[8px] leading-none text-emerald-200" aria-label={`química ${j.quimica}`}>
          {'●'.repeat(j.quimica)}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * El partido
 * ----------------------------------------------------------------------- */

type Fase = 'previa' | 'jugada' | 'accion' | 'desenlace' | 'final';

interface PartidoProps {
  once: Once;
  rival: Rival;
  semilla: string;
  equipo: string;
  tecnicas: CromoReward[];
  oficial: boolean;
  /** Apunta el resultado; si era la última jornada, dice cómo acabó la liga. */
  onFin: (gf: number, gc: number) => { campeon: boolean; puntos: number } | null;
  onClose: () => void;
}

const ARCO_RIVAL = { x: 50, y: 99 };
const ARCO_NUESTRO = { x: 50, y: 1 };

function Partido({ once, rival, semilla, equipo, tecnicas, oficial, onFin, onClose }: PartidoProps) {
  const jugadas = useMemo(() => jugadasDe(once, rival, semilla), [once, rival, semilla]);
  const [fase, setFase] = useState<Fase>('previa');
  const [n, setN] = useState(0);
  const [gf, setGf] = useState(0);
  const [gc, setGc] = useState(0);
  const [tecnica, setTecnica] = useState<string | null>(null);
  const [gastadas, setGastadas] = useState<string[]>([]);
  const [elegida, setElegida] = useState<Opcion | null>(null);
  const [desenlace, setDesenlace] = useState<Desenlace | null>(null);
  const [balon, setBalon] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [lucen, setLucen] = useState<Record<string, number>>({});
  const [cronica, setCronica] = useState<{ minuto: number; texto: string; gol?: 'favor' | 'contra' }[]>([]);
  const [finLiga, setFinLiga] = useState<{ campeon: boolean; puntos: number } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const luego = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const jugada: Jugada | undefined = jugadas[n];
  const tecnicaUsada = tecnicas.find((t) => t.id === tecnica);

  // Al empezar cada jugada, el balón va a donde empieza.
  useEffect(() => {
    if (fase !== 'jugada' || !jugada) return;
    if (jugada.tipo === 'ataque') setBalon({ x: 50, y: 50 });
    else setBalon({ x: 50, y: 78 });
  }, [fase, jugada]);

  const elegir = (o: Opcion) => {
    if (!jugada) return;
    setElegida(o);
    setFase('accion');
    const res = resolver(jugada, o, semilla, Boolean(tecnica), rival);
    if (tecnica) setGastadas((g) => [...g, tecnica]);
    setTecnica(null);

    // La jugada, dibujada: el balón va al que actúa, y de ahí a donde acabe.
    const de = o.de.slot;
    setBalon({ x: de.x, y: de.y });
    let t = 550;
    if (jugada.tipo === 'ataque') {
      if (o.a) {
        luego(() => setBalon({ x: o.a!.slot.x, y: o.a!.slot.y }), t);
        t += 550;
      }
      luego(() => setBalon(res.gol ? ARCO_RIVAL : { x: 50 + (hashCorta(semilla + n) % 30) - 15, y: 90 }), t);
    } else {
      luego(() => setBalon(res.bien ? { x: de.x, y: de.y + 4 } : res.gol ? ARCO_NUESTRO : { x: 64, y: 0 }), t);
    }
    t += 650;
    luego(() => {
      setDesenlace(res);
      setFase('desenlace');
      if (res.gol && jugada.tipo === 'ataque') {
        setGf((g) => g + 1);
        playCue('gol');
      } else if (res.gol) {
        setGc((g) => g + 1);
        playCue('fuera');
      } else if (res.bien) {
        playCue('parada');
      }
      if (res.bien) {
        const ids = [o.de.cromo.id, ...(o.a && res.gol ? [o.a.cromo.id] : [])];
        setLucen((l) => {
          const out = { ...l };
          ids.forEach((id, i) => (out[id] = (out[id] ?? 0) + (i === 0 ? 2 : 1)));
          return out;
        });
      }
      setCronica((c) => [
        ...c,
        {
          minuto: jugada.minuto,
          texto: res.texto,
          gol: res.gol ? (jugada.tipo === 'ataque' ? 'favor' : 'contra') : undefined,
        },
      ]);
    }, t);
  };

  const siguiente = () => {
    setElegida(null);
    setDesenlace(null);
    if (n + 1 >= jugadas.length) {
      setFinLiga(onFin(gf, gc));
      setFase('final');
      playCue(gf > gc ? 'gol' : 'parada');
      return;
    }
    setN(n + 1);
    setFase('jugada');
  };

  const mvp = useMemo(() => {
    const top = Object.entries(lucen).sort((a, b) => b[1] - a[1])[0];
    return top ? once.jugadores.find((j) => j.cromo.id === top[0]) : undefined;
  }, [lucen, once]);

  const involucrados = new Set(
    elegida ? [elegida.de.slot.id, elegida.a?.slot.id].filter(Boolean) : fase === 'jugada' && jugada ? jugada.opciones.flatMap((o) => [o.de.slot.id, o.a?.slot.id]).filter(Boolean) : [],
  );

  /* ------------------------------------------------------------- pintura */

  const marcador = (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#0b1220] px-3 py-2 text-white">
      <span className="min-w-0 flex-1 truncate text-sm font-black">{equipo}</span>
      <span className="font-manga rounded-lg bg-white px-2.5 py-0.5 text-2xl font-black tabular-nums text-[#0b1220]">
        {gf} - {gc}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1 truncate text-sm font-black">
        {rival.nombre}
        <span className="grid h-6 w-6 place-items-center rounded-md text-sm" style={{ background: rival.color }}>
          {rival.escudo}
        </span>
      </span>
    </div>
  );

  if (fase === 'previa') {
    return (
      <div className={`${manga.variable} space-y-3`}>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b1220] to-[#1e2a78] p-4 text-center text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">{oficial ? 'Partido de liga' : 'Amistoso'}</p>
          <div className="mt-2 flex items-center justify-center gap-3">
            <div className="flex-1">
              <p className="text-4xl font-black text-amber-300">{once.media}</p>
              <p className="truncate text-sm font-black">{equipo}</p>
            </div>
            <span className="text-2xl font-black text-white/60">VS</span>
            <div className="flex-1">
              <p className="text-4xl">{rival.escudo}</p>
              <p className="truncate text-sm font-black">{rival.nombre}</p>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-white/75">{rival.lema}</p>
        </div>
        <Comparar once={once} rival={rival} />
        <ul className="space-y-1 rounded-2xl surf-2 p-3 text-[12px] leading-snug">
          <li>⚽ Seis jugadas. En cada una eliges <b>quién</b> hace <b>qué</b>.</li>
          <li>📊 El porcentaje dice lo fácil que es: depende de la media de tus cromos y del rival.</li>
          <li>🟢 Un pase entre dos con química sale mejor.</li>
          {tecnicas.length > 0 && <li>✨ Tus técnicas: una vez por partido, +{Math.round(EMPUJE_TECNICA * 100)}% a la jugada.</li>}
        </ul>
        <button
          type="button"
          onClick={() => {
            setFase('jugada');
            playCue('tiro');
          }}
          className="flex min-h-[3.5rem] w-full items-center justify-center rounded-2xl bg-gradient-to-b from-lime-300 to-emerald-500 text-lg font-black uppercase tracking-wide text-[#0b1f14] shadow-[0_5px_0_rgba(0,0,0,0.35)] active:translate-y-[3px]"
        >
          🟢 ¡Pitido inicial!
        </button>
      </div>
    );
  }

  if (fase === 'final') {
    const gana = gf > gc;
    const empata = gf === gc;
    return (
      <div className={`${manga.variable} space-y-3`}>
        {marcador}
        <div
          className={`rounded-2xl p-4 text-center text-white ${gana ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' : empata ? 'bg-gradient-to-br from-slate-500 to-slate-700' : 'bg-gradient-to-br from-rose-500 to-rose-700'}`}
        >
          <p className="text-4xl">{gana ? '🎉' : empata ? '🤝' : '💪'}</p>
          <p className="text-2xl font-black">{gana ? '¡Victoria!' : empata ? 'Empate' : 'Derrota'}</p>
          <p className="text-sm text-white/85">
            {oficial ? (gana ? '+3 puntos para la liga' : empata ? '+1 punto para la liga' : 'Sin puntos esta vez') : 'Amistoso: no cuenta para la liga'}
          </p>
        </div>
        {finLiga && (
          <div className={`rounded-2xl p-4 text-center ${finLiga.campeon ? 'bg-amber-300 text-[#241a14]' : 'surf-2'}`}>
            <p className="text-4xl">{finLiga.campeon ? '🏆' : '📋'}</p>
            <p className="text-xl font-black">{finLiga.campeon ? '¡CAMPEONES DE LIGA!' : 'Fin de la temporada'}</p>
            <p className="text-sm">
              {finLiga.puntos} puntos.{' '}
              {finLiga.campeon ? 'La próxima temporada los rivales vienen más fuertes.' : `Hacían falta ${PUNTOS_CAMPEON}. ¡La próxima!`}
            </p>
          </div>
        )}
        {mvp && (
          <div className="flex items-center gap-3 rounded-2xl bg-[#0b1220] p-3 text-white">
            <CromoPortrait cromo={mvp.cromo} size="md" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">⭐ Jugador del partido</p>
              <p className="truncate text-lg font-black">{mvp.cromo.name}</p>
              <p className="truncate text-[12px] text-white/70">
                {mvp.cromo.team} · media {mvp.media}
              </p>
            </div>
          </div>
        )}
        <ol className="space-y-1 text-[12px]">
          {cronica.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-8 shrink-0 text-right font-black t-3">{c.minuto}&apos;</span>
              <span className={c.gol === 'favor' ? 'font-black text-emerald-600' : c.gol === 'contra' ? 'font-black text-rose-600' : 't-2'}>
                {c.gol ? '⚽ ' : ''}
                {c.texto}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-center text-[12px] t-3">
          ¿Quieres un equipo mejor? Cumple retos para ganar cromos, y junta a los del mismo club para la química.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-[3.25rem] w-full items-center justify-center rounded-2xl bg-[#0b1220] text-base font-black uppercase tracking-wide text-white"
        >
          Volver
        </button>
      </div>
    );
  }

  if (!jugada) return null;

  return (
    <div className={`${manga.variable} space-y-2.5`}>
      {marcador}
      <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.12em] t-3">
        <span>
          Jugada {n + 1} de {jugadas.length}
        </span>
        <span className="rounded bg-rose-600 px-1.5 py-0.5 text-white">{jugada.minuto}&apos;</span>
      </div>

      <Campo className="aspect-[5/4]">
        {/* Los del rival, en el área de la acción. */}
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[11px] shadow ring-2 ring-white/70 transition-all duration-500"
            style={{
              background: rival.color,
              color: rival.tinta,
              left: `${[35, 55, 70][i]}%`,
              top: `${jugada.tipo === 'ataque' ? [78, 86, 74][i] : [60, 70, 55][i]}%`,
            }}
          >
            {rival.escudo}
          </span>
        ))}
        {once.jugadores.map((j) => (
          <Ficha key={j.slot.id} j={j} brilla={involucrados.has(j.slot.id)} apagada={involucrados.size > 0 && !involucrados.has(j.slot.id)} />
        ))}
        <span
          aria-hidden
          className="absolute z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white text-[10px] leading-4 shadow-[0_0_10px_rgba(255,255,255,0.9)] transition-all duration-500 ease-out"
          style={{ left: `${balon.x}%`, top: `${balon.y}%` }}
        >
          ⚽
        </span>
        {fase === 'desenlace' && desenlace && (desenlace.gol || desenlace.bien) && (
          <div className="pointer-events-none absolute inset-x-0 top-[40%] z-30 flex justify-center">
            <p
              className={`animate-rotulo px-6 py-1 font-manga text-4xl text-white [-webkit-text-stroke:5px_#0b1220] [clip-path:polygon(4%_0,100%_0,96%_100%,0_100%)] [paint-order:stroke]
                ${desenlace.gol ? (jugada.tipo === 'ataque' ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-rose-500 to-rose-700') : 'bg-gradient-to-r from-sky-500 to-indigo-600'}`}
            >
              {desenlace.gol ? (jugada.tipo === 'ataque' ? '¡GOOOL!' : 'Gol de ellos') : jugada.tipo === 'ataque' ? '¡GOL!' : '¡Recuperada!'}
            </p>
          </div>
        )}
      </Campo>

      {fase === 'jugada' && (
        <div className="space-y-2 animate-floatUp">
          <p className="rounded-2xl bg-[#0b1220] px-3 py-2 text-[13px] font-bold leading-snug text-white">
            <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${jugada.tipo === 'ataque' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              {jugada.tipo === 'ataque' ? 'Atacas' : 'Defiendes'}
            </span>
            {jugada.texto}
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {jugada.opciones.map((o) => {
              const p = Math.min(0.95, o.p + (tecnica ? EMPUJE_TECNICA : 0));
              const nivel = p >= 0.55 ? 'Fácil' : p >= 0.38 ? 'Posible' : 'Difícil';
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => elegir(o)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-2xl p-2 text-left ring-1 ring-black/10 transition active:scale-[0.98] surf-2 hover:ring-amber-400"
                >
                  <span className="text-2xl">{o.icono}</span>
                  <span className="flex shrink-0 -space-x-2">
                    <CromoPortrait cromo={o.de.cromo} size="xs" round />
                    {o.a && <CromoPortrait cromo={o.a.cromo} size="xs" round />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-black leading-tight">
                      {o.accion} {o.a ? '' : 'de '}
                      <span className="text-amber-600">{o.de.cromo.name}</span>
                      {o.a && (
                        <>
                          {' → '}
                          <span className="text-amber-600">{o.a.cromo.name}</span>
                        </>
                      )}
                    </span>
                    <span className="block truncate text-[11px] t-3">
                      media {o.de.media}
                      {o.a ? ` y ${o.a.media}` : ''}
                      {o.quimica ? ' · 🟢 tienen química' : ''}
                      {o.de.fuera ? ' · fuera de su puesto' : ''}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-xl px-2 py-1 text-center text-[11px] font-black leading-tight text-white ${p >= 0.55 ? 'bg-emerald-600' : p >= 0.38 ? 'bg-amber-500' : 'bg-rose-600'}`}
                  >
                    {Math.round(p * 100)}%
                    <span className="block text-[9px] font-bold opacity-90">{nivel}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {tecnicas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wide t-3">Técnica:</span>
              {tecnicas.map((t) => {
                const usada = gastadas.includes(t.id);
                const activa = tecnica === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={usada}
                    onClick={() => setTecnica(activa ? null : t.id)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 transition disabled:opacity-35
                      ${activa ? 'bg-amber-300 text-[#241a14] ring-amber-500 shadow-[0_0_12px_#fbbf24]' : 'surf-2 ring-black/10'}`}
                  >
                    {t.emblem} {t.name} {usada ? '· usada' : activa ? '· ¡activa!' : ''}
                  </button>
                );
              })}
            </div>
          )}
          {tecnicaUsada && (
            <p className="text-center text-[11px] font-bold text-amber-600">
              {tecnicaUsada.emblem} {tecnicaUsada.name}: +{Math.round(EMPUJE_TECNICA * 100)}% en la jugada que elijas.
            </p>
          )}
        </div>
      )}

      {fase === 'accion' && elegida && (
        <p className="rounded-2xl bg-[#0b1220] px-3 py-3 text-center text-[14px] font-black italic text-white">
          {elegida.icono} {elegida.accion} de {elegida.de.cromo.name}…
        </p>
      )}

      {fase === 'desenlace' && desenlace && (
        <div className="space-y-2 animate-floatUp">
          <p
            className={`rounded-2xl px-3 py-2.5 text-[14px] font-black leading-snug text-white ${desenlace.gol ? (jugada.tipo === 'ataque' ? 'bg-emerald-600' : 'bg-rose-600') : desenlace.bien ? 'bg-sky-600' : 'bg-slate-600'}`}
          >
            {desenlace.texto}
          </p>
          <button
            type="button"
            onClick={siguiente}
            autoFocus
            className="flex min-h-[3.25rem] w-full items-center justify-center rounded-2xl bg-gradient-to-b from-amber-300 to-orange-500 text-base font-black uppercase tracking-wide text-[#241a14] shadow-[0_5px_0_rgba(0,0,0,0.35)] active:translate-y-[3px]"
          >
            {n + 1 >= jugadas.length ? '🏁 Final del partido' : 'Siguiente jugada ▶'}
          </button>
        </div>
      )}
    </div>
  );
}

/** El nombre que cabe bajo la ficha: el apellido, salvo que sea un «Júnior». */
function corto(nombre: string): string {
  const partes = nombre.split(' ');
  const ultimo = partes[partes.length - 1];
  return /^(J[uú]nior|Jr\.?)$/i.test(ultimo) && partes.length > 1 ? partes[partes.length - 2] : ultimo;
}

/** Un número corto y fijo a partir de un texto, para desviar el balón. */
function hashCorta(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i += 1) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

