export type Coordenadas = { lat: number; lng: number }

/**
 * Ubicación actual del dispositivo para la geocerca de asistencia.
 * Devuelve null si el navegador no soporta GPS, el usuario niega el permiso
 * o la lectura demora demasiado — el servidor decide si la marca procede
 * (con la restricción activa, sin coordenadas la rechaza con un mensaje claro).
 */
export function obtenerUbicacion(): Promise<Coordenadas | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  })
}

/** Distancia haversine en metros entre dos coordenadas (misma fórmula que el servidor). */
export function distanciaMetros(a: Coordenadas, b: Coordenadas): number {
  const R = 6371000
  const rad = (x: number) => (x * Math.PI) / 180
  const s =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(s)))
}

/**
 * Sigue la ubicación del dispositivo en vivo (watchPosition).
 * Devuelve la función para dejar de vigilar (llamarla al desmontar).
 */
export function vigilarUbicacion(
  onPos: (pos: Coordenadas & { precision: number }) => void,
  onError: () => void,
): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) { onError(); return () => {} }
  const id = navigator.geolocation.watchPosition(
    p => onPos({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
    onError,
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  )
  return () => navigator.geolocation.clearWatch(id)
}
