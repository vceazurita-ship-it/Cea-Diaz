import {
  CHOSEN_TIERS,
  TIERS,
  amountOf,
  chosenShare,
  cushionMonths,
  euros,
  fiNumber,
  fiProgress,
  liquidWorth,
  ledgerTotal,
  monthlyExpense,
  monthlyIncome,
  monthlySaving,
  netWorth,
  savingsRate,
  tierClashes,
  yearlyExpense,
  yearsLabel,
  yearsToFi,
} from '@/lib/finance';
import type { Expert, FinanceBook, FinanceNote } from '@/types';

/* =========================================================================
 *  El criterio detrás de las cuentas.
 *
 *  Es el hermano de `lib/experts.ts`: aquello dice por qué importa dormir
 *  ocho horas; esto, por qué importa la tasa de ahorro. Y con la misma regla
 *  de la casa al citar: se distingue lo que es **consenso** —lo que casi
 *  nadie discute— de lo que es la tesis de un divulgador, y ninguna de las
 *  dos se presenta como la otra.
 *
 *  Lo que la app hace aquí no es dar consejos generales: los consejos
 *  generales están en cualquier libro. Lo que hace es **mirar sus cifras** y
 *  decir dónde se apartan de esos criterios, con el número delante. Un aviso
 *  sin cifra no vale nada, así que aquí no hay ninguno.
 *
 *  Y una advertencia que va en el propio módulo porque es parte del diseño:
 *  esto no es asesoramiento financiero. Es un espejo con reglas escritas.
 * ========================================================================= */

export const FINANCE_EXPERTS: Record<string, Expert> = {
  /* ------------------------------------------------- consenso amplio */
  bengen: {
    id: 'bengen',
    name: 'William Bengen · Estudio Trinity',
    role: 'Origen de la «regla del 4 %» (1994) y su revisión de la Universidad Trinity (1998)',
    field: 'Cuánto se puede retirar sin agotar la cartera',
    level: 'consenso',
  },
  bogle: {
    id: 'bogle',
    name: 'John C. Bogle',
    role: 'Fundador de Vanguard, «El pequeño libro para invertir con sentido común»',
    field: 'Diversificación, costes e indexación',
    level: 'consenso',
  },
  markowitz: {
    id: 'markowitz',
    name: 'Harry Markowitz',
    role: 'Nobel de Economía; teoría moderna de carteras',
    field: 'Por qué concentrar es el riesgo que no se paga',
    level: 'consenso',
  },
  kahneman: {
    id: 'kahneman',
    name: 'Daniel Kahneman',
    role: 'Nobel de Economía, «Pensar rápido, pensar despacio»',
    field: 'Aversión a la pérdida y el yo que recuerda',
    level: 'consenso',
  },

  /* ------------------------------------------------------ divulgación */
  warren: {
    id: 'warren',
    name: 'Elizabeth Warren y Amelia Warren Tyagi',
    role: '«All Your Worth»: el reparto 50 / 30 / 20',
    field: 'Cuánto de lo que entra debería quedarse',
    level: 'divulgacion',
  },
  dunn: {
    id: 'dunn',
    name: 'Elizabeth Dunn y Michael Norton',
    role: '«Happy Money»: en qué gastar para que rinda',
    field: 'Experiencias, tiempo y gasto compartido',
    level: 'divulgacion',
  },
  mmm: {
    id: 'mmm',
    name: 'Pete Adeney (Mr. Money Mustache)',
    role: '«The Shockingly Simple Math Behind Early Retirement»',
    field: 'La tasa de ahorro como reloj de la independencia',
    level: 'divulgacion',
  },
  housel: {
    id: 'housel',
    name: 'Morgan Housel',
    role: '«La psicología del dinero»',
    field: 'Margen de error y control del propio tiempo',
    level: 'divulgacion',
  },
  parames: {
    id: 'parames',
    name: 'Francisco García Paramés',
    role: 'Cobas AM, «Invirtiendo a largo plazo»',
    field: 'Value investing y horizonte largo',
    level: 'divulgacion',
    caveat:
      'Su marco es coherente, pero la gestión activa concentrada bate al índice sólo a veces y no de forma previsible: tenerlo todo con un gestor es una apuesta, no una diversificación.',
  },
};

