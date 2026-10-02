'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { getSesionAlumno } from '@/lib/auth'
import { formatFechaDMY as formatFecha } from '@/utils/formatters'

interface TareaCalendario {
  id: string
  titulo: string
  fecha_limite: string
  cursoNombre: string
  cursoColor: string
  entregada: boolean
}

const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}


function labelDia(iso: string, todayIso: string) {
  const date = new Date(iso + 'T12:00:00')
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }
  const label = date.toLocaleDateString('es-PE', opts)
  if (iso === todayIso) return `Hoy, ${label}`
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export default function AlumnoCalendarioPage() {
  const router  = useRouter()
  const today   = isoToday()

  const [tareas,  setTareas]  = useState<TareaCalendario[]>([])
  const [loading, setLoading] = useState(true)
  const [mes,     setMes]     = useState(() => {
    const n = new Date()
    return { year: n.getFullYear(), month: n.getMonth() }
  })
  const [selDate, setSelDate] = useState<string>(today)

  useEffect(() => {
    async function init() {
      const sesion = await getSesionAlumno<{ grado: string; grupo: string }>('grado,grupo')
      if (!sesion) { router.push('/login'); return }
      const { user, alumno } = sesion

      const cicloId = (await getCicloActivo())?.id ?? null
      let asigsQ = supabase
        .from('asignaciones')
        .select('id, cursos(nombre, color)')
        .eq('grado', alumno.grado).eq('grupo', alumno.grupo)
      if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
      const { data: asigs } = await asigsQ
      if (!asigs?.length) { setLoading(false); return }

      type AsigRow = { id: string; cursos: { nombre: string; color: string } | null }
      const asigMap = new Map((asigs as unknown as AsigRow[]).map(a => [a.id, a.cursos]))

      const { data: unids } = await supabase
        .from('unidades').select('id,asignacion_id').in('asignacion_id', asigs.map(a => a.id))
      if (!unids?.length) { setLoading(false); return }
      const unidToAsig = new Map(unids.map(u => [u.id, u.asignacion_id as string]))

      const { data: sess } = await supabase
        .from('sesiones').select('id,unidad_id').in('unidad_id', unids.map(u => u.id))
      if (!sess?.length) { setLoading(false); return }
      const sesToUnid = new Map(sess.map(s => [s.id, s.unidad_id as string]))

      const { data: tareasData } = await supabase
        .from('tareas')
        .select('id,titulo,fecha_limite,sesion_id')
        .in('sesion_id', sess.map(s => s.id))
        .not('fecha_limite', 'is', null)
        .order('fecha_limite')
      if (!tareasData?.length) { setLoading(false); return }

      const { data: entregas } = await supabase
        .from('entregas').select('tarea_id')
        .eq('alumno_id', user.id)
        .in('tarea_id', tareasData.map(t => t.id))
      const entregaSet = new Set((entregas ?? []).map(e => e.tarea_id as string))

      setTareas(tareasData.map(t => {
        const asigId = unidToAsig.get(sesToUnid.get(t.sesion_id as string)!) ?? ''
        const curso  = asigMap.get(asigId)
        return {
          id: t.id,
          titulo: t.titulo as string,
          fecha_limite: (t.fecha_limite as string).slice(0, 10),
          cursoNombre: curso?.nombre ?? 'Curso',
          cursoColor:  curso?.color  ?? '#0d9488',
          entregada: entregaSet.has(t.id),
        }
      }))
      setLoading(false)
    }
    init()
  }, [router])

  const byDate = useMemo(() => {
    const m = new Map<string, TareaCalendario[]>()
    for (const t of tareas) {
      if (!m.has(t.fecha_limite)) m.set(t.fecha_limite, [])
      m.get(t.fecha_limite)!.push(t)
    }
    return m
  }, [tareas])

  const { year, month } = mes
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay    = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1 })()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const mesStr          = `${year}-${String(month + 1).padStart(2, '0')}`
  const tareasEsteMes   = tareas.filter(t => t.fecha_limite.startsWith(mesStr))
  const pendientesEsteMes = tareasEsteMes.filter(t => !t.entregada && t.fecha_limite >= today)
  const vencidasEsteMes   = tareasEsteMes.filter(t => !t.entregada && t.fecha_limite < today)
  const selTareas       = byDate.get(selDate) ?? []

  if (loading) return null

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Calendario</h1>
          <p className="text-sm text-slate-400 mt-0.5">Fechas límite de tus tareas</p>
        </div>
        <button
          onClick={() => { setMes({ year: new Date().getFullYear(), month: new Date().getMonth() }); setSelDate(today) }}
          className="px-3 py-1.5 rounded-xl text-xs font-black transition-all"
          style={{ background: '#f0fdfa', color: '#0d9488', border: '1.5px solid #99f6e4' }}>
          Hoy
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

        {/* ── Calendario ─────────────────────────── */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 4px 24px rgba(13,148,136,.06)' }}>

          {/* Mes nav */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f0fdfa' }}>
            <button onClick={() => setMes(p => { const d = new Date(p.year, p.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 transition-all hover:bg-teal-50">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <h2 className="text-base font-black text-slate-700">{MESES[month]} {year}</h2>
            <button onClick={() => setMes(p => { const d = new Date(p.year, p.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 transition-all hover:bg-teal-50">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>

          {/* Cabecera días */}
          <div className="grid grid-cols-7 px-4 pt-3 pb-1">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="text-center text-[11px] font-black text-slate-400 py-1">{d}</div>
            ))}
          </div>

          {/* Grid días */}
          <div className="grid grid-cols-7 gap-px px-4 pb-4">
            {cells.map((day, idx) => {
              if (!day) return <div key={idx} className="h-14" />
              const iso    = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const tasks  = byDate.get(iso) ?? []
              const isToday = iso === today
              const isSel   = iso === selDate
              const isPast  = iso < today

              return (
                <button key={idx}
                  onClick={() => setSelDate(iso)}
                  className="relative flex flex-col items-center justify-start pt-1.5 pb-1 h-14 rounded-xl transition-all"
                  style={
                    isSel  ? { background: '#0d9488', color: 'white' }
                    : isToday ? { background: '#f0fdfa', color: '#0d9488', border: '1.5px solid #5eead4' }
                    : { color: isPast ? '#cbd5e1' : '#475569' }
                  }
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#f0fdfa' }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isToday ? '#f0fdfa' : 'transparent' }}>
                  <span className="text-[13px] font-black leading-none">{day}</span>
                  {tasks.length > 0 && (
                    <div className="flex gap-0.5 mt-1 flex-wrap justify-center" style={{ maxWidth: 36 }}>
                      {tasks.slice(0, 4).map(t => (
                        <div key={t.id} className="w-1.5 h-1.5 rounded-full"
                          style={{ background: isSel ? 'rgba(255,255,255,.8)' : t.entregada ? '#22c55e' : t.fecha_limite < today ? '#ef4444' : t.cursoColor }} />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Stats strip */}
          <div className="flex items-center gap-5 px-5 py-3" style={{ borderTop: '1px solid #f0fdfa', background: '#f8fffe' }}>
            <div className="text-[11px] text-slate-400">
              <span className="font-black text-slate-600">{tareasEsteMes.length}</span> tareas este mes
            </div>
            {pendientesEsteMes.length > 0 && (
              <div className="text-[11px]" style={{ color: '#f97316' }}>
                <span className="font-black">{pendientesEsteMes.length}</span> pendientes
              </div>
            )}
            {vencidasEsteMes.length > 0 && (
              <div className="text-[11px]" style={{ color: '#ef4444' }}>
                <span className="font-black">{vencidasEsteMes.length}</span> vencidas
              </div>
            )}
            {tareasEsteMes.length > 0 && pendientesEsteMes.length === 0 && vencidasEsteMes.length === 0 && (
              <div className="text-[11px] font-black" style={{ color: '#16a34a' }}>¡Todo entregado!</div>
            )}
          </div>
        </div>

        {/* ── Lista del día seleccionado ─────────── */}
        <div className="rounded-2xl overflow-hidden flex flex-col"
          style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 4px 24px rgba(13,148,136,.06)', minHeight: 200 }}>

          <div className="px-5 py-4" style={{ borderBottom: '1px solid #f0fdfa' }}>
            <p className="text-sm font-black text-slate-700 capitalize">{labelDia(selDate, today)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {selTareas.length === 0 ? 'Sin tareas' : `${selTareas.length} ${selTareas.length === 1 ? 'tarea' : 'tareas'}`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {selTareas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#f0fdfa' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#5eead4" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                  </svg>
                </div>
                <p className="text-xs text-slate-400 text-center">Sin tareas para este día</p>
              </div>
            ) : (
              selTareas.map(t => {
                const overdue = !t.entregada && t.fecha_limite < today
                const bgColor = t.entregada ? '#f0fdf4' : overdue ? '#fff1f2' : 'white'
                const brColor = t.entregada ? '#bbf7d0' : overdue ? '#fecdd3' : '#e2e8f0'
                const dotColor = t.entregada ? '#22c55e' : overdue ? '#ef4444' : t.cursoColor

                return (
                  <div key={t.id} className="rounded-xl p-3"
                    style={{ background: bgColor, border: `1.5px solid ${brColor}` }}>
                    <div className="flex items-start gap-2.5">
                      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: dotColor }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-700 leading-snug">{t.titulo}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: `${t.cursoColor}18`, color: t.cursoColor }}>
                            {t.cursoNombre}
                          </span>
                          {t.entregada && <span className="text-[10px] font-black" style={{ color: '#16a34a' }}>✓ Entregada</span>}
                          {!t.entregada && overdue && <span className="text-[10px] font-black" style={{ color: '#ef4444' }}>Vencida</span>}
                          {!t.entregada && !overdue && <span className="text-[10px] font-bold text-slate-400">Pendiente</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>

      {/* Próximas tareas (lista global) */}
      {(() => {
        const proximas = tareas
          .filter(t => !t.entregada && t.fecha_limite >= today)
          .slice(0, 8)
        if (!proximas.length) return null
        return (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 4px 24px rgba(13,148,136,.06)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid #f0fdfa' }}>
              <p className="text-sm font-black text-slate-700">Próximas entregas</p>
            </div>
            <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
              {proximas.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: t.cursoColor }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{t.titulo}</p>
                    <p className="text-[10px] text-slate-400">{t.cursoNombre}</p>
                  </div>
                  <span className="text-[11px] font-black shrink-0"
                    style={{ color: t.fecha_limite === today ? '#f97316' : '#64748b' }}>
                    {t.fecha_limite === today ? 'Hoy' : formatFecha(t.fecha_limite)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

    </div>
  )
}
