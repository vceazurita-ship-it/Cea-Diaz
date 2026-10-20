import { APPEARANCE_BUCKET } from '@/lib/cloud';
import { supabase } from '@/lib/supabase';
import type { ArchivoCole } from '@/lib/apuntesCole';
import type { ClassroomProfile } from '@/lib/classroomModel';

export { esImagen, type ArchivoCole } from '@/lib/apuntesCole';

/* =========================================================================
 *  Los materiales del cole, tal cual: los PDF y las fotos de las fichas que
 *  la profesora cuelga en Classroom.
 *
 *  No pasan por el repositorio (es público, y son del colegio). Los sube
 *  `scripts/subir-cole.mjs` al cubo privado de la cuenta, en
 *  `<uid>/cole/<perfil>/`, junto con un `indice.json` que dice de qué clase
 *  es cada uno. La app sólo lee: baja el índice, firma los enlaces por unas
 *  horas y los abre. Sin sesión en la cuenta, no se ve nada.
 * ========================================================================= */

export interface IndiceCole {
  subido: string;
  archivos: ArchivoCole[];
}

export interface ArchivoFirmado extends ArchivoCole {
  url: string | null;
}

/** Firmados para seis horas: lo que dura de sobra una tarde de estudio. */
const VALIDEZ_S = 6 * 3600;

export function carpetaCole(owner: string, profileId: ClassroomProfile): string {
  return `${owner}/cole/${profileId}`;
}

async function bajar(
  profileId: ClassroomProfile,
): Promise<{ subido: string; archivos: ArchivoFirmado[] } | null> {
  const client = supabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  const owner = data.session?.user.id;
  if (!owner) return null;

  const cubo = client.storage.from(APPEARANCE_BUCKET);
  const { data: blob, error } = await cubo.download(`${carpetaCole(owner, profileId)}/indice.json`);
  if (error || !blob) return null;

  const indice = JSON.parse(await blob.text()) as IndiceCole;
  const archivos = Array.isArray(indice.archivos) ? indice.archivos : [];
  if (archivos.length === 0) return { subido: indice.subido, archivos: [] };

  const { data: firmas, error: errorFirma } = await cubo.createSignedUrls(
    archivos.map((a) => a.ruta),
    VALIDEZ_S,
  );
  if (errorFirma) throw new Error(errorFirma.message);
  const porRuta = new Map((firmas ?? []).map((f) => [f.path, f.signedUrl] as const));

  return {
    subido: indice.subido,
    archivos: archivos.map((a) => ({ ...a, url: porRuta.get(a.ruta) ?? null })),
  };
}

/** Lo bajado se comparte una hora: la sección, el parte y las propuestas piden lo mismo. */
const VIGENCIA_MS = 3600_000;
const memoria = new Map<ClassroomProfile, { at: number; promesa: ReturnType<typeof bajar> }>();

/**
 * El índice del niño con cada archivo ya firmado, o `null` si no hay sesión
 * o todavía no se ha subido nada. Una sola descarga por hora y niño.
 */
export function materialesCole(profileId: ClassroomProfile): ReturnType<typeof bajar> {
  const hay = memoria.get(profileId);
  if (hay && Date.now() - hay.at < VIGENCIA_MS) return hay.promesa;
  const promesa = bajar(profileId);
  memoria.set(profileId, { at: Date.now(), promesa });
  // Un fallo no se guarda: la próxima vez se vuelve a intentar.
  promesa.then((d) => d === null && memoria.delete(profileId)).catch(() => memoria.delete(profileId));
  return promesa;
}

export function pesoLegible(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
