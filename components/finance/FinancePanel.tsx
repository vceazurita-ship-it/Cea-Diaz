'use client';

import { useEffect, useMemo, useState } from 'react';

import { FinanceAdvice } from '@/components/finance/FinanceAdvice';
import { FinanceStats } from '@/components/finance/FinanceStats';
import { LedgerCard } from '@/components/finance/LedgerCard';
import { QuickUpdate } from '@/components/finance/QuickUpdate';
import { useToast } from '@/components/ui/Toast';
import {
  LEDGERS,
  bookAsText,
  bookStarted,
  colorOf,
  drift,
  dropItem,
  euros,
  expenseShare,
  bookOf,
  emptyBook,
  emptyItem,
  monthlyExpense,
  monthlyIncome,
  monthlySaving,
  netWorth,
  liquidWorth,
  periodExpense,
  periodIncome,
  periodSaving,
  putItem,
  runwayLabel,
  runwayMonths,
  saveBook,
  seasonOf,
  starterBook,
  subscribeBooks,
  ledgerTotal,
} from '@/lib/finance';
import { financeAlerts, financeNotes } from '@/lib/financeExperts';
import type { FinanceBook, FinanceItem, LedgerId, Profile } from '@/types';

/* =========================================================================
 *  Economía.
 *
 *  La hoja de cálculo de los cursos, puesta donde se puede mirar: en el
 *  móvil, sin abrir treinta y tres pestañas y sin sumar nada a mano.
 *
 *  Está montada al revés que la hoja a propósito. La hoja empieza por las
 *  filas y acaba, en una celda perdida, en la única cifra que de verdad se
 *  consulta: cuánto tiempo se aguanta con lo que hay. Aquí eso va arriba, en
 *  grande, y las filas debajo para quien quiera bajar al detalle.
 *
 *  Lo que se apunta viaja con la cuenta de casa, como el resto: se apunta un
 *  gasto en el móvil y está en el portátil. Detrás de la clave de la sección,
 *  y con las mismas políticas que todo lo demás —sin sesión no se lee nada—.
 *  Y sigue habiendo un botón para copiarlas enteras en texto, que es la
 *  salida de emergencia de cualquier cosa que se guarde en un sitio solo.
 * ========================================================================= */

interface FinancePanelProps {
  profile: Profile;
}

/**
 * Las cuatro maneras de mirar las mismas cuentas, en el orden en que se
 * usan: se entra a ver cómo va, se lee lo que la app tiene que decir, se
 * baja al detalle y sólo de vez en cuando se abre a editar.
 */
type View = 'resumen' | 'consejo' | 'estadisticas' | 'libretas';

