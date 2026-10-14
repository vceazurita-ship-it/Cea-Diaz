'use client';

import { useEffect, useRef } from 'react';
import { useDialog } from '@/components/ui/useDialog';
import { prefersReducedMotion } from '@/lib/haptics';

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

/**
 * Diálogo modal accesible: se cierra con Escape, atrapa el tabulador dentro
 * del panel, bloquea el desplazamiento del fondo y devuelve el foco a donde
 * estaba al cerrarse. En el móvil sube desde abajo como una hoja.
 */
export function Modal({ title, onClose, children, size = 'md', dismissible = true }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);

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

  // El foco, el tabulador y el fondo quieto: lo de todos los diálogos.
  const onKeyDown = useDialog(panel, onClose);

  /**
   * Un toque fuera de la hoja la cierra, pero sólo si empezó fuera. Arrastrar
   * un deslizador y soltar el dedo ya sobre el fondo contaba como un toque en
   * el fondo, y la hoja se cerraba con todo lo que se estaba poniendo.
   */
  const pressedOutside = useRef(false);

  /* ------------------------------------------- deslizar hacia abajo (móvil)
   *
   * La hoja del móvil tiene asidero, y un asidero invita a tirar de él. Se
   * arrastra desde la cabecera —no desde el contenido, que se desplaza— y se
   * cierra si baja lo bastante o con un tirón rápido; si no, vuelve a su sitio.
   */
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);

  const onHeadTouchStart = (event: React.TouchEvent) => {
    const box = panel.current;
    const touch = event.touches[0];
    if (!dismissible || !box || !touch || event.touches.length > 1) return;
    if (!window.matchMedia('(max-width: 639px)').matches) return;
    // La animación de entrada fija su `transform` al acabar; sin quitarla, el
    // arrastre no movería la hoja.
    box.style.animation = 'none';
    box.style.transition = 'none';
    drag.current = { y: touch.clientY, t: performance.now(), dy: 0 };
  };

  const onHeadTouchMove = (event: React.TouchEvent) => {
    const box = panel.current;
    const touch = event.touches[0];
    if (!drag.current || !box || !touch) return;
    const dy = Math.max(0, touch.clientY - drag.current.y);
    drag.current.dy = dy;
    box.style.transform = `translateY(${dy}px)`;
  };

  const onHeadTouchEnd = () => {
    const box = panel.current;
    const start = drag.current;
    drag.current = null;
    if (!start || !box) return;

    const elapsed = Math.max(1, performance.now() - start.t);
    const fast = start.dy / elapsed > 0.5;
    const calm = prefersReducedMotion();

    if (start.dy > 100 || (fast && start.dy > 10)) {
      if (calm) {
        onClose();
        return;
      }
      box.style.transition = 'transform 180ms ease-in';
      box.style.transform = 'translateY(100%)';
      window.setTimeout(onClose, 170);
      return;
    }

    box.style.transition = calm ? 'none' : 'transform 200ms ease-out';
    box.style.transform = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm
                 sm:items-center sm:p-4"
      onPointerDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const outside = pressedOutside.current && event.target === event.currentTarget;
        pressedOutside.current = false;
        if (dismissible && outside) onClose();
      }}
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
        <div
          ref={head}
          className={`sticky top-0 z-10 -mx-5 mb-4 px-5 pt-5 surf-raised
            ${dismissible ? 'touch-none sm:touch-auto' : ''}`}
          onTouchStart={onHeadTouchStart}
          onTouchMove={onHeadTouchMove}
          onTouchEnd={onHeadTouchEnd}
          onTouchCancel={onHeadTouchEnd}
        >
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
