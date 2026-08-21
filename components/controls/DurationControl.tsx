'use client';

import { ProgressBar } from '@/components/ui/ProgressBar';
import type { DurationMetric } from '@/types';
import type { ControlProps } from './types';

/** Redondea al paso de la métrica evitando errores de coma flotante. */
function snap(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(2));
}

export function DurationControl({
  metric,
  value,
  onChange,
  variant,
  accent,
  disabled,
}: ControlProps<DurationMetric>) {
  const registered = typeof value === 'number';
  const current = registered ? (value as number) : metric.min;
  const ratio = metric.target > 0 ? Math.min(1, current / metric.target) : 0;

  const set = (next: number) => {
    const clamped = Math.max(metric.min, Math.min(metric.max, snap(next, metric.step)));
    onChange(clamped);
  };

  if (variant === 'kid') {
    return (
      <div className="rounded-2xl border-2 hairline surf-1 p-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-2xl">{metric.icon}</span>
          <span className="flex-1 text-base font-bold leading-tight">{metric.label}</span>
        </div>

        <div className="mb-3 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={disabled || current <= metric.min}
            onClick={() => set(current - metric.step)}
            className="h-12 w-12 rounded-2xl border-2 hairline-strong surf-1 text-2xl
                       font-black transition-colors hover-soft disabled:opacity-30"
            aria-label="Restar"
          >
            −
          </button>
          <div className="min-w-[110px] text-center">
            <div className="text-3xl font-black tabular-nums" style={{ color: accent }}>
              {registered ? current : '—'}
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide t-2">
              {metric.unit} · meta {metric.target}
            </div>
          </div>
          <button
            type="button"
            disabled={disabled || current >= metric.max}
            onClick={() => set(current + metric.step)}
            className="h-12 w-12 rounded-2xl border-2 hairline-strong surf-1 text-2xl
                       font-black transition-colors hover-soft disabled:opacity-30"
            aria-label="Sumar"
          >
            +
          </button>
        </div>

        <ProgressBar ratio={ratio} color={accent} chunky />
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <span className="text-lg" aria-hidden>
          {metric.icon}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium t-1">{metric.label}</p>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          <span style={{ color: registered ? accent : undefined }}>
            {registered ? current : '—'}
          </span>
          <span className="t-3">
            {' '}
            / {metric.target} {metric.unit}
          </span>
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <input
          type="range"
          min={metric.min}
          max={metric.max}
          step={metric.step}
          value={current}
          disabled={disabled}
          onChange={(e) => set(Number(e.target.value))}
          aria-label={metric.label}
          style={{
            background: `linear-gradient(to right, ${accent} 0%, ${accent} ${
              ((current - metric.min) / (metric.max - metric.min)) * 100
            }%, var(--track) ${
              ((current - metric.min) / (metric.max - metric.min)) * 100
            }%, var(--track) 100%)`,
          }}
        />
        <button
          type="button"
          disabled={disabled || !registered}
          onClick={() => onChange(undefined)}
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold t-3
                     transition-colors hover-soft hover:t-2 disabled:opacity-30"
          title="Borrar registro"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
