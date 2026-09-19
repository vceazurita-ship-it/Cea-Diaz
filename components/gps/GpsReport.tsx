'use client';

import { useMemo } from 'react';
import { addDays, formatShort, todayKey } from '@/lib/dates';
import { fieldOf, formatValue, type GpsFieldId } from '@/lib/gps';
import {
  EXPERTS,
  SOURCES,
  TIER_LABEL,
  placeAgainstStudies,
  quantile,
  usable,
  type Placed,
} from '@/lib/gpsReferences';
import type { GpsSession, Profile } from '@/types';

/* =========================================================================
 *  El informe del GPS: cómo va el peque y dónde está frente a los estudios.
 *
 *  Se calcula en el aparato con sus sesiones —no hay ni una cifra suya en el
 *  código— y se rehace solo cada vez que entra una sesión nueva, llegue de
 *  Footbar, de la foto o pegada a mano. Cuatro vistas, de lo inmediato a lo
 *  de fondo: la última sesión frente a todo lo suyo, la última semana frente
 *  a una semana normal, sus promedios por puesto y mes, y dónde queda frente
 *  a niños de su edad de la población general, de club y de élite.
 * ========================================================================= */

/** Las cifras que se enseñan en el informe, por orden. */
const FIELDS: GpsFieldId[] = ['topSpeed', 'distance', 'intense', 'shotPower', 'shots', 'passes', 'ballTime', 'accels'];

const values = (sessions: GpsSession[], id: GpsFieldId) =>
  sessions.map((session) => session[id]).filter((v): v is number => typeof v === 'number' && v > 0);

const median = (list: number[]) => (list.length ? quantile(list, 0.5) : undefined);
const fmt = (id: GpsFieldId, v: number | undefined) => (v === undefined ? '—' : formatValue(id, v));

/** «Mejor que el X % de sus sesiones». */
function ownRank(sessions: GpsSession[], id: GpsFieldId, value: number): number {
  const list = values(sessions, id);
  if (list.length < 2) return 50;
  const below = list.filter((v) => v < value).length;
  const same = list.filter((v) => v === value).length;
  return Math.round(((below + (same - 1) / 2) / (list.length - 1)) * 100);
}

