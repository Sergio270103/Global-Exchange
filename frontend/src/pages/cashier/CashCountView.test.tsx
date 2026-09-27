/**
 * Pruebas PI-72 de arqueo de caja (mock local).
 *
 * @module CashCountView.test
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CashCountView from '@/pages/cashier/CashCountView'

describe('CashCountView (mock local)', () => {
  it('muestra arqueo, tabs de moneda e historial', async () => {
    const user = userEvent.setup()
    render(<CashCountView />)
    expect(screen.getByText('Arqueo & Control de Caja')).toBeInTheDocument()
    expect(screen.getByText('Conteo por Denominación')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '🇵🇾 PYG' }))
    expect(screen.getByText('📋 Dinero Recibido Reciente')).toBeInTheDocument()
    expect(screen.getByText('Evolución del Efectivo en Caja')).toBeInTheDocument()
  })

  it('abre y cierra el modal de dinero recibido', async () => {
    const user = userEvent.setup()
    render(<CashCountView />)
    await user.click(screen.getByRole('button', { name: /Registrar Dinero Recibido/ }))
    expect(screen.getByText('Monto Ingresado')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Ej. 5000'), '5000')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('Monto Ingresado')).not.toBeInTheDocument()
  })
})
