import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hábitos en Familia',
  description:
    'Seguimiento de hábitos de Leo, Hugo, María y Víctor: nutrición, sueño, deporte, estudio, trabajo y rutinas compartidas.',
  applicationName: 'Hábitos en Familia',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Hábitos', statusBarStyle: 'black-translucent' },
  // El de Apple está descatalogado y el navegador lo dice en cada carga; el
  // estándar es éste. Se declaran los dos: iPhone sigue leyendo el suyo.
  other: { 'mobile-web-app-capable': 'yes' },
  // Es una app doméstica: no tiene sentido que la indexe nadie.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // `app/page.tsx` reescribe este color al cambiar de modo o de perfil.
  themeColor: '#0d1014',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Pinta el modo elegido antes de que el navegador dibuje nada. Sin esto, la
 * casa que use el modo día vería un fogonazo oscuro en cada carga: React
 * llega después del primer pintado y ya sería tarde.
 *
 * Va en línea y sin dependencias a propósito; si algo falla, se queda el
 * modo noche por defecto y la app funciona igual.
 */
const MODE_BOOTSTRAP = `
try {
  var raw = localStorage.getItem('habitos-familia:ajustes');
  var p = raw ? JSON.parse(raw).theme : localStorage.getItem('habitos-familia:modo');
  var m = p === 'light' || p === 'dark'
    ? p
    : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.mode = m;
} catch (e) {
  document.documentElement.dataset.mode = 'dark';
}
`.trim();

/**
 * `data-mode` no se escribe aquí a propósito, y `<html>` lleva
 * `suppressHydrationWarning`.
 *
 * El guion de arriba corre antes de que React llegue y deja puesto el modo de
 * verdad. Si además se declarara el atributo en el JSX, React encontraría al
 * hidratar un `light` que él no ha escrito y avisaría de que el servidor y el
 * cliente no coinciden —«Prop `data-mode` did not match»— en todas las cargas
 * de una casa que use el modo día. No era sólo ruido en la consola: React
 * llegaba a corregir el atributo al valor del servidor, y por un instante la
 * app se pintaba en el modo que no era.
 *
 * Así el atributo tiene un solo dueño: el guion primero y el efecto de
 * `app/page.tsx` después. Sin él puesto, `:root` de `globals.css` ya resuelve
 * el modo noche, que es el respaldo de siempre.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-skin="night" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
