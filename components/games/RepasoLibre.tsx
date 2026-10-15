'use client';

import { useMemo, useState } from 'react';
import { Question } from '@/components/games/DailyGameCard';
import { Modal } from '@/components/ui/Modal';
import { planDelDia } from '@/lib/examenes';
import { ASIGNATURAS, RETO_META, buildRetoCole } from '@/lib/retoCole';
import { barajar, makeRand, type Asignatura, type Curso, type Tema } from '@/lib/temario';
import { estaVisto, temasDe, temasDelExamen, type AjusteTemas } from '@/lib/temasVistos';
import type { DateKey, Profile } from '@/types';

/* =========================================================================
 *  El repaso libre: preguntar todo el temario sin hacer retos.
 *
 *  Se eligen los temas (por asignatura, uno a uno, lo del próximo examen o
 *  todo lo dado) y salen rondas de diez preguntas, tantas como se quiera.
 *  No se anota nada: ni nota, ni tiro, ni estrellas. Es para preguntarle
 *  el temario como se haría con el libro en la mano.
 * ========================================================================= */

const POR_RONDA = 10;

interface RepasoLibreProps {
  profile: Profile;
  curso: Curso;
  date: DateKey;
  ajuste: AjusteTemas;
  kid: boolean;
  onClose: () => void;
}

