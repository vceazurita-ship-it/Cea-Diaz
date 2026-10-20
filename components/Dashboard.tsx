'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CategoryCard } from '@/components/CategoryCard';
import { QuickChecklist, quickIds } from '@/components/QuickChecklist';
import { DateNavigator, dayPillLabel } from '@/components/DateNavigator';
import { AttentionStrip } from '@/components/today/AttentionStrip';
import { LearningBonusCard } from '@/components/learning/LearningBonusCard';
import { FinanceLock } from '@/components/finance/FinanceLock';
import { DayNoteCard } from '@/components/notes/DayNoteCard';
import { TodayPlanCard } from '@/components/planner/TodayPlanCard';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import type { CalendarNotice } from '@/components/tasks/TasksPanel';
import { useToast } from '@/components/ui/Toast';
import { Celebration } from '@/components/ui/Celebration';
import { playCue } from '@/lib/sound';
import { success as hapticSuccess } from '@/lib/haptics';
import { CHALLENGE_NOTE_KEY } from '@/lib/challenges';

/* -------------------------------------------------------------------------
 *  Pestañas que se cargan al abrirlas.
 *
 *  El registro del día es lo que se ve al entrar y va en el paquete. El resto
 *  —la semana, los retos con sus juegos y su liga, las estadísticas, los
 *  recados, el rendimiento y la economía— suma más código que todo lo demás
 *  junto, y en un móvil de gama media analizarlo de golpe congelaba la
 *  primera pantalla casi un segundo. Cada una se pide al tocar su pestaña, y
 *  mientras llega se pinta un esqueleto del mismo tamaño para que nada salte.
 * ------------------------------------------------------------------------- */
function TabLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando la sección">
      <div className="skeleton h-28 rounded-3xl" />
      <div className="skeleton h-64 rounded-3xl" />
    </div>
  );
}
const ChallengesPanel = dynamic(
  () => import('@/components/challenges/ChallengesPanel').then((m) => m.ChallengesPanel),
  { loading: TabLoading },
);
const RendimientoPanel = dynamic(
  () => import('@/components/rendimiento/RendimientoPanel').then((m) => m.RendimientoPanel),
  { loading: TabLoading },
);
const FinancePanel = dynamic(
  () => import('@/components/finance/FinancePanel').then((m) => m.FinancePanel),
  { loading: TabLoading },
);
const WeekPlanner = dynamic(
  () => import('@/components/planner/WeekPlanner').then((m) => m.WeekPlanner),
  { loading: TabLoading },
);
const SummaryView = dynamic(
  () => import('@/components/summary/SummaryView').then((m) => m.SummaryView),
  { loading: TabLoading },
);
const TasksPanel = dynamic(
  () => import('@/components/tasks/TasksPanel').then((m) => m.TasksPanel),
  { loading: TabLoading },
);
import type { HabitStore } from '@/hooks/useHabitStore';
import { useWeekPlan } from '@/hooks/useWeekPlan';
import { buildChallengeWeek, markHints } from '@/lib/challenges';
import { addDays, friendlyDateLabel, isToday, parseDateKey, todayKey, weekKeys, weekdayIndex } from '@/lib/dates';
import {
  GAME_META,
  GAME_NOTE_KEY,
  encodeGameResult,
  gameEnabledFor,
  gameForDate,
  gameResultFor,
  isGameDone,
} from '@/lib/games';
import { gpsEnabledFor } from '@/lib/gps';
import { getCategories } from '@/lib/habits';
import { learnHabits, usualFills, type UsualFill } from '@/lib/habitual';
import { PENALTY_NOTE_KEY, encodePenaltyResult } from '@/lib/penalties';
import { COLE_NOTE_KEY, conResultado } from '@/lib/retoCole';
import { TEMAS_NOTE_DATE, TEMAS_NOTE_KEY } from '@/lib/temasVistos';
import { FUTBOL_NOTE_KEY, encodeFutbolResult } from '@/lib/retoFutbol';
import { learningFor } from '@/lib/learning';
import { bestSlot, blockForMetric, planOf } from '@/lib/planner';
import { clockNow, planFills, plannedToday, planProgress } from '@/lib/planToday';
import { diasSinApuntar } from '@/lib/huecos';
import { PROFILES, skinOf } from '@/lib/profiles';
import { computeDayScore, metricRatio, summarizePeriod } from '@/lib/scoring';
import { dueCount } from '@/lib/tasks';
import type { DashboardTab, DateKey, HabitCategory, Metric, MetricValue, PlanBlock, Profile, ProfileId } from '@/types';

/** Un día sin registrar. Siempre el mismo, para no recalcular por su culpa. */
const EMPTY_VALUES: Record<string, MetricValue> = {};

const shortWeekday = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' });

