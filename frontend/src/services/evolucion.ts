import { apiFetch } from '@/services/api'

export interface PuntoEvolucion {
  secuencia: number
  compra: number | null
  venta: number | null
  fecha: string
}

export async function obtenerEvolucion(clienteId: number): Promise<PuntoEvolucion[]> {
  return apiFetch<PuntoEvolucion[]>(`/operaciones/evolucion/?cliente=${clienteId}`)
}
