import type { HabitCategory, Metric, MetricGroup, ProfileId } from '@/types';

/* ---------------------------------------------------------------------------
 * Helpers de construcción: mantienen las definiciones legibles y tipadas.
 * ------------------------------------------------------------------------- */

const scaleEmojis = ['😴', '🙁', '😐', '🙂', '🤩'];

function energyScale(id: string, label: string, icon: string): Metric {
  return {
    id,
    label,
    icon,
    type: 'scale',
    min: 1,
    max: 5,
    levels: ['Muy bajo', 'Bajo', 'Normal', 'Alto', 'A tope'],
    emojis: scaleEmojis,
  };
}

/* ---------------------------------------------------------------------------
 * NIÑOS · Leo (8) y Hugo (9)
 * ------------------------------------------------------------------------- */

export const SPORTS: MetricGroup[] = [
  { id: 'futbol', label: 'Fútbol', icon: '⚽', gradient: 'from-emerald-400 to-green-600' },
  { id: 'natacion', label: 'Natación', icon: '🏊', gradient: 'from-cyan-400 to-blue-600' },
  { id: 'marcial', label: 'Arte Marcial', icon: '🥋', gradient: 'from-orange-400 to-red-600' },
  { id: 'gimnasio', label: 'Gimnasio', icon: '🤸', gradient: 'from-violet-400 to-purple-600' },
  { id: 'atletismo', label: 'Atletismo', icon: '🏃', gradient: 'from-amber-400 to-yellow-600' },
];

/**
 * Las marcas de las dos escaleras semanales de Leo y Hugo: la del balón y la
 * de gimnasio, que rota entre flexiones, plancha y comba (`lib/challenges.ts`).
 * Aquí sólo se apunta la mejor marca del día; el peldaño que toca superar lo
 * pone el reto, y sube solo la semana siguiente a conseguirlo.
 *
 * Van con `weight: 0`: son contexto, no cumplimiento. Nadie hace las cuatro
 * pruebas cada día, y un lunes de comba no puede salir suspendido por las tres
 * que ese día no tocaban.
 *
 * Son `duration` y no `counter` aunque cuenten toques o flexiones: el contador
 * de los peques pinta una ficha tocable por unidad, y cuarenta pelotitas en fila
 * no son una casilla. Con el deslizador se apunta «23» de un gesto.
 */
const kidMarkMetrics: Metric[] = [
  {
    id: 'reto.toques',
    label: 'Toques sin que caiga',
    icon: '🤹',
    type: 'duration',
    target: 15,
    min: 0,
    max: 100,
    step: 1,
    unit: 'toques',
    weight: 0,
    help: 'Tu mejor intento del día. El peldaño de esta semana está en Retos.',
  },
  {
    id: 'reto.flexiones',
    label: 'Flexiones seguidas',
    icon: '💪',
    type: 'duration',
    target: 10,
    min: 0,
    max: 60,
    step: 1,
    unit: 'flexiones',
    weight: 0,
    help: 'Seguidas y sin parar. Cuentan las que salen bien.',
  },
  {
    id: 'reto.plancha',
    label: 'Plancha aguantada',
    icon: '🧘',
    type: 'duration',
    target: 30,
    min: 0,
    max: 180,
    step: 5,
    unit: 's',
    weight: 0,
    help: 'Segundos aguantando sin que baje la cadera.',
  },
  {
    id: 'reto.comba',
    label: 'Saltos a la comba seguidos',
    icon: '🨢',
    type: 'duration',
    target: 30,
    min: 0,
    max: 200,
    step: 5,
    unit: 'saltos',
    weight: 0,
    help: 'Seguidos, sin engancharse. Se vuelve a empezar si se para.',
  },
];

