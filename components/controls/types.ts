import type { Metric, MetricValue } from '@/types';

/** Tono visual: gamificado para los niños, sobrio para los adultos y grupos. */
export type ControlVariant = 'kid' | 'adult';

export interface ControlProps<M extends Metric = Metric> {
  metric: M;
  value: MetricValue | undefined;
  /** `undefined` borra el registro de esa métrica. */
  onChange: (value: MetricValue | undefined) => void;
  variant: ControlVariant;
  disabled?: boolean;
}
