import { hashSeed } from '@/lib/challenges';
import { formationOf } from '@/lib/lineup';
import type { CromoLine, CromoReward, DateKey, FormationSlot, Lineup, ProfileId } from '@/types';

/* =========================================================================
 *  La Liga de los Cromos: el once del campograma, jugando.
 *
 *  Hasta ahora los cromos se coleccionaban y se colocaban en el campo, y ahí
 *  se quedaban. Con el once completo ya hay equipo, y un equipo lo que quiere
 *  es jugar. Esto es la liga: ocho jornadas contra los equipos de la serie
 *  —del Otomo al Nankatsu de Oliver y, al final, la selección de Japón—, una
 *  jornada oficial al día y amistosos sin límite.
 *
 *  **Lo que hace que el campograma importe.** El once tiene una media, y la
 *  media sale de tres cosas que el crío controla:
 *
 *   · **Cada cromo**: su mazo (Castilla, Liga, Premier, Leyenda) le da su
 *     nivel. Coleccionar mejores cromos —cumpliendo los retos— sube el equipo.
 *   · **El puesto**: fuera de su línea rinde menos.
 *   · **La química**: dos vecinos del campo del mismo club se entienden. Es
 *     el puzle de verdad: colocar a los del Madrid juntos, a los del Arsenal
 *     juntos, y ver cómo se encienden las líneas.
 *
 *  Y el capitán, que hasta ahora sólo llevaba el brazalete, tira de su línea.
 *
 *  **El partido** son seis jugadas. En cada una se elige **quién** hace
 *  **qué** —el pase de éste a aquél, el regate de otro, la entrada del
 *  central— viendo lo difícil que es cada cosa. Las técnicas de la semana
 *  (el Tiro del León…) se juegan una vez por partido. Todo sale de una
 *  semilla con el perfil, el día y la jugada: recargar no cambia el
 *  resultado.
 * ========================================================================= */

/* ---------------------------------------------------------------------------
 * El nivel de cada cromo
 * ------------------------------------------------------------------------- */

/** El nivel de partida de cada mazo. */
const BASE: Record<string, number> = {
  castilla: 71,
  liga: 79,
  premier: 80,
  leyenda: 88,
};

/**
 * El club, para la química. El filial cuenta como el primer equipo —el
 * Castilla y el Madrid se entienden— y los nombres de un mismo club se
 * juntan.
 */
export function clubDe(team: string): string {
  const t = team.trim();
  if (/^Real Madrid/i.test(t)) return 'Real Madrid';
  if (/Barcelona/i.test(t)) return 'FC Barcelona';
  if (/Atl[eé]tico/i.test(t)) return 'Atlético de Madrid';
  if (/Manchester City/i.test(t)) return 'Manchester City';
  if (/Manchester United/i.test(t)) return 'Manchester United';
  return t;
}

/** El nivel del cromo, sin contar dónde juega. Sale de su mazo y de su nombre. */
export function nivelDe(cromo: CromoReward): number {
  const base = BASE[cromo.rarity] ?? 74;
  return base + (hashSeed(`nivel:${cromo.id}`) % 7) - 3;
}

/* ---------------------------------------------------------------------------
 * El once, con su química
 * ------------------------------------------------------------------------- */

export interface Jugador {
  slot: FormationSlot;
  cromo: CromoReward;
  /** Su nivel de cromo. */
  nivel: number;
  /** Lo que rinde en este once: nivel, puesto, química y capitán. */
  media: number;
  /** De 0 a 3: cuántos vecinos del mismo club tiene. */
  quimica: number;
  fuera: boolean;
  capitan: boolean;
}

export interface Once {
  jugadores: Jugador[];
  /** Pares de ranuras vecinas con química: las líneas que se encienden. */
  enlaces: [string, string][];
  /** Todos los pares de vecinos, con química o sin ella. */
  vecinos: [string, string][];
  quimica: number;
  quimicaMax: number;
  media: number;
  atq: number;
  med: number;
  def: number;
  completo: boolean;
  faltan: number;
}

/** Dos ranuras son vecinas si están cerca en el dibujo del campo. */
function vecinas(a: FormationSlot, b: FormationSlot): boolean {
  if (a.line === 'por' || b.line === 'por') {
    // El portero, con los centrales.
    return Math.abs(a.x - b.x) < 20 && Math.abs(a.y - b.y) < 22;
  }
  return Math.hypot(a.x - b.x, (a.y - b.y) * 1.1) < 33;
}

