import { unzipSync, strFromU8 } from 'fflate';

import type { FinanceBook, FinanceItem, FinanceMonth, FinanceMonthLine } from '@/types';

/* =========================================================================
 *  Los meses cerrados: el extracto real, al lado del mes tipo.
 *
 *  Las libretas cuentan cómo debería ser un mes —lo que se aparta para la
 *  casa, para el colegio, para la gasolina—. Pero Víctor lleva además, en la
 *  hoja del año, una pestaña por mes con lo que de verdad pasó por la cuenta:
 *  el saldo con el que se empezó, cada concepto con su ingreso o su gasto y
 *  el saldo con el que se acabó. Eso es lo que se guarda aquí.
 *
 *  Y es lo que hace útil al resto: sin el mes real, «previsión contra real»
 *  depende de que alguien teclee el real a mano; con él, la app sabe sola que
 *  en el súper se fueron 700 € cuando se apartaban 350.
 *
 *  La hoja se lee aquí mismo, en el navegador: un .xlsx es un zip con XML
 *  dentro, y `fflate` —que ya viene con jspdf— lo abre sin mandar el archivo
 *  a ninguna parte. **Las cifras no tocan el repositorio**, que es público:
 *  van a la libreta del aparato y, de ahí, a la cuenta de casa.
 * ========================================================================= */

/** Tope de meses guardados: cinco años, de sobra para mirar atrás. */
const MAX_CLOSINGS = 60;
/** Tope de líneas en un mes. La hoja anda por las cuarenta. */
const MAX_LINES = 120;

/* ------------------------------------------------------------- normalizar */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeLine(value: unknown, index: number): FinanceMonthLine | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<FinanceMonthLine>;
  const income = Number(raw.income);
  const expense = Number(raw.expense);

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `lin-${index}`,
    label: typeof raw.label === 'string' ? raw.label.slice(0, 80) : '',
    income: Number.isFinite(income) ? income : 0,
    expense: Number.isFinite(expense) ? expense : 0,
    category: typeof raw.category === 'string' && raw.category ? raw.category.slice(0, 60) : undefined,
    oneOff: raw.oneOff === true ? true : undefined,
  };
}

export function normalizeClosings(value: unknown): FinanceMonth[] {
  if (!Array.isArray(value)) return [];

  const out: FinanceMonth[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Partial<FinanceMonth>;
    if (typeof raw.month !== 'string' || !/^\d{4}-\d{2}$/.test(raw.month.slice(0, 7))) continue;
    const opening = Number(raw.opening);

    out.push({
      month: raw.month.slice(0, 7),
      opening: Number.isFinite(opening) ? opening : 0,
      lines: (Array.isArray(raw.lines) ? raw.lines : [])
        .map((line, index) => normalizeLine(line, index))
        .filter((line): line is FinanceMonthLine => line !== null)
        .slice(0, MAX_LINES),
      source: typeof raw.source === 'string' ? raw.source.slice(0, 120) : undefined,
      importedAt: typeof raw.importedAt === 'string' ? raw.importedAt : new Date(0).toISOString(),
    });
  }

  // Un mes, una entrada: si viniera repetido manda el último.
  const byMonth = new Map(out.map((row) => [row.month, row]));
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-MAX_CLOSINGS);
}

/* ---------------------------------------------------------------- cuentas */

export interface MonthTotals {
  income: number;
  expense: number;
  /** Lo que ganó o perdió la cuenta en el mes. */
  result: number;
  closing: number;
  /** Lo apartado como puntual, que se quita al juzgar si el mes fue normal. */
  oneOff: number;
}

export function monthTotals(month: FinanceMonth): MonthTotals {
  let income = 0;
  let expense = 0;
  let oneOff = 0;

  for (const line of month.lines) {
    income += line.income;
    expense += line.expense;
    if (line.oneOff) oneOff += lineSpend(line);
  }

  return {
    income: round2(income),
    expense: round2(expense),
    result: round2(income - expense),
    closing: round2(month.opening + income - expense),
    oneOff: round2(oneOff),
  };
}

