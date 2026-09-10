/**
 * Pruebas de la vista Banks (CRUD de medios de pago del cliente, RF16/RF26).
 *
 * Cubre: listado inicial, validación del formulario, alta, edición y
 * eliminación con confirmación de cuentas bancarias.
 *
 * @module Banks.test
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Banks from '@/pages/Banks'

function renderBanks() {
  render(<Banks />)
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>, overrides: Partial<Record<string, string>> = {}) {
  const data = {
    Nombre: 'Ana',
    Apellido: 'López',
    'Nº de cédula': '4.567.890',
    'Número de cuenta': '12345678',
    'Código bancario': 'SUDA-PY',
    ...overrides,
  }
  for (const [label, value] of Object.entries(data)) {
    await user.clear(screen.getByLabelText(label))
    await user.type(screen.getByLabelText(label), value)
  }
  await user.selectOptions(screen.getByLabelText('Entidad bancaria'), 'Sudameris Bank')
}

describe('Banks (CRUD de medios de pago del cliente)', () => {
  it('lista las cuentas bancarias vinculadas del cliente', () => {
    renderBanks()
    expect(screen.getByText('Banco Continental')).toBeInTheDocument()
    expect(screen.getByText('Itaú Paraguay')).toBeInTheDocument()
    expect(screen.getByText('2 cuentas vinculadas')).toBeInTheDocument()
  })

  it('muestra errores de validación al vincular con campos vacíos', async () => {
    const user = userEvent.setup()
    renderBanks()
    await user.click(screen.getByRole('button', { name: '+ Agregar cuenta' }))
    expect(screen.getByText('Agregar cuenta bancaria')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Vincular cuenta' }))
    expect(screen.getByText('El nombre es obligatorio (mínimo 2 caracteres)')).toBeInTheDocument()
    expect(screen.getByText('El apellido es obligatorio (mínimo 2 caracteres)')).toBeInTheDocument()
    expect(screen.getByText('El Nº de cédula es obligatorio')).toBeInTheDocument()
    expect(screen.getByText('Seleccioná la entidad bancaria')).toBeInTheDocument()
    expect(screen.getByText('El Nº de cuenta debe tener al menos 6 dígitos')).toBeInTheDocument()
    expect(screen.getByText('El código bancario es obligatorio')).toBeInTheDocument()
  })

  it('vincula una cuenta nueva con datos válidos', async () => {
    const user = userEvent.setup()
    renderBanks()
    await user.click(screen.getByRole('button', { name: '+ Agregar cuenta' }))
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Vincular cuenta' }))
    expect(screen.getByText('Sudameris Bank')).toBeInTheDocument()
    expect(screen.getByText(/Ana López/)).toBeInTheDocument()
    expect(screen.getByText('3 cuentas vinculadas')).toBeInTheDocument()
  })

  it('edita los datos de una cuenta existente', async () => {
    const user = userEvent.setup()
    renderBanks()
    await user.click(screen.getByRole('button', { name: 'Editar cuenta Banco Continental' }))
    expect(screen.getByText('Editar cuenta bancaria')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Apellido'))
    await user.type(screen.getByLabelText('Apellido'), 'González')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(screen.getByText(/Carlos González/)).toBeInTheDocument()
    expect(screen.getByText('2 cuentas vinculadas')).toBeInTheDocument()
  })

  it('pide confirmación y elimina la cuenta al confirmar', async () => {
    const user = userEvent.setup()
    renderBanks()
    await user.click(screen.getByRole('button', { name: 'Eliminar cuenta Itaú Paraguay' }))
    expect(screen.getByText('Eliminar cuenta')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('Itaú Paraguay')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Eliminar cuenta Itaú Paraguay' }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.queryByText('Itaú Paraguay')).not.toBeInTheDocument()
    expect(screen.getByText('1 cuenta vinculada')).toBeInTheDocument()
  })

  it('muestra estado vacío al eliminar todas las cuentas', async () => {
    const user = userEvent.setup()
    renderBanks()
    for (const bank of ['Banco Continental', 'Itaú Paraguay']) {
      await user.click(screen.getByRole('button', { name: `Eliminar cuenta ${bank}` }))
      await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    }
    expect(screen.getByText('Sin cuentas vinculadas')).toBeInTheDocument()
  })
})
