'use client';

import type { ScaleMetric } from '@/types';
import type { ControlProps } from './types';

export function ScaleControl({
  metric,
  value,
  onChange,
  variant,
  accent,
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
        <span
          className={`flex-1 ${kid ? 'text-base font-bold' : 'text-sm font-medium t-1'}`}
        >
          {metric.label}
        </span>
        {current !== undefined && (
          <span className="text-xs font-semibold" style={{ color: accent }}>
            {metric.levels[current - metric.min]}
          </span>
        )}
      </div>

      <div className="flex gap-1.5">
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
              title={metric.levels[i]}
              className={`flex-1 rounded-xl border transition-all disabled:opacity-40
                ${kid ? 'py-2 text-2xl' : 'py-1.5 text-lg'}
                ${
                  selected
                    ? 'border-transparent scale-105'
                    : 'hairline surf-1 opacity-80 grayscale-[0.55] hover:opacity-100 hover:grayscale-0'
                }`}
              style={selected ? { backgroundColor: `${accent}33`, borderColor: accent } : undefined}
            >
              {emoji ?? level}
            </button>
          );
        })}
      </div>
    </div>
  );
}
