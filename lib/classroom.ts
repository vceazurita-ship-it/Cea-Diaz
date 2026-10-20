import { GoogleError, appOrigin } from '@/lib/googleCalendar';
import {
  MENSAJE_COLEGIO,
  type ClassroomAviso,
  type ClassroomCurso,
  type ClassroomMaterial,
  type ClassroomMaterialCurso,
  type ClassroomSnapshot,
  type ClassroomTarea,
  type EstadoEntrega,
} from '@/lib/classroomModel';

/* =========================================================================
 *  Google Classroom, visto desde el servidor. Sólo lectura.
 *
 *  Leo y Hugo tienen cuenta del colegio y en ella, sus clases: lo que hay que
 *  entregar, los avisos de la profesora y los materiales. Esto los baja con
 *  la API oficial y los deja en una foto (`ClassroomSnapshot`) que la app
 *  enseña sin volver a preguntar a Google cada vez que se abre.
 *
 *  Comparte con Google Calendar el cliente de OAuth, la firma del `state` y
 *  el cifrado del token (`lib/googleCalendar.ts`): es la misma app de Google
 *  pidiendo otros permisos, sólo de lectura. Como allí, se habla con la API
 *  a pelo, con `fetch`.
 * ========================================================================= */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

/**
 * Leer las clases, lo que el niño tiene que entregar (y cómo va su entrega),
 * los avisos, los materiales y los temas. Nada de escribir: la app no
 * entrega nada en nombre de nadie.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  'https://www.googleapis.com/auth/classroom.topics.readonly',
  'openid',
  'email',
].join(' ');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const API = 'https://classroom.googleapis.com/v1';

/** Las fechas de Classroom vienen en UTC; la casa vive aquí. */
const ZONA = 'Europe/Madrid';

/** Topes, para que una cuenta con años de clases no se coma la función. */
const MAX_CURSOS = 20;
const MAX_TAREAS_CURSO = 120;
const MAX_MATERIALES_CURSO = 40;
const MAX_AVISOS_CURSO = 30;
/** Avisos más viejos que esto no se bajan. */
const DIAS_AVISOS = 60;
/** Tareas con entrega más vieja que esto no se bajan: ya no hay nada que hacer. */
const DIAS_TAREAS_ATRAS = 30;
/** Tareas sin fecha publicadas hace más de esto, tampoco. */
const DIAS_SIN_FECHA = 60;
/** Clases que se bajan a la vez. */
const EN_PARALELO = 4;

export function classroomRedirectUri(request: Request): string {
  return process.env.GOOGLE_CLASSROOM_REDIRECT_URI ?? `${appOrigin(request)}/api/classroom/callback`;
}

export function classroomConsentUrl(redirect: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID ?? '',
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPES,
    // Hace falta poder bajar las clases sin que el niño esté delante, así
    // que se pide token de refresco; `consent` garantiza que llegue.
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * El centro no deja que esta cuenta use apps externas. Es lo más probable
 * con una cuenta de colegio, y no se arregla desde casa: lo tiene que
 * autorizar quien administra las cuentas del centro.
 */
export class ColegioBloqueaError extends GoogleError {
  constructor() {
    super(MENSAJE_COLEGIO, 403);
  }
}

/** Errores de OAuth que significan «lo ha bloqueado el administrador». */
export function esBloqueoDelColegio(oauthError: string | null | undefined): boolean {
  return oauthError === 'admin_policy_enforced' || oauthError === 'org_internal';
}

/* ---------------------------------------------------------------------------
 * Llamadas a la API
 * ------------------------------------------------------------------------- */

interface ApiError {
  error?: { message?: string; status?: string; details?: Array<{ reason?: string }> };
}

async function get<T>(accessToken: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API}${path}${query ? `?${query}` : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const payload = (await response.json().catch(() => null)) as (T & ApiError) | null;

  if (!response.ok) {
    const detail = payload?.error?.message ?? '';
    // Un 403 con la API apagada para la cuenta o el dominio es el colegio
    // diciendo que no. Se distingue del 403 corriente —una clase concreta
    // que ya no se deja leer— para poder decirlo con todas las letras.
    if (
      response.status === 403 &&
      /ClassroomApiDisabled|not permitted|administrator|admin policy|domain/i.test(
        `${detail} ${payload?.error?.details?.map((d) => d.reason).join(' ') ?? ''}`,
      )
    ) {
      throw new ColegioBloqueaError();
    }
    if (response.status === 401) {
      throw new GoogleError('El permiso ya no vale. Hay que volver a conectar Classroom.', 401);
    }
    throw new GoogleError(detail || 'Classroom no ha podido completar la consulta.', response.status);
  }

  return (payload ?? {}) as T;
}

/**
 * Todas las páginas de una lista, hasta `max` elementos. `seguir` permite
 * cortar antes, cuando lo que llega ya es demasiado viejo para interesar.
 */
async function paginar<T>(
  accessToken: string,
  path: string,
  campo: string,
  params: Record<string, string>,
  max: number,
  seguir: (pagina: T[]) => boolean = () => true,
): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const data = await get<Record<string, unknown> & { nextPageToken?: string }>(accessToken, path, {
      ...params,
      pageSize: String(Math.min(100, max)),
      ...(pageToken ? { pageToken } : {}),
    });
    const pagina = (data[campo] as T[] | undefined) ?? [];
    out.push(...pagina);
    pageToken = data.nextPageToken;
    if (!seguir(pagina)) break;
  } while (pageToken && out.length < max);
  return out.slice(0, max);
}

