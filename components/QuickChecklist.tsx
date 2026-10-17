'use client';

import { useState } from 'react';
import { ProgressRing } from '@/components/ui/ProgressRing';
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
 *
 *  Las pastillas van de dos en dos (tres o cuatro en pantalla ancha) y no una
 *  por línea: con treinta casillas de nombres largos, el flujo libre dejaba
 *  casi todas solas en su fila y el exprés medía tres pantallas. Lo que ya
 *  está aquí no se repite abajo: las tarjetas lo pliegan (ver `quickIds`).
 * ========================================================================= */

/** Con menos de estas casillas de sí o no, no compensa la tarjeta. */
const MINIMO = 8;

/** Las casillas que van al exprés, en el orden de las tarjetas. */
export function quickItems(categories: HabitCategory[]) {
  return categories.flatMap((c) =>
    c.metrics.filter((m) => m.type === 'toggle' && m.weight !== 0).map((m) => ({ id: m.id, label: m.label, icon: m.icon, cat: c.icon })),
  );
}

/**
 * Los ids que el exprés se queda, o ninguno si no compensa la tarjeta. Es lo
 * que las tarjetas de abajo usan para no repetir esas casillas.
 */
export function quickIds(categories: HabitCategory[]): ReadonlySet<string> {
  const items = quickItems(categories);
  return new Set(items.length < MINIMO ? [] : items.map((m) => m.id));
}

interface QuickChecklistProps {
  categories: HabitCategory[];
  values: Record<string, MetricValue>;
  onChange: (metricId: string, value: boolean) => void;
  /** Con el filtro de pendientes puesto, sólo las que aún no se han contestado. */
  onlyPending?: boolean;
}

export function QuickChecklist({ categories, values, onChange, onlyPending = false }: QuickChecklistProps) {
  const items = quickItems(categories);
  const contestadas = items.filter((m) => values[m.id] !== undefined).length;
  // Abierta mientras quede algo; con todo contestado, plegada y con su cuenta.
  const [abierta, setAbierta] = useState(contestadas < items.length);
  if (items.length < MINIMO) return null;
  const hechas = items.filter((m) => values[m.id] === true).length;
  const visibles = onlyPending ? items.filter((m) => values[m.id] === undefined) : items;

  return (
    <section className="card p-3 sm:p-4" aria-labelledby="registro-expres">
      <button type="button" onClick={() => setAbierta((v) => !v)} className="flex w-full items-center gap-3 text-left" aria-expanded={abierta}>
        <ProgressRing ratio={items.length ? contestadas / items.length : 0} size={40} stroke={4}>
          <span className="text-[11px] font-black t-1" aria-hidden>
            {contestadas === items.length ? '✓' : '⚡'}
          </span>
        </ProgressRing>
        <span className="min-w-0 flex-1">
          <span id="registro-expres" className="block text-[11px] font-black uppercase tracking-[0.18em] t-3">
            Registro exprés
          </span>
          <span className="block text-sm font-bold t-1">
            {contestadas === 0
              ? `${items.length} de sí o no, de un toque`
              : `${hechas} hechas · ${contestadas}/${items.length} contestadas`}
          </span>
        </span>
        <span className={`text-sm t-3 transition-transform ${abierta ? 'rotate-180' : ''}`} aria-hidden>
          ▾
        </span>
      </button>
      {abierta && (
        <>
          {visibles.length === 0 ? (
            <p className="mt-3 text-xs t-3">Todas contestadas. Quita «Sólo pendientes» para repasarlas.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {visibles.map((m) => {
                const v = values[m.id];
                return (
                  <li key={m.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        tap();
                        onChange(m.id, v !== true);
                      }}
                      aria-pressed={v === true}
                      title={m.label}
                      className={`flex min-h-[2.75rem] w-full items-center gap-1.5 rounded-xl border px-2 py-1.5 text-left text-[12px] font-semibold leading-tight transition active:scale-95 ${
                        v === true ? 'border-accent bg-accent-soft t-1' : v === false ? 'hairline surf-1 t-3 line-through' : 'hairline surf-1 t-2 hover-soft'
                      }`}
                    >
                      <span aria-hidden className="shrink-0">
                        {v === true ? '✅' : m.icon}
                      </span>
                      <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{m.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[11px] t-3">Toca otra vez para desmarcar. Lo de cantidades y marcas, en su tarjeta de abajo.</p>
        </>
      )}
    </section>
  );
}
