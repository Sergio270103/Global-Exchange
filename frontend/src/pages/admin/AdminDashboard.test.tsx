/**
 * Pruebas del dashboard del administrador.
 *
 * Se simulan los servicios de resumen, cotizaciones, monedas e
 * historial; se verifica que las 3 tarjetas, los accesos de gestión,
 * las comisiones por moneda y las tasas con % vs anterior se
 * rendericen y naveguen a las vistas acordadas.
 *
 * @module admin/AdminDashboard.test
 */
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/services/historial', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/historial')>()
  return { ...real, listarHistorial: vi.fn().mockResolvedValue([]) }
})

vi.mock('@/services/resumen', () => ({
  obtenerResumen: vi.fn().mockResolvedValue({
    volumen_total_pyg: 1497500,
    total_operaciones: 2,
    compras: 1,
    ventas: 1,
    ganancias_pyg: 14900,
    comisiones_por_moneda: [
      { moneda: 'USD', total: 1, equivalente_pyg: 7500 },
      { moneda: 'PYG', total: 7400, equivalente_pyg: 7400 },
    ],
    operaciones_sin_tasa: 0,
  }),
}))

vi.mock('@/services/cotizaciones', () => ({
  vigentes: vi.fn().mockResolvedValue([
    { id: 1, moneda: 'USD', nombre: 'Dólar', flag: '🇺🇸', compra: 7400, venta: 7650, vigente_desde: '2026-01-02', creado_por: 'admin' },
  ]),
  historial: vi.fn().mockResolvedValue([
    { id: 1, moneda: 'USD', nombre: 'Dólar', flag: '🇺🇸', compra: 7400, venta: 7500, vigente_desde: '2026-01-01', creado_por: 'admin' },
    { id: 2, moneda: 'USD', nombre: 'Dólar', flag: '🇺🇸', compra: 7550, venta: 7650, vigente_desde: '2026-01-02', creado_por: 'admin' },
  ]),
}))

vi.mock('@/services/monedas', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/monedas')>()
  return {
    ...real,
    listarMonedas: vi.fn().mockResolvedValue([
      { id: 1, code: 'PYG', name: 'Guaraní', symbol: '₲', flag: '🇵🇾', decimals: 0, active: true },
      { id: 2, code: 'USD', name: 'Dólar', symbol: '$', flag: '🇺🇸', decimals: 2, active: true },
    ]),
  }
})

import AdminDashboard from '@/pages/admin/AdminDashboard'

const auth = { name: 'María García', email: 'maria@globalexchange.com', role: 'admin' as const, avatar: '' }

describe('AdminDashboard', () => {
  afterEach(() => {
    cleanup()
  })

  function renderDash() {
    const navigate = vi.fn()
    render(<AdminDashboard auth={auth} currentClient={null} navigate={navigate} />)
    return navigate
  }

  it('muestra las 3 tarjetas agregadas y las comisiones por moneda', async () => {
    renderDash()
    expect(await screen.findByText('Volumen total operado')).toBeInTheDocument()
    expect(screen.getByText('Ganancias por comisiones')).toBeInTheDocument()
    expect(screen.getByText('1 compras · 1 ventas')).toBeInTheDocument()
    expect(screen.getByText('Comisiones por moneda')).toBeInTheDocument()
    expect((await screen.findAllByText('USD')).length).toBeGreaterThan(0)
  })

  it('muestra tasas reales con variación vs anterior', async () => {
    renderDash()
    expect(await screen.findByText('Tasas destacadas')).toBeInTheDocument()
    // (7650 - 7500) / 7500 = +2.00%.
    expect(await screen.findByText('▲ 2.00%')).toBeInTheDocument()
  })

  it('navega a clientes, monedas, ganancias y reportes', async () => {
    const user = userEvent.setup()
    const navigate = renderDash()
    await user.click(await screen.findByRole('button', { name: /Ver clientes/ }))
    expect(navigate).toHaveBeenCalledWith('admin-clients')
    await user.click(screen.getByRole('button', { name: /Ver monedas/ }))
    expect(navigate).toHaveBeenCalledWith('admin-currencies')
    await user.click(screen.getAllByText('Ver todo →')[0])
    expect(navigate).toHaveBeenCalledWith('admin-earnings')
    await user.click(screen.getByRole('button', { name: 'Ver reportes' }))
    expect(navigate).toHaveBeenCalledWith('admin-reports')
  })
})
