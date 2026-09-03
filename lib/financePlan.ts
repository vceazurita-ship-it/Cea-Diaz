import {
  CHOSEN_TIERS,
  TIERS,
  amountOf,
  chosenShare,
  coastYears,
  cushionMonths,
  euros,
  fiNumber,
  fiProgress,
  ledgerTotal,
  liquidWorth,
  monthlyExpense,
  monthlyIncome,
  monthlySaving,
  netWorth,
  newId,
  payMonths,
  runwayLabel,
  tierClashes,
  withdrawalRate,
  yearlyExpense,
  yearlyIncome,
  yearlySaving,
  yearsLabel,
} from '@/lib/finance';
import type { FinanceBook, PlanAction } from '@/types';

/* =========================================================================
 *  El plan.
 *
 *  La pestaña de consejo dice **qué pasa**: que el 96 % está en una sola
 *  casa, que el colchón cubre cuatro meses. Esto dice **qué hacer**, con la
 *  cantidad delante y con lo que cambia si se hace. Es el paso que suele
 *  faltar: un diagnóstico se lee y se asiente; una instrucción con cifra se
 *  ejecuta o se descarta a propósito, que también vale.
 *
 *  Tres decisiones de fondo, porque explican casi todo lo que hay debajo:
 *
 *  1. **Se juzga el año, no el mes.** En un club se cobran diez meses y se
 *     vive doce. Un mes tipo puede salir cuadrado y el año no cuadrar, y el
 *     que decide es el año. Las cifras de aquí son anuales aunque se enseñen
 *     partidas por doce, que es como se piensan.
 *
 *  2. **Un déficit no es necesariamente una alarma.** Lo que decide si un
 *     agujero mensual es un problema no es su tamaño, sino qué parte del
 *     patrimonio hay que sacar cada año para taparlo: la misma tasa de
 *     retirada con la que se juzga una jubilación. Si lo que falta cabe
 *     dentro del 4 %, el capital lo sostiene; si se pasa, se lo está
 *     comiendo. Decirlo al revés —«estás en números rojos, corre»— asusta
 *     sin informar, y esta casa vive de contratos de un año: el susto ya lo
 *     pone el oficio.
 *
 *  3. **Nada sin cifra y nada sin efecto.** Cada acción trae el número del
 *     que sale y el número en el que se nota. Sin lo segundo no hay manera
 *     de ordenarlas, y un plan de diez cosas sin orden no se empieza.
 *
 *  Esto sigue sin ser asesoramiento financiero: es la hoja de cálculo
 *  sacando conclusiones de sus propias celdas, con las reglas escritas.
 * ========================================================================= */

/* ---------------------------------------------------------------------------
 * El simulador
 *
 * Las tres palancas que de verdad se pueden mover, y ninguna más: ingresar
 * algo más, gastar algo menos, o pasar dinero de lo invertido a la cuenta.
 * Todo lo demás son consecuencias de estas tres.
 * ------------------------------------------------------------------------- */

export interface PlanTweak {
  /** Euros más al mes, en los meses que se cobra. */
  income: number;
  /** Euros menos al mes, todos los meses. */
  spend: number;
  /** Euros que se pasan de lo invertido a la cuenta, de una vez. */
  toCash: number;
}

export const NO_TWEAK: PlanTweak = { income: 0, spend: 0, toCash: 0 };

export function tweakIsOn(tweak: PlanTweak): boolean {
  return tweak.income !== 0 || tweak.spend !== 0 || tweak.toCash !== 0;
}

/**
 * La misma libreta con las palancas puestas.
 *
 * Se hace metiendo apuntes de mentira en las libretas, y no cambiando los
 * totales a mano, para que todo lo que ya sabe contar —el colchón, la
 * escala, la tasa de retirada— siga contando igual sin enterarse de nada.
 */
