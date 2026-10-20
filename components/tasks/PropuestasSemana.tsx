'use client';

import { useMemo, useState } from 'react';

import { SectionHead } from '@/components/summary/SectionHead';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { useToast } from '@/components/ui/Toast';
import { useApuntesCole, useClassroomSnapshot } from '@/hooks/useColegio';
import { useGpsSessions } from '@/hooks/useGps';
import type { HabitStore } from '@/hooks/useHabitStore';
import { useRemembered } from '@/hooks/useRemembered';
import { useToday } from '@/hooks/useToday';
import { useWeekPlan } from '@/hooks/useWeekPlan';
import { fechaDe, proponerSemana, type Propuesta, type TipoPropuesta } from '@/lib/agentes/planificador';
import { capitalize, friendlyDateLabel } from '@/lib/dates';
import { createTask, type TaskDraft } from '@/lib/tasks';
import type { Profile, ProfileSkin } from '@/types';

/* =========================================================================
 *  Las propuestas del planificador para la semana que viene.
 *
 *  La app propone y un adulto decide: cada propuesta trae su porqué en una
 *  línea y dos botones, «Añadir» y «Descartar». Nada entra en la lista de
 *  tareas sin ese toque, y «Añadir todas» pide confirmación en el sitio.
 *
 *  Lo descartado se recuerda en este aparato por su identificador, que es
 *  estable: la misma propuesta no vuelve a salir aunque se recalcule. Lo
 *  añadido desaparece solo, porque el planificador no propone lo que ya
 *  está apuntado ese día con el mismo título.
 * ========================================================================= */

const ICONO: Record<TipoPropuesta, string> = {
  estudio: '📚',
  entreno: '⚽',
  descanso: '🛌',
  familia: '🏡',
  habito: '🎯',
  agenda: '🗓️',
};

/** Con más de estas, la tarjeta arranca plegada. */
const PLEGADA_DESDE = 4;

interface PropuestasSemanaProps {
  profile: Profile;
  store: HabitStore;
  kid: boolean;
  skin: ProfileSkin;
  /**
   * Cómo se guarda una tarea. En el panel de tareas es su propio `add`, que
   * además la manda al calendario si hay cuenta; fuera de él, se guarda tal
   * cual. `quiet` calla el aviso de cada una cuando se añaden de golpe.
   */
  onAdd?: (draft: TaskDraft, quiet?: boolean) => void | Promise<void>;
}

