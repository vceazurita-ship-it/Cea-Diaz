'use client';

import { useState } from 'react';

import { LEDGERS, TIERS, TIER_ORDER, euros } from '@/lib/finance';
import type { FinanceItem, LedgerId } from '@/types';

/* =========================================================================
 *  Una libreta, con sus apuntes editables en el sitio.
 *
 *  Sin formularios ni diálogos: la cifra se cambia donde se lee. Rellenar
 *  veinte gastos abriendo veinte ventanas es exactamente lo que hace que
 *  nadie mantenga sus cuentas, y es lo que la hoja de cálculo hacía bien.
 *
 *  Los gastos llevan dos cifras —lo que se aparta y lo que de verdad se va— y
 *  los ingresos que no están cerrados también: un mínimo y un máximo. Es el
 *  mismo par de columnas de la hoja, y aquí el segundo campo sólo sale donde
 *  significa algo.
 * ========================================================================= */

interface LedgerCardProps {
  ledger: LedgerId;
  items: FinanceItem[];
  total: number;
  onChange: (item: FinanceItem) => void;
  onDelete: (item: FinanceItem) => void;
  onAdd: () => void;
}

export function LedgerCard({ ledger, items, total, onChange, onDelete, onAdd }: LedgerCardProps) {
  const meta = LEDGERS[ledger];
  const twin = meta.alt !== undefined;
  /**
   * Qué apunte tiene la nota abierta. Rellenar dieciocho gastos son dieciocho
   * cifras, no dieciocho notas: con el campo siempre puesto, la libreta medía
   * siete pantallas de móvil y la mayoría eran huecos vacíos. Se abre donde se
   * quiere escribir, y donde ya hay algo escrito sale sola. Donde la nota es
   * la mitad del apunte —cuándo reclamar un cobro— sale siempre.
   */
  const [noting, setNoting] = useState<string | null>(null);

  return (
    <section className="card p-3" aria-label={meta.label}>
      <header className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-bold t-1">
          <span aria-hidden>{meta.icon}</span> {meta.label}
        </h3>
        <span className="text-[11px] t-3">{meta.rhythm === 'mes' ? 'al mes' : 'saldo de hoy'}</span>
        <span className="ml-auto text-sm font-bold tabular-nums t-1">{euros(total)}</span>
      </header>

      <p className="mb-2 text-[11px] leading-relaxed t-3">{meta.hint}</p>

      {items.length === 0 ? (
        <p className="py-2 text-xs t-3">Sin nada apuntado todavía.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border p-2 hairline surf-1">
              <div className="flex items-center gap-1.5">
                <input
                  value={item.icon}
                  onChange={(event) =>
                    onChange({ ...item, icon: event.target.value.slice(0, 4) || '📌' })
                  }
                  aria-label="Emoji"
                  className="field w-11 shrink-0 px-1 py-1 text-center text-sm"
                />

                <input
                  value={item.label}
                  onChange={(event) => onChange({ ...item, label: event.target.value.slice(0, 60) })}
                  placeholder={`Nombre del ${meta.word}`}
                  aria-label={`Nombre del ${meta.word}`}
                  className="field min-w-0 flex-1 py-1 text-sm"
                />

                {!meta.noteAlways && !item.note && (
                  <button
                    type="button"
                    onClick={() => setNoting(noting === item.id ? null : item.id)}
                    aria-label={`Nota de «${item.label || meta.word}»`}
                    aria-pressed={noting === item.id}
                    title={meta.noteLabel}
                    className="btn-ghost min-h-0 shrink-0 px-2 py-1 text-xs"
                  >
                    🗒️
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  aria-label={`Quitar «${item.label || meta.word}»`}
                  title="Quitar (se puede deshacer)"
                  className="btn-ghost min-h-0 shrink-0 px-2 py-1 text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="mt-1.5 flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1">
                  <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide t-3">
                    {meta.main}
                  </span>
                  <input
                    type="number"
                    step={10}
                    value={item.amount === 0 ? '' : item.amount}
                    onChange={(event) =>
                      onChange({ ...item, amount: Number(event.target.value) || 0 })
                    }
                    placeholder="0"
                    className="field w-full py-1 text-sm tabular-nums"
                  />
                </label>

                {twin && (
                  <label className="min-w-0 flex-1">
                    <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide t-3">
                      {meta.alt}
                    </span>
                    <input
                      type="number"
                      step={10}
                      value={item.alt ?? ''}
                      onChange={(event) =>
                        onChange({
                          ...item,
                          alt: event.target.value === '' ? undefined : Number(event.target.value),
                        })
                      }
                      placeholder="—"
                      className="field w-full py-1 text-sm tabular-nums"
                    />
                  </label>
                )}

                {/* A qué prioridad sirve. Sólo en los gastos: es lo que
                    permite contrastar el reparto contra la escala de la casa,
                    y es un toque por gasto que se da una vez. */}
                {ledger === 'gastos' && (
                  <label className="min-w-0 basis-full">
                    <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide t-3">
                      ¿A qué sirve?
                    </span>
                    <select
                      value={item.tier ?? ''}
                      onChange={(event) =>
                        onChange({
                          ...item,
                          tier: (event.target.value || undefined) as FinanceItem['tier'],
                        })
                      }
                      className="field w-full py-1 text-sm"
                    >
                      <option value="">Sin colocar</option>
                      {TIER_ORDER.filter((tier) => tier !== 'otros').map((tier) => (
                        <option key={tier} value={tier}>
                          {TIERS[tier].icon} {TIERS[tier].label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {(meta.noteAlways || item.note !== undefined || noting === item.id) && (
                  <label className="min-w-0 flex-[2] basis-full sm:basis-0">
                    <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide t-3">
                      {meta.noteLabel}
                    </span>
                    <input
                      value={item.note ?? ''}
                      onChange={(event) =>
                        onChange({ ...item, note: event.target.value.slice(0, 160) || undefined })
                      }
                      placeholder={meta.notePlaceholder}
                      className="field w-full py-1 text-sm"
                    />
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onAdd} className="btn-ghost mt-2 w-full px-2 py-1.5 text-xs">
        ＋ Añadir {meta.word}
      </button>
    </section>
  );
}
