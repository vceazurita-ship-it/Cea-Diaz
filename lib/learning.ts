import { hashSeed } from '@/lib/challenges';
import { addDays } from '@/lib/dates';
import { getCategories } from '@/lib/habits';
import type {
  DailyLearning,
  DateKey,
  DayEntry,
  HabitCategory,
  LearningBonus,
  Profile,
  ProfileId,
} from '@/types';

/* =========================================================================
 *  Bonus de aprendizaje del día.
 *
 *  Una cosa útil al día, elegida por donde cada uno pone el interés: se mira
 *  en qué categoría se está registrando más estas dos semanas y de ahí sale
 *  el bonus. Quien nada en vez de entrenar fuerza recibe cosas de natación.
 *
 *  El idioma es parte del regalo: a los peques y a Víctor les llega en
 *  inglés —así el bonus entrena también el idioma, con las palabras nuevas
 *  traducidas debajo—, y a María, a la familia y a la pareja en español.
 *
 *  Como los retos y las recompensas, **no se guarda nada**: se deduce del
 *  historial, así que el mismo día da siempre el mismo bonus y el catálogo
 *  rota solo. Es catálogo editable, igual que `lib/habits.ts`.
 * ========================================================================= */

/** Días hacia atrás que se miran para saber dónde está el interés. */
const WINDOW = 14;

/* ---------------------------------------------------------------------------
 * Leo y Hugo · en inglés, nivel de primaria
 * ------------------------------------------------------------------------- */

const KID_BONUSES: LearningBonus[] = [
  /* ------------------------------------------ nutrición */
  {
    id: 'kid-nutri-plate',
    topic: 'nutricion',
    lang: 'en',
    icon: '🥗',
    title: 'Half the plate',
    body:
      'Look at your plate before you start. Half of it should be vegetables or ' +
      'salad, one quarter protein — meat, fish, eggs or beans — and one quarter ' +
      'rice, pasta or bread.',
    apply: 'Check your plate at dinner tonight. Is half of it green?',
    gloss: 'plate = plato · half = mitad · quarter = cuarto · beans = legumbres',
  },
  {
    id: 'kid-nutri-water',
    topic: 'nutricion',
    lang: 'en',
    icon: '💧',
    title: 'Drink before you are thirsty',
    body:
      'Thirst arrives late. When you feel it, your body has already lost water ' +
      'and you run a little slower. Athletes drink small amounts often.',
    apply: 'Take three sips of water before training, not only after.',
    gloss: 'thirsty = sediento · sip = sorbo · often = a menudo · slower = más lento',
  },
  {
    id: 'kid-nutri-breakfast',
    topic: 'nutricion',
    lang: 'en',
    icon: '🍳',
    title: 'A breakfast that lasts',
    body:
      'Sugar wakes you up fast and drops you fast. Protein keeps you going until ' +
      'lunch: eggs, cheese, yoghurt, ham, nuts.',
    apply: 'Add one protein to breakfast tomorrow and see how you feel at 11.',
    gloss: 'breakfast = desayuno · to last = durar · nuts = frutos secos · drop = caída',
  },
  {
    id: 'kid-nutri-colours',
    topic: 'nutricion',
    lang: 'en',
    icon: '🌈',
    title: 'Eat the rainbow',
    body:
      'Different colours in fruit and vegetables mean different things your body ' +
      'needs. Red, orange, green, purple, white — the more colours in a week, ' +
      'the better.',
    apply: 'Count the colours you ate today. Try to add one you are missing.',
    gloss: 'rainbow = arcoíris · purple = morado · the more… the better = cuanto más… mejor',
  },
  {
    id: 'kid-nutri-slow',
    topic: 'nutricion',
    lang: 'en',
    icon: '🍽️',
    title: 'Eat slowly',
    body:
      'Your stomach needs about twenty minutes to tell your brain that it is ' +
      'full. If you eat very fast, you finish before the message arrives.',
    apply: 'Put your fork down between bites at one meal today.',
    gloss: 'stomach = estómago · full = lleno · fork = tenedor · bite = bocado',
  },

  /* ---------------------------------------------- sueño */
  {
    id: 'kid-sleep-clock',
    topic: 'sueno',
    lang: 'en',
    icon: '⏰',
    title: 'Your body has a clock',
    body:
      'Going to bed and getting up at the same time is more important than ' +
      'sleeping a lot one day. Your body learns the hour and gets sleepy on time.',
    apply: 'Go to bed at your usual time tonight, even if it is the weekend.',
    gloss: 'clock = reloj · sleepy = con sueño · on time = a la hora · usual = de siempre',
  },
  {
    id: 'kid-sleep-screens',
    topic: 'sueno',
    lang: 'en',
    icon: '📵',
    title: 'Screens off one hour before',
    body:
      'A bright screen close to your eyes tells your brain that it is still day. ' +
      'And an exciting video keeps your head busy when it should be slowing down.',
    apply: 'Leave the tablet outside your room tonight.',
    gloss: 'screen = pantalla · bright = brillante · busy = ocupado · to slow down = frenar',
  },
  {
    id: 'kid-sleep-light',
    topic: 'sueno',
    lang: 'en',
    icon: '🌅',
    title: 'Morning light',
    body:
      'Ten minutes of daylight when you wake up sets your clock for the whole ' +
      'day — and it is what makes you sleepy at the right time at night.',
    apply: 'Have breakfast near the window, or walk to school without a hood.',
    gloss: 'daylight = luz del día · to wake up = despertarse · whole = entero',
  },
  {
    id: 'kid-sleep-sport',
    topic: 'sueno',
    lang: 'en',
    icon: '⚽',
    title: 'Sleep makes you faster',
    body:
      'What you learn at training — a move, a turn, a stroke — is saved while you ' +
      'sleep. A short night is a training session you half lose.',
    apply: 'On training days, be in bed ten minutes earlier than usual.',
    gloss: 'to save = guardar · stroke = brazada · to lose = perder · earlier = antes',
  },
  {
    id: 'kid-sleep-routine',
    topic: 'sueno',
    lang: 'en',
    icon: '🌜',
    title: 'Always the same order',
    body:
      'Dinner, shower, story, lights out. Your brain reads the order, not the ' +
      'clock: when the steps repeat, sleep comes on its own.',
    apply: 'Do the four steps in the same order tonight.',
    gloss: 'order = orden · shower = ducha · story = cuento · steps = pasos',
  },

  /* -------------------------------------------- deporte */
  {
    id: 'kid-sport-warmup',
    topic: 'deporte',
    lang: 'en',
    icon: '🔥',
    title: 'Warm up properly',
    body:
      'A warm muscle stretches; a cold one tears. Five minutes of easy running ' +
      'and moving your joints is what keeps you playing all season.',
    apply: 'Name the three parts of your warm-up in English today.',
    gloss: 'to warm up = calentar · muscle = músculo · joint = articulación · to tear = romperse',
  },
  {
    id: 'kid-sport-effort',
    topic: 'deporte',
    lang: 'en',
    icon: '🌱',
    title: 'Effort, not talent',
    body:
      '«You worked hard all week» makes you want to train again. «You are a ' +
      'genius» makes you afraid to fail. Praise the work, yours and your ' +
      'teammates.',
    apply: 'Tell one teammate something good about their effort today.',
    gloss: 'effort = esfuerzo · hard = duro · afraid = con miedo · to praise = elogiar',
  },
  {
    id: 'kid-sport-offball',
    topic: 'deporte',
    lang: 'en',
    icon: '🏃',
    title: 'The run nobody sees',
    body:
      'Most goals start with a run made without the ball, before anyone is ' +
      'looking. Coaches notice that run more than the last touch.',
    apply: 'Make one run into space today even if the ball never arrives.',
    gloss: 'run = carrera · without = sin · to notice = fijarse en · space = espacio',
  },
  {
    id: 'kid-sport-recovery',
    topic: 'deporte',
    lang: 'en',
    icon: '🛁',
    title: 'Rest is training too',
    body:
      'Muscles do not get stronger during the session: they get stronger after ' +
      'it, while you rest and eat and sleep. A rest day is part of the plan.',
    apply: 'On your rest day, walk or swim easy instead of doing nothing.',
    gloss: 'rest = descanso · stronger = más fuerte · instead of = en vez de',
  },
  {
    id: 'kid-sport-ask',
    topic: 'deporte',
    lang: 'en',
    icon: '🗣️',
    title: 'Ask your coach',
    body:
      'Good players ask. Three questions that always work: «What should I do ' +
      'better?», «Where should I be?» and «Can you show me again?».',
    apply: 'Ask one of the three at training today.',
    gloss: 'coach = entrenador · better = mejor · to show = enseñar · again = otra vez',
  },

  /* ------------------------------------------ cognitivo */
  {
    id: 'kid-mind-spaced',
    topic: 'cognitivo',
    lang: 'en',
    icon: '📚',
    title: 'Little and often',
    body:
      'Twenty minutes on four days beats two hours the night before. Your brain ' +
      'keeps what it meets again after forgetting it a little.',
    apply: 'Study tomorrow what you studied today, for five minutes.',
    gloss: 'often = a menudo · to beat = ganar a · to forget = olvidar · to keep = quedarse con',
  },
  {
    id: 'kid-mind-retrieval',
    topic: 'cognitivo',
    lang: 'en',
    icon: '🧠',
    title: 'Close the book and say it',
    body:
      'Reading again feels easy, and that is the trap: it feels known but it is ' +
      'not. Closing the book and saying it out loud is harder — and it works.',
    apply: 'After reading a page, say it in your own words without looking.',
    gloss: 'trap = trampa · out loud = en voz alta · harder = más difícil · own = propio',
  },
  {
    id: 'kid-mind-onething',
    topic: 'cognitivo',
    lang: 'en',
    icon: '🎯',
    title: 'One thing at a time',
    body:
      'Homework with the tablet next to you takes longer and comes out worse. ' +
      'The brain does not do two things at once: it jumps, and loses time jumping.',
    apply: 'Leave the tablet in another room for one homework session.',
    gloss: 'homework = deberes · next to = al lado de · at once = a la vez · to jump = saltar',
  },
  {
    id: 'kid-mind-start',
    topic: 'cognitivo',
    lang: 'en',
    icon: '⏱️',
    title: 'The two-minute start',
    body:
      'The hardest part is starting. Tell yourself you will work for two minutes ' +
      'only. Almost always you keep going — and if you do not, you did two.',
    apply: 'Start the task you like least with a two-minute timer.',
    gloss: 'hardest = lo más difícil · to keep going = seguir · least = menos · timer = temporizador',
  },
  {
    id: 'kid-mind-question',
    topic: 'cognitivo',
    lang: 'en',
    icon: '❓',
    title: 'Read with a question',
    body:
      'Before reading, ask yourself what you want to find out. With a question ' +
      'in your head you read looking for something, and you remember much more.',
    apply: 'Write one question before you open the book tonight.',
    gloss: 'to find out = averiguar · to remember = recordar · much more = mucho más',
  },
];

