import { getCategories } from '@/lib/habits';
import { metricRatio } from '@/lib/scoring';
import type {
  AttentionItem,
  Expert,
  HabitGuidance,
  HabitPriority,
  Metric,
  MetricValue,
  ProfileId,
} from '@/types';

/* =========================================================================
 *  El porqué de cada hábito.
 *
 *  El catálogo de `lib/habits.ts` dice QUÉ se registra; esto dice POR QUÉ y
 *  CON QUÉ CIFRA, y quién lo sostiene. Van separados a propósito: la interfaz
 *  cambia por motivos de interfaz, y el criterio cambia cuando cambia lo que
 *  se sabe.
 *
 *  Regla de la casa al citar: se distingue lo que es consenso de organismos y
 *  revisiones de lo que es la tesis de un divulgador, y de lo que viene de
 *  alguien cuyo marco general no está respaldado. Los tres se pueden leer;
 *  sólo el primero se presenta como hecho.
 * ========================================================================= */

export const EXPERTS: Record<string, Expert> = {
  /* --------------------------------------------------- organismos */
  oms: {
    id: 'oms',
    name: 'OMS',
    role: 'Organización Mundial de la Salud',
    field: 'Actividad física, sueño, azúcar',
    level: 'consenso',
  },
  aap: {
    id: 'aap',
    name: 'AAP',
    role: 'Academia Americana de Pediatría',
    field: 'Sueño y pantallas en la infancia',
    level: 'consenso',
  },

  /* ------------------------------------------------ internacional */
  walker: {
    id: 'walker',
    name: 'Matthew Walker',
    role: 'Neurocientífico del sueño (Berkeley), «Por qué dormimos»',
    field: 'Sueño',
    level: 'divulgacion',
  },
  huberman: {
    id: 'huberman',
    name: 'Andrew Huberman',
    role: 'Neurobiólogo (Stanford), «Huberman Lab»',
    field: 'Ritmo circadiano, luz, cafeína',
    level: 'divulgacion',
  },
  attia: {
    id: 'attia',
    name: 'Peter Attia',
    role: 'Médico de longevidad, «Outlive»',
    field: 'Fuerza, capacidad aeróbica, proteína',
    level: 'divulgacion',
  },
  willett: {
    id: 'willett',
    name: 'Walter Willett',
    role: 'Epidemiólogo de la nutrición (Harvard), «Plato de Harvard»',
    field: 'Composición de las comidas',
    level: 'consenso',
  },
  spector: {
    id: 'spector',
    name: 'Tim Spector',
    role: 'Epidemiólogo (King’s College), «Zoe»',
    field: 'Microbiota, variedad vegetal, ultraprocesados',
    level: 'divulgacion',
  },
  clear: {
    id: 'clear',
    name: 'James Clear',
    role: 'Autor de «Hábitos atómicos»',
    field: 'Diseño de hábitos',
    level: 'divulgacion',
  },
  fogg: {
    id: 'fogg',
    name: 'BJ Fogg',
    role: 'Investigador de conducta (Stanford), «Hábitos mínimos»',
    field: 'Diseño de hábitos',
    level: 'divulgacion',
  },
  dweck: {
    id: 'dweck',
    name: 'Carol Dweck',
    role: 'Psicóloga (Stanford), mentalidad de crecimiento',
    field: 'Motivación y elogio',
    level: 'divulgacion',
  },
  gottman: {
    id: 'gottman',
    name: 'John Gottman',
    role: 'Investigador de parejas (Universidad de Washington)',
    field: 'Convivencia y conflicto',
    level: 'divulgacion',
  },
  newport: {
    id: 'newport',
    name: 'Cal Newport',
    role: 'Informático (Georgetown), «Deep Work»',
    field: 'Trabajo profundo y concentración',
    level: 'divulgacion',
  },
  ericsson: {
    id: 'ericsson',
    name: 'K. Anders Ericsson',
    role: 'Psicólogo, práctica deliberada',
    field: 'Mejora técnica y feedback',
    level: 'divulgacion',
  },
  sonnentag: {
    id: 'sonnentag',
    name: 'Sabine Sonnentag',
    role: 'Psicóloga del trabajo (Mannheim), desconexión psicológica',
    field: 'Recuperación tras la jornada',
    level: 'consenso',
  },

  /* ------------------------------- crianza y familia */
  baumrind: {
    id: 'baumrind',
    name: 'Diana Baumrind',
    role: 'Psicóloga del desarrollo (Berkeley), estilos parentales',
    field: 'Autoridad, límites y afecto',
    level: 'consenso',
  },
  siegel: {
    id: 'siegel',
    name: 'Daniel Siegel',
    role: 'Psiquiatra (UCLA), «El cerebro del niño»',
    field: 'Emoción, conexión y desarrollo cerebral',
    level: 'divulgacion',
  },
  kazdin: {
    id: 'kazdin',
    name: 'Alan Kazdin',
    role: 'Psicólogo (Yale), Yale Parenting Center',
    field: 'Refuerzo positivo y cambio de conducta',
    level: 'consenso',
  },
  greene: {
    id: 'greene',
    name: 'Ross Greene',
    role: 'Psicólogo clínico, «El niño explosivo»',
    field: 'Conflicto y resolución colaborativa',
    level: 'divulgacion',
  },
  faber: {
    id: 'faber',
    name: 'Faber y Mazlish',
    role: 'Autoras de «Cómo hablar para que los niños escuchen»',
    field: 'Escucha y lenguaje con los hijos',
    level: 'divulgacion',
  },
  steinberg: {
    id: 'steinberg',
    name: 'Laurence Steinberg',
    role: 'Psicólogo (Temple), adolescencia',
    field: 'Autonomía y supervisión según la edad',
    level: 'divulgacion',
  },
  unicef: {
    id: 'unicef',
    name: 'UNICEF',
    role: 'Fondo de la ONU para la Infancia',
    field: 'Crianza positiva y disciplina sin violencia',
    level: 'consenso',
  },

  /* ---------------------------------------------- pareja */
  johnson: {
    id: 'johnson',
    name: 'Sue Johnson',
    role: 'Psicóloga, terapia focalizada en la emoción (EFT), «Abrázame fuerte»',
    field: 'Apego adulto y reconexión',
    level: 'consenso',
  },
  markman: {
    id: 'markman',
    name: 'Howard Markman',
    role: 'Psicólogo (Universidad de Denver), programa PREP',
    field: 'Prevención del conflicto de pareja',
    level: 'consenso',
  },
  perel: {
    id: 'perel',
    name: 'Esther Perel',
    role: 'Psicoterapeuta de pareja, «Inteligencia erótica»',
    field: 'Deseo, distancia y vida propia',
    level: 'divulgacion',
  },
  finkel: {
    id: 'finkel',
    name: 'Eli Finkel',
    role: 'Psicólogo social (Northwestern), «The All-or-Nothing Marriage»',
    field: 'Expectativas y tiempo dedicado',
    level: 'divulgacion',
  },
  aron: {
    id: 'aron',
    name: 'Arthur Aron',
    role: 'Psicólogo social (Stony Brook), auto-expansión',
    field: 'Novedad compartida y cercanía',
    level: 'divulgacion',
  },

  /* ------------------------------------------------ habla hispana */
  marcos: {
    id: 'marcos',
    name: 'Marcos Vázquez',
    role: '«Fitness Revolucionario»',
    field: 'Fuerza, movimiento diario, comida real',
    level: 'divulgacion',
  },
  endika: {
    id: 'endika',
    name: 'Endika Montiel',
    role: 'Entrenador y divulgador de entrenamiento y nutrición',
    field: 'Constancia, fuerza y proteína',
    level: 'divulgacion',
  },
  rios: {
    id: 'rios',
    name: 'Carlos Ríos',
    role: 'Dietista-nutricionista, «Realfooding»',
    field: 'Ultraprocesados y comida real',
    level: 'divulgacion',
  },
  basulto: {
    id: 'basulto',
    name: 'Julio Basulto',
    role: 'Dietista-nutricionista, nutrición infantil',
    field: 'Alimentación de niños y familias',
    level: 'divulgacion',
  },
  bilbao: {
    id: 'bilbao',
    name: 'Álvaro Bilbao',
    role: 'Neuropsicólogo, «El cerebro del niño explicado a los padres»',
    field: 'Desarrollo infantil, límites y juego',
    level: 'divulgacion',
  },
  guerrero: {
    id: 'guerrero',
    name: 'Rafa Guerrero',
    role: 'Psicólogo, «Educar en el vínculo»',
    field: 'Apego y regulación emocional',
    level: 'divulgacion',
  },
  tirado: {
    id: 'tirado',
    name: 'Míriam Tirado',
    role: 'Divulgadora de crianza consciente, «Límites»',
    field: 'Presencia, límites y rutinas',
    level: 'divulgacion',
  },
  alava: {
    id: 'alava',
    name: 'Silvia Álava',
    role: 'Psicóloga infantil, «El arte de educar jugando»',
    field: 'Autonomía, juego y conducta',
    level: 'divulgacion',
  },
  bolinches: {
    id: 'bolinches',
    name: 'Antoni Bolinches',
    role: 'Psicólogo y sexólogo, terapia de pareja, «El secreto de la autoestima»',
    field: 'Madurez personal y convivencia en pareja',
    level: 'divulgacion',
  },
  congost: {
    id: 'congost',
    name: 'Silvia Congost',
    role: 'Psicóloga, «Cuando amar demasiado es depender»',
    field: 'Autoestima y dependencia emocional',
    level: 'divulgacion',
  },
  garriga: {
    id: 'garriga',
    name: 'Joan Garriga',
    role: 'Psicólogo gestáltico, «El buen amor en la pareja»',
    field: 'Vínculo, aceptación y reparto de lugares',
    level: 'divulgacion',
  },
  frank: {
    id: 'frank',
    name: 'Frank Suárez',
    role: '«Metabolismo TV»',
    field: 'Hidratación, azúcares y harinas refinadas',
    level: 'discutido',
    caveat:
      'Se le cita sólo en lo que coincide con el resto: beber más agua y bajar ' +
      'azúcar y harina refinada. Su clasificación del sistema nervioso en ' +
      '«excitado» y «pasivo» y su reparto de alimentos en tipo A y tipo E no ' +
      'están respaldados por la evidencia; aquí no se usan para nada.',
  },
};

