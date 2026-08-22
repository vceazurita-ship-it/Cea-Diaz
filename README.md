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
  layout.tsx           Layout raíz, metadatos y modo pintado antes del primer render
  api/plato/route.ts   Análisis de la foto del plato con Claude
  api/consejo/route.ts Consejo del día y reto progresivo con Claude
  page.tsx             Orquestador: selector ↔ dashboard ↔ PIN ↔ ajustes
  manifest.ts          Manifiesto PWA (instalable en el móvil)
  globals.css          Tailwind + utilidades propias (.card, .card-kid, .btn…)
components/
  Ambient.tsx          Decoración de fondo, teñida con el color del perfil
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
    MealPhotoCard.tsx  Plato desde la cámara o la galería, nota y recomendaciones
  notes/
    DayNoteCard.tsx    Observaciones dictadas, consejo y reto pendiente
  DateNavigator.tsx    Navegación por días con tira semanal
  CategoryCard.tsx     Categoría plegable con su cumplimiento y su nota
  SportsPanel.tsx      Layout especial del desglose deportivo
  PinLock.tsx          Bloqueo del módulo privado de pareja
  SettingsPanel.tsx    Modo día/noche, portada, ejemplo, copias, PIN y borrado
  controls/            Un control por tipo de métrica + despachador
  summary/             Gráfico semanal, mapa mensual, logros y vista de resumen
  ui/                  Avatar, ProgressBar, ProgressRing, Stars, Modal, Toast, VoiceField, ThemeToggle
hooks/
  useHabitStore.ts     Estado global + persistencia en localStorage
  useDictation.ts      Dictado por voz con la Web Speech API, un micro a la vez
  useTheme.tsx         Modo día o noche, guardado en este dispositivo
  useAppearance.tsx    Fotos y sintonías que sustituyen a las de fábrica
public/
  photos/              Retratos, cabeceras y cromos ya recortados
  audio/               Sintonías de perfil (las pone cada casa)
  icon.svg             Icono de la app instalada
lib/
  profiles.ts          Los 6 perfiles: datos, fotos, tinte, acentos y piel
  habits.ts            Catálogo de categorías y métricas por perfil
  scoring.ts           Cumplimiento, estrellas, rachas, logros
  challenges.ts        Generador de retos semanales a partir del historial
  rewards.ts           Mazos de cromos y frases, y su reparto por reto superado
  mealPrompt.ts        Contexto e instrucciones del análisis de fotos de comida
  advicePrompt.ts      Contexto del consejo del día y de la progresión de entreno
  photos.ts            Reducción de fotos y miniaturas en IndexedDB
  rateLimit.ts         Tope de peticiones por IP en las rutas de Claude
  sound.ts             Sintonía al entrar en un perfil, con desvanecido
  supabase.ts          Cliente de la nube (opcional: sin claves, no se usa)
  cloud.ts             Sincronización: mezcla por fecha, lápidas y fotos
  dates.ts             Utilidades de fecha en es-ES
  storage.ts           Lectura/escritura en localStorage
  appearance.ts        Ranuras de aspecto (fotos y sintonía) en IndexedDB
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

Al entrar en un perfil suena su música: Leo y Hugo reciben la sintonía de *Oliver y
Benji* y María, *A Thousand Years*. Suena **veinte segundos**, entra y sale con un
desvanecido, y se corta con el botón que aparece abajo a la derecha. Se apaga del todo
en **⚙️ Ajustes → Sonido**.

Tres detalles de comportamiento, para que sea una alegría y no un incordio:

- **Sólo con gesto**: arranca al tocar el perfil, nunca al cargar la página. Es también
  la única forma de que el navegador deje sonar algo.
- **Con espera**: no se repite si se entra y se sale del mismo perfil en dos minutos.
- **Sin drama**: si el archivo no está, se entra en silencio y no se avisa de nada.

Se declara como un campo más del perfil, en `lib/profiles.ts`:

```ts
anthem: '/audio/oliver.mp3',
anthemLabel: 'Oliver y Benji',
```

Sin ese campo, se entra en silencio.

### Los archivos los pones tú

Van en `public/audio/` (las instrucciones completas, en `public/audio/LEEME.md`):
`oliver.mp3` para los peques y `maria.mp3` para María. Como la app sólo reproduce los
primeros veinte segundos y el navegador pide el archivo por rangos, un tema entero
suena igual de rápido; recortarlo sólo ahorra peso en el repositorio.

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

