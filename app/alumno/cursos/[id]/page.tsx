'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getSesionAlumno } from '@/lib/auth'
import { BUCKET_RECURSOS, BUCKET_ENTREGAS, signedUrl, signedUrlMap } from '@/lib/storage'
import Spinner from '@/components/Spinner'
import { formatFechaConHora as formatFecha } from '@/utils/formatters'
import type { Tarea, Asignacion, Unidad, Sesion } from '@/types'

type TipoRecurso = 'pdf' | 'link' | 'imagen' | 'video'

interface Recurso {
  id: string
  nombre: string
  tipo: TipoRecurso
  url: string
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

interface ExamenSesion {
  id: string
  titulo: string
  descripcion: string | null
  fecha_limite: string | null
  duracion_minutos: number | null
}

interface ProgresoCurso {
  total: number
  entregadas: number
  calificadas: number
  promedio: number | null
}

async function fetchProgresoCurso(alumnoId: string, asigId: string): Promise<ProgresoCurso> {
  const fallback: ProgresoCurso = { total: 0, entregadas: 0, calificadas: 0, promedio: null }
  const { data: unids } = await supabase
    .from('unidades').select('id').eq('asignacion_id', asigId)
  if (!unids?.length) return fallback
  const { data: sess } = await supabase
    .from('sesiones').select('id').in('unidad_id', unids.map(u => u.id))
  if (!sess?.length) return fallback
  const { data: tareas } = await supabase
    .from('tareas').select('id').in('sesion_id', sess.map(s => s.id))
  if (!tareas?.length) return fallback
  const { data: entregas } = await supabase
    .from('entregas')
    .select('tarea_id,calificaciones(nota)')
    .eq('alumno_id', alumnoId)
    .in('tarea_id', tareas.map(t => t.id))
  const notas: number[] = []
  let calificadas = 0
  for (const e of (entregas ?? []) as { tarea_id: string; calificaciones: { nota: number }[] | null }[]) {
    const nota = e.calificaciones?.[0]?.nota
    if (nota !== undefined) { calificadas++; notas.push(nota) }
  }
  return {
    total: tareas.length,
    entregadas: (entregas ?? []).length,
    calificadas,
    promedio: notas.length ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length * 10) / 10 : null,
  }
}

