/* =========================================================================
 *  Los colores de estado, en un solo sitio.
 *
 *  Antes cada pantalla elegía su verde, su ámbar y su rojo —esmeralda aquí,
 *  verde allá— y de día varios no llegaban a leerse. Ahora todas tiran de
 *  los mismos cuatro tokens (`--ok`, `--warn`, `--info`, `--danger`), que
 *  cambian solos entre día y noche.
 * ========================================================================= */

export type Tone = 'ok' | 'warn' | 'info' | 'danger' | 'neutral';

/** Caja con borde y velo del estado, para una tarjeta o un hallazgo. */
export const TONE_BOX: Record<Tone, string> = {
  ok: 'border-ok bg-ok-soft',
  warn: 'border-warn bg-warn-soft',
  info: 'border-info bg-info-soft',
  danger: 'border-danger bg-danger-soft',
  neutral: 'hairline surf-1',
};

/** Texto en el color del estado. */
export const TONE_TEXT: Record<Tone, string> = {
  ok: 't-ok',
  warn: 't-warn',
  info: 't-info',
  danger: 't-danger',
  neutral: 't-3',
};

/** Aviso en línea completo (`.banner` + su estado). */
export const TONE_BANNER: Record<Tone, string> = {
  ok: 'banner banner-ok',
  warn: 'banner banner-warn',
  info: 'banner banner-info',
  danger: 'banner banner-danger',
  neutral: 'banner hairline surf-1',
};

/** El color en sí, para un relleno o un trazo dibujado a mano. */
export const TONE_VAR: Record<Tone, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  info: 'var(--info)',
  danger: 'var(--danger)',
  neutral: 'var(--text-3)',
};

/** La gravedad de un hallazgo de las auditorías (físico y colegio). */
export const SEVERITY_TONE: Record<string, Tone> = {
  bien: 'ok',
  dato: 'neutral',
  ojo: 'warn',
  atencion: 'danger',
};

/** La caja de un hallazgo según su gravedad. */
export function severityBox(severity: string): string {
  return TONE_BOX[SEVERITY_TONE[severity] ?? 'neutral'];
}

/**
 * Cómo se pinta una opción de un juego de preguntas una vez contestada:
 * la buena en verde, la elegida si era mala en rojo, el resto apagado. Sin
 * contestar todavía, la de siempre.
 */
export type AnswerState = 'idle' | 'correct' | 'wrong' | 'dim';

export const ANSWER_CLASS: Record<AnswerState, string> = {
  idle: 'hairline surf-1 hover-soft',
  correct: 'border-ok bg-ok-soft',
  wrong: 'border-danger bg-danger-soft',
  dim: 'hairline surf-1 opacity-50',
};

/**
 * La caja de una respuesta ya resuelta de los juegos de escribir, ordenar o
 * emparejar: `bien` es null mientras no se ha comprobado.
 */
export function feedbackClass(bien: boolean | null, idle = 'hairline surf-1'): string {
  return bien === null ? idle : bien ? ANSWER_CLASS.correct : ANSWER_CLASS.wrong;
}

/** El estado de una opción: `chosen` es la elegida (o null si aún no). */
export function answerState(option: unknown, chosen: unknown, correct: unknown): AnswerState {
  if (chosen === null || chosen === undefined) return 'idle';
  if (option === correct) return 'correct';
  if (option === chosen) return 'wrong';
  return 'dim';
}

export function answerClass(option: unknown, chosen: unknown, correct: unknown): string {
  return ANSWER_CLASS[answerState(option, chosen, correct)];
}
