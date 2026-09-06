import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Rates from '@/pages/Rates'

describe('Rates (tasas de cambio con histórico)', () => {
  it('muestra las tasas en tiempo real con todas las monedas', () => {
    render(<Rates />)
    expect(screen.getByText('Tasas en tiempo real')).toBeInTheDocument()
    expect(screen.getByText('Dólar Americano')).toBeInTheDocument()
    expect(screen.getByText('Euro')).toBeInTheDocument()
    expect(screen.getByText('Real Brasileño')).toBeInTheDocument()
  })

  it('comienza con USD seleccionado y muestra su evolución histórica', () => {
    render(<Rates />)
    expect(screen.getByText('Evolución histórica — USD')).toBeInTheDocument()
    expect(screen.getByText('Compra actual')).toBeInTheDocument()
    expect(screen.getByText('Venta actual')).toBeInTheDocument()
  })

  it('cambia la moneda seleccionada al hacer clic en una tarjeta', async () => {
    const user = userEvent.setup()
    render(<Rates />)
    const eurCard = screen.getByText('Euro').closest('.rounded-xl')!
    await user.click(eurCard)
    expect(screen.getByText('Evolución histórica — EUR')).toBeInTheDocument()
  })

  it('filtra las monedas con el selector de todas las monedas', async () => {
    const user = userEvent.setup()
    render(<Rates />)
    await user.selectOptions(screen.getByRole('combobox'), 'BRL')
    expect(screen.getAllByText('BRL').length).toBeGreaterThan(0)
    expect(screen.queryByText('Dólar Americano')).not.toBeInTheDocument()
  })

  it('alterna entre período personalizado y gráfico de barras', async () => {
    const user = userEvent.setup()
    render(<Rates />)
    await user.click(screen.getByRole('button', { name: 'Personalizado' }))
    await user.click(screen.getByRole('button', { name: 'Barras' }))
    expect(screen.getByText('Evolución histórica — USD')).toBeInTheDocument()
    expect(screen.getByText('Mín. del período')).toBeInTheDocument()
    expect(screen.getAllByText(/₲/).length).toBeGreaterThan(0)
  })
})