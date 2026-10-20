import type { ProfileId } from '@/types';
import type { Confianza } from '@/lib/agentes/apuntar';

/* =========================================================================
 *  Casos de prueba del apuntador (`lib/agentes/apuntar.ts`).
 *
 *  Los ejecuta `node scripts/probar-apuntar.mjs`. Frases y cifras son de
 *  ejemplo, inventadas: el repositorio es público y aquí no va ningún dato
 *  real de nadie.
 *
 *  Todas parten del miércoles 11 de marzo de 2026 a mediodía, salvo las que
 *  dicen otra hora. Así «ayer» es el 10, «anteayer» el 9 y «el lunes» el 9.
 *  Si no se dice `noEntendido`, se espera vacío; la confianza sólo se
 *  comprueba donde se indica.
 * ========================================================================= */

export const HOY_CASOS = '2026-03-11';

/** [perfil, día, casilla, valor, confianza?] */
export type Esperada = [ProfileId, string, string, boolean | number | string, Confianza?];

export interface CasoApuntar {
  frase: string;
  /** Panel desde el que se escribe; por defecto, el de Víctor. */
  perfil?: ProfileId;
  /** Hora de Madrid; por defecto, las 12. */
  hora?: number;
  propuestas: Esperada[];
  noEntendido?: string[];
}

const H = HOY_CASOS;
const AYER = '2026-03-10';
const ANTEAYER = '2026-03-09';

