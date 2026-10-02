'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

/* ─────────────────────── tipos ─────────────────────── */
interface Ciclo    { id: string; nombre: string; activo: boolean; anio: number; periodo: number }
interface AlumnoRow {
  id: string; nombre: string; apellidos: string | null; dni: string | null
  grado: string; grupo: string; salon_nombre: string | null
}
interface SalonCard { grado: string; grupo: string; salon_nombre: string | null; count: number }
interface CursoReporte {
  asigId: string; nombre: string; color: string
  promedio: number | null
}
interface AlumnoReporte extends AlumnoRow { cursos: CursoReporte[] }

const GRADOS_ORDEN = [
  '1° Primaria','2° Primaria','3° Primaria','4° Primaria','5° Primaria','6° Primaria',
  '1° Secundaria','2° Secundaria','3° Secundaria','4° Secundaria','5° Secundaria',
]

/* ─────────────────────── helpers ─────────────────────── */
function notaLiteral(n: number | null) {
  if (n === null) return '—'
  if (n >= 18) return 'AD'
  if (n >= 14) return 'A'
  if (n >= 11) return 'B'
  return 'C'
}
function notaColor(n: number | null) {
  if (n === null) return '#94a3b8'
  if (n >= 14) return '#16a34a'
  if (n >= 11) return '#d97706'
  return '#ef4444'
}

/* ══════════════════════════════ componente ══════════════════════════════ */
interface BoletinesProps { embedded?: boolean }

