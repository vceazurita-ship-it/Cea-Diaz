'use client';

import { useId, useState } from 'react';
import { MetricControl } from '@/components/controls/MetricControl';
import type { ControlVariant } from '@/components/controls/types';
import { SportsPanel } from '@/components/SportsPanel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { computeCategoryScore, percent } from '@/lib/scoring';
import type { HabitCategory, MetricValue, ProfileSkin } from '@/types';

interface CategoryCardProps {
  category: HabitCategory;
  values: Record<string, MetricValue>;
  onChange: (metricId: string, value: MetricValue | undefined) => void;
  variant: ControlVariant;
  skin?: ProfileSkin;
  defaultOpen?: boolean;
}

export function CategoryCard({
  category,
  values,
  onChange,
  variant,
  skin = 'night',
  defaultOpen = true,
}: CategoryCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const score = computeCategoryScore(category, values);
  const kid = variant === 'kid';
  const panelId = useId();

  const pending = score.total - score.filled;
  const complete = score.total > 0 && pending === 0;

  return (
    <section className={kid ? 'card-kid overflow-hidden' : 'card overflow-hidden'}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover-soft"
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br
            ${category.gradient} ${kid ? 'h-14 w-14 text-3xl' : 'h-11 w-11 text-2xl'} shadow`}
          aria-hidden
        >
          {category.icon}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-bold t-1 ${
              kid ? 'font-display text-lg uppercase tracking-wide' : 'text-base'
            }`}
          >
            {category.label}
          </span>
          {/* Plegada, la tarjeta dice cuánto falta; desplegada, de qué va. */}
          <span className="block truncate text-xs t-3">
            {open
              ? category.description
              : complete
                ? '✓ Completa'
                : `Quedan ${pending} por registrar`}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-3">
          <span className="text-right">
            <span className="block text-sm font-bold tabular-nums t-accent">
              {percent(score.ratio)}
            </span>
            <span className="block text-[11px] t-3">
              {score.filled}/{score.total}
            </span>
          </span>
          <span
            className={`t-3 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            ▾
          </span>
        </span>
      </button>

      <div className="px-4">
        <ProgressBar
          ratio={score.ratio}
          chunky={kid}
          ariaLabel={`Cumplimiento de ${category.label}`}
        />
      </div>

      {open && (
        <div
          id={panelId}
          className={`animate-floatUp p-4 ${
            kid ? 'space-y-3' : 'divide-y divide-[var(--border)]'
          }`}
        >
          {category.layout === 'sports' ? (
            <SportsPanel
              category={category}
              values={values}
              onChange={onChange}
              variant={variant}
              skin={skin}
            />
          ) : (
            category.metrics.map((metric) => (
              <MetricControl
                key={metric.id}
                metric={metric}
                value={values[metric.id]}
                onChange={(value) => onChange(metric.id, value)}
                variant={variant}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}
