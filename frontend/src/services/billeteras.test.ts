/**
 * Pruebas PI-72 del servicio de billeteras y medios (cobertura extra del
 * módulo PI-66: listar, crear, defecto y borrado).
 *
 * @module billeteras2.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listarBilleteras,
  listarMedios,
  crearMedio,
  marcarDefault,
  eliminarMedio,
} from '@/services/billeteras'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('billeteras (servicio API)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/billeteras/')) {
        return respuesta([
          { id: 1, cliente: 1, moneda: 1, moneda_codigo: 'PYG', moneda_nombre: 'Guaraní', saldo: '0.00' },
        ])
      }
      if (u.includes('/medios-acreditacion/') && method === 'GET') {
        return respuesta([
          { id: 1, cliente: 1, cliente_nombre: 'C', tipo: 'BILLETERA', tipo_display: 'Billetera digital', billetera: 1, cuenta: null, destino_detalle: 'Billetera PYG', es_default: true },
        ])
      }
      if (u.includes('/medios-acreditacion/') && method === 'POST') {
        const cuerpo = JSON.parse(String(init.body ?? '{}'))
        if (!cuerpo.billetera && !cuerpo.cuenta) {
          return respuesta({ non_field_errors: ['Falta destino.'] }, 400)
        }
        return respuesta({ id: 9, cliente_nombre: 'C', tipo_display: 'X', destino_detalle: 'Y', ...cuerpo }, 201)
      }
      if (/\/medios-acreditacion\/\d+\//.test(u) && method === 'PATCH') {
        return respuesta({ id: 1, es_default: true })
      }
      if (/\/medios-acreditacion\/\d+\//.test(u)) return respuesta({})
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lista saldos con bandera y número', async () => {
    const [b] = await listarBilleteras(1)
    expect(b.moneda_codigo).toBe('PYG')
    expect(b.saldo).toBe(0)
    expect(b.flag).toBe('🇵🇾')
  })

  it('CRUD de medios con defecto', async () => {
    const [m] = await listarMedios(1)
    expect(m.es_default).toBe(true)
    const creado = await crearMedio({ cliente: 1, tipo: 'BILLETERA', billetera: 1, es_default: false })
    expect(creado.id).toBe(9)
    await expect(crearMedio({ cliente: 1, tipo: 'CUENTA' })).rejects.toThrow('Falta destino.')
    expect((await marcarDefault(1)).es_default).toBe(true)
    await eliminarMedio(1)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes('/medios-acreditacion/1/') && (i as RequestInit).method === 'DELETE')).toBe(true)
  })
})
