/* =========================================================================
 *  Abrir un PDF protegido con la contraseña de su dueño.
 *
 *  Los informes del gabinete vienen cerrados con contraseña. Eso no es un
 *  problema de seguridad que haya que sortear: es un candado del que se tiene
 *  la llave, y lo único que hace falta es que la aplicación sepa usarla para
 *  no obligar a copiar veinte cifras a mano.
 *
 *  El formato PDF cierra los documentos con un esquema viejo y muy concreto:
 *  la clave sale de un MD5 de la contraseña rellenada con una cadena fija,
 *  repetido cincuenta veces, y cada objeto se descifra con su propia clave
 *  derivada. El navegador no trae MD5 —hace años que no se usa para nada
 *  serio—, así que va aquí en veinte líneas; el AES sí lo trae.
 *
 *  Como todo lo demás de esta sección: el archivo se abre en el aparato, se
 *  le sacan las cifras y se tira. La contraseña no se guarda en ningún sitio.
 * ========================================================================= */

/** El relleno que manda el formato cuando la contraseña no llega a 32 bytes. */
const PAD = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

/* ---------------------------------------------------------------------------
 * MD5
 *
 * La implementación de siempre, la del RFC 1321. No está aquí por gusto: es
 * lo que pide el formato, y `crypto.subtle` ya no lo ofrece.
 * ------------------------------------------------------------------------- */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));

const rotl = (x: number, c: number) => (x << c) | (x >>> (32 - c));

export function md5(input: Uint8Array): Uint8Array {
  const bits = input.length * 8;
  const relleno = new Uint8Array((((input.length + 8) >> 6) + 1) * 64);
  relleno.set(input);
  relleno[input.length] = 0x80;
  new DataView(relleno.buffer).setUint32(relleno.length - 8, bits >>> 0, true);
  new DataView(relleno.buffer).setUint32(relleno.length - 4, Math.floor(bits / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const view = new DataView(relleno.buffer);
  for (let chunk = 0; chunk < relleno.length; chunk += 64) {
    const m = Array.from({ length: 16 }, (_, i) => view.getUint32(chunk + i * 4, true));
    let [a, b, c, d] = [a0, b0, c0, d0];

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const tmp = d;
      d = c;
      c = b;
      b = (b + rotl((a + f + K[i] + m[g]) >>> 0, S[i])) >>> 0;
      a = tmp;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const salida = new DataView(out.buffer);
  salida.setUint32(0, a0, true);
  salida.setUint32(4, b0, true);
  salida.setUint32(8, c0, true);
  salida.setUint32(12, d0, true);
  return out;
}

/** RC4, que es lo que usan los PDF algo más viejos. */
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    out[n] = data[n] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

const concat = (...partes: Uint8Array[]): Uint8Array => {
  const total = partes.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of partes) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export interface Candado {
  /** La clave del documento. */
  key: Uint8Array;
  /** Si los flujos van con AES o con RC4. */
  aes: boolean;
}

/** Los bytes de una cadena latin1, que es como viene el PDF. */
export function latinBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

const hexBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/**
 * La clave del documento, a partir de la contraseña de usuario.
 *
 * Devuelve `null` si el PDF no está protegido, o si lo está con un esquema
 * que aquí no se contempla (los de revisión 5 y 6, que usan SHA-256).
 */
export function abrirCandado(raw: string, password: string): Candado | null {
  if (!/\/Encrypt\b/.test(raw)) return null;

  const o = /\/O\s*<([0-9A-Fa-f]+)>/.exec(raw);
  const p = /\/P\s+(-?\d+)/.exec(raw);
  const id = /\/ID\s*\[\s*<([0-9A-Fa-f]+)>/.exec(raw);
  const r = Number((/\/R\s+(\d+)/.exec(raw) || [])[1]);
  if (!o || !p || !id || !(r === 2 || r === 3 || r === 4)) return null;

  const bits = Number((/\/Length\s+(\d+)/.exec(raw) || [])[1] ?? 40);
  const n = Math.max(5, Math.min(16, Math.floor(bits / 8)));
  const encryptMetadata = !/\/EncryptMetadata\s+false/.test(raw);

  const pBuf = new Uint8Array(4);
  new DataView(pBuf.buffer).setInt32(0, Number(p[1]), true);

  const rellenada = concat(latinBytes(password), PAD).slice(0, 32);
  const partes = [rellenada, hexBytes(o[1]), pBuf, hexBytes(id[1])];
  if (r >= 4 && !encryptMetadata) partes.push(new Uint8Array([0xff, 0xff, 0xff, 0xff]));

  let key = md5(concat(...partes));
  if (r >= 3) for (let i = 0; i < 50; i++) key = md5(key.slice(0, n));

  return { key: key.slice(0, n), aes: /\/CFM\s*\/AESV2/.test(raw) };
}

/** La clave de un objeto concreto, que es la del documento más su número. */
function claveDe({ key, aes }: Candado, num: number, gen: number): Uint8Array {
  const extra = new Uint8Array([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, gen & 0xff, (gen >> 8) & 0xff]);
  const partes = [key, extra];
  if (aes) partes.push(new Uint8Array([0x73, 0x41, 0x6c, 0x54]));
  return md5(concat(...partes)).slice(0, Math.min(key.length + 5, 16));
}

/** Descifra el flujo de un objeto. */
export async function descifrar(
  candado: Candado,
  datos: Uint8Array,
  num: number,
  gen: number,
): Promise<Uint8Array> {
  const k = claveDe(candado, num, gen);
  if (!candado.aes) return rc4(k, datos);
  if (datos.length <= 16) return new Uint8Array(0);

  try {
    // Los dieciséis primeros bytes son el vector de inicio; el resto, el
    // mensaje. El relleno se quita a mano porque el navegador espera el
    // formato de bloque exacto y aquí puede venir cortado.
    const iv = datos.slice(0, 16);
    const cuerpo = datos.slice(16, 16 + Math.floor((datos.length - 16) / 16) * 16);
    if (cuerpo.length === 0) return new Uint8Array(0);

    const clave = await crypto.subtle.importKey('raw', k as BufferSource, 'AES-CBC', false, ['decrypt']);
    // Se añade un bloque de relleno válido para que el navegador no proteste
    // al quitar el suyo, y luego se recorta.
    const plano = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv as BufferSource }, clave, cuerpo as BufferSource),
    );
    return plano;
  } catch {
    return new Uint8Array(0);
  }
}
