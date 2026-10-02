'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCicloActivo } from '@/lib/ciclo'
import { getSesionDocente } from '@/lib/auth'
import { useConfirm } from '@/components/ConfirmModal'
import {
  TIPOS_SEMANA, FLUJO_CFG, metricasPlantilla, rangoSemana,
  type EstadoPlantilla, type TipoSemana,
} from '@/lib/planificacion'

// ── Tipos ──────────────────────────────────────────────────────────────────
interface Bimestre {
  id: string
  nombre: string
  anio: number
  periodo: number
  fecha_inicio: string | null
  fecha_fin: string | null
  semanas: number
}
interface CursoGrado { cursoId: string; curso: string; color: string; grado: string }
interface Plantilla {
  id: string
  curso_id: string
  grado: string
  ciclo_id: string
  situacion_significativa: string | null
  estado: EstadoPlantilla
}
interface PlantillaSesion {
  id: string
  plantilla_id: string
  semana: number
  titulo: string
  descripcion: string | null
  tipo: TipoSemana
  objetivo_id: string | null
}
interface PlanAnual { id: string; curso_id: string; grado: string; anio: number }
interface PlanObjetivo { id: string; plan_id: string; orden: number; texto: string }

const NAVY  = '#0B2447'
const NAVY2 = '#1E3A8A'

