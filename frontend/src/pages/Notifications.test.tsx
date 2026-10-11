/**
 * Pruebas PI-38 de notificaciones reales (disparos de alertas).
 *
 * @module Notifications.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Notifications from '@/pages/Notifications'
import { historialDisparos } from '@/services/alertas'

vi.mock('@/services/alertas', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/alertas')>()
  return {
    ...real,
    listarAlertas: vi.fn().mockResolvedValue([]),
    crearAlerta: vi.fn(),
    actualizarAlerta: vi.fn(),
    eliminarAlerta: vi.fn(),
    historialDisparos: vi.fn(),
  }
})
vi.mock('@/services/monedas', () => ({
  listarMonedas: vi.fn().mockResolvedValue([]),
}))

const disparos = [
  { id: 4, alerta: 1, moneda_codigo: 'USD', tasa_alcanzada: 7550, umbral: 7500, direccion: 'supera', creado: '2026-10-10T11:00:00Z' },
  { id: 5, alerta: 2, moneda_codigo: 'EUR', tasa_alcanzada: 7950, umbral: 8000, direccion: 'baja', creado: '2026-10-10T12:00:00Z' },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(historialDisparos).mockResolvedValue(disparos as never)
})

describe('Notifications (disparos reales)', () => {
  it('muestra resumen y disparos del historial', async () => {
    render(<Notifications />)
    expect(await screen.findByText('Alerta ejecutada: USD/PYG')).toBeInTheDocument()
    expect(screen.getByText('Alerta ejecutada: EUR/PYG')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('filtra por categoría de tasas', async () => {
    const user = userEvent.setup()
    render(<Notifications />)
    await screen.findByText('Alerta ejecutada: USD/PYG')
    await user.click(screen.getByRole('button', { name: '📈 Tasas' }))
    expect(screen.getByText('Alerta ejecutada: USD/PYG')).toBeInTheDocument()
  })

  it('marca todas como leídas y vacía el contador', async () => {
    const user = userEvent.setup()
    render(<Notifications />)
    await screen.findByText('Alerta ejecutada: USD/PYG')
    await user.click(screen.getByRole('button', { name: '✓ Marcar todas como leídas' }))
    expect(screen.queryAllByText('Marcar como leída')).toHaveLength(0)
  })

  it('las leídas persisten al recargar', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Notifications />)
    await screen.findByText('Alerta ejecutada: USD/PYG')
    await user.click(screen.getByRole('button', { name: '✓ Marcar todas como leídas' }))
    expect(screen.queryAllByText('Marcar como leída')).toHaveLength(0)
    unmount()
    render(<Notifications />)
    await screen.findByText('Alerta ejecutada: USD/PYG')
    expect(screen.queryAllByText('Marcar como leída')).toHaveLength(0)
  })

  it('abre la pestaña de configuración de alertas', async () => {
    const user = userEvent.setup()
    render(<Notifications />)
    await screen.findByText('Alerta ejecutada: USD/PYG')
    await user.click(screen.getByRole('button', { name: '🔔 Alertas de tasas' }))
    expect(await screen.findByText('Configurar alerta de tasa')).toBeInTheDocument()
  })
})