/** Cada actividad genera asistencia + esfuerzo + sensaciones. */
function sportMetrics(sport: MetricGroup): Metric[] {
  return [
    {
      id: `sport.${sport.id}.asistencia`,
      label: 'He ido',
      icon: '✅',
      type: 'toggle',
      group: sport.id,
      weight: 2,
    },
    {
      id: `sport.${sport.id}.esfuerzo`,
      label: 'Esfuerzo',
      icon: '🔥',
      type: 'scale',
      min: 1,
      max: 5,
      levels: ['Flojito', 'Poco', 'Normal', 'Fuerte', 'Máximo'],
      emojis: ['🐌', '🚶', '🏃', '💪', '🔥'],
      group: sport.id,
      focus: 'esfuerzo',
    },
    {
      id: `sport.${sport.id}.sensaciones`,
      label: 'Sensaciones',
      icon: '💬',
      type: 'choice',
      group: sport.id,
      options: [
        { value: 'genial', label: 'Genial', icon: '🤩', score: 1 },
        { value: 'bien', label: 'Bien', icon: '🙂', score: 0.8 },
        { value: 'normal', label: 'Normal', icon: '😐', score: 0.55 },
        { value: 'cansado', label: 'Cansado', icon: '😓', score: 0.35 },
        { value: 'molestias', label: 'Molestias', icon: '🤕', score: 0.15 },
      ],
    },
  ];
}

function kidCategories(): HabitCategory[] {
  return [
    {
      id: 'nutricion',
      label: 'Nutrición e Hidratación',
      icon: '🍎',
      description: 'Beber agua y comer de todo, sin complicarse.',
      gradient: 'from-lime-400 to-emerald-500',
      metrics: [
        {
          id: 'agua',
          label: 'Vasos de agua',
          icon: '💧',
          type: 'counter',
          target: 6,
          max: 10,
          step: 1,
          unit: 'vasos',
          pip: '💧',
          weight: 2,
          help: 'Toca los vasos que ya te has bebido.',
        },
        {
          id: 'fruta_verdura',
          label: 'Frutas y verduras',
          icon: '🥕',
          type: 'counter',
          target: 5,
          max: 8,
          step: 1,
          unit: 'raciones',
          pip: '🥕',
          weight: 2,
        },
        { id: 'desayuno', label: 'Desayuno completo', icon: '🥣', type: 'toggle' },
        {
          id: 'proteina',
          label: 'Proteína en cada comida',
          icon: '🥚',
          type: 'toggle',
          weight: 2,
          help: 'Huevo, pescado, carne, legumbre o lácteo: que se vea en el plato.',
        },
        { id: 'plato_sano', label: 'Comida y cena sanas', icon: '🥗', type: 'toggle', weight: 2 },
        {
          id: 'poco_dulce',
          label: 'Poco dulce y sin ultraprocesados',
          icon: '🍭',
          type: 'toggle',
          weight: 2,
        },
      ],
    },
    {
      id: 'sueno',
      label: 'Sueño y Recuperación',
      icon: '😴',
      description: 'Dormir bien para rendir y crecer.',
      gradient: 'from-indigo-400 to-violet-600',
      metrics: [
        {
          id: 'horas_sueno',
          label: 'Horas de sueño',
          icon: '🛏️',
          type: 'duration',
          target: 10,
          min: 5,
          max: 13,
          step: 0.5,
          unit: 'h',
          weight: 2,
        },
        { id: 'hora_cama', label: 'A la cama antes de las 22:00', icon: '⏰', type: 'toggle' },
        {
          id: 'horario_regular',
          label: 'Misma hora de dormir y de despertar',
          icon: '🔁',
          type: 'toggle',
          weight: 2,
          help: 'Fin de semana incluido, con una hora de margen.',
        },
        {
          id: 'sin_pantallas_noche',
          label: 'Sin pantallas antes de dormir',
          icon: '📵',
          type: 'toggle',
          weight: 2,
        },
        {
          id: 'luz_manana',
          label: 'Luz natural al levantarse',
          icon: '🌅',
          type: 'toggle',
          help: 'De camino al cole ya cuenta: 10 minutos fuera, sin cristales.',
        },
        energyScale('energia', 'Nivel de energía al despertar', '⚡'),
      ],
    },
    {
      id: 'deporte',
      label: 'Rendimiento Deportivo',
      icon: '🏅',
      description: 'Tus 5 actividades: asistencia, esfuerzo y sensaciones.',
      gradient: 'from-orange-400 to-pink-600',
      layout: 'sports',
      groups: SPORTS,
      metrics: [
        ...SPORTS.flatMap(sportMetrics),
        // Lo que pide la OMS a esta edad no es entrenar en un club: es moverse
        // una hora al día. Los días sin entrenamiento son los que hay que mirar.
        {
          id: 'actividad_diaria',
          label: 'Movimiento del día',
          icon: '🤾',
          type: 'duration',
          target: 60,
          min: 0,
          max: 240,
          step: 15,
          unit: 'min',
          weight: 2,
          focus: 'esfuerzo',
          help: 'Todo lo que sea moverse: recreo, parque, bici, entrenamiento.',
        },
        ...kidMarkMetrics,
      ],
    },
    {
      id: 'cognitivo',
      label: 'Cognitivo / Académico',
      icon: '🧠',
      description: 'Lo que haces en casa (el cole diario no cuenta aquí).',
      gradient: 'from-cyan-400 to-sky-600',
      metrics: [
        {
          id: 'epoca_examenes',
          label: 'Época de exámenes',
          icon: '📅',
          type: 'toggle',
          weight: 0,
          help: 'Actívalo durante las semanas de exámenes.',
        },
        {
          id: 'repaso_examen',
          label: 'Repaso de examen',
          icon: '📝',
          type: 'duration',
          target: 30,
          min: 0,
          max: 120,
          step: 5,
          unit: 'min',
          focus: 'aprendizaje',
        },
        {
          id: 'lectura',
          label: 'Lectura en casa',
          icon: '📖',
          type: 'duration',
          target: 20,
          min: 0,
          max: 120,
          step: 5,
          unit: 'min',
          weight: 2,
          focus: 'aprendizaje',
        },
        {
          id: 'escritura',
          label: 'Ejercicios de escritura',
          icon: '✍️',
          type: 'counter',
          target: 2,
          max: 6,
          step: 1,
          unit: 'ejercicios',
          pip: '✏️',
          focus: 'aprendizaje',
        },
        // Aquí la meta es un techo: cumplir es quedarse por debajo.
        {
          id: 'pantallas_ocio',
          label: 'Pantallas de ocio',
          icon: '📱',
          type: 'duration',
          target: 120,
          min: 0,
          max: 360,
          step: 15,
          unit: 'min',
          direction: 'atMost',
          weight: 2,
          help: 'Tele, tablet, consola y móvil de ocio. Los deberes no cuentan.',
        },
      ],
    },
  ];
}

