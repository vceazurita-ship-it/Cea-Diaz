'use client';

import { useMemo, useState } from 'react';

import {
  COMPANIONS,
  COMPANION_LIST,
  DAY_NAMES,
  PLAN_KINDS,
  PLAN_KIND_LIST,
  amountUnit,
  blockFromPreset,
  durationLabel,
  linkableMetrics,
  presetGroupsOf,
  presetsOf,
} from '@/lib/planner';
import type { PlanPreset, PresetGroupId } from '@/lib/planner';
import { targetWord } from '@/lib/scoring';
import type { Companion, Metric, PlanBlock, PlanKind, Profile } from '@/types';

/* =========================================================================
 *  Alta y edición de un rato de la semana.
 *
 *  Lo que decide si esta pantalla sirve o estorba es el orden: primero los
 *  ratos de siempre —un toque y está—, y sólo debajo el formulario para el
 *  que no encaje en ninguno. Y al final, lo que ata la agenda al registro:
 *  de qué hábito es este rato y cuánto pretende aportar.
 * ========================================================================= */

/** Duraciones que se eligen el noventa por ciento de las veces. */
const QUICK_MINUTES = [15, 30, 45, 60, 90, 120, 180];

/** Emojis a mano, para no tener que abrir el teclado del móvil. */
const QUICK_ICONS = [
  '⚽', '🏊', '🥋', '🤸', '🏃', '🏆', '🎒', '📖', '✍️', '📝',
  '🍽️', '🥣', '🌙', '📱', '🎲', '🧩', '🧘', '💪', '💻', '📊',
  '🤝', '🗣️', '🧹', '🌳', '🍷', '💬', '🏡', '📌',
];

