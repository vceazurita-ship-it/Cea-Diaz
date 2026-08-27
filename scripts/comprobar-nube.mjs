/* =========================================================================
 *  Comprobador de la nube — `npm run comprobar:nube`
 *
 *  Dice, en castellano y sin rodeos, si la casa está bien montada:
 *
 *   1. Si las dos variables están puestas y tienen buena pinta.
 *   2. Si la clave es la pública y no la de servicio (pegar esa por error
 *      abriría la base entera a cualquiera que abra la app).
 *   3. Si las ocho tablas del `schema.sql` existen de verdad.
 *   4. Con la cuenta de casa: si las políticas dejan leer y si el cubo de
 *      las fotos está en su sitio.
 *
 *  No escribe nada en ninguna parte. En particular no toca `replicas`:
 *  dejar ahí una marca les diría a los demás móviles que se pusieran a
 *  copiar, y una comprobación no debe hacer eso jamás.
 * ========================================================================= */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

/* --------------------------------------------------- leer el .env.local */

function leerEntorno(archivo) {
  let texto;
  try {
    texto = readFileSync(archivo, 'utf8');
  } catch {
    return {};
  }

  const valores = {};
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    let valor = limpia.slice(corte + 1).trim();
    // Por si alguien pega el valor entrecomillado.
    if (valor.length > 1 && /^(".*"|'.*')$/.test(valor)) valor = valor.slice(1, -1);
    valores[clave] = valor;
  }
  return valores;
}

// Lo del archivo primero; lo que venga del entorno manda, para poder lanzarlo
// con las variables por delante sin tocar el archivo.
const delArchivo = leerEntorno('.env.local');
const entorno = { ...delArchivo };
for (const clave of Object.keys(delArchivo)) {
  if (process.env[clave]) entorno[clave] = process.env[clave];
}
for (const clave of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
                     'COMPROBAR_EMAIL', 'COMPROBAR_PASSWORD']) {
  if (process.env[clave]) entorno[clave] = process.env[clave];
}

