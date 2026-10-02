'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getSesion } from '@/lib/auth'
import { BUCKET_ENTREGAS, signedUrl } from '@/lib/storage'
import Spinner from '@/components/Spinner'
import { formatFechaLong as formatFecha } from '@/utils/formatters'
import type { Tarea, Sesion, Unidad } from '@/types'

const BUCKET = BUCKET_ENTREGAS

interface Curso {
  nombre: string
  color: string
}

interface MiEntrega {
  id: string
  url: string
  tipo: string
  nombre_archivo: string | null
  comentario: string | null
  entregado_at: string
  calificaciones: { nota: number; comentario: string | null }[] | null
}


export default function TareaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [loading,   setLoading]   = useState(true)
  const [alumnoId,  setAlumnoId]  = useState<string | null>(null)
  const [tarea,     setTarea]     = useState<Tarea | null>(null)
  const [sesion,    setSesion]    = useState<Sesion | null>(null)
  const [unidad,    setUnidad]    = useState<Unidad | null>(null)
  const [curso,     setCurso]     = useState<Curso | null>(null)
  const [entrega,   setEntrega]   = useState<MiEntrega | null>(null)
  const [entregaUrl, setEntregaUrl] = useState<string | null>(null) // URL firmada si la entrega es archivo
  const [asigId,    setAsigId]    = useState<string | null>(null)

  // form entrega
  const [tipoEnt,   setTipoEnt]   = useState<'archivo' | 'link'>('archivo')
  const [linkEnt,   setLinkEnt]   = useState('')
  const [comentEnt, setComentEnt] = useState('')
  const [archivo,   setArchivo]   = useState<File | null>(null)
  const [progreso,  setProgreso]  = useState(0)
  const [subiendo,  setSubiendo]  = useState(false)
  const [errorEnt,  setErrorEnt]  = useState('')
  const [modoForm,  setModoForm]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      const user = await getSesion()
      if (!user) { router.push('/login'); return }
      setAlumnoId(user.id)

      const { data: t } = await supabase
        .from('tareas').select('id,titulo,descripcion,fecha_limite,max_puntos,sesion_id')
        .eq('id', id).maybeSingle()
      if (!t) { router.push('/alumno'); return }
      setTarea(t as Tarea)

      const { data: s } = await supabase
        .from('sesiones').select('id,titulo,descripcion,unidad_id')
        .eq('id', (t as Tarea).sesion_id).maybeSingle()
      setSesion(s as Sesion | null)

      if (s) {
        const { data: u } = await supabase
          .from('unidades').select('id,nombre,asignacion_id')
          .eq('id', (s as Sesion).unidad_id).maybeSingle()
        setUnidad(u as Unidad | null)

        if (u) {
          setAsigId((u as Unidad).asignacion_id ?? null)
          const { data: a } = await supabase
            .from('asignaciones').select('cursos(nombre,color)')
            .eq('id', (u as Unidad).asignacion_id).maybeSingle()
          const c = (a as unknown as { cursos: Curso | null } | null)?.cursos
          if (c) setCurso(c)
        }
      }

      const { data: e } = await supabase
        .from('entregas')
        .select('id,url,tipo,nombre_archivo,comentario,entregado_at,calificaciones(nota,comentario)')
        .eq('tarea_id', id).eq('alumno_id', user.id).maybeSingle()
      const ent = e as MiEntrega | null
      setEntrega(ent)
      if (ent?.tipo === 'archivo') setEntregaUrl(await signedUrl(BUCKET, ent.url))

      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleEntregar() {
    if (!alumnoId || !tarea) return
    setErrorEnt('')

    if (tipoEnt === 'link') {
      if (!linkEnt.trim()) { setErrorEnt('Pega el enlace de tu entrega.'); return }
      setSubiendo(true)
      const { error } = await supabase.from('entregas').upsert({
        tarea_id: tarea.id, alumno_id: alumnoId,
        url: linkEnt.trim(), tipo: 'link', nombre_archivo: null,
        comentario: comentEnt.trim() || null, entregado_at: new Date().toISOString(),
      }, { onConflict: 'tarea_id,alumno_id' })
      if (error) { setErrorEnt('Error al guardar la entrega.'); setSubiendo(false); return }
    } else {
      if (!archivo) { setErrorEnt('Selecciona un archivo.'); return }
      setSubiendo(true)
      const path = `${alumnoId}/${tarea.id}/${Date.now()}_${archivo.name.replace(/\s+/g, '_')}`
      setProgreso(30)
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, archivo, { upsert: true })
      if (upErr) { setErrorEnt('Error al subir el archivo.'); setSubiendo(false); setProgreso(0); return }
      setProgreso(100)
      // Guardamos el PATH del objeto; se firma al momento de abrirlo.
      const { error } = await supabase.from('entregas').upsert({
        tarea_id: tarea.id, alumno_id: alumnoId,
        url: path, tipo: 'archivo', nombre_archivo: archivo.name,
        comentario: comentEnt.trim() || null, entregado_at: new Date().toISOString(),
      }, { onConflict: 'tarea_id,alumno_id' })
      if (error) { setErrorEnt('Error al registrar la entrega.'); setSubiendo(false); setProgreso(0); return }
    }

    const { data: nueva } = await supabase
      .from('entregas')
      .select('id,url,tipo,nombre_archivo,comentario,entregado_at,calificaciones(nota,comentario)')
      .eq('tarea_id', tarea.id).eq('alumno_id', alumnoId).maybeSingle()
    const ent = nueva as MiEntrega | null
    setEntrega(ent)
    setEntregaUrl(ent?.tipo === 'archivo' ? await signedUrl(BUCKET, ent.url) : null)
    setModoForm(false); setArchivo(null); setLinkEnt(''); setComentEnt('')
    setSubiendo(false); setProgreso(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (loading || !tarea) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size={28} color="#0d9488" />
      </div>
    )
  }

  const color     = curso?.color ?? '#143875'
  const vencida   = tarea.fecha_limite && new Date(tarea.fecha_limite) < new Date()
  const cal       = entrega?.calificaciones?.[0] ?? null
  const notaColor = cal == null ? '#94a3b8' : cal.nota >= 14 ? '#16a34a' : cal.nota >= 11 ? '#d97706' : '#dc2626'

  return (
    <div className="space-y-4 max-w-5xl">

      {/* ── Breadcrumb ── */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-teal-600 transition-colors">
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
        </svg>
        Volver
      </button>

      {/* ── Header tarea ── */}
      <div className="rounded-2xl px-5 py-4"
        style={{ background: `linear-gradient(135deg, ${color}ee, ${color}99)` }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {curso && (
              <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-1">
                {curso.nombre}
                {sesion && <> · {sesion.titulo}</>}
              </p>
            )}
            <h1 className="text-white font-black text-lg leading-tight">{tarea.titulo}</h1>
          </div>
          {cal && (
            <div className="shrink-0 flex flex-col items-end">
              <span className="text-3xl font-black text-white">{cal.nota}</span>
              <span className="text-white/60 text-xs">de {tarea.max_puntos} pts</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Layout dos columnas ── */}
      <div className="flex gap-5 items-start flex-col lg:flex-row">

        {/* ── IZQUIERDA: detalles ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Metadatos */}
          <div className="rounded-2xl bg-white p-5 space-y-4" style={{ border: '1.5px solid #ccfbf1' }}>
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">Detalles</h2>

            <div className="grid grid-cols-2 gap-3">
              {/* Fecha límite */}
              <div className="rounded-xl p-3" style={{ background: vencida ? '#fef2f2' : '#f8fafc', border: `1px solid ${vencida ? '#fecaca' : '#e2e8f0'}` }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: vencida ? '#ef4444' : '#94a3b8' }}>Fecha límite</p>
                {tarea.fecha_limite ? (
                  <p className="text-xs font-bold" style={{ color: vencida ? '#ef4444' : '#334155' }}>
                    {formatFecha(tarea.fecha_limite)}
                    {vencida && <span className="ml-2 text-[9px] font-black bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full">VENCIDA</span>}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 font-semibold">Sin fecha límite</p>
                )}
              </div>

              {/* Puntos */}
              <div className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Puntuación</p>
                <p className="text-xs font-bold text-slate-700">{tarea.max_puntos} puntos</p>
              </div>
            </div>

            {/* Descripción */}
            {tarea.descripcion && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Instrucciones</p>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{tarea.descripcion}</p>
              </div>
            )}

            {/* Contexto sesión / unidad */}
            {(sesion || unidad) && (
              <div className="pt-3 space-y-1.5" style={{ borderTop: '1px solid #f1f5f9' }}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contexto</p>
                {unidad && (
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                    <p className="text-xs text-slate-500 font-semibold">Unidad: {unidad.nombre}</p>
                  </div>
                )}
                {sesion && (
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    <p className="text-xs text-slate-500 font-semibold">Sesión: {sesion.titulo}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Botón ver curso completo */}
          {asigId && (
            <button onClick={() => router.push(`/alumno/cursos/${asigId}`)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-colors"
              style={{ background: `${color}12`, color, border: `1.5px solid ${color}30` }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
              </svg>
              Ver curso completo
            </button>
          )}
        </div>

        {/* ── DERECHA: entrega ── */}
        <div className="w-full lg:w-80 shrink-0 space-y-3" style={{ position: 'sticky', top: '24px' }}>
          <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1.5px solid #b6c5e3', boxShadow: '0 4px 16px rgba(11,36,71,.06)' }}>

            {/* Header */}
            <div className="h-1" style={{ background: 'linear-gradient(90deg,#143875,#818cf8)' }} />
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid #EFF3FA' }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#143875" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
              <h2 className="text-sm font-black text-slate-700">Mi entrega</h2>
              {entrega && !cal && (
                <span className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#143875' }}>
                  Entregado
                </span>
              )}
              {cal && (
                <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: notaColor }}>
                  {cal.nota}/{tarea.max_puntos}
                </span>
              )}
            </div>

            <div className="p-4 space-y-3">

              {/* Sin entrega aún */}
              {!entrega && !modoForm && (
                <div className="text-center py-4 space-y-3">
                  <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
                    style={{ background: '#EFF3FA', border: '1.5px dashed #b6c5e3' }}>
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#143875" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                    </svg>
                  </div>
                  <p className="text-xs text-slate-400 font-semibold">Aún no has entregado esta tarea</p>
                  <button onClick={() => setModoForm(true)}
                    className="w-full py-2.5 rounded-xl text-xs font-black text-white transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#143875,#818cf8)' }}>
                    Entregar tarea
                  </button>
                </div>
              )}

              {/* Entrega existente */}
              {entrega && !modoForm && (
                <div className="space-y-3">
                  <a href={(entrega.tipo === 'archivo' ? entregaUrl : entrega.url) || undefined} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-3 rounded-xl transition-colors hover:opacity-90"
                    style={{ background: cal ? '#f0fdf4' : '#EFF3FA', border: `1px solid ${cal ? '#bbf7d0' : '#b6c5e3'}` }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: cal ? '#dcfce7' : '#E4E8EF' }}>
                      {entrega.tipo === 'link' ? (
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={cal ? '#16a34a' : '#143875'} strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                        </svg>
                      ) : (
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={cal ? '#16a34a' : '#143875'} strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate" style={{ color: cal ? '#16a34a' : '#143875' }}>
                        {entrega.nombre_archivo ?? 'Ver entrega →'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(entrega.entregado_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </a>

                  {entrega.comentario && (
                    <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Tu comentario</p>
                      <p className="text-xs text-slate-600 italic">&ldquo;{entrega.comentario}&rdquo;</p>
                    </div>
                  )}

                  {/* Calificación */}
                  {cal && (
                    <div className="rounded-xl p-4 text-center space-y-1"
                      style={{ background: cal.nota >= 14 ? '#f0fdf4' : cal.nota >= 11 ? '#fffbeb' : '#fef2f2', border: `1px solid ${cal.nota >= 14 ? '#bbf7d0' : cal.nota >= 11 ? '#fde68a' : '#fecaca'}` }}>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: notaColor }}>Calificación</p>
                      <p className="text-4xl font-black" style={{ color: notaColor }}>{cal.nota}</p>
                      <p className="text-xs font-semibold text-slate-400">de {tarea.max_puntos} puntos</p>
                      {cal.comentario && (
                        <p className="text-xs text-slate-500 italic mt-2 pt-2 border-t border-slate-100">
                          &ldquo;{cal.comentario}&rdquo;
                        </p>
                      )}
                    </div>
                  )}

                  {!cal && (
                    <button onClick={() => { setModoForm(true); setTipoEnt('archivo'); setLinkEnt(''); setComentEnt(''); setArchivo(null); setErrorEnt('') }}
                      className="w-full py-2 rounded-xl text-xs font-black transition-colors"
                      style={{ background: 'white', color: '#143875', border: '1.5px dashed #b6c5e3' }}>
                      Reemplazar entrega
                    </button>
                  )}
                </div>
              )}

              {/* Formulario de entrega */}
              {modoForm && (
                <div className="space-y-3">
                  {/* Tipo */}
                  <div className="flex gap-2">
                    {(['archivo', 'link'] as const).map(tp => (
                      <button key={tp} onClick={() => setTipoEnt(tp)}
                        className="flex-1 py-1.5 rounded-xl text-xs font-black transition-all"
                        style={tipoEnt === tp
                          ? { background: '#143875', color: 'white' }
                          : { background: '#f5f7ff', color: '#94a3b8', border: '1px solid #E4E8EF' }}>
                        {tp === 'archivo' ? 'Subir archivo' : 'Pegar enlace'}
                      </button>
                    ))}
                  </div>

                  {/* Input */}
                  {tipoEnt === 'archivo' ? (
                    <>
                      <input ref={fileRef} type="file" className="hidden"
                        onChange={e => setArchivo(e.target.files?.[0] ?? null)} />
                      <button onClick={() => fileRef.current?.click()}
                        className="w-full py-6 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-2 transition-colors"
                        style={{ background: '#f5f7ff', border: '2px dashed #b6c5e3', color: '#143875' }}>
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                        </svg>
                        {archivo ? (
                          <span className="font-black text-center px-2 leading-snug break-all">{archivo.name}</span>
                        ) : (
                          <span>Haz clic para seleccionar un archivo</span>
                        )}
                      </button>
                    </>
                  ) : (
                    <input
                      className="w-full px-3 py-2.5 rounded-xl text-xs text-slate-800 placeholder-slate-300 outline-none border focus:border-indigo-400"
                      style={{ borderColor: '#E4E8EF', background: '#f5f7ff' }}
                      placeholder="https://…"
                      value={linkEnt}
                      onChange={e => setLinkEnt(e.target.value)}
                    />
                  )}

                  {/* Comentario */}
                  <input
                    className="w-full px-3 py-2.5 rounded-xl text-xs text-slate-800 placeholder-slate-300 outline-none border focus:border-indigo-400"
                    style={{ borderColor: '#E4E8EF', background: '#f5f7ff' }}
                    placeholder="Comentario (opcional)"
                    value={comentEnt}
                    onChange={e => setComentEnt(e.target.value)}
                  />

                  {/* Barra de progreso */}
                  {progreso > 0 && progreso < 100 && (
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${progreso}%`, background: 'linear-gradient(90deg,#143875,#818cf8)' }} />
                    </div>
                  )}

                  {errorEnt && (
                    <p className="text-xs font-bold text-red-500 flex items-center gap-1">
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                      </svg>
                      {errorEnt}
                    </p>
                  )}

                  {/* Acciones */}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setModoForm(false); setErrorEnt(''); setProgreso(0) }}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                      Cancelar
                    </button>
                    <button onClick={handleEntregar} disabled={subiendo}
                      className="flex-1 py-2.5 rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#143875,#818cf8)' }}>
                      {subiendo && <Spinner size={12} color="white" />}
                      {subiendo ? 'Enviando…' : 'Entregar'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
