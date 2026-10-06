'use client';

import { useMemo, useState } from 'react';
import { Question } from '@/components/games/DailyGameCard';
import { Material } from '@/components/games/Material';
import { FondoTiro } from '@/components/games/PenaltyArt';
import { Modal } from '@/components/ui/Modal';
import { addDays, isToday, parseDateKey } from '@/lib/dates';
import { SHOT_TYPES } from '@/lib/penalties';
import {
  COLE_PASS,
  RETO_META,
  buildRetoCole,
  nivelDe,
  retoDelDia,
  retoResultFor,
  retoSuperado,
  victorias,
  type RetoResult,
} from '@/lib/retoCole';
import { IDEA, type Curso } from '@/lib/temario';
import type { DateKey, DayEntry, Profile, Visual } from '@/types';

/* =========================================================================
 *  El reto del cole.
 *
 *  Una asignatura al día, cinco preguntas del tema que se está dando en
 *  clase y, con cuatro bien, el tiro especial de esa asignatura para la
 *  tanda de hoy. La tarjeta enseña antes de jugar qué tiro hay en juego, con
 *  su viñeta: el premio tiene que verse para que tire de uno.
 * ========================================================================= */

interface RetoColeCardProps {
  profile: Profile;
  curso: Curso;
  date: DateKey;
  entries: Record<string, DayEntry>;
  kid: boolean;
  headingClass: string;
  onResult: (result: RetoResult) => void;
}

