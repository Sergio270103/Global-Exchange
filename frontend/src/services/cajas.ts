/**
 * Servicio de control de cajas (PI-44, ERS RF56/RF58).
 *
 * - `listarCajas()`: cajas activas de las sucursales.
 * - `obtenerSaldo(cajaId)`: billetes por divisa y denominación con el
 *   total de cada moneda.
 * - `registrarMovimiento(...)`: ingreso, entrega o retiro de billetes.
 *   Devuelve el saldo ya actualizado.
 * - `listarArqueos` / `registrarArqueo`: registro de auditoría del
 *   estado de caja para cierres de turno y arqueos.
 *
 * @module services/cajas
 */
import { apiFetch } from '@/services/api'
import { banderaDesdeCodigo } from '@/services/monedas'

/** Caja de una sucursal. */
export interface Caja {
  id: number
  nombre: string
  sucursal: string
  activa: boolean
}

/** Tipos de movimiento de efectivo. */
export type TipoMovimiento = 'INGRESO' | 'ENTREGA' | 'RETIRO'

/** Billetes de una denominación en la caja. */
export interface DenominacionSaldo {
  denominacion: number
  valor: number
  cantidad: number
  subtotal: number
}

/** Inventario de billetes de una moneda en la caja. */
export interface SaldoMoneda {
  moneda: number
  codigo: string
  nombre: string
  simbolo: string
  decimales: number
  flag: string
  total: number
  cantidadBilletes: number
  denominaciones: DenominacionSaldo[]
}

/** Movimiento de efectivo ya registrado. */
export interface MovimientoCaja {
  id: number
  tipo: TipoMovimiento
  tipoDisplay: string
  monedaCodigo: string
  total: number
  usuarioNombre: string
  observacion: string
  creadoEn: string
  detalle: { denominacion: number; valor: number; cantidad: number; saldoResultante: number }[]
}

/** Línea de un arqueo: lo que dice el sistema vs. lo contado. */
export interface LineaArqueo {
  denominacion: number
  monedaCodigo: string
  valor: number
  cantidadSistema: number
  cantidadContada: number
  diferencia: number
}

/** Arqueo o cierre de turno registrado. */
export interface Arqueo {
  id: number
  usuarioNombre: string
  observacion: string
  conDiferencias: boolean
  creadoEn: string
  detalle: LineaArqueo[]
}

/** Billetes que se cargan en un movimiento o arqueo. */
export interface LineaBilletes {
  denominacion: number
  cantidad: number
}

// --- Formas que devuelve la API ----------------------------------------

interface SaldoMonedaApi {
  moneda: number
  moneda_codigo: string
  moneda_nombre: string
  simbolo: string
  decimales: number
  total: string
  cantidad_billetes: number
  denominaciones: { denominacion: number; valor: string; cantidad: number; subtotal: string }[]
}

interface MovimientoApi {
  id: number
  tipo: TipoMovimiento
  tipo_display: string
  moneda_codigo: string
  total: string
  usuario_nombre: string
  observacion: string
  creado_en: string
  detalle: { denominacion: number; valor: string; cantidad: number; saldo_resultante: number }[]
}

interface ArqueoApi {
  id: number
  usuario_nombre: string
  observacion: string
  con_diferencias: boolean
  creado_en: string
  detalle: {
    denominacion: number
    moneda_codigo: string
    valor: string
    cantidad_sistema: number
    cantidad_contada: number
    diferencia: number
  }[]
}

function mapearSaldo(m: SaldoMonedaApi): SaldoMoneda {
  return {
    moneda: m.moneda,
    codigo: m.moneda_codigo,
    nombre: m.moneda_nombre,
    simbolo: m.simbolo,
    decimales: m.decimales,
    flag: banderaDesdeCodigo(m.moneda_codigo),
    total: Number(m.total),
    cantidadBilletes: m.cantidad_billetes,
    denominaciones: m.denominaciones.map(d => ({
      denominacion: d.denominacion,
      valor: Number(d.valor),
      cantidad: d.cantidad,
      subtotal: Number(d.subtotal),
    })),
  }
}

