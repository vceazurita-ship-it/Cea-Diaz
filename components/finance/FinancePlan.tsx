'use client';

import { useMemo, useState } from 'react';

import { euros, payMonths, runwayLabel, yearsLabel, yearsToFi } from '@/lib/finance';
import { financeExpertsOf } from '@/lib/financeExperts';
import {
  NO_TWEAK,
  type PlanTweak,
  financePlan,
  planHeadline,
  planNumbers,
  tweakIsOn,
  withTweak,
} from '@/lib/financePlan';
import type { FinanceBook, PlanAction } from '@/types';

/* =========================================================================
 *  El plan: qué hacer con estas cuentas.
 *
 *  Tres cosas, en el orden en que se necesitan:
 *
 *   1. **el veredicto**, en una frase, porque quien abre esto quiere saber
 *      si va bien antes que seguir un razonamiento;
 *   2. **las tres palancas**, para poder preguntar «¿y si ingreso trescientos
 *      más?» sin tocar las libretas de verdad. Es lo que convierte una
 *      pantalla de lectura en una de decisión: se mueve el número y el
 *      veredicto de arriba cambia con él;
 *   3. **las acciones**, cada una con su cifra, su porqué y lo que cambia si
 *      se hace.
 *
 *  La simulación no toca nada guardado. Se ve que está puesta —el aviso de
 *  arriba no es discreto a propósito— y se quita de un toque, porque una
 *  cifra falsa que se cuela por real es peor que no tener simulador.
 * ========================================================================= */

const URGENCY: Record<PlanAction['urgency'], { label: string; card: string; chip: string }> = {
  sangra: {
    label: 'Sangra',
    card: 'border-[color:var(--danger)]',
    chip: 'bg-[color:var(--danger)] text-white',
  },
  fragil: { label: 'Deja sin margen', card: 'border-accent', chip: 'bg-accent-soft t-1' },
  ordenar: { label: 'Ordenar', card: 'hairline', chip: 'surf-2 t-2' },
  mirar: { label: 'Para saberlo', card: 'hairline', chip: 'surf-2 t-2' },
};

interface FinancePlanProps {
  book: FinanceBook;
}

