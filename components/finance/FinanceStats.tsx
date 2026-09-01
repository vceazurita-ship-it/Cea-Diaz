'use client';

import { useMemo } from 'react';

import { ProgressRing } from '@/components/ui/ProgressRing';
import {
  CHOSEN_TIERS,
  TIERS,
  chosenShare,
  coastWorth,
  colorOf,
  cushionMonths,
  euros,
  expenseShare,
  fiNumber,
  fiProgress,
  ledgerTotal,
  monthlyExpense,
  monthlyIncome,
  monthlySaving,
  netWorth,
  runwayLabel,
  runwayMonths,
  savingsRate,
  tierShare,
  yearlyExpense,
  yearsLabel,
  yearsToFi,
} from '@/lib/finance';
import type { FinanceBook, SpendTier } from '@/types';

/* =========================================================================
 *  Las estadísticas de la economía.
 *
 *  Cuatro preguntas, en el orden en que se hacen de verdad:
 *
 *   1. **¿cuánto falta?** — el número que se persigue y qué parte está puesta;
 *   2. **¿en qué se va?** — por categoría, que es lo que se ve, y por
 *      prioridad, que es lo que se decide;
 *   3. **¿voy hacia arriba?** — la serie de los meses guardados, que es lo
 *      único que distingue un buen mes de una buena racha;
 *   4. **¿de qué está hecho lo que tengo?** — cuánto es dinero, cuánto está
 *      invertido y cuánto depende de que alguien pague.
 *
 *  Las gráficas van en SVG a mano y sin librería: son cuatro formas y así no
 *  entra una dependencia de trescientos kilobytes en una app que se abre en
 *  el móvil con mala cobertura.
 * ========================================================================= */

interface FinanceStatsProps {
  book: FinanceBook;
}

