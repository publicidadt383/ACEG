'use client'

import { useEffect, useState } from 'react'
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
  mision:         'Brindar formación técnica en gastronomía de alta calidad, con un enfoque basado en valores, responsabilidad social e innovación. Desarrollamos competencias en preparación, control, administración y gestión gastronómica, asegurando la empleabilidad de nuestros egresados.',
  vision:         'Ser la institución líder en educación gastronómica en la región Puno, reconocida por su calidad académica, infraestructura adecuada y equipamiento funcional para la formación práctica, comprometida con el desarrollo económico, turístico y social.',
  valores:        'Respeto y empatía · Vocación de servicio · Adaptabilidad · Responsabilidad y puntualidad · Compromiso · Ética profesional · Innovación · Calidad · Responsabilidad social · Trabajo en equipo · Identidad cultural · Sostenibilidad · Liderazgo y autonomía · Disciplina y perseverancia',
  direccion:      'Jr. Sandia 843, Juliaca, Puno, Perú',
  telefono:       '+51 963 741 700',
  email_contacto: null,
  facebook_url:   'https://www.facebook.com/AcegArteCulinarioEmprendimientoYGestion',
  instagram_url:  'https://www.instagram.com/aceg_edu/',
  fondo_url:      null,
}

// Datos institucionales fijos (no están en landing_config)
const ANIO_FUNDACION = 2020
const TELEFONO_FIJO  = '051 622110'
const SITIO_WEB      = 'www.aceg.edu.pe'
const REDES_EXTRA = {
  tiktok:   'https://www.tiktok.com/@aceg.edu',
  youtube:  'https://www.youtube.com/@aceg',
  whatsapp: 'https://wa.link/p2gds6',
}

// Fotos de cocina (Unsplash License) guardadas en /public/landing
const FOTOS = {
  hero:      '/landing/alumnos-clase.jpg',
  cocina:    '/landing/brigada-emplatado.jpg',
  panaderia: '/landing/masa-pan.jpg',
  metodo:    '/landing/emplatado-salsa.jpg',
  cierre:    '/landing/fuego-wok.jpg',
}

const CARRERAS = [
  {
    id: 'cocina',
    nombre: 'Cocina',
    duracion: '2 años',
    foto: FOTOS.cocina,
    resumen: 'Para quien quiere dirigir una cocina: de los cortes básicos al servicio completo de un restaurante.',
    temas: [
      'Técnicas básicas y avanzadas de cocción',
      'Cocina peruana y cocina internacional',
      'Estandarización de recetas y costeo',
      'Manejo de brigada y servicio',
    ],
  },
  {
    id: 'panaderia',
    nombre: 'Panadería y Pastelería',
    duracion: '8 meses',
    foto: FOTOS.panaderia,
    resumen: 'Para quien quiere vivir del horno: masas, fermentación y repostería lista para vender.',
    temas: [
      'Masas, fermentación y panificación',
      'Pastelería clásica y decoración',
      'Postres y repostería peruana',
      'Producción y venta de tu propio negocio',
    ],
  },
]

const METODO = [
  { titulo: 'Práctica constante',       texto: 'Aprendes cocinando. Cada clase se desarrolla en cocina, con producción real y la corrección del chef al lado.' },
  { titulo: 'Criterio técnico',         texto: 'Recetas estandarizadas, orden de mise en place y trabajo en brigada, igual que en una cocina profesional.' },
  { titulo: 'Emprendimiento y gestión', texto: 'Costeas, presentas y vendes lo que preparas, para abrir tu propio negocio o liderar una cocina.' },
]

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d < 1)  return 'Hoy'
  if (d < 7)  return `Hace ${d} ${d === 1 ? 'día' : 'días'}`
  return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
}

/* ── Iconos SVG (sin emojis) ─────────────────────────── */
type IconProps = { size?: number; stroke?: number }
const SVG = (kids: React.ReactNode, fill = false) =>
  function I({ size = 24, stroke = 1.7 }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} aria-hidden
        stroke={fill ? 'none' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        {kids}
      </svg>
    )
  }

