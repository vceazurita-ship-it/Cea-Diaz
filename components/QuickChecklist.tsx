'use client';

import { useEffect, useRef, useState } from 'react';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { ahoraEnMadrid, diaEfectivo, interpretar, type Propuesta, type ResultadoApuntar } from '@/lib/agentes/apuntar';
import { addDays, formatShort } from '@/lib/dates';
import { findMetric } from '@/lib/habits';
import { success, tap } from '@/lib/haptics';
import { getProfile } from '@/lib/profiles';
import { formatMetricValue } from '@/lib/scoring';
import type { DateKey, HabitCategory, MetricValue, ProfileId } from '@/types';

/* =========================================================================
 *  El registro exprés: todas las casillas de sí o no del día, juntas.
 *
 *  Un registro de setenta casillas repartidas en siete tarjetas se deja de
 *  hacer: hay que abrir, bajar, cerrar… y un día que no apetece se salta, y
 *  luego otro. La mayoría son de sí o no («día sin alcohol», «movilidad»,
 *  «lectura»), y esas se pueden marcar todas de un vistazo, aquí arriba, en
 *  medio minuto. Las de cantidades y marcas siguen abajo, en su tarjeta, para
 *  cuando haya tiempo.
 *
 *  Sólo entra lo que puntúa: las casillas con peso cero (qué sesión del
 *  reparto tocaba, por ejemplo) se quedan en su sitio.
 *
 *  Las pastillas van de dos en dos (tres o cuatro en pantalla ancha) y no una
 *  por línea: con treinta casillas de nombres largos, el flujo libre dejaba
 *  casi todas solas en su fila y el exprés medía tres pantallas. Lo que ya
 *  está aquí no se repite abajo: las tarjetas lo pliegan (ver `quickIds`).
 *
 *  Y arriba del todo, «Dímelo»: una línea para escribir o dictar lo del día
 *  («anoche dormí siete y media, dos vasos de agua, Leo veinte minutos de
 *  lectura») y confirmar de un toque las casillas que salen. Lo traduce
 *  `lib/agentes/apuntar.ts`, en el aparato y sin llamar a nadie.
 * ========================================================================= */

/** Con menos de estas casillas de sí o no, no compensa la tarjeta. */
const MINIMO = 8;

/** Las casillas que van al exprés, en el orden de las tarjetas. */
export function quickItems(categories: HabitCategory[]) {
  return categories.flatMap((c) =>
    c.metrics.filter((m) => m.type === 'toggle' && m.weight !== 0).map((m) => ({ id: m.id, label: m.label, icon: m.icon, cat: c.icon })),
  );
}

/**
 * Los ids que el exprés se queda, o ninguno si no compensa la tarjeta. Es lo
 * que las tarjetas de abajo usan para no repetir esas casillas.
 */
export function quickIds(categories: HabitCategory[]): ReadonlySet<string> {
  const items = quickItems(categories);
  return new Set(items.length < MINIMO ? [] : items.map((m) => m.id));
}

interface QuickChecklistProps {
  categories: HabitCategory[];
  values: Record<string, MetricValue>;
  onChange: (metricId: string, value: boolean) => void;
  /** Con el filtro de pendientes puesto, sólo las que aún no se han contestado. */
  onlyPending?: boolean;
  /** Panel en el que se está: a él va lo que se dice en «Dímelo» sin nombrar a nadie. */
  profileId?: ProfileId;
  /**
   * Guardar un valor en cualquier perfil y día: lo que se apunta con
   * «Dímelo» puede ser de ayer o de los peques. Sin esto, no hay «Dímelo».
   */
  onSet?: (profileId: ProfileId, date: DateKey, metricId: string, value: MetricValue) => void;
}

