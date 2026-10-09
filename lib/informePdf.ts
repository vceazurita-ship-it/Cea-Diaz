import { jsPDF } from 'jspdf';
import { autoTable, type RowInput } from 'jspdf-autotable';

import { GRADE_NAME, average, gradeFor, reportsFor, termCount, type ReportCard } from '@/lib/academics';
import { COG_INDICES, bandOf, cogFor, type CogProfile } from '@/lib/cognitive';
import { addDays, formatMonth, parseDateKey, todayKey } from '@/lib/dates';
import { FITNESS_FIELDS, GROUP_LABEL, derive, formatValue as fitnessValue, testsFor, type FitnessTest } from '@/lib/fitness';
import { GPS_FIELDS, KIND_META, fieldOf, sessionsOf, statsOf, valueOf, type GpsFieldId } from '@/lib/gps';
import { SPORTS, getCategories } from '@/lib/habits';
import { getProfile } from '@/lib/profiles';
import { computeDayScore, formatMetricValue, metricRatio, summarizePeriod } from '@/lib/scoring';
import { SECCIONES, type Rango, type Seccion } from '@/lib/informePdfOpciones';
import type { DateKey, DayEntry, GpsSession, Metric, MetricValue, Profile, ProfileId } from '@/types';

/* =========================================================================
 *  Un PDF con lo que se elija, de uno o de los dos, del periodo que sea.
 *
 *  Todo lo que la aplicación sabe de Leo y de Hugo está repartido en cinco
 *  sitios: los hábitos del día, los entrenamientos y partidos del GPS, las
 *  pruebas físicas, los boletines y la valoración neuropsicológica. Para
 *  llevárselo al pediatra, al entrenador o a la tutora hace falta en papel,
 *  junto y ordenado, y sólo lo que toca.
 *
 *  Se hace en el propio aparato, como todo lo de los informes: las cifras
 *  no salen de aquí más que en el archivo que se descarga. Es texto de
 *  verdad, no una foto: se puede buscar y copiar.
 *
 *  Las fuentes de serie de un PDF sólo saben escribir el alfabeto latino,
 *  así que los emojis de la aplicación se quedan fuera del papel.
 * ========================================================================= */

export interface PeticionPdf {
  kids: ProfileId[];
  rango: Rango;
  secciones: Seccion[];
  entries: Record<string, DayEntry>;
}

/** Las notas que en realidad son datos guardados, no texto de nadie. */
const NOTAS_DE_DATOS = new Set(['prueba', 'boletin', 'cognitivo']);

const MARGIN = 14;
const INK: [number, number, number] = [30, 41, 59];
const SOFT: [number, number, number] = [100, 116, 139];

/* ---------------------------------------------------------------------------
 * Texto que una fuente de serie sepa escribir
 * ------------------------------------------------------------------------- */

const SUSTITUTOS: Record<string, string> = {
  '−': '-',
  '–': '-',
  '—': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '→': '->',
  ' ': ' ',
  ' ': ' ',
};

