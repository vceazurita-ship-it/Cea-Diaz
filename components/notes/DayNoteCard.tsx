'use client';

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
              : `✓ Guardado · ${filled} ${filled === 1 ? 'registro' : 'registros'}`}
        </p>

        {entry && (
          <button
            type="button"
            onClick={deleteDay}
            className="btn-ghost t-danger ml-auto px-2.5 py-1.5 text-xs"
          >
            🗑️ Borrar el día
          </button>
        )}
      </div>
    </div>
  );
}
