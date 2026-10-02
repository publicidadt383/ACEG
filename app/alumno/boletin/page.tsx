'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { getSesionAlumno } from '@/lib/auth'
import { resumenExamen, type ExamenLibreta } from '@/lib/libreta'

interface LibretaNota    { titulo: string; nota: number; comentario: string | null }
interface LibretaPeriodo { periodo: string; notas: LibretaNota[]; examenes?: ExamenLibreta[] }

interface CursoBoletin {
  asigId:    string
  nombre:    string
  color:     string
  // Notas
  totalTareas:       number
  tareasEntregadas:  number
  tareasCalificadas: number
  promedio:          number | null   // sobre 20
  // Asistencia
  clasesTotal:    number
  clasesPresente: number
}

function notaColor(n: number | null) {
  if (n === null) return '#94a3b8'
  if (n >= 14)  return '#16a34a'
  if (n >= 11)  return '#d97706'
  return '#ef4444'
}

function notaLabel(n: number | null) {
  if (n === null) return '—'
  if (n >= 18) return 'AD'
  if (n >= 14) return 'A'
  if (n >= 11) return 'B'
  return 'C'
}

function pctColor(p: number) {
  if (p >= 75) return '#16a34a'
  if (p >= 50) return '#d97706'
  return '#ef4444'
}