/** Los tres niveles, ordenados de más a menos exigente. */
export const PRIORITY_ORDER: HabitPriority[] = ['clave', 'importante', 'apoyo'];

export const PRIORITY_LABEL: Record<HabitPriority, string> = {
  clave: 'Clave',
  importante: 'Importante',
  apoyo: 'Apoyo',
};

export const PRIORITY_ICON: Record<HabitPriority, string> = {
  clave: '🔴',
  importante: '🟠',
  apoyo: '🟢',
};

/* ---------------------------------------------------------------------------
 * El criterio, hábito a hábito
 * ------------------------------------------------------------------------- */

export const GUIDANCE: HabitGuidance[] = [
  /* ============================ SUEÑO Y DESCANSO ======================== */
  {
    metricId: 'horas_sueno',
    priority: 'clave',
    claim: 'Dormir lo que toca es lo que más mueve todo lo demás.',
    detail:
      'La AAP pide de 9 a 12 h a los 6-12 años y la OMS de 7 a 9 h en adultos. ' +
      'Walker insiste en que no se recupera el sábado lo perdido de lunes a ' +
      'viernes: la deuda no se salda, se arrastra. Es el primer sitio donde ' +
      'mirar cuando el esfuerzo, el humor o las notas se caen.',
    experts: ['aap', 'oms', 'walker'],
  },
  {
    metricId: 'horario_regular',
    priority: 'clave',
    claim: 'Acostarse y levantarse a la misma hora vale más que dormir mucho un día.',
    detail:
      'Walker lo pone por delante incluso de la cantidad: la regularidad es lo que ' +
      'ancla el reloj interno. Fin de semana incluido, con un margen de una hora.',
    experts: ['walker', 'huberman'],
  },
  {
    metricId: 'hora_cama',
    priority: 'importante',
    claim: 'La hora de acostarse decide cuántas horas caben, no al revés.',
    detail:
      'Con colegio a las ocho, dormir 10 h obliga a estar en la cama antes de las ' +
      '22:00. La AAP recomienda hora fija y rutina previa siempre igual: la ' +
      'secuencia repetida es la señal, más que el reloj.',
    experts: ['aap', 'walker'],
  },
  {
    metricId: 'sin_pantallas_noche',
    priority: 'clave',
    claim: 'La pantalla antes de dormir retrasa el sueño por dos vías: luz y activación.',
    detail:
      'La AAP pide apagar una hora antes y dejar los aparatos fuera del cuarto. ' +
      'Huberman apunta que lo que más molesta de noche es la luz brillante y ' +
      'cercana a los ojos; el contenido que engancha hace el resto.',
    experts: ['aap', 'huberman', 'walker'],
  },
  {
    metricId: 'luz_manana',
    priority: 'importante',
    claim: 'Diez minutos de luz natural al despertar ordenan el sueño de esa noche.',
    detail:
      'Es el protocolo más repetido de Huberman: luz de exterior temprano, sin ' +
      'cristales de por medio, entre 5 y 15 minutos según el día. Adelanta la ' +
      'melatonina de la noche siguiente. El camino al cole o al trabajo ya cuenta.',
    experts: ['huberman', 'walker'],
  },
  {
    metricId: 'sin_cafeina_tarde',
    priority: 'importante',
    claim: 'La cafeína de media tarde sigue trabajando cuando te acuestas.',
    detail:
      'Tarda unas 5-6 h en reducirse a la mitad, así que el café de las 17:00 ' +
      'llega despierto a la noche. Walker y Huberman cortan a primera hora de la ' +
      'tarde. Se nota más en la profundidad del sueño que en lo que cuesta dormirse.',
    experts: ['walker', 'huberman'],
  },
  {
    metricId: 'sin_alcohol',
    priority: 'importante',
    claim: 'El alcohol no ayuda a dormir: sedar no es dormir.',
    detail:
      'Fragmenta la segunda mitad de la noche y recorta el sueño REM. La OMS no ' +
      'reconoce ninguna cantidad segura. Contar los días sin es más útil que ' +
      'proponerse beber menos sin cifra.',
    experts: ['oms', 'walker'],
  },
  {
    metricId: 'calidad_descanso',
    priority: 'importante',
    claim: 'Cómo te levantas dice más que las horas que marcó el reloj.',
    detail:
      'Walker usa dos preguntas caseras: ¿podrías volver a dormirte a las diez de ' +
      'la mañana?, ¿funcionas antes del primer café? Si la respuesta es sí y no, ' +
      'falta sueño aunque las horas cuadren.',
    experts: ['walker'],
  },
  {
    metricId: 'energia',
    priority: 'apoyo',
    claim: 'La energía al despertar es el termómetro barato de la noche anterior.',
    detail:
      'No mide nada por sí sola, pero puesta al lado de las horas y de la hora de ' +
      'acostarse enseña el patrón en dos semanas.',
    experts: ['walker'],
  },
  {
    metricId: 'descanso',
    priority: 'apoyo',
    claim: 'La siesta corta repara; la larga se come la noche.',
    detail:
      'De 10 a 25 minutos y antes de las 15:00. Pasada la media hora se entra en ' +
      'sueño profundo y se despierta peor que antes de acostarse.',
    experts: ['walker', 'huberman'],
  },

  /* =========================== NUTRICIÓN E HIDRATACIÓN ================== */
  {
    metricId: 'agua',
    priority: 'importante',
    claim: 'Beber a lo largo del día, no de golpe al terminar de entrenar.',
    detail:
      'Un niño activo anda por litro y medio y un adulto por dos, más lo que se ' +
      'suda. Es de lo poco de Frank Suárez que coincide con todos: mucha gente ' +
      'llega al día crónicamente por debajo y lo confunde con hambre o con sueño.',
    experts: ['frank', 'marcos'],
  },
  {
    metricId: 'fruta_verdura',
    priority: 'clave',
    claim: 'Cinco raciones al día, y que no sean siempre las mismas cinco.',
    detail:
      'La OMS pide 400 g diarios. Spector añade el matiz que casi nadie cuenta: ' +
      'variedad, unas 30 plantas distintas a la semana entre fruta, verdura, ' +
      'legumbre, fruto seco y semilla. Contar colores funciona mejor con niños ' +
      'que contar gramos.',
    experts: ['oms', 'spector', 'basulto'],
  },
  {
    metricId: 'plato_sano',
    priority: 'clave',
    claim: 'Medio plato de verdura, un cuarto de proteína, un cuarto de hidrato entero.',
    detail:
      'Es el Plato de Harvard de Willett, y sirve igual para un plato único que ' +
      'para dos platos. Basulto recuerda que en niños manda el hambre del niño: ' +
      'los padres deciden qué se sirve y el niño, cuánto come de eso.',
    experts: ['willett', 'basulto'],
  },
  {
    metricId: 'desayuno',
    priority: 'importante',
    claim: 'Un desayuno con proteína aguanta hasta la comida; uno de galletas, no.',
    detail:
      'No hay obligación de desayunar, pero si se desayuna que lleve algo de ' +
      'proteína y algo de fruta. Basulto es tajante con lo habitual en España: ' +
      'galletas, cacao azucarado y bollería son postre, no desayuno.',
    experts: ['basulto', 'marcos'],
  },
  {
    metricId: 'proteina',
    priority: 'clave',
    claim: 'Proteína en cada comida: es lo que sostiene músculo y saciedad.',
    detail:
      'Attia sitúa a los adultos activos cerca de 1,6 g por kilo al día repartidos ' +
      'en tres o cuatro tomas; Endika Montiel lo resume en «que se vea la proteína ' +
      'en el plato». En niños no se pesa nada: basta con que haya huevo, pescado, ' +
      'carne, legumbre o lácteo en cada comida.',
    experts: ['attia', 'endika', 'marcos'],
  },
  {
    metricId: 'poco_dulce',
    priority: 'clave',
    claim: 'Lo que más cambia la alimentación de una casa es sacar el ultraprocesado.',
    detail:
      'La OMS pide bajar de un 10 % de las calorías en azúcares libres, y mejor de ' +
      'un 5 %. Ríos y Spector coinciden en que el enemigo no es un nutriente sino ' +
      'el producto: si no está en casa, no se come. Frank Suárez llega a lo mismo ' +
      'por otro camino con el azúcar y la harina refinada.',
    experts: ['oms', 'rios', 'spector', 'frank'],
  },
  {
    metricId: 'comidas',
    priority: 'importante',
    claim: 'Tres comidas ordenadas ganan a cinco improvisadas.',
    detail:
      'Marcos Vázquez insiste en que lo que rompe el orden es picotear todo el ' +
      'día, no el número exacto de comidas. Cierra la cocina entre ellas y el ' +
      'resto se acomoda solo.',
    experts: ['marcos', 'willett'],
  },
  {
    metricId: 'cena_temprana',
    priority: 'importante',
    claim: 'Cenar tres horas antes de dormir mejora la noche y la digestión.',
    detail:
      'Marcos Vázquez y Endika Montiel lo tratan como la versión sensata del ayuno: ' +
      'no hace falta protocolo, basta con no comer nada después de cenar. Walker ' +
      'añade que irse a la cama digiriendo estropea el sueño profundo.',
    experts: ['marcos', 'endika', 'walker'],
  },

  /* ============================== MOVIMIENTO ============================ */
  {
    metricId: 'actividad_diaria',
    priority: 'clave',
    claim: 'Una hora de movimiento al día, haya entrenamiento o no.',
    detail:
      'Es la recomendación de la OMS para 5-17 años: 60 minutos de actividad ' +
      'moderada o vigorosa cada día, y tres días por semana de algo que cargue ' +
      'músculo y hueso. Los días que hay que vigilar son los que no hay partido.',
    experts: ['oms'],
  },
  {
    metricId: 'pasos',
    priority: 'importante',
    claim: 'Lo que uno se mueve fuera del gimnasio pesa más que la sesión.',
    detail:
      'Marcos Vázquez lleva años con esto: el gasto del día a día vence a los ' +
      'cuarenta minutos de entrenamiento. Los beneficios grandes aparecen ya ' +
      'entre 7.000 y 8.000 pasos; de ahí en adelante siguen subiendo, más despacio.',
    experts: ['marcos', 'attia', 'oms'],
  },
  {
    metricId: 'fuerza',
    priority: 'clave',
    claim: 'Dos días de fuerza a la semana: es lo que protege los próximos treinta años.',
    detail:
      'La OMS los pide como mínimo y Attia lo eleva a lo más importante que se ' +
      'puede entrenar de cara a la vejez. Endika Montiel añade el matiz práctico: ' +
      'da igual el material, importa acercarse al fallo y repetirlo cada semana.',
    experts: ['oms', 'attia', 'endika'],
  },
  {
    metricId: 'movimiento',
    priority: 'clave',
    claim: 'Media hora al día, y que alguna sea intensa de verdad.',
    detail:
      'La OMS pide 150-300 minutos semanales de intensidad moderada. Attia añade ' +
      'la parte que se suele saltar: algo de trabajo duro de verdad, porque la ' +
      'capacidad aeróbica alta es de los mejores predictores de vivir más y mejor.',
    experts: ['oms', 'attia'],
  },
  {
    metricId: 'entreno_propio',
    priority: 'clave',
    claim: 'El que entrena a otros también tiene que entrenar.',
    detail:
      'Marcos Vázquez y Endika Montiel coinciden: 45 minutos bien puestos tres ' +
      'veces por semana rinden más que dos horas sueltas cuando se puede. La ' +
      'constancia gana a la intensidad en cualquier plazo largo.',
    experts: ['marcos', 'endika', 'attia'],
  },
  {
    metricId: 'movilidad',
    priority: 'importante',
    claim: 'La movilidad es el seguro de la fuerza, no el premio de después.',
    detail:
      'Diez minutos de cadera, tobillo y columna torácica sostienen la técnica y ' +
      'previenen lo que luego obliga a parar semanas.',
    experts: ['attia', 'marcos'],
  },
  {
    metricId: 'sport.asistencia',
    priority: 'clave',
    claim: 'Presentarse es el 80 % del resultado.',
    detail:
      'Clear lo llama no fallar dos veces seguidas: un día suelto no rompe nada, ' +
      'dos empiezan la costumbre contraria. Cuando no apetezca, versión mínima, ' +
      'pero ir.',
    experts: ['clear', 'fogg'],
  },
  {
    metricId: 'sport.esfuerzo',
    priority: 'importante',
    claim: 'Registrar el esfuerzo convierte el entrenamiento en información.',
    detail:
      'Ericsson lo pone en el centro de la práctica deliberada: sin una medida de ' +
      'lo que costó no hay forma de subir el listón un punto en la siguiente sesión.',
    experts: ['ericsson', 'endika'],
  },
  {
    metricId: 'sport.sensaciones',
    priority: 'importante',
    claim: 'Las molestias avisan antes que las lesiones.',
    detail:
      'Dos o tres sesiones seguidas de «cansado» o «molestias» piden descarga, no ' +
      'motivación. En niños es la señal a la que más caso hay que hacer.',
    experts: ['attia', 'basulto'],
  },

  /* ============================ MENTE Y ESTUDIO ========================= */
  {
    metricId: 'lectura',
    priority: 'clave',
    claim: 'Leer a diario es la costumbre que más rinde a largo plazo.',
    detail:
      'Veinte minutos diarios en un niño valen más que dos horas del domingo. ' +
      'Fogg y Clear recomiendan lo mismo para asegurarla: hacerla diminuta y ' +
      'engancharla a algo que ya ocurre —después de cenar, antes de dormir.',
    experts: ['clear', 'fogg'],
  },
  {
    metricId: 'escritura',
    priority: 'importante',
    claim: 'Escribir obliga a ordenar lo que se piensa, no sólo a recordarlo.',
    detail:
      'En niños, escribir a mano sostiene la ortografía y la letra mejor que ' +
      'cualquier ficha; en adultos, es la forma más barata de saber si de verdad ' +
      'entiendes algo.',
    experts: ['newport', 'ericsson'],
  },
  {
    metricId: 'repaso_examen',
    priority: 'importante',
    claim: 'Repartir el repaso en días vence a la noche anterior, siempre.',
    detail:
      'Media hora al día durante una semana rinde mucho más que cinco horas la ' +
      'víspera, y funciona mejor preguntándose en voz alta que releyendo.',
    experts: ['ericsson', 'newport'],
  },
  {
    metricId: 'pantallas_ocio',
    priority: 'clave',
    claim: 'El tiempo de pantalla se come el sueño, el juego y el movimiento.',
    detail:
      'La AAP no da una cifra mágica a partir de los 6 años: pide un límite ' +
      'acordado y que no desplace sueño, deberes ni actividad física. Dos horas ' +
      'de ocio es el techo con el que trabaja esta casa. Cuenta el ocio, no los ' +
      'deberes ni el trabajo.',
    experts: ['aap', 'oms'],
  },
  {
    metricId: 'epoca_examenes',
    priority: 'apoyo',
    claim: 'Marcar el contexto evita leer mal los datos.',
    detail:
      'Una semana de exámenes explica que baje el deporte y suba el estudio. Sin ' +
      'esa marca, el resumen del mes miente.',
    experts: ['clear'],
  },
  {
    metricId: 'diario',
    priority: 'apoyo',
    claim: 'Tres líneas al día bastan para ver patrones que la memoria borra.',
    detail:
      'Clear lo recomienda como la forma más simple de revisión: sin registro no ' +
      'hay ajuste, sólo sensación.',
    experts: ['clear'],
  },
  {
    metricId: 'pausa_consciente',
    priority: 'importante',
    claim: 'Bajar pulsaciones a media jornada no es un lujo: evita llegar fundido.',
    detail:
      'Cinco minutos de respiración lenta, con la exhalación más larga que la ' +
      'inhalación, bastan para cortar la activación acumulada. Huberman lo usa ' +
      'como herramienta de rescate, no como práctica espiritual.',
    experts: ['huberman', 'sonnentag'],
  },

  /* ============================== PROFESIONAL =========================== */
  {
    metricId: 'prep_clases',
    priority: 'clave',
    claim: 'Preparar en bloque, sin interrupciones, cunde el triple.',
    detail:
      'Newport lo llama trabajo profundo: 45-90 minutos con el móvil fuera valen ' +
      'más que tres horas troceadas por notificaciones y correos.',
    experts: ['newport'],
  },
  {
    metricId: 'prep_sesion',
    priority: 'clave',
    claim: 'La sesión se gana en la pizarra antes que en el campo.',
    detail:
      'Un bloque protegido de una hora, sin móvil, sostiene la calidad de lo que ' +
      'luego se les pide a los jugadores.',
    experts: ['newport'],
  },
  {
    metricId: 'analisis_tactico',
    priority: 'importante',
    claim: 'El vídeo sólo mejora si se ve buscando algo concreto.',
    detail:
      'Ericsson: la práctica deliberada exige objetivo definido y feedback ' +
      'inmediato. Ver el partido entero «a ver qué sale» no es análisis.',
    experts: ['ericsson', 'newport'],
  },
  {
    metricId: 'feedback_sesion',
    priority: 'importante',
    claim: 'El feedback cercano en el tiempo es el que cambia algo.',
    detail:
      'Ericsson lo sitúa como la mitad del aprendizaje: corregir al terminar, no ' +
      'tres días después, cuando el error ya se ha consolidado.',
    experts: ['ericsson'],
  },
  {
    metricId: 'feedback_alumnos',
    priority: 'importante',
    claim: 'Corregir sobre el esfuerzo y el proceso, no sobre el talento.',
    detail:
      'Dweck lleva décadas mostrando lo mismo: «has trabajado bien esta parte» ' +
      'sostiene el aprendizaje; «qué listo eres» lo frena en cuanto llega la ' +
      'primera dificultad.',
    experts: ['dweck', 'ericsson'],
  },
  {
    metricId: 'charlas_jugadores',
    priority: 'importante',
    claim: 'Las charlas individuales sostienen al grupo más que las charlas al grupo.',
    detail:
      'Dos por sesión, breves y concretas, mantienen el vestuario enterado sin ' +
      'convertir cada asunto en una reunión.',
    experts: ['dweck', 'gottman'],
  },
  {
    metricId: 'control_cargas',
    priority: 'importante',
    claim: 'Los saltos bruscos de carga son los que lesionan.',
    detail:
      'Lo que se vigila no es el total, es el cambio de una semana respecto a las ' +
      'anteriores.',
    experts: ['attia'],
  },
  {
    metricId: 'cierre_jornada',
    priority: 'clave',
    claim: 'Sin desconectar de verdad, el descanso no repara.',
    detail:
      'Sonnentag lo tiene medido: la desconexión psicológica al terminar predice ' +
      'la energía del día siguiente mejor que las horas libres. Un cierre con ' +
      'ritual —apuntar lo pendiente y apagar— funciona mejor que la fuerza de voluntad.',
    experts: ['sonnentag', 'newport'],
  },
  {
    metricId: 'desconexion',
    priority: 'clave',
    claim: 'Llegar a casa y seguir en el campo les cuesta caro a los dos sitios.',
    detail:
      'Sonnentag: quien no desconecta rinde menos al día siguiente y descansa peor ' +
      'por la noche. Un gesto que marque el corte —la ducha, el paseo, dejar el ' +
      'móvil en un cajón— hace de frontera.',
    experts: ['sonnentag'],
  },
  {
    metricId: 'liderazgo',
    priority: 'importante',
    claim: 'El estado del entrenador se contagia al grupo antes que su discurso.',
    detail:
      'Registrarlo a diario permite ver si los días malos del vestuario coinciden ' +
      'con los días malos de quien lo dirige.',
    experts: ['gottman', 'dweck'],
  },
  {
    metricId: 'master',
    priority: 'importante',
    claim: 'El máster se aprueba en bloques cortos y repetidos, no en atracones.',
    detail:
      'Cuarenta y cinco minutos protegidos, sin móvil y a la misma hora rinden más ' +
      'que la tarde entera del domingo. Y lo que de verdad fija es preguntarse en ' +
      'voz alta lo estudiado, no releerlo.',
    experts: ['newport', 'ericsson'],
  },
  {
    metricId: 'gastos_apuntados',
    priority: 'importante',
    claim: 'Sin registro no hay ajuste, sólo sensación.',
    detail:
      'Apuntar el gasto el mismo día es lo que convierte la economía en un hábito ' +
      'y no en un susto a fin de mes. Clear lo cuenta igual para cualquier cosa ' +
      'que se quiera mejorar: lo que se mide, se ve.',
    experts: ['clear', 'fogg'],
  },
  {
    metricId: 'cuentas',
    priority: 'apoyo',
    claim: 'Un rato fijo al mes evita veinte decisiones sueltas.',
    detail:
      'Media hora con las cuentas delante —lo que entró, lo que salió, lo que se ' +
      'aparta— decide mejor que revisarlas cada vez que llega un recibo.',
    experts: ['clear'],
  },
  {
    metricId: 'cultura_equipo',
    priority: 'apoyo',
    claim: 'La cultura de un equipo se construye en ratos cortos y repetidos, como un hábito.',
    detail:
      'Clear lo explica para las personas y vale igual para un grupo: la identidad ' +
      'no se anuncia en una charla de pretemporada, se demuestra en lo que se ' +
      'repite cada semana. Dweck añade el contenido: se elogia el proceso —cómo se ' +
      'ha competido, cómo se ha entrenado— y no el resultado del domingo.',
    experts: ['clear', 'dweck'],
  },
  {
    metricId: 'formacion',
    priority: 'apoyo',
    claim: 'Media hora de formación a la semana pesa más que un curso al año.',
    detail:
      'Newport lo llama trabajo profundo: poco rato, protegido y sin notificaciones. ' +
      'Y Ericsson recuerda que sólo cuenta lo que se aplica después: escuchar un ' +
      'podcast no es práctica deliberada hasta que algo de él entra en la sesión.',
    experts: ['newport', 'ericsson'],
  },
  {
    metricId: 'tiempo_hijos',
    priority: 'importante',
    claim: 'Los hijos no recuerdan los planes grandes, recuerdan los ratos de todos los días.',
    detail:
      'Álvaro Bilbao lo pone entre lo que más construye el cerebro de un niño: ' +
      'presencia entera, aunque sea corta. Silvia Álava añade que el rato bueno no ' +
      'necesita actividad ni pantalla, y Gottman que el móvil delante convierte la ' +
      'presencia en ausencia. Una hora de verdad vale más que una tarde a medias.',
    experts: ['bilbao', 'alava', 'gottman'],
  },
  {
    metricId: 'tareas_casa',
    priority: 'apoyo',
    claim: 'Repartir la casa por escrito desactiva el reproche antes de que nazca.',
    detail:
      'Gottman sitúa el reparto doméstico entre los conflictos más repetidos y más ' +
      'fáciles de desactivar. Joan Garriga lo mira desde los lugares: cuando cada ' +
      'uno sabe qué le toca, dejan de existir cuentas pendientes que se cobran en ' +
      'otra conversación.',
    experts: ['gottman', 'garriga'],
  },
  {
    metricId: 'organizar_semana',
    priority: 'apoyo',
    claim: 'La revisión semanal es lo que evita veinte decisiones sueltas entre semana.',
    detail:
      'Clear la propone corta y fija: qué funcionó, qué no y qué se cambia. Newport ' +
      'le añade el reparto de huecos, que es donde se decide de verdad la semana: ' +
      'lo que no tiene hora, no ocurre.',
    experts: ['clear', 'newport'],
  },
  {
    metricId: 'energia_aula',
    priority: 'apoyo',
    claim: 'La energía en clase avisa del desgaste antes que el calendario.',
    detail:
      'Tres o cuatro días seguidos de energía baja piden revisar carga y descanso, ' +
      'no apretar más.',
    experts: ['sonnentag'],
  },

  /* =============================== FAMILIA ============================== */
  {
    metricId: 'comidas_familia',
    priority: 'clave',
    claim: 'Comer juntos y sin pantallas es de lo mejor documentado que hace una familia.',
    detail:
      'Se asocia a mejor alimentación, más vocabulario y menos conductas de riesgo ' +
      'en la adolescencia. Basulto añade la parte de la mesa: el niño come mejor ' +
      'cuando ve comer lo mismo a los mayores y nadie le presiona. Faber y Mazlish ' +
      'ponen el resto: en la mesa se pregunta y se escucha, no se interroga ni se ' +
      'aprovecha para corregir el día.',
    experts: ['basulto', 'willett', 'faber', 'bilbao'],
  },
  {
    metricId: 'rutina_sueno',
    priority: 'clave',
    claim: 'La rutina de acostarse es lo que hace que los peques duerman, no la hora.',
    detail:
      'La AAP recomienda la misma secuencia todas las noches —cena, ducha, cuento, ' +
      'luz fuera— porque la señal es la repetición. Es además el momento en que ' +
      'los niños cuentan lo que no cuentan en la mesa. Álvaro Bilbao insiste en que ' +
      'ese rato de calma es cuando el cerebro del niño consolida lo aprendido, y ' +
      'Míriam Tirado en que el límite se sostiene mejor si la rutina es la misma ' +
      'para todos y no se negocia cada noche.',
    experts: ['aap', 'walker', 'bilbao', 'tirado'],
  },
  {
    metricId: 'refuerzo_esfuerzo',
    priority: 'importante',
    claim: 'Reconocer el esfuerzo, no el resultado ni el talento.',
    detail:
      'Dweck: «has entrenado bien toda la semana» construye; «qué crack eres» crea ' +
      'miedo a fallar. Con dos hermanos deportistas es la diferencia entre ' +
      'competir entre ellos y empujarse. Kazdin añade la mecánica: el refuerzo pesa ' +
      'cuando es concreto, inmediato y describe la conducta; el castigo enseña a ' +
      'esconderla. Bilbao lo resume en que el elogio al esfuerzo alimenta la ' +
      'motivación propia, y el elogio al talento la sustituye por la del adulto. ' +
      'UNICEF cierra el marco: la crianza positiva reconoce y redirige, y deja ' +
      'fuera el castigo físico y la humillación, sin excepciones.',
    experts: ['dweck', 'kazdin', 'bilbao', 'unicef'],
  },
  {
    metricId: 'aire_libre',
    priority: 'importante',
    claim: 'El aire libre suma luz, movimiento y menos pantalla de una vez.',
    detail:
      'En niños se asocia además a menos miopía: el tiempo al exterior es el factor ' +
      'protector más consistente que se conoce. Silvia Álava recuerda que el juego ' +
      'libre al aire libre —sin actividad dirigida— es donde se entrenan la ' +
      'iniciativa y la tolerancia al aburrimiento.',
    experts: ['oms', 'huberman', 'alava'],
  },
  {
    metricId: 'tiempo_juego',
    priority: 'importante',
    claim: 'Jugar con ellos vale más que los planes grandes de fin de semana.',
    detail:
      'Cuarenta y cinco minutos de juego de verdad, sin móvil delante, pesan más ' +
      'que una excursión al mes. Álvaro Bilbao lo pone entre lo que más construye ' +
      'el cerebro del niño, y Silvia Álava señala que jugando se enseña a perder, a ' +
      'esperar turno y a negociar sin que parezca una lección.',
    experts: ['gottman', 'dweck', 'bilbao', 'alava'],
  },
  {
    metricId: 'lectura_conjunta',
    priority: 'importante',
    claim: 'Leer con ellos sostiene la lectura de ellos.',
    detail:
      'Ver leer en casa predice el hábito lector infantil mejor que cualquier ' +
      'insistencia. Vale igual la peli comentada que el libro: lo que cuenta es la ' +
      'conversación de después. Siegel lo llama «contar el cuento de lo que pasó»: ' +
      'poner en palabras lo vivido es lo que lo ordena.',
    experts: ['clear', 'siegel', 'bilbao'],
  },
  {
    metricId: 'rutina_finde',
    priority: 'importante',
    claim: 'El fin de semana es donde se descuadran el sueño y las comidas.',
    detail:
      'Walker llama «jet lag social» a mover dos horas el horario el sábado: se ' +
      'paga el lunes. Una rutina mínima de finde protege la semana entera. ' +
      'Steinberg avisa de cómo envejece esto: con la edad se negocian los bordes ' +
      '—la hora de volver, la pantalla— pero el ancla y la supervisión siguen ' +
      'haciendo falta bastante después de lo que parece.',
    experts: ['walker', 'clear', 'steinberg'],
  },
  {
    metricId: 'tareas_hogar',
    priority: 'apoyo',
    claim: 'El reparto de tareas evita que el cansancio se convierta en reproche.',
    detail:
      'Gottman lo sitúa entre los motivos más repetidos de conflicto doméstico, y ' +
      'entre los más fáciles de desactivar poniéndolo por escrito. Con los peques ' +
      'hay premio doble: Silvia Álava recuerda que las tareas de casa son la vía ' +
      'más directa de enseñar autonomía y responsabilidad a esta edad.',
    experts: ['gottman', 'alava'],
  },
  {
    metricId: 'consejo_familia',
    priority: 'importante',
    claim: 'Quince minutos de planificación semanal ahorran discusiones diarias.',
    detail:
      'Clear lo llama revisión: mirar qué funcionó y qué no, y decidir una sola ' +
      'cosa a cambiar. En familia, además, reparte la carga mental. Ross Greene ' +
      'aporta el tono: los problemas que se repiten se resuelven *con* los hijos y ' +
      'en frío —qué pasa, qué nos preocupa, qué probamos—, no a gritos en caliente.',
    experts: ['clear', 'gottman', 'greene'],
  },
  {
    metricId: 'animo_familia',
    priority: 'apoyo',
    claim: 'El clima de casa es un dato, no una impresión.',
    detail:
      'Anotado a diario enseña qué semanas se tuercen y con qué coinciden: sueño ' +
      'corto, exámenes, cargas de trabajo. Baumrind describe el clima que mejor ' +
      'funciona —exigente y cálido a la vez— y Rafa Guerrero recuerda que el niño ' +
      'regula sus emociones prestadas de las nuestras: la calma del adulto es parte ' +
      'del ambiente que se está midiendo.',
    experts: ['gottman', 'baumrind', 'guerrero'],
  },

  /* =============================== PAREJA =============================== */
  {
    metricId: 'check_in',
    priority: 'clave',
    claim: 'Diez minutos diarios de conversación sin logística sostienen la pareja.',
    detail:
      'Gottman lo llama «charla de reencuentro»: al terminar el día, hablar de todo ' +
      'menos de niños, dinero y agenda. Es de las pocas rutinas con efecto medido ' +
      'sobre la satisfacción de pareja. Sue Johnson explica por qué funciona: lo ' +
      'que se pregunta de fondo, cada día, es «¿sigues ahí?», y basta con ' +
      'responder que sí.',
    experts: ['gottman', 'johnson'],
  },
  {
    metricId: 'gratitud',
    priority: 'clave',
    claim: 'Cinco gestos buenos por cada roce: ésa es la proporción que aguanta.',
    detail:
      'Es el hallazgo más conocido de Gottman: las parejas que duran mantienen unas ' +
      'cinco interacciones positivas por cada negativa, también en los días malos. ' +
      'Se construye con gestos pequeños y diarios, no con grandes gestos. Bolinches ' +
      'lo enmarca en su regla de fondo: sólo se quiere bien desde la propia ' +
      'estabilidad; agradecer es el gesto más barato de mantenerla.',
    experts: ['gottman', 'bolinches'],
  },
  {
    metricId: 'reparacion',
    priority: 'clave',
    claim: 'Lo que distingue a las parejas que duran no es no discutir: es reparar.',
    detail:
      'Gottman: el intento de reparación —una broma, un «perdona», un acercarse— y ' +
      'sobre todo que el otro lo acepte, predice el futuro de la pareja mejor que ' +
      'la frecuencia de las discusiones. El mismo día, sin dejarlo dormir. Markman ' +
      'añade la parte práctica del programa PREP: pactar de antemano una señal para ' +
      'parar y una hora para retomarlo, porque en caliente no se repara nada.',
    experts: ['gottman', 'markman', 'johnson'],
  },
  {
    metricId: 'tiempo_pareja',
    priority: 'importante',
    claim: 'Tiempo juntos con el móvil fuera de la mesa, o no cuenta.',
    detail:
      'La presencia a medias se registra como ausencia. Media hora entera vale más ' +
      'que una tarde compartiendo sofá y pantallas distintas. Finkel lo mide así: ' +
      'hoy se le pide a la pareja mucho más que hace cincuenta años, y sólo aguanta ' +
      'esa exigencia si se le dedica tiempo de verdad; si no, conviene bajar lo que ' +
      'se le pide.',
    experts: ['gottman', 'newport', 'finkel'],
  },
  {
    metricId: 'cita',
    priority: 'importante',
    claim: 'Una cita al mes protegida en el calendario, o se la come la logística.',
    detail:
      'Gottman insiste en tratarla como un compromiso fijo, no como algo que se ' +
      'hace «si da tiempo». Y que sea algo nuevo: Aron encontró que compartir ' +
      'actividades novedosas —no las de siempre— es lo que reaviva la sensación de ' +
      'cercanía. Perel apunta en la misma dirección: el deseo necesita un poco de ' +
      'distancia y de vida propia que contar.',
    experts: ['gottman', 'aron', 'perel'],
  },
  {
    metricId: 'planificacion',
    priority: 'apoyo',
    claim: 'Planificar juntos reparte la carga mental, que es la que menos se ve.',
    detail:
      'Poner la semana por escrito entre los dos evita que uno lleve la agenda de ' +
      'los cuatro en la cabeza. Joan Garriga lo mira desde los lugares: cuando cada ' +
      'uno sabe qué le toca, deja de haber cuentas pendientes que se cobran en otra ' +
      'conversación.',
    experts: ['gottman', 'clear', 'garriga'],
  },
  {
    metricId: 'sintonia',
    priority: 'importante',
    claim: 'Notar el enfriamiento a tiempo es lo que permite corregirlo.',
    detail:
      'Gottman describe el distanciamiento como algo lento y silencioso. Una escala ' +
      'diaria hace visible la pendiente antes de que sea una conversación difícil. ' +
      'Silvia Congost avisa del error contrario: confundir la calma con sintonía y ' +
      'aguantar en automático; el número está para mirarlo, no para tranquilizarse.',
    experts: ['gottman', 'congost', 'johnson'],
  },
  {
    metricId: 'paseo',
    priority: 'apoyo',
    claim: 'Caminando se habla de lo que sentados cuesta.',
    detail:
      'Sin mirarse a la cara y en movimiento salen conversaciones que en el salón ' +
      'no salen. Suma además luz y pasos. Bolinches lo recomienda como el sitio ' +
      'donde tratar lo que en casa se enquista: fuera del escenario del conflicto ' +
      'se habla distinto.',
    experts: ['gottman', 'marcos', 'bolinches'],
  },
];

