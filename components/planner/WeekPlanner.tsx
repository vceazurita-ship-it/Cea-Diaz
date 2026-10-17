'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { BlockEditor } from '@/components/planner/BlockEditor';
import { BlockPills, StatusPill } from '@/components/planner/BlockPills';
import { CopyWeekPicker } from '@/components/planner/CopyWeekPicker';
import { PlanAlerts } from '@/components/planner/PlanAlerts';
import { PlanChallengesCard } from '@/components/planner/PlanChallengesCard';
import { PlanCopySheet } from '@/components/planner/PlanCopySheet';
import type { CopyRequest, CopyTarget } from '@/components/planner/PlanCopySheet';
import { ReplicaAsk } from '@/components/planner/ReplicaAsk';
import { SKIN_GOLD, WeekTimetable } from '@/components/planner/WeekTimetable';
import type { TimetableZoom } from '@/components/planner/WeekTimetable';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { Modal } from '@/components/ui/Modal';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { useToast } from '@/components/ui/Toast';
import type { HabitStore } from '@/hooks/useHabitStore';
import { oneOf, useRemembered } from '@/hooks/useRemembered';
import { useWeekPlan, useWeekPlanWithMirrors } from '@/hooks/useWeekPlan';
import { buildChallengeWeek } from '@/lib/challenges';
import { formatShort, weekKeys, weekdayIndex } from '@/lib/dates';
import {
  SILENT,
  companionShare,
  mirrorAlerts,
  reviewWeek,
  statusLabel,
} from '@/lib/planCheck';
import {
  COMPANIONS,
  DAY_NAMES,
  DAY_SHORT,
  PLAN_KINDS,
  addPlanBlocks,
  blockPalette,
  blocksOfDay,
  clearDayPlan,
  clockAmountChange,
  copyBlockTo,
  copyDayTo,
  copyWeekFrom,
  copyableWeeks,
  daysFilled,
  duplicateBlock,
  durationLabel,
  emptyBlock,
  gradientOf,
  isMirror,
  kindPalette,
  kindShare,
  minutesOf,
  mirrorMinutes,
  mirrorRail,
  mirrorShare,
  mirrorsShown,
  moveBlockTo,
  moveDayTo,
  planOf,
  plannedMinutes,
  rangeOf,
  relinkPlan,
  relinkPreview,
  removePlanBlock,
  sampleWeek,
  savePlanBlock,
  showMirrors,
  spreadBlock,
  subscribePlans,
  swapDays,
  takesMirrors,
  themeOf,
  timeOf,
  updatePlan,
  withClockAmount,
} from '@/lib/planner';
import type { PlanOrnament, WeekSource } from '@/lib/planner';
import {
  previewReplica,
  replicaMode,
  replicate,
  setReplicaMode,
  syncWeeks,
  twinCount,
  twinName,
  twinOf,
} from '@/lib/planTwin';
import type { PlanChange, ReplicaMode, ReplicaPreview, ReplicaResult } from '@/lib/planTwin';
import { PROFILES, headingFont } from '@/lib/profiles';
import type {
  DateKey,
  PlanBlock,
  PlanKind,
  PlanStatus,
  Profile,
  ProfileId,
  ProfileSkin,
} from '@/types';

/* =========================================================================
 *  Agenda semanal del perfil.
 *
 *  Esto no es un calendario: es la semana tipo. Se define una vez —de lunes
 *  a domingo, sin fechas— y vale para todas las semanas que vengan, hasta
 *  que se cambie. Por eso la pantalla enseña de primeras la semana entera,
 *  en un horario, y sólo cuando hay que tocarla se pasa a las tarjetas de
 *  día, que es donde se aparta, se copia y se vacía.
 *
 *  Las fechas vienen después: cada rato puede ir atado a un hábito del
 *  registro, y entonces al lado de lo planificado se dice si esta semana se
 *  cumplió, si se quedó corto o si se pasó del máximo. La semana tipo se
 *  queda igual; lo que cambia es lo que se le contrasta.
 *
 *  Rellenarla es la mitad del trabajo, así que la pantalla está montada para
 *  eso: un rato se aparta **en varios días a la vez**, se **repite** más
 *  tarde el mismo día, se **copia** a otros y un día entero se **copia, se
 *  mueve o se intercambia** con otro. Y lo que ya estaba guardado suelto se
 *  **ata de una vez** a los hábitos que hoy existen.
 *
 *  Lo que cambia de un perfil a otro es el rótulo y el adorno —el campo y
 *  Oliver y Benji para los peques, el filete dorado para María, el acero
 *  para Víctor—, nunca la mecánica: es la misma cuadrícula para los seis.
 * ========================================================================= */

/** Las dos maneras de mirar la misma semana. */
type PlanView = 'completa' | 'dias';

const PLAN_VIEWS: readonly PlanView[] = ['completa', 'dias'];

const ZOOMS: Array<{ id: TimetableZoom; label: string; icon: string }> = [
  { id: 'compacta', label: 'Vista compacta', icon: '⊟' },
  { id: 'normal', label: 'Vista normal', icon: '⊡' },
  { id: 'amplia', label: 'Vista amplia', icon: '⊞' },
];

/**
 * Cuántos días se miran a la vez.
 *
 * Siete columnas es la semana; en un móvil son siete rendijas de ochenta
 * píxeles donde no cabe ni el nombre de lo que hay dentro. Con la semana casi
 * llena —la de Víctor pasa de ochenta ratos— hasta en una pantalla grande se
 * agradece poder quedarse en los cinco días de trabajo o en uno solo.
 */
type DayRange = 'semana' | 'laborables' | 'finde' | 'dia';

const RANGES: Array<{ id: DayRange; label: string; days: number[] }> = [
  { id: 'semana', label: '7 días', days: [0, 1, 2, 3, 4, 5, 6] },
  { id: 'laborables', label: 'L–V', days: [0, 1, 2, 3, 4] },
  { id: 'finde', label: 'Finde', days: [5, 6] },
  { id: 'dia', label: 'Un día', days: [] },
];

interface WeekPlannerProps {
  profile: Profile;
  /** Día visible en el panel; de él sale la semana real que se contrasta. */
  date: DateKey;
  store: HabitStore;
  skin: ProfileSkin;
  /**
   * Un rato que llega ya montado desde otra pestaña —de un reto sin hueco,
   * por ejemplo— para abrir el editor encima nada más entrar.
   */
  seed?: PlanBlock | null;
  /** Se avisa en cuanto se ha recogido, para que no vuelva a abrirse. */
  onSeedUsed?: () => void;
}

