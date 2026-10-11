/**
 * Pruebas PI-38 de gestión de tasas del analista (servicios mockeados,
 * componente conectado al backend real).
 *
 * @module RatesManagement.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RatesManagement from '@/pages/analyst/RatesManagement'
import { vigentes, crearCotizacion, historial } from '@/services/cotizaciones'
import { listarMonedas } from '@/services/monedas'

vi.mock('@/services/cotizaciones', () => ({
  vigentes: vi.fn(),
  crearCotizacion: vi.fn(),
  historial: vi.fn(),
}))
vi.mock('@/services/monedas', () => ({
  listarMonedas: vi.fn(),
}))

const tasas = [
  { id: 10, moneda: 'USD', nombre: 'Dólar', flag: '🇺🇸', compra: 7400, venta: 7500, vigente_desde: '2026-10-10T10:00:00Z', creado_por: 'analista1' },
]
const monedas = [
  { id: 2, code: 'USD', name: 'Dólar', symbol: '$', flag: '🇺🇸', decimals: 2, active: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(vigentes).mockResolvedValue(tasas as never)
  vi.mocked(listarMonedas).mockResolvedValue(monedas as never)
  vi.mocked(crearCotizacion).mockImplementation(async (monedaId, compra, venta) => ({
    id: 11, moneda: 'USD', nombre: 'Dólar', flag: '🇺🇸', compra, venta,
    vigente_desde: '2026-10-10T12:00:00Z', creado_por: 'analista1',
  }) as never)
  vi.mocked(historial).mockResolvedValue(tasas as never)
})

describe('RatesManagement (backend real)', () => {
  it('muestra tabla, edita y guarda con auditoría', async () => {
    const user = userEvent.setup()
    render(<RatesManagement />)
    expect(await screen.findByText('Edición de tasas de cambio')).toBeInTheDocument()
    expect(screen.getByText('Todas las tasas están actualizadas')).toBeInTheDocument()
    const inputs = screen.getAllByRole('spinbutton')
    await user.clear(inputs[0])
    await user.type(inputs[0], '7400')
    expect(screen.getByText('1 tasa(s) con cambios sin guardar')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    expect(crearCotizacion).toHaveBeenCalledWith(2, 7400, 7500)
    expect(await screen.findByText('✓ Guardado correctamente')).toBeInTheDocument()
    expect(screen.getByText('Registro de cambios recientes')).toBeInTheDocument()
  })

  it('rechaza venta menor que compra antes de llamar a la API', async () => {
    const user = userEvent.setup()
    render(<RatesManagement />)
    await screen.findByText('Todas las tasas están actualizadas')
    const inputs = screen.getAllByRole('spinbutton')
    await user.clear(inputs[1])
    await user.type(inputs[1], '1000')
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    expect(screen.getByText('Venta menor que compra en USD.')).toBeInTheDocument()
    expect(crearCotizacion).not.toHaveBeenCalled()
  })

  it('muestra error si no cargan las tasas', async () => {
    vi.mocked(vigentes).mockRejectedValueOnce(new Error('caído'))
    render(<RatesManagement />)
    expect(await screen.findByText('No se pudieron cargar las tasas vigentes.')).toBeInTheDocument()
  })
})
