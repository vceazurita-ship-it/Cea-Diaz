'use client';

import { Avatar } from '@/components/ui/Avatar';
import { PROFILES } from '@/lib/profiles';
import type { ProfileId } from '@/types';

interface TopBarProps {
  activeId: ProfileId;
  onSelect: (id: ProfileId) => void;
  onHome: () => void;
  /** Perfiles bloqueados (privados sin desbloquear) se marcan con candado. */
  lockedIds?: ProfileId[];
}

export function TopBar({ activeId, onSelect, onHome, lockedIds = [] }: TopBarProps) {
  return (
    <div className="sticky top-0 z-30 border-b hairline bg-[var(--bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
        <button
          type="button"
          onClick={onHome}
          className="btn-ghost shrink-0 px-2.5 py-1.5"
          aria-label="Volver al selector de perfiles"
          title="Selector de perfiles"
        >
          <span className="text-base">🏠</span>
          <span className="hidden sm:inline">Perfiles</span>
        </button>

        <div className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 py-0.5">
          {PROFILES.map((profile) => {
            const active = profile.id === activeId;
            const locked = lockedIds.includes(profile.id) && !active;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => onSelect(profile.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5
                  text-sm font-semibold transition-all
                  ${active ? '' : 't-2 hover-soft hover:t-1'}`}
                style={active ? { backgroundColor: profile.accent, color: 'var(--on-accent)' } : undefined}
                title={profile.name}
              >
                <Avatar
                  profile={profile}
                  size={26}
                  shape="circle"
                  className={active ? 'ring-2 ring-[var(--on-accent)]/25' : 'opacity-90'}
                />
                <span className={active ? 'inline' : 'hidden md:inline'}>
                  {profile.kind === 'group' ? profile.name.replace('Hábitos en ', '') : profile.name}
                </span>
                {locked && <span className="text-xs">🔒</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