export function PropuestasSemana({ profile, store, kid, skin, onAdd }: PropuestasSemanaProps) {
  const hoy = useToday();
  const plan = useWeekPlan(profile.id);
  const gps = useGpsSessions(profile.id);
  const notify = useToast();

  // Los descartes, como lista de identificadores separados por comas.
  const [descartadasRaw, setDescartadas] = useRemembered<string>(`planificador:${profile.id}:descartadas`, '');
  const descartadas = useMemo(() => new Set(descartadasRaw.split(',').filter(Boolean)), [descartadasRaw]);

  // `store.tasks` cambia sólo cuando cambia alguna tarea; `getTasks` da una
  // lista nueva en cada vuelta y recalcularía las propuestas sin motivo.
  const { hydrated, entries, tasks: allTasks, getTasks } = store;

  // Lo último de Classroom y la lista de apuntes del cole, si el niño los
  // tiene: sin ellos, las propuestas salen igual.
  const classroom = useClassroomSnapshot(profile.id);
  const apuntes = useApuntesCole(profile.id);

  const propuestas = useMemo(() => {
    if (!hydrated) return [];
    return proponerSemana({
      profile,
      hoy,
      entries,
      tasks: getTasks(profile.id),
      plan,
      gps: gps ?? [],
      classroom,
      apuntes,
    }).filter((p) => !descartadas.has(p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, entries, allTasks, profile, hoy, plan, gps, descartadas, classroom, apuntes]);

  const [abierta, setAbierta] = useState<boolean | null>(null);
  const desplegada = abierta ?? propuestas.length < PLEGADA_DESDE;

  if (propuestas.length === 0) return null;

  const guardar = async (draft: TaskDraft, quiet = false) => {
    if (onAdd) {
      await onAdd(draft, quiet);
      return;
    }
    store.saveTask(createTask(profile.id, draft));
    if (!quiet) notify({ message: 'Apuntado.', icon: '📝' });
  };

  const descartar = (p: Propuesta) => {
    // Los últimos doscientos bastan: lo descartado hace meses ya no se
    // vuelve a proponer porque su fecha pasó.
    setDescartadas([...descartadas, p.id].slice(-200).join(','));
  };

  const tareas = propuestas.filter((p) => p.accion.kind === 'tarea');

  const anadirTodas = async () => {
    for (const p of tareas) {
      if (p.accion.kind === 'tarea') await guardar(p.accion.draft, true);
    }
    notify({ message: `${tareas.length} ${tareas.length === 1 ? 'tarea añadida' : 'tareas añadidas'}.`, icon: '📝' });
  };

  const porTipo = Array.from(
    propuestas.reduce((m, p) => m.set(p.tipo, (m.get(p.tipo) ?? 0) + 1), new Map<TipoPropuesta, number>()),
  );

  return (
    <section className={`${kid ? 'card-kid' : 'card'} p-4`} aria-label="Propuestas para la semana que viene">
      <SectionHead
        title="La semana que viene"
        meta={`${propuestas.length} ${propuestas.length === 1 ? 'propuesta' : 'propuestas'}`}
        skin={skin}
        action={
          tareas.length >= 2 && desplegada ? (
            <ConfirmButton
              question={`¿Añadir las ${tareas.length}?`}
              confirmLabel="Sí, añadir"
              confirmClassName="btn-primary px-3 py-1.5 text-xs"
              onConfirm={() => void anadirTodas()}
            >
              ➕ Añadir todas
            </ConfirmButton>
          ) : undefined
        }
      />

      <p className="-mt-1.5 mb-3 text-[12px] leading-snug t-2">
        Lo propone la app con lo que ya sabe
        {kid ? ` de los exámenes${classroom ? ', de Classroom' : ''} y del GPS` : ' de la agenda y del registro'}. Nada
        se apunta sin tocar «Añadir».
      </p>

      {!desplegada ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {porTipo.map(([tipo, n]) => (
            <span key={tipo} className="chip-soft text-[11px] font-bold tabular-nums t-2">
              <span aria-hidden>{ICONO[tipo]}</span> {n}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setAbierta(true)}
            aria-expanded={false}
            className="btn-ghost ml-auto px-3 py-1.5 text-xs"
          >
            ▸ Ver las {propuestas.length}
          </button>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border)]">
            {propuestas.map((p) => {
              const fecha = fechaDe(p);
              return (
                <li key={p.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-base"
                  >
                    {ICONO[p.tipo]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold leading-snug t-1">{p.titulo}</p>
                    <p className="mt-0.5 text-[11px] leading-snug t-3">
                      {fecha && (
                        <span className="font-semibold tabular-nums t-2">{capitalize(friendlyDateLabel(fecha))} · </span>
                      )}
                      {p.motivo}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {p.accion.kind === 'tarea' && (
                        <button
                          type="button"
                          onClick={() => p.accion.kind === 'tarea' && void guardar(p.accion.draft)}
                          className="btn-primary px-3 py-1 text-xs"
                        >
                          ➕ Añadir
                        </button>
                      )}
                      <button type="button" onClick={() => descartar(p)} className="btn-ghost px-3 py-1 text-xs">
                        {p.accion.kind === 'aviso' ? '👍 Visto' : 'Descartar'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {propuestas.length >= PLEGADA_DESDE && (
            <button
              type="button"
              onClick={() => setAbierta(false)}
              aria-expanded
              className="btn-ghost mt-3 w-full px-3 py-1.5 text-xs"
            >
              ▾ Plegar
            </button>
          )}
        </>
      )}
    </section>
  );
}