/**
 * Lo que de verdad costó una línea.
 *
 * En la hoja hay conceptos que entran y salen a la vez —el teléfono que paga
 * otro, el seguro que se devuelve—: suman al saldo igual, pero no son gasto
 * de la casa. Contra la previsión cuenta sólo lo que queda de neto.
 */
export function lineSpend(line: FinanceMonthLine): number {
  if (line.expense > 0 && line.income > 0) return Math.max(0, round2(line.expense - line.income));
  return line.expense;
}

/** Ingresos de verdad: sin lo que sólo pasa por la cuenta de ida y vuelta. */
export function lineIncome(line: FinanceMonthLine): number {
  if (line.expense > 0 && line.income > 0) return Math.max(0, round2(line.income - line.expense));
  return line.income;
}

export interface CategoryRow {
  /** El concepto de la libreta, o vacío para lo que no tiene casilla. */
  category: string;
  item?: FinanceItem;
  /** Lo que se fue de verdad, sin lo puntual. */
  real: number;
  /** Y lo puntual, aparte. */
  oneOff: number;
  /** Lo que se apartaba: el real de la libreta si lo hay, si no la previsión. */
  planned: number;
  lines: FinanceMonthLine[];
}

/** Lo que se apartaba para un concepto en el mes tipo. */
function plannedOf(item: FinanceItem): number {
  return item.alt ?? item.amount;
}

/**
 * El mes, concepto a concepto, contra lo apartado.
 *
 * Van todos los conceptos de la libreta aunque el mes no tocara alguno —un
 * mes sin gasolina también es información— y, al final, lo que no tiene
 * casilla, que es lo primero que conviene repasar.
 */
export function monthByCategory(month: FinanceMonth, book: FinanceBook): CategoryRow[] {
  const items = book.ledgers.gastos;
  const rows = new Map<string, CategoryRow>();

  for (const item of items) {
    const key = item.label.trim();
    if (!key || rows.has(key)) continue;
    rows.set(key, { category: key, item, real: 0, oneOff: 0, planned: plannedOf(item), lines: [] });
  }

  const loose: CategoryRow = { category: '', real: 0, oneOff: 0, planned: 0, lines: [] };

  for (const line of month.lines) {
    const spend = lineSpend(line);
    if (spend <= 0) continue;
    const row = (line.category && rows.get(line.category)) || loose;
    if (line.oneOff) row.oneOff = round2(row.oneOff + spend);
    else row.real = round2(row.real + spend);
    row.lines.push(line);
  }

  const list = [...rows.values()].filter((row) => row.real > 0 || row.oneOff > 0 || row.planned > 0);
  list.sort((a, b) => b.real + b.oneOff - (a.real + a.oneOff) || b.planned - a.planned);
  if (loose.lines.length > 0) list.push(loose);
  return list;
}

/* ---------------------------------------------------- dónde va cada línea */

function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Pistas para saber a qué concepto de la libreta pertenece una línea del
 * extracto. Son nombres de tiendas y de servicios corrientes, ninguna cifra;
 * el primer acierto manda, así que lo más concreto va antes.
 *
 * La línea sólo se casa si la libreta tiene ese concepto: con una libreta
 * distinta, lo que no encuentre casilla se queda sin ella y se elige a mano.
 */
