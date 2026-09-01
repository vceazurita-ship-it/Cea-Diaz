import type {
  FinanceBook,
  FinanceGoals,
  FinanceItem,
  FinanceSnapshot,
  LedgerId,
  SpendTier,
} from '@/types';

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
 *  cómo se suman— y los números viven en el aparato y en la cuenta de la casa,
 *  como el resto de lo que registra la familia.
 *
 *  Las libretas van indexadas por perfil aunque de momento sólo las lleve uno:
 *  es lo que permite que la nube las reparta perfil a perfil, igual que las
 *  agendas, y lo que evita mover nada el día que otro quiera las suyas.
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

/* ---------------------------------------------------------------------------
 * La escala: en qué orden importa el dinero en esta casa
 *
 * Es lo que convierte un presupuesto en una decisión. Un gasto se puede mirar
 * por categoría —colegio, gasolina, ocio— y eso dice **en qué** se va; la
 * escala dice **para qué**, y ahí es donde se ve si el dinero está yendo
 * donde uno ha dicho que quiere que vaya.
 *
 * El orden es el que decidió la casa y no se toca desde aquí: primero lo que
 * no se elige, luego los peques y lo que les hace crecer, luego el tiempo en
 * pareja y las experiencias de los cuatro, y después la comodidad de vivir.
 * ------------------------------------------------------------------------- */

interface TierMeta {
  label: string;
  icon: string;
  /** Qué entra aquí, en una línea. */
  hint: string;
  /** Color estable, para la barra y la leyenda. */
  color: string;
}

export const TIERS: Record<SpendTier, TierMeta> = {
  base: {
    label: 'Lo que no se elige',
    icon: '🏠',
    hint: 'Techo, luz, comida, seguros, impuestos. El suelo sobre el que se decide todo lo demás.',
    color: 'hsl(215 16% 52%)',
  },
  hijos: {
    label: 'Los peques y su desarrollo',
    icon: '🌱',
    hint: 'Colegio, deporte, idiomas, libros: lo que les hace crecer.',
    color: 'hsl(150 58% 42%)',
  },
  pareja: {
    label: 'María y vosotros dos',
    icon: '💞',
    hint: 'El tiempo a solas: cenas, escapadas, lo que sostiene la pareja.',
    color: 'hsl(340 62% 54%)',
  },
  familia: {
    label: 'Los cuatro juntos',
    icon: '🧭',
    hint: 'Viajes, planes y experiencias compartidas de los cuatro.',
    color: 'hsl(28 78% 52%)',
  },
  calidad: {
    label: 'Calidad de vida',
    icon: '✨',
    hint: 'Lo que hace la vida más cómoda o más agradable, sin ser ninguna de las anteriores.',
    color: 'hsl(262 55% 58%)',
  },
  otros: {
    label: 'Sin colocar',
    icon: '❔',
    hint: 'Todavía no le has dicho a qué sirve. Colócalo y entrará en el reparto.',
    color: 'hsl(220 8% 62%)',
  },
};

/**
 * El orden de la escala. La app no lo inventa: lo contrasta. Si «calidad de
 * vida» pesa más que «los peques», eso es lo que se dice, sin adornarlo.
 */
export const TIER_ORDER: SpendTier[] = ['base', 'hijos', 'pareja', 'familia', 'calidad', 'otros'];

/** Las prioridades que se eligen de verdad; `base` es el suelo y `otros` un pendiente. */
export const CHOSEN_TIERS: SpendTier[] = ['hijos', 'pareja', 'familia', 'calidad'];

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
  /** Sólo en los gastos: a qué prioridad sirve de partida. Se puede cambiar. */
  tier?: SpendTier;
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
    { label: 'Casa', icon: '🏠', tier: 'base' },
    { label: 'Suministros', icon: '💡', tier: 'base' },
    { label: 'Seguro dental', icon: '🦷', tier: 'base' },
    { label: 'Plan de pensiones', icon: '🏦', tier: 'base' },
    { label: 'Móvil e internet', icon: '📱', tier: 'base' },
    { label: 'Coche', icon: '🚗', note: 'Mantenimiento', tier: 'base' },
    { label: 'Seguro del coche', icon: '🛡️', tier: 'base' },
    { label: 'Impuestos del coche', icon: '🧾', tier: 'base' },
    { label: 'Gasolina y transporte', icon: '⛽', tier: 'base' },
    { label: 'Comida', icon: '🍽️', tier: 'base' },
    { label: 'Colegio', icon: '🎒', tier: 'hijos' },
    { label: 'Actividades de los peques', icon: '🏊', tier: 'hijos' },
    { label: 'Ropa de los peques', icon: '👕', tier: 'hijos' },
    { label: 'Abono del Madrid', icon: '🏟️', tier: 'familia' },
    { label: 'Ocio', icon: '🎬', tier: 'calidad' },
    { label: 'Regalos', icon: '🎁', tier: 'calidad' },
    { label: 'Idiomas', icon: '🗣️', tier: 'hijos' },
    { label: 'Cenas y planes con María', icon: '💞', tier: 'pareja' },
    { label: 'Experiencias de los cuatro', icon: '🧭', tier: 'familia' },
    { label: 'Imprevistos', icon: '❓', tier: 'base' },
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

