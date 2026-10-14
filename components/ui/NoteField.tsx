'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

/* =========================================================================
 *  Campo de texto de la app: una etiqueta y un área para escribir.
 *
 *  Es el mismo componente en los tres sitios donde se apunta algo —la nota
 *  del día, la de cada categoría y la de los retos—, así que se comporta
 *  igual en todos y se cambia en un solo sitio.
 *
 *  Lo escrito se queda aquí un instante antes de llegar al registro. Guardar
 *  cada tecla parecía lo más seguro y era justo lo contrario: cada pulsación
 *  rehacía el resumen de la semana, los retos, las marcas del gimnasio y el
 *  bonus del día —todos ellos repasan meses de historial— y encima mandaba
 *  una escritura a la nube. En un móvil, escribir una frase larga se notaba.
 *
 *  Nada se pierde por esperar: lo pendiente se vuelca al salir del campo y
 *  también si el campo desaparece antes —cambiar de día, de pestaña o de
 *  perfil—, así que el texto llega al registro igual.
 * ========================================================================= */

/** Espera desde la última tecla hasta que lo escrito baja al registro. */
const COMMIT_MS = 500;

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
  const [draft, setDraft] = useState(value);

  const timer = useRef(0);
  /** Lo tecleado que todavía no ha bajado, o `null` si no hay nada esperando. */
  const waiting = useRef<string | null>(null);
  /** Lo último que este campo entregó: sirve para reconocer su propio eco. */
  const sent = useRef(value);

  // `onChange` suele venir en línea, así que cambia en cada pintado. Guardarlo
  // en una referencia evita rearmar el temporizador por ello.
  const commit = useRef(onChange);
  commit.current = onChange;

  /**
   * En qué punto está lo escrito, para decirlo bajo el campo: «Guardando…»
   * mientras espera y «✓ Guardado» cuando ya ha bajado. Antes la tarjeta del
   * día decía «Guardado» con la frase todavía en el aire.
   */
  const [state, setState] = useState<'idle' | 'pending' | 'saved'>('idle');

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const text = waiting.current;
    if (text === null) return;

    waiting.current = null;
    sent.current = text;
    commit.current(text);
    setState('saved');
  }, []);

  // El «✓ Guardado» se dice y se retira: un aviso fijo deja de leerse.
  useEffect(() => {
    if (state !== 'saved') return;
    const fade = window.setTimeout(() => setState('idle'), 2500);
    return () => window.clearTimeout(fade);
  }, [state]);

  // Cerrar la pestaña o mandar la app al fondo en el móvil no avisa al campo
  // de que pierde el foco: se vuelca lo pendiente antes de que el sistema la
  // congele, que puede ser para siempre.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [flush]);

  // Un valor que llega de fuera —otro día, otro perfil, lo que baje de la
  // nube— sustituye a lo que hubiera. El eco de lo que acaba de entregar este
  // mismo campo se ignora: adoptarlo pisaría las teclas de mientras.
  useEffect(() => {
    if (value === sent.current) return;
    // Con teclas por bajar, lo de fuera espera: adoptarlo borraría lo que se
    // acaba de escribir. Al volcarse, lo escrito manda.
    if (waiting.current !== null) return;
    sent.current = value;
    waiting.current = null;
    window.clearTimeout(timer.current);
    setDraft(value);
  }, [value]);

  // Si el campo desaparece con algo a medio escribir, se entrega antes de irse.
  useEffect(() => () => flush(), [flush]);

  const write = (text: string) => {
    setDraft(text);
    waiting.current = text;
    setState('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, COMMIT_MS);
  };

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
        value={draft}
        disabled={disabled}
        onChange={(event) => write(event.target.value)}
        // Salir del campo lo da por escrito: no hay que esperar a nada.
        onBlur={flush}
        placeholder={placeholder}
        className="field w-full resize-y p-3"
      />

      <p className="mt-1 min-h-[1rem] text-xs t-3" aria-live="polite">
        {state === 'pending' ? 'Guardando…' : state === 'saved' ? '✓ Guardado' : ''}
      </p>

      {hint && <p className="mt-1.5 text-[11px] leading-relaxed t-3">{hint}</p>}
    </div>
  );
}
