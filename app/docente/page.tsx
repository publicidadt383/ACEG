'use client'

import { useRouter } from 'next/navigation'
import PortalMenuFoto, { type MenuCard } from '@/components/PortalMenuFoto'
import { useDocenteCtx } from './layout'

export default function DocenteHomePage() {
  const router = useRouter()
  const { nombre, badges, handleLogout, simulando } = useDocenteCtx()

  const cards: MenuCard[] = [
    {
      id: 'horario',
      label: 'Mi Horario',
      description: 'Tu horario semanal',
      onClick: () => router.push('/docente/horario'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
    },
    {
      id: 'cursos',
      label: 'Mis Cursos',
      description: 'Unidades, sesiones y tareas',
      badge: badges['/docente/cursos'] ?? null,
      onClick: () => router.push('/docente/cursos'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
      ),
    },
    {
      id: 'calendario',
      label: 'Calendario',
      description: 'Eventos y entregas',
      onClick: () => router.push('/docente/calendario'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <line x1="8" y1="14" x2="8" y2="14" strokeLinecap="round" strokeWidth="2.5"/>
          <line x1="12" y1="14" x2="12" y2="14" strokeLinecap="round" strokeWidth="2.5"/>
          <line x1="16" y1="18" x2="16" y2="18" strokeLinecap="round" strokeWidth="2.5"/>
        </svg>
      ),
    },
    {
      id: 'asistencia',
      label: 'Asistencia',
      description: 'Marca y reportes',
      onClick: () => router.push('/docente/asistencia'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
        </svg>
      ),
    },
    {
      id: 'anuncios',
      label: 'Anuncios',
      description: 'Comunicación con estudiantes',
      onClick: () => router.push('/docente/anuncios'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
        </svg>
      ),
    },
    {
      id: 'examenes',
      label: 'Exámenes',
      description: 'Notas y evaluaciones',
      onClick: () => router.push('/docente/examenes'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
        </svg>
      ),
    },
    {
      id: 'planificacion',
      label: 'Planificación',
      description: 'Plantillas de tus bimestres',
      onClick: () => router.push('/docente/planificacion'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
      ),
    },
    {
      id: 'escaner',
      label: 'Mi Asistencia',
      description: 'Marcar entrada/salida',
      onClick: () => router.push('/escanear'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
      ),
    },
  ]

  return (
    <PortalMenuFoto
      title="ACEG"
      subtitle="Portal Docente"
      userName={nombre}
      userRoleLabel="Docente"
      cards={cards}
      onLogout={handleLogout}
      showCambiarPassword={!simulando}
      accent="#0B2447"
      accent2="#1E40AF"
    />
  )
}
