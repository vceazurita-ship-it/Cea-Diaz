import {
  FIELD_BY_ID,
  FITNESS_FIELDS,
  compare,
  derive,
  formatValue,
  monthsBetween,
  newestFirst,
  oldestFirst,
  type Change,
  type FitnessFieldId,
  type FitnessTest,
} from '@/lib/fitness';
import {
  bandOf,
  bmiFor,
  bmiLabel,
  expectedGrowth,
  heightFor,
  maturityMoore,
  meaningful,
  placeAll,
  tauOf,
  TYPICAL_ERROR,
  type FitPlacement,
} from '@/lib/fitnessReferences';
import type { GpsSession } from '@/types';

/* =========================================================================
 *  La auditoría.
 *
 *  Un informe de RX2 da una tabla con flechas de colores: «+6,7 %», «−16 %».
 *  Eso no es un análisis, es aritmética, y además engaña dos veces. Engaña
 *  cuando celebra un cambio que está dentro del error de la propia prueba, y
 *  engaña cuando llama bajón a un cambio que es en realidad una manera nueva
 *  de saltar.
 *
 *  Esto lee las mismas tablas y dice lo que de verdad se puede decir:
 *
 *   1. **Sitúa.** Dónde cae cada cosa frente a lo publicado, con su cita.
 *   2. **Filtra.** Todo cambio que no supere el error típico de la prueba se
 *      marca como ruido, aunque venga con su flecha verde en el PDF.
 *   3. **Explica.** Cuando dos cifras se mueven a la vez y la explicación es
 *      una sola —saltar igual de alto tardando menos no es estancarse, es
 *      haberse vuelto más explosivo—, lo dice.
 *   4. **Avisa del método.** Aparatos distintos, una sola repetición, meses
 *      entre pruebas, verano de por medio.
 *   5. **Cruza con el GPS.** Lo que da en un test contra lo que hace en un
 *      partido.
 *
 *  Y no puntúa a nadie. El marco es el del consenso del COI: a esta edad se
 *  mide para cuidar y para enseñar. Cada hallazgo acaba, cuando toca, en algo
 *  que se puede hacer el martes.
 * ========================================================================= */

export type Severity = 'bien' | 'dato' | 'ojo' | 'atencion';

export const SEVERITY_LABEL: Record<Severity, string> = {
  bien: 'Va bien',
  dato: 'Para saberlo',
  ojo: 'Ojo con esto',
  atencion: 'Mirarlo',
};

export const SEVERITY_ICON: Record<Severity, string> = {
  bien: '✅',
  dato: 'ℹ️',
  ojo: '👀',
  atencion: '⚠️',
};

export type Area = 'crecimiento' | 'madurez' | 'salto' | 'sprint' | 'cruce' | 'metodo';

export const AREA_LABEL: Record<Area, string> = {
  crecimiento: 'Crecimiento',
  madurez: 'Maduración',
  salto: 'Salto y potencia',
  sprint: 'Velocidad',
  cruce: 'Test contra partido',
  metodo: 'Cómo está medido',
};

export interface Finding {
  id: string;
  area: Area;
  severity: Severity;
  title: string;
  /** El hallazgo, en prosa. */
  text: string;
  /** Las cifras en las que se apoya, para que se pueda comprobar. */
  evidence?: string[];
  /** Qué hacer con esto, si hay algo que hacer. */
  todo?: string;
  /** La fuente, si la hay. */
  source?: string;
}

const pct = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')} %`;
/** El mismo número sin signo, para cuando la frase ya dice si sube o baja. */
const size = (value: number) => `${Math.abs(value).toFixed(1).replace('.', ',')} %`;
const num = (value: number, decimals = 1) => value.toFixed(decimals).replace('.', ',');

/** «Mejor que el 41 % de los niños de su edad». */
function place(percentile: number): string {
  return `percentil ${Math.round(percentile)}`;
}

/* ---------------------------------------------------------------------------
 * Crecimiento
 * ------------------------------------------------------------------------- */