const RULES: Array<{ to: string[]; words: string[] }> = [
  { to: ['Seguro del coche'], words: ['seguro coche', 'seguro mercedes', 'seguro auto', 'mutua', 'linea directa'] },
  { to: ['Seguro dental', 'Imprevistos'], words: ['dental', 'dentista', 'ortodon', 'clinica'] },
  { to: ['Coche'], words: ['taller', 'itv', 'neumatic', 'reparacion coche', 'mecanic'] },
  { to: ['Abono del Madrid'], words: ['abono'] },
  { to: ['Casa'], words: ['alquiler', 'hipoteca', 'comunidad', 'ikea', 'mr casa', 'leroy', 'vente unique', 'bricomart'] },
  { to: ['Suministros'], words: ['electricidad', 'iberdrola', 'endesa', 'naturgy', 'agua', 'gas natural', 'luz'] },
  { to: ['Móvil e internet'], words: ['movistar', 'masmovil', 'vodafone', 'orange', 'xfera', 'digi', 'fibra', 'telefon', 'pepephone', 'yoigo'] },
  { to: ['Gasolina y transporte'], words: ['gasolin', 'repsol', 'cepsa', 'galp', 'autopista', 'peaje', 'parking', 'aparcamiento', 'metro', 'renfe', 'taxi', 'uber', 'cabify', 'emt'] },
  { to: ['Comida'], words: ['supermercado', 'mercadona', 'carrefour', 'lidl', 'aldi', 'alcampo', 'ahorramas', 'eroski', 'hipercor', 'herbo', 'fruteria', 'carniceria', 'panaderia', 'dia '] },
  { to: ['Colegio'], words: ['colegio', 'uniforme', 'libros', 'comedor', 'ampa'] },
  { to: ['Actividades de los peques'], words: ['futsal', 'campus', 'rfef', 'federacion', 'escuela', 'academia', 'natacion', 'extraescolar'] },
  { to: ['Ropa de los peques'], words: ['decathlon', 'primark', 'adidas', 'nike', 'zara', 'merkal', 'calzado', 'hns', 'kiabi', 'camiseta'] },
  { to: ['Peluquería'], words: ['peluqueria', 'barberia', 'pelu'] },
  { to: ['Regalos'], words: ['regalo', 'cumple', 'juguet', 'primor', 'perfumeria'] },
  { to: ['Cenas y planes con María', 'Ocio'], words: ['restaurante', 'cena', 'bar '] },
  { to: ['Ocio'], words: ['prime video', 'netflix', 'spotify', 'hbo', 'disney', 'groupon', 'feria', 'cine', 'teatro', 'ocio', 'parque'] },
  { to: ['Imprevistos'], words: ['farmacia', 'multa', 'veterinari'] },
];

/** El concepto de la libreta que le toca a una línea, si lo encuentra. */
export function guessCategory(label: string, book: FinanceBook): string | undefined {
  const text = ` ${plain(label)} `;
  const mine = new Map(book.ledgers.gastos.map((item) => [plain(item.label), item.label]));

  // Primero, que la línea se llame como un concepto de la libreta.
  for (const [key, original] of mine) {
    if (key && text.includes(` ${key} `)) return original;
  }

  for (const rule of RULES) {
    if (!rule.words.some((word) => text.includes(word.endsWith(' ') ? ` ${word}` : word))) continue;
    for (const target of rule.to) {
      const hit = mine.get(plain(target));
      if (hit) return hit;
    }
  }

  return undefined;
}

/**
 * Lo que la memoria de la casa ya sabe: si en un mes anterior una línea con
 * el mismo nombre se llevó a un concepto, la nueva va al mismo sitio. Así lo
 * que se corrige a mano una vez no hay que corregirlo cada mes.
 */
function learnedCategory(label: string, book: FinanceBook): string | undefined {
  const key = plain(label);
  const known = new Set(book.ledgers.gastos.map((item) => item.label));
  for (const month of [...(book.closings ?? [])].reverse()) {
    const line = month.lines.find((entry) => plain(entry.label) === key && entry.category);
    if (line?.category && known.has(line.category)) return line.category;
  }
  return undefined;
}

/**
 * ¿Pinta a gasto puntual? Lo que en una sola línea triplica lo apartado para
 * su concepto en todo el mes —y pasa de quinientos euros— no es el mes de
 * siempre: es el dentista o el taller. Es sólo la propuesta; se cambia a mano.
 */
function looksOneOff(line: FinanceMonthLine, category: string | undefined, book: FinanceBook): boolean {
  const spend = lineSpend(line);
  if (spend < 500) return false;
  const item = book.ledgers.gastos.find((entry) => entry.label === category);
  const planned = item ? plannedOf(item) : 0;
  return spend >= Math.max(500, planned * 3);
}

/** Pone en el libro un mes recién traído, con cada línea en su casilla. */
export function putClosing(book: FinanceBook, month: FinanceMonth): FinanceBook {
  const lines = month.lines.map((line) => {
    const category =
      line.category ?? learnedCategory(line.label, book) ?? guessCategory(line.label, book);
    const oneOff = line.oneOff ?? (looksOneOff(line, category, book) || undefined);
    return { ...line, category, oneOff };
  });
  const rest = (book.closings ?? []).filter((row) => row.month !== month.month);
  return { ...book, closings: normalizeClosings([...rest, { ...month, lines }]) };
}

