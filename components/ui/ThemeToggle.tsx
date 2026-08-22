'use client';

import { useTheme } from '@/hooks/useTheme';

/**
 * Interruptor de día/noche de un toque. El icono enseña **a dónde se va**,
 * no dónde se está: de noche ofrece el sol y de día ofrece la luna, que es
 * como se comportan los interruptores de todas partes.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { mode, toggle } = useTheme();
  const goingTo = mode === 'dark' ? 'día' : 'noche';

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn-ghost shrink-0 ${className}`}
      aria-label={`Cambiar al modo ${goingTo}`}
      title={`Cambiar al modo ${goingTo}`}
    >
      <span className="text-base" aria-hidden>
        {mode === 'dark' ? '☀️' : '🌙'}
      </span>
    </button>
  );
}
