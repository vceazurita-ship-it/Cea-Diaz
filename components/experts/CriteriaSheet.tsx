'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import {
  EXPERTS,
  PRIORITY_ICON,
  PRIORITY_LABEL,
  expertsOf,
  guidanceOf,
} from '@/lib/experts';
import type { Expert, HabitPriority, Profile } from '@/types';

const LEVEL_LABEL: Record<Expert['level'], string> = {
  consenso: 'Consenso',
  divulgacion: 'Divulgación',
  discutido: 'Con reservas',
};

const LEVEL_CLASS: Record<Expert['level'], string> = {
  consenso: 'bg-accent-soft t-1',
  divulgacion: 'surf-2 t-2',
  discutido: '[background:var(--danger-bg)] t-danger',
};

interface CriteriaSheetProps {
  profile: Profile;
  onClose: () => void;
  /** Abre la hoja directamente en la ficha de esta métrica. */
  focusMetricId?: string;
}

/**
 * La ficha completa del criterio de un perfil: qué dice cada hábito, con qué
 * cifra y quién lo sostiene. Se abre desde el aviso del día y desde cada
 * categoría, y es el único sitio donde se explica de dónde sale todo esto.
 */
export function CriteriaSheet({ profile, onClose, focusMetricId }: CriteriaSheetProps) {
  const entries = useMemo(() => guidanceOf(profile.id), [profile.id]);
  const [open, setOpen] = useState<string | null>(focusMetricId ?? null);

  // Agrupado por categoría, en el orden en que se registran los hábitos.
  const byCategory = useMemo(() => {
    const map = new Map<string, { label: string; items: typeof entries }>();
    for (const entry of entries) {
      const bucket = map.get(entry.categoryId) ?? { label: entry.categoryLabel, items: [] };
      bucket.items.push(entry);
      map.set(entry.categoryId, bucket);
    }
    return [...map.values()];
  }, [entries]);

  // Sólo las referencias que de verdad se citan en este perfil.
  const cited = useMemo(() => {
    const ids = new Set(entries.flatMap((entry) => entry.guidance.experts));
    return [...ids].map((id) => EXPERTS[id]).filter(Boolean);
  }, [entries]);

  return (
    <Modal title={`Criterio de ${profile.name}`} onClose={onClose} size="lg">
      <p className="mb-4 text-sm leading-relaxed t-2">
        De dónde sale cada objetivo de este panel. Se separa lo que sostienen
        organismos y revisiones de lo que es la tesis de un divulgador: los dos se
        pueden leer, pero sólo lo primero se presenta como hecho.
      </p>

      <div className="space-y-5">
        {byCategory.map((group) => (
          <section key={group.label}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide t-3">{group.label}</h3>

            <ul className="space-y-2">
              {group.items.map(({ guidance, metric }) => {
                const expanded = open === guidance.metricId;
                return (
                  <li key={guidance.metricId} className="rounded-2xl border hairline surf-1">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : guidance.metricId)}
                      aria-expanded={expanded}
                      className="flex w-full items-start gap-3 p-3 text-left transition-colors hover-soft"
                    >
                      <span className="text-lg" aria-hidden>
                        {metric.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold t-1">{metric.label}</span>
                          <PriorityChip priority={guidance.priority} />
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug t-2">
                          {guidance.claim}
                        </span>
                      </span>
                      <span className={`t-3 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden>
                        ▾
                      </span>
                    </button>

                    {expanded && (
                      <div className="animate-floatUp border-t px-3 pb-3 pt-2 hairline">
                        <p className="text-xs leading-relaxed t-2">{guidance.detail}</p>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {expertsOf(guidance).map((expert) => (
                            <li
                              key={expert.id}
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold
                                ${LEVEL_CLASS[expert.level]}`}
                              title={expert.role}
                            >
                              {expert.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Quién es quién, y con qué respaldo se le cita. */}
      <section className="mt-6 border-t pt-4 hairline">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide t-3">Referencias citadas</h3>
        <ul className="space-y-2">
          {cited.map((expert) => (
            <li key={expert.id} className="text-xs leading-snug">
              <span className="font-semibold t-1">{expert.name}</span>{' '}
              <span
                className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold
                  ${LEVEL_CLASS[expert.level]}`}
              >
                {LEVEL_LABEL[expert.level]}
              </span>
              <span className="block t-3">{expert.role}</span>
              {expert.caveat && <span className="mt-0.5 block t-danger">⚠️ {expert.caveat}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] leading-snug t-3">
          Nada de esto sustituye al pediatra, al médico ni al fisioterapeuta. Son
          criterios generales para poner objetivos en casa, no un tratamiento.
        </p>
      </section>
    </Modal>
  );
}

export function PriorityChip({ priority }: { priority: HabitPriority }) {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide surf-2 t-3"
      title={
        priority === 'clave'
          ? 'Consenso amplio y efecto grande'
          : priority === 'importante'
            ? 'Bien respaldado, de segundo orden'
            : 'Ayuda y suma, sin ser determinante'
      }
    >
      <span aria-hidden>{PRIORITY_ICON[priority]}</span> {PRIORITY_LABEL[priority]}
    </span>
  );
}
