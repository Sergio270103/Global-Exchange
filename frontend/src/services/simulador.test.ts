/**
 * Pruebas del servicio del simulador (Sprint 2: RF20–RF22).
 *
 * Verifica que el backend entregue únicamente el precio final y que el
 * administrador pueda consultar los ajustes internos por categoría.
 *
 * @module simulador.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { simular, listarAjustesPrecio } from '@/services/simulador'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('simulador (precio final sin desglose interno)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/ajustes-precios/')) {
        return respuesta({ MINORISTA: 1.0, CORPORATIVO: 0.75, VIP: 0.5 })
      }
      if (String(url).includes('/simulador/')) {
        return respuesta({
          moneda: 'USD',
          moneda_contraparte: 'PYG',
          operacion: 'compra',
          monto_origen: 1000,
          tasa_aplicada: 7537.5,
          monto_total: 7537500,
          total_tipo: 'pagar',
          vigente_desde: '2026-09-13T00:00:00Z',
        })
      }
      return respuesta({})
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('devuelve la tasa y el total final', async () => {
    const r = await simular({ moneda: 'USD', monto: 1000, operacion: 'compra', clienteId: 1 })
    expect(r.tasa_aplicada).toBe(7537.5)
    expect(r.monto_total).toBe(7537500)
    expect(r.total_tipo).toBe('pagar')
    expect(r).not.toHaveProperty('comision_porcentaje')
    expect(r).not.toHaveProperty('comision_pyg')
  })

  it('envía la contraparte para simular un cruce', async () => {
    await simular({
      moneda: 'USD',
      monto: 100,
      operacion: 'venta',
      clienteId: 1,
      monedaContraparte: 'EUR',
    })
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('moneda_contraparte=EUR')
  })

  it('lista los ajustes internos por categoría para administración', async () => {
    const cs = await listarAjustesPrecio()
    expect(cs.VIP).toBe(0.5)
    expect(cs.MINORISTA).toBe(1.0)
  })

  it('propaga el mensaje de error del backend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      respuesta({ detail: 'Todavía no hay cotización para USD.' }, 404),
    ))
    await expect(
      simular({ moneda: 'USD', monto: 100, operacion: 'compra', clienteId: 1 }),
    ).rejects.toThrow('Todavía no hay cotización para USD.')
  })
})