const url = (entorno.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const anon = (entorno.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const email = (entorno.COMPROBAR_EMAIL || '').trim();
const password = (entorno.COMPROBAR_PASSWORD || '').trim();

/* ------------------------------------------------------------- pintar */

const E = '\x1b[';
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (codigo, texto) => (color ? `${E}${codigo}m${texto}${E}0m` : texto);

const titulo = (t) => console.log(`\n${c('1', t)}`);
const ok = (t) => console.log(`  ${c('32', '[ok]')} ${t}`);
const mal = (t) => console.log(`  ${c('31', '[MAL]')} ${t}`);
const ojo = (t) => console.log(`  ${c('33', '[ojo]')} ${t}`);
const nota = (t) => console.log(`       ${c('2', t)}`);

let fallos = 0;

console.log(`\n${c('1', 'Comprobación de la nube')}`);
titulo('1. Las dos variables');

/* ------------------------------------------------------ 1. variables */

if (!url || !anon) {
  mal('Faltan las variables. La app guardará sólo en este aparato.');
  nota('Están en Supabase -> Project Settings -> API.');
  if (!url) nota('  · NEXT_PUBLIC_SUPABASE_URL está vacía (es el «Project URL»).');
  if (!anon) nota('  · NEXT_PUBLIC_SUPABASE_ANON_KEY está vacía (clave «anon public»).');
  nota('Pégalas en .env.local y vuelve a lanzar esto.');
  console.log('');
  process.exit(1);
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)) {
  ojo(`La URL tiene una forma rara: ${url}`);
  nota('Se espera algo como https://abcdefghijklm.supabase.co, sin barra final.');
} else {
  ok(`URL: ${url}`);
}

/* ---------------------------- 2. que la clave sea la pública, no la otra */

function cargaDelToken(jwt) {
  const trozos = jwt.split('.');
  if (trozos.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(trozos[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

const carga = cargaDelToken(anon);
if (!carga) {
  // Las claves nuevas de Supabase (`sb_publishable_…`) no son JWT y no se
  // pueden mirar por dentro: no es motivo para dar la voz de alarma.
  if (/^sb_secret_/.test(anon)) {
    mal('Esa es la clave SECRETA, no la pública.');
    nota('Puesta en NEXT_PUBLIC_* acaba en el navegador de cualquiera.');
    nota('Usa la «publishable»/«anon» y rota la secreta en Supabase.');
    console.log('');
    process.exit(1);
  }
  if (/^sb_publishable_/.test(anon)) {
    ok('Clave pública («publishable»), que es la que toca.');
  } else {
    ojo('La clave no parece un token de Supabase. ¿Está pegada entera?');
  }
} else if (carga.role === 'service_role') {
  mal('¡Esa es la clave de SERVICIO, no la pública!');
  nota('Puesta en NEXT_PUBLIC_* acaba en el navegador de cualquiera y da');
  nota('acceso a todo, saltándose las políticas de fila. Cámbiala ya por la');
  nota('«anon public» y, por seguridad, rota la de servicio en Supabase.');
  console.log('');
  process.exit(1);
} else if (carga.role === 'anon') {
  ok('Clave pública («anon»), que es la que toca.');
} else {
  ojo(`La clave dice ser de tipo «${carga.role}». Se esperaba «anon».`);
}

/* --------------------------------------------------- 3. las ocho tablas */

const client = createClient(url, anon, { auth: { persistSession: false } });

const TABLAS = [
  ['entries', 'los registros de cada día'],
  ['tasks', 'las tareas y recados'],
  ['appearance', 'las fotos y sintonías'],
  ['settings', 'los ajustes de casa'],
  ['lineups', 'los campogramas'],
  ['agendas', 'las agendas semanales'],
  ['replicas', 'el «dejar todos igual que este»'],
  ['calendar_links', 'los permisos de Google Calendar'],
];

const ANCHO = 15;

function noExiste(error) {
  if (!error) return false;
  const codigo = error.code || '';
  const texto = `${error.message || ''}`.toLowerCase();
  return (
    codigo === 'PGRST205' ||
    codigo === '42P01' ||
    texto.includes('could not find the table') ||
    texto.includes('does not exist')
  );
}

function sinRed(error) {
  const texto = `${error?.message || ''}`;
  return /fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo|network/i.test(texto);
}

/* Sin esto, una clave equivocada hacía que las ocho tablas salieran como
   «existe y está protegida»: ocho verdes y ni una sola comprobada. Vale más
   pararse y decirlo. */
function claveMala(error) {
  const codigo = `${error?.code || ''}`;
  const texto = `${error?.message || ''}`.toLowerCase();
  return (
    codigo === '401' ||
    codigo === 'PGRST301' ||
    texto.includes('invalid api key') ||
    texto.includes('invalid authentication') ||
    texto.includes('jwt expired') ||
    texto.includes('jwsinvalid') ||
    texto.includes('no api key')
  );
}

titulo('2. Las tablas del schema.sql');

let conexion = true;
const faltan = [];

for (const [tabla, para] of TABLAS) {
  const { error } = await client.from(tabla).select('*', { head: true, count: 'exact' });

  if (!error) {
    ok(`${tabla.padEnd(ANCHO)} — ${para}`);
  } else if (noExiste(error)) {
    mal(`${tabla.padEnd(ANCHO)} — NO EXISTE (${para})`);
    faltan.push(tabla);
    fallos++;
  } else if (sinRed(error)) {
    mal(`No se puede llegar a Supabase: ${error.message}`);
    nota('¿La URL es la correcta? ¿Hay conexión? ¿El proyecto está pausado?');
    conexion = false;
    fallos++;
    break;
  } else if (claveMala(error)) {
    mal(`Supabase rechaza la clave: ${error.message}`);
    nota('La clave y la URL tienen que ser del MISMO proyecto. Cópialas otra');
    nota('vez de Supabase -> Project Settings -> API, la «anon public» entera.');
    conexion = false;
    fallos++;
    break;
  } else {
    // Que RLS niegue la lectura sin sesión es lo esperado y no es un fallo:
    // significa que la tabla está y además está protegida.
    ok(`${tabla.padEnd(ANCHO)} — existe y está protegida (${para})`);
  }
}

if (faltan.length > 0) {
  console.log('');
  ojo(`Falta${faltan.length === 1 ? '' : 'n'}: ${faltan.join(', ')}`);
  nota('Vuelve a pegar supabase/schema.sql entero en el SQL Editor y dale a');
  nota('Run. Es idempotente: no borra nada, sólo añade lo que falte.');
}

/* ------------------------------- 4. con la cuenta: políticas y el cubo */

if (conexion && email && password) {
  titulo('3. Con la cuenta de casa');

  const { data: sesion, error: errorEntrada } =
    await client.auth.signInWithPassword({ email, password });

  if (errorEntrada) {
    mal(`No se ha podido entrar: ${errorEntrada.message}`);
    if (/email not confirmed/i.test(errorEntrada.message)) {
      nota('Confirma el correo, o desactiva «Confirm email» en Supabase ->');
      nota('Authentication -> Providers -> Email.');
    }
    if (/invalid login/i.test(errorEntrada.message)) {
      nota('Si la cuenta aún no existe, créala una vez desde la propia app.');
    }
    fallos++;
  } else {
    ok(`Dentro como ${sesion.user.email}`);

    for (const [tabla, para] of TABLAS) {
      // `calendar_links` tiene RLS y ninguna política a propósito: desde el
      // navegador no se ve ni con sesión. Que no se lea es lo correcto.
      if (tabla === 'calendar_links') continue;

      const { error } = await client.from(tabla).select('*', { head: true, count: 'exact' });
      if (error) {
        mal(`${tabla.padEnd(ANCHO)} — la cuenta NO puede leerla: ${error.message}`);
        nota('Suele ser la política de fila. Relanza el schema.sql entero.');
        fallos++;
      } else {
        ok(`${tabla.padEnd(ANCHO)} — se lee bien (${para})`);
      }
    }

    // El cubo de las fotos. Listar la carpeta propia es de sólo lectura y es
    // justo lo que ejercita la política por carpeta del schema.sql.
    const carpeta = sesion.user.id;
    const { error: errorCubo } = await client.storage.from('aspecto').list(carpeta, { limit: 1 });

    if (!errorCubo) {
      ok(`${'aspecto'.padEnd(ANCHO)} — el cubo de las fotos responde`);
    } else if (/bucket not found|not found/i.test(errorCubo.message)) {
      mal(`${'aspecto'.padEnd(ANCHO)} — el cubo NO EXISTE. Las fotos no viajarán.`);
      nota('Lo crea el schema.sql. Vuelve a lanzarlo entero.');
      fallos++;
    } else {
      mal(`${'aspecto'.padEnd(ANCHO)} — el cubo da error: ${errorCubo.message}`);
      nota('Si habla de permisos, es la política de storage.objects.');
      fallos++;
    }

    await client.auth.signOut();
  }
} else if (conexion) {
  titulo('3. Con la cuenta de casa');
  ojo('Sin comprobar: faltan COMPROBAR_EMAIL y COMPROBAR_PASSWORD.');
  nota('Ponlos en .env.local si quieres que compruebe también las fotos y');
  nota('que las políticas dejan leer. Es opcional.');
}

/* ------------------------------------------------------------ resumen */

console.log('');
if (fallos === 0 && conexion) {
  console.log(`  ${c('1;32', 'Todo en orden.')} La nube está montada.\n`);
  console.log(`  ${c('2', 'Esto comprueba este ordenador. Para que el móvil la vea, esas dos')}`);
  console.log(`  ${c('2', 'variables tienen que estar también en Vercel, y hay que volver a')}`);
  console.log(`  ${c('2', 'desplegar después de añadirlas.')}\n`);
  process.exit(0);
}

console.log(`  ${c('1;31', `Hay ${fallos} cosa${fallos === 1 ? '' : 's'} que arreglar.`)} Mira arriba.\n`);
process.exit(1);
