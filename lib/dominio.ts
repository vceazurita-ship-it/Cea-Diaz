import { addDays, todayKey } from '@/lib/dates';
import { diasHasta, planDelDia } from '@/lib/examenes';
import { evidenciaCole, type Evidencia } from '@/lib/notaCole';
import { ASIGNATURAS } from '@/lib/retoCole';
import { TEMARIO, type Asignatura, type Curso, type Tema } from '@/lib/temario';
import { temasDelExamen, temasVistos, type AjusteTemas } from '@/lib/temasVistos';
import type { DateKey, DayEntry, ProfileId } from '@/types';

/* =========================================================================
 *  El temario aprendido: cuándo un tema se puede dar por sabido.
 *
 *  Acertar cinco preguntas un día no es saberse un tema: puede ser suerte,
 *  o que lo acababan de explicar. Aquí un tema sólo está **aprendido**
 *  cuando lo ha demostrado varias veces y en días distintos:
 *
 *   · al menos 8 preguntas de ese tema,
 *   · repartidas en 3 días o más,
 *   · y 8 de las 10 últimas bien.
 *
 *  Por el camino gana estrellas (⭐ practicado, ⭐⭐ lo va cogiendo, ⭐⭐⭐
 *  aprendido), y cada tema pide repaso cuando toca, con los plazos de la
 *  repetición espaciada: lo flojo, al día siguiente; lo que va bien, a los
 *  dos o tres días; lo aprendido, a la semana, para que no se olvide. Lo
 *  fallado vuelve antes que lo acertado.
 *
 *  De ahí sale el **repaso inteligente**: el reto ⭐ Repaso ya no saca una
 *  pregunta de cada asignatura al azar, sino de los temas que más lo
 *  necesitan (lo que entra en el examen que viene, lo flojo, lo que hace
 *  días que no sale), también de temas de semanas atrás. Para que el
 *  repaso de un día no cambie mientras se juega, sólo mira lo contestado
 *  hasta el día anterior.
 * ========================================================================= */

export const DOMINIO_MIN_PREGUNTAS = 8;
export const DOMINIO_MIN_DIAS = 3;
export const DOMINIO_ULTIMAS = 10;
export const DOMINIO_ACIERTO = 0.8;

export type Estrellas = 0 | 1 | 2 | 3;

export interface DominioTema {
  tema: Tema;
  n: number;
  /** Días distintos en que ha salido. */
  dias: number;
  /** Acierto de las últimas diez (0-1), o null sin preguntas. */
  reciente: number | null;
  estrellas: Estrellas;
  aprendido: boolean;
  /** El último día que salió. */
  ultima: DateKey | null;
  /** Si hoy le toca repaso según la repetición espaciada. */
  toca: boolean;
  /** Lo que le falta para darlo por aprendido, dicho para un niño. */
  falta: string | null;
}

/** Cada cuántos días pide repaso, por estrellas. */
const INTERVALO: Record<Estrellas, number> = { 0: 0, 1: 1, 2: 2, 3: 6 };

export function dominioDeTema(tema: Tema, evidencia: Evidencia[], hoy: DateKey): DominioTema {
  const propia = evidencia.filter((e) => e.tema === tema.id).sort((a, b) => a.date.localeCompare(b.date));
  const n = propia.length;
  const dias = new Set(propia.map((e) => e.date)).size;
  const ultimas = propia.slice(-DOMINIO_ULTIMAS);
  const reciente = ultimas.length ? ultimas.filter((e) => e.hit).length / ultimas.length : null;
  const aprendido = n >= DOMINIO_MIN_PREGUNTAS && dias >= DOMINIO_MIN_DIAS && (reciente ?? 0) >= DOMINIO_ACIERTO;
  const estrellas: Estrellas = n === 0 ? 0 : aprendido ? 3 : n >= 4 && (reciente ?? 0) >= 0.6 ? 2 : 1;
  const ultima = n ? propia[n - 1].date : null;
  // Un fallo en la última vez adelanta el repaso: lo fallado vuelve antes.
  const falloUltimo = n > 0 && !propia[n - 1].hit;
  const intervalo = falloUltimo ? Math.min(1, INTERVALO[estrellas]) : INTERVALO[estrellas];
  const toca = !ultima || diasHasta(hoy, ultima) >= intervalo;

  let falta: string | null = null;
  if (!aprendido) {
    const partes: string[] = [];
    if (n < DOMINIO_MIN_PREGUNTAS) partes.push(`${DOMINIO_MIN_PREGUNTAS - n} ${DOMINIO_MIN_PREGUNTAS - n === 1 ? 'pregunta' : 'preguntas'} más`);
    if (dias < DOMINIO_MIN_DIAS) partes.push(`${DOMINIO_MIN_DIAS - dias} ${DOMINIO_MIN_DIAS - dias === 1 ? 'día' : 'días'} más`);
    if (n >= DOMINIO_MIN_PREGUNTAS && (reciente ?? 0) < DOMINIO_ACIERTO) partes.push('acertar 8 de las 10 últimas');
    falta = partes.join(' y ');
  }
  return { tema, n, dias, reciente, estrellas, aprendido, ultima, toca, falta };
}

