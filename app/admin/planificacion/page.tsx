'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import PortalShell from '@/components/PortalShell'
import { useConfirm } from '@/components/ConfirmModal'
import {
  TIPOS_SEMANA, FLUJO_CFG, metricasPlantilla, rangoSemana,
  type EstadoPlantilla, type TipoSemana,
} from '@/lib/planificacion'

// ── Tipos ──────────────────────────────────────────────────────────────────
interface Bimestre {
  id: string
  nombre: string
  anio: number
  periodo: number
  activo: boolean
  fecha_inicio: string | null
  fecha_fin: string | null
  semanas: number
}
interface Curso { id: string; nombre: string; color: string }
interface Asignacion { curso_id: string; grado: string; anio: number }
interface Plantilla {
  id: string
  curso_id: string
  grado: string
  ciclo_id: string
  descripcion: string | null
  situacion_significativa: string | null
  estado: EstadoPlantilla
}
interface PlantillaSesion {
  id: string
  plantilla_id: string
  semana: number
  titulo: string
  descripcion: string | null
  tipo: TipoSemana
  objetivo_id: string | null
}
interface PlanAnual {
  id: string
  curso_id: string
  grado: string
  anio: number
  objetivos: string | null
  modo_evaluacion: string | null
}
interface PlanObjetivo {
  id: string
  plan_id: string
  orden: number
  texto: string
}

const NAVY  = '#0B2447'
const NAVY2 = '#1E3A8A'
const STONE = '#f7f5f1'

const GRADOS_PRIMARIA   = ['1° Primaria','2° Primaria','3° Primaria','4° Primaria','5° Primaria','6° Primaria']
const GRADOS_SECUNDARIA = ['1° Secundaria','2° Secundaria','3° Secundaria','4° Secundaria','5° Secundaria']

// Suma N semanas a una fecha ISO (yyyy-mm-dd) y devuelve la fecha de cierre del bimestre (inclusive).
function sumarSemanas(inicioIso: string, semanas: number): string {
  const d = new Date(inicioIso + 'T00:00:00')
  d.setDate(d.getDate() + semanas * 7 - 1)
  return d.toISOString().slice(0, 10)
}

// Items del área "Académico" para la sidebar.
type SideItem = { id: string; label: string; href: string; soon?: boolean; current?: boolean }
const AREA_ITEMS: SideItem[] = [
  { id: 'cursos',          label: 'Cursos',                href: '/admin?tab=cursos&group=Acad%C3%A9mico' },
  { id: 'horario',         label: 'Horarios activos',      href: '/admin?tab=horario&group=Acad%C3%A9mico' },
  { id: 'planificacion',   label: 'Planificación de cursos', href: '/admin/planificacion', current: true },
  { id: 'horas-docente',   label: 'Horas Docente',         href: '/admin?tab=horas-docente&group=Acad%C3%A9mico' },
  { id: 'rol-bapes',       label: 'Rol de Clases',         href: '/admin?tab=rol-bapes&group=Acad%C3%A9mico' },
  { id: 'boletines',       label: 'Boletines',             href: '/admin?tab=boletines&group=Acad%C3%A9mico' },
]

type Vista = 'plantillas' | 'plan-anual' | 'editor'

export default function PlanificacionPage() {
  return <PlanificacionContent />
}

interface PlanificacionProps { embedded?: boolean }

