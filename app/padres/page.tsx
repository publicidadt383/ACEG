'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { formatFechaMedia as fmtFecha } from '@/utils/formatters'
import { resumenExamen, type ExamenLibreta } from '@/lib/libreta'

interface AlumnoInfo {
  id:        string
  nombre:    string
  apellidos: string | null
  grado:     string | null
  grupo:     string | null
  dni:       string | null
}
interface Asistencia    { fecha: string; presente: boolean; hora_entrada: string | null; hora_salida: string | null; observacion: string | null }
interface AsisInfo      { ciclo: string; ultimo_dia: string | null; sin_registros: boolean; total_dias: number }
interface Calificacion  { curso: string; nota: number | null; comentario: string | null; tarea_titulo: string; created_at: string }
interface TareaPendiente{ titulo: string; fecha_limite: string | null; curso: string }
interface LibretaNota   { titulo: string; nota: number; comentario: string | null }
interface LibretaPeriodo{ periodo: string; notas: LibretaNota[]; examenes?: ExamenLibreta[] }

function letraCalif(n: number) {
  if (n >= 18) return { letra: 'AD', color: '#15803d', bg: '#effaf3', border: '#bbe9cb' }
  if (n >= 14) return { letra: 'A',  color: '#1d4ed8', bg: '#eef1fe', border: '#cfd6fb' }
  if (n >= 11) return { letra: 'B',  color: '#b45309', bg: '#fdf4e7', border: '#f3dcb6' }
  return              { letra: 'C',  color: '#dc2626', bg: '#fdeeee', border: '#f6cccc' }
}

/* ── Iconos SVG ────────────────────────────────────────────── */
type IconProps = { size?: number; stroke?: number }
const SVG = (kids: React.ReactNode) =>
  function I({ size = 20, stroke = 1.6 }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        {kids}
      </svg>
    )
  }

const IconUser      = SVG(<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>)
const IconCalendar  = SVG(<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>)
const IconClipList  = SVG(<><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></>)
const IconAward     = SVG(<><circle cx="12" cy="9" r="6"/><path d="m9 15-2 7 5-3 5 3-2-7"/></>)
const IconArrowR    = SVG(<><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>)
const IconArrowL    = SVG(<><path d="M19 12H5"/><path d="m11 6-6 6 6 6"/></>)
const IconSearch    = SVG(<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>)
const IconAlert     = SVG(<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>)
const IconCheck     = SVG(<polyline points="20 6 9 17 4 12"/>)
const IconX         = SVG(<><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>)
const IconBang      = SVG(<><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="10"/></>)
const IconLogin     = SVG(<><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></>)
const IconClock     = SVG(<><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>)
const IconSpinner   = function I({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'pp-spin 1s linear infinite' }}>
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.3)" strokeWidth="3"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  )
}

