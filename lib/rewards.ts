import { buildChallengeWeek, hashSeed } from '@/lib/challenges';
import { addDays, startOfWeek, weekKeys } from '@/lib/dates';
import type {
  ChallengeTier,
  CromoReward,
  DateKey,
  DayEntry,
  FraseReward,
  Profile,
  ProfileId,
  Reward,
  RewardKind,
  UnlockedReward,
} from '@/types';

/* =========================================================================
 *  Recompensas — el regalo que deja cada reto superado.
 *
 *  Leo y Hugo coleccionan cromos: LaLiga, leyendas del fútbol y los de
 *  Oliver y Benji. María colecciona frases: de familia, para ella y de aula.
 *  La rareza va pegada al nivel del reto, así que el cromo de leyenda sólo
 *  cae con un reto de máximo esfuerzo.
 *
 *  Como los retos, las recompensas **no se guardan**: se deducen del
 *  historial, de modo que el álbum se reconstruye solo desde los registros.
 *  Cada perfil baraja su mazo con su propia semilla: Leo y Hugo no reciben
 *  los cromos en el mismo orden.
 *
 *  Los mazos son catálogo editable, igual que `lib/habits.ts`: añadir un
 *  cromo o una frase es añadir un objeto a la lista que le toca.
 * ========================================================================= */

/** Tope de semanas que se recorren hacia atrás al reconstruir el álbum. */
const MAX_WEEKS = 26;

/**
 * Identificador con el que se anota el premio de semana completa. No es un
 * reto de verdad, así que no cuelga de ninguna tarjeta: se enseña aparte.
 */
export const WEEKLY_CHALLENGE_ID = 'semana-completa';

/* ---------------------------------------------------------------------------
 * Cromos · nivel «cimiento»: LaLiga
 * ------------------------------------------------------------------------- */

const LIGA: CromoReward[] = [
  {
    kind: 'cromo',
    id: 'yamal',
    name: 'Lamine Yamal',
    team: 'FC Barcelona',
    position: 'Extremo',
    emblem: '🎯',
    dato: 'Zurda desde la banda derecha y un regate que no avisa.',
    lema: 'Atrévete al uno contra uno aunque falles el primero.',
    rarity: 'liga',
  },
  {
    kind: 'cromo',
    id: 'pedri',
    name: 'Pedri',
    team: 'FC Barcelona',
    position: 'Centrocampista',
    emblem: '🧠',
    dato: 'Ve el pase antes de que exista el hueco.',
    lema: 'Mira alrededor antes de que te llegue el balón.',
    rarity: 'liga',
  },
  {
    kind: 'cromo',
    id: 'vinicius',
    name: 'Vinícius Júnior',
    team: 'Real Madrid',
    position: 'Extremo',
    emblem: '⚡',
    dato: 'Encara una y otra vez sin cansarse de intentarlo.',
    lema: 'Un regate fallado no se pierde: se aprende.',
    rarity: 'liga',
  },
  {
    kind: 'cromo',
    id: 'bellingham',
    name: 'Jude Bellingham',
    team: 'Real Madrid',
    position: 'Centrocampista',
    emblem: '🚀',
    dato: 'Llega al área desde atrás cuando nadie le espera.',
    lema: 'Corre el metro que nadie ve; ahí están los goles.',
    rarity: 'liga',
  },
  {
    kind: 'cromo',
    id: 'carvajal',
    name: 'Dani Carvajal',
    team: 'Real Madrid',
    position: 'Lateral',
    emblem: '🛡️',
    dato: 'Sube, baja y aparece en las noches importantes.',
    lema: 'El trabajo callado también levanta copas.',
    rarity: 'liga',
  },
  {
    kind: 'cromo',
    id: 'griezmann',
    name: 'Antoine Griezmann',
    team: 'Atlético de Madrid',
    position: 'Delantero',
    emblem: '🎩',
    dato: 'Marca, asiste y vuelve a defender.',
    lema: 'Jugar para el equipo te hace más grande, no más pequeño.',
    rarity: 'liga',
  },
  {
    kind: 'cromo',
    id: 'oblak',
    name: 'Jan Oblak',
    team: 'Atlético de Madrid',
    position: 'Portero',
    emblem: '🧤',
    dato: 'Coloca el cuerpo antes de tener que tirarse.',
    lema: 'La buena posición ahorra la mitad de los esfuerzos.',
    rarity: 'liga',
  },
  {
    kind: 'cromo',
    id: 'nico-williams',
    name: 'Nico Williams',
    team: 'Athletic Club',
    position: 'Extremo',
    emblem: '💨',
    dato: 'Desborde y velocidad por la banda izquierda.',
    lema: 'La velocidad se entrena; la valentía se decide.',
    rarity: 'liga',
  },
  {
    kind: 'cromo',
    id: 'inaki-williams',
    name: 'Iñaki Williams',
    team: 'Athletic Club',
    position: 'Delantero',
    emblem: '🦾',
    dato: 'Célebre por no faltar nunca a una cita con su equipo.',
    lema: 'Estar siempre disponible también es un talento.',
    rarity: 'liga',
  },
  {
    kind: 'cromo',
    id: 'unai-simon',
    name: 'Unai Simón',
    team: 'Athletic Club',
    position: 'Portero',
    emblem: '🦶',
    dato: 'Portero que juega con los pies como un centrocampista.',
    lema: 'Aprende algo que nadie espera de tu puesto.',
    rarity: 'liga',
  },
  {
    kind: 'cromo',
    id: 'oyarzabal',
    name: 'Mikel Oyarzabal',
    team: 'Real Sociedad',
    position: 'Delantero',
    emblem: '🎯',
    dato: 'Marcó el gol que dio a España la Eurocopa de 2024.',
    lema: 'Los momentos grandes son de quien llegó preparado.',
    rarity: 'liga',
  },
  {
    kind: 'cromo',
    id: 'aspas',
    name: 'Iago Aspas',
    team: 'Celta de Vigo',
    position: 'Delantero',
    emblem: '🐟',
    dato: 'El capitán que eligió triunfar en casa.',
    lema: 'Ser fiel a los tuyos también es ganar.',
    rarity: 'liga',
  },
];

/* ---------------------------------------------------------------------------
 * Cromos · nivel «reto»: estrellas y secundarios de Oliver y Benji
 * ------------------------------------------------------------------------- */

