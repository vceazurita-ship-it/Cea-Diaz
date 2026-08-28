'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Photo } from '@/components/ui/Photo';
import { Modal } from '@/components/ui/Modal';
import { PhotoCropper } from '@/components/ui/PhotoCropper';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { useAppearance } from '@/hooks/useAppearance';
import type { EntryMap, HabitStore, TaskMap } from '@/hooks/useHabitStore';
import { useTheme } from '@/hooks/useTheme';
import { APP_OWNER, photoMaxSide } from '@/lib/appearance';
import { setSoundEnabled, soundEnabled } from '@/lib/sound';
import {
  DEFAULT_PIN,
  setPin as storePin,
  subscribeSettings,
  usesDefaultPin,
} from '@/lib/settings';
import type { DayEntry, Task, ThemePreference } from '@/types';

interface SettingsPanelProps {
  store: HabitStore;
  onClose: () => void;
  /** Apartado por el que se abre. Se usa al volver del enlace del correo. */
  initialSection?: 'aspecto' | 'nube' | 'sonido' | 'datos' | 'seguridad';
}

/** Registros pendientes de confirmar tras elegir un archivo. */
interface StagedImport {
  entries: EntryMap;
  tasks: TaskMap;
  count: number;
  fileName: string;
}

/**
 * Los recados, con su fecha y su estado. El vínculo con Google Calendar no
 * viaja: el evento pertenece a una cuenta concreta y restaurar la copia en
 * otra casa dejaría tareas apuntando a citas de un calendario ajeno.
 */
function parseTasks(raw: unknown): TaskMap {
  const source = (raw as { tasks?: unknown })?.tasks;
  if (!source || typeof source !== 'object') return {};

  const tasks: TaskMap = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const item = value as Partial<Task>;
    if (!item || typeof item !== 'object') continue;
    if (typeof item.title !== 'string' || typeof item.profileId !== 'string') continue;

    const now = new Date().toISOString();

    tasks[key] = {
      id: typeof item.id === 'string' ? item.id : key,
      profileId: item.profileId as Task['profileId'],
      title: item.title,
      detail: typeof item.detail === 'string' ? item.detail : undefined,
      kind: typeof item.kind === 'string' ? (item.kind as Task['kind']) : 'otro',
      due: typeof item.due === 'string' ? item.due : undefined,
      time: typeof item.time === 'string' ? item.time : undefined,
      duration: typeof item.duration === 'number' ? item.duration : undefined,
      remindBefore: typeof item.remindBefore === 'number' ? item.remindBefore : undefined,
      repeat: typeof item.repeat === 'string' ? (item.repeat as Task['repeat']) : 'none',
      done: item.done === true,
      doneAt: typeof item.doneAt === 'string' ? item.doneAt : undefined,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    };
  }

  return tasks;
}

/**
 * Las notas por categoría de un registro. Se filtran una a una: el archivo
 * lo puede haber tocado cualquiera y aquí sólo entran pares de texto.
 */
function parseNotes(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const notes: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) notes[key] = value;
  }

  return Object.keys(notes).length > 0 ? notes : undefined;
}

/** Comprueba que lo leído del archivo tiene forma de registro antes de aceptarlo. */
function parseEntries(raw: unknown): EntryMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = (raw as { entries?: unknown }).entries;
  if (!source || typeof source !== 'object') return null;

  const entries: EntryMap = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const entry = value as Partial<DayEntry>;
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.date !== 'string' || typeof entry.profileId !== 'string') continue;
    if (!entry.values || typeof entry.values !== 'object') continue;

    entries[key] = {
      date: entry.date,
      profileId: entry.profileId,
      values: entry.values as DayEntry['values'],
      note: typeof entry.note === 'string' ? entry.note : undefined,
      notes: parseNotes(entry.notes),
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
    };
  }

  return Object.keys(entries).length > 0 ? entries : null;
}

/**
 * Una línea del parte de la nube. Es la forma de `CloudPart`, ensanchada para
 * que quepan las fotos y sintonías: no pasan por el store —son archivos, no
 * filas— pero en esta lista tienen que salir como una pieza más.
 */
interface PartLine {
  id: string;
  label: string;
  ok: boolean;
  sent?: number;
  /** Cuántas se han bajado, cuando lo que ha pasado es una copia. */
  received?: number;
  /** Cuántas se han quitado de la nube por no existir ya aquí. */
  removed?: number;
  error?: string;
}

/* -------------------------------------------------------------------------
 *  Apartados
 *
 *  Antes era una tira única que había que recorrer entera para llegar al
 *  PIN. Partida en apartados, cada uno cabe en la pantalla del móvil y el
 *  que se busca está a un toque; los avisos —la nube que falla, el PIN de
 *  fábrica— salen en la propia pestaña para que no haya que entrar a mirar.
 * ---------------------------------------------------------------------- */

type Section = 'aspecto' | 'nube' | 'sonido' | 'datos' | 'seguridad';

