import { addDays } from '@/lib/dates';
import type { Pregunta } from '@/lib/temario';
import type { DateKey, Visual } from '@/types';

/* =========================================================================
 *  La tecnificación: lo que se trabaja el viernes, repasado toda la semana.
 *
 *  Leo y Hugo hacen tecnificación los viernes (alguna vez, el miércoles), y
 *  cada sesión viene con su PDF: tareas, tiempos y lo que se busca en cada
 *  una. Aquí va cada sesión con sus preguntas, y **durante la semana
 *  siguiente** el reto de fútbol del día sale de ella: cinco preguntas sobre
 *  lo que hicieron en el campo, para que lo entrenado con los pies se
 *  entienda también con la cabeza.
 *
 *  Una sesión nueva es una entrada más en `SESIONES`, con la fecha en que se
 *  hizo: manda desde el día siguiente hasta que llega la otra.
 * ========================================================================= */

export interface Bloque {
  nombre: string;
  minutos: number;
  puntos: string[];
}

export interface SesionTecnificacion {
  id: string;
  /** El día en que se hizo. Sus preguntas mandan desde el día siguiente. */
  fecha: DateKey;
  titulo: string;
  /** Cómo se llama el PDF en la carpeta FUTBOL. */
  pdf: string;
  bloques: Bloque[];
  preguntas: Pregunta[];
}

function p(icon: string, prompt: string, ok: string, no: string[], why: string, visual?: Visual): Pregunta {
  return { icon, prompt, ok, no, why, visual };
}

