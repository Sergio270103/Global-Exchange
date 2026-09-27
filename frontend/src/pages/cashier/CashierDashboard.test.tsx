/**
 * Pruebas PI-72 del panel de cajero (mock local).
 *
 * @module CashierDashboard.test
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CashierDashboard from '@/pages/cashier/CashierDashboard'

const auth = { name: 'Laura', email: 'laura@x.com', role: 'cashier' as const, avatar: '' }

describe('CashierDashboard (mock local)', () => {
  function renderCajero() {
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
  }

  it('muestra cliente por defecto, operación y comprobantes', () => {
    renderCajero()
    expect(screen.getByText('✓ Cliente Seleccionado')).toBeInTheDocument()
    expect(screen.getByText('Carlos Martínez')).toBeInTheDocument()
    expect(screen.getByText('💱 Operación Cambiaria & Emisión')).toBeInTheDocument()
    expect(screen.getByText('📋 Historial de Comprobantes & API DNIT')).toBeInTheDocument()
  })

  it('avisa cuando el documento no existe', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.clear(screen.getByPlaceholderText('Ej. 4589201'))
    await user.type(screen.getByPlaceholderText('Ej. 4589201'), '0000000')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(screen.getByText('Sin cliente seleccionado.')).toBeInTheDocument()
  })

  it('registra un cliente presencial desde el modal', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.click(screen.getByRole('button', { name: '+ Nuevo Cliente' }))
    expect(screen.getByText('Registro de Cliente Presencial')).toBeInTheDocument()
    const modal = screen.getByText('Registro de Cliente Presencial').closest('div.bg-white')!
    const inputs = within(modal).getAllByRole('textbox')
    await user.type(inputs[0], 'Pedro Test')
    await user.type(inputs[1], '9999999')
    await user.type(inputs[2], 'pedro@test.com')
    await user.type(inputs[3], '0981000000')
    await user.click(within(modal).getByRole('button', { name: 'Guardar y Seleccionar' }))
    expect(await screen.findByText('Pedro Test')).toBeInTheDocument()
  })
})
