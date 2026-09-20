'use client';

import { useMemo, useState } from 'react';

import { Modal } from '@/components/ui/Modal';
import { SubirInforme } from '@/components/rendimiento/SubirInforme';
import { friendlyDateLabel } from '@/lib/dates';
import {
  FITNESS_FIELDS,
  GROUP_LABEL,
  SOURCE_LABEL,
  ageAt,
  derive,
  formatValue,
  oldestFirst,
  testsFor,
  type FitnessField,
  type FitnessTest,
} from '@/lib/fitness';
import { AREA_LABEL, SEVERITY_ICON, auditOf, type Finding } from '@/lib/fitnessAudit';
import { FIT_EXPERTS, FIT_SOURCE_BY_ID, FIT_SOURCES, GENETICA, meaningful } from '@/lib/fitnessReferences';
import { headingFont } from '@/lib/profiles';
import type { DateKey, GpsSession, Profile, ProfileSkin } from '@/types';

/* =========================================================================
 *  Las pruebas físicas, leídas de verdad.
 *
 *  El informe de RX2 da una tabla con flechas de colores. Esta pantalla hace
 *  con esa tabla las cuatro cosas que la tabla no hace: situar cada cifra
 *  frente a lo publicado, separar lo que ha cambiado de verdad de lo que es
 *  ruido de la propia prueba, explicar lo que dos cifras dicen juntas, y
 *  cruzarlo con lo que hace en los partidos.
 *
 *  Todo lo que se enseña aquí se calcula en el aparato con lo que hay
 *  guardado. En el código no hay ninguna cifra de nadie.
 * ========================================================================= */

interface FisicoPanelProps {
  profile: Profile;
  entries: Record<string, import('@/types').DayEntry>;
  sessions: GpsSession[];
  skin: ProfileSkin;
  onSave: (date: DateKey, key: string, line: string) => void;
}

const TONE: Record<string, string> = {
  bien: 'border-emerald-500/40 bg-emerald-500/10',
  dato: 'hairline surf-1',
  ojo: 'border-amber-500/40 bg-amber-500/10',
  atencion: 'border-rose-500/40 bg-rose-500/10',
};

