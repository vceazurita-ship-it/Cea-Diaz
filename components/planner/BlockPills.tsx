import { SILENT, statusIcon, statusShort } from '@/lib/planCheck';
import { COMPANIONS, blockLinks } from '@/lib/planner';
import { STATUS_STYLE } from '@/lib/planStatus';
import type { Companion, PlanBlock, PlanBlockCheck, PlanStatus } from '@/types';

/* =========================================================================
 *  Las pastillas de un rato: con quién, cómo ha ido, cuántos hábitos.
 *
 *  Salían copiadas a mano en cada lista de la agenda —las tarjetas de día,
 *  la leyenda de las marcas— y cada copia acababa con su tamaño de letra y
 *  su color. Aquí están una vez, con los colores de estado de la casa, y
 *  quien las necesite las coge de aquí.
 * ========================================================================= */

const PILL = 'rounded-full px-1.5 text-[11px]';

/** Con quién está el peque en ese rato. */
export function CompanionPill({ companion }: { companion: Companion }) {
  return (
    <span className={`${PILL} font-semibold surf-2 t-2`}>
      <span aria-hidden>{COMPANIONS[companion].icon}</span> {COMPANIONS[companion].short}
    </span>
  );
}

/** Cómo ha ido el rato contra la semana de verdad. */
export function StatusPill({
  status,
  pitch,
  title,
  iconOnly = false,
}: {
  status: PlanStatus;
  /** En los paneles de campo se habla de goles y palos. */
  pitch: boolean;
  title?: string;
  /** Sólo la marca, sin la palabra: es lo que va en la leyenda. */
  iconOnly?: boolean;
}) {
  return (
    <span className={`${PILL} font-bold ${STATUS_STYLE[status]}`} title={title}>
      {statusIcon(status, pitch)}
      {!iconOnly && ` ${statusShort(status, pitch)}`}
    </span>
  );
}

/**
 * La fila entera debajo del nombre del rato: con quién, el desenlace, los
 * hábitos que alimenta y, si no alimenta ninguno, que está sin atar.
 */
export function BlockPills({
  block,
  check,
  pitch,
}: {
  block: PlanBlock;
  check?: PlanBlockCheck;
  pitch: boolean;
}) {
  const status = check?.status ?? 'sinMetrica';
  const links = blockLinks(block).length;

  return (
    <>
      {block.companion && <CompanionPill companion={block.companion} />}

      {block.metricId && !SILENT.has(status) && (
        <StatusPill status={status} pitch={pitch} title={check?.text} />
      )}

      {/* Un rato puede alimentar varios hábitos. Al pasar por encima se dice
          qué ha pasado con cada uno, que es donde se ve cuál de los tres
          falló. */}
      {links > 1 && (
        <span
          className={`${PILL} font-semibold surf-2 t-2`}
          title={check?.parts.map((part) => `${part.metric.icon} ${part.text}`).join('\n') ?? undefined}
        >
          🔗 {links} hábitos
        </span>
      )}

      {!block.metricId && <span className={`${PILL} font-semibold surf-2 t-3`}>sin atar</span>}
    </>
  );
}
