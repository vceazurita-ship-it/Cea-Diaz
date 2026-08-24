'use client';

import { MetricControl } from '@/components/controls/MetricControl';
import type { ControlVariant } from '@/components/controls/types';
import type { HabitCategory, MetricHint, MetricValue, ProfileSkin } from '@/types';

interface SportsPanelProps {
  category: HabitCategory;
  values: Record<string, MetricValue>;
  onChange: (metricId: string, value: MetricValue | undefined) => void;
  variant: ControlVariant;
  skin?: ProfileSkin;
  /** Apunte al pie de una casilla: la marca que hay que batir hoy. */
  hints?: Record<string, MetricHint>;
}

/**
 * Layout de tarjeta por grupo. Nació para el desglose deportivo de los peques
 * —una tarjeta por actividad— y lo usa igual el reparto de gimnasio de Víctor:
 * el detalle (esfuerzo, sensaciones, la marca del día) sólo aparece si la
 * casilla está marcada, para que el registro diario siga siendo de dos toques.
 *
 * En la piel de fútbol la tarjeta se convierte en una casilla de alineación:
 * el fútbol ocupa toda la fila y las demás actividades quedan en el banquillo.
 */
export function SportsPanel({
  category,
  values,
  onChange,
  variant,
  skin = 'night',
  hints,
}: SportsPanelProps) {
  const groups = category.groups ?? [];
  const pitch = skin === 'pitch';
  // Métricas de la categoría que no pertenecen a ninguna actividad: el
  // movimiento del día, que cuenta juegue o no juegue con un club.
  const loose = category.metrics.filter((metric) => metric.group === undefined);

  return (
    <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map((sport) => {
        const metrics = category.metrics.filter((m) => m.group === sport.id);
        // La casilla que abre la tarjeta: la asistencia en los deportes y, en
        // el reparto de gimnasio, el interruptor de «sesión hecha».
        const attendance =
          metrics.find((m) => m.id.endsWith('.asistencia')) ??
          metrics.find((m) => m.type === 'toggle');
        const details = metrics.filter((m) => m !== attendance);
        const attended = attendance ? values[attendance.id] === true : false;
        // El fútbol es la actividad principal de los peques: fila completa.
        const featured = pitch && sport.id === 'futbol';

        return (
          <div
            key={sport.id}
            className={`overflow-hidden rounded-2xl border transition-colors
              ${featured ? 'sm:col-span-2' : ''}
              ${attended ? 'border-accent bg-accent-faint' : 'hairline surf-1'}`}
          >
            <button
              type="button"
              onClick={() => attendance && onChange(attendance.id, attended ? undefined : true)}
              aria-pressed={attended}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover-soft"
            >
              <span
                className={`flex shrink-0 items-center justify-center rounded-xl
                  bg-gradient-to-br ${sport.gradient} transition-all
                  ${featured ? 'h-14 w-14 text-3xl' : 'h-12 w-12 text-2xl'}
                  ${attended ? 'shadow-lg' : 'opacity-45 grayscale'}`}
                aria-hidden
              >
                {sport.icon}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate font-bold t-1 ${
                    featured ? 'font-display text-xl uppercase tracking-wide' : 'text-base'
                  }`}
                >
                  {sport.label}
                </span>
                <span className="block text-xs t-3">
                  {attended
                    ? (sport.on ?? (pitch ? 'Convocado y jugado' : 'Asistencia registrada'))
                    : (sport.off ?? (pitch ? 'Toca para alinearte hoy' : 'Toca si has entrenado hoy'))}
                </span>
              </span>

              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm
                  font-black ${attended ? 'bg-accent t-on-accent' : 'surf-2 t-3'}`}
                aria-hidden
              >
                {attended ? '✓' : '+'}
              </span>
            </button>

            {attended && (
              <div className="animate-floatUp space-y-2 border-t px-3 pb-3 pt-2 hairline">
                {details.map((metric) => {
                  const hint = hints?.[metric.id];

                  return (
                    <div key={metric.id}>
                      <MetricControl
                        metric={metric}
                        value={values[metric.id]}
                        onChange={(value) => onChange(metric.id, value)}
                        variant={variant}
                      />
                      {/* La marca a batir se dice justo aquí, que es donde se
                          apunta: en la pestaña de retos ya sería tarde. */}
                      {hint && (
                        <p
                          className={`mt-1 text-[11px] font-semibold leading-snug ${
                            hint.record ? 't-accent' : 't-3'
                          }`}
                          aria-live="polite"
                        >
                          {hint.record ? '🏆' : '🎯'} {hint.text}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>

      {loose.length > 0 && (
        <div className={variant === 'kid' ? 'space-y-3' : 'divide-y divide-[var(--border)]'}>
          {loose.map((metric) => (
            <MetricControl
              key={metric.id}
              metric={metric}
              value={values[metric.id]}
              onChange={(value) => onChange(metric.id, value)}
              variant={variant}
            />
          ))}
        </div>
      )}
    </div>
  );
}
