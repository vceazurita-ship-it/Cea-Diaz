'use client';

import type { Achievement } from '@/types';

interface AchievementsPanelProps {
  achievements: Achievement[];
  accent: string;
  /** Estilo gamificado (niños) o discreto (adultos). */
  playful?: boolean;
}

export function AchievementsPanel({ achievements, accent, playful = false }: AchievementsPanelProps) {
  return (
    <div className={`grid gap-2 ${playful ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
      {achievements.map((achievement) => (
        <div
          key={achievement.id}
          className={`flex items-center gap-3 rounded-xl border p-3 transition-colors
            ${
              achievement.unlocked
                ? 'border-transparent surf-2'
                : 'hairline surf-1'
            }`}
          style={achievement.unlocked ? { borderColor: `${accent}66` } : undefined}
        >
          <span
            className={`text-2xl ${achievement.unlocked ? 'animate-pop' : 'opacity-30 grayscale'}`}
          >
            {achievement.icon}
          </span>

          <div className="min-w-0 flex-1">
            <p
              className={`truncate text-sm font-bold ${
                achievement.unlocked ? 't-1' : 't-3'
              }`}
            >
              {achievement.label}
            </p>
            <p className="truncate text-[11px] t-3">{achievement.description}</p>

            {!achievement.unlocked && (
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full surf-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(achievement.progress * 100)}%`,
                    backgroundColor: accent,
                    opacity: 0.7,
                  }}
                />
              </div>
            )}
          </div>

          {achievement.unlocked && <span className="shrink-0 text-xs font-black">✓</span>}
        </div>
      ))}
    </div>
  );
}
