'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'
import { getSesionDocente } from '@/lib/auth'
import type { Asignacion, Sesion, Unidad } from '@/types'
import RecursosPanel    from './RecursosPanel'
import TareasPanel      from './TareasPanel'
import AsistenciaPanel  from './AsistenciaPanel'
import { useConfirm } from '@/components/ConfirmModal'




function gradientFromColor(hex: string) {
  return `linear-gradient(135deg, ${hex}ee, ${hex}99)`
}

const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-slate-800 placeholder-slate-300 outline-none transition-all bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:bg-white'
const labelCls = 'block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1'


export default function CursoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router  = useRouter()

  const [asignacion,  setAsignacion]  = useState<Asignacion | null>(null)
  const [unidades,    setUnidades]    = useState<Unidad[]>([])
  const [sesiones,    setSesiones]    = useState<Record<string, Sesion[]>>({})
  const [loading,     setLoading]     = useState(true)
  const [sesionSel,   setSesionSel]   = useState<Sesion | null>(null)
  const [expandidos,  setExpandidos]  = useState<Set<string>>(new Set())

  // Tab principal del curso
  const [cursoTab, setCursoTab] = useState<'sesiones' | 'asistencia'>('sesiones')
  const { confirmar, dialogo } = useConfirm()
  // Mobile tab (solo dentro de sesiones)
  const [mobTab, setMobTab] = useState<'nav' | 'content'>('nav')

  // ── Unidades CRUD ────────────────────────────────────────────────────────
  const [mostrarFormU,  setMostrarFormU]  = useState(false)
  const [nuevoNombreU,  setNuevoNombreU]  = useState('')
  const [nuevoDescU,    setNuevoDescU]    = useState('')
  const [creandoU,      setCreandoU]      = useState(false)
  const [editandoUId,   setEditandoUId]   = useState<string | null>(null)
  const [editNombreU,   setEditNombreU]   = useState('')
  const [editDescU,     setEditDescU]     = useState('')
  const [guardandoU,    setGuardandoU]    = useState(false)
  const [eliminandoUId, setEliminandoUId] = useState<string | null>(null)

  // ── Sesiones CRUD ────────────────────────────────────────────────────────
  const [mostrarFormSId, setMostrarFormSId] = useState<string | null>(null)
  const [nuevoTituloS,   setNuevoTituloS]   = useState('')
  const [nuevoDescS,     setNuevoDescS]     = useState('')
  const [creandoS,       setCreandoS]       = useState(false)
  const [editandoSId,    setEditandoSId]    = useState<string | null>(null)
  const [editTituloS,    setEditTituloS]    = useState('')
  const [editDescS,      setEditDescS]      = useState('')
  const [guardandoS,     setGuardandoS]     = useState(false)
  const [eliminandoSId,  setEliminandoSId]  = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const sesion = await getSesionDocente()
      if (!sesion) { router.push('/login'); return }
      const uid = sesion.uid

      const { data: asig } = await supabase
        .from('asignaciones')
        .select('id, grado, grupo, anio, cursos(nombre, color)')
        .eq('id', id).eq('docente_id', uid).maybeSingle()

      if (!asig) { router.push('/docente/cursos'); return }
      setAsignacion(asig as unknown as Asignacion)
      await cargarTodo(true)
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ── Carga completa ────────────────────────────────────────────────────────
  async function cargarTodo(esInit = false) {
    const { data: uData } = await supabase
      .from('unidades').select('id,nombre,descripcion,orden,created_at')
      .eq('asignacion_id', id).order('orden')
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
      // En init: expandir todas, seleccionar primera sesión
      if (esInit) {
        setExpandidos(new Set(uList.map(u => u.id)))
        const primera = (sData ?? [])[0] as Sesion | undefined
        if (primera) setSesionSel(primera)
      } else {
        setExpandidos(prev => {
          const next = new Set(prev)
          uList.forEach(u => next.add(u.id))
          return next
        })
      }
    } else {
      setSesiones({})
    }
  }

  // ── Handlers unidades ─────────────────────────────────────────────────────
  async function handleCrearUnidad(e: React.FormEvent) {
    e.preventDefault()
    if (!nuevoNombreU.trim()) return
    setCreandoU(true)
    const { data: uData } = await supabase.from('unidades').select('orden').eq('asignacion_id', id).order('orden', { ascending: false }).limit(1)
    const sig = ((uData?.[0] as { orden: number } | undefined)?.orden ?? 0) + 1
    await supabase.from('unidades').insert({ asignacion_id: id, nombre: nuevoNombreU.trim(), descripcion: nuevoDescU.trim() || null, orden: sig })
    setNuevoNombreU(''); setNuevoDescU(''); setMostrarFormU(false); setCreandoU(false)
    await cargarTodo()
  }

  async function handleGuardarUnidad(u: Unidad) {
    if (!editNombreU.trim()) return
    setGuardandoU(true)
    await supabase.from('unidades').update({ nombre: editNombreU.trim(), descripcion: editDescU.trim() || null }).eq('id', u.id)
    setEditandoUId(null); setGuardandoU(false)
    await cargarTodo()
  }

  async function handleEliminarUnidad(u: Unidad) {
    if (!(await confirmar({
      titulo: `¿Eliminar la unidad "${u.nombre}"?`,
      mensaje: 'Tus alumnos dejarán de ver esta unidad y todo su contenido (sesiones, tareas y recursos). Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Eliminar unidad',
    }))) return
    setEliminandoUId(u.id)
    await supabase.from('unidades').delete().eq('id', u.id)
    setEliminandoUId(null)
    if (sesionSel && sesiones[u.id]?.some(s => s.id === sesionSel.id)) setSesionSel(null)
    await cargarTodo()
  }

  async function moverUnidad(unidadId: string, dir: 'arriba' | 'abajo') {
    const idx = unidades.findIndex(u => u.id === unidadId)
    if (dir === 'arriba' && idx === 0) return
    if (dir === 'abajo' && idx === unidades.length - 1) return
    const vecino = unidades[dir === 'arriba' ? idx - 1 : idx + 1]
    const actual = unidades[idx]
    await Promise.all([
      supabase.from('unidades').update({ orden: vecino.orden }).eq('id', actual.id),
      supabase.from('unidades').update({ orden: actual.orden }).eq('id', vecino.id),
    ])
    await cargarTodo()
  }

  // ── Handlers sesiones ─────────────────────────────────────────────────────
  async function handleCrearSesion(e: React.FormEvent, unidadId: string) {
    e.preventDefault()
    if (!nuevoTituloS.trim()) return
    setCreandoS(true)
    const lista = sesiones[unidadId] ?? []
    const sig = lista.length > 0 ? Math.max(...lista.map(s => s.orden ?? 0)) + 1 : 1
    await supabase.from('sesiones').insert({ unidad_id: unidadId, titulo: nuevoTituloS.trim(), descripcion: nuevoDescS.trim() || null, orden: sig })
    setNuevoTituloS(''); setNuevoDescS(''); setMostrarFormSId(null); setCreandoS(false)
    await cargarTodo()
  }

  async function handleGuardarSesion(s: Sesion) {
    if (!editTituloS.trim()) return
    setGuardandoS(true)
    await supabase.from('sesiones').update({ titulo: editTituloS.trim(), descripcion: editDescS.trim() || null }).eq('id', s.id)
    setEditandoSId(null); setGuardandoS(false)
    if (sesionSel?.id === s.id) setSesionSel(prev => prev ? { ...prev, titulo: editTituloS.trim(), descripcion: editDescS.trim() || null } : prev)
    await cargarTodo()
  }

  async function handleEliminarSesion(s: Sesion) {
    if (!(await confirmar({
      titulo: `¿Eliminar la sesión "${s.titulo}"?`,
      mensaje: 'Sus tareas, recursos y entregas asociadas dejarán de estar disponibles para tus alumnos. Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Eliminar sesión',
    }))) return
    setEliminandoSId(s.id)
    await supabase.from('sesiones').delete().eq('id', s.id)
    setEliminandoSId(null)
    if (sesionSel?.id === s.id) setSesionSel(null)
    await cargarTodo()
  }

  async function moverSesion(s: Sesion, dir: 'arriba' | 'abajo') {
    const lista = sesiones[s.unidad_id] ?? []
    const idx = lista.findIndex(x => x.id === s.id)
    if (dir === 'arriba' && idx === 0) return
    if (dir === 'abajo' && idx === lista.length - 1) return
    const vecino = lista[dir === 'arriba' ? idx - 1 : idx + 1]
    await Promise.all([
      supabase.from('sesiones').update({ orden: vecino.orden }).eq('id', s.id),
      supabase.from('sesiones').update({ orden: s.orden }).eq('id', vecino.id),
    ])
    await cargarTodo()
  }

  if (loading || !asignacion) return null

  const color  = asignacion.cursos?.color ?? '#143875'
  const nombre = asignacion.cursos?.nombre ?? 'Curso'
  const totalSesiones = Object.values(sesiones).reduce((s, a) => s + a.length, 0)

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div>
        <button onClick={() => router.push('/docente/cursos')}
          className="flex items-center gap-1.5 text-xs font-bold transition-colors mb-4"
          style={{ color: '#6b7280' }}
          onMouseEnter={e => { e.currentTarget.style.color = color }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b7280' }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
          Mis Cursos
        </button>

        {/* Header card con color del curso */}
        <div className="rounded-2xl overflow-hidden" style={{ position: 'relative', background: gradientFromColor(color), boxShadow: `0 12px 40px ${color}40, 0 4px 14px ${color}25` }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `repeating-linear-gradient(-48deg, transparent, transparent 20px, rgba(255,255,255,.04) 20px, rgba(255,255,255,.04) 21px)` }} />
          <div style={{ position: 'absolute', top: '-50px', right: '-30px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,.08)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', padding: '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div className="min-w-0">
              <p style={{ color: 'rgba(255,255,255,.65)', fontSize: '10px', fontWeight: '700', letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: '6px' }}>
                {asignacion.grado} · Sección {asignacion.grupo} · {asignacion.anio}
              </p>
              <h1 style={{ color: 'white', fontWeight: '900', fontSize: '22px', lineHeight: '1.15', letterSpacing: '-.01em' }} className="truncate">
                {nombre}
              </h1>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div style={{ padding: '8px 16px', borderRadius: '12px', background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)', fontSize: '12px', fontWeight: '800', color: 'white' }}>
                {unidades.length} unidad{unidades.length !== 1 ? 'es' : ''}
              </div>
              <div style={{ padding: '8px 16px', borderRadius: '12px', background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)', fontSize: '12px', fontWeight: '800', color: 'white' }}>
                {totalSesiones} sesión{totalSesiones !== 1 ? 'es' : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs principales: Sesiones / Asistencia ── */}
      <div className="flex gap-2">
        {([
          { id: 'sesiones',   label: 'Sesiones',   icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
          { id: 'asistencia', label: 'Asistencia',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setCursoTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all"
            style={cursoTab === t.id
              ? { background: gradientFromColor(color), color: 'white', boxShadow: `0 4px 16px ${color}45` }
              : { background: 'white', color: '#6b7280', border: '1.5px solid #E4E8EF' }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d={t.icon}/>
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Asistencia ── */}
      {cursoTab === 'asistencia' && (
        <AsistenciaPanel
          asignacionId={id as string}
          grado={asignacion.grado}
          grupo={asignacion.grupo}
          color={color}
        />
      )}

      {/* ── Tabs móvil (solo dentro de Sesiones) ── */}
      {cursoTab === 'sesiones' && (
      <div className="flex gap-2 lg:hidden">
        {(['nav', 'content'] as const).map(t => (
          <button key={t} onClick={() => setMobTab(t)}
            className="flex-1 py-2 rounded-xl text-xs font-black transition-all"
            style={mobTab === t
              ? { background: gradientFromColor(color), color: 'white', boxShadow: `0 4px 14px ${color}40` }
              : { background: 'white', color: '#6b7280', border: '1.5px solid #E4E8EF' }}>
            {t === 'nav' ? 'Sesiones' : 'Contenido'}
          </button>
        ))}
      </div>
      )}

      {/* ── Dos paneles (solo en tab Sesiones) ── */}
      {cursoTab === 'sesiones' &&
      <div className="flex gap-4 items-start">

        {/* ── PANEL IZQUIERDO: navegador de sesiones ── */}
        <aside className={`w-72 shrink-0 ${mobTab === 'nav' ? 'block' : 'hidden'} lg:block`}
          style={{ position: 'sticky', top: '24px' }}>
          <div className="rounded-2xl overflow-hidden flex flex-col"
            style={{ border: `1.5px solid ${color}22`, background: 'white', maxHeight: 'calc(100vh - 160px)', boxShadow: `0 4px 24px ${color}14` }}>

            {/* Cabecera sidebar — color del curso */}
            <div className="px-4 py-3 flex items-center justify-between shrink-0"
              style={{ borderBottom: `1px solid ${color}18`, background: gradientFromColor(color) }}>
              <div className="flex items-center gap-2">
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,.7)' }} />
                <p style={{ fontSize: '10px', fontWeight: '800', color: 'white', textTransform: 'uppercase', letterSpacing: '.12em' }}>Unidades y Sesiones</p>
              </div>
              <button
                onClick={() => { setMostrarFormU(v => !v); setNuevoNombreU(''); setNuevoDescU('') }}
                className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg transition-all"
                style={{ color: 'white', background: mostrarFormU ? 'rgba(0,0,0,.15)' : 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.3)' }}>
                <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  {mostrarFormU
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>}
                </svg>
                {mostrarFormU ? 'Cancelar' : '+ Unidad'}
              </button>
            </div>

            {/* Form nueva unidad */}
            {mostrarFormU && (
              <form onSubmit={handleCrearUnidad} className="p-3 space-y-2 shrink-0"
                style={{ borderBottom: `1px solid ${color}18`, background: `${color}06` }}>
                <div>
                  <label className={labelCls}>Nombre *</label>
                  <input required autoFocus value={nuevoNombreU} onChange={e => setNuevoNombreU(e.target.value)}
                    placeholder="Ej: Unidad 1" className={inputCls + ' text-xs py-1.5'}/>
                </div>
                <div>
                  <label className={labelCls}>Descripción (opcional)</label>
                  <input value={nuevoDescU} onChange={e => setNuevoDescU(e.target.value)}
                    placeholder="Breve descripción…" className={inputCls + ' text-xs py-1.5'}/>
                </div>
                <button type="submit" disabled={creandoU || !nuevoNombreU.trim()}
                  className="w-full py-1.5 rounded-xl text-xs font-black text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ background: gradientFromColor(color) }}>
                  {creandoU && <Spinner size={11}/>}{creandoU ? 'Creando…' : 'Crear unidad'}
                </button>
              </form>
            )}

            {/* Sin unidades */}
            {unidades.length === 0 && !mostrarFormU && (
              <div className="py-12 text-center px-4">
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `${color}10`, border: `1.5px dashed ${color}30`, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="1.5" strokeOpacity=".5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                  </svg>
                </div>
                <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600' }}>Sin unidades aún</p>
                <p style={{ fontSize: '10px', color: '#d1d5db', marginTop: '3px' }}>Usa el botón + Unidad</p>
              </div>
            )}

            {/* Lista scroll */}
            <div className="overflow-y-auto flex-1 p-2">
              {unidades.map((u, i) => {
                const expanded = expandidos.has(u.id)
                const listaS   = sesiones[u.id] ?? []

                return (
                  <div key={u.id} style={{ marginBottom: '6px' }}>

                    {/* ── Fila unidad ── */}
                    {editandoUId === u.id ? (
                      <div className="rounded-xl border p-2.5 space-y-1.5 mb-1"
                        style={{ borderColor: `${color}30`, background: `${color}05` }}>
                        <input autoFocus value={editNombreU} onChange={e => setEditNombreU(e.target.value)}
                          className={inputCls + ' text-xs py-1.5'} placeholder="Nombre"/>
                        <input value={editDescU} onChange={e => setEditDescU(e.target.value)}
                          className={inputCls + ' text-xs py-1.5'} placeholder="Descripción"/>
                        <div className="flex gap-1.5">
                          <button onClick={() => handleGuardarUnidad(u)} disabled={guardandoU || !editNombreU.trim()}
                            className="flex-1 py-1.5 rounded-lg text-[10px] font-black text-white disabled:opacity-50 flex items-center justify-center gap-1"
                            style={{ background: gradientFromColor(color) }}>
                            {guardandoU && <Spinner size={9}/>} Guardar
                          </button>
                          <button onClick={() => setEditandoUId(null)}
                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 border border-slate-200 hover:bg-slate-50">
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="group cursor-pointer"
                        style={{
                          borderRadius: '12px',
                          background: expanded ? `${color}08` : 'transparent',
                          border: expanded ? `1.5px solid ${color}20` : '1.5px solid transparent',
                          transition: 'all .15s ease'
                        }}
                        onClick={() => setExpandidos(prev => { const n = new Set(prev); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n })}>
                        <div className="flex items-center gap-2 px-2.5 py-2.5">
                          {/* Número de unidad */}
                          <div style={{
                            width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                            background: expanded ? color : `${color}15`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all .15s ease'
                          }}>
                            <span style={{ fontSize: '10px', fontWeight: '900', color: expanded ? 'white' : color }}>
                              {u.orden}
                            </span>
                          </div>
                          <span style={{
                            flex: 1, fontSize: '12px', fontWeight: '800',
                            color: expanded ? color : '#374151',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            transition: 'color .15s ease'
                          }}>
                            {u.nombre}
                          </span>
                          {/* Acciones hover */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={e => e.stopPropagation()}>
                            <button onClick={() => moverUnidad(u.id, 'arriba')} disabled={i === 0}
                              className="w-5 h-5 flex items-center justify-center rounded text-slate-300 disabled:opacity-20 transition-colors"
                              style={{}} onMouseEnter={e => e.currentTarget.style.color = color} onMouseLeave={e => e.currentTarget.style.color = ''}>
                              <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>
                            </button>
                            <button onClick={() => moverUnidad(u.id, 'abajo')} disabled={i === unidades.length - 1}
                              className="w-5 h-5 flex items-center justify-center rounded text-slate-300 disabled:opacity-20 transition-colors"
                              onMouseEnter={e => e.currentTarget.style.color = color} onMouseLeave={e => e.currentTarget.style.color = ''}>
                              <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                            <button onClick={() => { setEditandoUId(u.id); setEditNombreU(u.nombre); setEditDescU(u.descripcion ?? '') }}
                              className="w-5 h-5 flex items-center justify-center rounded text-slate-300 transition-colors"
                              onMouseEnter={e => e.currentTarget.style.color = color} onMouseLeave={e => e.currentTarget.style.color = ''}>
                              <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button onClick={e => { e.stopPropagation(); handleEliminarUnidad(u) }} disabled={eliminandoUId === u.id}
                              className="w-5 h-5 flex items-center justify-center rounded text-red-200 hover:text-red-400 transition-colors disabled:opacity-40">
                              {eliminandoUId === u.id
                                ? <span className="text-[8px]">…</span>
                                : <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4h4v2"/></svg>}
                            </button>
                          </div>
                          {/* Chevron */}
                          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke={expanded ? color : '#d1d5db'} strokeWidth="2.5"
                            className="shrink-0 transition-transform" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                          </svg>
                        </div>

                        {/* ── Sesiones bajo la unidad ── */}
                        {expanded && editandoUId !== u.id && (
                          <div style={{ margin: '0 8px 8px 8px', borderRadius: '8px', background: 'white', border: `1px solid ${color}15`, overflow: 'hidden' }}>

                            {listaS.length === 0 && !mostrarFormSId && (
                              <p style={{ fontSize: '10px', color: '#d1d5db', fontWeight: '600', padding: '10px 12px' }}>Sin sesiones</p>
                            )}

                            {listaS.map((s, si) => (
                              <div key={s.id} style={{ borderBottom: si < listaS.length - 1 ? `1px solid ${color}10` : 'none' }}>
                                {editandoSId === s.id ? (
                                  <div className="p-2.5 space-y-1.5"
                                    style={{ background: `${color}04` }}>
                                    <input autoFocus value={editTituloS} onChange={e => setEditTituloS(e.target.value)}
                                      className={inputCls + ' text-xs py-1.5'} placeholder="Título"/>
                                    <input value={editDescS} onChange={e => setEditDescS(e.target.value)}
                                      className={inputCls + ' text-xs py-1.5'} placeholder="Descripción"/>
                                    <div className="flex gap-1.5">
                                      <button onClick={() => handleGuardarSesion(s)} disabled={guardandoS || !editTituloS.trim()}
                                        className="flex-1 py-1.5 rounded-lg text-[10px] font-black text-white disabled:opacity-50 flex items-center justify-center gap-1"
                                        style={{ background: gradientFromColor(color) }}>
                                        {guardandoS && <Spinner size={9}/>} Guardar
                                      </button>
                                      <button onClick={() => setEditandoSId(null)}
                                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 border border-slate-200 hover:bg-slate-50">
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setSesionSel(s); setMobTab('content') }}
                                    className="group/s w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all"
                                    style={sesionSel?.id === s.id
                                      ? { background: `${color}10`, borderLeft: `3px solid ${color}` }
                                      : { borderLeft: '3px solid transparent' }}>
                                    {/* Número circular */}
                                    <span style={{
                                      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: '9px', fontWeight: '900',
                                      background: sesionSel?.id === s.id ? color : `${color}12`,
                                      color: sesionSel?.id === s.id ? 'white' : color,
                                      transition: 'all .12s ease'
                                    }}>
                                      {s.orden}
                                    </span>
                                    <span style={{
                                      flex: 1, fontSize: '11px', lineHeight: '1.35',
                                      fontWeight: sesionSel?.id === s.id ? '700' : '500',
                                      color: sesionSel?.id === s.id ? '#111827' : '#6b7280',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }}>
                                      {s.titulo}
                                    </span>
                                    {/* Acciones hover */}
                                    <div className="flex gap-0.5 opacity-0 group-hover/s:opacity-100 transition-opacity shrink-0"
                                      onClick={e => e.stopPropagation()}>
                                      <button onClick={() => moverSesion(s, 'arriba')} disabled={si === 0}
                                        className="w-4 h-4 flex items-center justify-center rounded text-slate-300 disabled:opacity-20">
                                        <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>
                                      </button>
                                      <button onClick={() => moverSesion(s, 'abajo')} disabled={si === listaS.length - 1}
                                        className="w-4 h-4 flex items-center justify-center rounded text-slate-300 disabled:opacity-20">
                                        <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                                      </button>
                                      <button onClick={() => { setEditandoSId(s.id); setEditTituloS(s.titulo); setEditDescS(s.descripcion ?? '') }}
                                        className="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:text-slate-500">
                                        <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                      </button>
                                      <button onClick={e => { e.stopPropagation(); handleEliminarSesion(s) }} disabled={eliminandoSId === s.id}
                                        className="w-4 h-4 flex items-center justify-center rounded text-red-200 hover:text-red-400 disabled:opacity-40">
                                        {eliminandoSId === s.id
                                          ? <span className="text-[8px]">…</span>
                                          : <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4h4v2"/></svg>}
                                      </button>
                                    </div>
                                  </button>
                                )}
                              </div>
                            ))}

                            {/* Form nueva sesión */}
                            {mostrarFormSId === u.id && (
                              <form onSubmit={e => handleCrearSesion(e, u.id)}
                                className="p-2.5 space-y-1.5"
                                style={{ background: `${color}05`, borderTop: `1px solid ${color}15` }}>
                                <input required autoFocus value={nuevoTituloS} onChange={e => setNuevoTituloS(e.target.value)}
                                  className={inputCls + ' text-xs py-1.5'} placeholder="Título de sesión *"/>
                                <input value={nuevoDescS} onChange={e => setNuevoDescS(e.target.value)}
                                  className={inputCls + ' text-xs py-1.5'} placeholder="Descripción (opcional)"/>
                                <div className="flex gap-1.5">
                                  <button type="submit" disabled={creandoS || !nuevoTituloS.trim()}
                                    className="flex-1 py-1.5 rounded-lg text-[10px] font-black text-white disabled:opacity-50 flex items-center justify-center gap-1"
                                    style={{ background: gradientFromColor(color) }}>
                                    {creandoS && <Spinner size={9}/>} Crear
                                  </button>
                                  <button type="button" onClick={() => { setMostrarFormSId(null); setNuevoTituloS(''); setNuevoDescS('') }}
                                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 border border-slate-200 hover:bg-slate-50">
                                    ✕
                                  </button>
                                </div>
                              </form>
                            )}

                            {/* Botón nueva sesión */}
                            {mostrarFormSId !== u.id && (
                              <button
                                onClick={() => { setMostrarFormSId(u.id); setNuevoTituloS(''); setNuevoDescS('') }}
                                className="flex items-center gap-1.5 text-[10px] font-black px-3 py-2 w-full transition-colors"
                                style={{ color, borderTop: `1px solid ${color}12` }}
                                onMouseEnter={e => e.currentTarget.style.background = `${color}08`}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                                </svg>
                                Nueva sesión
                              </button>
                            )}
                          </div>
                        )}
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
            <div className="rounded-2xl py-24 flex flex-col items-center justify-center gap-4"
              style={{ background: 'white', border: `1.5px solid ${color}18`, boxShadow: `0 4px 24px ${color}10` }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '20px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${color}08`, border: `2px dashed ${color}28`
              }}>
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="1.5" strokeOpacity=".45">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
              </div>
              <div className="text-center">
                <p style={{ fontSize: '14px', fontWeight: '800', color }}>Selecciona una sesión</p>
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>El contenido aparecerá aquí</p>
              </div>
            </div>
          ) : (
            <div key={sesionSel.id} className="rounded-2xl overflow-hidden"
              style={{ border: `1.5px solid ${color}20`, background: 'white', boxShadow: `0 4px 28px ${color}12` }}>

              {/* Cabecera sesión — color del curso */}
              <div style={{ background: gradientFromColor(color), padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `repeating-linear-gradient(-45deg, transparent, transparent 16px, rgba(255,255,255,.03) 16px, rgba(255,255,255,.03) 17px)` }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '13px', flexShrink: 0,
                    background: 'rgba(255,255,255,.18)', border: '1.5px solid rgba(255,255,255,.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', fontWeight: '900', color: 'white'
                  }}>
                    {sesionSel.orden}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: 'rgba(255,255,255,.65)', fontSize: '10px', fontWeight: '700', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Sesión {sesionSel.orden}
                    </p>
                    <h2 style={{ fontSize: '18px', fontWeight: '900', color: 'white', lineHeight: '1.25', letterSpacing: '-.01em' }}>
                      {sesionSel.titulo}
                    </h2>
                    {sesionSel.descripcion && (
                      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.65)', marginTop: '5px', lineHeight: '1.5' }}>
                        {sesionSel.descripcion}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Recursos */}
              <div style={{ padding: '22px 24px', borderBottom: `1px solid ${color}12` }}>
                <div className="flex items-center gap-2 mb-4">
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '9px',
                    background: `${color}10`, border: `1px solid ${color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#111827' }}>Recursos</h3>
                </div>
                <RecursosPanel sesionId={sesionSel.id} color={color}/>
              </div>

              {/* Tareas */}
              <div style={{ padding: '22px 24px' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '9px',
                    background: `${color}10`, border: `1px solid ${color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#111827' }}>Tareas</h3>
                </div>
                <TareasPanel sesionId={sesionSel.id}/>
              </div>
            </div>
          )}
        </div>

      </div>
      }

      {dialogo}
    </div>
  )
}
