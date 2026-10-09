'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo, invalidarCicloActivo } from '@/lib/ciclo'
import { descargarAOA, descargarJSON, leerExcelAFilas } from '@/lib/excel'
import QrScanner from '@/components/QrScanner'
import MarcarAsistencia from '@/components/MarcarAsistencia'
import MapaGeocerca from '@/components/MapaGeocerca'
import Spinner from '@/components/Spinner'
import PortalMenuFoto, { type MenuCard } from '@/components/PortalMenuFoto'
import CambiarPassword from '@/components/CambiarPassword'
import { useConfirm } from '@/components/ConfirmModal'
import { SalonesContent } from '@/app/admin/salones/page'
import { BoletinesContent } from '@/app/admin/boletines/page'
import { NotasContent } from '@/app/admin/notas/page'
import { PlanificacionContent } from '@/app/admin/planificacion/page'
import { EstadisticasAsistenciaContent } from '@/app/admin/estadisticas-asistencia/page'
import { formatFechaEscrita as formatFechaLarga, timeAgo } from '@/utils/formatters'
import type { Asignacion } from '@/types'

import type {
  Admin, Alumno, Docente, Asistencia, Periodo, DragItem, Justificacion,
  Horario, Curso, Tab, ReporteAlumno, AsistAlumnoData, EstadoAsist,
  RegistroDia, Ciclo, AuditEntry, DocenteHorasFila, GuiaAnio,
} from '@/app/admin/types'
import {
  displayDocente, displayAlumno, PAGE_DOCENTES, COLORES_CURSO, PERIODOS_DEFAULT,
  DIAS_SEMANA, GRADOS, GRUPOS, inputCls, selectCls, labelCls,
  fechaHoyLima, rangoDia, formatHora, diaSemanaDesde, calcularMinutosTarde, Avatar,
} from '@/app/admin/helpers'


export default function AdminPage() {
  const router  = useRouter()
  const fileRef            = useRef<HTMLInputElement>(null)
  const fileRefAlumnos     = useRef<HTMLInputElement>(null)
  const plantillaRef       = useRef<HTMLInputElement>(null)

  const [adminId,     setAdminId]     = useState('')
  const [adminNombre, setAdminNombre] = useState('')
  const [admins,   setAdmins]   = useState<Admin[]>([])
  const [docentes, setDocentes] = useState<Docente[]>([])
  // Lectura inicial de URL para restaurar navegación al refrescar
  const readInitialParam = (key: string): string | null => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get(key)
  }
  const [tab,      setTab]      = useState<Tab>((readInitialParam('tab') as Tab) ?? 'docentes')
  const [loading,  setLoading]  = useState(true)
  // Vista: menú de cuadrados (áreas) → contenido del módulo con sidebar contextual
  const [view,           setView]           = useState<'menu' | 'content'>(
    readInitialParam('view') === 'content' ? 'content' : 'menu',
  )
  const [submenuGroupId, setSubmenuGroupId] = useState<string | null>(readInitialParam('group'))

  const [form, setForm]               = useState({ nombres:'', apellido:'', dni:'', password:'', grado:'', grupo:'', usuario:'', correo:'', celular:'', cumpleanos:'' })
  const [formError, setFormError]     = useState('')
  const [formOk, setFormOk]           = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)

  const [editandoId,  setEditandoId]  = useState<string | null>(null)
  const [editForm,    setEditForm]    = useState({
    nombre: '', apellidos: '', dni: '', grado: '', grupo: '',
    usuario: '', correo: '', celular: '', cumpleanos: '',
    celular_apoderado: '', fecha_nacimiento: '', sexo: '',
    codigo_estudiante: '', nombre_apoderado: '', dni_apoderado: '', correo_apoderado: '', parentesco_apoderado: '',
  })
  const [editLoading,       setEditLoading]       = useState(false)
  const [modalEditAlumno,   setModalEditAlumno]   = useState<Alumno | null>(null)

  const [detalleDocenteId, setDetalleDocenteId] = useState<string | null>(null)
  const [detalleAdminId,   setDetalleAdminId]   = useState<string | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState<{ id: string; nombre: string } | null>(null)
  const [eliminandoLoading, setEliminandoLoading] = useState(false)

  const [resetandoId,   setResetandoId]   = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetLoading,  setResetLoading]  = useState(false)
  const [resetOk,       setResetOk]       = useState(false)

  const [mostrarImport, setMostrarImport] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult,  setImportResult]  = useState<{ ok: number; errores: string[] } | null>(null)

  const [mostrarImportAlumnos, setMostrarImportAlumnos] = useState(false)
  const [importAlumnosLoading, setImportAlumnosLoading] = useState(false)
  const [importAlumnosResult,  setImportAlumnosResult]  = useState<{ ok: number; errores: string[]; credenciales: { nombre: string; usuario: string; password: string }[] } | null>(null)
  const [importAlumnosNombre,  setImportAlumnosNombre]  = useState('')

  // ── Salones state ─────────────────────────────────────────────────────────
  const [salones,         setSalones]         = useState<Record<string, string>>({})  // key: "grado-grupo"
  const [salonEditKey,    setSalonEditKey]     = useState<string | null>(null)
  const [salonEditValor,  setSalonEditValor]   = useState('')
  const [salonSaving,     setSalonSaving]      = useState(false)
  const [combosActivos,   setCombosActivos]    = useState<{grado: string; grupo: string}[]>([])
  const [archivoNombre, setArchivoNombre] = useState('')

  const [asistencias,    setAsistencias]    = useState<Asistencia[]>([])
  const [loadingReporte, setLoadingReporte] = useState(false)
  const [fechaFiltro,    setFechaFiltro]    = useState(fechaHoyLima)
  const [detallesAbiertos, setDetallesAbiertos] = useState<Set<string>>(new Set())
  const [mesDescarga, setMesDescarga] = useState(() => fechaHoyLima().slice(0, 7))
  const [descargandoExcel, setDescargandoExcel] = useState(false)
  const [horariosReporte, setHorariosReporte] = useState<Horario[]>([])
  // Hora de entrada fija para docentes/administrativos sin horario (referencia de puntualidad).
  const [horaEntradaMap, setHoraEntradaMap] = useState<Map<string, { hora: string | null; tabla: 'docentes' | 'administrativos' }>>(new Map())
  const [editHoraEntrada,   setEditHoraEntrada]   = useState<string | null>(null) // docente_id en edición
  const [nuevaHoraEntrada,  setNuevaHoraEntrada]  = useState('')                  // 'HH:MM'
  const [guardandoHoraEntrada, setGuardandoHoraEntrada] = useState(false)

  const [accionModal, setAccionModal] = useState<{ tipo: 'borrar' | 'editar'; registro: Asistencia } | null>(null)
  const [justificacion, setJustificacion] = useState('')
  const [nuevaHora, setNuevaHora] = useState('')
  const [accionLoading, setAccionLoading] = useState(false)
  const [accionError, setAccionError] = useState('')

  const [horarios, setHorarios]             = useState<Horario[]>([])
  const [loadingHorarios, setLoadingHorarios] = useState(false)
  const [, setMostrarHorarioForm]           = useState(false)

  // ── Horario visual (grid) ─────────────────────────────────────────────────
  const [vistaHorario,    setVistaHorario]    = useState<'grado'|'docente'>('grado')
  const [docenteFiltroH,  setDocenteFiltroH]  = useState('')
  const [cursoBusquedaH,  setCursoBusquedaH]  = useState('')
  const [docenteBusquedaH,setDocenteBusquedaH]= useState('')
  const [busquedaPanelH,  setBusquedaPanelH]  = useState('')
  const [nivelFiltroH,    setNivelFiltroH]    = useState<'Cocina'|'Pastelería'>('Cocina')

  // Docentes — paginación + búsqueda servidor
  const [pageDocentes,    setPageDocentes]    = useState(0)
  const [totalDocentes,   setTotalDocentes]   = useState(0)
  const [searchDocentes,  setSearchDocentes]  = useState('')
  // Docentes lean para el panel de horarios (solo id+nombre)
  const [docentesLean,    setDocentesLean]    = useState<{id:string;nombre:string}[]>([])
  // Alumnos — paginación + búsqueda servidor
  const [alumnos,         setAlumnos]         = useState<Alumno[]>([])
  const [pageAlumnos,     setPageAlumnos]     = useState(0)
  const [totalAlumnos,    setTotalAlumnos]    = useState(0)
  const [searchAlumnos,   setSearchAlumnos]   = useState('')
  const [gradoFiltroH,    setGradoFiltroH]    = useState('1° Ciclo Cocina')
  const [grupoFiltroH,    setGrupoFiltroH]    = useState('A')
  const [periodos,        setPeriodos]        = useState<Periodo[]>(PERIODOS_DEFAULT)
  const [periodosOriginal,setPeriodosOriginal]= useState<Periodo[]>([])
  const [editandoPeriodos,setEditandoPeriodos]= useState(false)
  const [dragItem,          setDragItem]          = useState<DragItem | null>(null)
  const dragItemRef                               = useRef<DragItem | null>(null)
  const [dragOver,          setDragOver]          = useState<string | null>(null)
  const [guardandoCelda,    setGuardandoCelda]    = useState<string | null>(null)
  const [horarioError,      setHorarioError]      = useState('')
  const [guardandoPeriodos, setGuardandoPeriodos] = useState(false)
  const [periodosSavedOk,   setPeriodosSavedOk]   = useState(false)
  const [gridSavedOk,       setGridSavedOk]       = useState(false)
  const [gridGuardando,     setGridGuardando]      = useState(false)
  const [generandoPdfH,    setGenerandoPdfH]    = useState(false)
  const [pdfMenuH,         setPdfMenuH]         = useState(false)
  const [pdfOpcionH,       setPdfOpcionH]       = useState<'docente-actual'|'todos-docentes'|'salon-actual'|'todas-salones'|null>(null)

  const [cursos, setCursos]                   = useState<Curso[]>([])
  const [mostrarCursoForm, setMostrarCursoForm] = useState(false)
  const [cursoLoading, setCursoLoading]       = useState(false)
  const [cursoForm, setCursoForm]             = useState({ nombre: '', color: '#143875' })
  const [nivelCursoTab, setNivelCursoTab]     = useState<'Cocina'|'Pastelería'>('Cocina')

  const [asignaciones, setAsignaciones]         = useState<Asignacion[]>([])
  const [loadingAsig, setLoadingAsig]           = useState(false)
  const [docenteAsigAbierto, setDocenteAsigAbierto] = useState<string | null>(null)
  const [asigForm, setAsigForm]                 = useState({ curso_id: '', grado: '', grupo: 'A' })
  const [asigLoading, setAsigLoading]           = useState(false)

  // Vista por sección / curso / docente para administrar asignaciones
  const [vistaCursosTab,   setVistaCursosTab]   = useState<'curso'|'seccion'|'docente'>('curso')
  const [seccionAddOpen,   setSeccionAddOpen]   = useState<string | null>(null) // key = `${grado}__${grupo}`
  const [seccionAddCurso,  setSeccionAddCurso]  = useState('')
  const [seccionAddDocente,setSeccionAddDocente]= useState('')
  const [swapAsigId,       setSwapAsigId]       = useState<string | null>(null) // asig.id cuya celda docente está siendo editada
  const [seccionesColapsadas,setSeccionesColapsadas]= useState<Set<string>>(new Set()) // key = `${grado}__${grupo}`; vacío = todas abiertas
  // Vista Por curso
  const [subVistaCurso,   setSubVistaCurso]   = useState<'generales'|'mixtos'>('generales') // generales = 1 docente único; mixtos = 2+
  const [cursoPrincipalDocente, setCursoPrincipalDocente] = useState<Record<string, string>>({}) // curso_id -> docente_id seleccionado para "aplicar a todas"
  const [cursoAddOpen,    setCursoAddOpen]    = useState<string | null>(null) // key = `${curso_id}__${grado}__${grupo}` para abrir formulario de asignar a sección faltante
  const [cursoAddDocente, setCursoAddDocente] = useState('')
  const [cursosColapsados,setCursosColapsados]= useState<Set<string>>(new Set()) // curso_id; vacío = todos abiertos
  const [bulkLoadingCurso,setBulkLoadingCurso]= useState<string | null>(null) // curso_id en proceso de bulk update

  // ── Justificaciones state ─────────────────────────────────────────────────
  const [justificaciones,    setJustificaciones]    = useState<Justificacion[]>([])
  const [loadingJustif,      setLoadingJustif]      = useState(false)
  const [marcandoVistoId,    setMarcandoVistoId]    = useState<string | null>(null)
  const [justifModal,        setJustifModal]        = useState<Justificacion | null>(null)
  const [justifRespuesta,    setJustifRespuesta]    = useState('')
  const [justificando,       setJustificando]       = useState(false)
  const [justifModalError,   setJustifModalError]   = useState('')

  // ── Auditoría state ───────────────────────────────────────────────────────
  const [auditLog,     setAuditLog]     = useState<AuditEntry[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  // ── Escáner alumnos (admin) state ────────────────────────────────────────
  type AdminScanResult = { alumno_id: string; nombre: string; grado: string; grupo: string; tipo: 'ok' | 'salida_ok' | 'completo' | 'error'; mensaje: string; hora_entrada?: string; hora_salida?: string }
  const [scanAdminResult,    setScanAdminResult]    = useState<AdminScanResult | null>(null)
  const [scanAdminList,      setScanAdminList]      = useState<AdminScanResult[]>([])
  // Config del escáner de alumnos: hora de entrada + tolerancia + corte de salida
  const [scanCfg,          setScanCfg]          = useState<{ hora_entrada: string; tolerancia_min: number; salida_tras_horas: number } | null>(null)
  const [scanCfgHora,      setScanCfgHora]      = useState('')
  const [scanCfgGuardando, setScanCfgGuardando] = useState(false)
  const [scanCfgOk,        setScanCfgOk]        = useState(false)
  const [scanAdminProcesando,setScanAdminProcesando] = useState(false)
  const scanAdminTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Reportes alumnos state ────────────────────────────────────────────────
  const [reporteAlumnos,       setReporteAlumnos]       = useState<ReporteAlumno[]>([])
  const [loadingReporteAlumnos,setLoadingReporteAlumnos] = useState(false)
  const [reporteGrado,         setReporteGrado]         = useState('1° Ciclo Cocina')
  const [reporteGrupo,         setReporteGrupo]         = useState('A')
  const [reporteAbiertoId,     setReporteAbiertoId]     = useState<string | null>(null)

  // ── Asistencia alumnos (módulo dedicado) ─────────────────────────────────
  const [asistSalones,       setAsistSalones]       = useState<{ grado: string; grupo: string; nombre: string | null }[]>([])
  const [asistAlumnos,       setAsistAlumnos]       = useState<AsistAlumnoData[]>([])
  const [loadingAsistAlumnos,setLoadingAsistAlumnos] = useState(false)
  const [asistGrado,         setAsistGrado]         = useState('')
  const [asistGrupo,         setAsistGrupo]         = useState('')
  const [asistDetalleId,     setAsistDetalleId]     = useState<string | null>(null)
  const [semanaInicio,       setSemanaInicio]        = useState<Date>(() => {
    const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }))
    const dow = hoy.getDay()
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() - (dow === 0 ? 6 : dow - 1))
    lunes.setHours(0,0,0,0)
    return lunes
  })
  const [asistSemanaMap, setAsistSemanaMap] = useState<Record<string, Record<string, RegistroDia>>>({})
  const [guardandoCeldaAsist, setGuardandoCeldaAsist] = useState<string | null>(null)
  const [obsDraft,     setObsDraft]     = useState<Record<string, string>>({})
  const [guardandoObs, setGuardandoObs] = useState<string | null>(null)
  const [mesReporte,          setMesReporte]          = useState(() => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }))
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  })
  const [imprimiendoAsist, setImprimiendoAsist] = useState(false)

  // ── Comunicados state ────────────────────────────────────────────────────
  const [anuncios,         setAnuncios]         = useState<{ id: string; titulo: string; contenido: string; autor_nombre: string; created_at: string }[]>([])
  const [loadingAnuncios,  setLoadingAnuncios]  = useState(false)
  const [anuncioAbierto,   setAnuncioAbierto]   = useState(false)
  const [anuncioTitulo,    setAnuncioTitulo]    = useState('')
  const [anuncioContenido, setAnuncioContenido] = useState('')
  const [anuncioError,     setAnuncioError]     = useState('')
  const [anuncioGuardando, setAnuncioGuardando] = useState(false)

  // ── Descarga docentes state ──────────────────────────────────────────────
  const [descargandoDocentes,      setDescargandoDocentes]      = useState(false)
  const [descargandoImagenDoc,     setDescargandoImagenDoc]     = useState(false)
  const [modalDescarga,            setModalDescarga]            = useState<'excel' | 'imagen' | null>(null)
  const [descargaFiltroPersonal,   setDescargaFiltroPersonal]   = useState<'todo' | 'docentes'>('todo')
  const [descargaCampos,           setDescargaCampos]           = useState<Set<string>>(
    () => new Set(['apellido_nombre', 'dni', 'correo', 'celular', 'cumpleanos', 'usuario'])
  )
  const [descargandoFormatoOficial, setDescargandoFormatoOficial] = useState(false)
  const [mesFormatoOficial,   setMesFormatoOficial]   = useState(() => fechaHoyLima().slice(0, 7))
  const [plantillaNombre,     setPlantillaNombre]     = useState<string | null>(null)
  const [subiendoPlantilla,   setSubiendoPlantilla]   = useState(false)
  const [plantillaOk,         setPlantillaOk]         = useState('')

  // ── Geocerca (marcado del personal solo por ubicación) ───────────────────
  const [geoActivo,     setGeoActivo]     = useState(false)
  const [geoLat,        setGeoLat]        = useState('')
  const [geoLng,        setGeoLng]        = useState('')
  const [geoRadio,      setGeoRadio]      = useState('150')
  const [geoGuardando,  setGeoGuardando]  = useState(false)
  const [geoCapturando, setGeoCapturando] = useState(false)
  const [geoMsg,        setGeoMsg]        = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  // ── Simular state ─────────────────────────────────────────────────────────
  const [simularSearch, setSimularSearch] = useState('')

  // ── Buscar Alumnos (Herramientas) ────────────────────────────────────────
  const [buscarAlumnoTexto,      setBuscarAlumnoTexto]      = useState('')
  const [buscarAlumnoResultados, setBuscarAlumnoResultados] = useState<Alumno[]>([])
  const [buscarAlumnoLoading,    setBuscarAlumnoLoading]    = useState(false)
  const [alumnoSeleccionado,     setAlumnoSeleccionado]     = useState<Alumno | null>(null)

  // Plan académico (modal con notas del año)
  type CursoNota = { nombre: string; color: string; promedio: number | null; calificadas: number; total: number }
  const [planAbierto,   setPlanAbierto]   = useState(false)
  const [planLoading,   setPlanLoading]   = useState(false)
  const [planCursos,    setPlanCursos]    = useState<CursoNota[]>([])

  // Portal del alumno (vista inline con cursos + horario)
  type ClaseHorario = { id: string; dia: string; hora_inicio: string; hora_fin: string; materia: string | null }
  type CursoSimple  = { id: string; nombre: string; color: string; docente: string }
  type PeriodoCfg   = { id: string; nombre: string; inicio: string; fin: string; tipo: 'hora' | 'recreo' | 'almuerzo' }
  const PERIODOS_DEFAULT_PORTAL: PeriodoCfg[] = [
    { id: 'p1', nombre: '1ra hora', inicio: '07:45', fin: '08:30', tipo: 'hora' },
    { id: 'p2', nombre: '2da hora', inicio: '08:30', fin: '09:15', tipo: 'hora' },
    { id: 'p3', nombre: '3ra hora', inicio: '09:15', fin: '10:00', tipo: 'hora' },
    { id: 'r1', nombre: 'Recreo',   inicio: '10:00', fin: '10:20', tipo: 'recreo' },
    { id: 'p4', nombre: '4ta hora', inicio: '10:20', fin: '11:05', tipo: 'hora' },
    { id: 'p5', nombre: '5ta hora', inicio: '11:05', fin: '11:50', tipo: 'hora' },
    { id: 'p6', nombre: '6ta hora', inicio: '11:50', fin: '12:35', tipo: 'hora' },
  ]
  const [portalAbierto,  setPortalAbierto]  = useState(false)
  const [portalLoading,  setPortalLoading]  = useState(false)
  const [portalCursos,   setPortalCursos]   = useState<CursoSimple[]>([])
  const [portalHorario,  setPortalHorario]  = useState<ClaseHorario[]>([])
  const [portalPeriodos, setPortalPeriodos] = useState<PeriodoCfg[]>(PERIODOS_DEFAULT_PORTAL)

  // ── Horas docente state ───────────────────────────────────────────────────
  const [horasFilas,      setHorasFilas]      = useState<DocenteHorasFila[]>([])
  const [loadingHorasTab, setLoadingHorasTab] = useState(false)
  const [busquedaHoras,   setBusquedaHoras]   = useState('')
  const [cursoHoras,      setCursoHoras]      = useState('')

  // ── Ciclos state ─────────────────────────────────────────────────────────
  const [ciclos,        setCiclos]        = useState<Ciclo[]>([])
  const [loadingCiclos, setLoadingCiclos] = useState(false)
  const [cicloForm,     setCicloForm]     = useState({ anio: new Date().getFullYear() + 1, periodo: 1 as 1 | 2, fecha_inicio: '', fecha_fin: '' })
  const [creandoCiclo,  setCreandoCiclo]  = useState(false)
  const [cicloMsg,      setCicloMsg]      = useState('')
  const [clonarDesde,   setClonarDesde]   = useState('')
  const [clonarLoading, setClonarLoading] = useState(false)
  const [activandoCicloId, setActivandoCicloId] = useState<string | null>(null)

  // ── Guía del Año Escolar state ────────────────────────────────────────────
  const [guiaAnio,        setGuiaAnio]        = useState<GuiaAnio | null>(null)
  const [loadingGuiaAnio, setLoadingGuiaAnio] = useState(false)

  // ── Matrícula state ───────────────────────────────────────────────────────
  // Estado para matricular directo desde el formulario de alumno nuevo (en tab Alumnos)
  const [matriculandoId,      setMatriculandoId]      = useState<string | null>(null)
  const [matriculandoOkId,    setMatriculandoOkId]    = useState<string | null>(null)

  // ── Wizard de matrícula (Fase 1) ──────────────────────────────────────────
  type WizTipo = 'nuevo' | 'continuidad' | 'reincorporacion' | 'traslado'
  const [wizPaso,        setWizPaso]        = useState<1 | 2 | 3 | 4>(1)
  const [wizTipo,        setWizTipo]        = useState<WizTipo | null>(null)
  const [wizAlumno,      setWizAlumno]      = useState<Alumno | null>(null)
  const [wizNuevoForm,   setWizNuevoForm]   = useState({ nombre:'', apellidos:'', dni:'', fecha_nacimiento:'', sexo:'', codigo_estudiante:'' })
  const [wizCicloId,     setWizCicloId]     = useState('')
  const [wizGrado,       setWizGrado]       = useState('')
  const [wizGrupo,       setWizGrupo]       = useState('')
  const [wizObs,         setWizObs]         = useState('')
  const [wizSearchTexto,    setWizSearchTexto]    = useState('')
  const [wizSearchResult,   setWizSearchResult]   = useState<Alumno[]>([])
  const [wizSearchLoading,  setWizSearchLoading]  = useState(false)
  const [wizGuardando,   setWizGuardando]   = useState(false)
  const [wizError,       setWizError]       = useState('')
  const [wizOkMsg,       setWizOkMsg]       = useState('')

  // ── Matrícula: vista lista de matriculados + historial de bajas ───────────
  interface MatriculadoRow {
    matId: string; alumnoId: string
    nombre: string; apellidos: string | null; dni: string | null
    grado: string; grupo: string; tipo: string; estado: string
    fecha_matricula: string | null; fecha_baja: string | null; motivo_baja: string | null
  }
  interface BajaRow {
    alumnoId: string; nombre: string; apellidos: string | null; dni: string | null
    cicloNombre: string | null; grado: string | null; grupo: string | null
    estado: string | null; fecha_baja: string | null; motivo_baja: string | null
  }
  const [matriculaVista,   setMatriculaVista]   = useState<'wizard' | 'lista' | 'historial'>('wizard')
  // Ciclo lectivo activo visible en las cabeceras de los tabs académicos
  const [cicloActivoInfo,  setCicloActivoInfo]  = useState<{ id: string; nombre: string } | null>(null)
  const [matriculados,     setMatriculados]     = useState<MatriculadoRow[]>([])
  const [matriculadosBusq, setMatriculadosBusq] = useState('')
  const [bajas,            setBajas]            = useState<BajaRow[]>([])
  const [listaMatLoading,  setListaMatLoading]  = useState(false)
  const [bajaMsg,          setBajaMsg]          = useState('')
  const { confirmar, dialogo: dialogoConfirm } = useConfirm()

  // ── Cambiar tipo usuario state ────────────────────────────────────────────
  const [cambiarTipoId,      setCambiarTipoId]      = useState<string | null>(null)
  const [cambiarTipoTarget,  setCambiarTipoTarget]  = useState<'administrativo' | 'admin' | ''>('')
  const [cambiarTipoLoading, setCambiarTipoLoading] = useState(false)
  const [cambiarTipoOk,      setCambiarTipoOk]      = useState(false)
  const [cambiarTipoCursos,  setCambiarTipoCursos]  = useState<number | null>(null) // cursos del docente (null = verificando)

  // ── Permisos por módulos ──────────────────────────────────────────────────
  // esSuper: el usuario es super admin (gestiona permisos y ve todo).
  // modulosPermitidos: null = todos; Set = solo esos ids de módulo.
  const [esSuper,            setEsSuper]            = useState(false)
  const [esAdminUser,        setEsAdminUser]        = useState(false)  // true = user_admin; false = administrativo
  const [modulosPermitidos, setModulosPermitidos]  = useState<Set<string> | null>(null)
  // Gestión (solo super): permisos por usuario + edición en curso
  const [permisosMap,       setPermisosMap]        = useState<Record<string, { configurado: boolean; modulos: string[] }>>({})
  const [permUserSel,       setPermUserSel]        = useState<string | null>(null)
  const [permEdit,          setPermEdit]           = useState<Set<string>>(new Set())
  const [permGuardando,     setPermGuardando]      = useState(false)
  const [permOk,            setPermOk]             = useState(false)
  const [permStaff,         setPermStaff]          = useState<{ id: string; nombre: string; usuario: string | null; email: string; tipo: string; super: boolean }[]>([])

  // ── Filtro tipo usuario (dentro del tab docentes) ─────────────────────────
  const [filtroTipo,       setFiltroTipo]       = useState<'docente' | 'administrativo' | 'admin'>('docente')
  const [administrativos,  setAdministrativos]  = useState<Admin[]>([])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // Permitir admins Y administrativos (ambos usan el panel por módulos)
      const { data: admin } = await supabase.from('user_admin').select('nombre').eq('id', user.id).maybeSingle()
      setEsAdminUser(!!admin)
      let nombrePersonal = admin?.nombre ?? null
      if (!admin) {
        const { data: adm } = await supabase.from('administrativos').select('nombre').eq('id', user.id).maybeSingle()
        if (!adm) { router.push('/escanear'); return }
        nombrePersonal = adm.nombre
      }
      // Cargar módulos permitidos del usuario (super → todos)
      const { data: mods } = await supabase.rpc('mis_modulos')
      setEsSuper(!!mods?.super)
      // Falla "en abierto" (todos) si el RPC no respondió, para no dejar a nadie
      // sin acceso por un error de red. La seguridad real la da el RLS.
      setModulosPermitidos((!mods || mods.todos) ? null : new Set<string>((mods.modulos as string[]) ?? []))
      setAdminId(user.id)
      setAdminNombre(nombrePersonal ?? '')
      // Cargar nombre de plantilla si existe
      const { data: cfgPlantilla } = await supabase.from('config').select('value').eq('key','plantilla_formato01_nombre').single()
      if (cfgPlantilla?.value) setPlantillaNombre(cfgPlantilla.value)
      setLoading(false)
    }
    init()
  }, [router])

  // Guard de permisos: si entran por URL a un módulo no permitido, al menú.
  useEffect(() => {
    if (loading) return
    const permitido = tab === 'marcar-asistencia' || esSuper || modulosPermitidos === null || (tab ? modulosPermitidos.has(tab) : true)
    if (view === 'content' && tab && !permitido) { setView('menu'); setSubmenuGroupId(null) }
  }, [loading, view, tab, esSuper, modulosPermitidos])

  // Cargar permisos + personal (admins y administrativos) — solo super admin
  useEffect(() => {
    if (tab !== 'permisos' || !esSuper) return
    ;(async () => {
      const [{ data: perms }, { data: ua }, { data: adm }] = await Promise.all([
        supabase.from('permisos_usuario').select('user_id,modulos,configurado'),
        supabase.from('user_admin').select('id,nombre,usuario,email,es_super').order('nombre'),
        supabase.from('administrativos').select('id,nombre,usuario,email').order('nombre'),
      ])
      const map: Record<string, { configurado: boolean; modulos: string[] }> = {}
      for (const r of perms ?? []) map[r.user_id as string] = { configurado: !!r.configurado, modulos: (r.modulos as string[]) ?? [] }
      setPermisosMap(map)
      type UA = { id: string; nombre: string; usuario: string | null; email: string; es_super: boolean }
      type AD = { id: string; nombre: string; usuario: string | null; email: string }
      const staff = [
        ...((ua as UA[]) ?? []).map(u => ({ id: u.id, nombre: u.nombre, usuario: u.usuario, email: u.email, tipo: u.es_super ? 'Super admin' : 'Administrador', super: !!u.es_super })),
        ...((adm as AD[]) ?? []).map(u => ({ id: u.id, nombre: u.nombre, usuario: u.usuario, email: u.email, tipo: 'Administrativo', super: false })),
      ]
      setPermStaff(staff)
    })()
  }, [tab, esSuper])

  // Sincronizar tab/view/group con la URL (refresh no manda al inicio)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams()
    if (view === 'content') p.set('view', 'content')
    if (view === 'content' && tab) p.set('tab', tab)
    if (submenuGroupId) p.set('group', submenuGroupId)
    const qs = p.toString()
    const newUrl = window.location.pathname + (qs ? `?${qs}` : '')
    window.history.replaceState(null, '', newUrl)
  }, [view, tab, submenuGroupId])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'comunicados') cargarAnuncios() }, [tab])
  useEffect(() => { if (tab === 'horas-docente') cargarHorasDocente() }, [tab])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'reporte') cargarReporte() }, [tab, fechaFiltro])
  useEffect(() => { if (tab === 'qr') cargarGeo() }, [tab])
  useEffect(() => { if (tab === 'horario' || tab === 'simular') { cargarDocentesLean() } }, [tab])

  // Helper: obtiene la matrícula activa del alumno (fuente real de grado/grupo/ciclo)
  async function obtenerMatriculaActiva(alumnoId: string): Promise<{ grado: string; grupo: string; anio: number; cicloId: string } | null> {
    const { data } = await supabase
      .from('matriculas')
      .select('grado,grupo,ciclo_id,ciclos!inner(activo,anio)')
      .eq('alumno_id', alumnoId)
      .eq('ciclos.activo', true)
      .maybeSingle()
    if (!data?.grado || !data?.grupo) return null
    const anio = (data.ciclos as unknown as { anio: number })?.anio ?? new Date().getFullYear()
    return { grado: data.grado as string, grupo: data.grupo as string, anio, cicloId: data.ciclo_id as string }
  }

  // Plan académico: carga las notas del año vigente para el alumno seleccionado
  async function cargarPlanAcademico(alumno: Alumno) {
    setPlanAbierto(true)
    setPlanLoading(true)
    setPlanCursos([])

    const m = await obtenerMatriculaActiva(alumno.id)
    if (!m) { setPlanLoading(false); return }

    const { data: asigs } = await supabase
      .from('asignaciones')
      .select('id,cursos(nombre,color)')
      .eq('grado', m.grado).eq('grupo', m.grupo).eq('ciclo_id', m.cicloId)
    if (!asigs?.length) { setPlanLoading(false); return }

    type AsigRow = { id: string; cursos: { nombre: string; color: string } | null }
    const asigList = asigs as unknown as AsigRow[]
    const asigIds  = asigList.map(a => a.id)

    const { data: unidades } = await supabase.from('unidades').select('id,asignacion_id').in('asignacion_id', asigIds)
    const unidadIds = (unidades ?? []).map(u => u.id)
    const { data: sesiones } = unidadIds.length
      ? await supabase.from('sesiones').select('id,unidad_id').in('unidad_id', unidadIds)
      : { data: [] }
    const sesionIds = (sesiones ?? []).map(s => s.id)
    const { data: tareas } = sesionIds.length
      ? await supabase.from('tareas').select('id,sesion_id').in('sesion_id', sesionIds)
      : { data: [] }
    const tareaIds = (tareas ?? []).map(t => t.id)
    const { data: entregas } = tareaIds.length
      ? await supabase.from('entregas').select('id,tarea_id,calificaciones(nota)').eq('alumno_id', alumno.id).in('tarea_id', tareaIds)
      : { data: [] }

    type Tarea  = { id: string; sesion_id: string }
    type Sesion = { id: string; unidad_id: string }
    type Unidad = { id: string; asignacion_id: string }
    type Entrega = { tarea_id: string; calificaciones: { nota: number }[] }

    const unidadAsig: Record<string, string> = {}
    ;(unidades as Unidad[] ?? []).forEach(u => { unidadAsig[u.id] = u.asignacion_id })
    const sesionAsig: Record<string, string> = {}
    ;(sesiones as Sesion[] ?? []).forEach(s => { sesionAsig[s.id] = unidadAsig[s.unidad_id] })
    const tareaAsig: Record<string, string> = {}
    ;(tareas as Tarea[] ?? []).forEach(t => { tareaAsig[t.id] = sesionAsig[t.sesion_id] })

    const entregasList = (entregas as Entrega[]) ?? []
    const tareasPorAsig = new Map<string, number>()
    ;(tareas as Tarea[] ?? []).forEach(t => {
      const a = tareaAsig[t.id]
      if (a) tareasPorAsig.set(a, (tareasPorAsig.get(a) ?? 0) + 1)
    })

    const resultado: CursoNota[] = asigList.map(a => {
      const misEntregas = entregasList.filter(e => tareaAsig[e.tarea_id] === a.id)
      const calificadas = misEntregas.filter(e => e.calificaciones?.length > 0)
      const notas       = calificadas.map(e => e.calificaciones[0].nota)
      const promedio    = notas.length > 0
        ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length * 10) / 10
        : null
      return {
        nombre:      a.cursos?.nombre ?? 'Curso',
        color:       a.cursos?.color  ?? '#0d9488',
        promedio,
        calificadas: calificadas.length,
        total:       tareasPorAsig.get(a.id) ?? 0,
      }
    })
    setPlanCursos(resultado)
    setPlanLoading(false)
  }

  // Portal del alumno: carga cursos asignados + horario semanal + periodos
  async function cargarPortalAlumno(alumno: Alumno) {
    setPortalAbierto(true)
    setPortalLoading(true)
    setPortalCursos([])
    setPortalHorario([])
    setPortalPeriodos(PERIODOS_DEFAULT_PORTAL)

    const m = await obtenerMatriculaActiva(alumno.id)
    if (!m) { setPortalLoading(false); return }

    // Cargar asignaciones con docente_id para luego cruzar horarios huérfanos
    const [{ data: asigsRaw }, { data: horasPorGrado }, { data: cfg }] = await Promise.all([
      supabase
        .from('asignaciones')
        .select('id,docente_id,cursos(nombre,color),docentes(nombre)')
        .eq('grado', m.grado).eq('grupo', m.grupo).eq('ciclo_id', m.cicloId),
      supabase
        .from('horarios')
        .select('id,dia,hora_inicio,hora_fin,materia')
        .eq('grado', m.grado).eq('grupo', m.grupo)
        .eq('activo', true)
        .order('hora_inicio'),
      supabase.from('config').select('value').eq('key', 'periodos_horario').maybeSingle(),
    ])

    if (cfg?.value) {
      try { setPortalPeriodos(JSON.parse(cfg.value) as PeriodoCfg[]) } catch { /* default */ }
    }

    type AsigRow = {
      id: string
      docente_id: string | null
      cursos:    { nombre: string; color: string } | null
      docentes:  { nombre: string } | null
    }
    const asigs = (asigsRaw as unknown as AsigRow[]) ?? []
    const cursos: CursoSimple[] = asigs
      .map(a => ({
        id:      a.id,
        nombre:  a.cursos?.nombre ?? 'Curso',
        color:   a.cursos?.color  ?? '#0d9488',
        docente: a.docentes?.nombre ?? 'Sin docente',
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))

    // Merge: horarios del grado/grupo + horarios "huérfanos" de docentes asignados
    const hi = (s: string) => s.slice(0, 5)
    const porGrado = (horasPorGrado as ClaseHorario[]) ?? []
    const vistos = new Set(porGrado.map(h => `${h.dia}-${hi(h.hora_inicio)}`))
    const docenteIds = [...new Set(asigs.map(a => a.docente_id).filter(Boolean) as string[])]
    let huerfanos: ClaseHorario[] = []
    if (docenteIds.length) {
      const { data: hsNulos } = await supabase
        .from('horarios')
        .select('id,dia,hora_inicio,hora_fin,materia')
        .in('docente_id', docenteIds)
        .or('grado.is.null,grupo.is.null')
        .eq('activo', true)
        .order('hora_inicio')
      huerfanos = ((hsNulos as ClaseHorario[]) ?? [])
        .filter(h => !vistos.has(`${h.dia}-${hi(h.hora_inicio)}`))
    }
    const horarioFinal = [...porGrado, ...huerfanos]

    setPortalCursos(cursos)
    setPortalHorario(horarioFinal)
    setPortalLoading(false)
  }

  // ── Wizard de matrícula: búsqueda de alumnos existentes ─────────────────
  async function wizardBuscarAlumno() {
    const t = wizSearchTexto.trim()
    if (!t) { setWizSearchResult([]); return }
    setWizSearchLoading(true)
    const { data } = await supabase
      .from('alumnos')
      .select(ALUMNO_FIELDS)
      .or(`nombre.ilike.%${t}%,apellidos.ilike.%${t}%,dni.ilike.%${t}%,codigo_estudiante.ilike.%${t}%`)
      .order('apellidos', { nullsFirst: false })
      .limit(20)
    setWizSearchResult((data as Alumno[]) ?? [])
    setWizSearchLoading(false)
  }

  // Reset completo del wizard
  function wizardReset() {
    setWizPaso(1)
    setWizTipo(null)
    setWizAlumno(null)
    setWizNuevoForm({ nombre:'', apellidos:'', dni:'', fecha_nacimiento:'', sexo:'', codigo_estudiante:'' })
    setWizCicloId('')
    setWizGrado('')
    setWizGrupo('')
    setWizObs('')
    setWizSearchTexto('')
    setWizSearchResult([])
    setWizError('')
    setWizOkMsg('')
  }

  // Confirmar y guardar la matrícula
  async function wizardConfirmar() {
    setWizError('')
    setWizGuardando(true)
    try {
      let alumnoId = wizAlumno?.id
      // Si es alumno nuevo, créalo primero
      if (wizTipo === 'nuevo') {
        const f = wizNuevoForm
        if (!f.nombre.trim() || !f.apellidos.trim() || !f.dni.trim()) {
          throw new Error('Faltan datos del estudiante: nombre, apellidos y DNI son obligatorios')
        }
        const { data: nuevoAlu, error: errAlu } = await supabase
          .from('alumnos')
          .insert({
            nombre:            f.nombre.trim(),
            apellidos:         f.apellidos.trim(),
            dni:               f.dni.trim(),
            fecha_nacimiento:  f.fecha_nacimiento || null,
            sexo:              f.sexo || null,
            codigo_estudiante: f.codigo_estudiante.trim() || null,
          })
          .select('id')
          .single()
        if (errAlu) throw new Error(`Error al crear estudiante: ${errAlu.message}`)
        alumnoId = nuevoAlu.id
      }
      if (!alumnoId) throw new Error('No se seleccionó estudiante')
      if (!wizCicloId || !wizGrado || !wizGrupo) throw new Error('Faltan datos de asignación')

      const { error: errMat } = await supabase
        .from('matriculas')
        .insert({
          alumno_id:       alumnoId,
          ciclo_id:        wizCicloId,
          grado:           wizGrado,
          grupo:           wizGrupo,
          tipo:            wizTipo,
          estado:          'pendiente_docs',
          fecha_matricula: new Date().toISOString(),
          observaciones:   wizObs.trim() || null,
        })
      if (errMat) {
        // Ya existe matrícula (alumno, ciclo) — unique. Si es una baja del mismo
        // ciclo (retiro/traslado), la reincorporación la REACTIVA en vez de fallar.
        if (!errMat.message.toLowerCase().includes('unique') && !errMat.message.includes('duplicate')) {
          throw new Error(`Error al matricular: ${errMat.message}`)
        }
        const { data: existente } = await supabase
          .from('matriculas').select('id,estado')
          .eq('alumno_id', alumnoId).eq('ciclo_id', wizCicloId)
          .maybeSingle()
        if (!existente || !['retirado', 'trasladado', 'anulada'].includes(existente.estado)) {
          throw new Error('El estudiante ya tiene una matrícula vigente en este ciclo.')
        }
        const { error: errUpd } = await supabase
          .from('matriculas')
          .update({
            grado: wizGrado, grupo: wizGrupo, tipo: wizTipo,
            estado: 'pendiente_docs',
            fecha_matricula: new Date().toISOString(),
            observaciones: wizObs.trim() || null,
            fecha_baja: null, motivo_baja: null,
          })
          .eq('id', existente.id)
        if (errUpd) throw new Error(`Error al reincorporar: ${errUpd.message}`)
      }

      setWizOkMsg('Matrícula registrada en estado "Pendiente de documentos"')
      // Reset suave: quédate en paso 4 con mensaje OK; ofrecer botón "Nueva matrícula"
    } catch (e) {
      setWizError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setWizGuardando(false)
    }
  }

  // Inicializar wizard al entrar al tab matricula (pre-cargar ciclo activo)
  useEffect(() => {
    if (tab !== 'matricula') return
    const activo = ciclos.find(c => c.activo)
    if (activo && !wizCicloId) setWizCicloId(activo.id)
  }, [tab, ciclos, wizCicloId])

  // Mostrar el ciclo activo en los tabs académicos (para saber sobre qué ciclo
  // se está trabajando, p. ej. 2026-1 vs 2027-1)
  useEffect(() => {
    if (!['cursos', 'horario', 'horas-docente', 'reportes-alumnos', 'buscar-alumnos', 'asist-alumnos'].includes(tab)) return
    getCicloActivo().then(c => setCicloActivoInfo(c ? { id: c.id, nombre: c.nombre } : null))
  }, [tab])

  // ── Matriculados del ciclo activo + historial de bajas ────────────────────
  async function cargarMatriculados() {
    const cicloId = ciclos.find(c => c.activo)?.id
    if (!cicloId) { setMatriculados([]); return }
    setListaMatLoading(true)
    const { data } = await supabase
      .from('matriculas')
      .select('id,grado,grupo,tipo,estado,fecha_matricula,fecha_baja,motivo_baja,alumnos(id,nombre,apellidos,dni)')
      .eq('ciclo_id', cicloId)
      .order('grado').order('grupo')
    type Row = { id: string; grado: string; grupo: string; tipo: string; estado: string; fecha_matricula: string | null; fecha_baja: string | null; motivo_baja: string | null; alumnos: { id: string; nombre: string; apellidos: string | null; dni: string | null } | null }
    const filas: MatriculadoRow[] = ((data ?? []) as unknown as Row[])
      .filter(r => r.alumnos)
      .map(r => ({
        matId: r.id, alumnoId: r.alumnos!.id,
        nombre: r.alumnos!.nombre, apellidos: r.alumnos!.apellidos, dni: r.alumnos!.dni,
        grado: r.grado, grupo: r.grupo, tipo: r.tipo, estado: r.estado,
        fecha_matricula: r.fecha_matricula, fecha_baja: r.fecha_baja, motivo_baja: r.motivo_baja,
      }))
      .sort((a, b) => (a.apellidos ?? '').localeCompare(b.apellidos ?? ''))
    setMatriculados(filas)
    setListaMatLoading(false)
  }

  async function cargarBajas() {
    setListaMatLoading(true)
    const { data: als } = await supabase
      .from('alumnos').select('id,nombre,apellidos,dni')
      .eq('activo', false)
      .order('apellidos')
    const lista = (als ?? []) as { id: string; nombre: string; apellidos: string | null; dni: string | null }[]
    if (!lista.length) { setBajas([]); setListaMatLoading(false); return }

    const { data: mats } = await supabase
      .from('matriculas')
      .select('alumno_id,grado,grupo,estado,fecha_baja,motivo_baja,fecha_matricula,ciclos(nombre)')
      .in('alumno_id', lista.map(a => a.id))
      .order('fecha_matricula', { ascending: false })
    type MatRow = { alumno_id: string; grado: string | null; grupo: string | null; estado: string | null; fecha_baja: string | null; motivo_baja: string | null; ciclos: { nombre: string } | null }
    const ultimaMat = new Map<string, MatRow>()
    for (const m of (mats ?? []) as unknown as MatRow[]) {
      if (!ultimaMat.has(m.alumno_id)) ultimaMat.set(m.alumno_id, m)
    }
    setBajas(lista.map(a => {
      const m = ultimaMat.get(a.id)
      return {
        alumnoId: a.id, nombre: a.nombre, apellidos: a.apellidos, dni: a.dni,
        cicloNombre: m?.ciclos?.nombre ?? null, grado: m?.grado ?? null, grupo: m?.grupo ?? null,
        estado: m?.estado ?? null, fecha_baja: m?.fecha_baja ?? null, motivo_baja: m?.motivo_baja ?? null,
      }
    }))
    setListaMatLoading(false)
  }

  useEffect(() => {
    if (tab !== 'matricula') return
    if (matriculaVista === 'lista') cargarMatriculados()
    if (matriculaVista === 'historial') cargarBajas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, matriculaVista, ciclos])

  async function darBajaAlumno(fila: MatriculadoRow, estado: 'retirado' | 'trasladado') {
    const nombreCompleto = `${fila.apellidos ?? ''} ${fila.nombre}`.trim()
    const res = await confirmar({
      titulo: estado === 'retirado'
        ? `¿Retirar de la escuela a ${nombreCompleto}?`
        : `¿Registrar el traslado de ${nombreCompleto}?`,
      mensaje: (
        <>
          Saldrá de su salón ({fila.grado} {fila.grupo}) y de todas las listas, pero{' '}
          <b>no se borra nada</b>: sus notas, asistencia y matrículas quedan en el
          historial. Podrás reincorporarlo con una nueva matrícula.
        </>
      ),
      tono: estado === 'retirado' ? 'peligro' : 'advertencia',
      confirmarLabel: estado === 'retirado' ? 'Retirar estudiante' : 'Registrar traslado',
      input: { label: 'Motivo', placeholder: estado === 'retirado' ? 'Ej. Motivos familiares' : 'Ej. Se traslada a otra institución …', requerido: true },
    })
    if (!res) return
    setBajaMsg('')
    const { data, error } = await supabase.rpc('dar_baja_alumno', {
      p_alumno_id: fila.alumnoId, p_estado: estado, p_motivo: res.texto,
    })
    const r = data as { ok?: boolean; error?: string; alumno?: string } | null
    if (error || r?.error) {
      setBajaMsg('Error: ' + (error?.message ?? r?.error))
    } else {
      setBajaMsg(`${r?.alumno ?? nombreCompleto} — ${estado === 'retirado' ? 'retiro registrado' : 'traslado registrado'}.`)
    }
    await cargarMatriculados()
  }

  // Reincorporar desde el historial: precarga el wizard en tipo Reincorporación
  function iniciarReincorporacion(b: BajaRow) {
    setWizTipo('reincorporacion')
    setWizAlumno({ id: b.alumnoId, nombre: b.nombre, apellidos: b.apellidos, dni: b.dni } as Alumno)
    setWizGrado(''); setWizGrupo(''); setWizObs(''); setWizError(''); setWizOkMsg('')
    setWizPaso(3)
    setMatriculaVista('wizard')
  }

  // Buscar alumnos: SOLO al apretar Enter o botón (no consume queries al escribir)
  async function ejecutarBusquedaAlumnos() {
    const texto = buscarAlumnoTexto.trim()
    if (!texto) { setBuscarAlumnoResultados([]); return }
    setBuscarAlumnoLoading(true)
    const { data } = await supabase
      .from('alumnos')
      .select(ALUMNO_FIELDS)
      .or(`nombre.ilike.%${texto}%,apellidos.ilike.%${texto}%,dni.ilike.%${texto}%,codigo_estudiante.ilike.%${texto}%`)
      .order('apellidos', { nullsFirst: false })
      .limit(40)
    setBuscarAlumnoResultados((data as Alumno[]) ?? [])
    setBuscarAlumnoLoading(false)
  }
  useEffect(() => { if (tab === 'horario') { cargarCursos(); cargarAsignaciones() } }, [tab])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'horario') cargarHorarios() }, [tab, vistaHorario, gradoFiltroH, grupoFiltroH, docenteFiltroH])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'cursos') { cargarCursos(); cargarAsignaciones(); cargarDocentes(pageDocentes, searchDocentes) } }, [tab])
  // Cargar ciclos en todos los tabs que dependen del ciclo activo (asist-alumnos
  // filtra matrículas por ciclo; alumnos/buscar-alumnos auto-matriculan en él).
  useEffect(() => {
    if (['ciclos', 'matricula', 'asist-alumnos', 'buscar-alumnos', 'alumnos'].includes(tab)) cargarCiclos()
  }, [tab])
  useEffect(() => { if (tab === 'justificaciones') cargarJustificaciones() }, [tab])
  useEffect(() => { if (tab === 'auditoria') cargarAuditLog() }, [tab])
  useEffect(() => { if (tab === 'ciclos' || tab === 'buscar-alumnos') cargarSalones() }, [tab])
  useEffect(() => { if (tab === 'anio-escolar') cargarGuiaAnio() }, [tab])
  useEffect(() => {
    return () => { if (scanAdminTimeoutRef.current) clearTimeout(scanAdminTimeoutRef.current) }
  }, [tab])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'reportes-alumnos') cargarReporteAlumnos() }, [tab, reporteGrado, reporteGrupo])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'asist-alumnos') cargarAsistAlumnos(asistGrado || undefined, asistGrupo || undefined) }, [tab, asistGrado, asistGrupo, semanaInicio])
  useEffect(() => {
    if (tab !== 'escaner-alumnos') return
    supabase.from('asistencia_alumnos_config')
      .select('hora_entrada,tolerancia_min,salida_tras_horas').eq('id', 1).maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const hora = String(data.hora_entrada).slice(0, 5)
        setScanCfg({ hora_entrada: hora, tolerancia_min: data.tolerancia_min, salida_tras_horas: data.salida_tras_horas })
        setScanCfgHora(hora)
      })
  }, [tab])
  useEffect(() => {
    if (view === 'content' && tab === 'docentes') {
      cargarDocentes(pageDocentes, searchDocentes)
      cargarAdministrativos()
      cargarAdmins()
    }
  }, [view, tab, pageDocentes, searchDocentes])
  useEffect(() => { if (view === 'content' && tab === 'alumnos')  cargarAlumnos(pageAlumnos,   searchAlumnos)  }, [view, tab, pageAlumnos,  searchAlumnos])

  async function cargarAdmins() {
    const { data } = await supabase.from('user_admin').select('id,nombre,email,usuario,apellido,dni,correo,celular,cumpleanos').order('nombre')
    setAdmins(data ?? [])
  }
  async function cargarAdministrativos() {
    const { data } = await supabase.from('administrativos').select('id,nombre,email,usuario,apellido,dni,correo,celular,cumpleanos').order('nombre')
    setAdministrativos(data ?? [])
  }
  async function cargarDocentes(page = 0, search = '') {
    const from = page * PAGE_DOCENTES
    const to   = from + PAGE_DOCENTES - 1
    let query = supabase
      .from('docentes')
      .select('id,nombre,apellido,dni,email,grado,grupo,usuario,correo,celular,cumpleanos', { count: 'exact' })
      .order('nombre')
      .range(from, to)
    if (search.trim())
      query = query.or(`nombre.ilike.%${search}%,apellido.ilike.%${search}%,dni.ilike.%${search}%`)
    const { data, count } = await query
    setDocentes((data as Docente[]) ?? [])
    setTotalDocentes(count ?? 0)
  }
  async function cargarDocentesLean() {
    const { data } = await supabase.from('docentes').select('id,nombre').order('nombre')
    setDocentesLean((data ?? []) as {id:string;nombre:string}[])
  }
  const ALUMNO_FIELDS = 'id,nombre,apellidos,dni,grado,grupo,usuario,celular,celular_apoderado,fecha_nacimiento,sexo,codigo_estudiante,nombre_apoderado,dni_apoderado,correo_apoderado,parentesco_apoderado'

  async function cargarAlumnos(page = 0, search = '') {
    if (!search.trim()) {
      const { count } = await supabase.from('alumnos').select('id', { count: 'exact', head: true })
      setAlumnos([])
      setTotalAlumnos(count ?? 0)
      return
    }
    const from = page * PAGE_DOCENTES
    const to   = from + PAGE_DOCENTES - 1
    const { data, count } = await supabase
      .from('alumnos')
      .select(ALUMNO_FIELDS, { count: 'exact' })
      .or(`nombre.ilike.%${search}%,apellidos.ilike.%${search}%,dni.ilike.%${search}%,codigo_estudiante.ilike.%${search}%`)
      .order('apellidos', { nullsFirst: false })
      .range(from, to)
    setAlumnos((data as Alumno[]) ?? [])
    setTotalAlumnos(count ?? 0)
  }
  // Resuelve docente_id (auth.users) → {nombre,email} a partir de docentes y
  // administrativos. Necesario porque `asistencias.docente_id` ya no tiene FK a
  // `docentes` (apunta a auth.users desde 20260622120000), así que el embed de
  // PostgREST `docentes(...)` dejó de resolver y hacía fallar la query completa.
  async function attachPersonas(rows: Asistencia[]): Promise<Asistencia[]> {
    const ids = Array.from(new Set(rows.map(r => r.docente_id).filter(Boolean))) as string[]
    if (!ids.length) return rows
    const [{ data: docs }, { data: advs }] = await Promise.all([
      supabase.from('docentes').select('id,nombre,email').in('id', ids),
      supabase.from('administrativos').select('id,nombre,correo').in('id', ids),
    ])
    const map = new Map<string, { nombre: string; email: string }>()
    for (const d of (docs ?? []) as { id: string; nombre: string; email: string | null }[])
      map.set(d.id, { nombre: d.nombre, email: d.email ?? '' })
    for (const a of (advs ?? []) as { id: string; nombre: string; correo: string | null }[])
      if (!map.has(a.id)) map.set(a.id, { nombre: a.nombre, email: a.correo ?? '' })
    return rows.map(r => ({ ...r, docentes: r.docente_id ? (map.get(r.docente_id) ?? null) : null }))
  }
  async function cargarReporte() {
    setLoadingReporte(true)
    const { start, end } = rangoDia(fechaFiltro)
    const diaSemana = diaSemanaDesde(fechaFiltro)
    const [{ data }, { data: hors }] = await Promise.all([
      supabase
        .from('asistencias')
        .select('id,fecha_hora,docente_id,tipo,justificada')
        .gte('fecha_hora', start).lte('fecha_hora', end)
        .order('fecha_hora', { ascending: true }),
      diaSemana
        ? supabase.from('horarios').select('id,docente_id,dia,hora_inicio,hora_fin,materia,grado,grupo').eq('dia', diaSemana).eq('activo', true)
        : Promise.resolve({ data: [] }),
    ])
    setAsistencias(await attachPersonas((data as unknown as Asistencia[]) ?? []))
    setHorariosReporte((hors as unknown as Horario[]) ?? [])

    // Hora de entrada fija de cada persona presente (para los que no tienen horario).
    const ids = Array.from(new Set(((data as { docente_id?: string }[]) ?? []).map(a => a.docente_id).filter(Boolean))) as string[]
    const heMap = new Map<string, { hora: string | null; tabla: 'docentes' | 'administrativos' }>()
    if (ids.length) {
      const [{ data: docHE }, { data: advHE }] = await Promise.all([
        supabase.from('docentes').select('id,hora_entrada').in('id', ids),
        supabase.from('administrativos').select('id,hora_entrada').in('id', ids),
      ])
      for (const d of (docHE ?? []) as { id: string; hora_entrada: string | null }[])
        heMap.set(d.id, { hora: d.hora_entrada ? String(d.hora_entrada).slice(0, 5) : null, tabla: 'docentes' })
      for (const a of (advHE ?? []) as { id: string; hora_entrada: string | null }[])
        if (!heMap.has(a.id)) heMap.set(a.id, { hora: a.hora_entrada ? String(a.hora_entrada).slice(0, 5) : null, tabla: 'administrativos' })
    }
    setHoraEntradaMap(heMap)

    setDetallesAbiertos(new Set())
    setLoadingReporte(false)
  }

  // Guarda la hora de entrada fija de un docente/administrativo sin horario.
  async function guardarHoraEntrada(docenteId: string) {
    const info = horaEntradaMap.get(docenteId)
    const tabla = info?.tabla ?? 'administrativos'
    const val = nuevaHoraEntrada || null
    setGuardandoHoraEntrada(true)
    const { error } = await supabase.from(tabla).update({ hora_entrada: val }).eq('id', docenteId)
    setGuardandoHoraEntrada(false)
    if (error) { alert('No se pudo guardar la hora de entrada. Verifica que la migración esté aplicada.'); return }
    setHoraEntradaMap(prev => {
      const next = new Map(prev)
      next.set(docenteId, { hora: val, tabla })
      return next
    })
    setEditHoraEntrada(null)
    setNuevaHoraEntrada('')
  }
  async function cargarReporteAlumnos() {
    setLoadingReporteAlumnos(true)
    setReporteAbiertoId(null)

    // Alumnos del grado/grupo
    const { data: alumnos } = await supabase
      .from('alumnos').select('id,nombre,apellidos,usuario')
      .eq('grado', reporteGrado).eq('grupo', reporteGrupo)
      .order('apellidos')
    if (!alumnos?.length) { setReporteAlumnos([]); setLoadingReporteAlumnos(false); return }

    // Asignaciones del grado/grupo (solo del ciclo activo)
    const cicloIdRep = (await getCicloActivo())?.id ?? null
    let asigsQ = supabase
      .from('asignaciones').select('id,cursos(nombre,color)')
      .eq('grado', reporteGrado).eq('grupo', reporteGrupo)
    if (cicloIdRep) asigsQ = asigsQ.eq('ciclo_id', cicloIdRep)
    const { data: asigs } = await asigsQ
    const asigList = (asigs ?? []) as unknown as { id: string; cursos: { nombre: string; color: string } | null }[]
    const asigIds  = asigList.map(a => a.id)

    if (!asigIds.length) {
      setReporteAlumnos(alumnos.map(al => ({ ...al, cursos: [] })))
      setLoadingReporteAlumnos(false)
      return
    }

    // Tareas (cascada)
    const { data: unidades } = await supabase.from('unidades').select('id,asignacion_id').in('asignacion_id', asigIds)
    const unidadIds = (unidades ?? []).map((u: { id: string }) => u.id)
    const { data: sesiones } = unidadIds.length
      ? await supabase.from('sesiones').select('id,unidad_id').in('unidad_id', unidadIds)
      : { data: [] }
    const sesionIds = (sesiones ?? []).map((s: { id: string }) => s.id)
    const { data: tareas } = sesionIds.length
      ? await supabase.from('tareas').select('id,sesion_id').in('sesion_id', sesionIds)
      : { data: [] }
    const tareaIds = (tareas ?? []).map((t: { id: string }) => t.id)

    // Mapa tarea → asignacion
    const unidadAsig: Record<string, string> = {}
    ;(unidades ?? []).forEach((u: { id: string; asignacion_id: string }) => { unidadAsig[u.id] = u.asignacion_id })
    const sesionAsig: Record<string, string> = {}
    ;(sesiones ?? []).forEach((s: { id: string; unidad_id: string }) => { sesionAsig[s.id] = unidadAsig[s.unidad_id] })
    const tareaAsig: Record<string, string> = {}
    ;(tareas ?? []).forEach((t: { id: string; sesion_id: string }) => { tareaAsig[t.id] = sesionAsig[t.sesion_id] })

    // Entregas + calificaciones de todos los alumnos
    const alumnoIds = alumnos.map(a => a.id)
    const { data: entregas } = tareaIds.length
      ? await supabase.from('entregas').select('id,tarea_id,alumno_id,calificaciones(nota)')
          .in('alumno_id', alumnoIds).in('tarea_id', tareaIds)
      : { data: [] }

    type Entrega = { id: string; tarea_id: string; alumno_id: string; calificaciones: { nota: number }[] }
    const entregasList = (entregas ?? []) as unknown as Entrega[]
    const tareaList    = (tareas ?? []) as { id: string; sesion_id: string }[]

    const resultado: ReporteAlumno[] = alumnos.map(al => {
      const cursoData = asigList.map(a => {
        const misTareaIds = new Set(tareaList.filter(t => tareaAsig[t.id] === a.id).map(t => t.id))
        const misEntregas = entregasList.filter(e => e.alumno_id === al.id && misTareaIds.has(e.tarea_id))
        const calificadas = misEntregas.filter(e => e.calificaciones?.length > 0)
        const notas = calificadas.map(e => e.calificaciones[0].nota)
        const promedio = notas.length > 0
          ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length * 10) / 10
          : null
        return { asigId: a.id, nombre: a.cursos?.nombre ?? 'Curso', color: a.cursos?.color ?? '#143875', promedio }
      })
      return { id: al.id, nombre: al.nombre, apellidos: al.apellidos, usuario: al.usuario, cursos: cursoData }
    })

    setReporteAlumnos(resultado)
    setLoadingReporteAlumnos(false)
  }

  function diasDeSemana(lunes: Date): Date[] {
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(lunes); d.setDate(lunes.getDate() + i); return d
    })
  }
  function fechaISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  async function cargarAsistAlumnos(gradoParam?: string, grupoParam?: string) {
    setLoadingAsistAlumnos(true)
    setAsistDetalleId(null)

    const GRADOS_ORDEN_ASIST = [
      '1° Ciclo Cocina','2° Ciclo Cocina','3° Ciclo Cocina','4° Ciclo Cocina',
      '1° Ciclo Pastelería','2° Ciclo Pastelería',
    ]
    const cicloId = ciclos.find(c => c.activo)?.id ?? null

    // Salones reales del ciclo activo
    const [{ data: matsGrps }, { data: salsData }] = await Promise.all([
      cicloId
        ? supabase.from('matriculas').select('grado,grupo').eq('ciclo_id', cicloId)
        : supabase.from('matriculas').select('grado,grupo'),
      supabase.from('salones').select('grado,grupo,nombre'),
    ])
    const salonMap: Record<string, string | null> = {}
    for (const s of (salsData ?? []) as { grado: string; grupo: string; nombre: string | null }[]) {
      salonMap[`${s.grado}-${s.grupo}`] = s.nombre ?? null
    }
    const seen = new Set<string>()
    const listaS: { grado: string; grupo: string; nombre: string | null }[] = []
    for (const m of (matsGrps ?? []) as { grado: string; grupo: string }[]) {
      const k = `${m.grado}-${m.grupo}`
      if (!seen.has(k)) { seen.add(k); listaS.push({ grado: m.grado, grupo: m.grupo, nombre: salonMap[k] ?? null }) }
    }
    listaS.sort((a, b) => {
      const gi = GRADOS_ORDEN_ASIST.indexOf(a.grado) - GRADOS_ORDEN_ASIST.indexOf(b.grado)
      return gi !== 0 ? gi : a.grupo.localeCompare(b.grupo)
    })
    setAsistSalones(listaS)

    const grado = gradoParam || asistGrado || listaS[0]?.grado || ''
    const grupo  = grupoParam  || asistGrupo  || listaS[0]?.grupo  || ''
    if (!grado) { setAsistAlumnos([]); setAsistSemanaMap({}); setLoadingAsistAlumnos(false); return }
    if (grado !== asistGrado) setAsistGrado(grado)
    if (grupo  !== asistGrupo) setAsistGrupo(grupo)

    // Alumnos vía matriculas
    const { data: studMats } = cicloId
      ? await supabase.from('matriculas').select('alumnos(id,nombre,apellidos,usuario)')
          .eq('ciclo_id', cicloId).eq('grado', grado).eq('grupo', grupo)
      : await supabase.from('matriculas').select('alumnos(id,nombre,apellidos,usuario)')
          .eq('grado', grado).eq('grupo', grupo)

    type AlRow = { id: string; nombre: string; apellidos: string | null; usuario: string | null }
    const alumnos: AlRow[] = (studMats ?? []).flatMap((m: Record<string, unknown>) =>
      m.alumnos ? [m.alumnos as AlRow] : []
    )
    alumnos.sort((a, b) => ((a.apellidos ?? a.nombre) || '').localeCompare((b.apellidos ?? b.nombre) || ''))
    setAsistAlumnos(alumnos.map(a => ({ id: a.id, nombre: a.nombre, apellidos: a.apellidos ?? '', usuario: a.usuario })))

    if (!alumnos.length) { setAsistSemanaMap({}); setLoadingAsistAlumnos(false); return }

    // Asistencia diaria de la semana seleccionada (lunes a viernes)
    const dias = diasDeSemana(semanaInicio)
    const lunesISO  = fechaISO(dias[0])
    const viernesISO = fechaISO(dias[4])
    const alumnoIds = alumnos.map(a => a.id)

    const { data: registros } = await supabase
      .from('asistencia_diaria_alumnos')
      .select('id,alumno_id,fecha,estado,created_at,hora_salida,observacion')
      .in('alumno_id', alumnoIds)
      .gte('fecha', lunesISO)
      .lte('fecha', viernesISO)

    type RegRow = { id: string; alumno_id: string; fecha: string; estado: string | null; created_at: string; hora_salida: string | null; observacion: string | null }
    const regs = (registros ?? []) as RegRow[]

    // Construir mapa alumnoId → fecha → RegistroDia
    const mapa: Record<string, Record<string, RegistroDia>> = {}
    for (const r of regs) {
      if (!mapa[r.alumno_id]) mapa[r.alumno_id] = {}
      const horaEntrada = r.created_at
        ? new Date(r.created_at).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
        : null
      const horaSalida = r.hora_salida
        ? new Date(r.hora_salida).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
        : null
      mapa[r.alumno_id][r.fecha] = {
        record_id:    r.id,
        estado:       (r.estado as EstadoAsist) ?? 'P',
        hora_entrada: horaEntrada,
        hora_salida:  horaSalida,
        observacion:  r.observacion ?? null,
      }
    }
    setAsistSemanaMap(mapa)
    setLoadingAsistAlumnos(false)
  }

  async function handleCeldaAsist(alumnoId: string, fecha: string, cicloId: string | null) {
    const clave = `${alumnoId}-${fecha}`
    setGuardandoCeldaAsist(clave)
    const regActual = asistSemanaMap[alumnoId]?.[fecha]

    const nuevoMapa = { ...asistSemanaMap }
    if (!nuevoMapa[alumnoId]) nuevoMapa[alumnoId] = {}

    if (!regActual) {
      // Sin registro → agregar J (justificado)
      const { data } = await supabase.from('asistencia_diaria_alumnos')
        .insert({ alumno_id: alumnoId, ciclo_id: cicloId, fecha, estado: 'J' })
        .select('id,alumno_id,fecha,estado,created_at,hora_salida').maybeSingle()
      if (data) {
        nuevoMapa[alumnoId][fecha] = { record_id: data.id, estado: 'J', hora_entrada: null, hora_salida: null, observacion: null }
      }
    } else if (regActual.estado === 'J') {
      // J → eliminar → F
      await supabase.from('asistencia_diaria_alumnos').delete().eq('id', regActual.record_id)
      const rest = { ...nuevoMapa[alumnoId] }
      delete rest[fecha]
      nuevoMapa[alumnoId] = rest
    } else {
      // P ↔ T
      const nuevoEstado: EstadoAsist = regActual.estado === 'P' ? 'T' : 'P'
      await supabase.from('asistencia_diaria_alumnos').update({ estado: nuevoEstado }).eq('id', regActual.record_id)
      nuevoMapa[alumnoId][fecha] = { ...regActual, estado: nuevoEstado }
    }

    setAsistSemanaMap(nuevoMapa)
    setGuardandoCeldaAsist(null)
  }

  // Guarda/actualiza la observación del día (visible en la consulta de notas).
  // Solo en días con registro (P/T/J); para una falta, marca primero el estado.
  async function guardarObservacion(alumnoId: string, fecha: string, texto: string) {
    const regActual = asistSemanaMap[alumnoId]?.[fecha]
    if (!regActual) return
    const clave = `obs-${alumnoId}-${fecha}`
    setGuardandoObs(clave)
    const valor = texto.trim() || null
    await supabase.from('asistencia_diaria_alumnos').update({ observacion: valor }).eq('id', regActual.record_id)
    const nuevoMapa = { ...asistSemanaMap }
    nuevoMapa[alumnoId] = { ...nuevoMapa[alumnoId], [fecha]: { ...regActual, observacion: valor } }
    setAsistSemanaMap(nuevoMapa)
    setGuardandoObs(null)
  }

  async function generarReporteAsistMensual() {
    if (!asistAlumnos.length || !asistGrado) return
    setImprimiendoAsist(true)

    const [yearStr, monthStr] = mesReporte.split('-')
    const year  = parseInt(yearStr)
    const month = parseInt(monthStr) - 1

    // Weekdays del mes (Lun–Vie)
    const diasMes: Date[] = []
    const cursor = new Date(year, month, 1)
    while (cursor.getMonth() === month) {
      const dow = cursor.getDay()
      if (dow >= 1 && dow <= 5) diasMes.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }

    // Fetch asistencia del mes
    const alumnoIds  = asistAlumnos.map(a => a.id)
    const primerDiaS = `${yearStr}-${monthStr}-01`
    const ultimoDiaN = new Date(year, month + 1, 0).getDate()
    const ultimoDiaS = `${yearStr}-${monthStr}-${String(ultimoDiaN).padStart(2,'0')}`

    const { data: registros } = await supabase
      .from('asistencia_diaria_alumnos')
      .select('alumno_id,fecha,estado')
      .in('alumno_id', alumnoIds)
      .gte('fecha', primerDiaS)
      .lte('fecha', ultimoDiaS)

    type RegM = { alumno_id: string; fecha: string; estado: string | null }
    const regs = (registros ?? []) as RegM[]

    const mapaM: Record<string, Record<string, string>> = {}
    for (const r of regs) {
      if (!mapaM[r.alumno_id]) mapaM[r.alumno_id] = {}
      mapaM[r.alumno_id][r.fecha] = r.estado ?? 'P'
    }
    const fechasConReg = new Set(regs.map(r => r.fecha))
    const todayISO2 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

    // ── Paleta (igual que boletines) ────────────────────────────────────────
    const WINE  = '#6B1A1A'
    const WINE2 = '#991B1B'
    const GOLD  = '#C9A84C'
    const GOLD2 = '#FDF3DC'
    const WHITE = '#FFFFFF'
    const DARK  = '#1C1C1C'
    const GRAY  = '#64748B'

    // ── Dimensiones ──────────────────────────────────────────────────────────
    const COL_NAME  = 175
    const PAD       = 16
    const nDias     = diasMes.length
    const COL_DAY   = Math.floor((1050 - COL_NAME - PAD * 2) / nDias)
    const W         = PAD + COL_NAME + nDias * COL_DAY + PAD

    const HDR_H     = 100
    const TITLE_H   = 50
    const INFO_H    = 44
    const TABLE_HDR = 38
    const ROW_H     = 26
    const LEGEND_H  = 38
    const FOOTER_H  = 34
    const TABLE_Y   = HDR_H + 3 + TITLE_H + INFO_H + 10
    const H = TABLE_Y + TABLE_HDR + asistAlumnos.length * ROW_H + LEGEND_H + FOOTER_H + 12

    const canvas  = document.createElement('canvas')
    canvas.width  = W * 2
    canvas.height = H * 2
    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2)

    ctx.fillStyle = WHITE; ctx.fillRect(0, 0, W, H)

    // ── Header vino ──────────────────────────────────────────────────────────
    ctx.fillStyle = WINE; ctx.fillRect(0, 0, W, HDR_H)

    const lbS = 60, lbX = 20, lbY = 20
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2
    ctx.fillStyle = WHITE
    ctx.beginPath(); ctx.roundRect(lbX, lbY, lbS, lbS, 8); ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(lbX, lbY, lbS, lbS, 8); ctx.stroke()

    await new Promise<void>(resolve => {
      const img = new window.Image(); img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, lbX + 7, lbY + 7, lbS - 14, lbS - 14); resolve() }
      img.onerror = () => resolve()
      img.src = '/aceg-isotipo.png'
    })

    ctx.textAlign = 'left'
    ctx.fillStyle = '#FDF3DC'; ctx.font = 'bold 9px system-ui, sans-serif'
    ctx.fillText('ESCUELA GASTRONÓMICA', 92, 38)
    ctx.fillStyle = WHITE; ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.fillText('ACEG', 92, 57)
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '500 9px system-ui, sans-serif'
    ctx.fillText('Juliaca · Puno · Perú', 92, 73)

    ctx.fillStyle = GOLD; ctx.fillRect(0, HDR_H, W, 3)

    // ── Título ───────────────────────────────────────────────────────────────
    const titleY = HDR_H + 3 + 8
    ctx.fillStyle = WINE; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('REPORTE DE ASISTENCIA MENSUAL', W / 2, titleY + 14)
    const salonNombreActual = asistSalones.find(s => s.grado === asistGrado && s.grupo === asistGrupo)?.nombre
    const salonStr = `${asistGrado}  ·  Sección ${asistGrupo}${salonNombreActual ? `  ·  ${salonNombreActual}` : ''}`
    ctx.fillStyle = GRAY; ctx.font = '500 9px system-ui, sans-serif'
    ctx.fillText(salonStr, W / 2, titleY + 30)

    // ── Ficha info ───────────────────────────────────────────────────────────
    const infoY = titleY + TITLE_H
    ctx.fillStyle = GOLD2
    ctx.beginPath(); ctx.roundRect(PAD, infoY, W - PAD * 2, INFO_H, 8); ctx.fill()
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(PAD, infoY, W - PAD * 2, INFO_H, 8); ctx.stroke()

    const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    ctx.textAlign = 'left'
    ctx.fillStyle = DARK; ctx.font = 'bold 12px system-ui, sans-serif'
    ctx.fillText(`${MESES_ES[month]} ${year}`, PAD + 12, infoY + 17)
    ctx.fillStyle = GRAY; ctx.font = '500 9px system-ui, sans-serif'
    ctx.fillText(`${diasMes.length} días lectivos (Lun – Vie)  ·  ${asistAlumnos.length} estudiantes`, PAD + 12, infoY + 33)
    const cicloNombreM = ciclos.find(c => c.activo)?.nombre ?? ''
    if (cicloNombreM) {
      ctx.textAlign = 'right'
      ctx.fillStyle = WINE; ctx.font = 'bold 9px system-ui, sans-serif'
      ctx.fillText(cicloNombreM, W - PAD - 12, infoY + 25)
    }

    // ── Tabla ────────────────────────────────────────────────────────────────
    const tX    = PAD
    const tW    = W - PAD * 2
    const tY    = TABLE_Y
    const dayXs = diasMes.map((_, i) => PAD + COL_NAME + i * COL_DAY)
    const DIA_ABREV: Record<number, string> = { 1:'L', 2:'M', 3:'X', 4:'J', 5:'V' }

    // Encabezado tabla
    ctx.fillStyle = WINE2
    ctx.beginPath(); ctx.roundRect(tX, tY, tW, TABLE_HDR, [6, 6, 0, 0]); ctx.fill()

    ctx.textAlign = 'left'
    ctx.fillStyle = WHITE; ctx.font = 'bold 8px system-ui, sans-serif'
    ctx.fillText('ALUMNO', tX + 10, tY + TABLE_HDR / 2 + 3)

    diasMes.forEach((d, i) => {
      const cx = dayXs[i] + COL_DAY / 2
      ctx.textAlign = 'center'
      ctx.fillStyle = WHITE; ctx.font = 'bold 9px system-ui, sans-serif'
      ctx.fillText(String(d.getDate()), cx, tY + TABLE_HDR / 2 - 2)
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '500 7px system-ui, sans-serif'
      ctx.fillText(DIA_ABREV[d.getDay()] ?? '', cx, tY + TABLE_HDR / 2 + 9)
    })

    // Borde exterior tabla
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1
    ctx.strokeRect(tX, tY, tW, TABLE_HDR + asistAlumnos.length * ROW_H)

    // Separador columna nombre
    ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(tX + COL_NAME, tY); ctx.lineTo(tX + COL_NAME, tY + TABLE_HDR + asistAlumnos.length * ROW_H); ctx.stroke()

    // Filas alumnos
    const ST_CELL: Record<string, { bg: string; color: string }> = {
      P: { bg: '#f0fdf4', color: '#16a34a' },
      T: { bg: '#fffbeb', color: '#d97706' },
      J: { bg: '#eff6ff', color: '#2563eb' },
      F: { bg: '#fff1f2', color: '#ef4444' },
    }

    asistAlumnos.forEach((al, rowIdx) => {
      const ry      = tY + TABLE_HDR + rowIdx * ROW_H
      const isEven  = rowIdx % 2 === 0
      const rowBg   = isEven ? WHITE : '#f8fafc'

      ctx.fillStyle = rowBg; ctx.fillRect(tX, ry, tW, ROW_H)

      if (rowIdx > 0) {
        ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(tX, ry); ctx.lineTo(tX + tW, ry); ctx.stroke()
      }

      // Nombre alumno
      const nombre = `${al.apellidos ?? ''}, ${al.nombre}`.trim()
      ctx.fillStyle = DARK; ctx.font = '500 8.5px system-ui, sans-serif'; ctx.textAlign = 'left'
      let nomTrunc = nombre
      while (ctx.measureText(nomTrunc).width > COL_NAME - 14 && nomTrunc.length > 1) nomTrunc = nomTrunc.slice(0, -1)
      if (nomTrunc.length < nombre.length) nomTrunc += '…'
      ctx.fillText(nomTrunc, tX + 8, ry + ROW_H / 2 + 3)

      // Celdas días
      diasMes.forEach((d, i) => {
        const fISO    = fechaISO(d)
        const esFuturo = fISO > todayISO2
        const sinClase = !esFuturo && !fechasConReg.has(fISO)
        const estado  = mapaM[al.id]?.[fISO] ?? (esFuturo || sinClase ? null : 'F')
        const cellX   = dayXs[i]
        const st      = estado ? ST_CELL[estado] : { bg: rowBg, color: '#cbd5e1' }

        ctx.fillStyle = st.bg; ctx.fillRect(cellX, ry, COL_DAY, ROW_H)
        if (estado) {
          ctx.fillStyle = st.color; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center'
          ctx.fillText(estado, cellX + COL_DAY / 2, ry + ROW_H / 2 + 3)
        }
        ctx.strokeStyle = '#ebebeb'; ctx.lineWidth = 0.4
        ctx.beginPath(); ctx.moveTo(cellX, ry); ctx.lineTo(cellX, ry + ROW_H); ctx.stroke()
      })
    })

    // ── Leyenda ──────────────────────────────────────────────────────────────
    const legendY = tY + TABLE_HDR + asistAlumnos.length * ROW_H + 10
    const legendItems = [
      { k:'P', label:'Presente',    bg:'#f0fdf4', color:'#16a34a', border:'#86efac' },
      { k:'T', label:'Tardanza',    bg:'#fffbeb', color:'#d97706', border:'#fde68a' },
      { k:'J', label:'Justificado', bg:'#eff6ff', color:'#2563eb', border:'#bfdbfe' },
      { k:'F', label:'Falta',       bg:'#fff1f2', color:'#ef4444', border:'#fecdd3' },
    ]
    let legX = tX + 8
    ctx.fillStyle = GRAY; ctx.font = '500 8px system-ui, sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('Leyenda:', legX, legendY + 14); legX += 54
    for (const e of legendItems) {
      ctx.fillStyle = e.bg
      ctx.beginPath(); ctx.roundRect(legX, legendY + 3, 20, 16, 3); ctx.fill()
      ctx.strokeStyle = e.border; ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.roundRect(legX, legendY + 3, 20, 16, 3); ctx.stroke()
      ctx.fillStyle = e.color; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(e.k, legX + 10, legendY + 14)
      legX += 24
      ctx.fillStyle = GRAY; ctx.font = '500 8px system-ui, sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(e.label, legX, legendY + 14)
      legX += ctx.measureText(e.label).width + 20
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const footerY = legendY + LEGEND_H
    ctx.fillStyle = GRAY; ctx.font = '400 7.5px system-ui, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`© ${new Date().getFullYear()} Escuela Gastronómica ACEG`, W / 2, footerY + 10)
    ctx.fillText('Documento generado automáticamente · Solo para uso interno', W / 2, footerY + 22)

    const gradBot = ctx.createLinearGradient(0, 0, W, 0)
    gradBot.addColorStop(0, GOLD); gradBot.addColorStop(1, '#F0C75A')
    ctx.fillStyle = gradBot; ctx.fillRect(0, H - 4, W, 4)

    // ── Descarga ─────────────────────────────────────────────────────────────
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/png'))
    if (blob) {
      const MESES_SAFE = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
      const safe = `asistencia-${asistGrado}-${asistGrupo}-${MESES_SAFE[month]}-${year}`
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]/gi, '-')
        .toLowerCase().replace(/-+/g, '-')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${safe}.png`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    setImprimiendoAsist(false)
  }

  async function exportarReporteAsistExcel() {
    if (!asistAlumnos.length || !asistGrado) return
    setImprimiendoAsist(true)

    const [yearStr, monthStr] = mesReporte.split('-')
    const year  = parseInt(yearStr)
    const month = parseInt(monthStr) - 1

    // Días hábiles del mes
    const diasMes: Date[] = []
    const cursor = new Date(year, month, 1)
    while (cursor.getMonth() === month) {
      const dow = cursor.getDay()
      if (dow >= 1 && dow <= 5) diasMes.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }

    // Fetch asistencia
    const alumnoIds  = asistAlumnos.map(a => a.id)
    const primerDiaS = `${yearStr}-${monthStr}-01`
    const ultimoDiaN = new Date(year, month + 1, 0).getDate()
    const ultimoDiaS = `${yearStr}-${monthStr}-${String(ultimoDiaN).padStart(2,'0')}`

    const { data: registros } = await supabase
      .from('asistencia_diaria_alumnos')
      .select('alumno_id,fecha,estado')
      .in('alumno_id', alumnoIds)
      .gte('fecha', primerDiaS)
      .lte('fecha', ultimoDiaS)

    type RegM = { alumno_id: string; fecha: string; estado: string | null }
    const regs = (registros ?? []) as RegM[]
    const mapaM: Record<string, Record<string, string>> = {}
    for (const r of regs) {
      if (!mapaM[r.alumno_id]) mapaM[r.alumno_id] = {}
      mapaM[r.alumno_id][r.fecha] = r.estado ?? 'P'
    }
    const fechasConReg = new Set(regs.map(r => r.fecha))
    const todayISO2 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

    const MESES_ES   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    const MESES_SAFE = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    const DIA_ABR: Record<number,string> = { 1:'L', 2:'M', 3:'X', 4:'J', 5:'V' }
    const mesStr = `${MESES_ES[month]} ${year}`
    const salonNombreXL = asistSalones.find(s => s.grado === asistGrado && s.grupo === asistGrupo)?.nombre
    const salonStr = `${asistGrado}  —  Sección ${asistGrupo}${salonNombreXL ? `  —  ${salonNombreXL}` : ''}`
    const cicloNom = ciclos.find(c => c.activo)?.nombre ?? ''
    const totalCols = 2 + diasMes.length + 5
    const sumStart  = 3 + diasMes.length   // 1-indexed col donde empiezan P/F/T/J/%

    // Paleta ARGB
    const CW  = 'FF6B1A1A', CW2 = 'FF8B1A28', CG = 'FFC9A84C', CG2 = 'FFFDF3DC'
    const CWH = 'FFFFFFFF', CDK = 'FF1C1C1C', CGR = 'FF64748B', CLT = 'FFF8FAFC'
    const SS: Record<string,{bg:string;fg:string}> = {
      P:{bg:'FFF0FDF4',fg:'FF16A34A'}, T:{bg:'FFFFFBEB',fg:'FFD97706'},
      J:{bg:'FFEFF6FF',fg:'FF2563EB'}, F:{bg:'FFFFF1F2',fg:'FFEF4444'},
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const EJS: any = await import('exceljs')
    const wb = new EJS.Workbook()
    wb.creator = 'Sistema ACEG'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws: any = wb.addWorksheet(`Asist ${MESES_ES[month].slice(0,3)} ${year}`, {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    })

    ws.columns = [
      { width: 5 },
      { width: 33 },
      ...diasMes.map(() => ({ width: 5 })),
      { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 10 },
    ]

    // Helpers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function applyCell(cell: any, opts: {
      value?: unknown; bg?: string; fg?: string; bold?: boolean; size?: number
      hAlign?: string; vAlign?: string; wrap?: boolean
      borderColor?: string; italic?: boolean
    }) {
      if (opts.value !== undefined) cell.value = opts.value
      if (opts.bg) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb: opts.bg } }
      cell.font = { name:'Calibri', size: opts.size ?? 9, bold: opts.bold ?? false,
        italic: opts.italic ?? false, color:{ argb: opts.fg ?? CDK } }
      cell.alignment = { horizontal: opts.hAlign ?? 'center', vertical: opts.vAlign ?? 'middle',
        wrapText: opts.wrap ?? false }
      if (opts.borderColor !== undefined) {
        const b = { style:'thin', color:{ argb: opts.borderColor || 'FFE5E7EB' } }
        cell.border = { top:b, left:b, bottom:b, right:b }
      }
    }

    // ── Fila 1: escuela ──────────────────────────────────────────────────────
    const r1 = ws.addRow(['Escuela Gastronómica ACEG  ·  Juliaca, Puno'])
    r1.height = 22
    ws.mergeCells(1, 1, 1, totalCols)
    applyCell(r1.getCell(1), { bg:CW, fg:'FFFDF3DC', bold:true, size:11 })

    // ── Fila 2: título reporte ───────────────────────────────────────────────
    const r2 = ws.addRow([`REPORTE DE ASISTENCIA MENSUAL  —  ${mesStr}`])
    r2.height = 24
    ws.mergeCells(2, 1, 2, totalCols)
    applyCell(r2.getCell(1), { bg:CW2, fg:CWH, bold:true, size:12 })

    // ── Fila 3: info salón ───────────────────────────────────────────────────
    const r3 = ws.addRow([`${salonStr}   |   Ciclo: ${cicloNom}   |   ${diasMes.length} días lectivos   |   ${asistAlumnos.length} estudiantes`])
    r3.height = 20
    ws.mergeCells(3, 1, 3, totalCols)
    applyCell(r3.getCell(1), { bg:CG2, fg:CDK, size:10 })
    r3.getCell(1).border = {
      top:   { style:'medium', color:{ argb:CG } },
      bottom:{ style:'medium', color:{ argb:CG } },
    }

    // ── Fila 4: espaciado ────────────────────────────────────────────────────
    ws.addRow([])

    // ── Fila 5: encabezados de columnas ──────────────────────────────────────
    const hdrs = ['N°', 'Apellidos y Nombre',
      ...diasMes.map(d => `${DIA_ABR[d.getDay()]}\n${d.getDate()}`),
      'P', 'F', 'T', 'J', '% Asist.',
    ]
    const r5 = ws.addRow(hdrs)
    r5.height = 34
    r5.eachCell((cell: import('exceljs').Cell, col: number) => {
      const isSummary = col >= sumStart
      const summaryBg = [SS.P.bg, SS.F.bg, SS.T.bg, SS.J.bg][col - sumStart] ?? CW2
      const summaryFg = [SS.P.fg, SS.F.fg, SS.T.fg, SS.J.fg][col - sumStart] ?? CWH
      applyCell(cell, {
        bg: isSummary ? summaryBg : CW2,
        fg: isSummary ? summaryFg : CWH,
        bold: true, size: 9, wrap: true,
        borderColor: CW,
      })
    })
    // Nombre header: left-aligned
    applyCell(r5.getCell(2), { bg:CW2, fg:CWH, bold:true, size:9, hAlign:'left', wrap:true, borderColor:CW })

    // ── Filas de alumnos ─────────────────────────────────────────────────────
    asistAlumnos.forEach((al, rowIdx) => {
      let totalP = 0, totalF = 0, totalT = 0, totalJ = 0
      const celdas = diasMes.map(d => {
        const fISO     = fechaISO(d)
        const esFuturo = fISO > todayISO2
        const sinClase = !esFuturo && !fechasConReg.has(fISO)
        const estado   = mapaM[al.id]?.[fISO] ?? (esFuturo || sinClase ? null : 'F')
        if (estado === 'P') totalP++
        else if (estado === 'F') totalF++
        else if (estado === 'T') totalT++
        else if (estado === 'J') totalJ++
        return estado
      })
      const totalDias = totalP + totalF + totalT + totalJ
      const pct = totalDias > 0 ? Math.round((totalP + totalT) / totalDias * 100) : null
      const rowBg = rowIdx % 2 === 0 ? CWH : CLT

      const rowData = [rowIdx + 1, `${al.apellidos ?? ''}, ${al.nombre}`.trim(),
        ...celdas.map(e => e ?? ''), totalP, totalF, totalT, totalJ,
        pct !== null ? `${pct}%` : '—',
      ]
      const row = ws.addRow(rowData)
      row.height = 18

      row.eachCell((cell: import('exceljs').Cell, col: number) => {
        const borderColor = 'FFE5E7EB'
        if (col === 1) {
          applyCell(cell, { bg:rowBg, fg:CGR, size:8.5, borderColor })
        } else if (col === 2) {
          applyCell(cell, { bg:rowBg, fg:CDK, bold:true, size:9, hAlign:'left', borderColor })
        } else if (col >= sumStart) {
          const offset = col - sumStart
          if (offset < 4) {
            const s = [SS.P, SS.F, SS.T, SS.J][offset]
            applyCell(cell, { bg:s.bg, fg:s.fg, bold:true, size:9, borderColor })
          } else {
            // % Asist.
            const v = pct
            const pbg = v === null ? rowBg : v >= 75 ? SS.P.bg : v >= 50 ? SS.T.bg : SS.F.bg
            const pfg = v === null ? CGR  : v >= 75 ? SS.P.fg : v >= 50 ? SS.T.fg : SS.F.fg
            applyCell(cell, { bg:pbg, fg:pfg, bold:true, size:9, borderColor })
          }
        } else {
          // Celda de día
          const dayIdx = col - 3
          const estado = celdas[dayIdx] ?? null
          if (estado && SS[estado]) {
            applyCell(cell, { bg:SS[estado].bg, fg:SS[estado].fg, bold:true, size:9, borderColor })
          } else {
            applyCell(cell, { bg:rowBg, fg:'FFCBD5E1', size:9, borderColor })
          }
        }
      })
    })

    // ── Leyenda ──────────────────────────────────────────────────────────────
    ws.addRow([])
    const rLeg = ws.addRow(['Leyenda:  P = Presente  ·  F = Falta  ·  T = Tardanza  ·  J = Justificado  ·  % Asist. = (P + T) ÷ total días'])
    ws.mergeCells(rLeg.number, 1, rLeg.number, totalCols)
    applyCell(rLeg.getCell(1), { fg:CGR, italic:true, size:8.5, hAlign:'left' })

    // ── Descargar ────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const safe = `asistencia-${asistGrado}-${asistGrupo}-${MESES_SAFE[month]}-${year}`
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase().replace(/-+/g, '-')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${safe}.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setImprimiendoAsist(false)
  }

  async function handleScanAdmin(qrToken: string) {
    if (scanAdminProcesando) return
    setScanAdminProcesando(true)
    const { data, error } = await supabase.rpc('registrar_asistencia_alumno_auto', {
      p_qr_token: qrToken,
    })
    setScanAdminProcesando(false)
    type ScanR = AdminScanResult
    let r: ScanR
    if (error || data?.error) {
      r = { alumno_id: '', nombre: '', grado: '', grupo: '', tipo: 'error', mensaje: data?.error ?? 'Error al registrar' }
    } else if (data?.tipo === 'salida_ok') {
      r = { alumno_id: data.alumno_id, nombre: data.nombre, grado: data.grado ?? '', grupo: data.grupo ?? '', tipo: 'salida_ok', mensaje: data.mensaje ?? 'Salida registrada ✓', hora_entrada: data.hora_entrada, hora_salida: data.hora_salida }
      setScanAdminList(prev => prev.some(s => s.alumno_id === data.alumno_id)
        ? prev.map(s => s.alumno_id === data.alumno_id ? r : s)
        : [r, ...prev])
    } else if (data?.tipo === 'completo' || data?.tipo === 'repetido') {
      r = { alumno_id: data.alumno_id, nombre: data.nombre, grado: data.grado ?? '', grupo: data.grupo ?? '', tipo: 'completo', mensaje: data.mensaje ?? 'Entrada y salida ya registradas', hora_entrada: data.hora_entrada, hora_salida: data.hora_salida }
      setScanAdminList(prev => prev.some(s => s.alumno_id === data.alumno_id) ? prev.map(s => s.alumno_id === data.alumno_id ? r : s) : [r, ...prev])
    } else {
      r = { alumno_id: data.alumno_id, nombre: data.nombre, grado: data.grado ?? '', grupo: data.grupo ?? '', tipo: 'ok', mensaje: data.mensaje ?? 'Entrada registrada ✓', hora_entrada: data.hora_entrada }
      setScanAdminList(prev => [r, ...prev])
    }
    setScanAdminResult(r)
    // Feedback háptico: pulso al registrar, patrón distinto si ya estaba o error.
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(r.tipo === 'ok' || r.tipo === 'salida_ok' ? 90 : r.tipo === 'completo' ? [30, 40, 30] : 220)
    }
    if (scanAdminTimeoutRef.current) clearTimeout(scanAdminTimeoutRef.current)
    scanAdminTimeoutRef.current = setTimeout(() => setScanAdminResult(null), r.tipo === 'error' ? 2600 : 1600)
  }

  async function guardarScanCfg() {
    if (!scanCfgHora) return
    setScanCfgGuardando(true)
    const { data, error } = await supabase.rpc('set_asistencia_alumnos_config', { p_hora_entrada: scanCfgHora })
    setScanCfgGuardando(false)
    if (error || (data as { error?: string })?.error) {
      alert((data as { error?: string })?.error ?? 'Error al guardar la hora de entrada.')
      return
    }
    setScanCfg(prev => prev
      ? { ...prev, hora_entrada: scanCfgHora }
      : { hora_entrada: scanCfgHora, tolerancia_min: 10, salida_tras_horas: 3 })
    setScanCfgOk(true)
    setTimeout(() => setScanCfgOk(false), 1800)
  }

  async function cargarSalones() {
    const cicloIdSal = (await getCicloActivo())?.id ?? null
    let aQ = supabase.from('asignaciones').select('grado,grupo')
    if (cicloIdSal) aQ = aQ.eq('ciclo_id', cicloIdSal)
    const [{ data: sData }, { data: aData }] = await Promise.all([
      supabase.from('salones').select('grado,grupo,nombre'),
      aQ,
    ])
    const map: Record<string, string> = {}
    ;(sData ?? []).forEach((s: { grado: string; grupo: string; nombre: string | null }) => {
      map[`${s.grado}-${s.grupo}`] = s.nombre ?? ''
    })
    setSalones(map)
    // Combos únicos ordenados por grado (según GRADOS) luego grupo
    const seen = new Set<string>()
    const combos: { grado: string; grupo: string }[] = []
    ;(aData ?? [] as { grado: string; grupo: string }[]).forEach((a: { grado: string; grupo: string }) => {
      const k = `${a.grado}-${a.grupo}`
      if (!seen.has(k)) { seen.add(k); combos.push({ grado: a.grado, grupo: a.grupo }) }
    })
    combos.sort((a, b) => {
      const gi = GRADOS.indexOf(a.grado) - GRADOS.indexOf(b.grado)
      return gi !== 0 ? gi : a.grupo.localeCompare(b.grupo)
    })
    setCombosActivos(combos)
  }

  async function guardarSalon(grado: string, grupo: string, nombre: string) {
    setSalonSaving(true)
    await supabase.from('salones').upsert({ grado, grupo, nombre: nombre.trim() || null }, { onConflict: 'grado,grupo' })
    setSalones(prev => ({ ...prev, [`${grado}-${grupo}`]: nombre.trim() }))
    setSalonSaving(false)
    setSalonEditKey(null)
  }

  // ── Ciclos handlers ───────────────────────────────────────────────────────
  // Solo ciclos lectivos: los bimestres de Planificación viven en la misma
  // tabla (tipo='bimestre') pero no se matriculan ni se activan desde aquí.
  async function cargarCiclos() {
    setLoadingCiclos(true)
    const { data } = await supabase.from('ciclos').select('*')
      .eq('tipo', 'lectivo')
      .order('anio', { ascending: false }).order('periodo', { ascending: false })
    const lectivos = (data as Ciclo[]) ?? []
    setCiclos(lectivos)
    // Sugerir en el formulario el próximo año que aún no existe (evita el
    // "ya existe": p.ej. con 2026-1 activo y 2027-1 ya creado, propone 2028).
    const activo = lectivos.find(c => c.activo)
    let anioSug = (activo?.anio ?? new Date().getFullYear()) + 1
    while (lectivos.some(c => c.anio === anioSug && c.periodo === 1)) anioSug++
    setCicloForm(p => ({ ...p, anio: anioSug, periodo: 1 }))
    setLoadingCiclos(false)
  }

  // ── Guía del Año Escolar: estado real de cada paso del cambio de ciclo ────
  // (mismo orden que docs/cambio-de-ciclo.md). "Nuevo" = el ciclo lectivo más
  // reciente que aún no se activa; si no existe, la guía pide crearlo.
  async function cargarGuiaAnio() {
    setLoadingGuiaAnio(true)
    const { data: cicl } = await supabase.from('ciclos').select('*')
      .eq('tipo', 'lectivo')
      .order('anio', { ascending: false }).order('periodo', { ascending: false })
    const lectivos = (cicl as Ciclo[]) ?? []
    const activo = lectivos.find(c => c.activo) ?? null
    const nuevo = lectivos.find(c => !c.activo &&
      (!activo || c.anio > activo.anio || (c.anio === activo.anio && c.periodo > activo.periodo))) ?? null

    let asigTotal = 0, asigSinDocente = 0, matriculas = 0, bimestres = 0, planes = 0
    if (nuevo) {
      const [a1, a2, m1, b1, p1] = await Promise.all([
        supabase.from('asignaciones').select('id', { count: 'exact', head: true }).eq('ciclo_id', nuevo.id),
        supabase.from('asignaciones').select('id', { count: 'exact', head: true }).eq('ciclo_id', nuevo.id).is('docente_id', null),
        supabase.from('matriculas').select('id', { count: 'exact', head: true }).eq('ciclo_id', nuevo.id),
        supabase.from('ciclos').select('id', { count: 'exact', head: true }).eq('tipo', 'bimestre').eq('anio', nuevo.anio),
        supabase.from('planes_anuales').select('id', { count: 'exact', head: true }).eq('anio', nuevo.anio),
      ])
      asigTotal      = a1.count ?? 0
      asigSinDocente = a2.count ?? 0
      matriculas     = m1.count ?? 0
      bimestres      = b1.count ?? 0
      planes         = p1.count ?? 0
    }
    setGuiaAnio({ activo, nuevo, asigTotal, asigSinDocente, matriculas, bimestres, planes })
    setLoadingGuiaAnio(false)
  }

  async function crearCiclo() {
    const nombre = `${cicloForm.anio}-${cicloForm.periodo}`
    setCreandoCiclo(true); setCicloMsg('')
    const { error } = await supabase.from('ciclos').insert({
      nombre, anio: cicloForm.anio, periodo: cicloForm.periodo, activo: false,
      tipo: 'lectivo',
      fecha_inicio: cicloForm.fecha_inicio || null,
      fecha_fin:    cicloForm.fecha_fin    || null,
    })
    if (error) {
      setCicloMsg('Error: ' + (error.message.includes('unique') || error.message.includes('duplicate')
        ? `El ciclo ${nombre} ya existe: no hace falta crearlo de nuevo. Búscalo en el historial (a la derecha) o, si quieres preparar el año siguiente, cambia el año del formulario.`
        : error.message))
    }
    else { setCicloMsg(`Ciclo ${nombre} creado.`); await cargarCiclos() }
    setCreandoCiclo(false)
  }

  // Activación vía RPC: desactiva el resto, activa este y sincroniza el
  // grado/grupo de los alumnos con su matrícula del ciclo (promoción en un paso).
  async function activarCiclo(id: string) {
    const nombre = ciclos.find(c => c.id === id)?.nombre ?? ''
    if (!(await confirmar({
      titulo: `¿Activar el ciclo ${nombre}?`,
      mensaje: (
        <>
          Todo el sistema pasará a trabajar con este ciclo: los estudiantes tomarán el
          salón de su matrícula en {nombre || 'este ciclo'} y <b>quien no tenga
          matrícula quedará sin salón</b> (sin borrarse). Asegúrate de haber
          matriculado antes de activar.
        </>
      ),
      tono: 'advertencia', confirmarLabel: `Activar ${nombre}`,
    }))) return
    setActivandoCicloId(id)
    const { data, error } = await supabase.rpc('activar_ciclo', { p_ciclo_id: id })
    invalidarCicloActivo()
    const res = data as { ok?: boolean; error?: string; ciclo?: string; alumnos_sincronizados?: number; alumnos_sin_matricula?: number } | null
    if (error || res?.error) {
      setCicloMsg('Error al activar: ' + (error?.message ?? res?.error))
    } else {
      const partes = [`Ciclo ${res?.ciclo} activado.`]
      if (res?.alumnos_sincronizados) partes.push(`${res.alumnos_sincronizados} estudiantes actualizados de salón.`)
      if (res?.alumnos_sin_matricula) partes.push(`${res.alumnos_sin_matricula} estudiantes quedaron sin salón por no tener matrícula en este ciclo.`)
      setCicloMsg(partes.join(' '))
    }
    await cargarCiclos()
    setActivandoCicloId(null)
  }

  async function clonarCiclo(origenId: string, destinoId: string) {
    const origen  = ciclos.find(c => c.id === origenId)?.nombre ?? 'origen'
    const destino = ciclos.find(c => c.id === destinoId)?.nombre ?? 'destino'
    if (!(await confirmar({
      titulo: `¿Clonar los cursos de ${origen} hacia ${destino}?`,
      mensaje: 'Se copiarán las combinaciones curso/grado/sección (sin docente asignado). Si repites la clonación se pueden duplicar.',
      tono: 'primario', confirmarLabel: 'Clonar cursos',
    }))) return
    setClonarLoading(true); setCicloMsg('')
    const { data: asigs } = await supabase
      .from('asignaciones')
      .select('curso_id,grado,grupo')
      .eq('ciclo_id', origenId)
    if (!asigs || asigs.length === 0) {
      // fallback: clonar todas las asignaciones del ciclo origen por anio
      const origen = ciclos.find(c => c.id === origenId)
      if (origen) {
        const { data: byAnio } = await supabase
          .from('asignaciones')
          .select('curso_id,grado,grupo')
          .eq('anio', origen.anio)
        const rows = [...new Map((byAnio ?? []).map(r => [`${r.curso_id}-${r.grado}-${r.grupo}`, r])).values()]
        if (rows.length) {
          const inserts = rows.map(r => ({ curso_id: r.curso_id, grado: r.grado, grupo: r.grupo, ciclo_id: destinoId, anio: ciclos.find(c=>c.id===destinoId)?.anio ?? new Date().getFullYear() }))
          const { error } = await supabase.from('asignaciones').insert(inserts)
          if (error) { setCicloMsg('Error al clonar: ' + error.message) } else { setCicloMsg(`${inserts.length} cursos clonados (sin docente asignado).`) }
        } else { setCicloMsg('No se encontraron cursos en el ciclo origen.') }
      }
    } else {
      const destino = ciclos.find(c => c.id === destinoId)
      const unique = [...new Map(asigs.map(r => [`${r.curso_id}-${r.grado}-${r.grupo}`, r])).values()]
      const inserts = unique.map(r => ({ curso_id: r.curso_id, grado: r.grado, grupo: r.grupo, ciclo_id: destinoId, anio: destino?.anio ?? new Date().getFullYear() }))
      const { error } = await supabase.from('asignaciones').insert(inserts)
      if (error) { setCicloMsg('Error al clonar: ' + error.message) } else { setCicloMsg(`${inserts.length} cursos clonados (sin docente asignado).`) }
    }
    setClonarLoading(false)
  }

  // ── Matrícula handlers ────────────────────────────────────────────────────
  async function matricularDirecto(a: Alumno) {
    if (!a.grado || !a.grupo) return
    const cicloActivo = ciclos.find(c => c.activo)
    if (!cicloActivo) { alert('No hay ciclo activo. Activa un ciclo primero.'); return }
    setMatriculandoId(a.id)
    const { error } = await supabase.from('matriculas').insert({
      alumno_id: a.id, ciclo_id: cicloActivo.id, grado: a.grado, grupo: a.grupo,
    })
    setMatriculandoId(null)
    if (error && !error.message.includes('unique')) {
      alert('Error al matricular: ' + error.message)
    } else {
      setMatriculandoOkId(a.id)
      setTimeout(() => setMatriculandoOkId(null), 2500)
    }
  }

  async function cargarAuditLog() {
    setLoadingAudit(true)
    const { data } = await supabase
      .from('audit_log')
      .select('id,admin_nombre,accion,docente_nombre,fecha_hora_original,fecha_hora_nueva,justificacion,created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    setAuditLog((data as AuditEntry[]) ?? [])
    setLoadingAudit(false)
  }

  async function cargarJustificaciones() {
    setLoadingJustif(true)
    const { data } = await supabase
      .from('justificaciones')
      .select('id,fecha,motivo,estado,respuesta,created_at,docentes(nombre,email)')
      .order('created_at', { ascending: false })
    setJustificaciones((data as unknown as Justificacion[]) ?? [])
    setLoadingJustif(false)
  }

  async function marcarVisto(id: string) {
    setMarcandoVistoId(id)
    await supabase.from('justificaciones').update({ estado: 'visto' }).eq('id', id)
    setJustificaciones(prev => prev.map(j => j.id === id ? { ...j, estado: 'visto' } : j))
    setMarcandoVistoId(null)
  }

  function abrirJustificar(j: Justificacion) {
    setJustifModal(j)
    setJustifRespuesta('')
    setJustifModalError('')
  }

  // Aprueba la justificación y marca las asistencias de ese día como
  // justificadas (RPC SECURITY DEFINER: también cubre a administrativos
  // con módulo justificaciones pero sin escritura sobre asistencias).
  async function justificarAsistencia() {
    if (!justifModal) return
    setJustificando(true)
    setJustifModalError('')
    const respuesta = justifRespuesta.trim() || null
    const { error } = await supabase.rpc('justificar_asistencia', {
      p_justificacion_id: justifModal.id,
      p_respuesta:        respuesta,
    })
    setJustificando(false)
    if (error) {
      setJustifModalError('No se pudo justificar. Verifica que la migración esté aplicada y que tengas permisos.')
      return
    }
    setJustificaciones(prev => prev.map(j =>
      j.id === justifModal.id ? { ...j, estado: 'justificado', respuesta } : j))
    setJustifModal(null)
    setJustifRespuesta('')
  }

  async function cargarHorasDocente() {
    setLoadingHorasTab(true)
    const cicloIdHd = (await getCicloActivo())?.id ?? null
    let asigsQ = supabase.from('asignaciones').select('docente_id,cursos(nombre)')
    if (cicloIdHd) asigsQ = asigsQ.eq('ciclo_id', cicloIdHd)
    const [{ data: docs }, { data: hs }, { data: asigs }] = await Promise.all([
      supabase.from('docentes').select('id,nombre,email').order('nombre'),
      supabase.from('horarios').select('docente_id,dia,hora_inicio,hora_fin,materia,grado,grupo').eq('activo', true),
      asigsQ,
    ])
    const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes']
    function minutosEntre(ini: string, fin: string) {
      const [hI, mI] = ini.split(':').map(Number)
      const [hF, mF] = fin.split(':').map(Number)
      return Math.max(0, (hF * 60 + mF) - (hI * 60 + mI))
    }
    const filas: DocenteHorasFila[] = (docs ?? []).map(d => {
      const clases = (hs ?? []).filter(h => h.docente_id === d.id)
      const horasPorDia: Record<string, number> = {}
      DIAS.forEach(dia => {
        const mins = clases.filter(h => h.dia === dia).reduce((s, h) => s + minutosEntre(h.hora_inicio, h.hora_fin), 0)
        horasPorDia[dia] = Math.round((mins / 60) * 10) / 10
      })
      const totalHoras = Math.round(Object.values(horasPorDia).reduce((s, v) => s + v, 0) * 10) / 10
      const cursosUnicos = [...new Set(
        (asigs ?? []).filter(a => a.docente_id === d.id).map(a => (a.cursos as unknown as { nombre: string } | null)?.nombre ?? '').filter(Boolean)
      )]
      return { id: d.id, nombre: d.nombre, email: d.email, totalHoras, horasPorDia, cursos: cursosUnicos, totalClases: clases.length }
    })
    setHorasFilas(filas)
    setLoadingHorasTab(false)
  }

  async function descargarExcelHoras(filas: DocenteHorasFila[]) {
    const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes']
    const data = filas.map(f => ({
      'Docente':           f.nombre,
      'Email':             f.email,
      'Cursos asignados':  f.cursos.join(', ') || '—',
      'Clases/semana':     f.totalClases,
      'Lunes (h)':         f.horasPorDia['Lunes']     ?? 0,
      'Martes (h)':        f.horasPorDia['Martes']    ?? 0,
      'Miércoles (h)':     f.horasPorDia['Miércoles'] ?? 0,
      'Jueves (h)':        f.horasPorDia['Jueves']    ?? 0,
      'Viernes (h)':       f.horasPorDia['Viernes']   ?? 0,
      'Total horas/sem':   f.totalHoras,
    }))
    await descargarJSON(
      `horas-docentes-${new Date().toISOString().slice(0,10)}.xlsx`,
      'Horas Docentes',
      data,
      [28, 30, 36, 14, ...DIAS.map(() => 14), 16],
    )
  }

  // Personal unificado para las descargas: admins + administrativos + docentes,
  // SIN duplicados y en orden jerárquico (Administrador → Administrativo → Docente).
  // Si una persona figura en más de una tabla (p. ej. quedó en administrativos al
  // pasar a admin), se conserva solo su rol de mayor jerarquía. Clave de dedup:
  // usuario → dni → nombre+apellido.
  async function cargarPersonalUnificado() {
    const sel = 'nombre,apellido,dni,correo,celular,cumpleanos,usuario'
    type Base = { nombre: string; apellido: string | null; dni: string | null; correo: string | null; celular: string | null; cumpleanos: string | null; usuario: string | null }
    const [{ data: adm }, { data: adv }, { data: doc }] = await Promise.all([
      supabase.from('user_admin').select(sel).order('nombre'),
      supabase.from('administrativos').select(sel).order('nombre'),
      supabase.from('docentes').select(sel).order('apellido').order('nombre'),
    ])
    const grupos: { rows: Base[]; tipo: string }[] = [
      { rows: (adm ?? []) as unknown as Base[], tipo: 'Director' },
      { rows: (adv ?? []) as unknown as Base[], tipo: 'Administrativo' },
      { rows: (doc ?? []) as unknown as Base[], tipo: 'Docente' },
    ]
    const vistos = new Set<string>()
    const out: (Base & { tipo: string })[] = []
    for (const g of grupos) {
      for (const r of g.rows) {
        const key = r.usuario?.trim().toLowerCase() || r.dni?.trim() || `${(r.nombre ?? '').trim().toLowerCase()}|${(r.apellido ?? '').trim().toLowerCase()}`
        if (vistos.has(key)) continue
        vistos.add(key)
        out.push({ ...r, tipo: g.tipo })
      }
    }
    return out
  }

  async function descargarExcelDocentes(filtro: 'todo' | 'docentes', campos: string[]) {
    setDescargandoDocentes(true)
    try {
      type PersonalRow = { nombre: string; apellido: string | null; dni: string | null; correo: string | null; celular: string | null; cumpleanos: string | null; usuario: string | null; tipo: string }

      const sel = 'nombre,apellido,dni,correo,celular,cumpleanos,usuario'
      let lista: PersonalRow[] = []
      type PersonalBase = Omit<PersonalRow, 'tipo'>
      if (filtro === 'todo') {
        lista = await cargarPersonalUnificado()
      } else {
        const { data } = await supabase.from('docentes').select(sel).order('apellido').order('nombre')
        lista = ((data ?? []) as unknown as PersonalBase[]).map(r => ({ ...r, tipo: 'Docente' }))
      }

      const C_WINE     = 'FF6B1A1A'
      const C_WINE_MED = 'FF7F1D1D'
      const C_WINE_HDR = 'FF991B1B'
      const C_GOLD     = 'FFC9A84C'
      const C_GOLD_LT  = 'FFFDF3DC'
      const C_GRAY     = 'FF6B7280'
      const C_GRAY_LT  = 'FFF3F4F6'
      const C_WHITE    = 'FFFFFFFF'
      const C_TEXT     = 'FF1C1C1C'

      type ColDef = { key: string; label: string; width: number; always?: boolean; campo?: string; getVal: (d: PersonalRow, i: number) => string | number }
      const showTipo = filtro === 'todo' && campos.includes('tipo')
      const allColDefs: ColDef[] = [
        { key: 'n',          label: '#',          width: 6,  always: true,             getVal: (_d, i) => i + 1 },
        { key: 'apellido',   label: 'Apellido',   width: 22, campo: 'apellido_nombre', getVal: (d)     => d.apellido ?? '' },
        { key: 'nombre',     label: 'Nombre',     width: 20, campo: 'apellido_nombre', getVal: (d)     => d.nombre ?? '' },
        { key: 'tipo',       label: 'Tipo',       width: 14, campo: 'tipo',            getVal: (d)     => d.tipo },
        { key: 'dni',        label: 'DNI',        width: 13, campo: 'dni',             getVal: (d)     => d.dni ?? '' },
        { key: 'correo',     label: 'Correo',     width: 30, campo: 'correo',          getVal: (d)     => d.correo ?? '' },
        { key: 'celular',    label: 'Celular',    width: 16, campo: 'celular',         getVal: (d)     => d.celular ?? '' },
        { key: 'cumpleanos', label: 'Cumpleaños', width: 14, campo: 'cumpleanos',      getVal: (d)     => d.cumpleanos ?? '' },
        { key: 'usuario',    label: 'Usuario',    width: 20, campo: 'usuario',         getVal: (d)     => d.usuario ?? '' },
      ]
      const COLS = allColDefs.filter(c => c.always || (c.campo === 'tipo' ? showTipo : campos.includes(c.campo ?? '')))
      const numCols = COLS.length

      function colLetter(n: number): string {
        let s = ''
        while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
        return s
      }
      const lastCol = colLetter(numCols)

      function fillRow(ws: import('exceljs').Worksheet, row: number, color: string) {
        for (let c = 1; c <= numCols; c++) {
          ws.getRow(row).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
        }
      }

      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Sistema ACEG'
      wb.created = new Date()

      const tituloNomina = filtro === 'todo' ? 'Nómina del Personal' : 'Nómina de Docentes'
      const ws = wb.addWorksheet(filtro === 'todo' ? 'Personal' : 'Docentes', {
        pageSetup: { fitToPage: true, orientation: 'landscape', margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } },
        views: [{ state: 'frozen', ySplit: 8 }],
      })

      COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })

      let logoId: number | null = null
      try {
        const res = await fetch('/aceg-isotipo.png')
        if (res.ok) { const buf = await res.arrayBuffer(); logoId = wb.addImage({ buffer: buf, extension: 'png' }) }
      } catch { /* sin logo */ }

      ws.getRow(1).height = 42; ws.getRow(2).height = 24
      ws.mergeCells('A1:A2')
      const logoCell = ws.getCell('A1')
      logoCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WHITE } }
      logoCell.alignment = { vertical: 'middle', horizontal: 'center' }
      logoCell.border    = { right: { style: 'medium', color: { argb: C_GOLD } } }
      if (numCols > 1) {
        ws.mergeCells(`B1:${lastCol}1`)
        const r1 = ws.getCell('B1')
        r1.value = 'ESCUELA GASTRONÓMICA  ·  ACEG'
        r1.font  = { bold: true, size: 14, color: { argb: C_WHITE }, name: 'Calibri' }
        r1.alignment = { vertical: 'bottom', horizontal: 'center' }
        r1.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WINE } }
        ws.mergeCells(`B2:${lastCol}2`)
        const r2 = ws.getCell('B2')
        r2.value = 'Juliaca  ·  Puno  ·  Perú'
        r2.font  = { bold: false, size: 11, color: { argb: C_GOLD }, name: 'Calibri', italic: true }
        r2.alignment = { vertical: 'top', horizontal: 'center' }
        r2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WINE_MED } }
      }
      if (logoId !== null) ws.addImage(logoId, { tl: { col: 0.08, row: 0.08 }, ext: { width: 74, height: 74 } })

      ws.getRow(3).height = 7; fillRow(ws, 3, C_GOLD)
      ws.getRow(4).height = 8; fillRow(ws, 4, C_WHITE)

      ws.getRow(5).height = 28
      ws.mergeCells(`A5:${lastCol}5`)
      const r5 = ws.getCell('A5')
      r5.value = tituloNomina
      r5.font  = { bold: true, size: 12, color: { argb: C_WINE }, name: 'Calibri' }
      r5.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }
      r5.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WHITE } }
      r5.border = { left: { style: 'thick', color: { argb: C_GOLD } } }

      ws.getRow(6).height = 18
      ws.mergeCells(`A6:${lastCol}6`)
      const fechaGen = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
      const r6 = ws.getCell('A6')
      r6.value = `Total: ${lista.length} ${filtro === 'todo' ? 'persona(s)' : 'docente(s)'}     ·     Generado el ${fechaGen}`
      r6.font  = { size: 9, color: { argb: C_GRAY }, name: 'Calibri' }
      r6.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }
      r6.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LT } }
      r6.border = { left: { style: 'thick', color: { argb: C_GOLD } } }

      ws.getRow(7).height = 6; fillRow(ws, 7, C_WHITE)

      ws.getRow(8).height = 26
      COLS.forEach((c, i) => {
        const cell = ws.getRow(8).getCell(i + 1)
        cell.value = c.label.toUpperCase()
        cell.font  = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' }
        cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left', indent: i === 0 ? 0 : 1 }
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WINE_HDR } }
        cell.border = {
          top:    { style: 'thin',   color: { argb: C_GOLD } },
          bottom: { style: 'medium', color: { argb: C_GOLD } },
          right:  i < COLS.length - 1 ? { style: 'hair', color: { argb: C_WINE } } : undefined,
        }
      })

      lista.forEach((d, idx) => {
        const rowNum = 9 + idx
        const bg     = idx % 2 === 1 ? C_GOLD_LT : C_WHITE
        ws.getRow(rowNum).height = 18
        const valores = COLS.map(c => c.getVal(d, idx))
        valores.forEach((val, i) => {
          const cell = ws.getRow(rowNum).getCell(i + 1)
          cell.value = val
          cell.font  = { size: 10, color: { argb: C_TEXT }, name: 'Calibri', bold: i === 0 }
          cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left', indent: i === 0 ? 0 : 1 }
          cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          cell.border = {
            bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
            right:  i < valores.length - 1 ? { style: 'hair', color: { argb: 'FFE5E7EB' } } : undefined,
          }
        })
      })

      const totalRow = 9 + lista.length
      ws.getRow(totalRow).height = 20
      ws.mergeCells(`A${totalRow}:${lastCol}${totalRow}`)
      const totalCell = ws.getCell(`A${totalRow}`)
      totalCell.value = `TOTAL: ${lista.length} ${filtro === 'todo' ? 'persona(s)' : `docente${lista.length !== 1 ? 's' : ''}`}`
      totalCell.font  = { bold: true, size: 10, color: { argb: C_WINE }, name: 'Calibri' }
      totalCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 2 }
      totalCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GOLD_LT } }
      totalCell.border = { top: { style: 'medium', color: { argb: C_GOLD } }, bottom: { style: 'thin', color: { argb: C_GOLD } } }

      const footerRow = 9 + lista.length + 1
      ws.getRow(footerRow).height = 16
      ws.mergeCells(`A${footerRow}:${lastCol}${footerRow}`)
      const footer = ws.getCell(`A${footerRow}`)
      footer.value = `© ${new Date().getFullYear()} Escuela Gastronómica ACEG — Arte Culinario, Emprendimiento y Gestión`
      footer.font  = { size: 8, color: { argb: C_GRAY }, italic: true, name: 'Calibri' }
      footer.alignment = { vertical: 'middle', horizontal: 'center' }
      footer.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LT } }
      footer.border = { top: { style: 'thin', color: { argb: C_GOLD } } }

      const buffer = await wb.xlsx.writeBuffer()
      const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url    = URL.createObjectURL(blob)
      const link   = document.createElement('a')
      link.href     = url
      link.download = `${filtro === 'todo' ? 'personal' : 'docentes'}-${new Date().toISOString().slice(0, 10)}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setDescargandoDocentes(false)
    }
  }

  async function descargarImagenDocentes(filtro: 'todo' | 'docentes', campos: string[]) {
    setDescargandoImagenDoc(true)
    try {
      type PersonalRow = { nombre: string; apellido: string | null; dni: string | null; correo: string | null; celular: string | null; cumpleanos: string | null; usuario: string | null; tipo: string }

      const sel = 'nombre,apellido,dni,correo,celular,cumpleanos,usuario'
      let lista: PersonalRow[] = []
      type PersonalBase = Omit<PersonalRow, 'tipo'>
      if (filtro === 'todo') {
        lista = await cargarPersonalUnificado()
      } else {
        const { data } = await supabase.from('docentes').select(sel).order('apellido').order('nombre')
        lista = ((data ?? []) as unknown as PersonalBase[]).map(r => ({ ...r, tipo: 'Docente' }))
      }

      const WINE  = '#6B1A1A'; const WINE2 = '#991B1B'
      const GOLD  = '#C9A84C'; const GOLD2 = '#FDF3DC'
      const WHITE = '#FFFFFF'; const DARK  = '#1C1C1C'
      const GRAY  = '#64748B'

      const W      = 980
      const MARGIN = 20
      const TW     = W - MARGIN * 2
      const ATT_H  = 120
      const TITLE_H = 55
      const HDR_H  = 34
      const ROW_H  = 27
      const SUM_H  = 30
      const FOOT_H = 52
      const H = ATT_H + TITLE_H + HDR_H + lista.length * ROW_H + SUM_H + FOOT_H

      const canvas = document.createElement('canvas')
      canvas.width = W * 2; canvas.height = H * 2
      const ctx = canvas.getContext('2d')!
      ctx.scale(2, 2)

      ctx.fillStyle = WHITE; ctx.fillRect(0, 0, W, H)

      ctx.fillStyle = WINE;  ctx.fillRect(0, 0,   W, 100)
      ctx.fillStyle = GOLD;  ctx.fillRect(0, 100, W, 3)
      ctx.fillStyle = GOLD2; ctx.fillRect(0, 103, W, ATT_H - 103)

      const lbS = 62, lbX = MARGIN, lbY = 19
      ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2
      ctx.fillStyle = WHITE
      ctx.beginPath(); ctx.roundRect(lbX, lbY, lbS, lbS, 8); ctx.fill()
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(lbX, lbY, lbS, lbS, 8); ctx.stroke()

      await new Promise<void>(resolve => {
        const img = document.createElement('img'); img.crossOrigin = 'anonymous'
        img.onload = () => { ctx.drawImage(img, lbX + 7, lbY + 7, lbS - 14, lbS - 14); resolve() }
        img.onerror = () => resolve()
        img.src = '/aceg-isotipo.png'
      })

      const tx = MARGIN + lbS + 14
      ctx.textAlign = 'left'
      ctx.fillStyle = '#FDF3DC'; ctx.font = 'bold 9px system-ui, sans-serif'
      ctx.fillText('ESCUELA GASTRONÓMICA', tx, 44)
      ctx.fillStyle = WHITE; ctx.font = 'bold 16px system-ui, sans-serif'
      ctx.fillText('ACEG', tx, 62)
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '500 9px system-ui, sans-serif'
      ctx.fillText('Juliaca · Puno · Perú', tx, 79)

      const titY = ATT_H + 10
      const tituloNomina = filtro === 'todo' ? 'NÓMINA DEL PERSONAL' : 'NÓMINA DE DOCENTES'
      ctx.fillStyle = WINE; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(tituloNomina, W / 2, titY + 16)
      ctx.fillStyle = GRAY; ctx.font = '500 9.5px system-ui, sans-serif'
      const fechaGen = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
      ctx.fillText(`${lista.length} ${filtro === 'todo' ? 'personas' : 'docentes'}  ·  Generado el ${fechaGen}`, W / 2, titY + 34)

      type ImgColDef = { key: string; label: string; baseW: number; align: CanvasTextAlign; campo?: string; always?: boolean; getVal: (d: PersonalRow, i: number) => string }
      const showTipo = filtro === 'todo' && campos.includes('tipo')
      const allImgCols: ImgColDef[] = [
        { key: 'n',              label: '#',               baseW: 30,  align: 'center', always: true,             getVal: (_, i) => String(i + 1) },
        { key: 'apellido_nombre',label: 'Apellidos y Nombre', baseW: 260, align: 'left', campo: 'apellido_nombre', getVal: (d)    => `${d.apellido ?? ''} ${d.nombre}`.trim() },
        { key: 'tipo',           label: 'Tipo',            baseW: 80,  align: 'center', campo: 'tipo',            getVal: (d)    => d.tipo },
        { key: 'dni',            label: 'DNI',             baseW: 80,  align: 'center', campo: 'dni',             getVal: (d)    => d.dni ?? '—' },
        { key: 'correo',         label: 'Correo',          baseW: 200, align: 'left',   campo: 'correo',          getVal: (d)    => d.correo ?? '—' },
        { key: 'celular',        label: 'Celular',         baseW: 90,  align: 'center', campo: 'celular',         getVal: (d)    => d.celular ?? '—' },
        { key: 'cumpleanos',     label: 'Cumpleaños',      baseW: 110, align: 'center', campo: 'cumpleanos',      getVal: (d)    => d.cumpleanos ?? '—' },
        { key: 'usuario',        label: 'Usuario',         baseW: 120, align: 'left',   campo: 'usuario',         getVal: (d)    => d.usuario ?? '—' },
      ]
      const selectedCols = allImgCols.filter(c => c.always || (c.campo === 'tipo' ? showTipo : campos.includes(c.campo ?? '')))
      const totalBase = selectedCols.reduce((s, c) => s + c.baseW, 0)
      const scaleW = TW / totalBase
      let xCursor = MARGIN
      type Col = ImgColDef & { x: number; w: number }
      const COLS: Col[] = selectedCols.map(c => {
        const w = Math.round(c.baseW * scaleW)
        const col = { ...c, x: xCursor, w }
        xCursor += w
        return col
      })

      const tblY = ATT_H + TITLE_H

      ctx.fillStyle = WINE2
      ctx.beginPath(); ctx.roundRect(MARGIN, tblY, TW, HDR_H, [6, 6, 0, 0]); ctx.fill()
      COLS.forEach(c => {
        ctx.fillStyle = WHITE; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = c.align
        const hx = c.align === 'center' ? c.x + c.w / 2 : c.x + 6
        ctx.fillText(c.label.toUpperCase(), hx, tblY + HDR_H / 2 + 3)
      })
      let sepX = MARGIN
      COLS.slice(0, -1).forEach(c => {
        sepX += c.w
        ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(sepX, tblY); ctx.lineTo(sepX, tblY + HDR_H); ctx.stroke()
      })

      lista.forEach((d, idx) => {
        const ry = tblY + HDR_H + idx * ROW_H
        ctx.fillStyle = idx % 2 === 0 ? WHITE : GOLD2
        ctx.fillRect(MARGIN, ry, TW, ROW_H)
        ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(MARGIN, ry + ROW_H); ctx.lineTo(MARGIN + TW, ry + ROW_H); ctx.stroke()

        COLS.forEach((c, ci) => {
          const val = c.getVal(d, idx)
          ctx.fillStyle = ci === 0 ? WINE2 : DARK
          ctx.font = `${ci === 0 ? 'bold' : '500'} 9.5px system-ui, sans-serif`
          ctx.textAlign = c.align
          const textX = c.align === 'center' ? c.x + c.w / 2 : c.x + 6
          const textY = ry + ROW_H / 2 + 3.5
          const maxW = c.w - (c.align === 'center' ? 4 : 14)
          let txt = val
          while (ctx.measureText(txt).width > maxW && txt.length > 1) txt = txt.slice(0, -1)
          if (txt.length < val.length) txt += '…'
          ctx.fillText(txt, textX, textY)
        })

        let vx = MARGIN
        COLS.slice(0, -1).forEach(c => {
          vx += c.w
          ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 0.4
          ctx.beginPath(); ctx.moveTo(vx, ry); ctx.lineTo(vx, ry + ROW_H); ctx.stroke()
        })
      })

      const tblBottom = tblY + HDR_H + lista.length * ROW_H
      ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1
      ctx.strokeRect(MARGIN, tblY, TW, HDR_H + lista.length * ROW_H)

      ctx.fillStyle = GOLD2
      ctx.beginPath(); ctx.roundRect(MARGIN, tblBottom, TW, SUM_H, [0, 0, 6, 6]); ctx.fill()
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(MARGIN, tblBottom, TW, SUM_H, [0, 0, 6, 6]); ctx.stroke()
      ctx.fillStyle = WINE; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'right'
      ctx.fillText(`Total: ${lista.length} ${filtro === 'todo' ? 'persona(s)' : `docente${lista.length !== 1 ? 's' : ''}`}`, W - MARGIN - 10, tblBottom + SUM_H / 2 + 4)

      const fY = tblBottom + SUM_H + 8
      ctx.fillStyle = GRAY; ctx.font = '400 8px system-ui, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`© ${new Date().getFullYear()} Escuela Gastronómica ACEG`, W / 2, fY + 10)
      ctx.fillText('Documento generado automáticamente · Solo para uso interno', W / 2, fY + 24)

      const gradBot = ctx.createLinearGradient(0, 0, W, 0)
      gradBot.addColorStop(0, GOLD); gradBot.addColorStop(1, '#F0C75A')
      ctx.fillStyle = gradBot; ctx.fillRect(0, H - 4, W, 4)

      const blob = await new Promise<Blob | null>(r => canvas.toBlob(b => r(b), 'image/png'))
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href = url; a.download = `${filtro === 'todo' ? 'personal' : 'docentes'}-${new Date().toISOString().slice(0, 10)}.png`
      a.click(); URL.revokeObjectURL(url)
    } finally {
      setDescargandoImagenDoc(false)
    }
  }

  async function subirPlantillaFormato(file: File) {
    if (!file.name.endsWith('.xlsx')) { alert('Solo se aceptan archivos .xlsx'); return }
    setSubiendoPlantilla(true)
    setPlantillaOk('')
    try {
      const base64: string = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload  = () => res((reader.result as string).split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      await Promise.all([
        supabase.from('config').upsert({ key: 'plantilla_formato01',       value: base64      }, { onConflict: 'key' }),
        supabase.from('config').upsert({ key: 'plantilla_formato01_nombre', value: file.name  }, { onConflict: 'key' }),
      ])
      setPlantillaNombre(file.name)
      setPlantillaOk('Plantilla guardada correctamente')
      setTimeout(() => setPlantillaOk(''), 3000)
    } finally {
      setSubiendoPlantilla(false)
    }
  }

  async function descargarFormatoOficial() {
    setDescargandoFormatoOficial(true)
    try {
      const [y, m] = mesFormatoOficial.split('-').map(Number)
      const ultimoDia = new Date(y, m, 0).getDate()
      const inicio = new Date(`${mesFormatoOficial}-01T00:00:00-05:00`).toISOString()
      const fin    = new Date(`${mesFormatoOficial}-${String(ultimoDia).padStart(2,'0')}T23:59:59.999-05:00`).toISOString()

      const [{ data: docentesData }, { data: asistData }, { data: horariosData }, { data: justifData }] = await Promise.all([
        supabase.from('docentes').select('id,nombre,apellido,dni,hora_entrada').order('apellido').order('nombre'),
        supabase.from('asistencias').select('docente_id,fecha_hora,tipo,justificada').gte('fecha_hora', inicio).lte('fecha_hora', fin).order('fecha_hora'),
        supabase.from('horarios').select('docente_id,dia,hora_inicio').eq('activo', true),
        supabase.from('justificaciones').select('docente_id,fecha').eq('estado', 'justificado')
          .gte('fecha', `${mesFormatoOficial}-01`).lte('fecha', `${mesFormatoOficial}-${String(ultimoDia).padStart(2,'0')}`),
      ])

      const docList = (docentesData ?? []) as { id:string; nombre:string; apellido:string|null; dni:string|null; hora_entrada:string|null }[]
      const asis    = (asistData   ?? []) as { docente_id:string; fecha_hora:string; tipo:string|null; justificada?:boolean }[]
      const hors    = (horariosData ?? []) as { docente_id:string; dia:string; hora_inicio:string }[]

      // Días justificados desde el panel (docente_id|díaDelMes) — cubre también
      // ausencias sin ninguna marca ese día.
      const justifSet = new Set<string>()
      for (const j of (justifData ?? []) as { docente_id:string; fecha:string }[])
        justifSet.add(`${j.docente_id}|${parseInt(j.fecha.slice(8, 10))}`)

      // Hora de entrada fija (docentes sin horario): referencia de puntualidad de respaldo.
      const horaEntradaFija = new Map<string,string>()
      for (const d of docList) if (d.hora_entrada) horaEntradaFija.set(d.id, String(d.hora_entrada).slice(0,5))

      const NOMBRES_DIA = ['','Lunes','Martes','Miércoles','Jueves','Viernes','',''] // índice por dow (0=dom)

      // Horario por docente → día de semana (nombre) → hora más temprana
      const horarioMap = new Map<string, Map<string,string>>()
      for (const h of hors) {
        if (!h.docente_id) continue
        if (!horarioMap.has(h.docente_id)) horarioMap.set(h.docente_id, new Map())
        const dm = horarioMap.get(h.docente_id)!
        const act = dm.get(h.dia)
        if (!act || h.hora_inicio < act) dm.set(h.dia, h.hora_inicio)
      }

      // Asistencias por docente_id → día del mes → { presente, entrada ISO }.
      // Presente = marcó algo ese día; entrada = 1ª marca con tipo 'entrada' (para
      // la tardanza). Una marca solo de 'salida' cuenta presente pero sin tardanza.
      const asisMap = new Map<string, Map<number, { presente: boolean; entrada: string | null; justificada: boolean }>>()
      for (const a of asis) {
        const dia = Number(new Date(a.fecha_hora).toLocaleDateString('en-US',{day:'numeric',timeZone:'America/Lima'}))
        if (!asisMap.has(a.docente_id)) asisMap.set(a.docente_id, new Map())
        const dm = asisMap.get(a.docente_id)!
        const rec = dm.get(dia) ?? { presente: false, entrada: null, justificada: false }
        rec.presente = true
        if (a.tipo === 'entrada' && !rec.entrada) rec.entrada = a.fecha_hora
        if (a.justificada) rec.justificada = true
        dm.set(dia, rec)
      }

      const diasInfo: { dia:number; dow:number }[] = []
      for (let d = 1; d <= ultimoDia; d++) diasInfo.push({ dia: d, dow: new Date(y, m-1, d).getDay() })

      const MESES      = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
      const DIAS_CORTO = ['D','L','M','M','J','V','S']
      const TOLERANCIA = 0
      const ExcelJS    = (await import('exceljs')).default

      // ── Función auxiliar de marca de asistencia ──────────────────────────────
      function getMarca(docId: string, dia: number, dow: number): { marca: string; tarde: boolean } {
        const justif = justifSet.has(`${docId}|${dia}`)
        const rec = asisMap.get(docId)?.get(dia)
        if (!rec) return justif ? { marca: 'J', tarde: false } : { marca: '', tarde: false }  // ausencia (justificada o no)
        const isoEntrada = rec.entrada
        const nomDia = NOMBRES_DIA[dow]
        const horaEsp = horarioMap.get(docId)?.get(nomDia) ?? horaEntradaFija.get(docId)
        if (isoEntrada && horaEsp) {
          const fechaLima = new Date(isoEntrada).toLocaleDateString('en-CA',{timeZone:'America/Lima'})
          const mins = calcularMinutosTarde(isoEntrada, horaEsp, fechaLima)
          if (mins > TOLERANCIA) return (rec.justificada || justif) ? { marca: 'J', tarde: false } : { marca: 'T', tarde: true }
          return { marca: 'A', tarde: false }
        }
        return { marca: 'A', tarde: false }  // presente (con o sin marca de entrada)
      }

      // ── Ruta 1: usar plantilla subida por el usuario ──────────────────────────
      const { data: cfgPlantilla } = await supabase.from('config').select('value').eq('key','plantilla_formato01').single()
      if (cfgPlantilla?.value) {
        const b64 = cfgPlantilla.value as string
        const binary = atob(b64)
        const arr = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)

        const wb2 = new ExcelJS.Workbook()
        await wb2.xlsx.load(arr.buffer)
        const ws2 = wb2.worksheets[0]

        // ── 1. Detectar fila de números de día (busca 3 consecutivos: 1,2,3) ──
        let dayNumRow = -1, dayStartCol = -1
        ws2.eachRow((row, rowNum) => {
          if (dayNumRow !== -1 || rowNum > 20) return
          const vals: { col: number; n: number }[] = []
          row.eachCell((cell, col) => {
            const raw = cell.value
            const n   = typeof raw === 'number' ? raw
                      : typeof raw === 'string' ? parseInt(raw, 10)
                      : NaN
            if (!isNaN(n) && n >= 1 && n <= 31) vals.push({ col, n })
          })
          // busca tres consecutivos 1→2→3
          for (let i = 0; i < vals.length - 2; i++) {
            if (vals[i].n === 1 && vals[i+1].n === 2 && vals[i+2].n === 3
                && vals[i+1].col === vals[i].col + 1 && vals[i+2].col === vals[i+1].col + 1) {
              dayNumRow   = rowNum
              dayStartCol = vals[i].col
              break
            }
          }
        })
        if (dayNumRow   === -1) dayNumRow   = 8  // fallback MINEDU estándar
        if (dayStartCol === -1) dayStartCol = 7  // fallback MINEDU estándar

        // ── 2. Detectar columnas DNI y Apellidos/Nombres en las filas de cabecera ──
        let colNro = 1, colDNI = 2, colNombre = 3
        for (let r = 1; r < dayNumRow; r++) {
          ws2.getRow(r).eachCell((cell, col) => {
            const v = String(cell.value ?? '').toUpperCase().replace(/\s+/g, ' ').trim()
            if (v === 'N°' || v === 'N°' || v === 'N' || v === '#') colNro = col
            if (v === 'DNI')                                          colDNI = col
            if (v.includes('APELLIDO') && v.includes('NOMBRE'))      colNombre = col
          })
        }

        // dataStartRow = justo después de la fila de letras de día
        const dataStartRow = dayNumRow + 2

        // ── 3. Actualizar MES, AÑO y fecha de firma ──
        const mesCorrecto = MESES[m - 1]
        const anoCorrecto = String(y)
        const hoy = new Date()
        const fechaFirma = `Juliaca, ${hoy.getDate()} de ${MESES[hoy.getMonth()].toLowerCase()} del ${hoy.getFullYear()}`
        ws2.eachRow((row, rowNum) => {
          if (rowNum >= dataStartRow) return  // solo encabezado
          row.eachCell(cell => {
            if (cell.value === null || cell.value === undefined) return
            const str = String(cell.value).toUpperCase().trim()
            if (MESES.includes(str) && str !== mesCorrecto)       { cell.value = mesCorrecto; return }
            if (/^\d{4}$/.test(str) && str !== anoCorrecto)       { cell.value = Number(anoCorrecto); return }
            const orig = String(cell.value)
            if (orig.toLowerCase().includes('juliaca,') && orig.toLowerCase().includes('del'))
              cell.value = fechaFirma
          })
        })

        // ── 4. Limpiar datos de docentes existentes en el template ──
        for (let r = dataStartRow; r <= dataStartRow + 60; r++) {
          const row = ws2.getRow(r)
          const v1  = row.getCell(colNro).value
          const v2  = row.getCell(colDNI).value
          const v3  = row.getCell(colNombre).value
          // limpiar si alguna de las columnas fijas tiene contenido
          if (v1 !== null || v2 !== null || v3 !== null) {
            const lastDayCol = dayStartCol + ultimoDia - 1
            for (let c = colNro; c <= lastDayCol; c++) ws2.getCell(r, c).value = null
          }
        }

        // ── 5. Llenar datos de docentes actuales ──
        docList.forEach((doc, idx) => {
          const r = dataStartRow + idx
          ws2.getCell(r, colNro).value    = idx + 1
          ws2.getCell(r, colDNI).value    = doc.dni ?? ''
          ws2.getCell(r, colNombre).value = doc.apellido
            ? `${doc.apellido}, ${doc.nombre}`
            : doc.nombre

          diasInfo.forEach(({ dia, dow }) => {
            if (dow === 0 || dow === 6) return
            const col = dayStartCol + (dia - 1)
            const { marca, tarde } = getMarca(doc.id, dia, dow)
            const cell = ws2.getCell(r, col)
            cell.value = marca
            if (tarde)        cell.font = { bold: true,  color: { argb: 'FFCC0000' } }
            else if (marca === 'J') cell.font = { bold: true, color: { argb: 'FF7F6000' } }
            else if (marca === 'A') cell.font = { color: { argb: 'FF276221' } }
          })
        })

        const buf2  = await wb2.xlsx.writeBuffer()
        const blob2 = new Blob([buf2], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url2  = URL.createObjectURL(blob2)
        const a2    = document.createElement('a')
        a2.href = url2; a2.download = `formato01-${mesFormatoOficial}.xlsx`; a2.click()
        URL.revokeObjectURL(url2)
        return
      }

      // ── Ruta 2: generar desde cero (sin plantilla) ───────────────────────────
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Sistema ACEG'
      wb.created = new Date()

      const ws = wb.addWorksheet('Formato 01', {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
          margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
      })

      const FIXED     = 6
      const totalCols = FIXED + ultimoDia
      function colL(n: number): string {
        let s = ''
        while (n > 0) { const r = (n-1)%26; s = String.fromCharCode(65+r)+s; n = Math.floor((n-1)/26) }
        return s
      }
      const lastC = colL(totalCols)

      ws.getColumn(1).width = 4
      ws.getColumn(2).width = 11
      ws.getColumn(3).width = 26
      ws.getColumn(4).width = 12
      ws.getColumn(5).width = 12
      ws.getColumn(6).width = 10
      for (let d = 1; d <= ultimoDia; d++) ws.getColumn(FIXED+d).width = 3.2

      const C_BLUE_HDR = 'FF1F3864'
      const C_CYAN_HDR = 'FF00B0F0'
      const C_WKD      = 'FFD9E1F2'
      const C_WHITE    = 'FFFFFFFF'
      const C_GRAY_LT  = 'FFF2F2F2'
      const C_BLACK    = 'FF000000'
      const C_RED_FG   = 'FFCC0000'
      const C_RED_BG   = 'FFFFC7CE'
      const C_GREEN_BG = 'FFC6EFCE'
      const C_GREEN_FG = 'FF276221'

      function bt(argb = C_BLACK) { return { style: 'thin' as const, color: { argb } } }
      function cs(row: number, col: number, opts: {
        value?: string | number | null; bold?: boolean; size?: number; color?: string; bg?: string;
        hAlign?: 'left'|'center'|'right'; vAlign?: 'top'|'middle'|'bottom';
        wrapText?: boolean; border?: boolean
      }) {
        const cell = ws.getRow(row).getCell(col)
        if (opts.value !== undefined) cell.value = opts.value
        cell.font = { bold: opts.bold ?? false, size: opts.size ?? 8, color: { argb: opts.color ?? C_BLACK }, name: 'Arial' }
        cell.alignment = { horizontal: opts.hAlign ?? 'center', vertical: opts.vAlign ?? 'middle', wrapText: opts.wrapText ?? false }
        if (opts.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } }
        if (opts.border !== false) cell.border = { top: bt(), bottom: bt(), left: bt(), right: bt() }
        return cell
      }

      // ── Fila 1: Título largo ──
      ws.getRow(1).height = 28
      ws.mergeCells(`A1:${lastC}1`)
      cs(1,1,{ value:'NORMAS PARA EL REGISTRO Y CONTROL DE ASISTENCIA Y SU APLICACIÓN EN LA PLANILLA ÚNICA DE PAGOS DE LOS PROFESORES Y AUXILIARES DE EDUCACIÓN, EN EL MARCO DE LA LEY DE REFORMA MAGISTERIAL Y SU REGLAMENTO (R.S.G. N° 326-2017-MINEDU)', bold:true, size:7, hAlign:'center', vAlign:'middle', wrapText:true, bg:C_WHITE })

      // ── Fila 2: ANEXO 03 ──
      ws.getRow(2).height = 13
      ws.mergeCells(`A2:${lastC}2`)
      cs(2,1,{ value:'ANEXO 03', bold:true, size:9, hAlign:'center', bg:C_WHITE })

      // ── Fila 3: Título formato ──
      ws.getRow(3).height = 18
      ws.mergeCells(`A3:${lastC}3`)
      cs(3,1,{ value:'FORMATO 01: REPORTE DE ASISTENCIA DETALLADO', bold:true, size:12, hAlign:'center', bg:C_CYAN_HDR, color:C_WHITE })

      // ── Fila 4: UGEL / MES / AÑO / TURNO ──
      ws.getRow(4).height = 15
      const meta4 = [
        ['UGEL:','SAN ROMÁN',1,3],['MES:',MESES[m-1],1,3],['AÑO:',String(y),1,2],['TURNO:','MAÑANA Y TARDE',1,3],
      ] as [string,string,number,number][]
      let c4 = 1
      for (const [lbl,val,,vc] of meta4) {
        cs(4,c4,{ value:lbl, bold:true, size:8, hAlign:'right', bg:C_GRAY_LT }); c4++
        const ve = c4+vc-1
        if (ve>c4) ws.mergeCells(4,c4,4,Math.min(ve,totalCols))
        cs(4,c4,{ value:val, size:8, hAlign:'left', bg:C_WHITE })
        c4 = Math.min(ve,totalCols)+1
      }

      // ── Fila 5: INSTITUCIÓN / NIVEL ──
      ws.getRow(5).height = 15
      const instEnd = Math.floor(totalCols * 0.55)
      cs(5,1,{ value:'INSTITUCIÓN EDUCATIVA:', bold:true, size:8, hAlign:'right', bg:C_GRAY_LT })
      ws.mergeCells(5,2,5,instEnd)
      cs(5,2,{ value:'ESCUELA GASTRONÓMICA ACEG', size:8, hAlign:'left', bg:C_WHITE })
      const niv = instEnd+1
      ws.mergeCells(5,niv,5,niv+1)
      cs(5,niv,{ value:'NIVEL EDUCATIVO Y MODALIDAD:', bold:true, size:8, hAlign:'right', bg:C_GRAY_LT })
      ws.mergeCells(5,niv+2,5,totalCols)
      cs(5,niv+2,{ value:'EBR', size:8, hAlign:'left', bg:C_WHITE })

      // ── Fila 6: LUGAR / CÓDIGO MODULAR / DEP / PROV / DIS ──
      ws.getRow(6).height = 15
      const meta6:[string,string,number,number][] = [
        ['LUGAR:','JULIACA',1,3],['CÓDIGO MODULAR:','3020658',2,2],['DEP','PUNO',1,1],['PROV','SAN ROMÁN',1,2],['DIS','JULIACA',1,2],
      ]
      let c6 = 1
      for (const [lbl,val,lc,vc] of meta6) {
        if (c6>totalCols) break
        const le = Math.min(c6+lc-1,totalCols)
        if (le>c6) ws.mergeCells(6,c6,6,le)
        cs(6,c6,{ value:lbl, bold:true, size:8, hAlign:'right', bg:C_GRAY_LT })
        c6 = le+1; if (c6>totalCols) break
        const ve = Math.min(c6+vc-1,totalCols)
        if (ve>c6) ws.mergeCells(6,c6,6,ve)
        cs(6,c6,{ value:val, size:8, hAlign:'left', bg:C_WHITE })
        c6 = ve+1
      }

      // ── Fila 7-8: Encabezados ──
      ws.getRow(7).height = 20; ws.getRow(8).height = 14
      ;['N°','DNI','APELLIDOS Y NOMBRES','CARGO','CONDICIÓN\nLABORAL','JORNADA\nLABORAL'].forEach((h,i) => {
        ws.mergeCells(7,i+1,8,i+1)
        cs(7,i+1,{ value:h, bold:true, size:7, bg:C_BLUE_HDR, color:C_WHITE, wrapText:true })
      })
      ws.mergeCells(7,FIXED+1,7,totalCols)
      cs(7,FIXED+1,{ value:'DÍAS CALENDARIO', bold:true, size:9, bg:C_BLUE_HDR, color:C_WHITE })

      diasInfo.forEach(({ dia, dow }) => {
        const wkd = dow===0||dow===6
        cs(8,FIXED+dia,{ value:dia, bold:true, size:7, bg:wkd?C_WKD:C_BLUE_HDR, color:wkd?C_BLACK:C_WHITE })
      })

      // ── Fila 9: Letra del día ──
      ws.getRow(9).height = 11
      diasInfo.forEach(({ dia, dow }) => {
        const wkd = dow===0||dow===6
        cs(9,FIXED+dia,{ value:DIAS_CORTO[dow], size:7, bg:wkd?C_WKD:C_GRAY_LT })
      })

      // ── Filas de datos ──
      docList.forEach((doc, idx) => {
        const rowNum = 10+idx
        ws.getRow(rowNum).height = 14
        const bg = idx%2===0 ? C_WHITE : C_GRAY_LT

        cs(rowNum,1,{ value:idx+1, bold:true, size:7, bg })
        cs(rowNum,2,{ value:doc.dni??'', size:7, bg })
        cs(rowNum,3,{ value:`${doc.apellido??''}, ${doc.nombre}`.trim(), size:7, hAlign:'left', bg })
        cs(rowNum,4,{ value:'Profesor', size:7, bg })
        cs(rowNum,5,{ value:'Contratado', size:7, bg })
        cs(rowNum,6,{ value:'30 horas', size:7, bg })

        diasInfo.forEach(({ dia, dow }) => {
          const wkd = dow===0||dow===6
          if (wkd) { cs(rowNum, FIXED+dia, { value:'', size:7, bg:C_WKD }); return }
          const { marca, tarde } = getMarca(doc.id, dia, dow)
          const cellBg = marca === 'A' ? C_GREEN_BG : marca === 'T' ? C_RED_BG : marca === 'J' ? 'FFFFFF99' : bg
          const cellFg = marca === 'A' ? C_GREEN_FG : marca === 'T' ? C_RED_FG : marca === 'J' ? 'FF7F6000' : C_BLACK
          cs(rowNum, FIXED+dia, { value:marca, bold:tarde || marca === 'J', size:7, bg:cellBg, color:cellFg })
        })
      })

      // ── Leyenda con celdas individuales ──
      const leyRow1 = 10+docList.length+1
      const leyRow2 = leyRow1+1
      ws.getRow(leyRow1).height = 13; ws.getRow(leyRow2).height = 13

      const leyItems: [string,string,string,string][] = [
        ['A','ASISTENCIA',        'FF92D050','FF375623'],
        ['I','INASISTENCIA INJUSTIFICADA','FFFFC7CE','FF9C0006'],
        ['J','INASIST. JUSTIFICADA (FERIADO, ONOMÁSTICO, VACACIONES, COMISIÓN)','FFFFFF99','FF7F6000'],
        ['T','TARDANZA EN MINUTOS (DIGITACIÓN EN NÚMEROS)','FFFFEB9C','FF9C6500'],
        ['LS','LICENCIA SIN GOCE DE REMUNERACIONES','FFDCE6F1','FF17375E'],
        ['LG','LICENCIA CON GOCE DE REMUNERACIONES','FFCFE2F3','FF17375E'],
        ['P','PERMISO SIN GOCE DE REMUNERACIONES','FFE2EFDA','FF375623'],
        ['G','SEMANA DE GESTIÓN','FFE2E2E2','FF404040'],
        ['H','HUELGA O PARO','FFD9D9D9','FF404040'],
        ['F','FERIADO','FFFFFF00','FF7F6000'],
      ]

      // 5 items fila 1, 5 items fila 2
      const colsPerItem = Math.floor(totalCols / 5)
      for (let i = 0; i < 10; i++) {
        const row = i < 5 ? leyRow1 : leyRow2
        const pos = i % 5
        const colStart = pos * colsPerItem + 1
        const colEnd   = pos === 4 ? totalCols : colStart + colsPerItem - 1
        const [code, desc, bg, fg] = leyItems[i]
        // Celda código
        cs(row, colStart, { value:code, bold:true, size:7, bg, color:fg })
        // Celda descripción
        if (colEnd > colStart) ws.mergeCells(row, colStart+1, row, colEnd)
        cs(row, colStart+1, { value:desc, size:6, hAlign:'left', bg:'FFF9F9F9', color:'FF404040', border:false })
      }

      // ── Fila firma ──
      const firmaRow = leyRow2+2
      ws.getRow(firmaRow).height = 14
      const mitad = Math.floor(totalCols/2)
      ws.mergeCells(firmaRow,1,firmaRow,mitad)
      const hoy = new Date()
      cs(firmaRow,1,{
        value:`Juliaca, ${hoy.getDate()} de ${MESES[hoy.getMonth()].toLowerCase()} del ${hoy.getFullYear()}`,
        size:8, hAlign:'center', bg:C_WHITE, border:false,
      })
      ws.mergeCells(firmaRow,mitad+1,firmaRow,totalCols)
      cs(firmaRow,mitad+1,{ value:'DIRECTOR (A) DE LA I.E.', bold:true, size:8, hAlign:'center', bg:C_WHITE, border:false })

      const buffer = await wb.xlsx.writeBuffer()
      const blob   = new Blob([buffer],{ type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url    = URL.createObjectURL(blob)
      const link   = document.createElement('a')
      link.href=url; link.download=`formato01-asistencia-${mesFormatoOficial}.xlsx`; link.click()
      URL.revokeObjectURL(url)
    } finally {
      setDescargandoFormatoOficial(false)
    }
  }

  async function cargarAnuncios() {
    setLoadingAnuncios(true)
    const { data } = await supabase
      .from('anuncios')
      .select('id,titulo,contenido,autor_nombre,created_at')
      .eq('tipo', 'global')
      .order('created_at', { ascending: false })
    setAnuncios((data ?? []) as typeof anuncios)
    setLoadingAnuncios(false)
  }
  async function publicarAnuncio(e: React.FormEvent) {
    e.preventDefault()
    setAnuncioError('')
    if (!anuncioTitulo.trim() || !anuncioContenido.trim()) { setAnuncioError('Completa título y contenido.'); return }
    setAnuncioGuardando(true)
    const { error: err } = await supabase.from('anuncios').insert({
      titulo:       anuncioTitulo.trim(),
      contenido:    anuncioContenido.trim(),
      tipo:         'global',
      autor_id:     adminId,
      autor_nombre: adminNombre,
    })
    if (err) { setAnuncioError(err.message); setAnuncioGuardando(false); return }
    setAnuncioTitulo(''); setAnuncioContenido(''); setAnuncioAbierto(false); setAnuncioGuardando(false)
    await cargarAnuncios()
  }
  async function eliminarAnuncio(id: string) {
    if (!(await confirmar({
      titulo: '¿Eliminar este anuncio?',
      mensaje: 'Docentes y estudiantes dejarán de verlo. Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Eliminar',
    }))) return
    await supabase.from('anuncios').delete().eq('id', id)
    setAnuncios(prev => prev.filter(a => a.id !== id))
  }

  async function cargarGeo() {
    const { data } = await supabase.rpc('obtener_geo_asistencia')
    if (!data || data.error) return
    setGeoActivo(!!data.activo)
    setGeoLat(data.lat != null ? String(data.lat) : '')
    setGeoLng(data.lng != null ? String(data.lng) : '')
    setGeoRadio(String(data.radio_m ?? 150))
  }

  // Captura las coordenadas del punto donde está el super admin (debe hacerlo
  // parado en la escuela) para usarlas como centro de la geocerca.
  function capturarUbicacionColegio() {
    if (!navigator.geolocation) {
      setGeoMsg({ tipo: 'error', texto: 'Este navegador no soporta geolocalización.' })
      return
    }
    setGeoCapturando(true); setGeoMsg(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGeoLat(pos.coords.latitude.toFixed(6))
        setGeoLng(pos.coords.longitude.toFixed(6))
        setGeoCapturando(false)
        setGeoMsg({ tipo: 'ok', texto: `Ubicación capturada (precisión ±${Math.round(pos.coords.accuracy)} m). Guarda para aplicar.` })
      },
      () => {
        setGeoCapturando(false)
        setGeoMsg({ tipo: 'error', texto: 'No se pudo obtener tu ubicación. Revisa el permiso de ubicación del navegador.' })
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  async function guardarGeo() {
    const lat = parseFloat(geoLat), lng = parseFloat(geoLng), radio = parseInt(geoRadio, 10)
    if (geoActivo && (isNaN(lat) || isNaN(lng))) {
      setGeoMsg({ tipo: 'error', texto: 'Registra las coordenadas de la escuela antes de activar la restricción.' })
      return
    }
    setGeoGuardando(true); setGeoMsg(null)
    const { data, error } = await supabase.rpc('configurar_geo_asistencia', {
      p_activo:  geoActivo,
      p_lat:     isNaN(lat) ? null : lat,
      p_lng:     isNaN(lng) ? null : lng,
      p_radio_m: isNaN(radio) ? null : radio,
    })
    setGeoGuardando(false)
    if (error || data?.error) {
      setGeoMsg({ tipo: 'error', texto: data?.error ?? 'No se pudo guardar la configuración.' })
      return
    }
    setGeoMsg({
      tipo: 'ok',
      texto: data.activo
        ? `Restricción activada: solo se podrá marcar a menos de ${data.radio_m} m de la escuela.`
        : 'Configuración guardada. La restricción está desactivada.',
    })
  }


  function abrirAccionRegistro(tipo: 'borrar' | 'editar', registro: Asistencia) {
    setAccionModal({ tipo, registro })
    setJustificacion('')
    setNuevaHora(formatHora(registro.fecha_hora))
    setAccionError('')
  }

  async function handleBorrarRegistro() {
    if (!accionModal || !justificacion.trim()) return
    setAccionLoading(true)
    setAccionError('')
    const reg = accionModal.registro
    const { error } = await supabase.from('asistencias').delete().eq('id', reg.id)
    if (error) {
      setAccionLoading(false)
      setAccionError('No se pudo borrar el registro. Verifica los permisos en Supabase (RLS).')
      return
    }
    await supabase.from('audit_log').insert({
      admin_id:            adminId,
      admin_nombre:        adminNombre,
      accion:              'borrar_asistencia',
      asistencia_id:       reg.id,
      docente_nombre:      reg.docentes?.nombre ?? null,
      fecha_hora_original: reg.fecha_hora,
      justificacion:       justificacion.trim(),
    })
    setAccionLoading(false)
    setAccionModal(null)
    setJustificacion('')
    await cargarReporte()
  }

  async function handleEditarRegistro() {
    if (!accionModal || !justificacion.trim() || !nuevaHora) return
    setAccionLoading(true)
    setAccionError('')
    const reg = accionModal.registro
    const nuevaFechaHora = new Date(`${fechaFiltro}T${nuevaHora}:00-05:00`).toISOString()
    const { error } = await supabase.from('asistencias').update({ fecha_hora: nuevaFechaHora }).eq('id', reg.id)
    if (error) {
      setAccionLoading(false)
      setAccionError('No se pudo actualizar el registro. Verifica los permisos en Supabase (RLS).')
      return
    }
    await supabase.from('audit_log').insert({
      admin_id:            adminId,
      admin_nombre:        adminNombre,
      accion:              'editar_asistencia',
      asistencia_id:       reg.id,
      docente_nombre:      reg.docentes?.nombre ?? null,
      fecha_hora_original: reg.fecha_hora,
      fecha_hora_nueva:    nuevaFechaHora,
      justificacion:       justificacion.trim(),
    })
    setAccionLoading(false)
    setAccionModal(null)
    setJustificacion('')
    setNuevaHora('')
    await cargarReporte()
  }
  async function cargarCursos() {
    const { data } = await supabase.from('cursos').select('id,nombre,color').order('nombre')
    const loaded = (data as Curso[]) ?? []

    // Asignar color único a cada curso si hay duplicados
    const usedColors = new Set<string>()
    const updates: { id: string; color: string }[] = []
    for (let i = 0; i < loaded.length; i++) {
      let color = loaded[i].color
      if (usedColors.has(color)) {
        color = COLORES_CURSO.find(c => !usedColors.has(c)) ?? COLORES_CURSO[i % COLORES_CURSO.length]
        updates.push({ id: loaded[i].id, color })
        loaded[i] = { ...loaded[i], color }
      }
      usedColors.add(color)
    }
    for (const u of updates) {
      await supabase.from('cursos').update({ color: u.color }).eq('id', u.id)
    }

    setCursos(loaded)
  }
  async function cargarAsignaciones() {
    setLoadingAsig(true)
    const cicloId = (await getCicloActivo())?.id ?? null
    let q = supabase
      .from('asignaciones')
      .select('id,docente_id,curso_id,grado,grupo,anio,cursos(nombre,color)')
      .order('grado')
    q = cicloId ? q.eq('ciclo_id', cicloId) : q.eq('anio', new Date().getFullYear())
    const { data } = await q
    setAsignaciones((data as unknown as Asignacion[]) ?? [])
    setLoadingAsig(false)
  }
  async function handleCrearCurso(e: React.FormEvent) {
    e.preventDefault()
    if (!cursoForm.nombre.trim()) return
    setCursoLoading(true)
    await supabase.from('cursos').insert({ nombre: cursoForm.nombre.trim(), color: cursoForm.color })
    setCursoLoading(false)
    setMostrarCursoForm(false)
    setCursoForm({ nombre: '', color: '#143875' })
    await cargarCursos()
  }
  async function handleEliminarCurso(id: string) {
    const nombre = cursos.find(c => c.id === id)?.nombre ?? 'este curso'
    if (!(await confirmar({
      titulo: `¿Eliminar el curso "${nombre}"?`,
      mensaje: 'Se eliminará del catálogo. Las asignaciones, horarios y contenido que dependan de él pueden quedar inconsistentes.',
      tono: 'peligro', confirmarLabel: 'Eliminar curso',
    }))) return
    await supabase.from('cursos').delete().eq('id', id)
    setCursos(prev => prev.filter(c => c.id !== id))
  }
  async function handleCrearAsignacion(docente_id: string) {
    if (!asigForm.curso_id || !asigForm.grado || !asigForm.grupo) return
    setAsigLoading(true)
    const { data: nueva, error } = await supabase.from('asignaciones').insert({
      docente_id,
      curso_id:  asigForm.curso_id,
      grado:     asigForm.grado,
      grupo:     asigForm.grupo,
      ciclo_id:  (await getCicloActivo())?.id ?? null,
      anio:      new Date().getFullYear(),
    }).select('id,docente_id,curso_id,grado,grupo,anio,cursos(nombre,color)').single()
    if (!error && nueva) {
      setAsignaciones(prev => [...prev, nueva as unknown as Asignacion])
      await syncHorariosDocenteSeccion(nombreDeCursoId(asigForm.curso_id), asigForm.grado, asigForm.grupo, docente_id)
    }
    setAsigLoading(false)
    setDocenteAsigAbierto(null)
    setAsigForm({ curso_id: '', grado: '', grupo: 'A' })
  }
  async function handleEliminarAsignacion(id: string) {
    const a = asignaciones.find(x => x.id === id)
    const desc = a ? `${(a.cursos as { nombre?: string } | null)?.nombre ?? 'el curso'} en ${a.grado} ${a.grupo}` : 'esta asignación'
    if (!(await confirmar({
      titulo: `¿Quitar ${desc}?`,
      mensaje: 'El docente y los estudiantes dejarán de ver este curso; sus unidades, tareas y notas quedarán inaccesibles.',
      tono: 'peligro', confirmarLabel: 'Quitar asignación',
    }))) return
    await supabase.from('asignaciones').delete().eq('id', id)
    setAsignaciones(prev => prev.filter(a => a.id !== id))
  }
  // Propaga el docente al horario sin borrar clases: solo cambia docente_id en horarios cuyo
  // (materia, grado, grupo) coincidan con la asignación. Aplica a borrador y activo.
  async function syncHorariosDocenteSeccion(materia: string, grado: string, grupo: string, docente_id: string) {
    if (!materia || !docente_id) return
    await supabase.from('horarios')
      .update({ docente_id })
      .eq('materia', materia)
      .eq('grado',   grado)
      .eq('grupo',   grupo)
  }
  async function syncHorariosDocenteCursoNivel(materia: string, grados: string[], docente_id: string) {
    if (!materia || !docente_id || grados.length === 0) return
    await supabase.from('horarios')
      .update({ docente_id })
      .eq('materia', materia)
      .in('grado',   grados)
  }
  function nombreDeCursoId(curso_id?: string, fallback?: string | null) {
    if (!curso_id) return fallback ?? ''
    return cursos.find(c => c.id === curso_id)?.nombre ?? fallback ?? ''
  }
  async function handleCambiarDocenteAsignacion(asigId: string, nuevoDocenteId: string) {
    if (!nuevoDocenteId) return
    // Optimistic: cambia el state local al instante (sin recargar)
    const prevSnap = asignaciones
    const asig = asignaciones.find(a => a.id === asigId)
    setAsignaciones(prev => prev.map(a => a.id === asigId ? { ...a, docente_id: nuevoDocenteId } : a))
    setSwapAsigId(null)
    const { error } = await supabase.from('asignaciones').update({ docente_id: nuevoDocenteId }).eq('id', asigId)
    if (error) { setAsignaciones(prevSnap); return }
    if (asig) {
      const materia = nombreDeCursoId(asig.curso_id, (asig.cursos as { nombre: string } | null | undefined)?.nombre)
      await syncHorariosDocenteSeccion(materia, asig.grado, asig.grupo, nuevoDocenteId)
    }
  }
  async function handleCrearAsignacionSeccion(grado: string, grupo: string, docente_id: string, curso_id: string) {
    if (!docente_id || !curso_id) return
    setAsigLoading(true)
    const { data: nueva, error } = await supabase.from('asignaciones').insert({
      docente_id, curso_id, grado, grupo,
      ciclo_id: (await getCicloActivo())?.id ?? null,
      anio: new Date().getFullYear(),
    }).select('id,docente_id,curso_id,grado,grupo,anio,cursos(nombre,color)').single()
    if (!error && nueva) {
      setAsignaciones(prev => [...prev, nueva as unknown as Asignacion])
      await syncHorariosDocenteSeccion(nombreDeCursoId(curso_id), grado, grupo, docente_id)
    }
    setAsigLoading(false)
    setSeccionAddOpen(null)
    setSeccionAddCurso('')
    setSeccionAddDocente('')
  }
  async function handleAplicarDocenteACurso(curso_id: string, docente_id: string, nivel: 'Cocina'|'Pastelería') {
    if (!docente_id) return
    const gradosNivel = GRADOS.filter(g => g.includes(nivel))
    // Optimistic: actualiza local todas las asignaciones del curso en el nivel
    const prevSnap = asignaciones
    setAsignaciones(prev => prev.map(a =>
      a.curso_id === curso_id && gradosNivel.includes(a.grado) ? { ...a, docente_id } : a
    ))
    setBulkLoadingCurso(curso_id)
    const cicloId = (await getCicloActivo())?.id ?? null
    let updQ = supabase.from('asignaciones')
      .update({ docente_id })
      .eq('curso_id', curso_id)
      .in('grado', gradosNivel)
    updQ = cicloId ? updQ.eq('ciclo_id', cicloId) : updQ.eq('anio', new Date().getFullYear())
    const { error } = await updQ
    if (error) { setAsignaciones(prevSnap); setBulkLoadingCurso(null); return }
    await syncHorariosDocenteCursoNivel(nombreDeCursoId(curso_id), gradosNivel, docente_id)
    setBulkLoadingCurso(null)
  }
  async function handleCrearAsignacionCurso(curso_id: string, grado: string, grupo: string, docente_id: string) {
    if (!docente_id) return
    setAsigLoading(true)
    const { data: nueva, error } = await supabase.from('asignaciones').insert({
      docente_id, curso_id, grado, grupo,
      ciclo_id: (await getCicloActivo())?.id ?? null,
      anio: new Date().getFullYear(),
    }).select('id,docente_id,curso_id,grado,grupo,anio,cursos(nombre,color)').single()
    if (!error && nueva) {
      setAsignaciones(prev => [...prev, nueva as unknown as Asignacion])
      await syncHorariosDocenteSeccion(nombreDeCursoId(curso_id), grado, grupo, docente_id)
    }
    setAsigLoading(false)
    setCursoAddOpen(null)
    setCursoAddDocente('')
  }
  async function cargarHorarios() {
    setLoadingHorarios(true)
    let hsQuery = supabase
      .from('horarios')
      .select('id,docente_id,dia,hora_inicio,hora_fin,materia,grado,grupo,docentes(nombre)')
      .eq('activo', true)
      .order('hora_inicio', { ascending: true })
    if (vistaHorario === 'grado') {
      hsQuery = hsQuery.eq('grado', gradoFiltroH).eq('grupo', grupoFiltroH)
    } else if (vistaHorario === 'docente' && docenteFiltroH) {
      hsQuery = hsQuery.eq('docente_id', docenteFiltroH)
    }
    const [{ data: hs }, { data: cfg }] = await Promise.all([
      hsQuery,
      supabase.from('config').select('value').eq('key', 'periodos_horario').maybeSingle(),
    ])
    setHorarios((hs as unknown as Horario[]) ?? [])
    if (cfg?.value) {
      try { setPeriodos(JSON.parse(cfg.value)) } catch { /* usa defaults */ }
    }
    setLoadingHorarios(false)
  }

  async function guardarPeriodos() {
    setGuardandoPeriodos(true)
    setHorarioError('')

    // Migrar horarios cuyos tiempos cambiaron
    for (const orig of periodosOriginal) {
      const nuevo = periodos.find(p => p.id === orig.id)
      if (!nuevo) continue
      if (orig.inicio !== nuevo.inicio)
        await supabase.from('horarios').update({ hora_inicio: nuevo.inicio }).eq('hora_inicio', orig.inicio)
      if (orig.fin !== nuevo.fin)
        await supabase.from('horarios').update({ hora_fin: nuevo.fin }).eq('hora_fin', orig.fin)
    }

    const { error } = await supabase.from('config').upsert(
      { key: 'periodos_horario', value: JSON.stringify(periodos) },
      { onConflict: 'key' }
    )
    setGuardandoPeriodos(false)
    if (error) { setHorarioError(`No se pudieron guardar los períodos: ${error.message}`); return }
    setPeriodosSavedOk(true)
    setTimeout(() => { setPeriodosSavedOk(false); setEditandoPeriodos(false) }, 1500)
  }
  async function recargar() {
    if (tab === 'admins') await cargarAdmins()
    else if (tab === 'docentes') await cargarDocentes(pageDocentes, searchDocentes)
    else if (tab === 'alumnos')  await cargarAlumnos(pageAlumnos, searchAlumnos)
    else if (tab === 'reporte') await cargarReporte()
    else if (tab === 'horario') await cargarHorarios()
    else if (tab === 'cursos') { await cargarCursos(); await cargarAsignaciones() }
    else if (tab === 'justificaciones') await cargarJustificaciones()
    else if (tab === 'auditoria') await cargarAuditLog()
    else if (tab === 'reportes-alumnos') await cargarReporteAlumnos()
    else if (tab === 'asist-alumnos') await cargarAsistAlumnos(asistGrado || undefined, asistGrupo || undefined)
    else if (tab === 'qr') await cargarGeo()
  }

  // Pre-validación de exclusividad mutua entre docentes / administrativos /
  // administradores. Llama a la RPC `validar_rol_libre` (definida en
  // supabase/exclusividad_roles.sql). La regla real está blindada en triggers
  // de BD; este chequeo solo evita el viaje a la creación cuando ya sabemos
  // que va a fallar.
  async function checkConflictoRol(
    dni: string,
    usuario: string,
    destino: 'docente' | 'administrativo' | 'admin',
  ): Promise<{ role: string; match: string } | null> {
    const { data, error } = await supabase.rpc('validar_rol_libre', {
      p_dni:     dni     || '',
      p_usuario: usuario || '',
      p_destino: destino,
    })
    if (error) {
      // Si la RPC no existe aún (migración pendiente) caemos a un chequeo
      // best-effort tabla por tabla para no bloquear creación.
      const fuentes: Array<{ table: string; role: string }> = [
        { table: 'docentes',         role: 'docente' },
        { table: 'administrativos',  role: 'administrativo' },
        { table: 'user_admin',       role: 'administrador' },
      ].filter(s => s.role !== destino)
      const dniN     = (dni     || '').trim()
      const usuarioN = (usuario || '').trim().toLowerCase()
      for (const { table, role } of fuentes) {
        if (dniN) {
          const { data: hit } = await supabase.from(table).select('id').eq('dni', dniN).maybeSingle()
          if (hit) return { role, match: `DNI ${dniN}` }
        }
        if (usuarioN) {
          const { data: hit } = await supabase.from(table).select('id').eq('usuario', usuarioN).maybeSingle()
          if (hit) return { role, match: `usuario "${usuarioN}"` }
        }
      }
      return null
    }
    const r = data as { ok?: boolean; rol?: string; match?: string } | null
    if (r && r.rol && r.match) return { role: r.rol, match: r.match }
    return null
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault()
    setFormError(''); setFormOk(''); setFormLoading(true)
    const esDocente        = tab === 'docentes' && filtroTipo !== 'administrativo'
    const esAdministrativo = tab === 'docentes' && filtroTipo === 'administrativo'
    const esAlumno         = tab === 'alumnos'
    const esAdmin          = tab === 'admins'
    const nombreCompleto = (esDocente || esAdministrativo || esAlumno)
      ? [form.nombres, form.apellido].filter(Boolean).join(' ')
      : form.nombres
    const authEmail = esAlumno
      ? `${form.usuario.toLowerCase().trim()}@habich.alumno`
      : `${form.usuario.toLowerCase().trim()}@habich.sys`

    // Validar exclusividad mutua entre roles de personal
    if (!esAlumno) {
      const destino: 'docente' | 'administrativo' | 'admin' =
        esAdmin ? 'admin' : esAdministrativo ? 'administrativo' : 'docente'
      const conflicto = await checkConflictoRol(form.dni, form.usuario, destino)
      if (conflicto) {
        setFormError(`Ya existe un ${conflicto.role} con ${conflicto.match}. Cambia su tipo desde la lista en vez de crear uno nuevo.`)
        setFormLoading(false)
        return
      }
    }

    // Para alumnos la contraseña ES el DNI (convención de la escuela): así nunca
    // se desalinea de lo guardado en la tabla ni hay que recordar otra clave.
    const alumnoPwd = form.dni.trim()
    if (esAlumno && alumnoPwd.length < 6) {
      setFormError('El DNI del estudiante debe tener al menos 6 dígitos (se usa como contraseña).')
      setFormLoading(false)
      return
    }
    const fn = (esDocente || esAdministrativo) ? 'crear_docente' : esAlumno ? 'crear_alumno' : 'crear_admin'
    const rpcParams: Record<string, string> = { p_email: authEmail, p_password: esAlumno ? alumnoPwd : form.password, p_nombre: form.nombres }
    if (esAlumno) { rpcParams.p_apellidos = form.apellido || ''; rpcParams.p_usuario = form.usuario.toLowerCase().trim() }
    const { data, error } = await supabase.rpc(fn, rpcParams)
    if (error || data?.error) { setFormError(data?.error ?? 'Error al crear.'); setFormLoading(false); return }
    if (esDocente || esAdministrativo) {
      await supabase.from('docentes').update({
        apellido:   form.apellido   || null, dni:       form.dni       || null,
        usuario:    form.usuario    || null, correo:    form.correo    || null,
        celular:    form.celular    || null, cumpleanos: form.cumpleanos || null,
      }).eq('email', authEmail)
      // Si lo creó como administrativo, convertir tipo inmediatamente
      if (esAdministrativo) {
        const { data: doc } = await supabase
          .from('docentes')
          .select('id,nombre,email,usuario')
          .eq('email', authEmail)
          .maybeSingle()
        if (doc) {
          await supabase.rpc('cambiar_tipo_usuario', {
            p_user_id: doc.id,
            p_nombre:  doc.nombre,
            p_email:   doc.email,
            p_usuario: doc.usuario ?? null,
            p_origen:  'docentes',
            p_destino: 'administrativo',
          })
        }
      }
    } else if (esAlumno) {
      const usuarioNorm = form.usuario.toLowerCase().trim()
      await supabase.from('alumnos').update({
        apellidos: form.apellido || null, dni:   form.dni   || null,
        grado:     form.grado    || null, grupo: form.grupo || null,
        usuario:   usuarioNorm,
      }).eq('usuario', usuarioNorm)

      // Auto-matricular en el ciclo activo si se especificó grado y grupo
      if (form.grado && form.grupo) {
        const cicloActivo = ciclos.find(c => c.activo)
        if (cicloActivo) {
          const { data: alData } = await supabase
            .from('alumnos').select('id').eq('usuario', usuarioNorm).maybeSingle()
          if (alData?.id) {
            await supabase.from('matriculas').insert({
              alumno_id: alData.id,
              ciclo_id:  cicloActivo.id,
              grado:     form.grado,
              grupo:     form.grupo,
            })
          }
        }
      }
    } else {
      await supabase.from('user_admin').update({
        apellido:   form.apellido   || null,
        dni:        form.dni        || null,
        usuario:    form.usuario    || null,
        correo:     form.correo     || null,
        celular:    form.celular    || null,
        cumpleanos: form.cumpleanos || null,
      }).eq('email', authEmail)
    }
    setFormOk(`"${nombreCompleto}" ${esAlumno ? 'creado y matriculado correctamente.' : 'creado correctamente.'}`)
    setForm({ nombres:'', apellido:'', dni:'', password:'', grado:'', grupo:'', usuario:'', correo:'', celular:'', cumpleanos:'' })
    setMostrarForm(false)
    await recargar()
    setFormLoading(false)
  }

  function handleEliminar(id: string, nombre: string) {
    setConfirmarEliminar({ id, nombre })
  }

  function abrirCambiarTipo(id: string) {
    const abriendo = cambiarTipoId !== id
    setCambiarTipoId(abriendo ? id : null)
    setCambiarTipoTarget('')
    setCambiarTipoOk(false)
    setCambiarTipoCursos(null)
    if (abriendo) {
      setEditandoId(null); setResetandoId(null); setDetalleDocenteId(null)
      // ¿Cuántos cursos tiene asignados? (solo se puede subir a administrativo si no tiene)
      supabase.from('asignaciones').select('id', { count: 'exact', head: true }).eq('docente_id', id)
        .then(({ count }) => setCambiarTipoCursos(count ?? 0))
    }
  }

  async function handleCambiarTipo(d: Docente | Admin, origen: 'docentes' | 'administrativos' = 'docentes') {
    if (!cambiarTipoTarget) return
    // Restricción: subir docente → administrativo solo si NO tiene cursos asignados
    if (origen === 'docentes' && cambiarTipoTarget === 'administrativo' && (cambiarTipoCursos ?? 0) > 0) {
      alert(`No se puede subir a administrativo: el docente tiene ${cambiarTipoCursos} curso(s) asignado(s). Quítale los cursos primero.`)
      return
    }
    setCambiarTipoLoading(true)
    const { data, error } = await supabase.rpc('cambiar_tipo_usuario', {
      p_user_id: d.id,
      p_nombre:  d.nombre,
      p_email:   d.email,
      p_usuario: d.usuario ?? null,
      p_origen:  origen,
      p_destino: cambiarTipoTarget,
    })
    setCambiarTipoLoading(false)
    if (error || data?.error) { alert('Error al cambiar tipo: ' + (data?.error ?? error?.message)); return }
    // El RPC solo copia nombre/email/usuario → preservamos el DNI (y celular)
    // para no romper la convención "contraseña = DNI" ni el reset de clave.
    const dniOrig = (d as { dni?: string | null }).dni
    if (cambiarTipoTarget === 'administrativo' && dniOrig) {
      await supabase.from('administrativos').update({ dni: dniOrig }).eq('id', d.id)
    }
    setCambiarTipoOk(true)
    if (origen === 'docentes') await cargarDocentes(pageDocentes, searchDocentes)
    else await cargarAdministrativos()
    if (cambiarTipoTarget === 'admin') await cargarAdmins()
    setTimeout(() => { setCambiarTipoId(null); setCambiarTipoOk(false) }, 1800)
  }

  async function handleConfirmarEliminar() {
    if (!confirmarEliminar) return
    setEliminandoLoading(true)
    const { data, error } = await supabase.rpc('eliminar_usuario', { p_user_id: confirmarEliminar.id })
    setEliminandoLoading(false)
    setConfirmarEliminar(null)
    if (error || data?.error) { alert(data?.error ?? 'Error al eliminar.'); return }
    await recargar()
  }

  function abrirEditar(d: Docente | Admin | Alumno, tipo: 'docente' | 'admin' | 'administrativo' | 'alumno') {
    if (tipo === 'alumno') {
      const al = d as Alumno
      setEditForm({
        nombre: al.nombre ?? '', apellidos: al.apellidos ?? '', dni: al.dni ?? '',
        grado: al.grado ?? '', grupo: al.grupo ?? '', usuario: al.usuario ?? '',
        correo: '', celular: al.celular ?? '', cumpleanos: '',
        celular_apoderado: al.celular_apoderado ?? '',
        fecha_nacimiento: al.fecha_nacimiento ?? '', sexo: al.sexo ?? '',
        codigo_estudiante: al.codigo_estudiante ?? '',
        parentesco_apoderado: al.parentesco_apoderado ?? '',
        nombre_apoderado: al.nombre_apoderado ?? '', dni_apoderado: al.dni_apoderado ?? '',
        correo_apoderado: al.correo_apoderado ?? '',
      })
      setModalEditAlumno(al)
      return
    }
    const abriendo = editandoId !== d.id
    setEditandoId(abriendo ? d.id : null)
    if (abriendo) {
      if (tipo === 'docente') {
        const doc = d as Docente
        setEditForm({ nombre: doc.nombre ?? '', apellidos: doc.apellido ?? '', dni: doc.dni ?? '', grado: doc.grado ?? '', grupo: doc.grupo ?? '', usuario: doc.usuario ?? '', correo: doc.correo ?? '', celular: doc.celular ?? '', cumpleanos: doc.cumpleanos ?? '', celular_apoderado: '', fecha_nacimiento: '', sexo: '', codigo_estudiante: '', parentesco_apoderado: '', nombre_apoderado: '', dni_apoderado: '', correo_apoderado: '' })
      } else {
        const a = d as Admin
        setEditForm({ nombre: a.nombre, apellidos: a.apellido ?? '', dni: a.dni ?? '', grado: '', grupo: '', usuario: a.usuario ?? '', correo: a.correo ?? '', celular: a.celular ?? '', cumpleanos: a.cumpleanos ?? '', celular_apoderado: '', fecha_nacimiento: '', sexo: '', codigo_estudiante: '', parentesco_apoderado: '', nombre_apoderado: '', dni_apoderado: '', correo_apoderado: '' })
      }
      setResetandoId(null); setDetalleDocenteId(null); setDetalleAdminId(null)
    }
  }

  async function handleGuardarDocente(id: string) {
    setEditLoading(true)
    await supabase.from('docentes').update({
      nombre:     editForm.nombre    || null,
      apellido:   editForm.apellidos || null,
      dni:        editForm.dni       || null,
      usuario:    editForm.usuario   || null,
      correo:     editForm.correo    || null,
      celular:    editForm.celular   || null,
      cumpleanos: editForm.cumpleanos || null,
    }).eq('id', id)
    setEditandoId(null)
    setEditLoading(false)
    await cargarDocentes()
  }

  async function handleGuardarAdmin(id: string) {
    setEditLoading(true)
    await supabase.from('user_admin').update({
      nombre:     editForm.nombre     || null,
      apellido:   editForm.apellidos  || null,
      dni:        editForm.dni        || null,
      usuario:    editForm.usuario    || null,
      correo:     editForm.correo     || null,
      celular:    editForm.celular    || null,
      cumpleanos: editForm.cumpleanos || null,
    }).eq('id', id)
    setEditandoId(null)
    setEditLoading(false)
    await cargarAdmins()
  }

  async function handleGuardarAdministrativo(id: string) {
    setEditLoading(true)
    await supabase.from('administrativos').update({
      nombre:     editForm.nombre     || null,
      apellido:   editForm.apellidos  || null,
      dni:        editForm.dni        || null,
      usuario:    editForm.usuario    || null,
      correo:     editForm.correo     || null,
      celular:    editForm.celular    || null,
      cumpleanos: editForm.cumpleanos || null,
    }).eq('id', id)
    setEditandoId(null)
    setEditLoading(false)
    await cargarAdministrativos()
  }

  async function handleGuardarAlumno(id: string) {
    setEditLoading(true)
    await supabase.from('alumnos').update({
      nombre:            editForm.nombre            || null,
      apellidos:         editForm.apellidos         || null,
      dni:               editForm.dni               || null,
      grado:             editForm.grado             || null,
      grupo:             editForm.grupo             || null,
      usuario:           editForm.usuario           || null,
      celular:           editForm.celular           || null,
      fecha_nacimiento:  editForm.fecha_nacimiento  || null,
      sexo:              editForm.sexo              || null,
      codigo_estudiante: editForm.codigo_estudiante || null,
      parentesco_apoderado: editForm.parentesco_apoderado || null,
      nombre_apoderado:     editForm.nombre_apoderado    || null,
      dni_apoderado:        editForm.dni_apoderado        || null,
      correo_apoderado:     editForm.correo_apoderado     || null,
      celular_apoderado:    editForm.celular_apoderado    || null,
    }).eq('id', id)
    setModalEditAlumno(null)
    setEditLoading(false)
    await cargarAlumnos(pageAlumnos, searchAlumnos)
  }

  function abrirReset(id: string, defaultPwd: string) {
    const abriendo = resetandoId !== id
    setResetandoId(abriendo ? id : null)
    setResetPassword(abriendo ? defaultPwd : '')
    setResetOk(false)
    if (abriendo) { setEditandoId(null); setDetalleDocenteId(null); setDetalleAdminId(null) }
  }

  async function handleResetearPassword(id: string) {
    if (!resetPassword.trim()) return
    setResetLoading(true)
    const { data, error } = await supabase.rpc('resetear_password', { p_user_id: id, p_password: resetPassword })
    setResetLoading(false)
    if (error || data?.error) { alert(data?.error ?? 'Error al resetear.'); return }
    setResetOk(true)
    setTimeout(() => { setResetandoId(null); setResetOk(false); setResetPassword('') }, 1800)
  }

  function flashGridSaved() {
    setGridSavedOk(true)
    setTimeout(() => setGridSavedOk(false), 2500)
  }

  // Cuántos períodos tipo 'hora' cubre una clase (rowspan)
  function calcSpan(clase: Horario, periodoInicio: Periodo, todosPeriodos: Periodo[]): number {
    const idx = todosPeriodos.findIndex(p => p.id === periodoInicio.id)
    let span = 1
    for (let i = idx + 1; i < todosPeriodos.length; i++) {
      const p = todosPeriodos[i]
      if (p.tipo !== 'hora') break
      if (clase.hora_fin > p.inicio) span++
      else break
    }
    return span
  }

  // Celdas cubiertas por un rowspan anterior en la misma columna
  function buildCoveredSet(dia: string, hsFiltrados: Horario[], todosPeriodos: Periodo[]): Set<string> {
    const covered = new Set<string>()
    for (const clase of hsFiltrados.filter(h => h.dia === dia)) {
      const startIdx = todosPeriodos.findIndex(p => p.tipo === 'hora' && p.inicio === clase.hora_inicio)
      if (startIdx === -1) continue
      for (let i = startIdx + 1; i < todosPeriodos.length; i++) {
        const p = todosPeriodos[i]
        if (p.tipo !== 'hora') break
        if (clase.hora_fin > p.inicio) covered.add(p.inicio)
        else break
      }
    }
    return covered
  }

  async function extenderClase(claseId: string, claseHoraFin: string, todosPeriodos: Periodo[]) {
    setHorarioError(''); setGridGuardando(true)
    const idx  = todosPeriodos.findIndex(p => p.tipo === 'hora' && p.inicio === claseHoraFin)
    const next = idx !== -1 ? todosPeriodos[idx] : todosPeriodos.find(p => p.tipo === 'hora' && p.inicio >= claseHoraFin)
    if (!next) { setGridGuardando(false); return }
    const { error } = await supabase.from('horarios').update({ hora_fin: next.fin }).eq('id', claseId)
    setGridGuardando(false)
    if (error) { setHorarioError(`No se pudo extender: ${error.message}`); return }
    await cargarHorarios()
    flashGridSaved()
  }

  async function encogerClase(claseId: string, periodoInicio: Periodo, todosPeriodos: Periodo[], span: number) {
    if (span <= 1) return
    setHorarioError(''); setGridGuardando(true)
    const idxInicio = todosPeriodos.findIndex(p => p.id === periodoInicio.id)
    let contHora = 0
    let nuevaFin  = periodoInicio.fin
    for (let i = idxInicio; i < todosPeriodos.length; i++) {
      const p = todosPeriodos[i]
      if (p.tipo !== 'hora') break
      contHora++
      if (contHora === span - 1) { nuevaFin = p.fin; break }
    }
    const { error } = await supabase.from('horarios').update({ hora_fin: nuevaFin }).eq('id', claseId)
    setGridGuardando(false)
    if (error) { setHorarioError(`No se pudo reducir: ${error.message}`); return }
    await cargarHorarios()
    flashGridSaved()
  }

  // ── PDF Horario ────────────────────────────────────────────────────────────

  async function buildPdfBlob(canvases: HTMLCanvasElement[]): Promise<Blob> {
    const pages: { jpg: Uint8Array; w: number; h: number }[] = []
    for (const c of canvases) {
      const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/jpeg', 0.92))
      pages.push({ jpg: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height })
    }
    const enc = new TextEncoder()
    const parts: Uint8Array[] = []
    let pos = 0
    const objOff: Record<number, number> = {}
    function t(s: string) { const b = enc.encode(s); parts.push(b); pos += b.length }
    function rb(b: Uint8Array) { parts.push(b); pos += b.length }
    const n = pages.length
    t('%PDF-1.4\n')
    objOff[1] = pos; t(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`)
    const kids = Array.from({ length: n }, (_, i) => `${3 + i} 0 R`).join(' ')
    objOff[2] = pos; t(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`)
    for (let i = 0; i < n; i++) {
      const { jpg, w, h } = pages[i]
      const wPt = ((w / 2) * 0.75).toFixed(2), hPt = ((h / 2) * 0.75).toFixed(2)
      const pi = 3 + i, ci = 3 + n + i, ii = 3 + 2 * n + i
      objOff[pi] = pos; t(`${pi} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Contents ${ci} 0 R /Resources << /XObject << /Im${i} ${ii} 0 R >> >> >>\nendobj\n`)
      const s = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im${i} Do Q`
      objOff[ci] = pos; t(`${ci} 0 obj\n<< /Length ${s.length} >>\nstream\n${s}\nendstream\nendobj\n`)
      const hdr = `${ii} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`
      objOff[ii] = pos; t(hdr); rb(jpg); t('\nendstream\nendobj\n')
    }
    const xOff = pos, tot = 3 * n + 2
    let xr = `xref\n0 ${tot + 1}\n0000000000 65535 f \n`
    for (let id = 1; id <= tot; id++) xr += `${String(objOff[id]).padStart(10, '0')} 00000 n \n`
    t(xr); t(`trailer\n<< /Size ${tot + 1} /Root 1 0 R >>\nstartxref\n${xOff}\n%%EOF`)
    const total = parts.reduce((a, b) => a + b.length, 0)
    const out = new Uint8Array(total); let off = 0
    for (const p of parts) { out.set(p, off); off += p.length }
    return new Blob([out], { type: 'application/pdf' })
  }

  async function crearCanvasHorario(
    titulo: string,
    subtitulo: string,
    hsList: Horario[],
    periodosH: Periodo[],
    asigList: Asignacion[],
    cicloNom: string,
  ): Promise<HTMLCanvasElement> {
    const WINE = '#6B1A1A', GOLD = '#C9A84C', WHITE = '#FFFFFF', GRAY = '#64748B'
    const hi5 = (s: string) => (s ?? '').slice(0, 5)
    const periodosEfectivos: Periodo[] = periodosH

    // ── Dimensiones landscape (≈ A4 apaisado: wPt ≈ 817 pts) ───────────────
    const W = 1090, COL_HORA = 100, nD = 5
    const COL_DIA = Math.floor((W - COL_HORA) / nD)   // ≈ 198 px por día
    const HDR_H = 78, GOLD_H = 3, INFO_H = 38, GHDR_H = 32
    const R_H = 56, R_B = 22, FOOT_H = 28

    const nHora  = periodosEfectivos.filter(p => p.tipo === 'hora').length
    const nBreak = periodosEfectivos.filter(p => p.tipo !== 'hora').length
    const GRID_H = nHora * R_H + nBreak * R_B
    const materiasUsed = [...new Set(hsList.map(h => h.materia).filter(Boolean))] as string[]
    const LEG_H = materiasUsed.length > 0 ? 32 : 0
    const H = HDR_H + GOLD_H + INFO_H + GHDR_H + GRID_H + LEG_H + FOOT_H + 8

    const canvas = document.createElement('canvas')
    canvas.width = W * 2; canvas.height = H * 2
    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2)
    ctx.fillStyle = WHITE; ctx.fillRect(0, 0, W, H)

    // ── Header vino ─────────────────────────────────────────────────────────
    ctx.fillStyle = WINE; ctx.fillRect(0, 0, W, HDR_H)

    // Logo box
    const lbS = 52, lbX = 16, lbY = 13
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 2
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.roundRect(lbX, lbY, lbS, lbS, 7); ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(lbX, lbY, lbS, lbS, 7); ctx.stroke()
    await new Promise<void>(resolve => {
      const img = new window.Image(); img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, lbX + 6, lbY + 6, lbS - 12, lbS - 12); resolve() }
      img.onerror = () => resolve()
      img.src = '/aceg-isotipo.png'
    })

    // Nombre de la escuela (izquierda)
    const tx = lbX + lbS + 14
    ctx.textAlign = 'left'
    ctx.fillStyle = '#FDF3DC'; ctx.font = 'bold 8px system-ui,sans-serif'
    ctx.fillText('ESCUELA GASTRONÓMICA', tx, 30)
    ctx.fillStyle = WHITE; ctx.font = 'bold 15px system-ui,sans-serif'
    ctx.fillText('ACEG', tx, 48)
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '500 8px system-ui,sans-serif'
    ctx.fillText('Juliaca · Puno · Perú', tx, 63)

    // Info docente/sección (derecha, alineada verticalmente en header)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = 'bold 8px system-ui,sans-serif'
    ctx.fillText('HORARIO DE CLASES', W - 16, 30)
    ctx.fillStyle = WHITE; ctx.font = 'bold 12px system-ui,sans-serif'
    ctx.fillText(titulo, W - 16, 48)
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '500 8.5px system-ui,sans-serif'
    ctx.fillText(subtitulo, W - 16, 63)

    // ── Gold bar ────────────────────────────────────────────────────────────
    ctx.fillStyle = GOLD; ctx.fillRect(0, HDR_H, W, GOLD_H)

    // ── Ciclo / info strip ──────────────────────────────────────────────────
    const iy = HDR_H + GOLD_H
    ctx.fillStyle = '#FDF9F0'; ctx.fillRect(0, iy, W, INFO_H)
    ctx.fillStyle = '#F0EDE8'; ctx.fillRect(0, iy + INFO_H - 1, W, 1)
    ctx.textAlign = 'center'
    ctx.fillStyle = WINE; ctx.font = 'bold 10px system-ui,sans-serif'
    ctx.fillText('HORARIO SEMANAL DE CLASES', W / 2, iy + INFO_H / 2 + 4)
    if (cicloNom) {
      ctx.textAlign = 'right'; ctx.fillStyle = '#8B6914'; ctx.font = '500 8px system-ui,sans-serif'
      ctx.fillText(`Ciclo: ${cicloNom}`, W - 16, iy + INFO_H / 2 + 4)
    }
    const now = new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'long', year: 'numeric' })
    ctx.textAlign = 'left'; ctx.fillStyle = GRAY; ctx.font = '500 7.5px system-ui,sans-serif'
    ctx.fillText(`Generado: ${now}`, 16, iy + INFO_H / 2 + 4)

    // ── Cabecera días ────────────────────────────────────────────────────────
    const gY = HDR_H + GOLD_H + INFO_H
    ctx.fillStyle = '#F3F0EC'; ctx.fillRect(0, gY, W, GHDR_H)
    ctx.fillStyle = '#DDD8D0'; ctx.fillRect(0, gY + GHDR_H - 1.5, W, 1.5)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#8B7355'; ctx.font = 'bold 8px system-ui,sans-serif'
    ctx.fillText('PERÍODO', COL_HORA / 2, gY + GHDR_H / 2 + 3.5)
    ctx.fillStyle = '#D0C8BF'; ctx.fillRect(COL_HORA - 1, gY, 1.5, GHDR_H)
    DIAS_SEMANA.forEach((dia, i) => {
      const x = COL_HORA + i * COL_DIA
      if (i > 0) { ctx.fillStyle = '#D8D3CB'; ctx.fillRect(x, gY, 1, GHDR_H) }
      ctx.fillStyle = WINE; ctx.font = 'bold 10px system-ui,sans-serif'
      ctx.fillText(dia, x + COL_DIA / 2, gY + GHDR_H / 2 + 4)
    })

    // ── Filas ────────────────────────────────────────────────────────────────
    function getColor(mat: string | null): string {
      if (!mat) return '#143875'
      return asigList.find(a => a.cursos?.nombre === mat)?.cursos?.color ?? '#143875'
    }

    // Celdas cubiertas por un span anterior (hora_inicio normalizada)
    const coveredByDia: Record<string, Set<string>> = {}
    for (const dia of DIAS_SEMANA) {
      const covered = new Set<string>()
      for (const cl of hsList.filter(h => h.dia === dia)) {
        const si = periodosEfectivos.findIndex(p => p.tipo === 'hora' && hi5(p.inicio) === hi5(cl.hora_inicio))
        if (si === -1) continue
        for (let i = si + 1; i < periodosEfectivos.length; i++) {
          const p = periodosEfectivos[i]
          if (p.tipo !== 'hora') break
          if (hi5(cl.hora_fin) > hi5(p.inicio)) covered.add(hi5(p.inicio)); else break
        }
      }
      coveredByDia[dia] = covered
    }

    // rowY pre-calculado por índice de período
    const rowYs: number[] = []
    let ry = gY + GHDR_H
    for (const p of periodosEfectivos) { rowYs.push(ry); ry += p.tipo !== 'hora' ? R_B : R_H }

    // Altura en px para un span (solo contiguas de tipo 'hora')
    function spanH(cl: Horario, pi: number): number {
      let h = R_H
      for (let i = pi + 1; i < periodosEfectivos.length; i++) {
        const p = periodosEfectivos[i]
        if (p.tipo !== 'hora') break
        if (hi5(cl.hora_fin) > hi5(p.inicio)) h += R_H; else break
      }
      return h
    }

    // PASO 1 — fondos, columna período, líneas divisoras
    for (let pi = 0; pi < periodosEfectivos.length; pi++) {
      const periodo = periodosEfectivos[pi]
      const isBreak = periodo.tipo !== 'hora'
      const rowY = rowYs[pi]
      const rH = isBreak ? R_B : R_H

      if (isBreak) {
        const bC = periodo.tipo === 'recreo'
          ? { bg: '#FFFBEB', txt: '#D97706', line: '#FDE68A' }
          : { bg: '#F0FDF4', txt: '#16A34A', line: '#BBF7D0' }
        ctx.fillStyle = bC.bg; ctx.fillRect(0, rowY, W, rH)
        ctx.fillStyle = bC.line; ctx.fillRect(0, rowY + rH - 1, W, 1)
        ctx.fillStyle = bC.txt; ctx.font = 'bold 8.5px system-ui,sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(`${periodo.nombre}   ·   ${hi5(periodo.inicio)} – ${hi5(periodo.fin)}`, W / 2, rowY + rH / 2 + 3.5)
      } else {
        ctx.fillStyle = '#F8F5F0'; ctx.fillRect(0, rowY, COL_HORA, rH)
        ctx.fillStyle = '#EDE9E3'; ctx.fillRect(0, rowY + rH - 1, W, 1)
        ctx.fillStyle = '#D0C8BF'; ctx.fillRect(COL_HORA - 1, rowY, 1.5, rH)
        ctx.textAlign = 'center'
        ctx.fillStyle = WINE; ctx.font = 'bold 9px system-ui,sans-serif'
        ctx.fillText(periodo.nombre, COL_HORA / 2, rowY + R_H * 0.35)
        ctx.fillStyle = GRAY; ctx.font = '700 8.5px monospace'
        ctx.fillText(`${hi5(periodo.inicio)} – ${hi5(periodo.fin)}`, COL_HORA / 2, rowY + R_H * 0.62)
        DIAS_SEMANA.forEach((_, i) => {
          const x = COL_HORA + i * COL_DIA
          if (i > 0) { ctx.fillStyle = '#E8E3DC'; ctx.fillRect(x, rowY, 1, rH) }
          ctx.fillStyle = i % 2 === 0 ? '#FAFAFA' : '#F7F5F2'
          ctx.fillRect(x + 1, rowY, COL_DIA - 1, rH)
        })
      }
    }

    // PASO 2 — tarjetas de clase encima (con span)
    for (let pi = 0; pi < periodosEfectivos.length; pi++) {
      const periodo = periodosEfectivos[pi]
      if (periodo.tipo !== 'hora') continue
      const rowY = rowYs[pi]

      DIAS_SEMANA.forEach((dia, i) => {
        if (coveredByDia[dia].has(hi5(periodo.inicio))) return
        const clase = hsList.find(h => h.dia === dia && hi5(h.hora_inicio) === hi5(periodo.inicio))
        if (!clase?.materia) return

        const x = COL_HORA + i * COL_DIA
        const sh = spanH(clase, pi)

        // Borrar divisores intermedios del span
        ctx.fillStyle = i % 2 === 0 ? '#FAFAFA' : '#F7F5F2'
        ctx.fillRect(x + 1, rowY, COL_DIA - 1, sh)

        const col = getColor(clase.materia)
        const pad = 5, px = x + pad, py = rowY + pad, pw = COL_DIA - pad * 2, ph = sh - pad * 2
        ctx.fillStyle = col + '22'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 7); ctx.fill()
        ctx.strokeStyle = col + '55'; ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 7); ctx.stroke()

        // Texto centrado horizontal y verticalmente
        ctx.textAlign = 'center'
        const cx = px + pw / 2
        const maxW = pw - 10

        ctx.font = 'bold 10px system-ui,sans-serif'; ctx.fillStyle = col
        let mat = clase.materia
        while (ctx.measureText(mat).width > maxW && mat.length > 3) mat = mat.slice(0, -1)
        if (mat !== clase.materia) mat += '…'

        const sec = clase.grado && clase.grupo
          ? `${clase.grado.replace(' Ciclo Cocina', ' Coc.').replace(' Ciclo Pastelería', ' Past.')} ${clase.grupo}`
          : (clase.docentes?.nombre ?? '')
        ctx.font = '500 8px system-ui,sans-serif'
        let s = sec
        while (s && ctx.measureText(s).width > maxW && s.length > 3) s = s.slice(0, -1)
        if (s !== sec) s += '…'

        // Calcular bloque total y centrarlo verticalmente
        const lh1 = 13, lh2 = 11, gap = 3
        const totalH = lh1 + (s ? gap + lh2 : 0)
        const startY = py + (ph - totalH) / 2 + lh1

        ctx.font = 'bold 10px system-ui,sans-serif'; ctx.fillStyle = col
        ctx.fillText(mat, cx, startY)
        if (s) {
          ctx.font = '500 8px system-ui,sans-serif'; ctx.fillStyle = '#64748B'
          ctx.fillText(s, cx, startY + gap + lh2)
        }
      })
    }

    let rowY = ry

    // ── Leyenda de cursos ────────────────────────────────────────────────────
    if (materiasUsed.length > 0) {
      ctx.fillStyle = '#F8F7F5'; ctx.fillRect(0, rowY, W, LEG_H)
      ctx.fillStyle = '#E8E4E0'; ctx.fillRect(0, rowY, W, 1)
      let lx = 16; const ly = rowY + 10
      ctx.font = 'bold 7.5px system-ui,sans-serif'
      for (const m of materiasUsed) {
        const col = getColor(m)
        ctx.fillStyle = col + '30'; ctx.beginPath(); ctx.roundRect(lx, ly, 9, 9, 2); ctx.fill()
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx + 4.5, ly + 4.5, 3, 0, Math.PI * 2); ctx.fill()
        ctx.textAlign = 'left'; ctx.fillStyle = col
        ctx.fillText(m, lx + 13, ly + 7.5)
        lx += ctx.measureText(m).width + 24
        if (lx > W - 100) break
      }
      rowY += LEG_H
    }

    // ── Footer ──────────────────────────────────────────────────────────────
    ctx.fillStyle = WINE; ctx.fillRect(0, rowY, W, FOOT_H + 8)
    ctx.fillStyle = GOLD; ctx.fillRect(0, rowY, W, 2)
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.font = '500 7.5px system-ui,sans-serif'
    ctx.fillText('Escuela Gastronómica ACEG — Juliaca, Puno, Perú', W / 2, rowY + FOOT_H / 2 + 10)

    return canvas
  }

  async function generarPdfHorario(tipo: 'docente-actual' | 'todos-docentes' | 'salon-actual' | 'todas-salones') {
    setGenerandoPdfH(true); setPdfMenuH(false)
    try {
      const cicloNom = ciclos.find(c => c.activo)?.nombre ?? ''
      const safe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '_')

      // Fetch period config fresh so all hours are visible
      const { data: cfgData } = await supabase.from('config').select('value').eq('key', 'periodos_horario').maybeSingle()
      let periodosConfig: Periodo[] = PERIODOS_DEFAULT
      if (cfgData?.value) { try { periodosConfig = JSON.parse(cfgData.value) } catch { /* keep default */ } }

      const canvases: HTMLCanvasElement[] = []

      if (tipo === 'docente-actual') {
        const docenteSelecN = docentesLean.find(d => d.id === docenteFiltroH)
        if (!docenteSelecN) return
        const { data: hsData } = await supabase
          .from('horarios').select('id,docente_id,dia,hora_inicio,hora_fin,materia,grado,grupo,docentes(nombre)')
          .eq('docente_id', docenteFiltroH).eq('activo', true).order('hora_inicio')
        const hsD = (hsData ?? []) as unknown as Horario[]
        const asigD = asignaciones.filter(a => a.docente_id === docenteFiltroH)
        canvases.push(await crearCanvasHorario(docenteSelecN.nombre, 'Docente', hsD, periodosConfig, asigD, cicloNom))
        const pdf = await buildPdfBlob(canvases)
        const a = document.createElement('a'); a.href = URL.createObjectURL(pdf)
        a.download = `Horario_${safe(docenteSelecN.nombre)}.pdf`; a.click()

      } else if (tipo === 'todos-docentes') {
        const { data: todosHs } = await supabase
          .from('horarios').select('id,docente_id,dia,hora_inicio,hora_fin,materia,grado,grupo,docentes(nombre)').eq('activo', true).order('hora_inicio')
        const hs = (todosHs ?? []) as unknown as Horario[]
        const docenteIds = [...new Set(hs.map(h => h.docente_id).filter(Boolean))] as string[]
        for (const did of docenteIds) {
          const hsD = hs.filter(h => h.docente_id === did)
          const nombre = hsD[0]?.docentes?.nombre ?? did
          const asigD = asignaciones.filter(a => a.docente_id === did)
          canvases.push(await crearCanvasHorario(nombre, 'Docente', hsD, periodosConfig, asigD, cicloNom))
        }
        const pdf = await buildPdfBlob(canvases)
        const a = document.createElement('a'); a.href = URL.createObjectURL(pdf)
        a.download = `Horarios_Todos_Docentes.pdf`; a.click()

      } else if (tipo === 'salon-actual') {
        const { data: hsData } = await supabase
          .from('horarios').select('id,docente_id,dia,hora_inicio,hora_fin,materia,grado,grupo,docentes(nombre)')
          .eq('grado', gradoFiltroH).eq('grupo', grupoFiltroH).eq('activo', true).order('hora_inicio')
        const hsS = (hsData ?? []) as unknown as Horario[]
        const asigS = asignaciones.filter(a => a.grado === gradoFiltroH && a.grupo === grupoFiltroH)
        canvases.push(await crearCanvasHorario(`${gradoFiltroH} — Sección ${grupoFiltroH}`, 'Grado y Sección', hsS, periodosConfig, asigS, cicloNom))
        const pdf = await buildPdfBlob(canvases)
        const a = document.createElement('a'); a.href = URL.createObjectURL(pdf)
        a.download = `Horario_${safe(gradoFiltroH)}_${grupoFiltroH}.pdf`; a.click()

      } else if (tipo === 'todas-salones') {
        const { data: todosHs } = await supabase
          .from('horarios').select('id,docente_id,dia,hora_inicio,hora_fin,materia,grado,grupo,docentes(nombre)').eq('activo', true).order('hora_inicio')
        const hs = (todosHs ?? []) as unknown as Horario[]
        const combos = [...new Set(hs.filter(h => h.grado && h.grupo).map(h => `${h.grado}|${h.grupo}`))]
          .sort((a, b) => {
            const [ag, aGr] = a.split('|'), [bg, bGr] = b.split('|')
            const gi = GRADOS.indexOf(ag) - GRADOS.indexOf(bg)
            return gi !== 0 ? gi : aGr.localeCompare(bGr)
          })
        for (const combo of combos) {
          const [grado, grupo] = combo.split('|')
          const hsS = hs.filter(h => h.grado === grado && h.grupo === grupo)
          const asigS = asignaciones.filter(a => a.grado === grado && a.grupo === grupo)
          canvases.push(await crearCanvasHorario(`${grado} — Sección ${grupo}`, 'Grado y Sección', hsS, periodosConfig, asigS, cicloNom))
        }
        const pdf = await buildPdfBlob(canvases)
        const a = document.createElement('a'); a.href = URL.createObjectURL(pdf)
        a.download = `Horarios_Todas_Secciones.pdf`; a.click()
      }
    } finally {
      setGenerandoPdfH(false)
    }
  }

  async function handleDropCelda(periodo: Periodo, dia: string) {
    // Usar ref para evitar race condition entre onDragEnd y onDrop
    const item = dragItemRef.current
    if (!item) return
    setHorarioError(''); setGridGuardando(true)
    const cellKey = `${dia}-${periodo.inicio}`
    setGuardandoCelda(cellKey)
    // En vista docente el grado/grupo vienen del item arrastrado
    const gradoTarget = item.grado ?? gradoFiltroH
    const grupoTarget = item.grupo ?? grupoFiltroH
    const existing = horarios.find(h =>
      h.dia === dia && h.hora_inicio === periodo.inicio &&
      h.grado === gradoTarget && h.grupo === grupoTarget
    )
    let error: { message: string } | null = null
    if (existing) {
      const res = await supabase.from('horarios').update({
        docente_id: item.docente_id,
        materia:    item.curso_nombre,
        hora_fin:   periodo.fin,
      }).eq('id', existing.id)
      error = res.error
    } else {
      const res = await supabase.from('horarios').insert({
        docente_id: item.docente_id,
        dia,
        hora_inicio: periodo.inicio,
        hora_fin:    periodo.fin,
        materia:     item.curso_nombre,
        grado:       gradoTarget,
        grupo:       grupoTarget,
      })
      error = res.error
    }
    dragItemRef.current = null
    setDragItem(null); setDragOver(null); setGuardandoCelda(null); setGridGuardando(false)
    if (error) {
      setHorarioError(`No se pudo guardar: ${error.message}. Verifica los permisos RLS en Supabase.`)
      return
    }
    await cargarHorarios()
    flashGridSaved()
  }

  function actualizarPeriodo(id: string, campo: keyof Periodo, valor: string) {
    setPeriodos(prev => prev.map(p => p.id === id ? { ...p, [campo]: valor } : p))
  }

  function eliminarPeriodo(id: string) {
    setPeriodos(prev => prev.filter(p => p.id !== id))
  }

  // Suma minutos a un string 'HH:MM'
  function sumarMinutos(hora: string, minutos: number): string {
    const [h, m] = hora.split(':').map(Number)
    const total  = h * 60 + m + minutos
    const hh     = Math.floor(total / 60) % 24
    const mm     = total % 60
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`
  }

  // Duración legible para N períodos de 45 min
  function duracionSpan(span: number): string {
    const mins  = span * 45
    const horas = Math.floor(mins / 60)
    const resto = mins % 60
    if (horas === 0) return `${mins} min`
    if (resto === 0) return `${horas}h`
    return `${horas}h ${resto}m`
  }

  function agregarPeriodo(tipo: 'hora' | 'recreo' | 'almuerzo') {
    const last     = periodos[periodos.length - 1]
    const inicio   = last?.fin ?? '12:35'
    const duracion = tipo === 'hora' ? 45 : tipo === 'recreo' ? 20 : 60
    const numHoras = periodos.filter(p => p.tipo === 'hora').length + 1
    const nombres  = { hora: `${numHoras}° hora`, recreo: 'Recreo', almuerzo: 'Almuerzo' }
    setPeriodos(prev => [...prev, {
      id: `custom-${Date.now()}`,
      nombre: nombres[tipo],
      inicio,
      fin: sumarMinutos(inicio, duracion),
      tipo,
    }])
  }

  async function handleEliminarHorario(id: string) {
    const h = horarios.find(x => x.id === id)
    if (!(await confirmar({
      titulo: '¿Eliminar esta clase del horario?',
      mensaje: h ? `${h.materia ?? 'Clase'} · ${h.dia} ${h.hora_inicio}–${h.hora_fin}${h.grado ? ` · ${h.grado} ${h.grupo}` : ''}` : undefined,
      tono: 'peligro', confirmarLabel: 'Eliminar clase',
    }))) return
    await supabase.from('horarios').delete().eq('id', id)
    setHorarios(prev => prev.filter(h => h.id !== id))
  }
  async function handleLogout() {
    await supabase.auth.signOut()
    document.cookie = 'habich-rol=; path=/; max-age=0'
    router.push('/login')
  }

  async function descargarPlantilla() {
    await descargarAOA('plantilla_docentes.xlsx', 'Docentes', [
      ['DNI','Nombres','Apellidos','Usuario','Contraseña','Celular','Cumpleaños'],
      ['12345678','Juan Carlos','García López','jgarcia','cambiar123','987654321','1990-05-15'],
      ['87654321','María Elena','Torres Ruiz','mtorres','cambiar123','912345678','1985-11-20'],
    ], [10,18,18,12,14,12,14])
  }

  async function descargarPlantillaAlumnos() {
    await descargarAOA('plantilla_alumnos.xlsx', 'Alumnos', [
      ['DNI','Nombre','Apellidos','Grado','Grupo','Celular Alumno','Celular Apoderado','Fecha Nacimiento','Sexo','Codigo'],
      ['12345678','Juan Carlos','García López','1ro','A','987654321','912345678','15/05/2010','M','2024001'],
      ['87654321','María Elena','Torres Ruiz','2do','B','976543210','965432109','22/08/2011','F','2024002'],
    ], [12, 18, 20, 8, 8, 16, 18, 16, 6, 12])
  }

  async function handleImportarAlumnos() {
    const file = fileRefAlumnos.current?.files?.[0]
    if (!file) return
    setImportAlumnosLoading(true)
    setImportAlumnosResult(null)
    const rows = await leerExcelAFilas(file)
    let ok = 0
    const errores: string[] = []
    const credenciales: { nombre: string; usuario: string; password: string }[] = []

    for (const row of rows) {
      const str       = (k: string) => String(row[k] ?? '').trim()
      const nombre    = str('Nombre')
      const apellidos = str('Apellidos')
      const dni       = str('DNI')
      const grado     = str('Grado')
      const grupo     = str('Grupo')

      if (!nombre || !dni) {
        errores.push(`Fila sin Nombre o DNI (${nombre || '?'}) — omitida`)
        continue
      }

      // Auto-generar usuario seguro aunque no haya apellidos
      const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const primerNombre   = norm(nombre.split(' ')[0])
      const primerApellido = norm((apellidos || '').split(' ')[0])
      const usuario        = primerApellido ? `${primerNombre}.${primerApellido}` : `${primerNombre}${dni.slice(-4)}`
      const password       = dni
      const authEmail      = `${usuario}@habich.alumno`
      const nombreCompleto = apellidos ? `${nombre} ${apellidos}` : nombre

      const { data, error } = await supabase.rpc('crear_alumno', {
        p_email: authEmail, p_password: password, p_nombre: nombre, p_apellidos: apellidos || '', p_usuario: usuario,
      })
      const yaExistia = typeof data?.error === 'string' && data.error.includes('ya está registrado')
      if ((error || data?.error) && !yaExistia) {
        errores.push(`${nombreCompleto}: ${data?.error ?? error?.message}`)
        continue
      }

      // Actualizar campos del alumno (buscar por email)
      const camposBase = {
        nombre,
        apellidos:         apellidos    || null,
        dni,
        usuario,
        grado:             grado        || null,
        grupo:             grupo        || null,
        celular:           str('Celular Alumno')    || null,
        celular_apoderado: str('Celular Apoderado') || null,
      }
      const fnFecha = () => { const v = str('Fecha Nacimiento'); if (!v) return null; const [d,m,y] = v.split('/'); return (d&&m&&y) ? `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` : null }
      const camposExtra = {
        fecha_nacimiento:  fnFecha(),
        sexo:              str('Sexo')    || null,
        codigo_estudiante: str('Codigo')  || null,
      }

      // Intentar con campos extra primero; si falla (columnas no migradas) sólo campos base
      const { error: upErr } = await supabase.from('alumnos').update({ ...camposBase, ...camposExtra }).eq('usuario', usuario)
      if (upErr) {
        await supabase.from('alumnos').update(camposBase).eq('usuario', usuario)
      }

      // Si el alumno YA existía, crear_alumno no toca la contraseña → quedaría
      // desalineada del DNI. La realineamos al DNI para mantener la convención.
      if (yaExistia && dni.length >= 6) {
        const { data: aluRow } = await supabase.from('alumnos').select('id').eq('usuario', usuario).maybeSingle()
        if (aluRow?.id) {
          await supabase.rpc('resetear_password', { p_user_id: aluRow.id, p_password: dni })
        }
      }

      credenciales.push({ nombre: nombreCompleto, usuario, password })
      ok++
    }

    setImportAlumnosResult({ ok, errores, credenciales })
    setImportAlumnosLoading(false)
    if (ok > 0) await cargarAlumnos(pageAlumnos, searchAlumnos)
  }

  async function descargarCredencialesAlumnos(credenciales: { nombre: string; usuario: string; password: string }[]) {
    await descargarAOA(
      `credenciales_alumnos_${new Date().toISOString().slice(0,10)}.xlsx`,
      'Credenciales',
      [
        ['Nombre completo', 'Usuario', 'Contraseña'],
        ...credenciales.map(c => [c.nombre, c.usuario, c.password]),
      ],
      [30, 20, 15],
    )
  }

  async function descargarReporteExcel() {
    setDescargandoExcel(true)
    const [y, m] = mesDescarga.split('-').map(Number)
    const ultimoDia = new Date(y, m, 0).getDate()
    const [{ data: asistRaw }, { data: horsExcel }] = await Promise.all([
      supabase
        .from('asistencias')
        .select('id,fecha_hora,docente_id,tipo,justificada')
        .gte('fecha_hora', new Date(`${mesDescarga}-01T00:00:00-05:00`).toISOString())
        .lte('fecha_hora', new Date(`${mesDescarga}-${String(ultimoDia).padStart(2,'0')}T23:59:59.999-05:00`).toISOString())
        .order('fecha_hora', { ascending: true }),
      supabase.from('horarios').select('docente_id,dia,hora_inicio').eq('activo', true),
    ])
    const data = await attachPersonas((asistRaw as unknown as Asistencia[]) ?? [])
    if (!data || data.length === 0) { setDescargandoExcel(false); alert('No hay registros para este mes.'); return }

    // Hora de entrada fija (docentes/administrativos sin horario): puntualidad de respaldo.
    const idsPresentes = Array.from(new Set(data.map(a => a.docente_id).filter(Boolean))) as string[]
    const horaEntradaFija = new Map<string, string>()
    if (idsPresentes.length) {
      const [{ data: dHE }, { data: aHE }] = await Promise.all([
        supabase.from('docentes').select('id,hora_entrada').in('id', idsPresentes),
        supabase.from('administrativos').select('id,hora_entrada').in('id', idsPresentes),
      ])
      for (const r of (dHE ?? []) as { id:string; hora_entrada:string|null }[]) if (r.hora_entrada) horaEntradaFija.set(r.id, String(r.hora_entrada).slice(0,5))
      for (const r of (aHE ?? []) as { id:string; hora_entrada:string|null }[]) if (r.hora_entrada && !horaEntradaFija.has(r.id)) horaEntradaFija.set(r.id, String(r.hora_entrada).slice(0,5))
    }
    setDescargandoExcel(false)

    const ExcelJS   = (await import('exceljs')).default
    const DIAS      = ['Lunes','Martes','Miércoles','Jueves','Viernes']
    const TOLERANCIA = 0
    const fmtD = (d: Date) => d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' })
    const mesLabel  = new Date(`${mesDescarga}-15`).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })

    // Colores
    const C_WINE     = 'FF6B1A1A'
    const C_WINE_MED = 'FF7F1D1D'
    const C_WINE_HDR = 'FF991B1B'
    const C_GOLD     = 'FFC9A84C'
    const C_GOLD_LT  = 'FFFDF3DC'
    const C_WHITE    = 'FFFFFFFF'
    const C_GRAY     = 'FF6B7280'
    const C_GRAY_LT  = 'FFF3F4F6'
    const C_TEXT     = 'FF1C1C1C'
    const C_GREEN    = 'FF059669'
    const C_GREEN_LT = 'FFecfdf5'
    const C_ORANGE   = 'FFea580c'
    const C_ORANGE_LT= 'FFfff7ed'

    // Mapa docente_id → dia → hora_inicio más temprana
    const horarioMap = new Map<string, Map<string, string>>()
    for (const h of (horsExcel ?? []) as { docente_id: string; dia: string; hora_inicio: string }[]) {
      if (!h.docente_id) continue
      if (!horarioMap.has(h.docente_id)) horarioMap.set(h.docente_id, new Map())
      const dm2 = horarioMap.get(h.docente_id)!
      const act = dm2.get(h.dia)
      if (!act || h.hora_inicio < act) dm2.set(h.dia, h.hora_inicio)
    }

    function colLetter(n: number): string {
      let s = ''
      while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
      return s
    }
    // 1 docente + 5 días × 3 cols = 16
    const NUM_COLS = 16
    const lastCol  = colLetter(NUM_COLS)

    function applyHdr(cell: import('exceljs').Cell, val: string, bg: string) {
      cell.value     = val
      cell.font      = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.border    = { top: { style: 'thin', color: { argb: C_GOLD } }, bottom: { style: 'medium', color: { argb: C_GOLD } }, left: { style: 'hair', color: { argb: bg } }, right: { style: 'hair', color: { argb: bg } } }
    }
    function fillAll(ws: import('exceljs').Worksheet, row: number, color: string) {
      for (let c = 1; c <= NUM_COLS; c++) ws.getRow(row).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    }

    // Agrupar por semana
    const semanas = new Map<string, { lunes: Date; viernes: Date; registros: typeof data }>()
    for (const a of data) {
      const fecha = new Date(a.fecha_hora)
      const dow   = fecha.getDay()
      const diff  = dow === 0 ? -6 : 1 - dow
      const lunes = new Date(fecha); lunes.setDate(fecha.getDate() + diff); lunes.setHours(0,0,0,0)
      const viernes = new Date(lunes); viernes.setDate(lunes.getDate() + 4)
      const key = lunes.toISOString().slice(0,10)
      if (!semanas.has(key)) semanas.set(key, { lunes, viernes, registros: [] })
      semanas.get(key)!.registros.push(a)
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Sistema ACEG'; wb.created = new Date()

    let logoId: number | null = null
    try {
      const res = await fetch('/aceg-isotipo.png')
      if (res.ok) { const buf = await res.arrayBuffer(); logoId = wb.addImage({ buffer: buf, extension: 'png' }) }
    } catch { /* sin logo */ }

    for (const [semKey, sem] of Array.from(semanas.entries()).sort((a,b) => a[0].localeCompare(b[0]))) {
      // Agrupar por docente
      const dm = new Map<string, { nombre: string; docenteId: string | null; dias: Map<number, { iso: string; tipo: string | null; justificada: boolean }[]> }>()
      for (const a of sem.registros) {
        const doc   = a.docentes as unknown as { nombre: string; email: string } | null
        const email = doc?.email ?? 'desconocido'
        const nom   = doc?.nombre ?? 'Desconocido'
        const dow   = new Date(a.fecha_hora).getDay()
        const idx   = dow - 1
        if (idx < 0 || idx > 4) continue
        if (!dm.has(email)) dm.set(email, { nombre: nom, docenteId: (a as unknown as { docente_id?: string }).docente_id ?? null, dias: new Map() })
        const entry = dm.get(email)!
        if (!entry.dias.has(idx)) entry.dias.set(idx, [])
        entry.dias.get(idx)!.push({ iso: a.fecha_hora, tipo: (a as unknown as { tipo?: string | null }).tipo ?? null, justificada: (a as unknown as { justificada?: boolean }).justificada ?? false })
      }
      const lista = Array.from(dm.values()).sort((a,b) => a.nombre.localeCompare(b.nombre))

      const sheetName = `${fmtD(sem.lunes).slice(0,5).replace(/\//g,'-')} al ${fmtD(sem.viernes).slice(0,5).replace(/\//g,'-')}`
      const ws = wb.addWorksheet(sheetName, {
        pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape', margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 } },
        views: [{ state: 'frozen', ySplit: 10 }],
      })

      // Anchos de columna
      ws.getColumn(1).width = 28
      for (let d = 0; d < 5; d++) {
        ws.getColumn(2 + d * 3).width = 9   // Entrada
        ws.getColumn(3 + d * 3).width = 9   // Salida
        ws.getColumn(4 + d * 3).width = 14  // Estado
      }

      /* ── Fila 1-2: cabecera institucional ── */
      ws.getRow(1).height = 42; ws.getRow(2).height = 22
      ws.mergeCells('A1:A2')
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WHITE } }
      ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
      ws.getCell('A1').border   = { right: { style: 'medium', color: { argb: C_GOLD } } }
      ws.mergeCells(`B1:${lastCol}1`)
      const r1 = ws.getCell('B1')
      r1.value = 'ESCUELA GASTRONÓMICA  ·  ACEG'
      r1.font  = { bold: true, size: 14, color: { argb: C_WHITE }, name: 'Calibri' }
      r1.alignment = { vertical: 'bottom', horizontal: 'center' }
      r1.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WINE } }
      ws.mergeCells(`B2:${lastCol}2`)
      const r2 = ws.getCell('B2')
      r2.value = 'Juliaca  ·  Puno  ·  Perú'
      r2.font  = { italic: true, size: 11, color: { argb: C_GOLD }, name: 'Calibri' }
      r2.alignment = { vertical: 'top', horizontal: 'center' }
      r2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WINE_MED } }
      if (logoId !== null) ws.addImage(logoId, { tl: { col: 0.08, row: 0.08 }, ext: { width: 74, height: 74 } })

      /* ── Fila 3: línea dorada ── */
      ws.getRow(3).height = 6; fillAll(ws, 3, C_GOLD)

      /* ── Fila 4: espaciador ── */
      ws.getRow(4).height = 6; fillAll(ws, 4, C_WHITE)

      /* ── Fila 5: título ── */
      ws.getRow(5).height = 26
      ws.mergeCells(`A5:${lastCol}5`)
      const r5 = ws.getCell('A5')
      r5.value = `Reporte de Asistencia Docente · ${mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}`
      r5.font  = { bold: true, size: 12, color: { argb: C_WINE }, name: 'Calibri' }
      r5.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }
      r5.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WHITE } }
      r5.border = { left: { style: 'thick', color: { argb: C_GOLD } } }

      /* ── Fila 6: semana + meta ── */
      ws.getRow(6).height = 17
      ws.mergeCells(`A6:${lastCol}6`)
      const r6 = ws.getCell('A6')
      const fechaGen = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
      r6.value = `Semana: ${fmtD(sem.lunes)} – ${fmtD(sem.viernes)}  ·  ${lista.length} docente${lista.length !== 1 ? 's' : ''}  ·  Generado el ${fechaGen}  ·  Sin tolerancia de puntualidad`
      r6.font  = { size: 9, color: { argb: C_GRAY }, name: 'Calibri' }
      r6.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }
      r6.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LT } }
      r6.border = { left: { style: 'thick', color: { argb: C_GOLD } } }

      /* ── Fila 7: espaciador ── */
      ws.getRow(7).height = 5; fillAll(ws, 7, C_WHITE)

      /* ── Leyenda (fila 8) ── */
      ws.getRow(8).height = 14
      fillAll(ws, 8, C_WHITE)
      ws.mergeCells('A8:D8')
      const leyenda = ws.getCell('A8')
      leyenda.value = '✔ A tiempo  |  ⏰ Tardanza  |  — Sin registro'
      leyenda.font  = { size: 8, color: { argb: C_GRAY }, name: 'Calibri', italic: true }
      leyenda.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }

      /* ── Fila 9: cabeceras de día (agrupadas) ── */
      ws.getRow(9).height = 20
      // Col A: "Docente"
      const hdrDocente = ws.getCell('A9')
      hdrDocente.value = 'DOCENTE'
      hdrDocente.font  = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' }
      hdrDocente.alignment = { vertical: 'middle', horizontal: 'center' }
      hdrDocente.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WINE_HDR } }
      hdrDocente.border = { top: { style: 'thin', color: { argb: C_GOLD } }, bottom: { style: 'thin', color: { argb: C_GOLD } } }
      ws.mergeCells('A9:A10')

      for (let d = 0; d < 5; d++) {
        const c1 = 2 + d * 3
        ws.mergeCells(`${colLetter(c1)}9:${colLetter(c1 + 2)}9`)
        const cell = ws.getCell(`${colLetter(c1)}9`)
        cell.value     = DIAS[d].toUpperCase()
        cell.font      = { bold: true, size: 10, color: { argb: C_WHITE }, name: 'Calibri' }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WINE_HDR } }
        cell.border    = { top: { style: 'thin', color: { argb: C_GOLD } }, bottom: { style: 'thin', color: { argb: C_GOLD } }, left: { style: 'medium', color: { argb: C_GOLD } }, right: { style: 'medium', color: { argb: C_GOLD } } }
      }

      /* ── Fila 10: sub-cabeceras (Entrada / Salida / Estado) ── */
      ws.getRow(10).height = 18
      for (let d = 0; d < 5; d++) {
        const labels = ['Entrada', 'Salida', 'Estado']
        for (let s = 0; s < 3; s++) {
          const col = 2 + d * 3 + s
          applyHdr(ws.getRow(10).getCell(col), labels[s], C_WINE_HDR)
        }
      }

      /* ── Filas de datos (desde fila 11) ── */
      lista.forEach((doc, rowIdx) => {
        const rowNum = 11 + rowIdx
        const isEven = rowIdx % 2 === 1
        const bg     = isEven ? C_GOLD_LT : C_WHITE
        ws.getRow(rowNum).height = 17

        // Columna Docente
        const docCell = ws.getRow(rowNum).getCell(1)
        docCell.value     = doc.nombre
        docCell.font      = { size: 10, bold: true, color: { argb: C_TEXT }, name: 'Calibri' }
        docCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
        docCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        docCell.border    = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } }, right: { style: 'medium', color: { argb: C_GOLD } } }

        for (let d = 0; d < 5; d++) {
          const marks     = doc.dias.get(d) ?? []
          const entradaM   = marks.find(m => m.tipo === 'entrada')
          const entradaISO = entradaM?.iso ?? ''
          const salidaM    = [...marks].reverse().find(m => m.tipo === 'salida')
          const salidaISO  = salidaM ? salidaM.iso : ''
          const entradaStr = entradaISO ? formatHora(entradaISO) : '—'
          const salidaStr  = salidaISO  ? formatHora(salidaISO)  : '—'

          // Estado y colores
          let estadoTxt = '—'
          let estadoBg  = bg
          let estadoFg  = C_GRAY
          if (entradaISO && doc.docenteId) {
            const horaEsp = horarioMap.get(doc.docenteId)?.get(DIAS[d]) ?? horaEntradaFija.get(doc.docenteId)
            if (horaEsp) {
              const fechaLima = new Date(entradaISO).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
              const mins = calcularMinutosTarde(entradaISO, horaEsp, fechaLima)
              if (mins > TOLERANCIA && entradaM?.justificada) {
                estadoTxt = `✔ Justificada (${mins} min)`
                estadoBg  = C_GREEN_LT
                estadoFg  = C_GREEN
              } else if (mins > TOLERANCIA) {
                estadoTxt = `⏰ ${mins} min tarde`
                estadoBg  = C_ORANGE_LT
                estadoFg  = C_ORANGE
              } else {
                estadoTxt = '✔ A tiempo'
                estadoBg  = C_GREEN_LT
                estadoFg  = C_GREEN
              }
            }
          }

          const colBase = 2 + d * 3
          const dayBg   = isEven ? C_GOLD_LT : C_WHITE

          // Entrada
          const eCell = ws.getRow(rowNum).getCell(colBase)
          eCell.value     = entradaStr
          eCell.font      = { size: 10, color: { argb: entradaISO ? C_TEXT : C_GRAY }, name: 'Calibri' }
          eCell.alignment = { vertical: 'middle', horizontal: 'center' }
          eCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: dayBg } }
          eCell.border    = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } }, left: { style: 'medium', color: { argb: C_GOLD } } }

          // Salida
          const sCell = ws.getRow(rowNum).getCell(colBase + 1)
          sCell.value     = salidaStr
          sCell.font      = { size: 10, color: { argb: salidaISO ? C_TEXT : C_GRAY }, name: 'Calibri' }
          sCell.alignment = { vertical: 'middle', horizontal: 'center' }
          sCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: dayBg } }
          sCell.border    = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }

          // Estado
          const estCell = ws.getRow(rowNum).getCell(colBase + 2)
          estCell.value     = estadoTxt
          estCell.font      = { size: 9, bold: estadoTxt !== '—', color: { argb: estadoFg }, name: 'Calibri' }
          estCell.alignment = { vertical: 'middle', horizontal: 'center' }
          estCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: estadoBg } }
          estCell.border    = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } }, right: { style: 'medium', color: { argb: C_GOLD } } }
        }
      })

      /* ── Fila resumen ── */
      const totalRow = 11 + lista.length
      ws.getRow(totalRow).height = 18
      ws.mergeCells(`A${totalRow}:${lastCol}${totalRow}`)
      const totalCell = ws.getCell(`A${totalRow}`)
      const tardanzas = lista.filter(doc => {
        for (let d = 0; d < 5; d++) {
          const marks = doc.dias.get(d) ?? []
          const entradaMark = marks.find(m => m.tipo === 'entrada')
          const entradaISO = entradaMark?.iso
          if (!entradaISO || !doc.docenteId || entradaMark?.justificada) continue
          const horaEsp = horarioMap.get(doc.docenteId)?.get(DIAS[d]) ?? horaEntradaFija.get(doc.docenteId)
          if (!horaEsp) continue
          const fechaLima = new Date(entradaISO).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
          if (calcularMinutosTarde(entradaISO, horaEsp, fechaLima) > TOLERANCIA) return true
        }
        return false
      }).length
      totalCell.value = `${lista.length} docente${lista.length !== 1 ? 's' : ''} registrados  ·  ${tardanzas} con tardanza esta semana`
      totalCell.font  = { bold: true, size: 10, color: { argb: C_WINE }, name: 'Calibri' }
      totalCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 2 }
      totalCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GOLD_LT } }
      totalCell.border = { top: { style: 'medium', color: { argb: C_GOLD } }, bottom: { style: 'thin', color: { argb: C_GOLD } } }

      void semKey
    }

    // Descargar
    const buf  = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href     = URL.createObjectURL(blob)
    link.download = `asistencia_docentes_${mesDescarga}.xlsx`
    link.click()
  }

  async function handleImportar() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setImportLoading(true); setImportResult(null)
    const rows = await leerExcelAFilas(file)
    let ok = 0; const errores: string[] = []
    for (const row of rows) {
      const str = (k: string) => String(row[k] ?? '').trim()
      const nombres        = str('Nombres')
      const apellidos      = str('Apellidos')
      const usuario        = str('Usuario')
      const password       = str('Contraseña') || 'cambiar123'
      const nombreCompleto = [nombres, apellidos].filter(Boolean).join(' ')
      if (!usuario || !nombreCompleto) { errores.push('Fila sin nombre o usuario — omitida'); continue }
      const authEmail = `${usuario.toLowerCase()}@habich.sys`

      const { data, error } = await supabase.rpc('crear_docente', {
        p_email: authEmail, p_password: password, p_nombre: nombreCompleto,
      })
      const yaExistia = typeof data?.error === 'string' && data.error.includes('ya está registrado')
      if ((error || data?.error) && !yaExistia) {
        errores.push(`${nombreCompleto}: ${data?.error ?? error?.message}`)
        continue
      }

      const { error: updateError } = await supabase.from('docentes').update({
        apellido:   apellidos      || null,
        dni:        str('DNI')     || null,
        usuario:    usuario        || null,
        celular:    str('Celular') || null,
        cumpleanos: str('Cumpleaños') || null,
        correo:     str('Correo')  || null,
        grado:      str('Grado')   || null,
        grupo:      str('Grupo')   || null,
      }).eq('email', authEmail)

      if (updateError) {
        errores.push(`${nombreCompleto}: error al guardar datos (${updateError.message})`)
        continue
      }
      ok++
    }
    setImportResult({ ok, errores })
    setImportLoading(false)
    if (ok > 0) await cargarDocentes()
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: '#f7f5f1' }}>
      <div className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-white"
        style={{ boxShadow: '0 16px 48px rgba(11,36,71,.08)', border: '1.5px solid #E4E8EF' }}>
        <Spinner cls="h-8 w-8 text-indigo-900" />
        <p className="text-slate-400 text-sm font-medium">Cargando panel...</p>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  const card = {
    background: 'white',
    border: '1.5px solid #E4E8EF',
    boxShadow: '0 4px 20px rgba(11,36,71,.05)',
  }

  const accentBar = (
    <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #0B2447, #1E3A8A, #1E40AF)' }} />
  )

  const pendientes = justificaciones.filter(j => j.estado === 'pendiente').length

  type NavGroup = {
    titulo: string
    items: {
      id: Tab | string
      label: string
      icon: React.ReactNode
      count?: number | null
      badge?: boolean
      soon?: boolean
      href?: string
    }[]
  }

  const navGroups: NavGroup[] = [
    {
      titulo: 'Usuarios',
      items: [
        { id: 'docentes', label: 'Docentes', count: totalDocentes,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg> },
        { id: 'alumnos',  label: 'Alumnos',  count: totalAlumnos,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg> },
        { id: 'admins',   label: 'Admins',   count: admins.length,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg> },
        { id: 'salones', label: 'Salones y Estudiantes',
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21V8l9-6 9 6v13M9 21V12h6v9M3 21h18"/></svg> },
      ],
    },
    {
      titulo: 'Académico',
      items: [
        { id: 'cursos',  label: 'Cursos',  count: cursos.length,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg> },
        { id: 'horario', label: 'Horarios activos', count: horarios.length,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
        { id: 'horas-docente', label: 'Horas Docente',
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
        { id: 'boletines', label: 'Boletines',
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> },
        // Solo administradores: crear periodos y subir notas visibles en la consulta de notas
        ...(esAdminUser ? [{ id: 'notas-padres', label: 'Libreta de Notas',
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="9" r="6"/><path strokeLinecap="round" strokeLinejoin="round" d="m9 15-2 7 5-3 5 3-2-7"/></svg> }] : []),
      ],
    },
    {
      titulo: 'Asistencia',
      items: [
        { id: 'escaner-alumnos',  label: 'Escáner QR',       count: null,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg> },
        { id: 'asist-alumnos',   label: 'Asistencia Estudiantes', count: null,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg> },
        { id: 'estadisticas-asistencia', label: 'Estadísticas de Asistencia', count: null,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6m3 6V7m3 10v-3m2 7H7a2 2 0 01-2-2V5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2z"/></svg> },
        { id: 'reporte',          label: 'Reporte Docentes', count: null,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> },
        { id: 'justificaciones', label: 'Justificaciones', count: pendientes > 0 ? pendientes : null, badge: pendientes > 0,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> },
        { id: 'qr',              label: 'Marcado GPS',  count: null,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg> },
        { id: 'marcar-asistencia', label: 'Marcar Asistencia', count: null,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg> },
      ],
    },
    {
      titulo: 'Año Escolar',
      items: [
        { id: 'anio-escolar', label: 'Guía del Año Escolar',
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg> },
        { id: 'ciclos',    label: 'Ciclos Académicos', count: ciclos.length || null,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg> },
        { id: 'matricula', label: 'Matrícula',
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg> },
        { id: 'planificacion', label: 'Planificación de cursos',
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4"/></svg> },
      ],
    },
    {
      titulo: 'Herramientas',
      items: [
        { id: 'simular', label: 'Simular Docente',
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> },
        { id: 'buscar-alumnos', label: 'Buscar Estudiantes',
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-3.5-3.5M11 8.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM7 14.5c.5-1.2 2-2 4-2s3.5.8 4 2"/></svg> },
        { id: 'auditoria', label: 'Auditoría', count: null,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg> },
      ],
    },
    {
      titulo: 'Comunicación',
      items: [
        { id: 'comunicados', label: 'Comunicados', count: anuncios.length || null,
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg> },
        { id: 'landing-ext',     label: 'Web de la Escuela', href: '/admin/landing',
          icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064"/></svg> },
      ],
    },
  ]

  // ── Permisos: lista plana de módulos (para la pantalla de gestión) ─────────
  const MODULOS_PLANOS = navGroups.flatMap(g => g.items.map(i => ({ id: String(i.id), label: i.label, grupo: g.titulo })))
    .filter(m => m.id !== 'marcar-asistencia')   // siempre visible: no se gestiona por permisos
    .filter(m => m.id !== 'notas-padres')        // exclusivo de administradores: no asignable a administrativos

  // ¿El usuario actual puede ver este módulo? (super o sin restricción → sí)
  // El módulo 'permisos' es exclusivo del super admin.
  const puedeVer = (id: string | number) => {
    if (String(id) === 'permisos') return esSuper
    // Marcar la propia asistencia es universal para todo el personal del panel
    // (paridad con el portal docente); no depende de módulos asignados.
    if (String(id) === 'marcar-asistencia') return true
    return esSuper || modulosPermitidos === null || modulosPermitidos.has(String(id))
  }

  // navGroups visibles según permisos + módulo "Permisos" solo para super admin
  const navGroupsConSistema: NavGroup[] = esSuper
    ? [...navGroups, { titulo: 'Sistema', items: [
        { id: 'permisos', label: 'Permisos', icon: (
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        ) },
      ] }]
    : navGroups
  const navGroupsVisible: NavGroup[] = navGroupsConSistema
    .map(g => ({ ...g, items: g.items.filter(it => puedeVer(it.id)) }))
    .filter(g => g.items.length > 0)

  // ── Gestión de permisos (solo super admin) ────────────────────────────────
  const abrirPermisos = (userId: string) => {
    const cfg = permisosMap[userId]
    // Sin configurar → arranca con TODOS marcados (es el default real).
    const base = cfg?.configurado ? cfg.modulos : MODULOS_PLANOS.map(m => m.id)
    setPermUserSel(userId)
    setPermEdit(new Set(base))
    setPermOk(false)
  }
  const togglePermModulo = (id: string) => {
    setPermEdit(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  const guardarPermisos = async () => {
    if (!permUserSel) return
    setPermGuardando(true)
    const mods = Array.from(permEdit)
    const { data, error } = await supabase.rpc('set_permisos_usuario', { p_user_id: permUserSel, p_modulos: mods })
    setPermGuardando(false)
    if (error || (data as { error?: string })?.error) { alert((data as { error?: string })?.error ?? 'Error al guardar permisos.'); return }
    setPermisosMap(prev => ({ ...prev, [permUserSel]: { configurado: true, modulos: mods } }))
    setPermOk(true)
    setTimeout(() => setPermOk(false), 1800)
  }

  const switchTab = (id: Tab) => { if (!puedeVer(id)) { setView('menu'); return } setTab(id); setView('content'); setMostrarForm(false); setMostrarImport(false); setFormOk(''); setFormError(''); setImportResult(null); setMostrarHorarioForm(false); setMostrarCursoForm(false); setDocenteAsigAbierto(null) }
  const irAlMenu = () => { setView('menu'); setSubmenuGroupId(null) }

  // ── Iconos para cuadrados de categoría (menú principal) ────────────────────
  const GROUP_ICONS: Record<string, React.ReactNode> = {
    'Usuarios': (
      <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z"/>
      </svg>
    ),
    'Académico': (
      <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
      </svg>
    ),
    'Asistencia': (
      <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
      </svg>
    ),
    'Año Escolar': (
      <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 16l2 2 4-4"/>
      </svg>
    ),
    'Herramientas': (
      <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
    ),
    'Comunicación': (
      <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
      </svg>
    ),
    'Sistema': (
      <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
      </svg>
    ),
  }

  const GROUP_DESC: Record<string, string> = {
    'Usuarios':            'Docentes, estudiantes, admins y salones',
    'Académico':           'Cursos, horarios, boletines y libreta de notas',
    'Asistencia':          'Marcado, reportes, QR y justificaciones',
    'Año Escolar':         'Todo el nuevo año en orden: ciclo, matrícula, planificación y horario',
    'Herramientas':        'Simulación, búsqueda y auditoría',
    'Comunicación':        'Anuncios y portal público',
    'Sistema':             'Permisos por módulos de cada usuario',
  }

  // ── Entrar a un área: setea el grupo y abre el primer módulo navegable ────
  const entrarArea = (groupId: string) => {
    const group = navGroupsVisible.find(g => g.titulo === groupId)
    if (!group) return
    const primer = group.items.find(it => !it.soon && !it.href)
    setSubmenuGroupId(groupId)
    if (primer) {
      switchTab(primer.id as Tab)
    } else {
      const ext = group.items.find(it => !it.soon && it.href)
      if (ext?.href) router.push(ext.href)
    }
  }

  // ── Vista MENÚ de áreas ────────────────────────────────────────────────────
  if (view === 'menu') {
    const groupCards: MenuCard[] = navGroupsVisible.map(g => ({
      id: g.titulo,
      label: g.titulo,
      description: GROUP_DESC[g.titulo],
      icon: GROUP_ICONS[g.titulo],
      onClick: () => entrarArea(g.titulo),
    }))
    const primerNombre = (adminNombre || '').split(' ')[0] || 'administrador'
    return (
      <PortalMenuFoto
        title="ACEG"
        subtitle="Panel de Administración"
        greeting={`Bienvenido, ${primerNombre}`}
        userName={adminNombre}
        userRoleLabel="Administrador"
        cards={groupCards}
        onLogout={handleLogout}
        accent="#0B2447"
        accent2="#1E40AF"
      />
    )
  }

  // ── Vista CONTENIDO (módulo seleccionado) ──────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: '#f7f5f1' }}>

      {/* Decorative blobs — ocultos en móvil: blur(90-100px) fijo pesa al scrollear */}
      <div className="hidden sm:block fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-15 translate-x-1/3 -translate-y-1/3"
          style={{ background: 'radial-gradient(circle, #f9c8ce, #E2E8F0)', filter: 'blur(90px)' }} />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-10 -translate-x-1/4 translate-y-1/4"
          style={{ background: 'radial-gradient(circle, #fde68a, #fef3c7)', filter: 'blur(80px)' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 rounded-full opacity-8 -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'radial-gradient(circle, #fee2e2, #fff7ed)', filter: 'blur(100px)' }} />
      </div>

      {/* Header con botón Inicio + título de sección + Salir */}
      <header className="sticky top-0 z-50"
        style={{ background: 'white', borderBottom: '1px solid #E4E8EF', boxShadow: '0 1px 12px rgba(11,36,71,.06)', borderTop: '3px solid #0B2447' }}>
        <div className="flex items-center justify-between px-4 py-3 w-full gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={irAlMenu}
              className="flex items-center gap-2 text-xs font-black px-3 py-2 rounded-xl transition-all shrink-0"
              style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3', color: '#0B2447', letterSpacing: '.04em' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#E2E8F0' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#F1F5F9' }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Inicio
            </button>
            <div className="min-w-0">
              {(() => {
                const currentItem = navGroupsVisible.flatMap(g => g.items.map(i => ({ ...i, group: g.titulo }))).find(i => i.id === tab)
                return (
                  <>
                    <p className="text-slate-800 font-black text-sm leading-tight truncate">
                      {currentItem?.label ?? 'Panel de Administración'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 truncate">
                      {currentItem?.group ?? 'Admin'} · Hola, <span style={{ color: '#0B2447' }}>{adminNombre}</span>
                    </p>
                  </>
                )
              })()}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => switchTab('marcar-asistencia')}
              title="Marcar mi asistencia"
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: '#EFF3FA', border: '1.5px solid #b6c5e3', color: '#0B2447' }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
              </svg>
              <span className="whitespace-nowrap">Marcar asistencia</span>
            </button>
            <CambiarPassword tone="light" accent="#0B2447" />
            <button onClick={handleLogout}
              className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3', color: '#0B2447' }}>
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* ── Body: sidebar contextual del área + contenido ────────────────── */}
      <div className="relative z-10 flex flex-1">

        {/* Sidebar contextual: SOLO los módulos del área activa */}
        {submenuGroupId && (() => {
          const group = navGroupsVisible.find(g => g.titulo === submenuGroupId)
          if (!group) return null
          return (
            <aside className="hidden lg:flex flex-col w-60 shrink-0 sticky top-16 self-start overflow-y-auto"
              style={{ height: 'calc(100vh - 64px)', background: 'white', borderRight: '1px solid #E4E8EF', boxShadow: '2px 0 16px rgba(11,36,71,.04)' }}>
              <div className="px-5 pt-5 pb-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Área</p>
                <p className="text-base font-black" style={{ color: '#0B2447' }}>{group.titulo}</p>
                <button onClick={irAlMenu}
                  className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
                  style={{ color: '#a8a29e' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#0B2447' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#a8a29e' }}>
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Cambiar de área
                </button>
              </div>
              <div className="border-t border-slate-100 mx-3" />
              <nav className="px-3 pt-3 pb-6 space-y-0.5">
                {group.items.map(t => {
                  const isActive = tab === t.id && !t.href
                  return (
                    <button key={t.id}
                      onClick={() => { if (t.href) router.push(t.href); else if (!t.soon) switchTab(t.id as Tab) }}
                      disabled={!!t.soon}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-all"
                      style={
                        t.soon
                          ? { color: '#cbd5e1', cursor: 'default' }
                          : isActive
                          ? { background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white', boxShadow: '0 4px 14px rgba(11,36,71,.22)' }
                          : { color: '#57534e' }
                      }
                      onMouseEnter={e => { if (!t.soon && !isActive) e.currentTarget.style.background = '#F8FAFC' }}
                      onMouseLeave={e => { if (!t.soon && !isActive) e.currentTarget.style.background = 'transparent' }}>
                      <span style={{ color: t.soon ? '#d1c7c0' : isActive ? 'rgba(255,255,255,.85)' : '#a8a29e' }}>
                        {t.icon}
                      </span>
                      <span className="flex-1 font-semibold">{t.label}</span>
                      {t.soon ? (
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: '#f5f0ec', color: '#a8a29e' }}>
                          PRONTO
                        </span>
                      ) : t.href ? (
                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
                          style={{ color: isActive ? 'rgba(255,255,255,.7)' : '#cbd5e1' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                        </svg>
                      ) : t.count != null ? (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md"
                          style={isActive ? { background: 'rgba(255,255,255,.22)', color: 'white' } : { background: '#fef3c7', color: '#92400e' }}>
                          {t.count}
                        </span>
                      ) : t.badge ? (
                        <span className="w-2 h-2 rounded-full" style={{ background: '#1E40AF' }} />
                      ) : null}
                    </button>
                  )
                })}
              </nav>
            </aside>
          )
        })()}

        {/* Content */}
        <main className="flex-1 px-4 lg:px-6 py-6 min-w-0">

          {/* Sub-nav móvil del área (scroll horizontal) — sólo en mobile */}
          {submenuGroupId && (() => {
            const group = navGroupsVisible.find(g => g.titulo === submenuGroupId)
            if (!group) return null
            return (
              <div className="lg:hidden flex gap-1.5 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
                {group.items.filter(it => !it.soon).map(t => (
                  <button key={t.id} onClick={() => { if (t.href) router.push(t.href); else switchTab(t.id as Tab) }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-all"
                    style={tab === t.id && !t.href
                      ? { background: 'linear-gradient(135deg, #0B2447, #1E3A8A)', color: 'white', boxShadow: '0 4px 14px rgba(11,36,71,.28)' }
                      : { background: 'white', border: '1.5px solid #E4E8EF', color: '#57534e' }}>
                    <span style={{ color: tab === t.id && !t.href ? 'rgba(255,255,255,.8)' : '#a8a29e' }}>{t.icon}</span>
                    <span>{t.label}</span>
                    {t.count != null && (
                      <span className="ml-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black"
                        style={tab === t.id ? { background: 'rgba(255,255,255,.22)', color: 'white' } : { background: '#fef3c7', color: '#92400e' }}>
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )
          })()}

          <div className={tab === 'horario' || tab === 'buscar-alumnos' || tab === 'planificacion' || tab === 'notas-padres' ? 'w-full' : 'max-w-5xl mx-auto'}>

        {/* ══ PERMISOS (solo super admin) ══════════════════════════════════════ */}
        {tab === 'permisos' && esSuper && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5" style={card}>
              <h2 className="text-lg font-black text-slate-800">Permisos por módulos</h2>
              <p className="text-[13px] text-slate-500 mt-1">Elige qué módulos puede ver cada administrador o administrativo. Solo tú (super admin) ves esta sección.</p>
            </div>
            <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
              {/* Lista de personal */}
              <div className="rounded-2xl p-3 space-y-1.5 max-h-[72vh] overflow-y-auto" style={card}>
                {permStaff.length === 0 && <p className="text-[13px] text-slate-400 p-3">Cargando personal…</p>}
                {permStaff.map(u => {
                  const cfg = permisosMap[u.id]
                  const resumen = u.super ? 'Todos (super admin)' : !cfg?.configurado ? 'Todos (sin configurar)' : `${cfg.modulos.length} módulo(s)`
                  const sel = permUserSel === u.id
                  return (
                    <button key={u.id} onClick={() => { if (!u.super) abrirPermisos(u.id) }} disabled={u.super}
                      className="w-full text-left rounded-xl px-3 py-2.5 transition-colors"
                      style={{ background: sel ? '#eef2ff' : u.super ? '#f8fafc' : 'white', border: `1px solid ${sel ? '#c7d2fe' : '#E4E8EF'}`, cursor: u.super ? 'default' : 'pointer', opacity: u.super ? .65 : 1 }}>
                      <p className="text-[13px] font-bold text-slate-800 truncate">{u.nombre}</p>
                      <p className="text-[11px] text-slate-400">{u.tipo}{u.usuario ? ` · ${u.usuario}` : ''}</p>
                      <p className="text-[11px] font-semibold mt-0.5" style={{ color: u.super ? '#7c3aed' : '#0d9488' }}>{resumen}</p>
                    </button>
                  )
                })}
              </div>
              {/* Editor de módulos */}
              <div className="rounded-2xl p-4" style={card}>
                {!permUserSel ? (
                  <div className="flex items-center justify-center h-40 text-[13px] text-slate-400">Selecciona un usuario para configurar sus módulos.</div>
                ) : (() => {
                  const u = permStaff.find(s => s.id === permUserSel)
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-[14px] font-black text-slate-800">{u?.nombre}</p>
                          <p className="text-[11px] text-slate-400">{u?.tipo}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setPermEdit(new Set(MODULOS_PLANOS.map(m => m.id)))} className="text-[11px] font-bold px-3 py-1.5 rounded-lg" style={{ background: '#f1f5f9', color: '#334155' }}>Marcar todos</button>
                          <button onClick={() => setPermEdit(new Set())} className="text-[11px] font-bold px-3 py-1.5 rounded-lg" style={{ background: '#f1f5f9', color: '#334155' }}>Ninguno</button>
                        </div>
                      </div>
                      {navGroups.map(g => (
                        <div key={g.titulo}>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">{g.titulo}</p>
                          <div className="grid sm:grid-cols-2 gap-1.5">
                            {g.items.map(it => {
                              const id = String(it.id); const on = permEdit.has(id)
                              return (
                                <label key={id} className="flex items-center gap-2.5 rounded-xl px-3 py-2 cursor-pointer" style={{ background: on ? '#ecfdf5' : '#f8fafc', border: `1px solid ${on ? '#a7f3d0' : '#E4E8EF'}` }}>
                                  <input type="checkbox" checked={on} onChange={() => togglePermModulo(id)} className="accent-teal-600" />
                                  <span className="text-[12.5px] font-semibold text-slate-700">{it.label}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-3 pt-2">
                        <button onClick={guardarPermisos} disabled={permGuardando}
                          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: '#0d9488', opacity: permGuardando ? .6 : 1 }}>
                          {permGuardando ? 'Guardando…' : 'Guardar permisos'}
                        </button>
                        {permOk && <span className="text-[12px] font-bold text-emerald-600">✓ Guardado</span>}
                        <span className="text-[11px] text-slate-400">{permEdit.size} de {MODULOS_PLANOS.length} módulos</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ══ REPORTE ══════════════════════════════════════════════════════════ */}
        {tab === 'reporte' && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden" style={card}>
              {accentBar}
              <div className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1">
                    <label className={labelCls}>Filtrar por fecha</label>
                    <input type="date" value={fechaFiltro} max={fechaHoyLima()}
                      onChange={e => setFechaFiltro(e.target.value)}
                      className={inputCls} />
                  </div>
                  <button onClick={cargarReporte} disabled={loadingReporte}
                    className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
                    style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3', color: '#0B2447' }}>
                    {loadingReporte ? <Spinner cls="h-4 w-4 text-indigo-900"/> : (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    Actualizar
                  </button>
                </div>
              </div>
            </div>

            {/* Descargar Excel */}
            <div className="rounded-2xl overflow-hidden" style={card}>
              {accentBar}
              <div className="p-5 space-y-4">
                {/* Descarga formato actual */}
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1">
                    <label className={labelCls}>Descargar por mes</label>
                    <input type="month" value={mesDescarga}
                      max={fechaHoyLima().slice(0,7)}
                      onChange={e => setMesDescarga(e.target.value)}
                      className={inputCls} />
                  </div>
                  <button onClick={descargarReporteExcel} disabled={descargandoExcel}
                    className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #0B2447 0%, #1E3A8A 100%)', color: 'white', boxShadow: '0 4px 14px rgba(11,36,71,.3)' }}>
                    {descargandoExcel ? <Spinner cls="h-4 w-4 text-white"/> : (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    )}
                    {descargandoExcel ? 'Generando...' : 'Descargar Excel'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 -mt-1">Una hoja por semana (lunes a viernes) · entrada y salida por día</p>

                {/* Separador */}
                <div className="border-t border-dashed border-slate-200" />

                {/* Descarga Formato Oficial MINEDU */}
                <div className="flex flex-col gap-3">
                  {/* Subir plantilla */}
                  <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#fafafa', border: '1.5px dashed #e2e8f0' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-600">Plantilla Excel</p>
                      {plantillaNombre ? (
                        <p className="text-[11px] text-emerald-600 font-semibold truncate mt-0.5">
                          <span className="mr-1">✓</span>{plantillaNombre}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 mt-0.5">Sin plantilla — se genera formato estándar</p>
                      )}
                      {plantillaOk && <p className="text-[11px] text-emerald-600 font-bold mt-0.5">{plantillaOk}</p>}
                    </div>
                    <input ref={plantillaRef} type="file" accept=".xlsx" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) subirPlantillaFormato(f); e.target.value = '' }} />
                    <button onClick={() => plantillaRef.current?.click()} disabled={subiendoPlantilla}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-all disabled:opacity-50 shrink-0"
                      style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0', color: '#475569' }}>
                      {subiendoPlantilla ? <Spinner cls="h-3.5 w-3.5 text-slate-500"/> : (
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                        </svg>
                      )}
                      {subiendoPlantilla ? 'Subiendo...' : plantillaNombre ? 'Reemplazar' : 'Subir plantilla'}
                    </button>
                  </div>

                  {/* Selector de mes + botón descargar */}
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex-1">
                      <label className={labelCls}>
                        {plantillaNombre ? 'Generar con tu plantilla — elige el mes' : 'Formato Oficial MINEDU — Anexo 03'}
                      </label>
                      <input type="month" value={mesFormatoOficial}
                        max={fechaHoyLima().slice(0,7)}
                        onChange={e => setMesFormatoOficial(e.target.value)}
                        className={inputCls} />
                    </div>
                    <button onClick={descargarFormatoOficial} disabled={descargandoFormatoOficial}
                      className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
                      style={{ background: plantillaNombre ? 'linear-gradient(135deg,#0B2447,#6d28d9)' : 'linear-gradient(135deg,#dc2626,#b91c1c)', color:'white', boxShadow: plantillaNombre ? '0 4px 14px rgba(124,58,237,.35)' : '0 4px 14px rgba(220,38,38,.35)' }}>
                      {descargandoFormatoOficial ? <Spinner cls="h-4 w-4 text-white"/> : (
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                        </svg>
                      )}
                      {descargandoFormatoOficial ? 'Generando...' : plantillaNombre ? 'Descargar con plantilla' : 'Formato Oficial'}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 -mt-1">
                  {plantillaNombre
                    ? 'Sube tu plantilla Excel del MINEDU y el sistema la llenará con los datos de asistencia'
                    : 'Reporte de Asistencia Detallado · Formato 01 MINEDU · R.S.G. N° 326-2017'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-5 text-center overflow-hidden relative" style={card}>
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg, #0B2447, #1E3A8A)' }} />
                <p className="text-4xl font-black text-indigo-900">
                  {new Set(asistencias.map(a => a.docentes?.email ?? '')).size}
                </p>
                <p className="text-slate-400 text-xs mt-1 font-semibold">Docentes presentes</p>
              </div>
              <div className="rounded-2xl p-5 text-center overflow-hidden relative" style={card}>
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg, #06b6d4, #3b82f6)' }} />
                <p className="text-slate-400 text-xs mb-1.5 font-semibold">Fecha</p>
                <p className="text-slate-800 font-black text-sm leading-snug">{formatFechaLarga(fechaFiltro)}</p>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={card}>
              {accentBar}
              {(() => {
                const totalDocentes = new Set(asistencias.map(a => a.docentes?.email ?? '')).size
                return (
                  <div className="px-5 py-3 flex items-center justify-between bg-slate-50/60"
                    style={{ borderBottom: '1px solid #E4E8EF' }}>
                    <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Registro de asistencias</span>
                    {asistencias.length > 0 && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' }}>
                        {totalDocentes} presente{totalDocentes !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )
              })()}

              {loadingReporte ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <Spinner cls="h-8 w-8 text-indigo-800"/>
                  <p className="text-slate-400 text-sm">Cargando reporte...</p>
                </div>
              ) : asistencias.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3' }}>
                    <svg className="text-indigo-300 w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-slate-300 text-sm font-semibold">Sin asistencias para este día</p>
                </div>
              ) : (() => {
                // Agrupar por docente (email como clave)
                const grupos = new Map<string, { nombre: string; email: string; docenteId: string | null; registros: Asistencia[] }>()
                for (const a of asistencias) {
                  const email = a.docentes?.email ?? 'desconocido'
                  if (!grupos.has(email)) {
                    grupos.set(email, { nombre: a.docentes?.nombre ?? 'Desconocido', email, docenteId: a.docente_id ?? null, registros: [] })
                  }
                  grupos.get(email)!.registros.push(a)
                }
                const lista = Array.from(grupos.values())
                const TOLERANCIA_MIN = 0
                return (
                  <div>
                    {lista.map((g, i) => {
                      // Entrada/Salida según el tipo guardado (backfill + RPC). Una
                      // marca única de tarde queda como 'salida', no como 'entrada'.
                      let entrada = g.registros.find(r => r.tipo === 'entrada') ?? null
                      let salida  = [...g.registros].reverse().find(r => r.tipo === 'salida') ?? null
                      if (!entrada && !salida) { entrada = g.registros[0]; salida = g.registros.length > 1 ? g.registros[g.registros.length - 1] : null }
                      const tieneSalida = !!salida && salida.id !== entrada?.id
                      const abierto = detallesAbiertos.has(g.email)
                      // Tardanza — hora esperada = 1ª clase del horario o, si no
                      // tiene horario ese día, la hora de entrada fija configurada.
                      const clasesHoy = horariosReporte.filter(h => h.docente_id === g.docenteId)
                      const primeraClase = clasesHoy.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))[0]
                      const heInfo = g.docenteId ? horaEntradaMap.get(g.docenteId) : undefined
                      const horaEsperada = primeraClase?.hora_inicio ?? heInfo?.hora ?? null
                      const minutosTarde = (entrada && horaEsperada)
                        ? calcularMinutosTarde(entrada.fecha_hora, horaEsperada.slice(0, 5), fechaFiltro)
                        : null
                      const esTardanza = minutosTarde !== null && minutosTarde > TOLERANCIA_MIN
                      const tardanzaJustificada = esTardanza && !!entrada?.justificada
                      const toggleDetalle = () => setDetallesAbiertos(prev => {
                        const next = new Set(prev)
                        if (next.has(g.email)) next.delete(g.email); else next.add(g.email)
                        return next
                      })
                      return (
                        <div key={g.email} style={{ borderBottom: i < lista.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                          {/* Fila principal */}
                          <div className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/30 transition-colors">
                            <span className="text-slate-300 text-xs font-mono w-5 text-right shrink-0">{i+1}</span>
                            {/* Check / Tardanza icono */}
                            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                              style={tardanzaJustificada
                                ? { background: '#f0f9ff', border: '1.5px solid #bae6fd' }
                                : esTardanza
                                  ? { background: '#fff7ed', border: '1.5px solid #fed7aa' }
                                  : { background: '#ecfdf5', border: '1.5px solid #a7f3d0' }}>
                              {tardanzaJustificada
                                ? <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                : esTardanza
                                  ? <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                  : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              }
                            </div>
                            <Avatar name={g.nombre} color={esTardanza ? 'violet' : 'indigo'} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-slate-800 font-semibold text-sm truncate">{g.nombre}</p>
                                {minutosTarde !== null ? (
                                  tardanzaJustificada ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full"
                                      style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', color: '#0284c7' }}>
                                      Tardanza justificada · {minutosTarde} min
                                    </span>
                                  ) : esTardanza ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full"
                                      style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', color: '#ea580c' }}>
                                      Tardanza · {minutosTarde} min
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full"
                                      style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' }}>
                                      A tiempo
                                    </span>
                                  )
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {/* Entrada — protagonista (o "sin entrada" si solo marcó salida) */}
                                {entrada ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-600">
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                                    {formatHora(entrada.fecha_hora)}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">Sin entrada</span>
                                )}
                                {primeraClase ? (
                                  <span className="text-[10px] text-slate-400">
                                    · esperada {primeraClase.hora_inicio}
                                  </span>
                                ) : g.docenteId ? (
                                  editHoraEntrada === g.docenteId ? (
                                    <span className="inline-flex items-center gap-1">
                                      <input
                                        type="time"
                                        value={nuevaHoraEntrada}
                                        onChange={e => setNuevaHoraEntrada(e.target.value)}
                                        className="text-[11px] rounded-md px-1.5 py-0.5 tabular-nums"
                                        style={{ border: '1.5px solid #dbe4f0' }}
                                      />
                                      <button
                                        onClick={() => guardarHoraEntrada(g.docenteId!)}
                                        disabled={guardandoHoraEntrada}
                                        className="text-[10px] font-bold px-2 py-0.5 rounded-md disabled:opacity-50"
                                        style={{ background: '#0B2447', color: '#fff' }}>
                                        Guardar
                                      </button>
                                      <button
                                        onClick={() => { setEditHoraEntrada(null); setNuevaHoraEntrada('') }}
                                        className="text-[10px] font-medium text-slate-400 px-1">
                                        Cancelar
                                      </button>
                                    </span>
                                  ) : heInfo?.hora ? (
                                    <button
                                      onClick={() => { setEditHoraEntrada(g.docenteId!); setNuevaHoraEntrada(heInfo.hora!) }}
                                      title="Editar hora de entrada"
                                      className="text-[10px] text-slate-400 underline decoration-dotted underline-offset-2">
                                      · esperada {heInfo.hora} (editar)
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => { setEditHoraEntrada(g.docenteId!); setNuevaHoraEntrada('') }}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                                      style={{ background: '#eef2f8', border: '1.5px solid #dbe4f0', color: '#0B2447' }}>
                                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                      hora de entrada
                                    </button>
                                  )
                                ) : null}
                                {/* Salida — secundaria */}
                                {tieneSalida && salida && (
                                  <>
                                    <span className="text-slate-300 text-[10px]">·</span>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
                                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18"/></svg>
                                      {formatHora(salida.fecha_hora)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <button onClick={toggleDetalle}
                              className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all"
                              style={abierto
                                ? { background: '#F1F5F9', border: '1.5px solid #fecdd3', color: '#0B2447' }
                                : { background: '#faf8f7', border: '1.5px solid #e2e8f0', color: '#94a3b8' }}>
                              {g.registros.length > 1 && (
                                <span className="px-1 py-0.5 rounded text-[9px] font-black"
                                  style={{ background: abierto ? '#fecdd3' : '#e2e8f0', color: abierto ? '#0B2447' : '#64748b' }}>
                                  {g.registros.length}
                                </span>
                              )}
                              <span>Detalles</span>
                              <svg className={`w-3 h-3 transition-transform ${abierto ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </button>
                          </div>
                          {/* Detalles expandibles */}
                          {abierto && (
                            <div className="px-4 pb-3 pt-0"
                              style={{ background: '#faf8f7', borderTop: '1px solid #f1f5f9' }}>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 pt-2">Registros del día</p>
                              <div className="space-y-1.5">
                                {g.registros.map((r, ri) => (
                                  <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                                    style={{ background: 'white', border: '1px solid #E4E8EF' }}>
                                    <span className="text-[10px] text-slate-300 font-mono w-4 text-right shrink-0">{ri+1}</span>
                                    <div className="w-1.5 h-1.5 rounded-full shrink-0"
                                      style={{ background: ri === 0 ? '#10b981' : ri === g.registros.length - 1 ? '#0B2447' : '#94a3b8' }}/>
                                    <span className="text-xs font-bold text-slate-700 tabular-nums">{formatHora(r.fecha_hora)}</span>
                                    <span className="text-[10px] text-slate-400 font-medium flex-1">
                                      {ri === 0 ? 'Entrada' : ri === g.registros.length - 1 && g.registros.length > 1 ? 'Salida' : 'Registro'}
                                    </span>
                                    {/* Acciones de administrador */}
                                    <button
                                      onClick={() => abrirAccionRegistro('editar', r)}
                                      title="Corregir hora"
                                      className="w-6 h-6 flex items-center justify-center rounded-lg transition-all hover:scale-110"
                                      style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3', color: '#0B2447' }}>
                                      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110.414 16H8v-2.414a2 2 0 01.586-1.414z"/>
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => abrirAccionRegistro('borrar', r)}
                                      title="Borrar registro"
                                      className="w-6 h-6 flex items-center justify-center rounded-lg transition-all hover:scale-110"
                                      style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#ef4444' }}>
                                      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* ══ JUSTIFICACIONES ═════════════════════════════════════════════════ */}
        {tab === 'justificaciones' && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden" style={card}>
              {accentBar}
              <div className="px-5 py-3 flex items-center justify-between bg-slate-50/60"
                style={{ borderBottom: '1px solid #E4E8EF' }}>
                <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Justificaciones de docentes</span>
                <div className="flex items-center gap-2">
                  {pendientes > 0 && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ background: '#fffbeb', border: '1.5px solid #fde68a', color: '#d97706' }}>
                      {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
                    </span>
                  )}
                  <button onClick={cargarJustificaciones} disabled={loadingJustif}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3', color: '#0B2447' }}>
                    {loadingJustif ? <Spinner cls="h-3.5 w-3.5 text-indigo-900"/> : (
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                    )}
                    Actualizar
                  </button>
                </div>
              </div>

              {loadingJustif ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <Spinner cls="h-8 w-8 text-indigo-800"/>
                  <p className="text-slate-400 text-sm">Cargando justificaciones...</p>
                </div>
              ) : justificaciones.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}>
                    <svg className="w-6 h-6 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <p className="text-slate-300 text-sm font-semibold">Sin justificaciones por ahora</p>
                </div>
              ) : (
                <div>
                  {justificaciones.map((j, i) => {
                    const esPendiente   = j.estado === 'pendiente'
                    const esJustificado = j.estado === 'justificado'
                    const [y, m, d] = j.fecha.split('-')
                    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
                    const fechaFmt = `${parseInt(d)} ${meses[parseInt(m)-1]} ${y}`
                    const horaEnvio = new Date(j.created_at).toLocaleTimeString('es-PE', {
                      timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit'
                    })
                    const diaEnvio = new Date(j.created_at).toLocaleDateString('es-PE', {
                      timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: '2-digit'
                    })
                    return (
                      <div key={j.id}
                        style={{ borderBottom: i < justificaciones.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        <div className="px-4 py-4 flex items-start gap-3">
                          {/* Indicador estado */}
                          <div className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: esJustificado ? '#0ea5e9' : esPendiente ? '#f59e0b' : '#10b981', marginTop: '5px' }}/>
                          <Avatar name={j.docentes?.nombre ?? '?'} color="indigo" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div>
                                <p className="text-slate-800 font-bold text-sm">{j.docentes?.nombre ?? 'Docente'}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={esJustificado
                                      ? { background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0284c7' }
                                      : esPendiente
                                        ? { background: '#fffbeb', border: '1px solid #fde68a', color: '#d97706' }
                                        : { background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669' }}>
                                    {esJustificado ? 'Justificado' : esPendiente ? 'Pendiente' : 'Visto'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-semibold">
                                    Ausencia: {fechaFmt}
                                  </span>
                                </div>
                              </div>
                              {!esJustificado && (
                                <div className="shrink-0 flex items-center gap-1.5">
                                  {esPendiente && (
                                    <button
                                      onClick={() => marcarVisto(j.id)}
                                      disabled={marcandoVistoId === j.id}
                                      className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50"
                                      style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' }}>
                                      {marcandoVistoId === j.id
                                        ? <Spinner cls="h-3 w-3 text-emerald-500"/>
                                        : (
                                          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                          </svg>
                                        )
                                      }
                                      Marcar visto
                                    </button>
                                  )}
                                  <button
                                    onClick={() => abrirJustificar(j)}
                                    className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all"
                                    style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', color: '#0284c7' }}>
                                    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                    </svg>
                                    Justificar
                                  </button>
                                </div>
                              )}
                            </div>
                            {/* Motivo */}
                            <div className="mt-2 px-3 py-2 rounded-xl"
                              style={{ background: '#faf8f7', border: '1px solid #e2e8f0' }}>
                              <p className="text-slate-600 text-xs leading-relaxed">{j.motivo}</p>
                            </div>
                            {/* Respuesta del administrador (si fue justificada) */}
                            {esJustificado && (
                              <div className="mt-1.5 px-3 py-2 rounded-xl"
                                style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#0284c7' }}>
                                  Justificado por el administrador
                                </p>
                                {j.respuesta && (
                                  <p className="text-xs leading-relaxed mt-0.5" style={{ color: '#075985' }}>{j.respuesta}</p>
                                )}
                              </div>
                            )}
                            <p className="text-[10px] text-slate-300 mt-1.5 font-mono">
                              Enviado el {diaEnvio} a las {horaEnvio}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ MARCAR MI ASISTENCIA (inline, no navega a /escanear) ═════════════ */}
        {tab === 'marcar-asistencia' && <MarcarAsistencia />}

        {/* ══ MARCADO POR UBICACIÓN (asistencia del personal) ═══════════════ */}
        {tab === 'qr' && (
          <div className="space-y-5 max-w-3xl mx-auto">
            <div>
              <h2 className="text-slate-900 font-black text-xl">Marcado por Ubicación</h2>
              <p className="text-slate-400 text-xs mt-0.5">
                El personal marca su asistencia con el botón &quot;Marcar mi asistencia&quot;, únicamente estando dentro del radio de la escuela.
              </p>
            </div>

            {/* Configuración de la zona — solo super admin */}
            {esSuper && (
              <div className="rounded-2xl overflow-hidden" style={card}>
                <div className="h-1.5" style={{ background: 'linear-gradient(90deg,#0B2447,#143875,#0EA5E9)' }} />
                <div className="p-6">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-slate-900 font-black text-sm">Marcado por ubicación (GPS)</h3>
                      <p className="text-slate-400 text-xs mt-0.5">
                        El personal marca su asistencia presionando un botón, solo si su teléfono está dentro del radio de la escuela.
                        <span className="font-bold" style={{ color: '#b45309' }}> Si la desactivas, el personal no tendrá forma de marcar.</span>
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black"
                      style={geoActivo
                        ? { background: '#ecfdf5', border: '1.5px solid #6ee7b7', color: '#047857' }
                        : { background: '#F6F8FB', border: '1.5px solid #E4E8EF', color: '#64748b' }}>
                      <span className={`w-1.5 h-1.5 rounded-full ${geoActivo ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      {geoActivo ? 'ACTIVA' : 'DESACTIVADA'}
                    </span>
                  </div>

                  <div className="mt-4 flex items-end gap-2 flex-wrap">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Latitud</label>
                      <input type="text" inputMode="decimal" value={geoLat} onChange={e => setGeoLat(e.target.value)}
                        placeholder="-15.482716"
                        className="w-32 px-2.5 py-2 rounded-xl text-sm font-semibold text-slate-700 outline-none"
                        style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Longitud</label>
                      <input type="text" inputMode="decimal" value={geoLng} onChange={e => setGeoLng(e.target.value)}
                        placeholder="-70.135586"
                        className="w-32 px-2.5 py-2 rounded-xl text-sm font-semibold text-slate-700 outline-none"
                        style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Radio (m)</label>
                      <input type="number" min={20} max={5000} value={geoRadio} onChange={e => setGeoRadio(e.target.value)}
                        className="w-20 px-2.5 py-2 rounded-xl text-sm font-semibold text-slate-700 outline-none"
                        style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }} />
                    </div>
                    <button onClick={capturarUbicacionColegio} disabled={geoCapturando}
                      className="px-3.5 py-2.5 rounded-xl text-xs font-black transition-all disabled:opacity-60"
                      style={{ background: '#EFF3FA', border: '1.5px solid #b6c5e3', color: '#143875' }}>
                      {geoCapturando ? 'Obteniendo…' : '📍 Usar mi ubicación actual'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Captura la ubicación estando en la escuela, pega las coordenadas desde Google Maps,
                    o haz clic directamente en el mapa. El círculo azul es la zona donde el personal podrá marcar
                    — dale un margen por la imprecisión del GPS (recomendado: 150 m o más).
                  </p>

                  {/* Mapa: punto de la escuela + círculo del radio (clic o arrastre fija el punto) */}
                  <div className="mt-3">
                    <MapaGeocerca
                      lat={Number.isFinite(parseFloat(geoLat)) ? parseFloat(geoLat) : null}
                      lng={Number.isFinite(parseFloat(geoLng)) ? parseFloat(geoLng) : null}
                      radio={Number.isFinite(parseInt(geoRadio, 10)) ? Math.min(Math.max(parseInt(geoRadio, 10), 20), 5000) : 150}
                      onSelect={(lat, lng) => {
                        setGeoLat(String(lat)); setGeoLng(String(lng))
                        setGeoMsg({ tipo: 'ok', texto: 'Punto seleccionado en el mapa. Guarda la configuración para aplicarlo.' })
                      }}
                    />
                  </div>

                  <div className="mt-4 pt-4 flex items-center gap-3 flex-wrap border-t" style={{ borderColor: '#f1f5f9' }}>
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={geoActivo} onChange={e => setGeoActivo(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600" />
                      <span className="text-xs font-bold text-slate-700">Exigir estar en la escuela para marcar</span>
                    </label>
                    <button onClick={guardarGeo} disabled={geoGuardando}
                      className="px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#0B2447,#143875)', boxShadow: '0 4px 14px rgba(11,36,71,.3)' }}>
                      {geoGuardando ? 'Guardando…' : 'Guardar configuración'}
                    </button>
                  </div>
                  {geoMsg && (
                    <p className="text-xs font-semibold mt-2" style={{ color: geoMsg.tipo === 'ok' ? '#047857' : '#dc2626' }}>
                      {geoMsg.texto}
                    </p>
                  )}
                </div>
              </div>
            )}

            {!esSuper && (
              <div className="rounded-2xl overflow-hidden" style={card}>
                <div className="h-1.5" style={{ background: 'linear-gradient(90deg,#0B2447,#143875,#0EA5E9)' }} />
                <div className="p-6 text-center">
                  <p className="text-3xl mb-2">📍</p>
                  <p className="text-sm font-bold text-slate-700">El personal marca su asistencia por ubicación (GPS), desde su panel.</p>
                  <p className="text-xs text-slate-400 mt-1">Solo el super administrador puede configurar la zona de marcado.</p>
                  {esAdminUser && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black mt-3"
                      style={geoActivo
                        ? { background: '#ecfdf5', border: '1.5px solid #6ee7b7', color: '#047857' }
                        : { background: '#fef2f2', border: '1.5px solid #fecaca', color: '#b91c1c' }}>
                      <span className={`w-1.5 h-1.5 rounded-full ${geoActivo ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      {geoActivo ? 'MARCADO HABILITADO' : 'MARCADO DESHABILITADO'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ ESCÁNER QR ALUMNOS ══════════════════════════════════════════════ */}
        {tab === 'escaner-alumnos' && (() => {
          const sumaHora = (hhmm: string, mins: number) => {
            const [h, m] = hhmm.split(':').map(Number)
            const t = (h * 60 + m + mins) % (24 * 60)
            return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
          }
          const tolMin   = scanCfg?.tolerancia_min ?? 10
          const salHoras = scanCfg?.salida_tras_horas ?? 3
          const horaBase = scanCfgHora || scanCfg?.hora_entrada || ''
          return (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div>
                <h2 className="text-slate-900 font-black text-xl">Escáner QR — Asistencia Estudiantes</h2>
                <p className="text-slate-400 text-xs mt-0.5">Escanea el QR del estudiante — el grado y sección se detectan automáticamente</p>
              </div>

              {/* Config: hora de entrada de la escuela */}
              <div className="rounded-2xl p-4" style={card}>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Hora de entrada</p>
                    <input type="time" value={scanCfgHora}
                      onChange={e => setScanCfgHora(e.target.value)}
                      className="text-sm font-black text-slate-700 px-3 py-2 rounded-xl outline-none"
                      style={{ background: 'white', border: '1.5px solid #E4E8EF' }} />
                  </div>
                  <button onClick={guardarScanCfg}
                    disabled={scanCfgGuardando || !scanCfgHora || scanCfgHora === scanCfg?.hora_entrada}
                    className="text-xs font-black px-4 py-2.5 rounded-xl transition-all disabled:opacity-40"
                    style={{ background: '#0B2447', color: 'white' }}>
                    {scanCfgGuardando ? 'Guardando…' : 'Guardar'}
                  </button>
                  {scanCfgOk && (
                    <span className="text-xs font-black py-2.5" style={{ color: '#16a34a' }}>✓ Guardado</span>
                  )}
                </div>
                {horaBase && (
                  <p className="text-[11px] text-slate-400 font-semibold mt-2">
                    Tolerancia {tolMin} min: tardanza desde las{' '}
                    <b className="text-amber-700">{sumaHora(horaBase, tolMin)}</b> · desde las{' '}
                    <b className="text-blue-800">{sumaHora(horaBase, salHoras * 60)}</b> el escaneo registra la <b>salida</b>
                    {scanCfgHora && scanCfg && scanCfgHora !== scanCfg.hora_entrada ? ' (sin guardar aún)' : ''}
                  </p>
                )}
              </div>

              {/* Escáner */}
              <div className="rounded-2xl overflow-hidden" style={card}>
                <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #0B2447, #1E3A8A, #1E40AF)' }} />
                <div className="p-5 relative">
                  <QrScanner rawMode continuous onScan={handleScanAdmin} disabled={scanAdminProcesando} />

                  {/* Confirmación GRANDE sobre el escáner: nombre + sección + horas. */}
                  {scanAdminResult && (
                    <div
                      key={scanAdminResult.alumno_id + scanAdminResult.mensaje}
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 rounded-2xl"
                      style={{
                        animation: 'scanpop .22s ease-out',
                        background:
                          scanAdminResult.tipo === 'ok'        ? 'rgba(22,163,74,0.97)' :
                          scanAdminResult.tipo === 'salida_ok' ? 'rgba(29,78,216,0.97)' :
                          scanAdminResult.tipo === 'completo'  ? 'rgba(71,85,105,0.97)' :
                          'rgba(220,38,38,0.97)',
                      }}>
                      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-4"
                        style={{ background: 'rgba(255,255,255,0.22)', border: '3px solid rgba(255,255,255,0.65)' }}>
                        {scanAdminResult.tipo === 'ok' ? (
                          <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ) : scanAdminResult.tipo === 'salida_ok' ? (
                          <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        ) : scanAdminResult.tipo === 'completo' ? (
                          <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        ) : (
                          <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        )}
                      </div>
                      {scanAdminResult.nombre && (
                        <p className="text-white font-black text-2xl leading-tight break-words">{scanAdminResult.nombre}</p>
                      )}
                      {scanAdminResult.grado && (
                        <p className="text-white/90 font-bold text-sm mt-0.5">{scanAdminResult.grado} — Sección {scanAdminResult.grupo}</p>
                      )}
                      <p className="text-white font-black text-base mt-1.5 uppercase tracking-wide">{scanAdminResult.mensaje}</p>
                      {(scanAdminResult.hora_entrada || scanAdminResult.hora_salida) && (
                        <p className="text-white/85 font-mono text-sm mt-1">
                          {scanAdminResult.hora_entrada && `↑ ${scanAdminResult.hora_entrada}`}
                          {scanAdminResult.hora_salida  && `   ↓ ${scanAdminResult.hora_salida}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Lista escaneados */}

              {scanAdminList.length > 0 && (
                <div className="rounded-2xl overflow-hidden" style={card}>
                  <div className="px-5 py-3 flex items-center justify-between bg-slate-50/60"
                    style={{ borderBottom: '1px solid #E4E8EF' }}>
                    <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Escaneados esta sesión</span>
                    <span className="text-xs font-bold text-indigo-900">{scanAdminList.length} estudiantes</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {scanAdminList.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-black"
                          style={
                            s.tipo === 'ok'        ? { background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #86efac' } :
                            s.tipo === 'salida_ok' ? { background: '#eff6ff', color: '#1d4ed8', border: '1.5px solid #bfdbfe' } :
                            s.tipo === 'completo'  ? { background: '#f8fafc', color: '#64748b', border: '1.5px solid #e2e8f0' } :
                            { background: '#fef2f2', color: '#ef4444', border: '1.5px solid #fecaca' }
                          }>
                          {s.tipo === 'ok' ? '↑' : s.tipo === 'salida_ok' || s.tipo === 'completo' ? '↕' : '!'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{s.nombre}</p>
                          {(s.hora_entrada || s.hora_salida) && (
                            <p className="text-[10px] text-slate-400 font-semibold">
                              {s.hora_entrada && `↑${s.hora_entrada}`}{s.hora_salida && `  ↓${s.hora_salida}`}
                            </p>
                          )}
                        </div>
                        {s.grado && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: '#F1F5F9', color: '#0B2447' }}>
                            {s.grado} {s.grupo}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ══ ASISTENCIA ALUMNOS ══════════════════════════════════════════════ */}
        {tab === 'asist-alumnos' && (() => {
          // Grados únicos presentes en los salones cargados
          const gradosUnicos = [...new Set(asistSalones.map(s => s.grado))]
          return (
            <div className="space-y-4">
              {ciclos.find(c => c.activo) && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest"
                    style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #bbf7d0' }}>
                    ● Ciclo {ciclos.find(c => c.activo)!.nombre}
                  </span>
                  <span className="text-[11px] text-slate-400 font-semibold">Asistencia diaria por salón</span>
                </div>
              )}
              {/* Filtro: salones como chips agrupados por grado */}
              {asistSalones.length > 0 && (
                <div className="space-y-2">
                  {gradosUnicos.map(grado => (
                    <div key={grado} className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-400 w-28 shrink-0">{grado}</span>
                      <div className="flex gap-1 flex-wrap">
                        {asistSalones.filter(s => s.grado === grado).map(s => {
                          const active = asistGrado === s.grado && asistGrupo === s.grupo
                          return (
                            <button key={s.grupo}
                              onClick={() => { setAsistGrado(s.grado); setAsistGrupo(s.grupo) }}
                              className="px-3 py-1.5 rounded-lg text-xs font-black transition-all"
                              style={active
                                ? { background: '#0B2447', color: 'white' }
                                : { background: '#f1f5f9', color: '#64748b' }}>
                              {s.nombre ? `${s.grupo} — ${s.nombre}` : `Sección ${s.grupo}`}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Navegación de semana */}
              <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3" style={card}>
                <button onClick={() => setSemanaInicio(prev => { const d = new Date(prev); d.setDate(d.getDate()-7); return d })}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                  style={{ background: '#f1f5f9', color: '#64748b' }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                  </svg>
                </button>
                <div className="text-center">
                  <p className="text-xs font-black text-slate-700">
                    {diasDeSemana(semanaInicio)[0].toLocaleDateString('es-PE',{day:'2-digit',month:'short',timeZone:'America/Lima'})}
                    {' — '}
                    {diasDeSemana(semanaInicio)[4].toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Lima'})}
                  </p>
                  <p className="text-[10px] text-slate-400">Lun — Vie</p>
                </div>
                <button onClick={() => setSemanaInicio(prev => { const d = new Date(prev); d.setDate(d.getDate()+7); return d })}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                  style={{ background: '#f1f5f9', color: '#64748b' }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>

              {/* Reporte mensual */}
              <div className="flex items-center gap-3 rounded-2xl px-4 py-3 flex-wrap" style={card}>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#0B2447" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                <span className="text-xs font-black text-slate-600">Reporte mensual</span>
                <input type="month" value={mesReporte} onChange={e => setMesReporte(e.target.value)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg outline-none"
                  style={{ background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #fecdd3' }} />
                <button
                  onClick={exportarReporteAsistExcel}
                  disabled={imprimiendoAsist || !asistAlumnos.length}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-50 hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', boxShadow: '0 3px 12px rgba(22,163,74,.25)' }}>
                  {imprimiendoAsist ? (
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                      <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  ) : (
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                  )}
                  Excel
                </button>
                <button
                  onClick={generarReporteAsistMensual}
                  disabled={imprimiendoAsist || !asistAlumnos.length}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-50 hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', boxShadow: '0 3px 12px rgba(11,36,71,.25)' }}>
                  {imprimiendoAsist ? (
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                      <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  ) : (
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                  )}
                  PNG
                </button>
              </div>

              {/* Leyenda */}
              <div className="flex gap-3 flex-wrap px-1">
                {[
                  { k:'P', label:'Presente',    bg:'#f0fdf4', color:'#16a34a', border:'#86efac' },
                  { k:'T', label:'Tardanza',    bg:'#fffbeb', color:'#d97706', border:'#fde68a' },
                  { k:'J', label:'Justificado', bg:'#eff6ff', color:'#2563eb', border:'#bfdbfe' },
                  { k:'F', label:'Falta',       bg:'#fff1f2', color:'#ef4444', border:'#fecdd3' },
                ].map(e => (
                  <div key={e.k} className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md text-[10px] font-black flex items-center justify-center"
                      style={{ background: e.bg, color: e.color, border: `1.5px solid ${e.border}` }}>{e.k}</span>
                    <span className="text-[10px] text-slate-400 font-semibold">{e.label}</span>
                  </div>
                ))}
                <span className="text-[10px] text-slate-300 ml-auto">Toca una celda para cambiar · Toca el nombre para ver horas</span>
              </div>

              {/* Tabla */}
              <div className="rounded-2xl overflow-hidden" style={card}>
                {accentBar}
                {loadingAsistAlumnos ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <Spinner cls="h-8 w-8 text-indigo-800"/>
                    <p className="text-slate-400 text-sm">Cargando...</p>
                  </div>
                ) : asistAlumnos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <p className="text-slate-300 text-sm font-semibold">
                      {asistGrado ? `Sin estudiantes en ${asistGrado} "${asistGrupo}"` : 'Selecciona un salón'}
                    </p>
                  </div>
                ) : (() => {
                  const dias = diasDeSemana(semanaInicio)
                  const cicloId = ciclos.find(c => c.activo)?.id ?? null
                  const DIAS_LABEL = ['Lun','Mar','Mié','Jue','Vie']
                  const ESTADO_STYLE: Record<string, { bg: string; color: string; border: string }> = {
                    P: { bg:'#f0fdf4', color:'#16a34a', border:'#86efac' },
                    T: { bg:'#fffbeb', color:'#d97706', border:'#fde68a' },
                    J: { bg:'#eff6ff', color:'#2563eb', border:'#bfdbfe' },
                    F: { bg:'#fff1f2', color:'#ef4444', border:'#fecdd3' },
                  }
                  const ESTADO_FUTURO = { bg:'#f8fafc', color:'#cbd5e1', border:'#e2e8f0' }
                  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
                  const fechasConRegistro = new Set<string>()
                  Object.values(asistSemanaMap).forEach(fm => Object.keys(fm).forEach(f => fechasConRegistro.add(f)))
                  return (
                    <div>
                      {/* Cabecera días */}
                      <div className="grid px-4 py-2 bg-slate-50/60" style={{ gridTemplateColumns:'1fr repeat(5,52px)', borderBottom:'1px solid #E4E8EF' }}>
                        <span className="text-[10px] font-black text-slate-400 uppercase">Estudiante</span>
                        {dias.map((d, idx) => (
                          <div key={idx} className="text-center">
                            <p className="text-[10px] font-black text-slate-500">{DIAS_LABEL[idx]}</p>
                            <p className="text-[10px] text-slate-400">{d.getDate()}/{d.getMonth()+1}</p>
                          </div>
                        ))}
                      </div>

                      {/* Filas alumnos */}
                      {asistAlumnos.map((al, i) => {
                        const isOpen = asistDetalleId === al.id
                        return (
                          <div key={al.id} style={{ borderBottom: i < asistAlumnos.length-1 ? '1px solid #f8f8f8' : 'none' }}>
                            <div className="grid items-center px-4 py-2" style={{ gridTemplateColumns:'1fr repeat(5,52px)' }}>
                              {/* Nombre — click abre detalle */}
                              <button className="flex items-center gap-2 text-left min-w-0"
                                onClick={() => setAsistDetalleId(isOpen ? null : al.id)}>
                                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth="2.5"
                                  style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0)', transition:'transform 0.15s', flexShrink:0 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                                </svg>
                                <span className="text-xs font-bold text-slate-700 truncate">{displayAlumno(al)}</span>
                              </button>

                              {/* Celdas días */}
                              {dias.map(d => {
                                const fISO = fechaISO(d)
                                const reg = asistSemanaMap[al.id]?.[fISO]
                                const esFuturo = !reg && fISO > todayISO
                                const sinClase = !reg && !esFuturo && !fechasConRegistro.has(fISO)
                                const estado = reg?.estado ?? (esFuturo || sinClase ? null : 'F')
                                const clave = `${al.id}-${fISO}`
                                const cargando = guardandoCeldaAsist === clave
                                const st = estado ? ESTADO_STYLE[estado] : ESTADO_FUTURO
                                return (
                                  <div key={fISO} className="flex items-center justify-center">
                                    <button
                                      disabled={cargando || esFuturo}
                                      onClick={() => handleCeldaAsist(al.id, fISO, cicloId)}
                                      className="w-9 h-9 rounded-lg text-xs font-black transition-all flex items-center justify-center"
                                      style={{ background: st.bg, color: st.color, border: `1.5px solid ${st.border}`, opacity: cargando ? 0.5 : 1 }}>
                                      {cargando ? '…' : (estado ?? '')}
                                    </button>
                                  </div>
                                )
                              })}
                            </div>

                            {/* Detalle + observaciones al expandir */}
                            {isOpen && (
                              <div className="px-5 pb-3 pt-1" style={{ background:'#fafbff', borderTop:'1px solid #f1f5f9' }}>
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Detalle y observaciones de la semana</p>
                                <div className="space-y-1.5">
                                  {dias.map((d, idx) => {
                                    const fISO = fechaISO(d)
                                    const reg = asistSemanaMap[al.id]?.[fISO]
                                    const esFuturo2 = !reg && fISO > todayISO
                                    const sinClase2 = !reg && !esFuturo2 && !fechasConRegistro.has(fISO)
                                    const estado = reg?.estado ?? (esFuturo2 || sinClase2 ? null : 'F')
                                    const st = estado ? ESTADO_STYLE[estado] : ESTADO_FUTURO
                                    const editable = !!reg   // solo días con registro (P/T/J)
                                    const claveObs = `obs-${al.id}-${fISO}`
                                    const draft = obsDraft[claveObs] ?? reg?.observacion ?? ''
                                    const sucio = draft.trim() !== (reg?.observacion ?? '')
                                    return (
                                      <div key={fISO} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5"
                                        style={{ background:'white', border:'1px solid #eef0f4' }}>
                                        <div className="w-12 shrink-0">
                                          <p className="text-[10px] font-black text-slate-600 leading-tight">{DIAS_LABEL[idx]} {d.getDate()}</p>
                                          <span className="inline-block text-[9px] font-black px-1.5 rounded mt-0.5"
                                            style={{ background: st.bg, color: st.color }}>{estado ?? '—'}</span>
                                        </div>
                                        <div className="w-14 shrink-0 text-[9px] text-slate-400 leading-tight">
                                          {reg?.hora_entrada && <div>↑ {reg.hora_entrada}</div>}
                                          {reg?.hora_salida && <div>↓ {reg.hora_salida}</div>}
                                        </div>
                                        {editable ? (
                                          <div className="flex-1 flex items-center gap-1.5 min-w-0">
                                            <input
                                              value={draft}
                                              onChange={e => setObsDraft(p => ({ ...p, [claveObs]: e.target.value }))}
                                              placeholder="Observación para los padres…"
                                              className="flex-1 min-w-0 px-2 py-1.5 rounded-lg text-[11px] text-slate-700 outline-none"
                                              style={{ background:'#F6F8FB', border:'1.5px solid #E4E8EF' }} />
                                            <button
                                              onClick={() => guardarObservacion(al.id, fISO, draft)}
                                              disabled={guardandoObs === claveObs || !sucio}
                                              className="text-[10px] font-black px-2.5 py-1.5 rounded-lg shrink-0 transition-all disabled:opacity-40"
                                              style={{ background:'#0B2447', color:'white' }}>
                                              {guardandoObs === claveObs ? '…' : 'Guardar'}
                                            </button>
                                          </div>
                                        ) : (
                                          <span className="flex-1 text-[10px] text-slate-300">
                                            {esFuturo2 ? 'Próximo' : sinClase2 ? 'Sin clase' : 'Marca el estado (J) para poder observar'}
                                          </span>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })()}

        {/* ══ BOLETINES / REPORTES ALUMNOS ════════════════════════════════════ */}
        {tab === 'reportes-alumnos' && (() => {
          function notaColor(n: number | null) {
            if (n === null) return '#94a3b8'
            if (n >= 14) return '#16a34a'
            if (n >= 11) return '#d97706'
            return '#ef4444'
          }
          function notaLabel(n: number | null) {
            if (n === null) return '—'
            if (n >= 18) return 'AD'
            if (n >= 14) return 'A'
            if (n >= 11) return 'B'
            return 'C'
          }

          return (
            <div className="space-y-4">
              {/* Filtros */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Grado:</span>
                  <div className="flex gap-1">
                    {GRADOS.map(g => (
                      <button key={g} onClick={() => setReporteGrado(g)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-black transition-all"
                        style={reporteGrado === g
                          ? { background: '#0B2447', color: 'white' }
                          : { background: '#f1f5f9', color: '#64748b' }}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Sección:</span>
                  <div className="flex gap-1">
                    {GRUPOS.map(g => (
                      <button key={g} onClick={() => setReporteGrupo(g)}
                        className="px-3 py-1.5 rounded-lg text-xs font-black transition-all"
                        style={reporteGrupo === g
                          ? { background: '#0B2447', color: 'white' }
                          : { background: '#f1f5f9', color: '#64748b' }}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden" style={card}>
                {accentBar}
                <div className="px-5 py-3 flex items-center justify-between bg-slate-50/60"
                  style={{ borderBottom: '1px solid #E4E8EF' }}>
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                    Boletines — {reporteGrado} &quot;{reporteGrupo}&quot;
                    {cicloActivoInfo ? ` · Ciclo ${cicloActivoInfo.nombre}` : ''}
                  </span>
                  <span className="text-slate-300 text-xs">{reporteAlumnos.length} estudiantes</span>
                </div>

                {loadingReporteAlumnos ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <Spinner cls="h-8 w-8 text-indigo-800"/>
                    <p className="text-slate-400 text-sm">Cargando boletines...</p>
                  </div>
                ) : reporteAlumnos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3' }}>
                      <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
                      </svg>
                    </div>
                    <p className="text-slate-300 text-sm font-semibold">Sin estudiantes en {reporteGrado} &quot;{reporteGrupo}&quot;</p>
                  </div>
                ) : (
                  <div>
                    {reporteAlumnos.map((al, i) => {
                      const notasValidas = al.cursos.filter(c => c.promedio !== null).map(c => c.promedio!)
                      const promedioGral = notasValidas.length
                        ? Math.round(notasValidas.reduce((s, n) => s + n, 0) / notasValidas.length * 10) / 10
                        : null
                      const isOpen = reporteAbiertoId === al.id

                      return (
                        <div key={al.id} style={{ borderBottom: i < reporteAlumnos.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                          <button className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-indigo-50/30 transition-colors text-left"
                            onClick={() => setReporteAbiertoId(isOpen ? null : al.id)}>
                            <Avatar name={displayAlumno(al)} color="indigo" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate">
                                {displayAlumno(al)}
                              </p>
                              <p className="text-[10px] text-slate-400">{al.cursos.length} cursos</p>
                            </div>
                            {/* Promedio */}
                            <div className="text-center shrink-0">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Prom.</p>
                              <p className="text-base font-black" style={{ color: notaColor(promedioGral) }}>
                                {promedioGral ?? '—'}
                              </p>
                            </div>
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth="2.5"
                              className="shrink-0 transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                            </svg>
                          </button>

                          {/* Detalle por curso */}
                          {isOpen && al.cursos.length > 0 && (
                            <div className="px-4 pb-4 pt-1 space-y-2"
                              style={{ background: '#fafbff', borderTop: '1px solid #f1f5f9' }}>
                              {al.cursos.map(c => (
                                <div key={c.asigId} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                                  style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                                  <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{c.nombre}</span>
                                  <span className="text-xs font-black px-2 py-0.5 rounded-full shrink-0"
                                    style={{ background: `${notaColor(c.promedio)}15`, color: notaColor(c.promedio) }}>
                                    {c.promedio ?? '—'} — {notaLabel(c.promedio)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ══ AUDITORÍA ════════════════════════════════════════════════════════ */}
        {tab === 'auditoria' && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden" style={card}>
              {accentBar}
              <div className="px-5 py-3 flex items-center justify-between bg-slate-50/60"
                style={{ borderBottom: '1px solid #E4E8EF' }}>
                <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Historial de cambios en asistencia</span>
                <span className="text-slate-300 text-xs">{auditLog.length} registros</span>
              </div>

              {loadingAudit ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <Spinner cls="h-8 w-8 text-indigo-800"/>
                  <p className="text-slate-400 text-sm">Cargando auditoría...</p>
                </div>
              ) : auditLog.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3' }}>
                    <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                    </svg>
                  </div>
                  <p className="text-slate-300 text-sm font-semibold">Sin cambios registrados</p>
                </div>
              ) : (
                <div>
                  {auditLog.map((entry, i) => {
                    const esBorrar     = entry.accion === 'borrar_asistencia'
                    const esJustificar = entry.accion === 'justificar_asistencia'
                    const fecha = new Date(entry.created_at).toLocaleString('es-PE', {
                      timeZone: 'America/Lima', day: '2-digit', month: 'short',
                      year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })
                    const horaOriginal = entry.fecha_hora_original
                      ? new Date(entry.fecha_hora_original).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
                      : '—'
                    const horaNueva = entry.fecha_hora_nueva
                      ? new Date(entry.fecha_hora_nueva).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
                      : null
                    return (
                      <div key={entry.id}
                        style={{ borderBottom: i < auditLog.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        <div className="px-4 py-4 flex items-start gap-3">
                          {/* Ícono acción */}
                          <div className="mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                            style={esBorrar
                              ? { background: '#fef2f2', border: '1.5px solid #fecaca' }
                              : { background: '#F1F5F9', border: '1.5px solid #fecdd3' }}>
                            {esBorrar ? (
                              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-indigo-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110.414 16H8v-2.414a2 2 0 01.586-1.414z"/>
                              </svg>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Línea 1: acción + docente */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black px-2 py-0.5 rounded-full"
                                style={esBorrar
                                  ? { background: '#fef2f2', color: '#ef4444' }
                                  : { background: '#F1F5F9', color: '#0B2447' }}>
                                {esBorrar ? 'Borró' : esJustificar ? 'Justificó' : 'Editó'}
                              </span>
                              <span className="text-slate-700 font-semibold text-sm">
                                {entry.docente_nombre ?? 'Docente desconocido'}
                              </span>
                            </div>

                            {/* Línea 2: horas */}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-slate-400 text-xs">
                                Hora original: <span className="font-mono font-bold text-slate-600">{horaOriginal}</span>
                              </span>
                              {horaNueva && (
                                <>
                                  <span className="text-slate-300">→</span>
                                  <span className="text-slate-400 text-xs">
                                    Nueva: <span className="font-mono font-bold text-indigo-900">{horaNueva}</span>
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Línea 3: justificación */}
                            <p className="text-slate-500 text-xs mt-1 italic leading-relaxed">
                              &ldquo;{entry.justificacion}&rdquo;
                            </p>

                            {/* Línea 4: admin + fecha */}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Por: <span className="text-indigo-900">{entry.admin_nombre}</span>
                              </span>
                              <span className="text-slate-200">·</span>
                              <span className="text-[10px] text-slate-300">{fecha}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ SIMULAR DOCENTE ══════════════════════════════════════════════════ */}
        {tab === 'simular' && (
          <div className="space-y-5 max-w-2xl mx-auto">
            <div>
              <h2 className="text-slate-900 font-black text-xl">Simular Docente</h2>
              <p className="text-slate-400 text-xs mt-0.5">
                Selecciona un docente para ver el portal exactamente como él lo ve
              </p>
            </div>

            {/* Buscador */}
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/>
                </svg>
              </div>
              <input
                type="text"
                placeholder="Buscar docente..."
                value={simularSearch}
                onChange={e => setSimularSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'white', border: '1.5px solid #E4E8EF' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#1E3A8A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(11,36,71,.08)' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#E4E8EF'; e.currentTarget.style.boxShadow = 'none' }}
              />
            </div>

            {/* Lista de docentes */}
            <div className="space-y-2">
              {docentesLean
                .filter(d => d.nombre.toLowerCase().includes(simularSearch.toLowerCase()))
                .map(d => (
                  <div key={d.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                    style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm text-white"
                      style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                      {d.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{d.nombre}</p>
                      <p className="text-[10px] text-slate-400 font-medium">Docente</p>
                    </div>
                    <button
                      onClick={() => {
                        document.cookie = `habich-simular=${d.id}; path=/; max-age=3600; SameSite=Strict`
                        window.open('/docente', '_blank')
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all active:scale-95"
                      style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white', boxShadow: '0 4px 12px rgba(11,36,71,.2)' }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                      </svg>
                      Ver como docente
                    </button>
                  </div>
                ))}
              {docentesLean.filter(d => d.nombre.toLowerCase().includes(simularSearch.toLowerCase())).length === 0 && (
                <div className="py-12 text-center rounded-2xl" style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                  <p className="text-slate-300 text-sm font-semibold">No se encontraron docentes</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ BUSCAR ALUMNOS (3 divisiones) ════════════════════════════════════ */}
        {tab === 'buscar-alumnos' && !portalAbierto && (
          <div className="space-y-4">
            <div>
              <h2 className="text-slate-900 font-black text-xl">Buscar Estudiantes</h2>
              <p className="text-slate-400 text-xs mt-0.5">Busca por nombre, apellido, DNI o código de estudiante</p>
            </div>

            <div className="grid gap-5 grid-cols-1 lg:[grid-template-columns:360px_1.3fr_1.8fr] lg:min-h-[74vh]">
              {/* ── Columna IZQUIERDA: buscador ────────────────────────────── */}
              <div className="rounded-2xl p-4 space-y-3" style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                <p className="text-[10px] font-black tracking-widest text-slate-500 uppercase">Búsqueda</p>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/>
                    </svg>
                  </div>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Nombre o DNI..."
                    value={buscarAlumnoTexto}
                    onChange={e => setBuscarAlumnoTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') ejecutarBusquedaAlumnos() }}
                    className="w-full pl-10 pr-9 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={{ background: '#fafafa', border: '1.5px solid #E4E8EF' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#1E3A8A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(11,36,71,.08)'; e.currentTarget.style.background = 'white' }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#E4E8EF'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = '#fafafa' }}
                  />
                  {buscarAlumnoTexto && (
                    <button onClick={() => { setBuscarAlumnoTexto(''); setBuscarAlumnoResultados([]); setAlumnoSeleccionado(null) }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100"
                      aria-label="Limpiar búsqueda">
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  onClick={ejecutarBusquedaAlumnos}
                  disabled={!buscarAlumnoTexto.trim() || buscarAlumnoLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', boxShadow: '0 4px 12px rgba(11,36,71,.2)' }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/>
                  </svg>
                  {buscarAlumnoLoading ? 'Buscando…' : 'Buscar'}
                </button>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  Apreta <strong className="text-slate-600">Enter</strong> o el botón para buscar.
                </div>
              </div>

              {/* ── Columna CENTRO: lista de resultados ────────────────────── */}
              <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: '#E4E8EF' }}>
                  <p className="text-[10px] font-black tracking-widest text-slate-500 uppercase">Coincidencias</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {buscarAlumnoResultados.length === 0 && !buscarAlumnoLoading && (
                    <div className="py-16 text-center px-6">
                      <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ background: '#f8f5f0' }}>
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#c9a89a" strokeWidth="2">
                          <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/>
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-slate-500">
                        {buscarAlumnoTexto.trim() ? 'Sin coincidencias' : 'Haz una búsqueda'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {buscarAlumnoTexto.trim() ? 'Prueba con otro nombre o DNI' : 'Escribe y apreta Enter o el botón Buscar'}
                      </p>
                    </div>
                  )}
                  {buscarAlumnoLoading && (
                    <div className="py-12 text-center"><p className="text-slate-400 text-sm">Buscando…</p></div>
                  )}
                  {buscarAlumnoResultados.map(a => {
                    const seleccionado = alumnoSeleccionado?.id === a.id
                    return (
                      <button key={a.id}
                        onClick={() => setAlumnoSeleccionado(a)}
                        className="w-full flex items-center px-4 py-3 rounded-xl text-left transition-all cursor-pointer"
                        style={{
                          background: seleccionado ? 'linear-gradient(135deg,#0B2447,#1E3A8A)' : 'white',
                          border: seleccionado ? '1.5px solid transparent' : '1.5px solid #e8e2d8',
                          boxShadow: seleccionado ? '0 4px 14px rgba(11,36,71,.25)' : '0 1px 2px rgba(0,0,0,.03)',
                        }}
                        onMouseEnter={e => {
                          if (seleccionado) return
                          e.currentTarget.style.background = '#fdf8f1'
                          e.currentTarget.style.borderColor = '#1E3A8A'
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(11,36,71,.12)'
                          e.currentTarget.style.transform = 'translateX(2px)'
                        }}
                        onMouseLeave={e => {
                          if (seleccionado) return
                          e.currentTarget.style.background = 'white'
                          e.currentTarget.style.borderColor = '#e8e2d8'
                          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,.03)'
                          e.currentTarget.style.transform = 'translateX(0)'
                        }}>
                        <p className={`text-sm font-bold truncate ${seleccionado ? 'text-white' : 'text-slate-800'}`}>
                          {(a.apellidos || '') + (a.apellidos ? ', ' : '') + a.nombre}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Columna DERECHA: detalle del alumno seleccionado ───────── */}
              <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: '#E4E8EF' }}>
                  <p className="text-[10px] font-black tracking-widest text-slate-500 uppercase">Detalle del estudiante</p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {!alumnoSeleccionado && (
                    <div className="py-20 text-center px-6">
                      <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ background: '#f8f5f0' }}>
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#c9a89a" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-slate-500">Ningún estudiante seleccionado</p>
                      <p className="text-xs text-slate-400 mt-1">Selecciona uno desde la columna del centro</p>
                    </div>
                  )}
                  {alumnoSeleccionado && (
                    <div className="p-6 space-y-6">
                      {/* Header con avatar */}
                      <div className="flex items-center gap-5">
                        <div className="w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 font-black text-3xl text-white"
                          style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', boxShadow: '0 8px 22px rgba(11,36,71,.28)' }}>
                          {(alumnoSeleccionado.apellidos || alumnoSeleccionado.nombre || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-2xl font-black text-slate-900 leading-tight">
                            {alumnoSeleccionado.nombre}
                          </p>
                          <p className="text-2xl font-black text-slate-900 leading-tight">
                            {alumnoSeleccionado.apellidos || <span className="text-slate-300 font-normal">Sin apellidos</span>}
                          </p>
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <span className="px-3 py-1 rounded-full text-[11px] font-black text-white"
                              style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                              {alumnoSeleccionado.grado && alumnoSeleccionado.grupo
                                ? `${alumnoSeleccionado.grado} "${alumnoSeleccionado.grupo}"`
                                : (alumnoSeleccionado.grado || 'Sin grado')}
                            </span>
                            {(() => {
                              const sobrenombre = alumnoSeleccionado.grado && alumnoSeleccionado.grupo
                                ? salones[`${alumnoSeleccionado.grado}-${alumnoSeleccionado.grupo}`]
                                : ''
                              return sobrenombre ? (
                                <span className="px-3 py-1 rounded-full text-[11px] font-bold"
                                  style={{ background: '#fdf4e3', color: '#92500a', border: '1px solid #f5e6c8' }}>
                                  {sobrenombre}
                                </span>
                              ) : null
                            })()}
                            {alumnoSeleccionado.codigo_estudiante && (
                              <span className="px-3 py-1 rounded-full text-[11px] font-bold text-slate-600"
                                style={{ background: '#f8f5f0', border: '1px solid #E4E8EF' }}>
                                Cód. {alumnoSeleccionado.codigo_estudiante}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Sección: Datos del estudiante — lista limpia */}
                      <div>
                        <p className="text-[11px] font-black tracking-widest text-slate-400 uppercase pb-2 mb-3 border-b" style={{ borderColor: '#E4E8EF' }}>
                          Datos del estudiante
                        </p>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                          {(() => {
                            // Año de ingreso: año_actual - (numero_grado - 1)
                            // Solo aplica a Pastelería. Cocina queda sin calcular por ahora.
                            let anioIngreso: string | null = null
                            if (alumnoSeleccionado.grado && !/cocina/i.test(alumnoSeleccionado.grado)) {
                              const m = alumnoSeleccionado.grado.match(/^(\d+)/)
                              if (m) {
                                const n = parseInt(m[1], 10)
                                if (n >= 1 && n <= 5) {
                                  anioIngreso = String(new Date().getFullYear() - (n - 1))
                                }
                              }
                            }

                            // Edad calculada desde fecha_nacimiento
                            let edad: string | null = null
                            let fechaNacFmt: string | null = null
                            if (alumnoSeleccionado.fecha_nacimiento) {
                              const fn = new Date(alumnoSeleccionado.fecha_nacimiento)
                              if (!isNaN(fn.getTime())) {
                                const hoy = new Date()
                                let e = hoy.getFullYear() - fn.getFullYear()
                                const m = hoy.getMonth() - fn.getMonth()
                                if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) e--
                                edad = `${e} años`
                                const meses = ['ene.','feb.','mar.','abr.','may.','jun.','jul.','ago.','sep.','oct.','nov.','dic.']
                                fechaNacFmt = `${fn.getDate()} ${meses[fn.getMonth()]} ${fn.getFullYear()}`
                              }
                            }

                            return [
                              ['Código',              alumnoSeleccionado.codigo_estudiante],
                              ['Documento',           alumnoSeleccionado.dni],
                              ['Teléfono',            alumnoSeleccionado.celular],
                              ['Usuario',             alumnoSeleccionado.usuario],
                              ['Año de ingreso',      anioIngreso],
                              ['Sexo',                alumnoSeleccionado.sexo],
                              ['Fecha de nacimiento', fechaNacFmt],
                              ['Edad',                edad],
                            ]
                          })().map(([k, v]) => (
                            <p key={k} className="text-sm leading-relaxed">
                              <span className="font-black text-slate-800">{k}:</span>{' '}
                              <span className="text-slate-700 font-medium">
                                {v || <span className="text-slate-300">—</span>}
                              </span>
                            </p>
                          ))}
                        </div>
                      </div>

                      {/* Sección: Apoderado — lista limpia */}
                      <div>
                        <p className="text-[11px] font-black tracking-widest text-slate-400 uppercase pb-2 mb-3 border-b" style={{ borderColor: '#E4E8EF' }}>
                          Contacto de emergencia
                        </p>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                          {[
                            ['Nombre',       alumnoSeleccionado.nombre_apoderado],
                            ['Parentesco',   alumnoSeleccionado.parentesco_apoderado],
                            ['DNI',          alumnoSeleccionado.dni_apoderado],
                            ['Celular',      alumnoSeleccionado.celular_apoderado],
                            ['Correo',       alumnoSeleccionado.correo_apoderado],
                          ].map(([k, v]) => (
                            <p key={k} className="text-sm leading-relaxed">
                              <span className="font-black text-slate-800">{k}:</span>{' '}
                              <span className="text-slate-700 font-medium">
                                {v || <span className="text-slate-300">—</span>}
                              </span>
                            </p>
                          ))}
                        </div>
                      </div>

                      {/* ── Acciones: 4 botones ──────────────────────────────── */}
                      <div className="pt-4 border-t" style={{ borderColor: '#E4E8EF' }}>
                        <p className="text-[11px] font-black tracking-widest text-slate-400 uppercase mb-3">Acciones</p>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { id: 'plan-academico', label: 'Plan académico',
                              icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>,
                              onClick: () => cargarPlanAcademico(alumnoSeleccionado!) },
                            { id: 'ficha-matricula', label: 'Ficha de matrícula',
                              icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>,
                              onClick: () => alert('Ficha de matrícula — próximamente') },
                            { id: 'matricula-pdf', label: 'Matrícula PDF',
                              icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 13l3 3 3-3M12 9v7"/></svg>,
                              onClick: () => alert('Matrícula PDF — próximamente') },
                            { id: 'portal-alumno', label: 'Portal del estudiante',
                              icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>,
                              onClick: () => cargarPortalAlumno(alumnoSeleccionado!) },
                          ].map(b => (
                            <button key={b.id}
                              onClick={b.onClick}
                              className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-700 transition-all active:scale-95"
                              style={{ background: '#fafafa', border: '1.5px solid #E4E8EF' }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'linear-gradient(135deg,#0B2447,#1E3A8A)'
                                e.currentTarget.style.color = 'white'
                                e.currentTarget.style.borderColor = 'transparent'
                                e.currentTarget.style.boxShadow = '0 6px 18px rgba(11,36,71,.22)'
                                e.currentTarget.style.transform = 'translateY(-1px)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = '#fafafa'
                                e.currentTarget.style.color = '#334155'
                                e.currentTarget.style.borderColor = '#E4E8EF'
                                e.currentTarget.style.boxShadow = 'none'
                                e.currentTarget.style.transform = 'translateY(0)'
                              }}>
                              {b.icon}
                              <span className="truncate">{b.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Modal: Plan académico (notas del año) ───────────────────── */}
            {planAbierto && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: 'rgba(15,8,12,.55)', backdropFilter: 'blur(4px)' }}
                onClick={() => setPlanAbierto(false)}>
                <div className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col"
                  style={{ background: 'white', maxHeight: '90vh', boxShadow: '0 30px 80px rgba(0,0,0,.5)' }}
                  onClick={e => e.stopPropagation()}>

                  {/* Header del modal */}
                  <div className="px-6 py-5 flex items-center justify-between border-b" style={{ borderColor: '#E4E8EF', background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                    <div>
                      <p className="text-[10px] font-black tracking-widest text-white/70 uppercase">Plan académico{cicloActivoInfo ? ` · Ciclo ${cicloActivoInfo.nombre}` : ` ${new Date().getFullYear()}`}</p>
                      <p className="text-xl font-black text-white leading-tight mt-0.5">
                        {alumnoSeleccionado?.nombre} {alumnoSeleccionado?.apellidos}
                      </p>
                      <p className="text-xs text-white/80 mt-0.5">
                        {alumnoSeleccionado?.grado} {alumnoSeleccionado?.grupo && `"${alumnoSeleccionado.grupo}"`}
                      </p>
                    </div>
                    <button onClick={() => setPlanAbierto(false)}
                      className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110"
                      style={{ background: 'rgba(255,255,255,.15)' }}
                      aria-label="Cerrar">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>

                  {/* Contenido del modal */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {planLoading && (
                      <div className="py-16 text-center">
                        <p className="text-slate-400 text-sm">Cargando notas…</p>
                      </div>
                    )}
                    {!planLoading && planCursos.length === 0 && (
                      <div className="py-16 text-center">
                        <p className="text-sm font-bold text-slate-500">Sin cursos asignados</p>
                        <p className="text-xs text-slate-400 mt-1">El estudiante no tiene asignaciones registradas para este año</p>
                      </div>
                    )}
                    {!planLoading && planCursos.length > 0 && (() => {
                      // Promedio general (solo cursos con nota)
                      const notasGlobales = planCursos.filter(c => c.promedio !== null).map(c => c.promedio!)
                      const promedioGlobal = notasGlobales.length
                        ? Math.round(notasGlobales.reduce((s, n) => s + n, 0) / notasGlobales.length * 10) / 10
                        : null
                      const aprobado = promedioGlobal !== null && promedioGlobal >= 11
                      // Cursos desaprobados (< 11)
                      const desaprobados = planCursos.filter(c => c.promedio !== null && c.promedio < 11).length
                      return (
                        <>
                          {/* Resumen */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-xl p-4" style={{ background: '#fafafa', border: '1.5px solid #E4E8EF' }}>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Promedio general</p>
                              <p className="text-3xl font-black mt-1" style={{ color: promedioGlobal === null ? '#94a3b8' : promedioGlobal >= 14 ? '#16a34a' : promedioGlobal >= 11 ? '#d97706' : '#ef4444' }}>
                                {promedioGlobal !== null ? promedioGlobal.toFixed(1) : '—'}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-0.5">sobre 20</p>
                            </div>
                            <div className="rounded-xl p-4" style={{ background: '#fafafa', border: '1.5px solid #E4E8EF' }}>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado del año</p>
                              <p className="text-base font-black mt-1" style={{ color: promedioGlobal === null ? '#94a3b8' : aprobado ? '#16a34a' : '#ef4444' }}>
                                {promedioGlobal === null ? 'Sin datos' : aprobado ? 'Aprobado' : 'Desaprobado'}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {promedioGlobal === null ? '—' : aprobado ? 'Pasó el año' : 'Perdió el año'}
                              </p>
                            </div>
                            <div className="rounded-xl p-4" style={{ background: '#fafafa', border: '1.5px solid #E4E8EF' }}>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cursos desaprobados</p>
                              <p className="text-3xl font-black mt-1" style={{ color: desaprobados === 0 ? '#16a34a' : '#ef4444' }}>{desaprobados}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">de {planCursos.length} cursos</p>
                            </div>
                          </div>

                          {/* Lista de cursos */}
                          <div>
                            <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-3">Notas por curso</p>
                            <div className="space-y-2">
                              {planCursos.map((c, idx) => (
                                <div key={idx} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                                  <div className="w-10 h-10 rounded-xl shrink-0" style={{ background: c.color }} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black text-slate-800 truncate">{c.nombre}</p>
                                    <p className="text-[11px] text-slate-400 font-medium">
                                      {c.calificadas} de {c.total} {c.total === 1 ? 'tarea calificada' : 'tareas calificadas'}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-2xl font-black" style={{ color: c.promedio === null ? '#94a3b8' : c.promedio >= 14 ? '#16a34a' : c.promedio >= 11 ? '#d97706' : '#ef4444' }}>
                                      {c.promedio !== null ? c.promedio.toFixed(1) : '—'}
                                    </p>
                                    {c.promedio !== null && (
                                      <p className="text-[10px] font-black uppercase" style={{ color: c.promedio >= 14 ? '#16a34a' : c.promedio >= 11 ? '#d97706' : '#ef4444' }}>
                                        {c.promedio >= 18 ? 'AD' : c.promedio >= 14 ? 'A' : c.promedio >= 11 ? 'B' : 'C'}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ══ PORTAL DEL ALUMNO (inline, dentro del área de buscar-alumnos) ═══ */}
        {tab === 'buscar-alumnos' && portalAbierto && alumnoSeleccionado && (
          <div className="space-y-4">
            {/* Barra superior con botón volver + datos del alumno */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
              <div className="px-6 py-4 flex items-center justify-between gap-4">
                <button onClick={() => setPortalAbierto(false)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95"
                  style={{ background: 'rgba(255,255,255,.15)', color: 'white', border: '1.5px solid rgba(255,255,255,.25)' }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                  </svg>
                  Volver a búsqueda
                </button>
                <div className="text-right">
                  <p className="text-[10px] font-black tracking-widest text-white/70 uppercase">Portal del estudiante</p>
                  <p className="text-lg font-black text-white leading-tight mt-0.5">
                    {alumnoSeleccionado.nombre} {alumnoSeleccionado.apellidos}
                  </p>
                  <p className="text-xs text-white/80 mt-0.5">
                    {alumnoSeleccionado.grado} {alumnoSeleccionado.grupo && `"${alumnoSeleccionado.grupo}"`}
                  </p>
                </div>
              </div>
            </div>

            {/* 2 columnas: cursos numerados + horario graficado */}
            <div className="grid gap-4 rounded-2xl overflow-hidden" style={{ gridTemplateColumns: '380px 1fr', background: 'white', border: '1.5px solid #E4E8EF', minHeight: '70vh' }}>
              {/* IZQUIERDA: cursos numerados con docente */}
              <div className="overflow-y-auto p-5 border-r" style={{ borderColor: '#E4E8EF', background: '#fafafa' }}>
                <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-3">Cursos ({portalCursos.length})</p>
                {portalLoading && <p className="text-slate-400 text-sm text-center py-8">Cargando…</p>}
                {!portalLoading && portalCursos.length === 0 && (
                  <p className="text-slate-400 text-sm text-center py-8">Sin cursos asignados</p>
                )}
                <div className="space-y-2">
                  {portalCursos.map((c, idx) => (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-black text-sm text-white"
                        style={{ background: c.color }}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{c.nombre}</p>
                        <p className="text-[11px] text-slate-500 truncate">{c.docente}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* DERECHA: horario graficado (grid días × horas) */}
              <div className="overflow-auto p-5">
                <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-3">Horario semanal</p>
                {portalLoading && <p className="text-slate-400 text-sm text-center py-8">Cargando…</p>}
                {!portalLoading && portalHorario.length === 0 && (
                  <p className="text-slate-400 text-sm text-center py-8">Sin horario configurado</p>
                )}
                {!portalLoading && portalHorario.length > 0 && (() => {
                  const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes']
                  const colorDeCurso = (materia: string | null) =>
                    materia ? (portalCursos.find(c => c.nombre === materia)?.color ?? '#94a3b8') : '#94a3b8'
                  const hi = (s: string) => s.slice(0, 5)

                  // Filas: TODAS las horas del día (del config), más cualquier hora
                  // adicional encontrada en las clases reales del alumno (por si no estaba en el config).
                  type Fila = { key: string; inicio: string; fin: string; tipo: 'hora' | 'recreo' | 'almuerzo'; nombre?: string }
                  const slotsSet = new Map<string, Fila>()
                  portalPeriodos.forEach(p => {
                    slotsSet.set(p.inicio, { key: p.inicio, inicio: p.inicio, fin: p.fin, tipo: p.tipo, nombre: p.nombre })
                  })
                  portalHorario.forEach(c => {
                    const ini = hi(c.hora_inicio), fin = hi(c.hora_fin)
                    if (!slotsSet.has(ini)) {
                      slotsSet.set(ini, { key: ini, inicio: ini, fin, tipo: 'hora' })
                    }
                  })
                  const filas: Fila[] = [...slotsSet.values()].sort((a, b) => a.inicio.localeCompare(b.inicio))
                  let contadorHora = 0
                  const filasConNombre = filas.map(f => {
                    if (f.tipo === 'hora') {
                      contadorHora++
                      return { ...f, nombre: f.nombre ?? `${contadorHora}ª hora` }
                    }
                    return f
                  })

                  // Pre-computar celdas con rowSpan: si una clase dura más de un periodo,
                  // se renderiza como un solo bloque que abarca varias filas (skip las inferiores).
                  type Celda = { kind: 'class' | 'skip' | 'empty'; clase?: ClaseHorario; rowSpan?: number }
                  const cellsByDay: Record<string, Celda[]> = {}
                  DIAS.forEach(dia => {
                    const arr: Celda[] = filasConNombre.map(() => ({ kind: 'empty' }))
                    const clasesDia = portalHorario.filter(c => c.dia === dia)
                    clasesDia.forEach(c => {
                      const ini = hi(c.hora_inicio), fin = hi(c.hora_fin)
                      // Primera fila cuyo inicio sea >= ini de la clase
                      const startIdx = filasConNombre.findIndex(f => f.inicio === ini)
                      if (startIdx === -1) return
                      // Última fila cuyo fin sea <= fin de la clase, sin cruzar breaks
                      let endIdx = startIdx
                      for (let i = startIdx; i < filasConNombre.length; i++) {
                        const f = filasConNombre[i]
                        if (f.tipo !== 'hora') break
                        if (f.fin > fin) break
                        endIdx = i
                      }
                      const rowSpan = endIdx - startIdx + 1
                      arr[startIdx] = { kind: 'class', clase: c, rowSpan }
                      for (let i = startIdx + 1; i <= endIdx; i++) arr[i] = { kind: 'skip' }
                    })
                    cellsByDay[dia] = arr
                  })

                  return (
                    <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid #E4E8EF' }}>
                      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '92px' }} />
                          {DIAS.map(d => <col key={d} />)}
                        </colgroup>
                        <thead>
                          <tr style={{ background: '#fafafa' }}>
                            <th className="px-2 py-2.5 text-left" style={{ borderBottom: '1.5px solid #E4E8EF' }}>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hora</span>
                            </th>
                            {DIAS.map(d => (
                              <th key={d} className="px-1.5 py-2.5 text-center"
                                style={{ borderBottom: '1.5px solid #E4E8EF', borderLeft: '1px solid #E4E8EF' }}>
                                <span className="text-[11px] font-black text-slate-700">{d.slice(0, 3)}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filasConNombre.map((fila, rowIdx) => {
                            const esRecreo   = fila.tipo === 'recreo'
                            const esAlmuerzo = fila.tipo === 'almuerzo'
                            const esBreak    = esRecreo || esAlmuerzo
                            // Altura fija por fila — necesario para que rowSpan estire visualmente los bloques
                            const ROW_HEIGHT = 52
                            return (
                              <tr key={fila.key} style={{ height: `${ROW_HEIGHT}px` }}>
                                <td className="px-2 align-middle" style={{ borderTop: '1px solid #f5f0ea', height: `${ROW_HEIGHT}px` }}>
                                  <p className="text-[10px] font-black text-slate-600 leading-tight">{fila.nombre}</p>
                                  <p className="text-[9px] text-slate-400 font-mono leading-tight">{fila.inicio}–{fila.fin}</p>
                                </td>
                                {DIAS.map(dia => {
                                  if (esBreak) {
                                    return (
                                      <td key={dia} className="text-center"
                                        style={{
                                          background: esRecreo ? '#fffbeb' : '#f0fdf4',
                                          borderLeft: '1px solid #E4E8EF',
                                          borderTop:  '1px solid #f5f0ea',
                                          padding: 0,
                                        }}>
                                        <span className="text-[10px] font-black uppercase tracking-wider"
                                          style={{ color: esRecreo ? '#d97706' : '#16a34a' }}>
                                          {esRecreo ? 'Recreo' : 'Almuerzo'}
                                        </span>
                                      </td>
                                    )
                                  }
                                  const celda = cellsByDay[dia][rowIdx]
                                  if (celda.kind === 'skip') return null
                                  if (celda.kind === 'empty') {
                                    return (
                                      <td key={dia}
                                        style={{
                                          background: 'white',
                                          borderLeft: '1px solid #E4E8EF',
                                          borderTop:  '1px solid #f5f0ea',
                                          padding: 0,
                                        }} />
                                    )
                                  }
                                  const clase = celda.clase!
                                  const color = colorDeCurso(clase.materia)
                                  const span = celda.rowSpan ?? 1
                                  return (
                                    <td key={dia} rowSpan={span}
                                      style={{
                                        background: 'white',
                                        borderLeft: '1px solid #E4E8EF',
                                        borderTop:  '1px solid #f5f0ea',
                                        padding: '3px',
                                        height: `${ROW_HEIGHT * span}px`,
                                        verticalAlign: 'stretch',
                                      }}>
                                      <div className="w-full rounded-md text-center flex flex-col items-center justify-center"
                                        style={{
                                          background: `${color}1a`,
                                          border: `1.5px solid ${color}55`,
                                          borderLeftWidth: '4px',
                                          borderLeftColor: color,
                                          height: '100%',
                                          minHeight: `${ROW_HEIGHT - 6}px`,
                                          padding: span > 1 ? '8px 6px' : '4px 6px',
                                          gap: '4px',
                                        }}>
                                        <p className="font-black leading-tight" style={{ color, fontSize: span > 1 ? '13px' : '11.5px' }}>
                                          {clase.materia}
                                        </p>
                                        {span > 1 && (
                                          <p className="text-[10px] font-mono" style={{ color, opacity: .75 }}>
                                            {hi(clase.hora_inicio)}–{hi(clase.hora_fin)}
                                          </p>
                                        )}
                                        {span > 1 && (
                                          <p className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                                            style={{ background: `${color}33`, color }}>
                                            {span} {span === 1 ? 'hora' : 'horas'}
                                          </p>
                                        )}
                                      </div>
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ══ COMUNICADOS ══════════════════════════════════════════════════════ */}
        {tab === 'comunicados' && (
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-slate-900 font-black text-xl">Comunicados globales</h2>
                <p className="text-slate-400 text-xs mt-0.5">Visibles para todos los estudiantes y docentes</p>
              </div>
              <button onClick={() => { setAnuncioAbierto(v => !v); setAnuncioError('') }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white"
                style={{ background: 'linear-gradient(135deg,#0d9488,#06b6d4)' }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {anuncioAbierto ? 'Cancelar' : 'Nuevo comunicado'}
              </button>
            </div>

            {anuncioAbierto && (
              <form onSubmit={publicarAnuncio} className="rounded-2xl p-5 space-y-4"
                style={{ background: 'white', border: '1.5px solid #99f6e4', boxShadow: '0 4px 24px rgba(13,148,136,.08)' }}>
                <p className="text-sm font-black text-slate-700">Nuevo comunicado general</p>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Título</label>
                  <input value={anuncioTitulo} onChange={e => setAnuncioTitulo(e.target.value)}
                    placeholder="Ej: Suspensión de clases el viernes"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Contenido</label>
                  <textarea value={anuncioContenido} onChange={e => setAnuncioContenido(e.target.value)}
                    rows={4} placeholder="Escribe el comunicado…"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                    style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }} />
                </div>
                {anuncioError && <p className="text-xs text-red-500 font-semibold">{anuncioError}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAnuncioAbierto(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={anuncioGuardando}
                    className="px-5 py-2 rounded-xl text-xs font-black text-white"
                    style={{ background: 'linear-gradient(135deg,#0d9488,#06b6d4)' }}>
                    {anuncioGuardando ? 'Publicando…' : 'Publicar'}
                  </button>
                </div>
              </form>
            )}

            {loadingAnuncios ? (
              <div className="flex justify-center py-14">
                <svg className="animate-spin h-7 w-7 text-teal-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              </div>
            ) : anuncios.length === 0 ? (
              <div className="rounded-2xl flex flex-col items-center justify-center py-20 gap-4"
                style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
                <svg className="w-10 h-10 text-teal-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
                </svg>
                <p className="text-sm font-bold text-slate-400">Sin comunicados publicados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {anuncios.map(a => {
                  const timeAgoStr = timeAgo(a.created_at)
                  return (
                    <div key={a.id} className="rounded-2xl overflow-hidden"
                      style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
                      <div className="h-1" style={{ background: 'linear-gradient(90deg,#0d9488,#06b6d4)' }} />
                      <div className="p-4 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                              style={{ background: '#f0fdfa', color: '#0d9488' }}>
                              Comunicado general
                            </span>
                            <span className="text-[10px] text-slate-400">{timeAgoStr}</span>
                            <span className="text-[10px] text-slate-300">· {a.autor_nombre}</span>
                          </div>
                          <h3 className="text-sm font-black text-slate-800">{a.titulo}</h3>
                          <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{a.contenido}</p>
                        </div>
                        <button onClick={() => eliminarAnuncio(a.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all hover:bg-red-50"
                          style={{ color: '#94a3b8' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6m4-6v6"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ GUÍA DEL AÑO ESCOLAR ═════════════════════════════════════════════ */}
        {tab === 'anio-escolar' && (() => {
          const g = guiaAnio
          type EstadoPaso = 'listo' | 'pendiente' | 'atencion' | 'na'
          const CHIP: Record<EstadoPaso, { txt: string; style: React.CSSProperties }> = {
            listo:     { txt: 'Listo',          style: { background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' } },
            pendiente: { txt: 'Pendiente',      style: { background: '#fffbeb', border: '1.5px solid #fde68a', color: '#d97706' } },
            atencion:  { txt: 'Revisar',        style: { background: '#fff7ed', border: '1.5px solid #fed7aa', color: '#ea580c' } },
            na:        { txt: 'Falta el ciclo', style: { background: '#F6F8FB', border: '1.5px solid #E4E8EF', color: '#94a3b8' } },
          }
          const sinFechas = !!g?.nuevo && (!g.nuevo.fecha_inicio || !g.nuevo.fecha_fin)
          const pasos: { titulo: string; desc: string; detalle?: string; estado: EstadoPaso; tab: Tab }[] = !g ? [] : [
            {
              titulo: 'Crear el ciclo lectivo nuevo',
              desc: 'Con fecha de inicio y fin de clases (la consulta de notas las usa).',
              detalle: g.nuevo ? (sinFechas ? `${g.nuevo.nombre} creado, pero sin fechas de inicio/fin` : `${g.nuevo.nombre} creado con fechas`) : undefined,
              estado: g.nuevo ? (sinFechas ? 'atencion' : 'listo') : 'pendiente',
              tab: 'ciclos',
            },
            {
              titulo: 'Clonar los cursos del ciclo anterior',
              desc: 'En la tarjeta del ciclo nuevo: copia las combinaciones curso/grado/sección (quedan sin docente).',
              detalle: g.nuevo ? `${g.asigTotal} curso${g.asigTotal !== 1 ? 's' : ''} en ${g.nuevo.nombre}` : undefined,
              estado: !g.nuevo ? 'na' : g.asigTotal > 0 ? 'listo' : 'pendiente',
              tab: 'ciclos',
            },
            {
              titulo: 'Asignar docentes a los cursos',
              desc: 'Se puede hacer antes o después de activar el ciclo.',
              detalle: g.nuevo && g.asigTotal > 0 ? (g.asigSinDocente > 0 ? `${g.asigSinDocente} de ${g.asigTotal} sin docente` : 'Todos los cursos tienen docente') : undefined,
              estado: !g.nuevo || g.asigTotal === 0 ? 'na' : g.asigSinDocente > 0 ? 'atencion' : 'listo',
              tab: 'cursos',
            },
            {
              titulo: 'Matricular / promover estudiantes',
              desc: 'La promoción de grado ES la matrícula: elige el ciclo nuevo y el grado que le toca a cada estudiante.',
              detalle: g.nuevo ? `${g.matriculas} matrícula${g.matriculas !== 1 ? 's' : ''} en ${g.nuevo.nombre}` : undefined,
              estado: !g.nuevo ? 'na' : g.matriculas > 0 ? 'listo' : 'pendiente',
              tab: 'matricula',
            },
            {
              titulo: 'Crear los bimestres del año',
              desc: 'En Planificación usa «Copiar año anterior» para traer bimestres, plantillas y planes de una vez.',
              detalle: g.nuevo ? `${g.bimestres} bimestre${g.bimestres !== 1 ? 's' : ''} de ${g.nuevo.anio}` : undefined,
              estado: !g.nuevo ? 'na' : g.bimestres > 0 ? 'listo' : 'pendiente',
              tab: 'planificacion',
            },
            {
              titulo: 'Planes anuales por curso',
              desc: 'Objetivos y sesiones de cada curso/grado para el año nuevo.',
              detalle: g.nuevo ? `${g.planes} plan${g.planes !== 1 ? 'es' : ''} anual${g.planes !== 1 ? 'es' : ''} de ${g.nuevo.anio}` : undefined,
              estado: !g.nuevo ? 'na' : g.planes > 0 ? 'listo' : 'pendiente',
              tab: 'planificacion',
            },
            {
              titulo: 'El día del cambio: activar el ciclo',
              desc: 'Todo el sistema pasa al ciclo nuevo y los estudiantes toman el salón de su matrícula. Hazlo cuando los pasos anteriores estén listos.',
              estado: !g.nuevo ? 'na' : 'pendiente',
              tab: 'ciclos',
            },
          ]
          const listos = pasos.filter(p => p.estado === 'listo').length
          return (
            <div className="space-y-4 max-w-4xl mx-auto">
              {/* Cabecera */}
              <div className="rounded-2xl overflow-hidden" style={card}>
                {accentBar}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-slate-900 font-black text-xl">Guía del Año Escolar</h2>
                      <p className="text-slate-400 text-xs mt-0.5 max-w-lg">
                        Todo lo necesario para preparar el nuevo año en un solo lugar y en orden.
                        Nada afecta a docentes ni estudiantes hasta que actives el ciclo nuevo.
                      </p>
                    </div>
                    <button onClick={cargarGuiaAnio} disabled={loadingGuiaAnio}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                      style={{ background: '#F1F5F9', border: '1.5px solid #E4E8EF', color: '#0B2447' }}>
                      {loadingGuiaAnio ? <Spinner cls="h-3.5 w-3.5 text-indigo-900"/> : (
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                        </svg>
                      )}
                      Actualizar
                    </button>
                  </div>
                  {g && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                        style={{ background: '#0B2447', color: '#fff' }}>
                        Ciclo activo: {g.activo?.nombre ?? 'ninguno'}
                      </span>
                      {g.nuevo ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                          style={{ background: '#fffbeb', border: '1.5px solid #fde68a', color: '#d97706' }}>
                          En preparación: {g.nuevo.nombre}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                          style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF', color: '#64748b' }}>
                          Aún no hay ciclo nuevo en preparación
                        </span>
                      )}
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                        style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' }}>
                        {listos} de {pasos.length} pasos listos
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {loadingGuiaAnio || !g ? (
                <div className="rounded-2xl overflow-hidden" style={card}>
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <Spinner cls="h-8 w-8 text-indigo-800"/>
                    <p className="text-slate-400 text-sm">Revisando el estado del año escolar...</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl overflow-hidden" style={card}>
                  {pasos.map((p, i) => {
                    const chip = CHIP[p.estado]
                    return (
                      <div key={i} className="px-4 py-4 flex items-start gap-3"
                        style={{ borderBottom: i < pasos.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        {/* Número del paso */}
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={p.estado === 'listo'
                            ? { background: '#059669', color: '#fff' }
                            : { background: '#F1F5F9', border: '1.5px solid #E4E8EF', color: '#0B2447' }}>
                          {p.estado === 'listo'
                            ? <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            : <span className="text-xs font-black">{i + 1}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-slate-800 font-bold text-sm">{p.titulo}</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={chip.style}>{chip.txt}</span>
                          </div>
                          <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">{p.desc}</p>
                          {p.detalle && (
                            <p className="text-[11px] font-semibold mt-1"
                              style={{ color: p.estado === 'atencion' ? '#ea580c' : '#475569' }}>
                              {p.detalle}
                            </p>
                          )}
                        </div>
                        <button onClick={() => switchTab(p.tab)}
                          className="shrink-0 flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all mt-0.5"
                          style={{ background: '#0B2447', color: '#fff' }}>
                          Abrir
                          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Nota */}
              <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
                style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', color: '#075985' }}>
                <svg className="shrink-0 mt-0.5 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>
                  No hace falta editar el grado/grupo de cada estudiante a mano: al activar el ciclo, cada uno toma
                  el salón de su matrícula. Las tareas, notas y asistencias del año anterior quedan intactas.
                </span>
              </div>
            </div>
          )
        })()}

        {/* ══ CICLOS ACADÉMICOS ════════════════════════════════════════════════ */}
        {tab === 'ciclos' && (() => {
          const ciclo_activo = ciclos.find(c => c.activo)
          const ciclos_otros = ciclos.filter(c => !c.activo).sort((a, b) =>
            (b.anio - a.anio) || (b.periodo - a.periodo))
          const total_secciones = combosActivos.length
          const total_grados    = new Set(combosActivos.map(c => c.grado)).size
          const total_con_nombre = combosActivos.filter(c => (salones[`${c.grado}-${c.grupo}`] ?? '').trim()).length
          const NAVY_RED = '#0B2447'
          const GOLD     = '#1E40AF'

          return (
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* ── Encabezado editorial ── */}
              <div className="flex items-end justify-between flex-wrap gap-4">
                <div>
                  <p className="text-[10px] font-black tracking-[.3em] uppercase mb-2" style={{ color: GOLD }}>
                    Periodo lectivo
                  </p>
                  <h2 className="text-slate-900 font-black text-2xl leading-tight">Ciclos académicos</h2>
                  <p className="text-slate-500 text-sm mt-1.5 max-w-xl">
                    Crea, clona y activa los periodos lectivos. Solo un ciclo puede estar activo a la vez.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] font-black px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600">
                    {ciclos.length} {ciclos.length === 1 ? 'ciclo' : 'ciclos'}
                  </span>
                </div>
              </div>

              {/* ── Hero del ciclo activo ── */}
              {ciclo_activo && (
                <div className="rounded-3xl overflow-hidden relative"
                  style={{ background: `linear-gradient(135deg,${NAVY_RED} 0%,#1E3A8A 55%,#a01b2e 100%)`,
                    boxShadow: '0 16px 48px rgba(11,36,71,.25)' }}>
                  {/* Patrón sutil */}
                  <div className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle, rgba(201,152,42,.5) 1px, transparent 1.5px)', backgroundSize: '28px 28px' }} />
                  <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgba(201,152,42,.35), transparent 65%)', filter: 'blur(40px)' }} />

                  <div className="relative p-7 sm:p-8 grid sm:grid-cols-[1fr_auto] gap-6 items-center">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[9px] font-black tracking-[.3em] uppercase px-2.5 py-1 rounded-full"
                          style={{ background: 'rgba(220,252,231,.18)', border: '1px solid rgba(134,239,172,.4)', color: '#bbf7d0' }}>
                          ● Ciclo activo
                        </span>
                      </div>
                      <p className="text-white text-5xl sm:text-6xl font-black tracking-tight leading-none"
                        style={{ fontFamily: "var(--dm,'DM Sans')", fontFeatureSettings: "'tnum' 1,'lnum' 1" }}>
                        {ciclo_activo.nombre}
                      </p>
                      <p className="text-amber-100/80 text-sm font-semibold mt-2 tracking-wide">
                        Periodo {ciclo_activo.periodo} · Año {ciclo_activo.anio}
                      </p>

                      {/* Stats inline */}
                      <div className="flex flex-wrap gap-5 mt-5 pt-5"
                        style={{ borderTop: '1px solid rgba(255,255,255,.12)' }}>
                        <div>
                          <p className="text-amber-100/70 text-[10px] font-black uppercase tracking-widest">Grados</p>
                          <p className="text-white text-2xl font-black mt-0.5"
                            style={{ fontFeatureSettings: "'tnum' 1,'lnum' 1" }}>{total_grados}</p>
                        </div>
                        <div className="w-px self-stretch bg-white/15" />
                        <div>
                          <p className="text-amber-100/70 text-[10px] font-black uppercase tracking-widest">Secciones</p>
                          <p className="text-white text-2xl font-black mt-0.5"
                            style={{ fontFeatureSettings: "'tnum' 1,'lnum' 1" }}>{total_secciones}</p>
                        </div>
                        <div className="w-px self-stretch bg-white/15" />
                        <div>
                          <p className="text-amber-100/70 text-[10px] font-black uppercase tracking-widest">Nombradas</p>
                          <p className="text-white text-2xl font-black mt-0.5"
                            style={{ fontFeatureSettings: "'tnum' 1,'lnum' 1" }}>
                            {total_con_nombre}<span className="text-amber-100/50 text-base font-bold">/{total_secciones || 0}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Clonar desde otro ciclo hacia el activo */}
                    {ciclos.length > 1 && (
                      <div className="rounded-2xl p-4 backdrop-blur"
                        style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', minWidth: 220 }}>
                        <p className="text-amber-100 text-[10px] font-black uppercase tracking-widest mb-2">Clonar cursos</p>
                        <select value={clonarDesde} onChange={e => setClonarDesde(e.target.value)}
                          className="w-full text-xs font-semibold rounded-lg px-2.5 py-2 outline-none mb-2"
                          style={{ background: 'rgba(255,255,255,.95)', color: '#1c1917' }}>
                          <option value="">— Origen —</option>
                          {ciclos.filter(x => x.id !== ciclo_activo.id).map(x => (
                            <option key={x.id} value={x.id}>{x.nombre}</option>
                          ))}
                        </select>
                        <button
                          disabled={!clonarDesde || clonarLoading}
                          onClick={() => { setCicloMsg(''); clonarCiclo(clonarDesde, ciclo_activo.id) }}
                          className="w-full text-[11px] font-black px-3 py-2 rounded-lg disabled:opacity-40 transition-all"
                          style={{ background: GOLD, color: NAVY_RED }}>
                          {clonarLoading ? 'Clonando…' : 'Clonar al activo'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── 2 columnas: Crear + Historial ── */}
              <div className="grid lg:grid-cols-[1.1fr_1fr] gap-5">

                {/* Crear nuevo ciclo */}
                <div className="rounded-2xl overflow-hidden" style={card}>
                  {accentBar}
                  <div className="p-5">
                    <div className="flex items-center gap-2.5 mb-1">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: '#fef2f2', color: NAVY_RED, border: '1px solid #fecaca' }}>
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800">Crear nuevo ciclo</p>
                        <p className="text-[11px] text-slate-400">Se creará vacío. Luego puedes clonar cursos del ciclo activo.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_120px] gap-3 mt-4">
                      <div>
                        <label className={labelCls}>Año</label>
                        <input type="number" min={2024} max={2040} value={cicloForm.anio}
                          onChange={e => setCicloForm(p => ({ ...p, anio: Number(e.target.value) }))}
                          className={inputCls}
                          style={{ fontFeatureSettings: "'tnum' 1,'lnum' 1" }} />
                      </div>
                      <div>
                        <label className={labelCls}>Periodo</label>
                        <select value={cicloForm.periodo}
                          onChange={e => setCicloForm(p => ({ ...p, periodo: Number(e.target.value) as 1|2 }))}
                          className={selectCls}>
                          <option value={1}>1 (Primero)</option>
                          <option value={2}>2 (Segundo)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className={labelCls}>Inicio de clases</label>
                        <input type="date" value={cicloForm.fecha_inicio}
                          onChange={e => setCicloForm(p => ({ ...p, fecha_inicio: e.target.value }))}
                          className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Fin de clases</label>
                        <input type="date" value={cicloForm.fecha_fin}
                          onChange={e => setCicloForm(p => ({ ...p, fecha_fin: e.target.value }))}
                          className={inputCls} />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Recomendado: la consulta de notas usa estas fechas para acotar la asistencia del ciclo.
                    </p>

                    {(() => {
                      const dup = ciclos.find(c => c.anio === cicloForm.anio && c.periodo === cicloForm.periodo)
                      return (
                        <>
                          {dup && (
                            <div className="mt-3 flex items-start gap-2 text-xs font-semibold p-2.5 rounded-lg"
                              style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309' }}>
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" style={{ flex: 'none', marginTop: 1 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                              </svg>
                              <p>
                                El ciclo <b>{dup.nombre}</b> ya existe{dup.activo ? ' y es el ciclo activo' : ' (míralo en el historial de al lado)'}.
                                {' '}Para preparar el año siguiente cambia el año, por ejemplo a <b>{Math.max(...ciclos.map(c => c.anio)) + 1}</b>.
                              </p>
                            </div>
                          )}
                          <button onClick={crearCiclo} disabled={creandoCiclo || !!dup}
                            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black text-white disabled:opacity-50 transition-all active:scale-[.98]"
                            style={{ background: `linear-gradient(135deg,${NAVY_RED},#1E3A8A)`, boxShadow: '0 6px 20px rgba(11,36,71,.28)' }}>
                            {creandoCiclo
                              ? <Spinner cls="h-4 w-4 text-white"/>
                              : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>}
                            {dup ? `El ciclo ${cicloForm.anio}–${cicloForm.periodo} ya existe` : `Crear ciclo ${cicloForm.anio}–${cicloForm.periodo}`}
                          </button>
                        </>
                      )
                    })()}

                    {cicloMsg && (
                      <div className={`mt-3 flex items-start gap-2 text-xs font-semibold p-2.5 rounded-lg ${cicloMsg.startsWith('Error') ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" style={{ flex: 'none', marginTop: 1 }}>
                          {cicloMsg.startsWith('Error')
                            ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                            : <polyline points="20 6 9 17 4 12"/>}
                        </svg>
                        <p>{cicloMsg}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Historial / otros ciclos */}
                <div className="rounded-2xl overflow-hidden flex flex-col" style={card}>
                  {accentBar}
                  <div className="px-5 py-4" style={{ borderBottom: '1px solid #E4E8EF' }}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ background: '#fef9e7', color: GOLD, border: '1px solid #fde68a' }}>
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800">Otros ciclos</p>
                          <p className="text-[11px] text-slate-400">Historial · inactivos</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                        {ciclos_otros.length}
                      </span>
                    </div>
                  </div>

                  {loadingCiclos ? (
                    <div className="flex-1 flex justify-center items-center py-12"><Spinner cls="h-6 w-6 text-indigo-800"/></div>
                  ) : ciclos_otros.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-10 px-5 text-center">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                        style={{ background: '#faf6e7', border: '1px solid #fde68a' }}>
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke={GOLD} strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                      </div>
                      <p className="text-slate-500 font-bold text-sm">Sin ciclos anteriores</p>
                      <p className="text-slate-400 text-xs mt-1">Crea otro periodo para verlo aquí</p>
                    </div>
                  ) : (
                    <div className="flex-1 p-3 space-y-2 max-h-[280px] overflow-y-auto">
                      {ciclos_otros.map(c => (
                        <div key={c.id}
                          className="rounded-xl p-3 flex items-center gap-3 transition-all hover:shadow-sm"
                          style={{ background: '#fafaf9', border: '1px solid #e7e5e4' }}>
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-black text-[11px] text-slate-600"
                            style={{ background: 'white', border: '1.5px solid #e7e5e4', fontFeatureSettings: "'tnum' 1,'lnum' 1" }}>
                            {c.nombre}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-700 truncate">Año {c.anio} · P{c.periodo}</p>
                            <p className="text-[10px] text-slate-400">Inactivo</p>
                          </div>
                          <button onClick={() => activarCiclo(c.id)} disabled={activandoCicloId === c.id}
                            className="text-[10px] font-black px-3 py-1.5 rounded-lg disabled:opacity-40 transition-all active:scale-95 shrink-0"
                            style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d' }}>
                            {activandoCicloId === c.id ? '…' : 'Activar'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Grados + sobrenombres del ciclo activo ── */}
              <div className="rounded-2xl overflow-hidden" style={card}>
                {accentBar}
                <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: '1px solid #E4E8EF' }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: '#fef2f2', color: NAVY_RED, border: '1px solid #fecaca' }}>
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="3" width="16" height="18" rx="2"/>
                        <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h6"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">Grados y secciones del ciclo activo</p>
                      <p className="text-[11px] text-slate-400">Asigna un sobrenombre a cada sección (ej. &ldquo;Los Cóndores&rdquo;)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black">
                    <span className="px-2.5 py-1.5 rounded-full" style={{ background: '#fef2f2', color: NAVY_RED, border: '1px solid #fecaca' }}>
                      {total_secciones} {total_secciones === 1 ? 'sección' : 'secciones'}
                    </span>
                    {total_secciones > 0 && (
                      <span className="px-2.5 py-1.5 rounded-full" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                        {total_con_nombre}/{total_secciones} con nombre
                      </span>
                    )}
                  </div>
                </div>

                {combosActivos.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: '#fafaf9', border: '1px solid #e7e5e4' }}>
                      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#a8a29e" strokeWidth="1.8">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h6"/>
                      </svg>
                    </div>
                    <p className="text-slate-500 font-bold text-sm">No hay asignaciones en el ciclo activo</p>
                    <p className="text-slate-400 text-xs mt-1">Asigna cursos a docentes para que aparezcan los grados aquí</p>
                  </div>
                ) : (
                  <div className="p-5 space-y-6">
                    {Array.from(new Set(combosActivos.map(c => c.grado))).map(grado => {
                      const grupos = combosActivos.filter(c => c.grado === grado)
                      return (
                        <div key={grado}>
                          {/* Cabecera grado */}
                          <div className="flex items-center gap-3 mb-3">
                            <div className="h-5 w-1 rounded-full" style={{ background: `linear-gradient(180deg,${NAVY_RED},${GOLD})` }} />
                            <p className="text-[11px] font-black text-slate-700 uppercase tracking-[.2em]">{grado}</p>
                            <span className="text-[9px] font-bold text-slate-400 px-2 py-0.5 rounded-full bg-slate-100">{grupos.length}</span>
                            <div className="flex-1 h-px bg-slate-100" />
                          </div>

                          {/* Grid de secciones */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {grupos.map(({ grupo }) => {
                              const key    = `${grado}-${grupo}`
                              const nombre = salones[key] ?? ''
                              const isEdit = salonEditKey === key
                              const tieneNombre = !!nombre

                              return (
                                <div key={key} className="rounded-xl p-3.5 transition-all"
                                  style={{
                                    background: tieneNombre ? '#fef9e7' : 'white',
                                    border: `1.5px solid ${tieneNombre ? '#fde68a' : '#e7e5e4'}`,
                                    boxShadow: tieneNombre ? '0 2px 8px rgba(201,152,42,.08)' : 'none',
                                  }}>
                                  {/* Fila superior: sección + estado */}
                                  <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm"
                                        style={{
                                          background: tieneNombre ? GOLD : '#fafaf9',
                                          color: tieneNombre ? 'white' : '#a8a29e',
                                          border: tieneNombre ? 'none' : '1px solid #e7e5e4',
                                        }}>
                                        {grupo}
                                      </div>
                                      <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[.18em]">Sección</p>
                                        {tieneNombre ? (
                                          <p className="text-xs font-black truncate max-w-[140px]" style={{ color: '#1E3A8A' }}>{nombre}</p>
                                        ) : (
                                          <p className="text-[11px] font-semibold text-slate-400 italic">Sin nombre</p>
                                        )}
                                      </div>
                                    </div>
                                    {tieneNombre && !isEdit && (
                                      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                                        style={{ background: GOLD, color: 'white' }}>
                                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                                          <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                      </span>
                                    )}
                                  </div>

                                  {/* Input o botón editar */}
                                  {isEdit ? (
                                    <div className="flex gap-1.5">
                                      <input
                                        autoFocus
                                        value={salonEditValor}
                                        onChange={e => setSalonEditValor(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') guardarSalon(grado, grupo, salonEditValor)
                                          if (e.key === 'Escape') setSalonEditKey(null)
                                        }}
                                        placeholder="Ej. Los Cóndores"
                                        className="flex-1 text-xs font-semibold px-2.5 py-2 rounded-lg outline-none min-w-0"
                                        style={{ border: `1.5px solid ${GOLD}`, background: 'white' }}
                                      />
                                      <button onClick={() => guardarSalon(grado, grupo, salonEditValor)}
                                        disabled={salonSaving}
                                        className="px-2.5 py-2 rounded-lg text-white text-xs font-black hover:opacity-90 disabled:opacity-50"
                                        style={{ background: GOLD }}
                                        aria-label="Guardar">
                                        {salonSaving
                                          ? <Spinner cls="h-3 w-3 text-white"/>
                                          : <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                                      </button>
                                      <button onClick={() => setSalonEditKey(null)}
                                        className="px-2 py-2 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-100"
                                        aria-label="Cancelar">
                                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => { setSalonEditKey(key); setSalonEditValor(nombre) }}
                                      className="w-full flex items-center justify-between gap-2 text-left text-xs font-semibold rounded-lg px-3 py-2 transition-all"
                                      style={{
                                        border: `1px ${tieneNombre ? 'solid' : 'dashed'} ${tieneNombre ? '#fde68a' : '#d6d3d1'}`,
                                        background: tieneNombre ? 'white' : '#fafaf9',
                                        color: tieneNombre ? '#1E3A8A' : '#78716c',
                                      }}>
                                      <span>{tieneNombre ? 'Editar nombre' : 'Añadir sobrenombre'}</span>
                                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>
          )
        })()}

        {/* ══ MATRÍCULA (Wizard 4 pasos) ═══════════════════════════════════════ */}
        {tab === 'matricula' && (() => {
          const TIPOS: { id: WizTipo; label: string; desc: string; color: string; icon: React.ReactNode }[] = [
            { id: 'nuevo', label: 'Estudiante nuevo', color: '#0d9488', desc: 'Primera vez en la escuela. Se creará su ficha de estudiante.',
              icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg> },
            { id: 'continuidad', label: 'Continuidad', color: '#0B2447', desc: 'Estudiante del año anterior que pasa al siguiente grado.',
              icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg> },
            { id: 'reincorporacion', label: 'Reincorporación', color: '#d97706', desc: 'Estudiante existente que estuvo fuera 1 o más ciclos.',
              icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> },
            { id: 'traslado', label: 'Traslado externo', color: '#0B2447', desc: 'Viene de otra institución. Requiere certificado de estudios.',
              icon: <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
          ]
          const tipoElegido = TIPOS.find(t => t.id === wizTipo)
          const cicloElegido = ciclos.find(c => c.id === wizCicloId)
          const puedeAvanzar = (() => {
            if (wizPaso === 1) return !!wizTipo
            if (wizPaso === 2) {
              if (wizTipo === 'nuevo') return wizNuevoForm.nombre.trim() && wizNuevoForm.apellidos.trim() && wizNuevoForm.dni.trim()
              return !!wizAlumno
            }
            if (wizPaso === 3) return !!wizCicloId && !!wizGrado && !!wizGrupo
            return false
          })()

          const ESTADO_BADGE: Record<string, { label: string; bg: string; color: string }> = {
            matriculada:    { label: 'Matriculado',   bg: '#DCFCE7', color: '#166534' },
            pendiente_docs: { label: 'Pend. docs',    bg: '#FEF9C3', color: '#854D0E' },
            borrador:       { label: 'Borrador',      bg: '#F1F5F9', color: '#64748B' },
            anulada:        { label: 'Anulada',       bg: '#F1F5F9', color: '#94A3B8' },
            retirado:       { label: 'Retirado',      bg: '#FEE2E2', color: '#991B1B' },
            trasladado:     { label: 'Trasladado',    bg: '#E0E7FF', color: '#3730A3' },
          }
          const cicloActivoNombre = ciclos.find(c => c.activo)?.nombre ?? '—'
          const matriculadosFiltrados = matriculados.filter(m => {
            const q = matriculadosBusq.trim().toLowerCase()
            if (!q) return true
            return `${m.nombre} ${m.apellidos ?? ''} ${m.dni ?? ''} ${m.grado} ${m.grupo}`.toLowerCase().includes(q)
          })

          return (
            <div className="space-y-5 max-w-4xl mx-auto">
              {/* Header + selector de vista */}
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-slate-900 font-black text-xl">
                    {matriculaVista === 'wizard' ? 'Proceso de matrícula'
                      : matriculaVista === 'lista' ? `Matriculados — ciclo ${cicloActivoNombre}`
                      : 'Historial de bajas'}
                  </h2>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {matriculaVista === 'wizard' ? 'Completa los 4 pasos para registrar la matrícula'
                      : matriculaVista === 'lista' ? 'Retiros y traslados se registran aquí, sin borrar el historial'
                      : 'Estudiantes retirados o trasladados — su información se conserva'}
                  </p>
                </div>
                <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: '#E4E8EF' }}>
                  {([['wizard', 'Nueva matrícula'], ['lista', 'Matriculados'], ['historial', 'Historial de bajas']] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setMatriculaVista(id)}
                      className="px-3.5 py-2 text-xs font-black transition-colors"
                      style={matriculaVista === id
                        ? { background: '#0B2447', color: 'white' }
                        : { background: 'white', color: '#64748B' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Vista: lista de matriculados ── */}
              {matriculaVista === 'lista' && (
                <div className="rounded-2xl overflow-hidden" style={card}>
                  {accentBar}
                  <div className="p-4 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid #E4E8EF' }}>
                    <input value={matriculadosBusq} onChange={e => setMatriculadosBusq(e.target.value)}
                      placeholder="Buscar por nombre, DNI o salón…"
                      className="flex-1 min-w-[220px] px-3.5 py-2.5 rounded-xl border text-sm font-medium outline-none"
                      style={{ borderColor: '#E4E8EF' }} />
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                      {matriculadosFiltrados.length} de {matriculados.length}
                    </span>
                  </div>
                  {bajaMsg && (
                    <div className={`mx-4 mt-3 text-xs font-bold p-2.5 rounded-lg ${bajaMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {bajaMsg}
                    </div>
                  )}
                  {listaMatLoading ? (
                    <div className="p-10 flex justify-center"><Spinner cls="h-6 w-6" /></div>
                  ) : matriculadosFiltrados.length === 0 ? (
                    <p className="p-10 text-center text-sm font-bold text-slate-400">Sin matrículas en este ciclo</p>
                  ) : (
                    <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                      {matriculadosFiltrados.map(m => {
                        const badge = ESTADO_BADGE[m.estado] ?? ESTADO_BADGE.borrador
                        const deBaja = m.estado === 'retirado' || m.estado === 'trasladado'
                        return (
                          <div key={m.matId} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                              <p className="text-sm font-black text-slate-800">
                                {(m.apellidos ?? '')} {m.nombre}
                              </p>
                              <p className="text-[11px] text-slate-400 font-semibold">
                                {m.grado} {m.grupo} · DNI {m.dni ?? '—'}
                                {deBaja && m.fecha_baja && ` · baja: ${new Date(m.fecha_baja).toLocaleDateString('es-PE')}`}
                                {deBaja && m.motivo_baja && ` · ${m.motivo_baja}`}
                              </p>
                            </div>
                            <span className="text-[10px] font-black px-2.5 py-1 rounded-full"
                              style={{ background: badge.bg, color: badge.color }}>
                              {badge.label}
                            </span>
                            {!deBaja && (
                              <div className="flex gap-1.5">
                                <button onClick={() => darBajaAlumno(m, 'trasladado')}
                                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white hover:bg-indigo-50 transition-colors"
                                  style={{ borderColor: '#C7D2FE', color: '#3730A3' }}>
                                  Traslado
                                </button>
                                <button onClick={() => darBajaAlumno(m, 'retirado')}
                                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white hover:bg-red-50 transition-colors"
                                  style={{ borderColor: '#FECACA', color: '#991B1B' }}>
                                  Retirar
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Vista: historial de bajas ── */}
              {matriculaVista === 'historial' && (
                <div className="rounded-2xl overflow-hidden" style={card}>
                  {accentBar}
                  {listaMatLoading ? (
                    <div className="p-10 flex justify-center"><Spinner cls="h-6 w-6" /></div>
                  ) : bajas.length === 0 ? (
                    <p className="p-10 text-center text-sm font-bold text-slate-400">
                      No hay estudiantes dados de baja — el historial está vacío
                    </p>
                  ) : (
                    <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                      {bajas.map(b => {
                        const badge = b.estado ? ESTADO_BADGE[b.estado] : null
                        return (
                          <div key={b.alumnoId} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                              <p className="text-sm font-black text-slate-800">
                                {(b.apellidos ?? '')} {b.nombre}
                              </p>
                              <p className="text-[11px] text-slate-400 font-semibold">
                                DNI {b.dni ?? '—'}
                                {b.cicloNombre && ` · última matrícula: ${b.cicloNombre}${b.grado ? ` (${b.grado} ${b.grupo})` : ''}`}
                                {b.fecha_baja && ` · baja: ${new Date(b.fecha_baja).toLocaleDateString('es-PE')}`}
                              </p>
                              {b.motivo_baja && (
                                <p className="text-[11px] text-slate-500 italic mt-0.5">“{b.motivo_baja}”</p>
                              )}
                            </div>
                            {badge && (
                              <span className="text-[10px] font-black px-2.5 py-1 rounded-full"
                                style={{ background: badge.bg, color: badge.color }}>
                                {badge.label}
                              </span>
                            )}
                            <button onClick={() => iniciarReincorporacion(b)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-black border bg-white hover:bg-amber-50 transition-colors"
                              style={{ borderColor: '#FDE68A', color: '#B45309' }}>
                              Reincorporar
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {matriculaVista === 'wizard' && <>
              {/* Stepper */}
              <div className="flex items-center gap-2">
                {['Tipo', 'Alumno', 'Asignación', 'Confirmar'].map((label, i) => {
                  const num = (i + 1) as 1 | 2 | 3 | 4
                  const completado = wizPaso > num
                  const activo = wizPaso === num
                  return (
                    <div key={num} className="flex items-center flex-1">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 transition-all"
                        style={{
                          background: completado || activo ? 'linear-gradient(135deg,#0B2447,#1E3A8A)' : '#f1f5f9',
                          color: completado || activo ? 'white' : '#94a3b8',
                          boxShadow: activo ? '0 4px 14px rgba(11,36,71,.3)' : 'none',
                        }}>
                        {completado ? '✓' : num}
                      </div>
                      <div className="ml-2 hidden sm:block">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Paso {num}</p>
                        <p className="text-xs font-bold leading-tight mt-0.5" style={{ color: activo || completado ? '#0B2447' : '#94a3b8' }}>{label}</p>
                      </div>
                      {i < 3 && <div className="h-0.5 flex-1 ml-3" style={{ background: completado ? '#0B2447' : '#e2e8f0' }} />}
                    </div>
                  )
                })}
              </div>

              {/* Contenedor del paso actual */}
              <div className="rounded-2xl overflow-hidden" style={card}>
                {accentBar}
                <div className="p-6 min-h-[300px]">

                  {/* ── Paso 1: Tipo ─────────────────────────────────────────── */}
                  {wizPaso === 1 && (
                    <div className="space-y-4">
                      <p className="text-sm font-bold text-slate-700">¿Qué tipo de matrícula vas a registrar?</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {TIPOS.map(t => {
                          const sel = wizTipo === t.id
                          return (
                            <button key={t.id} onClick={() => setWizTipo(t.id)}
                              className="text-left rounded-xl p-4 transition-all"
                              style={{
                                background: sel ? `${t.color}0d` : 'white',
                                border: sel ? `2px solid ${t.color}` : '2px solid #E4E8EF',
                                boxShadow: sel ? `0 6px 20px ${t.color}22` : '0 1px 2px rgba(0,0,0,.03)',
                              }}>
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
                                  style={{ background: t.color }}>
                                  {t.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-black text-slate-800">{t.label}</p>
                                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{t.desc}</p>
                                </div>
                                {sel && (
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: t.color }}>
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="3">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                    </svg>
                                  </div>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Paso 2: Alumno ──────────────────────────────────────── */}
                  {wizPaso === 2 && wizTipo === 'nuevo' && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-bold text-slate-700">Datos del estudiante nuevo</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Se creará su ficha en la tabla de estudiantes al confirmar</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Nombres *</label>
                          <input type="text" value={wizNuevoForm.nombre}
                            onChange={e => setWizNuevoForm(f => ({ ...f, nombre: e.target.value }))}
                            className={inputCls} placeholder="Ej. Guido Cristhian"/>
                        </div>
                        <div>
                          <label className={labelCls}>Apellidos *</label>
                          <input type="text" value={wizNuevoForm.apellidos}
                            onChange={e => setWizNuevoForm(f => ({ ...f, apellidos: e.target.value }))}
                            className={inputCls} placeholder="Ej. Quillimamani Soncco"/>
                        </div>
                        <div>
                          <label className={labelCls}>DNI *</label>
                          <input type="text" value={wizNuevoForm.dni}
                            onChange={e => setWizNuevoForm(f => ({ ...f, dni: e.target.value }))}
                            className={inputCls} maxLength={8} placeholder="8 dígitos"/>
                        </div>
                        <div>
                          <label className={labelCls}>Código de estudiante</label>
                          <input type="text" value={wizNuevoForm.codigo_estudiante}
                            onChange={e => setWizNuevoForm(f => ({ ...f, codigo_estudiante: e.target.value }))}
                            className={inputCls} placeholder="Opcional"/>
                        </div>
                        <div>
                          <label className={labelCls}>Fecha de nacimiento</label>
                          <input type="date" value={wizNuevoForm.fecha_nacimiento}
                            onChange={e => setWizNuevoForm(f => ({ ...f, fecha_nacimiento: e.target.value }))}
                            className={inputCls}/>
                        </div>
                        <div>
                          <label className={labelCls}>Sexo</label>
                          <select value={wizNuevoForm.sexo}
                            onChange={e => setWizNuevoForm(f => ({ ...f, sexo: e.target.value }))}
                            className={selectCls}>
                            <option value="">—</option>
                            <option value="M">Masculino</option>
                            <option value="F">Femenino</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                  {wizPaso === 2 && wizTipo && wizTipo !== 'nuevo' && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-bold text-slate-700">Selecciona el estudiante</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Busca por nombre, apellido, DNI o código</p>
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/></svg>
                          </div>
                          <input type="text" placeholder="Nombre o DNI..." value={wizSearchTexto}
                            onChange={e => setWizSearchTexto(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') wizardBuscarAlumno() }}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                            style={{ background: 'white', border: '1.5px solid #E4E8EF' }}/>
                        </div>
                        <button onClick={wizardBuscarAlumno} disabled={!wizSearchTexto.trim() || wizSearchLoading}
                          className="px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-95 disabled:opacity-40"
                          style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                          {wizSearchLoading ? 'Buscando…' : 'Buscar'}
                        </button>
                      </div>
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {wizSearchResult.length === 0 && !wizSearchLoading && (
                          <p className="text-slate-400 text-sm text-center py-8">Apreta Enter o el botón Buscar</p>
                        )}
                        {wizSearchResult.map(a => {
                          const sel = wizAlumno?.id === a.id
                          return (
                            <button key={a.id} onClick={() => setWizAlumno(a)}
                              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all"
                              style={{
                                background: sel ? 'linear-gradient(135deg,#0B2447,#1E3A8A)' : 'white',
                                border: sel ? '1.5px solid transparent' : '1.5px solid #e8e2d8',
                                boxShadow: sel ? '0 4px 14px rgba(11,36,71,.25)' : 'none',
                              }}>
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-sm"
                                style={{ background: sel ? 'rgba(255,255,255,.2)' : 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white' }}>
                                {(a.apellidos || a.nombre || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold truncate ${sel ? 'text-white' : 'text-slate-800'}`}>
                                  {(a.apellidos || '') + (a.apellidos ? ', ' : '') + a.nombre}
                                </p>
                                <p className={`text-[10px] font-medium truncate ${sel ? 'text-white/70' : 'text-slate-400'}`}>
                                  {[a.dni && `DNI ${a.dni}`, a.codigo_estudiante && `Cód ${a.codigo_estudiante}`].filter(Boolean).join(' · ') || '—'}
                                </p>
                              </div>
                              {sel && <span className="text-[10px] font-black text-white">SELECCIONADO</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Paso 3: Asignación ──────────────────────────────────── */}
                  {wizPaso === 3 && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-bold text-slate-700">Ciclo, grado y sección</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Define dónde se va a matricular</p>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>Ciclo *</label>
                          <select value={wizCicloId} onChange={e => setWizCicloId(e.target.value)} className={selectCls}>
                            <option value="">— elige —</option>
                            {ciclos.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.activo ? ' (activo)' : ''}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Grado *</label>
                          <select value={wizGrado} onChange={e => setWizGrado(e.target.value)} className={selectCls}>
                            <option value="">— elige —</option>
                            {GRADOS.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Sección *</label>
                          <select value={wizGrupo} onChange={e => setWizGrupo(e.target.value)} className={selectCls}>
                            <option value="">— elige —</option>
                            {GRUPOS.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Observaciones (opcional)</label>
                        <textarea value={wizObs} onChange={e => setWizObs(e.target.value)}
                          rows={3} placeholder="Notas internas, motivo del traslado, etc."
                          className="w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-800 outline-none transition-all bg-slate-50 border border-slate-200 focus:border-indigo-900 focus:ring-2 focus:ring-indigo-100"/>
                      </div>
                    </div>
                  )}

                  {/* ── Paso 4: Confirmar ──────────────────────────────────── */}
                  {wizPaso === 4 && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-bold text-slate-700">Revisa los datos antes de confirmar</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Al confirmar se creará la matrícula con estado <span className="font-black text-amber-600">Pendiente de documentos</span></p>
                      </div>
                      <div className="rounded-xl p-5 space-y-3" style={{ background: '#fafafa', border: '1.5px solid #E4E8EF' }}>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                          <p><span className="font-black text-slate-800">Tipo:</span> <span className="text-slate-700">{tipoElegido?.label}</span></p>
                          <p><span className="font-black text-slate-800">Ciclo:</span> <span className="text-slate-700">{cicloElegido?.nombre || '—'}</span></p>
                          <p className="col-span-2"><span className="font-black text-slate-800">Estudiante:</span> <span className="text-slate-700">
                            {wizTipo === 'nuevo'
                              ? `${wizNuevoForm.nombre} ${wizNuevoForm.apellidos} · DNI ${wizNuevoForm.dni}`
                              : (wizAlumno ? `${wizAlumno.nombre} ${wizAlumno.apellidos ?? ''} · DNI ${wizAlumno.dni ?? '—'}` : '—')}
                          </span></p>
                          <p><span className="font-black text-slate-800">Grado:</span> <span className="text-slate-700">{wizGrado}</span></p>
                          <p><span className="font-black text-slate-800">Sección:</span> <span className="text-slate-700">{wizGrupo}</span></p>
                          {wizObs.trim() && (
                            <p className="col-span-2"><span className="font-black text-slate-800">Observaciones:</span> <span className="text-slate-700">{wizObs.trim()}</span></p>
                          )}
                        </div>
                      </div>
                      {wizError && (
                        <div className="rounded-xl p-3 text-sm" style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#b91c1c' }}>
                          {wizError}
                        </div>
                      )}
                      {wizOkMsg && (
                        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', color: '#15803d' }}>
                          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                          </svg>
                          <div className="flex-1">
                            <p className="text-sm font-black">¡Matrícula registrada!</p>
                            <p className="text-xs">{wizOkMsg}</p>
                          </div>
                          <button onClick={wizardReset}
                            className="text-xs font-black px-3 py-1.5 rounded-lg active:scale-95 transition-all"
                            style={{ background: '#15803d', color: 'white' }}>
                            Otra matrícula
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: navegación */}
              <div className="flex items-center justify-between gap-3">
                <button onClick={() => { setWizPaso((p) => Math.max(1, p - 1) as 1|2|3|4); setWizError('') }}
                  disabled={wizPaso === 1 || !!wizOkMsg}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'white', border: '1.5px solid #e2e8f0', color: '#475569' }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                  </svg>
                  Anterior
                </button>
                {wizPaso < 4 ? (
                  <button onClick={() => setWizPaso((p) => Math.min(4, p + 1) as 1|2|3|4)}
                    disabled={!puedeAvanzar}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', boxShadow: '0 4px 14px rgba(11,36,71,.25)' }}>
                    Siguiente
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                ) : (
                  <button onClick={wizardConfirmar}
                    disabled={wizGuardando || !!wizOkMsg}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-95 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', boxShadow: '0 4px 14px rgba(22,163,74,.3)' }}>
                    {wizGuardando ? (
                      <>
                        <Spinner cls="h-4 w-4 text-white"/>
                        Guardando…
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                        Confirmar matrícula
                      </>
                    )}
                  </button>
                )}
              </div>
              </>}
            </div>
          )
        })()}

        {/* ══ HORAS DOCENTE ════════════════════════════════════════════════════ */}
        {tab === 'horas-docente' && (() => {
          const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes']
          const todosCursos = [...new Set(horasFilas.flatMap(f => f.cursos))].sort()

          const filasFiltradas = horasFilas.filter(f => {
            const matchNombre = !busquedaHoras.trim() || f.nombre.toLowerCase().includes(busquedaHoras.toLowerCase())
            const matchCurso  = !cursoHoras || f.cursos.includes(cursoHoras)
            return matchNombre && matchCurso
          })

          const totalHorasSuma = filasFiltradas.reduce((s, f) => s + f.totalHoras, 0)
          const promedio = filasFiltradas.length > 0 ? Math.round((totalHorasSuma / filasFiltradas.length) * 10) / 10 : 0

          return (
          <div className="space-y-5">

            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-slate-900 font-black text-xl">Horas por Docente</h2>
                  {cicloActivoInfo && (
                    <span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest"
                      style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #bbf7d0' }}>
                      ● Ciclo {cicloActivoInfo.nombre}
                    </span>
                  )}
                </div>
                <p className="text-slate-400 text-xs mt-0.5">Horas semanales calculadas desde el horario asignado</p>
              </div>
              <button
                onClick={() => descargarExcelHoras(filasFiltradas)}
                disabled={filasFiltradas.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: 'white', boxShadow: '0 4px 16px rgba(34,197,94,.3)' }}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Descargar Excel
              </button>
            </div>

            {/* Tarjetas resumen */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Docentes', value: filasFiltradas.length, icon: '👤', color: '#0B2447' },
                { label: 'Total horas', value: totalHorasSuma.toFixed(1) + 'h', icon: '⏱', color: '#f59e0b' },
                { label: 'Promedio/docente', value: promedio + 'h', icon: '📊', color: '#06b6d4' },
                { label: 'Sin horas', value: filasFiltradas.filter(f => f.totalHoras === 0).length, icon: '⚠', color: '#f43f5e' },
              ].map(s => (
                <div key={s.label} className="rounded-2xl p-4" style={card}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base">{s.icon}</span>
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }}/>
                  </div>
                  <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Filtros */}
            <div className="rounded-2xl p-4 flex flex-wrap items-end gap-3" style={card}>
              {/* Búsqueda por nombre */}
              <div className="flex-1 min-w-[180px]">
                <label className={labelCls}>Buscar docente</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Nombre del docente…"
                    value={busquedaHoras}
                    onChange={e => setBusquedaHoras(e.target.value)}
                    className={inputCls}
                    style={{ paddingLeft: '2rem' }}
                  />
                </div>
              </div>

              {/* Filtro por curso */}
              <div className="flex-1 min-w-[160px]">
                <label className={labelCls}>Filtrar por curso</label>
                <select value={cursoHoras} onChange={e => setCursoHoras(e.target.value)} className={selectCls}>
                  <option value="">Todos los cursos</option>
                  {todosCursos.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Limpiar */}
              {(busquedaHoras || cursoHoras) && (
                <button
                  onClick={() => { setBusquedaHoras(''); setCursoHoras('') }}
                  className="px-3 py-2 rounded-xl text-xs font-bold transition-all"
                  style={{ background: '#f1f5f9', color: '#64748b', border: '1.5px solid #e2e8f0' }}>
                  Limpiar
                </button>
              )}
            </div>

            {/* Tabla */}
            {loadingHorasTab ? (
              <div className="flex items-center justify-center py-16"><Spinner cls="h-7 w-7 text-indigo-800"/></div>
            ) : filasFiltradas.length === 0 ? (
              <div className="rounded-2xl p-12 text-center" style={card}>
                <p className="text-slate-300 text-sm font-semibold">Sin resultados para los filtros aplicados</p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ ...card, padding: 0 }}>
                {accentBar}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" style={{ minWidth: '720px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1.5px solid #E4E8EF', background: '#F8FAFC' }}>
                        <th className="px-4 py-3 text-left text-[11px] font-black text-slate-500 uppercase tracking-wide">Docente</th>
                        <th className="px-3 py-3 text-left text-[11px] font-black text-slate-500 uppercase tracking-wide">Cursos</th>
                        {DIAS.map(d => (
                          <th key={d} className="px-2 py-3 text-center text-[11px] font-black text-slate-500 uppercase tracking-wide w-16">{d.slice(0,3)}</th>
                        ))}
                        <th className="px-4 py-3 text-center text-[11px] font-black text-slate-500 uppercase tracking-wide">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasFiltradas.map((f, idx) => (
                        <tr key={f.id}
                          style={{ borderBottom: idx < filasFiltradas.length - 1 ? '1px solid #f1f5f9' : 'none', background: idx % 2 === 0 ? 'white' : '#fafbff' }}>
                          {/* Docente */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-black text-white"
                                style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                                {f.nombre.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-800 leading-tight">{f.nombre}</p>
                                <p className="text-[10px] text-slate-400">{f.email}</p>
                              </div>
                            </div>
                          </td>
                          {/* Cursos */}
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {f.cursos.length === 0
                                ? <span className="text-[10px] text-slate-300 italic">Sin cursos</span>
                                : f.cursos.slice(0, 3).map(c => (
                                    <span key={c} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                                      style={{ background: '#F1F5F9', color: '#0B2447' }}>{c}</span>
                                  ))
                              }
                              {f.cursos.length > 3 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: '#f1f5f9', color: '#94a3b8' }}>
                                  +{f.cursos.length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Horas por día */}
                          {DIAS.map(dia => {
                            const h = f.horasPorDia[dia] ?? 0
                            return (
                              <td key={dia} className="px-2 py-3 text-center">
                                {h > 0 ? (
                                  <div className="inline-flex flex-col items-center gap-0.5">
                                    <span className="text-sm font-black" style={{ color: h >= 4 ? '#0B2447' : h >= 2 ? '#06b6d4' : '#94a3b8' }}>{h}</span>
                                    <span className="text-[8px] text-slate-300 font-semibold">hrs</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-200 text-sm">—</span>
                                )}
                              </td>
                            )
                          })}
                          {/* Total */}
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl"
                              style={{
                                background: f.totalHoras === 0 ? '#f1f5f9' : f.totalHoras >= 20 ? '#F1F5F9' : '#f0fdf9',
                                border: f.totalHoras === 0 ? '1px solid #e2e8f0' : f.totalHoras >= 20 ? '1px solid #fecdd3' : '1px solid #bbf7d0',
                              }}>
                              <span className="text-sm font-black"
                                style={{ color: f.totalHoras === 0 ? '#cbd5e1' : f.totalHoras >= 20 ? '#0B2447' : '#16a34a' }}>
                                {f.totalHoras}
                              </span>
                              <span className="text-[9px] font-bold"
                                style={{ color: f.totalHoras === 0 ? '#cbd5e1' : f.totalHoras >= 20 ? '#1E40AF' : '#4ade80' }}>
                                h
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer total */}
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1.5px solid #E4E8EF', background: '#F8FAFC' }}>
                  <p className="text-xs font-bold text-slate-500">
                    {filasFiltradas.length} docente{filasFiltradas.length !== 1 ? 's' : ''}
                    {(busquedaHoras || cursoHoras) ? ' (filtrado)' : ''}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-semibold">Total:</span>
                    <span className="text-sm font-black text-indigo-900">{totalHorasSuma.toFixed(1)}h</span>
                    <span className="text-xs text-slate-300 mx-1">·</span>
                    <span className="text-xs text-slate-400 font-semibold">Promedio:</span>
                    <span className="text-sm font-black text-cyan-600">{promedio}h</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          )
        })()}

        {/* ══ CURSOS ═══════════════════════════════════════════════════════════ */}
        {tab === 'cursos' && (() => {
          const asigsFiltradas = asignaciones.filter(a => a.grado?.includes(nivelCursoTab))
          const contPrimaria   = asignaciones.filter(a => a.grado?.includes('Cocina')).length
          const contSecundaria = asignaciones.filter(a => a.grado?.includes('Pastelería')).length

          return (
          <div className="space-y-6">

            {/* ── Selectores de nivel ── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-slate-900 font-black text-xl">Cursos</h2>
                  <p className="text-slate-400 text-xs mt-0.5">{cursos.length} curso{cursos.length !== 1 ? 's' : ''} en el catálogo · selecciona un nivel</p>
                </div>
                <button onClick={() => { setMostrarCursoForm(!mostrarCursoForm); setCursoForm({ nombre: '', color: '#143875' }) }}
                  className="text-sm font-black px-4 py-2 rounded-xl transition-all active:scale-95"
                  style={mostrarCursoForm
                    ? { background: '#f1f5f9', border: '1.5px solid #e2e8f0', color: '#64748b' }
                    : { background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white', boxShadow: '0 4px 16px rgba(11,36,71,.25)' }}>
                  {mostrarCursoForm ? 'Cancelar' : '+ Nuevo curso'}
                </button>
              </div>

              {/* Botones grandes Primaria / Secundaria */}
              <div className="grid grid-cols-2 gap-4 mb-6">

                {/* Primaria */}
                <button
                  onClick={() => { setNivelCursoTab('Cocina'); setDocenteAsigAbierto(null) }}
                  className="relative rounded-2xl overflow-hidden text-left transition-all active:scale-[.98]"
                  style={{
                    boxShadow: nivelCursoTab === 'Cocina'
                      ? '0 8px 32px rgba(16,185,129,.3)'
                      : '0 2px 12px rgba(0,0,0,.06)',
                    border: nivelCursoTab === 'Cocina' ? '2.5px solid #10b981' : '2px solid #E4E8EF',
                    transform: nivelCursoTab === 'Cocina' ? 'translateY(-2px)' : 'none',
                  }}>
                  {/* Cabecera ilustrada */}
                  <div className="relative overflow-hidden" style={{ height: '140px', background: 'linear-gradient(135deg,#10b981,#34d399)' }}>
                    {/* Decoración */}
                    <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full" style={{ background: 'white', opacity: .1 }}/>
                    <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full" style={{ background: 'white', opacity: .07 }}/>
                    <div className="absolute top-6 left-8 w-12 h-12 rounded-full" style={{ background: 'white', opacity: .08 }}/>
                    {/* Ilustración */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg viewBox="0 0 100 80" fill="none" className="w-28 h-24" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.15))' }}>
                        {/* Lápices de colores */}
                        <rect x="18" y="20" width="10" height="36" rx="2" fill="white" fillOpacity=".9"/>
                        <polygon points="18,56 28,56 23,68" fill="white" fillOpacity=".7"/>
                        <rect x="18" y="20" width="10" height="8" rx="1" fill="white" fillOpacity=".4"/>
                        <rect x="32" y="14" width="10" height="36" rx="2" fill="white" fillOpacity=".75"/>
                        <polygon points="32,50 42,50 37,62" fill="white" fillOpacity=".55"/>
                        <rect x="32" y="14" width="10" height="8" rx="1" fill="white" fillOpacity=".35"/>
                        <rect x="46" y="18" width="10" height="36" rx="2" fill="white" fillOpacity=".85"/>
                        <polygon points="46,54 56,54 51,66" fill="white" fillOpacity=".65"/>
                        <rect x="46" y="18" width="10" height="8" rx="1" fill="white" fillOpacity=".4"/>
                        {/* Estrella */}
                        <path d="M74 12 L76 18 L82 18 L77 22 L79 28 L74 24 L69 28 L71 22 L66 18 L72 18 Z" fill="white" fillOpacity=".85"/>
                        {/* Libro */}
                        <path d="M62 38 L62 62 L74 58 L74 34 Z" fill="white" fillOpacity=".7"/>
                        <path d="M74 34 L74 58 L86 62 L86 38 Z" fill="white" fillOpacity=".5"/>
                        <line x1="74" y1="34" x2="74" y2="58" stroke="white" strokeOpacity=".4" strokeWidth="1"/>
                      </svg>
                    </div>
                    {/* Badge nivel activo */}
                    {nivelCursoTab === 'Cocina' && (
                      <div className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: 'white' }}>
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  {/* Cuerpo */}
                  <div className="p-4" style={{ background: nivelCursoTab === 'Cocina' ? '#f0fdf9' : 'white' }}>
                    <p className="font-black text-base" style={{ color: nivelCursoTab === 'Cocina' ? '#059669' : '#1e293b' }}>Cocina</p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: nivelCursoTab === 'Cocina' ? '#34d399' : '#94a3b8' }}>
                      Ciclos 1° — 4° · {contPrimaria} asignación{contPrimaria !== 1 ? 'es' : ''}
                    </p>
                  </div>
                </button>

                {/* Secundaria */}
                <button
                  onClick={() => { setNivelCursoTab('Pastelería'); setDocenteAsigAbierto(null) }}
                  className="relative rounded-2xl overflow-hidden text-left transition-all active:scale-[.98]"
                  style={{
                    boxShadow: nivelCursoTab === 'Pastelería'
                      ? '0 8px 32px rgba(11,36,71,.25)'
                      : '0 2px 12px rgba(0,0,0,.06)',
                    border: nivelCursoTab === 'Pastelería' ? '2.5px solid #0B2447' : '2px solid #E4E8EF',
                    transform: nivelCursoTab === 'Pastelería' ? 'translateY(-2px)' : 'none',
                  }}>
                  {/* Cabecera ilustrada */}
                  <div className="relative overflow-hidden" style={{ height: '140px', background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                    <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full" style={{ background: 'white', opacity: .1 }}/>
                    <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full" style={{ background: 'white', opacity: .07 }}/>
                    <div className="absolute top-6 left-8 w-12 h-12 rounded-full" style={{ background: 'white', opacity: .08 }}/>
                    {/* Ilustración */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg viewBox="0 0 100 80" fill="none" className="w-28 h-24" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.15))' }}>
                        {/* Birrete */}
                        <polygon points="50,10 20,28 50,36 80,28" fill="white" fillOpacity=".9"/>
                        <rect x="46" y="28" width="8" height="22" rx="2" fill="white" fillOpacity=".6"/>
                        <circle cx="50" cy="52" r="5" fill="white" fillOpacity=".8"/>
                        <line x1="78" y1="28" x2="78" y2="42" stroke="white" strokeOpacity=".7" strokeWidth="2.5" strokeLinecap="round"/>
                        <circle cx="78" cy="46" r="4" fill="white" fillOpacity=".7"/>
                        {/* Diploma */}
                        <rect x="14" y="46" width="28" height="22" rx="3" fill="white" fillOpacity=".75"/>
                        <line x1="19" y1="54" x2="37" y2="54" stroke="white" strokeOpacity=".4" strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="19" y1="59" x2="33" y2="59" stroke="white" strokeOpacity=".4" strokeWidth="1.5" strokeLinecap="round"/>
                        {/* Fórmulas */}
                        <text x="58" y="58" fontSize="10" fontWeight="900" fill="white" fillOpacity=".7" fontFamily="monospace">x²</text>
                        <text x="68" y="70" fontSize="9" fontWeight="900" fill="white" fillOpacity=".5" fontFamily="monospace">∫</text>
                      </svg>
                    </div>
                    {nivelCursoTab === 'Pastelería' && (
                      <div className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: 'white' }}>
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#0B2447" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  {/* Cuerpo */}
                  <div className="p-4" style={{ background: nivelCursoTab === 'Pastelería' ? '#F1F5F9' : 'white' }}>
                    <p className="font-black text-base" style={{ color: nivelCursoTab === 'Pastelería' ? '#0B2447' : '#1e293b' }}>Panadería y Pastelería</p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: nivelCursoTab === 'Pastelería' ? '#1E3A8A' : '#94a3b8' }}>
                      Ciclos 1° — 2° · {contSecundaria} asignación{contSecundaria !== 1 ? 'es' : ''}
                    </p>
                  </div>
                </button>

              </div>

              {/* ── Catálogo de cursos (pills) ── */}
              <div className="rounded-2xl overflow-hidden" style={card}>
                {accentBar}
                <div className="p-4 space-y-4">
                  {mostrarCursoForm && (
                    <form onSubmit={handleCrearCurso}
                      className="p-4 rounded-2xl space-y-3"
                      style={{ background: '#F8FAFC', border: '1.5px solid #E4E8EF' }}>
                      <div>
                        <label className={labelCls}>Nombre del curso</label>
                        <input type="text" required autoFocus value={cursoForm.nombre}
                          onChange={e => setCursoForm({...cursoForm, nombre: e.target.value})}
                          placeholder="Ej: Matemáticas, Comunicación..." className={inputCls}/>
                      </div>
                      <div>
                        <label className={labelCls}>Color</label>
                        <div className="flex gap-2 flex-wrap mt-1">
                          {COLORES_CURSO.map(c => (
                            <button type="button" key={c} onClick={() => setCursoForm({...cursoForm, color: c})}
                              className="w-6 h-6 rounded-md transition-all"
                              style={{ background: c, boxShadow: cursoForm.color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none', transform: cursoForm.color === c ? 'scale(1.2)' : 'scale(1)' }}/>
                          ))}
                        </div>
                      </div>
                      <button type="submit" disabled={cursoLoading}
                        className="w-full py-2 rounded-xl text-xs font-black text-white disabled:opacity-60 transition-all"
                        style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                        <span className="flex items-center justify-center gap-2">
                          {cursoLoading && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                          {cursoLoading ? 'Guardando...' : 'Agregar curso'}
                        </span>
                      </button>
                    </form>
                  )}
                  {cursos.length === 0 && !mostrarCursoForm ? (
                    <p className="text-xs text-slate-300 italic text-center py-6">Sin cursos — haz clic en &ldquo;+ Nuevo curso&rdquo; para comenzar</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {cursos.map(c => (
                        <div key={c.id} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-xl"
                          style={{ background: c.color + '18', border: `1.5px solid ${c.color}44` }}>
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }}/>
                          <span className="text-xs font-bold" style={{ color: c.color }}>{c.nombre}</span>
                          <button onClick={() => handleEliminarCurso(c.id)}
                            className="w-4 h-4 flex items-center justify-center rounded-md ml-1 opacity-40 hover:opacity-100 transition-opacity"
                            style={{ color: c.color }}>
                            <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Asignaciones filtradas por nivel ── */}
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-slate-900 font-black text-xl">Asignaciones — {nivelCursoTab}</h2>
                    {cicloActivoInfo && (
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest"
                        style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #bbf7d0' }}>
                        ● Ciclo {cicloActivoInfo.nombre}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {vistaCursosTab === 'curso'
                      ? 'Cambia el docente de un curso en todas las secciones del nivel'
                      : vistaCursosTab === 'seccion'
                      ? 'Cambia curso o docente directamente en cada sección'
                      : 'Cursos asignados a cada docente'}
                    {cicloActivoInfo ? ` · ciclo ${cicloActivoInfo.nombre}` : ''}
                  </p>
                </div>
                <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-white">
                  {(['curso','seccion','docente'] as const).map(v => (
                    <button key={v} onClick={() => { setVistaCursosTab(v); setDocenteAsigAbierto(null); setSeccionAddOpen(null); setSwapAsigId(null); setCursoAddOpen(null) }}
                      className="px-3.5 py-2 text-xs font-black transition-all"
                      style={vistaCursosTab === v
                        ? { background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white' }
                        : { background: 'white', color: '#94a3b8' }}>
                      {v === 'curso' ? 'Por curso' : v === 'seccion' ? 'Por sección' : 'Por docente'}
                    </button>
                  ))}
                </div>
              </div>

              {loadingAsig ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner cls="h-7 w-7 text-indigo-800"/>
                </div>
              ) : vistaCursosTab === 'curso' ? (
                /* ── VISTA POR CURSO ───────────────────────────────────────── */
                (() => {
                  const gradosNivel = GRADOS.filter(g => g.includes(nivelCursoTab))
                  const secciones: { grado: string; grupo: string }[] = []
                  for (const g of gradosNivel) {
                    const gruposSet = new Set<string>(['A','B'])
                    asignaciones.filter(a => a.grado === g).forEach(a => gruposSet.add(a.grupo))
                    Array.from(gruposSet).sort().forEach(grupo => secciones.push({ grado: g, grupo }))
                  }
                  const totalSecciones = secciones.length
                  if (cursos.length === 0) {
                    return (
                      <div className="rounded-2xl p-10 text-center" style={card}>
                        <p className="text-slate-300 text-sm font-semibold">No hay cursos en el catálogo</p>
                        <p className="text-slate-200 text-xs mt-1">Crea cursos arriba con &ldquo;+ Nuevo curso&rdquo;</p>
                      </div>
                    )
                  }
                  if (docentes.length === 0) {
                    return (
                      <div className="rounded-2xl p-10 text-center" style={card}>
                        <p className="text-slate-300 text-sm font-semibold">No hay docentes registrados</p>
                        <p className="text-slate-200 text-xs mt-1">Agrega docentes antes de asignar cursos</p>
                      </div>
                    )
                  }
                  const cursosOrdenados = [...cursos].sort((a, b) => a.nombre.localeCompare(b.nombre))
                  // Clasificar por número de docentes únicos en el nivel
                  const meta = cursosOrdenados.map(curso => {
                    const asigsCurso = asignaciones.filter(a => a.curso_id === curso.id && a.grado.includes(nivelCursoTab))
                    const docsUnicos = new Set(asigsCurso.map(a => a.docente_id))
                    return { curso, nDocs: docsUnicos.size, nAsigs: asigsCurso.length }
                  })
                  const generalesCount = meta.filter(m => m.nDocs <= 1).length // 0 o 1 docente
                  const mixtosCount    = meta.filter(m => m.nDocs >= 2).length
                  const cursosFiltrados = (subVistaCurso === 'generales'
                    ? meta.filter(m => m.nDocs <= 1)
                    : meta.filter(m => m.nDocs >= 2)
                  ).map(m => m.curso)
                  return (
                    <div className="space-y-3">
                      {/* Sub-toggle: Cursos generales / Cursos */}
                      <div className="rounded-2xl p-1 flex gap-1" style={{ background: '#f1f5f9' }}>
                        <button onClick={() => { setSubVistaCurso('generales'); setCursoAddOpen(null); setSwapAsigId(null) }}
                          className="flex-1 px-3 py-2 rounded-xl text-xs font-black transition-all"
                          style={subVistaCurso === 'generales'
                            ? { background: 'white', color: '#0B2447', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }
                            : { background: 'transparent', color: '#94a3b8' }}>
                          Cursos generales <span className="opacity-60 font-bold">({generalesCount})</span>
                        </button>
                        <button onClick={() => { setSubVistaCurso('mixtos'); setCursoAddOpen(null); setSwapAsigId(null) }}
                          className="flex-1 px-3 py-2 rounded-xl text-xs font-black transition-all"
                          style={subVistaCurso === 'mixtos'
                            ? { background: 'white', color: '#0B2447', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }
                            : { background: 'transparent', color: '#94a3b8' }}>
                          Cursos <span className="opacity-60 font-bold">({mixtosCount})</span>
                        </button>
                      </div>
                      {/* Hint contextual */}
                      <p className="text-[10px] text-slate-400 px-1">
                        {subVistaCurso === 'generales'
                          ? 'Cursos donde un solo docente enseña en todas las secciones (o aún sin asignar).'
                          : 'Cursos con dos o más docentes distintos en distintas secciones.'}
                      </p>
                      {cursosFiltrados.length === 0 ? (
                        <div className="rounded-2xl p-10 text-center" style={card}>
                          <p className="text-slate-300 text-sm font-semibold">
                            {subVistaCurso === 'generales' ? 'No hay cursos generales en este nivel' : 'No hay cursos con varios docentes en este nivel'}
                          </p>
                          <p className="text-slate-200 text-xs mt-1">
                            {subVistaCurso === 'generales' ? 'Cuando un curso tenga un mismo docente en todas las secciones aparecerá aquí.' : 'Cuando un curso tenga 2 o más docentes distintos aparecerá aquí.'}
                          </p>
                        </div>
                      ) : null}
                      {cursosFiltrados.map(curso => {
                        const asigsCurso  = asignaciones.filter(a => a.curso_id === curso.id && a.grado.includes(nivelCursoTab))
                        const asignadas   = asigsCurso.length
                        const docsUnicos  = new Set(asigsCurso.map(a => a.docente_id))
                        const colapsado   = cursosColapsados.has(curso.id)
                        // docente mayoritario como sugerencia inicial del select "aplicar a todas"
                        const conteoDoc: Record<string, number> = {}
                        asigsCurso.forEach(a => { if (a.docente_id) conteoDoc[a.docente_id] = (conteoDoc[a.docente_id] ?? 0) + 1 })
                        const mayoritario = Object.entries(conteoDoc).sort((a,b) => b[1] - a[1])[0]?.[0] ?? ''
                        const principal   = cursoPrincipalDocente[curso.id] ?? mayoritario
                        const porSeccion  = new Map<string, typeof asigsCurso[number]>()
                        asigsCurso.forEach(a => porSeccion.set(`${a.grado}__${a.grupo}`, a))

                        return (
                          <div key={curso.id} className="rounded-2xl overflow-hidden" style={card}>
                            {/* Cabecera */}
                            <button onClick={() => setCursosColapsados(prev => {
                              const n = new Set(prev); if (n.has(curso.id)) n.delete(curso.id); else n.add(curso.id); return n
                            })} className="w-full px-4 py-3 flex items-center gap-3 text-left transition-colors hover:bg-slate-50">
                              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                style={{ background: curso.color + '22', border: `2px solid ${curso.color}55` }}>
                                <div className="w-5 h-5 rounded-md" style={{ background: curso.color }}/>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-slate-800 font-bold text-sm truncate">{curso.nombre}</p>
                                <p className="text-slate-400 text-[10px] mt-0.5">
                                  {asignadas === 0
                                    ? <span className="text-amber-600 font-bold">⚠ Sin asignar en {nivelCursoTab}</span>
                                    : <>{asignadas}/{totalSecciones} secciones · {docsUnicos.size} docente{docsUnicos.size !== 1 ? 's' : ''}</>}
                                </p>
                              </div>
                              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth="2.5"
                                style={{ transform: colapsado ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform .2s' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                              </svg>
                            </button>

                            {!colapsado && (
                              <div className="border-t border-slate-100">
                                {/* Acción rápida: aplicar a todas */}
                                {asignadas > 0 && (
                                  <div className="px-4 py-3 flex flex-wrap items-end gap-2" style={{ background: '#F8FAFC' }}>
                                    <div className="flex-1 min-w-[180px]">
                                      <label className={labelCls}>Cambiar docente en todas las secciones asignadas</label>
                                      <select
                                        value={principal}
                                        onChange={e => setCursoPrincipalDocente(prev => ({ ...prev, [curso.id]: e.target.value }))}
                                        className={selectCls}>
                                        <option value="">— Seleccionar docente —</option>
                                        {docentes.map(d => <option key={d.id} value={d.id}>{displayDocente(d)}</option>)}
                                      </select>
                                    </div>
                                    <button
                                      disabled={!principal || bulkLoadingCurso === curso.id}
                                      onClick={() => handleAplicarDocenteACurso(curso.id, principal, nivelCursoTab)}
                                      className="px-4 py-2.5 rounded-xl text-xs font-black text-white disabled:opacity-50 transition-all"
                                      style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                                      <span className="flex items-center gap-2">
                                        {bulkLoadingCurso === curso.id && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                                        {bulkLoadingCurso === curso.id ? 'Aplicando...' : `Aplicar a las ${asignadas}`}
                                      </span>
                                    </button>
                                  </div>
                                )}

                                {/* Detalle por sección */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100">
                                  {secciones.map(({ grado, grupo }) => {
                                    const k = `${grado}__${grupo}`
                                    const asig = porSeccion.get(k)
                                    const editando = asig && swapAsigId === asig.id
                                    const addOpen = cursoAddOpen === `${curso.id}__${k}`
                                    const docAsig = asig ? docentes.find(d => d.id === asig.docente_id) : null
                                    return (
                                      <div key={k} className="bg-white px-3 py-2 flex items-center gap-2 text-xs">
                                        <span className="font-black text-slate-500 shrink-0" style={{ width: '52px' }}>
                                          {grado.split(' ')[0]}{grupo}
                                        </span>
                                        {asig ? (
                                          <>
                                            {editando ? (
                                              <select
                                                autoFocus
                                                value={asig.docente_id}
                                                disabled={asigLoading}
                                                onChange={e => handleCambiarDocenteAsignacion(asig.id, e.target.value)}
                                                onBlur={() => setSwapAsigId(null)}
                                                className="flex-1 min-w-0 px-2 py-1 rounded-lg text-[11px] text-slate-800 bg-white border border-indigo-300 outline-none focus:ring-2 focus:ring-indigo-100">
                                                {docentes.map(d => <option key={d.id} value={d.id}>{displayDocente(d)}</option>)}
                                              </select>
                                            ) : (
                                              <button onClick={() => setSwapAsigId(asig.id)}
                                                className="flex-1 min-w-0 text-left px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors truncate">
                                                {docAsig ? displayDocente(docAsig) : <span className="text-amber-600">⚠ Sin docente</span>}
                                              </button>
                                            )}
                                            <button onClick={() => handleEliminarAsignacion(asig.id)}
                                              className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors shrink-0"
                                              title="Quitar curso de esta sección">
                                              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                              </svg>
                                            </button>
                                          </>
                                        ) : addOpen ? (
                                          <>
                                            <select
                                              autoFocus
                                              value={cursoAddDocente}
                                              onChange={e => setCursoAddDocente(e.target.value)}
                                              className="flex-1 min-w-0 px-2 py-1 rounded-lg text-[11px] text-slate-800 bg-white border border-indigo-300 outline-none focus:ring-2 focus:ring-indigo-100">
                                              <option value="">— Seleccionar —</option>
                                              {docentes.map(d => <option key={d.id} value={d.id}>{displayDocente(d)}</option>)}
                                            </select>
                                            <button
                                              disabled={!cursoAddDocente || asigLoading}
                                              onClick={() => handleCrearAsignacionCurso(curso.id, grado, grupo, cursoAddDocente)}
                                              className="px-2 h-6 rounded-md text-[10px] font-black text-white disabled:opacity-50 transition-all shrink-0"
                                              style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                                              OK
                                            </button>
                                            <button onClick={() => { setCursoAddOpen(null); setCursoAddDocente('') }}
                                              className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 transition-colors shrink-0"
                                              title="Cancelar">
                                              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                              </svg>
                                            </button>
                                          </>
                                        ) : (
                                          <>
                                            <span className="flex-1 min-w-0 text-[10px] text-slate-300 italic">Sin asignar</span>
                                            <button
                                              onClick={() => { setCursoAddOpen(`${curso.id}__${k}`); setCursoAddDocente(principal || '') }}
                                              className="px-2 h-6 rounded-md text-[10px] font-black transition-all shrink-0"
                                              style={{ background: 'white', border: '1.5px dashed #d4a5a8', color: '#0B2447' }}>
                                              + Asignar
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()
              ) : vistaCursosTab === 'docente' ? (
                <div className="space-y-3">
                  {docentes.map(doc => {
                    const asigDocFull = asignaciones.filter(a => a.docente_id === doc.id)
                    const asigDocNivel = asigDocFull.filter(a => a.grado?.includes(nivelCursoTab))
                    const abierto = docenteAsigAbierto === doc.id
                    if (asigDocNivel.length === 0 && !abierto) return null
                    return (
                      <div key={doc.id} className="rounded-2xl overflow-hidden" style={card}>
                        <div className="px-4 py-3 flex items-center gap-3"
                          style={{ borderBottom: (asigDocNivel.length > 0 || abierto) ? '1px solid #f1f5f9' : 'none' }}>
                          <Avatar name={displayDocente(doc)} color="indigo"/>
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-800 font-bold text-sm truncate">{displayDocente(doc)}</p>
                            <p className="text-slate-400 text-[10px]">
                              {asigDocNivel.length === 0
                                ? 'Sin asignaciones en este nivel'
                                : `${asigDocNivel.length} asignación${asigDocNivel.length !== 1 ? 'es' : ''} en ${nivelCursoTab}`}
                            </p>
                          </div>
                          <button
                            onClick={() => { setDocenteAsigAbierto(abierto ? null : doc.id); setAsigForm({ curso_id: '', grado: '', grupo: 'A' }) }}
                            className="flex items-center gap-1 text-xs font-black px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
                            style={abierto
                              ? { background: '#f1f5f9', color: '#64748b', border: '1.5px solid #e2e8f0' }
                              : { background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white', boxShadow: '0 3px 10px rgba(11,36,71,.25)' }}>
                            {abierto ? 'Cancelar' : '+ Asignar'}
                          </button>
                        </div>

                        {asigDocNivel.length > 0 && (
                          <div className="px-4 py-3 flex flex-wrap gap-1.5"
                            style={{ borderBottom: abierto ? '1px solid #f1f5f9' : 'none' }}>
                            {asigDocNivel.map(a => {
                              const curso = a.cursos as unknown as { nombre: string; color: string } | null
                              const color = curso?.color ?? '#143875'
                              return (
                                <div key={a.id} className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-xl"
                                  style={{ background: color + '18', border: `1.5px solid ${color}44` }}>
                                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }}/>
                                  <span className="text-xs font-bold" style={{ color }}>
                                    {curso?.nombre ?? '?'} · {a.grado.replace(' Ciclo Cocina',' Coc. ').replace(' Ciclo Pastelería',' Past. ')}{a.grupo}
                                  </span>
                                  <button onClick={() => handleEliminarAsignacion(a.id)}
                                    className="w-4 h-4 flex items-center justify-center rounded-md opacity-40 hover:opacity-100 transition-opacity"
                                    style={{ color }}>
                                    <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {abierto && (
                          <div className="px-4 py-3 space-y-3" style={{ background: '#F8FAFC' }}>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label className={labelCls}>Curso</label>
                                <select value={asigForm.curso_id}
                                  onChange={e => setAsigForm({...asigForm, curso_id: e.target.value})}
                                  className={selectCls}>
                                  <option value="">— Seleccionar —</option>
                                  {cursos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className={labelCls}>Grado</label>
                                <select value={asigForm.grado}
                                  onChange={e => setAsigForm({...asigForm, grado: e.target.value})}
                                  className={selectCls}>
                                  <option value="">— Seleccionar —</option>
                                  {GRADOS.filter(g => g.includes(nivelCursoTab)).map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className={labelCls}>Sección</label>
                                <select value={asigForm.grupo}
                                  onChange={e => setAsigForm({...asigForm, grupo: e.target.value})}
                                  className={selectCls}>
                                  <option value="A">A</option>
                                  <option value="B">B</option>
                                </select>
                              </div>
                            </div>
                            <button
                              onClick={() => handleCrearAsignacion(doc.id)}
                              disabled={asigLoading || !asigForm.curso_id || !asigForm.grado}
                              className="w-full py-2 rounded-xl text-xs font-black text-white disabled:opacity-50 transition-all"
                              style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                              <span className="flex items-center justify-center gap-2">
                                {asigLoading && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                                {asigLoading ? 'Guardando...' : 'Guardar asignación'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {docentes.length === 0 && (
                    <div className="rounded-2xl p-10 text-center" style={card}>
                      <p className="text-slate-300 text-sm font-semibold">No hay docentes registrados</p>
                    </div>
                  )}
                  {docentes.length > 0 && asigsFiltradas.length === 0 && (
                    <div className="rounded-2xl p-10 text-center" style={card}>
                      <p className="text-slate-300 text-sm font-semibold">Sin asignaciones en {nivelCursoTab} aún</p>
                      <p className="text-slate-200 text-xs mt-1">Abre un docente y haz clic en &ldquo;+ Asignar&rdquo;</p>
                    </div>
                  )}
                </div>
              ) : (
                /* ── VISTA POR SECCIÓN ─────────────────────────────────────── */
                (() => {
                  const gradosNivel = GRADOS.filter(g => g.includes(nivelCursoTab))
                  const secciones: { grado: string; grupo: string }[] = []
                  for (const g of gradosNivel) {
                    const gruposSet = new Set<string>(['A','B'])
                    asignaciones.filter(a => a.grado === g).forEach(a => gruposSet.add(a.grupo))
                    Array.from(gruposSet).sort().forEach(grupo => secciones.push({ grado: g, grupo }))
                  }
                  if (docentes.length === 0) {
                    return (
                      <div className="rounded-2xl p-10 text-center" style={card}>
                        <p className="text-slate-300 text-sm font-semibold">No hay docentes registrados</p>
                        <p className="text-slate-200 text-xs mt-1">Agrega docentes antes de asignar cursos</p>
                      </div>
                    )
                  }
                  if (cursos.length === 0) {
                    return (
                      <div className="rounded-2xl p-10 text-center" style={card}>
                        <p className="text-slate-300 text-sm font-semibold">No hay cursos en el catálogo</p>
                        <p className="text-slate-200 text-xs mt-1">Crea cursos arriba con &ldquo;+ Nuevo curso&rdquo;</p>
                      </div>
                    )
                  }
                  const acentoBg = nivelCursoTab === 'Cocina' ? 'linear-gradient(135deg,#10b981,#34d399)' : 'linear-gradient(135deg,#0B2447,#1E3A8A)'
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {secciones.map(({ grado, grupo }) => {
                        const key       = `${grado}__${grupo}`
                        const asigsSec  = asignaciones.filter(a => a.grado === grado && a.grupo === grupo)
                                          .sort((x,y) => {
                                            const cx = (x.cursos as unknown as { nombre: string } | null)?.nombre ?? ''
                                            const cy = (y.cursos as unknown as { nombre: string } | null)?.nombre ?? ''
                                            return cx.localeCompare(cy)
                                          })
                        const cursosAsignadosIds = new Set(asigsSec.map(a => a.curso_id))
                        const cursosDisponibles  = cursos.filter(c => !cursosAsignadosIds.has(c.id))
                        const addOpen   = seccionAddOpen === key
                        const colapsada = seccionesColapsadas.has(key)
                        const gradoCorto = grado.split(' ')[0]

                        return (
                          <div key={key} className="rounded-2xl overflow-hidden" style={card}>
                            {/* Cabecera */}
                            <button onClick={() => setSeccionesColapsadas(prev => {
                              const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n
                            })} className="w-full px-4 py-3 flex items-center gap-3 text-left transition-colors hover:bg-slate-50">
                              <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0"
                                style={{ background: acentoBg, color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}>
                                <span className="text-base font-black leading-none">{gradoCorto}</span>
                                <span className="text-[10px] font-black leading-none mt-0.5 opacity-90">{grupo}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-slate-800 font-bold text-sm">{grado} · Sección {grupo}</p>
                                <p className="text-slate-400 text-[10px] mt-0.5">
                                  {asigsSec.length === 0
                                    ? <span className="text-amber-600 font-bold">⚠ Sin cursos asignados</span>
                                    : `${asigsSec.length} curso${asigsSec.length !== 1 ? 's' : ''} · ${new Set(asigsSec.map(a => a.docente_id)).size} docente${new Set(asigsSec.map(a => a.docente_id)).size !== 1 ? 's' : ''}`}
                                </p>
                              </div>
                              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth="2.5"
                                style={{ transform: colapsada ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform .2s' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                              </svg>
                            </button>

                            {/* Cuerpo */}
                            {!colapsada && (
                              <div className="border-t border-slate-100">
                                {asigsSec.length === 0 ? (
                                  <p className="px-4 py-4 text-xs text-slate-300 italic text-center">Sin cursos — usa &ldquo;+ Agregar curso&rdquo; abajo</p>
                                ) : (
                                  <ul className="divide-y divide-slate-100">
                                    {asigsSec.map(a => {
                                      const curso = a.cursos as unknown as { nombre: string; color: string } | null
                                      const color = curso?.color ?? '#143875'
                                      const docente = docentes.find(d => d.id === a.docente_id)
                                      const editando = swapAsigId === a.id
                                      return (
                                        <li key={a.id} className="px-3 py-2 flex items-center gap-2">
                                          {/* Curso */}
                                          <div className="flex items-center gap-1.5 shrink-0" style={{ width: '38%' }}>
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }}/>
                                            <span className="text-[11px] font-bold truncate" style={{ color }}>{curso?.nombre ?? '—'}</span>
                                          </div>
                                          {/* Docente / select */}
                                          <div className="flex-1 min-w-0">
                                            {editando ? (
                                              <select
                                                autoFocus
                                                value={a.docente_id}
                                                disabled={asigLoading}
                                                onChange={e => handleCambiarDocenteAsignacion(a.id, e.target.value)}
                                                onBlur={() => setSwapAsigId(null)}
                                                className="w-full px-2 py-1 rounded-lg text-[11px] text-slate-800 bg-white border border-indigo-300 outline-none focus:ring-2 focus:ring-indigo-100">
                                                {docentes.map(d => <option key={d.id} value={d.id}>{displayDocente(d)}</option>)}
                                              </select>
                                            ) : (
                                              <button onClick={() => setSwapAsigId(a.id)}
                                                className="w-full text-left px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5">
                                                <span className="truncate">{docente ? displayDocente(docente) : <span className="text-amber-600">⚠ Sin docente</span>}</span>
                                                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth="2.5" className="shrink-0">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                                                </svg>
                                              </button>
                                            )}
                                          </div>
                                          {/* Eliminar */}
                                          <button onClick={() => handleEliminarAsignacion(a.id)}
                                            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors shrink-0"
                                            title="Quitar curso de la sección">
                                            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                            </svg>
                                          </button>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}
                                {/* Agregar curso */}
                                <div className="px-3 py-2.5 border-t border-slate-100" style={{ background: '#F8FAFC' }}>
                                  {!addOpen ? (
                                    <button
                                      disabled={cursosDisponibles.length === 0}
                                      onClick={() => { setSeccionAddOpen(key); setSeccionAddCurso(''); setSeccionAddDocente('') }}
                                      className="w-full py-1.5 rounded-lg text-[11px] font-black transition-all disabled:opacity-50"
                                      style={cursosDisponibles.length === 0
                                        ? { background: '#f1f5f9', color: '#94a3b8' }
                                        : { background: 'white', border: '1.5px dashed #d4a5a8', color: '#0B2447' }}>
                                      {cursosDisponibles.length === 0 ? 'Todos los cursos asignados' : '+ Agregar curso'}
                                    </button>
                                  ) : (
                                    <div className="space-y-2">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div>
                                          <label className={labelCls}>Curso</label>
                                          <select value={seccionAddCurso} onChange={e => setSeccionAddCurso(e.target.value)} className={selectCls}>
                                            <option value="">— Seleccionar —</option>
                                            {cursosDisponibles.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                          </select>
                                        </div>
                                        <div>
                                          <label className={labelCls}>Docente</label>
                                          <select value={seccionAddDocente} onChange={e => setSeccionAddDocente(e.target.value)} className={selectCls}>
                                            <option value="">— Seleccionar —</option>
                                            {docentes.map(d => <option key={d.id} value={d.id}>{displayDocente(d)}</option>)}
                                          </select>
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => { setSeccionAddOpen(null); setSeccionAddCurso(''); setSeccionAddDocente('') }}
                                          className="flex-1 py-1.5 rounded-lg text-[11px] font-black transition-all"
                                          style={{ background: '#f1f5f9', color: '#64748b', border: '1.5px solid #e2e8f0' }}>
                                          Cancelar
                                        </button>
                                        <button
                                          disabled={asigLoading || !seccionAddCurso || !seccionAddDocente}
                                          onClick={() => handleCrearAsignacionSeccion(grado, grupo, seccionAddDocente, seccionAddCurso)}
                                          className="flex-1 py-1.5 rounded-lg text-[11px] font-black text-white disabled:opacity-50 transition-all"
                                          style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                                          <span className="flex items-center justify-center gap-2">
                                            {asigLoading && <Spinner cls="h-3 w-3 text-white"/>}
                                            {asigLoading ? 'Guardando...' : 'Guardar'}
                                          </span>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()
              )}
            </div>

          </div>
          )
        })()}

        {/* ══ HORARIO ══════════════════════════════════════════════════════════ */}
        {tab === 'horario' && (() => {
          const gradosPrimaria    = GRADOS.filter(g => g.includes('Cocina'))
          const gradosSecundaria  = GRADOS.filter(g => g.includes('Pastelería'))
          const gradosNivel       = nivelFiltroH === 'Cocina' ? gradosPrimaria : gradosSecundaria

          // Vista por grado
          const asigsFiltradas    = asignaciones.filter(a => a.grado === gradoFiltroH && a.grupo === grupoFiltroH)
          const horariosFiltrados = horarios.filter(h => h.grado === gradoFiltroH && h.grupo === grupoFiltroH)

          // Vista por docente
          const docenteSelec      = docentesLean.find(d => d.id === docenteFiltroH)
          const horariosDocente   = horarios.filter(h => h.docente_id === docenteFiltroH)
          const asigsDocente      = asignaciones.filter(a => a.docente_id === docenteFiltroH)

          return (
            <div className="space-y-4">
              {/* ── Filtros ── */}
              <div className="rounded-2xl overflow-hidden" style={card}>
                {accentBar}
                <div className="p-4 space-y-3">
                  {/* Toggle vista */}
                  <div className="flex items-center gap-3">
                    <div className="flex rounded-xl overflow-hidden border border-slate-200">
                      {(['grado','docente'] as const).map(v => (
                        <button key={v} onClick={() => setVistaHorario(v)}
                          className="px-4 py-2 text-xs font-black transition-all"
                          style={vistaHorario === v
                            ? { background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white' }
                            : { background: 'white', color: '#94a3b8' }}>
                          {v === 'grado' ? 'Por Grado/Grupo' : 'Por Docente'}
                        </button>
                      ))}
                    </div>
                    {cicloActivoInfo && (
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest"
                        style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #bbf7d0' }}>
                        ● Ciclo {cicloActivoInfo.nombre}
                      </span>
                    )}
                    {loadingHorarios && <Spinner cls="h-4 w-4 text-indigo-800"/>}

                    {/* ── Botón PDF ── */}
                    <button
                      onClick={() => { setPdfOpcionH(null); setPdfMenuH(true) }}
                      disabled={generandoPdfH}
                      className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all select-none"
                      style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3', color: '#0B2447', opacity: generandoPdfH ? 0.6 : 1 }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                      </svg>
                      Descargar PDF
                    </button>
                  </div>

                  {/* Filtros vista por grado */}
                  {vistaHorario === 'grado' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex rounded-xl overflow-hidden border border-slate-200">
                        {(['Cocina','Pastelería'] as const).map(n => (
                          <button key={n} onClick={() => {
                            setNivelFiltroH(n)
                            setGradoFiltroH((n === 'Cocina' ? gradosPrimaria : gradosSecundaria)[0])
                          }}
                            className="px-3 py-1.5 text-xs font-black transition-all"
                            style={nivelFiltroH === n
                              ? { background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white' }
                              : { background: 'white', color: '#94a3b8' }}>
                            {n}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {gradosNivel.map(g => (
                          <button key={g} onClick={() => setGradoFiltroH(g)}
                            className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                            style={gradoFiltroH === g
                              ? { background: '#F1F5F9', border: '1.5px solid #1E3A8A', color: '#0B2447' }
                              : { background: 'white', border: '1.5px solid #E4E8EF', color: '#94a3b8' }}>
                            {g.split('°')[0]}°
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        {GRUPOS.map(g => (
                          <button key={g} onClick={() => setGrupoFiltroH(g)}
                            className="w-8 h-8 rounded-lg text-xs font-black transition-all"
                            style={grupoFiltroH === g
                              ? { background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white' }
                              : { background: 'white', border: '1.5px solid #E4E8EF', color: '#94a3b8' }}>
                            {g}
                          </button>
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 ml-1">
                        {gradoFiltroH} — {grupoFiltroH}
                      </span>
                    </div>
                  )}

                  {/* Filtro vista por docente */}
                  {vistaHorario === 'docente' && (() => {
                    const docentesFiltrados = docentesLean.filter(d => {
                      const matchNombre = !docenteBusquedaH.trim() ||
                        d.nombre.toLowerCase().includes(docenteBusquedaH.toLowerCase())
                      const matchCurso = !cursoBusquedaH.trim() ||
                        asignaciones.some(a =>
                          a.docente_id === d.id &&
                          a.cursos?.nombre.toLowerCase().includes(cursoBusquedaH.toLowerCase())
                        )
                      return matchNombre && matchCurso
                    })
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          placeholder="Buscar docente…"
                          value={docenteBusquedaH}
                          onChange={e => { setDocenteBusquedaH(e.target.value); setDocenteFiltroH('') }}
                          className={selectCls}
                          style={{ maxWidth: '190px' }}
                        />
                        <input
                          type="text"
                          placeholder="Buscar por curso…"
                          value={cursoBusquedaH}
                          onChange={e => { setCursoBusquedaH(e.target.value); setDocenteFiltroH('') }}
                          className={selectCls}
                          style={{ maxWidth: '190px' }}
                        />
                        <select
                          value={docenteFiltroH}
                          onChange={e => setDocenteFiltroH(e.target.value)}
                          className={selectCls}
                          style={{ maxWidth: '280px' }}>
                          <option value="">— Selecciona un docente —</option>
                          {docentesFiltrados.map(d => (
                            <option key={d.id} value={d.id}>{d.nombre}</option>
                          ))}
                        </select>
                        {docenteSelec && (
                          <span className="text-[10px] font-bold text-slate-400">
                            {horariosDocente.length} clase{horariosDocente.length !== 1 ? 's' : ''} asignada{horariosDocente.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* ══ VISTA POR DOCENTE ══════════════════════════════════════════ */}
              {vistaHorario === 'docente' && (
                !docenteFiltroH ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3' }}>
                      <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                      </svg>
                    </div>
                    <p className="text-slate-300 text-sm font-semibold">Selecciona un docente para ver su horario</p>
                  </div>
                ) : (
                  <div className="flex gap-4 items-start">
                    {/* Grid docente */}
                    <div className="flex-1 min-w-0 rounded-2xl overflow-hidden" style={card}>
                      {accentBar}
                      <div className="px-4 py-2.5 flex items-center justify-between bg-slate-50/60"
                        style={{ borderBottom: '1px solid #E4E8EF' }}>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Horario de {docenteSelec?.nombre}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ minWidth: '540px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #E4E8EF' }}>
                              <th className="w-28 px-3 py-2.5 text-left" style={{ background: '#faf8f7' }}>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Período</span>
                              </th>
                              {DIAS_SEMANA.map(d => (
                                <th key={d} className="px-2 py-2.5 text-center" style={{ background: '#faf8f7', borderLeft: '1px solid #E4E8EF' }}>
                                  <span className="text-[11px] font-black text-slate-600">{d}</span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {periodos.map(periodo => {
                              const isBreak = periodo.tipo !== 'hora'
                              const breakColors = {
                                recreo:   { bg: '#fffbeb', text: '#d97706' },
                                almuerzo: { bg: '#f0fdf4', text: '#16a34a' },
                              }
                              return (
                                <tr key={periodo.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td className="px-3 py-2" style={{ background: '#faf8f7', verticalAlign: 'middle' }}>
                                    <p className="text-[11px] font-black text-slate-700 leading-tight">{periodo.nombre}</p>
                                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">{periodo.inicio} – {periodo.fin}</p>
                                  </td>
                                  {isBreak ? (
                                    <td colSpan={5} className="px-3 py-2"
                                      style={{ borderLeft: '1px solid #E4E8EF', background: breakColors[periodo.tipo as 'recreo'|'almuerzo'].bg }}>
                                      <div className="flex items-center justify-center gap-2 py-0.5">
                                        <div className="h-px flex-1 opacity-30" style={{ background: breakColors[periodo.tipo as 'recreo'|'almuerzo'].text }}/>
                                        <span className="text-[11px] font-black" style={{ color: breakColors[periodo.tipo as 'recreo'|'almuerzo'].text }}>
                                          {periodo.nombre} · {periodo.inicio} – {periodo.fin}
                                        </span>
                                        <div className="h-px flex-1 opacity-30" style={{ background: breakColors[periodo.tipo as 'recreo'|'almuerzo'].text }}/>
                                      </div>
                                    </td>
                                  ) : (
                                    DIAS_SEMANA.map(dia => {
                                      const coveredDoc = buildCoveredSet(dia, horariosDocente, periodos)
                                      if (coveredDoc.has(periodo.inicio)) return null
                                      const clase    = horariosDocente.find(h => h.dia === dia && h.hora_inicio === periodo.inicio)
                                      const span     = clase ? calcSpan(clase, periodo, periodos) : 1
                                      const cellKey  = `doc-${dia}-${periodo.inicio}`
                                      const isOver   = dragOver === cellKey
                                      const isSaving = guardandoCelda === cellKey

                                      // Color del curso
                                      const asigClase   = clase ? asigsDocente.find(a => a.cursos?.nombre === clase.materia && a.grado === clase.grado && a.grupo === clase.grupo) : null
                                      const cursoColor  = asigClase?.cursos?.color ?? '#143875'
                                      const colorBg     = cursoColor + '22'
                                      const colorBorder = cursoColor + '66'

                                      // ¿Puede extender?
                                      const periodoIdx = periodos.findIndex(p => p.id === periodo.id)
                                      let nextHora: Periodo | null = null
                                      for (let i = periodoIdx + span; i < periodos.length; i++) {
                                        if (periodos[i].tipo === 'recreo' || periodos[i].tipo === 'almuerzo') break
                                        if (periodos[i].tipo === 'hora') { nextHora = periodos[i]; break }
                                      }
                                      const puedeExtDoc = !!clase && !!nextHora &&
                                        !horariosDocente.some(h => h.dia === dia && h.hora_inicio === nextHora!.inicio)

                                      return (
                                        <td key={dia} rowSpan={span}
                                          style={{ borderLeft: '1px solid #E4E8EF', verticalAlign: 'middle', padding: '4px' }}
                                          onDragOver={e => { e.preventDefault(); setDragOver(cellKey) }}
                                          onDragLeave={() => setDragOver(null)}
                                          onDrop={() => handleDropCelda(periodo, dia)}>
                                          {isSaving ? (
                                            <div className="flex items-center justify-center rounded-xl"
                                              style={{ minHeight: `${span * 56}px`, background: colorBg, border: `1.5px dashed ${cursoColor}` }}>
                                              <Spinner cls="h-4 w-4 text-indigo-800"/>
                                            </div>
                                          ) : clase ? (
                                            <div className="relative group flex flex-col rounded-xl px-2 py-1.5 cursor-default"
                                              style={{ background: colorBg, border: `1.5px solid ${colorBorder}`, minHeight: `${span * 56}px` }}>
                                              <button onClick={() => handleEliminarHorario(clase.id)}
                                                className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                style={{ background: '#fef2f2', color: '#ef4444' }}>
                                                <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                                </svg>
                                              </button>
                                              <div className="flex-1 flex flex-col items-center justify-center text-center gap-0.5 px-1">
                                                <p className="text-[10px] font-black leading-tight w-full" style={{ color: cursoColor }}>{clase.materia}</p>
                                                <p className="text-[9px] font-bold leading-tight w-full" style={{ color: cursoColor + '99' }}>
                                                  {clase.grado} {clase.grupo}
                                                </p>
                                                {span > 1 && (
                                                  <span className="inline-block mt-0.5 text-[8px] font-black px-1.5 py-0.5 rounded-md"
                                                    style={{ background: cursoColor + '33', color: cursoColor }}>
                                                    {duracionSpan(span)}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex justify-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {span > 1 && (
                                                  <button onClick={() => encogerClase(clase.id, periodo, periodos, span)}
                                                    className="flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.5 rounded-md"
                                                    style={{ background: cursoColor + '33', color: cursoColor }}>
                                                    <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/>
                                                    </svg>−1h
                                                  </button>
                                                )}
                                                {puedeExtDoc && (
                                                  <button onClick={() => extenderClase(clase.id, clase.hora_fin, periodos)}
                                                    className="flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.5 rounded-md"
                                                    style={{ background: cursoColor, color: 'white' }}>
                                                    +1h<svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                                                    </svg>
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="rounded-xl flex items-center justify-center transition-all"
                                              style={{
                                                minHeight: '54px',
                                                ...(isOver
                                                  ? { background: '#F1F5F9', border: '2px dashed #1E3A8A' }
                                                  : { background: dragItem ? '#F6F8FB' : 'transparent', border: dragItem ? '1.5px dashed #fecdd3' : '1.5px dashed transparent' })
                                              }}>
                                              {isOver && <svg className="w-4 h-4 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>}
                                            </div>
                                          )}
                                        </td>
                                      )
                                    })
                                  )}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {/* Estado guardado */}
                      {(gridGuardando || gridSavedOk || horarioError) && (
                        <div className="px-4 py-2.5 flex items-center gap-2"
                          style={{ borderTop: '1px solid #E4E8EF', background: gridSavedOk ? '#f0fdf4' : horarioError ? '#fef2f2' : '#faf8f7' }}>
                          {gridGuardando && <><Spinner cls="h-3.5 w-3.5 text-indigo-800"/><span className="text-[11px] text-indigo-900 font-semibold">Guardando...</span></>}
                          {gridSavedOk && !gridGuardando && <><svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg><span className="text-[11px] text-emerald-600 font-bold">Guardado</span></>}
                          {horarioError && !gridGuardando && !gridSavedOk && <span className="text-[11px] text-indigo-600 font-semibold">{horarioError}</span>}
                        </div>
                      )}
                    </div>

                    {/* Panel derecho — asignaciones del docente */}
                    <div className="w-52 shrink-0 space-y-3">
                      <div className="rounded-2xl overflow-hidden" style={card}>
                        {accentBar}
                        <div className="px-3 py-2.5 bg-slate-50/60" style={{ borderBottom: '1px solid #E4E8EF' }}>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cursos asignados</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Arrastra al horario</p>
                        </div>
                        <div className="p-2 space-y-1.5 max-h-[600px] overflow-y-auto">
                          {asigsDocente.length === 0 ? (
                            <div className="py-6 text-center">
                              <p className="text-[10px] text-slate-300 font-semibold">Sin cursos asignados</p>
                            </div>
                          ) : (
                            asigsDocente.map(asig => {
                              if (!asig.cursos) return null
                              const item: DragItem = {
                                docente_id: docenteFiltroH,
                                docente_nombre: docenteSelec?.nombre ?? '',
                                curso_nombre: asig.cursos.nombre,
                                curso_color: asig.cursos.color,
                                grado: asig.grado,
                                grupo: asig.grupo,
                              }
                              return (
                                <div key={asig.id}
                                  draggable
                                  onDragStart={() => { dragItemRef.current = item; setDragItem(item) }}
                                  onDragEnd={() => { dragItemRef.current = null; setDragItem(null); setDragOver(null) }}
                                  className="rounded-xl px-2.5 py-2 cursor-grab active:cursor-grabbing select-none"
                                  style={{ background: asig.cursos.color + '18', border: `1.5px solid ${asig.cursos.color}44` }}>
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: asig.cursos.color }}/>
                                    <span className="text-[10px] font-black truncate" style={{ color: asig.cursos.color }}>{asig.cursos.nombre}</span>
                                  </div>
                                  <p className="text-[9px] text-slate-500 font-semibold pl-3.5">{asig.grado} · {asig.grupo}</p>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                      {dragItem && (
                        <div className="rounded-xl px-3 py-2 text-center"
                          style={{ background: '#F1F5F9', border: '1.5px dashed #1E3A8A' }}>
                          <p className="text-[10px] font-bold text-indigo-900">Suelta en una celda del horario</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}

              {/* ══ VISTA POR GRADO ════════════════════════════════════════════ */}
              {vistaHorario === 'grado' && (
              /* ── Grid + Panel ── */
              <div className="flex gap-4 items-start">

                {/* GRID */}
                <div className="flex-1 min-w-0 rounded-2xl overflow-hidden" style={card}>
                  {accentBar}

                  {/* Cabecera acciones periodos */}
                  <div className="px-4 py-2.5 flex items-center justify-between bg-slate-50/60"
                    style={{ borderBottom: '1px solid #E4E8EF' }}>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Horario semanal</span>
                    <div className="flex items-center gap-2">
                      {editandoPeriodos && (
                        <>
                          <button onClick={() => agregarPeriodo('hora')}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                            style={{ background: '#F1F5F9', border: '1px solid #fecdd3', color: '#0B2447' }}>
                            + Hora
                          </button>
                          <button onClick={() => agregarPeriodo('recreo')}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                            style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#d97706' }}>
                            + Recreo
                          </button>
                          <button onClick={() => agregarPeriodo('almuerzo')}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a' }}>
                            + Almuerzo
                          </button>
                        </>
                      )}
                      <button onClick={() => { if (!editandoPeriodos) setPeriodosOriginal(periodos.map(p => ({ ...p }))); setEditandoPeriodos(!editandoPeriodos); setHorarioError('') }}
                        className="text-[10px] font-black px-2.5 py-1.5 rounded-lg transition-all"
                        style={editandoPeriodos
                          ? { background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#64748b' }
                          : { background: '#faf8f7', border: '1px solid #e2e8f0', color: '#64748b' }}>
                        {editandoPeriodos ? 'Cancelar' : 'Editar horas'}
                      </button>
                    </div>
                  </div>

                  {/* Tabla */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: '540px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #E4E8EF' }}>
                          <th className="w-28 px-3 py-2.5 text-left"
                            style={{ background: '#faf8f7' }}>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Período</span>
                          </th>
                          {DIAS_SEMANA.map(d => (
                            <th key={d} className="px-2 py-2.5 text-center"
                              style={{ background: '#faf8f7', borderLeft: '1px solid #E4E8EF' }}>
                              <span className="text-[11px] font-black text-slate-600">{d}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {periodos.map((periodo) => {
                          const isBreak = periodo.tipo === 'recreo' || periodo.tipo === 'almuerzo'
                          const breakColors = {
                            recreo:   { bg: '#fffbeb', border: '#fde68a', text: '#d97706' },
                            almuerzo: { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a' },
                          }
                          return (
                            <tr key={periodo.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              {/* Columna período */}
                              <td className="px-3 py-2" style={{ background: '#faf8f7', verticalAlign: 'middle' }}>
                                {editandoPeriodos ? (
                                  <div className="space-y-1">
                                    <input
                                      value={periodo.nombre}
                                      onChange={e => actualizarPeriodo(periodo.id, 'nombre', e.target.value)}
                                      className="w-full text-[10px] font-bold px-1.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 outline-none focus:border-indigo-900"
                                    />
                                    <div className="flex gap-1 items-center">
                                      <input type="time" value={periodo.inicio}
                                        onChange={e => actualizarPeriodo(periodo.id, 'inicio', e.target.value)}
                                        className="flex-1 text-[9px] px-1 py-0.5 rounded border border-slate-200 bg-white text-slate-600 outline-none focus:border-indigo-900"/>
                                      <span className="text-[9px] text-slate-300">–</span>
                                      <input type="time" value={periodo.fin}
                                        onChange={e => actualizarPeriodo(periodo.id, 'fin', e.target.value)}
                                        className="flex-1 text-[9px] px-1 py-0.5 rounded border border-slate-200 bg-white text-slate-600 outline-none focus:border-indigo-900"/>
                                      <button onClick={() => eliminarPeriodo(periodo.id)}
                                        className="w-5 h-5 flex items-center justify-center rounded text-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all">
                                        <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="text-[11px] font-black text-slate-700 leading-tight">{periodo.nombre}</p>
                                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">{periodo.inicio} – {periodo.fin}</p>
                                  </div>
                                )}
                              </td>

                              {/* Celdas de días */}
                              {isBreak ? (
                                <td colSpan={5} className="px-3 py-2"
                                  style={{
                                    borderLeft: '1px solid #E4E8EF',
                                    background: breakColors[periodo.tipo as 'recreo'|'almuerzo'].bg,
                                  }}>
                                  <div className="flex items-center justify-center gap-2 py-0.5">
                                    <div className="h-px flex-1 opacity-30"
                                      style={{ background: breakColors[periodo.tipo as 'recreo'|'almuerzo'].text }}/>
                                    <span className="text-[11px] font-black"
                                      style={{ color: breakColors[periodo.tipo as 'recreo'|'almuerzo'].text }}>
                                      {periodo.nombre} · {periodo.inicio} – {periodo.fin}
                                    </span>
                                    <div className="h-px flex-1 opacity-30"
                                      style={{ background: breakColors[periodo.tipo as 'recreo'|'almuerzo'].text }}/>
                                  </div>
                                </td>
                              ) : (
                                DIAS_SEMANA.map(dia => {
                                  const cellKey    = `${dia}-${periodo.inicio}`
                                  const coveredSet = buildCoveredSet(dia, horariosFiltrados, periodos)
                                  if (coveredSet.has(periodo.inicio)) return null // cubierta por rowspan

                                  const clase    = horariosFiltrados.find(h => h.dia === dia && h.hora_inicio === periodo.inicio)
                                  const isOver   = dragOver === cellKey
                                  const isSaving = guardandoCelda === cellKey
                                  const span     = clase ? calcSpan(clase, periodo, periodos) : 1

                                  // ¿Puede extenderse al siguiente período hora sin cruzar un descanso?
                                  const periodoIdx = periodos.findIndex(p => p.id === periodo.id)
                                  let nextHoraPeriodo: Periodo | null = null
                                  for (let i = periodoIdx + span; i < periodos.length; i++) {
                                    if (periodos[i].tipo === 'recreo' || periodos[i].tipo === 'almuerzo') break
                                    if (periodos[i].tipo === 'hora') { nextHoraPeriodo = periodos[i]; break }
                                  }
                                  const puedeExtender = !!clase && !!nextHoraPeriodo &&
                                    !horariosFiltrados.some(h => h.dia === dia && h.hora_inicio === nextHoraPeriodo!.inicio)

                                  // Color del curso desde asignaciones
                                  const asigClase   = clase ? asigsFiltradas.find(a => a.docente_id === clase.docente_id && a.cursos?.nombre === clase.materia) : null
                                  const cursoColor  = asigClase?.cursos?.color ?? '#143875'
                                  const colorBg     = cursoColor + '22'
                                  const colorBorder = cursoColor + '66'
                                  const colorBadge  = cursoColor + '33'

                                  return (
                                    <td key={dia}
                                      rowSpan={span}
                                      style={{ borderLeft: '1px solid #E4E8EF', verticalAlign: 'middle', padding: '4px' }}
                                      onDragOver={e => { e.preventDefault(); setDragOver(cellKey) }}
                                      onDragLeave={() => setDragOver(null)}
                                      onDrop={() => handleDropCelda(periodo, dia)}>

                                      {isSaving ? (
                                        <div className="flex items-center justify-center rounded-xl"
                                          style={{ minHeight: `${span * 56}px`, background: colorBg, border: `1.5px dashed ${cursoColor}` }}>
                                          <Spinner cls="h-4 w-4 text-indigo-800"/>
                                        </div>
                                      ) : clase ? (
                                        <div className="relative group flex flex-col rounded-xl px-2 py-1.5 cursor-default"
                                          style={{ background: colorBg, border: `1.5px solid ${colorBorder}`, minHeight: `${span * 56}px` }}>
                                          {/* Borrar */}
                                          <button
                                            onClick={() => handleEliminarHorario(clase.id)}
                                            className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                            style={{ background: '#fef2f2', color: '#ef4444' }}>
                                            <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                            </svg>
                                          </button>
                                          {/* Contenido centrado */}
                                          <div className="flex-1 flex flex-col items-center justify-center text-center gap-0.5 px-1">
                                            <p className="text-[10px] font-black leading-tight w-full"
                                              style={{ color: cursoColor }}>{clase.materia}</p>
                                            <p className="text-[9px] font-semibold leading-tight w-full opacity-80"
                                              style={{ color: cursoColor }}>{clase.docentes?.nombre}</p>
                                            {span > 1 && (
                                              <span className="inline-block mt-0.5 text-[8px] font-black px-1.5 py-0.5 rounded-md"
                                                style={{ background: colorBadge, color: cursoColor }}>
                                                {duracionSpan(span)}
                                              </span>
                                            )}
                                          </div>
                                          {/* Botones extender/encoger */}
                                          <div className="flex justify-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {span > 1 && (
                                              <button
                                                onClick={() => encogerClase(clase.id, periodo, periodos, span)}
                                                title="Reducir una hora"
                                                className="flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.5 rounded-md transition-all"
                                                style={{ background: colorBadge, color: cursoColor }}>
                                                <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/>
                                                </svg>
                                                −1h
                                              </button>
                                            )}
                                            {puedeExtender && (
                                              <button
                                                onClick={() => extenderClase(clase.id, clase.hora_fin, periodos)}
                                                title="Agregar una hora más"
                                                className="flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.5 rounded-md transition-all"
                                                style={{ background: cursoColor, color: 'white' }}>
                                                +1h
                                                <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                                                </svg>
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="rounded-xl flex items-center justify-center transition-all"
                                          style={{
                                            minHeight: '54px',
                                            ...(isOver
                                              ? { background: '#F1F5F9', border: '2px dashed #1E3A8A' }
                                              : { background: dragItem ? '#F6F8FB' : 'transparent', border: dragItem ? '1.5px dashed #fecdd3' : '1.5px dashed transparent' })
                                          }}>
                                          {isOver && (
                                            <svg className="w-4 h-4 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                                            </svg>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  )
                                })
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Barra de estado del grid (drag/extender) ── */}
                  {(gridGuardando || gridSavedOk || (horarioError && !editandoPeriodos)) && (
                    <div className="px-4 py-2.5 flex items-center gap-2"
                      style={{ borderTop: '1px solid #E4E8EF', background: gridSavedOk ? '#f0fdf4' : horarioError ? '#fef2f2' : '#faf8f7' }}>
                      {gridGuardando && <><Spinner cls="h-3.5 w-3.5 text-indigo-800"/><span className="text-[11px] text-indigo-900 font-semibold">Guardando...</span></>}
                      {gridSavedOk && !gridGuardando && (
                        <>
                          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                          </svg>
                          <span className="text-[11px] text-emerald-600 font-bold">Cambios guardados correctamente</span>
                        </>
                      )}
                      {horarioError && !gridGuardando && !gridSavedOk && (
                        <span className="text-[11px] text-indigo-600 font-semibold">{horarioError}</span>
                      )}
                    </div>
                  )}

                  {/* ── Barra de guardado de períodos ── */}
                  {editandoPeriodos && (
                    <div className="px-4 py-3 flex items-center justify-between gap-3"
                      style={{ borderTop: '1px solid #E4E8EF', background: '#faf8f7' }}>
                      <p className="text-[10px] text-slate-400 font-semibold">
                        Los cambios en horas y períodos se guardan al presionar el botón.
                      </p>
                      <button
                        onClick={guardarPeriodos}
                        disabled={guardandoPeriodos}
                        className="flex items-center gap-2 text-sm font-black px-4 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-60 shrink-0"
                        style={{ background: periodosSavedOk ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white', boxShadow: '0 4px 14px rgba(11,36,71,.25)' }}>
                        {guardandoPeriodos
                          ? <><Spinner cls="h-4 w-4 text-white"/> Guardando...</>
                          : periodosSavedOk
                          ? <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg> ¡Guardado!</>
                          : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg> Guardar cambios</>
                        }
                      </button>
                    </div>
                  )}

                  {/* Error horario */}
                  {horarioError && (
                    <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                      style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#dc2626' }}>
                      <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      </svg>
                      <span>{horarioError}</span>
                    </div>
                  )}
                </div>

                {/* PANEL DERECHO — Docentes/Cursos */}
                <div className="w-52 shrink-0 space-y-3">
                  <div className="rounded-2xl overflow-hidden" style={card}>
                    {accentBar}
                    <div className="px-3 py-2.5 bg-slate-50/60" style={{ borderBottom: '1px solid #E4E8EF' }}>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Docentes</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{gradoFiltroH} · {grupoFiltroH} · Arrastra al horario</p>
                      <input
                        type="text"
                        placeholder="Buscar curso o docente…"
                        value={busquedaPanelH}
                        onChange={e => setBusquedaPanelH(e.target.value)}
                        className="mt-2 w-full rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-600 placeholder-slate-300 outline-none"
                        style={{ background: 'white', border: '1.5px solid #E4E8EF' }}
                      />
                    </div>
                    <div className="p-2 space-y-1.5 max-h-[600px] overflow-y-auto">
                      {asigsFiltradas.length === 0 ? (
                        <div className="py-6 text-center">
                          <p className="text-[10px] text-slate-300 font-semibold leading-relaxed">
                            Sin asignaciones<br/>para este grado/grupo
                          </p>
                          <p className="text-[9px] text-slate-200 mt-1">Ve al tab Cursos para asignar</p>
                        </div>
                      ) : (
                        asigsFiltradas.filter(asig => {
                          if (!busquedaPanelH.trim()) return true
                          const q = busquedaPanelH.toLowerCase()
                          const docente = docentes.find(d => d.id === asig.docente_id)
                          return (
                            asig.cursos?.nombre.toLowerCase().includes(q) ||
                            docente?.nombre.toLowerCase().includes(q)
                          )
                        }).map(asig => {
                          const docente = docentesLean.find(d => d.id === asig.docente_id)
                          if (!docente || !asig.cursos) return null
                          const item: DragItem = {
                            docente_id: docente.id,
                            docente_nombre: docente.nombre,
                            curso_nombre: asig.cursos.nombre,
                            curso_color: asig.cursos.color,
                          }
                          return (
                            <div key={asig.id}
                              draggable
                              onDragStart={() => { dragItemRef.current = item; setDragItem(item) }}
                              onDragEnd={() => { dragItemRef.current = null; setDragItem(null); setDragOver(null) }}
                              className="rounded-xl px-2.5 py-2 cursor-grab active:cursor-grabbing transition-all select-none"
                              style={{
                                background: asig.cursos.color + '18',
                                border: `1.5px solid ${asig.cursos.color}44`,
                                opacity: dragItem?.curso_nombre === asig.cursos.nombre && dragItem?.docente_id === docente.id ? 0.5 : 1,
                              }}>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: asig.cursos.color }}/>
                                <span className="text-[10px] font-black truncate" style={{ color: asig.cursos.color }}>
                                  {asig.cursos.nombre}
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-500 font-semibold truncate pl-3.5">{docente.nombre}</p>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Instrucción */}
                  {dragItem && (
                    <div className="rounded-xl px-3 py-2 text-center"
                      style={{ background: '#F1F5F9', border: '1.5px dashed #1E3A8A' }}>
                      <p className="text-[10px] font-bold text-indigo-900">Suelta en una celda del horario</p>
                    </div>
                  )}
                </div>
              </div>
              )}

            </div>
          )
        })()}

        {/* ══ GESTIÓN USUARIOS ═════════════════════════════════════════════════ */}
        {(tab === 'docentes' || tab === 'admins' || tab === 'alumnos') && (
          <>
            {/* Barra de acciones */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-slate-900 font-black text-xl">
                  {tab === 'admins' ? 'Administradores' : tab === 'alumnos' ? 'Alumnos' : 'Docentes'}
                </h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  {tab === 'admins' ? admins.length : tab === 'alumnos' ? totalAlumnos : totalDocentes} registro{(tab === 'admins' ? admins.length : tab === 'alumnos' ? totalAlumnos : totalDocentes) !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {tab === 'alumnos' && (
                  <>
                    <button onClick={descargarPlantillaAlumnos}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all"
                      style={{ background: '#faf8f7', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Plantilla
                    </button>
                    <button onClick={() => { setMostrarImportAlumnos(!mostrarImportAlumnos); setMostrarForm(false); setImportAlumnosResult(null) }}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all"
                      style={mostrarImportAlumnos
                        ? { background: '#F1F5F9', border: '1.5px solid #1E3A8A', color: '#0B2447' }
                        : { background: '#faf8f7', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Importar
                    </button>
                  </>
                )}
                {tab === 'docentes' && (
                  <>
                    <button onClick={descargarPlantilla}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all"
                      style={{ background: '#faf8f7', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Plantilla
                    </button>
                    <button onClick={() => { setMostrarImport(!mostrarImport); setMostrarForm(false); setImportResult(null) }}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all"
                      style={mostrarImport
                        ? { background: '#F1F5F9', border: '1.5px solid #1E3A8A', color: '#0B2447' }
                        : { background: '#faf8f7', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Importar
                    </button>
                    <button
                      onClick={() => setModalDescarga('imagen')}
                      disabled={descargandoImagenDoc}
                      className="flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl text-white transition-all hover:opacity-90 disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', boxShadow: '0 3px 12px rgba(11,36,71,.3)' }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                      </svg>
                      Imagen PNG
                    </button>
                    <button
                      onClick={() => setModalDescarga('excel')}
                      disabled={descargandoDocentes}
                      className="flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl text-white transition-all hover:opacity-90 disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#0d9488,#06b6d4)', boxShadow: '0 3px 12px rgba(13,148,136,.3)' }}>
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                      </svg>
                      Excel
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setMostrarForm(!mostrarForm); setMostrarImport(false); setMostrarImportAlumnos(false); setFormError(''); setFormOk('') }}
                  className="text-sm font-black px-4 py-2 rounded-xl transition-all active:scale-95"
                  style={mostrarForm
                    ? { background: '#f1f5f9', border: '1.5px solid #e2e8f0', color: '#64748b' }
                    : { background: 'linear-gradient(135deg, #0B2447, #1E3A8A)', color: 'white', boxShadow: '0 4px 16px rgba(11,36,71,.25)' }}>
                  {mostrarForm ? 'Cancelar' : `+ Nuevo ${tab === 'admins' ? 'administrador' : tab === 'alumnos' ? 'alumno' : (filtroTipo === 'administrativo' ? 'administrativo' : filtroTipo === 'admin' ? 'administrador' : 'docente')}`}
                </button>
              </div>
            </div>

            {/* Notificación éxito */}
            {formOk && (
              <div className="mb-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold"
                style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' }}>
                <svg className="shrink-0" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {formOk}
              </div>
            )}

            {/* Panel Importar Excel */}
            {mostrarImport && tab === 'docentes' && (
              <div className="rounded-2xl overflow-hidden mb-5" style={card}>
                {accentBar}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-slate-900 font-bold text-sm">Importar desde Excel</h3>
                      <p className="text-slate-400 text-xs mt-0.5">Descarga la plantilla, complétala y súbela aquí</p>
                    </div>
                    <button onClick={descargarPlantilla}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all shrink-0"
                      style={{ background: '#faf8f7', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Plantilla
                    </button>
                  </div>

                  <label className="flex flex-col items-center justify-center gap-3 w-full py-8 rounded-2xl cursor-pointer transition-all hover:border-indigo-300 hover:bg-indigo-50/30 group"
                    style={{ border: '2px dashed #fecdd3', background: '#F8FAFC' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3' }}>
                      <svg className="text-indigo-800 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-slate-500">
                      {archivoNombre || 'Haz clic para seleccionar archivo'}
                    </span>
                    <span className="text-xs text-slate-300">.xlsx · .xls</span>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                      onChange={e => setArchivoNombre(e.target.files?.[0]?.name ?? '')}/>
                  </label>

                  {importResult && (
                    <div className="rounded-xl px-4 py-3 text-sm"
                      style={importResult.errores.length === 0
                        ? { background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' }
                        : { background: '#fffbeb', border: '1.5px solid #fde68a', color: '#92400e' }}>
                      <p className="font-bold">
                        ✅ {importResult.ok} importado{importResult.ok !== 1 ? 's' : ''}
                        {importResult.errores.length > 0 && ` · ⚠ ${importResult.errores.length} con error`}
                      </p>
                      {importResult.errores.map((err, i) => (
                        <p key={i} className="text-xs mt-0.5 opacity-80">• {err}</p>
                      ))}
                    </div>
                  )}

                  <button onClick={handleImportar} disabled={importLoading || !archivoNombre}
                    className="w-full py-2.5 rounded-xl font-black text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #0B2447, #1E3A8A)', boxShadow: '0 4px 16px rgba(11,36,71,.2)' }}>
                    <span className="flex items-center justify-center gap-2">
                      {importLoading && <Spinner cls="h-4 w-4 text-white"/>}
                      {importLoading ? 'Importando...' : 'Importar docentes'}
                    </span>
                  </button>
                </div>
              </div>
            )}


            {/* Panel Importar Alumnos */}
            {mostrarImportAlumnos && tab === 'alumnos' && (
              <div className="rounded-2xl overflow-hidden mb-5" style={card}>
                {accentBar}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-slate-900 font-bold text-sm">Importar estudiantes desde Excel</h3>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Usuario y contraseña se generan automáticamente — descarga la plantilla para ver el formato
                      </p>
                    </div>
                    <button onClick={descargarPlantillaAlumnos}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all shrink-0"
                      style={{ background: '#faf8f7', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Plantilla
                    </button>
                  </div>

                  {/* Info auto-generación */}
                  <div className="flex items-start gap-2.5 rounded-xl px-4 py-3"
                    style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3' }}>
                    <svg className="text-indigo-800 shrink-0 mt-0.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <div className="text-xs text-indigo-900 space-y-0.5">
                      <p><span className="font-bold">Usuario:</span> primer nombre + primer apellido en minúscula (ej. <span className="font-mono">juan.garcia</span>)</p>
                      <p><span className="font-bold">Contraseña:</span> número de DNI (ej. <span className="font-mono">12345678</span>)</p>
                    </div>
                  </div>

                  <label className="flex flex-col items-center justify-center gap-3 w-full py-8 rounded-2xl cursor-pointer transition-all hover:border-indigo-300 hover:bg-indigo-50/30"
                    style={{ border: '2px dashed #fecdd3', background: '#F8FAFC' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3' }}>
                      <svg className="text-indigo-800 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-slate-500">
                      {importAlumnosNombre || 'Haz clic para seleccionar archivo'}
                    </span>
                    <span className="text-xs text-slate-300">.xlsx · .xls</span>
                    <input ref={fileRefAlumnos} type="file" accept=".xlsx,.xls" className="hidden"
                      onChange={e => { setImportAlumnosNombre(e.target.files?.[0]?.name ?? ''); setImportAlumnosResult(null) }}/>
                  </label>

                  {importAlumnosResult && (
                    <div className="rounded-xl px-4 py-3 space-y-2"
                      style={importAlumnosResult.errores.length === 0
                        ? { background: '#ecfdf5', border: '1.5px solid #a7f3d0' }
                        : { background: '#fffbeb', border: '1.5px solid #fde68a' }}>
                      <p className="font-bold text-sm" style={{ color: importAlumnosResult.errores.length === 0 ? '#059669' : '#92400e' }}>
                        ✅ {importAlumnosResult.ok} importado{importAlumnosResult.ok !== 1 ? 's' : ''}
                        {importAlumnosResult.errores.length > 0 && ` · ⚠ ${importAlumnosResult.errores.length} con error`}
                      </p>
                      {importAlumnosResult.errores.map((err, i) => (
                        <p key={i} className="text-xs opacity-80">• {err}</p>
                      ))}
                      {importAlumnosResult.credenciales.length > 0 && (
                        <button
                          onClick={() => descargarCredencialesAlumnos(importAlumnosResult.credenciales)}
                          className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-lg mt-1 transition-all"
                          style={{ background: '#059669', color: 'white' }}>
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Descargar credenciales (.xlsx)
                        </button>
                      )}
                    </div>
                  )}

                  <button onClick={handleImportarAlumnos} disabled={importAlumnosLoading}
                    className="w-full py-2.5 rounded-xl font-black text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #0B2447, #1E3A8A)', boxShadow: '0 4px 16px rgba(11,36,71,.2)' }}>
                    <span className="flex items-center justify-center gap-2">
                      {importAlumnosLoading && <Spinner cls="h-4 w-4 text-white"/>}
                      {importAlumnosLoading ? 'Importando...' : 'Importar estudiantes'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Formulario Crear */}
            {mostrarForm && (
              <div className="rounded-2xl overflow-hidden mb-5" style={card}>
                {accentBar}
                <div className="p-5">
                  <h3 className="text-slate-900 font-bold text-sm mb-5">
                    Crear {tab === 'admins' ? 'administrador' : tab === 'alumnos' ? 'alumno' : (filtroTipo === 'administrativo' ? 'administrativo' : 'docente')}
                  </h3>
                  <form onSubmit={handleCrear} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Nombres</label>
                        <input type="text" required value={form.nombres}
                          onChange={e => {
                            const v = e.target.value
                            const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
                            const pn = norm(v.split(' ')[0])
                            const pa = norm(form.apellido.split(' ')[0])
                            setForm({...form, nombres: v, usuario: tab === 'alumnos' && pn ? (pa ? `${pn}.${pa}` : pn) : form.usuario})
                          }}
                          placeholder="Nombres"
                          className={inputCls}/>
                      </div>
                      <div>
                        <label className={labelCls}>Apellidos</label>
                        <input type="text" value={form.apellido}
                          onChange={e => {
                            const v = e.target.value
                            const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
                            const pn = norm(form.nombres.split(' ')[0])
                            const pa = norm(v.split(' ')[0])
                            setForm({...form, apellido: v, usuario: tab === 'alumnos' && pn ? (pa ? `${pn}.${pa}` : pn) : form.usuario})
                          }}
                          placeholder="Apellidos" className={inputCls}/>
                      </div>
                      <div>
                        <label className={labelCls}>N° DNI</label>
                        <input type="text" maxLength={8} value={form.dni}
                          onChange={e => setForm({...form, dni: e.target.value.replace(/\D/g,'')})}
                          placeholder="12345678" className={inputCls}/>
                      </div>
                      <div>
                        <label className={labelCls}>Usuario</label>
                        <input type="text" required value={form.usuario}
                          onChange={e => setForm({...form, usuario: e.target.value.replace(/\s/g, '')})}
                          placeholder="usuario_unico" className={inputCls}/>
                      </div>
                      {(tab === 'docentes' || tab === 'admins') && (
                        <>
                          <div>
                            <label className={labelCls}>Correo</label>
                            <input type="email" value={form.correo}
                              onChange={e => setForm({...form, correo: e.target.value})}
                              placeholder="correo@gmail.com" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>N° Celular</label>
                            <input type="tel" value={form.celular}
                              onChange={e => setForm({...form, celular: e.target.value.replace(/\D/g,'')})}
                              placeholder="987654321" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>Fecha de cumpleaños</label>
                            <input type="date" value={form.cumpleanos}
                              onChange={e => setForm({...form, cumpleanos: e.target.value})}
                              className={inputCls}/>
                          </div>
                        </>
                      )}
                      {tab !== 'alumnos' ? (
                        <div className="sm:col-span-2">
                          <label className={labelCls}>Contraseña</label>
                          <input type="password" required minLength={6} value={form.password}
                            onChange={e => setForm({...form, password: e.target.value})}
                            placeholder="Mínimo 6 caracteres" className={inputCls}/>
                        </div>
                      ) : (
                        <div className="sm:col-span-2">
                          <label className={labelCls}>Contraseña</label>
                          <p className="text-[12px] text-slate-500 mt-1">
                            Se usará el <b>DNI</b> del estudiante como contraseña inicial.
                          </p>
                        </div>
                      )}
                      {tab === 'alumnos' && (
                        <>
                          <div>
                            <label className={labelCls}>Grado</label>
                            <select required value={form.grado} onChange={e => setForm({...form, grado: e.target.value})} className={selectCls}>
                              <option value="">— Seleccionar —</option>
                              {GRADOS.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Grupo / Sección</label>
                            <select required value={form.grupo} onChange={e => setForm({...form, grupo: e.target.value})} className={selectCls}>
                              <option value="">— Seleccionar —</option>
                              {GRUPOS.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </div>
                        </>
                      )}
                      {tab === 'alumnos' && form.grado && form.grupo && ciclos.find(c => c.activo) && (
                        <div className="sm:col-span-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs"
                          style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', color: '#15803d' }}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                          </svg>
                          Se matriculará automáticamente en <strong className="ml-1">{form.grado} {form.grupo}</strong>&nbsp;— ciclo activo
                        </div>
                      )}
                    </div>

                    {formError && (
                      <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                        style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#dc2626' }}>
                        <svg className="shrink-0 mt-0.5" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        {formError}
                      </div>
                    )}

                    <button type="submit" disabled={formLoading}
                      className="w-full py-2.5 rounded-xl font-black text-sm text-white transition-all active:scale-[0.98] disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg, #0B2447, #1E3A8A)', boxShadow: '0 4px 16px rgba(11,36,71,.2)' }}>
                      <span className="flex items-center justify-center gap-2">
                        {formLoading && <Spinner cls="h-4 w-4 text-white"/>}
                        {formLoading ? 'Creando...' : `Crear ${tab === 'admins' ? 'administrador' : tab === 'alumnos' ? 'alumno' : (filtroTipo === 'administrativo' ? 'administrativo' : 'docente')}`}
                      </span>
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Lista */}
            <div className="rounded-2xl overflow-hidden" style={card}>
              {accentBar}
              {/* Chips de filtro por tipo (solo en tab docentes) */}
              {tab === 'docentes' && (
                <div className="px-5 pt-3 pb-2 flex items-center gap-2 bg-slate-50/60 flex-wrap"
                  style={{ borderBottom: '1px solid #E4E8EF' }}>
                  {([
                    { key: 'docente',        label: 'Docentes',        count: totalDocentes,           bg: '#F1F5F9', border: '#fecdd3', color: '#0B2447' },
                    { key: 'administrativo', label: 'Administrativos',  count: administrativos.length,  bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' },
                    { key: 'admin',          label: 'Administradores',  count: admins.length,           bg: '#f5f3ff', border: '#ddd6fe', color: '#0B2447' },
                  ] as const).map(({ key, label, count, bg, border, color }) => (
                    <button key={key}
                      onClick={() => setFiltroTipo(key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                      style={filtroTipo === key
                        ? { background: bg, border: `1.5px solid ${border}`, color }
                        : { background: 'white', border: '1.5px solid #e2e8f0', color: '#94a3b8' }}>
                      {label}
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black"
                        style={filtroTipo === key
                          ? { background: border, color }
                          : { background: '#f1f5f9', color: '#94a3b8' }}>
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="px-5 py-3 flex items-center justify-between gap-3 bg-slate-50/60"
                style={{ borderBottom: '1px solid #E4E8EF' }}>
                <span className="text-slate-400 text-xs font-bold uppercase tracking-widest shrink-0">
                  {tab === 'admins' ? `${admins.length} administrador(es)` : tab === 'alumnos' ? `${totalAlumnos} alumno(s)` : filtroTipo === 'administrativo' ? `${administrativos.length} administrativo(s)` : filtroTipo === 'admin' ? `${admins.length} administrador(es)` : `${totalDocentes} docente(s)`}
                </span>
                {tab === 'docentes' && filtroTipo === 'docente' && (
                  <input type="text" placeholder="Buscar nombre, apellido o DNI…"
                    value={searchDocentes}
                    onChange={e => { setSearchDocentes(e.target.value); setPageDocentes(0) }}
                    className={selectCls} style={{ maxWidth: '260px' }} />
                )}
                {tab === 'alumnos' && (
                  <input type="text" placeholder="Buscar por nombre, apellido, DNI o código…"
                    value={searchAlumnos}
                    onChange={e => { setSearchAlumnos(e.target.value); setPageAlumnos(0) }}
                    className={selectCls} style={{ flex: 1, maxWidth: '420px' }} />
                )}
              </div>

              <div>
                {/* ── Tab Alumnos: estado inicial / lista ── */}
                {tab === 'alumnos' && !searchAlumnos.trim() ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #F1F5F9, #E2E8F0)', border: '2px solid #fecdd3' }}>
                      <svg className="w-8 h-8 text-indigo-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/>
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-700 font-black text-base">Busca un estudiante</p>
                      <p className="text-slate-400 text-xs mt-1">{totalAlumnos} estudiante{totalAlumnos !== 1 ? 's' : ''} registrados — busca por nombre, apellido, DNI o código</p>
                    </div>
                  </div>
                ) : (tab === 'admins' ? admins : tab === 'alumnos' ? alumnos : tab === 'docentes' && filtroTipo === 'administrativo' ? administrativos : tab === 'docentes' && filtroTipo === 'admin' ? admins : docentes).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3' }}>
                      <svg className="text-indigo-300 w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <p className="text-slate-300 text-sm font-semibold">{tab === 'alumnos' ? 'No se encontraron estudiantes.' : 'No hay registros.'}</p>
                  </div>

                ) : tab === 'alumnos' ? alumnos.map((a, i) => (
                  <div key={a.id} style={{ borderBottom: i < alumnos.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-indigo-50/30 transition-colors">
                      <Avatar name={displayAlumno(a)} color="indigo" />
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-800 font-semibold text-sm truncate">{displayAlumno(a)}</p>
                        <p className="text-slate-400 text-xs flex items-center gap-2 flex-wrap">
                          {a.usuario && <span className="font-mono text-indigo-900 font-semibold">@{a.usuario}</span>}
                          {a.grado && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: '#F1F5F9', color: '#0B2447' }}>{a.grado} {a.grupo}</span>}
                          {a.dni && <span className="text-[10px] text-slate-300">DNI: {a.dni}</span>}
                          {a.codigo_estudiante && <span className="text-[10px] text-slate-300">Cód: {a.codigo_estudiante}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Matricular en ciclo activo */}
                        {a.grado && a.grupo && ciclos.find(c => c.activo) && (
                          matriculandoOkId === a.id ? (
                            <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold"
                              style={{ background: '#d1fae5', color: '#059669', border: '1.5px solid #a7f3d0' }}>
                              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                              </svg>
                              Matriculado
                            </span>
                          ) : (
                            <button onClick={() => matricularDirecto(a)}
                              disabled={matriculandoId === a.id}
                              title={`Matricular en ${a.grado} ${a.grupo} — ciclo activo`}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                              style={{ background: '#fef3c7', color: '#d97706', border: '1.5px solid #fde68a' }}>
                              {matriculandoId === a.id
                                ? <Spinner cls="h-3 w-3 text-amber-600"/>
                                : <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                                  </svg>
                              }
                              Matricular
                            </button>
                          )
                        )}
                        {/* Editar → abre modal completo */}
                        <button onClick={() => abrirEditar(a, 'alumno')} title="Editar estudiante"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                          style={{ background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #fecdd3' }}>
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                          Editar
                        </button>
                        {/* Resetear contraseña */}
                        <button onClick={() => abrirReset(a.id, a.dni ?? '')} title="Resetear contraseña"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={resetandoId === a.id
                            ? { background: '#fffbeb', color: '#d97706', border: '1.5px solid #fde68a' }
                            : { color: '#cbd5e1' }}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M7 11V7a5 5 0 0110 0v4"/>
                          </svg>
                        </button>
                        {/* Eliminar */}
                        <button onClick={() => handleEliminar(a.id, a.nombre)} title="Eliminar"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:bg-indigo-50"
                          style={{ color: '#fca5a5' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#fca5a5')}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4h4v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    {/* Panel resetear contraseña alumno */}
                    {resetandoId === a.id && (
                      <div className="mx-4 mb-3 rounded-2xl px-4 py-4" style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">
                          Resetear contraseña — <span className="text-amber-600 normal-case font-semibold">{displayAlumno(a)}</span>
                        </p>
                        {resetOk ? (
                          <div className="flex items-center gap-2 justify-center py-2 rounded-xl text-sm font-bold"
                            style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' }}>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            Contraseña actualizada
                          </div>
                        ) : (
                          <>
                            <div className="mb-3">
                              <label className={labelCls}>Nueva contraseña</label>
                              <input type="text" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres" className={inputCls}/>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleResetearPassword(a.id)} disabled={resetLoading || !resetPassword.trim()}
                                className="flex-1 py-2 rounded-xl text-xs font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
                                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                                <span className="flex items-center justify-center gap-1.5">
                                  {resetLoading && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                                  {resetLoading ? 'Reseteando...' : 'Resetear'}
                                </span>
                              </button>
                              <button onClick={() => setResetandoId(null)}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-500 transition-all"
                                style={{ background: 'white', border: '1.5px solid #e2e8f0' }}>
                                Cancelar
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )) : tab === 'docentes' && filtroTipo === 'administrativo' ? administrativos.map((u, i) => (
                  <div key={u.id} style={{ borderBottom: i < administrativos.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-emerald-50/40 transition-colors">
                      <Avatar name={u.nombre} color="emerald" />
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-800 font-semibold text-sm truncate">{u.nombre}</p>
                        <p className="text-slate-400 text-xs flex items-center gap-2">
                          {u.usuario
                            ? <span className="font-mono text-emerald-600 font-semibold">@{u.usuario}</span>
                            : <span className="italic text-slate-300">sin usuario</span>}
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: '#dcfce7', border: '1.5px solid #bbf7d0', color: '#15803d' }}>
                            Administrativo
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => editandoId === u.id ? setEditandoId(null) : abrirEditar(u, 'administrativo')} title="Editar"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={editandoId === u.id
                            ? { background: '#dcfce7', color: '#15803d', border: '1.5px solid #bbf7d0' }
                            : { color: '#cbd5e1', background: 'transparent' }}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                        </button>
                        <button onClick={() => abrirReset(u.id, '')} title="Resetear contraseña"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={resetandoId === u.id
                            ? { background: '#fffbeb', color: '#d97706', border: '1.5px solid #fde68a' }
                            : { color: '#cbd5e1', background: 'transparent' }}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M7 11V7a5 5 0 0110 0v4"/>
                          </svg>
                        </button>
                        <button onClick={() => { setCambiarTipoId(cambiarTipoId === u.id ? null : u.id); setCambiarTipoTarget('admin'); setCambiarTipoOk(false) }}
                          title="Promover a Administrador"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={cambiarTipoId === u.id
                            ? { background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #fecdd3' }
                            : { color: '#cbd5e1', background: 'transparent' }}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
                          </svg>
                        </button>
                        <button onClick={() => handleEliminar(u.id, u.nombre)} title="Eliminar"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:bg-indigo-50"
                          style={{ color: '#fca5a5', background: 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#fca5a5')}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4h4v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    {editandoId === u.id && (
                      <div className="mx-4 mb-3 rounded-2xl px-4 py-4"
                        style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0' }}>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">
                          Editar — <span className="text-emerald-700 normal-case font-semibold">{u.nombre}</span>
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                          <div>
                            <label className={labelCls}>Nombres</label>
                            <input type="text" value={editForm.nombre}
                              onChange={e => setEditForm({ ...editForm, nombre: e.target.value })}
                              placeholder="Nombres" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>Apellidos</label>
                            <input type="text" value={editForm.apellidos}
                              onChange={e => setEditForm({ ...editForm, apellidos: e.target.value })}
                              placeholder="Apellidos" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>N° DNI</label>
                            <input type="text" maxLength={8} value={editForm.dni}
                              onChange={e => setEditForm({ ...editForm, dni: e.target.value.replace(/\D/g,'') })}
                              placeholder="12345678" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>Usuario</label>
                            <input type="text" value={editForm.usuario}
                              onChange={e => setEditForm({ ...editForm, usuario: e.target.value.replace(/\s/g, '') })}
                              placeholder="usuario_unico" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>Correo</label>
                            <input type="email" value={editForm.correo}
                              onChange={e => setEditForm({ ...editForm, correo: e.target.value })}
                              placeholder="correo@gmail.com" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>N° Celular</label>
                            <input type="tel" value={editForm.celular}
                              onChange={e => setEditForm({ ...editForm, celular: e.target.value.replace(/\D/g,'') })}
                              placeholder="987654321" className={inputCls}/>
                          </div>
                          <div className="sm:col-span-2">
                            <label className={labelCls}>Fecha de cumpleaños</label>
                            <input type="date" value={editForm.cumpleanos}
                              onChange={e => setEditForm({ ...editForm, cumpleanos: e.target.value })}
                              className={inputCls}/>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleGuardarAdministrativo(u.id)} disabled={editLoading}
                            className="flex-1 py-2 rounded-xl text-xs font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, #15803d, #166534)' }}>
                            <span className="flex items-center justify-center gap-1.5">
                              {editLoading && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                              {editLoading ? 'Guardando...' : 'Guardar'}
                            </span>
                          </button>
                          <button onClick={() => setEditandoId(null)}
                            className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-500 transition-all"
                            style={{ background: 'white', border: '1.5px solid #e2e8f0' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                    {resetandoId === u.id && (
                      <div className="mx-4 mb-3 rounded-2xl px-4 py-4"
                        style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">
                          Resetear contraseña — <span className="text-amber-600 normal-case font-semibold">{u.nombre}</span>
                        </p>
                        {resetOk ? (
                          <div className="flex items-center gap-2 justify-center py-2 rounded-xl text-sm font-bold"
                            style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' }}>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            Contraseña actualizada
                          </div>
                        ) : (
                          <>
                            <div className="mb-3">
                              <label className={labelCls}>Nueva contraseña</label>
                              <input type="text" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres" className={inputCls}/>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleResetearPassword(u.id)} disabled={resetLoading || !resetPassword.trim()}
                                className="flex-1 py-2 rounded-xl text-xs font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
                                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                                <span className="flex items-center justify-center gap-1.5">
                                  {resetLoading && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                                  {resetLoading ? 'Reseteando...' : 'Resetear'}
                                </span>
                              </button>
                              <button onClick={() => setResetandoId(null)}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-500 transition-all"
                                style={{ background: 'white', border: '1.5px solid #e2e8f0' }}>
                                Cancelar
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {cambiarTipoId === u.id && (
                      <div className="mx-4 mb-3 rounded-2xl px-4 py-4"
                        style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3' }}>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3">
                          Promover a Administrador — <span className="text-indigo-900 normal-case font-semibold">{u.nombre}</span>
                        </p>
                        {cambiarTipoOk ? (
                          <div className="flex items-center gap-2 justify-center py-2 rounded-xl text-sm font-bold"
                            style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' }}>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            Tipo cambiado correctamente
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => handleCambiarTipo(u, 'administrativos')}
                              disabled={cambiarTipoLoading}
                              className="flex-1 py-2 rounded-xl text-xs font-black text-white transition-all active:scale-[0.98] disabled:opacity-50"
                              style={{ background: 'linear-gradient(135deg, #0B2447, #4a0910)' }}>
                              <span className="flex items-center justify-center gap-1.5">
                                {cambiarTipoLoading && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                                {cambiarTipoLoading ? 'Cambiando...' : 'Confirmar — Hacer Administrador'}
                              </span>
                            </button>
                            <button onClick={() => setCambiarTipoId(null)}
                              className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-500 transition-all"
                              style={{ background: 'white', border: '1.5px solid #e2e8f0' }}>
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )) : (tab === 'docentes' && filtroTipo === 'admin') || tab === 'admins' ? admins.map((u, i) => (
                  <div key={u.id} style={{ borderBottom: i < admins.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-violet-50/40 transition-colors">
                      <Avatar name={u.nombre} color="violet" />
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-800 font-semibold text-sm truncate">{u.nombre}</p>
                        <p className="text-slate-400 text-xs truncate">
                          {u.usuario
                            ? <span className="font-mono text-violet-500 font-semibold">@{u.usuario}</span>
                            : <span className="italic text-slate-300">sin usuario</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Detalles */}
                        <button onClick={() => { const a = detalleAdminId !== u.id; setDetalleAdminId(a ? u.id : null); if (a) { setEditandoId(null); setResetandoId(null) } }}
                          title="Ver detalles"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={detalleAdminId === u.id
                            ? { background: '#f5f3ff', color: '#0B2447', border: '1.5px solid #ddd6fe' }
                            : { color: '#cbd5e1', background: 'transparent' }}>
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                          </svg>
                        </button>
                        {/* Editar */}
                        <button onClick={() => abrirEditar(u, 'admin')} title="Editar"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={editandoId === u.id
                            ? { background: '#f5f3ff', color: '#0B2447', border: '1.5px solid #ddd6fe' }
                            : { color: '#cbd5e1', background: 'transparent' }}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                        </button>
                        {/* Resetear contraseña */}
                        <button onClick={() => abrirReset(u.id, '')} title="Resetear contraseña"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={resetandoId === u.id
                            ? { background: '#fffbeb', color: '#d97706', border: '1.5px solid #fde68a' }
                            : { color: '#cbd5e1', background: 'transparent' }}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M7 11V7a5 5 0 0110 0v4"/>
                          </svg>
                        </button>
                        {/* Eliminar */}
                        <button onClick={() => handleEliminar(u.id, u.nombre)} title="Eliminar"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:bg-indigo-50"
                          style={{ color: '#fca5a5' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#fca5a5')}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4h4v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Panel detalles admin */}
                    {detalleAdminId === u.id && (
                      <div className="mx-4 mb-3 rounded-2xl px-4 py-3"
                        style={{ background: '#faf5ff', border: '1.5px solid #ddd6fe' }}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Información del administrador</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {u.apellido && <div><p className="text-[10px] text-slate-400 font-semibold">Apellidos</p><p className="text-xs text-slate-700 font-medium">{u.apellido}</p></div>}
                          {u.dni && <div><p className="text-[10px] text-slate-400 font-semibold">DNI</p><p className="text-xs text-slate-700 font-medium">{u.dni}</p></div>}
                          {u.correo && <div className="col-span-2"><p className="text-[10px] text-slate-400 font-semibold">Correo</p><p className="text-xs text-slate-700 font-medium break-all">{u.correo}</p></div>}
                          {u.celular && <div><p className="text-[10px] text-slate-400 font-semibold">Celular</p><p className="text-xs text-slate-700 font-medium">{u.celular}</p></div>}
                          {u.cumpleanos && <div><p className="text-[10px] text-slate-400 font-semibold">Cumpleaños</p><p className="text-xs text-slate-700 font-medium">{u.cumpleanos}</p></div>}
                          <div className="col-span-2">
                            <p className="text-[10px] text-slate-400 font-semibold">Rol</p>
                            <span className="inline-block text-xs font-bold px-2 py-0.5 rounded-full mt-0.5"
                              style={{ background: '#f5f3ff', border: '1.5px solid #ddd6fe', color: '#0B2447' }}>Administrador</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Panel editar admin */}
                    {editandoId === u.id && (
                      <div className="mx-4 mb-3 rounded-2xl px-4 py-4"
                        style={{ background: '#faf5ff', border: '1.5px solid #ddd6fe' }}>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">
                          Editar — <span className="text-violet-600 normal-case font-semibold">{u.nombre}</span>
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                          <div>
                            <label className={labelCls}>Nombres</label>
                            <input type="text" value={editForm.nombre}
                              onChange={e => setEditForm({ ...editForm, nombre: e.target.value })}
                              placeholder="Nombres" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>Apellidos</label>
                            <input type="text" value={editForm.apellidos}
                              onChange={e => setEditForm({ ...editForm, apellidos: e.target.value })}
                              placeholder="Apellidos" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>N° DNI</label>
                            <input type="text" maxLength={8} value={editForm.dni}
                              onChange={e => setEditForm({ ...editForm, dni: e.target.value.replace(/\D/g,'') })}
                              placeholder="12345678" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>Usuario</label>
                            <input type="text" value={editForm.usuario}
                              onChange={e => setEditForm({ ...editForm, usuario: e.target.value.replace(/\s/g, '') })}
                              placeholder="usuario_unico" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>Correo</label>
                            <input type="email" value={editForm.correo}
                              onChange={e => setEditForm({ ...editForm, correo: e.target.value })}
                              placeholder="correo@gmail.com" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>N° Celular</label>
                            <input type="tel" value={editForm.celular}
                              onChange={e => setEditForm({ ...editForm, celular: e.target.value.replace(/\D/g,'') })}
                              placeholder="987654321" className={inputCls}/>
                          </div>
                          <div className="sm:col-span-2">
                            <label className={labelCls}>Fecha de cumpleaños</label>
                            <input type="date" value={editForm.cumpleanos}
                              onChange={e => setEditForm({ ...editForm, cumpleanos: e.target.value })}
                              className={inputCls}/>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleGuardarAdmin(u.id)} disabled={editLoading}
                            className="flex-1 py-2 rounded-xl text-xs font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, #0B2447, #1E3A8A)' }}>
                            <span className="flex items-center justify-center gap-1.5">
                              {editLoading && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                              {editLoading ? 'Guardando...' : 'Guardar'}
                            </span>
                          </button>
                          <button onClick={() => setEditandoId(null)}
                            className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-500 transition-all"
                            style={{ background: 'white', border: '1.5px solid #e2e8f0' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Panel resetear contraseña admin */}
                    {resetandoId === u.id && (
                      <div className="mx-4 mb-3 rounded-2xl px-4 py-4"
                        style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">
                          Resetear contraseña — <span className="text-amber-600 normal-case font-semibold">{u.nombre}</span>
                        </p>
                        {resetOk ? (
                          <div className="flex items-center gap-2 justify-center py-2 rounded-xl text-sm font-bold"
                            style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' }}>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            Contraseña actualizada
                          </div>
                        ) : (
                          <>
                            <div className="mb-3">
                              <label className={labelCls}>Nueva contraseña</label>
                              <input type="text" value={resetPassword}
                                onChange={e => setResetPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres" className={inputCls}/>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleResetearPassword(u.id)} disabled={resetLoading || !resetPassword.trim()}
                                className="flex-1 py-2 rounded-xl text-xs font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
                                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                                <span className="flex items-center justify-center gap-1.5">
                                  {resetLoading && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                                  {resetLoading ? 'Reseteando...' : 'Resetear'}
                                </span>
                              </button>
                              <button onClick={() => setResetandoId(null)}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-500 transition-all"
                                style={{ background: 'white', border: '1.5px solid #e2e8f0' }}>
                                Cancelar
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                )) : docentes.map((d, i) => (
                  <div key={d.id} style={{ borderBottom: i < docentes.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-indigo-50/30 transition-colors">
                      <Avatar name={displayDocente(d)} color="indigo" />
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-800 font-semibold text-sm truncate">{displayDocente(d)}</p>
                        <p className="text-slate-400 text-xs truncate mt-0.5">
                          {d.usuario
                            ? <span className="font-mono text-indigo-900 font-semibold">@{d.usuario}</span>
                            : <span className="italic text-slate-300">sin usuario</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Detalles */}
                        <button
                          onClick={() => { const a = detalleDocenteId !== d.id; setDetalleDocenteId(a ? d.id : null); if (a) { setEditandoId(null); setResetandoId(null) } }}
                          title="Ver detalles"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={detalleDocenteId === d.id
                            ? { background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #fecdd3' }
                            : { color: '#cbd5e1', background: 'transparent' }}>
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                          </svg>
                        </button>
                        {/* Editar */}
                        <button onClick={() => editandoId === d.id ? setEditandoId(null) : abrirEditar(d, 'docente')}
                          title="Editar"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={editandoId === d.id
                            ? { background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #fecdd3' }
                            : { color: '#cbd5e1', background: 'transparent' }}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                        </button>
                        {/* Resetear contraseña */}
                        <button onClick={() => abrirReset(d.id, d.dni ?? '')} title="Resetear contraseña"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={resetandoId === d.id
                            ? { background: '#fffbeb', color: '#d97706', border: '1.5px solid #fde68a' }
                            : { color: '#cbd5e1', background: 'transparent' }}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M7 11V7a5 5 0 0110 0v4"/>
                          </svg>
                        </button>
                        {/* Cambiar tipo */}
                        <button onClick={() => abrirCambiarTipo(d.id)} title="Cambiar tipo de usuario"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={cambiarTipoId === d.id
                            ? { background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #bbf7d0' }
                            : { color: '#cbd5e1', background: 'transparent' }}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>
                          </svg>
                        </button>
                        {/* Eliminar */}
                        <button onClick={() => handleEliminar(d.id, d.nombre)}
                          title="Eliminar"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:bg-indigo-50"
                          style={{ color: '#fca5a5', background: 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#fca5a5')}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4h4v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Panel detalles */}
                    {detalleDocenteId === d.id && (
                      <div className="mx-4 mb-3 rounded-2xl px-4 py-3"
                        style={{ background: '#faf8f7', border: '1.5px solid #E4E8EF' }}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Información del docente</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          <div>
                            <p className="text-[10px] text-slate-400 font-semibold">DNI</p>
                            <p className="text-xs text-slate-700 font-medium">{d.dni || <span className="text-slate-300 italic">—</span>}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-semibold">Celular</p>
                            <p className="text-xs text-slate-700 font-medium">{d.celular || <span className="text-slate-300 italic">—</span>}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-semibold">Correo</p>
                            <p className="text-xs text-slate-700 font-medium break-all">{d.correo || <span className="text-slate-300 italic">—</span>}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-semibold">Cumpleaños</p>
                            <p className="text-xs text-slate-700 font-medium">
                              {d.cumpleanos || <span className="text-slate-300 italic">—</span>}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-semibold">Grado</p>
                            <p className="text-xs text-slate-700 font-medium">{d.grado || <span className="text-slate-300 italic">Sin asignar</span>}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-semibold">Grupo</p>
                            <p className="text-xs text-slate-700 font-medium">{d.grupo || <span className="text-slate-300 italic">Sin asignar</span>}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Panel cambiar tipo de usuario */}
                    {cambiarTipoId === d.id && (
                      <div className="mx-4 mb-3 rounded-2xl px-4 py-4"
                        style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0' }}>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3">
                          Cambiar tipo — <span className="text-emerald-700 normal-case font-semibold">{displayDocente(d)}</span>
                        </p>
                        {cambiarTipoOk ? (
                          <div className="flex items-center gap-2 justify-center py-2 rounded-xl text-sm font-bold"
                            style={{ background: '#dcfce7', border: '1.5px solid #86efac', color: '#15803d' }}>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            Tipo actualizado correctamente
                          </div>
                        ) : (
                          <>
                            <p className="text-[11px] text-slate-400 mb-3">Selecciona el nuevo tipo para este usuario. Se moverá de la tabla de docentes a la tabla correspondiente.</p>
                            {(() => { const tieneCursos = (cambiarTipoCursos ?? 0) > 0; return (
                            <>
                            <div className="flex gap-2 mb-2">
                              <button
                                onClick={() => { if (!tieneCursos) setCambiarTipoTarget('administrativo') }}
                                disabled={cambiarTipoCursos === null || tieneCursos}
                                title={tieneCursos ? 'Tiene cursos asignados' : ''}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                style={cambiarTipoTarget === 'administrativo'
                                  ? { background: '#dcfce7', borderColor: '#4ade80', color: '#15803d' }
                                  : { background: 'white', borderColor: '#e2e8f0', color: '#64748b' }}>
                                Administrativo
                              </button>
                              <button
                                onClick={() => setCambiarTipoTarget('admin')}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border-2"
                                style={cambiarTipoTarget === 'admin'
                                  ? { background: '#F1F5F9', borderColor: '#fca5a5', color: '#0B2447' }
                                  : { background: 'white', borderColor: '#e2e8f0', color: '#64748b' }}>
                                Administrador
                              </button>
                            </div>
                            {cambiarTipoCursos === null ? (
                              <p className="text-[10px] text-slate-400 mb-3">Verificando cursos del docente…</p>
                            ) : tieneCursos ? (
                              <p className="text-[11px] text-amber-600 font-semibold mb-3">Tiene {cambiarTipoCursos} curso(s) asignado(s): no se puede subir a <b>Administrativo</b> hasta quitárselos.</p>
                            ) : (
                              <p className="text-[11px] text-emerald-600 font-semibold mb-3">Sin cursos asignados: se puede subir a Administrativo.</p>
                            )}
                            </>
                            ); })()}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleCambiarTipo(d)}
                                disabled={!cambiarTipoTarget || cambiarTipoLoading}
                                className="flex-1 py-2 rounded-xl text-xs font-black text-white transition-all active:scale-[0.98] disabled:opacity-50"
                                style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                                <span className="flex items-center justify-center gap-1.5">
                                  {cambiarTipoLoading && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                                  {cambiarTipoLoading ? 'Cambiando...' : 'Confirmar cambio'}
                                </span>
                              </button>
                              <button onClick={() => setCambiarTipoId(null)}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-500 transition-all"
                                style={{ background: 'white', border: '1.5px solid #e2e8f0' }}>
                                Cancelar
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Panel resetear contraseña docente */}
                    {resetandoId === d.id && (
                      <div className="mx-4 mb-3 rounded-2xl px-4 py-4"
                        style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
                          Resetear contraseña — <span className="text-amber-600 normal-case font-semibold">{displayDocente(d)}</span>
                        </p>
                        {d.dni && (
                          <p className="text-[10px] text-amber-500 mb-3">Contraseña por defecto: DNI <span className="font-black">{d.dni}</span></p>
                        )}
                        {resetOk ? (
                          <div className="flex items-center gap-2 justify-center py-2 rounded-xl text-sm font-bold"
                            style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#059669' }}>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            Contraseña actualizada
                          </div>
                        ) : (
                          <>
                            <div className="mb-3">
                              <label className={labelCls}>Nueva contraseña</label>
                              <input type="text" value={resetPassword}
                                onChange={e => setResetPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres" className={inputCls}/>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleResetearPassword(d.id)} disabled={resetLoading || !resetPassword.trim()}
                                className="flex-1 py-2 rounded-xl text-xs font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
                                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                                <span className="flex items-center justify-center gap-1.5">
                                  {resetLoading && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                                  {resetLoading ? 'Reseteando...' : 'Resetear'}
                                </span>
                              </button>
                              <button onClick={() => setResetandoId(null)}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-500 transition-all"
                                style={{ background: 'white', border: '1.5px solid #e2e8f0' }}>
                                Cancelar
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {editandoId === d.id && (
                      <div className="mx-4 mb-3 rounded-2xl px-4 py-4"
                        style={{ background: '#F8FAFC', border: '1.5px solid #fecdd3' }}>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">
                          Editar — <span className="text-indigo-900 normal-case font-semibold">{displayDocente(d)}</span>
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                          <div>
                            <label className={labelCls}>Nombres</label>
                            <input type="text" value={editForm.nombre}
                              onChange={e => setEditForm({ ...editForm, nombre: e.target.value })}
                              placeholder="Nombres" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>Apellidos</label>
                            <input type="text" value={editForm.apellidos}
                              onChange={e => setEditForm({ ...editForm, apellidos: e.target.value })}
                              placeholder="Apellidos" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>N° DNI</label>
                            <input type="text" maxLength={8} value={editForm.dni}
                              onChange={e => setEditForm({ ...editForm, dni: e.target.value.replace(/\D/g, '') })}
                              placeholder="12345678" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>Usuario</label>
                            <input type="text" value={editForm.usuario}
                              onChange={e => setEditForm({ ...editForm, usuario: e.target.value.replace(/\s/g, '') })}
                              placeholder="usuario_unico" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>Correo</label>
                            <input type="email" value={editForm.correo}
                              onChange={e => setEditForm({ ...editForm, correo: e.target.value })}
                              placeholder="correo@gmail.com" className={inputCls}/>
                          </div>
                          <div>
                            <label className={labelCls}>N° Celular</label>
                            <input type="tel" value={editForm.celular}
                              onChange={e => setEditForm({ ...editForm, celular: e.target.value.replace(/\D/g,'') })}
                              placeholder="987654321" className={inputCls}/>
                          </div>
                          <div className="sm:col-span-2">
                            <label className={labelCls}>Fecha de cumpleaños</label>
                            <input type="date" value={editForm.cumpleanos}
                              onChange={e => setEditForm({ ...editForm, cumpleanos: e.target.value })}
                              className={inputCls} placeholder="dd/mm/aaaa"/>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleGuardarDocente(d.id)} disabled={editLoading}
                            className="flex-1 py-2 rounded-xl text-xs font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, #0B2447, #1E3A8A)' }}>
                            <span className="flex items-center justify-center gap-1.5">
                              {editLoading && <Spinner cls="h-3.5 w-3.5 text-white"/>}
                              {editLoading ? 'Guardando...' : 'Guardar'}
                            </span>
                          </button>
                          <button onClick={() => setEditandoId(null)}
                            className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-500 transition-all"
                            style={{ background: 'white', border: '1.5px solid #e2e8f0' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Paginación alumnos */}
              {tab === 'alumnos' && totalAlumnos > PAGE_DOCENTES && (
                <div className="px-5 py-3 flex items-center justify-between bg-slate-50/60"
                  style={{ borderTop: '1px solid #E4E8EF' }}>
                  <button disabled={pageAlumnos === 0} onClick={() => setPageAlumnos(p => p - 1)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all"
                    style={{ background: '#F1F5F9', color: '#0B2447' }}>← Anterior</button>
                  <span className="text-xs text-slate-400 font-semibold">
                    {pageAlumnos * PAGE_DOCENTES + 1}–{Math.min((pageAlumnos + 1) * PAGE_DOCENTES, totalAlumnos)} de {totalAlumnos}
                  </span>
                  <button disabled={(pageAlumnos + 1) * PAGE_DOCENTES >= totalAlumnos} onClick={() => setPageAlumnos(p => p + 1)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all"
                    style={{ background: '#F1F5F9', color: '#0B2447' }}>Siguiente →</button>
                </div>
              )}
              {/* Paginación docentes */}
              {tab === 'docentes' && totalDocentes > PAGE_DOCENTES && (
                <div className="px-5 py-3 flex items-center justify-between bg-slate-50/60"
                  style={{ borderTop: '1px solid #E4E8EF' }}>
                  <button
                    disabled={pageDocentes === 0}
                    onClick={() => setPageDocentes(p => p - 1)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all"
                    style={{ background: '#F1F5F9', color: '#0B2447' }}>
                    ← Anterior
                  </button>
                  <span className="text-xs text-slate-400 font-semibold">
                    {pageDocentes * PAGE_DOCENTES + 1}–{Math.min((pageDocentes + 1) * PAGE_DOCENTES, totalDocentes)} de {totalDocentes}
                  </span>
                  <button
                    disabled={(pageDocentes + 1) * PAGE_DOCENTES >= totalDocentes}
                    onClick={() => setPageDocentes(p => p + 1)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all"
                    style={{ background: '#F1F5F9', color: '#0B2447' }}>
                    Siguiente →
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ SALONES Y ALUMNOS (embebido) ════════════════════════════════════ */}
        {tab === 'salones' && (
          <div className="-mx-4 lg:-mx-6">
            <SalonesContent embedded />
          </div>
        )}

        {/* ══ ESTADÍSTICAS DE ASISTENCIA (embebido) ═══════════════════════════ */}
        {tab === 'estadisticas-asistencia' && (
          <EstadisticasAsistenciaContent embedded />
        )}

        {/* ══ BOLETINES (embebido) ════════════════════════════════════════════ */}
        {tab === 'boletines' && (
          <div className="-mx-4 lg:-mx-6">
            <BoletinesContent embedded />
          </div>
        )}

        {/* ══ LIBRETA DE NOTAS (embebido, solo administradores) ══════════════ */}
        {tab === 'notas-padres' && esAdminUser && (
          <div className="-mx-4 lg:-mx-6">
            <NotasContent embedded />
          </div>
        )}

        {/* ══ PLANIFICACIÓN DE CURSOS (embebido) ══════════════════════════════ */}
        {tab === 'planificacion' && (
          <div className="-mx-4 lg:-mx-6 px-4 lg:px-6">
            <PlanificacionContent embedded />
          </div>
        )}

          </div>{/* max-w-4xl */}
        </main>
      </div>{/* flex body */}

      <footer className="relative z-10 text-center py-4 text-[11px] text-slate-300">
        Sistema de Asistencia Docente &copy; {new Date().getFullYear()}
      </footer>

      {/* ── Modal descargar PDF horario ──────────────────────────────────────── */}
      {pdfMenuH && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(7px)' }}
          onClick={() => !generandoPdfH && setPdfMenuH(false)}>
          <div className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 28px 70px rgba(15,23,42,.22)', border: '1.5px solid #fecdd3' }}
            onClick={e => e.stopPropagation()}>

            {/* Header vino */}
            <div className="px-6 pt-5 pb-4" style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.2)' }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                  </svg>
                </div>
                <div>
                  <p className="font-black text-white text-base leading-tight">Descargar Horario en PDF</p>
                  <p className="text-[11px] font-medium mt-0.5" style={{ color: 'rgba(255,255,255,.6)' }}>Elige cómo organizar la descarga</p>
                </div>
                <button onClick={() => setPdfMenuH(false)} disabled={generandoPdfH}
                  className="ml-auto p-1.5 rounded-lg transition-all"
                  style={{ color: 'rgba(255,255,255,.6)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              {/* Gold bar */}
              <div className="mt-4 h-px" style={{ background: 'linear-gradient(90deg,#C9A84C,transparent)' }}/>
            </div>

            {/* Opciones */}
            <div className="p-5 space-y-3">

              {/* Bloque Docentes */}
              <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #E4E8EF' }}>
                <div className="px-4 py-3 flex items-center gap-2.5" style={{ background: '#faf8f7' }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                  </div>
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Por Docentes</span>
                </div>
                <div className="divide-y" style={{ borderTop: '1px solid #E4E8EF' }}>
                  {[
                    { key: 'docente-actual' as const, label: 'Docente seleccionado actualmente', desc: vistaHorario === 'docente' && docenteFiltroH ? docentesLean.find(d => d.id === docenteFiltroH)?.nombre ?? '' : 'Primero selecciona un docente', enabled: vistaHorario === 'docente' && !!docenteFiltroH },
                    { key: 'todos-docentes' as const, label: 'Todos los docentes', desc: 'Una página por cada docente registrado', enabled: true },
                  ].map(opt => {
                    const sel = pdfOpcionH === opt.key
                    return (
                      <button key={opt.key}
                        onClick={() => opt.enabled && setPdfOpcionH(opt.key)}
                        disabled={!opt.enabled}
                        className="w-full flex items-center gap-3 px-4 py-3.5 transition-all text-left"
                        style={{ background: sel ? '#F1F5F9' : 'white', cursor: opt.enabled ? 'pointer' : 'not-allowed' }}>
                        {/* Radio */}
                        <div className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                          style={{ border: `2px solid ${sel ? '#0B2447' : opt.enabled ? '#cbd5e1' : '#e2e8f0'}`, background: sel ? '#0B2447' : 'white' }}>
                          {sel && <div className="w-1.5 h-1.5 rounded-full bg-white"/>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold leading-tight" style={{ color: opt.enabled ? '#1e293b' : '#cbd5e1' }}>{opt.label}</p>
                          <p className="text-[10px] mt-0.5 truncate" style={{ color: opt.enabled ? '#94a3b8' : '#e2e8f0' }}>{opt.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Bloque Secciones */}
              <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #E4E8EF' }}>
                <div className="px-4 py-3 flex items-center gap-2.5" style={{ background: '#faf8f7' }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 8h2"/>
                    </svg>
                  </div>
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Por Secciones</span>
                </div>
                <div className="divide-y" style={{ borderTop: '1px solid #E4E8EF' }}>
                  {[
                    { key: 'salon-actual' as const, label: 'Sección seleccionada actualmente', desc: vistaHorario === 'grado' ? `${gradoFiltroH} — Sección ${grupoFiltroH}` : 'Cambia a vista Por Grado/Grupo', enabled: vistaHorario === 'grado' },
                    { key: 'todas-salones' as const, label: 'Todas las secciones', desc: 'Una página por cada grado y grupo con horario', enabled: true },
                  ].map(opt => {
                    const sel = pdfOpcionH === opt.key
                    return (
                      <button key={opt.key}
                        onClick={() => opt.enabled && setPdfOpcionH(opt.key)}
                        disabled={!opt.enabled}
                        className="w-full flex items-center gap-3 px-4 py-3.5 transition-all text-left"
                        style={{ background: sel ? '#F1F5F9' : 'white', cursor: opt.enabled ? 'pointer' : 'not-allowed' }}>
                        <div className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                          style={{ border: `2px solid ${sel ? '#0B2447' : opt.enabled ? '#cbd5e1' : '#e2e8f0'}`, background: sel ? '#0B2447' : 'white' }}>
                          {sel && <div className="w-1.5 h-1.5 rounded-full bg-white"/>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold leading-tight" style={{ color: opt.enabled ? '#1e293b' : '#cbd5e1' }}>{opt.label}</p>
                          <p className="text-[10px] mt-0.5 truncate" style={{ color: opt.enabled ? '#94a3b8' : '#e2e8f0' }}>{opt.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Footer botones */}
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setPdfMenuH(false)} disabled={generandoPdfH}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{ background: '#faf8f7', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                Cancelar
              </button>
              <button
                disabled={!pdfOpcionH || generandoPdfH}
                onClick={async () => { if (pdfOpcionH) { await generarPdfHorario(pdfOpcionH); setPdfMenuH(false) } }}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', boxShadow: pdfOpcionH ? '0 4px 16px rgba(11,36,71,.35)' : 'none' }}>
                <span className="flex items-center justify-center gap-2">
                  {generandoPdfH
                    ? <><Spinner cls="h-4 w-4 text-white"/> Generando…</>
                    : <><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                      </svg> Descargar PDF</>}
                </span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Modal de confirmación genérico (useConfirm) ──────────────────────── */}
      {dialogoConfirm}

      {/* ── Modal confirmar eliminar ─────────────────────────────────────────── */}
      {confirmarEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(6px)' }}
          onClick={() => !eliminandoLoading && setConfirmarEliminar(null)}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 24px 64px rgba(15,23,42,.18)', border: '1.5px solid #fee2e2' }}
            onClick={e => e.stopPropagation()}>
            {/* Barra roja superior */}
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #f43f5e, #ef4444)' }} />
            <div className="p-6">
              {/* Ícono */}
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: '#fef2f2', border: '2px solid #fecaca' }}>
                  <svg className="w-7 h-7 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <polyline points="3 6 5 6 21 6"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4h4v2"/>
                  </svg>
                </div>
              </div>
              {/* Texto */}
              <h3 className="text-slate-900 font-black text-lg text-center leading-tight">¿Eliminar usuario?</h3>
              <p className="text-slate-500 text-sm text-center mt-2 leading-relaxed">
                Estás a punto de eliminar a<br/>
                <span className="font-bold text-slate-800">{confirmarEliminar.nombre}</span>
              </p>
              <p className="text-xs text-indigo-400 text-center mt-2 font-medium">Esta acción no se puede deshacer.</p>
              {/* Botones */}
              <div className="flex gap-3 mt-6">
                <button onClick={() => setConfirmarEliminar(null)} disabled={eliminandoLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: '#faf8f7', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                  Cancelar
                </button>
                <button onClick={handleConfirmarEliminar} disabled={eliminandoLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #f43f5e, #ef4444)', boxShadow: '0 4px 16px rgba(239,68,68,.3)' }}>
                  <span className="flex items-center justify-center gap-2">
                    {eliminandoLoading && <Spinner cls="h-4 w-4 text-white"/>}
                    {eliminandoLoading ? 'Eliminando...' : 'Sí, eliminar'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal editar alumno completo ─────────────────────────────────────── */}
      {modalEditAlumno && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(8px)' }}
          onClick={() => !editLoading && setModalEditAlumno(null)}>
          <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
            style={{ background: 'white', boxShadow: '0 32px 80px rgba(15,23,42,.22)', border: '1.5px solid #fecdd3', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}>
            {/* Barra superior */}
            <div className="h-1.5 shrink-0" style={{ background: 'linear-gradient(90deg, #0B2447, #1E3A8A)' }} />
            {/* Header */}
            <div className="px-6 pt-5 pb-4 flex items-center gap-4 shrink-0"
              style={{ borderBottom: '1px solid #f1f5f9' }}>
              <Avatar name={displayAlumno(modalEditAlumno)} color="indigo" />
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-800 text-lg truncate">{displayAlumno(modalEditAlumno)}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {modalEditAlumno.grado && <span className="font-semibold text-indigo-900">{modalEditAlumno.grado} &quot;{modalEditAlumno.grupo}&quot;</span>}
                  {modalEditAlumno.dni && <span> · DNI: {modalEditAlumno.dni}</span>}
                </p>
              </div>
              <button onClick={() => setModalEditAlumno(null)} disabled={editLoading}
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all hover:bg-slate-100"
                style={{ color: '#94a3b8' }}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Formulario scrollable */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

              {/* Sección: Datos del alumno */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-900 mb-3 flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-indigo-100 flex items-center justify-center">
                    <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="#0B2447" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                  </span>
                  Datos del estudiante
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Nombre(s)</label>
                    <input type="text" value={editForm.nombre} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })} className={inputCls}/>
                  </div>
                  <div>
                    <label className={labelCls}>Apellidos</label>
                    <input type="text" value={editForm.apellidos} onChange={e => setEditForm({ ...editForm, apellidos: e.target.value })} className={inputCls}/>
                  </div>
                  <div>
                    <label className={labelCls}>DNI</label>
                    <input type="text" value={editForm.dni} onChange={e => setEditForm({ ...editForm, dni: e.target.value.replace(/\D/g,'') })} maxLength={8} className={inputCls} placeholder="8 dígitos"/>
                  </div>
                  <div>
                    <label className={labelCls}>Fecha de nacimiento</label>
                    <input type="date" value={editForm.fecha_nacimiento} onChange={e => setEditForm({ ...editForm, fecha_nacimiento: e.target.value })} className={inputCls}/>
                  </div>
                  <div>
                    <label className={labelCls}>Sexo</label>
                    <select value={editForm.sexo} onChange={e => setEditForm({ ...editForm, sexo: e.target.value })} className={selectCls}>
                      <option value="">— Seleccionar —</option>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Código de estudiante</label>
                    <input type="text" value={editForm.codigo_estudiante} onChange={e => setEditForm({ ...editForm, codigo_estudiante: e.target.value })} className={inputCls}/>
                  </div>
                  <div>
                    <label className={labelCls}>Celular estudiante</label>
                    <input type="text" value={editForm.celular} onChange={e => setEditForm({ ...editForm, celular: e.target.value })} className={inputCls} placeholder="9XXXXXXXX"/>
                  </div>
                </div>
              </div>

              {/* Sección: Acceso al sistema */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-900 mb-3 flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-indigo-100 flex items-center justify-center">
                    <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="#0B2447" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </span>
                  Acceso y matrícula
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Usuario</label>
                    <input type="text" value={editForm.usuario} onChange={e => setEditForm({ ...editForm, usuario: e.target.value.toLowerCase().replace(/\s/g,'') })} className={inputCls}/>
                  </div>
                  <div>
                    <label className={labelCls}>Grado</label>
                    <select value={editForm.grado} onChange={e => setEditForm({ ...editForm, grado: e.target.value })} className={selectCls}>
                      <option value="">— Grado —</option>
                      {GRADOS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Grupo</label>
                    <select value={editForm.grupo} onChange={e => setEditForm({ ...editForm, grupo: e.target.value })} className={selectCls}>
                      <option value="">— Grupo —</option>
                      {GRUPOS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Sección: Datos del apoderado */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-500 mb-3 flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-violet-100 flex items-center justify-center">
                    <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="#0B2447" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  </span>
                  Datos del contacto de emergencia
                </p>
                <div className="grid grid-cols-2 gap-3">

                  {/* Selector de parentesco */}
                  <div className="col-span-2">
                    <label className={labelCls}>Parentesco</label>
                    <div className="flex gap-2">
                      {(['Padre', 'Madre'] as const).map(op => {
                        const activo = editForm.parentesco_apoderado === op
                        return (
                          <button key={op} type="button"
                            onClick={() => setEditForm({ ...editForm, parentesco_apoderado: op })}
                            className="flex-1 py-2 rounded-xl text-sm font-black transition-all"
                            style={activo
                              ? { background: 'linear-gradient(135deg,#1E3A8A,#0B2447)', color: 'white', boxShadow: '0 4px 12px rgba(139,92,246,.35)' }
                              : { background: 'white', color: '#64748b', border: '1.5px solid #e2e8f0' }}>
                            {op}
                          </button>
                        )
                      })}
                      <button type="button"
                        onClick={() => setEditForm({ ...editForm, parentesco_apoderado: editForm.parentesco_apoderado === 'Padre' || editForm.parentesco_apoderado === 'Madre' ? '' : editForm.parentesco_apoderado })}
                        className="flex-1 py-2 rounded-xl text-sm font-black transition-all"
                        style={editForm.parentesco_apoderado !== 'Padre' && editForm.parentesco_apoderado !== 'Madre' && editForm.parentesco_apoderado !== ''
                          ? { background: 'linear-gradient(135deg,#1E3A8A,#0B2447)', color: 'white', boxShadow: '0 4px 12px rgba(139,92,246,.35)' }
                          : { background: 'white', color: '#64748b', border: '1.5px solid #e2e8f0' }}>
                        Otros
                      </button>
                    </div>
                    {/* Input para parentesco personalizado */}
                    {editForm.parentesco_apoderado !== 'Padre' && editForm.parentesco_apoderado !== 'Madre' && (
                      <input
                        type="text"
                        value={editForm.parentesco_apoderado}
                        onChange={e => setEditForm({ ...editForm, parentesco_apoderado: e.target.value })}
                        placeholder="Especifica el parentesco (ej: Tío, Abuelo…)"
                        className={inputCls}
                        style={{ marginTop: '8px' }}
                        autoFocus
                      />
                    )}
                  </div>

                  <div className="col-span-2">
                    <label className={labelCls}>Nombre completo del contacto de emergencia</label>
                    <input type="text" value={editForm.nombre_apoderado} onChange={e => setEditForm({ ...editForm, nombre_apoderado: e.target.value })} className={inputCls} placeholder="Nombres y apellidos"/>
                  </div>
                  <div>
                    <label className={labelCls}>DNI del contacto de emergencia</label>
                    <input type="text" value={editForm.dni_apoderado} onChange={e => setEditForm({ ...editForm, dni_apoderado: e.target.value.replace(/\D/g,'') })} maxLength={8} className={inputCls} placeholder="8 dígitos"/>
                  </div>
                  <div>
                    <label className={labelCls}>Celular del contacto de emergencia</label>
                    <input type="text" value={editForm.celular_apoderado} onChange={e => setEditForm({ ...editForm, celular_apoderado: e.target.value })} className={inputCls} placeholder="9XXXXXXXX"/>
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Correo del contacto de emergencia</label>
                    <input type="email" value={editForm.correo_apoderado} onChange={e => setEditForm({ ...editForm, correo_apoderado: e.target.value })} className={inputCls} placeholder="ejemplo@correo.com"/>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 shrink-0 flex gap-3"
              style={{ borderTop: '1px solid #f1f5f9', background: '#fafbff' }}>
              <button onClick={() => setModalEditAlumno(null)} disabled={editLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: 'white', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                Cancelar
              </button>
              <button onClick={() => handleGuardarAlumno(modalEditAlumno.id)} disabled={editLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #0B2447, #1E3A8A)', boxShadow: '0 4px 16px rgba(11,36,71,.25)' }}>
                <span className="flex items-center justify-center gap-2">
                  {editLoading && <Spinner cls="h-4 w-4 text-white"/>}
                  {editLoading ? 'Guardando...' : 'Guardar cambios'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal acción sobre registro ─────────────────────────────────────── */}
      {accionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={() => { if (!accionLoading) { setAccionModal(null); setJustificacion(''); setNuevaHora('') } }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{
              background: 'white',
              boxShadow: '0 24px 64px rgba(15,23,42,.18)',
              border: accionModal.tipo === 'borrar' ? '1.5px solid #fee2e2' : '1.5px solid #fecdd3',
            }}
            onClick={e => e.stopPropagation()}>
            {/* Barra superior */}
            <div className="h-1.5"
              style={{ background: accionModal.tipo === 'borrar'
                ? 'linear-gradient(90deg, #f43f5e, #ef4444)'
                : 'linear-gradient(90deg, #0B2447, #1E3A8A)' }} />
            <div className="p-6 space-y-4">
              {/* Ícono */}
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={accionModal.tipo === 'borrar'
                    ? { background: '#fef2f2', border: '2px solid #fecaca' }
                    : { background: '#F1F5F9', border: '2px solid #fecdd3' }}>
                  {accionModal.tipo === 'borrar' ? (
                    <svg className="w-7 h-7 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  ) : (
                    <svg className="w-7 h-7 text-indigo-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110.414 16H8v-2.414a2 2 0 01.586-1.414z"/>
                    </svg>
                  )}
                </div>
              </div>
              {/* Título */}
              <div className="text-center">
                <h3 className="text-slate-900 font-black text-lg leading-tight">
                  {accionModal.tipo === 'borrar' ? 'Borrar registro' : 'Corregir hora'}
                </h3>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                  {accionModal.tipo === 'borrar'
                    ? <>Registro de <span className="font-bold text-slate-700">{formatHora(accionModal.registro.fecha_hora)}</span> · {accionModal.registro.docentes?.nombre}</>
                    : <>Registro actual: <span className="font-bold text-slate-700">{formatHora(accionModal.registro.fecha_hora)}</span> · {accionModal.registro.docentes?.nombre}</>
                  }
                </p>
              </div>

              {/* Nueva hora (solo si es editar) */}
              {accionModal.tipo === 'editar' && (
                <div>
                  <label className={labelCls}>Nueva hora</label>
                  <input
                    type="time"
                    value={nuevaHora}
                    onChange={e => setNuevaHora(e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>
              )}

              {/* Justificación */}
              <div>
                <label className={labelCls}>Justificación <span className="text-indigo-400">*</span></label>
                <textarea
                  rows={3}
                  value={justificacion}
                  onChange={e => setJustificacion(e.target.value)}
                  placeholder="Escribe el motivo de esta acción..."
                  className={`${inputCls} resize-none`}
                  autoFocus
                />
                {!justificacion.trim() && (
                  <p className="text-[10px] text-indigo-400 mt-1 font-medium">La justificación es obligatoria.</p>
                )}
              </div>

              {/* Error de operación */}
              {accionError && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                  style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#dc2626' }}>
                  <svg className="shrink-0 mt-0.5 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  </svg>
                  <span>{accionError}</span>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setAccionModal(null); setJustificacion(''); setNuevaHora('') }}
                  disabled={accionLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: '#faf8f7', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                  Cancelar
                </button>
                <button
                  onClick={accionModal.tipo === 'borrar' ? handleBorrarRegistro : handleEditarRegistro}
                  disabled={accionLoading || !justificacion.trim() || (accionModal.tipo === 'editar' && !nuevaHora)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-50"
                  style={accionModal.tipo === 'borrar'
                    ? { background: 'linear-gradient(135deg, #f43f5e, #ef4444)', boxShadow: '0 4px 16px rgba(239,68,68,.3)' }
                    : { background: 'linear-gradient(135deg, #0B2447, #1E3A8A)', boxShadow: '0 4px 16px rgba(11,36,71,.25)' }}>
                  <span className="flex items-center justify-center gap-2">
                    {accionLoading && <Spinner cls="h-4 w-4 text-white"/>}
                    {accionLoading ? 'Guardando...' : accionModal.tipo === 'borrar' ? 'Sí, borrar' : 'Guardar cambio'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal justificar asistencia ─────────────────────────────────────── */}
      {justifModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={() => { if (!justificando) { setJustifModal(null); setJustifRespuesta('') } }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 24px 64px rgba(15,23,42,.18)', border: '1.5px solid #bae6fd' }}
            onClick={e => e.stopPropagation()}>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #0B2447, #0EA5E9)' }} />
            <div className="p-6 space-y-4">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: '#f0f9ff', border: '2px solid #bae6fd' }}>
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#0284c7" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-slate-900 font-black text-lg leading-tight">Justificar asistencia</h3>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                  <span className="font-bold text-slate-700">{justifModal.docentes?.nombre ?? 'Docente'}</span>
                  {' '}· ausencia/tardanza del <span className="font-bold text-slate-700">{justifModal.fecha}</span>
                </p>
              </div>
              {/* Motivo enviado por el docente */}
              <div className="px-3 py-2 rounded-xl" style={{ background: '#faf8f7', border: '1px solid #e2e8f0' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Motivo del docente</p>
                <p className="text-slate-600 text-xs leading-relaxed mt-0.5">{justifModal.motivo}</p>
              </div>
              <div>
                <label className={labelCls}>Respuesta / observación <span className="text-slate-300 normal-case font-medium">(opcional)</span></label>
                <textarea
                  rows={3}
                  value={justifRespuesta}
                  onChange={e => setJustifRespuesta(e.target.value)}
                  placeholder="Ej. Presentó certificado médico..."
                  className={`${inputCls} resize-none`}
                  autoFocus
                />
              </div>
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', color: '#075985' }}>
                <svg className="shrink-0 mt-0.5 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>Las marcas de ese día quedarán como <b>justificadas</b>: la tardanza deja de contar en el reporte y en el Formato 01 el día aparece con <b>J</b>.</span>
              </div>
              {justifModalError && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                  style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#dc2626' }}>
                  <svg className="shrink-0 mt-0.5 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  </svg>
                  <span>{justifModalError}</span>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setJustifModal(null); setJustifRespuesta('') }}
                  disabled={justificando}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: '#faf8f7', border: '1.5px solid #e2e8f0', color: '#64748b' }}>
                  Cancelar
                </button>
                <button
                  onClick={justificarAsistencia}
                  disabled={justificando}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #0B2447, #0369A1)', boxShadow: '0 4px 16px rgba(11,36,71,.25)' }}>
                  <span className="flex items-center justify-center gap-2">
                    {justificando && <Spinner cls="h-4 w-4 text-white"/>}
                    {justificando ? 'Guardando...' : 'Justificar'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal opciones de descarga ─────────────────────────────────── */}
      {modalDescarga && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalDescarga(null) }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#fff' }}>
            {/* Header */}
            <div className="px-5 py-4" style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
              <p className="text-white font-black text-sm">Opciones de descarga</p>
              <p className="text-white/60 text-xs mt-0.5">
                {modalDescarga === 'imagen' ? 'Imagen PNG' : 'Archivo Excel'}
              </p>
            </div>

            <div className="p-5 space-y-5">
              {/* Filtro personal */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">¿Qué personal incluir?</p>
                <div className="flex flex-col gap-2">
                  {([['todo', 'Todo el personal (docentes + administrativos)'], ['docentes', 'Solo docentes']] as const).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 transition-all"
                      style={descargaFiltroPersonal === val
                        ? { background: '#F1F5F9', border: '1.5px solid #fecdd3' }
                        : { background: '#f8fafc', border: '1.5px solid #e2e8f0' }}>
                      <input type="radio" name="filtroPersonal" value={val} checked={descargaFiltroPersonal === val}
                        onChange={() => setDescargaFiltroPersonal(val)} className="accent-indigo-900"/>
                      <span className="text-xs font-semibold text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Selección de columnas */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">¿Qué datos incluir?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    ['apellido_nombre', 'Apellidos y Nombre'],
                    ['dni',            'DNI'],
                    ['correo',         'Correo'],
                    ['celular',        'Celular'],
                    ['cumpleanos',     'Cumpleaños'],
                    ['usuario',        'Usuario'],
                    ['tipo',           'Tipo (doc./admin.)'],
                  ] as const).map(([key, label]) => {
                    const checked = descargaCampos.has(key)
                    const disabled = key === 'tipo' && descargaFiltroPersonal !== 'todo'
                    return (
                      <label key={key} className="flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 transition-all"
                        style={disabled
                          ? { opacity: 0.35, background: '#f8fafc', border: '1px solid #e2e8f0' }
                          : checked
                            ? { background: '#F1F5F9', border: '1px solid #fecdd3' }
                            : { background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <input type="checkbox" checked={checked && !disabled} disabled={disabled}
                          onChange={() => {
                            const next = new Set(descargaCampos)
                            if (next.has(key)) next.delete(key); else next.add(key)
                            setDescargaCampos(next)
                          }}
                          className="accent-indigo-900"/>
                        <span className="text-xs font-medium text-slate-700">{label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Footer botones */}
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setModalDescarga(null)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-500 transition-all"
                style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0' }}>
                Cancelar
              </button>
              <button
                disabled={descargandoImagenDoc || descargandoDocentes || descargaCampos.size === 0}
                onClick={async () => {
                  const f = descargaFiltroPersonal
                  const c = [...descargaCampos]
                  setModalDescarga(null)
                  if (modalDescarga === 'imagen') await descargarImagenDocentes(f, c)
                  else await descargarExcelDocentes(f, c)
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-black text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: modalDescarga === 'imagen'
                  ? 'linear-gradient(135deg,#0B2447,#1E3A8A)'
                  : 'linear-gradient(135deg,#0d9488,#06b6d4)' }}>
                {descargaCampos.size === 0 ? 'Selecciona campos' : `Descargar ${modalDescarga === 'imagen' ? 'PNG' : 'Excel'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
