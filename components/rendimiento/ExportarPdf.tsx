'use client';

import { useState } from 'react';

import { addDays, addMonths, startOfWeek, todayKey } from '@/lib/dates';
import { temporadaDe } from '@/lib/gpsSeason';
import { SECCIONES, type Rango, type Seccion } from '@/lib/informePdfOpciones';
import { getProfile } from '@/lib/profiles';
import type { DateKey, DayEntry, ProfileId } from '@/types';

/* =========================================================================
 *  Sacarlo en papel: de quién, de cuándo y de qué.
 *
 *  Tres preguntas y un botón. Lo de por defecto es lo que más se pide —los
 *  dos, la temporada, todo menos lo más menudo— para que casi siempre baste
 *  con tocar «Descargar».
 *
 *  El generador lleva su propia librería de PDF y sólo se carga al pulsar:
 *  quien no exporta nunca no la descarga nunca.
 * ========================================================================= */

const KIDS: ProfileId[] = ['leo', 'hugo'];

type Quien = ProfileId | 'ambos';
type PeriodoId = 'todo' | 'temporada' | 'anterior' | 'tres' | 'mes' | 'semana' | 'otro';

function rangoDe(periodo: PeriodoId, desde: DateKey, hasta: DateKey): Rango {
  const hoy = todayKey();
  const temporada = temporadaDe(hoy);
  switch (periodo) {
    case 'todo':
      return { from: '2000-01-01', to: hoy, label: 'Todo' };
    case 'temporada':
      return { from: temporada.from, to: hoy, label: temporada.label };
    case 'anterior': {
      const previa = temporadaDe(addDays(temporada.from, -1));
      return { from: previa.from, to: previa.to, label: previa.label };
    }
    case 'tres':
      return { from: addMonths(hoy, -2), to: hoy, label: 'Últimos tres meses' };
    case 'mes':
      return { from: addMonths(hoy, 0), to: hoy, label: 'Este mes' };
    case 'semana':
      return { from: startOfWeek(hoy), to: hoy, label: 'Esta semana' };
    case 'otro':
      return desde <= hasta
        ? { from: desde, to: hasta, label: 'Periodo elegido' }
        : { from: hasta, to: desde, label: 'Periodo elegido' };
  }
}