/* ---------------------------------------------------------------------------
 * Víctor · en inglés, con el vocabulario del oficio
 * ------------------------------------------------------------------------- */

const VICTOR_BONUSES: LearningBonus[] = [
  /* ---------------------------------------- sueño y descanso */
  {
    id: 'vic-sleep-decisions',
    topic: 'salud',
    lang: 'en',
    icon: '🧠',
    title: 'Sleep is a coaching skill',
    body:
      'After a short night the first thing to go is not energy: it is judgement. ' +
      'You read the game the same, but you decide worse and later — exactly what ' +
      'a bench needs most.',
    apply: 'On match days, protect the seven hours before you protect anything else.',
    gloss: 'judgement = criterio · bench = banquillo · to read the game = leer el partido',
  },
  {
    id: 'vic-sleep-caffeine',
    topic: 'salud',
    lang: 'en',
    icon: '☕',
    title: 'The caffeine tail',
    body:
      'Half of the caffeine in a 17:00 coffee is still in you at 23:00. You will ' +
      'fall asleep anyway, but the deep part of the night gets shorter.',
    apply: 'Move your last coffee to before 15:00 and compare how you wake up.',
    gloss: 'tail = cola · to fall asleep = dormirse · anyway = igualmente · deep = profundo',
  },
  {
    id: 'vic-sleep-winddown',
    topic: 'salud',
    lang: 'en',
    icon: '🎬',
    title: 'The post-match wind-down',
    body:
      'A late game leaves you wired for two hours. Reviewing clips in bed keeps ' +
      'the engine running. The analysis will be better tomorrow anyway.',
    apply: 'After a night match, no video and no phone for the last thirty minutes.',
    gloss: 'wired = activado · wind-down = bajada · clip = corte de vídeo · engine = motor',
  },
  {
    id: 'vic-sleep-nap',
    topic: 'salud',
    lang: 'en',
    icon: '🌤️',
    title: 'Nap short or not at all',
    body:
      'Twenty minutes before 15:00 restores attention. Forty minutes takes you ' +
      'into deep sleep, and you wake up worse than you lay down.',
    apply: 'Set a timer for twenty minutes and get up when it rings.',
    gloss: 'nap = siesta · to restore = recuperar · to lie down = tumbarse · to ring = sonar',
  },
  {
    id: 'vic-sleep-regular',
    topic: 'salud',
    lang: 'en',
    icon: '📅',
    title: 'Regularity beats quantity',
    body:
      'With a fixture list that moves every week, the same wake-up time is the ' +
      'only anchor you control. Keep that fixed and let the bedtime move.',
    apply: 'Pick one wake-up time and hold it for a week, including Sunday.',
    gloss: 'fixture list = calendario de partidos · anchor = ancla · bedtime = hora de acostarse',
  },

  /* ---------------------------------------------- nutrición */
  {
    id: 'vic-nutri-protein',
    topic: 'nutricion',
    lang: 'en',
    icon: '🍗',
    title: 'Protein at every meal',
    body:
      'Spreading protein across the day protects muscle better than one big ' +
      'evening portion. Roughly a palm-sized serving at each meal.',
    apply: 'Check today whether breakfast had any protein at all.',
    gloss: 'to spread = repartir · portion = ración · palm = palma · serving = porción',
  },
  {
    id: 'vic-nutri-away',
    topic: 'nutricion',
    lang: 'en',
    icon: '🚌',
    title: 'The away-game meal',
    body:
      'Late travel plus a service-station dinner is how a good week ends badly. ' +
      'What you carry with you decides what you eat at midnight.',
    apply: 'Pack fruit and nuts for the coach before the next away trip.',
    gloss: 'away game = partido fuera · service station = área de servicio · to pack = preparar',
  },
  {
    id: 'vic-nutri-hydration',
    topic: 'nutricion',
    lang: 'en',
    icon: '💧',
    title: 'You dehydrate on the touchline too',
    body:
      'Two hours standing, talking and in the sun costs more water than it feels. ' +
      'Thirst arrives after the drop in concentration, not before.',
    apply: 'Take a bottle to the touchline and finish it by the final whistle.',
    gloss: 'touchline = banda · drop = caída · bottle = botella · final whistle = pitido final',
  },
  {
    id: 'vic-nutri-plate',
    topic: 'nutricion',
    lang: 'en',
    icon: '🥗',
    title: 'Build the plate, do not count it',
    body:
      'Half vegetables, a quarter protein, a quarter whole carbohydrate. It ' +
      'travels better than any app: you can do it in a hotel buffet in five seconds.',
    apply: 'Use the rule at lunch today without weighing anything.',
    gloss: 'whole = integral · carbohydrate = hidrato · to weigh = pesar · buffet = bufé',
  },
  {
    id: 'vic-nutri-ultra',
    topic: 'nutricion',
    lang: 'en',
    icon: '🏷️',
    title: 'Read the list, not the claim',
    body:
      'The front of the packet sells; the ingredient list tells. Five ingredients ' +
      'or fewer, and names you would use at home, is a good filter.',
    apply: 'Turn one packet around today and read the list before buying it.',
    gloss: 'claim = reclamo · packet = paquete · ingredient = ingrediente · fewer = menos',
  },

  /* ------------------------------------- movimiento y fuerza */
  {
    id: 'vic-move-strength',
    topic: 'movimiento_fuerza',
    lang: 'en',
    icon: '🏋️',
    title: 'Two sessions is the floor',
    body:
      'Two strength sessions a week is the minimum that keeps muscle and bone ' +
      'from drifting down. It is a floor, not a target — and it fits any schedule.',
    apply: 'Put the two sessions in the calendar before the week fills up.',
    gloss: 'floor = suelo, mínimo · bone = hueso · to drift = irse cayendo · schedule = agenda',
  },
  {
    id: 'vic-move-zone2',
    topic: 'movimiento_fuerza',
    lang: 'en',
    icon: '🚴',
    title: 'Easy has to feel easy',
    body:
      'The base work is done at a pace where you could hold a conversation. Most ' +
      'people ruin it by going slightly too hard: too fast to recover, too slow to gain.',
    apply: 'On your next easy session, talk out loud to check the pace.',
    gloss: 'pace = ritmo · to hold = mantener · to ruin = arruinar · to gain = ganar',
  },
  {
    id: 'vic-move-steps',
    topic: 'movimiento_fuerza',
    lang: 'en',
    icon: '👟',
    title: 'The session is not the day',
    body:
      'Forty-five minutes of training plus ten hours sitting is still a sedentary ' +
      'day. What you do between sessions counts as much as the sessions.',
    apply: 'Walk the pitch perimeter twice while the players warm up.',
    gloss: 'sedentary = sedentario · pitch = campo · perimeter = perímetro · between = entre',
  },
  {
    id: 'vic-move-mobility',
    topic: 'movimiento_fuerza',
    lang: 'en',
    icon: '🤸',
    title: 'Mobility is insurance',
    body:
      'Ten minutes of hips, ankles and thoracic spine is dull and it is what keeps ' +
      'you training in six months. Prevention never feels urgent.',
    apply: 'Do ten minutes today while the video renders.',
    gloss: 'hip = cadera · ankle = tobillo · spine = columna · dull = aburrido',
  },
  {
    id: 'vic-move-busy',
    topic: 'movimiento_fuerza',
    lang: 'en',
    icon: '⏳',
    title: 'A short session beats a skipped one',
    body:
      'On a heavy fixture week, twenty minutes of the main lifts keeps the habit ' +
      'alive. The cost of stopping is not the session: it is the restart.',
    apply: 'When the day collapses, do the warm-up and two lifts and leave.',
    gloss: 'to skip = saltarse · lift = levantamiento · to collapse = venirse abajo · restart = rearranque',
  },

  /* ------------------------------------------- desarrollo */
  {
    id: 'vic-dev-deepwork',
    topic: 'desarrollo',
    lang: 'en',
    icon: '🎧',
    title: 'Protect one deep block',
    body:
      'Analysis done in ten interrupted pieces is not analysis. One protected ' +
      'ninety-minute block, phone in another room, is worth a whole afternoon.',
    apply: 'Block ninety minutes tomorrow and treat it like a training session.',
    gloss: 'deep work = trabajo profundo · block = bloque · to interrupt = interrumpir · worth = vale',
  },
  {
    id: 'vic-dev-writing',
    topic: 'desarrollo',
    lang: 'en',
    icon: '✍️',
    title: 'Write to find out what you think',
    body:
      'An idea feels finished in your head and falls apart on paper. Writing the ' +
      'session plan in full sentences is where the holes show up.',
    apply: 'Write tomorrow’s main idea as one sentence before you draw anything.',
    gloss: 'to fall apart = deshacerse · sentence = frase · hole = agujero · to show up = aparecer',
  },
  {
    id: 'vic-dev-reading',
    topic: 'desarrollo',
    lang: 'en',
    icon: '📖',
    title: 'Read outside the game',
    body:
      'Most new ideas in coaching arrive from somewhere else: teaching, medicine, ' +
      'the military, business. Reading only football narrows what you can copy.',
    apply: 'Pick one book this month that is not about football.',
    gloss: 'outside = fuera de · to narrow = estrechar · to copy = copiar · military = ejército',
  },
  {
    id: 'vic-dev-screens',
    topic: 'desarrollo',
    lang: 'en',
    icon: '📱',
    title: 'The phone is the fixture list',
    body:
      'Leisure scrolling eats the exact hours you would use for analysis, and it ' +
      'does not feel like a choice. Making it visible is most of the fix.',
    apply: 'Look at today’s screen time before you decide there was no time.',
    gloss: 'leisure = ocio · to scroll = deslizar · choice = elección · fix = arreglo',
  },
  {
    id: 'vic-dev-shutdown',
    topic: 'desarrollo',
    lang: 'en',
    icon: '🔕',
    title: 'A shutdown ritual',
    body:
      'Psychological detachment — actually stopping to think about work — is what ' +
      'predicts recovery, not the number of hours off. It needs a clear end line.',
    apply: 'Write tomorrow’s three tasks, close the laptop, and say it out loud.',
    gloss: 'detachment = desconexión · to predict = predecir · end line = línea de final',
  },

  /* ------------------------------------------- profesional */
  {
    id: 'vic-pro-session',
    topic: 'profesional',
    lang: 'en',
    icon: '📐',
    title: 'Session-planning English',
    body:
      'The words a session plan is written in: warm-up, rondo, small-sided game, ' +
      'drill, set-up, pitch size, work-to-rest ratio, coaching points, cool-down.',
    apply: 'Write tomorrow’s plan headings in English.',
    gloss:
      'small-sided game = partido reducido · drill = ejercicio · set-up = montaje · ' +
      'work-to-rest ratio = relación trabajo-descanso · cool-down = vuelta a la calma',
  },
  {
    id: 'vic-pro-feedback',
    topic: 'profesional',
    lang: 'en',
    icon: '📝',
    title: 'Feedback that lands',
    body:
      'Say what you saw, then what to do, then why it matters — in that order and ' +
      'in one breath: «You dropped in late. Show earlier. You buy yourself a metre.»',
    apply: 'Give one correction today in those three steps.',
    gloss: 'to land = calar · to drop in = caer entre líneas · to show = pedirla · breath = respiración',
  },
  {
    id: 'vic-pro-scouting',
    topic: 'profesional',
    lang: 'en',
    icon: '🔍',
    title: 'Scouting vocabulary',
    body:
      'The report words: back four, high line, press trigger, overload, switch of ' +
      'play, second ball, set piece, transition, half-space, cover shadow.',
    apply: 'Label the next rival clip with five of these terms.',
    gloss:
      'press trigger = señal de presión · overload = superioridad · switch of play = cambio de orientación · ' +
      'set piece = balón parado · half-space = intervalo · cover shadow = sombra de cobertura',
  },
  {
    id: 'vic-pro-teamtalk',
    topic: 'profesional',
    lang: 'en',
    icon: '🗣️',
    title: 'Three things, no more',
    body:
      'Under pressure a squad holds about three messages. A fourth does not add: ' +
      'it pushes one of the first three out.',
    apply: 'Write the team talk as three lines and cut anything else.',
    gloss: 'squad = plantilla · to hold = retener · to push out = expulsar · to cut = quitar',
  },
  {
    id: 'vic-pro-load',
    topic: 'profesional',
    lang: 'en',
    icon: '📈',
    title: 'Load-management English',
    body:
      'Reading the GPS report: total distance, high-speed running, accelerations, ' +
      'decelerations, player load, acute-to-chronic ratio, workload spike.',
    apply: 'Read one player’s report and say the numbers out loud in English.',
    gloss:
      'high-speed running = carrera de alta intensidad · acute-to-chronic = agudo-crónico · ' +
      'spike = pico · workload = carga de trabajo',
  },
  {
    id: 'vic-pro-oneonone',
    topic: 'profesional',
    lang: 'en',
    icon: '👤',
    title: 'The one-to-one that works',
    body:
      'Ask before you tell: «How did you see it?» first. The player who explains ' +
      'his own error changes; the one who is told about it defends himself.',
    apply: 'Open the next individual chat with a question, not a verdict.',
    gloss: 'one-to-one = charla individual · to tell = decir · error = error · to defend = defenderse',
  },
];

