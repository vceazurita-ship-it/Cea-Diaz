'use client';

import type { Achievement } from '@/types';

interface AchievementsPanelProps {
  achievements: Achievement[];
  /** Estilo gamificado (niños) o discreto (adultos). */
  playful?: boolean;
}

export function AchievementsPanel({ achievements, playful = false }: AchievementsPanelProps) {
  const unlocked = achievements.filter((a) => a.unlocked).length;

  return (
    <div>
      <p className="mb-3 text-xs t-3">
        {unlocked} de {achievements.length} conseguidos este mes.
      </p>

      <div className={`grid gap-2 ${playful ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
        {achievements.map((achievement) => (
          <div
            key={achievement.id}
            className={`flex items-center gap-3 rounded-xl border p-3 transition-colors
              ${achievement.unlocked ? 'border-accent bg-accent-faint' : 'hairline surf-1'}`}
          >
            <span
              className={`text-2xl ${achievement.unlocked ? 'animate-pop' : 'opacity-30 grayscale'}`}
              aria-hidden
            >
              {achievement.icon}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-bold ${achievement.unlocked ? 't-1' : 't-3'}`}
              >
                {achievement.label}
              </p>
              <p className="truncate text-[11px] t-3">{achievement.description}</p>

              {!achievement.unlocked && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full track">
                    <span
                      className="block h-full rounded-full bg-accent opacity-70"
                      style={{ width: `${Math.round(achievement.progress * 100)}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums t-3">
                    {Math.round(achievement.progress * 100)} %
                  </span>
                </div>
              )}
            </div>

            {achievement.unlocked && (
              <span className="shrink-0 text-xs font-black t-accent" aria-label="conseguido">
                ✓
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