const SECTIONS: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'aspecto', label: 'Aspecto', icon: '🎨' },
  { id: 'nube', label: 'Nube', icon: '☁️' },
  { id: 'sonido', label: 'Sonido', icon: '🔊' },
  { id: 'datos', label: 'Datos', icon: '💾' },
  { id: 'seguridad', label: 'Seguridad', icon: '🔐' },
];

/** «hace 3 min», que es como se mira si algo acaba de pasar. */
function agoLabel(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;

  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** Tamaño en corto, para decir lo que ocupa una copia de seguridad. */
function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * PIN que no protege de nadie: cuatro dígitos iguales o una escalera. No se
 * impide —es una barrera doméstica, y quien quiera 1111 lo tendrá— pero se
 * dice, porque casi siempre se elige así sin pensarlo.
 */
function weakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;

  const ladder = pin.split('').map(Number);
  const up = ladder.every((digit, index) => index === 0 || digit === ladder[index - 1] + 1);
  const down = ladder.every((digit, index) => index === 0 || digit === ladder[index - 1] - 1);
  return up || down;
}

export function SettingsPanel({ store, onClose, initialSection }: SettingsPanelProps) {
  const [section, setSection] = useState<Section>(initialSection ?? 'aspecto');

  const [pin, setPin] = useState('');
  const [pinAgain, setPinAgain] = useState('');
  /** Enseñar lo tecleado: en el móvil, cuatro puntos negros se equivocan solos. */
  const [pinVisible, setPinVisible] = useState(false);
  /** `true` mientras siga valiendo el de fábrica; sólo entonces se puede decir. */
  const [defaultPin, setDefaultPin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  /** Contraseña de la cuenta de casa, que es lo que de verdad guarda todo. */
  const [pass, setPass] = useState('');
  const [passAgain, setPassAgain] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  const [confirmReset, setConfirmReset] = useState(false);
  const [staged, setStaged] = useState<StagedImport | null>(null);
  /** Se lee tras montar: en el servidor no hay `localStorage` que consultar. */
  const [sound, setSound] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const notify = useToast();
  /** Mandando lo de este móvil a la nube. */
  const [pushing, setPushing] = useState(false);
  /** Se pregunta antes: hace que esta versión gane en el resto de aparatos. */
  const [confirmPush, setConfirmPush] = useState(false);
  /** Cómo les fue a las fotos y sintonías, que viajan por su cuenta. */
  const [photoPart, setPhotoPart] = useState<PartLine | null>(null);
  /** Dejando el resto de aparatos igual que este. */
  const [replicating, setReplicating] = useState(false);
  /** Se pregunta aparte: esto sí borra, y borra en los otros móviles. */
  const [confirmReplica, setConfirmReplica] = useState(false);

  // Se leen tras montar y se siguen escuchando: pueden cambiarlos desde
  // otro aparato mientras esta pantalla está abierta.
  useEffect(() => {
    const read = () => {
      setSound(soundEnabled());
      setDefaultPin(usesDefaultPin());
    };

    read();
    return subscribeSettings(read);
  }, []);

  /* ---------------------------------------------------- aspecto de la app */

  const { preference, mode, setPreference } = useTheme();
  const {
    appCover,
    appCoverCustom,
    setPhoto,
    reset: resetSlot,
    pushAll: pushAppearanceAll,
    replicateAll: replicateAppearance,
    error: appearanceError,
    lastSync: appearanceSync,
  } = useAppearance();
  const coverInput = useRef<HTMLInputElement>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  /** Portada recién elegida, a la espera de decidir qué trozo se ve. */
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const MODES: Array<{ value: ThemePreference; label: string; icon: string; hint: string }> = [
    { value: 'auto', label: 'Automático', icon: '📱', hint: 'Lo que diga el móvil' },
    { value: 'light', label: 'Día', icon: '☀️', hint: 'Claro siempre' },
    { value: 'dark', label: 'Noche', icon: '🌙', hint: 'Oscuro siempre' },
  ];

  /** Se llama ya con el recorte hecho: lo elegido en el marco es lo que se ve. */
  const changeCover = async (file: File) => {
    setCoverBusy(true);
    try {
      await setPhoto(APP_OWNER, 'cover', file);
      notify({ message: 'Portada actualizada.', icon: '🖼️' });
    } catch (error) {
      notify({
        message: error instanceof Error ? error.message : 'No se ha podido guardar la portada.',
        icon: '⚠️',
        tone: 'danger',
      });
    } finally {
      setCoverBusy(false);
      if (coverInput.current) coverInput.current.value = '';
    }
  };

  const restoreCover = async () => {
    setCoverBusy(true);
    try {
      await resetSlot(APP_OWNER, 'cover');
      notify({ message: 'Portada original restaurada.', icon: '↩️' });
    } finally {
      setCoverBusy(false);
    }
  };

  /* ------------------------------------------------------ cuánto hay aquí */

  const entryCount = Object.keys(store.entries).length;
  const taskList = Object.values(store.tasks);
  const pendingTasks = taskList.filter((task) => !task.done).length;

  /** Lo que ocuparía la copia de seguridad, dicho antes de descargarla. */
  const backupSize = useMemo(() => {
    try {
      return new Blob([JSON.stringify({ entries: store.entries, tasks: store.tasks })]).size;
    } catch {
      return 0;
    }
  }, [store.entries, store.tasks]);

  /* ------------------------------------------------------------- la nube */

  /**
   * Cómo va el aspecto. Manda lo que dijo el último «mandar lo de este
   * móvil»; mientras no haya ninguno, se cuenta cómo fue la reconciliación
   * de por sí. Las fotos viajan por su cuenta —son archivos, no filas— y sin
   * esta línea una casa cuyo cubo está mal configurado seguiría leyendo
   * «al día» mientras sus fotos no salen de un solo aparato.
   */
  const photoLine: PartLine | null =
    photoPart ??
    (appearanceError
      ? { id: 'photos', label: 'Fotos y sintonías', ok: false, error: appearanceError }
      : appearanceSync
        ? { id: 'photos', label: 'Fotos y sintonías', ok: true }
        : null);

  /**
   * El parte completo. La línea de las fotos sale del propio parte cuando
   * viene en él —la réplica las lleva dentro— y sólo se añade por fuera
   * cuando no está, que es lo que pasa tras un «mandar lo de este móvil».
   */
  const partLines: PartLine[] = [...(store.cloud.parts as PartLine[])];
  if (photoLine && !partLines.some((part) => part.id === 'photos')) partLines.push(photoLine);

  /** Estado de la nube en una línea, con su color. */
  const cloud = (() => {
    switch (store.cloud.status) {
      case 'signed-out':
        return {
          tone: 'idle' as const,
          title: 'Sin sesión',
          text: 'Lo que se registre aquí sólo está en este móvil.',
        };
      case 'syncing':
        return { tone: 'busy' as const, title: 'Sincronizando…', text: 'Un momento.' };
      case 'synced':
        return {
          tone: 'ok' as const,
          title: 'Al día',
          text: `${store.cloud.email}${
            store.cloud.lastSync ? ` · última vez ${agoLabel(store.cloud.lastSync)}` : ''
          }.`,
        };
      case 'error':
        return {
          tone: 'bad' as const,
          title: 'No llegó entera',
          text: 'La última sincronización falló. Lo de este móvil sigue guardado aquí.',
        };
      default:
        return { tone: 'idle' as const, title: 'Sólo este navegador', text: '' };
    }
  })();

  /** Lo que hay que mirar, marcado en la propia pestaña. */
  const alerts: Partial<Record<Section, boolean>> = {
    nube: store.cloud.configured && store.cloud.status === 'error',
    // Venir del enlace del correo deja la contraseña vieja en pie: hasta que
    // se cambie, el apartado pide atención igual que el PIN de fábrica.
    seguridad: defaultPin || store.cloud.recovering,
  };

  const changePin = async () => {
    if (pin.length < 4) {
      notify({ message: 'El PIN debe tener al menos 4 dígitos.', icon: '⚠️', tone: 'danger' });
      return;
    }

    // Se pide dos veces desde que existe la huella: si se guarda uno con un
    // dedazo, no hay forma de averiguar cuál fue.
    if (pin !== pinAgain) {
      notify({ message: 'Los dos PIN no coinciden.', icon: '⚠️', tone: 'danger' });
      return;
    }

    setSavingPin(true);
    try {
      await storePin(pin);
      setPin('');
      setPinAgain('');
      setPinVisible(false);
      notify({ message: 'PIN actualizado en todos los aparatos.', icon: '🔐' });
    } catch (error) {
      notify({
        message: error instanceof Error ? error.message : 'No se ha podido guardar el PIN.',
        icon: '⚠️',
        tone: 'danger',
      });
    } finally {
      setSavingPin(false);
    }
  };

  /**
   * Cambia la contraseña de la cuenta de casa. Es lo que hacía falta para
   * cerrar el círculo del «no me acuerdo»: el enlace del correo devuelve a la
   * app con la sesión abierta, y aquí es donde se pone la nueva.
   */
  const changePassword = async () => {
    if (pass.length < 6) {
      notify({
        message: 'La contraseña debe tener al menos 6 caracteres.',
        icon: '⚠️',
        tone: 'danger',
      });
      return;
    }

    if (pass !== passAgain) {
      notify({ message: 'Las dos contraseñas no coinciden.', icon: '⚠️', tone: 'danger' });
      return;
    }

    setSavingPass(true);
    try {
      await store.changePassword(pass);
      setPass('');
      setPassAgain('');
      notify({
        message: 'Contraseña cambiada. La siguiente vez que entréis, usad esta.',
        icon: '🔑',
      });
    } catch (error) {
      notify({
        message: error instanceof Error ? error.message : 'No se ha podido cambiar.',
        icon: '⚠️',
        tone: 'danger',
      });
    } finally {
      setSavingPass(false);
    }
  };

  /**
   * «Mandar lo de este móvil»: sube todo lo de aquí —registros, tareas,
   * ajustes, campogramas, agendas, fotos y sintonías— con fecha de ahora,
   * para que el resto de aparatos adopten esta versión en cuanto abran.
   */
  const sendThisDevice = async () => {
    setConfirmPush(false);
    setPushing(true);

    try {
      const report = await store.pushAll();
      const photos = await pushAppearanceAll();

      setPhotoPart({
        id: 'photos',
        label: 'Fotos y sintonías',
        ok: photos.failed === 0,
        sent: photos.sent,
        // Se dice cuántas y, sobre todo, qué contestó la nube: «2 no han
        // subido» no le sirve de nada a quien tiene que arreglarlo.
        error:
          photos.failed > 0
            ? `${photos.failed} sin subir${photos.error ? `: ${photos.error}` : ''}`
            : undefined,
      });

      const failed = report.filter((part) => !part.ok).length + (photos.failed > 0 ? 1 : 0);

      notify(
        failed > 0
          ? {
              message: 'No ha subido todo. Abajo se dice qué falta.',
              icon: '⚠️',
              tone: 'danger',
            }
          : {
              message: 'Mandado. El resto de móviles adoptará esta versión al abrir la app.',
              icon: '⬆️',
            },
      );
    } catch (error) {
      notify({
        message: error instanceof Error ? error.message : 'No se ha podido mandar.',
        icon: '⚠️',
        tone: 'danger',
      });
    } finally {
      setPushing(false);
    }
  };

  /**
   * «Dejar todos igual que este»: la réplica.
   *
   * Lo de arriba sube; esto además borra. Deja la nube como copia exacta de
   * este aparato y avisa al resto, que adoptarán la copia entera —y tirarán
   * lo que sólo tuvieran ellos— en cuanto abran la app.
   *
   * El orden importa: primero los registros y lo que viaja aparte, después
   * las fotos, y sólo al final la marca. Es `store.replicateAll` quien la
   * escribe, y por eso las fotos entran como el paso que se le pasa: si se
   * anunciara antes, otro móvil podría copiar media casa.
   */
  const replicateEverywhere = async () => {
    setConfirmReplica(false);
    setReplicating(true);
    // Las fotos vienen dentro del parte de la nube: sin esto se vería dos
    // veces la misma línea, la de ahora y la del último «mandar».
    setPhotoPart(null);

    try {
      const report = await store.replicateAll(async () => {
        const photos = await replicateAppearance();
        return {
          id: 'photos',
          label: 'Fotos y sintonías',
          ok: photos.failed === 0 && !photos.error,
          sent: photos.sent,
          removed: photos.removed,
          error: photos.error
            ? `${photos.failed > 0 ? `${photos.failed} sin subir: ` : ''}${photos.error}`
            : undefined,
        };
      });

      const failed = report.filter((part) => !part.ok).length;

      notify(
        failed > 0
          ? {
              message: 'No se ha copiado todo, así que no se ha avisado a nadie.',
              icon: '⚠️',
              tone: 'danger',
            }
          : {
              message: 'Copiado. El resto de aparatos quedará igual que este al abrir la app.',
              icon: '🧬',
            },
      );
    } catch (error) {
      notify({
        message: error instanceof Error ? error.message : 'No se ha podido copiar.',
        icon: '⚠️',
        tone: 'danger',
      });
    } finally {
      setReplicating(false);
    }
  };

  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          // v5 añadió las notas por categoría, v6 los recados y v7 retiró el
          // análisis de fotos de comida y el consejo del día. Los archivos de
          // versiones anteriores se siguen leyendo: lo que ya no existe
          // simplemente se ignora.
          {
            version: 7,
            entries: store.entries,
            tasks: store.tasks,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `habitos-familia-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify({ message: 'Copia de seguridad descargada.', icon: '⬇️' });
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const entries = parseEntries(raw);
      if (!entries) {
        notify({
          message: 'El archivo no contiene registros reconocibles.',
          icon: '⚠️',
          tone: 'danger',
        });
        return;
      }
      setStaged({
        entries,
        tasks: parseTasks(raw),
        count: Object.keys(entries).length,
        fileName: file.name,
      });
    } catch {
      notify({ message: 'No se ha podido leer el archivo.', icon: '⚠️', tone: 'danger' });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const applyImport = (mode: 'merge' | 'replace') => {
    if (!staged) return;
    const before = store.snapshot();
    store.importEntries({ entries: staged.entries, tasks: staged.tasks }, mode);
    setStaged(null);
    notify({
      message: `${staged.count} ${staged.count === 1 ? 'día importado' : 'días importados'}.`,
      icon: '⬆️',
      action: { label: 'Deshacer', onClick: () => store.restore(before) },
    });
  };

  const loadDemo = () => {
    const before = store.snapshot();
    store.loadDemoData();
    notify({
      message: 'Datos de ejemplo cargados.',
      icon: '🎲',
      action: { label: 'Deshacer', onClick: () => store.restore(before) },
    });
  };

  const wipe = () => {
    const before = store.snapshot();
    store.resetAll();
    setConfirmReset(false);
    notify({
      message: 'Se han borrado todos los registros.',
      icon: '🗑️',
      tone: 'danger',
      action: { label: 'Deshacer', onClick: () => store.restore(before) },
    });
  };

  /* ---------------------------------------------------------------- pintura */

  /** El punto de color del estado de la nube: verde de casa, rojo, o apagado. */
  const TONE_DOT: Record<'ok' | 'bad' | 'busy' | 'idle', string> = {
    ok: 'var(--accent)',
    bad: 'var(--danger)',
    busy: 'var(--accent)',
    idle: 'var(--surface-3)',
  };

  return (
    <Modal title="⚙️ Ajustes" onClose={onClose} size="lg">
      {/* Navegación: los apartados, siempre a la vista */}
      <div
        role="tablist"
        aria-label="Apartados de los ajustes"
        className="sticky top-0 z-10 -mx-5 -mt-1 mb-4 flex gap-1 overflow-x-auto px-5 pb-2 pt-1
                   surf-raised"
        onKeyDown={(event) => {
          const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          if (delta === 0) return;
          event.preventDefault();
          const index = SECTIONS.findIndex((option) => option.id === section);
          setSection(SECTIONS[(index + delta + SECTIONS.length) % SECTIONS.length].id);
        }}
      >
        {SECTIONS.map((option) => {
          const active = section === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`ajustes-${option.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setSection(option.id)}
              className={`btn shrink-0 border px-3 py-1.5 text-xs font-semibold
                ${active ? 'bg-accent border-accent t-on-accent' : 'hairline surf-1 t-2 hover-soft'}`}
            >
              <span aria-hidden>{option.icon}</span>
              {option.label}
              {alerts[option.id] && (
                <span
                  aria-label="requiere atención"
                  style={{ background: active ? 'var(--on-accent)' : 'var(--danger)' }}
                  className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-4 text-sm" id={`ajustes-${section}`} role="tabpanel">
        {/* ---------------------------------------------- aspecto de la app */}
        {section === 'aspecto' && (
          <>
            <section className="rounded-2xl border hairline surf-1 p-3">
              <h3 className="mb-1 font-bold t-1">Modo de la app</h3>
              <p className="mb-3 text-xs t-3">
                Vale para todos los perfiles y se queda en este dispositivo: la tableta de la
                cocina y el móvil de la mesilla pueden ir cada uno a lo suyo.
              </p>

              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Modo de la app">
                {MODES.map((option) => {
                  const active = preference === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPreference(option.value)}
                      aria-pressed={active}
                      className={`flex flex-col items-center gap-1 rounded-2xl border p-3
                        text-center transition-colors
                        ${active ? 'border-accent bg-accent-faint' : 'hairline surf-2 hover-soft'}`}
                    >
                      <span aria-hidden className="text-xl">
                        {option.icon}
                      </span>
                      <span className="text-xs font-bold t-1">{option.label}</span>
                      <span className="text-[10px] leading-tight t-3">
                        {option.value === 'auto' && active
                          ? `ahora ${mode === 'dark' ? 'noche' : 'día'}`
                          : option.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border hairline surf-1 p-3">
              <h3 className="mb-1 font-bold t-1">Portada</h3>
              <p className="mb-3 text-xs t-3">
                La foto grande de la pantalla de inicio. Con la cuenta de casa iniciada llega
                también al resto de móviles.
              </p>

              <div className="flex items-center gap-3">
                <span className="block h-14 w-24 shrink-0 overflow-hidden rounded-xl border hairline surf-2">
                  <Photo
                    src={appCover}
                    alt=""
                    width={192}
                    height={112}
                    className="h-full w-full object-cover"
                  />
                </span>

                <div className="flex min-w-0 flex-wrap gap-2">
                  <input
                    ref={coverInput}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      // Se vacía para poder volver a elegir el mismo archivo.
                      event.target.value = '';
                      if (file) setCoverFile(file);
                    }}
                  />
                  <button
                    type="button"
                    disabled={coverBusy}
                    onClick={() => coverInput.current?.click()}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    {coverBusy ? '⏳ Guardando…' : appCoverCustom ? '🖼️ Cambiar' : '🖼️ Elegir foto'}
                  </button>

                  {appCoverCustom && (
                    <button
                      type="button"
                      disabled={coverBusy}
                      onClick={() => void restoreCover()}
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      ↩️ Original
                    </button>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* -------------------------------------------------------- nube */}
        {section === 'nube' && store.cloud.configured && (
          <section className="rounded-2xl border hairline surf-1 p-3">
            {/* El estado, de un vistazo y con color */}
            <div className="mb-3 flex items-start gap-2.5">
              <span
                aria-hidden
                style={{ background: TONE_DOT[cloud.tone] }}
                className={`mt-1.5 block h-2.5 w-2.5 shrink-0 rounded-full
                  ${cloud.tone === 'busy' ? 'animate-pulse' : ''}`}
              />
              <p className="min-w-0 flex-1">
                <span className="block font-bold t-1">{cloud.title}</span>
                <span className="block break-words text-xs t-3">{cloud.text}</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {store.cloud.status === 'signed-out' ? (
                <button
                  type="button"
                  onClick={() => store.setLocalOnly(false)}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  🔑 Entrar con la cuenta de casa
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void store.syncNow()}
                    disabled={store.cloud.status === 'syncing' || pushing || replicating}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    🔄 Sincronizar ahora
                  </button>

                  {/* La sincronización de siempre mueve sólo lo que aquí es
                      más reciente. Esto decide que aquí todo lo es: es lo que
                      hace falta cuando la app se ha montado en un móvil y el
                      resto todavía está en blanco. */}
                  {confirmPush ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void sendThisDevice()}
                        disabled={pushing}
                        className="btn-primary px-3 py-1.5 text-xs"
                      >
                        {pushing ? '⏳ Mandando…' : 'Sí, que mande este móvil'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmPush(false)}
                        className="btn-ghost px-3 py-1.5 text-xs t-3"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmReplica(false);
                        setConfirmPush(true);
                      }}
                      disabled={pushing || replicating || store.cloud.status === 'syncing'}
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      ⬆️ Mandar lo de este móvil
                    </button>
                  )}

                  {/* Y el hermano destructivo: mandar deja lo que sólo exista
                      en otro aparato; esto lo quita. Es lo que hace falta
                      cuando los demás móviles arrastran pruebas de cuando se
                      estaba montando la app y lo que se quiere es que todos
                      queden exactamente igual que este. */}
                  {confirmReplica ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void replicateEverywhere()}
                        disabled={replicating}
                        className="btn-danger px-3 py-1.5 text-xs"
                      >
                        {replicating ? '⏳ Copiando…' : 'Sí, que todos queden igual'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmReplica(false)}
                        className="btn-ghost px-3 py-1.5 text-xs t-3"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmPush(false);
                        setConfirmReplica(true);
                      }}
                      disabled={pushing || replicating || store.cloud.status === 'syncing'}
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      🧬 Dejar todos igual que este
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void store.signOut()}
                    disabled={pushing || replicating}
                    className="btn-ghost px-3 py-1.5 text-xs t-3"
                  >
                    Cerrar sesión
                  </button>
                </>
              )}
            </div>

            {confirmPush && (
              <p className="mt-2 rounded-xl border p-2.5 text-[11px] leading-relaxed hairline surf-2 t-2">
                Sube todo lo de este aparato —registros, tareas, ajustes, campogramas, agendas,
                fotos y sintonías— con fecha de ahora, así que en el resto de móviles ganará esta
                versión. No se borra nada de nadie: lo que exista sólo allí se queda como está.
              </p>
            )}

            {confirmReplica && (
              <p
                className="mt-2 rounded-xl border p-2.5 text-[11px] leading-relaxed surf-2 t-2"
                style={{ borderColor: 'var(--danger)' }}
              >
                <span className="font-bold t-danger">Esto sí borra.</span> El resto de aparatos
                quedará exactamente igual que este: mismos registros, tareas, ajustes,
                campogramas, agendas, fotos y sintonías. Lo que allí exista y aquí no —un día
                registrado sólo en la tableta, una foto que aquí se quitó— desaparece de todas
                partes. En este móvil no se toca nada, y quien entre por primera vez después no
                pierde lo suyo: sólo copian los aparatos que ya estaban en la cuenta.
              </p>
            )}

            {/* Qué ha viajado y qué no. Sin esto, una tabla que falta se leía
                como «al día» y la casa creía tener la agenda en todas partes. */}
            {partLines.length > 0 && (
              <ul className="mt-3 space-y-1 border-t pt-2 hairline">
                {partLines.map((part) => (
                  <li key={part.id} className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
                    <span aria-hidden>{part.ok ? '✅' : '⚠️'}</span>
                    <span className={part.ok ? 't-2' : 't-danger'}>{part.label}</span>
                    {part.sent !== undefined && (
                      <span className="tabular-nums t-3">
                        {part.sent} {part.sent === 1 ? 'enviado' : 'enviados'}
                      </span>
                    )}
                    {part.received !== undefined && (
                      <span className="tabular-nums t-3">
                        {part.received} {part.received === 1 ? 'recibido' : 'recibidos'}
                      </span>
                    )}
                    {part.removed !== undefined && part.removed > 0 && (
                      <span className="tabular-nums t-3">
                        {part.removed} {part.removed === 1 ? 'borrado allí' : 'borrados allí'}
                      </span>
                    )}
                    {!part.ok && part.error && <span className="t-3">— {part.error}</span>}
                  </li>
                ))}
              </ul>
            )}

            {store.cloud.error && (
              <p className="mt-2 text-[11px] t-danger">⚠️ {store.cloud.error}</p>
            )}
          </section>
        )}

        {/* Sin nube no hay aviso por ninguna parte: la app se comporta como
            siempre y parece que todo va bien, pero lo registrado en un
            aparato no llega a los demás. Más vale decirlo. */}
        {section === 'nube' && !store.cloud.configured && (
          <section className="rounded-2xl border hairline surf-1 p-3">
            <h3 className="mb-1 font-bold t-1">Sin nube configurada</h3>
            <p className="text-xs leading-relaxed t-3">
              Lo que se registre aquí se queda sólo en este aparato y no se ve en el resto. Hay
              que definir <code>NEXT_PUBLIC_SUPABASE_URL</code> y{' '}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> y volver a desplegar, porque esas dos se
              incrustan al compilar.
            </p>
          </section>
        )}

        {/* ------------------------------------------------------ sonido */}
        {section === 'sonido' && (
          <section className="space-y-3 rounded-2xl border hairline surf-1 p-3">
            <div>
              <h3 className="mb-1 font-bold t-1">Sintonías</h3>
              <p className="text-xs leading-relaxed t-3">
                Cada perfil puede tener la suya al entrar. Suena veinte segundos y se desvanece;
                se corta con el botón que aparece abajo a la derecha.
              </p>
            </div>

            <Switch
              checked={sound}
              onChange={(next) => {
                setSound(next);
                setSoundEnabled(next);
              }}
              icon={sound ? '🔊' : '🔇'}
              label={sound ? 'Sintonías activadas' : 'Sintonías silenciadas'}
              hint="La sintonía de cada perfil se elige en su ficha, tocando su foto."
            />
          </section>
        )}

        {/* ------------------------------------------------------- datos */}
        {section === 'datos' && (
          <>
            <section className="rounded-2xl border hairline surf-1 p-3">
              <h3 className="mb-2 font-bold t-1">Lo que hay guardado</h3>

              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: entryCount === 1 ? 'día' : 'días', value: entryCount },
                  { label: 'tareas', value: taskList.length },
                  { label: 'pendientes', value: pendingTasks },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl border p-2 hairline surf-2">
                    <dd className="text-lg font-bold tabular-nums t-1">{stat.value}</dd>
                    <dt className="text-[10px] uppercase tracking-wide t-3">{stat.label}</dt>
                  </div>
                ))}
              </dl>

              <p className="mt-2 text-[11px] t-3">
                En este navegador. La copia de seguridad ocuparía {sizeLabel(backupSize)}.
              </p>
            </section>

            <section className="rounded-2xl border hairline surf-1 p-3">
              <h3 className="mb-1 font-bold t-1">Copia de seguridad</h3>
              <p className="mb-3 text-xs leading-relaxed t-3">
                Un archivo con los registros y las tareas de todos los perfiles. Sirve para
                guardarlo aparte o para llevárselo a otra casa.
              </p>

              {staged ? (
                <div className="rounded-xl border p-3 hairline surf-2">
                  <p className="text-xs t-2">
                    <span className="font-semibold t-1">{staged.fileName}</span> contiene{' '}
                    {staged.count} {staged.count === 1 ? 'día' : 'días'}
                    {Object.keys(staged.tasks).length > 0 && (
                      <> y {Object.keys(staged.tasks).length} tareas</>
                    )}
                    . ¿Cómo quieres aplicarlo?
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applyImport('merge')}
                      className="btn-primary px-3 py-1.5 text-xs"
                    >
                      Fusionar con lo actual
                    </button>
                    <button
                      type="button"
                      onClick={() => applyImport('replace')}
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      Reemplazar todo
                    </button>
                    <button
                      type="button"
                      onClick={() => setStaged(null)}
                      className="btn-ghost px-3 py-1.5 text-xs t-3"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={exportData} className="btn-ghost px-3 py-1.5 text-xs">
                    ⬇️ Exportar
                  </button>
                  {/* Una copia de seguridad que no se puede restaurar no es una copia. */}
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    ⬆️ Importar
                  </button>
                  <button type="button" onClick={loadDemo} className="btn-ghost px-3 py-1.5 text-xs">
                    🎲 Datos de ejemplo
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0])}
                  />
                </div>
              )}
            </section>
          </>
        )}

        {/* --------------------------------------------------- seguridad */}
        {section === 'seguridad' && (
          <>
            {/* La contraseña de la cuenta va antes que el PIN a propósito: el
                PIN tapa un módulo, esta abre la casa entera en cualquier
                aparato. Sin sesión no se puede cambiar, así que no se ofrece. */}
            {store.cloud.email && (
              <section
                className={`rounded-2xl border p-3 ${
                  store.cloud.recovering ? 'border-accent bg-accent-faint' : 'hairline surf-1'
                }`}
              >
                <h3 className="mb-1 font-bold t-1">Contraseña de la cuenta de casa</h3>

                <p className="mb-3 text-xs leading-relaxed t-3">
                  {store.cloud.recovering ? (
                    <>
                      Has entrado desde el enlace del correo. Pon aquí una contraseña nueva:
                      hasta que lo hagas, la que vale sigue siendo la que no recordáis.
                    </>
                  ) : (
                    <>
                      La de <span className="font-semibold t-2">{store.cloud.email}</span>. Es la
                      que abre los registros de toda la casa en cualquier móvil; el PIN de aquí
                      abajo sólo tapa el módulo de pareja.
                    </>
                  )}
                </p>

                <div className="space-y-2">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    placeholder="Contraseña nueva (mínimo 6)"
                    aria-label="Contraseña nueva"
                    className="field w-full"
                  />

                  <input
                    type="password"
                    autoComplete="new-password"
                    value={passAgain}
                    onChange={(e) => setPassAgain(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void changePassword()}
                    placeholder="Repítela"
                    aria-label="Repetir la contraseña"
                    className="field w-full"
                  />

                  <button
                    type="button"
                    onClick={() => void changePassword()}
                    disabled={pass.length < 6 || savingPass}
                    className="btn-primary px-3 py-2 text-xs"
                  >
                    {savingPass ? '⏳ Cambiando…' : '🔑 Cambiar la contraseña'}
                  </button>

                  {/* Igual que con el PIN: lo que va mal se dice mientras se
                      teclea, no al pulsar guardar. */}
                  {pass.length >= 6 && passAgain.length > 0 && pass !== passAgain && (
                    <p className="text-[11px] t-danger">Las dos contraseñas no coinciden todavía.</p>
                  )}
                </div>
              </section>
            )}

            <section className="rounded-2xl border hairline surf-1 p-3">
              <h3 className="mb-1 font-bold t-1">PIN del módulo de pareja</h3>
              <p className="mb-3 text-xs leading-relaxed t-3">
                Barrera de privacidad doméstica: los registros se guardan sin cifrar en este
                navegador. El PIN no: se guarda su huella, aquí y en la nube, así que vale en
                todos los aparatos y no se puede leer en ninguno.
              </p>

              <p
                className={`mb-3 rounded-xl border p-2.5 text-[11px] leading-relaxed
                  ${defaultPin ? 'border-accent bg-accent-faint t-1' : 'hairline surf-2 t-2'}`}
              >
                {defaultPin ? (
                  <>
                    ⚠️ Ahora vale el de fábrica:{' '}
                    <span className="font-mono font-bold">{DEFAULT_PIN}</span>. Cualquiera que
                    haya visto la app alguna vez lo sabe.
                  </>
                ) : (
                  '✅ Hay uno puesto. No se puede enseñar, porque no se guarda el número: si se olvida, se pone otro aquí.'
                )}
              </p>

              <div className="space-y-2">
                <input
                  type={pinVisible ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Nuevo PIN (4-8 dígitos)"
                  aria-label="Nuevo PIN"
                  className="field w-full tracking-[0.3em]"
                />

                <input
                  type={pinVisible ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={pinAgain}
                  onChange={(e) => setPinAgain(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  onKeyDown={(e) => e.key === 'Enter' && void changePin()}
                  placeholder="Repítelo"
                  aria-label="Repetir el PIN"
                  className="field w-full tracking-[0.3em]"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void changePin()}
                    disabled={pin.length < 4 || savingPin}
                    className="btn-primary px-3 py-2 text-xs"
                  >
                    {savingPin ? '⏳ Guardando…' : '💾 Guardar PIN'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPinVisible((value) => !value)}
                    aria-pressed={pinVisible}
                    className="btn-ghost px-3 py-2 text-xs"
                  >
                    {pinVisible ? '🙈 Ocultar' : '👁️ Ver lo que escribo'}
                  </button>
                </div>

                {/* Lo que va mal, dicho mientras se teclea y no al guardar */}
                {pin.length >= 4 && pinAgain.length > 0 && pin !== pinAgain && (
                  <p className="text-[11px] t-danger">Los dos PIN no coinciden todavía.</p>
                )}
                {pin.length >= 4 && weakPin(pin) && (
                  <p className="text-[11px] t-3">
                    ⚠️ {pin} se adivina a la primera. Vale igual, pero no protege de nadie de la
                    casa.
                  </p>
                )}
              </div>
            </section>

            {/* ---------------------------------------- zona peligrosa */}
            <section
              className="rounded-2xl border p-3"
              style={{ borderColor: 'var(--danger)', background: 'var(--danger-bg)' }}
            >
              <h3 className="t-danger mb-1 font-bold">Zona peligrosa</h3>
              <p className="mb-3 text-xs leading-relaxed t-2">
                Borra {entryCount} {entryCount === 1 ? 'día registrado' : 'días registrados'} y{' '}
                {taskList.length} {taskList.length === 1 ? 'tarea' : 'tareas'} de todos los
                perfiles. Podrás deshacerlo mientras el aviso siga en pantalla.
              </p>

              {confirmReset ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={wipe} className="btn-danger px-3 py-1.5 text-xs">
                    Sí, borrar todo
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="btn-ghost t-danger px-3 py-1.5 text-xs"
                >
                  🗑️ Borrar todos los datos
                </button>
              )}
            </section>
          </>
        )}
      </div>

      {coverFile && (
        <PhotoCropper
          file={coverFile}
          // La portada se ve más ancha que alta, y bastante más en el
          // portátil que en el móvil: este marco es el término medio.
          ratio={2.4}
          maxSide={photoMaxSide('cover')}
          title="Portada de la casa"
          hint="La foto grande de la pantalla de inicio. Lo que quede dentro del marco es lo que se verá."
          onCancel={() => setCoverFile(null)}
          onConfirm={(cropped) => {
            setCoverFile(null);
            void changeCover(cropped);
          }}
        />
      )}
    </Modal>
  );
}
