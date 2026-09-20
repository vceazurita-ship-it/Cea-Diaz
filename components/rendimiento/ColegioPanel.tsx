'use client';

import { useMemo, useState } from 'react';

import { Modal } from '@/components/ui/Modal';
import { SubirInforme } from '@/components/rendimiento/SubirInforme';
import { friendlyDateLabel } from '@/lib/dates';
import {
  AREA_NAME,
  GRADE_COLOR,
  GRADE_NAME,
  GRADE_POINTS,
  gradeFor,
  reportsFor,
  type Grade,
  type ReportCard,
} from '@/lib/academics';
import { AC_EXPERTS, AC_SOURCES, AC_SOURCE_BY_ID, areasOf, auditReport } from '@/lib/academicsAudit';
import { testsFor } from '@/lib/fitness';
import { headingFont } from '@/lib/profiles';
import type { DateKey, DayEntry, Profile, ProfileSkin } from '@/types';

/* =========================================================================
 *  El colegio, trimestre a trimestre.
 *
 *  Un boletín suelto dice poco: dice cómo fue ese trimestre. Puestos uno
 *  detrás de otro dicen lo único que se puede acompañar —qué sube, qué baja
 *  y qué lleva un curso entero parado—, que es a lo que sirve guardarlos.
 *
 *  Aquí tampoco hay ninguna nota en el código: sólo la escala y las reglas.
 * ========================================================================= */

interface ColegioPanelProps {
  profile: Profile;
  entries: Record<string, DayEntry>;
  skin: ProfileSkin;
  onSave: (date: DateKey, key: string, line: string) => void;
}

const TONE: Record<string, string> = {
  bien: 'border-emerald-500/40 bg-emerald-500/10',
  dato: 'hairline surf-1',
  ojo: 'border-amber-500/40 bg-amber-500/10',
  atencion: 'border-rose-500/40 bg-rose-500/10',
};

const ICON: Record<string, string> = { bien: '✅', dato: 'ℹ️', ojo: '👀', atencion: '⚠️' };

