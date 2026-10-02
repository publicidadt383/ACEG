'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getSesionAlumno } from '@/lib/auth'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const PERIODOS_DEFAULT: Periodo[] = [
  { id: 'p1', nombre: '1ra hora', inicio: '07:45', fin: '08:30', tipo: 'hora' },
  { id: 'p2', nombre: '2da hora', inicio: '08:30', fin: '09:15', tipo: 'hora' },
  { id: 'p3', nombre: '3ra hora', inicio: '09:15', fin: '10:00', tipo: 'hora' },
  { id: 'r1', nombre: 'Recreo',   inicio: '10:00', fin: '10:20', tipo: 'recreo' },
  { id: 'p4', nombre: '4ta hora', inicio: '10:20', fin: '11:05', tipo: 'hora' },
  { id: 'p5', nombre: '5ta hora', inicio: '11:05', fin: '11:50', tipo: 'hora' },
  { id: 'p6', nombre: '6ta hora', inicio: '11:50', fin: '12:35', tipo: 'hora' },
]

function hi(s: string) { return s.slice(0, 5) }

const BREAK_COLORS = {
  recreo:   { bg: '#fffbeb', border: '#fde68a', text: '#d97706' },
  almuerzo: { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a' },
}

interface Periodo {
  id: string
  nombre: string
  inicio: string
  fin: string
  tipo: 'hora' | 'recreo' | 'almuerzo'
}

interface Clase {
  id: string
  dia: string
  hora_inicio: string
  hora_fin: string
  materia: string | null
  grado: string | null
  grupo: string | null
  docentes: { nombre: string } | null
}

interface Curso {
  id: string
  nombre: string
  color: string
}

export default function AlumnoHorarioPage() {
  const router  = useRouter()
  const diaHoy  = DIAS_ES[new Date().getDay()]

  const [clases,   setClases]   = useState<Clase[]>([])
  const [cursos,   setCursos]   = useState<Curso[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>(PERIODOS_DEFAULT)
  const [grado,    setGrado]    = useState('')
  const [grupo,    setGrupo]    = useState('')
  const [loading,  setLoading]  = useState(true)
  const [filtro,   setFiltro]   = useState<string>('todos')

  useEffect(() => {
    async function init() {
      const sesion = await getSesionAlumno<{ id: string }>('id')
      if (!sesion) { router.push('/login'); return }
      const { user } = sesion

      const { data: matricula } = await supabase
        .from('matriculas')
        .select('grado,grupo,ciclo_id,ciclos!inner(activo)')
        .eq('alumno_id', user.id)
        .eq('ciclos.activo', true)
        .maybeSingle()

      const gradoReal = matricula?.grado ?? ''
      const grupoReal = matricula?.grupo ?? ''
      setGrado(gradoReal)
      setGrupo(grupoReal)

      const [{ data: cs }, asigData, { data: cfg }] = await Promise.all([
        supabase.from('cursos').select('id,nombre,color').order('nombre'),
        gradoReal && grupoReal
          ? supabase.from('asignaciones').select('docente_id')
              .eq('grado', gradoReal).eq('grupo', grupoReal)
              .eq('ciclo_id', matricula!.ciclo_id)
          : Promise.resolve({ data: [] }),
        supabase.from('config').select('value').eq('key', 'periodos_horario').maybeSingle(),
      ])

      if (cfg?.value) {
        try { setPeriodos(JSON.parse(cfg.value)) } catch { /* usa default */ }
      }

      let clasesList: Clase[] = []
      if (gradoReal && grupoReal) {
        const docenteIds = [...new Set((asigData.data ?? []).map((a: { docente_id: string }) => a.docente_id))]

        const { data: hsPorGrado } = await supabase
          .from('horarios')
          .select('id,dia,hora_inicio,hora_fin,materia,grado,grupo,docentes(nombre)')
          .eq('grado', gradoReal)
          .eq('grupo', grupoReal)
          .eq('activo', true)
          .order('hora_inicio')

        let hsPorDocente: Clase[] = []
        if (docenteIds.length > 0) {
          // Captura horarios de docentes asignados donde grado o grupo estén vacíos
          const { data: hdNulos } = await supabase
            .from('horarios')
            .select('id,dia,hora_inicio,hora_fin,materia,grado,grupo,docentes(nombre)')
            .in('docente_id', docenteIds)
            .or('grado.is.null,grupo.is.null')
            .eq('activo', true)
            .order('hora_inicio')
          hsPorDocente = (hdNulos ?? []) as unknown as Clase[]
        }

        const porGrado = (hsPorGrado ?? []) as unknown as Clase[]
        const vistos = new Set(porGrado.map(h => `${h.dia}-${hi(h.hora_inicio)}`))
        clasesList = [...porGrado, ...hsPorDocente.filter(h => !vistos.has(`${h.dia}-${hi(h.hora_inicio)}`))]
      }

      setClases(clasesList)
      setCursos((cs ?? []) as Curso[])
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return null

  function colorDeCurso(materia: string | null) {
    if (!materia) return '#0d9488'
    const c = cursos.find(c => c.nombre === materia)
    return c?.color ?? '#0d9488'
  }

  const diasActivos    = DIAS.filter(d => clases.some(c => c.dia === d))
  const clasesFiltradas = filtro === 'todos' ? clases : clases.filter(c => c.materia === filtro)
  const materias       = [...new Set(clases.map(c => c.materia).filter(Boolean))] as string[]

  // Lista de slots visibles: hora_inicio de clases + períodos del config que quedan
  // dentro del span de alguna clase (para que las clases multi-período tengan sus filas)
  const horasSet = new Set(clasesFiltradas.map(c => hi(c.hora_inicio)))
  for (const clase of clasesFiltradas) {
    const cFin = hi(clase.hora_fin)
    for (const p of periodos) {
      if (p.tipo === 'hora' && p.inicio > hi(clase.hora_inicio) && p.inicio < cFin)
        horasSet.add(p.inicio)
    }
  }
  const horas: string[] = [...horasSet].sort()
  const firstTime = horas[0] ?? ''
  const lastTime  = horas[horas.length - 1] ?? ''

  // Filas de display: slots de hora + recreos/almuerzos intercalados
  const periodosVisibles: Periodo[] = []
  if (horas.length > 0) {
    const breaks = periodos.filter(p => p.tipo !== 'hora' && p.inicio >= firstTime && p.inicio <= lastTime)
    const seen = new Set<string>()
    for (let ti = 0; ti < horas.length; ti++) {
      const t     = horas[ti]
      const prev  = horas[ti - 1] ?? firstTime
      const next  = horas[ti + 1]
      // insertar breaks que caen entre el slot anterior y este
      for (const b of breaks) {
        if (b.inicio > prev && b.inicio < t && !seen.has(b.id)) {
          periodosVisibles.push(b); seen.add(b.id)
        }
      }
      const configP = periodos.find(p => p.tipo === 'hora' && p.inicio === t)
      const fin = configP?.fin ?? hi(clasesFiltradas.find(c => hi(c.hora_inicio) === t)?.hora_fin ?? t)
      periodosVisibles.push(configP ?? { id: `h-${t}`, nombre: t, inicio: t, fin, tipo: 'hora' })
      // si es el último, insertar breaks que queden entre este y el fin
      if (!next) {
        for (const b of breaks) {
          if (b.inicio > t && !seen.has(b.id)) {
            periodosVisibles.push(b); seen.add(b.id)
          }
        }
      }
    }
  }

  // rowSpan: cuántos slots de hora (en `horas`) cubre una clase
  // Solo opera sobre `horas`, nunca se corta por filas de break
  function calcSpan(clase: Clase, horaStart: string): number {
    const idx = horas.indexOf(horaStart)
    let span = 1
    for (let i = idx + 1; i < horas.length; i++) {
      if (hi(clase.hora_fin) > horas[i]) span++
      else break
    }
    // convertir span de slots a filas de display (sumando filas de break intermedias)
    const startDisplayIdx = periodosVisibles.findIndex(p => p.tipo === 'hora' && p.inicio === horaStart)
    const endHoraIdx = idx + span - 1
    const endHoraTime = horas[endHoraIdx]
    let displaySpan = 0
    for (let i = startDisplayIdx; i < periodosVisibles.length; i++) {
      displaySpan++
      if (periodosVisibles[i].tipo === 'hora') {
        if (periodosVisibles[i].inicio === endHoraTime) break
      }
    }
    return displaySpan
  }

  // ¿Esta celda está cubierta por el rowSpan de un slot anterior en la misma columna?
  function isCovered(dia: string, horaSlot: string, clasesList: Clase[]): boolean {
    const idx = horas.indexOf(horaSlot)
    for (let i = 0; i < idx; i++) {
      const prev = clasesList.find(c => c.dia === dia && hi(c.hora_inicio) === horas[i])
      if (prev && hi(prev.hora_fin) > horaSlot) return true
    }
    return false
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <style>{`
        @media print {
          aside, header { display: none !important; }
          .no-print { display: none !important; }
          main { padding: 0 !important; overflow: visible !important; }
          body, html { height: auto !important; overflow: visible !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { margin: 1.2cm; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-slate-800">Mi Horario</h1>
          <p className="text-sm text-slate-400 mt-0.5">{grado} — Sección {grupo}</p>
        </div>
        <div className="flex items-center gap-2">
          {materias.length > 0 && (
            <select value={filtro} onChange={e => setFiltro(e.target.value)}
              className="no-print px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 outline-none"
              style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
              <option value="todos">Todos los cursos</option>
              {materias.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {clases.length > 0 && (
            <button onClick={() => window.print()}
              className="no-print flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all"
              style={{ background: 'white', border: '1.5px solid #ccfbf1', color: '#64748b' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0fdfa'; e.currentTarget.style.color = '#0d9488' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#64748b' }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8" rx="1"/>
              </svg>
              Imprimir
            </button>
          )}
        </div>
      </div>

      {/* Resumen días */}
      {clases.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${diasActivos.length}, 1fr)` }}>
          {diasActivos.map(dia => {
            const count = clases.filter(c => c.dia === dia).length
            const esHoy = dia === diaHoy
            return (
              <div key={dia} className="rounded-xl px-3 py-2.5 text-center"
                style={{
                  background: esHoy ? '#0d9488' : 'white',
                  border: esHoy ? '1.5px solid #0f766e' : '1.5px solid #ccfbf1',
                  boxShadow: esHoy ? '0 4px 16px rgba(13,148,136,.25)' : 'none',
                }}>
                <p className="text-[10px] font-black uppercase tracking-wider"
                  style={{ color: esHoy ? '#99f6e4' : '#94a3b8' }}>
                  {dia.slice(0, 3)}
                </p>
                <p className="text-lg font-black mt-0.5"
                  style={{ color: esHoy ? 'white' : '#1e293b' }}>
                  {count}
                </p>
                <p className="text-[9px] font-semibold"
                  style={{ color: esHoy ? '#5eead4' : '#94a3b8' }}>
                  {count === 1 ? 'clase' : 'clases'}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Grid */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 4px 24px rgba(13,148,136,.06)' }}>
        <div className="h-1" style={{ background: 'linear-gradient(90deg,#0F766E,#14B8A6,#5EEAD4)' }} />

        {clases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }}>
              <svg className="w-7 h-7 text-teal-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <p className="text-slate-400 text-sm font-semibold">Sin horario asignado aún</p>
            <p className="text-slate-300 text-xs">Consulta a tu profesor o al administrador</p>
          </div>
        ) : periodosVisibles.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-slate-400">No hay clases de <span className="font-bold text-teal-500">{filtro}</span> esta semana</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse table-fixed" style={{ minWidth: `${diasActivos.length * 150 + 96}px` }}>
              <colgroup>
                <col style={{ width: '96px' }} />
                {diasActivos.map(d => <col key={d} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left sticky left-0 z-10"
                    style={{ background: '#f8fffe', borderBottom: '1.5px solid #ccfbf1' }}>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora</span>
                  </th>
                  {diasActivos.map(d => {
                    const esHoy = d === diaHoy
                    return (
                      <th key={d} className="px-2 py-3 text-center"
                        style={{
                          background: esHoy ? '#f0fdfa' : '#f8fffe',
                          borderLeft: '1px solid #ccfbf1',
                          borderBottom: '1.5px solid #ccfbf1',
                        }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[11px] font-black"
                            style={{ color: esHoy ? '#0d9488' : '#64748b' }}>
                            {d}
                          </span>
                          {esHoy && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                              style={{ background: '#0d9488', color: 'white' }}>
                              HOY
                            </span>
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {periodosVisibles.map((periodo, idx) => {
                  const isBreak = periodo.tipo !== 'hora'
                  const bc = isBreak ? BREAK_COLORS[periodo.tipo as 'recreo' | 'almuerzo'] : null

                  if (isBreak) {
                    return (
                      <tr key={periodo.id} style={{ borderBottom: '1px solid #f0fdfa' }}>
                        <td className="px-4 py-1.5 sticky left-0"
                          style={{ background: bc!.bg, borderRight: '1px solid #ccfbf1', verticalAlign: 'middle' }}>
                          <p className="text-[10px] font-black" style={{ color: bc!.text }}>{periodo.nombre}</p>
                          <p className="text-[9px] font-mono" style={{ color: bc!.text, opacity: 0.7 }}>
                            {periodo.inicio} – {periodo.fin}
                          </p>
                        </td>
                        <td colSpan={diasActivos.length}
                          style={{ background: bc!.bg, borderLeft: `1px solid ${bc!.border}` }}>
                          <div className="flex items-center justify-center gap-2 py-1.5 px-4">
                            <div className="h-px flex-1 opacity-40" style={{ background: bc!.text }} />
                            <span className="text-[11px] font-black" style={{ color: bc!.text }}>
                              {periodo.nombre} · {periodo.inicio} – {periodo.fin}
                            </span>
                            <div className="h-px flex-1 opacity-40" style={{ background: bc!.text }} />
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={periodo.id}
                      style={{ borderBottom: idx < periodosVisibles.length - 1 ? '1px solid #f0fdfa' : 'none' }}>
                      <td className="px-4 py-2 sticky left-0"
                        style={{ background: '#f8fffe', verticalAlign: 'middle', borderRight: '1px solid #ccfbf1' }}>
                        <p className="text-[11px] font-black text-teal-600 font-mono tabular-nums">{periodo.inicio}</p>
                        <p className="text-[9px] text-slate-400 font-mono tabular-nums mt-0.5">{periodo.fin}</p>
                      </td>
                      {diasActivos.map(dia => {
                        if (isCovered(dia, periodo.inicio, clasesFiltradas)) return null
                        const clase = clasesFiltradas.find(c => c.dia === dia && hi(c.hora_inicio) === periodo.inicio)
                        const esHoy = dia === diaHoy
                        const color = clase ? colorDeCurso(clase.materia) : '#0d9488'
                        const span  = clase ? calcSpan(clase, periodo.inicio) : 1
                        return (
                          <td key={dia} rowSpan={span} className="px-2 py-1.5"
                            style={{
                              borderLeft: '1px solid #ccfbf1',
                              verticalAlign: 'middle',
                              background: esHoy ? '#f8fffe' : 'transparent',
                            }}>
                            {clase ? (
                              <div className="rounded-xl px-2 py-2.5 h-full flex flex-col items-center justify-center gap-0.5 text-center"
                                style={{
                                  background: `linear-gradient(135deg,${color}15,${color}25)`,
                                  border: `1.5px solid ${color}40`,
                                  minHeight: `${span * 58}px`,
                                }}>
                                <p className="text-[11px] font-black leading-snug w-full" style={{ color }}>
                                  {clase.materia ?? '—'}
                                </p>
                                {clase.docentes?.nombre && (
                                  <p className="text-[10px] font-semibold text-slate-500 leading-snug w-full">
                                    {clase.docentes.nombre}
                                  </p>
                                )}
                                <p className="text-[9px] text-slate-400 font-mono">
                                  {clase.hora_inicio.slice(0,5)} – {clase.hora_fin.slice(0,5)}
                                </p>
                              </div>
                            ) : (
                              <div className="rounded-xl flex items-center justify-center"
                                style={{
                                  minHeight: '58px',
                                  background: esHoy ? '#f0fdfa' : '#f8fafc',
                                  border: '1px dashed #e2e8f0',
                                }}>
                                <span className="text-[10px] font-semibold text-slate-300">—</span>
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leyenda */}
      {clases.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {materias.map(m => {
            const color = colorDeCurso(m)
            return (
              <div key={m} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: color + '15', border: `1px solid ${color}30` }}>
                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-[11px] font-bold" style={{ color }}>{m}</span>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
