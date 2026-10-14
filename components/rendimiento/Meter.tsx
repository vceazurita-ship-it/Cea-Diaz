'use client';

/* =========================================================================
 *  Una barra que sitúa, no que llena.
 *
 *  Para un percentil en horquilla o un índice sobre su escala: una franja de
 *  referencia (lo normal), un tramo (la horquilla) y/o una marca (el valor).
 *  Se anuncia como medidor, con su valor y su escala, para quien no la ve.
 * ========================================================================= */

interface MeterProps {
  /** Valor que se anuncia, en la escala de `min`–`max`. */
  value: number;
  min?: number;
  max?: number;
  /** Nombre accesible. */
  label: string;
  /** Texto del valor para el lector de pantalla («entre 40 y 60»). */
  valueText?: string;
  /** Tramo a rellenar, en % del ancho (0–100). */
  range?: [number, number];
  /** Posición de la marca, en % del ancho (0–100). */
  marker?: number;
  /** Franja de referencia de fondo, en % del ancho. */
  band?: [number, number];
  color?: string;
  className?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function Meter({
  value,
  min = 0,
  max = 100,
  label,
  valueText,
  range,
  marker,
  band,
  color = 'var(--accent)',
  className = 'mt-1.5',
}: MeterProps) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={valueText}
      className={`relative h-2 rounded-full track ${className}`}
    >
      {band && (
        <span
          aria-hidden
          className="absolute inset-y-0 surf-3"
          style={{ left: `${clamp(band[0])}%`, width: `${clamp(band[1]) - clamp(band[0])}%` }}
        />
      )}
      {range && (
        <span
          aria-hidden
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${clamp(range[0])}%`,
            width: `${Math.max(2, clamp(range[1]) - clamp(range[0]))}%`,
            backgroundColor: color,
          }}
        />
      )}
      {marker !== undefined && (
        <span
          aria-hidden
          className="absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${clamp(marker)}%`, backgroundColor: color }}
        />
      )}
    </div>
  );
}
