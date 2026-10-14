'use client';

import { useMemo, useState } from 'react';

import { ProgressBar } from '@/components/ui/ProgressBar';
import { GRADE_COLOR, GRADE_NAME, GRADE_ON_FILL, GRADE_TEXT, NO_GRADE_COLOR, NO_GRADE_TEXT } from '@/lib/academics';
import { friendlyDateLabel } from '@/lib/dates';
import { cuandoEs } from '@/lib/examenes';
import {
  CERTEZA_META,
  ESTADO_META,
  PREGUNTAS_PARA_LISTO,
  desdeCuando,
  loQueMasConviene,
  notaEnTexto,
  notasPorAsignatura,
  preparacionExamenes,
  type NotaAsignatura,
  type PreparacionExamen,
  type Tendencia,
} from '@/lib/notaCole';
import { RETO_META, cursoDe } from '@/lib/retoCole';
import { DOMINIO_MIN_DIAS, DOMINIO_MIN_PREGUNTAS, dominioDelTemario, estrellasEnTexto } from '@/lib/dominio';
import { ajusteDe } from '@/lib/temasVistos';
import type { DayEntry, Profile } from '@/types';

/* =========================================================================
 *  Cómo van con cada asignatura, y cómo van preparados los exámenes.
 *
 *  Sale de los retos del cole: cada pregunta contestada dice de qué tema era
 *  y si se acertó. Con eso se pone una nota por asignatura —con lo reciente
 *  pesando más y diciendo cuánta certeza hay detrás— y, para cada examen
 *  que viene, un semáforo tema a tema: qué está dominado, qué cojea y qué ni
 *  ha salido. Lo que se quiere saber antes del examen no es «¿ha estudiado?»
 *  sino «¿qué le falta?», y eso es lo que se pinta.
 * ========================================================================= */

interface NotasColeProps {
  profile: Profile;
  entries: Record<string, DayEntry>;
}

const FLECHA: Record<Tendencia, { icon: string; label: string; cls: string }> = {
  sube: { icon: '↗', label: 'sube', cls: 't-ok' },
  baja: { icon: '↘', label: 'baja', cls: 't-danger' },
  igual: { icon: '→', label: 'igual', cls: 't-3' },
};

