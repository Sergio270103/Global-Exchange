/**
 * Pruebas del servicio del simulador (Sprint 2: RF20–RF22).
 *
 * Verifica que el desglose del backend (tasa, bruto, comisión, neto)
 * llegue intacto a la UI y que las comisiones por categoría se lean.
 *
 * @module simulador.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { simular, listarComisiones } from '@/services/simulador'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('simulador (conversión con tasa vigente y comisión)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/comisiones/')) {
        return respuesta({ MINORISTA: 1.0, CORPORATIVO: 0.75, VIP: 0.5 })
      }
      if (String(url).includes('/simulador/')) {
        return respuesta({
          moneda: 'USD',
          operacion: 'compra',
          monto_origen: 1000,
          tasa_aplicada: 7500,
          monto_bruto_pyg: 7500000,
          categoria: 'VIP',
          comision_porcentaje: 0.5,
          comision_pyg: 37500,
          monto_neto_pyg: 7462500,
          vigente_desde: '2026-09-13T00:00:00Z',
        })
      }
      return respuesta({})
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('devuelve el desglose completo de la simulación', async () => {
    const r = await simular({ moneda: 'USD', monto: 1000, operacion: 'compra', categoria: 'VIP' })
    expect(r.tasa_aplicada).toBe(7500)
    expect(r.monto_bruto_pyg).toBe(7500000)
    expect(r.comision_pyg).toBe(37500)
    expect(r.monto_neto_pyg).toBe(7462500)
  })

  it('lista las comisiones configuradas por categoría', async () => {
    const cs = await listarComisiones()
    expect(cs.VIP).toBe(0.5)
    expect(cs.MINORISTA).toBe(1.0)
  })

  it('propaga el mensaje de error del backend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      respuesta({ detail: 'Todavía no hay cotización para USD.' }, 404),
    ))
    await expect(
      simular({ moneda: 'USD', monto: 100, operacion: 'compra', categoria: 'MINORISTA' }),
    ).rejects.toThrow('Todavía no hay cotización para USD.')
  })
})