interface BlockEditorProps {
  profile: Profile;
  /** El rato que se edita; para uno nuevo, el esqueleto con día y hora. */
  block: PlanBlock;
  /** `true` cuando todavía no existe en la agenda. */
  isNew: boolean;
  onSave: (block: PlanBlock) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function BlockEditor({
  profile,
  block,
  isNew,
  onSave,
  onDelete,
  onCancel,
}: BlockEditorProps) {
  const [draft, setDraft] = useState<PlanBlock>(block);
  const kid = profile.kind === 'kid';

  const presets = presetsOf(profile.id);
  const topics = useMemo(() => presetGroupsOf(profile.id), [profile.id]);
  const groups = useMemo(() => linkableMetrics(profile.id), [profile.id]);

  // Qué tema está abierto. Sin temas —los peques, María— no se usa: la lista
  // va corrida, como estaba.
  const [topic, setTopic] = useState<PresetGroupId | null>(topics[0]?.id ?? null);
  const shown = topics.length > 0 ? topics.find((item) => item.id === topic)?.presets ?? [] : presets;

  /**
   * Un toque rellena el formulario entero, atadura incluida. Respeta la hora
   * si ya se había tocado: la que trae el rato de siempre es sólo la propuesta
   * de partida, y quien ha abierto el editor sobre las nueve la quiere a las
   * nueve.
   */
  const applyPreset = (preset: PlanPreset) =>
    setDraft((prev) => ({
      ...blockFromPreset(preset, prev.day),
      id: prev.id,
      start: prev.start === '17:00' ? preset.start : prev.start,
    }));

  const metric: Metric | undefined = useMemo(() => {
    if (!draft.metricId) return undefined;
    for (const group of groups) {
      const found = group.metrics.find((item) => item.id === draft.metricId);
      if (found) return found;
    }
    return undefined;
  }, [draft.metricId, groups]);

  const unit = amountUnit(metric);
  const patch = (values: Partial<PlanBlock>) => setDraft((prev) => ({ ...prev, ...values }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    onSave({ ...draft, title });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Los de siempre. Rellenan el formulario entero, atadura incluida. */}
      {isNew && presets.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide t-3">De un toque</p>

          {topics.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {topics.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTopic(item.id)}
                  aria-pressed={topic === item.id}
                  className={`btn border px-2.5 py-1 text-xs font-semibold
                    ${
                      topic === item.id
                        ? 'bg-accent-soft border-accent t-1'
                        : 'hairline surf-1 t-2 hover-soft'
                    }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {shown.map((preset) => (
              <button
                key={preset.title}
                type="button"
                onClick={() => applyPreset(preset)}
                className="btn hairline surf-1 t-2 hover-soft border px-2.5 py-1 text-xs"
              >
                <span aria-hidden>{preset.icon}</span>
                {preset.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Qué es */}
      <section className="space-y-3">
        <div className="flex gap-2">
          <label className="shrink-0">
            <span className="sr-only">Emoji</span>
            <input
              value={draft.icon}
              onChange={(event) => patch({ icon: event.target.value.slice(0, 4) })}
              className="field w-16 text-center text-xl"
              aria-label="Emoji del rato"
            />
          </label>
          <label className="flex-1">
            <span className="sr-only">Nombre</span>
            <input
              value={draft.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="Entreno, lectura, cena…"
              className="field w-full"
              autoFocus
              required
              maxLength={60}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-1">
          {QUICK_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => patch({ icon })}
              aria-label={`Usar ${icon}`}
              aria-pressed={draft.icon === icon}
              className={`btn h-9 w-9 min-h-0 p-0 text-base
                ${draft.icon === icon ? 'bg-accent-soft border-accent border' : 'hover-soft'}`}
            >
              {icon}
            </button>
          ))}
        </div>
      </section>

      {/* Cuándo */}
      <section className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">Día</span>
          <select
            value={draft.day}
            onChange={(event) => patch({ day: Number(event.target.value) })}
            className="field w-full"
          >
            {DAY_NAMES.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">Hora</span>
          <input
            type="time"
            value={draft.start}
            onChange={(event) => patch({ start: event.target.value || '17:00' })}
            className="field w-full"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">Dura</span>
          <input
            type="number"
            min={5}
            max={720}
            step={5}
            value={draft.duration}
            onChange={(event) =>
              patch({ duration: Math.max(5, Math.min(720, Number(event.target.value) || 5)) })
            }
            className="field w-full tabular-nums"
          />
        </label>
      </section>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_MINUTES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => patch({ duration: minutes })}
            aria-pressed={draft.duration === minutes}
            className={`btn border px-2.5 py-1 text-xs font-semibold
              ${
                draft.duration === minutes
                  ? 'bg-accent-soft border-accent t-1'
                  : 'hairline surf-1 t-2 hover-soft'
              }`}
          >
            {durationLabel(minutes)}
          </button>
        ))}
      </div>

      {/* De qué va */}
      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide t-3">Tipo</p>
        <div className="flex flex-wrap gap-1.5">
          {PLAN_KIND_LIST.map((kind: PlanKind) => (
            <button
              key={kind}
              type="button"
              onClick={() => patch({ kind })}
              aria-pressed={draft.kind === kind}
              className={`btn border px-2.5 py-1 text-xs font-semibold
                ${
                  draft.kind === kind
                    ? 'bg-accent-soft border-accent t-1'
                    : 'hairline surf-1 t-2 hover-soft'
                }`}
            >
              <span aria-hidden>{PLAN_KINDS[kind].icon}</span>
              {PLAN_KINDS[kind].label}
            </button>
          ))}
        </div>
      </section>

      {/* Con quién: la pregunta de los peques */}
      {kid && (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide t-3">
            ¿Quién está con {profile.name}?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {COMPANION_LIST.map((companion: Companion) => (
              <button
                key={companion}
                type="button"
                onClick={() =>
                  patch({ companion: draft.companion === companion ? undefined : companion })
                }
                aria-pressed={draft.companion === companion}
                className={`btn border px-2.5 py-1 text-xs font-semibold
                  ${
                    draft.companion === companion
                      ? 'bg-accent-soft border-accent t-1'
                      : 'hairline surf-1 t-2 hover-soft'
                  }`}
              >
                <span aria-hidden>{COMPANIONS[companion].icon}</span>
                {COMPANIONS[companion].label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Lo que ata este rato al registro */}
      <section className="rounded-2xl border hairline surf-1 p-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">
            🔗 Hábito con el que se comprueba
          </span>
          <select
            value={draft.metricId ?? ''}
            onChange={(event) =>
              patch({ metricId: event.target.value || undefined, amount: undefined })
            }
            className="field w-full"
          >
            <option value="">Sin atar (no se comprueba)</option>
            {groups.map((group) => (
              <optgroup key={group.categoryLabel} label={`${group.categoryIcon} ${group.categoryLabel}`}>
                {group.metrics.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.icon} {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {unit && (
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">
              Cuánto aporta este rato
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={metric && 'step' in metric ? metric.step : 1}
                value={draft.amount ?? ''}
                onChange={(event) =>
                  patch({
                    amount: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
                placeholder="—"
                className="field w-28 tabular-nums"
              />
              <span className="text-sm t-2">{unit}</span>
              {metric && (metric.type === 'counter' || metric.type === 'duration') && (
                <span className="text-xs t-3">
                  ({targetWord(metric)} del día: {metric.target} {metric.unit})
                </span>
              )}
            </div>
          </label>
        )}

        <p className="mt-2 text-xs leading-relaxed t-3">
          {draft.metricId
            ? 'Con esto, la semana puede decir si lo previsto se cumplió, se quedó corto o se pasó del máximo.'
            : 'Sin hábito atado el rato se apunta igual, pero la agenda no podrá comprobar nada de él.'}
        </p>
      </section>

      {/* Detalle libre */}
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">Nota</span>
        <textarea
          value={draft.note ?? ''}
          onChange={(event) => patch({ note: event.target.value || undefined })}
          rows={2}
          maxLength={240}
          placeholder="Dirección, con qué ropa, quién recoge…"
          className="field w-full resize-none"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary px-4" disabled={!draft.title.trim()}>
          {isNew ? 'Añadir a la semana' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-3 text-sm">
          Cancelar
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="btn-danger ml-auto px-3 text-sm">
            🗑️ Quitar
          </button>
        )}
      </div>
    </form>
  );
}