/* ---------------------------------------------------------------------------
 * ADULTOS
 *
 *  Sueño, nutrición y movimiento van en tres tarjetas y no en una sola de
 *  «Salud y Bienestar»: son los tres bloques que los expertos tratan por
 *  separado —y con cifras propias—, y metidos en la misma lista se leían como
 *  un cajón de sastre de catorce casillas. La de sueño conserva el
 *  identificador `salud` para no dejar huérfanas las notas ya escritas.
 * ------------------------------------------------------------------------- */

/** Sueño y descanso: lo mismo para los dos, salvo lo que se pase en `extra`. */
function adultSleepCategory(extra: Metric[] = []): HabitCategory {
  return {
    id: 'salud',
    label: 'Sueño y Descanso',
    icon: '🌙',
    description: 'Horas, regularidad y lo que las protege.',
    gradient: 'from-indigo-400 to-violet-600',
    metrics: [
      {
        id: 'horas_sueno',
        label: 'Horas de sueño',
        icon: '🛏️',
        type: 'duration',
        target: 7.5,
        min: 4,
        max: 11,
        step: 0.25,
        unit: 'h',
        weight: 2,
      },
      {
        id: 'horario_regular',
        label: 'Misma hora de dormir y de despertar',
        icon: '🔁',
        type: 'toggle',
        weight: 2,
        help: 'Fin de semana incluido, con una hora de margen.',
      },
      energyScale('calidad_descanso', 'Calidad del descanso', '🌙'),
      ...extra,
      {
        id: 'luz_manana',
        label: 'Luz natural al levantarse',
        icon: '🌅',
        type: 'toggle',
        help: '10 minutos en la calle, sin cristales de por medio.',
      },
      {
        id: 'sin_cafeina_tarde',
        label: 'Sin cafeína después de las 15:00',
        icon: '☕',
        type: 'toggle',
      },
      { id: 'sin_alcohol', label: 'Día sin alcohol', icon: '🚫', type: 'toggle' },
      {
        id: 'sin_pantallas_noche',
        label: 'Sin pantallas la última hora',
        icon: '📵',
        type: 'toggle',
        weight: 2,
      },
      { id: 'pausa_consciente', label: 'Pausa consciente / respiración', icon: '🧘', type: 'toggle' },
    ],
  };
}

