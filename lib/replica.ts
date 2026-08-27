/* =========================================================================
 *  Réplica: dejar el resto de aparatos exactamente igual que uno.
 *
 *  La sincronización de siempre mezcla: cada fila viaja por su cuenta y gana
 *  la escritura más reciente. Eso es lo correcto en el día a día —dos móviles
 *  rellenando días distintos— pero no sirve para lo que a veces hace falta:
 *  «este aparato tiene la casa montada como debe estar; que los demás queden
 *  igual». Mezclar deja allí lo que aquí ya no existe, y «mandar lo de este
 *  móvil» tampoco lo quita: sube lo de aquí, pero no borra lo de nadie.
 *
 *  La réplica sí. Deja la nube como una copia exacta de este aparato y anota
 *  una marca; el resto la ve, adopta la copia entera —registros, tareas,
 *  ajustes, campogramas, agendas, fotos y sintonías— y tira lo que sólo
 *  tuviera él. Es destructivo a propósito y por eso se pregunta antes.
 *
 *  Dos cautelas viven aquí:
 *
 *   1. Un aparato nunca adopta su propia réplica. Por eso la marca lleva de
 *      quién es, y por eso este archivo guarda un identificador estable de
 *      este navegador.
 *
 *   2. Un aparato que ve una marca por primera vez tampoco la adopta: la
 *      anota y sigue. Si no, un móvil recién estrenado —o uno que llevaba
 *      una semana sin entrar en la cuenta— perdería lo que hubiera
 *      registrado mientras tanto por una réplica de hace un mes. «Todos los
 *      siguientes» son los que ya estaban en casa cuando se pulsó el botón;
 *      a los que llegan después les basta con la sincronización normal, que
 *      se lo baja todo sin borrarles nada.
 * ========================================================================= */

/** Identificador de este navegador. Sólo sirve para reconocerse a sí mismo. */
export const DEVICE_KEY = 'habitos-familia:aparato';

/** Última réplica adoptada, por parcela: `${APPLIED_KEY}:${scope}`. */
const APPLIED_KEY = 'habitos-familia:replica';

/**
 * Las dos parcelas que adoptan por separado. Los registros los reconcilia
 * `useHabitStore` y las fotos `useAppearance`, cada uno a su ritmo y con sus
 * propios tropiezos: si la canción de 8 MB no baja, los registros ya
 * adoptados no tienen por qué volver a bajarse en el siguiente repaso.
 */
export type ReplicaScope = 'datos' | 'aspecto';

export interface ReplicaMark {
  /** Cuándo se declaró. Es lo que distingue una réplica nueva de la vieja. */
  stamp: string;
  /** Aparato que la declaró, para que no se adopte a sí mismo. */
  origin: string;
  /** Cómo llamarlo en alto: «un Android», «un Mac». */
  device: string;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Vale para la sesión cuando el navegador no deja guardar (modo privado). */
let fallbackId = '';

/**
 * Identificador estable de este aparato. Se inventa la primera vez y se
 * queda; no dice nada de nadie, sólo permite que quien declara la réplica
 * no se la aplique a sí mismo.
 */
export function deviceId(): string {
  if (typeof window === 'undefined') return '';

  try {
    const saved = window.localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;

    const fresh = randomId();
    window.localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    // Sin almacenamiento no hay identidad que dure, pero al menos dentro de
    // esta pestaña el aparato sigue siendo el mismo.
    if (!fallbackId) fallbackId = randomId();
    return fallbackId;
  }
}

/** Nombre corto del aparato, para poder decir de dónde vino la copia. */
export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'un aparato';

  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'un iPhone';
  if (/iPad/i.test(ua)) return 'un iPad';
  if (/Android/i.test(ua)) return 'un Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'un Mac';
  if (/Windows/i.test(ua)) return 'un Windows';
  if (/Linux/i.test(ua)) return 'un Linux';
  return 'un aparato';
}

/** La última réplica que este aparato dio por aplicada en esa parcela. */
export function appliedReplica(scope: ReplicaScope): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(`${APPLIED_KEY}:${scope}`);
  } catch {
    return null;
  }
}

export function rememberReplica(scope: ReplicaScope, stamp: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${APPLIED_KEY}:${scope}`, stamp);
  } catch {
    // Sin almacenamiento se volverá a adoptar en el próximo repaso. Adoptar
    // dos veces la misma copia deja lo mismo que adoptarla una.
  }
}

/**
 * Qué hacer con la marca que hay en la nube:
 *
 *  · `adoptar` — es de otro aparato y es posterior a la última que se aplicó
 *                aquí: hay que quedarse exactamente con lo que hay arriba.
 *  · `anotar`  — este aparato no había visto ninguna: se apunta y no se toca
 *                nada. Es la red de seguridad del comentario de arriba.
 *  · `nada`    — no hay marca, es la propia, o ya se adoptó.
 */
export function replicaAction(
  mark: ReplicaMark | null,
  scope: ReplicaScope,
): 'adoptar' | 'anotar' | 'nada' {
  if (!mark) return 'nada';
  if (mark.origin && mark.origin === deviceId()) return 'nada';

  const applied = appliedReplica(scope);
  if (!applied) return 'anotar';

  return Date.parse(mark.stamp) > Date.parse(applied) ? 'adoptar' : 'nada';
}
