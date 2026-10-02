import { NextRequest, NextResponse } from 'next/server'

// Rutas protegidas y el rol que las puede ver
const RUTAS: { prefix: string; rol: string; fallback: string }[] = [
  { prefix: '/admin',   rol: 'admin',   fallback: '/login' },
  { prefix: '/docente', rol: 'docente', fallback: '/login' },
  { prefix: '/alumno',  rol: 'alumno',  fallback: '/login' },
  { prefix: '/escanear',rol: 'docente', fallback: '/login' },
]

// Destino por defecto según rol (para redirigir si acceden a ruta equivocada)
const INICIO: Record<string, string> = {
  admin:          '/admin',
  docente:        '/docente',
  alumno:         '/alumno',
  administrativo: '/admin',
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const rol = request.cookies.get('habich-rol')?.value ?? ''

  const ruta = RUTAS.find(r => pathname.startsWith(r.prefix))
  if (!ruta) return NextResponse.next()

  // Sin cookie → al login
  if (!rol) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Rol incorrecto → redirige a su propio portal
  if (rol !== ruta.rol) {
    // admin y administrativo pueden acceder a /escanear
    if ((rol === 'admin' || rol === 'administrativo') && pathname.startsWith('/escanear')) return NextResponse.next()
    // administrativo entra al panel /admin (la propia página filtra los módulos permitidos)
    if (rol === 'administrativo' && pathname.startsWith('/admin')) return NextResponse.next()
    // admin puede simular /docente
    if (rol === 'admin' && pathname.startsWith('/docente')) {
      const simular = request.cookies.get('habich-simular')?.value ?? ''
      if (simular) return NextResponse.next()
    }

    const url = request.nextUrl.clone()
    url.pathname = INICIO[rol] ?? '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/docente/:path*', '/alumno/:path*', '/escanear/:path*'],
}