/**
 * Con qué cifras se juzga el objetivo, de partida.
 *
 * El 4 % de retirada es la referencia clásica (Bengen; estudio Trinity) y el
 * 4 % de rendimiento real es una hipótesis prudente para una cartera de renta
 * variable a largo plazo, ya descontada la inflación. El colchón de doce
 * meses no es el de manual —lo corriente son de tres a seis— sino el que pide
 * vivir de un contrato de temporada.
 */
export function defaultGoals(): FinanceGoals {
  return { withdrawal: 4, cushion: 12, realReturn: 4 };
}

export function emptyBook(): FinanceBook {
  return {
    season: '',
    months: 12,
    holidays: 0,
    ledgers: { ingresos: [], gastos: [], cuentas: [], inversiones: [], cobros: [], pagos: [] },
    history: [],
    goals: defaultGoals(),
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
      tier: seed.tier,
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

/* ---------------------------------------------------------------------------
 * La escala, en cifras
 * ------------------------------------------------------------------------- */

/** A qué prioridad sirve un gasto. Sin colocar, «otros». */
export function tierOf(item: FinanceItem): SpendTier {
  return item.tier ?? 'otros';
}

/** Lo que se va al mes en cada prioridad, de la primera a la última. */
export function tierShare(
  book: FinanceBook,
): Array<{ tier: SpendTier; amount: number; share: number; count: number }> {
  const total = monthlyExpense(book);
  const totals = new Map<SpendTier, { amount: number; count: number }>();

  for (const item of book.ledgers.gastos) {
    const tier = tierOf(item);
    const row = totals.get(tier) ?? { amount: 0, count: 0 };
    row.amount += amountOf(item, 'gastos');
    row.count += 1;
    totals.set(tier, row);
  }

  return TIER_ORDER.filter((tier) => totals.has(tier)).map((tier) => {
    const row = totals.get(tier)!;
    return { tier, amount: row.amount, share: total > 0 ? row.amount / total : 0, count: row.count };
  });
}

/**
 * Lo que se va en lo que **se elige**, sin contar el suelo.
 *
 * Es el reparto que de verdad se decide: comparar el colegio con la hipoteca
 * no dice nada, porque la hipoteca no está en discusión. Comparar el colegio
 * con el ocio, sí.
 */
export function chosenShare(
  book: FinanceBook,
): Array<{ tier: SpendTier; amount: number; share: number }> {
  const rows = tierShare(book).filter((row) => CHOSEN_TIERS.includes(row.tier));
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return rows.map((row) => ({
    tier: row.tier,
    amount: row.amount,
    share: total > 0 ? row.amount / total : 0,
  }));
}

/**
 * Dónde el reparto real contradice el orden declarado.
 *
 * Devuelve los pares en los que una prioridad de más abajo se lleva más
 * dinero que una de más arriba. No es un fallo por sí mismo —un mes con un
 * viaje grande descoloca cualquier escala— pero es exactamente lo que uno
 * quiere ver dicho en voz alta, porque a solas no se ve.
 */
export function tierClashes(
  book: FinanceBook,
): Array<{ above: SpendTier; below: SpendTier; gap: number }> {
  const rows = chosenShare(book).filter((row) => row.amount > 0);
  const out: Array<{ above: SpendTier; below: SpendTier; gap: number }> = [];

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (rows[j].amount > rows[i].amount) {
        out.push({ above: rows[i].tier, below: rows[j].tier, gap: rows[j].amount - rows[i].amount });
      }
    }
  }

  return out.sort((a, b) => b.gap - a.gap);
}