const ESTRELLA: CromoReward[] = [
  {
    kind: 'cromo',
    id: 'mbappe',
    name: 'Kylian Mbappé',
    team: 'Real Madrid',
    position: 'Delantero',
    emblem: '⚡',
    dato: 'Cuando arranca, el partido cambia de velocidad.',
    lema: 'Correr mucho sirve de poco si no eliges bien cuándo.',
    rarity: 'estrella',
  },
  {
    kind: 'cromo',
    id: 'lewandowski',
    name: 'Robert Lewandowski',
    team: 'FC Barcelona',
    position: 'Delantero',
    emblem: '🎯',
    dato: 'Hace fácil lo difícil dentro del área.',
    lema: 'El gesto se repite hasta que sale solo.',
    rarity: 'estrella',
  },
  {
    kind: 'cromo',
    id: 'courtois',
    name: 'Thibaut Courtois',
    team: 'Real Madrid',
    position: 'Portero',
    emblem: '🧱',
    dato: 'Un muro en las noches grandes de Europa.',
    lema: 'El portero se hace en los partidos difíciles.',
    rarity: 'estrella',
  },
  {
    kind: 'cromo',
    id: 'julian-alvarez',
    name: 'Julián Álvarez',
    team: 'Atlético de Madrid',
    position: 'Delantero',
    emblem: '🕷️',
    dato: 'La Araña: aparece donde nadie le espera.',
    lema: 'Muévete sin balón y el balón te encontrará.',
    rarity: 'estrella',
  },
  {
    kind: 'cromo',
    id: 'isco',
    name: 'Isco',
    team: 'Real Betis',
    position: 'Centrocampista',
    emblem: '🎩',
    dato: 'Fútbol de toque con la cabeza siempre levantada.',
    lema: 'Levanta la cabeza antes de recibir, no después.',
    rarity: 'estrella',
  },
  {
    kind: 'cromo',
    id: 'gavi',
    name: 'Gavi',
    team: 'FC Barcelona',
    position: 'Centrocampista',
    emblem: '🔥',
    dato: 'Presión, carácter y ni un balón dado por perdido.',
    lema: 'El esfuerzo se contagia al de al lado.',
    rarity: 'estrella',
  },
  {
    kind: 'cromo',
    id: 'tom-baker',
    name: 'Tom Baker',
    team: 'New Team · Oliver y Benji',
    position: 'Centrocampista',
    emblem: '🌪️',
    dato: 'El niño del viento, la otra mitad de la dupla de oro.',
    lema: 'Los mejores nunca juegan solos.',
    rarity: 'estrella',
  },
  {
    kind: 'cromo',
    id: 'julian-ross',
    name: 'Julian Ross',
    team: 'Musashi · Oliver y Benji',
    position: 'Centrocampista',
    emblem: '💙',
    dato: 'Jugaba con el corazón, y con el corazón delicado.',
    lema: 'Escuchar al cuerpo también es entrenar.',
    rarity: 'estrella',
  },
  {
    kind: 'cromo',
    id: 'bruce-harper',
    name: 'Bruce Harper',
    team: 'New Team · Oliver y Benji',
    position: 'Defensa',
    emblem: '🛡️',
    dato: 'El más trabajador del equipo, aunque no el más técnico.',
    lema: 'El que no se rinde siempre acaba jugando.',
    rarity: 'estrella',
  },
  {
    kind: 'cromo',
    id: 'andy-johnson',
    name: 'Andy Johnson',
    team: 'Furano · Oliver y Benji',
    position: 'Centrocampista',
    emblem: '🐗',
    dato: 'El jabalí salvaje: entrenaba en la nieve.',
    lema: 'Entrenar cuando nadie mira es la ventaja.',
    rarity: 'estrella',
  },
  {
    kind: 'cromo',
    id: 'alan-crocker',
    name: 'Alan Crocker',
    team: 'Toho · Oliver y Benji',
    position: 'Portero',
    emblem: '🥋',
    dato: 'Portero de kárate: paraba con las manos y con los pies.',
    lema: 'Lo que aprendes en otro deporte te sirve en el tuyo.',
    rarity: 'estrella',
  },
  {
    kind: 'cromo',
    id: 'patty',
    name: 'Patty Gatsby',
    team: 'New Team · Oliver y Benji',
    position: 'Apoyo',
    emblem: '📣',
    dato: 'Sostenía al equipo desde fuera del campo.',
    lema: 'Los partidos también se ganan desde el banquillo.',
    rarity: 'estrella',
  },
];

/* ---------------------------------------------------------------------------
 * Cromos · nivel «máximo esfuerzo»: leyendas y protagonistas
 * ------------------------------------------------------------------------- */

const LEYENDA: CromoReward[] = [
  {
    kind: 'cromo',
    id: 'di-stefano',
    name: 'Alfredo Di Stéfano',
    team: 'Real Madrid',
    position: 'Delantero total',
    emblem: '👑',
    dato: 'La Saeta Rubia: defendía, creaba y marcaba en el mismo partido.',
    lema: 'Aprende a jugar en todos los sitios del campo.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'maradona',
    name: 'Diego Armando Maradona',
    team: 'Argentina',
    position: 'Enganche',
    emblem: '🔟',
    dato: 'La zurda más famosa de la historia del fútbol.',
    lema: 'El talento sin equipo no gana nada.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'pele',
    name: 'Pelé',
    team: 'Brasil',
    position: 'Delantero',
    emblem: '👑',
    dato: 'Tres Mundiales y un solo apodo: O Rei.',
    lema: 'El primero en llegar al entrenamiento.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'cruyff',
    name: 'Johan Cruyff',
    team: 'Países Bajos',
    position: 'Delantero y entrenador',
    emblem: '🧠',
    dato: 'Inventó un regate y una forma de entender el juego.',
    lema: 'Jugar bien cuesta más que correr mucho.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'ronaldo',
    name: 'Ronaldo Nazário',
    team: 'Brasil',
    position: 'Delantero',
    emblem: '💫',
    dato: 'El Fenómeno: potencia, elástica y vuelta tras cada lesión.',
    lema: 'Volver de una lesión también se entrena.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'ronaldinho',
    name: 'Ronaldinho',
    team: 'Brasil',
    position: 'Extremo',
    emblem: '😄',
    dato: 'Jugaba sonriendo y nadie adivinaba qué haría después.',
    lema: 'Disfrutar forma parte del rendimiento.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'zidane',
    name: 'Zinedine Zidane',
    team: 'Francia',
    position: 'Centrocampista',
    emblem: '🎩',
    dato: 'La volea de Glasgow, en la final de 2002.',
    lema: 'La elegancia también se entrena.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'iniesta',
    name: 'Andrés Iniesta',
    team: 'España',
    position: 'Centrocampista',
    emblem: '⭐',
    dato: 'Su gol hizo campeona del mundo a España en 2010.',
    lema: 'El más callado puede decidir el partido.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'xavi',
    name: 'Xavi Hernández',
    team: 'España',
    position: 'Centrocampista',
    emblem: '🎯',
    dato: 'Convirtió el pase corto en una forma de vida.',
    lema: 'Recibir bien es media asistencia.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'casillas',
    name: 'Iker Casillas',
    team: 'España',
    position: 'Portero',
    emblem: '🧤',
    dato: 'San Iker: capitán campeón del mundo en 2010.',
    lema: 'El líder se reconoce cuando el equipo va perdiendo.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'raul',
    name: 'Raúl González',
    team: 'Real Madrid',
    position: 'Delantero',
    emblem: '🎖️',
    dato: 'Capitán, goleador y ejemplo durante quince años.',
    lema: 'El respeto se gana cada día, no de una vez.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'messi',
    name: 'Lionel Messi',
    team: 'Argentina',
    position: 'Delantero',
    emblem: '🐐',
    dato: 'Campeón del mundo en 2022, tras años intentándolo.',
    lema: 'La constancia convierte el talento en leyenda.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'cristiano',
    name: 'Cristiano Ronaldo',
    team: 'Portugal',
    position: 'Delantero',
    emblem: '💪',
    dato: 'El salto más alto y las horas de gimnasio más largas.',
    lema: 'Nadie entrena más que él: por eso es él.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'oliver-atom',
    name: 'Oliver Atom',
    team: 'New Team · Oliver y Benji',
    position: 'Centrocampista',
    emblem: '⚽',
    dato: '«El balón es mi amigo.»',
    lema: 'Trata bien al balón y el balón te tratará bien.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'benji-price',
    name: 'Benji Price',
    team: 'New Team · Oliver y Benji',
    position: 'Portero',
    emblem: '🧤',
    dato: 'Nunca daba un balón por perdido, ni bajo la lluvia.',
    lema: 'Levántate antes de que el balón toque la red.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'mark-lenders',
    name: 'Mark Lenders',
    team: 'Toho · Oliver y Benji',
    position: 'Delantero',
    emblem: '🐯',
    dato: 'El tiro del tigre y una fuerza que venía de casa.',
    lema: 'La rabia bien usada se llama determinación.',
    rarity: 'leyenda',
  },
  {
    kind: 'cromo',
    id: 'roberto-sedinho',
    name: 'Roberto Sedinho',
    team: 'Entrenador · Oliver y Benji',
    position: 'Maestro',
    emblem: '🎓',
    dato: 'Enseñó a Oliver a mirar el campo antes que el balón.',
    lema: 'Un buen entrenador te enseña a no necesitarle.',
    rarity: 'leyenda',
  },
];

