import Spinner from '@/components/Spinner'

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: '#F6F8FB' }}>
      <Spinner cls="h-8 w-8" />
    </div>
  )
}
