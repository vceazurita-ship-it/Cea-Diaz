import type { MetadataRoute } from 'next';

/**
 * Manifiesto de aplicación instalable. La app se usa a diario desde el móvil,
 * así que conviene que se pueda anclar a la pantalla de inicio y abrirse sin
 * la barra del navegador.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hábitos en Familia',
    short_name: 'Hábitos',
    description:
      'Seguimiento de hábitos de Leo, Hugo, María y Víctor: nutrición, sueño, deporte, estudio, trabajo y rutinas compartidas.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#161a23',
    theme_color: '#161a23',
    lang: 'es',
    categories: ['health', 'lifestyle', 'productivity'],
    // Android y Chrome piden PNG para instalar y para la pantalla de arranque;
    // el «maskable» lleva el fondo hasta el borde y el símbolo en la zona
    // segura, para que el recorte redondo o de gota no lo muerda. Salen de
    // `icon.svg`, que sigue siendo el original.
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
