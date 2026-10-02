'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/components/ConfirmModal'

interface GaleriaItem { id: string; url: string; descripcion: string | null; orden: number }
interface AnuncioRow  {
  id: string; titulo: string; contenido: string
  autor_nombre: string; created_at: string
  en_landing: boolean; imagen_url: string | null
}

const inputCls   = 'w-full px-3 py-2 rounded-xl text-sm text-slate-800 outline-none transition-all resize-none'
const inputStyle = { background: '#F6F8FB', border: '1.5px solid #E4E8EF' }

export default function AdminLandingPage() {
  const router   = useRouter()
  const iframeRef  = useRef<HTMLIFrameElement>(null)
  const fileGalRef = useRef<HTMLInputElement>(null)
  const fileComRef = useRef<HTMLInputElement>(null)

  const [loading,     setLoading]     = useState(true)
  const [iframeKey,   setIframeKey]   = useState(0)
  const [panel,       setPanel]       = useState<'galeria' | 'comunicados' | 'fondo'>('galeria')

  // Galería
  const [galeria,     setGaleria]     = useState<GaleriaItem[]>([])
  const [subiendo,    setSubiendo]    = useState(false)
  const [uploadErr,   setUploadErr]   = useState('')

  // Fondo
  const [fondoUrl,    setFondoUrl]    = useState<string | null>(null)
  const fileFondoRef  = useRef<HTMLInputElement>(null)
  const [subiendoFondo, setSubiendoFondo] = useState(false)
  const [fondoErr,    setFondoErr]    = useState('')

  // Comunicados
  const [anuncios,    setAnuncios]    = useState<AnuncioRow[]>([])
  const [showForm,    setShowForm]    = useState(false)
  const [comForm,     setComForm]     = useState({ titulo: '', contenido: '' })
  const [comImg,      setComImg]      = useState<string | null>(null)
  const [subiendoCom, setSubiendoCom] = useState(false)
  const [guardandoCom,setGuardandoCom]= useState(false)
  const [comErr,      setComErr]      = useState('')

  const recargarPreview = useCallback(() => setIframeKey(k => k + 1), [])
  const { confirmar, dialogo } = useConfirm()

  /* ── Fondo ── */
  async function cargarFondo() {
    const { data } = await supabase.from('landing_config').select('fondo_url').eq('id', 1).maybeSingle()
    setFondoUrl(data?.fondo_url ?? null)
  }

  async function subirFondo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendoFondo(true); setFondoErr('')
    const nombre = `fondo_${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('landing').upload(nombre, file, { upsert: false })
    if (error) { setFondoErr('Error al subir la imagen.'); setSubiendoFondo(false); if (fileFondoRef.current) fileFondoRef.current.value = ''; return }
    const { data: { publicUrl } } = supabase.storage.from('landing').getPublicUrl(nombre)
    await supabase.from('landing_config').update({ fondo_url: publicUrl }).eq('id', 1)
    setFondoUrl(publicUrl)
    setSubiendoFondo(false)
    if (fileFondoRef.current) fileFondoRef.current.value = ''
    recargarPreview()
  }

  async function eliminarFondo() {
    if (!fondoUrl) return
    if (!(await confirmar({
      titulo: '¿Quitar el fondo de la página de la escuela?',
      mensaje: 'La imagen se borra del almacenamiento y la web pública vuelve al fondo por defecto. Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Quitar fondo',
    }))) return
    const nombre = fondoUrl.split('/').pop()
    if (nombre) await supabase.storage.from('landing').remove([nombre])
    await supabase.from('landing_config').update({ fondo_url: null }).eq('id', 1)
    setFondoUrl(null)
    recargarPreview()
  }

  /* ── Galería ── */
  async function cargarGaleria() {
    const { data } = await supabase.from('landing_galeria').select('*').order('orden')
    setGaleria((data ?? []) as GaleriaItem[])
  }

  async function subirFotoGaleria(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true); setUploadErr('')
    const nombre = `foto_${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('landing').upload(nombre, file, { upsert: false })
    if (error) { setUploadErr('Error al subir. Verifica el bucket "landing" en Supabase Storage.'); setSubiendo(false); if (fileGalRef.current) fileGalRef.current.value = ''; return }
    const { data: { publicUrl } } = supabase.storage.from('landing').getPublicUrl(nombre)
    await supabase.from('landing_galeria').insert({ url: publicUrl, orden: galeria.length })
    await cargarGaleria()
    setSubiendo(false)
    if (fileGalRef.current) fileGalRef.current.value = ''
    recargarPreview()
  }

  async function eliminarFoto(item: GaleriaItem) {
    if (!(await confirmar({
      titulo: '¿Eliminar esta foto de la galería?',
      mensaje: 'Desaparece de la web pública de la escuela y el archivo se borra del almacenamiento. Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Eliminar foto',
    }))) return
    const nombreArchivo = item.url.split('/').pop()
    if (nombreArchivo) await supabase.storage.from('landing').remove([nombreArchivo])
    await supabase.from('landing_galeria').delete().eq('id', item.id)
    setGaleria(prev => prev.filter(g => g.id !== item.id))
    recargarPreview()
  }

  /* ── Comunicados ── */
  async function cargarAnuncios() {
    const { data } = await supabase
      .from('anuncios')
      .select('id,titulo,contenido,autor_nombre,created_at,en_landing,imagen_url')
      .eq('tipo', 'global')
      .order('created_at', { ascending: false })
    setAnuncios((data ?? []) as AnuncioRow[])
  }

  async function subirImagenComunicado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendoCom(true)
    const nombre = `comunicado_${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('landing').upload(nombre, file, { upsert: false })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('landing').getPublicUrl(nombre)
      setComImg(publicUrl)
    }
    setSubiendoCom(false)
    if (fileComRef.current) fileComRef.current.value = ''
  }

  async function guardarComunicado() {
    if (!comForm.titulo.trim() && !comImg) { setComErr('Agrega un título o una imagen'); return }
    setGuardandoCom(true); setComErr('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('anuncios').insert({
      titulo:      comForm.titulo.trim() || '—',
      contenido:   comForm.contenido.trim(),
      tipo:        'global',
      autor_id:    user?.id,
      autor_nombre: 'Admin',
      en_landing:  true,
      imagen_url:  comImg ?? null,
    })
    if (error) { setComErr(error.message); setGuardandoCom(false); return }
    setComForm({ titulo: '', contenido: '' }); setComImg(null); setShowForm(false)
    await cargarAnuncios()
    setGuardandoCom(false)
    recargarPreview()
  }

  async function toggleLanding(id: string, actual: boolean) {
    await supabase.from('anuncios').update({ en_landing: !actual }).eq('id', id)
    setAnuncios(prev => prev.map(a => a.id === id ? { ...a, en_landing: !actual } : a))
    recargarPreview()
  }

  async function eliminarComunicado(a: AnuncioRow) {
    if (!(await confirmar({
      titulo: `¿Eliminar el comunicado "${a.titulo}"?`,
      mensaje: 'Se borra de la web pública y del sistema (docentes y estudiantes dejarán de verlo). Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Eliminar comunicado',
    }))) return
    if (a.imagen_url) {
      const nombre = a.imagen_url.split('/').pop()
      if (nombre) await supabase.storage.from('landing').remove([nombre])
    }
    await supabase.from('anuncios').delete().eq('id', a.id)
    setAnuncios(prev => prev.filter(x => x.id !== a.id))
    recargarPreview()
  }

  /* ── init ── */
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: admin } = await supabase.from('user_admin').select('id').eq('id', user.id).maybeSingle()
      if (!admin) { router.push('/admin'); return }
      await Promise.all([cargarGaleria(), cargarAnuncios(), cargarFondo()])
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <svg className="animate-spin h-7 w-7 text-indigo-400" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    </div>
  )

  return (
    <div className="flex flex-col h-screen" style={{ background: '#F6F8FB' }}>
      {dialogo}

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 py-2.5 shrink-0"
        style={{ background: 'white', borderBottom: '1px solid #E4E8EF' }}>
        <Link href="/admin"
          className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Admin
        </Link>
        <span className="text-slate-200">/</span>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#143875,#143875)' }}>
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064"/>
            </svg>
          </div>
          <p className="font-black text-slate-800 text-sm">Web de la Escuela</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={recargarPreview}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: '#f1f5f9', color: '#64748b' }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
            </svg>
            Actualizar vista
          </button>
          <a href="/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: '#EFF3FA', color: '#143875', border: '1.5px solid #b6c5e3' }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            Nueva pestaña
          </a>
        </div>
      </header>

      {/* ── Split view ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Preview iframe ── */}
        <div className="flex-1 min-w-0 relative bg-slate-100" style={{ borderRight: '1px solid #E4E8EF' }}>
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black text-slate-500"
            style={{ background: 'rgba(255,255,255,.9)', border: '1px solid #E4E8EF' }}>
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Vista previa en vivo
          </div>
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src="/"
            className="w-full h-full border-none"
            title="Preview landing"
          />
        </div>

        {/* ── Panel derecho ── */}
        <div className="w-96 shrink-0 flex flex-col" style={{ background: 'white' }}>

          {/* Tabs panel */}
          <div className="flex shrink-0 p-3 gap-2" style={{ borderBottom: '1px solid #f1f5f9' }}>
            <button onClick={() => setPanel('galeria')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all"
              style={panel === 'galeria'
                ? { background: 'linear-gradient(135deg,#143875,#143875)', color: 'white' }
                : { background: '#F6F8FB', color: '#64748b' }}>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              Galería
            </button>
            <button onClick={() => setPanel('comunicados')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all"
              style={panel === 'comunicados'
                ? { background: 'linear-gradient(135deg,#143875,#143875)', color: 'white' }
                : { background: '#F6F8FB', color: '#64748b' }}>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
              </svg>
              Comunicados
            </button>
            <button onClick={() => setPanel('fondo')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all"
              style={panel === 'fondo'
                ? { background: 'linear-gradient(135deg,#143875,#143875)', color: 'white' }
                : { background: '#F6F8FB', color: '#64748b' }}>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18"/>
              </svg>
              Fondo
            </button>
          </div>

          {/* Contenido scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── Fondo ── */}
            {panel === 'fondo' && (
              <>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Imagen de fondo del hero</p>

                {/* Preview actual */}
                <div className="relative w-full rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9', background: '#f1f5f9' }}>
                  {fondoUrl ? (
                    <>
                      <Image src={fondoUrl} alt="Fondo actual" fill className="object-cover" />
                      <div className="absolute inset-0 flex items-end justify-end p-2"
                        style={{ background: 'linear-gradient(to top,rgba(0,0,0,.5) 0%,transparent 60%)' }}>
                        <button onClick={eliminarFondo}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all"
                          style={{ background: 'rgba(239,68,68,.85)' }}>
                          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2"/>
                          </svg>
                          Eliminar
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <p className="text-[11px] text-slate-400 font-semibold">Usando imagen por defecto</p>
                    </div>
                  )}
                </div>

                {/* Upload nuevo fondo */}
                <div
                  onClick={() => !subiendoFondo && fileFondoRef.current?.click()}
                  className="rounded-2xl p-5 text-center cursor-pointer transition-all border-2 border-dashed"
                  style={{ borderColor: subiendoFondo ? '#143875' : '#b6c5e3', background: subiendoFondo ? '#EFF3FA' : '#F6F8FB' }}>
                  <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center"
                    style={{ background: '#EFF3FA' }}>
                    {subiendoFondo ? (
                      <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#143875" strokeWidth="4"/>
                        <path className="opacity-75" fill="#143875" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#143875" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                      </svg>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-600">
                    {subiendoFondo ? 'Subiendo…' : fondoUrl ? 'Reemplazar imagen de fondo' : 'Subir imagen de fondo'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WEBP · Recomendado 1920×1080</p>
                </div>
                <input ref={fileFondoRef} type="file" accept="image/*" className="hidden" onChange={subirFondo} />

                {fondoErr && <p className="text-xs text-red-500 font-semibold px-1">{fondoErr}</p>}
              </>
            )}

            {/* ── Galería ── */}
            {panel === 'galeria' && (
              <>
                {/* Upload */}
                <div
                  onClick={() => !subiendo && fileGalRef.current?.click()}
                  className="rounded-2xl p-5 text-center cursor-pointer transition-all border-2 border-dashed"
                  style={{ borderColor: subiendo ? '#143875' : '#b6c5e3', background: subiendo ? '#EFF3FA' : '#F6F8FB' }}>
                  <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center"
                    style={{ background: '#EFF3FA' }}>
                    {subiendo ? (
                      <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#143875" strokeWidth="4"/>
                        <path className="opacity-75" fill="#143875" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#143875" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                      </svg>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-600">
                    {subiendo ? 'Subiendo…' : 'Haz clic para subir foto'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WEBP</p>
                </div>
                <input ref={fileGalRef} type="file" accept="image/*" className="hidden" onChange={subirFotoGaleria} />

                {uploadErr && (
                  <p className="text-xs text-red-500 font-semibold px-1">{uploadErr}</p>
                )}

                {/* Grid galería */}
                {galeria.length === 0 ? (
                  <p className="text-center text-slate-300 text-xs py-4">Sin fotos aún</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {galeria.map(img => (
                      <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden group">
                        <Image src={img.url} alt={img.descripcion ?? 'Foto'} fill className="object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: 'rgba(0,0,0,.5)' }}>
                          <button onClick={() => eliminarFoto(img)}
                            className="p-1.5 rounded-lg text-white"
                            style={{ background: '#ef4444' }}>
                            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Comunicados ── */}
            {panel === 'comunicados' && (
              <>
                {/* Botón nuevo */}
                <button onClick={() => { setShowForm(v => !v); setComErr('') }}
                  className="w-full py-2.5 rounded-xl text-xs font-black transition-all"
                  style={showForm
                    ? { background: '#f1f5f9', color: '#64748b' }
                    : { background: 'linear-gradient(135deg,#143875,#143875)', color: 'white' }}>
                  {showForm ? 'Cancelar' : '+ Nuevo comunicado'}
                </button>

                {/* Formulario */}
                {showForm && (
                  <div className="rounded-2xl p-4 space-y-3"
                    style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }}>

                    <input placeholder="Título (opcional)" value={comForm.titulo}
                      onChange={e => setComForm(f => ({ ...f, titulo: e.target.value }))}
                      className={inputCls} style={inputStyle} />

                    <textarea placeholder="Texto del comunicado (opcional)" value={comForm.contenido}
                      onChange={e => setComForm(f => ({ ...f, contenido: e.target.value }))}
                      rows={3} className={inputCls} style={inputStyle} />

                    {/* Upload imagen comunicado */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Imagen (opcional)</p>
                      {comImg ? (
                        <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                          <Image src={comImg} alt="imagen comunicado" fill className="object-cover" />
                          <button onClick={() => setComImg(null)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg text-white"
                            style={{ background: 'rgba(239,68,68,.9)' }}>
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div onClick={() => !subiendoCom && fileComRef.current?.click()}
                          className="rounded-xl p-4 text-center cursor-pointer border-2 border-dashed transition-all"
                          style={{ borderColor: '#b6c5e3', background: 'white' }}>
                          {subiendoCom ? (
                            <svg className="animate-spin mx-auto" width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#143875" strokeWidth="4"/>
                              <path className="opacity-75" fill="#143875" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                          ) : (
                            <p className="text-[11px] font-bold text-slate-400">Subir imagen</p>
                          )}
                        </div>
                      )}
                      <input ref={fileComRef} type="file" accept="image/*" className="hidden" onChange={subirImagenComunicado} />
                    </div>

                    {comErr && <p className="text-xs text-red-500 font-semibold">{comErr}</p>}

                    <button onClick={guardarComunicado} disabled={guardandoCom}
                      className="w-full py-2.5 rounded-xl text-xs font-black text-white transition-all"
                      style={{ background: 'linear-gradient(135deg,#059669,#0d9488)', opacity: guardandoCom ? 0.7 : 1 }}>
                      {guardandoCom ? 'Publicando…' : 'Publicar en la web ✓'}
                    </button>
                  </div>
                )}

                {/* Lista comunicados */}
                {anuncios.length === 0 ? (
                  <p className="text-center text-slate-300 text-xs py-4">Sin comunicados aún</p>
                ) : (
                  <div className="space-y-3">
                    {anuncios.map(a => (
                      <div key={a.id} className="rounded-2xl overflow-hidden transition-all"
                        style={{ border: `1.5px solid ${a.en_landing ? '#b6c5e3' : '#e2e8f0'}` }}>
                        <div className="h-1" style={{ background: a.en_landing ? 'linear-gradient(90deg,#143875,#143875)' : '#e2e8f0' }} />

                        {/* Imagen si tiene */}
                        {a.imagen_url && (
                          <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                            <Image src={a.imagen_url} alt={a.titulo} fill className="object-cover" />
                          </div>
                        )}

                        <div className="p-3">
                          <p className="font-bold text-slate-800 text-xs truncate">{a.titulo}</p>
                          {a.contenido && (
                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{a.contenido}</p>
                          )}
                          <p className="text-[10px] text-slate-300 mt-1">
                            {new Date(a.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>

                          <div className="flex items-center gap-2 mt-2">
                            {/* Toggle visible */}
                            <button onClick={() => toggleLanding(a.id, a.en_landing)}
                              className="flex items-center gap-1.5 flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                              style={a.en_landing
                                ? { background: '#EFF3FA', color: '#143875' }
                                : { background: '#f1f5f9', color: '#94a3b8' }}>
                              <span className={`w-3 h-3 rounded-full transition-colors ${a.en_landing ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                              {a.en_landing ? 'Visible en web' : 'Oculto'}
                            </button>
                            {/* Eliminar */}
                            <button onClick={() => eliminarComunicado(a)}
                              className="p-1.5 rounded-lg transition-all"
                              style={{ background: '#fef2f2', color: '#ef4444' }}>
                              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
