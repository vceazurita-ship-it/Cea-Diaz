'use client';

import { useCallback, useEffect, useRef } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Ancho máximo del panel en pantalla grande. */
  size?: 'sm' | 'md' | 'lg';
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
export function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

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
      onClick={onClose}
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
                    rounded-t-3xl border hairline surf-raised p-5 sm:rounded-3xl
                    ${WIDTH[size]}`}
        style={{
          boxShadow: 'var(--shadow-pop)',
          paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
        }}
      >
        {/* Asidero: en el móvil la hoja sube desde abajo y este tirador es lo
            que la delata como algo que se cierra. Decorativo, no se arrastra. */}
        <span
          aria-hidden
          className="mx-auto mb-3 block h-1 w-10 rounded-full surf-3 sm:hidden"
        />

        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold t-1">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost h-11 w-11 shrink-0 p-0 text-base"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
