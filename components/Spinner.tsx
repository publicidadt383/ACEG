export default function Spinner({
  size = 14,
  color,
  cls,
}: {
  size?: number
  color?: string
  cls?: string
}) {
  if (cls) {
    return (
      <svg className={`animate-spin ${cls}`} viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    )
  }
  return (
    <svg
      className="animate-spin shrink-0"
      style={{ width: size, height: size, ...(color ? { color } : {}) }}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  )
}
