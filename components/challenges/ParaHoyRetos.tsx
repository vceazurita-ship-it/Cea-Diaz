'use client';

import { useMemo } from 'react';
import { useGranted } from '@/components/games/DailyGameCard';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { buildGameRound, gameResultFor, isGameDone } from '@/lib/games';
import { prefersReducedMotion } from '@/lib/haptics';
import { PENALTY_SHOTS, isPenaltyDone, penaltyGate, penaltyResultFor } from '@/lib/penalties';
import { RETO_META, resultadosDe, retoSuperado, retosDelDia } from '@/lib/retoCole';
import { buildRetoFutbol, futbolResultFor, futbolSuperado } from '@/lib/retoFutbol';
import { computeDayScore } from '@/lib/scoring';
import { entryKey } from '@/lib/storage';
import type { DateKey, DayEntry, Profile } from '@/types';

/* =========================================================================
 *  «Para hoy», en la pestaña de Retos de los peques.
 *
 *  Lo mismo que hace la portada con la casa, aquí con lo que se juega hoy:
 *  el cole, el fútbol, el juego, los penaltis y los retos de la semana, cada
 *  uno con su anillo y en una sola tarjeta. Lo que queda va primero y lo
 *  hecho, al final y apagado. Cada casilla baja directa a su tarjeta: antes
 *  había que ir bajando para descubrir qué faltaba.
 *
 *  No anota nada: lee del día lo mismo que leen las tarjetas, con las mismas
 *  reglas, para que el resumen y la tarjeta digan siempre lo mismo.
 * ========================================================================= */

interface ParaHoyRetosProps {
  profile: Profile;
  date: DateKey;
  entries: Record<string, DayEntry>;
  /** Qué partes tiene este perfil; las que no tiene no salen. */
  cole: boolean;
  futbol: boolean;
  juego: boolean;
  penaltis: boolean;
  semana: { done: number; total: number };
}

interface Casilla {
  id: string;
  /** Adónde baja al tocarla. */
  ancla: string;
  icon: string;
  titulo: string;
  sub: string;
  ratio: number;
  /** Lo que va dentro del anillo. */
  marcador: string;
  hecho: boolean;
  /** Cerrada todavía: no se puede jugar hasta cumplir lo que pide. */
  cerrada?: boolean;
}

/** Baja a la tarjeta; con «reducir movimiento», salto directo. */
function irA(ancla: string) {
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
  document.getElementById(ancla)?.scrollIntoView({ behavior, block: 'start' });
}

