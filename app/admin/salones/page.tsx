'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { QrFondo, resolverFondoQr } from '@/lib/qrFondo'

/* ─────────────────────────────── tipos ─────────────────────────────── */
interface Ciclo { id: string; nombre: string; activo: boolean; anio: number; periodo: number }

interface AlumnoFila {
  id: string
  nombre: string
  apellidos: string | null
  dni: string | null
  usuario: string | null
  sexo: string | null
  fecha_nacimiento: string | null
  codigo_estudiante: string | null
  celular: string | null
  celular_apoderado: string | null
  grado: string
  grupo: string
  salon_nombre: string | null
  ciclo_nombre: string
  qr_token: string | null
}

interface SalonCard {
  grado: string
  grupo: string
  salon_nombre: string | null
  count: number
}

/* ─────────────────── campos disponibles para descarga ─────────────────── */
const CAMPOS_DISPONIBLES = [
  { key: 'apellidos',         label: 'Apellidos',            default: true  },
  { key: 'nombre',            label: 'Nombre',               default: true  },
  { key: 'dni',               label: 'DNI',                  default: true  },
  { key: 'usuario',           label: 'Usuario',              default: false },
  { key: 'grado',             label: 'Grado',                default: true  },
  { key: 'grupo',             label: 'Sección',              default: true  },
  { key: 'salon_nombre',      label: 'Nombre del salón',     default: false },
  { key: 'ciclo_nombre',      label: 'Ciclo académico',      default: false },
  { key: 'sexo',              label: 'Sexo',                 default: false },
  { key: 'fecha_nacimiento',  label: 'Fecha de nacimiento',  default: false },
  { key: 'codigo_estudiante', label: 'Código de estudiante', default: false },
  { key: 'celular',           label: 'Tel. estudiante',          default: false },
  { key: 'celular_apoderado', label: 'Tel. contacto de emergencia',       default: false },
] as const

type CampoKey = typeof CAMPOS_DISPONIBLES[number]['key']

const GRADOS_ORDEN = [
  '1° Ciclo Cocina','2° Ciclo Cocina','3° Ciclo Cocina','4° Ciclo Cocina',
  '1° Ciclo Pastelería','2° Ciclo Pastelería',
]

function splitNombreCompleto(texto: string): string {
  const words = texto.trim().split(/\s+/)
  if (words.length >= 4) return `${words.slice(-2).join(' ')} ${words.slice(0, -2).join(' ')}`
  return texto
}

function displayAlumno(a: { nombre: string; apellidos?: string | null; usuario?: string | null }): string {
  const ap = (a.apellidos ?? '').trim()
  const nm = (a.nombre ?? '').trim()
  if (ap && ap.split(/\s+/).length <= 3) return `${ap} ${nm}`.trim()
  if (ap && ap.split(/\s+/).length >= 4) return splitNombreCompleto(ap)
  if (nm) {
    if (a.usuario?.includes('.')) {
      const nmUp = nm.toUpperCase()
      for (const part of a.usuario.split('.')) {
        const pos = nmUp.indexOf(part.toUpperCase())
        if (pos > 1) return `${nm.substring(pos).trim()} ${nm.substring(0, pos).trim()}`
      }
    }
    return splitNombreCompleto(nm)
  }
  return ap || nm
}

/* ══════════════════════════════ componente ══════════════════════════════ */
interface SalonesProps { embedded?: boolean }

