'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ambient } from '@/components/Ambient';
import { SignIn } from '@/components/cloud/SignIn';
import { SyncBadge } from '@/components/cloud/SyncBadge';
import { PinLock } from '@/components/PinLock';
import { ProfileSelector, type ProfileGlance } from '@/components/ProfileSelector';
import type { CalendarNotice } from '@/components/tasks/TasksPanel';
import { TopBar } from '@/components/TopBar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ToastProvider } from '@/components/ui/Toast';

/* La portada sólo necesita el selector. El panel del perfil, los ajustes y el
 * editor de aspecto se piden aparte: el primero en cuanto alguien toca una
 * tarjeta, los otros dos al abrirlos. Antes viajaba todo en el mismo paquete
 * y el móvil tenía que analizar el código de las seis pestañas para pintar
 * cuatro fotos; Lighthouse lo medía en casi un segundo de pantalla congelada.
 * Mientras llega el panel se ve el mismo esqueleto que mientras se lee lo
 * guardado, así que entrar no salta ni parpadea. */
function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pt-4" aria-busy="true" aria-label="Cargando">
      <div className="skeleton h-40 rounded-3xl" />
      <div className="skeleton h-12 rounded-2xl" />
      <div className="skeleton h-28 rounded-2xl" />
      <div className="skeleton h-48 rounded-2xl" />
    </div>
  );
}
const Dashboard = dynamic(() => import('@/components/Dashboard').then((m) => m.Dashboard), {
  loading: DashboardLoading,
});
const SettingsPanel = dynamic(() => import('@/components/SettingsPanel').then((m) => m.SettingsPanel));
const AppearanceEditor = dynamic(() =>
  import('@/components/appearance/AppearanceEditor').then((m) => m.AppearanceEditor),
);
import { AppearanceProvider, useAppearance } from '@/hooks/useAppearance';
import { useHabitStore } from '@/hooks/useHabitStore';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { useToday } from '@/hooks/useToday';
import { todayKey } from '@/lib/dates';
import { FOOTBAR_RETURN_KEY } from '@/lib/footbarClient';
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
  // El día de hoy, vigilado. Cuando cambia se repinta todo el árbol, y con él
  // cada `todayKey()` suelto: es lo que mantiene honesta una app que se queda
  // abierta en la cocina de un día para otro.
  const today = useToday();

  const [activeProfile, setActiveProfile] = useState<ProfileId | null>(null);
  const [date, setDate] = useState<DateKey>(todayKey);
  const [unlocked, setUnlocked] = useState<ProfileId[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Apartado por el que abrir los ajustes; sólo lo fija quien los abre. */
  const [settingsSection, setSettingsSection] = useState<'seguridad' | 'gps' | 'nube' | undefined>();

  const openCloud = useCallback(() => {
    setSettingsSection('nube');
    setSettingsOpen(true);
  }, []);
  /** Perfil cuyo aspecto se está editando. */
  const [editing, setEditing] = useState<Profile | null>(null);
  /** Perfil cuya sintonía está sonando ahora mismo, para poder cortarla. */
  const [nowPlaying, setNowPlaying] = useState<Profile | null>(null);
  /** Desenlace de la vuelta desde Google Calendar, si se viene de allí. */
  const [calendarReturn, setCalendarReturn] = useState<CalendarNotice | null>(null);
  /** Pestaña de partida del panel; sólo la fija esa vuelta. */
  const [landingTab, setLandingTab] = useState<DashboardTab | undefined>();

  /** Resumen de un vistazo para las tarjetas del selector. Se calcula en
   *  `lib/glances.ts`, que se pide aparte una vez leído lo guardado: arrastra
   *  el temario y los bancos de preguntas, y no hacen falta para pintar. */
  const [glanceLib, setGlanceLib] = useState<typeof import('@/lib/glances') | null>(null);
  useEffect(() => {
    if (!store.hydrated || glanceLib) return;
    let alive = true;
    void import('@/lib/glances').then((m) => alive && setGlanceLib(m));
    return () => {
      alive = false;
    };
  }, [store.hydrated, glanceLib]);
  const glances = useMemo(
    () => (glanceLib ? glanceLib.computeGlances(store, today) : ({} as Record<ProfileId, ProfileGlance>)),
    [glanceLib, store, today],
  );

  // La app guardada en el aparato (`public/sw.js`): abre al momento y sin
  // cobertura. Sólo en lo publicado; en desarrollo serviría código viejo.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  // Medianoche con la app abierta: quien estuviera mirando «hoy» pasa al día
  // nuevo, y quien estuviera repasando un día atrás se queda donde estaba.
  // Sin esto lo que se registrara de madrugada iría a parar a la víspera.
  const wasToday = useRef(today);
  useEffect(() => {
    if (wasToday.current === today) return;
    setDate((current) => (current === wasToday.current ? today : current));
    wasToday.current = today;
  }, [today]);

  const lockedIds = useMemo(
    () => PROFILES.filter((p) => p.isPrivate && !unlocked.includes(p.id)).map((p) => p.id),
    [unlocked],
  );

  /** De un perfil a otro sin soltar el día ni el registro, y sin sintonía:
   *  es seguir apuntando, no entrar. */
  const switchKeepingDay = useCallback((id: ProfileId) => {
    setLandingTab('today');
    setActiveProfile(id);
    window.scrollTo({ top: 0 });
  }, []);

  const select = useCallback(
    (id: ProfileId, keepDay = false) => {
      setActiveProfile(id);
      // Desde la portada se entra en hoy; desde la barra de arriba se cambia
      // de persona sin soltar el día que se estaba mirando.
      if (!keepDay) setDate(todayKey());

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
    // La pestaña de partida valía sólo para la vuelta de Google Calendar. Sin
    // borrarla aquí se quedaba pegada, y entrar en cualquier perfil un rato
    // después seguía abriendo Tareas en vez del registro del día.
    setLandingTab(undefined);
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

  // El panel del perfil se trae en cuanto la portada está pintada y el móvil
  // descansa: así no frena la primera pantalla, pero al tocar una tarjeta ya
  // está en caché y se entra sin esqueleto. Sin `requestIdleCallback`
  // (Safari antiguo) basta un temporizador.
  useEffect(() => {
    const prefetch = () => void import('@/components/Dashboard');
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    const timer = window.setTimeout(() => {
      if (w.requestIdleCallback) w.requestIdleCallback(prefetch, { timeout: 4000 });
      else prefetch();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

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

  // Vuelta desde la pantalla de permiso de Footbar, que se pidió desde
  // Ajustes → GPS: se reabren los ajustes ahí mismo y el desenlace se deja
  // anotado para que esa sección lo cuente.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('footbar');
    if (!outcome) return;

    try {
      window.sessionStorage.setItem(
        FOOTBAR_RETURN_KEY,
        JSON.stringify({
          ok: outcome === 'ok',
          profileId: params.get('perfil') ?? undefined,
          nuevas: Number(params.get('nuevas') ?? 0),
          motivo: params.get('motivo') ?? undefined,
        }),
      );
    } catch {
      // Sin almacenamiento de sesión se abre igual, sin el aviso.
    }

    setSettingsSection('gps');
    setSettingsOpen(true);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Volver al selector con Escape: la salida siempre está a una tecla.
  useEffect(() => {
    if (!profile) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || settingsOpen) return;
      // Escape mientras se escribe es «suelta el campo», no «sal del perfil»;
      // y con un diálogo abierto, lo que se cierra es el diálogo.
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"]')) return;
      goHome();
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

        {/* Vuelta del enlace de recuperación. La sesión ya está abierta, así
            que sin esto no habría ni rastro de que falta lo importante: poner
            la contraseña nueva antes de olvidarse otra vez. */}
        {store.cloud.recovering && (
          <div
            role="alert"
            className="mx-auto mt-4 flex max-w-5xl flex-wrap items-center gap-3 rounded-2xl border
                       border-accent bg-accent-faint px-4 py-3"
          >
            <span aria-hidden>🔑</span>
            <p className="min-w-0 flex-1 text-sm t-1">
              <strong>Falta poner una contraseña nueva.</strong> Has entrado con el enlace del
              correo; hasta que la cambies, sigue valiendo la que no recordáis.
            </p>
            <button
              type="button"
              onClick={() => {
                setSettingsSection('seguridad');
                setSettingsOpen(true);
              }}
              className="btn-primary px-3 py-1.5 text-xs"
            >
              Cambiarla
            </button>
          </div>
        )}

        {profile && (
          <TopBar
            activeId={profile.id}
            onSelect={(id) => select(id, true)}
            onHome={goHome}
            lockedIds={lockedIds}
            // Un perfil bloqueado no enseña sus fotos, así que tampoco se editan.
            onCustomize={needsPin ? undefined : () => setEditing(profile)}
            cloud={store.cloud}
            onOpenCloud={openCloud}
            todayRatio={Object.fromEntries(
              Object.entries(glances).map(([id, glance]) => [id, glance.tracked ? glance.today : 0]),
            )}
          />
        )}

        {/* Un guardado que falla no puede pasar desapercibido: es la única
            señal de que lo registrado no está en ninguna parte. Va arriba y
            pegado, porque al pie de un panel largo no lo veía nadie. */}
        {store.status === 'error' && (
          <div
            role="alert"
            className="sticky top-0 z-30 mx-auto flex max-w-5xl items-start gap-3 rounded-b-2xl border px-4 py-3 backdrop-blur-md"
            style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-bg)' }}
          >
            <span aria-hidden>⚠️</span>
            <p className="min-w-0 flex-1 text-sm t-danger">
              <strong>No se ha podido guardar en este navegador.</strong> Suele ser falta de
              espacio o el modo privado. Exporta una copia desde Ajustes antes de cerrar.
            </p>
            <button type="button" onClick={() => setSettingsOpen(true)} className="btn-danger shrink-0 px-3 py-1.5 text-xs">
              Ajustes
            </button>
          </div>
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
          ) : !store.hydrated ? (
            // Hasta que lo guardado está leído, un panel vacío diría «0 %» y
            // «aún no hay registros» a quien sí los tiene: mejor un esqueleto.
            <DashboardLoading />
          ) : (
            <Dashboard
              // Cada perfil, un panel nuevo: sin la llave, pasar de Víctor a
              // María desde la barra conservaba la pestaña y la economía abierta.
              key={profile.id}
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
              onSwitchProfile={switchKeepingDay}
            />
          )}
        </div>

        {/* Pie con acceso a ajustes */}
        <footer
          className={`mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 pt-2 ${dressedUp ? 'pb-24 sm:pb-8' : 'pb-8'}`}
          style={dressedUp ? undefined : { paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SyncBadge cloud={store.cloud} onOpen={openCloud} />
            <p className="text-[11px] t-3">
              {store.cloud.status === 'synced'
                ? 'Guardado en este navegador y en la cuenta de casa.'
                : store.cloud.status === 'error'
                  ? 'Guardado en este navegador; la nube no responde.'
                  : store.cloud.status === 'signed-out'
                    ? 'Guardado sólo en este navegador: entra en la cuenta de casa para compartirlo.'
                    : store.cloud.status === 'syncing'
                      ? 'Guardado en este navegador; subiendo a la cuenta de casa.'
                      : // Sin nube, lo mismo que dice su chip y Ajustes → Nube.
                        'Este aparato guarda sólo aquí: para compartir entre móviles hace falta la cuenta de casa.'}
            </p>
          </div>
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
            // Con el panel abierto, en el móvil la barra de pestañas ocupa el
            // borde de abajo: el botón sube para no quedar tapado.
            // El alto lo publica la propia barra en `--tabbar-h` (cero fuera
            // del panel y en tableta), así que no hay que adivinarlo aquí.
            style={{
              bottom:
                'max(calc(var(--tabbar-h, 0px) + 0.5rem), calc(env(safe-area-inset-bottom) + 1rem))',
            }}
          >
            🔇 {nowPlaying.anthemLabel ?? 'Silenciar'}
          </button>
        )}

        {settingsOpen && (
          <SettingsPanel
            store={store}
            initialSection={settingsSection}
            onClose={() => {
              setSettingsOpen(false);
              setSettingsSection(undefined);
            }}
          />
        )}

        {editing && <AppearanceEditor profile={editing} onClose={() => setEditing(null)} />}
      </main>
    </ToastProvider>
  );
}