export function ParaHoyRetos({ profile, date, entries, cole, futbol, juego, penaltis, semana }: ParaHoyRetosProps) {
  const granted = useGranted(profile.id);
  const round = useMemo(() => (juego ? buildGameRound(profile, date) : null), [juego, profile, date]);
  const sesion = useMemo(() => (futbol ? buildRetoFutbol(profile.id, date) : null), [futbol, profile.id, date]);
  const dayRatio = useMemo(
    () => computeDayScore(profile.id, date, entries[entryKey(profile.id, date)]).ratio,
    [profile.id, date, entries],
  );

  const casillas: Casilla[] = [];

  if (cole) {
    const retos = retosDelDia(date, profile.id);
    const resultados = resultadosDe(entries, profile.id, date);
    const jugados = retos.filter((r) => {
      const x = resultados[r];
      return Boolean(x && x.answered >= x.total);
    }).length;
    const ganados = retos.filter((r) => retoSuperado(resultados[r])).length;
    // El primero sin jugar, en el orden en que conviene hacerlos (el que
    // toca hoy va delante en `retosDelDia`).
    const siguiente = retos.find((r) => {
      const x = resultados[r];
      return !(x && x.answered >= x.total);
    });
    casillas.push({
      id: 'cole',
      ancla: 'reto-cole',
      icon: '📚',
      titulo: 'Cole',
      sub:
        jugados >= retos.length || !siguiente
          ? `${ganados} ${ganados === 1 ? 'tiro ganado' : 'tiros ganados'}`
          : `Toca ${RETO_META[siguiente].icon} ${RETO_META[siguiente].nombre}`,
      ratio: retos.length ? jugados / retos.length : 0,
      marcador: `${jugados}/${retos.length}`,
      hecho: jugados >= retos.length,
    });
  }

  if (sesion) {
    const r = futbolResultFor(entries, profile.id, date);
    const total = sesion.questions.length;
    const answered = r?.answered ?? 0;
    const hecho = answered >= total;
    casillas.push({
      id: 'futbol',
      ancla: 'reto-futbol',
      icon: '⚽',
      titulo: 'Fútbol',
      sub: hecho ? (futbolSuperado(r) ? '+1 ⚡ en la tanda' : `${r?.correct ?? 0}/${total}: mañana más`) : answered > 0 ? `Vas por la ${answered + 1}` : `«${sesion.sesion.titulo}»`,
      ratio: total ? answered / total : 0,
      marcador: hecho ? '✓' : `${answered}/${total}`,
      hecho,
    });
  }

  if (round) {
    const r = gameResultFor(entries, profile.id, date);
    const total = round.questions.length;
    const answered = r?.answered ?? 0;
    const hecho = r ? isGameDone(r) : false;
    casillas.push({
      id: 'juego',
      ancla: 'juego-dia',
      icon: round.icon,
      titulo: 'Juego',
      sub: hecho ? `${r?.correct}/${total} aciertos` : answered > 0 ? `Vas por la ${answered + 1}` : round.title,
      ratio: total ? answered / total : 0,
      marcador: hecho ? '✓' : `${answered}/${total}`,
      hecho,
    });

    if (penaltis) {
      const p = penaltyResultFor(entries, profile.id, date);
      const gate = penaltyGate({
        correct: r?.correct ?? 0,
        total,
        dayRatio,
        // La misma regla que la tarjeta: una tanda repetida cuenta como abierta.
        granted: granted || (p?.round ?? 0) > 0,
      });
      const hecho = p ? isPenaltyDone(p) : false;
      const falta = gate.parts.find((x) => !x.done);
      casillas.push({
        id: 'penaltis',
        ancla: 'juego-dia',
        icon: '🥅',
        titulo: 'Penaltis',
        sub: hecho
          ? `${p?.scored} de ${p?.total} goles`
          : gate.open
            ? p && p.taken > 0
              ? `Vas por el ${p.taken + 1}`
              : '¡Abierta! A por Benji'
            : falta
              ? `🔒 ${falta.label}`
              : '🔒 Cerrada',
        ratio: p && p.total ? p.taken / p.total : 0,
        marcador: hecho ? '✓' : gate.open ? `${p?.taken ?? 0}/${p?.total ?? PENALTY_SHOTS}` : '🔒',
        hecho,
        cerrada: !gate.open && !hecho,
      });
    }
  }

  if (semana.total > 0) {
    casillas.push({
      id: 'semana',
      ancla: 'retos-semana',
      icon: '🎯',
      titulo: 'Semana',
      sub: semana.done >= semana.total ? 'Semana redonda 🏆' : `Quedan ${semana.total - semana.done}`,
      ratio: semana.done / semana.total,
      marcador: `${semana.done}/${semana.total}`,
      hecho: semana.done >= semana.total,
    });
  }

  if (casillas.length === 0) return null;

  // Lo que se puede hacer ya, primero; lo cerrado, después; lo hecho, al final.
  const peso = (c: Casilla) => (c.hecho ? 2 : c.cerrada ? 1 : 0);
  const orden = [...casillas].sort((a, b) => peso(a) - peso(b));
  const quedan = casillas.filter((c) => !c.hecho).length;

  return (
    <section className="card-kid p-3" aria-labelledby="para-hoy-retos">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h2 id="para-hoy-retos" className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] t-3">
          {quedan > 0 && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--danger)]" aria-hidden />}
          Para hoy
        </h2>
        <span className="ml-auto text-[11px] font-black t-2" aria-live="polite">
          {quedan === 0 ? '¡Todo hecho! 🎉' : `Te ${quedan === 1 ? 'queda' : 'quedan'} ${quedan}`}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-1.5">
        {orden.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => irA(c.ancla)}
              aria-label={`${c.titulo}: ${c.hecho ? 'hecho' : c.sub}. Ir a la tarjeta`}
              className={`flex h-full w-full items-center gap-2 rounded-2xl border p-2 text-left transition active:scale-[0.98] hover-soft ${
                c.hecho ? 'hairline opacity-60' : c.cerrada ? 'hairline surf-1' : 'border-accent bg-accent-faint'
              }`}
            >
              <ProgressRing ratio={c.ratio} size={40} stroke={4}>
                <span className={`font-black tabular-nums t-1 ${c.marcador.length > 3 ? 'text-[10px]' : 'text-[12px]'}`}>{c.marcador}</span>
              </ProgressRing>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-black leading-tight t-1">
                  <span aria-hidden>{c.icon}</span> {c.titulo}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-semibold leading-tight t-3">{c.hecho ? `✓ ${c.sub}` : c.sub}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
