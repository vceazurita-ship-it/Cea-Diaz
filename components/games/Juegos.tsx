'use client';

import { useMemo, useState } from 'react';
import { hashSeed } from '@/lib/challenges';
import { barajar, makeRand } from '@/lib/temario';
import type { GameQuestion, Juego } from '@/types';

/* =========================================================================
 *  Los otros juegos de una pregunta: lo que no es elegir entre cuatro.
 *
 *   · **Escribe**: la respuesta se teclea, con un teclado de números o con
 *     el alfabeto móvil (vocales en azul, consonantes en rojo, como en el
 *     material Montessori).
 *   · **Ordena**: se tocan las cosas en el orden que toca.
 *   · **Empareja**: cada cosa de la izquierda con la suya de la derecha.
 *   · **Clasifica**: cada cosa en su caja.
 *   · **Verdadero o falso**.
 *
 *  Todos se juegan igual: se prepara la respuesta tocando, se comprueba con
 *  un botón y, contestado (`chosen` con algo), el juego se bloquea y se
 *  enseña resuelto: lo bueno en verde, lo malo en rojo y, debajo, cómo era.
 *  Es el control del error. Al que anota el resultado sólo le llega si se
 *  acertó o no.
 * ========================================================================= */

interface JuegoProps {
  question: GameQuestion;
  /** Lo contestado, o `null` mientras se juega. */
  chosen: string | null;
  kid: boolean;
  onAnswer: (hit: boolean) => void;
}

export function JuegoDe(props: JuegoProps) {
  const juego = props.question.juego;
  if (!juego) return null;
  switch (juego.tipo) {
    case 'escribe':
      return juego.teclado === 'numeros' ? <EscribeNumeros {...props} /> : <EscribeLetras {...props} />;
    case 'ordena':
      return <Ordena {...props} juego={juego} />;
    case 'empareja':
      return <Empareja {...props} juego={juego} />;
    case 'clasifica':
      return <Clasifica {...props} juego={juego} />;
    case 'vf':
      return <VerdaderoFalso {...props} juego={juego} />;
  }
}

const VOCAL = /[aeiouáéíóúü]/i;
const SIN_TILDE: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };
const CON_TILDE: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };

/** Para comparar: sin mayúsculas, puntos de millar ni espacios. */
const norm = (s: string) => s.toLowerCase().replace(/[.\s]/g, '');

function Comprobar({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="btn-primary w-full disabled:opacity-40">
      ✔ Comprobar
    </button>
  );
}

/** El tono de una ficha ya resuelta. */
const tono = (chosen: string | null, bien: boolean | null) =>
  !chosen || bien === null ? 'hairline surf-1 hover-soft t-1' : bien ? 'border-emerald-400/60 bg-emerald-400/15 t-1' : 'border-rose-400/60 bg-rose-400/15 t-1';

/* ------------------------------------------------------------ escribir */