const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function onceDe(lineup: Lineup, squad: Map<string, CromoReward>): Once {
  const formation = formationOf(lineup.formation);
  const puestos = formation.slots
    .map((slot) => ({ slot, cromo: squad.get(lineup.eleven[slot.id] ?? '') }))
    .filter((p): p is { slot: FormationSlot; cromo: CromoReward } => Boolean(p.cromo));

  const vecinos: [string, string][] = [];
  for (let i = 0; i < formation.slots.length; i += 1) {
    for (let j = i + 1; j < formation.slots.length; j += 1) {
      if (vecinas(formation.slots[i], formation.slots[j])) vecinos.push([formation.slots[i].id, formation.slots[j].id]);
    }
  }

  const porSlot = new Map(puestos.map((p) => [p.slot.id, p.cromo]));
  const enlaces = vecinos.filter(([a, b]) => {
    const ca = porSlot.get(a);
    const cb = porSlot.get(b);
    return ca && cb && clubDe(ca.team) === clubDe(cb.team);
  });

  const capitan = puestos.find((p) => p.cromo.id === lineup.captain);

  const jugadores: Jugador[] = puestos.map(({ slot, cromo }) => {
    const nivel = nivelDe(cromo);
    const quimica = Math.min(3, enlaces.filter(([a, b]) => a === slot.id || b === slot.id).length);
    const fuera = Boolean(cromo.line && cromo.line !== slot.line);
    const esCapitan = capitan?.cromo.id === cromo.id;
    const tiraDeSuLinea = capitan && !esCapitan && capitan.slot.line === slot.line ? 1 : 0;
    return {
      slot,
      cromo,
      nivel,
      media: Math.min(99, nivel + quimica + (fuera ? -6 : 0) + (esCapitan ? 2 : 0) + tiraDeSuLinea),
      quimica,
      fuera,
      capitan: esCapitan,
    };
  });

  const de = (line: CromoLine) => jugadores.filter((j) => j.slot.line === line).map((j) => j.media);
  const por = de('por');
  const quimica = jugadores.reduce((s, j) => s + j.quimica, 0);
  const total = jugadores.length;
  return {
    jugadores,
    enlaces,
    vecinos,
    quimica,
    quimicaMax: formation.slots.length * 3,
    media: Math.round(media(jugadores.map((j) => j.media))),
    atq: Math.round(media(de('del')) * 0.7 + media(de('med')) * 0.3),
    med: Math.round(media(de('med'))),
    def: Math.round(media(de('def')) * 0.75 + (por[0] ?? 60) * 0.25),
    completo: total === formation.slots.length,
    faltan: formation.slots.length - total,
  };
}

/* ---------------------------------------------------------------------------
 * Los rivales: los equipos de la serie, de menos a más
 * ------------------------------------------------------------------------- */

export interface Rival {
  id: string;
  nombre: string;
  escudo: string;
  color: string;
  tinta: string;
  atq: number;
  med: number;
  def: number;
  /** El que más miedo da: sale cuando atacan. */
  estrella: string;
  lema: string;
}

export const RIVALES: Rival[] = [
  { id: 'otomo', nombre: 'Otomo', escudo: '🐗', color: '#b45309', tinta: '#fff', atq: 68, med: 67, def: 67, estrella: 'su delantero centro', lema: 'Duros atrás, poco más.' },
  { id: 'hirado', nombre: 'Hirado', escudo: '🦈', color: '#0f766e', tinta: '#fff', atq: 70, med: 70, def: 73, estrella: 'su central gigante', lema: 'Un muro en el área.' },
  { id: 'furano', nombre: 'Furano', escudo: '❄️', color: '#0369a1', tinta: '#fff', atq: 73, med: 75, def: 72, estrella: 'Philip Callaghan', lema: 'Los del norte, con el capitán Callaghan.' },
  { id: 'meiwa', nombre: 'Meiwa', escudo: '⚡', color: '#7c3aed', tinta: '#fff', atq: 76, med: 75, def: 76, estrella: 'los gemelos Derrick', lema: 'Cuidado con la Catapulta Infernal.' },
  { id: 'musashi', nombre: 'Musashi', escudo: '🎼', color: '#be123c', tinta: '#fff', atq: 78, med: 82, def: 77, estrella: 'Julian Ross', lema: 'El príncipe del campo lo mueve todo.' },
  { id: 'toho', nombre: 'Toho', escudo: '🐯', color: '#1e2a78', tinta: '#fff', atq: 84, med: 80, def: 81, estrella: 'Mark Lenders', lema: 'El Tigre y su tiro.' },
  { id: 'nankatsu', nombre: 'Nankatsu', escudo: '⭐', color: '#f8fafc', tinta: '#1d4ed8', atq: 86, med: 86, def: 85, estrella: 'Oliver', lema: 'El equipo de Oliver, con Benji en la portería.' },
  { id: 'japon', nombre: 'Japón', escudo: '🇯🇵', color: '#1d4ed8', tinta: '#fff', atq: 90, med: 90, def: 89, estrella: 'Oliver y Mark', lema: 'La selección: los mejores de la serie juntos.' },
];

