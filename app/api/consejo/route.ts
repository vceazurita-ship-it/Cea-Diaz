import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adviceSystemPrompt, adviceUserPrompt, type HistoryDay } from '@/lib/advicePrompt';
import { PROFILES_BY_ID } from '@/lib/profiles';
import { clientIp, isRateLimited } from '@/lib/rateLimit';
import type { MetricValue, NextChallenge, ProfileId } from '@/types';

/* =========================================================================
 *  POST /api/consejo — consejo del día a partir de lo contado en voz alta.
 *
 *  El dictado ocurre en el móvil (Web Speech API), así que aquí llega ya
 *  texto: lo que se ha contado, lo que se ha registrado hoy y las últimas
 *  sesiones de entrenamiento, que son las que permiten subir el listón.
 * ========================================================================= */

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5';

/** Tope de las observaciones dictadas (~4.000 palabras). */
const MAX_TEXT = 24_000;
/** Días de historial que se aceptan para calibrar la progresión. */
const MAX_HISTORY = 21;

const AdviceSchema = z.object({
  resumen: z.string(),
  consejos: z.array(z.string()),
  reto: z
    .object({
      ambito: z.string(),
      titulo: z.string(),
      detalle: z.string(),
      partiendoDe: z.string(),
    })
    .nullable(),
});

interface RequestBody {
  profileId?: string;
  date?: string;
  observaciones?: string;
  values?: Record<string, MetricValue>;
  history?: HistoryDay[];
  retoPrevio?: NextChallenge;
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
      'Falta configurar ANTHROPIC_API_KEY en el servidor. Sin clave no se puede pedir consejo.',
      503,
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return bad('La petición no es un JSON válido.', 400);
  }

  const { profileId, date, observaciones, values, history, retoPrevio } = body;

  if (!profileId || !(profileId in PROFILES_BY_ID)) return bad('Perfil desconocido.', 400);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('Fecha no válida.', 400);

  const text = (observaciones ?? '').slice(0, MAX_TEXT);
  const registered = values ?? {};

  // Sin nada que contar y sin nada registrado no hay consejo que dar.
  if (!text.trim() && Object.keys(registered).length === 0) {
    return bad('Cuenta cómo ha ido el día o registra algo antes de pedir consejo.', 400);
  }

  const profile = PROFILES_BY_ID[profileId as ProfileId];
  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium', format: zodOutputFormat(AdviceSchema) },
      system: adviceSystemPrompt(profile),
      messages: [
        {
          role: 'user',
          content: adviceUserPrompt(
            profile,
            date,
            text,
            registered,
            (history ?? []).slice(-MAX_HISTORY),
            retoPrevio,
          ),
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return bad('El consejo se ha detenido por seguridad.', 422);
    }

    const advice = response.parsed_output;
    if (!advice) return bad('El consejo no ha llegado en un formato legible.', 502);

    return NextResponse.json({
      resumen: advice.resumen,
      consejos: advice.consejos,
      reto: advice.reto ?? undefined,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return bad('La clave de la API no es válida.', 502);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return bad('Demasiadas peticiones seguidas. Inténtalo en un minuto.', 429);
    }
    if (error instanceof Anthropic.APIError) {
      return bad(`El consejo ha fallado (${error.status}).`, 502);
    }
    return bad('No se ha podido generar el consejo.', 500);
  }
}
