/**
 * Servicio de cotizaciones contra la API Django.
 *
 * - `vigentes()`: última tasa de cada moneda activa (tasas del día, RF31).
 * - `historial()`: evolución por moneda y rango de fechas (RF32/RF33).
 * - `crearCotizacion()`: alta manual de tasa, solo admin/analista
 *   (RF41/RF47). Cada alta crea un registro nuevo en el historial.
 *
 * @module services/cotizaciones
 */
import { apiFetch } from '@/services/api'
import { banderaDesdeCodigo } from '@/services/monedas'

/** Cotización tal como la devuelve el backend. */
export interface Cotizacion {
  id: number
  /** Código ISO de la moneda, ej. `USD`. */
  moneda: string
  nombre: string
  flag: string
  compra: number
  venta: number
  vigente_desde: string
  creado_por: string
}

interface CotizacionApi {
  id: number
  moneda: number
  moneda_codigo: string
  moneda_nombre: string
  compra: string
  venta: string
  vigente_desde: string
  creado_por: string
}

function mapear(c: CotizacionApi): Cotizacion {
  return {
    id: c.id,
    moneda: c.moneda_codigo,
    nombre: c.moneda_nombre,
    flag: banderaDesdeCodigo(c.moneda_codigo),
    compra: Number(c.compra),
    venta: Number(c.venta),
    vigente_desde: c.vigente_desde,
    creado_por: c.creado_por,
  }
}

/**
 * Última cotización de cada moneda activa.
 *
 * @returns Las tasas vigentes del día.
 */
export async function vigentes(): Promise<Cotizacion[]> {
  const datos = await apiFetch<CotizacionApi[]>('/cotizaciones/vigentes/')
  return datos.map(mapear)
}

/**
 * Historial de una moneda en un rango de fechas, ordenado de más
 * antiguo a más reciente (listo para graficar).
 */
export async function historial(
  moneda: string,
  desde?: string,
  hasta?: string,
): Promise<Cotizacion[]> {
  const qs = new URLSearchParams({ moneda })
  if (desde) qs.set('desde', desde)
  if (hasta) qs.set('hasta', hasta)
  const datos = await apiFetch<CotizacionApi[]>(`/cotizaciones/?${qs}`)
  return datos.map(mapear).reverse()
}

/**
 * Registra una tasa manualmente (solo admin o analista cambiario).
 *
 * @param monedaId - Id de la moneda en el catálogo.
 * @param compra - Precio de compra en guaraníes.
 * @param venta - Precio de venta en guaraníes.
 */
export async function crearCotizacion(
  monedaId: number,
  compra: number,
  venta: number,
): Promise<Cotizacion> {
  const creada = await apiFetch<CotizacionApi>('/cotizaciones/', {
    method: 'POST',
    body: JSON.stringify({ moneda: monedaId, compra, venta }),
  })
  return mapear(creada)
}
