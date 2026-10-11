/**
 * Servicio de comprobantes internos contra la API Django (PI-42, RF63).
 *
 * - `emitirComprobante()`: genera el comprobante de una operación PAGADA
 *   (número único secuencial + foto inmutable).
 * - `listarComprobantes()`: historial del cajero (para reimprimir).
 * - `obtenerComprobante()`: detalle para reimpresión.
 *
 * @module services/comprobantes
 */
import { apiFetch } from '@/services/api'

/** Comprobante interno tal como lo devuelve el backend. */
export interface Comprobante {
  id: number
  numero: string
  operacion: number
  cliente_nombre: string
  cliente_documento: string
  tipo_operacion: 'COMPRA' | 'VENTA'
  moneda_origen_codigo: string
  moneda_destino_codigo: string
  monto_enviado: number
  monto_recibido: number
  tasa_origen: number | null
  tasa_destino: number | null
  monto_comision: number | null
  metodo_pago: string
  fecha_operacion: string
  cajero_sub: string
  cajero_nombre: string
  estado: string
  creado: string
}

function numero(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

function mapear(c: Record<string, unknown>): Comprobante {
  return {
    id: numero(c.id),
    numero: String(c.numero ?? ''),
    operacion: numero(c.operacion),
    cliente_nombre: String(c.cliente_nombre ?? ''),
    cliente_documento: String(c.cliente_documento ?? ''),
    tipo_operacion: String(c.tipo_operacion) === 'COMPRA' ? 'COMPRA' : 'VENTA',
    moneda_origen_codigo: String(c.moneda_origen_codigo ?? ''),
    moneda_destino_codigo: String(c.moneda_destino_codigo ?? ''),
    monto_enviado: numero(c.monto_enviado),
    monto_recibido: numero(c.monto_recibido),
    tasa_origen: c.tasa_origen == null ? null : numero(c.tasa_origen),
    tasa_destino: c.tasa_destino == null ? null : numero(c.tasa_destino),
    monto_comision: c.monto_comision == null ? null : numero(c.monto_comision),
    metodo_pago: String(c.metodo_pago ?? ''),
    fecha_operacion: String(c.fecha_operacion ?? ''),
    cajero_sub: String(c.cajero_sub ?? ''),
    cajero_nombre: String(c.cajero_nombre ?? ''),
    estado: String(c.estado ?? ''),
    creado: String(c.creado ?? ''),
  }
}

/**
 * Emite el comprobante interno de una operación pagada.
 *
 * @param operacionId - Id de la operación PAGADA.
 */
export async function emitirComprobante(operacionId: number): Promise<Comprobante> {
  const creado = await apiFetch<Record<string, unknown>>('/comprobantes/', {
    method: 'POST',
    body: JSON.stringify({ operacion: operacionId }),
  })
  return mapear(creado)
}

/** Historial de comprobantes (el cajero ve los que emitió). */
export async function listarComprobantes(): Promise<Comprobante[]> {
  const datos = await apiFetch<Record<string, unknown>[]>('/comprobantes/')
  return datos.map(mapear)
}

/** Detalle de un comprobante (reimpresión). */
export async function obtenerComprobante(id: number): Promise<Comprobante> {
  const dato = await apiFetch<Record<string, unknown>>(`/comprobantes/${id}/`)
  return mapear(dato)
}
