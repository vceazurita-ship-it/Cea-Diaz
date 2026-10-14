'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';

/* =========================================================================
 *  Lo que todo diálogo necesita, en un solo sitio: el foco entra al abrir y
 *  vuelve a donde estaba al cerrar, el tabulador no se escapa del panel y el
 *  fondo no se desplaza por detrás.
 *
 *  Lo usan la hoja de `Modal` y el recortador de fotos, que se abre encima
 *  de otra hoja: por eso el bloqueo del fondo lleva la cuenta de cuántos
 *  diálogos hay abiertos y sólo lo suelta el último en cerrarse.
 * ========================================================================= */

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Diálogos abiertos ahora mismo, y cómo estaba el <body> antes del primero. */
let locks = 0;
let saved: { position: string; top: string; width: string; overflow: string; scrollY: number } | null =
  null;

/**
 * El fondo no debe desplazarse mientras el diálogo está abierto.
 *
 * `overflow: hidden` a secas no basta en Safari de iPhone: la página sigue
 * arrastrándose por detrás de la hoja y se vuelve al principio al cerrar.
 * Se fija el <body> a la posición exacta en que estaba y se restituye el
 * desplazamiento al salir, que es lo único que funciona en los dos sitios.
 */
function lockScroll(): () => void {
  const { body } = document;
  if (locks === 0) {
    const scrollY = window.scrollY;
    saved = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
      scrollY,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
  }
  locks += 1;

  return () => {
    locks = Math.max(0, locks - 1);
    if (locks > 0 || !saved) return;
    const { scrollY, ...previous } = saved;
    saved = null;
    Object.assign(body.style, previous);
    window.scrollTo(0, scrollY);
  };
}

/**
 * Prepara el panel `panel` como diálogo y devuelve el manejador de teclado
 * que hay que ponerle (o ponerle a su fondo): atrapa el tabulador y, si se
 * le da `onEscape`, cierra con Escape sin que la tecla llegue más arriba.
 */
export function useDialog(panel: RefObject<HTMLElement>, onEscape?: () => void) {
  const restoreTo = useRef<HTMLElement | null>(null);

  // Foco inicial dentro del panel + devolución al cerrar.
  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    // Sin nada enfocable dentro, el foco va al propio panel: así Escape y el
    // atrapado del tabulador siguen funcionando.
    (first ?? panel.current)?.focus();
    return () => restoreTo.current?.focus?.();
    // El panel es el mismo durante toda la vida del diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => lockScroll(), []);

  return useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape' && onEscape) {
        event.stopPropagation();
        onEscape();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [panel, onEscape],
  );
}
