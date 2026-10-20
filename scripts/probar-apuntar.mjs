/* =========================================================================
 *  Prueba del apuntador: `node scripts/probar-apuntar.mjs`
 *
 *  Pasa por `interpretar` cada caso de `lib/agentes/apuntar.casos.ts` y
 *  compara con lo esperado. Sin dependencias: Node (22.18 o posterior) ya
 *  lee TypeScript quitándole los tipos, y aquí sólo se le enseña a resolver
 *  los `@/…` del proyecto. Sale con código 1 si falla alguno.
 *
 *  Con `--ver "frase"` [--perfil maria] [--hora 2] enseña qué sale de una
 *  frase suelta, para probar sin tocar los casos.
 * ========================================================================= */

import { existsSync } from 'node:fs';
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

const { interpretar } = await import('@/lib/agentes/apuntar');
const { CASOS, HOY_CASOS } = await import('@/lib/agentes/apuntar.casos');

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes('--ver')) {
  const frase = opcion('--ver') ?? '';
  const r = interpretar(frase, {
    perfilActual: opcion('--perfil') ?? 'victor',
    hoy: opcion('--hoy') ?? HOY_CASOS,
    hora: Number(opcion('--hora') ?? 12),
  });
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

const clave = (p) => `${p[0]}|${p[1]}|${p[2]}|${JSON.stringify(p[3])}`;
let bien = 0;
const fallos = [];

for (const caso of CASOS) {
  const r = interpretar(caso.frase, {
    perfilActual: caso.perfil ?? 'victor',
    hoy: HOY_CASOS,
    hora: caso.hora ?? 12,
  });
  const obtenidas = r.propuestas.map((p) => [p.profileId, p.date, p.metricId, p.value, p.confianza]);
  const problemas = [];

  const esperadas = new Map(caso.propuestas.map((e) => [clave(e), e]));
  const vistas = new Map(obtenidas.map((o) => [clave(o), o]));
  for (const [k, e] of esperadas) {
    const o = vistas.get(k);
    if (!o) problemas.push(`falta ${k}`);
    else if (e[4] && e[4] !== o[4]) problemas.push(`${k}: confianza ${o[4]}, se esperaba ${e[4]}`);
  }
  for (const k of vistas.keys()) if (!esperadas.has(k)) problemas.push(`sobra ${k}`);

  const esperadoNo = caso.noEntendido ?? [];
  if (JSON.stringify(esperadoNo) !== JSON.stringify(r.noEntendido)) {
    problemas.push(`noEntendido ${JSON.stringify(r.noEntendido)}, se esperaba ${JSON.stringify(esperadoNo)}`);
  }

  if (problemas.length === 0) bien += 1;
  else fallos.push({ frase: caso.frase, perfil: caso.perfil ?? 'victor', problemas });
}

for (const f of fallos) {
  console.log(`✗ «${f.frase}» (${f.perfil})`);
  for (const p of f.problemas) console.log(`    ${p}`);
}
console.log(`\n${bien}/${CASOS.length} casos bien.`);
process.exit(fallos.length ? 1 : 0);
