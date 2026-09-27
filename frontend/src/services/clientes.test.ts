/**
 * Pruebas PI-72 del servicio de clientes y asociaciones.
 *
 * @module clientes.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listarClientes,
  crearCliente,
  actualizarCliente,
  cambiarEstadoCliente,
  eliminarCliente,
  listarAsociaciones,
  crearAsociacion,
  eliminarAsociacion,
  misClientes,
  categoriaUI,
  categoriaAPI,
} from '@/services/clientes'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const carlos = { id: 1, nombre: 'Carlos', documento: '1', email: 'c@x.com', tipo: 'FISICA', categoria: 'MINORISTA', activo: true, creado_en: '' }

describe('clientes (servicio API)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/asociaciones/') && method === 'GET') {
        return respuesta([{ id: 1, cliente: 1, cliente_nombre: 'Carlos', keycloak_id: 's', username: 'c', email: 'c@x.com' }])
      }
      if (u.includes('/asociaciones/') && method === 'POST') {
        const cuerpo = JSON.parse(String(init.body ?? '{}'))
        return respuesta({ id: 9, cliente_nombre: 'Carlos', ...cuerpo }, 201)
      }
      if (u.includes('/asociaciones/')) return respuesta({})
      if (u.includes('/clientes/') && method === 'GET') return respuesta([carlos])
      if (u.includes('/clientes/') && method === 'POST') {
        return respuesta({ id: 9, creado_en: '', ...JSON.parse(String(init.body ?? '{}')) }, 201)
      }
      if (/\/clientes\/\d+\//.test(u)) {
        const cuerpo = JSON.parse(String(init.body ?? '{}'))
        return respuesta({ ...carlos, ...cuerpo })
      }
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lista con filtros por query', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const lista = await listarClientes({ buscar: 'car', categoria: 'MINORISTA', activo: true })
    expect(lista).toHaveLength(1)
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('buscar=car')
  })

  it('CRUD completo del cliente', async () => {
    const creado = await crearCliente({ nombre: 'N', documento: '9', email: 'n@x.com', tipo: 'JURIDICA', categoria: 'VIP' })
    expect(creado.id).toBe(9)
    const actualizado = await actualizarCliente(1, { nombre: 'C2' })
    expect(actualizado.nombre).toBe('C2')
    const apagado = await cambiarEstadoCliente(1, false)
    expect(apagado.activo).toBe(false)
    await eliminarCliente(1)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const deletes = fetchMock.mock.calls.filter(([, i]) => (i as RequestInit).method === 'DELETE')
    expect(deletes).toHaveLength(0)
    const patches = fetchMock.mock.calls.filter(([, i]) => (i as RequestInit).method === 'PATCH')
    expect(patches.length).toBeGreaterThanOrEqual(2)
  })

  it('asociaciones y mis clientes', async () => {
    const mios = await misClientes()
    expect(mios).toEqual([{ id: 1, nombre: 'Carlos' }])
    const asocs = await listarAsociaciones(1)
    expect(asocs).toHaveLength(1)
    const creada = await crearAsociacion({ cliente: 1, keycloak_id: 's2', username: 'u', email: 'u@x.com' })
    expect(creada.id).toBe(9)
    await eliminarAsociacion(9)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes('/asociaciones/9/') && (i as RequestInit).method === 'DELETE')).toBe(true)
  })

  it('mapea categorías en ambos sentidos', () => {
    expect(categoriaUI('MINORISTA')).toBe('Minorista')
    expect(categoriaUI('CORPORATIVO')).toBe('Corporativo')
    expect(categoriaUI('VIP')).toBe('VIP')
    expect(categoriaAPI('Corporativo')).toBe('CORPORATIVO')
    expect(categoriaAPI('vip')).toBe('VIP')
    expect(categoriaAPI('otro')).toBe('MINORISTA')
  })
})
