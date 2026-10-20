/* =========================================================================
 *  Casos de prueba de `lib/classroomPegado.ts`.
 *
 *  Los ejecuta `node scripts/probar-pegado.mjs`. Títulos y clases son
 *  inventados: el repositorio es público. Todos parten del miércoles 21 de
 *  octubre de 2026, así que «mañana» es el 22 y «el viernes» el 23.
 * ========================================================================= */

export const HOY_PEGADO = '2026-10-21';

/** [título, clase o null, entrega o null, atrasada] */
export type EsperadaPegado = [string, string | null, string | null, boolean];

export interface CasoPegado {
  nombre: string;
  texto: string;
  tareas: EsperadaPegado[];
}

export const CASOS_PEGADO: CasoPegado[] = [
  {
    nombre: 'página de tareas pendientes en español',
    texto: `Tareas pendientes
Asignadas
Entregadas
Falta
Todas las clases
Sin fecha de entrega
1
Lectura del cuento
4º B Lengua
Esta semana
2
Ficha de fracciones
4º B Matemáticas
Fecha de entrega: mañana, 23:59
The water cycle
Natural Science 4ºB
Fecha de entrega: viernes
La próxima semana
1
Mapa de los ríos de España
Social Science
Fecha de entrega: 28 oct.
Anteriormente
1
Dictado 3
Lengua 4ºB
Fecha de entrega: 14 oct.`,
    tareas: [
      ['Lectura del cuento', '4º B Lengua', null, false],
      ['Ficha de fracciones', '4º B Matemáticas', '2026-10-22', false],
      ['The water cycle', 'Natural Science 4ºB', '2026-10-23', false],
      ['Mapa de los ríos de España', 'Social Science', '2026-10-28', false],
      ['Dictado 3', 'Lengua 4ºB', '2026-10-14', true],
    ],
  },
  {
    nombre: 'página en inglés con la fecha en el mismo renglón que la clase',
    texto: `To-do
Assigned
Missing
Done
This week
Unit 2 vocabulary
English
Due Thursday, 11:59 PM
Later
Science project
Science
Due Nov 4`,
    tareas: [
      ['Unit 2 vocabulary', 'English', '2026-10-22', false],
      ['Science project', 'Science', '2026-11-04', false],
    ],
  },
  {
    nombre: 'lista escrita a mano, una tarea por renglón',
    texto: `Mates: ficha 3 para el jueves
- Lengua: redacción vence el 30/10
Inglés: workbook p. 12 mañana
Leer el capítulo 4`,
    tareas: [
      ['ficha 3', 'Mates', '2026-10-22', false],
      ['redacción', 'Lengua', '2026-10-30', false],
      ['workbook p. 12', 'Inglés', '2026-10-22', false],
      ['Leer el capítulo 4', null, null, false],
    ],
  },
  {
    nombre: 'títulos con palabras que parecen fechas',
    texto: `Esta semana
El mar y los ríos
Social Science
Fecha de entrega: 22 oct.
The sun and the moon
Natural Science
Fecha de entrega: 23 oct.`,
    tareas: [
      ['El mar y los ríos', 'Social Science', '2026-10-22', false],
      ['The sun and the moon', 'Natural Science', '2026-10-23', false],
    ],
  },
  {
    nombre: 'anteriormente: el día de la semana es el que ya pasó, y sin repetidas',
    texto: `Anteriormente
Problemas de sumas
Matemáticas
Fecha de entrega: lunes
Asignadas
Problemas de sumas
Matemáticas
Fecha de entrega: lunes`,
    tareas: [['Problemas de sumas', 'Matemáticas', '2026-10-19', true]],
  },
  {
    nombre: 'un día abreviado al final del título no es fecha',
    texto: `Excursión al mar
Social Science
Fecha de entrega: 30 oct.
Lengua: lectura para el lunes
Repaso del sábado`,
    tareas: [
      ['Excursión al mar', 'Social Science', '2026-10-30', false],
      ['lectura', 'Lengua', '2026-10-26', false],
      ['Repaso', null, '2026-10-24', false],
    ],
  },
  {
    // Así sale de verdad la página al copiarla: con los nombres de los
    // iconos, los botones y la fecha de publicación (que no es de entrega).
    nombre: 'formato real de la página, con iconos y fecha de publicación',
    texto: `Ir al contenido principal
Menú principal
Classroom
Tareas pendientes
Asignado
Sin entregar
Hecho
Todas las clases
Sin fecha de entrega
2
keyboard_arrow_up
Ocultar
assignment

Ficha de sumas

Matemáticas (3ºA)

Fecha de publicación: lunes, 14 sept

assignment

Repaso del tema

Matemáticas (3ºA)

Fecha de publicación: viernes, 18 sept

Ver todo
Esta semana
1
keyboard_arrow_down
Mostrar
assignment

Redacción del otoño

Lengua 3ºA

Fecha de entrega: jueves, 22 oct

Próxima semana
0
keyboard_arrow_down
Mostrar
Ayuda y comentarios
Compatibilidad con lectores de pantalla habilitada.`,
    tareas: [
      ['Ficha de sumas', 'Matemáticas (3ºA)', null, false],
      ['Repaso del tema', 'Matemáticas (3ºA)', null, false],
      ['Redacción del otoño', 'Lengua 3ºA', '2026-10-22', false],
    ],
  },
  {
    nombre: 'cuando la fecha va a final de año',
    texto: `Trabajo de Navidad
Lengua
Fecha de entrega: 8 ene.`,
    tareas: [['Trabajo de Navidad', 'Lengua', '2027-01-08', false]],
  },
];
