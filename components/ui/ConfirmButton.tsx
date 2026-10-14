'use client';

import { useEffect, useState, type ReactNode } from 'react';

/* =========================================================================
 *  Un botón que pide confirmación en el sitio, sin diálogo.
 *
 *  Para lo que no se deshace fácil —borrar un día, vaciar la semana,
 *  rehacerla con la de ejemplo—. Al primer toque el botón se convierte en la
 *  pregunta con sus dos respuestas, y si nadie contesta en unos segundos
 *  vuelve a ser lo que era. Un toque de más no destroza nada, y un toque de
 *  menos no molesta: no hay ventana que tapar ni que buscar.
 * ========================================================================= */

interface ConfirmButtonProps {
  /** Lo que hace el botón, tal cual se lee: «🗑️ Borrar el día». */
  children: ReactNode;
  /** La pregunta, breve: «¿Borrar todo lo de hoy?». */
  question: string;
  onConfirm: () => void;
  className?: string;
  /** Clase del botón de «sí»; por defecto, en rojo. */
  confirmClassName?: string;
  confirmLabel?: string;
  disabled?: boolean;
  title?: string;
}

export function ConfirmButton({
  children,
  question,
  onConfirm,
  className = 'btn-ghost px-3 py-1.5 text-xs',
  confirmClassName = 'btn-danger px-3 py-1.5 text-xs',
  confirmLabel = 'Sí, adelante',
  disabled,
  title,
}: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false);

  // Si nadie contesta, la pregunta se retira sola: no se queda un «¿Seguro?»
  // colgado esperando a un toque accidental.
  useEffect(() => {
    if (!asking) return;
    const timer = window.setTimeout(() => setAsking(false), 6000);
    return () => window.clearTimeout(timer);
  }, [asking]);

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={className} disabled={disabled} title={title}>
        {children}
      </button>
    );
  }

  return (
    <span role="group" aria-label={question} className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold t-1">{question}</span>
      <button
        type="button"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        className={confirmClassName}
      >
        {confirmLabel}
      </button>
      {/* El foco cae en el «No»: un Intro de más no debe borrar nada. */}
      <button
        type="button"
        autoFocus
        onClick={() => setAsking(false)}
        className="btn-ghost px-3 py-1.5 text-xs"
      >
        No
      </button>
    </span>
  );
}