export function dropClosing(book: FinanceBook, monthKey: string): FinanceBook {
  return { ...book, closings: (book.closings ?? []).filter((row) => row.month !== monthKey) };
}

export function putClosingLine(
  book: FinanceBook,
  monthKey: string,
  line: FinanceMonthLine,
): FinanceBook {
  return {
    ...book,
    closings: (book.closings ?? []).map((row) =>
      row.month === monthKey
        ? { ...row, lines: row.lines.map((entry) => (entry.id === line.id ? line : entry)) }
        : row,
    ),
  };
}

/* ------------------------------------------------------------ los nombres */

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** «septiembre de 2026». */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return `${MONTH_NAMES[(month || 1) - 1]} de ${year}`;
}

/** «sept. 26», para las pestañas. */
export function monthShort(key: string): string {
  const [year, month] = key.split('-').map(Number);
  const name = MONTH_NAMES[(month || 1) - 1];
  return `${name.slice(0, month === 9 ? 4 : 3)} ${String(year).slice(2)}`;
}

/** El número de mes de una palabra: «SPTBRE», «Setiembre», «sep.»… */
function monthFromWord(word: string): number | null {
  const text = plain(word).replace(/\s+/g, '');
  if (text.length < 3) return null;
  if (/^(sep|spt|set)/.test(text)) return 9;
  const index = MONTH_NAMES.findIndex((name) => name.startsWith(text.slice(0, 3)));
  return index >= 0 ? index + 1 : null;
}

/* ------------------------------------------------------------ la hoja */

type Cell = string | number;
type Grid = Map<number, Map<number, Cell>>;

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

/** «AB12» → columna 28 (empezando en 1). */
function columnOf(ref: string): number {
  let column = 0;
  for (const char of ref.replace(/\d+$/, '')) column = column * 26 + (char.charCodeAt(0) - 64);
  return column;
}

function readGrid(xml: string, strings: string[]): Grid {
  const grid: Grid = new Map();

  for (const cell of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, letters, rowText, attrs, inner = ''] = cell;
    const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
    let value: Cell | undefined;

    if (type === 'inlineStr') {
      value = unescapeXml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
    } else {
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      if (raw === undefined) continue;
      if (type === 's') value = strings[Number(raw)] ?? '';
      else if (type === 'str' || type === 'e') value = unescapeXml(raw);
      else if (type === 'b') value = Number(raw);
      else value = Number(raw);
    }

    if (value === undefined || value === '') continue;
    const row = Number(rowText);
    if (!grid.has(row)) grid.set(row, new Map());
    grid.get(row)!.set(columnOf(letters), value);
  }

  return grid;
}

export interface SheetMonth {
  /** El nombre de la pestaña, tal cual. */
  sheet: string;
  closing: FinanceMonth;
  totals: MonthTotals;
  /**
   * Lo que la hoja dice en su fila de totales, para contrastar. Si no casa
   * con lo leído, algo se ha leído mal y se avisa antes de guardar nada.
   */
  sheetClosing?: number;
}

