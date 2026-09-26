import { ROPA_FAMILIA, type Casero } from '@/lib/cromoArt';
import type { Rival } from '@/lib/ligaCromos';
import type { ProfileId } from '@/types';

/* =========================================================================
 *  Los colores del partido: con qué sale cada uno. Aparte del reparto en 3D
 *  para que el marcador los use sin cargar la escena.
 * ========================================================================= */

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lo que se parecen dos colores: 0 iguales, ~440 blanco contra negro. */
export function distancia(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

export function claro(hex: string): boolean {
  const [r, g, b] = rgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 170;
}

/**
 * La equipación de casa: la del color del peque, o la primera que no se
 * confunda con la del rival —la segunda equipación, como en cualquier liga—.
 */
export function kitDeCasa(profileId: ProfileId, rival: Rival): { kit: string; tinta: string } {
  const propia = ROPA_FAMILIA[profileId as Casero] ?? '#16a34a';
  const kit = [propia, '#f8fafc', '#facc15', '#111827'].find((c) => distancia(c, rival.color) > 150) ?? propia;
  return { kit, tinta: claro(kit) ? '#0f172a' : '#ffffff' };
}

/** El color de lo fácil que es algo: verde, ámbar o rojo, como las pastillas. */
export function colorDe(p: number): string {
  return p >= 0.55 ? '#22c55e' : p >= 0.38 ? '#f59e0b' : '#f43f5e';
}
