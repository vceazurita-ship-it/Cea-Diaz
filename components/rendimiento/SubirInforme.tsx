'use client';

import { useMemo, useRef, useState } from 'react';

import { useToast } from '@/components/ui/Toast';
import { CLASE_ICON, CLASE_LABEL, leerInforme, type Lectura } from '@/lib/informes';
import { PROFILES } from '@/lib/profiles';
import type { DateKey, Profile, ProfileId } from '@/types';

/* =========================================================================
 *  Soltar aquí los informes y que se repartan solos.
 *
 *  Es el botón que hace que todo lo demás exista. Sin él, cada trimestre hay
 *  que copiar a mano ocho cifras de un PDF, para dos niños y cuatro clases de
 *  documento, y eso se deja de hacer al segundo intento.
 *
 *  Se puede soltar **la carpeta entera**. Cada archivo dice de quién es —lo
 *  lleva escrito dentro, o en el nombre—, qué es y de cuándo, así que no hay
 *  que elegir nada: se elige la carpeta, se escribe una vez la contraseña de
 *  los informes cerrados, y se guarda.
 *
 *  Tres reglas que no se tocan:
 *
 *   1. **Los archivos no salen del aparato.** Se leen aquí y se tiran. No se
 *      suben a ningún sitio y no entran en el repositorio, que es público.
 *      Lo único que se guarda son las cifras, en la cuenta de la familia.
 *   2. **Nada se guarda sin verlo.** Un lector de PDF se equivoca, y una
 *      cifra mal leída envenena el análisis entero. Primero se enseña lo que
 *      ha entendido, y se guarda al confirmarlo.
 *   3. **Lo que no entiende, lo dice.** Sin adivinar y sin callarse.
 * ========================================================================= */

interface SubirInformeProps {
  /** El perfil desde el que se abre: el que se supone si un archivo no lo dice. */
  profile: Profile;
  /** Guarda una línea en las notas del día de quien sea. */
  onSave: (profileId: ProfileId, date: DateKey, key: string, line: string) => void;
  onClose: () => void;
}