/** Nutrición e hidratación: sólo cambia cuánta agua toca. */
function adultNutritionCategory(water: { target: number; max: number }): HabitCategory {
  return {
    id: 'nutricion',
    label: 'Nutrición e Hidratación',
    icon: '🥗',
    description: 'Plato, proteína, agua y el horario de las comidas.',
    gradient: 'from-lime-400 to-emerald-600',
    metrics: [
      {
        id: 'agua',
        label: 'Hidratación',
        icon: '💧',
        type: 'counter',
        target: water.target,
        max: water.max,
        step: 1,
        unit: 'vasos',
        pip: '💧',
      },
      {
        id: 'comidas',
        label: 'Comidas equilibradas',
        icon: '🍽️',
        type: 'counter',
        target: 3,
        max: 5,
        step: 1,
        unit: 'comidas',
        pip: '🍽️',
      },
      {
        id: 'proteina',
        label: 'Proteína en cada comida',
        icon: '🥚',
        type: 'toggle',
        weight: 2,
        help: 'Objetivo de referencia: unos 1,6 g por kilo al día, repartidos.',
      },
      {
        id: 'plato_sano',
        label: 'Medio plato de verdura',
        icon: '🥦',
        type: 'toggle',
        weight: 2,
        help: 'Plato de Harvard: mitad verdura, un cuarto proteína, un cuarto hidrato entero.',
      },
      {
        id: 'poco_dulce',
        label: 'Sin ultraprocesados ni dulce',
        icon: '🍭',
        type: 'toggle',
        weight: 2,
      },
      {
        id: 'cena_temprana',
        label: 'Cena 3 h antes de dormir, sin picoteo después',
        icon: '🌇',
        type: 'toggle',
      },
    ],
  };
}

/**
 * Movimiento y fuerza: `main` es el entrenamiento propio de cada uno.
 *
 * Con `weeklyStrength` el entreno baja de peso 2 a peso 1. Es lo que necesita
 * quien entrena por reparto semanal —Víctor reparte cinco sesiones entre siete
 * días—: con el peso de fondo, los dos días de descanso que el propio reparto
 * exige salían casi suspendidos por no haber entrenado. Sigue contando, porque
 * sigue siendo lo importante del día que toca, pero ya no manda sobre la nota:
 * de eso se encargan los cinco retos fijos de la semana. El peso se queda por
 * encima de cero a propósito, que es lo que mantiene estas casillas retables.
 */
function adultMovementCategory(
  main: Metric,
  extra: Metric[] = [],
  weeklyStrength = false,
): HabitCategory {
  return {
    id: 'movimiento_fuerza',
    label: 'Movimiento y Fuerza',
    icon: '🏋️',
    description: 'Lo que se entrena y lo que se mueve el resto del día.',
    gradient: 'from-amber-400 to-orange-600',
    metrics: [
      main,
      {
        id: 'fuerza',
        label: 'Entrenamiento de fuerza',
        icon: '💪',
        type: 'toggle',
        weight: weeklyStrength ? 1 : 2,
        help: weeklyStrength
          ? 'Se marca el día que toca sesión: el reparto va por semanas, no por días.'
          : 'Mínimo dos días por semana, con o sin material.',
      },
      {
        id: 'pasos',
        label: 'Pasos del día',
        icon: '👟',
        type: 'counter',
        target: 8000,
        max: 16000,
        step: 500,
        unit: 'pasos',
        weight: 2,
        focus: 'esfuerzo',
      },
      ...extra,
    ],
  };
}

