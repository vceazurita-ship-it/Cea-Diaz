'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { SectionHead } from '@/components/summary/SectionHead';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { useToday } from '@/hooks/useToday';
import {
  CLASSROOM_RETURN_KEY,
  ClassroomError,
  classroomCached,
  classroomConnectUrl,
  classroomDisconnect,
  classroomStatus,
  classroomSync,
  needsSync,
  type ClassroomStatus,
} from '@/lib/classroomClient';
import {
  CUANDO_META,
  MENSAJE_COLEGIO,
  asignaturaDeCurso,
  avisosRecientes,
  cursoDe,
  pendientesPorEntrega,
  temaDe,
  type ClassroomMaterial,
  type ClassroomProfile,
  type ClassroomSnapshot,
  type ClassroomTarea,
  type CuandoVence,
} from '@/lib/classroomModel';
import { capitalize, friendlyDateLabel } from '@/lib/dates';
import { RETO_META } from '@/lib/retoCole';
import type { ProfileSkin } from '@/types';

/* =========================================================================
 *  Classroom, dentro de Rendimiento → Colegio.
 *
 *  Lo que la profesora ha colgado para Leo o para Hugo, sin salir de la app:
 *  qué hay que entregar y cuándo, los avisos de las dos últimas semanas y
 *  los materiales de cada clase. Sólo se lee: entregar se sigue haciendo en
 *  Classroom, y cada tarea lleva su enlace.
 *
 *  Se baja de nuevo al abrir si lo guardado tiene más de seis horas, y con
 *  «Actualizar». Sin la integración configurada, lo dice en una línea y no
 *  ocupa más.
 * ========================================================================= */

interface ClassroomPanelProps {
  profileId: ClassroomProfile;
  kid: boolean;
  skin: ProfileSkin;
}

const TONO: Record<CuandoVence, string> = {
  atrasada: 't-danger',
  hoy: 't-warn',
  manana: 't-warn',
  semana: 't-info',
  despues: 't-3',
  'sin-fecha': 't-3',
};

/** Estos grupos arrancan plegados: no corren prisa. */
const PLEGADOS = new Set<CuandoVence>(['despues', 'sin-fecha']);

const ICONO_MATERIAL: Record<ClassroomMaterial['tipo'], string> = {
  drive: '📄',
  youtube: '▶️',
  enlace: '🔗',
  formulario: '📝',
};

