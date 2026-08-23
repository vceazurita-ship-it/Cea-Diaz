/* =========================================================================
 *  Tope de peticiones por IP.
 *
 *  Las dos rutas que hablan con Claude son públicas en el despliegue, así
 *  que quien dé con la URL podría gastar la clave. Esto pone un techo: una
 *  familia hace un puñado de peticiones al día y ni lo nota; quien intente
 *  abusar se queda a las puertas enseguida.
 *
 *  No es una barrera de verdad, es un tope de daño: en Vercel cada función
 *  puede vivir en varias instancias y el contador va en memoria, de modo que
 *  el límite real es por instancia y se reinicia al enfriarse. La barrera de
 *  verdad es *Deployment Protection*, que se activa desde el panel.
 * ========================================================================= */

/** Ventana de observación. */
const WINDOW_MS = 10 * 60 * 1000;
/** Peticiones permitidas por IP dentro de la ventana. */
const MAX_REQUESTS = 20;
/** Tope de IPs recordadas, para que el mapa no crezca sin fin. */
const MAX_TRACKED = 500;

const hits = new Map<string, number[]>();

/** La IP del visitante, tal y como la deja el proxy de Vercel. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'desconocida';
}

export interface RateLimitOptions {
  /**
   * Contador aparte. Las rutas que gastan la clave de Claude y las que sólo
   * escriben en un calendario no compiten por el mismo cupo: apuntar seis
   * recados seguidos no puede dejar a nadie sin analizar la cena.
   */
  bucket?: string;
  /** Peticiones permitidas en la ventana; por defecto, las de la clave. */
  max?: number;
}

/**
 * Anota una petición y dice si se pasa del tope.
 * @returns `true` si hay que rechazarla.
 */
export function isRateLimited(ip: string, options: RateLimitOptions = {}): boolean {
  const now = Date.now();
  const key = options.bucket ? `${options.bucket}:${ip}` : ip;
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);

  recent.push(now);
  hits.set(key, recent);

  // Limpieza perezosa: sólo cuando el mapa se hace grande.
  if (hits.size > MAX_TRACKED) {
    for (const [tracked, times] of hits) {
      if (times.every((time) => now - time >= WINDOW_MS)) hits.delete(tracked);
    }
  }

  return recent.length > (options.max ?? MAX_REQUESTS);
}
