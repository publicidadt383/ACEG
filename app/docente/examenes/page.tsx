'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { getSesionDocente } from '@/lib/auth'
import type { Asignacion } from '@/types'
import { useConfirm } from '@/components/ConfirmModal'

/* ── Tipos ─────────────────────────────────────────────────────── */
interface Opcion {
  id: string
  texto: string
  es_correcta: boolean
  orden: number
}
interface Pregunta {
  id: string
  tipo: 'opcion_multiple' | 'verdadero_falso' | 'texto_corto'
  enunciado: string
  puntos: number
  orden: number
  opciones: Opcion[]
}
interface Examen {
  id: string
  asignacion_id: string
  sesion_id: string | null
  titulo: string
  descripcion: string | null
  fecha_limite: string | null
  duracion_minutos: number | null
  publicado: boolean
  created_at: string
  sesiones?: { titulo: string; unidades: { nombre: string } | null } | null
}
interface Intento {
  id: string
  alumno_id: string
  finalizado_at: string | null
  nota: number | null
  alumnos: { nombre: string; apellidos: string | null; usuario: string | null } | null
}

/* ── Helpers ───────────────────────────────────────────────────── */
function displayAlumno(a: { nombre: string; apellidos?: string | null; usuario?: string | null }): string {
  if (a.apellidos?.trim()) return `${a.apellidos.trim()} ${a.nombre.trim()}`
  if (a.usuario?.includes('.')) {
    const nombreUp = a.nombre.toUpperCase()
    for (const part of a.usuario.split('.')) {
      const pos = nombreUp.indexOf(part.toUpperCase())
      if (pos > 1) return `${a.nombre.substring(pos).trim()} ${a.nombre.substring(0, pos).trim()}`
    }
  }
  return a.nombre
}

function notaColor(n: number | null) {
  if (n === null) return '#94a3b8'
  if (n >= 18) return '#059669'
  if (n >= 14) return '#2563eb'
  if (n >= 11) return '#d97706'
  return '#dc2626'
}

const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none transition-all'
const inputStyle = { background: '#F6F8FB', border: '1.5px solid #E4E8EF' }

