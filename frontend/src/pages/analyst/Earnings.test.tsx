import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Earnings from '@/pages/analyst/Earnings'
import { obtenerGanancias } from '@/services/ganancias'

vi.mock('@/services/monedas', () => ({ listarMonedas: vi.fn().mockResolvedValue([{ code: 'USD' }]) }))
vi.mock('@/services/ganancias', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/ganancias')>(),
  obtenerGanancias: vi.fn(),
}))

const fila = { periodo: '2026-11', moneda: 'USD', operaciones: 1, volumen: 100, comision: 2, equivalente_pyg: 15200, volumen_pyg: 760000 }
const datos = {
  total_pyg: 15200, operaciones: 1, operaciones_sin_tasa: 0,
  por_moneda: [fila], por_mes: [{ mes: '2026-11', total_pyg: 15200 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerGanancias).mockResolvedValue(datos)
})

describe('Ganancias', () => {
  it('muestra los importes y la evolución de la API', async () => {
    render(<Earnings />)
    expect(await screen.findByText('Ganancia total')).toBeInTheDocument()
    expect(screen.getByText('2 USD')).toBeInTheDocument()
    expect(screen.getByText('Evolución mensual')).toBeInTheDocument()
  })

  it('muestra un mensaje sin gráficos cuando no hay operaciones', async () => {
    vi.mocked(obtenerGanancias).mockResolvedValue({ ...datos, operaciones: 0 })
    render(<Earnings />)
    expect(await screen.findByText('No hay operaciones pagadas para estos filtros.')).toBeInTheDocument()
    expect(screen.queryByText('Evolución mensual')).toBeNull()
  })
})
