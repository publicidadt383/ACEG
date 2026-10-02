'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/Spinner'

/* ────────────────────────────────────────────────────────────────
   INSTITUCIONAL MODERNO — Login del colegio
   Concepto: portal académico confiable (Google Workspace / BCP)
   · Manrope, una sola tipografía sans
   · Blanco + azul marino institucional
   · Logo del colegio como protagonista
   · Una columna, foco absoluto en la acción
   ──────────────────────────────────────────────────────────────── */

const C = {
  bg:        '#F6F8FB',  // azul muy lavado, casi blanco
  card:      '#FFFFFF',
  border:    '#E4E8EF',
  borderHi:  '#CBD3DE',
  navy:      '#0B2447',  // azul marino institucional
  navyHi:    '#143875',
  navySoft:  '#1E40AF',
  ink:       '#0F172A',
  inkSoft:   '#475569',
  inkMuted:  '#94A3B8',
  ring:      'rgba(11,36,71,.10)',
  amber:     '#B45309',
  amberSoft: '#FEF3C7',
  danger:    '#B91C1C',
  dangerBg:  '#FEF2F2',
  dangerBd:  '#FECACA',
  ok:        '#15803D',
}

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirectTo   = searchParams.get('redirect')

  const [usuario,  setUsuario]  = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showPass, setShowPass] = useState(false)

  // Parallax con cursor: setea --mx/--my en el wrapper.
  // Solo en punteros finos (mouse): en táctil 'pointermove' se dispara en cada
  // frame del scroll y traba/parpadea el móvil.
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth  - 0.5)
        const y = (e.clientY / window.innerHeight - 0.5)
        wrap.style.setProperty('--mx', x.toFixed(3))
        wrap.style.setProperty('--my', y.toFixed(3))
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf) }
  }, [])

  // Saludo según hora local
  const now      = new Date()
  const hour     = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const r1 = await supabase.rpc('email_por_usuario', { p_usuario: usuario.trim() })
    let email = r1.data
    const rpcErr = r1.error
    if (rpcErr) {
      await supabase.auth.signOut({ scope: 'local' })
      const retry = await supabase.rpc('email_por_usuario', { p_usuario: usuario.trim() })
      if (retry.error || !retry.data) { setError('Error de conexión. Intenta de nuevo.'); setLoading(false); return }
      email = retry.data
    }
    if (!email) { setError('Usuario no encontrado. Verifica tu usuario.'); setLoading(false); return }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError || !authData.user) { setError('Contraseña incorrecta.'); setLoading(false); return }

    const uid = authData.user.id
    const setRoleCookie = (rol: string) => {
      document.cookie = `habich-rol=${rol}; path=/; max-age=86400; SameSite=Strict`
    }
    const safeRedirect = redirectTo?.startsWith('/') ? redirectTo : null

    const [{ data: admin }, { data: docente }, { data: alumno }, { data: adm }] = await Promise.all([
      supabase.from('user_admin').select('id').eq('id', uid).maybeSingle(),
      supabase.from('docentes').select('id').eq('id', uid).maybeSingle(),
      supabase.from('alumnos').select('id').eq('id', uid).maybeSingle(),
      supabase.from('administrativos').select('id').eq('id', uid).maybeSingle(),
    ])

    if (admin)   { setRoleCookie('admin');         router.push('/admin');                   return }
    if (docente) { setRoleCookie('docente');        router.push(safeRedirect ?? '/docente'); return }
    if (alumno)  { setRoleCookie('alumno');         router.push('/alumno');                  return }
    // Administrativos ahora entran al panel /admin con sus módulos permitidos
    if (adm)     { setRoleCookie('administrativo'); router.push(safeRedirect ?? '/admin');    return }

    setRoleCookie('docente')
    router.push(safeRedirect ?? '/escanear')
  }

  return (
    <div ref={wrapRef} className="habich-login min-h-screen flex flex-col" style={{ color: C.ink }}>

      {/* ── Fondo: foto del colegio + scrim ─────────────────────── */}
      <div aria-hidden className="login-photo">
        <Image
          src="/foto_colegio.jpg"
          alt=""
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover"
        />
      </div>
      <div aria-hidden className="login-scrim" />

      {/* Blobs ambient flotantes muy sutiles */}
      <div aria-hidden className="login-blob blob-a" />
      <div aria-hidden className="login-blob blob-b" />

      {/* ── Top bar minimal ─────────────────────────────────────── */}
      <header className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-2 text-[13px] font-medium text-white/85 hover:text-white transition-colors">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            Volver al sitio
          </Link>
        </div>
      </header>

      {/* ── Cuerpo ──────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-5 py-10 sm:py-14">

        <div className="w-full max-w-[420px]">

          {/* Logo institucional protagonista */}
          <div className="flex flex-col items-center text-center mb-7">
            <div className="logo-wrap reveal reveal-1 mb-6">
              <div className="logo-shadow" aria-hidden />
              <div className="logo-glow" aria-hidden />
              <div className="logo-orbit" aria-hidden />
              <div className="logo-arc" aria-hidden />
              <div className="logo-inner">
                <Image src="/colegio-trans.png" alt="Colegio Eduardo de Habich" fill priority sizes="180px" className="object-contain" />
              </div>
            </div>

            <p
              className="reveal reveal-2 text-[11px] font-bold uppercase text-white/85 mb-2"
              style={{ letterSpacing: '0.32em', textShadow: '0 1px 8px rgba(0,0,0,.5)' }}
            >
              <span className="inline-block w-6 h-px align-middle mr-2.5" style={{ background: 'rgba(255,255,255,.55)' }} />
              {greeting}
              <span className="inline-block w-6 h-px align-middle ml-2.5" style={{ background: 'rgba(255,255,255,.55)' }} />
            </p>

            <h1
              className="reveal reveal-3 text-[24px] sm:text-[26px] font-bold leading-[1.1] text-white"
              style={{ letterSpacing: '-.024em', textShadow: '0 2px 18px rgba(0,0,0,.5)' }}
            >
              Colegio Eduardo de Habich
            </h1>
            <p
              className="reveal reveal-3 mt-1.5 text-[13.5px] font-medium text-white/80"
              style={{ letterSpacing: '0.01em', textShadow: '0 1px 12px rgba(0,0,0,.4)' }}
            >
              Sistema Académico Institucional
            </p>
          </div>

          {/* Tarjeta del formulario */}
          <div className="login-card reveal reveal-4">
            <div className="card-glow" aria-hidden />
            <div className="card-sweep" aria-hidden />

            <div className="mb-6">
              <h2 className="text-[19px] font-bold" style={{ color: C.ink, letterSpacing: '-.012em' }}>
                Inicia sesión
              </h2>
              <p className="mt-1 text-[13.5px]" style={{ color: C.inkSoft }}>
                Ingresa con tus credenciales institucionales.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">

              {/* USUARIO */}
              <div>
                <label htmlFor="login-user" className="login-label">
                  Usuario
                </label>
                <div className="login-input-wrap">
                  <svg className="login-input-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>
                  <input
                    id="login-user"
                    type="text" required value={usuario}
                    onChange={e => setUsuario(e.target.value)}
                    placeholder="Tu usuario"
                    autoComplete="username"
                    className="login-input"
                  />
                </div>
              </div>

              {/* CONTRASEÑA */}
              <div>
                <div className="flex items-center justify-between mb-[6px]">
                  <label htmlFor="login-pass" className="login-label" style={{ marginBottom: 0 }}>
                    Contraseña
                  </label>
                  <button
                    type="button" onClick={() => setShowPass(!showPass)}
                    className="text-[12.5px] font-semibold transition-colors"
                    style={{ color: C.navy }}
                    onMouseEnter={e => e.currentTarget.style.color = C.navyHi}
                    onMouseLeave={e => e.currentTarget.style.color = C.navy}
                  >
                    {showPass ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <div className="login-input-wrap">
                  <svg className="login-input-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                  <input
                    id="login-pass"
                    type={showPass ? 'text' : 'password'} required value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Tu contraseña"
                    autoComplete="current-password"
                    className="login-input"
                    style={{ letterSpacing: showPass ? 'normal' : '0.14em' }}
                  />
                </div>
              </div>

              {/* ERROR */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-lg px-3.5 py-3 animate-shake"
                  style={{
                    background: C.dangerBg,
                    border: `1px solid ${C.dangerBd}`,
                    color: C.danger,
                  }}
                >
                  <svg className="shrink-0 mt-0.5" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                  <span className="text-[13px] font-medium leading-snug">{error}</span>
                </div>
              )}

              {/* SUBMIT */}
              <button
                type="submit" disabled={loading}
                className="login-submit"
              >
                {loading
                  ? <><Spinner cls="h-4 w-4 text-white" /> Verificando…</>
                  : <>
                      Ingresar
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                      </svg>
                    </>
                }
              </button>
            </form>
          </div>

          {/* Ayuda */}
          <div className="mt-6 text-center reveal reveal-5">
            <p className="text-[13px] text-white/80" style={{ textShadow: '0 1px 10px rgba(0,0,0,.35)' }}>
              ¿Problemas para ingresar?{' '}
              <span className="font-semibold text-white">
                Contacta a la administración
              </span>
            </p>
          </div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 py-4 border-t border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[12px] text-white/65">
            <span>© {new Date().getFullYear()} · Colegio Eduardo de Habich</span>
            <span>Juliaca · Puno · Perú</span>
          </div>
        </div>
      </footer>

      {/* ── Estilos locales ──────────────────────────────────────── */}
      <style>{`
        .habich-login {
          font-family: var(--font-manrope), -apple-system, 'Segoe UI', system-ui, sans-serif;
          font-feature-settings: 'ss01' 1, 'cv11' 1;
          -webkit-font-smoothing: antialiased;
          --mx: 0; --my: 0;
        }

        /* Foto del colegio a pantalla completa con ken-burns */
        .login-photo {
          position: fixed; inset: 0; z-index: 0; overflow: hidden;
          transform: translate3d(calc(var(--mx) * -10px), calc(var(--my) * -8px), 0);
          transition: transform .55s cubic-bezier(.2,.7,.2,1);
          will-change: transform;
        }
        .login-photo img { animation: ken-burns 32s ease-in-out infinite alternate; }

        /* Scrim sobre la foto */
        .login-scrim {
          position: fixed; inset: 0; z-index: 1; pointer-events: none;
          background:
            radial-gradient(120% 80% at 50% 30%, transparent 0%, rgba(11,36,71,.35) 60%, rgba(8,17,33,.7) 100%),
            linear-gradient(180deg, rgba(11,36,71,.55) 0%, rgba(11,36,71,.35) 35%, rgba(15,23,42,.75) 100%);
        }

        /* Blobs ambient flotantes (movimiento orgánico) */
        .login-blob {
          position: fixed; z-index: 1; border-radius: 50%; pointer-events: none;
          filter: blur(80px);
          mix-blend-mode: screen;
        }
        .blob-a {
          top: -10%; left: -10%; width: 520px; height: 520px;
          background: radial-gradient(circle, rgba(30,64,175,.45), transparent 70%);
          animation: drift-a 24s ease-in-out infinite;
        }
        .blob-b {
          bottom: -15%; right: -10%; width: 580px; height: 580px;
          background: radial-gradient(circle, rgba(56,189,248,.4), transparent 70%);
          animation: drift-b 30s ease-in-out infinite;
        }

        /* ── Logo: círculo ajustado a la insignia + detalle decorativo alrededor ── */
        .logo-wrap {
          position: relative; width: 168px; height: 168px;
          transform: translate3d(calc(var(--mx) *  6px), calc(var(--my) *  4px), 0);
          transition: transform .35s cubic-bezier(.2,.7,.2,1);
          will-change: transform;
        }
        /* Sombra POR DEBAJO del círculo */
        .logo-shadow {
          position: absolute; left: 50%; bottom: -16px;
          width: 70%; height: 28px;
          transform: translateX(-50%);
          background: radial-gradient(ellipse at center, rgba(0,0,0,.45), transparent 70%);
          filter: blur(14px);
          pointer-events: none;
        }
        /* Glow azul difuso DETRÁS (no encima de la insignia) */
        .logo-glow {
          position: absolute; inset: -28px; border-radius: 50%;
          background: radial-gradient(circle, rgba(147,197,253,.55), transparent 65%);
          filter: blur(26px);
          animation: pulse-glow 4.5s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }
        /* Órbita dashed girando lento alrededor */
        .logo-orbit {
          position: absolute; inset: -20px; border-radius: 50%;
          border: 1.5px dashed rgba(255,255,255,.55);
          animation: spin-slow 40s linear infinite;
          z-index: 1;
          pointer-events: none;
        }
        /* Arco parcial luminoso (detalle elegante tipo halo) */
        .logo-arc {
          position: absolute; inset: -10px; border-radius: 50%;
          border: 1.5px solid transparent;
          border-top-color: rgba(255,255,255,.85);
          border-right-color: rgba(255,255,255,.45);
          animation: spin-slow-rev 28s linear infinite;
          z-index: 1;
          pointer-events: none;
        }
        /* Círculo blanco — ajustado a la contextura de la insignia */
        .logo-inner {
          position: absolute; inset: 0; border-radius: 50%;
          background: #FFFFFF;
          border: 2px solid #FFFFFF;
          box-shadow:
            0 18px 50px rgba(11,36,71,.5),
            0 6px 14px rgba(0,0,0,.25);
          padding: 0;
          overflow: hidden;
          z-index: 2;
        }
        .logo-inner > img {
          position: relative !important;
          height: 100% !important;
          width: 100% !important;
          object-fit: contain !important;
        }

        /* ── Tarjeta GLASS con parallax + glow + sweep ── */
        .login-card {
          position: relative;
          background: rgba(255,255,255,.80);
          border: 1px solid rgba(255,255,255,.55);
          border-radius: 18px;
          padding: 28px;
          backdrop-filter: blur(24px) saturate(140%);
          -webkit-backdrop-filter: blur(24px) saturate(140%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.8),
            0 1px 2px rgba(0,0,0,.05),
            0 8px 24px rgba(0,0,0,.12),
            0 30px 64px rgba(11,36,71,.28);
          overflow: hidden;
          transform: translate3d(calc(var(--mx) * 4px), calc(var(--my) * 3px), 0);
          transition: transform .35s cubic-bezier(.2,.7,.2,1);
          will-change: transform;
        }
        /* Glow respirando bajo el card */
        .card-glow {
          position: absolute; inset: -1px; z-index: -1; border-radius: 20px;
          background:
            radial-gradient(60% 50% at 50% 100%, rgba(30,64,175,.5), transparent 70%),
            radial-gradient(70% 60% at 50% 0%, rgba(56,189,248,.35), transparent 70%);
          filter: blur(20px);
          animation: pulse-card 5.5s ease-in-out infinite;
          pointer-events: none;
        }
        /* Light sweep al cargar (una sola pasada) */
        .card-sweep {
          position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,.6) 50%, transparent 70%);
          transform: translateX(-110%);
          animation: card-sweep 1.4s cubic-bezier(.4,0,.2,1) 1.1s both;
        }

        /* Label */
        .login-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: ${C.ink};
          margin-bottom: 6px;
          letter-spacing: -.003em;
        }

        /* Input con icono adelante */
        .login-input-wrap { position: relative; }
        .login-input-icon {
          position: absolute;
          left: 13px;
          top: 50%;
          transform: translateY(-50%);
          color: ${C.inkMuted};
          pointer-events: none;
          transition: color .15s ease;
        }
        .login-input {
          width: 100%;
          height: 44px;
          padding: 0 14px 0 40px;
          background: #FFFFFF;
          border: 1px solid ${C.border};
          border-radius: 10px;
          font-family: var(--font-manrope), sans-serif;
          font-size: 14.5px;
          font-weight: 500;
          color: ${C.ink};
          outline: none;
          transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
        }
        .login-input::placeholder { color: ${C.inkMuted}; font-weight: 400; letter-spacing: 0; }
        .login-input:hover { border-color: ${C.borderHi}; }
        .login-input:focus {
          border-color: ${C.navy};
          box-shadow: 0 0 0 4px ${C.ring};
        }
        .login-input-wrap:focus-within .login-input-icon { color: ${C.navy}; }

        /* Botón submit con shimmer */
        .login-submit {
          position: relative;
          width: 100%;
          height: 46px;
          margin-top: 4px;
          background: ${C.navy};
          color: #FFFFFF;
          border: 1px solid ${C.navy};
          border-radius: 10px;
          font-family: var(--font-manrope), sans-serif;
          font-size: 14.5px;
          font-weight: 600;
          letter-spacing: -.003em;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background .15s ease, border-color .15s ease, box-shadow .15s ease, transform .1s ease;
          box-shadow: 0 1px 2px rgba(11,36,71,.18), 0 6px 14px rgba(11,36,71,.22);
          overflow: hidden;
        }
        .login-submit::after {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.22) 50%, transparent 65%);
          transform: translateX(-110%);
          transition: transform .9s cubic-bezier(.4,0,.2,1);
        }
        .login-submit:hover:not(:disabled) {
          background: ${C.navyHi};
          border-color: ${C.navyHi};
          box-shadow: 0 2px 4px rgba(11,36,71,.28), 0 14px 28px rgba(11,36,71,.36);
          transform: translateY(-1px);
        }
        .login-submit:hover:not(:disabled)::after { transform: translateX(110%); }
        .login-submit:active:not(:disabled) { transform: translateY(0); }
        .login-submit:disabled { opacity: .65; cursor: not-allowed; }
        .login-submit:focus-visible {
          outline: none;
          box-shadow: 0 0 0 4px rgba(30,64,175,.3), 0 6px 14px rgba(11,36,71,.22);
        }

        /* ── Reveals escalonados (entrada cinematográfica) ── */
        .reveal { opacity: 0; transform: translateY(14px); animation: reveal-up .85s cubic-bezier(.2,.7,.2,1) both; }
        .reveal-1 { animation-delay: .15s; }
        .reveal-2 { animation-delay: .35s; }
        .reveal-3 { animation-delay: .45s; }
        .reveal-4 { animation-delay: .60s; }
        .reveal-5 { animation-delay: .85s; }
        /* El logo entra con un scale extra */
        .reveal.logo-wrap,
        .logo-wrap.reveal { animation-name: reveal-pop; }

        /* ── Keyframes ── */
        @keyframes reveal-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes reveal-pop {
          0%   { opacity: 0; transform: translateY(20px) scale(.88); }
          60%  { opacity: 1; }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-3px); }
          40%, 80% { transform: translateX(3px); }
        }
        @keyframes ken-burns {
          0%   { transform: scale(1.04) translate(0, 0); }
          100% { transform: scale(1.14) translate(-1.5%, -1.2%); }
        }
        @keyframes spin-slow {
          to { transform: rotate(360deg); }
        }
        @keyframes spin-slow-rev {
          to { transform: rotate(-360deg); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: .55; transform: scale(1); }
          50%      { opacity: .85; transform: scale(1.08); }
        }
        @keyframes pulse-card {
          0%, 100% { opacity: .55; transform: scale(.97); }
          50%      { opacity: .85; transform: scale(1.02); }
        }
        @keyframes card-sweep {
          0%   { transform: translateX(-110%); }
          100% { transform: translateX(110%); }
        }
        @keyframes drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(60px, 30px) scale(1.08); }
        }
        @keyframes drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-50px, -40px) scale(1.06); }
        }

        .animate-shake { animation: shake .35s ease; }

        /* ── Optimización móvil / táctil ──
           blur(80px)+mix-blend, ken-burns sobre foto full-screen y backdrop-filter
           saturan la GPU del celular → parpadeo y trabazón. Se apagan o aligeran. */
        @media (max-width: 768px), (hover: none) {
          .habich-login { --mx: 0 !important; --my: 0 !important; }
          .login-photo, .logo-wrap, .login-card { transform: none !important; will-change: auto; }
          .login-blob { display: none !important; }
          .login-photo img { animation: none !important; }
          .logo-glow, .logo-orbit, .logo-arc, .card-glow { animation: none !important; }
          .login-card {
            -webkit-backdrop-filter: none; backdrop-filter: none;
            background: rgba(255,255,255,.96);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .reveal, .animate-shake { animation: none !important; opacity: 1 !important; transform: none !important; }
          .login-photo img, .logo-orbit, .logo-arc, .logo-glow, .card-glow, .card-sweep,
          .login-blob, .login-photo { animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
