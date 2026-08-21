# Hábitos en Familia

Aplicación web independiente de seguimiento de hábitos para una familia de cuatro
(Leo, Hugo, María y Víctor) más dos módulos compartidos. Sin backend: todo se guarda
en el navegador, lista para publicar en GitHub y desplegar en Vercel.

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

No hay variables de entorno ni base de datos que configurar.

## Estructura

```
app/
  layout.tsx           Layout raíz, metadatos y fondo ambiental
  page.tsx             Orquestador: selector ↔ dashboard ↔ PIN ↔ ajustes
  manifest.ts          Manifiesto PWA (instalable en el móvil)
  globals.css          Tailwind + utilidades propias (.card, .card-kid, .btn…)
components/
  Ambient.tsx          Decoración de fondo, distinta por piel
  ProfileSelector.tsx  Pantalla inicial con los 6 perfiles, su foto y su estado
  TopBar.tsx           Conmutador de perfiles siempre visible, con retratos
  Dashboard.tsx        Cabecera del perfil + pestañas Registro / Resúmenes
  profile/
    ProfileHeader.tsx  Las tres cabeceras de perfil (fútbol, editorial, grupo)
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
public/
  photos/              Retratos, cabeceras y cromos ya recortados
  icon.svg             Icono de la app instalada
lib/
  profiles.ts          Los 6 perfiles: datos, fotos, acentos y piel visual
  habits.ts            Catálogo de categorías y métricas por perfil
  scoring.ts           Cumplimiento, estrellas, rachas, logros
  dates.ts             Utilidades de fecha en es-ES
  storage.ts           Lectura/escritura en localStorage
  seed.ts              Generador determinista de datos de ejemplo
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
«Época de exámenes») y `group` (agrupador, usado por las cinco actividades deportivas).

Los registros se guardan como `DayEntry` bajo la clave `${profileId}:${YYYY-MM-DD}`,
de modo que cada perfil tiene su propio historial independiente.

### Perfiles y categorías

| Perfil                  | Categorías                                                                        |
| ----------------------- | --------------------------------------------------------------------------------- |
| **Leo** (8), **Hugo** (9) | Nutrición e Hidratación · Sueño y Recuperación · Rendimiento Deportivo (Fútbol, Natación, Arte Marcial, Gimnasio, Atletismo, con asistencia/esfuerzo/sensaciones) · Cognitivo-Académico (época de exámenes, lectura en casa, escritura) |
| **María** (39)          | Salud y Bienestar · Desarrollo Personal (lectura y escritura) · Profesional (clases de español online) |
| **Víctor** (42)         | Salud y Bienestar · Desarrollo Personal · Profesional (preparación de sesiones, análisis táctico, cuerpo técnico y alto rendimiento) |
| **Hábitos en Familia**  | Rutinas en Familia · Tiempo Juntos                                                 |
| **Hábitos en Pareja**   | Tiempo a Solas · Conexión y Rutinas — protegido por PIN                            |

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