/** Cada temporada acabada, los rivales vienen un poco más fuertes. */
export function rivalDe(jornada: number, temporada: number): Rival {
  const r = RIVALES[Math.min(RIVALES.length - 1, jornada)];
  const extra = Math.min(6, (temporada - 1) * 2);
  return { ...r, atq: r.atq + extra, med: r.med + extra, def: r.def + extra };
}

/* ---------------------------------------------------------------------------
 * La liga guardada: en el aparato, como el récord de los penaltis
 * ------------------------------------------------------------------------- */

export interface Resultado {
  rival: string;
  gf: number;
  gc: number;
  fecha: DateKey;
}

export interface Liga {
  temporada: number;
  /** Jornada que toca, de 0 a 7. */
  jornada: number;
  puntos: number;
  resultados: Resultado[];
  /** Día de la última jornada oficial: una al día. */
  ultima?: DateKey;
  /** Ligas ganadas. */
  titulos: number;
}

const ligaKey = (profileId: ProfileId) => `cromos:liga:${profileId}`;

export function nuevaLiga(temporada = 1, titulos = 0): Liga {
  return { temporada, jornada: 0, puntos: 0, resultados: [], titulos };
}

export function leerLiga(profileId: ProfileId): Liga {
  try {
    const raw = window.localStorage.getItem(ligaKey(profileId));
    if (!raw) return nuevaLiga();
    const data = JSON.parse(raw) as Partial<Liga>;
    return {
      temporada: Math.max(1, Number(data.temporada) || 1),
      jornada: Math.max(0, Math.min(RIVALES.length, Number(data.jornada) || 0)),
      puntos: Math.max(0, Number(data.puntos) || 0),
      resultados: Array.isArray(data.resultados) ? data.resultados.slice(-40) : [],
      ultima: typeof data.ultima === 'string' ? (data.ultima as DateKey) : undefined,
      titulos: Math.max(0, Number(data.titulos) || 0),
    };
  } catch {
    return nuevaLiga();
  }
}

export function guardarLiga(profileId: ProfileId, liga: Liga): void {
  try {
    window.localStorage.setItem(ligaKey(profileId), JSON.stringify(liga));
  } catch {
    // Sin almacenamiento la liga dura lo que la pantalla abierta.
  }
}

/** Los puntos para ser campeón: más de dos tercios de los que hay en juego. */
export const PUNTOS_CAMPEON = 16;

/** Apunta una jornada oficial. Al acabar las ocho, empieza otra temporada. */
export function apuntarJornada(liga: Liga, res: Resultado): { liga: Liga; fin?: { campeon: boolean; puntos: number } } {
  const pts = res.gf > res.gc ? 3 : res.gf === res.gc ? 1 : 0;
  const siguiente: Liga = {
    ...liga,
    jornada: liga.jornada + 1,
    puntos: liga.puntos + pts,
    resultados: [...liga.resultados, res].slice(-40),
    ultima: res.fecha,
  };
  if (siguiente.jornada < RIVALES.length) return { liga: siguiente };
  const campeon = siguiente.puntos >= PUNTOS_CAMPEON;
  const otra = nuevaLiga(liga.temporada + 1, liga.titulos + (campeon ? 1 : 0));
  otra.ultima = res.fecha;
  otra.resultados = siguiente.resultados;
  return { liga: otra, fin: { campeon, puntos: siguiente.puntos } };
}

/* ---------------------------------------------------------------------------
 * El partido
 * ------------------------------------------------------------------------- */

export type TipoJugada = 'ataque' | 'defensa';

