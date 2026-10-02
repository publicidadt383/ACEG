'use client'

import { useEffect } from 'react'

// UI de recuperación para los error boundaries de cada portal (error.tsx).
// En Next.js 16.2 el boundary recibe `unstable_retry`; se acepta también `reset`
// (API anterior) y, como último recurso, recarga la página.
export default function ErrorState({
  error,
  retry,
  titulo = 'Algo salió mal',
  detalle = 'Ocurrió un error al cargar esta sección. Puedes intentar de nuevo; si el problema persiste, vuelve a iniciar sesión o avisa al administrador.',
}: {
  error: Error & { digest?: string }
  retry: () => void
  titulo?: string
  detalle?: string
}) {
  useEffect(() => {
    // Deja rastro en la consola del navegador para diagnóstico.
    console.error(error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.25rem',
        fontFamily: 'var(--font-manrope, system-ui, sans-serif)',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          textAlign: 'center',
          background: 'var(--surface-0, #fff)',
          border: '1px solid #e2e8f0',
          borderRadius: 18,
          padding: '2.25rem 1.75rem',
          boxShadow: '0 12px 40px -18px rgba(11, 36, 71, 0.35)',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            margin: '0 auto 1.25rem',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#eef2f8',
            color: '#0B2447',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0B2447' }}>{titulo}</h2>
        <p style={{ margin: '0.6rem 0 1.5rem', fontSize: '0.95rem', lineHeight: 1.5, color: '#475569' }}>{detalle}</p>

        {error?.digest && (
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'var(--font-plex-mono, monospace)' }}>
            Ref: {error.digest}
          </p>
        )}

        <button
          onClick={retry}
          style={{
            appearance: 'none',
            border: 'none',
            cursor: 'pointer',
            background: '#0B2447',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.95rem',
            padding: '0.7rem 1.6rem',
            borderRadius: 12,
            fontFamily: 'inherit',
          }}
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  )
}