export function SubirInforme({ profile, onSave, onClose }: SubirInformeProps) {
  const toast = useToast();
  const archivosRef = useRef<HTMLInputElement>(null);
  const carpetaRef = useRef<HTMLInputElement>(null);

  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0 });
  const [archivos, setArchivos] = useState<File[]>([]);
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [clave, setClave] = useState('');

  const nombreDe = (id: ProfileId) => PROFILES.find((item) => item.id === id)?.name ?? id;

  const procesar = async (files: File[], password?: string, previas?: Lectura[]) => {
    setLeyendo(true);
    setProgreso({ hechos: 0, total: files.length });
    try {
      const salida: Lectura[] = [];
      for (let i = 0; i < files.length; i++) {
        const previa = previas?.[i];
        // Con contraseña sólo se vuelven a abrir los que la pedían; los demás
        // ya están leídos y no hace falta tocarlos.
        if (password && previa && !previa.pideClave) salida.push(previa);
        else salida.push(await leerInforme(files[i], profile.id, { data: previa?.data, password }));
        setProgreso({ hechos: i + 1, total: files.length });
      }
      setLecturas(salida);
    } finally {
      setLeyendo(false);
    }
  };

  const elegir = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // De una carpeta llegan también archivos que no vienen a cuento.
    const utiles = Array.from(files).filter((file) => /\.(pdf|txt|csv|md)$/i.test(file.name));
    if (utiles.length === 0) {
      toast({ message: 'En esa carpeta no hay ningún PDF ni archivo de texto.' });
      return;
    }
    setArchivos(utiles);
    void procesar(utiles);
  };

  const reintentar = () => {
    if (!clave) return;
    void procesar(archivos, clave, lecturas);
  };

  /** Lo que se va a guardar, agrupado por niño. */
  const porNino = useMemo(() => {
    const mapa = new Map<ProfileId, number>();
    for (const lectura of lecturas) {
      for (const apunte of lectura.apuntes) {
        mapa.set(apunte.profileId, (mapa.get(apunte.profileId) ?? 0) + 1);
      }
    }
    return [...mapa.entries()];
  }, [lecturas]);

  const total = porNino.reduce((sum, [, cuantos]) => sum + cuantos, 0);
  const pideClave = lecturas.some((lectura) => lectura.pideClave);

  const guardar = () => {
    let cuantos = 0;
    for (const lectura of lecturas) {
      for (const apunte of lectura.apuntes) {
        onSave(apunte.profileId, apunte.date, apunte.key, apunte.line);
        cuantos++;
      }
    }
    if (cuantos === 0) {
      toast({ message: 'No hay nada que guardar.' });
      return;
    }
    toast({
      icon: '📄',
      message: `Guardado: ${cuantos} ${cuantos === 1 ? 'informe' : 'informes'} en ${porNino
        .map(([id]) => nombreDe(id))
        .join(' y ')}.`,
    });
    onClose();
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-snug t-2">
        Suelta aquí los informes —o la carpeta entera— y cada uno se coloca solo: pruebas físicas de RX2, boletines del
        colegio y valoraciones neuropsicológicas, de Leo y de Hugo a la vez. Se leen en este aparato y no se suben a
        ningún sitio: sólo se guardan las cifras.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <input
          ref={archivosRef}
          type="file"
          accept=".pdf,.txt,.csv,.md"
          multiple
          className="hidden"
          onChange={(event) => {
            elegir(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={carpetaRef}
          type="file"
          className="hidden"
          multiple
          // Sólo lo entienden los navegadores de escritorio; en el móvil el
          // botón de archivos sueltos hace lo mismo.
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(event) => {
            elegir(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => archivosRef.current?.click()}
          disabled={leyendo}
          className="btn-primary text-sm"
        >
          📄 Archivos
        </button>
        <button
          type="button"
          onClick={() => carpetaRef.current?.click()}
          disabled={leyendo}
          className="btn-ghost text-sm"
        >
          📁 Carpeta entera
        </button>
      </div>

      {leyendo && (
        <div className="rounded-xl border p-3 hairline surf-1">
          <p className="text-[12px] font-semibold t-1">
            Leyendo {progreso.hechos} de {progreso.total}…
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width]"
              style={{ width: `${progreso.total ? (progreso.hechos / progreso.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {pideClave && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <label className="block text-[12px] font-semibold t-1">
            Contraseña de los informes cerrados
            <input
              type="password"
              value={clave}
              onChange={(event) => setClave(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') reintentar();
              }}
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm hairline surf-1"
              placeholder="la que os dieron con el informe"
            />
          </label>
          <button
            type="button"
            onClick={reintentar}
            disabled={!clave || leyendo}
            className="btn-primary mt-2 w-full text-sm disabled:opacity-40"
          >
            🔓 Abrir los que faltan
          </button>
          <p className="mt-1.5 text-[11px] leading-snug t-3">
            Se usa aquí para abrirlos y no se guarda en ningún sitio. Si cada niño tiene la suya, se hace en dos veces.
          </p>
        </div>
      )}

      {lecturas.length > 0 && (
        <ul className="space-y-2">
          {lecturas.map((lectura) => (
            <li key={lectura.file} className="rounded-xl border p-2.5 hairline surf-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-[12px] font-black t-1">
                  <span aria-hidden>{CLASE_ICON[lectura.clase]}</span> {lectura.file}
                </p>
                {lectura.apuntes.length > 0 && lectura.who && (
                  <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                    {nombreDe(lectura.who)}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] t-3">{CLASE_LABEL[lectura.clase]}</p>

              {lectura.warnings.map((warning) => (
                <p key={warning} className="mt-1 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                  ⚠️ {warning}
                </p>
              ))}

              {lectura.apuntes.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {lectura.apuntes.map((apunte) => (
                    <li key={`${apunte.date}-${apunte.key}`} className="flex items-baseline gap-2 text-[11px]">
                      <span className="shrink-0 font-black tabular-nums t-2">{apunte.date}</span>
                      <span className="min-w-0 flex-1 t-3">{apunte.resumen}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {total > 0 && (
        <p className="text-center text-[12px] font-semibold t-1">
          {total} {total === 1 ? 'informe' : 'informes'} para{' '}
          {porNino.map(([id, n]) => `${nombreDe(id)} (${n})`).join(' y ')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="btn-ghost text-sm">
          Cancelar
        </button>
        <button type="button" onClick={guardar} disabled={total === 0} className="btn-primary text-sm disabled:opacity-40">
          Guardar
        </button>
      </div>
    </div>
  );
}