function asNumber(value: Cell | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const clean = value.replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Una pestaña del mes, leída.
 *
 * La hoja de Víctor tiene una forma fija —título, cabecera CONCEPTO /
 * INGRESOS / GASTOS / SALDO, una fila con la fecha y el saldo de partida, las
 * líneas y TOTALES—, pero se lee por los nombres de la cabecera y no por la
 * posición, para que una columna de más no lo descoloque todo.
 */
function readMonthSheet(sheet: string, grid: Grid, fallbackYear: number): SheetMonth | null {
  const rows = [...grid.keys()].sort((a, b) => a - b);

  let headerRow = -1;
  let colLabel = 1;
  let colIn = -1;
  let colOut = -1;
  let colBalance = -1;

  for (const row of rows.slice(0, 15)) {
    const cells = grid.get(row)!;
    for (const [column, value] of cells) {
      if (typeof value !== 'string') continue;
      const text = plain(value);
      if (text.startsWith('concepto')) colLabel = column;
      else if (text.startsWith('ingreso')) colIn = column;
      else if (text.startsWith('gasto')) colOut = column;
      else if (text.startsWith('saldo')) colBalance = column;
    }
    if (colIn > 0 && colOut > 0) {
      headerRow = row;
      break;
    }
  }
  if (headerRow < 0) return null;

  // El mes: del título si lo dice, si no del nombre de la pestaña.
  let month: number | null = null;
  let year: number | null = null;
  for (const row of rows.filter((r) => r < headerRow)) {
    for (const value of grid.get(row)!.values()) {
      if (typeof value !== 'string') continue;
      const found = /mes de\s+([a-záéíóú]+)\s+(?:de\s+)?(\d{4})/i.exec(value);
      if (found) {
        month = monthFromWord(found[1]);
        year = Number(found[2]);
      }
    }
  }
  month = month ?? monthFromWord(sheet);
  if (!month) return null;

  let opening = 0;
  let sheetClosing: number | undefined;
  const lines: FinanceMonthLine[] = [];

  for (const row of rows.filter((r) => r > headerRow)) {
    const cells = grid.get(row)!;
    const label = String(cells.get(colLabel) ?? '').trim();
    const income = asNumber(cells.get(colIn));
    const expense = asNumber(cells.get(colOut));
    const balance = colBalance > 0 ? cells.get(colBalance) : undefined;

    if (/^totales?\b/i.test(label)) {
      if (balance !== undefined) sheetClosing = asNumber(balance);
      break;
    }

    // La fila de partida: una fecha y un saldo, sin movimientos.
    const date = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(label);
    if (balance !== undefined && income === 0 && expense === 0 && lines.length === 0) {
      opening = asNumber(balance);
      if (date && !year) {
        const y = Number(date[3]);
        const fromMonth = Number(date[2]);
        year = (y < 100 ? 2000 + y : y) + (fromMonth === 12 ? 1 : 0);
      }
      continue;
    }

    if (!label || (income === 0 && expense === 0)) continue;
    lines.push({
      id: `lin-${row}`,
      label: label.slice(0, 80),
      income: round2(income),
      expense: round2(expense),
    });
  }

  const closing: FinanceMonth = {
    month: `${year ?? fallbackYear}-${String(month).padStart(2, '0')}`,
    opening: round2(opening),
    lines,
    importedAt: new Date().toISOString(),
  };

  return { sheet, closing, totals: monthTotals(closing), sheetClosing };
}

/**
 * Todas las pestañas de mes de un .xlsx.
 *
 * Las que no tienen la forma de un mes —un resumen, una pestaña de notas— se
 * saltan sin decir nada. Las vacías también: una pestaña de octubre con sólo
 * el saldo de partida no es un mes cerrado todavía.
 */
export function readWorkbook(data: Uint8Array, fileName = ''): SheetMonth[] {
  const files = unzipSync(data, {
    filter: (file) =>
      file.name.startsWith('xl/') && (file.name.endsWith('.xml') || file.name.endsWith('.rels')),
  });
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : '');

  const strings = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unescapeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );

  const rels = new Map<string, string>();
  for (const rel of text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(rel[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(rel[1])?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }

  const fallbackYear = Number(/20\d{2}/.exec(fileName)?.[0]) || new Date().getFullYear();
  const out: SheetMonth[] = [];

  for (const sheet of text('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unescapeXml(/\bname="([^"]+)"/.exec(sheet[1])?.[1] ?? '');
    const rid = /\br:id="([^"]+)"/.exec(sheet[1])?.[1];
    const path = rid ? rels.get(rid) : undefined;
    if (!path || !files[path]) continue;

    const month = readMonthSheet(name, readGrid(text(path), strings), fallbackYear);
    if (month && month.closing.lines.length > 0) {
      month.closing.source = fileName.slice(0, 120) || undefined;
      out.push(month);
    }
  }

  return out.sort((a, b) => a.closing.month.localeCompare(b.closing.month));
}

/** Cuadra lo leído con la fila de totales de la hoja, al céntimo. */
export function sheetMatches(month: SheetMonth): boolean {
  if (month.sheetClosing === undefined) return true;
  return Math.abs(month.sheetClosing - month.totals.closing) < 0.02;
}
