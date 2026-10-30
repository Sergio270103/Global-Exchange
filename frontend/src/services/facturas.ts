/**
 * Servicio de facturación electrónica contra la API Django (PI-30).
 *
 * - `usoFacturas()`: "emisiones usadas X de N", el correo del cliente
 *   para precargar y la última factura de la operación.
 * - `emitirFactura()`: emite la factura de una operación PAGADA.
 * - `consultarEstadoFactura()`: consulta el estado en SIFEN y lo guarda.
 * - `cancelarFactura()` / `inutilizarFactura()`: solicitan el evento SIFEN
 *   y permiten consultar su estado (`consultarCancelacion`,
 *   `consultarInutilizacion`).
 * - `emitirNotaCredito()` / `consultarEstadoNotaCredito()`: NC total
 *   (`iTiDE=5`) y su seguimiento en SIFEN.
 *
 * El backend habla con Factura Segura; el token nunca llega al navegador.
 *
 * @module services/facturas
 */
import { ApiError, apiFetch } from '@/services/api'

export type EstadoFactura = 'ANULADA' | 'DEVUELTA' | 'ERROR' | 'VERIFICAR' | 'EMITIDA' | 'APROBADA' | 'RECHAZADA'
export type EstadoEvento = '' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'ERROR'

export interface EventoSIFEN {
  id: number
  factura: number
  tipo: 'CANCELACION' | 'INUTILIZACION'
  tipo_display: string
  estado: Exclude<EstadoEvento, ''>
  estado_display: string
  cdc_evento: string
  motivo: string
  solicitado_por_nombre: string
  solicitado: string
  consultado: string | null
  detalle: string
  respuesta_solicitud: Record<string, unknown>
  respuesta_consulta: Record<string, unknown>
}

export interface NotaCreditoResumen {
  id: number
  numero: string | null
  numero_completo: string
  cdc: string
  estado: EstadoFactura
  total: number
  motivo: string
  motivo_display: string
  detalle: string
  creada: string
  simulada: boolean
}

export interface NotaCreditoElectronica extends NotaCreditoResumen {
  factura: number
  factura_numero: string
  cliente_nombre: string
  estado_display: string
  email_destino: string
  respuesta_servicio: Record<string, unknown>
  envio_fecha: string | null
  envio_destinatario: string
  envio_resultado: string
  emitida_por_nombre: string
  actualizada: string
  estado_consultado: string | null
}

export interface FacturaElectronica {
  tipo_operacion?: 'COMPRA' | 'VENTA'
  tipo_operacion_display?: 'Compra' | 'Venta'
  pdf_pendiente?: boolean
  puede_gestionar?: boolean
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
  /** Resumen de la última cancelación solicitada a SIFEN. */
  estado_cancelacion?: EstadoEvento
  /** Resumen de la última inutilización solicitada a SIFEN. */
  estado_inutilizacion?: EstadoEvento
  cancelacion_solicitada?: string | null
  cancelacion_consultada?: string | null
  cancelacion_detalle?: string
  inutilizacion_solicitada?: string | null
  inutilizacion_consultada?: string | null
  inutilizacion_detalle?: string
  cancelada_por_nombre?: string
  inutilizada_por_nombre?: string
  puede_cancelar?: boolean
  puede_inutilizar?: boolean
  puede_nota_credito?: boolean
  eventos?: EventoSIFEN[]
  notas_credito?: NotaCreditoResumen[]
}

export interface UsoFacturas {
  modo: 'simulado' | 'real'
  usadas: number
  limite: number
  disponibles: number
  siguiente_numero: string | null
  nc_usadas?: number
  nc_limite?: number
  nc_disponibles?: number
  nc_siguiente_numero?: string | null
  operacion?: number
  operacion_estado?: string
  email_cliente?: string
  factura?: FacturaElectronica | null
}

/** Motivos de emisión de la nota de crédito (iMotEmi del Manual SIFEN). */
export const MOTIVOS_NOTA_CREDITO = [
  { codigo: '1', etiqueta: 'Devolución de mercadería' },
  { codigo: '2', etiqueta: 'Descuento por volumen' },
  { codigo: '3', etiqueta: 'Bonificación' },
  { codigo: '4', etiqueta: 'Crédito incobrable' },
  { codigo: '5', etiqueta: 'Ajuste de precio' },
  { codigo: '6', etiqueta: 'Comisión' },
  { codigo: '7', etiqueta: 'Otros' },
] as const