/**
 * Quién sostiene lo que se está diciendo. Vale igual para una nota que para
 * una acción del plan: las dos citan del mismo cajón y con la misma regla.
 */
export function financeExpertsOf(note: { experts: string[] }): Expert[] {
  return note.experts.map((id) => FINANCE_EXPERTS[id]).filter(Boolean);
}

/* ---------------------------------------------------------------------------
 * Las reglas
 *
 * Cada una mira una cifra suya y decide si hay algo que decir. El orden del
 * resultado es el de urgencia, no el de la lista: primero lo que sangra,
 * luego lo que falta, luego lo que va bien y por último las ideas.
 * ------------------------------------------------------------------------- */

const pct = (value: number) => `${Math.round(value * 100)} %`;

/**
 * Todo lo que la app tiene que decir de estas cuentas, ya contrastado.
 *
 * Devuelve una lista corta a propósito: veinte avisos son cero avisos. Lo que
 * no llega a ser noticia no se cuenta.
 */
export function financeNotes(book: FinanceBook): FinanceNote[] {
  const notes: FinanceNote[] = [];

  const income = monthlyIncome(book);
  const spend = monthlyExpense(book);
  const saving = monthlySaving(book);
  const rate = savingsRate(book);
  const worth = netWorth(book);
  const liquid = liquidWorth(book);
  const cushion = cushionMonths(book);
  const target = book.goals?.cushion ?? 12;

  /* --------------------------------------------------- sin datos aún */

  if (income <= 0 || spend <= 0) {
    notes.push({
      id: 'empezar',
      tone: 'idea',
      icon: '✍️',
      title: 'Rellena primero los ingresos y los gastos del mes',
      detail:
        'Con esas dos columnas ya salen la tasa de ahorro, el número que persigues y los años que faltan. El patrimonio puede esperar: lo que manda el reloj es lo que entra y lo que sale.',
      experts: ['mmm'],
    });
    return notes;
  }

  /* ------------------------------------------------------- lo urgente */

  if (saving < 0) {
    notes.push({
      id: 'ahorro-negativo',
      tone: 'grave',
      icon: '🩸',
      title: `Cada mes se van ${euros(-saving)} más de los que entran`,
      detail: `Entran ${euros(income)} y salen ${euros(spend)}. Mientras eso siga, todo lo demás —el número, los años, el colchón— se mueve hacia atrás: no es que se avance despacio, es que se retrocede. Lo primero no es invertir mejor, es cerrar esa diferencia.`,
      experts: ['housel'],
      metric: euros(saving),
    });
  }

  if (cushion !== null && cushion < target) {
    const falta = Math.max(0, target * spend - liquid);
    notes.push({
      id: 'colchon',
      tone: cushion < 3 ? 'grave' : 'aviso',
      icon: '🛟',
      title: `El colchón cubre ${Math.floor(cushion)} ${Math.floor(cushion) === 1 ? 'mes' : 'meses'}, y te has puesto ${target}`,
      detail: `En dinero disponible tienes ${euros(liquid)} y gastas ${euros(spend)} al mes. Para llegar a los ${target} meses faltan ${euros(falta)}. Lo corriente es aconsejar de tres a seis, pero tu ingreso principal es un contrato de temporada que se renueva o no se renueva: ahí el colchón no es una comodidad, es lo que te deja elegir el siguiente sitio en vez de aceptar el primero.`,
      experts: ['housel', 'kahneman'],
      metric: `${Math.floor(cushion)} / ${target}`,
    });
  }

  /* ------------------------------------------------ la tasa de ahorro */

  if (rate !== null && saving >= 0) {
    if (rate < 0.2) {
      notes.push({
        id: 'tasa-baja',
        tone: 'aviso',
        icon: '📉',
        title: `Se queda el ${pct(rate)} de lo que entra`,
        detail: `El reparto de referencia deja un 20 % para ahorrar e invertir; tú vas por el ${pct(rate)}. No es una regla sagrada, pero es el número que decide cuánto tardas: al 20 % se tarda del orden de treinta y siete años, al 40 % unos veintidós, al 60 % unos doce. Sube el gasto o baja el ahorro y el reloj se mueve entero.`,
        experts: ['warren', 'mmm'],
        metric: pct(rate),
      });
    } else if (rate >= 0.5) {
      notes.push({
        id: 'tasa-alta',
        tone: 'bien',
        icon: '🚀',
        title: `Te quedas el ${pct(rate)} de lo que entra`,
        detail: `Eso es lo que de verdad acorta el camino, y no el sueldo: ahorrar más sube lo que acumulas y baja a la vez lo que necesitas acumular, porque el objetivo se calcula sobre lo que gastas. Con esta tasa, la cuenta de los años de abajo es creíble.`,
        experts: ['mmm'],
        metric: pct(rate),
      });
    } else {
      notes.push({
        id: 'tasa-ok',
        tone: 'bien',
        icon: '💪',
        title: `Te quedas el ${pct(rate)} de lo que entra`,
        detail: `Por encima del 20 % de referencia. Cada punto que subas de aquí se nota doble: sube lo que acumulas y baja lo que hace falta acumular.`,
        experts: ['warren'],
        metric: pct(rate),
      });
    }
  }

  /* --------------------------------------------- la independencia */

  const progress = fiProgress(book);
  const years = yearsToFi(book);
  const number = fiNumber(book);

  if (number > 0) {
    notes.push({
      id: 'independencia',
      tone: progress >= 1 ? 'bien' : 'idea',
      icon: '🎯',
      title:
        progress >= 1
          ? 'Ya tienes el número: lo acumulado da para vivir del gasto de hoy'
          : `Llevas el ${pct(Math.min(1, progress))} del número que persigues`,
      detail:
        progress >= 1
          ? `Gastas ${euros(yearlyExpense(book))} al año y tienes ${euros(worth)}: por encima de las ${Math.round(100 / (book.goals?.withdrawal ?? 4))} veces el gasto anual que marca la referencia. A partir de aquí, trabajar es una elección. La regla nació para carteras de treinta años; para retiradas más largas hay quien baja la retirada al 3,5 %, y eso te subiría el número.`
          : `El número sale de tu gasto, no de tu sueldo: ${euros(yearlyExpense(book))} al año entre una retirada del ${book.goals?.withdrawal ?? 4} % son ${euros(number)}. Tienes ${euros(worth)}.${
              years !== null
                ? ` Al ritmo de ahora y suponiendo un ${book.goals?.realReturn ?? 4} % real, faltan ${yearsLabel(years)}.`
                : ' Sin ahorro mensual no hay fecha: por ese camino no se llega.'
            }`,
      experts: ['bengen', 'mmm'],
      metric: progress >= 1 ? '✓' : pct(Math.min(1, progress)),
    });
  }

  /* ------------------------------------------------- las inversiones */

  const invested = ledgerTotal(book, 'inversiones');
  if (invested > 0) {
    const items = [...book.ledgers.inversiones].sort((a, b) => b.amount - a.amount);
    const top = items[0];

    /** Dos fondos del mismo gestor no son dos apuestas: son la misma. */
    const casa = (label: string) => label.trim().toLowerCase().split(/[\s·:,-]+/)[0] ?? '';
    const porCasa = new Map<string, number>();
    for (const item of items) {
      porCasa.set(casa(item.label), (porCasa.get(casa(item.label)) ?? 0) + item.amount);
    }
    const [mayorCasa, mayorImporte] = [...porCasa.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const concentracion = mayorImporte / invested;

    if (concentracion > 0.6 && mayorCasa) {
      notes.push({
        id: 'concentracion',
        tone: 'aviso',
        icon: '🥚',
        title: `El ${pct(concentracion)} de lo invertido está en una sola casa`,
        detail: `«${mayorCasa}» suma ${euros(mayorImporte)} de ${euros(invested)}. Dos fondos del mismo gestor no son dos apuestas: son la misma apuesta al mismo criterio, y si ese criterio pasa por una mala década lo hace con todo tu dinero a la vez. Es el único riesgo que el mercado no te paga por asumir, porque se quita gratis repartiendo. No es un juicio sobre el gestor: es aritmética de carteras.`,
        experts: ['markowitz', 'bogle', 'parames'],
        metric: pct(concentracion),
      });
    } else if (top && top.amount / invested > 0.6) {
      notes.push({
        id: 'concentracion-fondo',
        tone: 'aviso',
        icon: '🥚',
        title: `«${top.label}» se lleva el ${pct(top.amount / invested)} de lo invertido`,
        detail: `Son ${euros(top.amount)} de ${euros(invested)}. Concentrar es el riesgo que no se paga: se quita repartiendo, y repartir no cuesta rentabilidad esperada.`,
        experts: ['markowitz', 'bogle'],
        metric: pct(top.amount / invested),
      });
    }
  }

  /* ------------------------------------------ lo que está por cobrar */

  const cobros = ledgerTotal(book, 'cobros');
  if (cobros > 0 && worth > 0) {
    const peso = cobros / worth;
    const sinFecha = book.ledgers.cobros.filter((item) => !item.note?.trim());

    if (peso > 0.15) {
      notes.push({
        id: 'cobros-peso',
        tone: 'aviso',
        icon: '🫱',
        title: `El ${pct(peso)} de tu patrimonio es dinero que no tienes todavía`,
        detail: `${euros(cobros)} en manos de otros. Cuenta como patrimonio y está bien que cuente, pero no es colchón: no paga una factura hasta que llega. Por eso la app te dice aparte cuánto aguantas con lo que está en cuenta, que ahora son ${cushion === null ? '—' : Math.floor(cushion)} meses.`,
        experts: ['housel'],
        metric: pct(peso),
      });
    }

    if (sinFecha.length > 0) {
      notes.push({
        id: 'cobros-sin-fecha',
        tone: 'aviso',
        icon: '📅',
        title: `${sinFecha.length} ${sinFecha.length === 1 ? 'cobro sin fecha' : 'cobros sin fecha'} de reclamación`,
        detail: `Suman ${euros(sinFecha.reduce((total, item) => total + item.amount, 0))}. Una deuda sin fecha no se reclama: se recuerda de vez en cuando y se va enfriando. Ponle mes a cada una y deja de tener que acordarte tú.`,
        experts: [],
        metric: `${sinFecha.length}`,
      });
    }
  }

  /* --------------------------------------------------- la vivienda */

  const casa = book.ledgers.gastos.find((item) => /casa|hipoteca|alquiler/i.test(item.label));
  if (casa && income > 0) {
    const peso = amountOf(casa, 'gastos') / income;
    if (peso > 0.3) {
      notes.push({
        id: 'vivienda',
        tone: 'aviso',
        icon: '🏠',
        title: `La casa se lleva el ${pct(peso)} de lo que entra`,
        detail: `${euros(amountOf(casa, 'gastos'))} al mes. La referencia habitual es no pasar del 30 %, no porque sea una cifra mágica sino porque por encima de ahí el gasto fijo se come el margen de decidir: cualquier mes malo se nota entero.`,
        experts: ['warren'],
        metric: pct(peso),
      });
    }
  }

  /* ----------------------------------------------------- la escala */

  const chosen = chosenShare(book);
  const clashes = tierClashes(book);
  const sinColocar = book.ledgers.gastos.filter((item) => !item.tier);

  if (sinColocar.length > 0) {
    notes.push({
      id: 'sin-colocar',
      tone: 'idea',
      icon: '🏷️',
      title: `${sinColocar.length} ${sinColocar.length === 1 ? 'gasto sin colocar' : 'gastos sin colocar'} en tu escala`,
      detail:
        'Colócalos y la app podrá decirte si el dinero está yendo donde has dicho que quieres que vaya. Es un toque por gasto y se hace una vez.',
      experts: [],
      metric: `${sinColocar.length}`,
    });
  }

  if (clashes.length > 0) {
    const peor = clashes[0];
    notes.push({
      id: 'escala',
      tone: 'aviso',
      icon: '⚖️',
      title: `«${TIERS[peor.below].label}» se lleva más que «${TIERS[peor.above].label}»`,
      detail: `${euros(peor.gap)} al mes de diferencia, y en tu escala va después. Puede tener explicación —hay meses así— pero es justo lo que no se ve solo: el dinero se reparte por costumbre, no por la escala que uno tiene en la cabeza. Si la diferencia es a propósito, cambia el orden; si no, ya sabes qué mirar.`,
      experts: ['kahneman'],
      metric: euros(peor.gap),
    });
  }

  const experiencias = chosen
    .filter((row) => row.tier === 'pareja' || row.tier === 'familia')
    .reduce((total, row) => total + row.amount, 0);
  const elegido = chosen.reduce((total, row) => total + row.amount, 0);

  if (elegido > 0 && experiencias / elegido < 0.15 && spend > 0) {
    notes.push({
      id: 'experiencias',
      tone: 'idea',
      icon: '🧭',
      title: `Sólo el ${pct(experiencias / elegido)} de lo que eliges gastar va a estar juntos`,
      detail: `${euros(experiencias)} al mes entre lo de pareja y lo de los cuatro. Lo que se sabe del gasto y el bienestar apunta bastante claro en una dirección: lo compartido y lo que se recuerda rinde más que lo que se acumula, y es de lo poco que sigue rindiendo años después. Tú lo pusiste en lo alto de tu escala; la cifra todavía no.`,
      experts: ['dunn', 'kahneman'],
      metric: pct(experiencias / elegido),
    });
  }

  /* ------------------------------------------- previsión contra real */

  const conDos = book.ledgers.gastos.filter((item) => item.alt !== undefined && item.amount > 0);
  if (conDos.length >= 3) {
    const desvio = conDos.reduce((total, item) => total + ((item.alt ?? 0) - item.amount), 0);
    if (desvio > spend * 0.05) {
      notes.push({
        id: 'presupuesto',
        tone: 'aviso',
        icon: '🎈',
        title: `Lo real se pasa ${euros(desvio)} de lo previsto`,
        detail:
          'Un presupuesto que no se cumple mes tras mes no es un fallo de voluntad: normalmente es un presupuesto mal puesto. Sube la previsión a lo que de verdad se gasta y decide sobre cifras verdaderas, que es lo único sobre lo que se puede decidir.',
        experts: ['housel'],
        metric: euros(desvio),
      });
    } else if (desvio < -spend * 0.05) {
      notes.push({
        id: 'presupuesto-holgado',
        tone: 'bien',
        icon: '🎯',
        title: `Se está gastando ${euros(-desvio)} menos de lo previsto`,
        detail:
          'La previsión va holgada. Si se repite, ese margen ya es ahorro de hecho: llévalo a la libreta en vez de dejarlo suelto en la cuenta, donde se acaba gastando solo.',
        experts: [],
        metric: euros(-desvio),
      });
    }
  }

  /* -------------------------------------------------------- orden */

  const peso: Record<FinanceNote['tone'], number> = { grave: 0, aviso: 1, idea: 2, bien: 3 };
  return notes.sort((a, b) => peso[a.tone] - peso[b.tone]);
}

/** Cuántas cosas piden atención de verdad. Es el número de la pestaña. */
export function financeAlerts(book: FinanceBook): number {
  return financeNotes(book).filter((note) => note.tone === 'grave' || note.tone === 'aviso').length;
}

/** Las prioridades que todavía no tienen ni un gasto puesto. */
export function emptyTiers(book: FinanceBook): string[] {
  const used = new Set(book.ledgers.gastos.map((item) => item.tier));
  return CHOSEN_TIERS.filter((tier) => !used.has(tier)).map((tier) => TIERS[tier].label);
}