const mariaCategories: HabitCategory[] = [
  adultSleepCategory(),
  adultNutritionCategory({ target: 8, max: 12 }),
  adultMovementCategory({
    id: 'movimiento',
    label: 'Actividad física',
    icon: '🚴',
    type: 'duration',
    target: 30,
    min: 0,
    max: 120,
    step: 5,
    unit: 'min',
    weight: 2,
    focus: 'esfuerzo',
  }),
  {
    id: 'desarrollo',
    label: 'Desarrollo Personal',
    icon: '✨',
    description: 'Lectura y escritura como práctica diaria.',
    gradient: 'from-fuchsia-400 to-purple-600',
    metrics: [
      {
        id: 'lectura',
        label: 'Lectura',
        icon: '📖',
        type: 'duration',
        target: 30,
        min: 0,
        max: 180,
        step: 5,
        unit: 'min',
        weight: 2,
        focus: 'aprendizaje',
      },
      {
        id: 'escritura',
        label: 'Escritura',
        icon: '✍️',
        type: 'duration',
        target: 20,
        min: 0,
        max: 180,
        step: 5,
        unit: 'min',
        weight: 2,
        focus: 'aprendizaje',
      },
      { id: 'diario', label: 'Entrada de diario', icon: '📔', type: 'toggle' },
      {
        id: 'pantallas_ocio',
        label: 'Pantallas de ocio',
        icon: '📱',
        type: 'duration',
        target: 120,
        min: 0,
        max: 360,
        step: 15,
        unit: 'min',
        direction: 'atMost',
        help: 'Redes, series y móvil de ocio. El trabajo no cuenta.',
      },
    ],
  },
  {
    id: 'profesional',
    label: 'Profesional · Clases de español online',
    icon: '💻',
    description: 'Rutinas ligadas a la docencia y al aula digital.',
    gradient: 'from-rose-400 to-orange-500',
    metrics: [
      {
        id: 'prep_clases',
        label: 'Preparación de clases',
        icon: '🗂️',
        type: 'duration',
        target: 45,
        min: 0,
        max: 240,
        step: 15,
        unit: 'min',
        weight: 2,
        focus: 'aprendizaje',
      },
      {
        id: 'clases_impartidas',
        label: 'Clases impartidas',
        icon: '🎧',
        type: 'counter',
        target: 4,
        max: 10,
        step: 1,
        unit: 'clases',
        pip: '🎓',
        weight: 2,
      },
      { id: 'correccion', label: 'Corrección de tareas', icon: '✅', type: 'toggle' },
      { id: 'feedback_alumnos', label: 'Feedback a alumnos', icon: '💬', type: 'toggle' },
      { id: 'material', label: 'Material didáctico creado', icon: '🧩', type: 'toggle' },
      { id: 'cuidado_voz', label: 'Cuidado de la voz y pausas', icon: '🗣️', type: 'toggle' },
      { id: 'captacion', label: 'Captación / redes / marketing', icon: '📣', type: 'toggle' },
      { id: 'cierre_jornada', label: 'Cierre de jornada y desconexión', icon: '🔕', type: 'toggle' },
      energyScale('energia_aula', 'Energía en clase', '⚡'),
    ],
  },
];

/**
 * El reparto semanal de Víctor: cinco sesiones que se reparten los siete días
 * —pierna, pecho, dorsal, series de carrera y core—. Cada una se marca el día
 * que toca, y de ahí se rellenan solos los cinco retos fijos de su semana
 * (`lib/challenges.ts`), que es justo para lo que existen estas casillas.
 */
