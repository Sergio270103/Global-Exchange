/**
 * Servicio de operaciones de compra/venta (`/api/operaciones/`).
 *
 * - `crearOperacion()`: inicia la operación (estado PENDIENTE) con la última
 *   cotización vigente, que queda congelada durante la ventana de tolerancia.
 * - `confirmarOperacion()`: confirma; si la tasa cambió fuera de la ventana
 *   devuelve la nueva cotización para que el usuario la acepte o cancele.
 * - `cancelarOperacion()`: cancela sin costo una operación pendiente (PI-64).
 * - `listarOperaciones()`: historial para Transactions.tsx.
 * - `verificarClienteOperable()`: validación pre-vuelo para el mensaje
 *   inline de BuySell (cliente activo + asociación `mine=1`).
 *
 * @module services/operaciones
 */
import { apiFetch } from '@/services/api'
import { listarClientes, misClientes, type Cliente } from '@/services/clientes'

export const ERROR_CLIENTE_INACTIVO =
  'La operación no puede ser realizada: el cliente está inactivo o el usuario no está asociado a este cliente.'

/** Operación tal como la devuelve el backend. */
export interface Operacion {
  id: number
  cliente: number
  cliente_nombre: string
  usuario_keycloak_id: string
  tipo_operacion: 'COMPRA' | 'VENTA'
  moneda_origen: number
  moneda_origen_codigo: string
  moneda_destino: number
  moneda_destino_codigo: string
  monto_enviado: number
  monto_recibido: number
  cotizacion_aplicada: number
  tasa_origen: number | null
  tasa_destino: number | null
  porcentaje_comision_aplicado: number
  monto_comision: number
  metodo_pago: string
  fecha_creacion: string
  estado: EstadoOperacion
  fecha_cotizacion: string
  fecha_confirmacion: string | null
  fecha_cancelacion: string | null
  cancelada_por: string
  cancelada_por_nombre: string
  motivo_cancelacion: MotivoCancelacion | ''
  /** Duración total de la tasa garantizada, en segundos. */
  tolerancia_segundos: number
  /** Segundos de tasa garantizada que quedan (calculado por el servidor). */
  segundos_restantes: number
}

export type EstadoOperacion = 'PENDIENTE' | 'PAGADA' | 'CANCELADA' | 'ANULADA'
export type MotivoCancelacion = 'COTIZACION_CAMBIADA' | 'DESISTIO'

/** Resultado de `confirmarOperacion()`. */
export type ResultadoConfirmacion =
  | { resultado: 'CONFIRMADA'; operacion: Operacion }
  | { resultado: 'COTIZACION_CAMBIADA'; operacion: Operacion; anterior: Operacion; detail: string }

export type TipoOperacion = 'COMPRA' | 'VENTA'

/**
 * Inicia una compra/venta. Queda PENDIENTE hasta `confirmarOperacion()`.
 *
 * @param input - `moneda` es la divisa que el usuario tipea (ej. USD),
 *   `monto_divisa` la cantidad, `moneda_contraparte` por defecto PYG.
 */
export async function crearOperacion(input: {
  clienteId: number
  tipo: TipoOperacion
  moneda: string
  montoDivisa: number
  monedaContraparte?: string
  metodoPago?: string
}): Promise<Operacion> {
  const cruda = await apiFetch<Record<string, unknown>>('/operaciones/', {
    method: 'POST',
    body: JSON.stringify({
      cliente: input.clienteId,
      tipo_operacion: input.tipo,
      moneda: input.moneda,
      monto_divisa: input.montoDivisa,
      moneda_contraparte: input.monedaContraparte ?? 'PYG',
      metodo_pago: input.metodoPago ?? '',
    }),
  })
  return mapear(cruda)
}

/**
 * Confirma una operación pendiente.
 *
 * Dentro de la ventana de tolerancia se respeta la tasa congelada. Fuera de
 * ella, si la tasa cambió, el backend re-cotiza y devuelve
 * `COTIZACION_CAMBIADA` con la operación actualizada (nueva ventana).
 */