export interface DominioAsignatura {
  asignatura: Asignatura;
  temas: DominioTema[];
  aprendidos: number;
}

/** Los temas ya vistos de cada asignatura, con cómo va cada uno. */
export function dominioDelTemario(
  entries: Record<string, DayEntry>,
  profileId: ProfileId,
  curso: Curso,
  ajuste: AjusteTemas,
  hoy: DateKey = todayKey(),
): DominioAsignatura[] {
  const evidencia = evidenciaCole(entries, profileId, hoy);
  return ASIGNATURAS.map((asignatura) => {
    const temas = temasVistos(asignatura, curso, hoy, ajuste).map((t) => dominioDeTema(t, evidencia, hoy));
    return { asignatura, temas, aprendidos: temas.filter((t) => t.aprendido).length };
  });
}

/**
 * Los temas por los que conviene empezar el repaso de hoy, de más a menos
 * urgente. Puntúa cada tema visto:
 *
 *   · si entra en un examen que viene, más cuanto más cerca esté;
 *   · si le toca repaso por la repetición espaciada;
 *   · cuantas menos estrellas tenga;
 *   · y un poco por los días que hace que no sale.
 *
 * Sólo cuenta lo contestado hasta ayer, para que el repaso de hoy sea el
 * mismo de la primera pregunta a la última.
 */
export function temasParaRepasar(
  entries: Record<string, DayEntry>,
  profileId: ProfileId,
  curso: Curso,
  date: DateKey,
  ajuste: AjusteTemas,
  cuantos = 5,
): Tema[] {
  const evidencia = evidenciaCole(entries, profileId, addDays(date, -1));
  const plan = planDelDia(profileId, date);
  const urgenciaExamen = new Map<string, number>();
  for (const e of plan?.pendientes ?? []) {
    const dias = Math.max(0, diasHasta(e.fecha, date));
    for (const t of temasDelExamen(e, curso, date, ajuste)) {
      urgenciaExamen.set(t.id, Math.max(urgenciaExamen.get(t.id) ?? 0, Math.max(1, 15 - dias)));
    }
  }
  const candidatos = new Map<string, Tema>();
  for (const a of ASIGNATURAS) for (const t of temasVistos(a, curso, date, ajuste)) candidatos.set(t.id, t);
  for (const id of urgenciaExamen.keys()) {
    const t = TEMARIO.find((x) => x.id === id);
    if (t) candidatos.set(id, t);
  }
  const puntuados = [...candidatos.values()].map((tema) => {
    const d = dominioDeTema(tema, evidencia, date);
    const desde = d.ultima ? diasHasta(date, d.ultima) : 10;
    const score =
      (urgenciaExamen.get(tema.id) ?? 0) * 2 +
      (d.toca ? 10 : 0) +
      (3 - d.estrellas) * 6 +
      Math.min(desde, 10) +
      (d.reciente !== null ? (1 - d.reciente) * 8 : 4);
    return { tema, score };
  });
  puntuados.sort((a, b) => b.score - a.score || a.tema.id.localeCompare(b.tema.id));
  // Sin repetir asignatura mientras se pueda: un repaso de cinco temas de
  // mates no es un repaso.
  const out: Tema[] = [];
  const usadas = new Set<Asignatura>();
  for (const { tema } of puntuados) {
    if (out.length >= cuantos) break;
    if (usadas.has(tema.asignatura)) continue;
    out.push(tema);
    usadas.add(tema.asignatura);
  }
  for (const { tema } of puntuados) {
    if (out.length >= cuantos) break;
    if (!out.includes(tema)) out.push(tema);
  }
  return out;
}

export function estrellasEnTexto(e: Estrellas): string {
  return '⭐'.repeat(e) + '☆'.repeat(3 - e);
}