/** El día en lo justo para una pastilla de huecos: «Ayer» o «Jue 15». */
function shortDayLabel(key: DateKey): string {
  if (friendlyDateLabel(key) === 'Ayer') return 'Ayer';
  const text = shortWeekday.format(parseDateKey(key)).replace('.', '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface DashboardProps {
  profile: Profile;
  date: DateKey;
  onDateChange: (date: DateKey) => void;
  store: HabitStore;
  /** Pestaña de partida; se usa al volver de conectar Google Calendar. */
  initialTab?: DashboardTab;
  /** Desenlace de esa conexión, para acusarlo donde se pidió. */
  calendarNotice?: CalendarNotice | null;
  onCalendarNoticeSeen?: () => void;
  /**
   * Pasar a otro perfil sin salir del registro ni cambiar de día. Leo y Hugo
   * se apuntan seguidos, por la noche: volver a la portada y buscar el día
   * otra vez entre uno y otro era el paso que sobraba.
   */
  onSwitchProfile?: (id: ProfileId) => void;
}

/**
 * El día más despejado de la semana tipo, con el de hoy como desempate: es
 * donde tiene sentido proponer un rato nuevo cuando algo se pide y no está.
 */
function freeDay(profileId: Profile['id'], today: number): number {
  const load = [0, 0, 0, 0, 0, 0, 0];
  for (const block of planOf(profileId).blocks) load[block.day] += block.duration;

  let best = today;
  for (let day = 0; day < 7; day += 1) {
    if (load[day] < load[best]) best = day;
  }
  return best;
}

export function Dashboard({
  profile,
  date,
  onDateChange,
  store,
  initialTab,
  calendarNotice,
  onCalendarNoticeSeen,
  onSwitchProfile,
}: DashboardProps) {
  const [rawTab, setTabState] = useState<DashboardTab>(initialTab ?? 'today');
  const [onlyPending, setOnlyPending] = useState(false);
  /**
   * La casilla a la que llevar la vista, pedida desde lo previsto de hoy. La
   * tarjeta que la tiene se abre, baja hasta ella y la deja en nulo.
   */
  const [focusMetric, setFocusMetric] = useState<string | null>(null);
  const clearFocus = useCallback(() => setFocusMetric(null), []);
  /**
   * En el panel de los peques, la tarjeta que hay que abrir porque la de
   * antes se ha completado. Va atada al día: en otro día manda lo de siempre.
   */
  const [nextOpen, setNextOpen] = useState<{ date: DateKey; id: string } | null>(null);
  /**
   * Un rato montado en otra pestaña —desde un reto sin hueco— que espera a
   * que la agenda lo recoja y abra su editor. Se vacía en cuanto lo hace.
   */
  const [planSeed, setPlanSeed] = useState<PlanBlock | null>(null);
  /**
   * Si la sección de economía está abierta. Se olvida al salir del perfil: la
   * clave se pide una vez por visita, no una vez por navegador.
   */
  const [financeOpen, setFinanceOpen] = useState(false);
  const notify = useToast();

  const kid = profile.kind === 'kid';
  const skin = skinOf(profile);

  // Los recados de los peques no los usaba nadie y ocupaban un sitio de la
  // barra: sólo salen cuando tienen alguno pendiente (o se ha entrado a
  // propósito desde el enlace del registro). Las propuestas de la semana de
  // los peques van en Rendimiento → Colegio; las de María, en sus recados,
  // así que los suyos ya no se esconden.
  const recadosOcultos = skin === 'pitch' &&!store.getTasks(profile.id).some((t) => !t.done) && rawTab !== 'tasks';

  // `short` es el nombre para la barra del móvil, donde seis pestañas se
  // reparten 390 px: «Estadísticas» no cabe, «Datos» sí.
  const allTabs: Array<{ id: DashboardTab; label: string; icon: string; short?: string }> =
    skin === 'pitch'
      ? [
          { id: 'today', label: 'Partido', icon: '⚽' },
          { id: 'plan', label: 'Semana', icon: '🗓️' },
          { id: 'challenges', label: 'Retos', icon: '🎯' },
          { id: 'tasks', label: 'Recados', icon: '📋' },
          { id: 'summary', label: 'Estadísticas', icon: '📊', short: 'Datos' },
          /**
           * Lo que se le mide: los partidos con el rastreador, las pruebas
           * físicas y el colegio. Sólo está donde hay algo que medir: en los
           * paneles de Leo y de Hugo.
           */
          ...(gpsEnabledFor(profile) ? [{ id: 'gps' as const, label: 'Rendimiento', icon: '📈', short: 'Medidas' }] : []),
        ]
      : // El panel de María se lee como un cuento, y sus secciones también:
        // el día es su jornada, la semana su reino, los retos sus deseos.
        skin === 'royal'
        ? [
            { id: 'today', label: 'Mi día', icon: '👑' },
            { id: 'plan', label: 'Mi semana', icon: '🏰' },
            { id: 'challenges', label: 'Deseos', icon: '🌟' },
            { id: 'tasks', label: 'Recados', icon: '📜' },
            { id: 'summary', label: 'Mi historia', icon: '📖', short: 'Historia' },
          ]
        : [
          { id: 'today', label: 'Registro', icon: '📝' },
          { id: 'plan', label: 'Semana', icon: '🗓️' },
          { id: 'challenges', label: 'Retos', icon: '🎯' },
          { id: 'tasks', label: 'Tareas', icon: '📋' },
          { id: 'summary', label: 'Resúmenes', icon: '📊' },
          /**
           * La economía es de Víctor y sólo suya, así que la pestaña no
           * existe en los demás paneles: no hay nada que esconder ni que
           * explicar donde no toca. Detrás lleva su propia clave.
           */
          ...(profile.id === 'victor'
            ? [{ id: 'economia' as const, label: 'Economía', icon: '💶' }]
            : []),
        ];

  const tabs = recadosOcultos ? allTabs.filter((t) => t.id !== 'tasks') : allTabs;

  /* La pestaña que se pinta es siempre una de las que este perfil tiene: si
     llegaba otra —la economía de Víctor en el panel de María—, se cae al
     registro del día en vez de enseñar lo que no toca. */
  const tab: DashboardTab = tabs.some((option) => option.id === rawTab) ? rawTab : 'today';

  /** Cambiar de pestaña empieza arriba: la nueva no tiene nada que ver con
      el punto de la anterior en que se estaba. */
  const setTab = (next: DashboardTab) => {
    if (next !== tab) window.scrollTo({ top: 0 });
    setTabState(next);
  };

  const categories = getCategories(profile.id);
  const entry = store.getEntry(profile.id, date);
  /* El objeto vacío se memoriza: si no, un día sin registrar devuelve uno
     nuevo en cada pintada y todo lo que dependa de él se recalcula entero. */
  const values = useMemo(() => entry?.values ?? EMPTY_VALUES, [entry]);

  const dayScore = useMemo(
    () => computeDayScore(profile.id, date, entry),
    [profile.id, date, entry],
  );

  // Resumen de la semana visible: alimenta la tira del navegador y la racha.
  const week = useMemo(
    () => summarizePeriod(profile.id, weekKeys(date), store.entries),
    [profile.id, date, store.entries],
  );

  const weekRatios = useMemo(
    () =>
      week.days.reduce<Record<string, number>>((acc, day) => {
        acc[day.date] = day.empty ? 0 : day.ratio;
        return acc;
      }, {}),
    [week],
  );

  // Retos de la semana visible: alimenta el acceso rápido de la barra de acciones.
  const challengeWeek = useMemo(
    () => buildChallengeWeek(profile, date, store.entries),
    [profile, date, store.entries],
  );

  // La marca que hay que batir hoy en cada sesión de gimnasio. Se dice donde se
  // apunta, no en la pestaña de retos: cuando ya está el peso puesto es tarde.
  const marks = useMemo(
    () => markHints(profile.id, date, store.entries),
    [profile.id, date, store.entries],
  );

  const filled = dayScore.categories.reduce((sum, category) => sum + category.filled, 0);
  const total = dayScore.categories.reduce((sum, category) => sum + category.total, 0);
  const pending = total - filled;

  /* ------------------------------------------------ la fiesta del día
   *
   * Cuando quien registra rellena la última casilla, salta el confeti. Sólo
   * si ha sido a mano en este día: al llegar la nube o al abrir un día ya
   * completo no se celebra nada, que no lo ha hecho nadie ahora.
   */
  const touched = useRef<DateKey | null>(null);
  const lastPending = useRef<{ date: DateKey; pending: number } | null>(null);
  const [party, setParty] = useState(false);
  useEffect(() => {
    const prev = lastPending.current;
    lastPending.current = { date, pending };
    if (prev && prev.date === date && prev.pending > 0 && pending === 0 && total > 0 && touched.current === date) {
      setParty(true);
      playCue('combo');
      hapticSuccess();
    }
  }, [date, pending, total]);
  const endParty = useCallback(() => setParty(false), []);

  /* ---------------------------------------------- el registro y la semana
   *
   * Las dos mitades de la app se miraban de lejos: la agenda sabía que hoy
   * hay veinte minutos de lectura a las nueve, y la casilla de lectura, tres
   * dedos más abajo, no sabía nada de aquello. Aquí se cruzan, y con eso cada
   * casilla puede decir lo que se esperaba de ella y rellenarse de un toque.
   */
  const plan = useWeekPlan(profile.id);

  /**
   * La hora, para poder distinguir lo que ya tocaba de lo que aún no. Se
   * arranca en nulo y se corrige tras montar —en el servidor no hay reloj— y
   * se repasa cada minuto, que es a lo que se mueve una agenda.
   */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(clockNow());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const planned = useMemo(() => plannedToday(plan, date, now), [plan, date, now]);
  const planDone = useMemo(() => planProgress(planned, values), [planned, values]);

  /** Lo que la semana apartaba hoy y sigue en blanco, listo para ponerlo. */
  const fills = useMemo(
    () => planFills(profile.id, planned, values),
    [profile.id, planned, values],
  );

  /**
   * Lo aprendido de lo ya rellenado: qué se contesta siempre igual y qué casi
   * nunca. Sólo mira los días anteriores al que se ve, así que no cambia
   * mientras se rellena: las sugerencias no bailan bajo el dedo.
   */
  const habitual = useMemo(
    () => learnHabits(profile.id, date, store.entries),
    [profile.id, date, store.entries],
  );

  /** Todo lo que hoy se puede poner «como siempre», en todas las tarjetas. */
  const usualAll = useMemo(
    () => usualFills(categories.flatMap((category) => category.metrics), habitual, values),
    [categories, habitual, values],
  );

  /** Cumplimiento por categoría, para saber cuáles quedan a medias. */
  const scoreById = useMemo(
    () => new Map(dayScore.categories.map((category) => [category.categoryId, category])),
    [dayScore],
  );

  /**
   * Las casillas de sí o no que los mayores marcan arriba, en el exprés. Las
   * tarjetas las pliegan para no pintar dos veces la misma casilla.
   */
  const quickSet = useMemo<ReadonlySet<string>>(
    () => (kid ? new Set<string>() : quickIds(getCategories(profile.id))),
    [kid, profile.id],
  );

  /**
   * Si una tarjeta tiene algo por contestar que no se pueda marcar en el
   * exprés. Las de deportes van enteras, así que ahí cuenta todo.
   */
  const pendingHere = (category: HabitCategory) =>
    category.metrics.some(
      (metric) =>
        (metric.weight ?? 1) > 0 &&
        (category.layout === 'sports' || !quickSet.has(metric.id)) &&
        metricRatio(metric, values[metric.id]) === null,
    );

  /** La primera tarjeta con algo pendiente, que es la que se abre. */
  const firstPendingId = categories.find(pendingHere)?.id;

  /** Abrir o plegar todas las tarjetas a la vez. */
  const [allOpenState, setAllOpen] = useState({ open: false, n: 0, date });
  // Cada día empieza como le toca: la orden de ayer no vale para hoy.
  const allOpen = allOpenState.date === date ? allOpenState : { ...allOpenState, open: false };

  const visibleCategories = onlyPending
    ? categories.filter((category) => {
        const score = scoreById.get(category.id);
        return !score || score.filled < score.total;
      })
    : categories;

  const handleChange = (metricId: string, value: Parameters<HabitStore['setValue']>[3]) => {
    touched.current = date;
    store.setValue(profile.id, date, metricId, value);
  };

  /** Notas sueltas del día: una por categoría, más la del panel de retos. */
  const notes = entry?.notes ?? {};
  const writeNote = (key: string, text: string) => {
    store.setEntryNote(profile.id, date, key, text);
  };

  /* ------------------------------------------------ atajos de teclado */

  // Flechas para cambiar de día y «H» para volver a hoy. Se ignoran mientras
  // se escribe, para no secuestrar el cursor dentro de la nota, y mientras
  // haya un diálogo abierto: con la hoja de un reto o la de los criterios
  // delante, una flecha cambiaba el día de debajo sin que se viera, y al
  // cerrar aparecía otro día con otros datos sin que nadie lo hubiera pedido.
  // Con Alt o Mayús tampoco: ésos son los atajos de la agenda.
  useEffect(() => {
    if (tab !== 'today') return;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (target?.closest('[role="dialog"]') || document.querySelector('[role="dialog"]')) return;

      if (event.key === 'ArrowLeft') onDateChange(addDays(date, -1));
      else if (event.key === 'ArrowRight' && date < todayKey()) onDateChange(addDays(date, 1));
      else if (event.key.toLowerCase() === 'h') onDateChange(todayKey());
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, date, onDateChange]);

  // Del 1 al 6, una pestaña cada uno, desde cualquiera de ellas. Con las
  // mismas salvedades que las flechas: ni escribiendo ni con un diálogo.
  const tabIds = tabs.map((option) => option.id).join(',');
  useEffect(() => {
    const ids = tabIds.split(',') as DashboardTab[];
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (target?.closest('[role="dialog"]') || document.querySelector('[role="dialog"]')) return;

      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= ids.length) return;
      event.preventDefault();
      window.scrollTo({ top: 0 });
      setTabState(ids[index]);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabIds]);

  /* --------------------------------------------- el alto de la barra de abajo
   *
   * En el móvil las pestañas van fijas abajo y tapaban los avisos —con su
   * «Deshacer»— y el botón de silenciar. Se mide la barra y se publica en
   * `--tabbar-h`; a partir de tableta la hoja de estilos la deja en cero,
   * porque ahí la barra va arriba, en su sitio.
   */
  const tabBar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = tabBar.current;
    if (!bar) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--tabbar-h', `${bar.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--tabbar-h');
    };
  }, []);

  /* ------------------------------------------------------ deslizar
   *
   * En el móvil, un dedo de lado cambia de día, como pasar página: a la
   * izquierda el siguiente, a la derecha el anterior. Tiene que ser un gesto
   * claro —más de 70 px de lado y poco de arriba abajo— para no confundirlo
   * con el desplazamiento ni con un toque en una casilla.
   */
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = (event: React.TouchEvent) => {
    const t = event.touches[0];
    swipe.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onSwipeEnd = (event: React.TouchEvent) => {
    const start = swipe.current;
    swipe.current = null;
    const t = event.changedTouches[0];
    if (!start || !t) return;
    const target = event.target as HTMLElement | null;
    // Lo que ya se desliza de lado —la tira de acciones— no pasa página.
    if (target?.closest('input[type="range"], textarea, [role="dialog"], [data-noswipe]')) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
    const next =
      dx < 0 && date < todayKey() ? addDays(date, 1) : dx > 0 ? addDays(date, -1) : null;
    if (!next) return;
    onDateChange(next);
    // Con el dedo a media pantalla, el navegador de días puede estar lejos:
    // se dice a qué día se ha pasado, para no apuntar en el que no era.
    notify({ message: dayPillLabel(next), icon: '📅', duration: 1400 });
  };

  /* ------------------------------------------- de lo previsto a la casilla */

  /**
   * Tocar una línea de lo previsto hoy lleva a su casilla. Si el filtro de
   * pendientes la tenía escondida —ya registrada—, se quita: se ha pedido
   * verla, precisamente.
   */
  const jumpToMetric = (metricId: string) => {
    const owner = categories.find((category) =>
      category.metrics.some((metric) => metric.id === metricId),
    );
    if (!owner) return;
    if (onlyPending && !visibleCategories.some((category) => category.id === owner.id)) {
      setOnlyPending(false);
    }
    setFocusMetric(metricId);
  };

  /**
   * Una tarjeta recién completada: se abre la siguiente que aún tenga algo,
   * mirando primero las de debajo y luego las de arriba. A los mayores sólo
   * se les lleva a la que tenga algo fuera del exprés: lo de sí o no ya lo
   * tienen arriba.
   */
  const openNextPending = (doneId: string) => {
    const at = categories.findIndex((category) => category.id === doneId);
    const order = [...categories.slice(at + 1), ...categories.slice(0, Math.max(0, at))];
    const next = order.find((category) => {
      const score = scoreById.get(category.id);
      return score && score.total > 0 && score.filled < score.total && pendingHere(category);
    });
    if (next) setNextOpen({ date, id: next.id });
  };

  /* ------------------------------------------------------- acciones */

  /**
   * Registrar de una vez lo que la semana daba por previsto y sigue vacío.
   *
   * No se hace solo, y por eso hay un botón: un plan no es un hecho, y dar
   * por bebidos seis vasos porque estaban apartados ensuciaría el historial
   * con el que después se decide. Lo que quita es el trabajo de copiar a mano
   * lo que la propia app ya sabía, que es distinto.
   *
   * Fuera quedan las escalas y las elecciones —cómo fue el entreno no lo sabe
   * la agenda— y los techos: tener dos horas de pantallas previstas no es
   * motivo para apuntar que se han visto.
   */
  const fillFromWeek = () => {
    if (fills.length === 0) return;
    touched.current = date;
    const before = store.snapshot();

    for (const fill of fills) store.setValue(profile.id, date, fill.metricId, fill.value);

    notify({
      message:
        fills.length === 1
          ? `«${fills[0].label}», registrado según la semana. Corrígelo si no fue así.`
          : `${fills.length} casillas puestas según la semana. Corrige las que no fueran así.`,
      icon: '🗓️',
      action: { label: 'Deshacer', onClick: () => store.restore(before) },
    });
  };

  /**
   * Poner de golpe lo que se contesta siempre igual. Como lo de la semana: lo
   * pide quien registra, se dice qué se ha puesto y se puede deshacer.
   */
  const fillUsual = (list: UsualFill[], where?: string) => {
    if (list.length === 0) return;
    touched.current = date;
    const before = store.snapshot();
    for (const fill of list) store.setValue(profile.id, date, fill.metricId, fill.value);

    notify({
      message:
        list.length === 1
          ? `«${list[0].label}», como siempre. Corrígelo si hoy no fue así.`
          : `${list.length} respuestas puestas como siempre${where ? ` en ${where.toLowerCase()}` : ''}. Corrige las que hoy fueran distintas.`,
      icon: '✨',
      action: { label: 'Deshacer', onClick: () => store.restore(before) },
    });
  };

  const copyYesterday = () => {
    const from = addDays(date, -1);
    touched.current = date;
    const before = store.snapshot();
    const copied = store.copyDay(profile.id, from, date);

    notify(
      copied > 0
        ? {
            message: `${copied} ${copied === 1 ? 'registro copiado' : 'registros copiados'} del día anterior.`,
            icon: '📋',
            action: { label: 'Deshacer', onClick: () => store.restore(before) },
          }
        : { message: 'El día anterior no tiene registros que copiar.', icon: '🤷' },
    );
  };

  /**
   * Apartarle un rato en la semana a lo que pide un reto. Se monta aquí
   * —conociendo el perfil y el día— y se lleva a la agenda, que lo abre ya
   * relleno: desde el reto hasta el hueco en la semana no hay más que un
   * toque, que es lo que hace que se llegue a apartar de verdad.
   */
  const reserveForMetric = (metric: Metric) => {
    const plan = planOf(profile.id);
    const day = freeDay(profile.id, weekdayIndex(date));
    setPlanSeed(blockForMetric(profile.id, metric, day, bestSlot(plan, day)));
    setTab('plan');
  };

  /** Días recientes sin nada apuntado, contados desde hoy y sin el que se ve. */
  const huecos = useMemo(
    () => diasSinApuntar(store.entries, profile.id, todayKey()).filter((day) => day !== date),
    [store.entries, profile.id, date],
  );

  /** El hermano con el que se registra a la vez, si lo hay. */
  const sibling = kid && onSwitchProfile ? PROFILES.find((p) => p.kind === 'kid' && p.id !== profile.id) : undefined;

  /** Recados que urgen hoy; se acusan en la propia pestaña. */
  const tasksDue = dueCount(store.getTasks(profile.id));

  /**
   * El juego del día vive en la pestaña de retos, junto al álbum que llena.
   * Aquí sólo se anuncia: si está sin jugar, es lo primero que quiere saber
   * un peque al abrir la app.
   */
  const gamePlays = gameEnabledFor(profile) && isToday(date);
  const gameResult = gamePlays ? gameResultFor(store.entries, profile.id, date) : null;
  const gameDone = gameResult ? isGameDone(gameResult) : false;
  const gameMeta = GAME_META[gameForDate(date)];

  /** El bonus del día, sacado de donde este perfil pone el interés. */
  const learning = useMemo(
    () => learningFor(profile, store.entries, date),
    [profile, store.entries, date],
  );

  return (
    // `data-variant` deja que la hoja de estilos vista de peque cualquier
    // `.card` de dentro sin tener que repasar componente a componente.
    <div
      className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:pb-16"
      data-variant={kid ? 'kid' : 'adult'}
    >
      {party && (
        <Celebration
          icon={skin === 'pitch' ? '🏆' : skin === 'royal' ? '👑' : '🎉'}
          title={
            skin === 'pitch'
              ? '¡Partido completo!'
              : skin === 'royal'
                ? '¡Cuento terminado!'
                : '¡Día completo!'
          }
          subtitle={`${profile.name.replace('Hábitos en ', '')}: ${total} de ${total} ${
            isToday(date) ? 'hoy' : friendlyDateLabel(date).toLowerCase()
          }${week.streak > 1 ? ` · 🔥 ${week.streak} días de racha` : ''}.`}
          onDone={endParty}
        />
      )}

      <ProfileHeader
        profile={profile}
        skin={skin}
        date={date}
        dayScore={dayScore}
        streak={week.streak}
        filled={filled}
        plan={planDone}
        compact={tab !== 'today'}
      />

      {/* Pestañas. En el móvil van abajo, fijas y con el nombre debajo del
          icono: en una fila arriba, seis pestañas se quedaban en «P…», «S…»,
          «R…» y nadie sabía adónde iba. A partir de tableta, arriba como
          siempre. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex border-t px-1 pt-1 hairline surf-raised
          sm:static sm:mb-4 sm:rounded-2xl sm:border sm:p-1 sm:surf-1"
        style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
        ref={tabBar}
        role="tablist"
        aria-label="Secciones del perfil"
        onKeyDown={(event) => {
          const index = tabs.findIndex((option) => option.id === tab);
          const target =
            event.key === 'ArrowRight'
              ? (index + 1) % tabs.length
              : event.key === 'ArrowLeft'
                ? (index - 1 + tabs.length) % tabs.length
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : -1;
          if (target < 0) return;
          event.preventDefault();
          // La flecha es de las pestañas: sin esto llegaba también a la
          // ventana, y la derecha, además de cambiar de pestaña, pasaba de día.
          event.stopPropagation();
          const next = tabs[target].id;
          setTab(next);
          // El foco acompaña a la pestaña elegida, como en cualquier tablist.
          window.requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
        }}
      >
        {tabs.map((option) => {
          const active = tab === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${option.id}`}
              id={`tab-${option.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(option.id)}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1
                py-1.5 text-[10px] font-bold leading-tight transition-colors
                sm:flex-row sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm
                ${active ? 'bg-accent t-on-accent' : 't-2 hover-soft hover:t-1'}
                ${skin === 'pitch' ? 'font-display uppercase tracking-wide' : ''}
                ${skin === 'royal' ? 'royal-title' : ''}`}
            >
              <span aria-hidden className="text-lg leading-none sm:text-base">
                {option.icon}
              </span>
              <span className="max-w-full truncate sm:hidden">{option.short ?? option.label}</span>
              <span className="hidden max-w-full truncate sm:inline">{option.label}</span>

              {/* Lo que urge hoy se ve desde cualquier pestaña */}
              {option.id === 'tasks' && tasksDue > 0 && (
                <span
                  aria-label={`${tasksDue} pendientes`}
                  className={`absolute right-1 top-0.5 shrink-0 rounded-full px-1.5 text-[10px] tabular-nums
                    sm:static ${active ? 'bg-white/25' : 'bg-accent-soft t-1'}`}
                >
                  {tasksDue}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Título de la pestaña, sólo para el lector de pantalla. La cabecera
          lleva el h1 con el nombre y cada panel abre sus tarjetas con h3: sin
          este escalón, quien navega por títulos saltaba del 1 al 3 y no sabía
          en qué sección estaba. A la vista ya lo dice la pestaña marcada. */}
      <h2 className="sr-only">{tabs.find((option) => option.id === tab)?.label}</h2>

      {tab === 'today' ? (
        <div
          className="animate-aparece space-y-3"
          role="tabpanel"
          id="panel-today"
          aria-labelledby="tab-today"
          onTouchStart={onSwipeStart}
          onTouchEnd={onSwipeEnd}
        >
          <DateNavigator
            date={date}
            onChange={onDateChange}
            weekRatios={weekRatios}
            progress={{ done: filled, total }}
          />

          {/* Lo que se quedó sin apuntar estos días: un toque y se está en
              ese día. Al día siguiente todavía se recuerda; a la semana, no.
              En una sola línea que se desliza de lado: en tres filas de
              pastillas se comía la mitad de la primera pantalla. */}
          {huecos.length > 0 && (
            <div className="banner banner-warn flex items-center gap-2 !py-1.5 !pl-3 !pr-1.5" role="status">
              <span className="shrink-0 font-bold t-1">
                <span aria-hidden>🕘</span> Sin apuntar
              </span>
              <div
                data-noswipe
                className="edge-mask-x flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 py-0.5"
                style={{ scrollbarWidth: 'none' }}
              >
                {huecos.slice(0, 4).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onDateChange(day)}
                    aria-label={`Ir a ${dayPillLabel(day)}, sin apuntar`}
                    className="chip min-h-[2rem] shrink-0 whitespace-nowrap border px-2.5 hairline surf-1 font-semibold t-1 hover-soft"
                  >
                    {shortDayLabel(day)} →
                  </button>
                ))}
              </div>
              {/* El remedio para la próxima vez: que el móvil avise. */}
              <a
                href="/api/recordatorio?h=21:00"
                className="chip min-h-[2rem] shrink-0 border px-2.5 hairline surf-1 font-semibold t-2 hover-soft"
                title="Añade al calendario del móvil un aviso diario a las 21:00"
                aria-label="Avísame cada noche a las 21:00"
              >
                ⏰<span className="hidden sm:inline">Avísame cada noche</span>
              </a>
            </div>
          )}

          {/* Barra de acciones del día. En el móvil eran tres filas de
              botones antes de la primera casilla; ahora es una tira que se
              desliza de lado, con lo que propone la app delante —lo de la
              semana y lo de siempre, que son los que ahorran trabajo— y
              copiar el día anterior al final, que es lo menos habitual. La
              cuenta de lo hecho ya no va aquí: la lleva el anillo de la
              cabecera, y la pastilla flotante del día al bajar. */}
          <div>
            <div
              data-noswipe
              className="edge-mask-x -mx-4 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-4 py-0.5
                sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
              style={{ scrollbarWidth: 'none' }}
            >
              {/* Lo que la semana daba por previsto, puesto de una vez. Sólo
                  aparece cuando hay algo que poner: un botón que no hace nada
                  es peor que no tenerlo. */}
              {fills.length > 0 && (
                <button
                  type="button"
                  onClick={fillFromWeek}
                  className="btn shrink-0 whitespace-nowrap border bg-accent-soft border-accent px-3 py-1.5 text-xs font-semibold t-1"
                  title={fills.map((fill) => `${fill.icon} ${fill.label}`).join(' · ')}
                >
                  🗓️ Según la semana ({fills.length})
                </button>
              )}

              {/* Lo que se contesta igual casi todos los días, de una vez. */}
              {usualAll.length > 0 && (
                <button
                  type="button"
                  onClick={() => fillUsual(usualAll)}
                  className="btn shrink-0 whitespace-nowrap border bg-accent-soft border-accent px-3 py-1.5 text-xs font-semibold t-1"
                  title={usualAll.map((fill) => `${fill.icon} ${fill.label}`).join(' · ')}
                >
                  ✨ Como siempre ({usualAll.length})
                </button>
              )}

              <button
                type="button"
                onClick={() => setOnlyPending((v) => !v)}
                aria-pressed={onlyPending}
                className={`btn shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-semibold border
                  ${onlyPending ? 'bg-accent-soft border-accent t-1' : 'hairline surf-1 t-2 hover-soft'}`}
              >
                {onlyPending ? '👁️ Viendo pendientes' : '🔎 Sólo pendientes'}
              </button>

              <button
                type="button"
                onClick={() => setTab('challenges')}
                className="btn-ghost shrink-0 whitespace-nowrap px-3 py-1.5 text-xs"
                title="Ver los retos de esta semana"
              >
                🎯 Retos {challengeWeek.done}/{challengeWeek.challenges.length}
              </button>

              {gamePlays && (
                <button
                  type="button"
                  onClick={() => setTab('challenges')}
                  className={`btn-ghost shrink-0 whitespace-nowrap px-3 py-1.5 text-xs
                    ${gameDone ? '' : 'font-semibold t-1'}`}
                  title={`${gameMeta.title}: se juega una vez al día y deja cromo`}
                >
                  {gameMeta.icon}{' '}
                  {gameDone
                    ? `Juego ${gameResult?.correct}/${gameResult?.total}`
                    : gameResult
                      ? 'Juego a medias'
                      : 'Juego del día'}
                </button>
              )}

              <button
                type="button"
                onClick={copyYesterday}
                className="btn-ghost shrink-0 whitespace-nowrap px-3 py-1.5 text-xs"
                title={`Traer lo registrado el ${friendlyDateLabel(addDays(date, -1)).toLowerCase()}`}
              >
                📋 Copiar del día anterior
              </button>

              {sibling && (
                <button
                  type="button"
                  onClick={() => onSwitchProfile?.(sibling.id)}
                  className="btn-ghost shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-semibold t-1"
                  title={`Registrar a ${sibling.name} el mismo día`}
                >
                  ➡️ Ahora {sibling.name}
                </button>
              )}
            </div>
          </div>

          {/* Para los mayores, lo de sí o no de un toque: un registro largo
              que se hace en medio minuto es un registro que se hace. Con
              «Sólo pendientes», también aquí quedan sólo las que faltan. Lo
              que se marca aquí, las tarjetas de abajo lo pliegan. */}
          {!kid && (
            <QuickChecklist
              key={`expres-${date}`}
              categories={categories}
              values={values}
              onChange={handleChange}
              onlyPending={onlyPending}
              profileId={profile.id}
              onSet={(id, day, metricId, value) =>
                id === profile.id && day === date ? handleChange(metricId, value) : store.setValue(id, day, metricId, value)
              }
            />
          )}

          {/* Lo clave del día, en una línea por hábito que lleva a su
              casilla; el porqué, tras la ⓘ. */}
          <AttentionStrip profile={profile} values={values} kid={kid} onJump={jumpToMetric} onlyUrgent={kid} />

          {/* Lo que la semana tenía apartado para hoy, ya contrastado con lo
              registrado: es lo que ata la agenda a estas casillas. */}
          <TodayPlanCard
            key={`plan-${date}`}
            onJump={jumpToMetric}
            profile={profile}
            date={date}
            store={store}
            kid={kid}
            onOpenPlan={() => setTab('plan')}
          />

          {/* Las tarjetas, plegadas salvo la primera con algo pendiente: con
              todas abiertas el registro de un adulto medía once mil píxeles.
              Plegada, cada una dice con su anillo cuánto lleva y qué le falta. */}
          {visibleCategories.length > 0 && (
            <div className="flex items-center gap-2 px-1 pt-1">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] t-3">
                {kid ? 'Las jugadas' : 'Por tarjetas'}
              </h3>
              <span className="text-[11px] tabular-nums t-3">
                {pending > 0 ? `· ${pending === 1 ? 'queda 1' : `quedan ${pending}`}` : '· día completo 🎉'}
              </span>
              <button
                type="button"
                onClick={() => setAllOpen((s) => ({ open: !(s.date === date && s.open), n: s.n + 1, date }))}
                className="btn-ghost ml-auto px-2.5 py-1 text-xs"
              >
                {allOpen.open ? '▴ Plegar todas' : '▾ Abrir todas'}
              </button>
            </div>
          )}

          {visibleCategories.length === 0 ? (
            <div className={`${kid ? 'card-kid' : 'card'} p-8 text-center`}>
              <p className="text-4xl" aria-hidden>
                {skin === 'pitch' ? '🏆' : skin === 'royal' ? '👑' : '🎉'}
              </p>
              <p className="mt-2 font-bold t-1">
                {skin === 'pitch'
                  ? 'Partido completo: no queda nada por apuntar'
                  : skin === 'royal'
                    ? 'Cuento terminado: no queda nada por registrar'
                    : 'No queda nada por registrar'}
              </p>
              <p className="mt-1 text-sm t-3">
                Has completado las {total} métricas de{' '}
                {friendlyDateLabel(date).toLowerCase()}.
              </p>
              <button
                type="button"
                onClick={() => setOnlyPending(false)}
                className="btn-ghost mt-4 px-3 py-1.5 text-xs"
              >
                Ver todas las categorías
              </button>
            </div>
          ) : (
            visibleCategories.map((category) => (
              <CategoryCard
                // Con el día en la llave, cada día empieza con sus tarjetas
                // abiertas o plegadas según lo suyo, no según lo de ayer.
                key={`${category.id}:${date}`}
                category={category}
                focusMetric={focusMetric}
                onFocused={clearFocus}
                requestOpen={nextOpen?.date === date && nextOpen.id === category.id}
                onComplete={() => openNextPending(category.id)}
                quickIds={quickSet}
                openSignal={allOpen}
                profileId={profile.id}
                values={values}
                onChange={handleChange}
                variant={kid ? 'kid' : 'adult'}
                skin={skin}
                defaultOpen={
                  // Sólo la primera que aún tiene algo por contestar fuera
                  // del exprés; las demás, plegadas con su anillo. Una
                  // completa se abre luego sola la siguiente.
                  category.id === firstPendingId
                }
                hints={marks}
                planned={planned}
                habitual={habitual}
                onFillUsual={fillUsual}
                note={notes[category.id] ?? ''}
                onNoteChange={(text) => writeNote(category.id, text)}
              />
            ))
          )}

          {/* El regalo del día: una cosa útil, en el idioma que le toca. Va
              después de las casillas: se lee con calma, y antes empujaba lo
              de apuntar por debajo del pliegue. */}
          {learning && <LearningBonusCard learning={learning} kid={kid} />}

          {/* Observaciones del día */}
          <DayNoteCard profile={profile} date={date} store={store} kid={kid} filled={filled} />

          {sibling && (
            <button
              type="button"
              onClick={() => onSwitchProfile?.(sibling.id)}
              className={`${pending === 0 ? 'btn-primary' : 'btn-ghost border hairline'} w-full justify-center px-4 py-3 text-sm font-bold`}
            >
              {pending === 0 ? '¡Hecho! ' : ''}Seguir con {sibling.name}, {friendlyDateLabel(date).toLowerCase()} →
            </button>
          )}

          {/* Con huecos, el aviso ya está arriba, en su línea: no se repite. */}
          {huecos.length === 0 && <p className="text-center">
            <a href="/api/recordatorio?h=21:00" className="text-[11px] font-semibold underline-offset-2 t-3 hover:underline" title="Añade al calendario del móvil un evento diario con alarma">
              ⏰ Que el móvil me recuerde apuntar cada noche a las 21:00
            </a>
          </p>}

          {recadosOcultos && (
            <p className="text-center">
              <button type="button" onClick={() => setTab('tasks')} className="text-[11px] font-semibold underline-offset-2 t-3 hover:underline">
                📋 Apuntarle un recado a {profile.name}
              </button>
            </p>
          )}

          {/* Los atajos sólo se anuncian donde hay teclado: en el móvil eran
              cuatro líneas de letra pequeña que no llevaban a ninguna parte. */}
          <p className="hidden pt-1 text-center text-[11px] t-3 sm:block">
            Atajos: <kbd className="font-mono font-bold">←</kbd>{' '}
            <kbd className="font-mono font-bold">→</kbd> cambian de día ·{' '}
            <kbd className="font-mono font-bold">H</kbd> vuelve a hoy ·{' '}
            <kbd className="font-mono font-bold">1</kbd>–
            <kbd className="font-mono font-bold">{tabs.length}</kbd> cambian de sección ·{' '}
            <kbd className="font-mono font-bold">Esc</kbd> vuelve a los perfiles
          </p>
        </div>
      ) : tab === 'plan' ? (
        <div className="animate-aparece" role="tabpanel" id="panel-plan" aria-labelledby="tab-plan">
          <WeekPlanner
            profile={profile}
            date={date}
            store={store}
            skin={skin}
            seed={planSeed}
            onSeedUsed={() => setPlanSeed(null)}
          />
        </div>
      ) : tab === 'challenges' ? (
        <div className="animate-aparece" role="tabpanel" id="panel-challenges" aria-labelledby="tab-challenges">
          <ChallengesPanel
            profile={profile}
            date={date}
            entries={store.entries}
            skin={skin}
            note={notes[CHALLENGE_NOTE_KEY] ?? ''}
            onNoteChange={(text) => writeNote(CHALLENGE_NOTE_KEY, text)}
            onGameResult={(result) =>
              store.setEntryNote(profile.id, date, GAME_NOTE_KEY, encodeGameResult(result))
            }
            onPenaltyResult={(result) =>
              store.setEntryNote(profile.id, date, PENALTY_NOTE_KEY, encodePenaltyResult(result))
            }
            onColeResult={(result) =>
              // Varios retos al día: se anota éste sin pisar los demás.
              store.setEntryNote(profile.id, date, COLE_NOTE_KEY, conResultado(store.entries, profile.id, date, result))
            }
            onAjusteTemas={(text) =>
              // Lo marcado como visto o aún no cuelga del primer día del
              // trimestre, para que viaje con las notas y le llegue a su tableta.
              store.setEntryNote(profile.id, TEMAS_NOTE_DATE, TEMAS_NOTE_KEY, text)
            }
            onFutbolResult={(result) =>
              store.setEntryNote(profile.id, date, FUTBOL_NOTE_KEY, encodeFutbolResult(result))
            }
            onReserve={reserveForMetric}
          />
        </div>
      ) : tab === 'economia' ? (
        <div className="animate-aparece" role="tabpanel" id="panel-economia" aria-labelledby="tab-economia">
          {financeOpen ? (
            <FinancePanel profile={profile} />
          ) : (
            <FinanceLock name={profile.name} onUnlock={() => setFinanceOpen(true)} />
          )}
        </div>
      ) : tab === 'gps' ? (
        <div className="animate-aparece" role="tabpanel" id="panel-gps" aria-labelledby="tab-gps">
          <RendimientoPanel profile={profile} store={store} kid={kid} skin={skin} />
        </div>
      ) : tab === 'tasks' ? (
        <div className="animate-aparece" role="tabpanel" id="panel-tasks" aria-labelledby="tab-tasks">
          <TasksPanel
            profile={profile}
            store={store}
            kid={kid}
            skin={skin}
            notice={calendarNotice}
            onNoticeSeen={onCalendarNoticeSeen}
          />
        </div>
      ) : (
        <div className="animate-aparece" role="tabpanel" id="panel-summary" aria-labelledby="tab-summary">
          <SummaryView
          profile={profile}
          date={date}
          entries={store.entries}
          skin={skin}
          onSelectDay={(selected) => {
            onDateChange(selected);
            setTab('today');
          }}
          // Cambiar de semana o de mes mueve el día visible sin sacar a nadie
          // de los resúmenes: sólo tocar un día concreto lleva al registro.
          onDateChange={onDateChange}
          onOpenPlan={() => setTab('plan')}
          // El foco del parte lleva a su casilla, en el registro de hoy.
          onFocusMetric={(metricId) => {
            onDateChange(todayKey());
            setTab('today');
            jumpToMetric(metricId);
          }}
          />
        </div>
      )}
    </div>
  );
}
