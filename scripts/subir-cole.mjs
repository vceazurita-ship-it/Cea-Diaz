// Sube los materiales de Classroom de un niño (PDF y fotos de fichas) al cubo
// privado de la cuenta, para verlos en Rendimiento → Colegio.
//
//   node scripts/subir-cole.mjs <leo|hugo> <carpeta> [adjuntos.json]
//
// La carpeta es la de los archivos bajados de Classroom. El JSON opcional es
// una lista `[{ clase, titulo }]` que dice de qué clase es cada archivo; lo
// que no aparezca en ella va a «Otros».
//
// Entra con COMPROBAR_EMAIL / COMPROBAR_PASSWORD de `.env.local` y deja todo
// en `<uid>/cole/<perfil>/`. Se puede repetir: sustituye lo que había y
// borra de la nube lo que ya no está en la carpeta. Nada de esto toca el
// repositorio, que es público.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const require = createRequire(path.join(RAIZ, 'package.json'));
const { createClient } = require('@supabase/supabase-js');

const [perfil, carpeta, adjuntosJson] = process.argv.slice(2);
if (!['leo', 'hugo'].includes(perfil) || !carpeta) {
  console.log('Uso: node scripts/subir-cole.mjs <leo|hugo> <carpeta> [adjuntos.json]');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const TIPOS = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** Para comparar nombres: Drive cambia «:» por «_» al bajar, y alguno llega con la «º» rota. */
const clave = (s) => s.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toLowerCase();

/** Los nombres de clase leídos de la página llevan repetida la letra del icono: «MMatemáticas». */
const limpiaClase = (s) =>
  (/^(.)\1/u.test(s) ? s.slice(1) : s)
    .replace(/([A-Za-z])(\d)/g, '$1 $2') // «ENGLISH4º C» → «ENGLISH 4º C»
    .replace(/\s+/g, ' ')
    .trim();

/** El nombre dentro del cubo: sin acentos ni símbolos, que la nube no los admite. */
const nombreSeguro = (s) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-');

const adjuntos = adjuntosJson ? JSON.parse(readFileSync(adjuntosJson, 'utf8')) : [];
const deClassroom = new Map(adjuntos.map((a) => [clave(a.titulo), a]));

/** El nombre que se enseña: el que puso la profesora, o el del archivo con la «º» arreglada. */
const titulo = (fichero) => (deClassroom.get(clave(fichero))?.titulo ?? fichero).replace(/Â([º°ª])/g, '$1');

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: sesion, error: errorSesion } = await client.auth.signInWithPassword({
  email: env.COMPROBAR_EMAIL,
  password: env.COMPROBAR_PASSWORD,
});
if (errorSesion) {
  console.log('No se pudo entrar en la cuenta:', errorSesion.message);
  process.exit(1);
}
const owner = sesion.user.id;
const base = `${owner}/cole/${perfil}`;
const cubo = client.storage.from('aspecto');

const archivos = [];
for (const fichero of readdirSync(carpeta).sort((a, b) => a.localeCompare(b, 'es'))) {
  const tipo = TIPOS[path.extname(fichero).toLowerCase()];
  if (!tipo) continue;
  const lleno = path.join(carpeta, fichero);
  const peso = statSync(lleno).size;
  const ruta = `${base}/${nombreSeguro(fichero)}`;
  const { error } = await cubo.upload(ruta, readFileSync(lleno), { contentType: tipo, upsert: true });
  if (error) {
    console.log('MAL ', fichero, '·', error.message);
    continue;
  }
  const de = deClassroom.get(clave(fichero));
  const clase = de ? limpiaClase(de.clase) : 'Otros';
  archivos.push({ clase, titulo: titulo(fichero), ruta, tipo, peso });
  console.log('ok  ', clase, '·', fichero);
}

// Lo que quedó de una subida anterior y ya no está en la carpeta.
const { data: hay } = await cubo.list(base, { limit: 1000 });
const sobran = (hay ?? [])
  .map((o) => `${base}/${o.name}`)
  .filter((r) => !r.endsWith('/indice.json') && !archivos.some((a) => a.ruta === r));
if (sobran.length > 0) {
  await cubo.remove(sobran);
  console.log('borrados', sobran.length);
}

const indice = { subido: new Date().toISOString(), archivos };
const { error: errorIndice } = await cubo.upload(`${base}/indice.json`, JSON.stringify(indice), {
  contentType: 'application/json',
  upsert: true,
});
if (errorIndice) {
  console.log('No se pudo guardar el índice:', errorIndice.message);
  process.exit(1);
}
console.log(`${archivos.length} archivos de ${perfil} en la nube.`);