/* ---------------------------------------------------------------------------
 * María · en español
 * ------------------------------------------------------------------------- */

const MARIA_BONUSES: LearningBonus[] = [
  /* ---------------------------------------- sueño y descanso */
  {
    id: 'mar-sleep-anchor',
    topic: 'salud',
    lang: 'es',
    icon: '⏰',
    title: 'La hora de levantarse es el ancla',
    body:
      'De las dos horas —acostarse y levantarse—, la que ordena el reloj interno ' +
      'es la de levantarse. Si sólo se puede sostener una, que sea ésa.',
    apply: 'Fija la hora de despertar de mañana y respétala aunque hoy te acuestes tarde.',
  },
  {
    id: 'mar-sleep-wind',
    topic: 'salud',
    lang: 'es',
    icon: '🕯️',
    title: 'La última hora es la que decide',
    body:
      'El cuerpo no se apaga de golpe. Bajar luz, dejar el móvil fuera y hacer ' +
      'siempre lo mismo en los últimos sesenta minutos vale más que irse antes a la cama.',
    apply: 'Elige tres cosas para esa hora y hazlas hoy en el mismo orden.',
  },
  {
    id: 'mar-sleep-light',
    topic: 'salud',
    lang: 'es',
    icon: '🌅',
    title: 'Diez minutos de luz al levantarte',
    body:
      'La luz de exterior por la mañana —sin cristal de por medio— adelanta la ' +
      'melatonina de esa noche. Es lo más barato que existe para dormir mejor.',
    apply: 'Desayuna junto a la ventana abierta o baja a la calle diez minutos.',
  },
  {
    id: 'mar-sleep-worry',
    topic: 'salud',
    lang: 'es',
    icon: '📝',
    title: 'Sacar las vueltas de la cabeza',
    body:
      'Lo que da vueltas de noche casi nunca es urgente: es que no está anotado. ' +
      'Escribirlo antes de acostarte le quita al cerebro el trabajo de recordarlo.',
    apply: 'Deja una libreta en la mesilla y apunta lo pendiente antes de apagar.',
  },
  {
    id: 'mar-sleep-weekend',
    topic: 'salud',
    lang: 'es',
    icon: '📆',
    title: 'El jet lag del sábado',
    body:
      'Mover dos horas el horario el fin de semana equivale a cambiar de huso ' +
      'horario y volver: el lunes se paga entero.',
    apply: 'El sábado, levántate como mucho una hora más tarde de lo habitual.',
  },

  /* ---------------------------------------------- nutrición */
  {
    id: 'mar-nutri-protein',
    topic: 'nutricion',
    lang: 'es',
    icon: '🍳',
    title: 'La proteína, repartida',
    body:
      'Repartirla en las tres comidas conserva músculo mejor que concentrarla en ' +
      'la cena. A ojo: algo del tamaño de la palma en cada comida.',
    apply: 'Mira si el desayuno de hoy llevaba proteína; si no, añádele una.',
  },
  {
    id: 'mar-nutri-plate',
    topic: 'nutricion',
    lang: 'es',
    icon: '🥗',
    title: 'Montar el plato, no contarlo',
    body:
      'Medio plato de verdura, un cuarto de proteína y un cuarto de hidrato ' +
      'integral. Funciona en casa, en el bar y sin pesar nada.',
    apply: 'Aplica la regla en la comida de hoy sin cambiar el menú, sólo las proporciones.',
  },
  {
    id: 'mar-nutri-variety',
    topic: 'nutricion',
    lang: 'es',
    icon: '🌱',
    title: 'Treinta plantas a la semana',
    body:
      'Cuenta la variedad, no la cantidad: verduras, frutas, legumbres, frutos ' +
      'secos, semillas y especias suman. Es lo que más se relaciona con una microbiota sana.',
    apply: 'Cuenta cuántas plantas distintas llevas esta semana. Añade dos nuevas.',
  },
  {
    id: 'mar-nutri-labels',
    topic: 'nutricion',
    lang: 'es',
    icon: '🏷️',
    title: 'La lista manda, no el reclamo',
    body:
      'El frente del envase vende; la lista de ingredientes informa. Cinco ' +
      'ingredientes o menos, y con nombres de cocina, es un filtro que acierta casi siempre.',
    apply: 'Dale la vuelta a un envase hoy y lee la lista antes de comprarlo.',
  },
  {
    id: 'mar-nutri-water',
    topic: 'nutricion',
    lang: 'es',
    icon: '💧',
    title: 'La sed llega tarde',
    body:
      'Cuando aparece, ya se ha perdido rendimiento y concentración. En días de ' +
      'clase seguidas se bebe menos justo cuando más falta hace.',
    apply: 'Ten el vaso lleno a la vista en el escritorio antes de la primera clase.',
  },

  /* ------------------------------------- movimiento y fuerza */
  {
    id: 'mar-move-strength',
    topic: 'movimiento_fuerza',
    lang: 'es',
    icon: '🏋️',
    title: 'La fuerza es lo que no se recupera solo',
    body:
      'A partir de los treinta se pierde masa muscular y densidad ósea todos los ' +
      'años, salvo que se entrene. Dos sesiones por semana bastan para frenarlo.',
    apply: 'Pon las dos sesiones en el calendario antes de que se llene la semana.',
  },
  {
    id: 'mar-move-steps',
    topic: 'movimiento_fuerza',
    lang: 'es',
    icon: '👟',
    title: 'El día pesa más que la sesión',
    body:
      'Treinta minutos de ejercicio y nueve horas sentada siguen siendo un día ' +
      'sedentario. Lo que se mueve entre medias cuenta tanto como el entrenamiento.',
    apply: 'Levántate y anda cinco minutos entre clase y clase.',
  },
  {
    id: 'mar-move-short',
    topic: 'movimiento_fuerza',
    lang: 'es',
    icon: '⏳',
    title: 'Veinte minutos ganan a cero',
    body:
      'El coste de saltarse una semana no es esa semana: es volver a arrancar. ' +
      'Una sesión corta mantiene viva la costumbre, que es lo que de verdad se protege.',
    apply: 'Cuando el día se tuerza, haz el calentamiento y dos ejercicios, y déjalo.',
  },
  {
    id: 'mar-move-posture',
    topic: 'movimiento_fuerza',
    lang: 'es',
    icon: '🪑',
    title: 'Dar clase también es postura',
    body:
      'Cuatro horas de auriculares y pantalla cargan cuello y trapecios. No se ' +
      'arregla con una silla mejor: se arregla moviéndose antes de que duela.',
    apply: 'Cada hora, treinta segundos de hombros, cuello y mirada lejos.',
  },
  {
    id: 'mar-move-easy',
    topic: 'movimiento_fuerza',
    lang: 'es',
    icon: '🚶',
    title: 'Que lo suave sea suave',
    body:
      'El paseo o la bici de base se hacen a un ritmo en el que se puede hablar. ' +
      'Ir un poco más fuerte de la cuenta cansa sin dar el beneficio de ninguno de los dos.',
    apply: 'En el próximo paseo, comprueba que puedes mantener una conversación.',
  },

  /* ------------------------------------------- desarrollo */
  {
    id: 'mar-dev-writing',
    topic: 'desarrollo',
    lang: 'es',
    icon: '✍️',
    title: 'Escribir es pensar despacio',
    body:
      'Una idea parece redonda en la cabeza y se deshace en el papel. Escribirla ' +
      'entera es donde aparecen los huecos, y es la parte que más enseña.',
    apply: 'Escribe hoy un párrafo entero sin corregir hasta el punto final.',
  },
  {
    id: 'mar-dev-reading',
    topic: 'desarrollo',
    lang: 'es',
    icon: '📖',
    title: 'Leer con una pregunta',
    body:
      'Abrir el libro sabiendo qué quieres averiguar cambia lo que retienes: se ' +
      'lee buscando, no dejándose llevar.',
    apply: 'Antes de abrir el libro de esta noche, escribe la pregunta.',
  },
  {
    id: 'mar-dev-screens',
    topic: 'desarrollo',
    lang: 'es',
    icon: '📱',
    title: 'El scroll se come lo que dices que no tienes',
    body:
      'El ocio de pantalla ocupa justo las horas que faltan para leer o escribir, ' +
      'y no se siente como una decisión. Verlo en un número ya cambia bastante.',
    apply: 'Mira el tiempo de pantalla de hoy antes de decidir que no hubo tiempo.',
  },
  {
    id: 'mar-dev-journal',
    topic: 'desarrollo',
    lang: 'es',
    icon: '📔',
    title: 'Tres líneas bastan',
    body:
      'El diario que se sostiene no es el largo: es el corto. Qué pasó, qué ' +
      'sentí, qué haría distinto. En tres líneas se puede hacer todos los días.',
    apply: 'Escribe las tres líneas de hoy antes de cerrar el portátil.',
  },
  {
    id: 'mar-dev-twominutes',
    topic: 'desarrollo',
    lang: 'es',
    icon: '⏱️',
    title: 'Dos minutos para empezar',
    body:
      'Lo difícil no es la tarea, es arrancar. Comprometerse sólo a dos minutos ' +
      'desactiva la resistencia; casi siempre se sigue, y si no, ya son dos.',
    apply: 'Empieza por lo que más pereza te dé, con dos minutos de reloj.',
  },

  /* ------------------------------ profesional · aula de español */
  {
    id: 'mar-pro-correction',
    topic: 'profesional',
    lang: 'es',
    icon: '✅',
    title: 'Corregir sin cortar',
    body:
      'Interrumpir para corregir corta la fluidez y enseña poco. Se apunta y se ' +
      'devuelve al final, en bloque y sin señalar a nadie: se retiene más y se habla más.',
    apply: 'En la próxima clase, apunta tres errores y trátalos al cerrar.',
  },
  {
    id: 'mar-pro-recast',
    topic: 'profesional',
    lang: 'es',
    icon: '🔁',
    title: 'Reformular en vez de corregir',
    body:
      'Si dice «ayer voy al cine», responder «ah, ¿ayer fuiste al cine?» devuelve ' +
      'la forma correcta sin romper la conversación. Se llama reformulación y funciona.',
    apply: 'Reformula tres veces hoy en lugar de corregir de frente.',
  },
  {
    id: 'mar-pro-wait',
    topic: 'profesional',
    lang: 'es',
    icon: '⏳',
    title: 'Los tres segundos de espera',
    body:
      'Tras una pregunta, la mayoría de los profesores espera menos de un segundo. ' +
      'Aguantar tres cambia quién responde y cuánto: hablan los que normalmente callan.',
    apply: 'Cuenta hasta tres en silencio después de preguntar, hoy, en cada clase.',
  },
  {
    id: 'mar-pro-spacing',
    topic: 'profesional',
    lang: 'es',
    icon: '🗂️',
    title: 'Repasar antes de que se olvide',
    body:
      'El vocabulario aguanta si vuelve a aparecer cuando está a punto de caerse: ' +
      'al día siguiente, a la semana, al mes. Repetirlo el mismo día no sirve de mucho.',
    apply: 'Empieza la clase de hoy con cinco palabras de la clase anterior.',
  },
  {
    id: 'mar-pro-voice',
    topic: 'profesional',
    lang: 'es',
    icon: '🗣️',
    title: 'La voz es la herramienta',
    body:
      'Hablar cuatro horas seguidas sin beber ni callar es lo que acaba en afonía. ' +
      'El descanso de la voz no es tiempo perdido: es mantenimiento del instrumento.',
    apply: 'Agua a mano y dos minutos de silencio entre clase y clase.',
  },
  {
    id: 'mar-pro-visible',
    topic: 'profesional',
    lang: 'es',
    icon: '📣',
    title: 'Enseñar en público capta',
    body:
      'Lo que mejor atrae alumnos no es anunciarse: es enseñar algo útil y gratis. ' +
      'Un truco de gramática bien contado hace más que diez publicaciones de oferta.',
    apply: 'Convierte la duda que más se repitió esta semana en una publicación.',
  },
];

