# Hábitos en Familia

Aplicación web independiente de seguimiento de hábitos para una familia de cuatro
(Leo, Hugo, María y Víctor) más dos módulos compartidos.

Funciona **local-first**: se escribe siempre primero en el navegador, así que la app
va rápida y no se cae sin cobertura. Encima de eso, dos servicios opcionales que se
activan con sus claves: **Supabase**, para que lo registrado se guarde de verdad y se
vea desde todos los móviles, y **Google Calendar**, para que los recados de cada uno
avisen a su hora. Sin claves, todo sigue funcionando contra el propio navegador.

## Puesta en marcha

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>. Para probar los resúmenes sin registrar nada a mano:
**⚙️ Ajustes → 💾 Datos → 🎲 Datos de ejemplo** (genera 28 días simulados para todos los perfiles).

Y para deshacer eso mismo cuando se empieza en serio: **⚙️ Ajustes → 💾 Datos → Zona
peligrosa → 🧹 Borrar sólo los días registrados**. Borra los días de todos los perfiles y no
toca nada más: los recados siguen ahí, las cuentas de la economía se guardan aparte y las
semanas del plan no se guardan —las calcula `lib/challenges.ts` cada vez—, así que el reparto
de entrenamiento y los retos de la semana aparecen igual, sólo que sin nada marcado.

El borrado viaja por lápidas, no por olvido: cada día borrado deja su `entries:<id>` en
`tombstones`, y por eso desaparece también del móvil en la siguiente sincronización. Borrarlo
a mano en Supabase no serviría —el navegador que aún los tuviera los volvería a subir.

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
| `NEXT_PUBLIC_SUPABASE_URL` | Guardar y sincronizar entre móviles | Cada móvil guarda sólo lo suyo |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ídem | Ídem |
| `GOOGLE_CLIENT_ID` | Llevar las tareas a Google Calendar | Las tareas se guardan igual, sin calendario |
| `GOOGLE_CLIENT_SECRET` | Ídem | Ídem |
| `SUPABASE_SERVICE_ROLE_KEY` | Guardar el permiso de Google (sólo en el servidor) | Ídem |

Las dos `NEXT_PUBLIC_*` se incrustan al compilar: si se añaden después del primer
despliegue, hay que **volver a desplegar** para que surtan efecto.

En local, copia `.env.example` a `.env.local` y rellena lo que quieras usar.
La puesta en marcha de Supabase está detallada más abajo.

## Estructura

