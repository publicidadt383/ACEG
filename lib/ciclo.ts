import { supabase } from '@/lib/supabase'

// Ciclo lectivo activo (tipo='lectivo'). Los bimestres de Planificación viven
// en la misma tabla pero nunca deben usarse para acotar datos académicos.
export interface CicloActivo {
  id: string
  nombre: string
  anio: number
}

let cache: { valor: CicloActivo | null; ts: number } | null = null
const TTL_MS = 60_000

// Devuelve el ciclo lectivo activo (o null si no hay ninguno configurado).
// Cachea 1 minuto: se consulta desde muchas páginas en cada navegación.
export async function getCicloActivo(): Promise<CicloActivo | null> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.valor
  const { data } = await supabase
    .from('ciclos')
    .select('id,nombre,anio')
    .eq('activo', true)
    .eq('tipo', 'lectivo')
    .maybeSingle()
  cache = { valor: (data as CicloActivo | null) ?? null, ts: Date.now() }
  return cache.valor
}

export function invalidarCicloActivo() {
  cache = null
}
