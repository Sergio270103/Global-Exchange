/**
 * Pruebas PI-72 del servicio de métodos de pago globales.
 *
 * @module metodos.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listarMetodos, cambiarEstadoMetodo } from '@/services/metodos'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('metodos (servicio API)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/metodos-pago/') && method === 'GET') {
        return respuesta([
          { id: 1, codigo: 'transfer', nombre: 'Transferencia', activo: true },
          { id: 2, codigo: 'qr', nombre: 'QR', activo: false },
        ])
      }
      if (/\/metodos-pago\/\d+\//.test(u)) {
        return respuesta({ id: 1, codigo: 'transfer', nombre: 'Transferencia', activo: JSON.parse(String(init.body)).activo })
      }
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lista el catálogo', async () => {
    const lista = await listarMetodos()
    expect(lista.map(m => m.codigo)).toEqual(['transfer', 'qr'])
  })

  it('habilita o deshabilita con PATCH', async () => {
    expect((await cambiarEstadoMetodo(1, false)).activo).toBe(false)
    expect((await cambiarEstadoMetodo(1, true)).activo).toBe(true)
  })
})