```
app/
  layout.tsx           Layout raíz, metadatos y modo pintado antes del primer render
  api/calendario/       Cuenta de Google de cada perfil, vuelta del permiso y eventos
  page.tsx             Orquestador: selector ↔ dashboard ↔ PIN ↔ ajustes
  manifest.ts          Manifiesto PWA (instalable en el móvil)
  globals.css          Tailwind + utilidades propias (.card, .card-kid, .btn…)
components/
  Ambient.tsx          Decoración de fondo, teñida con el color del perfil
  ProfileSelector.tsx  Pantalla inicial con los 6 perfiles, su foto y su estado
  TopBar.tsx           Conmutador de perfiles siempre visible, con retratos
  Dashboard.tsx        Cabecera del perfil + pestañas Registro / Semana / Retos / Tareas / Resúmenes (+ Economía en Víctor)
  profile/
    ProfileHeader.tsx  Las tres cabeceras de perfil (fútbol, editorial, grupo)
  cloud/
    SignIn.tsx         Entrada con la cuenta de casa
  finance/
    FinanceLock.tsx    La clave de la sección de economía (sólo Víctor)
    FinancePanel.tsx   Las cuentas del curso: totales, autonomía y reparto
    FinancePlan.tsx    Qué hacer con ellas: veredicto, simulador y acciones con cifra
    FinanceAdvice.tsx  Lo que dicen las cuentas, y quién sostiene cada aviso
    FinanceStats.tsx   Las gráficas: el número, la escala, la serie y el patrimonio
    QuickUpdate.tsx    Poner las cifras del mes al día sin abrir seis libretas
    LedgerCard.tsx     Una libreta, con sus apuntes editables en el sitio
  challenges/
    ChallengesPanel.tsx  Retos de la semana, medallero y puntos
    RewardsAlbum.tsx     Álbum de cromos y colección de frases
  games/
    DailyGameCard.tsx    El juego del día de los peques: la partida y su cromo
  team/
    Campograma.tsx       El equipo montado con los cromos: formación, once y banquillo
  learning/
    LearningBonusCard.tsx  El bonus de aprendizaje del día, en su idioma
  notes/
    DayNoteCard.tsx    Observaciones del día y borrado del día
  planner/
    WeekPlanner.tsx    La semana tipo: horario completo, tarjetas de día y avisos de coherencia
    WeekTimetable.tsx  La semana tipo entera: siete columnas sobre la misma regla de horas
    BlockEditor.tsx    Alta y edición de un rato: cuándo, con quién y a qué hábito va atado
    PlanCopySheet.tsx  Copiar, repetir, mover o intercambiar un rato o un día entero
    DayChips.tsx       Los siete días a toques, con atajos de laborables y fin de semana
    PlanAlerts.tsx     Carencias, excesos y avisos de la semana
    TodayPlanCard.tsx  Lo previsto para hoy, dentro de la pantalla de registro
  tasks/
    TasksPanel.tsx     Recados y citas del perfil: lista por urgencia o mes
    TaskComposer.tsx   Alta y edición: qué, cuándo, aviso y repetición
    TaskItem.tsx       Una tarea: tachar, editar, copiar a días, mandar al calendario
    MonthGrid.tsx      El mes en una rejilla: carga de cada día y días marcados
    SpreadTasks.tsx    Copiar un recado —o el día entero— a varios días de golpe
    CalendarAccount.tsx Cuenta de Google enlazada y calendario de destino
  DateNavigator.tsx    Navegación por días con tira semanal
  CategoryCard.tsx     Categoría plegable con su cumplimiento, su nota y su criterio
  SportsPanel.tsx      Layout especial del desglose deportivo
  experts/
    AttentionCard.tsx  Lo que hoy pide atención, por prioridad
    CriteriaSheet.tsx  Ficha completa del criterio y de las referencias citadas
  PinLock.tsx          Bloqueo del módulo privado de pareja
  SettingsPanel.tsx    Ajustes en cinco apartados: aspecto, nube, sonido, datos y seguridad
  controls/            Un control por tipo de métrica + despachador
  summary/             Gráfico semanal, mapa mensual, logros y vista de resumen
  ui/                  Avatar, CromoPortrait, ProgressBar, ProgressRing, Stars, Modal, Switch, Toast, NoteField, ThemeToggle
hooks/
  useHabitStore.ts     Estado global + persistencia en localStorage
  useToday.ts          El día de hoy, y que siga siéndolo al cruzar la medianoche
  useTheme.tsx         Modo día o noche, guardado en este dispositivo
  useAppearance.tsx    Fotos y sintonías que sustituyen a las de fábrica
  useLineup.ts         El equipo guardado de un perfil, atento a lo que llegue de otro móvil
  useWeekPlan.ts       La agenda semanal de un perfil, atenta a lo que llegue de otro móvil
public/
  photos/              Retratos, cabeceras y cromos ya recortados
  audio/               Sintonías de perfil (las pone cada casa)
  icon.svg             Icono de la app instalada
lib/
  profiles.ts          Los 6 perfiles: datos, fotos, tinte, acentos y piel
  habits.ts            Catálogo de categorías y métricas por perfil
  experts.ts           Criterio experto de cada hábito: prioridad, cifra y quién la sostiene
  scoring.ts           Cumplimiento, estrellas, rachas, logros
  challenges.ts        Generador de retos semanales a partir del historial
  rewards.ts           Mazos de cromos y frases, y su reparto por reto y por partida
  cromoArt.ts          Equipaciones y rasgos con los que se dibuja el retrato de cada cromo
  games.ts             El juego del día: lógica, táctica y qué premio merece cada partida
  lineup.ts            Formaciones del campograma y el equipo guardado de cada perfil
  finance.ts           Economía: las seis libretas, sus cuentas y su guardado local
  financeExperts.ts    El criterio de las cuentas: quién lo sostiene y qué avisar
  financePlan.ts       El plan: veredicto del año, palancas y acciones ordenadas
  planner.ts           La agenda semanal: catálogo de ratos, semanas de ejemplo y guardado
  planCheck.ts         Cruce entre lo planificado y lo registrado: desenlaces y avisos
  learning.ts          Catálogo del bonus del día y elección según el interés
  tasks.ts             Recados: montones por urgencia, repetición, copias en serie y etiquetas
  calendar.ts          Lo que el navegador le pide al servidor sobre el calendario
  googleCalendar.ts    Google Calendar desde el servidor: permisos, tokens y eventos
  calendarLinks.ts     Los permisos guardados, uno por perfil, con el token cifrado
  supabaseAdmin.ts     Cliente con clave de servicio, sólo para las rutas de /api
  rateLimit.ts         Tope de peticiones por IP en las rutas de /api
  sound.ts             Sintonía al entrar en un perfil, con desvanecido
  supabase.ts          Cliente de la nube (opcional: sin claves, no se usa)
  cloud.ts             Sincronización: mezcla por fecha y lápidas
  replica.ts           La copia exacta: identidad del aparato y marca de réplica
  dates.ts             Utilidades de fecha en es-ES
  storage.ts           Lectura/escritura en localStorage
  appearance.ts        Ranuras de aspecto (fotos y sintonía) en IndexedDB
  seed.ts              Generador determinista de datos de ejemplo
supabase/
  schema.sql           Tablas, políticas RLS y cubo de fotos de perfil
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
| ↳ `direction: 'atMost'` | Pantallas de ocio (la meta es un **techo**) | 1 por debajo del techo, cayendo hasta 0 en el máximo |
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

Las **tareas** son la excepción a esa forma, y por eso viven en su propia colección
(`tasks`) con identificador propio: un hábito es la misma casilla repetida cada día,
pero dos «comprar leche» del mismo día son dos recados distintos y ninguno de los dos
pertenece a una fecha concreta del historial. Tampoco entran en el cumplimiento.

### Perfiles y categorías

| Perfil                  | Categorías                                                                        |
| ----------------------- | --------------------------------------------------------------------------------- |
| **Leo** (8), **Hugo** (9) | Nutrición e Hidratación · Sueño y Recuperación · Rendimiento Deportivo (Fútbol, Natación, Arte Marcial, Gimnasio, Atletismo, con asistencia/esfuerzo/sensaciones, más el movimiento del día y las marcas de sus dos escaleras: toques, flexiones, plancha y comba) · Cognitivo-Académico (época de exámenes, lectura en casa, escritura, techo de pantallas) |
| **María** (39)          | Sueño y Descanso · Nutrición e Hidratación · Movimiento y Fuerza · Desarrollo Personal · Profesional (clases de español online) |
| **Víctor** (42)         | Sueño y Descanso · Nutrición e Hidratación (con su protocolo: el arranque de la mañana, la suplementación, el escudo de las comidas fuera y el tránsito) · Movimiento y Fuerza (con su reparto semanal: pierna, pecho, dorsal, flexiones, series de carrera, core y rodaje, cada una con su marca) · Cuerpo y Composición (la medición de la mañana: peso, grasa, músculo, pulso en reposo y variabilidad) · Desarrollo Personal (lectura, escritura, máster, formación) · Profesional (preparación de sesiones, análisis táctico, cultura de equipo, microciclo, cuerpo técnico y alto rendimiento) · Casa y Vínculos (tiempo con los hijos y con María, la gente de uno, su parte de la casa, recados y la semana organizada) · Economía (gasto del día apuntado, compras impulsivas, revisión de cuentas) |
| **Hábitos en Familia**  | Rutinas en Familia · Tiempo Juntos                                                 |
| **Hábitos en Pareja**   | Tiempo a Solas · Conexión y Rutinas — protegido por PIN                            |

En los adultos, sueño, nutrición y movimiento van en tres tarjetas y no en una sola
de «Salud y Bienestar»: son los tres bloques que los expertos tratan por separado y
con cifras propias, y juntos se leían como un cajón de catorce casillas. La tarjeta
de sueño conserva el identificador `salud`, así que las notas ya escritas siguen
donde estaban.

#### Cuerpo y Composición: la única tarjeta que no es de hábitos

Víctor persigue algo concreto —ganar músculo sin que suba la grasa— y hasta ahora eso
no tenía dónde comprobarse: el reparto dice cuánto se levanta y la nutrición qué se
come, pero si el conjunto está funcionando o no sólo lo dicen la báscula y el reloj, y
se miraban en la muñeca y se olvidaban.

La tarjeta lo recoge, y lo hace al revés que las demás. **Sólo puntúa la casilla de
arriba** —«Medición de la mañana»—, que es la única que se decide: medirse o no. Las
cinco cifras que cuelgan de ella (peso, grasa, músculo esquelético, pulso en reposo y
variabilidad) van con `weight: 0` porque son el resultado y no el hábito. Un día que el
peso sube no es un día suspendido: es un día con más agua dentro, y eso sólo se
distingue mirando la serie de dos semanas.

Por eso mismo la cifra que el deslizador pinta a la derecha es **la escala, no una
meta**: aquí no hay nada que cumplir. Y por eso el paso del peso es de 200 g y no de
100: entre la noche y la mañana se va casi un kilo sólo de agua, así que afinar más
sería afinar el ruido.

#### El protocolo, dentro de Nutrición

El arranque de la mañana, la suplementación fija, el escudo de las comidas fuera y el
tránsito no son una categoría aparte: son cosas que entran por la boca —o que salen— y
viven en Nutrición e Hidratación, que admite casillas propias del perfil a través de su
parámetro `extra`. Dos de ellas van con `weight: 0` a propósito: el **escudo** sólo
aplica el día que se come fuera, y el **tránsito** no se decide, se comprueba. Es la
señal que primero se rompe en un viaje, y por eso se apunta aunque no puntúe.

## El criterio de los expertos

`lib/habits.ts` dice **qué** se registra. `lib/experts.ts` dice **por qué**, **con qué
cifra** y **quién lo sostiene**. Van separados a propósito: la interfaz cambia por
motivos de interfaz, y el criterio cambia cuando cambia lo que se sabe.

Cada hábito con criterio lleva:

| Campo      | Qué es                                                              |
| ---------- | ------------------------------------------------------------------- |
| `priority` | `clave` (consenso amplio y efecto grande) · `importante` · `apoyo`   |
| `claim`    | El titular: qué hacer y por qué, en una frase                        |
| `detail`   | Las cifras, los matices y cómo se aplica en casa                     |
| `experts`  | Las referencias que lo sostienen                                     |

### Qué respaldo tiene cada referencia

Se distinguen tres niveles, y se enseñan en la ficha:

- **Consenso** — organismos y revisiones: OMS, Academia Americana de Pediatría,
  UNICEF (crianza sin violencia), Walter Willett (Plato de Harvard), Sabine
  Sonnentag (desconexión psicológica), Diana Baumrind (estilos parentales), Alan
  Kazdin (programas de crianza), Sue Johnson (terapia focalizada en la emoción) y
  Howard Markman (programa PREP).
- **Divulgación** — resumen razonable de la evidencia disponible: Matthew Walker
  (sueño), Andrew Huberman (luz y ritmo circadiano), Peter Attia (fuerza y
  longevidad), Tim Spector (variedad vegetal), James Clear y BJ Fogg (diseño de
  hábitos), Carol Dweck (elogio del esfuerzo), John Gottman (pareja), Cal Newport
  (concentración), K. Anders Ericsson (práctica deliberada), Daniel Siegel y Ross
  Greene (crianza), Faber y Mazlish (hablar con los hijos), Laurence Steinberg
  (adolescencia), Esther Perel, Eli Finkel y Arthur Aron (pareja), **Marcos
  Vázquez**, **Endika Montiel**, Carlos Ríos, Julio Basulto, **Álvaro Bilbao**,
  **Rafa Guerrero**, **Míriam Tirado**, **Silvia Álava**, **Antoni Bolinches**,
  **Silvia Congost** y **Joan Garriga**.
- **Con reservas** — **Frank Suárez**: se le cita sólo donde coincide con todos los
  demás (beber más agua, bajar azúcar y harina refinada). Su clasificación del
  sistema nervioso en «excitado» y «pasivo» y su reparto de alimentos en tipo A y
  tipo E no están respaldados, y la ficha lo dice en voz alta.

Sólo el primer nivel se presenta como hecho. La ficha cierra recordando que nada de
esto sustituye al pediatra ni al médico.

### Qué hace con eso la app

1. **Marca los items a atender.** La pestaña de registro abre con «A qué atender
   hoy»: sólo hábitos `clave` e `importante`, y sólo cuando están por debajo del
   criterio, pasados de techo o sin registrar. Ordenados por prioridad y, dentro de
   ella, por gravedad. Cuando no queda ninguno, lo dice.
2. **Explica cada objetivo donde se registra.** Cada categoría lleva plegado un
   «Por qué importan estos objetivos» con el criterio y las referencias.
3. **Pesa los retos de la semana.** Entre dos retos igual de pertinentes, el
   generador se queda con el que ataca un hábito clave.

### Hábitos que entraron por criterio experto

Los que faltaban y el consenso considera de primer orden:

| Hábito                                    | Quién                     | Dónde                    |
| ----------------------------------------- | ------------------------- | ------------------------ |
| Misma hora de dormir y de despertar       | Walker, Huberman          | Todos                    |
| Luz natural al levantarse                 | Huberman                  | Peques y adultos         |
| Sin cafeína después de las 15:00          | Walker, Huberman          | Adultos                  |
| Día sin alcohol                           | OMS, Walker               | Adultos                  |
| Proteína en cada comida                   | Attia, Endika Montiel     | Peques y adultos         |
| Medio plato de verdura (Plato de Harvard) | Willett                   | Adultos                  |
| Sin ultraprocesados                       | OMS, Ríos, Spector        | Adultos (ya en peques)   |
| Cena 3 h antes de dormir, sin picoteo     | Marcos Vázquez, Montiel   | Adultos                  |
| Entrenamiento de fuerza                   | OMS, Attia, Montiel       | Adultos                  |
| Pasos del día                             | Marcos Vázquez, Attia     | Adultos                  |
| Movimiento del día (60 min)               | OMS                       | Peques                   |
| Pantallas de ocio (**techo**)             | AAP                       | Peques y adultos         |
| Rutina de acostarse de los peques         | AAP, Walker               | Familia                  |
| Reconocer el esfuerzo, no el resultado    | Dweck                     | Familia                  |
| Roce reparado el mismo día                | Gottman                   | Pareja                   |
| Tiempo con los hijos, con el móvil lejos  | Bilbao, Álava, Gottman    | Víctor                   |
| Mi parte de la casa, repartida            | Gottman, Garriga          | Víctor                   |
| La semana organizada (revisión semanal)   | Clear, Newport            | Víctor                   |
| Formación aplicada, no acumulada          | Newport, Ericsson         | Víctor                   |
| Cultura de equipo trabajada a ratos       | Clear, Dweck              | Víctor                   |

## Sintonía de perfil

Al entrar en un perfil suena su música: Leo y Hugo reciben la sintonía de *Oliver y
Benji* y María, *A Thousand Years*. Suena **veinte segundos**, entra y sale con un
desvanecido, y se corta con el botón que aparece abajo a la derecha. Se apaga del todo
en **⚙️ Ajustes → 🔊 Sonido**.

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
inicie sesión con tu cuenta.

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
2. **SQL Editor** → pega entero `supabase/schema.sql` → *Run*. Crea las tablas,
   sus políticas de seguridad y el cubo de archivos.
3. **Project Settings → API** → copia *Project URL* y la clave *anon public*.
4. En Vercel, **Settings → Environment Variables**:
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Estas dos se
   incrustan al compilar, así que hay que **volver a desplegar** después de añadirlas.
5. Abre la app: pedirá correo y contraseña. La primera vez, «Crear la cuenta la
   primera vez». Si Supabase pide confirmar el correo, confírmalo y vuelve a entrar
   (o desactiva *Confirm email* en **Authentication → Providers → Email**).
6. En cada móvil de casa se entra **una sola vez**: la sesión queda guardada.

### Comprobar que ha quedado bien

```bash
npm run comprobar:nube
```

Lee las variables de `.env.local` y dice, una por una, si las nueve tablas del
`schema.sql` están de verdad, **si tienen las columnas que se fueron añadiendo
después**, si la clave es la pública y no la de servicio, y —si además pones
`COMPROBAR_EMAIL` y `COMPROBAR_PASSWORD`— si la cuenta de casa puede leer y si
el cubo de las fotos responde. No escribe nada en ninguna parte:
en particular no toca `replicas`, porque dejar ahí una marca les diría a los
demás móviles que se pusieran a copiar.

Sirve para separar los dos fallos que se confunden siempre:

| Lo que ves | Lo que pasa de verdad |
|---|---|
| «Sin nube configurada» en Ajustes → Nube | Faltan las **variables**. El SQL no tiene nada que ver: puede estar perfecto. |
| Entra pero la subida falla | Faltan **tablas**. Relanza `schema.sql` entero. |
| Entra, sube, y aun así se pierde un dato concreto | Falta una **columna**. La tabla está y no da error: simplemente tira por el camino lo que no cabe. Relanza `schema.sql` entero. |

Ojo: comprueba **el ordenador donde se lanza**. Que aquí salga todo en verde no
dice nada del móvil: para eso las dos variables tienen que estar en Vercel y hay
que volver a desplegar después de añadirlas.

> **Si ya tenías Supabase montado de antes:** vuelve a pegar
> `supabase/schema.sql` entero y dale a *Run*. Es idempotente —no borra nada— y añade
> lo que falte: la columna de las notas por categoría (`entries.notes`) y las tablas
> `tasks`, `calendar_links` y `lineups` (los equipos del campograma). Hasta que se
> ejecute, este móvil guarda igual pero la subida a la nube falla y lo avisa en Ajustes.
>
> **Vuelve a lanzarlo también tras esta versión**, aunque ya lo tuvieras todo creado.
> Cambian dos cosas que no se ven pero se notan: el permiso del cubo de fotos pasa a
> decidirse por la carpeta del archivo en lugar de por `storage.objects.owner` —una
> columna que Supabase está retirando y que en los proyectos nuevos puede llegar vacía,
> lo que hacía que las fotos se subieran en un móvil y no en el resto—, y se añaden a la
> publicación de tiempo real las cuatro tablas que faltaban (`appearance`, `settings`,
> `lineups` y `agendas`), que son las de las fotos, el modo, los equipos y las agendas.
>
> Y ahora también la tabla `replicas`, de una sola fila, que es la que hace posible
> «dejar todos igual que este». Sin ella la app funciona igual que siempre: ese botón
> avisa de que no ha podido dar el aviso, y todo lo demás sigue subiendo y bajando.

### Qué sube y qué no

| Sube | Se queda en el móvil |
| ---- | -------------------- |
| Registros diarios, observaciones y notas de categoría | La preferencia «trabajar sólo en este móvil» |
| Tareas: qué, cuándo, aviso, repetición y si quedan por mandar | |
| Fotos y sintonías de los perfiles | |
| Ajustes de la casa: modo día/noche, sintonías y PIN | |
| Los equipos del campograma: formación, once, banquillo y capitán | |
| Las agendas semanales: los ratos de cada perfil, con su hábito y con quién está | |
| | El permiso de Google (vive cifrado en el servidor) |

Todo eso sube solo. Cuando lo que hace falta es que **este** aparato mande sobre los
demás —la app montada en un móvil y el resto en blanco—, está el envío forzado que se
explica más abajo.

**El PIN no viaja en claro.** Lo que sube es su huella —PBKDF2-SHA256 con sal, calculada
en el navegador—, así que ni la base ni la pantalla de Ajustes pueden enseñar el número:
si se olvida, se pone otro. Sigue siendo una barrera doméstica y no un cerrojo: cuatro
dígitos son cuatro dígitos.

Al actualizar, lo que ya hubiera en cada aparato **se respeta**: nadie ve cambiarle el
modo de golpe. A partir del primer cambio, manda la última elección en todos. La única
excepción es el PIN: si en un móvil había uno propio, al convertirlo en huella se propaga,
porque el bueno es ése y no el de fábrica que tengan los demás.

### Cuándo se sincroniza

Lo que se escribe sube casi al momento (medio segundo después de la última tecla).
Bajar lo que han escrito los demás ocurre en cuatro momentos:

| Cuándo | Qué pasa |
| ------ | -------- |
| Al abrir la app | Sincronización completa |
| Al volver a la pestaña o a la ventana | Igual, con un margen de 30 s para no repetir |
| Cada 45 s, con la app a la vista | Repaso: es lo que refresca un portátil que lleva horas abierto |
| En cuanto otro aparato escribe | Aviso de Postgres por el canal de tiempo real: aparece en un par de segundos |

Los ajustes de la casa —modo, sintonías y PIN— no pasan por la base local, así que se
suben aparte medio segundo después de tocarlos y se recogen en cada sincronización.

**Las fotos y las sintonías van por su cuenta**, con el mismo calendario pero más
espaciado (repaso cada dos minutos en vez de cada cuarenta y cinco segundos): son
archivos, no filas, y bajar una canción cuesta bastante más que bajar un registro. El
aviso en tiempo real las cubre igual, así que una foto cambiada en el móvil aparece en
el portátil en un par de segundos. Se enteran de la cuenta por sí mismas: antes iban
enganchadas a la sincronización de los hábitos, y en un móvil recién estrenado bastaba
con que aquélla fallara una vez —una tabla sin crear, un instante sin cobertura— para
que las fotos no bajaran nunca.

El repaso periódico no es un adorno: el navegador **no avisa** de que se ha pasado del
móvil al portátil —`visibilitychange` sólo salta al minimizar o al cambiar de pestaña—,
así que sin él un portátil con la app abierta se quedaba enseñando lo que bajó al
arrancar hasta que alguien recargaba la página.

El canal de tiempo real necesita que las tablas estén en la publicación
`supabase_realtime`; de eso se encarga el bloque final de `supabase/schema.sql`, que
mete las siete: `entries`, `tasks`, `appearance`, `settings`, `lineups`, `agendas` y
`replicas`. Si no está, no se rompe nada: se nota sólo en que el refresco tarda hasta
el siguiente repaso.

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

### Cuando un móvil es el que manda

La regla de la última escritura reparte bien el día a día, pero no sirve para la
situación en la que se monta la app: **un móvil con todo puesto** —las fotos, las
agendas, los equipos, los primeros días rellenos— y el resto de aparatos todavía en
blanco o a medias. Ahí no hace falta mezclar: hace falta que mande uno.

En **Ajustes → ☁️ Nube**, con la sesión iniciada, está **⬆️ Mandar lo de este móvil**. Pide
confirmación —lo que hace no es inocente— y sube todo lo de este aparato *refechado*:
registros, tareas, ajustes de la casa, campogramas, agendas y las fotos y sintonías. Al
llevar fecha de ahora, gana en todos los demás, que la adoptan en cuanto abren la app.

No borra nada de nadie: lo que exista en otro aparato y aquí no —un día registrado desde
el móvil de María— sigue existiendo. Lo que esté en los dos sitios pasa a ser el de aquí.

### Cuando todos tienen que quedar igual

Mandar sube, pero **no borra**. Y hay una situación en la que eso no basta: la app se ha
estado montando durante semanas y los otros aparatos arrastran lo suyo —días de prueba,
una portada vieja, un equipo a medio hacer, tareas que ya no existen—. Mezclar no lo
arregla nunca, porque lo que sobra allí no está aquí para ganarle la fecha.

Para eso está, en la misma pestaña, **🧬 Dejar todos igual que este**. Hace la copia
exacta:

1. Deja la nube idéntica a este aparato: sube todo lo de aquí refechado y **quita de
   ella lo que aquí ya no está** —registros, tareas, campogramas, agendas, fotos y
   sintonías incluidas—.
2. Escribe una **marca de réplica** (la tabla `replicas`): quién la declaró y cuándo.
3. El resto de aparatos ve esa marca —en un par de segundos por el canal de tiempo
   real— y en lugar de mezclar **adopta la copia entera**, tirando lo que sólo tuviera
   él.

Es lo único destructivo que viaja entre aparatos, así que se pregunta antes y el aviso
dice exactamente lo que va a pasar. Tres cautelas lo acompañan:

- **La marca se escribe la última**, cuando todo lo demás ya ha subido, y sólo si ha
  subido todo. Media copia anunciada como copia entera dejaría a los demás borrando lo
  suyo para adoptar algo que no está. Si algo falla, el parte lo dice y no se avisa a
  nadie.
- **Un aparato no adopta su propia réplica.** La marca lleva un identificador que cada
  navegador se inventa para sí mismo; no dice de quién es el móvil ni dónde está.
- **Un aparato que ve una marca por primera vez tampoco la adopta**: la apunta y sigue
  como siempre. Si no, un móvil recién estrenado —o uno que llevaba un mes sin entrar en
  la cuenta— perdería lo que hubiera registrado mientras tanto por una réplica antigua.
  «Todos los siguientes» son los aparatos que ya estaban en casa cuando se pulsó el
  botón; a los que llegan después les basta la sincronización normal, que se lo baja
  todo sin quitarles nada.

En el aparato que copia no se toca nada: la réplica sólo cambia la nube y, a través de
ella, a los demás.

| | ⬆️ Mandar lo de este móvil | 🧬 Dejar todos igual que este |
| --- | --- | --- |
| Lo de aquí | Sube y gana en todos | Sube y gana en todos |
| Lo que sólo existe en otro aparato | Se queda | **Desaparece** |
| Cuándo usarlo | Los demás están en blanco o a medias | Los demás arrastran cosas que ya no valen |

### El parte: qué ha viajado y qué no

Los registros y las tareas viajan en la misma tabla, pero los ajustes, los campogramas y
las agendas tienen cada uno la suya, y pueden llegar unos sí y otros no —lo típico es un
esquema sin actualizar: la tabla que falta—. Antes, esas tres se intentaban, se guardaba
el primer fallo en una línea y la sincronización se daba por buena igualmente: la casa
leía «al día» y creía tener la agenda en todas partes.

Ahora cada pieza se apunta por separado y se enseña debajo del estado de la nube, con lo
que ha subido de cada una y, cuando algo no llega, lo que dijo la nube:

```
✅ Registros 42 enviados
✅ Tareas 7 enviados
✅ Ajustes de la casa
⚠️ Campogramas — relation "public.lineups" does not exist
✅ Agendas semanales
✅ Fotos y sintonías 5 enviados
```

Con cualquier pieza sin llegar, el estado deja de ser «al día» y lo dice. Los registros
del día siguen viajando igual: que falte una tabla nunca puede impedirlo. Y las fotos se
reconcilian aunque otra pieza haya fallado, porque no tienen la culpa.

El mismo parte cuenta la réplica, que además de enviar borra, y por eso dice también qué
ha quitado de la nube:

```
✅ Registros 42 enviados 3 borrados allí
✅ Tareas 7 enviados
✅ Ajustes de la casa
✅ Campogramas 2 enviados
✅ Agendas semanales 2 enviados 1 borrado allí
✅ Fotos y sintonías 5 enviados 2 borrados allí
✅ Aviso al resto de aparatos
```

Y en el móvil que recibe la copia, lo que se lee es de dónde vino y cuánto ha bajado:

```
✅ Copia de un Android
✅ Registros 42 recibidos
✅ Tareas 7 recibidos
```

### Seguridad

Todas las tablas de datos tienen **RLS** y sus políticas sólo dejan ver y tocar las filas
cuyo `owner` coincide con la sesión. Sin haber entrado no se lee absolutamente nada,
aunque alguien tenga la clave pública (que va, por fuerza, dentro del navegador). El cubo
de fotos de perfil es privado y se sirve con URL firmada.

`calendar_links` es la excepción, y a más: guarda los permisos de Google Calendar, así
que tiene RLS **sin ninguna política** —la clave pública no la ve ni con sesión iniciada—
y su token va cifrado con una clave que sólo existe en el entorno del servidor. Sólo las
rutas de `app/api/calendario` pueden tocarla.

La cuenta es **compartida por la casa**: quien entra ve los seis perfiles, igual que
antes. El módulo de pareja sigue protegido por su PIN, que es una barrera doméstica,
no un muro.

La contraseña de esa cuenta se cambia en **Ajustes → Seguridad**, encima del PIN y a
propósito: el PIN tapa un módulo, la contraseña abre la casa entera en cualquier
aparato. Y si nadie la recuerda, la pantalla de entrada tiene **«No me acuerdo de la
contraseña»**: manda el correo de Supabase, el enlace devuelve a la app con la sesión
puesta y la app avisa —arriba del todo, y con un punto en el apartado de Seguridad— de
que falta poner una nueva. Hasta que se cambie sigue valiendo la vieja, así que el aviso
no se va solo.

## Bonus de aprendizaje del día

En la pestaña de registro, justo debajo de «A qué atender hoy», cada perfil recibe
**una cosa útil al día**: un titular, dos o tres frases de explicación y algo
concreto que hacer hoy mismo con ello.

### De dónde sale

No es un consejo genérico: sale de **donde esa persona está poniendo el interés**.
La app mira los **últimos 14 días** y cuenta en qué categoría se rellenan más
casillas —que es la definición operativa de interés: no lo que se dice que importa,
sino donde se registra—. De esa categoría sale el bonus.

Para que no se quede meses dentro de un solo tema, la rotación es de **dos días del
tema principal y uno del segundo**. Dentro de cada tema, el catálogo se recorre
entero antes de repetir ninguno.

### El idioma es parte del regalo

| Perfil | Idioma | Por qué |
| ------ | ------ | ------- |
| **Leo · Hugo** | 🇬🇧 Inglés (nivel de primaria) | El bonus enseña la cosa útil **y** el idioma a la vez |
| **Víctor** | 🇬🇧 Inglés (con el vocabulario del oficio) | Plan de sesión, feedback, scouting, cargas: la jerga real del cuerpo técnico |
| **María** | 🇪🇸 Español | |
| **Familia · Pareja** | 🇪🇸 Español | |

Los de inglés traen debajo una línea de **vocabulario** con las palabras nuevas
traducidas, para no tener que buscarlas fuera:

> **Warm up properly** — A warm muscle stretches; a cold one tears…
> *Vocabulario · to warm up = calentar · muscle = músculo · joint = articulación*

### El catálogo

`lib/learning.ts` es catálogo editable, igual que `lib/habits.ts`: añadir un bonus
es añadir un objeto con su `topic` (el identificador de la categoría de la que
cuelga), su idioma, su titular, su explicación, el `apply` de hoy y —si es en
inglés— su `gloss`.

Hay pools para cada categoría de cada perfil: nutrición, sueño, deporte y estudio
para los peques; sueño, nutrición, fuerza, desarrollo y oficio para María y Víctor;
rutinas y tiempo juntos para familia; tiempo a solas y conexión para la pareja. Los
de familia y pareja están escritos sobre el mismo criterio experto de la sección
—Bilbao, Siegel, Kazdin, Greene, Baumrind, Álava, Guerrero, Gottman, Johnson,
Markman, Perel, Aron, Finkel, Bolinches, Congost y Garriga—, así que el bonus y la
ficha de criterio nunca se contradicen.

Como los retos y los premios, **no se guarda nada**: el bonus es una función pura de
`(perfil, fecha, historial)`, así que el mismo día da siempre el mismo bonus en todos
los móviles y no hay nada que sincronizar. Leo y Hugo comparten catálogo pero no
orden: la rotación va sembrada con el perfil, así que el mismo día no les toca lo
mismo.

## Notas del día

Además de las casillas, en tres sitios se puede escribir lo que ninguna casilla
recoge. Es el mismo componente en todos (`components/ui/NoteField.tsx`), así que se
comporta igual en los tres:

| Dónde | Qué se apunta ahí |
| ----- | ----------------- |
| **📔 Observaciones del día** | El relato de la jornada: cómo ha ido cada hábito. |
| **📝 Nota de cada categoría** | Lo que ninguna casilla recoge: «le dolía el tobillo», «sólo media hora de entreno». Está al final de cada tarjeta desplegada, y la tarjeta plegada lo delata con un 📝. |
| **📝 Cómo van los retos** | En la pestaña de retos: qué se atasca, qué habría que cambiar. |

Las notas de las categorías y la de los retos se guardan en el registro del día
(`notes` en `DayEntry`, columna `notes` en la tabla `entries`). No cuentan para el
cumplimiento: son contexto, no una métrica más. En ese mismo sitio, bajo la clave
reservada `juego`, se anota la partida del [juego del día](#el-juego-del-día) de los
peques: una línea que no se enseña como nota porque no la escribe nadie.

Se escriben a mano y ya está: **la app no tiene entrada por voz**. La tuvo —dictado
con la Web Speech API del propio navegador— y se retiró por innecesaria.

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

#### Retos fijos: lo que no se deduce del historial

##### El reparto semanal de Víctor

No todo se deduce del historial. Víctor tiene una rutina cerrada —**pierna, pecho,
dorsal, flexiones, series de carrera, core y rodaje**, repartidas entre los siete días— que
está decidida de antemano: lo único que cambia cada semana es cuánto ha salido. El
reparto se declara una sola vez en `VICTOR_SPLIT` (`lib/habits.ts`) y de ahí salen a la
vez las casillas del día y los retos fijos de la semana (`ROUTINE`, en
`lib/challenges.ts`), que acompañan cada lunes a los tres que sí salen de los datos.

Cada sesión se mide con una **marca**: un número comparable de un día para otro, con su
ejercicio de referencia fijado a propósito —si un día se cambia de movimiento, la cifra
deja de ser comparable y el listón mentiría—. El reto de la semana es superar la mejor
marca anterior, no repetirla: el listón se congela el lunes con lo que hubiera hasta el
domingo, sube un paso cada vez que se pasa y se queda donde está la semana que no
salga. Las semanas anteriores a `VICTOR_MARKS_SINCE` se siguen evaluando con la regla
de entonces —basta con haber entrenado—, porque en aquellos días no había dónde apuntar
una cifra y con la regla nueva el medallero perdería medallas ya ganadas.

Hay sesiones que piden **más de una marca**, porque no se progresa en ellas por un solo
camino:

| Sesión | Marcas |
| --- | --- |
| Pierna | Sentadilla · mejor serie (con las repes de esa serie) · Gemelo y sóleo · peso máximo (con las repes de ese peso) |
| Pecho | Press de banca · peso máximo (con las repes de esa serie) · Press de banca · más repeticiones (con el peso de esa serie) |
| Dorsal | Dominadas seguidas · Dominada con lastre · peso máximo (con las repes de ese lastre) |
| Flexiones | Flexiones seguidas · 500 flexiones · tiempo |
| Series de carrera | Series completadas (con el ritmo de esas series) |
| Core | Plancha aguantada · Dragon flag · repeticiones |
| Rodaje | Rodaje más largo · Rodaje · mejor ritmo (con la distancia de esa tirada) |

Al banca se sube moviendo más peso o aguantando más repeticiones, y a la barra de
dominadas se llega un día en que sumar repeticiones a pelo deja de ser fuerza y pasa a
ser fondo: con una sola casilla, la mitad del trabajo de la semana no aparecería en
ninguna parte. Corriendo pasa lo mismo por partida doble: ir más lejos y ir más rápido
son dos progresos distintos, y una semana entera de tiradas largas parecería un
estancamiento si sólo se mirase el ritmo. En pierna, la sentadilla mide la fuerza de la
cadena entera y el gemelo con el sóleo miden lo que amortigua cada zancada de las
carreras de esa misma semana; en core, la plancha es el suelo y el dragon flag es donde
se ve si la cosa progresa. Las cifras entre paréntesis son **acompañantes**: se apuntan al lado,
nunca deciden si el reto está superado y existen porque «doce repeticiones» no dice si
fue un buen día hasta que se sabe con qué peso.

Dos marcas del reparto se leen al revés, porque en ellas mejorar es bajar: las **500
flexiones** —donde el trabajo está decidido de antemano, son 500 siempre, y lo que se
compara es lo que se tarda— y el **ritmo del rodaje**, en minutos por kilómetro. Van con
`direction: 'atMost'`, y de ahí en adelante todo cambia de signo: el récord es la cifra
más baja, el reto dice «baja de 58 min» y lo evalúa la regla `metricLow`, que ignora los
días sin apuntar nada para que una casilla en blanco no valga como el mejor tiempo
posible.

Todo esto vive en Movimiento y Fuerza como una tarjeta por sesión: el interruptor de
sí/no (`split.pierna`, `split.pecho`…), la marca (`marca.pecho`, `marca.pecho.repes`…)
y su acompañante (`marca.pecho.con`). La marca principal de cada sesión conserva el
identificador corto —`marca.pecho` a secas— para que los registros escritos cuando sólo
había una marca por sesión sigan contando. Van con `weight: 0` a propósito: son
contexto, no cumplimiento. Si contaran, un martes de pierna saldría suspendido por las
cinco sesiones que ese día no tocaban, que es justo lo contrario de lo que hay que
medir.

Por el mismo motivo bajan de peso las dos casillas vecinas —**Entrenamiento propio**
y **Entrenamiento de fuerza**—, que en Víctor van con `weight: 1` y en María siguen
con `weight: 2`. Un reparto de siete sesiones en siete días deja días de descanso, y
ese descanso está decidido, no incumplido: con el peso de fondo esos días le
salían casi suspendidos. Con peso 1 restan, pero poco, y quien de verdad juzga el
entreno son los retos de cada marca. El peso se queda **por encima de cero a
propósito**: a cero, el generador dejaría de mirarlas (`collectMetricStats` salta las
métricas de peso 0) y Víctor perdería los retos de récord y de máximo esfuerzo sobre
sus propios minutos de entreno.

Debajo de los retos, **Marcas del reparto** enseña de dónde se viene: la mejor marca de
cada una, con qué acompañante salió y las últimas anotadas, con las que fueron récord
el día que se hicieron señaladas. El reto dice lo que hay que superar; esto dice si la
cosa sube o lleva un mes clavada.

##### Las dos escaleras de Leo y Hugo

Leo y Hugo llevan dos retos más cada semana, y los dos **suben un peldaño cada vez
que se superan**:

| Escalera | Prueba | Primer peldaño | Sube |
| -------- | ------ | -------------- | ---- |
| **Del balón** (`maximo`) | Toques seguidos sin que caiga | 5 toques | +3 |
| **De gimnasio** (`reto`) | Flexiones seguidas | 5 flexiones | +2 |
|  | Plancha aguantada | 20 s | +5 |
|  | Saltos a la comba seguidos | 20 saltos | +5 |

La del balón no cambia nunca, porque es su deporte. La de gimnasio **gira una prueba
por semana** —flexiones, plancha, comba— en orden y no por sorteo: con una semilla
salían cuatro semanas de flexiones de cada seis y la plancha no aparecía. Los dos
hermanos hacen la misma prueba la misma semana, cada uno por su peldaño.

El peldaño **no se guarda en ningún sitio**, como todo lo demás: se cuenta mirando
las 16 semanas anteriores y sumando una por cada semana en la que se alcanzó el
objetivo que tocaba entonces. Las semanas en blanco no cuentan, pero tampoco restan:
unas vacaciones no tiran la escalera abajo, y una semana en la que no salga espera en
el mismo sitio hasta que salga. Cada prueba lleva su propio peldaño, así que la que
no toca esta semana sigue donde se quedó.

Es la otra manera de ser incremental, y por eso convive con el récord personal en vez
de sustituirlo: el récord persigue la mejor marca de los últimos 28 días y puede
dispararse un día suelto; la escalera va de uno en uno y nunca pide de golpe algo que
no se haya hecho antes.

### Premios

Cada reto superado entrega un regalo, y el nivel del reto decide la rareza:

| Perfil          | Colección                | Cimiento         | Reto                                        | Máximo esfuerzo                          |
| --------------- | ------------------------ | ---------------- | ------------------------------------------- | ---------------------------------------- |
| **Leo · Hugo**  | Álbum de cromos **+ técnicas** | Real Madrid Castilla | Los mejores de ahora: LaLiga + Premier League | Leyendas de la historia del fútbol |
| **María**       | Frases **+ álbum de música + cromos de casa** | Frase del día + cromo de la radio + cromo de casa | Frase de fuerza + cromo de los 90 o los 2000 + cromo de la plantilla | Frase de oro (Machado, Mistral, Sor Juana, Cervantes, Concepción Arenal…) + cromo de leyenda de la canción + cromo de leyenda de casa |
| **Víctor**      | Aforismos **+ cromos de casa** | Aforismo + cromo de casa | Aforismo de fuerza + cromo de la plantilla | Aforismo de oro (Séneca, Marco Aurelio, Will Durant…) + cromo de leyenda de casa |
| **Familia**     | Aforismos de la casa     | Aforismo         | Aforismo de fuerza                          | Aforismo de oro (Tolstói, Pitágoras…)    |
| **Pareja**      | Aforismos de los dos     | Aforismo         | Aforismo de fuerza                          | Aforismo de oro (Saint-Exupéry…)         |

Cada cromo lleva su **imagen**, su equipo, su dorsal, su demarcación, aquello por lo que
se le recuerda y un **lema** que traduce esa historia a esfuerzo («Estar siempre
disponible es un talento», del cromo de Iñaki Williams). Las frases y los aforismos van
marcados por tema: 🏡 familia · 🌿 para ti · 💻 aula · 👨‍👦 paternidad · ⚽ oficio · 💞 pareja.

El álbum de los peques es de fútbol de verdad y va de menos a más: la **cantera** del
Castilla en el nivel de entrada —los que todavía se están haciendo, que es donde están
ellos—, los **mejores de esta temporada** de LaLiga y de la Premier en el intermedio, y
las **leyendas** de la historia sólo con un reto de máximo esfuerzo. Las tres plantillas
son las de la 26/27 con el mercado de verano cerrado: cambian cada temporada, así que
están pensadas para repasarlas contra la oficial y corregirlas en `lib/rewards.ts` sin
tocar nada más.

#### La imagen del cromo

No hay foto de ninguno: son ciento y pico jugadores, buena parte son chavales de la
cantera sin foto pública y ninguna de esas fotos es nuestra. Así que el cromo se
**dibuja** en SVG, sin pedir nada a la red (`lib/cromoArt.ts` y
`components/ui/CromoPortrait.tsx`):

- La **camiseta** lleva los colores y el dibujo reales de su equipo —rayas del Atleti,
  mitades del Barça, mangas del Arsenal, banda del Villa—, sacados de la tabla `KITS`.
  Dar de alta un equipo nuevo es añadir una fila.
- La **cara** de los conocidos está apuntada a mano en el campo `look` del cromo (piel,
  color y corte de pelo, barba), para que Vinícius no salga rubio. Los de la cantera no
  lo llevan: a esos se les sortea la cara a partir de su identificador, así que **no son
  un retrato de nadie** —siempre igual para el mismo cromo, eso sí—. Si algún día
  quieres que uno se parezca, se le añade su `look` y deja de sortearse.
- Las **cantantes de María** se dibujan igual, con la ropa de su mazo en lugar de una
  camiseta, y los **cuatro de la casa** llevan directamente su foto de perfil.
- Los cromos que **no son nadie** —la mesa de la cena, las técnicas de la semana— siguen
  llevando su emoji: una cara inventada ahí no diría nada.
- Si algún día hay foto de verdad, se deja en `public/photos/cromos/` y se apunta en el
  campo `photo`: la foto manda y el dibujo se aparta.

#### El álbum de música de María

Lo que el fútbol es para Leo y Hugo, la música de los 90 y los 2000 es para María: lo
que sonaba cuando la de ocho y nueve años era ella. Así que tiene **su propio álbum**,
con la misma forma que el de ellos y todo en español:

| Nivel | Rareza | Quiénes |
| ----- | ------ | ------- |
| Cimiento | Cromo de la radio | Los de diario, los que sonaban sin que nadie los pusiera: Ella Baila Sola, OBK, Los del Río, Celtas Cortos, Fangoria… |
| Reto | Cromo de los 90 · Cromo de los 2000 | Los grandes de cada década, que caen del mismo montón igual que LaLiga y la Premier: Mecano, Héroes, Sanz, Rosana, Luz Casal, Shakira… y Amaral, Estopa, La Oreja, Bisbal, Manu Chao, Juanes… |
| Máximo | Cromo de leyenda | Las voces que ya no se discuten: Sabina, Serrat, Rocío Jurado, Camarón, Paco de Lucía, Lola Flores, Celia Cruz, Mercedes Sosa… |

En estos cromos el `team` es de dónde salieron y la `position`, qué hacían y cuándo. No
llevan camiseta de ningún equipo, así que se visten por mazo (`ATUENDOS` en
`lib/cromoArt.ts`): rosa la radio, morado los 90, turquesa los 2000, negro y oro las
leyendas. Se reconoce el nivel de un vistazo, igual que se reconoce una camiseta a
rayas.

#### Los cromos de casa

María y Víctor tienen otro regalo más por reto: un cromo de la familia. Los cuatro
—Leo, Hugo, María y Víctor— más la pareja y la plantilla al completo **llevan la foto
de su perfil**, la que tengan puesta en ese momento: si la cambiáis desde los ajustes de
aspecto, el cromo cambia con ella. Es el mismo formato de los de fútbol, pero la
plantilla es la de casa —los cuatro, los ratos que se repiten y las cosas que sólo pasan
aquí—, escrita para esta casa en concreto:

| Nivel | Rareza | De qué van |
| ----- | ------ | ---------- |
| Cimiento | Cromo de casa | Lo de diario: la mesa de la cena, el cuento de la noche, el taxi de los entrenos, el aula de las nueve |
| Reto | Cromo de la plantilla | Uno por cabeza: Leo, Hugo, María, Víctor, los hermanos, la pareja |
| Máximo | Cromo de leyenda de casa | Las grandes: los Cea Díaz al completo, la semana entera, el finde que no se descuadró |

En el código cada regalo de más es un mazo aparte del `Deck` de `lib/rewards.ts`
—`bonus` y `extra`—, y cada uno se baraja con su propia semilla para que los tres
premios de un mismo reto no vayan siempre emparejados igual. María usa los dos: `bonus`
para su música y `extra` para la casa. Cualquier otro perfil puede recibir mazos de más
con sólo declarárselos.

#### Las técnicas de la semana

Leo y Hugo tienen el otro tipo de premio: **uno por semana, y sólo si no queda ningún
reto sin superar**. No es una carta más del álbum de fútbol, sino un cromo de *ellos*
jugando, en el registro de *Oliver y Benji*: una técnica con nombre propio que se
desbloquea al cerrar la semana entera.

| | Leo | Hugo |
| - | --- | ---- |
| Va de | Energía y atreverse | Constancia y récord propio |
| Ejemplos | Tiro del León · Regate Relámpago · Huracán de Cinco Deportes · Disparo del Minuto 90 | Tiro del Tigre Rubio · Marca Propia · Motor de Constancia · Carrera Invisible |

Cada uno tiene su mazo (`weekly` en su `Deck`), así que el cromo lleva su nombre y no
el del hermano; los dos comparten una técnica combinada, el **Muro de Hermanos**. En
la cabecera de la pestaña de retos se ve el premio antes de ganarlo —«🔒 Técnica de la
semana: se desbloquea al superar los 5 retos»— y, una vez cerrada la semana, con qué
técnica se pagó.

#### El campograma

Los cromos no se quedan en el álbum: con ellos se monta un equipo. En la pestaña de
retos, debajo de la colección, cada peque tiene su **campograma**: elige el dibujo
(4-3-3, 4-4-2, 4-2-3-1 o 3-5-2), le pone nombre a su equipo, coloca a cada cromo en su
puesto, deja al resto en el banquillo y reparte el brazalete de capitán.

Dos reglas, y las dos son de `lib/lineup.ts`:

- **Un cromo, un sitio.** Si entra al once, sale del banquillo; si entra en un puesto
  ocupado, el que estaba baja al banquillo en vez de desaparecer.
- **Cada uno en su línea.** El cromo lleva anotada su línea (`por`, `def`, `med`,
  `del`) y sólo cabe en las ranuras de esa línea: un portero no juega de extremo. Los
  cromos que no son jugadores —las técnicas de la semana, los de casa— no llevan línea,
  y por eso no aparecen en el campo. Al cambiar de formación cada uno se queda si su
  nueva ranura admite su línea, y si no baja al banquillo: cambiar de dibujo no cuesta
  volver a montar el equipo entero.

Se toca, no se arrastra: en un móvil arrastrar falla la mitad de las veces, así que se
toca la posición y se elige de una lista. Y es lo único de la colección que **sí se
guarda** (`localStorage` + tabla `lineups`, con la misma regla de siempre: gana la
última alineación), porque el álbum se recalcula del historial pero dónde ha decidido
cada uno colocar a los suyos no se puede deducir de nada.

El premio se **anuncia antes** («🎁 En juego: Frase de oro + cromo de leyenda de
casa») y se entrega al superar el reto, visible en la propia tarjeta y guardado
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
perfil y semana: durante siete días son siempre los mismos tres. A ellos se suman los
fijos —el reparto de Víctor y las escaleras de los peques—, que no se sortean.

## El juego del día

Leo y Hugo tienen, además de los retos, **una partida al día**. Vive en la pestaña de
retos, arriba del todo, y se anuncia también desde la barra de acciones del día. Sólo
la tienen los peques (`kind: 'kid'`).

Son **dos juegos que se van alternando**, uno cada día:

| | 🧠 Duelo de lógica | ⚽ Pizarra táctica |
| - | --- | --- |
| Va de | Cinco problemas para resolver de cabeza | Cinco jugadas para decidir como un jugador listo |
| De dónde salen | 14 generadores que inventan los números de cada día | Catálogo de 42 jugadas reales |
| Ejemplos | Series con dos saltos, reparto de cromos, balanzas, marcadores, relojes, deducción de dorsales, palillos, combinaciones | Fuera de juego, la pared, temporizar, cobertura, bascular, cambio de orientación, salida del portero, presión tras pérdida |

Los problemas de lógica **hablan de ellos**: salen sus nombres, el del hermano, cromos,
petos y entrenamientos. Y suben de nivel con la edad: los mismos generadores dan
números más grandes o un paso más para Hugo (9) que para Leo (8), así que nadie
resuelve el del hermano por habérselo visto hacer.

En la táctica, las respuestas falsas no son tonterías: son los errores que de verdad se
cometen a esa edad —mirar sólo el balón, correr todos al bulto, chutar siempre—. Se
conteste bien o mal, **siempre se explica por qué**, que es la mitad de lo que se
aprende. Y se ve marcada la buena aunque se haya fallado.

### El premio

| Aciertos | Qué cae |
| -------- | ------- |
| 5 de 5, tercer pleno seguido | 🌟 Cromo de **leyenda** |
| 5 de 5 | Cromo de **LaLiga o la Premier** |
| 3 ó 4 | Cromo de **cantera** (Castilla) |
| 2 o menos | Nada, y mañana otra oportunidad |

Es el mismo álbum de los retos, con dos matices: el juego reparte de su **propia
baraja** —así una partida ganada no adelanta el turno de los cromos de los retos ni al
revés— y los cromos que deja **también se alinean en el campograma**, como cualquier
otro.

### Una vez al día, y de verdad

- **Cada respuesta se anota en cuanto se toca.** No es un detalle técnico, es la regla:
  cerrar la app en mitad de una pregunta fallada no regala otro intento.
- **La partida se puede retomar, no repetir.** Queda apuntado por dónde iba, así que se
  puede volver más tarde y seguir por la pregunta en la que se dejó.
- **Sólo se juega el día que es.** Retroceder al día de ayer enseña cómo quedó aquella
  partida, pero no deja jugarla.
- **Las preguntas del día son siempre las mismas.** Salen de una semilla hecha con el
  perfil y la fecha, así que recargar, cambiar de móvil o mirar la partida más tarde da
  exactamente lo mismo: no hay manera de barajar de nuevo hasta que salgan fáciles.

Del juego **se guarda una sola línea** en las notas del día
(`juego|aciertos|contestadas|total|momento`), que es lo único que no se puede deducir.
Como cabe en lo que ya viaja a la nube, el juego no necesitó ninguna tabla nueva ni
ningún cambio en el esquema: sincroniza entre móviles con el resto del día. Todo lo
demás —las preguntas, el premio, la racha de plenos— se recalcula.

Los dos catálogos de `lib/games.ts` son editables igual que los mazos: añadir una
jugada de táctica es añadir un objeto a la lista, y añadir un tipo de problema es
añadir un generador. Con 42 jugadas y 5 por partida, una jugada no se repite hasta
pasadas ocho partidas de táctica —unas dos semanas y media—, y en la vuelta siguiente
el mazo se baraja otra vez.

## Tareas y Google Calendar

Cada perfil tiene su propia agenda, en la pestaña **📋 Tareas** (en los peques, **Agenda**).
Es donde van las cosas que ocurren una vez y se tachan —la revisión del dentista, la
reunión del colegio, comprar leche— y vive aparte de los hábitos a propósito: un hábito
se repite cada día y se puntúa, un recado no. **Las tareas no entran en el cumplimiento
ni en las estrellas**; nadie debería sacar peor nota por no haber comprado leche.

Una tarea es, como mínimo, un título y un día. Todo lo demás está plegado detrás de
«Hora, tipo, aviso y repetición», porque la mayoría de las veces no hace falta:

| Campo         | Para qué                                                        |
| ------------- | --------------------------------------------------------------- |
| Tipo          | Cita, colegio, compra, casa, salud, trabajo, ocio u otro. Pone el icono y el color del evento |
| Hora          | Sin ella, la tarea ocupa el día entero                            |
| Duración      | Sólo con hora; por defecto, una hora                              |
| Aviso         | Antelación del recordatorio                                       |
| Repetición    | Diaria, semanal o mensual                                         |

La lista se agrupa sola por urgencia —**se pasaron**, hoy, mañana, esta semana, más
adelante, sin fecha, hechas— y la pestaña lleva un contador con lo que vence hoy, para
verlo desde cualquier otra. Las hechas se esconden hasta que se piden.

Una tarea que **se repite** no se cierra al tacharla: salta a su siguiente fecha y
vuelve a estar pendiente, que es lo que se espera de «sacar la basura». El salto de mes
se recorta al último día real, así que un «cada mes» nacido un 31 cae en el 28 de
febrero y no se desliza al 3 de marzo.

### Las dos vistas: lista y mes

Arriba de la lista hay un par de botones, **📋 Lista** y **🗓️ Calendario**, que enseñan
lo mismo de dos maneras:

- **Lista** es la de siempre: los montones por urgencia, que dicen *qué corre prisa*.
- **Calendario** es el mes entero, con un punto por tarea debajo de cada número —llenos
  los pendientes, apagados los hechos—. Dice *cómo viene la semana*, que es lo que no
  se ve en una lista ordenada por urgencia: dos días vacíos y un jueves imposible.

Al picar un día se abre debajo lo que hay ese día, con las mismas filas de siempre
—tachar, editar, borrar— y un **⧉ Copiar el día** para llevárselo entero a otros.

### Copiar un recado a varios días

Repetir «cada semana» sirve cuando algo no se acaba nunca. Pero la mayoría de las
tandas de casa tienen principio y fin —los cinco días del campamento, los martes de
piscina del trimestre, la medicación de una semana— y no son una serie: son recados
concretos, cada uno con su día, que se tachan por separado y que a veces se cambian de
hora uno solo.

Para eso está **⧉ Copiar a días**, en cualquier tarea sin tachar y en el día entero
desde la vista de calendario. Se abre un mes en el que **lo marcado es lo que se copia**,
y se llega ahí por tres caminos que se pueden mezclar:

- **Los atajos**: mañana, los próximos siete días, cada martes (el día que sea el de la
  tarea), de lunes a viernes, o los fines de semana.
- **El patrón**: se eligen los días de la semana —L M X J V S D— y cuántas semanas
  alcanza, de una a doce (un trimestre escolar).
- **A mano**, picando en el propio calendario.

Los atajos y el patrón **añaden** a lo marcado, nunca lo sustituyen, y después se quita
lo que no toque picándolo otra vez: las tandas de la vida real casi siempre tienen una
excepción, y el martes de la excursión no hay piscina. Antes de confirmar se dice
cuántas copias van a salir y en cuántos días, y el mes avisa de lo que ya hay: los
puntos de cada día y un **✓** en los que ya tienen ese mismo recado, para no acabar con
la piscina apuntada dos veces.

Cada copia lleva la hora, el aviso, el tipo y el detalle de la original, pero es un
recado suelto: **la repetición no viaja**. Conservarla convertiría cinco copias en cinco
series abiertas y llenaría el calendario de eventos que nadie ha pedido.

Con la cuenta de Google enlazada se puede pedir que las copias vayan también al
calendario; salen en fila y sin ruido, y lo que no llegue queda pendiente y se reintenta
solo, como cualquier tarea apuntada sin cobertura. El **Deshacer** del aviso las quita
de la lista *y* de Google: doce eventos huérfanos en el calendario de la casa no serían
marcha atrás.

### Que aparezca en el calendario del móvil

La app no escribe en el móvil: escribe en **la cuenta de Google**, y el móvil enseña
esa cuenta. Por eso el recado sale en la app de Calendario de todos los dispositivos
donde esa cuenta esté añadida, y sigue ahí aunque se desinstale esta app.

- **Android.** Si el móvil ya está iniciado con esa cuenta, no hay nada que hacer: sale
  solo en Google Calendar. Si el recado no aparece, es que ese calendario concreto está
  desmarcado en **Calendar → ☰ → Ajustes → \[la cuenta\]**.
- **iPhone.** Hay que añadir la cuenta una vez en **Ajustes → Aplicaciones → Calendario →
  Cuentas → Añadir cuenta → Google**, con el interruptor de *Calendarios* activado.
  (O instalar la app de Google Calendar, que es lo que menos falla.) Ojo: los calendarios
  **secundarios** de Google no aparecen en el Calendario de iOS hasta marcarlos en
  <https://calendar.google.com/calendar/syncselect> desde el propio iPhone.
- **Los avisos** los da el móvil, no esta app: llegan aunque la app esté cerrada o
  desinstalada, porque son notificaciones del calendario.

Si en casa se quiere que todos vean los recados de todos, lo práctico es crear **un
calendario compartido** en Google («Familia»), compartirlo con quien corresponda, y
elegirlo como destino en los cuatro perfiles.

### Que no se caiga nunca

Un permiso de Google puede morir: alguien lo retira desde su cuenta, cambia la
contraseña, o el proyecto sigue sin publicar y caduca a los siete días. La app está
hecha para que eso **se note y se recupere solo**, en lugar de dejar de avisar en
silencio:

- Cada operación real contra Google deja anotado si el permiso sigue vivo. Cuando deja
  de estarlo, la tarjeta de la cuenta lo dice en rojo, explica por qué y ofrece
  **volver a conectar**. Hay además un botón **🩺 Comprobar** para verificarlo a mano.
- Un recado que no ha podido llegar al calendario —sin cobertura, o con el permiso
  caído— queda marcado como pendiente (`calendarPending`) y se ve como *«Se mandará al
  calendario»*. La app **lo reintenta sola** al volver a abrir la sección, así que
  apuntar algo en el coche acaba igualmente en el calendario.
- Reintenta en fila y **se para a la primera negativa**: si el permiso ha caducado,
  fallarían todas igual y no tiene sentido insistir.
- Quitar un recado del calendario a mano cancela su reintento: la app no vuelve a
  ponerlo por su cuenta.

Lo único que la app **no** puede arreglar sola es el estado del proyecto en Google:
para que los permisos no caduquen cada semana hay que publicarlo, y eso se hace una vez
(ver más abajo).

### Enlazar una cuenta de Google

El enlace es **por perfil**, no por casa. Cada uno conecta la cuenta que quiera y elige
en qué calendario de esa cuenta caen sus recados, de modo que Leo —que no tiene cuenta
propia— puede colgar los suyos del calendario compartido de la familia sin mezclarse con
el trabajo de nadie. Se hace desde la propia pestaña de tareas, al final.

A partir de ahí, **lo que se apunte con fecha viaja solo al calendario** y avisa a su
hora: para eso se conectó. Lo que no tiene fecha se queda en la app, porque un
recordatorio necesita un cuándo. Cada recado se puede quitar del calendario por
separado, editar (el evento se pone al día) o borrar (el evento se retira, y deshacer
lo vuelve a poner).

Las tareas puntuales pierden su evento al tacharse —ya no hay nada que recordar—; las
que se repiten conservan su serie en Google y siguen avisando.

> **Los avisos de las tareas de todo el día.** Google cuenta la antelación desde el
> comienzo del evento, y en un evento de día entero el comienzo es la medianoche. Por eso
> ahí sólo se puede avisar la víspera o antes, y la app ofrece justo esas opciones en vez
> de otras que Google no podría cumplir.

### Cómo está montado

Nada de Google toca el navegador. La app le pide al servidor «conecta este perfil» o
«manda este recado», y las credenciales viven sólo en las rutas de `app/api/calendario`:

| Ruta                        | Qué hace                                                        |
| --------------------------- | --------------------------------------------------------------- |
| `GET /api/calendario`        | Qué perfiles tienen calendario y si la integración está disponible |
| `POST /api/calendario`       | Conectar, desconectar, listar calendarios de la cuenta o cambiar de calendario |
| `GET /api/calendario/callback` | La vuelta desde Google; canjea el permiso y devuelve a la app   |
| `POST /api/calendario/evento`  | Crea, actualiza o retira el evento de una tarea                 |

El permiso duradero (`refresh_token`) se guarda en `calendar_links` con doble
protección: va **cifrado** con una clave derivada de `GOOGLE_CLIENT_SECRET` —que sólo
existe en el entorno del servidor, nunca en la base— y la tabla tiene RLS activado y
**ninguna política**, de modo que la clave pública del navegador no la ve ni con sesión
iniciada. Sólo la clave de servicio puede tocarla. Desconectar borra la fila y revoca el
permiso en la propia cuenta de Google, no sólo aquí.

El ida y vuelta del consentimiento es una navegación del navegador y no puede llevar
cabecera de sesión, así que **quién autoriza qué viaja firmado** (HMAC) dentro del
parámetro `state`, y caduca a los diez minutos: sin eso, cualquiera podría devolver un
consentimiento diciendo que es de otra cuenta y colgarle su calendario. Al volver, la
app reconstruye dónde estaba quien lo pidió —su perfil, sus tareas— y le cuenta cómo ha
ido.

### Configuración

En Google Cloud Console: habilitar la **Google Calendar API** y crear un **ID de cliente
de OAuth** de tipo «Aplicación web», con estas URIs de redirección:

```
http://localhost:3000/api/calendario/callback
https://TU-DOMINIO/api/calendario/callback
```

Y en el entorno (ver `.env.example`):

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SUPABASE_SERVICE_ROLE_KEY=   # sin NEXT_PUBLIC_: no puede acabar en el navegador
```

