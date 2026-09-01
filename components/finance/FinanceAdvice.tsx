'use client';

import { useMemo, useState } from 'react';

import { financeExpertsOf, financeNotes } from '@/lib/financeExperts';
import type { FinanceBook, FinanceNote } from '@/types';

/* =========================================================================
 *  Lo que la app tiene que decirte de tus cuentas.
 *
 *  Es el hermano de la tarjeta de atención de los hábitos, y con el mismo
 *  criterio: **nada sin cifra**. Un consejo financiero general se lee en
 *  cualquier sitio y no cambia nada; lo que sirve es «el 78 % de lo invertido
 *  está en una sola casa», porque eso sólo lo puede decir quien mira tus
 *  números.
 *
 *  De cada aviso se puede abrir quién lo sostiene, y ahí se distingue lo que
 *  es consenso de lo que es la tesis de un divulgador. No es adorno: la
 *  diferencia entre «esto lo dice todo el mundo» y «esto lo dice éste» es
 *  justo lo que hace falta para decidir cuánto caso hacerle.
 * ========================================================================= */

const TONE: Record<FinanceNote['tone'], { label: string; card: string; chip: string }> = {
  grave: {
    label: 'Urgente',
    card: 'border-[color:var(--danger)]',
    chip: 'bg-[color:var(--danger)] text-white',
  },
  aviso: { label: 'Ojo', card: 'border-accent', chip: 'bg-accent-soft t-1' },
  idea: { label: 'Idea', card: 'hairline', chip: 'surf-2 t-2' },
  bien: { label: 'Bien', card: 'hairline', chip: 'surf-2 t-2' },
};

interface FinanceAdviceProps {
  book: FinanceBook;
}

export function FinanceAdvice({ book }: FinanceAdviceProps) {
  const notes = useMemo(() => financeNotes(book), [book]);
  const [open, setOpen] = useState<string | null>(null);

  if (notes.length === 0) return null;

  return (
    <section className="space-y-2" aria-label="Lo que dicen tus cuentas">
      {notes.map((note) => {
        const tone = TONE[note.tone];
        const experts = financeExpertsOf(note);
        const shown = open === note.id;

        return (
          <article key={note.id} className={`card border p-3 ${tone.card}`}>
            <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span aria-hidden className="text-base">
                {note.icon}
              </span>
              <h3 className="min-w-0 flex-1 text-sm font-bold leading-snug t-1">{note.title}</h3>
              {note.metric && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${tone.chip}`}>
                  {note.metric}
                </span>
              )}
            </header>

            <p className="mt-1.5 text-xs leading-relaxed t-2">{note.detail}</p>

            {experts.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setOpen(shown ? null : note.id)}
                  aria-expanded={shown}
                  className="btn-ghost mt-2 min-h-0 px-2 py-1 text-[11px]"
                >
                  {shown ? '▾ ' : '▸ '}
                  {experts.length === 1 ? 'Quién lo dice' : `Quién lo dice (${experts.length})`}
                </button>

                {shown && (
                  <ul className="mt-1.5 space-y-1.5 border-t pt-2 hairline">
                    {experts.map((expert) => (
                      <li key={expert.id} className="text-[11px] leading-relaxed t-3">
                        <span className="font-semibold t-2">{expert.name}</span>
                        <span
                          className={`ml-1.5 rounded-full px-1.5 text-[10px] font-semibold
                            ${expert.level === 'consenso' ? 'bg-accent-soft t-1' : 'surf-2 t-3'}`}
                        >
                          {expert.level === 'consenso' ? 'consenso' : 'su tesis'}
                        </span>
                        <span className="mt-0.5 block">{expert.role}</span>
                        {expert.caveat && (
                          <span className="mt-0.5 block italic">⚠ {expert.caveat}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </article>
        );
      })}

      <p className="px-1 pt-1 text-[11px] leading-relaxed t-3">
        Esto es un espejo con reglas escritas, no asesoramiento financiero: la app compara tus
        cifras con criterios publicados y te dice dónde se separan. Las decisiones, y el riesgo de
        cada una, siguen siendo tuyos.
      </p>
    </section>
  );
}
