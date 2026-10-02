'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/components/ConfirmModal'

/* ─────────────────────── tipos ─────────────────────── */
interface Ciclo { id: string; nombre: string; activo: boolean; anio: number; periodo: number }

interface Alumno {
  id: string
  nombre: string
  apellidos: string | null
  dni: string | null
  codigo_estudiante: string | null
  sexo: string | null
}

interface SalonRol {
  grado: string
  grupo: string
  salon_nombre: string | null
  alumnos: (Alumno & { orden: number })[]
}

const GRADOS_ORDEN = [
  '1° Primaria','2° Primaria','3° Primaria','4° Primaria','5° Primaria','6° Primaria',
  '1° Secundaria','2° Secundaria','3° Secundaria','4° Secundaria','5° Secundaria',
]

function displayAlumno(a: { nombre: string; apellidos?: string | null }) {
  const ap = (a.apellidos ?? '').trim()
  const nm = (a.nombre ?? '').trim()
  if (ap) return `${ap} ${nm}`.trim()
  return nm
}

function toNearestWeekday(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const dow = date.getDay()
  if (dow === 0) date.setDate(date.getDate() + 1)
  if (dow === 6) date.setDate(date.getDate() + 2)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addWeekdays(dateStr: string, days: number): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  let added = 0
  while (added < days) {
    date.setDate(date.getDate() + 1)
    if (date.getDay() !== 0 && date.getDay() !== 6) added++
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatFecha(dateStr: string): string {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-').map(Number)
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  return `${d} de ${meses[m - 1]}`
}

/* ── Rotación continua: exactamente 3 alumnos por día hábil a lo largo
   de TODOS los salones en orden. La fecha base (el primer día) SIEMPRE
   lleva 3; solo el ÚLTIMO día puede quedar con 1 o 2 (el resto de la
   división), sin reiniciar entre salones. Devuelve por salón su fecha de
   inicio y el offset (cuántos cupos del día ya consumió el salón anterior). */
function computePacking(
  orderedSalones: { grado: string; grupo: string; alumnos: unknown[] }[],
  baseDate: string,
): Record<string, { fecha: string; offset: number }> {
  const map: Record<string, { fecha: string; offset: number }> = {}
  if (!baseDate) return map
  const start = toNearestWeekday(baseDate)
  const total = orderedSalones.reduce((n, s) => n + s.alumnos.length, 0)
  if (total === 0) return map
  // Empaquetado desde 0: la fecha base lleva 3 completos y el resto (1 o 2)
  // queda en el último día.
  let slot = 0
  for (const s of orderedSalones) {
    const key = `${s.grado}-${s.grupo}`
    map[key] = { fecha: addWeekdays(start, Math.floor(slot / 3)), offset: slot % 3 }
    slot += s.alumnos.length
  }
  return map
}

/* ── HTML de tabla para un salón (usado en print y PNG) ── */
function buildSalonHTML(
  salon: SalonRol,
  cicloNombre: string,
  rawFecha: string,
  overrides: Record<string, string>,
  offset = 0,
): string {
  const esPrimaria = salon.grado.includes('Primaria')
  const accentColor = esPrimaria ? '#059669' : '#0B2447'
  const accentLight = esPrimaria ? '#d1fae5' : '#F1F5F9'

  const filas = salon.alumnos.map((a, idx) => {
    const computed = rawFecha ? addWeekdays(toNearestWeekday(rawFecha), Math.floor((idx + offset) / 3)) : ''
    const dateStr  = overrides[a.id] !== undefined ? overrides[a.id] : computed
    const display  = dateStr ? formatFecha(dateStr) : ''
    const bg = idx % 2 === 0 ? '#ffffff' : '#fdf8f8'
    return `<tr style="background:${bg}">
      <td class="num">${a.orden}</td>
      <td class="nombre">${displayAlumno(a)}</td>
      <td class="fecha" style="color:${accentColor}">${display || '&mdash;'}</td>
      <td class="hh"></td>
      <td class="hh"></td>
    </tr>`
  }).join('')

  return `
<div class="salon-block">
  <div class="salon-header" style="background:${accentLight};border-left:5px solid ${accentColor}">
    <div class="salon-info">
      <span class="salon-grado" style="color:${accentColor}">${salon.grado}</span>
      <span class="salon-sep">·</span>
      <span class="salon-seccion">Sección ${salon.grupo}</span>
      ${salon.salon_nombre ? `<span class="salon-sep">·</span><span class="salon-nombre-plain" style="color:${accentColor}">${salon.salon_nombre}</span>` : ''}
    </div>
    <div class="salon-count" style="color:${accentColor}">${salon.alumnos.length} alumnos</div>
  </div>
  <table>
    <thead>
      <tr style="background:${accentColor}">
        <th class="num">#</th>
        <th class="left">Apellidos y Nombre</th>
        <th>Fecha Asignada</th>
        <th>Entrada</th>
        <th>Salida</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="footer-salon">
    <span>Total: <strong>${salon.alumnos.length}</strong> alumno${salon.alumnos.length !== 1 ? 's' : ''}</span>
    <span>${cicloNombre}</span>
  </div>
</div>`
}

/* ── Header institucional completo (print / PNG) ── */
function buildPageHeader(cicloNombre: string, logoSrc: string, subtitulo = ''): string {
  const fechaImp = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
  return `
<div class="page-header">
  <div class="header-top-band"></div>
  <div class="header-body">
    <div class="header-logo-col">
      <img class="logo" src="${logoSrc}" alt="Escudo"/>
    </div>
    <div class="header-center">
      <div class="inst-tipo">IES COLEGIO DE ALTA COMPETENCIA</div>
      <div class="inst-nombre">"EDUARDO DE HABICH"</div>
      <div class="inst-divider"><span></span><span class="divider-diamond">◆</span><span></span></div>
      <div class="inst-titulo">ROL DE BAPES</div>
      ${subtitulo ? `<div class="inst-subtitulo">${subtitulo}</div>` : ''}
    </div>
    <div class="header-right-col">
      <div class="header-badge-ciclo">
        <div class="badge-label">Ciclo Académico</div>
        <div class="badge-value">${cicloNombre}</div>
      </div>
      <div class="header-badge-fecha">
        <div class="badge-label">Fecha de emisión</div>
        <div class="badge-value-sm">${fechaImp}</div>
      </div>
    </div>
  </div>
  <div class="header-bottom-band"></div>
</div>`
}

const PRINT_STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1c1c1c;background:white;padding:18px 26px}

  /* ── Header institucional ── */
  .page-header{margin-bottom:22px;border-radius:4px;overflow:hidden;
    box-shadow:0 2px 8px rgba(107,15,26,.12);border:1.5px solid #e8d5b7}
  .header-top-band{height:8px;background:linear-gradient(90deg,#0B2447 0%,#1E3A8A 40%,#1E40AF 100%)}
  .header-body{display:flex;align-items:center;gap:0;padding:14px 20px;background:white}
  .header-bottom-band{height:4px;background:linear-gradient(90deg,#1E40AF 0%,#1E3A8A 60%,#0B2447 100%)}

  .header-logo-col{width:82px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .logo{width:72px;height:72px;object-fit:contain}

  .header-center{flex:1;text-align:center;padding:0 16px}
  .inst-tipo{font-size:11px;font-weight:800;color:#374151;letter-spacing:.3px;text-transform:uppercase}
  .inst-nombre{font-size:17px;font-weight:900;color:#0B2447;letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px}
  .inst-divider{display:flex;align-items:center;gap:6px;justify-content:center;margin:4px 0 6px}
  .inst-divider span:not(.divider-diamond){flex:1;height:2px;background:linear-gradient(90deg,transparent,#1E40AF)}
  .inst-divider span:last-child{background:linear-gradient(90deg,#1E40AF,transparent)}
  .divider-diamond{color:#1E40AF;font-size:10px;flex-shrink:0}
  .inst-titulo{font-size:22px;font-weight:900;color:#0B2447;letter-spacing:3px;text-transform:uppercase;
    text-shadow:0 1px 2px rgba(107,15,26,.15)}
  .inst-subtitulo{font-size:10px;color:#64748b;font-weight:600;margin-top:3px}

  .header-right-col{width:130px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
  .header-badge-ciclo,.header-badge-fecha{text-align:center;background:#F1F5F9;
    border:1.5px solid #fecdd3;border-radius:8px;padding:5px 10px;width:100%}
  .badge-label{font-size:7px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
  .badge-value{font-size:14px;font-weight:900;color:#0B2447;margin-top:1px}
  .badge-value-sm{font-size:9px;font-weight:700;color:#0B2447;margin-top:1px;line-height:1.3}

  /* ── Salones ── */
  .salon-block{margin-bottom:24px;border-radius:6px;overflow:hidden;
    border:1.5px solid #e8e4e0;box-shadow:0 1px 6px rgba(0,0,0,.06)}
  .salon-header{display:flex;align-items:center;gap:10px;padding:8px 14px}
  .salon-info{flex:1;display:flex;align-items:center;gap:8px}
  .salon-grado{font-size:13px;font-weight:900}
  .salon-sep{color:#cbd5e1;font-size:12px}
  .salon-seccion{font-size:11px;font-weight:600;color:#374151}
  .salon-nombre-plain{font-size:10px;font-weight:700}
  .salon-count{font-size:10px;font-weight:800;flex-shrink:0}

  table{width:100%;border-collapse:collapse}
  thead tr th{color:white;font-size:8.5px;font-weight:900;text-transform:uppercase;
    letter-spacing:.6px;padding:7px 10px;text-align:center}
  th.left{text-align:left}
  td{padding:6px 10px;border-bottom:1px solid #E4E8EF;font-size:10.5px;vertical-align:middle}
  .num{text-align:center;width:30px;color:#94a3b8;font-weight:700;font-size:9px}
  .nombre{font-weight:600;color:#1c1c1c}
  .fecha{text-align:center;width:115px;font-weight:700}
  .hh{text-align:center;width:80px}
  td.hh{border-bottom:1px solid #cbd5e1;border-right:none}

  .footer-salon{display:flex;justify-content:space-between;align-items:center;
    padding:5px 14px;background:#f8f6f4;font-size:9px;color:#94a3b8;font-weight:600;
    border-top:1px solid #E4E8EF}
  .footer-salon strong{color:#0B2447}

  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0}
    @page{margin:1.2cm 1.8cm;size:A4 portrait}
    .salon-block{page-break-after:always}
    .salon-block:last-child{page-break-after:auto}
    .page-header{box-shadow:none}
  }
`

/* ══════════════════════════════════════════════════════ */
interface RolBapesProps { embedded?: boolean }

export function RolBapesContent({ embedded = false }: RolBapesProps = {}) {
  const router = useRouter()

  const [loading,      setLoading]      = useState(true)
  const [ciclos,       setCiclos]       = useState<Ciclo[]>([])
  const [cicloId,      setCicloId]      = useState('')
  const [salones,      setSalones]      = useState<SalonRol[]>([])
  const [cargando,     setCargando]     = useState(false)
  const [abiertos,     setAbiertos]     = useState<Set<string>>(new Set())
  const [busqueda,     setBusqueda]     = useState('')
  const [fechas,       setFechas]       = useState<Record<string, string>>({})
  const [offsets,      setOffsets]      = useState<Record<string, number>>({})
  const [overrides,    setOverrides]    = useState<Record<string, string>>({})
  const [editingFecha, setEditingFecha] = useState<string | null>(null)
  const [encadenando,  setEncadenando]  = useState(false)
  const [limpiando,    setLimpiando]    = useState(false)
  const { confirmar, dialogo } = useConfirm()
  const [reordenando,  setReordenando]  = useState(false)
  const [exportandoPNG,       setExportandoPNG]       = useState<Set<string>>(new Set())
  const [exportandoExcel,     setExportandoExcel]     = useState<Set<string>>(new Set())
  const [exportandoExcelTodo, setExportandoExcelTodo] = useState(false)
  const [imprimiendoTodo,     setImprimiendoTodo]     = useState(false)

  /* guardamos el cicloId en un ref para usarlo en callbacks async */
  const cicloIdRef = useRef(cicloId)
  useEffect(() => { cicloIdRef.current = cicloId }, [cicloId])

  /* ── auth ── */
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
      if (activo) { setCicloId(activo.id); await cargar(activo.id) }
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  /* ── cargar rol + fechas guardadas ── */
  async function cargar(cid: string) {
    setCargando(true)
    setSalones([])
    setFechas({})
    setOffsets({})
    setOverrides({})

    const [{ data: mats }, { data: sals }, { data: dbFechas }, { data: dbOverrides }, { data: dbOrden }] = await Promise.all([
      supabase.from('matriculas')
        .select('grado,grupo,alumnos(id,nombre,apellidos,dni,codigo_estudiante,sexo)')
        .eq('ciclo_id', cid),
      supabase.from('salones').select('grado,grupo,nombre'),
      supabase.from('rol_bapes_fechas').select('grado,grupo,fecha_inicio').eq('ciclo_id', cid),
      supabase.from('rol_bapes_overrides').select('alumno_id,fecha').eq('ciclo_id', cid),
      supabase.from('rol_bapes_orden').select('grado,grupo,orden').eq('ciclo_id', cid),
    ])

    const salonMap: Record<string, string | null> = {}
    for (const s of (sals ?? []) as { grado: string; grupo: string; nombre: string | null }[]) {
      salonMap[`${s.grado}-${s.grupo}`] = s.nombre
    }

    /* orden manual guardado (define la secuencia de rotación) */
    const ordenMap: Record<string, number> = {}
    for (const o of (dbOrden ?? []) as { grado: string; grupo: string; orden: number }[]) {
      ordenMap[`${o.grado}-${o.grupo}`] = o.orden
    }

    type MatRow = { grado: string; grupo: string; alumnos: { id: string; nombre: string | null; apellidos: string | null; dni: string | null; codigo_estudiante: string | null; sexo: string | null } | null }
    const gruposMap: Record<string, SalonRol> = {}
    for (const m of (mats ?? []) as unknown as MatRow[]) {
      if (!m.alumnos) continue
      const key = `${m.grado}-${m.grupo}`
      if (!gruposMap[key]) {
        gruposMap[key] = { grado: m.grado, grupo: m.grupo, salon_nombre: salonMap[key] ?? null, alumnos: [] }
      }
      gruposMap[key].alumnos.push({
        id: m.alumnos.id, nombre: m.alumnos.nombre ?? '', apellidos: m.alumnos.apellidos ?? null,
        dni: m.alumnos.dni ?? null, codigo_estudiante: m.alumnos.codigo_estudiante ?? null,
        sexo: m.alumnos.sexo ?? null, orden: 0,
      })
    }

    const resultado: SalonRol[] = Object.values(gruposMap)
      .sort((a, b) => {
        const oa = ordenMap[`${a.grado}-${a.grupo}`]
        const ob = ordenMap[`${b.grado}-${b.grupo}`]
        const hasA = oa !== undefined, hasB = ob !== undefined
        if (hasA && hasB) return oa - ob
        if (hasA) return -1
        if (hasB) return 1
        const gi = GRADOS_ORDEN.indexOf(a.grado) - GRADOS_ORDEN.indexOf(b.grado)
        return gi !== 0 ? gi : a.grupo.localeCompare(b.grupo)
      })
    resultado.forEach(s => {
      s.alumnos.sort((a, b) => displayAlumno(a).localeCompare(displayAlumno(b)))
      s.alumnos.forEach((a, i) => { a.orden = i + 1 })
    })

    /* aplicar fechas y overrides guardados */
    const newFechas: Record<string, string> = {}
    for (const f of (dbFechas ?? []) as { grado: string; grupo: string; fecha_inicio: string }[]) {
      newFechas[`${f.grado}-${f.grupo}`] = f.fecha_inicio
    }
    const newOverrides: Record<string, string> = {}
    for (const o of (dbOverrides ?? []) as { alumno_id: string; fecha: string }[]) {
      newOverrides[o.alumno_id] = o.fecha
    }

    /* la fecha del primer salón es la base de la rotación; el resto se
       deriva con packing continuo (3 por fecha) según el orden actual */
    const firstKey = resultado[0] ? `${resultado[0].grado}-${resultado[0].grupo}` : ''
    const baseFecha = firstKey ? (newFechas[firstKey] ?? '') : ''
    const packed = computePacking(resultado, baseFecha)
    const fechasState: Record<string, string> = {}
    const offsetsState: Record<string, number> = {}
    for (const k in packed) { fechasState[k] = packed[k].fecha; offsetsState[k] = packed[k].offset }

    setSalones(resultado)
    setAbiertos(new Set(resultado.map(s => `${s.grado}-${s.grupo}`)))
    setFechas(fechasState)
    setOffsets(offsetsState)
    setOverrides(newOverrides)
    setCargando(false)
  }

  /* ── guardar override individual ── */
  async function guardarOverride(alumnoId: string, valor: string) {
    const cid = cicloIdRef.current
    if (!cid) return
    if (valor) {
      await supabase.from('rol_bapes_overrides').upsert(
        { ciclo_id: cid, alumno_id: alumnoId, fecha: valor, updated_at: new Date().toISOString() },
        { onConflict: 'ciclo_id,alumno_id' }
      )
    } else {
      await supabase.from('rol_bapes_overrides').delete()
        .eq('ciclo_id', cid).eq('alumno_id', alumnoId)
    }
  }

  /* ── guardar orden manual de salones ── */
  async function persistOrden(list: SalonRol[]) {
    const cid = cicloIdRef.current
    if (!cid) return
    const rows = list.map((s, i) => ({
      ciclo_id: cid, grado: s.grado, grupo: s.grupo, orden: i, updated_at: new Date().toISOString(),
    }))
    await supabase.from('rol_bapes_orden').upsert(rows, { onConflict: 'ciclo_id,grado,grupo' })
  }

  /* ── mover un salón arriba/abajo en la secuencia ── */
  function moverSalon(key: string, dir: -1 | 1) {
    setReordenando(true)
    setSalones(prev => {
      const idx = prev.findIndex(s => `${s.grado}-${s.grupo}` === key)
      if (idx < 0) { setReordenando(false); return prev }
      const target = idx + dir
      if (target < 0 || target >= prev.length) { setReordenando(false); return prev }
      const next = [...prev]
      const tmp = next[idx]; next[idx] = next[target]; next[target] = tmp
      /* la fecha base (inicio de la rotación) se conserva; solo cambia el orden */
      const baseDate = fechas[`${prev[0].grado}-${prev[0].grupo}`] ?? ''
      persistOrden(next).finally(() => setReordenando(false))
      if (baseDate) encadenarDesde(baseDate, next)
      return next
    })
  }

  /* ── encadenar fechas: rotación continua de 3 alumnos por día hábil a lo
        largo de todos los salones en orden. La fecha del primer salón es la
        base; solo el primer día puede quedar con 1 o 2 (el grupo único). ── */
  async function encadenarDesde(baseDate: string, lista: SalonRol[] = salones) {
    const cid = cicloIdRef.current
    if (!cid) return
    setEncadenando(true)
    try {
      const packed = computePacking(lista, baseDate)
      const fechasState: Record<string, string> = {}
      const offsetsState: Record<string, number> = {}
      const rows: { ciclo_id: string; grado: string; grupo: string; fecha_inicio: string; updated_at: string }[] = []
      for (const s of lista) {
        const k = `${s.grado}-${s.grupo}`
        if (packed[k]) {
          fechasState[k] = packed[k].fecha
          offsetsState[k] = packed[k].offset
          rows.push({ ciclo_id: cid, grado: s.grado, grupo: s.grupo, fecha_inicio: packed[k].fecha, updated_at: new Date().toISOString() })
        }
      }
      setFechas(fechasState)
      setOffsets(offsetsState)
      if (rows.length) {
        await supabase.from('rol_bapes_fechas').upsert(rows, { onConflict: 'ciclo_id,grado,grupo' })
      } else {
        await supabase.from('rol_bapes_fechas').delete().eq('ciclo_id', cid)
      }
    } finally {
      setEncadenando(false)
    }
  }

  /* ── limpiar TODAS las fechas del ciclo (base, encadenadas e individuales) ── */
  async function limpiarFechas() {
    const cid = cicloIdRef.current
    if (!cid) return
    if (!(await confirmar({
      titulo: '¿Limpiar todas las fechas de este ciclo?',
      mensaje: 'Se borrará la fecha base, las fechas encadenadas de todas las secciones y los ajustes individuales de alumnos. Esta acción no se puede deshacer.',
      tono: 'peligro', confirmarLabel: 'Limpiar todo',
    }))) return
    setLimpiando(true)
    try {
      const [rFechas, rOverrides] = await Promise.all([
        supabase.from('rol_bapes_fechas').delete().eq('ciclo_id', cid),
        supabase.from('rol_bapes_overrides').delete().eq('ciclo_id', cid),
      ])
      const error = rFechas.error ?? rOverrides.error
      if (error) {
        window.alert('No se pudieron limpiar las fechas: ' + error.message)
        return
      }
      setFechas({})
      setOffsets({})
      setOverrides({})
    } finally {
      setLimpiando(false)
    }
  }

  function toggleSalon(key: string) {
    setAbiertos(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }
  function abrirTodos()  { setAbiertos(new Set(salones.map(s => `${s.grado}-${s.grupo}`))) }
  function cerrarTodos() { setAbiertos(new Set()) }

  /* ── imprimir un salón ── */
  function imprimirSalon(salon: SalonRol, key: string) {
    const cicloNombre = ciclos.find(c => c.id === cicloId)?.nombre ?? ''
    const logoSrc = window.location.origin + '/colegio.png'
    const bodyHTML = buildSalonHTML(salon, cicloNombre, fechas[key] ?? '', overrides, offsets[key] ?? 0)
    const headerHTML = buildPageHeader(cicloNombre, logoSrc, `${salon.grado} &mdash; Sección ${salon.grupo}${salon.salon_nombre ? ` &middot; ${salon.salon_nombre}` : ''}`)

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Rol de Bapes · ${salon.grado} ${salon.grupo}</title>
<style>${PRINT_STYLES}</style></head><body>
${headerHTML}
${bodyHTML}
</body></html>`

    const win = window.open('', '_blank', 'width=940,height=760')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.onload = () => { win.focus(); win.print() }
  }

  /* ── imprimir TODOS los salones ── */
  function imprimirTodo() {
    if (salonesFiltrados.length === 0) return
    setImprimiendoTodo(true)
    const cicloNombre = ciclos.find(c => c.id === cicloId)?.nombre ?? ''
    const logoSrc = window.location.origin + '/colegio.png'

    const bloques = salonesFiltrados.map(salon => {
      const key = `${salon.grado}-${salon.grupo}`
      return buildSalonHTML(salon, cicloNombre, fechas[key] ?? '', overrides, offsets[key] ?? 0)
    }).join('')

    const headerHTML = buildPageHeader(cicloNombre, logoSrc, `${salonesFiltrados.length} salones &nbsp;&middot;&nbsp; ${salonesFiltrados.reduce((n, s) => n + s.alumnos.length, 0)} alumnos`)

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Rol de Bapes · ${cicloNombre}</title>
<style>${PRINT_STYLES}</style></head><body>
${headerHTML}
${bloques}
</body></html>`

    const win = window.open('', '_blank', 'width=940,height=760')
    if (!win) { setImprimiendoTodo(false); return }
    win.document.write(html)
    win.document.close()
    win.onload = () => { win.focus(); win.print(); setImprimiendoTodo(false) }
  }

  /* ── helper: agrega hoja Excel de un salón al workbook ── */
  function agregarHojaExcel(wb: import('exceljs').Workbook, salon: SalonRol, key: string, cicloNombre: string, rawFecha: string, ovr: Record<string, string>, offset = 0) {
    const esPrimaria = salon.grado.includes('Primaria')
    const C_WINE     = 'FF6B1A1A'
    const C_WINE_MED = 'FF7F1D1D'
    const C_WINE_HDR = esPrimaria ? 'FF059669' : 'FF991B1B'
    const C_GOLD     = 'FFC9A84C'
    const C_GOLD_LT  = 'FFFDF3DC'
    const C_GRAY     = 'FF6B7280'
    const C_GRAY_LT  = 'FFF3F4F6'
    const C_WHITE    = 'FFFFFFFF'
    const C_TEXT     = 'FF1C1C1C'

    const COLS = [
      { label: '#',                width: 5  },
      { label: 'Apellidos y Nombre', width: 32 },
      { label: 'DNI',              width: 12 },
      { label: 'Fecha Asignada',   width: 16 },
      { label: 'Entrada',          width: 14 },
      { label: 'Salida',           width: 14 },
    ]
    const numCols = COLS.length
    function colLetter(n: number): string {
      let s = ''
      while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
      return s
    }
    const lastCol = colLetter(numCols)
    function fillRow(ws: import('exceljs').Worksheet, row: number, color: string) {
      for (let c = 1; c <= numCols; c++)
        ws.getRow(row).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    }

    const wsName = `${salon.grado} ${salon.grupo}`.replace(/[°"*?:/\\[\]]/g, '').slice(0, 31)
    const ws = wb.addWorksheet(wsName, {
      pageSetup: { fitToPage: true, orientation: 'portrait', margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } },
      views: [{ state: 'frozen', ySplit: 8 }],
    })
    COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })

    ws.getRow(1).height = 42; ws.getRow(2).height = 24
    ws.mergeCells('A1:A2')
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WHITE } }
    ws.mergeCells(`B1:${lastCol}1`)
    const r1 = ws.getCell('B1')
    r1.value = 'COLEGIO DE ALTA COMPETENCIA  ·  EDUARDO DE HABICH'
    r1.font  = { bold: true, size: 14, color: { argb: C_WHITE }, name: 'Calibri' }
    r1.alignment = { vertical: 'bottom', horizontal: 'center' }
    r1.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WINE } }
    ws.mergeCells(`B2:${lastCol}2`)
    const r2 = ws.getCell('B2')
    r2.value = 'Juliaca  ·  Puno  ·  Perú'
    r2.font  = { bold: false, size: 11, color: { argb: C_GOLD }, name: 'Calibri', italic: true }
    r2.alignment = { vertical: 'top', horizontal: 'center' }
    r2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WINE_MED } }

    ws.getRow(3).height = 7;  fillRow(ws, 3, C_GOLD)
    ws.getRow(4).height = 8;  fillRow(ws, 4, C_WHITE)

    ws.getRow(5).height = 28
    ws.mergeCells(`A5:${lastCol}5`)
    const r5 = ws.getCell('A5')
    r5.value = 'ROL DE BAPES'
    r5.font  = { bold: true, size: 12, color: { argb: C_WINE }, name: 'Calibri' }
    r5.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }
    r5.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WHITE } }
    r5.border = { left: { style: 'thick', color: { argb: C_GOLD } } }

    ws.getRow(6).height = 20
    ws.mergeCells(`A6:${lastCol}6`)
    const r6 = ws.getCell('A6')
    r6.value = `${salon.grado}  ·  Sección ${salon.grupo}${salon.salon_nombre ? `  ·  ${salon.salon_nombre}` : ''}  ·  Ciclo ${cicloNombre}`
    r6.font  = { bold: true, size: 10, color: { argb: C_WINE_HDR }, name: 'Calibri' }
    r6.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }
    r6.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WHITE } }
    r6.border = { left: { style: 'thick', color: { argb: C_GOLD } } }

    ws.getRow(7).height = 18
    ws.mergeCells(`A7:${lastCol}7`)
    const r7 = ws.getCell('A7')
    r7.value = `Total: ${salon.alumnos.length} alumnos     ·     Generado el ${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}`
    r7.font  = { size: 9, color: { argb: C_GRAY }, name: 'Calibri' }
    r7.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }
    r7.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LT } }
    r7.border = { left: { style: 'thick', color: { argb: C_GOLD } } }

    ws.getRow(8).height = 26
    COLS.forEach((c, i) => {
      const cell = ws.getRow(8).getCell(i + 1)
      cell.value = c.label.toUpperCase()
      cell.font  = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: i <= 1 ? (i === 0 ? 'center' : 'left') : 'center', indent: i === 1 ? 1 : 0 }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WINE_HDR } }
      cell.border = {
        top:    { style: 'thin',   color: { argb: C_GOLD } },
        bottom: { style: 'medium', color: { argb: C_GOLD } },
        right:  i < COLS.length - 1 ? { style: 'hair', color: { argb: C_WINE } } : undefined,
      }
    })

    salon.alumnos.forEach((a, idx) => {
      const rowNum = 9 + idx
      const bg = idx % 2 === 1 ? C_GOLD_LT : C_WHITE
      ws.getRow(rowNum).height = 18
      const computed = rawFecha ? addWeekdays(toNearestWeekday(rawFecha), Math.floor((idx + offset) / 3)) : ''
      const dateStr  = ovr[a.id] !== undefined ? ovr[a.id] : computed
      const display  = dateStr ? formatFecha(dateStr) : ''
      const valores  = [idx + 1, displayAlumno(a), a.dni ?? '', display, '', '']
      valores.forEach((val, i) => {
        const cell = ws.getRow(rowNum).getCell(i + 1)
        cell.value = val
        cell.font  = { size: 10, color: { argb: C_TEXT }, name: 'Calibri', bold: i === 0 }
        cell.alignment = { vertical: 'middle', horizontal: i <= 1 ? (i === 0 ? 'center' : 'left') : 'center', indent: i === 1 ? 1 : 0 }
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        cell.border = {
          bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
          right:  i < valores.length - 1 ? { style: 'hair', color: { argb: 'FFE5E7EB' } } : undefined,
        }
      })
    })

    const totalRow = 9 + salon.alumnos.length
    ws.getRow(totalRow).height = 20
    ws.mergeCells(`A${totalRow}:${lastCol}${totalRow}`)
    const totalCell = ws.getCell(`A${totalRow}`)
    totalCell.value = `TOTAL: ${salon.alumnos.length} alumno${salon.alumnos.length !== 1 ? 's' : ''}`
    totalCell.font  = { bold: true, size: 10, color: { argb: C_WINE }, name: 'Calibri' }
    totalCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 2 }
    totalCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GOLD_LT } }
    totalCell.border = { top: { style: 'medium', color: { argb: C_GOLD } }, bottom: { style: 'thin', color: { argb: C_GOLD } } }

    const footerRow = totalRow + 1
    ws.getRow(footerRow).height = 16
    ws.mergeCells(`A${footerRow}:${lastCol}${footerRow}`)
    const footer = ws.getCell(`A${footerRow}`)
    footer.value = `© ${new Date().getFullYear()} Colegio de Alta Competencia Eduardo de Habich — Sistema de Gestión Académica`
    footer.font  = { size: 8, color: { argb: C_GRAY }, italic: true, name: 'Calibri' }
    footer.alignment = { vertical: 'middle', horizontal: 'center' }
    footer.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LT } }
    footer.border = { top: { style: 'thin', color: { argb: C_GOLD } } }
  }

  /* ── exportar salón como Excel ── */
  async function exportarExcel(salon: SalonRol, key: string) {
    setExportandoExcel(prev => new Set(prev).add(key))
    try {
      const cicloNombre = ciclos.find(c => c.id === cicloId)?.nombre ?? ''
      const rawFecha = fechas[key] ?? ''
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Sistema Eduardo de Habich'; wb.created = new Date()
      agregarHojaExcel(wb, salon, key, cicloNombre, rawFecha, overrides, offsets[key] ?? 0)
      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `rol-bapes-${salon.grado}-${salon.grupo}-${new Date().toISOString().slice(0,10)}.xlsx`.replace(/\s+/g,'-').replace(/[°"]/g,'')
      link.click(); URL.revokeObjectURL(url)
    } finally {
      setExportandoExcel(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  /* ── exportar TODOS los salones como Excel (una hoja por salón) ── */
  async function exportarExcelTodo() {
    if (salonesFiltrados.length === 0) return
    setExportandoExcelTodo(true)
    try {
      const cicloNombre = ciclos.find(c => c.id === cicloId)?.nombre ?? ''
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Sistema Eduardo de Habich'; wb.created = new Date()
      for (const salon of salonesFiltrados) {
        const key = `${salon.grado}-${salon.grupo}`
        agregarHojaExcel(wb, salon, key, cicloNombre, fechas[key] ?? '', overrides, offsets[key] ?? 0)
      }
      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `rol-bapes-${cicloNombre}-${new Date().toISOString().slice(0,10)}.xlsx`.replace(/\s+/g,'-').replace(/[°"]/g,'')
      link.click(); URL.revokeObjectURL(url)
    } finally {
      setExportandoExcelTodo(false)
    }
  }

  /* ── exportar salón como PNG (html2canvas) ── */
  async function exportarPNG(salon: SalonRol, key: string) {
    setExportandoPNG(prev => new Set(prev).add(key))
    try {
      const html2canvas = (await import('html2canvas')).default
      const cicloNombre = ciclos.find(c => c.id === cicloId)?.nombre ?? ''
      const rawFecha    = fechas[key] ?? ''
      const offset      = offsets[key] ?? 0
      const esPrimaria  = salon.grado.includes('Primaria')
      const accent      = esPrimaria ? '#059669' : '#0B2447'
      const accentLight = esPrimaria ? '#d1fae5'  : '#F1F5F9'
      const fechaImp    = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })

      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;background:white;font-family:Arial,sans-serif;font-size:11px;color:#1c1c1c;width:900px'

      /* ── banda superior + header institucional ── */
      container.innerHTML = `
        <div style="height:8px;background:linear-gradient(90deg,#0B2447,#1E3A8A,#1E40AF)"></div>
        <div style="display:flex;align-items:center;gap:0;padding:14px 24px;background:white;border-bottom:1px solid #e8d5b7">
          <div style="text-align:center;flex:1">
            <div style="font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.3px">IES COLEGIO DE ALTA COMPETENCIA</div>
            <div style="font-size:18px;font-weight:900;color:#0B2447;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">"EDUARDO DE HABICH"</div>
            <div style="display:flex;align-items:center;gap:6px;justify-content:center;margin:4px 0 6px">
              <div style="flex:1;height:2px;background:linear-gradient(90deg,transparent,#1E40AF)"></div>
              <span style="color:#1E40AF;font-size:10px">◆</span>
              <div style="flex:1;height:2px;background:linear-gradient(90deg,#1E40AF,transparent)"></div>
            </div>
            <div style="font-size:23px;font-weight:900;color:#0B2447;letter-spacing:3px;text-transform:uppercase">ROL DE BAPES</div>
            <div style="font-size:11px;color:#374151;font-weight:700;margin-top:5px">${salon.grado} &mdash; Sección ${salon.grupo}${salon.salon_nombre ? ` &middot; ${salon.salon_nombre}` : ''}</div>
            <div style="font-size:9px;color:#94a3b8;margin-top:3px">Ciclo ${cicloNombre} &nbsp;·&nbsp; Emitido el ${fechaImp}</div>
          </div>
        </div>
        <div style="height:4px;background:linear-gradient(90deg,#1E40AF,#1E3A8A,#0B2447)"></div>

        <div style="padding:16px 24px">
          <!-- salon header -->
          <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;background:${accentLight};border-left:5px solid ${accent};border-radius:0 6px 6px 0;margin-bottom:10px">
            <div style="flex:1;display:flex;align-items:center;gap:8px">
              <span style="font-size:13px;font-weight:900;color:${accent}">${salon.grado}</span>
              <span style="color:#cbd5e1;font-size:12px">·</span>
              <span style="font-size:11px;font-weight:600;color:#374151">Sección ${salon.grupo}</span>
              ${salon.salon_nombre ? `<span style="color:#cbd5e1;font-size:12px">·</span><span style="font-size:10px;font-weight:700;color:${accent}">${salon.salon_nombre}</span>` : ''}
            </div>
            <div style="flex-shrink:0;font-size:10px;font-weight:800;color:${accent}">${salon.alumnos.length} alumnos</div>
          </div>

          <!-- tabla -->
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:${accent}">
                <th style="color:white;font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:.6px;padding:7px 10px;text-align:center;width:30px">#</th>
                <th style="color:white;font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:.6px;padding:7px 10px;text-align:left">Apellidos y Nombre</th>
                <th style="color:white;font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:.6px;padding:7px 10px;text-align:center;width:115px">Fecha Asignada</th>
                <th style="color:white;font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:.6px;padding:7px 10px;text-align:center;width:80px">Entrada</th>
                <th style="color:white;font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:.6px;padding:7px 10px;text-align:center;width:80px">Salida</th>
              </tr>
            </thead>
            <tbody>
              ${salon.alumnos.map((a, idx) => {
                const computed = rawFecha ? addWeekdays(toNearestWeekday(rawFecha), Math.floor((idx + offset) / 3)) : ''
                const dateStr  = overrides[a.id] !== undefined ? overrides[a.id] : computed
                const display  = dateStr ? formatFecha(dateStr) : '—'
                const bg = idx % 2 === 0 ? '#ffffff' : '#fdf8f8'
                return `<tr style="background:${bg};border-bottom:1px solid #E4E8EF">
                  <td style="text-align:center;padding:6px 10px;color:#94a3b8;font-weight:700;font-size:9px">${a.orden}</td>
                  <td style="padding:6px 10px;font-weight:600;font-size:10.5px">${displayAlumno(a)}</td>
                  <td style="text-align:center;padding:6px 10px;font-weight:700;color:${accent};font-size:10.5px">${display}</td>
                  <td style="text-align:center;padding:6px 10px;border-bottom:1px solid #cbd5e1"></td>
                  <td style="text-align:center;padding:6px 10px;border-bottom:1px solid #cbd5e1"></td>
                </tr>`
              }).join('')}
            </tbody>
          </table>

          <div style="display:flex;justify-content:space-between;padding:5px 14px;background:#f8f6f4;font-size:9px;color:#94a3b8;font-weight:600;border-top:1px solid #E4E8EF;margin-top:0">
            <span>Total: <strong style="color:${accent}">${salon.alumnos.length}</strong> alumno${salon.alumnos.length !== 1 ? 's' : ''}</span>
            <span>${cicloNombre}</span>
          </div>
        </div>
      `

      document.body.appendChild(container)
      const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
      document.body.removeChild(container)

      const link = document.createElement('a')
      link.download = `rol-bapes-${salon.grado}-${salon.grupo}.png`.replace(/\s+/g, '-').replace(/[°"]/g, '')
      link.href = canvas.toDataURL('image/png')
      link.click()
    } finally {
      setExportandoPNG(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  const totalAlumnos = salones.reduce((n, s) => n + s.alumnos.length, 0)

  const salonesFiltrados = busqueda.trim()
    ? salones.map(s => ({
        ...s,
        alumnos: s.alumnos.filter(a =>
          displayAlumno(a).toLowerCase().includes(busqueda.toLowerCase()) ||
          (a.dni ?? '').includes(busqueda) ||
          (a.codigo_estudiante ?? '').includes(busqueda)
        ),
      })).filter(s => s.alumnos.length > 0)
    : salones

  /* ─────────────────────── render ─────────────────────── */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f7f5f1' }}>
      <div className="flex flex-col items-center gap-3 p-8 rounded-3xl bg-white"
        style={{ boxShadow: '0 16px 48px rgba(107,15,26,.08)', border: '1.5px solid #E4E8EF' }}>
        <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#0B2447" strokeWidth="4"/>
          <path className="opacity-75" fill="#0B2447" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <p className="text-slate-400 text-sm font-medium">Cargando rol de clases…</p>
      </div>
    </div>
  )

  return (
    <div className={embedded ? '' : 'min-h-screen'} style={embedded ? undefined : { background: '#f7f5f1' }}>
      {dialogo}

      {/* ── Header (oculto en embedded — admin provee su propio header) ── */}
      {!embedded && (
      <header className="sticky top-0 z-50"
        style={{ background: 'white', borderBottom: '1px solid #E4E8EF', boxShadow: '0 1px 12px rgba(107,15,26,.06)', borderTop: '3px solid #0B2447' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin"
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-900 transition-colors">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
              Panel Admin
            </Link>
            <span className="text-slate-300">/</span>
            <div>
              <p className="text-slate-800 font-black text-sm leading-tight">Rol de Clases</p>
              <p className="text-[10px] text-slate-400 font-medium">Lista de alumnos por salón</p>
            </div>
          </div>

          <select value={cicloId}
            onChange={e => { setCicloId(e.target.value); cargar(e.target.value) }}
            className="text-xs font-bold rounded-xl px-3 py-2 outline-none transition-all"
            style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3', color: '#0B2447' }}>
            {ciclos.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}{c.activo ? ' ✓' : ''}</option>
            ))}
          </select>
        </div>
      </header>
      )}

      {/* Toolbar embedded: selector de ciclo */}
      {embedded && (
        <div className="mb-5 flex items-center justify-end">
          <select value={cicloId}
            onChange={e => { setCicloId(e.target.value); cargar(e.target.value) }}
            className="text-xs font-bold rounded-xl px-3 py-2 outline-none transition-all"
            style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3', color: '#0B2447' }}>
            {ciclos.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}{c.activo ? ' ✓' : ''}</option>
            ))}
          </select>
        </div>
      )}

      <div className={embedded ? 'space-y-5' : 'max-w-6xl mx-auto px-4 py-6 space-y-5'}>

        {/* ── Barra de herramientas ── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Stats */}
          <div className="flex gap-3 flex-1">
            {[
              { label: 'Salones', value: salones.length,  color: '#0B2447' },
              { label: 'Alumnos', value: totalAlumnos,    color: '#1E40AF' },
            ].map(st => (
              <div key={st.label} className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white"
                style={{ border: '1.5px solid #E4E8EF', boxShadow: '0 2px 8px rgba(107,15,26,.04)' }}>
                <span className="text-xl font-black" style={{ color: st.color }}>{st.value}</span>
                <span className="text-xs font-semibold text-slate-400">{st.label}</span>
              </div>
            ))}
          </div>

          {/* Búsqueda */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/>
            </svg>
            <input type="text" placeholder="Buscar alumno, DNI o código…"
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              className="pl-8 pr-3 py-2 text-xs rounded-xl outline-none w-64 transition-all"
              style={{ background: 'white', border: '1.5px solid #E4E8EF', color: '#1c1c1c' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#1E3A8A'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(107,15,26,.08)' }}
              onBlur={e =>  { e.currentTarget.style.borderColor = '#E4E8EF';  e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          {/* Controles */}
          <div className="flex gap-1.5">
            <button onClick={abrirTodos}
              className="text-xs font-bold px-3 py-2 rounded-xl transition-all"
              style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3', color: '#0B2447' }}>
              Expandir todo
            </button>
            <button onClick={cerrarTodos}
              className="text-xs font-bold px-3 py-2 rounded-xl transition-all"
              style={{ background: 'white', border: '1.5px solid #E4E8EF', color: '#64748b' }}>
              Colapsar todo
            </button>
            {/* Encadenar fechas desde el primer salón */}
            <button onClick={() => encadenarDesde(fechas[`${salones[0]?.grado}-${salones[0]?.grupo}`] ?? '')}
              disabled={encadenando || salones.length === 0 || !fechas[`${salones[0]?.grado}-${salones[0]?.grupo}`]}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#1E40AF,#1E3A8A)', color: 'white' }}
              title="Recalcular la rotación: cada salón continúa donde terminó el anterior, desde la fecha del 1° salón">
              {encadenando
                ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m6-6l3-3a4 4 0 015.656 5.656l-1.5 1.5"/></svg>
              }
              Encadenar fechas
            </button>
            {/* Limpiar todas las fechas */}
            <button onClick={limpiarFechas}
              disabled={limpiando || salones.length === 0}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all disabled:opacity-40"
              style={{ background: 'white', border: '1.5px solid #fecaca', color: '#b91c1c' }}
              title="Borrar todas las fechas asignadas (base, encadenadas e individuales) de este ciclo">
              {limpiando
                ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              }
              Limpiar
            </button>
            {/* Excel todo */}
            <button onClick={exportarExcelTodo} disabled={exportandoExcelTodo || salonesFiltrados.length === 0}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#0d9488,#06b6d4)', color: 'white' }}
              title="Exportar todos los salones en Excel">
              {exportandoExcelTodo
                ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              }
              Excel todo
            </button>
            {/* Imprimir todo */}
            <button onClick={imprimirTodo} disabled={imprimiendoTodo || salonesFiltrados.length === 0}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all disabled:opacity-40"
              style={{ background: '#0B2447', color: 'white' }}
              title="Imprimir todos los salones de una vez">
              {imprimiendoTodo
                ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
              }
              Imprimir todo
            </button>
          </div>
        </div>

        {/* ── Cargando ── */}
        {cargando && (
          <div className="flex items-center justify-center py-16">
            <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#0B2447" strokeWidth="4"/>
              <path className="opacity-75" fill="#0B2447" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </div>
        )}

        {/* ── Sin resultados ── */}
        {!cargando && salonesFiltrados.length === 0 && (
          <div className="py-16 text-center rounded-3xl bg-white" style={{ border: '1.5px solid #E4E8EF' }}>
            <p className="text-slate-400 text-sm font-semibold">
              {busqueda ? 'Sin resultados para la búsqueda.' : 'No hay alumnos matriculados en este ciclo.'}
            </p>
          </div>
        )}

        {/* ── Lista de salones ── */}
        <div className="space-y-3">
          {salonesFiltrados.map(salon => {
            const key     = `${salon.grado}-${salon.grupo}`
            const abierto = abiertos.has(key)
            const esPrimaria = salon.grado.includes('Primaria')
            const exporting = exportandoPNG.has(key)
            const fullIdx = salones.findIndex(s => `${s.grado}-${s.grupo}` === key)
            const esBase  = fullIdx === 0
            const puedeReordenar = !busqueda.trim()

            return (
              <div key={key} className="rounded-2xl overflow-hidden bg-white"
                style={{ border: '1.5px solid #E4E8EF', boxShadow: '0 2px 12px rgba(107,15,26,.04)' }}>

                {/* Cabecera */}
                <div className="flex items-center gap-3 px-5 py-4"
                  style={{ borderBottom: abierto ? '1px solid #E4E8EF' : 'none' }}>

                  {/* Flechas de reorden (ocultas al buscar) */}
                  {puedeReordenar && (
                    <div className="shrink-0 flex flex-col items-center gap-0.5">
                      <button onClick={() => moverSalon(key, -1)} disabled={fullIdx === 0 || reordenando}
                        className="p-0.5 rounded-md transition-all disabled:opacity-25 hover:bg-indigo-50"
                        title="Subir en la rotación" style={{ color: '#0B2447' }}>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <polyline points="6 15 12 9 18 15"/>
                        </svg>
                      </button>
                      <span className="text-[9px] font-black tabular-nums" style={{ color: esBase ? '#1E40AF' : '#cbd5e1' }}>
                        {fullIdx + 1}
                      </span>
                      <button onClick={() => moverSalon(key, 1)} disabled={fullIdx === salones.length - 1 || reordenando}
                        className="p-0.5 rounded-md transition-all disabled:opacity-25 hover:bg-indigo-50"
                        title="Bajar en la rotación" style={{ color: '#0B2447' }}>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                    </div>
                  )}

                  <button onClick={() => toggleSalon(key)}
                    className="flex items-center gap-4 flex-1 text-left transition-all hover:opacity-80">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-white text-xs"
                      style={{ background: esPrimaria ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                      {salon.grupo}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-slate-800 text-sm">{salon.grado}</p>
                        {salon.salon_nombre && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: '#fef3c7', color: '#92400e' }}>{salon.salon_nombre}</span>
                        )}
                        {esBase && (
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide"
                            style={{ background: '#dbeafe', color: '#1E40AF' }}>Base rotación</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                        Sección {salon.grupo} · {salon.alumnos.length} alumno{salon.alumnos.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-black px-2.5 py-1 rounded-lg"
                        style={{ background: esPrimaria ? '#f0fdf4' : '#F1F5F9', color: esPrimaria ? '#16a34a' : '#0B2447' }}>
                        {salon.alumnos.length}
                      </span>
                      <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  </button>

                  {/* Fecha inicio con indicador de guardado */}
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest"
                      style={{ color: (esBase && encadenando) ? '#1E40AF' : esBase ? '#1E40AF' : '#94a3b8' }}>
                      {esBase && encadenando ? 'Encadenando…' : esBase ? 'Fecha inicio · encadena' : 'Fecha (auto)'}
                    </span>
                    <input type="date" value={fechas[key] ?? ''} disabled={!esBase || encadenando}
                      onChange={e => { if (esBase) encadenarDesde(e.target.value) }}
                      title={esBase ? 'Define el inicio de la rotación; las demás fechas se calculan solas' : 'Calculada automáticamente desde el primer salón'}
                      className="text-xs rounded-xl px-2.5 py-1.5 outline-none disabled:cursor-not-allowed"
                      style={{ border: `1.5px solid ${esBase ? '#93c5fd' : '#E4E8EF'}`, background: esBase ? '#eff6ff' : '#f8fafc', color: esBase ? '#0B2447' : '#64748b', fontWeight: 700 }}
                    />
                  </div>

                  {/* Botones de acción */}
                  <div className="shrink-0 flex gap-1.5">
                    {/* Exportar PNG */}
                    <button onClick={() => exportarPNG(salon, key)} disabled={exporting}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-80 disabled:opacity-40"
                      style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0', color: '#475569' }}
                      title="Exportar como imagen PNG">
                      {exporting
                        ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                        : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M3 9l4-4 4 4 4-4 4 4"/><path strokeLinecap="round" strokeLinejoin="round" d="M3 15l4 4 4-4 4 4 4-4"/></svg>
                      }
                      PNG
                    </button>

                    {/* Exportar Excel */}
                    <button onClick={() => exportarExcel(salon, key)} disabled={exportandoExcel.has(key)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-80 disabled:opacity-40 text-white"
                      style={{ background: 'linear-gradient(135deg,#0d9488,#06b6d4)' }}
                      title="Exportar como Excel">
                      {exportandoExcel.has(key)
                        ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                        : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                      }
                      Excel
                    </button>

                    {/* Imprimir */}
                    <button onClick={() => imprimirSalon(salon, key)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-80"
                      style={{ background: '#0B2447', color: 'white' }}
                      title="Imprimir lista del salón">
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                      </svg>
                      Imprimir
                    </button>
                  </div>
                </div>

                {/* Lista de alumnos */}
                {abierto && (
                  <div>
                    <div className="grid gap-0 px-5 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400"
                      style={{ gridTemplateColumns: '36px 1fr 150px 90px 90px', borderBottom: '1px solid #E4E8EF', background: '#faf8f7' }}>
                      <span className="text-center">#</span>
                      <span>Apellidos y Nombre</span>
                      <span className="text-center">Fecha</span>
                      <span className="text-center">Entrada</span>
                      <span className="text-center">Salida</span>
                    </div>

                    {salon.alumnos.map((a, idx) => (
                      <div key={a.id}
                        className="group grid items-center gap-0 px-5 py-2 transition-colors hover:bg-indigo-50/20"
                        style={{
                          gridTemplateColumns: '36px 1fr 150px 90px 90px',
                          borderBottom: idx < salon.alumnos.length - 1 ? '1px solid #f8f5f2' : 'none',
                          background: idx % 2 === 0 ? 'white' : '#fdfcfb',
                        }}>

                        <span className="text-center text-[11px] font-black text-slate-300">{a.orden}</span>

                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0"
                            style={{ background: esPrimaria ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#0B2447,#1E3A8A)', opacity: 0.85 }}>
                            {displayAlumno(a).charAt(0)}
                          </div>
                          <span className="text-sm font-semibold text-slate-700 truncate">{displayAlumno(a)}</span>
                        </div>

                        {/* Fecha por alumno */}
                        {(() => {
                          const rawFecha = fechas[key]
                          const computed = rawFecha ? addWeekdays(toNearestWeekday(rawFecha), Math.floor((idx + (offsets[key] ?? 0)) / 3)) : ''
                          const dateStr  = overrides[a.id] !== undefined ? overrides[a.id] : computed
                          const display  = dateStr ? formatFecha(dateStr) : ''
                          const esOverride = overrides[a.id] !== undefined

                          if (editingFecha === a.id) {
                            return (
                              <div className="flex justify-center">
                                <input type="date" autoFocus defaultValue={dateStr}
                                  onBlur={e => {
                                    const val = e.target.value
                                    setOverrides(prev => val ? { ...prev, [a.id]: val } : (() => { const n = { ...prev }; delete n[a.id]; return n })())
                                    guardarOverride(a.id, val)
                                    setEditingFecha(null)
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      const val = (e.target as HTMLInputElement).value
                                      setOverrides(prev => val ? { ...prev, [a.id]: val } : (() => { const n = { ...prev }; delete n[a.id]; return n })())
                                      guardarOverride(a.id, val)
                                      setEditingFecha(null)
                                    }
                                    if (e.key === 'Escape') setEditingFecha(null)
                                  }}
                                  className="text-xs rounded-lg px-2 py-0.5 outline-none"
                                  style={{ border: '1.5px solid #fecdd3', background: '#F1F5F9', color: '#0B2447', fontWeight: 700, width: '140px' }}
                                />
                              </div>
                            )
                          }

                          return (
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-xs font-bold"
                                style={{ color: display ? (esOverride ? '#1E40AF' : '#0B2447') : '#cbd5e1' }}>
                                {display || '—'}
                              </span>
                              <button onClick={() => setEditingFecha(a.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-md hover:bg-indigo-100"
                                title="Editar fecha individual" style={{ color: '#0B2447' }}>
                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                                </svg>
                              </button>
                            </div>
                          )
                        })()}

                        <div className="flex justify-center">
                          <input type="text" className="text-xs rounded-lg px-2 py-1 outline-none text-center w-16"
                            style={{ border: '1.5px solid #E4E8EF', background: 'white', color: '#374151' }}
                            onFocus={e => { e.currentTarget.style.borderColor = '#1E3A8A' }}
                            onBlur={e =>  { e.currentTarget.style.borderColor = '#E4E8EF' }}
                          />
                        </div>

                        <div className="flex justify-center">
                          <input type="text" className="text-xs rounded-lg px-2 py-1 outline-none text-center w-16"
                            style={{ border: '1.5px solid #E4E8EF', background: 'white', color: '#374151' }}
                            onFocus={e => { e.currentTarget.style.borderColor = '#1E3A8A' }}
                            onBlur={e =>  { e.currentTarget.style.borderColor = '#E4E8EF' }}
                          />
                        </div>
                      </div>
                    ))}

                    <div className="px-5 py-2 flex items-center justify-end"
                      style={{ borderTop: '1px solid #E4E8EF', background: '#faf8f7' }}>
                      <span className="text-[10px] font-black text-slate-400">
                        Total: <span style={{ color: esPrimaria ? '#16a34a' : '#0B2447' }}>{salon.alumnos.length}</span> alumno{salon.alumnos.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {!cargando && salones.length > 0 && (
          <div className="text-center py-4">
            <p className="text-[10px] text-slate-300 font-medium">
              {salones.length} salones · {totalAlumnos} alumnos · {ciclos.find(c => c.id === cicloId)?.nombre}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RolBapesPage() {
  return <RolBapesContent />
}