**Sin ninguna de las tres, la sección de tareas funciona igual**: la lista se guarda en
el móvil y en la cuenta de casa, se ve desde todos los dispositivos y lo dice claramente
en vez de ofrecer un botón que no lleva a ninguna parte. Es la misma regla que rige el
resto de la app.

> **Pon la pantalla de consentimiento «En producción». Esto es lo que hace que dure para
> siempre.** Mientras el proyecto de Google siga en estado *Testing*, los permisos
> **caducan a los siete días** y habría que volver a conectar cada cuenta todas las
> semanas. En **Pantalla de consentimiento de OAuth → Publicar aplicación** eso deja de
> pasar y el enlace se mantiene indefinidamente. Al no estar verificada por Google —no
> hace falta para un uso doméstico, con el tope de 100 cuentas de sobra— la primera vez
> aparece un aviso de «app no verificada»: se entra por *Configuración avanzada → Ir
> a…*, y sólo la primera vez por cuenta.

## La semana: agenda y coherencia

Los hábitos cuentan **lo que pasó**. La pestaña **Semana** aparta **el rato en el que
debería pasar**: el entreno del martes, la lectura antes de dormir, la clase de las once,
la cena de los cuatro. Cada perfil tiene la suya —los seis, incluidos Familia y Pareja— y
se edita a toques desde el móvil.

