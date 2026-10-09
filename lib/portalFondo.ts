import { supabase } from '@/lib/supabase'

export const PORTAL_FONDO_DEFAULT = '/foto_colegio.jpg'
const CACHE_KEY = 'aceg:portal-fondo'

/** Última URL conocida (para pintar al instante sin parpadeo). */
export function portalFondoCache(): string | null {
  try { return localStorage.getItem(CACHE_KEY) } catch { return null }
}

export function guardarPortalFondoCache(url: string | null) {
  try {
    if (url) localStorage.setItem(CACHE_KEY, url)
    else localStorage.removeItem(CACHE_KEY)
  } catch { /* almacenamiento no disponible */ }
}

/** Lee el fondo configurado; null si no hay uno personalizado (o la columna aún no existe). */
export async function getPortalFondo(): Promise<string | null> {
  const { data, error } = await supabase.from('landing_config').select('portal_fondo_url').eq('id', 1).maybeSingle()
  if (error) return null
  return (data?.portal_fondo_url as string | null) ?? null
}
