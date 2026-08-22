'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { useToast } from '@/components/ui/Toast';
import { VoiceField } from '@/components/ui/VoiceField';
import type { HabitStore } from '@/hooks/useHabitStore';
import { MEAL_MOMENTS } from '@/lib/mealPrompt';
import { deletePhotoObject, downloadPhoto, uploadPhoto } from '@/lib/cloud';
import { deletePhoto, loadPhoto, preparePhoto, savePhoto } from '@/lib/photos';
import type {
  DateKey,
  FoodBalance,
  MealAdviceKind,
  MealAnalysis,
  MealMoment,
  MealVerdict,
  Profile,
} from '@/types';

interface MealPhotoCardProps {
  profile: Profile;
  date: DateKey;
  store: HabitStore;
  kid: boolean;
}

const MOMENT_LABEL: Record<MealMoment, { label: string; icon: string }> = {
  desayuno: { label: 'Desayuno', icon: '🥣' },
  comida: { label: 'Comida', icon: '🍽️' },
  merienda: { label: 'Merienda', icon: '🥪' },
  cena: { label: 'Cena', icon: '🌙' },
};

const ADVICE_ICON: Record<MealAdviceKind, string> = {
  aumentar: '⬆️',
  reducir: '⬇️',
  cambiar: '🔄',
  anadir: '➕',
};

const BALANCE_ICON: Record<FoodBalance, string> = {
  bien: '✅',
  justo: '🟡',
  sobra: '⚠️',
  falta: '➕',
};

/** El momento que toca según la hora, para no tener que elegirlo casi nunca. */
function currentMoment(): MealMoment {
  const hour = new Date().getHours();
  if (hour < 11) return 'desayuno';
  if (hour < 16) return 'comida';
  if (hour < 19) return 'merienda';
  return 'cena';
}

const formatScore = (nota: number) => nota.toFixed(1).replace('.', ',');

/* -------------------------------------------------------------------------
 * Miniatura guardada en el dispositivo
 * ----------------------------------------------------------------------- */

