'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { getSesionDocente } from '@/lib/auth'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface Clase {
  id: string
  dia: string
  hora_inicio: string
  hora_fin: string
  materia: string
  grado: string
  grupo: string
}

interface Asignacion {
  curso_id: string
  cursos: { nombre: string; color: string } | null
}

interface BusquedaRow {
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

const ORDEN_DIAS: Record<string, number> = {
  Lunes: 1, Martes: 2, Miércoles: 3, Miercoles: 3,
  Jueves: 4, Viernes: 5, Sábado: 6, Sabado: 6,
}

export default function DocenteHorarioPage() {
  const router = useRouter()
  const [clases,   setClases]   = useState<Clase[]>([])
  const [asigs,    setAsigs]    = useState<Asignacion[]>([])
  const [horas,    setHoras]    = useState<string[]>([])
  const [loading,  setLoading]  = useState(true)
  const [modo,     setModo]     = useState<'propio' | 'curso'>('propio')

  // Estado para búsqueda por curso
  const [cursos,       setCursos]       = useState<Curso[]>([])
  const [cursoBuscado, setCursoBuscado] = useState('')
  const [buscando,     setBuscando]     = useState(false)
  const [resultados,   setResultados]   = useState<BusquedaRow[]>([])
  const [buscadoYa,    setBuscadoYa]    = useState(false)

  const diaHoy = DIAS_ES[new Date().getDay()]

  useEffect(() => {
    async function init() {
      const sesion = await getSesionDocente()
      if (!sesion) { router.push('/login'); return }
      const uid = sesion.uid

      const cicloId = (await getCicloActivo())?.id ?? null
      let asigsQ = supabase.from('asignaciones')
        .select('curso_id,cursos(nombre,color)')
        .eq('docente_id', uid)
      if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
      const [{ data: hs }, { data: as_ }, { data: cs }] = await Promise.all([
        supabase.from('horarios')
          .select('id,dia,hora_inicio,hora_fin,materia,grado,grupo')
          .eq('docente_id', uid)
          .eq('activo', true)
          .order('hora_inicio'),
        asigsQ,
        supabase.from('cursos').select('id,nombre,color').order('nombre'),
      ])

      const lista = (hs ?? []) as Clase[]
      setClases(lista)
      setAsigs((as_ ?? []) as unknown as Asignacion[])
      setHoras([...new Set(lista.map(h => h.hora_inicio))].sort())
      setCursos((cs ?? []) as Curso[])
      setLoading(false)
    }
    init()
  }, [router])

  async function buscarPorCurso() {
    if (!cursoBuscado) return
    setBuscando(true)
    setBuscadoYa(false)
    const { data } = await supabase
      .from('horarios')
      .select('id,dia,hora_inicio,hora_fin,materia,grado,grupo,docentes(nombre)')
      .eq('materia', cursoBuscado)
      .eq('activo', true)
      .order('dia').order('hora_inicio')
    setResultados((data ?? []) as unknown as BusquedaRow[])
    setBuscando(false)
    setBuscadoYa(true)
  }

  const cursoSelObj   = cursos.find(c => c.nombre === cursoBuscado)
  const colorBusqueda = cursoSelObj?.color ?? '#143875'
  const diasConClases = DIAS.filter(d =>
    resultados.some(h => (ORDEN_DIAS[h.dia] ?? 0) === ORDEN_DIAS[d])
  )
  const extraDias = [...new Set(resultados.map(h => h.dia))].filter(d => !DIAS.includes(d))
  const todosDias = [...diasConClases, ...extraDias]

  if (loading) return null

  function colorDeCurso(materia: string) {
    const asig = asigs.find(a => a.cursos?.nombre === materia)
    return asig?.cursos?.color ?? '#143875'
  }

  // Total clases por día
  function clasesDia(dia: string) {
    return clases.filter(c => c.dia === dia)
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

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-slate-800">Horario</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {modo === 'propio' ? 'Vista semanal de tus clases asignadas' : 'Busca un curso y ve quién lo dicta y cuándo'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Imprimir */}
          {modo === 'propio' && clases.length > 0 && (
            <button onClick={() => window.print()}
              className="no-print flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all"
              style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF', color: '#64748b' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#EFF3FA'; e.currentTarget.style.color = '#0B2447' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#F6F8FB'; e.currentTarget.style.color = '#64748b' }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8" rx="1"/>
              </svg>
              Imprimir
            </button>
          )}
          {/* Tabs */}
          <div className="no-print flex rounded-xl overflow-hidden" style={{ border: '1.5px solid #E4E8EF' }}>
            {(['propio', 'curso'] as const).map(m => (
              <button key={m} onClick={() => setModo(m)}
                className="px-4 py-2 text-xs font-black transition-all"
                style={modo === m
                  ? { background: '#0B2447', color: 'white' }
                  : { background: 'white', color: '#64748b' }}>
                {m === 'propio' ? 'Mi horario' : 'Por curso'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Resumen días ────────────────────────────────────────────── */}
      {modo === 'propio' && clases.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {DIAS.map(dia => {
            const count = clasesDia(dia).length
            const esHoy = dia === diaHoy
            return (
              <div key={dia} className="rounded-xl px-3 py-2.5 text-center transition-all"
                style={{
                  background: esHoy ? '#0B2447' : count > 0 ? 'white' : '#f8fafc',
                  border: esHoy ? '1.5px solid #081832' : '1.5px solid #E4E8EF',
                  boxShadow: esHoy ? '0 4px 16px rgba(79,70,229,.25)' : 'none',
                }}>
                <p className="text-[10px] font-black uppercase tracking-wider"
                  style={{ color: esHoy ? '#b6c5e3' : '#94a3b8' }}>
                  {dia.slice(0, 3)}
                </p>
                <p className="text-lg font-black mt-0.5"
                  style={{ color: esHoy ? 'white' : count > 0 ? '#1e293b' : '#cbd5e1' }}>
                  {count}
                </p>
                <p className="text-[9px] font-semibold"
                  style={{ color: esHoy ? '#a5b4fc' : '#94a3b8' }}>
                  {count === 1 ? 'clase' : 'clases'}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Grilla ──────────────────────────────────────────────────── */}
      {modo === 'propio' && <div className="rounded-2xl overflow-hidden"
        style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 24px rgba(11,36,71,.06)' }}>
        <div className="h-1" style={{ background: 'linear-gradient(90deg,#143875,#143875,#06b6d4)' }} />

        {clases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: '#EFF3FA', border: '1.5px solid #b6c5e3' }}>
              <svg className="w-7 h-7 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <p className="text-slate-400 text-sm font-semibold">Sin clases asignadas aún</p>
            <p className="text-slate-300 text-xs">Contacta al administrador para asignar tu horario</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: '580px' }}>

              {/* Cabecera días */}
              <thead>
                <tr>
                  {/* columna hora */}
                  <th className="w-20 px-4 py-3 text-left sticky left-0 z-10"
                    style={{ background: '#f8fafc', borderBottom: '1.5px solid #E4E8EF' }}>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora</span>
                  </th>
                  {DIAS.map(d => {
                    const esHoy = d === diaHoy
                    return (
                      <th key={d} className="px-2 py-3 text-center"
                        style={{
                          background: esHoy ? '#EFF3FA' : '#f8fafc',
                          borderLeft: '1px solid #E4E8EF',
                          borderBottom: '1.5px solid #E4E8EF',
                        }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[11px] font-black"
                            style={{ color: esHoy ? '#0B2447' : '#64748b' }}>
                            {d}
                          </span>
                          {esHoy && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                              style={{ background: '#0B2447', color: 'white' }}>
                              HOY
                            </span>
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              {/* Filas por hora */}
              <tbody>
                {horas.map((hora, idx) => (
                  <tr key={hora}
                    style={{ borderBottom: idx < horas.length - 1 ? '1px solid #f1f5f9' : 'none' }}>

                    {/* Hora */}
                    <td className="px-4 py-2 sticky left-0"
                      style={{ background: '#f8fafc', verticalAlign: 'middle', borderRight: '1px solid #E4E8EF' }}>
                      <p className="text-[11px] font-black text-slate-500 font-mono tabular-nums">{hora}</p>
                    </td>

                    {/* Celda por día */}
                    {DIAS.map(dia => {
                      const clase = clases.find(c => c.dia === dia && c.hora_inicio === hora)
                      const esHoy  = dia === diaHoy
                      const color  = clase ? colorDeCurso(clase.materia) : '#143875'

                      return (
                        <td key={dia} className="px-1.5 py-1.5"
                          style={{
                            borderLeft: '1px solid #E4E8EF',
                            verticalAlign: 'middle',
                            background: esHoy ? '#fafbff' : 'transparent',
                          }}>
                          {clase ? (
                            <div className="rounded-xl px-2.5 py-2.5"
                              style={{
                                background: `linear-gradient(135deg, ${color}15, ${color}25)`,
                                border: `1.5px solid ${color}40`,
                              }}>
                              <p className="text-[10px] font-black leading-tight truncate"
                                style={{ color }}>
                                {clase.materia}
                              </p>
                              <p className="text-[9px] font-bold text-slate-500 mt-0.5">
                                {clase.grado} {clase.grupo}
                              </p>
                              <p className="text-[8px] text-slate-400 font-mono mt-1">
                                {clase.hora_inicio} – {clase.hora_fin}
                              </p>
                            </div>
                          ) : (
                            <div style={{ minHeight: '58px' }} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* ── Leyenda cursos ──────────────────────────────────────────── */}
      {modo === 'propio' && clases.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {asigs
            .filter(a => a.cursos)
            .filter((a, i, arr) => arr.findIndex(x => x.cursos?.nombre === a.cursos?.nombre) === i)
            .map(a => (
              <div key={a.cursos!.nombre} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: a.cursos!.color + '15', border: `1px solid ${a.cursos!.color}30` }}>
                <div className="w-2 h-2 rounded-full" style={{ background: a.cursos!.color }} />
                <span className="text-[11px] font-bold" style={{ color: a.cursos!.color }}>
                  {a.cursos!.nombre}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* ── Vista Por Curso ─────────────────────────────────────────── */}
      {modo === 'curso' && (
        <div className="space-y-5">

          {/* Selector */}
          <div className="rounded-2xl p-5"
            style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 24px rgba(11,36,71,.06)' }}>
            <label className="block text-xs font-black text-slate-600 mb-2">Selecciona un curso</label>
            <div className="flex gap-3">
              <select
                value={cursoBuscado}
                onChange={e => { setCursoBuscado(e.target.value); setBuscadoYa(false) }}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 outline-none"
                style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }}>
                <option value="">— Elige un curso —</option>
                {cursos.map(c => (
                  <option key={c.id} value={c.nombre}>{c.nombre}</option>
                ))}
              </select>
              <button onClick={buscarPorCurso} disabled={!cursoBuscado || buscando}
                className="px-5 py-2.5 rounded-xl text-sm font-black transition-all"
                style={{
                  background: cursoBuscado ? `linear-gradient(135deg,${colorBusqueda},${colorBusqueda}cc)` : '#e2e8f0',
                  color: cursoBuscado ? 'white' : '#94a3b8',
                  cursor: cursoBuscado && !buscando ? 'pointer' : 'default',
                }}>
                {buscando ? 'Buscando…' : 'Ver horario'}
              </button>
            </div>
          </div>

          {/* Resultados */}
          {buscadoYa && (
            resultados.length === 0 ? (
              <div className="rounded-2xl flex flex-col items-center justify-center py-16 gap-3"
                style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: '#EFF3FA' }}>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#a5b4fc" strokeWidth="1.5">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <p className="text-sm font-bold text-slate-500">Sin horas registradas para <span className="text-indigo-500">{cursoBuscado}</span></p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 24px rgba(11,36,71,.06)' }}>

                {/* Banner */}
                <div className="px-5 py-4 flex items-center gap-3"
                  style={{ background: `${colorBusqueda}10`, borderBottom: `1.5px solid ${colorBusqueda}20` }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm text-white"
                    style={{ background: `linear-gradient(135deg,${colorBusqueda},${colorBusqueda}cc)` }}>
                    {cursoBuscado.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800">{cursoBuscado}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Set(resultados.map(h => h.docentes?.nombre).filter(Boolean)).size} docente(s) ·{' '}
                      {new Set(resultados.map(h => `${h.grado}-${h.grupo}`)).size} sección(es) ·{' '}
                      {resultados.length} hora(s) semanales
                    </p>
                  </div>
                </div>

                {/* Lista por día */}
                <div className="divide-y divide-slate-50">
                  {todosDias.map(dia => {
                    const filas = resultados.filter(h => h.dia === dia)
                    if (!filas.length) return null
                    return (
                      <div key={dia}>
                        <div className="px-5 py-2.5 flex items-center gap-2" style={{ background: '#fafbff' }}>
                          <div className="w-1.5 h-4 rounded-full" style={{ background: colorBusqueda }} />
                          <span className="text-xs font-black text-slate-600">{dia}</span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {filas.length} {filas.length === 1 ? 'hora' : 'horas'}
                          </span>
                        </div>
                        {filas.map(h => (
                          <div key={h.id} className="flex items-center gap-4 px-5 py-3"
                            style={{ borderTop: '1px solid #f1f5f9' }}>
                            {/* Hora */}
                            <div className="flex items-center gap-1.5 w-28 shrink-0">
                              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={colorBusqueda} strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                              </svg>
                              <span className="text-xs font-black font-mono" style={{ color: colorBusqueda }}>
                                {h.hora_inicio.slice(0,5)} – {h.hora_fin.slice(0,5)}
                              </span>
                            </div>
                            {/* Docente */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0"
                                style={{ background: `linear-gradient(135deg,${colorBusqueda},${colorBusqueda}aa)` }}>
                                {(h.docentes?.nombre ?? '?').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()}
                              </div>
                              <p className="text-xs font-bold text-slate-700 truncate">
                                {h.docentes?.nombre ?? 'Sin docente asignado'}
                              </p>
                            </div>
                            {/* Sección */}
                            {(h.grado || h.grupo) && (
                              <div className="px-2.5 py-1 rounded-lg text-[11px] font-black shrink-0"
                                style={{ background: `${colorBusqueda}12`, color: colorBusqueda }}>
                                {h.grado} {h.grupo}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          )}
        </div>
      )}

    </div>
  )
}
