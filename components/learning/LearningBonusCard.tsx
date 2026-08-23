'use client';

import type { DailyLearning } from '@/types';

/* =========================================================================
 *  El bonus de aprendizaje del día.
 *
 *  Una sola cosa útil, sacada de donde esa persona está poniendo el interés.
 *  Los de los peques y los de Víctor llegan en inglés y traen debajo las
 *  palabras nuevas: el bonus enseña dos cosas a la vez.
 * ========================================================================= */

interface LearningBonusCardProps {
  learning: DailyLearning;
  kid: boolean;
}

export function LearningBonusCard({ learning, kid }: LearningBonusCardProps) {
  const { bonus, topicLabel, topicIcon, fromInterest } = learning;
  const english = bonus.lang === 'en';

  return (
    <section
      className={`${kid ? 'card-kid' : 'card'} border-accent bg-accent-faint p-4`}
      aria-label="Bonus de aprendizaje del día"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip-accent text-[10px] uppercase tracking-wide">
          🎁 Bonus del día
        </span>

        <span className="chip-soft text-[10px]">
          {topicIcon} {topicLabel}
        </span>

        {english && (
          <span className="chip-soft text-[10px] font-black uppercase tracking-wide">
            🇬🇧 In English
          </span>
        )}
      </div>

      <div className="mt-3 flex items-start gap-3">
        <span className="shrink-0 text-3xl leading-none" aria-hidden>
          {bonus.icon}
        </span>

        <div className="min-w-0">
          <h3 className={`font-bold t-1 ${kid ? 'text-base' : 'text-sm'}`}>{bonus.title}</h3>
          <p className="mt-1 text-sm leading-snug t-2">{bonus.body}</p>
        </div>
      </div>

      <p className="mt-3 rounded-xl border p-2.5 text-[13px] font-semibold leading-snug hairline surf-1 t-1">
        👉 {bonus.apply}
      </p>

      {/* Las palabras nuevas, para no tener que buscarlas fuera. */}
      {bonus.gloss && (
        <p className="mt-2 text-[11px] leading-relaxed t-3">
          <span className="font-bold uppercase tracking-wide">Vocabulario · </span>
          {bonus.gloss}
        </p>
      )}

      <p className="mt-2 text-[11px] t-3">
        {fromInterest
          ? `Sale de ${topicLabel.toLowerCase()}: es donde más se está registrando estos días.`
          : 'En cuanto haya unos días registrados, el bonus se ajustará a lo que más se mire.'}
      </p>
    </section>
  );
}
