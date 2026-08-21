'use client';

import type { Metric } from '@/types';
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
export function MetricControl(props: ControlProps<Metric>) {
  const { metric } = props;

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