export function RepasoLibre({ profile, curso, date, ajuste, kid, onClose }: RepasoLibreProps) {
  const porAsignatura = useMemo(() => ASIGNATURAS.map((a) => ({ asignatura: a, temas: temasDe(a, curso) })), [curso]);
  const vistos = useMemo(() => porAsignatura.flatMap((x) => x.temas.filter((t) => estaVisto(t, date, ajuste))), [porAsignatura, date, ajuste]);
  const plan = useMemo(() => planDelDia(profile.id, date), [profile.id, date]);
  const delExamen = useMemo(() => (plan ? plan.pendientes.flatMap((e) => temasDelExamen(e, curso, date, ajuste)) : []), [plan, curso, date, ajuste]);

  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(vistos.map((t) => t.id)));
  const [verTodo, setVerTodo] = useState(false);

  /** La ronda en juego: los temas barajados y una semilla nueva cada vez. */
  const [ronda, setRonda] = useState<{ temas: Tema[]; semilla: string; index: number; chosen: string | null; aciertos: number; fallos: Tema[] } | null>(null);
  const [sesion, setSesion] = useState({ bien: 0, total: 0, rondas: 0 });

  const preguntas = useMemo(
    () => (ronda ? buildRetoCole(profile.id, curso, date, 'repaso', 0, ajuste, { temas: ronda.temas, n: POR_RONDA, semilla: ronda.semilla }) : null),
    [ronda?.semilla, profile.id, curso, date, ajuste], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const seleccion = porAsignatura.flatMap((x) => x.temas).filter((t) => elegidos.has(t.id));

  const empezar = () => {
    if (seleccion.length === 0) return;
    const semilla = `libre${Date.now()}`;
    // Barajados: si no, con muchos temas saldrían siempre los primeros.
    setRonda({ temas: barajar(seleccion, makeRand(Date.now() >>> 0)), semilla, index: 0, chosen: null, aciertos: 0, fallos: [] });
  };

  const alternar = (ids: string[], on: boolean) =>
    setElegidos((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const total = preguntas?.questions.length ?? 0;
  const actual = ronda && preguntas && ronda.index < total ? temaDeId(ronda.temas, preguntas.questions[ronda.index].tema) : undefined;

  return (
    <Modal title="📖 Repaso libre" size="lg" onClose={onClose}>
      {!ronda || !preguntas ? (
        <div className="space-y-3">
          <p className="rounded-xl border p-3 text-[12px] leading-snug hairline surf-1 t-2">
            Todo el temario, sin retos: elige qué repasar y salen rondas de {POR_RONDA} preguntas, tantas como quieras. <b className="t-1">No cuenta para nada</b>: ni
            nota, ni tiros, ni estrellas.
          </p>

          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setElegidos(new Set(vistos.map((t) => t.id)))} className="chip-soft text-[11px] font-black">
              ✅ Todo lo dado
            </button>
            {delExamen.length > 0 && (
              <button type="button" onClick={() => setElegidos(new Set(delExamen.map((t) => t.id)))} className="chip-soft text-[11px] font-black">
                📝 Lo de los exámenes
              </button>
            )}
            <button type="button" onClick={() => setElegidos(new Set())} className="chip-soft text-[11px] font-black">
              ✖ Ninguno
            </button>
            <button type="button" onClick={() => setVerTodo((v) => !v)} className={`chip-soft text-[11px] font-black ${verTodo ? 'ring-2 ring-accent' : ''}`}>
              🔭 {verTodo ? 'Ocultar' : 'Ver'} lo que aún no han dado
            </button>
          </div>

          {porAsignatura.map(({ asignatura, temas }) => {
            const visibles = temas.filter((t) => verTodo || estaVisto(t, date, ajuste));
            if (visibles.length === 0) return null;
            const ids = visibles.map((t) => t.id);
            const todos = ids.every((id) => elegidos.has(id));
            return (
              <section key={asignatura}>
                <button type="button" onClick={() => alternar(ids, !todos)} className="mb-1.5 flex w-full items-center gap-2 text-left text-[13px] font-black t-1">
                  <span aria-hidden>{RETO_META[asignatura].icon}</span>
                  {RETO_META[asignatura].nombre}
                  <span className="ml-auto text-[11px] font-bold t-3">{todos ? 'quitar todos' : 'elegir todos'}</span>
                </button>
                <ul className="space-y-1">
                  {visibles.map((t) => (
                    <TemaFila key={t.id} tema={t} asignatura={asignatura} on={elegidos.has(t.id)} visto={estaVisto(t, date, ajuste)} onToggle={() => alternar([t.id], !elegidos.has(t.id))} />
                  ))}
                </ul>
              </section>
            );
          })}

          {sesion.rondas > 0 && (
            <p className="text-center text-[12px] font-bold t-2">
              Hoy en el repaso: {sesion.bien} de {sesion.total} bien en {sesion.rondas} {sesion.rondas === 1 ? 'ronda' : 'rondas'}.
            </p>
          )}
          <button type="button" disabled={seleccion.length === 0} onClick={empezar} className="btn-primary sticky bottom-0 w-full disabled:opacity-50">
            {seleccion.length === 0 ? 'Elige algún tema' : `▶️ Preguntar · ${seleccion.length} ${seleccion.length === 1 ? 'tema' : 'temas'}`}
          </button>
        </div>
      ) : ronda.index >= total ? (
        <div className="space-y-3 text-center">
          <p className="text-5xl animate-pop">{ronda.aciertos === total ? '🏆' : ronda.aciertos >= total * 0.7 ? '💪' : '📖'}</p>
          <p className="font-display text-xl font-black t-1">
            {ronda.aciertos} de {total}
          </p>
          {ronda.fallos.length > 0 ? (
            <p className="text-sm t-2">
              Para mirar otra vez:{' '}
              {[...new Set(ronda.fallos)].map((t) => `${RETO_META[t.asignatura].icon} ${t.titulo}`).join(' · ')}
            </p>
          ) : (
            <p className="text-sm t-2">¡Todas bien! Esto ya se sabe.</p>
          )}
          <p className="text-[12px] t-3">
            En total hoy: {sesion.bien} de {sesion.total} bien.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setRonda(null)} className="btn-ghost flex-1 border hairline">
              Cambiar temas
            </button>
            <button type="button" onClick={empezar} className="btn-primary flex-1">
              Otra ronda
            </button>
          </div>
          {ronda.fallos.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const temas = [...new Set(ronda.fallos)];
                setRonda({ temas: barajar(temas, makeRand(Date.now() >>> 0)), semilla: `libre-fallos${Date.now()}`, index: 0, chosen: null, aciertos: 0, fallos: [] });
              }}
              className="btn-ghost w-full border hairline"
            >
              🔁 Una ronda sólo de lo fallado
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-3 text-[11px] font-bold leading-snug t-3">
            📖 Repaso libre · sin nota
            {actual && ` · ${RETO_META[actual.asignatura].icon} ${actual.titulo}`}
          </p>
          <Question
            question={preguntas.questions[ronda.index]}
            index={ronda.index}
            total={total}
            chosen={ronda.chosen}
            kid={kid}
            onAnswer={(id) => {
              if (ronda.chosen) return;
              const q = preguntas.questions[ronda.index];
              const hit = id === q.answer;
              const tema = temaDeId(ronda.temas, q.tema);
              setRonda({ ...ronda, chosen: id, aciertos: ronda.aciertos + (hit ? 1 : 0), fallos: !hit && tema ? [...ronda.fallos, tema] : ronda.fallos });
              setSesion((s) => ({ bien: s.bien + (hit ? 1 : 0), total: s.total + 1, rondas: s.rondas + (ronda.index === 0 ? 1 : 0) }));
            }}
            onNext={() => setRonda((r) => (r ? { ...r, index: r.index + 1, chosen: null } : r))}
            nextLabel={ronda.index + 1 === total ? 'Ver cómo ha ido' : 'Siguiente'}
          />
        </>
      )}
    </Modal>
  );
}

function temaDeId(temas: Tema[], id: string | undefined): Tema | undefined {
  return id ? temas.find((t) => t.id === id) : undefined;
}

function TemaFila({ tema, asignatura, on, visto, onToggle }: { tema: Tema; asignatura: Asignatura; on: boolean; visto: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={`flex w-full items-start gap-2 rounded-xl border p-2 text-left transition active:scale-[0.99] ${on ? 'border-transparent' : 'hairline surf-1'}`}
        style={on ? { background: `${RETO_META[asignatura].color}22`, boxShadow: `inset 0 0 0 2px ${RETO_META[asignatura].color}` } : undefined}
      >
        <span className="text-[14px] leading-5" aria-hidden>
          {on ? '☑️' : '⬜'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold leading-snug t-1">{tema.titulo}</span>
          <span className="block text-[11px] leading-snug t-3">
            {tema.puntos.join(' · ')}
            {!visto && ' · aún no dado'}
          </span>
        </span>
      </button>
    </li>
  );
}