/* ---------------------------------------------------------------------------
 * Lo que devuelve Google, en crudo
 * ------------------------------------------------------------------------- */

interface GDate {
  year?: number;
  month?: number;
  day?: number;
}
interface GTime {
  hours?: number;
  minutes?: number;
}
interface GMaterial {
  driveFile?: { driveFile?: { title?: string; alternateLink?: string } };
  youtubeVideo?: { title?: string; alternateLink?: string };
  link?: { url?: string; title?: string };
  form?: { formUrl?: string; title?: string };
}
interface GCourse {
  id: string;
  name?: string;
  section?: string;
  alternateLink?: string;
  courseState?: string;
}
interface GTopic {
  topicId: string;
  name?: string;
}
interface GCourseWork {
  id: string;
  title?: string;
  description?: string;
  dueDate?: GDate;
  dueTime?: GTime;
  topicId?: string;
  alternateLink?: string;
  materials?: GMaterial[];
  maxPoints?: number;
  creationTime?: string;
}
interface GSubmission {
  courseWorkId: string;
  state?: string;
  late?: boolean;
  assignedGrade?: number;
}
interface GAnnouncement {
  id: string;
  text?: string;
  creationTime?: string;
  updateTime?: string;
  alternateLink?: string;
  materials?: GMaterial[];
}
interface GMaterialItem {
  id: string;
  title?: string;
  description?: string;
  topicId?: string;
  alternateLink?: string;
  materials?: GMaterial[];
  creationTime?: string;
  updateTime?: string;
}

/* ---------------------------------------------------------------------------
 * De Google a la foto
 * ------------------------------------------------------------------------- */

const recorta = (text: string | undefined, max: number): string | undefined => {
  const limpio = text?.trim();
  if (!limpio) return undefined;
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
};

function materiales(lista: GMaterial[] | undefined): ClassroomMaterial[] {
  const out: ClassroomMaterial[] = [];
  for (const m of lista ?? []) {
    if (m.driveFile?.driveFile) {
      out.push({ tipo: 'drive', titulo: m.driveFile.driveFile.title ?? 'Archivo', enlace: m.driveFile.driveFile.alternateLink });
    } else if (m.youtubeVideo) {
      out.push({ tipo: 'youtube', titulo: m.youtubeVideo.title ?? 'Vídeo', enlace: m.youtubeVideo.alternateLink });
    } else if (m.link) {
      out.push({ tipo: 'enlace', titulo: m.link.title ?? m.link.url ?? 'Enlace', enlace: m.link.url });
    } else if (m.form) {
      out.push({ tipo: 'formulario', titulo: m.form.title ?? 'Formulario', enlace: m.form.formUrl });
    }
  }
  return out.slice(0, 12);
}

