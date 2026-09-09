'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { DayChips } from '@/components/planner/DayChips';
import {
  COMPANIONS,
  COMPANION_LIST,
  DAY_NAMES,
  MAX_LINKS,
  PLAN_KINDS,
  PLAN_KIND_LIST,
  amountForDuration,
  amountScale,
  amountUnit,
  blockFromPreset,
  blockLinks,
  clashing,
  durationLabel,
  linkableMetrics,
  minutesOf,
  overlap,
  presetGroupsOf,
  presetsOf,
  simultaneous,
  timeOf,
  withLinks,
} from '@/lib/planner';
import type { PlanPreset, PresetGroupId } from '@/lib/planner';
import { targetWord } from '@/lib/scoring';
import type {
  Companion,
  Metric,
  PlanBlock,
  PlanKind,
  PlanLink,
  Profile,
  WeekPlan,
} from '@/types';

/* =========================================================================
 *  Alta y edición de un rato de la semana.
 *
 *  Lo que decide si esta pantalla sirve o estorba es el orden: primero los
 *  ratos de siempre —un toque y está—, y sólo debajo el formulario para el
 *  que no encaje en ninguno. Y al final, lo que ata la agenda al registro:
 *  de qué hábito es este rato y cuánto pretende aportar.
 *
 *  Tres cosas la hacen rápida de verdad:
 *
 *   · el **buscador** de los ratos de siempre, porque con sesenta en el
 *     catálogo elegir pestaña y repasar botones ya es más lento que teclear
 *     «anál»;
 *   · los **días marcados a la vez**: el cole son cinco días y la cena son
 *     siete, y apartarlos uno a uno es escribir lo mismo cinco veces;
 *   · el **aviso de solape** antes de guardar, que es cuando todavía se
 *     puede cambiar la hora sin volver a abrir nada.
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
  /** La semana entera: de ahí salen el aviso de solape y la carga de cada día. */
  plan: WeekPlan;
  /** Al guardar uno nuevo pueden salir varios: uno por día marcado. */
  onSave: (block: PlanBlock, days: number[]) => void;
  /**
   * El autoguardado. Se llama solo, un momento después de dejar de teclear,
   * con el rato tal y como está: es lo que hace que cerrar sin darle a
   * «Guardar» ya no pierda nada.
   */
  onAutoSave?: (block: PlanBlock, days: number[]) => void;
  /** Cuándo se guardó solo por última vez, para poder decirlo. */
  savedAt?: number | null;
  onDelete?: () => void;
  /** Abre la hoja de copiar; sólo tiene sentido en un rato que ya existe. */
  onCopy?: () => void;
  /** Devuelve la agenda a como estaba al abrir el editor. */
  onRevert?: () => void;
  onCancel: () => void;
}

