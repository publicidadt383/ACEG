'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getSesionAlumno } from '@/lib/auth'
import type { Asignacion } from '@/types'

interface GradoGroup {
  label: string
  items: Asignacion[]
}

interface ProgresoCurso {
  total: number
  entregadas: number
  promedio: number | null
}

function gradientFromColor(hex: string) {
  return `linear-gradient(135deg, ${hex}ee, ${hex}99)`
}

function CourseInitials({ nombre }: { nombre: string }) {
  const words = nombre.split(' ').filter(Boolean)
  const initials = words.slice(0, 2).map(w => w[0].toUpperCase()).join('')
  return (
    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 font-black text-xl text-white"
      style={{ background: 'rgba(255,255,255,.2)', border: '1.5px solid rgba(255,255,255,.3)', color: 'white' }}>
      {initials || nombre[0]?.toUpperCase()}
    </div>
  )
}

async function computeProgresos(
  alumnoId: string,
  asigIds: string[],
): Promise<Record<string, ProgresoCurso>> {
  const empty = Object.fromEntries(asigIds.map(id => [id, { total: 0, entregadas: 0, promedio: null }]))
  if (!asigIds.length) return empty

  const { data: unids } = await supabase
    .from('unidades').select('id,asignacion_id').in('asignacion_id', asigIds)
  if (!unids?.length) return empty

  const { data: sess } = await supabase
    .from('sesiones').select('id,unidad_id').in('unidad_id', unids.map(u => u.id))
  if (!sess?.length) return empty

  const { data: tareas } = await supabase
    .from('tareas').select('id,sesion_id').in('sesion_id', sess.map(s => s.id))
  if (!tareas?.length) return empty

  // Build reverse maps: tarea_id → asig_id
  const unidToAsig = new Map(unids.map(u => [u.id, u.asignacion_id as string]))
  const sesToUnid  = new Map(sess.map(s => [s.id, s.unidad_id as string]))
  const tareaToAsig = new Map(
    tareas.map(t => [t.id, unidToAsig.get(sesToUnid.get(t.sesion_id as string)!)]),
  )

  const { data: entregas } = await supabase
    .from('entregas')
    .select('tarea_id,calificaciones(nota)')
    .eq('alumno_id', alumnoId)
    .in('tarea_id', tareas.map(t => t.id))

  const result: Record<string, ProgresoCurso> = empty
  for (const t of tareas) {
    const asigId = tareaToAsig.get(t.id)
    if (asigId && result[asigId]) result[asigId].total++
  }

  const notasByAsig: Record<string, number[]> = {}
  for (const e of (entregas ?? []) as { tarea_id: string; calificaciones: { nota: number }[] | null }[]) {
    const asigId = tareaToAsig.get(e.tarea_id)
    if (!asigId || !result[asigId]) continue
    result[asigId].entregadas++
    const nota = e.calificaciones?.[0]?.nota
    if (nota !== undefined) {
      if (!notasByAsig[asigId]) notasByAsig[asigId] = []
      notasByAsig[asigId].push(nota)
    }
  }
  for (const [id, notas] of Object.entries(notasByAsig)) {
    if (notas.length) result[id].promedio = Math.round(notas.reduce((s, n) => s + n, 0) / notas.length * 10) / 10
  }
  return result
}