export function FinanceStats({ book }: FinanceStatsProps) {
  const income = monthlyIncome(book);
  const spend = monthlyExpense(book);
  const saving = monthlySaving(book);
  const rate = savingsRate(book);
  const worth = netWorth(book);
  const progress = fiProgress(book);
  const years = yearsToFi(book);
  const runway = runwayMonths(book);
  const cushion = cushionMonths(book);

  const byTier = useMemo(() => tierShare(book), [book]);
  const chosen = useMemo(() => chosenShare(book), [book]);
  const byItem = useMemo(() => expenseShare(book), [book]);
  const history = book.history ?? [];

  if (income <= 0 && spend <= 0) {
    return (
      <section className="card p-6 text-center">
        <p className="text-3xl" aria-hidden>
          📊
        </p>
        <p className="mt-2 text-sm t-2">Todavía no hay cifras que mirar.</p>
        <p className="mt-1 text-xs leading-relaxed t-3">
          Rellena los ingresos y los gastos del mes en las libretas y esto se llena solo.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1 · Cuánto falta */}
      <section className="card p-4" aria-label="Hacia la independencia">
        <h3 className="text-sm font-bold t-1">🎯 Hacia la independencia</h3>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <ProgressRing ratio={Math.min(1, progress)} size={96}>
            <span className="text-lg font-bold tabular-nums t-1">
              {Math.round(Math.min(1, progress) * 100)} %
            </span>
          </ProgressRing>

          <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed t-2">
              El número que persigues son{' '}
              <strong className="tabular-nums t-1">{euros(fiNumber(book))}</strong>: lo que gastas
              en un año (<span className="tabular-nums">{euros(yearlyExpense(book))}</span>)
              dividido por una retirada del {book.goals?.withdrawal ?? 4} %.
            </p>
            <p className="mt-1 text-xs leading-relaxed t-2">
              Tienes <strong className="tabular-nums t-1">{euros(worth)}</strong>
              {progress >= 1 ? (
                <> — ya está.</>
              ) : years !== null ? (
                <>
                  {' '}
                  y faltan <strong className="t-1">{yearsLabel(years)}</strong> al ritmo de ahora.
                </>
              ) : (
                <> y sin ahorro mensual no hay fecha.</>
              )}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cifra
            valor={rate === null ? '—' : `${Math.round(rate * 100)} %`}
            pie="de lo que entra, se queda"
            tono={rate !== null && rate < 0 ? 'malo' : undefined}
          />
          <Cifra valor={euros(saving)} pie="al mes" tono={saving < 0 ? 'malo' : undefined} />
          <Cifra
            valor={cushion === null ? '—' : `${Math.floor(cushion)} m`}
            pie={`colchón (meta: ${book.goals?.cushion ?? 12})`}
            tono={cushion !== null && cushion < (book.goals?.cushion ?? 12) ? 'malo' : undefined}
          />
          <Cifra
            valor={runway === null ? '—' : runwayLabel(runway)}
            pie="aguantas sin ingresar"
          />
        </div>

        {progress < 1 && worth > 0 && (
          <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed hairline t-3">
            Y si dejaras de aportar hoy, lo que ya tienes valdría{' '}
            <strong className="tabular-nums t-2">{euros(coastWorth(book, 10))}</strong> dentro de
            diez años y <strong className="tabular-nums t-2">{euros(coastWorth(book, 20))}</strong>{' '}
            dentro de veinte, suponiendo un {book.goals?.realReturn ?? 4} % real. Es la cuenta de
            «¿y si paro?», y suele ser la que tranquiliza.
          </p>
        )}
      </section>

      {/* 2 · La escala */}
      {byTier.length > 0 && (
        <section className="card p-4" aria-label="Tu escala de prioridades">
          <h3 className="text-sm font-bold t-1">⚖️ Tu escala, contrastada</h3>
          <p className="mt-1 text-[11px] leading-relaxed t-3">
            El orden es el que decidiste: primero los peques, luego María y los cuatro, después la
            calidad de vida. Aquí está lo que dice el dinero.
          </p>

          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full track">
            {byTier.map((row) => (
              <span
                key={row.tier}
                title={`${TIERS[row.tier].label}: ${euros(row.amount)}`}
                className="h-full"
                style={{ width: `${row.share * 100}%`, backgroundColor: TIERS[row.tier].color }}
              />
            ))}
          </div>

          <ul className="mt-3 space-y-1.5">
            {byTier.map((row) => (
              <li key={row.tier} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: TIERS[row.tier].color }}
                />
                <span className="min-w-0 flex-1 truncate text-xs t-2">
                  {TIERS[row.tier].icon} {TIERS[row.tier].label}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums t-3">
                  {Math.round(row.share * 100)} %
                </span>
                <span className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums t-1">
                  {euros(row.amount)}
                </span>
              </li>
            ))}
          </ul>

          {/* Y lo que de verdad se decide: sin el suelo, que no está en discusión */}
          {chosen.length > 1 && (
            <div className="mt-3 border-t pt-3 hairline">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide t-3">
                Sólo lo que eliges
              </p>
              <ul className="space-y-1.5">
                {CHOSEN_TIERS.map((tier) => {
                  const row = chosen.find((item) => item.tier === tier);
                  const share = row?.share ?? 0;
                  return (
                    <li key={tier} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 truncate text-[11px] t-2">
                        {TIERS[tier].icon} {shortLabel(tier)}
                      </span>
                      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full track">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${share * 100}%`, backgroundColor: TIERS[tier].color }}
                        />
                      </span>
                      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums t-3">
                        {row ? euros(row.amount) : '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* 3 · En qué se va, uno a uno */}
      {byItem.length > 0 && (
        <section className="card p-4" aria-label="En qué se va el mes">
          <h3 className="text-sm font-bold t-1">🧾 En qué se va el mes</h3>
          <ul className="mt-3 space-y-1.5">
            {byItem.slice(0, 12).map((row) => (
              <li key={row.item.id} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-xs t-2">
                  {row.item.icon} {row.item.label || 'Sin nombre'}
                </span>
                <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full track">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.max(2, row.share * 100)}%`,
                      backgroundColor: colorOf(row.item.label),
                    }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums t-1">
                  {euros(row.amount)}
                </span>
              </li>
            ))}
          </ul>
          {byItem.length > 12 && (
            <p className="mt-2 text-[11px] t-3">
              Y {byItem.length - 12} más pequeños, que suman{' '}
              {euros(byItem.slice(12).reduce((total, row) => total + row.amount, 0))}.
            </p>
          )}
        </section>
      )}

      {/* 4 · La serie */}
      <section className="card p-4" aria-label="Cómo va con los meses">
        <h3 className="text-sm font-bold t-1">📈 Mes a mes</h3>

        {history.length < 2 ? (
          <p className="mt-2 text-xs leading-relaxed t-3">
            Se guarda una foto de las cuentas cada mes, sin que tengas que hacer nada. Con la de
            este mes ya hay una; en cuanto haya dos, aquí sale la línea. Es lo único que distingue
            un buen mes de una buena racha.
          </p>
        ) : (
          <>
            <Serie history={history} />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] t-3">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="h-2 w-2 rounded-full bg-accent" /> Patrimonio
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: TIERS.hijos.color }}
                />
                Lo que queda cada mes
              </span>
            </div>
          </>
        )}
      </section>

      {/* 5 · De qué está hecho */}
      <section className="card p-4" aria-label="De qué está hecho tu patrimonio">
        <h3 className="text-sm font-bold t-1">🧱 De qué está hecho</h3>
        <ul className="mt-3 space-y-1.5">
          {(
            [
              ['🏦 En cuenta', ledgerTotal(book, 'cuentas'), 'hsl(200 62% 48%)'],
              ['📈 Invertido', ledgerTotal(book, 'inversiones'), 'hsl(150 58% 42%)'],
              ['🫱 Por cobrar', ledgerTotal(book, 'cobros'), 'hsl(40 82% 52%)'],
              ['🫲 Por pagar', -ledgerTotal(book, 'pagos'), 'hsl(0 62% 55%)'],
            ] as Array<[string, number, string]>
          ).map(([label, amount, color]) => {
            const total = Math.max(
              1,
              ledgerTotal(book, 'cuentas') +
                ledgerTotal(book, 'inversiones') +
                ledgerTotal(book, 'cobros'),
            );
            return (
              <li key={label} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs t-2">{label}</span>
                <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full track">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (Math.abs(amount) / total) * 100)}%`,
                      backgroundColor: color,
                    }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums t-1">
                  {euros(amount)}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 border-t pt-2 text-[11px] leading-relaxed hairline t-3">
          Lo invertido y lo que te deben cuentan como patrimonio, pero no pagan una factura mañana.
          Por eso el colchón se mide sólo con lo que hay en cuenta.
        </p>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Piezas
 * ------------------------------------------------------------------------- */

function Cifra({ valor, pie, tono }: { valor: string; pie: string; tono?: 'malo' }) {
  return (
    <div className="rounded-xl border p-2 text-center hairline surf-2">
      <p className={`text-base font-bold tabular-nums ${tono === 'malo' ? 't-danger' : 't-1'}`}>
        {valor}
      </p>
      <p className="text-[10px] leading-tight t-3">{pie}</p>
    </div>
  );
}

/** El nombre corto de una prioridad, para donde no cabe el largo. */
function shortLabel(tier: SpendTier): string {
  if (tier === 'hijos') return 'Los peques';
  if (tier === 'pareja') return 'Con María';
  if (tier === 'familia') return 'Los cuatro';
  if (tier === 'calidad') return 'Calidad';
  return TIERS[tier].label;
}

/**
 * La serie de los meses: el patrimonio como área y lo que queda cada mes como
 * línea. Dos escalas distintas a propósito —un patrimonio de cientos de miles
 * y un ahorro de cientos no caben en la misma— y por eso cada una lleva su
 * propio suelo y su propio techo.
 */
function Serie({ history }: { history: FinanceBook['history'] }) {
  const W = 320;
  const H = 96;
  const P = 4;

  const worths = history.map((row) => row.worth);
  const savings = history.map((row) => row.income - row.expense);

  const scale = (values: number[]) => {
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const span = max - min || 1;
    return (value: number) => H - P - ((value - min) / span) * (H - P * 2);
  };

  const x = (index: number) =>
    history.length === 1 ? W / 2 : P + (index / (history.length - 1)) * (W - P * 2);

  const yWorth = scale(worths);
  const ySaving = scale(savings);

  const line = (values: number[], y: (value: number) => number) =>
    values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(value)}`).join(' ');

  const area = `${line(worths, yWorth)} L ${x(history.length - 1)} ${H} L ${x(0)} ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-3 w-full"
      role="img"
      aria-label={`Patrimonio y ahorro mensual de los últimos ${history.length} meses`}
    >
      <path d={area} fill="var(--accent)" opacity="0.14" />
      <path d={line(worths, yWorth)} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path
        d={line(savings, ySaving)}
        fill="none"
        stroke={TIERS.hijos.color}
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      {history.map((row, index) => (
        <circle key={row.month} cx={x(index)} cy={yWorth(row.worth)} r="2" fill="var(--accent)" />
      ))}
    </svg>
  );
}
