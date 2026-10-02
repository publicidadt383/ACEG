'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'
import CambiarPassword from './CambiarPassword'

export interface PortalShellProps {
  title: string
  sectionTitle?: string
  onBack?: () => void
  backLabel?: string
  onLogout?: () => void
  userName?: string
  userRoleLabel?: string
  banner?: ReactNode
  topRightSlot?: ReactNode
  /** Muestra el botón de "Cambiar contraseña" (true por defecto). */
  showCambiarPassword?: boolean
  children: ReactNode
  /** Color de acento principal (navy por defecto) */
  accent?: string
  /** Color del page background */
  pageBg?: string
  /** Ancho máximo del contenido */
  maxWidth?: string | number
}

const SANS = "var(--font-manrope), -apple-system, 'Segoe UI', system-ui, sans-serif"

export default function PortalShell({
  title,
  sectionTitle,
  onBack,
  backLabel = 'Inicio',
  onLogout,
  userName,
  userRoleLabel,
  banner,
  topRightSlot,
  showCambiarPassword = true,
  children,
  accent  = '#0B2447',
  pageBg  = '#F6F8FB',
  maxWidth = '1280px',
}: PortalShellProps) {
  return (
    <div style={{ minHeight: '100vh', background: pageBg, display: 'flex', flexDirection: 'column', fontFamily: SANS, color: '#0F172A' }}>

      {/* En móvil, un header sticky con backdrop-filter recalcula el blur en cada
          frame del scroll → jank/parpadeo. Como el fondo ya es casi opaco, lo
          cambiamos por sólido en pantallas chicas/táctiles. */}
      <style>{`
        @media (max-width: 768px), (hover: none) {
          .psh-header {
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            background: rgba(255,255,255,.98) !important;
          }
        }
      `}</style>

      {banner}

      {/* ── Top bar sticky ──────────────────────────────────────── */}
      <header className="psh-header" style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'rgba(255,255,255,.92)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        borderBottom: '1px solid #E4E8EF',
        boxShadow: '0 1px 2px rgba(15,23,42,.03), 0 4px 12px rgba(15,23,42,.04)',
      }}>
        {/* Hairline acento del rol */}
        <div aria-hidden style={{
          height: 3,
          background: `linear-gradient(90deg, ${accent} 0%, ${accent}aa 30%, ${accent}55 60%, transparent 100%)`,
        }} />

        <div style={{
          maxWidth, margin: '0 auto',
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px', flexWrap: 'wrap',
        }}>
          {/* Izquierda: botón Inicio / Logo + título */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            {onBack ? (
              <button
                onClick={onBack}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 14px', borderRadius: '10px',
                  background: '#F1F5F9',
                  border: '1px solid #E4E8EF',
                  color: '#0F172A',
                  fontFamily: SANS,
                  fontSize: '13px', fontWeight: 600,
                  letterSpacing: '-.003em',
                  cursor: 'pointer',
                  transition: 'all .14s ease',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#E2E8F0'; e.currentTarget.style.borderColor = '#CBD5E1' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#E4E8EF' }}
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {backLabel}
              </button>
            ) : (
              <div style={{
                position: 'relative', width: 38, height: 38, borderRadius: '50%',
                overflow: 'hidden', border: '1.5px solid #E4E8EF',
                background: '#FFFFFF', flexShrink: 0,
                boxShadow: '0 2px 8px rgba(15,23,42,.06)',
              }}>
                <Image src="/aceg-isotipo.png" alt="Logo" fill sizes="38px" style={{ objectFit: 'contain' }} />
              </div>
            )}

            <div style={{ minWidth: 0 }}>
              <p style={{
                fontSize: '14px', fontWeight: 700, color: '#0F172A',
                lineHeight: 1.15, letterSpacing: '-.012em',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                margin: 0,
              }}>
                {sectionTitle ?? title}
              </p>
              {sectionTitle && (
                <p style={{
                  fontSize: '10.5px', fontWeight: 700, color: '#94A3B8',
                  letterSpacing: '.16em', textTransform: 'uppercase',
                  margin: '2px 0 0',
                }}>
                  {title}
                </p>
              )}
            </div>
          </div>

          {/* Derecha: usuario + Salir */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {topRightSlot}
            {showCambiarPassword && <CambiarPassword tone="light" accent={accent} />}
            {userName && (
              <div
                className="hidden sm:flex"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                  padding: '5px 12px', borderRadius: '10px',
                  background: '#F8FAFC',
                  border: '1px solid #E4E8EF',
                }}
              >
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', lineHeight: 1.1, margin: 0, letterSpacing: '-.005em' }}>
                  {userName}
                </p>
                {userRoleLabel && (
                  <p style={{
                    fontSize: '9px', fontWeight: 700, color: accent,
                    letterSpacing: '.16em', textTransform: 'uppercase',
                    margin: '2px 0 0',
                  }}>{userRoleLabel}</p>
                )}
              </div>
            )}
            {onLogout && (
              <button
                onClick={onLogout}
                style={{
                  padding: '8px 14px', borderRadius: '10px',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#B91C1C',
                  fontFamily: SANS,
                  fontSize: '12.5px', fontWeight: 600,
                  letterSpacing: '-.003em',
                  cursor: 'pointer',
                  transition: 'all .14s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.borderColor = '#FCA5A5' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.borderColor = '#FECACA' }}
              >
                Salir
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Contenido ───────────────────────────────────────────── */}
      <main style={{ flex: 1, padding: '20px 16px 32px' }}>
        <div style={{ maxWidth, margin: '0 auto' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