export function QuickChecklist({ categories, values, onChange, onlyPending = false, profileId, onSet }: QuickChecklistProps) {
  const items = quickItems(categories);
  const contestadas = items.filter((m) => values[m.id] !== undefined).length;
  // Abierta mientras quede algo; con todo contestado, plegada y con su cuenta.
  const [abierta, setAbierta] = useState(contestadas < items.length);
  if (items.length < MINIMO) return null;
  const hechas = items.filter((m) => values[m.id] === true).length;
  const visibles = onlyPending ? items.filter((m) => values[m.id] === undefined) : items;

  return (
    <section className="card p-3 sm:p-4" aria-labelledby="registro-expres">
      <button type="button" onClick={() => setAbierta((v) => !v)} className="flex w-full items-center gap-3 text-left" aria-expanded={abierta}>
        <ProgressRing ratio={items.length ? contestadas / items.length : 0} size={40} stroke={4}>
          <span className="text-[11px] font-black t-1" aria-hidden>
            {contestadas === items.length ? '✓' : '⚡'}
          </span>
        </ProgressRing>
        <span className="min-w-0 flex-1">
          <span id="registro-expres" className="block text-[11px] font-black uppercase tracking-[0.18em] t-3">
            Registro exprés
          </span>
          <span className="block text-sm font-bold t-1">
            {contestadas === 0
              ? `${items.length} de sí o no, de un toque`
              : `${hechas} hechas · ${contestadas}/${items.length} contestadas`}
          </span>
        </span>
        <span className={`text-sm t-3 transition-transform ${abierta ? 'rotate-180' : ''}`} aria-hidden>
          ▾
        </span>
      </button>
      {/* Fuera del pliegue: con todo marcado, decir lo de las cantidades sigue a mano. */}
      {profileId && onSet && <Dimelo profileId={profileId} onSet={onSet} />}
      {abierta && (
        <>
          {visibles.length === 0 ? (
            <p className="mt-3 text-xs t-3">Todas contestadas. Quita «Sólo pendientes» para repasarlas.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {visibles.map((m) => {
                const v = values[m.id];
                return (
                  <li key={m.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        tap();
                        onChange(m.id, v !== true);
                      }}
                      aria-pressed={v === true}
                      title={m.label}
                      className={`flex min-h-[2.75rem] w-full items-center gap-1.5 rounded-xl border px-2 py-1.5 text-left text-[12px] font-semibold leading-tight transition active:scale-95 ${
                        v === true ? 'border-accent bg-accent-soft t-1' : v === false ? 'hairline surf-1 t-3 line-through' : 'hairline surf-1 t-2 hover-soft'
                      }`}
                    >
                      <span aria-hidden className="shrink-0">
                        {v === true ? '✅' : m.icon}
                      </span>
                      <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{m.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[11px] t-3">Toca otra vez para desmarcar. Lo de cantidades y marcas, en su tarjeta de abajo.</p>
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * «Dímelo»
 * ------------------------------------------------------------------------- */

/** Lo mínimo del reconocimiento de voz del navegador que se usa aquí. */
interface Reconocedor {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type ReconocedorCtor = new () => Reconocedor;

/** El dictado sólo existe en algunos navegadores (Chrome, Safari): si no está, no hay botón. */
function reconocedorDelNavegador(): ReconocedorCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: ReconocedorCtor; webkitSpeechRecognition?: ReconocedorCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** «ayer», «anteayer» o la fecha corta: sólo se pinta si no es hoy. */
function cuando(date: DateKey, hoy: DateKey): string {
  if (date === addDays(hoy, -1)) return 'ayer';
  if (date === addDays(hoy, -2)) return 'anteayer';
  return formatShort(date);
}

interface DimeloProps {
  profileId: ProfileId;
  onSet: (profileId: ProfileId, date: DateKey, metricId: string, value: MetricValue) => void;
}

function Dimelo({ profileId, onSet }: DimeloProps) {
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<(ResultadoApuntar & { hoy: DateKey }) | null>(null);
  const [marcadas, setMarcadas] = useState<ReadonlySet<number>>(new Set());
  const [hecho, setHecho] = useState<string | null>(null);
  const [voz, setVoz] = useState<ReconocedorCtor | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  const reconocedor = useRef<Reconocedor | null>(null);

  // Se mira tras montar: en el servidor no hay `window`, y así no se descuadra la hidratación.
  useEffect(() => {
    setVoz(() => reconocedorDelNavegador());
    return () => reconocedor.current?.stop();
  }, []);

  const entender = (frase: string) => {
    setHecho(null);
    if (!frase.trim()) {
      setResultado(null);
      return;
    }
    const { hoy, hora } = ahoraEnMadrid();
    const r = interpretar(frase, { perfilActual: profileId, hoy, hora });
    setResultado({ ...r, hoy: diaEfectivo(hoy, hora) });
    // Las de confianza baja salen desmarcadas: son una conjetura.
    setMarcadas(new Set(r.propuestas.flatMap((p, i) => (p.confianza === 'baja' ? [] : [i]))));
  };

  const dictar = () => {
    if (!voz) return;
    if (escuchando) {
      reconocedor.current?.stop();
      return;
    }
    tap();
    const rec = new voz();
    rec.lang = 'es-ES';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const dicho = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      // Lo dictado se suma a lo escrito: se puede ir diciendo a trozos.
      const frase = texto.trim() ? `${texto.trim()}, ${dicho}` : dicho;
      setTexto(frase);
      entender(frase);
    };
    rec.onend = () => setEscuchando(false);
    rec.onerror = () => setEscuchando(false);
    reconocedor.current = rec;
    setEscuchando(true);
    rec.start();
  };

  const apuntar = () => {
    if (!resultado) return;
    const elegidas = resultado.propuestas.filter((_, i) => marcadas.has(i));
    if (elegidas.length === 0) return;
    for (const p of elegidas) onSet(p.profileId, p.date, p.metricId, p.value);
    success();
    setHecho(`✓ ${elegidas.length === 1 ? 'Apuntada' : `${elegidas.length} apuntadas`}`);
    setTexto('');
    setResultado(null);
  };

  const alternar = (i: number) => {
    tap();
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const nombre = (p: Propuesta) => {
    const metrica = findMetric(p.profileId, p.metricId);
    return { icon: metrica?.icon ?? '•', label: metrica?.label ?? p.metricId, valor: metrica ? formatMetricValue(metrica, p.value) : String(p.value) };
  };

  return (
    <div className="mt-3">
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          entender(texto);
        }}
      >
        <label htmlFor="dimelo" className="sr-only">
          Dímelo: escribe lo del día
        </label>
        <input
          id="dimelo"
          type="text"
          enterKeyHint="go"
          autoComplete="off"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            if (hecho) setHecho(null);
          }}
          placeholder="Dímelo: «dormí 7 y media, 2 vasos de agua…»"
          className="field min-w-0 flex-1 py-1.5 text-[13px]"
        />
        {voz && (
          <button
            type="button"
            onClick={dictar}
            aria-pressed={escuchando}
            aria-label={escuchando ? 'Parar el dictado' : 'Dictar'}
            title={escuchando ? 'Parar' : 'Dictar'}
            className={`btn shrink-0 border px-3 ${escuchando ? 'border-accent bg-accent-soft t-1 animate-pulse' : 'hairline surf-1 t-2 hover-soft'}`}
          >
            <span aria-hidden>🎙️</span>
          </button>
        )}
        <button type="submit" disabled={!texto.trim()} className="btn-ghost shrink-0 px-3 text-[13px]">
          Ver
        </button>
      </form>

      {hecho && !resultado && <p className="mt-1.5 text-[11px] font-semibold t-ok">{hecho}</p>}

      {resultado && (
        <div className="mt-2">
          {resultado.propuestas.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Lo que he entendido">
              {resultado.propuestas.map((p, i) => {
                const { icon, label, valor } = nombre(p);
                const on = marcadas.has(i);
                return (
                  <li key={`dimelo-${i}-${p.profileId}-${p.metricId}`} className="min-w-0 max-w-full">
                    <button
                      type="button"
                      onClick={() => alternar(i)}
                      aria-pressed={on}
                      title={`«${p.origen}»`}
                      className={`flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-[12px] font-semibold leading-tight transition active:scale-95 ${
                        on ? 'border-accent bg-accent-soft t-1' : 'hairline surf-1 t-3'
                      }`}
                    >
                      <span aria-hidden className="shrink-0">
                        {on ? '✅' : icon}
                      </span>
                      <span className="min-w-0 truncate">
                        {p.profileId !== profileId && <span className="t-info">{getProfile(p.profileId).name} · </span>}
                        {label}: <span className="font-black">{valor}</span>
                        {p.date !== resultado.hoy && <span className="t-3"> · {cuando(p.date, resultado.hoy)}</span>}
                      </span>
                      {p.confianza !== 'alta' && (
                        <span
                          className={`shrink-0 text-[10px] font-black ${p.confianza === 'baja' ? 't-warn' : 't-info'}`}
                          title={p.confianza === 'baja' ? 'Es una suposición: compruébalo' : 'Algo he supuesto'}
                        >
                          ?
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[12px] t-3">No he sacado ninguna casilla de eso.</p>
          )}

          {resultado.noEntendido.length > 0 && (
            <p className="mt-1.5 text-[11px] t-3">
              Sin entender: {resultado.noEntendido.map((t) => `«${t}»`).join(' · ')}
            </p>
          )}

          {resultado.propuestas.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={apuntar} disabled={marcadas.size === 0} className="btn-primary px-4 py-1.5 text-[13px]">
                Apuntar {marcadas.size}
              </button>
              <button
                type="button"
                onClick={() => {
                  setResultado(null);
                  setTexto('');
                }}
                className="text-[12px] font-semibold t-3 hover:underline"
              >
                Descartar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
