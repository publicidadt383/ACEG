// Cálculo compartido de exámenes por preguntas de la Libreta de notas
// (panel admin, portal de padres y portal del alumno).
// Cada pregunta correcta vale 1 punto; la nota final es el total de puntos.

export interface ExamenPregunta { n: number; area: string }

export interface ExamenLibreta {
  titulo:     string
  preguntas:  ExamenPregunta[]
  respuestas: Record<string, number>   // {"1":1,"2":0,...}
}

export interface AreaResumen { area: string; puntos: number; total: number }

export interface ResumenExamen {
  areas:   AreaResumen[]
  puntos:  number
  total:   number
  detalle: { n: number; area: string; ok: boolean }[]
}

export function resumenExamen(
  preguntas: ExamenPregunta[],
  respuestas: Record<string, number> | null | undefined,
): ResumenExamen {
  const areas: AreaResumen[] = []
  const porArea: Record<string, AreaResumen> = {}
  const detalle: ResumenExamen['detalle'] = []
  let puntos = 0
  const orden = [...(preguntas ?? [])].sort((a, b) => a.n - b.n)
  for (const p of orden) {
    const ok = Number(respuestas?.[String(p.n)]) === 1
    if (!porArea[p.area]) { porArea[p.area] = { area: p.area, puntos: 0, total: 0 }; areas.push(porArea[p.area]) }
    porArea[p.area].total++
    if (ok) { porArea[p.area].puntos++; puntos++ }
    detalle.push({ n: p.n, area: p.area, ok })
  }
  return { areas, puntos, total: orden.length, detalle }
}
