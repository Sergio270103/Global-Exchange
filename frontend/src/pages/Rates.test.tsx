import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Rates from '@/pages/Rates'

const vigentes = [
  { id: 1, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar Americano', compra: '7580.00', venta: '7650.00', vigente_desde: new Date().toISOString(), creado_por: 'admin' },
  { id: 2, moneda: 3, moneda_codigo: 'EUR', moneda_nombre: 'Euro', compra: '8250.00', venta: '8340.00', vigente_desde: new Date().toISOString(), creado_por: 'admin' },
  { id: 3, moneda: 4, moneda_codigo: 'BRL', moneda_nombre: 'Real Brasileño', compra: '1380.00', venta: '1420.00', vigente_desde: new Date().toISOString(), creado_por: 'admin' },
]

function puntos(moneda: string) {
  const base = vigentes.find(v => v.moneda_codigo === moneda) ?? vigentes[0]
  return [0, 1, 2, 3, 4].map(i => ({
    ...base,
    id: 100 + i,
    compra: String(Number(base.compra) + i * 10),
    venta: String(Number(base.venta) + i * 10),
    vigente_desde: new Date(Date.now() - (4 - i) * 86400000).toISOString(),
  }))
}

function mockFetch() {
  return vi.fn(async (url: string) => {
    let data: unknown = []
    if (typeof url === 'string' && url.includes('/cotizaciones/vigentes/')) {
      data = vigentes
    } else if (typeof url === 'string' && url.includes('/cotizaciones/')) {
      const moneda = new URL(url, 'http://x').searchParams.get('moneda') ?? 'USD'
      data = puntos(moneda)
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

describe('Rates (tasas de cambio con histórico)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra las tasas en tiempo real con todas las monedas', async () => {
    render(<Rates />)
    expect(await screen.findByText('Tasas en tiempo real')).toBeInTheDocument()
    expect(screen.getByText('Dólar Americano')).toBeInTheDocument()
    expect(screen.getByText('Euro')).toBeInTheDocument()
    expect(screen.getByText('Real Brasileño')).toBeInTheDocument()
  })

  it('comienza con USD seleccionado y muestra su evolución histórica', async () => {
    render(<Rates />)
    expect(await screen.findByText('Evolución histórica — USD')).toBeInTheDocument()
    expect(screen.getByText('Compra actual')).toBeInTheDocument()
    expect(screen.getByText('Venta actual')).toBeInTheDocument()
  })

  it('cambia la moneda seleccionada al hacer clic en una tarjeta', async () => {
    const user = userEvent.setup()
    render(<Rates />)
    await screen.findByText('Euro')
    const eurCard = screen.getByText('Euro').closest('.rounded-xl')!
    await user.click(eurCard)
    expect(await screen.findByText('Evolución histórica — EUR')).toBeInTheDocument()
  })

  it('filtra las monedas con el selector de todas las monedas', async () => {
    const user = userEvent.setup()
    render(<Rates />)
    await screen.findByText('Dólar Americano')
    await user.selectOptions(screen.getByRole('combobox'), 'BRL')
    expect(screen.getAllByText('BRL').length).toBeGreaterThan(0)
    expect(screen.queryByText('Dólar Americano')).not.toBeInTheDocument()
  })

  it('alterna entre período personalizado y gráfico de barras', async () => {
    const user = userEvent.setup()
    render(<Rates />)
    await screen.findByText('Evolución histórica — USD')
    await user.click(screen.getByRole('button', { name: 'Personalizado' }))
    await user.click(screen.getByRole('button', { name: 'Barras' }))
    expect(screen.getByText('Evolución histórica — USD')).toBeInTheDocument()
    expect(screen.getByText('Mín. del período')).toBeInTheDocument()
    expect(screen.getAllByText(/₲/).length).toBeGreaterThan(0)
  })
})
