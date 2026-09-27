/**
 * Pruebas PI-72 de gestión de tasas del analista (mock local).
 *
 * @module RatesManagement.test
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RatesManagement from '@/pages/analyst/RatesManagement'

describe('RatesManagement (mock local)', () => {
  it('muestra tabla, edita y guarda con auditoría', async () => {
    const user = userEvent.setup()
    render(<RatesManagement />)
    expect(screen.getByText('Edición de tasas de cambio')).toBeInTheDocument()
    expect(screen.getByText('Todas las tasas están actualizadas')).toBeInTheDocument()
    const inputs = screen.getAllByRole('spinbutton')
    await user.clear(inputs[0])
    await user.type(inputs[0], '7400')
    expect(screen.getByText('1 tasa(s) con cambios sin guardar')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    expect(await screen.findByText('✓ Guardado correctamente')).toBeInTheDocument()
    expect(screen.getByText('Registro de cambios recientes')).toBeInTheDocument()
  })
})
