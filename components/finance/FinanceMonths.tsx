'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { useToast } from '@/components/ui/Toast';
import { colorOf, euros, monthlyExpense, monthlyIncome } from '@/lib/finance';
import {
  dropClosing,
  lineIncome,
  lineSpend,
  monthByCategory,
  monthLabel,
  monthShort,
  monthTotals,
  putClosing,
  putClosingLine,
  readWorkbook,
  sheetMatches,
  type CategoryRow,
  type SheetMonth,
} from '@/lib/financeMonths';
import type { FinanceBook, FinanceMonth, FinanceMonthLine } from '@/types';

/* =========================================================================
 *  Los meses cerrados.
 *
 *  La pestaña de cada mes de la hoja del año, dentro de la app: con qué saldo
 *  se empezó, qué entró, qué salió y con cuánto se acabó. Y, sobre todo, lo
 *  que la hoja no dice sola: concepto a concepto, cuánto se fue de verdad
 *  contra lo que se apartaba en el mes tipo.
 *
 *  Se trae la hoja entera de una vez —el .xlsx tal cual, sin exportar nada—
 *  y se elige qué meses entran. Se lee en el aparato: el archivo no sale de
 *  aquí, sólo las cifras que se guardan, como todo lo demás de la sección.
 * ========================================================================= */

interface FinanceMonthsProps {
  book: FinanceBook;
  onChange: (next: FinanceBook) => void;
}

