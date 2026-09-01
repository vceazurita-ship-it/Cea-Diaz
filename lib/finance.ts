import type { FinanceBook, FinanceItem, LedgerId } from '@/types';

/* =========================================================================
 *  Economía: las cuentas de Víctor.
 *
 *  Está calcada de la hoja de cálculo con la que ya lleva los cursos, porque
 *  esa hoja funciona y lo que fallaba era el sitio: treinta y tres pestañas
 *  en un Excel que sólo se abre en el ordenador de casa, con las cifras
 *  repartidas en bloques que hay que sumar a mano cada vez.
 *
 *  De ahí salen las seis libretas y, sobre todo, las tres preguntas que la
 *  hoja contesta y que aquí se contestan solas:
 *
 *   · **¿cuánto entra y cuánto sale al mes?** —el sueldo del club menos la
 *     comisión del agente, más lo de ESS, contra los gastos de la casa—;
 *   · **cuánto tengo de verdad**: las cuentas, más lo invertido, más lo que
 *     me deben, menos lo que debo;
 *   · y la que de verdad importa, **cuánto aguanto**: ese patrimonio dividido
 *     entre lo que se gasta en un mes. La hoja la tenía en una celda perdida
 *     («YEARS / MONTHS»); aquí es el número grande de arriba.
 *
 *  El curso va del 1 de agosto al 31 de julio, como en la hoja, y por eso el
 *  periodo se cuenta en meses y las vacaciones van aparte: son el pico que no
 *  cabe en el mes tipo.
 *
 *  **Aquí no hay ni una cifra suya.** El repositorio de esta app es público,
 *  así que lo que viaja en el código es la forma —cómo se llaman las cosas y
 *  cómo se suman— y los números viven sólo en el aparato, como el resto de lo
 *  que registra la familia. Por lo mismo, esta libreta no sube a la nube.
 * ========================================================================= */

export const FINANCE_KEY = 'habitos-familia:economia';

/** Marca de la libreta que nadie ha tocado. */
const NEVER = '1970-01-01T00:00:00.000Z';

/** Tope de apuntes por libreta. Más que esto deja de leerse de un vistazo. */
export const MAX_ITEMS = 60;

interface LedgerMeta {
  label: string;
  icon: string;
  /** Qué se está contando, dicho en una línea. */
  hint: string;
  /** Cómo se dice un apunte suyo, para los botones. */
  word: string;
  /**
   * Qué significa la cifra: un ritmo mensual —lo que entra o sale cada mes—
   * o un saldo, que es una foto de un momento.
   */
  rhythm: 'mes' | 'saldo';
  /** Si suma o resta al hacer la cuenta de la libreta. */
  sign: 1 | -1;
  /** Nombre de la cifra principal. */
  main: string;
  /** Nombre de la segunda cifra, cuando la libreta la usa. */
  alt?: string;
  /** Cómo se llama la nota, y si sale siempre o sólo cuando hay algo escrito. */
  noteLabel: string;
  notePlaceholder: string;
  /** `true` donde la nota es la mitad del valor del apunte y sale siempre. */
  noteAlways?: boolean;
}

/**
 * Las seis libretas. Son los seis bloques de la hoja, con el mismo criterio:
 * lo de arriba es el ritmo del mes y lo de abajo es la foto del patrimonio.
 */
