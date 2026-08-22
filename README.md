# Hábitos en Familia

Aplicación web independiente de seguimiento de hábitos para una familia de cuatro
(Leo, Hugo, María y Víctor) más dos módulos compartidos.

Funciona **local-first**: se escribe siempre primero en el navegador, así que la app
va rápida y no se cae sin cobertura. Encima de eso, dos servicios opcionales que se
activan con sus claves: **Supabase**, para que lo registrado se guarde de verdad y se
vea desde todos los móviles, y **Claude**, para analizar las fotos de comida y dar el
consejo del día. Sin claves, todo sigue funcionando contra el propio navegador.

## Puesta en marcha

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>. Para probar los resúmenes sin registrar nada a mano:
**⚙️ Ajustes → 🎲 Cargar datos de ejemplo** (genera 28 días simulados para todos los perfiles).

Otros comandos:

```bash
npm run build      # compilación de producción
npm run typecheck  # comprobación de tipos
npm run lint       # ESLint
```

## Despliegue en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel: *New Project* → importa el repo → *Deploy*.
3. **Settings → Environment Variables**, y vuelve a desplegar:

| Variable | Para qué | Sin ella |
| -------- | -------- | -------- |
| `ANTHROPIC_API_KEY` | Fotos de comida y consejo del día | Esas dos funciones avisan; el resto va igual |
| `NEXT_PUBLIC_SUPABASE_URL` | Guardar y sincronizar entre móviles | Cada móvil guarda sólo lo suyo |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ídem | Ídem |

Las dos `NEXT_PUBLIC_*` se incrustan al compilar: si se añaden después del primer
despliegue, hay que **volver a desplegar** para que surtan efecto.

En local, copia `.env.example` a `.env.local` y rellena lo que quieras usar.
La puesta en marcha de Supabase está detallada más abajo.

## Estructura

```
app/
  layout.tsx           Layout raíz, metadatos y fondo ambiental
  api/plato/route.ts   Análisis de la foto del plato con Claude
  api/consejo/route.ts Consejo del día y reto progresivo con Claude
  page.tsx             Orquestador: selector ↔ dashboard ↔ PIN ↔ ajustes
  manifest.ts          Manifiesto PWA (instalable en el móvil)
  globals.css          Tailwind + utilidades propias (.card, .card-kid, .btn…)
components/
  Ambient.tsx          Decoración de fondo, distinta por piel
  ProfileSelector.tsx  Pantalla inicial con los 6 perfiles, su foto y su estado
  TopBar.tsx           Conmutador de perfiles siempre visible, con retratos
  Dashboard.tsx        Cabecera del perfil + pestañas Registro / Retos / Resúmenes
  profile/
    ProfileHeader.tsx  Las tres cabeceras de perfil (fútbol, editorial, grupo)
  cloud/
    SignIn.tsx         Entrada con la cuenta de casa
  challenges/
    ChallengesPanel.tsx  Retos de la semana, medallero y puntos
    RewardsAlbum.tsx     Álbum de cromos y colección de frases
  meals/
    MealPhotoCard.tsx  Foto del plato, nota y recomendaciones
  notes/
    DayNoteCard.tsx    Observaciones dictadas, consejo y reto pendiente
  DateNavigator.tsx    Navegación por días con tira semanal
  CategoryCard.tsx     Categoría plegable con su cumplimiento
  SportsPanel.tsx      Layout especial del desglose deportivo
  PinLock.tsx          Bloqueo del módulo privado de pareja
  SettingsPanel.tsx    Datos de ejemplo, importación/exportación, PIN y borrado
  controls/            Un control por tipo de métrica + despachador
  summary/             Gráfico semanal, mapa mensual, logros y vista de resumen
  ui/                  Avatar, ProgressBar, ProgressRing, Stars, Modal, Toast
hooks/
  useHabitStore.ts     Estado global + persistencia en localStorage
  useDictation.ts      Dictado por voz con la Web Speech API del navegador
public/
  photos/              Retratos, cabeceras y cromos ya recortados
  audio/               Sintonías de perfil (las pone cada casa)
  icon.svg             Icono de la app instalada
lib/
  profiles.ts          Los 6 perfiles: datos, fotos, acentos y piel visual
  habits.ts            Catálogo de categorías y métricas por perfil
  scoring.ts           Cumplimiento, estrellas, rachas, logros
  challenges.ts        Generador de retos semanales a partir del historial
  rewards.ts           Mazos de cromos y frases, y su reparto por reto superado
  mealPrompt.ts        Contexto e instrucciones del análisis de fotos de comida
  advicePrompt.ts      Contexto del consejo del día y de la progresión de entreno
  photos.ts            Reducción de fotos y miniaturas en IndexedDB
  sound.ts             Sintonía al entrar en un perfil, con desvanecido
  supabase.ts          Cliente de la nube (opcional: sin claves, no se usa)
  cloud.ts             Sincronización: mezcla por fecha, lápidas y fotos
  dates.ts             Utilidades de fecha en es-ES
  storage.ts           Lectura/escritura en localStorage
  seed.ts              Generador determinista de datos de ejemplo
supabase/
  schema.sql           Tablas, políticas RLS y cubo de fotos
types/
  index.ts             Esquema de datos completo
```

