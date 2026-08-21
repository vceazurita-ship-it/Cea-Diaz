'use client';

interface StarsProps {
  /** Estrellas conseguidas (0..total). */
  value: number;
  total?: number;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}

const SIZES: Record<NonNullable<StarsProps['size']>, string> = {
  sm: 'text-sm',
  md: 'text-xl',
  lg: 'text-3xl',
};

export function Stars({ value, total = 5, size = 'md', animate = false }: StarsProps) {
  return (
    <div className={`flex gap-0.5 ${SIZES[size]}`} aria-label={`${value} de ${total} estrellas`}>
      {Array.from({ length: total }, (_, i) => {
        const earned = i < value;
        return (
          <span
            key={i}
            className={
              earned
                ? `drop-shadow-[0_0_6px_rgba(250,204,21,0.55)] ${animate ? 'animate-pop' : ''}`
                : 'opacity-25 grayscale'
            }
            style={animate && earned ? { animationDelay: `${i * 70}ms` } : undefined}
          >
            ⭐
          </span>
        );
      })}
    </div>
  );
}
