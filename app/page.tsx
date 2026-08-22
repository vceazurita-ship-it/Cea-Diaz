'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ambient } from '@/components/Ambient';
import { SignIn } from '@/components/cloud/SignIn';
import { Dashboard } from '@/components/Dashboard';
import { PinLock } from '@/components/PinLock';
import { ProfileSelector, type ProfileGlance } from '@/components/ProfileSelector';
import { SettingsPanel } from '@/components/SettingsPanel';
import { TopBar } from '@/components/TopBar';
import { ToastProvider } from '@/components/ui/Toast';
import { useHabitStore } from '@/hooks/useHabitStore';
import { todayKey, weekKeys } from '@/lib/dates';
import { prunePhotos } from '@/lib/photos';
import { playAnthem, stopAnthem } from '@/lib/sound';
import { PROFILES, accentFor, accentStyle, getProfile, skinOf } from '@/lib/profiles';
import { computeDayScore, summarizePeriod } from '@/lib/scoring';
import type { DateKey, Profile, ProfileId } from '@/types';

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
  /** Perfil cuya sintonía está sonando ahora mismo, para poder cortarla. */
  const [nowPlaying, setNowPlaying] = useState<Profile | null>(null);

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

    // La sintonía se lanza aquí, dentro del gesto de tocar el perfil: es la
    // única forma de que el navegador deje sonar algo.
    const chosen = getProfile(id);
    if (chosen.anthem && playAnthem(id, chosen.anthem, () => setNowPlaying(null))) {
      setNowPlaying(chosen);
    }
  }, []);

  const silence = useCallback(() => {
    stopAnthem();
    setNowPlaying(null);
  }, []);

  const goHome = useCallback(() => {
    silence();
    setActiveProfile(null);
  }, [silence]);

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

  // Miniaturas huérfanas: al arrancar no hay nada pendiente de deshacerse,
  // así que lo que ya no pertenece a ninguna comida se puede tirar.
  useEffect(() => {
    if (!store.hydrated) return;
    prunePhotos(Object.values(store.meals).map((meal) => meal.photoId ?? meal.id));
    // Sólo al hidratar: después, cada borrado se limpia por su cuenta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.hydrated]);

  // Nadie quiere música sonando en una pestaña que ya no mira.
  useEffect(() => stopAnthem, []);

  // Volver al selector con Escape: la salida siempre está a una tecla.
  useEffect(() => {
    if (!profile) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !settingsOpen) goHome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profile, settingsOpen, goHome]);

  // Con nube configurada y sin sesión, lo primero es entrar. Sólo se pide una
  // vez por móvil, y siempre se puede seguir trabajando en local.
  const needsSignIn =
    store.hydrated && store.cloud.configured && store.cloud.status === 'signed-out' && !store.localOnly;

  if (needsSignIn) {
    return (
      <ToastProvider>
        <main data-skin="night" className="min-h-screen surf-page">
          <Ambient skin="night" />
          <SignIn store={store} />
        </main>
      </ToastProvider>
    );
  }

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

        <div id="contenido" tabIndex={-1} className="outline-none">
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
            {store.cloud.status === 'synced'
              ? 'Los datos se guardan en este navegador y en la cuenta de casa.'
              : 'Los datos se guardan en este navegador (localStorage).'}
          </p>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="btn-ghost px-2.5 py-1.5 text-xs"
          >
            ⚙️ Ajustes
          </button>
        </footer>

        {/* Cortar la sintonía: siempre a un toque mientras suena */}
        {nowPlaying && (
          <button
            type="button"
            onClick={silence}
            className="chip-accent fixed right-4 z-40 shadow-lg"
            style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            🔇 {nowPlaying.anthemLabel ?? 'Silenciar'}
          </button>
        )}

        {settingsOpen && <SettingsPanel store={store} onClose={() => setSettingsOpen(false)} />}
      </main>
    </ToastProvider>
  );
}