Es una **rutina, no una cita**. Un rato vive en un día de la semana y vuelve todas las
semanas hasta que se cambie; lo que ocurre una sola vez sigue viviendo en Tareas, que
tiene fecha y se tacha.

### No es un calendario: se define una vez

La pestaña **no se rehace cada lunes**. Se monta la semana tipo —de lunes a domingo, sin
fechas— y esa es la semana de la casa hasta que alguien la cambie. Por eso la pantalla no
rotula «semana del 3 al 9»: rotula **semana tipo**, y los días son *lunes*, *martes*…, no
*lun 3*, *mar 4*.

Se mira de dos maneras, con el mismo contenido detrás:

| Vista | Para qué |
| ----- | -------- |
| **🗓️ La semana entera** | El horario completo: siete columnas sobre la misma regla de horas, de lo más temprano a lo más tardío que haya apartado. Se ven de un vistazo los huecos, los solapes y las tardes cargadas. Picar en un rato lo abre; picar en un hueco aparta uno nuevo a esa hora, redondeada a la media; picar en la cabecera de un día abre lo que se puede hacer con ese día. Alto de hora regulable y línea de la hora actual en la columna de hoy |
| **✏️ Día a día** | Las siete tarjetas, cada una con lo que lleva, cuánto ocupa y sus tres botones: añadir, copiar o mover, y vaciar |

