'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/components/ConfirmModal'
import { resumenExamen, type ExamenPregunta } from '@/lib/libreta'

/* ─────────────────────── tipos ─────────────────────── */
interface Ciclo     { id: string; nombre: string; activo: boolean; anio: number; periodo: number }
interface Periodo   { id: string; nombre: string; publicado: boolean; created_at: string }
interface AlumnoRow {
  id: string; nombre: string; apellidos: string | null; dni: string | null
  grado: string; grupo: string; salon_nombre: string | null
}
interface SalonCard  { grado: string; grupo: string; salon_nombre: string | null; count: number }
interface Evaluacion { id: string; titulo: string; orden: number }
interface NotaRow    { id: string; alumno_id: string; evaluacion_id: string; nota: number; comentario: string | null }
interface Rango      { desde: string; hasta: string; area: string }
interface Examen     { id: string; titulo: string; preguntas: ExamenPregunta[]; created_at: string }
interface PlantillaCursos {
  id: string; nombre: string; cursos: string[]
  preguntas: ExamenPregunta[] | null; examen_titulo: string | null
}

const MAX_PLANTILLAS = 4

const GRADOS_ORDEN = [
  '1° Primaria','2° Primaria','3° Primaria','4° Primaria','5° Primaria','6° Primaria',
  '1° Secundaria','2° Secundaria','3° Secundaria','4° Secundaria','5° Secundaria',
]

const keyDe = (alumnoId: string, evalId: string) => `${alumnoId}::${evalId}`
const norm  = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
// Para emparejar columnas con áreas del examen: además ignora tildes ("MATEMATICA" = "Matemática")
const normArea = (s: string) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '')

