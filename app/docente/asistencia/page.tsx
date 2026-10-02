'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { formatFechaDMY as formatFecha } from '@/utils/formatters'
import { getSesionDocente } from '@/lib/auth'
import type { Asignacion } from '@/types'
import QrScanner from '@/components/QrScanner'

interface AlumnoRow {
  id: string
  nombre: string
  apellidos: string
}

interface RegistroRow {
  alumno_id: string
  presente: boolean
}

function isoToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}


export default function DocenteAsistenciaPage() {
  const router = useRouter()

  const [, setUid]                = useState('')
  const [asigs,     setAsigs]     = useState<Asignacion[]>([])
  const [asigId,    setAsigId]    = useState('')
  const [fecha,     setFecha]     = useState(isoToday())
  const [alumnos,   setAlumnos]   = useState<AlumnoRow[]>([])
  const [presentes, setPresentes] = useState<Set<string>>(new Set())
  const [loading,   setLoading]   = useState(true)
  const [cargando,  setCargando]  = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado,  setGuardado]  = useState(false)

  // Resumen histórico
  const [resumen,    setResumen]    = useState<{ alumno_id: string; total: number; presentes: number }[]>([])
  const [tabActiva,  setTabActiva]  = useState<'pase' | 'escaner' | 'resumen'>('pase')

  // Escáner QR
  type ScanResult = { alumno_id: string; nombre: string; tipo: 'ok' | 'repetido' | 'error'; mensaje: string }
  const [escaneando,    setEscaneando]    = useState(false)
  const [scanResultado, setScanResultado] = useState<ScanResult | null>(null)
  const [scaneados,     setScaneados]     = useState<ScanResult[]>([])
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  useEffect(() => {
    async function init() {
      const sesion = await getSesionDocente()
      if (!sesion) { router.push('/login'); return }
      const efectivoId = sesion.uid
      setUid(efectivoId)

      const cicloId = (await getCicloActivo())?.id ?? null
      let asigsQ = supabase
        .from('asignaciones')
        .select('id,grado,grupo,cursos(nombre,color)')
        .eq('docente_id', efectivoId)
        .order('grado').order('grupo')
      if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
      const { data } = await asigsQ
      const lista = (data ?? []) as unknown as Asignacion[]
      setAsigs(lista)
      if (lista.length) setAsigId(lista[0].id)
      setLoading(false)
    }
    init()
  }, [router])

  const cargarAlumnos = useCallback(async (aId: string) => {
    if (!aId) return
    setCargando(true)
    const asig = asigs.find(a => a.id === aId)
    if (!asig) { setCargando(false); return }

    const [{ data: alumnosData }, { data: registros }] = await Promise.all([
      supabase.from('alumnos')
        .select('id,nombre,apellidos')
        .eq('grado', asig.grado).eq('grupo', asig.grupo)
        .order('apellidos').order('nombre'),
      supabase.from('asistencia_alumnos')
        .select('alumno_id,presente')
        .eq('asignacion_id', aId).eq('fecha', fecha),
    ])

    const alumnosList = (alumnosData ?? []) as AlumnoRow[]
    const regs        = (registros    ?? []) as RegistroRow[]
    setAlumnos(alumnosList)

    // Si ya hay registros para esa fecha, cargarlos; si no, todos presentes por defecto
    if (regs.length > 0) {
      const pSet = new Set(regs.filter(r => r.presente).map(r => r.alumno_id))
      setPresentes(pSet)
    } else {
      setPresentes(new Set(alumnosList.map(a => a.id)))
    }
    setGuardado(false)
    setCargando(false)
  }, [asigs, fecha])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (asigId) cargarAlumnos(asigId)
  }, [asigId, fecha, cargarAlumnos])

  // Resumen histórico
  const cargarResumen = useCallback(async () => {
    if (!asigId) return
    const asig = asigs.find(a => a.id === asigId)
    if (!asig) return

    const [{ data: alumnosData }, { data: todos }] = await Promise.all([
      supabase.from('alumnos')
        .select('id').eq('grado', asig.grado).eq('grupo', asig.grupo),
      supabase.from('asistencia_alumnos')
        .select('alumno_id,presente,fecha').eq('asignacion_id', asigId),
    ])

    const alumnoIds = (alumnosData ?? []).map(a => a.id)
    const registros = (todos ?? []) as RegistroRow[]

    // Agrupar por alumno
    const fechasUnicas = new Set(
      (todos ?? [] as { fecha: string }[]).map((r: { fecha: string }) => r.fecha).filter(Boolean)
    )
    const totalFechas = fechasUnicas.size

    const res = alumnoIds.map(id => ({
      alumno_id: id,
      total:     totalFechas,
      presentes: registros.filter(r => r.alumno_id === id && r.presente).length,
    }))
    setResumen(res)
  }, [asigId, asigs])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tabActiva === 'resumen') cargarResumen()
  }, [tabActiva, asigId, cargarResumen])

  async function guardar() {
    if (!alumnos.length || !asigId) return
    setGuardando(true)
    const upserts = alumnos.map(a => ({
      asignacion_id: asigId,
      alumno_id:     a.id,
      fecha,
      presente:      presentes.has(a.id),
    }))
    await supabase.from('asistencia_alumnos').upsert(upserts, { onConflict: 'asignacion_id,alumno_id,fecha' })
    setGuardando(false)
    setGuardado(true)
  }

  async function handleScanAlumno(qrToken: string) {
    if (escaneando || !asigId) return
    setEscaneando(true)
    const { data, error } = await supabase.rpc('registrar_asistencia_alumno', {
      p_qr_token:      qrToken,
      p_asignacion_id: asigId,
      p_fecha:         fecha,
    })
    setEscaneando(false)
    let r: ScanResult
    if (error || data?.error) {
      r = { alumno_id: '', nombre: '', tipo: 'error', mensaje: data?.error ?? 'Error al registrar' }
    } else if (data?.ya_marcado) {
      r = { alumno_id: data.alumno_id, nombre: data.nombre, tipo: 'repetido', mensaje: 'Ya estaba marcado' }
      setScaneados(prev => prev.some(s => s.alumno_id === data.alumno_id) ? prev : [r, ...prev])
    } else {
      r = { alumno_id: data.alumno_id, nombre: data.nombre, tipo: 'ok', mensaje: 'Presente ✓' }
      setScaneados(prev => [r, ...prev])
    }
    setScanResultado(r)
    // Feedback háptico: pulso corto al marcar, patrón distinto si repetido/error.
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(r.tipo === 'ok' ? 90 : r.tipo === 'repetido' ? [30, 40, 30] : 220)
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setScanResultado(null), r.tipo === 'error' ? 2600 : 1600)
  }

  function togglePresente(id: string) {
    setGuardado(false)
    setPresentes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (loading) return null

  const asig      = asigs.find(a => a.id === asigId)
  const color     = asig?.cursos?.color ?? '#143875'
  const totalP    = presentes.size
  const totalA    = alumnos.length - totalP
  const pct       = alumnos.length ? Math.round(totalP / alumnos.length * 100) : 0

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-800">Asistencia</h1>
        <p className="text-sm text-slate-400 mt-0.5">Registra la asistencia de tus estudiantes por clase</p>
      </div>

      {asigs.length === 0 ? (
        <div className="rounded-2xl flex flex-col items-center justify-center py-20"
          style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
          <p className="text-sm text-slate-400">Sin cursos asignados</p>
        </div>
      ) : (
        <>
          {/* Controles */}
          <div className="rounded-2xl p-5 space-y-4"
            style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 24px rgba(11,36,71,.06)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Curso</label>
                <select value={asigId} onChange={e => { setAsigId(e.target.value); setTabActiva('pase') }}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 outline-none"
                  style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }}>
                  {asigs.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.cursos?.nombre ?? 'Curso'} — {a.grado} {a.grupo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  max={isoToday()}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 outline-none"
                  style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }} />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-xl p-1" style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }}>
              {([['pase', 'Pase de lista'], ['escaner', '📷 Escáner QR'], ['resumen', 'Resumen']] as const).map(([val, label]) => (
                <button key={val} onClick={() => { setTabActiva(val); if (val !== 'escaner') { setScaneados([]); setScanResultado(null) } }}
                  className="flex-1 py-2 rounded-lg text-xs font-black transition-all"
                  style={tabActiva === val
                    ? { background: 'white', color: color, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }
                    : { color: '#94a3b8' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab: Pase de lista ── */}
          {tabActiva === 'pase' && (
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 24px rgba(11,36,71,.06)' }}>

              {/* Banner */}
              <div className="px-5 py-4 flex items-center justify-between gap-3"
                style={{ background: `${color}10`, borderBottom: `1.5px solid ${color}20` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm text-white"
                    style={{ background: `linear-gradient(135deg,${color},${color}cc)` }}>
                    {(asig?.cursos?.nombre ?? 'C').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800">{asig?.cursos?.nombre ?? 'Curso'}</p>
                    <p className="text-[11px] text-slate-400">{asig?.grado} · Sección {asig?.grupo} · {formatFecha(fecha)}</p>
                  </div>
                </div>
                {alumnos.length > 0 && (
                  <div className="text-right">
                    <p className="text-xl font-black" style={{ color }}>{pct}%</p>
                    <p className="text-[10px] text-slate-400">{totalP} presentes · {totalA} ausentes</p>
                  </div>
                )}
              </div>

              {cargando ? (
                <div className="flex items-center justify-center py-16">
                  <svg className="animate-spin h-6 w-6" style={{ color }} viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                </div>
              ) : alumnos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <p className="text-sm font-bold text-slate-400">Sin estudiantes en esta sección</p>
                  <p className="text-xs text-slate-400">Verifica que haya estudiantes registrados en {asig?.grado} {asig?.grupo}</p>
                </div>
              ) : (
                <>
                  {/* Acciones rápidas */}
                  <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <button onClick={() => setPresentes(new Set(alumnos.map(a => a.id)))}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-black transition-all"
                      style={{ background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #bbf7d0' }}>
                      Todos presentes
                    </button>
                    <button onClick={() => setPresentes(new Set())}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-black transition-all"
                      style={{ background: '#fff1f2', color: '#ef4444', border: '1.5px solid #fecdd3' }}>
                      Todos ausentes
                    </button>
                    <span className="ml-auto text-[11px] text-slate-400 font-bold">{alumnos.length} estudiantes</span>
                  </div>

                  {/* Lista */}
                  <div className="divide-y divide-slate-50">
                    {alumnos.map((a, idx) => {
                      const estaPresente = presentes.has(a.id)
                      return (
                        <div key={a.id} className="flex items-center gap-3 px-5 py-3 transition-all"
                          style={{ background: estaPresente ? 'white' : '#fff8f8' }}>
                          <span className="text-[11px] font-black text-slate-300 w-5 shrink-0">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-700 truncate">
                              {a.apellidos}, {a.nombre}
                            </p>
                          </div>
                          <button onClick={() => togglePresente(a.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all"
                            style={estaPresente
                              ? { background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #bbf7d0' }
                              : { background: '#fff1f2', color: '#ef4444', border: '1.5px solid #fecdd3' }}>
                            {estaPresente ? (
                              <>
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                Presente
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                                Ausente
                              </>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {/* Guardar */}
                  <div className="flex items-center justify-between gap-3 px-5 py-4"
                    style={{ borderTop: '1.5px solid #f1f5f9', background: '#fafbff' }}>
                    {guardado ? (
                      <span className="text-xs font-black" style={{ color: '#16a34a' }}>✓ Guardado correctamente</span>
                    ) : (
                      <span className="text-xs text-slate-400">Cambios sin guardar</span>
                    )}
                    <button onClick={guardar} disabled={guardando}
                      className="px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all"
                      style={{ background: `linear-gradient(135deg,${color},${color}cc)`,
                               boxShadow: `0 4px 12px ${color}40` }}>
                      {guardando ? 'Guardando…' : 'Guardar asistencia'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Tab: Escáner QR ── */}
          {tabActiva === 'escaner' && (
            <div className="space-y-4">

              {/* Info */}
              <div className="rounded-2xl p-4 flex items-start gap-3"
                style={{ background: `${color}10`, border: `1.5px solid ${color}30` }}>
                <svg className="shrink-0 mt-0.5" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p className="text-xs font-medium" style={{ color }}>
                  Los estudiantes deben mostrar su QR desde su portal. Cada escaneo marca al estudiante como <strong>presente</strong> en <strong>{asig?.cursos?.nombre} — {asig?.grado} {asig?.grupo}</strong> para el <strong>{formatFecha(fecha)}</strong>.
                </p>
              </div>

              {/* Escáner */}
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 24px rgba(11,36,71,.06)' }}>
                <div className="h-1" style={{ background: `linear-gradient(90deg,${color},${color}88)` }} />
                <div className="p-5 relative">
                  <QrScanner
                    rawMode
                    continuous
                    onScan={handleScanAlumno}
                    disabled={escaneando}
                  />

                  {/* Confirmación GRANDE sobre el escáner: nombre del alumno + estado,
                      imposible de no ver al escanear en fila. Se auto-cierra. */}
                  {scanResultado && (
                    <div
                      key={scanResultado.alumno_id + scanResultado.mensaje}
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 rounded-2xl"
                      style={{
                        animation: 'scanpop .22s ease-out',
                        background: scanResultado.tipo === 'ok' ? 'rgba(22,163,74,0.97)'
                                  : scanResultado.tipo === 'repetido' ? 'rgba(217,119,6,0.97)'
                                  : 'rgba(220,38,38,0.97)',
                      }}>
                      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-4"
                        style={{ background: 'rgba(255,255,255,0.22)', border: '3px solid rgba(255,255,255,0.65)' }}>
                        {scanResultado.tipo === 'ok' ? (
                          <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ) : scanResultado.tipo === 'repetido' ? (
                          <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        ) : (
                          <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        )}
                      </div>
                      {scanResultado.nombre && (
                        <p className="text-white font-black text-2xl leading-tight break-words">{scanResultado.nombre}</p>
                      )}
                      <p className="text-white font-black text-base mt-1.5 uppercase tracking-widest">
                        {scanResultado.tipo === 'ok' ? 'Presente ✓' : scanResultado.mensaje}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Lista de scaneados en esta sesión */}
              {scaneados.length > 0 && (
                <div className="rounded-2xl overflow-hidden"
                  style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                  <div className="px-5 py-3 flex items-center justify-between"
                    style={{ borderBottom: '1px solid #f1f5f9', background: '#fafbff' }}>
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                      Escaneados esta sesión
                    </span>
                    <span className="text-xs font-bold" style={{ color }}>{scaneados.length} estudiantes</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {scaneados.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: '#f0fdf4', border: '1.5px solid #86efac' }}>
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                        <p className="text-xs font-bold text-slate-700 flex-1">{s.nombre}</p>
                        <span className="text-[10px] font-bold text-slate-300">#{scaneados.length - i}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Resumen ── */}
          {tabActiva === 'resumen' && (
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 24px rgba(11,36,71,.06)' }}>

              <div className="px-5 py-4" style={{ borderBottom: '1.5px solid #f1f5f9', background: `${color}08` }}>
                <p className="text-sm font-black text-slate-700">
                  {asig?.cursos?.nombre ?? 'Curso'} — {asig?.grado} {asig?.grupo}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {resumen.filter(r => r.total > 0).length > 0
                    ? `${new Set(resumen.map(r => r.total)).values().next().value} clases registradas`
                    : 'Sin registros aún'}
                </p>
              </div>

              {resumen.length === 0 || resumen.every(r => r.total === 0) ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <p className="text-sm font-bold text-slate-400">Sin registros de asistencia</p>
                  <p className="text-xs text-slate-400">Realiza el primer pase de lista en la pestaña anterior</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {resumen.map(r => {
                    const alumno = alumnos.find(a => a.id === r.alumno_id)
                    if (!alumno) return null
                    const pct2    = r.total > 0 ? Math.round(r.presentes / r.total * 100) : 0
                    const pctColor = pct2 >= 75 ? '#16a34a' : pct2 >= 50 ? '#d97706' : '#ef4444'
                    return (
                      <div key={r.alumno_id} className="flex items-center gap-3 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">
                            {alumno.apellidos}, {alumno.nombre}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 rounded-full" style={{ background: '#f1f5f9', maxWidth: 120 }}>
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${pct2}%`, background: pctColor }} />
                            </div>
                            <span className="text-[10px] text-slate-400">{r.presentes}/{r.total} clases</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black" style={{ color: pctColor }}>{pct2}%</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