function auditGrowth(tests: FitnessTest[], age: number): Finding[] {
  const out: Finding[] = [];
  const last = newestFirst(tests)[0];
  if (!last) return out;
  const d = derive(last);

  if (last.height) {
    const growth = heightFor(last.height, age);
    if (growth) {
      out.push({
        id: 'talla',
        area: 'crecimiento',
        severity: 'dato',
        title: `Talla: ${place(growth.percentile)} de su edad`,
        text:
          growth.percentile >= 40
            ? `Con ${num(last.height)} cm está donde le toca. La mediana de los niños de su edad es ${num(growth.median)} cm.`
            : `Con ${num(last.height)} cm va por debajo de la mediana de su edad, que son ${num(growth.median)} cm. Estar por debajo no es un problema: la mitad de los niños lo está, y lo que importa es que la curva siga subiendo a su ritmo.`,
        evidence: [`z = ${num(growth.z, 2)}`, `mediana OMS a los ${num(age)} años: ${num(growth.median)} cm`],
        source: 'oms',
      });
    }
  }

  if (d.bmi) {
    const bmi = bmiFor(d.bmi, age);
    if (bmi) {
      const label = bmiLabel(bmi.z);
      out.push({
        id: 'imc',
        area: 'crecimiento',
        severity: label.tone === 'ok' ? 'bien' : label.tone === 'ojo' ? 'ojo' : 'atencion',
        title: `Complexión: ${label.label}`,
        text: `Su índice de masa corporal es ${num(d.bmi, 1)}, ${place(bmi.percentile)} para su edad. La OMS llama a eso «${label.label}».`,
        evidence: [`z = ${num(bmi.z, 2)}`, `mediana OMS: ${num(bmi.median, 1)} kg/m²`],
        source: 'oms',
        todo:
          label.tone === 'ok'
            ? undefined
            : 'Esto lo mira el pediatra, no una aplicación: aquí sólo se enseña dónde cae el número.',
      });
    }
  }

  // Velocidad de crecimiento entre la primera y la última talla.
  const conAltura = oldestFirst(tests.filter((test) => test.height));
  if (conAltura.length >= 2) {
    const first = conAltura[0];
    const change = compare(first, last, 'height');
    if (change && change.months >= 6) {
      const esperado = expectedGrowth(age);
      const ratio = change.perYear / esperado;
      out.push({
        id: 'ritmo-crecimiento',
        area: 'crecimiento',
        severity: ratio < 0.7 ? 'ojo' : 'dato',
        title: `Está creciendo ${num(change.perYear)} cm al año`,
        text:
          ratio < 0.7
            ? `En los últimos ${Math.round(change.months)} meses ha crecido ${num(change.delta)} cm, que son ${num(change.perYear)} cm al año. A su edad la mediana crece unos ${num(esperado)}. Un año por debajo no dice nada por sí solo —los niños crecen a tirones—, pero es de lo poco de este informe que conviene comentar en la revisión del pediatra.`
            : `En los últimos ${Math.round(change.months)} meses ha crecido ${num(change.delta)} cm: ${num(change.perYear)} cm al año, contra los ${num(esperado)} de la mediana a su edad. Va a su ritmo.`,
        evidence: [
          `${first.date}: ${num(first.height!)} cm`,
          `${last.date}: ${num(last.height!)} cm`,
          `mediana esperada: ${num(esperado)} cm/año`,
        ],
        source: 'oms',
        todo: ratio < 0.7 ? 'Llevar la curva a la próxima revisión. Nada más: no es un dato de entrenamiento.' : undefined,
      });
    }
  }

  if (d.legRatio) {
    out.push({
      id: 'piernas',
      area: 'crecimiento',
      severity: 'dato',
      title: `Las piernas son el ${num(d.legRatio)} % de lo que mide`,
      text:
        'Esta proporción sube justo antes del estirón, porque las piernas se alargan antes que el tronco. Seguirla de prueba en prueba es la manera barata de ver venir el cambio.',
      evidence: [`${num(last.legLength ?? 0)} cm de pierna sobre ${num(last.height ?? 0)} cm de altura`],
      source: 'malina',
    });
  }

  return out;
}