export function FinancePlan({ book }: FinancePlanProps) {
  const [tweak, setTweak] = useState<PlanTweak>(NO_TWEAK);
  const [open, setOpen] = useState<string | null>(null);

  const simulated = useMemo(() => withTweak(book, tweak), [book, tweak]);

  const real = useMemo(() => planNumbers(book), [book]);
  const now = useMemo(() => planNumbers(simulated), [simulated]);
  const headline = useMemo(() => planHeadline(simulated), [simulated]);
  const actions = useMemo(() => financePlan(simulated), [simulated]);

  const on = tweakIsOn(tweak);
  const move = (patch: Partial<PlanTweak>) => setTweak((current) => ({ ...current, ...patch }));

  if (real.monthIn <= 0 && real.monthOut <= 0) {
    return (
      <section className="card p-6 text-center">
        <p className="text-3xl" aria-hidden>
          🧭
        </p>
        <p className="mt-2 text-sm t-2">Todavía no hay nada que planear.</p>
        <p className="mt-1 text-xs leading-relaxed t-3">
          Rellena los ingresos y los gastos del mes en las libretas: con esas dos columnas ya se
          puede decir qué hacer y en qué orden.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1 · El veredicto */}
      <section
        className={`card border p-4 ${on ? 'border-accent' : 'hairline'}`}
        aria-label="Cómo están las cuentas"
      >
        {on && (
          <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold t-2">
            <span className="chip-soft">🎚️ Simulación puesta</span>
            <span className="t-3">Nada de esto se ha guardado.</span>
            <button
              type="button"
              onClick={() => setTweak(NO_TWEAK)}
              className="btn-ghost ml-auto min-h-0 px-2 py-0.5 text-[11px]"
            >
              Volver a lo real
            </button>
          </p>
        )}

        <h3 className="text-sm font-bold leading-snug t-1">{headline.verdict}</h3>
        <p className="mt-1.5 text-xs leading-relaxed t-2">{headline.detail}</p>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure
            value={now.gap > 0 ? euros(now.gapMonth) : euros(-now.gap / 12)}
            foot={now.gap > 0 ? 'falta cada mes' : 'sobra cada mes'}
            bad={now.gap > 0}
            was={on && Math.round(real.gapMonth) !== Math.round(now.gapMonth) ? euros(real.gapMonth) : undefined}
          />
          <Figure
            value={now.rate === null ? '—' : percent(now.rate)}
            foot={`del patrimonio al año (tope ${percent(now.rateGoal)})`}
            bad={now.rate !== null && now.rate > now.rateGoal}
            was={on && real.rate !== null ? percent(real.rate) : undefined}
          />
          <Figure
            value={now.cushion === null ? '—' : `${Math.floor(now.cushion)} m`}
            foot={`de colchón (meta ${book.goals?.cushion ?? 12})`}
            bad={now.cushion !== null && now.cushion < (book.goals?.cushion ?? 12)}
            was={on && real.cushion !== null ? `${Math.floor(real.cushion)} m` : undefined}
          />
          <Figure
            value={`${Math.round(Math.min(1, now.progress) * 100)} %`}
            foot="del número que persigues"
            was={on ? `${Math.round(Math.min(1, real.progress) * 100)} %` : undefined}
          />
        </div>

        <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed hairline t-3">
          Aquí se juzga <strong className="t-2">el año</strong>, no el mes: entran{' '}
          <strong className="tabular-nums t-2">{euros(now.yearIn)}</strong> y salen{' '}
          <strong className="tabular-nums t-2">{euros(now.yearOut)}</strong>. Un mes con nómina deja{' '}
          <strong className="tabular-nums t-2">{euros(now.monthSaving)}</strong>, pero eso no cuenta
          los meses en los que no se cobra, que es donde se abre el hueco.
        </p>
      </section>

      {/* 2 · Las palancas */}
      <section className="card p-4" aria-label="Simulador">
        <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-sm font-bold t-1">🎚️ ¿Y si…?</h3>
          <span className="text-[11px] t-3">las tres cosas que se pueden mover</span>
          {on && (
            <button
              type="button"
              onClick={() => setTweak(NO_TWEAK)}
              className="btn-ghost ml-auto px-2.5 py-1 text-[11px]"
            >
              ✕ Quitar
            </button>
          )}
        </header>

        <div className="mt-3 space-y-3">
          <Lever
            label="Ingreso más al mes"
            hint={`en los ${payMonths(book)} meses que cobras`}
            value={tweak.income}
            step={100}
            max={3000}
            onChange={(income) => move({ income })}
          />
          <Lever
            label="Gasto menos al mes"
            hint="todos los meses del año"
            value={tweak.spend}
            step={100}
            max={Math.max(500, Math.round(now.monthOut))}
            onChange={(spend) => move({ spend })}
          />
          <Lever
            label="Paso de lo invertido a la cuenta"
            hint="de una vez; el patrimonio no cambia, la caja sí"
            value={tweak.toCash}
            step={5000}
            max={Math.max(10000, Math.round(real.invested))}
            onChange={(toCash) => move({ toCash })}
          />
        </div>

        <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed hairline t-3">
          {on ? (
            <>
              Con eso, el hueco del año pasa de{' '}
              <strong className="tabular-nums t-2">{euros(Math.max(0, real.gap))}</strong> a{' '}
              <strong className="tabular-nums t-2">{euros(Math.max(0, now.gap))}</strong>, la caja
              aguantaría{' '}
              <strong className="t-2">
                {now.cashMonths === null ? 'sin límite' : runwayLabel(now.cashMonths)}
              </strong>{' '}
              tapándolo, y hasta el número {faltan(simulated)}.
            </>
          ) : (
            <>
              Mueve cualquiera de las tres y todo lo de arriba y lo de abajo se recalcula. No se
              guarda nada: es para preguntarle a las cuentas, no para cambiarlas. Para cambiarlas de
              verdad están las libretas.
            </>
          )}
        </p>
      </section>

      {/* 3 · Qué hacer */}
      {actions.map((action) => {
        const tone = URGENCY[action.urgency];
        const experts = financeExpertsOf(action);
        const shown = open === action.id;

        return (
          <article key={action.id} className={`card border p-3 ${tone.card}`}>
            <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span aria-hidden className="text-base">
                {action.icon}
              </span>
              <h3 className="min-w-0 flex-1 text-sm font-bold leading-snug t-1">{action.title}</h3>
              {action.metric && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${tone.chip}`}
                >
                  {action.metric}
                </span>
              )}
            </header>

            <p className="mt-1.5 text-xs leading-relaxed t-2">{action.why}</p>

            {action.steps.length > 0 && (
              <ul className="mt-2 space-y-1 border-t pt-2 hairline">
                {action.steps.map((step, index) => (
                  <li key={index} className="flex gap-2 text-[11px] leading-relaxed t-2">
                    <span aria-hidden className="t-3">
                      ·
                    </span>
                    <span className="min-w-0 flex-1">{step}</span>
                  </li>
                ))}
              </ul>
            )}

            {action.effect && (
              <p className="mt-2 rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed surf-2 t-2">
                <strong className="t-1">Si se hace:</strong> {action.effect}
              </p>
            )}

            {experts.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setOpen(shown ? null : action.id)}
                  aria-expanded={shown}
                  className="btn-ghost mt-2 min-h-0 px-2 py-1 text-[11px]"
                >
                  {shown ? '▾ ' : '▸ '}
                  {experts.length === 1 ? 'Quién lo dice' : `Quién lo dice (${experts.length})`}
                </button>

                {shown && (
                  <ul className="mt-1.5 space-y-1.5 border-t pt-2 hairline">
                    {experts.map((expert) => (
                      <li key={expert.id} className="text-[11px] leading-relaxed t-3">
                        <span className="font-semibold t-2">{expert.name}</span>
                        <span
                          className={`ml-1.5 rounded-full px-1.5 text-[10px] font-semibold
                            ${expert.level === 'consenso' ? 'bg-accent-soft t-1' : 'surf-2 t-3'}`}
                        >
                          {expert.level === 'consenso' ? 'consenso' : 'su tesis'}
                        </span>
                        <span className="mt-0.5 block">{expert.role}</span>
                        {expert.caveat && (
                          <span className="mt-0.5 block italic">⚠ {expert.caveat}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </article>
        );
      })}

      <p className="px-1 pt-1 text-[11px] leading-relaxed t-3">
        Esto no es asesoramiento financiero: es tu hoja de cálculo sacando conclusiones de sus
        propias celdas, con las reglas escritas y a la vista. Las decisiones, y el riesgo de cada
        una, siguen siendo tuyos.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Piezas
 * ------------------------------------------------------------------------- */

/**
 * El tanto por ciento con dos decimales, como en el plan: entre retirar el
 * 4 % y retirar el 4,03 % está la diferencia entre mantener el capital y
 * comérselo, y redondeando las dos a «4 %» la casilla no dice nada.
 */
function percent(value: number): string {
  return `${(Math.round(value * 10000) / 100).toString().replace('.', ',')} %`;
}

/** «faltan 12 años» o «no se llega», para la frase del simulador. */
function faltan(book: FinanceBook): string {
  const years = yearsToFi(book);
  if (years === 0) return 'ya no falta nada';
  return years === null ? 'no se llega ahorrando' : `faltan ${yearsLabel(years)}`;
}

function Figure({
  value,
  foot,
  bad,
  was,
}: {
  value: string;
  foot: string;
  bad?: boolean;
  was?: string;
}) {
  return (
    <div className="rounded-xl border p-2 text-center hairline surf-2">
      <p className={`text-base font-bold tabular-nums ${bad ? 't-danger' : 't-1'}`}>{value}</p>
      {was !== undefined && was !== value && (
        <p className="text-[10px] tabular-nums line-through t-3">{was}</p>
      )}
      <p className="mt-0.5 text-[10px] leading-tight t-3">{foot}</p>
    </div>
  );
}

/**
 * Una palanca: la barra para tantear y el número para afinar.
 *
 * Las dos, y no una: la barra sirve para ver la forma de la respuesta —qué
 * pasa si subo un poco— y el campo para poner la cifra que uno ya tiene en
 * la cabeza, que es lo que hace uno cuando de verdad está negociando algo.
 */
function Lever({
  label,
  hint,
  value,
  step,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  step: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xs font-semibold t-1">{label}</span>
        <span className="text-[10px] t-3">{hint}</span>
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={0}
          value={value === 0 ? '' : value}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
          placeholder="0"
          aria-label={label}
          className="field ml-auto w-24 py-1 text-right text-sm tabular-nums"
        />
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={Math.min(value, max)}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${label}, barra`}
        className="mt-1 w-full accent-[color:var(--accent)]"
      />
    </div>
  );
}
