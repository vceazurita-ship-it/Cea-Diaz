'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import * as calendar from '@/lib/calendar';
import type { CalendarLink, CalendarOption, Profile } from '@/types';

/* =========================================================================
 *  La cuenta de Google Calendar de un perfil.
 *
 *  Cada uno enlaza la suya, y quien todavía no tiene cuenta —Leo, Hugo—
 *  puede colgar sus recados del calendario de un adulto: lo que se elige no
 *  es sólo la cuenta, es también en qué calendario de esa cuenta caen. Así
 *  «Leo: dentista el martes» puede acabar en el calendario compartido de la
 *  familia sin mezclarse con el trabajo de nadie.
 * ========================================================================= */

/** «hace un momento», «hace 3 h», «el 12 de agosto». */
function whenChecked(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 2) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 48 * 60) return `hace ${Math.round(minutes / 60)} h`;
  return `el ${new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(new Date(iso))}`;
}

interface CalendarAccountProps {
  profile: Profile;
  kid: boolean;
  /** El servidor tiene Google configurado. */
  available: boolean;
  /** Qué falta por configurar, si no lo está. */
  reason?: string;
  link?: CalendarLink;
  /** Vuelve a preguntar el estado tras conectar, elegir o desconectar. */
  onChanged: () => void;
}

