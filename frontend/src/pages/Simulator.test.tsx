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
