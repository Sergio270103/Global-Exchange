/**
 * Servicio de métodos de pago globales (`/api/metodos-pago/`).
 *
 * Catálogo que el administrador habilita o deshabilita (RF42).
 * La baja es lógica.
 *
 * @module services/metodos
 */
import { apiFetch } from '@/services/api'

/** Método de pago tal como lo devuelve el backend. */
export interface MetodoPago {
  id: number
  codigo: string
  nombre: string
  activo: boolean
}

/**
 * Lista el catálogo de métodos de pago.
 */
export async function listarMetodos(): Promise<MetodoPago[]> {
  return apiFetch<MetodoPago[]>('/metodos-pago/')
}

/**
 * Habilita o deshabilita un método de pago (solo admin).
 */
export async function cambiarEstadoMetodo(id: number, activo: boolean): Promise<MetodoPago> {
  return apiFetch<MetodoPago>(`/metodos-pago/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ activo }),
  })
}
