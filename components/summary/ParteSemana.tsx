'use client';

import { useMemo } from 'react';

import { SectionHead } from '@/components/summary/SectionHead';
import { useApuntesCole, useClassroomSnapshot } from '@/hooks/useColegio';
import { useGpsSessions } from '@/hooks/useGps';
import { useWeekPlan } from '@/hooks/useWeekPlan';
import { parteDeLaSemana, type Linea, type TonoLinea } from '@/lib/agentes/parte';
import { formatShort } from '@/lib/dates';
import { gpsEnabledFor } from '@/lib/gps';
import type { DateKey, DayEntry, Profile, ProfileSkin } from '@/types';

/* =========================================================================
 *  El parte de la semana, pintado.
 *
 *  Arriba, destacado, el foco: la única cosa que conviene hacer, con su
 *  botón si lo hay. Debajo, en dos columnas cortas, lo que ha ido a mejor y
 *  lo que se está cayendo. Cada línea lleva debajo, en pequeño, de dónde
 *  sale la cifra: el parte no pide que se le crea, enseña la cuenta.
 * ========================================================================= */

interface ParteSemanaProps {
  profile: Profile;
  entries: Record<string, DayEntry>;
  /** Último día de la semana mirada; el parte son los 7 días hasta él. */
  hasta: DateKey;
  skin: ProfileSkin;
  kid: boolean;
  /** Abre el registro de hoy. */
  onApuntar: () => void;
  /** Lleva a la casilla de un hábito en el registro; sin él, se abre el día. */
  onFocusMetric?: (metricId: string) => void;
  onOpenPlan?: () => void;
}

const TONO: Record<TonoLinea, { text: string; dot: string; banner: string }> = {
  ok: { text: 't-ok', dot: 'bg-[var(--ok)]', banner: 'banner-ok' },
  warn: { text: 't-warn', dot: 'bg-[var(--warn)]', banner: 'banner-warn' },
  info: { text: 't-info', dot: 'bg-[var(--info)]', banner: 'banner-info' },
};

/** Una línea del parte: la frase y, debajo, de dónde sale. */
function Renglon({ linea }: { linea: Linea }) {
  return (
    <li className="flex gap-2">
      <span className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${TONO[linea.tono].dot}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug t-1">{linea.texto}</p>
        <p className="mt-0.5 text-[11px] leading-snug t-3">{linea.dato}</p>
      </div>
    </li>
  );
}

export function ParteSemana({
  profile,
  entries,
  hasta,
  skin,
  kid,
  onApuntar,
  onFocusMetric,
  onOpenPlan,
}: ParteSemanaProps) {
  const plan = useWeekPlan(profile.id);
  const conGps = gpsEnabledFor(profile);
  const sessions = useGpsSessions(profile.id);
  // Para los peques: lo que hay que entregar y con qué apuntes estudiar.
  const classroom = useClassroomSnapshot(profile.id);
  const apuntes = useApuntesCole(profile.id);

  const parte = useMemo(
    () =>
      parteDeLaSemana({
        profile,
        entries,
        hasta,
        plan,
        gpsSessions: conGps ? sessions : null,
        classroom,
        apuntes,
      }),
    [profile, entries, hasta, plan, conGps, sessions, classroom, apuntes],
  );

  const { foco, logros, riesgos } = parte;

  /** El botón del foco, si hay algo que hacer desde aquí. */
  const accion = (() => {
    if (!foco) return null;
    if (foco.metricId) {
      const id = foco.metricId;
      return { label: 'Ir a la casilla', run: () => (onFocusMetric ? onFocusMetric(id) : onApuntar()) };
    }
    if (foco.accion === 'apuntar') return { label: '✏️ Apuntar hoy', run: onApuntar };
    if (foco.accion === 'reto') return { label: 'Ir al reto', run: onApuntar };
    if (foco.accion === 'agenda' && onOpenPlan) return { label: 'Abrir la semana', run: onOpenPlan };
    return null;
  })();

  return (
    <section className={`${kid ? 'card-kid' : 'card'} p-4`} aria-labelledby="parte-semana">
      <SectionHead
        id="parte-semana"
        title={kid ? 'Tu parte de la semana' : 'Parte de la semana'}
        meta={`${formatShort(parte.desde)} – ${formatShort(parte.hasta)} · ${parte.diasApuntados}/7 días`}
        skin={skin}
      />

      {/* El foco: una sola cosa, destacada. */}
      {foco ? (
        <div className={`banner ${TONO[foco.tono].banner} flex flex-wrap items-center gap-x-3 gap-y-2`}>
          <div className="min-w-[12rem] flex-1">
            <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${TONO[foco.tono].text}`}>
              {kid ? 'A por esto' : 'El foco'}
            </p>
            <p className="mt-0.5 text-[14px] font-bold leading-snug t-1">{foco.texto}</p>
            <p className="mt-0.5 text-[11px] leading-snug t-3">{foco.dato}</p>
          </div>
          {accion && (
            <button type="button" onClick={accion.run} className="btn-primary shrink-0 px-3 py-1.5 text-xs">
              {accion.label}
            </button>
          )}
        </div>
      ) : (
        <p className="banner banner-ok text-[13px] font-semibold t-1">
          {kid ? '¡Nada que arreglar! Sigue así.' : 'Nada se está cayendo: toca mantener.'}
        </p>
      )}

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.18em] t-ok">
            {kid ? 'Lo que mola' : 'Logros'}
          </p>
          {logros.length > 0 ? (
            <ul className="space-y-2">
              {logros.map((linea) => (
                <Renglon key={linea.texto} linea={linea} />
              ))}
            </ul>
          ) : (
            <p className="text-[12px] leading-snug t-3">
              {parte.suficiente
                ? kid
                  ? 'Esta semana aún no hay subidas: ¡a por ellas!'
                  : 'Sin subidas claras frente a la semana anterior.'
                : 'Con más días apuntados se verá qué sube.'}
            </p>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.18em] t-warn">
            {kid ? 'Ojo con' : 'Riesgos'}
          </p>
          {riesgos.length > 0 ? (
            <ul className="space-y-2">
              {riesgos.map((linea) => (
                <Renglon key={linea.texto} linea={linea} />
              ))}
            </ul>
          ) : (
            <p className="text-[12px] leading-snug t-3">
              {kid ? 'Nada se está cayendo. ¡Bien!' : 'Nada se está cayendo frente a la semana anterior.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