export const VICTOR_SPLIT: Array<{
  /** Sufijo del identificador de la métrica y del reto: pierna, pecho… */
  id: string;
  label: string;
  icon: string;
  help: string;
  /** Por qué esa sesión está en la semana; lo cuenta la tarjeta del reto. */
  why: string;
}> = [
  {
    id: 'pierna',
    label: 'Pierna',
    icon: '🦵',
    help: 'Sentadilla, peso muerto, zancadas: la sesión de tren inferior de la semana.',
    why: 'El tren inferior sostiene todo lo demás: rodilla, cadera y espalda aguantan lo que la pierna sea capaz de aguantar.',
  },
  {
    id: 'pecho',
    label: 'Pecho',
    icon: '🏋️',
    help: 'Press de banca, fondos, empujes: la sesión de empuje de la semana.',
    why: 'Empujar es la mitad del trabajo de tren superior, y la que primero se abandona cuando la semana aprieta.',
  },
  {
    id: 'dorsal',
    label: 'Dorsal',
    icon: '🧗',
    help: 'Dominadas, remo, jalón: la sesión de tirón de la semana.',
    why: 'Tirar compensa lo que se empuja y endereza la postura que dejan las horas de vídeo y de banquillo.',
  },
  {
    id: 'series',
    label: 'Series de carrera',
    icon: '🏃',
    help: 'Series, cuestas o cambios de ritmo. El rodaje suave no cuenta aquí.',
    why: 'Las series dan el estímulo que no da el trote: obligan al pulso a subir y a bajar, que es donde se gana el fondo.',
  },
  {
    id: 'core',
    label: 'Core',
    icon: '🌀',
    help: 'Plancha, antirrotación, lumbares: diez minutos bien hechos valen.',
    why: 'El core es la bisagra entre lo que empuja y lo que corre: sin él, la espalda acaba pagando por las dos cosas.',
  },
];

/**
 * Las cinco casillas del reparto, tal y como se marcan en Movimiento y Fuerza.
 *
 * Van con `weight: 0` a propósito: son contexto, no cumplimiento. Si contaran,
 * un martes de pierna saldría suspendido por las cuatro sesiones que ese día no
 * tocaban, que es justo lo contrario de lo que hay que medir. El generador de
 * retos sí las lee: no necesita el peso para saber qué día se entrenó.
 */
const victorSplitMetrics: Metric[] = VICTOR_SPLIT.map(({ id, label, icon, help }) => ({
  id: `split.${id}`,
  label,
  icon,
  type: 'toggle',
  weight: 0,
  help,
}));

