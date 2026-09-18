import { Bangers } from 'next/font/google';

/**
 * La letra de los rótulos del penalti: la de un manga, gruesa y de trazo
 * inclinado, la que llevan los gritos de los tiros en la serie. Sólo se usa
 * en lo que se grita —el VS, el nombre del tiro, el ¡GOL!, el marcador—; lo
 * que hay que leer con calma sigue en la letra de la app.
 *
 * Se sirve desde el propio despliegue (`next/font` la descarga al compilar),
 * así que no hay ninguna petición a Google desde el móvil.
 */
export const manga = Bangers({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manga',
});
