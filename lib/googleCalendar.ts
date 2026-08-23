import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto';
import type { CalendarOption, Task } from '@/types';
import { kindInfo } from '@/lib/tasks';

/* =========================================================================
 *  Google Calendar, visto desde el servidor.
 *
 *  Todo lo que hay aquí corre en las rutas de `app/api/calendario`: el
 *  navegador no ve ni el `client_secret` ni los tokens. La app pide «manda
 *  esta tarea al calendario de Leo» y el servidor se encarga del resto.
 *
 *  Se habla con la API a pelo, con `fetch`. La biblioteca oficial de Google
 *  arrastra medio SDK para hacer tres peticiones que caben en una pantalla,
 *  y este proyecto no tiene ninguna dependencia que no use de verdad.
 * ========================================================================= */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

/** Sin las dos claves, la sección de tareas funciona igual: sólo que sin Google. */
export const googleConfigured = Boolean(CLIENT_ID && CLIENT_SECRET);

/**
 * Lo mínimo para lo que hace la app: crear y borrar sus propios eventos, ver
 * qué calendarios tiene la cuenta y saber a qué correo pertenece. No se pide
 * permiso para leer eventos ajenos porque no se leen.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'openid',
  'email',
].join(' ');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';

/**
 * A dónde vuelve Google tras el consentimiento. Tiene que coincidir letra por
 * letra con lo declarado en la consola de Google, así que se deja fijar por
 * entorno; en Vercel, `VERCEL_URL` da el dominio del despliegue.
 */
/**
 * El dominio tal y como lo ve el navegador. Detrás del proxy de Vercel,
 * `request.url` trae el destino interno; el de fuera —el único que Google
 * acepta y al que hay que devolver a la gente— viaja en las cabeceras
 * reenviadas.
 */
export function appOrigin(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

export function redirectUri(request: Request): string {
  return process.env.GOOGLE_REDIRECT_URI ?? `${appOrigin(request)}/api/calendario/callback`;
}

/* ---------------------------------------------------------------------------
 * Secretos: el `state` del ida y vuelta y el token guardado
 * ------------------------------------------------------------------------- */

/**
 * Clave de firma y de cifrado. Se deriva del `client_secret`, que ya es un
 * secreto del servidor y nunca se guarda en la base: así no hace falta una
 * variable de entorno más, y quien llegue a leer la tabla sin tener el
 * entorno se encuentra los tokens cifrados.
 */
function key(): Buffer {
  return scryptSync(CLIENT_SECRET ?? '', 'habitos-familia:calendario', 32);
}

/** Minutos que vale el `state` antes de caducar. */
const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  owner: string;
  profileId: string;
  /** Momento de emisión, para poder caducarlo. */
  at: number;
}

/**
 * El `state` viaja por la barra de direcciones, así que va firmado: sin la
 * firma, cualquiera podría devolvernos un consentimiento diciendo que es de
 * otra cuenta y colgarle su calendario.
 */
export function signState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const mac = createHmac('sha256', key()).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function readState(raw: string): OAuthState | null {
  const [payload, mac] = raw.split('.');
  if (!payload || !mac) return null;

  const expected = createHmac('sha256', key()).update(payload).digest('base64url');
  // Longitudes distintas descartan antes de comparar; el contenido es público
  // y lo que protege la firma es su autoría, no su secreto.
  if (mac.length !== expected.length || mac !== expected) return null;

  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString()) as OAuthState;
    if (Date.now() - state.at > STATE_TTL_MS) return null;
    return state;
  } catch {
    return null;
  }
}

/** Cifra el `refresh_token` antes de dejarlo en la base. */
export function seal(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(
    '.',
  );
}

