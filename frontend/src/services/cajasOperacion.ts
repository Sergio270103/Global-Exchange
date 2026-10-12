/**
 * Servicio de la operación cambiaria presencial del cajero (PI-75).
 *
 * - `cotizarOperacion()`: pide el desglose antes de confirmar. No crea
 *   nada, solo devuelve cotización, montos y si la caja tiene saldo.
 * - `ejecutarOperacion()`: ejecuta la operación completa: crea la
 *   operación, mueve el efectivo de la caja y emite el comprobante
 *   interno (PI-42). Es una sola transacción en el backend.
 *
 * El medio de pago es efectivo, tarjeta o transferencia. No se usa
 * billetera en ventanilla.
 *
 * @module services/cajasOperacion
 */
import { apiFetch } from '@/services/api'

/** Medios de pago admitidos en ventanilla (PI-75). */
export type MedioPago = 'efectivo' | 'tarjeta' | 'transferencia'

export const MEDIOS_PAGO: { value: MedioPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta de crédito/débito' },
  { value: 'transferencia', label: 'Transferencia bancaria' },
]

/** Saldo de una divisa en la caja (RF56). */
export interface SaldoMoneda {
  moneda: number
  moneda_codigo: string
  moneda_nombre: string
  simbolo: string
  decimales: number
  total: string
}

/** Datos del formulario de la operación. */
export interface DatosOperacionPresencial {
  cliente: number
  tipo_operacion: 'COMPRA' | 'VENTA'
  /** Divisa que el cliente compra o vende (la que opera el backend). */
  moneda: string
  /** Monto que escribió el cajero, en `moneda_del_monto`. */
  monto: string
  /**
   * Moneda del campo de monto. El panel rotula "Monto (PYG)" y el cajero
   * escribe en esa moneda; el backend convierte a la divisa operada.
   */
  moneda_del_monto?: string
  moneda_contraparte?: string
  medio_pago: MedioPago
  observacion?: string
}

/**
 * Desglose que se muestra antes de confirmar (PI-75).
 *
 * `cliente_paga` y `cliente_recibe` ya traen el precio final: el cliente
 * no ve ni el porcentaje de ajuste ni una línea de comisión.
 */
export interface CotizacionVentanilla {
  tipo_operacion: 'COMPRA' | 'VENTA'
  moneda_origen_codigo: string
  moneda_origen_decimales: number
  moneda_destino_codigo: string
  moneda_destino_decimales: number
  monto_enviado: string
  monto_recibido: string
  /** Bruto en destino antes del ajuste (5128.20). */
  monto_bruto: string
  /** Ajuste aplicado, en moneda destino (51.28). */
  monto_comision: string
  /** Porcentaje del ajuste por categoría (1 = 1%). */
  porcentaje_ajuste: string
  /**
   * `true` en VENTA: el ajuste se descuenta de lo que recibe el cliente.
   * `false` en COMPRA: ya está incluido en lo que paga, no se resta.
   */
  comision_descuenta_destino: boolean
  /**
   * Factor interno, va invertido (0,256 = 1/3,9). No se muestra: para eso
   * están `tasa_origen` y `tasa_destino`, que son las del comprobante.
   */
  tasa_aplicada: string
  tasa_origen: string | null
  tasa_destino: string | null
  cliente_paga: string
  cliente_recibe: string
  caja_abierta: boolean
  saldo_disponible: string
  saldo_suficiente: boolean
}

/** Resultado de ejecutar la operación. */
export interface ResultadoOperacionPresencial {
  operacion: { id: number; estado: string; metodo_pago: string }
  movimientos: {
    id: number
    tipo: string
    tipo_display: string
    moneda_codigo: string
    total: string
    saldo_resultante: string | null
  }[]
  comprobante: {
    id: number
    numero: string
    cliente_nombre: string
    monto_enviado: string
    monto_recibido: string
  } | null
  saldo: SaldoMoneda[]
}

/** Caja con su estado de apertura. */
export interface CajaOperacion {
  id: number
  nombre: string
  sucursal: string
  activa: boolean
  abierta: boolean
}

/**
 * Pide el desglose de la operación sin crearla.
 *
 * @throws {ApiError} 400 si el monto o las monedas no permiten operar.
 */
export async function cotizarOperacion(
  cajaId: number,
  datos: DatosOperacionPresencial,
): Promise<CotizacionVentanilla> {
  return apiFetch<CotizacionVentanilla>(`/cajas/${cajaId}/cotizar/`, {
    method: 'POST',
    body: JSON.stringify(datos),
  })
}

/**
 * Ejecuta la operación presencial completa.
 *
 * @throws {ApiError} 409 si la caja está cerrada, 400 si no alcanza el
 *   saldo o los datos no son válidos.
 */
export async function ejecutarOperacion(
  cajaId: number,
  datos: DatosOperacionPresencial,
): Promise<ResultadoOperacionPresencial> {
  return apiFetch<ResultadoOperacionPresencial>(`/cajas/${cajaId}/operacion/`, {
    method: 'POST',
    body: JSON.stringify(datos),
  })
}