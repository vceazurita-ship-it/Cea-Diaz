import { formatValue, fieldOf, valueOf, type GpsFieldId } from '@/lib/gps';
import type { DateKey, GpsSession } from '@/types';

/* =========================================================================
 *  La temporada: de septiembre a junio, como el curso y como el fútbol.
 *
 *  El análisis del GPS se mira por temporadas. La que está en marcha es la
 *  que importa —¿va a más desde septiembre?— y lo de antes queda cerrado,
 *  como un archivo que se puede abrir. Y cada sesión que entra trae su
 *  comentario: cómo queda frente a sus últimas sesiones y frente a lo mejor
 *  que ha hecho en la temporada.
 *
 *  Todo se calcula con las sesiones del aparato: aquí no hay ni una cifra de
 *  nadie, sólo reglas.
 * ========================================================================= */

export type PeriodoId = 'temporada' | 'anterior';

export interface Periodo {
  id: PeriodoId;
  /** «Temporada 26-27», «Hasta agosto 2026». */
  label: string;
  /** Para el control segmentado, que en un móvil no da para más. */
  corto: string;
  from: DateKey;
  to: DateKey;
  /** El año de septiembre con el que empieza la temporada. */
  inicio: number;
}

/**
 * La temporada en la que cae un día: empieza el 1 de septiembre. Julio y
 * agosto siguen siendo de la que acaba (la pretemporada de verano no abre
 * otra), así que la temporada va hasta el 31 de agosto aunque el gráfico
 * enseñe de septiembre a junio.
 */
export function temporadaDe(dia: DateKey): Periodo {
  const year = Number(dia.slice(0, 4));
  const month = Number(dia.slice(5, 7));
  const inicio = month >= 9 ? year : year - 1;
  const fin = String((inicio + 1) % 100).padStart(2, '0');
  return {
    id: 'temporada',
    label: `Temporada ${String(inicio % 100).padStart(2, '0')}-${fin}`,
    corto: `${String(inicio % 100).padStart(2, '0')}-${fin}`,
    from: `${inicio}-09-01`,
    to: `${inicio + 1}-08-31`,
    inicio,
  };
}

/** La temporada en curso y todo lo anterior, cerrado. */
export function periodosDe(hoy: DateKey): Record<PeriodoId, Periodo> {
  const temporada = temporadaDe(hoy);
  return {
    temporada,
    anterior: {
      id: 'anterior',
      label: `Hasta agosto de ${temporada.inicio}`,
      corto: `Hasta ago ${String(temporada.inicio % 100).padStart(2, '0')}`,
      from: '0000-01-01',
      to: `${temporada.inicio}-08-31`,
      inicio: temporada.inicio - 1,
    },
  };
}

export function enPeriodo(sessions: GpsSession[], periodo: Periodo): GpsSession[] {
  return sessions.filter((s) => s.date >= periodo.from && s.date <= periodo.to);
}

/* ---------------------------------------------------------------------------
 * El comentario de cada sesión
 * ------------------------------------------------------------------------- */

/** Las cifras que se comentan, por orden de importancia para un niño de 8-9 años. */
const COMENTADAS: GpsFieldId[] = ['topSpeed', 'distance', 'intense', 'accels', 'shotPower', 'passes', 'shots', 'ballTime', 'touches'];

/**
 * Cuánto tiene que cambiar una cifra para que sea noticia. La punta de
 * Footbar varía casi un km/h de una sesión a otra en el mismo jugador: menos
 * que eso es ruido, no progreso.
 */
function cambioQueCuenta(id: GpsFieldId, antes: number, ahora: number): boolean {
  if (id === 'topSpeed') return Math.abs(ahora - antes) >= 0.8;
  if (id === 'shotPower') return Math.abs(ahora - antes) >= 3;
  return antes > 0 && Math.abs(ahora / antes - 1) >= 0.12;
}

/** «+0,9 km/h» en la punta y el tiro; «+18 %» en lo demás. */
function diferencia(id: GpsFieldId, antes: number, ahora: number): string {
  if (id === 'topSpeed' || id === 'shotPower') {
    const d = ahora - antes;
    return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1).replace('.', ',')} km/h`;
  }
  const pct = Math.round((ahora / antes - 1) * 100);
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`;
}

export type Tono = 'record' | 'sube' | 'normal' | 'baja' | 'inicio';

export interface Comentario {
  tono: Tono;
  /** Una línea: lo primero que se lee. */
  titular: string;
  /** Hasta tres detalles, cifra a cifra. */
  detalles: string[];
  /** Las cifras en las que ha hecho la mejor marca de la temporada. */
  records: GpsFieldId[];
}