export function FisicoPanel({ profile, entries, sessions, skin, onSave }: FisicoPanelProps) {
  const [subiendo, setSubiendo] = useState(false);
  const [verFuentes, setVerFuentes] = useState(false);

  const tests = useMemo(() => testsFor(entries, profile.id), [entries, profile.id]);
  const serie = useMemo(() => oldestFirst(tests), [tests]);
  const last = serie[serie.length - 1];
  const age = last ? ageAt(last, tests) : undefined;
  const audit = useMemo(
    () => (last && age ? auditOf(tests, age, sessions) : null),
    [tests, last, age, sessions],
  );

  const heading = headingFont(skin);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={heading}>Pruebas físicas</h3>
          <p className="mt-0.5 text-xs t-2">
            {tests.length === 0
              ? 'Todavía no hay ninguna prueba guardada.'
              : `${tests.length} ${tests.length === 1 ? 'prueba' : 'pruebas'} desde ${friendlyDateLabel(serie[0].date)}.`}
          </p>
        </div>
        <button type="button" onClick={() => setSubiendo(true)} className="btn-primary shrink-0 px-3 text-sm">
          📄 Subir informe
        </button>
      </div>

      {tests.length === 0 ? (
        <div className="card p-4">
          <p className="text-sm font-semibold t-1">Sube el primer informe y aquí aparece todo</p>
          <p className="mt-1 text-[12px] leading-snug t-2">
            Con el PDF de RX2 se sacan la talla, el peso, la edad biológica, el salto en plataforma de fuerza y el
            esprint, de todas las fechas que traiga. A partir de dos pruebas se puede hablar de evolución; a partir de
            una, ya se puede situar cada cifra frente a los estudios.
          </p>
        </div>
      ) : (
        <>
          {audit && <Resumen audit={audit} profile={profile} />}

          {/* Lo que dice cada cifra frente a lo publicado. */}
          {audit && audit.placements.length > 0 && (
            <section className="card p-4">
              <h4 className="text-sm font-black t-1">Dónde cae frente a los estudios</h4>
              <p className="mt-0.5 text-[11px] leading-snug t-3">
                Percentil quiere decir «mejor que el X % de los niños de ese estudio». Se da en horquilla porque la
                conversión entre pruebas distintas nunca es exacta.
              </p>
              <ul className="mt-2 space-y-2">
                {audit.placements.map((item) => (
                  <li key={item.id} className="rounded-xl border p-2.5 hairline surf-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 text-[12px] font-black t-1">{item.title}</p>
                      <p className="shrink-0 text-base font-black tabular-nums" style={{ color: profile.accent }}>
                        {item.range[0] === item.range[1] ? item.range[0] : `${item.range[0]}–${item.range[1]}`}
                      </p>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div
                        className="h-full rounded-full"
                        style={{
                          marginLeft: `${item.range[0]}%`,
                          width: `${Math.max(2, item.range[1] - item.range[0])}%`,
                          backgroundColor: profile.accent,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] leading-snug t-2">{item.detail}</p>
                    {item.caveat && <p className="mt-1 text-[11px] leading-snug text-amber-600 dark:text-amber-400">⚠️ {item.caveat}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* La auditoría, por áreas. */}
          {audit && <Auditoria findings={audit.findings} />}

          {/* La tabla de siempre, pero con el ruido marcado. */}
          <Evolucion serie={serie} />

          <Genetica />

          <button
            type="button"
            onClick={() => setVerFuentes((value) => !value)}
            className="w-full rounded-xl border px-3 py-2 text-left text-[12px] font-semibold hairline surf-1 t-2"
          >
            {verFuentes ? '▾' : '▸'} Con qué se compara ({FIT_SOURCES.length} fuentes)
          </button>

          {verFuentes && (
            <section className="card space-y-3 p-4">
              <div>
                <h4 className="text-sm font-black t-1">Lo que dicen los expertos</h4>
                <ul className="mt-1.5 space-y-2">
                  {FIT_EXPERTS.map((expert) => (
                    <li key={expert.who} className="text-[12px] leading-snug t-2">
                      <span className="font-black t-1">{expert.who}.</span> {expert.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-black t-1">Fuentes</h4>
                <ol className="mt-1.5 space-y-1.5">
                  {FIT_SOURCES.map((source) => (
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
        <Modal title={`Subir informe físico de ${profile.name}`} onClose={() => setSubiendo(false)}>
          <SubirInforme profile={profile} kind="fisico" onSave={onSave} onClose={() => setSubiendo(false)} />
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ piezas */

function Resumen({ audit, profile }: { audit: NonNullable<ReturnType<typeof auditOf>>; profile: Profile }) {
  const d = derive(audit.last);
  const cifras: [string, string][] = [
    ['Altura', `${formatValue('height', audit.last.height)} cm`],
    ['Peso', `${formatValue('weight', audit.last.weight)} kg`],
    ['IMC', d.bmi ? d.bmi.toFixed(1).replace('.', ',') : '—'],
    ['Salto', `${formatValue('jumpHeight', audit.last.jumpHeight)} m`],
    ['20 m', `${formatValue('sprint20', audit.last.sprint20)} s`],
    ['V. máx.', `${formatValue('topSpeed', audit.last.topSpeed)} km/h`],
  ];

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-black t-1">Última prueba</h4>
        <p className="text-[11px] t-3">
          {friendlyDateLabel(audit.last.date)} · {SOURCE_LABEL[audit.last.source]} · {audit.age.toFixed(1).replace('.', ',')} años
        </p>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        {cifras.map(([label, value]) => (
          <div key={label} className="rounded-xl border p-2 text-center hairline surf-1">
            <dt className="text-[10px] font-black uppercase tracking-wide t-3">{label}</dt>
            <dd className="text-sm font-black tabular-nums" style={{ color: profile.accent }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Lo del informe genético.
 *
 * Sale siempre, aunque no se haya subido nada, porque en casa hay uno: lo
 * que no puede pasar es que un niño de ocho años acabe tomando creatina
 * porque un PDF de pago lo recomendó en la página doce.
 */
function Genetica() {
  return (
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
      <h4 className="text-sm font-black t-1">🧬 {GENETICA.title}</h4>
      <p className="mt-1.5 text-[12px] leading-snug t-2">
        {GENETICA.text.split('**').map((piece, i) => (i % 2 ? <strong key={i}>{piece}</strong> : piece))}
      </p>
      <p className="mt-2 text-[12px] font-semibold leading-snug t-1">{GENETICA.warn}</p>
      <ol className="mt-2 space-y-1">
        {GENETICA.sources.map((id) => (
          <li key={id} className="text-[10px] leading-snug t-3">
            {FIT_SOURCE_BY_ID.get(id)?.cite}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Auditoria({ findings }: { findings: Finding[] }) {
  const areas = [...new Set(findings.map((finding) => finding.area))];

  return (
    <section className="space-y-3">
      {areas.map((area) => (
        <div key={area} className="card p-4">
          <h4 className="text-sm font-black t-1">{AREA_LABEL[area]}</h4>
          <ul className="mt-2 space-y-2">
            {findings
              .filter((finding) => finding.area === area)
              .map((finding) => (
                <li key={finding.id} className={`rounded-xl border p-2.5 ${TONE[finding.severity]}`}>
                  <p className="text-[12px] font-black leading-snug t-1">
                    <span aria-hidden>{SEVERITY_ICON[finding.severity]}</span> {finding.title}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug t-2">{finding.text}</p>
                  {finding.evidence && finding.evidence.length > 0 && (
                    <p className="mt-1 text-[11px] leading-snug t-3">{finding.evidence.join(' · ')}</p>
                  )}
                  {finding.todo && (
                    <p className="mt-1.5 text-[11px] font-semibold leading-snug t-1">→ {finding.todo}</p>
                  )}
                  {finding.source && (
                    <p className="mt-1 text-[10px] leading-snug t-3">
                      {FIT_SOURCE_BY_ID.get(finding.source)?.cite.split('.')[0]}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Evolucion({ serie }: { serie: FitnessTest[] }) {
  const grupos: FitnessField['group'][] = ['estructura', 'salto', 'sprint'];

  return (
    <section className="card p-4">
      <h4 className="text-sm font-black t-1">Prueba a prueba</h4>
      <p className="mt-0.5 text-[11px] leading-snug t-3">
        En gris, los cambios que no superan el error típico de esa prueba: ahí no ha pasado nada.
      </p>

      {grupos.map((grupo) => {
        const campos = FITNESS_FIELDS.filter(
          (field) => field.group === grupo && serie.some((test) => typeof test[field.id] === 'number'),
        );
        if (campos.length === 0) return null;

        return (
          <div key={grupo} className="mt-3 overflow-x-auto">
            <p className="mb-1 text-[11px] font-black uppercase tracking-wide t-3">{GROUP_LABEL[grupo]}</p>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="t-3">
                  <th className="pb-1 text-left font-black">Métrica</th>
                  {serie.map((test) => (
                    <th key={test.id} className="pb-1 text-right font-black tabular-nums">
                      {test.date.slice(2).split('-').reverse().slice(0, 2).join('/')}
                    </th>
                  ))}
                  <th className="pb-1 pl-2 text-right font-black">Total</th>
                </tr>
              </thead>
              <tbody>
                {campos.map((field) => {
                  const primero = serie.find((test) => typeof test[field.id] === 'number')?.[field.id];
                  const ultimo = [...serie].reverse().find((test) => typeof test[field.id] === 'number')?.[field.id];
                  const cambio =
                    typeof primero === 'number' && typeof ultimo === 'number' && primero !== 0
                      ? ((ultimo - primero) / primero) * 100
                      : null;
                  const real = cambio !== null && meaningful(field.id, cambio);
                  const mejor = cambio === null ? null : field.better === '+' ? cambio > 0 : field.better === '-' ? cambio < 0 : null;

                  return (
                    <tr key={field.id} className="border-t hairline">
                      <td className="py-1 pr-2 font-semibold t-2" title={field.blurb}>
                        {field.short}
                        <span className="ml-1 font-normal t-3">{field.unit}</span>
                      </td>
                      {serie.map((test) => (
                        <td key={test.id} className="py-1 text-right tabular-nums t-2">
                          {formatValue(field.id, test[field.id])}
                        </td>
                      ))}
                      <td
                        className={`py-1 pl-2 text-right font-black tabular-nums ${
                          !real || mejor === null ? 't-3' : mejor ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {cambio === null ? '—' : `${cambio > 0 ? '+' : ''}${cambio.toFixed(1).replace('.', ',')} %`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}
