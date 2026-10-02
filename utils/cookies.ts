export function getCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  return document.cookie.split('; ').find(r => r.startsWith(name + '='))?.split('=')[1] ?? ''
}