export const SESIONES: SesionTecnificacion[] = [
  {
    id: 't4-progresion',
    fecha: '2026-10-02',
    titulo: 'Progresión',
    pdf: '4 Progresión.pdf',
    bloques: [
      { nombre: 'Técnica', minutos: 15, puntos: ['Pase + recepción perfilada + pase', 'Envío a la pierna cercana o alejada', 'Último pase al pie o al espacio'] },
      { nombre: 'Decisión', minutos: 30, puntos: ['Recepción estática o dinámica, perfilada', 'Decidir: pase o conducción', 'Continuidad'] },
      { nombre: 'Competición', minutos: 15, puntos: ['Desmarque y recepción', 'Giro en V a la vuelta del defensor', 'Finalizar en mini portería: gol = 1'] },
    ],
    preguntas: [
      p('🧭', 'Recibir el balón ya orientado hacia donde quieres ir después se llama…', 'Recepción perfilada', ['Recepción de espaldas', 'Control con la mano', 'Pase largo'], 'Perfilarse es abrir el cuerpo antes de que llegue el balón: así el primer toque ya te lleva adonde quieres.', { tipo: 'campo', jugada: 'perfil' }),
      p('👀', '¿Para qué sirve perfilarse antes de recibir?', 'Para ver el campo y jugar más rápido', ['Para que el balón vaya más despacio', 'Para no tocar el balón', 'Para descansar'], 'Con el cuerpo abierto ves más campo y ganas un segundo: el defensor llega tarde.', { tipo: 'campo', jugada: 'perfil' }),
      p('🛡️', 'Si un defensor viene por un lado, ¿con qué pierna te conviene recibir?', 'Con la más alejada del defensor', ['Con la más cercana al defensor', 'Con la que sea, da igual', 'Con las dos a la vez'], 'Recibir con la pierna alejada pone tu cuerpo entre el balón y el defensor: lo proteges.', { tipo: 'campo', jugada: 'proteger' }),
      p('🔁', '¿Qué significa «alternar perfiles»?', 'Recibir con las dos piernas y hacia los dos lados', ['Usar siempre la misma pierna', 'Cambiar de camiseta', 'Jugar sólo de portero'], 'Un buen jugador recibe bien con la derecha y con la izquierda, hacia un lado y hacia el otro.'),
      p('🎯', 'Un pase «al pie» va…', 'Directo a los pies del compañero', ['Al hueco hacia donde corre', 'Fuera del campo', 'Al portero rival'], 'Al pie: el compañero lo recibe donde está.', { tipo: 'campo', jugada: 'pie' }),
      p('🏃', 'Un pase «al espacio» va…', 'Al hueco hacia donde corre el compañero', ['Directo a sus pies, parado', 'Hacia atrás', 'Al banquillo'], 'Al espacio: el balón y el compañero llegan a la vez al mismo sitio, delante de él.', { tipo: 'campo', jugada: 'espacio' }),
      p('⚡', 'Tu compañero corre hacia la portería y tiene sitio delante. El mejor último pase es…', 'Al espacio, delante de él', ['Al pie, aunque tenga que pararse', 'Hacia atrás', 'Al portero'], 'Si tiene campo, el pase al espacio no le hace frenar: llega lanzado.', { tipo: 'campo', jugada: 'espacio' }),
      p('🔄', 'Recibir «en dinámico» es…', 'Recibir en movimiento, sin pararte', ['Recibir quieto', 'Recibir sentado', 'No recibir'], 'Estática: quieto. Dinámica: en movimiento, que es más difícil para el defensor.'),
      p('➡️', 'Recibes y delante tienes campo libre. Lo mejor suele ser…', 'Conducir hacia delante', ['Pasar siempre hacia atrás', 'Pararte a mirar', 'Chutar desde tu campo'], 'Si hay espacio, se conduce; si te cierran, se pasa. Eso es decidir.', { tipo: 'campo', jugada: 'conduccion' }),
      p('🤝', 'Un defensor te cierra y un compañero está libre. Lo mejor es…', 'Pasar al compañero libre', ['Conducir contra el defensor', 'Quedarte quieto', 'Tirarla fuera'], 'El balón corre más que nadie: si te cierran, pasa.'),
      p('🔗', '«Continuidad» en el ejercicio significa…', 'Seguir la jugada después de pasar o recibir', ['Pararte después de cada pase', 'Ir a beber agua', 'Empezar siempre de cero'], 'Pasar y moverse: la jugada no se acaba con tu toque.'),
      p('🏃‍♂️', 'Moverte para quedarte libre y poder recibir se llama…', 'Desmarque', ['Marcaje', 'Saque de banda', 'Fuera de juego'], 'Desmarcarse es hacerte un hueco para que te puedan pasar.', { tipo: 'campo', jugada: 'giro' }),
      p('✌️', 'En el desmarque en V, primero vas hacia el defensor y luego…', 'Cambias de dirección rápido al otro lado', ['Te paras', 'Sigues recto', 'Te sientas'], 'La V engaña: el defensor te sigue y tú sales de golpe por el otro lado.', { tipo: 'campo', jugada: 'giro' }),
      p('🥅', 'En la competición de la sesión, cada gol en la mini portería vale…', '1 punto', ['2 puntos', '3 puntos', '0 puntos'], 'Gol = 1. Y el defensor empezaba quieto y luego podía moverse.'),
      p('📋', '¿Qué tres partes tuvo la sesión de Progresión?', 'Técnica, decisión y competición', ['Calentar, correr y estirar', 'Tiro, portero y penaltis', 'Ataque, defensa y descanso'], 'Técnica (15 min), decisión (30 min) y competición (15 min).'),
      p('🔎', 'Justo antes de recibir, ¿qué debes hacer siempre?', 'Mirar a tu alrededor', ['Cerrar los ojos', 'Mirar sólo el balón', 'Levantar la mano'], 'Mirar antes de recibir (escanear) te dice si hay defensor cerca y dónde está el hueco.'),
    ],
  },
];

/** La sesión que se repasa ese día: la última hecha antes de él. */
export function sesionVigente(date: DateKey): SesionTecnificacion | null {
  const hechas = SESIONES.filter((s) => s.fecha < date).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ultima = hechas[0];
  // Pasadas tres semanas sin sesión nueva, lo viejo ya no se repasa a diario.
  if (!ultima || date > addDays(ultima.fecha, 21)) return null;
  return ultima;
}
