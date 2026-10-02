// "dd/mm/yyyy" — calendarios y asistencia
export function formatFechaDMY(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// "3 ene" — panel asistencia docente
export function formatFechaCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${parseInt(d)} ${meses[parseInt(m) - 1]}`
}

// "lunes 3 de enero 2024" — panel asistencia docente
export function formatFechaConDia(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const dow   = new Date(y, m - 1, d).getDay()
  return `${dias[dow]} ${d} de ${meses[m - 1]} ${y}`
}

// "3 de enero de 2024" — admin asistencia
export function formatFechaEscrita(iso: string): string {
  const [y, m, d] = iso.split('-')
  const meses = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre']
  return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`
}

// "03 ene 2024, 02:30 p. m." con hora — tareas y cursos
export function formatFechaConHora(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// "03 enero 2024, 02:30 p. m." con mes largo y hora — tareas alumno detalle
export function formatFechaLong(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// "03 ene 2024" sin hora — lista tareas alumno
export function formatFechaMedia(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

// "YYYY-MM-DDTHH:mm" para inputs datetime-local
export function formatFechaInput(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

// "Ahora mismo" / "Hace N min" / "Hace N h" / "Hace N días" / "dd mmm aaaa"
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Ahora mismo'
  if (m < 60) return `Hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `Hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7)  return `Hace ${d} ${d === 1 ? 'día' : 'días'}`
  return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
}