export function BlockEditor({
  profile,
  block,
  isNew,
  plan,
  onSave,
  onAutoSave,
  savedAt,
  onDelete,
  onCopy,
  onRevert,
  onCancel,
}: BlockEditorProps) {
  const [draft, setDraft] = useState<PlanBlock>(block);
  /** Días en los que se apartará. Editando uno que ya existe, siempre el suyo. */
  const [days, setDays] = useState<number[]>([block.day]);
  const [query, setQuery] = useState('');
  const kid = profile.kind === 'kid';

  const presets = presetsOf(profile.id);
  const topics = useMemo(() => presetGroupsOf(profile.id), [profile.id]);
  const groups = useMemo(() => linkableMetrics(profile.id), [profile.id]);

  // Qué tema está abierto. Sin temas —Familia, Pareja— no se usa: la lista va
  // corrida, como estaba.
  const [topic, setTopic] = useState<PresetGroupId | null>(topics[0]?.id ?? null);

  /**
   * Los ratos de siempre que se enseñan. Buscando se busca en todos, no sólo
   * en el tema abierto: quien teclea «análisis» no quiere acordarse de en qué
   * pestaña estaba.
   */
  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (text) {
      return presets.filter((preset) => preset.title.toLowerCase().includes(text));
    }
    if (topics.length === 0) return presets;
    return topics.find((item) => item.id === topic)?.presets ?? [];
  }, [presets, query, topic, topics]);

  /**
   * Un toque rellena el formulario entero, atadura incluida. Respeta la hora
   * si ya se había tocado: la que trae el rato de siempre es sólo la propuesta
   * de partida, y quien ha abierto el editor sobre las nueve la quiere a las
   * nueve.
   */
  const applyPreset = (preset: PlanPreset) =>
    setDraft((prev) => ({
      ...blockFromPreset(preset, prev.day, profile.id),
      id: prev.id,
      start: prev.start === '17:00' ? preset.start : prev.start,
      note: prev.note,
    }));

  /** Los hábitos atables, por identificador: hace falta dentro de `patch`. */
  const byId = useMemo(() => {
    const index = new Map<string, Metric>();
    for (const group of groups) for (const item of group.metrics) index.set(item.id, item);
    return index;
  }, [groups]);

  /** Los hábitos de este rato, el principal el primero. */
  const links = useMemo(() => blockLinks(draft), [draft]);

  /**
   * Cualquier cambio del formulario pasa por aquí, y aquí es donde la cantidad
   * prevista sigue al reloj: subir la lectura de veinte a cuarenta minutos
   * sube lo previsto sin tener que acordarse de bajar a corregirlo. Deja de
   * hacerlo en cuanto la cifra se escribe a mano, que es lo que pone
   * `amountLock`, y vale para los tres hábitos de un rato igual que valía
   * para uno.
   */
  const patch = (values: Partial<PlanBlock>) =>
    setDraft((prev) => {
      const next = { ...prev, ...values };
      const tied = blockLinks(next).map((link) => {
        if (link.amountLock) return link;
        const item = byId.get(link.metricId);
        if (!item || amountScale(item) === null) return link;
        return { ...link, amount: amountForDuration(item, next.duration) };
      });
      return withLinks(next, tied);
    });

  /** Añadir, quitar o retocar un hábito del rato. */
  const setLinks = (next: PlanLink[]) => patch(withLinks(draft, next));

  /* -------------------------------------------------------- autoguardado */

  /**
   * El rato se guarda solo poco después de dejar de tocarlo.
   *
   * Es la respuesta a la única forma segura de perder trabajo aquí: montar la
   * tarde entera, cerrar la hoja de un manotazo y descubrir que nada de eso
   * existía porque faltaba el botón. Ahora existe desde el primer momento en
   * que tiene nombre; «Guardar» pasa a ser lo que cierra, no lo que salva.
   *
   * Espera un momento a propósito: guardar en cada tecla escribiría la agenda
   * entera veinte veces por palabra, y la nube detrás.
   */
  const armed = useRef(false);
  /**
   * El guardado, en una caja que no cambia de identidad.
   *
   * Es lo que impide la pescadilla: guardar cambia la agenda, cambiar la
   * agenda vuelve a pintar la pantalla de la semana, y si el efecto mirara la
   * función que llega de allí —nueva en cada pintada— volvería a armar el
   * reloj y a guardar, cada novecientos milisegundos, para siempre.
   */
  const save = useRef(onAutoSave);
  save.current = onAutoSave;

  /** Lo último que se dejó guardado, para no repetir la misma escritura. */
  const written = useRef('');

  useEffect(() => {
    if (!save.current) return;
    // El primer repaso es el de abrir la hoja: ahí no hay nada que guardar.
    if (!armed.current) {
      armed.current = true;
      return;
    }

    const title = draft.title.trim();
    if (!title) return;

    const targets = isNew ? (days.length > 0 ? days : [draft.day]) : [draft.day];
    const signature = JSON.stringify([draft, targets]);
    if (signature === written.current) return;

    const timer = window.setTimeout(() => {
      written.current = signature;
      save.current?.({ ...draft, title }, targets);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [draft, days, isNew]);

  const counts = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].map((day) => plan.blocks.filter((item) => item.day === day).length),
    [plan],
  );

  /** Termina a las…: la cuenta que nadie quiere hacer de cabeza. */
  const ends = timeOf(minutesOf(draft.start) + draft.duration);

  /**
   * Con qué **chocaría**, día por día. Se dice antes de guardar, no después.
   *
   * Lo que cabe entero dentro de otro rato no cuenta como choque: la natación
   * es en el propio colegio y las dos cosas pasan de verdad. Eso se dice
   * aparte, en gris, para que se vea que la agenda lo ha entendido así.
   */
  const clashes = useMemo(() => {
    const out: Array<{ day: number; title: string }> = [];

    for (const day of isNew ? days : [draft.day]) {
      const candidate = { ...draft, day };
      const hit = plan.blocks.find((item) => item.id !== draft.id && clashing(item, candidate));
      if (hit) out.push({ day, title: hit.title || 'otro rato' });
    }

    return out;
  }, [days, draft, isNew, plan.blocks]);

  /** Y con qué convive a propósito: lo que lo envuelve o lo que lleva dentro. */
  const alongside = useMemo(() => {
    const out: Array<{ day: number; title: string }> = [];

    for (const day of isNew ? days : [draft.day]) {
      const candidate = { ...draft, day };
      const hit = plan.blocks.find(
        (item) => item.id !== draft.id && overlap(item, candidate) && simultaneous(item, candidate),
      );
      if (hit) out.push({ day, title: hit.title || 'otro rato' });
    }

    return out;
  }, [days, draft, isNew, plan.blocks]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;

    const targets = isNew ? (days.length > 0 ? days : [draft.day]) : [draft.day];
    onSave({ ...draft, title, day: targets[0] }, targets);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Los de siempre. Rellenan el formulario entero, atadura incluida. */}
      {isNew && presets.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wide t-3">De un toque</p>
            <label className="ml-auto min-w-0 flex-1 sm:max-w-[220px]">
              <span className="sr-only">Buscar entre los ratos de siempre</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="🔎 Buscar…"
                className="field w-full py-1.5 text-xs"
              />
            </label>
          </div>

          {topics.length > 0 && !query.trim() && (
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
                title={
                  preset.metricId
                    ? `${durationLabel(preset.duration)} · atado a un hábito`
                    : `${durationLabel(preset.duration)} · sin hábito atado`
                }
                className={`btn border px-2.5 py-1 text-xs
                  ${
                    draft.title === preset.title
                      ? 'bg-accent-soft border-accent t-1'
                      : 'hairline surf-1 t-2 hover-soft'
                  }`}
              >
                <span aria-hidden>{preset.icon}</span>
                {preset.title}
                {preset.metricId && (
                  <span aria-hidden className="opacity-50">
                    🔗
                  </span>
                )}
              </button>
            ))}

            {shown.length === 0 && (
              <p className="text-xs t-3">
                Nada con ese nombre. Escríbelo abajo y se aparta igual.
              </p>
            )}
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
      <section className="space-y-3">
        {isNew ? (
          <DayChips
            value={days}
            onChange={setDays}
            today={undefined}
            counts={counts}
            label={days.length > 1 ? `Días (${days.length})` : 'Días'}
          />
        ) : (
          <label className="block sm:max-w-[220px]">
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
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide t-3">Hora</span>
            <input
              type="time"
              value={draft.start}
              onChange={(event) => patch({ start: event.target.value || '17:00' })}
              className="field w-full tabular-nums"
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

          <div className="flex items-end">
            <p className="pb-2 text-xs t-3">
              Termina a las <strong className="tabular-nums t-2">{ends}</strong>
            </p>
          </div>
        </div>

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

        {clashes.length > 0 && (
          <div className="rounded-xl border p-2.5 hairline surf-2">
            <p className="text-xs leading-relaxed t-2">
              ⏱️ Se pisa con «{clashes[0].title}»
              {clashes.length === 1
                ? ` el ${DAY_NAMES[clashes[0].day].toLowerCase()}`
                : ` y con otros ${clashes.length - 1}`}
              . Puedes guardarlo igual, pero uno de los dos no va a pasar.
            </p>
            {/* Salvo que pasen los dos de verdad, que es lo normal en cuanto
                una actividad es dentro de otra: la natación es en el propio
                colegio. Un toque aquí y la agenda deja de corregir algo que
                no está mal. */}
            <button
              type="button"
              onClick={() => patch({ overlapOk: true })}
              className="btn-ghost mt-2 min-h-0 px-2 py-1 text-[11px]"
            >
              🔀 Pasan los dos a la vez
            </button>
          </div>
        )}

        {clashes.length === 0 && alongside.length > 0 && (
          <p className="rounded-xl border p-2.5 text-xs leading-relaxed hairline surf-1 t-3">
            🔀 Va a la vez que «{alongside[0].title}»
            {alongside.length > 1 ? ` y otros ${alongside.length - 1}` : ''}, y así se pinta: uno
            encima del otro, sin marcarlo como fallo.
          </p>
        )}

        {/* Y a mano, para lo que se solapa a medias: la reunión que empieza
            antes de que acabe la clase, el partido que se cruza con la
            comida. */}
        <label className="flex items-start gap-2 rounded-xl border p-2.5 hairline surf-1">
          <input
            type="checkbox"
            checked={draft.overlapOk === true}
            onChange={(event) => patch({ overlapOk: event.target.checked || undefined })}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--accent)]"
          />
          <span className="min-w-0">
            <span className="block text-xs font-bold t-1">🔀 Puede pasar a la vez que otra cosa</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed t-3">
              Para lo que ocurre dentro de otro rato o a caballo de él —la natación, que es en el
              propio colegio—. Se sigue viendo en su hora, encima de lo otro, pero deja de contar
              como un solape que hay que arreglar.
            </span>
          </span>
        </label>
      </section>

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

          {/* Esto ya no se queda aquí dentro: es lo que hace que el rato salga
              en la agenda de quien lo lleva. Merece decirse donde se elige. */}
          <p className="mt-2 text-[11px] leading-relaxed t-3">
            {draft.companion === 'mama'
              ? 'Con esto, el rato sale también en la semana de María, en su hora.'
              : draft.companion === 'papa'
                ? 'Con esto, el rato sale también en la semana de Víctor, en su hora.'
                : draft.companion === 'ambos'
                  ? 'Con esto, el rato sale en la semana de María y en la de Víctor, en su hora.'
                  : 'Lo que marques con mamá o con papá sale también en la semana de ellos, para que se vea de un vistazo quién lleva qué.'}
          </p>
        </section>
      )}

      {/* Lo que ata este rato al registro. Puede ser más de una cosa: el
          entreno es fútbol y es la hora de movimiento del día. */}
      <section className="rounded-2xl border hairline surf-1 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide t-3">
          🔗 Hábitos que este rato alimenta
        </p>

        {links.length === 0 ? (
          <p className="mb-2 text-xs leading-relaxed t-3">
            Sin ninguno, el rato se aparta igual, pero la agenda no podrá comprobar nada de él.
          </p>
        ) : (
          <ul className="mb-2 space-y-2">
            {links.map((link, index) => (
              <LinkRow
                key={link.metricId}
                link={link}
                metric={byId.get(link.metricId)}
                main={index === 0}
                duration={draft.duration}
                onChange={(next) =>
                  setLinks(links.map((item, i) => (i === index ? next : item)))
                }
                onRemove={() => setLinks(links.filter((_, i) => i !== index))}
                onPromote={() =>
                  setLinks([link, ...links.filter((_, i) => i !== index)])
                }
              />
            ))}
          </ul>
        )}

        {links.length < MAX_LINKS && (
          <label className="block">
            <span className="sr-only">Añadir un hábito a este rato</span>
            <select
              value=""
              onChange={(event) => {
                const id = event.target.value;
                if (id) setLinks([...links, { metricId: id }]);
              }}
              className="field w-full"
            >
              <option value="">
                {links.length === 0 ? '＋ Atar a un hábito…' : '＋ Añadir otro hábito…'}
              </option>
              {groups.map((group) => {
                const free = group.metrics.filter(
                  (item) => !links.some((link) => link.metricId === item.id),
                );
                if (free.length === 0) return null;

                return (
                  <optgroup
                    key={group.categoryLabel}
                    label={`${group.categoryIcon} ${group.categoryLabel}`}
                  >
                    {free.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.icon} {item.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
        )}

        <p className="mt-2 text-xs leading-relaxed t-3">
          {links.length === 0
            ? 'Un rato atado es un rato que la semana puede comprobar: dirá si se cumplió, si se quedó corto o si se pasó del máximo.'
            : links.length === 1
              ? 'Puedes atarle más de uno: el entreno es «he ido» y es, además, la hora de movimiento del día. Cada uno lleva su propia cantidad.'
              : `Este rato da por buenos ${links.length} hábitos a la vez. Se comprueban por separado, y el rato sale bien cuando salen todos.`}
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

      <div className="space-y-2 border-t pt-3 hairline">
        {/* Que se guarda solo hay que decirlo donde antes estaba el miedo a
            perderlo: al lado del botón. */}
        {onAutoSave && (
          <p className="text-[11px] leading-relaxed t-3" aria-live="polite">
            {savedAt
              ? '💾 Guardado solo. Puedes cerrar cuando quieras.'
              : draft.title.trim()
                ? '💾 Se guarda solo en cuanto dejes de escribir.'
                : '💾 Ponle nombre y empieza a guardarse solo.'}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary px-4" disabled={!draft.title.trim()}>
            {isNew
              ? days.length > 1
                ? `Apartar en ${days.length} días`
                : 'Añadir a la semana'
              : 'Listo'}
          </button>

          {/* Con autoguardado, «cancelar» ya no es no guardar: es deshacer. Se
              dice con esa palabra para no prometer algo que no se cumple. */}
          {onAutoSave && savedAt && onRevert ? (
            <button type="button" onClick={onRevert} className="btn-ghost px-3 text-sm">
              ↩️ Deshacer los cambios
            </button>
          ) : (
            <button type="button" onClick={onCancel} className="btn-ghost px-3 text-sm">
              Cancelar
            </button>
          )}

          {onCopy && (
            <button type="button" onClick={onCopy} className="btn-ghost px-3 text-sm">
              ⧉ Copiar o mover
            </button>
          )}

          {onDelete && (
            <button type="button" onClick={onDelete} className="btn-danger ml-auto px-3 text-sm">
              🗑️ Quitar
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------------------
 * Un hábito del rato
 *
 * Cada fila es una casilla del registro que este rato da por trabajada, con
 * lo que pretende aportarle. La primera manda: es la que da nombre al rato en
 * el resto de la app, y por eso se puede ascender otra a ese sitio sin tener
 * que quitarlas todas y volver a ponerlas.
 * ------------------------------------------------------------------------- */

interface LinkRowProps {
  link: PlanLink;
  metric: Metric | undefined;
  /** `true` en el hábito principal. */
  main: boolean;
  /** Lo que dura el rato: de ahí sale la cantidad cuando la lleva el reloj. */
  duration: number;
  onChange: (link: PlanLink) => void;
  onRemove: () => void;
  onPromote: () => void;
}

function LinkRow({ link, metric, main, duration, onChange, onRemove, onPromote }: LinkRowProps) {
  const unit = amountUnit(metric);
  /** `true` cuando el hábito se mide en tiempo y la cantidad puede ir sola. */
  const clock = amountScale(metric) !== null;

  return (
    <li className="rounded-xl border p-2.5 hairline surf-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base">
          {metric?.icon ?? '🔗'}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold t-1">
            {metric?.label ?? 'Hábito que ya no existe'}
          </span>
          {main && (
            <span className="block text-[10px] uppercase tracking-wide t-3">
              Principal · da nombre al rato
            </span>
          )}
        </span>

        {!main && (
          <button
            type="button"
            onClick={onPromote}
            title="Hacerlo el principal"
            className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
          >
            ⬆︎
          </button>
        )}

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${metric?.label ?? 'este hábito'} del rato`}
          className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
        >
          ✕
        </button>
      </div>

      {unit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            step={metric && 'step' in metric ? metric.step : 1}
            value={link.amount ?? ''}
            onChange={(event) =>
              onChange({
                ...link,
                amount: event.target.value === '' ? undefined : Number(event.target.value),
                // Escribirla a mano es decir que esta cifra manda: a partir de
                // aquí, estirar el rato ya no la toca.
                amountLock: clock ? true : undefined,
              })
            }
            placeholder="—"
            className="field w-24 py-1.5 tabular-nums"
            aria-label={`Cuánto aporta a ${metric?.label ?? 'este hábito'}`}
          />
          <span className="text-xs t-2">{unit}</span>

          {metric && (metric.type === 'counter' || metric.type === 'duration') && (
            <span className="text-[11px] t-3">
              ({targetWord(metric)} del día: {metric.target} {metric.unit})
            </span>
          )}

          {clock && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px]
                ${link.amountLock ? 'surf-3 t-2' : 'bg-accent-soft t-1'}`}
            >
              {link.amountLock ? '✏️ a mano' : '⏱️ lo lleva el reloj'}
            </span>
          )}

          {clock && link.amountLock && metric && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...link,
                  amountLock: undefined,
                  amount: amountForDuration(metric, duration),
                })
              }
              className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
            >
              ⏱️ Que lo lleve el reloj
            </button>
          )}
        </div>
      )}
    </li>
  );
}
