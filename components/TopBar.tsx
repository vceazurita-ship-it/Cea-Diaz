'use client';

import { useEffect, useRef } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { PROFILES, accentStyle } from '@/lib/profiles';
import type { ProfileId } from '@/types';

interface TopBarProps {
  activeId: ProfileId;
  onSelect: (id: ProfileId) => void;
  onHome: () => void;
  /** Perfiles bloqueados (privados sin desbloquear) se marcan con candado. */
  lockedIds?: ProfileId[];
}

export function TopBar({ activeId, onSelect, onHome, lockedIds = [] }: TopBarProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Con seis perfiles la tira se desborda en el móvil: al cambiar de perfil
  // se trae el activo a la vista para no dejarlo escondido fuera de cuadro.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeId]);

  return (
    <nav
      aria-label="Perfiles"
      className="sticky top-0 z-30 border-b hairline bg-[var(--bg)]/85 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
        <button
          type="button"
          onClick={onHome}
          className="btn-ghost shrink-0 px-2.5 py-1.5"
          aria-label="Volver al selector de perfiles"
          title="Selector de perfiles (Esc)"
        >
          <span className="text-base" aria-hidden>
            🏠
          </span>
          <span className="hidden sm:inline">Perfiles</span>
        </button>

        {/* La máscara difumina los extremos para insinuar que la tira sigue. */}
        <div
          className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 py-0.5"
          style={{
            maskImage:
              'linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%)',
            scrollbarWidth: 'none',
          }}
        >
          {PROFILES.map((profile) => {
            const active = profile.id === activeId;
            const locked = lockedIds.includes(profile.id) && !active;
            const label =
              profile.kind === 'group'
                ? profile.name.replace('Hábitos en ', '')
                : profile.name;

            return (
              <button
                key={profile.id}
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => onSelect(profile.id)}
                aria-current={active ? 'page' : undefined}
                style={accentStyle(profile.accent)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5
                  text-sm font-semibold transition-colors
                  ${active ? 'bg-accent t-on-accent' : 't-2 hover-soft hover:t-1'}`}
                title={locked ? `${profile.name} (bloqueado)` : profile.name}
              >
                <Avatar
                  profile={profile}
                  size={26}
                  shape="circle"
                  className={active ? 'ring-2 ring-white/30' : 'opacity-90'}
                />
                <span className={active ? 'inline' : 'hidden md:inline'}>{label}</span>
                {locked && (
                  <span className="text-xs" aria-label="bloqueado">
                    🔒
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
