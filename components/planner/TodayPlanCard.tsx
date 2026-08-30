'use client';

import { useEffect, useMemo, useState } from 'react';

import { useWeekPlan } from '@/hooks/useWeekPlan';
import type { HabitStore } from '@/hooks/useHabitStore';
import { friendlyDateLabel, isToday, weekdayIndex } from '@/lib/dates';
import { SILENT, checkBlock, statusIcon, statusLabel } from '@/lib/planCheck';
import {
  COMPANIONS,
  DAY_NAMES,
  blocksOfDay,
  durationLabel,
  endOf,
  minutesOf,
  themeOf,
  timeOf,
} from '@/lib/planner';
import type { DateKey, PlanBlockCheck, PlanStatus, Profile } from '@/types';

/* =========================================================================
 *  Lo que la semana tenía previsto para hoy, en la pantalla de registro.
 *
 *  Existe para cerrar el círculo. La agenda dice «hoy a las cinco y media,
 *  entreno»; el registro tiene una casilla de asistencia. Puestos uno al
 *  lado del otro, marcar la casilla deja de ser un trámite: se ve lo que se
 *  había apartado y si se ha cumplido, se ha quedado corto o se ha pasado.
 *
 *  Con la semana llena de verdad —la de Víctor pasa de ochenta ratos, trece
 *  o catorce cada día— la lista entera dejó de servir: por encima de la
 *  cabecera del móvil sólo cabían el desayuno y el gimnasio, y lo que hacía
 *  falta saber a media tarde quedaba enterrado. Así que cuando el día que se
 *  mira es hoy, lo primero es **lo que toca ahora y lo que viene después**, y
 *  el resto se despliega. Un día pasado se enseña entero: ahí ya no hay un
 *  «ahora», sólo un balance.
 *
 *  Cuando la agenda está vacía no se pinta nada: la pantalla de registro no
 *  es sitio para insistir en una sección que todavía no se usa.
 * ========================================================================= */

/** El mismo código de colores que en la cuadrícula de la semana. */
const STATUS_STYLE: Record<PlanStatus, string> = {
  cumplido: 'bg-accent t-on-accent',
  flojo: 'bg-amber-400/30 t-1',
  excedido: 't-danger',
  sinDia: 'surf-2 t-3',
  sinRegistrar: 'surf-3 t-2',
  futuro: 'surf-2 t-3',
  sinMetrica: 'surf-2 t-3',
};

interface TodayPlanCardProps {
  profile: Profile;
  date: DateKey;
  store: HabitStore;
  kid: boolean;
  /** Lleva a la sección de la semana, que es donde se edita. */
  onOpenPlan: () => void;
}

