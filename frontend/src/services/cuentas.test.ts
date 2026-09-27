/**
 * Pruebas PI-72 del servicio de cuentas bancarias.
 *
 * @module cuentas.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listarCuentas,
  crearCuenta,
  actualizarCuenta,
  eliminarCuenta,
  cambiarEstadoCuenta,
} from '@/services/cuentas'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const cta = {
  id: 1, cliente: 1, cliente_nombre: 'Carlos', nombre: 'Carlos', apellido: 'M',
  cedula: '1', banco: 'Continental', numero_enmascarado: '•••• 4521',
  codigo_bancario: 'B', moneda: 1, moneda_codigo: 'PYG', activa: true,
}

describe('cuentas (servicio API)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/cuentas-bancarias/') && method === 'GET') return respuesta([cta])
      if (u.includes('/cuentas-bancarias/') && method === 'POST') {
        const cuerpo = JSON.parse(String(init.body ?? '{}'))
        if (String(cuerpo.numero_cuenta ?? '').replace(/\D/g, '').length < 6) {
          return respuesta({ numero_cuenta: ['Mínimo 6 dígitos.'] }, 400)
        }
        return respuesta({ ...cta, ...cuerpo, id: 9, numero_enmascarado: '•••• 5678' }, 201)
      }
      if (/\/cuentas-bancarias\/\d+\//.test(u) && method === 'DELETE') return respuesta({ ...cta, activa: false })
      if (/\/cuentas-bancarias\/\d+\//.test(u)) {
        return respuesta({ ...cta, ...JSON.parse(String(init.body ?? '{}')) })
      }
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lista enmascarando y mapea estado', async () => {
    const [cuenta] = await listarCuentas(1)
    expect(cuenta.account).toBe('•••• 4521')
    expect(cuenta.status).toBe('Activa')
    expect(cuenta.holder).toBe('Carlos M')
  })

  it('crea y propaga número corto', async () => {
    const creada = await crearCuenta({
      cliente: 1, firstName: 'Ana', lastName: 'L', document: '2',
      bank: 'Itaú', account: '12345678', code: 'I', moneda: 1,
    })
    expect(creada.id).toBe(9)
    await expect(crearCuenta({
      cliente: 1, firstName: 'Ana', lastName: 'L', document: '2',
      bank: 'Itaú', account: '123', code: 'I', moneda: 1,
    })).rejects.toThrow('Mínimo 6 dígitos.')
  })

  it('edita sin reenviar número vacío y cambia estado', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    await actualizarCuenta(1, {
      firstName: 'C', lastName: 'G', document: '1',
      bank: 'Continental', account: '', code: 'B', moneda: 1,
    })
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/cuentas-bancarias/1/')) as [string, RequestInit]
    expect(JSON.parse(String(init.body))).not.toHaveProperty('numero_cuenta')
    const desactivada = await cambiarEstadoCuenta(1, false)
    expect(desactivada.status).toBe('Inactiva')
    await eliminarCuenta(1)
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes('/cuentas-bancarias/1/') && (i as RequestInit).method === 'DELETE')).toBe(true)
  })
})