/* ---------------------------------------------------------------------------
 * La independencia financiera, en cifras
 *
 * Todo esto sale de dos ideas y ninguna es un truco:
 *
 *  · lo que hace falta acumular no depende de lo que se gana sino de **lo que
 *    se gasta**, porque es el gasto lo que hay que sostener cuando se deje de
 *    trabajar. De ahí que el número sea el gasto anual dividido por la tasa de
 *    retirada: al 4 %, veinticinco veces el gasto de un año;
 *  · y lo que decide cuánto se tarda no es el sueldo sino la **tasa de
 *    ahorro**, porque una tasa alta sube lo que se acumula y baja a la vez lo
 *    que hay que acumular. Es lo que hace que dos personas con el mismo sueldo
 *    tarden veinte años o cinco.
 * ------------------------------------------------------------------------- */

/** Lo que se gasta en un año: los meses del curso más las vacaciones. */
export function yearlyExpense(book: FinanceBook): number {
  return monthlyExpense(book) * 12 + book.holidays;
}

/** Qué parte de lo que entra se queda. Es la cifra que manda en todo lo demás. */
export function savingsRate(book: FinanceBook): number | null {
  const income = monthlyIncome(book);
  if (income <= 0) return null;
  return monthlySaving(book) / income;
}

/** Lo que hay que acumular para vivir de ello: el gasto de un año entre la tasa. */
export function fiNumber(book: FinanceBook): number {
  const rate = Math.max(1, book.goals?.withdrawal ?? 4) / 100;
  return yearlyExpense(book) / rate;
}

/** Cuánto de ese número está ya puesto. */
export function fiProgress(book: FinanceBook): number {
  const target = fiNumber(book);
  if (target <= 0) return 0;
  return Math.max(0, netWorth(book) / target);
}

/**
 * Años que faltan al ritmo de hoy, contando que lo acumulado también renta.
 *
 * Se resuelve la fórmula del capital con aportaciones periódicas. Sin ahorro
 * no hay respuesta: no es «infinito», es que por ese camino no se llega, y
 * decirlo así es más útil que un número enorme.
 */
export function yearsToFi(book: FinanceBook): number | null {
  const target = fiNumber(book);
  const have = netWorth(book);
  if (target <= 0) return null;
  if (have >= target) return 0;

  const yearly = monthlySaving(book) * 12;
  const rate = Math.max(0, book.goals?.realReturn ?? 4) / 100;

  if (yearly <= 0) return null;
  if (rate === 0) return (target - have) / yearly;

  // n = ln((meta·r + a) / (tengo·r + a)) / ln(1 + r)
  const top = target * rate + yearly;
  const bottom = have * rate + yearly;
  if (bottom <= 0 || top <= 0) return null;

  const years = Math.log(top / bottom) / Math.log(1 + rate);
  return Number.isFinite(years) && years > 0 ? years : null;
}

/**
 * Lo que habría dentro de tantos años **sin aportar ni un euro más**. Es la
 * pregunta de «¿y si dejo de ahorrar?», y suele ser la que más tranquiliza.
 */
export function coastWorth(book: FinanceBook, years: number): number {
  const rate = Math.max(0, book.goals?.realReturn ?? 4) / 100;
  return netWorth(book) * (1 + rate) ** years;
}

/** Meses de gasto que cubre el dinero disponible. El colchón de verdad. */
export function cushionMonths(book: FinanceBook): number | null {
  const spend = monthlyExpense(book);
  if (spend <= 0) return null;
  return liquidWorth(book) / spend;
}

/** «3 años y 2 meses» a partir de unos años con decimales. */
export function yearsLabel(years: number): string {
  return runwayLabel(years * 12);
}

/* ---------------------------------------------------------------------------
 * El histórico
 *
 * Una foto por mes. Se pisa mientras el mes está en curso y se queda quieta
 * cuando pasa, así que la serie es «cómo estaban las cuentas al final de cada
 * mes» sin pedirle a nadie que se acuerde de guardarla.
 * ------------------------------------------------------------------------- */