Se abre por la entera en cuanto hay algo definido; con la agenda en blanco se entra
directamente por las tarjetas, que es lo que hace falta entonces. Dos ratos a la misma
hora se pintan uno al lado del otro, en carriles, para que el solape se vea en vez de
esconderse.

Las fechas entran en un solo sitio: el **contraste**. Debajo del resumen, la semana tipo
se compara con la semana real que se esté mirando en el navegador de días —«contra la
semana del 3 al 9: ✓ 12 cumplidos · ✕ 3 fallidos»—. La semana tipo no se toca; lo que
cambia es contra qué se mide.

### Lo que hace que no sea una lista más

Cada rato puede ir **atado a una casilla del registro** (`metricId`) y declarar **cuánto
pretende aportar** (`amount`): «lectura, 20 min», «entreno de fútbol», «pantallas, 60 min».
De ahí sale todo lo demás.

Con eso, la app compara el plan con lo registrado y marca cada rato:

| Marca | Qué significa |
| ----- | ------------- |
| ✓ **Cumplido** | Lo registrado cubre lo previsto |
| ↓ **Corto** | Se registró, pero por debajo de lo que el plan reservaba |
| ↑ **Pasado** | La casilla era un techo (pantallas, dulces…) y se ha rebasado |
| ? **Sin apuntar** | El día ya pasó y la casilla sigue vacía |
| ○ **Por venir** | Todavía no ha llegado el día: no se juzga |