export function withTweak(book: FinanceBook, tweak: PlanTweak): FinanceBook {
  if (!tweakIsOn(tweak)) return book;

  const ledgers = { ...book.ledgers };

  if (tweak.income !== 0) {
    ledgers.ingresos = [
      ...ledgers.ingresos,
      { id: newId(), label: 'Simulación', icon: '🎚️', amount: tweak.income },
    ];
  }

  if (tweak.spend !== 0) {
    ledgers.gastos = [
      ...ledgers.gastos,
      { id: newId(), label: 'Simulación', icon: '🎚️', amount: -tweak.spend, alt: -tweak.spend },
    ];
  }

  if (tweak.toCash !== 0) {
    ledgers.cuentas = [
      ...ledgers.cuentas,
      { id: newId(), label: 'Simulación', icon: '🎚️', amount: tweak.toCash },
    ];
    ledgers.inversiones = [
      ...ledgers.inversiones,
      { id: newId(), label: 'Simulación', icon: '🎚️', amount: -tweak.toCash },
    ];
  }

  return { ...book, ledgers };
}

/* ---------------------------------------------------------------------------
 * Las cifras que mandan
 * ------------------------------------------------------------------------- */

export interface PlanNumbers {
  /** Lo que entra y sale en un mes cobrando. Es lo que se siente. */
  monthIn: number;
  monthOut: number;
  monthSaving: number;
  /** Lo que entra y sale en el año entero. Es lo que decide. */
  yearIn: number;
  yearOut: number;
  /** Positivo cuando falta. La cifra sobre la que se monta el plan entero. */
  gap: number;
  /** Ese hueco repartido por doce, que es como se piensa. */
  gapMonth: number;
  worth: number;
  liquid: number;
  invested: number;
  /** Qué parte del patrimonio hay que sacar al año para tapar el hueco. */
  rate: number | null;
  /** La tasa que se ha puesto como límite. */
  rateGoal: number;
  /** Meses de gasto que cubre el dinero disponible. */
  cushion: number | null;
  /** Meses que dura la caja tapando sólo el hueco, que es lo que se hace. */
  cashMonths: number | null;
  target: number;
  progress: number;
  /** Años hasta el número sin aportar nada más. */
  coast: number | null;
}

export function planNumbers(book: FinanceBook): PlanNumbers {
  const gap = -yearlySaving(book);
  const liquid = liquidWorth(book);

  return {
    monthIn: monthlyIncome(book),
    monthOut: monthlyExpense(book),
    monthSaving: monthlySaving(book),
    yearIn: yearlyIncome(book),
    yearOut: yearlyExpense(book),
    gap,
    gapMonth: gap / 12,
    worth: netWorth(book),
    liquid,
    invested: ledgerTotal(book, 'inversiones'),
    rate: withdrawalRate(book),
    rateGoal: (book.goals?.withdrawal ?? 4) / 100,
    cushion: cushionMonths(book),
    cashMonths: gap > 0 && liquid > 0 ? liquid / (gap / 12) : null,
    target: fiNumber(book),
    progress: fiProgress(book),
    coast: coastYears(book),
  };
}

/* ---------------------------------------------------------------------------
 * Cómo se escriben las cifras aquí
 * ------------------------------------------------------------------------- */

/**
 * Un tanto por ciento fino, con dos decimales y sin ceros de relleno.
 *
 * Hace falta justo aquí: entre retirar el 4 % y retirar el 4,03 % está la
 * diferencia entre mantener el capital y comérselo, y redondeando las dos a
 * «4 %» la frase queda diciendo «bajar del 4 % al 4 %», que es de risa.
 */
function pct(value: number): string {
  return `${(Math.round(value * 10000) / 100).toString().replace('.', ',')} %`;
}

/** Y uno redondo, para los pesos, donde el decimal sólo estorba. */
function pct0(value: number): string {
  return `${Math.round(value * 100)} %`;
}

/**
 * Cuánto se puede pasar del límite antes de decir que se está pasando.
 *
 * Un 5 % de margen sobre la propia tasa —del 4 % al 4,2 %— porque ninguna de
 * las cifras que entran aquí tiene esa precisión: el gasto de un año se
 * estima, la cartera se mueve sola un 15 % arriba y abajo, y dar la alarma
 * por tres centésimas gasta la única alarma que hay.
 */
const SLACK = 1.05;

