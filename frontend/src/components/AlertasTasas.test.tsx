/**
 * Pruebas PI-38 del panel de alertas de tasas (datos reales mockeados
 * a nivel de servicio).
 *
 * @module AlertasTasas.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlertasTasas from '@/components/AlertasTasas'
import {
  listarAlertas,
  crearAlerta,
  actualizarAlerta,
  eliminarAlerta,
  historialDisparos,
} from '@/services/alertas'
import { listarMonedas } from '@/services/monedas'

vi.mock('@/services/alertas', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/alertas')>()
  return {
    ...real,
    listarAlertas: vi.fn(),
    crearAlerta: vi.fn(),
    actualizarAlerta: vi.fn(),
    eliminarAlerta: vi.fn(),
    historialDisparos: vi.fn(),
  }
})
vi.mock('@/services/monedas', () => ({
  listarMonedas: vi.fn(),
}))

const monedas = [
  { id: 2, code: 'USD', name: 'Dólar', symbol: '$', flag: '🇺🇸', decimals: 2, active: true },
]
const alertas = [
  { id: 1, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', umbral: 7500, direccion: 'supera', estado: 'activa', creado: '', actualizado: '' },
  { id: 2, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', umbral: 8000, direccion: 'baja', estado: 'ejecutada', creado: '', actualizado: '' },
]
const historial = [
  { id: 4, alerta: 2, moneda_codigo: 'USD', tasa_alcanzada: 7950, umbral: 8000, direccion: 'baja', creado: '2026-10-10T11:00:00Z' },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarMonedas).mockResolvedValue(monedas)
  vi.mocked(listarAlertas).mockResolvedValue(alertas as never)
  vi.mocked(historialDisparos).mockResolvedValue(historial as never)
  vi.mocked(crearAlerta).mockImplementation(async (moneda, umbral, direccion) => ({
    id: 3, moneda, moneda_codigo: 'USD', moneda_nombre: 'Dólar',
    umbral, direccion: direccion ?? 'supera', estado: 'activa', creado: '', actualizado: '',
  }) as never)
  vi.mocked(actualizarAlerta).mockImplementation(async (id, datos) => ({
    ...alertas[0], ...datos,
  }) as never)
  vi.mocked(eliminarAlerta).mockResolvedValue(undefined)
})

describe('AlertasTasas (panel real)', () => {
  it('muestra formulario, activas e historial', async () => {
    render(<AlertasTasas />)
    expect(await screen.findByText('Configurar alerta de tasa')).toBeInTheDocument()
    expect(screen.getByText('Alertas configuradas (2)')).toBeInTheDocument()
    expect(screen.getByText('Historial de alertas enviadas (1)')).toBeInTheDocument()
    expect(screen.getByText(/7\.950/)).toBeInTheDocument()
  })

  it('crea una alerta con par, condición y umbral', async () => {
    const user = userEvent.setup()
    render(<AlertasTasas />)
    await screen.findByText('Configurar alerta de tasa')
    await user.selectOptions(screen.getByLabelText('Par de divisas'), '2')
    await user.selectOptions(screen.getByLabelText('Condición'), 'supera')
    await user.type(screen.getByLabelText('Umbral objetivo'), '7500')
    await user.click(screen.getByRole('button', { name: 'Crear alerta' }))
    expect(crearAlerta).toHaveBeenCalledWith(2, 7500, 'supera')
  })

  it('valida el umbral antes de crear', async () => {
    const user = userEvent.setup()
    render(<AlertasTasas />)
    await screen.findByText('Configurar alerta de tasa')
    await user.selectOptions(screen.getByLabelText('Par de divisas'), '2')
    await user.click(screen.getByRole('button', { name: 'Crear alerta' }))
    expect(screen.getByText('Elegí la moneda y un umbral mayor a cero.')).toBeInTheDocument()
    expect(crearAlerta).not.toHaveBeenCalled()
  })

  it('pausa una alerta activa', async () => {
    const user = userEvent.setup()
    render(<AlertasTasas />)
    await screen.findByText('Configurar alerta de tasa')
    const filas = screen.getAllByText('Editar')
    await user.click(within(filas[0].closest('div')!.parentElement as HTMLElement).getByRole('button', { name: 'Pausar' }))
    expect(actualizarAlerta).toHaveBeenCalledWith(1, { estado: 'pausada' })
  })

  it('elimina una alerta', async () => {
    const user = userEvent.setup()
    render(<AlertasTasas />)
    await screen.findByText('Configurar alerta de tasa')
    const botones = screen.getAllByRole('button', { name: 'Eliminar' })
    await user.click(botones[0])
    expect(eliminarAlerta).toHaveBeenCalledWith(1)
  })
})
