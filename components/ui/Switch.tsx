'use client';

/* =========================================================================
 *  Interruptor de una línea.
 *
 *  Un ajuste que se enciende o se apaga se lee mejor como una fila entera
 *  —nombre a la izquierda, estado a la derecha— que como un botón cuyo texto
 *  cambia: en el botón hay que leer para saber si lo que pone es lo que está
 *  puesto o lo que va a pasar al picarlo.
 *
 *  Toda la fila es el objetivo táctil, que en el móvil de la cocina es lo
 *  que se agradece.
 * ========================================================================= */

interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  /** La letra pequeña de debajo. */
  hint?: string;
  icon?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, hint, icon, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors
        ${checked ? 'border-accent bg-accent-faint' : 'hairline surf-2'}
        ${disabled ? 'opacity-50' : 'hover-soft'}`}
    >
      {icon && (
        <span aria-hidden className="shrink-0 text-lg">
          {icon}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold t-1">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-relaxed t-3">{hint}</span>}
      </span>

      {/* El carril: la pista visual de que esto se enciende y se apaga. */}
      <span
        aria-hidden
        className={`relative block h-6 w-11 shrink-0 rounded-full border transition-colors
          ${checked ? 'bg-accent border-accent' : 'hairline surf-3'}`}
      >
        <span
          className={`absolute top-[2px] block h-[18px] w-[18px] rounded-full bg-white
                      shadow transition-all ${checked ? 'left-[22px]' : 'left-[2px]'}`}
        />
      </span>
    </button>
  );
}
