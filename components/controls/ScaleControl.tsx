'use client';

import type { ScaleMetric } from '@/types';
import type { ControlProps } from './types';

export function ScaleControl({
  metric,
  value,
  onChange,
  variant,
  disabled,
}: ControlProps<ScaleMetric>) {
  const current = typeof value === 'number' ? value : undefined;
  const levels = Array.from(
    { length: metric.max - metric.min + 1 },
    (_, i) => metric.min + i,
  );

  const kid = variant === 'kid';

  return (
    <div className={kid ? 'rounded-2xl border-2 hairline surf-1 p-3' : 'py-2'}>
      <div className="mb-2 flex items-center gap-2">
        <span className={kid ? 'text-2xl' : 'text-lg'} aria-hidden>
          {metric.icon}
        </span>
        <span className={`flex-1 ${kid ? 'text-base font-bold' : 'text-sm font-medium t-1'}`}>
          {metric.label}
        </span>
        {/* La etiqueta del nivel elegido se reserva el sitio siempre, para que
            marcar un valor no desplace la fila entera. */}
        <span className="min-h-[1rem] text-xs font-semibold t-accent">
          {current !== undefined ? metric.levels[current - metric.min] : ''}
        </span>
      </div>

      <div className="flex gap-1.5" role="group" aria-label={metric.label}>
        {levels.map((level, i) => {
          const selected = current === level;
          const emoji = metric.emojis?.[i];
          return (
            <button
              key={level}
              type="button"
              disabled={disabled}
              onClick={() => onChange(selected ? undefined : level)}
              aria-pressed={selected}
              aria-label={metric.levels[i] ?? String(level)}
              title={
                selected
                  ? `${metric.levels[i]} — pulsa otra vez para borrarlo`
                  : metric.levels[i]
              }
              className={`flex-1 rounded-xl border transition-all disabled:opacity-40
                ${kid ? 'py-2.5 text-2xl' : 'py-2 text-lg'}
                ${
                  selected
                    ? 'bg-accent-soft border-accent scale-[1.06]'
                    : 'hairline surf-1 opacity-90 hover:bg-accent-faint hover:opacity-100'
                }`}
            >
              {emoji ?? level}
            </button>
          );
        })}
      </div>
    </div>
  );
}