/* ---------------------------------------------------------------------------
 * Maduración
 * ------------------------------------------------------------------------- */

function auditMaturity(tests: FitnessTest[], age: number): Finding[] {
  const out: Finding[] = [];
  const last = newestFirst(tests)[0];
  if (!last) return out;
  const d = derive(last);

  if (d.bioGap !== undefined) {
    const adelanto = d.bioGap;
    out.push({
      id: 'edad-bio',
      area: 'madurez',
      severity: 'dato',
      title:
        Math.abs(adelanto) < 0.5
          ? 'Su cuerpo va con su carné'
          : adelanto > 0
            ? `Su cuerpo va ${num(adelanto)} años por delante del carné`
            : `Su cuerpo va ${num(-adelanto)} años por detrás del carné`,
      text:
        Math.abs(adelanto) < 0.5
          ? `El informe le estima ${num(last.bioAge ?? 0, 2)} años de edad biológica con ${num(age, 1)} de edad real. Van juntas, así que compararle con los de su año es justo.`
          : adelanto > 0
            ? `El informe le estima ${num(last.bioAge ?? 0, 2)} años de edad biológica con ${num(age, 1)} de edad real. Parte de lo que hace hoy en las pruebas es eso y no entrenamiento; y parte de la ventaja se igualará cuando los demás lleguen donde está él.`
            : `El informe le estima ${num(last.bioAge ?? 0, 2)} años de edad biológica con ${num(age, 1)} de edad real. Lo que hoy parezca un déficit frente a sus compañeros puede ser sólo calendario, y se recupera solo.`,
      evidence: [`edad biológica ${num(last.bioAge ?? 0, 2)} · edad real ${num(age, 2)}`],
      source: 'banding',
      todo: 'Cuando se le compare con otros —en el club o aquí—, mirar antes esta línea.',
    });
  }

  // Contraste con la ecuación de Moore, que es la que menos se equivoca.
  const moore = last.height ? maturityMoore(age, last.height) : null;
  if (moore) {
    const band = bandOf(moore.offset);
    const dicho = last.phvAge;
    out.push({
      id: 'pvc',
      area: 'madurez',
      severity: 'dato',
      title: `${band.label}: le faltan unos ${num(-moore.offset)} años`,
      text: `${band.detail}${
        dicho
          ? ` El informe estima el pico a los ${num(dicho)} años con la fórmula de Mirwald; la de Moore, más moderna, lo pone a los ${num(moore.phvAge)}. Que las dos digan lo mismo a grandes rasgos es lo que hace fiable la conclusión, y la conclusión es que el estirón queda lejos.`
          : ` Calculado con la ecuación de Moore, el pico le caería a los ${num(moore.phvAge)} años.`
      }`,
      evidence: [
        `Moore (2015): pico a los ${num(moore.phvAge)} años`,
        ...(dicho ? [`Mirwald (2002), la del informe: ${num(dicho)} años`] : []),
      ],
      source: 'moore',
      todo:
        moore.offset < -2
          ? 'Ventana de aprender a moverse: técnica de carrera, saltar y caer, cambiar de dirección, y muchos deportes distintos.'
          : undefined,
    });
  }

  return out;
}

/* ---------------------------------------------------------------------------
 * Salto
 * ------------------------------------------------------------------------- */