export function BoletinesContent({ embedded = false }: BoletinesProps = {}) {
  const router = useRouter()

  const [loading,    setLoading]    = useState(true)
  const [ciclos,     setCiclos]     = useState<Ciclo[]>([])
  const [cicloId,    setCicloId]    = useState('')
  const [alumnos,    setAlumnos]    = useState<AlumnoRow[]>([])
  const [salones,    setSalones]    = useState<SalonCard[]>([])
  const [salonSel,   setSalonSel]   = useState<SalonCard | null>(null)
  const [cargando,   setCargando]   = useState(false)

  const [reportes,         setReportes]         = useState<AlumnoReporte[]>([])
  const [cargandoReporte,  setCargandoReporte]  = useState(false)
  const [abierto,          setAbierto]          = useState<string | null>(null)

  const [dlProgreso, setDlProgreso] = useState(0)
  const [dlTotal,    setDlTotal]    = useState(0)
  const [dlActivo,   setDlActivo]   = useState(false)

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
      if (activo) { setCicloId(activo.id); await cargarAlumnos(activo.id) }
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  /* ── cargar lista de alumnos del ciclo (rápido, sin notas) ── */
  async function cargarAlumnos(cid: string) {
    setCargando(true); setSalonSel(null); setReportes([])
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

  /* ── cargar notas+asistencia para el salón seleccionado ── */
  async function cargarReporte(salon: SalonCard) {
    setSalonSel(salon); setReportes([]); setAbierto(null); setCargandoReporte(true)
    const base = alumnos.filter(a => a.grado === salon.grado && a.grupo === salon.grupo)
    if (!base.length) { setCargandoReporte(false); return }
    const alumnoIds = base.map(a => a.id)

    let asigsQ = supabase
      .from('asignaciones').select('id,cursos(nombre,color)')
      .eq('grado', salon.grado).eq('grupo', salon.grupo)
    if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
    const { data: asigs } = await asigsQ
    const asigList = (asigs ?? []) as unknown as { id: string; cursos: { nombre: string; color: string } | null }[]
    const asigIds  = asigList.map(a => a.id)

    if (!asigIds.length) {
      setReportes(base.map(a => ({ ...a, cursos: [] })))
      setCargandoReporte(false)
      return
    }

    type UniRow = { id: string; asignacion_id: string }
    type SesRow = { id: string; unidad_id: string }
    type TarRow = { id: string; sesion_id: string }
    const { data: unidades } = await supabase.from('unidades').select('id,asignacion_id').in('asignacion_id', asigIds)
    const unidadesL = (unidades ?? []) as UniRow[]
    const unidadIds = unidadesL.map(u => u.id)
    const { data: sesiones } = unidadIds.length
      ? await supabase.from('sesiones').select('id,unidad_id').in('unidad_id', unidadIds)
      : { data: [] }
    const sesionesL = (sesiones ?? []) as SesRow[]
    const sesionIds = sesionesL.map(s => s.id)
    const { data: tareas } = sesionIds.length
      ? await supabase.from('tareas').select('id,sesion_id').in('sesion_id', sesionIds)
      : { data: [] }
    const tareasL = (tareas ?? []) as TarRow[]
    const tareaIds = tareasL.map(t => t.id)

    const unidadAsig: Record<string, string> = {}
    unidadesL.forEach(u => { unidadAsig[u.id] = u.asignacion_id })
    const sesionAsig: Record<string, string> = {}
    sesionesL.forEach(s => { sesionAsig[s.id] = unidadAsig[s.unidad_id] })
    const tareaAsig: Record<string, string> = {}
    tareasL.forEach(t => { tareaAsig[t.id] = sesionAsig[t.sesion_id] })

    const { data: entregas } = tareaIds.length
      ? await supabase.from('entregas').select('id,tarea_id,alumno_id,calificaciones(nota)')
          .in('alumno_id', alumnoIds).in('tarea_id', tareaIds)
      : { data: [] }

    type EntregaT = { id: string; tarea_id: string; alumno_id: string; calificaciones: { nota: number }[] }
    const entregasList = (entregas ?? []) as EntregaT[]
    const tareaList    = tareasL

    const resultado: AlumnoReporte[] = base.map(al => ({
      ...al,
      cursos: asigList.map(a => {
        const misTareaIds = new Set(tareaList.filter(t => tareaAsig[t.id] === a.id).map(t => t.id))
        const misEntregas = entregasList.filter(e => e.alumno_id === al.id && misTareaIds.has(e.tarea_id))
        const calificadas = misEntregas.filter(e => e.calificaciones?.length > 0)
        const notas       = calificadas.map(e => e.calificaciones[0].nota)
        const promedio    = notas.length > 0 ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length * 10) / 10 : null
        return {
          asigId: a.id, nombre: a.cursos?.nombre ?? 'Curso', color: a.cursos?.color ?? '#143875',
          promedio,
        }
      }),
    }))

    setReportes(resultado)
    setCargandoReporte(false)
  }

  async function cambiarCiclo(id: string) { setCicloId(id); await cargarAlumnos(id) }

  /* ── Generación del boletín en canvas ── */
  async function generarBoletin(alumno: AlumnoReporte, cicloNombre: string): Promise<Blob | null> {
    const WINE   = '#6B1A1A'
    const WINE2  = '#991B1B'
    const GOLD   = '#C9A84C'
    const GOLD2  = '#FDF3DC'
    const WHITE  = '#FFFFFF'
    const DARK   = '#1C1C1C'
    const GRAY   = '#64748B'
    const GRAY2  = '#F3F4F6'

    const W      = 600
    const ROW    = 32
    const ROWS   = alumno.cursos.length
    const H      = 366 + (ROW * ROWS)

    const canvas  = document.createElement('canvas')
    canvas.width  = W * 2
    canvas.height = H * 2
    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2)

    /* ── fondo blanco ── */
    ctx.fillStyle = WHITE
    ctx.fillRect(0, 0, W, H)

    /* ── Header: fondo vino ── */
    ctx.fillStyle = WINE
    ctx.fillRect(0, 0, W, 130)

    /* ── Logo box blanco ── */
    const lbS = 68, lbX = 20, lbY = 31
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3
    ctx.fillStyle = WHITE
    ctx.beginPath(); ctx.roundRect(lbX, lbY, lbS, lbS, 10); ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(lbX, lbY, lbS, lbS, 10); ctx.stroke()

    await new Promise<void>(resolve => {
      const img = new Image(); img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, lbX + 8, lbY + 8, lbS - 16, lbS - 16); resolve() }
      img.onerror = () => resolve()
      img.src = '/colegio.png'
    })

    /* ── Texto header ── */
    ctx.textAlign = 'left'
    ctx.fillStyle = '#FDF3DC'; ctx.font = 'bold 10px system-ui, sans-serif'
    ctx.fillText('IES COLEGIO DE ALTA COMPETENCIA', 102, 54)
    ctx.fillStyle = WHITE; ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.fillText('EDUARDO DE HABICH', 102, 74)
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '500 10px system-ui, sans-serif'
    ctx.fillText('Juliaca · Puno · Perú', 102, 92)

    /* ── Línea dorada ── */
    ctx.fillStyle = GOLD; ctx.fillRect(0, 130, W, 3)

    /* ── "BOLETÍN DE NOTAS Y ASISTENCIA" label ── */
    ctx.fillStyle = WINE
    const bxY = 133 + 6, bxH = 28, bxX = W / 2
    ctx.textAlign = 'center'
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillText('BOLETÍN DE NOTAS', bxX, bxY + 19)

    /* ── Ciclo label ── */
    ctx.fillStyle = GRAY; ctx.font = '500 10px system-ui, sans-serif'
    ctx.fillText(cicloNombre, W / 2, bxY + bxH + 12)

    /* ── Ficha del alumno ── */
    const fiY = 133 + 6 + bxH + 20
    ctx.fillStyle = GOLD2
    ctx.beginPath(); ctx.roundRect(16, fiY, W - 32, 54, 10); ctx.fill()
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(16, fiY, W - 32, 54, 10); ctx.stroke()

    ctx.textAlign = 'left'
    const nombreCompleto = `${alumno.apellidos ?? ''} ${alumno.nombre}`.trim().toUpperCase()
    ctx.fillStyle = DARK; ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillText(nombreCompleto, 28, fiY + 18)
    ctx.fillStyle = GRAY; ctx.font = '500 10px system-ui, sans-serif'
    const gradoStr = `${alumno.grado}  ·  Sección ${alumno.grupo}${alumno.salon_nombre ? `  ·  ${alumno.salon_nombre}` : ''}`
    ctx.fillText(gradoStr, 28, fiY + 36)
    if (alumno.dni) {
      ctx.textAlign = 'right'
      ctx.fillStyle = GRAY; ctx.font = '500 10px system-ui, sans-serif'
      ctx.fillText(`DNI: ${alumno.dni}`, W - 28, fiY + 36)
      ctx.textAlign = 'left'
    }

    /* ── Tabla de cursos ── */
    const tY = fiY + 54 + 10
    const COL = [16, 320, 400, W - 16]  // 3 cols: Área/Curso | Promedio | Literal
    const tW  = W - 32

    // Encabezado tabla
    ctx.fillStyle = WINE2
    ctx.beginPath(); ctx.roundRect(16, tY, tW, 34, [6, 6, 0, 0]); ctx.fill()
    const hdrs = ['Área / Curso', 'Promedio', 'Literal']
    const alns: CanvasTextAlign[] = ['left', 'center', 'center']
    const midXs = [
      COL[0] + 10,
      (COL[1] + COL[2]) / 2,  // 360
      (COL[2] + COL[3]) / 2,  // 492
    ]
    hdrs.forEach((h, i) => {
      ctx.textAlign = alns[i]
      ctx.fillStyle = WHITE; ctx.font = 'bold 9px system-ui, sans-serif'
      ctx.fillText(h.toUpperCase(), midXs[i], tY + 21)
    })

    // Filas de cursos
    alumno.cursos.forEach((c, idx) => {
      const ry = tY + 34 + idx * ROW
      const isEven = idx % 2 === 0
      ctx.fillStyle = isEven ? WHITE : GRAY2
      ctx.fillRect(16, ry, tW, ROW)

      // Color dot del curso
      ctx.fillStyle = c.color
      ctx.beginPath(); ctx.arc(30, ry + ROW / 2, 5, 0, Math.PI * 2); ctx.fill()

      // Nombre curso
      ctx.fillStyle = DARK; ctx.font = '500 10px system-ui, sans-serif'; ctx.textAlign = 'left'
      const maxNombreW = COL[1] - 42 - 6
      let nombre = c.nombre
      while (ctx.measureText(nombre).width > maxNombreW && nombre.length > 0) {
        nombre = nombre.slice(0, -1)
      }
      if (nombre.length < c.nombre.length) nombre += '…'
      ctx.fillText(nombre, 42, ry + ROW / 2 + 4)

      // Nota
      const nc = notaColor(c.promedio)
      ctx.fillStyle = nc; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(c.promedio !== null ? String(c.promedio) : '—', midXs[1], ry + ROW / 2 + 4)

      // Literal
      const lit = notaLiteral(c.promedio)
      const litX = midXs[2] - 14, litY = ry + 6, litW = 28, litH = ROW - 12
      ctx.fillStyle = c.promedio !== null ? nc + '22' : GRAY2
      ctx.beginPath(); ctx.roundRect(litX, litY, litW, litH, 6); ctx.fill()
      ctx.fillStyle = c.promedio !== null ? nc : GRAY
      ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(lit, midXs[2], ry + ROW / 2 + 4)

      // Separador horizontal
      if (idx < alumno.cursos.length - 1) {
        ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(16, ry + ROW); ctx.lineTo(W - 16, ry + ROW); ctx.stroke()
      }
    })

    // Línea borde tabla
    const tBottom = tY + 34 + ROWS * ROW
    ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1
    ctx.strokeRect(16, tY, tW, 34 + ROWS * ROW)

    // Separadores verticales columnas en cuerpo
    ;[COL[1], COL[2]].forEach(x => {
      ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(x, tY + 34); ctx.lineTo(x, tBottom); ctx.stroke()
    })

    /* ── Fila resumen promedio general ── */
    const notasValidas = alumno.cursos.filter(c => c.promedio !== null).map(c => c.promedio!)
    const promedioGral = notasValidas.length
      ? Math.round(notasValidas.reduce((s, n) => s + n, 0) / notasValidas.length * 10) / 10
      : null

    const sumY = tBottom
    ctx.fillStyle = GOLD2
    ctx.fillRect(16, sumY, tW, 36)
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1
    ctx.strokeRect(16, sumY, tW, 36)

    ctx.fillStyle = WINE; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('PROMEDIO GENERAL', 28, sumY + 23)

    const pgc = notaColor(promedioGral)
    ctx.fillStyle = pgc; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(promedioGral !== null ? String(promedioGral) : '—', midXs[1], sumY + 23)

    const litG = notaLiteral(promedioGral)
    const lgX = midXs[2] - 14, lgY = sumY + 6, lgW = 28, lgH = 24
    ctx.fillStyle = promedioGral !== null ? pgc + '33' : GRAY2
    ctx.beginPath(); ctx.roundRect(lgX, lgY, lgW, lgH, 6); ctx.fill()
    ctx.fillStyle = promedioGral !== null ? pgc : GRAY
    ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(litG, midXs[2], sumY + 23)

    /* ── Footer ── */
    const fY = sumY + 36 + 10
    ctx.fillStyle = GRAY; ctx.font = '400 8.5px system-ui, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`© ${new Date().getFullYear()} Colegio de Alta Competencia Eduardo de Habich`, W / 2, fY + 12)
    ctx.fillText('Documento generado automáticamente · Solo para uso interno', W / 2, fY + 26)

    /* ── Franja dorada inferior ── */
    const gradBot = ctx.createLinearGradient(0, 0, W, 0)
    gradBot.addColorStop(0, GOLD); gradBot.addColorStop(1, '#F0C75A')
    ctx.fillStyle = gradBot
    ctx.fillRect(0, H - 5, W, 5)

    return new Promise<Blob | null>(resolve => { canvas.toBlob(b => resolve(b), 'image/png') })
  }

  async function descargarBoletin(alumno: AlumnoReporte) {
    const ciclo = ciclos.find(c => c.id === cicloId)
    const blob  = await generarBoletin(alumno, ciclo?.nombre ?? '')
    if (!blob) return
    const safe = `${alumno.apellidos ?? ''} ${alumno.nombre}`
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9\s-]/g, '')
      .trim().replace(/\s+/g, '-').toLowerCase()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `boletin-${safe}.png`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function descargarTodos() {
    if (!reportes.length) return
    const ciclo = ciclos.find(c => c.id === cicloId)
    setDlTotal(reportes.length); setDlProgreso(0); setDlActivo(true)

    if (reportes.length === 1) {
      await descargarBoletin(reportes[0])
      setDlActivo(false); return
    }

    const JSZip = (await import('jszip')).default
    const zip   = new JSZip()
    for (let i = 0; i < reportes.length; i++) {
      const blob = await generarBoletin(reportes[i], ciclo?.nombre ?? '')
      if (blob) {
        const safe = `${reportes[i].apellidos ?? ''} ${reportes[i].nombre}`
          .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9\s-]/g, '')
          .trim().replace(/\s+/g, '-').toLowerCase()
        zip.file(`${safe}.png`, blob)
      }
      setDlProgreso(i + 1)
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const url  = URL.createObjectURL(zipBlob)
    const tag  = document.createElement('a')
    tag.href = url
    tag.download = `boletines-${salonSel?.grado ?? ''} ${salonSel?.grupo ?? ''}.zip`
    document.body.appendChild(tag); tag.click(); document.body.removeChild(tag)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    setDlActivo(false)
  }

  /* ── render ── */
  if (loading) return null

  const cicloActual = ciclos.find(c => c.id === cicloId)

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
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <p className="font-black text-slate-800 text-sm">Boletines</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {cicloActual?.activo && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
              style={{ background: '#dcfce7', color: '#16a34a' }}>
              ACTIVO
            </span>
          )}
          <select value={cicloId} onChange={e => cambiarCiclo(e.target.value)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg outline-none"
            style={{ background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #fecdd3' }}>
            {ciclos.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}{c.activo ? ' ★' : ''}</option>
            ))}
          </select>
        </div>
      </header>
      )}

      {/* Toolbar embedded: selector de ciclo */}
      {embedded && (
        <div className="mb-5 flex items-center justify-end gap-2">
          {cicloActual?.activo && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
              style={{ background: '#dcfce7', color: '#16a34a' }}>
              ACTIVO
            </span>
          )}
          <select value={cicloId} onChange={e => cambiarCiclo(e.target.value)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg outline-none"
            style={{ background: '#F1F5F9', color: '#0B2447', border: '1.5px solid #fecdd3' }}>
            {ciclos.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}{c.activo ? ' ★' : ''}</option>
            ))}
          </select>
        </div>
      )}

      <div className={embedded ? 'space-y-5' : 'max-w-5xl mx-auto px-4 py-6 space-y-5'}>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total alumnos', value: alumnos.length, color: '#0B2447' },
            { label: 'Salones',       value: salones.length, color: '#1E40AF' },
            { label: 'Ciclo',         value: cicloActual?.nombre ?? '—', color: '#0d9488' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-4 text-center"
              style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 2px 12px rgba(107,15,26,.05)' }}>
              <p className="font-black text-xl" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Instrucción */}
        <div className="rounded-2xl p-4 flex items-start gap-3"
          style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}>
          <svg className="shrink-0 mt-0.5" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p className="text-xs text-amber-700 font-semibold leading-relaxed">
            Selecciona un salón para ver y descargar los boletines. El boletín incluye el promedio por curso.
            Las notas se calculan a partir de las calificaciones registradas en el LMS.
          </p>
        </div>

        {cargando ? (
          <div className="flex justify-center py-20">
            <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#0B2447" strokeWidth="4"/>
              <path className="opacity-75" fill="#0B2447" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </div>
        ) : alumnos.length === 0 ? (
          <div className="rounded-2xl py-16 text-center"
            style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
            <p className="text-slate-400 text-sm font-bold">No hay alumnos matriculados en este ciclo</p>
          </div>
        ) : (
          <div className="space-y-4">

            {/* Grid de salones */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {salones.map(s => {
                const isActive = salonSel?.grado === s.grado && salonSel?.grupo === s.grupo
                return (
                  <button key={`${s.grado}-${s.grupo}`}
                    onClick={() => { if (!isActive) cargarReporte(s); else { setSalonSel(null); setReportes([]) } }}
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
                    <p className="text-[10px] mt-1.5 font-semibold"
                      style={{ color: isActive ? 'rgba(255,255,255,.6)' : '#cbd5e1' }}>
                      {s.count} {s.count === 1 ? 'alumno' : 'alumnos'}
                    </p>
                  </button>
                )
              })}
            </div>

            {/* Panel del salón seleccionado */}
            {salonSel && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 20px rgba(107,15,26,.06)' }}>
                <div className="h-1" style={{ background: 'linear-gradient(90deg,#0B2447,#1E3A8A,#1E40AF)' }} />

                {/* Cabecera del panel */}
                <div className="p-4 flex items-center justify-between gap-3 flex-wrap border-b border-slate-100">
                  <div>
                    <p className="font-black text-slate-800 text-sm">
                      {salonSel.grado} — Sección {salonSel.grupo}
                      {salonSel.salon_nombre && (
                        <span className="ml-2 text-xs font-semibold text-indigo-800">· {salonSel.salon_nombre}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{salonSel.count} alumnos</p>
                  </div>
                  <button
                    onClick={descargarTodos}
                    disabled={dlActivo || cargandoReporte || reportes.length === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', boxShadow: '0 3px 12px rgba(107,15,26,.25)' }}>
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    Descargar todos
                  </button>
                </div>

                {cargandoReporte ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#0B2447" strokeWidth="4"/>
                      <path className="opacity-75" fill="#0B2447" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    <p className="text-xs text-slate-400 font-semibold">Cargando calificaciones…</p>
                  </div>
                ) : reportes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <p className="text-sm text-slate-400 font-semibold">Sin datos de calificaciones para este salón</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {reportes.map(al => {
                      const notasVal = al.cursos.filter(c => c.promedio !== null).map(c => c.promedio!)
                      const pgral    = notasVal.length ? Math.round(notasVal.reduce((s, n) => s + n, 0) / notasVal.length * 10) / 10 : null
                      const isOpen   = abierto === al.id

                      return (
                        <div key={al.id}>
                          {/* Fila resumen alumno */}
                          <div className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/30 transition-colors">
                            {/* Avatar */}
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-black text-white"
                              style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                              {(al.apellidos ?? al.nombre).charAt(0).toUpperCase()}
                            </div>
                            {/* Nombre + stats */}
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-800 text-sm truncate">
                                {`${al.apellidos ?? ''} ${al.nombre}`.trim()}
                              </p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs font-bold" style={{ color: notaColor(pgral) }}>
                                  {pgral !== null ? `${pgral} (${notaLiteral(pgral)})` : 'Sin notas'}
                                </span>
                              </div>
                            </div>
                            {/* Botones */}
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => setAbierto(isOpen ? null : al.id)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-indigo-100"
                                title={isOpen ? 'Ocultar cursos' : 'Ver cursos'}>
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24"
                                  stroke="#0B2447" strokeWidth="2"
                                  className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                                  <polyline points="6 9 12 15 18 9"/>
                                </svg>
                              </button>
                              <button
                                onClick={() => descargarBoletin(al)}
                                disabled={dlActivo}
                                title="Descargar boletín"
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-80 disabled:opacity-40"
                                style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Detalle cursos (expandible) */}
                          {isOpen && (
                            <div className="px-4 pb-4 space-y-3" style={{ background: '#F6F8FB' }}>

                              {/* ── Tabla de cursos ── */}
                              <div className="rounded-xl overflow-hidden"
                                style={{ border: '1px solid #E4E8EF' }}>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr style={{ background: '#F1F5F9' }}>
                                      <th className="text-left px-3 py-2 font-black text-slate-500 uppercase tracking-wider">Curso</th>
                                      <th className="text-center px-3 py-2 font-black text-slate-500 uppercase tracking-wider w-16">Promedio</th>
                                      <th className="text-center px-3 py-2 font-black text-slate-500 uppercase tracking-wider w-16">Literal</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {al.cursos.map((c, i) => (
                                      <tr key={c.asigId}
                                        style={{ background: i % 2 ? '#F6F8FB' : 'white', borderTop: '1px solid #f1f5f9' }}>
                                        <td className="px-3 py-2.5">
                                          <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                                            <span className="font-semibold text-slate-700">{c.nombre}</span>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-center font-bold" style={{ color: notaColor(c.promedio) }}>
                                          {c.promedio ?? '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                          <span className="inline-flex items-center justify-center w-7 h-5 rounded-md text-[10px] font-black"
                                            style={{
                                              background: c.promedio !== null ? notaColor(c.promedio) + '22' : '#f1f5f9',
                                              color: c.promedio !== null ? notaColor(c.promedio) : '#94a3b8',
                                            }}>
                                            {notaLiteral(c.promedio)}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal progreso descarga */}
      {dlActivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-3xl p-8 flex flex-col items-center gap-4 w-72"
            style={{ background: 'white', boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
              <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="font-black text-slate-800 text-sm">Generando boletines…</p>
              <p className="text-xs text-slate-400 mt-1">{dlProgreso} de {dlTotal} alumnos</p>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ background: '#E4E8EF', height: 8 }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${dlTotal > 0 ? (dlProgreso / dlTotal) * 100 : 0}%`, background: 'linear-gradient(90deg,#0B2447,#1E3A8A,#1E40AF)' }} />
            </div>
            <p className="text-[10px] text-slate-400 font-semibold">
              {dlTotal > 1 ? 'Se descargará un archivo .zip al finalizar' : 'Se descargará la imagen al finalizar'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminBoletinesPage() {
  return <BoletinesContent />
}