function descargar(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface ExportarPdfProps {
  entries: Record<string, DayEntry>;
  /** El niño en cuyo panel se abre: sale elegido él solo. */
  profileId: ProfileId;
  accent: string;
  onClose: () => void;
}

export function ExportarPdf({ entries, profileId, accent, onClose }: ExportarPdfProps) {
  const [quien, setQuien] = useState<Quien>(KIDS.includes(profileId) ? profileId : 'ambos');
  const [juntos, setJuntos] = useState(true);
  const [periodo, setPeriodo] = useState<PeriodoId>('temporada');
  const [desde, setDesde] = useState<DateKey>(addMonths(todayKey(), -1));
  const [hasta, setHasta] = useState<DateKey>(todayKey());
  const [secciones, setSecciones] = useState<Seccion[]>(
    SECCIONES.map((s) => s.id).filter((id) => id !== 'diario' && id !== 'notas'),
  );
  const [haciendo, setHaciendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kids = quien === 'ambos' ? KIDS : [quien];
  const rango = rangoDe(periodo, desde, hasta);

  const alternar = (id: Seccion) =>
    setSecciones((now) => (now.includes(id) ? now.filter((s) => s !== id) : [...now, id]));

  const exportar = async () => {
    setHaciendo(true);
    setError(null);
    try {
      const { pdfJunto, pdfPorNino } = await import('@/lib/informePdf');
      const peticion = { kids, rango, secciones, entries };
      const archivos = kids.length > 1 && !juntos ? pdfPorNino(peticion) : [pdfJunto(peticion)];
      for (const [i, archivo] of archivos.entries()) {
        // Dos descargas seguidas sin respiro: algunos navegadores se quedan con una.
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 600));
        descargar(archivo.nombre, archivo.blob);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido hacer el PDF.');
    } finally {
      setHaciendo(false);
    }
  };

  const chip = (activo: boolean) =>
    `rounded-xl border px-2 py-2 text-center text-[12px] font-black transition-colors ${
      activo ? 'border-transparent text-white' : 'hairline surf-1 t-2'
    }`;
  const chipStyle = (activo: boolean) => (activo ? { backgroundColor: accent } : undefined);

  const periodos: { id: PeriodoId; label: string }[] = [
    { id: 'temporada', label: temporadaDe(todayKey()).label },
    { id: 'anterior', label: 'Temporada pasada' },
    { id: 'tres', label: 'Últimos 3 meses' },
    { id: 'mes', label: 'Este mes' },
    { id: 'semana', label: 'Esta semana' },
    { id: 'todo', label: 'Todo' },
    { id: 'otro', label: 'Elegir fechas' },
  ];

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-[11px] font-black uppercase tracking-wide t-3">De quién</legend>
        <div className="grid grid-cols-3 gap-2">
          {[...KIDS, 'ambos' as const].map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={quien === id}
              onClick={() => setQuien(id)}
              className={chip(quien === id)}
              style={chipStyle(quien === id)}
            >
              {id === 'ambos' ? 'Los dos' : getProfile(id).name}
            </button>
          ))}
        </div>
        {quien === 'ambos' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={juntos} onClick={() => setJuntos(true)} className={chip(juntos)} style={chipStyle(juntos)}>
              Un solo PDF
            </button>
            <button type="button" aria-pressed={!juntos} onClick={() => setJuntos(false)} className={chip(!juntos)} style={chipStyle(!juntos)}>
              Un PDF por niño
            </button>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[11px] font-black uppercase tracking-wide t-3">De cuándo</legend>
        <div className="flex flex-wrap gap-1.5">
          {periodos.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={periodo === p.id}
              onClick={() => setPeriodo(p.id)}
              className={`${chip(periodo === p.id)} px-3 py-1.5`}
              style={chipStyle(periodo === p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodo === 'otro' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold t-2">
              Desde
              <input
                type="date"
                value={desde}
                onChange={(event) => event.target.value && setDesde(event.target.value)}
                className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm hairline surf-1"
              />
            </label>
            <label className="text-[11px] font-semibold t-2">
              Hasta
              <input
                type="date"
                value={hasta}
                onChange={(event) => event.target.value && setHasta(event.target.value)}
                className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm hairline surf-1"
              />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset>
        <div className="mb-1.5 flex items-baseline justify-between">
          <legend className="text-[11px] font-black uppercase tracking-wide t-3">Qué</legend>
          <button
            type="button"
            onClick={() =>
              setSecciones((now) => (now.length === SECCIONES.length ? [] : SECCIONES.map((s) => s.id)))
            }
            className="text-[11px] font-black t-2 underline"
          >
            {secciones.length === SECCIONES.length ? 'Ninguna' : 'Todas'}
          </button>
        </div>
        <ul className="space-y-1.5">
          {SECCIONES.map((s) => {
            const activa = secciones.includes(s.id);
            return (
              <li key={s.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 hairline surf-1">
                  <input
                    type="checkbox"
                    checked={activa}
                    onChange={() => alternar(s.id)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ accentColor: accent }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-black t-1">
                      <span aria-hidden>{s.icon}</span> {s.label}
                    </span>
                    <span className="block text-[11px] leading-snug t-3">{s.detail}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {error && <p className="text-[12px] font-semibold text-rose-600 dark:text-rose-400">⚠️ {error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="btn-ghost text-sm">
          Cerrar
        </button>
        <button
          type="button"
          onClick={exportar}
          disabled={haciendo || secciones.length === 0}
          className="btn-primary text-sm disabled:opacity-40"
        >
          {haciendo ? 'Haciendo…' : '📄 Descargar PDF'}
        </button>
      </div>
    </div>
  );
}
