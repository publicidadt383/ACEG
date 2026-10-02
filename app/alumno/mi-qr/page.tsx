'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getSesionAlumno } from '@/lib/auth'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import { QrFondo, resolverFondoQr } from '@/lib/qrFondo'

export default function MiQrPage() {
  const router      = useRouter()
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  const [qrToken,      setQrToken]      = useState<string | null>(null)
  const [nombre,       setNombre]       = useState('')
  const [grado,        setGrado]        = useState('')
  const [grupo,        setGrupo]        = useState('')
  const [salonNombre,  setSalonNombre]  = useState('')
  const [loading,      setLoading]      = useState(true)
  const [descargando,  setDescargando]  = useState(false)
  const [qrFondos,     setQrFondos]     = useState<QrFondo[]>([])

  useEffect(() => {
    async function init() {
      const sesion = await getSesionAlumno<{ nombre: string; apellidos: string; grado: string; grupo: string; qr_token: string | null }>('nombre,apellidos,grado,grupo,qr_token')
      if (!sesion) { router.push('/login'); return }
      const { user, alumno } = sesion
      setNombre(`${alumno.apellidos} ${alumno.nombre}`)
      setGrado(alumno.grado)
      setGrupo(alumno.grupo)
      setQrToken(alumno.qr_token)

      // Usar grado/grupo de matriculas (formato normalizado, igual al de salones)
      const { data: ciclo } = await supabase
        .from('ciclos').select('id').eq('activo', true).eq('tipo', 'lectivo').maybeSingle()

      let gradoSalon = alumno.grado
      let grupoSalon = alumno.grupo

      if (ciclo) {
        const { data: mat } = await supabase
          .from('matriculas').select('grado,grupo')
          .eq('alumno_id', user.id)
          .eq('ciclo_id', ciclo.id)
          .maybeSingle()
        if (mat) { gradoSalon = mat.grado; grupoSalon = mat.grupo }
      }

      const { data: salon } = await supabase
        .from('salones').select('nombre')
        .eq('grado', gradoSalon).eq('grupo', grupoSalon)
        .maybeSingle()
      setSalonNombre(salon?.nombre ?? '')
      const { data: fondosData } = await supabase.from('qr_fondos').select('*')
      setQrFondos((fondosData ?? []) as QrFondo[])
      setLoading(false)
    }
    init()
  }, [router])

  async function handleDescargar() {
    const qrEl = qrCanvasRef.current
    if (!qrEl || !qrToken) return
    setDescargando(true)

    // Paleta: pizarra oscuro + dorado + vino como acento
    const DORADO  = '#D4A847'
    const DORADO2 = '#F0C75A'
    const VINO    = '#7B1D3A'
    const BLANCO  = '#FFFFFF'
    const FONDO   = '#F8F9FB'   // fondo cuerpo tarjeta

    const W = 480, H = 730
    const canvas = document.createElement('canvas')
    canvas.width  = W * 2
    canvas.height = H * 2
    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2)

    // ── Fondo: fondoUni.png ───────────────────────────────────────
    await new Promise<void>(resolve => {
      const bg = new Image()
      bg.crossOrigin = 'anonymous'   // evita tainted-canvas en Vercel
      bg.onload = () => {
        ctx.drawImage(bg, 0, 0, W, H)
        ctx.fillStyle = 'rgba(10,15,30,0.55)'
        ctx.fillRect(0, 0, W, H)
        resolve()
      }
      bg.onerror = () => {
        ctx.fillStyle = FONDO
        ctx.fillRect(0, 0, W, H)
        resolve()
      }
      bg.src = resolverFondoQr(qrFondos, grado, grupo)
    })

    // Línea dorada divisoria header/cuerpo
    const gradDiv = ctx.createLinearGradient(0, 0, W, 0)
    gradDiv.addColorStop(0, 'transparent')
    gradDiv.addColorStop(0.15, DORADO)
    gradDiv.addColorStop(0.85, DORADO)
    gradDiv.addColorStop(1, 'transparent')
    ctx.fillStyle = gradDiv
    ctx.fillRect(0, 200, W, 3)

    // ── Logo sobre fondo blanco redondeado ────────────────────────
    const logoBoxSize = 80
    const logoBoxX = W / 2 - logoBoxSize / 2
    const logoBoxY = 24

    // Sombra del cuadro blanco
    ctx.shadowColor   = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur    = 16
    ctx.shadowOffsetY = 4
    ctx.fillStyle = BLANCO
    ctx.beginPath()
    ctx.roundRect(logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 16)
    ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0

    // Borde dorado sobre el cuadro del logo
    ctx.strokeStyle = DORADO
    ctx.lineWidth   = 2
    ctx.beginPath()
    ctx.roundRect(logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 16)
    ctx.stroke()

    await new Promise<void>(resolve => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const pad = 10
        ctx.drawImage(img, logoBoxX + pad, logoBoxY + pad, logoBoxSize - pad * 2, logoBoxSize - pad * 2)
        resolve()
      }
      img.onerror = () => resolve()
      img.src = '/aceg-isotipo.png'
    })

    // ── Nombre institución (2 líneas) ────────────────────────────
    ctx.fillStyle = DORADO2
    ctx.textAlign = 'center'
    ctx.font      = 'bold 12px system-ui, sans-serif'
    ctx.fillText('ESCUELA GASTRONÓMICA', W / 2, 126)
    ctx.font      = 'bold 18px system-ui, sans-serif'
    ctx.fillText('ACEG', W / 2, 147)

    // Líneas decorativas laterales (centradas entre las dos líneas)
    ctx.strokeStyle = DORADO + '80'
    ctx.lineWidth   = 1
    ctx.beginPath(); ctx.moveTo(28, 135); ctx.lineTo(78, 135); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W - 28, 135); ctx.lineTo(W - 78, 135); ctx.stroke()

    // Subtítulo
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font      = '500 10px system-ui, sans-serif'
    ctx.fillText('SISTEMA DE CONTROL DE ASISTENCIA', W / 2, 162)

    // Año
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font      = '500 10px system-ui, sans-serif'
    ctx.fillText(String(new Date().getFullYear()), W / 2, 181)

    // ── Etiqueta "CÓDIGO QR" ──────────────────────────────────────
    const labelW = 148, labelH = 26
    const labelX = W / 2 - labelW / 2
    const labelY = 220
    ctx.fillStyle = VINO
    ctx.beginPath()
    ctx.roundRect(labelX, labelY, labelW, labelH, 13)
    ctx.fill()
    ctx.fillStyle = BLANCO
    ctx.font      = 'bold 10px system-ui, sans-serif'
    ctx.fillText('● CÓDIGO QR · ASISTENCIA', W / 2, labelY + 17)

    // ── Contenedor QR ─────────────────────────────────────────────
    const QR  = 220
    const qrX = (W - QR) / 2
    const qrY = 266

    ctx.shadowColor   = 'rgba(15,23,42,0.12)'
    ctx.shadowBlur    = 20
    ctx.shadowOffsetY = 6
    ctx.fillStyle     = BLANCO
    ctx.beginPath()
    ctx.roundRect(qrX - 18, qrY - 18, QR + 36, QR + 36, 16)
    ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0

    // Borde sutil contenedor QR
    ctx.strokeStyle = '#E2E8F0'
    ctx.lineWidth   = 1.5
    ctx.beginPath()
    ctx.roundRect(qrX - 18, qrY - 18, QR + 36, QR + 36, 16)
    ctx.stroke()

    // Esquinas doradas decorativas
    const cSize = 14
    const cX = qrX - 18, cY = qrY - 18
    const cW = QR + 36, cH = QR + 36
    ctx.strokeStyle = DORADO
    ctx.lineWidth   = 2.5
    ;[
      [cX, cY, cSize, 0, cSize, 0],
      [cX + cW, cY, -cSize, 0, -cSize, 0],
      [cX, cY + cH, cSize, 0, cSize, 0],
      [cX + cW, cY + cH, -cSize, 0, -cSize, 0],
    ].forEach(([x, y, dx1]) => {
      ctx.beginPath()
      ctx.moveTo(x as number, (y as number) + (y === cY ? cSize : -cSize))
      ctx.lineTo(x as number, y as number)
      ctx.lineTo((x as number) + (dx1 as number), y as number)
      ctx.stroke()
    })

    ctx.drawImage(qrEl, qrX, qrY, QR, QR)

    // ── Separador ─────────────────────────────────────────────────
    const sepY = qrY + QR + 46
    const gradSep = ctx.createLinearGradient(0, 0, W, 0)
    gradSep.addColorStop(0,   'transparent')
    gradSep.addColorStop(0.2, 'rgba(255,255,255,0.3)')
    gradSep.addColorStop(0.8, 'rgba(255,255,255,0.3)')
    gradSep.addColorStop(1,   'transparent')
    ctx.strokeStyle = gradSep
    ctx.lineWidth   = 1
    ctx.beginPath(); ctx.moveTo(40, sepY); ctx.lineTo(W - 40, sepY); ctx.stroke()

    // ── Datos del alumno ──────────────────────────────────────────
    const infoY = sepY + 34

    ctx.fillStyle = BLANCO
    ctx.font      = 'bold 22px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(nombre.toUpperCase(), W / 2, infoY)

    ctx.fillStyle = DORADO2
    ctx.font      = '600 13px system-ui, sans-serif'
    ctx.fillText(grado, W / 2, infoY + 28)

    // Pill salón (sobrenombre); si no existe, mostrar la sección como fallback
    const pillLabel = (salonNombre?.trim() || `SECCIÓN ${grupo}`).toUpperCase()
    ctx.font = '600 10px system-ui, sans-serif'
    const pH = 24, pW = Math.max(120, ctx.measureText(pillLabel).width + 32)
    const pX = W / 2 - pW / 2, pY = infoY + 46
    ctx.fillStyle   = 'rgba(255,255,255,0.12)'
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth   = 1
    ctx.beginPath(); ctx.roundRect(pX, pY, pW, pH, 12); ctx.fill(); ctx.stroke()
    ctx.fillStyle = BLANCO
    ctx.fillText(pillLabel, W / 2, pY + 16)

    // ── Footer ────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font      = '400 9.5px system-ui, sans-serif'
    ctx.fillText('Código único e intransferible  ·  Solo para registro de asistencia escolar', W / 2, H - 18)

    // Franja dorada inferior
    const gradBot = ctx.createLinearGradient(0, 0, W, 0)
    gradBot.addColorStop(0, DORADO)
    gradBot.addColorStop(1, DORADO2)
    ctx.fillStyle = gradBot
    ctx.fillRect(0, H - 6, W, 6)

    // ── Descargar — usar toBlob() en lugar de toDataURL() para evitar
    //    URLs de datos enormes que fallan en Windows al abrir el archivo ──
    const nombreSafe = nombre
      .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quita tildes: á→a
      .replace(/[^a-zA-Z0-9\s-]/g, '')                   // sólo alfanum
      .trim().replace(/\s+/g, '-').toLowerCase()

    await new Promise<void>(resolve => {
      canvas.toBlob(blob => {
        if (!blob) { resolve(); return }
        const url  = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href     = url
        link.download = `qr-asistencia-${nombreSafe}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        resolve()
      }, 'image/png')
    })

    setDescargando(false)
  }

  if (loading) return null

  return (
    <div className="max-w-sm mx-auto flex flex-col items-center gap-6">

      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-black text-slate-800">Mi Código QR</h1>
        <p className="text-sm text-slate-400 mt-1">Muéstralo a tu docente para registrar asistencia</p>
      </div>

      {/* Tarjeta QR */}
      {qrToken ? (
        <>
          <div className="w-full rounded-3xl overflow-hidden"
            style={{ background: 'white', border: '1.5px solid #ccfbf1', boxShadow: '0 16px 48px rgba(13,148,136,.12)' }}>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg,#0F766E,#14B8A6,#5EEAD4)' }} />
            <div className="p-8 flex flex-col items-center gap-5">

              {/* QR visible */}
              <div className="p-4 rounded-2xl" style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }}>
                <QRCodeSVG value={qrToken} size={220} level="H" bgColor="transparent" fgColor="#0f766e" />
              </div>

              {/* Info alumno */}
              <div className="text-center">
                <p className="font-black text-slate-800 text-base">{nombre}</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: '#0d9488' }}>
                  {grado} — Sección {grupo}
                </p>
              </div>

              {/* Badge */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-full"
                style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }}>
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                <span className="text-xs font-bold text-teal-700">Código único e intransferible</span>
              </div>
            </div>
          </div>

          {/* Canvas oculto para descarga — visibility:hidden en lugar de display:none
              para que el canvas sí renderice el QR antes de capturarlo           */}
          <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', pointerEvents: 'none' }}>
            <QRCodeCanvas
              ref={qrCanvasRef}
              value={qrToken}
              size={460}
              level="H"
              bgColor="#ffffff"
              fgColor="#0F172A"
            />
          </div>

          {/* Botón descargar */}
          <button
            onClick={handleDescargar}
            disabled={descargando}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-black text-white transition-all hover:opacity-90 active:scale-[.98] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#0F766E,#14B8A6)', boxShadow: '0 8px 24px rgba(13,148,136,.3)' }}>
            {descargando ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Generando…
              </>
            ) : (
              <>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Descargar tarjeta QR
              </>
            )}
          </button>
        </>
      ) : (
        <div className="rounded-3xl p-12 flex items-center justify-center"
          style={{ background: 'white', border: '1.5px solid #ccfbf1' }}>
          <p className="text-sm text-slate-400 font-medium">
            Tu código QR aún no fue generado. Contacta al administrador.
          </p>
        </div>
      )}

      {/* Instrucción */}
      <div className="w-full rounded-2xl p-4 flex items-start gap-3"
        style={{ background: '#f0fdfa', border: '1.5px solid #ccfbf1' }}>
        <svg className="text-teal-400 shrink-0 mt-0.5" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p className="text-xs text-teal-700 font-medium leading-relaxed">
          Cuando tu docente inicie el pase de lista, muestra este QR para que pueda escanearlo y registrar tu asistencia automáticamente.
        </p>
      </div>
    </div>
  )
}
