'use client';

interface ProgressRingProps {
  /** Cumplimiento 0..1. */
  ratio: number;
  size?: number;
  stroke?: number;
  color?: string;
  /** Contenido central (porcentaje, emoji, estrellas...). */
  children?: React.ReactNode;
}

export function ProgressRing({
  ratio,
  size = 96,
  stroke = 9,
  color = '#818cf8',
  children,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {children}
      </div>
    </div>
  );
}
