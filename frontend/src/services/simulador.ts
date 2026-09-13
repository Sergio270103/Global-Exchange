/**
 * Servicio del simulador de conversión (`GET /api/simulador/`).
 *
 * Calcula en el backend con la tasa vigente y la comisión de la
 * categoría del cliente (RF20–RF22) y devuelve el desglose exigido
 * por RF21.
 *
 * @module services/simulador
 */
import { apiFetch } from '@/services/api'

/** Categorías de cliente con comisión configurada. */
export type CategoriaCliente = 'MINORISTA' | 'CORPORATIVO' | 'VIP'

/** Operación a simular: compra (cliente compra divisa) o venta. */
export type OperacionSimulada = 'compra' | 'venta'

/** Desglose del cálculo devuelto por el backend. */
export interface Simulacion {
  moneda: string
  operacion: OperacionSimulada
  monto_origen: number
  tasa_aplicada: number
  monto_bruto_pyg: number
  categoria: CategoriaCliente
  comision_porcentaje: number
  comision_pyg: number
  monto_neto_pyg: number
  vigente_desde: string
}

/**
 * Simula una conversión sin concretar la operación.
 */
export async function simular(params: {
  moneda: string
  monto: number
  operacion: OperacionSimulada
  categoria: CategoriaCliente
}): Promise<Simulacion> {
  const qs = new URLSearchParams({
    moneda: params.moneda,
    monto: String(params.monto),
    operacion: params.operacion,
    categoria: params.categoria,
  })
  return apiFetch<Simulacion>(`/simulador/?${qs}`)
}

/**
 * Comisiones configuradas por categoría (`{MINORISTA: 1.0, ...}`).
 */
export async function listarComisiones(): Promise<Record<string, number>> {
  return apiFetch<Record<string, number>>('/comisiones/simulador/')
}

/**
 * Actualiza el porcentaje de una categoría (solo admin).
 */
export async function actualizarComision(
  categoria: CategoriaCliente,
  porcentaje: number,
): Promise<void> {
  await apiFetch(`/comisiones/${categoria}/`, {
    method: 'PUT',
    body: JSON.stringify({ categoria, porcentaje }),
  })
}