const TIPO_META: Record<TipoRecurso, { label: string; bg: string; color: string; border: string; icon: React.ReactNode }> = {
  pdf:    { label: 'PDF',    bg: '#fef2f2', color: '#dc2626', border: '#fecaca', icon: <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg> },
  imagen: { label: 'Imagen', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', icon: <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21"/></svg> },
  link:   { label: 'Enlace', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe', icon: <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg> },
  video:  { label: 'Video',  bg: '#fdf4ff', color: '#9333ea', border: '#e9d5ff', icon: <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> },
}

const BUCKET = BUCKET_ENTREGAS

function gradientFromColor(hex: string) {
  return `linear-gradient(135deg, ${hex}ee, ${hex}99)`
}



export default function AlumnoCursoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router  = useRouter()

  const [alumnoId,    setAlumnoId]    = useState<string | null>(null)
  const [asignacion,  setAsignacion]  = useState<Asignacion | null>(null)
  const [unidades,    setUnidades]    = useState<Unidad[]>([])
  const [sesiones,    setSesiones]    = useState<Record<string, Sesion[]>>({})
  const [expandidos,  setExpandidos]  = useState<Set<string>>(new Set())
  const [sesionSel,   setSesionSel]   = useState<Sesion | null>(null)
  const [stats,       setStats]       = useState<ProgresoCurso | null>(null)
  const [loading,     setLoading]     = useState(true)

  // Mobile tab
  const [mobTab, setMobTab] = useState<'nav' | 'content'>('nav')

  // Recursos por sesión (lazy)
  const [recursos,      setRecursos]      = useState<Record<string, Recurso[]>>({})
  const [cargandoRec,   setCargandoRec]   = useState(false)

  // URLs firmadas (path → URL temporal): archivos de recursos y de entregas
  const [recFirmados,   setRecFirmados]   = useState<Record<string, string>>({})
  const [entFirmadas,   setEntFirmadas]   = useState<Record<string, string>>({})

  // Tareas por sesión (lazy)
  const [tareas,        setTareas]        = useState<Record<string, Tarea[]>>({})
  const [entregas,      setEntregas]      = useState<Record<string, MiEntrega | null>>({})

  // Exámenes por sesión (lazy)
  const [examenesSesion, setExamenesSesion] = useState<Record<string, ExamenSesion[]>>({})
  const [intentosSesion, setIntentosSesion] = useState<Record<string, { finalizado_at: string | null; nota: number | null }>>({})
  const [cargandoTar,   setCargandoTar]   = useState(false)

  // Form entrega
  const [entregandoId, setEntregandoId] = useState<string | null>(null)
  const [tipoEnt,      setTipoEnt]      = useState<'archivo' | 'link'>('archivo')
  const [linkEnt,      setLinkEnt]      = useState('')
  const [comentEnt,    setComentEnt]    = useState('')
  const [archivoEnt,   setArchivoEnt]   = useState<File | null>(null)
  const [progreso,     setProgreso]     = useState(0)
  const [subiendo,     setSubiendo]     = useState(false)
  const [errorEnt,     setErrorEnt]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      const sesion = await getSesionAlumno<{ grado: string; grupo: string }>('grado,grupo')
      if (!sesion) { router.push('/login'); return }
      const { user, alumno } = sesion

      setAlumnoId(user.id)

      const { data: asig } = await supabase
        .from('asignaciones')
        .select('id, grado, grupo, anio, cursos(nombre, color)')
        .eq('id', id).eq('grado', alumno.grado).eq('grupo', alumno.grupo)
        .maybeSingle()

      if (!asig) { router.push('/alumno/cursos'); return }
      setAsignacion(asig as unknown as Asignacion)

      // Cargar unidades + todas las sesiones de una vez
      const { data: uData } = await supabase
        .from('unidades').select('id,nombre,descripcion,orden').eq('asignacion_id', id).order('orden')
      const uList = (uData ?? []) as Unidad[]
      setUnidades(uList)

      const sMap: Record<string, Sesion[]> = {}
      if (uList.length > 0) {
        const { data: sData } = await supabase
          .from('sesiones').select('id,unidad_id,titulo,descripcion,orden')
          .in('unidad_id', uList.map(u => u.id)).order('unidad_id').order('orden')
        for (const s of (sData ?? []) as Sesion[]) {
          if (!sMap[s.unidad_id]) sMap[s.unidad_id] = []
          sMap[s.unidad_id].push(s)
        }
        setSesiones(sMap)
        setExpandidos(new Set(uList.map(u => u.id)))
        // Seleccionar primera sesión
        const primera = (sData ?? [])[0] as Sesion | undefined
        if (primera) {
          setSesionSel(primera)
          cargarSesionContent(primera, user.id)
        }
      }

      setLoading(false)
      // Stats de progreso (no bloquea)
      fetchProgresoCurso(user.id, id).then(p => setStats(p))
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function cargarSesionContent(s: Sesion, aid: string) {
    // Recursos
    if (!recursos[s.id]) {
      setCargandoRec(true)
      const { data } = await supabase
        .from('recursos').select('id,nombre,tipo,url,orden').eq('sesion_id', s.id).order('orden')
      const recs = (data ?? []) as Recurso[]
      setRecursos(prev => ({ ...prev, [s.id]: recs }))
      // Firmar archivos de recursos (pdf/imagen); link/video llevan URL externa.
      const m = await signedUrlMap(BUCKET_RECURSOS, recs.filter(r => r.tipo === 'pdf' || r.tipo === 'imagen').map(r => r.url))
      setRecFirmados(prev => ({ ...prev, ...m }))
      setCargandoRec(false)
    }
    // Tareas
    if (!tareas[s.id]) {
      setCargandoTar(true)
      const { data: tData } = await supabase
        .from('tareas').select('id,titulo,descripcion,fecha_limite,max_puntos')
        .eq('sesion_id', s.id).order('created_at')
      const listaTareas = (tData ?? []) as Tarea[]
      setTareas(prev => ({ ...prev, [s.id]: listaTareas }))
      if (listaTareas.length > 0) {
        const { data: eData } = await supabase
          .from('entregas')
          .select('id,tarea_id,url,tipo,nombre_archivo,comentario,entregado_at,calificaciones(nota,comentario)')
          .eq('alumno_id', aid)
          .in('tarea_id', listaTareas.map(t => t.id))
        const map: Record<string, MiEntrega> = {}
        for (const e of (eData ?? []) as (MiEntrega & { tarea_id: string })[]) {
          map[e.tarea_id] = e
        }
        setEntregas(prev => ({ ...prev, ...map }))
        // Firmar entregas de tipo archivo (las de tipo link llevan URL externa).
        const em = await signedUrlMap(BUCKET, Object.values(map).filter(e => e.tipo === 'archivo').map(e => e.url))
        setEntFirmadas(prev => ({ ...prev, ...em }))
      }
      setCargandoTar(false)
    }
    // Exámenes de la sesión
    if (!examenesSesion[s.id]) {
      const { data: exData } = await supabase
        .from('examenes')
        .select('id,titulo,descripcion,fecha_limite,duracion_minutos')
        .eq('sesion_id', s.id)
        .eq('publicado', true)
        .order('created_at')
      const listaEx = (exData ?? []) as ExamenSesion[]
      setExamenesSesion(prev => ({ ...prev, [s.id]: listaEx }))
      if (listaEx.length > 0) {
        const { data: iData } = await supabase
          .from('intentos')
          .select('examen_id,finalizado_at,nota')
          .eq('alumno_id', aid)
          .in('examen_id', listaEx.map(e => e.id))
        const iMap: Record<string, { finalizado_at: string | null; nota: number | null }> = {}
        for (const i of (iData ?? []) as { examen_id: string; finalizado_at: string | null; nota: number | null }[]) {
          iMap[i.examen_id] = i
        }
        setIntentosSesion(prev => ({ ...prev, ...iMap }))
      }
    }
  }

  function seleccionarSesion(s: Sesion) {
    setSesionSel(s)
    setMobTab('content')
    setEntregandoId(null)
    if (alumnoId) cargarSesionContent(s, alumnoId)
  }

  async function handleEntregar(tareaId: string) {
    if (!alumnoId) return
    setErrorEnt('')

    if (tipoEnt === 'link') {
      if (!linkEnt.trim()) { setErrorEnt('Pega el enlace de tu entrega.'); return }
      setSubiendo(true)
      const { error } = await supabase.from('entregas').upsert({
        tarea_id: tareaId, alumno_id: alumnoId,
        url: linkEnt.trim(), tipo: 'link', nombre_archivo: null,
        comentario: comentEnt.trim() || null, entregado_at: new Date().toISOString(),
      }, { onConflict: 'tarea_id,alumno_id' })
      if (error) { setErrorEnt('Error al guardar la entrega.'); setSubiendo(false); return }
    } else {
      if (!archivoEnt) { setErrorEnt('Selecciona un archivo.'); return }
      setSubiendo(true)
      const path = `${alumnoId}/${tareaId}/${Date.now()}_${archivoEnt.name.replace(/\s+/g, '_')}`
      setProgreso(30)
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, archivoEnt, { upsert: true })
      if (upErr) { setErrorEnt('Error al subir el archivo.'); setSubiendo(false); setProgreso(0); return }
      setProgreso(100)
      // Guardamos el PATH del objeto; se firma al momento de abrirlo.
      const { error } = await supabase.from('entregas').upsert({
        tarea_id: tareaId, alumno_id: alumnoId,
        url: path, tipo: 'archivo', nombre_archivo: archivoEnt.name,
        comentario: comentEnt.trim() || null, entregado_at: new Date().toISOString(),
      }, { onConflict: 'tarea_id,alumno_id' })
      if (error) { setErrorEnt('Error al registrar la entrega.'); setSubiendo(false); setProgreso(0); return }
    }

    const { data: nueva } = await supabase
      .from('entregas')
      .select('id,url,tipo,nombre_archivo,comentario,entregado_at,calificaciones(nota,comentario)')
      .eq('tarea_id', tareaId).eq('alumno_id', alumnoId).maybeSingle()
    const ent = (nueva as unknown as MiEntrega) ?? null
    setEntregas(prev => ({ ...prev, [tareaId]: ent }))
    if (ent?.tipo === 'archivo') {
      const u = await signedUrl(BUCKET, ent.url)
      if (u) setEntFirmadas(prev => ({ ...prev, [ent.url]: u }))
    }
    setEntregandoId(null); setArchivoEnt(null); setLinkEnt(''); setComentEnt('')
    setSubiendo(false); setProgreso(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (loading || !asignacion) return null

  const color  = asignacion.cursos?.color ?? '#0d9488'
  const nombre = asignacion.cursos?.nombre ?? 'Curso'
  const notaColor = stats?.promedio == null ? '#94a3b8'
    : stats.promedio >= 14 ? '#16a34a'
    : stats.promedio >= 11 ? '#d97706'
    : '#dc2626'

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div>
        <button onClick={() => router.push('/alumno/cursos')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-teal-600 transition-colors mb-3">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
          Mis Cursos
        </button>

        <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
          style={{ background: gradientFromColor(color) }}>
          <div className="min-w-0">
            <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest">
              {asignacion.grado} · Sección {asignacion.grupo} · {asignacion.anio}
            </p>
            <h1 className="text-white font-black text-lg leading-tight mt-0.5 truncate">{nombre}</h1>
          </div>
          {stats && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div className="px-3 py-1.5 rounded-xl text-[11px] font-black text-white"
                style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.2)' }}>
                {stats.entregadas}/{stats.total} tareas
              </div>
              {stats.promedio != null && (
                <div className="px-3 py-1.5 rounded-xl text-[11px] font-black"
                  style={{ background: 'rgba(255,255,255,.9)', color: notaColor }}>
                  {stats.promedio} pts
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs móvil ── */}
      <div className="flex gap-2 lg:hidden">
        {(['nav', 'content'] as const).map(t => (
          <button key={t} onClick={() => setMobTab(t)}
            className="flex-1 py-2 rounded-xl text-xs font-black transition-all"
            style={mobTab === t
              ? { background: gradientFromColor(color), color: 'white' }
              : { background: 'white', color: '#64748b', border: '1.5px solid #ccfbf1' }}>
            {t === 'nav' ? 'Sesiones' : 'Contenido'}
          </button>
        ))}
      </div>

      {/* ── Dos paneles ── */}
      <div className="flex gap-4 items-start">

        {/* ── PANEL IZQUIERDO: navegador de sesiones ── */}
        <aside className={`w-60 shrink-0 ${mobTab === 'nav' ? 'block' : 'hidden'} lg:block`}
          style={{ position: 'sticky', top: '24px' }}>
          <div className="rounded-2xl border bg-white overflow-hidden flex flex-col"
            style={{ borderColor: '#ccfbf1', maxHeight: 'calc(100vh - 160px)' }}>

            {/* Header sidebar */}
            <div className="px-3 py-2.5 shrink-0 flex items-center gap-2"
              style={{ borderBottom: '1px solid #ccfbf1', background: `${color}08` }}>
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
              </svg>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sesiones</p>
            </div>

            {/* Sin unidades */}
            {unidades.length === 0 && (
              <div className="py-10 text-center px-4">
                <p className="text-xs text-slate-300 font-semibold">Sin contenido aún</p>
              </div>
            )}

            {/* Lista scroll */}
            <div className="overflow-y-auto flex-1 p-1.5">
              {unidades.map(u => {
                const expanded = expandidos.has(u.id)
                const listaS   = sesiones[u.id] ?? []

                return (
                  <div key={u.id} className="mb-0.5">
                    {/* Unidad header */}
                    <button
                      onClick={() => setExpandidos(prev => { const n = new Set(prev); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n })}
                      className="w-full flex items-center gap-1.5 px-2 py-2 rounded-xl hover:bg-teal-50/50 transition-colors text-left">
                      <span className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0"
                        style={{ background: `${color}15`, color }}>
                        {u.orden}
                      </span>
                      <span className="flex-1 text-[11px] font-black text-slate-700 truncate min-w-0">{u.nombre}</span>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={expanded ? color : '#cbd5e1'} strokeWidth="2.5"
                        className="shrink-0 transition-transform" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                      </svg>
                    </button>

                    {/* Sesiones */}
                    {expanded && (
                      <div className="ml-3 pl-2.5 mb-1 space-y-0.5" style={{ borderLeft: `2px solid ${color}18` }}>
                        {listaS.length === 0 && (
                          <p className="text-[10px] text-slate-300 py-1 pl-1">Sin sesiones</p>
                        )}
                        {listaS.map(s => (
                          <button key={s.id}
                            onClick={() => seleccionarSesion(s)}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-all"
                            style={sesionSel?.id === s.id
                              ? { background: `${color}12`, border: `1px solid ${color}25` }
                              : {}}>
                            <span className="text-[9px] font-black w-4 text-center shrink-0"
                              style={{ color: sesionSel?.id === s.id ? color : '#cbd5e1' }}>
                              {s.orden}
                            </span>
                            <span className="flex-1 text-[11px] font-semibold leading-snug truncate"
                              style={{ color: sesionSel?.id === s.id ? color : '#475569' }}>
                              {s.titulo}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* ── PANEL DERECHO: contenido de la sesión ── */}
        <div className={`flex-1 min-w-0 ${mobTab === 'content' ? 'block' : 'hidden'} lg:block`}>
          {!sesionSel ? (
            <div className="rounded-2xl border bg-white py-24 flex flex-col items-center justify-center gap-4"
              style={{ borderColor: '#ccfbf1' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: `${color}12`, border: `2px dashed ${color}30` }}>
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="1.5" strokeOpacity=".6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-black text-slate-500">Selecciona una sesión</p>
                <p className="text-xs text-slate-300 mt-1">El contenido aparecerá aquí</p>
              </div>
            </div>
          ) : (
            <div key={sesionSel.id} className="rounded-2xl border bg-white overflow-hidden"
              style={{ borderColor: `${color}25` }}>

              {/* Cabecera sesión */}
              <div className="px-5 py-4 flex items-start gap-3"
                style={{ borderBottom: `1px solid ${color}15`, background: `${color}06` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-base text-white"
                  style={{ background: gradientFromColor(color) }}>
                  {sesionSel.orden}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-black text-slate-800 leading-tight">{sesionSel.titulo}</h2>
                  {sesionSel.descripcion && (
                    <p className="text-sm text-slate-400 mt-0.5 leading-relaxed">{sesionSel.descripcion}</p>
                  )}
                </div>
              </div>

              {/* ── Recursos ── */}
              <div className="px-5 py-5" style={{ borderBottom: '1px solid #f1f5f9' }}>
                <div className="flex items-center gap-2 mb-3">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                  </svg>
                  <h3 className="text-sm font-black text-slate-700">Recursos</h3>
                </div>

                {cargandoRec ? (
                  <div className="flex items-center gap-2 py-3 text-slate-300 text-xs">
                    <Spinner size={12} color="#cbd5e1"/><span>Cargando…</span>
                  </div>
                ) : (recursos[sesionSel.id] ?? []).length === 0 ? (
                  <p className="text-xs text-slate-300 font-semibold py-1">Sin recursos en esta sesión</p>
                ) : (
                  <div className="space-y-1">
                    {(recursos[sesionSel.id] ?? []).map(r => {
                      const m = TIPO_META[r.tipo]
                      return (
                        <a key={r.id} href={(r.tipo === 'pdf' || r.tipo === 'imagen' ? recFirmados[r.url] : r.url) || undefined} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors hover:bg-slate-50 group">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: m.bg, color: m.color }}>
                            {m.icon}
                          </div>
                          <span className="text-sm font-semibold text-slate-600 truncate flex-1 group-hover:underline">{r.nombre}</span>
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: m.bg, color: m.color }}>
                            {m.label}
                          </span>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ── Tareas ── */}
              <div className="px-5 py-5">
                <div className="flex items-center gap-2 mb-3">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#143875" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                  </svg>
                  <h3 className="text-sm font-black text-slate-700">Tareas</h3>
                </div>

                {cargandoTar ? (
                  <div className="flex items-center gap-2 py-3 text-slate-300 text-xs">
                    <Spinner size={12} color="#a5b4fc"/><span>Cargando…</span>
                  </div>
                ) : (tareas[sesionSel.id] ?? []).length === 0 ? (
                  <p className="text-xs text-slate-300 font-semibold py-1">Sin tareas en esta sesión</p>
                ) : (
                  <div className="space-y-3">
                    {(tareas[sesionSel.id] ?? []).map(t => {
                      const miEntrega = entregas[t.id] ?? null
                      const cal       = miEntrega?.calificaciones?.[0] ?? null
                      const vencida   = t.fecha_limite && new Date(t.fecha_limite) < new Date()
                      const esForm    = entregandoId === t.id

                      return (
                        <div key={t.id} className="rounded-xl border bg-white p-4 space-y-2.5"
                          style={{ borderColor: miEntrega ? (cal ? '#bbf7d0' : '#b6c5e3') : '#e2e8f0' }}>

                          {/* Info tarea */}
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                              style={{ background: '#EFF3FA', border: '1.5px solid #b6c5e3' }}>
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#143875" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-slate-800 leading-snug">{t.titulo}</p>
                              {t.descripcion && <p className="text-xs text-slate-400 mt-0.5">{t.descripcion}</p>}
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                {t.fecha_limite && (
                                  <span className="text-[11px] font-semibold" style={{ color: vencida ? '#ef4444' : '#94a3b8' }}>
                                    Límite: {formatFecha(t.fecha_limite)}
                                    {vencida && <span className="ml-1 text-[9px] font-black text-red-400">VENCIDA</span>}
                                  </span>
                                )}
                                <span className="text-[11px] text-slate-400">{t.max_puntos} pts</span>
                              </div>
                            </div>
                            {cal ? (
                              <div className="shrink-0 text-right">
                                <span className="text-xl font-black"
                                  style={{ color: cal.nota >= 14 ? '#16a34a' : cal.nota >= 11 ? '#d97706' : '#dc2626' }}>
                                  {cal.nota}
                                </span>
                                <span className="text-xs text-slate-400">/{t.max_puntos}</span>
                              </div>
                            ) : !cal && miEntrega ? (
                              <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full"
                                style={{ background: '#EFF3FA', color: '#143875' }}>
                                Entregado
                              </span>
                            ) : null}
                          </div>

                          {/* Entrega existente */}
                          {miEntrega && (
                            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                              style={{ background: cal ? '#f0fdf4' : '#EFF3FA' }}>
                              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke={cal ? '#16a34a' : '#143875'} strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                              </svg>
                              <a href={(miEntrega.tipo === 'archivo' ? entFirmadas[miEntrega.url] : miEntrega.url) || undefined} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-bold hover:underline truncate flex-1"
                                style={{ color: cal ? '#16a34a' : '#143875' }}>
                                {miEntrega.nombre_archivo ?? 'Ver entrega'}
                              </a>
                            </div>
                          )}

                          {cal?.comentario && (
                            <p className="text-xs text-slate-500 italic px-2">&ldquo;{cal.comentario}&rdquo;</p>
                          )}

                          {!cal && !esForm && (
                            <button onClick={() => { setEntregandoId(t.id); setTipoEnt('archivo'); setLinkEnt(''); setComentEnt(''); setArchivoEnt(null); setErrorEnt('') }}
                              className="w-full py-2 rounded-xl text-xs font-black transition-colors"
                              style={{ background: '#EFF3FA', color: '#143875', border: '1.5px dashed #b6c5e3' }}>
                              {miEntrega ? 'Reemplazar entrega' : 'Entregar tarea'}
                            </button>
                          )}

                          {esForm && (
                            <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: '#b6c5e3', background: '#f5f7ff' }}>
                              <div className="flex gap-2">
                                {(['archivo', 'link'] as const).map(tp => (
                                  <button key={tp} onClick={() => setTipoEnt(tp)}
                                    className="flex-1 py-1.5 rounded-lg text-xs font-black transition-all"
                                    style={tipoEnt === tp
                                      ? { background: '#143875', color: 'white' }
                                      : { background: 'white', color: '#94a3b8', border: '1px solid #E4E8EF' }}>
                                    {tp === 'archivo' ? 'Subir archivo' : 'Pegar enlace'}
                                  </button>
                                ))}
                              </div>
                              {tipoEnt === 'archivo' ? (
                                <>
                                  <input ref={fileRef} type="file" className="hidden"
                                    onChange={e => setArchivoEnt(e.target.files?.[0] ?? null)}/>
                                  <button onClick={() => fileRef.current?.click()}
                                    className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2"
                                    style={{ background: 'white', border: '1.5px dashed #b6c5e3', color: '#143875' }}>
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                                    </svg>
                                    {archivoEnt ? archivoEnt.name : 'Seleccionar archivo'}
                                  </button>
                                </>
                              ) : (
                                <input className="w-full px-3 py-2 rounded-lg text-xs text-slate-800 placeholder-slate-300 outline-none bg-white border border-slate-200 focus:border-indigo-400"
                                  placeholder="https://…" value={linkEnt} onChange={e => setLinkEnt(e.target.value)} />
                              )}
                              <input className="w-full px-3 py-2 rounded-lg text-xs text-slate-800 placeholder-slate-300 outline-none bg-white border border-slate-200 focus:border-indigo-400"
                                placeholder="Comentario (opcional)" value={comentEnt} onChange={e => setComentEnt(e.target.value)} />
                              {progreso > 0 && progreso < 100 && (
                                <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                                  <div className="h-full rounded-full transition-all"
                                    style={{ width: `${progreso}%`, background: 'linear-gradient(90deg,#143875,#818cf8)' }}/>
                                </div>
                              )}
                              {errorEnt && <p className="text-xs font-bold text-red-500">{errorEnt}</p>}
                              <div className="flex gap-2">
                                <button onClick={() => setEntregandoId(null)}
                                  className="flex-1 py-1.5 rounded-lg text-xs font-bold text-slate-500 border border-slate-200 bg-white hover:bg-slate-50">
                                  Cancelar
                                </button>
                                <button onClick={() => handleEntregar(t.id)} disabled={subiendo}
                                  className="flex-1 py-1.5 rounded-lg text-xs font-black text-white flex items-center justify-center gap-1.5"
                                  style={{ background: 'linear-gradient(135deg,#143875,#818cf8)' }}>
                                  {subiendo && <Spinner size={10} color="white"/>}
                                  {subiendo ? 'Enviando…' : 'Enviar'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ── Exámenes de la sesión ── */}
              {(examenesSesion[sesionSel.id] ?? []).length > 0 && (
                <div className="px-5 py-5" style={{ borderTop: '1px solid #f1f5f9' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#0d9488" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                    </svg>
                    <h3 className="text-sm font-black text-slate-700">Exámenes</h3>
                  </div>
                  <div className="space-y-2.5">
                    {(examenesSesion[sesionSel.id] ?? []).map(ex => {
                      const intento  = intentosSesion[ex.id]
                      const terminado = !!intento?.finalizado_at
                      const vencido  = ex.fecha_limite ? new Date(ex.fecha_limite) < new Date() : false
                      const nc = intento?.nota == null ? '#94a3b8'
                        : intento.nota >= 14 ? '#16a34a'
                        : intento.nota >= 11 ? '#d97706'
                        : '#dc2626'
                      return (
                        <div key={ex.id} className="rounded-xl border p-4"
                          style={{ borderColor: terminado ? '#99f6e4' : '#e2e8f0', background: 'white' }}>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                              style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }}>
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#0d9488" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-slate-800 leading-snug">{ex.titulo}</p>
                              {ex.descripcion && <p className="text-xs text-slate-400 mt-0.5">{ex.descripcion}</p>}
                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                {ex.fecha_limite && (
                                  <span className="text-[11px] font-semibold" style={{ color: vencido && !terminado ? '#ef4444' : '#94a3b8' }}>
                                    Límite: {formatFecha(ex.fecha_limite)}
                                    {vencido && !terminado && <span className="ml-1 text-[9px] font-black text-red-400">VENCIDO</span>}
                                  </span>
                                )}
                                {ex.duracion_minutos && (
                                  <span className="text-[11px] text-slate-400">{ex.duracion_minutos} min</span>
                                )}
                              </div>
                            </div>
                            {terminado && intento.nota !== null ? (
                              <div className="shrink-0 text-right">
                                <span className="text-xl font-black" style={{ color: nc }}>{intento.nota}</span>
                                <span className="text-xs text-slate-400">/20</span>
                              </div>
                            ) : (
                              <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full"
                                style={vencido ? { background: '#fee2e2', color: '#dc2626' } : { background: '#f0fdfa', color: '#0d9488' }}>
                                {vencido ? 'VENCIDO' : 'PENDIENTE'}
                              </span>
                            )}
                          </div>
                          {!terminado && !vencido && (
                            <button onClick={() => router.push('/alumno/examenes')}
                              className="w-full mt-3 py-2 rounded-xl text-xs font-black text-white"
                              style={{ background: 'linear-gradient(135deg,#0F766E,#14B8A6)' }}>
                              Ir a realizar examen →
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

      </div>
    </div>
  )
}