/* ---------------------------------------------------------------------------
 * Frases · para María
 * ------------------------------------------------------------------------- */

const CHISPA: FraseReward[] = [
  {
    kind: 'frase',
    id: 'f-recuerdan',
    text: 'Los hijos no recuerdan los días perfectos: recuerdan quién estuvo.',
    theme: 'familia',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'f-rutinas',
    text: 'Una casa se sostiene con rutinas pequeñas repetidas con cariño.',
    theme: 'familia',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'f-leer',
    text: 'Leer no te quita tiempo: te devuelve la cabeza.',
    theme: 'ella',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'f-catedral',
    text: 'Veinte minutos al día levantan una catedral, ladrillo a ladrillo.',
    theme: 'ella',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'f-cuidarte',
    text: 'Cuidarte no le resta tiempo a los tuyos: es lo que te permite dárselo.',
    theme: 'ella',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'f-suficiente',
    text: 'Hoy basta con que haya sido suficiente.',
    theme: 'ella',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'f-calma',
    text: 'La calma también es una forma de enseñar.',
    theme: 'aula',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'f-ruido',
    text: 'Lo importante casi nunca hace ruido.',
    theme: 'familia',
    rarity: 'chispa',
  },
];

const FUERZA: FraseReward[] = [
  {
    kind: 'frase',
    id: 'f-constancia',
    text: 'La constancia es el talento de los que no se rinden.',
    theme: 'ella',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'f-escribir',
    text: 'El día que menos apetece escribir es el que más enseña a escribir.',
    theme: 'ella',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'f-clase-pequena',
    text: 'No hay clase pequeña: al otro lado siempre hay alguien atreviéndose.',
    theme: 'aula',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'f-idioma',
    text: 'Enseñar un idioma es regalarle a alguien una casa nueva donde vivir.',
    theme: 'aula',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'f-ejemplo',
    text: 'Tu voz enseña; tu ejemplo educa.',
    theme: 'familia',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'f-horas',
    text: 'Nadie ve las horas: todos ven el resultado. Cuida tú las horas.',
    theme: 'ella',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'f-acumulacion',
    text: 'Se avanza por acumulación, nunca por milagro.',
    theme: 'ella',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'f-empezar',
    text: 'Empezar otra vez no es retroceder: es conocer ya el camino.',
    theme: 'ella',
    rarity: 'fuerza',
  },
];

const ORO: FraseReward[] = [
  {
    kind: 'frase',
    id: 'f-machado',
    text: 'Caminante, no hay camino, se hace camino al andar.',
    author: 'Antonio Machado',
    theme: 'ella',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'f-mistral',
    text: 'El futuro de los niños es siempre hoy; mañana será tarde.',
    author: 'Gabriela Mistral',
    theme: 'familia',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'f-sor-juana',
    text: 'Yo no estudio para saber más, sino para ignorar menos.',
    author: 'Sor Juana Inés de la Cruz',
    theme: 'aula',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'f-arenal',
    text: 'Abrid escuelas y se cerrarán cárceles.',
    author: 'Concepción Arenal',
    theme: 'aula',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'f-cervantes',
    text: 'El que lee mucho y anda mucho, ve mucho y sabe mucho.',
    author: 'Miguel de Cervantes',
    theme: 'ella',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'f-oficio',
    text: 'Criar y enseñar son el mismo oficio: sostener a alguien mientras aprende a sostenerse.',
    theme: 'familia',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'f-herencia',
    text: 'Que tus hijos te vean leer, escribir y volver a intentarlo: esa es la herencia.',
    theme: 'familia',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'f-casa-llena',
    text: 'Una casa llena de libros y de risas no necesita nada más para ser rica.',
    theme: 'familia',
    rarity: 'oro',
  },
];

/* ---------------------------------------------------------------------------
 * Aforismos · para Víctor: paternidad y oficio de entrenador
 * ------------------------------------------------------------------------- */

const VICTOR_CHISPA: FraseReward[] = [
  {
    kind: 'frase',
    id: 'v-llegar-casa',
    text: 'El entrenamiento más importante del día es el que haces al llegar a casa.',
    theme: 'paternidad',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'v-dias-malos',
    text: 'Los hijos no imitan lo que dices: imitan cómo tratas los días malos.',
    theme: 'paternidad',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'v-presente',
    text: 'Un padre presente vale más que un padre perfecto.',
    theme: 'paternidad',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'v-escuchar',
    text: 'Escuchar dos minutos más suele valer más que hablar diez.',
    theme: 'oficio',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'v-vestuario',
    text: 'El vestuario se cuida cuando no pasa nada; se rompe cuando ya ha pasado.',
    theme: 'oficio',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'v-suplente',
    text: 'Al que menos juega es al que más hay que mirar a los ojos.',
    theme: 'oficio',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'v-desconectar',
    text: 'Desconectar no es abandonar: es volver mañana en condiciones.',
    theme: 'oficio',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'v-competir',
    text: 'Enséñales a competir; ganar ya vendrá.',
    theme: 'paternidad',
    rarity: 'chispa',
  },
];

