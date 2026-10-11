'use client'

import { useEffect } from 'react'

// Boundary de último recurso: se activa si falla el propio root layout.
// Debe declarar su propio <html>/<body> porque reemplaza al layout raíz, y no
// puede depender de fuentes/estilos globales (van inline).
export default function GlobalError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string }
  unstable_retry?: () => void
  reset?: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const retry = unstable_retry ?? reset ?? (() => { if (typeof window !== 'undefined') window.location.reload() })

  return (
    <html lang="es">
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1.25rem',
            background: '#F7F7F6',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: 460,
              width: '100%',
              textAlign: 'center',
              background: '#fff',
              border: '1px solid #DCDEDE',
              borderRadius: 18,
              padding: '2.25rem 1.75rem',
              boxShadow: '0 12px 40px -18px rgba(29,24,21, 0.35)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1D1815' }}>
              Algo salió mal
            </h2>
            <p style={{ margin: '0.6rem 0 1.5rem', fontSize: '0.95rem', lineHeight: 1.5, color: '#5C5450' }}>
              Ocurrió un error inesperado. Intenta de nuevo; si el problema persiste, recarga la página.
            </p>
            <button
              onClick={retry}
              style={{
                border: 'none',
                cursor: 'pointer',
                background: '#1D1815',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.95rem',
                padding: '0.7rem 1.6rem',
                borderRadius: 12,
              }}
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
