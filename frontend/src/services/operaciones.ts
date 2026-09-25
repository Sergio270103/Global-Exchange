/**
 * Servicio de operaciones de compra/venta (`/api/operaciones/`).
 *
 * - `crearOperacion()`: ejecuta la operación en el backend con la última
 *   cotización vigente y la comisión de la categoría del cliente.
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
}

export type TipoOperacion = 'COMPRA' | 'VENTA'

/**
 * Ejecuta una compra/venta.
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
  }
}

/**
 * Historial de operaciones del usuario/cliente.
 */
export async function listarOperaciones(params: {
  mine?: boolean
  clienteId?: number
  tipo?: string
  buscar?: string
} = {}): Promise<Operacion[]> {
  const qs = new URLSearchParams()
  if (params.mine) qs.set('mine', '1')
  if (params.clienteId) qs.set('cliente', String(params.clienteId))
  if (params.tipo) qs.set('tipo', params.tipo)
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
