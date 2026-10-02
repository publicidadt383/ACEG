'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { getSesionAlumno } from '@/lib/auth'
import { timeAgo } from '@/utils/formatters'

interface Anuncio {
  id: string
  titulo: string
  contenido: string
  tipo: string
  autor_nombre: string
  created_at: string
  imagen_url: string | null
  asignaciones: {
    grado: string
    grupo: string
    cursos: { nombre: string; color: string } | null
  } | null
}


export default function AlumnoAnunciosPage() {
  const router = useRouter()

  const [anuncios,  setAnuncios]  = useState<Anuncio[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filtro,    setFiltro]    = useState<'todos' | 'globales' | 'cursos'>('todos')
  const [lightbox,  setLightbox]  = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const sesion = await getSesionAlumno<{ grado: string; grupo: string }>('grado,grupo')
      if (!sesion) { router.push('/login'); return }
      const { alumno } = sesion

      // Anuncios globales
      const { data: globales } = await supabase
        .from('anuncios')
        .select('id,titulo,contenido,tipo,autor_nombre,created_at,imagen_url,asignaciones(grado,grupo,cursos(nombre,color))')
        .eq('tipo', 'global')
        .order('created_at', { ascending: false })

      // Anuncios de los cursos de su sección (solo del ciclo activo)
      const cicloId = (await getCicloActivo())?.id ?? null
      let asigsQ = supabase
        .from('asignaciones').select('id').eq('grado', alumno.grado).eq('grupo', alumno.grupo)
      if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
      const { data: asigs } = await asigsQ

      let cursoAnuncios: Anuncio[] = []
      if (asigs?.length) {
        const { data: ca } = await supabase
          .from('anuncios')
          .select('id,titulo,contenido,tipo,autor_nombre,created_at,imagen_url,asignaciones(grado,grupo,cursos(nombre,color))')
          .eq('tipo', 'curso')
          .in('asignacion_id', asigs.map(a => a.id))
          .order('created_at', { ascending: false })
        cursoAnuncios = (ca ?? []) as unknown as Anuncio[]
      }

      // Unir y ordenar por fecha
      const todos = [
        ...(globales ?? []) as unknown as Anuncio[],
        ...cursoAnuncios,
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setAnuncios(todos)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return null

  const mostrar = anuncios.filter(a =>
    filtro === 'todos' ? true :
    filtro === 'globales' ? a.tipo === 'global' :
    a.tipo === 'curso'
  )

  const countGlobal = anuncios.filter(a => a.tipo === 'global').length
  const countCurso  = anuncios.filter(a => a.tipo === 'curso').length

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Anuncios</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {anuncios.length === 0 ? 'No hay anuncios por ahora' : `${anuncios.length} ${anuncios.length === 1 ? 'anuncio' : 'anuncios'}`}
          </p>
        </div>
        {anuncios.length > 0 && (
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1.5px solid #ccfbf1' }}>
            {([
              { val: 'todos',    label: `Todos (${anuncios.length})` },
              { val: 'globales', label: `General (${countGlobal})` },
              { val: 'cursos',   label: `Mis cursos (${countCurso})` },
            ] as const).map(t => (
              <button key={t.val} onClick={() => setFiltro(t.val)}
                className="px-3 py-2 text-[11px] font-black transition-all"
                style={filtro === t.val
                  ? { background: '#0d9488', color: 'white' }
                  : { background: 'white', color: '#64748b' }}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lista */}
      {mostrar.length === 0 ? (
        <div className="rounded-2xl flex flex-col items-center justify-center py-24 gap-4"
          style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#f0fdfa' }}>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#5eead4" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-500">Sin anuncios</p>
            <p className="text-xs text-slate-400 mt-1">
              {filtro === 'todos' ? 'Tus docentes aún no han publicado nada' : 'No hay anuncios en esta categoría'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {mostrar.map(a => {
            const isGlobal = a.tipo === 'global'
            const col      = isGlobal ? '#0d9488' : (a.asignaciones?.cursos?.color ?? '#0d9488')
            const badgeLabel = isGlobal ? 'Comunicado general' : a.asignaciones?.cursos?.nombre ?? 'Curso'

            return (
              <div key={a.id} className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 2px 12px rgba(13,148,136,.05)' }}>
                <div className="h-1" style={{ background: `linear-gradient(90deg,${col},${col}88)` }} />
                {a.imagen_url && (
                  <div className="relative w-full cursor-zoom-in" style={{ aspectRatio: '16/9' }}
                    onClick={() => setLightbox(a.imagen_url)}>
                    <Image src={a.imagen_url} alt={a.titulo} fill className="object-cover" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Ícono */}
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${col}15`, border: `1.5px solid ${col}25` }}>
                      {isGlobal ? (
                        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke={col} strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
                        </svg>
                      ) : (
                        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke={col} strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: `${col}15`, color: col }}>
                          {badgeLabel}
                        </span>
                        {!isGlobal && a.asignaciones && (
                          <span className="text-[10px] text-slate-400">
                            {a.asignaciones.grado} · Sección {a.asignaciones.grupo}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">{timeAgo(a.created_at)}</span>
                      </div>
                      <h3 className="text-sm font-black text-slate-800 leading-snug">{a.titulo}</h3>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed whitespace-pre-wrap">{a.contenido}</p>
                      <p className="text-[10px] text-slate-400 mt-2">Por {a.autor_nombre}</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.92)', backdropFilter: 'blur(12px)' }}
          onClick={() => setLightbox(null)}>
          <button
            className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)' }}
            onClick={() => setLightbox(null)}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="imagen" className="w-full h-auto max-h-[90vh] object-contain rounded-2xl" />
          </div>
        </div>
      )}
    </div>
  )
}
