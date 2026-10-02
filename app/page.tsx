'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface LandingConfig {
  mision:          string | null
  vision:          string | null
  valores:         string | null
  direccion:       string | null
  telefono:        string | null
  email_contacto:  string | null
  facebook_url:    string | null
  instagram_url:   string | null
  fondo_url:       string | null
}
interface GaleriaItem { id: string; url: string; descripcion: string | null }
interface Comunicado  { id: string; titulo: string; contenido: string; created_at: string; imagen_url: string | null }

const DEFAULTS: LandingConfig = {
  mision:         'Formar estudiantes de alta competencia con valores sólidos y excelencia académica, preparándolos para afrontar los retos del mundo moderno con disciplina, creatividad y responsabilidad.',
  vision:         'Ser el colegio preuniversitario referente del sur del Perú, reconocido por la formación integral, el logro académico y el desarrollo de líderes que transformen su comunidad.',
  valores:        'Excelencia · Disciplina · Responsabilidad · Innovación · Respeto · Solidaridad',
  direccion:      'Juliaca, Puno, Perú',
  telefono:       null,
  email_contacto: null,
  facebook_url:   null,
  instagram_url:  null,
  fondo_url:      null,
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d < 1)  return 'Hoy'
  if (d < 7)  return `Hace ${d} ${d === 1 ? 'día' : 'días'}`
  return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
}

/* Número que cuenta hacia arriba al entrar en pantalla (respeta reduced-motion) */
function StatNum({ value, suffix, className = '' }: { value: number; suffix?: string; className?: string }) {
  const [n, setN] = useState(0)
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      if (reduce) { setN(value); return }
      const dur = 1500, t0 = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur)
        setN(Math.round(value * (1 - Math.pow(1 - p, 3))))
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [value])
  return <p ref={ref} className={`stat-num ${className}`}>{n}{suffix && <em>{suffix}</em>}</p>
}

/* ── Iconos SVG (sin emojis) ─────────────────────────── */
type IconProps = { size?: number; stroke?: number }
const SVG = (kids: React.ReactNode, fill = false) =>
  function I({ size = 24, stroke = 1.7 }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'}
        stroke={fill ? 'none' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        {kids}
      </svg>
    )
  }