function Ruler({ placed }: { placed: Placed }) {
  const [lo, hi] = placed.range;
  const { comparison } = placed;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="text-[13px] font-bold t-1">
          <span className="mr-1.5 rounded border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide hairline t-3">
            {TIER_LABEL[comparison.tier]}
          </span>
          {comparison.title}
        </p>
        <p className="text-sm font-black tabular-nums t-accent">{lo === hi ? `P${lo}` : `P${lo}–${hi}`}</p>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug t-3">
        {comparison.detail} {placed.basis} sesiones.
        {comparison.caveat && <span className="font-bold t-2"> · {comparison.caveat}</span>}
      </p>
      <div
        className="relative mt-1.5 h-3 rounded-full surf-2"
        role="img"
        aria-label={`${comparison.title}: entre el percentil ${lo} y el ${hi}`}
      >
        {[25, 50, 75].map((x) => (
          <span key={x} className="absolute inset-y-0 w-px bg-current opacity-20" style={{ left: `${x}%` }} />
        ))}
        <span
          className="absolute inset-y-0 rounded-full bg-accent"
          style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 2)}%` }}
        />
        {placed.latest && (
          <span
            className="absolute -top-1 h-5 w-1.5 -translate-x-1/2 rounded-full border-2 border-[var(--surface,#fff)] bg-current t-1"
            style={{ left: `${(placed.latest[0] + placed.latest[1]) / 2}%` }}
            title="Última sesión"
          />
        )}
      </div>
    </div>
  );
}

export function GpsReport({ profile, sessions: raw, kid }: { profile: Profile; sessions: GpsSession[]; kid: boolean }) {
  const report = useMemo(() => {
    const sessions = usable(raw).sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt));
    if (sessions.length < 4) return null;

    const latest = sessions[sessions.length - 1];
    const speeds = values(sessions, 'topSpeed');
    const shots = values(sessions, 'shotPower');
    const record = sessions.reduce<GpsSession | null>(
      (best, s) => ((s.topSpeed ?? 0) > (best?.topSpeed ?? 0) ? s : best),
      null,
    );

    // La última semana frente a una semana normal (la mediana de las
    // semanas con alguna sesión, sin contar ésta).
    const today = todayKey();
    const weekStart = addDays(today, -6);
    const week = sessions.filter((s) => s.date >= weekStart);
    const before = sessions.filter((s) => s.date < weekStart);
    const byWeek = new Map<string, GpsSession[]>();
    for (const s of before) {
      const d = new Date(`${s.date}T12:00:00`);
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      byWeek.set(key, [...(byWeek.get(key) ?? []), s]);
    }
    const weeks = [...byWeek.values()];
    const weekSummary = (list: GpsSession[]) => ({
      count: list.length,
      km: list.reduce((a, s) => a + (s.distance ?? 0), 0),
      top: Math.max(0, ...values(list, 'topSpeed')),
      shots: list.reduce((a, s) => a + (s.shots ?? 0), 0),
    });
    const now = weekSummary(week);
    const usual = weeks.length
      ? {
          count: median(weeks.map((w) => w.length)) ?? 0,
          km: median(weeks.map((w) => weekSummary(w).km)) ?? 0,
          top: median(weeks.map((w) => weekSummary(w).top)) ?? 0,
          shots: median(weeks.map((w) => weekSummary(w).shots)) ?? 0,
        }
      : null;

    // Por puesto: portero en partido, partido de campo y entreno.
    const groups: { label: string; list: GpsSession[] }[] = [
      { label: 'Partido de portero', list: sessions.filter((s) => s.kind === 'partido' && s.goalkeeper) },
      { label: 'Partido de campo', list: sessions.filter((s) => s.kind === 'partido' && !s.goalkeeper) },
      { label: 'Entreno', list: sessions.filter((s) => s.kind === 'entreno') },
    ].filter((g) => g.list.length > 0);

    // Mes a mes.
    const months = new Map<string, GpsSession[]>();
    for (const s of sessions) months.set(s.date.slice(0, 7), [...(months.get(s.date.slice(0, 7)) ?? []), s]);

    return {
      sessions,
      latest,
      speeds,
      shots,
      record,
      week,
      now,
      usual,
      groups,
      months: [...months.entries()],
      goalkeeper: sessions.filter((s) => s.goalkeeper).length,
      placed: profile.age === undefined ? [] : placeAgainstStudies(sessions, profile.age, latest),
    };
  }, [raw, profile.age]);

  const card = `${kid ? 'card-kid' : 'card'} p-4`;

  if (!report) {
    return (
      <section className={card}>
        <h3 className="mb-1 text-sm font-bold t-1">📊 Informe</h3>
        <p className="text-sm t-3">Con cuatro sesiones sale el informe: promedios, la última semana y dónde queda frente a niños de su edad.</p>
      </section>
    );
  }

  const { latest, speeds, shots, record, now, usual, groups, months, placed } = report;
  const latestFields = FIELDS.filter((id) => (latest[id] ?? 0) > 0);

  return (
    <section className={`${card} space-y-5`}>
      <header>
        <h3 className="text-sm font-bold t-1">📊 Informe de {profile.name}</h3>
        <p className="text-[11px] t-3">
          {report.sessions.length} sesiones · {report.goalkeeper} de portero · se recalcula solo con cada sesión nueva
        </p>
      </header>

      {/* Lo principal, de un vistazo. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Punta habitual', speeds.length ? formatValue('topSpeed', quantile(speeds, 0.9)) : '—', 'la de sus mejores sesiones (P90)'],
          ['Punta típica', speeds.length ? formatValue('topSpeed', quantile(speeds, 0.5)) : '—', 'la mediana de todas'],
          ['Récord', record?.topSpeed ? formatValue('topSpeed', record.topSpeed) : '—', record ? formatShort(record.date) : ''],
          ['Tiro típico', shots.length ? formatValue('shotPower', quantile(shots, 0.5)) : '—', 'mediana del mejor tiro'],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl border p-3 hairline surf-1">
            <p className="text-[11px] font-bold uppercase tracking-wide t-3">{label}</p>
            <p className="text-lg font-black tabular-nums t-accent">{value}</p>
            <p className="text-[11px] t-3">{hint}</p>
          </div>
        ))}
      </div>

      {/* La última sesión frente a todo lo suyo. */}
      <div>
        <h4 className="text-[13px] font-bold t-1">
          La última sesión frente a todas · {formatShort(latest.date)} ·{' '}
          {latest.kind === 'partido' ? (latest.goalkeeper ? 'partido de portero' : 'partido') : 'entreno'}
        </h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide t-3">
                <th className="py-1 text-left font-bold">Cifra</th>
                <th className="py-1 text-right font-bold">Esta</th>
                <th className="py-1 text-right font-bold">Su media</th>
                <th className="py-1 text-right font-bold">Mejor que</th>
              </tr>
            </thead>
            <tbody>
              {latestFields.map((id) => {
                const list = values(report.sessions, id);
                const mean = list.reduce((a, b) => a + b, 0) / list.length;
                const rank = ownRank(report.sessions, id, latest[id] as number);
                return (
                  <tr key={id} className="border-t hairline">
                    <td className="py-1.5 t-2">
                      {fieldOf(id).icon} {fieldOf(id).short}
                    </td>
                    <td className="py-1.5 text-right font-bold t-1">{fmt(id, latest[id])}</td>
                    <td className="py-1.5 text-right t-3">{fmt(id, mean)}</td>
                    <td className={`py-1.5 text-right font-bold ${rank >= 75 ? 't-accent' : 't-2'}`}>el {rank} %</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] t-3">«Mejor que el 80 %» = supera a 80 de cada 100 de sus propias sesiones.</p>
      </div>

      {/* La última semana frente a una normal. */}
      <div>
        <h4 className="text-[13px] font-bold t-1">Los últimos 7 días frente a una semana normal</h4>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ['Sesiones', now.count, usual?.count, (v: number) => String(Math.round(v))],
              ['Kilómetros', now.km, usual?.km, (v: number) => formatValue('distance', v)],
              ['Punta', now.top, usual?.top, (v: number) => (v ? formatValue('topSpeed', v) : '—')],
              ['Tiros', now.shots, usual?.shots, (v: number) => String(Math.round(v))],
            ] as [string, number, number | undefined, (v: number) => string][]
          ).map(([label, value, normal, show]) => {
            const up = normal !== undefined && value > normal * 1.05;
            const down = normal !== undefined && value < normal * 0.95;
            return (
              <div key={label} className="rounded-2xl border p-3 hairline surf-1">
                <p className="text-[11px] font-bold uppercase tracking-wide t-3">{label}</p>
                <p className="text-lg font-black tabular-nums t-1">
                  {show(value)} <span className="text-xs">{up ? '▲' : down ? '▼' : ''}</span>
                </p>
                <p className="text-[11px] t-3">normal: {normal === undefined ? '—' : show(normal)}</p>
              </div>
            );
          })}
        </div>
        {report.week.length === 0 && <p className="mt-1 text-[11px] t-3">Esta semana todavía no hay sesiones.</p>}
      </div>

      {/* Frente a los estudios. */}
      {placed.length > 0 && (
        <div>
          <h4 className="text-[13px] font-bold t-1">Frente a niños de su edad</h4>
          <p className="mt-0.5 text-[11px] leading-snug t-3">
            Barra del percentil 0 al 100 de cada grupo; la franja es su rango (de su sesión típica a las mejores) y la
            marca, la última sesión. «P80» = mejor que 80 de cada 100 niños de ese grupo. Son estimaciones.
          </p>
          <div className="mt-3 space-y-4">
            {placed.map((item) => (
              <Ruler key={item.comparison.id} placed={item} />
            ))}
          </div>
        </div>
      )}

      {/* Por puesto. */}
      <div>
        <h4 className="text-[13px] font-bold t-1">Promedios por puesto (mediana por sesión)</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide t-3">
                <th className="py-1 text-left font-bold">Cifra</th>
                {groups.map((g) => (
                  <th key={g.label} className="py-1 text-right font-bold">
                    {g.label} ({g.list.length})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((id) => (
                <tr key={id} className="border-t hairline">
                  <td className="py-1.5 t-2">
                    {fieldOf(id).icon} {fieldOf(id).short}
                  </td>
                  {groups.map((g) => (
                    <td key={g.label} className="py-1.5 text-right t-1">
                      {fmt(id, median(values(g.list, id)))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mes a mes. */}
      <div>
        <h4 className="text-[13px] font-bold t-1">Mes a mes</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide t-3">
                <th className="py-1 text-left font-bold">Mes</th>
                <th className="py-1 text-right font-bold">Sesiones</th>
                <th className="py-1 text-right font-bold">Punta (P90)</th>
                <th className="py-1 text-right font-bold">Mejor tiro</th>
                <th className="py-1 text-right font-bold">Km/sesión</th>
              </tr>
            </thead>
            <tbody>
              {months.map(([month, list]) => {
                const sp = values(list, 'topSpeed');
                const sh = values(list, 'shotPower');
                const km = list.reduce((a, s) => a + (s.distance ?? 0), 0) / list.length;
                return (
                  <tr key={month} className="border-t hairline">
                    <td className="py-1.5 t-2">
                      {new Date(`${month}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: '2-digit' })}
                    </td>
                    <td className="py-1.5 text-right t-1">{list.length}</td>
                    <td className="py-1.5 text-right t-1">{sp.length ? formatValue('topSpeed', quantile(sp, 0.9)) : '—'}</td>
                    <td className="py-1.5 text-right t-1">{sh.length ? formatValue('shotPower', Math.max(...sh)) : '—'}</td>
                    <td className="py-1.5 text-right t-1">{formatValue('distance', km)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <details className="rounded-2xl border p-3 hairline surf-1">
        <summary className="cursor-pointer text-[13px] font-bold t-1">Cómo leerlo</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed t-2">
          <li>
            Footbar sólo tiene una validación, del propio fabricante y con adultos: la punta sale un 3,3 % baja y varía
            ~0,8 km/h de una sesión a otra en el mismo jugador. <b>Cambios de menos de 1 km/h son ruido.</b>
          </li>
          <li>La potencia de tiro de Footbar no está validada; los estudios la miden con cámaras 3D o radar.</li>
          <li>Los estudios de partido no cuentan a los porteros: separa siempre portería y campo.</li>
          <li>Los minutos de Footbar incluyen calentamiento y descansos: las distancias no son las de un partido.</li>
          <li>
            Los percentiles se estiman con la media y la desviación de cada estudio (distribución normal). La punta se
            convierte en tiempo de 40 m o de 100 m con un modelo de aceleración (τ entre 0,9 y 1,3 s): por eso son
            rangos.
          </li>
          <li>Añade la palabra «portero» en la línea de una sesión si ese día jugó en portería.</li>
        </ul>
      </details>

      <details className="rounded-2xl border p-3 hairline surf-1">
        <summary className="cursor-pointer text-[13px] font-bold t-1">Qué dicen los expertos</summary>
        <ul className="mt-2 space-y-2 text-[13px] leading-relaxed">
          {EXPERTS.map((e) => (
            <li key={e.who}>
              <b className="t-1">{e.who}.</b> <span className="t-2">{e.text}</span>
            </li>
          ))}
        </ul>
      </details>

      <details className="rounded-2xl border p-3 hairline surf-1">
        <summary className="cursor-pointer text-[13px] font-bold t-1">Fuentes</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[12px] leading-relaxed t-3">
          {SOURCES.map((s) => (
            <li key={s.id}>
              {s.cite}{' '}
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer" className="underline t-accent">
                  enlace
                </a>
              )}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
