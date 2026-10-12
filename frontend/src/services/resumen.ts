/**
 * Resumen agregado para el dashboard del administrador.
 *
 * Consume `GET /api/operaciones/resumen/` (solo admin): volumen bruto
 * operado en PYG, conteo histórico de PAGADA con desglose compra/venta
 * y ganancias por comisión con su desglose por moneda. El serializer
 * público oculta `monto_comision`, por eso este agregado vive en el
 * backend y no se calcula en el frontend.
 *
 * @module services/resumen
 */
import { apiFetch } from '@/services/api'

/** Comisiones acumuladas en una moneda destino. */
export interface ComisionPorMoneda {
  /** Código ISO, ej. `USD`. */
  moneda: string
  /** Total de comisiones en esa moneda. */
  total: number
  /** Equivalente en guaraníes con la última venta vigente. */
  equivalente_pyg: number
}

/** Agregado del endpoint de resumen (solo operaciones PAGADA). */
export interface ResumenOperaciones {
  /** Volumen bruto operado (compra + venta) en guaraníes. */
  volumen_total_pyg: number
  /** Cantidad histórica de operaciones PAGADA. */
  total_operaciones: number
  compras: number
  ventas: number
  /** Total de comisiones en guaraníes. */
  ganancias_pyg: number
  comisiones_por_moneda: ComisionPorMoneda[]
  /** PAGADA sin cotización vigente (cuentan pero no suman en PYG). */
  operaciones_sin_tasa: number
}

interface ResumenApi {
  volumen_total_pyg: number
  total_operaciones: number
  compras: number
  ventas: number
  ganancias_pyg: number
  comisiones_por_moneda: { moneda: string; total: number; equivalente_pyg: number }[]
  operaciones_sin_tasa: number
}

function numero(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

/**
 * Obtiene el resumen agregado de operaciones (solo admin).
 *
 * @returns Volumen, conteo, ganancias y comisiones por moneda.
 */
export async function obtenerResumen(): Promise<ResumenOperaciones> {
  const datos = await apiFetch<ResumenApi>('/operaciones/resumen/')
  return {
    volumen_total_pyg: numero(datos.volumen_total_pyg),
    total_operaciones: numero(datos.total_operaciones),
    compras: numero(datos.compras),
    ventas: numero(datos.ventas),
    ganancias_pyg: numero(datos.ganancias_pyg),
    comisiones_por_moneda: (datos.comisiones_por_moneda ?? []).map(c => ({
      moneda: String(c.moneda ?? ''),
      total: numero(c.total),
      equivalente_pyg: numero(c.equivalente_pyg),
    })),
    operaciones_sin_tasa: numero(datos.operaciones_sin_tasa),
  }
}