export function SalonesContent({ embedded = false }: SalonesProps = {}) {
  const router = useRouter()

  const [loading,   setLoading]   = useState(true)
  const [ciclos,    setCiclos]    = useState<Ciclo[]>([])
  const [cicloId,   setCicloId]   = useState('')
  const [alumnos,   setAlumnos]   = useState<AlumnoFila[]>([])
  const [salones,   setSalones]   = useState<SalonCard[]>([])
  const [view,      setView]      = useState<'salones' | 'todos'>('salones')
  const [salonSel,  setSalonSel]  = useState<SalonCard | null>(null)
  const [search,    setSearch]    = useState('')
  const [cargando,     setCargando]     = useState(false)
  const [descargando,  setDescargando]  = useState(false)

  /* QR download */
  const [qrProgreso,    setQrProgreso]    = useState(0)
  const [qrTotal,       setQrTotal]       = useState(0)
  const [qrDescargando, setQrDescargando] = useState(false)
  const [qrFondos,      setQrFondos]      = useState<QrFondo[]>([])

  /* Download modal */
  const [dlOpen,   setDlOpen]   = useState(false)
  const [dlScope,  setDlScope]  = useState<'salon' | 'todos'>('todos')
  const [campos,   setCampos]   = useState<Record<CampoKey, boolean>>(
    Object.fromEntries(CAMPOS_DISPONIBLES.map(c => [c.key, c.default])) as Record<CampoKey, boolean>
  )

  /* ── init ── */
  useEffect(() => {
    async function init() {
      // Cuando va embebido dentro de admin, el padre ya autenticó. Saltamos
      // el doble chequeo para evitar 2 queries innecesarias por carga.
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
      if (activo) { setCicloId(activo.id); await cargar(activo.id, activo.nombre) }
      const { data: fondosData } = await supabase.from('qr_fondos').select('*')
      setQrFondos((fondosData ?? []) as QrFondo[])
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  /* ── cargar alumnos del ciclo ── */
  async function cargar(cid: string, cicloNombre: string) {
    setCargando(true)

    const [{ data: mats }, { data: sals }] = await Promise.all([
      supabase.from('matriculas')
        .select('grado,grupo,alumnos(id,nombre,apellidos,dni,usuario,sexo,fecha_nacimiento,codigo_estudiante,celular,celular_apoderado,qr_token)')
        .eq('ciclo_id', cid),
      supabase.from('salones').select('grado,grupo,nombre'),
    ])

    const salonMap: Record<string, string | null> = {}
    for (const s of (sals ?? []) as { grado: string; grupo: string; nombre: string | null }[]) {
      salonMap[`${s.grado}-${s.grupo}`] = s.nombre
    }

    type AlumnoNested = { id: string; nombre: string | null; apellidos: string | null; dni: string | null; usuario: string | null; sexo: string | null; fecha_nacimiento: string | null; codigo_estudiante: string | null; celular: string | null; celular_apoderado: string | null; qr_token: string | null }
    type MatNested = { grado: string; grupo: string; alumnos: AlumnoNested | null }
    const lista: AlumnoFila[] = []
    for (const m of (mats ?? []) as unknown as MatNested[]) {
      if (!m.alumnos) continue
      const a = m.alumnos
      lista.push({
        id:               a.id,
        nombre:           a.nombre        ?? '',
        apellidos:        a.apellidos     ?? null,
        dni:              a.dni           ?? null,
        usuario:          a.usuario       ?? null,
        sexo:             a.sexo          ?? null,
        fecha_nacimiento: a.fecha_nacimiento ?? null,
        codigo_estudiante:a.codigo_estudiante ?? null,
        celular:          a.celular       ?? null,
        celular_apoderado:a.celular_apoderado ?? null,
        grado:            m.grado,
        grupo:            m.grupo,
        salon_nombre:     salonMap[`${m.grado}-${m.grupo}`] ?? null,
        ciclo_nombre:     cicloNombre,
        qr_token:         a.qr_token ?? null,
      })
    }

    lista.sort((a, b) => {
      const gi = GRADOS_ORDEN.indexOf(a.grado) - GRADOS_ORDEN.indexOf(b.grado)
      if (gi !== 0) return gi
      const gr = a.grupo.localeCompare(b.grupo)
      if (gr !== 0) return gr
      return displayAlumno(a).localeCompare(displayAlumno(b))
    })

    setAlumnos(lista)

    /* Construir cards de salones */
    const cardMap: Record<string, SalonCard> = {}
    for (const a of lista) {
      const k = `${a.grado}-${a.grupo}`
      if (!cardMap[k]) cardMap[k] = { grado: a.grado, grupo: a.grupo, salon_nombre: a.salon_nombre, count: 0 }
      cardMap[k].count++
    }
    setSalones(
      Object.values(cardMap).sort((a, b) => {
        const gi = GRADOS_ORDEN.indexOf(a.grado) - GRADOS_ORDEN.indexOf(b.grado)
        return gi !== 0 ? gi : a.grupo.localeCompare(b.grupo)
      })
    )

    // Mantiene el salón seleccionado y actualiza su conteo con los datos nuevos
    setSalonSel(prev => prev ? (cardMap[`${prev.grado}-${prev.grupo}`] ?? null) : null)
    setCargando(false)
  }

  async function cambiarCiclo(id: string) {
    setCicloId(id)
    const ciclo = ciclos.find(c => c.id === id)
    if (ciclo) await cargar(id, ciclo.nombre)
  }

  /* ── Generación de tarjeta QR (mismo diseño que mi-qr) ── */
  async function generarTarjetaQRBlob(alumno: AlumnoFila, fondoUrl: string): Promise<Blob | null> {
    if (!alumno.qr_token) return null

    const QRCode  = (await import('qrcode')).default
    const SLATE   = '#0F172A'
    const DORADO  = '#D4A847'
    const DORADO2 = '#F0C75A'
    const VINO    = '#7B1D3A'
    const BLANCO  = '#FFFFFF'
    const W = 480, H = 730
    const canvas  = document.createElement('canvas')
    canvas.width  = W * 2
    canvas.height = H * 2
    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2)

    await new Promise<void>(resolve => {
      const bg = new Image()
      bg.crossOrigin = 'anonymous'
      bg.onload = () => {
        ctx.drawImage(bg, 0, 0, W, H)
        ctx.fillStyle = 'rgba(10,15,30,0.55)'
        ctx.fillRect(0, 0, W, H)
        resolve()
      }
      bg.onerror = () => { ctx.fillStyle = '#F8F9FB'; ctx.fillRect(0, 0, W, H); resolve() }
      bg.src = fondoUrl
    })

    const gradDiv = ctx.createLinearGradient(0, 0, W, 0)
    gradDiv.addColorStop(0, 'transparent')
    gradDiv.addColorStop(0.15, DORADO)
    gradDiv.addColorStop(0.85, DORADO)
    gradDiv.addColorStop(1, 'transparent')
    ctx.fillStyle = gradDiv
    ctx.fillRect(0, 200, W, 3)

    const logoBoxSize = 80, logoBoxX = W / 2 - logoBoxSize / 2, logoBoxY = 24
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4
    ctx.fillStyle = BLANCO
    ctx.beginPath(); ctx.roundRect(logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 16); ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
    ctx.strokeStyle = DORADO; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 16); ctx.stroke()

    await new Promise<void>(resolve => {
      const img = new Image(); img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, logoBoxX + 10, logoBoxY + 10, 60, 60); resolve() }
      img.onerror = () => resolve()
      img.src = '/aceg-isotipo.png'
    })

    ctx.fillStyle = DORADO2; ctx.textAlign = 'center'
    ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillText('ESCUELA GASTRONÓMICA', W / 2, 126)
    ctx.font = 'bold 18px system-ui, sans-serif'; ctx.fillText('ACEG', W / 2, 147)
    ctx.strokeStyle = DORADO + '80'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(28, 135); ctx.lineTo(78, 135); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W - 28, 135); ctx.lineTo(W - 78, 135); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '500 10px system-ui, sans-serif'
    ctx.fillText('SISTEMA DE CONTROL DE ASISTENCIA', W / 2, 162)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '500 10px system-ui, sans-serif'
    ctx.fillText(String(new Date().getFullYear()), W / 2, 181)

    const labelW = 148, labelH = 26, labelX = W / 2 - labelW / 2, labelY = 220
    ctx.fillStyle = VINO
    ctx.beginPath(); ctx.roundRect(labelX, labelY, labelW, labelH, 13); ctx.fill()
    ctx.fillStyle = BLANCO; ctx.font = 'bold 10px system-ui, sans-serif'
    ctx.fillText('● CÓDIGO QR · ASISTENCIA', W / 2, labelY + 17)

    const QR = 220, qrX = (W - QR) / 2, qrY = 266
    ctx.shadowColor = 'rgba(15,23,42,0.12)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6
    ctx.fillStyle = BLANCO
    ctx.beginPath(); ctx.roundRect(qrX - 18, qrY - 18, QR + 36, QR + 36, 16); ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
    ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(qrX - 18, qrY - 18, QR + 36, QR + 36, 16); ctx.stroke()
    const cSize = 14, cX = qrX - 18, cY = qrY - 18, cW = QR + 36, cH = QR + 36
    ctx.strokeStyle = DORADO; ctx.lineWidth = 2.5
    ;[[cX, cY, cSize, cSize], [cX + cW, cY, -cSize, cSize], [cX, cY + cH, cSize, -cSize], [cX + cW, cY + cH, -cSize, -cSize]]
      .forEach(([x, y, dx, dy]) => {
        ctx.beginPath()
        ctx.moveTo(x as number, (y as number) + (dy as number))
        ctx.lineTo(x as number, y as number)
        ctx.lineTo((x as number) + (dx as number), y as number)
        ctx.stroke()
      })

    const qrCanvas = document.createElement('canvas')
    await QRCode.toCanvas(qrCanvas, alumno.qr_token, { width: QR, margin: 0, color: { dark: SLATE, light: '#ffffff' } })
    ctx.drawImage(qrCanvas, qrX, qrY, QR, QR)

    const sepY = qrY + QR + 46
    const gradSep = ctx.createLinearGradient(0, 0, W, 0)
    gradSep.addColorStop(0, 'transparent'); gradSep.addColorStop(0.2, 'rgba(255,255,255,0.3)')
    gradSep.addColorStop(0.8, 'rgba(255,255,255,0.3)'); gradSep.addColorStop(1, 'transparent')
    ctx.strokeStyle = gradSep; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(40, sepY); ctx.lineTo(W - 40, sepY); ctx.stroke()

    const nombreCompleto = displayAlumno(alumno)
    const infoY = sepY + 34
    ctx.fillStyle = BLANCO; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(nombreCompleto.toUpperCase(), W / 2, infoY)
    ctx.fillStyle = DORADO2; ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillText(alumno.grado, W / 2, infoY + 28)

    const pillLabel = (alumno.salon_nombre?.trim() || `SECCIÓN ${alumno.grupo}`).toUpperCase()
    ctx.font = '600 10px system-ui, sans-serif'
    const pH = 24, pW = Math.max(120, ctx.measureText(pillLabel).width + 32)
    const pX = W / 2 - pW / 2, pY = infoY + 46
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(pX, pY, pW, pH, 12); ctx.fill(); ctx.stroke()
    ctx.fillStyle = BLANCO; ctx.fillText(pillLabel, W / 2, pY + 16)

    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '400 9.5px system-ui, sans-serif'
    ctx.fillText('Código único e intransferible  ·  Solo para registro de asistencia escolar', W / 2, H - 18)
    const gradBot = ctx.createLinearGradient(0, 0, W, 0)
    gradBot.addColorStop(0, DORADO); gradBot.addColorStop(1, DORADO2)
    ctx.fillStyle = gradBot; ctx.fillRect(0, H - 6, W, 6)

    return new Promise<Blob | null>(resolve => {
      canvas.toBlob(b => resolve(b), 'image/png')
    })
  }

  async function descargarQR(lista: AlumnoFila[], nombreZip: string) {
    const conQR = lista.filter(a => a.qr_token)
    if (!conQR.length) return
    setQrTotal(conQR.length); setQrProgreso(0); setQrDescargando(true)

    if (conQR.length === 1) {
      const blob = await generarTarjetaQRBlob(conQR[0], resolverFondoQr(qrFondos, conQR[0].grado, conQR[0].grupo))
      if (blob) {
        const nombreSafe = `${conQR[0].nombre} ${conQR[0].apellidos ?? ''}`
          .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9\s-]/g, '')
          .trim().replace(/\s+/g, '-').toLowerCase()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `qr-${nombreSafe}.png`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setQrDescargando(false)
      return
    }

    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    for (let i = 0; i < conQR.length; i++) {
      const alumno = conQR[i]
      const blob = await generarTarjetaQRBlob(alumno, resolverFondoQr(qrFondos, alumno.grado, alumno.grupo))
      if (blob) {
        const nombreSafe = `${alumno.nombre} ${alumno.apellidos ?? ''}`
          .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9\s-]/g, '')
          .trim().replace(/\s+/g, '-').toLowerCase()
        zip.file(`${nombreSafe}.png`, blob)
      }
      setQrProgreso(i + 1)
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url; a.download = `${nombreZip}.zip`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    setQrDescargando(false)
  }

  /* ── alumnos filtrados ── */
  const alumnosVista = useMemo(() => {
    const base = salonSel && view === 'salones'
      ? alumnos.filter(a => a.grado === salonSel.grado && a.grupo === salonSel.grupo)
      : alumnos
    if (!search.trim()) return base
    const q = search.toLowerCase()
    return base.filter(a =>
      a.nombre.toLowerCase().includes(q) ||
      (a.apellidos ?? '').toLowerCase().includes(q) ||
      (a.dni ?? '').toLowerCase().includes(q)
    )
  }, [alumnos, salonSel, view, search])

  /* ── descarga Excel con diseño ── */
  async function descargar() {
    const camposActivos = CAMPOS_DISPONIBLES.filter(c => campos[c.key])
    if (!camposActivos.length) return

    setDescargando(true)

    const cicloActual = ciclos.find(c => c.id === cicloId)
    const fechaGen    = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })

    /* ─ helpers ─ */
    function colLetter(n: number): string {
      let s = ''
      while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
      return s
    }

    const numCols = camposActivos.length + 1
    const lastCol = colLetter(numCols)

    /* ─ paleta institucional ─ */
    const C_WINE       = 'FF6B1A1A'
    const C_WINE_MED   = 'FF7F1D1D'
    const C_WINE_HDR   = 'FF991B1B'
    const C_GOLD       = 'FFC9A84C'
    const C_GOLD_LIGHT = 'FFFDF3DC'
    const C_GRAY       = 'FF6B7280'
    const C_GRAY_LIGHT = 'FFF3F4F6'
    const C_WHITE      = 'FFFFFFFF'
    const C_TEXT       = 'FF1C1C1C'

    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Sistema ACEG'
      wb.created  = new Date()

      /* ─ fetch logo una sola vez ─ */
      let logoBuf: ArrayBuffer | null = null
      try {
        const res = await fetch('/aceg-isotipo.png')
        if (res.ok) logoBuf = await res.arrayBuffer()
      } catch { /* sin logo */ }

      const fieldWidths: Record<string, number> = {
        apellidos: 22, nombre: 18, dni: 13, usuario: 15,
        grado: 22, grupo: 9, salon_nombre: 18, ciclo_nombre: 13,
        sexo: 7, fecha_nacimiento: 17, codigo_estudiante: 17,
        celular: 14, celular_apoderado: 15,
      }

      /* ─ construye una hoja con el diseño institucional ─ */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function buildSheet(ws: any, lista: AlumnoFila[], titulo: string, logoId: number | null) {
        ws.getColumn(1).width = 12
        camposActivos.forEach((c, i) => { ws.getColumn(i + 2).width = fieldWidths[c.key] ?? 14 })

        function fillRange(r1: number, r2: number, c1: number, c2: number, color: string) {
          for (let r = r1; r <= r2; r++)
            for (let c = c1; c <= c2; c++)
              ws.getRow(r).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
        }
        function fillRow(row: number, color: string) { fillRange(row, row, 1, numCols, color) }

        ws.getRow(1).height = 42
        ws.getRow(2).height = 24
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

        ws.getRow(3).height = 7;  fillRow(3, C_GOLD)
        ws.getRow(4).height = 8;  fillRow(4, C_WHITE)

        ws.getRow(5).height = 28
        ws.mergeCells(`A5:${lastCol}5`)
        const r5 = ws.getCell('A5')
        r5.value = titulo
        r5.font  = { bold: true, size: 12, color: { argb: C_WINE }, name: 'Calibri' }
        r5.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }
        r5.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WHITE } }
        r5.border = { left: { style: 'thick', color: { argb: C_GOLD } } }

        ws.getRow(6).height = 18
        ws.mergeCells(`A6:${lastCol}6`)
        const r6 = ws.getCell('A6')
        r6.value = `Ciclo académico: ${cicloActual?.nombre ?? '—'}     ·     Total estudiantes: ${lista.length}     ·     Generado el ${fechaGen}`
        r6.font  = { size: 9, color: { argb: C_GRAY }, name: 'Calibri' }
        r6.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }
        r6.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LIGHT } }
        r6.border = { left: { style: 'thick', color: { argb: C_GOLD } } }

        ws.getRow(7).height = 6; fillRow(7, C_WHITE)

        ws.getRow(8).height = 26
        const headers = ['#', ...camposActivos.map(c => c.label.toUpperCase())]
        headers.forEach((h, i) => {
          const cell = ws.getRow(8).getCell(i + 1)
          cell.value = h
          cell.font  = { bold: true, size: 9, color: { argb: C_WHITE }, name: 'Calibri' }
          cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left', indent: i === 0 ? 0 : 1 }
          cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WINE_HDR } }
          cell.border = {
            top:    { style: 'thin',   color: { argb: C_GOLD } },
            bottom: { style: 'medium', color: { argb: C_GOLD } },
            right:  i < headers.length - 1 ? { style: 'hair', color: { argb: C_WINE } } : undefined,
          }
        })

        lista.forEach((a, idx) => {
          const rowNum  = 9 + idx
          const bgColor = idx % 2 === 1 ? C_GOLD_LIGHT : C_WHITE
          ws.getRow(rowNum).height = 18
          const rowData = [idx + 1, ...camposActivos.map(c => (a as unknown as Record<string, unknown>)[c.key] ?? '')]
          rowData.forEach((val, i) => {
            const cell = ws.getRow(rowNum).getCell(i + 1)
            cell.value = val
            cell.font  = { size: 10, color: { argb: C_TEXT }, name: 'Calibri', bold: i === 0 }
            cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left', indent: i === 0 ? 0 : 1 }
            cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
            cell.border = {
              bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
              right:  i < rowData.length - 1 ? { style: 'hair', color: { argb: 'FFE5E7EB' } } : undefined,
            }
          })
        })

        const totalRow = 9 + lista.length
        ws.getRow(totalRow).height = 20
        ws.mergeCells(`A${totalRow}:${lastCol}${totalRow}`)
        const totalCell = ws.getCell(`A${totalRow}`)
        totalCell.value = `TOTAL: ${lista.length} estudiante${lista.length !== 1 ? 's' : ''}`
        totalCell.font  = { bold: true, size: 10, color: { argb: C_WINE }, name: 'Calibri' }
        totalCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 2 }
        totalCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GOLD_LIGHT } }
        totalCell.border = { top: { style: 'medium', color: { argb: C_GOLD } }, bottom: { style: 'thin', color: { argb: C_GOLD } } }

        const footerRow = 9 + lista.length + 1
        ws.getRow(footerRow).height = 16
        ws.mergeCells(`A${footerRow}:${lastCol}${footerRow}`)
        const footer = ws.getCell(`A${footerRow}`)
        footer.value = `© ${new Date().getFullYear()} Escuela Gastronómica ACEG — Arte Culinario, Emprendimiento y Gestión`
        footer.font  = { size: 8, color: { argb: C_GRAY }, italic: true, name: 'Calibri' }
        footer.alignment = { vertical: 'middle', horizontal: 'center' }
        footer.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LIGHT } }
        footer.border = { top: { style: 'thin', color: { argb: C_GOLD } } }
      }

      if (dlScope === 'salon' && salonSel) {
        /* ── Un salón → una sola hoja ── */
        const lista  = alumnos.filter(a => a.grado === salonSel.grado && a.grupo === salonSel.grupo)
        const titulo = `Lista de Estudiantes — ${salonSel.grado}  ·  Sección ${salonSel.grupo}${salonSel.salon_nombre ? `  ·  ${salonSel.salon_nombre}` : ''}`
        const nombreArchivo = `${salonSel.grado} ${salonSel.grupo}${salonSel.salon_nombre ? ` - ${salonSel.salon_nombre}` : ''}`
        const logoId = logoBuf ? wb.addImage({ buffer: logoBuf, extension: 'png' }) : null
        const ws = wb.addWorksheet('Alumnos', {
          pageSetup: { fitToPage: true, orientation: 'portrait', margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } },
          views: [{ state: 'frozen', ySplit: 8 }],
        })
        buildSheet(ws, lista, titulo, logoId)

        const buffer = await wb.xlsx.writeBuffer()
        const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url    = URL.createObjectURL(blob)
        const link   = document.createElement('a')
        link.href = url; link.download = `${nombreArchivo}.xlsx`; link.click()
        URL.revokeObjectURL(url)

      } else {
        /* ── Todos → una pestaña por cada salón activo (grado+grupo con alumnos) ── */
        // `salones` ya está ordenado por GRADOS_ORDEN y solo contiene grupos
        // con alumnos matriculados en el ciclo activo seleccionado.
        const salonesActivos = salones.filter(s => {
          const count = alumnos.filter(a => a.grado === s.grado && a.grupo === s.grupo).length
          return count > 0
        })

        if (salonesActivos.length === 0) { setDescargando(false); return }

        // Nombre de pestaña: máx. 31 chars, sin caracteres inválidos para Excel
        function sheetName(grado: string, grupo: string): string {
          const raw = `${grado} ${grupo}`.replace(/[\\/?*[\]:]/g, '')
          return raw.length > 31 ? raw.substring(0, 31) : raw
        }

        for (const s of salonesActivos) {
          const lista = alumnos.filter(a => a.grado === s.grado && a.grupo === s.grupo)
          const titulo = `Lista de Estudiantes — ${s.grado}  ·  Sección ${s.grupo}${s.salon_nombre ? `  ·  ${s.salon_nombre}` : ''}`
          const logoId = logoBuf ? wb.addImage({ buffer: logoBuf, extension: 'png' }) : null
          const ws = wb.addWorksheet(sheetName(s.grado, s.grupo), {
            pageSetup: { fitToPage: true, orientation: 'portrait', margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } },
            views: [{ state: 'frozen', ySplit: 8 }],
          })
          buildSheet(ws, lista, titulo, logoId)
        }

        const cicloNombre = cicloActual?.nombre ?? 'ciclo'
        const buffer = await wb.xlsx.writeBuffer()
        const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url    = URL.createObjectURL(blob)
        const link   = document.createElement('a')
        link.href = url; link.download = `Estudiantes - ${cicloNombre}.xlsx`; link.click()
        URL.revokeObjectURL(url)
      }

    } finally {
      setDescargando(false)
      setDlOpen(false)
    }
  }

  function toggleCampo(key: CampoKey) {
    setCampos(prev => ({ ...prev, [key]: !prev[key] }))
  }
  function seleccionarTodos(v: boolean) {
    setCampos(Object.fromEntries(CAMPOS_DISPONIBLES.map(c => [c.key, v])) as Record<CampoKey, boolean>)
  }

  /* ── render ── */
  if (loading) return null

  const cicloActual = ciclos.find(c => c.id === cicloId)

  return (
    <div className={embedded ? '' : 'min-h-screen'} style={embedded ? undefined : { background: '#f7f5f1' }}>

      {/* ── Header (oculto en modo embedded — admin provee su propio header) ── */}
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0112 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>
            </svg>
          </div>
          <p className="font-black text-slate-800 text-sm">Salones y Estudiantes</p>
        </div>

        {/* Fondos QR + Ciclo selector */}
        <div className="ml-auto flex items-center gap-2">
          <Link href="/admin/qr-fondos"
            className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-lg transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white' }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Fondos QR
          </Link>
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

      {/* Toolbar embedded: selector de ciclo + Fondos QR */}
      {embedded && (
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <Link href="/admin/qr-fondos"
            className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-lg transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white' }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Fondos QR
          </Link>
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

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total estudiantes', value: alumnos.length, color: '#0B2447' },
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

        {/* ── View tabs + Descargar todo ── */}
        <div className="flex items-center gap-3">
          <div className="flex p-1 rounded-xl gap-1" style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
            {([
              { id: 'salones', label: 'Por salón',       icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
              { id: 'todos',   label: 'Todos los estudiantes', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
            ] as const).map(v => (
              <button key={v.id} onClick={() => { setView(v.id); setSearch(''); setSalonSel(null) }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all"
                style={view === v.id
                  ? { background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', color: 'white', boxShadow: '0 3px 12px rgba(107,15,26,.25)' }
                  : { color: '#64748b' }}>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24"
                  stroke={view === v.id ? 'white' : '#94a3b8'} strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d={v.icon}/>
                </svg>
                {v.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => descargarQR(alumnos, 'QR-todos-los-alumnos')}
              disabled={qrDescargando}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#0B2447,#4a0910)', boxShadow: '0 3px 12px rgba(107,15,26,.25)' }}>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m0 14v1M5.636 5.636l.707.707m11.314 11.314.707.707M4 12H3m18 0h-1M5.636 18.364l.707-.707M18.364 5.636l-.707.707M12 8a4 4 0 100 8 4 4 0 000-8z"/>
              </svg>
              QR todos
            </button>
            <button onClick={() => { setDlScope('todos'); setDlOpen(true) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#0d9488,#06b6d4)', boxShadow: '0 3px 12px rgba(13,148,136,.3)' }}>
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Excel todos
            </button>
          </div>
        </div>

        {cargando ? (
          <div className="flex justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#0B2447" strokeWidth="4"/>
                <path className="opacity-75" fill="#0B2447" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <p className="text-xs text-slate-400 font-semibold">Cargando estudiantes…</p>
            </div>
          </div>
        ) : alumnos.length === 0 ? (
          <div className="rounded-2xl py-16 text-center"
            style={{ background: 'white', border: '1.5px solid #E4E8EF' }}>
            <p className="text-slate-400 text-sm font-bold">No hay estudiantes matriculados en este ciclo</p>
          </div>
        ) : view === 'salones' ? (

          /* ════════════ VISTA POR SALÓN ════════════ */
          <div className="space-y-4">

            {/* Grid de cards de salones */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {salones.map(s => {
                const isActive = salonSel?.grado === s.grado && salonSel?.grupo === s.grupo
                return (
                  <button key={`${s.grado}-${s.grupo}`}
                    onClick={() => setSalonSel(isActive ? null : s)}
                    className="rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5"
                    style={{
                      background: isActive ? 'linear-gradient(135deg,#0B2447,#1E3A8A)' : 'white',
                      border: isActive ? 'none' : '1.5px solid #E4E8EF',
                      boxShadow: isActive ? '0 6px 20px rgba(107,15,26,.28)' : '0 2px 12px rgba(107,15,26,.05)',
                      color: isActive ? 'white' : 'inherit',
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

            {/* Lista de alumnos del salón seleccionado */}
            {salonSel && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 20px rgba(107,15,26,.06)' }}>
                <div className="h-1" style={{ background: 'linear-gradient(90deg,#0B2447,#1E3A8A,#1E40AF)' }} />
                <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-black text-slate-800 text-sm">
                      {salonSel.grado} — Sección {salonSel.grupo}
                      {salonSel.salon_nombre && (
                        <span className="ml-2 text-xs font-semibold text-indigo-800">· {salonSel.salon_nombre}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{salonSel.count} estudiantes</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const lista = alumnos.filter(a => a.grado === salonSel.grado && a.grupo === salonSel.grupo)
                        const nombre = salonSel.salon_nombre ?? `${salonSel.grado}-${salonSel.grupo}`
                        descargarQR(lista, `QR-${nombre}`)
                      }}
                      disabled={qrDescargando}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#0B2447,#4a0910)' }}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m0 14v1M5.636 5.636l.707.707m11.314 11.314.707.707M4 12H3m18 0h-1M5.636 18.364l.707-.707M18.364 5.636l-.707.707M12 8a4 4 0 100 8 4 4 0 000-8z"/>
                      </svg>
                      QR salón
                    </button>
                    <button onClick={() => { setDlScope('salon'); setDlOpen(true) }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white"
                      style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)' }}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                      </svg>
                      Excel salón
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', background: '#F6F8FB' }}>
                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-8">#</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Apellidos y nombre</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">DNI</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuario</th>
                        <th className="px-4 py-2.5 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {alumnos
                        .filter(a => a.grado === salonSel.grado && a.grupo === salonSel.grupo)
                        .map((a, i) => (
                          <tr key={a.id} style={{ borderBottom: '1px solid #F6F8FB' }}
                            className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-4 py-2.5 text-xs text-slate-400 font-bold">{i + 1}</td>
                            <td className="px-4 py-2.5">
                              <p className="font-bold text-slate-800 text-sm">
                                {displayAlumno(a)}
                              </p>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{a.dni ?? '—'}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-500">{a.usuario ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              <button
                                onClick={() => descargarQR([a], displayAlumno(a))}
                                disabled={!a.qr_token || qrDescargando}
                                title="Descargar QR"
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-80 disabled:opacity-30"
                                style={{ background: 'linear-gradient(135deg,#0B2447,#4a0910)' }}>
                                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

        ) : (

          /* ════════════ VISTA TODOS ════════════ */
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'white', border: '1.5px solid #E4E8EF', boxShadow: '0 4px 20px rgba(107,15,26,.06)' }}>
            <div className="h-1" style={{ background: 'linear-gradient(90deg,#0B2447,#1E3A8A,#1E40AF)' }} />

            {/* Search */}
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2" width="14" height="14"
                  fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, apellido o DNI…"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: '#F6F8FB', border: '1.5px solid #E4E8EF' }}
                />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
              {search && (
                <p className="text-xs text-slate-400 mt-2 font-semibold">
                  {alumnosVista.length} resultado{alumnosVista.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #f1f5f9', background: '#F6F8FB' }}>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-8">#</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Apellidos y nombre</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">DNI</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Grado / Sección</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Salón</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuario</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {alumnosVista.map((a, i) => (
                    <tr key={a.id} className="hover:bg-indigo-50/30 transition-colors"
                      style={{ borderBottom: '1px solid #F6F8FB' }}>
                      <td className="px-4 py-3 text-xs text-slate-400 font-bold">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-800">
                          {displayAlumno(a)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">{a.dni ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1">
                          <span className="text-xs font-bold text-slate-700">{a.grado}</span>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md"
                            style={{ background: '#F1F5F9', color: '#0B2447' }}>
                            {a.grupo}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 italic">
                        {a.salon_nombre ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{a.usuario ?? '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => descargarQR([a], displayAlumno(a))}
                          disabled={!a.qr_token || qrDescargando}
                          title="Descargar QR"
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-80 disabled:opacity-30"
                          style={{ background: 'linear-gradient(135deg,#0B2447,#4a0910)' }}>
                          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {alumnosVista.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-slate-400 text-sm font-semibold">Sin resultados para &ldquo;{search}&rdquo;</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ══ Modal de descarga ══ */}
      {dlOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setDlOpen(false) }}>

          <div className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>

            {/* Header */}
            <div className="h-1" style={{ background: 'linear-gradient(90deg,#0B2447,#1E3A8A,#1E40AF)' }} />
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#0B2447" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                <p className="font-black text-slate-800 text-sm">Configurar descarga</p>
              </div>
              <button onClick={() => setDlOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* Alcance */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2.5">Alcance</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'todos',  label: 'Todos los estudiantes', sub: `${alumnos.length} estudiantes`, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
                    { id: 'salon',  label: 'Solo este salón',   sub: salonSel ? `${salonSel.grado} ${salonSel.grupo}` : 'Selecciona un salón primero', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
                  ] as const).map(opt => (
                    <button key={opt.id}
                      onClick={() => setDlScope(opt.id)}
                      disabled={opt.id === 'salon' && !salonSel}
                      className="rounded-xl p-3 text-left transition-all disabled:opacity-40"
                      style={{
                        background: dlScope === opt.id ? 'linear-gradient(135deg,#F1F5F9,#E2E8F0)' : '#F8FAFC',
                        border: `1.5px solid ${dlScope === opt.id ? '#fecdd3' : '#E4E8EF'}`,
                      }}>
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24"
                        stroke={dlScope === opt.id ? '#0B2447' : '#94a3b8'} strokeWidth="2" className="mb-1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon}/>
                      </svg>
                      <p className="text-xs font-black" style={{ color: dlScope === opt.id ? '#0B2447' : '#475569' }}>
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Campos */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Campos a incluir</p>
                  <div className="flex gap-2">
                    <button onClick={() => seleccionarTodos(true)}
                      className="text-[10px] font-black text-indigo-900 hover:text-indigo-700">
                      Todos
                    </button>
                    <span className="text-slate-300">·</span>
                    <button onClick={() => seleccionarTodos(false)}
                      className="text-[10px] font-black text-slate-400 hover:text-slate-600">
                      Ninguno
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {CAMPOS_DISPONIBLES.map(c => (
                    <button key={c.key} onClick={() => toggleCampo(c.key)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all"
                      style={{
                        background: campos[c.key] ? '#F1F5F9' : '#F8FAFC',
                        border: `1.5px solid ${campos[c.key] ? '#fecdd3' : '#E4E8EF'}`,
                      }}>
                      <div className="w-3.5 h-3.5 rounded-md shrink-0 flex items-center justify-center transition-all"
                        style={{ background: campos[c.key] ? '#0B2447' : 'white', border: `1.5px solid ${campos[c.key] ? '#0B2447' : '#d1d5db'}` }}>
                        {campos[c.key] && (
                          <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="3.5">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold"
                        style={{ color: campos[c.key] ? '#0B2447' : '#64748b' }}>
                        {c.label}
                      </span>
                    </button>
                  ))}
                </div>

                <p className="text-[10px] text-slate-400 mt-2 font-semibold">
                  {Object.values(campos).filter(Boolean).length} de {CAMPOS_DISPONIBLES.length} campos seleccionados
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-400 font-semibold">
                Formato: Excel (.xlsx)
              </p>
              <div className="flex gap-2">
                <button onClick={() => setDlOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">
                  Cancelar
                </button>
                <button
                  onClick={() => { descargar() }}
                  disabled={descargando || !Object.values(campos).some(Boolean) || (dlScope === 'salon' && !salonSel)}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#0B2447,#1E3A8A)', boxShadow: '0 4px 14px rgba(11,36,71,.35)' }}>
                  {descargando ? (
                    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                      <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  ) : (
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                  )}
                  {descargando ? 'Generando…' : 'Descargar Excel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal progreso QR ══ */}
      {qrDescargando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-3xl p-8 flex flex-col items-center gap-4 w-72"
            style={{ background: 'white', boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#0B2447,#4a0910)' }}>
              <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="font-black text-slate-800 text-sm">Generando tarjetas QR…</p>
              <p className="text-xs text-slate-400 mt-1">{qrProgreso} de {qrTotal} estudiantes</p>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ background: '#E4E8EF', height: 8 }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${qrTotal > 0 ? (qrProgreso / qrTotal) * 100 : 0}%`, background: 'linear-gradient(90deg,#0B2447,#1E40AF)' }} />
            </div>
            <p className="text-[10px] text-slate-400 font-semibold">
              {qrTotal > 1 ? 'Se descargará un archivo .zip al finalizar' : 'Se descargará la imagen al finalizar'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminSalonesPage() {
  return <SalonesContent />
}