function auditJump(tests: FitnessTest[]): Finding[] {
  const out: Finding[] = [];
  const serie = oldestFirst(tests.filter((test) => test.jumpHeight));
  if (serie.length === 0) return out;

  const last = serie[serie.length - 1];
  const first = serie[0];
  const d = derive(last);

  // La lectura que el PDF no hace: altura igual y despegue más corto. Se
  // mira entre las dos últimas pruebas, que es donde pasa.
  const altura = serie.length >= 2 ? compare(first, last, 'jumpHeight') : null;
  const despegue = serie.length >= 2 ? compare(first, last, 'takeOff') : null;
  const previa = serie.length >= 2 ? serie[serie.length - 2] : null;
  const alturaCorta = previa ? compare(previa, last, 'jumpHeight') : null;
  const despegueCorto = previa ? compare(previa, last, 'takeOff') : null;

  if (
    alturaCorta &&
    despegueCorto &&
    despegueCorto.better &&
    Math.abs(despegueCorto.percent) > (TYPICAL_ERROR.takeOff ?? 7) &&
    Math.abs(alturaCorta.percent) <= (TYPICAL_ERROR.jumpHeight ?? 5)
  ) {
    out.push({
      id: 'salto-explosivo-corto',
      area: 'salto',
      severity: 'bien',
      title: 'Salta lo mismo, pero tarda mucho menos en saltarlo',
      text: `Es el hallazgo más importante de la última prueba, y es justo el que se pierde mirando sólo los porcentajes. Entre ${previa!.date} y ${last.date} la altura pasa de ${num(alturaCorta.from, 2)} a ${num(alturaCorta.to, 2)} m —o sea, igual, porque ese cambio no llega al error de la prueba— mientras el tiempo hasta el despegue cae de ${num(despegueCorto.from, 2)} a ${num(despegueCorto.to, 2)} s, un ${size(despegueCorto.percent)}. Producir la misma altura en menos tiempo es la definición de volverse más explosivo: más impulso por segundo. En un campo eso es el primer paso, la disputa de un balón dividido, el salto de cabeza al que llegas antes.`,
      evidence: [
        `altura ${num(alturaCorta.from, 2)} → ${num(alturaCorta.to, 2)} m (dentro del ruido)`,
        `despegue ${num(despegueCorto.from, 2)} → ${num(despegueCorto.to, 2)} s (${pct(despegueCorto.percent)})`,
        ...(d.rsiMod ? [`salto por tiempo de despegue: ${num(d.rsiMod, 2)} m/s`] : []),
      ],
      source: 'ypd',
    });
  }

  if (altura && despegue && despegue.better && Math.abs(altura.percent) <= (TYPICAL_ERROR.jumpHeight ?? 5)) {
    out.push({
      id: 'salto-explosivo',
      area: 'salto',
      severity: 'bien',
      title: 'Salta lo mismo, pero tarda mucho menos en saltarlo',
      text: `Es el hallazgo más importante de toda la serie, y es justo el que se pierde si sólo se miran los porcentajes. La altura ha pasado de ${num(altura.from, 2)} a ${num(altura.to, 2)} m —o sea, igual, porque ese cambio no llega al error de la prueba—, pero el tiempo hasta el despegue ha caído de ${num(despegue.from, 2)} a ${num(despegue.to, 2)} s, un ${pct(despegue.percent)}. Producir la misma altura en menos tiempo es exactamente la definición de volverse más explosivo: más impulso por segundo. En un campo eso es el primer paso, la disputa de un balón dividido, el salto de cabeza al que llegas antes.`,
      evidence: [
        `altura ${num(altura.from, 2)} → ${num(altura.to, 2)} m (${pct(altura.percent)}, dentro del ruido)`,
        `despegue ${num(despegue.from, 2)} → ${num(despegue.to, 2)} s (${pct(despegue.percent)})`,
        ...(d.rsiMod ? [`salto por tiempo de despegue: ${num(d.rsiMod, 2)} m/s`] : []),
      ],
      source: 'ypd',
    });
  } else if (altura) {
    const real = meaningful('jumpHeight', altura.percent);
    out.push({
      id: 'salto-altura',
      area: 'salto',
      severity: altura.better && real ? 'bien' : 'dato',
      title: real
        ? `El salto ha ${altura.better ? 'subido' : 'bajado'} un ${size(altura.percent)}`
        : 'El salto está donde estaba',
      text: real
        ? `De ${num(altura.from, 2)} a ${num(altura.to, 2)} m en ${Math.round(altura.months)} meses.`
        : `De ${num(altura.from, 2)} a ${num(altura.to, 2)} m: un cambio por debajo del error típico de un salto (±${TYPICAL_ERROR.jumpHeight} %), así que no dice ni que haya mejorado ni que haya empeorado.`,
      evidence: [`${first.date} → ${last.date}`],
      source: 'artero',
    });
  }

  // La frenada, que es donde el PDF pone una flecha roja.
  const frenada = serie.length >= 2 ? compare(serie[serie.length - 2] ?? first, last, 'peakBraking') : null;
  if (frenada && !frenada.better && Math.abs(frenada.percent) > (TYPICAL_ERROR.peakBraking ?? 8)) {
    out.push({
      id: 'frenada',
      area: 'salto',
      severity: 'dato',
      title: `La fuerza de frenada ha bajado un ${size(frenada.percent)}`,
      text: `Bajó de ${Math.round(frenada.from)} a ${Math.round(frenada.to)} N. Visto solo parece un retroceso, pero el pico de frenada depende muchísimo de **cómo** baje el niño antes de saltar: si se agacha menos y más rápido, el pico baja aunque el salto sea igual o mejor. Con el tiempo de despegue bajando a la vez, la explicación más probable es un cambio de técnica, no una pérdida de fuerza. Para saberlo de verdad hace falta la profundidad del contramovimiento, que el informe no trae.`,
      evidence: [`${Math.round(frenada.from)} → ${Math.round(frenada.to)} N en ${Math.round(frenada.months)} meses`],
      todo: 'Pedir a RX2 la profundidad del contramovimiento o el impulso de frenada, no sólo el pico.',
      source: 'artero',
    });
  }

  // Fuerza relativa: lo que de verdad importa cuando el niño está creciendo.
  if (d.propulsiveBw) {
    const nivel = d.propulsiveBw >= 2.4 ? 'bien' : d.propulsiveBw >= 2 ? 'dato' : 'ojo';
    out.push({
      id: 'fuerza-relativa',
      area: 'salto',
      severity: nivel as Severity,
      title: `Empuja ${num(d.propulsiveBw, 2)} veces su propio peso`,
      text: `El pico de impulso es de ${Math.round(last.peakPropulsive ?? 0)} N con ${num(last.weight ?? 0)} kg. En un salto con contramovimiento lo normal es moverse entre dos veces y dos veces y media el peso corporal. Mirarlo en newtons sueltos engaña mientras el niño crece: si engorda un 20 % y su fuerza sube un 20 %, salta exactamente igual.`,
      evidence: [
        `impulso ${Math.round(last.peakPropulsive ?? 0)} N · peso ${num(last.weight ?? 0)} kg`,
        `${num(d.propulsivePerKg ?? 0, 1)} N por kilo`,
      ],
      source: 'ypd',
    });
  }

  // Y la evolución de la fuerza relativa, que es el número honesto.
  const conFuerza = oldestFirst(tests.filter((test) => test.peakPropulsive && test.weight));
  if (conFuerza.length >= 2) {
    const a = derive(conFuerza[0]).propulsiveBw ?? 0;
    const b = derive(conFuerza[conFuerza.length - 1]).propulsiveBw ?? 0;
    if (a > 0) {
      const cambio = ((b - a) / a) * 100;
      out.push({
        id: 'fuerza-relativa-evolucion',
        area: 'salto',
        severity: cambio >= 0 ? 'bien' : 'ojo',
        title: `Fuerza por kilo: ${pct(cambio)} desde ${conFuerza[0].date}`,
        text:
          cambio >= 0
            ? `Ha ganado peso y ha ganado fuerza por encima del peso ganado, que es lo que hay que conseguir mientras se crece.`
            : `Ha ganado más peso que fuerza. No es raro en un tramo de crecimiento, y se corrige con trabajo de saltar y caer bien, no con más carga.`,
        evidence: [`${num(a, 2)} → ${num(b, 2)} veces su peso`],
        source: 'ltad',
        todo: cambio < 0 ? 'Multisaltos y caídas controladas, dos veces por semana, en el calentamiento.' : undefined,
      });
    }
  }

  return out;
}

