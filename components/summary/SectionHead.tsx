'use client';

import type { ReactNode } from 'react';

import { kickerFont } from '@/lib/profiles';
import type { ProfileSkin } from '@/types';

/**
 * La cabecera de cada sección de los análisis, la misma en todas: el rótulo
 * en mayúsculas pequeñas, un dato al lado que la resume («1/5», «esta
 * semana») y, si la hay, la acción a la derecha.
 *
 * Antes cada tarjeta se rotulaba a su manera —unas con el título grande,
 * otras con una línea suelta debajo diciendo lo mismo— y se leía como un
 * montón de cajas distintas. Es el mismo lenguaje de la portada.
 */
export function SectionHead({
  title,
  meta,
  action,
  skin,
  id,
}: {
  title: string;
  /** Lo que resume la sección en una cifra o dos palabras. */
  meta?: ReactNode;
  action?: ReactNode;
  skin?: ProfileSkin;
  id?: string;
}) {
  return (
    <div className="mb-3 flex min-h-[1.75rem] flex-wrap items-center gap-x-2 gap-y-1">
      <h3
        id={id}
        className={`text-[11px] font-black uppercase tracking-[0.18em] t-2${skin ? kickerFont(skin) : ''}`}
      >
        {title}
      </h3>
      {meta !== undefined && meta !== null && meta !== false && (
        <span className="text-[11px] font-semibold tabular-nums t-3">{meta}</span>
      )}
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}