Dos reglas de fondo, para no dar la lata: **un día futuro nunca se juzga** —que el jueves
que viene no esté registrado no es un fallo— y **un rato sin hábito atado tampoco** —la
merienda no tiene casilla y no por eso está mal planificada.

### Carencias y excesos

Encima de la cuadrícula, la semana se repasa entera y dice lo que ve. Los avisos salen
ordenados por lo que urge: primero lo que se ha pasado de la raya, luego lo que falta,
luego lo que conviene mirar.

| Aviso | Cuándo salta |
| ----- | ------------ |
| **Exceso planificado** | El plan de un día ya reserva más de lo que el techo admite (dos horas de pantallas contra un máximo de una) |
| **Exceso registrado** | Un rato con techo acabó por encima |
| **Día sobrecargado** | Más de 10 h de cole, deporte, estudio y trabajo en un mismo día |
| **Carencia clave** | Un hábito que los expertos dan por innegociable no tiene ni un rato en toda la semana |
| **Plan corto** | Lo reservado no llega ni al 60 % de la meta diaria del hábito. Se agrupa por hábito —«el plan se queda corto en lectura», una vez y no cinco— porque reservar 45 de 60 minutos no es un plan mal montado y decirlo cada día sería ruido |
| **Previsto sin registrar** | Había entreno y la casilla está vacía: o no se fue, o no se apuntó |
| **Dos cosas a la vez** | Dos ratos del mismo día se pisan: uno no va a pasar |
| **Sin decir quién está** | Sólo en Leo y Hugo: ratos sin acompañante asignado |