function mapearMovimiento(m: MovimientoApi): MovimientoCaja {
  return {
    id: m.id,
    tipo: m.tipo,
    tipoDisplay: m.tipo_display,
    monedaCodigo: m.moneda_codigo,
    total: Number(m.total),
    usuarioNombre: m.usuario_nombre,
    observacion: m.observacion,
    creadoEn: m.creado_en,
    detalle: m.detalle.map(d => ({
      denominacion: d.denominacion,
      valor: Number(d.valor),
      cantidad: d.cantidad,
      saldoResultante: d.saldo_resultante,
    })),
  }
}

function mapearArqueo(a: ArqueoApi): Arqueo {
  return {
    id: a.id,
    usuarioNombre: a.usuario_nombre,
    observacion: a.observacion,
    conDiferencias: a.con_diferencias,
    creadoEn: a.creado_en,
    detalle: a.detalle.map(d => ({
      denominacion: d.denominacion,
      monedaCodigo: d.moneda_codigo,
      valor: Number(d.valor),
      cantidadSistema: d.cantidad_sistema,
      cantidadContada: d.cantidad_contada,
      diferencia: d.diferencia,
    })),
  }
}

/** Lista las cajas activas. */
export async function listarCajas(): Promise<Caja[]> {
  return apiFetch<Caja[]>('/cajas/')
}

/** Billetes de la caja agrupados por moneda y denominación (RF56). */
export async function obtenerSaldo(cajaId: number): Promise<SaldoMoneda[]> {
  const datos = await apiFetch<{ monedas: SaldoMonedaApi[] }>(`/cajas/${cajaId}/saldo/`)
  return datos.monedas.map(mapearSaldo)
}

/** Últimos movimientos de la caja, del más reciente al más antiguo. */
export async function listarMovimientos(
  cajaId: number,
  filtros: { moneda?: string; tipo?: TipoMovimiento; limite?: number } = {},
): Promise<MovimientoCaja[]> {
  const qs = new URLSearchParams()
  if (filtros.moneda) qs.set('moneda', filtros.moneda)
  if (filtros.tipo) qs.set('tipo', filtros.tipo)
  if (filtros.limite) qs.set('limite', String(filtros.limite))
  const sufijo = qs.toString() ? `?${qs}` : ''
  const datos = await apiFetch<MovimientoApi[]>(`/cajas/${cajaId}/movimientos/${sufijo}`)
  return datos.map(mapearMovimiento)
}

/**
 * Registra un ingreso, entrega o retiro y devuelve el saldo actualizado (RF58).
 *
 * @throws {ApiError} Con el mensaje del backend, por ejemplo si un retiro
 *   pide más billetes de los que hay.
 */
export async function registrarMovimiento(
  cajaId: number,
  datos: { tipo: TipoMovimiento; moneda: number; detalle: LineaBilletes[]; observacion?: string },
): Promise<{ movimiento: MovimientoCaja; saldo: SaldoMoneda[] }> {
  const res = await apiFetch<{ movimiento: MovimientoApi; monedas: SaldoMonedaApi[] }>(
    `/cajas/${cajaId}/movimientos/`,
    {
      method: 'POST',
      body: JSON.stringify({
        tipo: datos.tipo,
        moneda: datos.moneda,
        detalle: datos.detalle.filter(l => l.cantidad > 0),
        observacion: datos.observacion ?? '',
      }),
    },
  )
  return { movimiento: mapearMovimiento(res.movimiento), saldo: res.monedas.map(mapearSaldo) }
}

/** Últimos arqueos / cierres de turno de la caja. */
export async function listarArqueos(cajaId: number, limite = 10): Promise<Arqueo[]> {
  const datos = await apiFetch<ArqueoApi[]>(`/cajas/${cajaId}/arqueos/?limite=${limite}`)
  return datos.map(mapearArqueo)
}

/**
 * Registra un arqueo con lo contado físicamente. No modifica el saldo:
 * solo deja constancia (con diferencias, si las hay).
 */
export async function registrarArqueo(
  cajaId: number,
  conteo: LineaBilletes[],
  observacion = '',
): Promise<Arqueo> {
  const datos = await apiFetch<ArqueoApi>(`/cajas/${cajaId}/arqueos/`, {
    method: 'POST',
    body: JSON.stringify({ conteo, observacion }),
  })
  return mapearArqueo(datos)
}

/**
 * Formatea un monto según los decimales de la moneda (es-PY).
 *
 * @example formatearMonto(1500000, 0) // "1.500.000"
 */
export function formatearMonto(valor: number, decimales = 2): string {
  return valor.toLocaleString('es-PY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  })
}