const VICTOR_FUERZA: FraseReward[] = [
  {
    kind: 'frase',
    id: 'v-partido-facil',
    text: 'Se entrena para que el partido sea la parte fácil.',
    theme: 'oficio',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'v-detalle',
    text: 'El detalle que hoy no ve nadie es el que el domingo se nota.',
    theme: 'oficio',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'v-corregir',
    text: 'Corregir sin humillar: ahí empieza el respeto de un vestuario.',
    theme: 'oficio',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'v-error',
    text: 'Del error sólo se aprende cuando el error no cuesta el cariño del entrenador.',
    theme: 'oficio',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'v-mismo-oficio',
    text: 'Educar y entrenar son el mismo oficio: preparar a alguien para cuando tú no estés.',
    theme: 'paternidad',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'v-disciplina',
    text: 'La disciplina es el cariño que se entiende diez años después.',
    theme: 'paternidad',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'v-exigir',
    text: 'Al hijo, como al jugador, se le exige en la misma medida en que se le sostiene.',
    theme: 'paternidad',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'v-principios',
    text: 'Los planes de partido se caen; los principios no.',
    theme: 'oficio',
    rarity: 'fuerza',
  },
];

const VICTOR_ORO: FraseReward[] = [
  {
    kind: 'frase',
    id: 'v-durant',
    text: 'Somos lo que hacemos repetidamente. La excelencia no es un acto, sino un hábito.',
    author: 'Will Durant, glosando a Aristóteles',
    theme: 'oficio',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'v-seneca',
    text: 'No nos atrevemos a muchas cosas porque son difíciles; son difíciles porque no nos atrevemos.',
    author: 'Séneca',
    theme: 'oficio',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'v-marco-aurelio',
    text: 'Lo que se interpone en el camino se convierte en el camino.',
    author: 'Marco Aurelio',
    theme: 'oficio',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'v-recordar',
    text: 'Nadie te recordará por el resultado del domingo, sino por cómo hiciste sentir al vestuario.',
    theme: 'oficio',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'v-no-necesitarte',
    text: 'Un buen entrenador enseña a no necesitarle; un buen padre, también.',
    theme: 'paternidad',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'v-talento-hijo',
    text: 'El talento de tus hijos no es tuyo: tu trabajo es que no se les apague.',
    theme: 'paternidad',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'v-personas',
    text: 'Se dirige a personas, no a plantillas; se cría a personas, no a proyectos.',
    theme: 'paternidad',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'v-alto-rendimiento',
    text: 'El alto rendimiento, en casa, se llama estar.',
    theme: 'paternidad',
    rarity: 'oro',
  },
];

/* ---------------------------------------------------------------------------
 * Aforismos · para la familia
 * ------------------------------------------------------------------------- */

const FAMILIA_CHISPA: FraseReward[] = [
  {
    kind: 'frase',
    id: 'fa-volver',
    text: 'La familia no es donde se es feliz siempre: es donde se vuelve.',
    theme: 'familia',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'fa-mesa',
    text: 'Una mesa sin pantallas es el mejor plan de la semana.',
    theme: 'familia',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'fa-recoger',
    text: 'Las casas se ordenan solas cuando todos recogen un poco.',
    theme: 'familia',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'fa-reir',
    text: 'Reírse juntos también es cuidarse.',
    theme: 'familia',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'fa-planes',
    text: 'Los planes pequeños son los únicos que de verdad se cumplen.',
    theme: 'familia',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'fa-domingo',
    text: 'Un domingo aburrido juntos vale más que un lunes perfecto por separado.',
    theme: 'familia',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'fa-tradicion',
    text: 'Lo que se hace cada semana acaba llamándose tradición.',
    theme: 'familia',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'fa-preguntar',
    text: 'En casa se llega antes preguntando que mandando.',
    theme: 'familia',
    rarity: 'chispa',
  },
];

const FAMILIA_FUERZA: FraseReward[] = [
  {
    kind: 'frase',
    id: 'fa-repiten',
    text: 'Las familias no se sostienen por lo que sienten, sino por lo que repiten.',
    theme: 'familia',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'fa-reparar',
    text: 'Discutir es normal; reparar es lo que enseña.',
    theme: 'familia',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'fa-en-casa',
    text: 'Nadie es en casa el que es fuera: por eso en casa hay que cuidarse más.',
    theme: 'familia',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'fa-apartar',
    text: 'El tiempo juntos no se encuentra: se aparta antes de que llegue el día.',
    theme: 'familia',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'fa-ayudar',
    text: 'Ayudar sin que te lo pidan es el idioma de esta casa.',
    theme: 'familia',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'fa-perdon',
    text: 'Un «lo siento» a tiempo ahorra una semana entera.',
    theme: 'familia',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'fa-grises',
    text: 'Se educa en los días grises, no en las fotos.',
    theme: 'familia',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'fa-celebrar',
    text: 'Lo que se celebra, se repite.',
    theme: 'familia',
    rarity: 'fuerza',
  },
];

const FAMILIA_ORO: FraseReward[] = [
  {
    kind: 'frase',
    id: 'fa-tolstoi',
    text: 'Todas las familias felices se parecen; las infelices lo son cada una a su manera.',
    author: 'León Tolstói',
    theme: 'familia',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'fa-pitagoras',
    text: 'Educa al niño y no será necesario castigar al hombre.',
    author: 'Pitágoras',
    theme: 'familia',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'fa-techo',
    text: 'Donde hay una familia unida hay un techo que no se cae.',
    theme: 'familia',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'fa-rico',
    text: 'Nadie es tan rico como quien tiene a los suyos cerca.',
    theme: 'familia',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'fa-sostiene',
    text: 'El cariño no se mide por lo que se dice, sino por lo que se sostiene.',
    theme: 'familia',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'fa-equipo',
    text: 'Una casa es un equipo: se gana con el capitán y con el que sale al final.',
    theme: 'familia',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'fa-querer',
    text: 'Los hijos aprenden a querer mirando cómo se quieren sus padres.',
    theme: 'familia',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'fa-herencia',
    text: 'La herencia que queda no se cuenta: se recuerda.',
    theme: 'familia',
    rarity: 'oro',
  },
];

/* ---------------------------------------------------------------------------
 * Aforismos · para la pareja
 * ------------------------------------------------------------------------- */

const PAREJA_CHISPA: FraseReward[] = [
  {
    kind: 'frase',
    id: 'p-mirarse',
    text: 'Diez minutos de mirarse valen más que una tarde de convivir.',
    theme: 'pareja',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'p-como-estas',
    text: 'Preguntar «¿cómo estás?» y quedarse a la respuesta entera.',
    theme: 'pareja',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'p-plan',
    text: 'El plan más romántico es el que de verdad se cumple.',
    theme: 'pareja',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'p-paseo',
    text: 'Un paseo arregla más conversaciones que un sofá.',
    theme: 'pareja',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'p-gracias',
    text: 'Dar las gracias por lo cotidiano evita tener que reclamarlo luego.',
    theme: 'pareja',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'p-elegirse',
    text: 'Elegirse otra vez, un martes cualquiera.',
    theme: 'pareja',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'p-reirse',
    text: 'Reírse de lo mismo es tener un idioma privado.',
    theme: 'pareja',
    rarity: 'chispa',
  },
  {
    kind: 'frase',
    id: 'p-gestos',
    text: 'Los gestos pequeños son baratos y duran años.',
    theme: 'pareja',
    rarity: 'chispa',
  },
];