export default function AlumnoCursosPage() {
  const router = useRouter()
  const [grupos,    setGrupos]    = useState<GradoGroup[]>([])
  const [progresos, setProgresos] = useState<Record<string, ProgresoCurso>>({})
  const [loading,   setLoading]   = useState(true)
  const [cicloNombre, setCicloNombre] = useState('')

  useEffect(() => {
    async function init() {
      const sesion = await getSesionAlumno<{ id: string }>('id')
      if (!sesion) { router.push('/login'); return }
      const { user } = sesion

      const { data: matricula } = await supabase
        .from('matriculas')
        .select('grado,grupo,ciclo_id,ciclos!inner(activo,nombre)')
        .eq('alumno_id', user.id)
        .eq('ciclos.activo', true)
        .maybeSingle()
      if (!matricula) {
        setGrupos([]); setLoading(false); return
      }
      setCicloNombre((matricula.ciclos as unknown as { nombre: string })?.nombre ?? '')

      const { data } = await supabase
        .from('asignaciones')
        .select('id, grado, grupo, anio, cursos(nombre, color)')
        .eq('grado', matricula.grado)
        .eq('grupo', matricula.grupo)
        .eq('ciclo_id', matricula.ciclo_id)
        .order('grado').order('grupo')

      const asigs = (data ?? []) as unknown as Asignacion[]
      const map = new Map<string, Asignacion[]>()
      for (const a of asigs) {
        const key = `${a.grado} — Sección ${a.grupo}`
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(a)
      }
      setGrupos([...map.entries()].map(([label, items]) => ({ label, items })))
      setLoading(false)

      // Progreso por curso (no bloquea el render principal)
      const asigIds = asigs.map(a => a.id)
      computeProgresos(user.id, asigIds).then(p => setProgresos(p))
    }
    init()
  }, [router])

  if (loading) return null

  const totalCursos = grupos.reduce((s, g) => s + g.items.length, 0)

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Mis Cursos</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {totalCursos > 0
              ? `${totalCursos} ${totalCursos === 1 ? 'curso' : 'cursos'}${cicloNombre ? ` · ciclo ${cicloNombre}` : ' este año'}`
              : 'Cursos de tu grado y sección'}
          </p>
        </div>
        {totalCursos > 0 && (
          <div className="px-3 py-1.5 rounded-xl text-xs font-black"
            style={{ background: '#f0fdfa', color: '#0d9488', border: '1.5px solid #99f6e4' }}>
            {totalCursos} cursos
          </div>
        )}
      </div>

      {/* Sin cursos */}
      {grupos.length === 0 && (
        <div className="rounded-2xl flex flex-col items-center justify-center py-24 gap-4"
          style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 4px 24px rgba(13,148,136,.06)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }}>
            <svg className="w-8 h-8 text-teal-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-slate-600 text-sm font-bold">Sin cursos asignados aún</p>
            <p className="text-slate-400 text-xs mt-1">Contacta a tu profesor o administrador</p>
          </div>
        </div>
      )}

      {/* Grid de cursos */}
      {grupos.map(grupo => (
        <section key={grupo.label}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg,#0F766E,#14B8A6)' }} />
            <h2 className="text-base font-black text-slate-700">{grupo.label}</h2>
            <div className="flex-1 h-px" style={{ background: '#ccfbf1' }} />
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: '#f0fdfa', color: '#0d9488' }}>
              {grupo.items.length} {grupo.items.length === 1 ? 'curso' : 'cursos'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {grupo.items.map(asig => {
              const color   = asig.cursos?.color ?? '#0d9488'
              const nombre  = asig.cursos?.nombre ?? 'Curso'
              const prog    = progresos[asig.id]
              const pct     = prog && prog.total > 0 ? Math.round(prog.entregadas / prog.total * 100) : 0
              const notaColor = prog?.promedio == null ? '#94a3b8'
                : prog.promedio >= 14 ? '#16a34a'
                : prog.promedio >= 11 ? '#d97706'
                : '#dc2626'

              return (
                <div key={asig.id}
                  className="rounded-2xl overflow-hidden cursor-pointer group"
                  style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 2px 16px rgba(13,148,136,.07)', transition: 'transform .18s, box-shadow .18s' }}
                  onClick={() => router.push(`/alumno/cursos/${asig.id}`)}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 10px 32px ${color}30` }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(13,148,136,.07)' }}>

                  {/* Banner */}
                  <div className="relative flex items-center justify-center overflow-hidden" style={{ height: '110px', background: gradientFromColor(color) }}>
                    <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full" style={{ background: 'white', opacity: .08 }} />
                    <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full" style={{ background: 'white', opacity: .06 }} />
                    <CourseInitials nombre={nombre} />
                    <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-black"
                      style={{ background: 'rgba(255,255,255,.25)', color: 'white', backdropFilter: 'blur(4px)' }}>
                      {asig.grado} {asig.grupo}
                    </div>
                    {/* Badge promedio en banner */}
                    {prog?.promedio != null && (
                      <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-xl text-[11px] font-black"
                        style={{ background: 'rgba(255,255,255,.9)', color: notaColor, backdropFilter: 'blur(4px)' }}>
                        {prog.promedio} pts
                      </div>
                    )}
                  </div>

                  {/* Cuerpo */}
                  <div className="p-4">
                    <h3 className="text-sm font-black text-slate-800 leading-tight mb-1">{nombre}</h3>
                    <p className="text-[11px] text-slate-400 font-medium mb-3">
                      {asig.grado} · Sección {asig.grupo} · {asig.anio}
                    </p>

                    {/* Progreso tareas */}
                    {prog ? (
                      prog.total === 0 ? (
                        <p className="text-[10px] text-slate-300 font-semibold mb-2">Sin tareas aún</p>
                      ) : (
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-slate-400">
                              {prog.entregadas}/{prog.total} tareas entregadas
                            </span>
                            <span className="text-[10px] font-black" style={{ color }}>{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${color}20` }}>
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : color }} />
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="h-1.5 rounded-full mb-3" style={{ background: '#f1f5f9' }} />
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400">Ver contenido</span>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:translate-x-0.5"
                        style={{ background: `${color}18`, border: `1.5px solid ${color}30` }}>
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

    </div>
  )
}
