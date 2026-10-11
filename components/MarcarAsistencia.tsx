'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import MarcarPorBoton from '@/components/MarcarPorBoton'

function horaLima() {
  return new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
}
function fechaHoyLima() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}

type Subtipo   = 'entrada' | 'tardanza' | 'salida'
type Resultado = { tipo: 'exito' | 'error'; subtipo?: Subtipo; texto: string; hora?: string }

/** Estilo del mensaje de confirmación según la marca registrada. */
const ESTILO_MARCA: Record<Subtipo, { fondo: string; borde: string; color: string; icono: string; titulo: string }> = {
  entrada:  { fondo: '#ecfdf5', borde: '#6ee7b7', color: '#047857', icono: '✅', titulo: 'Entrada' },
  tardanza: { fondo: '#fffbeb', borde: '#fde68a', color: '#b45309', icono: '⏰', titulo: 'Tardanza' },
  salida:   { fondo: '#F8F6F5', borde: '#E6E2DF', color: '#CA3855', icono: '🚪', titulo: 'Salida' },
}

/**
 * Marcado de asistencia del personal, embebido en el panel. Solo por ubicación
 * (GPS dentro de la geocerca de la escuela); el QR institucional fue retirado.
 */
export default function MarcarAsistencia() {
  const [userId,     setUserId]     = useState('')
  const [marcasHoy,  setMarcasHoy]  = useState<number | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [resultado,  setResultado]  = useState<Resultado | null>(null)
  // Confirmación de SALIDA pendiente: guarda la acción a ejecutar.
  const [pendingSalida, setPendingSalida] = useState<{ ejecutar: () => Promise<void> } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    let activo = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !activo) return
      setUserId(user.id)
      await refrescarMarcasHoy(user.id)
    })()
    return () => { activo = false; if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  async function handleBoton(lat: number, lng: number) {
    if (procesando || pendingSalida) return
    // Si ya hay una marca hoy, la próxima es SALIDA → confirmar antes.
    if (marcasHoy === 1) { setPendingSalida({ ejecutar: () => ejecutarBoton(lat, lng) }); return }
    await ejecutarBoton(lat, lng)
  }

  async function ejecutarBoton(lat: number, lng: number) {
    setProcesando(true)
    setResultado(null)
    const { data, error } = await supabase.rpc('registrar_asistencia_boton', { p_lat: lat, p_lng: lng })
    if (error || data?.error) {
      setResultado({ tipo: 'error', texto: data?.error ?? 'Error al procesar. Intenta de nuevo.' })
    } else {
      const subtipo: Subtipo = data.tipo === 'salida' ? 'salida' : data.tardanza ? 'tardanza' : 'entrada'
      setResultado({ tipo: 'exito', subtipo, texto: data.mensaje, hora: horaLima() })
      if (userId) await refrescarMarcasHoy(userId)
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => { setResultado(null); setProcesando(false) }, 5000)
  }

  async function confirmarSalida() {
    if (!pendingSalida) return
    const accion = pendingSalida
    setPendingSalida(null)
    await accion.ejecutar()
  }

  const estiloMarca = resultado?.subtipo ? ESTILO_MARCA[resultado.subtipo] : null

  return (
    <div className="max-w-lg mx-auto w-full">
      <div className="mb-4">
        <h2 className="text-2xl font-black text-slate-800">Marcar mi asistencia</h2>
        <p className="text-sm text-slate-400 mt-0.5">Presiona el botón estando dentro de la escuela para registrar tu entrada o salida.</p>
      </div>

      {/* Estado del día */}
      <div className="mb-4 text-center">
        {marcasHoy === 1 ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: '#fffbeb', border: '1.5px solid #fde68a', color: '#b45309' }}>
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Próxima marca: SALIDA
          </div>
        ) : marcasHoy === 2 ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: '#ecfdf5', border: '1.5px solid #6ee7b7', color: '#047857' }}>
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Jornada completa de hoy
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: '#F3F1EF', border: '1.5px solid #D2CBC5', color: '#1D1815' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#2A2420' }} /> Marcado por ubicación
          </div>
        )}
      </div>

      {/* Marcado por ubicación */}
      <div className="rounded-3xl overflow-hidden"
        style={{ background: 'white', boxShadow: '0 16px 48px rgba(29,24,21,.10)', border: '1.5px solid #DFE0E0' }}>
        <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #B00326, #D9042F, #F08A24)' }} />
        <div className="p-5">
          <MarcarPorBoton
            disabled={procesando || marcasHoy === 2 || !!pendingSalida}
            etiqueta={marcasHoy === 2 ? 'Jornada completa de hoy' : marcasHoy === 1 ? 'Marcar mi SALIDA' : 'Marcar mi ENTRADA'}
            onMarcar={handleBoton}
          />
        </div>

        {procesando && !resultado && (
          <div className="mx-5 mb-5 flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: '#F3F1EF', border: '1.5px solid #D2CBC5' }}>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" style={{ color: '#2A2420' }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: '#1D1815' }}>Registrando asistencia…</span>
          </div>
        )}

        {/* Resultado inline: entrada (verde) / tardanza (ámbar) / salida (índigo) / error (rojo) */}
        {resultado && (
          <div className="mx-5 mb-5 rounded-2xl px-4 py-4 flex items-center gap-3"
            style={resultado.tipo === 'exito' && estiloMarca
              ? { background: estiloMarca.fondo, border: `1.5px solid ${estiloMarca.borde}` }
              : { background: '#fef2f2', border: '1.5px solid #fecaca' }}>
            <span className="text-2xl">
              {resultado.tipo === 'exito' && estiloMarca ? estiloMarca.icono : '⚠️'}
            </span>
            <div className="flex-1 min-w-0">
              {resultado.tipo === 'exito' && estiloMarca && (
                <p className="text-xs font-black uppercase tracking-widest"
                  style={{ color: estiloMarca.color }}>
                  {estiloMarca.titulo}{resultado.hora ? ` · ${resultado.hora}` : ''}
                </p>
              )}
              <p className="text-sm font-bold"
                style={{ color: resultado.tipo === 'exito' ? '#1D1815' : '#b91c1c' }}>
                {resultado.texto}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Confirmar SALIDA */}
      {pendingSalida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(35,30,27,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden" style={{ background: 'white', boxShadow: '0 24px 64px rgba(29,24,21,.3)' }}>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #F59E0B, #EF4444, #B91C1C)' }} />
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#fef3c7', border: '2px solid #fcd34d' }}>
                <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="text-slate-900 font-black text-xl mb-2">¿Marcar tu SALIDA?</h3>
              <p className="text-slate-500 text-sm mb-6">Estás a punto de cerrar tu jornada de hoy.</p>
              <div className="flex gap-3">
                <button onClick={() => setPendingSalida(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
                  style={{ background: '#EDEEEE', border: '1.5px solid #DCDEDE', color: '#5C5450' }}>
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
