import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hábitos en Familia',
  description:
    'Seguimiento de hábitos de Leo, Hugo, María y Víctor: nutrición, sueño, deporte, estudio, trabajo y rutinas compartidas.',
  applicationName: 'Hábitos en Familia',
};

export const viewport: Viewport = {
  themeColor: '#161a23',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-skin="night">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