/* ---------------------------------------------------------------------------
 * Acceso
 * ------------------------------------------------------------------------- */

/**
 * Las métricas deportivas llevan la actividad en el identificador
 * (`sport.futbol.esfuerzo`), pero el criterio es el mismo para las cinco. Se
 * reduce al sufijo para no repetir la misma ficha cinco veces.
 */
function guidanceKey(metricId: string): string {
  if (!metricId.startsWith('sport.')) return metricId;
  const parts = metricId.split('.');
  return `sport.${parts[parts.length - 1]}`;
}

/** El criterio de una métrica para un perfil, si lo hay. */
export function guidanceFor(profileId: ProfileId, metricId: string): HabitGuidance | undefined {
  const key = guidanceKey(metricId);
  const matches = GUIDANCE.filter((g) => g.metricId === key);
  // La ficha específica del perfil manda sobre la general.
  return (
    matches.find((g) => g.only?.includes(profileId)) ?? matches.find((g) => g.only === undefined)
  );
}

/** Las referencias de una ficha, ya resueltas y sin huecos. */
export function expertsOf(guidance: HabitGuidance): Expert[] {
  return guidance.experts.map((id) => EXPERTS[id]).filter(Boolean);
}

/** Nombres de las referencias, para las líneas de una sola frase. */
export function expertNames(guidance: HabitGuidance): string {
  return expertsOf(guidance)
    .map((expert) => expert.name)
    .join(' · ');
}