const dos = (n: number) => `${n}`.padStart(2, '0');

/**
 * La entrega en hora de casa. Classroom guarda fecha y hora en UTC, de modo
 * que algo que vence el lunes a las 00:30 en España llega como domingo: hay
 * que pasarlo por la zona antes de decir qué día es.
 */
function entregaLocal(date: GDate | undefined, time: GTime | undefined): { entrega?: string; hora?: string } {
  if (!date?.year || !date.month || !date.day) return {};
  if (!time) return { entrega: `${date.year}-${dos(date.month)}-${dos(date.day)}` };

  const instante = new Date(Date.UTC(date.year, date.month - 1, date.day, time.hours ?? 0, time.minutes ?? 0));
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  return { entrega: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

const ESTADOS: Record<string, EstadoEntrega> = {
  NEW: 'pendiente',
  CREATED: 'pendiente',
  TURNED_IN: 'entregada',
  RETURNED: 'devuelta',
  RECLAIMED_BY_STUDENT: 'retirada',
};

/** `YYYY-MM-DD` de hace `dias` días, en UTC: sólo sirve para cortar. */
function haceDias(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
}

interface Clase {
  curso: ClassroomCurso;
  tareas: ClassroomTarea[];
  avisos: ClassroomAviso[];
  materiales: ClassroomMaterialCurso[];
  incompleto: string[];
}

/**
 * Una parte de una clase que falla no tira la clase entera: se apunta y se
 * sigue. Sólo el bloqueo del colegio y el permiso caducado se suben, porque
 * esos afectan a todo.
 */
async function aparte<T>(parte: string, curso: string, incompleto: string[], vacio: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ColegioBloqueaError) throw error;
    if (error instanceof GoogleError && error.status === 401) throw error;
    incompleto.push(`${curso}: no se han podido bajar ${parte}.`);
    return vacio;
  }
}

