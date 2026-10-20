import { addDays, formatShort, todayKey } from '@/lib/dates';
import { cuandoEs, planDelDia } from '@/lib/examenes';
import { expertNames, guidanceFor } from '@/lib/experts';
import { digestOf, fieldOf, formatValue, gpsEnabledFor, notesOf, sessionsBetween } from '@/lib/gps';
import { getMetrics } from '@/lib/habits';
import { diasSinApuntar } from '@/lib/huecos';
import { ESTADO_META, loQueMasConviene, notaEnTexto, preparacionExamenes, type Estado } from '@/lib/notaCole';
import { adherence } from '@/lib/planLink';
import { RETO_META } from '@/lib/retoCole';
import { STREAK_THRESHOLD, metricRatio, percent, summarizePeriod } from '@/lib/scoring';
import { entryKey } from '@/lib/storage';
import type { DateKey, DayEntry, GpsSession, HabitPriority, Metric, Profile, WeekPlan } from '@/types';

/* =========================================================================
 *  El parte de la semana: lo que diría un analista mirando los datos.
 *
 *  Tres respuestas y nada más: qué ha ido a mejor (logros), qué se está
 *  cayendo (riesgos) y, de todo eso, **una sola cosa** en la que poner el
 *  esfuerzo la semana que viene (foco). Una lista de diez avisos no la lee
 *  nadie; una frase con la acción, sí.
 *
 *  Tres reglas para que el parte no mienta:
 *
 *   1. **Ninguna cifra inventada.** Cada número del texto sale tal cual de
 *      un cálculo que ya existe en la app —el resumen del periodo, la agenda
 *      contra el registro, la nota de los retos, el GPS— y cada línea lleva
 *      en `dato` de dónde sale, para que se pueda comprobar.
 *   2. **Con pocos datos se calla.** Con menos de cuatro días apuntados no
 *      se habla de subidas ni bajadas: se dice que faltan datos y se pide
 *      apuntar, que es lo único honesto.
 *   3. **A los peques, en su idioma.** Frases cortas y animosas, nunca un
 *      diagnóstico, nada de peso y nada de compararlos entre ellos. Lo que
 *      suene a salud sale del criterio de `lib/experts.ts` o no sale.
 *
 *  Todo es cálculo en el aparato: ni un euro, ni una llamada a fuera.
 * ========================================================================= */

export type TonoLinea = 'ok' | 'warn' | 'info';

/** Qué se puede hacer desde la línea, si algo. */
export type AccionLinea = 'apuntar' | 'agenda' | 'reto';

export interface Linea {
  texto: string;
  /** De dónde sale la cifra, en palabras: el cálculo y el periodo. */
  dato: string;
  /** La casilla del registro de la que habla, para poder saltar a ella. */
  metricId?: string;
  tono: TonoLinea;
  accion?: AccionLinea;
}

export interface Parte {
  /** Si hay días bastantes para hablar de tendencias. */
  suficiente: boolean;
  diasApuntados: number;
  /** Primer y último día de la semana mirada. */
  desde: DateKey;
  hasta: DateKey;
  logros: Linea[];
  riesgos: Linea[];
  foco: Linea | null;
}

export interface ParteInput {
  profile: Profile;
  entries: Record<string, DayEntry>;
  /** Último día de la semana que se mira; la semana son los 7 hasta él. */
  hasta: DateKey;
  /** El día de hoy; se pasa para poder probarlo. */
  hoy?: DateKey;
  /** La semana tipo, si la hay. Sin ella no se juzga la agenda. */
  plan?: WeekPlan | null;
  /** Las sesiones del GPS del perfil, si lleva rastreador. */
  gpsSessions?: GpsSession[] | null;
}

/** Con menos días apuntados que esto no se habla de tendencias. */
export const DIAS_MINIMOS = 4;
/** Una métrica sube o baja de verdad a partir de estos puntos de cumplimiento. */
const CAMBIO_MINIMO = 0.15;
/** Días que tiene que estar apuntada una métrica en cada semana para compararla. */
const DIAS_POR_METRICA = 2;
/** Un examen está «próximo» a esta distancia o menos. */
const EXAMEN_PROXIMO = 14;
/** Estados de un tema que piden repaso antes del examen. */
const FLOJOS: Estado[] = ['sin-practicar', 'flojo', 'regular'];
/** Un rato de la agenda preocupa si falla al menos estas veces en la semana. */
const FALLOS_AGENDA = 2;