/* ---------------------------------------------------------------------------
 * El titular
 * ------------------------------------------------------------------------- */

/**
 * Las cuentas en dos frases, que es lo que cabe en la cabeza.
 *
 * Primero el veredicto y después de dónde sale, nunca al revés: quien abre
 * esta pantalla quiere saber si va bien, no seguir un razonamiento.
 */
export function planHeadline(book: FinanceBook): { verdict: string; detail: string } {
  const n = planNumbers(book);

  if (n.monthIn <= 0 && n.monthOut <= 0) {
    return {
      verdict: 'Todavía no hay cuentas que juzgar',
      detail: 'Rellena los ingresos y los gastos del mes y esto se llena solo.',
    };
  }

  const cash =
    n.cashMonths !== null
      ? ` Con lo que hay en cuenta, eso dura ${runwayLabel(n.cashMonths)}.`
      : '';

  if (n.gap <= 0) {
    return {
      verdict: `El año cuadra y sobran ${euros(-n.gap)}`,
      detail: `Entran ${euros(n.yearIn)} y se van ${euros(n.yearOut)}. Lo que sobra es lo que mueve el reloj: cada euro ahorrado sube lo que tienes y baja a la vez lo que necesitas tener.`,
    };
  }

  if (n.rate === null) {
    return {
      verdict: `Faltan ${euros(n.gapMonth)} al mes y no hay patrimonio del que sacarlos`,
      detail: `El año se cierra con ${euros(n.gap)} de menos. Sin nada detrás, eso es deuda a plazo.`,
    };
  }

  if (n.rate <= n.rateGoal * 0.75) {
    return {
      verdict: 'Falta dinero cada mes, y aun así el patrimonio lo sostiene',
      detail: `El año se cierra con ${euros(n.gap)} de menos —${euros(n.gapMonth)} al mes— y taparlo supone sacar el ${pct(n.rate)} de lo que tienes: por debajo del ${pct(n.rateGoal)} que te has puesto como límite. No es una emergencia, es una decisión tomada: estás gastando capital a un ritmo que aguanta.${cash}`,
    };
  }

  if (n.rate <= n.rateGoal * SLACK) {
    return {
      verdict: `El año no cuadra por ${euros(n.gap)} y vas justo en el límite`,
      detail: `Taparlo supone sacar el ${pct(n.rate)} del patrimonio al año y tu límite es el ${pct(n.rateGoal)}. Cabe, pero sin margen: un año malo de bolsa o un gasto grande y te pasas.${cash}`,
    };
  }

  return {
    verdict: `Te estás comiendo el capital: el ${pct(n.rate)} al año`,
    detail: `Faltan ${euros(n.gap)} al año —${euros(n.gapMonth)} al mes— y para taparlos hay que sacar más del ${pct(n.rateGoal)} que aguanta una cartera. A este ritmo el patrimonio no se mantiene: se gasta.${cash}`,
  };
}

/* ---------------------------------------------------------------------------
 * Las acciones
 * ------------------------------------------------------------------------- */

/** El orden en que se pintan: primero lo que sangra. */
const RANK: Record<PlanAction['urgency'], number> = { sangra: 0, fragil: 1, ordenar: 2, mirar: 3 };

/**
 * Todo lo que hay que hacer con estas cuentas, ordenado.
 *
 * Corto a propósito. Lo que no llega a ser una instrucción con cifra se
 * queda en la pestaña de consejo, que para eso está.
 */
