'use client';

import { useId, useMemo, useState } from 'react';

import { ColegioPanel } from '@/components/rendimiento/ColegioPanel';
import { ExportarPdf } from '@/components/rendimiento/ExportarPdf';
import { FisicoPanel } from '@/components/rendimiento/FisicoPanel';
import { Inventario } from '@/components/rendimiento/Inventario';
import { SubirInforme } from '@/components/rendimiento/SubirInforme';
import { GpsPanel } from '@/components/gps/GpsPanel';
import { Modal } from '@/components/ui/Modal';
import { useGpsSessions } from '@/hooks/useGps';
import type { HabitStore } from '@/hooks/useHabitStore';
import { reportsFor } from '@/lib/academics';
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

type Area = 'partidos' | 'fisico' | 'colegio';

export function RendimientoPanel({ profile, store, kid, skin }: RendimientoPanelProps) {
  const [area, setArea] = useState<Area>('partidos');
  const [subiendo, setSubiendo] = useState(false);
  const [exportando, setExportando] = useState(false);
  const sessions = useGpsSessions(profile.id);
  const tabsId = useId();

  const tests = useMemo(() => testsFor(store.entries, profile.id), [store.entries, profile.id]);
  const reports = useMemo(() => reportsFor(store.entries, profile.id), [store.entries, profile.id]);

  /** Guardar un informe es guardar una línea en las notas de su día. */
  const guardar = (quien: ProfileId, date: DateKey, key: string, line: string) => {
    store.setEntryNote(quien, date, key, line);
  };

  const areas: { id: Area; label: string; icon: string; count: number }[] = [
    { id: 'partidos', label: 'Partidos', icon: '🛰️', count: sessions.length },
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
      <Inventario entries={store.entries} onSubir={() => setSubiendo(true)} />

      {/* Todo lo de los dos —hábitos, entrenos, pruebas, colegio— en papel. */}
      <button type="button" onClick={() => setExportando(true)} className="btn-ghost w-full text-sm">
        📄 Exportar a PDF
      </button>

      {/* Las tres áreas, pegadas a lo que abren. Se ven siempre las tres,
          aunque una esté vacía: una sección que no se sabe que existe no se
          llena nunca. Antes iban arriba del todo, con el inventario y el PDF
          en medio, y no se veía qué era lo que cambiaban. */}
      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Área de rendimiento">
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
              className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                activa ? 'border-transparent bg-accent t-on-accent' : 'hairline surf-1 t-2'
              }`}
            >
              <span aria-hidden className="block text-lg leading-none">
                {item.icon}
              </span>
              <span className="mt-1 block text-[11px] font-black leading-tight">{item.label}</span>
              <span className={`block text-[10px] leading-tight ${activa ? 't-on-accent opacity-70' : 't-3'}`}>
                {item.count === 0 ? 'vacío' : item.count}
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
        {area === 'partidos' && <GpsPanel profile={profile} store={store} kid={kid} skin={skin} />}
        {area === 'fisico' && (
          <FisicoPanel profile={profile} entries={store.entries} sessions={sessions} skin={skin} onSave={guardar} />
        )}
        {area === 'colegio' && (
          <ColegioPanel profile={profile} entries={store.entries} skin={skin} onSave={guardar} />
        )}
      </div>

      {subiendo && (
        <Modal title="Subir informes" onClose={() => setSubiendo(false)}>
          <SubirInforme profile={profile} onSave={guardar} onClose={() => setSubiendo(false)} />
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
