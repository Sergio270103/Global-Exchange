import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Rates from '@/pages/Rates'
import type { ReactNode } from 'react'

// Inspect the actual datasets passed to either renderer without jsdom layout limits.
vi.mock('recharts', async importOriginal => {
  const real = await importOriginal<typeof import('recharts')>()
  const chart = ({ data, children }: { data: unknown[]; children: ReactNode }) => (
    <div data-testid="chart" data-points={JSON.stringify(data)}>{children}</div>
  )
  return { ...real, ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    LineChart: chart, BarChart: chart, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null, Line: () => null, Bar: () => null }
})

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
      data = { inicio: new Date(Date.now() - 30 * 86400000).toISOString(), fin: new Date().toISOString(), anterior: null, cambios: puntos(moneda) }
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
    vi.useRealTimers()
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar tarjetas por moneda' }), 'BRL')
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


describe('Evolución conectada', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('selecciona la moneda desde el desplegable y consulta cada período', async () => {
    const fetch = mockFetch()
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<Rates />)
    await screen.findByRole('combobox', { name: 'Moneda del gráfico' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Moneda del gráfico' }), 'EUR')
    expect(await screen.findByText('Evolución histórica — EUR')).toBeInTheDocument()
    for (const periodo of ['Hoy', 'Semana', 'Mes', 'Año']) {
      await user.click(screen.getByRole('button', { name: periodo }))
      await waitFor(() => expect(fetch.mock.calls.some(([url]) => {
        const params = new URL(url, 'http://x').searchParams
        return url.includes('/evolucion/') && params.get('moneda') === 'EUR' && params.get('periodo') === periodo
      })).toBe(true))
    }
  })

  it('actualiza cada 60 segundos y detiene las consultas al salir', async () => {
    vi.useFakeTimers()
    const fetch = mockFetch()
    vi.stubGlobal('fetch', fetch)
    const vista = render(<Rates />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const inicial = fetch.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(fetch.mock.calls.length).toBe(inicial + 2)
    vista.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(fetch.mock.calls.length).toBe(inicial + 2)
  })

  it('distingue errores del backend de un historial vacío', async () => {
    const normal = mockFetch()
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('/evolucion/')
      ? Promise.resolve(new Response('{}', { status: 500 })) : normal(url)))
    render(<Rates />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el historial')
    expect(screen.queryByText('Sin datos en este período.')).not.toBeInTheDocument()
  })

  it('informa que conserva la cotización anterior cuando no hay cambios', async () => {
    const normal = mockFetch()
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('/evolucion/')
      ? Promise.resolve(new Response(JSON.stringify({ inicio: '2026-11-19T03:00:00Z', fin: '2026-11-19T18:00:00Z', anterior: vigentes[0], cambios: [] }))) : normal(url)))
    render(<Rates />)
    expect(await screen.findByText(/Sin cambios en este período/)).toBeInTheDocument()
  })
})


it('mantiene todos los cambios intradía en líneas y barras con continuidad', async () => {
  const cambios = Array.from({ length: 20 }, (_, i) => ({ ...vigentes[0], id: i + 20,
    vigente_desde: new Date(Date.UTC(2026, 10, 19, 4, i)).toISOString(), compra: String(7400 + i) }))
  const anterior = { ...vigentes[0], vigente_desde: '2026-11-18T12:00:00Z' }
  const normal = mockFetch()
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('/evolucion/')
    ? Promise.resolve(new Response(JSON.stringify({ inicio: '2026-11-19T03:00:00Z', fin: '2026-11-19T18:00:00Z', anterior, cambios }))) : normal(url)))
  try {
    const user = userEvent.setup()
    render(<Rates />)
    const chart = await screen.findByTestId('chart')
    const datos = JSON.parse(chart.getAttribute('data-points')!)
    expect(datos).toHaveLength(22)
    expect(datos.filter((p: { continuidad: boolean }) => !p.continuidad)).toHaveLength(20)
    expect(new Set(datos.map((p: { timestamp: number }) => p.timestamp)).size).toBe(22)
    expect(datos[0].continuidad).toBe(true)
    expect(datos[21].buy).toBe(7419)
    await user.click(screen.getByRole('button', { name: 'Barras' }))
    expect(screen.getByRole('button', { name: 'Barras' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(screen.getByTestId('chart').getAttribute('data-points')!)).toEqual(datos)
  } finally { vi.unstubAllGlobals() }
})
