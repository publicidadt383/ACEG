'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'

const SANS = "var(--font-manrope), -apple-system, 'Segoe UI', system-ui, sans-serif"

interface Props {
  /** 'light' = header claro (texto navy); 'dark' = header sobre foto (glass blanco). */
  tone?: 'light' | 'dark'
  accent?: string
}

/* ── Iconos ─────────────────────────────────────────────── */
const KeyIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 0 1 2 2m4-2a6 6 0 0 1-7.74 5.74L11 15H9v2H7v2H4a1 1 0 0 1-1-1v-2.59a1 1 0 0 1 .29-.7l5.96-5.96A6 6 0 1 1 21 7Z" />
  </svg>
)
const LockIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)
const EyeIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOffIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.4M6.6 6.6A13.3 13.3 0 0 0 2 11s3.5 7 10 7a9 9 0 0 0 4.4-1.1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
  </svg>
)
const CheckIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)

/* ── Medidor de fuerza ──────────────────────────────────── */
function calcFuerza(p: string): number {
  if (!p) return 0
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/[0-9]/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  return Math.min(s, 4)   // 0..4
}
const FUERZA_LABEL = ['—', 'Muy débil', 'Débil', 'Buena', 'Fuerte']
const FUERZA_COLOR = ['#CBD5E1', '#DC2626', '#B45309', '#1E40AF', '#15803D']

