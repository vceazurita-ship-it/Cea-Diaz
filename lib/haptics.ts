/* =========================================================================
 *  Un toque en la mano.
 *
 *  Una vibración corta al apuntar, una alegre al completar y una doble al
 *  fallar. Sólo en los móviles que la tienen (Android; Safari la ignora) y
 *  nunca con «reducir movimiento» puesto: quien lo pide no quiere sorpresas.
 * ========================================================================= */

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function buzz(pattern: number | number[]): void {
  try {
    if (typeof navigator === 'undefined' || prefersReducedMotion()) return;
    navigator.vibrate?.(pattern);
  } catch {
    // Sin vibración no pasa nada.
  }
}

/** Al tocar un control: casi no se nota, pero se sabe que ha entrado. */
export function tap(): void {
  buzz(8);
}

/** Al completar algo: una tarjeta, un objetivo, un reto. */
export function success(): void {
  buzz([12, 40, 24]);
}

/** Al fallar: un PIN mal, una respuesta mal. */
export function error(): void {
  buzz([30, 40, 30]);
}