function hace(iso: string | undefined): string {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** El rótulo de la asignatura de la app, o el nombre de la clase si no encaja. */
function asignaturaRotulo(snapshot: ClassroomSnapshot, cursoId: string): { icon: string; nombre: string } {
  const curso = cursoDe(snapshot, cursoId);
  if (!curso) return { icon: '📘', nombre: 'Clase' };
  const asignatura = asignaturaDeCurso(curso.nombre, curso.seccion);
  return asignatura ? { icon: RETO_META[asignatura].icon, nombre: curso.nombre } : { icon: '📘', nombre: curso.nombre };
}

function Materiales({ lista }: { lista: ClassroomMaterial[] }) {
  if (lista.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {lista.map((m, i) => (
        <li key={`${m.titulo}-${i}`} className="truncate text-[11px] t-2">
          <span aria-hidden>{ICONO_MATERIAL[m.tipo]} </span>
          {m.enlace ? (
            <a href={m.enlace} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">
              {m.titulo}
            </a>
          ) : (
            m.titulo
          )}
        </li>
      ))}
    </ul>
  );
}

function EstadoChip({ tarea }: { tarea: ClassroomTarea }) {
  if (tarea.estado === 'retirada') return <span className="chip-soft text-[10px] font-bold t-warn">Retirada</span>;
  if (tarea.tarde) return <span className="chip-soft text-[10px] font-bold t-danger">Fuera de plazo</span>;
  return <span className="chip-soft text-[10px] font-bold t-2">Sin entregar</span>;
}

function TareaFila({ tarea, snapshot, cuando }: { tarea: ClassroomTarea; snapshot: ClassroomSnapshot; cuando: CuandoVence }) {
  const asig = asignaturaRotulo(snapshot, tarea.cursoId);
  const tema = temaDe(snapshot, tarea.cursoId, tarea.temaId);
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-base">
        {asig.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold leading-snug t-1">
          {tarea.enlace ? (
            <a href={tarea.enlace} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {tarea.titulo}
            </a>
          ) : (
            tarea.titulo
          )}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug t-3">
          {tarea.entrega && (
            <span className={`font-semibold tabular-nums ${TONO[cuando]}`}>
              {capitalize(friendlyDateLabel(tarea.entrega))}
              {tarea.hora ? ` · ${tarea.hora}` : ''}
              {' · '}
            </span>
          )}
          {asig.nombre}
          {tema ? ` · ${tema}` : ''}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <EstadoChip tarea={tarea} />
          {tarea.enlace && (
            <a
              href={tarea.enlace}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold t-accent"
            >
              Abrir en Classroom ↗
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export function ClassroomPanel({ profileId, kid, skin }: ClassroomPanelProps) {
  const hoy = useToday();
  const [status, setStatus] = useState<ClassroomStatus | undefined>(() => classroomCached(profileId));
  const [bajando, setBajando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<{ message: string; codigo?: string } | null>(null);
  const [vuelta, setVuelta] = useState<{ ok: boolean; motivo?: string } | null>(null);

  const actualizar = useCallback(async () => {
    setBajando(true);
    setError(null);
    try {
      const link = await classroomSync(profileId);
      setStatus({ configured: true, link });
    } catch (problem) {
      setError({
        message: problem instanceof Error ? problem.message : 'No se ha podido actualizar.',
        codigo: problem instanceof ClassroomError ? problem.codigo : undefined,
      });
      // El fallo queda anotado en el servidor: se vuelve a leer para que lo
      // guardado (y su motivo) sea lo que se ve.
      const fresh = await classroomStatus(profileId, true);
      if (fresh.configured) setStatus(fresh);
    } finally {
      setBajando(false);
    }
  }, [profileId]);

  // Al abrir: lo guardado, y si es viejo, a por lo nuevo.
  useEffect(() => {
    let alive = true;
    void classroomStatus(profileId).then((s) => {
      if (!alive) return;
      setStatus(s);
      if (s.configured && needsSync(s.link)) void actualizar();
    });
    return () => {
      alive = false;
    };
  }, [profileId, actualizar]);

  // La vuelta desde la pantalla de Google, que dejó el desenlace anotado.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(CLASSROOM_RETURN_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { ok: boolean; profileId?: string; motivo?: string };
      if (parsed.profileId && parsed.profileId !== profileId) return;
      window.sessionStorage.removeItem(CLASSROOM_RETURN_KEY);
      setVuelta({ ok: parsed.ok, motivo: parsed.motivo });
      // Lo que se acaba de bajar en el servidor aún no está en la memoria.
      void classroomStatus(profileId, true).then((s) => {
        if (s.configured) setStatus(s);
      });
    } catch {
      // Sin almacenamiento de sesión no hay aviso, y no pasa nada.
    }
  }, [profileId]);

  const conectar = async () => {
    setOcupado(true);
    setError(null);
    try {
      window.location.assign(await classroomConnectUrl(profileId));
    } catch (problem) {
      setError({ message: problem instanceof Error ? problem.message : 'No se ha podido abrir Google.' });
      setOcupado(false);
    }
  };

  const desconectar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await classroomDisconnect(profileId);
      setStatus((prev) => ({ configured: prev?.configured ?? true, link: null }));
      setVuelta(null);
    } catch (problem) {
      setError({ message: problem instanceof Error ? problem.message : 'No se ha podido desconectar.' });
    } finally {
      setOcupado(false);
    }
  };

  const link = status?.link ?? null;
  const snapshot = link?.snapshot ?? null;
  const grupos = useMemo(() => pendientesPorEntrega(snapshot, hoy), [snapshot, hoy]);
  const avisos = useMemo(() => avisosRecientes(snapshot, 14), [snapshot]);
  const pendientes = grupos.reduce((n, g) => n + g.tareas.length, 0);

  const card = `${kid ? 'card-kid' : 'card'} p-4`;

  /* ------------------------------------------------------------ cargando */
  if (!status) {
    return <div className="skeleton h-20 rounded-2xl" aria-busy="true" aria-label="Cargando Classroom" />;
  }

  /* ------------------------------------------------------ sin configurar */
  if (!status.configured) {
    return (
      <p className="px-1 text-[11px] leading-snug t-3">
        🏫 Classroom no está disponible en este servidor{status.reason ? `: ${status.reason}` : '.'}
      </p>
    );
  }

  const bloqueo = error?.codigo === 'colegio' || link?.codigo === 'colegio';
  const permisoCaido = !bloqueo && (error?.codigo === 'permiso' || link?.codigo === 'permiso');

  return (
    <section className={card} aria-label="Google Classroom">
      <SectionHead
        title="Classroom"
        skin={skin}
        meta={
          link
            ? bajando
              ? 'actualizando…'
              : `${pendientes} por entregar · ${hace(link.syncedAt)}`
            : undefined
        }
        action={
          link ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => void actualizar()}
                disabled={bajando || ocupado}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                {bajando ? '⏳' : '🔄'} Actualizar
              </button>
              <ConfirmButton
                question="¿Desconectar Classroom?"
                confirmLabel="Sí, desconectar"
                onConfirm={() => void desconectar()}
                disabled={ocupado}
              >
                Desconectar
              </ConfirmButton>
            </div>
          ) : undefined
        }
      />

      {vuelta && (
        <p className={`banner mb-3 t-2 ${vuelta.ok ? 'banner-ok' : 'banner-danger'}`} role="status">
          {vuelta.ok ? '✅ Classroom conectado.' : `No ha podido ser: ${vuelta.motivo ?? 'algo ha fallado.'}`}
        </p>
      )}

      {/* ---------------------------------------------------- sin conectar */}
      {!link && (
        <div className="space-y-2">
          <p className="text-[12px] leading-snug t-2">
            Sus tareas, los avisos de la profesora y los materiales de cada clase, aquí mismo. Sólo se leen: la app no
            entrega nada.
          </p>
          <button type="button" onClick={() => void conectar()} disabled={ocupado} className="btn-primary px-4 py-2 text-sm">
            🏫 Conectar Classroom
          </button>
          <p className="text-[11px] leading-snug t-3">Se abre Google; entra con la cuenta del colegio del niño.</p>
        </div>
      )}

      {link && (
        <p className="-mt-1.5 mb-3 truncate text-[11px] t-3">
          Cuenta: <span className="font-semibold t-2">{link.email || 'sin correo'}</span>
        </p>
      )}

      {/* ------------------------------------------------------- avisos de fallo */}
      {bloqueo && (
        <p className="banner banner-danger mb-3 t-2" role="alert">
          🚫 {MENSAJE_COLEGIO}
        </p>
      )}
      {permisoCaido && (
        <div className="banner banner-warn mb-3 flex flex-wrap items-center gap-2 t-2" role="alert">
          <span className="flex-1">{error?.message ?? link?.error}</span>
          <button type="button" onClick={() => void conectar()} disabled={ocupado} className="btn-primary px-3 py-1 text-xs">
            Volver a conectar
          </button>
        </div>
      )}
      {!bloqueo && !permisoCaido && (error || link?.error) && (
        <p className="banner banner-warn mb-3 t-2" role="alert">
          {error?.message ?? link?.error}
        </p>
      )}

      {link && !snapshot && !bajando && !bloqueo && (
        <p className="text-[12px] t-3">Aún no se han bajado sus clases. Toca «Actualizar».</p>
      )}
      {link && !snapshot && bajando && <div className="skeleton h-24 rounded-2xl" aria-busy="true" />}

      {snapshot && (
        <div className="space-y-4">
          {/* ------------------------------------------------ para entregar */}
          <div>
            <h4 className="mb-2 text-[12px] font-black t-1">📌 Para entregar</h4>
            {grupos.length === 0 ? (
              <p className="banner banner-ok t-2">Nada pendiente. 🎉</p>
            ) : (
              <div className="space-y-3">
                {grupos.map((g) => {
                  const cabecera = (
                    <>
                      <span className={`text-[11px] font-black uppercase tracking-wide ${TONO[g.cuando]}`}>
                        {CUANDO_META[g.cuando].label}
                      </span>
                      <span className="text-[11px] font-semibold tabular-nums t-3">{g.tareas.length}</span>
                    </>
                  );
                  const lista = (
                    <ul className="mt-2 divide-y divide-[var(--border)]">
                      {g.tareas.map((t) => (
                        <TareaFila key={t.id} tarea={t} snapshot={snapshot} cuando={g.cuando} />
                      ))}
                    </ul>
                  );
                  return PLEGADOS.has(g.cuando) ? (
                    <details key={g.cuando} className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-2">
                        {cabecera}
                        <span className="ml-auto text-[11px] font-bold t-accent group-open:hidden">Ver</span>
                        <span className="ml-auto hidden text-[11px] font-bold t-3 group-open:inline">Ocultar</span>
                      </summary>
                      {lista}
                    </details>
                  ) : (
                    <div key={g.cuando}>
                      <div className="flex items-center gap-2">{cabecera}</div>
                      {lista}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ------------------------------------------------------- avisos */}
          {avisos.length > 0 && (
            <div>
              <h4 className="mb-2 text-[12px] font-black t-1">
                📣 Avisos <span className="font-semibold tabular-nums t-3">· últimas dos semanas</span>
              </h4>
              <div className="space-y-1.5">
                {avisos.map((a) => (
                  <details key={a.id} className="group rounded-xl border p-2.5 hairline surf-1">
                    <summary className="flex cursor-pointer list-none items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold t-3">
                          {asignaturaRotulo(snapshot, a.cursoId).nombre} · {fechaCorta(a.fecha)}
                        </span>
                        <span className="block truncate text-[12px] t-1 group-open:hidden">
                          {a.texto.split('\n')[0] || '(sin texto)'}
                        </span>
                      </span>
                      <span className="text-[11px] font-bold t-accent group-open:hidden">Leer</span>
                    </summary>
                    <p className="mt-1.5 whitespace-pre-line text-[12px] leading-snug t-1">{a.texto}</p>
                    <Materiales lista={a.materiales} />
                    {a.enlace && (
                      <a
                        href={a.enlace}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-block text-[11px] font-bold t-accent"
                      >
                        Abrir en Classroom ↗
                      </a>
                    )}
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------- clases */}
          {snapshot.cursos.length > 0 && (
            <div>
              <h4 className="mb-2 text-[12px] font-black t-1">
                🏫 Clases <span className="font-semibold tabular-nums t-3">· {snapshot.cursos.length}</span>
              </h4>
              <div className="space-y-1.5">
                {snapshot.cursos.map((c) => {
                  const asignatura = asignaturaDeCurso(c.nombre, c.seccion);
                  const mats = snapshot.materiales.filter((m) => m.cursoId === c.id);
                  return (
                    <details key={c.id} className="group rounded-xl border p-2.5 hairline surf-1">
                      <summary className="flex cursor-pointer list-none items-center gap-2">
                        <span aria-hidden>{asignatura ? RETO_META[asignatura].icon : '📘'}</span>
                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold t-1">
                          {c.nombre}
                          {c.seccion && <span className="font-normal t-3"> · {c.seccion}</span>}
                        </span>
                        <span className="text-[11px] tabular-nums t-3">
                          {mats.length} {mats.length === 1 ? 'material' : 'materiales'}
                        </span>
                      </summary>
                      <div className="mt-2 space-y-2">
                        {mats.length === 0 && <p className="text-[11px] t-3">Sin materiales colgados.</p>}
                        {mats.map((m) => (
                          <div key={m.id}>
                            <p className="text-[12px] font-semibold t-1">
                              {m.enlace ? (
                                <a href={m.enlace} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                  {m.titulo}
                                </a>
                              ) : (
                                m.titulo
                              )}
                              {temaDe(snapshot, c.id, m.temaId) && (
                                <span className="font-normal t-3"> · {temaDe(snapshot, c.id, m.temaId)}</span>
                              )}
                            </p>
                            <Materiales lista={m.materiales} />
                          </div>
                        ))}
                        {c.enlace && (
                          <a
                            href={c.enlace}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-[11px] font-bold t-accent"
                          >
                            Abrir la clase ↗
                          </a>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          )}

          {snapshot.incompleto && snapshot.incompleto.length > 0 && (
            <p className="text-[11px] leading-snug t-3">⚠️ {snapshot.incompleto.join(' ')}</p>
          )}
        </div>
      )}
    </section>
  );
}
