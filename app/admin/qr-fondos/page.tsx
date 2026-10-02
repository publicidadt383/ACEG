'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { QrFondo } from '@/lib/qrFondo'
import { useConfirm } from '@/components/ConfirmModal'

interface SeccionInfo { grado: string; grupo: string; salon_nombre: string | null }

const GRADOS_ORDEN = [
  '1° Primaria','2° Primaria','3° Primaria','4° Primaria','5° Primaria','6° Primaria',
  '1° Secundaria','2° Secundaria','3° Secundaria','4° Secundaria','5° Secundaria',
]

type Slot =
  | { tipo: 'general'; grado?: never; grupo?: never }
  | { tipo: 'grado';   grado: string; grupo?: never }
  | { tipo: 'seccion'; grado: string; grupo: string }

export default function QrFondosPage() {
  const router = useRouter()

  const [loading,    setLoading]    = useState(true)
  const [fondos,     setFondos]     = useState<QrFondo[]>([])
  const [secciones,  setSecciones]  = useState<SeccionInfo[]>([])
  const [subiendo,   setSubiendo]   = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)
  const [err,        setErr]        = useState('')
  const { confirmar, dialogo } = useConfirm()

  const fileRef        = useRef<HTMLInputElement>(null)
  const slotPendiente  = useRef<Slot | null>(null)

  async function cargarFondos() {
    const { data } = await supabase.from('qr_fondos').select('*')
    setFondos((data ?? []) as QrFondo[])
  }

  async function cargarSecciones() {
    const { data: ciclo } = await supabase.from('ciclos').select('id').eq('activo', true).eq('tipo', 'lectivo').maybeSingle()
    if (!ciclo) { setSecciones([]); return }

    // Solo secciones con alumnos matriculados en el ciclo activo
    const { data: mats } = await supabase
      .from('matriculas').select('grado,grupo').eq('ciclo_id', ciclo.id)

    const { data: sals } = await supabase.from('salones').select('grado,grupo,nombre')
    type SalRow = { grado: string; grupo: string; nombre: string | null }
    type MatRow = { grado: string; grupo: string }
    const salonMap: Record<string, string | null> = {}
    for (const s of (sals ?? []) as SalRow[])
      salonMap[`${s.grado}-${s.grupo}`] = s.nombre ?? null

    const seen = new Set<string>()
    const lista: SeccionInfo[] = []
    for (const m of (mats ?? []) as MatRow[]) {
      const k = `${m.grado}-${m.grupo}`
      if (seen.has(k)) continue
      seen.add(k)
      lista.push({ grado: m.grado, grupo: m.grupo, salon_nombre: salonMap[k] ?? null })
    }

    lista.sort((a, b) => {
      const gi = GRADOS_ORDEN.indexOf(a.grado) - GRADOS_ORDEN.indexOf(b.grado)
      return gi !== 0 ? gi : a.grupo.localeCompare(b.grupo)
    })
    setSecciones(lista)
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: adm } = await supabase.from('user_admin').select('id').eq('id', user.id).maybeSingle()
      if (!adm) { router.push('/admin'); return }
      await Promise.all([cargarFondos(), cargarSecciones()])
      setLoading(false)
    }
    init()
  }, [router])

  function slotKey(slot: Slot) {
    if (slot.tipo === 'general') return 'general'
    if (slot.tipo === 'grado')   return `grado:${slot.grado}`
    return `seccion:${slot.grado}:${slot.grupo}`
  }

  function fondoDeSlot(slot: Slot): QrFondo | undefined {
    if (slot.tipo === 'general')
      return fondos.find(f => f.tipo === 'general')
    if (slot.tipo === 'grado')
      return fondos.find(f => f.tipo === 'grado' && f.grado === slot.grado)
    return fondos.find(f => f.tipo === 'seccion' && f.grado === slot.grado && f.grupo === slot.grupo)
  }

  function abrirSelector(slot: Slot) {
    slotPendiente.current = slot
    fileRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !slotPendiente.current) return
    const slot = slotPendiente.current
    const key  = slotKey(slot)
    setSubiendo(key); setErr('')

    const sufijo = slot.tipo === 'general'
      ? 'general'
      : slot.tipo === 'grado'
      ? `grado_${slot.grado!.replace(/[^a-z0-9]/gi, '_')}`
      : `seccion_${slot.grado!.replace(/[^a-z0-9]/gi, '_')}_${slot.grupo!.replace(/[^a-z0-9]/gi, '_')}`
    const nombre = `qr_fondo_${sufijo}_${Date.now()}.${file.name.split('.').pop()}`

    const { error: upErr } = await supabase.storage.from('landing').upload(nombre, file, { upsert: false })
    if (upErr) { setErr('Error al subir la imagen.'); setSubiendo(null); if (fileRef.current) fileRef.current.value = ''; return }

    const { data: { publicUrl } } = supabase.storage.from('landing').getPublicUrl(nombre)

    const anterior = fondoDeSlot(slot)
    if (anterior) {
      const archivoAnterior = anterior.fondo_url.split('/').pop()
      if (archivoAnterior) await supabase.storage.from('landing').remove([archivoAnterior])
      await supabase.from('qr_fondos').update({ fondo_url: publicUrl }).eq('id', anterior.id)
    } else {
      await supabase.from('qr_fondos').insert({
        tipo:      slot.tipo,
        grado:     slot.tipo !== 'general' ? slot.grado : null,
        grupo:     slot.tipo === 'seccion' ? slot.grupo : null,
        fondo_url: publicUrl,
      })
    }

    await cargarFondos()
    setSubiendo(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function eliminarFondo(slot: Slot) {
    const fondo = fondoDeSlot(slot)
    if (!fondo) return
    if (!(await confirmar({
      titulo: '¿Eliminar este fondo de QR?',
      mensaje: 'La imagen se borra del almacenamiento y los QR de este alcance vuelven al fondo por defecto. Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Eliminar fondo',
    }))) return
    const key = slotKey(slot)
    setEliminando(key)
    const archivo = fondo.fondo_url.split('/').pop()
    if (archivo) await supabase.storage.from('landing').remove([archivo])
    await supabase.from('qr_fondos').delete().eq('id', fondo.id)
    await cargarFondos()
    setEliminando(null)
  }

  const gradosUnicos = [...new Set(secciones.map(s => s.grado))]
    .sort((a, b) => GRADOS_ORDEN.indexOf(a) - GRADOS_ORDEN.indexOf(b))

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <svg className="animate-spin h-6 w-6 text-indigo-400" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#F6F8FB' }}>
      {dialogo}

      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center gap-3 px-4 py-3"
        style={{ background: 'white', borderBottom: '1px solid #E4E8EF' }}>
        <Link href="/admin/salones"
          className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Salones
        </Link>
        <span className="text-slate-200">/</span>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#143875,#143875)' }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <p className="font-black text-slate-800 text-sm">Fondos de tarjeta QR</p>
        </div>
        <p className="ml-auto text-[11px] text-slate-400 font-medium hidden sm:block">
          Prioridad: Sección &gt; Grado &gt; General
        </p>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">

        {err && (
          <div className="rounded-xl px-4 py-3 text-sm font-semibold text-red-600"
            style={{ background: '#fef2f2', border: '1.5px solid #fecaca' }}>
            {err}
          </div>
        )}

        {/* ── GENERAL ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#143875,#143875)' }}>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
              </svg>
            </div>
            <h2 className="font-black text-slate-800">General</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-indigo-600"
              style={{ background: '#EFF3FA' }}>
              Aplica a todos si no hay fondo específico
            </span>
          </div>
          <div className="max-w-xs">
            <FondoSlot
              slot={{ tipo: 'general' }}
              fondo={fondoDeSlot({ tipo: 'general' })}
              subiendo={subiendo === 'general'}
              eliminando={eliminando === 'general'}
              onSubir={() => abrirSelector({ tipo: 'general' })}
              onEliminar={() => eliminarFondo({ tipo: 'general' })}
            />
          </div>
        </section>

        {/* ── POR GRADO (solo activos) ── */}
        {gradosUnicos.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#0d9488,#06b6d4)' }}>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
              </div>
              <h2 className="font-black text-slate-800">Por Grado</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-teal-700"
                style={{ background: '#f0fdfa' }}>
                Sobreescribe el general para ese grado
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {gradosUnicos.map(grado => (
                <div key={grado}>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2 truncate">{grado}</p>
                  <FondoSlot
                    slot={{ tipo: 'grado', grado }}
                    fondo={fondoDeSlot({ tipo: 'grado', grado })}
                    subiendo={subiendo === `grado:${grado}`}
                    eliminando={eliminando === `grado:${grado}`}
                    onSubir={() => abrirSelector({ tipo: 'grado', grado })}
                    onEliminar={() => eliminarFondo({ tipo: 'grado', grado })}
                    compact
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── POR SECCIÓN (solo activas) ── */}
        {gradosUnicos.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#ec4899,#f97316)' }}>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/>
                </svg>
              </div>
              <h2 className="font-black text-slate-800">Por Sección</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: '#fdf4ff', color: '#ec4899' }}>
                Máxima prioridad
              </span>
            </div>

            <div className="space-y-8">
              {gradosUnicos.map(grado => {
                const secsDeGrado = secciones.filter(s => s.grado === grado)
                return (
                  <div key={grado}>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">{grado}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {secsDeGrado.map(sec => (
                        <div key={`${sec.grado}-${sec.grupo}`}>
                          <p className="text-[11px] font-bold text-slate-600 mb-1.5">
                            Sección {sec.grupo}
                            {sec.salon_nombre && (
                              <span className="ml-1 text-[10px] text-slate-400">· {sec.salon_nombre}</span>
                            )}
                          </p>
                          <FondoSlot
                            slot={{ tipo: 'seccion', grado: sec.grado, grupo: sec.grupo }}
                            fondo={fondoDeSlot({ tipo: 'seccion', grado: sec.grado, grupo: sec.grupo })}
                            subiendo={subiendo === `seccion:${sec.grado}:${sec.grupo}`}
                            eliminando={eliminando === `seccion:${sec.grado}:${sec.grupo}`}
                            onSubir={() => abrirSelector({ tipo: 'seccion', grado: sec.grado, grupo: sec.grupo })}
                            onEliminar={() => eliminarFondo({ tipo: 'seccion', grado: sec.grado, grupo: sec.grupo })}
                            compact
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {secciones.length === 0 && (
          <div className="rounded-2xl p-12 text-center"
            style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
            <p className="text-sm font-bold text-slate-400">No hay ciclo activo con alumnos matriculados.</p>
          </div>
        )}

      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}

/* ── Slot reutilizable ── */
function FondoSlot({
  fondo, subiendo, eliminando, onSubir, onEliminar, compact = false,
}: {
  slot: Slot
  fondo: QrFondo | undefined
  subiendo: boolean
  eliminando: boolean
  onSubir: () => void
  onEliminar: () => void
  compact?: boolean
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1.5px solid #E4E8EF', background: 'white' }}>
      <div className="relative w-full bg-slate-100"
        style={{ aspectRatio: compact ? '3/4' : '16/9' }}>
        {fondo ? (
          <>
            <Image src={fondo.fondo_url} alt="Fondo QR" fill className="object-cover" />
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.3)' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Vista previa</span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span className="text-[10px] text-slate-300 font-semibold">Sin fondo</span>
          </div>
        )}
      </div>
      <div className="flex gap-1.5 p-2">
        <button onClick={onSubir} disabled={subiendo || eliminando}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-60"
          style={{ background: '#EFF3FA', color: '#143875' }}>
          {subiendo ? (
            <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#143875" strokeWidth="4"/>
              <path className="opacity-75" fill="#143875" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          ) : (
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
          )}
          {fondo ? 'Cambiar' : 'Subir'}
        </button>
        {fondo && (
          <button onClick={onEliminar} disabled={subiendo || eliminando}
            className="p-1.5 rounded-lg transition-all disabled:opacity-60"
            style={{ background: '#fef2f2', color: '#ef4444' }}>
            {eliminando ? (
              <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="4"/>
                <path className="opacity-75" fill="#ef4444" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ) : (
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2"/>
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
