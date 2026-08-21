'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ambient } from '@/components/Ambient';
import { Dashboard } from '@/components/Dashboard';
import { PinLock } from '@/components/PinLock';
import { ProfileSelector, type ProfileGlance } from '@/components/ProfileSelector';
import { SettingsPanel } from '@/components/SettingsPanel';
import { TopBar } from '@/components/TopBar';
import { ToastProvider } from '@/components/ui/Toast';
import { useHabitStore } from '@/hooks/useHabitStore';
import { todayKey, weekKeys } from '@/lib/dates';
import { PROFILES, accentFor, accentStyle, getProfile, skinOf } from '@/lib/profiles';
import { computeDayScore, summarizePeriod } from '@/lib/scoring';
import type { DateKey, ProfileId } from '@/types';

/** Color de la barra del navegador por piel, para que la app se integre al instalarla. */
const THEME_COLOR: Record<string, string> = {
  night: '#161a23',
  pitch: '#05180e',
  editorial: '#f6f4f1',
};

export default function HomePage() {
  const store = useHabitStore();

  const [activeProfile, setActiveProfile] = useState<ProfileId | null>(null);
  const [date, setDate] = useState<DateKey>(todayKey);
  const [unlocked, setUnlocked] = useState<ProfileId[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /** Resumen de un vistazo para las tarjetas del selector. */
  const glances = useMemo(() => {
    const today = todayKey();
    return PROFILES.reduce(
      (acc, profile) => {
        const entry = store.getEntry(profile.id, today);
        const day = computeDayScore(profile.id, today, entry);
        const week = summarizePeriod(profile.id, weekKeys(today), store.entries);

        acc[profile.id] = {
          today: day.ratio,
          stars: day.stars,
          streak: week.streak,
          tracked: !day.empty,
        };
        return acc;
      },
      {} as Record<ProfileId, ProfileGlance>,
    );
  }, [store]);

  const lockedIds = useMemo(
    () => PROFILES.filter((p) => p.isPrivate && !unlocked.includes(p.id)).map((p) => p.id),
    [unlocked],
  );

  const select = useCallback((id: ProfileId) => {
    setActiveProfile(id);
    setDate(todayKey());
  }, []);

  const goHome = useCallback(() => setActiveProfile(null), []);

  const profile = activeProfile ? getProfile(activeProfile) : null;
  const needsPin = Boolean(profile?.isPrivate) && !unlocked.includes(profile!.id);

  // El selector y la pantalla de PIN se pintan siempre con la piel nocturna;
  // sólo el panel de un perfil desbloqueado adopta la suya.
  const skin = profile && !needsPin ? skinOf(profile) : 'night';
  const accent = profile && !needsPin ? accentFor(profile, skin) : '#818cf8';

  // Se propaga a <html> para que el fondo del documento, la barra del
  // navegador y el scrollbar acompañen al cambio de piel.
  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[skin] ?? THEME_COLOR.night);
  }, [skin]);

  // Volver al selector con Escape: la salida siempre está a una tecla.
  useEffect(() => {
    if (!profile) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !settingsOpen) goHome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profile, settingsOpen, goHome]);

  return (
    <ToastProvider>
      <main data-skin={skin} style={accentStyle(accent)} className="min-h-screen surf-page">
        <Ambient skin={skin} />

        <a
          href="#contenido"
          className="btn-primary sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Saltar al contenido
        </a>

        {profile && (
          <TopBar
            activeId={profile.id}
            onSelect={select}
            onHome={goHome}
            lockedIds={lockedIds}
          />
        )}

        <div id="contenido">
          {!profile ? (
            <ProfileSelector onSelect={select} glances={glances} hydrated={store.hydrated} />
          ) : needsPin ? (
            <PinLock
              profile={profile}
              onUnlock={() => setUnlocked((prev) => [...prev, profile.id])}
              onCancel={goHome}
            />
          ) : (
            <Dashboard profile={profile} date={date} onDateChange={setDate} store={store} />
          )}
        </div>

        {/* Pie con acceso a ajustes */}
        <footer
          className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 pb-8 pt-2"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        >
          <p className="text-[11px] t-3">
            Los datos se guardan en este navegador (localStorage).
          </p>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="btn-ghost px-2.5 py-1.5 text-xs"
          >
            ⚙️ Ajustes
          </button>
        </footer>

        {settingsOpen && <SettingsPanel store={store} onClose={() => setSettingsOpen(false)} />}
      </main>
    </ToastProvider>
  );
}