/* ---------------------------------------------------------------------------
 * Velocidad
 * ------------------------------------------------------------------------- */

function auditSprint(tests: FitnessTest[]): Finding[] {
  const out: Finding[] = [];
  const serie = oldestFirst(tests.filter((test) => test.sprint20 || test.topSpeed));
  if (serie.length === 0) return out;

  const last = serie[serie.length - 1];
  const first = serie[0];

  const largo = compare(first, last, 'sprint20');
  if (largo) {
    out.push({
      id: 'sprint-largo',
      area: 'sprint',
      severity: largo.better ? 'bien' : 'dato',
      title: `Los 20 m, de ${num(largo.from, 2)} a ${num(largo.to, 2)} s desde ${first.date}`,
      text: largo.better
        ? `Ha recortado ${num(Math.abs(largo.delta), 2)} segundos en ${Math.round(largo.months)} meses. A esta edad casi toda la mejora viene de correr mejor —zancada, brazos, salida— y de haber crecido, no de tener más músculo.`
        : `Ha ido ${num(Math.abs(largo.delta), 2)} segundos más lento que en la primera prueba.`,
      evidence: [`${first.date}: ${num(largo.from, 2)} s`, `${last.date}: ${num(largo.to, 2)} s`],
      source: 'ypd',
    });
  }

  // El bajón del último tramo, que es lo que más llama la atención en el PDF.
  if (serie.length >= 2) {
    const previo = serie[serie.length - 2];
    const corto = compare(previo, last, 'sprint20');
    if (corto && !corto.better && meaningful('sprint20', corto.percent)) {
      const verano = [6, 7, 8].includes(Number(last.date.slice(5, 7)) - 1);
      out.push({
        id: 'sprint-bajon',
        area: 'sprint',
        severity: 'ojo',
        title: `Respecto a ${previo.date} ha perdido un ${size(corto.percent)} en los 20 m`,
        text: `De ${num(corto.from, 2)} a ${num(corto.to, 2)} s en ${Math.round(corto.months)} meses. El cambio supera el error típico de la prueba (±${TYPICAL_ERROR.sprint20} %), así que probablemente sea real.${
          verano
            ? ' La explicación más sencilla es el calendario: la prueba cae en verano, después de semanas sin competir y sin entrenar a tope. Es lo que le pasa a casi todo el mundo y se recupera en unas semanas de temporada.'
            : ''
        } Lo que no se puede es leerlo como un retroceso de su capacidad sin repetir la medición.`,
        evidence: [
          `${previo.date}: ${num(corto.from, 2)} s`,
          `${last.date}: ${num(corto.to, 2)} s`,
          `error típico de un 20 m: ±${TYPICAL_ERROR.sprint20} %`,
        ],
        todo: 'Volver a medirlo en mitad de temporada antes de sacar ninguna conclusión.',
        source: 'artero',
      });
    }
  }

  const punta = compare(first, last, 'topSpeed');
  if (punta) {
    out.push({
      id: 'punta',
      area: 'sprint',
      severity: punta.better ? 'bien' : 'dato',
      title: `Velocidad punta: ${num(punta.to, 1)} km/h`,
      text: `Desde ${first.date} ha pasado de ${num(punta.from, 1)} a ${num(punta.to, 1)} km/h (${pct(punta.percent)}). La punta es la cifra que menos se mueve con el estado de forma y la que más con el crecimiento: se gana sobre todo alargando la zancada.`,
      evidence: [`${first.date}: ${num(punta.from, 1)} km/h`, `${last.date}: ${num(punta.to, 1)} km/h`],
      source: 'ypd',
    });
  }

  // Qué parte del sprint tiene mejor: arrancar o rodar.
  const tau = tauOf(last);
  if (tau !== null) {
    out.push({
      id: 'perfil-sprint',
      area: 'sprint',
      severity: 'dato',
      title: tau > 1.15 ? 'Le cuesta más arrancar que rodar' : 'Arranca bien',
      text: `Con su tiempo de 20 m (${num(last.sprint20!, 2)} s) y su punta (${num(last.topSpeed!, 1)} km/h), el tiempo que «pierde» acelerando sale de ${num(tau, 2)} s. Cuanto más bajo, mejor sale de parado. ${
        tau > 1.15
          ? 'Con este número, lo que más le renta son las salidas cortas: 5 y 10 metros, saliendo de posiciones distintas, pocas repeticiones y bien descansado.'
          : 'Sale bien de parado; lo que le queda por ganar está en los metros finales, o sea en técnica de carrera.'
      }`,
      evidence: [`20 m: ${num(last.sprint20!, 2)} s`, `punta: ${num(last.topSpeed!, 1)} km/h`, `τ ≈ ${num(tau, 2)} s`],
      source: 'ltad',
      todo: tau > 1.15 ? 'Salidas de 5–10 m al empezar el entreno, cuando aún está fresco.' : undefined,
    });
  }

  return out;
}

