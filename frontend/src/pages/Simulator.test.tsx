/**
 * Pruebas PI-72 del simulador contra la API (tasas vigentes + cálculo).
 *
 * @module Simulator.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Simulator from '@/pages/Simulator'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Simulator (API)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/cotizaciones/vigentes/')) {
        return respuesta([
          { id: 1, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', compra: '7400', venta: '7500', vigente_desde: new Date().toISOString(), creado_por: 'a' },
        ])
      }
      if (u.includes('/simulador/')) {
        return respuesta({
          moneda: 'USD', moneda_contraparte: 'PYG', operacion: 'compra', monto_origen: 100,
          tasa_aplicada: 7575, monto_total: 757500, total_tipo: 'pagar',
          vigente_desde: new Date().toISOString(),
        })
      }
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra encabezado, tasas del día y simula con precio final', async () => {
    const user = userEvent.setup()
    render(<Simulator currentClient={{ id: 1, nombre: 'Cliente Prueba' }} />)
    expect(await screen.findByText('Simulador de conversión')).toBeInTheDocument()
    expect(screen.getByText('Tasas del día')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Monto'))
    await user.type(screen.getByLabelText('Monto'), '100')
    await user.click(screen.getByRole('button', { name: 'Simular conversión' }))
    expect(await screen.findByText('Total a pagar')).toBeInTheDocument()
    expect(screen.getByText('Tasa final')).toBeInTheDocument()
    expect(screen.queryByText(/Comisión/)).not.toBeInTheDocument()
  })
})

/**
 * PI-26: origen + destino conectados al catálogo, como comprar/vender.
 */
describe('Simulator (origen y destino)', () => {
  const catalogo = [
    { id: 1, codigo: 'PYG', nombre: 'Guaraní', simbolo: '₲', decimales: 0, pais_iso: 'PY', activo: true },
    { id: 2, codigo: 'USD', nombre: 'Dólar', simbolo: '$', decimales: 2, pais_iso: 'US', activo: true },
    { id: 3, codigo: 'EUR', nombre: 'Euro', simbolo: '€', decimales: 2, pais_iso: 'EU', activo: true },
  ]

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/cotizaciones/vigentes/')) {
        return respuesta([
          { id: 1, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', compra: '7400', venta: '7500', vigente_desde: new Date().toISOString(), creado_por: 'a' },
          { id: 2, moneda: 3, moneda_codigo: 'EUR', moneda_nombre: 'Euro', compra: '8200', venta: '8300', vigente_desde: new Date().toISOString(), creado_por: 'a' },
        ])
      }
      if (u.includes('/monedas/')) return respuesta(catalogo)
      if (u.includes('/simulador/')) {
        const qs = new URL(u).searchParams
        const contra = qs.get('moneda_contraparte') ?? 'PYG'
        return respuesta({
          moneda: qs.get('moneda') ?? 'USD', moneda_contraparte: contra, operacion: 'compra',
          monto_origen: 100, tasa_aplicada: 0.9, monto_total: 90, total_tipo: 'recibir',
          vigente_desde: new Date().toISOString(),
        })
      }
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra origen y destino desde el catálogo con PYG disponible', async () => {
    render(<Simulator currentClient={{ id: 1, nombre: 'Cliente Prueba' }} />)
    const origen = await screen.findByLabelText('Moneda (origen)')
    const destino = screen.getByLabelText('Moneda (destino)')
    expect(origen).toHaveValue('USD')
    expect(destino).toHaveValue('PYG')
    expect(destino.textContent).toContain('EUR')
  })

  it('ajusta el destino si el origen lo iguala', async () => {
    const user = userEvent.setup()
    render(<Simulator currentClient={{ id: 1, nombre: 'Cliente Prueba' }} />)
    const origen = await screen.findByLabelText('Moneda (origen)')
    const destino = screen.getByLabelText('Moneda (destino)')
    await user.selectOptions(destino, 'EUR')
    expect(destino).toHaveValue('EUR')
    await user.selectOptions(origen, 'EUR')
    // EUR como origen aparta a EUR del destino: vuelve a PYG.
    expect(destino).toHaveValue('PYG')
  })

  it('expresa el resultado en la moneda destino', async () => {
    const user = userEvent.setup()
    render(<Simulator currentClient={{ id: 1, nombre: 'Cliente Prueba' }} />)
    const destino = await screen.findByLabelText('Moneda (destino)')
    await user.selectOptions(destino, 'EUR')
    await user.clear(screen.getByLabelText('Monto'))
    await user.type(screen.getByLabelText('Monto'), '100')
    await user.click(screen.getByRole('button', { name: 'Simular conversión' }))
    expect(await screen.findByText('Total a recibir')).toBeInTheDocument()
    expect(screen.getByText(/€ 90,00 EUR/)).toBeInTheDocument()
  })
})
