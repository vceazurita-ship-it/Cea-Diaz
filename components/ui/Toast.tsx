'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * Avisos efímeros con acción opcional. Existen sobre todo para que ninguna
 * acción destructiva sea definitiva de un solo toque: en lugar de pedir
 * confirmación antes (que interrumpe), la app actúa y ofrece «Deshacer».
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
    // Sólo uno a la vez: el aviso es un acuse de recibo, no un registro.
    setToasts([{ ...options, id }]);
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
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { message, icon, action, tone = 'neutral' } = toast;
  const duration = toast.duration ?? (action ? 7000 : 3200);

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      role="status"
      className="pointer-events-auto flex w-full max-w-md animate-floatUp items-center gap-3
                 rounded-2xl border px-4 py-3 text-sm hairline surf-raised"
      style={{ boxShadow: 'var(--shadow-pop)' }}
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
            onDismiss();
          }}
          className="btn-ghost shrink-0 px-3 py-1.5 text-xs font-bold"
        >
          {action.label}
        </button>
      )}

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className="shrink-0 rounded-lg px-2 py-1.5 text-xs t-3 transition-colors hover:t-1"
      >
        ✕
      </button>
    </div>
  );
}