export interface GuidanceEntry {
  guidance: HabitGuidance;
  metric: Metric;
  categoryId: string;
  categoryLabel: string;
}

/** Todo el criterio que aplica a un perfil, en el orden del catálogo. */
export function guidanceOf(profileId: ProfileId): GuidanceEntry[] {
  const seen = new Set<string>();
  const out: GuidanceEntry[] = [];

  for (const category of getCategories(profileId)) {
    for (const metric of category.metrics) {
      const guidance = guidanceFor(profileId, metric.id);
      // Una sola ficha por criterio: las cinco actividades comparten la suya.
      if (!guidance || seen.has(guidance.metricId)) continue;
      seen.add(guidance.metricId);
      out.push({ guidance, metric, categoryId: category.id, categoryLabel: category.label });
    }
  }

  return out;
}

/* ---------------------------------------------------------------------------
 * Items a atender
 * ------------------------------------------------------------------------- */

/** Por debajo de esto, un hábito con criterio se considera flojo. */
export const ATTENTION_THRESHOLD = 0.6;

const STATUS_RANK: Record<AttentionItem['status'], number> = {
  excedido: 0,
  flojo: 1,
  sinRegistrar: 2,
};

export const STATUS_LABEL: Record<AttentionItem['status'], string> = {
  excedido: 'Por encima del techo',
  flojo: 'Por debajo del criterio',
  sinRegistrar: 'Sin registrar',
};

