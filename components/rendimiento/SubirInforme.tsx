'use client';

import { useRef, useState } from 'react';

import { useToast } from '@/components/ui/Toast';
import { parseReport, encodeReport, ACADEMIC_NOTE_KEY, type ReportCard } from '@/lib/academics';
import {
  COGNITIVE_NOTE_KEY,
  COG_BY_ID,
  encodeCog,
  parseWisc,
  type CogProfile,
} from '@/lib/cognitive';
import { FITNESS_NOTE_KEY, encodeTest, hasData, type FitnessTest } from '@/lib/fitness';
import { PdfProtegido, parseRx2, pdfLines } from '@/lib/rx2';
import { todayKey } from '@/lib/dates';
import type { DateKey, Profile } from '@/types';

/* =========================================================================
 *  Soltar aquí el informe y que se entienda solo.
 *
 *  Es el botón que hace que todo lo demás exista. Sin él, cada trimestre hay
 *  que copiar a mano ocho cifras de un PDF para dos niños, y eso se deja de
 *  hacer al segundo intento.
 *
 *  Tres reglas:
 *
 *   1. **El archivo no sale del aparato.** Se lee aquí, en el navegador, y
 *      se tira. No se sube a ningún sitio y no entra en el repositorio, que
 *      es público. Lo único que se guarda son las cifras, en la cuenta de la
 *      familia, junto al resto de lo suyo.
 *   2. **Nada se guarda sin verlo.** Un lector de PDF se equivoca, y una
 *      cifra mal leída envenena el análisis entero. Así que primero se
 *      enseña lo que ha entendido, y se guarda al confirmarlo.
 *   3. **Si no lo entiende, lo dice.** Un informe protegido con contraseña,
 *      o uno de otro centro, no se adivina: se avisa y se ofrece meterlo a
 *      mano.
 * ========================================================================= */

type Kind = 'fisico' | 'academico';

interface SubirInformeProps {
  profile: Profile;
  kind: Kind;
  /** Guarda una línea en las notas del día que toque. */
  onSave: (date: DateKey, key: string, line: string) => void;
  onClose: () => void;
}

/** Lo que ha entendido de un archivo, a la espera de que lo confirmen. */
interface Pendiente {
  file: string;
  tests: FitnessTest[];
  report: ReportCard | null;
  cog: CogProfile | null;
  /** El archivo tal cual, para volver a intentarlo con contraseña. */
  data?: ArrayBuffer;
  pideClave?: boolean;
  warnings: string[];
}

