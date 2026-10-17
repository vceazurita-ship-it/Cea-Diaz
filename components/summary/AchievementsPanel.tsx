'use client';

import type { Achievement } from '@/types';

interface AchievementsPanelProps {
  achievements: Achievement[];
  /** Estilo gamificado (niños) o discreto (adultos). */
  playful?: boolean;
}

/**
 * Los logros del mes, en fichas de dos en dos. Cuántos van conseguidos lo
 * dice la cabecera de la sección («1/5»): repetirlo aquí era leerlo dos
 * veces. Y en una sola columna cada ficha se comía el ancho entero del móvil
 * para decir tres palabras: los cinco medían casi una pantalla.
 */
export function AchievementsPanel({ achievements, playful = false }: AchievementsPanelProps) {
  return (
    <ul className={`grid grid-cols-2 gap-2 ${playful ? 'sm:grid-cols-3' : 'sm:grid-cols-3 lg:grid-cols-5'}`}>
      {achievements.map((achievement) => {
        const pct = Math.round(achievement.progress * 100);
        return (
          <li
            key={achievement.id}
            className={`flex min-w-0 flex-col gap-1 rounded-xl border p-2.5 transition-colors
              ${achievement.unlocked ? 'border-accent bg-accent-faint' : 'hairline surf-1'}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-xl leading-none ${achievement.unlocked ? 'animate-pop' : 'opacity-30 grayscale'}`}
                aria-hidden
              >
                {achievement.icon}
              </span>
              <p
                className={`min-w-0 flex-1 truncate text-[13px] font-bold ${achievement.unlocked ? 't-1' : 't-3'}`}
              >
                {achievement.label}
              </p>
              {achievement.unlocked && (
                <span className="shrink-0 text-xs font-black t-accent">
                  <span aria-hidden>✓</span>
                  <span className="sr-only">conseguido</span>
                </span>
              )}
            </div>
            {/* Dos líneas y no una cortada: la descripción es lo que dice
                cómo se consigue el logro, y truncada no decía nada. */}
            <p className="line-clamp-2 text-[11px] leading-snug t-3">{achievement.description}</p>

            {!achievement.unlocked && (
              <div className="mt-auto flex items-center gap-2 pt-0.5">
                <span className="h-1 flex-1 overflow-hidden rounded-full track">
                  <span
                    className="block h-full rounded-full bg-accent opacity-70"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="shrink-0 text-[10px] tabular-nums t-3">{pct} %</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
