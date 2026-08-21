'use client';

interface ProgressBarProps {
  /** Cumplimiento 0..1. */
  ratio: number;
  /** Color sólido de la barra (hex). */
  color?: string;
  /** Barra más gruesa y redondeada para los perfiles infantiles. */
  chunky?: boolean;
  label?: string;
  showValue?: boolean;
}

export function ProgressBar({
  ratio,
  color = '#818cf8',
  chunky = false,
  label,
  showValue = false,
}: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="mb-1 flex items-baseline justify-between text-xs">
          {label && <span className="t-2">{label}</span>}
          {showValue && <span className="font-semibold tabular-nums t-1">{pct} %</span>}
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full surf-2 ${chunky ? 'h-4' : 'h-2'}`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progreso'}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            boxShadow: chunky ? `0 0 12px ${color}66` : undefined,
          }}
        />
      </div>
    </div>
  );
}
