'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import CambiarPassword from './CambiarPassword'

export interface MenuCard {
  id: string
  label: string
  description?: string
  icon?: ReactNode
  badge?: number | string | null
  onClick: () => void
  disabled?: boolean
}

export interface PortalMenuFotoProps {
  fotoUrl?: string
  title: string
  subtitle?: string
  userName?: string
  userRoleLabel?: string
  cards: MenuCard[]
  onLogout?: () => void
  onBack?: () => void
  backLabel?: string
  bannerSlot?: ReactNode
  topRightSlot?: ReactNode
  /** Color principal del rol (botón salir, badges) */
  accent?: string
  /** Color secundario del rol (acento sutil en cards) */
  accent2?: string
  /** Saludo personalizado bajo el título */
  greeting?: string
  /** Mostrar fecha larga */
  showDate?: boolean
  /** Muestra el botón de "Cambiar contraseña" (true por defecto). */
  showCambiarPassword?: boolean
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const DIAS  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']

function fechaLarga(d: Date): string {
  const dia = DIAS[d.getDay()]
  const num = d.getDate()
  const mes = MESES[d.getMonth()]
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${num} de ${mes}`
}
function saludoHora(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

const SANS = "var(--font-manrope), -apple-system, 'Segoe UI', system-ui, sans-serif"

const STYLES = `
  @keyframes phm-rise {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes phm-card-rise {
    from { opacity: 0; transform: translateY(18px) scale(.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1); }
  }
  @keyframes phm-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes phm-ken {
    0%   { transform: scale(1.04) translate(0, 0); }
    100% { transform: scale(1.12) translate(-1.5%, -1%); }
  }
  @keyframes phm-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes phm-spin-rev {
    to { transform: rotate(-360deg); }
  }
  @keyframes phm-pulse {
    0%, 100% { opacity: .55; transform: scale(1); }
    50%      { opacity: .85; transform: scale(1.08); }
  }
  @keyframes phm-shine {
    0%   { transform: translateX(-110%); }
    100% { transform: translateX(110%); }
  }
  .phm-root { font-family: ${SANS}; --mx: 0; --my: 0; }
  .phm-photo {
    animation: phm-ken 32s ease-in-out infinite alternate;
    /* Mantener la foto animada en su propia capa de composición estable:
       evita que el backdrop-filter de las tarjetas re-muestree un layer
       inestable cada frame (causa del parpadeo en GPUs integradas). */
    will-change: transform;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    transform: translateZ(0);
  }
  .phm-rise  { opacity: 0; transform: translateY(14px); animation: phm-rise .7s cubic-bezier(.2,.7,.2,1) both; }
  .phm-card  { opacity: 0; transform: translateY(18px) scale(.97); animation: phm-card-rise .65s cubic-bezier(.22,.61,.36,1) both; will-change: transform; }

  .phm-card-btn {
    position: relative;
    border-radius: 16px;
    background: rgba(255,255,255,.55);
    backdrop-filter: blur(26px) saturate(150%);
    -webkit-backdrop-filter: blur(26px) saturate(150%);
    border: 1px solid rgba(255,255,255,.45);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.7),
      0 1px 2px rgba(0,0,0,.04),
      0 8px 24px rgba(11,36,71,.18),
      0 24px 56px rgba(11,36,71,.22);
    cursor: pointer;
    overflow: hidden;
    /* Capa de composición propia y estable para el backdrop-filter:
       sin esto, el blur tiembla sobre el fondo animado (parpadeo). */
    transform: translateZ(0);
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    transition:
      transform .35s cubic-bezier(.22,.61,.36,1),
      box-shadow .35s cubic-bezier(.22,.61,.36,1),
      border-color .25s ease,
      background .25s ease;
  }
  .phm-card-btn::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.55) 50%, transparent 65%);
    transform: translateX(-110%);
    transition: transform .9s cubic-bezier(.4,0,.2,1);
  }
  .phm-card-btn:hover:not(:disabled) {
    transform: translateY(-10px) scale(1.045);
    background: rgba(255,255,255,.78);
    border-color: rgba(255,255,255,.85);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.95),
      0 2px 4px rgba(0,0,0,.06),
      0 22px 44px rgba(11,36,71,.32),
      0 44px 96px rgba(11,36,71,.38);
  }
  .phm-card-btn:hover:not(:disabled)::before { transform: translateX(110%); }
  .phm-card-btn:hover:not(:disabled) .phm-icon { animation: phm-icon-wiggle .65s cubic-bezier(.22,.61,.36,1); }
  .phm-card-btn:hover:not(:disabled) .phm-card-label { transform: translateY(-1px); }
  .phm-card-btn:active:not(:disabled) { transform: translateY(-3px) scale(1.01); }
  .phm-card-btn:disabled { cursor: not-allowed; opacity: .5; }
  .phm-card-btn:focus-visible {
    outline: none;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.85),
      0 0 0 3px rgba(255,255,255,.55),
      0 0 0 5px rgba(11,36,71,.5),
      0 16px 40px rgba(11,36,71,.32);
  }

  .phm-icon       { transition: transform .35s cubic-bezier(.22,.61,.36,1); }
  .phm-card-label { transition: transform .35s cubic-bezier(.22,.61,.36,1); }
  @keyframes phm-icon-wiggle {
    0%   { transform: rotate(0deg) scale(1); }
    25%  { transform: rotate(-7deg) scale(1.12); }
    55%  { transform: rotate(5deg) scale(1.08); }
    80%  { transform: rotate(-2deg) scale(1.05); }
    100% { transform: rotate(0deg) scale(1); }
  }

  .phm-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 16px;
  }
  @media (max-width: 1100px) { .phm-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  @media (max-width: 860px)  { .phm-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } }
  @media (max-width: 560px)  { .phm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }

  /* ── Optimización móvil / táctil ──
     La foto de fondo 'position: fixed' con ken-burns + parallax SE CORTA al
     scrollear en el celular: cuando la barra del navegador se oculta/aparece,
     el viewport cambia de alto y la capa animada se repinta y salta.
     En móvil la dejamos estática (sin zoom ni parallax) y apagamos blobs
     (blur 80px + blend) y backdrop-filter, que saturan la GPU. */
  @media (max-width: 768px), (hover: none) {
    .phm-root { --mx: 0 !important; --my: 0 !important; }
    .phm-photo-wrap { transform: none !important; transition: none !important; will-change: auto; }
    .phm-photo { animation: none !important; transform: translateZ(0); will-change: auto; }
    .phm-blob { display: none !important; }
    .phm-glow, .phm-orbit { animation: none !important; }
    .phm-card-btn {
      -webkit-backdrop-filter: none; backdrop-filter: none;
      background: rgba(255,255,255,.9);
      will-change: auto;
    }
    /* Sin entrada escalonada: al recargar, las animaciones desde opacity:0 y
       el will-change permanente provocan parpadeo en móvil. Aparece al instante. */
    .phm-rise, .phm-card {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
      will-change: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .phm-rise, .phm-card { animation: none !important; opacity: 1 !important; transform: none !important; }
    .phm-photo, .phm-orbit, .phm-glow, .phm-blob { animation: none !important; }
    .phm-card-btn, .phm-icon, .phm-card-label { transition: none !important; }
    .phm-card-btn:hover:not(:disabled) { transform: none !important; }
    .phm-card-btn:hover:not(:disabled) .phm-icon { animation: none !important; }
  }
`

export default function PortalMenuFoto({
  fotoUrl = '/foto_colegio.jpg',
  title,
  subtitle,
  userName,
  userRoleLabel,
  cards,
  onLogout,
  onBack,
  backLabel = 'Volver',
  bannerSlot,
  topRightSlot,
  accent  = '#0B2447',
  accent2 = '#1E40AF',
  greeting,
  showDate = true,
  showCambiarPassword = true,
}: PortalMenuFotoProps) {
  const [now, setNow] = useState<Date | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Parallax con cursor (sutil). Solo en punteros finos (mouse): en táctil
  // 'pointermove' se dispara en cada frame del scroll y traba/parpadea el móvil.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth  - 0.5)
        const y = (e.clientY / window.innerHeight - 0.5)
        el.style.setProperty('--mx', x.toFixed(3))
        el.style.setProperty('--my', y.toFixed(3))
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf) }
  }, [])

  const auto = now ? `${saludoHora(now)}, ${userName ?? ''}`.trim().replace(/,\s*$/, '') : null

  return (
    <div ref={rootRef} className="phm-root" style={{
      minHeight: '100vh',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      color: 'white',
    }}>
      <style>{STYLES}</style>

      {/* ── Foto de fondo a pantalla completa ───────────────────── */}
      <div aria-hidden className="phm-photo-wrap" style={{
        position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden',
        transform: 'translate3d(calc(var(--mx) * -8px), calc(var(--my) * -6px), 0)',
        transition: 'transform .55s cubic-bezier(.2,.7,.2,1)',
        willChange: 'transform',
      }}>
        <Image
          src={fotoUrl}
          alt=""
          fill
          priority
          quality={85}
          sizes="100vw"
          style={{ objectFit: 'cover' }}
          className="phm-photo"
        />
      </div>

      {/* Scrim navy */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: `
          radial-gradient(140% 90% at 50% 30%, transparent 0%, rgba(11,36,71,.35) 60%, rgba(8,17,33,.7) 100%),
          linear-gradient(180deg, rgba(11,36,71,.6) 0%, rgba(11,36,71,.35) 30%, rgba(15,23,42,.8) 100%)
        `,
      }} />

      {/* Blobs ambient */}
      <div aria-hidden className="phm-blob" style={{
        position: 'fixed', top: '-12%', left: '-8%', width: 520, height: 520,
        borderRadius: '50%', zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(99,102,241,.4), transparent 70%)',
        filter: 'blur(80px)', mixBlendMode: 'screen',
        animation: 'phm-pulse 12s ease-in-out infinite',
      }} />
      <div aria-hidden className="phm-blob" style={{
        position: 'fixed', bottom: '-15%', right: '-10%', width: 580, height: 580,
        borderRadius: '50%', zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(56,189,248,.35), transparent 70%)',
        filter: 'blur(80px)', mixBlendMode: 'screen',
        animation: 'phm-pulse 14s ease-in-out infinite',
        animationDelay: '-4s',
      }} />

      {/* ── Banner opcional ─────────────────────────────────────── */}
      {bannerSlot && <div style={{ position: 'relative', zIndex: 10 }}>{bannerSlot}</div>}

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="phm-rise" style={{
        position: 'relative', zIndex: 10,
        padding: '20px 28px 0',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: '20px', flexWrap: 'wrap',
        animationDelay: '.05s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {onBack ? (
            <button
              onClick={onBack}
              aria-label={`Volver: ${backLabel}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '10px 16px', borderRadius: '12px',
                background: 'rgba(255,255,255,.10)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,.22)',
                color: 'white',
                fontFamily: SANS, fontSize: '13px', fontWeight: 600,
                letterSpacing: '-.005em',
                cursor: 'pointer',
                transition: 'background .18s ease, transform .18s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.18)'; e.currentTarget.style.transform = 'translateX(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.10)'; e.currentTarget.style.transform = 'translateX(0)' }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {backLabel}
            </button>
          ) : (
            <div
              aria-hidden
              style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}
            >
              {/* glow */}
              <div className="phm-glow" style={{
                position: 'absolute', inset: -18, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(147,197,253,.5), transparent 65%)',
                filter: 'blur(18px)',
                animation: 'phm-pulse 4.5s ease-in-out infinite',
                pointerEvents: 'none',
              }} />
              {/* orbit dashed */}
              <div className="phm-orbit" style={{
                position: 'absolute', inset: -10, borderRadius: '50%',
                border: '1.5px dashed rgba(255,255,255,.45)',
                animation: 'phm-spin 40s linear infinite',
                pointerEvents: 'none',
              }} />
              {/* arco */}
              <div className="phm-orbit" style={{
                position: 'absolute', inset: -5, borderRadius: '50%',
                border: '1.5px solid transparent',
                borderTopColor: 'rgba(255,255,255,.8)',
                borderRightColor: 'rgba(255,255,255,.4)',
                animation: 'phm-spin-rev 28s linear infinite',
                pointerEvents: 'none',
              }} />
              {/* círculo blanco con el logo */}
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: '#FFFFFF',
                border: '2px solid #FFFFFF',
                boxShadow: '0 12px 32px rgba(11,36,71,.45), 0 4px 10px rgba(0,0,0,.2)',
                overflow: 'hidden',
                zIndex: 2,
              }}>
                <Image src="/colegio-trans.png" alt="Logo del colegio" fill sizes="72px" style={{ objectFit: 'contain' }} />
              </div>
            </div>
          )}

          <div>
            {subtitle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <span aria-hidden style={{ height: 1, width: 20, background: 'rgba(255,255,255,.55)' }} />
                <p style={{
                  fontSize: '11px', fontWeight: 700, letterSpacing: '.28em',
                  color: 'rgba(255,255,255,.85)', textTransform: 'uppercase',
                  textShadow: '0 1px 8px rgba(0,0,0,.6)',
                  margin: 0,
                }}>{subtitle}</p>
              </div>
            )}
            <p style={{
              fontSize: '26px', fontWeight: 700, color: 'white',
              lineHeight: 1.1, margin: 0,
              textShadow: '0 2px 18px rgba(0,0,0,.6)',
              letterSpacing: '-.022em',
            }}>{title}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {topRightSlot}
          {showCambiarPassword && <CambiarPassword tone="dark" />}
          {(userName || userRoleLabel) && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
              padding: '8px 14px', borderRadius: '12px',
              background: 'rgba(255,255,255,.10)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,.18)',
              boxShadow: '0 4px 18px rgba(0,0,0,.18)',
            }}>
              {userName && (
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'white', lineHeight: 1.1, margin: 0, letterSpacing: '-.005em' }}>
                  {userName}
                </p>
              )}
              {userRoleLabel && (
                <p style={{
                  fontSize: '10px', fontWeight: 700,
                  color: 'rgba(255,255,255,.78)',
                  letterSpacing: '.18em', textTransform: 'uppercase',
                  margin: '3px 0 0',
                }}>{userRoleLabel}</p>
              )}
            </div>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              aria-label="Cerrar sesión"
              style={{
                padding: '10px 18px', borderRadius: '12px',
                background: 'rgba(220,38,38,.16)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(248,113,113,.4)',
                color: 'white',
                fontFamily: SANS, fontSize: '13px', fontWeight: 600,
                letterSpacing: '-.005em',
                cursor: 'pointer',
                transition: 'background .18s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,.30)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220,38,38,.16)' }}
            >
              Salir
            </button>
          )}
        </div>
      </header>

      {/* ── Bienvenida + grid ───────────────────────────────────── */}
      <main style={{
        position: 'relative', zIndex: 10,
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 28px 56px',
      }}>
        <div style={{ width: '100%', maxWidth: '1180px' }}>

          {/* Bienvenida */}
          <div className="phm-rise" style={{ textAlign: 'center', marginBottom: '40px', animationDelay: '.15s' }}>
            {showDate && now && (
              <p style={{
                fontSize: '11px', fontWeight: 700,
                letterSpacing: '.32em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,.75)',
                textShadow: '0 1px 8px rgba(0,0,0,.5)',
                marginBottom: '10px',
              }}>
                <span aria-hidden style={{ display: 'inline-block', width: 22, height: 1, background: 'rgba(255,255,255,.5)', verticalAlign: 'middle', marginRight: 10 }} />
                {fechaLarga(now)}
                <span aria-hidden style={{ display: 'inline-block', width: 22, height: 1, background: 'rgba(255,255,255,.5)', verticalAlign: 'middle', marginLeft: 10 }} />
              </p>
            )}

            <h1 style={{
              fontSize: 'clamp(28px, 4.5vw, 42px)', fontWeight: 700,
              lineHeight: 1.08, letterSpacing: '-.025em',
              color: 'white',
              margin: '0 0 8px',
              textShadow: '0 3px 24px rgba(0,0,0,.55)',
            }}>
              {greeting ?? auto ?? (onBack ? 'Módulos del área' : 'Bienvenido')}
            </h1>

            <p style={{
              fontSize: '14px', fontWeight: 500,
              color: 'rgba(255,255,255,.78)',
              margin: 0,
              textShadow: '0 1px 10px rgba(0,0,0,.45)',
            }}>
              {onBack ? 'Selecciona una opción' : 'Selecciona una sección para continuar'}
            </p>
          </div>

          {/* Grid */}
          <div className="phm-grid">
            {cards.map((c, i) => (
              <button
                key={c.id}
                onClick={c.onClick}
                disabled={c.disabled}
                className="phm-card phm-card-btn"
                aria-label={c.label + (c.description ? ` — ${c.description}` : '')}
                style={{
                  aspectRatio: '1 / 1',
                  padding: '16px 12px 14px',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: '10px', textAlign: 'center',
                  animationDelay: `${.18 + i * .055}s`,
                }}
              >
                {/* Acento sutil arriba del card (línea de color del rol) */}
                {!c.disabled && (
                  <span aria-hidden style={{
                    position: 'absolute', top: 0, left: '14%', right: '14%',
                    height: '2.5px',
                    background: `linear-gradient(90deg, transparent, ${accent}, ${accent2}, ${accent}, transparent)`,
                    borderRadius: '0 0 3px 3px',
                  }} />
                )}

                {/* Badge */}
                {c.badge != null && c.badge !== 0 && c.badge !== '' && !c.disabled && (
                  <span
                    aria-label={`${c.badge} pendientes`}
                    style={{
                      position: 'absolute', top: '10px', right: '10px',
                      minWidth: '20px', height: '20px', padding: '0 6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '999px',
                      background: `linear-gradient(135deg, ${accent}, ${accent2})`,
                      color: 'white',
                      fontSize: '10px', fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      boxShadow: `0 4px 14px ${accent}55, inset 0 1px 0 rgba(255,255,255,.4)`,
                      border: '1.5px solid rgba(255,255,255,.7)',
                    }}
                  >
                    {c.badge}
                  </span>
                )}

                {/* Ícono en círculo con color del rol */}
                {c.icon && (
                  <div
                    className="phm-icon"
                    style={{
                      width: '52px', height: '52px', borderRadius: '14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: c.disabled
                        ? 'rgba(148,163,184,.18)'
                        : `linear-gradient(135deg, ${accent}, ${accent2})`,
                      color: c.disabled ? 'rgba(100,116,139,.6)' : 'white',
                      flexShrink: 0,
                      boxShadow: c.disabled ? 'none' : `0 8px 20px ${accent}40, inset 0 1px 0 rgba(255,255,255,.3)`,
                    }}
                  >
                    {c.icon}
                  </div>
                )}

                {/* Label */}
                <p className="phm-card-label" style={{
                  fontSize: '15px', fontWeight: 700,
                  lineHeight: 1.18,
                  letterSpacing: '-.01em',
                  color: c.disabled ? 'rgba(100,116,139,.6)' : '#0F172A',
                  margin: 0,
                }}>
                  {c.label}
                </p>

                {/* Descripción */}
                {c.description && (
                  <p style={{
                    fontSize: '12px', fontWeight: 500,
                    color: c.disabled ? 'rgba(100,116,139,.5)' : '#64748B',
                    lineHeight: 1.4,
                    margin: 0,
                    maxWidth: '160px',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {c.description}
                  </p>
                )}

                {c.disabled && (
                  <span style={{
                    position: 'absolute', bottom: '10px',
                    fontSize: '8.5px', fontWeight: 700, letterSpacing: '.2em',
                    padding: '3px 8px', borderRadius: '999px',
                    background: 'rgba(148,163,184,.15)',
                    color: 'rgba(71,85,105,.8)',
                    textTransform: 'uppercase',
                  }}>
                    Pronto
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer institucional minimal ────────────────────────── */}
      <footer aria-hidden style={{
        position: 'relative', zIndex: 10,
        padding: '10px 28px 22px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '14px',
      }}>
        <div style={{ height: 1, width: 60, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.4))' }} />
        <p style={{
          fontSize: '10.5px', fontWeight: 700,
          letterSpacing: '.34em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,.6)',
          margin: 0,
        }}>
          Eduardo de Habich · Juliaca · Puno
        </p>
        <div style={{ height: 1, width: 60, background: 'linear-gradient(90deg, rgba(255,255,255,.4), transparent)' }} />
      </footer>
    </div>
  )
}
