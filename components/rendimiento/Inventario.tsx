'use client';

import { reportsFor } from '@/lib/academics';
import { cogFor } from '@/lib/cognitive';
import { testsFor } from '@/lib/fitness';
import { PROFILES } from '@/lib/profiles';
import type { DayEntry, ProfileId } from '@/types';

/* =========================================================================
 *  Qué hay cargado y qué falta, de los dos.
 *
 *  La pregunta que uno se hace al volver a esta pantalla no es «cuánto salta
 *  Leo»: es **«¿están ya todos los informes?»**. Y hasta ahora sólo se podía
 *  contestar entrando en cada área de cada niño y contando a ojo.
 *
 *  Esto lo contesta de un vistazo y para los dos a la vez, porque los
 *  informes llegan a casa de dos en dos y se suben de dos en dos. Lo que
 *  falta se ve en ámbar y lleva el botón al lado: una lista de la compra,
 *  no un panel de control.
 * ========================================================================= */

interface InventarioProps {
  entries: Record<string, DayEntry>;
  /** El color del perfil en cuyo panel se está, para el botón. */
  accent: string;
  onSubir: () => void;
}

interface Fila {
  id: string;
  label: string;
  icon: string;
  /** Cuántos hay. */
  cuantos: number;
  /** Lo que se dice cuando hay algo. */
  detalle: string;
  /** Con cuántos se considera completo. */
  minimo: number;
}

function filasDe(entries: Record<string, DayEntry>, profileId: ProfileId): Fila[] {
  const tests = testsFor(entries, profileId);
  const reports = reportsFor(entries, profileId);
  const cogs = cogFor(entries, profileId);

  return [
    {
      id: 'fisico',
      label: 'Pruebas físicas',
      icon: '💪',
      cuantos: tests.length,
      detalle:
        tests.length > 1
          ? `${tests.length} desde ${tests[tests.length - 1].date.slice(0, 4)}`
          : tests.length
            ? `una, de ${tests[0].date.slice(0, 4)}`
            : 'sin ninguna',
      minimo: 1,
    },
    {
      id: 'colegio',
      label: 'Boletines',
      icon: '📚',
      cuantos: reports.length,
      detalle: reports.length ? `curso ${reports[0].course || reports[0].date.slice(0, 4)}` : 'sin ninguno',
      minimo: 1,
    },
    {
      id: 'cabeza',
      label: 'Perfil cognitivo',
      icon: '🧠',
      cuantos: cogs.length,
      detalle: cogs.length ? `de ${cogs[0].date.slice(0, 4)}` : 'sin cargar',
      minimo: 1,
    },
  ];
}

export function Inventario({ entries, accent, onSubir }: InventarioProps) {
  const ninos = PROFILES.filter((profile) => profile.kind === 'kid');
  const tablero = ninos.map((profile) => ({ profile, filas: filasDe(entries, profile.id) }));
  const faltan = tablero.reduce(
    (sum, { filas }) => sum + filas.filter((fila) => fila.cuantos < fila.minimo).length,
    0,
  );

  return (
    <section className={`rounded-2xl border p-3 ${faltan > 0 ? 'border-amber-500/40 bg-amber-500/10' : 'hairline surf-1'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[13px] font-black t-1">
            {faltan === 0 ? '✅ Los informes están todos' : `📥 Faltan ${faltan} por subir`}
          </h4>
          <p className="mt-0.5 text-[11px] leading-snug t-3">
            {faltan === 0
              ? 'Lo de los dos niños está cargado. Cuando llegue uno nuevo, se suelta aquí y se coloca solo.'
              : 'Suelta la carpeta entera y cada informe va a su sitio, de los dos niños a la vez.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onSubir}
          className="shrink-0 rounded-xl px-3 py-1.5 text-[12px] font-black text-white"
          style={{ backgroundColor: accent }}
        >
          📁 Subir
        </button>
      </div>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {tablero.map(({ profile, filas }) => (
          <div key={profile.id} className="rounded-xl border p-2 hairline surf-1">
            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: profile.accentDeep ?? profile.accent }}>
              {profile.name}
            </p>
            <ul className="mt-1 space-y-1">
              {filas.map((fila) => {
                const hay = fila.cuantos >= fila.minimo;
                return (
                  <li key={fila.id} className="flex items-center gap-2 text-[11px]">
                    <span aria-hidden className={hay ? '' : 'opacity-40'}>
                      {fila.icon}
                    </span>
                    <span className={`min-w-0 flex-1 truncate ${hay ? 't-2' : 't-3'}`}>{fila.label}</span>
                    <span className={`shrink-0 font-black ${hay ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {hay ? fila.detalle : 'falta'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
