/**
 * Pruebas PI-72 del historial con respaldo local ante fallo de API.
 *
 * @module Transactions.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Transactions from '@/pages/Transactions'

const auth = { name: 'Ana', email: 'ana@email.com', role: 'user' as const, avatar: '' }

describe('Transactions (fallback local)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API apagada')))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra el respaldo local con aviso de backend', async () => {
    render(<Transactions auth={auth} currentClient={{ id: 1, nombre: 'Carlos' }} />)
    expect(await screen.findByText('Total operaciones')).toBeInTheDocument()
    expect(screen.getByText('TRX-2024-0891')).toBeInTheDocument()
    expect(screen.getByText('Backend no disponible: mostrando datos locales.')).toBeInTheDocument()
  })

  it('filtra por estado', async () => {
    const user = userEvent.setup()
    render(<Transactions auth={auth} currentClient={{ id: 1, nombre: 'Carlos' }} />)
    await screen.findByText('TRX-2024-0891')
    const selects = screen.getAllByRole('combobox')
    const estado = selects[selects.length - 1]
    await user.selectOptions(estado, 'Pendiente')
    expect(screen.queryByText('TRX-2024-0891')).not.toBeInTheDocument()
  })
})
