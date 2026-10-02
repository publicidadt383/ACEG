'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Spinner from '@/components/Spinner'

/**
 * Página del enlace que llevaba el QR institucional del personal. El marcado
 * por QR fue retirado (ahora es solo por ubicación), así que quien escanee un
 * QR viejo con la cámara aterriza aquí y se le lleva al marcado por ubicación.
 */
export default function AsistenciaPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/escanear') }, [router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: 'linear-gradient(135deg, #F6F8FB 0%, #EFF3FA 50%, #E4E8EF 100%)' }}>
      <Spinner cls="h-8 w-8" />
      <p className="text-sm font-bold text-slate-500">Llevándote al marcado por ubicación…</p>
    </div>
  )
}
