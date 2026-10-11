/**
 * Pruebas PI-38 del modal de alerta al iniciar sesión.
 *
 * @module ModalAlerta.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModalAlerta from '@/components/ModalAlerta'
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

const disparos = [
  { id: 4, alerta: 1, moneda_codigo: 'USD', tasa_alcanzada: 7550, umbral: 7500, direccion: 'supera', creado: '2026-10-10T11:00:00Z' },
]

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  vi.mocked(historialDisparos).mockResolvedValue(disparos as never)
})

describe('ModalAlerta (aviso al entrar)', () => {
  it('muestra el recuadro grande con el disparo no visto', async () => {
    render(<ModalAlerta navigate={() => {}} />)
    expect(await screen.findByText('¡Alerta de tasa disparada!')).toBeInTheDocument()
    expect(screen.getByText(/USD\/PYG/)).toBeInTheDocument()
  })

  it('la X lo cierra y no vuelve en la misma sesión', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ModalAlerta navigate={() => {}} />)
    await screen.findByText('¡Alerta de tasa disparada!')
    await user.click(screen.getByRole('button', { name: 'Cerrar notificación' }))
    expect(screen.queryByText('¡Alerta de tasa disparada!')).not.toBeInTheDocument()
    unmount()
    render(<ModalAlerta navigate={() => {}} />)
    await vi.waitFor(() => {
      expect(historialDisparos).toHaveBeenCalled()
    })
    expect(screen.queryByText('¡Alerta de tasa disparada!')).not.toBeInTheDocument()
  })

  it('navega a notificaciones y cierra', async () => {
    const user = userEvent.setup()
    const navigate = vi.fn()
    render(<ModalAlerta navigate={navigate} />)
    await screen.findByText('¡Alerta de tasa disparada!')
    await user.click(screen.getByRole('button', { name: 'Ver en Notificaciones' }))
    expect(navigate).toHaveBeenCalledWith('notifications')
    expect(screen.queryByText('¡Alerta de tasa disparada!')).not.toBeInTheDocument()
  })

  it('no muestra nada si no hay disparos', async () => {
    vi.mocked(historialDisparos).mockResolvedValue([])
    render(<ModalAlerta navigate={() => {}} />)
    await vi.waitFor(() => {
      expect(historialDisparos).toHaveBeenCalled()
    })
    expect(screen.queryByText('¡Alerta de tasa disparada!')).not.toBeInTheDocument()
  })
})