const MAX_LINEAS = 3;

const PRIORIDAD: Record<HabitPriority | 'sin', number> = { clave: 0, importante: 1, apoyo: 2, sin: 3 };

/* ---------------------------------------------------------------------------
 * Utilidades
 * ------------------------------------------------------------------------- */

/** Los días de `desde` a `hasta`, ambos incluidos. */
function diasDe(desde: DateKey, hasta: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let d = desde; d <= hasta; d = addDays(d, 1)) out.push(d);
  return out;
}

/** «13 oct – 19 oct». */
function rango(desde: DateKey, hasta: DateKey): string {
  return `${formatShort(desde)} – ${formatShort(hasta)}`;
}

const plural = (n: number, una: string, varias: string) => (n === 1 ? una : varias);

/** Puntos de diferencia entre dos cumplimientos, redondeados como `percent`. */
function puntos(a: number, b: number): number {
  return Math.round(b * 100) - Math.round(a * 100);
}

/** Cumplimiento medio de una métrica en unos días, sólo donde se apuntó. */
interface MediaMetrica {
  media: number;
  dias: number;
}

function mediaDe(
  metric: Metric,
  dias: DateKey[],
  entries: Record<string, DayEntry>,
  profileId: Profile['id'],
): MediaMetrica | null {
  let suma = 0;
  let n = 0;
  for (const d of dias) {
    const ratio = metricRatio(metric, entries[entryKey(profileId, d)]?.values[metric.id]);
    if (ratio === null) continue;
    suma += ratio;
    n += 1;
  }
  return n > 0 ? { media: suma / n, dias: n } : null;
}

interface Cambio {
  metric: Metric;
  antes: MediaMetrica;
  ahora: MediaMetrica;
  /** En puntos de porcentaje, con signo. */
  delta: number;
  prioridad: number;
}

/* ---------------------------------------------------------------------------
 * El parte
 * ------------------------------------------------------------------------- */

