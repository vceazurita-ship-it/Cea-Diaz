'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * Avisos efímeros con acción opcional. Existen sobre todo para que ninguna
 * acción destructiva sea definitiva de un solo toque: en lugar de pedir
 * confirmación antes (que interrumpe), la app actúa y ofrece «Deshacer».
 *
 * Por eso un aviso con acción no se deja pisar por el siguiente «Apuntado.»:
 * si borrar un día y anotar algo justo después hacía desaparecer el
 * «Deshacer», la red de seguridad no era tal. Conviven como mucho dos, el
 * de la acción se queda, y el reloj se para mientras el dedo o el foco
 * están encima.
 */

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  message: string;
  icon?: string;
  action?: ToastAction;
  /** Milisegundos en pantalla. Con acción se alarga para dar tiempo a reaccionar. */
  duration?: number;
  tone?: 'neutral' | 'danger';
}

interface Toast extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {});

/** Lanza un aviso. Seguro de llamar aunque no haya proveedor (no hace nada). */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setToasts((prev) => {
      // Los acuses de recibo sin acción se sustituyen entre sí: son eso, un
      // acuse. Los que llevan «Deshacer» se quedan hasta que caduquen.
      const kept = prev.filter((toast) => toast.action);
      return [...kept.slice(-1), { ...options, id }];
    });
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center
                   gap-2 p-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const { id, message, icon, action, tone = 'neutral' } = toast;
  const duration = toast.duration ?? (action ? 7000 : 3200);
  /** Con el dedo o el foco encima, el aviso espera. */
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held) return;
    const timer = window.setTimeout(() => onDismiss(id), duration);
    return () => window.clearTimeout(timer);
  }, [id, duration, held, onDismiss]);

  return (
    // Sin `role="status"`: el contenedor ya es una región viva y anidar otra
    // hacía que los lectores de pantalla cantaran el aviso dos veces.
    <div
      className="pointer-events-auto flex w-full max-w-md animate-floatUp items-center gap-3
                 rounded-2xl border px-4 py-3 text-sm hairline surf-raised"
      style={{ boxShadow: 'var(--shadow-pop)' }}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      {icon && (
        <span className="shrink-0 text-lg" aria-hidden>
          {icon}
        </span>
      )}

      <p className={`min-w-0 flex-1 font-medium ${tone === 'danger' ? 't-danger' : 't-1'}`}>
        {message}
      </p>

      {action && (
        <button
          type="button"
          onClick={() => {
            action.onClick();
            onDismiss(id);
          }}
          className="btn-ghost shrink-0 px-3 py-1.5 text-xs font-bold"
        >
          {action.label}
        </button>
      )}

      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Cerrar aviso"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs
                   t-3 transition-colors hover:t-1"
      >
        ✕
      </button>
    </div>
  );
}
