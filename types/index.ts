// Asignación docente↔curso↔grado. Los campos opcionales existen solo en admin.
export interface Asignacion {
  id: string
  grado: string
  grupo: string
  anio?: number
  docente_id?: string
  curso_id?: string
  cursos?: { nombre: string; color: string } | null
}

// Tarea académica. sesion_id es opcional porque alumno/cursos/[id] no lo usa.
export interface Tarea {
  id: string
  titulo: string
  descripcion: string | null
  fecha_limite: string | null
  max_puntos: number
  sesion_id?: string
  created_at?: string
}

// Sesión dentro de una unidad.
export interface Sesion {
  id: string
  titulo: string
  descripcion: string | null
  unidad_id: string
  orden?: number
}

// Unidad curricular. Los campos opcionales solo los usa el panel docente.
export interface Unidad {
  id: string
  nombre: string
  descripcion?: string | null
  orden?: number
  created_at?: string
  asignacion_id?: string
}
