# Sintonías de perfil

Aquí van los archivos de audio que suenan al entrar en un perfil. La app los
busca por nombre; si no están, se entra en silencio y no pasa nada.

| Archivo      | Perfiles   | Qué suena                           |
| ------------ | ---------- | ----------------------------------- |
| `oliver.mp3` | Leo y Hugo | Sintonía de *Oliver y Benji*        |
| `maria.mp3`  | María      | *A Thousand Years*, Christina Perri |

Para cambiar cuál suena, se edita el campo `anthem` del perfil en
`lib/profiles.ts`; para quitarla, se borra ese campo.

## Recomendaciones

- **MP3**. Cuidado con los archivos bajados de internet: los dos que hay aquí venían
  con extensión `.m4a` pero por dentro eran MP3, y algunos navegadores (Safari) se
  niegan a reproducir un archivo cuya extensión miente.
- **Se reproducen los primeros veinte segundos**, así que lo que quieras oír tiene
  que estar al principio. El navegador pide el archivo por rangos, de modo que un
  tema entero arranca igual de rápido que uno recortado: recortarlo sólo ahorra
  peso en el repositorio (los dos actuales suman 6,3 MB).
- Volumen normalizado, para que no pegue un salto respecto al resto.

## Antes de subirlos al repositorio

Las dos piezas tienen **derechos de autor**. Colocarlas aquí y desplegar
significa servirlas en una URL pública, que es distribuirlas. Para uso
doméstico, lo razonable es cerrar el acceso al despliegue:

**Vercel → Settings → Deployment Protection** deja la app accesible sólo para
quien inicie sesión con tu cuenta de Vercel. De paso protege las rutas
`/api/plato` y `/api/consejo` de que alguien gaste tu clave.
