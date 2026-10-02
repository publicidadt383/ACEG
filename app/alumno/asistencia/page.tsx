'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { getSesionAlumno } from '@/lib/auth'
import { formatFechaDMY as formatFecha } from '@/utils/formatters'

interface CursoAsistencia {
  asigId:    string
  nombre:    string
  color:     string
  grado:     string
  grupo:     string
  total:     number
  presentes: number
  ausencias: string[]   // fechas ISO
}


export default function AlumnoAsistenciaPage() {
  const router = useRouter()

  const [cursos,  setCursos]  = useState<CursoAsistencia[]>([])
  const [loading, setLoading] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const sesion = await getSesionAlumno<{ grado: string; grupo: string }>('grado,grupo')
      if (!sesion) { router.push('/login'); return }
      const { user, alumno } = sesion

      const cicloId = (await getCicloActivo())?.id ?? null
      let asigsQ = supabase
        .from('asignaciones')
        .select('id,grado,grupo,cursos(nombre,color)')
        .eq('grado', alumno.grado).eq('grupo', alumno.grupo)
      if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
      const { data: asigs } = await asigsQ
      if (!asigs?.length) { setLoading(false); return }

      type AsigRow = { id: string; grado: string; grupo: string; cursos: { nombre: string; color: string } | null }
      const asigList = asigs as unknown as AsigRow[]

      const { data: registros } = await supabase
        .from('asistencia_alumnos')
        .select('asignacion_id,fecha,presente')
        .eq('alumno_id', user.id)
        .in('asignacion_id', asigList.map(a => a.id))
        .order('fecha', { ascending: false })

      type Reg = { asignacion_id: string; fecha: string; presente: boolean }
      const regs = (registros ?? []) as Reg[]

      const resultado: CursoAsistencia[] = asigList.map(a => {
        const mis = regs.filter(r => r.asignacion_id === a.id)
        const fechasUnicas = [...new Set(mis.map(r => r.fecha))]
        const presentes = mis.filter(r => r.presente).length
        const ausencias = mis.filter(r => !r.presente).map(r => r.fecha).sort().reverse()
        return {
          asigId:    a.id,
          nombre:    a.cursos?.nombre ?? 'Curso',
          color:     a.cursos?.color  ?? '#0d9488',
          grado:     a.grado,
          grupo:     a.grupo,
          total:     fechasUnicas.length,
          presentes,
          ausencias,
        }
      })

      setCursos(resultado)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return null

  const cursosConData = cursos.filter(c => c.total > 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-800">Mi Asistencia</h1>
        <p className="text-sm text-slate-400 mt-0.5">Registro por curso</p>
      </div>

      {cursosConData.length === 0 ? (
        <div className="rounded-2xl flex flex-col items-center justify-center py-24 gap-4"
          style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#f0fdfa' }}>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#5eead4" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-500">Sin registros de asistencia aún</p>
            <p className="text-xs text-slate-400 mt-1">Tu docente aún no ha registrado asistencia</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {cursosConData.map(c => {
            const pct       = c.total > 0 ? Math.round(c.presentes / c.total * 100) : 0
            const pctColor  = pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#ef4444'
            const isOpen    = abierto === c.asigId

            return (
              <div key={c.asigId} className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 2px 12px rgba(13,148,136,.05)' }}>

                {/* Franja color */}
                <div className="h-1" style={{ background: `linear-gradient(90deg,${c.color},${c.color}88)` }} />

                {/* Fila principal */}
                <button className="w-full flex items-center gap-4 px-5 py-4 text-left"
                  onClick={() => setAbierto(isOpen ? null : c.asigId)}>

                  {/* Ícono */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs text-white shrink-0"
                    style={{ background: `linear-gradient(135deg,${c.color},${c.color}cc)` }}>
                    {c.nombre.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate">{c.nombre}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 rounded-full" style={{ background: `${c.color}20`, maxWidth: 140 }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: pctColor }} />
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold">
                        {c.presentes}/{c.total} clases
                      </span>
                    </div>
                  </div>

                  {/* % */}
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-black" style={{ color: pctColor }}>{pct}%</p>
                    {c.ausencias.length > 0 && (
                      <p className="text-[10px] font-bold" style={{ color: '#ef4444' }}>
                        {c.ausencias.length} {c.ausencias.length === 1 ? 'ausencia' : 'ausencias'}
                      </p>
                    )}
                  </div>

                  {/* Chevron */}
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth="2.5"
                    className="shrink-0 transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>

                {/* Detalle ausencias */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #f0fdfa' }}>
                    {c.ausencias.length === 0 ? (
                      <div className="px-5 py-4 flex items-center gap-2">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <p className="text-xs font-bold" style={{ color: '#16a34a' }}>¡Sin ausencias registradas!</p>
                      </div>
                    ) : (
                      <>
                        <div className="px-5 py-3" style={{ background: '#fff8f8', borderBottom: '1px solid #fecdd3' }}>
                          <p className="text-[11px] font-black text-slate-500">Fechas de ausencia</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-4">
                          {c.ausencias.map(f => (
                            <div key={f} className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
                              style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
                              <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                              <span className="text-[11px] font-bold text-red-600">{formatFecha(f)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Alerta mínimo 75% */}
                    {pct < 75 && c.total >= 4 && (
                      <div className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-2"
                        style={{ background: '#fff7ed', border: '1.5px solid #fed7aa' }}>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        <p className="text-xs font-bold" style={{ color: '#c2410c' }}>
                          Tu asistencia está por debajo del 75% mínimo requerido
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