export interface Opcion {
  id: string;
  /** Lo que se hace, dicho corto: «Pase al hueco». */
  accion: string;
  icono: string;
  /** Quién lo hace, y a quién va si es un pase. */
  de: Jugador;
  a?: Jugador;
  /** Probabilidad de que salga bien, de 0 a 1. */
  p: number;
  /** Si el pase va entre dos con química: se dice, que es lo que se aprende. */
  quimica?: boolean;
}

export interface Jugada {
  n: number;
  minuto: number;
  tipo: TipoJugada;
  /** Lo que pasa, para el narrador. */
  texto: string;
  opciones: Opcion[];
}

/** Un azar con semilla, entre 0 y 1. */
function azar(texto: string): number {
  return (hashSeed(texto) % 10000) / 10000;
}

const acotar = (p: number) => Math.max(0.08, Math.min(0.88, p));

/** Elige uno de la lista con una semilla, sin repetir los ya usados si se puede. */
function uno<T>(xs: T[], semilla: string, usados: Set<T> = new Set()): T | undefined {
  const libres = xs.filter((x) => !usados.has(x));
  const de = libres.length ? libres : xs;
  if (!de.length) return undefined;
  return de[hashSeed(semilla) % de.length];
}

/**
 * Las seis jugadas del partido. Cuántas son de ataque sale del medio campo:
 * quien manda en el medio tiene más el balón. Siempre al menos dos de cada.
 */
export function jugadasDe(once: Once, rival: Rival, semilla: string): Jugada[] {
  const ventaja = (once.med - rival.med) / 40;
  const tipos: TipoJugada[] = [];
  for (let i = 0; i < 6; i += 1) tipos.push(azar(`${semilla}:tipo:${i}`) < 0.5 + ventaja ? 'ataque' : 'defensa');
  // Al menos dos de cada, que un partido sin defender no es un partido.
  for (const tipo of ['ataque', 'defensa'] as TipoJugada[]) {
    for (let i = 0; i < tipos.length && tipos.filter((t) => t === tipo).length < 2; i += 1) {
      if (tipos[i] !== tipo) tipos[i] = tipo;
    }
  }

  const minutos = [9, 23, 38, 52, 71, 86];
  const linea = (l: CromoLine) => once.jugadores.filter((j) => j.slot.line === l);
  const usados = new Set<Jugador>();

  return tipos.map((tipo, n) => {
    const s = `${semilla}:j${n}`;
    if (tipo === 'ataque') {
      const dels = linea('del');
      const meds = linea('med');
      const defs = linea('def');
      const tirador = uno(dels.length ? dels : meds, `${s}:tiro`, usados)!;
      const pasador = uno(meds.length ? meds : defs, `${s}:pase`, usados)!;
      const receptor = uno(dels.filter((d) => d !== tirador).length ? dels.filter((d) => d !== tirador) : dels, `${s}:recibe`) ?? tirador;
      const regateador = uno([...dels, ...meds].filter((j) => j !== tirador && j !== pasador), `${s}:regate`, usados) ?? tirador;
      [tirador, pasador, regateador].forEach((j) => usados.add(j));
      const enlazados = once.enlaces.some(
        ([a, b]) => (a === pasador.slot.id && b === receptor.slot.id) || (b === pasador.slot.id && a === receptor.slot.id),
      );
      const d = rival.def;
      const opciones: Opcion[] = [
        { id: 'tiro', accion: 'Disparo', icono: '💥', de: tirador, p: acotar(0.32 + ((tirador.media - d) / 100) * 1.6) },
        {
          id: 'pase',
          accion: 'Pase al hueco',
          icono: '🎯',
          de: pasador,
          a: receptor,
          quimica: enlazados,
          p: acotar(0.36 + (((pasador.media + receptor.media) / 2 - d) / 100) * 1.5 + (enlazados ? 0.12 : 0)),
        },
        { id: 'regate', accion: 'Regate', icono: '🌀', de: regateador, p: acotar(0.27 + ((regateador.media - d) / 100) * 1.9) },
      ];
      const texto = [
        `Recuperáis en el medio y ${pasador.cromo.name} levanta la cabeza…`,
        `Contraataque: ${tirador.cromo.name} arranca por el centro…`,
        `Balón largo del ${rival.nombre} y lo cazáis vosotros. ¡Arriba!`,
        `${regateador.cromo.name} la pide al pie en tres cuartos…`,
      ][hashSeed(`${s}:texto`) % 4];
      return { n, minuto: minutos[n], tipo, texto, opciones };
    }

    const defs = linea('def');
    const meds = linea('med');
    const por = linea('por')[0] ?? defs[0];
    const central = uno(defs.length ? defs : meds, `${s}:central`)!;
    const medio = uno(meds.length ? meds : defs, `${s}:medio`)!;
    const a = rival.atq;
    const opciones: Opcion[] = [
      { id: 'entrada', accion: 'Entrada', icono: '🦵', de: central, p: acotar(0.44 + ((central.media - a) / 100) * 1.6) },
      { id: 'presion', accion: 'Presión arriba', icono: '🏃', de: medio, p: acotar(0.4 + ((medio.media - rival.med) / 100) * 1.6) },
      { id: 'portero', accion: 'Parada', icono: '🧤', de: por, p: acotar(0.37 + ((por.media - a) / 100) * 1.7) },
    ];
    const texto = [
      `¡Ataca el ${rival.nombre}! ${rival.estrella[0].toUpperCase()}${rival.estrella.slice(1)} encara a vuestra defensa…`,
      `Pérdida en el medio y ${rival.estrella} sale lanzado…`,
      `Córner para el ${rival.nombre}. Todos al área…`,
    ][hashSeed(`${s}:texto`) % 3];
    return { n, minuto: minutos[n], tipo, texto, opciones };
  });
}

