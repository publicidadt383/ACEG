// Constantes, helpers y componentes pequeños del panel admin (extraídos de page.tsx).
import type { Periodo } from './types'

export function displayDocente(d: { nombre: string; apellido?: string | null }): string {
  if (!d.apellido?.trim()) return d.nombre
  const ap = d.apellido.trim()
  const nombreLimpio = d.nombre.replace(ap, '').trim()
  return `${ap} ${nombreLimpio || d.nombre}`
}

function splitNombreCompleto(texto: string): string {
  const words = texto.trim().split(/\s+/)
  if (words.length >= 4) return `${words.slice(-2).join(' ')} ${words.slice(0, -2).join(' ')}`
  return texto
}

export function displayAlumno(a: { nombre: string; apellidos?: string | null; usuario?: string | null }): string {
  const ap = (a.apellidos ?? '').trim()
  const nm = (a.nombre ?? '').trim()

  if (ap && ap.split(/\s+/).length <= 3) return `${ap} ${nm}`.trim()

  if (ap && ap.split(/\s+/).length >= 4) return splitNombreCompleto(ap)

  // apellidos vacío → trabajar con nombre
  if (nm) {
    // Intentar usando usuario para detectar el corte
    if (a.usuario?.includes('.')) {
      const nmUp = nm.toUpperCase()
      for (const part of a.usuario.split('.')) {
        const pos = nmUp.indexOf(part.toUpperCase())
        if (pos > 1) return `${nm.substring(pos).trim()} ${nm.substring(0, pos).trim()}`
      }
    }
    return splitNombreCompleto(nm)
  }

  return ap || nm
}

export const PAGE_DOCENTES = 20

export const COLORES_CURSO = [
  '#143875','#143875','#ec4899','#f43f5e','#f97316',
  '#eab308','#22c55e','#06b6d4','#3b82f6','#64748b',
  '#a855f7','#14b8a6','#ef4444','#f59e0b','#84cc16',
  '#0ea5e9','#e11d48','#d97706','#10b981','#0B2447',
]

export const PERIODOS_DEFAULT: Periodo[] = [
  { id: 'p1', nombre: '1ra hora', inicio: '07:45', fin: '08:30', tipo: 'hora' },
  { id: 'p2', nombre: '2da hora', inicio: '08:30', fin: '09:15', tipo: 'hora' },
  { id: 'p3', nombre: '3ra hora', inicio: '09:15', fin: '10:00', tipo: 'hora' },
  { id: 'r1', nombre: 'Recreo',   inicio: '10:00', fin: '10:20', tipo: 'recreo' },
  { id: 'p4', nombre: '4ta hora', inicio: '10:20', fin: '11:05', tipo: 'hora' },
  { id: 'p5', nombre: '5ta hora', inicio: '11:05', fin: '11:50', tipo: 'hora' },
  { id: 'p6', nombre: '6ta hora', inicio: '11:50', fin: '12:35', tipo: 'hora' },
]
export const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes'] as const

export const GRADOS = [
  '1° Ciclo Cocina','2° Ciclo Cocina','3° Ciclo Cocina','4° Ciclo Cocina',
  '1° Ciclo Pastelería','2° Ciclo Pastelería',
]
export const GRUPOS = ['A','B','C','D','E','F']

export const inputCls = 'w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-300 outline-none transition-all bg-slate-50 border border-slate-200 focus:border-indigo-900 focus:ring-2 focus:ring-indigo-100 focus:bg-white'
export const selectCls = 'w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-800 outline-none transition-all bg-slate-50 border border-slate-200 focus:border-indigo-900 focus:ring-2 focus:ring-indigo-100'
export const labelCls  = 'block text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1.5'

export function fechaHoyLima() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}
export function rangoDia(f: string) {
  return {
    start: new Date(`${f}T00:00:00-05:00`).toISOString(),
    end:   new Date(`${f}T23:59:59.999-05:00`).toISOString(),
  }
}
export function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-PE', {
    timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit',
  })
}
export function diaSemanaDesde(fecha: string): string | null {
  const d = new Date(`${fecha}T12:00:00`)
  const idx = d.getDay()
  const mapa: Record<number, string> = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes' }
  return mapa[idx] ?? null
}
export function calcularMinutosTarde(horaEntradaISO: string, horaEsperada: string, fecha: string): number {
  const entrada = new Date(horaEntradaISO)
  const esperada = new Date(`${fecha}T${horaEsperada}:00-05:00`)
  return Math.round((entrada.getTime() - esperada.getTime()) / 60000)
}

export function Avatar({ name, color = 'indigo' }: { name: string; color?: 'indigo' | 'violet' | 'emerald' }) {
  const styles = {
    indigo:  { bg: '#F1F5F9', text: '#0B2447', border: '#fecdd3' },
    violet:  { bg: '#f5f3ff', text: '#0B2447', border: '#ddd6fe' },
    emerald: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  }
  const s = styles[color]
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm"
      style={{ background: s.bg, border: `1.5px solid ${s.border}`, color: s.text }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
