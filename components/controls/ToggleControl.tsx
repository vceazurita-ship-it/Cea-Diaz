'use client';

import type { ToggleMetric } from '@/types';
import type { ControlProps } from './types';

export function ToggleControl({
  metric,
  value,
  onChange,
  variant,
  disabled,
}: ControlProps<ToggleMetric>) {
  const checked = value === true;

  if (variant === 'kid') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(checked ? undefined : true)}
        aria-pressed={checked}
        className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all
          ${checked ? 'bg-accent border-transparent shadow-accent' : 'hairline surf-1 t-1 hover-soft'}
          disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className={`text-3xl ${checked ? 'animate-pop' : ''}`} aria-hidden>
          {metric.icon}
        </span>
        <span
          className={`flex-1 text-base font-bold leading-tight ${checked ? 't-on-accent' : ''}`}
        >
          {metric.label}
        </span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-black
            ${checked ? 'bg-white/30 t-on-accent' : 'surf-2 t-3'}`}
          aria-hidden
        >
          {checked ? '✓' : '+'}
        </span>
      </button>
    );
  }

  /* Segmentado Sí/No en lugar de interruptor: un interruptor apagado no
     distingue «he dicho que no» de «todavía no lo he contestado», y esa
     diferencia es justo la que el cálculo de cumplimiento necesita.
     Volver a pulsar la opción marcada deja la métrica sin registrar. */
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-lg" aria-hidden>
        {metric.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium t-1">{metric.label}</p>
        {metric.help && <p className="text-xs t-3">{metric.help}</p>}
      </div>

      <div
        role="group"
        aria-label={metric.label}
        className="flex shrink-0 gap-0.5 rounded-xl border p-0.5 hairline surf-1"
      >
        {[
          { answer: true, label: 'Sí' },
          { answer: false, label: 'No' },
        ].map(({ answer, label }) => {
          const active = value === answer;
          return (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => onChange(active ? undefined : answer)}
              aria-pressed={active}
              title={active ? 'Pulsa otra vez para dejarlo sin registrar' : undefined}
              className={`min-w-[44px] rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors
                disabled:cursor-not-allowed disabled:opacity-40
                ${
                  active && answer
                    ? 'bg-accent t-on-accent'
                    : active
                      ? '[background:var(--danger-bg)] t-danger'
                      : 't-3 hover-soft hover:t-1'
                }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
