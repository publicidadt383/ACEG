export interface QrFondo {
  id: string
  tipo: 'general' | 'grado' | 'seccion'
  grado: string | null
  grupo: string | null
  fondo_url: string
}

export function resolverFondoQr(
  fondos: QrFondo[],
  grado: string,
  grupo: string,
): string {
  const seccion = fondos.find(f => f.tipo === 'seccion' && f.grado === grado && f.grupo === grupo)
  if (seccion) return seccion.fondo_url

  const porGrado = fondos.find(f => f.tipo === 'grado' && f.grado === grado)
  if (porGrado) return porGrado.fondo_url

  const general = fondos.find(f => f.tipo === 'general')
  if (general) return general.fondo_url

  return '/fondoUni.png'
}
