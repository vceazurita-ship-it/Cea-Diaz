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

      {/* Una fila por ejercicio, separadas por un filete: con una caja para
          cada uno la lista ocupaba el doble sin decir más. */}
      <ul className="divide-y divide-[var(--border)]">
        {tracks.map((track) => (
          <li key={track.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-baseline gap-2">
              <span aria-hidden>{track.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold t-1">{track.label}</span>
                <span className="block text-[11px] t-3">
                  {track.markLabel}
                  {track.bestOn ? ` · mejor, del ${formatShort(track.bestOn)}` : ' · mejor marca'}
                </span>
              </span>
              <span className="shrink-0 font-display text-base font-black tabular-nums t-accent">
                {track.best}
              </span>
            </div>

            {/* Las últimas, de la más reciente a la más antigua, en una fila
                que se desliza. */}
            <ul
              className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5"
              style={{ scrollbarWidth: 'none' }}
              aria-label={`Últimas marcas de ${track.label}`}
            >
              {track.recent.map((entry) => (
                <li
                  key={entry.date}
                  className={`shrink-0 whitespace-nowrap text-[10px] tabular-nums ${
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
