'use client'

import { useCallback, useRef, useState } from 'react'

// Modal de confirmación reutilizable, basado en promesas:
//
//   const { confirmar, dialogo } = useConfirm()
//   ...
//   const res = await confirmar({
//     titulo: '¿Eliminar curso?',
//     mensaje: 'Las asignaciones asociadas quedarán sin curso.',
//     tono: 'peligro',
//     confirmarLabel: 'Eliminar',
//     input: { label: 'Motivo', requerido: true },   // opcional
//   })
//   if (!res) return            // cancelado
//   res.texto                   // lo escrito en el input (si se pidió)
//   ...
//   return <>{...página...}{dialogo}</>   // renderizar una vez por página

export interface ConfirmOpciones {
  titulo: string
  mensaje?: React.ReactNode
  confirmarLabel?: string
  cancelarLabel?: string
  /** peligro = rojo (borrar/baja) · advertencia = ámbar (cambios grandes) · primario = navy */
  tono?: 'peligro' | 'advertencia' | 'primario'
  input?: { label: string; placeholder?: string; requerido?: boolean }
}

export type ConfirmResultado = { texto: string } | false

const TONOS = {
  peligro:     { color: '#B91C1C', bg: '#FEF2F2', borde: '#FECACA', boton: '#DC2626' },
  advertencia: { color: '#B45309', bg: '#FFFBEB', borde: '#FDE68A', boton: '#D97706' },
  primario:    { color: '#0B2447', bg: '#EFF6FF', borde: '#DBEAFE', boton: '#0B2447' },
}

export function useConfirm() {
  const [opciones, setOpciones] = useState<ConfirmOpciones | null>(null)
  const [texto, setTexto] = useState('')
  const resolverRef = useRef<((r: ConfirmResultado) => void) | null>(null)

  const confirmar = useCallback((ops: ConfirmOpciones): Promise<ConfirmResultado> => {
    setTexto('')
    setOpciones(ops)
    return new Promise<ConfirmResultado>(resolve => { resolverRef.current = resolve })
  }, [])

  function cerrar(resultado: ConfirmResultado) {
    resolverRef.current?.(resultado)
    resolverRef.current = null
    setOpciones(null)
  }

  const dialogo = opciones ? (
    <ConfirmDialogo
      opciones={opciones}
      texto={texto}
      setTexto={setTexto}
      onCancelar={() => cerrar(false)}
      onConfirmar={() => cerrar({ texto: texto.trim() })}
    />
  ) : null

  return { confirmar, dialogo }
}

function ConfirmDialogo({
  opciones, texto, setTexto, onCancelar, onConfirmar,
}: {
  opciones: ConfirmOpciones
  texto: string
  setTexto: (v: string) => void
  onCancelar: () => void
  onConfirmar: () => void
}) {
  const t = TONOS[opciones.tono ?? 'primario']
  const inputInvalido = !!opciones.input?.requerido && !texto.trim()

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(11,36,71,.45)', backdropFilter: 'blur(2px)' }}
      onClick={onCancelar}>
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="h-1.5" style={{ background: t.boton }} />
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: t.bg, color: t.color, border: `1px solid ${t.borde}` }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-slate-900 leading-snug">{opciones.titulo}</h3>
              {opciones.mensaje && (
                <div className="text-[13px] text-slate-500 font-medium mt-1.5 leading-relaxed">
                  {opciones.mensaje}
                </div>
              )}
            </div>
          </div>

          {opciones.input && (
            <div className="mt-4">
              <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                {opciones.input.label}{opciones.input.requerido ? ' *' : ''}
              </label>
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder={opciones.input.placeholder ?? ''}
                rows={2}
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl border text-sm font-medium text-slate-800 outline-none resize-none focus:ring-2"
                style={{ borderColor: '#E4E8EF' }} />
            </div>
          )}

          <div className="flex gap-2.5 mt-5">
            <button onClick={onCancelar}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border bg-white hover:bg-slate-50 text-slate-600 transition-colors"
              style={{ borderColor: '#E4E8EF' }}>
              {opciones.cancelarLabel ?? 'Cancelar'}
            </button>
            <button onClick={onConfirmar} disabled={inputInvalido}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all active:scale-[.98] disabled:opacity-40"
              style={{ background: t.boton, boxShadow: `0 6px 18px ${t.boton}44` }}>
              {opciones.confirmarLabel ?? 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