/* ---------------------------------------------------------------------------
 * El cruce con el GPS
 * ------------------------------------------------------------------------- */

function auditCross(tests: FitnessTest[], sessions: GpsSession[]): Finding[] {
  const out: Finding[] = [];
  const last = newestFirst(tests.filter((test) => test.topSpeed))[0];
  if (!last?.topSpeed) return out;

  const puntas = sessions
    .map((session) => session.topSpeed)
    .filter((value): value is number => (value ?? 0) > 5)
    .sort((a, b) => b - a);
  if (puntas.length < 3) return out;

  const mejor = puntas[0];
  const tipica = puntas[Math.floor(puntas.length / 2)];
  const ratio = (tipica / last.topSpeed) * 100;

  out.push({
    id: 'cruce-punta',
    area: 'cruce',
    severity: 'dato',
    title: `En partido llega al ${Math.round(ratio)} % de la punta que da en el test`,
    text: `En la pista de pruebas marca ${num(last.topSpeed, 1)} km/h; en sus sesiones con el rastreador, su punta típica es de ${num(tipica, 1)} km/h y la mejor que le consta, ${num(mejor, 1)}. Que en partido no llegue a la punta del test es lo normal —en un campo casi nunca hay veinte metros libres—, pero la distancia entre las dos cifras dice algo: cuanto más se acerque, más está usando lo que tiene. Aviso de método: son dos aparatos distintos y ninguno mide como el otro, así que la comparación vale como tendencia, no como cifra.`,
    evidence: [
      `test: ${num(last.topSpeed, 1)} km/h`,
      `partido, punta típica: ${num(tipica, 1)} km/h`,
      `partido, mejor: ${num(mejor, 1)} km/h`,
      `${puntas.length} sesiones`,
    ],
    source: 'ioc',
  });

  return out;
}

