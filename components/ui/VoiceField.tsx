'use client';

import { useEffect, useId, useRef } from 'react';
import { useDictation } from '@/hooks/useDictation';

/* =========================================================================
 *  Campo de texto que también se puede contar en voz alta.
 *
 *  Es el mismo par de siempre —una etiqueta y un área de texto— con un botón
 *  de micrófono al lado. Lo dictado se añade al final de lo que ya hubiera,
 *  así que se puede escribir un poco, dictar el resto y corregir a mano.
 *  Donde el navegador no sepa dictar, el botón no aparece y el campo sigue
 *  funcionando escribiendo.
 * ========================================================================= */

interface VoiceFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  /** Qué pone en el botón mientras no se está dictando. */
  dictateLabel?: string;
  /** Aclaración bajo el campo. */
  hint?: string;
  /** Versión reducida, para cuando el campo vive dentro de otra tarjeta. */
  compact?: boolean;
  disabled?: boolean;
  /**
   * Se avisa mientras el micrófono está abierto, para que quien use el campo
   * pueda esperar a que termine antes de mandar el texto a ninguna parte.
   */
  onListeningChange?: (listening: boolean) => void;
}

export function VoiceField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  dictateLabel = '🎙️ Contarlo en voz alta',
  hint,
  compact = false,
  disabled = false,
  onListeningChange,
}: VoiceFieldProps) {
  const id = useId();

  // El dictado llega por trozos y varios pueden caer en el mismo render: la
  // referencia guarda el texto ya compuesto para que ninguno pise al otro.
  const latest = useRef(value);
  latest.current = value;

  const dictation = useDictation((chunk) => {
    const next = latest.current ? `${latest.current} ${chunk}` : chunk;
    latest.current = next;
    onChange(next);
  });

  // El aviso se guarda en una referencia para no reiniciar el efecto cada vez
  // que quien nos usa vuelva a crear la función.
  const listener = useRef(onListeningChange);
  listener.current = onListeningChange;

  useEffect(() => {
    listener.current?.(dictation.listening);
  }, [dictation.listening]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={id}
          className={
            compact
              ? 'text-xs font-bold uppercase tracking-wide t-3'
              : 'text-sm font-bold uppercase tracking-wide t-2'
          }
        >
          {label}
        </label>

        {dictation.supported && (
          <button
            type="button"
            disabled={disabled}
            onClick={dictation.listening ? dictation.stop : dictation.start}
            aria-pressed={dictation.listening}
            className={`btn px-3 py-1.5 text-xs font-semibold border
              ${
                dictation.listening
                  ? 'bg-accent t-on-accent border-accent animate-pulse'
                  : 'hairline surf-1 t-2 hover-soft'
              }`}
          >
            {dictation.listening ? '⏹️ Parar de dictar' : dictateLabel}
          </button>
        )}
      </div>

      <textarea
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="field w-full resize-y p-3"
      />

      {dictation.listening && (
        <p className="mt-1.5 text-xs t-3" aria-live="polite">
          🎧 Escuchando… {dictation.interim && <span className="italic">{dictation.interim}</span>}
        </p>
      )}

      {dictation.error && <p className="mt-1.5 text-xs t-danger">⚠️ {dictation.error}</p>}

      {/* El aviso sólo en los campos grandes: repetido en cada categoría
          sería ruido, y el campo se escribe igual. */}
      {!dictation.supported && !compact && (
        <p className="mt-1.5 text-[11px] t-3">
          Este navegador no permite dictar; escríbelo y funciona igual.
        </p>
      )}

      {hint && <p className="mt-1.5 text-[11px] leading-relaxed t-3">{hint}</p>}
    </div>
  );
}