export function NotasCole({ profile, entries }: NotasColeProps) {
  const notas = useMemo(() => notasPorAsignatura(entries, profile.id), [entries, profile.id]);
  const examenes = useMemo(() => preparacionExamenes(entries, profile.id), [entries, profile.id]);
  const pendientes = useMemo(() => loQueMasConviene(examenes), [examenes]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const curso = cursoDe(profile.id);
  const dominio = useMemo(() => (curso ? dominioDelTemario(entries, profile.id, curso, ajusteDe(entries, profile.id)) : []), [entries, profile.id, curso]);
  const aprendidos = dominio.reduce((n, a) => n + a.aprendidos, 0);
  const temasTotal = dominio.reduce((n, a) => n + a.temas.length, 0);

  const total = notas.reduce((a, n) => a + n.n, 0);
  const conNota = notas.filter((n) => n.nota !== null);
  const media = conNota.length ? conNota.reduce((a, n) => a + (n.nota ?? 0), 0) / conNota.length : null;

  return (
    <>
      {/* La nota de cada asignatura. */}
      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-sm font-black t-1">Cómo va en cada asignatura</h4>
          {media !== null && <p className="text-[11px] t-3">media {notaEnTexto(media)} / 10</p>}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug t-3">
          {total === 0
            ? `De los retos del cole. Todavía no ha jugado ninguno desde el ${desdeCuando()}.`
            : `De los retos del cole: ${total} ${total === 1 ? 'pregunta contestada' : 'preguntas contestadas'} desde el ${desdeCuando()}. Lo reciente pesa más.`}
        </p>

        <ul className="mt-2.5 space-y-2">
          {notas.map((n) => (
            <FilaAsignatura key={n.asignatura} nota={n} abierta={abierta === n.asignatura} onToggle={() => setAbierta((v) => (v === n.asignatura ? null : n.asignatura))} />
          ))}
        </ul>

        <p className="mt-2.5 text-[10px] leading-snug t-3">
          Nota de 0 a 10 con la escala del boletín. La certeza crece con las preguntas: con menos de 10 es una pista, con más de 25 un dato. Toca una asignatura para verla tema a tema.
        </p>
      </section>

      {/* Los exámenes que vienen, tema a tema. */}
      {examenes.length > 0 && (
        <section className="card p-4">
          <h4 className="text-sm font-black t-1">Cómo van preparados los exámenes</h4>
          <p className="mt-0.5 text-[11px] leading-snug t-3">
            Cada examen está tan preparado como su tema más flojo. Un tema es «listo» con 8 o más sobre 10 y al menos {PREGUNTAS_PARA_LISTO} preguntas.
          </p>

          {pendientes.length > 0 && (
            <div className="banner banner-warn mt-2 p-2.5 text-[12px] leading-snug">
              <p className="font-black t-1">📌 Lo que más conviene repasar</p>
              <p className="mt-0.5 t-2">
                {pendientes
                  .slice(0, 3)
                  .map((t) => `${RETO_META[t.tema.asignatura].icon} ${t.tema.titulo} (${ESTADO_META[t.estado].label.toLowerCase()})`)
                  .join(' · ')}
              </p>
            </div>
          )}

          <ul className="mt-2.5 space-y-2.5">
            {examenes.map((p) => (
              <Examen key={`${p.examen.asignatura}-${p.examen.fecha}`} p={p} />
            ))}
          </ul>

          <p className="mt-2.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-snug t-3">
            {(['listo', 'casi', 'regular', 'flojo', 'sin-practicar'] as const).map((e) => (
              <span key={e} title={ESTADO_META[e].blurb}>
                {ESTADO_META[e].icon} {ESTADO_META[e].label}
              </span>
            ))}
          </p>
        </section>
      )}

      {/* El temario aprendido: no una nota, sino demostrado en varios días. */}
      {temasTotal > 0 && (
        <section className="card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-sm font-black t-1">Temario aprendido</h4>
            <p className="text-[11px] t-3">
              {aprendidos} de {temasTotal} temas
            </p>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug t-3">
            Un tema cuenta como aprendido con {DOMINIO_MIN_PREGUNTAS} preguntas o más, en {DOMINIO_MIN_DIAS} días distintos y 8 de las 10 últimas bien. Lo que no, vuelve solo en el ⭐ Repaso de los retos.
          </p>
          <ul className="mt-2.5 space-y-2">
            {dominio.map((a) => (
              <li key={a.asignatura}>
                <div className="flex items-center gap-2 text-[12px] font-black t-1">
                  <span className="w-[38%] shrink-0 truncate">
                    {RETO_META[a.asignatura].icon} {RETO_META[a.asignatura].nombre}
                  </span>
                  <span className="flex-1">
                    <ProgressBar ratio={a.temas.length ? a.aprendidos / a.temas.length : 0} color="#34d399" ariaLabel={`${a.aprendidos} de ${a.temas.length} temas aprendidos`} />
                  </span>
                  <span className="w-10 text-right text-[11px] tabular-nums t-3">
                    {a.aprendidos}/{a.temas.length}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug t-3">
                  {a.temas.map((t) => `${t.tema.titulo.split(' · ')[0]} ${estrellasEnTexto(t.estrellas)}${t.aprendido ? '' : t.n ? ` (${t.n} preg., ${t.dias} d)` : ' (sin practicar)'}`).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function FilaAsignatura({ nota: n, abierta, onToggle }: { nota: NotaAsignatura; abierta: boolean; onToggle: () => void }) {
  const meta = RETO_META[n.asignatura];
  const fill = n.grade ? GRADE_COLOR[n.grade] : NO_GRADE_COLOR;
  const color = n.grade ? GRADE_TEXT[n.grade] : NO_GRADE_TEXT;
  const certeza = CERTEZA_META[n.certeza];
  return (
    <li>
      <button type="button" onClick={onToggle} className="w-full text-left" aria-expanded={abierta} disabled={n.n === 0}>
        <div className="flex items-center gap-2">
          <span className="w-[38%] shrink-0 truncate text-[12px] font-black t-1">
            {meta.icon} {meta.nombre}
          </span>
          <span className="flex-1">
            <ProgressBar ratio={(n.nota ?? 0) / 10} color={fill} ariaLabel={`Nota de ${meta.nombre}`} />
          </span>
          <span className="w-9 shrink-0 text-right text-[13px] font-black tabular-nums" style={{ color }}>
            {notaEnTexto(n.nota)}
          </span>
          <span className="w-6 shrink-0 text-right text-[11px] font-black" style={{ color }} title={n.grade ? GRADE_NAME[n.grade] : undefined}>
            {n.grade ?? ''}
          </span>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] leading-snug t-3">
          <span title={certeza.blurb}>{certeza.label}</span>
          {n.n > 0 && (
            <span>
              · {n.aciertos}/{n.n} bien
            </span>
          )}
          {n.tendencia && (
            <span className={`font-black ${FLECHA[n.tendencia].cls}`} title={`Última semana contra la anterior: ${FLECHA[n.tendencia].label}`}>
              {FLECHA[n.tendencia].icon}
            </span>
          )}
          {n.ultima && <span className="ml-auto">{friendlyDateLabel(n.ultima)}</span>}
        </p>
      </button>

      {abierta && n.temas.length > 0 && (
        <ul className="mt-1 space-y-1 rounded-xl border p-2 hairline surf-1">
          {n.temas.map((t) => {
            const c = t.nota === null ? NO_GRADE_TEXT : GRADE_TEXT[gradeColorKey(t.nota)];
            return (
              <li key={t.tema.id} className="flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate t-2">{t.tema.titulo}</span>
                <span className="shrink-0 t-3">
                  {t.aciertos}/{t.n}
                </span>
                <span className="w-8 shrink-0 text-right font-black tabular-nums" style={{ color: c }}>
                  {notaEnTexto(t.nota)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function gradeColorKey(nota: number): keyof typeof GRADE_COLOR {
  return nota < 5 ? 'IN' : nota < 6 ? 'SU' : nota < 7 ? 'BI' : nota < 9 ? 'NT' : 'SB';
}

function Examen({ p }: { p: PreparacionExamen }) {
  const meta = RETO_META[p.examen.asignatura];
  const estado = ESTADO_META[p.estado];
  const color = p.grade ? GRADE_TEXT[p.grade] : NO_GRADE_TEXT;
  return (
    <li className="rounded-xl border p-2.5 hairline surf-1">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[12px] font-black t-1">
          {meta.icon} {meta.nombre}
          <span className="ml-1 font-semibold t-3">
            · {cuandoEs(p.examen.fecha)}
            {p.dias === 0 ? ' (hoy)' : p.dias === 1 ? ' (mañana)' : ` (faltan ${p.dias} días)`}
          </span>
        </p>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black" style={{ backgroundColor: estado.color, color: GRADE_ON_FILL }} title={estado.blurb}>
          {estado.icon} {estado.label}
        </span>
      </div>
      <ul className="mt-1.5 space-y-1">
        {p.temas.map((t) => {
          const e = ESTADO_META[t.estado];
          return (
            <li key={t.tema.id} className="flex items-center gap-2 text-[11px]">
              <span className="shrink-0" title={e.blurb}>
                {e.icon}
              </span>
              <span className="min-w-0 flex-1 truncate t-2">{t.tema.titulo}</span>
              <span className="shrink-0 t-3">{t.n === 0 ? 'sin preguntas' : `${t.aciertos}/${t.n}`}</span>
              <span className="w-8 shrink-0 text-right font-black tabular-nums" style={{ color: t.nota === null ? NO_GRADE_TEXT : GRADE_TEXT[gradeColorKey(t.nota)] }}>
                {notaEnTexto(t.nota)}
              </span>
            </li>
          );
        })}
      </ul>
      {p.n > 0 && (
        <p className="mt-1 text-right text-[10px] t-3">
          en total {p.n} preguntas · nota <b style={{ color }}>{notaEnTexto(p.nota)}</b>
        </p>
      )}
    </li>
  );
}