async function bajarClase(accessToken: string, raw: GCourse): Promise<Clase> {
  const nombre = raw.name?.trim() || 'Clase sin nombre';
  const base = `/courses/${encodeURIComponent(raw.id)}`;
  const incompleto: string[] = [];
  const desdeAvisos = new Date(Date.now() - DIAS_AVISOS * 86_400_000).toISOString();

  const [temas, trabajos, entregas, avisos, mats] = await Promise.all([
    aparte('los temas', nombre, incompleto, [] as GTopic[], () =>
      paginar<GTopic>(accessToken, `${base}/topics`, 'topic', {}, 100),
    ),
    aparte('las tareas', nombre, incompleto, [] as GCourseWork[], () =>
      paginar<GCourseWork>(
        accessToken,
        `${base}/courseWork`,
        'courseWork',
        { courseWorkStates: 'PUBLISHED', orderBy: 'updateTime desc' },
        MAX_TAREAS_CURSO,
      ),
    ),
    aparte('las entregas', nombre, incompleto, [] as GSubmission[], () =>
      // El guion es «todas las tareas de la clase»; `me`, las del niño.
      paginar<GSubmission>(
        accessToken,
        `${base}/courseWork/-/studentSubmissions`,
        'studentSubmissions',
        { userId: 'me' },
        MAX_TAREAS_CURSO * 2,
      ),
    ),
    aparte('los avisos', nombre, incompleto, [] as GAnnouncement[], () =>
      paginar<GAnnouncement>(
        accessToken,
        `${base}/announcements`,
        'announcements',
        { announcementStates: 'PUBLISHED', orderBy: 'updateTime desc' },
        MAX_AVISOS_CURSO,
        // Vienen de lo más nuevo a lo más viejo: en cuanto una página
        // acaba en algo viejo, no hace falta pedir la siguiente.
        (pagina) => pagina.every((a) => (a.updateTime ?? a.creationTime ?? '') >= desdeAvisos),
      ),
    ),
    aparte('los materiales', nombre, incompleto, [] as GMaterialItem[], () =>
      paginar<GMaterialItem>(
        accessToken,
        `${base}/courseWorkMaterials`,
        'courseWorkMaterial',
        { courseWorkMaterialStates: 'PUBLISHED', orderBy: 'updateTime desc' },
        MAX_MATERIALES_CURSO,
      ),
    ),
  ]);

  const porTarea = new Map(entregas.map((s) => [s.courseWorkId, s]));
  const corteEntrega = haceDias(DIAS_TAREAS_ATRAS);
  const corteSinFecha = new Date(Date.now() - DIAS_SIN_FECHA * 86_400_000).toISOString();

  const tareas: ClassroomTarea[] = [];
  for (const w of trabajos) {
    const { entrega, hora } = entregaLocal(w.dueDate, w.dueTime);
    if (entrega && entrega < corteEntrega) continue;
    if (!entrega && (w.creationTime ?? '') < corteSinFecha) continue;
    const s = porTarea.get(w.id);
    tareas.push({
      id: w.id,
      cursoId: raw.id,
      titulo: w.title?.trim() || 'Tarea sin título',
      descripcion: recorta(w.description, 500),
      entrega,
      hora,
      temaId: w.topicId,
      enlace: w.alternateLink,
      materiales: materiales(w.materials),
      estado: ESTADOS[s?.state ?? 'NEW'] ?? 'pendiente',
      // La nota sólo se enseña cuando la profesora la ha devuelto: el
      // borrador de nota no es del niño todavía.
      nota: s?.state === 'RETURNED' && typeof s.assignedGrade === 'number' ? s.assignedGrade : undefined,
      notaMax: typeof w.maxPoints === 'number' ? w.maxPoints : undefined,
      tarde: Boolean(s?.late),
      creada: w.creationTime,
    });
  }

  return {
    curso: {
      id: raw.id,
      nombre,
      seccion: raw.section?.trim() || undefined,
      enlace: raw.alternateLink,
      temas: temas.map((t) => ({ id: t.topicId, nombre: t.name?.trim() || 'Tema' })),
    },
    tareas,
    avisos: avisos
      .filter((a) => (a.updateTime ?? a.creationTime ?? '') >= desdeAvisos)
      .map((a) => ({
        id: a.id,
        cursoId: raw.id,
        texto: recorta(a.text, 1200) ?? '',
        fecha: a.updateTime ?? a.creationTime ?? '',
        enlace: a.alternateLink,
        materiales: materiales(a.materials),
      })),
    materiales: mats.map((m) => ({
      id: m.id,
      cursoId: raw.id,
      titulo: m.title?.trim() || 'Material',
      descripcion: recorta(m.description, 300),
      temaId: m.topicId,
      enlace: m.alternateLink,
      materiales: materiales(m.materials),
      fecha: m.updateTime ?? m.creationTime,
    })),
    incompleto,
  };
}

/**
 * Baja de nuevo todas las clases activas del niño y devuelve la foto. Falla
 * entera sólo si no se puede ni ver la lista de clases; lo que falle dentro
 * de una clase queda anotado en `incompleto`.
 */
export async function bajarClassroom(accessToken: string): Promise<ClassroomSnapshot> {
  let cursos: GCourse[];
  try {
    cursos = await paginar<GCourse>(
      accessToken,
      '/courses',
      'courses',
      { studentId: 'me', courseStates: 'ACTIVE' },
      MAX_CURSOS,
    );
  } catch (error) {
    // Sin poder ver ni la lista de clases, un 403 es el colegio: la cuenta
    // tiene el permiso concedido y aun así Google no deja pasar.
    if (error instanceof GoogleError && error.status === 403) throw new ColegioBloqueaError();
    throw error;
  }

  const clases: Clase[] = [];
  for (let i = 0; i < cursos.length; i += EN_PARALELO) {
    clases.push(...(await Promise.all(cursos.slice(i, i + EN_PARALELO).map((c) => bajarClase(accessToken, c)))));
  }

  const incompleto = clases.flatMap((c) => c.incompleto);
  return {
    version: 1,
    generado: new Date().toISOString(),
    cursos: clases.map((c) => c.curso).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    tareas: clases.flatMap((c) => c.tareas),
    avisos: clases.flatMap((c) => c.avisos),
    materiales: clases.flatMap((c) => c.materiales),
    ...(incompleto.length ? { incompleto } : {}),
  };
}
