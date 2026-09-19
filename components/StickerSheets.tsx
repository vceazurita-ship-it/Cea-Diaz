'use client';

import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/ui/Toast';
import { jpegPagesToPdf, type PdfPage } from '@/lib/pdf';
import {
  PRINT_PX_PER_MM,
  SHEETS,
  SIZES,
  STICKERS,
  drawSheet,
  layoutFor,
  type StickerSheet,
} from '@/lib/stickers';

/* =========================================================================
 *  Ajustes → Pegatinas.
 *
 *  Folios de pegatinas redondas para las chapas de Hugo y Leo. Se elige qué
 *  hojas y de qué tamaño, se ve el folio tal cual saldrá y se descarga un PDF
 *  de A4 que, impreso «a tamaño real», da chapas del diámetro elegido.
 * ========================================================================= */

/** Lo que cuenta cada hoja, para que el rótulo no diga «17» a secas. */
function countFor(sheet: StickerSheet): number {
  return STICKERS.filter((sticker) => sheet.groups.includes(sticker.group)).length;
}

/** Un lienzo a JPEG, en bytes, que es lo que mete el PDF tal cual. */
async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('No se ha podido preparar la hoja.');
  return new Uint8Array(await blob.arrayBuffer());
}

export function StickerSheets() {
  const notify = useToast();
  const [chosen, setChosen] = useState<string[]>(SHEETS.map((sheet) => sheet.id));
  const [diameter, setDiameter] = useState<number>(SIZES[0].mm);
  const [preview, setPreview] = useState<string>(SHEETS[0].id);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  const layout = layoutFor(diameter);
  const perSheet = layout.columns * layout.rows;
  const previewSheet = SHEETS.find((sheet) => sheet.id === preview) ?? SHEETS[0];

  // La vista previa se pinta con el mismo dibujo que el PDF, a menos detalle.
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    let cancelled = false;

    const scratch = document.createElement('canvas');
    void drawSheet(scratch, previewSheet, diameter, 3).then(() => {
      if (cancelled) return;
      target.width = scratch.width;
      target.height = scratch.height;
      target.getContext('2d')?.drawImage(scratch, 0, 0);
    });

    return () => {
      cancelled = true;
    };
  }, [previewSheet, diameter]);

  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const download = async () => {
    const sheets = SHEETS.filter((sheet) => chosen.includes(sheet.id));
    if (sheets.length === 0) return;
    setBusy(true);

    try {
      const pages: PdfPage[] = [];
      const page = document.createElement('canvas');
      for (const sheet of sheets) {
        await drawSheet(page, sheet, diameter, PRINT_PX_PER_MM);
        pages.push({ jpeg: await canvasToJpeg(page), width: page.width, height: page.height });
      }

      const url = URL.createObjectURL(jpegPagesToPdf(pages));
      const link = document.createElement('a');
      link.href = url;
      link.download = `pegatinas-chapas-${diameter}mm.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

      notify({
        message: `${sheets.length} ${sheets.length === 1 ? 'folio listo' : 'folios listos'} para imprimir.`,
        icon: '🖨️',
      });
    } catch (cause) {
      notify({
        message: cause instanceof Error ? cause.message : 'No se ha podido preparar el PDF.',
        icon: '⚠️',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border hairline surf-1 p-3">
      <div>
        <h3 className="mb-1 font-bold t-1">Pegatinas para chapas</h3>
        <p className="text-xs leading-relaxed t-3">
          Folios de pegatinas redondas, con fotos de verdad, para imprimir en papel adhesivo
          A4, recortar por la línea de puntos y pegar en las chapas de Hugo y Leo.
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide t-3">Hojas</p>
        <div className="grid grid-cols-2 gap-2">
          {SHEETS.map((sheet) => {
            const active = chosen.includes(sheet.id);
            return (
              <button
                key={sheet.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  toggle(sheet.id);
                  // Al meterla se enseña; al sacarla se deja ver la que había.
                  if (!active) setPreview(sheet.id);
                }}
                className={`flex items-center gap-2 rounded-2xl border p-2.5 text-left transition-colors
                  ${active ? 'border-accent bg-accent-faint' : 'hairline surf-2 hover-soft'}`}
              >
                <span aria-hidden className="text-xl">
                  {sheet.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold t-1">{sheet.title}</span>
                  <span className="block text-[10px] t-3">
                    {countFor(sheet)} fotos · {active ? 'en el PDF' : 'fuera'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide t-3">Tamaño</p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tamaño de la pegatina">
          {SIZES.map((size) => {
            const active = diameter === size.mm;
            return (
              <button
                key={size.mm}
                type="button"
                aria-pressed={active}
                onClick={() => setDiameter(size.mm)}
                className={`flex flex-col items-center gap-0.5 rounded-2xl border p-2 text-center transition-colors
                  ${active ? 'border-accent bg-accent-faint' : 'hairline surf-2 hover-soft'}`}
              >
                <span className="text-sm font-bold tabular-nums t-1">{size.mm} mm</span>
                <span className="text-[10px] font-bold t-2">{size.label}</span>
                <span className="text-[10px] leading-tight t-3">{size.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] t-3">
          {perSheet} pegatinas por folio ({layout.columns} × {layout.rows}).
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide t-3">
            Así sale: {previewSheet.title}
          </p>
          <div className="flex gap-1">
            {SHEETS.map((sheet) => (
              <button
                key={sheet.id}
                type="button"
                onClick={() => setPreview(sheet.id)}
                aria-label={`Ver ${sheet.title}`}
                aria-pressed={preview === sheet.id}
                className={`h-7 w-7 rounded-full text-sm transition-colors
                  ${preview === sheet.id ? 'bg-accent-faint' : 'hover-soft'}`}
              >
                {sheet.emoji}
              </button>
            ))}
          </div>
        </div>
        <canvas
          ref={canvas}
          aria-label={`Vista previa del folio de ${previewSheet.title}`}
          className="mx-auto block aspect-[210/297] w-full max-w-sm rounded-md bg-white shadow-md"
        />
      </div>

      <button
        type="button"
        onClick={() => void download()}
        disabled={busy || chosen.length === 0}
        className="btn-primary w-full"
      >
        {busy
          ? 'Preparando…'
          : chosen.length === 0
            ? 'Elige al menos una hoja'
            : `Descargar ${chosen.length} ${chosen.length === 1 ? 'folio' : 'folios'} en PDF`}
      </button>

      <p className="text-[11px] leading-relaxed t-3">
        Al imprimir, elige <strong>tamaño real</strong> o <strong>100 %</strong>, no «ajustar a
        la página»: si no, las chapas salen más pequeñas. La raya del pie mide 5 cm; si no los
        mide con una regla, la impresora ha encogido el folio.
      </p>
    </section>
  );
}
