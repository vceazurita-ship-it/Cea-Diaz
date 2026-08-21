import type { MetadataRoute } from 'next';

/**
 * Manifiesto de aplicación instalable. La app se usa a diario desde el móvil,
 * así que conviene que se pueda anclar a la pantalla de inicio y abrirse sin
 * la barra del navegador. Los iconos reutilizan la portada ya optimizada.
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
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