export default function DocentePlanificacionPage() {
  const router = useRouter()
  const { confirmar, dialogo } = useConfirm()

  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState<number>(new Date().getFullYear())
  const [cursoGrados, setCursoGrados] = useState<CursoGrado[]>([])
  const [bimestres, setBimestres] = useState<Bimestre[]>([])
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [sesiones, setSesiones] = useState<PlantillaSesion[]>([])
  const [planes, setPlanes] = useState<PlanAnual[]>([])
  const [objetivos, setObjetivos] = useState<PlanObjetivo[]>([])

  const [sel, setSel] = useState<{ cg: CursoGrado; bimestre: Bimestre } | null>(null)
  const [toast, setToast] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    async function init() {
      const sesion = await getSesionDocente()
      if (!sesion) { router.push('/login'); return }
      const uid = sesion.uid

      const ciclo = await getCicloActivo()
      let asigsQ = supabase
        .from('asignaciones')
        .select('curso_id, grado, anio, cursos(nombre, color)')
        .eq('docente_id', uid)
      if (ciclo?.id) asigsQ = asigsQ.eq('ciclo_id', ciclo.id)
      const { data: asigs } = await asigsQ

      type AsigRow = { curso_id: string; grado: string; anio: number; cursos: { nombre: string; color: string } | null }
      const rows = (asigs ?? []) as unknown as AsigRow[]
      const anioActual = rows[0]?.anio ?? new Date().getFullYear()
      setAnio(anioActual)

      const vistos = new Set<string>()
      const cgs: CursoGrado[] = []
      for (const a of rows) {
        const key = `${a.curso_id}|${a.grado}`
        if (vistos.has(key)) continue
        vistos.add(key)
        cgs.push({ cursoId: a.curso_id, curso: a.cursos?.nombre ?? 'Curso', color: a.cursos?.color ?? NAVY, grado: a.grado })
      }
      cgs.sort((a, b) => a.curso.localeCompare(b.curso) || a.grado.localeCompare(b.grado))
      setCursoGrados(cgs)

      await recargar(anioActual, cgs)
      setLoading(false)
    }
    init()
  }, [router])

  async function recargar(anioActual: number, cgs: CursoGrado[]) {
    const { data: bs } = await supabase
      .from('ciclos')
      .select('id,nombre,anio,periodo,fecha_inicio,fecha_fin,semanas')
      .eq('anio', anioActual)
      .eq('tipo', 'bimestre')
      .order('periodo')
    const bims = (bs ?? []) as Bimestre[]
    setBimestres(bims)

    const cursoIds = [...new Set(cgs.map(c => c.cursoId))]
    const grados   = [...new Set(cgs.map(c => c.grado))]
    if (!cursoIds.length || !bims.length) { setPlantillas([]); setSesiones([]); setPlanes([]); setObjetivos([]); return }

    const [{ data: ps }, { data: pa }] = await Promise.all([
      supabase.from('plantillas_curso')
        .select('id,curso_id,grado,ciclo_id,situacion_significativa,estado')
        .in('curso_id', cursoIds).in('grado', grados)
        .in('ciclo_id', bims.map(b => b.id)),
      supabase.from('planes_anuales')
        .select('id,curso_id,grado,anio')
        .in('curso_id', cursoIds).in('grado', grados)
        .eq('anio', anioActual),
    ])
    // .in() por separado puede traer pares curso×grado ajenos; filtra a los propios.
    const propios = new Set(cgs.map(c => `${c.cursoId}|${c.grado}`))
    const plas = ((ps ?? []) as Plantilla[]).filter(p => propios.has(`${p.curso_id}|${p.grado}`))
    setPlantillas(plas)
    const plans = ((pa ?? []) as PlanAnual[]).filter(p => propios.has(`${p.curso_id}|${p.grado}`))
    setPlanes(plans)

    const [ss, objs] = await Promise.all([
      plas.length
        ? supabase.from('plantilla_sesiones')
            .select('id,plantilla_id,semana,titulo,descripcion,tipo,objetivo_id')
            .in('plantilla_id', plas.map(p => p.id))
            .order('semana')
            .then(r => (r.data ?? []) as PlantillaSesion[])
        : Promise.resolve([] as PlantillaSesion[]),
      plans.length
        ? supabase.from('plan_anual_objetivos')
            .select('id,plan_id,orden,texto')
            .in('plan_id', plans.map(p => p.id))
            .order('orden')
            .then(r => (r.data ?? []) as PlanObjetivo[])
        : Promise.resolve([] as PlanObjetivo[]),
    ])
    setSesiones(ss)
    setObjetivos(objs)
  }

  const plantillaPorClave = useMemo(() => {
    const m = new Map<string, Plantilla>()
    for (const p of plantillas) m.set(`${p.curso_id}|${p.grado}|${p.ciclo_id}`, p)
    return m
  }, [plantillas])

  const sesionesPorPlantilla = useMemo(() => {
    const m = new Map<string, PlantillaSesion[]>()
    for (const s of sesiones) {
      const arr = m.get(s.plantilla_id) ?? []
      arr.push(s); m.set(s.plantilla_id, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.semana - b.semana)
    return m
  }, [sesiones])

  const objetivosDe = (cg: CursoGrado) => {
    const plan = planes.find(p => p.curso_id === cg.cursoId && p.grado === cg.grado)
    return plan ? objetivos.filter(o => o.plan_id === plan.id) : []
  }

  // ── Acciones ─────────────────────────────────────────────────────────────
  async function abrirEditor(cg: CursoGrado, bimestre: Bimestre) {
    const key = `${cg.cursoId}|${cg.grado}|${bimestre.id}`
    let plantilla = plantillaPorClave.get(key) ?? null

    // Si el bimestre aún no tiene plantilla, el docente puede crearla en borrador
    if (!plantilla) {
      const { data: p, error } = await supabase
        .from('plantillas_curso')
        .insert({ curso_id: cg.cursoId, grado: cg.grado, ciclo_id: bimestre.id })
        .select('id,curso_id,grado,ciclo_id,situacion_significativa,estado')
        .single()
      if (error || !p) { setToast({ tipo: 'err', texto: error?.message ?? 'No se pudo crear la plantilla' }); return }
      plantilla = p as Plantilla
      const rows = Array.from({ length: bimestre.semanas || 10 }).map((_, i) => ({
        plantilla_id: plantilla!.id, semana: i + 1, titulo: `Semana ${i + 1}`, descripcion: '',
      }))
      const { error: errSes } = await supabase.from('plantilla_sesiones').insert(rows)
      if (errSes) { setToast({ tipo: 'err', texto: `Plantilla creada pero sin semanas: ${errSes.message}` }) }
      await recargar(anio, cursoGrados)
    }
    setSel({ cg, bimestre })
  }

  async function actualizarSesion(id: string, patch: Partial<PlantillaSesion>) {
    setSesiones(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
    const { error } = await supabase.from('plantilla_sesiones').update(patch).eq('id', id)
    if (error) setToast({ tipo: 'err', texto: error.message })
  }

  async function actualizarPlantilla(id: string, patch: Partial<Plantilla>) {
    setPlantillas(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    const { error } = await supabase.from('plantillas_curso').update(patch).eq('id', id)
    if (error) setToast({ tipo: 'err', texto: error.message })
  }

  async function agregarSemana(plantilla: Plantilla) {
    const actuales = sesionesPorPlantilla.get(plantilla.id) ?? []
    const siguiente = (actuales[actuales.length - 1]?.semana ?? 0) + 1
    const { data, error } = await supabase.from('plantilla_sesiones')
      .insert({ plantilla_id: plantilla.id, semana: siguiente, titulo: `Semana ${siguiente}`, descripcion: '' })
      .select('id,plantilla_id,semana,titulo,descripcion,tipo,objetivo_id')
      .single()
    if (error || !data) { setToast({ tipo: 'err', texto: error?.message ?? 'No se pudo añadir la semana' }); return }
    setSesiones(prev => [...prev, data as PlantillaSesion])
  }

  async function quitarSemana(s: PlantillaSesion) {
    const ok = await confirmar({
      titulo: `¿Quitar la semana ${s.semana}?`,
      mensaje: 'Se elimina de la plantilla. Las sesiones ya sembradas en tus cursos no se tocan.',
      tono: 'peligro',
      confirmarLabel: 'Quitar',
    })
    if (!ok) return
    const { error } = await supabase.from('plantilla_sesiones').delete().eq('id', s.id)
    if (error) { setToast({ tipo: 'err', texto: error.message }); return }
    setSesiones(prev => prev.filter(x => x.id !== s.id))
  }

  async function enviarARevision(plantilla: Plantilla) {
    const ok = await confirmar({
      titulo: 'Enviar a revisión',
      mensaje: 'El administrador revisará tu plantilla y la publicará. Podrás seguir editándola mientras no esté publicada.',
      tono: 'primario',
      confirmarLabel: 'Enviar',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      const { error } = await supabase.from('plantillas_curso').update({ estado: 'revision' }).eq('id', plantilla.id)
      if (error) throw error
      setPlantillas(prev => prev.map(p => p.id === plantilla.id ? { ...p, estado: 'revision' } : p))
      setToast({ tipo: 'ok', texto: 'Plantilla enviada a revisión.' })
    } catch (e: unknown) {
      setToast({ tipo: 'err', texto: e instanceof Error ? e.message : 'Error desconocido' })
    } finally { setTrabajando(false) }
  }

  async function volverABorrador(plantilla: Plantilla) {
    const { error } = await supabase.from('plantillas_curso').update({ estado: 'borrador' }).eq('id', plantilla.id)
    if (error) { setToast({ tipo: 'err', texto: error.message }); return }
    setPlantillas(prev => prev.map(p => p.id === plantilla.id ? { ...p, estado: 'borrador' } : p))
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
        Cargando planificación…
      </div>
    )
  }

  const plantillaSel = sel ? plantillaPorClave.get(`${sel.cg.cursoId}|${sel.cg.grado}|${sel.bimestre.id}`) ?? null : null
  const sesionesSel = plantillaSel ? (sesionesPorPlantilla.get(plantillaSel.id) ?? []) : []
  const editable = !!plantillaSel && plantillaSel.estado !== 'publicada'
  const objetivosCG = sel ? objetivosDe(sel.cg) : []

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: '#1a0305', letterSpacing: '-.02em', lineHeight: 1.1 }}>
          Planificación
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 6, fontWeight: 500 }}>
          Redacta la plantilla de semanas de tus cursos por bimestre y envíala a revisión.
          El administrador la publica y siembra las sesiones.
        </p>
      </div>

      {toast && (
        <div className="px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-between gap-3 mb-4"
          style={{
            background: toast.tipo === 'ok' ? '#ECFDF5' : '#FEF2F2',
            color: toast.tipo === 'ok' ? '#065F46' : '#991B1B',
            border: `1px solid ${toast.tipo === 'ok' ? '#A7F3D0' : '#FECACA'}`,
          }}>
          <span>{toast.texto}</span>
          <button onClick={() => setToast(null)} className="text-xs">✕</button>
        </div>
      )}

      {!sel ? (
        // ── Lista: curso×grado con tiles por bimestre ─────────────────────
        bimestres.length === 0 ? (
          <div className="rounded-2xl border bg-white p-10 text-center" style={{ borderColor: '#E4E8EF' }}>
            <p className="text-sm text-slate-500">
              Aún no hay bimestres definidos para {anio}. Pide al administrador que cree el calendario en Planificación.
            </p>
          </div>
        ) : cursoGrados.length === 0 ? (
          <div className="rounded-2xl border bg-white p-10 text-center" style={{ borderColor: '#E4E8EF' }}>
            <p className="text-sm text-slate-500">No tienes cursos asignados este ciclo.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cursoGrados.map(cg => (
              <div key={`${cg.cursoId}|${cg.grado}`}
                className="rounded-2xl overflow-hidden flex"
                style={{ background: 'white', border: '1px solid #E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
                <div className="w-1.5 shrink-0" style={{ background: cg.color }} />
                <div className="flex-1 min-w-0 p-5">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <h3 className="text-base font-black" style={{ color: NAVY }}>{cg.curso}</h3>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
                      style={{ background: '#F1F5F9', color: '#475569' }}>{cg.grado}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                    {bimestres.map(b => {
                      const p = plantillaPorClave.get(`${cg.cursoId}|${cg.grado}|${b.id}`)
                      const ses = p ? (sesionesPorPlantilla.get(p.id) ?? []) : []
                      const m = metricasPlantilla(ses)
                      const flujo = p ? FLUJO_CFG[p.estado] : null
                      return (
                        <button key={b.id} onClick={() => abrirEditor(cg, b)}
                          className="text-left rounded-xl p-3.5 transition-all hover:-translate-y-0.5 bg-white"
                          style={{ border: '1px solid #E4E8EF', boxShadow: '0 1px 3px rgba(15,23,42,.04)' }}>
                          <div className="flex items-center justify-between mb-1.5 gap-1">
                            <span className="font-black text-[13px]" style={{ color: NAVY }}>{b.nombre}</span>
                            {flujo ? (
                              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md"
                                style={{ background: flujo.bg, color: flujo.color }}>{flujo.t}</span>
                            ) : (
                              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md"
                                style={{ background: '#F1F5F9', color: '#64748B' }}>CREAR</span>
                            )}
                          </div>
                          <p className="text-[11px] font-bold text-slate-500">
                            {p ? `${m.personalizadas}/${m.cant} semanas con título · ${m.evaluaciones} eval` : 'Sin plantilla todavía'}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        // ── Editor del bimestre ────────────────────────────────────────────
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => setSel(null)}
              className="px-3 py-2 rounded-xl text-xs font-bold border bg-white hover:bg-slate-50"
              style={{ borderColor: '#E4E8EF', color: NAVY }}>
              ← Mis plantillas
            </button>
            {plantillaSel && editable && (
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => agregarSemana(plantillaSel)}
                  className="px-3 py-2 rounded-xl text-xs font-bold border bg-white hover:bg-slate-50"
                  style={{ borderColor: '#E4E8EF', color: NAVY }}>
                  + Añadir semana
                </button>
                {plantillaSel.estado === 'borrador' ? (
                  <button onClick={() => enviarARevision(plantillaSel)} disabled={trabajando}
                    className="px-4 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-50"
                    style={{ background: `linear-gradient(135deg,${NAVY},${NAVY2})`, boxShadow: '0 4px 14px rgba(11,36,71,.22)' }}>
                    Enviar a revisión
                  </button>
                ) : (
                  <button onClick={() => volverABorrador(plantillaSel)} disabled={trabajando}
                    className="px-3 py-2 rounded-xl text-xs font-bold border bg-white hover:bg-slate-50 disabled:opacity-50"
                    style={{ borderColor: '#E4E8EF', color: NAVY }}>
                    Volver a borrador
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl overflow-hidden flex"
            style={{ background: 'white', border: '1px solid #E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
            <div className="w-1.5 shrink-0" style={{ background: sel.cg.color }} />
            <div className="flex-1 min-w-0 p-5">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h2 className="text-lg font-black" style={{ color: NAVY }}>{sel.cg.curso}</h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
                  style={{ background: '#F1F5F9', color: '#475569' }}>{sel.cg.grado}</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
                  style={{ background: '#EFF6FF', color: NAVY, border: '1px solid #DBEAFE' }}>{sel.bimestre.nombre}</span>
                {plantillaSel && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
                    style={{ background: FLUJO_CFG[plantillaSel.estado].bg, color: FLUJO_CFG[plantillaSel.estado].color }}>
                    {FLUJO_CFG[plantillaSel.estado].t}
                  </span>
                )}
              </div>
              {plantillaSel?.estado === 'publicada' ? (
                <p className="text-xs leading-relaxed font-bold" style={{ color: '#075985' }}>
                  Esta plantilla ya fue publicada por el administrador: las sesiones están sembradas en tus cursos
                  y aquí ya no se edita. Si necesitas cambios, pide al administrador que la reabra.
                </p>
              ) : (
                <p className="text-xs text-slate-500 leading-relaxed">
                  Escribe el título y descripción de cada semana. Cuando esté lista, envíala a revisión:
                  el administrador la publicará y las sesiones se sembrarán en tus cursos.
                </p>
              )}

              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 mt-4">
                Situación significativa del bimestre
              </label>
              <textarea
                key={`ss-${plantillaSel?.id ?? 'none'}`}
                defaultValue={plantillaSel?.situacion_significativa ?? ''}
                disabled={!editable}
                onBlur={e => {
                  if (!plantillaSel) return
                  const v = e.target.value
                  if (v !== (plantillaSel.situacion_significativa ?? '')) {
                    actualizarPlantilla(plantillaSel.id, { situacion_significativa: v || null })
                  }
                }}
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl border text-sm bg-white resize-y disabled:bg-slate-50 disabled:text-slate-400"
                style={{ borderColor: '#E4E8EF', lineHeight: 1.5 }}
                placeholder="Contexto o experiencia que da sentido a la unidad y conecta el aprendizaje con la realidad del estudiante…" />
            </div>
          </div>

          <div className="space-y-3">
            {sesionesSel.map(s => {
              const rango = rangoSemana(sel.bimestre.fecha_inicio, s.semana)
              return (
                <div key={s.id} className="rounded-2xl border bg-white p-5"
                  style={{ borderColor: '#E4E8EF', boxShadow: '0 4px 20px rgba(11,36,71,.05)' }}>
                  <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase"
                        style={{ background: `linear-gradient(135deg,${NAVY},${NAVY2})`, color: 'white' }}>
                        Semana {s.semana}
                      </span>
                      {rango && <span className="text-[11px] font-bold text-slate-500">{rango}</span>}
                      <div className="flex items-center gap-1">
                        {TIPOS_SEMANA.map(t => {
                          const activo = (s.tipo ?? 'clase') === t.v
                          return (
                            <button key={t.v} disabled={!editable}
                              onClick={() => { if (!activo) actualizarSesion(s.id, { tipo: t.v }) }}
                              className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:cursor-not-allowed"
                              style={activo
                                ? { background: t.bg, color: t.color, border: `1px solid ${t.borde}` }
                                : { background: 'white', color: '#94A3B8', border: '1px solid #F1F5F9' }}>
                              {t.t}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {editable && (
                      <button onClick={() => quitarSemana(s)}
                        className="px-2 py-1.5 rounded-lg text-[11px] font-bold border bg-white hover:bg-red-50"
                        style={{ borderColor: '#FECACA', color: '#991B1B' }}>
                        Quitar
                      </button>
                    )}
                  </div>

                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                    Título de la sesión
                  </label>
                  <input defaultValue={s.titulo} disabled={!editable}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.titulo) actualizarSesion(s.id, { titulo: v }) }}
                    className="w-full px-3 py-2.5 rounded-xl border bg-white font-bold mb-4 disabled:bg-slate-50 disabled:text-slate-400"
                    style={{ borderColor: '#E4E8EF', color: NAVY, fontSize: 15 }}
                    placeholder="Ej: Introducción a las fracciones" />

                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                    Descripción de la clase
                  </label>
                  <textarea defaultValue={s.descripcion ?? ''} disabled={!editable}
                    onBlur={e => { const v = e.target.value; if (v !== (s.descripcion ?? '')) actualizarSesion(s.id, { descripcion: v }) }}
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm bg-white resize-y disabled:bg-slate-50 disabled:text-slate-400"
                    style={{ borderColor: '#E4E8EF', lineHeight: 1.5 }}
                    placeholder="¿De qué trata la clase? Tema, actividades, materiales…" />

                  {objetivosCG.length > 0 && (
                    <>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 mt-4">
                        Objetivo del año que trabaja esta semana
                      </label>
                      <select value={s.objetivo_id ?? ''} disabled={!editable}
                        onChange={e => actualizarSesion(s.id, { objetivo_id: e.target.value || null })}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm bg-white font-semibold disabled:bg-slate-50 disabled:text-slate-400"
                        style={{ borderColor: '#E4E8EF', color: s.objetivo_id ? NAVY : '#94a3b8' }}>
                        <option value="">— Sin vincular —</option>
                        {objetivosCG.map(o => (
                          <option key={o.id} value={o.id}>{o.orden}. {o.texto || '(objetivo sin texto)'}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {dialogo}
    </div>
  )
}
