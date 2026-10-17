'use client';

import { ProgressRing } from '@/components/ui/ProgressRing';
import { reportsFor, type ReportCard } from '@/lib/academics';
import { cogFor } from '@/lib/cognitive';
import { todayKey } from '@/lib/dates';
import { testsFor } from '@/lib/fitness';
import { useTheme } from '@/hooks/useTheme';
import { PROFILES, accentFor } from '@/lib/profiles';
import type { DateKey, DayEntry, ProfileId } from '@/types';

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
  onSubir: () => void;
  /** Saca todo en PDF; va al lado de subir. */
  onExportar?: () => void;
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
  /**
   * Si lo que hay sirve todavía. Un boletín del curso pasado cuenta como
   * boletín, pero no como el boletín que se espera: el de este curso.
   */
  vigente: boolean;
}

/**
 * Curso escolar al que pertenece una fecha, por su año de inicio: de
 * septiembre a agosto. Octubre de 2026 es el curso 2026; junio de 2026, el
 * de 2025.
 */
function cursoDe(date: DateKey): number {
  const [year, month] = date.split('-').map(Number);
  return month >= 9 ? year : year - 1;
}

/**
 * El curso de un boletín, por lo que escribe el colegio («25-26» → 2025). Si
 * no se entiende, vale el curso del día en que se guardó, que es lo más
 * parecido a cuándo llegó a casa.
 */
function cursoDelBoletin(report: ReportCard): number {
  const match = /^(\d{2})-\d{2}$/.exec(report.course);
  return match ? 2000 + Number(match[1]) : cursoDe(report.date);
}

function filasDe(entries: Record<string, DayEntry>, profileId: ProfileId): Fila[] {
  const tests = testsFor(entries, profileId);
  const reports = reportsFor(entries, profileId);
  const cogs = cogFor(entries, profileId);
  const cursoActual = cursoDe(todayKey());

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
      vigente: true,
    },
    {
      id: 'colegio',
      label: 'Boletines',
      icon: '📚',
      cuantos: reports.length,
      detalle: reports.length ? `curso ${reports[0].course || reports[0].date.slice(0, 4)}` : 'sin ninguno',
      minimo: 1,
      // El boletín del curso pasado ya se subió en su día; lo que se pregunta
      // aquí es si está el de este curso. Sin esto, septiembre decía «están
      // todos» con el boletín de junio.
      vigente: reports.some((report) => cursoDelBoletin(report) === cursoActual),
    },
    {
      id: 'cabeza',
      label: 'Perfil cognitivo',
      icon: '🧠',
      cuantos: cogs.length,
      detalle: cogs.length ? `de ${cogs[0].date.slice(0, 4)}` : 'sin cargar',
      minimo: 1,
      vigente: true,
    },
  ];
}

/** Lo que hay cumple, lo que hay se quedó viejo, o no hay nada. */
function estadoDe(fila: Fila): 'hay' | 'viejo' | 'falta' {
  if (fila.cuantos < fila.minimo) return 'falta';
  return fila.vigente ? 'hay' : 'viejo';
}

export function Inventario({ entries, onSubir, onExportar }: InventarioProps) {
  const { mode } = useTheme();
  const ninos = PROFILES.filter((profile) => profile.kind === 'kid');
  const tablero = ninos.map((profile) => ({ profile, filas: filasDe(entries, profile.id) }));
  const total = tablero.reduce((sum, { filas }) => sum + filas.length, 0);
  const faltan = tablero.reduce(
    (sum, { filas }) => sum + filas.filter((fila) => estadoDe(fila) !== 'hay').length,
    0,
  );

  return (
    <section className={`card p-4 ${faltan > 0 ? 'bg-accent-faint' : ''}`}>
      <div className="flex items-center gap-3">
        {/* El anillo dice cuánto está ya, como el de la portada dice cuántos
            han apuntado: «2/6» se lee antes que una frase. */}
        <ProgressRing ratio={total ? (total - faltan) / total : 0} size={52} stroke={5}>
          <span className="text-[12px] font-black tabular-nums t-1">
            {total - faltan}/{total}
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          {/* h3: es la primera tarjeta de la pestaña, colgada del h2 de
              ésta; con h4 el lector de pantalla saltaba un nivel. */}
          <h3 className="font-display text-base font-black leading-tight t-1">
            {faltan === 0 ? 'Están todos los informes' : `Faltan ${faltan} por subir`}
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug t-3">
            {faltan === 0
              ? 'Cuando llegue uno nuevo, se suelta aquí y se coloca solo.'
              : 'Suelta la carpeta entera: cada informe va a su sitio, de los dos a la vez.'}
          </p>
        </div>
      </div>

      {/* Subir y sacar en papel, juntos: antes el PDF iba en un botón de
          ancho entero aparte, una fila más que bajar para llegar a las áreas. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onSubir} className="btn-primary px-3 text-xs">
          📁 Subir informes
        </button>
        {onExportar && (
          <button type="button" onClick={onExportar} className="btn-ghost px-3 text-xs">
            📄 Exportar a PDF
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {tablero.map(({ profile, filas }) => (
          <div key={profile.id} className="min-w-0 rounded-xl border p-2 hairline surf-1">
            {/* Cada niño lleva su color y no el acento del panel: aquí se
                habla de los dos a la vez. El color va en el punto y no en las
                letras: el rojo de Hugo sobre la tarjeta verde de Leo se
                quedaba en 3,5:1 de noche, y el tono de día en 1,5:1. */}
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide t-1">
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: accentFor(profile, mode) }}
              />
              {profile.name}
            </p>
            <ul className="mt-1 space-y-1">
              {filas.map((fila) => {
                const estado = estadoDe(fila);
                const hay = estado === 'hay';
                return (
                  <li key={fila.id} className="flex items-center gap-2 text-[11px]">
                    <span aria-hidden className={estado === 'falta' ? 'opacity-40' : ''}>
                      {fila.icon}
                    </span>
                    <span className={`min-w-0 flex-1 truncate ${hay ? 't-2' : 't-3'}`}>{fila.label}</span>
                    {/* A dos columnas en el móvil no cabe «3 desde 2024» al
                        lado del nombre: lo que está se marca con ✓ y el
                        detalle queda en el título y para el lector. */}
                    <span
                      className={`shrink-0 font-black ${hay ? 't-accent' : 't-danger'}`}
                      title={hay ? fila.detalle : estado === 'viejo' ? 'Es del curso pasado' : undefined}
                    >
                      {estado === 'hay' ? (
                        <>
                          <span aria-hidden>✓</span>
                          <span className="sr-only">{fila.detalle}</span>
                        </>
                      ) : estado === 'viejo' ? (
                        <>
                          antiguo<span className="sr-only">, del curso pasado</span>
                        </>
                      ) : (
                        'falta'
                      )}
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
