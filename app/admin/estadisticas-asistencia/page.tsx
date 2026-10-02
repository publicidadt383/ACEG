'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo, type CicloActivo } from '@/lib/ciclo'
import { fechaHoyLima } from '@/app/admin/helpers'

/* ─────────────────────────────── tipos ─────────────────────────────── */

interface MatRow { alumno_id: string; grado: string; grupo: string }
interface RegDia { alumno_id: string; estado: string | null }

interface FilaStat {
  clave: string
  etiqueta: string
  sub: string | null
  matriculados: number
  presentes: number    // estado P (o null: registros antiguos sin estado)
  tardanzas: number    // estado T
  justificadas: number // estado J (falta justificada — NO asistió)
}

interface PuntoTendencia {
  fecha: string      // ISO YYYY-MM-DD
  label: string      // "lun 20"
  asistieron: number
}

const GRADOS_ORDEN = [
  '1° Ciclo Cocina','2° Ciclo Cocina','3° Ciclo Cocina','4° Ciclo Cocina',
  '1° Ciclo Pastelería','2° Ciclo Pastelería',
]

/* Paleta del módulo (validada con el skill de dataviz): azul = puntuales,
   ámbar = tardanzas — ambos "asistieron". El ámbar es sub-3:1 sobre blanco,
   por eso cada fila lleva su etiqueta numérica visible y existe vista de tabla. */
const C_PRESENTE = '#2a78d6'
const C_TARDANZA = '#eda100'
const C_TRACK    = '#edf0f4'   // resto de la barra: matriculados que no asistieron
const C_GRID     = '#e7e5e0'   // hairline de grilla
const C_MUTED    = '#898781'   // texto de ejes
const C_INK      = '#1e293b'

const card: React.CSSProperties = {
  background: 'white', border: '1px solid #E4E8EF',
  boxShadow: '0 2px 12px rgba(11,36,71,.05)',
}

const fmtN = (n: number) => n.toLocaleString('es-PE')

/* ───────────────────────────── helpers ─────────────────────────────── */

// Trae todas las filas paginando de a 1000 (Supabase corta en 1000 por request).
async function fetchTodo<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const CHUNK = 1000
  const out: T[] = []
  for (let from = 0; ; from += CHUNK) {
    const { data } = await build(from, from + CHUNK - 1)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < CHUNK) break
  }
  return out
}