const CSS = `
  /* ── Paleta sobria: azul/índigo institucional + vidrio + oro mate ── */
  .pp {
    --c-ink:    #1f2740;          /* texto principal */
    --c-soft:   #5a6379;          /* texto secundario */
    --c-faint:  #98a0b3;          /* texto terciario */
    --c-line:   #e8ebf3;
    --glass:    rgba(255,255,255,.78);
    --c-acc:    #1d4ed8;          /* azul real profundo */
    --c-acc-2:  #2563eb;          /* azul medio */
    --c-gold:   #9a7b34;          /* oro mate (etiquetas) */
    --c-gold-l: #d9bf7a;          /* oro suave (acentos sobre oscuro) */
    --c-green:  #15803d;
    --c-red:    #dc2626;
    --c-amber:  #b45309;
    --grad:     linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
    --grad-soft:linear-gradient(135deg, rgba(37,99,235,.13), rgba(37,99,235,.13));
    --el-1: 0 1px 2px rgba(20,28,55,.08);
    --el-2: 0 12px 32px -16px rgba(18,28,60,.45), 0 2px 8px rgba(18,28,60,.08);
    --el-3: 0 28px 60px -26px rgba(12,20,50,.55), 0 6px 16px rgba(12,20,50,.12);

    position: relative;
    min-height: 100dvh;
    font-family: var(--dm), system-ui, sans-serif;
    color: var(--c-ink);
    background:
      radial-gradient(72% 42% at 50% -6%, rgba(37,99,235,.08), transparent 62%),
      radial-gradient(38% 30% at 96% 2%, rgba(37,99,235,.06), transparent 60%),
      radial-gradient(45% 35% at 4% 34%, rgba(59,130,246,.05), transparent 60%),
      #ffffff;
    overflow-x: hidden;
    -webkit-tap-highlight-color: transparent;
  }
  .pp * { box-sizing: border-box; }
  .pp button, .pp a { touch-action: manipulation; }
  .pp ::selection { background: rgba(37,99,235,.25); }

  @keyframes pp-up   { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
  @keyframes pp-in   { from { opacity: 0 } to { opacity: 1 } }
  @keyframes pp-spin { to { transform: rotate(360deg) } }
  @keyframes pp-ring { from { stroke-dashoffset: 339 } }
  @media (prefers-reduced-motion: reduce) {
    .pp *, .pp *::before, .pp *::after { animation: none !important; transition: none !important; }
  }

  /* En móvil/táctil, el header sticky y las tarjetas con backdrop-filter
     recalculan el blur al scrollear → jank/parpadeo. Sobre el fondo casi
     blanco, un sólido se ve igual y va fluido. */
  @media (max-width: 768px), (hover: none) {
    .pp-head { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; background: rgba(255,255,255,.98) !important; }
    .pp-card { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; background: #ffffff !important; }
  }

  .pp-wrap { max-width: 760px; margin: 0 auto; padding: 0 20px; }

  /* ── Header (vidrio navy) ── */
  .pp-head { position: sticky; top: 0; z-index: 40;
    background: rgba(255,255,255,.82);
    -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4);
    border-bottom: 1px solid #eceff5; box-shadow: 0 6px 22px -16px rgba(20,28,60,.4); }
  .pp-head-in { height: 62px; display: flex; align-items: center; justify-content: space-between; }
  .pp-brand { display: flex; align-items: center; gap: 11px; text-decoration: none; }
  .pp-brand-medal { width: 44px; height: 44px; flex: none; display: grid; place-items: center; }
  .pp-brand-medal img { width: 100%; height: 100%; object-fit: contain; }
  .pp-brand-txt em { display: block; font-family: var(--dm); font-size: 8.5px; font-weight: 700; letter-spacing: .24em;
    color: var(--c-gold); text-transform: uppercase; font-style: normal; line-height: 1; }
  .pp-brand-txt b { display: block; font-family: var(--pf); font-size: 14px; font-weight: 700; color: var(--c-ink); line-height: 1.25; margin-top: 3px; }
  .pp-head-cta { display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border-radius: 999px; text-decoration: none;
    background: var(--grad-soft); border: 1px solid rgba(37,99,235,.22); color: var(--c-acc);
    font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; transition: all .2s; }
  .pp-head-cta:hover { background: var(--grad); border-color: transparent; color: #fff; box-shadow: 0 8px 18px -8px rgba(37,99,235,.5); }

  /* ── Hero ── */
  .pp-hero { text-align: center; margin: 60px 0 36px; animation: pp-up .6s ease both; }
  .pp-crest { width: 112px; height: 112px; margin: 0 auto 24px; position: relative;
    display: grid; place-items: center; }
  .pp-crest::after { content: ''; position: absolute; inset: 5px; border-radius: 50%; border: 1px dashed rgba(37,99,235,.28); }
  .pp-crest img { width: 74%; height: 74%; object-fit: contain; }
  .pp-eyebrow { display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; letter-spacing: .3em;
    text-transform: uppercase; color: var(--c-acc); margin-bottom: 16px; }
  .pp-hero h1 { font-family: var(--pf); font-size: clamp(31px, 6vw, 46px); font-weight: 800; color: var(--c-ink);
    line-height: 1.08; letter-spacing: -.015em; margin: 0 0 14px; }
  .pp-hero h1 em { font-style: italic; font-weight: 500;
    background: linear-gradient(90deg, #1e3a8a, #2563eb); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .pp-hero p { font-size: 15px; line-height: 1.65; color: var(--c-soft); max-width: 440px; margin: 0 auto; }
  @media (max-width: 480px) {
    .pp-wrap { padding: 0 16px; }
    .pp-hero { margin: 38px 0 26px; }
    .pp-crest { width: 96px; height: 96px; }
    .pp-hero p { font-size: 14.5px; }
  }

  /* ── Card base (vidrio esmerilado) ── */
  .pp-card { background: var(--glass); -webkit-backdrop-filter: blur(22px) saturate(1.4); backdrop-filter: blur(22px) saturate(1.4);
    border: 1px solid var(--c-line); border-radius: 20px; box-shadow: var(--el-2);
    overflow: hidden; animation: pp-up .5s ease both; }
  .pp-card + .pp-card { margin-top: 18px; }
  .pp-card-pad { padding: 24px 26px; }
  @media (max-width: 480px) { .pp-card-pad { padding: 20px 18px; } }
  .pp-card-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
  .pp-card-h-l { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .pp-card-ic { width: 40px; height: 40px; border-radius: 12px; flex: none; display: grid; place-items: center;
    background: var(--grad); color: #fff; box-shadow: 0 8px 18px -8px rgba(37,99,235,.55); }
  .pp-card-t { font-family: var(--pf); font-size: 18px; font-weight: 700; color: var(--c-ink); margin: 0; }
  .pp-tag { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; padding: 5px 11px; border-radius: 999px; flex: none;
    background: var(--grad-soft); color: var(--c-acc); border: 1px solid rgba(37,99,235,.22); }
  .pp-tag-red { background: linear-gradient(135deg, #ef6a3a, #e0581f); color: #fff; border-color: transparent; }

  /* ── Search ── */
  .pp-search { animation: pp-up .6s ease .1s both; margin-bottom: 26px; }
  .pp-back { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer;
    color: var(--c-acc); font-family: var(--dm); font-size: 12px; font-weight: 700; padding: 0; margin-bottom: 18px; transition: gap .2s, color .2s; }
  .pp-back:hover { gap: 9px; color: var(--c-acc-2); }
  .pp-lbl { font-size: 10px; font-weight: 700; letter-spacing: .24em; text-transform: uppercase; color: var(--c-acc); margin: 0 0 11px; }
  .pp-row { display: flex; gap: 10px; }
  @media (max-width: 480px) { .pp-row { flex-direction: column; } }
  .pp-field { flex: 1; position: relative; display: flex; align-items: center; }
  .pp-field > svg { position: absolute; left: 16px; color: var(--c-faint); pointer-events: none; transition: color .2s; }
  .pp-field:focus-within > svg { color: var(--c-acc); }
  .pp-input { width: 100%; height: 54px; padding: 0 16px 0 46px; border-radius: 14px; font-family: var(--ui-font-mono), monospace;
    font-size: 18px; font-weight: 600; letter-spacing: .12em; color: var(--c-ink); background: rgba(255,255,255,.6);
    border: 1.5px solid rgba(37,99,235,.16); outline: none; transition: border-color .2s, box-shadow .2s, background .2s; }
  .pp-input::placeholder { color: var(--c-faint); font-weight: 500; letter-spacing: .06em; }
  .pp-input:focus { border-color: var(--c-acc); background: rgba(255,255,255,.92); box-shadow: 0 0 0 4px rgba(37,99,235,.13); }
  .pp-btn { height: 54px; padding: 0 26px; min-width: 138px; border: none; cursor: pointer; border-radius: 14px;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px; color: #fff; font-family: var(--dm);
    font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
    background: var(--grad); background-size: 150% 150%; box-shadow: 0 12px 26px -10px rgba(37,99,235,.55); transition: transform .2s, box-shadow .2s, opacity .2s, background-position .4s; }
  .pp-btn:hover:not(:disabled) { transform: translateY(-2px); background-position: 100% 0; box-shadow: 0 16px 30px -10px rgba(37,99,235,.6); }
  .pp-btn:disabled { opacity: .45; cursor: not-allowed; }
  .pp-btn:focus-visible { outline: 2px solid var(--c-gold-l); outline-offset: 3px; }
  .pp-err { margin-top: 15px; display: flex; align-items: flex-start; gap: 10px; padding: 13px 15px; border-radius: 12px;
    background: rgba(220,38,38,.08); border: 1px solid rgba(220,38,38,.22); }
  .pp-err svg { color: var(--c-red); flex: none; margin-top: 1px; }
  .pp-err p { font-size: 13px; line-height: 1.5; color: #a11d1d; font-weight: 500; margin: 0; }

  /* ── Resultados ── */
  .pp-results { display: flex; flex-direction: column; gap: 18px; padding-bottom: 24px; }

  /* Carnet del alumno */
  .pp-id { border-radius: 20px; overflow: hidden; position: relative; animation: pp-up .5s ease both;
    background: linear-gradient(135deg, #11205a 0%, #1a3aa6 55%, #1d4ed8 100%);
    box-shadow: var(--el-3); border: 1px solid rgba(255,255,255,.16); }
  .pp-id::before { content: ''; position: absolute; inset: 0; opacity: .6; pointer-events: none;
    background: radial-gradient(50% 70% at 86% 8%, rgba(217,191,122,.28), transparent 60%),
                radial-gradient(rgba(255,255,255,.14) 1px, transparent 1.4px); background-size: auto, 22px 22px; }
  .pp-id-body { display: flex; align-items: center; gap: 18px; padding: 22px 26px; position: relative; }
  @media (max-width: 480px) { .pp-id-body { padding: 20px 18px; gap: 14px; } }
  .pp-id-ava { width: 60px; height: 60px; border-radius: 16px; flex: none; display: grid; place-items: center;
    background: rgba(255,255,255,.1); border: 1px solid rgba(217,191,122,.45); color: #fff; }
  .pp-id-meta { font-size: 9px; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; color: var(--c-gold-l); margin: 0 0 5px; }
  .pp-id-name { font-family: var(--pf); font-size: clamp(19px, 4.4vw, 25px); font-weight: 800; color: #fff; line-height: 1.12; margin: 0 0 9px; }
  .pp-id-tags { display: flex; flex-wrap: wrap; gap: 7px; }
  .pp-id-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 999px;
    background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); font-size: 11.5px; font-weight: 600; color: #eaf0ff; }
  .pp-id-tag.mono { font-family: var(--ui-font-mono), monospace; letter-spacing: .04em; }

  /* Asistencia: ring + stats */
  .pp-att { display: flex; align-items: center; gap: 22px; margin-bottom: 18px; }
  @media (max-width: 480px) { .pp-att { flex-direction: column; gap: 16px; } }
  .pp-ring { position: relative; width: 124px; height: 124px; flex: none; }
  .pp-ring svg { transform: rotate(-90deg); }
  .pp-ring-c { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
  .pp-ring-pct { font-family: var(--ui-font-mono), monospace; font-size: 27px; font-weight: 700; line-height: 1; letter-spacing: -.02em; }
  .pp-ring-lab { display: block; font-size: 9px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--c-soft); margin-top: 5px; }
  .pp-att-side { flex: 1; min-width: 0; width: 100%; display: flex; flex-direction: column; gap: 9px; }
  .pp-pill { display: flex; align-items: center; gap: 11px; padding: 12px 15px; border-radius: 14px; border: 1px solid; }
  .pp-pill-ic { width: 30px; height: 30px; border-radius: 9px; flex: none; display: grid; place-items: center; }
  .pp-pill-n { font-family: var(--ui-font-mono), monospace; font-size: 20px; font-weight: 700; line-height: 1; }
  .pp-pill-l { font-size: 11px; font-weight: 700; color: var(--c-soft); letter-spacing: .03em; }
  .pp-att-cap { font-size: 11.5px; color: var(--c-soft); text-align: center; margin: -2px 0 16px; }

  /* Lista de asistencia */
  .pp-days { display: flex; flex-direction: column; gap: 7px; max-height: 430px; overflow-y: auto; padding-right: 3px; }
  .pp-days::-webkit-scrollbar { width: 5px; }
  .pp-days::-webkit-scrollbar-thumb { background: rgba(37,99,235,.2); border-radius: 999px; }
  .pp-day { display: flex; align-items: center; gap: 13px; padding: 10px 14px; border-radius: 13px; border: 1px solid; border-left-width: 4px; transition: transform .18s ease, box-shadow .18s ease; }
  .pp-day:hover { transform: translateX(3px); box-shadow: var(--el-1); }
  .pp-day-box { width: 44px; height: 44px; border-radius: 11px; flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; }
  .pp-day-dow { font-size: 9px; font-weight: 700; letter-spacing: .03em; opacity: .85; }
  .pp-day-num { font-family: var(--ui-font-mono), monospace; font-size: 17px; font-weight: 700; line-height: 1.05; }
  .pp-day-mk { position: absolute; top: -5px; right: -5px; width: 17px; height: 17px; border-radius: 50%; background: #fff; display: grid; place-items: center; box-shadow: 0 1px 4px rgba(0,0,0,.18); }
  .pp-day-info { flex: 1; min-width: 0; }
  .pp-day-date { font-size: 12.5px; font-weight: 700; color: var(--c-ink); margin: 0; }
  .pp-day-hrs { display: flex; gap: 13px; margin-top: 3px; flex-wrap: wrap; }
  .pp-day-hr { font-family: var(--ui-font-mono), monospace; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
  .pp-day-no { font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: var(--c-red); margin: 3px 0 0; }
  .pp-day-obs { display: flex; align-items: flex-start; gap: 5px; font-size: 11.5px; font-weight: 600; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 5px 8px; margin: 5px 0 0; line-height: 1.35; }
  .pp-day-obs svg { flex-shrink: 0; margin-top: 1px; }
  .pp-day-badge { font-size: 9.5px; font-weight: 800; padding: 5px 10px; border-radius: 999px; letter-spacing: .06em; text-transform: uppercase; flex: none; display: inline-flex; align-items: center; gap: 5px; }

  .pp-day.ok    { background: rgba(21,128,61,.07); border-color: rgba(21,128,61,.2); border-left-color: var(--c-green); }
  .pp-day.ok    .pp-day-box { background: #dcf0e2; color: var(--c-green); } .pp-day.ok .pp-day-mk, .pp-day.ok .pp-day-hr { color: var(--c-green); } .pp-day.ok .pp-day-badge { background: var(--c-green); color: #fff; }
  .pp-day.part  { background: rgba(180,83,9,.07); border-color: rgba(180,83,9,.2); border-left-color: var(--c-amber); }
  .pp-day.part  .pp-day-box { background: #f4e6cd; color: var(--c-amber); } .pp-day.part .pp-day-mk { color: var(--c-amber); } .pp-day.part .pp-day-badge { background: var(--c-amber); color: #fff; } .pp-day.part .pp-day-hr.in { color: var(--c-green); } .pp-day.part .pp-day-hr.out { color: var(--c-amber); font-style: italic; }
  .pp-day.no    { background: rgba(220,38,38,.06); border-color: rgba(220,38,38,.18); border-left-color: var(--c-red); }
  .pp-day.no    .pp-day-box { background: #f7dcdc; color: var(--c-red); } .pp-day.no .pp-day-num { text-decoration: line-through; opacity: .7; } .pp-day.no .pp-day-mk { color: var(--c-red); } .pp-day.no .pp-day-badge { background: var(--c-red); color: #fff; }

  /* Estados vacíos */
  .pp-empty { text-align: center; padding: 30px 16px; }
  .pp-empty-ic { width: 54px; height: 54px; border-radius: 16px; display: grid; place-items: center; margin: 0 auto 13px; }
  .pp-empty-t { font-size: 14px; font-weight: 700; margin: 0; }
  .pp-empty-s { font-size: 12.5px; color: var(--c-soft); font-weight: 500; margin: 5px 0 0; line-height: 1.5; }

  /* Tareas */
  .pp-list { display: flex; flex-direction: column; gap: 9px; }
  .pp-task { display: flex; align-items: center; gap: 13px; padding: 13px 16px; border-radius: 14px; background: rgba(255,255,255,.5); border: 1px solid rgba(37,99,235,.1); transition: border-color .2s, background .2s, transform .2s; }
  .pp-task:hover { background: rgba(255,255,255,.9); border-color: var(--c-acc); transform: translateX(2px); }
  .pp-task.late { background: rgba(220,38,38,.06); border-color: rgba(220,38,38,.2); }
  .pp-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: linear-gradient(135deg, #1e40af, #2563eb); box-shadow: 0 0 0 3px rgba(29,78,216,.18); }
  .pp-task.late .pp-dot { background: var(--c-red); box-shadow: 0 0 0 3px rgba(220,38,38,.16); }
  .pp-task-b { flex: 1; min-width: 0; }
  .pp-task-t { font-size: 13.5px; font-weight: 700; color: var(--c-ink); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pp-task-c { font-size: 11.5px; color: var(--c-soft); margin: 3px 0 0; }
  .pp-task-due { font-size: 11px; font-weight: 700; flex: none; color: var(--c-soft); }
  .pp-task.late .pp-task-due { color: var(--c-red); text-transform: uppercase; letter-spacing: .06em; }

  /* Calificaciones */
  .pp-grade { display: flex; align-items: center; gap: 15px; padding: 13px 16px; border-radius: 14px; background: rgba(255,255,255,.5); border: 1px solid rgba(37,99,235,.1); transition: border-color .2s, background .2s, transform .2s; }
  .pp-grade:hover { background: rgba(255,255,255,.9); border-color: var(--c-acc); transform: translateX(2px); }
  .pp-grade-l { width: 48px; height: 48px; border-radius: 13px; flex: none; display: grid; place-items: center; font-family: var(--pf); font-size: 16px; font-weight: 800; border: 1px solid; }
  .pp-grade-b { flex: 1; min-width: 0; }
  .pp-grade-t { font-size: 13.5px; font-weight: 700; color: var(--c-ink); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pp-grade-m { font-size: 11.5px; color: var(--c-soft); margin: 3px 0 0; }
  .pp-grade-cm { font-size: 12px; color: var(--c-soft); font-style: italic; margin: 4px 0 0; }
  .pp-grade-n { font-family: var(--ui-font-mono), monospace; font-size: 22px; font-weight: 700; flex: none; letter-spacing: -.02em; }

  /* Libreta de notas (oficial, publicada por la escuela) */
  .pp-lib + .pp-lib { margin-top: 24px; }
  .pp-lib-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 11px; }
  .pp-lib-t { font-family: var(--pf); font-size: 15px; font-weight: 700; color: var(--c-ink); margin: 0; }
  .pp-lib-avg { font-size: 11px; font-weight: 700; padding: 4px 11px; border-radius: 999px; border: 1px solid; flex: none; }

  /* Exámenes por preguntas (1 punto por correcta) */
  .pp-exam { border: 1px solid rgba(37,99,235,.14); border-radius: 14px; padding: 14px 16px; background: rgba(255,255,255,.55); }
  .pp-exam + .pp-exam { margin-top: 10px; }
  .pp-exam-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .pp-exam-t { font-size: 13.5px; font-weight: 700; color: var(--c-ink); margin: 0; }
  .pp-exam-final { font-family: var(--ui-font-mono), monospace; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 999px; border: 1px solid; flex: none; }
  .pp-exam-areas { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
  .pp-exam-area { font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: rgba(37,99,235,.08); border: 1px solid rgba(37,99,235,.16); color: var(--c-ink); }
  .pp-exam-btn { margin-top: 11px; display: inline-flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; color: var(--c-acc); font-family: var(--dm); font-size: 12px; font-weight: 700; padding: 0; }
  .pp-exam-btn:hover { color: var(--c-acc-2); }
  .pp-exam-det { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
  .pp-exam-det-t { font-size: 10px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--c-soft); margin: 0 0 6px; }
  .pp-qs { display: flex; flex-wrap: wrap; gap: 6px; }
  .pp-q { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 800; border: 1px solid; }
  .pp-q.ok { background: #effaf3; color: #15803d; border-color: #bbe9cb; }
  .pp-q.bad { background: #fdeeee; color: #dc2626; border-color: #f6cccc; }

  /* Footer */
  .pp-foot { text-align: center; padding: 8px 0 36px; font-size: 11.5px; letter-spacing: .04em; color: var(--c-faint); animation: pp-in .8s ease both; }
`

