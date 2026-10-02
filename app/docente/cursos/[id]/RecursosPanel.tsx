'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BUCKET_RECURSOS, signedUrlMap } from '@/lib/storage'
import Spinner from '@/components/Spinner'
import { useConfirm } from '@/components/ConfirmModal'

type TipoRecurso = 'pdf' | 'link' | 'imagen' | 'video'

interface Recurso {
  id: string
  sesion_id: string
  nombre: string
  tipo: TipoRecurso
  url: string
  orden: number
}

const BUCKET = BUCKET_RECURSOS
const esArchivoTipo = (t: TipoRecurso) => t === 'pdf' || t === 'imagen'

const TIPO_META: Record<TipoRecurso, { label: string; icon: React.ReactNode; bg: string; color: string; border: string }> = {
  pdf: {
    label: 'PDF',
    bg: '#fef2f2', color: '#dc2626', border: '#fecaca',
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
      </svg>
    ),
  },
  imagen: {
    label: 'Imagen',
    bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0',
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21"/>
      </svg>
    ),
  },
  link: {
    label: 'Enlace',
    bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe',
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
      </svg>
    ),
  },
  video: {
    label: 'Video',
    bg: '#fdf4ff', color: '#9333ea', border: '#e9d5ff',
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
      </svg>
    ),
  },
}


const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-slate-800 placeholder-slate-300 outline-none transition-all bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:bg-white'
const labelCls = 'block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5'

