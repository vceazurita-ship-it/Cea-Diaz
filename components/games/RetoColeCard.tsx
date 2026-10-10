'use client';

import { useMemo, useRef, useState } from 'react';
import { Question } from '@/components/games/DailyGameCard';
import { Material } from '@/components/games/Material';
import { FondoTiro } from '@/components/games/PenaltyArt';
import { Modal } from '@/components/ui/Modal';
import { isToday } from '@/lib/dates';
import { SHOT_TYPES } from '@/lib/penalties';
import {
  COLE_PASS,
  RETO_META,
  buildRetoCole,
  nivelDe,
  retoDelDia,
  retosDelDia,
  resultadosDe,
  retoSuperado,
  victorias,
  type RetoId,
  type RetoResult,
} from '@/lib/retoCole';
import { cuandoEs, diasHasta, planDelDia, type PlanDelDia } from '@/lib/examenes';
import { IDEA, type Curso } from '@/lib/temario';
import type { DateKey, DayEntry, Profile, Visual } from '@/types';

/* =========================================================================
 *  Los retos del cole.
 *
 *  Todas las asignaturas, todos los días: cinco preguntas de cada una (de
 *  elegir, de escribir, de ordenar, de emparejar, de clasificar…) y, con
 *  cuatro bien, el tiro especial de esa asignatura para la tanda de hoy. La
 *  tarjeta enseña las seis con su tiro —ganado o bajo llave— y marca cuál
 *  toca hoy por calendario o por examen, que es por el que conviene empezar.
 *  El premio tiene que verse para que tire de uno.
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

export function RetoColeCard({ profile, curso, date, entries, kid, headingClass, onResult }: RetoColeCardProps) {
  const today = isToday(date);
  const retos = useMemo(() => retosDelDia(date, profile.id), [date, profile.id]);
  const hoy = retoDelDia(date, profile.id);
  const plan = useMemo(() => planDelDia(profile.id, date), [profile.id, date]);
  const resultados = resultadosDe(entries, profile.id, date);

  // Cómo va cada reto hoy, y el nivel de su tiro.
  const estados = retos.map((reto) => {
    const result = resultados[reto] ?? null;
    const ganados = victorias(entries, profile.id, reto, date);
    return {
      reto,
      meta: RETO_META[reto],
      tiro: SHOT_TYPES[RETO_META[reto].tiro],
      result,
      done: Boolean(result && result.answered >= result.total),
      won: retoSuperado(result),
      ganados,
      nivel: nivelDe(ganados),
    };
  });
  const ganadosHoy = estados.filter((e) => e.won).length;
  const deHoy = estados.find((e) => e.reto === hoy)!;

  /** El reto abierto en el modal, y por dónde va. */
  const [abierto, setAbierto] = useState<RetoId | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  /** La presentación del tema, antes de la primera pregunta. */
  const [presentado, setPresentado] = useState(false);

  const reto = useMemo(() => (abierto ? buildRetoCole(profile.id, curso, date, abierto) : null), [abierto, profile.id, curso, date]);
  const estado = abierto ? estados.find((e) => e.reto === abierto)! : null;
  const answered = estado?.result?.answered ?? 0;
  const correct = estado?.result?.correct ?? 0;
  const total = reto?.questions.length ?? 0;

  /**
   * La práctica libre: tantas vueltas como quiera, con preguntas nuevas cada
   * vez y sin nota. En Montessori el trabajo se repite por gusto, y lo que
   * sale bien a la tercera vuelta también se ha aprendido.
   */
  const [practica, setPractica] = useState<{ reto: RetoId; vuelta: number; index: number; chosen: string | null; aciertos: number } | null>(null);
  const practicaReto = useMemo(
    () => (practica ? buildRetoCole(profile.id, curso, date, practica.reto, practica.vuelta) : null),
    [practica?.reto, practica?.vuelta, profile.id, curso, date], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const abrir = (e: (typeof estados)[number]) => {
    if (!today) return;
    if (e.done) {
      setPractica({ reto: e.reto, vuelta: 1, index: 0, chosen: null, aciertos: 0 });
      return;
    }
    const ya = e.result?.answered ?? 0;
    setIndex(ya);
    setChosen(null);
    setPresentado(ya > 0);
    setAbierto(e.reto);
  };

  // Un doble toque rápido llega antes de que el botón se desactive: sin este
  // seguro, la misma pregunta se anotaría dos veces.
  const anotada = useRef('');

  const answer = (optionId: string) => {
    if (!reto || !abierto || chosen) return;
    const clave = `${abierto}:${answered}`;
    if (anotada.current === clave) return;
    anotada.current = clave;
    setChosen(optionId);
    const hit = optionId === reto.questions[index].answer;
    onResult({ reto: abierto, correct: correct + (hit ? 1 : 0), answered: answered + 1, total, at: new Date().toISOString() });
  };

  const idea = reto && reto.reto !== 'repaso' ? IDEA[reto.temas[0].id] : undefined;

  return (
    <>
      <div className={`${kid ? 'card-kid' : 'card'} overflow-hidden p-0`}>
        {/* La viñeta del tiro que toca hoy, de cabecera. */}
        <div className="relative h-32 overflow-hidden bg-[#241a14]">
          <FondoTiro kind={deHoy.meta.tiro as Exclude<typeof deHoy.meta.tiro, 'normal'>} className={`absolute inset-0 h-full w-full ${deHoy.won ? '' : 'opacity-70 saturate-50'}`} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute left-3 top-2.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
            {deHoy.meta.icon} Hoy toca · {deHoy.meta.nombre}
          </div>
          <div className="absolute right-3 top-2.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
            🔓 {ganadosHoy} de {estados.length}
          </div>
          <div className="absolute inset-x-3 bottom-2.5 flex items-end gap-2">
            <span className="text-4xl drop-shadow-lg">{deHoy.won ? deHoy.tiro.icon : '🔒'}</span>
            <div className="min-w-0">
              <p className="font-manga text-2xl leading-none text-white [-webkit-text-stroke:4px_#241a14] [paint-order:stroke]">{deHoy.tiro.name}</p>
              <p className="mt-0.5 text-[10px] font-bold text-white/80">
                {deHoy.nivel > 0 ? `${'★'.repeat(deHoy.nivel)}${'☆'.repeat(3 - deHoy.nivel)} nivel ${deHoy.nivel} · ` : ''}
                {deHoy.ganados} {deHoy.ganados === 1 ? 'reto ganado' : 'retos ganados'} este trimestre
              </p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <h3 className={headingClass}>Retos del cole</h3>
          {plan && <AvisoExamen plan={plan} date={date} />}
          <p className="text-[11px] font-semibold leading-snug t-2">
            {today
              ? `Todas las asignaturas, todos los días: ${COLE_PASS} de 5 bien y el tiro de esa asignatura es tuyo para la tanda de hoy. Empieza por la que toca.`
              : 'Los retos se juegan el mismo día.'}
          </p>

          {/* Los seis retos, con su tiro. */}
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {estados.map((e) => {
              const esHoy = e.reto === hoy;
              const enCurso = !e.done && (e.result?.answered ?? 0) > 0;
              return (
                <button
                  key={e.reto}
                  type="button"
                  disabled={!today}
                  onClick={() => abrir(e)}
                  className={`relative flex flex-col items-center rounded-xl border p-2 text-center transition active:scale-95 disabled:opacity-100 ${e.won ? 'border-transparent' : esHoy ? 'border-accent surf-1' : 'hairline surf-1'}`}
                  style={e.won ? { background: `${e.meta.color}33`, boxShadow: `inset 0 0 0 2px ${e.meta.color}` } : undefined}
                  title={`${e.meta.nombre}: ${e.tiro.name}`}
                >
                  {esHoy && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-accent px-1.5 text-[8px] font-black uppercase tracking-wider text-white">Hoy</span>}
                  <span className="text-2xl leading-none">{e.won ? e.tiro.icon : '🔒'}</span>
                  <span className="mt-1 text-[10px] font-black leading-tight t-1">
                    {e.meta.icon} {e.meta.nombre}
                  </span>
                  <span className={`mt-0.5 text-[9px] font-bold leading-tight ${e.won ? 't-1' : 't-3'}`}>
                    {e.won
                      ? `✔ ${e.result!.correct}/${e.result!.total}`
                      : e.done
                        ? `${e.result!.correct}/${e.result!.total} · 🧺`
                        : enCurso
                          ? `vas por la ${e.result!.answered + 1}`
                          : today
                            ? '▶ jugar'
                            : '—'}
                  </span>
                  {e.nivel > 0 && <span className="text-[8px] text-amber-400">{'★'.repeat(e.nivel)}</span>}
                </button>
              );
            })}
          </div>
          {today && estados.some((e) => e.done) && <p className="mt-2 text-[10px] t-3">🧺 Un reto ya jugado se vuelve a abrir para practicar más, sin nota.</p>}
        </div>
      </div>

      {abierto && reto && estado && (
        <Modal title={`${estado.meta.icon} Reto de ${estado.meta.nombre}`} size="lg" onClose={() => setAbierto(null)}>
          {!presentado && idea ? (
            <Presentacion titulo={reto.temas[0].titulo} idea={idea} onStart={() => setPresentado(true)} />
          ) : index >= total ? (
            <Desbloqueo won={estado.won} correct={correct} total={total} kind={estado.meta.tiro} nivel={estado.nivel} onClose={() => setAbierto(null)} />
          ) : (
            <>
              <p className="mb-3 text-[11px] font-bold leading-snug t-3">
                🎯 {COLE_PASS} de {total} y {estado.tiro.article} <b className="t-1">{estado.tiro.name}</b> es tuyo hoy.
                {reto.reto !== 'repaso' && ` · ${reto.temas.length > 1 ? reto.temas.map((t) => t.titulo).join(' + ') : reto.temas[0].titulo}`}
              </p>
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
            </>
          )}
        </Modal>
      )}

      {/* La práctica libre: lo mismo, sin anotar nada. */}
      {practica && practicaReto && (
        <Modal title={`🧺 Práctica libre · ${RETO_META[practica.reto].nombre}`} size="lg" onClose={() => setPractica(null)}>
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
                <button type="button" onClick={() => setPractica({ ...practica, vuelta: practica.vuelta + 1, index: 0, chosen: null, aciertos: 0 })} className="btn-primary flex-1">
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

/**
 * El aviso de exámenes: qué se prepara hoy y cuándo es, y la fila de los que
 * quedan. En la semana de exámenes, el de mañana en grande.
 */
function AvisoExamen({ plan, date }: { plan: PlanDelDia; date: DateKey }) {
  const nombre = (a: string) => RETO_META[a as keyof typeof RETO_META]?.nombre ?? a;
  const e = plan.examen;
  const dias = e ? diasHasta(e.fecha, date) : 0;
  return (
    <div className={`mb-2 rounded-xl border p-2.5 text-[12px] leading-snug ${plan.modo === 'repasa' ? 'border-rose-400/60 bg-rose-400/10' : 'border-sky-400/50 bg-sky-400/10'}`}>
      <p className="font-black t-1">
        {plan.modo === 'repasa' && e
          ? `🔥 Repaso: ${dias <= 1 ? 'mañana' : cuandoEs(e.fecha)} es el examen de ${nombre(e.asignatura)}`
          : e
            ? `📝 Hoy toca preparar ${nombre(e.asignatura)}: examen ${cuandoEs(e.fecha)} (faltan ${dias} días)`
            : '📝 Repaso de todos los exámenes que vienen'}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {plan.pendientes.map((x) => (
          <span key={x.asignatura} className={`chip-soft text-[10px] ${x === e ? 'ring-2 ring-accent' : ''}`}>
            {RETO_META[x.asignatura].icon} {nombre(x.asignatura)} · {cuandoEs(x.fecha)}
          </span>
        ))}
      </div>
    </div>
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
        <p className="text-sm t-2">Hacían falta {COLE_PASS} para el {tiro.name}. Las explicaciones de cada pregunta son lo que se entrena: puedes practicar más sin nota, y mañana hay otro reto.</p>
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
      <p className="text-[13px] leading-snug t-2">{tiro.blurb} Lo tienes en la tanda de hoy: elígelo en «Cambiar tiro». No gasta energía. ¿A por otro reto?</p>
      <button type="button" onClick={onClose} className="btn-primary w-full">🥅 ¡A por Benji!</button>
    </div>
  );
}