export function financePlan(book: FinanceBook): PlanAction[] {
  const n = planNumbers(book);
  const out: PlanAction[] = [];

  if (n.monthIn <= 0 || n.monthOut <= 0) return out;

  const months = book.months;
  const pay = payMonths(book);
  const target = book.goals?.cushion ?? 12;
  /**
   * Las líneas de ingreso apuntadas y todavía sin cifra: las que se pueden
   * cerrar negociando. Fuera las que van en negativo —la comisión del agente,
   * los autónomos—, que son descuentos y cerrarlas no trae un euro.
   */
  const open = book.ledgers.ingresos.filter(
    (item) => item.amount === 0 && item.label.trim() && !/negativ/i.test(item.note ?? ''),
  );

  /* --------------------------------------------------------- el hueco */

  if (n.gap > 0) {
    const perOpen = open.length > 0 ? n.gap / pay / open.length : 0;

    out.push({
      id: 'hueco',
      urgency: n.rate !== null && n.rate <= n.rateGoal * SLACK ? 'ordenar' : 'sangra',
      icon: '🕳️',
      title: `Cerrar —o aceptar a propósito— un hueco de ${euros(n.gapMonth)} al mes`,
      why:
        `Cobras ${pay} ${pay === 1 ? 'mes' : 'meses'} y vives ${months}. Un mes con nómina te deja ` +
        `${euros(n.monthSaving)}, así que la libreta del mes parece otra cosa; pero en el año entero ` +
        `entran ${euros(n.yearIn)} y salen ${euros(n.yearOut)}, y ahí faltan ${euros(n.gap)}.`,
      steps: [
        `Por ingresos: ${euros(n.gap / pay)} más al mes durante los ${pay} que cobras.` +
          (open.length > 0
            ? ` Tienes ${open.length} ${open.length === 1 ? 'línea apuntada sin cifra' : 'líneas apuntadas sin cifra'} (${open
                .map((item) => item.label)
                .join(', ')}): cerrarlas a ${euros(perOpen)} cada una ya lo tapa.`
            : ''),
        `Por gastos: ${euros(n.gapMonth)} menos al mes, todos los meses. Es el ${pct0(n.gapMonth / n.monthOut)} de lo que se va hoy.`,
        n.worth > 0
          ? `Por patrimonio: sacarlo de lo acumulado. Son ${euros(n.gap)} al año, el ${n.rate === null ? '—' : pct(n.rate)} de lo que tienes.`
          : 'Por patrimonio: no hay de dónde. Las dos vías de arriba son las únicas.',
      ],
      effect:
        'Cerrado del todo, la tasa de retirada se va a cero y el patrimonio pasa de encogerse a crecer solo.',
      metric: euros(n.gapMonth),
      experts: ['mmm', 'housel'],
    });
  }

  /* ------------------------------------------------ la tasa de retirada */

  if (n.rate !== null && n.worth > 0) {
    /** Lo que se podría sacar al año sin salirse del límite que se ha puesto. */
    const safe = n.worth * n.rateGoal;
    /** Y lo mismo con la tasa larga, la de quien tiene por delante más de treinta años. */
    const prudent = n.worth * 0.03;
    const excess = n.gap - safe;

    /** Tres estados, no dos: pasado, justo en el filo, y con margen. */
    const over = n.rate > n.rateGoal * SLACK;
    const edge = !over && n.rate > n.rateGoal * 0.75;

    out.push({
      id: 'retirada',
      urgency: over ? 'sangra' : edge ? 'fragil' : 'mirar',
      icon: '🪫',
      title: over
        ? `Bajar la retirada del ${pct(n.rate)} al ${pct(n.rateGoal)}: ${euros(excess / 12)} al mes`
        : edge
          ? `Vas al filo: sacas el ${pct(n.rate)} al año y tu límite es el ${pct(n.rateGoal)}`
          : `Sacas el ${pct(n.rate)} al año, con el límite en el ${pct(n.rateGoal)}`,
      why:
        'Lo que decide si un año en rojo es un problema no es el rojo, sino qué parte del capital ' +
        `hay que sacar para taparlo. Con ${euros(n.worth)} de patrimonio, el ${pct(n.rateGoal)} son ` +
        `${euros(safe)} al año; tú necesitas ${euros(n.gap)}.`,
      steps: over
        ? [
            `Faltan ${euros(excess)} al año —${euros(excess / 12)} al mes— para volver dentro del límite.`,
            `Para quedarte en un 3 %, lo prudente cuando el dinero tiene que durar más de treinta años, el tope serían ${euros(prudent)} al año: ${euros(Math.max(0, (n.gap - prudent) / 12))} al mes de ajuste.`,
            'La regla del 4 % nació para carteras de treinta años y una jubilación normal. Cuanto más largo sea el plazo por delante, más conviene bajarla.',
          ]
        : edge
          ? [
              `Cabe, pero sin holgura: ${euros(Math.abs(safe - n.gap) / 12)} al mes separan lo que sacas del tope que te pusiste.`,
              `Para irte a un 3 % —lo prudente cuando quedan muchos años por delante— harían falta ${euros(Math.max(0, (n.gap - prudent) / 12))} al mes de ajuste.`,
              'Y esto cuenta con que el patrimonio esté puesto donde renta: el dinero parado en cuenta no sostiene ninguna tasa.',
            ]
          : [
              `Te sobra margen: podrías sacar ${euros((safe - n.gap) / 12)} más al mes sin salirte del ${pct(n.rateGoal)}.`,
              `Si prefieres ir a un 3 % —más prudente cuando quedan muchos años por delante— el tope baja a ${euros(prudent)} al año.`,
              'Y esto cuenta con que el patrimonio esté puesto donde renta: el dinero parado en cuenta no sostiene ninguna tasa.',
            ],
      effect: over
        ? 'Por debajo del límite, el patrimonio se mantiene en términos reales en vez de encogerse.'
        : edge
          ? 'Un año malo de bolsa o un gasto grande te saca de aquí: el margen es lo que hay que comprar.'
          : 'Mientras se quede aquí, esto se sostiene sin tocar el capital de verdad.',
      metric: pct(n.rate),
      experts: ['bengen', 'housel'],
    });
  }

  /* -------------------------------------------------------- el colchón */

  if (n.cushion !== null && n.cushion < target && n.monthOut > 0) {
    const missing = Math.max(0, target * n.monthOut - n.liquid);
    const fromInvested = Math.min(missing, n.invested);

    out.push({
      id: 'colchon',
      urgency: n.cushion < 3 ? 'sangra' : 'fragil',
      icon: '🛟',
      title: `Subir la caja ${euros(missing)} hasta cubrir ${target} meses`,
      why:
        `En cuenta hay ${euros(n.liquid)} y se gastan ${euros(n.monthOut)} al mes: ` +
        `${Math.floor(n.cushion)} ${Math.floor(n.cushion) === 1 ? 'mes' : 'meses'} cubiertos.` +
        (n.cashMonths !== null
          ? ` Tapando sólo el hueco de cada mes duraría ${runwayLabel(n.cashMonths)}, que es lo que de verdad está pasando.`
          : '') +
        ' Con un contrato de temporada, el colchón no es comodidad: es lo que te deja elegir el siguiente sitio en vez de aceptar el primero.',
      steps: [
        fromInvested > 0
          ? `Pasar ${euros(fromInvested)} de lo invertido a la cuenta. No es perder rentabilidad: es pagar por poder decir que no.`
          : 'No hay de dónde sacarlo sin tocar ingresos o gastos.',
        ledgerTotal(book, 'cobros') > 0
          ? `Cobrar lo que te deben (${euros(ledgerTotal(book, 'cobros'))}) haría buena parte del trabajo, y ese dinero ya cuenta como tuyo.`
          : '',
      ].filter(Boolean),
      effect: `Pasarías de ${Math.floor(n.cushion)} a ${target} meses de autonomía sin depender de que entre nada.`,
      metric: `${Math.floor(n.cushion)} / ${target}`,
      experts: ['housel', 'kahneman'],
    });
  }

  /* --------------------------------------------------- la concentración */

  if (n.invested > 0) {
    const house = (label: string) => label.trim().toLowerCase().split(/[\s·:,-]+/)[0] ?? '';
    const byHouse = new Map<string, number>();
    for (const item of book.ledgers.inversiones) {
      byHouse.set(house(item.label), (byHouse.get(house(item.label)) ?? 0) + item.amount);
    }

    const [key, amount] = [...byHouse.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const share = amount / n.invested;

    if (share > 0.6 && key) {
      const move = amount - 0.6 * n.invested;
      // La llave viene en minúsculas de partir el rótulo; el nombre se enseña.
      const name = key.charAt(0).toUpperCase() + key.slice(1);

      out.push({
        id: 'reparto',
        urgency: share > 0.85 ? 'fragil' : 'ordenar',
        icon: '🥚',
        title: `Mover ${euros(move)} fuera de «${name}»`,
        why:
          `Ahí está el ${pct0(share)} de lo invertido: ${euros(amount)} de ${euros(n.invested)}. ` +
          'Dos fondos del mismo gestor no son dos apuestas, son la misma apuesta al mismo criterio, ' +
          'y si ese criterio pasa por una mala década lo hace con todo tu dinero a la vez. Es el único ' +
          'riesgo que el mercado no paga por asumir, porque se quita gratis repartiendo.',
        steps: [
          `Con ${euros(move)} fuera, esa casa baja al 60 % y deja de decidir ella sola cómo va tu año.`,
          'Un indexado global de coste bajo es el destino por defecto: con él no hay que acertar con nadie.',
          n.cushion !== null && n.cushion < target
            ? 'Y parte de ese traspaso puede ir a la cuenta, que es justo donde falta: dos problemas con un solo movimiento.'
            : '',
        ].filter(Boolean),
        effect: 'Repartir no baja la rentabilidad esperada; baja lo que puede salir mal.',
        metric: pct0(share),
        experts: ['markowitz', 'bogle', 'parames'],
      });
    }
  }

  /* --------------------------------------------- lo que está por cobrar */

  const owed = ledgerTotal(book, 'cobros');
  if (owed > 0) {
    const undated = book.ledgers.cobros.filter((item) => item.amount > 0 && !item.note?.trim());
    const extra = n.monthOut > 0 ? owed / n.monthOut : 0;

    out.push({
      id: 'cobrar',
      urgency: undated.length > 0 ? 'ordenar' : 'mirar',
      icon: '🫱',
      title:
        undated.length > 0
          ? `Poner fecha a ${undated.length} ${undated.length === 1 ? 'cobro' : 'cobros'} de los ${euros(owed)} que te deben`
          : `Reclamar los ${euros(owed)} que te deben, cada uno en su mes`,
      why:
        `Es el ${pct0(n.worth > 0 ? owed / n.worth : 0)} de tu patrimonio en manos de otros. Cuenta ` +
        'como patrimonio y está bien que cuente, pero no paga una factura hasta que llega, y una ' +
        'deuda sin fecha no se reclama: se recuerda de vez en cuando y se va enfriando.',
      steps: book.ledgers.cobros
        .filter((item) => item.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6)
        .map(
          (item) =>
            `${item.label || 'Sin nombre'} · ${euros(item.amount)}${item.note ? ` — ${item.note}` : ' — sin fecha'}`,
        ),
      effect: `Cobrado todo, la caja sube ${euros(owed)}: ${Math.floor(extra)} ${Math.floor(extra) === 1 ? 'mes' : 'meses'} más de autonomía.`,
      metric: euros(owed),
      experts: [],
    });
  }

  /* ------------------------------------------------------ lo que se debe */

  const owe = ledgerTotal(book, 'pagos');
  if (owe > 0) {
    out.push({
      id: 'pagar',
      urgency: 'ordenar',
      icon: '🫲',
      title: `Cerrar ${euros(owe)} que debes`,
      why:
        'Ya están descontados del patrimonio, así que pagarlos no te empobrece: sólo quita una ' +
        'cuenta pendiente de la cabeza. Y las deudas con la familia son las que peor envejecen.',
      steps: book.ledgers.pagos
        .filter((item) => item.amount > 0)
        .map(
          (item) =>
            `${item.label || 'Sin nombre'} · ${euros(item.amount)}${item.note ? ` — ${item.note}` : ''}`,
        ),
      effect: 'El patrimonio no se mueve, el colchón baja lo justo y la lista queda limpia.',
      metric: euros(owe),
      experts: [],
    });
  }

  /* ----------------------------------------------- los ingresos abiertos */

  if (open.length > 0 && n.gap > 0) {
    out.push({
      id: 'ingresos-abiertos',
      urgency: 'ordenar',
      icon: '💶',
      title: `Ponerle cifra a ${open.length} ${open.length === 1 ? 'línea de ingreso' : 'líneas de ingreso'} que están a cero`,
      why:
        `${open.map((item) => item.label).join(', ')}. Están apuntadas porque existen, pero sin cifra ` +
        'no cuentan y no se negocian: lo que no tiene número no tiene fecha.',
      steps: [
        `Cada ${euros(100)} al mes que cierres tapan el ${pct0(Math.min(1, (100 * pay) / n.gap))} del hueco del año.`,
        'Ponle a cada una una cantidad mínima y un mes en el que preguntar, aunque la cantidad sea provisional.',
        `Repartido entre las ${open.length}, salen ${euros(n.gap / pay / open.length)} al mes cada una.`,
      ],
      effect: `Con ${euros(n.gap / pay)} al mes repartidos entre ellas, el año cuadra sin tocar un solo gasto.`,
      metric: `${open.length}`,
      experts: [],
    });
  }

  /* ----------------------------------------------------------- la casa */

  const home = book.ledgers.gastos.find((item) => /casa|hipoteca|alquiler/i.test(item.label));
  if (home && n.monthIn > 0) {
    const weight = amountOf(home, 'gastos') / n.monthIn;

    if (weight > 0.3) {
      out.push({
        id: 'vivienda',
        urgency: 'mirar',
        icon: '🏠',
        title: `La casa se lleva el ${pct0(weight)} de lo que entra`,
        why:
          `${euros(amountOf(home, 'gastos'))} al mes sobre ${euros(n.monthIn)}. La referencia habitual ` +
          'es no pasar del 30 %, no porque sea una cifra mágica sino porque por encima el gasto fijo se ' +
          'come el margen de decidir: cualquier mes malo se nota entero.',
        steps: [
          `Para bajar al 30 % harían falta ${euros(amountOf(home, 'gastos') - 0.3 * n.monthIn)} menos al mes, o ${euros(amountOf(home, 'gastos') / 0.3 - n.monthIn)} más de ingreso.`,
          'Es el gasto más difícil de mover y el que más pesa: conviene saber el número aunque no se toque.',
        ],
        effect: 'Es la palanca grande. Todas las demás juntas suelen pesar menos que ésta.',
        metric: pct0(weight),
        experts: ['warren'],
      });
    }
  }

  /* ---------------------------------------------------------- la escala */

  const clashes = tierClashes(book);
  const chosen = chosenShare(book);
  const empty = CHOSEN_TIERS.filter(
    (tier) =>
      !book.ledgers.gastos.some((item) => item.tier === tier && amountOf(item, 'gastos') > 0),
  );

  if (clashes.length > 0 || empty.length > 0) {
    const worst = clashes[0];

    out.push({
      id: 'escala',
      urgency: 'ordenar',
      icon: '⚖️',
      title: worst
        ? `«${TIERS[worst.below].label}» se lleva ${euros(worst.gap)} más que «${TIERS[worst.above].label}»`
        : `${empty.length} ${empty.length === 1 ? 'prioridad tuya' : 'prioridades tuyas'} sin un euro detrás`,
      why:
        'El orden lo decidiste tú: primero los peques, luego el tiempo en pareja y los cuatro juntos, ' +
        'después la comodidad de vivir. Esto no juzga el orden, sólo contrasta el dinero contra él, que ' +
        'es lo que a solas no se ve: el gasto se reparte por costumbre, no por la escala que uno tiene ' +
        'en la cabeza.',
      steps: [
        ...chosen
          .filter((row) => row.amount > 0)
          .map(
            (row) => `${TIERS[row.tier].icon} ${TIERS[row.tier].label} · ${euros(row.amount)} al mes`,
          ),
        ...empty.map((tier) => `${TIERS[tier].icon} ${TIERS[tier].label} · nada apuntado`),
      ],
      effect: worst
        ? `Mover ${euros(worst.gap / 2)} de una a otra ya invierte el orden. Si la diferencia es a propósito, cambia la escala y esto deja de salir.`
        : 'Ponles una cifra, aunque sea pequeña: lo que no está presupuestado no ocurre.',
      metric: worst ? euros(worst.gap) : `${empty.length}`,
      experts: ['dunn', 'kahneman'],
    });
  }

  /* --------------------------------------------- previsión contra real */

  const both = book.ledgers.gastos.filter((item) => item.alt !== undefined && item.amount > 0);
  if (both.length >= 3) {
    const diff = both.reduce((total, item) => total + ((item.alt ?? 0) - item.amount), 0);

    if (Math.abs(diff) > n.monthOut * 0.05) {
      const over = diff > 0;

      out.push({
        id: 'presupuesto',
        urgency: over ? 'ordenar' : 'mirar',
        icon: over ? '🎈' : '🧮',
        title: over
          ? `Subir la previsión: lo real se pasa ${euros(diff)} al mes`
          : `Bajar la previsión: apartas ${euros(-diff)} al mes de más`,
        why: over
          ? 'Un presupuesto que no se cumple mes tras mes no es un fallo de voluntad: casi siempre es un presupuesto mal puesto, y decidir sobre cifras falsas no es decidir.'
          : `Apartas ${euros(n.monthOut - diff)} y se van ${euros(n.monthOut)}. Para sumar ya manda el real, así que esto no infla ningún total; lo que infla es la foto del año que te haces al presupuestar, y con ella se decide peor.`,
        steps: both
          .map((item) => ({ item, delta: (item.alt ?? 0) - item.amount }))
          .filter((row) => Math.abs(row.delta) >= 10)
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
          .slice(0, 6)
          .map(
            (row) =>
              `${row.item.label || 'Sin nombre'} · previsto ${euros(row.item.amount)}, real ${euros(row.item.alt ?? 0)} (${row.delta > 0 ? '+' : ''}${euros(row.delta)})`,
          ),
        effect: over
          ? 'Con la previsión puesta donde de verdad se gasta, el hueco del año deja de ser una sorpresa cada julio.'
          : `Ajustada, el año presupuestado baja ${euros(-diff * 12)} y se parece por fin al año que estás teniendo.`,
        metric: euros(Math.abs(diff)),
        experts: ['housel'],
      });
    }
  }

  /* -------------------------------------------------------- el número */

  if (n.target > 0 && n.worth > 0) {
    out.push({
      id: 'numero',
      urgency: 'mirar',
      icon: '🎯',
      title:
        n.progress >= 1
          ? 'Ya tienes el número: trabajar es una elección'
          : `Llevas el ${pct0(Math.min(1, n.progress))} del número, y sin aportar nada ${n.coast === null ? 'no llega solo' : `llega en ${yearsLabel(n.coast)}`}`,
      why:
        'El número sale del gasto y no del sueldo: ' +
        `${euros(n.yearOut)} al año entre una retirada del ${pct(n.rateGoal)} son ${euros(n.target)}. ` +
        `Tienes ${euros(n.worth)}.`,
      steps: [
        n.coast !== null
          ? `Sin meter un euro más, sólo con el ${book.goals?.realReturn ?? 4} % real que has supuesto, lo que ya tienes llega al número en ${yearsLabel(n.coast)}.`
          : 'Con el rendimiento que has supuesto, lo acumulado no llega solo al número.',
        `Cada ${euros(100)} menos de gasto al mes bajan el número en ${euros((100 * 12) / n.rateGoal)}. Recortar cuenta doble: sube lo que sobra y baja la meta.`,
      ],
      effect:
        n.progress >= 1
          ? 'A partir de aquí, lo que entre es margen.'
          : 'El patrimonio ya no es el problema; el ritmo del año sí.',
      metric: pct0(Math.min(1, n.progress)),
      experts: ['bengen', 'mmm'],
    });
  }

  return out.sort((a, b) => RANK[a.urgency] - RANK[b.urgency]);
}

/** Cuántas acciones piden hacer algo ya. Es el número de la pestaña. */
export function planCount(book: FinanceBook): number {
  return financePlan(book).filter(
    (action) => action.urgency === 'sangra' || action.urgency === 'fragil',
  ).length;
}