export function ColegioPanel({ profile, entries, skin, onSave }: ColegioPanelProps) {
  const [subiendo, setSubiendo] = useState(false);
  const [verFuentes, setVerFuentes] = useState(false);

  const reports = useMemo(() => reportsFor(entries, profile.id), [entries, profile.id]);
  const tests = useMemo(() => testsFor(entries, profile.id), [entries, profile.id]);
  const last = reports[0];
  const before = reports[1] ?? null;
  const audit = useMemo(() => (last ? auditReport(last, before, tests) : null), [last, before, tests]);
  const areas = useMemo(() => (last ? areasOf(last.rows) : []), [last]);

  const heading = headingFont(skin);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={heading}>Colegio</h3>
          <p className="mt-0.5 text-xs t-2">
            {reports.length === 0
              ? 'Todavía no hay ningún boletín guardado.'
              : `${reports.length} ${reports.length === 1 ? 'boletín' : 'boletines'} · el último, ${friendlyDateLabel(last.date)}.`}
          </p>
        </div>
        <button type="button" onClick={() => setSubiendo(true)} className="btn-primary shrink-0 px-3 text-sm">
          📄 Subir boletín
        </button>
      </div>

      {!last || !audit ? (
        <div className="card p-4">
          <p className="text-sm font-semibold t-1">Sube el primer boletín y aquí aparece la serie</p>
          <p className="mt-1 text-[12px] leading-snug t-2">
            Del PDF del colegio se sacan todas las asignaturas con la nota de cada evaluación. Con uno ya se ve el
            curso entero; con dos, cómo va de un año a otro.
          </p>
        </div>
      ) : (
        <>
          {/* El curso de un vistazo. */}
          <section className="card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-black t-1">Curso {last.course || '—'}</h4>
              {audit.mean !== null && (
                <p className="text-[11px] t-3">
                  media {audit.mean.toFixed(1).replace('.', ',')} / 5
                </p>
              )}
            </div>

            <div className="mt-2 space-y-1">
              {last.rows.map((row) => (
                <div key={row.label} className="flex items-center gap-2">
                  <span className="w-[40%] shrink-0 truncate text-[11px] font-semibold t-2">{row.label}</span>
                  <span className="flex flex-1 gap-1">
                    {row.terms.map((grade, i) => (
                      <span
                        key={i}
                        title={GRADE_NAME[grade]}
                        className="flex h-5 flex-1 items-center justify-center rounded text-[9px] font-black text-white"
                        style={{ backgroundColor: GRADE_COLOR[grade] }}
                      >
                        {grade}
                      </span>
                    ))}
                  </span>
                  <span
                    className="w-8 shrink-0 text-right text-[11px] font-black"
                    style={{ color: gradeFor(row) ? GRADE_COLOR[gradeFor(row)!] : undefined }}
                  >
                    {gradeFor(row) ?? '—'}
                  </span>
                </div>
              ))}
            </div>

            {areas.length > 0 && (
              <p className="mt-2.5 text-[11px] leading-snug t-3">
                Por áreas: {areas.map((area) => `${area.label} ${area.mean.toFixed(1).replace('.', ',')}`).join(' · ')}
              </p>
            )}
          </section>

          {/* La lectura. */}
          <section className="card p-4">
            <h4 className="text-sm font-black t-1">Lo que dice la serie</h4>
            <ul className="mt-2 space-y-2">
              {audit.findings.map((finding) => (
                <li key={finding.id} className={`rounded-xl border p-2.5 ${TONE[finding.severity]}`}>
                  <p className="text-[12px] font-black leading-snug t-1">
                    <span aria-hidden>{ICON[finding.severity]}</span> {finding.title}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug t-2">{finding.text}</p>
                  {finding.evidence && finding.evidence.length > 0 && (
                    <p className="mt-1 text-[11px] leading-snug t-3">{finding.evidence.join(' · ')}</p>
                  )}
                  {finding.todo && <p className="mt-1.5 text-[11px] font-semibold leading-snug t-1">→ {finding.todo}</p>}
                  {finding.source && (
                    <p className="mt-1 text-[10px] leading-snug t-3">
                      {AC_SOURCE_BY_ID.get(finding.source)?.cite.split('.')[0]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {reports.length > 1 && <Historico reports={reports} />}

          <button
            type="button"
            onClick={() => setVerFuentes((value) => !value)}
            className="w-full rounded-xl border px-3 py-2 text-left text-[12px] font-semibold hairline surf-1 t-2"
          >
            {verFuentes ? '▾' : '▸'} En qué se apoya esto ({AC_SOURCES.length} fuentes)
          </button>

          {verFuentes && (
            <section className="card space-y-3 p-4">
              <div>
                <h4 className="text-sm font-black t-1">Lo que dicen los expertos</h4>
                <ul className="mt-1.5 space-y-2">
                  {AC_EXPERTS.map((expert) => (
                    <li key={expert.who} className="text-[12px] leading-snug t-2">
                      <span className="font-black t-1">{expert.who}.</span> {expert.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-black t-1">Fuentes</h4>
                <ol className="mt-1.5 space-y-1.5">
                  {AC_SOURCES.map((source) => (
                    <li key={source.id} className="text-[11px] leading-snug t-3">
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                          {source.cite}
                        </a>
                      ) : (
                        source.cite
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}
        </>
      )}

      {subiendo && (
        <Modal title={`Subir boletín de ${profile.name}`} onClose={() => setSubiendo(false)}>
          <SubirInforme profile={profile} kind="academico" onSave={onSave} onClose={() => setSubiendo(false)} />
        </Modal>
      )}
    </div>
  );
}

/** Curso a curso, la media de cada uno. */
function Historico({ reports }: { reports: ReportCard[] }) {
  const filas = [...reports].reverse().map((report) => {
    const notas = report.rows.map(gradeFor).filter((grade): grade is Grade => Boolean(grade));
    const media = notas.length ? notas.reduce((a, b) => a + GRADE_POINTS[b], 0) / notas.length : null;
    return { report, media };
  });

  return (
    <section className="card p-4">
      <h4 className="text-sm font-black t-1">Curso a curso</h4>
      <ul className="mt-2 space-y-1.5">
        {filas.map(({ report, media }) => (
          <li key={report.date} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[11px] font-black t-2">{report.course || report.date.slice(0, 4)}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <span
                className="block h-full rounded-full bg-emerald-500"
                style={{ width: `${((media ?? 0) / 5) * 100}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right text-[11px] font-black tabular-nums t-1">
              {media === null ? '—' : media.toFixed(1).replace('.', ',')}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-snug t-3">
        Sobre 5, contando insuficiente como 1 y sobresaliente como 5. Sirve para ver la forma de la curva, no para
        presumir de número: el listón sube cada curso, así que mantenerse ya es mejorar.
      </p>
    </section>
  );
}
