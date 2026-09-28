/**
 * Servicio del simulador de conversión (`GET /api/simulador/`).
 *
 * El backend aplica internamente el ajuste de precio de la categoría y
 * devuelve únicamente el precio final. El cliente no recibe el porcentaje
 * ni el monto del ajuste.
 *
 * @module services/simulador
 */
import { apiFetch } from '@/services/api'

/** Categorías de cliente con ajuste de precio configurado. */
export type CategoriaCliente = 'MINORISTA' | 'CORPORATIVO' | 'VIP'

/** Operación a simular: compra (cliente compra divisa) o venta. */
export type OperacionSimulada = 'compra' | 'venta'

/** Resultado público de la simulación, sin desglose del ajuste interno. */
export interface Simulacion {
  moneda: string
  moneda_contraparte: string
  operacion: OperacionSimulada
  monto_origen: number
  tasa_aplicada: number
  monto_total: number
  total_tipo: 'pagar' | 'recibir'
  vigente_desde: string
}

/**
 * Simula una conversión sin concretar la operación.
 */
export async function simular(params: {
  moneda: string
  monto: number
  operacion: OperacionSimulada
  clienteId: number
  monedaContraparte?: string
}): Promise<Simulacion> {
  const qs = new URLSearchParams({
    moneda: params.moneda,
    monto: String(params.monto),
    operacion: params.operacion,
    cliente: String(params.clienteId),
    moneda_contraparte: params.monedaContraparte ?? 'PYG',
  })
  return apiFetch<Simulacion>(`/simulador/?${qs}`)
}

/**
 * Ajustes internos de precio por categoría (`{MINORISTA: 1.0, ...}`).
 * Solo el administrador puede consultar este recurso.
 */
export async function listarAjustesPrecio(): Promise<Record<string, number>> {
  return apiFetch<Record<string, number>>('/ajustes-precios/simulador/')
}

/** Actualiza el ajuste de una categoría (solo admin). */
export async function actualizarAjustePrecio(
  categoria: CategoriaCliente,
  porcentaje: number,
): Promise<void> {
  await apiFetch(`/ajustes-precios/${categoria}/`, {
    method: 'PUT',
    body: JSON.stringify({ categoria, porcentaje }),
  })
}

// Alias deprecated para no romper imports de código anterior durante la
// transición. La interfaz y la API nuevas ya no usan el concepto de comisión.
export const listarComisiones = listarAjustesPrecio
export const actualizarComision = actualizarAjustePrecio
