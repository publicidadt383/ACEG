'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/components/ConfirmModal'
import { PORTAL_FONDO_DEFAULT, getPortalFondo, guardarPortalFondoCache } from '@/lib/portalFondo'

const MAX_MB = 8

interface Props { embedded?: boolean }

export function FondoSistemaContent({ embedded = false }: Props = {}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const { confirmar, dialogo } = useConfirm()

  const [loading,  setLoading]  = useState(true)
  const [fondoUrl, setFondoUrl] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error,    setError]    = useState('')
  const [ok,       setOk]       = useState('')

  useEffect(() => {
    async function init() {
      if (!embedded) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { data: adm } = await supabase.from('user_admin').select('id').eq('id', user.id).maybeSingle()
        if (!adm) { router.push('/admin'); return }
      }
      setFondoUrl(await getPortalFondo())
      setLoading(false)
    }
    init()
  }, [embedded, router])

  const borrarArchivo = async (url: string) => {
    const nombre = url.split('/').pop()
    if (nombre) await supabase.storage.from('landing').remove([nombre])
  }

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setError(''); setOk('')
    if (!file.type.startsWith('image/')) { setError('El archivo debe ser una imagen (JPG, PNG o WEBP).'); return }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`La imagen pesa más de ${MAX_MB} MB. Redúcela e inténtalo otra vez.`); return }

    setSubiendo(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const nombre = `portal_fondo_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('landing').upload(nombre, file, { upsert: false, contentType: file.type })
    if (upErr) { setError('No se pudo subir la imagen.'); setSubiendo(false); return }

    const { data: { publicUrl } } = supabase.storage.from('landing').getPublicUrl(nombre)
    const { error: dbErr } = await supabase.from('landing_config').update({ portal_fondo_url: publicUrl }).eq('id', 1)
    if (dbErr) {
      await supabase.storage.from('landing').remove([nombre])
      setError('No se pudo guardar. Verifica que la migración 0005_portal_fondo.sql esté aplicada en Supabase.')
      setSubiendo(false)
      return
    }
    if (fondoUrl) await borrarArchivo(fondoUrl)
    guardarPortalFondoCache(publicUrl)
    setFondoUrl(publicUrl)
    setSubiendo(false)
    setOk('Fondo actualizado. Se verá en todos los portales al volver a abrirlos.')
  }

  async function restaurar() {
    if (!fondoUrl) return
    if (!(await confirmar({
      titulo: '¿Restaurar el fondo por defecto?',
      mensaje: 'La imagen actual se borra del almacenamiento y los portales vuelven a la foto del colegio. Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Restaurar',
    }))) return
    setError(''); setOk('')
    const { error: dbErr } = await supabase.from('landing_config').update({ portal_fondo_url: null }).eq('id', 1)
    if (dbErr) { setError('No se pudo restaurar el fondo.'); return }
    await borrarArchivo(fondoUrl)
    guardarPortalFondoCache(null)
    setFondoUrl(null)
    setOk('Se restauró el fondo por defecto.')
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <svg className="animate-spin h-7 w-7 text-slate-300" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    </div>
  )

  const vista = fondoUrl ?? PORTAL_FONDO_DEFAULT

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {dialogo}

      <div>
        <h2 className="text-lg font-black text-slate-800">Fondo del sistema</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Imagen que se ve detrás del menú principal al iniciar sesión (administración, docentes y estudiantes).
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* Vista previa simulando el portal */}
        <div className="relative w-full rounded-2xl overflow-hidden shadow-sm" style={{ aspectRatio: '16/10', background: '#0B2447' }}>
          <Image key={vista} src={vista} alt="Vista previa del fondo" fill sizes="(max-width: 1024px) 100vw, 640px" className="object-cover" />
          <div aria-hidden className="absolute inset-0" style={{
            background: `radial-gradient(140% 90% at 50% 30%, transparent 0%, rgba(11,36,71,.35) 60%, rgba(8,17,33,.7) 100%),
                         linear-gradient(180deg, rgba(11,36,71,.6) 0%, rgba(11,36,71,.35) 30%, rgba(15,23,42,.8) 100%)`,
          }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white px-4">
            <div className="relative w-14 h-14" style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.45))' }}>
              <Image src="/aceg-isotipo-blanco.png" alt="" fill sizes="56px" className="object-contain" />
            </div>
            <p className="font-black text-lg" style={{ textShadow: '0 2px 10px rgba(0,0,0,.5)' }}>Portal de la escuela</p>
            <div className="grid grid-cols-3 gap-2 mt-2 w-full max-w-xs">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-12 rounded-xl" style={{ background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.25)', backdropFilter: 'blur(6px)' }} />
              ))}
            </div>
          </div>
          <span className="absolute top-3 left-3 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(255,255,255,.9)', color: '#475569' }}>
            {fondoUrl ? 'Fondo personalizado' : 'Fondo por defecto'}
          </span>
        </div>

        {/* Acciones */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => !subiendo && fileRef.current?.click()}
            disabled={subiendo}
            className="w-full rounded-2xl p-5 text-center border-2 border-dashed transition-all"
            style={{ borderColor: subiendo ? '#C00F37' : '#E4C7CE', background: subiendo ? '#FDF2F4' : '#FAFAFB' }}>
            <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center" style={{ background: '#FDF2F4' }}>
              {subiendo ? (
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#C00F37" strokeWidth="4"/>
                  <path className="opacity-75" fill="#C00F37" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              ) : (
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#C00F37" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
              )}
            </div>
            <p className="text-sm font-bold text-slate-700">
              {subiendo ? 'Subiendo…' : fondoUrl ? 'Reemplazar imagen' : 'Subir imagen de fondo'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">JPG, PNG o WEBP · máx. {MAX_MB} MB · recomendado 1920×1080</p>
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={subir} />

          {fondoUrl && (
            <button type="button" onClick={restaurar}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca' }}>
              Restaurar fondo por defecto
            </button>
          )}

          {error && <p className="text-xs text-red-600 font-semibold px-1">{error}</p>}
          {ok && <p className="text-xs text-emerald-600 font-semibold px-1">{ok}</p>}

          <p className="text-[11px] leading-relaxed text-slate-400 px-1">
            Consejo: usa fotos horizontales y no muy cargadas en el centro; el sistema les aplica un velo oscuro para que el menú se lea bien.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AdminFondoSistemaPage() {
  return (
    <div className="min-h-screen p-4 lg:p-6" style={{ background: '#F6F8FB' }}>
      <FondoSistemaContent />
    </div>
  )
}