/* ---------------------------------------------------------------------------
 * Familia · en español, apoyado en el criterio de la sección
 * ------------------------------------------------------------------------- */

const FAMILIA_BONUSES: LearningBonus[] = [
  /* ------------------------------------ rutinas en familia */
  {
    id: 'fam-rut-order',
    topic: 'rutinas',
    lang: 'es',
    icon: '🌜',
    title: 'La señal es el orden, no el reloj',
    body:
      'Cena, ducha, cuento, luz fuera. Álvaro Bilbao lo explica bien: el cerebro ' +
      'del niño anticipa la secuencia y se va apagando con ella. Cuando el orden ' +
      'cambia cada noche, no hay nada que anticipar y toca pelear.',
    apply: 'Escribid los cuatro pasos y ponedlos donde los peques los vean.',
  },
  {
    id: 'fam-rut-table',
    topic: 'rutinas',
    lang: 'es',
    icon: '🍽️',
    title: 'En la mesa se pregunta, no se interroga',
    body:
      'Faber y Mazlish: «¿qué tal el cole?» cierra; «cuéntame algo que te haya ' +
      'hecho gracia hoy» abre. Y la mesa no es el sitio de corregir el día: eso ' +
      'convierte la comida en algo que se quiere terminar pronto.',
    apply: 'Haced hoy una pregunta abierta y aguantad el silencio sin rellenarlo.',
  },
  {
    id: 'fam-rut-limits',
    topic: 'rutinas',
    lang: 'es',
    icon: '🧱',
    title: 'Firme en el límite, suave en la forma',
    body:
      'Baumrind lo midió hace décadas y sigue en pie: el estilo que mejor ' +
      'funciona es exigente y cálido a la vez. Ni ceder por cansancio ni imponer ' +
      'por volumen. El límite no se negocia; el tono sí se cuida.',
    apply: 'Elige un límite de esta semana y sostenlo sin levantar la voz.',
  },
  {
    id: 'fam-rut-chores',
    topic: 'rutinas',
    lang: 'es',
    icon: '🧹',
    title: 'Las tareas de casa enseñan autonomía',
    body:
      'Silvia Álava recuerda que poner la mesa o hacerse la mochila no es ayudar ' +
      'a los padres: es aprender a valerse. A los 8 y 9 años cabe bastante más ' +
      'de lo que solemos pedir.',
    apply: 'Dad una tarea nueva esta semana y no la repaséis después.',
  },
  {
    id: 'fam-rut-council',
    topic: 'rutinas',
    lang: 'es',
    icon: '🗣️',
    title: 'Los problemas se resuelven en frío y con ellos',
    body:
      'Ross Greene lo reduce a tres pasos: qué está pasando (que lo cuente el ' +
      'niño), qué nos preocupa a nosotros, y qué probamos que sirva a los dos. ' +
      'En caliente no se resuelve nada; en el consejo del domingo, sí.',
    apply: 'Llevad al consejo de familia el conflicto que más se repitió esta semana.',
  },
  {
    id: 'fam-rut-weekend',
    topic: 'rutinas',
    lang: 'es',
    icon: '🌞',
    title: 'El finde es donde se descuadra la semana',
    body:
      'Dos horas de desfase el sábado se pagan el lunes en casa entera: peor ' +
      'humor, peor desayuno, peor colegio. No hace falta un finde rígido, basta ' +
      'con un ancla: la hora de levantarse.',
    apply: 'Poned una sola regla de finde y mantenedla las cuatro semanas.',
  },

  /* --------------------------------------- tiempo juntos */
  {
    id: 'fam-tj-play',
    topic: 'tiempo_juntos',
    lang: 'es',
    icon: '🎲',
    title: 'Jugar es donde se enseña a perder',
    body:
      'Silvia Álava: en el juego se entrenan esperar turno, negociar y encajar la ' +
      'derrota sin que parezca una lección. Con dos hermanos deportistas, es el ' +
      'laboratorio más barato que hay en casa.',
    apply: 'Jugad hoy a algo con reglas y dejad que la partida termine mal alguna vez.',
  },
  {
    id: 'fam-tj-praise',
    topic: 'tiempo_juntos',
    lang: 'es',
    icon: '🌱',
    title: 'Elogiar lo que se puede repetir',
    body:
      'Kazdin lo concreta: el refuerzo funciona si es inmediato, concreto y ' +
      'describe la conducta. «Has ido a entrenar los tres días aunque llovía» se ' +
      'puede repetir; «eres un fenómeno» no le dice qué hacer mañana.',
    apply: 'Decid hoy en voz alta una conducta concreta de cada uno.',
  },
  {
    id: 'fam-tj-story',
    topic: 'tiempo_juntos',
    lang: 'es',
    icon: '📚',
    title: 'Contar lo que pasó lo ordena',
    body:
      'Daniel Siegel lo llama nombrar para domar: poner en palabras un día malo ' +
      'baja su intensidad. Por eso el rato de leer o comentar la peli vale doble, ' +
      'y por eso salen ahí las cosas que no salen en la mesa.',
    apply: 'Después del cuento, preguntad qué fue lo peor del día y no lo arregléis.',
  },
  {
    id: 'fam-tj-calm',
    topic: 'tiempo_juntos',
    lang: 'es',
    icon: '💛',
    title: 'Se regulan prestado',
    body:
      'Rafa Guerrero: el niño no sabe calmarse solo hasta bastante tarde; toma ' +
      'prestada la calma del adulto que tiene delante. Cuando el ambiente de casa ' +
      'baja, el primer termostato somos nosotros.',
    apply: 'Antes de responder a un grito, respira una vez entera. Sólo eso.',
  },
  {
    id: 'fam-tj-outdoors',
    topic: 'tiempo_juntos',
    lang: 'es',
    icon: '🌳',
    title: 'Aire libre y aburrimiento',
    body:
      'La salida al exterior suma luz, movimiento y menos pantalla de una vez, y ' +
      'protege la vista. Pero lo que más entrena es el rato sin actividad ' +
      'dirigida: de ahí sale la iniciativa.',
    apply: 'Salid una hora sin plan y sin proponer nada durante los diez primeros minutos.',
  },
  {
    id: 'fam-tj-nopunish',
    topic: 'tiempo_juntos',
    lang: 'es',
    icon: '🕊️',
    title: 'Reconocer y redirigir',
    body:
      'UNICEF resume la crianza positiva en eso: señalar lo que sí, redirigir lo ' +
      'que no, y dejar fuera el castigo físico y la humillación. No es blandura: ' +
      'es lo único que enseña la conducta que quieres ver mañana.',
    apply: 'Cambiad hoy un «no hagas eso» por un «haz esto otro» y ved qué pasa.',
  },
];

