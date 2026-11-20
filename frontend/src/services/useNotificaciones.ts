import { useEffect, useState } from 'react'
import {
  EVENTO_NOTIFICACIONES, listarNotificaciones,
  type CambioNotificaciones, type Notificacion,
} from './notificaciones'

function aplicarCambio(notificaciones: Notificacion[], cambio: CambioNotificaciones) {
  if ('eliminada' in cambio) return notificaciones.filter(n => n.id !== cambio.eliminada)
  const leidas = new Set(cambio.leidas)
  return notificaciones.map(n => leidas.has(n.id) ? { ...n, read: true } : n)
}

export function useNotificaciones(usuario?: string) {
  const [notifications, setNotifications] = useState<Notificacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    let cambiosPendientes: CambioNotificaciones[] | null = []
    const actualizar = (event: Event) => {
      const cambio = (event as CustomEvent<CambioNotificaciones>).detail
      cambiosPendientes?.push(cambio)
      setNotifications(lista => aplicarCambio(lista, cambio))
    }

    setCargando(true)
    setNotifications([])
    setError('')
    window.addEventListener(EVENTO_NOTIFICACIONES, actualizar)
    listarNotificaciones()
      .then(lista => {
        if (activo) setNotifications((cambiosPendientes ?? []).reduce(aplicarCambio, lista))
      })
      .catch(() => {
        if (activo) setError('No se pudieron cargar las notificaciones.')
      })
      .finally(() => {
        cambiosPendientes = null
        if (activo) setCargando(false)
      })

    return () => {
      activo = false
      window.removeEventListener(EVENTO_NOTIFICACIONES, actualizar)
    }
  }, [usuario])

  return { notifications, cargando, error }
}