const victorCategories: HabitCategory[] = [
  adultSleepCategory([
    {
      id: 'descanso',
      label: 'Descanso / siesta',
      icon: '🌤️',
      type: 'duration',
      target: 20,
      min: 0,
      max: 90,
      step: 5,
      unit: 'min',
      help: 'Corta y antes de las 15:00; pasada la media hora se despierta peor.',
    },
  ]),
  adultNutritionCategory({ target: 10, max: 14 }),
  // El entreno de Víctor va con `weight: 1` en vez de 2, porque su semana la
  // manda el reparto: cinco sesiones repartidas entre siete días. Los dos que
  // sobran son descanso decidido, no un hábito incumplido, y con el peso de
  // fondo le hundían la nota. Resta, pero poco: quien de verdad juzga el entreno
  // son los cinco retos fijos. Y al no ser cero, la casilla sigue siendo retable.
  adultMovementCategory(
    {
      id: 'entreno_propio',
      label: 'Entrenamiento propio',
      icon: '🏋️',
      type: 'duration',
      target: 45,
      min: 0,
      max: 150,
      step: 5,
      unit: 'min',
      weight: 1,
      focus: 'esfuerzo',
      help: 'Minutos de la sesión que toque hoy. El reparto va por semanas: un día de descanso apenas resta.',
    },
    [
      { id: 'movilidad', label: 'Movilidad y prevención', icon: '🤸', type: 'toggle' },
      ...victorSplitMetrics,
    ],
    true,
  ),
  {
    id: 'desarrollo',
    label: 'Desarrollo Personal',
    icon: '✨',
    description: 'Lectura y escritura como práctica diaria.',
    gradient: 'from-sky-400 to-indigo-600',
    metrics: [
      {
        id: 'lectura',
        label: 'Lectura',
        icon: '📖',
        type: 'duration',
        target: 30,
        min: 0,
        max: 180,
        step: 5,
        unit: 'min',
        weight: 2,
        focus: 'aprendizaje',
      },
      {
        id: 'escritura',
        label: 'Escritura',
        icon: '✍️',
        type: 'duration',
        target: 20,
        min: 0,
        max: 180,
        step: 5,
        unit: 'min',
        weight: 2,
        focus: 'aprendizaje',
      },
      { id: 'diario', label: 'Diario de reflexión', icon: '📔', type: 'toggle' },
      {
        id: 'pantallas_ocio',
        label: 'Pantallas de ocio',
        icon: '📱',
        type: 'duration',
        target: 120,
        min: 0,
        max: 360,
        step: 15,
        unit: 'min',
        direction: 'atMost',
        help: 'Redes, series y móvil de ocio. El vídeo de trabajo no cuenta.',
      },
    ],
  },
  {
    id: 'profesional',
    label: 'Profesional · Cuerpo técnico',
    icon: '📋',
    description: 'Preparación, análisis, gestión de plantilla y alto rendimiento.',
    gradient: 'from-amber-400 to-red-500',
    metrics: [
      {
        id: 'prep_sesion',
        label: 'Preparación de la sesión de entrenamiento',
        icon: '📐',
        type: 'duration',
        target: 60,
        min: 0,
        max: 240,
        step: 15,
        unit: 'min',
        weight: 2,
        focus: 'aprendizaje',
      },
      {
        id: 'analisis_tactico',
        label: 'Análisis táctico / vídeo',
        icon: '🎬',
        type: 'duration',
        target: 60,
        min: 0,
        max: 300,
        step: 15,
        unit: 'min',
        weight: 2,
        focus: 'aprendizaje',
      },
      { id: 'scouting', label: 'Scouting del rival', icon: '🔍', type: 'toggle' },
      { id: 'reunion_cuerpo', label: 'Reunión con cuerpo técnico', icon: '🤝', type: 'toggle' },
      {
        id: 'charlas_jugadores',
        label: 'Charlas individuales con jugadores',
        icon: '🗣️',
        type: 'counter',
        target: 2,
        max: 8,
        step: 1,
        unit: 'charlas',
        pip: '👤',
      },
      { id: 'control_cargas', label: 'Control de cargas / datos GPS', icon: '📈', type: 'toggle' },
      { id: 'feedback_sesion', label: 'Feedback post-sesión', icon: '📝', type: 'toggle' },
      { id: 'desconexion', label: 'Desconexión al llegar a casa', icon: '🔕', type: 'toggle' },
      energyScale('liderazgo', 'Gestión emocional y liderazgo', '🧭'),
    ],
  },
];

/* ---------------------------------------------------------------------------
 * MÓDULOS COMPARTIDOS
 * ------------------------------------------------------------------------- */

const familiaCategories: HabitCategory[] = [
  {
    id: 'rutinas',
    label: 'Rutinas en Familia',
    icon: '🗓️',
    description: 'Lo que sostiene la semana entre los cuatro.',
    gradient: 'from-orange-400 to-rose-500',
    metrics: [
      {
        id: 'comidas_familia',
        label: 'Comidas en familia sin pantallas',
        icon: '🍽️',
        type: 'counter',
        target: 2,
        max: 3,
        step: 1,
        unit: 'comidas',
        pip: '🍽️',
        weight: 2,
      },
      {
        id: 'rutina_sueno',
        label: 'Rutina de acostarse de los peques',
        icon: '🌜',
        type: 'toggle',
        weight: 2,
        help: 'La misma secuencia todas las noches: cena, ducha, cuento, luz fuera.',
      },
      {
        id: 'rutina_finde',
        label: 'Rutina de fin de semana cumplida',
        icon: '🌞',
        type: 'toggle',
        weight: 2,
      },
      { id: 'tareas_hogar', label: 'Tareas del hogar compartidas', icon: '🧹', type: 'toggle' },
      { id: 'consejo_familia', label: 'Consejo de familia / planificación', icon: '🗣️', type: 'toggle' },
    ],
  },
  {
    id: 'tiempo_juntos',
    label: 'Tiempo Juntos',
    icon: '🧩',
    description: 'Juego, aire libre y momentos compartidos.',
    gradient: 'from-yellow-400 to-amber-600',
    metrics: [
      {
        id: 'tiempo_juego',
        label: 'Tiempo de juego juntos',
        icon: '🎲',
        type: 'duration',
        target: 45,
        min: 0,
        max: 240,
        step: 15,
        unit: 'min',
        weight: 2,
        focus: 'esfuerzo',
      },
      { id: 'aire_libre', label: 'Salida al aire libre', icon: '🌳', type: 'toggle' },
      { id: 'lectura_conjunta', label: 'Lectura o peli en familia', icon: '📚', type: 'toggle' },
      {
        id: 'refuerzo_esfuerzo',
        label: 'Reconocer el esfuerzo, no el resultado',
        icon: '🌱',
        type: 'toggle',
        help: '«Has entrenado bien toda la semana» construye; «qué crack eres» no.',
      },
      {
        id: 'animo_familia',
        label: 'Ambiente en casa',
        icon: '💛',
        type: 'choice',
        options: [
          { value: 'genial', label: 'Genial', icon: '🥳', score: 1 },
          { value: 'bueno', label: 'Bueno', icon: '😊', score: 0.8 },
          { value: 'normal', label: 'Normal', icon: '😐', score: 0.55 },
          { value: 'tenso', label: 'Tenso', icon: '😕', score: 0.3 },
        ],
      },
    ],
  },
];