Cuando no hay nada de eso, lo dice también: una semana bien montada merece respuesta.

### Quién está con Leo y con Hugo

En los dos peques, cada rato lleva **con quién están**: mamá, papá, los dos, los abuelos,
solos, o en el cole o el club. Se ve en la propia casilla, se resume arriba en minutos por
persona —«Abuelos 4 h, Papá 3 h 30 min»— y la app avisa de los ratos que nadie ha
asignado. Es la pregunta que de verdad se hace en casa al mirar la semana: el jueves a las
cinco, ¿quién los lleva?

### En la pantalla de registro

Debajo de la cabecera del día aparece **lo que la semana tenía previsto para hoy**, ya
contrastado con lo apuntado. Marcar la casilla deja de ser un trámite: se ve al lado lo
que se había apartado y si se ha cumplido, se ha quedado corto o se ha pasado. Si la
agenda está sin estrenar, no se pinta nada.

### Cada casa, la suya

La mecánica es la misma para los seis; lo que cambia es el rótulo y el adorno.

| Perfil | Se llama | Adorno |
| ------ | -------- | ------ |
| **Leo y Hugo** | Alineación de la semana | Césped y línea de cal, banda blanca y dorada del Madrid, dorsal en el aro de oro y una frase de Oliver y Benji distinta cada día |
| **María** | Mi semana | Filete dorado, serif de revista y frase en cursiva |
| **Víctor** | Plan semanal | Regla de acero, versalitas espaciadas, cifras tabulares |
| **Familia** | Semana en familia | Halo cálido del tinte naranja |
| **Pareja** | Nuestra semana | Halo rosado, tono íntimo |

Los peques llaman «jugadas» a sus ratos, María y la pareja los llaman «momentos», Víctor
«bloques» y Familia «planes». Sale de `PLANNER_THEMES`, en `lib/planner.ts`: cambiar el
rótulo o la frase de un perfil es tocar un objeto.

### Cómo se empieza

Cada perfil trae una **semana de ejemplo** verosímil y ya atada a sus hábitos —el cole y
los cinco deportes de los peques, las clases de María, el reparto de Víctor, las comidas
de Familia, el check-in de Pareja—. Un toque la pone entera, se edita encima y siempre se
puede deshacer. Y para lo de cada día están los **ratos de un toque**: una fila de botones
que rellena el formulario completo, atadura incluida, para no tener que buscar a mano el
identificador de ninguna métrica.

Y la semana entera se rehace con la de ejemplo, se copia de otro perfil, se ata a los
hábitos o se vacía desde la barra de abajo. Todo se deshace desde el aviso.

### Rellenarla rápido: copiar, repetir, mover

Una semana no se escribe: se repite. El martes se parece al jueves, la cena es la misma
cinco noches y el cole cae de lunes a viernes. Escribir eso veinte veces es lo que hace
que una agenda se quede a medias —y una agenda a medias no sirve para nada—, así que
todo lo que se repite se copia:

| Dónde | Qué hace |
| ----- | -------- |
| **Días marcados al apartar** | Al añadir un rato nuevo se marcan **los días que haga falta** —con atajos de *toda la semana*, *de lunes a viernes* y *fin de semana*— y sale uno en cada uno. El cole de los peques son cinco toques en un solo guardado |
| **⧉ en un rato** | **Otra vez este día** (la copia sale detrás del original, a la hora que se diga), **copiar a otros días** o **mover a otro día** |
| **⧉ en un día** | **Copiar el día** entero en los que se le parezcan, **moverlo** a otro o **intercambiarlo** —el entreno del martes por el del jueves, con todo lo que llevan dentro— |
| **Añadir o sustituir** | Al copiar un día se elige qué pasa con lo que ya hubiera: se suma, o se sustituye |
| **🔎 buscador de ratos** | Con cincuenta y seis en el catálogo, teclear «anál» es más rápido que recorrer pestañas |
| **🔗 Atar a los hábitos** | Ata de una vez los ratos guardados que se llaman como uno de siempre |

En la vista **día a día**, cada tarjeta lleva su **＋ Añadir**, su **⧉** y su **🧹**; en la
vista de **semana entera**, la cabecera de cada día es también un botón que abre lo mismo.
Cada operación dice antes lo que va a pasar —«3 bloques · se quitan 12»— y después cuántos
han salido, con **Deshacer** en el aviso.

Dos detalles de la cuadrícula que no son adorno: el **alto de la hora** se cambia con
⊟ ⊡ ⊞ —una semana de ochenta ratos no se lee con el mismo zoom que una de diez— y en la
columna de hoy hay una **línea con la hora actual**, que es lo que convierte la semana
tipo en «esto es lo que toca ahora». Y con más de dos tipos apartados aparece la fila de
**resaltar**: pica «Trabajo» y el resto se apaga sin desaparecer.

### Ratos ya guardados, hábitos nuevos

La agenda se guarda con la atadura que tenían los ratos de siempre **el día en que se
puso**. Cuando después nace la casilla que faltaba —el máster, las cuentas, el tiempo con
los hijos—, lo ya guardado se queda como estaba: apartado, y sin nada contra lo que
comprobarse.

Para eso está **🔗 Atar a los hábitos**, que también sale solo como aviso arriba
—«12 ratos pueden atarse a un hábito»— cuando hay algo que ganar. Busca cada rato por su
nombre entre los de siempre —sin distinguir mayúsculas ni acentos— y le pone el hábito y
la cantidad que hoy le tocan. No inventa: lo que no está en el catálogo se queda suelto, y
lo que ya estaba atado no se toca, salvo que apuntara a un hábito que ya no existe. Se
deshace como todo lo demás.

### Los temas: cincuenta y seis ratos que caben en una pantalla

Con doce ratos de un toque bastaba una fila de botones. La semana de Víctor no cabe en
doce: el trabajo de cuerpo técnico se le va en catorce cosas distintas —preparar la
sesión no es analizar el partido, y analizar al rival no es analizar el balón parado— y
además están el máster, el deporte propio, la familia, la casa, las cuentas y el
descanso. Cincuenta y seis botones seguidos no son un catálogo: son un muro.

Así que los ratos de un toque declaran de qué **tema** son (`group`), y la pantalla los
reparte en pestañas. El tema no es lo mismo que el tipo: el análisis del rival y la
reunión de staff son los dos «trabajo» —y se pintan los dos de gris pizarra en la
cuadrícula—, pero quien monta la semana los busca en sitios distintos.

| Tema | Qué hay dentro |
| ---- | -------------- |
| 📋 **Profesional** | El oficio entero, desglosado: preparación de la sesión, entrenamiento, partido, análisis táctico del partido, análisis individual, rival colectivo y rival individual, ABP propio y ABP rival, análisis y desarrollo de la cultura de equipo, los microciclos de cultura y de ABP, reuniones individuales, reunión de staff, aprendizajes del micro, control de cargas, feedback post-sesión y la desconexión al llegar a casa |
| 🎓 **Máster** | Clase, estudio y trabajos con fecha de entrega |
| ✨ **Desarrollo personal** | Lectura, escritura, diario, formación y pausa consciente |
| 🏃 **Deporte** | Gimnasio, correr, montaña, fútbol, otro deporte, el reto de la semana, movilidad y paseo |
| 🏡 **Familia** | Las tres comidas, ocio en familia, experiencias con los hijos, tiempo con María, los padres y los amigos |
| 🧹 **Casa y tareas** | Responsabilidades, recados, compra, papeleo y organizar la semana |
| 💶 **Economía** | Apuntar los gastos, cuentas del mes, facturas y pagos, inversiones y ahorro |
| 🌙 **Descanso y salud** | Siesta, a dormir, sin pantallas la última hora y luz natural al levantarse |

Los peques y María tienen los suyos —**🎒 Cole y deberes**, **🏃 Deporte**, **🍽️ Comidas
y rutinas**, **🎮 Juego y ocio** y **🌙 Descanso** en los peques; **👩‍🏫 Aula y alumnos**,
**🏃 Deporte y cuidado**, **✨ Desarrollo**, **🍽️ Comidas** y **🌙 Descanso** en María—.
Familia y Pareja siguen con su fila corrida, que con diez y seis ratos se lee entera. Sólo
aparecen las pestañas cuando hay temas que enseñar, y sólo los que tienen algo dentro. Y
por encima de todo está el **buscador**, que ignora las pestañas: quien teclea «anál» no
quiere acordarse de en qué tema estaba.

### Que cada rato tenga contra qué comprobarse

Un rato sin hábito atado se aparta igual, pero la agenda no puede decir nada de él. Así
que lo que se ata, se ata de verdad —«preparación de la sesión» son sesenta minutos de
`prep_sesion`, «análisis táctico · partido» noventa de `analisis_tactico`—, y lo que se
apartaba sin casilla contra la que medirse ya la tiene. Estos son los hábitos que nacieron
justamente por eso:

| Hábito nuevo | Dónde vive | Qué ratos ata |
| ------------ | ---------- | ------------- |
| 🧭 **Cultura de equipo** | Víctor · Profesional | Análisis y desarrollo de la cultura de equipo |
| 🗓️ **Microciclo planificado** | Víctor · Profesional | Los microciclos de ABP y de cultura, y los aprendizajes del micro |
| 🎧 **Formación y podcast** | Víctor · Desarrollo Personal | Formación y podcast |
| 🧒 **Tiempo con Leo y Hugo** | Víctor · Casa y Vínculos | Ocio en familia, experiencias con los hijos |
| 💞 **Tiempo con María** | Víctor · Casa y Vínculos | Tiempo con María |
| 👵 **Ver a la familia o a los amigos** | Víctor · Casa y Vínculos | Con los padres, con los amigos |
| 🧹 **Mi parte de la casa** | Víctor · Casa y Vínculos | Responsabilidades de casa |
| 🗂️ **Recados, compra y papeleo** | Víctor · Casa y Vínculos | Tareas y recados, compra, papeleo |
| 📆 **La semana organizada** | Víctor · Casa y Vínculos | Organizar la semana |

**Casa y Vínculos** es una categoría nueva de Víctor y responde a algo que faltaba: la
mitad de su semana no es campo —son los hijos, María, la gente de uno y lo que la casa
pide— y no tenía ni una casilla en el registro. Lo que va por semanas y no por días
—ver a los padres, los recados, organizar la semana— va con peso 1, por lo mismo que el
máster: el día que no toca no es un hábito incumplido.

En los peques y en María se aprovechó lo que ya había: la merienda ata **frutas y
verduras**, el camino al cole la **luz natural al levantarse**, el juego libre el
**movimiento del día**, el desayuno su casilla, y en María entran el **feedback a
alumnos**, el **cuidado de la voz**, la **escritura**, los **pasos** y las **horas de
sueño**. De los seis perfiles, sólo cuatro ratos de las semanas de ejemplo entran sueltos:
el **cole** y la **ducha** de los peques, y el **entrenamiento del equipo** y el
**partido** de Víctor. Son el trabajo y el horario, no hábitos, y la agenda no finge
comprobar algo que nadie apunta.

