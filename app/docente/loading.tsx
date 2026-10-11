import Spinner from '@/components/Spinner'

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F5F4' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <Spinner size={40} color="#1D1815" />
        <p style={{ color: '#8B837E', fontSize: '10px', fontWeight: 700, letterSpacing: '.18em' }}>
          CARGANDO
        </p>
      </div>
    </div>
  )
}