## Modelo de datos

El modelo está **dirigido por configuración**: la interfaz no conoce ninguna métrica
concreta, sólo su *tipo*. Añadir un hábito nuevo es añadir un objeto a `lib/habits.ts`.

| Tipo       | Uso                                    | Cumplimiento               |
| ---------- | -------------------------------------- | -------------------------- |
| `toggle`   | Sí / No                                | 1 si `true`                |
| `counter`  | Vasos de agua, raciones, clases…       | `valor / objetivo`         |
| `duration` | Horas de sueño, minutos de lectura…    | `valor / objetivo`         |
| `scale`    | Esfuerzo, energía, sintonía (1–5)      | normalizado en el rango    |
| `choice`   | Sensaciones, ambiente                  | puntuación de la opción    |

Cada métrica admite `weight` (peso en el cálculo; `0` la excluye, como el interruptor
«Época de exámenes»), `group` (agrupador, usado por las cinco actividades deportivas)
y `focus` (`aprendizaje` o `esfuerzo`: marca las métricas en las que *cuanto más,
mejor*, y que por tanto admiten reto de récord — sólo la lee el generador de retos).

Los registros se guardan como `DayEntry` bajo la clave `${profileId}:${YYYY-MM-DD}`,
de modo que cada perfil tiene su propio historial independiente. Esa misma clave es
la que identifica la fila en Supabase, así que el modelo local y el de la nube son
el mismo con otros nombres.

### Perfiles y categorías

| Perfil                  | Categorías                                                                        |
| ----------------------- | --------------------------------------------------------------------------------- |
| **Leo** (8), **Hugo** (9) | Nutrición e Hidratación · Sueño y Recuperación · Rendimiento Deportivo (Fútbol, Natación, Arte Marcial, Gimnasio, Atletismo, con asistencia/esfuerzo/sensaciones) · Cognitivo-Académico (época de exámenes, lectura en casa, escritura) |
| **María** (39)          | Salud y Bienestar · Desarrollo Personal (lectura y escritura) · Profesional (clases de español online) |
| **Víctor** (42)         | Salud y Bienestar · Desarrollo Personal · Profesional (preparación de sesiones, análisis táctico, cuerpo técnico y alto rendimiento) |
| **Hábitos en Familia**  | Rutinas en Familia · Tiempo Juntos                                                 |
| **Hábitos en Pareja**   | Tiempo a Solas · Conexión y Rutinas — protegido por PIN                            |

## Sintonía de perfil

Al entrar en un perfil puede sonar su música: Leo y Hugo reciben el himno del Real
Madrid y María, *A Thousand Years*. Suena **veinte segundos**, entra y sale con un
desvanecido, y se corta con el botón que aparece abajo a la derecha. Se apaga del todo
en **⚙️ Ajustes → Sonido**.

Tres detalles de comportamiento, para que sea una alegría y no un incordio:

- **Sólo con gesto**: arranca al tocar el perfil, nunca al cargar la página. Es también
  la única forma de que el navegador deje sonar algo.
- **Con espera**: no se repite si se entra y se sale del mismo perfil en dos minutos.
- **Sin drama**: si el archivo no está, se entra en silencio y no se avisa de nada.

Se declara como un campo más del perfil, en `lib/profiles.ts`:

```ts
anthem: '/audio/himno.mp3',
anthemLabel: 'Himno del Real Madrid',
```

Sin ese campo, se entra en silencio.

### Los archivos los pones tú

Van en `public/audio/` (las instrucciones completas, en `public/audio/LEEME.md`):
`himno.mp3` para los peques y `maria.mp3` para María. Recorta el trozo que quieras
oír —con 25-30 segundos basta, unos 400 KB— en vez de subir el tema entero.

Las dos piezas tienen **derechos de autor**, así que colocarlas ahí y desplegar
significa servirlas en una URL pública. Para uso doméstico lo sensato es cerrar el
acceso: **Vercel → Settings → Deployment Protection** deja la app sólo para quien
inicie sesión con tu cuenta, y de paso protege `/api/plato` y `/api/consejo` de que
alguien gaste tu clave.

## La nube: Supabase

Sin configurar nada, la app guarda en el navegador y punto: rápida, privada y sin
cuentas, pero cada móvil tiene su propia copia y borrar los datos del navegador se
lo lleva todo. Con Supabase configurado, **lo registrado se guarda de verdad y se ve
igual desde los cuatro móviles**.

El diseño es **local-first**: se escribe primero en el móvil y la nube va detrás. Por
eso la app sigue funcionando sin cobertura —en un campo de fútbol, por ejemplo— y lo
registrado sube solo en cuanto vuelve la conexión.

### Puesta en marcha, una vez

