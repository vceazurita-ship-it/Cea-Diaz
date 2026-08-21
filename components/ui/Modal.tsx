'use client';

import { useCallback, useEffect, useRef } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Ancho máximo del panel. */
  size?: 'sm' | 'md';
}

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
    first?.focus();
    return () => restoreTo.current?.focus?.();
  }, []);

  // El fondo no debe desplazarse mientras el diálogo está abierto.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
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
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[90vh] w-full animate-floatUp overflow-y-auto rounded-t-3xl border
                    hairline surf-raised p-5 sm:rounded-3xl
                    ${size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-md'}`}
        style={{
          boxShadow: 'var(--shadow-pop)',
          paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold t-1">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost px-2.5 py-1.5"
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
