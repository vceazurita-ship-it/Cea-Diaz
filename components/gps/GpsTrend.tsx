'use client';

import { useMemo, useState } from 'react';

import { GPS_FIELDS, KIND_META, formatValue, valueOf, type GpsFieldId } from '@/lib/gps';
import { formatShort } from '@/lib/dates';
import type { GpsSession } from '@/types';

/* =========================================================================
 *  La evolución de una cifra, sesión a sesión.
 *
 *  Es lo que la aplicación del rastreador no enseña: allí cada sesión vive
 *  sola en su pantalla, así que saber si el crío corre más que en septiembre
 *  exige ir abriendo entrenos y acordarse de memoria. Aquí se ven las últimas
 *  doce de un vistazo, con la media marcada, y se cambia de cifra con un
 *  toque: distancia, esprines, punta de velocidad, balones tocados.
 *
 *  Sin biblioteca de gráficas: son barras de CSS. Una dependencia entera para
 *  pintar doce rectángulos sería justo lo contrario de lo que hace esta app.
 * ========================================================================= */

/** Cuántas sesiones caben sin que las barras se conviertan en rayas. */
const SHOWN = 12;

/**
 * El color de una barra: el acento del perfil, más apagado en los entrenos
 * que en los partidos.
 *
 * Va en un estilo y no en una clase porque `bg-accent` es una clase de la
 * casa —pinta `var(--accent)`, que cambia con el perfil— y no un color de
 * Tailwind: `bg-accent/55` no genera nada, así que las barras de entreno se
 * pintaban transparentes y la gráfica enseñaba sólo los partidos.
 */
/** La cifra encima de la barra: un decimal como mucho, que ahí no cabe más. */
function short(value: number, decimals: number): string {
  return value.toLocaleString('es-ES', { maximumFractionDigits: decimals > 0 ? 1 : 0 });
}

function barColor(kind: GpsSession['kind']): string {
  return kind === 'partido'
    ? 'var(--accent)'
    : 'color-mix(in srgb, var(--accent) 55%, transparent)';
}

interface GpsTrendProps {
  /** Sesiones de la más reciente a la más antigua. */
  sessions: GpsSession[];
  kid: boolean;
}

export function GpsTrend({ sessions, kid }: GpsTrendProps) {
  /** Sólo se ofrecen las cifras que alguna sesión trae de verdad. */
  const available = useMemo(
    () => GPS_FIELDS.filter((field) => sessions.some((s) => valueOf(s, field.id) !== undefined)),
    [sessions],
  );

  const [field, setField] = useState<GpsFieldId | null>(null);

  /**
   * La que se enseña sin tocar nada: la distancia, que es la cifra que
   * resume una sesión. El tiempo es la primera de la lista porque es la
   * primera que se lee en una ficha, pero como gráfica no dice nada: que un
   * entreno durase noventa minutos no es una marca, es el horario del club.
   */
  const chosen =
    available.find((item) => item.id === field) ??
    available.find((item) => item.id === 'distance') ??
    available.find((item) => item.record !== false) ??
    available[0];

  const rows = useMemo(() => {
    if (!chosen) return [];
    return [...sessions]
      .filter((session) => valueOf(session, chosen.id) !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-SHOWN)
      .map((session) => ({ session, value: valueOf(session, chosen.id)! }));
  }, [sessions, chosen]);

  if (!chosen || rows.length < 2) return null;

  const top = Math.max(...rows.map((row) => row.value));
  const average = rows.reduce((sum, row) => sum + row.value, 0) / rows.length;
  const best = rows.reduce((high, row) => (row.value > high.value ? row : high));

  return (
    <section className={`${kid ? 'card-kid' : 'card'} p-4`}>
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold t-1">📈 Cómo va la cosa</h3>
        <span className="text-[11px] t-3">
          las últimas {rows.length} · media {formatValue(chosen.id, average)}
        </span>
      </header>

      {/* Qué cifra se mira. Sólo salen las que hay. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {available.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setField(item.id)}
            aria-pressed={item.id === chosen.id}
            className={`btn min-h-[2rem] border px-2.5 py-1 text-[11px] font-semibold
              ${
                item.id === chosen.id
                  ? 'bg-accent-soft border-accent t-1'
                  : 'hairline surf-1 t-2 hover-soft'
              }`}
          >
            {item.icon} {item.short}
          </button>
        ))}
      </div>

      <div className="relative flex h-40 items-end gap-1.5">
        {/* La media, para que cada barra se lea contra algo y no contra nada. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-dashed hairline-strong"
          style={{ bottom: `${Math.round((average / top) * 100)}%` }}
        />

        {rows.map((row) => {
          const height = Math.max(6, Math.round((row.value / top) * 100));
          const record = row.value === best.value;

          return (
            <div
              key={row.session.id}
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
              title={`${formatShort(row.session.date)} · ${KIND_META[row.session.kind].label} · ${formatValue(chosen.id, row.value)}`}
            >
              {/* La cifra va siempre puesta, como en la tira de la semana: en
                  un móvil no existe posar el ratón encima, y sin el número
                  cuatro sesiones parecidas se leen como un bloque macizo. */}
              <span className="h-3 truncate text-[9px] font-semibold tabular-nums t-3">
                {record ? '🏅 ' : ''}
                {short(row.value, chosen.decimals)}
              </span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md transition-all duration-500"
                  style={{ height: `${height}%`, backgroundColor: barColor(row.session.kind) }}
                />
              </div>
              <span className="w-full truncate text-center text-[9px] tabular-nums t-3">
                {row.session.date.slice(8)}/{row.session.date.slice(5, 7)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed t-3">
        <span
          className="inline-block h-2 w-2 rounded-sm align-middle"
          style={{ backgroundColor: barColor('partido') }}
        />{' '}
        partido ·{' '}
        <span
          className="inline-block h-2 w-2 rounded-sm align-middle"
          style={{ backgroundColor: barColor('entreno') }}
        />{' '}
        entreno · la línea de puntos es la media de estas {rows.length}.
      </p>
    </section>
  );
}