export function unseal(sealed: string): string | null {
  try {
    const [iv, tag, body] = sealed.split('.');
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    // Token de otro entorno o clave cambiada: hay que volver a enlazar.
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * Consentimiento y tokens
 * ------------------------------------------------------------------------- */

export function consentUrl(redirect: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID ?? '',
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPES,
    // Hace falta poder escribir en el calendario aunque no haya nadie mirando
    // la app, así que se pide token de refresco. `consent` lo garantiza: sin
    // él, Google sólo lo entrega la primera vez que se autoriza la cuenta.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return `${AUTH_URL}?${params.toString()}`;
}

export interface ExchangedTokens {
  refreshToken: string;
  accessToken: string;
  email: string;
}

/** Falla con un mensaje ya escrito para enseñar: nadie quiere un JSON crudo. */
export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function tokenRequest(body: Record<string, string>): Promise<Record<string, string>> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  const payload = (await response.json()) as Record<string, string>;

  if (!response.ok) {
    // `invalid_grant` es el caso corriente: alguien retiró el permiso desde
    // su cuenta de Google, o el token lleva meses sin usarse.
    if (payload.error === 'invalid_grant') {
      throw new GoogleError('El permiso ya no vale. Hay que volver a conectar la cuenta.', 401);
    }
    throw new GoogleError(payload.error_description ?? 'Google ha rechazado la petición.', 502);
  }

  return payload;
}

export async function exchangeCode(code: string, redirect: string): Promise<ExchangedTokens> {
  const payload = await tokenRequest({
    code,
    client_id: CLIENT_ID ?? '',
    client_secret: CLIENT_SECRET ?? '',
    redirect_uri: redirect,
    grant_type: 'authorization_code',
  });

  if (!payload.refresh_token) {
    throw new GoogleError(
      'Google no ha devuelto permiso duradero. Quita la app en tu cuenta de Google y vuelve a conectarla.',
      502,
    );
  }

  return {
    refreshToken: payload.refresh_token,
    accessToken: payload.access_token,
    // El correo viaja dentro del `id_token`; basta con leer su carga útil,
    // que Google acaba de entregar por un canal ya autenticado.
    email: emailFromIdToken(payload.id_token) ?? '',
  };
}

function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()) as {
      email?: string;
    };
    return claims.email ?? null;
  } catch {
    return null;
  }
}

export async function accessTokenFrom(refreshToken: string): Promise<string> {
  const payload = await tokenRequest({
    refresh_token: refreshToken,
    client_id: CLIENT_ID ?? '',
    client_secret: CLIENT_SECRET ?? '',
    grant_type: 'refresh_token',
  });

  return payload.access_token;
}

/** Retira el permiso en la propia cuenta de Google, no sólo aquí. */
export async function revoke(refreshToken: string): Promise<void> {
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }).toString(),
  }).catch(() => undefined);
}

/* ---------------------------------------------------------------------------
 * Llamadas a la API
 * ------------------------------------------------------------------------- */

async function call<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 204) return null;

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;

  if (!response.ok) {
    // Se conserva el código de Google: quien llama distingue «no tienes
    // permiso» (403) de «ese evento ya no existe» (404/410), y son cosas
    // muy distintas de cara a quien está esperando la cita.
    const detail = payload?.error?.message;
    throw new GoogleError(
      detail ??
        (response.status === 403
          ? 'La cuenta no tiene permiso para escribir en ese calendario.'
          : 'Google no ha podido completar la operación.'),
      response.status,
    );
  }

  return payload;
}

interface CalendarListResponse {
  items?: Array<{
    id: string;
    summary: string;
    summaryOverride?: string;
    primary?: boolean;
    accessRole: string;
    deleted?: boolean;
  }>;
}

/** Los calendarios de la cuenta, ya filtrados a los que sirven para escribir. */
export async function listCalendars(accessToken: string): Promise<CalendarOption[]> {
  const data = await call<CalendarListResponse>(
    accessToken,
    '/users/me/calendarList?minAccessRole=writer&showDeleted=false',
  );

  return (data?.items ?? [])
    .filter((item) => !item.deleted)
    .map((item) => ({
      id: item.id,
      name: item.summaryOverride ?? item.summary,
      primary: Boolean(item.primary),
      writable: item.accessRole === 'owner' || item.accessRole === 'writer',
    }))
    .filter((item) => item.writable)
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

/* ---------------------------------------------------------------------------
 * De tarea a evento
 * ------------------------------------------------------------------------- */

const RRULE: Record<string, string | undefined> = {
  none: undefined,
  daily: 'RRULE:FREQ=DAILY',
  weekly: 'RRULE:FREQ=WEEKLY',
  monthly: 'RRULE:FREQ=MONTHLY',
};

/** Suma minutos a un `HH:MM` y devuelve el `HH:MM` resultante del mismo día. */
function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const total = Math.min(hours * 60 + mins + minutes, 23 * 60 + 59);
  return `${`${Math.floor(total / 60)}`.padStart(2, '0')}:${`${total % 60}`.padStart(2, '0')}`;
}

