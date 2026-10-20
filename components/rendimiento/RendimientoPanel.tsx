'use client';

import { useId, useMemo, useState } from 'react';

import { ClassroomPanel } from '@/components/classroom/ClassroomPanel';
import { ColegioPanel } from '@/components/rendimiento/ColegioPanel';
import { ExportarPdf } from '@/components/rendimiento/ExportarPdf';
import { FisicoPanel } from '@/components/rendimiento/FisicoPanel';
import { Inventario } from '@/components/rendimiento/Inventario';
import { SubirInforme } from '@/components/rendimiento/SubirInforme';
import { GpsPanel } from '@/components/gps/GpsPanel';
import { PropuestasSemana } from '@/components/tasks/PropuestasSemana';
import { Modal } from '@/components/ui/Modal';
import { useGpsSessions } from '@/hooks/useGps';
import { oneOf, useRemembered } from '@/hooks/useRemembered';
import type { HabitStore } from '@/hooks/useHabitStore';
import { reportsFor } from '@/lib/academics';
import { isClassroomProfile } from '@/lib/classroomModel';
import { testsFor } from '@/lib/fitness';
import type { DateKey, Profile, ProfileId, ProfileSkin } from '@/types';

/* =========================================================================
 *  Rendimiento: las tres cosas que se le miden a un niño, en el mismo sitio.
 *
 *  Antes esto era «GPS» y sólo contaba los partidos. Pero de Leo y de Hugo
 *  hay tres series distintas creciendo a la vez —lo que hacen en el campo,
 *  lo que miden en las pruebas físicas y lo que traen del colegio— y son
 *  series de la misma persona. Tenerlas separadas obliga a cruzarlas de
 *  memoria; tenerlas juntas permite que se crucen solas: la velocidad del
 *  test contra la del partido, el deporte que hace contra la atención que
 *  gasta en clase.
 *
 *  Cada área se alimenta igual de fácil: un botón, el PDF, y ya está. Lo que
 *  no se puede leer se dice, y se puede meter a mano.
 * ========================================================================= */

interface RendimientoPanelProps {
  profile: Profile;
  store: HabitStore;
  kid: boolean;
  skin: ProfileSkin;
}

const AREAS = ['partidos', 'fisico', 'colegio'] as const;
type Area = (typeof AREAS)[number];
const esArea = oneOf(AREAS);

/** Mientras se leen las sesiones guardadas: el hueco de lo que va a salir. */
function RendimientoSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      <div className="skeleton h-24 rounded-2xl" />
      <div className="skeleton h-40 rounded-2xl" />
    </div>
  );
}