function EscribeNumeros({ question, chosen, onAnswer }: JuegoProps) {
  const ok = question.options[0].text;
  const [texto, setTexto] = useState('');
  const bonito = texto.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const acierto = norm(texto) === norm(ok);
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✔'];

  const pulsar = (t: string) => {
    if (chosen) return;
    if (t === '⌫') setTexto((v) => v.slice(0, -1));
    else if (t === '✔') {
      if (texto) onAnswer(acierto);
    } else if (texto.length < 7) setTexto((v) => v + t);
  };

  return (
    <div className="space-y-3">
      <div
        className={`flex min-h-[56px] items-center justify-end rounded-xl border px-4 font-display text-3xl font-black tabular-nums ${chosen ? (acierto ? 'border-emerald-400/60 bg-emerald-400/15' : 'border-rose-400/60 bg-rose-400/15') : 'hairline surf-1'} t-1`}
        aria-live="polite"
      >
        {bonito || <span className="t-3">…</span>}
      </div>
      {chosen && !acierto && (
        <p className="text-sm font-bold t-2">
          La buena: <b className="t-accent">{ok}</b>
        </p>
      )}
      {!chosen && (
        <div className="grid grid-cols-3 gap-2">
          {teclas.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pulsar(t)}
              disabled={t === '✔' && !texto}
              className={t === '✔' ? 'btn-primary h-12 text-xl disabled:opacity-40' : 'btn h-12 border text-xl font-black hairline surf-1 hover-soft t-1'}
              aria-label={t === '⌫' ? 'Borrar' : t === '✔' ? 'Comprobar' : t}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Una letra del alfabeto móvil. */
function Ficha({ letra, onClick, apagada, bien }: { letra: string; onClick?: () => void; apagada?: boolean; bien?: boolean | null }) {
  const color = VOCAL.test(letra) ? '#2563eb' : '#dc2626';
  const borde = bien === true ? '#34d399' : bien === false ? '#fb7185' : '#e3d5b5';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex h-11 w-10 items-center justify-center rounded-lg border-2 font-display text-xl font-black transition ${apagada ? 'opacity-20' : ''} ${onClick ? 'active:scale-95' : ''}`}
      style={{ background: '#fff', borderColor: borde, color }}
      aria-label={letra}
    >
      {letra}
    </button>
  );
}

function EscribeLetras({ question, chosen, onAnswer }: JuegoProps) {
  const ok = question.options[0].text;
  const conTilde = /tilde/i.test(question.prompt);

  // Las letras de la respuesta, más unas cuantas de despiste: la vocal con
  // y sin tilde cuando la tilde es lo que se trabaja, y alguna suelta.
  const fichas = useMemo(() => {
    const rand = makeRand(hashSeed(`${question.id}:letras`));
    const letras = ok.toLowerCase().split('');
    const extra = new Set<string>();
    for (const l of letras) {
      if (SIN_TILDE[l]) extra.add(SIN_TILDE[l]);
      else if (conTilde && CON_TILDE[l] && !letras.includes(CON_TILDE[l])) extra.add(CON_TILDE[l]);
    }
    const sueltas = barajar('aeiorstnlmcdp'.split('').filter((l) => !letras.includes(l)), rand).slice(0, Math.max(1, 3 - extra.size));
    return barajar([...letras, ...extra, ...sueltas], rand);
  }, [question.id, ok, conTilde]);

  const [usadas, setUsadas] = useState<number[]>([]);
  const palabra = usadas.map((i) => fichas[i]).join('');
  const acierto = norm(palabra) === norm(ok);

  return (
    <div className="space-y-3">
      {/* Lo escrito hasta ahora: se toca una letra para devolverla. */}
      <div className={`flex min-h-[64px] flex-wrap items-center gap-1 rounded-xl border p-2 ${chosen ? (acierto ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-rose-400/60 bg-rose-400/10') : 'hairline surf-1'}`} aria-live="polite">
        {usadas.length === 0 && <span className="px-2 text-sm t-3">Toca las letras para escribirla…</span>}
        {usadas.map((i, pos) => (
          <Ficha key={`${i}-${pos}`} letra={fichas[i]} onClick={chosen ? undefined : () => setUsadas((u) => u.filter((_, k) => k !== pos))} bien={chosen ? fichas[i] === ok.toLowerCase()[pos] : null} />
        ))}
      </div>
      {chosen && !acierto && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-sm font-bold t-2">Así era:</span>
          {ok.toLowerCase().split('').map((l, i) => (
            <Ficha key={i} letra={l} bien />
          ))}
        </div>
      )}
      {!chosen && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {fichas.map((l, i) => (
              <Ficha key={i} letra={l} apagada={usadas.includes(i)} onClick={usadas.includes(i) || usadas.length >= ok.length ? undefined : () => setUsadas((u) => [...u, i])} />
            ))}
          </div>
          <Comprobar disabled={usadas.length === 0} onClick={() => onAnswer(acierto)} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- ordenar */

function Ordena({ question, chosen, juego, onAnswer }: JuegoProps & { juego: Extract<Juego, { tipo: 'ordena' }> }) {
  const { items } = juego;
  // Barajados, y nunca ya en orden: si salen así, se rota uno.
  const barajados = useMemo(() => {
    const out = barajar(items.map((_, i) => i), makeRand(hashSeed(`${question.id}:ordena`)));
    return out.every((v, i) => v === i) ? [...out.slice(1), out[0]] : out;
  }, [question.id, items]);
  const [puestos, setPuestos] = useState<number[]>([]);
  const completo = puestos.length === items.length;
  const acierto = completo && puestos.every((v, i) => items[v] === items[i]);

  return (
    <div className="space-y-3">
      <div className={`min-h-[56px] rounded-xl border p-2 ${chosen ? (acierto ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-rose-400/60 bg-rose-400/10') : 'hairline surf-1'}`}>
        <p className="mb-1 text-[10px] font-black uppercase tracking-wider t-3">Tu orden</p>
        <ol className="flex flex-wrap gap-1.5">
          {puestos.length === 0 && <li className="text-sm t-3">Toca las fichas de abajo en orden…</li>}
          {puestos.map((v, pos) => (
            <li key={`${v}-${pos}`}>
              <button
                type="button"
                disabled={Boolean(chosen)}
                onClick={() => setPuestos((p) => p.filter((_, k) => k !== pos))}
                className={`btn gap-1.5 border px-2.5 py-1.5 text-sm font-bold ${tono(chosen, chosen ? items[v] === items[pos] : null)} disabled:opacity-100`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black surf-2 t-2">{pos + 1}</span>
                {items[v]}
              </button>
            </li>
          ))}
        </ol>
      </div>
      {chosen && !acierto && (
        <p className="text-sm font-bold leading-snug t-2">
          Así era: <b className="t-accent">{items.join(' → ')}</b>
        </p>
      )}
      {!chosen && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {barajados
              .filter((v) => !puestos.includes(v))
              .map((v) => (
                <button key={v} type="button" onClick={() => setPuestos((p) => [...p, v])} className="btn border px-3 py-2 text-sm font-bold hairline surf-1 hover-soft t-1">
                  {items[v]}
                </button>
              ))}
          </div>
          <Comprobar disabled={!completo} onClick={() => onAnswer(acierto)} />
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- emparejar */

const COLORES = ['#22d3ee', '#facc15', '#4ade80', '#fb7185', '#818cf8', '#fbbf24'];

function Empareja({ question, chosen, juego, onAnswer }: JuegoProps & { juego: Extract<Juego, { tipo: 'empareja' }> }) {
  const { pares } = juego;
  // La columna de la derecha, barajada; la izquierda va en su orden.
  const derecha = useMemo(() => barajar(pares.map((_, i) => i), makeRand(hashSeed(`${question.id}:pares`))), [question.id, pares]);
  const [sel, setSel] = useState<number | null>(null);
  /** Para cada fila de la izquierda, el par al que se ha unido por la derecha. */
  const [union, setUnion] = useState<Record<number, number>>({});
  const completo = Object.keys(union).length === pares.length;
  const acierto = completo && pares.every((_, i) => union[i] === i);

  const unir = (j: number) => {
    if (chosen || sel === null) return;
    setUnion((u) => {
      const n = { ...u };
      for (const k of Object.keys(n)) if (n[Number(k)] === j) delete n[Number(k)];
      n[sel] = j;
      return n;
    });
    setSel(null);
  };
  const colorDe = (i: number) => COLORES[i % COLORES.length];
  const filaDe = (j: number) => Number(Object.keys(union).find((k) => union[Number(k)] === j) ?? -1);

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold t-3">Toca una de la izquierda y luego la suya de la derecha.</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          {pares.map(([a], i) => {
            const unida = union[i] !== undefined;
            return (
              <button
                key={i}
                type="button"
                disabled={Boolean(chosen)}
                onClick={() => setSel(sel === i ? null : i)}
                className={`btn w-full justify-start border px-2.5 py-2 text-left text-sm font-bold leading-snug ${sel === i ? 'ring-2 ring-accent' : ''} ${tono(chosen, chosen ? union[i] === i : null)} disabled:opacity-100`}
                style={!chosen && unida ? { borderColor: colorDe(i), boxShadow: `inset 4px 0 0 ${colorDe(i)}` } : undefined}
              >
                {a}
              </button>
            );
          })}
        </div>
        <div className="space-y-1.5">
          {derecha.map((j) => {
            const fila = filaDe(j);
            return (
              <button
                key={j}
                type="button"
                disabled={Boolean(chosen) || sel === null}
                onClick={() => unir(j)}
                className={`btn w-full justify-start border px-2.5 py-2 text-left text-sm font-semibold leading-snug ${tono(chosen, chosen && fila >= 0 ? fila === j : null)} ${!chosen && sel === null ? 'disabled:opacity-100' : 'disabled:opacity-100'}`}
                style={!chosen && fila >= 0 ? { borderColor: colorDe(fila), boxShadow: `inset 4px 0 0 ${colorDe(fila)}` } : undefined}
              >
                {pares[j][1]}
              </button>
            );
          })}
        </div>
      </div>
      {chosen && !acierto && (
        <ul className="space-y-0.5 text-sm font-bold leading-snug t-2">
          {pares.map(([a, b], i) => (
            <li key={i}>
              {a} <span className="t-3">=</span> <b className="t-accent">{b}</b>
            </li>
          ))}
        </ul>
      )}
      {!chosen && <Comprobar disabled={!completo} onClick={() => onAnswer(acierto)} />}
    </div>
  );
}

/* ---------------------------------------------------------- clasificar */

function Clasifica({ question, chosen, juego, onAnswer }: JuegoProps & { juego: Extract<Juego, { tipo: 'clasifica' }> }) {
  const { cajas } = juego;
  const todos = useMemo(
    () => barajar(cajas.flatMap((c, ci) => c.items.map((it) => ({ it, ci }))), makeRand(hashSeed(`${question.id}:cajas`))),
    [question.id, cajas],
  );
  const [sel, setSel] = useState<string | null>(null);
  /** Dónde se ha metido cada cosa. */
  const [donde, setDonde] = useState<Record<string, number>>({});
  const completo = todos.every((t) => donde[t.it] !== undefined);
  const acierto = completo && todos.every((t) => donde[t.it] === t.ci);
  const cajaDe = (it: string) => cajas[todos.find((t) => t.it === it)!.ci].nombre;

  const meter = (ci: number) => {
    if (chosen || sel === null) return;
    setDonde((d) => ({ ...d, [sel]: ci }));
    setSel(null);
  };

  const ficha = (it: string, enCaja: boolean) => (
    <button
      key={it}
      type="button"
      disabled={Boolean(chosen)}
      onClick={(e) => {
        e.stopPropagation();
        setSel(sel === it ? null : it);
      }}
      className={`btn border px-2.5 py-1.5 text-sm font-bold ${sel === it ? 'ring-2 ring-accent' : ''} ${tono(chosen, chosen && enCaja ? donde[it] === todos.find((t) => t.it === it)!.ci : null)} disabled:opacity-100`}
    >
      {it}
    </button>
  );

  const sueltas = todos.filter((t) => donde[t.it] === undefined);

  return (
    <div className="space-y-3">
      {!chosen && (
        <div className="min-h-[44px] rounded-xl border p-2 hairline surf-1">
          <p className="mb-1 text-[10px] font-black uppercase tracking-wider t-3">{sel ? `Ahora toca la caja de «${sel}»` : sueltas.length ? 'Toca una y luego su caja' : '¡Todas en su caja! Comprueba.'}</p>
          <div className="flex flex-wrap gap-1.5">{sueltas.map((t) => ficha(t.it, false))}</div>
        </div>
      )}
      <div className={`grid gap-2 ${cajas.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {cajas.map((c, ci) => (
          <div
            key={c.nombre}
            role="button"
            tabIndex={chosen ? -1 : 0}
            onClick={() => meter(ci)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') meter(ci);
            }}
            className={`min-h-[96px] rounded-xl border-2 border-dashed p-2 transition ${sel && !chosen ? 'border-accent bg-accent-faint' : 'hairline surf-1'}`}
          >
            <p className="mb-1.5 text-center text-[11px] font-black leading-tight t-1">{c.nombre}</p>
            <div className="flex flex-wrap justify-center gap-1">{todos.filter((t) => donde[t.it] === ci).map((t) => ficha(t.it, true))}</div>
          </div>
        ))}
      </div>
      {chosen && !acierto && (
        <ul className="space-y-0.5 text-sm font-bold leading-snug t-2">
          {todos
            .filter((t) => donde[t.it] !== t.ci)
            .map((t) => (
              <li key={t.it}>
                {t.it} <span className="t-3">→</span> <b className="t-accent">{cajaDe(t.it)}</b>
              </li>
            ))}
        </ul>
      )}
      {!chosen && <Comprobar disabled={!completo} onClick={() => onAnswer(acierto)} />}
    </div>
  );
}

/* --------------------------------------------------- verdadero o falso */

function VerdaderoFalso({ question, chosen, juego, onAnswer }: JuegoProps & { juego: Extract<Juego, { tipo: 'vf' }> }) {
  const [dicho, setDicho] = useState<boolean | null>(null);
  const etiquetas = juego.en ? ['✅ True', '❌ False'] : ['✅ Verdadero', '❌ Falso'];

  const responder = (v: boolean) => {
    if (chosen) return;
    setDicho(v);
    onAnswer(v === juego.verdadero);
  };

  return (
    <div className="space-y-3">
      <p className="rounded-xl border p-3 font-display text-lg font-black leading-snug hairline surf-1 t-1">«{juego.afirmacion}»</p>
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((v, i) => {
          const bien = chosen ? (v === juego.verdadero ? true : dicho === v ? false : null) : null;
          return (
            <button
              key={String(v)}
              type="button"
              disabled={Boolean(chosen)}
              onClick={() => responder(v)}
              className={`btn h-14 border text-base font-black ${tono(chosen, bien)} ${chosen && bien === null ? 'opacity-50' : ''} disabled:opacity-100`}
            >
              {etiquetas[i]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
