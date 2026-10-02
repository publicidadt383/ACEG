import { supabase } from './supabase'

// Buckets privados del LMS. Sus archivos se sirven con URLs firmadas
// (temporales), nunca con getPublicUrl. En la columna `url` de las tablas
// se guarda el PATH del objeto, y se firma al momento de abrirlo.
export const BUCKET_RECURSOS = 'recursos-lms'
export const BUCKET_ENTREGAS = 'entregas-lms'

// TTL de las URLs firmadas: 1 hora. Se generan al cargar la vista.
const SIGNED_TTL = 60 * 60

/** Firma un path de Storage. Devuelve null si el path es vacío o falla. */
export async function signedUrl(bucket: string, path: string): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_TTL)
  return data?.signedUrl ?? null
}

/** Firma varios paths a la vez. Devuelve un map `path → URL firmada`. */
export async function signedUrlMap(bucket: string, paths: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(paths.filter(Boolean))]
  if (unicos.length === 0) return {}
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unicos, SIGNED_TTL)
  const map: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl
  }
  return map
}
