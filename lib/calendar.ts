import { supabase } from '@/lib/supabase';
import type { CalendarLink, CalendarOption, ProfileId, Task, TaskCalendarLink } from '@/types';

/* =========================================================================
 *  Google Calendar, visto desde el navegador.
 *
 *  Aquí no hay ni un token de Google: la app se limita a pedirle al servidor
 *  «conecta este perfil», «manda este recado». Todo lo demás pasa en
 *  `app/api/calendario`, que es donde viven las credenciales.
 *
 *  Nada de esto es imprescindible. Si el servidor no tiene configurado
 *  Google, `status()` lo dice y la sección de tareas sigue funcionando como
 *  una lista de siempre, guardada en el móvil y en la cuenta de casa.
 * ========================================================================= */

export interface CalendarStatus {
  configured: boolean;
  /** Qué falta por configurar, cuando `configured` es `false`. */
  reason?: string;
  links: CalendarLink[];
}

/** La respuesta de un servidor que ha decidido quejarse. */
interface ErrorPayload {
  error?: string;
}

/** La sesión de casa, que es lo que autoriza a llamar a estas rutas. */
async function authHeader(): Promise<Record<string, string> | null> {
  const client = supabase();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await authHeader();
  if (!auth) throw new Error('Hay que entrar en la cuenta de casa para usar el calendario.');

  const response = await fetch(path, {
    ...init,
    headers: { ...auth, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });

  const payload = (await response.json().catch(() => null)) as (T & ErrorPayload) | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? 'No se ha podido hablar con el calendario.');
  }
  if (!payload) throw new Error('El servidor no ha devuelto nada.');

  return payload;
}

/**
 * Qué perfiles tienen calendario y si la integración está disponible. No
 * lanza: sin nube, sin sesión o sin configurar, la respuesta es «no hay
 * calendario» y la interfaz se comporta en consecuencia.
 */
export async function status(): Promise<CalendarStatus> {
  try {
    return await request<CalendarStatus>('/api/calendario');
  } catch {
    return { configured: false, links: [] };
  }
}

const action = <T>(body: Record<string, unknown>) =>
  request<T>('/api/calendario', { method: 'POST', body: JSON.stringify(body) });

/** Devuelve la dirección de la pantalla de permisos de Google. */
export function connectUrl(profileId: ProfileId): Promise<{ url: string }> {
  return action<{ url: string }>({ accion: 'conectar', profileId });
}

export function disconnect(profileId: ProfileId): Promise<{ ok: boolean }> {
  return action<{ ok: boolean }>({ accion: 'desconectar', profileId });
}

export async function calendars(profileId: ProfileId): Promise<CalendarOption[]> {
  const { calendars: list } = await action<{ calendars: CalendarOption[] }>({
    accion: 'calendarios',
    profileId,
  });
  return list;
}

export function chooseCalendar(
  profileId: ProfileId,
  calendarId: string,
  calendarName: string,
): Promise<{ ok: boolean }> {
  return action<{ ok: boolean }>({ accion: 'elegir', profileId, calendarId, calendarName });
}

/** Confirma que el permiso sigue vivo. Falla con el motivo si ya no lo está. */
export function check(profileId: ProfileId): Promise<{ ok: boolean; calendarName: string }> {
  return action<{ ok: boolean; calendarName: string }>({ accion: 'comprobar', profileId });
}

/* ---------------------------------------------------------------------------
 * Los recados
 * ------------------------------------------------------------------------- */

/** La zona del móvil; es la que decide a qué hora suena el aviso. */
function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
  } catch {
    return 'Europe/Madrid';
  }
}

export interface PushedTask {
  calendar: TaskCalendarLink;
  /** Nombre del calendario donde ha caído, para poder decirlo. */
  calendarName: string;
}

/** Crea el evento o pone al día el que ya existía. */
export function pushTask(task: Task): Promise<PushedTask> {
  return request<PushedTask>('/api/calendario/evento', {
    method: 'POST',
    body: JSON.stringify({ accion: 'guardar', task, timeZone: timeZone() }),
  });
}

/** Retira el evento del calendario; la tarea sigue en la app. */
export function dropTask(task: Task): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/calendario/evento', {
    method: 'POST',
    body: JSON.stringify({ accion: 'borrar', task, timeZone: timeZone() }),
  });
}
