'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getSesion } from '@/lib/auth'
import Spinner from '@/components/Spinner'
import { formatFechaMedia as formatFecha } from '@/utils/formatters'

type Tab = 'pendientes' | 'vencidas' | 'entregadas'

interface TareaItem {
  id: string
  titulo: string
  descripcion: string | null
  fecha_limite: string | null
  max_puntos: number
  curso_nombre: string
  curso_color: string
  asig_id: string
  unidad_nombre: string
  sesion_titulo: string
  entregada: boolean
  nota: number | null
}



export default function AlumnoTareasPage() {
  const router = useRouter()
  const [tareas,  setTareas]  = useState<TareaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<Tab>('pendientes')

  useEffect(() => {
    async function init() {
      const user = await getSesion()
      if (!user) { router.push('/login'); return }

      const { data: matricula } = await supabase
        .from('matriculas')
        .select('grado,grupo,ciclo_id,ciclos!inner(activo)')
        .eq('alumno_id', user.id)
        .eq('ciclos.activo', true)
        .maybeSingle()
      if (!matricula) { setLoading(false); return }

      const { data: asigs } = await supabase
        .from('asignaciones')
        .select('id,cursos(nombre,color)')
        .eq('grado', matricula.grado)
        .eq('grupo', matricula.grupo)
        .eq('ciclo_id', matricula.ciclo_id)
      if (!asigs?.length) { setLoading(false); return }

      type AsigRaw = { id: string; cursos: { nombre: string; color: string } | null }
      const asigMeta = new Map<string, { nombre: string; color: string }>(
        (asigs as unknown as AsigRaw[])
          .filter(a => a.cursos)
          .map(a => [a.id, { nombre: a.cursos!.nombre, color: a.cursos!.color }])
      )

      const { data: unids } = await supabase
        .from('unidades').select('id,asignacion_id,nombre')
        .in('asignacion_id', asigs.map(a => a.id))
      if (!unids?.length) { setLoading(false); return }

      type UnidRaw = { id: string; asignacion_id: string; nombre: string }
      const unidToAsig  = new Map<string, string>((unids as UnidRaw[]).map(u => [u.id, u.asignacion_id]))
      const unidNombre  = new Map<string, string>((unids as UnidRaw[]).map(u => [u.id, u.nombre]))

      const { data: sess } = await supabase
        .from('sesiones').select('id,unidad_id,titulo')
        .in('unidad_id', unids.map(u => u.id))
      if (!sess?.length) { setLoading(false); return }

      type SesRaw = { id: string; unidad_id: string; titulo: string }
      const sesToUnid   = new Map<string, string>((sess as SesRaw[]).map(s => [s.id, s.unidad_id]))
      const sesToTitulo = new Map<string, string>((sess as SesRaw[]).map(s => [s.id, s.titulo]))

      const { data: tareasData } = await supabase
        .from('tareas')
        .select('id,titulo,descripcion,fecha_limite,max_puntos,sesion_id')
        .in('sesion_id', sess.map(s => s.id))
        .order('fecha_limite', { ascending: true, nullsFirst: false })
      if (!tareasData?.length) { setLoading(false); return }

      const tareaIds = (tareasData as { id: string }[]).map(t => t.id)
      const { data: entregasData } = await supabase
        .from('entregas')
        .select('tarea_id,calificaciones(nota)')
        .eq('alumno_id', user.id)
        .in('tarea_id', tareaIds)

      type EntregaRaw = { tarea_id: string; calificaciones: { nota: number }[] | null }
      const entregaMap = new Map<string, number | null>(
        (entregasData as unknown as EntregaRaw[] ?? []).map(e => [
          e.tarea_id,
          e.calificaciones?.[0]?.nota ?? null,
        ])
      )

      const lista: TareaItem[] = (tareasData as {
        id: string; titulo: string; descripcion: string | null
        fecha_limite: string | null; max_puntos: number; sesion_id: string
      }[]).map(t => {
        const unidId  = sesToUnid.get(t.sesion_id) ?? ''
        const asigId  = unidToAsig.get(unidId) ?? ''
        const meta    = asigMeta.get(asigId) ?? { nombre: 'Curso', color: '#0d9488' }
        const entregada = entregaMap.has(t.id)
        return {
          id:            t.id,
          titulo:        t.titulo,
          descripcion:   t.descripcion,
          fecha_limite:  t.fecha_limite,
          max_puntos:    t.max_puntos,
          curso_nombre:  meta.nombre,
          curso_color:   meta.color,
          asig_id:       asigId,
          unidad_nombre: unidNombre.get(unidId) ?? '',
          sesion_titulo: sesToTitulo.get(t.sesion_id) ?? '',
          entregada,
          nota:          entregada ? entregaMap.get(t.id) ?? null : null,
        }
      })

      setTareas(lista)
      setLoading(false)
    }
    init()
  }, [router])

  const ahora = new Date()

  const pendientes  = tareas.filter(t => !t.entregada && (!t.fecha_limite || new Date(t.fecha_limite) >= ahora))
  const vencidas    = tareas.filter(t => !t.entregada && t.fecha_limite && new Date(t.fecha_limite) < ahora)
  const entregadas  = tareas.filter(t => t.entregada)

  const grupos: Record<Tab, TareaItem[]> = { pendientes, vencidas, entregadas }
  const lista = grupos[tab]

  const TABS: { key: Tab; label: string; color: string; bg: string; border: string }[] = [
    { key: 'pendientes', label: 'Pendientes', color: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
    { key: 'vencidas',   label: 'Vencidas',   color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
    { key: 'entregadas', label: 'Entregadas', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner cls="w-6 h-6 text-teal-400" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-800">Mis Tareas</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {tareas.length === 0 ? 'No hay tareas asignadas aún' : `${tareas.length} tarea${tareas.length !== 1 ? 's' : ''} en total`}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map(t => {
          const count   = grupos[t.key].length
          const activo  = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black transition-all"
              style={activo
                ? { background: t.color, color: 'white', boxShadow: `0 4px 16px ${t.color}40` }
                : { background: 'white', color: '#64748b', border: '1.5px solid #e2e8f0' }}>
              {t.label}
              <span className="text-[11px] font-black px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                style={activo
                  ? { background: 'rgba(255,255,255,.25)', color: 'white' }
                  : { background: t.bg, color: t.color, border: `1px solid ${t.border}` }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div className="rounded-2xl flex flex-col items-center justify-center py-20 gap-4"
          style={{ background: 'white', border: '1.5px solid #e2e8f0' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: '#f8fafc', border: '2px dashed #e2e8f0' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-400">
              {tab === 'pendientes' ? 'Sin tareas pendientes' : tab === 'vencidas' ? 'Sin tareas vencidas' : 'Aún no has entregado ninguna tarea'}
            </p>
            <p className="text-xs text-slate-300 mt-1">
              {tab === 'entregadas' ? 'Tus entregas aparecerán aquí' : '¡Vas bien al día!'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {lista.map(t => {
            const vencida   = t.fecha_limite && new Date(t.fecha_limite) < ahora
            const hoyFin    = new Date(); hoyFin.setHours(23, 59, 59)
            const proxima   = t.fecha_limite && new Date(t.fecha_limite) <= hoyFin && !vencida
            const notaColor = t.nota == null ? '#94a3b8' : t.nota >= 14 ? '#16a34a' : t.nota >= 11 ? '#d97706' : '#dc2626'

            return (
              <button key={t.id}
                onClick={() => router.push(`/alumno/tareas/${t.id}`)}
                className="w-full flex items-stretch rounded-2xl overflow-hidden text-left transition-all hover:scale-[1.005] active:scale-[.998]"
                style={{ background: 'white', border: '1.5px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>

                {/* Acento lateral */}
                <div className="w-1 shrink-0" style={{ background: t.curso_color }} />

                <div className="flex-1 min-w-0 px-4 py-3.5 flex items-center gap-4">

                  {/* Icono curso */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: t.curso_color + '18', border: `1.5px solid ${t.curso_color}30` }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={t.curso_color} strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                    </svg>
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full truncate max-w-[160px]"
                        style={{ background: t.curso_color + '15', color: t.curso_color }}>
                        {t.curso_nombre}
                      </span>
                      {t.entregada && t.nota != null && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: notaColor + '15', color: notaColor }}>
                          {t.nota}/{t.max_puntos} pts
                        </span>
                      )}
                      {t.entregada && t.nota == null && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: '#EFF3FA', color: '#143875' }}>
                          Entregada
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-black text-slate-800 truncate">{t.titulo}</p>
                    {(t.unidad_nombre || t.sesion_titulo) && (
                      <p className="text-[10px] font-semibold truncate mt-0.5" style={{ color: '#94a3b8' }}>
                        {t.unidad_nombre}{t.unidad_nombre && t.sesion_titulo ? ' · ' : ''}{t.sesion_titulo}
                      </p>
                    )}
                    {t.descripcion && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{t.descripcion}</p>
                    )}
                  </div>

                  {/* Fecha + puntos */}
                  <div className="shrink-0 text-right space-y-0.5">
                    {t.fecha_limite ? (
                      <p className="text-[11px] font-bold"
                        style={{ color: vencida ? '#ef4444' : proxima ? '#f97316' : '#94a3b8' }}>
                        {vencida ? 'Venció ' : proxima ? 'Hoy · ' : ''}{formatFecha(t.fecha_limite)}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-300 font-semibold">Sin fecha</p>
                    )}
                    <p className="text-[10px] text-slate-400">{t.max_puntos} pts</p>
                  </div>

                  {/* Flecha */}
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth="2.5" className="shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </button>
            )
          })}
        </div>
      )}

    </div>
  )
}
