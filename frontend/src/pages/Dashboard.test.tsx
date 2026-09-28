/**
 * Pruebas PI-72 del dashboard (mock local + navegación).
 *
 * @module Dashboard.test
 */
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// PI-65: "Operaciones recientes" usa datos reales; en el test se simula la API.
vi.mock('@/services/historial', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/historial')>()
  return { ...real, listarHistorial: vi.fn().mockResolvedValue([]) }
})

import Dashboard from '@/pages/Dashboard'

const auth = { name: 'Ana López', email: 'ana@email.com', role: 'user' as const, avatar: '' }

describe('Dashboard (mock local)', () => {
  afterEach(() => {
    cleanup()
  })

  function renderDash() {
    const navigate = vi.fn()
    render(<Dashboard auth={auth} currentClient={{ id: 1, nombre: 'Carlos' }} navigate={navigate} />)
    return navigate
  }

  it('muestra saludo, tarjetas y accesos', () => {
    renderDash()
    expect(screen.getByText('Ana 👋')).toBeInTheDocument()
    expect(screen.getByText('Saldo total')).toBeInTheDocument()
    expect(screen.getByText('USD en cartera')).toBeInTheDocument()
    expect(screen.getByText('Operaciones recientes')).toBeInTheDocument()
    expect(screen.getByText('Tasas destacadas')).toBeInTheDocument()
  })

  it('navega a comprar, billeteras e historial', async () => {
    const user = userEvent.setup()
    const navigate = renderDash()
    await user.click(screen.getByRole('button', { name: '+ Nueva operación' }))
    expect(navigate).toHaveBeenCalledWith('buy')
    await user.click(screen.getAllByText('Ver todo →')[0])
    expect(navigate).toHaveBeenCalledWith('wallets')
    await user.click(screen.getAllByText('Ver todo →')[1])
    expect(navigate).toHaveBeenCalledWith('transactions')
  })
})