> **Si ya tenías Supabase montado antes de las notas por categoría:** vuelve a pegar
> `supabase/schema.sql` entero y dale a *Run*. Es idempotente —no borra nada— y añade
> las dos columnas nuevas (`entries.notes` y `meals.context`). Hasta que se ejecute,
> este móvil guarda igual pero la subida a la nube falla y lo avisa en Ajustes.

### Qué sube y qué no

| Sube | Se queda en el móvil |
| ---- | -------------------- |
| Registros diarios, observaciones y notas de categoría | El PIN del módulo de pareja |
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
viene propuesto según la hora—, se pone el plato y Claude devuelve una **nota de 0 a
10** y de uno a tres ajustes concretos: qué reducir, qué aumentar, qué cambiar por
otra cosa o qué añadir.

La foto puede venir de dos sitios, y por eso hay dos botones:

- **📸 Hacer foto del plato** abre directamente la cámara.
- **🖼️ Elegir una del móvil** abre la galería, para el plato que ya se fotografió
  antes de sentarse a comer o el que llegó por WhatsApp.

Son dos `<input type="file">` distintos porque el atributo `capture` es lo que manda
al móvil abrir el objetivo, y un mismo campo no puede hacer las dos cosas.

Encima de los botones hay un campo **🗣️ Cuéntalo (opcional)**, que se escribe o se
dicta: lo que la foto no puede enseñar —cómo está cocinado, si se lo terminó, qué
bebió con ello—. Va con la foto al análisis y se guarda con la comida, para saber
después sobre qué se juzgó.

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
| `components/meals/MealPhotoCard.tsx` | La tarjeta: momento del día, lo que se cuenta del plato, cámara o galería, resultado y comidas del día con su media. |

La foto **completa nunca se sube**: se reduce antes de enviarla, y de lo que queda
sólo se guarda una **miniatura en IndexedDB** de este dispositivo —`localStorage`,
donde vive el resto de la base, se llenaría en dos semanas—. Las miniaturas que ya no
pertenecen a ninguna comida se borran al arrancar la app.

La nota, lo que se contó del plato y los consejos sí viajan en la copia de seguridad
(`meals` en el JSON exportado, versión 5 del formato); las miniaturas no, porque son
locales: al importar en otro móvil se conservan las notas pero no las fotos.

Las notas de las comidas **no cuentan** para el cumplimiento diario ni para los
retos: son una lectura aparte, y las casillas de nutrición se siguen marcando a mano.

> **Aviso:** `/api/plato` y `/api/consejo` son rutas públicas del despliegue. Llevan un
> **tope de 20 peticiones cada 10 minutos por IP** (`lib/rateLimit.ts`), invisible para
> el uso de casa, que acota lo que alguien podría gastar de tu clave. No es una
> barrera: el contador vive en memoria y en Vercel una función puede correr en varias
> instancias, así que el límite es por instancia y se reinicia al enfriarse. La barrera
> de verdad es **Settings → Deployment Protection**, que deja la app —y con ella sus
> rutas y la música— sólo para quien inicie sesión con tu cuenta de Vercel.

## Observaciones en voz alta y consejo del día

La nota del día tiene un botón **🎙️ Contarlo en voz alta**: se dicta cómo ha ido cada
hábito —el entrenamiento, el trabajo, lo que se ha comido, lo que ha dolido— y el
texto se va escribiendo solo en la nota, que sigue siendo editable a mano.

### Dónde se puede dictar

El campo dictable es el mismo componente en todas partes
(`components/ui/VoiceField.tsx`), así que se comporta igual en los cuatro sitios en
que aparece:

| Dónde | Qué se apunta ahí |
| ----- | ----------------- |
| **📔 Observaciones del día** | El relato de la jornada, del que sale el consejo. |
| **📝 Nota de cada categoría** | Lo que ninguna casilla recoge: «le dolía el tobillo», «sólo media hora de entreno». Está al final de cada tarjeta desplegada, y la tarjeta plegada lo delata con un 📝. |
| **📝 Cómo van los retos** | En la pestaña de retos: qué se atasca, qué habría que cambiar. |
| **🗣️ Cuéntalo** | En la tarjeta de la comida, lo que la foto no enseña. |

Lo dictado se **añade al final** de lo que ya hubiera, así que se puede escribir un
poco, dictar el resto y corregir a mano. Sólo hay un micrófono abierto a la vez:
empezar a dictar en un campo cierra el anterior en vez de pelearse con él.

