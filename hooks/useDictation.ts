'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* =========================================================================
 *  Dictado por voz.
 *
 *  El reconocimiento lo hace el navegador (Web Speech API), no el servidor:
 *  contar el día en voz alta es más rápido que escribirlo con el pulgar, y
 *  así no hay que subir ningún audio a ninguna parte. Donde el navegador no
 *  lo soporte, `supported` es `false` y la interfaz cae en escribir a mano.
 * ========================================================================= */

/* La API no está en las definiciones estándar de TypeScript: se declara el
   trozo mínimo que se usa, en lugar de tirar de `any`. */

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
}

interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/**
 * Reconocedor abierto ahora mismo, si lo hay. Vive fuera del hook porque hay
 * varios campos dictables en la misma pantalla y el navegador sólo tiene un
 * micrófono: empezar en uno tiene que cerrar el anterior, no pelearse con él.
 */
let openMicrophone: Recognition | null = null;

/** Mensajes en cristiano para los errores que sí le importan a quien dicta. */
const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'El navegador no tiene permiso para usar el micrófono.',
  'service-not-allowed': 'El navegador no tiene permiso para usar el micrófono.',
  'audio-capture': 'No se encuentra ningún micrófono.',
  network: 'El dictado necesita conexión y ahora mismo no la hay.',
  'no-speech': 'No se ha oído nada. Prueba otra vez.',
};

export interface Dictation {
  /** `false` mientras no se sabe (servidor) o si el navegador no lo trae. */
  supported: boolean;
  listening: boolean;
  /** Lo que se está oyendo pero aún no es definitivo. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * @param onText se llama con cada trozo ya reconocido, para ir componiendo
 *               el texto donde corresponda.
 */
export function useDictation(onText: (text: string) => void): Dictation {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<Recognition | null>(null);
  // El manejador se guarda en una referencia para que el reconocedor, que
  // vive entre renders, no se quede con una versión vieja de la función.
  const sink = useRef(onText);
  sink.current = onText;

  useEffect(() => {
    setSupported(Boolean(recognitionConstructor()));
  }, []);

  // Al desmontar se corta: nadie quiere el micro abierto al cambiar de perfil.
  useEffect(
    () => () => {
      const mine = recognition.current;
      if (!mine) return;
      if (openMicrophone === mine) openMicrophone = null;
      mine.abort();
      recognition.current = null;
    },
    [],
  );

  const stop = useCallback(() => {
    const mine = recognition.current;
    if (mine && openMicrophone === mine) openMicrophone = null;
    mine?.stop();
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(() => {
    const Constructor = recognitionConstructor();
    if (!Constructor) return;

    // Se cierra lo que estuviera escuchando, sea de este campo o de otro.
    openMicrophone?.abort();
    recognition.current?.abort();
    setError(null);

    const instance = new Constructor();
    instance.lang = 'es-ES';
    instance.continuous = true;
    instance.interimResults = true;

    instance.onresult = (event) => {
      let pending = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) sink.current(text.trim());
        else pending += text;
      }

      setInterim(pending.trim());
    };

    instance.onerror = (event) => {
      // `aborted` es lo que ocurre al empezar a dictar en otro campo: es una
      // sustitución querida, no un fallo que haya que contarle a nadie.
      if (event.error !== 'aborted') {
        setError(ERROR_TEXT[event.error] ?? 'El dictado se ha interrumpido.');
      }
      setListening(false);
      setInterim('');
    };

    instance.onend = () => {
      if (openMicrophone === instance) openMicrophone = null;
      setListening(false);
      setInterim('');
    };

    recognition.current = instance;
    openMicrophone = instance;
    instance.start();
    setListening(true);
  }, []);

  return { supported, listening, interim, error, start, stop };
}