export default function CambiarPassword({ tone = 'light', accent = '#0B2447' }: Props) {
  const [open, setOpen]         = useState(false)
  const [actual, setActual]     = useState('')
  const [nueva, setNueva]       = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [visible, setVisible]   = useState<Record<string, boolean>>({})
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [ok, setOk]             = useState(false)

  function cerrar() {
    setOpen(false)
    setActual(''); setNueva(''); setConfirmar(''); setVisible({}); setError(''); setOk(false)
  }

  // Cerrar con Escape (salvo mientras guarda).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) cerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!actual)             { setError('Ingresa tu contraseña actual.'); return }
    if (nueva.length < 8)    { setError('La nueva contraseña debe tener al menos 8 caracteres.'); return }
    if (nueva !== confirmar) { setError('Las contraseñas no coinciden.'); return }
    if (nueva === actual)    { setError('La nueva contraseña debe ser distinta de la actual.'); return }
    setLoading(true)

    // 1) Verificar la contraseña ACTUAL: reintenta el login con ella.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setLoading(false); setError('No se pudo verificar tu sesión. Vuelve a entrar.'); return }
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password: actual })
    if (signErr) { setLoading(false); setError('La contraseña actual no es correcta.'); return }

    // 2) Recién entonces, cambiarla.
    const { error: err } = await supabase.auth.updateUser({ password: nueva })
    setLoading(false)
    if (err) {
      setError(
        /different from the old|should be different/i.test(err.message)
          ? 'La nueva contraseña debe ser distinta de la actual.'
          : 'No se pudo cambiar la contraseña. Intenta de nuevo.'
      )
      return
    }
    setOk(true)
    setTimeout(cerrar, 1700)
  }

  // ── Derivados en vivo ──
  const fuerza = calcFuerza(nueva)
  const reqs = [
    { ok: nueva.length >= 8,                       txt: 'Al menos 8 caracteres' },
    { ok: nueva.length > 0 && nueva !== actual,    txt: 'Distinta de la actual' },
    { ok: confirmar.length > 0 && nueva === confirmar, txt: 'Ambas coinciden' },
  ]

  // ── Estilo del botón trigger según el tono del header ──
  const triggerStyle: React.CSSProperties = tone === 'dark'
    ? {
        background: 'rgba(255,255,255,.12)',
        border: '1px solid rgba(255,255,255,.28)',
        color: 'white',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      }
    : {
        background: '#EFF3FA',
        border: '1.5px solid #b6c5e3',
        color: accent,
      }

  const campo = (
    field: string,
    label: string,
    val: string,
    setVal: (v: string) => void,
    ph: string,
    ac: string,
    autoFocus = false,
  ) => {
    const shown = !!visible[field]
    return (
      <div style={{ marginBottom: '13px' }}>
        <label style={lblStyle}>{label}</label>
        <div className="cp-field">
          <span className="cp-field-ic"><LockIcon /></span>
          <input
            className="cp-input"
            type={shown ? 'text' : 'password'}
            value={val}
            onChange={e => setVal(e.target.value)}
            autoFocus={autoFocus}
            autoComplete={ac}
            placeholder={ph}
          />
          <button type="button" className="cp-eye" tabIndex={-1}
            onClick={() => setVisible(v => ({ ...v, [field]: !v[field] }))}
            aria-label={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            {shown ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Cambiar contraseña"
        aria-label="Cambiar contraseña"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          padding: '8px 13px', borderRadius: '10px',
          fontFamily: SANS, fontSize: '12.5px', fontWeight: 600,
          letterSpacing: '-.003em', cursor: 'pointer',
          transition: 'filter .14s ease',
          ...triggerStyle,
        }}
        onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(.96)' }}
        onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}
      >
        <KeyIcon />
        <span className="hidden sm:inline">Contraseña</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="cp-overlay"
          onMouseDown={e => { if (e.target === e.currentTarget && !loading) cerrar() }}
        >
          <style>{`
            @keyframes cp-fade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes cp-pop  { from { opacity: 0; transform: translateY(14px) scale(.97) } to { opacity: 1; transform: none } }

            .cp-overlay {
              position: fixed; inset: 0; z-index: 9999;
              display: flex; align-items: center; justify-content: center; padding: 20px;
              background: radial-gradient(120% 90% at 50% 0%, rgba(20,56,117,.42), rgba(8,17,33,.66));
              backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
              font-family: ${SANS};
              animation: cp-fade .18s ease both;
            }
            .cp-card {
              position: relative; width: 100%; max-width: 420px;
              border-radius: 22px; overflow: hidden; color: #0F172A;
              background: rgba(255,255,255,.80);
              backdrop-filter: blur(26px) saturate(160%); -webkit-backdrop-filter: blur(26px) saturate(160%);
              border: 1px solid rgba(255,255,255,.65);
              box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 30px 70px -20px rgba(8,20,45,.65), 0 8px 24px rgba(8,20,45,.28);
              animation: cp-pop .3s cubic-bezier(.2,.75,.2,1) both;
            }

            /* Banda de encabezado navy con textura de puntos */
            .cp-head {
              position: relative; padding: 20px 22px 18px; overflow: hidden;
              background: linear-gradient(135deg, ${accent} 0%, #143875 52%, #1E40AF 100%);
            }
            .cp-head::after {
              content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .5;
              background:
                radial-gradient(60% 120% at 88% -10%, rgba(147,197,253,.35), transparent 60%),
                radial-gradient(rgba(255,255,255,.14) 1px, transparent 1.3px);
              background-size: auto, 16px 16px;
            }
            .cp-head-row { position: relative; display: flex; align-items: center; gap: 13px; }
            .cp-badge {
              width: 44px; height: 44px; border-radius: 13px; flex: none; display: grid; place-items: center;
              color: #fff; background: rgba(255,255,255,.14);
              border: 1px solid rgba(255,255,255,.28);
              box-shadow: 0 6px 16px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.3);
            }

            .cp-body { padding: 20px 22px 22px; }

            .cp-field { position: relative; display: flex; align-items: center; }
            .cp-field-ic { position: absolute; left: 13px; color: #94A3B8; display: flex; pointer-events: none; transition: color .15s ease; }
            .cp-field:focus-within .cp-field-ic { color: ${accent}; }
            .cp-input {
              width: 100%; height: 46px; padding: 0 42px 0 40px; box-sizing: border-box;
              background: rgba(255,255,255,.6); border: 1px solid #E1E7F0; border-radius: 12px;
              font-family: ${SANS}; font-size: 14.5px; font-weight: 500; color: #0F172A; outline: none;
              transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
            }
            .cp-input::placeholder { color: #9AA6B8; font-weight: 400; }
            .cp-input:hover { border-color: #CBD3DE; }
            .cp-input:focus { border-color: ${accent}; background: rgba(255,255,255,.96); box-shadow: 0 0 0 4px ${accent}1f; }
            .cp-eye {
              position: absolute; right: 8px; width: 30px; height: 30px; border: none; background: none;
              display: grid; place-items: center; color: #94A3B8; cursor: pointer; border-radius: 8px; transition: color .15s, background .15s;
            }
            .cp-eye:hover { color: ${accent}; background: ${accent}0f; }

            /* Medidor de fuerza */
            .cp-meter { display: flex; gap: 5px; margin: 2px 0 3px; }
            .cp-seg { flex: 1; height: 5px; border-radius: 999px; background: #E2E8F0; overflow: hidden; }
            .cp-seg > i { display: block; height: 100%; width: 0; border-radius: 999px; transition: width .3s ease, background .3s ease; }

            /* Requisitos */
            .cp-req { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; transition: color .2s; }
            .cp-req-dot { width: 16px; height: 16px; border-radius: 50%; flex: none; display: grid; place-items: center; transition: all .2s; }

            .cp-primary { box-shadow: 0 1px 2px ${accent}2e, 0 8px 18px -6px ${accent}66; transition: filter .15s, box-shadow .15s, transform .1s; }
            .cp-primary:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 2px 4px ${accent}3a, 0 14px 28px -8px ${accent}85; }
            .cp-primary:active:not(:disabled) { transform: translateY(0); }
            .cp-ghost:hover:not(:disabled) { background: #E2E8F0; border-color: #CBD5E1; }

            @media (max-width: 640px), (hover: none) {
              .cp-card { background: rgba(255,255,255,.98); backdrop-filter: none; -webkit-backdrop-filter: none; }
              .cp-overlay { backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
            }
            @media (prefers-reduced-motion: reduce) { .cp-overlay, .cp-card { animation: none !important; } }
          `}</style>

          <div className="cp-card" role="dialog" aria-modal="true" aria-label="Cambiar contraseña">

            {/* ── Encabezado navy ── */}
            <div className="cp-head">
              <div className="cp-head-row">
                <span className="cp-badge"><KeyIcon size={22} /></span>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#fff', letterSpacing: '-.015em' }}>
                    Cambiar contraseña
                  </h2>
                  <p style={{ fontSize: '12.5px', color: 'rgba(255,255,255,.82)', margin: '3px 0 0', fontWeight: 500 }}>
                    Confirma tu clave actual y elige una nueva.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Cuerpo ── */}
            <div className="cp-body">
              {ok ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                  padding: '18px 8px 12px', gap: '12px',
                }}>
                  <span style={{
                    width: 58, height: 58, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    background: '#EFFAF3', border: '1px solid #BBE9CB', color: '#15803D',
                  }}>
                    <CheckIcon size={28} />
                  </span>
                  <div>
                    <p style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                      ¡Contraseña actualizada!
                    </p>
                    <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0' }}>
                      Usa tu nueva contraseña la próxima vez que ingreses.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={guardar}>
                  {campo('actual', 'Contraseña actual', actual, setActual, 'Tu contraseña actual', 'current-password', true)}
                  {campo('nueva', 'Nueva contraseña', nueva, setNueva, 'Mínimo 8 caracteres', 'new-password')}

                  {/* Medidor de fuerza (solo si escribió algo) */}
                  {nueva.length > 0 && (
                    <div style={{ margin: '-4px 0 12px' }}>
                      <div className="cp-meter">
                        {[1, 2, 3, 4].map(i => (
                          <span key={i} className="cp-seg">
                            <i style={{ width: fuerza >= i ? '100%' : 0, background: FUERZA_COLOR[fuerza] }} />
                          </span>
                        ))}
                      </div>
                      <p style={{ fontSize: '11.5px', fontWeight: 700, margin: '5px 0 0', color: FUERZA_COLOR[fuerza], letterSpacing: '.01em' }}>
                        Seguridad: {FUERZA_LABEL[fuerza]}
                      </p>
                    </div>
                  )}

                  {campo('confirmar', 'Repetir contraseña', confirmar, setConfirmar, 'Vuelve a escribirla', 'new-password')}

                  {/* Requisitos en vivo */}
                  <div style={{
                    display: 'grid', gap: '7px', marginTop: '4px', padding: '12px 14px',
                    background: 'rgba(241,245,249,.7)', border: '1px solid #E6EBF2', borderRadius: '12px',
                  }}>
                    {reqs.map((r, i) => (
                      <div key={i} className="cp-req" style={{ color: r.ok ? '#15803D' : '#94A3B8' }}>
                        <span className="cp-req-dot" style={{
                          background: r.ok ? '#15803D' : 'transparent',
                          border: r.ok ? '1px solid #15803D' : '1.5px solid #CBD5E1',
                          color: '#fff',
                        }}>
                          {r.ok ? <CheckIcon size={10} /> : null}
                        </span>
                        {r.txt}
                      </div>
                    ))}
                  </div>

                  {error && (
                    <div role="alert" style={{
                      marginTop: '13px', display: 'flex', alignItems: 'flex-start', gap: '8px',
                      padding: '11px 13px', borderRadius: '11px',
                      background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
                      fontSize: '12.8px', fontWeight: 500, lineHeight: 1.4,
                    }}>
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" style={{ flex: 'none', marginTop: '1px' }}>
                        <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                      </svg>
                      {error}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                    <button
                      type="button" onClick={cerrar} disabled={loading}
                      className="cp-ghost"
                      style={{
                        flex: 1, height: '46px', borderRadius: '12px',
                        background: '#F1F5F9', border: '1px solid #E4E8EF', color: '#475569',
                        fontFamily: SANS, fontSize: '13.5px', fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer', transition: 'background .15s, border-color .15s',
                      }}
                    >Cancelar</button>
                    <button
                      type="submit" disabled={loading}
                      className="cp-primary"
                      style={{
                        flex: 1.5, height: '46px', borderRadius: '12px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        background: accent, border: `1px solid ${accent}`, color: 'white',
                        fontFamily: SANS, fontSize: '13.5px', fontWeight: 700, letterSpacing: '-.003em',
                        cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .75 : 1,
                      }}
                    >
                      {loading
                        ? 'Guardando…'
                        : <>Guardar contraseña</>}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

const lblStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155',
  marginBottom: '6px', letterSpacing: '.01em',
}
