'use client';

import { ProgressBar } from '@/components/ui/ProgressBar';
import { isCeiling, metricRatio, targetWord } from '@/lib/scoring';
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
  disabled,
}: ControlProps<DurationMetric>) {
  const registered = typeof value === 'number';
  const current = registered ? (value as number) : metric.min;
  // Igual que en el contador: el cumplimiento lo calcula el mismo sitio que
  // puntúa el día, de modo que un techo se pinta lleno mientras no se pase.
  const ceiling = isCeiling(metric);
  const ratio = metricRatio(metric, registered ? current : undefined) ?? 0;
  const overrun = registered && ceiling && current > metric.target;
  // Partir de la meta al primer toque ahorra arrastrar el deslizador cada día.
  const startValue = Math.min(metric.max, Math.max(metric.min, metric.target));

  const set = (next: number) => {
    const clamped = Math.max(metric.min, Math.min(metric.max, snap(next, metric.step)));
    onChange(clamped);
  };

  if (variant === 'kid') {
    return (
      <div className="rounded-2xl border-2 hairline surf-1 p-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {metric.icon}
          </span>
          <span className="flex-1 text-base font-bold leading-tight">{metric.label}</span>
        </div>

        <div className="mb-3 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={disabled || (registered && current <= metric.min)}
            onClick={() => set(registered ? current - metric.step : startValue)}
            className="h-12 w-12 rounded-2xl border-2 hairline-strong surf-1 text-2xl
                       font-black transition-colors hover-soft disabled:opacity-30"
            aria-label="Restar"
          >
            −
          </button>
          <div className="min-w-[110px] text-center">
            <div
              className={`text-3xl font-black tabular-nums ${
                overrun ? 't-danger' : registered ? 't-accent' : 't-3'
              }`}
            >
              {registered ? current : '—'}
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide t-2">
              {metric.unit} · {targetWord(metric)} {metric.target}
            </div>
          </div>
          <button
            type="button"
            disabled={disabled || current >= metric.max}
            onClick={() => set(registered ? current + metric.step : startValue)}
            className="h-12 w-12 rounded-2xl border-2 hairline-strong surf-1 text-2xl
                       font-black transition-colors hover-soft disabled:opacity-30"
            aria-label="Sumar"
          >
            +
          </button>
        </div>

        <ProgressBar ratio={registered ? ratio : 0} chunky />
      </div>
    );
  }

  const pct = ((current - metric.min) / (metric.max - metric.min)) * 100;

  return (
    <div className="py-2">
      {/* Igual que en el contador: antes que recortar el nombre de la métrica,
          la fila se parte y la cifra baja a la línea siguiente. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-lg" aria-hidden>
          {metric.icon}
        </span>
        <p className="min-w-[8rem] flex-1 text-sm font-medium leading-snug t-1">{metric.label}</p>
        <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">
          <span className={overrun ? 't-danger' : registered ? 't-accent' : 't-3'}>
            {registered ? current : '—'}
          </span>
          <span className="t-3">
            {ceiling ? ` · ${targetWord(metric)} ` : ' / '}
            {metric.target} {metric.unit}
          </span>
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        {/* Sin registrar el deslizador se atenúa y no pinta relleno, para que
            el pulgar en el mínimo no se confunda con un valor elegido. */}
        <input
          type="range"
          min={metric.min}
          max={metric.max}
          step={metric.step}
          value={current}
          disabled={disabled}
          onChange={(e) => set(Number(e.target.value))}
          aria-label={`${metric.label} en ${metric.unit}`}
          aria-valuetext={registered ? `${current} ${metric.unit}` : 'sin registrar'}
          className={registered ? '' : 'opacity-45'}
          style={
            registered
              ? {
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--track) ${pct}%, var(--track) 100%)`,
                }
              : undefined
          }
        />
        <button
          type="button"
          disabled={disabled || !registered}
          onClick={() => onChange(undefined)}
          className="flex h-10 shrink-0 items-center rounded-lg px-2.5 text-[11px] font-semibold
                     t-3 transition-colors hover-soft hover:t-2 disabled:invisible"
          title="Borrar registro"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
