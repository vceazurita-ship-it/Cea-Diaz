'use client';

import { useMemo, useRef, useState } from 'react';
import { Question } from '@/components/games/DailyGameCard';
import { Material } from '@/components/games/Material';
import { Modal } from '@/components/ui/Modal';
import { isToday } from '@/lib/dates';
import {
  FUTBOL_ENERGIA,
  FUTBOL_PASS,
  buildRetoFutbol,
  futbolResultFor,
  futbolSuperado,
  type FutbolResult,
} from '@/lib/retoFutbol';
import type { DateKey, DayEntry, Profile } from '@/types';

/* =========================================================================
 *  El reto de fútbol del día: cinco preguntas de la última tecnificación.
 *
 *  Lo que se hizo el viernes en el campo, repasado cada día de la semana
 *  siguiente con la pizarra delante. Superado, la tanda de penaltis de hoy
 *  empieza con un rayo más de energía.
 * ========================================================================= */

interface FutbolRetoCardProps {
  profile: Profile;
  date: DateKey;
  entries: Record<string, DayEntry>;
  kid: boolean;
  /** Como en las demás tarjetas; aquí el titular va encima de la pizarra. */
  headingClass?: string;
  onResult: (result: FutbolResult) => void;
}

export function FutbolRetoCard({ profile, date, entries, kid, onResult }: FutbolRetoCardProps) {
  const reto = useMemo(() => buildRetoFutbol(profile.id, date), [profile.id, date]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [practica, setPractica] = useState<{ vuelta: number; index: number; chosen: string | null; aciertos: number } | null>(null);
  const anotada = useRef(-1);
  const practicaReto = useMemo(
    () => (practica ? buildRetoFutbol(profile.id, date, practica.vuelta) : null),
    [practica?.vuelta, profile.id, date], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!reto) return null;

  const total = reto.questions.length;
  const result = futbolResultFor(entries, profile.id, date);
  const answered = result?.answered ?? 0;
  const correct = result?.correct ?? 0;
  const done = answered >= total;
  const won = futbolSuperado(result);
  const today = isToday(date);
  const s = reto.sesion;

  const answer = (optionId: string) => {
    if (chosen || anotada.current === answered) return;
    anotada.current = answered;
    setChosen(optionId);
    const hit = optionId === reto.questions[index].answer;
    onResult({ sesion: s.id, correct: correct + (hit ? 1 : 0), answered: answered + 1, total, at: new Date().toISOString() });
  };

  return (
    <>
      <div className={`${kid ? 'card-kid' : 'card'} overflow-hidden p-0`}>
        {/* La pizarra, a sangre y recortada a una franja: el titular y la
            sesión van encima, con su velo, en vez de repetirse debajo. */}
        <div className="relative h-32 overflow-hidden bg-[#15803d]">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 [&_svg]:max-h-none [&_svg]:rounded-none">
            <Material visual={{ tipo: 'campo', jugada: 'perfil' }} resuelto={false} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
          <div className="absolute inset-x-3 top-2.5 flex items-center gap-1.5">
            <h3 className="rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
              ⚽ Reto de fútbol
            </h3>
            {won && (
              <span className="ml-auto animate-latido rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#241a14]">
                +{FUTBOL_ENERGIA} ⚡ en la tanda
              </span>
            )}
          </div>
          <div className="absolute inset-x-3 bottom-2.5 text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/75">Tecnificación</p>
            <p className="font-display text-lg font-black leading-tight drop-shadow">Sesión «{s.titulo}»</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {s.bloques.map((b) => (
                <span key={b.nombre} className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-sm">
                  {b.nombre} · {b.minutos}′
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="p-3 sm:p-4">
          {!today ? (
            <p className="text-[11px] t-3">{result ? `Ese día: ${correct}/${total}.` : 'El reto se juega el mismo día.'}</p>
          ) : !done ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-[10rem] flex-1 text-[11px] font-semibold leading-snug t-2">
                🧠 {FUTBOL_PASS} de {total} bien y empiezas la tanda de hoy con un rayo más de energía ⚡.
              </p>
              <button
                type="button"
                onClick={() => {
                  setIndex(answered);
                  setChosen(null);
                  setOpen(true);
                }}
                className="btn-primary shrink-0 px-4 text-sm"
              >
                {answered > 0 ? `⏵ Seguir (vas por la ${answered + 1})` : '▶️ Jugar'}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className={`min-w-[10rem] flex-1 rounded-xl border p-2 text-[12px] font-bold leading-snug ${won ? 'border-accent bg-accent-faint t-1' : 'hairline surf-1 t-2'}`}>
                {won
                  ? `⚡ ${correct}/${total}: la tanda de hoy empieza con un rayo más de energía.`
                  : `💪 ${correct}/${total}: hacían falta ${FUTBOL_PASS}. Mañana, más preguntas de la sesión.`}
              </p>
              <button
                type="button"
                onClick={() => setPractica({ vuelta: (practica?.vuelta ?? 0) + 1, index: 0, chosen: null, aciertos: 0 })}
                className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
              >
                🧺 Practicar, sin nota
              </button>
            </div>
          )}
        </div>
      </div>

      {open && (
        <Modal title="⚽ Reto de fútbol" size="lg" onClose={() => setOpen(false)}>
          {index >= total ? (
            <div className="space-y-3 text-center">
              <p className="text-5xl">{won ? '⚡' : '💪'}</p>
              <p className="font-display text-xl font-black t-1">
                {correct}/{total}
              </p>
              <p className="text-sm t-2">
                {won
                  ? 'Superado: en la tanda de penaltis de hoy tienes un rayo más de energía para los tiros especiales.'
                  : `Hacían falta ${FUTBOL_PASS}. Lee bien las explicaciones: mañana hay otras preguntas de la misma sesión.`}
              </p>
              <button type="button" onClick={() => setOpen(false)} className="btn-primary w-full">
                Vale
              </button>
            </div>
          ) : (
            <Question
              question={reto.questions[index]}
              index={index}
              total={total}
              chosen={chosen}
              kid={kid}
              onAnswer={answer}
              onNext={() => {
                setChosen(null);
                setIndex((v) => v + 1);
              }}
            />
          )}
        </Modal>
      )}

      {practica && practicaReto && (
        <Modal title="🧺 Práctica libre · fútbol" size="lg" onClose={() => setPractica(null)}>
          {practica.index >= practicaReto.questions.length ? (
            <div className="space-y-3 text-center">
              <p className="text-5xl">🧺</p>
              <p className="font-display text-xl font-black t-1">
                {practica.aciertos}/{practicaReto.questions.length}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPractica(null)} className="btn-ghost flex-1">
                  Ya está
                </button>
                <button
                  type="button"
                  onClick={() => setPractica({ vuelta: practica.vuelta + 1, index: 0, chosen: null, aciertos: 0 })}
                  className="btn-primary flex-1"
                >
                  Otra vuelta
                </button>
              </div>
            </div>
          ) : (
            <Question
              question={practicaReto.questions[practica.index]}
              index={practica.index}
              total={practicaReto.questions.length}
              chosen={practica.chosen}
              kid={kid}
              onAnswer={(id) =>
                setPractica((p) =>
                  p && !p.chosen ? { ...p, chosen: id, aciertos: p.aciertos + (id === practicaReto.questions[p.index].answer ? 1 : 0) } : p,
                )
              }
              onNext={() => setPractica((p) => (p ? { ...p, index: p.index + 1, chosen: null } : p))}
            />
          )}
        </Modal>
      )}
    </>
  );
}
