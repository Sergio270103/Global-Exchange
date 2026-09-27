/**
 * Pruebas PI-71: Monedas muestra la cotización vigente y permite
 * registrar la tasa actual por moneda, tenga o no historial previo.
 *
 * @module Currencies.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Currencies from '@/pages/admin/Currencies'

let vigentes = [
  { id: 1, moneda: 1, moneda_codigo: 'USD', moneda_nombre: 'Dólar', compra: '7400.00', venta: '7500.00', vigente_desde: new Date().toISOString(), creado_por: 'admin' },
]

const monedas = [
  { id: 1, codigo: 'USD', nombre: 'Dólar', simbolo: '$', decimales: 2, pais_iso: 'US', activo: true },
  { id: 2, codigo: 'ARS', nombre: 'Peso Argentino', simbolo: '$', decimales: 2, pais_iso: 'AR', activo: true },
  { id: 3, codigo: 'PYG', nombre: 'Guaraní', simbolo: '₲', decimales: 0, pais_iso: 'PY', activo: true },
]

const porId: Record<number, string> = { 1: 'USD', 2: 'ARS' }

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch() {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url)
    const method = (init.method ?? 'GET').toUpperCase()
    if (u.includes('/cotizaciones/vigentes/')) return respuesta(vigentes)
    if (u.includes('/cotizaciones/') && method === 'POST') {
      const cuerpo = JSON.parse(String(init.body ?? '{}'))
      const code = porId[Number(cuerpo.moneda)] ?? 'USD'
      const nueva = {
        id: 99,
        moneda: cuerpo.moneda,
        moneda_codigo: code,
        moneda_nombre: code,
        compra: String(cuerpo.compra),
        venta: String(cuerpo.venta),
        vigente_desde: new Date().toISOString(),
        creado_por: 'admin',
      }
      vigentes = [...vigentes.filter(v => v.moneda_codigo !== code), nueva]
      return respuesta(nueva, 201)
    }
    if (u.includes('/monedas/')) return respuesta(monedas)
    return respuesta([])
  })
}

const admin = { name: 'María', email: 'maria@x.com', role: 'admin' as const, avatar: '' }

describe('Currencies PI-71 (vigente + alta de tasa por moneda)', () => {
  beforeEach(() => {
    vigentes = [
      { id: 1, moneda: 1, moneda_codigo: 'USD', moneda_nombre: 'Dólar', compra: '7400.00', venta: '7500.00', vigente_desde: new Date().toISOString(), creado_por: 'admin' },
    ]
    vi.stubGlobal('fetch', mockFetch())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra la vigente de USD y el aviso sin cotización en ARS', async () => {
    render(<Currencies auth={admin} />)
    const cardUSD = await screen.findByTestId('moneda-USD')
    expect(within(cardUSD).getByText(/C ₲7[.,]400 · V ₲7[.,]500/)).toBeInTheDocument()
    const cardARS = screen.getByTestId('moneda-ARS')
    expect(within(cardARS).getByText('Sin cotización')).toBeInTheDocument()
  })

  it('el guaraní es moneda base: sin aviso de falta ni botón de tasa', async () => {
    render(<Currencies auth={admin} />)
    const cardPYG = await screen.findByTestId('moneda-PYG')
    expect(within(cardPYG).getByText('Moneda base')).toBeInTheDocument()
    expect(within(cardPYG).queryByText('Sin cotización')).not.toBeInTheDocument()
    expect(within(cardPYG).queryByRole('button', { name: 'Registrar tasa de PYG' })).not.toBeInTheDocument()
  })

  it('registra la primera tasa de ARS desde su tarjeta', async () => {
    const user = userEvent.setup()
    render(<Currencies auth={admin} />)
    const cardARS = await screen.findByTestId('moneda-ARS')
    await user.click(within(cardARS).getByRole('button', { name: 'Registrar tasa de ARS' }))
    expect(screen.getByText('Registrar tasa — ARS')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Compra (₲)'), '520')
    await user.type(screen.getByLabelText('Venta (₲)'), '580')
    await user.click(screen.getByRole('button', { name: 'Guardar tasa' }))
    await vi.waitFor(() => {
      expect(within(screen.getByTestId('moneda-ARS')).queryByText('Sin cotización')).not.toBeInTheDocument()
    })
    expect(within(screen.getByTestId('moneda-ARS')).getByText(/C ₲520 · V ₲580/)).toBeInTheDocument()
  })
})
