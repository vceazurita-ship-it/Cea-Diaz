'use client';

import { useEffect, useMemo, useState } from 'react';

import { SectionHead } from '@/components/summary/SectionHead';
import { asignaturaDeCurso, type ClassroomProfile } from '@/lib/classroomModel';
import { esImagen, materialesCole, pesoLegible, type ArchivoFirmado } from '@/lib/coleArchivos';
import { friendlyDateLabel, toDateKey } from '@/lib/dates';
import { ASIGNATURAS, RETO_META } from '@/lib/retoCole';
import type { Asignatura } from '@/lib/temario';
import type { ProfileSkin } from '@/types';

/* =========================================================================
 *  Los apuntes del cole, en bruto: los PDF de los resúmenes, las circulares
 *  y las fotos de las fichas que la profesora cuelga en Classroom, por
 *  asignatura. Se abren tal cual, para estudiar con ellos.
 *
 *  Los sube `scripts/subir-cole.mjs` a la nube privada de la cuenta (ver
 *  `lib/coleArchivos.ts`). Si no hay nada subido, o no hay sesión, la
 *  sección no aparece.
 * ========================================================================= */

type Grupo = Asignatura | 'otros';

const ROTULO_OTROS = { nombre: 'Tutoría y circulares', icon: '🏫' };

function rotulo(g: Grupo) {
  return g === 'otros' ? ROTULO_OTROS : RETO_META[g];
}

export function MaterialesCole({
  profileId,
  kid,
  skin,
}: {
  profileId: ClassroomProfile;
  kid: boolean;
  skin: ProfileSkin;
}) {
  const [datos, setDatos] = useState<{ subido: string; archivos: ArchivoFirmado[] } | null | undefined>(undefined);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    materialesCole(profileId)
      .then((d) => vivo && setDatos(d))
      .catch((e: unknown) => {
        if (!vivo) return;
        setDatos(null);
        setFallo(e instanceof Error ? e.message : 'No se pudieron abrir.');
      });
    return () => {
      vivo = false;
    };
  }, [profileId]);

  const grupos = useMemo(() => {
    const porGrupo = new Map<Grupo, ArchivoFirmado[]>();
    for (const a of datos?.archivos ?? []) {
      const g: Grupo = asignaturaDeCurso(a.clase) ?? 'otros';
      porGrupo.set(g, [...(porGrupo.get(g) ?? []), a]);
    }
    return ([...ASIGNATURAS, 'otros'] as Grupo[])
      .filter((g) => porGrupo.has(g))
      .map((g) => ({
        grupo: g,
        // Primero los PDF (los resúmenes), luego las fotos de las fichas.
        archivos: (porGrupo.get(g) ?? []).sort(
          (a, b) => Number(esImagen(a)) - Number(esImagen(b)) || a.titulo.localeCompare(b.titulo, 'es'),
        ),
      }));
  }, [datos]);

  if (datos === undefined) return null;
  if (fallo) return <p className="px-1 text-[11px] leading-snug t-warn">📚 Los apuntes del cole no se han podido abrir: {fallo}</p>;
  if (!datos || datos.archivos.length === 0) return null;

  return (
    <section className={`${kid ? 'card-kid' : 'card'} p-4`} aria-label="Apuntes del cole">
      <SectionHead
        title="Apuntes del cole"
        skin={skin}
        meta={`${datos.archivos.length} · ${friendlyDateLabel(toDateKey(new Date(datos.subido)))}`}
      />
      <p className="-mt-1.5 mb-3 text-[11px] leading-snug t-3">
        Los PDF y las fichas de Classroom, tal cual. Toca uno para abrirlo.
      </p>
      <div className="space-y-1.5">
        {grupos.map(({ grupo, archivos }) => {
          const r = rotulo(grupo);
          const docs = archivos.filter((a) => !esImagen(a));
          const fotos = archivos.filter(esImagen);
          return (
            <details key={grupo} className="group rounded-xl border p-2.5 hairline surf-1">
              <summary className="flex cursor-pointer list-none items-center gap-2">
                <span aria-hidden>{r.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-bold t-1">{r.nombre}</span>
                <span className="text-[11px] tabular-nums t-3">
                  {docs.length > 0 && `${docs.length} PDF`}
                  {docs.length > 0 && fotos.length > 0 && ' · '}
                  {fotos.length > 0 && `${fotos.length} ${fotos.length === 1 ? 'ficha' : 'fichas'}`}
                </span>
              </summary>

              {docs.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {docs.map((a) => (
                    <li key={a.ruta} className="flex items-baseline gap-2 text-[12px]">
                      <span aria-hidden>📄</span>
                      {a.url ? (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate font-semibold t-1 hover:underline"
                        >
                          {a.titulo}
                        </a>
                      ) : (
                        <span className="min-w-0 flex-1 truncate t-3">{a.titulo}</span>
                      )}
                      <span className="shrink-0 text-[10px] tabular-nums t-3">{pesoLegible(a.peso)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {fotos.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {fotos.map((a) =>
                    a.url ? (
                      <a
                        key={a.ruta}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={a.titulo}
                        className="block aspect-[3/4] overflow-hidden rounded-lg border hairline"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado de la nube privada */}
                        <img src={a.url} alt={a.titulo} loading="lazy" className="h-full w-full object-cover" />
                      </a>
                    ) : null,
                  )}
                </div>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