export function WeekPlanner({
  profile,
  date,
  store,
  skin,
  seed,
  onSeedUsed,
}: WeekPlannerProps) {
  const plan = useWeekPlan(profile.id);
  const notify = useToast();
  const [editing, setEditing] = useState<{ block: PlanBlock; isNew: boolean } | null>(null);
  /**
   * Cómo se mira la semana —entera o día a día, el alto de la hora y cuántos
   * días— se recuerda en este aparato y por perfil: quien abre la agenda de
   * Víctor siempre en «L–V» compacta no tiene que volver a elegirlo cada vez.
   */
  const [view, setView] = useRemembered<PlanView>(
    `agenda:${profile.id}:vista`,
    'completa',
    oneOf(PLAN_VIEWS),
  );
  /** Semanas ajenas ofrecidas para copiar, o `null` con el diálogo cerrado. */
  const [copying, setCopying] = useState<WeekSource[] | null>(null);
  /** Lo que se está copiando o moviendo: un rato, un día, o nada. */
  const [sheet, setSheet] = useState<CopyTarget | null>(null);
  const [zoom, setZoom] = useRemembered<TimetableZoom>(
    `agenda:${profile.id}:zoom`,
    'normal',
    oneOf(ZOOMS.map((item) => item.id)),
  );
  /** Tipo resaltado en la cuadrícula; el resto se apaga. */
  const [focus, setFocus] = useState<PlanKind | null>(null);
  /** Cuántos días se miran, y cuál cuando se mira uno solo. */
  /**
   * `auto` es «nadie ha elegido todavía»: no se guarda nunca —el validador no
   * lo deja pasar—, y mientras siga así manda la pantalla (ver `narrow`).
   */
  const [chosenRange, setRange] = useRemembered<DayRange | 'auto'>(
    `agenda:${profile.id}:dias`,
    'auto',
    oneOf(RANGES.map((item) => item.id)),
  );
  /** Pantalla estrecha o de dedo: ahí, sin elección guardada, se entra por un día. */
  const [narrow, setNarrow] = useState(false);
  const range: DayRange = chosenRange === 'auto' ? (narrow ? 'dia' : 'semana') : chosenRange;
  const [soloDay, setSoloDay] = useState<number | null>(null);
  /** Lo tecleado en el buscador: lo que no lo lleve se apaga en la cuadrícula. */
  const [query, setQuery] = useState('');
  /**
   * Si se enseñan los ratos de los peques que le tocan a este perfil. Se
   * arranca en `true` y se corrige tras montar con lo que se eligiera la
   * última vez: en el servidor no hay `localStorage` y adivinar aquí
   * desajustaría la hidratación.
   */
  const [mirrors, setMirrors] = useState(true);
  /**
   * En un móvil el resumen va plegado a una línea y la chuleta de la
   * cuadrícula detrás de un «?»: entre la cabecera, el resumen, los avisos y
   * los retos, la semana quedaba a dos pantallas de distancia.
   */
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [tip, setTip] = useState(false);

  const kid = profile.kind === 'kid';
  const theme = themeOf(profile.id);
  const dates = useMemo(() => weekKeys(date), [date]);
  const today = weekdayIndex(date);

  /** Los adultos que llevan a los peques: María y Víctor. */
  const takes = takesMirrors(profile.id);

  useEffect(() => {
    if (!takes) return;
    setMirrors(mirrorsShown(profile.id));
  }, [profile.id, takes]);

  /**
   * La semana que se pinta: la propia, más lo de los peques que le toca a
   * este perfil. Lo que se **guarda** sigue siendo `plan` a secas, así que
   * todo lo que edita —copiar un día, vaciar la semana, contar los ratos— ve
   * sólo lo suyo y no puede llevarse por delante la agenda de un peque.
   */
  const shownPlan = useWeekPlanWithMirrors(profile.id, takes && mirrors);
  const borrowed = useMemo(() => shownPlan.blocks.filter(isMirror), [shownPlan.blocks]);
  const withKids = useMemo(() => mirrorShare(borrowed), [borrowed]);

  // El rato que llega de otra pestaña se recoge una vez y se abre su editor.
  useEffect(() => {
    if (!seed) return;
    setEditing({ block: seed, isNew: true });
    setView('completa');
    onSeedUsed?.();
  }, [seed, onSeedUsed, setView]);

  /**
   * En una pantalla estrecha —o de dedo, que para la cuadrícula es lo mismo—
   * la semana entera no se lee, así que se entra por un día. Se decide una
   * sola vez y tras montar —en el servidor no hay ventana—, y sólo vale
   * mientras no haya nada recordado: en cuanto quien mira elige, manda eso.
   */
  useEffect(() => {
    setNarrow(window.matchMedia('(max-width: 639px), (pointer: coarse)').matches);
  }, []);

  const review = useMemo(
    () => reviewWeek(profile, plan, dates, store.entries),
    [profile, plan, dates, store.entries],
  );

  /** Desenlace por rato, para pintarlo en su casilla sin recalcular nada. */
  const checkById = useMemo(
    () => new Map(review.checks.map((check) => [check.block.id, check])),
    [review],
  );

  /** Lo mismo, reducido a la marca, que es lo que cabe en el horario. */
  const statusById = useMemo(
    () => new Map(review.checks.map((check) => [check.block.id, check.status])),
    [review],
  );

  const share = useMemo(() => (kid ? companionShare(plan) : []), [kid, plan]);

  /**
   * Los avisos de la semana, y detrás los que sólo se ven mirando las dos
   * agendas a la vez: la clase de las seis contra la natación de las seis.
   */
  const alerts = useMemo(
    () =>
      borrowed.length > 0
        ? [...mirrorAlerts(plan.blocks, borrowed), ...review.alerts]
        : review.alerts,
    [borrowed, plan.blocks, review.alerts],
  );

  /** En qué se va la semana tipo. Es la lectura que nadie hace de cabeza. */
  const shares = useMemo(() => kindShare(plan.blocks), [plan.blocks]);

  /** Los retos de esta semana, para poder decir cuáles tienen hueco. */
  const challengeWeek = useMemo(
    () => buildChallengeWeek(profile, date, store.entries),
    [profile, date, store.entries],
  );

  /** Los días que se pintan en la cuadrícula. */
  const shownDays = useMemo(() => {
    if (range === 'dia') return [soloDay ?? today];
    return RANGES.find((item) => item.id === range)?.days ?? [0, 1, 2, 3, 4, 5, 6];
  }, [range, soloDay, today]);
  /* ------------------------------------------------------ atajos de teclado */

  /** El buscador de la semana, para llegar a él con «/». */
  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * Los atajos de la agenda: ← y → cambian de día mirando uno solo, N aparta
   * un rato nuevo, 1, 2 y 3 cambian el alto de la hora y / lleva al buscador.
   *
   * Con las mismas cautelas que los del registro: nada mientras se escribe,
   * nada con un diálogo delante —una flecha cambiaría el día de debajo sin
   * que se viera— y nada con Alt, Control o Cmd, que son los de los ratos de
   * la cuadrícula y los del navegador.
   */
  const keysRef = useRef<(event: KeyboardEvent) => void>(() => {});
  keysRef.current = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (target?.closest('[role="dialog"]') || document.querySelector('[role="dialog"]')) return;
    if (editing || sheet || copying || ask) return;

    const grid = shown === 'completa';
    const key = event.key;

    if (grid && range === 'dia' && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      // Con el foco en un rato las flechas solas no hacen nada allí, pero
      // un rato es un botón y no se le quita la tecla a quien la espere.
      if (target?.closest('.rato')) return;
      event.preventDefault();
      const current = soloDay ?? today;
      setSoloDay((current + (key === 'ArrowLeft' ? -1 : 1) + 7) % 7);
      return;
    }

    if (event.shiftKey) return;

    if (key === 'n' || key === 'N') {
      event.preventDefault();
      const day = grid && range === 'dia' ? (soloDay ?? today) : today;
      setEditing({ block: emptyBlock(day), isNew: true });
      return;
    }

    if (grid && defined && (key === '1' || key === '2' || key === '3')) {
      event.preventDefault();
      setZoom(ZOOMS[Number(key) - 1].id);
      return;
    }

    if (grid && defined && key === '/' && searchRef.current) {
      event.preventDefault();
      searchRef.current.focus();
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keysRef.current(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Los dos paneles de campo hablan de partidos: goles, palos y actas. */
  const pitch = skin === 'pitch';
  const heading = headingFont(skin);

  /**
   * Qué ganaría la agenda guardada con las casillas de hoy. Lo lee del
   * almacén y no del `plan` que ya tenemos, pero depende de él a propósito:
   * es lo que hace que el aviso desaparezca en cuanto se ata.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pending = useMemo(() => relinkPreview(profile.id), [plan, profile.id]);

  /** La frase de la semana: la misma todo el día, distinta cada día. */
  const quote = theme.quotes[today % theme.quotes.length] ?? theme.quotes[0];

  /**
   * Sin nada apartado no hay semana que enseñar ni días que tocar: sale la
   * tarjeta de empezar. Lo de los peques, si lo hay, sí se pinta en el
   * horario, porque la semana de María no está en blanco mientras lleve la
   * natación de los dos.
   */
  const defined = plan.blocks.length > 0;
  const shown: PlanView = defined ? view : 'completa';
  const anything = defined || borrowed.length > 0;

  /* ------------------------------------------------------------ acciones */

  /** Deshacer significa devolver la agenda tal y como estaba. */
  const undoTo = (blocks: PlanBlock[]) => () => {
    updatePlan(profile.id, blocks);
    notify({ message: 'Como estaba.', icon: '↩️' });
  };

  /**
   * Lo prestado no se toca desde aquí. El rato es de la semana del peque —de
   * ahí sale, y ahí sigue mandando quién está con él—, así que en vez de
   * dejar que se mueva y que las dos agendas digan cosas distintas, se dice
   * de quién es y dónde se cambia.
   */
  const borrowedBlock = (block: PlanBlock): boolean => {
    if (!isMirror(block)) return false;
    const { name, companion, kids } = block.mirror!;
    notify({
      message: `«${block.title}» es de ${name} (${COMPANIONS[companion].label.toLowerCase()}). Se cambia ${
        kids.length > 1 ? 'en la semana de cada uno' : `en la semana de ${name}`
      }.`,
      icon: block.mirror!.avatar,
    });
    return true;
  };

  /* ------------------------------------------------------- autoguardado */

  /**
   * El rato abierto se va guardando solo mientras se escribe.
   *
   * Para que eso no sea un lío hay que acordarse de dos cosas: cómo estaba la
   * agenda **antes** de abrir el editor —para poder deshacerlo entero de un
   * toque— y qué ratos ha creado el propio autoguardado, que son los que hay
   * que barrer y volver a poner en cada repaso mientras el rato siga siendo
   * nuevo, porque los días marcados pueden cambiar sobre la marcha.
   */
  const baseline = useRef<PlanBlock[] | null>(null);
  const autoIds = useRef<string[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /**
   * Si el autoguardado ha escrito algo desde que se abrió el editor. Va en
   * una caja y no en `savedAt` porque al cerrar hay que saberlo en el acto,
   * sin esperar a la siguiente pintada.
   */
  const dirty = useRef(false);
  /** El «guarda ya lo pendiente» del editor abierto. */
  const flushEditor = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!editing) return;
    baseline.current = planOf(profile.id).blocks;
    autoIds.current = [];
    dirty.current = false;
    setSavedAt(null);
    // Se rearma con cada rato que se abre, no con cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.block.id, editing?.isNew, profile.id]);

  const autoSave = (block: PlanBlock, days: number[]) => {
    if (!editing) return;

    if (editing.isNew) {
      // Se rehacen: si se marca un día más, el rato tiene que aparecer en él.
      const rest = planOf(profile.id).blocks.filter((item) => !autoIds.current.includes(item.id));
      const wanted = spreadBlock(block, days).map((item) => withClockAmount(profile.id, item));
      autoIds.current = wanted.map((item) => item.id);
      updatePlan(profile.id, [...rest, ...wanted]);
    } else {
      savePlanBlock(profile.id, block);
    }

    dirty.current = true;
    setSavedAt(Date.now());
  };

  /**
   * La semana como la ve el editor: la de verdad menos los ratos que el
   * autoguardado ha ido dejando de este mismo rato. Se recalcula con cada
   * cambio de la agenda, que es justo cuando cambia esa lista.
   */
  const editorPlan = useMemo(
    () =>
      autoIds.current.length === 0
        ? plan
        : { ...plan, blocks: plan.blocks.filter((item) => !autoIds.current.includes(item.id)) },
    [plan],
  );

  /** Deja la agenda como estaba al abrir el editor, y cierra. */
  const revert = () => {
    if (baseline.current) updatePlan(profile.id, baseline.current);
    autoIds.current = [];
    dirty.current = false;
    setEditing(null);
    notify({ message: 'Como estaba.', icon: '↩️' });
  };

  /* ------------------------------------------------- réplica al hermano */

  /** El hermano cuya semana va casi siempre a la par de ésta. */
  const twin = twinOf(profile.id);
  const twinLabel = twin ? twinName(twin) : 'su hermano';
  /** El cambio que está esperando un sí o un no. */
  const [ask, setAsk] = useState<{ change: PlanChange; preview: ReplicaPreview } | null>(null);
  /** Ratos hermanados, para poder decirlo en la cabecera. Se lee tras montar. */
  const [twinned, setTwinned] = useState(0);
  /**
   * Qué se hace al guardar. Se arranca en «preguntar» y se corrige tras
   * montar, como todo lo que vive en `localStorage`: en el servidor no lo hay
   * y adivinarlo aquí desajustaría la hidratación.
   */
  const [mode, setMode] = useState<ReplicaMode>('preguntar');

  useEffect(() => {
    if (!twin) return;
    setMode(replicaMode(profile.id));
    const read = () => setTwinned(twinCount(profile.id));
    read();
    return subscribePlans(read);
  }, [profile.id, twin]);

  /** Lo que se dice después de replicar, con su deshacer. */
  const toldReplica = (result: ReplicaResult) => {
    const bits: string[] = [];
    if (result.added > 0) bits.push(result.added === 1 ? '1 nuevo' : `${result.added} nuevos`);
    if (result.changed > 0) {
      bits.push(result.changed === 1 ? '1 igualado' : `${result.changed} igualados`);
    }
    if (result.removed > 0) {
      bits.push(result.removed === 1 ? '1 quitado' : `${result.removed} quitados`);
    }

    notify({
      message: `En la semana de ${twinLabel}: ${bits.join(', ')}.`,
      icon: '👯',
      action: {
        label: 'Deshacer',
        onClick: () => {
          if (twin) updatePlan(twin, result.before);
          notify({ message: `La semana de ${twinLabel}, como estaba.`, icon: '↩️' });
        },
      },
    });
  };

  const applyReplica = (change: PlanChange) => {
    if (!twin) return;
    setAsk(null);
    toldReplica(replicate(profile.id, twin, change));
  };

  /**
   * El cambio que se acaba de hacer aquí, ofrecido para la semana del otro.
   *
   * Se llama **después** de guardar, con lo que ha quedado: preguntar antes
   * obligaría a describir algo que todavía puede cambiar de opinión. Y no se
   * pregunta por lo que allí no cambiaría nada.
   */
  const propagate = (change: PlanChange) => {
    if (!twin) return;

    const mode = replicaMode(profile.id);
    if (mode === 'nunca') return;

    const preview = previewReplica(profile.id, twin, change);
    if (preview.empty) return;

    if (mode === 'siempre') {
      toldReplica(replicate(profile.id, twin, change));
      return;
    }

    setAsk({ change, preview });
  };

  /** Hermanar las dos semanas de arriba abajo. */
  const syncTwin = () => {
    if (!twin) return;
    const result = syncWeeks(profile.id, twin);
    if (result.empty) {
      notify({ message: `La semana de ${twinLabel} ya está igual que ésta.`, icon: '👯' });
      return;
    }
    toldReplica(result);
  };

  /** Un rato nuevo puede salir en varios días de una sentada. */
  const save = (block: PlanBlock, days: number[]) => {
    const isNew = editing?.isNew ?? false;
    const before = baseline.current ?? planOf(profile.id).blocks;
    // Lo que el autoguardado hubiera dejado puesto se retira: manda lo que se
    // acaba de confirmar, y si no, el rato saldría dos veces.
    const auto = autoIds.current;
    autoIds.current = [];
    dirty.current = false;
    setEditing(null);

    if (!isNew) {
      savePlanBlock(profile.id, block);
      notify({ message: 'Cambiado.', icon: '🗓️' });
      propagate({ upsert: [block], what: `«${block.title}»` });
      return;
    }

    if (auto.length > 0) {
      updatePlan(
        profile.id,
        planOf(profile.id).blocks.filter((item) => !auto.includes(item.id)),
      );
    }

    const wanted = spreadBlock(block, days);
    const added = addPlanBlocks(profile.id, wanted);

    notify({
      message:
        added === 0
          ? `La semana está llena: quita algo antes de apartar «${block.title}».`
          : added === 1
            ? `«${block.title}», apartado el ${DAY_NAMES[days[0] ?? block.day].toLowerCase()}.`
            : `«${block.title}», apartado en ${added} días.`,
      icon: added === 0 ? '🚧' : '🗓️',
      action: added > 0 ? { label: 'Deshacer', onClick: undoTo(before) } : undefined,
    });

    if (added > 0) {
      // Los que de verdad han entrado, ya con su identificador definitivo.
      const saved = planOf(profile.id).blocks.filter((item) =>
        wanted.some((candidate) => candidate.id === item.id),
      );
      propagate({
        upsert: saved,
        what: added === 1 ? `«${block.title}»` : `«${block.title}» en ${added} días`,
      });
    }
  };

  const remove = (block: PlanBlock) => {
    if (borrowedBlock(block)) return;
    const before = planOf(profile.id).blocks;
    removePlanBlock(profile.id, block.id);
    autoIds.current = [];
    dirty.current = false;
    setEditing(null);
    notify({
      message: `«${block.title}» fuera de la semana.`,
      icon: '🗑️',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
    propagate({ remove: [block], what: `quitar «${block.title}»` });
  };

  /**
   * Cerrar la hoja sin darle a «Listo»: la X, picar fuera, Escape.
   *
   * Con el autoguardado eso ya no pierde nada, pero se quedaba a medias: lo
   * último tecleado se iba con el reloj y la pregunta de la semana del
   * hermano sólo salía con «Listo». Ahora se escribe lo pendiente, se dice
   * «Guardado» con su deshacer —que devuelve la agenda a como estaba al
   * abrir— y se ofrece al hermano lo que ha quedado, igual que al guardar.
   */
  const closeEditor = () => {
    const open = editing;
    flushEditor.current?.();

    if (open && dirty.current) {
      const before = baseline.current;
      const now = planOf(profile.id).blocks;
      const saved = open.isNew
        ? now.filter((item) => autoIds.current.includes(item.id))
        : now.filter((item) => item.id === open.block.id);
      const title = saved[0]?.title || open.block.title || 'El rato';

      notify({
        message: 'Guardado.',
        icon: '💾',
        action: before ? { label: 'Deshacer', onClick: undoTo(before) } : undefined,
      });

      if (saved.length > 0) {
        propagate({
          upsert: saved,
          what: saved.length === 1 ? `«${title}»` : `«${title}» en ${saved.length} días`,
        });
      }
    }

    autoIds.current = [];
    dirty.current = false;
    setEditing(null);
  };

  /**
   * Arrastrar. El mismo rato, otro día u otra hora, sin abrir nada. Se acusa
   * con «deshacer» porque un gesto se falla más que un formulario: el dedo
   * resbala un cuarto de hora y hay que poder volver atrás sin pensar.
   */
  const move = (block: PlanBlock, day: number, start: string) => {
    if (borrowedBlock(block)) return;
    if (block.day === day && block.start === start) return;
    const before = planOf(profile.id).blocks;
    const title = block.title || 'El rato';
    moveBlockTo(profile.id, block, day, start);

    notify({
      message:
        block.day === day
          ? `«${title}», a las ${start}.`
          : `«${title}», al ${DAY_NAMES[day].toLowerCase()} a las ${start}.`,
      icon: '✋',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });

    // Arrastrar también es cambiar la semana, y en la del hermano el entreno
    // suele ser el mismo entreno: se ofrece igual que al guardar.
    propagate({ upsert: [{ ...block, day, start }], what: `mover «${title}»` });
  };

  /**
   * Estirar el rato: por abajo dura más, por arriba empieza antes.
   *
   * Y si está atado a un hábito que se mide en tiempo, lo previsto va detrás
   * solo. Se dice en el aviso a propósito: cambiar la duración cambia también
   * contra qué se comprueba el hábito, y eso no puede pasar en silencio.
   */
  const resize = (block: PlanBlock, duration: number, start?: string) => {
    if (borrowedBlock(block)) return;
    const at = start ?? block.start;
    if (duration === block.duration && at === block.start) return;

    const before = planOf(profile.id).blocks;
    const tied = clockAmountChange(profile.id, block, duration);
    savePlanBlock(profile.id, { ...block, duration, start: at });

    notify({
      message: `«${block.title || 'El rato'}»: ${at} – ${timeOf(
        minutesOf(at) + duration,
      )}, ${durationLabel(duration)}.${tied ? ` Lo previsto, ${tied.label}.` : ''}`,
      icon: '↕️',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });

    propagate({
      upsert: [{ ...block, duration, start: at }],
      what: `la duración de «${block.title || 'el rato'}»`,
    });
  };

  /** Una copia donde se suelte: arrastrando con Alt o con el botón del rato. */
  const duplicate = (block: PlanBlock, day: number, start: string) => {
    if (borrowedBlock(block)) return;
    const before = planOf(profile.id).blocks;
    const copy = duplicateBlock(profile.id, { ...block, day }, start);
    const title = block.title || 'El rato';

    notify({
      message: copy
        ? day === block.day
          ? `«${title}» otra vez a las ${start}.`
          : `«${title}» copiado al ${DAY_NAMES[day].toLowerCase()} a las ${start}.`
        : 'La semana está llena: no cabe otra copia.',
      icon: copy ? '⧉' : '🚧',
      action: copy ? { label: 'Deshacer', onClick: undoTo(before) } : undefined,
    });
  };

  const clearDay = (day: number) => {
    const before = planOf(profile.id).blocks;
    const removed = clearDayPlan(profile.id, day);
    if (removed === 0) return;

    notify({
      message: `${DAY_NAMES[day]} vaciado.`,
      icon: '🧹',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
  };

  /** Copiar, mover, repetir o intercambiar: todo sale de la misma hoja. */
  const applyCopy = (request: CopyRequest) => {
    const before = planOf(profile.id).blocks;
    const word = theme.blockWord;
    const words = theme.blockWords;
    let message = '';
    let done = true;

    if (request.kind === 'block') {
      const title = request.block.title || 'El rato';

      if (request.action === 'duplicar') {
        const copy = duplicateBlock(profile.id, request.block, request.start);
        done = copy !== null;
        message = copy
          ? `«${title}» otra vez a las ${copy.start}.`
          : 'La semana está llena: no cabe otra copia.';
      } else if (request.action === 'mover') {
        moveBlockTo(profile.id, request.block, request.day);
        message = `«${title}» movido al ${DAY_NAMES[request.day].toLowerCase()}.`;
      } else {
        const result = copyBlockTo(profile.id, request.block, request.days);
        done = result.copied > 0;
        message = done
          ? `«${title}» copiado a ${result.copied} ${result.copied === 1 ? 'día' : 'días'}.`
          : 'La semana está llena: no cabe ninguna copia más.';
      }
    } else if (request.action === 'intercambiar') {
      const moved = swapDays(profile.id, request.from, request.to);
      done = moved > 0;
      message = done
        ? `${DAY_NAMES[request.from]} y ${DAY_NAMES[request.to].toLowerCase()} cambiados de sitio.`
        : 'Los dos días están vacíos: no hay nada que intercambiar.';
    } else if (request.action === 'mover') {
      const result = moveDayTo(profile.id, request.from, request.to, request.mode);
      done = result.copied > 0;
      message = done
        ? `${DAY_NAMES[request.from]} movido al ${DAY_NAMES[request.to].toLowerCase()}: ${result.copied} ${result.copied === 1 ? word : words}.`
        : `${DAY_NAMES[request.from]} no tiene nada que mover.`;
    } else {
      const result = copyDayTo(profile.id, request.from, request.days, request.mode);
      done = result.copied > 0;
      message = done
        ? `${result.copied} ${result.copied === 1 ? word : words} de ${DAY_NAMES[request.from].toLowerCase()} en ${request.days.length} ${request.days.length === 1 ? 'día' : 'días'}.${result.dropped > 0 ? ` ${result.dropped} no caben.` : ''}`
        : `${DAY_NAMES[request.from]} no tiene nada que copiar.`;
    }

    setSheet(null);
    notify({
      message,
      icon: done ? '⧉' : '🚧',
      action: done ? { label: 'Deshacer', onClick: undoTo(before) } : undefined,
    });
  };

  /** Ata de una vez los ratos que se guardaron antes de tener casilla. */
  const relink = () => {
    const before = planOf(profile.id).blocks;
    const result = relinkPlan(profile.id);

    if (result.linked === 0 && result.filled === 0) {
      notify({ message: 'No hay nada más que atar por el nombre.', icon: '🤷' });
      return;
    }

    notify({
      message:
        result.linked > 0
          ? `${result.linked} ${result.linked === 1 ? 'rato atado' : 'ratos atados'} a su hábito${result.filled > 0 ? ` y ${result.filled} con la cantidad puesta` : ''}.`
          : `${result.filled} ${result.filled === 1 ? 'rato' : 'ratos'} con la cantidad prevista puesta.`,
      icon: '🔗',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
  };

  const useSample = () => {
    const before = planOf(profile.id).blocks;
    updatePlan(profile.id, sampleWeek(profile.id));
    setView('completa');
    notify({
      message: 'Semana de ejemplo puesta, ya atada a los hábitos. Edítala a tu gusto.',
      icon: '✨',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
  };

  /**
   * De quién copiar. Se mira al picar y no al pintar: en el servidor no hay
   * agendas, y adivinar aquí cuáles existen desajustaría la hidratación.
   */
  const openCopy = () => {
    const sources = copyableWeeks(profile.id);

    if (sources.length === 0) {
      notify({ message: 'Nadie más tiene todavía una semana que copiar.', icon: '🤷' });
      return;
    }

    setCopying(sources);
  };

  /** La semana de otro, traída entera y lista para matizarla aquí. */
  const copyWeek = (from: ProfileId) => {
    const before = planOf(profile.id).blocks;
    const { copied, unlinked } = copyWeekFrom(from, profile.id);
    const name = PROFILES.find((item) => item.id === from)?.name ?? 'otro perfil';

    setCopying(null);
    setView('completa');

    notify({
      message:
        unlinked > 0
          ? `Semana de ${name} copiada: ${copied} ratos, ${unlinked} sin hábito atado. Cámbiala a tu gusto.`
          : `Semana de ${name} copiada: ${copied} ratos. Cámbiala a tu gusto.`,
      icon: '⧉',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
  };

  const clearWeek = () => {
    const before = planOf(profile.id).blocks;
    updatePlan(profile.id, []);
    notify({
      message: 'Semana vaciada.',
      icon: '🧹',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: undoTo(before) },
    });
  };

  /* ------------------------------------------------------------- pintura */

  const kept = review.kept;
  const missed = review.missed;
  const judged = kept + missed;
  const filled = daysFilled(plan);
  const total = plannedMinutes(plan.blocks);

  return (
    <div className="space-y-4">
      {/* Cabecera: cada casa, la suya */}
      <PlannerHeader
        profile={profile}
        title={theme.title}
        icon={theme.icon}
        kicker={theme.kicker}
        ornament={theme.ornament}
        quote={quote}
        score={{ kept: review.kept, missed: review.missed }}
      />

      {/* Sin nada apartado todavía: en vez de siete tarjetas vacías y los
          botones al final de la página, una sola tarjeta que dice qué es esto
          y por dónde se empieza. */}
      {!defined && (
        <section
          className={`${kid ? 'card-kid' : 'card'} relative overflow-hidden p-4 sm:p-6`}
          aria-label="Empezar la semana tipo"
        >
          {/* El halo del color del perfil, para que el vacío no parezca un
              error sino una página por estrenar. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-tint-halo blur-2xl"
          />

          <div className="relative flex items-start gap-3">
            <span
              aria-hidden
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-2xl"
            >
              {theme.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] t-3">Por estrenar</p>
              <h3 className={`font-display text-lg font-black leading-tight t-1 ${heading}`}>
                Todavía no hay nada apartado
              </h3>
              <p className="mt-1 text-[13px] leading-snug t-2">
                Se define una vez, de lunes a domingo, y vale para todas las semanas hasta que se
                cambie.
              </p>
            </div>
          </div>

          {/* Lo más corto, a lo grande; las otras dos maneras, al lado. */}
          <div className="relative mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-start">
            <button
              type="button"
              onClick={useSample}
              className="btn-primary col-span-2 px-4 py-2.5 text-sm sm:col-span-1"
            >
              ✨ Empezar con una de ejemplo
            </button>
            <button
              type="button"
              onClick={openCopy}
              className="btn-ghost px-3 text-xs sm:text-sm"
            >
              <span aria-hidden>⧉</span> Copiar <span className="sr-only">la semana </span>de otro
            </button>
            <button
              type="button"
              onClick={() => setEditing({ block: emptyBlock(today), isNew: true })}
              className="btn-ghost px-3 text-xs sm:text-sm"
            >
              <span aria-hidden>＋</span> <span className="sr-only">Añadir el </span>Primer rato
            </button>
          </div>
          <p className="relative mt-2 hidden text-[11px] t-3 sm:block">
            O pulsa <kbd className="font-mono font-bold">N</kbd> para apartar un rato desde
            cualquier sitio de la agenda.
          </p>
        </section>
      )}

      {/* Lo que la semana tipo dice de sí misma */}
      {defined && (
        <section className="card p-3 sm:p-4" aria-label="Resumen de la semana tipo">
          {/* En un móvil, plegado: una línea con las cifras y el resto al
              tocarla. Con pantalla se ve entero y esta línea no existe. */}
          <button
            type="button"
            onClick={() => setSummaryOpen((value) => !value)}
            aria-expanded={summaryOpen}
            className="flex min-h-9 w-full items-center gap-2 text-left sm:hidden"
          >
            <span className="min-w-0 flex-1 truncate text-xs tabular-nums t-2">
              <strong className="t-1">{review.blocks}</strong>{' '}
              {review.blocks === 1 ? theme.blockWord : theme.blockWords} ·{' '}
              <strong className="t-1">{filled}/7</strong> días ·{' '}
              <strong className="t-1">{review.linked}</strong>{' '}
              {review.linked === 1 ? 'atado' : 'atados'} ·{' '}
              <strong className="t-1">
                {judged > 0 ? `${Math.round((kept / judged) * 100)} %` : durationLabel(total)}
              </strong>
            </span>
            <span
              aria-hidden
              className={`shrink-0 text-xs t-3 transition-transform ${summaryOpen ? 'rotate-180' : ''}`}
            >
              ▾
            </span>
          </button>

          <div className={`${summaryOpen ? 'mt-3' : 'hidden'} sm:mt-0 sm:block`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile
                value={`${review.blocks}`}
                label={review.blocks === 1 ? theme.blockWord : theme.blockWords}
                heading={heading}
              />
              <Tile value={`${filled}/7`} label="días con algo" heading={heading} />
              <Tile
                value={`${review.linked}`}
                label={review.linked === 1 ? 'atado a un hábito' : 'atados a un hábito'}
                heading={heading}
              />
              <Tile
                value={judged > 0 ? `${Math.round((kept / judged) * 100)} %` : durationLabel(total)}
                label={judged > 0 ? 'de lo vivido, cumplido' : 'apartados en la semana'}
                heading={heading}
              />
            </div>

            {/* Y aquí, y sólo aquí, entran las fechas: la semana tipo contra la
                semana que se está viviendo. */}
            {judged > 0 && (
              <div className="mt-3 border-t pt-3 hairline">
                <p className="text-xs t-3">
                  Contra la semana del{' '}
                  <strong className="tabular-nums t-2">{formatShort(dates[0])}</strong> al{' '}
                  <strong className="tabular-nums t-2">{formatShort(dates[6])}</strong>: ✓ {kept}{' '}
                  cumplidos · ✕ {missed} fallidos.
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full track">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${Math.round((kept / judged) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* En qué se va la semana: la barra que contesta «¿dónde está mi
                tiempo?» sin tener que sumar ochenta ratos a mano. */}
            {shares.length > 1 && (
              <div className="mt-3 border-t pt-3 hairline">
                <div className="flex h-2.5 w-full overflow-hidden rounded-full track">
                  {shares.map((item) => (
                    <span
                      key={item.kind}
                      title={`${PLAN_KINDS[item.kind].label}: ${durationLabel(item.minutes)}`}
                      className="h-full"
                      style={{
                      width: `${(item.minutes / Math.max(1, total)) * 100}%`,
                      backgroundImage: gradientOf(kindPalette(item.kind), '90deg'),
                    }}
                    />
                  ))}
                </div>
                {/* Y la leyenda es el filtro: picar en «Trabajo» apaga todo lo
                    demás en la cuadrícula. En una semana de ochenta ratos es la
                    única forma de mirar sólo una cosa. */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {focus !== null && (
                    <button
                      type="button"
                      onClick={() => setFocus(null)}
                      className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold t-1"
                    >
                      ✕ Ver todo
                    </button>
                  )}
                  {shares.map((item) => (
                    <button
                      key={item.kind}
                      type="button"
                      onClick={() => setFocus(focus === item.kind ? null : item.kind)}
                      aria-pressed={focus === item.kind}
                      title={`Resaltar sólo ${PLAN_KINDS[item.kind].label.toLowerCase()}`}
                      className={`inline-flex items-center gap-1 rounded-full px-1.5 text-[11px] transition
                        ${focus === item.kind ? 'bg-accent-soft font-semibold t-1' : 't-3 hover-soft'}`}
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundImage: gradientOf(kindPalette(item.kind)) }}
                      />
                      {PLAN_KINDS[item.kind].label}
                      <span className="tabular-nums opacity-70">{durationLabel(item.minutes)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Lo que a este perfil le toca de los peques. Sale de la semana de
                Leo y de la de Hugo: lo que allí lleva «con mamá» —o «con los
                dos»— aparece aquí, y aquí es donde se ve cuánto es.

                Se reparte por **con quién se está** y no por peque: la natación
                de los dos hermanos es una sola tarde, así que tiene su fila y no
                se cuenta entera en la de cada uno. Con eso, las filas suman el
                rato de verdad apartado, que es lo que se lee al lado. */}
            {takes && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3 hairline">
                <span className="text-xs font-bold uppercase tracking-wide t-3">Con los peques:</span>

                {withKids.length > 0 ? (
                  <>
                    {withKids.map((item) => (
                      <span
                        key={item.id}
                        className="chip-soft"
                        title={`${item.count} ${item.count === 1 ? 'rato' : 'ratos'} con ${item.name} esta semana`}
                      >
                        <span
                          aria-hidden
                          className="-ml-0.5 h-3.5 w-1 shrink-0 rounded-full"
                          style={{ backgroundImage: mirrorRail(item.kids) }}
                        />
                        <span aria-hidden>{item.avatar}</span>
                        {item.name}
                        <span className="tabular-nums opacity-70">{durationLabel(item.minutes)}</span>
                      </span>
                    ))}
                    {withKids.length > 1 && (
                      <span className="text-[11px] tabular-nums t-3">
                        · {durationLabel(mirrorMinutes(borrowed))} en total
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-xs t-3">
                    {mirrors
                      ? 'Nada por ahora. En la semana de Leo y de Hugo, marca quién está con ellos en cada rato y saldrá aquí.'
                      : 'Escondido ahora mismo.'}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const next = !mirrors;
                    setMirrors(next);
                    showMirrors(profile.id, next);
                    notify({
                      message: next
                        ? 'Lo de los peques, en tu semana.'
                        : 'Sólo tus ratos. Vuelve a encenderlo cuando quieras.',
                      icon: next ? '👨‍👩‍👦' : '🙈',
                    });
                  }}
                  aria-pressed={mirrors}
                  title={
                    mirrors
                      ? 'Esconder los ratos de los peques que te tocan'
                      : 'Ver los ratos de los peques que te tocan'
                  }
                  className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition
                    ${mirrors ? 'bg-accent-soft t-1' : 'surf-2 t-3 hover-soft'}`}
                >
                  {mirrors ? '👁️ Se ven' : '🙈 Escondidos'}
                </button>
              </div>
            )}

            {/* Con quién están los peques en la semana tipo */}
            {kid && share.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3 hairline">
                <span className="text-xs font-bold uppercase tracking-wide t-3">Con quién:</span>
                {share.map(({ companion, minutes }) => (
                  <span key={companion} className="chip-soft">
                    <span aria-hidden>{COMPANIONS[companion].icon}</span>
                    {COMPANIONS[companion].short}
                    <span className="tabular-nums opacity-70">{durationLabel(minutes)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Lo guardado suelto, atable de un toque */}
      {(pending.linked > 0 || pending.filled > 0) && (
        <section className="card flex flex-wrap items-center gap-x-3 gap-y-2 border-accent p-3">
          <span aria-hidden className="text-lg">
            🔗
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold t-1">
              {pending.linked > 0
                ? `${pending.linked} ${pending.linked === 1 ? 'rato puede atarse' : 'ratos pueden atarse'} a un hábito`
                : `${pending.filled} ${pending.filled === 1 ? 'rato' : 'ratos'} sin la cantidad prevista`}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed t-2">
              Se guardaron antes de que existieran esas casillas del registro. Atándolos, la semana
              podrá decir si se cumplen.
            </p>
          </div>
          <button type="button" onClick={relink} className="btn-primary px-3 py-1.5 text-xs">
            Atarlos ahora
          </button>
        </section>
      )}

      <PlanAlerts
        alerts={alerts}
        skin={skin}
        onDay={(day) => {
          setView('completa');
          setRange('dia');
          setSoloDay(day);
        }}
      />

      {/* Los retos de la semana contra la semana tipo: cuáles tienen su rato
          apartado y cuáles se están pidiendo a base de acordarse. */}
      <PlanChallengesCard
        profileId={profile.id}
        plan={plan}
        challenges={challengeWeek.challenges}
        skin={skin}
        onReserve={(block) => setEditing({ block, isNew: true })}
        onShow={(block) => {
          setView('completa');
          setRange('dia');
          setSoloDay(block.day);
        }}
      />

      {/* Cómo mirarla: entera o día a día */}
      {defined && (
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex gap-1 rounded-full p-1 surf-2"
            role="group"
            aria-label="Cómo ver la semana"
          >
            {(
              [
                { id: 'completa', label: '🗓️ La semana entera' },
                { id: 'dias', label: '✏️ Día a día' },
              ] as Array<{ id: PlanView; label: string }>
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={shown === option.id}
                onClick={() => setView(option.id)}
                className={`min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold transition
                  ${shown === option.id ? 'bg-accent t-on-accent' : 't-2 hover-soft'}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {shown === 'completa' && (
            <div
              className="flex gap-1 rounded-full p-1 surf-2"
              role="group"
              aria-label="Alto de la cuadrícula"
            >
              {ZOOMS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setZoom(option.id)}
                  aria-pressed={zoom === option.id}
                  aria-label={option.label}
                  title={option.label}
                  className={`min-h-9 rounded-full px-2.5 py-1.5 text-xs font-semibold transition
                    ${zoom === option.id ? 'bg-accent t-on-accent' : 't-2 hover-soft'}`}
                >
                  {option.icon}
                </button>
              ))}
            </div>
          )}

          {shown === 'completa' && (
            <div
              className="flex gap-1 rounded-full p-1 surf-2"
              role="group"
              aria-label="Cuántos días se miran"
            >
              {RANGES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setRange(option.id)}
                  aria-pressed={range === option.id}
                  className={`min-h-9 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition
                    ${range === option.id ? 'bg-accent t-on-accent' : 't-2 hover-soft'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {shown === 'completa' && (
            <label className="ml-auto min-w-0 flex-1 sm:max-w-[190px]">
              <span className="sr-only">Buscar un rato en la semana</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && query) {
                    event.preventDefault();
                    setQuery('');
                  }
                }}
                placeholder="🔎 Buscar en la semana…"
                className="field w-full py-1.5 text-xs"
              />
            </label>
          )}

          {/* La chuleta. En un móvil son sesenta palabras entre los botones y
              la semana, así que va detrás de un «?» y se quita tocándolo otra
              vez; con pantalla se lee del tirón, como siempre. */}
          <button
            type="button"
            onClick={() => setTip((value) => !value)}
            aria-expanded={tip}
            aria-label={tip ? 'Cerrar la ayuda' : 'Cómo se usa'}
            className="btn-ghost h-9 w-9 min-h-9 rounded-full p-0 text-xs font-bold sm:hidden"
          >
            {tip ? '✕' : '?'}
          </button>

          <p className={`w-full text-[11px] leading-relaxed t-3 ${tip ? '' : 'hidden sm:block'}`}>
            {shown === 'completa'
              ? 'Pica en un rato para cambiarlo y arrástralo para moverlo. Estíralo por arriba o por abajo para cambiar lo que dura —y con ello lo que se pretende dedicar al hábito—, arrástralo con Alt para copiarlo, y en su esquina tienes ⧉ para repetirlo y ✕ para quitarlo sin abrir nada.'
              : 'Aquí se aparta, se copia, se mueve y se vacía.'}
          </p>
        </div>
      )}

      {/* Con un solo día en pantalla hay que poder elegir cuál */}
      {anything && shown === 'completa' && range === 'dia' && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Qué día">
          {[0, 1, 2, 3, 4, 5, 6].map((day) => {
            // Lo que sale en la cuadrícula, prestado de los peques incluido:
            // si no, el chip decía «3» y al entrar en el día había cinco.
            const count = blocksOfDay(shownPlan, day).length;
            const active = (soloDay ?? today) === day;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSoloDay(day)}
                aria-pressed={active}
                className={`btn min-h-9 border px-2.5 py-1 text-[11px] font-semibold
                  ${active ? 'bg-accent t-on-accent border-accent' : 'hairline surf-1 t-2 hover-soft'}
                  ${day === today && !active ? 'border-accent' : ''}`}
              >
                {DAY_SHORT[day]}
                {count > 0 && <span className="ml-1 tabular-nums opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* La semana tipo, entera */}
      {anything && shown === 'completa' && (
        <section className={`${kid ? 'card-kid' : 'card'} p-3`} aria-label="La semana tipo entera">
          <WeekTimetable
            plan={shownPlan}
            statusById={judged > 0 ? statusById : undefined}
            today={today}
            days={shownDays}
            heading={heading}
            zoom={zoom}
            ornament={theme.ornament}
            focus={focus}
            query={query}
            onSelect={(block) => {
              if (borrowedBlock(block)) return;
              setEditing({ block, isNew: false });
            }}
            onAdd={(day, start) => setEditing({ block: emptyBlock(day, start), isNew: true })}
            onDay={(day) => setSheet({ kind: 'day', day })}
            onMove={move}
            onResize={resize}
            onDuplicate={duplicate}
            onDelete={remove}
          />

          <p className="mt-2 hidden text-center text-[11px] t-3 sm:block">
            Con el teclado: <kbd className="font-mono font-bold">Tab</kbd> recorre los ratos ·{' '}
            <kbd className="font-mono font-bold">Alt</kbd> +{' '}
            <kbd className="font-mono font-bold">←→</kbd> cambia de día ·{' '}
            <kbd className="font-mono font-bold">Alt</kbd> +{' '}
            <kbd className="font-mono font-bold">↑↓</kbd> corre la hora ·{' '}
            <kbd className="font-mono font-bold">Alt</kbd> +{' '}
            <kbd className="font-mono font-bold">Mayús</kbd> +{' '}
            <kbd className="font-mono font-bold">↑↓</kbd> alarga o acorta ·{' '}
            <kbd className="font-mono font-bold">Alt</kbd> +{' '}
            <kbd className="font-mono font-bold">D</kbd> repite ·{' '}
            <kbd className="font-mono font-bold">Supr</kbd> quita
            <br />
            <kbd className="font-mono font-bold">N</kbd> aparta un rato ·{' '}
            <kbd className="font-mono font-bold">1</kbd>{' '}
            <kbd className="font-mono font-bold">2</kbd>{' '}
            <kbd className="font-mono font-bold">3</kbd> cambian el alto ·{' '}
            <kbd className="font-mono font-bold">/</kbd> busca
            {range === 'dia' && (
              <>
                {' '}
                · <kbd className="font-mono font-bold">←→</kbd> cambia de día
              </>
            )}
          </p>
        </section>
      )}

      {/* Los siete días, para tocarlos */}
      {defined && shown === 'dias' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[0, 1, 2, 3, 4, 5, 6].map((day) => {
            const blocks = blocksOfDay(plan, day);
            const hoy = day === today;
            const dayBorrowed = borrowed.filter((block) => block.day === day);
            const dayKept = blocks.filter(
              (block) => checkById.get(block.id)?.status === 'cumplido',
            ).length;
            const dayJudged = blocks.filter((block) => {
              const status = checkById.get(block.id)?.status;
              return status !== undefined && !SILENT.has(status);
            }).length;

            return (
              <article
                key={day}
                className={`${kid ? 'card-kid' : 'card'} flex flex-col p-3
                  ${hoy ? 'border-accent' : ''}`}
                aria-label={DAY_NAMES[day]}
              >
                <header className="mb-2 flex items-baseline gap-2">
                  <h3 className={`text-sm font-bold t-1 ${heading}`}>
                    <span className="xl:hidden">{DAY_NAMES[day]}</span>
                    <span className="hidden xl:inline">{DAY_SHORT[day]}</span>
                  </h3>

                  {hoy && (
                    <span className="chip-accent px-2 py-0.5 text-[11px] uppercase">Hoy</span>
                  )}

                  <span className="ml-auto text-[11px] tabular-nums t-3">
                    {dayJudged > 0
                      ? `${dayKept}/${dayJudged} ✓`
                      : blocks.length > 0
                        ? durationLabel(plannedMinutes(blocks))
                        : ''}
                  </span>
                </header>

                {blocks.length === 0 ? (
                  <p className="py-2 text-xs t-3">Sin nada apartado.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {blocks.map((block) => {
                      const check = checkById.get(block.id);

                      return (
                        <li key={block.id} className="flex items-stretch gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing({ block, isNew: false })}
                            className="flex min-w-0 flex-1 items-start gap-2 rounded-xl border p-2 text-left
                                       hairline surf-1 hover-soft"
                            title={`${rangeOf(block)}${check?.text ? ` · ${check.text}` : ''}`}
                          >
                            <span
                              aria-hidden
                              className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundImage: gradientOf(blockPalette(block), '180deg') }}
                            />

                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-1.5">
                                <span className="text-[11px] font-bold tabular-nums t-3">
                                  {block.start}
                                </span>
                                <span className="truncate text-xs font-semibold t-1">
                                  <span aria-hidden>{block.icon}</span> {block.title}
                                </span>
                              </span>

                              <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                <span className="text-[11px] tabular-nums t-3">
                                  {durationLabel(block.duration)}
                                </span>

                                <BlockPills block={block} check={check} pitch={pitch} />
                              </span>
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSheet({ kind: 'block', block })}
                            aria-label={`Copiar o mover «${block.title}»`}
                            title="Copiar, repetir o mover"
                            className="btn-ghost shrink-0 px-2 py-0 text-xs"
                          >
                            ⧉
                          </button>

                          {/* Quitarlo desde la lista, sin abrirlo. Lo mismo que
                              hace la ✕ de la cuadrícula, y con el mismo
                              «deshacer» detrás. */}
                          <button
                            type="button"
                            onClick={() => remove(block)}
                            aria-label={`Quitar «${block.title}»`}
                            title="Quitar de la semana (se puede deshacer)"
                            className="btn-ghost shrink-0 px-2 py-0 text-xs"
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Y debajo, lo que ese día te toca de los peques. No se toca
                    desde aquí —es de su semana— pero sale donde se decide la
                    tuya, que es cuando de verdad hace falta saberlo. */}
                {dayBorrowed.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t pt-2 hairline">
                    {dayBorrowed.map((block) => (
                      <li
                        key={block.id}
                        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 surf-1"
                        style={{ boxShadow: `inset 2px 0 0 ${block.mirror!.tint}` }}
                        title={`${rangeOf(block)} · ${block.title} — de ${block.mirror!.name} (${COMPANIONS[
                          block.mirror!.companion
                        ].label.toLowerCase()}). Se cambia en su semana.`}
                      >
                        <span aria-hidden className="text-xs">
                          {block.mirror!.avatar}
                        </span>
                        <span className="text-[11px] font-bold tabular-nums t-3">
                          {block.start}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] t-2">
                          <span aria-hidden>{block.icon}</span> {block.title}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums t-3">
                          {durationLabel(block.duration)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing({ block: emptyBlock(day), isNew: true })}
                    className="btn-ghost flex-1 px-2 py-1.5 text-xs"
                  >
                    ＋ Añadir
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheet({ kind: 'day', day })}
                    aria-label={`Copiar o mover el ${DAY_NAMES[day].toLowerCase()}`}
                    title="Copiar, mover o intercambiar el día"
                    className="btn-ghost px-2 py-1.5 text-xs"
                  >
                    ⧉
                  </button>
                  {/* Vaciar un día entero se pregunta en el sitio: un toque de
                      más al lado de «copiar» no puede llevarse la tarde. El
                      «deshacer» del aviso sigue detrás, por si acaso. */}
                  {blocks.length > 0 && (
                    <ConfirmButton
                      question={`¿Vaciar el ${DAY_NAMES[day].toLowerCase()}?`}
                      onConfirm={() => clearDay(day)}
                      confirmLabel="Sí, vaciarlo"
                      title="Vaciar el día"
                      className="btn-ghost px-2 py-1.5 text-xs"
                      confirmClassName="btn-danger px-2 py-1.5 text-xs"
                    >
                      <span aria-hidden>🧹</span>
                      <span className="sr-only">Vaciar el {DAY_NAMES[day].toLowerCase()}</span>
                    </ConfirmButton>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* La semana del hermano. Sólo sale donde tiene sentido: en la de Leo y
          en la de Hugo, que son las dos que van casi a la par. */}
      {twin && (
        <section className="card p-3" aria-label={`La semana de ${twinLabel}`}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] t-3">
              👯 La semana de {twinLabel}
            </p>

            <button type="button" onClick={syncTwin} className="btn-ghost px-3 py-1.5 text-xs">
              ⇄ Dejarla igual que ésta
            </button>

            <label className="ml-auto flex items-center gap-1.5 text-[11px] t-3">
              <span>Al guardar:</span>
              <select
                value={mode}
                onChange={(event) => {
                  const next = event.target.value as ReplicaMode;
                  setReplicaMode(profile.id, next);
                  setMode(next);
                }}
                className="field min-h-0 py-1 text-[11px]"
              >
                <option value="preguntar">preguntar</option>
                <option value="siempre">replicar siempre</option>
                <option value="nunca">no replicar</option>
              </select>
            </label>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed t-3">
            {twinned > 0
              ? `${twinned} ${twinned === 1 ? 'rato va hermanado' : 'ratos van hermanados'} con los de ${twinLabel}: al cambiarlos aquí se ofrece cambiarlos allí. Lo suyo —con quién está, sus notas— se respeta siempre.`
              : `Todavía no hay ningún rato hermanado. En cuanto aceptes la primera réplica, los dos ratos quedan atados y los siguientes cambios se ofrecen solos.`}
          </p>
        </section>
      )}

      {/* Lo que se puede hacer con la semana entera. Sin semana, esto es la
          tarjeta de arriba; con ella, lo que la rehace o la vacía pregunta
          antes, porque son ochenta ratos de un toque y el «deshacer» del
          aviso se va a los pocos segundos. */}
      {defined && (
        <section className="card flex flex-wrap items-center gap-x-2 gap-y-2 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] t-3">La semana entera</p>

          <ConfirmButton
            question="¿Rehacer toda la semana con la de ejemplo?"
            onConfirm={useSample}
            confirmLabel="Sí, rehacerla"
          >
            ✨ Rehacer con la de ejemplo
          </ConfirmButton>

          <button type="button" onClick={openCopy} className="btn-ghost px-3 py-1.5 text-xs">
            ⧉ Copiar la semana de otro
          </button>

          <button type="button" onClick={relink} className="btn-ghost px-3 py-1.5 text-xs">
            🔗 Atar a los hábitos
          </button>

          <ConfirmButton
            question="¿Vaciar toda la semana?"
            onConfirm={clearWeek}
            confirmLabel="Sí, vaciarla"
          >
            🧹 Vaciar la semana
          </ConfirmButton>

          <p className="w-full text-[11px] leading-relaxed t-3 sm:w-auto sm:flex-1">
            No se rehace cada lunes: se define una vez y se repite hasta que se cambie. Lo que
            ocurre un solo día va en Tareas, que tiene fecha y se tacha.
          </p>
        </section>
      )}

      {/* Qué significa cada marca. Sólo cuando hay algo marcado: en una
          semana tipo recién definida no marca nada y sobra. */}
      {judged > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] t-3">
          <span className="font-bold uppercase tracking-wide">Marcas:</span>
          {(['cumplido', 'flojo', 'excedido', 'sinRegistrar', 'futuro'] as PlanStatus[]).map(
            (status) => (
              <span key={status} className="inline-flex items-center gap-1">
                <StatusPill status={status} pitch={pitch} iconOnly />
                {statusLabel(status, pitch)}
              </span>
            ),
          )}
        </div>
      )}

      {copying && (
        <Modal title="Copiar la semana de otro" onClose={() => setCopying(null)}>
          <CopyWeekPicker
            profile={profile}
            sources={copying}
            hasWeek={defined}
            onPick={copyWeek}
            onCancel={() => setCopying(null)}
          />
        </Modal>
      )}

      {sheet && (
        <Modal
          title={sheet.kind === 'block' ? '⧉ Copiar, repetir o mover' : '⧉ Copiar o mover el día'}
          onClose={() => setSheet(null)}
          size="lg"
        >
          <PlanCopySheet
            plan={plan}
            target={sheet}
            today={today}
            blockWord={theme.blockWord}
            blockWords={theme.blockWords}
            onApply={applyCopy}
            onCancel={() => setSheet(null)}
          />
        </Modal>
      )}

      {editing && (
        <Modal
          title={editing.isNew ? 'Apartar un rato' : 'Editar el rato'}
          onClose={closeEditor}
          size="lg"
        >
          <BlockEditor
            /* Un editor por rato: abrir otro sin cerrar no puede heredar el
               borrador ni el reloj del anterior. */
            key={editing.block.id}
            flushRef={flushEditor}
            profile={profile}
            block={editing.block}
            isNew={editing.isNew}
            /* Sin lo que el propio autoguardado acaba de dejar puesto: si no,
               el editor avisaría de que el rato se pisa consigo mismo. */
            plan={editorPlan}
            onSave={save}
            onAutoSave={autoSave}
            savedAt={savedAt}
            onRevert={revert}
            onCancel={closeEditor}
            onDelete={editing.isNew ? undefined : () => remove(editing.block)}
            onCopy={
              editing.isNew
                ? undefined
                : () => {
                    // Se copia el rato como ha quedado, no como se abrió.
                    const id = editing.block.id;
                    closeEditor();
                    const block = planOf(profile.id).blocks.find((item) => item.id === id) ?? editing.block;
                    setSheet({ kind: 'block', block });
                  }
            }
          />
        </Modal>
      )}

      {/* La pregunta de los hermanos. Sale después de guardar, con lo que de
          verdad ha quedado apartado aquí. */}
      {ask && twin && (
        <Modal title={`👯 ¿También en la semana de ${twinLabel}?`} onClose={() => setAsk(null)}>
          <ReplicaAsk
            profile={profile}
            twinName={twinLabel}
            change={ask.change}
            preview={ask.preview}
            onReplicate={() => applyReplica(ask.change)}
            onAlways={() => {
              setReplicaMode(profile.id, 'siempre');
              setMode('siempre');
              applyReplica(ask.change);
            }}
            onSkip={() => setAsk(null)}
            onNever={() => {
              setReplicaMode(profile.id, 'nunca');
              setMode('nunca');
              setAsk(null);
              notify({
                message: `Las dos semanas van por su cuenta. Se cambia desde 👯 en la agenda.`,
                icon: '🙅',
              });
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Las cuatro cifras de la semana
 * ------------------------------------------------------------------------- */

function Tile({ value, label, heading }: { value: string; label: string; heading: string }) {
  return (
    <div className="rounded-xl border p-2 text-center hairline surf-2">
      <p className={`text-lg font-bold tabular-nums t-1 ${heading}`}>{value}</p>
      <p className="text-[11px] leading-tight t-3">{label}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Cabecera
 *
 * Lo único de la pantalla que cambia de verdad de un perfil a otro. El campo
 * y la banda blanca y dorada para los peques —que la semana les entre por
 * donde les entra el fútbol—, el filete dorado y la serif para María, la
 * regla de acero para Víctor y el degradado cálido para los módulos
 * compartidos. Los colores siguen saliendo del tinte del perfil: aquí sólo
 * se decide el adorno.
 *
 * No lleva fechas: lo que se rotula es la semana que se repite, no una.
 * ------------------------------------------------------------------------- */

interface HeaderProps {
  profile: Profile;
  title: string;
  icon: string;
  kicker: string;
  ornament: PlanOrnament;
  quote: string;
  /**
   * El resultado de la semana: lo cumplido contra lo fallado. En los paneles
   * de campo se pinta como el marcador de un estadio, que es la forma en que
   * un peque de ocho años lee una cifra sin que nadie se la explique.
   */
  score?: { kept: number; missed: number };
}

function PlannerHeader({ profile, title, icon, kicker, ornament, quote, score }: HeaderProps) {
  const pitch = ornament === 'pitch';

  return (
    <header
      className={`relative overflow-hidden rounded-3xl border p-4 sm:p-5
        ${pitch ? 'turf chalk border-2' : 'hairline'} surf-1`}
    >
      {/* Adornos: cada uno el suyo, todos decorativos */}
      {pitch && (
        <>
          {/* Banda blanca y dorada: el blanco del Madrid rematado en oro. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1.5"
            style={{
              background: `linear-gradient(90deg, rgba(255,255,255,0.9), ${SKIN_GOLD.pitch} 45%, ${SKIN_GOLD.pitch} 55%, rgba(255,255,255,0.9))`,
            }}
          />
          {/* Círculo central del campo. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-10 h-40 w-40 rounded-full border-2 chalk opacity-40"
          />
          {/* Y la red de la portería al fondo, que es lo que se ve detrás de
              un remate. Muy tenue: es un adorno, no un estampado. */}
          <span
            aria-hidden
            className="net pointer-events-none absolute inset-y-0 right-0 w-32 opacity-20"
          />
        </>
      )}

      {ornament === 'gold' && (
        <span
          aria-hidden
          className="absolute inset-x-6 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${SKIN_GOLD.leaf} 30%, ${SKIN_GOLD.pale} 50%, ${SKIN_GOLD.leaf} 70%, transparent)`,
          }}
        />
      )}

      {/* El de María: hilo de oro rosa, destellos al fondo y una corona en la
          esquina. La semana como el mapa de su reino. */}
      {ornament === 'crown' && (
        <>
          <span aria-hidden className="gilt absolute inset-x-0 top-0 h-[3px]" />
          <span
            aria-hidden
            className="stardust pointer-events-none absolute inset-0 opacity-[0.16]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-3 -top-2 select-none text-6xl opacity-[0.09]"
          >
            👑
          </span>
        </>
      )}

      {ornament === 'steel' && (
        <span aria-hidden className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-accent" />
      )}

      {(ornament === 'warm' || ornament === 'rose') && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-tint-halo blur-2xl"
        />
      )}

      <div className="relative flex items-start gap-3">
        {/* Dorsal: sólo en el campo, y con el aro dorado del escudo. */}
        {pitch && profile.squad && (
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 font-display text-lg
                       t-1 surf-2"
            style={{ borderColor: SKIN_GOLD.pitch }}
          >
            {profile.squad}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p
            className={`text-[11px] font-semibold uppercase t-3
              ${ornament === 'steel' ? 'tracking-[0.3em]' : 'tracking-[0.18em]'}`}
          >
            Semana tipo · de lunes a domingo
          </p>

          <h2
            className={`mt-0.5 text-xl font-bold t-1 sm:text-2xl
              ${
                pitch
                  ? 'font-display uppercase tracking-wide'
                  : ornament === 'crown'
                    ? 'royal-title'
                    : 'font-display'
              }`}
          >
            <span aria-hidden>{icon}</span> {title}
          </h2>

          <p className="mt-1 text-[13px] leading-snug t-2 sm:text-sm">{kicker}</p>

          {/* La frase del día, sólo con pantalla: en el móvil empujaba la
              semana hacia abajo sin decir nada que se pueda hacer. */}
          <p
            className={`mt-2 hidden text-xs t-3 sm:block
              ${pitch ? 'font-display uppercase tracking-wide' : 'italic'}`}
          >
            {quote}
          </p>
        </div>

        {/* El marcador. Sin nada jugado todavía no se enseña un 0–0 que no
            significa nada: se dice que el partido no ha empezado. */}
        {/* Fuera del campo, lo mismo como anillo: lo cumplido de lo vivido
            esta semana, igual que el anillo del día de la portada. */}
        {!pitch && score && score.kept + score.missed > 0 && (
          <div className="flex shrink-0 flex-col items-center gap-1">
            <span aria-hidden>
              <ProgressRing ratio={score.kept / (score.kept + score.missed)} size={56} stroke={6}>
                <span className="text-[11px] font-black tabular-nums t-1">
                  {Math.round((score.kept / (score.kept + score.missed)) * 100)}%
                </span>
              </ProgressRing>
            </span>
            <span className="sr-only">
              {score.kept} cumplidos y {score.missed} fallidos esta semana
            </span>
            <span aria-hidden className="text-[10px] font-bold uppercase tracking-wider t-3">
              cumplido
            </span>
          </div>
        )}

        {pitch && (
          <div className="hidden shrink-0 flex-col items-center gap-1 sm:flex">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] t-3">
              Marcador
            </span>
            {score && score.kept + score.missed > 0 ? (
              <span className="scoreboard rounded-lg border px-3 py-1 font-display text-xl tabular-nums">
                {score.kept}–{score.missed}
              </span>
            ) : (
              <span className="scoreboard rounded-lg border px-3 py-1 font-display text-[11px] uppercase">
                Por jugar
              </span>
            )}
            <span className="text-[11px] uppercase tracking-wide t-3">Goles · fallos</span>
          </div>
        )}
      </div>

      {pitch && (
        <p className="relative mt-3 hidden text-[11px] font-semibold uppercase tracking-[0.2em] t-3 sm:block">
          ⚪ Hala Madrid · el balón es tu amigo
        </p>
      )}
    </header>
  );
}
