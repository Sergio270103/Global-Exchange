/**
 * Pruebas PI-72 de notificaciones (mock local).
 *
 * @module Notifications.test
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Notifications from '@/pages/Notifications'

describe('Notifications (mock local)', () => {
  it('muestra resumen y lista inicial', () => {
    render(<Notifications />)
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getAllByText('No leídas').length).toBeGreaterThan(0)
    expect(screen.getByText('Variación significativa en USD')).toBeInTheDocument()
  })

  it('filtra por categoría de tasas', async () => {
    const user = userEvent.setup()
    render(<Notifications />)
    await user.click(screen.getByRole('button', { name: '📈 Tasas' }))
    expect(screen.getByText('Variación significativa en USD')).toBeInTheDocument()
    expect(screen.queryByText('Operación completada')).not.toBeInTheDocument()
  })

  it('marca todas como leídas y vacía el contador', async () => {
    const user = userEvent.setup()
    render(<Notifications />)
    await user.click(screen.getByRole('button', { name: '✓ Marcar todas como leídas' }))
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })
})
