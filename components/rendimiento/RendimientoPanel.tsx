'use client';

import { useMemo, useState } from 'react';

import { ColegioPanel } from '@/components/rendimiento/ColegioPanel';
import { FisicoPanel } from '@/components/rendimiento/FisicoPanel';
import { GpsPanel } from '@/components/gps/GpsPanel';
import { useGpsSessions } from '@/hooks/useGps';
import type { HabitStore } from '@/hooks/useHabitStore';
import { reportsFor } from '@/lib/academics';
import { testsFor } from '@/lib/fitness';
import type { DateKey, Profile, ProfileSkin } from '@/types';

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
  const sessions = useGpsSessions(profile.id);

  const tests = useMemo(() => testsFor(store.entries, profile.id), [store.entries, profile.id]);
  const reports = useMemo(() => reportsFor(store.entries, profile.id), [store.entries, profile.id]);

  /** Guardar un informe es guardar una línea en las notas de su día. */
  const guardar = (date: DateKey, key: string, line: string) => {
    store.setEntryNote(profile.id, date, key, line);
  };

  const areas: { id: Area; label: string; icon: string; count: number }[] = [
    { id: 'partidos', label: 'Partidos', icon: '🛰️', count: sessions.length },
    { id: 'fisico', label: 'Físico', icon: '💪', count: tests.length },
    { id: 'colegio', label: 'Colegio', icon: '📚', count: reports.length },
  ];

  return (
    <div className="space-y-4">
      {/* Las tres áreas. Se ven siempre las tres, aunque una esté vacía: una
          sección que no se sabe que existe no se llena nunca. */}
      <div className="grid grid-cols-3 gap-2">
        {areas.map((item) => {
          const activa = area === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setArea(item.id)}
              aria-pressed={activa}
              className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                activa ? 'border-transparent text-white' : 'hairline surf-1 t-2'
              }`}
              style={activa ? { backgroundColor: profile.accentDeep ?? profile.accent } : undefined}
            >
              <span aria-hidden className="block text-lg leading-none">
                {item.icon}
              </span>
              <span className="mt-1 block text-[11px] font-black leading-tight">{item.label}</span>
              <span className={`block text-[10px] leading-tight ${activa ? 'text-white/70' : 't-3'}`}>
                {item.count === 0 ? 'vacío' : item.count}
              </span>
            </button>
          );
        })}
      </div>

      {area === 'partidos' && <GpsPanel profile={profile} store={store} kid={kid} skin={skin} />}
      {area === 'fisico' && (
        <FisicoPanel profile={profile} entries={store.entries} sessions={sessions} skin={skin} onSave={guardar} />
      )}
      {area === 'colegio' && (
        <ColegioPanel profile={profile} entries={store.entries} skin={skin} onSave={guardar} />
      )}
    </div>
  );
}
