import type { HouseSettings, PinDigest, ThemePreference } from '@/types';

/* =========================================================================
 *  Ajustes de la casa: modo día/noche, sintonías y PIN.
 *
 *  Antes eran tres claves sueltas de `localStorage` que no salían del
 *  aparato. Ahora son una sola cosa con fecha de edición, que es lo que
 *  permite sincronizarlas: gana la última elección, igual que en el resto
 *  de la app.
 *
 *  El PIN nunca se guarda tal cual, ni aquí ni en la nube: se guarda su
 *  huella (PBKDF2-SHA256 con sal). Eso impide leerlo —del navegador, de la
 *  base o por encima del hombro—, pero no convierte cuatro dígitos en una
 *  contraseña: sigue siendo una barrera doméstica, no un cerrojo.
 * ========================================================================= */

export const SETTINGS_KEY = 'habitos-familia:ajustes';

/** Claves de cuando cada ajuste iba por su cuenta. Se migran y se retiran. */
export const LEGACY_THEME_KEY = 'habitos-familia:modo';
const LEGACY_SOUND_KEY = 'habitos-familia:sonido';
const LEGACY_PIN_KEY = 'habitos-familia:pin';

export const DEFAULT_PIN = '2468';

/**
 * Vueltas de PBKDF2. Suficientes para que probar los diez mil PIN de cuatro
 * dígitos cueste una tarde en vez de un instante, y lo bastante pocas para
 * que comprobar el bueno no se note al entrar.
 */
const PIN_ROUNDS = 120_000;

/**
 * Marca de los ajustes que nadie ha tocado. Cualquier elección real es más
 * reciente que esto, así que un aparato recién estrenado adopta lo de casa
 * en vez de imponer sus valores de fábrica.
 */
const NEVER = '1970-01-01T00:00:00.000Z';

const PREFERENCES: ThemePreference[] = ['auto', 'light', 'dark'];

export function defaultSettings(): HouseSettings {
  return { theme: 'auto', sound: true, pin: null, updatedAt: NEVER };
}

/* ---------------------------------------------------------------------------
 * Lectura y escritura
 * ------------------------------------------------------------------------- */

let cache: HouseSettings | null = null;
const listeners = new Set<() => void>();

function isPreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && PREFERENCES.includes(value as ThemePreference);
}

function isDigest(value: unknown): value is PinDigest {
  if (!value || typeof value !== 'object') return false;
  const { salt, hash, rounds } = value as Partial<PinDigest>;
  return typeof salt === 'string' && typeof hash === 'string' && typeof rounds === 'number';
}

/** Deja pasar sólo lo que tiene forma de ajuste; lo demás vuelve a fábrica. */
function normalize(value: Partial<HouseSettings> | null): HouseSettings {
  const base = defaultSettings();
  if (!value || typeof value !== 'object') return base;

  return {
    theme: isPreference(value.theme) ? value.theme : base.theme,
    sound: typeof value.sound === 'boolean' ? value.sound : base.sound,
    pin: isDigest(value.pin) ? value.pin : null,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : base.updatedAt,
  };
}

/**
 * Lo que dejaron las versiones anteriores. Se recoge sin fecharlo: quien ya
 * tenía puesto el modo día en la tableta de la cocina no debe verlo cambiar
 * de golpe al actualizar. A partir del primer cambio, mandan para todos.
 */
function fromLegacy(): HouseSettings {
  const settings = defaultSettings();

  const theme = window.localStorage.getItem(LEGACY_THEME_KEY);
  if (isPreference(theme)) settings.theme = theme;
  if (window.localStorage.getItem(LEGACY_SOUND_KEY) === 'off') settings.sound = false;

  return settings;
}

export function loadSettings(): HouseSettings {
  if (cache) return cache;
  if (typeof window === 'undefined') return defaultSettings();

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    cache = raw ? normalize(JSON.parse(raw) as Partial<HouseSettings>) : fromLegacy();
  } catch {
    cache = defaultSettings();
  }

  return cache;
}

