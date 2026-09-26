'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import type { HabitStore } from '@/hooks/useHabitStore';
import {
  FOOTBAR_RETURN_KEY,
  footbarConnectUrl,
  footbarDisconnect,
  footbarStatus,
  footbarUpdate,
  type FootbarStatus,
  type FootbarSyncResult,
} from '@/lib/footbarClient';
import { PROFILES } from '@/lib/profiles';
import type { ProfileId } from '@/types';

/* =========================================================================
 *  Ajustes → 🛰️ GPS: las sesiones de Footbar, solas.
 *
 *  Cada peque se conecta una vez con su cuenta de Footbar —la contraseña se
 *  escribe en la página de Footbar, no aquí— y desde entonces sus sesiones
 *  entran solas en su GPS: al rato de acabar, cuando Footbar avisa, y en la
 *  revisión de cada día a las 21:00 por si algún aviso se perdió. El botón
 *  de actualizar hace esa misma revisión en el momento.
 * ========================================================================= */

const KIDS = PROFILES.filter((profile) => profile.kind === 'kid');

function when(iso?: string): string {
  if (!iso) return 'todavía no';
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  return date.toLocaleString('es-ES', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Lo que ha traído una revisión, dicho en una frase. */
function summary(results: FootbarSyncResult[]): string {
  if (results.length === 0) return 'No hay nadie conectado a Footbar todavía.';
  // El corte del cupo es uno para todos: se dice una vez, al final.
  const cut = results.find((result) => result.throttled)?.error;
  const lines = results
    .map((result) => {
      const name = PROFILES.find((profile) => profile.id === result.profileId)?.name ?? result.profileId;
      if (result.throttled) {
        const got = result.added + result.updated;
        return got > 0 ? `${name}: ${got} bajadas antes del corte` : '';
      }
      if (result.error) return `${name}: ${result.error}`;
      if (result.added === 0 && result.updated === 0) return `${name}: nada nuevo`;
      const parts = [];
      if (result.added) parts.push(`${result.added} ${result.added === 1 ? 'sesión nueva' : 'sesiones nuevas'}`);
      if (result.updated) parts.push(`${result.updated} ${result.updated === 1 ? 'corregida' : 'corregidas'}`);
      return `${name}: ${parts.join(' y ')}`;
    })
    .filter(Boolean);
  if (cut) lines.push(cut);
  return lines.join(' · ');
}

export function FootbarSettings({ store }: { store: HabitStore }) {
  const notify = useToast();
  const [status, setStatus] = useState<FootbarStatus | null>(null);
  const [busy, setBusy] = useState<ProfileId | 'todos' | null>(null);
  /** El último fallo, a la vista en la sección: el aviso flotante se va en tres segundos. */
  const [problem, setProblem] = useState<{ message: string; retry?: string } | null>(null);
  const leaving = useRef<number>();

  const reload = useCallback(async () => setStatus(await footbarStatus()), []);

  // Al volver a la app sin pasar por la vuelta de Footbar —con «atrás», o
  // desde la ventana en la que la abre la app instalada— el botón se quedaba
  // en «Abriendo Footbar…», desactivado para siempre: se suelta y se relee
  // quién está conectado, por si el permiso se dio en esa otra ventana.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== 'visible' || leaving.current === undefined) return;
      window.clearTimeout(leaving.current);
      leaving.current = undefined;
      setBusy(null);
      void reload();
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) back();
    };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    window.addEventListener('pageshow', restored);
    return () => {
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
      window.removeEventListener('pageshow', restored);
      window.clearTimeout(leaving.current);
    };
  }, [reload]);

  const fail = useCallback(
    (error: unknown, retry?: string) => {
      const message = error instanceof Error && error.message ? error.message : 'No ha podido ser.';
      setProblem({ message, retry });
      notify({ message, icon: '⚠️', tone: 'danger', duration: 7000 });
    },
    [notify],
  );

  useEffect(() => {
    void reload();

    // La vuelta desde la pantalla de permiso de Footbar.
    try {
      const raw = window.sessionStorage.getItem(FOOTBAR_RETURN_KEY);
      if (raw) {
        window.sessionStorage.removeItem(FOOTBAR_RETURN_KEY);
        const back = JSON.parse(raw) as { ok: boolean; profileId?: ProfileId; nuevas?: number; motivo?: string };
        const name = PROFILES.find((profile) => profile.id === back.profileId)?.name ?? 'el peque';
        notify(
          back.ok
            ? {
                message: `Footbar de ${name} conectado${back.nuevas ? `: ${back.nuevas} sesiones traídas` : ''}.`,
                icon: '🛰️',
              }
            : { message: back.motivo ?? 'No se ha podido conectar Footbar.', icon: '⚠️', tone: 'danger', duration: 7000 },
        );
        if (!back.ok) setProblem({ message: back.motivo ?? 'No se ha podido conectar Footbar.' });
        if (back.ok) void store.syncNow();
      }
    } catch {
      // Sin almacenamiento de sesión, simplemente no hay aviso.
    }
  }, [notify, reload, store]);

  const connect = async (profileId: ProfileId) => {
    setBusy(profileId);
    setProblem(null);
    let url: string;
    try {
      url = await footbarConnectUrl(profileId);
    } catch (error) {
      fail(error);
      setBusy(null);
      return;
    }

    // Si a los ocho segundos seguimos aquí y a la vista, lo más seguro es que
    // el navegador no haya salido hacia Footbar: se dice, y queda un enlace
    // para abrirla a mano.
    window.clearTimeout(leaving.current);
    leaving.current = window.setTimeout(() => {
      leaving.current = undefined;
      if (document.visibilityState !== 'visible') return;
      setBusy(null);
      fail(new Error('Si no se ha abierto la página de Footbar, ábrela desde aquí.'), url);
    }, 8000);
    window.location.assign(url);
  };

  const update = async (profileId?: ProfileId) => {
    setBusy(profileId ?? 'todos');
    setProblem(null);
    try {
      const results = await footbarUpdate(profileId);
      // Lo nuevo está ya en la nube: se baja para que se vea aquí.
      await store.syncNow();
      const failed = results.some((result) => result.error);
      notify({ message: summary(results), icon: failed ? '⚠️' : '🛰️', tone: failed ? 'danger' : 'neutral' });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
      void reload();
    }
  };

  const disconnect = async (profileId: ProfileId, name: string) => {
    setBusy(profileId);
    setProblem(null);
    try {
      await footbarDisconnect(profileId);
      notify({ message: `Footbar de ${name} desconectado. Sus sesiones siguen en la app.`, icon: '🔌' });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
      void reload();
    }
  };

  const connected = status?.links ?? [];

  return (
    <section className="space-y-3 rounded-2xl border hairline surf-1 p-3">
      <div>
        <h3 className="mb-1 font-bold t-1">Sesiones de Footbar, solas</h3>
        <p className="text-xs leading-relaxed t-3">
          Conecta una vez la cuenta de Footbar de cada peque: se entra con su correo y su contraseña
          en la página de Footbar, no aquí. Desde entonces sus sesiones entran solas en su GPS —al
          rato de acabar, y cada día a las <strong>21:00</strong> se revisa por si falta alguna—.
          Las aceleraciones y las deceleraciones no las da la API de Footbar: esas siguen entrando
          con la foto.
        </p>
      </div>

      {problem && (
        <div
          role="alert"
          className="rounded-xl border border-red-400/50 bg-red-400/10 p-3 text-xs leading-relaxed t-2"
        >
          <p>⚠️ {problem.message}</p>
          {problem.retry && (
            <a href={problem.retry} className="mt-1 inline-block font-bold underline">
              Abrir la página de Footbar
            </a>
          )}
        </div>
      )}

      {status === null ? (
        <p className="text-xs t-3">Mirando la conexión…</p>
      ) : !status.configured ? (
        <p className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-xs leading-relaxed t-2">
          ⚙️ {status.reason ?? 'Footbar no está disponible ahora mismo.'}
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => update()}
            disabled={busy !== null || connected.length === 0}
            className="btn-primary w-full"
          >
            {busy === 'todos' ? 'Buscando sesiones…' : '🔄 Actualizar ahora'}
          </button>

          {KIDS.map((kid) => {
            const link = connected.find((item) => item.profileId === kid.id);
            return (
              <div key={kid.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 hairline surf-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold t-1">
                    {link ? (link.needsReconnect ? '⚠️' : '✅') : '⬜'} {kid.name}
                  </p>
                  <p className="text-[11px] leading-snug t-3">
                    {!link
                      ? 'Sin conectar.'
                      : link.needsReconnect
                        ? 'Footbar ya no acepta el permiso: vuelve a conectarlo.'
                        : `Última revisión: ${when(link.lastSync)}.`}
                  </p>
                </div>
                {link && !link.needsReconnect ? (
                  <>
                    <button
                      type="button"
                      onClick={() => update(kid.id)}
                      disabled={busy !== null}
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      {busy === kid.id ? '…' : 'Revisar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => disconnect(kid.id, kid.name)}
                      disabled={busy !== null}
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      Quitar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => connect(kid.id)}
                    disabled={busy !== null}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    {busy === kid.id ? 'Abriendo Footbar…' : link ? 'Reconectar' : 'Conectar Footbar'}
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
