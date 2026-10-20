'use client';

import { useMemo, useState } from 'react';

import { useToday } from '@/hooks/useToday';
import { classroomPegar } from '@/lib/classroomClient';
import type { ClassroomLinkView, ClassroomProfile } from '@/lib/classroomModel';
import { PEGADO_MAX_CARACTERES, PEGADO_ORIGEN_URL, leerPegado } from '@/lib/classroomPegado';
import { capitalize, friendlyDateLabel } from '@/lib/dates';

/* =========================================================================
 *  Pegar desde Classroom: el camino cuando el colegio no deja conectar.
 *
 *  Se copia la página «Tareas pendientes» con la cuenta del niño y se pega
 *  aquí. Antes de guardar se enseña lo que se ha entendido, para que no
 *  entre nada a ciegas; al guardar, el servidor lo vuelve a leer y lo deja
 *  como si viniera de Google. Lo pegado sustituye a lo anterior: la página
 *  de pendientes es siempre la lista entera.
 * ========================================================================= */

interface PegarClassroomProps {
  profileId: ClassroomProfile;
  nombre: string;
  onGuardado: (link: ClassroomLinkView) => void;
  onCancelar?: () => void;
}

const VISTA_MAX = 8;

export function PegarClassroom({ profileId, nombre, onGuardado, onCancelar }: PegarClassroomProps) {
  const hoy = useToday();
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tareas = useMemo(() => (texto.trim() ? leerPegado(texto, hoy) : []), [texto, hoy]);
  const largo = texto.length > PEGADO_MAX_CARACTERES;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      onGuardado(await classroomPegar(profileId, texto, hoy));
      setTexto('');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'No se ha podido guardar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border p-3 hairline surf-1">
      <ol className="list-decimal space-y-0.5 pl-4 text-[11px] leading-snug t-2">
        <li>
          En el navegador (no en la app de Classroom), entra con la cuenta del colegio de {nombre} y abre{' '}
          <a href={PEGADO_ORIGEN_URL} target="_blank" rel="noopener noreferrer" className="font-bold t-accent">
            Tareas pendientes ↗
          </a>
          .
        </li>
        <li>Selecciona todo (Ctrl+A, o mantén pulsado → «Seleccionar todo») y cópialo.</li>
        <li>Pégalo aquí debajo y revisa lo que sale.</li>
      </ol>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        placeholder={'Pega aquí la página…\n\nO escríbelas tú, una por línea:\nMates: ficha 3 para el jueves'}
        className="field w-full resize-y text-[12px] leading-snug"
        aria-label={`Tareas de Classroom de ${nombre}`}
      />

      {largo && <p className="text-[11px] t-danger">Es demasiado texto: copia sólo la página de tareas pendientes.</p>}

      {texto.trim() && !largo && (
        <div>
          <p className="text-[11px] font-bold t-1">
            {tareas.length === 0
              ? 'No veo ninguna tarea en lo pegado.'
              : `${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'}:`}
          </p>
          {tareas.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {tareas.slice(0, VISTA_MAX).map((t, i) => (
                <li key={`${t.titulo}-${i}`} className="truncate text-[11px] t-2">
                  <span className="font-semibold t-1">{t.titulo}</span>
                  {t.curso ? ` · ${t.curso}` : ''}
                  {' · '}
                  <span className={t.atrasada ? 't-danger' : 't-3'}>
                    {t.entrega ? capitalize(friendlyDateLabel(t.entrega)) : 'sin fecha'}
                  </span>
                </li>
              ))}
              {tareas.length > VISTA_MAX && (
                <li className="text-[11px] t-3">y {tareas.length - VISTA_MAX} más.</li>
              )}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="banner banner-warn t-2" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || largo || tareas.length === 0}
          className="btn-primary px-4 py-2 text-sm"
        >
          {guardando ? 'Guardando…' : tareas.length > 0 ? `Guardar ${tareas.length}` : 'Guardar'}
        </button>
        {onCancelar && (
          <button type="button" onClick={onCancelar} disabled={guardando} className="btn-ghost px-3 py-1.5 text-xs">
            Cancelar
          </button>
        )}
        <span className="text-[10px] leading-snug t-3">Sustituye a la lista anterior. Sólo se guardan las tareas.</span>
      </div>
    </div>
  );
}