// Últimos n días hábiles (Lun–Vie) terminando en fechaISO (o el hábil anterior).
function ultimosDiasHabiles(fechaISO: string, n: number): string[] {
  const dias: string[] = []
  const d = new Date(`${fechaISO}T12:00:00-05:00`)
  while (dias.length < n) {
    const dow = d.getUTCDay()
    if (dow >= 1 && dow <= 5) dias.unshift(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return dias
}

function labelDia(fechaISO: string): string {
  return new Date(`${fechaISO}T12:00:00-05:00`)
    .toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', timeZone: 'America/Lima' })
    .replace('.', '')
}

function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T12:00:00-05:00`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Paso "limpio" (1/2/2.5/5 × 10^k) para las marcas del eje Y.
function pasoLimpio(objetivo: number): number {
  if (objetivo <= 0) return 1
  const pot = Math.pow(10, Math.floor(Math.log10(objetivo)))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pot >= objetivo) return m * pot
  }
  return 10 * pot
}

/* ─────────────────────────── componente ────────────────────────────── */

interface Props { embedded?: boolean }

export function EstadisticasAsistenciaContent({ embedded = false }: Props = {}) {
  const router = useRouter()

  const [loading,     setLoading]     = useState(true)
  const [ciclo,       setCiclo]       = useState<CicloActivo | null>(null)
  const [matriculas,  setMatriculas]  = useState<MatRow[]>([])
  const [salonNombre, setSalonNombre] = useState<Record<string, string>>({})  // "grado-grupo" → nombre

  const [fecha,       setFecha]       = useState(fechaHoyLima())
  const [registros,   setRegistros]   = useState<RegDia[]>([])
  const [cargandoDia, setCargandoDia] = useState(false)

  const [tendencia,    setTendencia]    = useState<PuntoTendencia[]>([])
  const [cargandoTend, setCargandoTend] = useState(false)
  const [hoverTend,    setHoverTend]    = useState<number | null>(null)

  const [nivelFiltro, setNivelFiltro] = useState<'Todos' | 'Cocina' | 'Pastelería'>('Todos')
  const [vista,       setVista]       = useState<'graficas' | 'tabla'>('graficas')

  // Tooltip compartido de las barras (sigue a la fila, no gatea: los valores están en la etiqueta y la tabla)
  const [barTip, setBarTip] = useState<{ fila: FilaStat; x: number; y: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  /* ── init: auth (standalone) + ciclo + matrícula + salones ── */
  useEffect(() => {
    async function init() {
      if (!embedded) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { data: adm } = await supabase.from('user_admin').select('id').eq('id', user.id).maybeSingle()
        if (!adm) { router.push('/admin'); return }
      }
      const c = await getCicloActivo()
      setCiclo(c)
      if (c) {
        const [mats, { data: sals }] = await Promise.all([
          fetchTodo<MatRow>((from, to) =>
            supabase.from('matriculas').select('alumno_id,grado,grupo').eq('ciclo_id', c.id).range(from, to)),
          supabase.from('salones').select('grado,grupo,nombre'),
        ])
        setMatriculas(mats)
        const nombres: Record<string, string> = {}
        for (const s of (sals ?? []) as { grado: string; grupo: string; nombre: string | null }[]) {
          if (s.nombre) nombres[`${s.grado}-${s.grupo}`] = s.nombre
        }
        setSalonNombre(nombres)
      }
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  /* ── registros del día seleccionado ── */
  useEffect(() => {
    if (loading || !ciclo) return
    let cancel = false
    async function cargarDia() {
      setCargandoDia(true)
      const regs = await fetchTodo<RegDia>((from, to) =>
        supabase.from('asistencia_diaria_alumnos').select('alumno_id,estado').eq('fecha', fecha).range(from, to))
      if (!cancel) { setRegistros(regs); setCargandoDia(false) }
    }
    cargarDia()
    return () => { cancel = true }
  }, [fecha, loading, ciclo])

  /* ── tendencia: últimos 10 días en los que se llamó asistencia ── */
  useEffect(() => {
    if (loading || !ciclo) return
    let cancel = false
    async function contarDia(d: string) {
      // Asistieron = registros del día − justificadas (P, T y registros antiguos sin estado).
      const [{ count: total }, { count: just }] = await Promise.all([
        supabase.from('asistencia_diaria_alumnos').select('id', { count: 'exact', head: true }).eq('fecha', d),
        supabase.from('asistencia_diaria_alumnos').select('id', { count: 'exact', head: true }).eq('fecha', d).eq('estado', 'J'),
      ])
      return { fecha: d, label: labelDia(d), asistieron: Math.max(0, (total ?? 0) - (just ?? 0)), registros: total ?? 0 }
    }
    async function cargarTendencia() {
      setCargandoTend(true)
      // Retrocede por días hábiles y conserva solo aquellos con registros,
      // hasta juntar 10 o haber revisado 40 (feriados y días sin llamado no aparecen).
      const puntos: PuntoTendencia[] = []   // más reciente primero
      let cursor = fecha
      let revisados = 0
      while (puntos.length < 10 && revisados < 40 && !cancel) {
        const dias = ultimosDiasHabiles(cursor, 10)
        const res = await Promise.all(dias.map(contarDia))
        for (const p of [...res].reverse()) {
          if (p.registros > 0 && puntos.length < 10) {
            puntos.push({ fecha: p.fecha, label: p.label, asistieron: p.asistieron })
          }
        }
        revisados += 10
        cursor = sumarDias(dias[0], -1)
      }
      if (!cancel) { setTendencia(puntos.reverse()); setCargandoTend(false) }
    }
    cargarTendencia()
    return () => { cancel = true }
  }, [fecha, loading, ciclo])

  /* ── agregados ── */
  const stats = useMemo(() => {
    const porAlumno = new Map<string, { grado: string; grupo: string }>()
    for (const m of matriculas) porAlumno.set(m.alumno_id, { grado: m.grado, grupo: m.grupo })

    const salones = new Map<string, FilaStat>()
    for (const m of matriculas) {
      const k = `${m.grado}-${m.grupo}`
      if (!salones.has(k)) {
        salones.set(k, {
          clave: k, etiqueta: `${m.grado} “${m.grupo}”`, sub: salonNombre[k] ?? null,
          matriculados: 0, presentes: 0, tardanzas: 0, justificadas: 0,
        })
      }
      salones.get(k)!.matriculados++
    }
    const gradoDe = new Map<string, string>()
    for (const m of matriculas) gradoDe.set(`${m.grado}-${m.grupo}`, m.grado)

    for (const r of registros) {
      const ub = porAlumno.get(r.alumno_id)
      if (!ub) continue                       // registro de otro ciclo / alumno retirado
      const s = salones.get(`${ub.grado}-${ub.grupo}`)
      if (!s) continue
      if (r.estado === 'T') s.tardanzas++
      else if (r.estado === 'J') s.justificadas++
      else s.presentes++                      // 'P' o null (registros previos a la columna estado)
    }

    const listaSalones = [...salones.values()].sort((a, b) => {
      const ga = gradoDe.get(a.clave)!, gb = gradoDe.get(b.clave)!
      const gi = GRADOS_ORDEN.indexOf(ga) - GRADOS_ORDEN.indexOf(gb)
      return gi !== 0 ? gi : a.clave.localeCompare(b.clave)
    })

    const grados = new Map<string, FilaStat>()
    for (const s of listaSalones) {
      const g = gradoDe.get(s.clave)!
      if (!grados.has(g)) grados.set(g, { clave: g, etiqueta: g, sub: null, matriculados: 0, presentes: 0, tardanzas: 0, justificadas: 0 })
      const acc = grados.get(g)!
      acc.matriculados += s.matriculados; acc.presentes += s.presentes
      acc.tardanzas += s.tardanzas;       acc.justificadas += s.justificadas
    }
    const listaGrados = [...grados.values()]

    const total = listaGrados.reduce((acc, g) => ({
      matriculados: acc.matriculados + g.matriculados,
      presentes:    acc.presentes    + g.presentes,
      tardanzas:    acc.tardanzas    + g.tardanzas,
      justificadas: acc.justificadas + g.justificadas,
    }), { matriculados: 0, presentes: 0, tardanzas: 0, justificadas: 0 })

    return { listaSalones, listaGrados, total, nivelDe: gradoDe }
  }, [matriculas, registros, salonNombre])

  const asistieronTotal = stats.total.presentes + stats.total.tardanzas
  const pctTotal = stats.total.matriculados > 0
    ? Math.round((asistieronTotal / stats.total.matriculados) * 100) : 0
  const faltasTotal = Math.max(0, stats.total.matriculados - asistieronTotal - stats.total.justificadas)

  // Delta contra el día anterior con asistencia (para los stat tiles)
  const delta = useMemo(() => {
    const idx = tendencia.findIndex(p => p.fecha === fecha)
    if (idx <= 0) return null
    return tendencia[idx].asistieron - tendencia[idx - 1].asistieron
  }, [tendencia, fecha])

  const salonesVisibles = nivelFiltro === 'Todos'
    ? stats.listaSalones
    : stats.listaSalones.filter(s => stats.nivelDe.get(s.clave)!.includes(nivelFiltro))

  const esHoy = fecha === fechaHoyLima()

  function mostrarBarTip(fila: FilaStat, e: React.MouseEvent) {
    const root = rootRef.current?.getBoundingClientRect()
    if (!root) return
    setBarTip({ fila, x: e.clientX - root.left, y: e.clientY - root.top })
  }

  /* ─────────────────────────── UI ─────────────────────────── */

  if (loading) {
    return (
      <div className={embedded ? 'py-20 flex justify-center' : 'min-h-screen flex items-center justify-center'}
        style={embedded ? undefined : { background: '#f7f5f1' }}>
        <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#0B2447" strokeWidth="4"/>
          <path className="opacity-75" fill="#0B2447" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
      </div>
    )
  }

  const cuerpo = !ciclo ? (
    <div className="rounded-2xl p-10 text-center" style={card}>
      <p className="font-black text-slate-700">No hay un ciclo lectivo activo</p>
      <p className="text-sm text-slate-400 mt-1">Activa un ciclo en «Ciclos Académicos» para ver las estadísticas.</p>
    </div>
  ) : stats.total.matriculados === 0 ? (
    <div className="rounded-2xl p-10 text-center" style={card}>
      <p className="font-black text-slate-700">Sin matrículas en el ciclo {ciclo.nombre}</p>
      <p className="text-sm text-slate-400 mt-1">Registra matrículas para ver las gráficas de asistencia.</p>
    </div>
  ) : (
    <div ref={rootRef} className="relative space-y-4">

      {/* ── Fila de filtros: escopan todo lo de abajo ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest"
            style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #bbf7d0' }}>
            ● Ciclo {ciclo.nombre}
          </span>
          <span className="text-[11px] text-slate-400 font-semibold hidden sm:inline">Asistencia diaria a la escuela</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setFecha(f => sumarDias(f, -1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ background: '#f1f5f9', color: '#64748b' }} title="Día anterior">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <input type="date" value={fecha} max={fechaHoyLima()}
            onChange={e => e.target.value && setFecha(e.target.value)}
            className="text-xs font-bold text-slate-700 px-3 py-1.5 rounded-lg outline-none"
            style={{ background: 'white', border: '1.5px solid #E4E8EF' }} />
          <button onClick={() => setFecha(f => sumarDias(f, 1))} disabled={esHoy}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
            style={{ background: '#f1f5f9', color: '#64748b' }} title="Día siguiente">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
          {!esHoy && (
            <button onClick={() => setFecha(fechaHoyLima())}
              className="text-xs font-black px-3 py-1.5 rounded-lg transition-all"
              style={{ background: '#0B2447', color: 'white' }}>
              Hoy
            </button>
          )}
          {/* Vista gráficas / tabla (la tabla es la lectura sin color, siempre disponible) */}
          <div className="flex rounded-lg overflow-hidden ml-1" style={{ border: '1.5px solid #E4E8EF' }}>
            {([['graficas', 'Gráficas'], ['tabla', 'Tabla']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setVista(v)}
                className="text-xs font-black px-3 py-1.5 transition-all"
                style={vista === v ? { background: '#0B2447', color: 'white' } : { background: 'white', color: '#64748b' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stat tiles del día ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 transition-opacity"
        style={{ opacity: cargandoDia ? .55 : 1 }}>
        <StatTile label="Matriculados" valor={fmtN(stats.total.matriculados)} />
        <StatTile label="Asistieron" valor={fmtN(asistieronTotal)}
          delta={delta !== null ? { n: delta, texto: 'vs día anterior' } : undefined}
          spark={tendencia.map(p => p.asistieron)} sparkHoy={tendencia.findIndex(p => p.fecha === fecha)} />
        <StatTile label="Asistencia" valor={`${pctTotal}%`}
          tono={pctTotal >= 90 ? '#006300' : pctTotal >= 75 ? '#a16207' : '#b91c1c'} />
        <StatTile label="Puntuales" valor={fmtN(stats.total.presentes)} swatch={C_PRESENTE} />
        <StatTile label="Tardanzas" valor={fmtN(stats.total.tardanzas)} swatch={C_TARDANZA} />
        <StatTile label="Faltas" valor={fmtN(faltasTotal + stats.total.justificadas)}
          extra={stats.total.justificadas > 0 ? `${stats.total.justificadas} justificadas` : undefined} />
      </div>

      {/* ── Total: tendencia ── */}
      <div className="rounded-2xl p-5" style={card}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-sm" style={{ color: C_INK }}>Total de la escuela</p>
            <p className="text-[11px] text-slate-400 font-semibold">Estudiantes que asistieron · últimos 10 días con asistencia llamada</p>
          </div>
        </div>
        {cargandoTend && tendencia.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-xs text-slate-400 font-semibold">Cargando…</div>
        ) : tendencia.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-xs text-slate-400 font-semibold">
            No se llamó asistencia en las últimas semanas.
          </div>
        ) : (
          <div className="relative transition-opacity" style={{ opacity: cargandoTend ? .55 : 1 }}>
            {(() => {
              const W = 640, H = 200, padL = 44, padR = 52, padT = 18, padB = 28
              const maxY = Math.max(stats.total.matriculados, 1)
              const n = tendencia.length
              const x = (i: number) => padL + (n > 1 ? (i * (W - padL - padR)) / (n - 1) : (W - padL - padR) / 2)
              const y = (v: number) => padT + (H - padT - padB) * (1 - v / maxY)
              const linea = tendencia.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.asistieron).toFixed(1)}`).join(' ')
              const area = `${linea} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`
              // Marcas limpias del eje Y; se omiten las que chocan con la línea de matriculados
              const paso = pasoLimpio(maxY / 3)
              const ticks: number[] = [0]
              for (let v = paso; v < maxY * 0.9; v += paso) ticks.push(v)
              const ult = tendencia[n - 1]
              return (
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
                  aria-label="Tendencia de asistencia total de los últimos 10 días con asistencia llamada">
                  {/* grilla hairline + referencia de matriculados */}
                  {ticks.map(v => (
                    <g key={v}>
                      <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={C_GRID} strokeWidth="1"/>
                      <text x={padL - 7} y={y(v) + 3.5} textAnchor="end" fontSize="9.5" fill={C_MUTED}
                        style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtN(v)}</text>
                    </g>
                  ))}
                  <line x1={padL} x2={W - padR} y1={y(maxY)} y2={y(maxY)} stroke={C_GRID} strokeWidth="1"/>
                  <text x={W - padR + 5} y={y(maxY) + 3.5} fontSize="9" fill={C_MUTED}>Matric. {fmtN(maxY)}</text>

                  {/* área (lavado 10%) + línea 2px */}
                  <path d={area} fill={C_PRESENTE} opacity="0.1"/>
                  <path d={linea} fill="none" stroke={C_PRESENTE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>

                  {/* crosshair sólido en el X activo */}
                  {hoverTend !== null && tendencia[hoverTend] && (
                    <line x1={x(hoverTend)} x2={x(hoverTend)} y1={padT} y2={H - padB} stroke="#c3c2b7" strokeWidth="1"/>
                  )}

                  {/* puntos con anillo de superficie + zonas de hover anchas */}
                  {tendencia.map((p, i) => (
                    <g key={p.fecha}>
                      <circle cx={x(i)} cy={y(p.asistieron)} r={p.fecha === fecha ? 5 : 4}
                        fill={p.fecha === fecha ? '#0B2447' : C_PRESENTE} stroke="white" strokeWidth="2"/>
                      <rect x={x(i) - (W - padL - padR) / (2 * Math.max(n - 1, 1))} y={0}
                        width={(W - padL - padR) / Math.max(n - 1, 1)} height={H} fill="transparent"
                        onMouseEnter={() => setHoverTend(i)} onMouseLeave={() => setHoverTend(null)}
                        onClick={() => setFecha(p.fecha)} style={{ cursor: 'pointer' }}/>
                      <text x={x(i)} y={H - 9} textAnchor="middle" fontSize="9.5"
                        fontWeight={p.fecha === fecha ? 800 : 600}
                        fill={p.fecha === fecha ? '#0B2447' : C_MUTED}>{p.label}</text>
                    </g>
                  ))}

                  {/* etiqueta directa solo en el último punto */}
                  <text x={x(n - 1) + 9} y={y(ult.asistieron) + 3.5} fontSize="10.5" fontWeight="800" fill={C_INK}>
                    {fmtN(ult.asistieron)}
                  </text>
                </svg>
              )
            })()}
            {hoverTend !== null && tendencia[hoverTend] && (
              <div className="absolute top-0 pointer-events-none px-3 py-2 rounded-xl whitespace-nowrap"
                style={{
                  left: `${Math.min(78, Math.max(4, 7 + (hoverTend / Math.max(tendencia.length - 1, 1)) * 76))}%`,
                  background: 'white', border: '1px solid #E4E8EF', boxShadow: '0 8px 24px rgba(11,36,71,.14)',
                }}>
                <p className="text-[10px] font-bold text-slate-400 capitalize">{tendencia[hoverTend].label}</p>
                <p className="flex items-center gap-1.5 mt-0.5">
                  <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: C_PRESENTE }}/>
                  <span className="text-sm font-black" style={{ color: C_INK }}>{fmtN(tendencia[hoverTend].asistieron)}</span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    asistieron · {Math.round((tendencia[hoverTend].asistieron / Math.max(stats.total.matriculados, 1)) * 100)}%
                  </span>
                </p>
              </div>
            )}
            <p className="text-[10px] text-slate-400 font-semibold mt-1">Toca un punto para ver ese día en detalle.</p>
          </div>
        )}
      </div>

      {/* ── Leyenda compartida de las barras ── */}
      {vista === 'graficas' && (
        <div className="flex items-center gap-4 px-1">
          {[{ c: C_PRESENTE, l: 'Puntuales' }, { c: C_TARDANZA, l: 'Con tardanza' }, { c: C_TRACK, l: 'No asistieron' }].map(it => (
            <span key={it.l} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
              <span className="inline-block w-3 h-3 rounded" style={{ background: it.c, border: it.c === C_TRACK ? '1px solid #dde3ea' : 'none' }}/>
              {it.l}
            </span>
          ))}
        </div>
      )}

      {/* ── Por grado ── */}
      <div className="rounded-2xl p-5" style={card}>
        <p className="font-black text-sm" style={{ color: C_INK }}>Por grado</p>
        <p className="text-[11px] text-slate-400 font-semibold mb-4">
          Asistencia del {new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' })}
        </p>
        {vista === 'tabla'
          ? <TablaStats filas={stats.listaGrados} cargando={cargandoDia} />
          : (
            <div className="space-y-2.5 transition-opacity" style={{ opacity: cargandoDia ? .55 : 1 }}>
              {stats.listaGrados.map(g => (
                <FilaBarra key={g.clave} fila={g} alta
                  onEnter={mostrarBarTip} onLeave={() => setBarTip(null)} />
              ))}
            </div>
          )}
      </div>

      {/* ── Por salón ── */}
      <div className="rounded-2xl p-5" style={card}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="font-black text-sm" style={{ color: C_INK }}>Por salón</p>
            <p className="text-[11px] text-slate-400 font-semibold">Cada barra es una sección; el fondo claro es el total de matriculados</p>
          </div>
          <div className="flex gap-1">
            {(['Todos', 'Cocina', 'Pastelería'] as const).map(niv => (
              <button key={niv} onClick={() => setNivelFiltro(niv)}
                className="px-3 py-1.5 rounded-lg text-xs font-black transition-all"
                style={nivelFiltro === niv
                  ? { background: '#0B2447', color: 'white' }
                  : { background: '#f1f5f9', color: '#64748b' }}>
                {niv}
              </button>
            ))}
          </div>
        </div>
        {vista === 'tabla'
          ? <TablaStats filas={salonesVisibles} cargando={cargandoDia} />
          : (
            <div className="space-y-2 transition-opacity" style={{ opacity: cargandoDia ? .55 : 1 }}>
              {salonesVisibles.map(s => (
                <FilaBarra key={s.clave} fila={s}
                  onEnter={mostrarBarTip} onLeave={() => setBarTip(null)} />
              ))}
              {salonesVisibles.length === 0 && (
                <p className="text-xs text-slate-400 font-semibold py-4 text-center">No hay salones en este nivel.</p>
              )}
            </div>
          )}
      </div>

      {/* ── Tooltip compartido de barras: el valor manda, la serie acompaña ── */}
      {barTip && (() => {
        const f = barTip.fila
        const asis = f.presentes + f.tardanzas
        const faltas = Math.max(0, f.matriculados - asis - f.justificadas)
        return (
          <div className="absolute z-30 pointer-events-none px-3 py-2 rounded-xl whitespace-nowrap"
            style={{
              left: Math.min(barTip.x + 14, (rootRef.current?.clientWidth ?? 400) - 190),
              top: barTip.y - 78,
              background: 'white', border: '1px solid #E4E8EF', boxShadow: '0 8px 24px rgba(11,36,71,.14)',
            }}>
            <p className="text-[10px] font-bold text-slate-400">{f.etiqueta}{f.sub ? ` · ${f.sub}` : ''}</p>
            <div className="mt-1 space-y-0.5">
              <p className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: C_PRESENTE }}/>
                <span className="text-sm font-black" style={{ color: C_INK }}>{f.presentes}</span>
                <span className="text-[10px] font-semibold text-slate-400">puntuales</span>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: C_TARDANZA }}/>
                <span className="text-sm font-black" style={{ color: C_INK }}>{f.tardanzas}</span>
                <span className="text-[10px] font-semibold text-slate-400">con tardanza</span>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: '#c9d2dd' }}/>
                <span className="text-sm font-black" style={{ color: C_INK }}>{faltas}</span>
                <span className="text-[10px] font-semibold text-slate-400">
                  faltas{f.justificadas > 0 ? ` · ${f.justificadas} justificadas` : ''}
                </span>
              </p>
            </div>
          </div>
        )
      })()}
    </div>
  )

  if (embedded) return <div className="space-y-4">{cuerpo}</div>

  return (
    <div className="min-h-screen" style={{ background: '#f7f5f1' }}>
      <header className="sticky top-0 z-40 px-4 py-3 flex items-center gap-3"
        style={{ background: 'white', borderBottom: '1px solid #E4E8EF', borderTop: '3px solid #0B2447' }}>
        <button onClick={() => router.push('/admin')}
          className="flex items-center gap-2 text-xs font-black px-3 py-2 rounded-xl"
          style={{ background: '#F1F5F9', border: '1.5px solid #fecdd3', color: '#0B2447' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Volver
        </button>
        <p className="font-black text-slate-800 text-sm">Estadísticas de Asistencia</p>
      </header>
      <main className="p-4 lg:p-6 max-w-5xl mx-auto">{cuerpo}</main>
    </div>
  )
}

/* ── Stat tile: etiqueta · valor (proporcional) · delta opcional · sparkline ── */
function StatTile({ label, valor, delta, spark, sparkHoy, tono, swatch, extra }: {
  label: string
  valor: string
  delta?: { n: number; texto: string }
  spark?: number[]
  sparkHoy?: number
  tono?: string
  swatch?: string
  extra?: string
}) {
  return (
    <div className="rounded-2xl px-4 py-3" style={card}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
        {swatch && <span className="inline-block w-2 h-2 rounded-full" style={{ background: swatch }}/>}
        {label}
      </p>
      <p className="text-2xl font-black leading-tight mt-0.5" style={{ color: tono ?? '#1e293b' }}>{valor}</p>
      {delta && delta.n !== 0 && (
        <p className="text-[10px] font-bold" style={{ color: delta.n > 0 ? '#006300' : '#b91c1c' }}>
          {delta.n > 0 ? '▲' : '▼'} {Math.abs(delta.n)} <span className="text-slate-400 font-semibold">{delta.texto}</span>
        </p>
      )}
      {extra && <p className="text-[10px] font-bold text-slate-400">{extra}</p>}
      {spark && spark.length > 1 && (
        <svg viewBox="0 0 84 22" className="mt-1 w-full max-w-[84px]" aria-hidden="true">
          {(() => {
            const min = Math.min(...spark), max = Math.max(...spark)
            const rng = Math.max(max - min, 1)
            const px = (i: number) => 2 + (i * 80) / (spark.length - 1)
            const py = (v: number) => 18 - ((v - min) / rng) * 14
            const d = spark.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
            const hoy = sparkHoy !== undefined && sparkHoy >= 0 ? sparkHoy : spark.length - 1
            return (
              <>
                <path d={d} fill="none" stroke="#c3c2b7" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
                <circle cx={px(hoy)} cy={py(spark[hoy])} r="2.5" fill={C_PRESENTE} stroke="white" strokeWidth="1.5"/>
              </>
            )
          })()}
        </svg>
      )}
    </div>
  )
}

/* ── Barra horizontal apilada: puntuales + tardanzas sobre el total, con
     separadores de 2px en color de superficie y extremo de dato redondeado. ── */
function FilaBarra({ fila, alta = false, onEnter, onLeave }: {
  fila: FilaStat
  alta?: boolean
  onEnter: (fila: FilaStat, e: React.MouseEvent) => void
  onLeave: () => void
}) {
  const asistieron = fila.presentes + fila.tardanzas
  const pct = fila.matriculados > 0 ? Math.round((asistieron / fila.matriculados) * 100) : 0
  const wP = fila.matriculados > 0 ? (fila.presentes / fila.matriculados) * 100 : 0
  const wT = fila.matriculados > 0 ? (fila.tardanzas / fila.matriculados) * 100 : 0
  const wR = Math.max(0, 100 - wP - wT)

  const segs: { w: number; c: string }[] = []
  if (wP > 0) segs.push({ w: wP, c: C_PRESENTE })
  if (wT > 0) segs.push({ w: wT, c: C_TARDANZA })
  if (wR > 0) segs.push({ w: wR, c: C_TRACK })

  return (
    <div className="group flex items-center gap-3"
      onMouseMove={e => onEnter(fila, e)} onMouseLeave={onLeave}>
      <div className="w-32 sm:w-40 shrink-0 text-right">
        <p className="text-[11px] font-black text-slate-600 leading-tight truncate">{fila.etiqueta}</p>
        {fila.sub && <p className="text-[10px] text-slate-400 font-semibold truncate">{fila.sub}</p>}
      </div>
      <div className={`flex-1 flex gap-[2px] ${alta ? 'h-5' : 'h-4'} transition-[filter] group-hover:brightness-[1.06]`}>
        {segs.map((s, i) => (
          <div key={i} className="h-full transition-all"
            style={{
              width: `${s.w}%`, background: s.c,
              borderRadius: i === 0
                ? (segs.length === 1 ? '2px 4px 4px 2px' : '2px 0 0 2px')
                : i === segs.length - 1 ? '0 4px 4px 0' : '1px',
            }}/>
        ))}
      </div>
      <div className="w-24 sm:w-28 shrink-0 text-[11px] font-black text-slate-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {asistieron}/{fila.matriculados} <span className="text-slate-400 font-bold">· {pct}%</span>
      </div>
    </div>
  )
}

/* ── Vista de tabla: la lectura equivalente sin color ── */
function TablaStats({ filas, cargando }: { filas: FilaStat[]; cargando: boolean }) {
  return (
    <div className="overflow-x-auto transition-opacity" style={{ opacity: cargando ? .55 : 1 }}>
      <table className="w-full text-[12px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-400"
            style={{ borderBottom: '1px solid #E4E8EF' }}>
            <th className="py-2 pr-3 font-black">Sección</th>
            <th className="py-2 px-3 font-black text-right">Matric.</th>
            <th className="py-2 px-3 font-black text-right">Puntuales</th>
            <th className="py-2 px-3 font-black text-right">Tardanzas</th>
            <th className="py-2 px-3 font-black text-right">Justif.</th>
            <th className="py-2 px-3 font-black text-right">Faltas</th>
            <th className="py-2 pl-3 font-black text-right">Asistencia</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => {
            const asis = f.presentes + f.tardanzas
            const faltas = Math.max(0, f.matriculados - asis - f.justificadas)
            const pct = f.matriculados > 0 ? Math.round((asis / f.matriculados) * 100) : 0
            return (
              <tr key={f.clave} className="text-slate-600" style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td className="py-1.5 pr-3 font-bold">{f.etiqueta}{f.sub ? <span className="text-slate-400 font-semibold"> · {f.sub}</span> : ''}</td>
                <td className="py-1.5 px-3 text-right">{f.matriculados}</td>
                <td className="py-1.5 px-3 text-right">{f.presentes}</td>
                <td className="py-1.5 px-3 text-right">{f.tardanzas}</td>
                <td className="py-1.5 px-3 text-right">{f.justificadas}</td>
                <td className="py-1.5 px-3 text-right">{faltas}</td>
                <td className="py-1.5 pl-3 text-right font-black">{pct}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminEstadisticasAsistenciaPage() {
  return <EstadisticasAsistenciaContent />
}
