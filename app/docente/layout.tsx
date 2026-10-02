'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { getCookie } from '@/utils/cookies'
import PortalShell from '@/components/PortalShell'
import Spinner from '@/components/Spinner'

interface DocenteCtx {
  nombre: string
  badges: Record<string, number>
  simulando: boolean
  salirSimulacion: () => void
  handleLogout: () => Promise<void>
}

const Ctx = createContext<DocenteCtx | null>(null)

export function useDocenteCtx() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDocenteCtx fuera del DocenteLayout')
  return v
}

const SECTION_TITLES: Record<string, string> = {
  '/docente':            'Inicio',
  '/docente/horario':    'Mi Horario',
  '/docente/cursos':     'Mis Cursos',
  '/docente/calendario': 'Calendario',
  '/docente/asistencia': 'Asistencia',
  '/docente/anuncios':   'Anuncios',
  '/docente/examenes':   'Exámenes',
  '/docente/planificacion': 'Planificación',
}

async function countUngradedEntregas(uid: string): Promise<number> {
  const cicloId = (await getCicloActivo())?.id ?? null
  let asigsQ = supabase
    .from('asignaciones').select('id').eq('docente_id', uid)
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
  const { data: entregas } = await supabase
    .from('entregas').select('id').in('tarea_id', tareas.map(t => t.id))
  if (!entregas?.length) return 0
  const { count: califs } = await supabase
    .from('calificaciones')
    .select('entrega_id', { count: 'exact', head: true })
    .in('entrega_id', entregas.map(e => e.id))
  return entregas.length - (califs ?? 0)
}

export default function DocenteLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [nombre,    setNombre]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [simulando, setSimulando] = useState(false)
  const [badges,    setBadges]    = useState<Record<string, number>>({})

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const simularId = getCookie('habich-simular')
      if (simularId) {
        const { data: isAdmin } = await supabase.from('user_admin').select('id').eq('id', user.id).maybeSingle()
        if (isAdmin) {
          const { data: docente } = await supabase.from('docentes').select('nombre').eq('id', simularId).maybeSingle()
          if (docente) {
            setNombre(docente.nombre); setSimulando(true); setLoading(false)
            countUngradedEntregas(simularId).then(n => { if (n > 0) setBadges({ '/docente/cursos': n }) })
            return
          }
        }
        document.cookie = 'habich-simular=; path=/; max-age=0'
      }

      const { data: docente } = await supabase
        .from('docentes').select('nombre').eq('id', user.id).maybeSingle()
      if (!docente) { router.push('/login'); return }
      setNombre(docente.nombre)
      setLoading(false)
      countUngradedEntregas(user.id).then(n => { if (n > 0) setBadges({ '/docente/cursos': n }) })
    }
    init()
  }, [router])

  function salirSimulacion() {
    document.cookie = 'habich-simular=; path=/; max-age=0'
    window.close()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    document.cookie = 'habich-rol=; path=/; max-age=0'
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F6F8FB' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <Spinner size={40} color="#0B2447" />
          <p style={{ color: '#94A3B8', fontSize: '10px', fontWeight: 700, letterSpacing: '.18em' }}>
            CARGANDO
          </p>
        </div>
      </div>
    )
  }

  const banner = simulando ? (
    <div className="flex items-center justify-between gap-3"
      style={{ padding: '8px 16px', background: 'linear-gradient(90deg, #b45309, #d97706)', boxShadow: '0 2px 12px rgba(180,83,9,.3)' }}>
      <div className="flex items-center gap-2">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        </svg>
        <p className="text-white text-xs font-black">
          Modo simulación — viendo como <span className="underline">{nombre}</span>
        </p>
      </div>
      <button onClick={salirSimulacion}
        className="text-white text-xs font-black rounded-lg"
        style={{ padding: '4px 10px', border: '1px solid rgba(255,255,255,.35)', transition: 'background .12s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        Salir ✕
      </button>
    </div>
  ) : null

  const ctx: DocenteCtx = { nombre, badges, simulando, salirSimulacion, handleLogout }

  // En la raíz (/docente) la página renderiza el menú de cuadrados a pantalla completa
  if (pathname === '/docente') {
    return (
      <Ctx.Provider value={ctx}>
        {banner}
        {children}
      </Ctx.Provider>
    )
  }

  // En sub-rutas se usa el shell con top bar
  const sectionTitle = SECTION_TITLES[pathname] ?? undefined

  return (
    <Ctx.Provider value={ctx}>
      <PortalShell
        title="Portal Docente"
        sectionTitle={sectionTitle}
        onBack={() => router.push('/docente')}
        backLabel="Inicio"
        onLogout={handleLogout}
        userName={nombre}
        userRoleLabel="Docente"
        banner={banner}
        showCambiarPassword={!simulando}
        accent="#0B2447"
        pageBg="#F6F8FB">
        {children}
      </PortalShell>
    </Ctx.Provider>
  )
}