Las notas de las categorías y la de los retos se guardan en el registro del día
(`notes` en `DayEntry`, columna `notes` en la tabla `entries`) y **viajan al consejo
del día** junto con las observaciones y lo registrado. No cuentan para el
cumplimiento: son contexto, no una métrica más.

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

## Color: modo, tinte y piel

Tres cosas deciden cómo se ve la app, y son independientes entre sí. Eso es lo que
permite que Leo sea verde y Hugo rojo sin duplicar ni un componente, y que los dos
se vean bien de día y de noche.

| Pieza | Qué decide | Dónde vive |
| ----- | ---------- | ---------- |
| **Modo** (`data-mode`) | Día o noche. Vale para toda la app. | Lo elige la casa; se guarda en este dispositivo |
| **Tinte** (`--tint`) | De qué color es la sección: verde, rojo, azul noche… | `tint` en `lib/profiles.ts` |
| **Piel** (`data-skin`) | La maquetación y la tipografía de titulares | `skin` en `lib/profiles.ts` |

### Modo día y modo noche

Un interruptor **☀️/🌙** siempre a mano: en la barra superior dentro de un perfil y
junto a **⚙️ Ajustes** en el pie, que está también en la pantalla de inicio. En
Ajustes hay además las tres opciones completas:

- **📱 Automático** (por defecto) sigue lo que tenga configurado el móvil, y lo
  acompaña si el teléfono cambia solo al anochecer.
- **☀️ Día** y **🌙 Noche** mandan sobre el móvil y se recuerdan.

La elección **no viaja a la nube** a propósito: es una preferencia del aparato —la
tableta de la cocina y el móvil de la mesilla no quieren lo mismo—, igual que el
volumen o el PIN. Un guion mínimo en `app/layout.tsx` pinta el modo elegido **antes
del primer pintado**, para que quien use el modo día no vea un fogonazo oscuro en
cada carga.

### El tinte de cada perfil

| Perfil | Color | Acento de noche | Acento de día |
| ------ | ----- | --------------- | ------------- |
| **Leo** | Verde | `#4ade80` | `#15803d` |
| **Hugo** | Rojo | `#f87171` | `#b91c1c` |
| **María** | Rosa | `#f472b6` | `#be3a6e` |
| **Víctor** | Azul noche | `#60a5fa` | `#1d4ed8` |
| **Familia** | Naranja | `#fb923c` | `#c2410c` |
| **Pareja** | Frambuesa | `#f43f5e` | `#be123c` |

El tinte tiñe el **fondo, las tarjetas, los bordes, los textos, las barras y los
botones** de toda la sección. Los redondeles de cada categoría y de los cinco
deportes conservan su color propio: son lo que permite distinguir 🍎 nutrición de
😴 sueño de un vistazo, y uniformarlos los volvería indistinguibles.

Los tokens no se escriben a mano: se calculan mezclando el tinte con un gris base
con `color-mix()`, así que **inventar un color nuevo es declarar un `--tint` y nada
más**. `app/page.tsx` lo publica sobre `<main>` y sobre `<html>`, igual que el
acento, y de ahí salen `--bg`, `--surface`, `--border`, `--text`…

> El cálculo depende de `color-mix()`, disponible en Chrome 111+, Safari 16.2+ y
> Firefox 113+ (finales de 2022 en adelante). En un navegador más antiguo los
> fondos no se resolverían.

Las proporciones de la mezcla están elegidas para que **los seis perfiles pasen
AA (4,5:1)** en los dos modos, incluido el texto terciario, que es el más pequeño.

### Las pieles

La piel ya no decide colores: sólo cómo se compone la página.

| Piel | Perfiles | Registro visual |
| ---- | -------- | --------------- |
| `pitch` | Leo · Hugo | Franjas de siega, líneas de cal, tipografía de dorsal, marcador de estadio, cromo y foto de acción a sangre. El fútbol ocupa fila completa en el desglose deportivo. |
| `editorial` | María · Víctor | Serif de titular, filetes finos, mucho aire y retrato enmarcado. |
| `night` | Familia · Pareja · selector | Composición neutra con foto lateral en la cabecera. |

Los componentes **nunca** usan colores literales: emplean `t-1`/`t-2`/`t-3` (texto),
`surf-1`/`surf-2`/`surf-3` (superficies), `hairline` (bordes) y `track` (carriles).
Por eso el mismo control se lee bien en verde de noche y en azul sobre papel. Las
franjas de césped y las líneas de cal también son tokens (`--stripe`, `--chalk`):
claras sobre fondo oscuro y oscuras sobre papel, porque una cal blanca sobre papel
blanco no se vería.

