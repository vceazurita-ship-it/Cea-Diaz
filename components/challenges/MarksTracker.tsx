'use client';

import { formatShort } from '@/lib/dates';
import type { MarkTrack } from '@/lib/challenges';

interface MarksTrackerProps {
  tracks: MarkTrack[];
  headingClass: string;
}

/**
 * Las marcas del reparto de gimnasio, sesión a sesión.
 *
 * El reto de la semana dice lo que hay que superar; esto dice de dónde se
 * viene, que es lo que hace falta para saber si la cosa sube o lleva un mes
 * clavada. Las que fueron récord el día que se hicieron van marcadas: leídas
 * de derecha a izquierda cuentan la historia del ejercicio.
 */
export function MarksTracker({ tracks, headingClass }: MarksTrackerProps) {
  if (tracks.length === 0) return null;

  return (
    <div className="card p-4">
      <h3 className={headingClass}>Marcas del reparto</h3>

      <ul className="space-y-2.5">
        {tracks.map((track) => (
          <li key={track.id} className="rounded-xl border p-3 hairline surf-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span aria-hidden>{track.icon}</span>
              <span className="text-sm font-bold t-1">{track.label}</span>
              <span className="text-[11px] t-3">{track.markLabel}</span>
              <span className="ml-auto text-sm font-bold tabular-nums t-accent">
                {track.best}
              </span>
            </div>

            <p className="mt-0.5 text-[11px] t-3">
              {track.bestOn ? `Mejor marca, del ${formatShort(track.bestOn)}.` : 'Mejor marca.'}
            </p>

            {/* Las últimas, de la más reciente a la más antigua. */}
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {track.recent.map((entry) => (
                <li
                  key={entry.date}
                  className={`text-[10px] tabular-nums ${
                    entry.record ? 'chip-accent' : 'chip-soft'
                  }`}
                  title={`${entry.text} · ${formatShort(entry.date)}`}
                >
                  {entry.record && <span aria-hidden>🏆</span>}
                  {entry.text}
                  {/* Sobre el acento, el gris de apoyo no se leería. */}
                  <span className={entry.record ? 'opacity-75' : 't-3'}>
                    {formatShort(entry.date)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-snug t-3">
        Cada sesión pide superar tu mejor marca. El listón sube solo cuando lo pasas, y la
        semana que no salga te espera donde estaba.
      </p>
    </div>
  );
}
