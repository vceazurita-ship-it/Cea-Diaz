'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ambient } from '@/components/Ambient';
import { SignIn } from '@/components/cloud/SignIn';
import { Dashboard } from '@/components/Dashboard';
import { PinLock } from '@/components/PinLock';
import { ProfileSelector, type ProfileGlance } from '@/components/ProfileSelector';
import { SettingsPanel } from '@/components/SettingsPanel';
import type { CalendarNotice } from '@/components/tasks/TasksPanel';
import { TopBar } from '@/components/TopBar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ToastProvider } from '@/components/ui/Toast';
import { AppearanceEditor } from '@/components/appearance/AppearanceEditor';
import { AppearanceProvider, useAppearance } from '@/hooks/useAppearance';
import { useHabitStore } from '@/hooks/useHabitStore';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { todayKey, weekKeys } from '@/lib/dates';
import { playAnthem, stopAnthem } from '@/lib/sound';
import {
  NEUTRAL_ACCENT,
  NEUTRAL_TINT,
  PROFILES,
  accentFor,
  getProfile,
  paletteStyle,
  skinOf,
} from '@/lib/profiles';
import { computeDayScore, summarizePeriod } from '@/lib/scoring';
import type { DashboardTab, DateKey, Profile, ProfileId } from '@/types';

export default function HomePage() {
  return (
    <ThemeProvider>
      <AppearanceProvider>
        <Home />
      </AppearanceProvider>
    </ThemeProvider>
  );
}

function Home() {
  const store = useHabitStore();
  const { dress } = useAppearance();
  const { mode } = useTheme();

  const [activeProfile, setActiveProfile] = useState<ProfileId | null>(null);
  const [date, setDate] = useState<DateKey>(todayKey);
  const [unlocked, setUnlocked] = useState<ProfileId[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Perfil cuyo aspecto se está editando. */
  const [editing, setEditing] = useState<Profile | null>(null);
  /** Perfil cuya sintonía está sonando ahora mismo, para poder cortarla. */
  const [nowPlaying, setNowPlaying] = useState<Profile | null>(null);
  /** Desenlace de la vuelta desde Google Calendar, si se viene de allí. */
  const [calendarReturn, setCalendarReturn] = useState<CalendarNotice | null>(null);
  /** Pestaña de partida del panel; sólo la fija esa vuelta. */
  const [landingTab, setLandingTab] = useState<DashboardTab | undefined>();

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

  const select = useCallback(
    (id: ProfileId) => {
      setActiveProfile(id);
      setDate(todayKey());

      // La sintonía se lanza aquí, dentro del gesto de tocar el perfil: es la
      // única forma de que el navegador deje sonar algo. Se toma del perfil ya
      // vestido, para que suene la canción que haya puesto la casa.
      const chosen = dress(getProfile(id));
      if (chosen.anthem && playAnthem(id, chosen.anthem, () => setNowPlaying(null))) {
        setNowPlaying(chosen);
      }
    },
    [dress],
  );

  const silence = useCallback(() => {
    stopAnthem();
    setNowPlaying(null);
  }, []);

  const goHome = useCallback(() => {
    silence();
    setActiveProfile(null);
  }, [silence]);

  const profile = activeProfile ? dress(getProfile(activeProfile)) : null;
  const needsPin = Boolean(profile?.isPrivate) && !unlocked.includes(profile!.id);

  // El selector y la pantalla de PIN se pintan en gris neutro; sólo el panel
  // de un perfil desbloqueado adopta su maquetación y su color.
  const dressedUp = profile && !needsPin ? profile : null;
  const skin = dressedUp ? skinOf(dressedUp) : 'night';
  const tint = dressedUp ? dressedUp.tint : NEUTRAL_TINT;
  const accent = dressedUp ? accentFor(dressedUp, mode) : NEUTRAL_ACCENT[mode];

  // Se propaga a <html> para que el fondo del documento y el scrollbar
  // acompañen al cambio de perfil o de modo. El color de la barra del
  // navegador se lee del token ya resuelto: es el mismo `--bg` que se está
  // pintando, así que nunca se queda desfasado respecto a la página.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.skin = skin;
    root.dataset.mode = mode;
    root.style.setProperty('--tint', tint);
    root.style.setProperty('--accent', accent);

    const painted = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (painted) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', painted);
    }
  }, [skin, mode, tint, accent]);

  // Nadie quiere música sonando en una pestaña que ya no mira.
  useEffect(() => stopAnthem, []);

  // Vuelta desde Google Calendar. El consentimiento saca de la app y devuelve
  // a la raíz, así que hay que reconstruir dónde estaba quien lo pidió: se
  // vuelve a su perfil, directamente a sus tareas, y allí se le cuenta cómo
  // ha ido. La sintonía no suena en este camino: no se ha entrado al perfil,
  // se ha vuelto a él a medio recado.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('calendario');
    if (!outcome) return;

    const asked = params.get('perfil');
    const known = PROFILES.some((profile) => profile.id === asked);

    setCalendarReturn({
      ok: outcome === 'ok',
      profileId: known ? (asked as ProfileId) : undefined,
      reason: params.get('motivo') ?? undefined,
    });

    if (known) {
      setActiveProfile(asked as ProfileId);
      setLandingTab('tasks');
    }

    // La barra se limpia: recargar no debe repetir el aviso ni el viaje.
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

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
        <main
          data-skin="night"
          data-mode={mode}
          style={paletteStyle(NEUTRAL_ACCENT[mode], NEUTRAL_TINT)}
          className="min-h-screen surf-page"
        >
          <Ambient skin="night" />
          <SignIn store={store} />
        </main>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <main
        data-skin={skin}
        data-mode={mode}
        style={paletteStyle(accent, tint)}
        className="min-h-screen surf-page"
      >
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
            // Un perfil bloqueado no enseña sus fotos, así que tampoco se editan.
            onCustomize={needsPin ? undefined : () => setEditing(profile)}
          />
        )}

        <div id="contenido" tabIndex={-1} className="outline-none">
          {!profile ? (
            <ProfileSelector
              onSelect={select}
              glances={glances}
              hydrated={store.hydrated}
              onEditCover={() => setSettingsOpen(true)}
            />
          ) : needsPin ? (
            <PinLock
              profile={profile}
              onUnlock={() => setUnlocked((prev) => [...prev, profile.id])}
              onCancel={goHome}
            />
          ) : (
            <Dashboard
              profile={profile}
              date={date}
              onDateChange={setDate}
              store={store}
              initialTab={landingTab}
              calendarNotice={
                calendarReturn &&
                (!calendarReturn.profileId || calendarReturn.profileId === profile.id)
                  ? calendarReturn
                  : null
              }
              onCalendarNoticeSeen={() => setCalendarReturn(null)}
            />
          )}
        </div>