function MealThumb({ meal, alt }: { meal: MealAnalysis; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const { photoId, photoPath } = meal;

  useEffect(() => {
    let alive = true;

    const find = async () => {
      // Primero el propio móvil; sólo si no está se baja de la nube y se
      // cachea, para que la siguiente vez sea instantánea y sin datos.
      const local = photoId ? await loadPhoto(photoId) : null;
      if (local) {
        if (alive) setSrc(local);
        return;
      }

      if (!photoPath) return;
      const remote = await downloadPhoto(photoPath);
      if (!remote) return;

      if (photoId) await savePhoto(photoId, remote).catch(() => undefined);
      if (alive) setSrc(remote);
    };

    void find();
    return () => {
      alive = false;
    };
  }, [photoId, photoPath]);

  if (!src) {
    return (
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl surf-2 text-2xl">
        <span aria-hidden>🍽️</span>
      </div>
    );
  }

  // Miniatura local: no pasa por el optimizador de imágenes de Next.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="h-20 w-20 shrink-0 rounded-xl object-cover" />;
}

/* -------------------------------------------------------------------------
 * Una comida analizada
 * ----------------------------------------------------------------------- */

function MealRow({
  meal,
  kid,
  onDelete,
}: {
  meal: MealAnalysis;
  kid: boolean;
  onDelete: () => void;
}) {
  const moment = MOMENT_LABEL[meal.moment];

  return (
    <li className="rounded-2xl border p-3 hairline surf-1">
      <div className="flex gap-3">
        <MealThumb meal={meal} alt={meal.titulo} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide t-3">
                {moment.icon} {moment.label}
              </p>
              <p className="truncate font-bold t-1">{meal.titulo}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ProgressRing ratio={meal.nota / 10} size={52} stroke={6}>
                <span className="text-sm font-black tabular-nums t-1">
                  {formatScore(meal.nota)}
                </span>
              </ProgressRing>
              <button
                type="button"
                onClick={onDelete}
                className="btn-ghost t-danger px-2 py-1 text-xs"
                aria-label={`Borrar ${moment.label.toLowerCase()}`}
              >
                🗑️
              </button>
            </div>
          </div>

          <p className="mt-1 text-xs leading-snug t-2">{meal.resumen}</p>

          {meal.contexto && (
            <p className="mt-1 text-[11px] italic leading-snug t-3">🗣️ {meal.contexto}</p>
          )}
        </div>
      </div>

      {meal.alimentos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {meal.alimentos.map((food) => (
            <li key={food.nombre} className="chip-soft text-[11px]">
              <span aria-hidden>{BALANCE_ICON[food.balance]}</span>
              {food.nombre}
              <span className="t-3">· {food.racion}</span>
            </li>
          ))}
        </ul>
      )}

      {meal.aciertos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {meal.aciertos.map((acierto) => (
            <li key={acierto} className="text-[11px] leading-snug t-2">
              ✅ {acierto}
            </li>
          ))}
        </ul>
      )}

      {meal.ajustes.length > 0 && (
        <ul className={`mt-2 space-y-1.5 rounded-xl p-2 ${kid ? 'surf-2' : 'surf-2'}`}>
          {meal.ajustes.map((ajuste) => (
            <li key={ajuste.texto} className="text-[11px] font-medium leading-snug t-1">
              <span aria-hidden>{ADVICE_ICON[ajuste.tipo]}</span> {ajuste.texto}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------
 * Tarjeta
 * ----------------------------------------------------------------------- */

export function MealPhotoCard({ profile, date, store, kid }: MealPhotoCardProps) {
  const [moment, setMoment] = useState<MealMoment>(currentMoment);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState('');
  // Dos entradas y no una: la de cámara lleva `capture`, que en el móvil abre
  // directamente el objetivo, y la de galería no, que es lo que deja elegir
  // una foto ya hecha. Un mismo `input` no puede hacer las dos cosas.
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const notify = useToast();

  const meals = store.getMeals(profile.id, date);

  const average = useMemo(
    () => (meals.length ? meals.reduce((sum, meal) => sum + meal.nota, 0) / meals.length : null),
    [meals],
  );

  const analyse = async (file: File | undefined) => {
    if (!file) return;

    // Hay móviles que entregan del gestor de archivos cosas que no son
    // imágenes; mejor decirlo aquí que fallar luego al descodificar.
    if (file.type && !file.type.startsWith('image/')) {
      setError('Eso no es una imagen. Elige una foto del plato.');
      return;
    }

    const said = context.trim();

    setError(null);
    setBusy(true);

    try {
      const photo = await preparePhoto(file);
      setPreview(photo.thumb);

      const response = await fetch('/api/plato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: profile.id,
          moment,
          image: photo.analysis,
          mediaType: 'image/jpeg',
          context: said,
          values: store.getEntry(profile.id, date)?.values ?? {},
        }),
      });

      const payload = (await response.json()) as MealVerdict & { error?: string };

      if (!response.ok) {
        setError(payload.error ?? 'No se ha podido analizar la foto.');
        return;
      }

      if (!payload.esComida) {
        setError(payload.resumen || 'Esa foto no parece un plato de comida.');
        return;
      }

      const id = `${profile.id}:${date}:${Date.now()}`;
      const now = new Date().toISOString();
      let photoId: string | undefined = id;

      try {
        await savePhoto(id, photo.thumb);
      } catch {
        // Sin espacio o sin IndexedDB: se guarda el análisis igualmente.
        photoId = undefined;
      }

      // Y a la nube, para que la foto se vea desde los otros móviles.
      const photoPath = (await uploadPhoto(id, photo.thumb)) ?? undefined;

      store.addMeal({
        ...payload,
        id,
        profileId: profile.id,
        date,
        moment,
        contexto: said || undefined,
        photoId,
        photoPath,
        createdAt: now,
        updatedAt: now,
      });

      // Lo contado ya está guardado con la comida: el campo se vacía para que
      // no se cuele en la siguiente foto.
      setContext('');
      notify({ message: `Plato analizado: ${formatScore(payload.nota)} / 10.`, icon: '📷' });
    } catch {
      setError('No se ha podido preparar la foto en este dispositivo.');
    } finally {
      setBusy(false);
      setPreview(null);
      if (cameraInput.current) cameraInput.current.value = '';
      if (galleryInput.current) galleryInput.current.value = '';
    }
  };

  const remove = (meal: MealAnalysis) => {
    store.removeMeal(meal.id);
    notify({
      message: 'Comida borrada.',
      icon: '🗑️',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: () => store.addMeal(meal) },
    });

    // La miniatura se borra al confirmar, no al instante, para que «Deshacer»
    // siga teniendo foto que enseñar.
    window.setTimeout(() => {
      if (store.meals[meal.id]) return; // se ha deshecho
      if (meal.photoId) void deletePhoto(meal.photoId);
      if (meal.photoPath) void deletePhotoObject(meal.photoPath);
    }, 8000);
  };

  return (
    <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide t-2">📷 Foto de la comida</h3>
        {average !== null && (
          <span className="text-xs font-bold tabular-nums t-accent">
            Media del día: {formatScore(average)} / 10
          </span>
        )}
      </div>

      {/* Momento del día */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Momento del día">
        {MEAL_MOMENTS.map((option) => {
          const active = moment === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setMoment(option)}
              aria-pressed={active}
              disabled={busy}
              className={`btn px-3 py-1.5 text-xs font-semibold border
                ${active ? 'bg-accent-soft border-accent t-1' : 'hairline surf-1 t-2 hover-soft'}`}
            >
              <span aria-hidden>{MOMENT_LABEL[option].icon}</span>
              {MOMENT_LABEL[option].label}
            </button>
          );
        })}
      </div>

      {/* Lo que no se ve en la foto */}
      <div className="mb-3">
        <VoiceField
          compact
          label="🗣️ Cuéntalo (opcional)"
          value={context}
          onChange={setContext}
          rows={2}
          disabled={busy}
          dictateLabel="🎙️ Dictar"
          placeholder="Lo que la foto no cuenta: cómo está cocinado, si se lo ha terminado, qué ha bebido…"
          hint="Se manda junto con la foto para afinar la nota y los consejos."
        />
      </div>

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => analyse(event.target.files?.[0])}
      />

      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => analyse(event.target.files?.[0])}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => cameraInput.current?.click()}
          disabled={busy}
          className="btn-primary w-full py-2.5 text-sm"
        >
          {busy ? '⏳ Analizando el plato…' : '📸 Hacer foto del plato'}
        </button>

        <button
          type="button"
          onClick={() => galleryInput.current?.click()}
          disabled={busy}
          className="btn px-3 py-2.5 text-sm font-semibold border hairline surf-1 t-2 hover-soft"
        >
          🖼️ Elegir una del móvil
        </button>
      </div>

      {/* Lo que se está analizando */}
      {busy && preview && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border p-3 hairline surf-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Plato en análisis" className="h-16 w-16 rounded-xl object-cover" />
          <p className="text-xs t-2">
            Mirando el plato y comparándolo con el objetivo de {profile.name}…
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl border p-2.5 text-xs leading-snug border-accent t-1 surf-2">
          ⚠️ {error}
        </p>
      )}

      {meals.length > 0 && (
        <ul className="mt-3 space-y-3">
          {meals.map((meal) => (
            <MealRow key={meal.id} meal={meal} kid={kid} onDelete={() => remove(meal)} />
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-relaxed t-3">
        La nota compara el plato con los objetivos de {profile.name} y es sólo una orientación
        doméstica, no un consejo médico. La foto se envía para analizarla y sólo se guarda una
        miniatura en este dispositivo.
      </p>
    </div>
  );
}