/**
 * Qué pide atención hoy: sólo hábitos con criterio experto detrás, y sólo
 * cuando están por debajo del suelo, por encima del techo o sin registrar.
 * Se ordena por prioridad y, dentro de ella, por gravedad: primero lo que se
 * ha pasado de la raya, después lo flojo y al final lo que falta por contar.
 */
export function attentionItems(
  profileId: ProfileId,
  values: Record<string, MetricValue>,
  limit?: number,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const category of getCategories(profileId)) {
    for (const metric of category.metrics) {
      const guidance = guidanceFor(profileId, metric.id);
      if (!guidance || guidance.priority === 'apoyo') continue;
      if ((metric.weight ?? 1) <= 0) continue;

      const ratio = metricRatio(metric, values[metric.id]);

      let status: AttentionItem['status'];
      if (ratio === null) status = 'sinRegistrar';
      else if (ratio >= ATTENTION_THRESHOLD) continue; // cumplido: no molesta
      else if (
        (metric.type === 'counter' || metric.type === 'duration') &&
        metric.direction === 'atMost'
      )
        status = 'excedido';
      else status = 'flojo';

      items.push({
        guidance,
        metric,
        categoryId: category.id,
        categoryLabel: category.label,
        ratio,
        status,
      });
    }
  }

  items.sort((a, b) => {
    const byPriority =
      PRIORITY_ORDER.indexOf(a.guidance.priority) - PRIORITY_ORDER.indexOf(b.guidance.priority);
    if (byPriority !== 0) return byPriority;
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  });

  return limit ? items.slice(0, limit) : items;
}