export default function BoletinPage() {
  const router = useRouter()
  const [cursos,   setCursos]   = useState<CursoBoletin[]>([])
  const [nombre,   setNombre]   = useState('')
  const [grado,    setGrado]    = useState('')
  const [grupo,    setGrupo]    = useState('')
  const [loading,  setLoading]  = useState(true)
  const [abierto,  setAbierto]  = useState<string | null>(null)
  const [libreta,   setLibreta]   = useState<LibretaPeriodo[]>([])
  const [detalleEx, setDetalleEx] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const sesion = await getSesionAlumno<{ nombre: string; apellidos: string; grado: string; grupo: string }>('nombre,apellidos,grado,grupo')
      if (!sesion) { router.push('/login'); return }
      const { user, alumno } = sesion

      setNombre(`${alumno.nombre} ${alumno.apellidos}`)
      setGrado(alumno.grado)
      setGrupo(alumno.grupo)

      // Libreta oficial (notas y exámenes publicados por la escuela)
      supabase.rpc('libreta_alumno').then(({ data }) => {
        setLibreta((data ?? []) as LibretaPeriodo[])
      })

      // Asignaciones del grado/grupo (solo del ciclo activo)
      const cicloId = (await getCicloActivo())?.id ?? null
      let asigsQ = supabase
        .from('asignaciones')
        .select('id,cursos(nombre,color)')
        .eq('grado', alumno.grado).eq('grupo', alumno.grupo)
      if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
      const { data: asigs } = await asigsQ
      if (!asigs?.length) { setLoading(false); return }

      type AsigRow = { id: string; cursos: { nombre: string; color: string } | null }
      const asigList = asigs as unknown as AsigRow[]
      const asigIds  = asigList.map(a => a.id)

      // Unidades → sesiones → tareas (en cascada)
      const { data: unidades } = await supabase
        .from('unidades').select('id,asignacion_id').in('asignacion_id', asigIds)

      const unidadIds = (unidades ?? []).map(u => u.id)
      const { data: sesiones } = unidadIds.length
        ? await supabase.from('sesiones').select('id,unidad_id').in('unidad_id', unidadIds)
        : { data: [] }

      const sesionIds = (sesiones ?? []).map(s => s.id)
      const { data: tareas } = sesionIds.length
        ? await supabase.from('tareas').select('id,sesion_id,max_puntos').in('sesion_id', sesionIds)
        : { data: [] }

      const tareaIds = (tareas ?? []).map(t => t.id)

      // Entregas + calificaciones del alumno
      const { data: entregas } = tareaIds.length
        ? await supabase
            .from('entregas')
            .select('id,tarea_id,calificaciones(nota)')
            .eq('alumno_id', user.id)
            .in('tarea_id', tareaIds)
        : { data: [] }

      // Asistencia del alumno
      const { data: asistencia } = await supabase
        .from('asistencia_alumnos')
        .select('asignacion_id,fecha,presente')
        .eq('alumno_id', user.id)
        .in('asignacion_id', asigIds)

      type Entrega = { id: string; tarea_id: string; calificaciones: { nota: number }[] }
      const entregasList = (entregas ?? []) as unknown as Entrega[]
      type AsistReg = { asignacion_id: string; fecha: string; presente: boolean }
      const asistList = (asistencia ?? []) as AsistReg[]
      type Tarea = { id: string; sesion_id: string; max_puntos: number }
      const tareaList = (tareas ?? []) as Tarea[]
      type Sesion = { id: string; unidad_id: string }
      const sesionList = (sesiones ?? []) as Sesion[]
      type Unidad = { id: string; asignacion_id: string }
      const unidadList = (unidades ?? []) as Unidad[]

      // Construir mapa sesion → asignacion
      const unidadAsig: Record<string, string> = {}
      unidadList.forEach(u => { unidadAsig[u.id] = u.asignacion_id })
      const sesionAsig: Record<string, string> = {}
      sesionList.forEach(s => { sesionAsig[s.id] = unidadAsig[s.unidad_id] })
      const tareaAsig: Record<string, string> = {}
      tareaList.forEach(t => { tareaAsig[t.id] = sesionAsig[t.sesion_id] })

      const resultado: CursoBoletin[] = asigList.map(a => {
        const misTareas   = tareaList.filter(t => tareaAsig[t.id] === a.id)
        const misTareaIds = new Set(misTareas.map(t => t.id))

        const misEntregas = entregasList.filter(e => misTareaIds.has(e.tarea_id))
        const calificadas = misEntregas.filter(e => e.calificaciones?.length > 0)
        const notas       = calificadas.map(e => e.calificaciones[0].nota)
        const promedio    = notas.length > 0
          ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length * 10) / 10
          : null

        const misAsist    = asistList.filter(r => r.asignacion_id === a.id)
        const fechas      = [...new Set(misAsist.map(r => r.fecha))]
        const presentes   = misAsist.filter(r => r.presente).length

        return {
          asigId:            a.id,
          nombre:            a.cursos?.nombre ?? 'Curso',
          color:             a.cursos?.color  ?? '#0d9488',
          totalTareas:       misTareas.length,
          tareasEntregadas:  misEntregas.length,
          tareasCalificadas: calificadas.length,
          promedio,
          clasesTotal:    fechas.length,
          clasesPresente: presentes,
        }
      })

      setCursos(resultado)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return null

  const cursosConData = cursos.filter(c => c.totalTareas > 0 || c.clasesTotal > 0)

  // Resumen global
  const notasGlobales = cursos.filter(c => c.promedio !== null).map(c => c.promedio!)
  const promedioGlobal = notasGlobales.length
    ? Math.round(notasGlobales.reduce((s, n) => s + n, 0) / notasGlobales.length * 10) / 10
    : null
  const totalClases   = cursos.reduce((s, c) => s + c.clasesTotal, 0)
  const totalPresente = cursos.reduce((s, c) => s + c.clasesPresente, 0)
  const pctGlobal     = totalClases > 0 ? Math.round(totalPresente / totalClases * 100) : null

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-800">Mi Boletín</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {nombre} · {grado} {grupo}
        </p>
      </div>

      {/* Resumen global */}
      <div className="grid grid-cols-2 gap-3">
        {/* Promedio general */}
        <div className="rounded-2xl p-4 flex flex-col gap-1"
          style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 2px 12px rgba(13,148,136,.05)' }}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Promedio General</p>
          <p className="text-3xl font-black" style={{ color: notaColor(promedioGlobal) }}>
            {promedioGlobal ?? '—'}
          </p>
          {promedioGlobal !== null && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full self-start"
              style={{ background: `${notaColor(promedioGlobal)}18`, color: notaColor(promedioGlobal) }}>
              {notaLabel(promedioGlobal)}
            </span>
          )}
        </div>

        {/* Asistencia global */}
        <div className="rounded-2xl p-4 flex flex-col gap-1"
          style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 2px 12px rgba(13,148,136,.05)' }}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asistencia Global</p>
          <p className="text-3xl font-black" style={{ color: pctColor(pctGlobal ?? 0) }}>
            {pctGlobal !== null ? `${pctGlobal}%` : '—'}
          </p>
          {pctGlobal !== null && (
            <p className="text-xs text-slate-400 font-medium">{totalPresente}/{totalClases} clases</p>
          )}
        </div>
      </div>

      {/* Libreta oficial (publicada por la escuela) */}
      {libreta.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">Libreta oficial</h2>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
              style={{ background: '#ccfbf1', color: '#0d9488' }}>
              Publicado por la escuela
            </span>
          </div>

          {libreta.map((per, i) => {
            // Total del periodo: SUMA de puntos (notas directas + exámenes), no promedio
            const sumaNotas = per.notas.reduce((s, n) => s + (n.nota ?? 0), 0)
            const sumaExams = (per.examenes ?? []).reduce((s, ex) => s + resumenExamen(ex.preguntas, ex.respuestas).puntos, 0)
            const totalPer  = Math.round((sumaNotas + sumaExams) * 10) / 10
            const hayDatos  = per.notas.length > 0 || (per.examenes ?? []).length > 0
            return (
            <div key={i} className="rounded-2xl overflow-hidden"
              style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 2px 12px rgba(13,148,136,.05)' }}>
              <div className="px-5 py-3 border-b border-slate-50 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-black text-slate-800">{per.periodo}</p>
                {hayDatos && (
                  <span className="text-xs font-black px-3 py-1 rounded-full"
                    style={{ background: '#ccfbf1', color: '#0d9488' }}>
                    Total: {totalPer} {totalPer === 1 ? 'punto' : 'puntos'}
                  </span>
                )}
              </div>
              <div className="p-4 space-y-3">

                {/* Notas directas (puntos por evaluación) */}
                {per.notas.length > 0 && (
                  <div className="space-y-2">
                    {per.notas.map((n, j) => (
                      <div key={j} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                        style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{n.titulo}</p>
                          {n.comentario && <p className="text-[11px] text-slate-400 italic mt-0.5">{n.comentario}</p>}
                        </div>
                        <span className="text-lg font-black shrink-0 text-slate-800">
                          {n.nota} <span className="text-[10px] font-bold text-slate-400">{n.nota === 1 ? 'punto' : 'puntos'}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Exámenes por preguntas */}
                {(per.examenes ?? []).map((ex, j) => {
                  const r = resumenExamen(ex.preguntas, ex.respuestas)
                  const aprueba = r.puntos >= r.total * 0.5
                  const key = `${i}-${j}`
                  const abiertoEx = detalleEx === key
                  return (
                    <div key={key} className="rounded-xl p-4"
                      style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-black text-slate-700">{ex.titulo}</p>
                        <span className="text-xs font-black px-3 py-1 rounded-full"
                          style={{
                            background: aprueba ? '#ccfbf1' : '#fee2e2',
                            color:      aprueba ? '#0d9488' : '#ef4444',
                          }}>
                          Nota final: {r.puntos} / {r.total}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {r.areas.map(a => (
                          <span key={a.area} className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                            style={{ background: 'white', border: '1px solid #e2e8f0', color: '#334155' }}>
                            {a.area}: {a.puntos} {a.puntos === 1 ? 'punto' : 'puntos'} de {a.total}
                          </span>
                        ))}
                      </div>
                      <button onClick={() => setDetalleEx(abiertoEx ? null : key)}
                        className="mt-3 text-[11px] font-black flex items-center gap-1"
                        style={{ color: '#0d9488' }}>
                        {abiertoEx ? 'Ocultar detalle' : 'Ver detalle'}
                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
                          style={{ transform: abiertoEx ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                      {abiertoEx && (
                        <div className="mt-3 space-y-2.5">
                          {r.areas.map(a => (
                            <div key={a.area}>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                {a.area} · {a.puntos}/{a.total}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {r.detalle.filter(d => d.area === a.area).map(d => (
                                  <span key={d.n}
                                    title={`Pregunta ${d.n}: ${d.ok ? 'correcta' : 'incorrecta'}`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black"
                                    style={{
                                      background: d.ok ? '#ecfdf5' : '#fef2f2',
                                      color:      d.ok ? '#059669' : '#ef4444',
                                      border:     d.ok ? '1px solid #a7f3d0' : '1px solid #fecaca',
                                    }}>
                                    P{d.n} {d.ok ? '✓' : '✗'}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* Por curso */}
      {cursosConData.length === 0 ? (
        <div className="rounded-2xl flex flex-col items-center justify-center py-24 gap-4"
          style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#f0fdfa' }}>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#5eead4" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-500">Sin datos por ahora</p>
            <p className="text-xs text-slate-400 mt-1">Tu boletín se irá llenando conforme avance el año</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {cursosConData.map(c => {
            const pct    = c.clasesTotal > 0 ? Math.round(c.clasesPresente / c.clasesTotal * 100) : null
            const isOpen = abierto === c.asigId

            return (
              <div key={c.asigId} className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 2px 12px rgba(13,148,136,.05)' }}>

                {/* Franja color */}
                <div className="h-1" style={{ background: `linear-gradient(90deg,${c.color},${c.color}88)` }} />

                {/* Fila principal */}
                <button className="w-full flex items-center gap-4 px-5 py-4 text-left"
                  onClick={() => setAbierto(isOpen ? null : c.asigId)}>

                  {/* Ícono */}
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs text-white shrink-0"
                    style={{ background: `linear-gradient(135deg,${c.color},${c.color}bb)` }}>
                    {c.nombre.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Nombre + barra nota */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate">{c.nombre}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100" style={{ maxWidth: 120 }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${c.promedio !== null ? (c.promedio / 20) * 100 : 0}%`, background: notaColor(c.promedio) }} />
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold">
                        {c.tareasCalificadas}/{c.totalTareas} calificadas
                      </span>
                    </div>
                  </div>

                  {/* Nota + asistencia */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Nota</p>
                      <p className="text-xl font-black leading-none" style={{ color: notaColor(c.promedio) }}>
                        {c.promedio ?? '—'}
                      </p>
                    </div>
                    <div className="w-px h-8 bg-slate-100" />
                    <div className="text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Asist.</p>
                      <p className="text-xl font-black leading-none" style={{ color: pctColor(pct ?? 0) }}>
                        {pct !== null ? `${pct}%` : '—'}
                      </p>
                    </div>
                  </div>

                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth="2.5"
                    className="shrink-0 transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>

                {/* Detalle */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #f0fdfa' }}>
                    <div className="grid grid-cols-2 divide-x divide-slate-50">

                      {/* Notas */}
                      <div className="p-4 space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Calificaciones</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Promedio</span>
                          <span className="text-sm font-black" style={{ color: notaColor(c.promedio) }}>
                            {c.promedio ?? '—'} / 20
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Nivel</span>
                          <span className="text-xs font-black px-2 py-0.5 rounded-full"
                            style={{ background: `${notaColor(c.promedio)}18`, color: notaColor(c.promedio) }}>
                            {notaLabel(c.promedio)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Tareas</span>
                          <span className="text-xs font-bold text-slate-600">
                            {c.tareasEntregadas}/{c.totalTareas} entregadas
                          </span>
                        </div>
                      </div>

                      {/* Asistencia */}
                      <div className="p-4 space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Asistencia</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Porcentaje</span>
                          <span className="text-sm font-black" style={{ color: pctColor(pct ?? 0) }}>
                            {pct !== null ? `${pct}%` : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Clases</span>
                          <span className="text-xs font-bold text-slate-600">
                            {c.clasesPresente}/{c.clasesTotal}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Ausencias</span>
                          <span className="text-xs font-bold" style={{ color: '#ef4444' }}>
                            {c.clasesTotal - c.clasesPresente}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Alerta 75% */}
                    {pct !== null && pct < 75 && c.clasesTotal >= 4 && (
                      <div className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-2"
                        style={{ background: '#fff7ed', border: '1.5px solid #fed7aa' }}>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        <p className="text-xs font-bold text-orange-700">
                          Asistencia por debajo del 75% mínimo requerido
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
