'use client';

import { useMemo, useState } from 'react';

import { LEDGERS, TIERS, amountOf, euros, ledgerTotal, monthlyExpense } from '@/lib/finance';
import type { FinanceBook, FinanceItem, LedgerId } from '@/types';

/* =========================================================================
 *  Poner las cuentas al día en tres minutos.
 *
 *  Es la pantalla que decide si esta sección se usa o se abandona. Mantener
 *  unas cuentas no falla por falta de ganas: falla porque al día 3 de cada
 *  mes hay que abrir seis libretas, buscar veinte campos entre nombres,
 *  emojis y notas, y teclear veinte cifras. Eso se hace una vez.
 *
 *  Así que aquí no hay nada más que cifras: una fila por concepto, el nombre
 *  a la izquierda, el número a la derecha y nada en medio. Se pasa de campo
 *  en campo con el tabulador o con el «siguiente» del teclado del móvil, y
 *  cada tecla ya queda guardada —no hay botón de guardar que se pueda
 *  olvidar—.
 *
 *  Tres atajos que se ganan el sitio:
 *   · **copiar la previsión al real**, que es lo que pasa en la mitad de los
 *     meses: se gastó lo que se había apartado;
 *   · **saltar lo que no cambia**, escondiendo los saldos y dejando sólo los
 *     gastos, que es a lo que se entra la mayoría de las veces;
 *   · y el total a la vista, que es lo que dice cuándo se ha acabado.
 * ========================================================================= */

interface QuickUpdateProps {
  book: FinanceBook;
  onChange: (ledger: LedgerId, item: FinanceItem) => void;
  onDone: () => void;
}

/** Qué se está poniendo al día. */
type Round = 'gastos' | 'saldos';

export function QuickUpdate({ book, onChange, onDone }: QuickUpdateProps) {
  const [round, setRound] = useState<Round>('gastos');

  const gastos = book.ledgers.gastos;
  const puestos = useMemo(() => gastos.filter((item) => item.alt !== undefined).length, [gastos]);

  /** Los saldos son las tres libretas de foto: cuentas, inversiones y deudas. */
  const saldos: LedgerId[] = ['cuentas', 'inversiones', 'cobros', 'pagos'];

  const copiarPrevision = () => {
    for (const item of gastos) {
      if (item.alt === undefined && item.amount > 0) onChange('gastos', { ...item, alt: item.amount });
    }
  };

  const limpiarReal = () => {
    for (const item of gastos) {
      if (item.alt !== undefined) onChange('gastos', { ...item, alt: undefined });
    }
  };

  return (
    <div className="space-y-3">
      <section className="card p-3">
        <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-sm font-bold t-1">⚡ Poner al día</h3>
          <span className="text-[11px] t-3">sólo cifras, se guarda solo</span>
          <button type="button" onClick={onDone} className="btn-ghost ml-auto px-2.5 py-1 text-xs">
            Listo
          </button>
        </header>

        <div className="mt-2 flex gap-1 rounded-full p-1 surf-2" role="tablist">
          {(
            [
              { id: 'gastos', label: `🧾 Lo gastado (${puestos}/${gastos.length})` },
              { id: 'saldos', label: '🏦 Los saldos' },
            ] as Array<{ id: Round; label: string }>
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={round === option.id}
              onClick={() => setRound(option.id)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition
                ${round === option.id ? 'bg-accent t-on-accent' : 't-2 hover-soft'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {round === 'gastos' ? (
        <section className="card p-3" aria-label="Lo que se ha gastado de verdad">
          <p className="text-[11px] leading-relaxed t-3">
            A la izquierda lo que apartaste; a la derecha lo que se fue de verdad. Lo que dejes en
            blanco sigue contando por la previsión.
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={copiarPrevision} className="btn-ghost px-2.5 py-1 text-[11px]">
              ⤵️ Se gastó lo previsto
            </button>
            {puestos > 0 && (
              <button type="button" onClick={limpiarReal} className="btn-ghost px-2.5 py-1 text-[11px]">
                ✕ Vaciar la columna real
              </button>
            )}
            <span className="ml-auto self-center text-xs font-bold tabular-nums t-1">
              {euros(monthlyExpense(book))}
            </span>
          </div>

          <ul className="mt-2 divide-y hairline">
            {gastos.map((item) => (
              <li key={item.id} className="flex items-center gap-2 py-1.5">
                <span aria-hidden className="w-5 shrink-0 text-center text-sm">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold t-1">
                    {item.label || 'Sin nombre'}
                  </span>
                  <span className="block text-[10px] t-3">
                    {item.tier ? `${TIERS[item.tier].icon} ${TIERS[item.tier].label}` : 'sin colocar'}
                    {item.amount > 0 && ` · previsto ${euros(item.amount)}`}
                  </span>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step={10}
                  value={item.alt ?? ''}
                  onChange={(event) =>
                    onChange('gastos', {
                      ...item,
                      alt: event.target.value === '' ? undefined : Number(event.target.value),
                    })
                  }
                  placeholder={item.amount > 0 ? `${item.amount}` : '0'}
                  aria-label={`Gastado en ${item.label || 'sin nombre'}`}
                  className="field w-24 shrink-0 py-1 text-right text-sm tabular-nums"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        saldos.map((ledger) => (
          <section key={ledger} className="card p-3" aria-label={LEDGERS[ledger].label}>
            <header className="flex items-baseline gap-2">
              <h4 className="text-xs font-bold t-1">
                {LEDGERS[ledger].icon} {LEDGERS[ledger].label}
              </h4>
              <span className="ml-auto text-xs font-bold tabular-nums t-1">
                {euros(ledgerTotal(book, ledger))}
              </span>
            </header>

            {book.ledgers[ledger].length === 0 ? (
              <p className="mt-1 text-[11px] t-3">
                Nada apuntado. Se añade desde las libretas.
              </p>
            ) : (
              <ul className="mt-1 divide-y hairline">
                {book.ledgers[ledger].map((item) => (
                  <li key={item.id} className="flex items-center gap-2 py-1.5">
                    <span aria-hidden className="w-5 shrink-0 text-center text-sm">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold t-1">
                      {item.label || 'Sin nombre'}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={100}
                      value={item.amount === 0 ? '' : item.amount}
                      onChange={(event) =>
                        onChange(ledger, { ...item, amount: Number(event.target.value) || 0 })
                      }
                      placeholder="0"
                      aria-label={`${LEDGERS[ledger].main} de ${item.label || 'sin nombre'}`}
                      className="field w-28 shrink-0 py-1 text-right text-sm tabular-nums"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      <button type="button" onClick={onDone} className="btn-primary w-full py-2.5">
        Ya está
      </button>
    </div>
  );
}

/** Lo que vale un apunte, para quien pinte esta lista desde fuera. */
export const quickAmount = amountOf;
