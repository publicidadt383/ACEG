import Spinner from '@/components/Spinner'

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F6F8FB' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <Spinner size={40} color="#0B2447" />
        <p style={{ color: '#94A3B8', fontSize: '10px', fontWeight: 700, letterSpacing: '.18em' }}>
          CARGANDO
        </p>
      </div>
    </div>
  )
}