/* ── CSV helpers (separador ; para Excel en español, con BOM UTF-8) ── */
function csvEscape(v: string) {
  return /[";\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = '', enQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (enQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') enQ = false
      else cur += ch
    } else if (ch === '"') enQ = true
    else if (ch === sep) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

/* ══════════════════════════════ componente ══════════════════════════════ */
interface NotasProps { embedded?: boolean }

export function NotasContent({ embedded = false }: NotasProps = {}) {
  const router = useRouter()
  const { confirmar, dialogo } = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading,   setLoading]   = useState(true)
  const [ciclos,    setCiclos]    = useState<Ciclo[]>([])
  const [cicloId,   setCicloId]   = useState('')

  const [periodos,    setPeriodos]    = useState<Periodo[]>([])
  const [periodoSel,  setPeriodoSel]  = useState<Periodo | null>(null)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [creando,     setCreando]     = useState(false)
  const [errorMsg,    setErrorMsg]    = useState('')

  const [alumnos,   setAlumnos]   = useState<AlumnoRow[]>([])
  const [salones,   setSalones]   = useState<SalonCard[]>([])
  const [salonSel,  setSalonSel]  = useState<SalonCard | null>(null)
  const [cargando,  setCargando]  = useState(false)

  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([])
  const [nuevaCol,     setNuevaCol]     = useState('')
  const [notas,        setNotas]        = useState<Record<string, string>>({})
  const [notasOrig,    setNotasOrig]    = useState<Record<string, string>>({})
  const [notaIds,      setNotaIds]      = useState<Record<string, string>>({})
  const [comentarios,     setComentarios]     = useState<Record<string, string>>({})
  const [comentariosOrig, setComentariosOrig] = useState<Record<string, string>>({})
  const [cargandoGrid, setCargandoGrid] = useState(false)
  const [guardando,    setGuardando]    = useState(false)
  const [guardadoOk,   setGuardadoOk]   = useState(false)
  const [importMsg,    setImportMsg]    = useState('')

  // Modal de configuración de plantilla
  const [modalPlantilla, setModalPlantilla] = useState(false)
  const [plantillaTipo,  setPlantillaTipo]  = useState<'directa' | 'preguntas'>('directa')
  const [tituloExamen,   setTituloExamen]   = useState('')
  const [numPreguntas,   setNumPreguntas]   = useState('20')
  const [rangos,         setRangos]         = useState<Rango[]>([{ desde: '1', hasta: '', area: '' }])
  const [plantillaErr,   setPlantillaErr]   = useState('')

  // Exámenes por preguntas
  const [examenes,       setExamenes]       = useState<Examen[]>([])
  const [examenSel,      setExamenSel]      = useState<Examen | null>(null)
  const [respuestas,     setRespuestas]     = useState<Record<string, Record<string, number>>>({})
  // Todas las respuestas del salón, por examen → alumno (llenan el grid automáticamente)
  const [respuestasTodas, setRespuestasTodas] = useState<Record<string, Record<string, Record<string, number>>>>({})

  // Plantillas de cursos reutilizables (globales, máx. 4)
  const [plantillas,      setPlantillas]      = useState<PlantillaCursos[]>([])
  const [nombrePlantilla, setNombrePlantilla] = useState<string | null>(null)   // null = cerrado
  const [plantillaCsvId,  setPlantillaCsvId]  = useState('')                    // '' = columnas del salón
  const [cargandoExamen, setCargandoExamen] = useState(false)
  const [detalleDe,      setDetalleDe]      = useState<{ alumno: AlumnoRow; examen: Examen } | null>(null)
  const examenFileRef = useRef<HTMLInputElement>(null)
  const [examenImportando, setExamenImportando] = useState<Examen | null>(null)

  /* ── auth + init ── */
  useEffect(() => {
    async function init() {
      if (!embedded) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { data: adm } = await supabase.from('user_admin').select('id').eq('id', user.id).maybeSingle()
        if (!adm) { router.push('/admin'); return }
      }

      const { data: cics } = await supabase
        .from('ciclos').select('id,nombre,activo,anio,periodo')
        .eq('tipo', 'lectivo')
        .order('anio', { ascending: false }).order('periodo', { ascending: false })
      const lista = (cics ?? []) as Ciclo[]
      setCiclos(lista)
      const activo = lista.find(c => c.activo) ?? lista[0]
      if (activo) {
        setCicloId(activo.id)
        await Promise.all([cargarPeriodos(activo.id), cargarAlumnos(activo.id), cargarPlantillas()])
      }
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  /* ── periodos ── */
  async function cargarPeriodos(cid: string) {
    const { data } = await supabase
      .from('libreta_periodos')
      .select('id,nombre,publicado,created_at')
      .eq('ciclo_id', cid)
      .order('created_at')
    setPeriodos((data ?? []) as Periodo[])
  }

  async function crearPeriodo() {
    const nombre = nuevoNombre.trim()
    if (!nombre || !cicloId) return
    setCreando(true); setErrorMsg('')
    const { data, error } = await supabase
      .from('libreta_periodos')
      .insert({ ciclo_id: cicloId, nombre })
      .select('id,nombre,publicado,created_at')
      .single()
    if (error) {
      setErrorMsg(error.code === '23505'
        ? `Ya existe un periodo llamado "${nombre}" en este ciclo.`
        : 'No se pudo crear el periodo. ¿Tienes permisos de administrador?')
    } else if (data) {
      setPeriodos(p => [...p, data as Periodo])
      setNuevoNombre('')
    }
    setCreando(false)
  }

  async function togglePublicar(p: Periodo) {
    if (!p.publicado) {
      const res = await confirmar({
        titulo: `¿Publicar "${p.nombre}"?`,
        mensaje: 'Las notas de este periodo se volverán visibles para los padres de familia en el portal público (consulta por DNI). Puedes despublicarlo en cualquier momento.',
        tono: 'advertencia',
        confirmarLabel: 'Publicar',
      })
      if (!res) return
    }
    const { error } = await supabase
      .from('libreta_periodos')
      .update({ publicado: !p.publicado })
      .eq('id', p.id)
    if (!error) {
      const upd = { ...p, publicado: !p.publicado }
      setPeriodos(ps => ps.map(x => x.id === p.id ? upd : x))
      if (periodoSel?.id === p.id) setPeriodoSel(upd)
    }
  }

  async function eliminarPeriodo(p: Periodo) {
    const { count } = await supabase
      .from('libreta_notas')
      .select('id,libreta_evaluaciones!inner(periodo_id)', { count: 'exact', head: true })
      .eq('libreta_evaluaciones.periodo_id', p.id)
    const res = await confirmar({
      titulo: `¿Eliminar "${p.nombre}"?`,
      mensaje: (
        <>
          Se eliminará el periodo con sus evaluaciones <b>y sus {count ?? 0} notas registradas</b>.
          {p.publicado && <> Los padres dejarán de verlo de inmediato.</>} Esta acción no se puede deshacer.
        </>
      ),
      tono: 'peligro',
      confirmarLabel: 'Eliminar',
    })
    if (!res) return
    const { error } = await supabase.from('libreta_periodos').delete().eq('id', p.id)
    if (!error) {
      setPeriodos(ps => ps.filter(x => x.id !== p.id))
      if (periodoSel?.id === p.id) { setPeriodoSel(null); setSalonSel(null) }
    }
  }

  /* ── alumnos y salones del ciclo (mismo criterio que Boletines) ── */
  async function cargarAlumnos(cid: string) {
    setCargando(true); setSalonSel(null)
    const [{ data: mats }, { data: sals }] = await Promise.all([
      supabase.from('matriculas')
        .select('grado,grupo,alumnos(id,nombre,apellidos,dni)')
        .eq('ciclo_id', cid),
      supabase.from('salones').select('grado,grupo,nombre'),
    ])
    const salonMap: Record<string, string | null> = {}
    for (const s of (sals ?? []) as { grado: string; grupo: string; nombre: string | null }[]) {
      salonMap[`${s.grado}-${s.grupo}`] = s.nombre
    }
    const lista: AlumnoRow[] = []
    type MatRow = { grado: string; grupo: string; alumnos: { id: string; nombre: string | null; apellidos: string | null; dni: string | null } | null }
    for (const m of (mats ?? []) as unknown as MatRow[]) {
      if (!m.alumnos) continue
      const a = m.alumnos
      lista.push({
        id: a.id, nombre: a.nombre ?? '', apellidos: a.apellidos ?? null,
        dni: a.dni ?? null, grado: m.grado, grupo: m.grupo,
        salon_nombre: salonMap[`${m.grado}-${m.grupo}`] ?? null,
      })
    }
    lista.sort((a, b) => {
      const gi = GRADOS_ORDEN.indexOf(a.grado) - GRADOS_ORDEN.indexOf(b.grado)
      if (gi !== 0) return gi
      const gr = a.grupo.localeCompare(b.grupo)
      if (gr !== 0) return gr
      return `${a.apellidos ?? ''} ${a.nombre}`.localeCompare(`${b.apellidos ?? ''} ${b.nombre}`)
    })
    setAlumnos(lista)
    const cardMap: Record<string, SalonCard> = {}
    for (const a of lista) {
      const k = `${a.grado}-${a.grupo}`
      if (!cardMap[k]) cardMap[k] = { grado: a.grado, grupo: a.grupo, salon_nombre: a.salon_nombre, count: 0 }
      cardMap[k].count++
    }
    setSalones(Object.values(cardMap).sort((a, b) => {
      const gi = GRADOS_ORDEN.indexOf(a.grado) - GRADOS_ORDEN.indexOf(b.grado)
      return gi !== 0 ? gi : a.grupo.localeCompare(b.grupo)
    }))
    setCargando(false)
  }

  /* ── grid: evaluaciones del salón + notas existentes del periodo ── */
  async function cargarGrid(salon: SalonCard, periodo: Periodo) {
    setSalonSel(salon); setCargandoGrid(true); setGuardadoOk(false); setImportMsg(''); setErrorMsg('')
    setExamenSel(null); setRespuestas({}); setDetalleDe(null)

    const [{ data: evals }, { data: exs }] = await Promise.all([
      supabase
        .from('libreta_evaluaciones')
        .select('id,titulo,orden')
        .eq('periodo_id', periodo.id)
        .eq('grado', salon.grado).eq('grupo', salon.grupo)
        .order('orden').order('titulo'),
      supabase
        .from('libreta_examenes')
        .select('id,titulo,preguntas,created_at')
        .eq('periodo_id', periodo.id)
        .eq('grado', salon.grado).eq('grupo', salon.grupo)
        .order('created_at'),
    ])
    const evalList = (evals ?? []) as Evaluacion[]
    setEvaluaciones(evalList)
    const exList = (exs ?? []) as Examen[]
    setExamenes(exList)
    await cargarRespuestasTodas(exList)

    const { data: existentes } = evalList.length
      ? await supabase
          .from('libreta_notas')
          .select('id,alumno_id,evaluacion_id,nota,comentario')
          .in('evaluacion_id', evalList.map(e => e.id))
      : { data: [] }

    const vals: Record<string, string> = {}
    const ids:  Record<string, string> = {}
    const coms: Record<string, string> = {}
    for (const n of (existentes ?? []) as NotaRow[]) {
      const k = keyDe(n.alumno_id, n.evaluacion_id)
      vals[k] = String(n.nota)
      ids[k]  = n.id
      if (n.comentario) coms[k] = n.comentario
    }
    setNotas(vals); setNotasOrig(vals); setNotaIds(ids)
    setComentarios(coms); setComentariosOrig(coms)
    setCargandoGrid(false)
  }

  /* ── columnas (evaluaciones) ── */
  async function agregarColumna(tituloRaw?: string) {
    const titulo = (tituloRaw ?? nuevaCol).trim()
    if (!titulo || !periodoSel || !salonSel) return
    if (evaluaciones.some(e => norm(e.titulo) === norm(titulo))) {
      setErrorMsg(`Ya existe la columna "${titulo}".`); return
    }
    setErrorMsg('')
    const { data, error } = await supabase
      .from('libreta_evaluaciones')
      .insert({
        periodo_id: periodoSel.id, grado: salonSel.grado, grupo: salonSel.grupo,
        titulo, orden: evaluaciones.length,
      })
      .select('id,titulo,orden')
      .single()
    if (error) {
      setErrorMsg('No se pudo crear la columna. ¿Tienes permisos de administrador?')
    } else if (data) {
      setEvaluaciones(e => [...e, data as Evaluacion])
      setNuevaCol('')
    }
  }

  async function usarCursosDelSalon() {
    if (!periodoSel || !salonSel) return
    let asigsQ = supabase
      .from('asignaciones').select('cursos(nombre)')
      .eq('grado', salonSel.grado).eq('grupo', salonSel.grupo)
    if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
    const { data: asigs } = await asigsQ
    type AsigRow = { cursos: { nombre: string } | null }
    const nombres = [...new Set(
      ((asigs ?? []) as unknown as AsigRow[]).map(a => a.cursos?.nombre?.trim()).filter((n): n is string => !!n)
    )].sort((a, b) => a.localeCompare(b))
    const existentes = new Set(evaluaciones.map(e => norm(e.titulo)))
    const nuevas = nombres.filter(n => !existentes.has(norm(n)))
    if (!nuevas.length) { setImportMsg('Los cursos del salón ya están como columnas.'); return }
    const { data, error } = await supabase
      .from('libreta_evaluaciones')
      .insert(nuevas.map((titulo, i) => ({
        periodo_id: periodoSel.id, grado: salonSel.grado, grupo: salonSel.grupo,
        titulo, orden: evaluaciones.length + i,
      })))
      .select('id,titulo,orden')
    if (!error && data) {
      setEvaluaciones(e => [...e, ...(data as Evaluacion[])])
      setImportMsg(`Se agregaron ${data.length} columnas desde los cursos del salón.`)
    }
  }

  async function usarAreasDelExamen() {
    if (!periodoSel || !salonSel || !examenes.length) return
    const nombres = [...new Set(examenes.flatMap(ex => ex.preguntas.map(p => p.area.trim())).filter(Boolean))]
    const existentes = new Set(evaluaciones.map(e => normArea(e.titulo)))
    const nuevas = nombres.filter(n => !existentes.has(normArea(n)))
    if (!nuevas.length) { setImportMsg('Las áreas del examen ya están como columnas.'); return }
    const { data, error } = await supabase
      .from('libreta_evaluaciones')
      .insert(nuevas.map((titulo, i) => ({
        periodo_id: periodoSel.id, grado: salonSel.grado, grupo: salonSel.grupo,
        titulo, orden: evaluaciones.length + i,
      })))
      .select('id,titulo,orden')
    if (!error && data) {
      setEvaluaciones(e => [...e, ...(data as Evaluacion[])])
      setImportMsg(`Se agregaron ${data.length} columnas desde las áreas del examen (el máximo de cada una es su número de preguntas).`)
    }
  }

  /* ── plantillas de cursos (globales, reutilizables en todos los salones) ── */
  async function cargarPlantillas() {
    const { data } = await supabase
      .from('libreta_plantillas')
      .select('id,nombre,cursos,preguntas,examen_titulo')
      .order('created_at')
    setPlantillas((data ?? []) as PlantillaCursos[])
  }

  // Aplica columnas + examen de la plantilla; devuelve el examen del salón (creado o existente)
  async function aplicarPlantilla(p: PlantillaCursos): Promise<Examen | null> {
    if (!periodoSel || !salonSel) return null
    setErrorMsg('')
    const partes: string[] = []

    // 1) Columnas de cursos que falten
    const existentes = new Set(evaluaciones.map(e => normArea(e.titulo)))
    const nuevas = p.cursos.filter(cs => !existentes.has(normArea(cs)))
    if (nuevas.length) {
      const { data, error } = await supabase
        .from('libreta_evaluaciones')
        .insert(nuevas.map((titulo, i) => ({
          periodo_id: periodoSel.id, grado: salonSel.grado, grupo: salonSel.grupo,
          titulo, orden: evaluaciones.length + i,
        })))
        .select('id,titulo,orden')
      if (error) { setErrorMsg('No se pudieron crear las columnas de la plantilla. ¿Tienes permisos de administrador?'); return null }
      if (data) {
        setEvaluaciones(e => [...e, ...(data as Evaluacion[])])
        partes.push(`${data.length} columnas`)
      }
    }

    // 2) Examen por preguntas guardado en la plantilla (si el salón aún no lo tiene)
    let exFinal: Examen | null = null
    if (p.preguntas?.length) {
      const tituloEx = (p.examen_titulo ?? '').trim() || `Examen ${periodoSel.nombre}`
      exFinal = examenes.find(e => norm(e.titulo) === norm(tituloEx)) ?? null
      if (!exFinal) {
        const { data, error } = await supabase
          .from('libreta_examenes')
          .insert({
            periodo_id: periodoSel.id, grado: salonSel.grado, grupo: salonSel.grupo,
            titulo: tituloEx, preguntas: p.preguntas,
          })
          .select('id,titulo,preguntas,created_at')
          .single()
        if (error) { setErrorMsg('Las columnas se crearon, pero no se pudo crear el examen de la plantilla.'); return null }
        if (data) {
          exFinal = data as Examen
          setExamenes(ex => [...ex, exFinal!])
          partes.push(`examen «${tituloEx}» (${p.preguntas.length} preguntas)`)
        }
      }
    }

    setImportMsg(partes.length
      ? `Plantilla «${p.nombre}» aplicada: ${partes.join(' + ')}. Descarga la plantilla del examen, marca 1/0 e importa las respuestas.`
      : `La plantilla «${p.nombre}» ya estaba aplicada en este salón.`)
    return exFinal
  }

  async function guardarPlantilla() {
    const nombre = (nombrePlantilla ?? '').trim()
    if (!nombre || !evaluaciones.length) return
    setErrorMsg('')
    if (plantillas.length >= MAX_PLANTILLAS) {
      setErrorMsg(`Solo puedes tener ${MAX_PLANTILLAS} plantillas de cursos: elimina una para guardar otra.`); return
    }
    if (plantillas.some(p => norm(p.nombre) === norm(nombre))) {
      setErrorMsg(`Ya existe una plantilla llamada "${nombre}".`); return
    }
    const cursos = evaluaciones.map(e => e.titulo)
    // Se guarda también el examen del salón (el más reciente): título + preguntas con sus rangos por área
    const exBase = examenes.length ? examenes[examenes.length - 1] : null
    const { data, error } = await supabase
      .from('libreta_plantillas')
      .insert({
        nombre, cursos,
        preguntas: exBase?.preguntas ?? null,
        examen_titulo: exBase?.titulo ?? null,
      })
      .select('id,nombre,cursos,preguntas,examen_titulo')
      .single()
    if (error || !data) {
      setErrorMsg(error?.code === '23505'
        ? `Ya existe una plantilla llamada "${nombre}".`
        : 'No se pudo guardar la plantilla. ¿Tienes permisos de administrador?')
    } else {
      setPlantillas(ps => [...ps, data as PlantillaCursos])
      setNombrePlantilla(null)
      setImportMsg(exBase
        ? `Plantilla «${nombre}» guardada con ${cursos.length} cursos y el examen «${exBase.titulo}» (${exBase.preguntas.length} preguntas con sus rangos por área). Al aplicarla en otro salón se crea todo de golpe.`
        : `Plantilla «${nombre}» guardada con ${cursos.length} cursos: aplícala en cualquier grado y sección.`)
    }
  }

  async function eliminarPlantilla(p: PlantillaCursos) {
    const res = await confirmar({
      titulo: `¿Eliminar la plantilla "${p.nombre}"?`,
      mensaje: <>Contiene {p.cursos.length} cursos ({p.cursos.join(', ')}){p.preguntas?.length ? <> y el examen «{p.examen_titulo}» de {p.preguntas.length} preguntas</> : null}. Las columnas y exámenes ya creados en los salones NO se tocan; solo dejarás de poder aplicarla. Esta acción no se puede deshacer.</>,
      tono: 'peligro',
      confirmarLabel: 'Eliminar plantilla',
    })
    if (!res) return
    const { error } = await supabase.from('libreta_plantillas').delete().eq('id', p.id)
    if (!error) setPlantillas(ps => ps.filter(x => x.id !== p.id))
  }

  async function eliminarColumna(ev: Evaluacion) {
    const { count } = await supabase
      .from('libreta_notas')
      .select('id', { count: 'exact', head: true })
      .eq('evaluacion_id', ev.id)
    const res = await confirmar({
      titulo: `¿Eliminar la columna "${ev.titulo}"?`,
      mensaje: <>Se eliminarán <b>las {count ?? 0} notas registradas</b> en esta evaluación. Esta acción no se puede deshacer.</>,
      tono: 'peligro',
      confirmarLabel: 'Eliminar columna',
    })
    if (!res) return
    const { error } = await supabase.from('libreta_evaluaciones').delete().eq('id', ev.id)
    if (!error) {
      setEvaluaciones(es => es.filter(x => x.id !== ev.id))
      const limpiar = (m: Record<string, string>) => {
        const c = { ...m }
        for (const k of Object.keys(c)) if (k.endsWith(`::${ev.id}`)) delete c[k]
        return c
      }
      setNotas(limpiar); setNotasOrig(limpiar)
    }
  }

  /* ── plantilla CSV ── */
  const alumnosSalon = salonSel
    ? alumnos.filter(a => a.grado === salonSel.grado && a.grupo === salonSel.grupo)
    : []

  function descargarCsv(header: string[], filas: string[][], sufijo: string) {
    if (!salonSel || !periodoSel) return
    const sep = ';'
    const csv = '﻿' + [header, ...filas]
      .map(f => f.map(v => csvEscape(String(v))).join(sep)).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 -]/g, '').trim().replace(/\s+/g, '-').toLowerCase()
    a.href = url
    a.download = `plantilla-${sufijo}-${safe(periodoSel.nombre)}-${safe(salonSel.grado)}-${safe(salonSel.grupo)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // Valida los rangos del examen y devuelve pregunta → área
  function validarRangos(n: number): { mapa: Record<number, string> } | { error: string } {
    if (!Number.isInteger(n) || n < 1 || n > 200) return { error: 'Indica un número de preguntas entre 1 y 200.' }
    const mapa: Record<number, string> = {}
    const conDatos = rangos.filter(r => r.desde.trim() || r.hasta.trim() || r.area.trim())
    if (!conDatos.length) return { error: 'Agrega al menos un rango (p. ej. preguntas 1 a 3 → Matemática).' }
    for (const r of conDatos) {
      const d = parseInt(r.desde), h = parseInt(r.hasta)
      const area = r.area.trim()
      if (!area) return { error: 'Cada rango necesita el nombre del área (p. ej. Matemática).' }
      if (!Number.isInteger(d) || !Number.isInteger(h) || d < 1 || h > n || d > h)
        return { error: `Rango inválido en «${area}»: debe estar entre 1 y ${n}, con "desde" ≤ "hasta".` }
      for (let i = d; i <= h; i++) {
        if (mapa[i] && norm(mapa[i]) !== norm(area)) return { error: `La pregunta ${i} está en dos áreas (${mapa[i]} y ${area}).` }
        mapa[i] = area
      }
    }
    return { mapa }
  }

  const filaBase = (al: AlumnoRow) => [al.dni ?? '', `${al.apellidos ?? ''} ${al.nombre}`.trim()]

  function plantillaExamenCsv(ex: Examen, resp: Record<string, Record<string, number>>) {
    const orden = [...ex.preguntas].sort((a, b) => a.n - b.n)
    const header = ['DNI', 'Alumno', ...orden.map(p => `P${p.n} [${p.area}]`)]
    const filas = alumnosSalon.map(al => [
      ...filaBase(al),
      ...orden.map(p => {
        const r = resp[al.id]?.[String(p.n)]
        return r === 0 || r === 1 ? String(r) : ''
      }),
    ])
    descargarCsv(header, filas, 'examen')
  }

  async function generarPlantilla() {
    if (!salonSel || !periodoSel) return
    setPlantillaErr('')

    if (plantillaTipo === 'directa') {
      // Columnas: las del salón, o las de una plantilla de cursos guardada
      const pl = plantillas.find(p => p.id === plantillaCsvId) ?? null

      // Plantilla con examen: se aplica al salón y se descarga el Excel de preguntas (P1, P2…) para marcar 1/0
      if (pl?.preguntas?.length) {
        const ex = await aplicarPlantilla(pl)
        if (!ex) { setPlantillaErr('No se pudo preparar el examen de la plantilla en este salón.'); return }
        const resp = await cargarRespuestas(ex)
        plantillaExamenCsv(ex, resp)
        setImportMsg(
          `Plantilla «${pl.nombre}» aplicada y Excel del examen «${ex.titulo}» descargado (${ex.preguntas.length} preguntas). ` +
          `Marca 1 = correcta y 0 = incorrecta por alumno e impórtalo con el botón «Importar».`
        )
        setModalPlantilla(false)
        return
      }

      const titulos = pl ? pl.cursos : evaluaciones.map(e => e.titulo)
      if (!titulos.length) { setPlantillaErr('Este salón aún no tiene columnas: créalas o elige una plantilla de cursos.'); return }
      const evalPorArea: Record<string, Evaluacion> = {}
      for (const e of evaluaciones) evalPorArea[normArea(e.titulo)] = e
      const header = ['DNI', 'Alumno', ...titulos]
      const filas = alumnosSalon.map(al => [
        ...filaBase(al),
        ...titulos.map(t => {
          const ev = evalPorArea[normArea(t)]
          return ev ? (notas[keyDe(al.id, ev.id)] ?? '') : ''
        }),
      ])
      descargarCsv(header, filas, 'notas')
      setImportMsg(pl
        ? `Plantilla descargada con los cursos de «${pl.nombre}». Llena los puntos en Excel e impórtala aquí: las columnas que le falten al salón se crean solas.`
        : 'Plantilla descargada. Ábrela en Excel, llena los puntos de cada evaluación, agrega columnas si necesitas (p. ej. «Concurso de Matemática») e impórtala aquí.')
      setModalPlantilla(false)
      return
    }

    // Examen por preguntas: se registra el examen y luego se descarga su plantilla
    const titulo = tituloExamen.trim()
    if (!titulo) { setPlantillaErr('Ponle un nombre al examen (p. ej. «Examen Bimestral I»).'); return }
    if (examenes.some(e => norm(e.titulo) === norm(titulo))) {
      setPlantillaErr(`Ya existe un examen llamado "${titulo}" en este periodo y salón.`); return
    }
    const n = parseInt(numPreguntas)
    const res = validarRangos(n)
    if ('error' in res) { setPlantillaErr(res.error); return }
    const sinArea = Array.from({ length: n }, (_, i) => i + 1).filter(i => !res.mapa[i])
    if (sinArea.length) {
      setPlantillaErr(`Asigna un área a todas las preguntas: faltan ${sinArea.join(', ')}.`); return
    }
    const preguntas: ExamenPregunta[] = Array.from({ length: n }, (_, i) => ({ n: i + 1, area: res.mapa[i + 1] }))

    const { data, error } = await supabase
      .from('libreta_examenes')
      .insert({
        periodo_id: periodoSel.id, grado: salonSel.grado, grupo: salonSel.grupo,
        titulo, preguntas,
      })
      .select('id,titulo,preguntas,created_at')
      .single()
    if (error || !data) {
      setPlantillaErr(error?.code === '23505'
        ? `Ya existe un examen llamado "${titulo}".`
        : 'No se pudo registrar el examen. ¿Tienes permisos de administrador?')
      return
    }
    const nuevo = data as Examen
    setExamenes(ex => [...ex, nuevo])
    plantillaExamenCsv(nuevo, {})
    setTituloExamen('')
    setImportMsg(
      `Examen «${nuevo.titulo}» creado (${n} preguntas) y plantilla descargada. Marca 1 = correcta y 0 = incorrecta por alumno ` +
      `y súbela con el botón «Importar respuestas» del examen. Cada pregunta correcta vale 1 punto.`
    )
    setModalPlantilla(false)
  }

  async function importarCsv(file: File) {
    if (!periodoSel || !salonSel) return
    setImportMsg(''); setErrorMsg('')
    const raw = (await file.text()).replace(/^﻿/, '')
    const lineas = raw.split(/\r?\n/).filter(l => l.trim() !== '')
    if (lineas.length < 2) { setErrorMsg('El archivo está vacío o no tiene filas de alumnos.'); return }

    const sep = (lineas[0].match(/;/g)?.length ?? 0) >= (lineas[0].match(/,/g)?.length ?? 0) ? ';' : ','
    const header = parseCsvLine(lineas[0], sep).map(h => h.trim())
    if (header.length < 3) { setErrorMsg('La plantilla debe tener las columnas DNI, Alumno y al menos una evaluación.'); return }
    const titulosCsv = header.slice(2).filter(t => t !== '')

    // ¿Es plantilla de examen por preguntas? (cabeceras "P1 [Área]" o "P1")
    const reP = /^P\s*(\d+)\s*(?:\[(.+)\])?$/i
    const esPreguntas = titulosCsv.length > 0 && titulosCsv.every(t => reP.test(t))

    // Índices de alumnos por DNI y por nombre completo
    const porDni: Record<string, AlumnoRow> = {}
    const porNombre: Record<string, AlumnoRow> = {}
    for (const al of alumnosSalon) {
      if (al.dni) porDni[al.dni.trim()] = al
      porNombre[norm(`${al.apellidos ?? ''} ${al.nombre}`)] = al
      porNombre[norm(`${al.nombre} ${al.apellidos ?? ''}`)] = al
    }
    const buscarAlumno = (celdas: string[]) => {
      const dni    = (celdas[0] ?? '').trim()
      const nombre = (celdas[1] ?? '').trim()
      return (dni && porDni[dni]) || porNombre[norm(nombre)] || null
    }

    // Crea las evaluaciones que falten y devuelve el mapa título→evaluación
    async function asegurarEvaluaciones(titulos: string[]): Promise<Record<string, Evaluacion> | null> {
      let evalActuales = [...evaluaciones]
      const faltantes = titulos.filter(t => !evalActuales.some(e => normArea(e.titulo) === normArea(t)))
      if (faltantes.length) {
        const { data, error } = await supabase
          .from('libreta_evaluaciones')
          .insert(faltantes.map((titulo, i) => ({
            periodo_id: periodoSel!.id, grado: salonSel!.grado, grupo: salonSel!.grupo,
            titulo, orden: evalActuales.length + i,
          })))
          .select('id,titulo,orden')
        if (error) { setErrorMsg('No se pudieron crear las columnas nuevas del archivo.'); return null }
        evalActuales = [...evalActuales, ...(data as Evaluacion[])]
        setEvaluaciones(evalActuales)
      }
      const mapa: Record<string, Evaluacion> = {}
      for (const e of evalActuales) mapa[normArea(e.titulo)] = e
      return mapa
    }

    if (esPreguntas) {
      // Enrutar automáticamente al examen cuyas preguntas coinciden con la cabecera
      const nums = titulosCsv
        .map(t => { const m = t.match(reP); return m ? parseInt(m[1]) : null })
        .filter((n): n is number => n !== null)
      const numsSet = new Set(nums)
      let candidatos = examenes.filter(ex =>
        ex.preguntas.length === nums.length && ex.preguntas.every(p => numsSet.has(p.n))
      )
      if (candidatos.length > 1) {
        const areasCsv = new Set(titulosCsv
          .map(t => { const m = t.match(reP); return m?.[2] ? normArea(m[2]) : null })
          .filter((a): a is string => a !== null))
        if (areasCsv.size) {
          const filtrados = candidatos.filter(ex => ex.preguntas.every(p => areasCsv.has(normArea(p.area))))
          if (filtrados.length) candidatos = filtrados
        }
      }
      if (candidatos.length === 1) { await importarRespuestas(candidatos[0], file); return }
      setErrorMsg(candidatos.length === 0
        ? 'Este archivo es una plantilla de examen por preguntas, pero sus columnas no coinciden con ningún examen de este periodo y salón. Revisa que sea la plantilla correcta.'
        : 'Este archivo coincide con varios exámenes: súbelo con el botón «Importar respuestas» del examen correspondiente, en la sección Exámenes de abajo.')
      return
    }

    /* ══ Notas directas (0–20): columnas nuevas del CSV → evaluaciones ══ */
    const evalPorTitulo = await asegurarEvaluaciones(titulosCsv)
    if (!evalPorTitulo) return
    const columnasNuevas = titulosCsv.filter(t => !evaluaciones.some(e => normArea(e.titulo) === normArea(t))).length

    let aplicadas = 0, sinAlumno = 0, invalidas = 0
    const nuevos: Record<string, string> = {}
    for (const linea of lineas.slice(1)) {
      const celdas = parseCsvLine(linea, sep)
      const al = buscarAlumno(celdas)
      if (!al) { sinAlumno++; continue }
      titulosCsv.forEach((t, i) => {
        const ev = evalPorTitulo[normArea(t)]
        if (!ev) return
        const crudo = (celdas[i + 2] ?? '').trim().replace(',', '.')
        if (crudo === '') return
        const num = parseFloat(crudo)
        if (!Number.isFinite(num) || num < 0 || num > 999.9) { invalidas++; return }
        const maxCol = maxDeEval(t)
        if (maxCol !== undefined && num > maxCol) { invalidas++; return }
        nuevos[keyDe(al.id, ev.id)] = String(Math.round(num * 10) / 10)
        aplicadas++
      })
    }

    setNotas(n => ({ ...n, ...nuevos }))
    setGuardadoOk(false)
    const partes = [`${aplicadas} notas cargadas en la tabla`]
    if (columnasNuevas) partes.push(`${columnasNuevas} columnas nuevas creadas`)
    if (sinAlumno)  partes.push(`${sinAlumno} filas sin alumno reconocido`)
    if (invalidas)  partes.push(`${invalidas} valores inválidos ignorados (deben ser puntos de 0 hasta el máximo de preguntas de su área)`)
    setImportMsg(`Importación lista: ${partes.join(' · ')}. Revisa la tabla y pulsa «Guardar cambios».`)
  }

  /* ── exámenes por preguntas ── */
  async function cargarRespuestasTodas(exList: Examen[]) {
    if (!exList.length) { setRespuestasTodas({}); return }
    const { data } = await supabase
      .from('libreta_examen_respuestas')
      .select('examen_id,alumno_id,respuestas')
      .in('examen_id', exList.map(e => e.id))
    const mapa: Record<string, Record<string, Record<string, number>>> = {}
    for (const r of (data ?? []) as { examen_id: string; alumno_id: string; respuestas: Record<string, number> }[]) {
      if (!mapa[r.examen_id]) mapa[r.examen_id] = {}
      mapa[r.examen_id][r.alumno_id] = r.respuestas ?? {}
    }
    setRespuestasTodas(mapa)
  }

  async function cargarRespuestas(ex: Examen): Promise<Record<string, Record<string, number>>> {
    const { data } = await supabase
      .from('libreta_examen_respuestas')
      .select('alumno_id,respuestas')
      .eq('examen_id', ex.id)
    const mapa: Record<string, Record<string, number>> = {}
    for (const r of (data ?? []) as { alumno_id: string; respuestas: Record<string, number> }[]) {
      mapa[r.alumno_id] = r.respuestas ?? {}
    }
    return mapa
  }

  async function verExamen(ex: Examen) {
    if (examenSel?.id === ex.id) { setExamenSel(null); return }
    setCargandoExamen(true); setExamenSel(ex)
    setRespuestas(await cargarRespuestas(ex))
    setCargandoExamen(false)
  }

  async function descargarPlantillaExamen(ex: Examen) {
    const resp = examenSel?.id === ex.id ? respuestas : await cargarRespuestas(ex)
    plantillaExamenCsv(ex, resp)
    setImportMsg(`Plantilla de «${ex.titulo}» descargada. Marca 1 = correcta y 0 = incorrecta y súbela con «Importar respuestas».`)
  }

  async function eliminarExamen(ex: Examen) {
    const { count } = await supabase
      .from('libreta_examen_respuestas')
      .select('id', { count: 'exact', head: true })
      .eq('examen_id', ex.id)
    const res = await confirmar({
      titulo: `¿Eliminar el examen "${ex.titulo}"?`,
      mensaje: <>Se eliminará el examen <b>y las respuestas de {count ?? 0} alumnos</b>. Los padres y alumnos dejarán de verlo. Esta acción no se puede deshacer.</>,
      tono: 'peligro',
      confirmarLabel: 'Eliminar examen',
    })
    if (!res) return
    const { error } = await supabase.from('libreta_examenes').delete().eq('id', ex.id)
    if (!error) {
      const restantes = examenes.filter(x => x.id !== ex.id)
      setExamenes(restantes)
      await cargarRespuestasTodas(restantes)
      if (examenSel?.id === ex.id) setExamenSel(null)
    }
  }

  async function importarRespuestas(ex: Examen, file: File) {
    setImportMsg(''); setErrorMsg('')
    const raw = (await file.text()).replace(/^﻿/, '')
    const lineas = raw.split(/\r?\n/).filter(l => l.trim() !== '')
    if (lineas.length < 2) { setErrorMsg('El archivo está vacío o no tiene filas de alumnos.'); return }

    const sep = (lineas[0].match(/;/g)?.length ?? 0) >= (lineas[0].match(/,/g)?.length ?? 0) ? ';' : ','
    const header = parseCsvLine(lineas[0], sep).map(h => h.trim())
    const reP = /^P\s*(\d+)\s*(?:\[(.+)\])?$/i

    // Columna de cada pregunta según la cabecera P<n>
    const colDePregunta: Record<number, number> = {}
    header.forEach((h, i) => {
      const m = h.match(reP)
      if (m) colDePregunta[parseInt(m[1])] = i
    })
    const numeros = ex.preguntas.map(p => p.n)
    const faltan = numeros.filter(n => colDePregunta[n] === undefined)
    if (faltan.length) {
      setErrorMsg(`El archivo no corresponde a este examen: faltan las columnas de las preguntas ${faltan.join(', ')}.`)
      return
    }

    // Índices de alumnos por DNI y nombre
    const porDni: Record<string, AlumnoRow> = {}
    const porNombre: Record<string, AlumnoRow> = {}
    for (const al of alumnosSalon) {
      if (al.dni) porDni[al.dni.trim()] = al
      porNombre[norm(`${al.apellidos ?? ''} ${al.nombre}`)] = al
      porNombre[norm(`${al.nombre} ${al.apellidos ?? ''}`)] = al
    }

    let alumnosOk = 0, sinAlumno = 0, sinRespuestas = 0, invalidas = 0
    const filas: { examen_id: string; alumno_id: string; respuestas: Record<string, number>; updated_at: string }[] = []
    const ahora = new Date().toISOString()
    for (const linea of lineas.slice(1)) {
      const celdas = parseCsvLine(linea, sep)
      const dni    = (celdas[0] ?? '').trim()
      const nombre = (celdas[1] ?? '').trim()
      const al = (dni && porDni[dni]) || porNombre[norm(nombre)] || null
      if (!al) { sinAlumno++; continue }
      const respondio = numeros.some(n => (celdas[colDePregunta[n]] ?? '').trim() !== '')
      if (!respondio) { sinRespuestas++; continue }
      const resp: Record<string, number> = {}
      for (const n of numeros) {
        const v = (celdas[colDePregunta[n]] ?? '').trim()
        if (v === '1') resp[String(n)] = 1
        else { resp[String(n)] = 0; if (v !== '0' && v !== '') invalidas++ }   // vacío/raro = incorrecta
      }
      filas.push({ examen_id: ex.id, alumno_id: al.id, respuestas: resp, updated_at: ahora })
      alumnosOk++
    }

    if (filas.length) {
      const { error } = await supabase
        .from('libreta_examen_respuestas')
        .upsert(filas, { onConflict: 'examen_id,alumno_id' })
      if (error) { setErrorMsg('No se pudieron guardar las respuestas. ¿Tienes permisos de administrador?'); return }
    }

    await cargarRespuestasTodas(examenes)
    if (examenSel?.id === ex.id) setRespuestas(await cargarRespuestas(ex))
    else await verExamen(ex)
    const partes = [`${alumnosOk} alumnos con respuestas guardadas`]
    if (sinAlumno)     partes.push(`${sinAlumno} filas sin alumno reconocido`)
    if (sinRespuestas) partes.push(`${sinRespuestas} alumnos sin respuestas (fila vacía, no rindieron)`)
    if (invalidas)     partes.push(`${invalidas} valores distintos de 0/1 tomados como incorrectos`)
    setImportMsg(`Respuestas de «${ex.titulo}» importadas: ${partes.join(' · ')}.`)
  }

  /* ── edición y guardado ── */
  // Máximo de puntos por área según el examen del periodo/salón:
  // cada pregunta vale 1 punto, así que el tope de una columna es su nº de preguntas.
  const maxPorArea: Record<string, number> = {}
  for (const ex of examenes) {
    for (const p of ex.preguntas) maxPorArea[normArea(p.area)] = (maxPorArea[normArea(p.area)] ?? 0) + 1
  }
  const maxDeEval = (titulo: string): number | undefined => maxPorArea[normArea(titulo)]

  // Puntos que sacó el alumno en el examen para la columna (si coincide con un área):
  // se calculan de las respuestas importadas y llenan el grid automáticamente.
  function puntosExamenDe(alumnoId: string, tituloCol: string): number | undefined {
    const key = normArea(tituloCol)
    let total: number | undefined
    for (const ex of examenes) {
      const resp = respuestasTodas[ex.id]?.[alumnoId]
      if (!resp) continue
      let pts = 0, tiene = false
      for (const p of ex.preguntas) {
        if (normArea(p.area) !== key) continue
        tiene = true
        if (Number(resp[String(p.n)]) === 1) pts++
      }
      if (tiene) total = (total ?? 0) + pts
    }
    return total
  }
  const maxTotalGrid = evaluaciones.length && evaluaciones.every(e => maxDeEval(e.titulo) !== undefined)
    ? evaluaciones.reduce((s, e) => s + (maxDeEval(e.titulo) ?? 0), 0)
    : null

  function setNota(alumnoId: string, evalId: string, v: string) {
    // Solo números con hasta un decimal (puntos obtenidos)
    if (v !== '' && !/^\d{1,3}(\.\d?)?$/.test(v)) return
    const titulo = evaluaciones.find(e => e.id === evalId)?.titulo
    const max = titulo !== undefined ? maxDeEval(titulo) : undefined
    if (v !== '' && max !== undefined && parseFloat(v) > max) return
    setGuardadoOk(false)
    setNotas(n => ({ ...n, [keyDe(alumnoId, evalId)]: v }))
  }

  const hayCambios =
    Object.keys({ ...notas, ...notasOrig }).some(k => (notas[k] ?? '') !== (notasOrig[k] ?? '')) ||
    Object.keys({ ...comentarios, ...comentariosOrig }).some(k => (comentarios[k] ?? '') !== (comentariosOrig[k] ?? ''))

  async function guardar() {
    if (!periodoSel || !salonSel || guardando) return
    setGuardando(true); setErrorMsg('')

    const upserts: { evaluacion_id: string; alumno_id: string; nota: number; comentario: string | null; updated_at: string }[] = []
    const borrarIds: string[] = []
    const ahora = new Date().toISOString()

    for (const k of Object.keys({ ...notas, ...notasOrig })) {
      const nuevo = (notas[k] ?? '').trim()
      const orig  = (notasOrig[k] ?? '').trim()
      const comIgual = (comentarios[k] ?? '') === (comentariosOrig[k] ?? '')
      if (nuevo === orig && comIgual) continue
      const [alumnoId, evalId] = k.split('::')
      if (nuevo === '') {
        if (notaIds[k]) borrarIds.push(notaIds[k])
      } else {
        upserts.push({
          evaluacion_id: evalId, alumno_id: alumnoId, nota: parseFloat(nuevo),
          comentario: (comentarios[k] ?? '').trim() || null, updated_at: ahora,
        })
      }
    }

    let falló = false
    if (upserts.length) {
      const { error } = await supabase
        .from('libreta_notas')
        .upsert(upserts, { onConflict: 'evaluacion_id,alumno_id' })
      if (error) falló = true
    }
    if (!falló && borrarIds.length) {
      const { error } = await supabase.from('libreta_notas').delete().in('id', borrarIds)
      if (error) falló = true
    }

    if (falló) {
      setErrorMsg('No se pudieron guardar las notas. Verifica tu conexión y que tengas permisos de administrador.')
    } else {
      await cargarGrid(salonSel, periodoSel)
      setGuardadoOk(true)
    }
    setGuardando(false)
  }

  async function cambiarCiclo(id: string) {
    setCicloId(id); setPeriodoSel(null); setSalonSel(null)
    await Promise.all([cargarPeriodos(id), cargarAlumnos(id)])
  }

  async function seleccionarPeriodo(p: Periodo) {
    if (periodoSel?.id === p.id) { setPeriodoSel(null); setSalonSel(null); return }
    setPeriodoSel(p); setSalonSel(null)
  }

  /* ── render ── */
  if (loading) return null

  const cicloActual = ciclos.find(c => c.id === cicloId)

  const selectorCiclo = (
    <div className="flex items-center gap-2">
      {cicloActual?.activo && (
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
          style={{ background: '#dcfce7', color: '#16a34a' }}>
          ACTIVO
        </span>
      )}
      <select value={cicloId} onChange={e => cambiarCiclo(e.target.value)}
        className="text-xs font-bold px-3 py-1.5 rounded-lg outline-none"
        style={{ background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #E4E8EF' }}>
        {ciclos.map(c => (
          <option key={c.id} value={c.id}>{c.nombre}{c.activo ? ' ★' : ''}</option>
        ))}
      </select>
    </div>
  )

  return (
    <div className={embedded ? '' : 'min-h-screen'} style={embedded ? undefined : { background: '#f7f5f1' }}>

      {/* Header (oculto en embedded) */}
      {!embedded && (
      <header className="sticky top-0 z-50 px-4 py-3 flex items-center gap-3"
        style={{ background: 'white', borderBottom: '1px solid #E4E8EF', boxShadow: '0 1px 12px rgba(107,15,26,.06)', borderTop: '3px solid #0B2447' }}>
        <Link href="/admin" className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-900 transition-colors">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Admin
        </Link>
        <span className="text-slate-300">/</span>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
              <circle cx="12" cy="9" r="6"/><path strokeLinecap="round" strokeLinejoin="round" d="m9 15-2 7 5-3 5 3-2-7"/>
            </svg>
          </div>
          <p className="font-black text-slate-800 text-sm">Notas para Padres</p>
        </div>
        <div className="ml-auto">{selectorCiclo}</div>
      </header>
      )}

      {embedded && (
        <div className="mb-5 flex items-center justify-end">{selectorCiclo}</div>
      )}

      <div className={embedded ? 'space-y-5' : 'w-full px-4 lg:px-6 py-6 space-y-5'}>

        {/* Instrucción */}
        <div className="rounded-2xl p-4 flex items-start gap-3"
          style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe' }}>
          <svg className="shrink-0 mt-0.5" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#1d4ed8" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p className="text-xs font-semibold leading-relaxed" style={{ color: '#1e40af' }}>
            Crea un periodo (p. ej. «Bimestre I»), elige un salón y define las columnas que necesites:
            cursos, exámenes, concursos, etc. Puedes digitar las notas aquí o <b>descargar una plantilla</b> para
            llenarla en Excel e importarla: de notas directas (puntos por evaluación) o de <b>examen por preguntas</b> (marcas
            1 = correcta / 0 = incorrecta y el sistema suma los puntos por área). La nota final es la <b>suma de puntos</b>,
            no un promedio. Cuando todo esté listo pulsa{' '}
            <b>Publicar</b>: recién entonces los padres verán las notas en el portal consultando con el DNI del alumno.
          </p>
        </div>

        {/* ── Periodos ── */}
        <div className="rounded-2xl p-4 space-y-3"
          style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 2px 12px rgba(107,15,26,.05)' }}>
          <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Periodos de notas · {cicloActual?.nombre ?? '—'}</p>

          {periodos.length === 0 && (
            <p className="text-xs text-slate-400 font-semibold py-2">
              Aún no hay periodos en este ciclo. Crea el primero, por ejemplo «Bimestre I».
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {periodos.map(p => {
              const activo = periodoSel?.id === p.id
              return (
                <div key={p.id} className="flex items-center gap-1.5 rounded-xl pl-3 pr-1.5 py-1.5 transition-all"
                  style={{
                    background: activo ? 'linear-gradient(135deg,#0B2447,#1E3A8A)' : '#F8FAFC',
                    border: activo ? '1.5px solid transparent' : '1.5px solid #E4E8EF',
                  }}>
                  <button onClick={() => seleccionarPeriodo(p)} className="flex items-center gap-2">
                    <span className="text-xs font-black" style={{ color: activo ? 'white' : '#1e293b' }}>{p.nombre}</span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                      style={p.publicado
                        ? { background: '#dcfce7', color: '#16a34a' }
                        : { background: activo ? 'rgba(255,255,255,.15)' : '#f1f5f9', color: activo ? 'rgba(255,255,255,.8)' : '#94a3b8' }}>
                      {p.publicado ? 'PUBLICADO' : 'BORRADOR'}
                    </span>
                  </button>
                  <button onClick={() => togglePublicar(p)}
                    title={p.publicado ? 'Ocultar a los padres' : 'Publicar para los padres'}
                    className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:opacity-75"
                    style={{ background: p.publicado ? '#fef3c7' : '#dcfce7' }}>
                    {p.publicado ? (
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                      </svg>
                    ) : (
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                      </svg>
                    )}
                  </button>
                  <button onClick={() => eliminarPeriodo(p)} title="Eliminar periodo"
                    className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:opacity-75"
                    style={{ background: '#fef2f2' }}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>

          {/* Crear periodo */}
          <div className="flex gap-2 pt-1">
            <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && crearPeriodo()}
              placeholder="Nombre del periodo (p. ej. Bimestre I)"
              className="flex-1 text-xs font-bold px-3 py-2 rounded-xl outline-none"
              style={{ background: '#F8FAFC', border: '1.5px solid #E4E8EF', color: '#0B2447' }} />
            <button onClick={crearPeriodo} disabled={creando || !nuevoNombre.trim()}
              className="px-4 py-2 rounded-xl text-xs font-black text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
              {creando ? 'Creando…' : '+ Crear periodo'}
            </button>
          </div>
          {errorMsg && !salonSel && (
            <p className="text-xs font-bold" style={{ color: '#dc2626' }}>{errorMsg}</p>
          )}
        </div>

        {/* ── Salones del periodo seleccionado ── */}
        {periodoSel && (cargando ? (
          <div className="flex justify-center py-12">
            <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#0B2447" strokeWidth="4"/>
              <path className="opacity-75" fill="#0B2447" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </div>
        ) : alumnos.length === 0 ? (
          <div className="rounded-2xl py-12 text-center"
            style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
            <p className="text-slate-400 text-sm font-bold">No hay alumnos matriculados en este ciclo</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {salones.map(s => {
                const isActive = salonSel?.grado === s.grado && salonSel?.grupo === s.grupo
                return (
                  <button key={`${s.grado}-${s.grupo}`}
                    onClick={() => { if (!isActive) cargarGrid(s, periodoSel); else setSalonSel(null) }}
                    className="rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5"
                    style={{
                      background: isActive ? 'linear-gradient(135deg,#0B2447,#1E3A8A)' : 'white',
                      border: isActive ? 'none' : '1.5px solid #E4E8EF',
                      boxShadow: isActive ? '0 6px 20px rgba(107,15,26,.28)' : '0 2px 12px rgba(107,15,26,.05)',
                    }}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black"
                        style={{ background: isActive ? 'rgba(255,255,255,.2)' : '#F1F5F9', color: isActive ? 'white' : '#0B2447' }}>
                        {s.grupo}
                      </div>
                      <span className="text-lg font-black" style={{ color: isActive ? 'rgba(255,255,255,.85)' : '#64748b' }}>
                        {s.count}
                      </span>
                    </div>
                    <p className="text-xs font-black leading-tight" style={{ color: isActive ? 'white' : '#1e293b' }}>
                      {s.grado}
                    </p>
                    {s.salon_nombre && (
                      <p className="text-[10px] font-semibold mt-0.5 truncate"
                        style={{ color: isActive ? 'rgba(255,255,255,.7)' : '#94a3b8' }}>
                        {s.salon_nombre}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>

            {/* ── Grid de notas ── */}
            {salonSel && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 20px rgba(107,15,26,.06)' }}>
                <div className="h-1" style={{ background: 'linear-gradient(90deg,#0B2447,#1E3A8A,#1E40AF)' }} />

                <div className="p-4 flex items-center justify-between gap-3 flex-wrap border-b border-slate-100">
                  <div>
                    <p className="font-black text-slate-800 text-sm">
                      {periodoSel.nombre} · {salonSel.grado} — Sección {salonSel.grupo}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {examenes.length
                        ? 'Las columnas que coinciden con un área del examen se llenan solas con los puntos de las respuestas importadas (en verde) · el Total es la suma · máximo por columna: sus preguntas'
                        : 'Escribe los puntos obtenidos en cada evaluación · el Total es la suma · deja la casilla vacía si aún no hay nota'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => { setPlantillaErr(''); setModalPlantilla(true) }}
                      disabled={cargandoGrid || alumnosSalon.length === 0}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all hover:opacity-80 disabled:opacity-50"
                      style={{ background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #E4E8EF' }}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                      </svg>
                      Plantilla
                    </button>
                    <button onClick={() => fileRef.current?.click()}
                      disabled={cargandoGrid}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all hover:opacity-80 disabled:opacity-50"
                      style={{ background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #E4E8EF' }}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                      </svg>
                      Importar
                    </button>
                    <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) importarCsv(f); e.target.value = '' }} />
                    {guardadoOk && !hayCambios && (
                      <span className="text-xs font-black" style={{ color: '#16a34a' }}>✓ Guardado</span>
                    )}
                    <button onClick={guardar} disabled={guardando || !hayCambios}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', boxShadow: '0 3px 12px rgba(107,15,26,.25)' }}>
                      {guardando ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                  </div>
                </div>

                {/* Barra de columnas */}
                <div className="px-4 py-3 flex items-center gap-2 flex-wrap border-b border-slate-100"
                  style={{ background: '#FBFCFE' }}>
                  <input value={nuevaCol} onChange={e => setNuevaCol(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && agregarColumna()}
                    placeholder="Nueva columna (p. ej. Examen Bimestral, Concurso de Matemática)"
                    className="flex-1 min-w-48 text-xs font-bold px-3 py-2 rounded-xl outline-none"
                    style={{ background: 'white', border: '1.5px solid #E4E8EF', color: '#0B2447' }} />
                  <button onClick={() => agregarColumna()} disabled={!nuevaCol.trim() || cargandoGrid}
                    className="px-3 py-2 rounded-xl text-xs font-black text-white transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                    + Columna
                  </button>
                  <button onClick={usarCursosDelSalon} disabled={cargandoGrid}
                    className="px-3 py-2 rounded-xl text-xs font-black transition-all hover:opacity-80 disabled:opacity-50"
                    style={{ background: '#eff6ff', color: '#1d4ed8', border: '1.5px solid #bfdbfe' }}>
                    Usar cursos del salón
                  </button>
                  {examenes.length > 0 && (
                    <button onClick={usarAreasDelExamen} disabled={cargandoGrid}
                      className="px-3 py-2 rounded-xl text-xs font-black transition-all hover:opacity-80 disabled:opacity-50"
                      style={{ background: '#f0fdfa', color: '#0d9488', border: '1.5px solid #99f6e4' }}>
                      Usar áreas del examen
                    </button>
                  )}

                  {/* Plantillas de cursos: aplicables en cualquier grado/sección */}
                  {(plantillas.length > 0 || evaluaciones.length > 0) && (
                    <div className="w-full flex items-center gap-2 flex-wrap pt-2 mt-1"
                      style={{ borderTop: '1px dashed #E4E8EF' }}>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Plantillas de cursos
                      </span>
                      {plantillas.map(p => (
                        <span key={p.id} className="inline-flex items-center rounded-xl overflow-hidden"
                          style={{ border: '1.5px solid #cfd6fb' }}>
                          <button onClick={() => aplicarPlantilla(p)} disabled={cargandoGrid}
                            title={`Aplicar en este salón: ${p.cursos.join(', ')}${p.preguntas?.length ? ` · incluye examen «${p.examen_titulo}» de ${p.preguntas.length} preguntas` : ''}`}
                            className="px-3 py-1.5 text-xs font-black transition-all hover:opacity-80 disabled:opacity-50"
                            style={{ background: '#eef1fe', color: '#1d4ed8' }}>
                            {p.nombre}
                          </button>
                          <button onClick={() => eliminarPlantilla(p)} title={`Eliminar plantilla ${p.nombre}`}
                            className="px-2 py-1.5 text-xs font-black transition-all hover:opacity-70"
                            style={{ background: '#fef2f2', color: '#dc2626' }}>
                            ×
                          </button>
                        </span>
                      ))}
                      {nombrePlantilla !== null ? (
                        <>
                          <input value={nombrePlantilla} autoFocus
                            onChange={e => setNombrePlantilla(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') guardarPlantilla(); if (e.key === 'Escape') setNombrePlantilla(null) }}
                            placeholder="Nombre (p. ej. Cursos Secundaria)"
                            className="text-xs font-bold px-3 py-1.5 rounded-xl outline-none min-w-48"
                            style={{ background: 'white', border: '1.5px solid #1d4ed8', color: '#0B2447' }} />
                          <button onClick={guardarPlantilla} disabled={!(nombrePlantilla ?? '').trim()}
                            className="px-3 py-1.5 rounded-xl text-xs font-black text-white transition-all hover:opacity-90 disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                            Guardar
                          </button>
                          <button onClick={() => setNombrePlantilla(null)}
                            className="px-3 py-1.5 rounded-xl text-xs font-black transition-all hover:opacity-80"
                            style={{ background: '#F1F5F9', color: '#64748b' }}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        evaluaciones.length > 0 && plantillas.length < MAX_PLANTILLAS && (
                          <button onClick={() => setNombrePlantilla('')} disabled={cargandoGrid}
                            title="Guarda las columnas actuales como plantilla para usarlas en otros grados y secciones"
                            className="px-3 py-1.5 rounded-xl text-xs font-black transition-all hover:opacity-80 disabled:opacity-50"
                            style={{ background: 'white', color: '#1d4ed8', border: '1.5px dashed #93c5fd' }}>
                            + Guardar columnas como plantilla
                          </button>
                        )
                      )}
                      {plantillas.length >= MAX_PLANTILLAS && nombrePlantilla === null && (
                        <span className="text-[10px] font-bold text-slate-400">máx. {MAX_PLANTILLAS} plantillas</span>
                      )}
                    </div>
                  )}
                </div>

                {(errorMsg || importMsg) && (
                  <p className="px-4 pt-3 text-xs font-bold" style={{ color: errorMsg ? '#dc2626' : '#1d4ed8' }}>
                    {errorMsg || importMsg}
                  </p>
                )}

                {cargandoGrid ? (
                  <div className="flex justify-center py-12">
                    <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#0B2447" strokeWidth="4"/>
                      <path className="opacity-75" fill="#0B2447" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  </div>
                ) : evaluaciones.length === 0 ? (
                  <div className="py-12 text-center px-4">
                    <p className="text-sm text-slate-400 font-bold">
                      Aún no hay columnas de evaluación para este salón.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Crea una con «+ Columna» (examen, concurso, etc.), usa los cursos del salón,
                      o descarga la plantilla, agrega columnas en Excel e impórtala.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ minWidth: 480 }}>
                      <thead>
                        <tr style={{ background: '#F1F5F9' }}>
                          <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wider sticky left-0"
                            style={{ background: '#F1F5F9', minWidth: 180 }}>Alumno</th>
                          {evaluaciones.map(ev => (
                            <th key={ev.id} className="text-center px-2 py-2 font-black text-slate-500" style={{ minWidth: 84 }}>
                              <div className="flex flex-col items-center gap-1">
                                <span className="leading-tight">{ev.titulo}</span>
                                {maxDeEval(ev.titulo) !== undefined && (
                                  <span className="text-[9px] font-bold normal-case tracking-normal text-slate-400">
                                    máx {maxDeEval(ev.titulo)}
                                  </span>
                                )}
                                <button onClick={() => eliminarColumna(ev)} title={`Eliminar columna ${ev.titulo}`}
                                  className="text-[9px] font-bold px-1.5 rounded transition-all hover:opacity-70"
                                  style={{ background: '#fef2f2', color: '#dc2626' }}>
                                  quitar
                                </button>
                              </div>
                            </th>
                          ))}
                          <th className="text-center px-2 py-2 font-black" style={{ minWidth: 72, color: '#0B2447' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alumnosSalon.map((al, i) => {
                          const sumaFila = evaluaciones.reduce((s, ev) => {
                            const n = parseFloat(notas[keyDe(al.id, ev.id)] ?? '')
                            if (Number.isFinite(n)) return s + n
                            const pe = puntosExamenDe(al.id, ev.titulo)
                            return pe !== undefined ? s + pe : s
                          }, 0)
                          const tieneNotas = evaluaciones.some(ev =>
                            (notas[keyDe(al.id, ev.id)] ?? '') !== '' || puntosExamenDe(al.id, ev.titulo) !== undefined)
                          return (
                          <tr key={al.id} style={{ background: i % 2 ? '#F8FAFC' : 'white', borderTop: '1px solid #f1f5f9' }}>
                            <td className="px-3 py-2 font-bold text-slate-700 sticky left-0"
                              style={{ background: i % 2 ? '#F8FAFC' : 'white' }}>
                              {`${al.apellidos ?? ''} ${al.nombre}`.trim()}
                            </td>
                            {evaluaciones.map(ev => {
                              const k = keyDe(al.id, ev.id)
                              const v = notas[k] ?? ''
                              const cambiado = (v ?? '') !== (notasOrig[k] ?? '')
                              const maxCol = maxDeEval(ev.titulo)
                              const excede = v !== '' && maxCol !== undefined && parseFloat(v) > maxCol
                              const delExamen = v === '' ? puntosExamenDe(al.id, ev.titulo) : undefined
                              if (delExamen !== undefined) {
                                return (
                                  <td key={ev.id} className="px-2 py-1.5 text-center">
                                    <span
                                      title={`Puntos del examen (${delExamen}${maxCol !== undefined ? ` de ${maxCol}` : ''}): calculado de las respuestas importadas`}
                                      className="inline-flex items-center justify-center w-14 py-1.5 rounded-lg font-black"
                                      style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4', color: '#0d9488' }}>
                                      {delExamen}
                                    </span>
                                  </td>
                                )
                              }
                              return (
                                <td key={ev.id} className="px-2 py-1.5 text-center">
                                  <input value={v} inputMode="decimal"
                                    onChange={e => setNota(al.id, ev.id, e.target.value)}
                                    title={excede
                                      ? `Supera el máximo del área (${maxCol} preguntas): corrígela antes de publicar`
                                      : comentarios[k] || undefined}
                                    placeholder="—"
                                    className="w-14 text-center font-black py-1.5 rounded-lg outline-none transition-all"
                                    style={{
                                      background: excede ? '#fef2f2' : cambiado ? '#fffbeb' : '#F8FAFC',
                                      border: excede ? '1.5px solid #fca5a5' : cambiado ? '1.5px solid #fbbf24' : '1.5px solid #E4E8EF',
                                      color: excede ? '#dc2626' : v === '' ? '#94a3b8' : '#0B2447',
                                    }} />
                                </td>
                              )
                            })}
                            <td className="px-2 py-2 text-center">
                              {tieneNotas ? (
                                <span className="font-black px-2.5 py-1 rounded-full whitespace-nowrap"
                                  title={maxTotalGrid !== null && sumaFila > maxTotalGrid
                                    ? `La suma supera el total de preguntas del examen (${maxTotalGrid})` : undefined}
                                  style={maxTotalGrid !== null && sumaFila > maxTotalGrid
                                    ? { background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fca5a5' }
                                    : { background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #E4E8EF' }}>
                                  {Math.round(sumaFila * 10) / 10}
                                  {maxTotalGrid !== null && <span className="font-bold" style={{ opacity: .55 }}> / {maxTotalGrid}</span>}
                                </span>
                              ) : <span className="text-slate-300 font-bold">—</span>}
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Exámenes por preguntas ── */}
            {salonSel && examenes.length > 0 && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 20px rgba(107,15,26,.06)' }}>
                <div className="h-1" style={{ background: 'linear-gradient(90deg,#0d9488,#14b8a6,#2dd4bf)' }} />
                <div className="p-4 border-b border-slate-100">
                  <p className="font-black text-slate-800 text-sm">Exámenes por preguntas</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cada pregunta correcta vale 1 punto · la nota final es el total de puntos
                  </p>
                </div>

                <input ref={examenFileRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f && examenImportando) importarRespuestas(examenImportando, f)
                    e.target.value = ''
                  }} />

                <div className="divide-y divide-slate-100">
                  {examenes.map(ex => {
                    const abiertoEx = examenSel?.id === ex.id
                    const areasEx = [...new Set(ex.preguntas.map(p => p.area))]
                    return (
                      <div key={ex.id}>
                        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
                          <div className="flex-1 min-w-40">
                            <p className="font-bold text-slate-800 text-sm">{ex.titulo}</p>
                            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                              {ex.preguntas.length} preguntas · {areasEx.join(' · ')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => descargarPlantillaExamen(ex)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-black transition-all hover:opacity-80"
                              style={{ background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #E4E8EF' }}>
                              Plantilla
                            </button>
                            <button onClick={() => { setExamenImportando(ex); examenFileRef.current?.click() }}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-black transition-all hover:opacity-80"
                              style={{ background: '#eff6ff', color: '#1d4ed8', border: '1.5px solid #bfdbfe' }}>
                              Importar respuestas
                            </button>
                            <button onClick={() => verExamen(ex)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-black text-white transition-all hover:opacity-90"
                              style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                              {abiertoEx ? 'Ocultar resultados' : 'Ver resultados'}
                            </button>
                            <button onClick={() => eliminarExamen(ex)} title="Eliminar examen"
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-75"
                              style={{ background: '#fef2f2' }}>
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Resultados del examen */}
                        {abiertoEx && (cargandoExamen ? (
                          <div className="flex justify-center py-8">
                            <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#0B2447" strokeWidth="4"/>
                              <path className="opacity-75" fill="#0B2447" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                          </div>
                        ) : (
                          <div className="overflow-x-auto" style={{ background: '#F8FAFC' }}>
                            <table className="w-full text-xs" style={{ minWidth: 480 }}>
                              <thead>
                                <tr style={{ background: '#F1F5F9' }}>
                                  <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wider sticky left-0"
                                    style={{ background: '#F1F5F9', minWidth: 180 }}>Alumno</th>
                                  {areasEx.map(a => (
                                    <th key={a} className="text-center px-2 py-2 font-black text-slate-500" style={{ minWidth: 80 }}>{a}</th>
                                  ))}
                                  <th className="text-center px-2 py-2 font-black text-slate-500" style={{ minWidth: 80 }}>Nota final</th>
                                  <th className="text-center px-2 py-2 font-black text-slate-500" style={{ minWidth: 70 }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {alumnosSalon.map((al, i) => {
                                  const resp = respuestas[al.id]
                                  const r = resp ? resumenExamen(ex.preguntas, resp) : null
                                  return (
                                    <tr key={al.id} style={{ background: i % 2 ? '#F8FAFC' : 'white', borderTop: '1px solid #f1f5f9' }}>
                                      <td className="px-3 py-2 font-bold text-slate-700 sticky left-0"
                                        style={{ background: i % 2 ? '#F8FAFC' : 'white' }}>
                                        {`${al.apellidos ?? ''} ${al.nombre}`.trim()}
                                      </td>
                                      {r ? r.areas.map(a => (
                                        <td key={a.area} className="px-2 py-2 text-center font-black whitespace-nowrap"
                                          style={{ color: a.puntos >= a.total * 0.5 ? '#0d9488' : '#dc2626' }}>
                                          {a.puntos} <span className="text-slate-300 font-bold">/ {a.total}</span>
                                        </td>
                                      )) : areasEx.map(a => (
                                        <td key={a} className="px-2 py-2 text-center text-slate-300 font-bold">—</td>
                                      ))}
                                      <td className="px-2 py-2 text-center">
                                        {r ? (
                                          <span className="font-black px-2 py-0.5 rounded-full whitespace-nowrap"
                                            style={{
                                              background: r.puntos >= r.total * 0.5 ? '#ccfbf1' : '#fee2e2',
                                              color:      r.puntos >= r.total * 0.5 ? '#0d9488' : '#dc2626',
                                            }}>
                                            {r.puntos} / {r.total}
                                          </span>
                                        ) : <span className="text-slate-300 font-bold">—</span>}
                                      </td>
                                      <td className="px-2 py-2 text-center">
                                        {r && (
                                          <button onClick={() => setDetalleDe({ alumno: al, examen: ex })}
                                            className="px-2.5 py-1 rounded-lg text-[10px] font-black transition-all hover:opacity-80"
                                            style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                            Detalle
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Modal: detalle pregunta por pregunta ────────────────────────────── */}
      {detalleDe && (() => {
        const r = resumenExamen(detalleDe.examen.preguntas, respuestas[detalleDe.alumno.id])
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(6px)' }}
            onClick={() => setDetalleDe(null)}>
            <div className="w-full max-w-lg rounded-3xl overflow-hidden max-h-[90vh] overflow-y-auto"
              style={{ background: 'white', boxShadow: '0 28px 70px rgba(15,23,42,.22)' }}
              onClick={e => e.stopPropagation()}>
              <div className="px-6 pt-5 pb-4" style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                <p className="font-black text-white text-sm">{detalleDe.examen.titulo}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,.7)' }}>
                  {`${detalleDe.alumno.apellidos ?? ''} ${detalleDe.alumno.nombre}`.trim()}
                </p>
              </div>
              <div className="p-6 space-y-4">
                {/* Acumulado por área */}
                <div className="flex flex-wrap gap-2">
                  {r.areas.map(a => (
                    <span key={a.area} className="text-xs font-black px-3 py-1.5 rounded-full"
                      style={{ background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #E4E8EF' }}>
                      {a.area}: {a.puntos} {a.puntos === 1 ? 'punto' : 'puntos'} de {a.total}
                    </span>
                  ))}
                  <span className="text-xs font-black px-3 py-1.5 rounded-full"
                    style={{
                      background: r.puntos >= r.total * 0.5 ? '#ccfbf1' : '#fee2e2',
                      color:      r.puntos >= r.total * 0.5 ? '#0d9488' : '#dc2626',
                    }}>
                    Nota final: {r.puntos} / {r.total}
                  </span>
                </div>
                {/* Detalle por pregunta, agrupado por área */}
                {r.areas.map(a => (
                  <div key={a.area}>
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">
                      {a.area} · {a.puntos}/{a.total}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.detalle.filter(d => d.area === a.area).map(d => (
                        <span key={d.n} title={`Pregunta ${d.n}: ${d.ok ? 'correcta' : 'incorrecta'}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-black"
                          style={{
                            background: d.ok ? '#ecfdf5' : '#fef2f2',
                            color:      d.ok ? '#059669' : '#dc2626',
                            border:     d.ok ? '1px solid #a7f3d0' : '1px solid #fecaca',
                          }}>
                          P{d.n} {d.ok ? '✓' : '✗'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-1">
                  <button onClick={() => setDetalleDe(null)}
                    className="px-4 py-2 rounded-xl text-xs font-black transition-all hover:opacity-80"
                    style={{ background: '#F1F5F9', color: '#64748b' }}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal: configurar plantilla ─────────────────────────────────────── */}
      {modalPlantilla && salonSel && periodoSel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(6px)' }}
          onClick={() => setModalPlantilla(false)}>
          <div className="w-full max-w-lg rounded-3xl overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{ background: 'white', boxShadow: '0 28px 70px rgba(15,23,42,.22)' }}
            onClick={e => e.stopPropagation()}>

            <div className="px-6 pt-5 pb-4" style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
              <p className="font-black text-white text-sm">Generar plantilla</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,.7)' }}>
                {periodoSel.nombre} · {salonSel.grado} — Sección {salonSel.grupo} · {alumnosSalon.length} alumnos
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Tipo de plantilla */}
              <div className="space-y-2">
                <button onClick={() => setPlantillaTipo('directa')}
                  className="w-full text-left rounded-2xl p-3.5 transition-all"
                  style={{
                    background: plantillaTipo === 'directa' ? '#eff6ff' : '#F8FAFC',
                    border: plantillaTipo === 'directa' ? '1.5px solid #1d4ed8' : '1.5px solid #E4E8EF',
                  }}>
                  <p className="text-xs font-black" style={{ color: '#0B2447' }}>Notas directas (puntos por evaluación)</p>
                  <p className="text-[11px] text-slate-400 font-semibold mt-0.5 leading-relaxed">
                    Una columna por evaluación ({evaluaciones.length ? evaluaciones.map(e => e.titulo).join(', ') : 'aún sin columnas: puedes agregarlas en Excel'}).
                    Escribes los puntos que obtuvo cada alumno; el total es la suma.
                  </p>
                </button>
                {plantillaTipo === 'directa' && plantillas.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap rounded-2xl p-3"
                    style={{ background: '#F8FAFC', border: '1.5px solid #E4E8EF' }}>
                    <label className="text-xs font-black text-slate-500">Columnas del Excel:</label>
                    <select value={plantillaCsvId} onChange={e => setPlantillaCsvId(e.target.value)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg outline-none"
                      style={{ background: 'white', border: '1.5px solid #E4E8EF', color: '#0B2447' }}>
                      <option value="">Las del salón ({evaluaciones.length} columnas)</option>
                      {plantillas.map(p => (
                        <option key={p.id} value={p.id}>
                          Plantilla «{p.nombre}» ({p.cursos.length} cursos{p.preguntas?.length ? ` · examen de ${p.preguntas.length} preguntas` : ''})
                        </option>
                      ))}
                    </select>
                    {plantillaCsvId && (
                      <p className="w-full text-[11px] text-slate-400 font-semibold leading-relaxed m-0">
                        {plantillas.find(p => p.id === plantillaCsvId)?.preguntas?.length
                          ? 'Esta plantilla incluye examen: el Excel saldrá con sus preguntas (P1, P2…) para marcar 1 = correcta / 0 = incorrecta, y las columnas + examen se crean en este salón automáticamente.'
                          : 'El Excel saldrá con esos cursos como columnas; al importarlo, las que le falten al salón se crean solas.'}
                      </p>
                    )}
                  </div>
                )}
                <button onClick={() => setPlantillaTipo('preguntas')}
                  className="w-full text-left rounded-2xl p-3.5 transition-all"
                  style={{
                    background: plantillaTipo === 'preguntas' ? '#eff6ff' : '#F8FAFC',
                    border: plantillaTipo === 'preguntas' ? '1.5px solid #1d4ed8' : '1.5px solid #E4E8EF',
                  }}>
                  <p className="text-xs font-black" style={{ color: '#0B2447' }}>Examen por preguntas (1 = correcta · 0 = incorrecta)</p>
                  <p className="text-[11px] text-slate-400 font-semibold mt-0.5 leading-relaxed">
                    Una columna por pregunta; cada correcta vale 1 punto. Se muestra el puntaje por área,
                    la nota final y el detalle ✓/✗ de cada pregunta.
                  </p>
                </button>
              </div>

              {/* Config de examen por preguntas */}
              {plantillaTipo === 'preguntas' && (
                <div className="space-y-3 rounded-2xl p-4" style={{ background: '#F8FAFC', border: '1.5px solid #E4E8EF' }}>
                  <input value={tituloExamen} onChange={e => setTituloExamen(e.target.value)}
                    placeholder="Nombre del examen (p. ej. Examen Bimestral I)"
                    className="w-full text-xs font-bold px-3 py-2 rounded-xl outline-none"
                    style={{ background: 'white', border: '1.5px solid #E4E8EF', color: '#0B2447' }} />
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-black text-slate-500">Número de preguntas:</label>
                    <input value={numPreguntas} inputMode="numeric"
                      onChange={e => { const v = e.target.value.replace(/\D/g, ''); if (v.length <= 3) setNumPreguntas(v) }}
                      className="w-16 text-center text-xs font-black px-2 py-1.5 rounded-lg outline-none"
                      style={{ background: 'white', border: '1.5px solid #E4E8EF', color: '#0B2447' }} />
                  </div>

                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Rangos por área</p>
                  {rangos.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-400">De</span>
                      <input value={r.desde} inputMode="numeric"
                        onChange={e => { const v = e.target.value.replace(/\D/g, ''); setRangos(rs => rs.map((x, j) => j === i ? { ...x, desde: v } : x)) }}
                        className="w-12 text-center text-xs font-black px-1 py-1.5 rounded-lg outline-none"
                        style={{ background: 'white', border: '1.5px solid #E4E8EF', color: '#0B2447' }} />
                      <span className="text-[11px] font-bold text-slate-400">a</span>
                      <input value={r.hasta} inputMode="numeric"
                        onChange={e => { const v = e.target.value.replace(/\D/g, ''); setRangos(rs => rs.map((x, j) => j === i ? { ...x, hasta: v } : x)) }}
                        className="w-12 text-center text-xs font-black px-1 py-1.5 rounded-lg outline-none"
                        style={{ background: 'white', border: '1.5px solid #E4E8EF', color: '#0B2447' }} />
                      <input value={r.area} placeholder="Área (p. ej. Matemática)"
                        onChange={e => setRangos(rs => rs.map((x, j) => j === i ? { ...x, area: e.target.value } : x))}
                        className="flex-1 min-w-32 text-xs font-bold px-3 py-1.5 rounded-lg outline-none"
                        style={{ background: 'white', border: '1.5px solid #E4E8EF', color: '#0B2447' }} />
                      {rangos.length > 1 && (
                        <button onClick={() => setRangos(rs => rs.filter((_, j) => j !== i))}
                          className="w-6 h-6 rounded-lg flex items-center justify-center hover:opacity-75"
                          style={{ background: '#fef2f2' }} title="Quitar rango">
                          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth="2.5">
                            <path d="M18 6 6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => {
                      const ultimo = rangos[rangos.length - 1]
                      const sig = parseInt(ultimo?.hasta || '0') + 1
                      setRangos(rs => [...rs, { desde: Number.isFinite(sig) && sig > 1 ? String(sig) : '', hasta: '', area: '' }])
                    }}
                    className="text-xs font-black px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                    style={{ background: '#eff6ff', color: '#1d4ed8', border: '1.5px solid #bfdbfe' }}>
                    + Agregar rango
                  </button>
                  <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                    Ejemplo: preguntas 1 a 3 → Matemática, 4 a 7 → Comunicación. Todas las preguntas deben tener área.
                    En la plantilla cada pregunta sale como «P1 [Matemática]» y marcas <b>1</b> si el alumno acertó
                    o <b>0</b> si falló (vacío cuenta como incorrecta). <b>Cada correcta vale 1 punto</b>: se muestra el
                    acumulado por área (p. ej. 3 puntos Matemática, 5 Comunicación), la nota final (total de puntos)
                    y el detalle pregunta por pregunta — visible también para padres y alumnos al publicar.
                  </p>
                </div>
              )}

              {plantillaErr && (
                <p className="text-xs font-bold" style={{ color: '#dc2626' }}>{plantillaErr}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setModalPlantilla(false)}
                  className="px-4 py-2 rounded-xl text-xs font-black transition-all hover:opacity-80"
                  style={{ background: '#F1F5F9', color: '#64748b' }}>
                  Cancelar
                </button>
                <button onClick={generarPlantilla}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', boxShadow: '0 3px 12px rgba(107,15,26,.25)' }}>
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  Descargar plantilla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dialogo}
    </div>
  )
}

export default function AdminNotasPage() {
  return <NotasContent />
}
