'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { formatFechaCorta, formatFechaConDia as formatFechaLarga } from '@/utils/formatters'

/* ─── tipos ─────────────────────────────────────────────── */
interface Alumno {
  id: string
  nombre: string
  apellidos: string | null
}

interface Marca {
  alumno_id: string
  fecha: string      // 'YYYY-MM-DD'
  presente: boolean
}

interface DetallesFecha {
  fecha: string
  presentes: Alumno[]
  ausentes: Alumno[]
}

/* ─── helpers ───────────────────────────────────────────── */
function displayAlumno(a: Alumno) {
  const ap = (a.apellidos ?? '').trim()
  const nm = (a.nombre ?? '').trim()
  return ap ? `${ap}, ${nm}` : nm
}


function hoy(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}

/* ══════════════════════════════════════════════════════════ */
interface Props {
  asignacionId: string
  grado: string
  grupo: string
  color: string
}

export default function AsistenciaPanel({ asignacionId, grado, grupo, color }: Props) {
  const [alumnos,      setAlumnos]      = useState<Alumno[]>([])
  const [marcas,       setMarcas]       = useState<Marca[]>([])
  const [fechas,       setFechas]       = useState<string[]>([])   // columnas únicas ordenadas
  const [loading,      setLoading]      = useState(true)
  const [guardando,    setGuardando]    = useState<string | null>(null)  // 'alumnoId-fecha'
  const [detalle,      setDetalle]      = useState<DetallesFecha | null>(null)
  const [tomarHoy,     setTomarHoy]     = useState(false)
  const [fechaNueva,   setFechaNueva]   = useState(hoy())

  /* ── cargar datos ── */
  const cargar = useCallback(async () => {
    setLoading(true)

    /* alumnos del grado/grupo (solo matrículas del ciclo activo) */
    const cicloId = (await getCicloActivo())?.id ?? null
    let matsQ = supabase
      .from('matriculas')
      .select('alumnos(id, nombre, apellidos)')
      .eq('grado', grado)
      .eq('grupo', grupo)
      .order('alumnos(apellidos)')
    if (cicloId) matsQ = matsQ.eq('ciclo_id', cicloId)
    const { data: mats } = await matsQ

    /* registros de asistencia de esta asignación */
    const { data: regs } = await supabase
      .from('asistencia_alumnos')
      .select('alumno_id, fecha, presente')
      .eq('asignacion_id', asignacionId)
      .order('fecha')

    const alumList: Alumno[] = ((mats ?? []) as unknown as { alumnos: Alumno | null }[])
      .map(m => m.alumnos)
      .filter((a): a is Alumno => Boolean(a))
      .sort((a, b) => displayAlumno(a).localeCompare(displayAlumno(b)))

    const marcList: Marca[] = (regs ?? []) as Marca[]
    const fechasUnicas = [...new Set(marcList.map(m => m.fecha))].sort()

    setAlumnos(alumList)
    setMarcas(marcList)
    setFechas(fechasUnicas)
    setLoading(false)
  }, [asignacionId, grado, grupo])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])

  /* ── mapa rápido de acceso ── */
  const marcaMap = new Map(marcas.map(m => [`${m.alumno_id}-${m.fecha}`, m.presente]))

  /* ── toggle de una marca individual ── */
  async function toggleMarca(alumnoId: string, fecha: string) {
    const key    = `${alumnoId}-${fecha}`
    const actual = marcaMap.get(key)
    setGuardando(key)
    if (actual === undefined) {
      await supabase.from('asistencia_alumnos').insert({
        asignacion_id: asignacionId, alumno_id: alumnoId, fecha, presente: true,
      })
    } else {
      await supabase.from('asistencia_alumnos')
        .update({ presente: !actual })
        .eq('asignacion_id', asignacionId)
        .eq('alumno_id', alumnoId)
        .eq('fecha', fecha)
    }
    setGuardando(null)
    cargar()
  }

  /* ── marcar todos presentes en una fecha nueva ── */
  async function marcarTodosPresentes(fecha: string) {
    setGuardando('todos-' + fecha)
    const rows = alumnos.map(a => ({
      asignacion_id: asignacionId, alumno_id: a.id, fecha, presente: true,
    }))
    await supabase.from('asistencia_alumnos')
      .upsert(rows, { onConflict: 'asignacion_id,alumno_id,fecha' })
    setGuardando(null)
    setTomarHoy(false)
    cargar()
  }

  /* ── detalle de una fecha ── */
  function abrirDetalle(fecha: string) {
    const presentes = alumnos.filter(a => marcaMap.get(`${a.id}-${fecha}`) === true)
    const ausentes  = alumnos.filter(a => marcaMap.get(`${a.id}-${fecha}`) !== true)
    setDetalle({ fecha, presentes, ausentes })
  }

  /* ── estadísticas por alumno ── */
  function statsAlumno(alumnoId: string) {
    if (fechas.length === 0) return { pct: null, total: 0, presentes: 0 }
    const presentes = fechas.filter(f => marcaMap.get(`${alumnoId}-${f}`) === true).length
    return { pct: Math.round((presentes / fechas.length) * 100), total: fechas.length, presentes }
  }

  /* ── render ── */
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke={color} strokeWidth="4"/>
        <path className="opacity-75" fill={color} d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    </div>
  )

  const fechaHoy = hoy()

  return (
    <div className="space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {[
            { label: 'Clases registradas', val: fechas.length },
            { label: 'Alumnos',             val: alumnos.length },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white text-xs font-semibold text-slate-500"
              style={{ border: '1.5px solid #f1f5f9' }}>
              <span className="text-base font-black" style={{ color }}>{s.val}</span>
              {s.label}
            </div>
          ))}
        </div>

        {/* Tomar asistencia */}
        <button onClick={() => setTomarHoy(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all"
          style={{ background: tomarHoy ? color : `${color}15`, color: tomarHoy ? 'white' : color, border: `1.5px solid ${color}30` }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
          Tomar asistencia
        </button>
      </div>

      {/* ── Panel: tomar asistencia ── */}
      {tomarHoy && (
        <div className="rounded-2xl p-5 space-y-4 bg-white" style={{ border: `1.5px solid ${color}30` }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-black text-slate-700">Registrar clase</p>
              <p className="text-xs text-slate-400 mt-0.5">Marca la fecha y luego activa o desactiva estudiantes</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={fechaNueva} onChange={e => setFechaNueva(e.target.value)}
                className="text-xs rounded-xl px-3 py-2 outline-none font-bold"
                style={{ border: `1.5px solid ${color}40`, color, background: `${color}08` }}/>
              <button onClick={() => marcarTodosPresentes(fechaNueva)}
                disabled={!!guardando}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-50"
                style={{ background: color, color: 'white' }}>
                {guardando?.startsWith('todos-')
                  ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                }
                Todos presentes
              </button>
            </div>
          </div>

          {/* Lista rápida para marcar individualmente */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {alumnos.map(a => {
              const key     = `${a.id}-${fechaNueva}`
              const actual  = marcaMap.get(key)
              const saving  = guardando === key
              return (
                <button key={a.id} onClick={() => toggleMarca(a.id, fechaNueva)} disabled={saving}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left"
                  style={{
                    background: actual === true ? `${color}12` : actual === false ? '#fff1f2' : '#fafafa',
                    border: `1.5px solid ${actual === true ? color + '40' : actual === false ? '#fecdd3' : '#f1f5f9'}`,
                    color: actual === true ? color : actual === false ? '#e11d48' : '#64748b',
                  }}>
                  <span style={{ fontSize: 14 }}>{actual === true ? '✓' : actual === false ? '✗' : '○'}</span>
                  <span className="truncate">{displayAlumno(a)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Sin fechas ── */}
      {fechas.length === 0 && !tomarHoy && (
        <div className="rounded-2xl py-20 text-center bg-white" style={{ border: '1.5px solid #f1f5f9' }}>
          <p className="text-slate-300 text-sm font-semibold">Sin clases registradas aún</p>
          <p className="text-slate-300 text-xs mt-1">Usa &ldquo;Tomar asistencia&rdquo; para empezar</p>
        </div>
      )}

      {/* ── Grid de asistencia ── */}
      {fechas.length > 0 && (
        <div className="rounded-2xl overflow-hidden bg-white" style={{ border: '1.5px solid #f1f5f9' }}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: `${300 + fechas.length * 56}px` }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1.5px solid #f1f5f9' }}>
                  {/* Columna nombre */}
                  <th className="sticky left-0 z-10 text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-white"
                    style={{ minWidth: 200, borderRight: '1px solid #f1f5f9' }}>
                    Estudiante
                  </th>
                  {/* Columnas por fecha */}
                  {fechas.map(f => (
                    <th key={f} className="px-1 py-2 text-center cursor-pointer group"
                      style={{ minWidth: 52 }}
                      onClick={() => abrirDetalle(f)}>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 group-hover:text-slate-600 transition-colors">
                          {formatFechaCorta(f)}
                        </span>
                        {f === fechaHoy && (
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ background: color }}>hoy</span>
                        )}
                        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          strokeWidth="2" className="text-slate-200 group-hover:text-slate-400 transition-colors">
                          <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01"/>
                        </svg>
                      </div>
                    </th>
                  ))}
                  {/* Columna % */}
                  <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400"
                    style={{ minWidth: 64 }}>
                    Asist.
                  </th>
                </tr>
              </thead>
              <tbody>
                {alumnos.map((a, idx) => {
                  const { pct, presentes } = statsAlumno(a.id)
                  const pctColor = pct === null ? '#94a3b8' : pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#e11d48'
                  return (
                    <tr key={a.id} style={{ background: idx % 2 === 0 ? 'white' : '#fafcff', borderBottom: '1px solid #f8fafc' }}>
                      {/* Nombre */}
                      <td className="sticky left-0 z-10 px-4 py-2.5 bg-inherit"
                        style={{ borderRight: '1px solid #f1f5f9' }}>
                        <span className="text-xs font-semibold text-slate-700 truncate block" style={{ maxWidth: 190 }}>
                          {displayAlumno(a)}
                        </span>
                      </td>
                      {/* Celdas por fecha */}
                      {fechas.map(f => {
                        const key    = `${a.id}-${f}`
                        const estado = marcaMap.get(key)
                        const saving = guardando === key
                        return (
                          <td key={f} className="text-center p-1">
                            <button onClick={() => toggleMarca(a.id, f)} disabled={!!guardando}
                              title={estado === true ? 'Presente — clic para cambiar' : 'Ausente — clic para cambiar'}
                              className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-all hover:scale-110 disabled:opacity-50"
                              style={{
                                background: estado === true ? `${color}18` : estado === false ? '#fff1f2' : '#f8fafc',
                                border: `1.5px solid ${estado === true ? color + '50' : estado === false ? '#fecdd3' : '#f1f5f9'}`,
                              }}>
                              {saving
                                ? <svg className="animate-spin h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                : estado === true
                                  ? <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                  : estado === false
                                    ? <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#e11d48" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                    : <span className="text-[10px] text-slate-300 font-black">—</span>
                              }
                            </button>
                          </td>
                        )
                      })}
                      {/* % asistencia */}
                      <td className="text-center px-3 py-2.5">
                        {pct === null
                          ? <span className="text-[10px] text-slate-300">—</span>
                          : (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-xs font-black" style={{ color: pctColor }}>{pct}%</span>
                              <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pctColor }}/>
                              </div>
                              <span className="text-[9px] text-slate-300 font-medium">{presentes}/{fechas.length}</span>
                            </div>
                          )
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Fila resumen por fecha */}
              {alumnos.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f8fafc', borderTop: '1.5px solid #f1f5f9' }}>
                    <td className="sticky left-0 z-10 px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50"
                      style={{ borderRight: '1px solid #f1f5f9' }}>
                      Total presentes
                    </td>
                    {fechas.map(f => {
                      const n = alumnos.filter(a => marcaMap.get(`${a.id}-${f}`) === true).length
                      const pct = Math.round((n / alumnos.length) * 100)
                      return (
                        <td key={f} className="text-center py-2 px-1">
                          <span className="text-[10px] font-black"
                            style={{ color: pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#e11d48' }}>
                            {n}
                          </span>
                        </td>
                      )
                    })}
                    <td/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Leyenda */}
          <div className="px-4 py-2.5 flex items-center gap-5 border-t border-slate-50">
            {[
              { icon: '✓', label: 'Presente', c: color, bg: `${color}18` },
              { icon: '✗', label: 'Ausente',  c: '#e11d48', bg: '#fff1f2' },
              { icon: '—', label: 'Sin registro', c: '#94a3b8', bg: '#f8fafc' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black"
                  style={{ background: l.bg, border: `1.5px solid ${l.c}30`, color: l.c }}>
                  {l.icon}
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{l.label}</span>
              </div>
            ))}
            <span className="text-[10px] text-slate-300 ml-auto">Clic en celda para cambiar · Clic en fecha para ver detalle</span>
          </div>
        </div>
      )}

      {/* ── Panel lateral: detalle de fecha ── */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.4)' }}
          onClick={() => setDetalle(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 py-4 flex items-start justify-between" style={{ background: `${color}10`, borderBottom: `1.5px solid ${color}20` }}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>Detalle de clase</p>
                <p className="text-base font-black text-slate-800 mt-0.5 capitalize">{formatFechaLarga(detalle.fecha)}</p>
              </div>
              <button onClick={() => setDetalle(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Stats rápidas */}
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
              <div className="px-5 py-3 text-center">
                <p className="text-2xl font-black" style={{ color }}>{detalle.presentes.length}</p>
                <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Presentes</p>
              </div>
              <div className="px-5 py-3 text-center">
                <p className="text-2xl font-black text-rose-500">{detalle.ausentes.length}</p>
                <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Ausentes</p>
              </div>
            </div>

            {/* Listas */}
            <div className="p-5 space-y-4 max-h-80 overflow-y-auto">
              {detalle.presentes.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color }}>Presentes</p>
                  <div className="space-y-1">
                    {detalle.presentes.map(a => (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                        style={{ background: `${color}08` }}>
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                        <span className="text-xs font-semibold text-slate-700">{displayAlumno(a)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detalle.ausentes.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-rose-400">Ausentes / sin registro</p>
                  <div className="space-y-1">
                    {detalle.ausentes.map(a => (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50">
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#e11d48" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                        <span className="text-xs font-semibold text-slate-600">{displayAlumno(a)}</span>
                        <button onClick={() => { toggleMarca(a.id, detalle.fecha); setDetalle(null) }}
                          className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-full transition-colors hover:opacity-80"
                          style={{ background: `${color}15`, color }}>
                          Marcar presente
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