const IconTarget   = SVG(<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/></>)
const IconCompass  = SVG(<><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.6 6.4-6.4 2.6 2.6-6.4Z"/></>)
const IconStar     = SVG(<path d="m12 3 2.6 5.6 6.1.6-4.6 4.2 1.4 6L12 16.5 6.5 19.4l1.4-6-4.6-4.2 6.1-.6L12 3Z"/>)
const IconLaurel   = SVG(<><path d="M12 21V8"/><path d="M6 6c0 4 2.5 6.5 6 8"/><path d="M18 6c0 4-2.5 6.5-6 8"/><path d="M12 4v2"/></>)
const IconAcademic = SVG(<><path d="M3 9 12 4l9 5-9 5-9-5Z"/><path d="M7 11v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5"/><path d="M21 9v5"/></>)
const IconSpark    = SVG(<><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m5 5 2.1 2.1"/><path d="m16.9 16.9 2.1 2.1"/><path d="m19 5-2.1 2.1"/><path d="m7.1 16.9-2.1 2.1"/></>)
const IconChevDown = SVG(<path d="m6 9 6 6 6-6"/>)
const IconArrowR   = SVG(<><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>)
const IconPin      = SVG(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>)
const IconPhone    = SVG(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c1 .3 1.9.6 2.8.7a2 2 0 0 1 1.7 2Z"/>)
const IconMail     = SVG(<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>)
const IconFacebook = SVG(<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3Z"/>, true)
const IconInstagram= SVG(<><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></>)
const IconZoom     = SVG(<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M11 8v6"/><path d="M8 11h6"/></>)
const IconClose    = SVG(<><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>)
const IconMenu     = SVG(<><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></>)
const IconBell     = SVG(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9Z"/><path d="M10 21a2 2 0 0 0 4 0"/></>)
const IconPhoto    = SVG(<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></>)

const CSS = `
  /* ── Paleta institucional navy (estilo login) ── */
  .lp {
    --navy:   #0B2447;
    --navy-2: #143875;
    --blue:   #1E40AF;
    --blue-l: #2563EB;
    --cyan:   #0E7490;
    --wine:   #7e1d2e;          /* rojo vino (acento de herencia) */
    --gold:   #c8a24b;          /* oro mate (acento de excelencia) */
    --gold-soft: rgba(200,162,75,.5);
    --ink:    #0F172A;
    --ink-2:  #475569;
    --ink-3:  #94A3B8;
    --line:   #E7E2D8;          /* hairline cálido (combina con el marfil) */
    --bg-soft:#F7F3EA;          /* marfil cálido */
    --navy-08: rgba(11,36,71,.06);
    --grad:   linear-gradient(135deg, #1E40AF 0%, #0B2447 100%);
    --sh-1: 0 1px 2px rgba(11,36,71,.05);
    --sh-2: 0 14px 36px -18px rgba(11,36,71,.28), 0 2px 8px rgba(11,36,71,.06);
    --sh-3: 0 30px 64px -28px rgba(11,36,71,.4), 0 6px 16px rgba(11,36,71,.08);
    --mx: 0; --my: 0;

    font-family: var(--ui-font-sans), system-ui, sans-serif;
    font-feature-settings: 'ss01' 1, 'cv11' 1;
    -webkit-font-smoothing: antialiased;
    color: var(--ink);
    background: var(--bg-soft);
    overflow-x: hidden;
    scroll-behavior: smooth;
    -webkit-tap-highlight-color: transparent;
  }
  .lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
  .lp button, .lp a { touch-action: manipulation; }
  .lp ::selection { background: rgba(30,64,175,.18); }

  @keyframes lp-float  { 0%,100% { transform: translateX(-50%) translateY(0) } 50% { transform: translateX(-50%) translateY(6px) } }
  @keyframes lp-spin   { to { transform: rotate(360deg) } }
  @keyframes lp-spinr  { to { transform: rotate(-360deg) } }
  @keyframes kenburns  { from { transform: scale(1.04) } to { transform: scale(1.16) translate(-1.5%,-1.2%) } }
  @keyframes drift-a   { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(60px,30px) scale(1.08) } }
  @keyframes drift-b   { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-50px,-40px) scale(1.06) } }
  @keyframes pulse-glow{ 0%,100% { opacity:.5; transform: scale(1) } 50% { opacity:.8; transform: scale(1.08) } }
  @keyframes ctaflow   { 0%,100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }
  @keyframes marquee   { from { transform: translateX(0) } to { transform: translateX(-50%) } }
  @keyframes shine     { from { left:-130% } to { left:180% } }
  @media (prefers-reduced-motion: reduce) {
    .lp *, .lp *::before, .lp *::after { animation: none !important; transition: none !important; }
  }

  .container { max-width: 1160px; margin: 0 auto; padding: 0 24px; }
  .container-narrow { max-width: 900px; margin: 0 auto; padding: 0 24px; }
  @media (max-width: 600px) { .container, .container-narrow { padding: 0 18px; } }

  /* ── Nav ── */
  .nav { position: fixed; inset: 0 0 auto 0; z-index: 50; transition: background .35s ease, box-shadow .35s ease, border-color .35s ease; border-bottom: 1px solid transparent; }
  .nav.scrolled { background: rgba(255,255,255,.86); -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); border-color: var(--line); box-shadow: 0 6px 22px -16px rgba(11,36,71,.45); }
  .nav-row { height: 70px; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 13px; }
  .brand-logo { position: relative; flex: none; width: 46px; height: 46px; border-radius: 50%; overflow: hidden; background: #fff; padding: 4px; box-shadow: 0 0 0 1px rgba(11,36,71,.08), 0 2px 10px rgba(11,36,71,.2); transition: width .3s ease, height .3s ease; }
  .nav.scrolled .brand-logo { width: 40px; height: 40px; }
  .brand-text-eb { font-size: 9px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; line-height: 1; transition: color .3s; }
  .brand-text-tt { font-size: 16px; font-weight: 800; line-height: 1.2; margin-top: 3px; letter-spacing: -.01em; transition: color .3s, font-size .3s; }
  .nav.scrolled .brand-text-eb { color: var(--blue); } .nav.scrolled .brand-text-tt { color: var(--navy); font-size: 15px; }
  .nav:not(.scrolled) .brand-text-eb { color: rgba(255,255,255,.78); } .nav:not(.scrolled) .brand-text-tt { color: #fff; }
  .nav-links { display: flex; align-items: center; gap: 30px; }
  .nav-link { font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; text-decoration: none; transition: color .2s; padding: 6px 0; position: relative; }
  .nav-link::after { content: ''; position: absolute; left: 0; right: 0; bottom: -2px; height: 2px; border-radius: 2px; background: currentColor; transform: scaleX(0); transform-origin: left; transition: transform .25s ease; opacity: .8; }
  .nav-link:hover::after { transform: scaleX(1); }
  .nav.scrolled .nav-link { color: var(--ink-2); } .nav.scrolled .nav-link:hover { color: var(--blue); }
  .nav:not(.scrolled) .nav-link { color: rgba(255,255,255,.82); } .nav:not(.scrolled) .nav-link:hover { color: #fff; }

  /* ── Botones ── */
  .btn { position: relative; overflow: hidden; display: inline-flex; align-items: center; gap: 9px; padding: 14px 26px; border-radius: 12px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; text-decoration: none; cursor: pointer; border: none; transition: transform .2s ease, box-shadow .25s ease, background .2s ease, border-color .2s ease, color .2s ease; line-height: 1; white-space: nowrap; }
  .btn::after { content: ''; position: absolute; top: 0; left: -130%; width: 55%; height: 100%; transform: skewX(-20deg); pointer-events: none; background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent); }
  .btn:hover::after { animation: shine .85s ease; }
  .btn:focus-visible { outline: 2px solid var(--blue-l); outline-offset: 3px; }
  .btn-primary { background: var(--grad); color: #fff; box-shadow: 0 12px 26px -10px rgba(11,36,71,.55); }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 18px 34px -12px rgba(11,36,71,.6); }
  .btn-white { background: #fff; color: var(--navy); box-shadow: 0 12px 30px -10px rgba(11,36,71,.35); }
  .btn-white:hover { transform: translateY(-2px); box-shadow: 0 18px 40px -12px rgba(11,36,71,.45); }
  .btn-ghost-light { background: rgba(255,255,255,.1); color: #fff; border: 1.5px solid rgba(255,255,255,.42); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
  .btn-ghost-light:hover { background: rgba(255,255,255,.2); transform: translateY(-2px); border-color: #fff; }
  .btn-sm { padding: 11px 22px; font-size: 11px; }

  /* ── Eyebrow + sección ── */
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .24em; text-transform: uppercase; color: var(--blue); }
  .eyebrow.cyan { color: var(--cyan); }
  .eyebrow-n { font-variant-numeric: tabular-nums; opacity: .55; margin-right: 8px; }
  .section-head { text-align: center; margin-bottom: 56px; }
  .h-section { font-size: clamp(30px, 4.6vw, 50px); font-weight: 800; line-height: 1.08; letter-spacing: -.025em; color: var(--navy); margin: 14px 0 0; }
  .h-section em { font-style: normal; color: var(--blue); }
  .section-head .h-section::after { content: ''; display: block; width: 46px; height: 3px; margin: 18px auto 0; border-radius: 3px; background: linear-gradient(90deg, var(--gold), #e0c074); }
  .section-lead { font-size: 16px; line-height: 1.7; color: var(--ink-2); max-width: 560px; margin: 16px auto 0; }

  /* ── Hero ── */
  .hero { position: relative; min-height: 100dvh; display: flex; align-items: center; justify-content: center; overflow: hidden; isolation: isolate; }
  .hero-bg { position: absolute; inset: 0; z-index: 0; overflow: hidden; transform: translate3d(calc(var(--mx) * -12px), calc(var(--my) * -10px), 0); transition: transform .55s cubic-bezier(.2,.7,.2,1); will-change: transform; }
  .hero-bg img { animation: kenburns 30s ease-in-out infinite alternate; will-change: transform; }
  .hero-scrim { position: absolute; inset: 0; z-index: 1; pointer-events: none; background:
    radial-gradient(120% 80% at 50% 25%, transparent 0%, rgba(11,36,71,.4) 60%, rgba(8,17,33,.78) 100%),
    linear-gradient(180deg, rgba(11,36,71,.55) 0%, rgba(11,36,71,.3) 38%, rgba(8,17,33,.8) 100%); }
  .hero-blob { position: absolute; z-index: 1; border-radius: 50%; pointer-events: none; filter: blur(80px); mix-blend-mode: screen; }
  .hero-blob.b1 { top: -12%; left: -10%; width: 480px; height: 480px; background: radial-gradient(circle, rgba(30,64,175,.5), transparent 70%); animation: drift-a 24s ease-in-out infinite; }
  .hero-blob.b2 { bottom: -16%; right: -10%; width: 540px; height: 540px; background: radial-gradient(circle, rgba(56,189,248,.42), transparent 70%); animation: drift-b 30s ease-in-out infinite; }
  .hero-blob.b3 { top: 34%; left: 40%; width: 360px; height: 360px; background: radial-gradient(circle, rgba(126,29,46,.4), transparent 70%); animation: drift-a 27s ease-in-out infinite; animation-delay: -9s; }
  .hero-content { position: relative; z-index: 5; text-align: center; padding: 128px 24px 120px; max-width: 880px; margin: 0 auto; }

  .hero-logo { position: relative; width: 150px; height: 150px; margin: 0 auto 30px; transform: translate3d(calc(var(--mx) * 8px), calc(var(--my) * 6px), 0); transition: transform .35s cubic-bezier(.2,.7,.2,1); will-change: transform; }
  .logo-glow { position: absolute; inset: -26px; border-radius: 50%; background: radial-gradient(circle, rgba(147,197,253,.55), transparent 65%); filter: blur(24px); animation: pulse-glow 4.5s ease-in-out infinite; z-index: 0; pointer-events: none; }
  .logo-orbit { position: absolute; inset: -18px; border-radius: 50%; border: 1.5px dashed rgba(255,255,255,.5); animation: lp-spin 40s linear infinite; z-index: 1; pointer-events: none; }
  .logo-arc { position: absolute; inset: -9px; border-radius: 50%; border: 1.5px solid transparent; border-top-color: rgba(255,255,255,.85); border-right-color: rgba(255,255,255,.4); animation: lp-spinr 28s linear infinite; z-index: 1; pointer-events: none; }
  .logo-inner { position: absolute; inset: 0; border-radius: 50%; background: #fff; overflow: hidden; padding: 12px; z-index: 2; box-shadow: 0 18px 50px rgba(11,36,71,.5), 0 6px 14px rgba(0,0,0,.25); }

  .hero-eyebrow { color: rgba(255,255,255,.88); margin-bottom: 18px; text-shadow: 0 1px 10px rgba(8,17,33,.6); }
  .hero-title { font-weight: 800; line-height: 1; letter-spacing: -.03em; margin: 0; text-shadow: 0 4px 30px rgba(8,17,33,.55); }
  .hero-title-first { display: block; font-size: clamp(16px, 2.4vw, 22px); font-weight: 500; color: rgba(255,255,255,.78); letter-spacing: .02em; margin-bottom: 8px; }
  .hero-title-second { display: block; font-size: clamp(42px, 7.6vw, 84px); font-weight: 800; color: #fff; }
  .hero-title::after { content: ''; display: block; width: 64px; height: 2px; margin: 20px auto 0; border-radius: 2px; background: linear-gradient(90deg, transparent, var(--gold), transparent); }
  .hero-meta { display: inline-flex; align-items: center; gap: 11px; margin-top: 22px; padding: 9px 20px; border: 1px solid rgba(255,255,255,.26); border-radius: 999px; background: rgba(11,36,71,.34); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); font-size: 11px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,255,255,.95); }
  .hero-meta svg { color: #93c5fd; }
  .hero-quote { font-size: clamp(15px, 1.8vw, 18px); color: rgba(255,255,255,.9); max-width: 540px; margin: 26px auto 38px; line-height: 1.6; text-shadow: 0 1px 12px rgba(0,0,0,.4); }
  .hero-ctas { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
  .hero-scroll { position: absolute; bottom: 26px; left: 50%; transform: translateX(-50%); z-index: 5; color: rgba(255,255,255,.6); animation: lp-float 2.6s ease infinite; pointer-events: none; }

  /* ── Detalles del hero: wordmark de fondo + rieles laterales ── */
  .hero-watermark { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; overflow: hidden; pointer-events: none; }
  .hero-watermark span { font-weight: 800; font-size: clamp(92px, 23vw, 340px); line-height: 1; letter-spacing: .05em; white-space: nowrap; color: transparent;
    -webkit-text-stroke: 1.5px rgba(255,255,255,.1); text-stroke: 1.5px rgba(255,255,255,.1);
    transform: translate3d(calc(var(--mx) * -16px), calc(var(--my) * -10px), 0); transition: transform .6s cubic-bezier(.2,.7,.2,1); will-change: transform; }
  .hero-rail { position: absolute; top: 98px; bottom: 70px; z-index: 4; width: 1px; pointer-events: none; display: none;
    background: linear-gradient(180deg, transparent, rgba(255,255,255,.28) 16%, rgba(255,255,255,.28) 84%, transparent); }
  .hero-rail.l { left: 44px; } .hero-rail.r { right: 44px; }
  .hero-rail::before, .hero-rail::after { content: ''; position: absolute; left: 50%; width: 5px; height: 5px; border-radius: 50%; background: rgba(168,58,74,.95); box-shadow: 0 0 8px rgba(126,29,46,.6); transform: translateX(-50%); }
  .hero-rail::before { top: -2px; } .hero-rail::after { bottom: -2px; }
  .hero-rail-label { position: absolute; top: 50%; left: 50%; white-space: nowrap; font-size: 10px; font-weight: 700; letter-spacing: .32em; text-transform: uppercase; color: rgba(255,255,255,.7);
    padding: 9px 5px; border-radius: 4px; background: rgba(8,17,33,.4); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
  .hero-rail.l .hero-rail-label { transform: translate(-50%,-50%) rotate(-90deg); }
  .hero-rail.r .hero-rail-label { transform: translate(-50%,-50%) rotate(90deg); }
  @media (min-width: 980px) { .hero-rail { display: block; } }

  /* ── Stats (vidrio sobre la foto) ── */
  .stats-wrap { position: relative; z-index: 6; max-width: 880px; margin: -52px auto 0; padding: 0 24px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); background: rgba(255,255,255,.82); -webkit-backdrop-filter: blur(22px) saturate(150%); backdrop-filter: blur(22px) saturate(150%); border: 1px solid rgba(255,255,255,.6); border-radius: 20px; box-shadow: var(--sh-3); overflow: hidden; }
  @media (max-width: 640px) { .stats { grid-template-columns: 1fr; } }
  .stat-cell { padding: 30px 18px 26px; text-align: center; border-right: 1px solid var(--line); }
  .stat-cell:last-child { border-right: none; }
  @media (max-width: 640px) { .stat-cell { border-right: none; border-bottom: 1px solid var(--line); } .stat-cell:last-child { border-bottom: none; } }
  .stat-num { font-family: var(--ui-font-mono), monospace; font-size: clamp(30px, 4vw, 40px); font-weight: 600; color: var(--navy); line-height: 1; letter-spacing: -.02em; }
  .stat-num em { font-style: normal; color: var(--blue); font-weight: 500; font-size: .58em; margin-left: 4px; font-family: var(--ui-font-sans); letter-spacing: 0; }
  .stat-num.blue, .stat-num.blue em { color: var(--blue); }
  .stat-num.cyan, .stat-num.cyan em { color: var(--cyan); }
  .stat-num.wine, .stat-num.wine em { color: var(--wine); }
  .stat-label { font-size: 10px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: var(--ink-2); margin-top: 12px; }

  /* ── Marquee de valores ── */
  .marquee { overflow: hidden; background: #fff; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 16px 0; -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); }
  .marquee-track { display: inline-flex; align-items: center; white-space: nowrap; animation: marquee 36s linear infinite; }
  .marquee:hover .marquee-track { animation-play-state: paused; }
  /* Espaciado por ítem (no 'gap' del track) → el bucle de -50% queda sin costura */
  .marquee-item { display: inline-flex; align-items: center; gap: 16px; margin: 0 22px; font-size: 16px; font-weight: 700; color: var(--navy); letter-spacing: -.01em; }
  .marquee-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--blue); flex: none; }
  .marquee-dot.cyan { background: var(--cyan); }
  .marquee-dot.wine { background: var(--wine); }

  /* ── Auras de sección ── */
  .pillars, .gallery, .news, .principles { position: relative; overflow: hidden; }
  .pillars > .container, .gallery > .container, .news > .container-narrow, .principles > .container { position: relative; z-index: 1; }
  .pillars::before { content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none; background: radial-gradient(46% 38% at 88% -4%, rgba(30,64,175,.06), transparent 60%); }
  .news::before { content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none; background: radial-gradient(42% 38% at 8% -4%, rgba(14,116,144,.06), transparent 60%); }

  /* ── Pilares ── */
  .pillars { background: var(--bg-soft); padding: 116px 0 108px; }
  .pillar-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  @media (max-width: 920px) { .pillar-grid { grid-template-columns: 1fr; gap: 18px; } }
  .pillar { position: relative; background: rgba(255,255,255,.9); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); border: 1px solid var(--line); border-radius: 20px; padding: 40px 34px 36px; box-shadow: var(--sh-1); transition: transform .35s ease, box-shadow .35s ease, border-color .35s ease; }
  .pillar:hover { transform: translateY(-5px); box-shadow: 0 26px 52px -26px rgba(11,36,71,.4), var(--sh-2); border-color: rgba(30,64,175,.3); }
  .pillar-num { position: absolute; top: 14px; right: 24px; font-size: 56px; font-weight: 800; line-height: 1; color: rgba(11,36,71,.06); letter-spacing: -.05em; user-select: none; pointer-events: none; transition: color .35s ease; }
  .pillar:hover .pillar-num { color: rgba(30,64,175,.14); }
  .pillar-icon { width: 54px; height: 54px; border-radius: 15px; background: var(--navy-08); display: flex; align-items: center; justify-content: center; color: var(--blue); margin-bottom: 22px; transition: background .3s ease, color .3s ease, transform .3s ease; }
  .pillar:hover .pillar-icon { background: var(--grad); color: #fff; transform: scale(1.04); }
  .pillar-label { font-size: 10px; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; color: var(--blue); margin-bottom: 8px; }
  .pillar-title { font-size: 22px; font-weight: 800; color: var(--navy); line-height: 1.2; margin-bottom: 16px; letter-spacing: -.02em; }
  .pillar-body { font-size: 14.5px; line-height: 1.75; color: var(--ink-2); white-space: pre-wrap; }
  .pillar-values { display: flex; flex-wrap: wrap; gap: 8px; }
  .pillar-chip { display: inline-block; padding: 7px 14px; border-radius: 999px; background: var(--navy-08); border: 1px solid rgba(30,64,175,.14); font-size: 12px; font-weight: 600; color: var(--blue); transition: all .25s ease; }
  .pillar-chip:hover { background: var(--grad); color: #fff; border-color: transparent; }

  /* ── Principios ── */
  .principles { background: #fff; padding: 96px 0; }
  .principles-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  @media (max-width: 920px) { .principles-grid { grid-template-columns: 1fr; } }
  .principle { display: flex; gap: 18px; padding: 28px 26px; border-radius: 16px; background: var(--bg-soft); border: 1px solid var(--line); transition: border-color .3s ease, transform .3s ease, box-shadow .3s ease, background .3s ease; }
  .principle:hover { background: #fff; border-color: rgba(30,64,175,.3); transform: translateY(-3px); box-shadow: var(--sh-2); }
  .principle-icon { flex: none; width: 48px; height: 48px; border-radius: 13px; background: #fff; color: var(--blue); display: flex; align-items: center; justify-content: center; border: 1px solid var(--line); transition: background .3s ease, color .3s ease, border-color .3s ease; }
  .principle:hover .principle-icon { background: var(--grad); color: #fff; border-color: transparent; }
  .principle.cyan .principle-icon { color: var(--cyan); }
  .principle.cyan:hover .principle-icon { background: linear-gradient(135deg, #0e9bb8, #0c5e72); }
  .principle.cyan:hover { border-color: rgba(14,116,144,.3); }
  .principle.gold .principle-icon { color: var(--gold); }
  .principle.gold:hover .principle-icon { background: linear-gradient(135deg, #d6b261, #b6913f); color: #fff; }
  .principle.gold:hover { border-color: rgba(200,162,75,.42); }
  .principle-title { font-size: 18px; font-weight: 800; color: var(--navy); line-height: 1.3; margin-bottom: 6px; letter-spacing: -.01em; }
  .principle-desc { font-size: 13.5px; line-height: 1.7; color: var(--ink-2); }

  /* ── Galería ── */
  .gallery { background: var(--bg-soft); padding: 104px 0; }
  .gal { display: grid; grid-template-columns: repeat(12, 1fr); gap: 14px; grid-auto-rows: 200px; }
  @media (max-width: 920px) { .gal { grid-auto-rows: 170px; gap: 12px; } }
  @media (max-width: 640px) { .gal { grid-template-columns: repeat(6, 1fr); grid-auto-rows: 140px; } }
  .gal-item { position: relative; border-radius: 18px; overflow: hidden; cursor: pointer; box-shadow: var(--sh-1); border: 1px solid var(--line); transition: transform .35s ease, box-shadow .35s ease; }
  .gal-item:hover { transform: translateY(-3px); box-shadow: var(--sh-3); }
  .gal-item:hover .gal-ov { opacity: 1; }
  .gal-item img { transition: transform .55s ease; }
  .gal-item:hover img { transform: scale(1.05); }
  .gal-ov { position: absolute; inset: 0; opacity: 0; transition: opacity .35s ease; background: linear-gradient(to top, rgba(8,17,33,.9) 0%, rgba(8,17,33,.2) 60%, transparent 100%); display: flex; align-items: flex-end; padding: 18px; color: #fff; font-size: 13px; font-weight: 500; }
  .gal-ov .ov-zoom { position: absolute; top: 14px; right: 14px; color: rgba(255,255,255,.92); }
  .empty { text-align: center; padding: 70px 0; }
  .empty-icon { width: 64px; height: 64px; border-radius: 18px; background: var(--navy-08); border: 1px solid rgba(30,64,175,.14); display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; color: var(--blue); }
  .empty-icon.cyan { color: var(--cyan); border-color: rgba(14,116,144,.16); }
  .empty-text { font-size: 13px; color: var(--ink-3); }

  /* ── Comunicados ── */
  .news { background: #fff; padding: 104px 0; }
  .com-list { display: flex; flex-direction: column; gap: 22px; }
  .com { display: grid; grid-template-columns: 320px 1fr; border-radius: 20px; overflow: hidden; background: #fff; border: 1px solid var(--line); box-shadow: var(--sh-1); transition: transform .3s ease, box-shadow .3s ease, border-color .3s ease; }
  .com:hover { transform: translateY(-4px); box-shadow: var(--sh-2); border-color: rgba(14,116,144,.28); }
  .com.no-image { grid-template-columns: 1fr; }
  @media (max-width: 720px) { .com { grid-template-columns: 1fr; } }
  .com-image { position: relative; aspect-ratio: 4/3; cursor: zoom-in; overflow: hidden; }
  @media (max-width: 720px) { .com-image { aspect-ratio: 16/9; } }
  .com-image img { transition: transform .55s ease; }
  .com:hover .com-image img { transform: scale(1.04); }
  .com-body { padding: 30px 34px; display: flex; flex-direction: column; justify-content: center; }
  .com-meta { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--cyan); margin-bottom: 12px; }
  .com-title { font-size: clamp(20px, 2.4vw, 25px); font-weight: 800; color: var(--navy); line-height: 1.3; margin: 0 0 12px; letter-spacing: -.02em; }
  .com-text { font-size: 14.5px; line-height: 1.75; color: var(--ink-2); white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }

  /* ── Banda CTA ── */
  .cta-band { position: relative; overflow: hidden; isolation: isolate; padding: 90px 0; text-align: center;
    background: linear-gradient(120deg, #1E40AF 0%, #0B2447 38%, #143875 64%, #0B2447 100%); background-size: 280% 280%; animation: ctaflow 16s ease infinite; }
  .cta-band::before { content: ''; position: absolute; inset: 0; z-index: -1; opacity: .7; pointer-events: none;
    background: radial-gradient(46% 80% at 82% 0%, rgba(56,189,248,.35), transparent 55%), radial-gradient(44% 85% at 6% 100%, rgba(30,64,175,.6), transparent 55%); }
  .cta-eyebrow { color: rgba(255,255,255,.72); }
  .cta-title { font-size: clamp(28px, 4.4vw, 46px); font-weight: 800; color: #fff; line-height: 1.1; letter-spacing: -.025em; max-width: 740px; margin: 14px auto 0; }
  .cta-title em { font-style: normal; color: #93c5fd; }
  .cta-lead { font-size: 16px; line-height: 1.7; color: rgba(255,255,255,.82); max-width: 530px; margin: 16px auto 30px; }
  .cta-actions { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }

  /* ── Footer ── */
  .footer { position: relative; background: linear-gradient(180deg, #0B2447 0%, #081121 100%); color: rgba(255,255,255,.72); padding: 82px 0 36px; }
  .footer::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--gold-soft), transparent); }
  .foot-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 52px; margin-bottom: 50px; }
  @media (max-width: 820px) { .foot-grid { grid-template-columns: 1fr; gap: 34px; } }
  .foot-brand { display: flex; align-items: center; gap: 13px; margin-bottom: 16px; }
  .foot-logo { position: relative; width: 48px; height: 48px; flex: none; border-radius: 50%; overflow: hidden; background: #fff; padding: 4px; box-shadow: 0 0 0 1px rgba(255,255,255,.25); }
  .foot-label { font-size: 10px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: rgba(255,255,255,.5); margin-bottom: 20px; }
  .foot-text { font-size: 13.5px; line-height: 1.75; color: rgba(255,255,255,.55); }
  .foot-row { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 13px; font-size: 13px; line-height: 1.6; color: rgba(255,255,255,.62); }
  .foot-row svg { flex: none; color: #93c5fd; margin-top: 2px; }
  .soc { display: inline-flex; width: 44px; height: 44px; border-radius: 12px; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: #fff; transition: all .25s ease; text-decoration: none; }
  .soc:hover { background: #fff; border-color: #fff; transform: translateY(-2px); color: var(--navy); }
  .foot-bottom { border-top: 1px solid rgba(255,255,255,.12); padding-top: 26px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .foot-bottom-text { font-size: 12px; color: rgba(255,255,255,.42); }
  .foot-bottom-link { font-size: 12px; font-weight: 600; color: rgba(255,255,255,.85); text-decoration: none; transition: color .2s; display: inline-flex; align-items: center; gap: 8px; }
  .foot-bottom-link:hover { color: #fff; }

  /* ── Mobile menu ── */
  .mobile-toggle { background: none; border: none; padding: 9px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: #fff; }
  .nav.scrolled .mobile-toggle { color: var(--navy); }
  .mobile-menu { background: #fff; border-top: 1px solid var(--line); padding: 8px 20px 18px; box-shadow: 0 8px 32px rgba(11,36,71,.12); }
  .mobile-item { display: block; padding: 15px 8px; color: var(--ink-2); font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; text-decoration: none; border-bottom: 1px solid var(--line); }
  .mobile-item:last-child { border-bottom: none; color: var(--blue); margin-top: 4px; }

  /* ── Lightbox ── */
  .lb { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(8,17,33,.92); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
  .lb-close { position: absolute; top: 20px; right: 20px; width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.1); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; transition: background .2s; }
  .lb-close:hover { background: rgba(255,255,255,.2); }
  .lb-img { max-width: 90vw; max-height: 85vh; border-radius: 16px; box-shadow: 0 40px 100px rgba(0,0,0,.7); object-fit: contain; }

  /* ── Aparición al hacer scroll ── */
  .lp.js .reveal { opacity: 0; transform: translateY(26px); }
  .lp.js .reveal.in { opacity: 1; transform: none; transition: opacity .7s ease, transform .7s cubic-bezier(.2,.7,.2,1); }
  @media (prefers-reduced-motion: reduce) { .lp.js .reveal { opacity: 1 !important; transform: none !important; } }

  /* ── Visibilidad por breakpoint ── */
  .only-desktop { display: flex; } .only-mobile { display: none; }
  @media (max-width: 880px) { .only-desktop { display: none; } .only-mobile { display: flex; } }

  /* ── Optimización móvil / táctil ──
     blur(80px) + mix-blend, kenburns sobre foto a pantalla completa y los
     backdrop-filter saturan la GPU en celulares → parpadeo y trabazón.
     En pantallas chicas o sin puntero fino, los apagamos o aligeramos. */
  @media (max-width: 768px), (hover: none) {
    /* Sin parallax (las vars quedan en 0 → transforms neutros) */
    .lp { --mx: 0 !important; --my: 0 !important; }
    .hero-bg, .hero-logo, .hero-watermark span { transform: none !important; will-change: auto; }

    /* Blobs: fuera el blur enorme + blend; el scrim ya da el ambiente */
    .hero-blob { display: none !important; }

    /* Sin kenburns sobre la imagen full-screen */
    .hero-bg img { animation: none !important; }

    /* Glow/órbitas del logo: quietos */
    .logo-glow, .logo-orbit, .logo-arc { animation: none !important; }

    /* Sin backdrop-filter (muy caro al recomponer en scroll) → fondos sólidos */
    .nav.scrolled { -webkit-backdrop-filter: none; backdrop-filter: none; background: rgba(255,255,255,.97); }
    .stats { -webkit-backdrop-filter: none; backdrop-filter: none; background: #fff; }
    .pillar { -webkit-backdrop-filter: none; backdrop-filter: none; background: #fff; }
    .hero-meta { -webkit-backdrop-filter: none; backdrop-filter: none; background: rgba(11,36,71,.55); }

    /* CTA: sin animar background-position (fuerza repintado del bloque) */
    .cta-band { animation: none !important; background-size: 100% 100%; }
  }
`

export default function LandingPage() {
  const [config,      setConfig]      = useState<LandingConfig>(DEFAULTS)
  const [galeria,     setGaleria]     = useState<GaleriaItem[]>([])
  const [comunicados, setComunicados] = useState<Comunicado[]>([])
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [scrolled,    setScrolled]    = useState(false)
  const [lightbox,    setLightbox]    = useState<string | null>(null)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  useEffect(() => {
    async function load() {
      const [{ data: cfg }, { data: gal }, { data: com }] = await Promise.all([
        supabase.from('landing_config').select('*').eq('id', 1).maybeSingle(),
        supabase.from('landing_galeria').select('id,url,descripcion').order('orden').limit(12),
        supabase.from('anuncios')
          .select('id,titulo,contenido,created_at,imagen_url')
          .eq('tipo', 'global').eq('en_landing', true)
          .order('created_at', { ascending: false }).limit(6),
      ])
      if (cfg) setConfig({ ...DEFAULTS, ...cfg })
      setGaleria(gal ?? [])
      setComunicados(com ?? [])
    }
    load()
  }, [])

  // Parallax con el cursor (mueve foto + logo del hero). Respeta reduced-motion.
  // Solo en punteros finos (mouse): en táctil, 'pointermove' se dispara en cada
  // frame del scroll y traba/parpadea el móvil.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return
    const root = document.querySelector('.lp') as HTMLElement | null
    if (!root) return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        root.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5).toFixed(3))
        root.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5).toFixed(3))
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf) }
  }, [])

  // Aparición progresiva al hacer scroll (clase .js solo en cliente → base siempre visible)
  useEffect(() => {
    const root = document.querySelector('.lp')
    if (!root) return
    root.classList.add('js')
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    root.querySelectorAll('.reveal').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [galeria, comunicados])

  const NAV = [
    { href: '#nosotros',    label: 'Nosotros' },
    { href: '#galeria',     label: 'Galería' },
    { href: '#comunicados', label: 'Comunicados' },
    { href: '#contacto',    label: 'Contacto' },
  ]

  const valoresList = (config.valores ?? DEFAULTS.valores ?? '')
    .split(/[·,•|]/).map(v => v.trim()).filter(Boolean)

  // Cinta sin huecos: repetimos los valores hasta que una "mitad" sea bien ancha
  // (más que cualquier pantalla) y luego la duplicamos para el bucle de -50%.
  const marqueeItems = (() => {
    if (!valoresList.length) return []
    const perHalf = Math.max(2, Math.ceil(16 / valoresList.length))
    const half = Array.from({ length: perHalf }, () => valoresList).flat()
    return [...half, ...half]
  })()

  const galSpan = (i: number): React.CSSProperties => {
    if (galeria.length < 4) return { gridColumn: 'span 6', gridRow: 'span 1' }
    const pattern: Array<{ c: number; r: number }> = [
      { c: 6, r: 2 }, { c: 6, r: 1 }, { c: 3, r: 1 }, { c: 3, r: 1 },
      { c: 4, r: 1 }, { c: 4, r: 1 }, { c: 4, r: 1 },
      { c: 6, r: 1 }, { c: 6, r: 1 },
      { c: 3, r: 1 }, { c: 3, r: 1 }, { c: 3, r: 1 }, { c: 3, r: 1 },
    ]
    const p = pattern[i] ?? { c: 3, r: 1 }
    return { gridColumn: `span ${p.c}`, gridRow: `span ${p.r}` }
  }

  return (
    <div className="lp">
      <style>{CSS}</style>

      {/* ── NAVBAR ── */}
      <nav className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="container nav-row">
          <div className="brand">
            <div className="brand-logo">
              <Image src="/colegio.png" alt="Logo del colegio" fill className="object-contain" />
            </div>
            <div className="hidden sm:block">
              <p className="brand-text-eb">Colegio de Alta Competencia</p>
              <p className="brand-text-tt">Eduardo de Habich</p>
            </div>
          </div>

          <div className="nav-links only-desktop">
            {NAV.map(l => <a key={l.href} href={l.href} className="nav-link">{l.label}</a>)}
            <Link href="/padres" className="nav-link">Padres</Link>
            <Link href="/login" className={`btn btn-sm ${scrolled ? 'btn-primary' : 'btn-ghost-light'}`}>
              Ingresar <IconArrowR size={14} />
            </Link>
          </div>

          <div className="only-mobile" style={{ alignItems: 'center', gap: 10 }}>
            <Link href="/login" className={`btn btn-sm ${scrolled ? 'btn-primary' : 'btn-ghost-light'}`}>Ingresar</Link>
            <button className="mobile-toggle" onClick={() => setMenuOpen(v => !v)} aria-label="Abrir menú" aria-expanded={menuOpen}>
              {menuOpen ? <IconClose size={22} /> : <IconMenu size={22} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="mobile-menu">
            {NAV.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="mobile-item">{l.label}</a>
            ))}
            <Link href="/padres" onClick={() => setMenuOpen(false)} className="mobile-item">Padres de familia</Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-bg">
          <Image src={config.fondo_url ?? '/foto_colegio.jpg'} alt="Colegio Eduardo de Habich" fill className="object-cover" priority />
        </div>
        <div className="hero-scrim" />
        <div aria-hidden className="hero-blob b1" />
        <div aria-hidden className="hero-blob b2" />
        <div aria-hidden className="hero-blob b3" />
        <div aria-hidden className="hero-watermark"><span>HABICH</span></div>
        <div aria-hidden className="hero-rail l"><span className="hero-rail-label">Colegio · Juliaca</span></div>
        <div aria-hidden className="hero-rail r"><span className="hero-rail-label">Est. 2023</span></div>

        <div className="hero-content">
          <div className="hero-logo">
            <div aria-hidden className="logo-glow" />
            <div aria-hidden className="logo-orbit" />
            <div aria-hidden className="logo-arc" />
            <div className="logo-inner">
              <Image src="/colegio.png" alt="" fill className="object-contain" />
            </div>
          </div>

          <div className="eyebrow hero-eyebrow">Colegio de Alta Competencia</div>

          <h1 className="hero-title">
            <span className="hero-title-first">Eduardo</span>
            <span className="hero-title-second">de Habich</span>
          </h1>

          <div className="hero-meta">
            <IconPin size={13} />
            <span>Juliaca · Puno · Perú</span>
          </div>

          <p className="hero-quote">
            Formando estudiantes de excelencia académica y valores sólidos,
            listos para transformar el futuro.
          </p>

          <div className="hero-ctas">
            <Link href="/login" className="btn btn-white">
              Ingresar al sistema <IconArrowR size={14} />
            </Link>
            <a href="#nosotros" className="btn btn-ghost-light">Conoce el colegio</a>
          </div>
        </div>

        <a href="#stats" className="hero-scroll" aria-label="Desplazar hacia abajo">
          <IconChevDown size={26} />
        </a>
      </section>

      {/* ── STATS ── */}
      <section id="stats" className="stats-wrap">
        <div className="stats">
          <div className="stat-cell">
            <StatNum value={3} suffix="años" />
            <p className="stat-label">Formando líderes</p>
          </div>
          <div className="stat-cell">
            <StatNum value={148} className="blue" />
            <p className="stat-label">Alumnos en aula</p>
          </div>
          <div className="stat-cell">
            <p className="stat-num wine">A<em>+</em></p>
            <p className="stat-label">Rendimiento académico</p>
          </div>
        </div>
      </section>

      {/* ── MARQUEE DE VALORES ── */}
      {marqueeItems.length > 0 && (
        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            {marqueeItems.map((v, i) => (
              <span key={i} className="marquee-item"><span className={`marquee-dot ${i % 3 === 2 ? 'wine' : i % 3 === 1 ? 'cyan' : ''}`} />{v}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── PILARES ── */}
      <section id="nosotros" className="pillars">
        <div className="container">
          <div className="section-head reveal">
            <div className="eyebrow"><span className="eyebrow-n">01</span>Quiénes somos</div>
            <h2 className="h-section">Identidad <em>institucional</em></h2>
            <p className="section-lead">
              Tres pilares que guían cada decisión académica y cada día en el aula.
            </p>
          </div>

          <div className="pillar-grid">
            <article className="pillar reveal" style={{ transitionDelay: '0ms' }}>
              <span className="pillar-num">01</span>
              <div className="pillar-icon"><IconTarget size={26} /></div>
              <p className="pillar-label">Misión</p>
              <h3 className="pillar-title">Lo que hacemos hoy</h3>
              <p className="pillar-body">{config.mision ?? DEFAULTS.mision}</p>
            </article>

            <article className="pillar reveal" style={{ transitionDelay: '90ms' }}>
              <span className="pillar-num">02</span>
              <div className="pillar-icon"><IconCompass size={26} /></div>
              <p className="pillar-label">Visión</p>
              <h3 className="pillar-title">Hacia dónde vamos</h3>
              <p className="pillar-body">{config.vision ?? DEFAULTS.vision}</p>
            </article>

            <article className="pillar reveal" style={{ transitionDelay: '180ms' }}>
              <span className="pillar-num">03</span>
              <div className="pillar-icon"><IconStar size={26} /></div>
              <p className="pillar-label">Valores</p>
              <h3 className="pillar-title">Lo que nos define</h3>
              {valoresList.length > 1 ? (
                <div className="pillar-values">
                  {valoresList.map((v, i) => <span key={i} className="pillar-chip">{v}</span>)}
                </div>
              ) : (
                <p className="pillar-body">{config.valores ?? DEFAULTS.valores}</p>
              )}
            </article>
          </div>
        </div>
      </section>

      {/* ── PRINCIPIOS ── */}
      <section className="principles">
        <div className="container">
          <div className="principles-grid">
            <div className="principle reveal gold" style={{ transitionDelay: '0ms' }}>
              <div className="principle-icon"><IconLaurel size={22} /></div>
              <div>
                <p className="principle-title">Excelencia Académica</p>
                <p className="principle-desc">Altos estándares que preparan a nuestros estudiantes para competir al más alto nivel nacional.</p>
              </div>
            </div>
            <div className="principle reveal" style={{ transitionDelay: '90ms' }}>
              <div className="principle-icon"><IconAcademic size={22} /></div>
              <div>
                <p className="principle-title">Formación Integral</p>
                <p className="principle-desc">Desarrollo cognitivo, social y de valores que acompañan al estudiante toda la vida.</p>
              </div>
            </div>
            <div className="principle reveal" style={{ transitionDelay: '180ms' }}>
              <div className="principle-icon"><IconSpark size={22} /></div>
              <div>
                <p className="principle-title">Visión de Futuro</p>
                <p className="principle-desc">Metodologías modernas para enfrentar los retos de un mundo en constante evolución.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── GALERÍA ── */}
      <section id="galeria" className="gallery">
        <div className="container">
          <div className="section-head reveal">
            <div className="eyebrow"><span className="eyebrow-n">02</span>Nuestras instalaciones</div>
            <h2 className="h-section">Galería</h2>
          </div>

          {galeria.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><IconPhoto size={26} /></div>
              <p className="empty-text">Las fotos del colegio aparecerán aquí</p>
            </div>
          ) : (
            <div className="gal">
              {galeria.map((img, i) => (
                <div key={img.id} className="gal-item" style={galSpan(i)} onClick={() => setLightbox(img.url)}>
                  <Image src={img.url} alt={img.descripcion ?? 'Foto del colegio'} fill className="object-cover" />
                  <div className="gal-ov">
                    <span className="ov-zoom"><IconZoom size={18} /></span>
                    {img.descripcion && <p>{img.descripcion}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── COMUNICADOS ── */}
      <section id="comunicados" className="news">
        <div className="container-narrow">
          <div className="section-head reveal">
            <div className="eyebrow cyan"><span className="eyebrow-n">03</span>Últimas noticias</div>
            <h2 className="h-section">Comunicados</h2>
          </div>

          {comunicados.length === 0 ? (
            <div className="empty">
              <div className="empty-icon cyan"><IconBell size={26} /></div>
              <p className="empty-text">No hay comunicados públicos aún</p>
            </div>
          ) : (
            <div className="com-list">
              {comunicados.map(c => (
                <article key={c.id} className={`com ${c.imagen_url ? '' : 'no-image'}`}>
                  {c.imagen_url && (
                    <div className="com-image" onClick={() => c.imagen_url && setLightbox(c.imagen_url)}>
                      <Image src={c.imagen_url} alt={c.titulo} fill className="object-cover" />
                    </div>
                  )}
                  <div className="com-body">
                    <p className="com-meta"><IconBell size={13} />{timeAgo(c.created_at)}</p>
                    <h3 className="com-title">{c.titulo}</h3>
                    {c.contenido && <p className="com-text">{c.contenido}</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── BANDA CTA ── */}
      <section className="cta-band">
        <div className="container">
          <div className="eyebrow cta-eyebrow reveal">Educación de excelencia</div>
          <h2 className="cta-title reveal">Forma parte de una comunidad que <em>transforma</em></h2>
          <p className="cta-lead reveal">
            Accede al sistema académico o consulta el progreso de tu hijo desde el portal de padres.
          </p>
          <div className="cta-actions reveal">
            <Link href="/login" className="btn btn-white">Ingresar al sistema <IconArrowR size={14} /></Link>
            <Link href="/padres" className="btn btn-ghost-light">Portal de padres</Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="contacto" className="footer">
        <div className="container">
          <div className="foot-grid">
            <div>
              <div className="foot-brand">
                <div className="foot-logo">
                  <Image src="/colegio.png" alt="Logo" fill className="object-contain" />
                </div>
                <div>
                  <p className="foot-label" style={{ marginBottom: 4 }}>Alta Competencia</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-.01em' }}>Eduardo de Habich</p>
                </div>
              </div>
              <p className="foot-text">
                Formando líderes con excelencia académica en Juliaca, Puno, Perú.
              </p>
            </div>

            <div>
              <p className="foot-label">Contacto</p>
              {(config.direccion ?? DEFAULTS.direccion) && (
                <div className="foot-row"><IconPin size={14} /><span>{config.direccion ?? DEFAULTS.direccion}</span></div>
              )}
              {config.telefono && (
                <div className="foot-row"><IconPhone size={14} /><span>{config.telefono}</span></div>
              )}
              {config.email_contacto && (
                <div className="foot-row"><IconMail size={14} /><span>{config.email_contacto}</span></div>
              )}
            </div>

            <div>
              <p className="foot-label">Redes sociales</p>
              <div style={{ display: 'flex', gap: 10 }}>
                {config.facebook_url && (
                  <a href={config.facebook_url} target="_blank" rel="noopener noreferrer" className="soc" aria-label="Facebook">
                    <IconFacebook size={16} />
                  </a>
                )}
                {config.instagram_url && (
                  <a href={config.instagram_url} target="_blank" rel="noopener noreferrer" className="soc" aria-label="Instagram">
                    <IconInstagram size={16} />
                  </a>
                )}
                {!config.facebook_url && !config.instagram_url && (
                  <p className="foot-text" style={{ fontSize: 12 }}>Próximamente</p>
                )}
              </div>
            </div>
          </div>

          <div className="foot-bottom">
            <p className="foot-bottom-text">
              © {new Date().getFullYear()} Colegio Eduardo de Habich · Todos los derechos reservados
            </p>
            <Link href="/login" className="foot-bottom-link">
              Acceso al sistema <IconArrowR size={12} />
            </Link>
          </div>
        </div>
      </footer>

      {/* ── LIGHTBOX ── */}
      {lightbox && (
        <div className="lb" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Imagen ampliada">
          <button className="lb-close" onClick={() => setLightbox(null)} aria-label="Cerrar">
            <IconClose size={18} />
          </button>
          <div onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="imagen ampliada" className="lb-img" />
          </div>
        </div>
      )}
    </div>
  )
}