export const ETIQUETA_ESTADO_FACTURA: Record<EstadoFactura, string> = {
  ANULADA: 'Anulada', DEVUELTA: 'Devuelta',
  ERROR: 'Error (no generada)',
  VERIFICAR: 'Pendiente de verificar',
  EMITIDA: 'Emitida',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
}

function mapearEvento(e: Record<string, unknown>): EventoSIFEN {
  return {
    id: Number(e.id),
    factura: Number(e.factura),
    tipo: String(e.tipo) as EventoSIFEN['tipo'],
    tipo_display: String(e.tipo_display ?? ''),
    estado: String(e.estado ?? 'PENDIENTE') as EventoSIFEN['estado'],
    estado_display: String(e.estado_display ?? ''),
    cdc_evento: String(e.cdc_evento ?? ''),
    motivo: String(e.motivo ?? ''),
    solicitado_por_nombre: String(e.solicitado_por_nombre ?? ''),
    solicitado: String(e.solicitado ?? ''),
    consultado: e.consultado == null ? null : String(e.consultado),
    detalle: String(e.detalle ?? ''),
    respuesta_solicitud: (e.respuesta_solicitud as Record<string, unknown>) ?? {},
    respuesta_consulta: (e.respuesta_consulta as Record<string, unknown>) ?? {},
  }
}

function mapearResumenNc(n: Record<string, unknown>): NotaCreditoResumen {
  return {
    id: Number(n.id),
    numero: n.numero == null ? null : String(n.numero),
    numero_completo: String(n.numero_completo ?? ''),
    cdc: String(n.cdc ?? ''),
    estado: String(n.estado ?? 'ERROR') as EstadoFactura,
    total: Number(n.total ?? 0),
    motivo: String(n.motivo ?? ''),
    motivo_display: String(n.motivo_display ?? ''),
    detalle: String(n.detalle ?? ''),
    creada: String(n.creada ?? ''),
    simulada: Boolean(n.simulada),
  }
}

function mapearNota(n: Record<string, unknown>): NotaCreditoElectronica {
  return {
    ...mapearResumenNc(n),
    factura: Number(n.factura),
    factura_numero: String(n.factura_numero ?? ''),
    cliente_nombre: String(n.cliente_nombre ?? ''),
    estado_display: String(n.estado_display ?? ''),
    email_destino: String(n.email_destino ?? ''),
    respuesta_servicio: (n.respuesta_servicio as Record<string, unknown>) ?? {},
    envio_fecha: n.envio_fecha == null ? null : String(n.envio_fecha),
    envio_destinatario: String(n.envio_destinatario ?? ''),
    envio_resultado: String(n.envio_resultado ?? ''),
    emitida_por_nombre: String(n.emitida_por_nombre ?? ''),
    actualizada: String(n.actualizada ?? ''),
    estado_consultado: n.estado_consultado == null ? null : String(n.estado_consultado),
  }
}

