'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { getSesionDocente } from '@/lib/auth'
import type { Asignacion } from '@/types'

interface GradoGroup {
  label: string
  items: Asignacion[]
}


// ── Ilustraciones SVG por materia ──────────────────────────────────────────
function CourseIllustration({ nombre }: { nombre: string }) {
  const n = nombre.toLowerCase()

  if (/matem|álgebra|algebra|geometr|aritm|cálculo|calculo/.test(n)) {
    return (
      <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
        <circle cx="40" cy="40" r="36" fill="white" fillOpacity=".12"/>
        <text x="14" y="30" fontSize="22" fontWeight="900" fill="white" fillOpacity=".9" fontFamily="monospace">∑</text>
        <text x="42" y="30" fontSize="16" fontWeight="900" fill="white" fillOpacity=".7" fontFamily="monospace">π</text>
        <text x="14" y="56" fontSize="16" fontWeight="900" fill="white" fillOpacity=".7" fontFamily="monospace">x²</text>
        <text x="43" y="56" fontSize="18" fontWeight="900" fill="white" fillOpacity=".9" fontFamily="monospace">÷</text>
        <line x1="12" y1="38" x2="68" y2="38" stroke="white" strokeOpacity=".2" strokeWidth="1"/>
      </svg>
    )
  }

  if (/comuni|lenguaj|liter|escritur|lectura|gramát|gram|redacc/.test(n)) {
    return (
      <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
        <rect x="18" y="12" width="32" height="40" rx="3" fill="white" fillOpacity=".9" stroke="white" strokeOpacity=".3"/>
        <rect x="22" y="12" width="32" height="40" rx="3" fill="white" fillOpacity=".5" stroke="white" strokeOpacity=".3"/>
        <line x1="26" y1="24" x2="46" y2="24" stroke="white" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round"/>
        <line x1="26" y1="30" x2="48" y2="30" stroke="white" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round"/>
        <line x1="26" y1="36" x2="42" y2="36" stroke="white" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round"/>
        <path d="M50 46 L56 60 L58 54 L64 56 Z" fill="white" fillOpacity=".85"/>
        <circle cx="48" cy="44" r="4" fill="white" fillOpacity=".6"/>
      </svg>
    )
  }

  if (/cienci|biolog|quím|quim|físic|fisic|natur|ambiente/.test(n)) {
    return (
      <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
        <path d="M32 14 L32 36 L18 58 Q16 62 20 62 L60 62 Q64 62 62 58 L48 36 L48 14 Z" fill="white" fillOpacity=".2" stroke="white" strokeOpacity=".5" strokeWidth="1.5"/>
        <line x1="29" y1="28" x2="51" y2="28" stroke="white" strokeOpacity=".6" strokeWidth="1.5"/>
        <circle cx="28" cy="52" r="4" fill="white" fillOpacity=".8"/>
        <circle cx="40" cy="56" r="3" fill="white" fillOpacity=".6"/>
        <circle cx="52" cy="50" r="5" fill="white" fillOpacity=".8"/>
        <line x1="32" y1="14" x2="48" y2="14" stroke="white" strokeOpacity=".8" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    )
  }

  if (/histor|geograf|social|cívic|ciud|ambient|peru|perú/.test(n)) {
    return (
      <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
        <circle cx="40" cy="40" r="26" fill="white" fillOpacity=".15" stroke="white" strokeOpacity=".4" strokeWidth="1.5"/>
        <ellipse cx="40" cy="40" rx="10" ry="26" fill="white" fillOpacity=".08" stroke="white" strokeOpacity=".3" strokeWidth="1"/>
        <line x1="14" y1="40" x2="66" y2="40" stroke="white" strokeOpacity=".4" strokeWidth="1"/>
        <line x1="40" y1="14" x2="40" y2="66" stroke="white" strokeOpacity=".3" strokeWidth="1"/>
        <path d="M28 26 Q36 22 44 28 Q50 20 58 26" stroke="white" strokeOpacity=".6" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <path d="M22 44 Q32 48 40 44 Q50 52 58 46" stroke="white" strokeOpacity=".6" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      </svg>
    )
  }

  if (/ingl|idiom|franc|alem|chino|japon/.test(n)) {
    return (
      <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
        <rect x="10" y="16" width="44" height="30" rx="6" fill="white" fillOpacity=".85"/>
        <path d="M22 46 L18 58 L30 52 Z" fill="white" fillOpacity=".85"/>
        <text x="18" y="36" fontSize="13" fontWeight="900" fill="currentColor" fillOpacity=".7" fontFamily="serif">ABC</text>
        <rect x="40" y="30" width="30" height="22" rx="5" fill="white" fillOpacity=".35" stroke="white" strokeOpacity=".5" strokeWidth="1"/>
        <path d="M56 52 L60 62 L48 56 Z" fill="white" fillOpacity=".35"/>
        <line x1="44" y1="38" x2="66" y2="38" stroke="white" strokeOpacity=".5" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="44" y1="44" x2="60" y2="44" stroke="white" strokeOpacity=".5" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  }

  if (/arte|música|music|dibujo|plást|plast|artíst|artist/.test(n)) {
    return (
      <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
        <circle cx="40" cy="42" r="22" fill="white" fillOpacity=".2" stroke="white" strokeOpacity=".4" strokeWidth="1.5"/>
        <circle cx="30" cy="34" r="6" fill="white" fillOpacity=".7"/>
        <circle cx="50" cy="34" r="6" fill="white" fillOpacity=".5"/>
        <circle cx="28" cy="50" r="6" fill="white" fillOpacity=".6"/>
        <circle cx="52" cy="50" r="6" fill="white" fillOpacity=".45"/>
        <circle cx="40" cy="42" r="7" fill="white" fillOpacity=".9"/>
        <path d="M40 16 Q44 10 48 16" stroke="white" strokeOpacity=".7" strokeWidth="2" fill="none" strokeLinecap="round"/>
      </svg>
    )
  }

  if (/física|fisica|deport|educ.*fis|fis.*educ/.test(n)) {
    return (
      <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
        <circle cx="52" cy="18" r="6" fill="white" fillOpacity=".85"/>
        <path d="M44 26 L36 42 L28 38" stroke="white" strokeOpacity=".8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M44 26 L48 44 L58 50" stroke="white" strokeOpacity=".8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M36 42 L32 58" stroke="white" strokeOpacity=".8" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M48 44 L44 60" stroke="white" strokeOpacity=".8" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="24" cy="52" r="10" fill="white" fillOpacity=".15" stroke="white" strokeOpacity=".4" strokeWidth="1.5"/>
        <path d="M20 52 Q24 48 28 52" stroke="white" strokeOpacity=".6" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      </svg>
    )
  }

  if (/comput|inform|tic|tecnol|digital|program/.test(n)) {
    return (
      <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
        <rect x="12" y="18" width="44" height="30" rx="4" fill="white" fillOpacity=".2" stroke="white" strokeOpacity=".6" strokeWidth="1.5"/>
        <rect x="16" y="22" width="36" height="22" rx="2" fill="white" fillOpacity=".15"/>
        <line x1="28" y1="48" x2="28" y2="58" stroke="white" strokeOpacity=".6" strokeWidth="2"/>
        <line x1="52" y1="48" x2="52" y2="58" stroke="white" strokeOpacity=".6" strokeWidth="2"/>
        <line x1="20" y1="58" x2="60" y2="58" stroke="white" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round"/>
        <text x="22" y="38" fontSize="11" fontWeight="900" fill="white" fillOpacity=".8" fontFamily="monospace">&lt;/&gt;</text>
      </svg>
    )
  }

  if (/religi|ética|etica|moral|valor|person.*soci/.test(n)) {
    return (
      <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
        <path d="M40 62 C40 62 14 48 14 30 C14 22 20 16 28 16 C33 16 37 19 40 23 C43 19 47 16 52 16 C60 16 66 22 66 30 C66 48 40 62 40 62Z" fill="white" fillOpacity=".85"/>
        <path d="M40 56 C40 56 18 44 18 30 C18 24 22 20 28 20 C33 20 37 23 40 27 C43 23 47 20 52 20 C58 20 62 24 62 30 C62 44 40 56 40 56Z" fill="white" fillOpacity=".2"/>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 80 80" fill="none" className="w-full h-full">
      <path d="M40 20 L40 64" stroke="white" strokeOpacity=".7" strokeWidth="1.5"/>
      <path d="M40 20 C40 20 24 16 12 22 L12 64 C24 58 40 64 40 64" fill="white" fillOpacity=".85" stroke="white" strokeOpacity=".4" strokeWidth="1"/>
      <path d="M40 20 C40 20 56 16 68 22 L68 64 C56 58 40 64 40 64" fill="white" fillOpacity=".6" stroke="white" strokeOpacity=".4" strokeWidth="1"/>
      <line x1="17" y1="32" x2="35" y2="29" stroke="white" strokeOpacity=".4" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="17" y1="39" x2="35" y2="36" stroke="white" strokeOpacity=".4" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="17" y1="46" x2="35" y2="43" stroke="white" strokeOpacity=".4" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function gradientFromColor(hex: string) {
  return `linear-gradient(135deg, ${hex}ee, ${hex}99)`
}

export default function DocenteCursosPage() {
  const router = useRouter()
  const [grupos, setGrupos] = useState<GradoGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [cicloNombre, setCicloNombre] = useState('')

  useEffect(() => {
    async function init() {
      const sesion = await getSesionDocente()
      if (!sesion) { router.push('/login'); return }
      const uid = sesion.uid

      const ciclo = await getCicloActivo()
      setCicloNombre(ciclo?.nombre ?? '')
      const cicloId = ciclo?.id ?? null
      let asigsQ = supabase
        .from('asignaciones')
        .select('id, grado, grupo, anio, cursos(nombre, color)')
        .eq('docente_id', uid)
        .order('grado')
        .order('grupo')
        .order('anio')
      if (cicloId) asigsQ = asigsQ.eq('ciclo_id', cicloId)
      const { data } = await asigsQ

      const asigs = (data ?? []) as unknown as Asignacion[]

      const map = new Map<string, Asignacion[]>()
      for (const a of asigs) {
        const key = `${a.grado} — Sección ${a.grupo}`
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(a)
      }

      setGrupos([...map.entries()].map(([label, items]) => ({ label, items })))
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return null

  const totalCursos = grupos.reduce((s, g) => s + g.items.length, 0)

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '36px' }}>
        <h1 style={{ fontSize: '30px', fontWeight: '900', color: '#1a0305', letterSpacing: '-.02em', lineHeight: '1.1' }}>
          Mis Cursos
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '6px', fontWeight: '500' }}>
          {totalCursos > 0
            ? `${totalCursos} ${totalCursos === 1 ? 'curso asignado' : 'cursos asignados'}${cicloNombre ? ` · ciclo ${cicloNombre}` : ' este año'}`
            : 'Contacta al administrador para asignar tus cursos'}
        </p>
      </div>

      {/* ── Sin cursos ─────────────────────────────────────────────── */}
      {grupos.length === 0 && (
        <div style={{
          borderRadius: '20px', padding: '64px 24px', textAlign: 'center',
          background: 'white', border: '1.5px solid #E4E8EF'
        }}>
          <div style={{
            width: '60px', height: '60px', borderRadius: '16px', margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #F1F5F9, #E4E8EF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="rgba(11,36,71,.4)" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
          </div>
          <p style={{ color: '#6b7280', fontSize: '14px', fontWeight: '600' }}>Sin cursos asignados aún</p>
        </div>
      )}

      {/* ── Grupos por grado/sección ────────────────────────────────── */}
      {grupos.map(grupo => (
        <section key={grupo.label} style={{ marginBottom: '40px' }}>

          {/* Cabecera sección */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '3px', height: '18px', borderRadius: '2px', flexShrink: 0, background: 'linear-gradient(to bottom, #0B2447, #1E3A8A)' }} />
            <h2 style={{ fontSize: '11px', fontWeight: '800', color: '#0B2447', textTransform: 'uppercase', letterSpacing: '.14em' }}>
              {grupo.label}
            </h2>
            <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, #E4E8EF, transparent)' }} />
            <span style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280' }}>
              {grupo.items.length} {grupo.items.length === 1 ? 'curso' : 'cursos'}
            </span>
          </div>

          {/* Grid de cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '18px' }}>
            {grupo.items.map(asig => {
              const color  = asig.cursos?.color ?? '#0B2447'
              const nombre = asig.cursos?.nombre ?? 'Curso'
              const initials = nombre.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('')

              return (
                <button key={asig.id}
                  onClick={() => router.push(`/docente/cursos/${asig.id}`)}
                  style={{
                    borderRadius: '20px', overflow: 'hidden',
                    background: 'white',
                    border: '1.5px solid #E4E8EF',
                    boxShadow: '0 4px 24px rgba(11,36,71,.06)',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'transform .16s ease, box-shadow .16s ease',
                    display: 'flex', flexDirection: 'column'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-5px)'
                    e.currentTarget.style.boxShadow = `0 18px 48px ${color}22, 0 6px 18px rgba(107,15,26,.09)`
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 24px rgba(11,36,71,.06)'
                  }}>

                  {/* Zona ilustración */}
                  <div style={{
                    height: '140px',
                    background: gradientFromColor(color),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative', overflow: 'hidden',
                    padding: '16px'
                  }}>
                    {/* Diagonal stripe texture */}
                    <div style={{
                      position: 'absolute', inset: 0, pointerEvents: 'none',
                      background: `repeating-linear-gradient(-45deg, transparent, transparent 14px, rgba(255,255,255,.04) 14px, rgba(255,255,255,.04) 15px)`
                    }} />
                    {/* Decorative circles */}
                    <div style={{
                      position: 'absolute', top: '-18px', right: '-18px',
                      width: '90px', height: '90px', borderRadius: '50%',
                      background: 'rgba(255,255,255,.1)', pointerEvents: 'none'
                    }} />
                    <div style={{
                      position: 'absolute', bottom: '-10px', left: '-10px',
                      width: '60px', height: '60px', borderRadius: '50%',
                      background: 'rgba(255,255,255,.07)', pointerEvents: 'none'
                    }} />
                    {/* SVG illustration */}
                    <div style={{ width: '80px', height: '80px', position: 'relative', zIndex: 1 }}>
                      <CourseIllustration nombre={nombre} />
                    </div>
                    {/* Initials badge */}
                    <div style={{
                      position: 'absolute', top: '12px', left: '14px',
                      width: '32px', height: '32px', borderRadius: '9px',
                      background: 'rgba(255,255,255,.22)',
                      border: '1px solid rgba(255,255,255,.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: '900', color: 'white',
                      letterSpacing: '.02em'
                    }}>
                      {initials}
                    </div>
                  </div>

                  {/* Zona contenido */}
                  <div style={{ padding: '18px 18px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '0' }}>
                    <p style={{
                      fontSize: '15px', fontWeight: '800', color: '#1a0305',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginBottom: '4px'
                    }}>
                      {nombre}
                    </p>
                    <p style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '14px' }}>
                      {asig.grado} · Sección {asig.grupo}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: '800', letterSpacing: '.05em',
                        padding: '4px 10px', borderRadius: '999px',
                        background: color + '14', color
                      }}>
                        {asig.anio}
                      </span>
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '50%',
                        background: color + '14',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background .14s'
                      }}>
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ))}

    </div>
  )
}