export async function confirmarOperacion(id: number): Promise<ResultadoConfirmacion> {
  const r = await apiFetch<Record<string, unknown>>(`/operaciones/${id}/confirmar/`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  const operacion = mapear(r.operacion as Record<string, unknown>)
  if (r.resultado === 'COTIZACION_CAMBIADA') {
    return {
      resultado: 'COTIZACION_CAMBIADA',
      operacion,
      anterior: mapear(r.anterior as Record<string, unknown>),
      detail: String(r.detail ?? ''),
    }
  }
  return { resultado: 'CONFIRMADA', operacion }
}

/**
 * Cancela sin costo una operación pendiente. Queda trazado quién y cuándo.
 */
export async function cancelarOperacion(
  id: number,
  motivo: MotivoCancelacion = 'DESISTIO',
): Promise<Operacion> {
  const r = await apiFetch<Record<string, unknown>>(`/operaciones/${id}/cancelar/`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  })
  return mapear(r)
}

function numero(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

function mapear(o: Record<string, unknown>): Operacion {
  return {
    id: numero(o.id),
    cliente: numero(o.cliente),
    cliente_nombre: String(o.cliente_nombre ?? ''),
    usuario_keycloak_id: String(o.usuario_keycloak_id ?? ''),
    tipo_operacion: String(o.tipo_operacion) === 'COMPRA' ? 'COMPRA' : 'VENTA',
    moneda_origen: numero(o.moneda_origen),
    moneda_origen_codigo: String(o.moneda_origen_codigo ?? ''),
    moneda_destino: numero(o.moneda_destino),
    moneda_destino_codigo: String(o.moneda_destino_codigo ?? ''),
    monto_enviado: numero(o.monto_enviado),
    monto_recibido: numero(o.monto_recibido),
    cotizacion_aplicada: numero(o.cotizacion_aplicada),
    tasa_origen: o.tasa_origen == null ? null : numero(o.tasa_origen),
    tasa_destino: o.tasa_destino == null ? null : numero(o.tasa_destino),
    porcentaje_comision_aplicado: numero(o.porcentaje_comision_aplicado),
    monto_comision: numero(o.monto_comision),
    metodo_pago: String(o.metodo_pago ?? ''),
    fecha_creacion: String(o.fecha_creacion ?? ''),
    estado: (['PENDIENTE', 'PAGADA', 'CANCELADA', 'ANULADA'].includes(String(o.estado))
      ? String(o.estado)
      : 'PAGADA') as EstadoOperacion,
    fecha_cotizacion: String(o.fecha_cotizacion ?? ''),
    fecha_confirmacion: o.fecha_confirmacion == null ? null : String(o.fecha_confirmacion),
    fecha_cancelacion: o.fecha_cancelacion == null ? null : String(o.fecha_cancelacion),
    cancelada_por: String(o.cancelada_por ?? ''),
    cancelada_por_nombre: String(o.cancelada_por_nombre ?? ''),
    motivo_cancelacion: (String(o.motivo_cancelacion ?? '') as MotivoCancelacion | ''),
    tolerancia_segundos: numero(o.tolerancia_segundos),
    segundos_restantes: numero(o.segundos_restantes),
  }
}

/**
 * Historial de operaciones del usuario/cliente.
 */
export async function listarOperaciones(params: {
  mine?: boolean
  clienteId?: number
  tipo?: string
  estado?: EstadoOperacion
  buscar?: string
} = {}): Promise<Operacion[]> {
  const qs = new URLSearchParams()
  if (params.mine) qs.set('mine', '1')
  if (params.clienteId) qs.set('cliente', String(params.clienteId))
  if (params.tipo) qs.set('tipo', params.tipo)
  if (params.estado) qs.set('estado', params.estado)
  if (params.buscar) qs.set('buscar', params.buscar)
  const sufijo = qs.toString() ? `?${qs}` : ''
  const datos = await apiFetch<Record<string, unknown>[]>(`/operaciones/${sufijo}`)
  return datos.map(mapear)
}

/**
 * Validación pre-vuelo para la UI: cliente activo + asociación vigente.
 *
 * @returns `{ok:true, cliente}` o `{ok:false, motivo}` con el mensaje
 *   inline exigido por el hito.
 */
export async function verificarClienteOperable(
  clienteId: number | null | undefined,
): Promise<{ ok: boolean; cliente?: Cliente; motivo?: string }> {
  if (!clienteId) return { ok: false, motivo: ERROR_CLIENTE_INACTIVO }
  const [mios, lista] = await Promise.all([
    misClientes().catch(() => [] as { id: number; nombre: string }[]),
    listarClientes().catch(() => [] as Cliente[]),
  ])
  const cliente = lista.find(c => c.id === clienteId)
  const asociado = mios.some(m => m.id === clienteId)
  if (!cliente || !cliente.activo || !asociado) {
    return { ok: false, motivo: ERROR_CLIENTE_INACTIVO }
  }
  return { ok: true, cliente }
}