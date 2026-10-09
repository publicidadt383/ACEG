// Tipos del panel de administración (extraídos de page.tsx).

export interface Admin   { id: string; nombre: string; email: string; usuario?: string | null; apellido?: string | null; dni?: string | null; correo?: string | null; celular?: string | null; cumpleanos?: string | null }
export interface Alumno  {
  id: string; nombre: string
  apellidos?: string | null; dni?: string | null
  grado?: string | null;    grupo?: string | null
  usuario?: string | null
  celular?: string | null;  celular_apoderado?: string | null
  fecha_nacimiento?: string | null; sexo?: string | null
  codigo_estudiante?: string | null
  nombre_apoderado?: string | null; dni_apoderado?: string | null
  correo_apoderado?: string | null; parentesco_apoderado?: string | null
}
export interface Docente {
  id: string; nombre: string; email: string
  apellido?: string | null; dni?: string | null
  grado?: string | null;    grupo?: string | null
  usuario?: string | null;  correo?: string | null
  celular?: string | null;  cumpleanos?: string | null
}
export interface Asistencia {
  id: string; fecha_hora: string
  tipo?: 'entrada' | 'salida' | null
  justificada?: boolean
  docente_id?: string | null
  docentes: { nombre: string; email: string } | null
  sesiones_asistencia: { inicio: string; fin: string } | null
}
export interface Periodo {
  id: string
  nombre: string
  inicio: string
  fin: string
  tipo: 'hora' | 'recreo' | 'almuerzo'
}
export interface DragItem {
  docente_id: string
  docente_nombre: string
  curso_nombre: string
  curso_color: string
  grado?: string
  grupo?: string
}
export interface Justificacion {
  id: string
  fecha: string
  motivo: string
  estado: string
  respuesta?: string | null
  created_at: string
  docentes: { nombre: string; email: string } | null
}
export interface Horario {
  id: string
  docente_id: string | null
  dia: string
  hora_inicio: string
  hora_fin: string
  materia: string | null
  grado: string | null
  grupo: string | null
  docentes?: { nombre: string } | null
}
export interface Curso {
  id: string
  nombre: string
  color: string
}
export type Tab ='docentes' | 'admins' | 'alumnos' | 'cursos' | 'horario' | 'horas-docente' | 'reporte' | 'justificaciones' | 'auditoria' | 'reportes-alumnos' | 'escaner-alumnos' | 'asist-alumnos' | 'qr' | 'simular' | 'buscar-alumnos' | 'ciclos' | 'matricula' | 'comunicados' | 'salones' |'boletines' | 'notas-padres' | 'planificacion' | 'permisos' | 'marcar-asistencia' | 'anio-escolar' | 'estadisticas-asistencia' | 'fondo-sistema'

export interface ReporteAlumno {
  id: string
  nombre: string
  apellidos: string
  usuario?: string | null
  cursos: {
    asigId: string
    nombre: string
    color: string
    promedio: number | null
  }[]
}

export interface AsistAlumnoData {
  id: string
  nombre: string
  apellidos: string
  usuario?: string | null
}

export type EstadoAsist = 'P' | 'T' | 'J'
export interface RegistroDia {
  record_id: string
  estado: EstadoAsist
  hora_entrada: string | null
  hora_salida: string | null
  observacion: string | null
}

export interface Ciclo {
  id: string
  nombre: string
  anio: number
  periodo: number
  activo: boolean
  fecha_inicio?: string | null
  fecha_fin?: string | null
  created_at: string
}

// Estado real de la preparación del nuevo año escolar (pestaña Guía del Año)
export interface GuiaAnio {
  activo: Ciclo | null      // ciclo lectivo vigente
  nuevo: Ciclo | null       // ciclo lectivo creado pero aún no activado (el que se prepara)
  asigTotal: number         // cursos (asignaciones) del ciclo nuevo
  asigSinDocente: number    // de esos, cuántos siguen sin docente
  matriculas: number        // matrículas registradas en el ciclo nuevo
  bimestres: number         // bimestres de planificación del año nuevo
  planes: number            // planes anuales del año nuevo
}

export interface AuditEntry {
  id: string
  admin_nombre: string
  accion: string
  docente_nombre: string | null
  fecha_hora_original: string | null
  fecha_hora_nueva: string | null
  justificacion: string
  created_at: string
}

export interface DocenteHorasFila {
  id: string
  nombre: string
  email: string
  totalHoras: number
  horasPorDia: Record<string, number>
  cursos: string[]
  totalClases: number
}