const PAREJA_FUERZA: FraseReward[] = [
  {
    kind: 'frase',
    id: 'p-cultiva',
    text: 'El amor no se mantiene: se cultiva, como todo lo que está vivo.',
    theme: 'pareja',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'p-pronto',
    text: 'Se discute mejor cuando se discute pronto.',
    theme: 'pareja',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'p-equipo',
    text: 'No se trata de tener razón, sino de seguir siendo equipo al terminar.',
    theme: 'pareja',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'p-cansancio',
    text: 'El cansancio no es una excusa, pero sí un aviso.',
    theme: 'pareja',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'p-no-se-dice',
    text: 'Lo que no se dice acaba diciéndose peor.',
    theme: 'pareja',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'p-escuchar',
    text: 'Escuchar no es esperar tu turno para hablar.',
    theme: 'pareja',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'p-rutina',
    text: 'La rutina no mata el amor: lo mata la desatención.',
    theme: 'pareja',
    rarity: 'fuerza',
  },
  {
    kind: 'frase',
    id: 'p-pedir-ayuda',
    text: 'Pedir ayuda también es una manera de querer.',
    theme: 'pareja',
    rarity: 'fuerza',
  },
];

const PAREJA_ORO: FraseReward[] = [
  {
    kind: 'frase',
    id: 'p-saint-exupery',
    text: 'Amar no es mirarse el uno al otro, sino mirar juntos en la misma dirección.',
    author: 'Antoine de Saint-Exupéry',
    theme: 'pareja',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'p-cada-dia',
    text: 'El amor que dura es el que se decide cada día.',
    theme: 'pareja',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'p-remar',
    text: 'Dos que reman a la vez llegan aunque haya corriente.',
    theme: 'pareja',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'p-silencios',
    text: 'Nadie conoce mejor tus silencios que quien los ha respetado.',
    theme: 'pareja',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'p-mantenimiento',
    text: 'El tiempo a solas no es un lujo: es el mantenimiento de la casa.',
    theme: 'pareja',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'p-detalles',
    text: 'Se es pareja en los detalles; el resto es logística.',
    theme: 'pareja',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'p-cuidar',
    text: 'Cuidar a quien te cuida es el único trato justo.',
    theme: 'pareja',
    rarity: 'oro',
  },
  {
    kind: 'frase',
    id: 'p-anos',
    text: 'Los años no gastan a una pareja: la pulen si se la cuida.',
    theme: 'pareja',
    rarity: 'oro',
  },
];

/* ---------------------------------------------------------------------------
 * Cromos de la casa · el regalo extra de María
 *
 * Mismo formato que los de fútbol, pero la plantilla es la de casa: los
 * cuatro, los ratos que se repiten y las cosas que sólo pasan aquí. Van
 * aparte del mazo de frases, así que cada reto que María supera le deja dos
 * cosas: su frase y un cromo de la familia.
 * ------------------------------------------------------------------------- */

/** Los de diario: lo que se repite tanto que ya no se mira. */
const CASA: CromoReward[] = [
  {
    kind: 'cromo',
    id: 'mesa-ocho',
    name: 'La mesa de la cena',
    team: 'Los Cea Díaz',
    position: 'Rutina diaria',
    emblem: '🍽️',
    dato: 'El sitio donde se enteran de cómo ha ido el día los cuatro a la vez.',
    lema: 'Sin pantallas encima, la conversación aparece sola.',
    rarity: 'casa',
  },
  {
    kind: 'cromo',
    id: 'cuento-noche',
    name: 'El cuento de la noche',
    team: 'Los Cea Díaz',
    position: 'Último turno',
    emblem: '📖',
    dato: 'Diez minutos en los que salen las cosas que no salieron en la mesa.',
    lema: 'Lo que se cuenta antes de dormir pesa más de lo que parece.',
    rarity: 'casa',
  },
  {
    kind: 'cromo',
    id: 'taxi-entrenos',
    name: 'El taxi de los entrenos',
    team: 'Los Cea Díaz',
    position: 'Logística',
    emblem: '🚗',
    dato: 'Cinco deportes entre dos hermanos: alguien conduce y nunca sale en la foto.',
    lema: 'Llevar y traer también es entrenar.',
    rarity: 'casa',
  },
  {
    kind: 'cromo',
    id: 'colada-domingo',
    name: 'La colada del domingo',
    team: 'Los Cea Díaz',
    position: 'Retaguardia',
    emblem: '🧺',
    dato: 'Las equipaciones no aparecen limpias por su cuenta el lunes por la mañana.',
    lema: 'Lo invisible es lo que sostiene la semana.',
    rarity: 'casa',
  },
  {
    kind: 'cromo',
    id: 'desayuno-prisa',
    name: 'El desayuno de las prisas',
    team: 'Los Cea Díaz',
    position: 'Primer tiempo',
    emblem: '🥣',
    dato: 'Doce minutos justos entre el despertador y la puerta.',
    lema: 'Un desayuno que aguanta hasta el recreo vale por dos.',
    rarity: 'casa',
  },
  {
    kind: 'cromo',
    id: 'paseo-cena',
    name: 'El paseo de después de cenar',
    team: 'María · Víctor',
    position: 'Tiempo añadido',
    emblem: '🌆',
    dato: 'Veinte minutos en los que se habla de lo que en el salón cuesta.',
    lema: 'Caminando salen las conversaciones que sentados no salen.',
    rarity: 'casa',
  },
  {
    kind: 'cromo',
    id: 'aula-maria',
    name: 'El aula de las nueve',
    team: 'María',
    position: 'Profesora de español',
    emblem: '💻',
    dato: 'Alumnos en otro huso horario esperando al otro lado de la pantalla.',
    lema: 'Enseñar bien un día cansa; enseñar bien cada día construye.',
    rarity: 'casa',
  },
  {
    kind: 'cromo',
    id: 'consejo-domingo',
    name: 'El consejo del domingo',
    team: 'Los Cea Díaz',
    position: 'Sala de reuniones',
    emblem: '🗣️',
    dato: 'Quince minutos con la semana delante y un reparto por escrito.',
    lema: 'Lo que se decide en frío no se discute en caliente.',
    rarity: 'casa',
  },
];