export function parteDeLaSemana(input: ParteInput): Parte {
  const { profile, entries, plan, gpsSessions } = input;
  const hoy = input.hoy ?? todayKey();
  // Nunca se mira el futuro: si la semana mirada es la de ahora, acaba hoy.
  const hasta = input.hasta > hoy ? hoy : input.hasta;
  const desde = addDays(hasta, -6);
  const antesHasta = addDays(desde, -1);
  const antesDesde = addDays(antesHasta, -6);
  const esHoy = hasta === hoy;
  const kid = profile.kind === 'kid';

  const dias = diasDe(desde, hasta);
  const diasAntes = diasDe(antesDesde, antesHasta);
  const semana = rango(desde, hasta);
  const semanaAntes = rango(antesDesde, antesHasta);

  const resumen = summarizePeriod(profile.id, dias, entries);
  const previo = summarizePeriod(profile.id, diasAntes, entries);
  const diasApuntados = resumen.trackedDays;
  const suficiente = diasApuntados >= DIAS_MINIMOS;

  const logros: Linea[] = [];
  const riesgos: Linea[] = [];
  let foco: Linea | null = null;

  /* ------------------------------------------------------ faltan datos */

  if (!suficiente) {
    riesgos.push({
      tono: 'warn',
      texto: kid
        ? `Faltan días por apuntar: van ${diasApuntados} de 7.`
        : `Faltan datos: sólo ${diasApuntados} de 7 días apuntados.`,
      dato: `Días con algo registrado entre el ${semana}. Hacen falta ${DIAS_MINIMOS} para sacar conclusiones.`,
    });
    const quedan = DIAS_MINIMOS - diasApuntados;
    foco = {
      tono: 'info',
      accion: 'apuntar',
      texto: esHoy
        ? kid
          ? `Apunta tu día: con ${quedan} ${plural(quedan, 'día más', 'días más')} ya sale tu parte.`
          : `Apuntar cada día: con ${quedan} ${plural(quedan, 'día más', 'días más')} el parte ya dice algo.`
        : kid
          ? 'Esa semana se quedó con pocos días apuntados: ¡a por esta!'
          : 'Esa semana tiene pocos días apuntados; lo que toca es apuntar esta.',
      dato: `${diasApuntados} de 7 días con registro (${semana}); el parte necesita ${DIAS_MINIMOS}.`,
    };
  }

  /* --------------------------------------------- métricas, una a una */

  const cambios: Cambio[] = [];
  if (suficiente && previo.trackedDays > 0) {
    for (const metric of getMetrics(profile.id)) {
      if ((metric.weight ?? 1) <= 0) continue;
      const ahora = mediaDe(metric, dias, entries, profile.id);
      const antes = mediaDe(metric, diasAntes, entries, profile.id);
      if (!ahora || !antes || ahora.dias < DIAS_POR_METRICA || antes.dias < DIAS_POR_METRICA) continue;
      const delta = puntos(antes.media, ahora.media);
      if (Math.abs(delta) < CAMBIO_MINIMO * 100) continue;
      const guia = guidanceFor(profile.id, metric.id);
      cambios.push({ metric, antes, ahora, delta, prioridad: PRIORIDAD[guia?.priority ?? 'sin'] });
    }
  }

  const subidas = cambios.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta);
  // Las bajadas, primero lo que importa más y, dentro, lo que más cae.
  const bajadas = cambios
    .filter((c) => c.delta < 0)
    .sort((a, b) => a.prioridad - b.prioridad || a.delta - b.delta);

  const datoCambio = (c: Cambio) =>
    `Cumplimiento medio de «${c.metric.label}»: ${percent(c.ahora.media)} en ${c.ahora.dias} días apuntados (${semana}) frente a ${percent(c.antes.media)} en ${c.antes.dias} (${semanaAntes}).`;

  const lineaSubida = (c: Cambio): Linea => ({
    tono: 'ok',
    metricId: c.metric.id,
    texto: kid
      ? `¡${c.metric.label} a más: del ${percent(c.antes.media)} al ${percent(c.ahora.media)}!`
      : `«${c.metric.label}» sube del ${percent(c.antes.media)} al ${percent(c.ahora.media)}.`,
    dato: datoCambio(c),
  });

  /* ------------------------------------------------------------ logros */

  const candidatosLogro: Linea[] = [];

  // La media del día, sólo si se puede comparar con la semana de antes.
  if (suficiente && previo.trackedDays >= DIAS_MINIMOS) {
    const delta = puntos(previo.average, resumen.average);
    if (delta >= 5) {
      candidatosLogro.push({
        tono: 'ok',
        texto: kid
          ? `¡Tu semana va mejor: del ${percent(previo.average)} al ${percent(resumen.average)}!`
          : `La media sube del ${percent(previo.average)} al ${percent(resumen.average)}.`,
        dato: `Media de cumplimiento diario: ${resumen.trackedDays} días apuntados (${semana}) frente a ${previo.trackedDays} (${semanaAntes}).`,
      });
    }
  }

  if (subidas[0]) candidatosLogro.push(lineaSubida(subidas[0]));

  // Récords del GPS dentro de la semana, mirados contra todo lo anterior.
  if (gpsEnabledFor(profile) && gpsSessions && gpsSessions.length > 0) {
    const deLaSemana = sessionsBetween(gpsSessions, desde, hasta);
    const resumenGps = digestOf(deLaSemana, gpsSessions);
    const record = resumenGps?.records[resumenGps.records.length - 1];
    if (record) {
      const campo = fieldOf(record.id);
      candidatosLogro.push({
        tono: 'ok',
        texto: kid
          ? `¡Récord de ${campo.label.toLowerCase()}: ${formatValue(record.id, record.value)}!`
          : `Récord de ${campo.label.toLowerCase()} en el GPS: ${formatValue(record.id, record.value)}.`,
        dato: `Sesión del ${formatShort(record.on)} frente a todas las anteriores guardadas del GPS.`,
      });
    } else if (resumenGps) {
      // Sin récord, la tendencia buena del conjunto, si la hay.
      const buena = notesOf(gpsSessions).find((n) => n.tone === 'bien' && n.id.startsWith('tendencia-'));
      if (buena) {
        candidatosLogro.push({
          tono: 'ok',
          texto: buena.text,
          dato: `Mitad reciente contra mitad antigua de las ${gpsSessions.length} sesiones guardadas del GPS.`,
        });
      }
    }
  }

  // Temas del próximo examen que esta semana han pasado a «listo».
  if (kid) {
    const ahora = preparacionExamenes(entries, profile.id, hasta);
    const antes = preparacionExamenes(entries, profile.id, antesHasta);
    const estadoAntes = new Map(antes.flatMap((p) => p.temas).map((t) => [t.tema.id, t.estado]));
    const nuevos = ahora
      .flatMap((p) => p.temas)
      .filter((t) => t.estado === 'listo' && estadoAntes.get(t.tema.id) !== 'listo');
    const tema = nuevos[0];
    if (tema) {
      candidatosLogro.push({
        tono: 'ok',
        texto:
          nuevos.length === 1
            ? `¡«${tema.tema.titulo}» ya está listo para el examen!`
            : `¡${nuevos.length} temas del examen ya están listos!`,
        dato: `Retos del cole: «${tema.tema.titulo}», nota ${notaEnTexto(tema.nota)} con ${tema.aciertos} de ${tema.n} preguntas acertadas. «Listo» es 8 o más con al menos 8 preguntas.`,
      });
    }
  }

  if (suficiente && resumen.bestStreak >= 3) {
    candidatosLogro.push({
      tono: 'ok',
      texto: kid
        ? `¡${resumen.bestStreak} días seguidos cumpliendo!`
        : `Racha de ${resumen.bestStreak} días seguidos cumpliendo.`,
      dato: `Días seguidos con al menos el ${percent(STREAK_THRESHOLD)} de cumplimiento, entre el ${semana}.`,
    });
  }

  if (subidas[1]) candidatosLogro.push(lineaSubida(subidas[1]));

  logros.push(...candidatosLogro.slice(0, MAX_LINEAS));

  /* ----------------------------------------------------------- riesgos */

  // Examen cerca con un tema flojo: sólo mirando la semana de ahora, que de
  // una semana pasada no tiene sentido anunciar el examen que venía.
  let examenFoco: Linea | null = null;
  if (kid && esHoy) {
    const proximos = preparacionExamenes(entries, profile.id, hoy).filter((p) => p.dias <= EXAMEN_PROXIMO);
    const flojos = loQueMasConviene(proximos).filter((t) => FLOJOS.includes(t.estado));
    const tema = flojos[0];
    const examen = tema ? proximos.find((p) => p.temas.some((t) => t.tema.id === tema.tema.id)) : undefined;
    if (tema && examen) {
      const asignatura = RETO_META[examen.examen.asignatura].nombre;
      const cuando = examen.dias === 0 ? 'hoy' : examen.dias === 1 ? 'mañana' : `en ${examen.dias} días`;
      const estado = ESTADO_META[tema.estado].label.toLowerCase();
      const dato =
        tema.n === 0
          ? `Examen de ${asignatura} el ${cuandoEs(examen.examen.fecha)}. Retos del cole: ninguna pregunta de «${tema.tema.titulo}» todavía.`
          : `Examen de ${asignatura} el ${cuandoEs(examen.examen.fecha)}. Retos del cole: «${tema.tema.titulo}», nota ${notaEnTexto(tema.nota)} con ${tema.aciertos} de ${tema.n} preguntas acertadas.`;
      riesgos.push({
        tono: 'warn',
        texto: `Examen de ${asignatura} ${cuando}: «${tema.tema.titulo}» va ${estado}.`,
        dato,
      });

      const reto = planDelDia(profile.id, hoy);
      const retoHoy = reto && reto.reto !== 'repaso' ? RETO_META[reto.reto].nombre : null;
      examenFoco = {
        tono: 'warn',
        accion: 'reto',
        texto:
          retoHoy && reto?.reto === examen.examen.asignatura
            ? `Juega hoy el reto de ${retoHoy} y repasa «${tema.tema.titulo}».`
            : `Repasa «${tema.tema.titulo}» antes del examen de ${asignatura}.`,
        dato,
      };
    }
  }

  const datoPorQue = (c: Cambio) => {
    const guia = guidanceFor(profile.id, c.metric.id);
    return guia ? `${datoCambio(c)} Por qué importa: ${guia.claim} (${expertNames(guia)}).` : datoCambio(c);
  };

  for (const c of bajadas.slice(0, 2)) {
    riesgos.push({
      tono: 'warn',
      metricId: c.metric.id,
      texto: kid
        ? `${c.metric.label} costó más esta semana: del ${percent(c.antes.media)} al ${percent(c.ahora.media)}.`
        : `«${c.metric.label}» baja del ${percent(c.antes.media)} al ${percent(c.ahora.media)}.`,
      dato: datoCambio(c),
    });
  }

  // La agenda contra lo vivido, con el mismo cálculo que «Lo planificado, ¿pasó?».
  const agenda = plan && plan.blocks.length > 0 ? adherence(profile, plan, dias, entries) : null;
  const peorRato = agenda?.weakest.find((w) => w.missed >= FALLOS_AGENDA) ?? null;
  if (peorRato) {
    riesgos.push({
      tono: 'warn',
      accion: 'agenda',
      texto: kid
        ? `«${peorRato.title}» se quedó sin hacer ${peorRato.missed} de ${peorRato.judged} veces.`
        : `«${peorRato.title}» falló ${peorRato.missed} de ${peorRato.judged} veces.`,
      dato: `Agenda contra el registro, ${semana}: veces que tocaba ese rato y su hábito no se cumplió.`,
    });
  }

  // Días sin apuntar: sólo en la semana de ahora y si no lo ha dicho ya el
  // aviso de los datos que faltan.
  if (suficiente && esHoy) {
    const huecos = diasSinApuntar(entries, profile.id, hoy);
    if (huecos.length >= 2) {
      riesgos.push({
        tono: 'info',
        accion: 'apuntar',
        texto: kid
          ? `${huecos.length} días sin apuntar: ¡aún estás a tiempo!`
          : `${huecos.length} días recientes sin apuntar; el más cercano, el ${formatShort(huecos[0])}.`,
        dato: `Días de los últimos 6 sin nada registrado (${huecos.map(formatShort).join(', ')}).`,
      });
    }
  }

  /* -------------------------------------------------------------- foco */

  if (!foco && examenFoco) foco = examenFoco;

  // La métrica con criterio detrás que más cae.
  const bajadaClave = bajadas.find((c) => c.prioridad <= PRIORIDAD.importante);
  if (!foco && bajadaClave) {
    foco = {
      tono: 'warn',
      metricId: bajadaClave.metric.id,
      texto: kid
        ? `Esta semana, a por ${bajadaClave.metric.label.toLowerCase()}.`
        : `Recuperar «${bajadaClave.metric.label}»: ha caído ${Math.abs(bajadaClave.delta)} puntos.`,
      dato: datoPorQue(bajadaClave),
    };
  }

  if (!foco && peorRato) {
    foco = {
      tono: 'warn',
      accion: 'agenda',
      texto: kid
        ? `Busca un hueco mejor para «${peorRato.title}».`
        : `Mover o ajustar «${peorRato.title}»: falló ${peorRato.missed} de ${peorRato.judged} veces.`,
      dato: `Agenda contra el registro, ${semana}.`,
    };
  }

  // Sin nada que se caiga, lo clave con más margen esta semana.
  if (!foco && suficiente) {
    const margen = getMetrics(profile.id)
      .filter((m) => (m.weight ?? 1) > 0 && guidanceFor(profile.id, m.id)?.priority === 'clave')
      .map((m) => ({ metric: m, media: mediaDe(m, dias, entries, profile.id) }))
      .filter((x): x is { metric: Metric; media: MediaMetrica } => !!x.media && x.media.dias >= DIAS_POR_METRICA)
      .filter((x) => x.media.media < STREAK_THRESHOLD)
      .sort((a, b) => a.media.media - b.media.media)[0];
    if (margen) {
      const guia = guidanceFor(profile.id, margen.metric.id);
      foco = {
        tono: 'info',
        metricId: margen.metric.id,
        texto: kid
          ? `Esta semana, a por ${margen.metric.label.toLowerCase()}.`
          : `Lo clave con más margen: «${margen.metric.label}», al ${percent(margen.media.media)}.`,
        dato: `Cumplimiento medio de «${margen.metric.label}» en ${margen.media.dias} días apuntados (${semana}).${guia ? ` Por qué importa: ${guia.claim} (${expertNames(guia)}).` : ''}`,
      };
    }
  }

  // Lo que ya es el foco no se repite debajo como riesgo: se dice una vez,
  // destacado, y su sitio en la lista lo ocupa el siguiente.
  const repetido = (r: Linea) =>
    !!foco &&
    ((foco.metricId !== undefined && r.metricId === foco.metricId) ||
      r.dato === foco.dato ||
      (foco.accion === 'agenda' && r.accion === 'agenda'));

  return {
    suficiente,
    diasApuntados,
    desde,
    hasta,
    logros,
    riesgos: riesgos.filter((r) => !repetido(r)).slice(0, MAX_LINEAS),
    foco,
  };
}