function mapear(f: Record<string, unknown>): FacturaElectronica {
  return {
    id: Number(f.id),
    operacion: Number(f.operacion),
    cliente_nombre: String(f.cliente_nombre ?? ''),
    tipo_operacion: String(f.tipo_operacion ?? 'VENTA') as 'COMPRA' | 'VENTA',
    tipo_operacion_display: String(f.tipo_operacion_display ?? (f.tipo_operacion === 'COMPRA' ? 'Compra' : 'Venta')) as 'Compra' | 'Venta',
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
    estado_cancelacion: String(f.estado_cancelacion ?? '') as EstadoEvento,
    estado_inutilizacion: String(f.estado_inutilizacion ?? '') as EstadoEvento,
    cancelacion_solicitada: f.cancelacion_solicitada == null ? null : String(f.cancelacion_solicitada),
    cancelacion_consultada: f.cancelacion_consultada == null ? null : String(f.cancelacion_consultada),
    cancelacion_detalle: String(f.cancelacion_detalle ?? ''),
    inutilizacion_solicitada: f.inutilizacion_solicitada == null ? null : String(f.inutilizacion_solicitada),
    inutilizacion_consultada: f.inutilizacion_consultada == null ? null : String(f.inutilizacion_consultada),
    inutilizacion_detalle: String(f.inutilizacion_detalle ?? ''),
    cancelada_por_nombre: String(f.cancelada_por_nombre ?? ''),
    inutilizada_por_nombre: String(f.inutilizada_por_nombre ?? ''),
    puede_cancelar: Boolean(f.puede_cancelar),
    puede_inutilizar: Boolean(f.puede_inutilizar),
    puede_nota_credito: Boolean(f.puede_nota_credito),
    eventos: ((f.eventos as Record<string, unknown>[] | undefined) ?? []).map(mapearEvento),
    notas_credito: ((f.notas_credito as Record<string, unknown>[] | undefined) ?? []).map(mapearResumenNc),
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
    nc_usadas: Number(d.nc_usadas ?? 0),
    nc_limite: Number(d.nc_limite ?? 0),
    nc_disponibles: Number(d.nc_disponibles ?? 0),
    nc_siguiente_numero: d.nc_siguiente_numero == null ? null : String(d.nc_siguiente_numero),
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

/** Respuesta de las acciones de cancelación/inutilización. */
export interface RespuestaEvento {
  factura: FacturaElectronica
  evento: EventoSIFEN
}

/** Solicita la cancelación de una factura aprobada. */
export async function cancelarFactura(id: number, motivo = ''): Promise<RespuestaEvento> {
  const d = await apiFetch<Record<string, unknown>>(`/facturas/${id}/cancelar/`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  })
  return {
    factura: mapear((d.factura ?? {}) as Record<string, unknown>),
    evento: mapearEvento((d.evento ?? {}) as Record<string, unknown>),
  }
}

/** Consulta el estado de la cancelación en SIFEN. */
export async function consultarCancelacion(id: number): Promise<RespuestaEvento> {
  const d = await apiFetch<Record<string, unknown>>(`/facturas/${id}/cancelacion/estado/`, {
    method: 'POST',
  })
  return {
    factura: mapear((d.factura ?? {}) as Record<string, unknown>),
    evento: mapearEvento((d.evento ?? {}) as Record<string, unknown>),
  }
}

/** Solicita inutilizar el número de una factura no aprobada. */
export async function inutilizarFactura(id: number, motivo = ''): Promise<RespuestaEvento> {
  const d = await apiFetch<Record<string, unknown>>(`/facturas/${id}/inutilizar/`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  })
  return {
    factura: mapear((d.factura ?? {}) as Record<string, unknown>),
    evento: mapearEvento((d.evento ?? {}) as Record<string, unknown>),
  }
}

/** Consulta el estado de la inutilización en SIFEN. */
export async function consultarInutilizacion(id: number): Promise<RespuestaEvento> {
  const d = await apiFetch<Record<string, unknown>>(`/facturas/${id}/inutilizacion/estado/`, {
    method: 'POST',
  })
  return {
    factura: mapear((d.factura ?? {}) as Record<string, unknown>),
    evento: mapearEvento((d.evento ?? {}) as Record<string, unknown>),
  }
}

/** Emite una nota de crédito total de una factura aprobada. */
export async function emitirNotaCredito(
  id: number, motivo = '5', email = '',
): Promise<NotaCreditoElectronica> {
  const n = await apiFetch<Record<string, unknown>>(`/facturas/${id}/nota-credito/`, {
    method: 'POST',
    body: JSON.stringify({ motivo, email }),
  })
  return mapearNota(n)
}

/** Consulta el estado de una nota de crédito en SIFEN. */
export async function consultarEstadoNotaCredito(id: number): Promise<NotaCreditoElectronica> {
  const n = await apiFetch<Record<string, unknown>>(`/notas-credito/${id}/estado/`, {
    method: 'POST',
  })
  return mapearNota(n)
}

/** Lista las notas de crédito visibles para el usuario. */
export async function listarNotasCredito(facturaId?: number): Promise<NotaCreditoElectronica[]> {
  const ruta = facturaId
    ? `/notas-credito/?factura=${facturaId}`
    : '/notas-credito/'
  const datos = await apiFetch<Record<string, unknown>[]>(ruta)
  return (datos ?? []).map(mapearNota)
}

export { ApiError }


export async function gestionarFactura(id: number, accion: 'reintentar' | 'reenviar', email: string): Promise<FacturaElectronica> {
  return mapear(await apiFetch<Record<string, unknown>>(`/facturas/${id}/${accion}/`, {
    method: 'POST', body: JSON.stringify({ email }),
  }))
}