/** Sesiones con las que se compara: las de antes, en orden. */
function anteriores(session: GpsSession, temporada: GpsSession[]): GpsSession[] {
  return temporada
    .filter((s) => s.id !== session.id && (s.date < session.date || (s.date === session.date && s.updatedAt < session.updatedAt)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt));
}

const media = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;

/** Cuántas sesiones hacen falta antes para poder decir algo con sentido. */
export const MINIMO_COMPARAR = 3;
/** Con cuántas de las últimas se compara. */
export const ULTIMAS = 5;

/**
 * El comentario de una sesión dentro de su temporada: récords de la
 * temporada, lo que sube y baja frente a la media de sus últimas cinco
 * —del mismo tipo, si hay bastantes— y una frase para empezar.
 */
export function comentarSesion(
  session: GpsSession,
  temporada: GpsSession[],
  /**
   * `historia` en el archivo, que junta varias temporadas: ahí un récord no
   * es «de la temporada», es su mejor marca hasta ese día.
   */
  ambito: 'temporada' | 'historia' = 'temporada',
): Comentario {
  const antes = anteriores(session, temporada);
  const deLa = ambito === 'temporada' ? 'de la temporada' : 'hasta entonces';
  if (antes.length < MINIMO_COMPARAR) {
    return {
      tono: 'inicio',
      titular:
        antes.length === 0
          ? ambito === 'temporada'
            ? '🌱 Primera sesión de la temporada: desde aquí se mide todo.'
            : '🌱 De las primeras apuntadas: desde aquí se mide todo.'
          : `🌱 ${ambito === 'temporada' ? 'Empezando la temporada' : 'De las primeras'}: con ${MINIMO_COMPARAR - antes.length} más ya se compara con las suyas.`,
      detalles: [],
      records: [],
    };
  }

  // Un partido se compara con partidos y un entreno con entrenos, si hay
  // bastantes: correr en un partido y en un rondo no es lo mismo.
  const mismas = antes.filter((s) => s.kind === session.kind);
  const base = (mismas.length >= MINIMO_COMPARAR ? mismas : antes).slice(-ULTIMAS);
  const deQue = mismas.length >= MINIMO_COMPARAR ? (session.kind === 'partido' ? 'sus últimos partidos' : 'sus últimos entrenos') : 'sus últimas sesiones';

  const records: GpsFieldId[] = [];
  const subidas: { id: GpsFieldId; texto: string; peso: number }[] = [];
  const bajadas: { id: GpsFieldId; texto: string; peso: number }[] = [];
  const detallesRecord: string[] = [];

  for (const id of COMENTADAS) {
    const ahora = valueOf(session, id);
    if (ahora === undefined || ahora <= 0) continue;
    const field = fieldOf(id);

    const previas = antes.map((s) => valueOf(s, id)).filter((v): v is number => v !== undefined && v > 0);
    if (previas.length >= MINIMO_COMPARAR && field.record !== false && ahora > Math.max(...previas)) {
      records.push(id);
      detallesRecord.push(`🏅 ${field.short}: ${formatValue(id, ahora)}, la mejor ${deLa} (antes ${formatValue(id, Math.max(...previas))}).`);
      continue;
    }

    const recientes = base.map((s) => valueOf(s, id)).filter((v): v is number => v !== undefined && v > 0);
    if (recientes.length < 2) continue;
    const m = media(recientes);
    if (!cambioQueCuenta(id, m, ahora)) continue;
    const peso = Math.abs(ahora / m - 1);
    const texto = `${field.short} ${formatValue(id, ahora)}: ${diferencia(id, m, ahora)} sobre la media de ${deQue}`;
    if (ahora > m) subidas.push({ id, texto: `📈 ${texto}.`, peso });
    else bajadas.push({ id, texto: `${field.icon} ${field.short} ${formatValue(id, ahora)}, por debajo de lo habitual (${formatValue(id, m)}): normal entre sesiones.`, peso });
  }

  subidas.sort((a, b) => b.peso - a.peso);
  bajadas.sort((a, b) => b.peso - a.peso);

  // Si jugó mucho más o mucho menos rato, se dice: explica media sesión.
  const minutos = valueOf(session, 'minutes');
  const minutosAntes = base.map((s) => valueOf(s, 'minutes')).filter((v): v is number => v !== undefined && v > 0);
  let duracion: string | undefined;
  if (minutos && minutosAntes.length >= 2) {
    const m = media(minutosAntes);
    if (minutos > m * 1.25) duracion = `⏱️ Jugó más rato que de costumbre (${formatValue('minutes', minutos)}): ayuda a sumar distancia.`;
    else if (minutos < m * 0.75) duracion = `⏱️ Sesión más corta (${formatValue('minutes', minutos)}): lo que cuenta es el ritmo, no el total.`;
  }

  const detalles = [...detallesRecord, ...subidas.map((s) => s.texto), ...bajadas.slice(0, 1).map((s) => s.texto), ...(duracion ? [duracion] : [])].slice(0, 3);

  if (records.length > 0) {
    const nombres = records.map((id) => fieldOf(id).short.toLowerCase());
    const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
    return { tono: 'record', titular: ambito === 'temporada' ? `🏅 ¡Récord de la temporada en ${lista}!` : `🏅 Su mejor marca hasta entonces en ${lista}.`, detalles, records };
  }
  if (subidas.length > 0) {
    const mejor = fieldOf(subidas[0].id).short.toLowerCase();
    return {
      tono: 'sube',
      titular: subidas.length > 1 ? `📈 Por encima de lo suyo en ${subidas.length} cifras, sobre todo en ${mejor}.` : `📈 Más ${mejor} que en ${deQue}.`,
      detalles,
      records,
    };
  }
  if (bajadas.length > 0) {
    return { tono: 'baja', titular: '💪 Un día más tranquilo: pasa, y la media sigue ahí.', detalles, records };
  }
  return { tono: 'normal', titular: '👍 Una sesión en su línea: constancia, que es lo que más suma.', detalles, records };
}