/* ---------------------------------------------------------------------------
 * El método
 * ------------------------------------------------------------------------- */

function auditMethod(tests: FitnessTest[]): Finding[] {
  const out: Finding[] = [];
  const last = newestFirst(tests)[0];
  if (!last) return out;

  if (last.source === 'rx2' && (last.sprint20 || last.topSpeed)) {
    out.push({
      id: 'metodo-1080',
      area: 'metodo',
      severity: 'atencion',
      title: 'El esprint está medido con cable, y eso frena',
      text: 'El 1080 Sprint mide con un cable enganchado al niño. Aunque la resistencia sea mínima, los tiempos salen algo más lentos y la punta algo más baja que con unas fotocélulas o un radar, que es como se midieron los estudios con los que aquí se le compara. O sea: **su percentil real de velocidad es mejor que el que sale en esta pantalla**, y no se sabe cuánto mejor. Sirve para seguirle a él contra él mismo, que es para lo que está.',
      evidence: ['1080 Sprint (cable) contra fotocélulas y radar de los estudios'],
      todo: 'Al comparar con las tablas, quedarse con la tendencia y no con el número.',
      source: 'artero',
    });
  }

  if (tests.length >= 2) {
    const fechas = oldestFirst(tests).map((test) => test.date);
    const huecos = fechas.slice(1).map((fecha, i) => monthsBetween(fechas[i], fecha));
    const mayor = Math.max(...huecos);
    if (mayor > 9) {
      out.push({
        id: 'metodo-hueco',
        area: 'metodo',
        severity: 'dato',
        title: `Entre dos pruebas llegó a haber ${Math.round(mayor)} meses`,
        text: 'Con huecos así, lo que se ve entre una prueba y otra es crecimiento y calendario mezclados, y no se pueden separar. Midiendo dos o tres veces al año —siempre en el mismo momento de temporada— cada cifra empieza a significar algo.',
        evidence: fechas,
        todo: 'Pedir la siguiente en mitad de temporada, para tener un punto comparable con éste.',
        source: 'artero',
      });
    }
  }

  out.push({
    id: 'metodo-una',
    area: 'metodo',
    severity: 'dato',
    title: 'Cada cifra es una medición, no una media',
    text: `El informe da un número por prueba y por fecha. Un salto y un esprint repetidos el mismo día ya se diferencian entre sí (±${TYPICAL_ERROR.jumpHeight} % el salto, ±${TYPICAL_ERROR.sprint20} % el esprint), así que todo lo que en este análisis quede por debajo de ese margen se marca como ruido, venga con flecha verde o roja en el PDF.`,
    source: 'artero',
  });

  out.push({
    id: 'metodo-para-que',
    area: 'metodo',
    severity: 'dato',
    title: 'Para qué sirve esto y para qué no',
    text: 'Ninguna prueba a los ocho o nueve años predice en qué acabará un niño. Lo que sí hace, y es mucho, es enseñar por dónde va su cuerpo, avisar de lo que hay que cuidar y dar algo concreto que mejorar. Ése es el marco del consenso del COI, y es el que se usa aquí de arriba abajo.',
    source: 'ioc',
  });

  return out;
}

