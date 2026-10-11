'use client';

import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { useToast } from '@/components/ui/Toast';
import { NoteField } from '@/components/ui/NoteField';
import type { HabitStore } from '@/hooks/useHabitStore';
import { friendlyDateLabel } from '@/lib/dates';
import type { DateKey, Profile } from '@/types';

interface DayNoteCardProps {
  profile: Profile;
  date: DateKey;
  store: HabitStore;
  kid: boolean;
  /** Registros ya rellenados hoy, para el pie de estado. */
  filled: number;
}

export function DayNoteCard({ profile, date, store, kid, filled }: DayNoteCardProps) {
  const notify = useToast();

  const entry = store.getEntry(profile.id, date);
  const note = entry?.note ?? '';

  // «Guardado» decía sólo lo del navegador; si la nube iba mal, nadie se
  // enteraba aquí. Se añade en qué estado está lo de casa.
  const nube =
    !store.cloud.configured || store.cloud.status === 'off'
      ? ''
      : store.cloud.status === 'synced'
        ? ' · en la nube'
        : store.cloud.status === 'syncing'
          ? ' · subiendo'
          : store.cloud.status === 'error'
            ? ' · ⚠️ la nube falló'
            : ' · sólo en este aparato';

  const deleteDay = () => {
    const before = store.snapshot();
    store.clearDay(profile.id, date);
    notify({
      message: `Se ha borrado ${friendlyDateLabel(date).toLowerCase()}.`,
      icon: '🗑️',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: () => store.restore(before) },
    });
  };

  return (
    <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
      <NoteField
        label="📔 Observaciones del día"
        value={note}
        onChange={(text) => store.setNote(profile.id, date, text)}
        placeholder={
          kid
            ? '¿Qué tal el entrenamiento? ¿Qué ha sido lo mejor de hoy?'
            : 'Cómo ha ido cada hábito: entrenamiento, trabajo, sueño, incidencias…'
        }
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="text-xs t-3" aria-live="polite">
          {!entry
            ? 'Aún no hay registros para este día.'
            : store.status === 'saving'
              ? '⏳ Guardando…'
              : store.status === 'error'
                ? '⚠️ No se ha podido guardar en este navegador.'
                : `✓ Guardado aquí · ${filled} ${filled === 1 ? 'registro' : 'registros'}${nube}`}
        </p>

        {entry && (
          <span className="ml-auto">
            <ConfirmButton
              question={`¿Borrar todo lo de ${friendlyDateLabel(date).toLowerCase()}?`}
              onConfirm={deleteDay}
              className="btn-ghost t-danger px-2.5 py-1.5 text-xs"
              confirmLabel="Sí, borrar"
            >
              🗑️ Borrar el día
            </ConfirmButton>
          </span>
        )}
      </div>
    </div>
  );
}
