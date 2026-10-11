'use client';

import { useEffect, useState } from 'react';

import type { CloudState } from '@/hooks/useHabitStore';

/* =========================================================================
 *  El estado de la nube, a la vista.
 *
 *  Antes sólo lo decía una línea del pie y un punto rojo dentro de Ajustes:
 *  con el móvil sin cobertura o la sesión caducada, lo que se registraba se
 *  quedaba en el aparato sin que nadie se enterase hasta que otro no lo
 *  veía en el suyo. Aquí va en la barra, en dos palabras —al día, hace 5
 *  min, sin conexión, error—, y tocarlo lleva a donde se arregla.
 * ========================================================================= */

interface SyncBadgeProps {
  cloud: CloudState;
  onOpen: () => void;
  className?: string;
}

/** «hace 5 min», «hace 2 h», «ayer». */
export function haceCuanto(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

export function SyncBadge({ cloud, onOpen, className = '' }: SyncBadgeProps) {
  // La hora se refresca sola cada medio minuto: «hace 5 min» no puede
  // quedarse clavado toda la tarde. Y la cobertura se mira del navegador,
  // que es quien la sabe.
  const [now, setNow] = useState(0);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (!cloud.configured || cloud.status === 'off') return null;

  const hace = haceCuanto(cloud.lastSync, now);
  const estado: { icon: string; label: string; tone: 'ok' | 'warn' | 'bad' | 'mute'; title: string } = !online
    ? { icon: '📴', label: 'Sin conexión', tone: 'warn', title: 'Sin conexión: lo que registres se guarda aquí y se sube al volver la cobertura.' }
    : cloud.status === 'signed-out'
      ? { icon: '☁️', label: 'Sin entrar', tone: 'warn', title: 'No se ha entrado en la cuenta de casa: lo registrado se queda en este aparato.' }
      : cloud.status === 'error'
        ? { icon: '⚠️', label: 'Error al sincronizar', tone: 'bad', title: cloud.error ?? 'La última sincronización falló; lo local sigue intacto.' }
        : cloud.status === 'syncing'
          ? { icon: '🔄', label: 'Sincronizando', tone: 'mute', title: 'Subiendo y bajando cambios.' }
          : { icon: '☁️', label: hace ? `Al día · ${hace}` : 'Al día', tone: 'ok', title: `Guardado en la cuenta de casa${cloud.email ? ` (${cloud.email})` : ''}.` };

  const tono =
    estado.tone === 'bad'
      ? 'border-[var(--danger)] bg-[var(--danger-bg)] t-danger'
      : estado.tone === 'warn'
        ? 'border-accent bg-accent-soft t-1'
        : 'hairline surf-1 t-3';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`chip h-9 max-w-[46vw] border text-[11px] ${tono} ${className}`}
      title={estado.title}
      aria-label={`Nube: ${estado.label}. Abrir ajustes de la nube`}
    >
      <span aria-hidden className={cloud.status === 'syncing' && online ? 'animate-girar' : ''}>
        {estado.icon}
      </span>
      <span className="truncate">{estado.label}</span>
    </button>
  );
}