/* ---------------------------------------------------------------------------
 * La progresión de la temporada
 * ------------------------------------------------------------------------- */

/** Las cifras en las que se mira la progresión, por orden. */
export const PROGRESION: GpsFieldId[] = ['topSpeed', 'distance', 'intense', 'shotPower', 'accels', 'passes'];

/**
 * El valor del mes de una cifra: en la punta y el tiro, lo que hace en sus
 * buenas sesiones (la mejor del mes si hay pocas, si no casi la mejor); en
 * lo demás, la media por sesión.
 */
function valorDelMes(id: GpsFieldId, list: number[]): number {
  if (id === 'topSpeed' || id === 'shotPower') {
    const sorted = [...list].sort((a, b) => a - b);
    return sorted.length >= 5 ? sorted[Math.floor((sorted.length - 1) * 0.9)] : sorted[sorted.length - 1];
  }
  return media(list);
}

export interface MesTemporada {
  key: string;
  /** «sep», «oct»… */
  label: string;
  sesiones: number;
  valor?: number;
  /** Mes que todavía no ha llegado. */
  futuro: boolean;
}

/** De septiembre a junio, aunque no haya sesiones: así se ve lo que falta. */
export function mesesDeTemporada(sessions: GpsSession[], periodo: Periodo, id: GpsFieldId, hoy: DateKey): MesTemporada[] {
  const out: MesTemporada[] = [];
  for (let i = 0; i < 10; i += 1) {
    const year = periodo.inicio + (i >= 4 ? 1 : 0);
    const month = ((8 + i) % 12) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const list = sessions.filter((s) => s.date.startsWith(key));
    const values = list.map((s) => valueOf(s, id)).filter((v): v is number => v !== undefined && v > 0);
    out.push({
      key,
      label: new Date(`${key}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''),
      sesiones: list.length,
      valor: values.length ? valorDelMes(id, values) : undefined,
      futuro: `${key}-01` > hoy,
    });
  }
  return out;
}

export interface Evolucion {
  id: GpsFieldId;
  antes: number;
  ahora: number;
  texto: string;
  sube: boolean;
  cuenta: boolean;
}

/**
 * Desde el principio de la temporada: sus primeras sesiones frente a las
 * últimas, cifra a cifra. Con menos de ocho sesiones no se dice nada.
 */
export function evolucionTemporada(sessions: GpsSession[]): Evolucion[] {
  const order = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  if (order.length < 8) return [];
  const n = Math.min(ULTIMAS, Math.floor(order.length / 2));
  const primeras = order.slice(0, n);
  const ultimas = order.slice(-n);
  const out: Evolucion[] = [];
  for (const id of PROGRESION) {
    const a = primeras.map((s) => valueOf(s, id)).filter((v): v is number => v !== undefined && v > 0);
    const b = ultimas.map((s) => valueOf(s, id)).filter((v): v is number => v !== undefined && v > 0);
    if (a.length < 2 || b.length < 2) continue;
    const antes = valorDelMes(id, a);
    const ahora = valorDelMes(id, b);
    out.push({ id, antes, ahora, texto: diferencia(id, antes, ahora), sube: ahora > antes, cuenta: cambioQueCuenta(id, antes, ahora) });
  }
  return out;
}
