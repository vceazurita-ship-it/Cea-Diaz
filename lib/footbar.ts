import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { appOrigin } from '@/lib/googleCalendar';
import type { DateKey, GpsKind, GpsSession, ProfileId } from '@/types';

/* =========================================================================
 *  Footbar, visto desde el servidor.
 *
 *  Footbar tiene una API pública (https://developers.footbar.com) con el
 *  mismo baile que Google: cada peque da permiso una vez, entrando con su
 *  cuenta en la pantalla de Footbar, y a cambio nos queda un permiso
 *  duradero para leer sus sesiones. **Su contraseña no pasa nunca por la
 *  app**: la escribe en la página de Footbar y a nosotros sólo vuelve un
 *  código que se canjea aquí por el permiso.
 *
 *  Todo lo de aquí corre en `app/api/footbar`. El `client_secret` vive en el
 *  entorno del servidor y de él sale la clave con la que se cifra el permiso
 *  antes de guardarlo, igual que con Google Calendar.
 *
 *  Dos cosas de la API que mandan en el diseño:
 *
 *   · El plan gratuito deja **100 peticiones a la semana** para toda la app.
 *     Por eso no se relee nada que ya esté en casa: se pide la lista de
 *     sesiones y sólo el detalle de las que faltan.
 *   · El permiso de refresco **sirve una sola vez**: cada renovación devuelve
 *     uno nuevo que hay que guardar enseguida. El de acceso dura ocho horas y
 *     se guarda también, para no renovar en cada consulta.
 * ========================================================================= */

const CLIENT_ID = process.env.FOOTBAR_CLIENT_ID;
const CLIENT_SECRET = process.env.FOOTBAR_CLIENT_SECRET;

/** Sin las dos claves, el GPS funciona igual: a mano y con la foto. */
export const footbarConfigured = Boolean(CLIENT_ID && CLIENT_SECRET);

const BASE = 'https://api.footbar.com';

/** Error de Footbar ya redactado para enseñarlo. `revoked` = hay que volver a conectar. */
export class FootbarError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly revoked = false,
  ) {
    super(message);
  }
}

/** A dónde vuelve Footbar tras el permiso. Tiene que estar declarado en su portal. */
export function redirectUri(request: Request): string {
  return process.env.FOOTBAR_REDIRECT_URI ?? `${appOrigin(request)}/api/footbar/callback`;
}

/* ---------------------------------------------------------------------------
 * Secretos
 * ------------------------------------------------------------------------- */

/** Clave de cifrado, sacada del `client_secret`: no hace falta otra variable. */
function key(): Buffer {
  return scryptSync(CLIENT_SECRET ?? '', 'habitos-familia:footbar', 32);
}

export function seal(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.');
}