/** Los de la plantilla: uno por cabeza. */
const EQUIPO: CromoReward[] = [
  {
    kind: 'cromo',
    id: 'leo-casa',
    name: 'Leo',
    team: 'Los Cea Díaz',
    position: 'Cinco deportes · 8 años',
    emblem: '🦁',
    dato: 'Fútbol, natación, arte marcial, gimnasio y atletismo en la misma semana.',
    lema: 'La energía no hay que fabricarla: hay que ponerle horario.',
    rarity: 'equipo',
  },
  {
    kind: 'cromo',
    id: 'hugo-casa',
    name: 'Hugo',
    team: 'Los Cea Díaz',
    position: 'Récords propios · 9 años',
    emblem: '🐯',
    dato: 'Compite contra su marca anterior, no contra la de su hermano.',
    lema: 'El listón que sirve es el que uno mismo dejó la semana pasada.',
    rarity: 'equipo',
  },
  {
    kind: 'cromo',
    id: 'maria-casa',
    name: 'María',
    team: 'Los Cea Díaz',
    position: 'Profesora · Aula digital',
    emblem: '🌿',
    dato: 'Da clase, sostiene la casa y aún saca el rato de leer.',
    lema: 'Cuidarse no es quitarle tiempo a los demás: es poder dárselo.',
    rarity: 'equipo',
  },
  {
    kind: 'cromo',
    id: 'victor-casa',
    name: 'Víctor',
    team: 'Los Cea Díaz',
    position: 'Cuerpo técnico · Castilla',
    emblem: '📋',
    dato: 'Analiza rivales toda la semana y llega a casa a desconectar del análisis.',
    lema: 'Dejar el trabajo en la puerta es la sesión más difícil del día.',
    rarity: 'equipo',
  },
  {
    kind: 'cromo',
    id: 'hermanos-casa',
    name: 'Los hermanos',
    team: 'Los Cea Díaz',
    position: 'Doble punta',
    emblem: '🤝',
    dato: 'Ocho y nueve años, cinco deportes y una tabla de logros compartida.',
    lema: 'Que se empujen, no que se midan.',
    rarity: 'equipo',
  },
  {
    kind: 'cromo',
    id: 'pareja-casa',
    name: 'María y Víctor',
    team: 'Los Cea Díaz',
    position: 'Sociedad',
    emblem: '💞',
    dato: 'Diez minutos al día que no van de niños, ni de dinero, ni de agenda.',
    lema: 'Cinco gestos buenos por cada roce; también en las semanas malas.',
    rarity: 'equipo',
  },
];

/** Los de leyenda: sólo caen con un reto de máximo esfuerzo. */
const LEYENDA_CASA: CromoReward[] = [
  {
    kind: 'cromo',
    id: 'plantilla-completa',
    name: 'Los Cea Díaz',
    team: 'Plantilla completa',
    position: 'Equipo de casa',
    emblem: '🏡',
    dato: 'Cuatro horarios distintos que caben, casi siempre, en una misma mesa.',
    lema: 'Lo que se repite junto es lo único que se queda.',
    rarity: 'leyenda_casa',
  },
  {
    kind: 'cromo',
    id: 'semana-entera',
    name: 'La semana entera',
    team: 'Los Cea Díaz',
    position: 'Marca de la casa',
    emblem: '🗓️',
    dato: 'Siete días seguidos sin que se caiga ninguna de las rutinas grandes.',
    lema: 'La constancia no se nota el día que se hace: se nota al mes.',
    rarity: 'leyenda_casa',
  },
  {
    kind: 'cromo',
    id: 'finde-cuadrado',
    name: 'El finde que no se descuadró',
    team: 'Los Cea Díaz',
    position: 'Récord doméstico',
    emblem: '🌞',
    dato: 'Sábado y domingo con los horarios en pie y un lunes que no lo pagó.',
    lema: 'El fin de semana decide cómo empieza la semana siguiente.',
    rarity: 'leyenda_casa',
  },
  {
    kind: 'cromo',
    id: 'partido-sofa',
    name: 'El partido visto en el sofá',
    team: 'Los Cea Díaz',
    position: 'Grada de casa',
    emblem: '📺',
    dato: 'Los cuatro, la misma pantalla y nadie mirando el móvil.',
    lema: 'Ver algo juntos cuenta más que verlo cada uno a su hora.',
    rarity: 'leyenda_casa',
  },
  {
    kind: 'cromo',
    id: 'verano-familia',
    name: 'El verano de los cuatro',
    team: 'Los Cea Díaz',
    position: 'Pretemporada',
    emblem: '🏖️',
    dato: 'Sin despertador, sin calendario de partidos y con el día entero por delante.',
    lema: 'Descansar juntos también es entrenar la casa.',
    rarity: 'leyenda_casa',
  },
];

/** El mazo de la casa, por nivel de reto. */
const CROMOS_CASA: Record<ChallengeTier, Reward[]> = {
  base: CASA,
  reto: EQUIPO,
  maximo: LEYENDA_CASA,
};

/* ---------------------------------------------------------------------------
 * Técnicas de la semana · el premio de Leo y Hugo
 *
 * En Oliver y Benji nadie mejora en abstracto: se desbloquea una técnica con
 * nombre propio. Aquí igual, pero el jugador del cromo es el peque, y la
 * técnica se gana cerrando **la semana entera de retos**, no un reto suelto.
 * Cada uno tiene su mazo: el de Leo va de energía y atreverse, el de Hugo de
 * constancia y récord propio, que es de lo que va cada uno.
 * ------------------------------------------------------------------------- */

const TECNICAS_LEO: CromoReward[] = [
  {
    kind: 'cromo',
    id: 'leo-tiro-leon',
    name: 'Tiro del León',
    team: 'Leo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '🦁',
    dato: 'Carrera desde el centro del campo y disparo sin levantar la cabeza. El balón sale rugiendo.',
    lema: 'La semana entera hecha: eso es lo que da fuerza al disparo.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'leo-regate-relampago',
    name: 'Regate Relámpago',
    team: 'Leo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '⚡',
    dato: 'Dos toques, un cambio de dirección y el defensa se queda mirando el sitio donde estabas.',
    lema: 'Atrévete al uno contra uno aunque el primero salga mal.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'leo-salto-pantera',
    name: 'Salto de Pantera',
    team: 'Leo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '🐆',
    dato: 'Remate de cabeza por encima de dos rivales más altos. Las piernas vienen de la piscina.',
    lema: 'Lo que entrenas en un deporte aparece en otro.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'leo-pase-imposible',
    name: 'Pase Imposible',
    team: 'Leo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '🎯',
    dato: 'Ve el hueco antes de que exista y mete el balón donde sólo cabía la idea.',
    lema: 'Mira alrededor antes de que te llegue el balón, no después.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'leo-muro-hermano',
    name: 'Muro de Hermanos',
    team: 'Leo y Hugo · Cea Díaz',
    position: 'Técnica combinada',
    emblem: '🤝',
    dato: 'Pared con Hugo a toda velocidad: entran los dos y sale uno solo con el balón.',
    lema: 'Los mejores nunca juegan solos.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'leo-huracan',
    name: 'Huracán de Cinco Deportes',
    team: 'Leo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '🌪️',
    dato: 'Corre los noventa minutos como si fuera el primero. Fútbol, natación, tatami, gimnasio y pista en las piernas.',
    lema: 'La energía no se fabrica: se le pone horario.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'leo-parada-imposible',
    name: 'Barrida del León',
    team: 'Leo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '🛡️',
    dato: 'Entrada limpia en el último metro, se levanta con el balón y ya está mirando adelante.',
    lema: 'Defender también es empezar la jugada.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'leo-tiro-final',
    name: 'Disparo del Minuto 90',
    team: 'Leo · Cea Díaz',
    position: 'Técnica legendaria',
    emblem: '🔥',
    dato: 'Con todo cansado y el partido empatado, es cuando aparece. No es suerte: es lo entrenado saliendo solo.',
    lema: 'Los momentos grandes son de quien llegó preparado.',
    rarity: 'tecnica',
  },
];