export function PlanificacionContent({ embedded = false }: PlanificacionProps = {}) {
  const router = useRouter()

  const [loading, setLoading]       = useState(true)
  const [adminNombre, setAdminNombre] = useState('')
  const [anio, setAnio]             = useState<number>(new Date().getFullYear())
  const [bimestres, setBimestres]   = useState<Bimestre[]>([])
  const [cursos, setCursos]         = useState<Curso[]>([])
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [plantSesiones, setPlantSesiones] = useState<PlantillaSesion[]>([])
  const [planesAnuales, setPlanesAnuales] = useState<PlanAnual[]>([])
  const [objetivosPlan, setObjetivosPlan] = useState<PlanObjetivo[]>([])

  const [vista, setVista] = useState<Vista>('plantillas')
  const [editandoPlantilla, setEditandoPlantilla] = useState<{
    curso: Curso; grado: string; bimestre: Bimestre; plantilla: Plantilla | null
  } | null>(null)
  const [planAnualSel, setPlanAnualSel] = useState<{
    curso: Curso; grado: string; plan: PlanAnual
  } | null>(null)

  const [toast, setToast] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const { confirmar, dialogo } = useConfirm()

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('plan-sidebar-open') !== '0'
  })
  useEffect(() => {
    localStorage.setItem('plan-sidebar-open', sidebarOpen ? '1' : '0')
  }, [sidebarOpen])

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      if (!embedded) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { data: adm } = await supabase.from('user_admin').select('nombre').eq('id', user.id).maybeSingle()
        if (!adm) { router.push('/login'); return }
        setAdminNombre(adm.nombre ?? '')
      }
      await recargar(anio)
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function recargar(anioActual: number) {
    const [{ data: bs }, { data: cs }, { data: as_ }, { data: ps }, { data: pa }] = await Promise.all([
      supabase.from('ciclos')
        .select('id,nombre,anio,periodo,activo,fecha_inicio,fecha_fin,semanas')
        .eq('anio', anioActual)
        .eq('tipo', 'bimestre')
        .order('periodo'),
      supabase.from('cursos').select('id,nombre,color').order('nombre'),
      supabase.from('asignaciones').select('curso_id,grado,anio').eq('anio', anioActual),
      supabase.from('plantillas_curso').select('id,curso_id,grado,ciclo_id,descripcion,situacion_significativa,estado'),
      supabase.from('planes_anuales').select('id,curso_id,grado,anio,objetivos,modo_evaluacion').eq('anio', anioActual),
    ])
    setBimestres((bs ?? []) as Bimestre[])
    setCursos((cs ?? []) as Curso[])
    setAsignaciones((as_ ?? []) as Asignacion[])
    setPlantillas((ps ?? []) as Plantilla[])
    setPlanesAnuales((pa ?? []) as PlanAnual[])

    const ids = (ps ?? []).map(p => p.id)
    if (ids.length) {
      const { data: pss } = await supabase
        .from('plantilla_sesiones')
        .select('id,plantilla_id,semana,titulo,descripcion,tipo,objetivo_id')
        .in('plantilla_id', ids)
        .order('semana')
      setPlantSesiones((pss ?? []) as PlantillaSesion[])
    } else {
      setPlantSesiones([])
    }

    const planIds = (pa ?? []).map(p => p.id)
    if (planIds.length) {
      const { data: objs } = await supabase
        .from('plan_anual_objetivos')
        .select('id,plan_id,orden,texto')
        .in('plan_id', planIds)
        .order('orden')
      setObjetivosPlan((objs ?? []) as PlanObjetivo[])
    } else {
      setObjetivosPlan([])
    }
  }

  // ── Derivados ────────────────────────────────────────────────────────────
  // Grado x curso → cuántas asignaciones tiene (sirve para saber qué celdas mostrar)
  const cursoGrados = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const a of asignaciones) {
      if (!m.has(a.curso_id)) m.set(a.curso_id, new Set())
      m.get(a.curso_id)!.add(a.grado)
    }
    return m
  }, [asignaciones])

  const plantillaPorClave = useMemo(() => {
    const m = new Map<string, Plantilla>()
    for (const p of plantillas) m.set(`${p.curso_id}|${p.grado}|${p.ciclo_id}`, p)
    return m
  }, [plantillas])

  const sesionesPorPlantilla = useMemo(() => {
    const m = new Map<string, PlantillaSesion[]>()
    for (const s of plantSesiones) {
      const arr = m.get(s.plantilla_id) ?? []
      arr.push(s); m.set(s.plantilla_id, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.semana - b.semana)
    return m
  }, [plantSesiones])

  const planAnualPorClave = useMemo(() => {
    const m = new Map<string, PlanAnual>()
    for (const p of planesAnuales) m.set(`${p.curso_id}|${p.grado}|${p.anio}`, p)
    return m
  }, [planesAnuales])

  const objetivosPorPlan = useMemo(() => {
    const m = new Map<string, PlanObjetivo[]>()
    for (const o of objetivosPlan) {
      const arr = m.get(o.plan_id) ?? []
      arr.push(o); m.set(o.plan_id, arr)
    }
    return m
  }, [objetivosPlan])

  // ── Acciones bimestres ───────────────────────────────────────────────────
  async function nuevoBimestre() {
    const siguientePeriodo = (bimestres.reduce((max, b) => Math.max(max, b.periodo), 0) || 0) + 1
    const { error } = await supabase.from('ciclos').insert({
      nombre: `${anio}-B${siguientePeriodo}`,
      anio,
      periodo: siguientePeriodo,
      activo: false,
      tipo: 'bimestre',
      semanas: 10,
    })
    if (error) { setToast({ tipo: 'err', texto: error.message }); return }
    await recargar(anio)
    setToast({ tipo: 'ok', texto: `Bimestre B${siguientePeriodo} creado.` })
  }

  async function actualizarBimestre(id: string, patch: Partial<Bimestre>) {
    const { error } = await supabase.from('ciclos').update(patch).eq('id', id)
    if (error) { setToast({ tipo: 'err', texto: error.message }); return }
    await recargar(anio)
  }

  async function eliminarBimestre(id: string) {
    const b = bimestres.find(x => x.id === id)
    if (!b || trabajando) return
    const ok = await confirmar({
      titulo: 'Eliminar bimestre',
      mensaje: <>¿Seguro que quieres eliminar el bimestre <strong>{b.nombre}</strong>?
        Se borrarán sus plantillas. Las sesiones ya generadas en los cursos <em>no</em> se eliminan.</>,
      tono: 'peligro',
      confirmarLabel: 'Eliminar',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      const { error } = await supabase.from('ciclos').delete().eq('id', b.id)
      if (error) throw error
      await recargar(anio)
      setToast({ tipo: 'ok', texto: 'Bimestre eliminado.' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setToast({ tipo: 'err', texto: msg })
    } finally { setTrabajando(false) }
  }

  // ── Acciones plan anual ──────────────────────────────────────────────────
  // Al crear un plan anual, sembramos automáticamente la plantilla de cada bimestre
  // del año + sus N semanas. Idempotente: si ya hay plantillas, solo crea las faltantes.
  async function sembrarBimestresDelPlan(curso: Curso, grado: string) {
    const yaExistentes = new Set(
      plantillas.filter(p => p.curso_id === curso.id && p.grado === grado).map(p => p.ciclo_id)
    )
    const bimestresFaltantes = bimestres.filter(b => !yaExistentes.has(b.id))
    if (bimestresFaltantes.length === 0) return

    const filasPlantilla = bimestresFaltantes.map(b => ({
      curso_id: curso.id, grado, ciclo_id: b.id,
    }))
    const { data: nuevas, error: errIns } = await supabase
      .from('plantillas_curso')
      .insert(filasPlantilla)
      .select('id,curso_id,grado,ciclo_id,descripcion,situacion_significativa,estado')
    if (errIns || !nuevas) {
      setToast({ tipo: 'err', texto: errIns?.message ?? 'No se pudieron crear las plantillas de los bimestres' })
      return
    }

    const filasSesion: { plantilla_id: string; semana: number; titulo: string; descripcion: string }[] = []
    for (const np of nuevas) {
      const b = bimestresFaltantes.find(x => x.id === np.ciclo_id)
      if (!b) continue
      for (let i = 0; i < (b.semanas || 10); i++) {
        filasSesion.push({
          plantilla_id: np.id,
          semana: i + 1,
          titulo: `Semana ${i + 1}`,
          descripcion: '',
        })
      }
    }
    if (filasSesion.length) {
      await supabase.from('plantilla_sesiones').insert(filasSesion)
    }
  }

  // Crea los 4 bimestres estándar del año (B1–B4, 10 semanas c/u). El ciclo
  // lectivo (p.ej. 2026-1) es otra cosa: los bimestres son las unidades de
  // Planificación y viven en la misma tabla con tipo='bimestre'.
  async function crearBimestresDelAnio(): Promise<boolean> {
    const rows = [1, 2, 3, 4].map(p => ({
      nombre: `${anio}-B${p}`,
      anio,
      periodo: p,
      activo: false,
      tipo: 'bimestre',
      semanas: 10,
    }))
    const { error } = await supabase.from('ciclos').insert(rows)
    if (error) { setToast({ tipo: 'err', texto: `No se pudieron crear los bimestres: ${error.message}` }); return false }
    await recargar(anio)
    setToast({ tipo: 'ok', texto: `Bimestres B1–B4 de ${anio} creados. Ya puedes crear planes anuales.` })
    return true
  }

  async function abrirPlanAnual(curso: Curso, grado: string) {
    if (trabajando) return
    setTrabajando(true)
    try {
      const key = `${curso.id}|${grado}|${anio}`
      let plan = planAnualPorClave.get(key) ?? null
      let recienCreado = false

      // Primero garantiza que existan los 4 bimestres del año (si no hay).
      // El plan anual los necesita para sembrar plantillas.
      if (bimestres.length === 0) {
        if (!(await crearBimestresDelAnio())) return
      }

      if (!plan) {
        const { data: row, error } = await supabase
          .from('planes_anuales')
          .insert({ curso_id: curso.id, grado, anio })
          .select('id,curso_id,grado,anio,objetivos,modo_evaluacion')
          .single()
        if (error || !row) { setToast({ tipo: 'err', texto: error?.message ?? 'No se pudo crear el plan' }); return }
        plan = row as PlanAnual
        setPlanesAnuales(prev => [...prev, plan!])
        recienCreado = true
      }

      // Siembra las plantillas de cada bimestre (idempotente).
      await sembrarBimestresDelPlan(curso, grado)
      await recargar(anio)

      setPlanAnualSel({ curso, grado, plan })
      setVista('plan-anual')

      if (recienCreado) {
        setToast({ tipo: 'ok', texto: 'Plan anual creado con los bimestres listos para editar.' })
      }
    } finally { setTrabajando(false) }
  }

  async function actualizarPlanAnual(patch: Partial<PlanAnual>) {
    if (!planAnualSel) return
    setPlanesAnuales(prev => prev.map(p => p.id === planAnualSel.plan.id ? { ...p, ...patch } : p))
    setPlanAnualSel(prev => prev ? { ...prev, plan: { ...prev.plan, ...patch } } : prev)
    const { error } = await supabase.from('planes_anuales').update(patch).eq('id', planAnualSel.plan.id)
    if (error) setToast({ tipo: 'err', texto: error.message })
  }

  // Copia el plan del año anterior (bimestres, plantillas, semanas, objetivos y
  // evaluación) hacia el año seleccionado. Solo rellena lo que falta: nunca pisa
  // contenido ya escrito en el año destino.
  async function copiarDelAnioAnterior() {
    if (!planAnualSel || trabajando) return
    const { curso, grado, plan } = planAnualSel
    const ok = await confirmar({
      titulo: `Copiar plan de ${anio - 1}`,
      mensaje: <>Se copiarán a <strong>{anio}</strong> los bimestres, plantillas, semanas,
        objetivos y modo de evaluación de <strong>{curso.nombre} · {grado}</strong> del año {anio - 1}.
        Lo que ya exista en {anio} no se modifica.</>,
      tono: 'primario',
      confirmarLabel: 'Copiar',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      const { data, error } = await supabase.rpc('copiar_plan_anual', {
        p_curso_id: curso.id, p_grado: grado, p_anio_destino: anio,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      const partes = [
        row?.bimestres_creados ? `${row.bimestres_creados} bimestres` : null,
        row?.plantillas_copiadas ? `${row.plantillas_copiadas} plantillas` : null,
        row?.sesiones_copiadas ? `${row.sesiones_copiadas} semanas` : null,
        row?.plan_copiado ? 'objetivos y evaluación' : null,
      ].filter(Boolean)
      setToast({
        tipo: 'ok',
        texto: partes.length
          ? `Copiado desde ${anio - 1}: ${partes.join(', ')}.`
          : `No había nada nuevo que copiar desde ${anio - 1}.`,
      })
      await recargar(anio)
      const { data: planRow } = await supabase
        .from('planes_anuales')
        .select('id,curso_id,grado,anio,objetivos,modo_evaluacion')
        .eq('id', plan.id)
        .maybeSingle()
      if (planRow) setPlanAnualSel(prev => prev ? { ...prev, plan: planRow as PlanAnual } : prev)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setToast({ tipo: 'err', texto: `No se pudo copiar: ${msg}` })
    } finally { setTrabajando(false) }
  }

  // ── Objetivos estructurados del plan anual ───────────────────────────────
  // planes_anuales.objetivos (texto) es un espejo derivado que mantiene un
  // trigger de BD sobre plan_anual_objetivos; el cliente no lo toca.
  async function agregarObjetivo(planId: string) {
    const orden = objetivosPlan.filter(o => o.plan_id === planId).reduce((m, o) => Math.max(m, o.orden), 0) + 1
    const { data, error } = await supabase
      .from('plan_anual_objetivos')
      .insert({ plan_id: planId, orden, texto: '' })
      .select('id,plan_id,orden,texto')
      .single()
    if (error || !data) { setToast({ tipo: 'err', texto: error?.message ?? 'No se pudo crear el objetivo' }); return }
    setObjetivosPlan(prev => [...prev, data as PlanObjetivo])
  }

  async function actualizarObjetivo(id: string, texto: string) {
    setObjetivosPlan(prev => prev.map(o => o.id === id ? { ...o, texto } : o))
    const { error } = await supabase.from('plan_anual_objetivos').update({ texto }).eq('id', id)
    if (error) setToast({ tipo: 'err', texto: error.message })
  }

  async function quitarObjetivo(obj: PlanObjetivo) {
    const ok = await confirmar({
      titulo: '¿Quitar este objetivo?',
      mensaje: 'Las semanas vinculadas a él quedarán sin objetivo asignado. Esta acción no se puede deshacer.',
      tono: 'peligro',
      confirmarLabel: 'Quitar',
    })
    if (!ok) return
    const { error } = await supabase.from('plan_anual_objetivos').delete().eq('id', obj.id)
    if (error) { setToast({ tipo: 'err', texto: error.message }); return }
    setObjetivosPlan(prev => prev.filter(o => o.id !== obj.id))
    setPlantSesiones(prev => prev.map(s => s.objetivo_id === obj.id ? { ...s, objetivo_id: null } : s))
  }

  // ── Acciones plantillas ──────────────────────────────────────────────────
  async function abrirEditor(curso: Curso, grado: string, bimestre: Bimestre) {
    const key = `${curso.id}|${grado}|${bimestre.id}`
    let plantilla = plantillaPorClave.get(key) ?? null

    // Si no existe, la creamos con 10 sesiones default vacías
    if (!plantilla) {
      const { data: p, error } = await supabase
        .from('plantillas_curso')
        .insert({ curso_id: curso.id, grado, ciclo_id: bimestre.id })
        .select('id,curso_id,grado,ciclo_id,descripcion,situacion_significativa,estado')
        .single()
      if (error || !p) { setToast({ tipo: 'err', texto: error?.message ?? 'No se pudo crear la plantilla' }); return }
      const rows = Array.from({ length: bimestre.semanas }).map((_, i) => ({
        plantilla_id: p.id,
        semana: i + 1,
        titulo: `Semana ${i + 1}`,
        descripcion: '',
      }))
      await supabase.from('plantilla_sesiones').insert(rows)
      plantilla = p as Plantilla
      await recargar(anio)
    }

    setEditandoPlantilla({ curso, grado, bimestre, plantilla })
    setVista('editor')
  }

  async function actualizarPlantilla(id: string, patch: Partial<Plantilla>) {
    setPlantillas(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    setEditandoPlantilla(prev => prev && prev.plantilla?.id === id
      ? { ...prev, plantilla: { ...prev.plantilla!, ...patch } }
      : prev)
    const { error } = await supabase.from('plantillas_curso').update(patch).eq('id', id)
    if (error) setToast({ tipo: 'err', texto: error.message })
  }

  async function actualizarSesionTpl(id: string, patch: Partial<PlantillaSesion>) {
    setPlantSesiones(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
    const { error } = await supabase.from('plantilla_sesiones').update(patch).eq('id', id)
    if (error) setToast({ tipo: 'err', texto: error.message })
  }

  async function agregarSemana() {
    if (!editandoPlantilla?.plantilla) return
    const actuales = sesionesPorPlantilla.get(editandoPlantilla.plantilla.id) ?? []
    const siguiente = (actuales[actuales.length - 1]?.semana ?? 0) + 1
    const { error } = await supabase.from('plantilla_sesiones').insert({
      plantilla_id: editandoPlantilla.plantilla.id,
      semana: siguiente,
      titulo: `Semana ${siguiente}`,
      descripcion: '',
    })
    if (error) { setToast({ tipo: 'err', texto: error.message }); return }
    await recargar(anio)
  }

  async function quitarSemana(id: string) {
    if (!(await confirmar({
      titulo: '¿Quitar esta semana de la plantilla?',
      mensaje: 'Se elimina de la plantilla del bimestre. Las sesiones ya generadas en los cursos no se tocan.',
      tono: 'peligro', confirmarLabel: 'Quitar semana',
    }))) return
    const { error } = await supabase.from('plantilla_sesiones').delete().eq('id', id)
    if (error) { setToast({ tipo: 'err', texto: error.message }); return }
    await recargar(anio)
  }

  async function generarDesdePlantilla() {
    if (!editandoPlantilla?.plantilla || trabajando) return
    const yaPublicada = editandoPlantilla.plantilla.estado === 'publicada'
    const ok = await confirmar({
      titulo: yaPublicada ? '¿Regenerar sesiones?' : '¿Publicar esta plantilla?',
      mensaje: yaPublicada
        ? 'Se volverán a sembrar las semanas que falten en las asignaciones (las sesiones existentes no se tocan).'
        : 'Las semanas se sembrarán como sesiones a todos los docentes de este curso y grado, y la plantilla quedará publicada (los docentes ya no podrán editarla).',
      tono: yaPublicada ? 'primario' : 'advertencia',
      confirmarLabel: yaPublicada ? 'Regenerar' : 'Publicar',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      const { data, error } = await supabase.rpc('generar_sesiones_desde_plantilla', {
        p_plantilla_id: editandoPlantilla.plantilla.id,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      const asigs = row?.asignaciones_afectadas ?? 0
      const sess  = row?.sesiones_creadas ?? 0
      if (asigs === 0) {
        // El RPC no publica sin asignaciones: no hay a quién sembrar.
        setToast({ tipo: 'err', texto: 'Este curso y grado no tiene docentes asignados este año: no se sembró nada y la plantilla sigue editable.' })
        return
      }
      setToast({ tipo: 'ok', texto: `Se sembraron ${sess} sesiones en ${asigs} asignaciones. Plantilla publicada.` })
      // El RPC marca la plantilla como publicada: refleja el estado en la UI.
      setPlantillas(prev => prev.map(p => p.id === editandoPlantilla.plantilla!.id ? { ...p, estado: 'publicada' } : p))
      setEditandoPlantilla(prev => prev && prev.plantilla
        ? { ...prev, plantilla: { ...prev.plantilla, estado: 'publicada' } }
        : prev)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setToast({ tipo: 'err', texto: `Error al generar: ${msg}` })
    } finally { setTrabajando(false) }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    document.cookie = 'habich-rol=; path=/; max-age=0'
    router.push('/login')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    const loader = (
      <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
        Cargando bimestres y cursos…
      </div>
    )
    if (embedded) return loader
    return (
      <PortalShell title="Planificación de cursos" sectionTitle="Cargando…"
        onBack={() => router.push('/admin')} backLabel="Inicio">
        {loader}
      </PortalShell>
    )
  }

  const sectionTitle =
    vista === 'plantillas' ? `Planes anuales ${anio}` :
    vista === 'plan-anual' && planAnualSel
      ? `Plan anual · ${planAnualSel.curso.nombre} · ${planAnualSel.grado}`
      : editandoPlantilla
        ? `${editandoPlantilla.curso.nombre} · ${editandoPlantilla.grado} · B${editandoPlantilla.bimestre.periodo}`
        : 'Editor'

  // El cuerpo (tabs + contenido) es el mismo en standalone y embedded.
  // Embedded reusa el sidebar del propio /admin, así que no muestra el sidebar de área.
  const cuerpo = (
    <div className="flex-1 min-w-0 space-y-5">
      {/* Cabecera + selector de año (sin tabs: el plan anual gobierna todo) */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl"
            style={{ background: `linear-gradient(135deg,${NAVY},${NAVY2})`, color: 'white' }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Académico</p>
            <h1 className="text-base font-black" style={{ color: NAVY }}>Planes anuales</h1>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs font-bold text-slate-500">Año</label>
          <select value={anio}
            onChange={e => { const n = parseInt(e.target.value, 10); setAnio(n); recargar(n) }}
            className="px-3 py-2 rounded-xl text-sm font-bold border bg-white"
            style={{ borderColor: '#E4E8EF', color: NAVY }}>
            {[anio - 1, anio, anio + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {toast && (
        <div className="px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-between gap-3"
          style={{
            background: toast.tipo === 'ok' ? '#ECFDF5' : '#FEF2F2',
            color: toast.tipo === 'ok' ? '#065F46' : '#991B1B',
            border: `1px solid ${toast.tipo === 'ok' ? '#A7F3D0' : '#FECACA'}`,
          }}>
          <span>{toast.texto}</span>
          <button onClick={() => setToast(null)} className="text-xs">✕</button>
        </div>
      )}

      {vista === 'plantillas' && (
        <VistaPlantillas
          cursos={cursos}
          bimestres={bimestres}
          anio={anio}
          cursoGrados={cursoGrados}
          plantillaPorClave={plantillaPorClave}
          sesionesPorPlantilla={sesionesPorPlantilla}
          planAnualPorClave={planAnualPorClave}
          objetivosPorPlan={objetivosPorPlan}
          onAbrirPlanAnual={abrirPlanAnual}
          onCrearBimestres={crearBimestresDelAnio}
          trabajando={trabajando}
        />
      )}

      {vista === 'plan-anual' && planAnualSel && (
        <VistaPlanAnual
          ctx={planAnualSel}
          anio={anio}
          bimestres={bimestres}
          onNuevoBimestre={nuevoBimestre}
          onActualizarBimestre={actualizarBimestre}
          onEliminarBimestre={eliminarBimestre}
          trabajando={trabajando}
          plantillaPorClave={plantillaPorClave}
          sesionesPorPlantilla={sesionesPorPlantilla}
          objetivos={objetivosPorPlan.get(planAnualSel.plan.id) ?? []}
          onCambio={actualizarPlanAnual}
          onAgregarObjetivo={agregarObjetivo}
          onActualizarObjetivo={actualizarObjetivo}
          onQuitarObjetivo={quitarObjetivo}
          onAbrirEditor={abrirEditor}
          onCopiarAnterior={copiarDelAnioAnterior}
          onVolver={() => { setVista('plantillas'); setPlanAnualSel(null) }}
        />
      )}

      {vista === 'editor' && editandoPlantilla && (
        <VistaEditor
          ctx={editandoPlantilla}
          sesiones={sesionesPorPlantilla.get(editandoPlantilla.plantilla!.id) ?? []}
          objetivos={(() => {
            const plan = planAnualPorClave.get(`${editandoPlantilla.curso.id}|${editandoPlantilla.grado}|${anio}`)
            return plan ? (objetivosPorPlan.get(plan.id) ?? []) : []
          })()}
          onCambioSesion={actualizarSesionTpl}
          onCambioPlantilla={actualizarPlantilla}
          onAgregarSemana={agregarSemana}
          onQuitarSemana={quitarSemana}
          onGenerar={generarDesdePlantilla}
          onVolver={() => {
            if (planAnualSel) setVista('plan-anual')
            else setVista('plantillas')
            setEditandoPlantilla(null)
          }}
          trabajando={trabajando}
        />
      )}
    </div>
  )

  if (embedded) {
    return (
      <div className="space-y-5">
        {cuerpo}
        {dialogo}
      </div>
    )
  }

  return (
    <PortalShell
      title="Planificación de cursos"
      sectionTitle={sectionTitle}
      onBack={() => router.push('/admin')}
      backLabel="Inicio"
      userName={adminNombre}
      userRoleLabel="Administrador"
      onLogout={handleLogout}
      accent={NAVY}
      pageBg={STONE}
      maxWidth="100%"
    >
      <div className="flex gap-5 -mt-2">

        {/* ── Sidebar área Académico ───────────────────────────────────── */}
        {sidebarOpen && (
          <aside className="hidden lg:flex flex-col w-56 shrink-0 sticky self-start"
            style={{ top: 84, maxHeight: 'calc(100vh - 100px)' }}>
            <div className="rounded-2xl border bg-white overflow-hidden flex flex-col"
              style={{ borderColor: '#E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
              <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Área</p>
                  <p className="text-sm font-black" style={{ color: NAVY }}>Académico</p>
                </div>
                <button onClick={() => setSidebarOpen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                  title="Ocultar barra lateral">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7"/>
                  </svg>
                </button>
              </div>
              <div className="border-t border-slate-100 mx-3" />
              <nav className="px-2 py-2 space-y-0.5 overflow-y-auto">
                {AREA_ITEMS.map(it => {
                  if (it.soon) {
                    return (
                      <div key={it.id}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm"
                        style={{ color: '#cbd5e1', cursor: 'default' }}>
                        <span className="font-semibold">{it.label}</span>
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: '#f1f5f9', color: '#94a3b8' }}>
                          PRONTO
                        </span>
                      </div>
                    )
                  }
                  if (it.current) {
                    return (
                      <div key={it.id}
                        className="w-full flex items-center px-3 py-2 rounded-xl text-sm font-semibold"
                        style={{ background: `linear-gradient(135deg,${NAVY},${NAVY2})`, color: 'white', boxShadow: '0 4px 14px rgba(11,36,71,.22)' }}>
                        {it.label}
                      </div>
                    )
                  }
                  return (
                    <Link key={it.id} href={it.href}
                      className="w-full flex items-center px-3 py-2 rounded-xl text-sm font-semibold transition-colors"
                      style={{ color: '#57534e' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      {it.label}
                    </Link>
                  )
                })}
              </nav>
            </div>
          </aside>
        )}

        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)}
            className="hidden lg:flex shrink-0 w-9 self-start sticky items-center justify-center rounded-xl border bg-white hover:bg-slate-50 transition-colors"
            style={{ top: 84, height: 36, borderColor: '#E4E8EF', boxShadow: '0 2px 10px rgba(11,36,71,.06)', color: NAVY }}
            title="Mostrar barra lateral">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
            </svg>
          </button>
        )}

        {cuerpo}
      </div>

      {dialogo}
    </PortalShell>
  )
}

// ── Vista: Plantillas (grid curso×grado × bimestres) ─────────────────────
function VistaPlantillas({
  cursos, bimestres, anio, cursoGrados, plantillaPorClave, sesionesPorPlantilla, planAnualPorClave, objetivosPorPlan, onAbrirPlanAnual, onCrearBimestres, trabajando,
}: {
  cursos: Curso[]
  bimestres: Bimestre[]
  anio: number
  cursoGrados: Map<string, Set<string>>
  plantillaPorClave: Map<string, Plantilla>
  sesionesPorPlantilla: Map<string, PlantillaSesion[]>
  planAnualPorClave: Map<string, PlanAnual>
  objetivosPorPlan: Map<string, PlanObjetivo[]>
  onAbrirPlanAnual: (curso: Curso, grado: string) => void
  onCrearBimestres: () => Promise<boolean>
  trabajando: boolean
}) {
  const [nivelSel, setNivelSel] = useState<'' | 'Primaria' | 'Secundaria'>('')
  const [gradoSel, setGradoSel] = useState<string>('')
  const [cursoSel, setCursoSel] = useState<string>('')
  const [bimSel,   setBimSel]   = useState<string>('')   // '' = todos; si no, id del bimestre

  const bimestresVisibles = bimSel ? bimestres.filter(b => b.id === bimSel) : bimestres

  const gradosDelNivel = nivelSel === 'Primaria'
    ? GRADOS_PRIMARIA
    : nivelSel === 'Secundaria'
      ? GRADOS_SECUNDARIA
      : []

  // Filas (curso, grado) solo cuando hay nivel + grado seleccionados.
  // Una vez fijado el grado, solo hay un grado por fila → una fila por curso con asignación en ese grado.
  const filas = useMemo(() => {
    if (!nivelSel || !gradoSel) return [] as { curso: Curso; grado: string }[]
    const cursosFiltro = cursoSel ? cursos.filter(c => c.id === cursoSel) : cursos
    const out: { curso: Curso; grado: string }[] = []
    for (const c of cursosFiltro) {
      const grados = cursoGrados.get(c.id) ?? new Set<string>()
      if (grados.has(gradoSel)) out.push({ curso: c, grado: gradoSel })
    }
    return out
  }, [cursos, cursoSel, cursoGrados, nivelSel, gradoSel])

  if (bimestres.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-10 text-center"
        style={{ borderColor: '#E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
        <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center"
          style={{ background: '#F1F5F9', border: '1.5px solid #E4E8EF' }}>
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={NAVY} strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>
        <p className="text-sm font-black text-slate-800 mt-3">El año {anio} aún no tiene bimestres</p>
        <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
          El ciclo lectivo (p. ej. {anio}-1, donde se matricula) es una cosa; la planificación se
          organiza en <b>bimestres</b> (B1–B4). Créalos aquí mismo y luego arma los planes anuales.
        </p>
        <button onClick={() => onCrearBimestres()} disabled={trabajando}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-[.98] disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${NAVY}, #1E3A8A)`, boxShadow: '0 4px 16px rgba(11,36,71,.25)' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          Crear los 4 bimestres de {anio}
        </button>
        <p className="text-[11px] text-slate-400 mt-3">
          ¿Vienes de un año anterior con planes? Usa «Copiar año anterior» (arriba) y se crean
          bimestres, plantillas y planes de una sola vez.
        </p>
      </div>
    )
  }

  const filtroVacio = !nivelSel || !gradoSel

  return (
    <div className="space-y-5">
      {/* ── Barra de filtros: Nivel → Grado → Curso ───────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'white', border: '1px solid #E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
        <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b" style={{ borderColor: '#F1F5F9' }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={NAVY} strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
          </svg>
          <p className="text-xs font-black uppercase tracking-widest" style={{ color: NAVY }}>Filtrar planes anuales</p>
          {(!filtroVacio || bimSel) && (
            <button onClick={() => { setNivelSel(''); setGradoSel(''); setCursoSel(''); setBimSel('') }}
              className="ml-auto text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg transition-colors"
              style={{ color: '#64748B' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              Limpiar
            </button>
          )}
        </div>
        <div className="px-5 py-4 flex flex-wrap items-end gap-3">
          <FiltroSelect label="1 · Nivel" value={nivelSel}
            onChange={v => { setNivelSel(v as '' | 'Primaria' | 'Secundaria'); setGradoSel('') }}
            options={[{ v: '', t: '— Selecciona —' }, { v: 'Primaria', t: 'Primaria' }, { v: 'Secundaria', t: 'Secundaria' }]}
            minWidth={160} />

          <FiltroSelect label="2 · Grado" value={gradoSel}
            onChange={v => setGradoSel(v)} disabled={!nivelSel}
            options={[
              { v: '', t: nivelSel ? '— Selecciona —' : 'Elige nivel primero' },
              ...gradosDelNivel.map(g => ({ v: g, t: g })),
            ]}
            minWidth={180} />

          <FiltroSelect label="3 · Curso (opcional)" value={cursoSel}
            onChange={v => setCursoSel(v)} disabled={filtroVacio}
            options={[{ v: '', t: 'Todos los cursos' }, ...cursos.map(c => ({ v: c.id, t: c.nombre }))]}
            minWidth={210} />

          {/* 4 · Bimestre: chips para trabajar un bimestre a la vez */}
          <div className="flex flex-col">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">4 · Bimestre</label>
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: '#E4E8EF' }}>
              <button onClick={() => setBimSel('')}
                className="px-3.5 py-2.5 text-sm font-black transition-colors"
                style={bimSel === ''
                  ? { background: NAVY, color: '#fff' }
                  : { background: '#fff', color: '#64748B' }}>
                Todos
              </button>
              {bimestres.map(b => (
                <button key={b.id} onClick={() => setBimSel(bimSel === b.id ? '' : b.id)}
                  className="px-3.5 py-2.5 text-sm font-black transition-colors"
                  style={{
                    borderLeft: '1px solid #E4E8EF',
                    ...(bimSel === b.id
                      ? { background: NAVY, color: '#fff' }
                      : { background: '#fff', color: '#64748B' }),
                  }}>
                  B{b.periodo}
                </button>
              ))}
            </div>
          </div>

          {!filtroVacio && (
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              <ChipFiltro label={nivelSel} />
              <ChipFiltro label={gradoSel} />
              {cursoSel && <ChipFiltro label={cursos.find(c => c.id === cursoSel)?.nombre ?? ''} />}
              {bimSel && <ChipFiltro label={`Solo B${bimestres.find(b => b.id === bimSel)?.periodo ?? ''}`} />}
            </div>
          )}
        </div>
      </div>

      {filtroVacio ? (
        <EmptyState
          icon={
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
            </svg>
          }
          titulo="Aplica los filtros para ver planes anuales"
          texto="Elige nivel y grado en la barra superior. Cada plan anual cubre un curso × grado y contiene los 4 bimestres."
        />
      ) : filas.length === 0 ? (
        <EmptyState
          icon={
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          }
          titulo={`Sin cursos asignados a ${gradoSel}`}
          texto="Crea asignaciones de cursos en el panel admin para que aparezcan aquí."
        />
      ) : (
        <>
          <div className="flex items-center gap-3 px-1">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              {filas.length} {filas.length === 1 ? 'curso' : 'cursos'} · {bimSel
                ? `solo B${bimestres.find(b => b.id === bimSel)?.periodo ?? ''}`
                : `${bimestres.length} bimestres`}
            </p>
          </div>

          <div className="space-y-3">
            {filas.map(({ curso, grado }) => (
              <CardCurso key={`${curso.id}|${grado}`}
                curso={curso} grado={grado} anio={anio} bimestres={bimestresVisibles}
                plantillaPorClave={plantillaPorClave}
                sesionesPorPlantilla={sesionesPorPlantilla}
                planAnualPorClave={planAnualPorClave}
                objetivosPorPlan={objetivosPorPlan}
                onAbrirPlanAnual={onAbrirPlanAnual} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Componentes auxiliares de la vista Plantillas ───────────────────────
function FiltroSelect({
  label, value, onChange, options, disabled = false, minWidth = 160,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { v: string; t: string }[]
  disabled?: boolean
  minWidth?: number
}) {
  return (
    <div className="flex flex-col">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
      <div className="relative" style={{ minWidth }}>
        <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
          className="appearance-none w-full px-3.5 pr-9 py-2.5 rounded-xl text-sm font-bold border bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ borderColor: '#E4E8EF', color: value ? NAVY : '#94a3b8' }}>
          {options.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth="2.4"
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </div>
    </div>
  )
}

function ChipFiltro({ label }: { label: string }) {
  if (!label) return null
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest"
      style={{ background: '#EFF6FF', color: NAVY, border: '1px solid #DBEAFE' }}>
      {label}
    </span>
  )
}

function EmptyState({ icon, titulo, texto }: { icon: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div className="rounded-2xl border bg-white px-6 py-14 text-center"
      style={{ borderColor: '#E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
        style={{ background: '#EFF6FF', color: NAVY }}>
        {icon}
      </div>
      <h3 className="text-base font-black mb-1.5" style={{ color: NAVY }}>{titulo}</h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">{texto}</p>
    </div>
  )
}

function CardCurso({
  curso, grado, anio, bimestres, plantillaPorClave, sesionesPorPlantilla, planAnualPorClave, objetivosPorPlan, onAbrirPlanAnual,
}: {
  curso: Curso
  grado: string
  anio: number
  bimestres: Bimestre[]
  plantillaPorClave: Map<string, Plantilla>
  sesionesPorPlantilla: Map<string, PlantillaSesion[]>
  planAnualPorClave: Map<string, PlanAnual>
  objetivosPorPlan: Map<string, PlanObjetivo[]>
  onAbrirPlanAnual: (curso: Curso, grado: string) => void
}) {
  const plan = planAnualPorClave.get(`${curso.id}|${grado}|${anio}`)
  const tieneObjetivos = !!plan && (
    (objetivosPorPlan.get(plan.id) ?? []).some(o => o.texto.trim()) ||
    !!(plan.objetivos && plan.objetivos.trim())
  )
  const tieneEval = !!(plan?.modo_evaluacion && plan.modo_evaluacion.trim())

  return (
    <button onClick={() => onAbrirPlanAnual(curso, grado)}
      className="w-full text-left rounded-2xl overflow-hidden flex transition-all hover:-translate-y-0.5"
      style={{ background: 'white', border: '1px solid #E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 12px 32px rgba(11,36,71,.10)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(11,36,71,.05)' }}>
      {/* Stripe vertical color curso */}
      <div className="w-1.5 shrink-0" style={{ background: curso.color }} />

      <div className="flex-1 min-w-0 p-5">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-black" style={{ color: NAVY }}>{curso.nombre}</h3>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
              style={{ background: '#F1F5F9', color: '#475569' }}>
              {grado}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
              style={{ background: '#EFF6FF', color: NAVY, border: '1px solid #DBEAFE' }}>
              Plan {anio}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest" style={{ color: NAVY }}>
            {plan ? 'Abrir plan anual' : 'Crear plan anual'}
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </div>

        {/* Indicadores plan anual: objetivos + modo evaluación */}
        <div className="flex flex-wrap gap-2 mb-4">
          <BadgePlan label="Objetivos" definido={tieneObjetivos} />
          <BadgePlan label="Modo de evaluación" definido={tieneEval} />
        </div>

        <div className={bimestres.length === 1
          ? 'grid grid-cols-1 gap-2.5'
          : 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5'}>
          {bimestres.map(b => {
            const p = plantillaPorClave.get(`${curso.id}|${grado}|${b.id}`)
            const sesiones = p ? (sesionesPorPlantilla.get(p.id) ?? []) : []
            const m = metricasPlantilla(sesiones)
            const semanasObjetivo = b.semanas || 10
            return (
              <TileBimestre key={b.id} bimestre={b}
                tieneTpl={!!p} flujo={p?.estado}
                cant={m.cant} personalizadas={m.personalizadas}
                evaluaciones={m.evaluaciones} objetivo={semanasObjetivo} />
            )
          })}
        </div>
      </div>
    </button>
  )
}

function BadgePlan({ label, definido }: { label: string; definido: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest"
      style={
        definido
          ? { background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }
          : { background: '#FAFAF9', color: '#78716C', border: '1px dashed #D6D3D1' }
      }>
      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
        {definido
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          : <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
        }
      </svg>
      {label}
    </span>
  )
}

function TileBimestre({
  bimestre, tieneTpl, cant, personalizadas, evaluaciones, objetivo, flujo, onClick, interactivo = false,
}: {
  bimestre: Bimestre
  tieneTpl: boolean
  cant: number
  personalizadas: number
  evaluaciones: number
  objetivo: number
  flujo?: EstadoPlantilla
  onClick?: () => void
  interactivo?: boolean
}) {
  // Estados: empty | borrador (todas con "Semana N") | parcial | sin-eval
  // (títulos completos pero ninguna semana de evaluación) | lista
  const estado: 'empty' | 'borrador' | 'parcial' | 'sin-eval' | 'lista' = !tieneTpl
    ? 'empty'
    : personalizadas === 0
      ? 'borrador'
      : personalizadas >= Math.max(cant, 1)
        ? (evaluaciones > 0 ? 'lista' : 'sin-eval')
        : 'parcial'

  const cfg = {
    empty:      { bg: 'white',                                    border: '1px dashed #CBD5E1', color: '#64748B', tag: 'CREAR',       tagBg: '#F1F5F9', tagColor: '#64748B' },
    borrador:   { bg: 'linear-gradient(135deg,#FAFAF9,#F5F5F4)',  border: '1px solid #E4E8EF', color: NAVY,      tag: 'BORRADOR',    tagBg: '#FEF3C7', tagColor: '#92400E' },
    parcial:    { bg: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)',  border: '1px solid #BFDBFE', color: NAVY,      tag: 'EN PROGRESO', tagBg: '#DBEAFE', tagColor: NAVY },
    'sin-eval': { bg: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)',  border: '1px solid #FDE68A', color: '#92400E', tag: 'FALTA EVAL.', tagBg: '#FDE68A', tagColor: '#92400E' },
    lista:      { bg: 'linear-gradient(135deg,#ECFDF5,#D1FAE5)',  border: '1px solid #A7F3D0', color: '#065F46', tag: 'LISTA',       tagBg: '#A7F3D0', tagColor: '#065F46' },
  }[estado]

  const progreso = objetivo > 0 ? Math.min(1, personalizadas / objetivo) : 0

  const inner = (
    <>
      <div className="flex items-center justify-between mb-2 gap-1">
        <span className="font-black text-[13px]">{bimestre.nombre}</span>
        <span className="flex items-center gap-1">
          {flujo === 'revision' && (
            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md"
              style={{ background: '#EDE9FE', color: '#5B21B6' }} title="Un docente la envió a revisión">
              REV.
            </span>
          )}
          {flujo === 'publicada' && (
            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md"
              style={{ background: '#E0F2FE', color: '#075985' }} title="Sesiones ya sembradas a los docentes">
              PUBL.
            </span>
          )}
          <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md"
            style={{ background: cfg.tagBg, color: cfg.tagColor }}>
            {cfg.tag}
          </span>
        </span>
      </div>

      {tieneTpl ? (
        <>
          <p className="text-[11px] font-bold opacity-80 mb-2">
            {cant} {cant === 1 ? 'sesión' : 'sesiones'} · {personalizadas}/{objetivo} con título · {evaluaciones} eval
          </p>
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(15,23,42,.08)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${progreso * 100}%`, background: estado === 'lista' ? '#10B981' : NAVY }} />
          </div>
        </>
      ) : (
        <div className="flex items-center gap-1.5 mt-1">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          <span className="text-[11px] font-bold">Crear plantilla</span>
        </div>
      )}
    </>
  )

  if (interactivo && onClick) {
    return (
      <button onClick={onClick}
        className="text-left rounded-xl p-3.5 transition-all hover:-translate-y-0.5"
        style={{ background: cfg.bg, border: cfg.border, color: cfg.color, boxShadow: '0 1px 3px rgba(15,23,42,.04)' }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(11,36,71,.10)' }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(15,23,42,.04)' }}>
        {inner}
      </button>
    )
  }
  return (
    <div className="rounded-xl p-3.5"
      style={{ background: cfg.bg, border: cfg.border, color: cfg.color }}>
      {inner}
    </div>
  )
}

// ── Vista: Plan anual del curso ──────────────────────────────────────────
function VistaPlanAnual({
  ctx, anio, bimestres, plantillaPorClave, sesionesPorPlantilla, objetivos,
  onCambio, onAgregarObjetivo, onActualizarObjetivo, onQuitarObjetivo,
  onAbrirEditor, onCopiarAnterior, onVolver,
  onNuevoBimestre, onActualizarBimestre, onEliminarBimestre, trabajando,
}: {
  ctx: { curso: Curso; grado: string; plan: PlanAnual }
  anio: number
  bimestres: Bimestre[]
  plantillaPorClave: Map<string, Plantilla>
  sesionesPorPlantilla: Map<string, PlantillaSesion[]>
  objetivos: PlanObjetivo[]
  onCambio: (patch: Partial<PlanAnual>) => void
  onAgregarObjetivo: (planId: string) => void
  onActualizarObjetivo: (id: string, texto: string) => void
  onQuitarObjetivo: (obj: PlanObjetivo) => void
  onAbrirEditor: (curso: Curso, grado: string, bimestre: Bimestre) => void
  onCopiarAnterior: () => void
  onVolver: () => void
  onNuevoBimestre: () => void
  onActualizarBimestre: (id: string, patch: Partial<Bimestre>) => void
  onEliminarBimestre: (id: string) => void
  trabajando: boolean
}) {
  const { curso, grado, plan } = ctx

  // Cobertura de objetivos en una sola pasada: objetivo → bimestres que lo
  // trabajan, y cuántas semanas (no feriado) siguen sin objetivo vinculado.
  const { cubiertosPorObjetivo, semanasSinObjetivo } = useMemo(() => {
    const cub = new Map<string, Set<number>>()
    let sin = 0
    for (const b of bimestres) {
      const p = plantillaPorClave.get(`${curso.id}|${grado}|${b.id}`)
      const ses = p ? (sesionesPorPlantilla.get(p.id) ?? []) : []
      for (const s of ses) {
        if (s.objetivo_id) {
          const set = cub.get(s.objetivo_id) ?? new Set<number>()
          set.add(b.periodo)
          cub.set(s.objetivo_id, set)
        } else if (s.tipo !== 'feriado') {
          sin++
        }
      }
    }
    return { cubiertosPorObjetivo: cub, semanasSinObjetivo: sin }
  }, [bimestres, plantillaPorClave, sesionesPorPlantilla, curso.id, grado])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onVolver}
          className="px-3 py-2 rounded-xl text-xs font-bold border bg-white hover:bg-slate-50"
          style={{ borderColor: '#E4E8EF', color: NAVY }}>
          ← Volver a plantillas
        </button>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button onClick={onCopiarAnterior} disabled={trabajando}
            className="px-3 py-2 rounded-xl text-xs font-bold border bg-white hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5"
            style={{ borderColor: '#E4E8EF', color: NAVY }}
            title={`Copia bimestres, plantillas y objetivos de ${anio - 1} sin pisar lo ya escrito`}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            Copiar plan de {anio - 1}
          </button>
          <button onClick={() => window.print()}
            className="px-3 py-2 rounded-xl text-xs font-bold border bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"
            style={{ borderColor: '#E4E8EF', color: NAVY }}
            title="Imprime o guarda como PDF la programación anual completa">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
            </svg>
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Versión imprimible (solo visible al imprimir / guardar PDF) */}
      <PrintPlanAnual curso={curso} grado={grado} anio={anio} plan={plan}
        bimestres={bimestres} plantillaPorClave={plantillaPorClave}
        sesionesPorPlantilla={sesionesPorPlantilla} objetivos={objetivos} />

      {/* Cabecera curso */}
      <div className="rounded-2xl overflow-hidden flex"
        style={{ background: 'white', border: '1px solid #E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
        <div className="w-1.5 shrink-0" style={{ background: curso.color }} />
        <div className="flex-1 min-w-0 p-5">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Plan anual</p>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
              style={{ background: '#EFF6FF', color: NAVY, border: '1px solid #DBEAFE' }}>
              {anio}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-black" style={{ color: NAVY }}>{curso.nombre}</h2>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
              style={{ background: '#F1F5F9', color: '#475569' }}>{grado}</span>
          </div>
        </div>
      </div>

      {/* Objetivos del año */}
      <SeccionPlan
        icon={
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="6"/>
            <circle cx="12" cy="12" r="2" fill="currentColor"/>
          </svg>
        }
        eyebrow="Resultados esperados"
        titulo="Objetivos del año"
        descripcion="¿Qué aprenderán los alumnos al terminar el año en este curso? Un objetivo por fila; luego vincula cada semana con su objetivo desde el editor del bimestre.">
        <div className="space-y-2">
          {objetivos.map(o => {
            // Bimestres donde alguna semana está vinculada a este objetivo
            const cubiertos = cubiertosPorObjetivo.get(o.id) ?? new Set<number>()
            return (
              <div key={o.id} className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-black shrink-0"
                  style={{ background: '#EFF6FF', color: NAVY, border: '1px solid #DBEAFE' }}>
                  {o.orden}
                </span>
                <input defaultValue={o.texto}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== o.texto) onActualizarObjetivo(o.id, v) }}
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl border text-sm bg-white"
                  style={{ borderColor: '#E4E8EF', color: '#0F172A' }}
                  placeholder="Ej: Resolver problemas con fracciones y decimales en situaciones reales" />
                {/* Mapa de alineación: en qué bimestres se trabaja este objetivo */}
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  {bimestres.map(b => (
                    <span key={b.id}
                      title={cubiertos.has(b.periodo)
                        ? `Se trabaja en ${b.nombre}`
                        : `Ninguna semana de ${b.nombre} está vinculada a este objetivo`}
                      className="inline-flex items-center justify-center w-7 h-6 rounded-md text-[9px] font-black"
                      style={cubiertos.has(b.periodo)
                        ? { background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }
                        : { background: '#FAFAF9', color: '#A8A29E', border: '1px dashed #D6D3D1' }}>
                      B{b.periodo}
                    </span>
                  ))}
                </div>
                <button onClick={() => onQuitarObjetivo(o)}
                  className="w-7 h-7 rounded-lg border bg-white hover:bg-red-50 text-xs font-black shrink-0"
                  style={{ borderColor: '#FECACA', color: '#991B1B' }}
                  title="Quitar objetivo">
                  ✕
                </button>
              </div>
            )
          })}

          <button onClick={() => onAgregarObjetivo(plan.id)} disabled={trabajando}
            className="w-full rounded-xl border-dashed border-2 py-2.5 text-xs font-bold transition-colors disabled:opacity-50"
            style={{ borderColor: '#CBD5E1', color: NAVY, background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            + Añadir objetivo
          </button>

          {objetivos.length > 0 && (semanasSinObjetivo > 0 ? (
            <p className="text-[11px] font-bold px-1" style={{ color: '#B45309' }}>
              ⚠ {semanasSinObjetivo} {semanasSinObjetivo === 1 ? 'semana' : 'semanas'} del año aún sin objetivo vinculado.
            </p>
          ) : (
            <p className="text-[11px] font-bold px-1" style={{ color: '#065F46' }}>
              ✓ Todas las semanas están vinculadas a un objetivo.
            </p>
          ))}
        </div>
      </SeccionPlan>

      {/* Modo de evaluación */}
      <SeccionPlan
        icon={
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6m-6 4h4"/>
          </svg>
        }
        eyebrow="Cómo se califica"
        titulo="Modo de evaluación"
        descripcion="Criterios, instrumentos y pesos. Ej: exámenes 40%, prácticas 30%, participación 20%, proyecto 10%.">
        <textarea key={`me-${plan.id}-${plan.modo_evaluacion ?? ''}`} defaultValue={plan.modo_evaluacion ?? ''}
          onBlur={e => { const v = e.target.value; if (v !== (plan.modo_evaluacion ?? '')) onCambio({ modo_evaluacion: v }) }}
          rows={5}
          className="w-full px-3.5 py-3 rounded-xl border text-sm bg-white resize-y leading-relaxed"
          style={{ borderColor: '#E4E8EF', color: '#0F172A' }}
          placeholder="Ej:&#10;• Examen bimestral — 40%&#10;• Prácticas calificadas — 30%&#10;• Trabajos y participación — 20%&#10;• Proyecto integrador — 10%" />
      </SeccionPlan>

      {/* Bimestres — tiles para entrar a editar plantillas */}
      <SeccionPlan
        icon={
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        }
        eyebrow={`${bimestres.length} ${bimestres.length === 1 ? 'bimestre' : 'bimestres'}`}
        titulo="Bimestres del año"
        descripcion="Click en un bimestre para editar las semanas (título + descripción) que se sembrarán a los docentes.">
        {bimestres.length === 0 ? (
          <p className="text-sm text-slate-500">No hay bimestres definidos para {anio}.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {bimestres.map(b => {
              const p = plantillaPorClave.get(`${curso.id}|${grado}|${b.id}`)
              const sesiones = p ? (sesionesPorPlantilla.get(p.id) ?? []) : []
              const m = metricasPlantilla(sesiones)
              const semanasObjetivo = b.semanas || 10
              return (
                <TileBimestre key={b.id} bimestre={b}
                  tieneTpl={!!p} flujo={p?.estado}
                  cant={m.cant} personalizadas={m.personalizadas}
                  evaluaciones={m.evaluaciones} objetivo={semanasObjetivo}
                  interactivo onClick={() => onAbrirEditor(curso, grado, b)} />
              )
            })}
          </div>
        )}
      </SeccionPlan>

      {/* Calendario del año — gestionar nombre, fechas, semanas, activación */}
      <SeccionPlan
        icon={
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        }
        eyebrow={`Calendario · ${anio}`}
        titulo="Fechas y duración de los bimestres"
        descripcion="Estos datos aplican a todo el colegio. Al ingresar la fecha de inicio se autocalcula la fecha de fin con las semanas configuradas.">
        <CalendarioBimestres
          bimestres={bimestres}
          onNuevo={onNuevoBimestre}
          onActualizar={onActualizarBimestre}
          onEliminar={onEliminarBimestre}
          trabajando={trabajando}
        />
      </SeccionPlan>
    </div>
  )
}

function CalendarioBimestres({
  bimestres, onNuevo, onActualizar, onEliminar, trabajando,
}: {
  bimestres: Bimestre[]
  onNuevo: () => void
  onActualizar: (id: string, patch: Partial<Bimestre>) => void
  onEliminar: (id: string) => void
  trabajando: boolean
}) {
  // El bimestre "en curso" se deriva de sus fechas; ya no existe un flag
  // activo para bimestres (ese flag es exclusivo del ciclo lectivo/matrículas).
  const hoy = new Date().toISOString().slice(0, 10)
  return (
    <div className="space-y-2">
      {bimestres.map(b => (
        <div key={b.id} className="rounded-xl border bg-white p-3 flex flex-wrap items-end gap-3"
          style={{ borderColor: '#E4E8EF' }}>
          <div className="flex flex-col">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Nombre</label>
            <input defaultValue={b.nombre}
              onBlur={e => { const v = e.target.value.trim(); if (v && v !== b.nombre) onActualizar(b.id, { nombre: v }) }}
              className="px-2.5 py-1.5 rounded-lg border text-sm font-bold bg-white w-28"
              style={{ borderColor: '#E4E8EF', color: NAVY }} />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Inicio</label>
            <input type="date" defaultValue={b.fecha_inicio ?? ''}
              onBlur={e => {
                const v = e.target.value || null
                if (v === (b.fecha_inicio ?? null)) return
                const patch: Partial<Bimestre> = { fecha_inicio: v }
                if (v && !b.fecha_fin) patch.fecha_fin = sumarSemanas(v, b.semanas)
                onActualizar(b.id, patch)
              }}
              className="px-2.5 py-1.5 rounded-lg border text-xs bg-white"
              style={{ borderColor: '#E4E8EF' }} />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Fin</label>
            <input type="date" defaultValue={b.fecha_fin ?? ''}
              onBlur={e => { const v = e.target.value || null; if (v !== (b.fecha_fin ?? null)) onActualizar(b.id, { fecha_fin: v }) }}
              className="px-2.5 py-1.5 rounded-lg border text-xs bg-white"
              style={{ borderColor: '#E4E8EF' }} />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Semanas</label>
            <input type="number" min={1} max={40} defaultValue={b.semanas}
              onBlur={e => {
                const n = Math.max(1, parseInt(e.target.value || '10', 10))
                if (n === b.semanas) return
                const patch: Partial<Bimestre> = { semanas: n }
                if (b.fecha_inicio && !b.fecha_fin) patch.fecha_fin = sumarSemanas(b.fecha_inicio, n)
                onActualizar(b.id, patch)
              }}
              className="w-16 px-2.5 py-1.5 rounded-lg border text-xs bg-white"
              style={{ borderColor: '#E4E8EF' }} />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Estado</label>
            {b.fecha_inicio && b.fecha_fin && b.fecha_inicio <= hoy && hoy <= b.fecha_fin ? (
              <span className="px-2 py-1.5 rounded-lg text-[10px] font-black"
                style={{ background: '#DCFCE7', color: '#166534' }}>EN CURSO</span>
            ) : (
              <span className="px-2 py-1.5 rounded-lg text-[10px] font-bold"
                style={{ background: '#F1F5F9', color: '#64748B' }}>
                {b.fecha_fin && b.fecha_fin < hoy ? 'Cerrado' : 'Por fechas'}
              </span>
            )}
          </div>
          <button onClick={() => onEliminar(b.id)}
            className="ml-auto px-2.5 py-1.5 rounded-lg text-[10px] font-bold border bg-white hover:bg-red-50 self-end"
            style={{ borderColor: '#FECACA', color: '#991B1B' }}>
            Eliminar
          </button>
        </div>
      ))}

      <button onClick={onNuevo} disabled={trabajando}
        className="w-full rounded-xl border-dashed border-2 py-3 text-sm font-bold transition-colors disabled:opacity-50"
        style={{ borderColor: '#CBD5E1', color: NAVY, background: 'transparent' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
        + Añadir bimestre
      </button>
    </div>
  )
}

function SeccionPlan({
  icon, eyebrow, titulo, descripcion, children,
}: {
  icon: React.ReactNode
  eyebrow: string
  titulo: string
  descripcion: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl bg-white p-5"
      style={{ border: '1px solid #E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
      <div className="flex items-start gap-3 mb-4">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
          style={{ background: '#EFF6FF', color: NAVY }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{eyebrow}</p>
          <h3 className="text-base font-black mb-0.5" style={{ color: NAVY }}>{titulo}</h3>
          <p className="text-xs text-slate-500 leading-relaxed">{descripcion}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Vista: Editor de plantilla ───────────────────────────────────────────
function VistaEditor({
  ctx, sesiones, objetivos, onCambioSesion, onCambioPlantilla, onAgregarSemana, onQuitarSemana, onGenerar, onVolver, trabajando,
}: {
  ctx: { curso: Curso; grado: string; bimestre: Bimestre; plantilla: Plantilla | null }
  sesiones: PlantillaSesion[]
  objetivos: PlanObjetivo[]
  onCambioSesion: (id: string, patch: Partial<PlantillaSesion>) => void
  onCambioPlantilla: (id: string, patch: Partial<Plantilla>) => void
  onAgregarSemana: () => void
  onQuitarSemana: (id: string) => void
  onGenerar: () => void
  onVolver: () => void
  trabajando: boolean
}) {
  const plantilla = ctx.plantilla
  const flujo = FLUJO_CFG[plantilla?.estado ?? 'borrador']
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onVolver}
          className="px-3 py-2 rounded-xl text-xs font-bold border bg-white hover:bg-slate-50"
          style={{ borderColor: '#E4E8EF', color: NAVY }}>
          ← Volver
        </button>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button onClick={onAgregarSemana}
            className="px-3 py-2 rounded-xl text-xs font-bold border bg-white hover:bg-slate-50"
            style={{ borderColor: '#E4E8EF', color: NAVY }}>
            + Añadir semana
          </button>
          {plantilla?.estado === 'publicada' && (
            <button onClick={() => onCambioPlantilla(plantilla.id, { estado: 'borrador' })} disabled={trabajando}
              className="px-3 py-2 rounded-xl text-xs font-bold border bg-white hover:bg-slate-50 disabled:opacity-50"
              style={{ borderColor: '#E4E8EF', color: NAVY }}
              title="Vuelve la plantilla a borrador para que los docentes puedan editarla otra vez">
              Reabrir para edición
            </button>
          )}
          <button onClick={onGenerar} disabled={trabajando}
            className="px-4 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${NAVY},${NAVY2})`, boxShadow: '0 4px 14px rgba(11,36,71,.22)' }}>
            {trabajando
              ? 'Generando…'
              : plantilla?.estado === 'publicada'
                ? 'Regenerar sesiones'
                : 'Publicar y generar sesiones'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden flex"
        style={{ background: 'white', border: '1px solid #E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
        <div className="w-1.5 shrink-0" style={{ background: ctx.curso.color }} />
        <div className="flex-1 min-w-0 p-5">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h2 className="text-lg font-black" style={{ color: NAVY }}>{ctx.curso.nombre}</h2>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
              style={{ background: '#F1F5F9', color: '#475569' }}>{ctx.grado}</span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
              style={{ background: '#EFF6FF', color: NAVY, border: '1px solid #DBEAFE' }}>{ctx.bimestre.nombre}</span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
              style={{ background: flujo.bg, color: flujo.color }}>{flujo.t}</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-4">
            Las sesiones que aquí definas se sembrarán como unidad «Bimestre {ctx.bimestre.periodo} — {ctx.curso.nombre}»
            en todas las asignaciones del año para este curso y grado. El docente podrá editar título y descripción después.
          </p>

          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
            Situación significativa del bimestre
          </label>
          <textarea
            key={`ss-${plantilla?.id ?? 'none'}`}
            defaultValue={plantilla?.situacion_significativa ?? ''}
            onBlur={e => {
              if (!plantilla) return
              const v = e.target.value
              if (v !== (plantilla.situacion_significativa ?? '')) {
                onCambioPlantilla(plantilla.id, { situacion_significativa: v || null })
              }
            }}
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl border text-sm bg-white resize-y"
            style={{ borderColor: '#E4E8EF', lineHeight: 1.5 }}
            placeholder="Contexto o experiencia que da sentido a la unidad y conecta el aprendizaje con la realidad del estudiante (formato MINEDU)…" />
        </div>
      </div>

      {sesiones.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center"
          style={{ borderColor: '#E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
          <p className="text-sm text-slate-500">Esta plantilla no tiene semanas todavía. Añade una para empezar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sesiones.map(s => {
            const rango = rangoSemana(ctx.bimestre.fecha_inicio, s.semana)
            return (
              <div key={s.id} className="rounded-2xl border bg-white p-5"
                style={{ borderColor: '#E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase"
                      style={{ background: `linear-gradient(135deg,${NAVY},${NAVY2})`, color: 'white' }}>
                      Semana {s.semana}
                    </span>
                    {rango && (
                      <span className="text-[11px] font-bold text-slate-500">{rango}</span>
                    )}
                    {/* Tipo de semana: clase / evaluación / repaso / feriado */}
                    <div className="flex items-center gap-1">
                      {TIPOS_SEMANA.map(t => {
                        const activo = (s.tipo ?? 'clase') === t.v
                        return (
                          <button key={t.v}
                            onClick={() => { if (!activo) onCambioSesion(s.id, { tipo: t.v }) }}
                            className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                            style={activo
                              ? { background: t.bg, color: t.color, border: `1px solid ${t.borde}` }
                              : { background: 'white', color: '#94A3B8', border: '1px solid #F1F5F9' }}>
                            {t.t}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <button onClick={() => onQuitarSemana(s.id)}
                    className="px-2 py-1.5 rounded-lg text-[11px] font-bold border bg-white hover:bg-red-50"
                    style={{ borderColor: '#FECACA', color: '#991B1B' }}>
                    Quitar
                  </button>
                </div>

                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  Título de la sesión
                </label>
                <input defaultValue={s.titulo}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.titulo) onCambioSesion(s.id, { titulo: v }) }}
                  className="w-full px-3 py-2.5 rounded-xl border bg-white font-bold mb-4"
                  style={{ borderColor: '#E4E8EF', color: NAVY, fontSize: 15 }}
                  placeholder="Ej: Introducción a las fracciones" />

                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  Descripción de la clase
                </label>
                <textarea defaultValue={s.descripcion ?? ''}
                  onBlur={e => { const v = e.target.value; if (v !== (s.descripcion ?? '')) onCambioSesion(s.id, { descripcion: v }) }}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm bg-white resize-y"
                  style={{ borderColor: '#E4E8EF', lineHeight: 1.5 }}
                  placeholder="¿De qué trata la clase? Tema, objetivos, actividades, materiales que el docente usará…" />

                {objetivos.length > 0 && (
                  <>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 mt-4">
                      Objetivo del año que trabaja esta semana
                    </label>
                    <select value={s.objetivo_id ?? ''}
                      onChange={e => onCambioSesion(s.id, { objetivo_id: e.target.value || null })}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm bg-white font-semibold"
                      style={{ borderColor: '#E4E8EF', color: s.objetivo_id ? NAVY : '#94a3b8' }}>
                      <option value="">— Sin vincular —</option>
                      {objetivos.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.orden}. {o.texto || '(objetivo sin texto)'}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Versión imprimible del plan anual (formato programación anual) ───────
// Oculta en pantalla; al imprimir (Exportar PDF) es lo único visible.
function PrintPlanAnual({
  curso, grado, anio, plan, bimestres, plantillaPorClave, sesionesPorPlantilla, objetivos,
}: {
  curso: Curso
  grado: string
  anio: number
  plan: PlanAnual
  bimestres: Bimestre[]
  plantillaPorClave: Map<string, Plantilla>
  sesionesPorPlantilla: Map<string, PlantillaSesion[]>
  objetivos: PlanObjetivo[]
}) {
  const fmtFecha = (iso: string | null) =>
    iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'long' }) : '—'
  const objetivosLineas = objetivos.length
    ? objetivos.map(o => o.texto)
    : (plan.objetivos ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  const th: React.CSSProperties = {
    border: '1px solid #999', padding: '4px 6px', fontSize: 10, textAlign: 'left',
    background: '#eee', textTransform: 'uppercase', letterSpacing: '.04em',
  }
  const td: React.CSSProperties = { border: '1px solid #999', padding: '4px 6px', fontSize: 11, verticalAlign: 'top' }

  return (
    <>
      <style>{`
        #print-plan { display: none; }
        @media print {
          body * { visibility: hidden; }
          #print-plan, #print-plan * { visibility: visible; }
          #print-plan {
            display: block !important;
            position: absolute; left: 0; top: 0; width: 100%;
            background: white; color: #111; padding: 24px;
          }
          #print-plan .salto { break-inside: avoid; }
          @page { size: A4 portrait; margin: 14mm; }
        }
      `}</style>
      <div id="print-plan">
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <p style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', margin: 0 }}>
            Colegio Eduardo de Habich · Juliaca · Puno
          </p>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: '6px 0 0' }}>PROGRAMACIÓN ANUAL {anio}</h1>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '2px 0 0' }}>{curso.nombre} — {grado}</p>
        </div>

        <h2 style={{ fontSize: 13, fontWeight: 900, borderBottom: '2px solid #111', paddingBottom: 3 }}>I. DATOS GENERALES</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
          <tbody>
            <tr>
              <td style={td}><strong>Área / Curso:</strong> {curso.nombre}</td>
              <td style={td}><strong>Grado:</strong> {grado}</td>
              <td style={td}><strong>Año lectivo:</strong> {anio}</td>
            </tr>
            <tr>
              <td style={td} colSpan={2}><strong>Docente(s):</strong> ____________________________</td>
              <td style={td}><strong>Bimestres:</strong> {bimestres.length}</td>
            </tr>
          </tbody>
        </table>

        <h2 style={{ fontSize: 13, fontWeight: 900, borderBottom: '2px solid #111', paddingBottom: 3 }}>
          II. PROPÓSITOS DE APRENDIZAJE DEL AÑO
        </h2>
        {objetivosLineas.length ? (
          <ol style={{ fontSize: 11, margin: '6px 0 14px', paddingLeft: 22, lineHeight: 1.5 }}>
            {objetivosLineas.map((l, i) => <li key={i}>{l}</li>)}
          </ol>
        ) : (
          <p style={{ fontSize: 11, fontStyle: 'italic', margin: '6px 0 14px' }}>Sin objetivos registrados.</p>
        )}

        <h2 style={{ fontSize: 13, fontWeight: 900, borderBottom: '2px solid #111', paddingBottom: 3 }}>III. EVALUACIÓN</h2>
        {plan.modo_evaluacion ? (
          <p style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: '6px 0 14px', lineHeight: 1.5 }}>{plan.modo_evaluacion}</p>
        ) : (
          <p style={{ fontSize: 11, fontStyle: 'italic', margin: '6px 0 14px' }}>Sin modo de evaluación registrado.</p>
        )}

        <h2 style={{ fontSize: 13, fontWeight: 900, borderBottom: '2px solid #111', paddingBottom: 3 }}>
          IV. ORGANIZACIÓN DE UNIDADES (BIMESTRES)
        </h2>
        {bimestres.map(b => {
          const p = plantillaPorClave.get(`${curso.id}|${grado}|${b.id}`)
          const sesiones = p ? (sesionesPorPlantilla.get(p.id) ?? []) : []
          const objPorId = new Map(objetivos.map(o => [o.id, o]))
          return (
            <div key={b.id} className="salto" style={{ margin: '10px 0 16px' }}>
              <h3 style={{ fontSize: 12, fontWeight: 900, margin: '0 0 2px' }}>
                {b.nombre} · Bimestre {b.periodo}
                <span style={{ fontWeight: 400 }}>
                  {' '}({fmtFecha(b.fecha_inicio)} — {fmtFecha(b.fecha_fin)} · {b.semanas} semanas)
                </span>
              </h3>
              {p?.situacion_significativa && (
                <p style={{ fontSize: 11, margin: '2px 0 6px', lineHeight: 1.5 }}>
                  <strong>Situación significativa:</strong> {p.situacion_significativa}
                </p>
              )}
              {sesiones.length ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 36 }}>Sem.</th>
                      <th style={{ ...th, width: 110 }}>Fechas</th>
                      <th style={{ ...th, width: 70 }}>Tipo</th>
                      <th style={th}>Contenido / sesión</th>
                      <th style={th}>Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sesiones.map(s => {
                      const obj = s.objetivo_id ? objPorId.get(s.objetivo_id) : null
                      const tipoTxt = TIPOS_SEMANA.find(t => t.v === (s.tipo ?? 'clase'))?.t ?? 'Clase'
                      return (
                        <tr key={s.id}>
                          <td style={{ ...td, textAlign: 'center' }}>{s.semana}</td>
                          <td style={td}>{rangoSemana(b.fecha_inicio, s.semana) ?? '—'}</td>
                          <td style={td}>{tipoTxt}</td>
                          <td style={td}>
                            {s.titulo}
                            {obj && <div style={{ fontSize: 9, color: '#444' }}>Objetivo {obj.orden}: {obj.texto}</div>}
                          </td>
                          <td style={td}>{s.descripcion ?? ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <p style={{ fontSize: 11, fontStyle: 'italic' }}>Sin plantilla para este bimestre.</p>
              )}
            </div>
          )
        })}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, gap: 24 }}>
          {['Docente', 'Coordinación académica', 'Dirección'].map(f => (
            <div key={f} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #111', paddingTop: 4, fontSize: 10 }}>{f}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

