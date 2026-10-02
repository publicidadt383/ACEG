'use client'

import { useRouter } from 'next/navigation'
import PortalMenuFoto, { type MenuCard } from '@/components/PortalMenuFoto'
import { useAlumnoCtx } from './layout'

export default function AlumnoHomePage() {
  const router = useRouter()
  const { nombre, grado, grupo, nombreSalon, badges, handleLogout } = useAlumnoCtx()

  const cards: MenuCard[] = [
    {
      id: 'horario',
      label: 'Mi Horario',
      description: 'Tu horario semanal',
      onClick: () => router.push('/alumno/horario'),
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
      description: 'Materias y tareas',
      badge: badges['/alumno/cursos'] ?? null,
      onClick: () => router.push('/alumno/cursos'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
      ),
    },
    {
      id: 'tareas',
      label: 'Tareas',
      description: 'Entregas pendientes',
      onClick: () => router.push('/alumno/tareas'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
        </svg>
      ),
    },
    {
      id: 'calendario',
      label: 'Calendario',
      description: 'Tus eventos',
      onClick: () => router.push('/alumno/calendario'),
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
      label: 'Mi Asistencia',
      description: 'Registro y faltas',
      onClick: () => router.push('/alumno/asistencia'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
        </svg>
      ),
    },
    {
      id: 'anuncios',
      label: 'Anuncios',
      description: 'Comunicados',
      badge: badges['/alumno/anuncios'] ?? null,
      onClick: () => router.push('/alumno/anuncios'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
        </svg>
      ),
    },
    {
      id: 'mi-qr',
      label: 'Mi QR',
      description: 'Para marcar asistencia',
      onClick: () => router.push('/alumno/mi-qr'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
        </svg>
      ),
    },
    {
      id: 'examenes',
      label: 'Exámenes',
      description: 'Evaluaciones y notas',
      onClick: () => router.push('/alumno/examenes'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
        </svg>
      ),
    },
    {
      id: 'boletin',
      label: 'Mi Boletín',
      description: 'Calificaciones finales',
      onClick: () => router.push('/alumno/boletin'),
      icon: (
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
      ),
    },
  ]

  const sub = `${grado} ${grupo}${nombreSalon ? ' · ' + nombreSalon : ''}`

  return (
    <PortalMenuFoto
      title="Eduardo de Habich"
      subtitle="Portal Alumno"
      userName={nombre}
      userRoleLabel={sub}
      cards={cards}
      onLogout={handleLogout}
      accent="#0F766E"
      accent2="#14B8A6"
    />
  )
}
