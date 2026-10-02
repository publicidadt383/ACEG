'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import MarcarPorBoton from '@/components/MarcarPorBoton'

function horaLima() {
  return new Date().toLocaleTimeString('es-PE', {
    timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit',
  })
}

type Resultado = {
  tipo: 'exito' | 'error'
  subtipo?: 'entrada' | 'salida'
  texto: string
  hora?: string
}

export default function EscanearPage() {
  const router = useRouter()
  const [userName,         setUserName]         = useState('')
  const [userEmail,        setUserEmail]        = useState('')
  const [esAdmin,          setEsAdmin]          = useState(false)
  const [esDocente,        setEsDocente]        = useState(false)
  const [esAdministrativo, setEsAdministrativo] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [resultado,  setResultado]  = useState<Resultado | null>(null)
  const [marcasHoy, setMarcasHoy]   = useState<number | null>(null)
  // Confirmación de SALIDA pendiente: guarda la acción a ejecutar.
  const [pendingSalida, setPendingSalida] = useState<{ ejecutar: () => Promise<void> } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [modalClave,   setModalClave]   = useState(false)
  const [claveActual,  setClaveActual]  = useState('')
  const [claveNueva,   setClaveNueva]   = useState('')
  const [claveConfirm, setClaveConfirm] = useState('')
  const [claveLoading, setClaveLoading] = useState(false)
  const [claveError,   setClaveError]   = useState('')
  const [claveOk,      setClaveOk]      = useState(false)
  const [showActual,   setShowActual]   = useState(false)
  const [showNueva,    setShowNueva]    = useState(false)

  const [modalJustif,    setModalJustif]    = useState(false)
  const [justifFecha,    setJustifFecha]    = useState('')
  const [justifMotivo,   setJustifMotivo]   = useState('')
  const [justifLoading,  setJustifLoading]  = useState(false)
  const [justifError,    setJustifError]    = useState('')
  const [justifOk,       setJustifOk]       = useState(false)
  const [userId,         setUserId]         = useState('')

  function fechaHoyLima() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
  }

  async function refrescarMarcasHoy(uid: string) {
    const inicioDia = `${fechaHoyLima()}T00:00:00-05:00`
    const { count } = await supabase
      .from('asistencias')
      .select('id', { count: 'exact', head: true })
      .eq('docente_id', uid)
      .gte('fecha_hora', inicioDia)
    setMarcasHoy(count ?? 0)
  }

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserEmail(user.email ?? '')
      setUserId(user.id)
      const { data: admin } = await supabase.from('user_admin').select('nombre').eq('id', user.id).single()
      if (admin) {
        setUserName(admin.nombre); setEsAdmin(true)
      } else {
        const { data: docente } = await supabase.from('docentes').select('nombre').eq('id', user.id).single()
        if (docente) { setUserName(docente.nombre); setEsDocente(true) }
        else {
          const { data: administrativo } = await supabase.from('administrativos').select('nombre').eq('id', user.id).single()
          if (administrativo) { setUserName(administrativo.nombre); setEsAdministrativo(true) }
        }
      }
      const inicioDia = `${fechaHoyLima()}T00:00:00-05:00`
      const { count } = await supabase
        .from('asistencias')
        .select('id', { count: 'exact', head: true })
        .eq('docente_id', user.id)
        .gte('fecha_hora', inicioDia)
      setMarcasHoy(count ?? 0)
    }
    checkAuth()
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [router])

  function abrirModalClave() {
    setClaveActual(''); setClaveNueva(''); setClaveConfirm('')
    setClaveError(''); setClaveOk(false)
    setModalClave(true)
  }

  function abrirModalJustif() {
    setJustifFecha(fechaHoyLima())
    setJustifMotivo('')
    setJustifError('')
    setJustifOk(false)
    setModalJustif(true)
  }

  async function handleEnviarJustificacion(e: React.FormEvent) {
    e.preventDefault()
    if (!justifMotivo.trim()) return
    setJustifLoading(true)
    setJustifError('')
    const { error } = await supabase.from('justificaciones').insert({
      docente_id: userId,
      fecha:      justifFecha,
      motivo:     justifMotivo.trim(),
    })
    setJustifLoading(false)
    if (error) {
      setJustifError('No se pudo enviar. Intenta de nuevo.')
      return
    }
    setJustifOk(true)
    setTimeout(() => { setModalJustif(false); setJustifOk(false) }, 2000)
  }

  async function handleCambiarClave(e: React.FormEvent) {
    e.preventDefault()
    setClaveError('')
    if (claveNueva.length < 6) { setClaveError('La nueva contraseña debe tener al menos 6 caracteres.'); return }
    if (claveNueva !== claveConfirm) { setClaveError('Las contraseñas no coinciden.'); return }
    setClaveLoading(true)
    // Verificar contraseña actual re-autenticando
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: userEmail, password: claveActual })
    if (signInError) { setClaveError('La contraseña actual es incorrecta.'); setClaveLoading(false); return }
    // Actualizar contraseña
    const { error: updateError } = await supabase.auth.updateUser({ password: claveNueva })
    setClaveLoading(false)
    if (updateError) { setClaveError('Error al cambiar la contraseña. Intenta de nuevo.'); return }
    setClaveOk(true)
    setTimeout(() => { setModalClave(false); setClaveOk(false) }, 2000)
  }

  function cerrarModal() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setResultado(null)
    setProcesando(false)
  }

  async function handleBoton(lat: number, lng: number) {
    if (procesando || pendingSalida) return
    // Si ya hay una marca hoy, la próxima es SALIDA → pedir confirmación.
    if (marcasHoy === 1) {
      setPendingSalida({ ejecutar: () => ejecutarBoton(lat, lng) })
      return
    }
    await ejecutarBoton(lat, lng)
  }

  async function ejecutarBoton(lat: number, lng: number) {
    await procesarRpc(supabase.rpc('registrar_asistencia_boton', { p_lat: lat, p_lng: lng }))
  }

  async function procesarRpc(llamada: PromiseLike<{ data: { tipo?: 'entrada' | 'salida'; mensaje?: string; error?: string } | null; error: unknown }>) {
    setProcesando(true)
    setResultado(null)

    const { data, error } = await llamada

    if (error || data?.error) {
      setResultado({ tipo: 'error', texto: data?.error ?? 'Error al procesar. Intenta de nuevo.' })
    } else {
      setResultado({
        tipo: 'exito',
        subtipo: data?.tipo,
        texto: data?.mensaje ?? '',
        hora: horaLima(),
      })
      if (userId) await refrescarMarcasHoy(userId)
    }

    // Auto-cierra después de 4 segundos
    timeoutRef.current = setTimeout(() => {
      setResultado(null)
      setProcesando(false)
    }, 4000)
  }

  async function confirmarSalida() {
    if (!pendingSalida) return
    const accion = pendingSalida
    setPendingSalida(null)
    await accion.ejecutar()
  }

  function cancelarSalida() {
    setPendingSalida(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    document.cookie = 'habich-rol=; path=/; max-age=0'
    router.push('/login')
  }

  const esEntrada = resultado?.subtipo === 'entrada'

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #F6F8FB 0%, #EFF3FA 50%, #E4E8EF 100%)' }}>

      {/* Blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-40 translate-x-1/3 -translate-y-1/3"
          style={{ background: 'radial-gradient(circle, #b6c5e3, #E4E8EF)', filter: 'blur(50px)' }} />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-30 -translate-x-1/4 translate-y-1/4"
          style={{ background: 'radial-gradient(circle, #b6c5e3, #E4E8EF)', filter: 'blur(40px)' }} />
      </div>

      {/* Top strip mínimo: logo + saludo (acciones movidas al rail lateral) */}
      <header className="relative z-30"
        style={{
          background: 'rgba(255,255,255,.92)',
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          borderBottom: '1px solid #E4E8EF',
          boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        }}>
        <div aria-hidden style={{ height: 3, background: 'linear-gradient(90deg, #0B2447 0%, #143875 55%, transparent 100%)' }} />
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-3xl mx-auto"
          style={{ paddingTop: 'max(10px, env(safe-area-inset-top, 0px))' }}>
          <div className="relative w-9 h-9 rounded-xl overflow-hidden shrink-0"
            style={{ border: '1.5px solid #E4E8EF', boxShadow: '0 2px 8px rgba(11,36,71,.1)' }}>
            <Image src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/aceg-isotipo.png`} alt="Logo" fill className="object-contain p-0.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-slate-900 font-bold text-sm leading-tight truncate">Escuela Gastronómica ACEG</p>
            {userName && (
              <p className="text-[11px] text-slate-500 leading-tight truncate">
                Hola, <span className="font-semibold" style={{ color: '#0B2447' }}>{userName}</span>
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Body: rail lateral + main del escáner */}
      <div className="relative z-10 flex-1 flex">

        {/* ── Side rail (navegación rápida) ── */}
        <aside aria-label="Acciones rápidas"
          className="sticky self-start flex flex-col items-stretch gap-1.5 shrink-0 z-20"
          style={{
            top: 0,
            height: '100dvh',
            width: 'calc(64px + env(safe-area-inset-left, 0px))',
            paddingTop: '14px',
            paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))',
            paddingLeft: 'max(8px, env(safe-area-inset-left, 0px))',
            paddingRight: '8px',
            background: 'rgba(255,255,255,.82)',
            backdropFilter: 'blur(14px) saturate(140%)',
            WebkitBackdropFilter: 'blur(14px) saturate(140%)',
            borderRight: '1px solid #E4E8EF',
            boxShadow: '1px 0 2px rgba(15,23,42,.03)',
          }}>

          {/* Inicio → portal del rol */}
          {(esAdmin || esDocente) && (
            <button
              onClick={() => router.push(esAdmin ? '/admin' : '/docente')}
              aria-label={esAdmin ? 'Volver al panel de administración' : 'Volver al portal docente'}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl transition-all active:scale-95"
              style={{
                minHeight: 56, padding: '10px 4px',
                background: '#EFF3FA',
                border: '1.5px solid #b6c5e3',
                color: '#0B2447',
              }}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
              </svg>
              <span className="text-[10px] font-extrabold leading-none tracking-tight">Inicio</span>
            </button>
          )}

          {/* Justificación (docentes y administrativos no-admin) */}
          {!esAdmin && !esAdministrativo && (
            <button
              onClick={abrirModalJustif}
              aria-label="Enviar justificación"
              className="flex flex-col items-center justify-center gap-1 rounded-2xl transition-all active:scale-95"
              style={{
                minHeight: 56, padding: '10px 4px',
                background: '#fffbeb',
                border: '1.5px solid #fde68a',
                color: '#b45309',
              }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <span className="text-[10px] font-extrabold leading-none tracking-tight">Justificar</span>
            </button>
          )}

          {/* Cambiar contraseña */}
          <button
            onClick={abrirModalClave}
            aria-label="Cambiar contraseña"
            className="flex flex-col items-center justify-center gap-1 rounded-2xl transition-all active:scale-95"
            style={{
              minHeight: 56, padding: '10px 4px',
              background: 'white',
              border: '1.5px solid #E4E8EF',
              color: '#475569',
            }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <span className="text-[10px] font-extrabold leading-none tracking-tight">Clave</span>
          </button>

          {/* Spacer flexible para separar acción destructiva */}
          <div className="flex-1 min-h-2" />

          {/* Salir (destructive, separado) */}
          <button
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="flex flex-col items-center justify-center gap-1 rounded-2xl transition-all active:scale-95"
            style={{
              minHeight: 56, padding: '10px 4px',
              background: '#fef2f2',
              border: '1.5px solid #fecaca',
              color: '#b91c1c',
            }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l-4-4m0 0l4-4m-4 4H3m13 4v1a3 3 0 003 3h1a3 3 0 003-3V7a3 3 0 00-3-3h-1a3 3 0 00-3 3v1"/>
            </svg>
            <span className="text-[10px] font-extrabold leading-none tracking-tight">Salir</span>
          </button>
        </aside>

        <main className="relative flex-1 flex flex-col items-center px-4 py-5 sm:py-6 gap-5 max-w-lg mx-auto w-full"
          style={{ paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>

        {/* Título */}
        <div className="text-center">
          {marcasHoy === 1 ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3 text-xs font-bold"
              style={{ background: '#fffbeb', border: '1.5px solid #fde68a', color: '#b45309' }}>
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Próxima marca: SALIDA
            </div>
          ) : marcasHoy === 2 ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3 text-xs font-bold"
              style={{ background: '#ecfdf5', border: '1.5px solid #6ee7b7', color: '#047857' }}>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Jornada completa
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3 text-xs font-bold"
              style={{ background: '#EFF3FA', border: '1.5px solid #b6c5e3', color: '#0B2447' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#143875' }} />
              Marcado por ubicación
            </div>
          )}
          <h2 className="text-slate-900 font-black text-2xl tracking-tight">Control de Asistencia</h2>
          <p className="text-slate-500 text-sm mt-1.5">
            {marcasHoy === 1
              ? 'Tu entrada ya está registrada. Marca al final de la jornada para registrar tu SALIDA.'
              : marcasHoy === 2
                ? 'Ya registraste entrada y salida de hoy. ¡Hasta mañana!'
                : 'Presiona el botón estando dentro de la escuela'}
          </p>
        </div>

        {/* Marcado por ubicación */}
        <div className="w-full rounded-3xl overflow-hidden"
          style={{ background: 'white', boxShadow: '0 16px 48px rgba(11,36,71,.12)', border: '1.5px solid #E4E8EF' }}>
          <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #0B2447, #1E40AF, #0EA5E9)' }} />
          <div className="p-5">
            <MarcarPorBoton
              disabled={procesando || marcasHoy === 2 || !!pendingSalida}
              etiqueta={marcasHoy === 2 ? 'Jornada completa de hoy' : marcasHoy === 1 ? 'Marcar mi SALIDA' : 'Marcar mi ENTRADA'}
              onMarcar={handleBoton}
            />
          </div>
        </div>

        {/* Procesando */}
        {procesando && (
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl"
            style={{ background: '#EFF3FA', border: '1.5px solid #b6c5e3' }}>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" style={{ color: '#143875' }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: '#0B2447' }}>Registrando asistencia...</span>
          </div>
        )}
      </main>
      </div>

      <footer className="relative z-10 text-center py-4 text-[11px] text-slate-300">
        Sistema de Asistencia Docente &copy; {new Date().getFullYear()}
      </footer>

      {/* ── MODAL CAMBIAR CONTRASEÑA ── */}
      {modalClave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 24px 64px rgba(11,36,71,.25)' }}>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #0B2447, #1E40AF, #0EA5E9)' }} />
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-slate-800 font-black text-lg">Cambiar contraseña</h3>
                <button onClick={() => setModalClave(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {claveOk ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: '#d1fae5', border: '2px solid #6ee7b7' }}>
                    <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-emerald-700 font-bold text-base">¡Contraseña actualizada!</p>
                </div>
              ) : (
                <form onSubmit={handleCambiarClave} className="space-y-4">
                  {/* Contraseña actual */}
                  <div>
                    <label className="block text-slate-600 text-xs font-bold uppercase tracking-widest mb-1.5">
                      Contraseña actual
                    </label>
                    <div className="relative">
                      <input type={showActual ? 'text' : 'password'} required value={claveActual}
                        onChange={e => setClaveActual(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-4 pr-10 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-300 outline-none transition-all"
                        style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#143875'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(11,36,71,.1)' }}
                        onBlur={e => { e.currentTarget.style.borderColor = '#E4E8EF'; e.currentTarget.style.boxShadow = 'none' }} />
                      <button type="button" onClick={() => setShowActual(!showActual)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#143875] transition-colors">
                        {showActual
                          ? <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                          : <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        }
                      </button>
                    </div>
                  </div>

                  {/* Nueva contraseña */}
                  <div>
                    <label className="block text-slate-600 text-xs font-bold uppercase tracking-widest mb-1.5">
                      Nueva contraseña
                    </label>
                    <div className="relative">
                      <input type={showNueva ? 'text' : 'password'} required value={claveNueva}
                        onChange={e => setClaveNueva(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full pl-4 pr-10 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-300 outline-none transition-all"
                        style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#143875'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(11,36,71,.1)' }}
                        onBlur={e => { e.currentTarget.style.borderColor = '#E4E8EF'; e.currentTarget.style.boxShadow = 'none' }} />
                      <button type="button" onClick={() => setShowNueva(!showNueva)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#143875] transition-colors">
                        {showNueva
                          ? <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                          : <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        }
                      </button>
                    </div>
                  </div>

                  {/* Confirmar contraseña */}
                  <div>
                    <label className="block text-slate-600 text-xs font-bold uppercase tracking-widest mb-1.5">
                      Confirmar nueva contraseña
                    </label>
                    <input type="password" required value={claveConfirm}
                      onChange={e => setClaveConfirm(e.target.value)}
                      placeholder="Repite la nueva contraseña"
                      className="w-full px-4 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-300 outline-none transition-all"
                      style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#143875'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(11,36,71,.1)' }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#E4E8EF'; e.currentTarget.style.boxShadow = 'none' }} />
                  </div>

                  {claveError && (
                    <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
                      style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#dc2626' }}>
                      <svg className="shrink-0 mt-0.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {claveError}
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setModalClave(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all"
                      style={{ border: '1.5px solid #e2e8f0' }}>
                      Cancelar
                    </button>
                    <button type="submit" disabled={claveLoading}
                      className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                      style={{ background: 'linear-gradient(135deg, #0B2447 0%, #1E40AF 100%)', boxShadow: '0 4px 16px rgba(11,36,71,.35)' }}>
                      {claveLoading && (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      )}
                      {claveLoading ? 'Guardando...' : 'Cambiar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL JUSTIFICACIÓN ── */}
      {modalJustif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 24px 64px rgba(15,23,42,.2)', border: '1.5px solid #fde68a' }}>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }} />
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}>
                    <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <h3 className="text-slate-800 font-black text-base">Enviar justificación</h3>
                </div>
                <button onClick={() => setModalJustif(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-all">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {justifOk ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: '#d1fae5', border: '2px solid #6ee7b7' }}>
                    <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  </div>
                  <p className="text-emerald-700 font-bold text-base">¡Justificación enviada!</p>
                  <p className="text-slate-400 text-xs text-center">El administrador podrá revisarla en el panel.</p>
                </div>
              ) : (
                <form onSubmit={handleEnviarJustificacion} className="space-y-4">
                  <div>
                    <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1.5">
                      Fecha de la ausencia
                    </label>
                    <input type="date" required value={justifFecha}
                      max={fechaHoyLima()}
                      onChange={e => setJustifFecha(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-800 outline-none transition-all bg-slate-50 border border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:bg-white"/>
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1.5">
                      Motivo <span className="text-rose-400">*</span>
                    </label>
                    <textarea required rows={4} value={justifMotivo}
                      onChange={e => setJustifMotivo(e.target.value)}
                      placeholder="Describe el motivo de tu ausencia o tardanza..."
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-300 outline-none transition-all bg-slate-50 border border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:bg-white resize-none"/>
                  </div>

                  {justifError && (
                    <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs"
                      style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#dc2626' }}>
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      </svg>
                      {justifError}
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setModalJustif(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                      style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                      Cancelar
                    </button>
                    <button type="submit" disabled={justifLoading || !justifMotivo.trim()}
                      className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', boxShadow: '0 4px 14px rgba(245,158,11,.35)' }}>
                      {justifLoading && (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                      )}
                      {justifLoading ? 'Enviando...' : 'Enviar justificación'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL OVERLAY RESULTADO (semitransparente 70%) ── */}
      {resultado && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center"
          style={{
            background: resultado.tipo === 'exito'
              ? (esEntrada ? 'rgba(16,185,129,0.70)' : 'rgba(11,36,71,0.70)')
              : 'rgba(239,68,68,0.70)',
          }}
          onClick={cerrarModal}>

          {/* Ícono */}
          <div className="w-32 h-32 rounded-full flex items-center justify-center mb-6"
            style={{ background: 'rgba(255,255,255,0.25)', border: '3px solid rgba(255,255,255,0.6)' }}>
            {resultado.tipo === 'exito' ? (
              esEntrada ? (
                <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              )
            ) : (
              <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            )}
          </div>

          {/* Etiqueta tipo */}
          {resultado.tipo === 'exito' && (
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full mb-4"
              style={{ background: 'rgba(255,255,255,0.25)', border: '1.5px solid rgba(255,255,255,0.5)' }}>
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              <span className="text-white font-black text-sm uppercase tracking-widest">
                {esEntrada ? 'Entrada' : 'Salida'}
              </span>
            </div>
          )}

          <h1 className="text-white font-black text-4xl mb-2">
            {resultado.tipo === 'exito' ? '¡Registrado!' : 'Atención'}
          </h1>
          <p className="text-white/90 text-lg font-semibold leading-snug max-w-xs">{resultado.texto}</p>
          {resultado.hora && (
            <p className="text-white/70 text-base font-mono mt-1">{resultado.hora}</p>
          )}

          <p className="text-white/50 text-sm mt-8">Toca para cerrar</p>
        </div>
      )}

      {/* ── MODAL CONFIRMAR SALIDA ── */}
      {pendingSalida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 24px 64px rgba(11,36,71,.3)' }}>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #F59E0B, #EF4444, #B91C1C)' }} />
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#fef3c7', border: '2px solid #fcd34d' }}>
                <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="text-slate-900 font-black text-xl mb-2">¿Marcar tu SALIDA?</h3>
              <p className="text-slate-600 text-sm mb-1">
                Estás a punto de cerrar tu jornada de hoy.
              </p>
              <p className="text-slate-400 text-xs mb-6">
                Esta acción solo se puede deshacer desde el panel de administración.
              </p>
              <div className="flex gap-3">
                <button onClick={cancelarSalida}
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
                  style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0', color: '#475569' }}>
                  Cancelar
                </button>
                <button onClick={confirmarSalida}
                  className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', boxShadow: '0 8px 24px rgba(239,68,68,.3)' }}>
                  Sí, marcar salida
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
