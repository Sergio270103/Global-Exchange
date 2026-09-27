/**
 * Pruebas PI-72 de pagos digitales (datos locales, filtro por estado).
 *
 * @module Payments.test
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Payments from '@/pages/Payments'

describe('Payments (datos locales)', () => {
  it('muestra tarjetas de métodos y tabla', () => {
    render(<Payments />)
    expect(screen.getByText('Transferencia')).toBeInTheDocument()
    expect(screen.getByText('Billetera')).toBeInTheDocument()
    expect(screen.getByText('PAG-001')).toBeInTheDocument()
    expect(screen.getByText('Carlos Martínez')).toBeInTheDocument()
  })

  it('filtra por estado Cancelada', async () => {
    const user = userEvent.setup()
    render(<Payments />)
    await user.click(screen.getByRole('button', { name: 'Cancelada' }))
    expect(screen.getByText('Roberto Torres')).toBeInTheDocument()
    expect(screen.queryByText('Carlos Martínez')).not.toBeInTheDocument()
  })
})