export const LEDGERS: Record<LedgerId, LedgerMeta> = {
  ingresos: {
    label: 'Ingresos',
    icon: '💶',
    hint: 'Lo que entra cada mes. Lo que se descuenta —la comisión del agente, autónomos— va en negativo.',
    word: 'ingreso',
    rhythm: 'mes',
    sign: 1,
    main: 'Al mes',
    alt: 'Si llega a más',
    noteLabel: 'Nota',
    notePlaceholder: 'Lo que haga falta recordar',
  },
  gastos: {
    label: 'Gastos',
    icon: '🧾',
    hint: 'Lo que sale cada mes. La previsión es lo que se aparta; el real, lo que acaba yéndose.',
    word: 'gasto',
    rhythm: 'mes',
    sign: -1,
    main: 'Previsión',
    alt: 'Real',
    noteLabel: 'Nota',
    notePlaceholder: 'Lo que haga falta recordar',
  },
  cuentas: {
    label: 'Cuentas',
    icon: '🏦',
    hint: 'El dinero disponible ahora mismo, banco por banco.',
    word: 'cuenta',
    rhythm: 'saldo',
    sign: 1,
    main: 'Saldo',
    noteLabel: 'Nota',
    notePlaceholder: 'Para qué es, qué no se toca…',
  },
  inversiones: {
    label: 'Inversiones',
    icon: '📈',
    hint: 'Lo que está puesto a trabajar: fondos y participaciones.',
    word: 'inversión',
    rhythm: 'saldo',
    sign: 1,
    main: 'Valor de hoy',
    noteLabel: 'Nota',
    notePlaceholder: 'Participaciones, fecha del último dato…',
  },
  cobros: {
    label: 'Me deben',
    icon: '🫱',
    hint: 'Lo que está por cobrar. Apunta al lado cuándo toca reclamarlo: es la mitad del valor de tenerlo escrito.',
    word: 'cobro',
    rhythm: 'saldo',
    sign: 1,
    main: 'Cantidad',
    noteLabel: 'Cuándo reclamarlo',
    notePlaceholder: 'Recordar en abril…',
    noteAlways: true,
  },
  pagos: {
    label: 'Debo',
    icon: '🫲',
    hint: 'Lo que está por pagar y ya está comprometido.',
    word: 'pago',
    rhythm: 'saldo',
    sign: -1,
    main: 'Cantidad',
    noteLabel: 'Cuándo toca',
    notePlaceholder: 'Antes de junio…',
    noteAlways: true,
  },
};

export const LEDGER_LIST = Object.keys(LEDGERS) as LedgerId[];

/** Las libretas que forman el patrimonio, en el orden en que se suman. */
export const WEALTH_LEDGERS: LedgerId[] = ['cuentas', 'inversiones', 'cobros', 'pagos'];

/* ---------------------------------------------------------------------------
 * La libreta en blanco
 *
 * Trae los conceptos de la hoja —los nombres, que no dicen nada de nadie— y
 * todas las cifras a cero. Las cifras se ponen en la app, en el aparato, y no
 * pasan por aquí: esto es código público.
 * ------------------------------------------------------------------------- */

interface Seed {
  label: string;
  icon: string;
  note?: string;
}

const SEEDS: Record<LedgerId, Seed[]> = {
  ingresos: [
    { label: 'Salario del club', icon: '⚽', note: 'Segundo entrenador' },
    { label: 'Comisión del agente', icon: '🤝', note: 'En negativo: se descuenta del salario' },
    { label: 'ESS · asesoría fija', icon: '🎓' },
    { label: 'ESS · variable', icon: '📊', note: 'Lo que no está cerrado' },
    { label: 'Autónomos', icon: '🧾', note: 'En negativo' },
    { label: 'Otros ingresos', icon: '➕' },
  ],
  gastos: [
    { label: 'Casa', icon: '🏠' },
    { label: 'Suministros', icon: '💡' },
    { label: 'Seguro dental', icon: '🦷' },
    { label: 'Plan de pensiones', icon: '🏦' },
    { label: 'Móvil e internet', icon: '📱' },
    { label: 'Coche', icon: '🚗', note: 'Mantenimiento' },
    { label: 'Seguro del coche', icon: '🛡️' },
    { label: 'Impuestos del coche', icon: '🧾' },
    { label: 'Gasolina y transporte', icon: '⛽' },
    { label: 'Comida', icon: '🍽️' },
    { label: 'Colegio', icon: '🎒' },
    { label: 'Actividades de los peques', icon: '🏊' },
    { label: 'Ropa de los peques', icon: '👕' },
    { label: 'Abono del Madrid', icon: '🏟️' },
    { label: 'Ocio', icon: '🎬' },
    { label: 'Regalos', icon: '🎁' },
    { label: 'Idiomas', icon: '🗣️' },
    { label: 'Imprevistos', icon: '❓' },
  ],
  cuentas: [{ label: 'Cuenta principal', icon: '🏦' }],
  inversiones: [
    { label: 'Cobas Internacional', icon: '🌍' },
    { label: 'Cobas Selección', icon: '📈' },
    { label: 'Acciones de ESS', icon: '🎓', note: 'Participación en la escuela' },
  ],
  cobros: [],
  pagos: [],
};

