'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, Marker, Circle, CircleMarker } from 'leaflet'

type Props = {
  lat: number | null
  lng: number | null
  radio: number
  /** Solo en modo editable: se llama al hacer clic en el mapa o arrastrar el pin. */
  onSelect?: (lat: number, lng: number) => void
  /** true (default): clic/arrastre fijan el punto. false: mapa de solo lectura. */
  editable?: boolean
  /** Posición en vivo del usuario (punto azul), para el marcado por botón. */
  posicionUsuario?: { lat: number; lng: number } | null
  /** Alto del mapa (clase tailwind). */
  altoCls?: string
}

// Centro por defecto mientras no haya coordenadas guardadas: Juliaca.
const CENTRO_DEFAULT: [number, number] = [-15.4995, -70.1333]

const PIN_SVG = `
<svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C7.6 2 4 5.6 4 10c0 5.6 8 12 8 12s8-6.4 8-12c0-4.4-3.6-8-8-8z" fill="#0B2447" stroke="white" stroke-width="1.5"/>
  <circle cx="12" cy="10" r="3" fill="#F0C75A"/>
</svg>`

/**
 * Mapa de la geocerca de asistencia: muestra el punto de la escuela y el círculo
 * del radio donde se permite marcar. En modo editable el punto se fija con clic
 * o arrastrando el marcador; en modo lectura puede mostrar además la posición
 * en vivo del usuario. Leaflet se carga dinámicamente (usa window, sin SSR).
 */
export default function MapaGeocerca({ lat, lng, radio, onSelect, editable = true, posicionUsuario = null, altoCls = 'h-80' }: Props) {
  const contRef    = useRef<HTMLDivElement>(null)
  const mapRef     = useRef<LeafletMap | null>(null)
  const markerRef  = useRef<Marker | null>(null)
  const circleRef  = useRef<Circle | null>(null)
  const userDotRef = useRef<CircleMarker | null>(null)
  const ajustadoConUsuarioRef = useRef(false)
  const [listo, setListo] = useState(false)

  // Viven en refs para no re-crear el mapa cuando el padre re-renderiza.
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const editableRef = useRef(editable)
  editableRef.current = editable

  useEffect(() => {
    let destruido = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (destruido || !contRef.current || mapRef.current) return

      // Sin el prefijo "Leaflet" (y su bandera). El crédito "© OpenStreetMap
      // contributors" con enlace a su copyright es el texto oficial que exige
      // la licencia ODbL de OSM para usar sus mapas gratis — no quitarlo.
      const map = L.map(contRef.current, { attributionControl: false }).setView(CENTRO_DEFAULT, 15)
      L.control.attribution({ prefix: false }).addTo(map)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)

      // Icono propio: los PNG por defecto de Leaflet no resuelven con el bundler.
      const icono = L.divIcon({ className: '', html: PIN_SVG, iconSize: [34, 34], iconAnchor: [17, 32] })
      const marker = L.marker(CENTRO_DEFAULT, { icon: icono, draggable: editableRef.current }).addTo(map)
      const circle = L.circle(CENTRO_DEFAULT, {
        radius: 150, color: '#143875', weight: 2, fillColor: '#1E40AF', fillOpacity: 0.15,
      }).addTo(map)
      // Punto azul: posición en vivo del usuario (oculto hasta tener señal).
      const userDot = L.circleMarker(CENTRO_DEFAULT, {
        radius: 7, color: '#ffffff', weight: 2.5, fillColor: '#2563EB', fillOpacity: 0, opacity: 0,
      }).addTo(map)

      if (editableRef.current) {
        map.on('click', e => onSelectRef.current?.(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)))
        marker.on('dragend', () => {
          const p = marker.getLatLng()
          onSelectRef.current?.(+p.lat.toFixed(6), +p.lng.toFixed(6))
        })
      }

      mapRef.current = map; markerRef.current = marker; circleRef.current = circle; userDotRef.current = userDot
      setListo(true)
    })()
    return () => { destruido = true; mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // Sincroniza marcador y círculo con las coordenadas/radio recibidos.
  useEffect(() => {
    const map = mapRef.current, marker = markerRef.current, circle = circleRef.current
    if (!listo || !map || !marker || !circle) return
    if (lat == null || lng == null) {
      marker.setOpacity(0)
      circle.setStyle({ opacity: 0, fillOpacity: 0 })
      return
    }
    marker.setOpacity(1)
    circle.setStyle({ opacity: 1, fillOpacity: 0.15 })
    marker.setLatLng([lat, lng])
    circle.setLatLng([lat, lng])
    circle.setRadius(radio)
    map.fitBounds(circle.getBounds(), { padding: [28, 28], maxZoom: 18 })
    // El siguiente fix de GPS puede volver a encuadrar incluyendo al usuario.
    ajustadoConUsuarioRef.current = false
  }, [listo, lat, lng, radio])

  // Mueve el punto azul del usuario; encuadra zona+usuario solo la primera vez
  // (re-encuadrar en cada lectura del GPS marearía el mapa).
  useEffect(() => {
    const map = mapRef.current, dot = userDotRef.current, circle = circleRef.current
    if (!listo || !map || !dot) return
    if (!posicionUsuario) {
      dot.setStyle({ opacity: 0, fillOpacity: 0 })
      return
    }
    dot.setLatLng([posicionUsuario.lat, posicionUsuario.lng])
    dot.setStyle({ opacity: 1, fillOpacity: 1 })
    if (!ajustadoConUsuarioRef.current && circle && lat != null && lng != null) {
      map.fitBounds(circle.getBounds().extend([posicionUsuario.lat, posicionUsuario.lng]), { padding: [28, 28], maxZoom: 18 })
      ajustadoConUsuarioRef.current = true
    }
  }, [listo, posicionUsuario, lat, lng])

  return (
    <div className="relative z-0 rounded-2xl overflow-hidden" style={{ isolation: 'isolate', border: '1.5px solid #E4E8EF' }}>
      <div ref={contRef} className={`${altoCls} w-full`} style={{ background: '#F6F8FB' }} />
      {!listo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs font-bold text-slate-400">Cargando mapa…</p>
        </div>
      )}
    </div>
  )
}
