/* =========================================================================
 *  Bajar el historial de Footbar desde el ordenador —
 *  `npm run footbar:bajar -- hugo` (o `leo`)
 *
 *  Hace lo mismo que «📥 Bajar todo lo que se pueda ahora» en Ajustes → GPS:
 *  entra con la cuenta de casa de la app y le pide al servidor vueltas
 *  seguidas hasta que el historial está entero, Footbar corta o se acaba el
 *  cupo de la semana. Cada vuelta guarda lo suyo.
 *
 *  No usa la cuenta de Footbar del peque: el permiso que dio al conectarlo
 *  ya está en el servidor. Sólo hace falta la cuenta de casa, en
 *  `COMPROBAR_EMAIL` y `COMPROBAR_PASSWORD` de `.env.local`, que no se sube.
 * ========================================================================= */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
try {
  for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const limpia = linea.trim();
    const corte = limpia.indexOf('=');
    if (!limpia || limpia.startsWith('#') || corte < 1) continue;
    env[limpia.slice(0, corte).trim()] = limpia.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
  }
} catch {
  console.log('No encuentro .env.local en esta carpeta.');
  process.exit(1);
}

const peque = (process.argv[2] ?? '').toLowerCase();
if (peque !== 'hugo' && peque !== 'leo') {
  console.log('¿De quién? npm run footbar:bajar -- hugo   (o leo)');
  process.exit(1);
}
if (!env.COMPROBAR_EMAIL || !env.COMPROBAR_PASSWORD) {
  console.log('Falta la cuenta de casa: rellena COMPROBAR_EMAIL y COMPROBAR_PASSWORD en .env.local');
  console.log('(la misma con la que entras en la app; no la de Footbar del peque).');
  process.exit(1);
}

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await supa.auth.signInWithPassword({ email: env.COMPROBAR_EMAIL, password: env.COMPROBAR_PASSWORD });
if (error || !data.session) {
  console.log('La cuenta de casa no entra:', error?.message ?? 'sin sesión');
  process.exit(1);
}
const cabeceras = { authorization: `Bearer ${data.session.access_token}`, 'content-type': 'application/json' };
const API = 'https://cea-diaz.vercel.app/api/footbar';

const estado = async () => {
  const r = await fetch(API, { headers: cabeceras });
  const j = await r.json().catch(() => ({}));
  const link = (j.links ?? []).find((l) => l.profileId === peque);
  return { cupo: j.cupo, historial: link?.historial, conectado: Boolean(link), reconectar: link?.needsReconnect, motivo: j.reason ?? j.error };
};

const antes = await estado();
if (!antes.conectado) {
  console.log(`${peque} no está conectado a Footbar en la app${antes.motivo ? ` (${antes.motivo})` : ''}.`);
  process.exit(1);
}
if (antes.reconectar) {
  console.log(`Footbar ya no acepta el permiso de ${peque}: hay que reconectarlo en Ajustes → GPS.`);
  process.exit(1);
}
const verHistorial = (h) => (h ? `${h.tengo}${h.total ? ` de ${h.total}` : ''}${h.completo ? ' (completo)' : ''}` : '¿?');
console.log(`Historial de ${peque}: ${verHistorial(antes.historial)} · consultas libres esta semana: ${antes.cupo?.libres ?? '¿?'}`);

let bajadas = 0;
let lentas = 0;
for (let vuelta = 1; vuelta <= 10; vuelta += 1) {
  const t0 = Date.now();
  const r = await fetch(API, { method: 'POST', headers: cabeceras, body: JSON.stringify({ accion: 'actualizar', profileId: peque, todo: true }) });
  const j = await r.json().catch(() => ({}));
  const res = j.results?.[0];
  if (!r.ok || !res) {
    console.log(`Vuelta ${vuelta}: el servidor dice ${r.status} ${j.error ?? ''}`);
    break;
  }
  bajadas += res.added + res.updated;
  console.log(`Vuelta ${vuelta} (${Math.round((Date.now() - t0) / 1000)} s): ${res.added} nuevas, ${res.updated} corregidas.${res.error ? ` ${res.error}` : ''}`);
  // Footbar tarda a ratos: un «no contesta» suelto no para la descarga.
  lentas = res.reintentable ? lentas + 1 : 0;
  if (res.reintentable && lentas <= 2) continue;
  if (res.error || res.throttled || !res.pendiente) break;
}

const despues = await estado();
console.log(`\nListo: ${bajadas} sesiones bajadas. Historial de ${peque}: ${verHistorial(despues.historial)} · consultas libres: ${despues.cupo?.libres ?? '¿?'}`);
console.log('En la app aparecen en cuanto se sincronice (abrirla o pulsar «Actualizar ahora»).');