/* ---------------------------------------------------------------------------
 * La auditoría entera
 * ------------------------------------------------------------------------- */

export interface Audit {
  /** La prueba sobre la que se ha hecho. */
  last: FitnessTest;
  /** La edad con la que se ha calculado todo. */
  age: number;
  findings: Finding[];
  /** Dónde cae en lo publicado. */
  placements: FitPlacement[];
  /** Los cambios campo a campo entre la primera prueba y la última. */
  changes: Change[];
  /** Cuántas pruebas hay detrás. */
  tests: number;
}

const ORDER: Area[] = ['crecimiento', 'madurez', 'salto', 'sprint', 'cruce', 'metodo'];
const RANK: Record<Severity, number> = { atencion: 0, ojo: 1, bien: 2, dato: 3 };

export function auditOf(tests: FitnessTest[], age: number, sessions: GpsSession[] = []): Audit | null {
  const orden = newestFirst(tests);
  const last = orden[0];
  if (!last) return null;

  const findings = [
    ...auditGrowth(tests, age),
    ...auditMaturity(tests, age),
    ...auditJump(tests),
    ...auditSprint(tests),
    ...auditCross(tests, sessions),
    ...auditMethod(tests),
  ].sort((a, b) => ORDER.indexOf(a.area) - ORDER.indexOf(b.area) || RANK[a.severity] - RANK[b.severity]);

  const primera = oldestFirst(tests)[0];
  const changes = FITNESS_FIELDS.map((field) => compare(primera, last, field.id as FitnessFieldId)).filter(
    (change): change is Change => change !== null,
  );

  return { last, age, findings, placements: placeAll(last, age), changes, tests: tests.length };
}

/** Lo que se lee primero: una frase con lo que hay que saber de esta tanda. */
export function headline(audit: Audit): string {
  const atencion = audit.findings.filter((finding) => finding.severity === 'atencion' && finding.area !== 'metodo');
  const bien = audit.findings.filter((finding) => finding.severity === 'bien');
  if (atencion.length > 0) return atencion[0].title;
  if (bien.length > 0) return bien[0].title;
  return `${audit.tests} pruebas desde ${oldestFirst([audit.last]).length ? audit.last.date : ''}`;
}

/** El nombre de un campo, para las tablas. */
export function fieldLabel(id: FitnessFieldId): string {
  return FIELD_BY_ID.get(id)?.label ?? id;
}

export { formatValue };