/** «2026-09». */
export function monthKey(date = new Date()): string {
  return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

export function snapshotOf(book: FinanceBook, month = monthKey()): FinanceSnapshot {
  return {
    month,
    income: monthlyIncome(book),
    expense: monthlyExpense(book),
    worth: netWorth(book),
    liquid: liquidWorth(book),
  };
}

/** Tope de la serie: cinco años de meses son de sobra para una gráfica. */
const MAX_HISTORY = 60;

/** El libro con la foto de este mes puesta al día. */
export function withSnapshot(book: FinanceBook): FinanceBook {
  const month = monthKey();
  const shot = snapshotOf(book, month);
  const rest = (book.history ?? []).filter((row) => row.month !== month);
  return { ...book, history: [...rest, shot].slice(-MAX_HISTORY) };
}

/** Cuánto ha cambiado el patrimonio desde la foto más vieja que se guarda. */
export function worthTrend(book: FinanceBook): { from: FinanceSnapshot; to: FinanceSnapshot } | null {
  const history = book.history ?? [];
  if (history.length < 2) return null;
  return { from: history[0], to: history[history.length - 1] };
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

let cache: Record<string, FinanceBook> | null = null;
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
    tier:
      typeof raw.tier === 'string' && TIER_ORDER.includes(raw.tier as SpendTier)
        ? (raw.tier as SpendTier)
        : undefined,
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

  const history = Array.isArray(raw.history)
    ? raw.history
        .filter(
          (row): row is FinanceSnapshot =>
            Boolean(row) && typeof row === 'object' && typeof (row as FinanceSnapshot).month === 'string',
        )
        .map((row) => ({
          month: row.month.slice(0, 7),
          income: Number(row.income) || 0,
          expense: Number(row.expense) || 0,
          worth: Number(row.worth) || 0,
          liquid: Number(row.liquid) || 0,
        }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-MAX_HISTORY)
    : [];

  const goals = raw.goals ?? {};
  const withdrawal = Number((goals as FinanceGoals).withdrawal);
  const cushion = Number((goals as FinanceGoals).cushion);
  const realReturn = Number((goals as FinanceGoals).realReturn);

  return {
    season: typeof raw.season === 'string' ? raw.season.slice(0, 12) : base.season,
    months: Number.isFinite(months) ? Math.max(1, Math.min(24, Math.round(months))) : 12,
    holidays: Number.isFinite(holidays) ? holidays : 0,
    ledgers,
    history,
    goals: {
      withdrawal: Number.isFinite(withdrawal) ? Math.max(1, Math.min(10, withdrawal)) : 4,
      cushion: Number.isFinite(cushion) ? Math.max(1, Math.min(36, Math.round(cushion))) : 12,
      realReturn: Number.isFinite(realReturn) ? Math.max(0, Math.min(12, realReturn)) : 4,
    },
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
  };
}

/**
 * Las libretas guardadas, por perfil.
 *
 * Van indexadas aunque de momento sólo las lleve uno: es lo que permite que
 * la nube las reparta perfil a perfil, como hace con las agendas, y lo que
 * evita tener que mover nada el día que otro quiera las suyas.
 */
export function loadBooks(): Record<string, FinanceBook> {
  if (cache) return cache;
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(FINANCE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, FinanceBook> = {};

    // La primera versión guardaba una libreta suelta, sin perfil. Si es lo
    // que hay, se recoge como de Víctor, que era de quien era.
    if (parsed && typeof parsed === 'object' && 'ledgers' in parsed) {
      out.victor = normalize(parsed);
    } else {
      for (const [profileId, value] of Object.entries(parsed ?? {})) {
        out[profileId] = normalize(value);
      }
    }

    cache = out;
  } catch {
    cache = {};
  }

  return cache;
}

export function bookOf(profileId: string): FinanceBook {
  return loadBooks()[profileId] ?? emptyBook();
}

function commit(next: Record<string, FinanceBook>): void {
  cache = next;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(FINANCE_KEY, JSON.stringify(next));
    } catch {
      // Cuota llena o modo privado: vale para esta sesión.
    }
  }

  for (const listener of listeners) listener();
}

export function saveBook(profileId: string, book: FinanceBook): FinanceBook {
  // Cada guardado deja la foto de este mes al día. Es gratis y es lo que hace
  // que dentro de un año haya una serie que mirar sin haber hecho nada.
  const next: FinanceBook = { ...withSnapshot(book), updatedAt: new Date().toISOString() };
  commit({ ...loadBooks(), [profileId]: next });
  return next;
}

/**
 * Lo que llega de otro aparato. Se adopta lo que sea más reciente y se deja
 * lo demás como está: la misma regla que en el resto de la app, y la que
 * permite apuntar un gasto en el móvil y verlo en el portátil sin que ninguno
 * de los dos pise al otro.
 */
export function applyRemoteBooks(remote: Record<string, FinanceBook>): void {
  const local = loadBooks();
  const next = { ...local };
  let changed = false;

  for (const [profileId, book] of Object.entries(remote)) {
    const mine = local[profileId];
    if (mine && Date.parse(mine.updatedAt) >= Date.parse(book.updatedAt)) continue;
    next[profileId] = book;
    changed = true;
  }

  if (changed) commit(next);
}

export function subscribeBooks(listener: () => void): () => void {
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