export default function RecursosPanel({ sesionId, color }: { sesionId: string; color: string }) {
  const [recursos,    setRecursos]    = useState<Recurso[]>([])
  const [firmadas,    setFirmadas]    = useState<Record<string, string>>({}) // path → URL firmada (pdf/imagen)
  const [loading,     setLoading]     = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)

  // Form
  const [tipo,       setTipo]       = useState<TipoRecurso>('link')
  const [nombre,     setNombre]     = useState('')
  const [url,        setUrl]        = useState('')
  const [archivo,    setArchivo]    = useState<File | null>(null)
  const [subiendo,   setSubiendo]   = useState(false)
  const [progreso,   setProgreso]   = useState(0)
  const [errorForm,  setErrorForm]  = useState('')

  // Eliminar
  const { confirmar, dialogo } = useConfirm()
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  useEffect(() => {
    cargar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesionId])

  async function cargar() {
    setLoading(true)
    const { data } = await supabase
      .from('recursos').select('id,sesion_id,nombre,tipo,url,orden')
      .eq('sesion_id', sesionId).order('orden')
    const recs = (data ?? []) as Recurso[]
    setRecursos(recs)
    // Firmar los archivos (pdf/imagen); link/video guardan URL externa tal cual.
    setFirmadas(await signedUrlMap(BUCKET, recs.filter(r => esArchivoTipo(r.tipo)).map(r => r.url)))
    setLoading(false)
  }

  // href real de un recurso: URL firmada para archivos, URL externa para link/video.
  const hrefRecurso = (r: Recurso) => (esArchivoTipo(r.tipo) ? firmadas[r.url] : r.url) || undefined

  function resetForm() {
    setTipo('link'); setNombre(''); setUrl(''); setArchivo(null); setErrorForm(''); setProgreso(0)
  }

  async function handleAgregar(e: React.FormEvent) {
    e.preventDefault()
    setErrorForm('')
    const esArchivo = tipo === 'pdf' || tipo === 'imagen'

    if (esArchivo && !archivo) { setErrorForm('Selecciona un archivo.'); return }
    if (!esArchivo && !url.trim()) { setErrorForm('Ingresa una URL.'); return }
    if (!nombre.trim()) { setErrorForm('Ingresa un nombre.'); return }

    setSubiendo(true)
    let finalUrl = url.trim()

    if (esArchivo && archivo) {
      setProgreso(20)
      const ext   = archivo.name.split('.').pop()
      const path  = `${sesionId}/${Date.now()}_${nombre.trim().replace(/\s+/g, '_')}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, archivo, { upsert: false })
      if (upErr) {
        setErrorForm('Error al subir archivo: ' + upErr.message)
        setSubiendo(false); setProgreso(0); return
      }
      // Guardamos el PATH del objeto; se firma al momento de abrirlo.
      finalUrl = path
      setProgreso(90)
    }

    const siguienteOrden = recursos.length > 0 ? Math.max(...recursos.map(r => r.orden)) + 1 : 1
    const { error: insErr } = await supabase.from('recursos').insert({
      sesion_id: sesionId, nombre: nombre.trim(), tipo, url: finalUrl, orden: siguienteOrden,
    })

    setSubiendo(false); setProgreso(0)
    if (insErr) { setErrorForm('Error al guardar: ' + insErr.message); return }
    resetForm(); setMostrarForm(false)
    await cargar()
  }

  async function handleEliminar(r: Recurso) {
    if (!(await confirmar({
      titulo: `¿Eliminar el recurso "${r.nombre}"?`,
      mensaje: esArchivoTipo(r.tipo)
        ? 'El archivo se borra del almacenamiento y tus alumnos ya no podrán verlo ni descargarlo. Esta acción no se puede deshacer.'
        : 'Tus alumnos dejarán de ver este enlace en la sesión. Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Eliminar recurso',
    }))) return
    setEliminandoId(r.id)
    // Si es archivo, borrar del storage también. r.url ya es el path del objeto.
    if (esArchivoTipo(r.tipo)) {
      try { await supabase.storage.from(BUCKET).remove([r.url]) }
      catch { /* si falla el borrado del storage no bloqueamos */ }
    }
    await supabase.from('recursos').delete().eq('id', r.id)
    setEliminandoId(null)
    await cargar()
  }

  const gradient = `linear-gradient(135deg, ${color}ee, ${color}99)`

  return (
    <div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px dashed ${color}40`, background: `${color}04` }}>
      <div className="px-3 py-2.5">

        {/* Cabecera */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
            </svg>
            Recursos {recursos.length > 0 && `· ${recursos.length}`}
          </span>
          <button
            onClick={() => { setMostrarForm(!mostrarForm); resetForm() }}
            className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg text-white transition-all"
            style={{ background: mostrarForm ? '#94a3b8' : gradient }}>
            {mostrarForm
              ? <><svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>Cancelar</>
              : <><svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>Agregar</>
            }
          </button>
        </div>

        {/* Formulario */}
        {mostrarForm && (
          <form onSubmit={handleAgregar}
            className="rounded-xl p-3 mb-3 space-y-2.5"
            style={{ background: 'white', border: `1.5px solid ${color}25` }}>

            {/* Selector de tipo */}
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(TIPO_META) as TipoRecurso[]).map(t => {
                const m = TIPO_META[t]
                return (
                  <button key={t} type="button" onClick={() => { setTipo(t); setArchivo(null); setUrl('') }}
                    className="flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-black transition-all border-2"
                    style={tipo === t
                      ? { background: m.bg, borderColor: m.border, color: m.color }
                      : { background: 'white', borderColor: '#e2e8f0', color: '#94a3b8' }}>
                    <span style={{ color: tipo === t ? m.color : '#cbd5e1' }}>{m.icon}</span>
                    {m.label}
                  </button>
                )
              })}
            </div>

            {/* Nombre */}
            <div>
              <label className={labelCls}>Nombre <span className="text-rose-400">*</span></label>
              <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder={tipo === 'pdf' ? 'Ej: Ficha de trabajo' : tipo === 'imagen' ? 'Ej: Mapa conceptual' : tipo === 'video' ? 'Ej: Video explicativo' : 'Ej: Artículo de referencia'}
                className={inputCls}/>
            </div>

            {/* URL o archivo según tipo */}
            {tipo === 'link' || tipo === 'video' ? (
              <div>
                <label className={labelCls}>{tipo === 'video' ? 'URL del video' : 'URL del enlace'} <span className="text-rose-400">*</span></label>
                <input type="url" required value={url} onChange={e => setUrl(e.target.value)}
                  placeholder={tipo === 'video' ? 'https://youtube.com/...' : 'https://...'}
                  className={inputCls}/>
              </div>
            ) : (
              <div>
                <label className={labelCls}>{tipo === 'pdf' ? 'Archivo PDF' : 'Imagen'} <span className="text-rose-400">*</span></label>
                <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all border border-dashed"
                  style={{ background: archivo ? `${color}08` : '#f8fafc', borderColor: archivo ? color : '#cbd5e1' }}>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={archivo ? color : '#94a3b8'} strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                  </svg>
                  <span className="text-xs font-semibold truncate" style={{ color: archivo ? color : '#94a3b8' }}>
                    {archivo ? archivo.name : `Seleccionar ${tipo === 'pdf' ? 'PDF' : 'imagen'}…`}
                  </span>
                  <input type="file" className="sr-only"
                    accept={tipo === 'pdf' ? '.pdf' : 'image/*'}
                    onChange={e => setArchivo(e.target.files?.[0] ?? null)}/>
                </label>
                {archivo && (
                  <p className="text-[10px] text-slate-400 mt-1 ml-1">
                    {(archivo.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>
            )}

            {/* Barra de progreso */}
            {subiendo && progreso > 0 && (
              <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progreso}%`, background: gradient }}/>
              </div>
            )}

            {errorForm && (
              <p className="text-xs text-rose-500 font-semibold">{errorForm}</p>
            )}

            <div className="flex gap-2 pt-0.5">
              <button type="submit" disabled={subiendo}
                className="flex-1 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50 transition-all"
                style={{ background: gradient }}>
                <span className="flex items-center justify-center gap-1.5">
                  {subiendo && <Spinner/>}
                  {subiendo ? 'Subiendo...' : 'Guardar recurso'}
                </span>
              </button>
              <button type="button" onClick={() => { setMostrarForm(false); resetForm() }}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500"
                style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0' }}>
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Lista de recursos */}
        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner cls="h-4 w-4 text-slate-300"/>
          </div>
        ) : recursos.length === 0 && !mostrarForm ? (
          <p className="text-center text-[11px] text-slate-300 font-semibold py-3">Sin recursos aún</p>
        ) : (
          <div className="space-y-1.5">
            {recursos.map(r => {
              const m = TIPO_META[r.tipo]
              return (
                <div key={r.id} className="flex items-center gap-2 px-2.5 py-2 rounded-xl group"
                  style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                  {/* Icono tipo */}
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: m.bg, color: m.color }}>
                    {m.icon}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <a href={hrefRecurso(r)} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-semibold text-slate-700 truncate block hover:underline transition-colors">
                      {r.nombre}
                    </a>
                    <a href={hrefRecurso(r)} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] truncate block transition-colors hover:underline"
                      style={{ color: m.color }}>
                      {esArchivoTipo(r.tipo) ? 'Ver archivo' : r.url}
                    </a>
                  </div>
                  {/* Badge tipo */}
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>
                    {m.label}
                  </span>
                  {/* Eliminar */}
                  <button onClick={() => handleEliminar(r)} disabled={eliminandoId === r.id} title="Eliminar"
                    className="w-6 h-6 flex items-center justify-center rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0 disabled:opacity-40"
                    style={{ color: '#fca5a5' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#fca5a5')}>
                    {eliminandoId === r.id ? <Spinner size={11} /> : (
                      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4h4v2"/>
                      </svg>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {dialogo}
    </div>
  )
}