export function FinanceMonths({ book, onChange }: FinanceMonthsProps) {
  const notify = useToast();
  const closings = useMemo(() => book.closings ?? [], [book.closings]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: string; months: SheetMonth[]; pick: Set<string> } | null>(
    null,
  );
  const [open, setOpen] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Si el mes elegido desaparece —se borra, llega otro libro—, el último.
  useEffect(() => {
    if (selected && closings.some((row) => row.month === selected)) return;
    setSelected(closings.length ? closings[closings.length - 1].month : null);
  }, [closings, selected]);

  const month = closings.find((row) => row.month === selected) ?? null;

  /* ------------------------------------------------------------ traer */

  const choose = async (file: File | undefined) => {
    if (!file) return;
    try {
      const months = readWorkbook(new Uint8Array(await file.arrayBuffer()), file.name);
      if (months.length === 0) {
        notify({ message: 'En esa hoja no hay ninguna pestaña con forma de mes.', icon: '🤷' });
        return;
      }
      const have = new Set(closings.map((row) => row.month));
      // Se proponen los meses que faltan y cuadran; los que ya están, no.
      const pick = new Set(
        months.filter((m) => !have.has(m.closing.month) && sheetMatches(m)).map((m) => m.closing.month),
      );
      setPending({ file: file.name, months, pick });
    } catch {
      notify({ message: 'No se ha podido leer el archivo. ¿Es un .xlsx?', icon: '⚠️', tone: 'danger' });
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  const bring = () => {
    if (!pending) return;
    const before = book;
    let next = book;
    const chosen = pending.months.filter((m) => pending.pick.has(m.closing.month));
    for (const sheet of chosen) next = putClosing(next, sheet.closing);
    onChange(next);
    setPending(null);
    if (chosen.length) setSelected(chosen[chosen.length - 1].closing.month);
    notify({
      message:
        chosen.length === 1
          ? `${capital(monthLabel(chosen[0].closing.month))}, dentro.`
          : `${chosen.length} meses dentro.`,
      icon: '🗓️',
      action: { label: 'Deshacer', onClick: () => onChange(before) },
    });
  };

  const setLine = (line: FinanceMonthLine) => {
    if (month) onChange(putClosingLine(book, month.month, line));
  };

  /** Lleva el saldo final del mes a la cuenta de las libretas. */
  const syncAccount = (accountId: string, closing: number) => {
    const before = book;
    const account = book.ledgers.cuentas.find((item) => item.id === accountId);
    if (!account) return;
    onChange({
      ...book,
      ledgers: {
        ...book.ledgers,
        cuentas: book.ledgers.cuentas.map((item) =>
          item.id === accountId ? { ...item, amount: closing } : item,
        ),
      },
    });
    notify({
      message: `«${account.label}» puesta a ${euros(closing, 2)}.`,
      icon: '🏦',
      action: { label: 'Deshacer', onClick: () => onChange(before) },
    });
  };

  /* ------------------------------------------------------------ pintura */

  const picker = (
    <input
      ref={input}
      type="file"
      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      className="sr-only"
      onChange={(event) => void choose(event.target.files?.[0])}
      aria-label="Elegir la hoja del año"
    />
  );

  if (pending) {
    return (
      <section className="card p-4" aria-label="Traer meses de la hoja">
        {picker}
        <h3 className="text-sm font-bold t-1">📥 ¿Qué meses entran?</h3>
        <p className="mt-1 text-[11px] leading-relaxed t-3">
          De «{pending.file}». Los que ya están guardados salen sin marcar: si los marcas, se
          cambian por lo que diga ahora la hoja.
        </p>
        <ul className="mt-3 space-y-1.5">
          {pending.months.map((sheet) => {
            const key = sheet.closing.month;
            const have = closings.some((row) => row.month === key);
            const ok = sheetMatches(sheet);
            const checked = pending.pick.has(key);
            return (
              <li key={sheet.sheet}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 hairline surf-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const pick = new Set(pending.pick);
                      if (checked) pick.delete(key);
                      else pick.add(key);
                      setPending({ ...pending, pick });
                    }}
                    className="h-5 w-5 shrink-0 accent-[color:var(--accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold t-1">
                      {capital(monthLabel(key))}
                      {have && <span className="ml-1.5 text-[11px] font-normal t-3">· ya está</span>}
                    </span>
                    <span className="block text-[11px] tabular-nums t-3">
                      {sheet.closing.lines.length} líneas · entra {euros(sheet.totals.income)} · sale{' '}
                      {euros(sheet.totals.expense)} · acaba {euros(sheet.totals.closing)}
                    </span>
                    {!ok && (
                      <span className="mt-0.5 block text-[11px] t-danger">
                        No cuadra con los totales de la hoja ({euros(sheet.sheetClosing ?? 0, 2)}):
                        puede que el mes esté a medias.
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={bring}
            disabled={pending.pick.size === 0}
            className="btn-primary flex-1 py-2 text-sm disabled:opacity-50"
          >
            Traer {pending.pick.size === 1 ? 'el mes' : `${pending.pick.size} meses`}
          </button>
          <button type="button" onClick={() => setPending(null)} className="btn-ghost px-4 py-2 text-sm">
            Cancelar
          </button>
        </div>
      </section>
    );
  }

  if (!month) {
    return (
      <section className="card p-6 text-center">
        {picker}
        <p className="text-3xl" aria-hidden>
          🗓️
        </p>
        <p className="mt-2 text-sm font-semibold t-1">Los meses, tal y como fueron</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed t-3">
          Trae la hoja del año —el .xlsx, con una pestaña por mes— y cada mes queda aquí con su
          saldo de partida, lo que entró, lo que salió y cómo fue contra lo que se apartaba. El
          archivo se lee en este aparato y no se manda a ninguna parte.
        </p>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="btn-primary mt-4 px-5 py-2.5 text-sm"
        >
          📥 Traer la hoja del año
        </button>
      </section>
    );
  }

  const totals = monthTotals(month);
  const rows = monthByCategory(month, book);
  const plannedOut = monthlyExpense(book);
  const plannedIn = monthlyIncome(book);
  const realIn = month.lines.reduce((sum, line) => sum + lineIncome(line), 0);
  const realOut = month.lines.reduce((sum, line) => sum + lineSpend(line), 0);
  const usual = realOut - totals.oneOff;
  const isLatest = month.month === closings[closings.length - 1].month;
  const categories = book.ledgers.gastos.map((item) => item.label).filter(Boolean);

  return (
    <div className="space-y-3">
      {picker}

      {/* Los meses guardados */}
      <div className="flex items-center gap-2">
        <div
          className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-1"
          role="tablist"
          aria-label="Mes"
        >
          {closings.map((row) => {
            const result = monthTotals(row).result;
            return (
              <button
                key={row.month}
                type="button"
                role="tab"
                aria-selected={row.month === month.month}
                onClick={() => setSelected(row.month)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition
                  ${row.month === month.month ? 'border-accent bg-accent t-on-accent' : 'hairline t-2 hover-soft'}`}
              >
                {monthShort(row.month)}
                <span
                  aria-hidden
                  className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ backgroundColor: result < 0 ? 'var(--danger)' : 'currentColor' }}
                />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
        >
          📥 Traer
        </button>
      </div>

      {/* El mes */}
      <section className="card p-4" aria-label={`Cuentas de ${monthLabel(month.month)}`}>
        <header className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-sm font-bold t-1">{capital(monthLabel(month.month))}</h3>
          {month.source && <span className="truncate text-[11px] t-3">de {month.source}</span>}
        </header>

        <div className="mt-3 flex items-center gap-2 tabular-nums">
          <div className="min-w-0 flex-1 rounded-xl border p-2 text-center hairline surf-2">
            <p className="text-[10px] t-3">empieza</p>
            <p className="text-base font-bold t-2">{euros(month.opening)}</p>
          </div>
          <span aria-hidden className="t-3">
            →
          </span>
          <div className="min-w-0 flex-1 rounded-xl border border-accent bg-accent-faint p-2 text-center">
            <p className="text-[10px] t-3">acaba</p>
            <p className="text-lg font-bold t-1">{euros(totals.closing)}</p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-center tabular-nums">
          <Figure label="entró" value={euros(totals.income)} />
          <Figure label="salió" value={euros(totals.expense)} />
          <Figure
            label={totals.result < 0 ? 'perdió la cuenta' : 'ganó la cuenta'}
            value={`${totals.result > 0 ? '+' : ''}${euros(totals.result)}`}
            danger={totals.result < 0}
          />
        </div>

        <p className="mt-3 text-xs leading-relaxed t-3">
          {plannedOut > 0 && (
            <>
              Se fueron <strong className="tabular-nums t-2">{euros(realOut)}</strong> contra{' '}
              <strong className="tabular-nums t-2">{euros(plannedOut)}</strong> del mes tipo
              {totals.oneOff > 0 && (
                <>
                  ; sin lo puntual (<span className="tabular-nums">{euros(totals.oneOff)}</span>),{' '}
                  <strong className={`tabular-nums ${usual > plannedOut ? 't-danger' : 't-2'}`}>
                    {euros(usual)}
                  </strong>
                </>
              )}
              .{' '}
            </>
          )}
          {plannedIn > 0 && (
            <>
              Entraron <strong className="tabular-nums t-2">{euros(realIn)}</strong> de los{' '}
              <strong className="tabular-nums t-2">{euros(plannedIn)}</strong> previstos.
            </>
          )}
        </p>

        {isLatest && book.ledgers.cuentas.length > 0 && (
          <AccountSync book={book} closing={totals.closing} onSync={syncAccount} />
        )}
      </section>

      {/* Concepto a concepto */}
      <section className="card p-4" aria-label="Concepto a concepto">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide t-3">
          Contra lo apartado
        </p>
        <p className="mb-3 text-[11px] leading-relaxed t-3">
          La barra es lo que se fue; la raya, lo que se apartaba. Toca un concepto para ver sus
          líneas, cambiarlas de sitio o marcar lo puntual.
        </p>
        <ul className="space-y-1">
          {rows.map((row) => (
            <CategoryLine
              key={row.category || '—'}
              row={row}
              open={open === (row.category || '—')}
              onToggle={() => setOpen(open === (row.category || '—') ? null : row.category || '—')}
              categories={categories}
              onLine={setLine}
            />
          ))}
        </ul>
      </section>

      {/* La serie, cuando hay más de uno */}
      {closings.length > 1 && <MonthSeries closings={closings} selected={month.month} onPick={setSelected} />}

      <div className="flex justify-end">
        <ConfirmButton
          question={`¿Quitar ${monthLabel(month.month)}?`}
          onConfirm={() => {
            const before = book;
            onChange(dropClosing(book, month.month));
            notify({
              message: `${capital(monthLabel(month.month))}, fuera.`,
              icon: '🗑️',
              tone: 'danger',
              action: { label: 'Deshacer', onClick: () => onChange(before) },
            });
          }}
        >
          🗑️ Quitar este mes
        </ConfirmButton>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- piezas */

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Figure({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border p-2 hairline surf-2">
      <p className={`text-sm font-bold ${danger ? 't-danger' : 't-1'}`}>{value}</p>
      <p className="text-[10px] leading-tight t-3">{label}</p>
    </div>
  );
}

function AccountSync({
  book,
  closing,
  onSync,
}: {
  book: FinanceBook;
  closing: number;
  onSync: (accountId: string, closing: number) => void;
}) {
  const accounts = book.ledgers.cuentas;
  const [target, setTarget] = useState(accounts[0]?.id ?? '');
  const account = accounts.find((item) => item.id === target) ?? accounts[0];
  if (!account || Math.abs(account.amount - closing) < 0.01) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 hairline">
      <span className="min-w-0 flex-1 text-[11px] leading-relaxed t-3">
        En las libretas, «{account.label}» tiene {euros(account.amount)}. ¿Ponerle el saldo con el
        que acabó el mes?
      </span>
      {accounts.length > 1 && (
        <select
          value={account.id}
          onChange={(event) => setTarget(event.target.value)}
          className="field py-1 text-xs"
          aria-label="Cuenta"
        >
          {accounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label || 'Sin nombre'}
            </option>
          ))}
        </select>
      )}
      <button type="button" onClick={() => onSync(account.id, closing)} className="btn-ghost px-3 py-1.5 text-xs">
        🏦 Poner {euros(closing)}
      </button>
    </div>
  );
}

function CategoryLine({
  row,
  open,
  onToggle,
  categories,
  onLine,
}: {
  row: CategoryRow;
  open: boolean;
  onToggle: () => void;
  categories: string[];
  onLine: (line: FinanceMonthLine) => void;
}) {
  const spent = row.real + row.oneOff;
  const over = row.planned > 0 && row.real > row.planned;
  const scale = Math.max(spent, row.planned, 1);
  const label = row.category || 'Sin casilla';
  const color = row.category ? colorOf(row.category) : 'var(--text-3)';

  return (
    <li className={`rounded-xl ${open ? 'surf-2' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover-soft"
      >
        <span aria-hidden className="w-5 shrink-0 text-center text-sm">
          {row.item?.icon ?? '❔'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`truncate text-xs font-semibold ${row.category ? 't-1' : 't-3 italic'}`}>
              {label}
            </span>
            <span className={`ml-auto shrink-0 text-xs font-bold tabular-nums ${over ? 't-danger' : 't-1'}`}>
              {euros(spent)}
            </span>
            {row.planned > 0 && (
              <span className="shrink-0 text-[10px] tabular-nums t-3">/ {euros(row.planned)}</span>
            )}
          </span>
          <span className="relative mt-1 block h-1.5 w-full overflow-hidden rounded-full track">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${(row.real / scale) * 100}%`, backgroundColor: over ? 'var(--danger)' : color }}
            />
            {row.oneOff > 0 && (
              <span
                className="absolute inset-y-0 rounded-full opacity-40"
                style={{
                  left: `${(row.real / scale) * 100}%`,
                  width: `${(row.oneOff / scale) * 100}%`,
                  backgroundColor: color,
                }}
              />
            )}
            {row.planned > 0 && (
              <span
                aria-hidden
                className="absolute inset-y-[-2px] w-0.5"
                style={{ left: `calc(${(row.planned / scale) * 100}% - 1px)`, backgroundColor: 'var(--text)' }}
              />
            )}
          </span>
        </span>
      </button>

      {open && (
        <ul className="space-y-1 px-2 pb-2">
          {row.lines.length === 0 && <li className="px-1 py-1 text-[11px] t-3">Nada este mes.</li>}
          {row.lines.map((line) => (
            <li key={line.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border p-1.5 hairline surf-1">
              <span className="min-w-0 flex-1 truncate text-xs t-2">{line.label}</span>
              <span className="text-xs font-semibold tabular-nums t-1">{euros(lineSpend(line), 2)}</span>
              <select
                value={line.category ?? ''}
                onChange={(event) => onLine({ ...line, category: event.target.value || undefined })}
                className="field max-w-[9.5rem] py-0.5 text-[11px]"
                aria-label={`Concepto de «${line.label}»`}
              >
                <option value="">Sin casilla</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onLine({ ...line, oneOff: line.oneOff ? undefined : true })}
                aria-pressed={Boolean(line.oneOff)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold
                  ${line.oneOff ? 'border-accent bg-accent-soft t-1' : 'hairline t-3'}`}
                title="Un gasto que no se repite: cuenta en el saldo, no en el mes normal"
              >
                {line.oneOff ? '✓ puntual' : 'puntual'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Las barras de cada mes: cuánto ganó o perdió la cuenta. */
function MonthSeries({
  closings,
  selected,
  onPick,
}: {
  closings: FinanceMonth[];
  selected: string;
  onPick: (month: string) => void;
}) {
  const results = closings.map((row) => monthTotals(row));
  const max = Math.max(1, ...results.map((row) => Math.abs(row.result)));

  return (
    <section className="card p-4" aria-label="Mes a mes">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide t-3">Mes a mes</p>
      <div className="flex h-28 items-stretch gap-1.5">
        {closings.map((row, index) => {
          const result = results[index].result;
          const height = (Math.abs(result) / max) * 50;
          return (
            <button
              key={row.month}
              type="button"
              onClick={() => onPick(row.month)}
              className={`relative min-w-0 flex-1 rounded-md ${row.month === selected ? 'surf-2' : 'hover-soft'}`}
              aria-label={`${monthLabel(row.month)}: ${result >= 0 ? 'ganó' : 'perdió'} ${euros(Math.abs(result))}`}
              title={`${monthLabel(row.month)}: ${euros(result)}`}
            >
              {/* Las barras en su carril, y la etiqueta debajo: una pérdida
                  grande no debe taparle el nombre al mes. */}
              <span aria-hidden className="absolute inset-x-0 top-1 bottom-5">
                <span className="absolute inset-x-1 top-1/2 h-px track" />
                <span
                  className="absolute inset-x-1.5 rounded-sm"
                  style={{
                    height: `${height}%`,
                    ...(result >= 0 ? { bottom: '50%' } : { top: '50%' }),
                    backgroundColor: result >= 0 ? 'var(--accent)' : 'var(--danger)',
                  }}
                />
              </span>
              <span className="absolute inset-x-0 bottom-1 truncate text-center text-[11px] capitalize t-3">
                {monthShort(row.month).split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
