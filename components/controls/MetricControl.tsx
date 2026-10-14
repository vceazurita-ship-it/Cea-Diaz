'use client';

import { tap } from '@/lib/haptics';
import type { Metric, MetricValue } from '@/types';
import { ChoiceControl } from './ChoiceControl';
import { CounterControl } from './CounterControl';
import { DurationControl } from './DurationControl';
import { ScaleControl } from './ScaleControl';
import { ToggleControl } from './ToggleControl';
import type { ControlProps } from './types';

/**
 * Punto único de despacho: la UI no conoce las métricas concretas, sólo su
 * tipo. Añadir una métrica nueva al catálogo no requiere tocar componentes.
 */
/** Último toque en la mano, para no zumbar en cada paso de un deslizador. */
let lastTap = 0;

export function MetricControl(incoming: ControlProps<Metric>) {
  const { metric } = incoming;

  // Cada respuesta se nota en la mano, sea del control que sea. Arrastrando
  // el deslizador llegan decenas por segundo: con una cada tanto basta para
  // que se sienta como los dientes de una rueda, no como un zumbido.
  const props: ControlProps<Metric> = {
    ...incoming,
    onChange: (value: MetricValue | undefined) => {
      const now = Date.now();
      if (now - lastTap > 120) {
        lastTap = now;
        tap();
      }
      incoming.onChange(value);
    },
  };

  switch (metric.type) {
    case 'toggle':
      return <ToggleControl {...props} metric={metric} />;
    case 'counter':
      return <CounterControl {...props} metric={metric} />;
    case 'duration':
      return <DurationControl {...props} metric={metric} />;
    case 'scale':
      return <ScaleControl {...props} metric={metric} />;
    case 'choice':
      return <ChoiceControl {...props} metric={metric} />;
    default:
      return null;
  }
}
