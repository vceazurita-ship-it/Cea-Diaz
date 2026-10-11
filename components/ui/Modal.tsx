'use client';

import { useCallback, useEffect, useRef } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Ancho máximo del panel en pantalla grande. */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Si un toque fuera de la hoja la cierra. Para una partida a medias no:
   * un dedo que se va al fondo no debe cortar la pregunta. La ✕ y Escape
   * siguen cerrando siempre.
   */
  dismissible?: boolean;
}

const WIDTH: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible: se cierra con Escape, atrapa el tabulador dentro
 * del panel, bloquea el desplazamiento del fondo y devuelve el foco a donde
 * estaba al cerrarse. En el móvil sube desde abajo como una hoja.
 */
export function Modal({ title, onClose, children, size = 'md', dismissible = true }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  // Lo que mide la cabecera se publica como variable: lo que dentro quiera
  // pegarse debajo de ella (la tira de apartados de Ajustes) la usa como
  // `top`, y así no hay que adivinar su alto en cada pantalla.
  useEffect(() => {
    const target = head.current;
    const box = panel.current;
    if (!target || !box) return;
    const measure = () => box.style.setProperty('--modal-head', `${target.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // Foco inicial dentro del panel + devolución al cerrar.
  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    // Sin nada enfocable dentro, el foco va al propio panel: así Escape y el
    // atrapado del tabulador siguen funcionando.
    (first ?? panel.current)?.focus();
    return () => restoreTo.current?.focus?.();
  }, []);

  // El fondo no debe desplazarse mientras el diálogo está abierto.
  //
  // `overflow: hidden` a secas no basta en Safari de iPhone: la página sigue
  // arrastrándose por detrás de la hoja y se vuelve al principio al cerrar.
  // Se fija el <body> a la posición exacta en que estaba y se restituye el
  // desplazamiento al salir, que es lo único que funciona en los dos sitios.
  useEffect(() => {
    const { body } = document;
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      Object.assign(body.style, previous);
      window.scrollTo(0, scrollY);
    };
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
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
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm
                 sm:items-center sm:p-4"
      onClick={dismissible ? onClose : undefined}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`sheet-max w-full animate-floatUp overflow-y-auto
                    rounded-t-3xl border hairline surf-raised px-5 pb-5 sm:rounded-3xl
                    ${WIDTH[size]}`}
        style={{
          boxShadow: 'var(--shadow-pop)',
          paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
        }}
      >
        {/* La cabecera va pegada arriba: en una hoja larga la ✕ se iba con el
            desplazamiento y cerrar era buscar. El asidero del móvil —el
            tirador que delata que la hoja se cierra— va dentro de ella. */}
        <div ref={head} className="sticky top-0 z-10 -mx-5 mb-4 px-5 pt-5 surf-raised">
          <span
            aria-hidden
            className="mx-auto mb-3 block h-1 w-10 rounded-full surf-3 sm:hidden"
          />
          <div className="flex items-center justify-between gap-3 border-b pb-3 hairline">
            <h2 className="min-w-0 truncate text-lg font-bold t-1">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost h-11 w-11 shrink-0 p-0 text-base"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
