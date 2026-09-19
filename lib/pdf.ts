/* =========================================================================
 *  Un PDF de páginas-foto, hecho en el propio aparato.
 *
 *  Para imprimir pegatinas a su medida hace falta un archivo que diga «esto
 *  mide un A4»: una imagen suelta la encoge o la estira cada impresora a su
 *  manera. Un PDF con una foto a sangre por página sí sale al milímetro si se
 *  imprime «a tamaño real».
 *
 *  No hace falta librería: cada página es un JPEG metido tal cual (el filtro
 *  DCTDecode de PDF es precisamente JPEG), y lo demás son unas pocas líneas
 *  de texto con la tabla de posiciones al final.
 * ========================================================================= */

/** Un A4 en puntos PDF (1/72 de pulgada). */
export const A4_POINTS = { width: 595.28, height: 841.89 };

export interface PdfPage {
  jpeg: Uint8Array;
  /** Tamaño en píxeles del JPEG. */
  width: number;
  height: number;
}

const encoder = new TextEncoder();

export function jpegPagesToPdf(pages: PdfPage[]): Blob {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push('\nendobj\n');
  };

  // Objetos: 1 catálogo, 2 árbol de páginas y, por cada página, tres más:
  // la página, su imagen y el dibujo que coloca la imagen a sangre.
  const pageId = (index: number) => 3 + index * 3;
  const { width: W, height: H } = A4_POINTS;

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () =>
    push(
      `<< /Type /Pages /Count ${pages.length} /Kids [${pages
        .map((_, index) => `${pageId(index)} 0 R`)
        .join(' ')}] >>`,
    ),
  );

  pages.forEach((page, index) => {
    const id = pageId(index);
    const draw = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;

    object(id, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
          `/Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`,
      ),
    );
    object(id + 1, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      );
      push(page.jpeg);
      push('\nendstream');
    });
    object(id + 2, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  });

  const total = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let id = 1; id < total; id++) {
    push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}