/** El día siguiente, en `YYYY-MM-DD`; Google cierra los eventos de día entero así. */
function dayAfter(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

interface EventTime {
  /** `null` explícito, no ausente: en un `PATCH` es lo que borra el otro. */
  date: string | null;
  dateTime: string | null;
  timeZone?: string;
}

export interface EventBody {
  summary: string;
  description: string;
  colorId: string;
  start: EventTime;
  end: EventTime;
  /** Vacío, no ausente, por el mismo motivo: así deja de repetirse. */
  recurrence: string[];
  reminders: { useDefault: boolean; overrides: Array<{ method: 'popup'; minutes: number }> };
}

/**
 * La tarea, dicha en el idioma de Google Calendar. La zona horaria la pone
 * quien llama con la del móvil que crea el evento: una cita a las 17:00 es a
 * las 17:00 donde vive la familia, no donde esté el servidor de turno.
 */
export function taskToEvent(task: Task, who: string, timeZone: string): EventBody {
  const kind = kindInfo(task.kind);
  const day = task.due!;

  const description = [
    task.detail,
    task.detail ? '' : undefined,
    `Recado de ${who} · Hábitos en Familia`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  // Los campos que no aplican viajan en `null`, no ausentes. Al actualizar,
  // Google fusiona lo que le llega con lo que ya tenía: sin ese `null`, una
  // cita que pasa a durar todo el día conservaría su hora anterior, y una
  // tarea que deja de repetirse seguiría repitiéndose.
  const timing: Pick<EventBody, 'start' | 'end'> = task.time
    ? {
        start: { date: null, dateTime: `${day}T${task.time}:00`, timeZone },
        end: {
          date: null,
          dateTime: `${day}T${addMinutes(task.time, task.duration ?? 60)}:00`,
          timeZone,
        },
      }
    : { start: { date: day, dateTime: null }, end: { date: dayAfter(day), dateTime: null } };

  const rrule = RRULE[task.repeat];

  return {
    summary: `${kind.icon} ${task.title}`,
    description,
    colorId: kind.colorId,
    ...timing,
    recurrence: rrule ? [rrule] : [],
    reminders: {
      useDefault: false,
      overrides:
        task.remindBefore === undefined
          ? []
          : [{ method: 'popup', minutes: task.remindBefore }],
    },
  };
}

export interface SavedEvent {
  id: string;
  htmlLink?: string;
}

/**
 * Crea el evento o actualiza el que ya existía. Si el que existía ha sido
 * borrado a mano desde Google, se crea uno nuevo en vez de fallar: para
 * quien usa la app, «mandar al calendario» debe acabar siempre con la cita
 * puesta.
 */
export async function saveEvent(
  accessToken: string,
  calendarId: string,
  eventId: string | undefined,
  body: EventBody,
): Promise<SavedEvent> {
  const path = `/calendars/${encodeURIComponent(calendarId)}/events`;

  if (eventId) {
    try {
      const updated = await call<SavedEvent>(accessToken, `${path}/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (updated) return updated;
    } catch (error) {
      // Sólo se sigue adelante si el evento ya no existe; lo demás se sube.
      const gone =
        error instanceof GoogleError && (error.status === 404 || error.status === 410);
      if (!gone) throw error;
    }
  }

  const created = await call<SavedEvent>(accessToken, path, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!created) throw new GoogleError('Google no ha devuelto el evento creado.', 502);
  return created;
}

/** Quita el evento. Que ya no esté no es un error: el objetivo era ése. */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await call(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' },
    );
  } catch (error) {
    const gone = error instanceof GoogleError && (error.status === 404 || error.status === 410);
    if (!gone) throw error;
  }
}