{/* Un guardado que falla no puede pasar desapercibido: es la única
            señal de que lo registrado no está en ninguna parte. */}
        {store.status === 'error' && (
          <div
            role="alert"
            className="mx-auto mt-4 flex max-w-5xl items-start gap-3 rounded-2xl border px-4 py-3"
            style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-bg)' }}
          >
            <span aria-hidden>⚠️</span>
            <p className="text-sm t-danger">
              <strong>No se ha podido guardar en este navegador.</strong> Suele ser falta de
              espacio o el modo privado. Exporta una copia desde Ajustes antes de cerrar.
            </p>
          </div>
        )}

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
          <div className="flex items-center gap-2">
            {/* En el selector no hay barra superior, así que el interruptor
                de día y noche vive también aquí: nunca está a más de un toque. */}
            <ThemeToggle className="px-2.5 py-1.5 text-xs" />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="btn-ghost px-2.5 py-1.5 text-xs"
            >
              ⚙️ Ajustes
            </button>
          </div>
        </footer>

        {/* Cortar la sintonía: siempre a un toque mientras suena */}
        {nowPlaying && (
          <button
            type="button"
            onClick={silence}
            className="chip-accent fixed right-4 z-40 min-h-[2.5rem] shadow-lg"
            style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            🔇 {nowPlaying.anthemLabel ?? 'Silenciar'}
          </button>
        )}

        {settingsOpen && <SettingsPanel store={store} onClose={() => setSettingsOpen(false)} />}

        {editing && <AppearanceEditor profile={editing} onClose={() => setEditing(null)} />}
      </main>
    </ToastProvider>
  );
}