let counter = 0;

/** Identificador de un apunte. Basta con que no se repita en la libreta. */
export function newId(): string {
  counter += 1;
  return `eco-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function emptyItem(): FinanceItem {
  return { id: newId(), label: '', icon: '📌', amount: 0 };
}

export function emptyBook(): FinanceBook {
  return {
    season: '',
    months: 12,
    holidays: 0,
    ledgers: { ingresos: [], gastos: [], cuentas: [], inversiones: [], cobros: [], pagos: [] },
    updatedAt: NEVER,
  };
}

/** El curso en el que cae una fecha: de agosto a julio, como en la hoja. */
export function seasonOf(date = new Date()): string {
  const year = date.getFullYear();
  const start = date.getMonth() >= 7 ? year : year - 1;
  return `${start}-${`${start + 1}`.slice(2)}`;
}

/** La libreta de estreno: los conceptos de siempre, todo a cero. */
export function starterBook(): FinanceBook {
  const book = emptyBook();
  book.season = seasonOf();
  book.updatedAt = new Date().toISOString();

  for (const ledger of LEDGER_LIST) {
    book.ledgers[ledger] = SEEDS[ledger].map((seed) => ({
      id: newId(),
      label: seed.label,
      icon: seed.icon,
      amount: 0,
      note: seed.note,
    }));
  }

  return book;
}

/* ---------------------------------------------------------------------------
 * Las cuentas
 * ------------------------------------------------------------------------- */

/**
 * La cifra que manda en un apunte.
 *
 * En los gastos son dos: lo que se presupuesta y lo que de verdad se va. Para
 * sumar manda el real en cuanto existe —es el que ha pasado—, y mientras no
 * lo haya, la previsión. Es exactamente lo que hace la hoja al comparar la
 * columna B con la C.
 */
export function amountOf(item: FinanceItem, ledger: LedgerId): number {
  if (ledger === 'gastos') return item.alt ?? item.amount;
  return item.amount;
}

/** Lo que suma una libreta, con su signo. */
export function ledgerTotal(book: FinanceBook, ledger: LedgerId): number {
  return book.ledgers[ledger].reduce((total, item) => total + amountOf(item, ledger), 0);
}

/** Lo que entra al mes, ya descontado lo que se descuenta. */
export function monthlyIncome(book: FinanceBook): number {
  return ledgerTotal(book, 'ingresos');
}

/** Lo que sale al mes. */
export function monthlyExpense(book: FinanceBook): number {
  return ledgerTotal(book, 'gastos');
}

/** Lo que queda cada mes. Negativo quiere decir que se tira de lo ahorrado. */
export function monthlySaving(book: FinanceBook): number {
  return monthlyIncome(book) - monthlyExpense(book);
}

/** Lo previsto del curso entero: los meses que dura, más las vacaciones. */
export function periodIncome(book: FinanceBook): number {
  return monthlyIncome(book) * book.months;
}

export function periodExpense(book: FinanceBook): number {
  return monthlyExpense(book) * book.months + book.holidays;
}

export function periodSaving(book: FinanceBook): number {
  return periodIncome(book) - periodExpense(book);
}

/**
 * Lo que hay de verdad: las cuentas, más lo invertido, más lo que está por
 * cobrar, menos lo que está por pagar. Es la foto que la hoja llamaba «full
 * account», y la que hace falta para la pregunta de abajo.
 */
export function netWorth(book: FinanceBook): number {
  return WEALTH_LEDGERS.reduce(
    (total, ledger) => total + ledgerTotal(book, ledger) * LEDGERS[ledger].sign,
    0,
  );
}

/** Lo mismo sin contar lo que depende de que alguien pague o de la bolsa. */
export function liquidWorth(book: FinanceBook): number {
  return ledgerTotal(book, 'cuentas') - ledgerTotal(book, 'pagos');
}

/**
 * Cuántos meses se aguanta sin ingresar nada, gastando lo de siempre. Es la
 * cifra que contesta «¿cuánto puedo esperar a que salga lo siguiente?», que
 * en un oficio de contratos de un año es **la** pregunta.
 *
 * Sin gasto apuntado no hay respuesta: dividir entre cero no es «infinito»,
 * es que todavía no se ha rellenado la libreta.
 */
export function runwayMonths(book: FinanceBook): number | null {
  const spend = monthlyExpense(book);
  if (spend <= 0) return null;
  return netWorth(book) / spend;
}

/** «3 años y 2 meses». Lo que se lee de un vistazo. */
export function runwayLabel(months: number): string {
  const whole = Math.max(0, Math.round(months));
  const years = Math.floor(whole / 12);
  const rest = whole % 12;

  if (years === 0) return `${rest} ${rest === 1 ? 'mes' : 'meses'}`;
  if (rest === 0) return `${years} ${years === 1 ? 'año' : 'años'}`;
  return `${years} ${years === 1 ? 'año' : 'años'} y ${rest} ${rest === 1 ? 'mes' : 'meses'}`;
}

/** En qué se va el mes: cada gasto y cuánto pesa, de mayor a menor. */
export function expenseShare(
  book: FinanceBook,
): Array<{ item: FinanceItem; amount: number; share: number }> {
  const total = monthlyExpense(book);
  if (total <= 0) return [];

  return book.ledgers.gastos
    .map((item) => ({ item, amount: amountOf(item, 'gastos'), share: amountOf(item, 'gastos') / total }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Lo que se desvía de lo presupuestado, gasto a gasto. Sólo tiene sentido
 * donde se han puesto las dos cifras: sin previsión no hay nada que comparar.
 */
export function drift(book: FinanceBook): Array<{ item: FinanceItem; diff: number }> {
  return book.ledgers.gastos
    .filter((item) => item.alt !== undefined && item.amount > 0)
    .map((item) => ({ item, diff: (item.alt ?? 0) - item.amount }))
    .filter((row) => Math.abs(row.diff) >= 1)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

/**
 * El color de un concepto, sacado de su nombre.
 *
 * Del nombre y no de su posición a propósito: la barra de «en qué se va el
 * mes» se ordena de mayor a menor, así que con colores por posición la casa y
 * la comida se intercambiaban el color en cuanto cambiaba una cifra, y la
 * leyenda dejaba de servir de un mes para otro. Así, la casa es siempre del
 * mismo color.
 */
export function colorOf(label: string): string {
  const clean = label.trim().toLowerCase();
  if (!clean) return 'hsl(220 8% 60%)';

  let hash = 2166136261;
  for (let i = 0; i < clean.length; i += 1) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const seed = Math.abs(hash);
  return `hsl(${seed % 360} ${58 + ((seed >> 9) % 18)}% ${44 + ((seed >> 17) % 16)}%)`;
}

/** Euros, como se escriben en España. */
export function euros(amount: number, decimals = 0): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/* ---------------------------------------------------------------------------
 * Lectura y escritura
 *
 * Sólo en este aparato. No hay tabla en la nube para esto y no la hay a
 * propósito: son las cuentas de una persona, no el registro de la casa, y
 * mientras no haga falta verlas desde otro sitio no tienen por qué salir de
 * aquí.
 * ------------------------------------------------------------------------- */

let cache: FinanceBook | null = null;
const listeners = new Set<() => void>();

function normalizeItem(value: unknown, index: number): FinanceItem | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<FinanceItem>;

  const amount = Number(raw.amount);
  const alt = Number(raw.alt);

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `eco-${index}`,
    label: typeof raw.label === 'string' ? raw.label.slice(0, 60) : '',
    icon: typeof raw.icon === 'string' && raw.icon ? raw.icon.slice(0, 4) : '📌',
    amount: Number.isFinite(amount) ? amount : 0,
    alt: raw.alt !== undefined && Number.isFinite(alt) ? alt : undefined,
    note: typeof raw.note === 'string' && raw.note ? raw.note.slice(0, 160) : undefined,
  };
}

function normalize(value: unknown): FinanceBook {
  const base = emptyBook();
  if (!value || typeof value !== 'object') return base;

  const raw = value as Partial<FinanceBook>;
  const months = Number(raw.months);
  const holidays = Number(raw.holidays);

  const ledgers = { ...base.ledgers };
  for (const ledger of LEDGER_LIST) {
    const list = (raw.ledgers as Record<string, unknown> | undefined)?.[ledger];
    ledgers[ledger] = Array.isArray(list)
      ? list
          .map((item, index) => normalizeItem(item, index))
          .filter((item): item is FinanceItem => item !== null)
          .slice(0, MAX_ITEMS)
      : [];
  }

  return {
    season: typeof raw.season === 'string' ? raw.season.slice(0, 12) : base.season,
    months: Number.isFinite(months) ? Math.max(1, Math.min(24, Math.round(months))) : 12,
    holidays: Number.isFinite(holidays) ? holidays : 0,
    ledgers,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
  };
}

export function loadBook(): FinanceBook {
  if (cache) return cache;
  if (typeof window === 'undefined') return emptyBook();

  try {
    const raw = window.localStorage.getItem(FINANCE_KEY);
    cache = raw ? normalize(JSON.parse(raw)) : emptyBook();
  } catch {
    cache = emptyBook();
  }

  return cache;
}

export function saveBook(book: FinanceBook): FinanceBook {
  const next: FinanceBook = { ...book, updatedAt: new Date().toISOString() };
  cache = next;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(FINANCE_KEY, JSON.stringify(next));
    } catch {
      // Cuota llena o modo privado: vale para esta sesión.
    }
  }

  for (const listener of listeners) listener();
  return next;
}

export function subscribeBook(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** ¿Hay algo apuntado ya, o la sección está por estrenar? */
export function bookStarted(book: FinanceBook): boolean {
  return LEDGER_LIST.some((ledger) => book.ledgers[ledger].length > 0);
}

/* --------------------------------------------------------------- retoques */

export function putItem(book: FinanceBook, ledger: LedgerId, item: FinanceItem): FinanceBook {
  const list = book.ledgers[ledger];
  const exists = list.some((entry) => entry.id === item.id);

  return {
    ...book,
    ledgers: {
      ...book.ledgers,
      [ledger]: exists
        ? list.map((entry) => (entry.id === item.id ? item : entry))
        : [...list, item].slice(0, MAX_ITEMS),
    },
  };
}

export function dropItem(book: FinanceBook, ledger: LedgerId, id: string): FinanceBook {
  return {
    ...book,
    ledgers: { ...book.ledgers, [ledger]: book.ledgers[ledger].filter((item) => item.id !== id) },
  };
}

/**
 * Lo apuntado, en un texto que se puede pegar en cualquier sitio. Es la
 * salida de emergencia de una sección que no sube a la nube: si se pierde el
 * aparato, que no se pierda el trabajo de rellenarla.
 */
export function bookAsText(book: FinanceBook): string {
  const lines: string[] = [`Economía · curso ${book.season || '—'}`, ''];

  for (const ledger of LEDGER_LIST) {
    const list = book.ledgers[ledger];
    if (list.length === 0) continue;

    lines.push(`${LEDGERS[ledger].icon} ${LEDGERS[ledger].label.toUpperCase()}`);
    for (const item of list) {
      const main = euros(item.amount);
      const alt = item.alt !== undefined ? ` → ${euros(item.alt)}` : '';
      const note = item.note ? `  (${item.note})` : '';
      lines.push(`  ${item.label || '—'}: ${main}${alt}${note}`);
    }
    lines.push(`  TOTAL: ${euros(ledgerTotal(book, ledger))}`, '');
  }

  const runway = runwayMonths(book);
  lines.push(
    `Al mes: entra ${euros(monthlyIncome(book))}, sale ${euros(monthlyExpense(book))}, queda ${euros(monthlySaving(book))}`,
    `Curso (${book.months} meses${book.holidays ? ' + vacaciones' : ''}): ${euros(periodSaving(book))}`,
    `Patrimonio: ${euros(netWorth(book))}`,
    runway === null ? 'Autonomía: sin gastos apuntados' : `Autonomía: ${runwayLabel(runway)}`,
  );

  return lines.join('\n');
}