export const CASOS: CasoApuntar[] = [
  /* ---- sueño y fechas ---- */
  { frase: 'Anoche dormí 7 y media', propuestas: [['victor', AYER, 'horas_sueno', 7.5, 'media']] },
  { frase: 'he dormido 8 h', propuestas: [['victor', AYER, 'horas_sueno', 8, 'media']] },
  { frase: 'hoy he dormido 7h30', propuestas: [['victor', H, 'horas_sueno', 7.5, 'alta']] },
  { frase: 'anoche siete horas y cuarto de sueño', propuestas: [['victor', AYER, 'horas_sueno', 7.25]] },
  { frase: 'anteayer 6 vasos de agua', propuestas: [['victor', ANTEAYER, 'agua', 6, 'alta']] },
  { frase: 'el lunes caminé 8000 pasos', propuestas: [['victor', ANTEAYER, 'pasos', 8000]] },
  { frase: 'ayer gimnasio 50 minutos', propuestas: [['victor', AYER, 'entreno_propio', 50, 'alta']] },
  // A las dos de la madrugada, «hoy» es todavía el martes.
  { frase: 'dos vasos de agua', hora: 2, propuestas: [['victor', AYER, 'agua', 2, 'alta']] },

  /* ---- cifras y unidades ---- */
  { frase: 'dos vasos de agua', propuestas: [['victor', H, 'agua', 2, 'alta']] },
  { frase: 'agua 6', propuestas: [['victor', H, 'agua', 6, 'media']] },
  { frase: '45 min de lectura', propuestas: [['victor', H, 'lectura', 45, 'alta']] },
  { frase: "he leído 45'", propuestas: [['victor', H, 'lectura', 45, 'alta']] },
  { frase: 'una hora de lectura', propuestas: [['victor', H, 'lectura', 60, 'alta']] },
  { frase: 'media hora de lectura', propuestas: [['victor', H, 'lectura', 30]] },
  { frase: 'una hora y media de máster', propuestas: [['victor', H, 'master', 90]] },
  { frase: 'hora y media de máster', propuestas: [['victor', H, 'master', 90]] },
  { frase: '10.000 pasos', propuestas: [['victor', H, 'pasos', 10000, 'alta']] },
  { frase: '10k pasos', propuestas: [['victor', H, 'pasos', 10000]] },
  { frase: 'doce mil pasos', propuestas: [['victor', H, 'pasos', 12000]] },
  { frase: 'peso 74,5 kg', propuestas: [['victor', H, 'peso', 74.5, 'alta']] },
  { frase: 'sentadilla 80 kg', propuestas: [['victor', H, 'marca.pierna', 80]] },
  { frase: 'corrí 5 km', propuestas: [['victor', H, 'marca.rodaje', 5, 'alta']] },
  { frase: 'tiempo con los niños 60 min', propuestas: [['victor', H, 'tiempo_hijos', 60]] },

  /* ---- negaciones, techos y abstenciones ---- */
  { frase: 'no he leído', propuestas: [['victor', H, 'lectura', 0, 'alta']] },
  { frase: 'nada de pantallas', propuestas: [['victor', H, 'pantallas_ocio', 0, 'alta']] },
  { frase: 'sin pantallas antes de dormir', propuestas: [['victor', H, 'sin_pantallas_noche', true, 'alta']] },
  { frase: 'sin azúcar', propuestas: [['victor', H, 'poco_dulce', true, 'alta']] },
  { frase: 'ni azúcar ni pantallas', propuestas: [['victor', H, 'poco_dulce', true], ['victor', H, 'pantallas_ocio', 0]] },
  { frase: 'una cerveza', perfil: 'maria', propuestas: [['maria', H, 'sin_alcohol', false, 'media']] },
  { frase: 'café por la tarde', perfil: 'maria', propuestas: [['maria', H, 'sin_cafeina_tarde', false]] },
  { frase: 'he ido al gym', propuestas: [['victor', H, 'fuerza', true, 'alta']] },
  { frase: '15 minutos de meditación', perfil: 'maria', propuestas: [['maria', H, 'pausa_consciente', true]] },

  /* ---- varias cosas en una frase ---- */
  {
    frase: 'Anoche dormí siete horas y media, dos vasos de agua y nada de pantallas',
    propuestas: [
      ['victor', AYER, 'horas_sueno', 7.5],
      ['victor', AYER, 'agua', 2],
      ['victor', AYER, 'pantallas_ocio', 0],
    ],
  },
  {
    // Dictado sin puntuación, como lo devuelve el micrófono.
    frase: 'hoy he dormido 8 horas he leído 20 minutos y 10000 pasos',
    propuestas: [
      ['victor', H, 'horas_sueno', 8],
      ['victor', H, 'lectura', 20],
      ['victor', H, 'pasos', 10000],
    ],
  },

  /* ---- perfiles ---- */
  {
    frase: 'Leo 20 minutos de lectura, Hugo 30',
    propuestas: [
      ['leo', H, 'lectura', 20, 'alta'],
      ['hugo', H, 'lectura', 30, 'media'],
    ],
  },
  {
    frase: 'los niños han ido a natación',
    propuestas: [
      ['leo', H, 'sport.natacion.asistencia', true],
      ['hugo', H, 'sport.natacion.asistencia', true],
    ],
  },
  {
    frase: 'Leo y Hugo fútbol',
    propuestas: [
      ['leo', H, 'sport.futbol.asistencia', true],
      ['hugo', H, 'sport.futbol.asistencia', true],
    ],
  },
  {
    frase: 'Hugo dos vasitos de agua y tres piezas de fruta',
    propuestas: [
      ['hugo', H, 'agua', 2, 'alta'],
      ['hugo', H, 'fruta_verdura', 3, 'alta'],
    ],
  },
  { frase: 'veinte flexiones', perfil: 'leo', propuestas: [['leo', H, 'reto.flexiones', 20]] },
  { frase: 'energía 4', perfil: 'hugo', propuestas: [['hugo', H, 'energia', 4]] },
  // Un mayor no apunta por el otro, y un peque sólo lo suyo.
  { frase: 'María ha leído 20 minutos', propuestas: [], noEntendido: ['María ha leído 20 minutos'] },
  { frase: 'Hugo ha leído 20 minutos', perfil: 'leo', propuestas: [], noEntendido: ['Hugo ha leído 20 minutos'] },
  {
    frase: 'yo 30 minutos de lectura y Leo 15',
    perfil: 'maria',
    propuestas: [
      ['maria', H, 'lectura', 30],
      ['leo', H, 'lectura', 15],
    ],
  },

  { frase: 'he bebido un litro de agua', propuestas: [['victor', H, 'agua', 4, 'alta']] },
  { frase: 'medio litro de agua', propuestas: [['victor', H, 'agua', 2]] },
  { frase: 'un vaso de agua', propuestas: [['victor', H, 'agua', 1, 'alta']] },
  { frase: 'ayer por la noche móvil una hora', propuestas: [['victor', AYER, 'pantallas_ocio', 60]] },
  { frase: 'ayer 3 charlas con jugadores y preparé la sesión 90 minutos', propuestas: [['victor', AYER, 'charlas_jugadores', 3], ['victor', AYER, 'prep_sesion', 90]] },

  /* ---- lo que no se entiende ---- */
  // El café de la mañana no rompe el «sin cafeína por la tarde»: no se apunta.
  { frase: 'esta mañana 2 cafés', propuestas: [], noEntendido: ['cafés'] },
  // «un» es artículo: no son «1 h» de sueño, es la meta propuesta y desmarcada.
  { frase: 'he dormido como un bebé', propuestas: [['victor', AYER, 'horas_sueno', 7.5, 'baja']] },
  // «con Leo» no cambia de perfil, y «leo» suelto no se toma por «yo leo».
  { frase: 'hice deberes con Leo', propuestas: [], noEntendido: ['hice deberes con Leo'] },
  { frase: 'he arreglado la bici', propuestas: [], noEntendido: ['he arreglado la bici'] },
  { frase: 'dos vasos de agua y he arreglado la bici', propuestas: [['victor', H, 'agua', 2]], noEntendido: ['he arreglado la bici'] },
  // Víctor no tiene casilla de fruta: no se inventa.
  { frase: 'tres frutas', propuestas: [], noEntendido: ['tres frutas'] },
];
