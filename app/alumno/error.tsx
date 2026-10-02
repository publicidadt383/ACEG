'use client'

import ErrorState from '@/components/ErrorState'

export default function Error({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string }
  unstable_retry?: () => void
  reset?: () => void
}) {
  const retry = unstable_retry ?? reset ?? (() => { if (typeof window !== 'undefined') window.location.reload() })
  return (
    <ErrorState
      error={error}
      retry={retry}
      titulo="No se pudo cargar el portal"
      detalle="Ocurrió un error en el portal del alumno. Intenta de nuevo; si persiste, recarga la página o vuelve a iniciar sesión."
    />
  )
}
