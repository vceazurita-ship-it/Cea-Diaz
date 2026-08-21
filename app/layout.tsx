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
  // Es una app doméstica: no tiene sentido que la indexe nadie.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // `app/page.tsx` reescribe este color al cambiar de piel.
  themeColor: '#161a23',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-skin="night">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
