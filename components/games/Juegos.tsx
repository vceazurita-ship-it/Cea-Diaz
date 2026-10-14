'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { hashSeed } from '@/lib/challenges';
import { barajar, makeRand } from '@/lib/temario';
import { playCue } from '@/lib/sound';
import { feedbackClass } from '@/lib/ui/tone';
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
 *   · **Memoria**: las parejas boca abajo, de dos en dos.
 *   · **Burbujas**: se explotan sólo las que son de una caja.
 *   · **Globos**: la palabra se adivina letra a letra; cada fallo pincha
 *     un globo.
 *   · **Cálculo relámpago**: seis cuentas de cabeza contra el reloj.
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
    case 'memoria':
      return <Memoria {...props} juego={juego} />;
    case 'burbujas':
      return <Burbujas {...props} juego={juego} />;
    case 'globos':
      return <Globos {...props} juego={juego} />;
    case 'relampago':
      return <Relampago {...props} juego={juego} />;
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
  `${feedbackClass(!chosen ? null : bien, 'hairline surf-1 hover-soft')} t-1`;

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
        className={`flex min-h-[56px] items-center justify-end rounded-xl border px-4 font-display text-3xl font-black tabular-nums ${feedbackClass(chosen ? acierto : null)} t-1`}
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
      <div className={`flex min-h-[64px] flex-wrap items-center gap-1 rounded-xl border p-2 ${feedbackClass(chosen ? acierto : null)}`} aria-live="polite">
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
      <div className={`min-h-[56px] rounded-xl border p-2 ${feedbackClass(chosen ? acierto : null)}`}>
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

/* ------------------------------------------------------------- memoria */

