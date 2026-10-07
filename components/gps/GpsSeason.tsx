'use client';

import { useMemo, useState } from 'react';

import { formatShort, todayKey } from '@/lib/dates';
import { fieldOf, formatValue, valueOf, type GpsFieldId } from '@/lib/gps';
import { PROGRESION, evolucionTemporada, mesesDeTemporada, type Comentario, type Periodo } from '@/lib/gpsSeason';
import type { GpsSession } from '@/types';

/* =========================================================================
 *  La temporada de un vistazo: de septiembre a junio, mes a mes.
 *
 *  Es la pregunta de fondo —¿va a más desde septiembre?— y por eso va arriba
 *  del todo. Los meses que faltan se ven vacíos: una temporada se recorre, y
 *  ver cuánto queda también cuenta.
 * ========================================================================= */

interface GpsSeasonProps {
  periodo: Periodo;
  /** Las de la temporada, de la más reciente a la más antigua. */
  sessions: GpsSession[];
  kid: boolean;
}

export function GpsSeason({ periodo, sessions, kid }: GpsSeasonProps) {
  const hoy = todayKey();
  const disponibles = useMemo(
    () => PROGRESION.filter((id) => sessions.some((s) => (valueOf(s, id) ?? 0) > 0)),
    [sessions],
  );
  const [elegida, setElegida] = useState<GpsFieldId>('topSpeed');
  const cifra = disponibles.includes(elegida) ? elegida : disponibles[0];

  const meses = useMemo(() => (cifra ? mesesDeTemporada(sessions, periodo, cifra, hoy) : []), [sessions, periodo, cifra, hoy]);
  const evolucion = useMemo(() => evolucionTemporada(sessions), [sessions]);

  const km = sessions.reduce((sum, s) => sum + (valueOf(s, 'distance') ?? 0), 0);
  const punta = sessions.reduce<GpsSession | null>((best, s) => ((valueOf(s, 'topSpeed') ?? 0) > (best ? valueOf(best, 'topSpeed') ?? 0 : 0) ? s : best), null);
  const mesActual = hoy.slice(0, 7);

  // La escala del gráfico: del valor más bajo al más alto de los meses, con
  // aire, para que las diferencias se vean sin exagerarlas.
  const valores = meses.map((m) => m.valor).filter((v): v is number => v !== undefined);
  const lo = valores.length ? Math.min(...valores) : 0;
  const hi = valores.length ? Math.max(...valores) : 1;
  const suelo = Math.max(0, lo - (hi - lo || hi * 0.2) * 0.6);
  const altura = (v: number) => 18 + ((v - suelo) / Math.max(hi - suelo, 1e-9)) * 82;

  return (
    <section className={`${kid ? 'card-kid' : 'card'} overflow-hidden p-0`}>
      <header className="bg-accent-faint px-4 pb-3 pt-4">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] t-accent">De septiembre a junio</p>
        <h3 className="text-lg font-black leading-tight t-1">🏆 {periodo.label}</h3>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Kpi label="Sesiones" value={String(sessions.length)} />
          <Kpi label="Kilómetros" value={km > 0 ? km.toLocaleString('es-ES', { maximumFractionDigits: 0 }) : '—'} />
          <Kpi
            label="Punta"
            value={punta ? formatValue('topSpeed', valueOf(punta, 'topSpeed')!) : '—'}
            hint={punta ? formatShort(punta.date) : undefined}
          />
        </div>
      </header>

      <div className="space-y-4 p-4">
        {/* Desde septiembre: las primeras sesiones frente a las últimas. */}
        <div>
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide t-3">Desde el inicio de la temporada</p>
          {evolucion.length === 0 ? (
            <p className="text-xs leading-snug t-3">Con ocho sesiones de la temporada se ve si va a más: sus primeras frente a las últimas.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {evolucion.map((e) => (
                <span
                  key={e.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${
                    !e.cuenta ? 'surf-2 t-2' : e.sube ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'
                  }`}
                  title={`${fieldOf(e.id).label}: de ${formatValue(e.id, e.antes)} a ${formatValue(e.id, e.ahora)}`}
                >
                  {fieldOf(e.id).icon} {fieldOf(e.id).short} {e.cuenta ? (e.sube ? '▲' : '▼') : '='} {e.cuenta ? e.texto : 'igual'}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* El mes a mes de la cifra elegida. */}
        {cifra && (
          <div>
            <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
              {disponibles.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setElegida(id)}
                  aria-pressed={id === cifra}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    id === cifra ? 'border-accent bg-accent t-on-accent' : 'hairline surf-1 t-2'
                  }`}
                >
                  {fieldOf(id).icon} {fieldOf(id).short}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border p-2.5 hairline surf-1">
              <div className="grid h-36 grid-cols-10 items-end gap-1" role="img" aria-label={`${fieldOf(cifra).label} mes a mes en la temporada`}>
                {meses.map((m) => {
                  const actual = m.key === mesActual;
                  return (
                    <div key={m.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-1">
                      <span className="h-3 w-full truncate text-center text-[9px] font-black tabular-nums leading-3 t-1">
                        {m.valor === undefined ? '' : corto(cifra, m.valor)}
                      </span>
                      <div className="flex w-full flex-1 items-end justify-center">
                        {m.valor !== undefined ? (
                          <div
                            className={`w-full max-w-[26px] rounded-t-md ${actual ? 'bg-accent' : ''}`}
                            style={{
                              height: `${altura(m.valor)}%`,
                              ...(actual ? {} : { backgroundColor: 'color-mix(in srgb, var(--accent) 45%, transparent)' }),
                            }}
                          />
                        ) : (
                          <div
                            className={`w-full max-w-[26px] rounded-t-md border border-dashed ${m.futuro ? 'hairline' : 'border-transparent'}`}
                            style={{ height: m.futuro ? '18%' : '4%' }}
                          />
                        )}
                      </div>
                      <span className={`text-[9px] font-bold uppercase ${actual ? 't-accent' : 't-3'}`}>{m.label}</span>
                      <span className="text-[8px] tabular-nums t-3">{m.sesiones || ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug t-3">
              {cifra === 'topSpeed' || cifra === 'shotPower'
                ? 'Cada barra: lo que alcanza en sus buenas sesiones del mes.'
                : 'Cada barra: su media por sesión en el mes.'}{' '}
              Debajo, las sesiones de cada mes; en punteado, los meses que faltan.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/** Lo que cabe encima de una barra estrecha. */
function corto(id: GpsFieldId, v: number): string {
  if (id === 'distance') return v.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  if (id === 'topSpeed') return v.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return Math.round(v).toLocaleString('es-ES');
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border px-2.5 py-2 hairline surf-1">
      <p className="truncate text-[9px] font-black uppercase tracking-wide t-3">{label}</p>
      <p className="truncate text-base font-black tabular-nums leading-tight t-1">{value}</p>
      {hint && <p className="truncate text-[9px] t-3">{hint}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * El comentario de una sesión
 * ------------------------------------------------------------------------- */

const TONO: Record<Comentario['tono'], string> = {
  record: 'border-amber-400/60 bg-amber-400/10',
  sube: 'border-emerald-500/50 bg-emerald-500/10',
  normal: 'hairline surf-1',
  baja: 'hairline surf-1',
  inicio: 'border-sky-500/40 bg-sky-500/10',
};

/** El titular y sus detalles, en una cajita del color de cómo fue. */
export function ComentarioSesion({ comentario, compacto = false }: { comentario: Comentario; compacto?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${TONO[comentario.tono]}`}>
      <p className={`font-bold leading-snug t-1 ${compacto ? 'text-[12px]' : 'text-[13px]'}`}>{comentario.titular}</p>
      {!compacto && comentario.detalles.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {comentario.detalles.map((d) => (
            <li key={d} className="text-[12px] leading-snug t-2">
              {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
