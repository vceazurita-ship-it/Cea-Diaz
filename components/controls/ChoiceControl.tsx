'use client';

import type { ChoiceMetric } from '@/types';
import type { ControlProps } from './types';

export function ChoiceControl({
  metric,
  value,
  onChange,
  variant,
  accent,
  disabled,
}: ControlProps<ChoiceMetric>) {
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
      </div>

      <div className="flex flex-wrap gap-1.5">
        {metric.options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(selected ? undefined : option.value)}
              aria-pressed={selected}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-all
                disabled:opacity-40
                ${kid ? 'text-sm font-bold' : 'text-xs font-medium'}
                ${
                  selected
                    ? 'border-transparent'
                    : 'hairline surf-1 t-2 opacity-70 hover:opacity-100'
                }`}
              style={selected ? { backgroundColor: `${accent}33`, borderColor: accent } : undefined}
            >
              <span className={kid ? 'text-xl' : 'text-base'}>{option.icon}</span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
