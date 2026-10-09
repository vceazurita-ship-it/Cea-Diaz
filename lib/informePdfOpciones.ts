import type { DateKey } from '@/types';

/*
 * Lo que se puede pedir en el PDF, aparte del generador: el formulario lo
 * necesita al abrirse, y la librería de PDF sólo hace falta al pulsar.
 */

export type Seccion = 'habitos' | 'diario' | 'entrenos' | 'gps' | 'fisico' | 'colegio' | 'cognitivo' | 'notas';

export const SECCIONES: { id: Seccion; label: string; icon: string; detail: string }[] = [
  { id: 'habitos', label: 'Hábitos', icon: '✅', detail: 'Cumplimiento por áreas y hábito a hábito, mes a mes' },
  { id: 'diario', label: 'Hábitos día a día', icon: '📅', detail: 'Una fila por día apuntado, con el % de cada área' },
  { id: 'entrenos', label: 'Entrenamientos', icon: '🏅', detail: 'Asistencia, esfuerzo y sensaciones por deporte' },
  { id: 'gps', label: 'Partidos y GPS', icon: '🛰️', detail: 'Las sesiones del Footbar y sus medias y récords' },
  { id: 'fisico', label: 'Pruebas físicas', icon: '💪', detail: 'Talla, salto y esprint, y cuánto han cambiado' },
  { id: 'colegio', label: 'Colegio', icon: '📚', detail: 'Los boletines, asignatura por asignatura' },
  { id: 'cognitivo', label: 'Valoración cognitiva', icon: '🧠', detail: 'Los índices de la valoración neuropsicológica' },
  { id: 'notas', label: 'Notas del día', icon: '📝', detail: 'Lo que se haya escrito a mano cada día' },
];

export interface Rango {
  from: DateKey;
  to: DateKey;
  /** Cómo se nombra en la portada: «Temporada 26-27», «Todo». */
  label: string;
}