function Memoria({ question, chosen, juego, onAnswer }: JuegoProps & { juego: Extract<Juego, { tipo: 'memoria' }> }) {
  const { pares } = juego;
  const cartas = useMemo(
    () => barajar(pares.flatMap(([a, b], par) => [{ par, texto: a }, { par, texto: b }]), makeRand(hashSeed(`${question.id}:memoria`))),
    [question.id, pares],
  );
  /** Los fallos que se perdonan: levantar a ciegas al principio es parte del juego. */
  const permitidos = pares.length + 2;
  const [abiertas, setAbiertas] = useState<number[]>([]);
  const [halladas, setHalladas] = useState<number[]>([]);
  const [fallos, setFallos] = useState(0);
  const terminado = useRef(false);

  const levantar = (i: number) => {
    if (chosen || terminado.current || abiertas.length >= 2 || abiertas.includes(i) || halladas.includes(cartas[i].par)) return;
    const ahora = [...abiertas, i];
    setAbiertas(ahora);
    if (ahora.length < 2) return;
    const [x, y] = ahora;
    if (cartas[x].par === cartas[y].par) {
      playCue('acierto');
      const todas = [...halladas, cartas[x].par];
      setHalladas(todas);
      setAbiertas([]);
      if (todas.length === pares.length) {
        terminado.current = true;
        onAnswer(fallos <= permitidos);
      }
    } else {
      const f = fallos + 1;
      setFallos(f);
      window.setTimeout(() => setAbiertas([]), 900);
      if (f > permitidos) {
        terminado.current = true;
        window.setTimeout(() => onAnswer(false), 900);
      }
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold t-3">
        Levanta dos cartas: si son pareja, se quedan boca arriba. Fallos: {fallos} de {permitidos} permitidos.
      </p>
      <div className={`grid gap-2 ${cartas.length > 8 ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {cartas.map((c, i) => {
          const hallada = halladas.includes(c.par);
          const vista = Boolean(chosen) || hallada || abiertas.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => levantar(i)}
              disabled={Boolean(chosen) || hallada}
              className={`flex min-h-[64px] items-center justify-center rounded-xl border-2 p-2 text-center text-[13px] font-black leading-tight transition disabled:opacity-100 ${
                vista
                  ? `animate-voltea ${hallada ? 'border-emerald-400 bg-emerald-400/15 t-1' : 'border-accent surf-1 t-1'}`
                  : 'border-transparent bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl text-white shadow-md active:scale-95'
              }`}
              aria-label={vista ? c.texto : 'Carta boca abajo'}
            >
              {vista ? c.texto : '❓'}
            </button>
          );
        })}
      </div>
      {chosen && (
        <ul className="space-y-0.5 text-sm font-bold leading-snug t-2">
          {pares.map(([a, b], i) => (
            <li key={i}>
              {a} <span className="t-3">=</span> <b className="t-accent">{b}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ burbujas */

const BURBUJA = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb7185'];

function Burbujas({ chosen, juego, onAnswer }: JuegoProps & { juego: Extract<Juego, { tipo: 'burbujas' }> }) {
  const { items } = juego;
  const [rotas, setRotas] = useState<number[]>([]);
  const acierto = items.every((it, i) => it.ok === rotas.includes(i));

  const tocar = (i: number) => {
    if (chosen) return;
    if (!rotas.includes(i)) playCue('pop');
    setRotas((r) => (r.includes(i) ? r.filter((k) => k !== i) : [...r, i]));
  };

  return (
    <div className="space-y-3">
      <div className="flex min-h-[150px] flex-wrap items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-sky-400/15 to-indigo-500/10 p-3">
        {items.map((it, i) => {
          const rota = rotas.includes(i);
          const bien = chosen ? it.ok === rota : null;
          const color = BURBUJA[i % BURBUJA.length];
          return (
            <button
              key={i}
              type="button"
              onClick={() => tocar(i)}
              disabled={Boolean(chosen)}
              className={`relative flex h-[84px] w-[84px] items-center justify-center rounded-full p-1.5 text-center text-[12px] font-black leading-tight shadow-lg transition disabled:opacity-100 ${rota && !chosen ? 'scale-90 opacity-50 line-through' : 'animate-flota'}`}
              style={{
                animationDelay: `${(i % 5) * 0.37}s`,
                background: chosen
                  ? bien
                    ? 'rgba(52,211,153,.35)'
                    : 'rgba(251,113,133,.4)'
                  : `radial-gradient(circle at 30% 28%, rgba(255,255,255,.85) 0 9%, ${color}55 10%, ${color}aa 100%)`,
                border: `2px solid ${chosen ? (bien ? '#34d399' : '#fb7185') : 'rgba(255,255,255,.7)'}`,
                color: '#0f172a',
              }}
              aria-pressed={rota}
            >
              {rota && !chosen ? `💥 ${it.t}` : it.t}
              {chosen && it.ok && <span className="absolute -right-1 -top-1 text-base">{rota ? '✅' : '⭕'}</span>}
            </button>
          );
        })}
      </div>
      {chosen && !acierto && (
        <p className="text-sm font-bold leading-snug t-2">
          {juego.en ? 'The right ones:' : 'Eran éstas:'}{' '}
          <b className="t-accent">
            {items
              .filter((it) => it.ok)
              .map((it) => it.t)
              .join(', ')}
          </b>
        </p>
      )}
      {!chosen && (
        <>
          <p className="text-[11px] font-bold t-3">{juego.en ? 'Popped one by mistake? Tap it again to bring it back.' : 'Si explotas una sin querer, tócala otra vez y vuelve.'}</p>
          <Comprobar disabled={rotas.length === 0} onClick={() => onAnswer(acierto)} />
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- globos */

const sinTilde = (l: string) => SIN_TILDE[l] ?? (l === 'ü' ? 'u' : l);
const ES_LETRA = /[a-zñ]/;
const GLOBOS = 6;

function Globos({ chosen, juego, onAnswer }: JuegoProps & { juego: Extract<Juego, { tipo: 'globos' }> }) {
  const letras = juego.palabra.split('');
  const abc = (juego.en ? 'abcdefghijklmnopqrstuvwxyz' : 'abcdefghijklmnñopqrstuvwxyz').split('');
  const [dichas, setDichas] = useState<string[]>([]);
  const esta = (l: string) => letras.some((x) => sinTilde(x) === l);
  const fallos = dichas.filter((l) => !esta(l)).length;
  const vivos = GLOBOS - fallos;
  const resuelta = letras.every((x) => !ES_LETRA.test(sinTilde(x)) || dichas.includes(sinTilde(x)));
  const avisado = useRef(false);

  useEffect(() => {
    if (chosen || avisado.current) return;
    if (resuelta || vivos <= 0) {
      avisado.current = true;
      onAnswer(resuelta);
    }
  }, [resuelta, vivos, chosen, onAnswer]);

  const decir = (l: string) => {
    if (chosen || dichas.includes(l) || vivos <= 0 || resuelta) return;
    playCue(esta(l) ? 'acierto' : 'pop');
    setDichas((d) => [...d, l]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-1 text-3xl" aria-label={`${vivos} globos`}>
        {Array.from({ length: GLOBOS }, (_, i) => (
          <span key={i} className={i < vivos ? 'animate-flota' : 'opacity-30 grayscale'} style={{ animationDelay: `${i * 0.3}s` }}>
            {i < vivos ? '🎈' : '💥'}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5" aria-live="polite">
        {letras.map((x, i) => {
          const dicha = dichas.includes(sinTilde(x)) || !ES_LETRA.test(sinTilde(x));
          const visible = Boolean(chosen) || dicha;
          return (
            <span
              key={i}
              className={`flex h-11 w-9 items-end justify-center border-b-4 pb-0.5 font-display text-2xl font-black uppercase ${chosen && !dicha ? 't-danger' : 't-1'}`}
              style={{ borderColor: 'currentColor' }}
            >
              {visible ? x : ''}
            </span>
          );
        })}
      </div>
      {!chosen && (
        <div className="grid grid-cols-7 gap-1 sm:grid-cols-9">
          {abc.map((l) => {
            const dicha = dichas.includes(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => decir(l)}
                disabled={dicha}
                className={`h-10 rounded-lg border text-base font-black uppercase transition active:scale-95 ${dicha ? (esta(l) ? 'border-emerald-400 bg-emerald-400/20 t-1' : 'opacity-25 hairline t-3') : 'hairline surf-1 hover-soft'}`}
                style={dicha ? undefined : { color: VOCAL.test(l) ? '#2563eb' : '#dc2626' }}
              >
                {l}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------- cálculo relámpago */

function Relampago({ chosen, juego, onAnswer }: JuegoProps & { juego: Extract<Juego, { tipo: 'relampago' }> }) {
  const { ops, segundos } = juego;
  const [empezado, setEmpezado] = useState(false);
  const [quedan, setQuedan] = useState(segundos);
  const [i, setI] = useState(0);
  const [texto, setTexto] = useState('');
  const [hechas, setHechas] = useState<{ dicho: string; bien: boolean }[]>([]);
  const [destello, setDestello] = useState<boolean | null>(null);
  const cerrado = useRef(false);

  const cerrar = (lista: { bien: boolean }[]) => {
    if (cerrado.current) return;
    cerrado.current = true;
    onAnswer(lista.filter((h) => h.bien).length >= ops.length - 1);
  };

  useEffect(() => {
    if (!empezado || chosen || cerrado.current) return;
    if (quedan <= 0) {
      playCue('fuera');
      cerrar(hechas);
      return;
    }
    const t = window.setTimeout(() => setQuedan((q) => q - 1), 1000);
    return () => window.clearTimeout(t);
  }, [empezado, quedan, chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = () => {
    if (!texto || cerrado.current) return;
    const bien = Number(texto) === ops[i].a;
    playCue(bien ? 'acierto' : 'fallo');
    setDestello(bien);
    window.setTimeout(() => setDestello(null), 300);
    const lista = [...hechas, { dicho: texto, bien }];
    setHechas(lista);
    setTexto('');
    if (i + 1 >= ops.length) cerrar(lista);
    else setI(i + 1);
  };

  const pulsar = (t: string) => {
    if (t === '⌫') setTexto((v) => v.slice(0, -1));
    else if (t === '✔') enviar();
    else if (texto.length < 6) setTexto((v) => v + t);
  };

  if (chosen) {
    return (
      <ul className="grid grid-cols-2 gap-1.5 text-sm font-bold">
        {ops.map((o, k) => {
          const h = hechas[k];
          return (
            <li key={k} className={`rounded-lg border px-2 py-1.5 ${feedbackClass(h ? h.bien : false)} t-1`}>
              {o.q} = <b>{o.a}</b>
              {h && !h.bien && <span className="ml-1 line-through t-3">{h.dicho}</span>}
              {!h && <span className="ml-1 t-3">⏱️</span>}
            </li>
          );
        })}
      </ul>
    );
  }

  if (!empezado) {
    return (
      <button type="button" onClick={() => setEmpezado(true)} className="btn-primary h-16 w-full text-lg">
        ⚡ ¡Empezar! · {ops.length} cuentas en {segundos} s
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full surf-3">
          <div className={`h-full rounded-full transition-all duration-1000 ${quedan <= 10 ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${(quedan / segundos) * 100}%` }} />
        </div>
        <span className={`w-10 text-right font-display text-lg font-black tabular-nums ${quedan <= 10 ? 't-danger' : 't-1'}`}>{quedan}s</span>
      </div>
      <p className="text-center text-[11px] font-black uppercase tracking-wider t-3">
        Cuenta {i + 1} de {ops.length} · {hechas.filter((h) => h.bien).length} ✅
      </p>
      <div
        className={`flex min-h-[72px] items-center justify-center gap-3 rounded-2xl border-2 font-display text-3xl font-black tabular-nums transition ${
          destello === true ? 'border-emerald-400 bg-emerald-400/20' : destello === false ? 'border-rose-400 bg-rose-400/20' : 'hairline surf-1'
        } t-1`}
      >
        <span>{ops[i].q} =</span>
        <span className="min-w-[2ch] t-accent">{texto || '?'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✔'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => pulsar(t)}
            disabled={t === '✔' && !texto}
            className={t === '✔' ? 'btn-primary h-12 text-xl disabled:opacity-40' : 'btn h-12 border text-xl font-black hairline surf-1 hover-soft t-1'}
            aria-label={t === '⌫' ? 'Borrar' : t === '✔' ? 'Siguiente' : t}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