/* ---------------------------------------------------------------------------
 * Pareja · en español
 * ------------------------------------------------------------------------- */

const PAREJA_BONUSES: LearningBonus[] = [
  /* ---------------------------------------- tiempo a solas */
  {
    id: 'par-ts-novelty',
    topic: 'tiempo_solas',
    lang: 'es',
    icon: '✨',
    title: 'Que la cita sea algo nuevo',
    body:
      'Arthur Aron lo comprobó: compartir actividades novedosas —no las de ' +
      'siempre— reaviva la sensación de cercanía mucho más que repetir el plan ' +
      'cómodo. El cine de todos los viernes no cuenta como cita.',
    apply: 'Que la próxima cita sea algo que ninguno de los dos haya hecho antes.',
  },
  {
    id: 'par-ts-walk',
    topic: 'tiempo_solas',
    lang: 'es',
    icon: '🌆',
    title: 'Caminando se habla distinto',
    body:
      'Bolinches recomienda sacar de casa lo que en casa se enquista: fuera del ' +
      'escenario del conflicto, sin mirarse a la cara y en movimiento, salen ' +
      'conversaciones que en el salón no salen.',
    apply: 'Sacad a la calle el tema que lleváis dos semanas evitando.',
  },
  {
    id: 'par-ts-presence',
    topic: 'tiempo_solas',
    lang: 'es',
    icon: '📵',
    title: 'La presencia a medias cuenta como ausencia',
    body:
      'Media hora entera vale más que una tarde de sofá con dos pantallas ' +
      'distintas. No es el tiempo que estáis juntos: es el tiempo en que el otro ' +
      'nota que estáis.',
    apply: 'Dejad los dos móviles en otra habitación durante media hora.',
  },
  {
    id: 'par-ts-desire',
    topic: 'tiempo_solas',
    lang: 'es',
    icon: '🔥',
    title: 'El deseo necesita algo de distancia',
    body:
      'Esther Perel lo formula así: el amor quiere cercanía y el deseo necesita ' +
      'espacio. Tener vida propia que contar —un plan, un amigo, una afición— es ' +
      'parte de lo que mantiene el interés, no lo contrario.',
    apply: 'Contad esta semana algo que hayáis hecho por separado.',
  },
  {
    id: 'par-ts-expect',
    topic: 'tiempo_solas',
    lang: 'es',
    icon: '⚖️',
    title: 'O se le pide menos, o se le dedica más',
    body:
      'Finkel lo mide: hoy esperamos de la pareja lo que antes se repartía entre ' +
      'familia, amigos y comunidad. Esa exigencia sólo se sostiene con tiempo de ' +
      'verdad; si no lo hay, lo honesto es bajar lo que se le pide.',
    apply: 'Elegid: o media hora más a la semana, o una expectativa menos.',
  },
  {
    id: 'par-ts-places',
    topic: 'tiempo_solas',
    lang: 'es',
    icon: '🧭',
    title: 'Cada uno en su sitio',
    body:
      'Joan Garriga insiste en que muchos roces no son de pareja: son de lugares. ' +
      'Cuando uno hace de padre del otro, o los hijos ocupan el centro, la pareja ' +
      'se queda sin sitio propio y lo reclama en discusiones que van de otra cosa.',
    apply: 'Preguntaos qué hacéis los dos juntos que no tenga que ver con los niños.',
  },

  /* ------------------------------------ conexión y rutinas */
  {
    id: 'par-con-checkin',
    topic: 'conexion',
    lang: 'es',
    icon: '💬',
    title: 'Diez minutos que no sean logística',
    body:
      'Gottman lo llama charla de reencuentro: al terminar el día, hablar de todo ' +
      'menos de niños, dinero y agenda. Sue Johnson explica el fondo: lo que se ' +
      'pregunta cada día es «¿sigues ahí?», y basta con contestar que sí.',
    apply: 'Diez minutos hoy con una regla: prohibido hablar de logística.',
  },
  {
    id: 'par-con-ratio',
    topic: 'conexion',
    lang: 'es',
    icon: '🙏',
    title: 'Cinco a uno, también en los días malos',
    body:
      'Las parejas que duran mantienen unas cinco interacciones positivas por ' +
      'cada negativa. No son gestos grandes: es dar las gracias, tocar al pasar, ' +
      'contestar de buenas a una pregunta tonta.',
    apply: 'Contad hoy los gestos buenos. Si no llegan a cinco, añadid los que falten.',
  },
  {
    id: 'par-con-repair',
    topic: 'conexion',
    lang: 'es',
    icon: '🩹',
    title: 'Pactad la señal antes de necesitarla',
    body:
      'Markman, del programa PREP: lo que salva una discusión es haber acordado ' +
      'en frío una palabra para parar y una hora para retomarla. En caliente ' +
      'nadie inventa eso, y el que pide parar parece que huye.',
    apply: 'Elegid hoy la palabra y la norma: quien la dice, fija cuándo se retoma.',
  },
  {
    id: 'par-con-complaint',
    topic: 'conexion',
    lang: 'es',
    icon: '🗨️',
    title: 'Queja sí, reproche no',
    body:
      'Gottman separa las dos: la queja habla de un hecho y de lo que necesitas ' +
      '(«ayer no avisaste y me organicé mal; avísame»); el reproche habla de cómo ' +
      'es el otro («nunca avisas»). La primera se puede resolver.',
    apply: 'Convierte el próximo «nunca» o «siempre» en un hecho y una petición.',
  },
  {
    id: 'par-con-selfworth',
    topic: 'conexion',
    lang: 'es',
    icon: '🌿',
    title: 'Primero uno, luego dos',
    body:
      'Bolinches lo repite: no se quiere bien desde la carencia. Y Silvia Congost ' +
      'avisa del reverso: aguantar por miedo a la soledad no es amor, es ' +
      'dependencia, y se nota en que la sintonía lleva meses plana y nadie dice nada.',
    apply: 'Cada uno, algo suyo esta semana. Y decidlo en voz alta al otro.',
  },
  {
    id: 'par-con-plan',
    topic: 'conexion',
    lang: 'es',
    icon: '📆',
    title: 'La carga mental es la que no se ve',
    body:
      'Lo agotador no es hacer las cosas: es ser el único que las recuerda. ' +
      'Poner la semana por escrito entre los dos saca esa lista de una sola ' +
      'cabeza, y con ella las cuentas pendientes que se cobran en otra discusión.',
    apply: 'Quince minutos el domingo con la semana delante y un reparto escrito.',
  },
];