const TECNICAS_HUGO: CromoReward[] = [
  {
    kind: 'cromo',
    id: 'hugo-tiro-tigre',
    name: 'Tiro del Tigre Rubio',
    team: 'Hugo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '🐯',
    dato: 'Golpeo seco desde la frontal, siempre al mismo sitio. Lo ha repetido tantas veces que ya sale solo.',
    lema: 'El gesto se repite hasta que no hay que pensarlo.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'hugo-record-propio',
    name: 'Marca Propia',
    team: 'Hugo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '📈',
    dato: 'No mira el marcador de los demás: mira el suyo de la semana pasada y lo pasa por poco.',
    lema: 'El listón que sirve es el que dejaste tú.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'hugo-motor',
    name: 'Motor de Constancia',
    team: 'Hugo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '⚙️',
    dato: 'El que sigue corriendo igual en el minuto 80 que en el 10. No arranca fuerte: no se apaga.',
    lema: 'Estar siempre disponible también es un talento.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'hugo-control-orientado',
    name: 'Control Orientado',
    team: 'Hugo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '🧭',
    dato: 'La para y ya está mirando a portería en el mismo movimiento. Gana medio segundo cada vez.',
    lema: 'El primer toque decide toda la jugada.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'hugo-muro-hermano',
    name: 'Muro de Hermanos',
    team: 'Hugo y Leo · Cea Díaz',
    position: 'Técnica combinada',
    emblem: '🤝',
    dato: 'Pared con Leo a toda velocidad: entran los dos y sale uno solo con el balón.',
    lema: 'Que os empujéis, no que os midáis.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'hugo-carrera-invisible',
    name: 'Carrera Invisible',
    team: 'Hugo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '💨',
    dato: 'Arranca al espacio antes de que nadie mire. Casi ningún gol suyo empieza con el balón en los pies.',
    lema: 'Corre el metro que nadie ve; ahí están los goles.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'hugo-cabeza-fria',
    name: 'Cabeza Fría',
    team: 'Hugo · Cea Díaz',
    position: 'Técnica desbloqueada',
    emblem: '❄️',
    dato: 'Falla una y la siguiente la juega igual de tranquilo. Ni celebra de más ni se hunde de menos.',
    lema: 'Un fallo no se arrastra: se juega la siguiente.',
    rarity: 'tecnica',
  },
  {
    kind: 'cromo',
    id: 'hugo-semana-perfecta',
    name: 'Golpeo de la Semana Perfecta',
    team: 'Hugo · Cea Díaz',
    position: 'Técnica legendaria',
    emblem: '🏅',
    dato: 'Siete días cumpliendo lo que tocaba y el disparo sale distinto. Se nota en el partido del sábado.',
    lema: 'La constancia no se ve el día que se hace: se ve al mes.',
    rarity: 'tecnica',
  },
];

/* ---------------------------------------------------------------------------
 * Mazos por perfil
 * ------------------------------------------------------------------------- */

interface Deck {
  kind: RewardKind;
  /** Un mazo por nivel de reto. */
  cards: Record<ChallengeTier, Reward[]>;
  /**
   * Segundo regalo del mismo reto, si lo hay. María y Víctor lo tienen: además
   * de su frase o su aforismo se llevan un cromo de la casa.
   */
  bonus?: Record<ChallengeTier, Reward[]>;
  /**
   * Premio de **semana completa**: una sola carta, y sólo si esa semana no
   * quedó ningún reto sin superar. Es el de Leo y Hugo, que desbloquean una
   * técnica por semana en vez de una carta por reto.
   */
  weekly?: Reward[];
  /** Cómo se llama cada rareza en este mazo. */
  labels: Record<string, string>;
  /** Cómo se presenta la colección en la interfaz. */
  album: { title: string; one: string; many: string; empty: string };
}

const CROMOS: Deck = {
  kind: 'cromo',
  cards: { base: LIGA, reto: ESTRELLA, maximo: LEYENDA },
  labels: {
    liga: 'Cromo de LaLiga',
    estrella: 'Cromo estrella',
    leyenda: 'Cromo de leyenda',
  },
  album: {
    title: '🎁 Álbum de cromos',
    one: 'cromo',
    many: 'cromos',
    empty: 'Todavía no hay ninguno. Supera un reto y caerá el primero.',
  },
};

/** Etiquetas de las colecciones de texto: frases para María, aforismos para el resto. */
const FRASE_LABELS = {
  chispa: 'Frase del día',
  fuerza: 'Frase de fuerza',
  oro: 'Frase de oro',
};

/**
 * Rótulos que no dependen del perfil: los del mazo de la casa, que viaja
 * como regalo extra y no como colección propia de nadie.
 */
const SHARED_LABELS: Record<string, string> = {
  casa: 'Cromo de casa',
  equipo: 'Cromo de la plantilla',
  leyenda_casa: 'Cromo de leyenda de casa',
  tecnica: 'Técnica de la semana',
};

const AFORISMO_LABELS = {
  chispa: 'Aforismo',
  fuerza: 'Aforismo de fuerza',
  oro: 'Aforismo de oro',
};

function textDeck(
  cards: Record<ChallengeTier, Reward[]>,
  labels: Record<string, string>,
  album: Deck['album'],
): Deck {
  return { kind: 'frase', cards, labels, album };
}

