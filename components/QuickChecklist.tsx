'use client';

import { useState } from 'react';
import { tap } from '@/lib/haptics';
import type { HabitCategory, MetricValue } from '@/types';

/* =========================================================================
 *  El registro exprés: todas las casillas de sí o no del día, juntas.
 *
 *  Un registro de setenta casillas repartidas en siete tarjetas se deja de
 *  hacer: hay que abrir, bajar, cerrar… y un día que no apetece se salta, y
 *  luego otro. La mayoría son de sí o no («día sin alcohol», «movilidad»,
 *  «lectura»), y esas se pueden marcar todas de un vistazo, aquí arriba, en
 *  medio minuto. Las de cantidades y marcas siguen abajo, en su tarjeta, para
 *  cuando haya tiempo.
 *
 *  Sólo entra lo que puntúa: las casillas con peso cero (qué sesión del
 *  reparto tocaba, por ejemplo) se quedan en su sitio.
 * ========================================================================= */

interface QuickChecklistProps {
  categories: HabitCategory[];
  values: Record<string, MetricValue>;
  onChange: (metricId: string, value: boolean) => void;
}

/** Con menos de estas casillas de sí o no, no compensa la tarjeta. */
const MINIMO = 8;

export function QuickChecklist({ categories, values, onChange }: QuickChecklistProps) {
  const [abierta, setAbierta] = useState(true);
  const items = categories.flatMap((c) =>
    c.metrics.filter((m) => m.type === 'toggle' && m.weight !== 0).map((m) => ({ id: m.id, label: m.label, icon: m.icon, cat: c.icon })),
  );
  if (items.length < MINIMO) return null;
  const hechas = items.filter((m) => values[m.id] === true).length;
  const contestadas = items.filter((m) => values[m.id] !== undefined).length;

  return (
    <section className="card p-4">
      <button type="button" onClick={() => setAbierta((v) => !v)} className="flex w-full items-center gap-2 text-left" aria-expanded={abierta}>
        <span className="text-xl" aria-hidden>
          ⚡
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black t-1">Registro exprés</span>
          <span className="block text-[11px] t-3">
            {contestadas === 0
              ? `Las ${items.length} casillas de sí o no, de un toque. Lo demás, abajo cuando haya tiempo.`
              : `${hechas} hechas de ${items.length} · toca otra vez para desmarcar`}
          </span>
        </span>
        <span className="text-sm t-3" aria-hidden>
          {abierta ? '▾' : '▸'}
        </span>
      </button>
      {abierta && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {items.map((m) => {
            const v = values[m.id];
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    tap();
                    onChange(m.id, v !== true);
                  }}
                  aria-pressed={v === true}
                  className={`btn gap-1.5 border px-2.5 py-1.5 text-[12px] font-semibold leading-tight transition active:scale-95 ${
                    v === true ? 'border-accent bg-accent-soft t-1' : v === false ? 'hairline surf-1 t-3 line-through' : 'hairline surf-1 t-2 hover-soft'
                  }`}
                >
                  <span aria-hidden>{v === true ? '✅' : m.icon}</span>
                  {m.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
