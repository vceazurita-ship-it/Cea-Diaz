'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { VoiceField } from '@/components/ui/VoiceField';
import type { HabitStore } from '@/hooks/useHabitStore';
import { addDays, friendlyDateLabel } from '@/lib/dates';
import type { DateKey, DayAdvice, DayAdviceVerdict, Profile } from '@/types';

interface DayNoteCardProps {
  profile: Profile;
  date: DateKey;
  store: HabitStore;
  kid: boolean;
  /** Registros ya rellenados hoy, para el pie de estado. */
  filled: number;
}

/** Días de historial que se mandan para calibrar la progresión del reto. */
const HISTORY_DAYS = 21;

/* -------------------------------------------------------------------------
 * Reto de la próxima sesión, arrastrado de días anteriores
 * ----------------------------------------------------------------------- */

export function PendingChallengeCard({
  advice,
  kid,
  onDone,
}: {
  advice: DayAdvice;
  kid: boolean;
  onDone: () => void;
}) {
  if (!advice.reto) return null;

  return (
    <div className={`${kid ? 'card-kid' : 'card'} border-accent bg-accent-faint p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip-accent text-[10px] uppercase tracking-wide">
          🏋️ Reto · {advice.reto.ambito}
        </span>
        <span className="text-[11px] t-3">
          de {friendlyDateLabel(advice.date).toLowerCase()}
        </span>
      </div>

      <p className="mt-2 font-bold t-1">{advice.reto.titulo}</p>
      <p className="mt-0.5 text-sm t-2">{advice.reto.detalle}</p>
      <p className="mt-1.5 text-[11px] t-3">📈 Partiendo de: {advice.reto.partiendoDe}</p>

      <button type="button" onClick={onDone} className="btn-primary mt-3 px-3 py-1.5 text-xs">
        ✅ Conseguido
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Consejo ya generado
 * ----------------------------------------------------------------------- */

function AdvicePanel({ advice }: { advice: DayAdvice }) {
  return (
    <div className="mt-3 rounded-2xl border p-3 hairline surf-2">
      <p className="text-[11px] font-bold uppercase tracking-wide t-3">💡 Para mañana</p>
      <p className="mt-1 text-xs italic t-3">{advice.resumen}</p>

      <ul className="mt-2 space-y-1.5">
        {advice.consejos.map((consejo) => (
          <li key={consejo} className="text-sm font-medium leading-snug t-1">
            → {consejo}
          </li>
        ))}
      </ul>

      {advice.reto && (
        <div className="mt-3 rounded-xl border p-2.5 border-accent bg-accent-faint">
          <p className="text-[11px] font-bold uppercase tracking-wide t-accent">
            🏋️ Próxima sesión · {advice.reto.ambito}
          </p>
          <p className="mt-1 text-sm font-bold t-1">{advice.reto.titulo}</p>
          <p className="text-xs t-2">{advice.reto.detalle}</p>
          <p className="mt-1 text-[11px] t-3">📈 Partiendo de: {advice.reto.partiendoDe}</p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Tarjeta
 * ----------------------------------------------------------------------- */

export function DayNoteCard({ profile, date, store, kid, filled }: DayNoteCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // No se pide consejo con el micro abierto: faltaría por llegar el final.
  const [dictating, setDictating] = useState(false);
  const notify = useToast();

  const entry = store.getEntry(profile.id, date);
  const note = entry?.note ?? '';
  const advice = store.getAdvice(profile.id, date);

  const askAdvice = async () => {
    setError(null);
    setBusy(true);

    try {
      const history = Array.from({ length: HISTORY_DAYS }, (_, i) => addDays(date, -(i + 1)))
        .map((day) => ({ date: day, values: store.getEntry(profile.id, day)?.values ?? {} }))
        .filter((day) => Object.keys(day.values).length > 0)
        .reverse();

      const response = await fetch('/api/consejo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: profile.id,
          date,
          observaciones: note,
          // Las notas sueltas de cada categoría cuentan lo que los botones no
          // pueden: van al consejo igual que las observaciones del día.
          notas: entry?.notes ?? {},
          values: entry?.values ?? {},
          history,
          retoPrevio: store.pendingChallenge(profile.id, date)?.reto,
        }),
      });

      const payload = (await response.json()) as DayAdviceVerdict & { error?: string };

      if (!response.ok) {
        setError(payload.error ?? 'No se ha podido generar el consejo.');
        return;
      }

      const now = new Date().toISOString();

      store.setAdvice({
        ...payload,
        id: `${profile.id}:${date}`,
        profileId: profile.id,
        date,
        observaciones: note,
        createdAt: now,
        updatedAt: now,
      });

      notify({
        message: payload.reto ? 'Consejo y reto listos.' : 'Consejo listo.',
        icon: '💡',
      });
    } catch {
      setError('No se ha podido contactar con el servidor.');
    } finally {
      setBusy(false);
    }
  };

  const deleteDay = () => {
    const before = store.snapshot();
    store.clearDay(profile.id, date);
    store.removeAdvice(`${profile.id}:${date}`);
    notify({
      message: `Se ha borrado ${friendlyDateLabel(date).toLowerCase()}.`,
      icon: '🗑️',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: () => store.restore(before) },
    });
  };

  return (
    <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
      <VoiceField
        label="📔 Observaciones del día"
        value={note}
        onChange={(text) => store.setNote(profile.id, date, text)}
        onListeningChange={setDictating}
        placeholder={
          kid
            ? '¿Qué tal el entrenamiento? ¿Qué ha sido lo mejor de hoy?'
            : 'Cómo ha ido cada hábito: entrenamiento, trabajo, sueño, incidencias…'
        }
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={askAdvice}
          disabled={busy || dictating}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {busy ? '⏳ Pensando…' : advice ? '🔁 Rehacer el consejo' : '💡 Consejo para mañana'}
        </button>

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

      {error && <p className="mt-2 text-xs t-danger">⚠️ {error}</p>}

      {advice && <AdvicePanel advice={advice} />}
    </div>
  );
}
