'use client';

import { ProgressBar } from '@/components/ui/ProgressBar';
import type { CounterMetric } from '@/types';
import type { ControlProps } from './types';

export function CounterControl({
  metric,
  value,
  onChange,
  variant,
  disabled,
}: ControlProps<CounterMetric>) {
  const current = typeof value === 'number' ? value : 0;
  const registered = value !== undefined;
  const ratio = metric.target > 0 ? Math.min(1, current / metric.target) : 0;
  const reached = registered && current >= metric.target;

  const set = (next: number) => {
    const clamped = Math.max(0, Math.min(metric.max, next));
    onChange(clamped === 0 && !registered ? undefined : clamped);
  };

  if (variant === 'kid') {
    return (
      <div className="rounded-2xl border-2 hairline surf-1 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {metric.icon}
          </span>
          <span className="flex-1 text-base font-bold leading-tight">{metric.label}</span>
          <span className="text-sm font-black tabular-nums t-accent">
            {current}/{metric.target}
            {reached && <span className="ml-1">🎉</span>}
          </span>
        </div>

        {/* Fichas tocables: representación visual directa del objetivo. */}
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={metric.label}>
          {Array.from({ length: metric.max }, (_, i) => {
            const filled = i < current;
            const extra = i + 1 > metric.target;
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => set(i + 1 === current ? i : i + 1)}
                aria-pressed={filled}
                aria-label={`${i + 1} ${metric.unit}`}
                className={`h-11 w-11 rounded-xl text-xl transition-all disabled:opacity-50
                  ${
                    filled
                      ? 'bg-accent-soft animate-pop border-2 border-accent'
                      : 'border-2 border-dashed hairline-strong opacity-45 grayscale hover:opacity-80'
                  }
                  ${extra ? 'ring-1 ring-amber-300/50' : ''}`}
                title={extra ? `Por encima de la meta (${metric.target})` : undefined}
              >
                {metric.pip ?? metric.icon}
              </button>
            );
          })}
        </div>

        <ProgressBar ratio={ratio} chunky />
        {metric.help && <p className="mt-2 text-xs t-2">{metric.help}</p>}
      </div>
    );
  }

  return (
    // La fila se parte en dos cuando no cabe, en vez de recortar el nombre de
    // la métrica: en un móvil estrecho, «Vasos de agua» se quedaba en «Vas…»
    // y la fila dejaba de decir qué se estaba contando.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <span className="text-lg" aria-hidden>
        {metric.icon}
      </span>
      <div className="min-w-[8rem] flex-1">
        <p className="text-sm font-medium leading-snug t-1">{metric.label}</p>
        <div className="mt-1 max-w-[220px]">
          <ProgressBar ratio={ratio} />
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={disabled || !registered}
          onClick={() => onChange(undefined)}
          className="mr-1 flex h-10 w-8 items-center justify-center rounded-lg text-[11px] font-semibold t-3
                     transition-colors hover-soft hover:t-2 disabled:invisible"
          aria-label={`Borrar el registro de ${metric.label}`}
          title="Borrar registro"
        >
          ✕
        </button>
        <button
          type="button"
          disabled={disabled || current <= 0}
          onClick={() => set(current - metric.step)}
          className="h-10 w-10 rounded-lg border hairline surf-1 text-base leading-none
                     t-1 transition-colors hover-soft disabled:opacity-30"
          aria-label={`Restar ${metric.unit}`}
        >
          −
        </button>
        <span className="w-16 text-center text-sm font-semibold tabular-nums">
          <span className={registered ? 't-accent' : 't-3'}>{registered ? current : '—'}</span>
          <span className="t-3">/{metric.target}</span>
        </span>
        <button
          type="button"
          disabled={disabled || current >= metric.max}
          onClick={() => set(current + metric.step)}
          className="h-10 w-10 rounded-lg border hairline surf-1 text-base leading-none
                     t-1 transition-colors hover-soft disabled:opacity-30"
          aria-label={`Sumar ${metric.unit}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
