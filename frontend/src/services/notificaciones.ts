import { apiFetch } from '@/services/api'
import { historialDisparos, type DisparoAlerta } from '@/services/alertas'

export interface Notificacion {
  id: number
  title: string
  message: string
  time: string
  read: boolean
}

export type CambioNotificaciones = { leidas: number[] } | { eliminada: number }
export const EVENTO_NOTIFICACIONES = 'notificaciones:actualizadas'

export async function marcarNotificacionesLeidas(ids: number[]) {
  if (!ids.length) return
  await apiFetch('/alertas/historial/leer/', {
    method: 'PATCH',
    body: JSON.stringify({ ids }),
  })
  publicar({ leidas: ids })
}

export async function eliminarNotificacion(id: number) {
  await apiFetch(`/alertas/historial/${id}/`, { method: 'DELETE' })
  publicar({ eliminada: id })
}

function publicar(cambio: CambioNotificaciones) {
  window.dispatchEvent(new CustomEvent(EVENTO_NOTIFICACIONES, { detail: cambio }))
}

function aNotificacion(d: DisparoAlerta): Notificacion {
  return {
    id: d.id,
    title: `Alerta ejecutada: ${d.moneda_codigo}/PYG`,
    message: `La tasa ${d.direccion === 'supera' ? 'alcanzó o superó' : 'bajó hasta'} ${d.tasa_alcanzada} (umbral ${d.umbral}).`,
    time: new Date(d.creado).toLocaleString(),
    read: d.leido,
  }
}

function estadoAnterior(clave: string) {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(clave) ?? '[]')
    return new Set(Array.isArray(ids) ? ids.filter(id => Number.isInteger(id)) : [])
  } catch {
    return new Set<number>()
  }
}

export async function listarNotificaciones(): Promise<Notificacion[]> {
  const historial = await historialDisparos()
  const leidas = estadoAnterior('alertasLeidas')
  const eliminadas = estadoAnterior('alertasEliminadas')
  const pendientes = historial.filter(d => !d.eliminado)
  const idsLeidos = pendientes.filter(d => !d.leido && leidas.has(d.id)).map(d => d.id)
  const idsEliminados = pendientes.filter(d => eliminadas.has(d.id)).map(d => d.id)
  if (idsLeidos.length || idsEliminados.length) {
    await Promise.all([
      marcarNotificacionesLeidas(idsLeidos),
      ...idsEliminados.map(eliminarNotificacion),
    ])
  }
  return pendientes.filter(d => !eliminadas.has(d.id)).map(d => aNotificacion({
    ...d, leido: d.leido || leidas.has(d.id),
  }))
}
