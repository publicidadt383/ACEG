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
  salida:   { fondo: '#eef2ff', borde: '#c7d2fe', color: '#4338ca', icono: '🚪', titulo: 'Salida' },
}

/**
 * Marcado de asistencia del personal, embebido en el panel. Solo por ubicación
 * (GPS dentro de la geocerca del colegio); el QR institucional fue retirado.
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
        <p className="text-sm text-slate-400 mt-0.5">Presiona el botón estando dentro del colegio para registrar tu entrada o salida.</p>
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
            style={{ background: '#EFF3FA', border: '1.5px solid #b6c5e3', color: '#0B2447' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#143875' }} /> Marcado por ubicación
          </div>
        )}
      </div>

      {/* Marcado por ubicación */}
      <div className="rounded-3xl overflow-hidden"
        style={{ background: 'white', boxShadow: '0 16px 48px rgba(11,36,71,.10)', border: '1.5px solid #E4E8EF' }}>
        <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #0B2447, #1E40AF, #0EA5E9)' }} />
        <div className="p-5">
          <MarcarPorBoton
            disabled={procesando || marcasHoy === 2 || !!pendingSalida}
            etiqueta={marcasHoy === 2 ? 'Jornada completa de hoy' : marcasHoy === 1 ? 'Marcar mi SALIDA' : 'Marcar mi ENTRADA'}
            onMarcar={handleBoton}
          />
        </div>

        {procesando && !resultado && (
          <div className="mx-5 mb-5 flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: '#EFF3FA', border: '1.5px solid #b6c5e3' }}>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" style={{ color: '#143875' }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: '#0B2447' }}>Registrando asistencia…</span>
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
                style={{ color: resultado.tipo === 'exito' ? '#0B2447' : '#b91c1c' }}>
                {resultado.texto}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Confirmar SALIDA */}
      {pendingSalida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden" style={{ background: 'white', boxShadow: '0 24px 64px rgba(11,36,71,.3)' }}>
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