function txt(text: string | undefined | null): string {
  if (!text) return '';
  return Array.from(text)
    .map((char) => SUSTITUTOS[char] ?? char)
    .join('')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

const numero = (value: number, decimals = 0) =>
  value.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const pct = (ratio: number) => `${Math.round(ratio * 100)} %`;

const fecha = (key: DateKey) => {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
};

const enRango = (date: DateKey, rango: Rango) => date >= rango.from && date <= rango.to;

function rgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.replace(/./g, '$&$&') : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------------------------------------------------------------------------
 * El papel
 * ------------------------------------------------------------------------- */

class Papel {
  doc = new jsPDF({ unit: 'mm', format: 'a4' });
  y = MARGIN;
  color: [number, number, number] = INK;

  get ancho() {
    return this.doc.internal.pageSize.getWidth();
  }
  get alto() {
    return this.doc.internal.pageSize.getHeight();
  }

  /** Pasa de página si lo que viene no cabe. */
  sitio(mm: number) {
    if (this.y + mm > this.alto - MARGIN - 6) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  portada(profile: Profile, rango: Rango, secciones: Seccion[]) {
    const { doc } = this;
    doc.setFillColor(...this.color);
    doc.rect(0, 0, this.ancho, 34, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(txt(profile.name), MARGIN, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const edad = profile.age ? ` · ${profile.age} años` : '';
    doc.text(txt(`Informe de seguimiento${edad}`), MARGIN, 23);
    doc.text(txt(`${rango.label} · ${fecha(rango.from)} - ${fecha(rango.to)}`), MARGIN, 29);
    doc.setFontSize(8);
    doc.text(txt(`Generado el ${fecha(todayKey())}`), this.ancho - MARGIN, 29, { align: 'right' });

    this.y = 42;
    doc.setTextColor(...SOFT);
    doc.setFontSize(9);
    const indice = SECCIONES.filter((s) => secciones.includes(s.id)).map((s) => s.label).join(' · ');
    doc.text(doc.splitTextToSize(txt(`Contenido: ${indice}`), this.ancho - MARGIN * 2), MARGIN, this.y);
    this.y += 8;
  }

  titulo(text: string) {
    this.sitio(22);
    const { doc } = this;
    this.y += 3;
    doc.setFillColor(...this.color);
    doc.rect(MARGIN, this.y - 4.5, 1.6, 6.5, 'F');
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(txt(text), MARGIN + 4, this.y);
    this.y += 6;
  }

  subtitulo(text: string) {
    this.sitio(16);
    const { doc } = this;
    doc.setTextColor(...this.color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(txt(text), MARGIN, this.y + 1);
    this.y += 5;
  }

  parrafo(text: string, size = 9) {
    const { doc } = this;
    doc.setTextColor(...SOFT);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(txt(text), this.ancho - MARGIN * 2) as string[];
    this.sitio(lines.length * size * 0.42 + 2);
    doc.text(lines, MARGIN, this.y + 1);
    this.y += lines.length * size * 0.42 + 3;
  }

  /** Una fila de cifras grandes, como las tarjetas de la aplicación. */
  cifras(items: { label: string; value: string }[]) {
    this.sitio(18);
    const { doc } = this;
    const gap = 3;
    const w = (this.ancho - MARGIN * 2 - gap * (items.length - 1)) / items.length;
    items.forEach((item, i) => {
      const x = MARGIN + i * (w + gap);
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, this.y, w, 14, 2, 2, 'FD');
      doc.setTextColor(...this.color);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(txt(item.value), x + w / 2, this.y + 6.5, { align: 'center' });
      doc.setTextColor(...SOFT);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(txt(item.label), x + w / 2, this.y + 11, { align: 'center' });
    });
    this.y += 18;
  }

  tabla(head: string[], body: RowInput[], opts: { first?: number; fontSize?: number } = {}) {
    autoTable(this.doc, {
      startY: this.y,
      margin: { left: MARGIN, right: MARGIN, bottom: MARGIN + 4 },
      head: [head.map(txt)],
      body: body.map((row) => (Array.isArray(row) ? row.map((cell) => (typeof cell === 'string' ? txt(cell) : cell)) : row)),
      theme: 'striped',
      styles: { fontSize: opts.fontSize ?? 8, cellPadding: 1.6, textColor: INK, overflow: 'linebreak' },
      headStyles: { fillColor: this.color, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 248, 251] },
      columnStyles: opts.first ? { 0: { cellWidth: opts.first, fontStyle: 'bold' } } : { 0: { fontStyle: 'bold' } },
    });
    this.y = (this.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  vacio(text: string) {
    this.parrafo(text);
  }

  pies(nombre: string) {
    const { doc } = this;
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...SOFT);
      doc.text(txt(nombre), MARGIN, this.alto - 7);
      doc.text(`${i} / ${total}`, this.ancho - MARGIN, this.alto - 7, { align: 'right' });
    }
  }
}

/* ---------------------------------------------------------------------------
 * Hábitos
 * ------------------------------------------------------------------------- */

/** Los días del periodo que se pueden contar: ni antes del primer apunte ni después de hoy. */
function diasDe(kid: ProfileId, rango: Rango, entries: Record<string, DayEntry>): DateKey[] {
  const propios = Object.values(entries)
    .filter((e) => e.profileId === kid && Object.keys(e.values ?? {}).length > 0)
    .map((e) => e.date)
    .sort();
  if (propios.length === 0) return [];
  const from = rango.from > propios[0] ? rango.from : propios[0];
  const hoy = todayKey();
  const to = rango.to < hoy ? rango.to : hoy;
  const out: DateKey[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** El valor típico de un hábito en unos días, dicho como se diría en voz alta. */
function mediaDe(metric: Metric, values: MetricValue[]): string {
  if (values.length === 0) return '-';
  switch (metric.type) {
    case 'toggle':
      return `${values.filter((v) => v === true).length} de ${values.length} días`;
    case 'counter':
    case 'duration': {
      const nums = values.map(Number).filter(Number.isFinite);
      const media = nums.reduce((a, b) => a + b, 0) / nums.length;
      return `${numero(media, media < 10 ? 1 : 0)} ${metric.unit} (máx. ${numero(Math.max(...nums))})`;
    }
    case 'scale': {
      const nums = values.map(Number).filter(Number.isFinite);
      return formatMetricValue(metric, Math.round(nums.reduce((a, b) => a + b, 0) / nums.length));
    }
    case 'choice': {
      const cuenta = new Map<string, number>();
      for (const v of values) cuenta.set(String(v), (cuenta.get(String(v)) ?? 0) + 1);
      const [top] = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
      return `${formatMetricValue(metric, top[0])} (${top[1]} veces)`;
    }
  }
}

function habitos(papel: Papel, kid: ProfileId, rango: Rango, entries: Record<string, DayEntry>) {
  papel.titulo('Hábitos');
  const dias = diasDe(kid, rango, entries);
  const resumen = summarizePeriod(kid, dias, entries);
  if (resumen.trackedDays === 0) {
    papel.vacio('No hay ningún día apuntado en este periodo.');
    return;
  }

  papel.cifras([
    { label: 'días apuntados', value: `${resumen.trackedDays} / ${dias.length}` },
    { label: 'cumplimiento medio', value: pct(resumen.average) },
    { label: 'estrellas', value: String(resumen.totalStars) },
    { label: 'mejor racha', value: `${resumen.bestStreak} días` },
  ]);

  papel.subtitulo('Por áreas');
  papel.tabla(
    ['Área', 'Cumplimiento', 'Hábitos apuntados'],
    resumen.perCategory.map((c) => [c.label, c.filled ? pct(c.ratio) : '-', String(c.filled)]),
  );

  // Mes a mes, sólo si el periodo da para más de uno.
  const meses = new Map<string, DateKey[]>();
  for (const d of dias) meses.set(d.slice(0, 7), [...(meses.get(d.slice(0, 7)) ?? []), d]);
  if (meses.size > 1) {
    papel.subtitulo('Mes a mes');
    const categorias = getCategories(kid);
    papel.tabla(
      ['Mes', 'Días', 'Media', ...categorias.map((c) => c.label)],
      [...meses.entries()].map(([mes, keys]) => {
        const s = summarizePeriod(kid, keys, entries);
        return [
          formatMonth(`${mes}-01`),
          String(s.trackedDays),
          s.trackedDays ? pct(s.average) : '-',
          ...s.perCategory.map((c) => (c.filled ? pct(c.ratio) : '-')),
        ];
      }),
      { fontSize: 7.5 },
    );
  }

  papel.subtitulo('Hábito a hábito');
  const conDatos = dias.map((d) => entries[`${kid}:${d}`]).filter((e): e is DayEntry => Boolean(e));
  for (const categoria of getCategories(kid)) {
    // Los deportes van en su propia sección: aquí estorbarían.
    const metrics = categoria.metrics.filter((m) => !m.group);
    const filas = metrics
      .map((metric) => {
        const values = conDatos.map((e) => e.values[metric.id]).filter((v) => v !== undefined && v !== '');
        if (values.length === 0) return null;
        const ratios = values.map((v) => metricRatio(metric, v)).filter((r): r is number => r !== null);
        const cumple = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
        return [metric.label, String(values.length), mediaDe(metric, values), cumple === null ? '-' : pct(cumple)];
      })
      .filter((row): row is string[] => row !== null);
    if (filas.length === 0) continue;
    papel.tabla([categoria.label, 'Días', 'Lo habitual', 'Cumplimiento'], filas, { first: 62 });
  }
}

function diario(papel: Papel, kid: ProfileId, rango: Rango, entries: Record<string, DayEntry>) {
  papel.titulo('Hábitos día a día');
  const categorias = getCategories(kid);
  const filas = diasDe(kid, rango, entries)
    .map((d) => computeDayScore(kid, d, entries[`${kid}:${d}`]))
    .filter((s) => !s.empty)
    .map((s) => [
      `${fecha(s.date)} ${['L', 'M', 'X', 'J', 'V', 'S', 'D'][(parseDateKey(s.date).getDay() + 6) % 7]}`,
      pct(s.ratio),
      `${s.stars} / 5`,
      ...s.categories.map((c) => (c.filled ? pct(c.ratio) : '-')),
    ]);
  if (filas.length === 0) {
    papel.vacio('No hay ningún día apuntado en este periodo.');
    return;
  }
  papel.tabla(['Día', 'Total', 'Estrellas', ...categorias.map((c) => c.label)], filas, { fontSize: 7.5 });
}

/* ---------------------------------------------------------------------------
 * Entrenamientos (lo apuntado en «Rendimiento deportivo»)
 * ------------------------------------------------------------------------- */

function entrenos(papel: Papel, kid: ProfileId, rango: Rango, entries: Record<string, DayEntry>) {
  papel.titulo('Entrenamientos');
  const deporte = getCategories(kid).find((c) => c.layout === 'sports');
  const dias = diasDe(kid, rango, entries)
    .map((d) => entries[`${kid}:${d}`])
    .filter((e): e is DayEntry => Boolean(e));

  const find = (id: string) => deporte?.metrics.find((m) => m.id === id);
  const resumen: string[][] = [];
  const lista: string[][] = [];

  for (const sport of SPORTS) {
    const fue = dias.filter((e) => e.values[`sport.${sport.id}.asistencia`] === true);
    if (fue.length === 0) continue;
    const esfuerzo = find(`sport.${sport.id}.esfuerzo`);
    const sensaciones = find(`sport.${sport.id}.sensaciones`);
    const vals = (id: string) => fue.map((e) => e.values[id]).filter((v) => v !== undefined && v !== '');
    resumen.push([
      sport.label,
      String(fue.length),
      esfuerzo ? mediaDe(esfuerzo, vals(esfuerzo.id)) : '-',
      sensaciones ? mediaDe(sensaciones, vals(sensaciones.id)) : '-',
    ]);
    for (const e of fue) {
      lista.push([
        fecha(e.date),
        sport.label,
        esfuerzo ? formatMetricValue(esfuerzo, e.values[esfuerzo.id]) : '-',
        sensaciones ? formatMetricValue(sensaciones, e.values[sensaciones.id]) : '-',
        e.notes?.[deporte?.id ?? ''] ?? '',
      ]);
    }
  }

  const movimiento = find('actividad_diaria');
  const minutos = movimiento ? dias.map((e) => e.values[movimiento.id]).filter((v) => typeof v === 'number') : [];

  if (resumen.length === 0 && minutos.length === 0) {
    papel.vacio('No hay entrenamientos apuntados en este periodo.');
    return;
  }

  papel.cifras([
    { label: 'entrenamientos', value: String(lista.length) },
    { label: 'deportes', value: String(resumen.length) },
    {
      label: 'movimiento diario medio',
      value: movimiento && minutos.length ? mediaDe(movimiento, minutos).split(' (')[0] : '-',
    },
  ]);

  if (resumen.length) {
    papel.subtitulo('Por deporte');
    papel.tabla(['Deporte', 'Sesiones', 'Esfuerzo habitual', 'Sensaciones'], resumen);
    papel.subtitulo('Sesión a sesión');
    lista.sort((a, b) => a[0].split('/').reverse().join().localeCompare(b[0].split('/').reverse().join()));
    papel.tabla(['Día', 'Deporte', 'Esfuerzo', 'Sensaciones', 'Nota'], lista, { fontSize: 7.5 });
  }

  // Las marcas de los retos (toques, flexiones...): la mejor del periodo.
  const marcas = (deporte?.metrics ?? []).filter((m) => m.id.startsWith('reto.'));
  const filasMarcas = marcas
    .map((m) => {
      const nums = dias.map((e) => e.values[m.id]).filter((v): v is number => typeof v === 'number' && v > 0);
      if (nums.length === 0) return null;
      const unit = m.type === 'counter' || m.type === 'duration' ? ` ${m.unit}` : '';
      return [m.label, String(nums.length), `${numero(Math.max(...nums))}${unit}`, `${numero(nums[nums.length - 1])}${unit}`];
    })
    .filter((row): row is string[] => row !== null);
  if (filasMarcas.length) {
    papel.subtitulo('Marcas');
    papel.tabla(['Reto', 'Veces', 'Mejor', 'Última'], filasMarcas);
  }
}

/* ---------------------------------------------------------------------------
 * GPS
 * ------------------------------------------------------------------------- */

const cifraGps = (id: GpsFieldId, value: number | undefined) =>
  value === undefined ? '-' : numero(value, fieldOf(id).decimals);

function gps(papel: Papel, kid: ProfileId, rango: Rango) {
  papel.titulo('Partidos y entrenamientos con GPS');
  const sesiones: GpsSession[] = sessionsOf(kid)
    .filter((s) => enRango(s.date, rango))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sesiones.length === 0) {
    papel.vacio('No hay sesiones del GPS en este periodo.');
    return;
  }

  const partidos = sesiones.filter((s) => s.kind === 'partido').length;
  const minutos = sesiones.reduce((sum, s) => sum + (valueOf(s, 'minutes') ?? 0), 0);
  const km = sesiones.reduce((sum, s) => sum + (valueOf(s, 'distance') ?? 0), 0);
  papel.cifras([
    { label: 'sesiones', value: String(sesiones.length) },
    { label: 'partidos', value: String(partidos) },
    { label: 'minutos', value: numero(minutos) },
    { label: `${fieldOf('distance').unit} recorridos`, value: numero(km, 1) },
  ]);

  papel.subtitulo('Medias y mejores marcas');
  papel.tabla(
    ['Cifra', 'Sesiones', 'Media', 'Por hora', 'Mejor', 'Día', 'Última'],
    statsOf(sesiones).map((s) => {
      const f = fieldOf(s.id);
      return [
        `${f.label}${f.unit ? ` (${f.unit})` : ''}`,
        String(s.count),
        cifraGps(s.id, s.average),
        s.perHour === undefined ? '-' : cifraGps(s.id, s.perHour),
        cifraGps(s.id, s.best),
        fecha(s.bestOn),
        cifraGps(s.id, s.last),
      ];
    }),
    { first: 46 },
  );

  // Sólo las columnas que alguna sesión trae, para que quepan en el ancho.
  const columnas = GPS_FIELDS.filter((f) => sesiones.some((s) => valueOf(s, f.id) !== undefined));
  papel.subtitulo('Sesión a sesión');
  papel.tabla(
    ['Día', 'Tipo', ...columnas.map((f) => `${f.short}${f.unit ? ` ${f.unit}` : ''}`), 'Nota'],
    sesiones.map((s) => [
      fecha(s.date),
      KIND_META[s.kind].label + (s.goalkeeper ? ' (portero)' : ''),
      ...columnas.map((f) => cifraGps(f.id, valueOf(s, f.id))),
      s.note ?? '',
    ]),
    { fontSize: columnas.length > 9 ? 6.5 : 7.5 },
  );
}

/* ---------------------------------------------------------------------------
 * Pruebas físicas
 * ------------------------------------------------------------------------- */

function fisico(papel: Papel, kid: ProfileId, rango: Rango, entries: Record<string, DayEntry>) {
  papel.titulo('Pruebas físicas');
  const tests: FitnessTest[] = testsFor(entries, kid)
    .filter((t) => enRango(t.date, rango))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (tests.length === 0) {
    papel.vacio('No hay pruebas físicas en este periodo.');
    return;
  }

  // Las pruebas van en columnas: de seis en seis para que quepan.
  for (let i = 0; i < tests.length; i += 6) {
    const tanda = tests.slice(i, i + 6);
    const cambio = tests.length > 1 && i + 6 >= tests.length;
    const primera = tests[0];
    const ultima = tests[tests.length - 1];
    const filas: RowInput[] = [];
    const banda = (content: string): RowInput => [
      { content, colSpan: tanda.length + (cambio ? 2 : 1), styles: { fillColor: [232, 237, 243], textColor: papel.color, fontSize: 7 } },
    ];

    for (const grupo of ['estructura', 'salto', 'sprint'] as const) {
      const campos = FITNESS_FIELDS.filter(
        (f) => f.group === grupo && tests.some((t) => t[f.id] !== undefined),
      );
      if (campos.length === 0) continue;
      filas.push(banda(GROUP_LABEL[grupo].toUpperCase()));
      for (const f of campos) {
        const a = primera[f.id];
        const b = ultima[f.id];
        const delta =
          a !== undefined && b !== undefined && a !== 0
            ? `${b - a >= 0 ? '+' : ''}${fitnessValue(f.id, b - a)} (${b - a >= 0 ? '+' : ''}${numero(((b - a) / a) * 100, 1)} %)`
            : '-';
        filas.push([
          `${f.label} (${f.unit})`,
          ...tanda.map((t) => fitnessValue(f.id, t[f.id])),
          ...(cambio ? [delta] : []),
        ]);
      }
    }

    const derivadas: [string, (t: FitnessTest) => number | undefined, number][] = [
      ['IMC (kg/m²)', (t) => derive(t).bmi, 1],
      ['Fuerza de impulso (veces su peso)', (t) => derive(t).propulsiveBw, 2],
      ['RSImod (m/s)', (t) => derive(t).rsiMod, 2],
      ['Velocidad media en 20 m (km/h)', (t) => derive(t).meanSpeed20, 1],
    ];
    const conDerivadas = derivadas.filter(([, fn]) => tests.some((t) => fn(t) !== undefined));
    if (conDerivadas.length) {
      filas.push(banda('CALCULADO'));
      for (const [label, fn, dec] of conDerivadas) {
        filas.push([
          label,
          ...tanda.map((t) => {
            const v = fn(t);
            return v === undefined ? '-' : numero(v, dec);
          }),
          ...(cambio ? [''] : []),
        ]);
      }
    }

    papel.tabla(
      ['', ...tanda.map((t) => fecha(t.date)), ...(cambio ? [`Cambio desde ${fecha(primera.date)}`] : [])],
      filas,
      { first: 58 },
    );
  }

  const notas = tests.filter((t) => t.note?.trim());
  for (const t of notas) papel.parrafo(`${fecha(t.date)}: ${t.note}`);
}

/* ---------------------------------------------------------------------------
 * Colegio
 * ------------------------------------------------------------------------- */

function colegio(papel: Papel, kid: ProfileId, rango: Rango, entries: Record<string, DayEntry>) {
  papel.titulo('Colegio');
  const reports: ReportCard[] = reportsFor(entries, kid)
    .filter((r) => enRango(r.date, rango))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (reports.length === 0) {
    papel.vacio('No hay boletines en este periodo.');
    return;
  }

  for (const r of reports) {
    const media = average(r.rows);
    papel.subtitulo(`Curso ${r.course || '-'} · ${fecha(r.date)}${media ? ` · media ${numero(media, 1)} sobre 5` : ''}`);
    const evaluaciones = termCount(r.rows);
    papel.tabla(
      ['Asignatura', ...Array.from({ length: evaluaciones }, (_, i) => `${i + 1}ª eval.`), 'Nota que cuenta'],
      r.rows.map((row) => {
        const nota = gradeFor(row);
        return [
          row.label,
          ...Array.from({ length: evaluaciones }, (_, i) => row.terms[i] ?? '-'),
          nota ? GRADE_NAME[nota] : '-',
        ];
      }),
      { first: 62 },
    );
    if (r.note) papel.parrafo(r.note);
  }
}

/* ---------------------------------------------------------------------------
 * Valoración cognitiva
 * ------------------------------------------------------------------------- */

function cognitivo(papel: Papel, kid: ProfileId, rango: Rango, entries: Record<string, DayEntry>) {
  papel.titulo('Valoración neuropsicológica');
  const perfiles: CogProfile[] = cogFor(entries, kid)
    .filter((c) => enRango(c.date, rango))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (perfiles.length === 0) {
    papel.vacio('No hay valoraciones en este periodo.');
    return;
  }
  for (const p of perfiles) {
    papel.subtitulo(`${fecha(p.date)}${p.age ? ` · edad de baremo ${p.age}` : ''}`);
    papel.tabla(
      ['Índice', 'Puntuación', 'Percentil', 'Franja'],
      COG_INDICES.filter((i) => p.scores[i.id]).map((i) => {
        const s = p.scores[i.id]!;
        return [`${i.label} (${i.short})`, String(s.score), s.pct === undefined ? '-' : String(s.pct), bandOf(s.score).label];
      }),
      { first: 70 },
    );
    if (p.note) papel.parrafo(p.note);
  }
  papel.parrafo('Escala de media 100 y desviación 15: de 90 a 109 es la franja media.', 7.5);
}

/* ---------------------------------------------------------------------------
 * Notas sueltas
 * ------------------------------------------------------------------------- */

function notas(papel: Papel, kid: ProfileId, rango: Rango, entries: Record<string, DayEntry>) {
  papel.titulo('Notas del día');
  const categorias = new Map(getCategories(kid).map((c) => [c.id, c.label]));
  const filas: string[][] = [];
  const dias = Object.values(entries)
    .filter((e) => e.profileId === kid && enRango(e.date, rango))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const e of dias) {
    if (e.note?.trim()) filas.push([fecha(e.date), 'Día', e.note]);
    for (const [key, text] of Object.entries(e.notes ?? {})) {
      if (NOTAS_DE_DATOS.has(key) || !text.trim()) continue;
      filas.push([fecha(e.date), categorias.get(key) ?? (key === 'retos' ? 'Retos' : key), text]);
    }
  }
  if (filas.length === 0) {
    papel.vacio('No hay notas escritas en este periodo.');
    return;
  }
  papel.tabla(['Día', 'De', 'Nota'], filas, { first: 22 });
}

/* ---------------------------------------------------------------------------
 * Montarlo
 * ------------------------------------------------------------------------- */

/** El primer día del que hay algo de este niño: «Todo» empieza ahí, no en el año 2000. */
function primerDia(kid: ProfileId, entries: Record<string, DayEntry>): DateKey | undefined {
  const fechas = [
    ...Object.values(entries)
      .filter((e) => e.profileId === kid)
      .map((e) => e.date),
    ...sessionsOf(kid).map((s) => s.date),
  ];
  return fechas.length ? fechas.reduce((a, b) => (a < b ? a : b)) : undefined;
}

function informeDe(papel: Papel, kid: ProfileId, peticion: PeticionPdf) {
  const { secciones, entries } = peticion;
  const primero = primerDia(kid, entries);
  const rango = primero && primero > peticion.rango.from ? { ...peticion.rango, from: primero } : peticion.rango;
  const profile = getProfile(kid);
  papel.color = rgb(profile.accentDeep ?? profile.accent);
  papel.portada(profile, rango, secciones);
  const orden: Record<Seccion, () => void> = {
    habitos: () => habitos(papel, kid, rango, entries),
    diario: () => diario(papel, kid, rango, entries),
    entrenos: () => entrenos(papel, kid, rango, entries),
    gps: () => gps(papel, kid, rango),
    fisico: () => fisico(papel, kid, rango, entries),
    colegio: () => colegio(papel, kid, rango, entries),
    cognitivo: () => cognitivo(papel, kid, rango, entries),
    notas: () => notas(papel, kid, rango, entries),
  };
  for (const s of SECCIONES) if (secciones.includes(s.id)) orden[s.id]();
}

export interface ArchivoPdf {
  nombre: string;
  blob: Blob;
}

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Un archivo con todos los niños pedidos, uno detrás de otro. */
export function pdfJunto(peticion: PeticionPdf): ArchivoPdf {
  const papel = new Papel();
  peticion.kids.forEach((kid, i) => {
    if (i > 0) {
      papel.doc.addPage();
      papel.y = MARGIN;
    }
    informeDe(papel, kid, peticion);
  });
  const nombres = peticion.kids.map((k) => getProfile(k).name).join(' y ');
  papel.pies(`${nombres} · ${peticion.rango.label}`);
  return {
    nombre: `Informe-${slug(nombres)}-${slug(peticion.rango.label)}.pdf`,
    blob: papel.doc.output('blob'),
  };
}

/** Un archivo por niño. */
export function pdfPorNino(peticion: PeticionPdf): ArchivoPdf[] {
  return peticion.kids.map((kid) => pdfJunto({ ...peticion, kids: [kid] }));
}