/** Lo que sube una técnica la opción en la que se usa. */
export const EMPUJE_TECNICA = 0.18;

export interface Desenlace {
  bien: boolean;
  /** En ataque, gol nuestro; en defensa, gol de ellos. */
  gol: boolean;
  texto: string;
}

/**
 * Cómo acaba una jugada. En ataque, si sale bien es gol. En defensa, si sale
 * mal el rival remata, y aun así puede irse fuera: perder un duelo no es
 * siempre encajar.
 */
export function resolver(j: Jugada, o: Opcion, semilla: string, tecnica: boolean, rival: Rival): Desenlace {
  const p = acotar(o.p + (tecnica ? EMPUJE_TECNICA : 0));
  const tirada = azar(`${semilla}:j${j.n}:${o.id}:${tecnica ? 't' : ''}`);
  const bien = tirada < p;
  const nombre = o.de.cromo.name;
  if (j.tipo === 'ataque') {
    if (bien) {
      const texto =
        o.id === 'pase'
          ? `¡Pase de ${nombre} y ${o.a?.cromo.name ?? 'el nueve'} la manda dentro!`
          : o.id === 'regate'
            ? `¡${nombre} se va de dos y la cruza! ¡GOL!`
            : `¡Zapatazo de ${nombre}! ¡A la escuadra!`;
      return { bien, gol: true, texto };
    }
    const texto =
      o.id === 'pase'
        ? `El pase de ${nombre} se queda largo. La defensa del ${rival.nombre} despeja.`
        : o.id === 'regate'
          ? `${nombre} lo intenta, pero le cierran el paso.`
          : `El disparo de ${nombre} lo saca el portero del ${rival.nombre}.`;
    return { bien, gol: false, texto };
  }
  if (bien) {
    const texto =
      o.id === 'entrada'
        ? `¡Entrada limpia de ${nombre}! Balón recuperado.`
        : o.id === 'presion'
          ? `${nombre} aprieta y les roba la pelota. ¡Bien!`
          : `¡Paradón de ${nombre}! Se la saca con una mano.`;
    return { bien, gol: false, texto };
  }
  const remate = azar(`${semilla}:j${j.n}:remate`) < 0.62;
  return {
    bien,
    gol: remate,
    texto: remate
      ? `No llega ${nombre}… y ${rival.estrella} marca para el ${rival.nombre}.`
      : `Se les escapa ${nombre}, pero el remate se va fuera por poco. ¡Uf!`,
  };
}

/** Las técnicas de la semana que tiene: se juegan una vez por partido. */
export function tecnicasDe(cromos: CromoReward[]): CromoReward[] {
  return cromos.filter((c) => c.rarity === 'tecnica');
}

/** La semilla de un partido: la oficial del día, o la de un amistoso. */
export function semillaPartido(profileId: ProfileId, date: DateKey, oficial: boolean, amistoso = 0): string {
  return oficial ? `${profileId}:liga:${date}` : `${profileId}:amistoso:${date}:${amistoso}`;
}
