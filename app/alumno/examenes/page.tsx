'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { getSesionAlumno } from '@/lib/auth'

/* ── Tipos ─────────────────────────────────────────────────────── */
interface Opcion {
  id: string
  texto: string
  orden: number
  es_correcta?: boolean
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
  asignaciones: { cursos: { nombre: string; color: string } | null } | null
  sesiones?: { titulo: string; unidades: { nombre: string } | null } | null
}
interface Intento {
  id: string
  examen_id: string
  finalizado_at: string | null
  nota: number | null
}
type RespuestasMap = Record<string, string> // pregunta_id → opcion_id | texto

/* ── Helpers ───────────────────────────────────────────────────── */
function notaColor(n: number) {
  if (n >= 18) return '#059669'
  if (n >= 14) return '#2563eb'
  if (n >= 11) return '#d97706'
  return '#dc2626'
}
function notaLetra(n: number) {
  if (n >= 18) return 'AD'
  if (n >= 14) return 'A'
  if (n >= 11) return 'B'
  return 'C'
}
function isoToLocal(iso: string) {
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function estaVencido(ex: Examen) {
  return ex.fecha_limite ? new Date(ex.fecha_limite) < new Date() : false
}

/* ── Componente ────────────────────────────────────────────────── */
export default function ExamenesAlumno() {
  const [uid,         setUid]         = useState('')
  const [grado,       setGrado]       = useState('')
  const [grupo,       setGrupo]       = useState('')
  const [examenes,    setExamenes]    = useState<Examen[]>([])
  const [intentosMap, setIntentosMap] = useState<Record<string, Intento>>({})
  const [loading,     setLoading]     = useState(true)

  // Tomar examen
  const [examenActivo,  setExamenActivo]  = useState<Examen | null>(null)
  const [preguntas,     setPreguntas]     = useState<Pregunta[]>([])
  const [respuestas,    setRespuestas]    = useState<RespuestasMap>({})
  const [intentoId,     setIntentoId]     = useState('')
  const [loadingEx,     setLoadingEx]     = useState(false)
  const [enviando,      setEnviando]      = useState(false)
  const [enviado,       setEnviado]       = useState(false)
  const [resultado,     setResultado]     = useState<{ nota: number; correctas: number; total: number } | null>(null)
  const [segundos,      setSegundos]      = useState<number | null>(null)
  const [pregActual,    setPregActual]    = useState(0)

  /* ── Init ─────────────────────────────────────────────────────── */
  useEffect(() => {
    async function init() {
      const sesion = await getSesionAlumno<{ grado: string; grupo: string }>('grado,grupo')
      if (!sesion) return
      const { user, alumno } = sesion
      setUid(user.id)
      setGrado(alumno.grado); setGrupo(alumno.grupo)

      // Exámenes publicados del grado/grupo (solo del ciclo activo)
      const cicloId = (await getCicloActivo())?.id ?? null
      let asigsQ = supabase
        .from('asignaciones').select('id').eq('grado', alumno.grado).eq('grupo', alumno.grupo)
      if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
      const { data: asigs } = await asigsQ
      const asigIds = (asigs ?? []).map(a => a.id)
      if (!asigIds.length) { setLoading(false); return }

      const { data: exs } = await supabase
        .from('examenes')
        .select('id,asignacion_id,sesion_id,titulo,descripcion,fecha_limite,duracion_minutos,asignaciones(cursos(nombre,color)),sesiones(titulo,unidades(nombre))')
        .eq('publicado', true)
        .in('asignacion_id', asigIds)
        .order('created_at', { ascending: false })
      const lista = (exs ?? []) as unknown as Examen[]
      setExamenes(lista)

      // Intentos del alumno
      if (lista.length) {
        const { data: ints } = await supabase
          .from('intentos').select('id,examen_id,finalizado_at,nota').eq('alumno_id', user.id)
        const map: Record<string, Intento> = {}
        for (const it of ints ?? []) map[it.examen_id] = it
        setIntentosMap(map)
      }
      setLoading(false)
    }
    init()
  }, [])

  /* ── Cronómetro ───────────────────────────────────────────────── */
  useEffect(() => {
    if (segundos === null || segundos <= 0) return
    const t = setInterval(() => setSegundos(s => (s !== null && s > 0) ? s - 1 : 0), 1000)
    return () => clearInterval(t)
  }, [segundos])

  useEffect(() => {
    if (segundos === 0 && examenActivo && !enviado) enviarExamen()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segundos])

  /* ── Iniciar examen ───────────────────────────────────────────── */
  async function iniciarExamen(ex: Examen) {
    setLoadingEx(true); setEnviado(false); setResultado(null)
    setRespuestas({}); setPregActual(0)

    // Crear o recuperar intento
    let intId = intentosMap[ex.id]?.id
    if (!intId) {
      const { data: it } = await supabase.from('intentos')
        .insert({ examen_id: ex.id, alumno_id: uid }).select().single()
      intId = it?.id
      if (!intId) { setLoadingEx(false); return }
      setIntentosMap(prev => ({ ...prev, [ex.id]: { id: intId!, examen_id: ex.id, finalizado_at: null, nota: null } }))
    }
    setIntentoId(intId)

    // Cargar preguntas
    const { data: px } = await supabase
      .from('preguntas').select('id,tipo,enunciado,puntos,orden')
      .eq('examen_id', ex.id).order('orden')
    const ids = (px ?? []).map(p => p.id)
    const opcMap: Record<string, Opcion[]> = {}
    if (ids.length) {
      const { data: opts } = await supabase
        .from('opciones').select('id,pregunta_id,texto,orden,es_correcta').in('pregunta_id', ids).order('orden')
      for (const o of opts ?? []) {
        if (!opcMap[o.pregunta_id]) opcMap[o.pregunta_id] = []
        opcMap[o.pregunta_id].push(o)
      }
    }
    setPreguntas((px ?? []).map(p => ({ ...p, opciones: opcMap[p.id] ?? [] })) as Pregunta[])

    // Recuperar respuestas previas si el intento ya existe
    const { data: resps } = await supabase
      .from('respuestas').select('pregunta_id,opcion_id,texto_respuesta').eq('intento_id', intId)
    const rmap: RespuestasMap = {}
    for (const r of resps ?? []) rmap[r.pregunta_id] = r.opcion_id ?? r.texto_respuesta ?? ''
    setRespuestas(rmap)

    // Cronómetro
    if (ex.duracion_minutos) setSegundos(ex.duracion_minutos * 60)
    else setSegundos(null)

    setExamenActivo(ex)
    setLoadingEx(false)
  }

  /* ── Enviar examen ────────────────────────────────────────────── */
  async function enviarExamen() {
    if (enviando) return
    setEnviando(true)

    let correctas = 0
    let totalPuntos = 0
    let puntosObtenidos = 0

    // Calcular nota y guardar respuestas
    const rows = preguntas.map(p => {
      const resp = respuestas[p.id] ?? ''
      totalPuntos += p.puntos
      let esCorrecta: boolean | null = null
      let ptsObtenidos = 0

      if (p.tipo !== 'texto_corto') {
        const opcCorrecta = p.opciones.find(o => o.es_correcta)
        esCorrecta = opcCorrecta?.id === resp
        if (esCorrecta) { correctas++; ptsObtenidos = p.puntos; puntosObtenidos += p.puntos }
      }

      return {
        intento_id: intentoId,
        pregunta_id: p.id,
        opcion_id: (p.tipo !== 'texto_corto' && resp) ? resp : null,
        texto_respuesta: p.tipo === 'texto_corto' ? (resp || null) : null,
        es_correcta: esCorrecta,
        puntos_obtenidos: ptsObtenidos,
      }
    })

    // Upsert respuestas
    await supabase.from('respuestas').upsert(rows, { onConflict: 'intento_id,pregunta_id' })

    // Nota sobre 20
    const nota = totalPuntos > 0 ? Math.round((puntosObtenidos / totalPuntos) * 20 * 10) / 10 : 0
    await supabase.from('intentos').update({ finalizado_at: new Date().toISOString(), nota })
      .eq('id', intentoId)

    setIntentosMap(prev => ({
      ...prev,
      [examenActivo!.id]: { ...prev[examenActivo!.id], finalizado_at: new Date().toISOString(), nota },
    }))
    setResultado({ nota, correctas, total: preguntas.filter(p => p.tipo !== 'texto_corto').length })
    setEnviado(true)
    setSegundos(null)
    setEnviando(false)
  }

  /* ── Estado de un examen ──────────────────────────────────────── */
  function estadoExamen(ex: Examen): 'completado' | 'vencido' | 'pendiente' {
    const it = intentosMap[ex.id]
    if (it?.finalizado_at) return 'completado'
    if (estaVencido(ex)) return 'vencido'
    return 'pendiente'
  }

  const formatSeg = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <svg className="animate-spin h-7 w-7 text-teal-400" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    </div>
  )

  /* ── Vista: tomando examen ────────────────────────────────────── */
  if (examenActivo && !enviado) {
    const px = preguntas[pregActual]

    return (
      <div className="max-w-2xl mx-auto">
        {/* Header examen */}
        <div className="rounded-2xl px-5 py-4 mb-5 flex items-center justify-between"
          style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
          <div className="min-w-0 flex-1">
            <p className="font-black text-slate-800 truncate">{examenActivo.titulo}</p>
            <p className="text-xs text-teal-500 font-semibold mt-0.5">
              Pregunta {pregActual + 1} de {preguntas.length}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-3">
            {segundos !== null && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                style={segundos < 120
                  ? { background: '#fef2f2', border: '1.5px solid #fecaca' }
                  : { background: '#f0fdf4', border: '1.5px solid #bbf7d0' }}>
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={segundos < 120 ? '#dc2626' : '#059669'} strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span className="text-xs font-black tabular-nums" style={{ color: segundos < 120 ? '#dc2626' : '#059669' }}>
                  {formatSeg(segundos)}
                </span>
              </div>
            )}
            <button onClick={() => setExamenActivo(null)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">
              Salir
            </button>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="h-1.5 rounded-full mb-5" style={{ background: '#e2e8f0' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${((pregActual + 1) / preguntas.length) * 100}%`, background: 'linear-gradient(90deg,#0F766E,#14B8A6)' }} />
        </div>

        {px && (
          <div className="rounded-2xl px-5 py-5 mb-4" style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
            <div className="flex items-start gap-3 mb-4">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-black text-white mt-0.5"
                style={{ background: 'linear-gradient(135deg,#0F766E,#14B8A6)' }}>
                {pregActual + 1}
              </span>
              <p className="text-slate-800 font-semibold text-base leading-snug flex-1">{px.enunciado}</p>
            </div>

            {px.tipo === 'texto_corto' ? (
              <textarea
                placeholder="Escribe tu respuesta aquí…"
                value={respuestas[px.id] ?? ''}
                onChange={e => setRespuestas(prev => ({ ...prev, [px.id]: e.target.value }))}
                rows={4}
                className="w-full rounded-xl px-4 py-3 text-sm text-slate-700 outline-none resize-none"
                style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {px.opciones.map(o => {
                  const sel = respuestas[px.id] === o.id
                  return (
                    <button key={o.id} onClick={() => setRespuestas(prev => ({ ...prev, [px.id]: o.id }))}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                      style={sel
                        ? { background: '#f0fdfa', border: '2px solid #0d9488' }
                        : { background: '#F6F8FB', border: '1.5px solid #e2e8f0' }}>
                      <span className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center transition-all"
                        style={sel
                          ? { background: '#0d9488', border: '2px solid #0d9488' }
                          : { background: 'white', border: '2px solid #cbd5e1' }}>
                        {sel && <div className="w-2 h-2 rounded-full bg-white" />}
                      </span>
                      <span className="text-sm text-slate-700 font-medium">{o.texto}</span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-slate-400 font-semibold">{px.puntos} pt{px.puntos !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}

        {/* Navegación */}
        <div className="flex items-center gap-3">
          <button onClick={() => setPregActual(v => Math.max(0, v - 1))} disabled={pregActual === 0}
            className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ background: '#f1f5f9', color: pregActual === 0 ? '#cbd5e1' : '#64748b' }}>
            ← Anterior
          </button>

          {pregActual < preguntas.length - 1 ? (
            <button onClick={() => setPregActual(v => Math.min(preguntas.length - 1, v + 1))}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#0F766E,#14B8A6)' }}>
              Siguiente →
            </button>
          ) : (
            <button onClick={enviarExamen} disabled={enviando}
              className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#059669,#0d9488)', opacity: enviando ? 0.7 : 1 }}>
              {enviando ? 'Enviando…' : 'Enviar examen ✓'}
            </button>
          )}
        </div>

        {/* Mini mapa de preguntas */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {preguntas.map((p, i) => (
            <button key={p.id} onClick={() => setPregActual(i)}
              className="w-8 h-8 rounded-lg text-xs font-bold transition-all"
              style={i === pregActual
                ? { background: '#0d9488', color: 'white' }
                : respuestas[p.id]
                ? { background: '#d1fae5', color: '#059669' }
                : { background: '#f1f5f9', color: '#94a3b8' }}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    )
  }

  /* ── Vista: resultado ─────────────────────────────────────────── */
  if (examenActivo && enviado && resultado) {
    return (
      <div className="max-w-md mx-auto text-center">
        <div className="rounded-2xl px-6 py-8" style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: `${notaColor(resultado.nota)}15`, border: `2px solid ${notaColor(resultado.nota)}40` }}>
            <p className="text-3xl font-black" style={{ color: notaColor(resultado.nota) }}>
              {resultado.nota.toFixed(1)}
            </p>
          </div>
          <p className="text-lg font-black text-slate-800 mb-1">{examenActivo.titulo}</p>
          <p className="text-2xl font-black mb-2" style={{ color: notaColor(resultado.nota) }}>
            {notaLetra(resultado.nota)}
          </p>
          <p className="text-sm text-slate-500 mb-6">
            {resultado.correctas} correctas de {resultado.total} preguntas con corrección automática
            {preguntas.some(p => p.tipo === 'texto_corto') && ' · Las preguntas de texto se califican manualmente'}
          </p>
          <button onClick={() => { setExamenActivo(null); setEnviado(false) }}
            className="w-full py-3 rounded-xl text-sm font-black text-white"
            style={{ background: 'linear-gradient(135deg,#0F766E,#14B8A6)' }}>
            Volver a exámenes
          </button>
        </div>
      </div>
    )
  }

  /* ── Vista: lista de exámenes ─────────────────────────────────── */
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-black text-slate-800">Mis Exámenes</h1>
        <p className="text-slate-400 text-xs mt-0.5">{grado} &quot;{grupo}&quot;</p>
      </div>

      {examenes.length === 0 ? (
        <div className="rounded-2xl p-12 text-center"
          style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
          <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#99f6e4" strokeWidth="1.5" className="mx-auto mb-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
          <p className="text-slate-400 text-sm">No hay exámenes publicados aún</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {examenes.map(ex => {
            const estado = estadoExamen(ex)
            const intento = intentosMap[ex.id]
            const curso = (ex.asignaciones as unknown as { cursos: { nombre: string; color: string } | null } | null)?.cursos

            return (
              <div key={ex.id} className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1.5px solid #e2e8f0' }}>
                <div className="flex items-start gap-4 px-5 py-4">
                  {/* Color curso */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${curso?.color ?? '#143875'}15` }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={curso?.color ?? '#143875'} strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{ex.titulo}</p>
                        {curso && <p className="text-xs font-semibold mt-0.5" style={{ color: curso.color }}>{curso.nombre}</p>}
                        {(ex.sesiones?.unidades?.nombre || ex.sesiones?.titulo) && (
                          <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#94a3b8' }}>
                            {ex.sesiones.unidades?.nombre}{ex.sesiones.unidades?.nombre && ex.sesiones.titulo ? ' · ' : ''}{ex.sesiones.titulo}
                          </p>
                        )}
                        {ex.descripcion && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{ex.descripcion}</p>}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {ex.fecha_limite && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                              </svg>
                              {isoToLocal(ex.fecha_limite)}
                            </span>
                          )}
                          {ex.duracion_minutos && (
                            <span className="text-[10px] text-slate-400">{ex.duracion_minutos} min</span>
                          )}
                        </div>
                      </div>

                      {/* Badge estado */}
                      <span className="shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full"
                        style={
                          estado === 'completado'
                            ? { background: '#d1fae5', color: '#059669' }
                            : estado === 'vencido'
                            ? { background: '#fee2e2', color: '#dc2626' }
                            : { background: '#fef3c7', color: '#d97706' }
                        }>
                        {estado === 'completado' ? 'COMPLETADO' : estado === 'vencido' ? 'VENCIDO' : 'PENDIENTE'}
                      </span>
                    </div>

                    {/* Nota si completado */}
                    {estado === 'completado' && intento?.nota !== null && intento?.nota !== undefined && (
                      <div className="flex items-center gap-3 mt-3 px-3 py-2 rounded-xl"
                        style={{ background: `${notaColor(intento.nota)}10`, border: `1px solid ${notaColor(intento.nota)}30` }}>
                        <span className="text-2xl font-black" style={{ color: notaColor(intento.nota) }}>
                          {intento.nota.toFixed(1)}
                        </span>
                        <div>
                          <p className="text-xs font-black" style={{ color: notaColor(intento.nota) }}>
                            {notaLetra(intento.nota)}
                          </p>
                          <p className="text-[10px] text-slate-400">Nota obtenida</p>
                        </div>
                      </div>
                    )}

                    {/* Botón */}
                    {estado === 'pendiente' && (
                      <button onClick={() => iniciarExamen(ex)} disabled={loadingEx}
                        className="mt-3 w-full py-2.5 rounded-xl text-sm font-black text-white transition-all"
                        style={{ background: 'linear-gradient(135deg,#0F766E,#14B8A6)', opacity: loadingEx ? 0.7 : 1 }}>
                        {loadingEx ? 'Cargando…' : intento ? 'Continuar examen →' : 'Iniciar examen →'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
