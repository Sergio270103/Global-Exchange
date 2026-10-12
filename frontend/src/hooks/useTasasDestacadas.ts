/**
 * Tasas destacadas con datos reales para los dashboards.
 *
 * Consume `vigentes()` (solo monedas activas con cotización) y calcula
 * la variación porcentual contra la cotización anterior de cada moneda
 * (`historial()`). Si la API falla, respalda a los mocks locales. Se
 * comparte entre el dashboard del administrador y el del usuario.
 *
 * @module hooks/useTasasDestacadas
 */
import { useEffect, useState } from 'react'
import { exchangeRates as mockRates } from '@/data/mockData'
import { historial, vigentes } from '@/services/cotizaciones'

/** Tasa vigente con su variación vs la cotización anterior. */
export interface TasaDestacada {
  moneda: string
  flag: string
  venta: number
  cambio: number
}

async function cambioVsAnterior(moneda: string): Promise<number> {
  try {
    const hist = await historial(moneda)
    const ventas = hist.map(h => h.venta).filter(v => Number.isFinite(v))
    if (ventas.length < 2) return 0
    const [anterior, ultima] = ventas.slice(-2)
    if (!anterior) return 0
    return ((ultima - anterior) / anterior) * 100
  } catch {
    return 0
  }
}

/**
 * Devuelve las tasas vigentes con su variación.
 *
 * @returns Lista vacía mientras carga (el llamador muestra "Cargando…").
 */
export function useTasasDestacadas(): TasaDestacada[] {
  const [tasas, setTasas] = useState<TasaDestacada[]>([])

  useEffect(() => {
    let vivo = true
    vigentes()
      .then(async lista => {
        const destacadas = await Promise.all(
          lista.map(async c => ({
            moneda: c.moneda,
            flag: c.flag,
            venta: c.venta,
            cambio: await cambioVsAnterior(c.moneda),
          })),
        )
        if (vivo) setTasas(destacadas)
      })
      .catch(() => {
        if (vivo) {
          setTasas(mockRates.map(r => ({ moneda: r.currency, flag: r.flag, venta: r.sell, cambio: r.change })))
        }
      })
    return () => { vivo = false }
  }, [])

  return tasas
}