export default function PadresPage() {
  const [dni,        setDni]        = useState('')
  const [buscando,   setBuscando]   = useState(false)
  const [error,      setError]      = useState('')
  const [alumno,     setAlumno]     = useState<AlumnoInfo | null>(null)
  const [asistencia, setAsistencia] = useState<Asistencia[]>([])
  const [asisInfo,   setAsisInfo]   = useState<AsisInfo | null>(null)
  const [califs,     setCalifs]     = useState<Calificacion[]>([])
  const [pendientes, setPendientes] = useState<TareaPendiente[]>([])
  const [libreta,    setLibreta]    = useState<LibretaPeriodo[]>([])
  const [detalleEx,  setDetalleEx]  = useState<string | null>(null)   // "periodo-examen" abierto

  async function buscar() {
    const d = dni.trim()
    if (!d) return
    setBuscando(true); setError(''); setAlumno(null)

    const { data, error: rpcErr } = await supabase
      .rpc('portal_datos_alumno', { p_dni: d })

    if (rpcErr || !data || data.error === 'not_found') {
      setError('No se encontró ningún estudiante con ese DNI. Verifica el número e intenta de nuevo.')
      setBuscando(false); return
    }

    setAlumno(data.alumno)
    setAsistencia(data.asistencia ?? [])
    setAsisInfo(data.asistencia_info ?? null)
    setCalifs(data.calificaciones ?? [])
    setPendientes(data.pendientes ?? [])
    setLibreta(data.libreta ?? [])
    setBuscando(false)
  }

  function limpiar() {
    setAlumno(null); setDni(''); setAsistencia([]); setAsisInfo(null); setCalifs([]); setPendientes([]); setLibreta([]); setDetalleEx(null)
  }

  const displayNombre = alumno ? `${alumno.apellidos ?? ''} ${alumno.nombre}`.trim() : ''
  const totalAsist    = asistencia.length
  const presentes     = asistencia.filter(a => a.presente).length
  const faltas        = totalAsist - presentes
  const porcentaje    = totalAsist ? Math.round((presentes / totalAsist) * 100) : null

  const pctColor = porcentaje === null ? '#1d4ed8'
    : porcentaje >= 75 ? '#15803d'
    : porcentaje >= 60 ? '#b45309'
    : '#dc2626'

  const R = 54
  const C = 2 * Math.PI * R
  const dashOffset = C * (1 - (porcentaje ?? 0) / 100)

  return (
    <div className="pp">
      <style>{CSS}</style>

      {/* ── HEADER ── */}
      <header className="pp-head">
        <div className="pp-wrap pp-head-in">
          <Link href="/" className="pp-brand">
            <div className="pp-brand-medal">
              <Image src="/aceg-isotipo.png" alt="Logo de ACEG" width={44} height={44} />
            </div>
            <div className="pp-brand-txt">
              <em>Escuela Gastronómica</em>
              <b>ACEG</b>
            </div>
          </Link>
          <Link href="/login" className="pp-head-cta">
            <IconLogin size={12} /> Sistema
          </Link>
        </div>
      </header>

      <div className="pp-wrap">

        {/* ── HERO ── */}
        {!alumno && (
          <div className="pp-hero">
            <div className="pp-crest">
              <Image src="/aceg-isotipo.png" alt="Logo de la Escuela Gastronómica ACEG" width={96} height={96} />
            </div>
            <div className="pp-eyebrow">Portal del padre de familia</div>
            <h1>Consulta tu <em>progreso</em><br />en la escuela</h1>
            <p>Revisa tu asistencia, tus tareas pendientes y tus calificaciones recientes ingresando tu DNI.</p>
          </div>
        )}

        {/* ── BÚSQUEDA ── */}
        <div className="pp-search pp-card">
          <div className="pp-card-pad">
            {alumno && (
              <button onClick={limpiar} className="pp-back">
                <IconArrowL size={14} /> Buscar otro estudiante
              </button>
            )}
            <p className="pp-lbl">DNI del estudiante</p>
            <div className="pp-row">
              <div className="pp-field">
                <IconSearch size={18} />
                <input
                  type="text" inputMode="numeric" maxLength={8} placeholder="75123456"
                  value={dni}
                  onChange={e => setDni(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && buscar()}
                  className="pp-input"
                  aria-label="DNI del estudiante"
                />
              </div>
              <button onClick={buscar} disabled={buscando || !dni.trim()} className="pp-btn">
                {buscando ? <IconSpinner size={18} /> : <>Consultar <IconArrowR size={14} /></>}
              </button>
            </div>
            {error && (
              <div className="pp-err" role="alert">
                <IconAlert size={16} />
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── RESULTADOS ── */}
        {alumno && (
          <div className="pp-results">

            {/* Carnet del alumno */}
            <div className="pp-id">
              <div className="pp-id-body">
                <div className="pp-id-ava"><IconUser size={30} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="pp-id-meta">Estudiante encontrado</p>
                  <h2 className="pp-id-name">{displayNombre}</h2>
                  <div className="pp-id-tags">
                    {alumno.grado && alumno.grupo && (
                      <span className="pp-id-tag">{alumno.grado} · Sección {alumno.grupo}</span>
                    )}
                    {alumno.dni && <span className="pp-id-tag mono">DNI {alumno.dni}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Asistencia */}
            <div className="pp-card">
              <div className="pp-card-pad">
                <div className="pp-card-h">
                  <div className="pp-card-h-l">
                    <div className="pp-card-ic"><IconCalendar size={18} /></div>
                    <h3 className="pp-card-t">Asistencia</h3>
                  </div>
                  <span className="pp-tag">{asisInfo ? `Ciclo ${asisInfo.ciclo}` : 'Lun – Vie'}</span>
                </div>

                {totalAsist === 0 ? (
                  <div className="pp-empty">
                    <div className="pp-empty-ic" style={{ background: 'rgba(37,99,235,.1)', color: '#1d4ed8', border: '1px solid rgba(37,99,235,.2)' }}>
                      <IconCalendar size={24} />
                    </div>
                    {asisInfo?.sin_registros ? (
                      <>
                        <p className="pp-empty-t" style={{ color: '#1d4ed8' }}>Aún sin registros en el ciclo {asisInfo.ciclo}</p>
                        <p className="pp-empty-s">La escuela todavía no ha tomado asistencia este ciclo. Vuelve a consultar más adelante.</p>
                      </>
                    ) : (
                      <p className="pp-empty-t" style={{ color: 'var(--c-soft)' }}>Sin registros de asistencia</p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="pp-att">
                      <div className="pp-ring">
                        <svg width="124" height="124" viewBox="0 0 124 124">
                          <circle cx="62" cy="62" r={R} fill="none" stroke="rgba(37,99,235,.14)" strokeWidth="10" />
                          <circle cx="62" cy="62" r={R} fill="none" stroke={pctColor} strokeWidth="10" strokeLinecap="round"
                            strokeDasharray={C} strokeDashoffset={dashOffset} style={{ animation: 'pp-ring .9s ease both' }} />
                        </svg>
                        <div className="pp-ring-c">
                          <span className="pp-ring-pct" style={{ color: pctColor }}>{porcentaje}%</span>
                          <span className="pp-ring-lab">Asistencia</span>
                        </div>
                      </div>
                      <div className="pp-att-side">
                        <div className="pp-pill" style={{ background: 'rgba(21,128,61,.08)', borderColor: 'rgba(21,128,61,.2)' }}>
                          <span className="pp-pill-ic" style={{ background: '#dcf0e2', color: '#15803d' }}><IconCheck size={16} stroke={2.5} /></span>
                          <div><span className="pp-pill-n" style={{ color: '#15803d' }}>{presentes}</span></div>
                          <span className="pp-pill-l">días asistidos</span>
                        </div>
                        <div className="pp-pill" style={{ background: faltas > 0 ? 'rgba(220,38,38,.07)' : 'rgba(255,255,255,.5)', borderColor: faltas > 0 ? 'rgba(220,38,38,.2)' : 'rgba(37,99,235,.1)' }}>
                          <span className="pp-pill-ic" style={{ background: faltas > 0 ? '#f7dcdc' : '#e8eaf2', color: faltas > 0 ? '#dc2626' : '#5a6379' }}><IconX size={16} stroke={2.5} /></span>
                          <div><span className="pp-pill-n" style={{ color: faltas > 0 ? '#dc2626' : '#5a6379' }}>{faltas}</span></div>
                          <span className="pp-pill-l">faltas</span>
                        </div>
                      </div>
                    </div>

                    <p className="pp-att-cap">
                      {presentes} de {totalAsist} días de clase
                      {asisInfo?.ultimo_dia && <> · Última actualización: {fmtFecha(asisInfo.ultimo_dia)}</>}
                    </p>

                    <div className="pp-days">
                      {asistencia.map((a, i) => {
                        const d = new Date(a.fecha + 'T12:00:00')
                        const dias  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
                        const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
                        const dNom = dias[d.getDay()], dNum = d.getDate(), mNom = meses[d.getMonth()], anio = d.getFullYear()
                        const v = !a.presente ? 'no' : a.hora_salida ? 'ok' : 'part'
                        return (
                          <div key={i} className={`pp-day ${v}`}>
                            <div className="pp-day-box">
                              <span className="pp-day-dow">{dNom.toUpperCase()}</span>
                              <span className="pp-day-num">{dNum}</span>
                              <span className="pp-day-mk" aria-hidden="true">
                                {v === 'ok' ? <IconCheck size={11} stroke={3} /> : v === 'part' ? <IconBang size={11} stroke={2.4} /> : <IconX size={11} stroke={3} />}
                              </span>
                            </div>
                            <div className="pp-day-info">
                              <p className="pp-day-date">{dNom}, {dNum} {mNom} {anio}</p>
                              {a.presente ? (
                                <div className="pp-day-hrs">
                                  <span className="pp-day-hr in"><IconClock size={11} stroke={2.2} /> {a.hora_entrada ?? '—'}</span>
                                  <span className="pp-day-hr out"><IconArrowR size={11} stroke={2.2} /> {a.hora_salida ?? 'Sin salida'}</span>
                                </div>
                              ) : <p className="pp-day-no">No asistió a clases</p>}
                              {a.observacion && (
                                <p className="pp-day-obs">
                                  <IconBang size={10} stroke={2.4} /> {a.observacion}
                                </p>
                              )}
                            </div>
                            <span className="pp-day-badge">
                              {v === 'ok' ? <><IconCheck size={11} stroke={3} /> Completo</> : v === 'part' ? <><IconBang size={11} stroke={2.4} /> Solo entrada</> : <><IconX size={11} stroke={3} /> Falta</>}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Tareas pendientes */}
            <div className="pp-card">
              <div className="pp-card-pad">
                <div className="pp-card-h">
                  <div className="pp-card-h-l">
                    <div className="pp-card-ic"><IconClipList size={18} /></div>
                    <h3 className="pp-card-t">Tareas pendientes</h3>
                  </div>
                  {pendientes.length > 0 && <span className="pp-tag pp-tag-red">{pendientes.length}</span>}
                </div>

                {pendientes.length === 0 ? (
                  <div className="pp-empty">
                    <div className="pp-empty-ic" style={{ background: 'rgba(21,128,61,.1)', color: '#15803d', border: '1px solid rgba(21,128,61,.2)' }}>
                      <IconCheck size={26} stroke={2.4} />
                    </div>
                    <p className="pp-empty-t" style={{ color: '#15803d' }}>¡Sin tareas pendientes!</p>
                    <p className="pp-empty-s">El estudiante está al día con sus entregas.</p>
                  </div>
                ) : (
                  <div className="pp-list">
                    {pendientes.map((t, i) => {
                      const late = t.fecha_limite ? new Date(t.fecha_limite) < new Date() : false
                      return (
                        <div key={i} className={`pp-task ${late ? 'late' : ''}`}>
                          <span className="pp-dot" />
                          <div className="pp-task-b">
                            <p className="pp-task-t">{t.titulo}</p>
                            <p className="pp-task-c">{t.curso}</p>
                          </div>
                          {t.fecha_limite && <span className="pp-task-due">{late ? 'Vencida' : fmtFecha(t.fecha_limite)}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Libreta de notas (publicada por la escuela) */}
            {libreta.length > 0 && (
              <div className="pp-card">
                <div className="pp-card-pad">
                  <div className="pp-card-h">
                    <div className="pp-card-h-l">
                      <div className="pp-card-ic"><IconAward size={18} /></div>
                      <h3 className="pp-card-t">Libreta de notas</h3>
                    </div>
                    <span className="pp-tag">Oficial de la escuela</span>
                  </div>

                  {libreta.map((per, i) => {
                    // Total del periodo: SUMA de puntos (notas directas + exámenes), no promedio
                    const sumaNotas = per.notas.reduce((s, n) => s + (n.nota ?? 0), 0)
                    const sumaExams = (per.examenes ?? []).reduce((s, ex) => s + resumenExamen(ex.preguntas, ex.respuestas).puntos, 0)
                    const total = Math.round((sumaNotas + sumaExams) * 10) / 10
                    const hayDatos = per.notas.length > 0 || (per.examenes ?? []).length > 0
                    return (
                      <div key={i} className="pp-lib">
                        <div className="pp-lib-h">
                          <p className="pp-lib-t">{per.periodo}</p>
                          {hayDatos && (
                            <span className="pp-lib-avg" style={{ background: '#eef1fe', color: '#1d4ed8', borderColor: '#cfd6fb' }}>
                              Total: {total} {total === 1 ? 'punto' : 'puntos'}
                            </span>
                          )}
                        </div>
                        {per.notas.length > 0 && (
                          <div className="pp-list">
                            {per.notas.map((n, j) => (
                              <div key={j} className="pp-grade">
                                <div className="pp-grade-b">
                                  <p className="pp-grade-t">{n.titulo}</p>
                                  {n.comentario && <p className="pp-grade-cm">&ldquo;{n.comentario}&rdquo;</p>}
                                </div>
                                <span className="pp-grade-n" style={{ color: 'var(--c-ink)' }}>
                                  {n.nota} {n.nota === 1 ? 'punto' : 'puntos'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Exámenes por preguntas: puntos por área + nota final + detalle */}
                        {(per.examenes ?? []).map((ex, j) => {
                          const r = resumenExamen(ex.preguntas, ex.respuestas)
                          const aprueba = r.puntos >= r.total * 0.5
                          const key = `${i}-${j}`
                          const abierto = detalleEx === key
                          return (
                            <div key={key} className="pp-exam" style={{ marginTop: per.notas.length ? 12 : 0 }}>
                              <div className="pp-exam-h">
                                <p className="pp-exam-t">{ex.titulo}</p>
                                <span className="pp-exam-final"
                                  style={aprueba
                                    ? { background: '#effaf3', color: '#15803d', borderColor: '#bbe9cb' }
                                    : { background: '#fdeeee', color: '#dc2626', borderColor: '#f6cccc' }}>
                                  Nota final: {r.puntos} / {r.total}
                                </span>
                              </div>
                              <div className="pp-exam-areas">
                                {r.areas.map(a => (
                                  <span key={a.area} className="pp-exam-area">
                                    {a.area}: {a.puntos} {a.puntos === 1 ? 'punto' : 'puntos'} de {a.total}
                                  </span>
                                ))}
                              </div>
                              <button className="pp-exam-btn" onClick={() => setDetalleEx(abierto ? null : key)}>
                                {abierto ? 'Ocultar detalle' : 'Ver detalle'}
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
                                  style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                                  <polyline points="6 9 12 15 18 9"/>
                                </svg>
                              </button>
                              {abierto && (
                                <div className="pp-exam-det">
                                  {r.areas.map(a => (
                                    <div key={a.area}>
                                      <p className="pp-exam-det-t">{a.area} · {a.puntos}/{a.total}</p>
                                      <div className="pp-qs">
                                        {r.detalle.filter(d => d.area === a.area).map(d => (
                                          <span key={d.n} className={`pp-q ${d.ok ? 'ok' : 'bad'}`}
                                            title={`Pregunta ${d.n}: ${d.ok ? 'correcta' : 'incorrecta'}`}>
                                            P{d.n} {d.ok ? '✓' : '✗'}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Calificaciones */}
            <div className="pp-card">
              <div className="pp-card-pad">
                <div className="pp-card-h">
                  <div className="pp-card-h-l">
                    <div className="pp-card-ic"><IconAward size={18} /></div>
                    <h3 className="pp-card-t">Calificaciones recientes</h3>
                  </div>
                </div>

                {califs.length === 0 ? (
                  <div className="pp-empty">
                    <div className="pp-empty-ic" style={{ background: 'rgba(37,99,235,.1)', color: '#1d4ed8', border: '1px solid rgba(37,99,235,.2)' }}>
                      <IconAward size={24} />
                    </div>
                    <p className="pp-empty-t" style={{ color: 'var(--c-soft)' }}>Sin calificaciones registradas</p>
                    <p className="pp-empty-s">Aquí aparecerán las notas a medida que se publiquen.</p>
                  </div>
                ) : (
                  <div className="pp-list">
                    {califs.map((c, i) => {
                      const lc = c.nota !== null ? letraCalif(c.nota) : null
                      return (
                        <div key={i} className="pp-grade">
                          {lc && <div className="pp-grade-l" style={{ background: lc.bg, color: lc.color, borderColor: lc.border }}>{lc.letra}</div>}
                          <div className="pp-grade-b">
                            <p className="pp-grade-t">{c.tarea_titulo}</p>
                            <p className="pp-grade-m">{c.curso} · {fmtFecha(c.created_at)}</p>
                            {c.comentario && <p className="pp-grade-cm">&ldquo;{c.comentario}&rdquo;</p>}
                          </div>
                          {c.nota !== null && lc && <span className="pp-grade-n" style={{ color: lc.color }}>{c.nota}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        <p className="pp-foot">Escuela Gastronómica ACEG · Arte Culinario, Emprendimiento y Gestión</p>
      </div>
    </div>
  )
}
