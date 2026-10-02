'use client'

import { useEffect, useRef, useState } from 'react'

interface QrScannerProps {
  onScan: (token: string) => void
  disabled?: boolean
  rawMode?: boolean  // si true, devuelve el texto decodificado directamente sin parsear URL
  continuous?: boolean  // si true, no detiene la cámara tras leer: sigue escaneando con cooldown
}

// Tiempo de espera tras una lectura válida en modo continuo (evita re-disparar el
// mismo QR mientras sigue en cuadro o leer dos veces al alumno).
const COOLDOWN_MS = 2500

export default function QrScanner({ onScan, disabled, rawMode = false, continuous = false }: QrScannerProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<unknown>(null)
  const scannedRef = useRef(false)
  const cooldownRef = useRef(false)
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disabledRef = useRef(!!disabled)
  const [activo, setActivo] = useState(false)
  const [error, setError] = useState('')

  // Mantener la última prop `disabled` accesible dentro del callback de la cámara
  useEffect(() => { disabledRef.current = !!disabled }, [disabled])

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current)
      stopScanner()
    }
  }, [])

  async function stopScanner() {
    if (scannerRef.current) {
      try {
        const s = scannerRef.current as { stop: () => Promise<void>; clear: () => Promise<void> }
        await s.stop(); await s.clear()
      } catch { /* ignorar */ }
      scannerRef.current = null
    }
    setActivo(false)
  }

  async function startScanner() {
    if (!divRef.current) return
    setError('')
    scannedRef.current = false
    cooldownRef.current = false
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          // En modo continuo no usamos scannedRef; el cooldown evita re-disparos.
          if (!continuous && scannedRef.current) return
          if (continuous && (cooldownRef.current || disabledRef.current)) return

          // Extraer el token según el modo (texto crudo o ?token= de una URL)
          let token: string | null = null
          if (rawMode) {
            token = decodedText.trim() || null
          } else {
            try {
              token = new URL(decodedText).searchParams.get('token')
              if (!token) { setError('El QR no contiene un token válido.'); return }
            } catch { setError('El QR no contiene una URL válida.'); return }
          }
          if (!token) return

          if (continuous) {
            cooldownRef.current = true
            if (cooldownTimer.current) clearTimeout(cooldownTimer.current)
            cooldownTimer.current = setTimeout(() => { cooldownRef.current = false }, COOLDOWN_MS)
            onScan(token)
          } else {
            scannedRef.current = true
            stopScanner()
            onScan(token)
          }
        },
        () => {}
      )
      setActivo(true)
    } catch (err) {
      setError('No se pudo acceder a la cámara. Verifica los permisos.')
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        id="qr-reader"
        ref={divRef}
        className="w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50"
        style={{ minHeight: activo ? 300 : 0 }}
      />

      {!activo ? (
        <button
          onClick={startScanner}
          disabled={disabled}
          className="w-full relative overflow-hidden py-3.5 rounded-xl font-bold text-sm text-white shadow-lg shadow-red-900/20 active:scale-[0.98] transition-all disabled:opacity-50 group"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-red-900 via-red-700 to-red-600 group-hover:from-red-800 group-hover:to-red-500 transition-all" />
          <span className="relative flex items-center justify-center gap-2">
            <span>📷</span> Activar cámara
          </span>
        </button>
      ) : (
        <button
          onClick={stopScanner}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl transition-colors border border-gray-200"
        >
          Detener cámara
        </button>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-xs w-full">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
