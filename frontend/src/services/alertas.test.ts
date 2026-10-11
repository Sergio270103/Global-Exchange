/**
 * Pruebas PI-38 del servicio de alertas de tasas.
 *
 * @module alertas.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listarAlertas,
  crearAlerta,
  actualizarAlerta,
  eliminarAlerta,
  historialDisparos,
} from '@/services/alertas'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const alertaApi = {
  id: 1, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar',
  umbral: '7500.00', direccion: 'supera', estado: 'activa',
  creado: '2026-10-10T10:00:00Z', actualizado: '2026-10-10T10:00:00Z',
}
const disparoApi = {
  id: 4, alerta: 1, moneda_codigo: 'USD', tasa_alcanzada: '7550.00',
  umbral: '7500.00', direccion: 'supera', creado: '2026-10-10T11:00:00Z',
}

describe('alertas (servicio API)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.endsWith('/alertas/') && method === 'GET') return respuesta([alertaApi])
      if (u.endsWith('/alertas/') && method === 'POST') {
        const cuerpo = JSON.parse(String(init.body ?? '{}'))
        if (Number(cuerpo.umbral) <= 0) return respuesta({ umbral: ['Mayor a cero.'] }, 400)
        return respuesta({ ...alertaApi, ...cuerpo, id: 2 }, 201)
      }
      if (/\/alertas\/\d+\//.test(u) && method === 'PATCH') {
        return respuesta({ ...alertaApi, ...JSON.parse(String(init.body ?? '{}')) })
      }
      if (/\/alertas\/\d+\//.test(u) && method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      if (u.includes('/alertas/historial/')) return respuesta([disparoApi])
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lista alertas mapeando el umbral a número', async () => {
    const lista = await listarAlertas()
    expect(lista).toHaveLength(1)
    expect(lista[0].umbral).toBe(7500)
    expect(lista[0].moneda_codigo).toBe('USD')
  })

  it('crea con moneda, umbral y dirección', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const creada = await crearAlerta(2, 7500, 'supera')
    expect(creada.id).toBe(2)
    const [, init] = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/alertas/') && (i as RequestInit).method === 'POST') as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ moneda: 2, umbral: 7500, direccion: 'supera' })
  })

  it('propaga el error de umbral inválido', async () => {
    await expect(crearAlerta(2, 0, 'supera')).rejects.toThrow('Mayor a cero.')
  })

  it('actualiza (editar y pausar) con PATCH', async () => {
    const editada = await actualizarAlerta(1, { umbral: 7600 })
    expect(editada.umbral).toBe(7600)
    const pausada = await actualizarAlerta(1, { estado: 'pausada' })
    expect(pausada.estado).toBe('pausada')
  })

  it('elimina con DELETE', async () => {
    await expect(eliminarAlerta(1)).resolves.toBeUndefined()
  })

  it('trae el historial mapeando la tasa a número', async () => {
    const historial = await historialDisparos()
    expect(historial).toHaveLength(1)
    expect(historial[0].tasa_alcanzada).toBe(7550)
  })
})