La semana de ejemplo de Víctor es un **microciclo de verdad**, con partido el domingo:
el lunes se recoge el partido —vídeo, individual y aprendizajes del micro—, el martes
va el rival, el miércoles el balón parado propio y del rival, el jueves la cultura de
equipo, el viernes lo individual y las cuentas, el sábado la activación y la tarde con
los peques. Ochenta y tres ratos —el gasto del día se apunta después de cenar, los
siete—, sin un solo solape, sin ningún día por encima del aviso de sobrecarga y sin un
solo día en el que el plan se quede corto frente a la meta de un hábito. Las seis semanas
de ejemplo pasan ese mismo examen.

### La semana de uno en la de otro

Leo y Hugo hacen casi la misma semana —el mismo cole, el mismo campo, la misma hora de
cenar— y luego cada uno lo suyo: la natación de uno, el kárate del otro. Montarla dos
veces a mano es trabajo tirado, así que en la barra de abajo está **⧉ Copiar la semana de
otro**: se elige de quién traerla y se matiza encima.

Lo que viaja es la semana tipo entera —ratos, horas, duraciones y con quién— y llega como
copia suelta, cada rato con identificador propio, de modo que mover el entreno de Hugo no
mueve el de Leo. El enganche al hábito viaja sólo si el que recibe tiene ese hábito: entre
los dos peques los tienen todos, entre un peque y un adulto casi ninguno, así que el
diálogo dice de antemano cuántos ratos llegarían sueltos. Sustituye lo que hubiera, y se
deshace desde el aviso como todo lo demás.

### Dónde se guarda

Como los campogramas y los ajustes: una clave de `localStorage`
(`habitos-familia:agenda`), fechada, que la nube reconcilia con la regla de siempre —gana
la última escritura—. Con cuenta de casa, la tabla `agendas` la reparte entre los móviles:
si uno mueve el entreno del jueves, el otro lo ve movido en un par de segundos. Si la
tabla todavía no existe, la agenda se queda en ese aparato y se avisa, pero los registros
del día viajan igual.

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
cambia desde **⚙️ Ajustes → 🎨 Aspecto → Portada**, o tocando el botón
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

- **Niños**: tarjetas grandes, emojis tocables, barras gruesas, estrellas y mensajes de ánimo. Un toque de más se deshace: los contadores y los deslizadores llevan **Borrar**, que devuelve la métrica a «sin contestar» —que no es lo mismo que un cero registrado—, igual que la ✕ de la versión de mayores.
- **Adultos y grupos**: filas compactas, segmentados Sí/No, deslizadores y anillos de progreso.
- **Retos**: tres objetivos de la semana con su porqué, puntos y medallero de las anteriores.
- **Bonus del día**: una cosa útil, sacada de donde cada uno registra más; en inglés para los peques y Víctor.
- **Sonido**: cada perfil puede recibirte con su sintonía, silenciable desde Ajustes.
- **Notas**: lo que ninguna casilla recoge, en el día, en cada categoría y en los retos.
- **Resúmenes**: barras de la semana, mapa de calor del mes, desglose por categoría, rachas y logros. Se navega **semana a semana y mes a mes** con `←` `→`, sin salir de la pestaña ni retroceder día a día desde el registro; los días que aún no han llegado se ven, para que el periodo esté completo, pero no se abren.

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

Las notas —la del día, la de cada categoría y la de los retos— esperan además
**500 ms desde la última tecla** antes de bajar al registro. Guardar cada
pulsación parecía lo más seguro y era lo contrario: cada tecla rehacía el
resumen de la semana, los retos, las marcas del gimnasio y el bonus del día
—todos ellos repasan meses de historial— y encima mandaba una escritura a la
nube. Nada se pierde por esperar: lo pendiente se vuelca al salir del campo y
también si el campo desaparece antes, y toda navegación (cambiar de día, de
pestaña o de perfil) es un toque que primero quita el foco.

La app **no se queda anclada al día en que se abrió**. La tableta de la cocina
o el portátil que nadie cierra cruzan la medianoche con la app delante: al
cambiar el día, «Hoy» pasa a señalar el día nuevo, y quien estuviera mirando
hoy se va con él —quien estuviera repasando un día atrás se queda donde
estaba—. Sin eso, lo que se registrara de madrugada acababa en la víspera.
Como suspender el portátil congela los temporizadores, la fecha se vuelve a
mirar cada vez que la pestaña se pone delante.

Los ajustes permiten **exportar e importar** el JSON: una copia de seguridad que
no se puede restaurar no es una copia. Al importar se elige entre fusionar con
lo actual o reemplazarlo. **Reemplazar reemplaza también en la nube**: los días
que la copia no trae se marcan como borrados, porque si no seguirían arriba y
la siguiente sincronización los devolvería mezclados con lo importado. Lo mismo
al cargar los datos de ejemplo.

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

## Ajustes

**⚙️ Ajustes** está en el pie de la pantalla de inicio y dentro de cada perfil. Era una
tira única que había que recorrer entera para llegar al PIN; ahora son **cinco
apartados** que se cambian con un toque —o con las flechas del teclado— y cada uno cabe
en la pantalla del móvil sin desplazarse:

| Apartado | Qué hay |
| -------- | ------- |
| 🎨 Aspecto | Modo día/noche/automático y la portada de la casa |
| ☁️ Nube | Estado de la sesión, sincronizar, mandar lo de este móvil y el parte de qué ha viajado |
| 🔊 Sonido | Las sintonías de perfil, encendidas o silenciadas |
| 💾 Datos | Cuánto hay guardado, exportar, importar y datos de ejemplo |
| 🔐 Seguridad | El PIN del módulo de pareja y la zona peligrosa |

Lo que hay que mirar **se ve desde fuera**: la pestaña lleva un punto rojo cuando la
última sincronización falló o cuando el PIN sigue siendo el de fábrica, así que no hay
que entrar apartado por apartado a comprobar que todo está en orden.

Además de la nueva estructura:

- **La nube se lee de un vistazo.** Un punto de color y un titular —«Al día», «No llegó
  entera», «Sin sesión»— en vez de un párrafo, y la hora de la última sincronización
  dicha como se mira de verdad: *hace 3 min*.
- **Los datos se cuentan antes de tocarlos.** Días registrados, tareas y pendientes en
  tres cifras, y lo que ocuparía la copia de seguridad antes de descargarla. La zona
  peligrosa dice cuántos días y cuántas tareas va a borrar, no «todos los registros».
- **El PIN se escribe dos veces** y se puede ver mientras se teclea. Sólo se guarda su
  huella: si se pone uno con un dedazo, no hay forma de averiguar cuál fue, así que más
  vale pedirlo repetido. Si el elegido es `1111` o `1234` se dice —vale igual, pero no
  protege de nadie de la casa.
- **Los interruptores son interruptores.** Un botón cuyo texto cambia obliga a leer para
  saber si lo que pone es lo que está puesto o lo que va a pasar al picarlo; el carril de
  `ui/Switch.tsx` se ve de lejos y toda la fila es el objetivo táctil.

## Economía

Sección propia dentro del panel de **Víctor**, y sólo suyo: la pestaña no
existe en los demás perfiles. Está calcada de la hoja de cálculo con la que
lleva los cursos, pero puesta del revés. La hoja empieza por las filas y
esconde en una celda la única cifra que de verdad se consulta; aquí esa cifra
va arriba y en grande: **cuánto tiempo aguantas** si mañana no entra nada.

Seis libretas, que son los seis bloques de la hoja:

| Libreta | Qué cuenta | Ritmo |
| ------- | ---------- | ----- |
| Ingresos | Salario del club, comisión del agente (en negativo), ESS fijo y variable, 380 Players, RCDE, autónomos | al mes |
| Gastos | Casa, colegio, coche, comida… con **previsión y real** | al mes |
| Cuentas | El dinero disponible, banco por banco | saldo |
| Inversiones | Fondos y participaciones | saldo |
| Me deben | Lo que está por cobrar, y cuándo reclamarlo | saldo |
| Debo | Lo comprometido y sin pagar | saldo |

El curso va del 1 de agosto al 31 de julio, como en la hoja, así que el
periodo se cuenta en meses y las vacaciones van aparte: son un pico del año,
no un gasto de todos los meses. De ahí salen solas cuatro cuentas —lo que
queda al mes y en el curso, el patrimonio (cuentas + inversiones + cobros −
pagos) y la autonomía en meses—, la barra de en qué se va el mes y el
contraste entre lo presupuestado y lo que de verdad se fue.

**Los meses que se cobra no son los que se vive.** En un club son diez de
doce, así que el libro lleva las dos cifras (`months` y `payMonths`) y los
ingresos del periodo se cuentan sobre la segunda. Sin separarlas, un mes tipo
sale cuadrado y el año no cuadra, que es exactamente el error que la hoja
arrastraba.

### El plan

Cinco maneras de mirar las mismas cuentas: **Resumen**, **Plan**, **Consejo**,
**Estadísticas** y **Libretas**. El consejo (`lib/financeExperts.ts`) describe
—«el 96 % de lo invertido está en una sola casa»—; el plan
(`lib/financePlan.ts`) manda: qué mover, cuánto y qué cambia si se hace. Va
antes que el consejo en las pestañas porque es lo que se busca al abrir esto.

Se apoya en tres criterios, escritos en la cabecera del módulo:

- **se juzga el año, no el mes**, por lo de los meses que se cobra;
- **un déficit no es por sí solo una alarma**: lo que decide es qué parte del
  patrimonio hay que sacar cada año para taparlo. Es la tasa de retirada de
  siempre, con un 5 % de margen antes de dar la voz, porque ninguna de las
  cifras que entran tiene esa precisión;
- **nada sin cifra y nada sin efecto**: cada acción trae el número del que
  sale y el número en el que se nota, que es lo que permite ordenarlas.

Encima de las acciones hay un **simulador** con las tres únicas palancas que
existen —ingresar más, gastar menos, pasar de lo invertido a la cuenta—. No
guarda nada: mueve las cifras, recalcula el veredicto y las acciones, y se
quita de un toque. Para cambiar las cuentas de verdad están las libretas.

Tres decisiones que conviene no deshacer sin pensarlo:

- **En el código no hay ni una cifra.** Este repositorio es público, así que
  lo que viaja aquí es la forma —los conceptos y cómo se suman— y los números
  viven sólo en el aparato. Por lo mismo, las hojas de cálculo que se dejen
  caer en la carpeta están en `.gitignore`.

  Para no tener que teclear cuarenta números el primer día, la libreta se
  puede estrenar rellena: las cantidades van en `NEXT_PUBLIC_ECONOMIA_SEED`
  —`.env.local` en el ordenador, variables de entorno en Vercel—, con la
  forma que documenta `.env.example`. Sólo se usan al estrenar y al pulsar
  «Rellenar con la hoja», que respeta lo ya tecleado; a partir de ahí manda
  la app. Sin la variable, la sección se estrena a cero como siempre.
- **Sincroniza con la cuenta de casa**, como el resto: tabla `finance`, una
  fila por perfil con las seis libretas en un `jsonb`, gana la última guardada
  y viaja también en tiempo real. Con las mismas políticas que todo lo demás:
  sin sesión no se lee nada, y con sesión sólo lo propio. Aun así hay un botón
  que las copia enteras en texto, que es la salida de emergencia de cualquier
  cosa guardada en un solo sitio.
- **Clave propia**, aparte del PIN de la casa —ése lo saben los dos—, guardada
  como huella PBKDF2 y nunca en claro. La huella viaja con los ajustes, así
  que la clave es la misma en el móvil y en el ordenador.

Al desplegar hay que **volver a lanzar `supabase/schema.sql`** en el editor SQL
del proyecto: crea la tabla `finance` —con `pay_months`, los meses que se cobra— y
añade a `settings` las tres columnas de la huella. El archivo es idempotente, así que relanzarlo entero no toca nada de
lo que ya está.

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

De la app **sale muy poco, y sólo cuando se pide**: un recado va a Google Calendar
si ese perfil tiene cuenta enlazada y la tarea tiene fecha. Los permisos de Google se
guardan cifrados en el servidor, no viajan nunca al navegador, y desconectar una cuenta
los borra aquí y los revoca allí. Nada más sale de la casa.