export function RendimientoPanel({ profile, store, kid, skin }: RendimientoPanelProps) {
  // Cada aparato recuerda en qué área se miró la última vez.
  const [area, setArea] = useRemembered<Area>('rendimiento:area', 'partidos', esArea);
  const [subiendo, setSubiendo] = useState(false);
  const [exportando, setExportando] = useState(false);
  const loaded = useGpsSessions(profile.id);
  const sessions = loaded ?? [];
  const tabsId = useId();

  const tests = useMemo(() => testsFor(store.entries, profile.id), [store.entries, profile.id]);
  const reports = useMemo(() => reportsFor(store.entries, profile.id), [store.entries, profile.id]);

  /** Guardar un informe es guardar una línea en las notas de su día. */
  const guardar = (quien: ProfileId, date: DateKey, key: string, line: string) => {
    store.setEntryNote(quien, date, key, line);
  };

  const areas: { id: Area; label: string; icon: string; count: number }[] = [
    { id: 'partidos', label: 'Partidos', icon: '🛰️', count: loaded === null ? -1 : sessions.length },
    { id: 'fisico', label: 'Físico', icon: '💪', count: tests.length },
    { id: 'colegio', label: 'Colegio', icon: '📚', count: reports.length },
  ];

  /** Flechas entre pestañas, como pide una lista de pestañas de verdad. */
  const mover = (desde: Area, paso: number) => {
    const i = areas.findIndex((item) => item.id === desde);
    const siguiente = areas[(i + paso + areas.length) % areas.length].id;
    setArea(siguiente);
    document.getElementById(`${tabsId}-tab-${siguiente}`)?.focus();
  };

  return (
    <div className="space-y-4">
      {/* Lo primero que se ve: qué hay cargado y qué falta, de los dos. */}
      {/* El PDF —todo lo de los dos: hábitos, entrenos, pruebas, colegio—
          va dentro, al lado de subir. */}
      <Inventario
        entries={store.entries}
        onSubir={() => setSubiendo(true)}
        onExportar={() => setExportando(true)}
      />

      {/* Las tres áreas, pegadas a lo que abren. Se ven siempre las tres,
          aunque una esté vacía: una sección que no se sabe que existe no se
          llena nunca. Antes iban arriba del todo, con el inventario y el PDF
          en medio, y no se veía qué era lo que cambiaban. Ahora son un
          conmutador de una sola fila, como el de semana y mes: tres fichas
          altas se comían casi setenta píxeles para decir tres palabras. */}
      <div
        className="grid grid-cols-3 gap-0.5 rounded-2xl border p-0.5 hairline surf-1"
        role="tablist"
        aria-label="Área de rendimiento"
      >
        {areas.map((item) => {
          const activa = area === item.id;
          return (
            <button
              key={item.id}
              id={`${tabsId}-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={activa}
              aria-controls={`${tabsId}-panel-${item.id}`}
              tabIndex={activa ? 0 : -1}
              onClick={() => setArea(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') mover(item.id, 1);
                if (event.key === 'ArrowLeft') mover(item.id, -1);
              }}
              className={`flex min-h-[2.75rem] min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 transition-colors ${
                activa ? 'bg-accent t-on-accent shadow' : 't-2 hover-soft'
              }`}
            >
              <span aria-hidden className="text-base leading-none">
                {item.icon}
              </span>
              <span className="truncate text-[12px] font-black leading-tight">{item.label}</span>
              {/* Sin velo sobre la pestaña marcada: a 10 px, el texto encima
                  del acento al 70 % se quedaba en 3,3:1 y no se leía. */}
              <span
                className={`shrink-0 rounded-full px-1.5 text-[10px] font-bold leading-[1.1rem] tabular-nums ${
                  activa ? 't-on-accent bg-black/15' : 't-3 surf-2'
                }`}
              >
                {item.count < 0 ? '…' : item.count === 0 ? '0' : item.count}
                {item.count === 0 && <span className="sr-only"> (vacío)</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id={`${tabsId}-panel-${area}`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-tab-${area}`}
        className="space-y-4"
      >
        {/* Con la clave del niño: un borrador o un filtro de Leo no se queda
            puesto al pasar a Hugo. */}
        {area === 'partidos' && <GpsPanel key={profile.id} profile={profile} store={store} kid={kid} skin={skin} />}
        {area === 'fisico' && loaded === null && <RendimientoSkeleton />}
        {area === 'fisico' && loaded !== null && (
          <FisicoPanel profile={profile} entries={store.entries} sessions={sessions} skin={skin} onSave={guardar} />
        )}
        {area === 'colegio' && (
          <>
            {/* Los recados se ocultan en el panel de los peques: las sesiones
                de estudio que propone el planificador se aceptan aquí. */}
            {kid && <PropuestasSemana profile={profile} store={store} kid={kid} skin={skin} />}
            {/* Lo que la profesora ha colgado en Classroom: sólo de los peques,
                con la cuenta del colegio de cada uno. */}
            {isClassroomProfile(profile.id) && (
              <ClassroomPanel key={profile.id} profileId={profile.id} kid={kid} skin={skin} />
            )}
            <ColegioPanel profile={profile} entries={store.entries} skin={skin} onSave={guardar} />
          </>
        )}
      </div>

      {subiendo && (
        <Modal title="Subir informes" onClose={() => setSubiendo(false)}>
          <SubirInforme profile={profile} onSave={guardar} entries={store.entries} onClose={() => setSubiendo(false)} />
        </Modal>
      )}

      {exportando && (
        <Modal title="Exportar a PDF" onClose={() => setExportando(false)}>
          <ExportarPdf
            entries={store.entries}
            profileId={profile.id}
            accent={profile.accentDeep ?? profile.accent}
            onClose={() => setExportando(false)}
          />
        </Modal>
      )}
    </div>
  );
}
