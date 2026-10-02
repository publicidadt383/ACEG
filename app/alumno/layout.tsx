'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { getSesionAlumno } from '@/lib/auth'
import PortalShell from '@/components/PortalShell'
import Spinner from '@/components/Spinner'

interface AlumnoCtx {
  nombre: string
  grado: string
  grupo: string
  nombreSalon: string
  badges: Record<string, number>
  handleLogout: () => Promise<void>
}

const Ctx = createContext<AlumnoCtx | null>(null)

export function useAlumnoCtx() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAlumnoCtx fuera del AlumnoLayout')
  return v
}

const SECTION_TITLES: Record<string, string> = {
  '/alumno':            'Inicio',
  '/alumno/horario':    'Mi Horario',
  '/alumno/cursos':     'Mis Cursos',
  '/alumno/calendario': 'Calendario',
  '/alumno/asistencia': 'Mi Asistencia',
  '/alumno/anuncios':   'Anuncios',
  '/alumno/tareas':     'Tareas',
  '/alumno/mi-qr':      'Mi QR',
  '/alumno/examenes':   'Exámenes',
  '/alumno/boletin':    'Mi Boletín',
}

async function countPendingTasks(alumnoId: string, grado: string, grupo: string, cicloId: string | null): Promise<number> {
  let asigsQ = supabase
    .from('asignaciones').select('id').eq('grado', grado).eq('grupo', grupo)
  if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
  const { data: asigs } = await asigsQ
  if (!asigs?.length) return 0
  const { data: unids } = await supabase
    .from('unidades').select('id').in('asignacion_id', asigs.map(a => a.id))
  if (!unids?.length) return 0
  const { data: sess } = await supabase
    .from('sesiones').select('id').in('unidad_id', unids.map(u => u.id))
  if (!sess?.length) return 0
  const { data: tareas } = await supabase
    .from('tareas').select('id').in('sesion_id', sess.map(s => s.id))
  if (!tareas?.length) return 0
  const { count } = await supabase
    .from('entregas')
    .select('tarea_id', { count: 'exact', head: true })
    .eq('alumno_id', alumnoId)
    .in('tarea_id', tareas.map(t => t.id))
  return tareas.length - (count ?? 0)
}

export default function AlumnoLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [nombre,       setNombre]       = useState('')
  const [grado,        setGrado]        = useState('')
  const [grupo,        setGrupo]        = useState('')
  const [nombreSalon,  setNombreSalon]  = useState('')
  const [loading,      setLoading]      = useState(true)
  const [badges,       setBadges]       = useState<Record<string, number>>({})

  useEffect(() => {
    async function init() {
      const sesion = await getSesionAlumno<{ nombre: string; apellidos: string; grado: string; grupo: string }>('nombre,apellidos,grado,grupo')
      if (!sesion) { router.push('/login'); return }
      const { user, alumno } = sesion
      setNombre(`${alumno.nombre} ${alumno.apellidos}`)
      setGrado(alumno.grado)
      setGrupo(alumno.grupo)
      setLoading(false)

      supabase.from('salones').select('nombre')
        .eq('grado', alumno.grado).eq('grupo', alumno.grupo)
        .maybeSingle()
        .then(({ data }) => { if (data?.nombre) setNombreSalon(data.nombre) })

      const desde = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
      const cicloId = (await getCicloActivo())?.id ?? null
      const [tareasPend, anunciosNuevos] = await Promise.all([
        countPendingTasks(user.id, alumno.grado, alumno.grupo, cicloId),
        (async () => {
          let asigsQ = supabase
            .from('asignaciones').select('id').eq('grado', alumno.grado).eq('grupo', alumno.grupo)
          if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
          const { data: asigs } = await asigsQ
          const asigIds = (asigs ?? []).map(a => a.id)
          const { count: cGlobal } = await supabase
            .from('anuncios').select('id', { count: 'exact', head: true })
            .eq('tipo', 'global').gte('created_at', desde)
          let cCurso = 0
          if (asigIds.length) {
            const { count } = await supabase
              .from('anuncios').select('id', { count: 'exact', head: true })
              .eq('tipo', 'curso').in('asignacion_id', asigIds).gte('created_at', desde)
            cCurso = count ?? 0
          }
          return (cGlobal ?? 0) + cCurso
        })(),
      ])
      const newBadges: Record<string, number> = {}
      if (tareasPend > 0)     newBadges['/alumno/cursos']   = tareasPend
      if (anunciosNuevos > 0) newBadges['/alumno/anuncios'] = anunciosNuevos
      setBadges(newBadges)
    }
    init()
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    document.cookie = 'habich-rol=; path=/; max-age=0'
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: '#F6F8FB' }}>
        <Spinner cls="h-8 w-8" />
      </div>
    )
  }

  const ctx: AlumnoCtx = { nombre, grado, grupo, nombreSalon, badges, handleLogout }

  if (pathname === '/alumno') {
    return (
      <Ctx.Provider value={ctx}>
        {children}
      </Ctx.Provider>
    )
  }

  const sectionTitle = SECTION_TITLES[pathname] ?? undefined

  return (
    <Ctx.Provider value={ctx}>
      <PortalShell
        title="Portal Alumno"
        sectionTitle={sectionTitle}
        onBack={() => router.push('/alumno')}
        backLabel="Inicio"
        onLogout={handleLogout}
        userName={nombre}
        userRoleLabel={`${grado} ${grupo}${nombreSalon ? ` · ${nombreSalon}` : ''}`}
        accent="#0B2447"
        pageBg="#F6F8FB">
        {children}
      </PortalShell>
    </Ctx.Provider>
  )
}