function commit(next: HouseSettings): void {
  cache = next;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Modo privado o cuota llena: vale para esta sesión y no se avisa. Un
      // ajuste que no se recuerda molesta bastante menos que un registro
      // perdido, que sí se cuenta en alto.
    }
  }

  for (const listener of listeners) listener();
}

/** Cambia un ajuste en este aparato y lo fecha: eso es lo que lo hace viajar. */
export function updateSettings(patch: Partial<Omit<HouseSettings, 'updatedAt'>>): HouseSettings {
  const next: HouseSettings = { ...loadSettings(), ...patch, updatedAt: new Date().toISOString() };
  commit(next);
  return next;
}

/** Adopta lo que venía de la nube. No se refecha: la elección es de quien la hizo. */
export function applyRemoteSettings(remote: Partial<HouseSettings>): void {
  commit(normalize(remote));
}

/** Avisa cuando cambian, vengan de este aparato o de otro. */
export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ---------------------------------------------------------------------------
 * PIN
 * ------------------------------------------------------------------------- */

/** `crypto.subtle` sólo existe en contextos seguros: https o localhost. */
function subtle(): SubtleCrypto | null {
  if (typeof window === 'undefined') return null;
  return window.crypto?.subtle ?? null;
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const fromHex = (text: string) =>
  Uint8Array.from(text.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));

async function derive(pin: string, salt: string, rounds: number): Promise<string | null> {
  const crypto = subtle();
  if (!crypto) return null;

  const key = await crypto.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.deriveBits(
    { name: 'PBKDF2', salt: fromHex(salt), iterations: rounds, hash: 'SHA-256' },
    key,
    256,
  );

  return toHex(new Uint8Array(bits));
}

/** El PIN en claro que pueda quedar de una versión anterior. */
function legacyPin(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LEGACY_PIN_KEY);
}

export async function setPin(pin: string): Promise<void> {
  if (!subtle()) {
    throw new Error('Este navegador no puede guardar el PIN a salvo. Hace falta https.');
  }

  const salt = toHex(window.crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derive(pin, salt, PIN_ROUNDS);
  if (!hash) throw new Error('No se ha podido guardar el PIN.');

  updateSettings({ pin: { salt, hash, rounds: PIN_ROUNDS } });
  window.localStorage.removeItem(LEGACY_PIN_KEY);
}

export async function verifyPin(typed: string): Promise<boolean> {
  const { pin } = loadSettings();
  if (pin) return (await derive(typed, pin.salt, pin.rounds)) === pin.hash;

  // Sin huella: o sigue valiendo el de fábrica, o queda el de una versión
  // anterior todavía sin convertir.
  const legacy = legacyPin();
  return typed === (legacy ?? DEFAULT_PIN);
}

/** La pista del PIN de fábrica sólo tiene sentido mientras nadie lo haya cambiado. */
export function usesDefaultPin(): boolean {
  if (loadSettings().pin) return false;
  return (legacyPin() ?? DEFAULT_PIN) === DEFAULT_PIN;
}

/**
 * Convierte el PIN en claro que dejó una versión anterior. Se llama al
 * arrancar: mientras esa clave siga ahí, el PIN de la casa está legible en
 * el navegador. Al convertirlo se fecha, así que se propaga al resto de
 * aparatos; es justo lo que se quiere, porque el bueno es ése y no el de
 * fábrica que tengan los demás.
 */
export async function migrateLegacyPin(): Promise<void> {
  const legacy = legacyPin();
  if (legacy === null) return;

  // Ya hay huella, o el legado era el de fábrica: no hay nada que conservar.
  if (loadSettings().pin || legacy === DEFAULT_PIN) {
    window.localStorage.removeItem(LEGACY_PIN_KEY);
    return;
  }

  try {
    await setPin(legacy);
  } catch {
    // Sin contexto seguro se queda como estaba: seguir pidiéndolo en claro
    // es feo, pero perder el PIN de la casa lo es más.
  }
}
