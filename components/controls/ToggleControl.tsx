'use client';

import type { ToggleMetric } from '@/types';
import type { ControlProps } from './types';

export function ToggleControl({
  metric,
  value,
  onChange,
  variant,
  accent,
  disabled,
}: ControlProps<ToggleMetric>) {
  const checked = value === true;
  const answered = value !== undefined;

  if (variant === 'kid') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(checked ? undefined : true)}
        aria-pressed={checked}
        className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all
          ${
            checked
              ? 'border-transparent shadow-lg'
              : 'hairline surf-1 t-1 hover-soft'
          }
          disabled:cursor-not-allowed disabled:opacity-50`}
        style={checked ? { backgroundColor: accent, boxShadow: `0 6px 20px ${accent}55` } : undefined}
      >
        <span className={`text-3xl ${checked ? 'animate-pop' : ''}`}>{metric.icon}</span>
        <span className="flex-1 text-base font-bold leading-tight">{metric.label}</span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-black
            ${checked ? 'bg-white/30' : 'surf-2'}`}
        >
          {checked ? '✓' : ''}
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-lg" aria-hidden>
        {metric.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium t-1">{metric.label}</p>
        {metric.help && <p className="truncate text-xs t-3">{metric.help}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(checked ? undefined : true)}
          aria-pressed={checked}
          className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50
            ${checked ? '' : 'surf-3'}`}
          style={checked ? { backgroundColor: accent } : undefined}
          aria-label={`Marcar ${metric.label}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all
              ${checked ? 'left-[22px]' : 'left-0.5'}`}
          />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(answered && !checked ? undefined : false)}
          className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors
            ${
              value === false
                ? '[background:var(--danger-bg)] t-danger'
                : 't-3 hover-soft hover:t-2'
            }`}
          title="Marcar como no cumplido"
        >
          No
        </button>
      </div>
    </div>
  );
}
