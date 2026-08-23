/* =========================================================================
 *  Sintonía de perfil.
 *
 *  Al entrar en un perfil suena su música un momento. Tres reglas para que
 *  sea una alegría y no un incordio:
 *    · sólo con gesto: se dispara al tocar el perfil, nunca al cargar la
 *      página (los navegadores lo bloquearían de todos modos);
 *    · corta y con desvanecido, no el tema entero;
 *    · silenciable, y con memoria de la decisión.
 *
 *  Los archivos los pone cada casa en `public/audio/`. Si no están, la
 *  reproducción falla en silencio y no pasa nada.
 * ========================================================================= */

import { loadSettings, updateSettings } from '@/lib/settings';

/** Lo que dura la sintonía antes de desvanecerse. */
const PLAY_MS = 20_000;
const FADE_MS = 1_200;
/** Volumen máximo: sonar, no atronar. */
const PEAK = 0.55;
/** No se repite la misma sintonía si se entra y se sale a los dos minutos. */
const COOLDOWN_MS = 120_000;

let current: HTMLAudioElement | null = null;
let timers: number[] = [];
const lastPlayed = new Map<string, number>();

export function soundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  // Por defecto encendido: quien no lo quiera, lo apaga en Ajustes. La
  // decisión se guarda con el resto de ajustes de la casa y viaja con ellos.
  return loadSettings().sound;
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  updateSettings({ sound: enabled });
  if (!enabled) stopAnthem();
}

function clearTimers(): void {
  for (const timer of timers) window.clearTimeout(timer);
  timers = [];
}

/** Baja el volumen poco a poco y para; devuelve al terminar. */
function fadeOut(audio: HTMLAudioElement, onDone?: () => void): void {
  const steps = 12;
  const step = audio.volume / steps;

  for (let i = 1; i <= steps; i += 1) {
    timers.push(
      window.setTimeout(() => {
        audio.volume = Math.max(0, audio.volume - step);
        if (i === steps) {
          audio.pause();
          onDone?.();
        }
      }, (FADE_MS / steps) * i),
    );
  }
}

export function stopAnthem(): void {
  clearTimers();
  if (!current) return;

  const audio = current;
  current = null;
  audio.pause();
  audio.currentTime = 0;
}

/**
 * Arranca la sintonía de un perfil. Hay que llamarla **dentro** del gesto
 * que abre el perfil: si no, el navegador bloquea el sonido.
 *
 * @returns `true` si de verdad ha empezado a sonar.
 */
export function playAnthem(key: string, src: string, onEnd?: () => void): boolean {
  if (typeof window === 'undefined' || !soundEnabled()) return false;

  const previous = lastPlayed.get(key) ?? 0;
  if (Date.now() - previous < COOLDOWN_MS) return false;

  stopAnthem();
  lastPlayed.set(key, Date.now());

  const audio = new Audio(src);
  audio.volume = 0;
  current = audio;

  const finish = () => {
    if (current === audio) current = null;
    onEnd?.();
  };

  // Sin archivo (o formato que el navegador no traga) no se avisa de nada:
  // la sintonía es un adorno, no una función que pueda fallar en alto.
  audio.addEventListener('error', finish);
  audio.addEventListener('ended', finish);

  void audio
    .play()
    .then(() => {
      // Entrada suave.
      const steps = 10;
      for (let i = 1; i <= steps; i += 1) {
        timers.push(
          window.setTimeout(() => {
            if (current === audio) audio.volume = Math.min(PEAK, (PEAK / steps) * i);
          }, (FADE_MS / steps) * i),
        );
      }

      // Y salida a los veinte segundos.
      timers.push(
        window.setTimeout(() => {
          if (current === audio) fadeOut(audio, finish);
        }, PLAY_MS),
      );
    })
    .catch(finish);

  return true;
}
