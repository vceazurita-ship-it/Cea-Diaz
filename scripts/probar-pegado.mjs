/* =========================================================================
 *  Prueba del lector de Classroom pegado: `node scripts/probar-pegado.mjs`
 *
 *  Pasa cada caso de `lib/classroomPegado.casos.ts` por `leerPegado` y
 *  compara con lo esperado; sale con código 1 si falla alguno. Como
 *  `probar-apuntar.mjs`, sin dependencias: Node 22.18 o posterior.
 *
 *  Con `--ver fichero.txt` [--hoy 2026-10-21] enseña qué sale de un texto
 *  pegado de verdad, para probar sin tocar los casos.
 * ========================================================================= */

import { existsSync, readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (typeof nodeModule.registerHooks !== 'function') {
  console.error('Hace falta Node 22.18 o posterior (registerHooks y TypeScript sin compilar).');
  process.exit(2);
}

nodeModule.registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (especificador.startsWith('@/')) {
      const base = path.join(RAIZ, especificador.slice(2));
      for (const candidato of [`${base}.ts`, path.join(base, 'index.ts')]) {
        if (existsSync(candidato)) {
          return { url: pathToFileURL(candidato).href, format: 'module-typescript', shortCircuit: true };
        }
      }
    }
    return siguiente(especificador, contexto);
  },
});

const { leerPegado } = await import('@/lib/classroomPegado');
const { CASOS_PEGADO, HOY_PEGADO } = await import('@/lib/classroomPegado.casos');

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes('--ver')) {
  const texto = readFileSync(opcion('--ver') ?? '', 'utf8');
  console.log(JSON.stringify(leerPegado(texto, opcion('--hoy') ?? HOY_PEGADO), null, 2));
  process.exit(0);
}

const clave = (t) => JSON.stringify(t);
let bien = 0;
for (const caso of CASOS_PEGADO) {
  const salen = leerPegado(caso.texto, HOY_PEGADO).map((t) => [t.titulo, t.curso ?? null, t.entrega ?? null, t.atrasada]);
  const esperadas = caso.tareas.map(clave);
  const obtenidas = salen.map(clave);
  const ok = esperadas.length === obtenidas.length && esperadas.every((e, i) => e === obtenidas[i]);
  if (ok) {
    bien++;
  } else {
    console.log(`✗ ${caso.nombre}`);
    console.log(`   esperadas: ${esperadas.join('\n              ')}`);
    console.log(`   salen:     ${obtenidas.join('\n              ')}`);
  }
}
console.log(`${bien}/${CASOS_PEGADO.length} casos bien`);
process.exit(bien === CASOS_PEGADO.length ? 0 : 1);