export function TodayPlanCard({ profile, date, store, kid, onOpenPlan }: TodayPlanCardProps) {
  const plan = useWeekPlan(profile.id);
  const theme = themeOf(profile.id);
  const day = weekdayIndex(date);
  const hoy = isToday(date);

  const entry = store.getEntry(profile.id, date);

  const checks = useMemo(
    () => blocksOfDay(plan, day).map((block) => checkBlock(profile, block, date, entry)),
    [plan, day, profile, date, entry],
  );

  /**
   * La hora, para saber qué toca ahora. Se arranca en nulo y se corrige tras
   * montar —en el servidor no hay reloj— y se repasa cada minuto, que es la
   * resolución a la que se mueve una agenda.
   */
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!hoy) return;
    const tick = () => {
      const clock = new Date();
      setNow(clock.getHours() * 60 + clock.getMinutes());
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [hoy]);

  /** Que la lista larga se enseñe entera. En un día pasado, siempre. */
  const [open, setOpen] = useState(false);

  // Agenda sin estrenar: aquí no se dice nada.
  if (plan.blocks.length === 0) return null;

  const judged = checks.filter((check) => !SILENT.has(check.status));
  const kept = judged.filter((check) => check.status === 'cumplido').length;
  const over = judged.filter((check) => check.status === 'excedido').length;

  /** Lo que está pasando ahora mismo, y lo que viene justo detrás. */
  const running =
    now === null
      ? []
      : checks.filter(
          (check) => minutesOf(check.block.start) <= now && endOf(check.block) > now,
        );

  const upcoming =
    now === null ? [] : checks.filter((check) => minutesOf(check.block.start) > now);

  const past = now === null ? [] : checks.filter((check) => endOf(check.block) <= now);

  /**
   * Lo que se enseña sin desplegar: lo de ahora y lo próximo. Con la lista
   * corta —o en un día que ya pasó— no hay nada que recortar y va entera.
   */
  const brief = hoy && now !== null && checks.length > 5;
  const shown = !brief || open ? checks : [...running, ...upcoming.slice(0, 3)];

  return (
    <section className={`${kid ? 'card-kid' : 'card'} p-4`} aria-label="Lo previsto para hoy">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-sm font-bold t-1">
          🗓️ {theme.title}: {friendlyDateLabel(date).toLowerCase()}
        </h2>
        <span className="text-xs t-3">
          {DAY_NAMES[day]} · {checks.length}{' '}
          {checks.length === 1 ? theme.blockWord : theme.blockWords}
        </span>
        <button type="button" onClick={onOpenPlan} className="btn-ghost ml-auto px-2.5 py-1 text-xs">
          Ver la semana
        </button>
      </header>

      {checks.length === 0 ? (
        <p className="text-sm t-3">
          Hoy no hay nada apartado en la semana. Lo que hagas se registra igual.
        </p>
      ) : (
        <>
          {/* Lo que toca ahora mismo. Es la línea que convierte la agenda en
              algo que se mira a media tarde y no sólo al planificarla. */}
          {brief && (
            <p className="mb-2.5 rounded-xl border px-2.5 py-1.5 text-xs leading-relaxed border-accent bg-accent-faint t-1">
              {running.length > 0 ? (
                <>
                  <strong>Ahora:</strong> {running[0].block.icon} {running[0].block.title} — hasta
                  las <span className="tabular-nums">{timeOf(endOf(running[0].block))}</span>.
                  {upcoming.length > 0 && (
                    <>
                      {' '}
                      Después, {upcoming[0].block.title} a las{' '}
                      <span className="tabular-nums">{upcoming[0].block.start}</span>.
                    </>
                  )}
                </>
              ) : upcoming.length > 0 ? (
                <>
                  <strong>Lo siguiente:</strong> {upcoming[0].block.icon} {upcoming[0].block.title}{' '}
                  a las <span className="tabular-nums">{upcoming[0].block.start}</span>
                  {past.length > 0 && ` · ${past.length} ya han pasado`}.
                </>
              ) : (
                <>
                  <strong>Se acabó lo previsto por hoy.</strong> Quedan las casillas de abajo por
                  repasar.
                </>
              )}
            </p>
          )}

          <ul className="space-y-1.5">
            {shown.map((check) => (
              <PlanLine
                key={check.block.id}
                check={check}
                now={now}
                current={running.some((item) => item.block.id === check.block.id)}
              />
            ))}
          </ul>

          {brief && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="btn-ghost mt-2 px-3 py-1.5 text-xs"
            >
              {open
                ? 'Ver sólo lo que queda'
                : `Ver el día entero (${checks.length} ${
                    checks.length === 1 ? theme.blockWord : theme.blockWords
                  })`}
            </button>
          )}

          <p className="mt-3 text-xs leading-relaxed t-3" aria-live="polite">
            {judged.length === 0
              ? 'Todavía no hay nada que comprobar: se irá marcando según registres el día.'
              : over > 0
                ? `${over} ${over === 1 ? 'se ha pasado' : 'se han pasado'} del máximo y ${kept} de ${judged.length} van cumplidos.`
                : `${kept} de ${judged.length} cumplidos según lo registrado hasta ahora.`}
          </p>
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Una línea del día
 * ------------------------------------------------------------------------- */

function PlanLine({
  check,
  now,
  current,
}: {
  check: PlanBlockCheck;
  now: number | null;
  current: boolean;
}) {
  const done = now !== null && endOf(check.block) <= now;

  return (
    <li
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-2 py-1.5
        ${current ? 'border border-accent bg-accent-faint' : 'surf-1'}
        ${done && !current ? 'opacity-60' : ''}`}
    >
      <span className="text-xs font-bold tabular-nums t-3">{check.block.start}</span>
      <span className="text-sm font-semibold t-1">
        <span aria-hidden>{check.block.icon}</span> {check.block.title}
      </span>
      <span className="text-[11px] tabular-nums t-3">{durationLabel(check.block.duration)}</span>

      {current && (
        <span className="chip-accent px-1.5 py-0 text-[10px] uppercase tracking-wide">Ahora</span>
      )}

      {check.block.companion && (
        <span className="rounded-full px-1.5 text-[10px] font-semibold surf-2 t-2">
          <span aria-hidden>{COMPANIONS[check.block.companion].icon}</span>{' '}
          {COMPANIONS[check.block.companion].short}
        </span>
      )}

      {check.metric && (
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[check.status]}`}
          title={check.text}
        >
          {statusIcon(check.status)} {statusLabel(check.status)}
        </span>
      )}
    </li>
  );
}

