import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getCookie } from '@/utils/cookies'

/** Usuario autenticado de la sesión actual, o null si no hay sesión válida. */
export async function getSesion(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Sesión del portal docente. El uid efectivo respeta la simulación de un
    admin (cookie `habich-simular`); la RLS es la frontera real de los datos. */
export async function getSesionDocente(): Promise<{ user: User; uid: string } | null> {
  const user = await getSesion()
  if (!user) return null
  return { user, uid: getCookie('habich-simular') || user.id }
}

/** Sesión del portal alumno: usuario + su fila de `alumnos` con las columnas
    pedidas en `select`. Null si no hay sesión o el usuario no es alumno. */
export async function getSesionAlumno<T>(select: string): Promise<{ user: User; alumno: T } | null> {
  const user = await getSesion()
  if (!user) return null
  const { data } = await supabase.from('alumnos').select(select).eq('id', user.id).maybeSingle()
  if (!data) return null
  return { user, alumno: data as T }
}