const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function RetoColeCard({ profile, curso, date, entries, kid, headingClass, onResult }: RetoColeCardProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);

  const reto = useMemo(() => buildRetoCole(profile.id, curso, date), [profile.id, curso, date]);
  const meta = RETO_META[reto.reto];
  const tiro = SHOT_TYPES[meta.tiro];
  const total = reto.questions.length;

  const result = retoResultFor(entries, profile.id, date);
  const answered = result?.answered ?? 0;
  const correct = result?.correct ?? 0;
  const done = Boolean(result && answered >= total);
  const won = retoSuperado(result);
  const today = isToday(date);
  const ganados = victorias(entries, profile.id, reto.reto, date);
  const nivel = nivelDe(ganados);

  // La semana, de lunes a domingo, con lo ganado cada día.
  const semana = useMemo(() => {
    const dow = (parseDateKey(date).getDay() + 6) % 7;
    const lunes = addDays(date, -dow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(lunes, i);
      const r = RETO_META[retoDelDia(d)];
      return { d, r, ok: retoSuperado(retoResultFor(entries, profile.id, d)), hoy: d === date };
    });
  }, [date, entries, profile.id]);

  /** La presentación del tema, antes de la primera pregunta. */
  const [presentado, setPresentado] = useState(false);

  /**
   * La práctica libre: tantas vueltas como quiera, con preguntas nuevas cada
   * vez y sin nota. En Montessori el trabajo se repite por gusto, y lo que
   * sale bien a la tercera vuelta también se ha aprendido.
   */
  const [practica, setPractica] = useState<{ vuelta: number; index: number; chosen: string | null; aciertos: number } | null>(null);
  const practicaReto = useMemo(
    () => (practica ? buildRetoCole(profile.id, curso, date, practica.vuelta) : null),
    [practica?.vuelta, profile.id, curso, date], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const start = () => {
    setIndex(answered);
    setChosen(null);
    setPresentado(answered > 0);
    setOpen(true);
  };

  const idea = IDEA[reto.temas[0].id];

  const answer = (optionId: string) => {
    if (chosen) return;
    setChosen(optionId);
    const hit = optionId === reto.questions[index].answer;
    onResult({ reto: reto.reto, correct: correct + (hit ? 1 : 0), answered: answered + 1, total, at: new Date().toISOString() });
  };

  return (
    <>
      <div className={`${kid ? 'card-kid' : 'card'} overflow-hidden p-0`}>
        {/* La viñeta del tiro en juego, de cabecera. */}
        <div className="relative h-32 overflow-hidden bg-[#241a14]">
          <FondoTiro kind={meta.tiro as Exclude<typeof meta.tiro, 'normal'>} className={`absolute inset-0 h-full w-full ${won ? '' : 'opacity-70 saturate-50'}`} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute left-3 top-2.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
            {meta.icon} Reto del cole · {meta.nombre}
          </div>
          {won && (
            <div className="absolute right-3 top-2.5 animate-latido rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#241a14]" style={{ background: meta.color }}>
              🔓 Desbloqueado
            </div>
          )}
          <div className="absolute inset-x-3 bottom-2.5 flex items-end gap-2">
            <span className="text-4xl drop-shadow-lg">{won ? tiro.icon : '🔒'}</span>
            <div className="min-w-0">
              <p className="font-manga text-2xl leading-none text-white [-webkit-text-stroke:4px_#241a14] [paint-order:stroke]">{tiro.name}</p>
              <p className="mt-0.5 text-[10px] font-bold text-white/80">
                {nivel > 0 ? `${'★'.repeat(nivel)}${'☆'.repeat(3 - nivel)} nivel ${nivel} · ` : ''}
                {ganados} {ganados === 1 ? 'reto ganado' : 'retos ganados'} este trimestre
              </p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <h3 className={headingClass}>Reto del cole</h3>
          <p className="font-display text-sm font-black t-1">
            {reto.reto === 'repaso' ? 'Una de cada asignatura de esta semana' : reto.temas[0].titulo}
          </p>
          {reto.reto !== 'repaso' && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {reto.temas[0].puntos.map((x) => (
                <span key={x} className="chip-soft text-[10px]">{x}</span>
              ))}
            </div>
          )}
          <p className="mt-1 text-[10px] t-3">{reto.temas.length === 1 ? reto.temas[0].fuente : `${curso}.º de Primaria · temario de esta semana`}</p>

          {!today ? (
            <p className="mt-2 text-[11px] t-3">
              {result ? `Ese día: ${correct}/${total}${won ? ` y ${tiro.name} ganado.` : '.'}` : 'El reto se juega el mismo día.'}
            </p>
          ) : !done ? (
            <>
              <p className="mt-2 text-[11px] font-semibold leading-snug t-2">
                🎯 {COLE_PASS} de {total} bien y {tiro.article} <b>{tiro.name}</b> es tuyo para la tanda de hoy. {tiro.blurb}
              </p>
              <button type="button" onClick={start} className="btn-primary mt-3 px-4 text-sm">
                {answered > 0 ? `⏵ Seguir (vas por la ${answered + 1})` : `▶️ Jugar el reto de ${meta.nombre}`}
              </button>
            </>
          ) : (
            <>
              <p className={`mt-2 rounded-xl border p-2 text-[12px] font-bold leading-snug ${won ? 'border-accent bg-accent-faint t-1' : 'hairline surf-1 t-2'}`}>
                {won
                  ? `🔥 ${correct}/${total}: ${tiro.article === 'la' ? 'La' : 'El'} ${tiro.name} te espera en la tanda de penaltis. Búscalo en «Cambiar tiro».`
                  : `💪 ${correct}/${total}: hacían falta ${COLE_PASS}. Mañana toca ${RETO_META[retoDelDia(addDays(date, 1))].nombre}.`}
              </p>
              <button
                type="button"
                onClick={() => setPractica({ vuelta: (practica?.vuelta ?? 0) + 1, index: 0, chosen: null, aciertos: 0 })}
                className="btn-ghost mt-2 px-3 py-1.5 text-xs"
              >
                🧺 Practicar más, sin nota
              </button>
            </>
          )}

          {/* La semana de retos. */}
          <div className="mt-3 grid grid-cols-7 gap-1">
            {semana.map(({ d, r, ok, hoy }) => (
              <div
                key={d}
                className={`flex flex-col items-center rounded-lg py-1 text-[9px] font-black ${hoy ? 'ring-2 ring-accent' : ''} ${ok ? '' : 'surf-1 t-3'}`}
                style={ok ? { background: `${r.color}33` } : undefined}
                title={`${r.nombre}: ${SHOT_TYPES[r.tiro].name}`}
              >
                <span>{DIAS[parseDateKey(d).getDay()]}</span>
                <span className="text-base leading-tight">{ok ? SHOT_TYPES[r.tiro].icon : r.icon}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {open && (
        <Modal title={`${meta.icon} Reto de ${meta.nombre}`} size="lg" onClose={() => setOpen(false)}>
          {!presentado && reto.reto !== 'repaso' && idea ? (
            <Presentacion titulo={reto.temas[0].titulo} idea={idea} onStart={() => setPresentado(true)} />
          ) : index >= total ? (
            <Desbloqueo won={won} correct={correct} total={total} kind={meta.tiro} nivel={nivel} onClose={() => setOpen(false)} />
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

      {/* La práctica libre: lo mismo, sin anotar nada. */}
      {practica && practicaReto && (
        <Modal title={`🧺 Práctica libre · ${meta.nombre}`} size="lg" onClose={() => setPractica(null)}>
          {practica.index >= practicaReto.questions.length ? (
            <div className="space-y-3 text-center">
              <p className="text-5xl">🧺</p>
              <p className="font-display text-xl font-black t-1">
                {practica.aciertos}/{practicaReto.questions.length}
              </p>
              <p className="text-sm t-2">Esto no cuenta para nada: es para entrenar. ¿Otra vuelta?</p>
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
                  p && !p.chosen
                    ? { ...p, chosen: id, aciertos: p.aciertos + (id === practicaReto.questions[p.index].answer ? 1 : 0) }
                    : p,
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

/**
 * La presentación del tema: la idea en una frase y el material con el que se
 * ve, antes de la primera pregunta. Es lo que hace la guía Montessori antes
 * de dejar que el niño trabaje solo con un material.
 */
function Presentacion({ titulo, idea, onStart }: { titulo: string; idea: { texto: string; visual?: Visual }; onStart: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-black uppercase tracking-widest t-3">Antes de empezar · la idea</p>
      <p className="font-display text-lg font-black t-1">{titulo}</p>
      {idea.visual && <Material visual={idea.visual} resuelto />}
      <p className="rounded-xl border p-3 text-[14px] font-semibold leading-snug hairline surf-1 t-1">💡 {idea.texto}</p>
      <button type="button" onClick={onStart} className="btn-primary w-full">
        ▶️ Lo tengo: ¡al reto!
      </button>
    </div>
  );
}

/**
 * El final del reto. Ganado, es la presentación del tiro como en la serie:
 * su viñeta a toda pantalla, el grito y el nivel. Perdido, lo que faltó.
 */
function Desbloqueo({
  won,
  correct,
  total,
  kind,
  nivel,
  onClose,
}: {
  won: boolean;
  correct: number;
  total: number;
  kind: (typeof RETO_META)[keyof typeof RETO_META]['tiro'];
  nivel: number;
  onClose: () => void;
}) {
  const tiro = SHOT_TYPES[kind];
  if (!won) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-5xl">💪</p>
        <p className="font-display text-xl font-black t-1">{correct}/{total}</p>
        <p className="text-sm t-2">Hacían falta {COLE_PASS} para el {tiro.name}. Las explicaciones de cada pregunta son lo que se entrena: mañana hay otro reto.</p>
        <button type="button" onClick={onClose} className="btn-primary w-full">Vale</button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#241a14] shadow-2xl">
        <FondoTiro kind={kind as Exclude<typeof kind, 'normal'>} className="absolute inset-0 h-full w-full animate-pop" />
        <div className="absolute inset-0 animate-fogonazo bg-white" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <p className="absolute left-3 top-3 animate-rotulo rounded px-2 py-1 text-[11px] font-black uppercase tracking-widest text-[#241a14]" style={{ background: tiro.color }}>
          ¡Tiro nuevo desbloqueado!
        </p>
        <span className="absolute right-4 top-10 animate-golpe text-7xl drop-shadow-2xl">{tiro.icon}</span>
        <p className="absolute inset-x-3 bottom-10 animate-golpe font-manga text-[clamp(28px,8vw,48px)] leading-[0.95] text-white [-webkit-text-stroke:6px_#241a14] [paint-order:stroke]">
          {tiro.shout}
        </p>
        <p className="absolute inset-x-3 bottom-3 text-[12px] font-black text-amber-300">
          {'★'.repeat(nivel)}{'☆'.repeat(3 - nivel)} Nivel {nivel} · {correct}/{total} aciertos
        </p>
      </div>
      <p className="text-[13px] leading-snug t-2">{tiro.blurb} Lo tienes en la tanda de hoy: elígelo en «Cambiar tiro». No gasta energía.</p>
      <button type="button" onClick={onClose} className="btn-primary w-full">🥅 ¡A por Benji!</button>
    </div>
  );
}
