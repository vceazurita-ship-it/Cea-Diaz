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
        { id: 'plato_sano', label: 'Comida y cena sanas', icon: '🥗', type: 'toggle' },
        {
          id: 'poco_dulce',
          label: 'Poco dulce y sin ultraprocesados',
          icon: '🍭',
          type: 'toggle',
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
          id: 'sin_pantallas_noche',
          label: 'Sin pantallas antes de dormir',
          icon: '📵',
          type: 'toggle',
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
      metrics: SPORTS.flatMap(sportMetrics),
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
      ],
    },
  ];
}

/* ---------------------------------------------------------------------------
 * ADULTOS
 * ------------------------------------------------------------------------- */

const mariaCategories: HabitCategory[] = [
  {
    id: 'salud',
    label: 'Salud y Bienestar',
    icon: '🌿',
    description: 'Sueño, descanso, nutrición e hidratación.',
    gradient: 'from-emerald-400 to-teal-600',
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
      energyScale('calidad_descanso', 'Calidad del descanso', '🌙'),
      {
        id: 'agua',
        label: 'Hidratación',
        icon: '💧',
        type: 'counter',
        target: 8,
        max: 12,
        step: 1,
        unit: 'vasos',
        pip: '💧',
      },
      {
        id: 'comidas',
        label: 'Comidas equilibradas',
        icon: '🥗',
        type: 'counter',
        target: 3,
        max: 5,
        step: 1,
        unit: 'comidas',
        pip: '🍽️',
      },
      {
        id: 'movimiento',
        label: 'Actividad física',
        icon: '🚴',
        type: 'duration',
        target: 30,
        min: 0,
        max: 120,
        step: 5,
        unit: 'min',
        focus: 'esfuerzo',
      },
      { id: 'pausa_consciente', label: 'Pausa consciente / respiración', icon: '🧘', type: 'toggle' },
    ],
  },
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

const victorCategories: HabitCategory[] = [
  {
    id: 'salud',
    label: 'Salud y Bienestar',
    icon: '🌿',
    description: 'Sueño, descanso, nutrición e hidratación.',
    gradient: 'from-emerald-400 to-teal-600',
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
        id: 'descanso',
        label: 'Descanso / siesta',
        icon: '🌤️',
        type: 'duration',
        target: 20,
        min: 0,
        max: 90,
        step: 5,
        unit: 'min',
      },
      energyScale('calidad_descanso', 'Calidad del descanso', '🌙'),
      {
        id: 'agua',
        label: 'Hidratación',
        icon: '💧',
        type: 'counter',
        target: 10,
        max: 14,
        step: 1,
        unit: 'vasos',
        pip: '💧',
      },
      {
        id: 'comidas',
        label: 'Comidas equilibradas',
        icon: '🥗',
        type: 'counter',
        target: 3,
        max: 5,
        step: 1,
        unit: 'comidas',
        pip: '🍽️',
      },
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
        focus: 'esfuerzo',
      },
      { id: 'movilidad', label: 'Movilidad y prevención', icon: '🤸', type: 'toggle' },
    ],
  },
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
      { id: 'gratitud', label: 'Gesto de agradecimiento', icon: '🙏', type: 'toggle' },
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
