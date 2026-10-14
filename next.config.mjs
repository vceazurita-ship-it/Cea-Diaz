/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // AVIF pesa en torno a un tercio menos que WebP con la misma foto, y la
  // portada es lo último en aparecer al abrir la app en el móvil.
  images: { formats: ['image/avif', 'image/webp'] },
};

export default nextConfig;
