'use client';

import Image from 'next/image';

interface PhotoProps {
  src: string;
  alt: string;
  /** Rellena el contenedor posicionado que la envuelve, como `next/image`. */
  fill?: boolean;
  /** Medidas intrínsecas, alternativa a `fill` (igual que en `next/image`). */
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
}

/**
 * Foto que acepta tanto las de fábrica (`/photos/…`) como las que sube el
 * usuario (`blob:…`).
 *
 * `next/image` sólo sabe optimizar rutas del proyecto o dominios declarados:
 * con una URL de objeto lanza un error de origen no permitido. Como las fotos
 * subidas ya vienen reducidas desde `lib/appearance`, no hay nada que
 * optimizar en ellas y basta con una etiqueta normal.
 */
export function Photo({
  src,
  alt,
  fill,
  width,
  height,
  sizes,
  className,
  style,
  priority,
}: PhotoProps) {
  if (src.startsWith('/')) {
    return (
      <Image
        src={src}
        alt={alt}
        fill={fill}
        width={width}
        height={height}
        sizes={sizes}
        className={className}
        style={style}
        priority={priority}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={
        fill
          ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }
          : style
      }
    />
  );
}