const parejaCategories: HabitCategory[] = [
  {
    id: 'tiempo_solas',
    label: 'Tiempo a Solas',
    icon: '🕯️',
    description: 'Espacio propio de María y Víctor.',
    gradient: 'from-rose-400 to-pink-600',
    metrics: [
      {
        id: 'tiempo_pareja',
        label: 'Tiempo juntos sin pantallas',
        icon: '⏳',
        type: 'duration',
        target: 30,
        min: 0,
        max: 240,
        step: 10,
        unit: 'min',
        weight: 2,
        focus: 'esfuerzo',
      },
      { id: 'cita', label: 'Cita o plan a solas', icon: '🍷', type: 'toggle' },
      { id: 'paseo', label: 'Paseo juntos', icon: '🌆', type: 'toggle' },
    ],
  },
  {
    id: 'conexion',
    label: 'Conexión y Rutinas',
    icon: '💞',
    description: 'Los pequeños gestos que sostienen la pareja.',
    gradient: 'from-purple-400 to-rose-600',
    metrics: [
      { id: 'check_in', label: 'Check-in del día (10 min)', icon: '💬', type: 'toggle', weight: 2 },
      { id: 'gratitud', label: 'Gesto de agradecimiento', icon: '🙏', type: 'toggle', weight: 2 },
      {
        id: 'reparacion',
        label: 'Roce reparado el mismo día',
        icon: '🩹',
        type: 'toggle',
        weight: 2,
        help: 'Si no ha habido roce, marca «Sí»: el día queda limpio igualmente.',
      },
      { id: 'planificacion', label: 'Planificación de la semana juntos', icon: '📆', type: 'toggle' },
      {
        id: 'sintonia',
        label: 'Sintonía de pareja',
        icon: '❤️',
        type: 'scale',
        min: 1,
        max: 5,
        levels: ['Distantes', 'Flojo', 'Normal', 'Bien', 'En sintonía'],
        emojis: ['🌧️', '🌥️', '⛅', '🌤️', '☀️'],
      },
    ],
  },
];

/* ---------------------------------------------------------------------------
 * Registro central por perfil
 * ------------------------------------------------------------------------- */

export const HABITS: Record<ProfileId, HabitCategory[]> = {
  leo: kidCategories(),
  hugo: kidCategories(),
  maria: mariaCategories,
  victor: victorCategories,
  familia: familiaCategories,
  pareja: parejaCategories,
};

export function getCategories(profileId: ProfileId): HabitCategory[] {
  return HABITS[profileId] ?? [];
}

export function getMetrics(profileId: ProfileId): Metric[] {
  return getCategories(profileId).flatMap((c) => c.metrics);
}

export function findMetric(profileId: ProfileId, metricId: string): Metric | undefined {
  return getMetrics(profileId).find((m) => m.id === metricId);
}