export function SubirInforme({ profile, kind, onSave, onClose }: SubirInformeProps) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [fecha, setFecha] = useState<DateKey>(todayKey());
  const [clave, setClave] = useState('');

  /** Lee un archivo y saca de él lo que sepa. */
  const leer = async (file: File, data?: ArrayBuffer, password?: string): Promise<Pendiente> => {
    const base: Pendiente = { file: file.name, tests: [], report: null, cog: null, warnings: [] };

    let lines: string[];
    try {
      if (/\.pdf$/i.test(file.name)) {
        const buffer = data ?? (await file.arrayBuffer());
        lines = await pdfLines(buffer, password);
        base.data = buffer;
      } else {
        lines = (await file.text()).split(/\r?\n/);
      }
    } catch (error) {
      if (error instanceof PdfProtegido) {
        return {
          ...base,
          data: data ?? undefined,
          pideClave: true,
          warnings: [
            error.malaClave
              ? 'Esa contraseña no abre el PDF. Prueba otra vez.'
              : 'Este PDF pide contraseña. Escríbela aquí abajo y vuelve a intentarlo.',
          ],
        };
      }
      return { ...base, warnings: ['No he podido leer el archivo.'] };
    }

    if (lines.length === 0) {
      return { ...base, warnings: ['El archivo no trae texto: puede ser un escaneo. Un escaneo no se puede leer aquí.'] };
    }

    if (kind === 'fisico') {
      const parsed = parseRx2(lines, profile.id);
      if (parsed.kind === 'genetico') {
        return {
          ...base,
          warnings: [
            'Esto es un informe genético, no de pruebas físicas. No se guarda ninguna cifra suya: en la pestaña de Físico tienes lo que dice la ciencia sobre estos estudios en niños.',
          ],
        };
      }
      return { ...base, tests: parsed.tests.filter(hasData), warnings: parsed.warnings };
    }

    const parsed = parseReport(lines);
    if (parsed.rows.length > 0) {
      return {
        ...base,
        report: { profileId: profile.id, date: fecha, course: parsed.course ?? '', rows: parsed.rows },
        warnings: parsed.warnings,
      };
    }

    // No es un boletín: puede ser la valoración neuropsicológica, que va en
    // esta misma área porque cuenta la otra mitad de lo mismo.
    const wisc = parseWisc(lines);
    if (Object.keys(wisc.scores).length > 0) {
      return {
        ...base,
        cog: { profileId: profile.id, date: fecha, age: wisc.age, scores: wisc.scores },
        warnings: wisc.warnings,
      };
    }

    return { ...base, warnings: [...parsed.warnings, ...wisc.warnings] };
  };

  const elegir = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLeyendo(true);
    try {
      const leidos: Pendiente[] = [];
      for (const file of Array.from(files)) leidos.push(await leer(file));
      setArchivos(Array.from(files));
      setPendientes(leidos);
    } finally {
      setLeyendo(false);
    }
  };

  /** Vuelve a intentarlo con la contraseña escrita. */
  const reintentar = async () => {
    if (!clave) return;
    setLeyendo(true);
    try {
      const leidos: Pendiente[] = [];
      for (let i = 0; i < archivos.length; i++) {
        const previo = pendientes[i];
        leidos.push(previo?.pideClave ? await leer(archivos[i], previo.data, clave) : previo);
      }
      setPendientes(leidos);
    } finally {
      setLeyendo(false);
    }
  };

  const guardar = () => {
    let cuantos = 0;

    for (const pendiente of pendientes) {
      for (const test of pendiente.tests) {
        onSave(test.date, FITNESS_NOTE_KEY, encodeTest(test));
        cuantos++;
      }
      if (pendiente.report) {
        onSave(pendiente.report.date, ACADEMIC_NOTE_KEY, encodeReport({ ...pendiente.report, date: fecha }));
        cuantos++;
      }
      if (pendiente.cog) {
        onSave(fecha, COGNITIVE_NOTE_KEY, encodeCog({ ...pendiente.cog, date: fecha }));
        cuantos++;
      }
    }

    if (cuantos === 0) {
      toast({ message: 'No hay nada que guardar.' });
      return;
    }
    toast({ icon: '📄', message: `Guardado: ${cuantos} ${cuantos === 1 ? 'informe' : 'informes'} de ${profile.name}.` });
    onClose();
  };

  const hayAlgo = pendientes.some((item) => item.tests.length > 0 || item.report || item.cog);
  const pideClave = pendientes.some((item) => item.pideClave);

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-snug t-2">
        {kind === 'fisico'
          ? 'Coge el PDF de RX2 —el de «Evolución»— y suéltalo aquí. Saca la talla, el peso, la edad biológica, el salto y el esprint de todas las fechas que traiga.'
          : 'Suelta aquí el boletín del colegio o la valoración neuropsicológica, en PDF. Del boletín saca todas las asignaturas con la nota de cada evaluación; de la valoración, los cinco índices. Si pide contraseña, se pide.'}
      </p>

      <div className="rounded-xl border border-dashed p-3 hairline surf-1">
        <input
          ref={input}
          type="file"
          accept=".pdf,.txt"
          multiple
          className="hidden"
          onChange={(event) => {
            void elegir(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={leyendo}
          className="btn-primary w-full text-sm"
        >
          {leyendo ? 'Leyendo…' : '📄 Elegir el informe'}
        </button>
        <p className="mt-2 text-[11px] leading-snug t-3">
          El archivo se lee aquí mismo y no se sube a ningún sitio. Sólo se guardan las cifras.
        </p>
      </div>

      {pideClave && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <label className="block text-[12px] font-semibold t-1">
            Contraseña del PDF
            <input
              type="password"
              value={clave}
              onChange={(event) => setClave(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void reintentar();
              }}
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm hairline surf-1"
              placeholder="la que os dieron con el informe"
            />
          </label>
          <button
            type="button"
            onClick={() => void reintentar()}
            disabled={!clave || leyendo}
            className="btn-primary mt-2 w-full text-sm disabled:opacity-40"
          >
            {leyendo ? 'Abriendo…' : '🔓 Abrir con esta contraseña'}
          </button>
          <p className="mt-1.5 text-[11px] leading-snug t-3">
            La contraseña se usa aquí y no se guarda en ningún sitio.
          </p>
        </div>
      )}

      {kind === 'academico' && (
        <label className="block text-[12px] font-semibold t-2">
          Fecha con la que se guarda el informe
          <input
            type="date"
            value={fecha}
            onChange={(event) => setFecha(event.target.value as DateKey)}
            className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm hairline surf-1"
          />
          <span className="mt-1 block text-[11px] font-normal t-3">
            Normalmente, el día en que os lo dieron: es lo que ordena los boletines entre sí.
          </span>
        </label>
      )}

      {pendientes.map((pendiente) => (
        <div key={pendiente.file} className="rounded-xl border p-3 hairline surf-1">
          <p className="text-[12px] font-black t-1">{pendiente.file}</p>

          {pendiente.warnings.map((warning) => (
            <p key={warning} className="mt-1 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
              ⚠️ {warning}
            </p>
          ))}

          {pendiente.tests.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="t-3">
                    <th className="pb-1 text-left font-black">Fecha</th>
                    <th className="pb-1 text-right font-black">Salto</th>
                    <th className="pb-1 text-right font-black">20 m</th>
                    <th className="pb-1 text-right font-black">V. máx.</th>
                    <th className="pb-1 text-right font-black">Altura</th>
                  </tr>
                </thead>
                <tbody>
                  {pendiente.tests.map((test) => (
                    <tr key={test.id} className="border-t hairline">
                      <td className="py-1 font-semibold t-2">{test.date}</td>
                      <td className="py-1 text-right tabular-nums t-2">{test.jumpHeight?.toFixed(2) ?? '—'}</td>
                      <td className="py-1 text-right tabular-nums t-2">{test.sprint20?.toFixed(2) ?? '—'}</td>
                      <td className="py-1 text-right tabular-nums t-2">{test.topSpeed?.toFixed(1) ?? '—'}</td>
                      <td className="py-1 text-right tabular-nums t-2">{test.height?.toFixed(1) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pendiente.cog && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold t-2">
                Perfil cognitivo{pendiente.cog.age ? ' · baremo ' + pendiente.cog.age : ''}
              </p>
              <ul className="mt-1 space-y-0.5">
                {Object.entries(pendiente.cog.scores).map(([id, value]) => (
                  <li key={id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate t-2">{COG_BY_ID.get(id as never)?.label ?? id}</span>
                    <span className="shrink-0 font-black tabular-nums t-1">
                      {value.score}
                      {value.pct === undefined ? '' : ' (pct ' + value.pct + ')'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendiente.report && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold t-2">
                Curso {pendiente.report.course || '—'} · {pendiente.report.rows.length} asignaturas
              </p>
              <ul className="mt-1 space-y-0.5">
                {pendiente.report.rows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate t-2">{row.label}</span>
                    <span className="shrink-0 font-black tabular-nums t-1">
                      {row.terms.join(' ')} {row.final ? `· ${row.final}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="btn-ghost text-sm">
          Cancelar
        </button>
        <button type="button" onClick={guardar} disabled={!hayAlgo} className="btn-primary text-sm disabled:opacity-40">
          Guardar
        </button>
      </div>
    </div>
  );
}