export function unseal(sealed: string): string | null {
  try {
    const [iv, tag, body] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * El ida y vuelta del permiso
 * ------------------------------------------------------------------------- */

/** Minutos que vale el `state` antes de caducar. */
const STATE_TTL_MS = 15 * 60 * 1000;

export interface FootbarState {
  owner: string;
  profileId: ProfileId;
  /** El verificador PKCE: va cifrado dentro del `state`, no en claro. */
  verifier: string;
  at: number;
}

/**
 * El `state` viaja por la barra de direcciones, así que va **cifrado**, no
 * sólo firmado: además de decir de qué cuenta y de qué peque es el permiso,
 * lleva el verificador PKCE, que no debe verse por el camino.
 */
export function packState(state: FootbarState): string {
  return seal(JSON.stringify(state));
}

export function readState(raw: string): FootbarState | null {
  const text = unseal(raw);
  if (!text) return null;
  try {
    const state = JSON.parse(text) as FootbarState;
    return Date.now() - state.at > STATE_TTL_MS ? null : state;
  } catch {
    return null;
  }
}

/** Un verificador PKCE y su reto. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function consentUrl(state: string, challenge: string, redirect: string): string {
  const url = new URL(`${BASE}/oauth/authorize/`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID ?? '');
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', 'read');
  url.searchParams.set('state', state);
  return url.toString();
}

/** El permiso de un peque: el de acceso, cuándo caduca y el de refresco. */
export interface FootbarTokens {
  access: string;
  refresh: string;
  /** Milisegundos desde 1970. */
  expiresAt: number;
  userId: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: number };
  error?: string;
  error_description?: string;
}

async function tokenCall(params: Record<string, string>, previousUser?: number): Promise<FootbarTokens> {
  const response = await fetch(`${BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({ client_id: CLIENT_ID ?? '', client_secret: CLIENT_SECRET ?? '', ...params }),
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as TokenResponse;

  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    const revoked = payload.error === 'invalid_grant';
    throw new FootbarError(
      revoked
        ? 'Footbar ya no acepta el permiso: hay que volver a conectar la cuenta.'
        : `Footbar no ha dado el permiso (${payload.error ?? response.status}).`,
      response.status,
      revoked,
    );
  }

  return {
    access: payload.access_token,
    refresh: payload.refresh_token,
    // Un minuto de margen: mejor renovar antes que llegar tarde.
    expiresAt: Date.now() + Math.max(60, (payload.expires_in ?? 28800) - 60) * 1000,
    userId: payload.user?.id ?? previousUser ?? 0,
  };
}

export function exchangeCode(code: string, verifier: string, redirect: string): Promise<FootbarTokens> {
  return tokenCall({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirect,
    scope: 'read',
  });
}

export function refreshTokens(tokens: FootbarTokens): Promise<FootbarTokens> {
  return tokenCall({ grant_type: 'refresh_token', refresh_token: tokens.refresh }, tokens.userId);
}

/* ---------------------------------------------------------------------------
 * Las sesiones
 * ------------------------------------------------------------------------- */

/** Una sesión tal y como la cuenta Footbar: todo en unidades del sistema internacional. */
export interface FootbarSession {
  id: number;
  start_date?: string | null;
  stop_date?: string | null;
  playing_time?: number | null;
  title?: string | null;
  match_type?: '11' | 'ss' | 'tr' | 'ru' | null;
  position?: string | null;
  distance?: number | null;
  pass_count?: number | null;
  shot_count?: number | null;
  shot_speed?: number | null;
  time_with_ball?: number | null;
  sprint_count?: number | null;
  sprint_speed?: number | null;
  hsr_plus?: number | null;
}

async function api<T>(path: string, access: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: 'no-store',
  });
  if (response.status === 401) throw new FootbarError('Footbar no reconoce el permiso.', 401, true);
  if (response.status === 429) {
    throw new FootbarError('Footbar dice que se le han hecho demasiadas consultas esta semana.', 429);
  }
  if (!response.ok) throw new FootbarError(`Footbar ha respondido ${response.status}.`, response.status);
  return (await response.json()) as T;
}

interface Page {
  count?: number;
  next?: string | null;
  results?: FootbarSession[];
}

/**
 * Las sesiones más recientes, de más nueva a más vieja. La lista viene por
 * páginas y la API no dice en qué orden: si la primera trae las más viejas,
 * se salta a la última, que es donde están las de esta semana. Como mucho
 * dos peticiones, que el plan gratuito va contado.
 */
export async function recentSessions(access: string): Promise<FootbarSession[]> {
  const first = await api<Page>('/v1/session/list/', access);
  let results = first.results ?? [];

  const time = (session: FootbarSession) => Date.parse(session.start_date ?? '') || 0;
  const ascending = results.length > 1 && time(results[0]) < time(results[results.length - 1]);

  if (ascending && first.next && first.count && results.length > 0) {
    const last = Math.ceil(first.count / results.length);
    if (last > 1) {
      const page = await api<Page>(`/v1/session/list/?page=${last}`, access);
      results = [...results, ...(page.results ?? [])];
    }
  }

  return [...results].sort((a, b) => time(b) - time(a));
}

/**
 * El detalle de una sesión. La documentación lo pinta suelto, pero llega
 * envuelto en una página de un solo elemento —`{count, results: [sesión]}`—:
 * se desenvuelve aquí, y si algún día llega suelto también vale.
 */
export async function sessionDetail(access: string, id: number): Promise<FootbarSession> {
  const data = await api<FootbarSession | Page>(`/v1/session/detail/?id=${id}`, access);
  const inner = 'results' in data && Array.isArray(data.results) ? data.results[0] : (data as FootbarSession);
  if (!inner) throw new FootbarError(`Footbar no encuentra la sesión ${id}.`, 404);
  return inner;
}

/* ---------------------------------------------------------------------------
 * De Footbar a la libreta de casa
 * ------------------------------------------------------------------------- */

/** El día de la sesión en Madrid, que es donde se juega: una de las 23:30 UTC es del día siguiente. */
function madridDay(iso: string): DateKey {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso)) as DateKey;
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Un número de verdad, o nada: un cero inventado se colaría en las medias. */
const num = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * La sesión en el formato de casa. Sólo se rellena lo que Footbar da; las
 * aceleraciones, las deceleraciones y los toques no vienen en su API, y si
 * esa sesión ya estaba metida a mano se conservan los suyos.
 */
export function toGps(detail: FootbarSession, profileId: ProfileId, now: string): GpsSession | null {
  if (!detail.start_date) return null;

  const kind: GpsKind = detail.match_type === '11' || detail.match_type === 'ss' ? 'partido' : 'entreno';
  const session: GpsSession = {
    id: `footbar-${detail.id}`,
    footbarId: detail.id,
    profileId,
    date: madridDay(detail.start_date),
    kind,
    updatedAt: now,
  };

  // Los minutos son los de juego efectivo, no el rato con el rastreador
  // encendido: un partido de sábado lo tiene puesto casi cinco horas y juega
  // una. Sólo si falta el efectivo se tira de la duración.
  const start = Date.parse(detail.start_date);
  const stop = Date.parse(detail.stop_date ?? '');
  if (num(detail.playing_time)) {
    session.minutes = Math.round(detail.playing_time / 60);
  } else if (Number.isFinite(start) && Number.isFinite(stop) && stop > start) {
    session.minutes = Math.round((stop - start) / 60000);
  }

  if (num(detail.distance)) session.distance = round(detail.distance / 1000, 2);
  if (num(detail.hsr_plus)) session.intense = Math.round(detail.hsr_plus);
  if (num(detail.sprint_speed)) session.topSpeed = round(detail.sprint_speed * 3.6, 1);
  if (num(detail.shot_count)) session.shots = detail.shot_count;
  if (num(detail.shot_speed) && detail.shot_speed > 0) session.shotPower = round(detail.shot_speed * 3.6, 1);
  if (num(detail.pass_count)) session.passes = detail.pass_count;
  if (num(detail.time_with_ball)) session.ballTime = Math.round(detail.time_with_ball);
  if (detail.position === 'gk') session.goalkeeper = true;

  return session;
}

/** Las cifras que trae Footbar; el resto de la sesión es de casa y no se toca. */
const FROM_FOOTBAR = [
  'date',
  'kind',
  'minutes',
  'distance',
  'intense',
  'topSpeed',
  'shots',
  'shotPower',
  'passes',
  'ballTime',
  'goalkeeper',
] as const;

/**
 * Mete una sesión de Footbar en la libreta de un peque, sin duplicar:
 *
 *  1. si ya estaba importada, se actualizan sus cifras;
 *  2. si se borró a mano, se respeta el borrado y no vuelve;
 *  3. si ese mismo día hay una del mismo tipo metida a mano —pegando la
 *     línea o leyendo la foto—, se adopta: pasa a llamarse como la de
 *     Footbar, con sus cifras y las que sólo tenía ella (aceleraciones,
 *     nota…), y la vieja queda anotada como borrada. Así los móviles la
 *     sustituyen en vez de tener las dos, y si luego se borra a mano no
 *     vuelve, porque el borrado ya va a nombre de la de Footbar;
 *  4. si no, entra nueva.
 *
 * Devuelve la libreta, sus borrados y si ha cambiado algo, para no escribir
 * en balde.
 */
export function mergeInto(
  sessions: GpsSession[],
  removed: Record<string, string>,
  incoming: GpsSession,
): { sessions: GpsSession[]; removed: Record<string, string>; changed: boolean } {
  const same = (a: GpsSession) => a.footbarId === incoming.footbarId;
  const overlay = (base: GpsSession): GpsSession => {
    const next: GpsSession = { ...base, footbarId: incoming.footbarId };
    for (const field of FROM_FOOTBAR) {
      if (incoming[field] !== undefined) (next as unknown as Record<string, unknown>)[field] = incoming[field];
    }
    return next;
  };
  const differs = (a: GpsSession, b: GpsSession) =>
    a.footbarId !== b.footbarId || FROM_FOOTBAR.some((field) => a[field] !== b[field]);

  const known = sessions.findIndex(same);
  if (known >= 0) {
    const merged = overlay(sessions[known]);
    if (!differs(sessions[known], merged)) return { sessions, removed, changed: false };
    const next = [...sessions];
    next[known] = { ...merged, updatedAt: incoming.updatedAt };
    return { sessions: next, removed, changed: true };
  }

  if (removed[incoming.id]) return { sessions, removed, changed: false };

  const manual = sessions.findIndex(
    (item) => item.footbarId === undefined && item.date === incoming.date && item.kind === incoming.kind,
  );
  if (manual >= 0) {
    const next = [...sessions];
    next[manual] = { ...overlay(sessions[manual]), id: incoming.id, updatedAt: incoming.updatedAt };
    return {
      sessions: next,
      removed: { ...removed, [sessions[manual].id]: incoming.updatedAt },
      changed: true,
    };
  }

  return { sessions: [...sessions, incoming], removed, changed: true };
}