export function FinancePanel({ profile }: FinancePanelProps) {
  const notify = useToast();
  const [book, setBook] = useState<FinanceBook>(emptyBook);
  const [view, setView] = useState<View>('resumen');
  /** El modo de teclear cifras deprisa, que es a lo que se entra cada mes. */
  const [quick, setQuick] = useState(false);

  useEffect(() => {
    setBook(bookOf(profile.id));
    return subscribeBooks(() => setBook(bookOf(profile.id)));
  }, [profile.id]);

  const started = bookStarted(book);

  const income = monthlyIncome(book);
  const spend = monthlyExpense(book);
  const saving = monthlySaving(book);
  const wealth = netWorth(book);
  const runway = runwayMonths(book);
  const shares = useMemo(() => expenseShare(book), [book]);
  const drifts = useMemo(() => drift(book), [book]);

  /** Lo que la app tiene que decir, y cuánto de ello es urgente. */
  const notes = useMemo(() => financeNotes(book), [book]);
  const alerts = useMemo(() => financeAlerts(book), [book]);
  const top = notes.find((note) => note.tone === 'grave' || note.tone === 'aviso');

  /* ------------------------------------------------------------ acciones */

  const commit = (next: FinanceBook) => setBook(saveBook(profile.id, next));

  const start = () => {
    commit(starterBook());
    setView('libretas');
    notify({
      message: 'Libretas puestas con los conceptos de siempre. Ahora, las cifras.',
      icon: '💶',
    });
  };

  const put = (ledger: LedgerId) => (item: FinanceItem) => commit(putItem(book, ledger, item));

  const drop = (ledger: LedgerId) => (item: FinanceItem) => {
    const before = book;
    commit(dropItem(book, ledger, item.id));
    notify({
      message: `«${item.label || 'Sin nombre'}» fuera de ${LEDGERS[ledger].label.toLowerCase()}.`,
      icon: '🗑️',
      tone: 'danger',
      action: {
        label: 'Deshacer',
        onClick: () => {
          setBook(saveBook(profile.id, before));
          notify({ message: 'Como estaba.', icon: '↩️' });
        },
      },
    });
  };

  const add = (ledger: LedgerId) => () => commit(putItem(book, ledger, emptyItem()));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookAsText(book));
      notify({ message: 'Cuentas copiadas. Pégalas donde quieras guardarlas.', icon: '📋' });
    } catch {
      notify({ message: 'Este navegador no deja copiar solo. Míralas y cópialas a mano.', icon: '🤷' });
    }
  };

  /* ------------------------------------------------------------- pintura */

  if (!started) {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="card p-6 text-center">
          <p className="text-4xl" aria-hidden>
            💶
          </p>
          <h2 className="mt-2 text-lg font-bold t-1">Las cuentas del curso</h2>
          <p className="mt-2 text-sm leading-relaxed t-3">
            Seis libretas: lo que entra y lo que sale cada mes, y luego la foto de lo que hay —las
            cuentas, lo invertido, lo que te deben y lo que debes—. Con eso, la app contesta sola
            lo que la hoja tenía escondido en una celda: <strong className="t-2">cuánto tiempo
            aguantas</strong> si mañana no entra nada.
          </p>
          <p className="mt-3 text-xs leading-relaxed t-3">
            Empieza con los conceptos de siempre —salario, agente, ESS, casa, colegio, Cobas…— ya
            puestos y a cero. Sólo hay que teclear las cifras.
          </p>
          <button type="button" onClick={start} className="btn-primary mt-5 w-full py-2.5">
            Empezar las libretas
          </button>
        </div>
      </div>
    );
  }

  if (quick) {
    return (
      <QuickUpdate
        book={book}
        onChange={(ledger, item) => commit(putItem(book, ledger, item))}
        onDone={() => setQuick(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Lo que se viene a mirar */}
      <section className="card p-4" aria-label="Cómo van las cuentas">
        <header className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-sm font-bold t-1">💶 Economía de {profile.name}</h2>
          <span className="text-xs t-3">
            curso {book.season || seasonOf()} · {book.months} {book.months === 1 ? 'mes' : 'meses'}
          </span>
        </header>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile
            value={runway === null ? '—' : runwayLabel(runway)}
            label="aguantas sin ingresar"
            strong
          />
          <Tile value={euros(wealth)} label="patrimonio" />
          <Tile
            value={euros(saving)}
            label="queda cada mes"
            tone={saving < 0 ? 'danger' : 'good'}
          />
          <Tile
            value={euros(periodSaving(book))}
            label="queda en el curso"
            tone={periodSaving(book) < 0 ? 'danger' : 'good'}
          />
        </div>

        <p className="mt-3 text-xs leading-relaxed t-3">
          Al mes entran <strong className="tabular-nums t-2">{euros(income)}</strong> y salen{' '}
          <strong className="tabular-nums t-2">{euros(spend)}</strong>. En el curso entero,{' '}
          <strong className="tabular-nums t-2">{euros(periodIncome(book))}</strong> contra{' '}
          <strong className="tabular-nums t-2">{euros(periodExpense(book))}</strong>
          {book.holidays > 0 && `, vacaciones incluidas (${euros(book.holidays)})`}.
          {runway !== null && (
            <>
              {' '}
              Con lo que hay hoy y sin ingresar nada, aguantas{' '}
              <strong className="t-2">{runwayLabel(runway)}</strong>; contando sólo el dinero en
              cuenta,{' '}
              <strong className="t-2">
                {spend > 0 ? runwayLabel(liquidWorth(book) / spend) : '—'}
              </strong>
              .
            </>
          )}
        </p>

        {/* Y lo primero que hay que oír, si hay algo que oír */}
        {top && (
          <button
            type="button"
            onClick={() => setView('consejo')}
            className={`mt-3 flex w-full items-start gap-2 rounded-xl border p-2.5 text-left
              ${top.tone === 'grave' ? 'border-[color:var(--danger)]' : 'border-accent'}`}
          >
            <span aria-hidden className="text-base">
              {top.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold leading-snug t-1">{top.title}</span>
              <span className="mt-0.5 block text-[11px] t-3">
                {alerts > 1 ? `Y ${alerts - 1} cosa${alerts - 1 === 1 ? '' : 's'} más que mirar. ` : ''}
                Toca para verlo entero.
              </span>
            </span>
          </button>
        )}

        {/* En qué se va el mes */}
        {shares.length > 1 && (
          <div className="mt-3 border-t pt-3 hairline">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide t-3">
              En qué se va el mes
            </p>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full track">
              {shares.map((row) => (
                <span
                  key={row.item.id}
                  title={`${row.item.label}: ${euros(row.amount)}`}
                  className="h-full"
                  style={{
                    width: `${row.share * 100}%`,
                    backgroundColor: colorOf(row.item.label),
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {shares.slice(0, 6).map((row) => (
                <span key={row.item.id} className="inline-flex items-center gap-1 text-[11px] t-3">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorOf(row.item.label) }}
                  />
                  {row.item.icon} {row.item.label || 'Sin nombre'}
                  <span className="tabular-nums opacity-70">{euros(row.amount)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Dónde se te va de lo previsto */}
        {drifts.length > 0 && (
          <div className="mt-3 border-t pt-3 hairline">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide t-3">
              Previsión contra real
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {drifts.slice(0, 6).map((row) => (
                <li
                  key={row.item.id}
                  className={`chip-soft ${row.diff > 0 ? 't-danger' : ''}`}
                  title={`Previsto ${euros(row.item.amount)}, real ${euros(row.item.alt ?? 0)}`}
                >
                  <span aria-hidden>{row.item.icon}</span>
                  {row.item.label || 'Sin nombre'}
                  <span className="tabular-nums font-semibold">
                    {row.diff > 0 ? '+' : ''}
                    {euros(row.diff)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed t-3">
              En rojo, lo que se está yendo por encima de lo apartado. Para sumar manda el real en
              cuanto lo escribes.
            </p>
          </div>
        )}
      </section>

      {/* Lo primero que se viene a hacer: teclear las cifras del mes */}
      <button
        type="button"
        onClick={() => setQuick(true)}
        className="btn-primary w-full py-2.5 text-sm"
      >
        ⚡ Poner las cuentas al día
      </button>

      {/* Cómo mirarlas */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex flex-wrap gap-1 rounded-full p-1 surf-2"
          role="tablist"
          aria-label="Cómo ver las cuentas"
        >
          {(
            [
              { id: 'resumen', label: '📊 Resumen' },
              { id: 'consejo', label: alerts > 0 ? `🧠 Consejo · ${alerts}` : '🧠 Consejo' },
              { id: 'estadisticas', label: '📈 Estadísticas' },
              { id: 'libretas', label: '✏️ Libretas' },
            ] as Array<{ id: View; label: string }>
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={view === option.id}
              onClick={() => setView(option.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition
                ${view === option.id ? 'bg-accent t-on-accent' : 't-2 hover-soft'}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button type="button" onClick={copy} className="btn-ghost ml-auto px-3 py-1.5 text-xs">
          📋 Copiar las cuentas
        </button>
      </div>

      {view === 'consejo' ? (
        <FinanceAdvice book={book} />
      ) : view === 'estadisticas' ? (
        <FinanceStats book={book} />
      ) : view === 'resumen' ? (
        <section className="card p-4" aria-label="Los totales de cada libreta">
          <ul className="divide-y hairline">
            {(Object.keys(LEDGERS) as LedgerId[]).map((ledger) => {
              const meta = LEDGERS[ledger];
              const total = ledgerTotal(book, ledger);
              const count = book.ledgers[ledger].length;

              return (
                <li key={ledger} className="flex items-center gap-3 py-2.5">
                  <span aria-hidden className="text-lg">
                    {meta.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold t-1">{meta.label}</span>
                    <span className="block text-[11px] t-3">
                      {count === 0
                        ? 'Sin nada apuntado'
                        : `${count} ${count === 1 ? 'apunte' : 'apuntes'} · ${
                            meta.rhythm === 'mes' ? 'al mes' : 'saldo de hoy'
                          }`}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-sm font-bold tabular-nums
                      ${meta.sign === -1 ? 't-2' : 't-1'}`}
                  >
                    {meta.sign === -1 && total > 0 ? '−' : ''}
                    {euros(Math.abs(total))}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center gap-3 border-t pt-3 hairline">
            <span className="min-w-0 flex-1 text-sm font-bold t-1">Patrimonio</span>
            <span className="text-base font-bold tabular-nums t-1">{euros(wealth)}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed t-3">
            Cuentas más inversiones más lo que te deben, menos lo que debes. Los ingresos y los
            gastos no entran: son el ritmo del mes, no lo que hay.
          </p>
        </section>
      ) : (
        <>
          {/* El marco del curso */}
          <section className="card p-3" aria-label="El curso">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">
                  Curso
                </span>
                <input
                  value={book.season}
                  onChange={(event) => commit({ ...book, season: event.target.value.slice(0, 12) })}
                  placeholder={seasonOf()}
                  className="field w-full"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">
                  Meses que dura
                </span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={book.months}
                  onChange={(event) =>
                    commit({
                      ...book,
                      months: Math.max(1, Math.min(24, Number(event.target.value) || 1)),
                    })
                  }
                  className="field w-full tabular-nums"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">
                  Vacaciones (€ del curso)
                </span>
                <input
                  type="number"
                  step={100}
                  value={book.holidays}
                  onChange={(event) =>
                    commit({ ...book, holidays: Number(event.target.value) || 0 })
                  }
                  className="field w-full tabular-nums"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed t-3">
              El curso va del 1 de agosto al 31 de julio. Las vacaciones van aparte porque son un
              pico del año entero, no un gasto de todos los meses.
            </p>
          </section>

          {(Object.keys(LEDGERS) as LedgerId[]).map((ledger) => (
            <LedgerCard
              key={ledger}
              ledger={ledger}
              items={book.ledgers[ledger]}
              total={ledgerTotal(book, ledger)}
              onChange={put(ledger)}
              onDelete={drop(ledger)}
              onAdd={add(ledger)}
            />
          ))}
        </>
      )}

      <p className="text-center text-[11px] leading-relaxed t-3">
        Se sincroniza con la cuenta de casa, como el resto de la app: lo que apuntes en el móvil
        aparece en el ordenador. Detrás de su clave, y sólo para quien entre con la cuenta.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Una cifra de las de arriba
 * ------------------------------------------------------------------------- */

function Tile({
  value,
  label,
  tone,
  strong,
}: {
  value: string;
  label: string;
  tone?: 'good' | 'danger';
  strong?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-2 text-center hairline
        ${strong ? 'bg-accent-faint border-accent' : 'surf-2'}`}
    >
      <p
        className={`font-bold tabular-nums ${strong ? 'text-base' : 'text-lg'}
          ${tone === 'danger' ? 't-danger' : 't-1'}`}
      >
        {value}
      </p>
      <p className="text-[10px] leading-tight t-3">{label}</p>
    </div>
  );
}
