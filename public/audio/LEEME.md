# Sintonías de perfil

Aquí van los archivos de audio que suenan al entrar en un perfil. La app los
busca por nombre; si no están, se entra en silencio y no pasa nada.

| Archivo     | Perfiles    | Qué pide `lib/profiles.ts`        |
| ----------- | ----------- | --------------------------------- |
| `himno.mp3` | Leo y Hugo  | Himno del Real Madrid             |
| `maria.mp3` | María       | *A Thousand Years*, Christina Perri |

Para cambiar cuál suena, se edita el campo `anthem` del perfil en
`lib/profiles.ts`; para quitarla, se borra ese campo.

## Recomendaciones

- **MP3 o M4A**, a 128 kbps sobra: sólo suenan veinte segundos.
- **Recorta el trozo que quieras oír** (la entrada del himno, el estribillo).
  Un archivo de 25-30 segundos pesa unos 400 KB y carga al instante; el tema
  entero son varios MB que nadie va a escuchar.
- Volumen normalizado, para que no pegue un salto respecto al resto.

## Antes de subirlos al repositorio

Las dos piezas tienen **derechos de autor**. Colocarlas aquí y desplegar
significa servirlas en una URL pública, que es distribuirlas. Para uso
doméstico, lo razonable es cerrar el acceso al despliegue:

**Vercel → Settings → Deployment Protection** deja la app accesible sólo para
quien inicie sesión con tu cuenta de Vercel. De paso protege las rutas
`/api/plato` y `/api/consejo` de que alguien gaste tu clave.
