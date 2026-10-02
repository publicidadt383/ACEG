// Tipos y helpers compartidos del módulo de planificación de cursos
// (admin/planificacion y docente/planificacion).

export type EstadoPlantilla = 'borrador' | 'revision' | 'publicada'
export type TipoSemana = 'clase' | 'evaluacion' | 'repaso' | 'feriado'

// Tipos de semana (punto de vista del calendario del bimestre)
export const TIPOS_SEMANA: { v: TipoSemana; t: string; bg: string; color: string; borde: string }[] = [
  { v: 'clase',      t: 'Clase',      bg: '#EFF6FF', color: '#0B2447', borde: '#DBEAFE' },
  { v: 'evaluacion', t: 'Evaluación', bg: '#FEF3C7', color: '#92400E', borde: '#FDE68A' },
  { v: 'repaso',     t: 'Repaso',     bg: '#ECFDF5', color: '#065F46', borde: '#A7F3D0' },
  { v: 'feriado',    t: 'Feriado',    bg: '#F1F5F9', color: '#64748B', borde: '#E2E8F0' },
]

// Badge del estado de flujo de la plantilla (borrador → revisión → publicada)
export const FLUJO_CFG: Record<EstadoPlantilla, { t: string; bg: string; color: string }> = {
  borrador:  { t: 'Borrador',    bg: '#FEF3C7', color: '#92400E' },
  revision:  { t: 'En revisión', bg: '#EDE9FE', color: '#5B21B6' },
  publicada: { t: 'Publicada',   bg: '#E0F2FE', color: '#075985' },
}

// Métricas de una plantilla para el semáforo de estado: semanas con título
// propio (≠ "Semana N") y semanas marcadas como evaluación.
export function metricasPlantilla(sesiones: { titulo: string; tipo: TipoSemana }[]) {
  const cant = sesiones.length
  const personalizadas = sesiones.filter(s => s.titulo.trim() && !/^semana \d+$/i.test(s.titulo.trim())).length
  const evaluaciones = sesiones.filter(s => s.tipo === 'evaluacion').length
  return { cant, personalizadas, evaluaciones }
}

// Devuelve "Del 4 al 10 mar" para la semana N a partir de fecha_inicio (yyyy-mm-dd).
// Si no hay fecha_inicio, devuelve null.
export function rangoSemana(inicio: string | null, semana: number): string | null {
  if (!inicio) return null
  const start = new Date(inicio + 'T00:00:00')
  start.setDate(start.getDate() + (semana - 1) * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
  return `Del ${fmt(start)} al ${fmt(end)}`
}
