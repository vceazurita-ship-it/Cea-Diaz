import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isMealMoment, mealSystemPrompt, mealUserPrompt } from '@/lib/mealPrompt';
import { PROFILES_BY_ID } from '@/lib/profiles';
import { clientIp, isRateLimited } from '@/lib/rateLimit';
import type { MetricValue, ProfileId } from '@/types';

/* =========================================================================
 *  POST /api/plato — analiza la foto de un plato.
 *
 *  Es la única parte de la app que necesita servidor: la clave de la API no
 *  puede vivir en el navegador. Recibe la foto ya reducida en el móvil, la
 *  manda a Claude junto con el objetivo de quien come y devuelve la nota y
 *  las recomendaciones ya validadas contra un esquema.
 * ========================================================================= */

export const runtime = 'nodejs';
/** El análisis con visión puede tardar; el máximo de Vercel para Node es 60 s. */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Modelo por defecto; se puede cambiar sin tocar el código. */
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5';

/** Tope de la imagen en base64 (~1,5 MB de foto). */
const MAX_IMAGE_CHARS = 2_000_000;

/** Tope de lo que se cuenta del plato: son dos frases, no un tratado. */
const MAX_CONTEXT = 2_000;

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const VerdictSchema = z.object({
  esComida: z.boolean(),
  nota: z.number(),
  titulo: z.string(),
  resumen: z.string(),
  alimentos: z.array(
    z.object({
      nombre: z.string(),
      racion: z.string(),
      balance: z.enum(['bien', 'justo', 'sobra', 'falta']),
    }),
  ),
  aciertos: z.array(z.string()),
  ajustes: z.array(
    z.object({
      tipo: z.enum(['aumentar', 'reducir', 'cambiar', 'anadir']),
      texto: z.string(),
    }),
  ),
});

interface RequestBody {
  profileId?: string;
  moment?: string;
  image?: string;
  mediaType?: string;
  /** Lo que se ha contado del plato, dictado o escrito en el móvil. */
  context?: string;
  values?: Record<string, MetricValue>;
}

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // Tope de gasto antes que nada: es lo más barato que se puede comprobar.
  if (isRateLimited(clientIp(request))) {
    return bad('Demasiadas peticiones desde este dispositivo. Espera unos minutos.', 429);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return bad(
      'Falta configurar ANTHROPIC_API_KEY en el servidor. Sin clave no se puede analizar la foto.',
      503,
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return bad('La petición no es un JSON válido.', 400);
  }

  const { profileId, moment, image, mediaType, context, values } = body;

  if (!profileId || !(profileId in PROFILES_BY_ID)) return bad('Perfil desconocido.', 400);
  if (!isMealMoment(moment)) return bad('Momento del día no válido.', 400);
  if (!image || typeof image !== 'string') return bad('Falta la imagen.', 400);
  if (image.length > MAX_IMAGE_CHARS) return bad('La foto pesa demasiado.', 413);

  const media = MEDIA_TYPES.includes(mediaType as (typeof MEDIA_TYPES)[number])
    ? (mediaType as (typeof MEDIA_TYPES)[number])
    : 'image/jpeg';

  const said = typeof context === 'string' ? context.slice(0, MAX_CONTEXT) : '';

  const profile = PROFILES_BY_ID[profileId as ProfileId];
  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      // El plato se mira un momento y se responde: no hace falta más profundidad.
      output_config: { effort: 'medium', format: zodOutputFormat(VerdictSchema) },
      system: mealSystemPrompt(profile),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data: image } },
            { type: 'text', text: mealUserPrompt(profile.id, moment, values ?? {}, said) },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return bad('El análisis se ha detenido por seguridad. Prueba con otra foto.', 422);
    }

    const verdict = response.parsed_output;
    if (!verdict) return bad('El análisis no ha devuelto un resultado legible.', 502);

    return NextResponse.json({
      ...verdict,
      // La nota se acota aquí: la interfaz siempre pinta sobre 10.
      nota: Math.max(0, Math.min(10, Math.round(verdict.nota * 10) / 10)),
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return bad('La clave de la API no es válida.', 502);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return bad('Demasiadas peticiones seguidas. Inténtalo en un minuto.', 429);
    }
    if (error instanceof Anthropic.APIError) {
      return bad(`El análisis ha fallado (${error.status}).`, 502);
    }
    return bad('No se ha podido analizar la foto.', 500);
  }
}