/* ---------------------------------------------------------------------------
 * Catálogo por perfil
 * ------------------------------------------------------------------------- */

const BONUSES: Partial<Record<ProfileId, LearningBonus[]>> = {
  // Leo y Hugo comparten catálogo: la rotación va sembrada con el perfil, así
  // que el mismo día no les toca el mismo bonus.
  leo: KID_BONUSES,
  hugo: KID_BONUSES,
  maria: MARIA_BONUSES,
  victor: VICTOR_BONUSES,
  familia: FAMILIA_BONUSES,
  pareja: PAREJA_BONUSES,
};

/** `true` si ese perfil recibe bonus del día. */
export function hasLearningBonus(profileId: ProfileId): boolean {
  return (BONUSES[profileId]?.length ?? 0) > 0;
}

/* ---------------------------------------------------------------------------
 * Dónde está el interés
 * ------------------------------------------------------------------------- */

/**
 * Categorías del perfil ordenadas por cuánto se registra en ellas durante las
 * últimas dos semanas. Es la definición operativa de «en qué ponemos interés»:
 * no lo que se dice que importa, sino donde se rellenan casillas.
 */
function byInterest(
  profile: Profile,
  entries: Record<string, DayEntry>,
  date: DateKey,
): { ranked: HabitCategory[]; anyData: boolean } {
  const categories = getCategories(profile.id);
  const filled = new Map<string, number>(categories.map((category) => [category.id, 0]));
  let anyData = false;

  for (let i = 0; i < WINDOW; i += 1) {
    const entry = entries[`${profile.id}:${addDays(date, -i)}`];
    if (!entry) continue;

    for (const category of categories) {
      let count = 0;
      for (const metric of category.metrics) {
        if (entry.values[metric.id] !== undefined) count += 1;
      }
      if (count > 0) anyData = true;
      filled.set(category.id, (filled.get(category.id) ?? 0) + count);
    }
  }

  // Empates por identificador: el orden no puede depender del día, o el bonus
  // saltaría de tema sin motivo.
  const ranked = [...categories].sort((a, b) => {
    const diff = (filled.get(b.id) ?? 0) - (filled.get(a.id) ?? 0);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  return { ranked, anyData };
}

/** Días transcurridos desde la época, para rotar el catálogo sin guardar nada. */
function dayNumber(date: DateKey): number {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 86_400_000);
}

/* ---------------------------------------------------------------------------
 * El bonus del día
 * ------------------------------------------------------------------------- */

/**
 * El bonus de hoy para este perfil, o `null` si no le toca ninguno.
 *
 * Sale de la categoría en la que más se está registrando, y dentro de ella
 * rota por días: el catálogo entero de ese tema se recorre antes de repetir
 * ninguno. Sin datos todavía, se empieza por la primera categoría.
 */
export function learningFor(
  profile: Profile,
  entries: Record<string, DayEntry>,
  date: DateKey,
): DailyLearning | null {
  const catalogue = BONUSES[profile.id];
  if (!catalogue || catalogue.length === 0) return null;

  const { ranked, anyData } = byInterest(profile, entries, date);
  const day = dayNumber(date);

  // Sólo las categorías con catálogo entran en el sorteo: una categoría sin
  // bonus escritos no puede dejar el día sin regalo.
  const candidates = ranked
    .map((category) => ({
      category,
      pool: catalogue.filter((bonus) => bonus.topic === category.id),
    }))
    .filter((entry) => entry.pool.length > 0);

  if (candidates.length === 0) return null;

  // Manda el interés, pero no hasta el aburrimiento: dos días del tema que
  // más se registra y uno del segundo. Sin esto, quien siempre rellena lo
  // mismo se quedaría meses dentro de una sola categoría.
  const pick = candidates.length > 1 && day % 3 === 2 ? candidates[1] : candidates[0];
  const offset = hashSeed(`${profile.id}:${pick.category.id}`);
  const bonus = pick.pool[(day + offset) % pick.pool.length];

  return {
    bonus,
    topicLabel: pick.category.label,
    topicIcon: pick.category.icon,
    fromInterest: anyData,
  };
}
