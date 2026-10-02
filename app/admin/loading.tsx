import Spinner from '@/components/Spinner'

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: '#f7f5f1' }}>
      <div className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-white"
        style={{ boxShadow: '0 16px 48px rgba(11,36,71,.08)', border: '1.5px solid #E4E8EF' }}>
        <Spinner cls="h-8 w-8 text-indigo-900" />
        <p className="text-slate-400 text-sm font-medium">Cargando...</p>
      </div>
    </div>
  )
}
