'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* =========================================================================
 *  Elegir el trozo de la foto que se va a ver.
 *
 *  Cada hueco de la app tiene su forma —el redondel del retrato, la banda de
 *  la tarjeta, el cromo—, así que una foto vertical metida en una banda ancha
 *  acaba cortada por donde nadie querría. Aquí se ve el recorte real antes de
 *  guardar: se arrastra la foto, se acerca con dos dedos o con la barra, y lo
 *  que quede dentro del marco es exactamente lo que se guarda.
 *
 *  El recorte se hace en un lienzo y sale ya con la forma del hueco, así que
 *  `savePhotoSlot` sólo tiene que reducirlo.
 * ========================================================================= */

interface PhotoCropperProps {
  file: File;
  /** Ancho ÷ alto del hueco donde se pintará la foto. */
  ratio: number;
  /** El hueco es un redondel (el retrato), no un rectángulo. */
  round?: boolean;
  title: string;
  hint?: string;
  /** Lado mayor del recorte guardado, en píxeles. */
  maxSide: number;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

const MAX_ZOOM = 5;
/** Lo que se mueve el encuadre con cada toque de flecha, en píxeles. */
const NUDGE = 12;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function PhotoCropper({
  file,
  ratio,
  round,
  title,
  hint,
  maxSide,
  onCancel,
  onConfirm,
}: PhotoCropperProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  /* ------------------------------------------------------------- la foto */

  useEffect(() => {
    if (!file.type.startsWith('image/')) {
      setError('Ese archivo no es una imagen.');
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    let cancelled = false;

    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setError('No se ha podido abrir esa imagen.');
    };
    img.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  /* -------------------------------------------------------------- marco */

  // El marco se mide de verdad porque toda la cuenta del recorte va en
  // píxeles: cuánto se ve, cuánto se puede arrastrar y qué trozo se guarda.
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = stage.current;
    if (!node) return;

    const measure = () => setBox({ width: node.clientWidth, height: node.clientHeight });

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const frameW = box.width && box.height ? Math.min(box.width, box.height * ratio) : 0;
  const frameH = frameW / ratio;

  // «Cubrir» es la escala mínima con la que la foto tapa el marco entero: es
  // el zoom 1, y por eso nunca puede quedar una esquina vacía.
  const cover =
    image && frameW ? Math.max(frameW / image.naturalWidth, frameH / image.naturalHeight) : 0;
  const scale = cover * zoom;
  const shownW = image ? image.naturalWidth * scale : 0;
  const shownH = image ? image.naturalHeight * scale : 0;

  const limitX = Math.max(0, (shownW - frameW) / 2);
  const limitY = Math.max(0, (shownH - frameH) / 2);
  // Se ciñe al pintar y no al mover: así, al alejar, la foto vuelve sola a su
  // sitio sin necesidad de un efecto que persiga al estado.
  const at = { x: clamp(offset.x, -limitX, limitX), y: clamp(offset.y, -limitY, limitY) };

  /* ---------------------------------------------------------------- gestos */

  const applyZoom = useCallback(
    (factor: number) => {
      const next = clamp(zoom * factor, 1, MAX_ZOOM);
      if (next === zoom) return;

      // El desplazamiento crece con la escala para que el punto que está en el
      // centro del marco siga estando ahí después de acercar.
      const applied = next / zoom;
      setZoom(next);
      setOffset((current) => ({ x: current.x * applied, y: current.y * applied }));
    },
    [zoom],
  );

  /** Dedos apoyados ahora mismo: uno arrastra, dos pellizcan. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  const spread = () => {
    const [a, b] = Array.from(pointers.current.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  };

  const onPointerDown = (event: React.PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinch.current = spread();
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 1) {
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
      return;
    }

    const distance = spread();
    if (distance && pinch.current) applyZoom(distance / pinch.current);
    pinch.current = distance;
  };

  const onPointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    pinch.current = spread();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const steps: Record<string, [number, number]> = {
      ArrowUp: [0, -NUDGE],
      ArrowDown: [0, NUDGE],
      ArrowLeft: [-NUDGE, 0],
      ArrowRight: [NUDGE, 0],
    };
    const step = steps[event.key];
    if (!step) return;

    event.preventDefault();
    // Se mueve el encuadre, no la foto: la flecha arriba enseña lo de arriba.
    setOffset((current) => ({ x: current.x - step[0], y: current.y - step[1] }));
  };

  // Escape cierra sin guardar, como en el resto de diálogos.
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCancel();
    };

    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, [onCancel]);

  /* -------------------------------------------------------------- guardar */

  const accept = async () => {
    if (!image || !frameW || busy) return;
    setBusy(true);

    try {
      // Del marco en pantalla al trozo de la foto original que hay debajo.
      const cropW = frameW / scale;
      const cropH = frameH / scale;
      const left = clamp(
        image.naturalWidth / 2 - at.x / scale - cropW / 2,
        0,
        Math.max(0, image.naturalWidth - cropW),
      );
      const top = clamp(
        image.naturalHeight / 2 - at.y / scale - cropH / 2,
        0,
        Math.max(0, image.naturalHeight - cropH),
      );

      const shrink = Math.min(1, maxSide / Math.max(cropW, cropH));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(cropW * shrink));
      canvas.height = Math.max(1, Math.round(cropH * shrink));

      const context = canvas.getContext('2d');
      if (!context) throw new Error('El navegador no permite recortar la imagen.');
      context.drawImage(image, left, top, cropW, cropH, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('No se ha podido recortar la imagen.');

      onConfirm(new File([blob], jpegName(file.name), { type: 'image/jpeg' }));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'No se ha podido recortar.');
      setBusy(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    // Cuelga del <body> a propósito: el panel que lo abre lleva una animación
    // con `transform`, y eso encerraría lo `fixed` dentro de su caja.
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm
                 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex w-full flex-col rounded-t-3xl border hairline surf-raised p-4
                   sm:max-w-2xl sm:rounded-3xl"
        style={{
          boxShadow: 'var(--shadow-pop)',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold t-1">{title}</h2>
            <p className="text-xs t-3">
              {hint ?? 'Arrastra la foto y acércala hasta dejar dentro lo que quieres que se vea.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="btn-ghost h-11 w-11 shrink-0 p-0 text-base"
            aria-label="Cerrar sin guardar"
          >
            ✕
          </button>
        </div>

        {/* ---------------------------------------------------------- marco */}
        <div
          ref={stage}
          className="relative flex h-[42vh] max-h-[420px] min-h-[180px] items-center justify-center"
        >
          {image && frameW ? (
            <div
              role="application"
              tabIndex={0}
              aria-label="Encuadre de la foto: arrastra o usa las flechas para moverla"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              onWheel={(event) => applyZoom(Math.exp(-event.deltaY / 320))}
              className={`relative touch-none overflow-hidden border-2 border-white/80 outline-none
                          focus-visible:border-accent
                          ${round ? 'rounded-full' : 'rounded-xl'}`}
              style={{ width: frameW, height: frameH, cursor: 'grab' }}
            >
              {/* Es un blob local: `next/image` no sabe optimizarlo. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: shownW,
                  height: shownH,
                  transform: `translate(calc(-50% + ${at.x}px), calc(-50% + ${at.y}px))`,
                }}
              />
            </div>
          ) : (
            <p className="text-sm t-3">{error ?? 'Abriendo la foto…'}</p>
          )}
        </div>

        {/* ----------------------------------------------------------- zoom */}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => applyZoom(1 / 1.25)}
            disabled={!image || zoom <= 1}
            className="btn-ghost h-10 w-10 shrink-0 p-0 text-base"
            aria-label="Alejar"
          >
            −
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!image}
            onChange={(event) => applyZoom(Number(event.target.value) / zoom)}
            className="h-11 w-full accent-[var(--accent)]"
            aria-label="Acercar o alejar la foto"
          />
          <button
            type="button"
            onClick={() => applyZoom(1.25)}
            disabled={!image || zoom >= MAX_ZOOM}
            className="btn-ghost h-10 w-10 shrink-0 p-0 text-base"
            aria-label="Acercar"
          >
            +
          </button>
        </div>

        {error && image && (
          <p className="mt-2 text-xs t-danger" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1 py-2.5 text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void accept()}
            disabled={!image || busy}
            className="btn-primary flex-1 py-2.5 text-sm"
          >
            {busy ? '⏳ Recortando…' : '✅ Usar este trozo'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** El recorte sale siempre en JPEG: el nombre debe decir la verdad. */
function jpegName(name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.jpg`;
}