export function CalendarAccount({
  profile,
  kid,
  available,
  reason,
  link,
  onChanged,
}: CalendarAccountProps) {
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<CalendarOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notify = useToast();

  const fail = (problem: unknown) => {
    setError(problem instanceof Error ? problem.message : 'No ha podido ser.');
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await calendar.connectUrl(profile.id);
      // Se sale de la app a la pantalla de permisos de Google y se vuelve
      // por `/api/calendario/callback`, que devuelve aquí con el resultado.
      window.location.href = url;
    } catch (problem) {
      fail(problem);
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await calendar.disconnect(profile.id);
      setOptions(null);
      notify({ message: `Calendario de ${profile.name} desconectado.`, icon: '🔌' });
      onChanged();
    } catch (problem) {
      fail(problem);
    } finally {
      setBusy(false);
    }
  };

  const loadCalendars = async () => {
    setBusy(true);
    setError(null);
    try {
      setOptions(await calendar.calendars(profile.id));
    } catch (problem) {
      fail(problem);
      // Puede haber fallado porque el permiso ha muerto; el servidor lo deja
      // anotado y al releer el estado aparece el aviso de reconectar.
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await calendar.check(profile.id);
      notify({ message: 'La conexión sigue viva.', icon: '✅' });
    } catch (problem) {
      fail(problem);
    } finally {
      // En los dos casos: el servidor acaba de anotar si el permiso vale o no.
      onChanged();
      setBusy(false);
    }
  };

  const choose = async (option: CalendarOption) => {
    setBusy(true);
    setError(null);
    try {
      await calendar.chooseCalendar(profile.id, option.id, option.name);
      setOptions(null);
      notify({ message: `Los recados irán a «${option.name}».`, icon: '📆' });
      onChanged();
    } catch (problem) {
      fail(problem);
    } finally {
      setBusy(false);
    }
  };

  /* --------------------------------------------------- sin configurar */

  if (!available) {
    return (
      <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
        <p className="text-sm font-bold t-1">📆 Google Calendar</p>
        <p className="mt-1 text-xs leading-relaxed t-3">
          {reason
            ? `${reason} Mientras tanto, las tareas se guardan igual y se ven en todos los móviles de casa.`
            : 'No está disponible ahora mismo. Las tareas se guardan igual y se ven en todos los móviles de casa.'}
        </p>
      </div>
    );
  }

  /* ------------------------------------------------------- sin enlazar */

  if (!link) {
    return (
      <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
        <p className="text-sm font-bold t-1">📆 Llevar los recados a Google Calendar</p>
        <p className="mt-1 text-xs leading-relaxed t-3">
          Conectando una cuenta, las tareas de {profile.name} se pueden mandar al calendario y
          avisar solas a la hora. Puede ser su propia cuenta o la de un adulto: luego se elige en
          qué calendario caen.
        </p>

        <button
          type="button"
          onClick={connect}
          disabled={busy}
          className="btn-primary mt-3 px-3 py-2 text-xs"
        >
          {busy ? '⏳ Abriendo Google…' : '🔗 Conectar una cuenta de Google'}
        </button>

        {error && <p className="mt-2 text-xs t-danger">⚠️ {error}</p>}
      </div>
    );
  }

  /* ---------------------------------------------------------- enlazado */

  const broken = link.needsReconnect;

  return (
    <div className={`${kid ? 'card-kid' : 'card'} p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`chip text-[10px] uppercase tracking-wide
            ${broken ? 'chip-soft t-danger' : 'chip-accent'}`}
        >
          {broken ? '⚠️ Hay que reconectar' : '📆 Conectado'}
        </span>
        <p className="text-xs t-2">
          <span className="font-bold t-1">{link.email}</span> · cae en{' '}
          <span className="font-semibold">{link.calendarName}</span>
        </p>
      </div>

      {/* Un permiso muerto no puede pasar desapercibido: mientras lo esté,
          nada llega al calendario y el móvil no avisa de nada. */}
      {broken && (
        <div
          role="alert"
          className="mt-3 rounded-xl border px-3 py-2.5"
          style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-bg)' }}
        >
          <p className="text-xs leading-relaxed t-danger">
            <strong>Google ha dejado de aceptar el permiso.</strong> Suele pasar si se retiró
            desde la cuenta, si cambió la contraseña o si el proyecto de Google sigue sin
            publicar (ahí los permisos caducan a los siete días). Los recados se siguen
            apuntando y se mandarán solos en cuanto vuelvas a conectar.
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="btn-primary mt-2.5 px-3 py-1.5 text-xs"
          >
            {busy ? '⏳ Abriendo Google…' : '🔗 Volver a conectar'}
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={options ? () => setOptions(null) : loadCalendars}
          disabled={busy}
          className="btn-ghost px-2.5 py-1.5 text-[11px]"
        >
          {busy && !options ? '⏳…' : options ? '▾ Cerrar' : '🗂️ Cambiar de calendario'}
        </button>

        <button
          type="button"
          onClick={verify}
          disabled={busy}
          className="btn-ghost px-2.5 py-1.5 text-[11px]"
        >
          🩺 Comprobar
        </button>

        <button
          type="button"
          onClick={disconnect}
          disabled={busy}
          className="btn-ghost t-danger ml-auto px-2.5 py-1.5 text-[11px]"
        >
          🔌 Desconectar
        </button>
      </div>

      {options && (
        <ul className="mt-2 space-y-1">
          {options.length === 0 && (
            <li className="text-xs t-3">Esta cuenta no tiene calendarios en los que escribir.</li>
          )}

          {options.map((option) => {
            const active = option.id === link.calendarId;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => choose(option)}
                  disabled={busy || active}
                  className={`btn w-full justify-start border px-3 py-2 text-xs
                    ${active ? 'bg-accent-soft border-accent t-1' : 'hairline surf-2 t-2 hover-soft'}`}
                >
                  {active ? '●' : '○'} {option.name}
                  {option.primary && <span className="t-3"> · principal</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-2 text-xs t-danger">⚠️ {error}</p>}

      <p className="mt-2 text-[11px] leading-relaxed t-3">
        Lo que se apunte con fecha irá a este calendario y avisará solo, en el móvil de quien
        tenga esta cuenta añadida. Lo que no tenga fecha se queda aquí, y cualquier recado se
        puede quitar del calendario desde su propio botón.
        {link.checkedAt && ` · Última comprobación: ${whenChecked(link.checkedAt)}.`}
      </p>
    </div>
  );
}
