/**
 * Servicio de facturación electrónica contra la API Django (PI-30).
 *
 * - `usoFacturas()`: "emisiones usadas X de N", el correo del cliente
 *   para precargar y la última factura de la operación.
 * - `emitirFactura()`: emite la factura de una operación PAGADA.
 * - `consultarEstadoFactura()`: consulta el estado en SIFEN y lo guarda.
 *
 * El backend habla con Factura Segura; el token nunca llega al navegador.
 *
 * @module services/facturas
 */
import { ApiError, apiFetch } from '@/services/api'

export type EstadoFactura = 'ERROR' | 'VERIFICAR' | 'EMITIDA' | 'APROBADA' | 'RECHAZADA'

export interface FacturaElectronica {
  id: number
  operacion: number
  cliente_nombre: string
  simulada: boolean
  numero: string | null
  numero_completo: string
  cdc: string
  estado: EstadoFactura
  total: number
  email_destino: string
  detalle: string
  envio_fecha: string | null
  envio_destinatario: string
  envio_resultado: string
  creada: string
  estado_consultado: string | null
}

export interface UsoFacturas {
  modo: 'simulado' | 'real'
  usadas: number
  limite: number
  disponibles: number
  siguiente_numero: string | null
  operacion?: number
  operacion_estado?: string
  email_cliente?: string
  factura?: FacturaElectronica | null
}

export const ETIQUETA_ESTADO_FACTURA: Record<EstadoFactura, string> = {
  ERROR: 'Error (no generada)',
  VERIFICAR: 'Pendiente de verificar',
  EMITIDA: 'Emitida',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
}

function mapear(f: Record<string, unknown>): FacturaElectronica {
  return {
    id: Number(f.id),
    operacion: Number(f.operacion),
    cliente_nombre: String(f.cliente_nombre ?? ''),
    simulada: Boolean(f.simulada),
    numero: f.numero == null ? null : String(f.numero),
    numero_completo: String(f.numero_completo ?? ''),
    cdc: String(f.cdc ?? ''),
    estado: String(f.estado ?? 'ERROR') as EstadoFactura,
    total: Number(f.total ?? 0),
    email_destino: String(f.email_destino ?? ''),
    detalle: String(f.detalle ?? ''),
    envio_fecha: f.envio_fecha == null ? null : String(f.envio_fecha),
    envio_destinatario: String(f.envio_destinatario ?? ''),
    envio_resultado: String(f.envio_resultado ?? ''),
    creada: String(f.creada ?? ''),
    estado_consultado: f.estado_consultado == null ? null : String(f.estado_consultado),
  }
}

/** Uso del rango y datos para emitir la factura de una operación. */
export async function usoFacturas(operacionId: number): Promise<UsoFacturas> {
  const d = await apiFetch<Record<string, unknown>>(`/facturas/uso/?operacion=${operacionId}`)
  return {
    modo: d.modo === 'real' ? 'real' : 'simulado',
    usadas: Number(d.usadas ?? 0),
    limite: Number(d.limite ?? 0),
    disponibles: Number(d.disponibles ?? 0),
    siguiente_numero: d.siguiente_numero == null ? null : String(d.siguiente_numero),
    operacion: d.operacion == null ? undefined : Number(d.operacion),
    operacion_estado: d.operacion_estado == null ? undefined : String(d.operacion_estado),
    email_cliente: d.email_cliente == null ? undefined : String(d.email_cliente),
    factura: d.factura ? mapear(d.factura as Record<string, unknown>) : null,
  }
}

/**
 * Emite la factura electrónica de una operación PAGADA.
 *
 * @throws {ApiError} con el motivo si no se pudo emitir (operación no
 *   pagada, límite alcanzado o rechazo de Factura Segura).
 */
export async function emitirFactura(operacionId: number, email: string): Promise<FacturaElectronica> {
  const f = await apiFetch<Record<string, unknown>>('/facturas/', {
    method: 'POST',
    body: JSON.stringify({ operacion: operacionId, email }),
  })
  return mapear(f)
}

/** Consulta el estado en SIFEN (solo consulta, no emite nada). */
export async function consultarEstadoFactura(id: number): Promise<FacturaElectronica> {
  const f = await apiFetch<Record<string, unknown>>(`/facturas/${id}/estado/`, { method: 'POST' })
  return mapear(f)
}

export { ApiError }
