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
  type Tier,
} from '@/lib/gpsReferences';
import type { GpsSession, Profile } from '@/types';

/* =========================================================================
 *  El informe del GPS: cómo va el peque y dónde está frente a los estudios.
 *
 *  Se calcula en el aparato con sus sesiones —no hay ni una cifra suya en el
 *  código— y se rehace solo cada vez que entra una sesión nueva, llegue de
 *  Footbar, de la foto o pegada a mano. De lo inmediato a lo de fondo: el
 *  resumen, la última sesión frente a todo lo suyo, la última semana frente a
 *  una semana normal, dónde queda frente a niños de su edad (población
 *  general, club y élite), sus medianas por puesto y el mes a mes.
 *
 *  En el móvil todo va en una columna y se salta de apartado con la tira de
 *  arriba; en el ordenador las tarjetas se ponen de dos en dos.
 * ========================================================================= */

/** Las cifras que se enseñan en el informe, por orden. */
const FIELDS: GpsFieldId[] = ['topSpeed', 'distance', 'intense', 'shotPower', 'shots', 'passes', 'ballTime', 'accels'];

const values = (sessions: GpsSession[], id: GpsFieldId) =>
  sessions.map((session) => session[id]).filter((v): v is number => typeof v === 'number' && v > 0);

const median = (list: number[]) => (list.length ? quantile(list, 0.5) : undefined);
const fmt = (id: GpsFieldId, v: number | undefined) => (v === undefined ? '—' : formatValue(id, v));
const mid = ([lo, hi]: [number, number]) => Math.round((lo + hi) / 2);
const oneDecimal = (v: number) => v.toFixed(1).replace('.', ',');

/** «Mejor que el X % de sus sesiones». */
function ownRank(sessions: GpsSession[], id: GpsFieldId, value: number): number {
  const list = values(sessions, id);
  if (list.length < 2) return 50;
  const below = list.filter((v) => v < value).length;
  const same = list.filter((v) => v === value).length;
  return Math.round(((below + (same - 1) / 2) / (list.length - 1)) * 100);
}

/* ------------------------------------------------------------ percentiles */

/**
 * Cómo se lee un percentil, con su color. Las cuatro franjas son las de
 * siempre en informes de crecimiento y rendimiento: por debajo del 25, la
 * media ancha, por encima del 75 y el 10 % de arriba.
 */
function band(p: number) {
  if (p >= 90) return { label: 'Top 10 %', text: 'text-emerald-500', bg: 'bg-emerald-500', soft: 'bg-emerald-500/15' };
  if (p >= 75) return { label: 'Por encima', text: 'text-sky-500', bg: 'bg-sky-500', soft: 'bg-sky-500/15' };
  if (p >= 25) return { label: 'En la media', text: 't-2', bg: 'bg-accent', soft: 'bg-accent-soft' };
  return { label: 'Por debajo', text: 'text-amber-500', bg: 'bg-amber-500', soft: 'bg-amber-500/15' };
}

const TIER_STYLE: Record<Tier, string> = {
  general: 'border-sky-500/40 text-sky-500',
  club: 'border-emerald-500/40 text-emerald-500',
  elite: 'border-amber-500/50 text-amber-500',
};

function PercentileChip({ p, prefix = 'P' }: { p: number; prefix?: string }) {
  const b = band(p);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${b.soft} ${b.text}`}>
      {prefix}
      {p}
    </span>
  );
}

/** La pista de 0 a 100 con sus cuatro franjas pintadas de fondo. */
function Zones() {
  return (
    <>
      <span className="absolute inset-y-0 left-0 w-1/4 rounded-l-full bg-amber-500/15" />
      <span className="absolute inset-y-0 left-1/4 w-1/2 surf-2" />
      <span className="absolute inset-y-0 left-3/4 w-[15%] bg-sky-500/15" />
      <span className="absolute inset-y-0 right-0 w-[10%] rounded-r-full bg-emerald-500/20" />
    </>
  );
}

/** Barra de un percentil propio, con la marca en su sitio. */
function RankBar({ p, label }: { p: number; label: string }) {
  const b = band(p);
  return (
    <div className="relative mt-2 h-2 rounded-full" role="img" aria-label={label}>
      <Zones />
      <span className={`absolute inset-y-0 left-0 rounded-full opacity-70 ${b.bg}`} style={{ width: `${Math.max(p, 2)}%` }} />
      <span
        className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${b.bg}`}
        style={{ left: `${p}%` }}
      />
    </div>
  );
}

