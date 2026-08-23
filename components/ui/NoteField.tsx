'use client';

import { useId } from 'react';

/* =========================================================================
 *  Campo de texto de la app: una etiqueta y un área para escribir.
 *
 *  Es el mismo componente en los tres sitios donde se apunta algo —la nota
 *  del día, la de cada categoría y la de los retos—, así que se comporta
 *  igual en todos y se cambia en un solo sitio.
 * ========================================================================= */

interface NoteFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  /** Aclaración bajo el campo. */
  hint?: string;
  /** Versión reducida, para cuando el campo vive dentro de otra tarjeta. */
  compact?: boolean;
  disabled?: boolean;
}

export function NoteField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  hint,
  compact = false,
  disabled = false,
}: NoteFieldProps) {
  const id = useId();

  return (
    <div>
      <label
        htmlFor={id}
        className={`mb-2 block ${
          compact
            ? 'text-xs font-bold uppercase tracking-wide t-3'
            : 'text-sm font-bold uppercase tracking-wide t-2'
        }`}
      >
        {label}
      </label>

      <textarea
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="field w-full resize-y p-3"
      />

      {hint && <p className="mt-1.5 text-[11px] leading-relaxed t-3">{hint}</p>}
    </div>
  );
}
