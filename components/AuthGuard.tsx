'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Rutas que exigen sesión. Solo desde estas se redirige al login: así un
// visitante en la landing pública (/), /padres o /login no se ve afectado.
const PROTEGIDAS = ['/admin', '/docente', '/alumno', '/escanear']

export default function AuthGuard() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    const irAlLogin = () => {
      if (cancelled) return
      const path = window.location.pathname
      if (PROTEGIDAS.some(p => path.startsWith(p))) router.replace('/login')
    }

    const limpiarYSalir = async () => {
      // scope 'local': borra el token muerto de este navegador sin llamar al
      // server (que ya lo rechazó) y evita que el auto-refresh siga fallando.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
      irAlLogin()
    }

    // Al cargar: si hay una sesión guardada, confírmala contra el servidor.
    // getSession() solo lee localStorage (no valida); getUser() sí pega al
    // backend, así que detecta el refresh token revocado (p. ej. tras cambiar
    // la contraseña) y evita el AuthApiError colgado en consola.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session) return          // visitante sin sesión → nada que hacer
      supabase.auth.getUser().then(({ error }) => {
        if (!cancelled && error) limpiarYSalir()  // sesión guardada pero inválida
      })
    })

    // Cambios en vivo: auth-js emite SIGNED_OUT cuando el auto-refresh falla
    // (_removeSession) o cuando se cierra sesión en otra pestaña.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') irAlLogin()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [router])

  return null
}
