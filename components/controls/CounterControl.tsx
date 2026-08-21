'use client';

import { ProgressBar } from '@/components/ui/ProgressBar';
import type { CounterMetric } from '@/types';
import type { ControlProps } from './types';

export function CounterControl({
  metric,
  value,
  onChange,
  variant,
  accent,
  disabled,
}: ControlProps<CounterMetric>) {
  const current = typeof value === 'number' ? value : 0;
  const registered = value !== undefined;
  const ratio = metric.target > 0 ? Math.min(1, current / metric.target) : 0;

  const set = (next: number) => {
    const clamped = Math.max(0, Math.min(metric.max, next));
    onChange(clamped === 0 && !registered ? undefined : clamped);
  };

  if (variant === 'kid') {
    return (
      <div className="rounded-2xl border-2 hairline surf-1 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-2xl">{metric.icon}</span>
          <span className="flex-1 text-base font-bold leading-tight">{metric.label}</span>
          <span className="text-sm font-black tabular-nums" style={{ color: accent }}>
            {current}/{metric.target}
          </span>
        </div>

        {/* Fichas tocables: representación visual directa del objetivo. */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {Array.from({ length: metric.max }, (_, i) => {
            const filled = i < current;
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => set(i + 1 === current ? i : i + 1)}
                aria-label={`Marcar ${i + 1} ${metric.unit}`}
                className={`h-9 w-9 rounded-xl text-lg transition-all disabled:opacity-50
                  ${
                    filled
                      ? 'scale-100 animate-pop border-2 border-transparent'
                      : 'border-2 border-dashed hairline-strong opacity-40 grayscale hover:opacity-70'
                  }
                  ${i + 1 > metric.target ? 'ring-1 ring-amber-300/40' : ''}`}
                style={filled ? { backgroundColor: `${accent}33` } : undefined}
              >
                {metric.pip ?? metric.icon}
              </button>
            );
          })}
        </div>

        <ProgressBar ratio={ratio} color={accent} chunky />
        {metric.help && <p className="mt-2 text-xs t-2">{metric.help}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-lg" aria-hidden>
        {metric.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium t-1">{metric.label}</p>
        <div className="mt-1 max-w-[220px]">
          <ProgressBar ratio={ratio} color={accent} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          disabled={disabled || current <= 0}
          onClick={() => set(current - metric.step)}
          className="h-7 w-7 rounded-lg border hairline surf-1 text-base leading-none
                     t-1 transition-colors hover-soft disabled:opacity-30"
          aria-label={`Restar ${metric.unit}`}
        >
          −
        </button>
        <span className="w-16 text-center text-sm font-semibold tabular-nums">
          <span style={{ color: registered ? accent : undefined }}>{registered ? current : '—'}</span>
          <span className="t-3">/{metric.target}</span>
        </span>
        <button
          type="button"
          disabled={disabled || current >= metric.max}
          onClick={() => set(current + metric.step)}
          className="h-7 w-7 rounded-lg border hairline surf-1 text-base leading-none
                     t-1 transition-colors hover-soft disabled:opacity-30"
          aria-label={`Sumar ${metric.unit}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
