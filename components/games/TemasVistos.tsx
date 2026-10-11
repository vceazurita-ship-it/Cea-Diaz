'use client';

import { useState } from 'react';

import { PinLock } from '@/components/PinLock';
import { Modal } from '@/components/ui/Modal';
import { ASIGNATURAS, RETO_META } from '@/lib/retoCole';
import { type Curso } from '@/lib/temario';
import { encodeAjuste, estaVisto, temasDe, type AjusteTemas, type Marca } from '@/lib/temasVistos';
import type { DateKey, Profile } from '@/types';

/* =========================================================================
 *  Marcar desde casa qué temas han visto ya en clase, por asignatura.
 *
 *  Cada tema tiene tres posturas: lo que dice el temario (su fecha), o lo
 *  que diga quien lleva la casa: «visto» (entra en los retos ya) o «aún no»
 *  (fuera, también de los exámenes). Se abre con el PIN para que no lo
 *  toquen los críos, y lo que se marca viaja al resto de aparatos.
 * ========================================================================= */

interface TemasVistosProps {
  profile: Profile;
  curso: Curso;
  date: DateKey;
  ajuste: AjusteTemas;
  onSave: (text: string) => void;
  onClose: () => void;
}

const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

function cuando(desde: DateKey): string {
  const [y, m, d] = desde.split('-').map(Number);
  return FECHA.format(new Date(y, m - 1, d));
}

export function TemasVistos({ profile, curso, date, ajuste, onSave, onClose }: TemasVistosProps) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<AjusteTemas>(ajuste);

  const marcar = (id: string, marca: Marca | null) =>
    setBorrador((v) => {
      const next = { ...v };
      if (marca) next[id] = marca;
      else delete next[id];
      return next;
    });

  if (!abierto) {
    return (
      <Modal title="🔒 Sólo mayores" onClose={onClose}>
        <PinLock profile={profile} onUnlock={() => setAbierto(true)} onCancel={onClose} />
      </Modal>
    );
  }

  return (
    <Modal title="📚 Temas vistos en clase" size="lg" onClose={onClose}>
      <p className="text-[12px] leading-snug t-2">
        El temario trae una fecha para cada tema, pero el cole va a su ritmo. Marca <b className="t-1">visto</b> para que entre ya
        en los retos, o <b className="t-1">aún no</b> para dejarlo fuera (también de los exámenes). Sin marcar, manda la fecha.
      </p>

      <div className="mt-3 space-y-3">
        {ASIGNATURAS.map((asignatura) => {
          const meta = RETO_META[asignatura];
          return (
            <section key={asignatura} className="rounded-xl border p-2.5 hairline surf-1">
              <h4 className="text-[12px] font-black t-1">
                {meta.icon} {meta.nombre}
              </h4>
              <ul className="mt-1.5 space-y-1.5">
                {temasDe(asignatura, curso).map((tema) => {
                  const marca = borrador[tema.id] ?? null;
                  const visto = estaVisto(tema, date, borrador);
                  const porFecha = tema.desde <= date;
                  return (
                    <li key={tema.id} className="flex items-center gap-2">
                      <span className="shrink-0" aria-hidden>
                        {visto ? '✅' : '⬜'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold t-1">{tema.titulo}</span>
                        <span className="block text-[10px] t-3">
                          {marca === 'si' ? 'marcado como visto' : marca === 'no' ? 'marcado como aún no' : `por fecha: ${porFecha ? 'visto' : 'aún no'} (desde el ${cuando(tema.desde)})`}
                        </span>
                      </span>
                      <span className="flex shrink-0 overflow-hidden rounded-lg border hairline text-[10px] font-black">
                        <button type="button" onClick={() => marcar(tema.id, 'si')} className={`px-2 py-1 ${marca === 'si' ? 'bg-emerald-500 text-white' : 't-2'}`}>
                          Visto
                        </button>
                        <button type="button" onClick={() => marcar(tema.id, null)} className={`border-x px-2 py-1 hairline ${marca === null ? 'bg-accent text-white' : 't-2'}`} title="Como diga el temario">
                          Fecha
                        </button>
                        <button type="button" onClick={() => marcar(tema.id, 'no')} className={`px-2 py-1 ${marca === 'no' ? 'bg-rose-500 text-white' : 't-2'}`}>
                          Aún no
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => {
            onSave(encodeAjuste(borrador));
            onClose();
          }}
          className="btn-primary flex-1"
        >
          Guardar
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-snug t-3">
        Si una asignatura se queda sin ningún tema visto, los retos usan el primero del temario. Los retos de hoy que aún no se han jugado se rehacen con lo nuevo.
      </p>
    </Modal>
  );
}
