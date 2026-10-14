import type { PlanStatus } from '@/types';

/* =========================================================================
 *  Cómo se pinta el desenlace de un rato en su pastilla.
 *
 *  Vivía repetido en la agenda y en la tarjeta de hoy, cada uno con su
 *  ámbar elegido a mano, y en el modo oscuro el «flojo» de una no era el de
 *  la otra. Ahora sale de los colores de estado de `globals.css` —bien,
 *  ojo, peligro—, que ya se ajustan solos de día y de noche, y vive aquí
 *  para que cualquier pantalla que lo pinte lo pinte igual.
 * ========================================================================= */

export const STATUS_STYLE: Record<PlanStatus, string> = {
  cumplido: 'bg-ok-soft t-ok',
  flojo: 'bg-warn-soft t-1',
  excedido: 'bg-danger-soft t-danger',
  sinDia: 'surf-2 t-3',
  sinRegistrar: 'surf-3 t-2',
  futuro: 'surf-2 t-3',
  sinMetrica: 'surf-2 t-3',
};