/** El anillo de la portada: un percentil en grande. */
function Ring({ p, caption }: { p: number; caption: string }) {
  const b = band(p);
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-32 w-32 shrink-0" role="img" aria-label={`${caption}: percentil ${p}`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-current opacity-10 t-1" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(c * p) / 100} ${c}`}
          className={`stroke-current ${b.text === 't-2' ? 't-accent' : b.text} motion-safe:transition-[stroke-dasharray] motion-safe:duration-700`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[10px] font-bold uppercase tracking-wide t-3">percentil</span>
        <span className="text-4xl font-black leading-none tabular-nums t-1">{p}</span>
        <span className={`mt-0.5 text-[10px] font-black uppercase tracking-wide ${b.text}`}>{b.label}</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- estudios */

function StudyCard({ placed }: { placed: Placed }) {
  const { comparison, typical, best, latest, range } = placed;
  const headline = mid(best);
  const disabled = Boolean(comparison.caveat);
  return (
    <article className={`rounded-2xl border p-3 hairline surf-1 ${disabled ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h5 className="text-[13px] font-bold leading-snug t-1">{comparison.title}</h5>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-2xl font-black leading-none tabular-nums ${band(headline).text === 't-2' ? 't-1' : band(headline).text}`}>
            P{range[0] === range[1] ? range[0] : `${range[0]}–${range[1]}`}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide t-3">{band(headline).label}</p>
        </div>
      </div>

      <div
        className="relative mt-4 h-3 rounded-full"
        role="img"
        aria-label={`${comparison.title}: sesión típica percentil ${mid(typical)}, mejores sesiones percentil ${mid(best)}${
          latest ? `, última sesión percentil ${mid(latest)}` : ''
        }`}
      >
        <Zones />
        {/* De la sesión típica a las mejores. */}
        <span
          className="absolute inset-y-0 rounded-full bg-accent opacity-60"
          style={{ left: `${range[0]}%`, width: `${Math.max(range[1] - range[0], 1.5)}%` }}
        />
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--accent)] bg-white"
          style={{ left: `${mid(typical)}%` }}
          title="Su sesión típica"
        />
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow"
          style={{ left: `${mid(best)}%` }}
          title="Sus mejores sesiones"
        />
        {latest && (
          <span className="absolute -top-3.5 -translate-x-1/2" style={{ left: `${mid(latest)}%` }} title="Última sesión">
            <span className="block h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-current t-1" />
          </span>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[9px] font-bold tabular-nums t-3" aria-hidden>
        {[0, 25, 50, 75, 100].map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-snug t-3">
        {comparison.detail} Con {placed.basis} sesiones.
      </p>
      {comparison.caveat && (
        <p className="mt-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-500">
          ⚠️ {comparison.caveat}
        </p>
      )}
    </article>
  );
}

/* ------------------------------------------------------------- mes a mes */

interface MonthRow {
  key: string;
  label: string;
  count: number;
  top?: number;
  shot?: number;
  km: number;
}

/** Sesiones por mes (barras) y punta de sus mejores sesiones (línea). */
function MonthChart({ rows }: { rows: MonthRow[] }) {
  const step = 56;
  const width = rows.length * step + 24;
  const height = 170;
  const top = 26;
  const bottom = height - 26;
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  const tops = rows.map((r) => r.top).filter((v): v is number => v !== undefined);
  const lo = tops.length ? Math.floor(Math.min(...tops) - 1) : 0;
  const hi = tops.length ? Math.ceil(Math.max(...tops) + 1) : 1;
  const x = (i: number) => 12 + step / 2 + i * step;
  const yTop = (v: number) => bottom - ((v - lo) / Math.max(hi - lo, 1)) * (bottom - top - 12);
  const points = rows
    .map((r, i) => (r.top === undefined ? null : `${x(i)},${yTop(r.top)}`))
    .filter(Boolean)
    .join(' ');

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        // Se encoge para caber entero; con muchos meses deja de encogerse y
        // se desplaza de lado, para que las cifras sigan leyéndose.
        className="block h-auto w-full"
        style={{ minWidth: `${rows.length * 40 + 24}px`, maxHeight: '15rem' }}
        role="img"
        aria-label="Sesiones por mes y velocidad punta de sus mejores sesiones"
      >
        {rows.map((r, i) => {
          // El número va dentro de la barra, abajo: arriba chocaba con la línea.
          const h = Math.max(16, (r.count / maxCount) * (bottom - top - 30));
          return (
            <g key={r.key}>
              <rect x={x(i) - 14} y={bottom - h} width="28" height={h} rx="6" fill="var(--accent)" opacity="0.18" />
              <text x={x(i)} y={bottom - 5} textAnchor="middle" className="fill-current t-2" fontSize="10" fontWeight="800">
                {r.count}
              </text>
              <text x={x(i)} y={height - 8} textAnchor="middle" className="fill-current t-3" fontSize="10" fontWeight="700">
                {r.label}
              </text>
            </g>
          );
        })}
        {points && <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
        {rows.map((r, i) =>
          r.top === undefined ? null : (
            <g key={`p-${r.key}`}>
              <circle cx={x(i)} cy={yTop(r.top)} r="4.5" fill="var(--accent)" stroke="white" strokeWidth="2" />
              <text x={x(i)} y={yTop(r.top) - 9} textAnchor="middle" className="fill-current t-1" fontSize="11" fontWeight="900">
                {oneDecimal(r.top)}
              </text>
            </g>
          ),
        )}
      </svg>
    </div>
  );
}

/* --------------------------------------------------------------- informe */

const NAV = [
  ['resumen', 'Resumen'],
  ['ultima', 'Última'],
  ['semana', 'Semana'],
  ['estudios', 'Frente a su edad'],
  ['puestos', 'Por puesto'],
  ['meses', 'Mes a mes'],
] as const;

function Heading({ id, title, hint }: { id: string; title: string; hint?: string }) {
  return (
    <div id={id} className="scroll-mt-4">
      <h4 className="text-[15px] font-black tracking-tight t-1">{title}</h4>
      {hint && <p className="mt-0.5 text-[11px] leading-snug t-3">{hint}</p>}
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
    const groups: { label: string; icon: string; list: GpsSession[] }[] = [
      { label: 'Portero', icon: '🧤', list: sessions.filter((s) => s.kind === 'partido' && s.goalkeeper) },
      { label: 'Campo', icon: '⚽', list: sessions.filter((s) => s.kind === 'partido' && !s.goalkeeper) },
      { label: 'Entreno', icon: '🏃', list: sessions.filter((s) => s.kind === 'entreno') },
    ].filter((g) => g.list.length > 0);

    // Mes a mes.
    const byMonth = new Map<string, GpsSession[]>();
    for (const s of sessions) byMonth.set(s.date.slice(0, 7), [...(byMonth.get(s.date.slice(0, 7)) ?? []), s]);
    const months: MonthRow[] = [...byMonth.entries()].map(([key, list]) => {
      const sp = values(list, 'topSpeed');
      const sh = values(list, 'shotPower');
      return {
        key,
        label: new Date(`${key}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''),
        count: list.length,
        top: sp.length ? quantile(sp, 0.9) : undefined,
        shot: sh.length ? Math.max(...sh) : undefined,
        km: list.reduce((a, s) => a + (s.distance ?? 0), 0) / list.length,
      };
    });

    const placed = profile.age === undefined ? [] : placeAgainstStudies(sessions, profile.age, latest);

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
      months,
      goalkeeper: sessions.filter((s) => s.goalkeeper).length,
      placed,
    };
  }, [raw, profile.age]);

  const card = `${kid ? 'card-kid' : 'card'} p-4 sm:p-5`;

  if (!report) {
    return (
      <section className={card}>
        <h3 className="mb-1 text-sm font-bold t-1">📊 Informe</h3>
        <p className="text-sm t-3">
          Con cuatro sesiones sale el informe: promedios, la última semana y dónde queda frente a niños de su edad.
        </p>
      </section>
    );
  }

  const { latest, speeds, shots, record, now, usual, groups, months, placed } = report;
  const latestFields = FIELDS.filter((id) => (latest[id] ?? 0) > 0);
  // El titular: su velocidad frente a la población general de su edad, que es
  // la comparación más sólida (10.000 niños); si no hay, la primera que haya.
  const headline =
    placed.find((p) => p.comparison.tier === 'general') ?? placed.find((p) => !p.comparison.caveat) ?? null;
  const tiers: Tier[] = ['general', 'club', 'elite'];

  const kpis: [string, string, string][] = [
    ['Punta habitual', speeds.length ? formatValue('topSpeed', quantile(speeds, 0.9)) : '—', 'sus mejores sesiones (P90)'],
    ['Punta típica', speeds.length ? formatValue('topSpeed', quantile(speeds, 0.5)) : '—', 'la mediana de todas'],
    ['Récord', record?.topSpeed ? formatValue('topSpeed', record.topSpeed) : '—', record ? formatShort(record.date) : ''],
    ['Tiro típico', shots.length ? formatValue('shotPower', quantile(shots, 0.5)) : '—', 'mediana del mejor tiro'],
  ];

  return (
    <section className={`${card} space-y-6`}>
      <header className="space-y-3">
        <div>
          <h3 className="text-base font-black tracking-tight t-1">📊 Informe de {profile.name}</h3>
          <p className="text-[11px] t-3">
            {report.sessions.length} sesiones · {report.goalkeeper} de portero · se recalcula solo con cada sesión nueva
          </p>
        </div>
        <nav aria-label="Apartados del informe" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {NAV.filter(([id]) => id !== 'estudios' || placed.length > 0).map(([id, label]) => (
            <a
              key={id}
              href={`#informe-${id}`}
              className="shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-bold hairline surf-1 hover-soft t-2"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* ---------------------------------------------------------- resumen */}
      <div id="informe-resumen" className="scroll-mt-4 grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex items-center gap-4 rounded-3xl border p-4 hairline surf-1">
          {headline ? (
            <>
              <Ring p={mid(headline.best)} caption="Sus mejores sesiones frente a niños de su edad" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide t-3">Frente a niños de su edad</p>
                <p className="mt-1 text-[13px] leading-snug t-1">
                  En sus mejores días corre más que <b>{mid(headline.best)} de cada 100</b>; en un día normal, más que{' '}
                  <b>{mid(headline.typical)}</b>.
                </p>
                <p className="mt-1 text-[10px] leading-snug t-3">{headline.comparison.title}. Estimación.</p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide t-3">Punta habitual</p>
              <p className="text-4xl font-black tabular-nums t-accent">{kpis[0][1]}</p>
              <p className="text-[11px] t-3">Pon su edad en el perfil para compararle con niños de su edad.</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {kpis.map(([label, value, hint]) => (
            <div key={label} className="rounded-2xl border p-3 hairline surf-1">
              <p className="text-[10px] font-bold uppercase tracking-wide t-3">{label}</p>
              <p className="text-xl font-black tabular-nums t-accent sm:text-2xl">{value}</p>
              <p className="text-[11px] t-3">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* --------------------------------------------------- última sesión */}
      <div className="space-y-3">
        <Heading
          id="informe-ultima"
          title={`La última sesión frente a todas`}
          hint={`${formatShort(latest.date)} · ${
            latest.kind === 'partido' ? (latest.goalkeeper ? 'partido de portero' : 'partido') : 'entreno'
          } · la barra dice a cuántas de sus sesiones supera`}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {latestFields.map((id) => {
            const list = values(report.sessions, id);
            const mean = list.reduce((a, b) => a + b, 0) / list.length;
            const value = latest[id] as number;
            const rank = ownRank(report.sessions, id, value);
            const diff = mean ? Math.round(((value - mean) / mean) * 100) : 0;
            return (
              <div key={id} className="rounded-2xl border p-3 hairline surf-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[12px] font-bold t-2">
                    {fieldOf(id).icon} {fieldOf(id).short}
                  </p>
                  <PercentileChip p={rank} prefix="mejor que el " />
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xl font-black tabular-nums t-1">{fmt(id, value)}</span>
                  <span className="text-[11px] tabular-nums t-3">media {fmt(id, mean)}</span>
                  {Math.abs(diff) >= 3 && (
                    <span className={`text-[11px] font-black tabular-nums ${diff > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {diff > 0 ? '▲' : '▼'} {Math.abs(diff)} %
                    </span>
                  )}
                </div>
                <RankBar p={rank} label={`${fieldOf(id).short}: mejor que el ${rank} % de sus sesiones`} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------ semana */}
      <div className="space-y-3">
        <Heading id="informe-semana" title="Los últimos 7 días frente a una semana normal" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {(
            [
              ['Sesiones', now.count, usual?.count, (v: number) => String(Math.round(v))],
              ['Kilómetros', now.km, usual?.km, (v: number) => formatValue('distance', v)],
              ['Punta', now.top, usual?.top, (v: number) => (v ? formatValue('topSpeed', v) : '—')],
              ['Tiros', now.shots, usual?.shots, (v: number) => String(Math.round(v))],
            ] as [string, number, number | undefined, (v: number) => string][]
          ).map(([label, value, normal, show]) => {
            // Sin sesiones esta semana no hay comparación: «−100 %» sólo asusta.
            const diff =
              normal && report.week.length > 0 ? Math.round(((value - normal) / normal) * 100) : undefined;
            const scale = Math.max(value, normal ?? 0, 1e-9);
            return (
              <div key={label} className="rounded-2xl border p-3 hairline surf-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide t-3">{label}</p>
                  {diff !== undefined && Math.abs(diff) >= 5 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                        diff > 0 ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'
                      }`}
                    >
                      {diff > 0 ? '+' : ''}
                      {diff} %
                    </span>
                  )}
                </div>
                <p className="text-xl font-black tabular-nums t-1">{show(value)}</p>
                <div className="mt-2 space-y-1" aria-hidden>
                  <div className="h-1.5 rounded-full surf-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(value / scale) * 100}%` }} />
                  </div>
                  <div className="h-1.5 rounded-full surf-2">
                    <div className="h-full rounded-full bg-current opacity-25 t-1" style={{ width: `${((normal ?? 0) / scale) * 100}%` }} />
                  </div>
                </div>
                <p className="mt-1 text-[11px] t-3">normal: {normal === undefined ? '—' : show(normal)}</p>
              </div>
            );
          })}
        </div>
        {report.week.length === 0 && <p className="text-[11px] t-3">Esta semana todavía no hay sesiones.</p>}
      </div>

      {/* ---------------------------------------------------------- estudios */}
      {placed.length > 0 && (
        <div className="space-y-3">
          <Heading
            id="informe-estudios"
            title="Frente a niños de su edad"
            hint="«P80» = mejor que 80 de cada 100 niños de ese grupo. Son estimaciones a partir de estudios publicados."
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border px-3 py-2 text-[11px] hairline surf-1 t-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-[var(--accent)] bg-white" /> su día normal
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-accent" /> sus mejores días
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-current t-1" /> la última
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-5 rounded-full bg-amber-500/30" />
              <span className="h-2 w-5 rounded-full surf-2" />
              <span className="h-2 w-5 rounded-full bg-sky-500/30" />
              <span className="h-2 w-5 rounded-full bg-emerald-500/40" /> por debajo · media · encima · top 10
            </span>
          </div>
          {tiers.map((tier) => {
            const list = placed.filter((p) => p.comparison.tier === tier);
            if (list.length === 0) return null;
            return (
              <div key={tier} className="space-y-2">
                <p>
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${TIER_STYLE[tier]}`}
                  >
                    {TIER_LABEL[tier]}
                  </span>
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {list.map((item) => (
                    <StudyCard key={item.comparison.id} placed={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ----------------------------------------------------------- puestos */}
      {groups.length > 0 && (
        <div className="space-y-3">
          <Heading id="informe-puestos" title="Por puesto" hint="Mediana por sesión. Resaltada, la más alta de cada fila." />
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[320px] border-separate border-spacing-y-1 text-[13px] tabular-nums">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide t-3">
                  <th className="px-2 py-1 text-left font-bold">Cifra</th>
                  {groups.map((g) => (
                    <th key={g.label} className="px-2 py-1 text-right font-bold">
                      <span className="whitespace-nowrap">
                        {g.icon} {g.label}
                      </span>
                      <span className="block font-normal normal-case tracking-normal">{g.list.length} ses.</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELDS.map((id) => {
                  const cells = groups.map((g) => median(values(g.list, id)));
                  const top = Math.max(0, ...cells.map((v) => v ?? 0));
                  if (top === 0) return null;
                  return (
                    <tr key={id}>
                      <td className="rounded-l-xl px-2 py-1.5 surf-1 t-2">
                        <span className="whitespace-nowrap">
                          {fieldOf(id).icon} {fieldOf(id).short}
                        </span>
                      </td>
                      {cells.map((v, i) => {
                        const share = v ? v / top : 0;
                        const best = v !== undefined && v === top && groups.length > 1;
                        return (
                          <td
                            key={groups[i].label}
                            className={`relative px-2 py-1.5 text-right surf-1 ${i === cells.length - 1 ? 'rounded-r-xl' : ''}`}
                          >
                            <span
                              className="absolute inset-y-1 right-1 rounded-md bg-accent-soft"
                              style={{ width: `calc(${share * 100}% - 0.5rem)` }}
                              aria-hidden
                            />
                            <span className={`relative whitespace-nowrap ${best ? 'font-black t-accent' : 't-1'}`}>{fmt(id, v)}</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- meses */}
      <div className="space-y-3">
        <Heading
          id="informe-meses"
          title="Mes a mes"
          hint="Barras: sesiones del mes. Línea: velocidad punta de sus mejores sesiones (P90), en km/h."
        />
        <div className="rounded-2xl border p-3 hairline surf-1">
          <MonthChart rows={months} />
        </div>
        <details className="rounded-2xl border p-3 hairline surf-1">
          <summary className="cursor-pointer text-[13px] font-bold t-1">Ver la tabla</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[320px] text-[13px] tabular-nums">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide t-3">
                  <th className="py-1 text-left font-bold">Mes</th>
                  <th className="py-1 text-right font-bold">Sesiones</th>
                  <th className="py-1 text-right font-bold">Punta P90</th>
                  <th className="py-1 text-right font-bold">Mejor tiro</th>
                  <th className="py-1 text-right font-bold">Km/sesión</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.key} className="border-t hairline">
                    <td className="py-1.5 t-2">
                      {new Date(`${m.key}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: '2-digit' })}
                    </td>
                    <td className="py-1.5 text-right t-1">{m.count}</td>
                    <td className="py-1.5 text-right t-1">{m.top === undefined ? '—' : formatValue('topSpeed', m.top)}</td>
                    <td className="py-1.5 text-right t-1">{m.shot === undefined ? '—' : formatValue('shotPower', m.shot)}</td>
                    <td className="py-1.5 text-right t-1">{formatValue('distance', m.km)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* --------------------------------------------------------- el fondo */}
      <div className="grid gap-2 lg:grid-cols-3">
        <details className="rounded-2xl border p-3 hairline surf-1">
          <summary className="cursor-pointer text-[13px] font-bold t-1">Cómo leerlo</summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed t-2">
            <li>
              Footbar sólo tiene una validación, del propio fabricante y con adultos: la punta sale un 3,3 % baja y varía
              ~0,8 km/h de una sesión a otra en el mismo jugador. <b>Cambios de menos de 1 km/h son ruido.</b>
            </li>
            <li>La potencia de tiro de Footbar no está validada; los estudios la miden con cámaras 3D o radar.</li>
            <li>Los estudios de partido son de jugadores de campo: los días de portería no cuentan en ellos.</li>
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
      </div>
    </section>
  );
}