/* ── Componente ────────────────────────────────────────────────── */
export default function ExamenesDocente() {
  const [, setUid]                        = useState('')
  const [asigs,         setAsigs]         = useState<Asignacion[]>([])
  const [asigSel,       setAsigSel]       = useState('')
  const [examenes,      setExamenes]      = useState<Examen[]>([])
  const [loading,       setLoading]       = useState(true)
  const [loadingEx,     setLoadingEx]     = useState(false)

  // Crear examen
  const [showForm,      setShowForm]      = useState(false)
  const [form,          setForm]          = useState({ titulo: '', descripcion: '', fecha_limite: '', duracion: '', sesion_id: '' })
  const [saving,        setSaving]        = useState(false)
  const [msg,           setMsg]           = useState('')

  // Sesiones para el selector
  const [unidades,      setUnidades]      = useState<{ id: string; nombre: string; orden: number }[]>([])
  const [sesionesMap,   setSesionesMap]   = useState<Record<string, { id: string; titulo: string; orden: number }[]>>({})

  // Modal confirmar eliminación
  const [confirmEliminarId, setConfirmEliminarId] = useState<string | null>(null)
  const { confirmar, dialogo } = useConfirm()

  // Panel de preguntas
  const [examenAbierto, setExamenAbierto] = useState<Examen | null>(null)
  const [preguntas,     setPreguntas]     = useState<Pregunta[]>([])
  const [loadingPx,     setLoadingPx]     = useState(false)

  // Nueva pregunta
  const [showPxForm,    setShowPxForm]    = useState(false)
  const [pxForm,        setPxForm]        = useState({ tipo: 'opcion_multiple' as Pregunta['tipo'], enunciado: '', puntos: '1' })
  const [opciones,      setOpciones]      = useState([{ texto: '', es_correcta: false }, { texto: '', es_correcta: false }])
  const [savingPx,      setSavingPx]      = useState(false)

  // Resultados
  const [verResultados, setVerResultados] = useState<Examen | null>(null)
  const [intentos,      setIntentos]      = useState<Intento[]>([])
  const [loadingInts,   setLoadingInts]   = useState(false)

  /* ── Init ─────────────────────────────────────────────────────── */
  useEffect(() => {
    async function init() {
      const sesion = await getSesionDocente()
      if (!sesion) return
      const docenteId = sesion.uid
      setUid(docenteId)

      const cicloId = (await getCicloActivo())?.id ?? null
      let asigsQ = supabase
        .from('asignaciones')
        .select('id,grado,grupo,cursos(nombre,color)')
        .eq('docente_id', docenteId)
        .order('grado').order('grupo')
      if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
      const { data } = await asigsQ
      const list = (data ?? []) as unknown as Asignacion[]
      setAsigs(list)
      if (list.length) setAsigSel(list[0].id)
      setLoading(false)
    }
    init()
  }, [])

  /* ── Cargar exámenes ──────────────────────────────────────────── */
  const cargarExamenes = useCallback(async (asigId: string) => {
    if (!asigId) return
    setLoadingEx(true)
    const { data } = await supabase
      .from('examenes')
      .select('*,sesiones(titulo,unidades(nombre))')
      .eq('asignacion_id', asigId)
      .order('created_at', { ascending: false })
    setExamenes((data ?? []) as Examen[])
    setLoadingEx(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (asigSel) cargarExamenes(asigSel) }, [asigSel, cargarExamenes])

  useEffect(() => {
    if (!asigSel) return
    supabase.from('unidades').select('id,nombre,orden').eq('asignacion_id', asigSel).order('orden')
      .then(({ data: uData }) => {
        const uList = (uData ?? []) as { id: string; nombre: string; orden: number }[]
        setUnidades(uList)
        if (!uList.length) { setSesionesMap({}); return }
        supabase.from('sesiones').select('id,unidad_id,titulo,orden')
          .in('unidad_id', uList.map(u => u.id)).order('unidad_id').order('orden')
          .then(({ data: sData }) => {
            const sMap: Record<string, { id: string; titulo: string; orden: number }[]> = {}
            for (const s of (sData ?? []) as { id: string; unidad_id: string; titulo: string; orden: number }[]) {
              if (!sMap[s.unidad_id]) sMap[s.unidad_id] = []
              sMap[s.unidad_id].push(s)
            }
            setSesionesMap(sMap)
          })
      })
  }, [asigSel])

  /* ── Cargar preguntas ─────────────────────────────────────────── */
  async function cargarPreguntas(examenId: string) {
    setLoadingPx(true)
    const { data: px } = await supabase
      .from('preguntas')
      .select('id,tipo,enunciado,puntos,orden')
      .eq('examen_id', examenId)
      .order('orden')
    const ids = (px ?? []).map(p => p.id)
    const opcMap: Record<string, Opcion[]> = {}
    if (ids.length) {
      const { data: opts } = await supabase
        .from('opciones').select('*').in('pregunta_id', ids).order('orden')
      for (const o of opts ?? []) {
        if (!opcMap[o.pregunta_id]) opcMap[o.pregunta_id] = []
        opcMap[o.pregunta_id].push(o)
      }
    }
    setPreguntas((px ?? []).map(p => ({ ...p, opciones: opcMap[p.id] ?? [] })) as Pregunta[])
    setLoadingPx(false)
  }

  async function abrirExamen(ex: Examen) {
    setExamenAbierto(ex)
    setVerResultados(null)
    setShowPxForm(false)
    await cargarPreguntas(ex.id)
  }

  /* ── Crear examen ─────────────────────────────────────────────── */
  async function crearExamen() {
    if (!form.titulo.trim()) { setMsg('El título es obligatorio'); return }
    setSaving(true); setMsg('')
    const payload: Record<string, unknown> = {
      asignacion_id: asigSel,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      publicado: false,
    }
    if (form.fecha_limite) payload.fecha_limite = new Date(form.fecha_limite).toISOString()
    if (form.duracion)     payload.duracion_minutos = parseInt(form.duracion)
    if (form.sesion_id)    payload.sesion_id = form.sesion_id

    const { error } = await supabase.from('examenes').insert(payload)
    if (error) { setMsg('Error: ' + error.message); setSaving(false); return }
    setForm({ titulo: '', descripcion: '', fecha_limite: '', duracion: '', sesion_id: '' })
    setShowForm(false)
    await cargarExamenes(asigSel)
    setSaving(false)
  }

  /* ── Publicar / despublicar ───────────────────────────────────── */
  async function togglePublicar(ex: Examen) {
    await supabase.from('examenes').update({ publicado: !ex.publicado }).eq('id', ex.id)
    setExamenes(prev => prev.map(e => e.id === ex.id ? { ...e, publicado: !e.publicado } : e))
    if (examenAbierto?.id === ex.id) setExamenAbierto(prev => prev ? { ...prev, publicado: !prev.publicado } : prev)
  }

  /* ── Eliminar examen ──────────────────────────────────────────── */
  async function eliminarExamen(id: string) {
    await supabase.from('examenes').delete().eq('id', id)
    if (examenAbierto?.id === id) setExamenAbierto(null)
    setExamenes(prev => prev.filter(e => e.id !== id))
    setConfirmEliminarId(null)
  }

  /* ── Guardar pregunta ─────────────────────────────────────────── */
  async function guardarPregunta() {
    if (!pxForm.enunciado.trim()) { setMsg('El enunciado es obligatorio'); return }
    if (pxForm.tipo !== 'texto_corto' && !opciones.some(o => o.es_correcta)) {
      setMsg('Marca al menos una opción como correcta'); return
    }
    if (pxForm.tipo !== 'texto_corto' && opciones.some(o => !o.texto.trim())) {
      setMsg('Completa el texto de todas las opciones'); return
    }
    setSavingPx(true); setMsg('')

    const nextOrden = preguntas.length
    const { data: px, error } = await supabase.from('preguntas').insert({
      examen_id: examenAbierto!.id,
      tipo: pxForm.tipo,
      enunciado: pxForm.enunciado.trim(),
      puntos: parseFloat(pxForm.puntos) || 1,
      orden: nextOrden,
    }).select().single()

    if (error || !px) { setMsg('Error al guardar pregunta'); setSavingPx(false); return }

    if (pxForm.tipo !== 'texto_corto') {
      const opts = opciones.map((o, i) => ({
        pregunta_id: px.id,
        texto: o.texto.trim(),
        es_correcta: o.es_correcta,
        orden: i,
      }))
      await supabase.from('opciones').insert(opts)
    }

    setPxForm({ tipo: 'opcion_multiple', enunciado: '', puntos: '1' })
    setOpciones([{ texto: '', es_correcta: false }, { texto: '', es_correcta: false }])
    setShowPxForm(false)
    await cargarPreguntas(examenAbierto!.id)
    setSavingPx(false)
  }

  /* ── Eliminar pregunta ────────────────────────────────────────── */
  async function eliminarPregunta(id: string) {
    if (!(await confirmar({
      titulo: '¿Eliminar esta pregunta?',
      mensaje: 'Se borra del examen junto con sus opciones. Si algún alumno ya respondió, sus respuestas a esta pregunta se pierden.',
      tono: 'peligro', confirmarLabel: 'Eliminar pregunta',
    }))) return
    await supabase.from('preguntas').delete().eq('id', id)
    setPreguntas(prev => prev.filter(p => p.id !== id))
  }

  /* ── Ver resultados ───────────────────────────────────────────── */
  async function abrirResultados(ex: Examen) {
    setVerResultados(ex)
    setExamenAbierto(null)
    setLoadingInts(true)
    const { data } = await supabase
      .from('intentos')
      .select('id,alumno_id,finalizado_at,nota,alumnos(nombre,apellidos,usuario)')
      .eq('examen_id', ex.id)
      .order('nota', { ascending: false, nullsFirst: false })
    setIntentos((data ?? []) as unknown as Intento[])
    setLoadingInts(false)
  }

  /* ── Opciones UI ──────────────────────────────────────────────── */
  function setOpcionVF(esVerdadero: boolean) {
    setOpciones([
      { texto: 'Verdadero', es_correcta: esVerdadero },
      { texto: 'Falso',     es_correcta: !esVerdadero },
    ])
  }

  const puntajeTotal = preguntas.reduce((s, p) => s + p.puntos, 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <svg className="animate-spin h-7 w-7 text-indigo-400" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    </div>
  )

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800">Exámenes</h1>
          <p className="text-slate-400 text-xs mt-0.5">Crea y gestiona exámenes por curso</p>
        </div>
      </div>

      {/* Selector de asignación */}
      {asigs.length === 0 ? (
        <div className="rounded-2xl p-8 text-center text-slate-400 text-sm"
          style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
          No tienes cursos asignados.
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap mb-5">
          {asigs.map(a => (
            <button key={a.id} onClick={() => { setAsigSel(a.id); setExamenAbierto(null); setVerResultados(null) }}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={asigSel === a.id
                ? { background: a.cursos?.color ?? '#143875', color: 'white', border: '2px solid transparent' }
                : { background: 'white', color: '#64748b', border: '1.5px solid #E4E8EF' }}>
              {a.cursos?.nombre ?? 'Curso'} · {a.grado} &quot;{a.grupo}&quot;
            </button>
          ))}
        </div>
      )}

      {asigSel && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* ── Lista de exámenes ──────────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #f1f5f9' }}>
                <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Exámenes</p>
                <button onClick={() => { setShowForm(v => !v); setMsg('') }}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                  style={{ background: '#EFF3FA', color: '#0B2447', border: '1.5px solid #b6c5e3' }}>
                  + Nuevo
                </button>
              </div>

              {/* Formulario nuevo examen */}
              {showForm && (
                <div className="px-4 py-3" style={{ borderBottom: '1px solid #f1f5f9', background: '#F6F8FB' }}>
                  <div className="flex flex-col gap-2">
                    <input placeholder="Título del examen *" value={form.titulo}
                      onChange={e => setForm({ ...form, titulo: e.target.value })}
                      className={inputCls} style={inputStyle} />
                    <textarea placeholder="Descripción (opcional)" value={form.descripcion}
                      onChange={e => setForm({ ...form, descripcion: e.target.value })}
                      rows={2} className={inputCls} style={inputStyle} />
                    {unidades.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold mb-1">Sesión</p>
                        <select value={form.sesion_id} onChange={e => setForm({ ...form, sesion_id: e.target.value })}
                          className={inputCls} style={inputStyle}>
                          <option value="">— Sin sesión específica —</option>
                          {unidades.map(u => (
                            <optgroup key={u.id} label={u.nombre}>
                              {(sesionesMap[u.id] ?? []).map(s => (
                                <option key={s.id} value={s.id}>{s.orden}. {s.titulo}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold mb-1">Fecha límite</p>
                        <input type="datetime-local" value={form.fecha_limite}
                          onChange={e => setForm({ ...form, fecha_limite: e.target.value })}
                          className={inputCls} style={inputStyle} />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold mb-1">Duración (min)</p>
                        <input type="number" placeholder="Sin límite" value={form.duracion}
                          onChange={e => setForm({ ...form, duracion: e.target.value })}
                          className={inputCls} style={inputStyle} />
                      </div>
                    </div>
                    {msg && <p className="text-xs text-red-500 font-semibold">{msg}</p>}
                    <button onClick={crearExamen} disabled={saving}
                      className="w-full py-2 rounded-xl text-xs font-black text-white transition-all"
                      style={{ background: 'linear-gradient(135deg,#0B2447,#0B2447)', opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Guardando…' : 'Crear examen'}
                    </button>
                  </div>
                </div>
              )}

              {/* Lista */}
              {loadingEx ? (
                <div className="flex justify-center py-8">
                  <svg className="animate-spin h-5 w-5 text-indigo-300" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                </div>
              ) : examenes.length === 0 ? (
                <p className="text-center text-slate-300 text-sm py-8">Sin exámenes aún</p>
              ) : (
                <div>
                  {examenes.map(ex => {
                    const isOpen = examenAbierto?.id === ex.id || verResultados?.id === ex.id
                    return (
                      <div key={ex.id}
                        className="px-4 py-3 cursor-pointer transition-colors"
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isOpen ? '#EFF3FA' : 'transparent',
                        }}
                        onClick={() => abrirExamen(ex)}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{ex.titulo}</p>
                            {ex.sesiones && (
                              <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#94a3b8' }}>
                                {ex.sesiones.unidades?.nombre && `${ex.sesiones.unidades.nombre} · `}{ex.sesiones.titulo}
                              </p>
                            )}
                            {ex.fecha_limite && (
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Límite: {new Date(ex.fecha_limite).toLocaleDateString('es-PE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full"
                            style={ex.publicado
                              ? { background: '#d1fae5', color: '#059669' }
                              : { background: '#f1f5f9', color: '#94a3b8' }}>
                            {ex.publicado ? 'PUBLICADO' : 'BORRADOR'}
                          </span>
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          <button onClick={e => { e.stopPropagation(); togglePublicar(ex) }}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                            style={ex.publicado
                              ? { background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }
                              : { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                            {ex.publicado ? 'Ocultar' : 'Publicar'}
                          </button>
                          <button onClick={e => { e.stopPropagation(); abrirResultados(ex) }}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                            style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                            Resultados
                          </button>
                          <button onClick={e => { e.stopPropagation(); setConfirmEliminarId(ex.id) }}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Panel derecho ──────────────────────────────────── */}
          <div className="lg:col-span-3">

            {/* Panel de preguntas */}
            {examenAbierto && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                <div className="px-5 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800">{examenAbierto.titulo}</p>
                      {examenAbierto.descripcion && (
                        <p className="text-xs text-slate-400 mt-0.5">{examenAbierto.descripcion}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-500 font-semibold">
                        {preguntas.length} preg. · {puntajeTotal} pts
                      </span>
                      <button onClick={() => setShowPxForm(v => !v)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg"
                        style={{ background: '#EFF3FA', color: '#0B2447', border: '1.5px solid #b6c5e3' }}>
                        + Pregunta
                      </button>
                    </div>
                  </div>
                </div>

                {/* Formulario nueva pregunta */}
                {showPxForm && (
                  <div className="px-5 py-4" style={{ borderBottom: '1px solid #f1f5f9', background: '#F6F8FB' }}>
                    <div className="flex flex-col gap-3">
                      {/* Tipo */}
                      <div className="flex gap-2">
                        {(['opcion_multiple','verdadero_falso','texto_corto'] as const).map(t => (
                          <button key={t} onClick={() => {
                            setPxForm(p => ({ ...p, tipo: t }))
                            if (t === 'verdadero_falso') setOpciones([{ texto: 'Verdadero', es_correcta: true }, { texto: 'Falso', es_correcta: false }])
                            else if (t === 'opcion_multiple') setOpciones([{ texto: '', es_correcta: false }, { texto: '', es_correcta: false }])
                          }}
                            className="flex-1 py-2 rounded-xl text-[11px] font-bold transition-all"
                            style={pxForm.tipo === t
                              ? { background: '#0B2447', color: 'white' }
                              : { background: '#f1f5f9', color: '#64748b' }}>
                            {t === 'opcion_multiple' ? 'Opción múltiple' : t === 'verdadero_falso' ? 'Verdadero / Falso' : 'Texto corto'}
                          </button>
                        ))}
                      </div>

                      {/* Enunciado */}
                      <textarea placeholder="Enunciado de la pregunta *" value={pxForm.enunciado}
                        onChange={e => setPxForm(p => ({ ...p, enunciado: e.target.value }))}
                        rows={3} className={inputCls} style={inputStyle} />

                      {/* Opciones */}
                      {pxForm.tipo === 'opcion_multiple' && (
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Opciones (marca la correcta)</p>
                          {opciones.map((o, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <button onClick={() => setOpciones(prev => prev.map((x, j) => ({ ...x, es_correcta: j === i })))}
                                className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center transition-all"
                                style={o.es_correcta
                                  ? { background: '#059669', border: '2px solid #059669' }
                                  : { background: 'white', border: '2px solid #cbd5e1' }}>
                                {o.es_correcta && <div className="w-2 h-2 rounded-full bg-white" />}
                              </button>
                              <input placeholder={`Opción ${i + 1}`} value={o.texto}
                                onChange={e => setOpciones(prev => prev.map((x, j) => j === i ? { ...x, texto: e.target.value } : x))}
                                className={inputCls + ' flex-1'} style={inputStyle} />
                              {opciones.length > 2 && (
                                <button onClick={() => setOpciones(prev => prev.filter((_, j) => j !== i))}
                                  className="text-slate-300 hover:text-red-400 transition-colors">
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => setOpciones(prev => [...prev, { texto: '', es_correcta: false }])}
                            className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors text-left">
                            + Agregar opción
                          </button>
                        </div>
                      )}

                      {pxForm.tipo === 'verdadero_falso' && (
                        <div className="flex gap-3">
                          {[true, false].map(v => (
                            <button key={String(v)} onClick={() => setOpcionVF(v)}
                              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                              style={opciones[0]?.es_correcta === v
                                ? { background: '#059669', color: 'white' }
                                : { background: '#f1f5f9', color: '#64748b' }}>
                              {v ? 'Verdadero ✓' : 'Falso ✗'}
                            </button>
                          ))}
                        </div>
                      )}

                      {pxForm.tipo === 'texto_corto' && (
                        <div className="rounded-xl px-4 py-3 text-xs text-slate-500"
                          style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                          Las respuestas de texto corto se califican manualmente.
                        </div>
                      )}

                      {/* Puntos */}
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-slate-500 font-semibold shrink-0">Puntos:</p>
                        <input type="number" min="0.5" step="0.5" value={pxForm.puntos}
                          onChange={e => setPxForm(p => ({ ...p, puntos: e.target.value }))}
                          className={inputCls} style={{ ...inputStyle, maxWidth: '90px' }} />
                      </div>

                      {msg && <p className="text-xs text-red-500 font-semibold">{msg}</p>}

                      <div className="flex gap-2">
                        <button onClick={guardarPregunta} disabled={savingPx}
                          className="flex-1 py-2 rounded-xl text-xs font-black text-white"
                          style={{ background: 'linear-gradient(135deg,#0B2447,#0B2447)', opacity: savingPx ? 0.7 : 1 }}>
                          {savingPx ? 'Guardando…' : 'Guardar pregunta'}
                        </button>
                        <button onClick={() => setShowPxForm(false)}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400"
                          style={{ background: '#f1f5f9' }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lista de preguntas */}
                {loadingPx ? (
                  <div className="flex justify-center py-8">
                    <svg className="animate-spin h-5 w-5 text-indigo-300" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  </div>
                ) : preguntas.length === 0 ? (
                  <p className="text-center text-slate-300 text-sm py-8">Sin preguntas — agrega la primera</p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {preguntas.map((p, i) => (
                      <div key={p.id} className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black text-white mt-0.5"
                            style={{ background: 'linear-gradient(135deg,#143875,#143875)' }}>
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{p.enunciado}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: '#EFF3FA', color: '#0B2447' }}>
                                {p.tipo === 'opcion_multiple' ? 'Opción múltiple' : p.tipo === 'verdadero_falso' ? 'V/F' : 'Texto corto'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-semibold">{p.puntos} pt{p.puntos !== 1 ? 's' : ''}</span>
                            </div>
                            {p.opciones.length > 0 && (
                              <div className="mt-2 flex flex-col gap-1">
                                {p.opciones.map(o => (
                                  <div key={o.id} className="flex items-center gap-2">
                                    <span className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center"
                                      style={o.es_correcta
                                        ? { background: '#059669' }
                                        : { background: '#e2e8f0' }}>
                                      {o.es_correcta && <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                                    </span>
                                    <span className="text-xs text-slate-600">{o.texto}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <button onClick={() => eliminarPregunta(p.id)}
                            className="shrink-0 text-slate-200 hover:text-red-400 transition-colors mt-0.5">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Panel de resultados */}
            {verResultados && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                <div className="px-5 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <p className="font-black text-slate-800">{verResultados.titulo}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Resultados de alumnos</p>
                </div>
                {loadingInts ? (
                  <div className="flex justify-center py-8">
                    <svg className="animate-spin h-5 w-5 text-indigo-300" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  </div>
                ) : intentos.length === 0 ? (
                  <p className="text-center text-slate-300 text-sm py-8">Ningún alumno ha rendido este examen aún</p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {intentos.map((it, i) => (
                      <div key={it.id} className="flex items-center gap-4 px-5 py-3">
                        <span className="text-[10px] font-black text-slate-300 w-5 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">
                            {it.alumnos ? displayAlumno(it.alumnos) : '—'}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {it.finalizado_at
                              ? `Finalizado ${new Date(it.finalizado_at).toLocaleDateString('es-PE', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}`
                              : 'En progreso…'}
                          </p>
                        </div>
                        <div className="text-center shrink-0">
                          <p className="text-xl font-black" style={{ color: notaColor(it.nota) }}>
                            {it.nota !== null ? it.nota.toFixed(1) : '—'}
                          </p>
                          {it.nota !== null && (
                            <p className="text-[10px] font-bold" style={{ color: notaColor(it.nota) }}>
                              {it.nota >= 18 ? 'AD' : it.nota >= 14 ? 'A' : it.nota >= 11 ? 'B' : 'C'}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Placeholder vacío */}
            {!examenAbierto && !verResultados && (
              <div className="rounded-2xl flex flex-col items-center justify-center py-16 gap-3"
                style={{ background: 'white', border: '1.5px dashed #E4E8EF' }}>
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#b6c5e3" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                </svg>
                <p className="text-slate-300 text-sm font-semibold">Selecciona un examen para editarlo</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal confirmar eliminación de examen ── */}
      {confirmEliminarId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
          <div className="rounded-2xl p-6 max-w-sm w-full mx-4"
            style={{ background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: '#fef2f2' }}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </div>
            <h3 className="text-base font-black text-slate-800 text-center mb-1">¿Eliminar examen?</h3>
            <p className="text-sm text-slate-500 text-center mb-5">
              Se perderán todas las preguntas y resultados de alumnos. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmEliminarId(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600"
                style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0' }}>
                Cancelar
              </button>
              <button onClick={() => eliminarExamen(confirmEliminarId)}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white"
                style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
      {dialogo}
    </div>
  )
}
