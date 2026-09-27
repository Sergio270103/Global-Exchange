/**
 * Pruebas PI-72 del servicio de cotizaciones.
 *
 * @module cotizaciones.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { vigentes, historial, crearCotizacion } from '@/services/cotizaciones'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const c1 = { id: 1, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', compra: '7400.00', venta: '7500.00', vigente_desde: '2026-09-13T10:00:00Z', creado_por: 'a' }
const c2 = { id: 2, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', compra: '7450.00', venta: '7550.00', vigente_desde: '2026-09-14T10:00:00Z', creado_por: 'a' }

describe('cotizaciones (servicio API)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/vigentes/')) return respuesta([c2])
      if (u.includes('/cotizaciones/') && method === 'GET') return respuesta([c2, c1])
      if (u.includes('/cotizaciones/') && method === 'POST') {
        const cuerpo = JSON.parse(String(init.body ?? '{}'))
        if (Number(cuerpo.venta) < Number(cuerpo.compra)) {
          return respuesta({ non_field_errors: ['La venta no puede ser menor que la compra.'] }, 400)
        }
        return respuesta({ id: 9, moneda: cuerpo.moneda, moneda_codigo: 'USD', moneda_nombre: 'Dólar', compra: String(cuerpo.compra), venta: String(cuerpo.venta), vigente_desde: new Date().toISOString(), creado_por: 't' }, 201)
      }
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('vigentes mapea números y bandera', async () => {
    const [v] = await vigentes()
    expect(v.moneda).toBe('USD')
    expect(v.venta).toBe(7550)
    expect(v.flag).toBe('🇺🇸')
  })

  it('historial ordena de antiguo a reciente y filtra por moneda', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const hs = await historial('USD', '2026-09-01', '2026-09-30')
    expect(hs.map(h => h.id)).toEqual([1, 2])
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('moneda=USD')
    expect(String(url)).toContain('desde=2026-09-01')
  })

  it('crea una tasa y propaga venta menor que compra', async () => {
    const creada = await crearCotizacion(2, 7400, 7500)
    expect(creada.compra).toBe(7400)
    await expect(crearCotizacion(2, 7600, 7500)).rejects.toThrow(
      'La venta no puede ser menor que la compra.',
    )
  })
})