const DECKS: Partial<Record<ProfileId, Deck>> = {
  // Mismo álbum de fútbol para los dos, pero cada uno desbloquea sus propias
  // técnicas: el cromo semanal lleva su nombre, no el del hermano.
  leo: {
    ...CROMOS,
    weekly: TECNICAS_LEO,
    album: {
      title: '🎁 Álbum de cromos y técnicas',
      one: 'cromo',
      many: 'cromos',
      empty: 'Todavía no hay ninguno. Supera un reto y caerá el primero.',
    },
  },
  hugo: {
    ...CROMOS,
    weekly: TECNICAS_HUGO,
    album: {
      title: '🎁 Álbum de cromos y técnicas',
      one: 'cromo',
      many: 'cromos',
      empty: 'Todavía no hay ninguno. Supera un reto y caerá el primero.',
    },
  },
  maria: {
    // Cada reto que supera le deja dos cosas: su frase y un cromo de casa.
    ...textDeck({ base: CHISPA, reto: FUERZA, maximo: ORO }, FRASE_LABELS, {
      title: '🎁 Frases y cromos de casa',
      one: 'regalo',
      many: 'regalos',
      empty: 'Todavía no hay ninguno. Supera un reto y llegarán los primeros.',
    }),
    bonus: CROMOS_CASA,
  },
  victor: {
    // Como María: cada reto le deja el aforismo y un cromo de la casa.
    ...textDeck({ base: VICTOR_CHISPA, reto: VICTOR_FUERZA, maximo: VICTOR_ORO }, AFORISMO_LABELS, {
      title: '🎁 Aforismos y cromos de casa',
      one: 'regalo',
      many: 'regalos',
      empty: 'Todavía no hay ninguno. Supera un reto y llegarán los primeros.',
    }),
    bonus: CROMOS_CASA,
  },
  familia: textDeck(
    { base: FAMILIA_CHISPA, reto: FAMILIA_FUERZA, maximo: FAMILIA_ORO },
    AFORISMO_LABELS,
    {
      title: '🎁 Aforismos de la casa',
      one: 'aforismo',
      many: 'aforismos',
      empty: 'Todavía no hay ninguno. Superad un reto y llegará el primero.',
    },
  ),
  pareja: textDeck(
    { base: PAREJA_CHISPA, reto: PAREJA_FUERZA, maximo: PAREJA_ORO },
    AFORISMO_LABELS,
    {
      title: '🎁 Aforismos de los dos',
      one: 'aforismo',
      many: 'aforismos',
      empty: 'Todavía no hay ninguno. Superad un reto y llegará el primero.',
    },
  ),
};

export function rewardKindOf(profileId: ProfileId): RewardKind | null {
  return DECKS[profileId]?.kind ?? null;
}

/** Rótulos de la colección (título, singular, plural, vacío). */
export function albumCopyOf(profileId: ProfileId): Deck['album'] | null {
  return DECKS[profileId]?.album ?? null;
}

/** Cómo llama este perfil a esa rareza («Cromo de leyenda», «Aforismo de oro»). */
export function rarityLabel(profileId: ProfileId, rarity: string): string {
  return DECKS[profileId]?.labels[rarity] ?? SHARED_LABELS[rarity] ?? rarity;
}

/** Cómo se llama el premio de semana completa de este perfil, si lo tiene. */
export function weeklyLabelFor(profileId: ProfileId): string | null {
  const sample = DECKS[profileId]?.weekly?.[0];
  return sample ? SHARED_LABELS[sample.rarity] ?? null : null;
}

/** Nombre del premio que entrega un reto de ese nivel, para anunciarlo antes. */
export function rewardLabelFor(profileId: ProfileId, tier: ChallengeTier): string | null {
  const deck = DECKS[profileId];
  if (!deck) return null;

  const main = deck.cards[tier][0];
  if (!main) return null;

  const label = deck.labels[main.rarity] ?? SHARED_LABELS[main.rarity] ?? null;

  // Con mazo extra se anuncian los dos: es parte de lo que se está jugando.
  const extra = deck.bonus?.[tier][0];
  const extraLabel = extra ? SHARED_LABELS[extra.rarity] ?? null : null;

  return label && extraLabel ? `${label} + ${extraLabel.toLowerCase()}` : label;
}

/* ---------------------------------------------------------------------------
 * Reparto
 * ------------------------------------------------------------------------- */

/** Baraja determinista: el mismo mazo y la misma semilla dan el mismo orden. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed || 1;

  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }

  return out;
}

/** Lunes de la primera semana con algún registro de ese perfil. */
function firstWeekWithData(profileId: ProfileId, entries: Record<string, DayEntry>): DateKey | null {
  let earliest: DateKey | null = null;

  for (const key of Object.keys(entries)) {
    if (!key.startsWith(`${profileId}:`)) continue;
    const date = key.slice(profileId.length + 1);
    if (!earliest || date < earliest) earliest = date;
  }

  return earliest ? startOfWeek(earliest) : null;
}

/**
 * Reconstruye el álbum: recorre las semanas con datos, reparte una carta por
 * reto superado y no repite ninguna mientras queden sin salir. Devuelve las
 * más recientes primero.
 */
export function collectRewards(
  profile: Profile,
  entries: Record<string, DayEntry>,
  date: DateKey,
): UnlockedReward[] {
  const deck = DECKS[profile.id];
  if (!deck) return [];

  const currentWeek = weekKeys(date)[0];
  const limit = addDays(currentWeek, -7 * (MAX_WEEKS - 1));
  const first = firstWeekWithData(profile.id, entries) ?? currentWeek;
  const startWeek = first > limit ? first : limit;

  // Cada nivel tiene su propio mazo barajado y su propio contador. El mazo
  // extra se baraja con otra semilla, para que la frase y el cromo de un
  // mismo reto no vayan siempre emparejados igual.
  const pilesOf = (cards: Record<ChallengeTier, Reward[]>, salt: string) => ({
    base: shuffle(cards.base, hashSeed(`${profile.id}:${salt}base`)),
    reto: shuffle(cards.reto, hashSeed(`${profile.id}:${salt}reto`)),
    maximo: shuffle(cards.maximo, hashSeed(`${profile.id}:${salt}maximo`)),
  });

  const piles = pilesOf(deck.cards, '');
  const bonusPiles = deck.bonus ? pilesOf(deck.bonus, 'bonus:') : null;
  const dealt: Record<ChallengeTier, number> = { base: 0, reto: 0, maximo: 0 };

  // El premio de semana completa lleva su propia baraja y su propio contador:
  // no se reparte por reto sino por semana cerrada.
  const weeklyPile = deck.weekly ? shuffle(deck.weekly, hashSeed(`${profile.id}:weekly`)) : null;
  let weeksWon = 0;

  const unlocked: UnlockedReward[] = [];

  for (let week = startWeek; week <= currentWeek; week = addDays(week, 7)) {
    const { challenges } = buildChallengeWeek(profile, week, entries);

    for (const challenge of challenges) {
      if (!challenge.progress.done) continue;

      const pile = piles[challenge.tier];
      if (pile.length === 0) continue;

      const turn = dealt[challenge.tier];

      unlocked.push({
        reward: pile[turn % pile.length],
        week,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
      });

      const bonusPile = bonusPiles?.[challenge.tier];
      if (bonusPile && bonusPile.length > 0) {
        unlocked.push({
          reward: bonusPile[turn % bonusPile.length],
          week,
          challengeId: challenge.id,
          challengeTitle: challenge.title,
        });
      }

      dealt[challenge.tier] = turn + 1;
    }

    // Y, si no quedó ninguno sin superar, la técnica de la semana.
    const perfect = challenges.length > 0 && challenges.every((c) => c.progress.done);
    if (perfect && weeklyPile && weeklyPile.length > 0) {
      unlocked.push({
        reward: weeklyPile[weeksWon % weeklyPile.length],
        week,
        challengeId: WEEKLY_CHALLENGE_ID,
        challengeTitle: 'Semana completa',
      });
      weeksWon += 1;
    }
  }

  return unlocked.reverse();
}