1. Crea un proyecto en [supabase.com](https://supabase.com) (el plan gratuito sobra).
2. **SQL Editor** → pega entero `supabase/schema.sql` → *Run*. Crea las tres tablas,
   sus políticas de seguridad y el cubo de las fotos.
3. **Project Settings → API** → copia *Project URL* y la clave *anon public*.
4. En Vercel, **Settings → Environment Variables**:
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Estas dos se
   incrustan al compilar, así que hay que **volver a desplegar** después de añadirlas.
5. Abre la app: pedirá correo y contraseña. La primera vez, «Crear la cuenta la
   primera vez». Si Supabase pide confirmar el correo, confírmalo y vuelve a entrar
   (o desactiva *Confirm email* en **Authentication → Providers → Email**).
6. En cada móvil de casa se entra **una sola vez**: la sesión queda guardada.

### Qué sube y qué no

| Sube | Se queda en el móvil |
| ---- | -------------------- |
| Registros diarios, notas y observaciones | El PIN del módulo de pareja |
| Comidas: nota, alimentos y consejos | La caché de miniaturas (se rellena sola desde la nube) |
| Miniaturas de los platos (cubo `comidas`) | La preferencia «trabajar sólo en este móvil» |
| Consejos del día y retos de progresión | |

### Cómo resuelve los conflictos

Cada fila lleva `updatedAt` y **gana la edición más reciente**. Para una casa, donde
dos personas casi nunca editan el mismo día del mismo perfil a la vez, es la regla
más simple que no pierde datos de forma sorprendente.

Los borrados se anotan como **lápidas** (`tabla:id`) y se propagan en la siguiente
subida; hasta entonces esa fila no se vuelve a bajar. Sin ellas, borrar un día en un
móvil no serviría de nada: volvería en la siguiente sincronización.

La mezcla se rehace siempre contra el estado del instante en que termina, no contra
la foto de cuando empezó, de modo que lo que alguien escriba mientras sincroniza no
se pisa.

### Seguridad

Las tres tablas tienen **RLS** y sus políticas sólo dejan ver y tocar las filas cuyo
`owner` coincide con la sesión. Sin haber entrado no se lee absolutamente nada, aunque
alguien tenga la clave pública (que va, por fuerza, dentro del navegador). El cubo de
fotos es privado y se sirve con URL firmada.

La cuenta es **compartida por la casa**: quien entra ve los seis perfiles, igual que
antes. El módulo de pareja sigue protegido por su PIN, que es una barrera doméstica,
no un muro.

## Fotos de comida

En el registro diario de quien tiene objetivos de alimentación (Leo, Hugo, María y
Víctor) hay una tarjeta **📷 Foto de la comida**: se elige el momento del día —que
viene propuesto según la hora—, se hace la foto del plato y Claude devuelve una
**nota de 0 a 10** y de uno a tres ajustes concretos: qué reducir, qué aumentar,
qué cambiar por otra cosa o qué añadir.

El plato no se juzga en abstracto, sino **contra el objetivo de quien come**: el
análisis recibe la edad, el papel en la familia, los objetivos diarios de comida
declarados en `lib/habits.ts` y lo que esa persona ya lleva registrado hoy, para no
repetir un consejo que ya está cumplido.

Con los peques hay reglas innegociables en el *prompt* del sistema: no se menciona
nunca peso, calorías ni dietas, ningún alimento es «malo», y se prioriza añadir y
cambiar antes que quitar. Es una orientación doméstica, no un consejo médico, y así
se dice en la propia tarjeta.

### Cómo está montado

| Pieza | Qué hace |
| ----- | -------- |
| `app/api/plato/route.ts` | Valida la petición, llama a Claude con visión y devuelve el veredicto ya comprobado contra un esquema de Zod. Vive en el servidor porque la clave de la API no puede estar en el navegador. |
| `lib/mealPrompt.ts` | Arma el contexto (quién come, sus objetivos, lo ya registrado) a partir del catálogo de hábitos, para no repetir los objetivos en dos sitios. |
| `lib/photos.ts` | Reduce la foto en el propio móvil a 1024 px para analizarla y a 320 px para guardarla, y gestiona las miniaturas en IndexedDB. |
| `components/meals/MealPhotoCard.tsx` | La tarjeta: momento del día, botón de foto, resultado y comidas del día con su media. |

La foto **completa nunca se sube**: se reduce antes de enviarla, y de lo que queda
sólo se guarda una **miniatura en IndexedDB** de este dispositivo —`localStorage`,
donde vive el resto de la base, se llenaría en dos semanas—. Las miniaturas que ya no
pertenecen a ninguna comida se borran al arrancar la app.

La nota y los consejos sí viajan en la copia de seguridad (`meals` en el JSON
exportado, versión 2 del formato); las miniaturas no, porque son locales: al
importar en otro móvil se conservan las notas pero no las fotos.

Las notas de las comidas **no cuentan** para el cumplimiento diario ni para los
retos: son una lectura aparte, y las casillas de nutrición se siguen marcando a mano.

> **Aviso:** `/api/plato` y `/api/consejo` son rutas públicas del despliegue. Si te preocupa que
> alguien que descubra la URL consuma tu clave, activa *Deployment Protection* en
> Vercel (Settings → Deployment Protection) o una regla de *Firewall* con límite de
> peticiones.

## Observaciones en voz alta y consejo del día

La nota del día tiene un botón **🎙️ Contarlo en voz alta**: se dicta cómo ha ido cada
hábito —el entrenamiento, el trabajo, lo que se ha comido, lo que ha dolido— y el
texto se va escribiendo solo en la nota, que sigue siendo editable a mano.

Con **💡 Consejo para mañana**, lo contado se manda junto con lo registrado ese día y
vuelve con uno a tres consejos concretos para mañana o los próximos días. Nada de
«esfuérzate más»: qué hacer, cuánto y cuándo.

### El reto progresivo

Si el día incluye **gimnasio o entrenamiento propio**, el consejo trae además un reto
para la siguiente sesión, **un punto por encima de lo hecho**: una serie más, dos
minutos más, un descanso más corto. Para calibrarlo recibe las **tres últimas semanas
de sesiones** y el reto anterior, de modo que la progresión sube desde la marca real y
no pega saltos imposibles; el campo `partiendoDe` dice sobre qué se ha construido.

Ese reto se queda **pendiente en la cabecera del día** hasta que se marca `✅
Conseguido` o pasan quince días, así que aparece justo antes de la siguiente sesión,
que es cuando sirve de algo. El siguiente consejo lo tiene en cuenta para subir desde
ahí en lugar de repetirlo.

Con los peques rigen las mismas reglas que en las fotos de comida: nada de peso ni
calorías, nada de cargas de adulto —técnica, repeticiones con su propio cuerpo y
constancia— y, si cuenta que le duele algo, el consejo es parar y avisar en casa.

### Por qué el dictado es del navegador

Claude no acepta audio, sólo texto e imagen. El reconocimiento de voz lo hace el
propio móvil con la **Web Speech API** (`hooks/useDictation.ts`), así que no hay
proveedor extra, no hay coste añadido y **ningún audio sale del dispositivo**: lo que
viaja a `/api/consejo` es el texto. Donde el navegador no lo soporte, el botón no
aparece y todo funciona escribiendo a mano.

## Retos

La pestaña **🎯 Retos** propone cada semana tres objetivos calculados a partir de los
**últimos 28 días de ese mismo perfil**. Nadie compite contra una tabla general: el
listón sale siempre de la marca propia, así que «máximo esfuerzo» significa una cosa
para Leo y otra para María.

| Nivel             | Qué persigue                                   | Ejemplos generados                                                    |
| ----------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| **Cimiento**      | Asegurar el suelo                              | «Anota 7 días», «Estrena la pausa consciente», «Sueño al completo»     |
| **Reto**          | Atacar el punto flojo y acumular aprendizaje   | «Sin pantallas antes de dormir · 4 días», «Semana de lectura: 185 min» |
| **Máximo esfuerzo** | Batir la marca propia o darlo todo           | «Bate tu récord de lectura: 40 min», «Máximo esfuerzo · Natación»      |

Cómo se decide cada uno (`lib/challenges.ts`):

- **Punto flojo** — la métrica con peor cumplimiento medio. Lo que sólo ocurre los
  días de actividad (cada deporte) se pide según su frecuencia real, no cuatro veces
  por semana; y las métricas subjetivas (escalas, sensaciones) ceden ante las que
  dependen de una decisión.
- **Récord personal** — sólo donde *más es mejor* (`focus`): dormir once horas o beber
  catorce vasos no es mejorar, así que ahí el récord se detiene en el objetivo.
  El listón sube un 12 % sobre la mejor marca, redondeado al paso de la métrica.
- **Aprendizaje** — volumen acumulado de la semana (lectura, escritura, análisis
  táctico, preparación de clases), un 10 % por encima de su mejor semana.
- **Categoría al completo** — un peldaño por encima de su nivel real, no un 80 %
  abstracto. El desglose deportivo queda fuera: nadie hace sus cinco actividades el
  mismo día.
- **Comodines** — constancia, racha y registro, para que siempre haya un reto de cada
  nivel aunque el perfil esté recién estrenado.

### Premios

Cada reto superado entrega un regalo, y el nivel del reto decide la rareza:

| Perfil          | Colección                | Cimiento         | Reto                                        | Máximo esfuerzo                          |
| --------------- | ------------------------ | ---------------- | ------------------------------------------- | ---------------------------------------- |
| **Leo · Hugo**  | Álbum de cromos          | LaLiga           | Estrellas + secundarios de *Oliver y Benji* | Leyendas del fútbol + Oliver, Benji, Mark Lenders y Roberto Sedinho |
| **María**       | Frases                   | Frase del día    | Frase de fuerza                             | Frase de oro (Machado, Mistral, Sor Juana, Cervantes, Concepción Arenal…) |
| **Víctor**      | Aforismos de paternidad y oficio | Aforismo | Aforismo de fuerza                          | Aforismo de oro (Séneca, Marco Aurelio, Will Durant…) |
| **Familia**     | Aforismos de la casa     | Aforismo         | Aforismo de fuerza                          | Aforismo de oro (Tolstói, Pitágoras…)    |
| **Pareja**      | Aforismos de los dos     | Aforismo         | Aforismo de fuerza                          | Aforismo de oro (Saint-Exupéry…)         |

Cada cromo lleva su equipo, su demarcación, aquello por lo que se le recuerda y un
**lema** que traduce esa historia a esfuerzo («Estar siempre disponible también es un
talento», del cromo de Iñaki Williams). Las frases y los aforismos van marcados por
tema: 🏡 familia · 🌿 para ti · 💻 aula · 👨‍👦 paternidad · ⚽ oficio · 💞 pareja.

El premio se **anuncia antes** («🎁 En juego: Cromo de leyenda») y se entrega al
superar el reto, con el cromo o la frase visibles en la propia tarjeta y guardados
en la colección de abajo. Cada perfil baraja su mazo con su semilla, así que Leo y
Hugo no reciben los cromos en el mismo orden, y no se repite ninguno mientras queden
cartas sin salir.

Los mazos de `lib/rewards.ts` son catálogo editable, igual que `lib/habits.ts`:
añadir un cromo o un aforismo es añadir un objeto a la lista de su nivel. Cada mazo
declara además cómo se llama a sí mismo (`labels` para las rarezas, `album` para el
título y el plural), que es lo que distingue «Cromo de leyenda» de «Aforismo de oro»
sin duplicar componentes.

Ni los retos ni los premios **se guardan**: son una función pura de los registros, de
modo que se recalculan solos y tanto el medallero como el álbum se reconstruyen con
sólo tener el historial (una exportación de los datos se lleva la colección consigo).
Los retos se generan con los datos anteriores al lunes, así que el listón no se mueve
mientras la semana corre, y la rotación entre candidatos usa una semilla estable por
perfil y semana: durante siete días son siempre los mismos tres.

## Pieles visuales

Cada perfil declara una `skin` en `lib/profiles.ts`. La piel no es una variante
de componente: es un juego completo de *tokens* CSS (fondo, superficies, bordes,
texto, tipografía de titulares) definido en `app/globals.css` bajo `[data-skin=…]`.
`app/page.tsx` fija el atributo en `<main>` y en `<html>` según el perfil activo,
de modo que basta añadir un bloque de variables para inventar una piel nueva.

| Piel        | Perfiles          | Registro visual                                                        |
| ----------- | ----------------- | ---------------------------------------------------------------------- |
| `pitch`     | Leo · Hugo        | Verde césped, franjas de siega, líneas de cal, tipografía de dorsal, marcador de estadio, cromo y foto de acción. El fútbol ocupa fila completa en el desglose deportivo. |
| `editorial` | María · Víctor    | Papel claro, serif de titular, filetes finos, mucho aire y retrato enmarcado. Acento esmeralda (Víctor) y rosa (María). |
| `night`     | Familia · Pareja · selector | La piel oscura neutra de siempre, con foto lateral en la cabecera. |

Los componentes **nunca** usan colores literales: emplean las utilidades
`t-1`/`t-2`/`t-3` (texto), `surf-1`/`surf-2`/`surf-3` (superficies) y `hairline`
(bordes). Por eso el mismo control se lee bien sobre fondo oscuro y sobre papel.
El acento de cada perfil tiene dos valores: `accent` para fondos oscuros y
`accentDeep` para la piel clara, donde un rosa pastel no tendría contraste
suficiente; `accentFor(profile, skin)` resuelve cuál toca.

El acento viaja por el mismo camino que las pieles: `app/page.tsx` lo publica
como variable CSS `--accent` sobre `<main>` (`accentStyle()`), y los componentes
lo consumen con `bg-accent`, `t-accent`, `border-accent`, `bg-accent-soft` o
`bg-accent-faint`. Escribirlo en un `style` elemento a elemento, como se hacía
antes, impedía teñir los estados `:hover` y `:focus`; ahora el anillo de foco
de toda la app es el color del perfil activo.

## Fotos

Las imágenes de `public/photos` son recortes ya optimizados de las fotos
originales (~2,5 MB en total). Cada perfil puede declarar:

| Campo          | Uso                                                        |
| -------------- | ---------------------------------------------------------- |
| `photo`        | Retrato cuadrado: avatar del selector y de la barra superior |
| `cover`        | Banda apaisada de la tarjeta del selector                   |
| `hero`         | Imagen de la cabecera del panel                             |
| `heroPosition` | `object-position` de esa cabecera, para encuadrar las caras |
| `card`         | Cromo de los peques, pegado sobre la foto de acción         |

Todos son opcionales: sin `photo` el avatar cae al emoji sobre su degradado, y
sin `hero` la cabecera se pinta sin foto. Para cambiar una imagen basta con
sustituir el archivo manteniendo el nombre.

## Interfaz

- **Niños**: tarjetas grandes, emojis tocables, barras gruesas, estrellas y mensajes de ánimo.
- **Adultos y grupos**: filas compactas, segmentados Sí/No, deslizadores y anillos de progreso.
- **Retos**: tres objetivos de la semana con su porqué, puntos y medallero de las anteriores.
- **Comidas**: foto del plato, nota de 0 a 10 y qué reducir, aumentar, cambiar o añadir.
- **Sonido**: cada perfil puede recibirte con su sintonía, silenciable desde Ajustes.
- **Voz**: se cuenta el día en voz alta y sale un consejo para mañana y un reto de entreno.
- **Resúmenes**: barras de la semana, mapa de calor del mes, desglose por categoría, rachas y logros.

## Usabilidad

El registro diario es la operación que más se repite, así que todo lo demás
se ordena a su alrededor:

| Gesto                       | Qué hace                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| `←` `→`                     | Día anterior / siguiente (nunca más allá de hoy)                     |
| `H`                         | Volver a hoy                                                         |
| `Esc`                       | Salir al selector de perfiles (o cerrar el diálogo abierto)          |
| **Copiar del día anterior** | Trae los registros de ayer sin pisar lo que ya hubiera en hoy        |
| **Sólo pendientes**         | Oculta las categorías ya completas para ver de un vistazo qué falta  |

Ninguna acción destructiva es definitiva de un solo toque: borrar el día,
importar, cargar datos de ejemplo y vaciarlo todo actúan de inmediato y
ofrecen **Deshacer** en un aviso, en lugar de interrumpir con una confirmación
previa. El estado del guardado (`⏳ Guardando…` / `✓ Guardado`) se acusa junto a
la nota del día; la escritura en `localStorage` va diferida 350 ms para no
serializar la base entera en cada tecla, y se vuelca si la pestaña se oculta.

Los ajustes permiten **exportar e importar** el JSON: una copia de seguridad que
no se puede restaurar no es una copia. Al importar se elige entre fusionar con
lo actual o reemplazarlo.

### Accesibilidad

- Anillo de foco visible en **todo** elemento que reciba el teclado, teñido con
  el acento del perfil.
- Diálogos con `Escape`, foco atrapado dentro del panel, fondo bloqueado y
  devolución del foco al cerrarse.
- `aria-pressed`, `aria-expanded`, `aria-current` y `role="group"` en los
  controles; los cambios de cumplimiento se anuncian con `aria-live`.
- Se respeta `prefers-reduced-motion`: las animaciones se anulan.
- Enlace «Saltar al contenido» y áreas tocables holgadas en el móvil.

## Instalación en el móvil

La app declara manifiesto e icono, así que se puede **añadir a la pantalla de
inicio** y abrirse sin barra del navegador. El color de la barra de estado
acompaña a la piel del perfil activo, y los márgenes respetan el *notch*.

## Privacidad

El módulo de pareja se protege con un PIN (por defecto `2468`, modificable en Ajustes;
la pantalla de bloqueo sólo muestra esa pista mientras nadie lo haya cambiado).
Es una barrera doméstica, no seguridad real: los datos viven sin cifrar en el `localStorage`
del navegador. Si en el futuro se quiere sincronizar entre dispositivos, basta con sustituir
`loadDatabase` / `saveDatabase` en `lib/storage.ts` por llamadas a una API.
