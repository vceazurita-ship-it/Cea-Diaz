/**
 * Claves con las que cada juego anota su partida en las notas del día.
 *
 * Viven aparte para que el almacén las conozca sin cargar los juegos: cada
 * módulo de juego arrastra su banco de preguntas, y importarlo sólo por una
 * cadena metía el temario entero en lo que el móvil descarga para pintar la
 * portada.
 */
export const GAME_NOTE_KEY = 'juego';
export const PENALTY_NOTE_KEY = 'penaltis';
export const COLE_NOTE_KEY = 'cole';
export const FUTBOL_NOTE_KEY = 'futbol';
