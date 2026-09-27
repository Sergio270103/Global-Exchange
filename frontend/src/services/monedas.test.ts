/**
 * Pruebas PI-72 del servicio de monedas.
 *
 * @module monedas.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listarMonedas,
  crearMoneda,
  actualizarMoneda,
  cambiarEstado,
  banderaDesdeCodigo,
} from '@/services/monedas'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const usd = { id: 2, codigo: 'USD', nombre: 'Dólar', simbolo: '$', decimales: 2, pais_iso: 'US', activo: true }
const ars = { id: 5, codigo: 'ARS', nombre: 'Peso', simbolo: '$', decimales: 2, pais_iso: 'AR', activo: false }

describe('monedas (servicio API)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/monedas/') && method === 'GET') {
        if (u.includes('activo=true')) return respuesta([usd])
        return respuesta([usd, ars])
      }
      if (u.includes('/monedas/') && method === 'POST') {
        const cuerpo = JSON.parse(String(init.body ?? '{}'))
        if (cuerpo.codigo === 'USD') return respuesta({ codigo: ['Ya existe.'] }, 400)
        return respuesta({ id: 9, ...cuerpo, pais_iso: 'GB', activo: true }, 201)
      }
      if (u.includes('/estado/')) {
        return respuesta({ ...usd, activo: JSON.parse(String(init.body)).activo })
      }
      if (/\/monedas\/\d+\//.test(u)) {
        return respuesta({ ...usd, ...JSON.parse(String(init.body ?? '{}')) })
      }
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lista y ordena por código con bandera derivada', async () => {
    const lista = await listarMonedas()
    expect(lista.map(m => m.code)).toEqual(['ARS', 'USD'])
    expect(lista.find(m => m.code === 'USD')?.flag).toBe('🇺🇸')
  })

  it('lista solo activas con ?activo=true', async () => {
    const lista = await listarMonedas(true)
    expect(lista.map(m => m.code)).toEqual(['USD'])
  })

  it('crea enviando pais_iso derivado del código', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const creada = await crearMoneda({ code: 'gbp', name: 'Libra', symbol: '£', flag: '🇬🇧', decimals: 2 })
    expect(creada.code).toBe('GBP')
    const [, init] = fetchMock.mock.calls.find(([u, i]) => String(u).includes('/monedas/') && (i as RequestInit).method === 'POST') as [string, RequestInit]
    expect(JSON.parse(String(init.body)).pais_iso).toBe('GB')
  })

  it('propaga el error de código duplicado', async () => {
    await expect(
      crearMoneda({ code: 'USD', name: 'Otro', symbol: '$', flag: '🇺🇸', decimals: 2 }),
    ).rejects.toThrow('Ya existe.')
  })

  it('actualiza con PATCH y cambia estado por /estado/', async () => {
    const actualizada = await actualizarMoneda(2, { code: 'USD', name: 'Dólar USA', symbol: '$', flag: '🇺🇸', decimals: 2 })
    expect(actualizada.name).toBe('Dólar USA')
    const apagada = await cambiarEstado(2, false)
    expect(apagada.active).toBe(false)
  })

  it('banderaDesdeCodigo deriva o devuelve neutra', () => {
    expect(banderaDesdeCodigo('USD')).toBe('🇺🇸')
    expect(banderaDesdeCodigo('x')).toBe('🏳️')
  })
})