El acento tiene dos valores por perfil, `accent` y `accentDeep`, y
`accentFor(profile, mode)` resuelve cuál toca: el mismo verde claro que luce de
noche se pierde sobre papel blanco.
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
sustituir el archivo manteniendo el nombre… o hacerlo desde la propia app, que es
lo que de verdad usa la casa.

### La portada de la app

La foto grande de la pantalla de inicio no es de ningún perfil: es de la casa. Se
cambia desde **⚙️ Ajustes → Aspecto de la app → Portada**, o tocando el botón
**🖼️ Cambiar portada** que hay sobre la propia foto.

Por dentro es una ranura más del almacén de aspecto, sólo que su dueño no es un
perfil sino `app` (`APP_OWNER` en `lib/appearance.ts`). En la nube es un
`profile_id` más —la columna no tiene clave ajena—, así que **se sincroniza con el
resto de móviles sin ningún caso especial** y sin tocar el esquema. Sin foto
elegida se pinta la de fábrica, `/photos/portada.jpg`.

### Fotos y sintonía de cada perfil

Desde **🎨** en la barra superior, con el perfil abierto: retrato, foto grande de
la cabecera, banda de la tarjeta del selector, cromo (sólo los peques) y sintonía.
Todo se guarda en IndexedDB como Blob y viaja a la nube si hay sesión; **↩️
Original** deshace la personalización y devuelve lo que trae el código.

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

### En el móvil

La app se usa sobre todo con el pulgar y de pie, así que hay cuatro cosas
resueltas a propósito:

- **Todo lo tocable llega a 40 px de alto.** El suelo lo pone `.btn` en
  `globals.css`, no cada botón por su cuenta; los que no son `.btn` (las fichas
  del contador, el Sí/No, el cierre de los avisos) lo llevan declarado.
- **Los campos van a 16 px en pantalla estrecha.** Por debajo de eso, Safari de
  iPhone amplía la página al enfocar y luego no la devuelve: escribir una nota
  dejaba la app descuadrada. A partir de tableta vuelven a 14.
- **Al tocar hay acuse.** La app apaga el destello gris del navegador porque
  ensucia las tarjetas, así que devuelve un `scale: 0.98` inmediato. Se usa la
  propiedad `scale` y no `transform` para que se componga con los `transform`
  que ya llevan algunos botones en lugar de pisarlos.
- **Las hojas modales miden con `dvh`.** Con `vh`, la barra de direcciones
  cuenta como espacio libre y la hoja se sale por abajo. El bloqueo del fondo
  fija el `<body>` a su posición y la restituye al cerrar, que es lo único que
  impide que Safari arrastre la página por detrás.

Nada de esto tiene equivalente al pasar el ratón, así que **lo que sólo se veía
al posarse encima ahora se ve siempre**: el porcentaje de cada barra en el
gráfico de la semana estaba escondido tras un `:hover` y era inalcanzable justo
en el aparato desde el que más se consulta.

### En el portátil

- Ajustes y el editor de aspecto se abren en panel ancho, con las ranuras de
  fotos a dos columnas.
- `color-scheme` acompaña al modo, así que la barra de desplazamiento, los
  menús nativos y el relleno de contraseñas dejan de pintarse en blanco contra
  una app oscura.
- Los atajos de teclado se anuncian sólo donde hay teclado.

### Accesibilidad

- Anillo de foco visible en **todo** elemento que reciba el teclado, teñido con
  el acento del perfil.
- Diálogos con `Escape`, foco atrapado dentro del panel, fondo bloqueado y
  devolución del foco al cerrarse.
- `aria-pressed`, `aria-expanded`, `aria-current` y `role="group"` en los
  controles; los cambios de cumplimiento se anuncian con `aria-live` (una sola
  región viva: anidarlas hacía que el aviso se cantara dos veces).
- Se respeta `prefers-reduced-motion`: las animaciones se anulan.
- Enlace «Saltar al contenido».
- **Contraste comprobado, no supuesto.** Las proporciones de mezcla de
  `globals.css` están elegidas para que los seis perfiles, en los dos modos,
  pasen AA (4,5:1) en las nueve combinaciones que la app usa de verdad: los tres
  niveles de texto sobre tarjeta y sobre chip, el texto encima del acento, el
  acento como texto y los dos velos de acento. El mapa de calor del mes rellena
  entre el 16 % y el 40 % de acento por el mismo motivo: llenar la casilla del
  todo no dejaba contraste para el número de encima.

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
