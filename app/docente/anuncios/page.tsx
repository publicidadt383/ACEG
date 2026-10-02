'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { timeAgo } from '@/utils/formatters'
import { getSesionDocente } from '@/lib/auth'
import { useConfirm } from '@/components/ConfirmModal'
import type { Asignacion } from '@/types'

interface Anuncio {
  id: string
  titulo: string
  contenido: string
  tipo: string
  asignacion_id: string | null
  autor_nombre: string
  created_at: string
  asignaciones: { grado: string; grupo: string; cursos: { nombre: string; color: string } | null } | null
}



export default function DocenteAnunciosPage() {
  const router = useRouter()

  const [uid,       setUid]       = useState('')
  const [nombre,    setNombre]    = useState('')
  const [asigs,     setAsigs]     = useState<Asignacion[]>([])
  const [anuncios,  setAnuncios]  = useState<Anuncio[]>([])
  const [loading,   setLoading]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const { confirmar, dialogo } = useConfirm()

  // Form
  const [abierto,   setAbierto]   = useState(false)
  const [asigId,    setAsigId]    = useState('')
  const [titulo,    setTitulo]    = useState('')
  const [contenido, setContenido] = useState('')
  const [error,     setError]     = useState('')

  async function cargarAnuncios(docenteId: string) {
    const { data } = await supabase
      .from('anuncios')
      .select('id,titulo,contenido,tipo,asignacion_id,autor_nombre,created_at,asignaciones(grado,grupo,cursos(nombre,color))')
      .eq('autor_id', docenteId)
      .order('created_at', { ascending: false })
    setAnuncios((data ?? []) as unknown as Anuncio[])
  }

  useEffect(() => {
    async function init() {
      const sesion = await getSesionDocente()
      if (!sesion) { router.push('/login'); return }
      const efectivoId = sesion.uid
      setUid(efectivoId)

      const { data: docente } = await supabase
        .from('docentes').select('nombre').eq('id', efectivoId).maybeSingle()
      setNombre(docente?.nombre ?? '')

      const cicloId = (await getCicloActivo())?.id ?? null
      let asigsQ = supabase
        .from('asignaciones')
        .select('id,grado,grupo,cursos(nombre,color)')
        .eq('docente_id', efectivoId)
        .order('grado').order('grupo')
      if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
      const { data: asData } = await asigsQ
      setAsigs((asData ?? []) as unknown as Asignacion[])

      await cargarAnuncios(efectivoId)
      setLoading(false)
    }
    init()
  }, [router])

  async function publicar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!titulo.trim() || !contenido.trim()) { setError('Completa título y contenido.'); return }
    if (!asigId) { setError('Selecciona un curso.'); return }
    setGuardando(true)
    const { error: err } = await supabase.from('anuncios').insert({
      titulo:       titulo.trim(),
      contenido:    contenido.trim(),
      tipo:         'curso',
      asignacion_id: asigId,
      autor_id:     uid,
      autor_nombre: nombre,
    })
    if (err) { setError(err.message); setGuardando(false); return }
    setTitulo(''); setContenido(''); setAsigId(''); setAbierto(false)
    setGuardando(false)
    await cargarAnuncios(uid)
  }

  async function eliminar(id: string) {
    if (!(await confirmar({
      titulo: '¿Eliminar este anuncio?',
      mensaje: 'Tus estudiantes dejarán de verlo. Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Eliminar',
    }))) return
    await supabase.from('anuncios').delete().eq('id', id)
    setAnuncios(prev => prev.filter(a => a.id !== id))
  }

  if (loading) return null

  const colorAsig = (id: string) => asigs.find(a => a.id === id)?.cursos?.color ?? '#143875'
  const selAsig   = asigs.find(a => a.id === asigId)
  const colorSel  = selAsig?.cursos?.color ?? '#143875'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {dialogo}

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Anuncios</h1>
          <p className="text-sm text-slate-400 mt-0.5">Comunica novedades a tus estudiantes</p>
        </div>
        <button onClick={() => { setAbierto(v => !v); setError('') }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all"
          style={{ background: 'linear-gradient(135deg,#143875,#143875)', boxShadow: '0 4px 16px rgba(11,36,71,.3)' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {abierto ? 'Cancelar' : 'Nuevo anuncio'}
        </button>
      </div>

      {/* Form nuevo anuncio */}
      {abierto && (
        <form onSubmit={publicar} className="rounded-2xl p-5 space-y-4"
          style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 24px rgba(11,36,71,.08)' }}>
          <p className="text-sm font-black text-slate-700">Nuevo anuncio</p>

          {/* Selector de curso */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">Curso / Sección</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {asigs.map(a => {
                const sel  = asigId === a.id
                const col  = a.cursos?.color ?? '#143875'
                return (
                  <button type="button" key={a.id}
                    onClick={() => setAsigId(a.id)}
                    className="rounded-xl p-2.5 text-left transition-all"
                    style={sel
                      ? { background: `${col}18`, border: `2px solid ${col}`, boxShadow: `0 0 0 3px ${col}20` }
                      : { background: '#F6F8FB', border: '1.5px solid #E4E8EF' }}>
                    <p className="text-[11px] font-black truncate" style={{ color: sel ? col : '#475569' }}>
                      {a.cursos?.nombre ?? 'Curso'}
                    </p>
                    <p className="text-[10px] text-slate-400">{a.grado} · Sección {a.grupo}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">Título</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder="Ej: Cambio de horario del lunes"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: '#F6F8FB', border: `1.5px solid ${asigId ? colorSel + '40' : '#E4E8EF'}` }} />
          </div>

          {/* Contenido */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">Contenido</label>
            <textarea value={contenido} onChange={e => setContenido(e.target.value)}
              rows={4} placeholder="Escribe el mensaje para tus estudiantes…"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
              style={{ background: '#F6F8FB', border: `1.5px solid ${asigId ? colorSel + '40' : '#E4E8EF'}` }} />
          </div>

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAbierto(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 transition-all hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="px-5 py-2 rounded-xl text-xs font-black text-white transition-all"
              style={{ background: asigId ? `linear-gradient(135deg,${colorSel},${colorSel}cc)` : '#e2e8f0',
                       color: asigId ? 'white' : '#94a3b8' }}>
              {guardando ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </form>
      )}

      {/* Lista */}
      {anuncios.length === 0 ? (
        <div className="rounded-2xl flex flex-col items-center justify-center py-24 gap-4"
          style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#EFF3FA' }}>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#a5b4fc" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-500">Sin anuncios publicados</p>
            <p className="text-xs text-slate-400 mt-1">Crea tu primer anuncio con el botón de arriba</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {anuncios.map(a => {
            const col  = a.asignaciones?.cursos?.color ?? colorAsig(a.asignacion_id ?? '')
            const sec  = a.asignaciones
            return (
              <div key={a.id} className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 2px 12px rgba(11,36,71,.05)' }}>
                {/* Franja color */}
                <div className="h-1" style={{ background: `linear-gradient(90deg,${col},${col}88)` }} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {sec && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                            style={{ background: `${col}15`, color: col }}>
                            {sec.cursos?.nombre ?? 'Curso'} · {sec.grado} {sec.grupo}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">{timeAgo(a.created_at)}</span>
                      </div>
                      <h3 className="text-sm font-black text-slate-800">{a.titulo}</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap">{a.contenido}</p>
                    </div>
                    <button onClick={() => eliminar(a.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all hover:bg-red-50"
                      style={{ color: '#94a3b8' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                    </button>
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