const IconPin      = SVG(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>)
const IconPhone    = SVG(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c1 .3 1.9.6 2.8.7a2 2 0 0 1 1.7 2Z"/>)
const IconMail     = SVG(<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>)
const IconGlobe    = SVG(<><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z"/></>)
const IconFacebook = SVG(<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3Z"/>, true)
const IconInstagram= SVG(<><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></>)
const IconTiktok   = SVG(<path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-1.8-2.5V9.8a5.7 5.7 0 1 0 4.9 5.6V9.1a7.3 7.3 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6Z"/>, true)
const IconYoutube  = SVG(<path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15V9l5.8 3-5.8 3Z"/>, true)
const IconWhatsapp = SVG(<><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.5 8.5c0 3.3 2.7 6 6 6"/></>)
const IconClose    = SVG(<><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>)
const IconMenu     = SVG(<><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></>)
const IconCheck    = SVG(<path d="m5 12.5 4.5 4.5L19 7.5"/>)
const IconClock    = SVG(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>)

const CSS = `
  /* ── Paleta de cocina: hierro fundido, acero, rojo ACEG y brasa ── */
  .lp {
    --carbon:   #1D1815;   /* hierro fundido */
    --carbon-2: #2A2420;
    --rojo:     #D9042F;   /* rojo del logo ACEG */
    --rojo-2:   #B00326;
    --brasa:    #F08A24;   /* llama del fogón, solo como acento */
    --acero:    #EDEEEE;   /* mesa de acero inoxidable */
    --acero-2:  #DCDEDE;
    --plato:    #FFFFFF;
    --tinta:    #231E1B;
    --tinta-2:  #5C5450;
    --tinta-3:  #8B837E;

    --display: var(--font-barlow-cond), 'Barlow Condensed', 'Arial Narrow', sans-serif;
    --texto:   var(--font-barlow), 'Barlow', system-ui, sans-serif;

    font-family: var(--texto);
    font-size: 17px;
    line-height: 1.6;
    color: var(--tinta);
    background: var(--plato);
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
  }
  .lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
  .lp ::selection { background: rgba(217,4,47,.18); }
  .lp a, .lp button { touch-action: manipulation; }
  .lp :focus-visible { outline: 3px solid var(--brasa); outline-offset: 3px; border-radius: 4px; }
  html:has(.lp) { scroll-behavior: smooth; scroll-padding-top: 72px; }
  @media (prefers-reduced-motion: reduce) {
    html:has(.lp) { scroll-behavior: auto; }
    .lp *, .lp *::before, .lp *::after { animation: none !important; transition: none !important; }
  }

  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
  @media (max-width: 600px) { .wrap { padding: 0 16px; } }

  /* Titular de la casa: condensada, cursiva y pesada (eco del banner ACEG) */
  .titular { font-family: var(--display); font-style: italic; font-weight: 800; text-transform: uppercase; line-height: .95; letter-spacing: -.005em; margin: 0; }
  .t-xl { font-size: clamp(44px, 7.4vw, 92px); }
  .t-lg { font-size: clamp(36px, 5.2vw, 64px); }
  .t-md { font-size: clamp(30px, 3.6vw, 44px); }
  .bajada { font-size: clamp(17px, 1.6vw, 19px); color: var(--tinta-2); max-width: 58ch; margin: 18px 0 0; }

  /* ── Botones ── */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; padding: 0 24px; border-radius: 6px; border: 2px solid transparent;
    font-family: var(--display); font-weight: 700; font-size: 19px; letter-spacing: .01em; text-decoration: none; cursor: pointer; white-space: nowrap;
    transition: background .18s ease, color .18s ease, border-color .18s ease; }
  .btn-rojo { background: var(--rojo); color: #fff; }
  .btn-rojo:hover { background: var(--rojo-2); }
  .btn-claro { background: #fff; color: var(--carbon); }
  .btn-claro:hover { background: var(--acero); }
  .btn-borde { background: transparent; color: #fff; border-color: rgba(255,255,255,.55); }
  .btn-borde:hover { border-color: #fff; background: rgba(255,255,255,.08); }
  .btn-borde-osc { background: transparent; color: var(--carbon); border-color: var(--carbon); }
  .btn-borde-osc:hover { background: var(--carbon); color: #fff; }
  .btn-sm { min-height: 40px; padding: 0 16px; font-size: 17px; }

  /* ── Nav: barra sólida de carbón, nunca tapa la imagen principal ── */
  .nav { position: sticky; top: 0; z-index: 50; background: var(--carbon); color: #fff; border-bottom: 3px solid var(--rojo); }
  .nav-row { height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .brand { display: flex; align-items: center; gap: 12px; text-decoration: none; color: #fff; }
  .brand-logo { position: relative; width: 40px; height: 40px; flex: none; }
  .brand-nombre { font-family: var(--display); font-weight: 800; font-size: 22px; line-height: 1; letter-spacing: .02em; }
  .brand-sub { font-size: 13px; color: rgba(255,255,255,.62); line-height: 1.2; margin-top: 2px; }
  .nav-links { display: flex; align-items: center; gap: 26px; }
  .nav-link { color: rgba(255,255,255,.8); text-decoration: none; font-weight: 500; font-size: 15px; padding: 6px 0; border-bottom: 2px solid transparent; transition: color .15s, border-color .15s; }
  .nav-link:hover { color: #fff; border-color: var(--brasa); }
  .menu-btn { display: none; background: none; border: 0; color: #fff; padding: 8px; cursor: pointer; }
  .menu-movil { background: var(--carbon-2); padding: 6px 16px 14px; }
  .menu-movil a { display: block; padding: 14px 4px; color: #fff; text-decoration: none; font-weight: 500; border-bottom: 1px solid rgba(255,255,255,.1); }
  .menu-movil a:last-child { border-bottom: 0; }
  @media (max-width: 900px) {
    .nav-links { display: none; }
    .menu-btn { display: inline-flex; }
  }
  @media (max-width: 420px) { .brand-sub { display: none; } }

  /* ── Hero A: banner institucional subido desde el panel (se muestra limpio) ── */
  .banner { display: block; width: 100%; height: auto; background: var(--carbon); }
  .banner-pie { background: var(--carbon); color: #fff; }
  .banner-pie .wrap { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-top: 22px; padding-bottom: 22px; flex-wrap: wrap; }
  .banner-pie p { margin: 0; font-size: 17px; color: rgba(255,255,255,.82); max-width: 52ch; }
  .banner-pie strong { color: #fff; font-weight: 600; }
  .acciones { display: flex; gap: 12px; flex-wrap: wrap; }

  /* ── Hero B: foto de clase (cuando no hay banner) ── */
  .hero { position: relative; min-height: min(86vh, 760px); display: flex; align-items: flex-end; color: #fff; isolation: isolate; overflow: hidden; background: var(--carbon); }
  .hero-foto { position: absolute; inset: 0; z-index: -2; }
  .hero::after { content: ''; position: absolute; inset: 0; z-index: -1;
    background: linear-gradient(90deg, rgba(29,24,21,.92) 0%, rgba(29,24,21,.7) 42%, rgba(29,24,21,.15) 80%), linear-gradient(0deg, rgba(29,24,21,.7), transparent 45%); }
  .hero .wrap { width: 100%; padding-top: 96px; padding-bottom: 72px; }
  .hero .titular { max-width: 11ch; }
  .hero .bajada { color: rgba(255,255,255,.86); }
  .hero .acciones { margin-top: 32px; }
  .hero-lugar { display: inline-flex; align-items: center; gap: 8px; margin-top: 28px; font-size: 15px; color: rgba(255,255,255,.7); }

  /* ── Carreras: el plato fuerte de la página ── */
  .carreras { padding: 104px 0 96px; }
  .carreras-cab { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; margin-bottom: 44px; }
  .carreras-cab .bajada { margin: 0; max-width: 44ch; }
  .carreras-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  @media (max-width: 860px) { .carreras-grid { grid-template-columns: 1fr; } }
  .carrera { display: flex; flex-direction: column; background: var(--acero); border-radius: 10px; overflow: hidden; }
  .carrera-foto { position: relative; aspect-ratio: 4 / 3; background: var(--carbon); }
  .carrera-duracion { position: absolute; left: 20px; bottom: 20px; display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 6px;
    background: var(--rojo); color: #fff; font-family: var(--display); font-weight: 700; font-size: 20px; line-height: 1; }
  .carrera-cuerpo { padding: 30px 30px 34px; display: flex; flex-direction: column; flex: 1; }
  .carrera-cuerpo .titular { color: var(--carbon); }
  .carrera-resumen { color: var(--tinta-2); margin: 12px 0 22px; max-width: 46ch; }
  .temas { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--acero-2); }
  .temas li { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--acero-2); font-weight: 500; }
  .temas svg { color: var(--rojo); flex: none; }
  @media (max-width: 600px) { .carrera-cuerpo { padding: 24px 20px 28px; } }

  /* ── Método ── */
  .metodo { background: var(--carbon); color: #fff; }
  .metodo-grid { display: grid; grid-template-columns: 5fr 6fr; min-height: 560px; }
  @media (max-width: 900px) { .metodo-grid { grid-template-columns: 1fr; } }
  .metodo-foto { position: relative; min-height: 360px; }
  .metodo-texto { padding: 88px clamp(24px, 6vw, 80px); display: flex; flex-direction: column; justify-content: center; }
  .metodo-texto .bajada { color: rgba(255,255,255,.72); }
  .pasos { list-style: none; margin: 36px 0 0; padding: 0; }
  .pasos li { padding: 20px 0; border-top: 1px solid rgba(255,255,255,.14); }
  .pasos h3 { font-family: var(--display); font-weight: 700; font-size: 26px; line-height: 1.1; margin: 0 0 6px; color: #fff; }
  .pasos p { margin: 0; color: rgba(255,255,255,.72); max-width: 52ch; }
  .pasos li:first-child h3 { color: var(--brasa); }
  @media (max-width: 600px) { .metodo-texto { padding: 64px 16px; } }

  /* ── Nosotros ── */
  .nosotros { padding: 104px 0; }
  .nosotros-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 56px 72px; margin-top: 48px; }
  @media (max-width: 860px) { .nosotros-grid { grid-template-columns: 1fr; gap: 40px; } }
  .bloque h3 { font-family: var(--display); font-weight: 700; font-size: 30px; line-height: 1.1; margin: 0 0 12px; color: var(--carbon); padding-left: 14px; border-left: 4px solid var(--rojo); }
  .bloque p { margin: 0; color: var(--tinta-2); white-space: pre-wrap; max-width: 60ch; }
  .valores { grid-column: 1 / -1; }
  .valores-lista { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }
  .valores-lista li { padding: 8px 16px; border-radius: 999px; background: var(--acero); font-weight: 500; font-size: 15px; color: var(--tinta); }

  /* ── Galería ── */
  .galeria { padding: 0 0 104px; }
  .galeria .titular { margin-bottom: 36px; }
  .gal { columns: 3 280px; column-gap: 14px; }
  .gal-item { position: relative; display: block; width: 100%; margin: 0 0 14px; padding: 0; border: 0; border-radius: 8px; overflow: hidden; cursor: zoom-in; break-inside: avoid; background: var(--acero); }
  .gal-item img { display: block; width: 100%; height: auto; transition: transform .4s ease; }
  .gal-item:hover img { transform: scale(1.03); }
  .gal-item figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: 28px 14px 12px; color: #fff; font-size: 14px; text-align: left; background: linear-gradient(transparent, rgba(29,24,21,.85)); }

  /* ── Comunicados ── */
  .noticias { background: var(--acero); padding: 96px 0; }
  .noticias .titular { margin-bottom: 36px; }
  .com-lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 22px; }
  @media (max-width: 400px) { .com-lista { grid-template-columns: 1fr; } }
  .com { background: #fff; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
  .com-img { position: relative; display: block; width: 100%; aspect-ratio: 16 / 10; padding: 0; border: 0; cursor: zoom-in; background: var(--acero-2); }
  .com-cuerpo { padding: 22px 24px 26px; }
  .com-fecha { font-size: 14px; color: var(--rojo); font-weight: 600; margin: 0 0 6px; }
  .com-titulo { font-family: var(--display); font-weight: 700; font-size: 26px; line-height: 1.15; margin: 0 0 10px; color: var(--carbon); }
  .com-texto { margin: 0; color: var(--tinta-2); font-size: 16px; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }

  /* ── Cierre con fuego ── */
  .cierre { position: relative; isolation: isolate; overflow: hidden; color: #fff; background: var(--carbon); }
  .cierre-foto { position: absolute; inset: 0; z-index: -2; }
  .cierre::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg, rgba(29,24,21,.94) 0%, rgba(29,24,21,.78) 50%, rgba(29,24,21,.2) 100%); }
  .cierre .wrap { padding-top: 112px; padding-bottom: 112px; }
  .cierre .titular { max-width: 12ch; }
  .cierre .bajada { color: rgba(255,255,255,.8); }
  .cierre .acciones { margin-top: 32px; }

  /* ── Footer ── */
  .footer { background: var(--carbon); color: rgba(255,255,255,.72); padding: 72px 0 32px; border-top: 1px solid rgba(255,255,255,.08); font-size: 15px; }
  .foot-grid { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 48px; margin-bottom: 48px; }
  @media (max-width: 820px) { .foot-grid { grid-template-columns: 1fr; gap: 36px; } }
  .foot-titulo { font-family: var(--display); font-weight: 700; font-size: 20px; color: #fff; margin: 0 0 16px; }
  .foot-texto { margin: 14px 0 0; max-width: 40ch; color: rgba(255,255,255,.6); }
  .foot-fila { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; line-height: 1.5; }
  .foot-fila svg { flex: none; margin-top: 3px; color: var(--brasa); }
  .foot-fila a { color: inherit; text-decoration: none; }
  .foot-fila a:hover { color: #fff; text-decoration: underline; }
  .redes { display: flex; gap: 10px; flex-wrap: wrap; }
  .red { display: inline-flex; width: 44px; height: 44px; align-items: center; justify-content: center; border-radius: 8px; background: rgba(255,255,255,.08); color: #fff; transition: background .15s; }
  .red:hover { background: var(--rojo); }
  .foot-base { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding-top: 24px; border-top: 1px solid rgba(255,255,255,.1); font-size: 14px; color: rgba(255,255,255,.5); }
  .foot-base a { color: rgba(255,255,255,.85); text-decoration: none; font-weight: 500; }
  .foot-base a:hover { color: #fff; }

  /* ── Lightbox ── */
  .lb { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(20,16,14,.94); }
  .lb-cerrar { position: absolute; top: 18px; right: 18px; width: 46px; height: 46px; border-radius: 50%; border: 0; background: rgba(255,255,255,.12); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .lb-cerrar:hover { background: rgba(255,255,255,.22); }
  .lb-img { max-width: 92vw; max-height: 86vh; border-radius: 8px; object-fit: contain; }
`

export default function LandingPage() {
  const [config,      setConfig]      = useState<LandingConfig>(DEFAULTS)
  const [cargado,     setCargado]     = useState(false)
  const [galeria,     setGaleria]     = useState<GaleriaItem[]>([])
  const [comunicados, setComunicados] = useState<Comunicado[]>([])
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [lightbox,    setLightbox]    = useState<string | null>(null)

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
      // Los campos vacíos en BD no deben pisar los valores institucionales por defecto
      if (cfg) setConfig({ ...DEFAULTS, ...Object.fromEntries(Object.entries(cfg).filter(([, v]) => v != null && v !== '')) })
      setGaleria(gal ?? [])
      setComunicados(com ?? [])
      setCargado(true)
    }
    load()
  }, [])

  const NAV = [
    { href: '#carreras', label: 'Carreras' },
    { href: '#nosotros', label: 'Nosotros' },
    ...(galeria.length     ? [{ href: '#galeria',     label: 'Galería' }]     : []),
    ...(comunicados.length ? [{ href: '#comunicados', label: 'Comunicados' }] : []),
    { href: '#contacto', label: 'Contacto' },
  ]

  const valoresList = (config.valores ?? DEFAULTS.valores ?? '')
    .split(/[·,•|]/).map(v => v.trim()).filter(Boolean)

  const acciones = (claro: boolean) => (
    <div className="acciones">
      <Link href="/login" className="btn btn-rojo">Ingresar al sistema</Link>
      <Link href="/padres" className={`btn ${claro ? 'btn-borde' : 'btn-borde-osc'}`}>Consultar notas</Link>
    </div>
  )

  return (
    <div className="lp">
      <style>{CSS}</style>

      {/* ── NAVBAR ── */}
      <header className="nav">
        <div className="wrap nav-row">
          <a href="#" className="brand" aria-label="ACEG, inicio">
            <span className="brand-logo">
              <Image src="/aceg-isotipo-blanco.png" alt="" fill sizes="40px" className="object-contain" />
            </span>
            <span>
              <span className="brand-nombre" style={{ display: 'block' }}>ACEG</span>
              <span className="brand-sub" style={{ display: 'block' }}>Escuela Gastronómica · Juliaca</span>
            </span>
          </a>

          <nav className="nav-links" aria-label="Secciones">
            {NAV.map(l => <a key={l.href} href={l.href} className="nav-link">{l.label}</a>)}
            <Link href="/padres" className="nav-link">Consultar notas</Link>
            <Link href="/login" className="btn btn-rojo btn-sm">Ingresar</Link>
          </nav>

          <button className="menu-btn" onClick={() => setMenuOpen(v => !v)} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen}>
            {menuOpen ? <IconClose size={26} /> : <IconMenu size={26} />}
          </button>
        </div>

        {menuOpen && (
          <nav className="menu-movil" aria-label="Secciones">
            {NAV.map(l => <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>{l.label}</a>)}
            <Link href="/padres" onClick={() => setMenuOpen(false)}>Consultar notas</Link>
            <Link href="/login" onClick={() => setMenuOpen(false)}>Ingresar al sistema</Link>
          </nav>
        )}
      </header>

      {/* ── HERO ── */}
      {!cargado ? (
        <div aria-hidden className="banner" style={{ aspectRatio: '2000 / 760' }} />
      ) : config.fondo_url ? (
        <section aria-label="Bienvenida">
          {/* El banner ya trae su propio mensaje: se muestra completo, sin capas encima */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.fondo_url} alt="Escuela Gastronómica ACEG: carreras de Cocina y de Panadería y Pastelería. Matrícula abierta." className="banner" />
          <div className="banner-pie">
            <div className="wrap">
              <p><strong>Carreras técnicas de Cocina y de Panadería y Pastelería</strong> en Juliaca, con clases prácticas en cocina desde el primer día.</p>
              {acciones(true)}
            </div>
          </div>
        </section>
      ) : (
        <section className="hero" aria-label="Bienvenida">
          <div className="hero-foto">
            <Image src={FOTOS.hero} alt="" fill priority sizes="100vw" className="object-cover" style={{ objectPosition: '70% 40%' }} />
          </div>
          <div className="wrap">
            <h1 className="titular t-xl">Haz de tu talento una historia que inspire</h1>
            <p className="bajada">
              Carreras técnicas de Cocina y de Panadería y Pastelería, con clases prácticas en cocina desde el primer día.
            </p>
            {acciones(true)}
            <p className="hero-lugar"><IconPin size={16} /> Jr. Sandia 843, Juliaca, Puno</p>
          </div>
        </section>
      )}

      {/* ── CARRERAS ── */}
      <section id="carreras" className="carreras">
        <div className="wrap">
          <div className="carreras-cab">
            <h2 className="titular t-lg">Elige tu carrera</h2>
            <p className="bajada">
              Dos caminos para trabajar en gastronomía. En los dos cocinas desde la primera semana.
            </p>
          </div>

          <div className="carreras-grid">
            {CARRERAS.map(c => (
              <article key={c.id} className="carrera">
                <div className="carrera-foto">
                  <Image src={c.foto} alt="" fill sizes="(max-width: 860px) 100vw, 580px" className="object-cover" />
                  <span className="carrera-duracion"><IconClock size={18} stroke={2.2} />{c.duracion}</span>
                </div>
                <div className="carrera-cuerpo">
                  <h3 className="titular t-md">{c.nombre}</h3>
                  <p className="carrera-resumen">{c.resumen}</p>
                  <ul className="temas">
                    {c.temas.map(t => <li key={t}><IconCheck size={20} stroke={2.4} />{t}</li>)}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── MÉTODO ── */}
      <section className="metodo" aria-labelledby="metodo-titulo">
        <div className="metodo-grid">
          <div className="metodo-foto">
            <Image src={FOTOS.metodo} alt="Chef terminando un plato con salsa" fill sizes="(max-width: 900px) 100vw, 45vw" className="object-cover" />
          </div>
          <div className="metodo-texto">
            <h2 id="metodo-titulo" className="titular t-lg">Se aprende en la cocina</h2>
            <p className="bajada">Menos pizarra, más fogón. Así se trabaja en cada clase de ACEG.</p>
            <ul className="pasos">
              {METODO.map(m => (
                <li key={m.titulo}>
                  <h3>{m.titulo}</h3>
                  <p>{m.texto}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── NOSOTROS ── */}
      <section id="nosotros" className="nosotros">
        <div className="wrap">
          <h2 className="titular t-lg">Quiénes somos</h2>
          <p className="bajada">
            Escuela gastronómica de Juliaca, formando cocineros, panaderos y pasteleros desde {ANIO_FUNDACION}.
          </p>

          <div className="nosotros-grid">
            <div className="bloque">
              <h3>Misión</h3>
              <p>{config.mision ?? DEFAULTS.mision}</p>
            </div>
            <div className="bloque">
              <h3>Visión</h3>
              <p>{config.vision ?? DEFAULTS.vision}</p>
            </div>
            <div className="bloque valores">
              <h3>Valores</h3>
              {valoresList.length > 1 ? (
                <ul className="valores-lista">
                  {valoresList.map(v => <li key={v}>{v}</li>)}
                </ul>
              ) : (
                <p>{config.valores ?? DEFAULTS.valores}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── GALERÍA (solo si hay fotos reales de la escuela) ── */}
      {galeria.length > 0 && (
        <section id="galeria" className="galeria">
          <div className="wrap">
            <h2 className="titular t-lg">Nuestra cocina</h2>
            <div className="gal">
              {galeria.map(img => (
                <figure key={img.id} style={{ margin: 0 }}>
                  <button type="button" className="gal-item" onClick={() => setLightbox(img.url)} aria-label={`Ampliar foto${img.descripcion ? `: ${img.descripcion}` : ''}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.descripcion ?? 'Foto de la escuela'} loading="lazy" />
                    {img.descripcion && <figcaption>{img.descripcion}</figcaption>}
                  </button>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── COMUNICADOS ── */}
      {comunicados.length > 0 && (
        <section id="comunicados" className="noticias">
          <div className="wrap">
            <h2 className="titular t-lg">Comunicados</h2>
            <div className="com-lista">
              {comunicados.map(c => (
                <article key={c.id} className="com">
                  {c.imagen_url && (
                    <button type="button" className="com-img" onClick={() => setLightbox(c.imagen_url)} aria-label={`Ampliar imagen de ${c.titulo}`}>
                      <Image src={c.imagen_url} alt="" fill sizes="(max-width: 700px) 100vw, 380px" className="object-cover" />
                    </button>
                  )}
                  <div className="com-cuerpo">
                    <p className="com-fecha">{timeAgo(c.created_at)}</p>
                    <h3 className="com-titulo">{c.titulo}</h3>
                    {c.contenido && <p className="com-texto">{c.contenido}</p>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CIERRE ── */}
      <section className="cierre">
        <div className="cierre-foto">
          <Image src={FOTOS.cierre} alt="" fill sizes="100vw" className="object-cover" style={{ objectPosition: '60% 50%' }} />
        </div>
        <div className="wrap">
          <h2 className="titular t-lg">Tu lugar en la cocina te espera</h2>
          <p className="bajada">Escríbenos por WhatsApp para conocer horarios, costos y la fecha de inicio de la próxima promoción.</p>
          <div className="acciones">
            <a href={REDES_EXTRA.whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-claro">
              <IconWhatsapp size={20} /> Pedir información
            </a>
            <Link href="/login" className="btn btn-borde">Ingresar al sistema</Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="contacto" className="footer">
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <div className="brand">
                <span className="brand-logo">
                  <Image src="/aceg-isotipo-blanco.png" alt="" fill sizes="40px" className="object-contain" />
                </span>
                <span>
                  <span className="brand-nombre" style={{ display: 'block' }}>ACEG</span>
                  <span className="brand-sub" style={{ display: 'block' }}>Arte Culinario, Emprendimiento y Gestión</span>
                </span>
              </div>
              <p className="foot-texto">
                Desde {ANIO_FUNDACION} formando profesionales de la cocina, la panadería y la pastelería en Juliaca, Puno.
              </p>
            </div>

            <div>
              <p className="foot-titulo">Contacto</p>
              {(config.direccion ?? DEFAULTS.direccion) && (
                <div className="foot-fila"><IconPin size={16} /><span>{config.direccion ?? DEFAULTS.direccion}</span></div>
              )}
              {config.telefono && (
                <div className="foot-fila"><IconPhone size={16} />
                  <span><a href={`tel:${config.telefono.replace(/\s/g, '')}`}>{config.telefono}</a> / <a href={`tel:${TELEFONO_FIJO.replace(/\s/g, '')}`}>{TELEFONO_FIJO}</a></span>
                </div>
              )}
              {config.email_contacto && (
                <div className="foot-fila"><IconMail size={16} /><a href={`mailto:${config.email_contacto}`}>{config.email_contacto}</a></div>
              )}
              <div className="foot-fila"><IconGlobe size={16} /><span>{SITIO_WEB}</span></div>
            </div>

            <div>
              <p className="foot-titulo">Síguenos</p>
              <div className="redes">
                {config.facebook_url && (
                  <a href={config.facebook_url} target="_blank" rel="noopener noreferrer" className="red" aria-label="Facebook"><IconFacebook size={18} /></a>
                )}
                {config.instagram_url && (
                  <a href={config.instagram_url} target="_blank" rel="noopener noreferrer" className="red" aria-label="Instagram"><IconInstagram size={18} /></a>
                )}
                <a href={REDES_EXTRA.tiktok} target="_blank" rel="noopener noreferrer" className="red" aria-label="TikTok"><IconTiktok size={18} /></a>
                <a href={REDES_EXTRA.youtube} target="_blank" rel="noopener noreferrer" className="red" aria-label="YouTube"><IconYoutube size={18} /></a>
                <a href={REDES_EXTRA.whatsapp} target="_blank" rel="noopener noreferrer" className="red" aria-label="WhatsApp"><IconWhatsapp size={18} /></a>
              </div>
            </div>
          </div>

          <div className="foot-base">
            <span>© {new Date().getFullYear()} Escuela Gastronómica ACEG</span>
            <Link href="/login">Acceso al sistema</Link>
          </div>
        </div>
      </footer>

      {/* ── LIGHTBOX ── */}
      {lightbox && (
        <div className="lb" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Imagen ampliada">
          <button className="lb-cerrar" onClick={() => setLightbox(null)} aria-label="Cerrar" autoFocus>
            <IconClose size={20} />
          </button>
          <div onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="Imagen ampliada" className="lb-img" />
          </div>
        </div>
      )}
    </div>
  )
}
