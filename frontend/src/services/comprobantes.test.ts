/**
 * Pruebas PI-42 del servicio de comprobantes internos.
 *
 * @module comprobantes.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  emitirComprobante,
  listarComprobantes,
  obtenerComprobante,
} from '@/services/comprobantes'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const comprobanteApi = {
  id: 1, numero: 'CPB-000001', operacion: 9,
  cliente_nombre: 'Ana Barrios', cliente_documento: '4589201',
  tipo_operacion: 'COMPRA', moneda_origen_codigo: 'PYG',
  moneda_destino_codigo: 'USD', monto_enviado: '757500.00',
  monto_recibido: '100.00', tasa_origen: '1.000000',
  tasa_destino: '7500.000000', monto_comision: '7500.00',
  metodo_pago: 'efectivo', fecha_operacion: '2026-10-11T10:00:00Z',
  cajero_sub: 'sub-caja', cajero_nombre: 'Cajero',
  estado: 'emitido', creado: '2026-10-11T10:00:00Z',
}

describe('comprobantes (servicio API)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.endsWith('/comprobantes/') && method === 'POST') {
        const cuerpo = JSON.parse(String(init.body ?? '{}'))
        if (cuerpo.operacion === 404) return respuesta({ detail: 'La operación no existe.' }, 404)
        return respuesta({ ...comprobanteApi, operacion: cuerpo.operacion }, 201)
      }
      if (/\/comprobantes\/\d+\//.test(u)) return respuesta(comprobanteApi)
      if (u.endsWith('/comprobantes/')) return respuesta([comprobanteApi])
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('emite con número único y montos mapeados', async () => {
    const c = await emitirComprobante(9)
    expect(c.numero).toBe('CPB-000001')
    expect(c.monto_enviado).toBe(757500)
    expect(c.monto_recibido).toBe(100)
    expect(c.cajero_nombre).toBe('Cajero')
  })

  it('propaga el error de operación inexistente', async () => {
    await expect(emitirComprobante(404)).rejects.toThrow('La operación no existe.')
  })

  it('lista el historial y obtiene el detalle', async () => {
    const lista = await listarComprobantes()
    expect(lista).toHaveLength(1)
    const uno = await obtenerComprobante(1)
    expect(uno.numero).toBe('CPB-000001')
  })
})
