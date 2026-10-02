'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { timeAgo } from '@/utils/formatters'
import { useConfirm } from '@/components/ConfirmModal'

interface Anuncio {
  id: string
  titulo: string
  contenido: string
  tipo: string
  autor_nombre: string
  created_at: string
}


export default function AdminAnunciosPage() {
  const router = useRouter()

  const [uid,       setUid]       = useState('')
  const [nombre,    setNombre]    = useState('')
  const [anuncios,  setAnuncios]  = useState<Anuncio[]>([])
  const [loading,   setLoading]   = useState(true)
  const [guardando, setGuardando] = useState(false)

  const [abierto,   setAbierto]   = useState(false)
  const [titulo,    setTitulo]    = useState('')
  const [contenido, setContenido] = useState('')
  const [error,     setError]     = useState('')
  const { confirmar, dialogo } = useConfirm()

  async function cargar() {
    const { data } = await supabase
      .from('anuncios')
      .select('id,titulo,contenido,tipo,autor_nombre,created_at')
      .eq('tipo', 'global')
      .order('created_at', { ascending: false })
    setAnuncios((data ?? []) as Anuncio[])
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUid(user.id)

      const { data: admin } = await supabase
        .from('user_admin').select('nombre').eq('id', user.id).maybeSingle()
      setNombre(admin?.nombre ?? 'Admin')

      await cargar()
      setLoading(false)
    }
    init()
  }, [router])

  async function publicar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!titulo.trim() || !contenido.trim()) { setError('Completa título y contenido.'); return }
    setGuardando(true)
    const { error: err } = await supabase.from('anuncios').insert({
      titulo:      titulo.trim(),
      contenido:   contenido.trim(),
      tipo:        'global',
      autor_id:    uid,
      autor_nombre: nombre,
    })
    if (err) { setError(err.message); setGuardando(false); return }
    setTitulo(''); setContenido(''); setAbierto(false); setGuardando(false)
    await cargar()
  }

  async function eliminar(id: string) {
    if (!(await confirmar({
      titulo: '¿Eliminar este anuncio?',
      mensaje: 'Todos los que lo ven (docentes, alumnos y padres) dejarán de verlo. Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Eliminar',
    }))) return
    await supabase.from('anuncios').delete().eq('id', id)
    setAnuncios(prev => prev.filter(a => a.id !== id))
  }

  if (loading) return null

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Comunicados globales</h1>
          <p className="text-sm text-slate-400 mt-0.5">Visibles para todos los alumnos y docentes</p>
        </div>
        <button onClick={() => { setAbierto(v => !v); setError('') }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white"
          style={{ background: 'linear-gradient(135deg,#0d9488,#06b6d4)' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {abierto ? 'Cancelar' : 'Nuevo comunicado'}
        </button>
      </div>

      {abierto && (
        <form onSubmit={publicar} className="rounded-2xl p-5 space-y-4"
          style={{ background: 'white', border: '1.5px solid #99f6e4', boxShadow: '0 4px 24px rgba(13,148,136,.08)' }}>
          <p className="text-sm font-black text-slate-700">Nuevo comunicado general</p>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">Título</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder="Ej: Suspensión de clases el viernes"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">Contenido</label>
            <textarea value={contenido} onChange={e => setContenido(e.target.value)}
              rows={4} placeholder="Escribe el comunicado…"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
              style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }} />
          </div>

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAbierto(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="px-5 py-2 rounded-xl text-xs font-black text-white"
              style={{ background: 'linear-gradient(135deg,#0d9488,#06b6d4)' }}>
              {guardando ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </form>
      )}

      {anuncios.length === 0 ? (
        <div className="rounded-2xl flex flex-col items-center justify-center py-20 gap-4"
          style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
          <p className="text-sm font-bold text-slate-400">Sin comunicados publicados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {anuncios.map(a => (
            <div key={a.id} className="rounded-2xl overflow-hidden"
              style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
              <div className="h-1" style={{ background: 'linear-gradient(90deg,#0d9488,#06b6d4)' }} />
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: '#f0fdfa', color: '#0d9488' }}>
                      Comunicado general
                    </span>
                    <span className="text-[10px] text-slate-400">{timeAgo(a.created_at)}</span>
                  </div>
                  <h3 className="text-sm font-black text-slate-800">{a.titulo}</h3>
                  <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{a.contenido}</p>
                </div>
                <button onClick={() => eliminar(a.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all hover:bg-red-50 text-slate-400"
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}>
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6m4-6v6"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {dialogo}
    </div>
  )
}
