'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { distanciaMetros, vigilarUbicacion, type Coordenadas } from '@/lib/geolocalizacion'
import MapaGeocerca from '@/components/MapaGeocerca'

type Zona = { activo: boolean; lat: number | null; lng: number | null; radio_m: number }

type Props = {
  /** Bloquea el botón (procesando, jornada completa, confirmación pendiente). */
  disabled: boolean
  /** Etiqueta del botón según la próxima marca (entrada/salida). */
  etiqueta: string
  /** Se llama con la posición actual SOLO cuando el usuario está dentro del radio. */
  onMarcar: (lat: number, lng: number) => void
}

function formatoDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`
}

/**
 * Marcado de asistencia por botón (sin QR): muestra la zona del colegio en el
 * mapa junto a la posición en vivo del usuario, y habilita el botón solo dentro
 * del radio. El servidor vuelve a validar la distancia (registrar_asistencia_boton).
 */
export default function MarcarPorBoton({ disabled, etiqueta, onMarcar }: Props) {
  const [zona,     setZona]     = useState<Zona | null>(null)
  const [cargando, setCargando] = useState(true)
  const [pos,      setPos]      = useState<(Coordenadas & { precision: number }) | null>(null)
  const [gpsError, setGpsError] = useState(false)

  useEffect(() => {
    let activo = true
    supabase.rpc('geo_asistencia_zona').then(({ data }) => {
      if (!activo) return
      setZona(data && !data.error ? data as Zona : null)
      setCargando(false)
    })
    const parar = vigilarUbicacion(
      p => { setPos(p); setGpsError(false) },
      () => setGpsError(true),
    )
    return () => { activo = false; parar() }
  }, [])

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm font-bold text-slate-400">Cargando zona de marcado…</p>
      </div>
    )
  }

  const habilitado = !!zona && zona.activo && zona.lat != null && zona.lng != null
  if (!habilitado) {
    return (
      <div className="rounded-2xl px-4 py-5 text-center"
        style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}>
        <p className="text-2xl mb-2">📍</p>
        <p className="text-sm font-bold" style={{ color: '#b45309' }}>
          El marcado por ubicación no está habilitado.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Pide al administrador que active la restricción por ubicación para poder marcar.
        </p>
      </div>
    )
  }

  const dist   = pos ? distanciaMetros(pos, { lat: zona!.lat!, lng: zona!.lng! }) : null
  const dentro = dist != null && dist <= zona!.radio_m

  return (
    <div className="space-y-3">
      <MapaGeocerca
        lat={zona!.lat} lng={zona!.lng} radio={zona!.radio_m}
        editable={false} posicionUsuario={pos} altoCls="h-64"
      />

      {/* Estado: dentro / fuera / buscando señal */}
      {gpsError ? (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
          style={{ background: '#fef2f2', border: '1.5px solid #fecaca' }}>
          <span className="text-lg">⚠️</span>
          <p className="text-xs font-bold" style={{ color: '#b91c1c' }}>
            No pudimos obtener tu ubicación. Activa el GPS y permite el acceso a la ubicación en tu navegador.
          </p>
        </div>
      ) : !pos ? (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
          style={{ background: '#EFF3FA', border: '1.5px solid #b6c5e3' }}>
          <span className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0" style={{ background: '#143875' }} />
          <p className="text-xs font-bold" style={{ color: '#0B2447' }}>Obteniendo tu ubicación…</p>
        </div>
      ) : dentro ? (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
          style={{ background: '#ecfdf5', border: '1.5px solid #6ee7b7' }}>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          <p className="text-xs font-bold" style={{ color: '#047857' }}>
            Estás dentro del colegio — puedes marcar tu asistencia.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
          style={{ background: '#fef2f2', border: '1.5px solid #fecaca' }}>
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
          <p className="text-xs font-bold" style={{ color: '#b91c1c' }}>
            Estás a {formatoDist(dist!)} del colegio. Acércate para poder marcar.
          </p>
        </div>
      )}

      {/* Botón de marcado: solo activo dentro del radio */}
      <button
        onClick={() => { if (dentro && pos) onMarcar(pos.lat, pos.lng) }}
        disabled={disabled || !dentro}
        className="w-full py-4 rounded-2xl font-black text-base text-white transition-all active:scale-[0.98] disabled:active:scale-100"
        style={dentro && !disabled
          ? { background: 'linear-gradient(135deg, #0B2447, #1E40AF)', boxShadow: '0 10px 28px rgba(11,36,71,.35)' }
          : { background: '#cbd5e1', cursor: 'not-allowed' }}>
        {etiqueta}
      </button>
      <p className="text-[10px] text-slate-400 text-center -mt-1">
        El punto azul es tu posición; el círculo, la zona donde se permite marcar.
      </p>
    </div>
  )
}
